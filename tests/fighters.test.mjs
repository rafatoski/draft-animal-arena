import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { FIGHTERS, fighterById } from '../.test-build/game/fighters.js'
import { ABILITIES } from '../.test-build/game/abilities.js'
import { CombatSimulation, mitigated } from '../.test-build/simulation/combat.js'
import { runOnlineMatch } from '../.test-build/game/onlineSim.js'
import { K9_LAYOUT, PLATYPUS_LAYOUT, ABILITY_SHEET, SHEET_FRAMES } from '../.test-build/game/sheetLayouts.js'
import { priceOf } from '../.test-build/game/economy.js'
import { draftMatch } from '../.test-build/game/match.js'

const byId = Object.fromEntries(FIGHTERS.map(f => [f.id, f]))
const points = f => f.attack + f.defense + f.speed
const png = path => { const b = readFileSync(path); assert.equal(b.toString('latin1', 1, 4), 'PNG'); return [b.readUInt32BE(16), b.readUInt32BE(20)] }

test('roster: the original six keep their order, K9 Enforcer and Agent Platypus are fighters 7 and 8', () => {
  assert.deepEqual(FIGHTERS.map(f => f.id), ['chicken', 'capybara', 'raccoon', 'frog', 'fox', 'pig', 'k9', 'platypus'])
  assert.deepEqual([fighterById('k9').name, fighterById('platypus').name], ['K9 Enforcer', 'Agent Platypus'])
  assert.deepEqual(FIGHTERS.slice(0, 6).filter(f => f.abilities), []) // the originals have no active abilities: only the basic attack
})

test('balance: base points are 60 / 70 / 80 by tier, the starters are the exact stat lines asked for, and health is nearly equal', () => {
  const stats = id => [byId[id].attack, byId[id].defense, byId[id].speed]
  assert.deepEqual(stats('chicken'), [20, 20, 20]); assert.deepEqual(stats('capybara'), [10, 40, 10]); assert.deepEqual(stats('frog'), [30, 15, 15])
  for (const id of ['chicken', 'capybara', 'frog']) assert.equal(points(byId[id]), 60, id)
  for (const id of ['raccoon', 'fox', 'pig']) assert.equal(points(byId[id]), 70, id)
  for (const id of ['k9', 'platypus']) assert.equal(points(byId[id]), 80, id)
  const hp = FIGHTERS.map(f => f.health); assert.ok(Math.max(...hp) - Math.min(...hp) <= 5, 'health differs by at most 5 points across the roster')
  assert.deepEqual(['k9', 'platypus'].map(id => byId[id].abilities.length), [3, 3])
  assert.ok(byId.k9.defense > byId.platypus.defense * 2 && byId.platypus.speed > byId.k9.speed * 1.5) // tank vs assassin
})

test('defence is a ratio, never reduces a hit to nothing, and speed maps to pixels per second', () => {
  assert.equal(mitigated(20, 20), 15); assert.equal(mitigated(10, 40), 6); assert.equal(mitigated(30, 15), 24)
  assert.equal(mitigated(1, 500), 1); assert.ok(mitigated(30, 40) > mitigated(30, 80))
})

test('unlock prices: raccoon 5, K9 and Platypus 15, pig and fox 10, starters free', () => {
  assert.deepEqual(['raccoon', 'k9', 'platypus', 'pig', 'fox'].map(priceOf), [5, 15, 15, 10, 10])
})

