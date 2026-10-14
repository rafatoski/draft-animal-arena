import Phaser from 'phaser'
import { background, heading, text, button, entrance, navigate } from '../ui/components'
import { t } from '../services/i18n'
export class LeaderboardScene extends Phaser.Scene {
  constructor() { super('Leaderboard') }
  create() {
    this.input.enabled = true
    background(this); entrance(this); heading(this, t('leaderboard'), t('soon'))
    text(this, 240, 360, t('leaderboardSoon'), 19, '#fff4d9').setWordWrapWidth(370).setLineSpacing(10)
    button(this, 240, 690, t('back'), () => navigate(this, 'Menu'))
  }
}
