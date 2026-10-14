import Phaser from 'phaser'
import './style.css'
import { CONFIG } from './game/config'
import { ArenaScene } from './scenes/ArenaScene'
import { LeaderboardScene } from './scenes/LeaderboardScene'
import { MenuScene } from './scenes/MenuScene'
import { SettingsScene } from './scenes/SettingsScene'
import { FightersScene } from './scenes/FightersScene'
import { ResultsScene } from './scenes/ResultsScene'
import { audio } from './services/audio'
import { loadGameFont } from './ui/typography'
import { homeLayout } from './ui/homeLayout'

const SPLASH_MS = 3000
// Splash logo sits exactly where MenuScene draws its logo, so the fade-out reads as a handoff.
const bootLogo = document.getElementById('boot-logo')
const placeBootLogo = () => {
  const { logo } = homeLayout(window.innerWidth, window.innerHeight)
  Object.assign(bootLogo?.style ?? {}, { left: `${logo.x}px`, top: `${logo.y}px`, width: `${logo.width}px`, height: `${logo.height}px` })
}
placeBootLogo()
window.addEventListener('resize', placeBootLogo)
await loadGameFont()
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: CONFIG.width,
  height: CONFIG.height,
  transparent: true,
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [MenuScene, LeaderboardScene, FightersScene, SettingsScene, ArenaScene, ResultsScene],
  render: { antialias: true, roundPixels: false },
  input: { activePointers: 3 },
})

// Boot splash stays at least SPLASH_MS from page load, then fades out over the game.
const splash = document.getElementById('boot-splash')
setTimeout(() => { splash?.classList.add('hide'); setTimeout(() => { splash?.remove(); window.removeEventListener('resize', placeBootLogo) }, 450) }, Math.max(0, SPLASH_MS - performance.now()))

if (import.meta.hot) import.meta.hot.dispose(() => { game.destroy(true); audio.destroy() })