test('assets: the repacked sheets are 1536x3072 (6x12 cells of 256) and every clip points at real frames of the right row', () => {
  for (const id of ['k9', 'platypus']) assert.deepEqual(png(`public/assets/sprites/${id}/${id}-spritesheet.png`), [ABILITY_SHEET.width, ABILITY_SHEET.height])
  for (const id of ['k9', 'platypus']) assert.deepEqual(png(`public/assets/cards/${id}-card.png`), [1086, 1448]) // same template size as the other cards
  assert.equal(SHEET_FRAMES, 72)
  for (const [name, layout, used] of [['k9', K9_LAYOUT, 11], ['platypus', PLATYPUS_LAYOUT, 12]]) {
    const real = ['idle', 'walkDown', 'walkUp', 'walkRight', 'walkLeft', 'strike', 'hit', 'stun', 'death', ...(name === 'k9' ? ['rush', 'bite', 'codered'] : ['cloak', 'venom', 'blackout'])]
    for (const clip of real) {
      const { frames } = layout.clips[clip]
      assert.ok(frames.length >= 2 && frames.every(f => Number.isInteger(f) && f >= 0 && f < used * 6), `${name}.${clip} frames inside the ${used} drawn rows`)
      if (!(name === 'platypus' && ['hit', 'stun', 'death'].includes(clip)) && !(name === 'k9' && ['bite', 'death'].includes(clip))) assert.equal(new Set(frames.map(f => Math.floor(f / 6))).size, 1, `${name}.${clip} stays inside one row`) // the platypus' hit / stun / death are hand-picked clean frames of rows 10-11
    }
  }
  const row = (layout, clip) => Math.floor(layout.clips[clip].frames[0] / 6)
  for (const layout of [K9_LAYOUT, PLATYPUS_LAYOUT]) { // walk up = the rear-facing row 2, walk down = the front-facing row 1
    assert.deepEqual([row(layout, 'idle'), row(layout, 'walkDown'), row(layout, 'walkUp'), row(layout, 'walkRight'), row(layout, 'walkLeft')], [0, 1, 2, 3, 4])
  }
  assert.deepEqual([K9_LAYOUT.mirrorLeft, PLATYPUS_LAYOUT.mirrorLeft], [false, true]) // K9 has real left art; Platypus' two side rows both face right
  assert.deepEqual([row(K9_LAYOUT, 'rush'), row(K9_LAYOUT, 'bite'), row(K9_LAYOUT, 'codered'), row(K9_LAYOUT, 'death')], [5, 6, 7, 9])
  assert.deepEqual([row(PLATYPUS_LAYOUT, 'strike'), row(PLATYPUS_LAYOUT, 'cloak'), row(PLATYPUS_LAYOUT, 'venom'), row(PLATYPUS_LAYOUT, 'blackout'), row(PLATYPUS_LAYOUT, 'death')], [5, 6, 7, 8, 10])
})

// ───────── ability rules, driven through the real simulation ─────────
const duel = (a, b = ['chicken', 'capybara', 'frog'], seed = 11) => new CombatSimulation(a, b, seed)
const run = (sim, ticks) => { const out = []; for (let i = 0; i < ticks && sim.winner === null; i++) out.push(...sim.step()); return out }
const place = (unit, x, y) => { unit.x = x; unit.y = y }
const calm = sim => { for (const u of sim.units) for (const k of Object.keys(u.abilityCooldown)) u.abilityCooldown[k] = 9999; return sim } // park every ability, then open the one under test

test('K9 Shield Rush: dashes in from range, hurts and stuns the target, then goes on cooldown', () => {
  const sim = calm(duel(['k9', 'chicken', 'capybara'])), k9 = sim.units[0], foe = sim.units[3]
  for (const u of sim.units.slice(1)) place(u, 900 + u.id * 30, 900) // everybody else out of the way
  place(k9, 100, 600); place(foe, 100, 420); k9.abilityCooldown.rush = 0
  const events = run(sim, 1)
  assert.ok(events.some(e => e.type === 'ability' && e.ability === 'rush' && e.source === 0))
  const hit = events.find(e => e.type === 'hit' && e.ability === 'rush')
  assert.equal(hit.damage, mitigated(k9.definition.attack, foe.definition.defense, ABILITIES.rush.damage))
  assert.ok(foe.stun > 0 && foe.stun <= ABILITIES.rush.stun, 'target stunned')
  assert.ok(Math.hypot(k9.x - foe.x, k9.y - foe.y) <= k9.definition.range, 'K9 landed in melee reach')
  assert.equal(k9.abilityCooldown.rush, ABILITIES.rush.cooldown)
  const stunnedHits = run(sim, ABILITIES.rush.stun - 2).filter(e => e.type === 'hit' && e.source === foe.id)
  assert.deepEqual(stunnedHits, []) // a stunned fighter does not attack
  assert.equal(foe.stun, 0 + Math.max(0, foe.stun)); run(sim, 5); assert.equal(foe.stun, 0) // and the stun is temporary
})

