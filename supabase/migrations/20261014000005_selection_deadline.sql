-- Server-authoritative 30 second fighter selection for online rooms. Additive: no data deleted or rewritten.
update public.economy_config set config = config || '{"selection_seconds": 30}'::jsonb where id;
alter table public.multiplayer_rooms add column selection_deadline timestamptz;

-- The deadline is set by the database clock whenever a room (re)enters the lobby with two players, and cleared otherwise.
-- Clients only read it; they cannot choose or extend it.
create function public.set_selection_deadline() returns trigger language plpgsql as $$
begin
  if new.status = 'lobby' and new.guest_player_id is not null then
    if tg_op = 'INSERT' or old.status is distinct from 'lobby' or old.guest_player_id is distinct from new.guest_player_id then
      new.selection_deadline := now() + make_interval(secs => (public.economy_setting('{selection_seconds}'))::int);
    end if;
  else new.selection_deadline := null;
  end if;
  return new;
end $$;
create trigger rooms_selection_deadline before insert or update of status, guest_player_id on public.multiplayer_rooms
  for each row execute function public.set_selection_deadline();
update public.multiplayer_rooms set selection_deadline = now() + interval '30 seconds' where status = 'lobby' and guest_player_id is not null;

create function public.server_time() returns timestamptz language sql stable as $$ select now() $$; -- lets clients align their countdown to the server clock

-- A confirmed (READY) selection is locked; nothing changes after the deadline either.
create or replace function public.set_team(p_room uuid, p_team text[]) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); room public.multiplayer_rooms; seat public.room_players;
begin
  select * into room from public.multiplayer_rooms where id = p_room for update;
  if not found or uid is null or (room.host_player_id <> uid and room.guest_player_id is distinct from uid) then
    raise exception 'not in this room' using errcode = '42501'; end if;
  if room.status not in ('waiting', 'lobby') then raise exception 'room is locked' using errcode = 'P0001'; end if;
  if room.selection_deadline is not null and now() > room.selection_deadline then raise exception 'selection time is over' using errcode = 'P0001'; end if;
  select * into seat from public.room_players where room_id = p_room and player_id = uid;
  if seat.ready then raise exception 'selection locked' using errcode = 'P0001'; end if;
  if p_team is null or cardinality(p_team) <> 3 or (select count(distinct f) from unnest(p_team) f) <> 3
     or not (p_team <@ public.valid_fighters()) then
    raise exception 'pick three different fighters' using errcode = '22023'; end if;
  if not public.owns_fighters(uid, p_team) then raise exception 'fighter not unlocked' using errcode = '42501'; end if;
  update public.room_players set team_selection = p_team, last_seen_at = now() where room_id = p_room and player_id = uid;
end $$;

-- READY is a one-way confirmation. (The boolean stays for client compatibility; un-readying is refused.)
create or replace function public.set_ready(p_room uuid, p_ready boolean) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); room public.multiplayer_rooms; seat public.room_players;
begin
  select * into room from public.multiplayer_rooms where id = p_room for update;
  if not found or uid is null or (room.host_player_id <> uid and room.guest_player_id is distinct from uid) then
    raise exception 'not in this room' using errcode = '42501'; end if;
  if room.status <> 'lobby' then raise exception 'waiting for an opponent' using errcode = 'P0001'; end if;
  select * into seat from public.room_players where room_id = p_room and player_id = uid;
  if not p_ready then raise exception 'selection locked' using errcode = 'P0001'; end if;
  if cardinality(seat.team_selection) <> 3 then raise exception 'pick your team first' using errcode = 'P0001'; end if;
  if not public.owns_fighters(uid, seat.team_selection) then raise exception 'fighter not unlocked' using errcode = '42501'; end if;
  update public.room_players set ready = true, last_seen_at = now() where room_id = p_room and player_id = uid;
end $$;

-- Partial picks (0-3 fighters) are remembered separately, so a timeout keeps what the player already chose and only fills the rest.
alter table public.room_players add column draft_picks text[] not null default '{}' check (cardinality(draft_picks) <= 3);
create function public.save_draft(p_room uuid, p_picks text[]) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); room public.multiplayer_rooms; seat public.room_players;
begin
  select * into room from public.multiplayer_rooms where id = p_room for update;
  if not found or uid is null or (room.host_player_id <> uid and room.guest_player_id is distinct from uid) then
    raise exception 'not in this room' using errcode = '42501'; end if;
  if room.status <> 'lobby' or (room.selection_deadline is not null and now() > room.selection_deadline) then return; end if;
  select * into seat from public.room_players where room_id = p_room and player_id = uid;
  if seat.ready then return; end if; -- locked
  if p_picks is null or cardinality(p_picks) > 3 or (select count(distinct f) from unnest(p_picks) f) <> cardinality(p_picks)
     or not (p_picks <@ public.valid_fighters()) then raise exception 'pick three different fighters' using errcode = '22023'; end if;
  if not public.owns_fighters(uid, p_picks) then raise exception 'fighter not unlocked' using errcode = '42501'; end if;
  update public.room_players set draft_picks = p_picks, last_seen_at = now() where room_id = p_room and player_id = uid;
end $$;

-- Called by either client when its countdown (aligned to the server clock) reaches zero. The server checks its own clock,
-- so an early call is refused. Incomplete teams are filled from fighters the player OWNS only, then everyone is marked ready;
-- the usual start-match flow takes it from there. Safe to call repeatedly and from both players.
create function public.finalize_selection(p_room uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); room public.multiplayer_rooms; seat public.room_players; extra text[];
begin
  select * into room from public.multiplayer_rooms where id = p_room for update;
  if not found or uid is null or (room.host_player_id <> uid and room.guest_player_id is distinct from uid) then
    raise exception 'not in this room' using errcode = '42501'; end if;
  if room.status <> 'lobby' or room.guest_player_id is null then return false; end if;
  if room.selection_deadline is null or now() < room.selection_deadline then raise exception 'selection time is not over' using errcode = 'P0001'; end if;
  for seat in select * from public.room_players where room_id = p_room for update loop
    if cardinality(seat.team_selection) <> 3 or not public.owns_fighters(seat.player_id, seat.team_selection) then
      -- no confirmed team: keep the saved partial picks (re-checked against ownership), discard anything invalid
      seat.team_selection := case when public.owns_fighters(seat.player_id, seat.draft_picks) then seat.draft_picks else '{}' end;
    end if;
    if cardinality(seat.team_selection) < 3 then
      select coalesce(array_agg(f), '{}') into extra from (
        select pf.fighter_id f from public.player_fighters pf
         where pf.player_id = seat.player_id and not (pf.fighter_id = any (seat.team_selection)) order by random() limit 3 - cardinality(seat.team_selection)) s;
      seat.team_selection := seat.team_selection || extra;
    end if;
    update public.room_players set team_selection = seat.team_selection, draft_picks = '{}', ready = true where room_id = p_room and player_id = seat.player_id;
  end loop;
  return true;
end $$;

revoke execute on function public.server_time(), public.finalize_selection(uuid), public.save_draft(uuid, text[]) from public, anon;
grant execute on function public.server_time(), public.finalize_selection(uuid), public.save_draft(uuid, text[]) to authenticated;
