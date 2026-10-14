-- Leaderboard = every Google account (guests never persist), ranked by competitive results only.
-- Before: a player appeared only after their first online match, so a fresh Google player was invisible.
-- ranking_points / wins / losses / total_matches are written only by finalize_match (online matches); practice never touches them.
create or replace view public.leaderboard as
select rank() over (order by pp.ranking_points desc, pp.wins desc, pr.created_at asc)::integer as position,
       pp.player_id,
       pr.display_name as player,
       pp.ranking_points,
       pp.wins,
       pp.losses,
       pp.total_matches,
       case when pp.total_matches > 0 then round(100.0 * pp.wins / pp.total_matches)::integer else 0 end as win_rate
  from public.player_progress pp
  join public.profiles pr on pr.id = pp.player_id
 where pr.account_type = 'google';
