import Phaser from 'phaser'
import { background, heading, text, button, panel, entrance, navigate, PALETTE } from '../ui/components'
import { t } from '../services/i18n'
import type { TextKey } from '../services/i18n'
import { signInWithGoogle, signOut, realSession } from '../services/auth'
import type { AuthFailure } from '../services/auth'
import { getProfile, onProfile, refreshProfile, renameProfile } from '../services/online'
import { endGuest, getGuest } from '../services/guest'

const ERRORS: Record<AuthFailure, TextKey> = { 'not-configured': 'onlineOff', 'provider-disabled': 'errProvider', network: 'errNetwork', error: 'errGeneric' }

/** Google player: persistent profile, play online, rename, sign out. Guest: a clear temporary-session notice and a way to sign in. */
export class AccountScene extends Phaser.Scene {
  private view!: Phaser.GameObjects.Container
  private message = ''
  private busy = false
  constructor() { super('Account') }
  create() {
    this.input.enabled = true; this.busy = false; this.message = ''
    background(this); entrance(this); heading(this, t('accountTitle'), t('accountHint'))
    this.view = this.add.container(0, 0)
    this.events.once('shutdown', onProfile(() => this.render()))
    void realSession().then(() => refreshProfile()).then(() => this.render())
    this.render()
  }
  private render() {
    if (!this.sys.isActive()) return
    this.view.removeAll(true)
    const add = (...objects: Phaser.GameObjects.GameObject[]) => this.view.add(objects)
    const profile = getProfile(), guest = getGuest()
    if (profile) {
      add(panel(this, 240, 290, 400, 250, 0x4a2c8a),
        text(this, 240, 200, profile.displayName, 30, '#fff4d9').setStroke('#173f46', 5).setWordWrapWidth(380),
        text(this, 240, 238, t('googleTag'), 14, '#d9ccff'))
      const stats: [TextKey, number][] = [['winsLabel', profile.wins], ['lossesLabel', profile.losses], ['coinsLabel', profile.coins], ['diamondsLabel', profile.diamonds]]
      stats.forEach(([label, value], i) => add(text(this, 130 + (i % 2) * 220, 292 + Math.floor(i / 2) * 62, String(value), 28, '#ffd367').setStroke('#173f46', 4),
        text(this, 130 + (i % 2) * 220, 318 + Math.floor(i / 2) * 62, t(label), 11, '#d9ccff')))
      add(button(this, 240, 460, t('playOnline'), () => navigate(this, 'Online'), { color: PALETTE.yellow }),
        button(this, 128, 540, t('renameBtn'), () => void this.rename(), { width: 170, size: 16 }),
        button(this, 352, 540, t('signOut'), () => void this.logout(), { width: 170, size: 16, color: 0xffb9a8 }))
    } else if (guest) {
      add(panel(this, 240, 270, 400, 210, 0x4a2c8a),
        text(this, 240, 210, guest.name, 30, '#fff4d9').setStroke('#173f46', 5),
        text(this, 240, 248, t('guestSessionNote'), 13, '#ffd367'),
        text(this, 240, 330, t('guestAccountNote'), 13, '#fff4d9').setWordWrapWidth(360).setLineSpacing(5))
      add(button(this, 240, 440, t('continueGoogle'), () => this.run(), { color: 0xffffff }),
        button(this, 240, 520, t('backToStart'), () => { endGuest(); navigate(this, 'Auth') }, { color: 0xffb9a8 }))
      if (this.busy) add(text(this, 240, 580, t('working'), 15, '#d9ccff'))
    } else add(button(this, 240, 400, t('backToStart'), () => navigate(this, 'Auth'), { color: PALETTE.yellow }))
    if (this.message) add(text(this, 240, 640, this.message, 14, '#ffb9a8').setWordWrapWidth(400))
    add(button(this, 240, 750, `‹  ${t('back')}`, () => navigate(this, 'Menu'), { color: PALETTE.cream }))
  }
  /** Leaves the guest session for Google. Nothing from the guest session is merged: the redirect starts a clean game. */
  private async run() {
    if (this.busy) return
    this.busy = true; this.message = ''; this.render()
    const result = await signInWithGoogle()
    if (!result.ok) { this.busy = false; this.message = t(ERRORS[result.reason]); this.render() }
  }
  private async rename() {
    const name = window.prompt(t('renamePrompt'), getProfile()?.displayName ?? '')
    if (name && !(await renameProfile(name))) this.message = t('errGeneric')
    this.render()
  }
  private async logout() { await signOut(); navigate(this, 'Auth') }
}
