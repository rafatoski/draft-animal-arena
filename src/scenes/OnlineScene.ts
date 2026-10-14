import Phaser from 'phaser'
import { background, heading, text, button, panel, entrance, navigate, PALETTE } from '../ui/components'
import { t } from '../services/i18n'
import { signInWithGoogle, realSession } from '../services/auth'
import { getProfile, myActiveRoom, refreshProfile } from '../services/online'
import type { Room } from '../services/online'

type Glyph = 'bolt' | 'plus' | 'key'
/** A standard button with a small drawn glyph at its left edge (same ink as the labels). */
function glyphButton(scene: Phaser.Scene, y: number, glyph: Glyph, title: string, action: () => void, color: number) {
  const root = button(scene, 240, y, title, action, { color })
  const g = scene.add.graphics().fillStyle(PALETTE.ink).lineStyle(5, PALETTE.ink)
  if (glyph === 'bolt') g.fillPoints([{ x: 3, y: -15 }, { x: -9, y: 3 }, { x: -1, y: 3 }, { x: -4, y: 15 }, { x: 9, y: -4 }, { x: 1, y: -4 }], true)
  if (glyph === 'plus') g.lineBetween(-11, 0, 11, 0).lineBetween(0, -11, 0, 11)
  if (glyph === 'key') g.strokeCircle(-7, 0, 7).lineBetween(0, 0, 13, 0).lineBetween(9, 0, 9, 7).lineBetween(13, 0, 13, 6)
  g.setPosition(-148, 0); root.add(g)
  return root
}

/** Online Multiplayer: Quick Match, Create Room, Join Room. Only Google players may enter; guests get a friendly explanation. */
export class OnlineScene extends Phaser.Scene {
  private view!: Phaser.GameObjects.Container
  private message = ''
  private resume: Room | null = null
  constructor() { super('Online') }
  create() {
    this.input.enabled = true; this.message = ''; this.resume = null
    background(this); entrance(this); heading(this, t('onlineTitle'), t('onlineHint'))
    this.view = this.add.container(0, 0)
    this.render()
    void realSession().then(() => refreshProfile()).then(async () => { if (getProfile()) this.resume = await myActiveRoom(); this.render() })
  }
  private render() {
    if (!this.sys.isActive()) return
    this.view.removeAll(true)
    const add = (...objects: Phaser.GameObjects.GameObject[]) => this.view.add(objects)
    if (!getProfile()) {
      add(panel(this, 240, 300, 400, 200, 0x4a2c8a), text(this, 240, 300, t('googleNeeded'), 16, '#fff4d9').setWordWrapWidth(350).setLineSpacing(8),
        button(this, 240, 450, t('continueGoogle'), async () => {
          const result = await signInWithGoogle()
          if (!result.ok) { this.message = t(result.reason === 'provider-disabled' ? 'errProvider' : 'errGeneric'); this.render() }
        }, { color: 0xffffff }))
    } else {
      let y = 230
      if (this.resume) { add(glyphButton(this, y, 'key', t('resumeRoom', { code: this.resume.code }), () => navigate(this, 'Lobby', { roomId: this.resume!.id }), PALETTE.coral)); y += 80 }
      add(glyphButton(this, y, 'bolt', t('quickMatch'), () => navigate(this, 'Quick'), PALETTE.yellow),
        glyphButton(this, y + 80, 'plus', t('createRoom'), () => void this.create_(), PALETTE.mint),
        glyphButton(this, y + 160, 'key', t('joinRoomBtn'), () => navigate(this, 'Join'), 0xffffff))
      y += 160
      add(button(this, 240, y + 110, t('vsComputer'), () => navigate(this, 'Arena', { fresh: true }), { width: 280, size: 16, color: PALETTE.cream }))
    }
    if (this.message) add(text(this, 240, 650, this.message, 14, '#ffb9a8').setWordWrapWidth(400))
    add(button(this, 240, 750, `‹  ${t('back')}`, () => navigate(this, 'Menu'), { color: PALETTE.cream }))
  }
  private async create_() {
    const { createRoom } = await import('../services/online')
    const result = await createRoom()
    if (!result.ok) { this.message = t('errGeneric'); return this.render() }
    navigate(this, 'Lobby', { roomId: result.value.id })
  }
}
