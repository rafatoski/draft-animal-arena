// Server-verified practice match, in two calls because the player can press hype buttons during the fight:
//   start  -> the server picks and remembers the seed and the upgrade snapshot; nothing is decided yet.
//   finish -> the client reports its button presses; the server replays the whole best-of-3 with them against the training
//             robots using the same deterministic rules, records the result and pays out once.
// The server cannot know whether a real person watched, so rewards are rate-limited (economy_config.practice_limits).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { cleanPresses, runOnlineMatch } from '../_shared/game/onlineSim.ts'
import { ROBOT_IDS } from '../_shared/game/fighters.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const UUID = /^[0-9a-f-]{36}$/i

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
  const requestId = String(body.request_id ?? '')
  if (!UUID.test(requestId)) return json({ error: 'bad request' }, 400)
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  if (body.action === 'finish') {
    const { data: session } = await admin.from('practice_sessions').select('*').eq('request_id', requestId).eq('player_id', userId).maybeSingle()
    if (!session) return json({ error: 'unknown session' }, 404)
    const presses = cleanPresses(body.presses, [0, 1, 2]) // the player controls only their own three fighters
    let result
    try { result = runOnlineMatch(session.team, ROBOT_IDS, Number(session.combat_seed), { player: session.bonus }, presses) } catch { return json({ error: 'invalid team' }, 400) }
    const { data, error } = await admin.rpc('record_practice_match', {
      p_player: userId, p_request: requestId, p_team: session.team, p_robots: ROBOT_IDS, p_combat_seed: session.combat_seed, p_player_won: result.winner === 1, p_bonus: session.bonus,
    })
    if (error) return json({ error: error.message }, error.code === '42501' ? 403 : 400)
    // A retried finish returns the stored match, so the verdict and the reward always agree.
    return json({ match_id: data.id, player_won: data.player_won, coins: data.coins, diamonds: data.diamonds, limited: data.limited })
  }

  const team = Array.isArray(body.team) ? body.team.map(String) : []
  if (team.length !== 3) return json({ error: 'bad request' }, 400)
  const existing = await admin.from('practice_sessions').select('*').eq('request_id', requestId).eq('player_id', userId).maybeSingle()
  if (existing.data) return json({ team: existing.data.team, robot_team: ROBOT_IDS, combat_seed: Number(existing.data.combat_seed), bonus: existing.data.bonus })
  // Purchased upgrades are read from the database for the authenticated user; the client never sends stats.
  const bonusResult = await admin.rpc('team_bonus', { p_player: userId, p_team: team })
  if (bonusResult.error) return json({ error: bonusResult.error.message }, 400)
  const bonus = bonusResult.data ?? {}
  const combatSeed = crypto.getRandomValues(new Uint32Array(1))[0]
  const { error } = await admin.from('practice_sessions').insert({ request_id: requestId, player_id: userId, team, combat_seed: combatSeed, bonus })
  if (error) return json({ error: error.message }, 400)
  return json({ team, robot_team: ROBOT_IDS, combat_seed: combatSeed, bonus })
})
