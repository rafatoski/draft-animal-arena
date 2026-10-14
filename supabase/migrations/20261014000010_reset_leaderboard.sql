-- One-off leaderboard reset: zero every competitive counter. Coins, diamonds, levels and unlocks are untouched.
update public.player_progress set ranking_points = 0, wins = 0, losses = 0, total_matches = 0;
