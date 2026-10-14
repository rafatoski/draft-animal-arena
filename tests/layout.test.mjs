import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { arenaLayout, portraitLayout, COLOSSEUM, COMBAT_FRAME } from '../.test-build/rendering/layout.js'
import { CombatSimulation } from '../.test-build/simulation/combat.js'
import { BACKGROUND_ART, BACKGROUND_PLACEMENT, PLAYABLE_BOUNDS, sourceToWorld } from '../.test-build/rendering/battlefield.js'
import { FIGHTERS } from '../.test-build/game/fighters.js'
import { draftMatch } from '../.test-build/game/match.js'

const sizes = [[320, 568], [375, 667], [390, 844], [430, 932], [768, 1024], [844, 390], [1024, 768], [1366, 768], [1920, 1080], [2560, 1080]]
const epsilon = 1e-7
function screen(layout, x, y) {
  const v = layout.viewport
  return { x: v.x + v.width / 2 + (x - layout.centerX) * layout.zoom,
    y: v.y + v.height / 2 + (y - layout.centerY) * layout.zoom }
}
function assertInside(layout, x, y) {
  const p = screen(layout, x, y), v = layout.viewport
  assert.ok(p.x >= v.x - epsilon && p.x <= v.x + v.width + epsilon, `x ${x} outside viewport`)
  assert.ok(p.y >= v.y - epsilon && p.y <= v.y + v.height + epsilon, `y ${y} outside viewport`)
}
for (const [width, height] of sizes) test(`${width}×${height}: battle framing, uniform scale, and all draft controls fit`, () => {
  const layout = arenaLayout(width, height)
  const target = width > height ? COLOSSEUM : COMBAT_FRAME
  assert.equal(layout.landscape, width > height)
  assert.ok(layout.viewport.height / height > .65)
  assertInside(layout, target.x, target.y)
  assertInside(layout, target.x + target.width, target.y + target.height)
  // The arena's original gameplay rectangle is never cropped.
  assertInside(layout, 48, 205)
  assertInside(layout, 432, 665)
  const a = screen(layout, 240, 440), b = screen(layout, 340, 540)
  assert.ok(Math.abs((b.x - a.x) - (b.y - a.y)) < epsilon)
  const menu = portraitLayout(width, height)
  assert.ok(menu.x >= -epsilon && menu.y >= -epsilon)
  assert.ok(menu.x + menu.width <= width + epsilon)
  assert.ok(menu.y + menu.height <= height + epsilon)
  // Last row of draft cards and home button fit their unchanged design positions.
  for (const [x, y] of [[26, 223], [454, 708], [120, 800], [360, 800]]) {
    const sx = menu.x + x * menu.zoom, sy = menu.y + y * menu.zoom
    assert.ok(sx >= 0 && sx <= width && sy >= 0 && sy <= height)
  }
})
test('rotation mid-combat changes only the camera; units and complete effects stay visible', () => {
  for (let seed = 0; seed < 20; seed++) {
    const match = draftMatch([], seed)
    const sim = new CombatSimulation(match.player, match.ai, match.combatSeed)
    while (sim.winner === null) {
      sim.step()
      const [width, height] = sizes[sim.tick % sizes.length]
      const before = JSON.stringify(sim)
      const layout = arenaLayout(width, height)
      assert.equal(JSON.stringify(sim), before)
      for (const unit of sim.units) {
        // Includes body, health bar, staff, death rotation, and maximum floating-text rise.
        assertInside(layout, unit.x - 70, unit.y - 125)
        assertInside(layout, unit.x + 70, unit.y + 55)
      }
    }
  }
})
test('portrait fills the available width with the immediate stone rim, not the full image', () => {
  for (const [w, h] of sizes.filter(([w, h]) => w < h)) {
    const layout = arenaLayout(w, h)
    const left = screen(layout, sourceToWorld(BACKGROUND_ART.rim.left, 0).x, 435)
    const right = screen(layout, sourceToWorld(BACKGROUND_ART.rim.right, 0).x, 435)
    assert.ok(Math.abs(left.x - layout.viewport.x) < epsilon)
    assert.ok(Math.abs(right.x - layout.viewport.x - layout.viewport.width) < epsilon)
    assert.ok(Math.abs((left.x + right.x) / 2 - w / 2) < epsilon)
    // All phone portrait cases use full width; squat tablets may need safety gutters.
    if (w <= 430) assert.ok(Math.abs(layout.viewport.width - w) < epsilon)
    const sandWidth = (BACKGROUND_ART.sand.right - BACKGROUND_ART.sand.left) * BACKGROUND_ART.scale * layout.zoom
    assert.ok(sandWidth / layout.viewport.width > .87)
    const oldZoom = Math.min(w / 480, (h - layout.header - layout.footer) / COLOSSEUM.height)
    assert.ok(layout.zoom > oldZoom)
    assertInside(layout, 48, 205)
    assertInside(layout, 432, 665)
    assert.ok(screen(layout, COLOSSEUM.x, 440).x < layout.viewport.x)
  }
})

test('the fixed playable rectangle fits inside the original sandy floor without distorting the image', () => {
  const { sand } = BACKGROUND_ART
  const topLeft = sourceToWorld(sand.left, sand.top)
  const bottomRight = sourceToWorld(sand.right, sand.bottom)
  assert.deepEqual(PLAYABLE_BOUNDS, { left: 48, right: 432, top: 205, bottom: 665 })
  assert.ok(PLAYABLE_BOUNDS.left >= topLeft.x && PLAYABLE_BOUNDS.right <= bottomRight.x)
  assert.ok(PLAYABLE_BOUNDS.top >= topLeft.y && PLAYABLE_BOUNDS.bottom <= bottomRight.y)
  assert.ok(Math.abs(BACKGROUND_PLACEMENT.width / BACKGROUND_PLACEMENT.height - 1672 / 941) < epsilon)
  assert.deepEqual(sourceToWorld(836, 485), { x: 240, y: 435 })
})
test('all 400 distinct team pairings stay inside the fixed battlefield, including visual extents', () => {
  const rosters = []
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 5; b++) for (let c = b + 1; c < 6; c++) {
    rosters.push([FIGHTERS[a].id, FIGHTERS[b].id, FIGHTERS[c].id])
  }
  let seed = 0
  for (const player of rosters) for (const ai of rosters) {
    const sim = new CombatSimulation(player, ai, seed++)
    while (sim.winner === null) {
      for (const unit of sim.units) {
        // Bodies/staff and rotated knockout sprites fit; overhead health bars fit too.
        assert.ok(unit.x - 50 >= PLAYABLE_BOUNDS.left)
        assert.ok(unit.x + 50 <= PLAYABLE_BOUNDS.right)
        assert.ok(unit.y - 60 >= PLAYABLE_BOUNDS.top)
        assert.ok(unit.y + 55 <= PLAYABLE_BOUNDS.bottom)
      }
      sim.step()
    }
  }
  assert.equal(seed, 400)
})
