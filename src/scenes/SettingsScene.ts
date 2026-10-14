import Phaser from 'phaser'
import { background, heading, text, button, entrance, navigate, PALETTE } from '../ui/components'
import { t, syncDocumentLanguage } from '../services/i18n'
import { preferences, savePreferences } from '../services/preferences'
import { audio } from '../services/audio'
export class SettingsScene extends Phaser.Scene {
  constructor() { super('Settings') }
  create() {
    this.input.enabled = true
    background(this); entrance(this); heading(this, t('settings'), t('settingsHint'))
    text(this, 240, 190, t('language'), 15, '#fff4d9').setStroke('#49356e', 3)
    button(this, 139, 247, 'English', () => this.language('en'), { width: 174, color: preferences.language === 'en' ? PALETTE.mint : 0xe3e6cf, size: 18 })
    button(this, 341, 247, 'Español', () => this.language('es'), { width: 174, color: preferences.language === 'es' ? PALETTE.mint : 0xe3e6cf, size: 18 })
    text(this, 159, 357, t('music'), 19, '#fff4d9').setStroke('#49356e', 3)
    const music = button(this, 352, 357, t(preferences.music ? 'on' : 'off'), () => {
      savePreferences({ music: !preferences.music }); audio.sync(); this.scene.restart()
    }, { width: 100, color: preferences.music ? PALETTE.mint : 0xd7dbcf })
    music.setName('music-toggle')
    text(this, 159, 458, t('sfx'), 16, '#fff4d9').setStroke('#49356e', 3)
    button(this, 352, 458, t(preferences.sfx ? 'on' : 'off'), () => {
      savePreferences({ sfx: !preferences.sfx }); audio.sync(); this.scene.restart()
    }, { width: 100, color: preferences.sfx ? PALETTE.mint : 0xd7dbcf })
    text(this, 240, 551, t('saved'), 13, '#fff4d9')
    button(this, 240, 600, t('accountTitle'), () => navigate(this, 'Account'), { color: 0xffffff })
    button(this, 240, 690, `‹  ${t('back')}`, () => navigate(this, 'Menu'), { color: PALETTE.yellow })
    text(this, 240, 800, 'Creado por Rafael Castillo © 2026', 12, '#d9ccff') // credit line: fixed text, not translated
  }
  private language(language: 'en' | 'es') {
    savePreferences({ language }); syncDocumentLanguage(); this.scene.restart()
  }
}
