import Phaser from 'phaser'
import './style.css'
import { ArenaScene } from './scenes/ArenaScene'
import { LeaderboardScene } from './scenes/LeaderboardScene'
import { MenuScene } from './scenes/MenuScene'
import { SettingsScene } from './scenes/SettingsScene'
import { FightersScene } from './scenes/FightersScene'
import { ResultsScene } from './scenes/ResultsScene'
import { AccountScene } from './scenes/AccountScene'
import { LobbyScene } from './scenes/LobbyScene'
import { audio } from './services/audio'
import { loadGameFont } from './ui/typography'
import { startOnlineProfile } from './services/online'
import { homeLayout } from './ui/homeLayout'
import { DPR, TEXT_RESOLUTION } from './rendering/pixelRatio'

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
// Every Text is created through this factory: give it a real resolution (Phaser defaults to 1, which blurs under camera zoom).
const textFactory = Phaser.GameObjects.GameObjectFactory.prototype
const makeText = textFactory.text
textFactory.text = function (this: Phaser.GameObjects.GameObjectFactory, x: number, y: number, value: string | string[], style?: Phaser.Types.GameObjects.Text.TextStyle) {
  return makeText.call(this, x, y, value, { resolution: TEXT_RESOLUTION, ...style })
}
const appElement = document.getElementById('app')!
const cssSize = () => ({ width: Math.max(1, Math.round(appElement.clientWidth * DPR)), height: Math.max(1, Math.round(appElement.clientHeight * DPR)) })
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  transparent: true,
  // Device-pixel canvas shown at CSS size: zoom 1/DPR. Resizes are forwarded below.
  scale: { mode: Phaser.Scale.NONE, ...cssSize(), zoom: 1 / DPR },
  scene: [MenuScene, LeaderboardScene, FightersScene, SettingsScene, ArenaScene, ResultsScene, AccountScene, LobbyScene],
  render: { antialias: true, roundPixels: false },
  input: { activePointers: 3 },
})

// Boot splash stays at least SPLASH_MS from page load, then fades out over the game.
const splash = document.getElementById('boot-splash')
setTimeout(() => { splash?.classList.add('hide'); setTimeout(() => { splash?.remove(); window.removeEventListener('resize', placeBootLogo) }, 450) }, Math.max(0, SPLASH_MS - performance.now()))

startOnlineProfile() // restores a saved session's profile in the background; never blocks or breaks offline play
// Dev only, fire-and-forget: a failed or missing Supabase never affects the game.
if (import.meta.env.DEV) void import('./services/supabaseDiagnostic').then(m => m.runSupabaseDiagnostic()).then(r => console.info('[supabase]', r)).catch(() => {})

new ResizeObserver(() => { const { width, height } = cssSize(); if (width !== game.scale.width || height !== game.scale.height) game.scale.resize(width, height) }).observe(appElement)

if (import.meta.hot) import.meta.hot.dispose(() => { game.destroy(true); audio.destroy() })
