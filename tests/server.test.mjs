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
