import Phaser from 'phaser'
import { background, heading, text, button, panel, entrance, navigate, PALETTE } from '../ui/components'
import { t, fighterName, fighterRole } from '../services/i18n'
import { FIGHTERS } from '../game/fighters'
import type { FighterDefinition } from '../game/fighters'
import { collectibleCard, preloadCardArt } from '../ui/collectibleCard'
import { cardSlots } from '../ui/cardLayout'
import { audio } from '../services/audio'

const CARD_WIDTH = 220, GAP = 12, TOP = 140, BOTTOM = 706 // scroll viewport, design pixels (480×840)
export class FightersScene extends Phaser.Scene {
  private content!: Phaser.GameObjects.Container
  private minY = 0
  private dragged = 0
  private details?: Phaser.GameObjects.Container
  constructor() { super('Fighters') }
  preload() { preloadCardArt(this, FIGHTERS) }
  create() {
    this.input.enabled = true; this.details = undefined; this.dragged = 0
    background(this); entrance(this); heading(this, t('fighters'), t('galleryHint'))
    const cardHeight = cardSlots(CARD_WIDTH).height
    this.content = this.add.container(0, 0)
    FIGHTERS.forEach((fighter, i) => {
      const card = collectibleCard(this, fighter, CARD_WIDTH)
      card.setPosition(240 + (i % 2 ? 1 : -1) * (CARD_WIDTH + GAP) / 2, TOP + 8 + cardHeight / 2 + Math.floor(i / 2) * (cardHeight + GAP))
        .setInteractive({ useHandCursor: true })
      card.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (this.dragged < 8 && !this.details && pointer.worldY > TOP && pointer.worldY < BOTTOM) this.showDetails(fighter)
      })
      this.content.add(card)
    })
    const rows = Math.ceil(FIGHTERS.length / 2), contentBottom = TOP + 8 + rows * cardHeight + (rows - 1) * GAP + 8
    this.minY = Math.min(0, BOTTOM - contentBottom)
    // The viewport clips the scrolling cards; title and back button stay fixed.
    const clip = this.make.graphics({}, false).fillRect(0, TOP, 480, BOTTOM - TOP)
    this.content.setMask(clip.createGeometryMask())
    this.input.on('pointerdown', () => { this.dragged = 0 })
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || this.details) return
      const dy = (pointer.y - pointer.prevPosition.y) / this.cameras.main.zoom
      this.dragged += Math.abs(dy); this.scrollBy(dy)
    })
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => { if (!this.details) this.scrollBy(-dy / this.cameras.main.zoom) })
    button(this, 240, 750, `‹  ${t('back')}`, () => navigate(this, 'Menu'))
  }
  private scrollBy(dy: number) { this.content.y = Phaser.Math.Clamp(this.content.y + dy, this.minY, 0) }
  /** Health, crit, role and the rest stay reachable here instead of crowding the card. */
  private showDetails(fighter: FighterDefinition) {
    audio.effect('tap')
    const close = () => { this.details?.destroy(); this.details = undefined }
    const dim = this.add.rectangle(240, 420, 480, 840, 0x102f38, .72).setInteractive()
    dim.on('pointerup', close)
    const rows: [string, string | number][] = [[t('hp'), fighter.health], [t('atk'), fighter.attack], [t('def'), fighter.defense],
      [t('spd'), fighter.speed], [t('crit'), `${Math.round(fighter.crit * 100)}%`]]
    const view = this.add.container(0, 0, [dim, panel(this, 240, 400, 380, 400),
      text(this, 240, 240, fighterName(fighter.id), 30), text(this, 240, 282, fighterRole(fighter.id), 14, '#43766c'),
      ...rows.flatMap(([label, value], i) => [text(this, 150, 342 + i * 40, label, 20, '#597773').setOrigin(0, .5),
        text(this, 330, 342 + i * 40, String(value), 22).setOrigin(1, .5)]),
      button(this, 240, 576, t('detailsClose'), close, { width: 220, color: PALETTE.yellow })]).setDepth(100)
    this.details = view
    view.setAlpha(0); this.tweens.add({ targets: view, alpha: 1, duration: 140 })
  }
}
