import Phaser from 'phaser'
import { preloadLogo, LOGO_TEXTURE } from '../game/assets'
import { preloadHomeAssets, pickHomeArt } from '../game/homeAssets'
import { background, text, navigate } from '../ui/components'
import { homeIcon, homeNavigation } from '../ui/homeNavigation'
import { homeLayout } from '../ui/homeLayout'
import { preferences } from '../services/preferences'
import { getGuest } from '../services/guest'
import { getProfile, onProfile } from '../services/online'
import { DPR } from '../rendering/pixelRatio'
import { audio } from '../services/audio'
export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu') }
  preload() { preloadLogo(this); preloadHomeAssets(this) }
  create() {
    this.input.enabled = true
    background(this)
    const sessionCoins = () => getProfile()?.coins ?? getGuest()?.coins ?? 0
    const playerName = () => getProfile()?.displayName ?? getGuest()?.name ?? ''
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
    const coins = text(this, 0, 0, sessionCoins().toLocaleString(preferences.language), 17, '#fff4d9')
    coinsHud.add([coinFace, coinIcon, coins])
    // Tapping the coin pill opens the account / online screen.
    coinsHud.setInteractive(new Phaser.Geom.Rectangle(0, 0, 100, 48), Phaser.Geom.Rectangle.Contains)
    coinsHud.input!.cursor = 'pointer'
    coinsHud.on('pointerup', () => { audio.unlock(); audio.effect('tap'); navigate(this, 'Account') })
    // Display-only placeholder. It is intentionally separate from saved player data.
    const gemsHud = this.add.container(), gemFace = this.add.graphics(), gemIcon = homeIcon(this, 'gems')
    const gems = text(this, 0, 0, (getProfile()?.diamonds ?? 0).toLocaleString(preferences.language), 17, '#fff4d9')
    gemsHud.add([gemFace, gemIcon, gems])
    const nameLabel = text(this, 0, 0, playerName(), 12, '#d9ccff').setOrigin(0, .5)
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
      const w = this.scale.width / DPR, h = this.scale.height / DPR, layout = homeLayout(w, h)
      this.cameras.main.setViewport(0, 0, this.scale.width, this.scale.height).setZoom(DPR).centerOn(w / 2, h / 2)
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
        if (root === coinsHud) { coinsHud.setSize(box.width, box.height); (coinsHud.input!.hitArea as Phaser.Geom.Rectangle).setTo(0, 0, box.width, box.height) }
        drawHud(face, box.width, box.height)
        icon.setPosition(-box.width / 2 + 22, 0).setScale(box.height / 52)
        value.setPosition(12, 0).setScale(1)
        if (value.width > box.width - 50) value.setScale((box.width - 50) / value.width)
      }
      const cb = layout.topHud.coins
      nameLabel.setScale(1).setPosition(cb.x - cb.width / 2 + 4, cb.y + cb.height / 2 + 12)
      if (nameLabel.width > 170) nameLabel.setScale(170 / nameLabel.width)
      brand.setPosition(layout.logo.x, layout.logo.y).setScale(Math.min(layout.logo.width / brand.width, layout.logo.height / brand.height))
      illustration.setPosition(layout.illustration.x, layout.illustration.y).setSize(layout.illustration.width, layout.illustration.height)
      if (image) image.setScale(Math.min(layout.illustration.width / image.width, layout.illustration.height / image.height))
      nav.resize(layout.nav.x, layout.nav.y, layout.nav.width, layout.nav.height)
    }
    resize(); this.cameras.main.fadeIn(220, 83, 66, 142)
    // Server coins replace the local placeholder once a profile is loaded; offline it stays as before.
    const stopCoins = onProfile(profile => { coins.setText(sessionCoins().toLocaleString(preferences.language)); nameLabel.setText(playerName()); gems.setText((profile?.diamonds ?? 0).toLocaleString(preferences.language)); resize() })
    resize()
    brand.setAlpha(0); this.tweens.add({ targets: brand, alpha: 1, duration: 500 })
    this.scale.on(Phaser.Scale.Events.RESIZE, resize)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' && !e.repeat) { audio.unlock(); navigate(this, 'Arena') } }
    this.input.keyboard?.on('keydown', onKey)
    this.events.once('shutdown', () => { stopCoins(); this.scale.off(Phaser.Scale.Events.RESIZE, resize); this.input.keyboard?.off('keydown', onKey) })
  }
}
