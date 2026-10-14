-- Draft Animal Arena: accounts, progression, leaderboard, rooms, authoritative matches.
-- Browsers only ever hold the publishable key. Everything that changes progression, results or room state
-- goes through SECURITY DEFINER functions; sensitive ones are callable by service_role only.

-- ───────────────────────── profiles ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 24),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500),
  account_type text not null default 'guest' check (account_type in ('guest', 'google')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Server-controlled progression. Players can read their own row and never write to it.
create table public.player_progress (
  player_id uuid primary key references public.profiles (id) on delete cascade,
  level integer not null default 1 check (level >= 1),
  experience integer not null default 0 check (experience >= 0),
  coins integer not null default 0 check (coins >= 0),
  ranking_points integer not null default 0 check (ranking_points >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  total_matches integer not null default 0 check (total_matches >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index player_progress_ranking_idx on public.player_progress (ranking_points desc, wins desc);

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger player_progress_touch before update on public.player_progress for each row execute function public.touch_updated_at();

-- A profile + progress row for every auth user (guest or Google), created once.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta_name text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), '');
  anon boolean := coalesce(new.is_anonymous, false);
begin
  insert into public.profiles (id, display_name, avatar_url, account_type)
  values (new.id,
          left(coalesce(case when anon then null else meta_name end, 'Guest ' || lpad((floor(random() * 10000))::int::text, 4, '0')), 24),
          nullif(left(new.raw_user_meta_data ->> 'avatar_url', 500), ''),
          case when anon then 'guest' else 'google' end)
  on conflict (id) do nothing;
  insert into public.player_progress (player_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Linking a guest to Google keeps the same user id (and so all progress); only the label changes.
create function public.handle_user_upgraded() returns trigger
language plpgsql security definer set search_path = public as $$
declare meta_name text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), '');
begin
  if coalesce(old.is_anonymous, false) and not coalesce(new.is_anonymous, false) then
    update public.profiles
       set account_type = 'google',
           display_name = case when display_name like 'Guest %' and meta_name is not null then left(meta_name, 24) else display_name end,
           avatar_url = coalesce(avatar_url, nullif(left(new.raw_user_meta_data ->> 'avatar_url', 500), ''))
     where id = new.id;
  end if;
  return new;
end $$;
create trigger on_auth_user_upgraded after update of is_anonymous on auth.users for each row execute function public.handle_user_upgraded();

-- ───────────────────────── leaderboard ─────────────────────────
-- Computed from player_progress, never stored twice. Public columns only: no ids, no coins.
create view public.leaderboard as
select rank() over (order by pp.ranking_points desc, pp.wins desc, pr.created_at asc)::integer as position,
       pp.player_id,
       pr.display_name as player,
       pp.ranking_points,
       pp.wins,
       pp.losses,
       pp.total_matches
  from public.player_progress pp
  join public.profiles pr on pr.id = pp.player_id
 where pp.total_matches > 0;

-- ───────────────────────── rooms ─────────────────────────
create table public.multiplayer_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique check (room_code ~ '^[A-HJ-NP-Z2-9]{5}$'),
  host_player_id uuid not null references public.profiles (id) on delete cascade,
  guest_player_id uuid references public.profiles (id) on delete set null,
  status text not null default 'waiting' check (status in ('waiting', 'lobby', 'in_match', 'finished', 'closed')),
  current_match_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (guest_player_id is null or guest_player_id <> host_player_id)
);
create index multiplayer_rooms_host_idx on public.multiplayer_rooms (host_player_id);
create index multiplayer_rooms_guest_idx on public.multiplayer_rooms (guest_player_id);
create trigger rooms_touch before update on public.multiplayer_rooms for each row execute function public.touch_updated_at();

