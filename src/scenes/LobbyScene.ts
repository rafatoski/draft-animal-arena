import Phaser from 'phaser'
import { background, heading, text, button, panel, entrance, navigate, PALETTE } from '../ui/components'
import { t } from '../services/i18n'
import { FIGHTERS } from '../game/fighters'
import { miniFighterCard } from '../ui/miniFighterCard'
import { preloadCardArt } from '../ui/collectibleCard'
import { audio } from '../services/audio'
import { isUnlocked, leaveRoom, setTeam, setReady, fetchRoomState, fetchMatch, startMatch, watchRoom, dlog, getProfile, serverClockOffset, finalizeSelection, saveDraft } from '../services/online'
import type { RoomState } from '../services/online'
import type { OnlineLaunch } from './ArenaScene'

/** Online room: create / join by code, pick three fighters, ready up. The server starts and simulates the match. */
export class LobbyScene extends Phaser.Scene {
  private roomId?: string
  private state: RoomState | null = null
  private online = new Set<string>()
  private view!: Phaser.GameObjects.Container
  private cards: ReturnType<typeof miniFighterCard>[] = []
  private picked: string[] = []
  private note = ''
  private starting = false
  private launched = false
  private sawLobby = false // this scene watched the room in 'lobby', so a 'finished' room with a match is the one we just started
  private startedAt = 0
  private lastStatus = ''
  private offset = 0
  private finalizing = false
  private timerText?: Phaser.GameObjects.Text
  private stop?: () => void
  constructor() { super('Lobby') }
  init(data: { roomId?: string } = {}) { this.roomId = data.roomId }
  preload() { preloadCardArt(this, FIGHTERS) }
  create() {
    this.input.enabled = true; this.state = null; this.cards = []; this.picked = []; this.note = ''; this.starting = false; this.launched = false; this.finalizing = false; this.sawLobby = false; this.startedAt = 0; this.lastStatus = ''
    background(this); entrance(this); heading(this, t('lobbyTitle'), t('lobbyHint'))
    this.view = this.add.container(0, 0)
    this.events.once('shutdown', () => { this.stop?.(); this.stop = undefined })
    if (this.roomId) void this.enter(this.roomId); else this.scene.start('Online') // rooms are created / joined from the Online screen
  }
  // ───────── inside a room ─────────
  private async enter(roomId: string) {
    this.roomId = roomId
    const state = await fetchRoomState(roomId)
        if (!state || state.room.status === 'closed' || state.room.status === 'finished') { this.roomId = undefined; return navigate(this, 'Online') }
    this.offset = await serverClockOffset()
    const me = getProfile()?.id ?? ''
    this.stop?.()
    this.stop = watchRoom(roomId, me, () => void this.sync(), online => { this.online = online; this.draw() })
    this.state = state; this.buildRoom(); this.react()
    this.time.addEvent({ delay: 250, loop: true, callback: () => this.tick() })
    this.time.addEvent({ delay: 2000, loop: true, callback: () => this.watchdog() }) // realtime is a hint, never the only way to find out
  }
  /** Countdown to the SERVER's deadline. At zero the server is asked to finish the selection; it refuses if its own clock disagrees. */
  private tick() {
    const state = this.state; if (!state || !this.timerText || this.launched) return
    const deadline = state.room.deadline
    if (state.room.status !== 'lobby' || deadline === null) { this.timerText.setText(''); return }
    const left = deadline - (Date.now() + this.offset)
    if (left > 0) {
      const urgent = left <= 5000
      this.timerText.setText(t('selectionTime', { n: Math.ceil(left / 1000) })).setColor(urgent ? '#ff8c79' : '#ffd367').setScale(urgent ? 1 + .06 * (left % 1000) / 1000 : 1)
      return
    }
    this.timerText.setText(t('selectionOver')).setColor('#ff8c79').setScale(1)
    if (!this.finalizing) {
      this.finalizing = true
      void finalizeSelection(state.room.id).then(() => this.sync()).finally(() => { setTimeout(() => { this.finalizing = false }, 1000) }) // retry each second until the room moves on
    }
  }
  private async sync() {
    if (!this.roomId || !this.sys.isActive()) return
    const state = await fetchRoomState(this.roomId)
    if (!state) return
    if (state.room.status === 'closed') { this.stop?.(); this.stop = undefined; this.state = null; this.roomId = undefined; return navigate(this, 'Online') }
    this.state = state; this.react(); this.draw()
  }
  /** Both players run this on every change; start-match is idempotent so only one match is ever created. */
  private react() {
    const state = this.state; if (!state) return
    const seats = state.seats, allReady = seats.length === 2 && seats.every(s => s.ready)
    if (state.room.status !== this.lastStatus) { dlog('room-status', { room: state.room.id, from: this.lastStatus, to: state.room.status, match: state.room.matchId }); this.lastStatus = state.room.status }
    if (state.room.status === 'lobby') this.sawLobby = true
    if (state.room.status === 'lobby' && allReady && !this.starting) {
      this.starting = true; this.startedAt = Date.now(); this.note = ''
      void startMatch(state.room.id).then(r => {
        dlog('start-match', { room: state.room.id, ok: r.ok, ...(r.ok ? { match: r.value.matchId, created: r.value.created } : { reason: r.message }) })
        if (!r.ok) this.starting = false // the watchdog re-reads the room and tries again; the other player's call may already have started it
      })
    }
    // The server simulates the whole match inside start-match, so the room is 'in_match' for only a few ms: 'finished' with a match id is just as valid.
    const started = state.room.status === 'in_match' || (state.room.status === 'finished' && this.sawLobby && allReady)
    if (started && state.room.matchId && !this.launched) { this.launched = true; void this.launch(state) }
    if (state.room.status === 'lobby') this.starting = this.starting && allReady
  }
  /** Every 2 s until the arena opens: re-read the room (realtime is only a hint) and give up visibly after 25 s. Runs whatever happened to start-match. */
  private watchdog() {
    const state = this.state
    if (this.launched || !this.sys.isActive() || !state || !this.sawLobby || !state.seats.length || !(state.seats.length === 2 && state.seats.every(s => s.ready))) return
    if (!this.startedAt) this.startedAt = Date.now()
    void this.sync()
    if (Date.now() - this.startedAt > 25000 && !this.note) { dlog('start-timeout', { room: state.room.id, status: state.room.status, match: state.room.matchId }); this.note = t('startTimeout'); this.draw(); this.showRetry() }
  }
  private showRetry() {
    const retry = button(this, 240, 640, t('retry'), () => {
      retry.destroy(); this.note = ''; this.starting = false; this.launched = false; this.startedAt = Date.now(); void this.sync()
    }, { width: 200, size: 15, color: PALETTE.yellow })
    this.view.add(retry)
  }
  private async launch(state: RoomState) {
    const match = await fetchMatch(state.room.matchId!)
    const me = getProfile()?.id
    if (!match || !me) { dlog('match-load-failed', { room: state.room.id, match: state.room.matchId }); this.launched = false; return } // the watchdog tries again
    const name = (id: string) => state.seats.find(s => s.playerId === id)?.name ?? '…'
    const launch: OnlineLaunch = { matchId: match.id, roomId: state.room.id, viewer: me === match.player1 ? 'player' : 'ai', names: { player: name(match.player1), ai: name(match.player2) } }
    dlog('launch', { room: state.room.id, match: match.id, viewer: launch.viewer })
    this.stop?.(); this.stop = undefined
    for (const n of [3, 2, 1]) { this.statusText?.setText(t('startingIn', { n })).setColor('#ffd367'); await new Promise(r => setTimeout(r, 700)); if (!this.sys.isActive()) return }
    navigate(this, 'Arena', { match: { player: match.team1, ai: match.team2, seed: match.matchSeed, combatSeed: match.combatSeed, bonus: { player: match.bonus1, ai: match.bonus2 } }, online: launch })
  }

