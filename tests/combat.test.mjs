import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { CombatSimulation } from '../.test-build/simulation/combat.js'
import { SeededRandom } from '../.test-build/simulation/random.js'
import { FIGHTERS } from '../.test-build/game/fighters.js'

const player = ['chicken', 'capybara', 'frog']
const ai = ['raccoon', 'fox', 'pig']
function play(seed, left = player, right = ai) {
  const sim = new CombatSimulation(left, right, seed)
  const events = []
  while (sim.winner === null) {
    events.push(...sim.step())
    for (const unit of sim.units) {
      assert.ok(Number.isFinite(unit.x) && Number.isFinite(unit.y))
      assert.ok(unit.hp >= 0 && unit.hp <= unit.definition.health)
    }
  }
  return { sim, events }
}
test('identical seeds and teams produce identical full event streams and final states', () => {
  assert.deepEqual(play(12345), play(12345))
  assert.notDeepEqual(play(12345).events, play(54321).events)
})
test('100 seeded random matchups finish, remain valid, and stop after victory', () => {
  const rng = new SeededRandom(42)
  const ids = FIGHTERS.map(f => f.id)
  for (let seed = 0; seed < 100; seed++) {
    const { sim, events } = play(seed, rng.shuffle(ids).slice(0, 3), rng.shuffle(ids).slice(0, 3))
    assert.ok(sim.tick <= 1800)
    assert.equal(events.filter(e => e.type === 'end').length, 1)
    assert.deepEqual(sim.step(), [])
  }
})
test('simultaneous lethal attacks yield a draw, without first-attacker advantage', () => {
  const sim = new CombatSimulation(player, ai, 9)
  sim.units.forEach(u => { u.hp = 0 })
  for (const id of [0, 3]) Object.assign(sim.units[id], { hp: 1, x: 240, y: 400 })
  const events = sim.step()
  assert.equal(sim.winner, 'draw')
  assert.equal(events.filter(e => e.type === 'hit').length, 2)
  assert.equal(events.filter(e => e.type === 'death').length, 2)
})
test('defense, critical multiplier and cooldown govern damage', () => {
  const sim = new CombatSimulation(player, ai, 5)
  sim.units.forEach(u => { u.hp = 0 })
  Object.assign(sim.units[0], { hp: 100, x: 240, y: 400 })
  Object.assign(sim.units[3], { hp: 100, x: 240, y: 400 })
  const hits = sim.step().filter(e => e.type === 'hit')
  for (const hit of hits) {
    const a = sim.units[hit.source].definition, d = sim.units[hit.target].definition
    assert.equal(hit.damage, Math.max(1, Math.round((a.attack - d.defense) * (hit.critical ? 1.75 : 1))))
  }
  assert.equal(sim.step().filter(e => e.type === 'hit').length, 0)
})
test('nearest target ties use unit id and dead enemies are ignored', () => {
  const sim = new CombatSimulation(player, ai, 1)
  sim.units.forEach(u => { u.x = 240; u.y = 400 })
  sim.units[3].hp = 0
  const hit = sim.step().find(e => e.type === 'hit' && e.source === 0)
  assert.equal(hit.target, 4)
})
test('90-second limit resolves by remaining health fractions', () => {
  const sim = new CombatSimulation(player, ai, 1)
  sim.tick = 1799
  sim.units[3].hp = 1
  sim.step()
  assert.equal(sim.winner, 'player')
})
test('invalid rosters fail early', () => {
  assert.throws(() => new CombatSimulation(['chicken'], ai, 1))
  assert.throws(() => new CombatSimulation(['chicken', 'chicken', 'frog'], ai, 1))
  assert.throws(() => new CombatSimulation(['chicken', 'unknown', 'frog'], ai, 1))
})
