import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { homeButtonLayout, homeLayout } from '../.test-build/ui/homeLayout.js'
import { loadPlayer } from '../.test-build/services/player.js'
import { arenaLayout, COMBAT_FRAME } from '../.test-build/rendering/layout.js'
for (const [w, h] of [[320,568], [375,667], [390,844], [430,932], [844,390], [1366,768], [1920,1080]]) {
  test(`${w}×${h}: top HUD, logo, illustration, and four navigation buttons do not overlap`, () => {
    const { topHud, nav, logo, illustration } = homeLayout(w, h)
    const hud = [topHud.settings, topHud.coins, topHud.gems]
    for (const item of hud) assert.ok(item.x - item.width / 2 >= 0 && item.x + item.width / 2 <= w)
    assert.ok(topHud.settings.x + topHud.settings.width / 2 < topHud.coins.x - topHud.coins.width / 2)
    assert.ok(topHud.coins.x + topHud.coins.width / 2 < topHud.gems.x - topHud.gems.width / 2)
    assert.ok(logo.y - logo.height / 2 > Math.max(...hud.map(item => item.y + item.height / 2)))
    assert.ok(logo.y + logo.height / 2 < illustration.y - illustration.height / 2)
    assert.ok(illustration.y + illustration.height / 2 < nav.y - nav.height / 2)
    assert.ok(nav.y + nav.height / 2 < h)
    assert.ok(nav.x - nav.width / 2 >= 0 && nav.x + nav.width / 2 <= w)
    const buttons = homeButtonLayout(nav.width, nav.height)
    assert.deepEqual(buttons.map(button => button.id), ['fighters', 'practice', 'ranking', 'play'])
    for (const button of buttons) assert.ok(button.width >= 44 && button.height >= 44)
    for (let i = 1; i < buttons.length; i++) {
      const previous = buttons[i - 1], current = buttons[i]
      assert.ok(previous.x + previous.width / 2 < current.x - current.width / 2)
    }
    assert.ok(Math.abs(buttons[3].width / buttons[0].width - 1.55) < 1e-9)
    assert.ok(Math.abs(buttons[3].height / buttons[0].height - 1.3) < 1e-9)
    assert.ok(illustration.height > 0)
    const battle = arenaLayout(w, h)
    assert.deepEqual(battle.viewport, { x: 0, y: 0, width: w, height: h })
    const effectsTop = h / 2 + (COMBAT_FRAME.y - battle.centerY) * battle.zoom
    assert.ok(effectsTop >= battle.header - 1e-7)
  })
}
test('home actions retain existing routes and Practice reuses a fresh Arena match', () => {
  const menu = readFileSync(new URL('../src/scenes/MenuScene.ts', import.meta.url), 'utf8')
  assert.match(menu, /id === 'fighters'[^\n]*navigate\(this, 'Fighters'\)/)
  assert.match(menu, /id === 'practice'[^\n]*navigate\(this, 'Arena', \{ fresh: true, practice: true \}\)/)
  assert.match(menu, /id === 'ranking'[^\n]*navigate\(this, 'Leaderboard'\)/)
  assert.match(menu, /id === 'play'[^\n]*navigate\(this, 'Arena'\)/)
  assert.doesNotMatch(menu, /multiplayer/i)
})
test('home uses the exact supplied icons and renders Play as outlined text only', () => {
  const expected = {
    'src/assets/home-fighters.png': 'd9f63606669200412b7db70abe9d8731809c090876b49c7f2097bc75d4fb72b2',
    'src/assets/home-practice.png': 'ae0696b3af95655273bbe1f519624a349181e6bd7bda61d014373be966a33f2a',
    'src/assets/home-ranking.png': '9fa7406e63d3aaca77b78be7924b1517457e758659347b9f6c9ab4da4c9093c5',
  }
  for (const [path, hash] of Object.entries(expected)) {
    assert.equal(createHash('sha256').update(readFileSync(new URL(`../${path}`, import.meta.url))).digest('hex'), hash)
  }
  const navigation = readFileSync(new URL('../src/ui/homeNavigation.ts', import.meta.url), 'utf8')
  assert.match(navigation, /id === 'play' \? undefined : homeIcon\(scene, id\)/)
  assert.match(navigation, /t\('play'\), 24, '#ffffff'\)\.setStroke\('#120d1d', 6\)/)
  assert.match(navigation, /const label = id === 'play'/)
})
test('local player HUD uses honest defaults and validates saved values', () => {
  globalThis.localStorage = { getItem() { return null } }
  assert.deepEqual(loadPlayer(), { name: null, coins: 0 })
  globalThis.localStorage = { getItem() { return '{"name":"Rafa","coins":125}' } }
  assert.deepEqual(loadPlayer(), { name: 'Rafa', coins: 125 })
  globalThis.localStorage = { getItem() { return '{"name":1,"coins":-4}' } }
  assert.deepEqual(loadPlayer(), { name: null, coins: 0 })
  globalThis.localStorage = { getItem() { throw new Error('blocked') } }
  assert.deepEqual(loadPlayer(), { name: null, coins: 0 })
  delete globalThis.localStorage
})
