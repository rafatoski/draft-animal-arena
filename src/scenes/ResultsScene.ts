import Phaser from 'phaser'
import { background, text, button, entrance, navigate, PALETTE } from '../ui/components'
import { t } from '../services/i18n'
import { animalArt } from '../game/animalArt'
import { fighterById } from '../game/fighters'
import { rematch } from '../game/match'
import type { MatchSetup } from '../game/match'
import type { Winner } from '../simulation/combat'
import { audio } from '../services/audio'
import { blackFrame } from '../ui/components'
import { spriteKit, preloadFighterSprites } from '../game/fighterSprites'
import { homeIcon } from '../ui/homeNavigation'
import type { RewardInfo } from '../game/economy'
import { fetchRoomState, getProfile, leaveRoom, rematchRoom, watchRoom } from '../services/online'
export interface ResultData { match: MatchSetup; winner: Winner; seconds: string; survivors: number; score: string; reward?: RewardInfo; online?: { roomId: string; winnerTeam: string[] } }
export class ResultsScene extends Phaser.Scene {
  private practice = false
  constructor() { super('Results') }
  init(data: ResultData) { this.practice = !!data.match.practice }
  preload() { preloadFighterSprites(this, this.practice) }
  create(data: ResultData) {
    this.input.enabled = true
    background(this); entrance(this)
    const win = data.winner === 'player', draw = data.winner === 'draw'
    audio.effect(win ? 'win' : 'lose')
    blackFrame(this, 44, 804)
    text(this, 240, 22, t('club'), 11, '#d9ccff').setDepth(901)
    if (this.practice) text(this, 240, 82, t('practiceNote'), 11, '#ffd367')
    if (data.online) text(this, 240, 82, t('onlineMatch'), 11, '#ffd367')
    const title = text(this, 240, 128, t(draw ? 'draw' : win ? 'victory' : 'defeat'), 49, win ? '#ffd367' : '#fff4d9').setStroke('#173f46', 7).setScale(.5)
    this.tweens.add({ targets: title, scale: 1, duration: 450, ease: 'Back.Out' })
    text(this, 240, 190, t(draw ? 'drawSub' : win ? 'winSub' : 'loseSub'), 16, '#efe6ff')
    text(this, 240, 232, t('finalScore', { score: data.score }), 22, '#fff4d9').setStroke('#173f46', 4)
    const team = data.online ? data.online.winnerTeam : data.winner === 'ai' ? data.match.ai : data.match.player
    team.forEach((id, i) => {
      const fighter = fighterById(id)
      const kit = spriteKit(fighter)
      const art = (kit ? this.add.container(0, 0, [kit.create(this)]) : animalArt(this, fighter)).setPosition(122 + i * 118, 322).setScale(1.25)
      this.tweens.add({ targets: art, y: 311, angle: i % 2 ? 6 : -6, duration: 750 + i * 150, repeat: -1, yoyo: true, ease: 'Sine.InOut' })
    })
    text(this, 240, 389, t('duration', { seconds: data.seconds }), 18, '#fff4d9').setStroke('#49356e', 3)
    text(this, 240, 429, t('standing', { count: data.survivors }), 15, '#fff4d9')
    text(this, 240, 458, t('winnerIs', { team: t(win ? 'yours' : 'rivals') }), 14, '#ffd367')
    if (data.online) {
      // Online: the rematch is decided in the lobby (both players ready up again); coins come from the server.
      this.rewardBlock(data.reward, 488)
      const status = text(this, 240, 621, t('rematchHint'), 12, '#d7f4d9').setWordWrapWidth(400)
      const roomId = data.online.roomId
      button(this, 240, 576, t('rematch'), () => void this.requestRematch(roomId, status), { color: PALETTE.yellow })
      button(this, 240, 690, t('home'), () => { void leaveRoom(roomId); navigate(this, 'Menu') }, { color: PALETTE.cream })
      this.watchRematch(roomId, status)
    } else {
      this.rewardBlock(data.reward, 488)
      button(this, 240, 566, t('rematch'), () => navigate(this, 'Arena', { match: rematch(data.match) }), { color: PALETTE.yellow })
      text(this, 240, 611, t('rematchHint'), 12, '#d7f4d9')
      button(this, 240, 654, t('again'), () => navigate(this, 'Arena', { fresh: true, practice: this.practice }))
      text(this, 240, 699, t('againHint'), 12, '#d7f4d9')
      button(this, 240, 752, t('home'), () => navigate(this, 'Menu'), { color: PALETTE.cream })
    }
    text(this, 240, 824, `${t('seed')}  ${data.match.seed}`, 10, '#d9ccff').setDepth(901)
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return
      if (event.key === 'Enter' || event.key === ' ') {
        audio.unlock()
        if (data.online) return; else navigate(this, 'Arena', { fresh: true, practice: this.practice })
      }
    }
    this.input.keyboard?.on('keydown', onKey)
    this.events.once('shutdown', () => this.input.keyboard?.off('keydown', onKey))
    if (win) for (let i = 0; i < 35; i++) {
      const confetti = this.add.rectangle((i * 73) % 480, -20 - i * 18, 7, 13, [PALETTE.yellow, PALETTE.coral, PALETTE.mint][i % 3]).setDepth(10)
      this.tweens.add({ targets: confetti, y: 860, angle: 240 + i * 20, duration: 2300 + i * 40, delay: i * 30, onComplete: () => confetti.destroy() })
    }
  }
  /** Shows only what the server (or the guest session) actually granted; a failed save says so instead of pretending. */
  private rewardBlock(reward: RewardInfo | undefined, y: number) {
    if (!reward) return
    const line = (icon: 'coin' | 'gems', label: string, dy: number) => {
      const row = text(this, 240, y + dy, label, 20, '#ffd367').setStroke('#173f46', 4)
      homeIcon(this, icon).setScale(.8).setPosition(240 - row.width / 2 - 24, y + dy)
    }
    if (reward.status === 'ok' || reward.status === 'session') {
      line('coin', t('rewardCoins', { n: reward.coins }), 0)
      if (reward.status === 'ok' && reward.diamonds > 0) line('gems', t(reward.diamonds === 1 ? 'rewardDiamond' : 'rewardDiamonds', { n: reward.diamonds }), 30)
      if (reward.status === 'session') text(this, 240, y + 28, t('rewardSession'), 11, '#d9ccff')
    } else text(this, 240, y + 8, t(reward.status === 'limited' ? 'rewardLimited' : 'rewardFailed'), 13, '#ffb9a8').setWordWrapWidth(380)
  }
  /** A rematch needs both players: this casts our vote; the room reopens in the lobby only when the opponent has also accepted. */
  private async requestRematch(roomId: string, status: Phaser.GameObjects.Text) {
    const result = await rematchRoom(roomId)
    if (!this.sys.isActive()) return
    if (result.ok && result.value) return navigate(this, 'Lobby', { roomId })
    status.setText(t(result.ok ? 'rematchWaiting' : 'errGeneric')).setColor('#ffd367')
  }
  /** Live room updates: the opponent's request, the room reopening (go to the lobby), or the opponent leaving. */
  private watchRematch(roomId: string, status: Phaser.GameObjects.Text) {
    const me = getProfile()?.id ?? ''
    const stop = watchRoom(roomId, me, () => void (async () => {
      const state = await fetchRoomState(roomId)
      if (!state || !this.sys.isActive()) return
      if (state.room.status === 'lobby') return navigate(this, 'Lobby', { roomId })
      if (state.room.status === 'closed' || !state.room.guestId) return void status.setText(t('opponentLeft')).setColor('#ffb9a8')
      const mine = state.seats.find(s => s.playerId === me), theirs = state.seats.find(s => s.playerId !== me)
      if (theirs?.rematch && !mine?.rematch) status.setText(t('rematchAsked')).setColor('#ffd367')
    })(), () => {})
    this.events.once('shutdown', stop)
  }
}
