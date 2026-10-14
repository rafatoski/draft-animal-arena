// Opens an online match: validates the room and stores the seeds and both players' upgrade snapshots. Nothing is decided
// yet: both clients play the fight live (hype buttons included) and submit-boosts later replays it on the server.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  const url = Deno.env.get('SUPABASE_URL')!, serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return json({ error: 'unauthorized' }, 401)

  // Who is calling: resolved from their own JWT, never from the request body.
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userError } = await caller.auth.getUser()
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401)

  let roomId: string
  try { roomId = String((await req.json()).room_id ?? '') } catch { return json({ error: 'bad request' }, 400) }
  if (!/^[0-9a-f-]{36}$/i.test(roomId)) return json({ error: 'bad room id' }, 400)

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const begun = await admin.rpc('begin_match', { p_room: roomId, p_requester: userData.user.id })
  if (begun.error) return json({ error: begun.error.message }, begun.error.code === '42501' ? 403 : 409)
  const match = begun.data?.[0]
  if (!match) return json({ error: 'no match' }, 500)

  return json({ match_id: match.match_id, created: match.created })
})
