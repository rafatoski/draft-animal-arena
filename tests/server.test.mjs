import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { SHARED, OUT, transform } from '../scripts/sync-shared.mjs'
import { runOnlineMatch as clientRun } from '../.test-build/game/onlineSim.js'
import { FIGHTERS } from '../.test-build/game/fighters.js'

const server = await import('../supabase/functions/_shared/game/onlineSim.ts') // the bundle the Edge Function ships, run as-is
const sheets = await import('../supabase/functions/_shared/sheets.ts')

test('the Edge Function bundle is a fresh copy of the game rules', () => {
  for (const file of SHARED) assert.equal(readFileSync(`${OUT}/${file}`, 'utf8'), transform(readFileSync(`src/${file}`, 'utf8')), `${file} is stale: run npm run sync:shared`)
})

test('server and client simulate identical online matches (200 seeded pairings)', () => {
  const ids = FIGHTERS.map(f => f.id)
  const pick = (n) => { const a = [...ids]; return [a[n % 6], a[(n * 5 + 1) % 6], a[(n * 7 + 2) % 6]].filter((v, i, s) => s.indexOf(v) === i) }
  let compared = 0
  for (let n = 0; n < 200; n++) {
    const t1 = [...ids].sort((a, b) => ((a.charCodeAt(0) * (n + 3)) % 7) - ((b.charCodeAt(0) * (n + 3)) % 7)).slice(0, 3)
    const t2 = [...ids].sort((a, b) => ((a.charCodeAt(1) * (n + 5)) % 11) - ((b.charCodeAt(1) * (n + 5)) % 11)).slice(0, 3)
    const seed = (n * 2654435761) >>> 0
    const a = server.runOnlineMatch(t1, t2, seed), b = clientRun(t1, t2, seed)
    assert.deepEqual([a.winner, a.score, a.rounds, a.ticks, a.hash], [b.winner, b.score, b.rounds, b.ticks, b.hash])
    assert.ok(Math.max(...a.score) === 2 && a.score[0] !== a.score[1] && (a.winner === 1) === (a.score[0] > a.score[1]))
    assert.ok(a.rounds >= 2 && a.rounds <= 30)
    compared++
  }
  assert.equal(compared, 200)
  assert.equal(server.runOnlineMatch(['chicken', 'fox', 'pig'], ['frog', 'capybara', 'raccoon'], 7).hash, server.runOnlineMatch(['chicken', 'fox', 'pig'], ['frog', 'capybara', 'raccoon'], 7).hash)
})

test('Sheets rows: headers match the spec, privacy and formula injection are handled, retries do not duplicate', () => {
  assert.deepEqual(sheets.SHEETS.PLAYERS, ['Player ID', 'Display Name', 'Account Type', 'Level', 'XP', 'Coins', 'Ranking Points', 'Wins', 'Losses', 'Total Matches', 'Last Updated'])
  assert.deepEqual(sheets.SHEETS.LEADERBOARD, ['Rank', 'Player', 'Ranking Points', 'Wins', 'Losses', 'Total Matches'])
  assert.deepEqual(sheets.SHEETS.MATCHES, ['Match ID', 'Match Type', 'Player 1', 'Player 2', 'Winner', 'Match Status', 'Date'])
  const [row] = sheets.playerRows([{ id: '12345678-aaaa-bbbb-cccc-dddddddddddd', display_name: '=HYPERLINK("x")', account_type: 'google', level: 2, experience: 120, coins: 50, ranking_points: 25, wins: 1, losses: 0, total_matches: 1, updated_at: 't' }])
  assert.equal(row[0], '12345678'); assert.equal(row[1], `'=HYPERLINK("x")`); assert.equal(row.length, sheets.SHEETS.PLAYERS.length)
  const m = { id: 'abcdef01-0000-0000-0000-000000000000', match_type: 'online', player_1: 'A', player_2: 'B', winner: 'A', match_status: 'finished', finished_at: 'd', started_at: 's' }
  assert.deepEqual(sheets.unseenMatches([m, { ...m, id: '99999999-x' }], ['abcdef01']).map(r => r.id), ['99999999-x'])
  assert.equal(sheets.matchRows([m])[0].length, sheets.SHEETS.MATCHES.length)
  assert.equal(sheets.range('PLAYERS', 3), 'PLAYERS!A2:K4'); assert.equal(sheets.range('LEADERBOARD', 1), 'LEADERBOARD!A2:F2')
})

