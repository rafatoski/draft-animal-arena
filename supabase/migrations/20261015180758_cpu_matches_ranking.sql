-- Solo sessions default to practice for compatibility with already-open fights.
-- The server chooses the mode and opponents at start; finish cannot change them.
alter table public.practice_sessions
  add column mode text not null default 'practice' check (mode in ('practice', 'cpu')),
  add column opponent_team text[] not null default '{robot1,robot2,robot3}' check (cardinality(opponent_team) = 3);

create table public.cpu_matches (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.practice_sessions(request_id),
  player_id uuid not null references public.profiles(id) on delete cascade,
  player_won boolean not null,
  created_at timestamptz not null default now()
);
create index cpu_matches_player_idx on public.cpu_matches(player_id, created_at desc);
alter table public.cpu_matches enable row level security;
revoke all on public.cpu_matches from anon, authenticated;
grant select on public.cpu_matches to authenticated;
grant all on public.cpu_matches to service_role;
create policy cpu_matches_read_own on public.cpu_matches for select to authenticated
  using (player_id = (select auth.uid()));

-- Only the server may submit its replay verdict. Serialize per player so retries
-- and concurrent finishes update the shared online + CPU standings exactly once.
create function public.record_cpu_match(p_player uuid, p_request uuid, p_player_won boolean)
returns public.cpu_matches
language plpgsql security invoker set search_path = '' as $$
declare
  m public.cpu_matches;
  v_team text[];
begin
  if not exists (select 1 from public.profiles where id = p_player and account_type = 'google') then
    raise exception 'sign in with Google to save results' using errcode = '42501';
  end if;
  perform 1 from public.player_progress where player_id = p_player for update;
  if not exists (select 1 from public.practice_sessions where request_id = p_request and player_id = p_player and mode = 'cpu') then
    raise exception 'unknown CPU session' using errcode = '22023';
  end if;
  select * into m from public.cpu_matches where request_id = p_request;
  if found then return m; end if;
  select team into v_team from public.practice_sessions where request_id = p_request;
  if cardinality(v_team) <> 3 or (select count(distinct f) from unnest(v_team) f) <> 3 or not public.owns_fighters(p_player, v_team) then
    raise exception 'invalid team' using errcode = '22023';
  end if;
  insert into public.cpu_matches(request_id, player_id, player_won)
    values (p_request, p_player, p_player_won) returning * into m;
  update public.player_progress set
    wins = wins + case when p_player_won then 1 else 0 end,
    losses = losses + case when p_player_won then 0 else 1 end,
    total_matches = total_matches + 1
    where player_id = p_player;
  return m;
end $$;
revoke execute on function public.record_cpu_match(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.record_cpu_match(uuid, uuid, boolean) to service_role;
