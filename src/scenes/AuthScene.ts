import Phaser from 'phaser'
import { background, text, button, entrance, navigate, logo, PALETTE } from '../ui/components'
import { t } from '../services/i18n'
import type { TextKey } from '../services/i18n'
import { preloadLogo } from '../game/assets'
import { supabaseConfigured } from '../services/supabase'
import { realSession, signInWithGoogle } from '../services/auth'
import type { AuthFailure } from '../services/auth'
import { refreshProfile } from '../services/online'
import { startGuest } from '../services/guest'

const ERRORS: Record<AuthFailure, TextKey> = { 'not-configured': 'onlineOff', 'provider-disabled': 'errProvider', network: 'errNetwork', error: 'errGeneric' }

/**
 * First screen after the splash. A valid Google session (restored by supabase-js, including right after the OAuth
 * redirect) goes straight to the menu; otherwise the player picks Google or a temporary guest session.
 */
export class AuthScene extends Phaser.Scene {
  private busy = false
  constructor() { super('Auth') }
  preload() { preloadLogo(this) }
  create() {
    this.input.enabled = true; this.busy = false
    void this.restore()
  }
  private async restore() {
    if (supabaseConfigured) {
      const session = await realSession()
      if (session && this.sys.isActive()) { await refreshProfile(); if (this.sys.isActive() && await realSession()) return navigate(this, 'Menu') } // a deleted account's stale session is dropped by refreshProfile
    }
    if (this.sys.isActive()) this.render()
  }
  private render() {
    background(this); entrance(this)
    logo(this, 240, 200, 400, 260)
    text(this, 240, 372, t('authHint'), 16, '#d7f4d9')
    const message = text(this, 240, 640, '', 14, '#ffb9a8').setWordWrapWidth(400)
    if (supabaseConfigured) {
      button(this, 240, 440, t('continueGoogle'), async () => {
        if (this.busy) return
        this.busy = true; message.setText(t('working')).setColor('#d9ccff')
        const result = await signInWithGoogle()
        if (!result.ok) { this.busy = false; message.setText(t(ERRORS[result.reason])).setColor('#ffb9a8') }
      }, { color: 0xffffff })
    } else message.setText(t('onlineOff')).setColor('#d9ccff')
    button(this, 240, 520, t('playGuest'), () => { startGuest(); navigate(this, 'Menu') }, { color: PALETTE.mint })
    text(this, 240, 592, t('guestWarn'), 12, '#fff4d9').setWordWrapWidth(380).setLineSpacing(5)
  }
}
