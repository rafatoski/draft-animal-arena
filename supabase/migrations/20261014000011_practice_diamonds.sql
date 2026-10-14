-- Practice wins can now also pay diamonds, but only sometimes (economy_config.practice_diamond.chance) and 1 at a time:
-- online stays the reliable source (1-2 per win). Same rate limits as coins (a limited win pays nothing).
update public.economy_config set config = config || '{"practice_diamond": {"chance": 0.3, "amount": 1}}'::jsonb where id;
alter table public.practice_matches add column diamonds integer not null default 0;
create or replace function public.record_practice_match(p_player uuid, p_request uuid, p_team text[], p_robots text[], p_combat_seed bigint, p_player_won boolean, p_bonus jsonb)
returns public.practice_matches
language plpgsql security definer set search_path = public as $$
declare
  m public.practice_matches; v_coins integer := 0; v_gems integer := 0; v_limited boolean := false; last_at timestamptz; recent integer;
  coin_min integer := (public.economy_setting('{coin_reward,min}'))::int; coin_max integer := (public.economy_setting('{coin_reward,max}'))::int;
  gem_chance numeric := (public.economy_setting('{practice_diamond,chance}'))::numeric; gem_amount integer := (public.economy_setting('{practice_diamond,amount}'))::int;
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
    if not v_limited then
      v_coins := coin_min + floor(random() * (coin_max - coin_min + 1))::int;
      if random() < gem_chance then v_gems := gem_amount; end if;
    end if;
  end if;
  insert into public.practice_matches (player_id, request_id, team, robot_team, combat_seed, player_won, coins, diamonds, limited, bonus)
  values (p_player, p_request, p_team, p_robots, p_combat_seed, p_player_won, v_coins, v_gems, v_limited, coalesce(p_bonus, '{}')) returning * into m;
  if v_coins > 0 then -- practice never touches ranking, wins or losses
    update public.player_progress set coins = coins + v_coins, diamonds = diamonds + v_gems where player_id = p_player;
    insert into public.economy_transactions (player_id, currency, amount, transaction_type, reference_id)
      values (p_player, 'coins', v_coins, 'practice_reward', m.id::text) on conflict do nothing;
    if v_gems > 0 then insert into public.economy_transactions (player_id, currency, amount, transaction_type, reference_id)
      values (p_player, 'diamonds', v_gems, 'practice_reward', m.id::text) on conflict do nothing; end if;
  end if;
  return m;
end $$;
