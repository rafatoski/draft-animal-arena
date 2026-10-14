import Phaser from 'phaser'
import { HOME_ASSETS } from '../game/homeAssets'
import type { HomeAction, HomeIcon } from '../game/homeAssets'
import { t } from '../services/i18n'
import type { TextKey } from '../services/i18n'
import { audio } from '../services/audio'
import { text } from './components'
import { HOME_ACTIONS, homeButtonLayout } from './homeLayout'

/** A 32×32 icon slot. Configure HOME_ASSETS to replace any fallback with a PNG/WebP. */
export function homeIcon(scene: Phaser.Scene, id: HomeIcon) {
  const root = scene.add.container(0, 0).setSize(32, 32)
  const asset = HOME_ASSETS.icons[id]
  if (scene.textures.exists(asset.key)) {
    const image = scene.add.image(0, 0, asset.key)
    image.setScale(Math.min(32 / image.width, 32 / image.height))
    return root.add(image)
  }

  const dark = 0xfff4d9
  const g = scene.add.graphics().lineStyle(2.5, dark, 1).fillStyle(dark, 1)
  if (id === 'fighters') {
    g.fillEllipse(0, 8, 22, 16)
    for (const [x, y] of [[-12, -5], [-5, -12], [6, -12], [13, -4]]) g.fillCircle(x!, y!, 4)
  }
  if (id === 'practice') {
    g.strokeCircle(0, 1, 13).lineBetween(-10, 11, 10, -11).lineBetween(-12, -8, 12, 8)
    g.fillTriangle(7, -13, 14, -15, 12, -8).fillTriangle(9, 13, 15, 14, 12, 7)
  }
  if (id === 'ranking') {
    g.strokeRoundedRect(-11, -13, 22, 19, 4).strokeCircle(-13, -5, 7).strokeCircle(13, -5, 7)
      .lineBetween(0, 6, 0, 14).lineBetween(-9, 15, 9, 15)
  }
  if (id === 'settings') {
    g.strokeCircle(0, 0, 10).strokeCircle(0, 0, 3)
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4
      g.lineBetween(Math.cos(angle) * 10, Math.sin(angle) * 10, Math.cos(angle) * 15, Math.sin(angle) * 15)
    }
  }
  if (id === 'coin') {
    g.fillStyle(0xd38b2d).fillCircle(0, 2, 13).fillStyle(0xffd367).fillCircle(0, 0, 13)
      .lineStyle(2, 0xfff0b1).strokeCircle(0, 0, 9).lineStyle(3, 0xbf7c27).lineBetween(0, -5, 0, 5)
  }
  if (id === 'gems') {
    g.fillStyle(0x72dcff).fillTriangle(0, 15, -14, -5, 14, -5).fillTriangle(-14, -5, -7, -14, 7, -14)
      .fillTriangle(-14, -5, 7, -14, 14, -5).lineStyle(2, 0xe8fbff).lineBetween(-7, -12, 0, 12).lineBetween(7, -12, 0, 12)
  }
  return root.add(g)
}

const CAPTIONS: Record<'fighters' | 'practice' | 'ranking', TextKey> = { fighters: 'navFighters', practice: 'practice', ranking: 'ranking' }
export function homeNavigation(scene: Phaser.Scene, onSelect: (id: HomeAction) => void) {
  const root = scene.add.container(0, 0)
  const items = HOME_ACTIONS.map(id => {
    const item = scene.add.container(0, 0)
    const face = scene.add.graphics()
    const glyph = id === 'play' ? undefined : homeIcon(scene, id)
    const label = id === 'play' ? text(scene, 0, 0, t('play'), 24, '#ffffff').setStroke('#120d1d', 6) : undefined
    item.add(face)
    if (glyph) item.add(glyph)
    if (label) item.add(label)
    root.add(item)
    // Caption sits above the button, outside its hit area, so it can never touch the button or its neighbours.
    const caption = id === 'play' ? undefined : text(scene, 0, 0, t(CAPTIONS[id]), 12, '#fff4d9').setStroke('#173f46', 4)
    if (caption) root.add(caption)
    let pressed = false
    item.setInteractive(new Phaser.Geom.Rectangle(0, 0, 60, 80), Phaser.Geom.Rectangle.Contains)
    item.input!.cursor = 'pointer'
    item.on('pointerover', () => { if (!pressed) item.setScale(1.025) })
    item.on('pointerout', () => { pressed = false; item.setScale(1) })
    item.on('pointerdown', () => { pressed = true; audio.unlock(); item.setScale(.95) })
    item.on('pointerup', () => {
      if (!pressed) return
      pressed = false; item.setScale(1); audio.effect('tap'); onSelect(id)
    })
    return { id, item, face, glyph, label, caption }
  })

  return { root, resize(x: number, y: number, width: number, height: number) {
    root.setPosition(x, y)
    const layout = homeButtonLayout(width, height)
    items.forEach(({ id, item, face, glyph, label, caption }) => {
      const box = layout.find(value => value.id === id)!
      const play = id === 'play', border = play ? 4 : 3, radius = play ? 16 : 13
      item.setPosition(box.x, box.y).setSize(box.width, box.height)
      face.clear()
        .fillStyle(play ? 0x6c4418 : 0x291a4d, .9).fillRoundedRect(-box.width / 2, -box.height / 2 + (play ? 7 : 5), box.width, box.height, radius)
        .fillStyle(play ? 0xffd367 : 0x6743a4).fillRoundedRect(-box.width / 2, -box.height / 2, box.width, box.height, radius)
        .lineStyle(border, 0x21163d).strokeRoundedRect(-box.width / 2, -box.height / 2, box.width, box.height, radius)
        .lineStyle(1.5, play ? 0xfff1a8 : 0xbda0e8, .75)
        .strokeRoundedRect(-box.width / 2 + 6, -box.height / 2 + 6, box.width - 12, box.height - 12, radius - 5)
      const iconSize = Math.min(76, box.width - 8, box.height - 8)
      glyph?.setPosition(0, 0).setScale(iconSize / 32)
      label?.setPosition(0, 0).setScale(1).setFontSize(Math.min(30, Math.max(22, box.width * .25)))
      if (label && label.width > box.width - 16) label.setScale((box.width - 16) / label.width)
      if (caption) {
        caption.setScale(1).setPosition(box.x, box.y - box.height / 2 - 10)
        if (caption.width > box.width) caption.setScale(box.width / caption.width)
      }
      if (item.input) (item.input.hitArea as Phaser.Geom.Rectangle)
        .setTo(0, 0, box.width, box.height) // ponytail: container hit areas are top-left based, not centered
    })
  } }
}