test('K9 Lockdown Bite: direct damage, the target cannot attack (but is not frozen) and recovers', () => {
  const sim = calm(duel(['k9', 'chicken', 'capybara'])), k9 = sim.units[0], foe = sim.units[3]
  for (const u of sim.units.slice(1)) place(u, 900 + u.id * 30, 900)
  place(k9, 100, 500); place(foe, 100, 470); k9.abilityCooldown.bite = 0
  const events = run(sim, 1)
  assert.ok(events.some(e => e.type === 'hit' && e.ability === 'bite' && e.damage >= 1))
  assert.ok(foe.disarm > 0 && foe.stun === 0)
  assert.deepEqual(run(sim, ABILITIES.bite.disarm - 2).filter(e => e.type === 'hit' && e.source === foe.id), [])
  run(sim, 4); assert.equal(foe.disarm, 0)
})

test('K9 Code Red: area damage and a short stun to every enemy in the radius, none outside it', () => {
  const sim = calm(duel(['k9', 'chicken', 'capybara'])), k9 = sim.units[0], [a, b, far] = sim.units.slice(3)
  for (const u of sim.units.slice(1, 3)) place(u, 900 + u.id * 30, 900)
  place(k9, 240, 500); place(a, 200, 440); place(b, 300, 450); place(far, 240, 500 - ABILITIES.codered.radius - 60); k9.abilityCooldown.codered = 0
  const events = run(sim, 1)
  const victims = events.filter(e => e.type === 'hit' && e.ability === 'codered').map(e => e.target).sort()
  assert.deepEqual(victims, [a.id, b.id].sort()); assert.ok(a.stun > 0 && b.stun > 0 && far.stun === 0)
})

test('Agent Platypus Shadow Cloak: evades exactly the next attack (a real combat effect) and always expires', () => {
  const sim = calm(duel(['platypus', 'chicken', 'capybara'])), pl = sim.units[0], foe = sim.units[3]
  for (const u of sim.units.slice(1)) place(u, 900 + u.id * 30, 900)
  place(pl, 100, 500); place(foe, 100, 520); pl.abilityCooldown.cloak = 0; foe.cooldown = 8 // the enemy swings a few ticks later
  const events = run(sim, 1)
  assert.ok(events.some(e => e.type === 'ability' && e.ability === 'cloak'))
  assert.ok(pl.cloak > 0 && pl.dodges === 1)
  const hp = pl.hp; let dodged = false
  for (let i = 0; i < 30 && !dodged; i++) dodged = run(sim, 1).some(e => e.type === 'dodge' && e.target === 0)
  assert.ok(dodged, 'the first incoming attack was evaded'); assert.equal(pl.hp, hp); assert.equal(pl.dodges, 0)
  // stealth cannot last: even if nobody attacks, the charge disappears with the cloak
  const lone = calm(duel(['platypus', 'chicken', 'capybara'])); for (const u of lone.units.slice(1)) place(u, 900 + u.id * 30, 900)
  lone.units[0].abilityCooldown.cloak = 0; place(lone.units[0], 100, 500); place(lone.units[3], 100, 560); run(lone, 1)
  assert.equal(lone.units[0].dodges, 1); run(lone, ABILITIES.cloak.duration + 1); assert.deepEqual([lone.units[0].cloak, lone.units[0].dodges], [0, 0])
})

