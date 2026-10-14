import { readFileSync, statSync } from 'node:fs'
import { test } from 'node:test'
import { strict as assert } from 'node:assert'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('the local Lilita One asset is bundled and game startup awaits its loader', () => {
  const font = new URL('../src/assets/lilita-one-regular.ttf', import.meta.url)
  assert.ok(statSync(font).size > 20_000)
  assert.match(read('src/main.ts'), /await loadGameFont\(\)/)
  assert.match(read('src/ui/typography.ts'), /ÁÉÍÓÚÜÑáéíóúüñ¡¿/)
})

test('all Phaser text entry points use the shared Lilita One font family', () => {
  const components = read('src/ui/components.ts')
  const arena = read('src/scenes/ArenaScene.ts')
  assert.match(components, /fontFamily: GAME_FONT_FAMILY/)
  assert.match(arena, /fontFamily: GAME_FONT_FAMILY/)

  const phaserSources = [components, arena]
  assert.equal(phaserSources.some(source => /fontFamily:\s*['"](?:Trebuchet|Arial|Verdana)/.test(source)), false)
})

test('HTML and CSS use Lilita One with a system fallback', () => {
  const css = read('src/style.css')
  assert.match(css, /@font-face[\s\S]*font-family:\s*'Lilita One'/)
  assert.match(css, /font-family:\s*'Lilita One',\s*'Trebuchet MS',\s*Arial,\s*sans-serif/)
  assert.match(css, /font-display:\s*swap/)
})

test('typography has no text shadows, glow, or blur effects', () => {
  const css = read('src/style.css')
  const phaserSources = [
    read('src/ui/components.ts'),
    read('src/scenes/ArenaScene.ts'),
    read('src/scenes/ResultsScene.ts'),
    read('src/scenes/SettingsScene.ts'),
  ].join('\n')

  assert.doesNotMatch(css, /text-shadow\s*:/i)
  assert.doesNotMatch(phaserSources, /\.setShadow\s*\(|\b(?:preFX|postFX)\b[^\n]*(?:glow|blur)/i)
  assert.match(phaserSources, /\.setStroke\s*\(/)
})
