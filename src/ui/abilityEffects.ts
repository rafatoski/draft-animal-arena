import Phaser from 'phaser'
import type { AbilityId } from '../game/abilities'
import { ABILITIES } from '../game/abilities'

/** Short, cheap Graphics-based effects (no particle emitters, no textures): readable on mobile and destroyed when done. */
type Point = { x: number; y: number }
const puff = (scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, at: Point, color: number, radius: number, duration: number, alpha = .55) => {
  const dot = scene.add.circle(at.x, at.y, radius, color, alpha).setDepth(850); layer.add(dot)
  scene.tweens.add({ targets: dot, scale: 1.8, alpha: 0, duration, onComplete: () => dot.destroy() })
}
export function abilityEffect(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, ability: AbilityId, from: Point, to: Point[]) {
  const ring = (color: number, radius: number, width = 6) => {
    const g = scene.add.graphics().setDepth(850).setPosition(from.x, from.y); layer.add(g)
    g.lineStyle(width, color, .9).strokeCircle(0, 0, 10); g.setScale(1)
    scene.tweens.add({ targets: g, scale: radius / 10, alpha: 0, duration: 520, ease: 'Cubic.Out', onComplete: () => g.destroy() })
  }
  if (ability === 'codered') { ring(0x7fdcff, ABILITIES.codered.radius); ring(0xffffff, ABILITIES.codered.radius * .7, 3) } // shockwave at the radius that really hurts
  else if (ability === 'rush') {
    const g = scene.add.graphics().setDepth(850); layer.add(g)
    g.lineStyle(10, 0xbfe9ff, .7).lineBetween(from.x, from.y, (to[0] ?? from).x, (to[0] ?? from).y)
    scene.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() }); puff(scene, layer, to[0] ?? from, 0xbfe9ff, 18, 300)
  } else if (ability === 'bite') puff(scene, layer, to[0] ?? from, 0xfff4d9, 14, 240, .8)
  else if (ability === 'cloak') { ring(0xb06bff, 60, 4); puff(scene, layer, from, 0x4de1ff, 26, 480, .35) } // purple / cyan activation glow
  else if (ability === 'venom') for (let i = 0; i < 6; i++) puff(scene, layer, { x: (to[0] ?? from).x + (i - 2.5) * 5, y: (to[0] ?? from).y - 10 - (i % 3) * 6 }, i % 2 ? 0x9dff6a : 0xb06bff, 6, 520, .8)
  else { // blackout: smoke where he vanishes and where he lands, plus a trail between
    for (let i = 0; i < 5; i++) puff(scene, layer, { x: from.x + (i - 2) * 12, y: from.y - (i % 2) * 10 }, 0x2a0d4a, 22, 640, .6)
    const g = scene.add.graphics().setDepth(850); layer.add(g)
    g.lineStyle(8, 0xb06bff, .6).lineBetween(from.x, from.y, (to[0] ?? from).x, (to[0] ?? from).y)
    scene.tweens.add({ targets: g, alpha: 0, duration: 420, onComplete: () => g.destroy() })
    for (const t of to) for (let i = 0; i < 3; i++) puff(scene, layer, { x: t.x + (i - 1) * 8, y: t.y - 6 }, i === 1 ? 0x4de1ff : 0x7a3dd1, 12, 360, .75)
  }
}