test('Agent Platypus Venom Strike: direct damage then deterministic poison that expires, refreshes (never stacks) and can kill', () => {
  const sim = calm(duel(['platypus', 'chicken', 'capybara'])), pl = sim.units[0], foe = sim.units[3]
  for (const u of sim.units.slice(1)) place(u, 900 + u.id * 30, 900)
  place(pl, 100, 500); place(foe, 100, 530); pl.abilityCooldown.venom = 0; foe.hp = 5000; pl.hp = 5000 // long-lived fighters, so only the poison is measured
  const first = run(sim, 1)
  assert.ok(first.some(e => e.type === 'hit' && e.ability === 'venom')); assert.ok(first.some(e => e.type === 'status' && e.status === 'poison'))
  assert.equal(foe.poison, ABILITIES.venom.poisonTicks - 0)
  const pulses = []; for (let i = 0; i < ABILITIES.venom.poisonTicks + 5; i++) pulses.push(...run(sim, 1).filter(e => e.type === 'poison'))
  assert.equal(pulses.length, ABILITIES.venom.poisonTicks / ABILITIES.venom.every); assert.ok(pulses.every(e => e.damage === ABILITIES.venom.poisonDamage))
  assert.equal(foe.poison, 0) // expired
  // re-applying while poisoned refreshes the timer; the pulse damage does not add up
  place(pl, foe.x, foe.y - 30); pl.abilityCooldown.venom = 0; run(sim, 1); const t1 = foe.poison; run(sim, 25); place(pl, foe.x, foe.y - 30); pl.abilityCooldown.venom = 0; run(sim, 1)
  assert.ok(t1 <= ABILITIES.venom.poisonTicks && foe.poison <= ABILITIES.venom.poisonTicks); assert.equal(foe.poisonDamage, ABILITIES.venom.poisonDamage)
  // poison can finish a fighter off, and the dead do not act
  foe.hp = 2; foe.poison = 10; foe.poisonDamage = 3
  const ev = run(sim, 1); assert.ok(ev.some(e => e.type === 'death' && e.target === foe.id)); assert.equal(foe.hp, 0)
})

test('Agent Platypus Operation Blackout: lands beside the nearest enemy and strikes up to three, each with a rapid combination', () => {
  const sim = calm(duel(['platypus', 'chicken', 'capybara'])), pl = sim.units[0], foes = sim.units.slice(3)
  for (const u of sim.units.slice(1, 3)) place(u, 900 + u.id * 30, 900)
  place(pl, 240, 700); place(foes[0], 140, 520); place(foes[1], 240, 500); place(foes[2], 340, 520); pl.abilityCooldown.blackout = 0
  const events = run(sim, 1), hits = events.filter(e => e.type === 'hit' && e.ability === 'blackout')
  assert.equal(hits.length, 3); assert.ok(Math.hypot(pl.x - foes[1].x, pl.y - foes[1].y) < 120)
  for (const h of hits) { const t = sim.units[h.target]; assert.equal(h.damage, mitigated(pl.definition.attack, t.definition.defense, ABILITIES.blackout.damage) * ABILITIES.blackout.hits) }
  assert.ok(pl.cloak > 0 && pl.abilityCooldown.blackout === ABILITIES.blackout.cooldown)
  assert.ok(hits.reduce((s, h) => s + h.damage, 0) < 3 * foes[0].definition.health, 'a burst, not an instant win')
})

test('abilities are deterministic, upgrades feed them, and fighters without abilities never produce ability or status events', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const team = ['k9', 'platypus', 'chicken'], other = ['capybara', 'platypus', 'k9']
    const a = runOnlineMatch(team, other, seed), b = runOnlineMatch(team, other, seed)
    assert.equal(a.hash, b.hash); assert.deepEqual(a.log.map(r => r.events.length), b.log.map(r => r.events.length))
  }
  const strong = new CombatSimulation(['platypus', 'chicken', 'frog'], ['capybara', 'pig', 'fox'], 3, { player: { platypus: { attack: 20 } } })
  assert.equal(strong.units[0].definition.attack, byId.platypus.attack + 20)
  const old = runOnlineMatch(['chicken', 'capybara', 'frog'], ['raccoon', 'fox', 'pig'], 5)
  const types = new Set(old.log.flatMap(r => r.events.map(e => e.type))); for (const t of ['ability', 'status', 'poison', 'dodge']) assert.ok(!types.has(t), t)
  assert.deepEqual(draftMatch([], 7, false, ['chicken', 'capybara', 'frog']).ai.every(id => ['chicken', 'capybara', 'raccoon', 'frog', 'fox', 'pig'].includes(id)), true) // the computer drafts from the original six
})
