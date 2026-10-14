-- Economy v1: coins + diamonds, starter fighters, diamond-priced unlocks, ownership enforced in rooms and matches.
-- Replaces the placeholder rewards of the foundation migration (50/15 coins + xp) with the designed ones:
--   win  : 1-3 coins (uniform) and, in online matches only, 1-2 diamonds (uniform)      loss : nothing
-- All amounts live in public.economy_config so they can be tuned without touching code.

alter table public.player_progress drop column level, drop column experience;
alter table public.player_progress add column diamonds integer not null default 0 check (diamonds >= 0);
alter table public.reward_ledger drop column experience;
alter table public.reward_ledger add column diamonds integer not null default 0;

-- ───────── central configuration (one row, readable by everyone, writable by nobody but the dashboard/service role) ─────────
create table public.economy_config (
  id boolean primary key default true check (id),
  config jsonb not null
);
insert into public.economy_config (config) values ('{
  "starter_fighters": ["chicken", "capybara", "frog"],
  "unlock_price_diamonds": 10,
  "coin_reward": {"min": 1, "max": 3},
  "diamond_reward": {"min": 1, "max": 2},
  "ranking": {"win": 25, "loss": -10}
}');
revoke all on public.economy_config from anon, authenticated;
grant select on public.economy_config to anon, authenticated;
grant all on public.economy_config to service_role;
alter table public.economy_config enable row level security;
create policy economy_config_read on public.economy_config for select using (true);

create function public.economy_setting(p_path text[]) returns jsonb
language sql stable security definer set search_path = public as
$$ select config #> p_path from public.economy_config where id $$;

-- ───────── ownership ─────────
create table public.player_fighters (
  player_id uuid not null references public.profiles (id) on delete cascade,
  fighter_id text not null check (fighter_id = any (public.valid_fighters())),
  unlocked_at timestamptz not null default now(),
  primary key (player_id, fighter_id)
);
create index player_fighters_player_idx on public.player_fighters (player_id);

create table public.economy_transactions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  currency text not null check (currency in ('coins', 'diamonds')),
  amount integer not null check (amount <> 0),
  transaction_type text not null check (transaction_type in ('match_reward', 'fighter_unlock')),
  reference_id text not null,
  created_at timestamptz not null default now(),
  unique (player_id, currency, transaction_type, reference_id) -- the idempotency key: a reward or purchase can be recorded once
);
create index economy_transactions_player_idx on public.economy_transactions (player_id, created_at desc);

revoke all on public.player_fighters, public.economy_transactions from anon, authenticated;
grant select on public.player_fighters, public.economy_transactions to authenticated;
grant all on public.player_fighters, public.economy_transactions to service_role;
alter table public.player_fighters enable row level security;
alter table public.economy_transactions enable row level security;
create policy fighters_read_own on public.player_fighters for select to authenticated using (player_id = (select auth.uid()));
create policy transactions_read_own on public.economy_transactions for select to authenticated using (player_id = (select auth.uid()));
create policy ledger_read_own on public.reward_ledger for select to authenticated using (player_id = (select auth.uid()));
grant select on public.reward_ledger to authenticated;

-- Every new user starts with the starter fighters; existing users are backfilled below.
create or replace function public.handle_new_user() returns trigger
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
  insert into public.player_fighters (player_id, fighter_id)
    select new.id, jsonb_array_elements_text(public.economy_setting('{starter_fighters}')) on conflict do nothing;
  return new;
end $$;

insert into public.player_fighters (player_id, fighter_id)
  select p.id, f from public.profiles p, jsonb_array_elements_text(public.economy_setting('{starter_fighters}')) f on conflict do nothing;

create function public.owns_fighters(p_player uuid, p_team text[]) returns boolean
language sql stable security definer set search_path = public as
$$ select not exists (select 1 from unnest(p_team) f where not exists (select 1 from public.player_fighters pf where pf.player_id = p_player and pf.fighter_id = f)) $$;
revoke execute on function public.owns_fighters(uuid, text[]) from public, anon, authenticated;
grant execute on function public.owns_fighters(uuid, text[]) to service_role;

