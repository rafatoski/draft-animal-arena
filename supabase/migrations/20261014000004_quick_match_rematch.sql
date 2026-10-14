-- Quick Match queue, six-character room codes and rematch consent. Additive: no table dropped, no rows deleted.

-- ───────── six-character room codes (existing five-character rooms stay valid) ─────────
alter table public.multiplayer_rooms drop constraint multiplayer_rooms_room_code_check;
alter table public.multiplayer_rooms add constraint multiplayer_rooms_room_code_check check (room_code ~ '^[A-HJ-NP-Z2-9]{5,6}$');
create or replace function public.new_room_code() returns text language plpgsql as $$
declare alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; code text; i int;
begin
  loop
    code := '';
    for i in 1..6 loop code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from public.multiplayer_rooms where room_code = code); -- unique even against closed rooms
  end loop;
  return code;
end $$;
-- Codes are typed by people: ignore case, spaces and dashes.
create or replace function public.join_room(p_code text) returns public.multiplayer_rooms
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); room public.multiplayer_rooms; code text := upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into room from public.multiplayer_rooms where room_code = code for update;
  if not found or room.status in ('closed', 'finished') then raise exception 'room not found' using errcode = 'P0002'; end if;
  if room.host_player_id = uid then raise exception 'you are the host of this room' using errcode = 'P0001'; end if;
  if room.guest_player_id = uid then return room; end if; -- idempotent re-join
  if room.guest_player_id is not null or room.status <> 'waiting' then raise exception 'room is full' using errcode = 'P0001'; end if;
  perform public.leave_open_rooms(uid);
  update public.multiplayer_rooms set guest_player_id = uid, status = 'lobby' where id = room.id returning * into room;
  insert into public.room_players (room_id, player_id) values (room.id, uid)
    on conflict (room_id, player_id) do update set team_selection = '{}', ready = false, last_seen_at = now();
  update public.room_players set ready = false where room_id = room.id;
  return room;
end $$;

-- ───────── rematch needs both players ─────────
alter table public.room_players add column rematch boolean not null default false;
drop function public.rematch_room(uuid); -- return type changes from void to boolean
create function public.rematch_room(p_room uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); room public.multiplayer_rooms;
begin
  select * into room from public.multiplayer_rooms where id = p_room for update;
  if not found or uid is null or (room.host_player_id <> uid and room.guest_player_id is distinct from uid) then
    raise exception 'not in this room' using errcode = '42501'; end if;
  if room.status = 'lobby' then return true; end if;
  if room.status <> 'finished' or room.guest_player_id is null then raise exception 'rematch not available' using errcode = 'P0001'; end if;
  update public.room_players set rematch = true where room_id = p_room and player_id = uid;
  if (select count(*) from public.room_players where room_id = p_room and rematch) = 2 then
    update public.multiplayer_rooms set status = 'lobby', current_match_id = null where id = p_room;
    update public.room_players set ready = false, rematch = false where room_id = p_room;
    return true;
  end if;
  return false;
end $$;
revoke execute on function public.rematch_room(uuid) from public, anon;
grant execute on function public.rematch_room(uuid) to authenticated;

-- ───────── quick match ─────────
alter table public.multiplayer_rooms add column quick boolean not null default false;
create table public.matchmaking_queue (
  player_id uuid primary key references public.profiles (id) on delete cascade, -- one place in line per player
  queued_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);
revoke all on public.matchmaking_queue from anon, authenticated;
grant all on public.matchmaking_queue to service_role;
alter table public.matchmaking_queue enable row level security; -- no policies: only the functions below touch it

-- Polled by the searching client (every couple of seconds). Atomic: the waiting row is claimed with FOR UPDATE SKIP LOCKED,
-- so two callers can never take the same opponent, and nobody can match themselves.
create function public.quick_match() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); room public.multiplayer_rooms; opp uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where id = uid and account_type = 'google') then
    raise exception 'sign in with Google to play online' using errcode = '42501'; end if;
  if exists (select 1 from public.multiplayer_rooms where status = 'in_match' and (host_player_id = uid or guest_player_id = uid)) then
    raise exception 'finish your current match first' using errcode = 'P0001'; end if;
  -- Already paired by the other player's call: hand the room over.
  select * into room from public.multiplayer_rooms
   where quick and status = 'lobby' and guest_player_id is not null and (host_player_id = uid or guest_player_id = uid)
   order by created_at desc limit 1;
  if found then delete from public.matchmaking_queue where player_id = uid; return jsonb_build_object('state', 'matched', 'room', to_jsonb(room)); end if;

  delete from public.matchmaking_queue where seen_at < now() - interval '15 seconds'; -- closed tabs drop out of the line
  select player_id into opp from public.matchmaking_queue where player_id <> uid order by queued_at limit 1 for update skip locked;
  if opp is null then
    insert into public.matchmaking_queue (player_id) values (uid) on conflict (player_id) do update set seen_at = now();
    return jsonb_build_object('state', 'searching');
  end if;
  delete from public.matchmaking_queue where player_id in (uid, opp);
  perform public.leave_open_rooms(uid); perform public.leave_open_rooms(opp);
  insert into public.multiplayer_rooms (room_code, host_player_id, guest_player_id, status, quick)
    values (public.new_room_code(), opp, uid, 'lobby', true) returning * into room;
  insert into public.room_players (room_id, player_id) values (room.id, opp), (room.id, uid);
  return jsonb_build_object('state', 'matched', 'room', to_jsonb(room));
end $$;

create function public.cancel_quick_match() returns void
language sql security definer set search_path = public as $$ delete from public.matchmaking_queue where player_id = auth.uid() $$;

revoke execute on function public.quick_match(), public.cancel_quick_match() from public, anon;
grant execute on function public.quick_match(), public.cancel_quick_match() to authenticated;

-- The caller's unfinished room, so a refreshed or reconnecting client can go back into it.
create function public.my_active_room() returns public.multiplayer_rooms
language sql stable security definer set search_path = public as $$
  select * from public.multiplayer_rooms
   where (host_player_id = auth.uid() or guest_player_id = auth.uid()) and status in ('waiting', 'lobby', 'in_match')
   order by updated_at desc limit 1 $$;
revoke execute on function public.my_active_room() from public, anon;
grant execute on function public.my_active_room() to authenticated;

create or replace function public.cleanup_stale_data() returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.multiplayer_rooms set status = 'closed'
   where status in ('waiting', 'lobby', 'finished') and updated_at < now() - interval '2 hours';
  update public.matches set match_status = 'aborted', finished_at = now()
   where match_status = 'in_progress' and started_at < now() - interval '10 minutes';
  update public.multiplayer_rooms r set status = 'closed' from public.matches m
   where r.current_match_id = m.id and m.match_status = 'aborted' and r.status = 'in_match';
  delete from public.multiplayer_rooms where status = 'closed' and updated_at < now() - interval '1 day';
  delete from public.match_events where created_at < now() - interval '30 days';
  delete from public.matchmaking_queue where seen_at < now() - interval '1 minute';
end $$;
