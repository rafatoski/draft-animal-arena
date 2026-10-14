import Phaser from 'phaser'
import type { FighterDefinition } from '../game/fighters'
import { animalArt } from '../game/animalArt'
import { fighterName, t } from '../services/i18n'
import { PALETTE, text } from './components'
import { cardSlots } from './cardLayout'

/**
 * Optional illustrated card art lives at public/assets/cards/<fighter id>-card.png (same template as chicken-card.png).
 * The glob only lists which files exist at build time, so adding a PNG switches that fighter from the fallback
 * frame to its illustration with no code change, and missing files are never requested.
 */
const available = new Set(Object.keys(import.meta.glob('/public/assets/cards/*-card.png', { query: '?url', import: 'default' }))
  .map(path => path.split('/').pop()!.replace('-card.png', '')))
export const cardKey = (id: string) => `card-${id}`
export function preloadCardArt(scene: Phaser.Scene, fighters: readonly FighterDefinition[]) {
  for (const { id } of fighters) {
    if (available.has(id) && !scene.textures.exists(cardKey(id))) scene.load.image(cardKey(id), `${import.meta.env.BASE_URL}assets/cards/${id}-card.png`)
  }
}

const INK = '#173f46'
/** Reusable card, centred on its own origin. Name and stats are read from the fighter definition on creation. */
export function collectibleCard(scene: Phaser.Scene, fighter: FighterDefinition, width: number) {
  const slots = cardSlots(width), root = scene.add.container(0, 0).setSize(width, slots.height)
  if (scene.textures.exists(cardKey(fighter.id))) {
    root.add(scene.add.image(0, 0, cardKey(fighter.id)).setDisplaySize(width, slots.height))
  } else root.add(fallbackFrame(scene, fighter, slots, width))
  const fit = (label: Phaser.GameObjects.Text, max: number) => { if (label.width > max) label.setScale(max / label.width); return label }
  const k = slots.scale
  root.add(fit(text(scene, 0, slots.name.y + slots.name.height / 2, fighterName(fighter.id), 138 * k * .72, INK), slots.nameMaxWidth))
  const stats = [[t('attackLabel'), fighter.attack], [t('defenseLabel'), fighter.defense], [t('speedLabel'), fighter.speed]] as const
  stats.forEach(([label, value], i) => {
    const slot = slots.stats[i]!, cx = slot.x + slot.width / 2
    root.add([fit(text(scene, cx, slot.y + slot.height * .3, label, 45 * k, '#8a5a1f'), slot.width * .86),
      text(scene, cx, slot.y + slot.height * .68, String(value), 82 * k, INK)])
  })
  return root
}

/** Same silhouette and slot positions as the illustrated template, using the existing procedural portrait. */
function fallbackFrame(scene: Phaser.Scene, fighter: FighterDefinition, slots: ReturnType<typeof cardSlots>, width: number) {
  const g = scene.add.graphics(), w = width, h = slots.height
  const slot = (r: { x: number; y: number; width: number; height: number }, radius: number) => {
    g.fillStyle(0xfff4d9).fillRoundedRect(r.x, r.y, r.width, r.height, radius).lineStyle(3, 0xf0b52f).strokeRoundedRect(r.x, r.y, r.width, r.height, radius)
  }
  g.fillStyle(0x102f38, .3).fillRoundedRect(-w / 2 + 4, -h / 2 + 8, w - 8, h - 8, 26)
  g.fillStyle(0x6a3fb5).fillRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 26).lineStyle(5, 0xf0b52f).strokeRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 26)
  const a = slots.art
  g.fillStyle(fighter.color, .55).fillRoundedRect(a.x, a.y, a.width, a.height, 14).lineStyle(4, 0xf0b52f).strokeRoundedRect(a.x, a.y, a.width, a.height, 14)
  slot(slots.name, 14); for (const s of slots.stats) slot(s, 12)
  g.lineStyle(3, PALETTE.ink).strokeRoundedRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2, 28)
  const portrait = animalArt(scene, fighter).setPosition(a.x + a.width / 2, a.y + a.height / 2 + 10).setScale(width / 220 * 1.15)
  return scene.add.container(0, 0, [g, portrait])
}
