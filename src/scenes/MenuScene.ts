import Phaser from 'phaser'
import { preloadLogo, LOGO_TEXTURE } from '../game/assets'
import { preloadHomeAssets, pickHomeArt } from '../game/homeAssets'
import { background, text, navigate } from '../ui/components'
import { homeIcon, homeNavigation } from '../ui/homeNavigation'
import { homeLayout } from '../ui/homeLayout'
import { preferences } from '../services/preferences'
import { loadPlayer } from '../services/player'
import { audio } from '../services/audio'
export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu') }
  preload() { preloadLogo(this); preloadHomeAssets(this) }
  create() {
    this.input.enabled = true
    background(this)
    const player = loadPlayer()
    const settings = this.add.container()
    const settingsFace = this.add.graphics()
    const settingsIcon = homeIcon(this, 'settings')
    settings.add([settingsFace, settingsIcon])
    let settingsPressed = false
    settings.setInteractive(new Phaser.Geom.Rectangle(0, 0, 48, 48), Phaser.Geom.Rectangle.Contains)
    settings.input!.cursor = 'pointer'
    settings.on('pointerover', () => { if (!settingsPressed) settings.setScale(1.04) })
    settings.on('pointerout', () => { settingsPressed = false; settings.setScale(1) })
    settings.on('pointerdown', () => { settingsPressed = true; audio.unlock(); settings.setScale(.94) })
    settings.on('pointerup', () => {
      if (!settingsPressed) return
      settingsPressed = false; settings.setScale(1); audio.effect('tap'); navigate(this, 'Settings')
    })

    const coinsHud = this.add.container(), coinFace = this.add.graphics(), coinIcon = homeIcon(this, 'coin')
    const coins = text(this, 0, 0, player.coins.toLocaleString(preferences.language), 17, '#fff4d9')
    coinsHud.add([coinFace, coinIcon, coins])
    // Display-only placeholder. It is intentionally separate from saved player data.
    const gemsHud = this.add.container(), gemFace = this.add.graphics(), gemIcon = homeIcon(this, 'gems')
    const gems = text(this, 0, 0, (0).toLocaleString(preferences.language), 17, '#fff4d9')
    gemsHud.add([gemFace, gemIcon, gems])
    const brand = this.add.image(0, 0, LOGO_TEXTURE)
    // Deliberately empty until the supplied illustration URL is configured.
    const illustration = this.add.container(0, 0).setName('home-illustration-slot')
    // Chosen once per visit; resize only rescales it. Plain image: no input, no tweens.
    const artKey = pickHomeArt()
    const image = artKey && this.textures.exists(artKey) ? this.add.image(0, 0, artKey) : undefined
    if (image) illustration.add(image)
    const nav = homeNavigation(this, id => {
      if (id === 'fighters') navigate(this, 'Fighters')
      if (id === 'practice') navigate(this, 'Arena', { fresh: true, practice: true })
      if (id === 'ranking') navigate(this, 'Leaderboard')
      if (id === 'play') navigate(this, 'Arena')
    })
    const resize = () => {
      const w = this.scale.width, h = this.scale.height, layout = homeLayout(w, h)
      this.cameras.main.setViewport(0, 0, w, h).setZoom(1).centerOn(w / 2, h / 2)
      const drawHud = (face: Phaser.GameObjects.Graphics, width: number, height: number) => face.clear()
        .fillStyle(0x291a4d, .9).fillRoundedRect(-width / 2, -height / 2 + 4, width, height, 14)
        .fillStyle(0x6743a4, .96).fillRoundedRect(-width / 2, -height / 2, width, height, 14)
        .lineStyle(2.5, 0x21163d).strokeRoundedRect(-width / 2, -height / 2, width, height, 14)
        .lineStyle(1, 0xbda0e8, .75).strokeRoundedRect(-width / 2 + 4, -height / 2 + 4, width - 8, height - 8, 10)
      const settingsBox = layout.topHud.settings
      settings.setPosition(settingsBox.x, settingsBox.y).setSize(settingsBox.width, settingsBox.height)
      drawHud(settingsFace, settingsBox.width, settingsBox.height)
      settingsIcon.setScale(settingsBox.height / 48)
      if (settings.input) (settings.input.hitArea as Phaser.Geom.Rectangle)
        .setTo(0, 0, settingsBox.width, settingsBox.height)
      for (const [root, face, icon, value, box] of [
        [coinsHud, coinFace, coinIcon, coins, layout.topHud.coins],
        [gemsHud, gemFace, gemIcon, gems, layout.topHud.gems],
      ] as const) {
        root.setPosition(box.x, box.y)
        drawHud(face, box.width, box.height)
        icon.setPosition(-box.width / 2 + 22, 0).setScale(box.height / 52)
        value.setPosition(12, 0).setScale(1)
        if (value.width > box.width - 50) value.setScale((box.width - 50) / value.width)
      }
      brand.setPosition(layout.logo.x, layout.logo.y).setScale(Math.min(layout.logo.width / brand.width, layout.logo.height / brand.height))
      illustration.setPosition(layout.illustration.x, layout.illustration.y).setSize(layout.illustration.width, layout.illustration.height)
      if (image) image.setScale(Math.min(layout.illustration.width / image.width, layout.illustration.height / image.height))
      nav.resize(layout.nav.x, layout.nav.y, layout.nav.width, layout.nav.height)
    }
    resize(); this.cameras.main.fadeIn(220, 83, 66, 142)
    brand.setAlpha(0); this.tweens.add({ targets: brand, alpha: 1, duration: 500 })
    this.scale.on(Phaser.Scale.Events.RESIZE, resize)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' && !e.repeat) { audio.unlock(); navigate(this, 'Arena') } }
    this.input.keyboard?.on('keydown', onKey)
    this.events.once('shutdown', () => { this.scale.off(Phaser.Scale.Events.RESIZE, resize); this.input.keyboard?.off('keydown', onKey) })
  }
}