-- Membership truth lives in multiplayer_rooms (host/guest). room_players only holds per-seat state,
-- and the functions below keep it to exactly the host and the guest: at most two rows per room.
create table public.room_players (
  room_id uuid not null references public.multiplayer_rooms (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  team_selection text[] not null default '{}' check (cardinality(team_selection) in (0, 3)),
  ready boolean not null default false,
  last_seen_at timestamptz not null default now(),
  primary key (room_id, player_id)
);
create index room_players_player_idx on public.room_players (player_id);

-- ───────────────────────── matches ─────────────────────────
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  match_type text not null default 'online' check (match_type in ('online')),
  room_id uuid references public.multiplayer_rooms (id) on delete set null,
  player_1_id uuid not null references public.profiles (id),
  player_2_id uuid not null references public.profiles (id),
  winner_id uuid references public.profiles (id),
  team_1 text[] not null check (cardinality(team_1) = 3),
  team_2 text[] not null check (cardinality(team_2) = 3),
  match_seed bigint not null,
  combat_seed bigint not null,
  score_1 integer,
  score_2 integer,
  rounds integer,
  duration_ticks integer,
  match_status text not null default 'in_progress' check (match_status in ('in_progress', 'finished', 'aborted')),
  result_hash text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  check (player_1_id <> player_2_id)
);
create index matches_p1_idx on public.matches (player_1_id, started_at desc);
create index matches_p2_idx on public.matches (player_2_id, started_at desc);
alter table public.multiplayer_rooms
  add constraint multiplayer_rooms_match_fk foreign key (current_match_id) references public.matches (id) on delete set null;

-- Server-simulated events per round. Cleaned up after 30 days; matches rows are kept.
create table public.match_events (
  match_id uuid not null references public.matches (id) on delete cascade,
  round integer not null check (round >= 1),
  events jsonb not null,
  created_at timestamptz not null default now(),
  primary key (match_id, round)
);

-- One row per (match, player): the idempotency guard that makes reward retries harmless.
create table public.reward_ledger (
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  coins integer not null,
  experience integer not null,
  ranking_delta integer not null,
  created_at timestamptz not null default now(),
  primary key (match_id, player_id)
);

-- Cursor for the Google Sheets exporter.
create table public.sheet_sync_state (
  name text primary key,
  cursor_at timestamptz not null default 'epoch',
  last_run_at timestamptz,
  last_status text
);
insert into public.sheet_sync_state (name) values ('matches');

-- ───────────────────────── privileges ─────────────────────────
revoke all on public.profiles, public.player_progress, public.multiplayer_rooms, public.room_players,
              public.matches, public.match_events, public.reward_ledger, public.sheet_sync_state, public.leaderboard
  from anon, authenticated;
grant select on public.profiles, public.player_progress, public.multiplayer_rooms, public.room_players,
                public.matches, public.match_events to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated; -- account_type is server-controlled
grant select on public.leaderboard to anon, authenticated;
grant all on all tables in schema public to service_role;

alter table public.profiles enable row level security;
alter table public.player_progress enable row level security;
alter table public.multiplayer_rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.matches enable row level security;
alter table public.match_events enable row level security;
alter table public.reward_ledger enable row level security;
alter table public.sheet_sync_state enable row level security;

-- Names and avatars are public to signed-in players (opponents, leaderboard); nothing private lives here.
create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy progress_read_own on public.player_progress for select to authenticated using (player_id = (select auth.uid()));

create policy rooms_read_members on public.multiplayer_rooms for select to authenticated
  using (host_player_id = (select auth.uid()) or guest_player_id = (select auth.uid()));

create policy room_players_read_members on public.room_players for select to authenticated
  using (exists (select 1 from public.multiplayer_rooms r
                  where r.id = room_players.room_id
                    and (r.host_player_id = (select auth.uid()) or r.guest_player_id = (select auth.uid()))));

create policy matches_read_participants on public.matches for select to authenticated
  using (player_1_id = (select auth.uid()) or player_2_id = (select auth.uid()));

create policy match_events_read_participants on public.match_events for select to authenticated
  using (exists (select 1 from public.matches m
                  where m.id = match_events.match_id
                    and (m.player_1_id = (select auth.uid()) or m.player_2_id = (select auth.uid()))));
-- reward_ledger and sheet_sync_state: RLS on and no policies = service_role only.

-- ───────────────────────── room functions (callable by signed-in players) ─────────────────────────
create function public.valid_fighters() returns text[] language sql immutable as
$$ select array['chicken', 'capybara', 'raccoon', 'frog', 'fox', 'pig'] $$;

create function public.new_room_code() returns text language plpgsql as $$
declare alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; code text; i int;
begin
  loop
    code := '';
    for i in 1..5 loop code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from public.multiplayer_rooms where room_code = code);
  end loop;
  return code;
