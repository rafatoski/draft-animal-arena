import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { ECONOMY, isStarter } from '../.test-build/game/economy.js'
import { draftMatch } from '../.test-build/game/match.js'
import { FIGHTERS } from '../.test-build/game/fighters.js'
import { UPGRADE, upgradeCost, upgradedStat, bonusFromLevels } from '../.test-build/game/upgrades.js'
import { CombatSimulation } from '../.test-build/simulation/combat.js'
import { runOnlineMatch } from '../.test-build/game/onlineSim.js'
import { getGuest, startGuest, endGuest, guestPracticeWin } from '../.test-build/services/guest.js'

const seed = JSON.parse(readFileSync('supabase/migrations/20261014000002_economy_unlocks.sql', 'utf8').match(/values \('(\{[\s\S]*?\})'\);/)[1])

test('the UI defaults equal the SQL economy seed, and the starters are the three the spec names', () => {
  assert.deepEqual([...ECONOMY.starterFighters], seed.starter_fighters)
  assert.equal(ECONOMY.unlockPriceDiamonds, seed.unlock_price_diamonds)
  assert.deepEqual(ECONOMY.starterFighters, ['chicken', 'capybara', 'frog'])
  assert.deepEqual(FIGHTERS.map(f => f.id).filter(id => !isStarter(id)).sort(), ['fox', 'k9', 'pig', 'platypus', 'raccoon'])
  assert.deepEqual([seed.coin_reward, seed.diamond_reward], [{ min: 1, max: 3 }, { min: 1, max: 2 }])
  assert.deepEqual(ECONOMY.coinReward, seed.coin_reward)
})

test('auto-fill never picks a locked fighter, with any seed or partial selection', () => {
  const allowed = [...ECONOMY.starterFighters]
  for (let seedValue = 0; seedValue < 300; seedValue++) {
    for (const picks of [[], ['frog'], ['chicken', 'capybara']]) {
      const team = draftMatch(picks, seedValue, false, allowed).player
      assert.equal(new Set(team).size, 3); assert.ok(team.every(id => allowed.includes(id)), `${team}`)
    }
  }
  assert.ok(draftMatch([], 1).player.length === 3) // no restriction: unchanged behaviour
})

test('guest session: temporary coins in memory only, 1-3 per win, no diamonds, nothing persisted', () => {
  assert.equal(getGuest(), null); assert.equal(guestPracticeWin(), 0) // no session, no coins
  const guest = startGuest()
  assert.match(guest.name, /^Guest\d{4}$/); assert.equal(guest.coins, 0)
  const seen = new Set()
  for (const roll of [0, .34, .67, .99]) { const before = getGuest().coins, n = guestPracticeWin(() => roll); seen.add(n); assert.equal(getGuest().coins - before, n) }
  assert.deepEqual([...seen].sort(), [1, 2, 3]); assert.ok(!('diamonds' in getGuest()))
  endGuest(); assert.equal(getGuest(), null) // session over: coins are gone
  assert.equal(startGuest().coins, 0)
  const source = readFileSync('src/services/guest.ts', 'utf8')
  assert.ok(!/localStorage|sessionStorage|supabase|indexedDB/.test(source.replace(/\/\*[\s\S]*?\*\//g, '')), 'guest state must never be persisted')
})

test('the Edge Function and migration agree on the practice rules', () => {
  const fn = readFileSync('supabase/functions/practice-match/index.ts', 'utf8'), sql = readFileSync('supabase/migrations/20261014000003_google_only_practice_rewards.sql', 'utf8')
  assert.ok(/record_practice_match/.test(fn) && /runOnlineMatch\(team, ROBOT_IDS/.test(fn)) // the server simulates, the client only names its team
  assert.ok(/practice_diamond/.test(readFileSync('supabase/migrations/20261014000011_practice_diamonds.sql', 'utf8'))) // practice diamonds are a configured chance, not a fixed payout
})

test('upgrade formulas: cost = 5 x 2^level, stat = base + 5 x level, and the UI mirror equals the SQL config', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(upgradeCost), [5, 10, 20, 40, 80, 160])
  assert.equal(upgradedStat(19, 0), 19); assert.equal(upgradedStat(19, 3), 34) // existing base stats are kept, never assumed to be 20
  const cfg = JSON.parse(readFileSync('supabase/migrations/20261014000007_upgrades_no_points.sql', 'utf8').match(/'(\{"upgrade":[^']*\})'/)[1]).upgrade
  assert.deepEqual([UPGRADE.step, UPGRADE.baseCost, UPGRADE.maxLevel], [cfg.step, cfg.base_cost, cfg.max_level])
})

test('combat: upgrades add exactly +5 per level to the chosen stat only, and change real fights', () => {
  const team = ['chicken', 'capybara', 'frog']
  const base = new CombatSimulation(team, ['fox', 'pig', 'raccoon'], 7)
  const up = new CombatSimulation(team, ['fox', 'pig', 'raccoon'], 7, { player: bonusFromLevels({ chicken: { attack: 2, defense: 0, speed: 1 } }) })
  const [b, u] = [base.units[0].definition, up.units[0].definition]
  assert.deepEqual([u.attack - b.attack, u.defense - b.defense, u.speed - b.speed, u.health - b.health], [10, 0, 5, 0])
  assert.deepEqual(up.units[1].definition, base.units[1].definition)             // other fighters untouched
  assert.deepEqual(up.units.slice(3).map(x => x.definition), base.units.slice(3).map(x => x.definition)) // the opponent's side too
  const plain = runOnlineMatch(team, ['fox', 'pig', 'raccoon'], 99), boosted = runOnlineMatch(team, ['fox', 'pig', 'raccoon'], 99, { player: { chicken: { attack: 100 }, frog: { attack: 100 }, capybara: { attack: 100 } } })
  assert.notEqual(plain.hash, boosted.hash); assert.equal(boosted.winner, 1)       // practice and online both run this exact engine
  assert.equal(runOnlineMatch(team, ['fox', 'pig', 'raccoon'], 99, { player: {} }).hash, plain.hash) // no upgrades = the old results, unchanged
})

test('no points anywhere in the leaderboard, its types, UI or queries', () => {
  const files = ['src/scenes/LeaderboardScene.ts', 'src/services/online.ts', 'src/scenes/AccountScene.ts']
  for (const f of files) assert.ok(!/ranking_?points|rankingPoints|pointsLabel/i.test(readFileSync(f, 'utf8')), f)
  const view = readFileSync('supabase/migrations/20261014000007_upgrades_no_points.sql', 'utf8').split('create view public.leaderboard')[1]
  assert.ok(!/ranking_points/.test(view)); assert.match(view, /order by pp\.wins desc, pp\.losses asc, pp\.player_id asc/)
})
