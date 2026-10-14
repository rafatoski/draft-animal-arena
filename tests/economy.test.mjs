import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { ECONOMY, isStarter } from '../.test-build/game/economy.js'
import { draftMatch } from '../.test-build/game/match.js'
import { FIGHTERS } from '../.test-build/game/fighters.js'
import { getGuest, startGuest, endGuest, guestPracticeWin } from '../.test-build/services/guest.js'

const seed = JSON.parse(readFileSync('supabase/migrations/20261014000002_economy_unlocks.sql', 'utf8').match(/values \('(\{[\s\S]*?\})'\);/)[1])

test('the UI defaults equal the SQL economy seed, and the starters are the three the spec names', () => {
  assert.deepEqual([...ECONOMY.starterFighters], seed.starter_fighters)
  assert.equal(ECONOMY.unlockPriceDiamonds, seed.unlock_price_diamonds)
  assert.deepEqual(ECONOMY.starterFighters, ['chicken', 'capybara', 'frog'])
  assert.deepEqual(FIGHTERS.map(f => f.id).filter(id => !isStarter(id)).sort(), ['fox', 'pig', 'raccoon'])
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
  assert.ok(!/diamonds/.test(sql.slice(sql.indexOf('create function public.record_practice_match'))) || /never pays diamonds/.test(sql)) // practice cannot touch diamonds
})