-- ───────── buying a fighter with diamonds (atomic; the client only says which fighter) ─────────
create function public.unlock_fighter(p_fighter text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); price integer := (public.economy_setting('{unlock_price_diamonds}'))::int; have integer;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not (p_fighter = any (public.valid_fighters())) then raise exception 'unknown fighter' using errcode = '22023'; end if;
  select diamonds into have from public.player_progress where player_id = uid for update; -- serialises concurrent purchases
  if exists (select 1 from public.player_fighters where player_id = uid and fighter_id = p_fighter) then
    raise exception 'already unlocked' using errcode = 'P0001'; end if;
  if have < price then raise exception 'not enough diamonds: need % more', price - have using errcode = 'P0001'; end if;
  update public.player_progress set diamonds = diamonds - price where player_id = uid;
  insert into public.player_fighters (player_id, fighter_id) values (uid, p_fighter);
  insert into public.economy_transactions (player_id, currency, amount, transaction_type, reference_id) values (uid, 'diamonds', -price, 'fighter_unlock', p_fighter);
  return jsonb_build_object('fighter', p_fighter, 'diamonds', have - price);
end $$;
revoke execute on function public.unlock_fighter(text) from public, anon;
grant execute on function public.unlock_fighter(text) to authenticated;

-- ───────── rooms and matches only accept fighters the player owns ─────────
create or replace function public.set_team(p_room uuid, p_team text[]) returns void
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
  if not public.owns_fighters(uid, p_team) then raise exception 'fighter not unlocked' using errcode = '42501'; end if;
  update public.room_players set team_selection = p_team, ready = false, last_seen_at = now()
   where room_id = p_room and player_id = uid;
end $$;

create or replace function public.begin_match(p_room uuid, p_requester uuid)
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
  -- Ownership is re-checked at the moment the match starts, not only when the team was picked.
  if not (public.owns_fighters(room.host_player_id, t1) and public.owns_fighters(room.guest_player_id, t2)) then
    raise exception 'fighter not unlocked' using errcode = '42501'; end if;
  seed := floor(random() * 4294967296)::bigint;
  insert into public.matches (room_id, player_1_id, player_2_id, team_1, team_2, match_seed, combat_seed)
  values (p_room, room.host_player_id, room.guest_player_id, t1, t2, seed, floor(random() * 4294967296)::bigint)
  returning * into m;
  update public.multiplayer_rooms set status = 'in_match', current_match_id = m.id where id = p_room;
  return query select m.id, true, m.player_1_id, m.player_2_id, m.team_1, m.team_2, m.match_seed, m.combat_seed, m.match_status;
end $$;

-- ───────── rewards, paid once, decided on the server ─────────
create or replace function public.finalize_match(p_match uuid, p_winner smallint, p_score_1 integer, p_score_2 integer,
                                                 p_rounds integer, p_ticks integer, p_events jsonb, p_hash text)
returns public.matches
language plpgsql security definer set search_path = public as $$
declare
  m public.matches; winner uuid; loser uuid; round_row jsonb; inserted integer; v_coins integer; v_gems integer;
  coin_min integer := (public.economy_setting('{coin_reward,min}'))::int; coin_max integer := (public.economy_setting('{coin_reward,max}'))::int;
  gem_min integer := (public.economy_setting('{diamond_reward,min}'))::int; gem_max integer := (public.economy_setting('{diamond_reward,max}'))::int;
  win_points integer := (public.economy_setting('{ranking,win}'))::int; loss_points integer := (public.economy_setting('{ranking,loss}'))::int;
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

  v_coins := coin_min + floor(random() * (coin_max - coin_min + 1))::int; -- uniform, drawn here, never by the client
  v_gems := gem_min + floor(random() * (gem_max - gem_min + 1))::int;
  insert into public.reward_ledger (match_id, player_id, coins, diamonds, ranking_delta) values (p_match, winner, v_coins, v_gems, win_points) on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 1 then
    update public.player_progress set coins = coins + v_coins, diamonds = diamonds + v_gems,
           ranking_points = ranking_points + win_points, wins = wins + 1, total_matches = total_matches + 1 where player_id = winner;
    insert into public.economy_transactions (player_id, currency, amount, transaction_type, reference_id) values
      (winner, 'coins', v_coins, 'match_reward', p_match::text), (winner, 'diamonds', v_gems, 'match_reward', p_match::text) on conflict do nothing;
  end if;
  insert into public.reward_ledger (match_id, player_id, coins, diamonds, ranking_delta) values (p_match, loser, 0, 0, loss_points) on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 1 then
    update public.player_progress set ranking_points = greatest(0, ranking_points + loss_points), losses = losses + 1, total_matches = total_matches + 1 where player_id = loser;
  end if;
  update public.multiplayer_rooms set status = 'finished' where id = m.room_id and current_match_id = m.id;
  return m;
end $$;
