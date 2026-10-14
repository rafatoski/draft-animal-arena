import Phaser from 'phaser'
import { background, heading, text, button, entrance, navigate, PALETTE } from '../ui/components'
import { t } from '../services/i18n'
import { joinRoom } from '../services/online'

const normalize = (value: string) => value.toUpperCase().replace(/[\s-]/g, '')
/** Room code entry. A real DOM input (so mobile keyboards, paste and autofill work) placed over the canvas at the panel's position. */
export class JoinScene extends Phaser.Scene {
  private input_?: HTMLInputElement
  private message!: Phaser.GameObjects.Text
  private busy = false
  constructor() { super('Join') }
  create() {
    this.input.enabled = true; this.busy = false
    background(this); entrance(this); heading(this, t('joinTitle'), t('joinHint'))
    this.message = text(this, 240, 400, '', 15, '#ffb9a8').setWordWrapWidth(400)
    button(this, 240, 480, t('joinRoomBtn'), () => void this.join(), { color: PALETTE.yellow })
    button(this, 240, 750, `‹  ${t('back')}`, () => navigate(this, 'Online'), { color: PALETTE.cream })
    const el = document.createElement('input')
    Object.assign(el, { type: 'text', maxLength: 8, placeholder: t('joinHint'), autocomplete: 'off', autocapitalize: 'characters', spellcheck: false, enterKeyHint: 'go' })
    el.setAttribute('aria-label', t('joinHint'))
    Object.assign(el.style, { position: 'absolute', zIndex: '5', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '.18em', fontFamily: 'inherit',
      background: '#fff4d9', color: '#173f46', border: '4px solid #173f46', borderRadius: '16px', boxShadow: '0 5px 0 #2b1a55', outline: 'none' })
    el.addEventListener('input', () => { el.value = normalize(el.value).replace(/[^A-Z0-9]/g, ''); this.message.setText('') })
    el.addEventListener('keydown', e => { if (e.key === 'Enter') void this.join() })
    document.getElementById('app')!.appendChild(el); this.input_ = el
    this.place(); this.scale.on(Phaser.Scale.Events.RESIZE, this.place, this)
    this.events.once('shutdown', () => { this.scale.off(Phaser.Scale.Events.RESIZE, this.place, this); el.remove() })
  }
  /** Virtual (240, 320) -> CSS pixels, using the same camera the rest of the scene is drawn with. */
  private place() {
    const el = this.input_; if (!el) return
    const app = document.getElementById('app')!, zoom = this.cameras.main.zoom / (this.scale.width / app.clientWidth)
    const w = 300 * zoom, h = 64 * zoom
    Object.assign(el.style, { width: `${w}px`, height: `${h}px`, left: `${app.clientWidth / 2 - w / 2}px`, top: `${app.clientHeight / 2 + (320 - 420) * zoom - h / 2}px`, fontSize: `${30 * zoom}px` })
  }
  private async join() {
    if (this.busy) return
    const code = normalize(this.input_?.value ?? '')
    if (!/^[A-HJ-NP-Z2-9]{5,6}$/.test(code)) { this.message.setText(t('codeInvalid')); return }
    this.busy = true; this.message.setText(t('working')).setColor('#d9ccff')
    const result = await joinRoom(code)
    this.busy = false
    if (!this.sys.isActive()) return
    if (result.ok) return navigate(this, 'Lobby', { roomId: result.value.id })
    const key = /full/.test(result.message) ? 'roomFull' : /host of this room/.test(result.message) ? 'ownRoom' : /not found/.test(result.message) ? 'roomGone'
      : /sign in/.test(result.message) ? 'googleNeeded' : result.message === 'offline' ? 'errNetwork' : 'errGeneric'
    this.message.setText(t(key)).setColor('#ffb9a8')
  }
}
