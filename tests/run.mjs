import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
const output = new URL('../.test-build/', import.meta.url)
try {
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--ignoreConfig', '--outDir', '.test-build', '--noEmit', 'false', '--allowImportingTsExtensions', 'false', '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'es2023', '--types', 'vite/client', '--skipLibCheck', 'src/simulation/combat.ts', 'src/game/match.ts', 'src/services/i18n.ts', 'src/rendering/layout.ts', 'src/ui/homeLayout.ts', 'src/services/player.ts', 'src/game/series.ts', 'src/ui/cardLayout.ts'], { stdio: 'inherit' })
  // Add Node ESM file extensions to temporary compiled output only.
  for (const path of readdirSync(output, { recursive: true })) {
    if (!path.endsWith('.js')) continue
    const file = new URL(path, output)
    writeFileSync(file, readFileSync(file, 'utf8').replace(/from '(\.[^']+)'/g, "from '$1.js'"))
  }
  execFileSync(process.execPath, ['--test', 'tests/combat.test.mjs', 'tests/experience.test.mjs', 'tests/layout.test.mjs', 'tests/home.test.mjs', 'tests/background.test.mjs', 'tests/typography.test.mjs', 'tests/series.test.mjs', 'tests/cards.test.mjs'], { stdio: 'inherit' })
} finally { rmSync(output, { recursive: true, force: true }) }
