// Closes an online match. Each player reports the hype presses they made; once both have (or the other is overdue)
// the server replays the whole best-of-3 with those presses, stores the result and pays out once.
// Each log is trusted only for that player's own fighters, and the simulation itself enforces recharge and one-at-a-time.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { cleanPresses, runOnlineMatch } from '../_shared/game/onlineSim.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const GRACE_MS = 20000 // how long the server waits for the second log before replaying without it

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  const url = Deno.env.get('SUPABASE_URL')!
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return json({ error: 'unauthorized' }, 401)
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userError } = await caller.auth.getUser()
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401)
  const userId = userData.user.id

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'bad request' }, 400) }
  const matchId = String(body.match_id ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(matchId)) return json({ error: 'bad match id' }, 400)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: match } = await admin.from('matches').select('*').eq('id', matchId).maybeSingle()
  if (!match || (match.player_1_id !== userId && match.player_2_id !== userId)) return json({ error: 'not in this match' }, 403)
  if (match.match_status !== 'in_progress') return json({ status: match.match_status })

  const mine = userId === match.player_1_id ? 1 : 2
  // First report wins: repeating the call (this is also how a waiting client keeps the match moving) never rewrites a log.
  await admin.from('match_boosts').upsert({ match_id: matchId, player_id: userId, presses: cleanPresses(body.presses, mine === 1 ? [0, 1, 2] : [3, 4, 5]) }, { onConflict: 'match_id,player_id', ignoreDuplicates: true })
  const { data: logs } = await admin.from('match_boosts').select('player_id, presses, created_at').eq('match_id', matchId)
  const have = logs ?? []
  const oldest = Math.min(...have.map((l) => Date.parse(l.created_at)))
  if (have.length < 2 && Date.now() - oldest < GRACE_MS) return json({ status: 'waiting' })

  const presses = have.flatMap((l) => cleanPresses(l.presses, l.player_id === match.player_1_id ? [0, 1, 2] : [3, 4, 5]))
  let result
  try { result = runOnlineMatch(match.team_1, match.team_2, Number(match.combat_seed), { player: match.bonus_1, ai: match.bonus_2 }, presses) } catch { return json({ error: 'invalid match' }, 500) }
  const done = await admin.rpc('finalize_match', {
    p_match: matchId, p_winner: result.winner, p_score_1: result.score[0], p_score_2: result.score[1],
    p_rounds: result.rounds, p_ticks: result.ticks,
    p_events: result.log.map((r) => ({ round: r.round, events: r.events })), p_hash: result.hash,
  })
  if (done.error) return json({ error: done.error.message }, 500)
  return json({ status: 'finished' })
})
