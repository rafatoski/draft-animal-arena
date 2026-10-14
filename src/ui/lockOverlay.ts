import Phaser from 'phaser'
import { text } from './components'

/** Dark veil, padlock and (optionally) a price pill, centred on its own origin. Sits on top of any card or tile. */
export function lockOverlay(scene: Phaser.Scene, width: number, height: number, radius: number, price?: number) {
  const veil = scene.add.graphics().fillStyle(0x0d0820, .62).fillRoundedRect(-width / 2, -height / 2, width, height, radius)
  const s = Math.min(width, height) / 150 // padlock drawn for a 150px tile
  const lock = scene.add.graphics().setPosition(0, price ? -8 * s : 0)
  lock.lineStyle(9 * s, 0x173f46).strokeCircle(0, -14 * s, 15 * s)       // shackle outline
  lock.lineStyle(5 * s, 0xe9dfff).beginPath().arc(0, -6 * s, 14 * s, Math.PI, 0, false).strokePath()
  lock.fillStyle(0xffd367).fillRoundedRect(-22 * s, -6 * s, 44 * s, 34 * s, 8 * s).lineStyle(4 * s, 0x173f46).strokeRoundedRect(-22 * s, -6 * s, 44 * s, 34 * s, 8 * s)
  lock.fillStyle(0x173f46).fillCircle(0, 8 * s, 5 * s).fillRect(-2 * s, 10 * s, 4 * s, 10 * s)
  const parts: Phaser.GameObjects.GameObject[] = [veil, lock]
  if (price) {
    const pill = scene.add.graphics().fillStyle(0x2b1a55).fillRoundedRect(-34 * s, 30 * s, 68 * s, 24 * s, 12 * s).lineStyle(3 * s, 0xffd367).strokeRoundedRect(-34 * s, 30 * s, 68 * s, 24 * s, 12 * s)
    parts.push(pill)
    if (scene.textures.exists('home-gems')) parts.push(scene.add.image(-16 * s, 42 * s, 'home-gems').setDisplaySize(18 * s, 18 * s))
    parts.push(text(scene, 8 * s, 42 * s, String(price), 15 * s, '#fff4d9').setStroke('#173f46', 3))
  }
  return scene.add.container(0, 0, parts)
}