end $$;

-- Closes or vacates every unfinished room the caller is in, so a player is in at most one room.
create function public.leave_open_rooms(p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.multiplayer_rooms;
begin
  for r in select * from public.multiplayer_rooms
            where (host_player_id = p_player or guest_player_id = p_player) and status in ('waiting', 'lobby', 'finished') for update loop
    if r.host_player_id = p_player then
      update public.multiplayer_rooms set status = 'closed' where id = r.id;
    else
      update public.multiplayer_rooms set guest_player_id = null, status = 'waiting' where id = r.id;
      delete from public.room_players where room_id = r.id and player_id = p_player;
      update public.room_players set ready = false where room_id = r.id;
    end if;
  end loop;
end $$;

create function public.create_room() returns public.multiplayer_rooms
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); room public.multiplayer_rooms;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.multiplayer_rooms
              where status = 'in_match' and (host_player_id = uid or guest_player_id = uid)) then
    raise exception 'finish your current match first' using errcode = 'P0001';
  end if;
  perform public.leave_open_rooms(uid);
  insert into public.multiplayer_rooms (room_code, host_player_id) values (public.new_room_code(), uid) returning * into room;
  insert into public.room_players (room_id, player_id) values (room.id, uid);
  return room;
end $$;

create function public.join_room(p_code text) returns public.multiplayer_rooms
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); room public.multiplayer_rooms;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into room from public.multiplayer_rooms where room_code = upper(trim(p_code)) for update;
  if not found or room.status in ('closed', 'finished') then raise exception 'room not found' using errcode = 'P0002'; end if;
  if room.host_player_id = uid then raise exception 'you are the host of this room' using errcode = 'P0001'; end if;
  if room.guest_player_id = uid then return room; end if; -- idempotent re-join
  if room.guest_player_id is not null or room.status <> 'waiting' then raise exception 'room is full' using errcode = 'P0001'; end if;
  perform public.leave_open_rooms(uid);
  update public.multiplayer_rooms set guest_player_id = uid, status = 'lobby' where id = room.id returning * into room;
  insert into public.room_players (room_id, player_id) values (room.id, uid)
    on conflict (room_id, player_id) do update set team_selection = '{}', ready = false, last_seen_at = now();
  update public.room_players set ready = false where room_id = room.id; -- a new face resets both ready flags
  return room;
end $$;

create function public.leave_room(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); room public.multiplayer_rooms;
begin
  select * into room from public.multiplayer_rooms where id = p_room for update;
  if not found or uid is null or (room.host_player_id <> uid and room.guest_player_id is distinct from uid) then return; end if;
  if room.status = 'in_match' then raise exception 'match in progress' using errcode = 'P0001'; end if;
  if room.host_player_id = uid then
    update public.multiplayer_rooms set status = 'closed' where id = p_room;
  else
    update public.multiplayer_rooms set guest_player_id = null, status = 'waiting' where id = p_room;
    delete from public.room_players where room_id = p_room and player_id = uid;
    update public.room_players set ready = false where room_id = p_room;
  end if;
end $$;

create function public.set_team(p_room uuid, p_team text[]) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); room public.multiplayer_rooms;
begin
  select * into room from public.multiplayer_rooms where id = p_room for update;
  if not found or uid is null or (room.host_player_id <> uid and room.guest_player_id is distinct from uid) then
    raise exception 'not in this room' using errcode = '42501'; end if;
  if room.status not in ('waiting', 'lobby') then raise exception 'room is locked' using errcode = 'P0001'; end if;
  if p_team is null or cardinality(p_team) <> 3 or (select count(distinct f) from unnest(p_team) f) <> 3
     or not (p_team <@ public.valid_fighters()) then
    raise exception 'pick three different fighters' using errcode = '22023'; end if;
  update public.room_players set team_selection = p_team, ready = false, last_seen_at = now()
   where room_id = p_room and player_id = uid;
end $$;

