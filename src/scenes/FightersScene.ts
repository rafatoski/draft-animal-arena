import Phaser from 'phaser'
import { background, heading, text, button, panel, entrance, navigate, PALETTE } from '../ui/components'
import { t, fighterName, fighterRole } from '../services/i18n'
import { FIGHTERS } from '../game/fighters'
import type { FighterDefinition } from '../game/fighters'
import { collectibleCard, preloadCardArt } from '../ui/collectibleCard'
import { cardSlots } from '../ui/cardLayout'
import { audio } from '../services/audio'
import { getProfile, isUnlocked, unlockFighter, upgradeFighter } from '../services/online'
import { homeIcon } from '../ui/homeNavigation'
import { UPGRADE, UPGRADE_STATS, noLevels, upgradeCost, upgradedStat } from '../game/upgrades'
import type { UpgradeStat } from '../game/upgrades'
import type { TextKey } from '../services/i18n'
import { lockOverlay } from '../ui/lockOverlay'
import { priceOf } from '../game/economy'

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
      if (!isUnlocked(fighter.id)) card.add(lockOverlay(this, CARD_WIDTH, cardHeight, 22, priceOf(fighter.id)))
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
    const profile = getProfile(), price = priceOf(fighter.id)
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
  /** Detail view with the permanent upgrades. Prices and the purchase belong to the server; this shows what it says and asks. */
  private showDetails(fighter: FighterDefinition) {
    audio.effect('tap')
    let note = '', noteColor = '#ffb9a8', working = false
    const close = () => { this.details?.destroy(); this.details = undefined }
    const draw = () => {
      this.details?.destroy()
      const profile = getProfile(), levels = profile?.upgrades[fighter.id] ?? noLevels(), coins = profile?.coins ?? 0
      const dim = this.add.rectangle(240, 420, 480, 840, 0x102f38, .72).setInteractive()
      dim.on('pointerup', close)
      const parts: Phaser.GameObjects.GameObject[] = [dim, panel(this, 240, 410, 420, 600, 0x4a2c8a),
        text(this, 240, 138, fighterName(fighter.id), 28, '#fff4d9').setStroke('#173f46', 5),
        text(this, 240, 170, `${fighterRole(fighter.id)}  •  ${t('hp')} ${fighter.health}  •  ${t('crit')} ${Math.round(fighter.crit * 100)}%`, 12, '#d9ccff')]
      if (profile) {
        const balance = text(this, 250, 204, `${t('yourCoins')}: ${coins}`, 17, '#ffd367').setStroke('#173f46', 4)
        parts.push(balance, homeIcon(this, 'coin').setScale(.7).setPosition(250 - balance.width / 2 - 20, 204))
      } else parts.push(text(this, 240, 204, t('upgradeSignIn'), 13, '#ffb9a8').setWordWrapWidth(380))
      UPGRADE_STATS.forEach((stat, i) => {
        const y = 290 + i * 118, base = fighter[stat], level = levels[stat], maxed = level >= UPGRADE.maxLevel, cost = upgradeCost(level)
        const can = !!profile && !maxed && coins >= cost && !working
        parts.push(panel(this, 240, y, 390, 104, 0x3a2270),
          text(this, 62, y - 30, t(`${stat}Label` as TextKey), 15, '#d9ccff').setOrigin(0, .5),
          text(this, 62, y, maxed ? String(upgradedStat(base, level)) : `${upgradedStat(base, level)} → ${upgradedStat(base, level + 1)}`, 26, '#fff4d9').setOrigin(0, .5).setStroke('#173f46', 4),
          text(this, 62, y + 32, t('upgradeLv', { n: level }), 12, '#d9ccff').setOrigin(0, .5))
        if (!maxed) {
          const price = text(this, 345, y - 36, String(cost), 17, coins >= cost ? '#ffd367' : '#ff8c79').setStroke('#173f46', 4)
          parts.push(price, homeIcon(this, 'coin').setScale(.55).setPosition(345 - price.width / 2 - 16, y - 36))
        }
        const buy = button(this, 345, y + 8, maxed ? t('upgradeMax') : t('upgradeBtn'), () => void upgrade(stat, level), { width: 124, size: 17, color: can ? PALETTE.mint : 0xd7dbcf })
        buy.setAlpha(can || maxed ? 1 : .5); parts.push(buy)
      })
      if (note) parts.push(text(this, 240, 618, note, 14, noteColor).setWordWrapWidth(380))
      parts.push(button(this, 240, 668, t('detailsClose'), close, { width: 220, size: 17, color: PALETTE.yellow }))
      this.details = this.add.container(0, 0, parts).setDepth(100)
    }
    const upgrade = async (stat: UpgradeStat, level: number) => {
      const profile = getProfile()
      if (working) return
      if (!profile) { note = t('upgradeSignIn'); noteColor = '#ffb9a8'; return draw() }
      const cost = upgradeCost(level)
      if (profile.coins < cost) { note = t('upgradeNeed', { n: cost - profile.coins }); noteColor = '#ffb9a8'; return draw() }
      working = true; note = t('working'); noteColor = '#d9ccff'; draw()
      const result = await upgradeFighter(fighter.id, stat, level) // the server prices it and checks everything again
      working = false
      if (result.ok) { audio.effect('win'); note = t('upgradeDone', { stat: t(`${stat}Label` as TextKey) }); noteColor = '#b9ee96' }
      else { noteColor = '#ffb9a8'; note = result.reason === 'not-enough' ? t('upgradeNeed', { n: result.missing ?? cost }) : result.reason === 'changed' ? t('upgradeChanged') : result.reason === 'signed-out' ? t('upgradeSignIn') : t('upgradeFailed') }
      draw()
    }
    draw()
    this.details!.setAlpha(0); this.tweens.add({ targets: this.details, alpha: 1, duration: 140 })
  }
}
