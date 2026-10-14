-- Identity + trusted practice rewards. Additive only: no table is dropped, no row is deleted or rewritten.
--  * Guests are client-side only now. Anything that persists or competes requires a real (non-anonymous) account.
--  * Practice rewards are decided on the server: the Edge Function `practice-match` picks the seed, simulates the whole
--    match and calls record_practice_match(), the only way coins reach player_progress outside an online match.

-- ───────── names: Google full_name / name, otherwise a safe fallback ─────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta_name text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), '');
  anon boolean := coalesce(new.is_anonymous, false);
begin
  insert into public.profiles (id, display_name, avatar_url, account_type)
  values (new.id,
          left(coalesce(case when anon then null else meta_name end,
                        case when anon then 'Guest ' else 'Player ' end || lpad((floor(random() * 10000))::int::text, 4, '0')), 24),
          nullif(left(new.raw_user_meta_data ->> 'avatar_url', 500), ''),
          case when anon then 'guest' else 'google' end)
  on conflict (id) do nothing; -- never overwrites an existing profile or its name
  insert into public.player_progress (player_id) values (new.id) on conflict do nothing;
  insert into public.player_fighters (player_id, fighter_id)
    select new.id, jsonb_array_elements_text(public.economy_setting('{starter_fighters}')) on conflict do nothing;
  return new;
end $$;

-- ───────── only real accounts may open or join rooms (so no guest / anonymous user can reach ranked play) ─────────
create function public.require_real_account() returns trigger
language plpgsql security definer set search_path = public as $$
declare who uuid;
begin
  if tg_table_name = 'room_players' then who := new.player_id;
  else
    foreach who in array array_remove(array[new.host_player_id, new.guest_player_id], null) loop
      if not exists (select 1 from public.profiles where id = who and account_type = 'google') then
        raise exception 'sign in with Google to play online' using errcode = '42501'; end if;
    end loop;
    return new;
  end if;
  if not exists (select 1 from public.profiles where id = who and account_type = 'google') then
    raise exception 'sign in with Google to play online' using errcode = '42501'; end if;
  return new;
end $$;
create trigger rooms_real_accounts before insert or update of host_player_id, guest_player_id on public.multiplayer_rooms
  for each row execute function public.require_real_account();
create trigger room_players_real_accounts before insert on public.room_players
  for each row execute function public.require_real_account();

-- ───────── practice matches (server decides; never the client) ─────────
alter table public.economy_transactions drop constraint economy_transactions_transaction_type_check;
alter table public.economy_transactions add constraint economy_transactions_transaction_type_check
  check (transaction_type in ('match_reward', 'fighter_unlock', 'practice_reward'));

update public.economy_config set config = config || '{"practice_limits": {"min_seconds": 10, "per_hour": 60}}'::jsonb where id;

create table public.practice_matches (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  request_id uuid not null,
  team text[] not null,
  robot_team text[] not null,
  combat_seed bigint not null,
  player_won boolean not null,
  coins integer not null default 0 check (coins >= 0),
  limited boolean not null default false,
  created_at timestamptz not null default now(),
  unique (player_id, request_id) -- a retried request returns the stored match instead of creating (or paying) another
);
create index practice_matches_player_idx on public.practice_matches (player_id, created_at desc);
revoke all on public.practice_matches from anon, authenticated;
grant select on public.practice_matches to authenticated;
grant all on public.practice_matches to service_role;
alter table public.practice_matches enable row level security;
create policy practice_read_own on public.practice_matches for select to authenticated using (player_id = (select auth.uid()));

create function public.record_practice_match(p_player uuid, p_request uuid, p_team text[], p_robots text[], p_combat_seed bigint, p_player_won boolean)
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
  perform 1 from public.player_progress where player_id = p_player for update; -- serialises this player's practice requests
  select * into m from public.practice_matches where player_id = p_player and request_id = p_request;
  if found then return m; end if;
  if p_player_won then
    select max(created_at), count(*) filter (where created_at > now() - interval '1 hour') into last_at, recent
      from public.practice_matches where player_id = p_player and coins > 0;
    v_limited := (last_at is not null and last_at > now() - make_interval(secs => min_gap)) or recent >= per_hour;
    if not v_limited then v_coins := coin_min + floor(random() * (coin_max - coin_min + 1))::int; end if; -- drawn here, never by the client
  end if;
  insert into public.practice_matches (player_id, request_id, team, robot_team, combat_seed, player_won, coins, limited)
  values (p_player, p_request, p_team, p_robots, p_combat_seed, p_player_won, v_coins, v_limited) returning * into m;
  if v_coins > 0 then -- coins only: practice never pays diamonds, ranking points or online stats
    update public.player_progress set coins = coins + v_coins where player_id = p_player;
    insert into public.economy_transactions (player_id, currency, amount, transaction_type, reference_id)
      values (p_player, 'coins', v_coins, 'practice_reward', m.id::text) on conflict do nothing;
  end if;
  return m;
end $$;
revoke execute on function public.record_practice_match(uuid, uuid, text[], text[], bigint, boolean) from public, anon, authenticated;
grant execute on function public.record_practice_match(uuid, uuid, text[], text[], bigint, boolean) to service_role;
revoke execute on function public.require_real_account() from public, anon, authenticated;
