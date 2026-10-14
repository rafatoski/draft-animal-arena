import Phaser from 'phaser'
import { background, heading, text, button, panel, entrance, navigate, PALETTE } from '../ui/components'
import { t } from '../services/i18n'
import type { TextKey } from '../services/i18n'
import { supabaseConfigured } from '../services/supabase'
import { ensurePlayer, signInWithGoogle, signOut, currentSession } from '../services/auth'
import type { AuthFailure } from '../services/auth'
import { getProfile, onProfile, refreshProfile, renameProfile } from '../services/online'

const ERRORS: Record<AuthFailure, TextKey> = { 'not-configured': 'onlineOff', 'anonymous-disabled': 'errAnon', 'provider-disabled': 'errProvider', network: 'errNetwork', error: 'errGeneric' }

/** Login (Google / guest) when signed out; profile, link-to-Google, rename, play online and sign out when signed in. */
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
    void currentSession().then(() => refreshProfile()).then(() => this.render())
    this.render()
  }
  private render() {
    if (!this.sys.isActive()) return
    this.view.removeAll(true)
    const add = (...objects: Phaser.GameObjects.GameObject[]) => this.view.add(objects)
    const profile = getProfile()
    if (!supabaseConfigured) add(text(this, 240, 330, t('onlineOff'), 17, '#fff4d9').setWordWrapWidth(380).setLineSpacing(8))
    else if (!profile) {
      add(button(this, 240, 300, t('continueGoogle'), () => this.run(() => signInWithGoogle()), { color: 0xffffff }),
        button(this, 240, 380, t('playGuest'), () => this.run(ensurePlayer), { color: PALETTE.mint }))
      if (this.busy) add(text(this, 240, 450, t('working'), 15, '#d9ccff'))
    } else {
      add(panel(this, 240, 290, 400, 250, 0x4a2c8a),
        text(this, 240, 200, profile.displayName, 30, '#fff4d9').setStroke('#173f46', 5),
        text(this, 240, 238, t(profile.accountType === 'google' ? 'googleTag' : 'guestTag'), 14, '#d9ccff'))
      const stats: [TextKey, number][] = [['pointsLabel', profile.rankingPoints], ['coinsLabel', profile.coins], ['diamondsLabel', profile.diamonds], ['winsLabel', profile.wins]]
      stats.forEach(([label, value], i) => add(text(this, 130 + (i % 2) * 220, 292 + Math.floor(i / 2) * 62, String(value), 28, '#ffd367').setStroke('#173f46', 4),
        text(this, 130 + (i % 2) * 220, 318 + Math.floor(i / 2) * 62, t(label), 11, '#d9ccff')))
      let y = 460
      add(button(this, 240, y, t('playOnline'), () => navigate(this, 'Lobby'), { color: PALETTE.yellow }))
      if (profile.accountType === 'guest') add(button(this, 240, y += 70, t('linkGoogle'), () => this.run(() => signInWithGoogle()), { color: 0xffffff, size: 17 }))
      add(button(this, 128, y += 70, t('renameBtn'), () => void this.rename(), { width: 170, size: 16 }),
        button(this, 352, y, t('signOut'), () => void this.logout(), { width: 170, size: 16, color: 0xffb9a8 }))
    }
    if (this.message) add(text(this, 240, 640, this.message, 14, '#ffb9a8').setWordWrapWidth(400))
    add(button(this, 240, 750, `‹  ${t('back')}`, () => navigate(this, 'Menu'), { color: PALETTE.cream }))
  }
  private async run(action: () => Promise<{ ok: true } | { ok: false; reason: AuthFailure }>) {
    if (this.busy) return
    this.busy = true; this.message = ''; this.render()
    const result = await action()
    this.busy = false
    if (!result.ok) this.message = t(ERRORS[result.reason])
    else if (!('redirecting' in result)) await refreshProfile() // Google redirects away; the profile loads when it returns
    this.render()
  }
  private async rename() {
    const name = window.prompt(t('renamePrompt'), getProfile()?.displayName ?? '')
    if (name && !(await renameProfile(name))) this.message = t('errGeneric')
    this.render()
  }
  private async logout() { await signOut(); this.render() }
}
