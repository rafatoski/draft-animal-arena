// Scheduled snapshot of players, leaderboard and finished matches into Google Sheets (reporting only; Supabase stays the source of truth).
// Secrets (supabase secrets set): GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_SHEET_ID, SHEETS_SYNC_SECRET. Share the sheet with the service account's email.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { SHEETS, leaderboardRows, matchRows, playerRows, range, unseenMatches, type LeaderRow, type MatchRow, type PlayerRow } from '../_shared/sheets.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const b64url = (data: ArrayBuffer | string) => btoa(typeof data === 'string' ? data : String.fromCharCode(...new Uint8Array(data))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function googleToken(serviceAccount: { client_email: string; private_key: string }) {
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: serviceAccount.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3000 }))}`
  const pem = serviceAccount.private_key.replace(/-----[^-]+-----|\s/g, '')
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned))
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(signature)}` }) })
  if (!response.ok) throw new Error(`google token ${response.status}`)
  return (await response.json()).access_token as string
}

Deno.serve(async (req) => {
  if (req.headers.get('x-sync-secret') !== Deno.env.get('SHEETS_SYNC_SECRET') || !Deno.env.get('SHEETS_SYNC_SECRET')) return json({ error: 'forbidden' }, 403)
  const sheetId = Deno.env.get('GOOGLE_SHEET_ID'), saJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (!sheetId || !saJson) return json({ error: 'GOOGLE_SHEET_ID / GOOGLE_SERVICE_ACCOUNT_JSON not configured' }, 503)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const state = { name: 'matches' }
  try {
    const token = await googleToken(JSON.parse(saJson))
    const api = (path: string, init: RequestInit = {}) => fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })

    // Make sure the three worksheets and their headers exist (one batched call, then header writes).
    const meta = await (await api('?fields=sheets.properties.title')).json()
    const have = new Set((meta.sheets ?? []).map((s: { properties: { title: string } }) => s.properties.title))
    const missing = (Object.keys(SHEETS) as (keyof typeof SHEETS)[]).filter((name) => !have.has(name))
    if (missing.length) await api(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests: missing.map((title) => ({ addSheet: { properties: { title } } })) }) })
    await api('/values:batchUpdate', { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data: (Object.keys(SHEETS) as (keyof typeof SHEETS)[]).map((name) => ({ range: `${name}!A1`, values: [[...SHEETS[name]]] })) }) })

    const [players, leaders, finished] = await Promise.all([
      admin.from('player_progress').select('player_id, level, experience, coins, ranking_points, wins, losses, total_matches, updated_at, profiles(display_name, account_type)').order('ranking_points', { ascending: false }).limit(5000),
      admin.from('leaderboard').select('position, player, ranking_points, wins, losses, total_matches').order('position').limit(1000),
      admin.from('matches').select('id, match_type, match_status, started_at, finished_at, winner_id, p1:player_1_id(display_name), p2:player_2_id(display_name), w:winner_id(display_name)').eq('match_status', 'finished').order('finished_at', { ascending: true }).limit(2000),
    ])
    for (const r of [players, leaders, finished]) if (r.error) throw new Error(r.error.message)

    const playerData = playerRows((players.data ?? []).map((r: any) => ({ id: r.player_id, display_name: r.profiles?.display_name ?? '', account_type: r.profiles?.account_type ?? '', ...r })) as PlayerRow[])
    const leaderData = leaderboardRows((leaders.data ?? []) as LeaderRow[])
    // PLAYERS and LEADERBOARD are snapshots: clear then rewrite, so reruns can never duplicate a row.
    await api('/values:batchClear', { method: 'POST', body: JSON.stringify({ ranges: ['PLAYERS!A2:K', 'LEADERBOARD!A2:F'] }) })
    await api('/values:batchUpdate', { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data: [
      ...(playerData.length ? [{ range: range('PLAYERS', playerData.length), values: playerData }] : []),
      ...(leaderData.length ? [{ range: range('LEADERBOARD', leaderData.length), values: leaderData }] : []),
    ] }) })

    // MATCHES is append-only; ids already present are skipped.
    const existing = ((await (await api('/values/MATCHES!A2:A')).json()).values ?? []).flat() as string[]
    const all = (finished.data ?? []).map((r: any) => ({ id: r.id, match_type: r.match_type, player_1: r.p1?.display_name ?? '', player_2: r.p2?.display_name ?? '', winner: r.w?.display_name ?? null, match_status: r.match_status, finished_at: r.finished_at, started_at: r.started_at })) as MatchRow[]
    const fresh = matchRows(unseenMatches(all, existing))
    if (fresh.length) await api('/values/MATCHES!A2:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', { method: 'POST', body: JSON.stringify({ values: fresh }) })

    await admin.from('sheet_sync_state').update({ last_run_at: new Date().toISOString(), last_status: `ok players=${playerData.length} leaders=${leaderData.length} newMatches=${fresh.length}` }).eq('name', state.name)
    return json({ ok: true, players: playerData.length, leaderboard: leaderData.length, newMatches: fresh.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error'
    await admin.from('sheet_sync_state').update({ last_run_at: new Date().toISOString(), last_status: `error: ${message}`.slice(0, 200) }).eq('name', state.name)
    return json({ ok: false, error: message }, 502)
  }
})