  private seatTexts: Phaser.GameObjects.Text[] = []
  private readyButton?: Phaser.GameObjects.Container
  private statusText?: Phaser.GameObjects.Text
  private buildRoom() {
    const state = this.state!, me = getProfile()?.id
    this.view.removeAll(true); this.cards = []; this.seatTexts = []
    const add = (...o: Phaser.GameObjects.GameObject[]) => this.view.add(o)
    add(panel(this, 240, 175, 330, 92, 0x4a2c8a), text(this, 240, 148, t('roomCode'), 12, '#d9ccff'),
      text(this, 240, 186, state.room.code, 46, '#ffd367').setStroke('#173f46', 6))
    const copy = button(this, 410, 150, t('copyCode'), () => {
      void navigator.clipboard?.writeText(state.room.code); const label = copy.list[1] as Phaser.GameObjects.Text
      label.setText(t('copied')); this.time.delayedCall(1400, () => label.active && label.setText(t('copyCode')))
    }, { width: 100, size: 14 })
    add(copy)
    if (typeof navigator.share === 'function') add(button(this, 410, 208, t('shareCode'), () => void navigator.share({ title: 'Draft Animal Arena', text: `${t('roomCode')}: ${state.room.code}` }).catch(() => {}), { width: 100, size: 14, color: PALETTE.yellow }))
    for (let i = 0; i < 2; i++) {
      add(panel(this, 240, 268 + i * 58, 420, 50, 0x3a2270))
      this.seatTexts.push(text(this, 52, 268 + i * 58, '', 18, '#fff4d9').setOrigin(0, .5), text(this, 428, 268 + i * 58, '', 14, '#d9ccff').setOrigin(1, .5))
    }
    add(...this.seatTexts)
    this.timerText = text(this, 240, 372, '', 22, '#ffd367').setStroke('#173f46', 4)
    this.statusText = text(this, 240, 404, '', 14, '#fff4d9'); add(this.timerText, this.statusText)
    FIGHTERS.forEach((fighter, i) => {
      const card = miniFighterCard(this, fighter, 100, 94, i) // four per row: the roster has eight fighters
      card.root.setPosition(240 + ((i % 4) - 1.5) * 108, 478 + Math.floor(i / 4) * 130)
      card.root.setInteractive(new Phaser.Geom.Rectangle(0, 0, 100, 124), Phaser.Geom.Rectangle.Contains)
      card.root.on('pointerup', () => this.toggle(fighter.id))
      this.cards.push(card); add(card.root)
    })
    this.readyButton = button(this, 240, 690, t('readyBtn'), () => void this.ready(), { color: PALETTE.mint })
    add(this.readyButton, button(this, 240, 765, t('leaveRoom'), () => void this.leave(), { width: 240, size: 15, color: 0xffb9a8 }))
    this.picked = state.seats.find(s => s.playerId === me)?.team ?? []
    this.draw()
  }
  private draw() {
    const state = this.state; if (!state || !this.seatTexts.length) return
    const me = getProfile()?.id
    const names = [state.room.hostId, state.room.guestId]
    names.forEach((id, i) => {
      const seat = state.seats.find(s => s.playerId === id)
      const [label, tag] = [this.seatTexts[i * 2]!, this.seatTexts[i * 2 + 1]!]
      if (!id || !seat) { label.setText(t('waitingOpp')); tag.setText(''); return }
      label.setText(seat.playerId === me ? `${seat.name}  (${t('youTag')})` : seat.name); label.setScale(1)
      if (label.width > 270) label.setScale(270 / label.width)
      tag.setText(`${this.online.has(id) || state.room.status !== 'lobby' ? t('oppOnline') : t('oppOffline')}  •  ${seat.ready ? t('readyBtn') : t('notReadyBtn')}`)
    })
    const mine = state.seats.find(s => s.playerId === me)
    const picked = mine && mine.team.length === 3 ? mine.team : this.picked
    this.cards.forEach((card, i) => card.selected(picked.includes(FIGHTERS[i]!.id)))
    this.statusText?.setText(this.note || (this.starting ? t('startingMatch') : state.seats.length < 2 ? t('waitingOpp') : mine?.team.length === 3 ? '' : t('pickTeam')))
    this.statusText?.setColor(this.note ? '#ffb9a8' : '#fff4d9')
    const label = this.readyButton?.list.find(o => o instanceof Phaser.GameObjects.Text) as Phaser.GameObjects.Text | undefined
    const opponentReady = state.seats.some(s => s.playerId !== me && s.ready)
    label?.setText(!mine?.ready ? t('readyBtn') : opponentReady || this.starting ? t('readyLocked') : t('waitingOpponent'))
    this.readyButton?.setAlpha(mine?.ready || picked.length === 3 ? 1 : .45) // enabled only with three valid fighters
  }
  private toggle(id: string) {
    const state = this.state
    const mineSeat = state?.seats.find(s => s.playerId === getProfile()?.id)
    if (!state || state.room.status === 'in_match' || this.starting || mineSeat?.ready) return // READY locks the selection
    if (!isUnlocked(id)) { this.note = t('lockedTag'); return this.draw() }
    const next = this.picked.includes(id) ? this.picked.filter(f => f !== id) : this.picked.length < 3 ? [...this.picked, id] : this.picked
    if (next === this.picked) return
    audio.effect('tap'); this.picked = next; this.note = ''
    this.draw()
    void saveDraft(state.room.id, next) // partial picks survive a timeout
    if (next.length === 3) void setTeam(state.room.id, next).then(r => { if (!r.ok) { this.note = t('errGeneric') } void this.sync() })
  }
  private async ready() {
    const state = this.state, me = getProfile()?.id
    if (!state || state.seats.length < 2) return
    const mine = state.seats.find(s => s.playerId === me)
    if (!mine || mine.ready) return // READY is a one-way confirmation
    if (this.picked.length !== 3) { this.note = t('pickTeam'); return this.draw() }
    if (mine.team.length !== 3 || this.picked.some(id => !mine.team.includes(id))) { // make sure the server holds exactly what is on screen
      const saved = await setTeam(state.room.id, this.picked)
      if (!saved.ok) { this.note = t('errGeneric'); return this.draw() }
    }
    const result = await setReady(state.room.id, true)
    if (!result.ok) this.note = t('errGeneric')
    void this.sync()
  }
  private async leave() {
    const id = this.roomId; this.stop?.(); this.stop = undefined
    if (id) await leaveRoom(id)
    this.roomId = undefined; this.state = null; this.note = ''
    navigate(this, 'Online')
  }
}
