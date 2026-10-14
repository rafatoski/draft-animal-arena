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
export interface ResultData { match: MatchSetup; winner: Winner; seconds: string; survivors: number; score: string }
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
    const title = text(this, 240, 128, t(draw ? 'draw' : win ? 'victory' : 'defeat'), 49, win ? '#ffd367' : '#fff4d9').setStroke('#173f46', 7).setScale(.5)
    this.tweens.add({ targets: title, scale: 1, duration: 450, ease: 'Back.Out' })
    text(this, 240, 190, t(draw ? 'drawSub' : win ? 'winSub' : 'loseSub'), 16, '#efe6ff')
    text(this, 240, 232, t('finalScore', { score: data.score }), 22, '#fff4d9').setStroke('#173f46', 4)
    const team = data.winner === 'ai' ? data.match.ai : data.match.player
    team.forEach((id, i) => {
      const fighter = fighterById(id)
      const kit = spriteKit(fighter)
      const art = (kit ? this.add.container(0, 0, [kit.create(this)]) : animalArt(this, fighter)).setPosition(122 + i * 118, 322).setScale(1.25)
      this.tweens.add({ targets: art, y: 311, angle: i % 2 ? 6 : -6, duration: 750 + i * 150, repeat: -1, yoyo: true, ease: 'Sine.InOut' })
    })
    text(this, 240, 389, t('duration', { seconds: data.seconds }), 18, '#fff4d9').setStroke('#49356e', 3)
    text(this, 240, 429, t('standing', { count: data.survivors }), 15, '#fff4d9')
    text(this, 240, 458, t('winnerIs', { team: t(win ? 'yours' : 'rivals') }), 14, '#ffd367')
    button(this, 240, 526, t('rematch'), () => navigate(this, 'Arena', { match: rematch(data.match) }), { color: PALETTE.yellow })
    text(this, 240, 571, t('rematchHint'), 12, '#d7f4d9')
    button(this, 240, 624, t('again'), () => navigate(this, 'Arena', { fresh: true, practice: this.practice }))
    text(this, 240, 669, t('againHint'), 12, '#d7f4d9')
    button(this, 240, 722, t('home'), () => navigate(this, 'Menu'), { color: PALETTE.cream })
    text(this, 240, 824, `${t('seed')}  ${data.match.seed}`, 10, '#d9ccff').setDepth(901)
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return
      if (event.key === 'Enter' || event.key === ' ') {
        audio.unlock(); navigate(this, 'Arena', { fresh: true, practice: this.practice })
      }
    }
    this.input.keyboard?.on('keydown', onKey)
    this.events.once('shutdown', () => this.input.keyboard?.off('keydown', onKey))
    if (win) for (let i = 0; i < 35; i++) {
      const confetti = this.add.rectangle((i * 73) % 480, -20 - i * 18, 7, 13, [PALETTE.yellow, PALETTE.coral, PALETTE.mint][i % 3]).setDepth(10)
      this.tweens.add({ targets: confetti, y: 860, angle: 240 + i * 20, duration: 2300 + i * 40, delay: i * 30, onComplete: () => confetti.destroy() })
    }
  }
}