create function public.set_ready(p_room uuid, p_ready boolean) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); room public.multiplayer_rooms; seat public.room_players;
begin
  select * into room from public.multiplayer_rooms where id = p_room for update;
  if not found or uid is null or (room.host_player_id <> uid and room.guest_player_id is distinct from uid) then
    raise exception 'not in this room' using errcode = '42501'; end if;
  if room.status <> 'lobby' then raise exception 'waiting for an opponent' using errcode = 'P0001'; end if;
  select * into seat from public.room_players where room_id = p_room and player_id = uid;
  if p_ready and cardinality(seat.team_selection) <> 3 then raise exception 'pick your team first' using errcode = 'P0001'; end if;
  update public.room_players set ready = p_ready, last_seen_at = now() where room_id = p_room and player_id = uid;
end $$;

create function public.touch_room(p_room uuid) returns void
language sql security definer set search_path = public as
$$ update public.room_players set last_seen_at = now() where room_id = p_room and player_id = auth.uid() $$;

-- After a finished match both players can go back to the lobby for a rematch.
create function public.rematch_room(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); room public.multiplayer_rooms;
begin
  select * into room from public.multiplayer_rooms where id = p_room for update;
  if not found or uid is null or (room.host_player_id <> uid and room.guest_player_id is distinct from uid) then
    raise exception 'not in this room' using errcode = '42501'; end if;
  if room.status = 'finished' and room.guest_player_id is not null then
    update public.multiplayer_rooms set status = 'lobby', current_match_id = null where id = p_room;
    update public.room_players set ready = false where room_id = p_room;
  end if;
end $$;

revoke execute on function public.create_room(), public.join_room(text), public.leave_room(uuid), public.set_team(uuid, text[]),
                           public.set_ready(uuid, boolean), public.touch_room(uuid), public.rematch_room(uuid),
                           public.leave_open_rooms(uuid) from public, anon;
grant execute on function public.create_room(), public.join_room(text), public.leave_room(uuid), public.set_team(uuid, text[]),
                          public.set_ready(uuid, boolean), public.touch_room(uuid), public.rematch_room(uuid) to authenticated;
grant execute on function public.leave_open_rooms(uuid) to service_role;

-- ───────────────────────── trusted match functions (service_role only) ─────────────────────────
-- begin_match: atomically validates the room and creates the match. Calling it again for a room that already
-- started returns the same match with created = false, so a match can never start twice.
create function public.begin_match(p_room uuid, p_requester uuid)
returns table (match_id uuid, created boolean, player_1 uuid, player_2 uuid, team_1 text[], team_2 text[], match_seed bigint, combat_seed bigint, match_status text)
language plpgsql security definer set search_path = public as $$
declare room public.multiplayer_rooms; t1 text[]; t2 text[]; r1 boolean; r2 boolean; m public.matches; seed bigint;
begin
  select * into room from public.multiplayer_rooms where id = p_room for update;
  if not found then raise exception 'room not found' using errcode = 'P0002'; end if;
  if p_requester is distinct from room.host_player_id and p_requester is distinct from room.guest_player_id then
    raise exception 'not in this room' using errcode = '42501'; end if;
  if room.status = 'in_match' and room.current_match_id is not null then
    select * into m from public.matches where id = room.current_match_id;
    return query select m.id, false, m.player_1_id, m.player_2_id, m.team_1, m.team_2, m.match_seed, m.combat_seed, m.match_status;
    return;
  end if;
  if room.status <> 'lobby' or room.guest_player_id is null then raise exception 'room is not ready' using errcode = 'P0001'; end if;
  select team_selection, ready into t1, r1 from public.room_players where room_id = p_room and player_id = room.host_player_id;
  select team_selection, ready into t2, r2 from public.room_players where room_id = p_room and player_id = room.guest_player_id;
  if not (coalesce(r1, false) and coalesce(r2, false)) or cardinality(t1) <> 3 or cardinality(t2) <> 3 then
    raise exception 'both players must be ready' using errcode = 'P0001'; end if;
  seed := floor(random() * 4294967296)::bigint;
  insert into public.matches (room_id, player_1_id, player_2_id, team_1, team_2, match_seed, combat_seed)
  values (p_room, room.host_player_id, room.guest_player_id, t1, t2, seed, floor(random() * 4294967296)::bigint)
  returning * into m;
  update public.multiplayer_rooms set status = 'in_match', current_match_id = m.id where id = p_room;
  return query select m.id, true, m.player_1_id, m.player_2_id, m.team_1, m.team_2, m.match_seed, m.combat_seed, m.match_status;
