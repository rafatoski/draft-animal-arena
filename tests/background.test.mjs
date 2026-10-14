import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { strict as assert } from 'node:assert'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('the shared arcade backdrop uses a CSS gradient and one repeating paw-star tile', () => {
  const css = read('src/style.css')
  assert.match(css, /#app\.arcade-background\s*\{[\s\S]*linear-gradient\([\s\S]*#60409c[\s\S]*#452b78/i)
  assert.match(css, /background-image:\s*url\(['"]?\/assets\/images\/paw-star-pattern\.png['"]?\)/)
  assert.match(css, /background-repeat:\s*repeat/)
  assert.match(css, /background-size:\s*128px 128px/)
  assert.match(css, /opacity:\s*\.1/)
  assert.doesNotMatch(css, /purple-arcade-background/)
})

test('the paw-star pattern remains active on desktop as well as mobile', () => {
  const css = read('src/style.css')
  assert.doesNotMatch(css, /@media[\s\S]*arcade-background::before[\s\S]*display:\s*none/i)
  assert.match(css, /background-repeat:\s*repeat/)
})

test('the optimized transparent pattern tile is present at the public asset path', () => {
  const asset = new URL('../public/assets/images/paw-star-pattern.png', import.meta.url)
  const png = readFileSync(asset)
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
  assert.equal(png.readUInt32BE(16), 128)
  assert.equal(png.readUInt32BE(20), 128)
  assert.equal(existsSync(new URL('../src/assets/purple-arcade-background.png', import.meta.url)), false)
})

test('non-combat scenes select the reusable arcade background', () => {
  for (const scene of ['Splash', 'Menu', 'Fighters', 'Leaderboard', 'Settings', 'Results']) {
    assert.match(read(`src/scenes/${scene}Scene.ts`), /background\(this\)/)
  }
  const component = read('src/ui/arcadeBackground.ts')
  assert.doesNotMatch(component, /scene\.add|load\.image|purple-arcade-background/)
  assert.match(component, /classList\.add\(ARCADE_CLASS\)/)
})

test('Arena explicitly disables the arcade pattern and retains the Colosseum', () => {
  const arena = read('src/scenes/ArenaScene.ts')
  assert.match(arena, /battleBackground\(\)/)
  assert.match(arena, /preloadColosseum\(this\)/)
  assert.match(read('src/ui/arcadeBackground.ts'), /classList\.remove\(ARCADE_CLASS\)/)
})
