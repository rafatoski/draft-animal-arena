-- Permanent fighter upgrades (coins) + a points-free leaderboard. Additive: player_progress.ranking_points and
-- reward_ledger.ranking_delta stay in the schema as historical columns but nothing reads or writes them any more.

-- ───────── configuration ─────────
update public.economy_config set config = config || '{"upgrade": {"step": 5, "base_cost": 5, "max_level": 20}}'::jsonb where id;
alter table public.economy_transactions drop constraint economy_transactions_transaction_type_check;
alter table public.economy_transactions add constraint economy_transactions_transaction_type_check
  check (transaction_type in ('match_reward', 'fighter_unlock', 'practice_reward', 'fighter_upgrade'));

-- ───────── one row per (player, fighter, stat): the purchased level ─────────
create table public.fighter_upgrades (
  player_id uuid not null references public.profiles (id) on delete cascade,
  fighter_id text not null check (fighter_id = any (public.valid_fighters())),
  stat text not null check (stat in ('attack', 'defense', 'speed')),
  level integer not null check (level >= 0),
  updated_at timestamptz not null default now(),
  primary key (player_id, fighter_id, stat)
);
revoke all on public.fighter_upgrades from anon, authenticated;
grant select on public.fighter_upgrades to authenticated;
grant all on public.fighter_upgrades to service_role;
alter table public.fighter_upgrades enable row level security;
create policy upgrades_read_own on public.fighter_upgrades for select to authenticated using (player_id = (select auth.uid()));

-- upgrade cost = base_cost * 2^level, computed here and nowhere else. The client only says WHICH stat, and which level it believes
-- it is on; if that level is stale (a repeated request, another device) nothing is charged.
create function public.upgrade_fighter(p_fighter text, p_stat text, p_expected_level integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); have integer; lvl integer; cost integer;
  base integer := (public.economy_setting('{upgrade,base_cost}'))::int; max_lvl integer := (public.economy_setting('{upgrade,max_level}'))::int;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where id = uid and account_type = 'google') then
    raise exception 'sign in with Google to upgrade fighters' using errcode = '42501'; end if;
  if not (p_fighter = any (public.valid_fighters())) then raise exception 'unknown fighter' using errcode = '22023'; end if;
  if p_stat not in ('attack', 'defense', 'speed') then raise exception 'unknown stat' using errcode = '22023'; end if;
  if not public.owns_fighters(uid, array[p_fighter]) then raise exception 'fighter not unlocked' using errcode = '42501'; end if;
  select coins into have from public.player_progress where player_id = uid for update; -- serialises this player's purchases
  select coalesce((select level from public.fighter_upgrades where player_id = uid and fighter_id = p_fighter and stat = p_stat), 0) into lvl;
  if p_expected_level is distinct from lvl then raise exception 'upgrade level changed' using errcode = 'P0001'; end if;
  if lvl >= max_lvl then raise exception 'max level reached' using errcode = 'P0001'; end if;
  cost := base * (2 ^ lvl)::int;
  if have < cost then raise exception 'not enough coins: need % more', cost - have using errcode = 'P0001'; end if;
  update public.player_progress set coins = coins - cost where player_id = uid;
  insert into public.fighter_upgrades (player_id, fighter_id, stat, level) values (uid, p_fighter, p_stat, lvl + 1)
    on conflict (player_id, fighter_id, stat) do update set level = excluded.level, updated_at = now();
  insert into public.economy_transactions (player_id, currency, amount, transaction_type, reference_id)
    values (uid, 'coins', -cost, 'fighter_upgrade', p_fighter || ':' || p_stat || ':' || (lvl + 1)); -- unique: the same level can be bought once
  return jsonb_build_object('coins', have - cost, 'fighter', p_fighter, 'stat', p_stat, 'level', lvl + 1, 'cost', cost,
                            'next_cost', case when lvl + 1 >= max_lvl then null else base * (2 ^ (lvl + 1))::int end);
end $$;
revoke execute on function public.upgrade_fighter(text, text, integer) from public, anon;
grant execute on function public.upgrade_fighter(text, text, integer) to authenticated;

