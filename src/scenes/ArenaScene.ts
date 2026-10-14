import Phaser from 'phaser'
import { exitControl } from '../ui/exitControl'
import { preloadColosseum, preloadHeart, HEART_TEXTURE } from '../game/assets'
import { getGuest, guestPracticeWin } from '../services/guest'
import type { RewardInfo } from '../game/economy'
import { createColosseum } from '../rendering/colosseum'
import { sourceToWorld } from '../rendering/battlefield'
import { DPR } from '../rendering/pixelRatio'
import { arenaLayout, portraitLayout } from '../rendering/layout'
import { CONFIG } from '../game/config'
import { FIGHTERS } from '../game/fighters'
import { animalArt } from '../game/animalArt'
import { fireLaser } from '../game/robotArt'
import { spriteKit, preloadFighterSprites } from '../game/fighterSprites'
import type { SpriteKit } from '../game/spriteKit'
import { CombatSimulation } from '../simulation/combat'
import type { CombatEvent, Team, Unit, Winner } from '../simulation/combat'
import { fetchReward, getProfile, ownedFighters, practiceMatch, refreshProfile, waitForResult } from '../services/online'
import { draftMatch, newSeed } from '../game/match'
import { newSeries, recordRound, roundSeed, isFinalRound, WINS_NEEDED } from '../game/series'
import type { Series } from '../game/series'
import type { MatchSetup } from '../game/match'
import { t, fighterName } from '../services/i18n'
import { audio } from '../services/audio'
import { panel, entrance, navigate, PALETTE } from '../ui/components'
import { miniFighterCard } from '../ui/miniFighterCard'
import { preloadCardArt } from '../ui/collectibleCard'
import { GAME_FONT_FAMILY } from '../ui/typography'
import { battleBackground } from '../ui/arcadeBackground'

type Phase = 'ready' | 'draft' | 'countdown' | 'battle' | 'roundEnd' | 'result'
interface UnitView { root: Phaser.GameObjects.Container; art: Phaser.GameObjects.Container; health: Phaser.GameObjects.Graphics; hpText: Phaser.GameObjects.Text; name: Phaser.GameObjects.Text
  /** Spritesheet fighters only. `busy` is the one-shot priority: 0 none, 1 attack, 2 hit, 3 death. */
  sprite?: Phaser.GameObjects.Sprite; kit?: SpriteKit; busy: number; px: number; py: number }
/** Online match handed over by the lobby: the server's match id, which side this viewer is, and both names. */
export interface OnlineLaunch { matchId: string; roomId: string; viewer: Team; names: { player: string; ai: string } }
const RIVAL_NAMES = ['Rocky', 'Luna', 'Max', 'Bella', 'Rex', 'Nova'] // demo opponent names until real matchmaking exists
const C = { cream: '#fff4d9', muted: '#d9ccff', mint: '#d4f5aa', ink: 0x173f46 }
export class ArenaScene extends Phaser.Scene {
  private phase: Phase = 'ready'
  private ui!: Phaser.GameObjects.Container
  private status!: Phaser.GameObjects.Text
  private subtitle!: Phaser.GameObjects.Text
  private draftClock?: Phaser.GameObjects.Text
  private cards: ReturnType<typeof miniFighterCard>[] = []
  private match!: MatchSetup
  private draftBar?: Phaser.GameObjects.Graphics
  private selection: string[] = []
  private draftRemaining = CONFIG.draftMs as number
  private accumulator = 0
  private simulation?: CombatSimulation
  private views = new Map<number, UnitView>()
  private seed = 0
  private world!: Phaser.GameObjects.Layer
  private hud!: Phaser.GameObjects.Layer
  private hudCamera!: Phaser.Cameras.Scene2D.Camera
  private title!: Phaser.GameObjects.Text
  private exit!: Phaser.GameObjects.Container
  private hudBackdrop!: Phaser.GameObjects.Graphics
  private series: Series = newSeries()
  private totalTicks = 0
  private roundNote = ''
  private scoreboard!: Phaser.GameObjects.Container
  private scoreGfx!: Phaser.GameObjects.Graphics
  private roundText!: Phaser.GameObjects.Text
  private scoreText!: Phaser.GameObjects.Text
  private counts!: Record<'player' | 'ai', Phaser.GameObjects.Text>
  private hearts!: Record<'player' | 'ai', Phaser.GameObjects.Image[]>
  private practice = false
  private online?: OnlineLaunch
  /** Whose team is shown at the bottom, in friendly colours and on the left of the scoreboard. */
  private viewer: Team = 'player'
  /** Practice reward verified by the server before the replay starts; shown on the results screen only after the fight. */
  private practiceReward?: RewardInfo
  private serverPracticeWin?: boolean

