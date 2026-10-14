// Server-verified practice match. The client names only its team and a request id; the server picks the seed, runs the
// whole best-of-3 against the training robots with the same deterministic rules as the game, and pays out once.
// The client then replays the returned seed. Limitation: the server cannot know whether a real person watched the replay,
// so rewards are rate-limited (economy_config.practice_limits) instead of being unlimited.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { runOnlineMatch } from '../_shared/game/onlineSim.ts'
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

  let team: string[], requestId: string
  try {
    const body = await req.json()
    team = Array.isArray(body.team) ? body.team.map(String) : []; requestId = String(body.request_id ?? '')
  } catch { return json({ error: 'bad request' }, 400) }
  if (team.length !== 3 || !UUID.test(requestId)) return json({ error: 'bad request' }, 400)

  const combatSeed = crypto.getRandomValues(new Uint32Array(1))[0]
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  // Purchased upgrades are read from the database for the authenticated user; the client never sends stats.
  const bonusResult = await admin.rpc('team_bonus', { p_player: userData.user.id, p_team: team })
  if (bonusResult.error) return json({ error: bonusResult.error.message }, 400)
  const bonus = bonusResult.data ?? {}
  let result
  try { result = runOnlineMatch(team, ROBOT_IDS, combatSeed, { player: bonus }) } catch { return json({ error: 'invalid team' }, 400) }
  const { data, error } = await admin.rpc('record_practice_match', {
    p_player: userData.user.id, p_request: requestId, p_team: team, p_robots: ROBOT_IDS, p_combat_seed: combatSeed, p_player_won: result.winner === 1, p_bonus: bonus,
  })
  if (error) return json({ error: error.message }, error.code === '42501' ? 403 : 400)
  // A retried request returns the stored match, so the replay seed and the reward always agree.
  return json({ match_id: data.id, team: data.team, robot_team: data.robot_team, combat_seed: Number(data.combat_seed), player_won: data.player_won, coins: data.coins, limited: data.limited, bonus: data.bonus })
})
