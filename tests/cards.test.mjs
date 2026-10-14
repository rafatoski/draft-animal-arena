import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { cardSlots, illustrationCrop, CARD_REFERENCE } from '../.test-build/ui/cardLayout.js'

const inside = (r, w, h) => r.x >= -w / 2 && r.y >= -h / 2 && r.x + r.width <= w / 2 && r.y + r.height <= h / 2
const disjoint = (a, b) => a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y
for (const width of [180, 220, 543, 1086]) test(`${width}px card: name and three stat slots sit inside the card, apart from each other and the art`, () => {
  const s = cardSlots(width), height = width * CARD_REFERENCE.height / CARD_REFERENCE.width
  assert.ok(Math.abs(s.height - height) < 1e-9)
  for (const r of [s.name, s.art, ...s.stats]) assert.ok(inside(r, width, height))
  assert.equal(s.stats.length, 3)
  for (const stat of s.stats) { assert.ok(disjoint(stat, s.art)); assert.ok(disjoint(stat, s.name)) }
  assert.ok(disjoint(s.name, s.art) && disjoint(s.stats[0], s.stats[1]) && disjoint(s.stats[1], s.stats[2]))
  assert.ok(s.nameMaxWidth < s.name.width)
})
test('card text comes from the fighter definition, not hard-coded numbers', () => {
  const source = readFileSync(new URL('../src/ui/collectibleCard.ts', import.meta.url), 'utf8')
  for (const field of ['fighter.attack', 'fighter.defense', 'fighter.speed']) assert.ok(source.includes(field))
  assert.doesNotMatch(source, /String\(\d+\)|, \d{2,3}\]/)
})

for (const aspect of [.7, .87, 1]) test(`mini-card crop at aspect ${aspect} keeps only the central illustration`, () => {
  const c = illustrationCrop(aspect), s = cardSlots(CARD_REFERENCE.width), k = CARD_REFERENCE.width / 2, cy = CARD_REFERENCE.height / 2
  assert.ok(Math.abs(c.width / c.height - aspect) < 1e-9 || c.width < c.height * aspect) // never wider than the art window allows
  assert.ok(c.x >= s.art.x + k && c.x + c.width <= s.art.x + s.art.width + k)
  assert.ok(c.y >= s.art.y + cy && c.y + c.height <= s.art.y + s.art.height + cy)
  for (const r of [s.name, ...s.stats]) { const top = r.y + cy, bottom = top + r.height; assert.ok(c.y + c.height <= top || c.y >= bottom) }
})