end $$;

-- finalize_match: records the server-simulated result and pays out, exactly once.
-- Reward values (initial economy, tune freely): win 50 coins / 30 xp / +25 points; loss 15 coins / 10 xp / -10 points (floor 0).
-- Level = 1 + xp / 100.
create function public.finalize_match(p_match uuid, p_winner smallint, p_score_1 integer, p_score_2 integer,
                                      p_rounds integer, p_ticks integer, p_events jsonb, p_hash text)
returns public.matches
language plpgsql security definer set search_path = public as $$
declare m public.matches; winner uuid; loser uuid; round_row jsonb; inserted integer;
begin
  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'match not found' using errcode = 'P0002'; end if;
  if m.match_status = 'finished' then return m; end if; -- retry: already paid out
  if p_winner not in (1, 2) or p_score_1 < 0 or p_score_2 < 0 or greatest(p_score_1, p_score_2) <> 2 or p_score_1 = p_score_2 then
    raise exception 'invalid result' using errcode = '22023'; end if;
  winner := case p_winner when 1 then m.player_1_id else m.player_2_id end;
  loser := case p_winner when 1 then m.player_2_id else m.player_1_id end;

  update public.matches set winner_id = winner, score_1 = p_score_1, score_2 = p_score_2, rounds = p_rounds,
         duration_ticks = p_ticks, result_hash = p_hash, match_status = 'finished', finished_at = now()
   where id = p_match returning * into m;
  for round_row in select * from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) loop
    insert into public.match_events (match_id, round, events) values (p_match, (round_row ->> 'round')::int, round_row -> 'events')
    on conflict do nothing;
  end loop;

  insert into public.reward_ledger (match_id, player_id, coins, experience, ranking_delta) values (p_match, winner, 50, 30, 25)
    on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 1 then
    update public.player_progress set coins = coins + 50, experience = experience + 30, level = 1 + (experience + 30) / 100,
           ranking_points = ranking_points + 25, wins = wins + 1, total_matches = total_matches + 1 where player_id = winner;
  end if;
  insert into public.reward_ledger (match_id, player_id, coins, experience, ranking_delta) values (p_match, loser, 15, 10, -10)
    on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 1 then
    update public.player_progress set coins = coins + 15, experience = experience + 10, level = 1 + (experience + 10) / 100,
           ranking_points = greatest(0, ranking_points - 10), losses = losses + 1, total_matches = total_matches + 1 where player_id = loser;
  end if;
  update public.multiplayer_rooms set status = 'finished' where id = m.room_id and current_match_id = m.id;
  return m;
end $$;

revoke execute on function public.begin_match(uuid, uuid), public.finalize_match(uuid, smallint, integer, integer, integer, integer, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.begin_match(uuid, uuid), public.finalize_match(uuid, smallint, integer, integer, integer, integer, jsonb, text)
  to service_role;

-- ───────────────────────── housekeeping ─────────────────────────
create function public.cleanup_stale_data() returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.multiplayer_rooms set status = 'closed'
   where status in ('waiting', 'lobby', 'finished') and updated_at < now() - interval '2 hours';
  -- A match whose result never arrived (server crash) is aborted rather than left open forever.
  update public.matches set match_status = 'aborted', finished_at = now()
   where match_status = 'in_progress' and started_at < now() - interval '10 minutes';
  update public.multiplayer_rooms r set status = 'closed' from public.matches m
   where r.current_match_id = m.id and m.match_status = 'aborted' and r.status = 'in_match';
  delete from public.multiplayer_rooms where status = 'closed' and updated_at < now() - interval '1 day';
  delete from public.match_events where created_at < now() - interval '30 days';
end $$;
revoke execute on function public.cleanup_stale_data() from public, anon, authenticated;
grant execute on function public.cleanup_stale_data() to service_role;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('animal-arena-cleanup', '*/15 * * * *', 'select public.cleanup_stale_data()');
  end if;
end $$;

-- Realtime: lobby and match changes stream to the room's members (RLS above decides who sees what).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.multiplayer_rooms, public.room_players, public.matches;
  end if;
end $$;
