import Phaser from 'phaser'
import { arcadeBackground } from './arcadeBackground'
import { LOGO_TEXTURE } from '../game/assets'
import { fitPortraitScene } from '../rendering/responsive'
import { audio } from '../services/audio'
import { t, fighterName, fighterRole } from '../services/i18n'
import { animalArt } from '../game/animalArt'
import type { FighterDefinition } from '../game/fighters'
import { GAME_FONT_FAMILY } from './typography'
export const PALETTE = { ink: 0x173f46, cream: 0xfff4d9, mint: 0xb9ee96, coral: 0xff8c79, teal: 0x227b79, yellow: 0xffd367, muted: '#597773' }
export function text(scene: Phaser.Scene, x: number, y: number, value: string, size = 18, color = '#173f46') {
  return scene.add.text(x, y, value, { fontFamily: GAME_FONT_FAMILY, fontSize: size, color, fontStyle: 'bold', align: 'center' }).setOrigin(.5)
}
export function panel(scene: Phaser.Scene, x: number, y: number, width: number, height: number, color: number = PALETTE.cream) {
  const g = scene.add.graphics().setPosition(x, y)
  g.fillStyle(0x102f38, .3).fillRoundedRect(-width / 2, -height / 2 + 7, width, height, 22)
  g.fillStyle(color).fillRoundedRect(-width / 2, -height / 2, width, height, 22)
  g.lineStyle(3, PALETTE.ink).strokeRoundedRect(-width / 2, -height / 2, width, height, 22)
  g.lineStyle(2, 0xffffff, .35).strokeRoundedRect(-width / 2 + 6, -height / 2 + 6, width - 12, height - 12, 17)
  return g
}
export function button(scene: Phaser.Scene, x: number, y: number, title: string, action: () => void, options: { width?: number; color?: number; size?: number } = {}) {
  const width = options.width ?? 356
  const root = scene.add.container(x, y)
  const face = panel(scene, 0, 0, width, 58, options.color ?? PALETTE.mint)
  const label = text(scene, 0, -1, title, options.size ?? 20)
  if (label.width > width - 30) label.setScale((width - 30) / label.width)
  root.add([face, label]).setSize(width, 58).setInteractive({ useHandCursor: true })
  let pressed = false, busy = false
  root.on('pointerover', () => { if (!busy) scene.tweens.add({ targets: root, scale: 1.025, duration: 120 }) })
  root.on('pointerout', () => { pressed = false; if (!busy) scene.tweens.add({ targets: root, scale: 1, duration: 100 }) })
  root.on('pointerdown', () => { if (busy) return; pressed = true; audio.unlock(); root.setScale(.96) })
  root.on('pointerup', () => {
    if (!pressed || busy) return
    busy = true; pressed = false; audio.effect('tap')
    scene.tweens.add({ targets: root, scale: 1, duration: 110, ease: 'Back.Out', onComplete: () => { busy = false; action() } })
  })
  return root
}
export type IconGlyph = 'refresh' | 'prev' | 'next'
/** Icon-only button, same face, height and press feel as `button`. `label` is the tooltip / accessible name (shown as the canvas title on hover). */
export function iconButton(scene: Phaser.Scene, x: number, y: number, glyph: IconGlyph, label: string, action: () => void, options: { width?: number; height?: number; color?: number } = {}) {
  const width = options.width ?? 96, height = options.height ?? 58, ink = PALETTE.ink
  const g = scene.add.graphics().lineStyle(6, ink).fillStyle(ink)
  if (glyph === 'prev' || glyph === 'next') {
    const d = glyph === 'prev' ? -1 : 1
    g.lineBetween(-12 * d, 0, 12 * d, 0).beginPath().moveTo(1 * d, -13).lineTo(13 * d, 0).lineTo(1 * d, 13).strokePath()
  } else {
    g.beginPath().arc(0, 0, 13, Phaser.Math.DegToRad(-40), Phaser.Math.DegToRad(250), false).strokePath()
    g.fillTriangle(5, -22, 5, -4, 21, -13) // arrow head at the open end of the circle
  }
  g.setScale(height / 58)
  const root = scene.add.container(x, y)
  root.add([panel(scene, 0, 0, width, height, options.color ?? PALETTE.mint), g]).setSize(width, height).setInteractive({ useHandCursor: true })
  let pressed = false, busy = false, enabled = true
  const canvas = scene.game.canvas
  root.on('pointerover', () => { canvas.title = label; if (enabled && !busy) scene.tweens.add({ targets: root, scale: 1.025, duration: 120 }) })
  root.on('pointerout', () => { canvas.title = ''; pressed = false; if (!busy) scene.tweens.add({ targets: root, scale: 1, duration: 100 }) })
  root.on('pointerdown', () => { if (!enabled || busy) return; pressed = true; audio.unlock(); root.setScale(.96) })
  root.on('pointerup', () => {
    if (!pressed || !enabled || busy) return
    busy = true; pressed = false; audio.effect('tap')
    scene.tweens.add({ targets: root, scale: 1, duration: 110, ease: 'Back.Out', onComplete: () => { busy = false; action() } })
  })
  scene.events.once('shutdown', () => { canvas.title = '' })
  return Object.assign(root, { label, setEnabled(on: boolean) { enabled = on; root.setAlpha(on ? 1 : .4); if (root.input) root.input.cursor = on ? 'pointer' : 'default'; return root } })
}
export function background(_scene: Phaser.Scene) { arcadeBackground() }
export function entrance(scene: Phaser.Scene) {
  if (scene.scene.key !== 'Arena') fitPortraitScene(scene)
  scene.cameras.main.fadeIn(200, ...(scene.scene.key === 'Arena' ? [27, 16, 48] as const : [83, 66, 142] as const))
}
export function navigate(scene: Phaser.Scene, key: string, data: object = {}) {
  if (scene.cameras.main.fadeEffect.isRunning) return
  scene.input.enabled = false
  scene.cameras.main.once('camerafadeoutcomplete', () => scene.scene.start(key, data))
  scene.cameras.main.fadeOut(160, ...(scene.scene.key === 'Arena' ? [27, 16, 48] as const : [83, 66, 142] as const))
}
/** Black bands above y=`top` and below y=`bottom` (design pixels), extending past the screen edges. */
export function blackFrame(scene: Phaser.Scene, top: number, bottom: number) {
  return scene.add.graphics().setDepth(900).fillStyle(0x000000).fillRect(-4000, -4000, 8480, 4000 + top).fillRect(-4000, bottom, 8480, 4000)
}
export function heading(scene: Phaser.Scene, title: string, subtitle: string) {
  text(scene, 240, 66, title, 31, '#fff4d9').setStroke('#173f46', 5)
  text(scene, 240, 108, subtitle, 14, '#d7f4d9')
}
/** Uniform scaling only: preserve the original pixels, aspect ratio, and alpha. */
export function logo(scene: Phaser.Scene, x: number, y: number, maxWidth = 420, maxHeight = 300) {
  const image = scene.add.image(x, y, LOGO_TEXTURE).setOrigin(.5)
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height)
  image.setScale(scale * .96).setAlpha(0)
  scene.tweens.add({ targets: image, scale, alpha: 1, duration: 650, ease: 'Sine.Out' })
  return image
}
export function fighterCard(scene: Phaser.Scene, fighter: FighterDefinition, x: number, y: number, index: number) {
  const root = scene.add.container(x, y)
  const face = panel(scene, 0, 0, 206, 157)
  const badge = scene.add.circle(0, -33, 37, fighter.color, .4)
  const art = animalArt(scene, fighter).setPosition(0, -30).setScale(.68)
  const name = text(scene, 0, 14, fighterName(fighter.id), 15)
  if (name.width > 188) name.setScale(188 / name.width)
  const role = text(scene, 0, 34, fighterRole(fighter.id), 9, '#43766c')
  const stats = text(scene, 0, 58, `${t('hp')} ${fighter.health}  ${t('atk')} ${fighter.attack}  ${t('def')} ${fighter.defense}\n${t('spd')} ${fighter.speed}   ${t('crit')} ${Math.round(fighter.crit * 100)}%`, 11, '#597773').setLineSpacing(3)
  const marker = text(scene, -83, -59, String(index + 1), 12, '#597773')
  const check = text(scene, 80, -59, '✓', 20, '#237b59').setVisible(false)
  root.add([face, badge, art, name, role, stats, marker, check])
  return { root, selected(value: boolean) {
    face.clear()
    face.fillStyle(0x102f38, .25).fillRoundedRect(-103, -71, 206, 157, 20)
    face.fillStyle(value ? 0xd4f5aa : PALETTE.cream).fillRoundedRect(-103, -78.5, 206, 157, 20)
    face.lineStyle(value ? 4 : 3, value ? 0x3bb66d : PALETTE.ink).strokeRoundedRect(-103, -78.5, 206, 157, 20)
    check.setVisible(value)
  } }
}
