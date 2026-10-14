import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { draftMatch, rematch } from '../.test-build/game/match.js'
import { CombatSimulation } from '../.test-build/simulation/combat.js'
import { dictionaries, t } from '../.test-build/services/i18n.js'
import { parsePreferences, preferences, savePreferences } from '../.test-build/services/preferences.js'

test('rematch preserves both ordered rosters, resets all state, and reproduces combat', () => {
  const match = draftMatch(['chicken', 'frog', 'pig'], 123)
  const original = new CombatSimulation(match.player, match.ai, match.combatSeed)
  while (original.winner === null) original.step()
  const replay = rematch(match)
  assert.deepEqual(replay, match)
  assert.notEqual(replay.player, match.player)
  assert.notEqual(replay.ai, match.ai)
  const fresh = new CombatSimulation(replay.player, replay.ai, replay.combatSeed)
  assert.equal(fresh.tick, 0)
  assert.equal(fresh.winner, null)
  assert.ok(fresh.units.every(u => u.hp === u.definition.health && u.cooldown === 0))
  assert.deepEqual(fresh.units.map(u => u.y), [605, 605, 605, 265, 265, 265])
  while (fresh.winner === null) fresh.step()
  assert.deepEqual(fresh, original)
})
test('fresh drafts retain new choices and generate opponents from their new seeds', () => {
  const first = draftMatch(['chicken', 'frog', 'pig'], 123)
  const second = draftMatch(['capybara', 'fox', 'raccoon'], 456)
  assert.deepEqual(second.player, ['capybara', 'fox', 'raccoon'])
  assert.notDeepEqual(first.ai, second.ai)
  assert.notEqual(first.combatSeed, second.combatSeed)
  for (let n = 0; n <= 3; n++) {
    const setup = draftMatch(first.player.slice(0, n), 789)
    assert.equal(new Set(setup.player).size, 3)
    assert.equal(new Set(setup.ai).size, 3)
    assert.deepEqual(setup.player.slice(0, n), first.player.slice(0, n))
  }
})
test('preferences default safely and validate malformed stored values', () => {
  const defaults = { language: 'en', music: true, sfx: true }
  for (const raw of [null, '{broken', 'null', '{}', '123']) assert.deepEqual(parsePreferences(raw), defaults)
  assert.deepEqual(parsePreferences('{"language":"es","music":false,"sfx":false}'), { language: 'es', music: false, sfx: false })
  assert.deepEqual(parsePreferences('{"language":"xx","music":"no","sfx":1}'), defaults)
})
test('preferences persist and remain usable when browser storage throws', () => {
  let saved
  globalThis.localStorage = { setItem(_key, value) { saved = value } }
  savePreferences({ language: 'es', music: false, sfx: false })
  assert.deepEqual(parsePreferences(saved), preferences)
  globalThis.localStorage = { setItem() { throw new Error('Storage blocked') } }
  assert.doesNotThrow(() => savePreferences({ language: 'en' }))
  assert.equal(preferences.language, 'en')
  delete globalThis.localStorage
})
test('English and Spanish cover every UI key and preserve interpolation tokens', () => {
  assert.deepEqual(Object.keys(dictionaries.en).sort(), Object.keys(dictionaries.es).sort())
  for (const key of Object.keys(dictionaries.en)) {
    assert.ok(dictionaries.es[key].length > 0)
    assert.deepEqual(dictionaries.en[key].match(/\{\w+\}/g), dictionaries.es[key].match(/\{\w+\}/g))
  }
  preferences.language = 'es'
  assert.equal(t('standing', { count: 3 }), 'Siguen en pie: 3')
  preferences.language = 'en'
  assert.equal(t('standing', { count: 3 }), 'Still standing: 3')
})
