import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { CombatSimulation, mitigated } from '../.test-build/simulation/combat.js'
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
    assert.equal(hit.damage, mitigated(a.attack, d.defense, hit.critical ? 1.75 : 1))
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
test('hype boost: one per team, 2 s + 2 s recharge, same input log replays identically', () => {
  const sim = new CombatSimulation(player, ai, 7)
  assert.equal(sim.boost(0), true)
  assert.equal(sim.boost(1), false, 'a teammate is already boosted')
  assert.equal(sim.boost(3), true, 'the other team has its own slot')
  for (let i = 0; i < 40; i++) sim.step()
  assert.equal(sim.units[0].boost, 0)
  assert.equal(sim.boost(0), false, 'still recharging')
  assert.equal(sim.boost(1), true)
  for (let i = 0; i < 40; i++) sim.step()
  assert.equal(sim.boost(0), true, 'recharged 2 s after the boost ended')
  const replay = new CombatSimulation(player, ai, 7)
  for (let tick = 1; replay.tick < sim.tick; tick++) {
    for (const input of sim.inputs) if (input.tick === replay.tick + 1) replay.boost(input.unit)
    replay.step()
  }
  assert.deepEqual(replay.units.map(u => [u.x, u.y, u.hp]), sim.units.map(u => [u.x, u.y, u.hp]))
})
test('boosted fighter deals 25% more damage', () => {
  const hits = (boosted) => {
    const sim = new CombatSimulation(player, ai, 3)
    if (boosted) for (const id of [0, 3]) sim.boost(id)
    let first
    while (!first && sim.winner === null) first = sim.step().find(e => e.type === 'hit' && !e.critical && !e.ability)
    return first
  }
  assert.ok(hits(true).damage > hits(false).damage)
})
test('lockstep: two clients with delayed, reordered, duplicated messages stay identical to each other and to the server replay', async () => {
  const { Lockstep, INPUT_DELAY } = await import('../.test-build/game/lockstep.js')
  const { runOnlineMatch } = await import('../.test-build/game/onlineSim.js')
  const mk = () => new CombatSimulation(player, ai, 99)
  const a = { sim: mk(), lock: new Lockstep([3, 4, 5]), units: [0, 1, 2] }, b = { sim: mk(), lock: new Lockstep([0, 1, 2]), units: [3, 4, 5] }
  const wire = [] // [deliverAtTick, to, message]
  const rng = new SeededRandom(5)
  const send = (now, from, to) => { const m = JSON.parse(JSON.stringify(from.lock.message(0, from.sim.tick))); for (let k = 0; k < 1 + (rng.next() < .3); k++) wire.push([now + Math.floor(rng.next() * 4), to, m]) }
  let guard = 0
  while ((a.sim.winner === null || b.sim.winner === null) && guard++ < 20000) {
    for (let i = wire.length - 1; i >= 0; i--) if (wire[i][0] <= guard / 2) { wire[i][1].lock.receive(wire[i][2]); wire.splice(i, 1) }
    for (const [me, other] of [[a, b], [b, a]]) {
      if (me.sim.winner !== null) continue
      if (rng.next() < .04) { const unit = me.units[Math.floor(rng.next() * 3)]; if (me.sim.canBoost(unit) && me.lock.pendingUnit(me.sim.tick) === undefined) me.lock.schedule(me.sim.tick, unit) }
      const next = me.sim.tick + 1
      if (!me.lock.ready(0, next)) { send(guard / 2, me, other); continue }
      for (const unit of me.lock.due(0, next)) me.sim.boost(unit)
      me.sim.step(); send(guard / 2, me, other)
    }
  }
  assert.equal(a.sim.winner, b.sim.winner); assert.notEqual(a.sim.winner, null)
  assert.deepEqual(a.sim.units.map(u => [u.x, u.y, u.hp]), b.sim.units.map(u => [u.x, u.y, u.hp]))
  assert.ok(a.sim.inputs.length > 3, 'presses actually happened')
  const presses = a.sim.inputs.map(i => ({ attempt: 0, ...i }))
  assert.deepEqual(presses.sort((x, y) => x.tick - y.tick || x.unit - y.unit), b.sim.inputs.map(i => ({ attempt: 0, ...i })).sort((x, y) => x.tick - y.tick || x.unit - y.unit))
  // the server replay (round 1 only, same seed) reaches the same first-round verdict
  const replay = new CombatSimulation(player, ai, 99); let next = 0
  const sorted = presses
  while (replay.winner === null) { while (next < sorted.length && sorted[next].tick <= replay.tick + 1) { if (sorted[next].tick === replay.tick + 1) replay.boost(sorted[next].unit); next++ } replay.step() }
  assert.equal(replay.winner, a.sim.winner); assert.deepEqual(replay.units.map(u => u.hp), a.sim.units.map(u => u.hp))
  assert.ok(INPUT_DELAY >= 2)
  assert.equal(typeof runOnlineMatch, 'function')
})