-- Stat bonuses (in points, level * step) for the fighters of a team, as {"chicken": {"attack": 10, "defense": 0, "speed": 5}}.
-- Trusted callers only: begin_match snapshots it into the match, the practice Edge Function reads it before simulating.
create function public.team_bonus(p_player uuid, p_team text[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(f, jsonb_build_object(
      'attack',  coalesce((select level from public.fighter_upgrades u where u.player_id = p_player and u.fighter_id = f and u.stat = 'attack'), 0) * (public.economy_setting('{upgrade,step}'))::int,
      'defense', coalesce((select level from public.fighter_upgrades u where u.player_id = p_player and u.fighter_id = f and u.stat = 'defense'), 0) * (public.economy_setting('{upgrade,step}'))::int,
      'speed',   coalesce((select level from public.fighter_upgrades u where u.player_id = p_player and u.fighter_id = f and u.stat = 'speed'), 0) * (public.economy_setting('{upgrade,step}'))::int)), '{}'::jsonb)
  from unnest(p_team) f $$;
revoke execute on function public.team_bonus(uuid, text[]) from public, anon, authenticated;
grant execute on function public.team_bonus(uuid, text[]) to service_role;

-- ───────── online matches carry a snapshot of both players' bonuses, so every client replays exactly what the server simulated ─────────
alter table public.matches add column bonus_1 jsonb not null default '{}', add column bonus_2 jsonb not null default '{}';
drop function public.begin_match(uuid, uuid);
create function public.begin_match(p_room uuid, p_requester uuid)
returns table (match_id uuid, created boolean, player_1 uuid, player_2 uuid, team_1 text[], team_2 text[], match_seed bigint, combat_seed bigint, match_status text, bonus_1 jsonb, bonus_2 jsonb)
language plpgsql security definer set search_path = public as $$
declare room public.multiplayer_rooms; t1 text[]; t2 text[]; r1 boolean; r2 boolean; m public.matches; seed bigint;
begin
  select * into room from public.multiplayer_rooms where id = p_room for update;
  if not found then raise exception 'room not found' using errcode = 'P0002'; end if;
  if p_requester is distinct from room.host_player_id and p_requester is distinct from room.guest_player_id then
    raise exception 'not in this room' using errcode = '42501'; end if;
  if room.status = 'in_match' and room.current_match_id is not null then
    select * into m from public.matches where id = room.current_match_id;
    return query select m.id, false, m.player_1_id, m.player_2_id, m.team_1, m.team_2, m.match_seed, m.combat_seed, m.match_status, m.bonus_1, m.bonus_2;
    return;
  end if;
  if room.status <> 'lobby' or room.guest_player_id is null then raise exception 'room is not ready' using errcode = 'P0001'; end if;
  select team_selection, ready into t1, r1 from public.room_players where room_id = p_room and player_id = room.host_player_id;
  select team_selection, ready into t2, r2 from public.room_players where room_id = p_room and player_id = room.guest_player_id;
  if not (coalesce(r1, false) and coalesce(r2, false)) or cardinality(t1) <> 3 or cardinality(t2) <> 3 then
    raise exception 'both players must be ready' using errcode = 'P0001'; end if;
  if not (public.owns_fighters(room.host_player_id, t1) and public.owns_fighters(room.guest_player_id, t2)) then
    raise exception 'fighter not unlocked' using errcode = '42501'; end if;
  seed := floor(random() * 4294967296)::bigint;
  insert into public.matches (room_id, player_1_id, player_2_id, team_1, team_2, match_seed, combat_seed, bonus_1, bonus_2)
  values (p_room, room.host_player_id, room.guest_player_id, t1, t2, seed, floor(random() * 4294967296)::bigint,
          public.team_bonus(room.host_player_id, t1), public.team_bonus(room.guest_player_id, t2))
  returning * into m;
  update public.multiplayer_rooms set status = 'in_match', current_match_id = m.id where id = p_room;
  return query select m.id, true, m.player_1_id, m.player_2_id, m.team_1, m.team_2, m.match_seed, m.combat_seed, m.match_status, m.bonus_1, m.bonus_2;
end $$;
revoke execute on function public.begin_match(uuid, uuid) from public, anon, authenticated;
grant execute on function public.begin_match(uuid, uuid) to service_role;

-- ───────── practice matches also store the bonuses they were simulated with (a retried request replays the same fight) ─────────
alter table public.practice_matches add column bonus jsonb not null default '{}';
drop function public.record_practice_match(uuid, uuid, text[], text[], bigint, boolean);
create function public.record_practice_match(p_player uuid, p_request uuid, p_team text[], p_robots text[], p_combat_seed bigint, p_player_won boolean, p_bonus jsonb)
returns public.practice_matches
language plpgsql security definer set search_path = public as $$
declare
  m public.practice_matches; v_coins integer := 0; v_limited boolean := false; last_at timestamptz; recent integer;
  coin_min integer := (public.economy_setting('{coin_reward,min}'))::int; coin_max integer := (public.economy_setting('{coin_reward,max}'))::int;
  min_gap integer := (public.economy_setting('{practice_limits,min_seconds}'))::int; per_hour integer := (public.economy_setting('{practice_limits,per_hour}'))::int;
begin
  if not exists (select 1 from public.profiles where id = p_player and account_type = 'google') then
    raise exception 'sign in with Google to save practice rewards' using errcode = '42501'; end if;
  if cardinality(p_team) <> 3 or (select count(distinct f) from unnest(p_team) f) <> 3 or not public.owns_fighters(p_player, p_team) then
    raise exception 'invalid team' using errcode = '22023'; end if;
  perform 1 from public.player_progress where player_id = p_player for update;
  select * into m from public.practice_matches where player_id = p_player and request_id = p_request;
  if found then return m; end if;
  if p_player_won then
    select max(created_at), count(*) filter (where created_at > now() - interval '1 hour') into last_at, recent
      from public.practice_matches where player_id = p_player and coins > 0;
    v_limited := (last_at is not null and last_at > now() - make_interval(secs => min_gap)) or recent >= per_hour;
    if not v_limited then v_coins := coin_min + floor(random() * (coin_max - coin_min + 1))::int; end if;
  end if;
  insert into public.practice_matches (player_id, request_id, team, robot_team, combat_seed, player_won, coins, limited, bonus)
  values (p_player, p_request, p_team, p_robots, p_combat_seed, p_player_won, v_coins, v_limited, coalesce(p_bonus, '{}')) returning * into m;
  if v_coins > 0 then -- coins only: practice never pays diamonds or touches competitive records
    update public.player_progress set coins = coins + v_coins where player_id = p_player;
    insert into public.economy_transactions (player_id, currency, amount, transaction_type, reference_id)
      values (p_player, 'coins', v_coins, 'practice_reward', m.id::text) on conflict do nothing;
  end if;
  return m;
end $$;
revoke execute on function public.record_practice_match(uuid, uuid, text[], text[], bigint, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.record_practice_match(uuid, uuid, text[], text[], bigint, boolean, jsonb) to service_role;

-- ───────── online rewards without points: coins + diamonds for the winner, a recorded defeat for the loser ─────────
create or replace function public.finalize_match(p_match uuid, p_winner smallint, p_score_1 integer, p_score_2 integer,
                                                 p_rounds integer, p_ticks integer, p_events jsonb, p_hash text)
returns public.matches
language plpgsql security definer set search_path = public as $$
declare
  m public.matches; winner uuid; loser uuid; round_row jsonb; inserted integer; v_coins integer; v_gems integer;
  coin_min integer := (public.economy_setting('{coin_reward,min}'))::int; coin_max integer := (public.economy_setting('{coin_reward,max}'))::int;
  gem_min integer := (public.economy_setting('{diamond_reward,min}'))::int; gem_max integer := (public.economy_setting('{diamond_reward,max}'))::int;
begin
  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'match not found' using errcode = 'P0002'; end if;
  if m.match_status = 'finished' then return m; end if;
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

  v_coins := coin_min + floor(random() * (coin_max - coin_min + 1))::int;
  v_gems := gem_min + floor(random() * (gem_max - gem_min + 1))::int;
  insert into public.reward_ledger (match_id, player_id, coins, diamonds, ranking_delta) values (p_match, winner, v_coins, v_gems, 0) on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 1 then
    update public.player_progress set coins = coins + v_coins, diamonds = diamonds + v_gems, wins = wins + 1, total_matches = total_matches + 1 where player_id = winner;
    insert into public.economy_transactions (player_id, currency, amount, transaction_type, reference_id) values
      (winner, 'coins', v_coins, 'match_reward', p_match::text), (winner, 'diamonds', v_gems, 'match_reward', p_match::text) on conflict do nothing;
  end if;
  insert into public.reward_ledger (match_id, player_id, coins, diamonds, ranking_delta) values (p_match, loser, 0, 0, 0) on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 1 then
    update public.player_progress set losses = losses + 1, total_matches = total_matches + 1 where player_id = loser;
  end if;
  update public.multiplayer_rooms set status = 'finished' where id = m.room_id and current_match_id = m.id;
  return m;
end $$;

-- ───────── leaderboard: wins (most first), then losses (fewest first), then a stable id. No points. ─────────
drop view public.leaderboard;
create view public.leaderboard as
select row_number() over (order by pp.wins desc, pp.losses asc, pp.player_id asc)::integer as position,
       pp.player_id,
       pr.display_name as player,
       pp.wins,
       pp.losses,
       pp.total_matches,
       case when pp.wins + pp.losses > 0 then round(100.0 * pp.wins / (pp.wins + pp.losses))::integer else 0 end as win_rate
  from public.player_progress pp
  join public.profiles pr on pr.id = pp.player_id
 where pr.account_type = 'google';
grant select on public.leaderboard to anon, authenticated;
create index if not exists player_progress_wins_idx on public.player_progress (wins desc, losses asc);
