import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { ECONOMY, isStarter } from '../.test-build/game/economy.js'
import { draftMatch } from '../.test-build/game/match.js'
import { FIGHTERS } from '../.test-build/game/fighters.js'

const seed = JSON.parse(readFileSync('supabase/migrations/20261014000002_economy_unlocks.sql', 'utf8').match(/values \('(\{[\s\S]*?\})'\);/)[1])

test('the UI defaults equal the SQL economy seed, and the starters are the three the spec names', () => {
  assert.deepEqual([...ECONOMY.starterFighters], seed.starter_fighters)
  assert.equal(ECONOMY.unlockPriceDiamonds, seed.unlock_price_diamonds)
  assert.deepEqual(ECONOMY.starterFighters, ['chicken', 'capybara', 'frog'])
  assert.deepEqual(FIGHTERS.map(f => f.id).filter(id => !isStarter(id)).sort(), ['fox', 'pig', 'raccoon'])
  assert.deepEqual([seed.coin_reward, seed.diamond_reward], [{ min: 1, max: 3 }, { min: 1, max: 2 }])
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