  constructor() { super('Arena') }
  init(data: { match?: MatchSetup; practice?: boolean; online?: OnlineLaunch } = {}) {
    this.practice = !!(data.practice || data.match?.practice); this.online = data.online; this.viewer = data.online?.viewer ?? 'player'
    this.practiceReward = undefined; this.serverPracticeWin = undefined
  }
  /** The world is mirrored top-to-bottom for the 'ai' viewer so their own team is always at the bottom. */
  private vy(y: number) { return this.viewer === 'player' ? y : 870 - y }
  private other(team: Team): Team { return team === 'player' ? 'ai' : 'player' }
  private at(unit: { x: number; y: number }) { return { x: unit.x, y: this.vy(unit.y) } }
  preload() { preloadColosseum(this); preloadHeart(this); preloadFighterSprites(this, this.practice); preloadCardArt(this, FIGHTERS) }
  create(data: { match?: MatchSetup; fresh?: boolean; practice?: boolean; online?: OnlineLaunch } = {}) {
    battleBackground()
    this.input.enabled = true
    this.phase = 'ready'; this.selection = []; this.cards = []; this.views.clear()
    this.simulation = undefined; this.series = newSeries(); this.totalTicks = 0; this.roundNote = ''; this.accumulator = 0; this.draftRemaining = CONFIG.draftMs
    this.draftClock = undefined; this.draftBar = undefined
    const supplied = new URLSearchParams(location.search).get('seed')
    this.seed = !data.fresh && supplied !== null && /^\d+$/.test(supplied) ? Number(supplied) >>> 0 : newSeed()
    this.cameras.main.setBackgroundColor('#000000')
    this.world = this.add.layer()
    this.hud = this.add.layer().setDepth(2000)
    this.hudCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height, false, 'HUD')
    this.hudCamera.ignore(this.world)
    this.cameras.main.ignore(this.hud)
    this.drawArena(); entrance(this)
    this.hudCamera.fadeIn(200, 27, 16, 48)
    this.cameras.main.on('camerafadeoutstart', () => this.hudCamera.fadeOut(160, 27, 16, 48))
    this.hudBackdrop = this.add.graphics()
    this.hud.add(this.hudBackdrop)
    this.title = this.label(240, 34, 'ANIMAL ARENA', 27, C.cream).setOrigin(.5).setFontStyle('bold').setStroke('#173f46', 4)
    this.status = this.label(240, 102, '', 22, C.cream).setOrigin(.5).setFontStyle('bold')
    this.subtitle = this.label(240, 139, '', 13, C.muted).setOrigin(.5)
    this.ui = this.add.container(0, 0).setDepth(1000)
    this.hud.add(this.ui)
    this.exit = exitControl(this, () => navigate(this, 'Menu')).setDepth(1100)
    this.hud.add(this.exit)
    this.buildScoreboard(data.match?.seed ?? this.seed)
    this.scale.on(Phaser.Scale.Events.RESIZE, this.resizeArena, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.resizeArena, this))
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return
      if (event.key === 'Escape') navigate(this, 'Menu')
      if (/^[1-6]$/.test(event.key)) { audio.unlock(); this.select(Number(event.key) - 1) }
    }
    this.input.keyboard?.on('keydown', onKey)
    this.events.once('shutdown', () => this.input.keyboard?.off('keydown', onKey))
    if (data.match) {
      this.match = data.match; this.seed = data.match.seed
      this.selection = [...data.match.player]
      if (this.practice && getProfile()) void this.startVerifiedPractice(); else this.beginBattle() // a rematch is a new server-verified match too
    } else this.startDraft()
    this.resizeArena()
  }
  private label(x: number, y: number, text: string, size: number, color: string) {
    const label = this.add.text(x, y, text, { fontFamily: GAME_FONT_FAMILY, fontSize: size, color })
    this.hud.add(label)
    return label
  }
  private drawArena() {
    createColosseum(this, this.world)
    // Team names sit on the two green banners painted into the arena art (source-image landmarks).
    for (const [sy, key] of [[134.5, 'other'], [808, 'weirdos']] as const) {
      const at = sourceToWorld(836, sy)
      const label = this.label(at.x, at.y, t(key), 17, '#ffffff').setOrigin(.5).setStroke('#173f46', 6).setDepth(-60)
      if (label.width > 190) label.setScale(190 / label.width)
      this.world.add(label)
    }
  }
  private resizeArena() {
    // Layout runs in CSS pixels; cameras get device-pixel viewports and DPR-scaled zoom.
    const width = this.scale.width / DPR, height = this.scale.height / DPR
    const layout = arenaLayout(width, height)
    // Camera dimensions and zoom change; world coordinates and simulation never do.
    this.cameras.main.setViewport(layout.viewport.x * DPR, layout.viewport.y * DPR, layout.viewport.width * DPR, layout.viewport.height * DPR)
      .setZoom(layout.zoom * DPR).centerOn(layout.centerX, layout.centerY)
    const drafting = this.phase === 'ready' || this.phase === 'draft'
    this.hudBackdrop.clear()
    if (drafting) {
      const fit = portraitLayout(this.scale.width, this.scale.height)
      this.hudCamera.setViewport(fit.x, fit.y, fit.width, fit.height).setZoom(fit.zoom).centerOn(240, 420)
      this.hudBackdrop.fillStyle(0x2b1a55, 1).fillRect(0, 0, 480, 840)
        .fillStyle(0x000000).fillRect(0, 0, 480, 66).fillRect(0, 780, 480, 60)
      this.title.setVisible(true).setPosition(240, 34).setFontSize(27)
      this.status.setPosition(240, 102).setFontSize(22)
      this.subtitle.setVisible(true).setPosition(240, 139).setFontSize(13)
      this.status.setVisible(true)
      this.scoreboard.setVisible(false)
      this.exit.setVisible(true).setPosition(30, 34).setScale(1)
    } else {
      this.hudCamera.setViewport(0, 0, this.scale.width, this.scale.height).setZoom(DPR).centerOn(width / 2, height / 2)
      this.title.setVisible(false); this.status.setVisible(false); this.subtitle.setVisible(false)
      this.exit.setVisible(false)
      this.scoreboard.setVisible(true).setPosition(width / 2, 4).setScale(Math.min(1, (width - 16) / 420, ((height < 500 ? 62 : 96) - 6) / (this.practice ? 84 : 80)))
    }
  }
  private startDraft() {
    if (this.phase !== 'ready') return
    this.phase = 'draft'; this.ui.removeAll(true)
    this.status.setText(t('draft'))
    this.subtitle.setText(t('choose'))
    this.ui.add(panel(this, 240, 438, 456, 566, 0x4a2c8a))
    this.draftClock = this.label(240, 183, '', 19, C.cream).setOrigin(.5).setFontStyle('bold')
    this.draftBar = this.add.graphics()
    this.ui.add([this.draftClock, this.draftBar])
    FIGHTERS.forEach((fighter, i) => {
      const card = miniFighterCard(this, fighter, 130, 150, i)
      card.root.setPosition(240 + ((i % 3) - 1) * 146, 345 + Math.floor(i / 3) * 215).setInteractive({ useHandCursor: true })
      card.root.on('pointerdown', () => { audio.unlock(); this.select(i) })
      this.cards.push(card); this.ui.add(card.root)
    })
    this.ui.add(this.label(240, 810, t('auto'), 11, C.muted).setOrigin(.5))
    this.updateDraftClock()
  }
  private select(index: number) {
    if (this.phase !== 'draft') return
    const id = FIGHTERS[index]!.id
    if (this.cards[index]!.locked) { // locked until bought: shake instead of selecting
      this.tweens.add({ targets: this.cards[index]!.root, angle: 2, duration: 45, yoyo: true, repeat: 2 }); return
    }
    if (this.selection.includes(id)) this.selection = this.selection.filter(value => value !== id)
    else if (this.selection.length < 3) this.selection.push(id)
    else {
      this.tweens.add({ targets: this.cards[index]!.root, angle: 2, duration: 45, yoyo: true, repeat: 2 })
      return
    }
    audio.effect('tap')
    this.cards.forEach((card, i) => card.selected(this.selection.includes(FIGHTERS[i]!.id)))
    this.updateDraftClock()
  }
  private updateDraftClock() {
    this.draftClock?.setText(`${(this.draftRemaining / 1000).toFixed(1)}s  •  ${this.selection.length} / 3 ${t('picked')}`)
    this.draftBar?.clear().fillStyle(0x164e50).fillRoundedRect(42, 204, 396, 7, 3)
      .fillStyle(this.draftRemaining < 1500 ? PALETTE.coral : PALETTE.yellow).fillRoundedRect(42, 204, Math.max(1, 396 * this.draftRemaining / CONFIG.draftMs), 7, 3)
  }
  private lockDraft() {
    this.match = draftMatch(this.selection, this.seed, this.practice, ownedFighters())
    this.selection = [...this.match.player]
    if (this.practice && getProfile()) void this.startVerifiedPractice(); else this.beginBattle()
  }
  /** Signed-in practice: the server picks the seed, simulates the match and records the reward; this scene only replays it. */
  private async startVerifiedPractice() {
    this.phase = 'countdown' // inert while waiting for the server
    const launch = await practiceMatch(this.match.player)
    if (!this.sys.isActive()) return
    if (launch) {
      this.match = { ...this.match, ai: launch.robots, combatSeed: launch.combatSeed }
      this.serverPracticeWin = launch.playerWon
      this.practiceReward = !launch.playerWon ? undefined : launch.limited ? { status: 'limited' } : { status: 'ok', coins: launch.coins, diamonds: 0 }
    } else this.practiceReward = { status: 'failed' } // still playable, but no reward is claimed
    this.beginBattle()
  }
  private beginBattle() {
    this.series = newSeries(); this.totalTicks = 0
    this.startRound()
  }
  /** Round-level reset: a fresh simulation restores HP, cooldowns and spawn positions. */
  private startRound() {
    this.phase = 'countdown'; this.ui.removeAll(true)
    this.draftClock = undefined; this.draftBar = undefined
    for (const view of this.views.values()) { this.tweens.killTweensOf([view.root, view.art]); view.root.destroy() }
    this.views.clear(); this.accumulator = 0
    this.simulation = new CombatSimulation(this.match.player, this.match.ai, roundSeed(this.match.combatSeed, this.series.attempt))
    for (const unit of this.simulation.units) this.createUnit(unit)
    this.updateHud(); this.resizeArena()
    // Every round: title banner, 3-2-1, then FIGHT!
    this.banner(isFinalRound(this.series) ? t('finalRound') : t('roundN', { n: this.series.round }),
      this.series.attempt === 0 ? t('bottom') : this.roundNote, this.series.attempt === 0 ? 1300 : 1700, () => this.countdown())
  }
  private fight() {
    this.phase = 'battle'; this.accumulator = 0
    this.banner(t('fightNow'), '', 550, () => {})
  }
  private countdown() {
    const count = this.label(240, 433, '3', 100, C.cream).setOrigin(.5).setStroke('#173f46', 8).setDepth(1100)
    this.world.add(count)
    const pulse = () => {
      count.setScale(1.35).setAlpha(.5)
      this.tweens.add({ targets: count, scale: 1, alpha: 1, duration: 320, ease: 'Back.Out' })
      audio.effect('count')
    }
    pulse()
    let remaining = 3
    this.time.addEvent({ delay: 1000, repeat: 2, callback: () => {
      remaining--
      if (remaining > 0) { count.setText(String(remaining)); pulse() }
      else { count.destroy(); this.fight() }
    } })
  }
  /** Floating round title; combat stays paused until `done` runs. */
  private banner(title: string, note: string, hold: number, done: () => void) {
    const w = this.scale.width / DPR, y = this.scale.height / DPR * .38
    const big = this.label(w / 2, y, title, 52, C.cream).setOrigin(.5).setStroke('#173f46', 8).setAlpha(0)
    const small = this.label(w / 2, y + 46, note, 15, C.mint).setOrigin(.5).setStroke('#173f46', 4).setAlpha(0)
    const fit = Math.min(1, (w - 24) / Math.max(big.width, small.width))
    big.setScale(fit * .4); small.setScale(fit)
    audio.effect('count')
    this.tweens.add({ targets: big, scale: fit, alpha: 1, duration: 300, ease: 'Back.Out' })
    this.tweens.add({ targets: small, alpha: 1, duration: 300 })
    this.time.delayedCall(hold, () => this.tweens.add({ targets: [big, small], alpha: 0, duration: 250,
      onComplete: () => { big.destroy(); small.destroy(); done() } }))
  }
  private createUnit(unit: Unit) {
    const ring = this.add.ellipse(0, 24, 73, 23, unit.team === this.viewer ? 0xb9ec91 : 0xf69383, .6)
    const kit = spriteKit(unit.definition)
    const sprite = kit?.create(this)
    const art = sprite ? this.add.container(0, 0, [sprite]) : animalArt(this, unit.definition)
    const health = this.add.graphics()
    const name = this.add.text(0, -73, fighterName(unit.definition.id), { fontFamily: GAME_FONT_FAMILY, fontSize: 11, color: C.cream }).setOrigin(.5).setStroke('#173f46', 3)
    if (name.width > 84) name.setScale(84 / name.width)
    const hpText = this.add.text(0, -55.5, '', { fontFamily: GAME_FONT_FAMILY, fontSize: 9, color: C.cream }).setOrigin(.5).setStroke('#173f46', 3)
    const root = this.add.container(unit.x, this.vy(unit.y), [ring, art, health, name, hpText])
    this.world.add(root)
    const view: UnitView = { root, art, health, hpText, name, sprite, kit, busy: 0, px: unit.x, py: this.vy(unit.y) }
    // Clears the one-shot lock; the sprite owns this listener, so it is destroyed with it each round.
    sprite?.on(Phaser.Animations.Events.ANIMATION_COMPLETE, (anim: Phaser.Animations.Animation) => {
      if (anim.key === kit!.anims.attack || anim.key === kit!.anims.hit) view.busy = 0
    })
    this.views.set(unit.id, view)
    this.drawHealth(unit)
  }
  private drawHealth(unit: Unit) {
    const { health, hpText } = this.views.get(unit.id)!
    health.clear().fillStyle(0x173f46).fillRoundedRect(-35, -62, 70, 13, 5)
    health.lineStyle(1, 0xfff4d9, .7).strokeRoundedRect(-35, -62, 70, 13, 5)
    if (unit.hp > 0) health.fillStyle(unit.team === this.viewer ? 0x6fdc6f : 0xff6b5a).fillRoundedRect(-32, -59, Math.max(2, 64 * unit.hp / unit.definition.health), 7, 3)
    hpText.setText(`${unit.hp}/${unit.definition.health}`)
  }
  private buildScoreboard(seed: number) {
    this.scoreGfx = this.add.graphics()
    this.roundText = this.label(0, 14, '', 14, C.cream).setOrigin(.5).setStroke('#173f46', 4)
    this.scoreText = this.label(0, 44, '', 30, C.cream).setOrigin(.5).setStroke('#173f46', 5)
    const side = { player: -122, ai: 122 }
    const names = this.online
      ? { player: this.online.names[this.viewer], ai: this.online.names[this.other(this.viewer)] } // left = me, right = opponent
      : { player: getProfile()?.displayName ?? getGuest()?.name ?? t('guest'), ai: this.practice ? t('botTeam') : RIVAL_NAMES[seed % RIVAL_NAMES.length]! }
    const parts: Phaser.GameObjects.GameObject[] = [this.scoreGfx, this.roundText, this.scoreText]
    if (this.practice) parts.push(this.label(0, 74, t('practice'), 13, '#ffd367').setOrigin(.5).setStroke('#173f46', 4))
    const counts: Partial<typeof this.counts> = {}, hearts: Partial<typeof this.hearts> = {}
    for (const team of ['player', 'ai'] as const) {
      const color = "#ffffff"
      const name = this.label(side[team] - 74, 21, names[team], 19, C.cream).setOrigin(0, .5).setStroke('#173f46', 4)
      if (name.width > 104) name.setScale(104 / name.width)
      counts[team] = this.label(side[team] + 74, 21, '', 17, color).setOrigin(1, .5).setStroke('#173f46', 4)
      hearts[team] = [0, 1].map(i => {
        const heart = this.add.image(side[team] + (i - .5) * 38, 62, HEART_TEXTURE)
        this.hud.add(heart)
        return heart.setScale(32 / heart.height)
      })
      parts.push(name, counts[team]!, ...hearts[team]!)
    }
    this.counts = counts as typeof this.counts; this.hearts = hearts as typeof this.hearts
    this.scoreboard = this.add.container(0, 0, parts).setVisible(false)
    this.hud.add(this.scoreboard)
  }
  /** Hearts = rounds left before elimination; bar = fighters alive (not HP). */
  private updateHud() {
    const g = this.scoreGfx.clear(), sim = this.simulation
    for (const [team, cx, fill] of [['player', -122, 0x4fe05a], ['ai', 122, 0xff5a3c]] as const) {
      const real = team === 'player' ? this.viewer : this.other(this.viewer) // display side -> simulation team
      const alive = sim ? sim.units.filter(u => u.team === real && u.hp > 0).length : CONFIG.teamSize
      // One continuous bar that drains in thirds: each third is one fighter.
      g.fillStyle(0x173f46, .85).fillRoundedRect(cx - 84, 2, 168, 38, 12)
      if (alive > 0) g.fillStyle(fill).fillRoundedRect(cx - 80, 6, 160 * alive / CONFIG.teamSize, 30, 9)
        .fillStyle(0xffffff, .35).fillRoundedRect(cx - 76, 9, Math.max(0, 152 * alive / CONFIG.teamSize), 6, 3)
      g.lineStyle(4, 0x173f46).strokeRoundedRect(cx - 84, 2, 168, 38, 12)
      this.counts[team].setText(`${alive}/${CONFIG.teamSize}`)
      // Both teams start with WINS_NEEDED hearts and lose one per round lost.
      const lives = WINS_NEEDED - this.series.wins[this.other(real)]
      this.hearts[team].forEach((heart, i) => i < lives ? heart.clearTint().setAlpha(1) : heart.setTint(0x7a6a90).setAlpha(.55))
    }
    this.roundText.setText(isFinalRound(this.series) ? t('finalRound') : t('roundN', { n: this.series.round })).setScale(1)
    if (this.roundText.width > 80) this.roundText.setScale(80 / this.roundText.width)
    this.scoreText.setText(`${this.series.wins[this.viewer]} - ${this.series.wins[this.other(this.viewer)]}`)
  }
  /** DEATH > HIT > ATTACK: a lower-priority one-shot never interrupts a higher one, and death plays once. */
  private playOneShot(view: UnitView, kind: 'attack' | 'hit' | 'death') {
    if (!view.sprite) return
    const rank = { attack: 1, hit: 2, death: 3 }[kind]
    if (view.busy === 3 || view.busy > rank) return
    view.sprite.play(view.kit!.anims[kind]); view.busy = rank
  }
  private showEvent(event: CombatEvent) {
    if (event.type === 'hit') {
      audio.effect(event.critical ? 'crit' : 'hit')
      const view = this.views.get(event.target)!, source = this.views.get(event.source)!
      const target = this.simulation!.units[event.target]!
      const attacker = this.simulation!.units[event.source]!
      if (attacker.definition.robot) fireLaser(this, this.world, this.at(attacker), this.at(target))
      else {
        const line = this.add.graphics().setDepth(800)
        this.world.add(line)
        line.lineStyle(event.critical ? 5 : 2, attacker.definition.range > 60 ? 0xe6c2ff : 0xfff4d2, .8)
        line.lineBetween(attacker.x, this.vy(attacker.y), target.x, this.vy(target.y))
        this.tweens.add({ targets: line, alpha: 0, duration: 140, onComplete: () => line.destroy() })
      }
      if (source.sprite) source.sprite.setFlipX(source.kit!.flip(target.x - attacker.x))
      this.playOneShot(source, 'attack')
      if (target.hp > 0) this.playOneShot(view, 'hit')
      this.tweens.killTweensOf(view.art)
      view.art.setX(0).setAlpha(.6)
      this.tweens.add({ targets: view.art, x: 5, alpha: 1, duration: 65, yoyo: true, repeat: 1, onComplete: () => view.art.setX(0).setAlpha(1) })
      if (!source.sprite) this.tweens.add({ targets: source.art, scaleX: 1.1, scaleY: .9, duration: 85, yoyo: true })
      const damage = this.label(target.x, this.vy(target.y) - 70, `${event.critical ? t('critical') + ' ' : ''}−${event.damage}`, event.critical ? 22 : 18, event.critical ? '#ffe28d' : '#ffffff').setOrigin(.5).setStroke('#253344', 4).setDepth(900)
      this.world.add(damage)
      this.tweens.add({ targets: damage, y: damage.y - 42, alpha: 0, duration: 750, onComplete: () => damage.destroy() })
      this.drawHealth(target)
    } else if (event.type === 'death') {
      const view = this.views.get(event.target)!
      this.tweens.killTweensOf(view.art)
      if (view.sprite) { view.art.setX(0).setAlpha(1); this.playOneShot(view, 'death') }
      else this.tweens.add({ targets: view.root, angle: 90, alpha: .18, scale: .7, duration: 350 })
      view.health.clear(); view.hpText.setVisible(false); view.name.setVisible(false)
      this.updateHud()
      const quip = this.label(view.root.x, view.root.y - 35, [t('nap'), t('oof'), t('meant')][event.target % 3]!, 13, C.cream).setOrigin(.5).setDepth(900)
      this.world.add(quip)
      this.tweens.add({ targets: quip, y: quip.y - 35, alpha: 0, duration: 1000, onComplete: () => quip.destroy() })
    } else {
      if (this.phase === 'battle') this.endRound(event.winner)
    }
  }
  /** `phase` leaves 'battle' synchronously, so a round can only be scored once. */
  private endRound(winner: Winner) {
    this.phase = 'roundEnd'
    this.totalTicks += this.simulation!.tick
    this.series = recordRound(this.series, winner)
    this.updateHud()
    if (this.series.winner) { this.phase = 'result'; this.time.delayedCall(750, () => this.online ? void this.showOnlineResult() : void this.showResult()); return }
    this.roundNote = t(winner === 'draw' ? 'roundDraw' : winner === this.viewer ? 'roundYou' : 'roundRival')
    this.time.delayedCall(1000, () => this.startRound())
  }
  /** The server's stored result is the verdict; the local replay only has to look the same. */
  private async showOnlineResult() {
    const online = this.online!, me = getProfile()?.id
    const match = await waitForResult(online.matchId)
    await refreshProfile()
    const iWon = match ? match.winnerId === me : this.series.winner === this.viewer
    if (match && match.winnerId && (match.winnerId === me) !== (this.series.winner === this.viewer)) console.warn('[online] local replay disagrees with the server result; showing the server result')
    const mine = match ? (this.viewer === 'player' ? match.score1 : match.score2) ?? 0 : this.series.wins[this.viewer]
    const theirs = match ? (this.viewer === 'player' ? match.score2 : match.score1) ?? 0 : this.series.wins[this.other(this.viewer)]
    const paid = iWon ? await fetchReward(online.matchId) : null
    const reward: RewardInfo | undefined = !iWon ? undefined : paid ? { status: 'ok', ...paid } : { status: 'failed' }
    navigate(this, 'Results', {
      match: this.match, winner: iWon ? 'player' : 'ai', seconds: (this.totalTicks * CONFIG.tickMs / 1000).toFixed(1),
      survivors: this.simulation!.units.filter(u => u.hp > 0 && u.team === this.viewer).length, score: `${mine}-${theirs}`,
      reward, online: { roomId: online.roomId, winnerTeam: iWon ? (this.viewer === 'player' ? this.match.player : this.match.ai) : (this.viewer === 'player' ? this.match.ai : this.match.player) },
    })
  }
  private async showResult() {
    const winner = this.serverPracticeWin === undefined ? this.series.winner! : this.serverPracticeWin ? 'player' : 'ai' // the server's verdict wins
    let reward = this.practiceReward
    if (this.practice && winner === 'player' && !getProfile() && getGuest()) reward = { status: 'session', coins: guestPracticeWin() }
    if (reward?.status === 'ok') await refreshProfile() // balances shown elsewhere now match the server
    if (!this.sys.isActive()) return
    navigate(this, 'Results', {
      match: this.match, winner, reward,
      seconds: (this.totalTicks * CONFIG.tickMs / 1000).toFixed(1),
      survivors: this.simulation!.units.filter(u => u.hp > 0 && u.team === winner).length,
      score: `${this.series.wins.player}-${this.series.wins.ai}`,
    })
  }
  update(_time: number, delta: number) {
    if (this.phase === 'draft') {
      this.draftRemaining = Math.max(0, this.draftRemaining - delta)
      this.updateDraftClock()
      if (this.draftRemaining === 0) this.lockDraft()
    }
    if (this.phase !== 'battle' || !this.simulation) return
    // Cap catch-up after suspended tabs. Simulation never takes variable steps.
    this.accumulator += Math.min(delta, 250)
    while (this.accumulator >= CONFIG.tickMs && this.phase === 'battle') {
      this.accumulator -= CONFIG.tickMs
      const events = this.simulation.step()
      for (const unit of this.simulation.units) {
        const view = this.views.get(unit.id)!
        const sy = this.vy(unit.y)
        view.root.setPosition(unit.x, sy).setDepth(sy)
        if (view.sprite) {
          if (unit.hp <= 0) continue
          const dx = unit.x - view.px
          const dy = sy - view.py
          if (Math.abs(dx) > .05) view.sprite.setFlipX(view.kit!.flip(dx))
          // ignoreIfPlaying: a looping clip must not restart on every tick.
          if (!view.busy) view.sprite.play(Math.hypot(dx, dy) > .05 ? view.kit!.walk(dx, dy) : view.kit!.anims.idle, true)
          view.px = unit.x; view.py = sy
        } else if (unit.hp > 0) view.art.setAngle(Math.sin(this.simulation.tick * .32 + unit.id) * 4)
      }
      for (const event of events) this.showEvent(event)
    }
  }
}
