import Phaser from 'phaser'
import type { FighterDefinition } from '../game/fighters'
import { animalArt } from '../game/animalArt'
import { fighterName } from '../services/i18n'
import { text } from './components'
import { cardKey } from './collectibleCard'
import { CARD_REFERENCE, illustrationCrop } from './cardLayout'
import { lockOverlay } from './lockOverlay'
import { isUnlocked } from '../services/online'

const RES = 2.4 // canvas pixels per design pixel; sharp up to a ~2.4x camera zoom
const INK = 0x173f46, GLOW = 0xffd367
interface Look { normal: Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Alpha; muted?: Phaser.GameObjects.Image }

/**
 * Rounded portrait cut from the middle of the fighter's collectible card, plus a desaturated, darkened copy.
 * Built once per fighter on a canvas; the original card textures are only read, never changed.
 */
function portraitTextures(scene: Phaser.Scene, fighter: FighterDefinition, width: number, height: number) {
  const normalKey = `mini-${fighter.id}-${width}x${height}`, mutedKey = `${normalKey}-muted`
  if (!scene.textures.exists(normalKey)) {
    const card = scene.textures.get(cardKey(fighter.id)).getSourceImage() as HTMLImageElement
    const k = card.width / CARD_REFERENCE.width, crop = illustrationCrop(width / height)
    const w = Math.round(width * RES), h = Math.round(height * RES)
    const normal = scene.textures.createCanvas(normalKey, w, h)!, ctx = normal.getContext()
    ctx.beginPath(); ctx.roundRect(0, 0, w, h, 16 * RES); ctx.clip()
    ctx.drawImage(card, crop.x * k, crop.y * k, crop.width * k, crop.height * k, 0, 0, w, h)
    normal.refresh()
    const muted = scene.textures.createCanvas(mutedKey, w, h)!, mctx = muted.getContext()
    const pixels = ctx.getImageData(0, 0, w, h), d = pixels.data
    for (let i = 0; i < d.length; i += 4) {
      const gray = d[i]! * .299 + d[i + 1]! * .587 + d[i + 2]! * .114
      d[i] = (d[i]! * .35 + gray * .65) * .72; d[i + 1] = (d[i + 1]! * .35 + gray * .65) * .72; d[i + 2] = (d[i + 2]! * .35 + gray * .65) * .72
    }
    mctx.putImageData(pixels, 0, 0); muted.refresh()
  }
  return { normalKey, mutedKey }
}

/**
 * Compact selectable tile for the pre-battle draft: the fighter's portrait, a small name and a state.
 * Selected = bright, larger, thick gold border and glow, check badge. Unselected = muted, smaller, thin neutral border.
 * Selection itself stays owned by the caller; this only draws it.
 */
export function miniFighterCard(scene: Phaser.Scene, fighter: FighterDefinition, width: number, height: number, index: number) {
  const labelH = 30, totalH = height + labelH, artY = -(totalH - height) / 2
  const root = scene.add.container(0, 0).setSize(width, totalH)
  const glow = scene.add.graphics(), frame = scene.add.graphics()
  let look: Look
  if (scene.textures.exists(cardKey(fighter.id))) {
    const { normalKey, mutedKey } = portraitTextures(scene, fighter, width, height)
    look = { normal: scene.add.image(0, artY, normalKey).setDisplaySize(width, height), muted: scene.add.image(0, artY, mutedKey).setDisplaySize(width, height) }
  } else { // no illustrated card yet: coloured tile with the procedural portrait
    const bg = scene.add.graphics().fillStyle(fighter.color, .75).fillRoundedRect(-width / 2, artY - height / 2, width, height, 16)
    look = { normal: scene.add.container(0, 0, [bg, animalArt(scene, fighter).setPosition(0, artY).setScale(1.5)]) as unknown as Look['normal'] }
  }
  const dim = scene.add.graphics().fillStyle(0x0d2a30, .32).fillRoundedRect(-width / 2, artY - height / 2, width, height, 16)
  const name = text(scene, 0, totalH / 2 - 12, fighterName(fighter.id), 13, '#fff4d9').setStroke('#173f46', 4)
  if (name.width > width) name.setScale(width / name.width)
  const badge = scene.add.container(width / 2 - 8, artY - height / 2 + 8, [
    scene.add.circle(0, 0, 14, 0x3bb66d).setStrokeStyle(3, INK), text(scene, 0, 0, '✓', 17, '#ffffff')]).setScale(0)
  const key = text(scene, -width / 2 + 14, artY - height / 2 + 14, String(index + 1), 11, '#fff4d9').setStroke('#173f46', 3)
  const locked = !isUnlocked(fighter.id)
  root.add([glow, frame, look.normal, ...(look.muted ? [look.muted] : []), dim, name, key, badge])
  if (locked) root.add(lockOverlay(scene, width, height, 16).setPosition(0, artY))

  const rect = (g: Phaser.GameObjects.Graphics, grow: number) => g.fillRoundedRect(-width / 2 - grow, artY - height / 2 - grow, width + grow * 2, height + grow * 2, 16 + grow)
  const draw = (on: boolean) => {
    glow.clear(); frame.clear()
    if (on) {
      rect(glow.fillStyle(GLOW, .22), 10); rect(glow.fillStyle(GLOW, .3), 6)
      frame.lineStyle(9, INK).strokeRoundedRect(-width / 2 - 1, artY - height / 2 - 1, width + 2, height + 2, 17)
        .lineStyle(5, GLOW).strokeRoundedRect(-width / 2, artY - height / 2, width, height, 16)
    } else frame.lineStyle(2, 0x9bb8b2, .7).strokeRoundedRect(-width / 2, artY - height / 2, width, height, 16)
  }
  const apply = (on: boolean, animate: boolean) => {
    if (locked) on = false // a locked fighter can never look selected
    draw(on)
    const to = { scale: on ? 1.08 : .93 }, fade = look.muted ? { normal: on ? 1 : 0, muted: on ? 0 : .6, dim: on ? 0 : look.muted ? 0 : 1 } : { normal: on ? 1 : .6, muted: 0, dim: on ? 0 : 1 }
    scene.tweens.killTweensOf([root, look.normal, look.muted, dim, badge, name].filter(Boolean))
    const set = (o: object, props: object) => animate ? scene.tweens.add({ targets: o, ...props, duration: 180, ease: 'Sine.Out' }) : Object.assign(o, props)
    set(root, to); if (!animate) root.setScale(to.scale)
    if (animate) {
      scene.tweens.add({ targets: look.normal, alpha: fade.normal, duration: 180 }); if (look.muted) scene.tweens.add({ targets: look.muted, alpha: fade.muted, duration: 180 })
      scene.tweens.add({ targets: dim, alpha: fade.dim, duration: 180 }); scene.tweens.add({ targets: badge, scale: on ? 1 : 0, duration: 180, ease: on ? 'Back.Out' : 'Sine.In' })
      scene.tweens.add({ targets: name, alpha: on ? 1 : .6, duration: 180 })
    } else {
      look.normal.setAlpha(fade.normal); look.muted?.setAlpha(fade.muted); dim.setAlpha(fade.dim); badge.setScale(on ? 1 : 0); name.setAlpha(on ? 1 : .6)
    }
    root.setDepth(on ? 2 : 1) // a scaled-up selected tile draws over its neighbours
  }
  apply(false, false)
  return { root, locked, selected: (on: boolean) => apply(on, true) }
}
