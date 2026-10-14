import Phaser from 'phaser'
import { background, heading, text, button, panel, entrance, navigate, PALETTE } from '../ui/components'
import { t, fighterName, fighterRole } from '../services/i18n'
import { FIGHTERS } from '../game/fighters'
import type { FighterDefinition } from '../game/fighters'
import { collectibleCard, preloadCardArt } from '../ui/collectibleCard'
import { cardSlots } from '../ui/cardLayout'
import { audio } from '../services/audio'
import { getProfile, isUnlocked, unlockFighter } from '../services/online'
import { lockOverlay } from '../ui/lockOverlay'
import { ECONOMY } from '../game/economy'

const CARD_WIDTH = 220, GAP = 12, TOP = 140, BOTTOM = 706 // scroll viewport, design pixels (480×840)
export class FightersScene extends Phaser.Scene {
  private content!: Phaser.GameObjects.Container
  private minY = 0
  private dragged = 0
  private details?: Phaser.GameObjects.Container
  private thumb!: Phaser.GameObjects.Graphics
  private thumbH = 0
  constructor() { super('Fighters') }
  preload() { preloadCardArt(this, FIGHTERS) }
  create() {
    this.input.enabled = true; this.details = undefined; this.dragged = 0
    background(this); entrance(this); heading(this, t('fighters'), t('galleryHint'))
    const cardHeight = cardSlots(CARD_WIDTH).height
    this.content = this.add.container(0, 0)
    FIGHTERS.forEach((fighter, i) => {
      const card = collectibleCard(this, fighter, CARD_WIDTH)
      if (!isUnlocked(fighter.id)) card.add(lockOverlay(this, CARD_WIDTH, cardHeight, 22, ECONOMY.unlockPriceDiamonds))
      card.setPosition(240 + (i % 2 ? 1 : -1) * (CARD_WIDTH + GAP) / 2, TOP + 8 + cardHeight / 2 + Math.floor(i / 2) * (cardHeight + GAP))
        .setInteractive({ useHandCursor: true })
      card.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (this.dragged < 8 && !this.details && pointer.worldY > TOP && pointer.worldY < BOTTOM) isUnlocked(fighter.id) ? this.showDetails(fighter) : this.showUnlock(fighter)
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
    this.buildScrollbar(contentBottom)
    button(this, 240, 750, `‹  ${t('back')}`, () => navigate(this, 'Menu'))
  }
  /** Visible scrollbar on the right edge: shows how much is below and can be dragged. Hidden when everything fits. */
  private buildScrollbar(contentBottom: number) {
    if (this.minY === 0) return
    const x = 468, track = BOTTOM - TOP - 8, view = BOTTOM - TOP
    this.add.graphics().fillStyle(0x2b1a55, .9).fillRoundedRect(x - 4, TOP + 4, 8, track, 4).lineStyle(2, 0x173f46).strokeRoundedRect(x - 4, TOP + 4, 8, track, 4)
    this.thumbH = Math.max(40, track * view / (contentBottom - TOP))
    this.thumb = this.add.graphics()
    const drag = this.add.rectangle(x, TOP + 4 + track / 2, 28, track, 0xffffff, 0).setInteractive({ useHandCursor: true, draggable: false })
    const toScroll = (pointerY: number) => {
      const range = track - this.thumbH, ratio = Phaser.Math.Clamp((pointerY - TOP - 4 - this.thumbH / 2) / range, 0, 1)
      this.content.y = this.minY * ratio; this.drawThumb()
    }
    drag.on('pointerdown', (pointer: Phaser.Input.Pointer) => { this.dragged = 99; toScroll(pointer.worldY) })
    drag.on('pointermove', (pointer: Phaser.Input.Pointer) => { if (pointer.isDown) { this.dragged = 99; toScroll(pointer.worldY) } })
    this.drawThumb()
  }
  private drawThumb() {
    if (!this.thumb) return
    const x = 468, track = BOTTOM - TOP - 8, range = track - this.thumbH, ratio = this.minY === 0 ? 0 : this.content.y / this.minY
    const y = TOP + 4 + range * ratio
    this.thumb.clear().fillStyle(0xffd367).fillRoundedRect(x - 4, y, 8, this.thumbH, 4).lineStyle(2, 0x173f46).strokeRoundedRect(x - 4, y, 8, this.thumbH, 4)
  }
  private scrollBy(dy: number) { this.content.y = Phaser.Math.Clamp(this.content.y + dy, this.minY, 0); this.drawThumb() }
  /** Locked fighter: price, balance and the purchase. The server does the real checks; this only asks and reports. */
  private showUnlock(fighter: FighterDefinition) {
    audio.effect('tap')
    const profile = getProfile(), price = ECONOMY.unlockPriceDiamonds
    let note = profile ? '' : t('unlockSignIn'), working = false
    const close = () => { this.details?.destroy(); this.details = undefined }
    const draw = () => {
      this.details?.destroy()
      const dim = this.add.rectangle(240, 420, 480, 840, 0x0d0820, .78).setInteractive()
      dim.on('pointerup', close)
      const parts: Phaser.GameObjects.GameObject[] = [dim, panel(this, 240, 400, 380, 330, 0x4a2c8a),
        text(this, 240, 270, fighterName(fighter.id), 28, '#fff4d9').setStroke('#173f46', 5),
        text(this, 240, 306, `${t('lockedTag')}  •  ${fighterRole(fighter.id)}`, 13, '#d9ccff'),
        text(this, 240, 358, t('unlockPrice', { n: price }), 24, '#ffd367').setStroke('#173f46', 4)]
      if (profile) parts.push(text(this, 240, 392, t('youHave', { n: getProfile()?.diamonds ?? 0 }), 14, '#d9ccff'))
      if (note) parts.push(text(this, 240, 436, note, 14, '#ffb9a8').setWordWrapWidth(320).setLineSpacing(4))
      if (profile) parts.push(button(this, 240, 500, working ? t('working') : t('unlockBtn'), () => void confirm(), { width: 260, color: PALETTE.yellow }))
      parts.push(button(this, 240, profile ? 570 : 500, t('detailsClose'), close, { width: 200, size: 15, color: PALETTE.cream }))
      this.details = this.add.container(0, 0, parts).setDepth(100)
    }
    const confirm = async () => {
      if (working) return
      if ((getProfile()?.diamonds ?? 0) < price) { note = t('needMore', { n: price - (getProfile()?.diamonds ?? 0) }); return draw() }
      working = true; note = ''; draw()
      const result = await unlockFighter(fighter.id)
      working = false
      if (result.ok) { audio.effect('win'); this.scene.restart(); return }
      note = result.reason === 'not-enough' ? t('needMore', { n: result.missing ?? price }) : result.reason === 'signed-out' ? t('unlockSignIn') : t('unlockFailed')
      draw()
    }
    draw()
  }
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
