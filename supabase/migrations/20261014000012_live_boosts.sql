-- Live hype boosts: fights are no longer decided before they start. The server keeps what it needs to re-simulate them
-- once the players have reported their button presses, and only then records the result and pays.

-- Practice: the server picks the seed when the fight starts and remembers it, so the client cannot choose a favourable one.
create table public.practice_sessions (
  request_id uuid primary key,
  player_id uuid not null references public.profiles (id) on delete cascade,
  team text[] not null check (cardinality(team) = 3),
  combat_seed bigint not null,
  bonus jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index practice_sessions_player_idx on public.practice_sessions (player_id, created_at desc);
revoke all on public.practice_sessions from anon, authenticated;
grant all on public.practice_sessions to service_role;
alter table public.practice_sessions enable row level security;

-- Online: each player's own press log for a match (first report wins, never overwritten).
create table public.match_boosts (
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  presses jsonb not null default '[]',
  created_at timestamptz not null default now(),
  primary key (match_id, player_id)
);
revoke all on public.match_boosts from anon, authenticated;
grant all on public.match_boosts to service_role;
alter table public.match_boosts enable row level security;
