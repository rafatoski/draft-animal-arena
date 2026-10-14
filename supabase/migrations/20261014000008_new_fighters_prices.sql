-- K9 Enforcer ('k9') and Agent Platypus ('platypus'), per-fighter unlock prices and a free diamond for new Google accounts.
-- Additive: no row is deleted or rewritten, existing balances, unlocks and upgrades are untouched.

-- Fighter ids: player_fighters, fighter_upgrades and room validation all check against this one function.
create or replace function public.valid_fighters() returns text[] language sql immutable as
$$ select array['chicken', 'capybara', 'raccoon', 'frog', 'fox', 'pig', 'k9', 'platypus'] $$;

-- Raccoon 5, K9 Enforcer and Agent Platypus 15; every fighter without an entry (pig, fox) keeps the default 10.
update public.economy_config set config = config
  || '{"unlock_prices": {"raccoon": 5, "k9": 15, "platypus": 15}, "starting_diamonds": 1}'::jsonb where id;

create or replace function public.unlock_fighter(p_fighter text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); have integer;
  price integer := coalesce((public.economy_setting(array['unlock_prices', p_fighter]) #>> '{}')::int, (public.economy_setting('{unlock_price_diamonds}'))::int);
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

-- New Google accounts start with one free diamond (recorded in the ledger). Guests never get a profile, so they never get one.
alter table public.economy_transactions drop constraint economy_transactions_transaction_type_check;
alter table public.economy_transactions add constraint economy_transactions_transaction_type_check
  check (transaction_type in ('match_reward', 'fighter_unlock', 'practice_reward', 'fighter_upgrade', 'welcome_bonus'));

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta_name text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), '');
  anon boolean := coalesce(new.is_anonymous, false);
  bonus integer := case when anon then 0 else coalesce((public.economy_setting('{starting_diamonds}'))::int, 0) end;
begin
  insert into public.profiles (id, display_name, avatar_url, account_type)
  values (new.id,
          left(coalesce(case when anon then null else meta_name end,
                        case when anon then 'Guest ' else 'Player ' end || lpad((floor(random() * 10000))::int::text, 4, '0')), 24),
          nullif(left(new.raw_user_meta_data ->> 'avatar_url', 500), ''),
          case when anon then 'guest' else 'google' end)
  on conflict (id) do nothing; -- never overwrites an existing profile or its name
  insert into public.player_progress (player_id, diamonds) values (new.id, bonus) on conflict do nothing;
  if bonus > 0 and found then
    insert into public.economy_transactions (player_id, currency, amount, transaction_type, reference_id)
      values (new.id, 'diamonds', bonus, 'welcome_bonus', 'signup') on conflict do nothing;
  end if;
  insert into public.player_fighters (player_id, fighter_id)
    select new.id, jsonb_array_elements_text(public.economy_setting('{starter_fighters}')) on conflict do nothing;
  return new;
end $$;
