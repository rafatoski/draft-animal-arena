import Phaser from 'phaser'
import { background, heading, text, button, iconButton, entrance, navigate, PALETTE } from '../ui/components'
import { t } from '../services/i18n'
import { supabaseConfigured } from '../services/supabase'
import { fetchLeaderboard, getProfile, refreshProfile } from '../services/online'
import type { LeaderEntry } from '../services/online'

const PAGE = 10
/** Real global ranking from the `leaderboard` view. Nothing here is invented: empty means empty. */
export class LeaderboardScene extends Phaser.Scene {
  private rows!: Phaser.GameObjects.Container
  private page = 0
  private token = 0
  private prev!: ReturnType<typeof iconButton>
  private next!: ReturnType<typeof iconButton>
  constructor() { super('Leaderboard') }
  create() {
    this.input.enabled = true; this.page = 0
    background(this); entrance(this); heading(this, t('leaderboard'), t('lbHead'))
    this.rows = this.add.container(0, 0)
    this.prev = iconButton(this, 168, 712, 'prev', t('lbPrev'), () => this.go(-1), { width: 70, height: 48 })
    iconButton(this, 240, 712, 'refresh', t('lbRefresh'), () => this.fetchPage(), { width: 70, height: 48, color: PALETTE.yellow })
    this.next = iconButton(this, 312, 712, 'next', t('lbNext'), () => this.go(1), { width: 70, height: 48 })
    this.prev.setEnabled(false); this.next.setEnabled(false)
    button(this, 240, 780, `‹  ${t('back')}`, () => navigate(this, 'Menu'), { color: PALETTE.cream, width: 280 })
    void refreshProfile().finally(() => this.fetchPage())
  }
  private go(step: number) { this.page = Math.max(0, this.page + step); this.fetchPage() }
  private async fetchPage(): Promise<void> {
    const mine = ++this.token
    this.show([], t('lbLoading')); this.prev.setEnabled(false); this.next.setEnabled(false)
    if (!supabaseConfigured) return this.show([], t('onlineOff'))
    const { rows, error } = await fetchLeaderboard(this.page * PAGE, PAGE)
    if (mine !== this.token || !this.sys.isActive()) return
    if (error) { this.prev.setEnabled(this.page > 0); return this.show([], t('lbError')) }
    if (!rows.length && this.page > 0) { this.page--; return this.fetchPage() }
    this.show(rows, rows.length ? '' : t('lbEmpty'))
    this.prev.setEnabled(this.page > 0); this.next.setEnabled(rows.length === PAGE) // a full page may have a successor
  }
  private show(rows: LeaderEntry[], note: string) {
    this.rows.removeAll(true)
    const me = getProfile()?.id
    rows.forEach((r, i) => {
      const y = 160 + i * 54, mineRow = r.playerId === me
      const bg = this.add.graphics().fillStyle(mineRow ? 0xffd367 : 0x4a2c8a, mineRow ? 1 : .85).fillRoundedRect(24, y - 22, 432, 46, 14)
        .lineStyle(3, mineRow ? 0x173f46 : 0x2b1a55).strokeRoundedRect(24, y - 22, 432, 46, 14)
      const ink = mineRow ? '#173f46' : '#fff4d9'
      const name = text(this, 76, y, mineRow ? `${r.player}  (${t('lbYou')})` : r.player, 17, ink).setOrigin(0, .5)
      if (name.width > 170) name.setScale(170 / name.width)
      this.rows.add([bg, text(this, 52, y, String(r.position), 20, ink), name,
        text(this, 292, y, String(r.wins), 19, ink), text(this, 346, y, String(r.losses), 19, ink), text(this, 416, y, `${r.winRate}%`, 17, ink)])
    })
    if (note) this.rows.add(text(this, 240, 360, note, 18, '#fff4d9').setWordWrapWidth(380).setLineSpacing(8))
  }
}
