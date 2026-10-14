import Phaser from 'phaser'
import { background, heading, text, button, entrance, navigate, PALETTE } from '../ui/components'
import { t } from '../services/i18n'
import { quickMatch, cancelQuickMatch } from '../services/online'

const POLL_MS = 2000, TIMEOUT_S = 60
/** Searching for a real opponent. Polls the server queue; the server pairs two distinct players atomically. */
export class QuickMatchScene extends Phaser.Scene {
  private timer?: Phaser.Time.TimerEvent
  private matched = false
  constructor() { super('Quick') }
  create() {
    this.input.enabled = true; this.matched = false
    background(this); entrance(this); heading(this, t('quickMatch'), t('searchHint'))
    this.events.once('shutdown', () => { this.timer?.remove(); if (!this.matched) void cancelQuickMatch() }) // leaving the line is always cleaned up
    this.search()
  }
  private search() {
    const spinner = this.add.graphics().setPosition(240, 330)
    spinner.lineStyle(10, PALETTE.yellow).beginPath().arc(0, 0, 44, 0, Math.PI * 1.5).strokePath()
    this.tweens.add({ targets: spinner, angle: 360, duration: 1100, repeat: -1 })
    const title = text(this, 240, 450, t('searching'), 24, '#fff4d9').setStroke('#173f46', 5)
    const clock = text(this, 240, 495, '0s', 16, '#d9ccff')
    const cancel = button(this, 240, 600, t('cancelSearch'), () => navigate(this, 'Online'), { color: 0xffb9a8 })
    let seconds = 0, polling = false
    const poll = async () => {
      if (polling || this.matched) return
      polling = true
      const result = await quickMatch()
      polling = false
      if (!this.sys.isActive() || this.matched) return
      if (result.ok && result.value.state === 'matched') {
        this.matched = true; this.timer?.remove(); spinner.destroy(); cancel.destroy(); clock.destroy()
        title.setText(t('opponentFound')).setColor('#ffd367')
        const roomId = result.value.room.id
        this.time.delayedCall(1100, () => navigate(this, 'Lobby', { roomId }))
      } else if (!result.ok) { this.fail(t(/sign in/i.test(result.message) ? 'googleNeeded' : 'errGeneric'), spinner, title, clock, cancel) }
    }
    this.timer = this.time.addEvent({ delay: 1000, loop: true, callback: () => {
      seconds++; clock.setText(`${seconds}s`)
      if (seconds % (POLL_MS / 1000) === 0) void poll()
      if (seconds >= TIMEOUT_S) this.fail(t('noOpponent'), spinner, title, clock, cancel)
    } })
    void poll()
  }
  /** Timeout or error: leave the line and offer a retry instead of waiting forever. */
  private fail(message: string, ...objects: Phaser.GameObjects.GameObject[]) {
    this.timer?.remove(); void cancelQuickMatch()
    for (const o of objects) o.destroy()
    text(this, 240, 380, message, 18, '#ffb9a8').setWordWrapWidth(380).setLineSpacing(8)
    button(this, 240, 520, t('tryAgain'), () => navigate(this, 'Quick'), { color: PALETTE.yellow })
    button(this, 240, 600, `‹  ${t('back')}`, () => navigate(this, 'Online'), { color: PALETTE.cream })
  }
}
