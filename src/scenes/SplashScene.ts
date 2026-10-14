import Phaser from 'phaser'
import { preloadLogo } from '../game/assets'
import { fitPortraitScene } from '../rendering/responsive'
import { background, logo, text, navigate } from '../ui/components'
import { t, syncDocumentLanguage } from '../services/i18n'
import { animalArt } from '../game/animalArt'
import { FIGHTERS } from '../game/fighters'
export class SplashScene extends Phaser.Scene {
  constructor() { super('Splash') }
  preload() { preloadLogo(this) }
  create() {
    fitPortraitScene(this)
    syncDocumentLanguage(); background(this)
    logo(this, 240, 300, 440, 300)
    const chicken = animalArt(this, FIGHTERS[0]!).setPosition(240, 515).setScale(0)
    this.tweens.add({ targets: chicken, scale: 1.5, angle: 360, delay: 180, duration: 650, ease: 'Back.Out' })
    text(this, 240, 640, t('tagline'), 18, '#fff4d9')
    this.time.delayedCall(1500, () => navigate(this, 'Menu'))
  }
}