test('server replay with hype presses: same presses same hash, presses change the fight, foreign or malformed presses are dropped', () => {
  const t1 = ['chicken', 'capybara', 'frog'], t2 = ['raccoon', 'fox', 'pig']
  const presses = [{ attempt: 0, tick: 30, unit: 0 }, { attempt: 0, tick: 40, unit: 3 }, { attempt: 0, tick: 120, unit: 1 }]
  const a = server.runOnlineMatch(t1, t2, 5, {}, presses), b = clientRun(t1, t2, 5, {}, presses)
  assert.deepEqual([a.winner, a.score, a.ticks, a.hash], [b.winner, b.score, b.ticks, b.hash])
  assert.notEqual(a.hash, server.runOnlineMatch(t1, t2, 5).hash)
  const dirty = [{ attempt: 0, tick: 30, unit: 3 }, { attempt: 0, tick: 0, unit: 0 }, { attempt: 0, tick: 1.5, unit: 0 }, { attempt: 99, tick: 5, unit: 0 }, { attempt: 0, tick: 5, unit: 2 }, null, 'x']
  assert.deepEqual(server.cleanPresses(dirty, [0, 1, 2]), [{ attempt: 0, tick: 5, unit: 2 }])
  assert.deepEqual(server.cleanPresses('nope', [0]), [])
  assert.equal(server.cleanPresses(Array.from({ length: 1000 }, (_, i) => ({ attempt: 0, tick: i + 1, unit: 0 })), [0]).length, 400)
})

test('solo endpoint persists CPU mode and opponents; finish cannot turn practice into ranked play', async () => {
  const { transpile } = await import('typescript')
  const { draftMatch } = await import('../supabase/functions/_shared/game/match.ts')
  let handler, stored, recorded
  const admin = {
    from() {
      const filters = {}
      const query = {
        select() { return query },
        eq(k, v) { filters[k] = v; return query },
        async maybeSingle() { return { data: stored && Object.entries(filters).every(([k, v]) => stored[k] === v) ? stored : null } },
        async insert(row) { stored = row; return { error: null } },
      }
      return query
    },
    async rpc(name, args) {
      if (name === 'team_bonus') return { data: {}, error: null }
      recorded = { name, args }
      return { data: { id: 'saved', player_won: args.p_player_won, coins: 0, diamonds: 0, limited: false }, error: null }
    },
  }
  const caller = { auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) } }
  const source = readFileSync('supabase/functions/practice-match/index.ts', 'utf8').replace(/^import .*\n/gm, '')
  new Function('Deno', 'createClient', 'cleanPresses', 'runOnlineMatch', 'draftMatch', 'ROBOT_IDS', transpile(source))(
    { env: { get: k => k }, serve: h => { handler = h } },
    (_url, key) => key === 'SUPABASE_ANON_KEY' ? caller : admin,
    server.cleanPresses, server.runOnlineMatch, draftMatch, ['robot1', 'robot2', 'robot3'],
  )
  const call = body => handler(new Request('https://example.test', { method: 'POST', headers: { Authorization: 'Bearer test' }, body: JSON.stringify(body) }))
  for (const mode of ['cpu', 'practice']) {
    stored = undefined
    const request_id = crypto.randomUUID(), team = ['chicken', 'capybara', 'frog']
    const start = await (await call({ action: 'start', mode, request_id, team })).json()
    assert.equal(start.mode, mode)
    assert.deepEqual(start.robot_team, stored.opponent_team)
    assert.equal(start.robot_team.every(id => id.startsWith('robot')), mode === 'practice')
    const retry = await (await call({ action: 'start', mode: mode === 'cpu' ? 'practice' : 'cpu', request_id, team })).json()
    assert.deepEqual(retry, start)
    const finish = await call({ action: 'finish', mode: mode === 'cpu' ? 'practice' : 'cpu', request_id, player_won: true, presses: [] })
    assert.equal(finish.status, 200)
    assert.equal(recorded.name, mode === 'cpu' ? 'record_cpu_match' : 'record_practice_match')
    assert.equal(recorded.args.p_player_won, server.runOnlineMatch(team, start.robot_team, start.combat_seed, { player: {} }, []).winner === 1)
  }
  assert.equal((await call({ action: 'finish', request_id: crypto.randomUUID() })).status, 404)
})
