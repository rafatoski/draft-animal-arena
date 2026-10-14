import { CONFIG } from '../game/config'
import { fighterById } from '../game/fighters'
import type { FighterDefinition } from '../game/fighters'
import type { TeamBonus } from '../game/upgrades'
import { ABILITIES } from '../game/abilities'
import type { AbilityId } from '../game/abilities'
import { SeededRandom } from './random'
export type Team = 'player' | 'ai'
export type Winner = Team | 'draw'
export interface Unit {
  id: number; team: Team; definition: FighterDefinition
  x: number; y: number; hp: number; cooldown: number
  /** Status effects, in ticks (all 0 for fighters that never get one). stun: cannot act. disarm: can move, cannot attack.
   *  cloak/dodges: evasion charges that end with the cloak. poison: ticks left, `poisonDamage` per pulse. */
  stun: number; disarm: number; cloak: number; dodges: number; poison: number; poisonDamage: number
  /** Ticks until each of the fighter's abilities is ready again. */
  abilityCooldown: Partial<Record<AbilityId, number>>
}
export type CombatEvent =
  | { type: 'hit'; source: number; target: number; damage: number; critical: boolean; ability?: AbilityId }
  | { type: 'ability'; source: number; ability: AbilityId; targets: number[] }
  | { type: 'status'; target: number; status: 'stun' | 'disarm' | 'poison'; ticks: number }
  | { type: 'poison'; target: number; damage: number }
  | { type: 'dodge'; source: number; target: number }
  | { type: 'death'; target: number }
  | { type: 'end'; winner: Winner }
/** Pure simulation. One step is always 50ms, regardless of display frame rate.
 * Nearest-target ties resolve by unit id; attacks resolve simultaneously.
 */
export class CombatSimulation {
  readonly units: Unit[]
  readonly random: SeededRandom
  tick = 0
  winner: Winner | null = null
  /** `bonus` = permanent upgrade points per side and fighter, added to the base attack / defense / speed. Absent = base stats. */
  constructor(player: readonly string[], ai: readonly string[], seed: number, bonus: { player?: TeamBonus; ai?: TeamBonus } = {}) {
    for (const team of [player, ai]) {
      if (team.length !== CONFIG.teamSize || new Set(team).size !== team.length) throw new Error('Teams need three distinct fighters')
    }
    this.random = new SeededRandom(seed)
    this.units = [player, ai].flatMap((roster, teamIndex) => roster.map((id, slot) => {
      const base = fighterById(id), extra = (teamIndex === 0 ? bonus.player : bonus.ai)?.[id]
      const definition = extra ? { ...base, attack: base.attack + (extra.attack ?? 0), defense: base.defense + (extra.defense ?? 0), speed: base.speed + (extra.speed ?? 0) } : base
      return { id: teamIndex * 3 + slot, team: teamIndex === 0 ? 'player' as const : 'ai' as const,
        definition, x: 120 + slot * 120, y: teamIndex === 0 ? 605 : 265,
        hp: definition.health, cooldown: 0, stun: 0, disarm: 0, cloak: 0, dodges: 0, poison: 0, poisonDamage: 0,
        abilityCooldown: Object.fromEntries((definition.abilities ?? []).map(a => [a, ABILITIES[a].initial])) }
    }))
  }
  /** One attack against `target`. A cloaked target evades it (and spends its charge); otherwise it becomes a 'hit' event. */
  private strike(source: Unit, target: Unit, damage: number, critical: boolean, events: CombatEvent[], ability?: AbilityId) {
    if (target.dodges > 0) { target.dodges--; events.push({ type: 'dodge', source: source.id, target: target.id }); return false }
    events.push({ type: 'hit', source: source.id, target: target.id, damage, critical, ...(ability && { ability }) })
    return true
  }
  private hurt(source: Unit, target: Unit, multiplier: number) { return Math.max(1, Math.round(source.definition.attack * multiplier - target.definition.defense)) }
  /** Uses the first ready, usable ability of `unit` (this tick's action). Pure function of the state: no randomness. */
  private useAbility(unit: Unit, enemies: Unit[], at: Map<number, { x: number; y: number }>, events: CombatEvent[]) {
    const o = at.get(unit.id)!, dist = (e: Unit) => Math.hypot(at.get(e.id)!.x - o.x, at.get(e.id)!.y - o.y)
    const near = enemies[0]!, d0 = dist(near), range = unit.definition.range
    for (const id of unit.definition.abilities ?? []) {
      if ((unit.abilityCooldown[id] ?? 0) > 0) continue
      const rule = ABILITIES[id]
      if (id === 'codered') {
        const hit = enemies.filter(e => dist(e) <= ABILITIES.codered.radius)
        if (!(hit.length >= 2 || (hit.length === 1 && enemies.length === 1))) continue
        events.push({ type: 'ability', source: unit.id, ability: id, targets: hit.map(e => e.id) })
        for (const e of hit) if (this.strike(unit, e, this.hurt(unit, e, ABILITIES.codered.damage), false, events, id)) { e.stun = Math.max(e.stun, ABILITIES.codered.stun); events.push({ type: 'status', target: e.id, status: 'stun', ticks: ABILITIES.codered.stun }) }
      } else if (id === 'rush') {
        if (!(d0 > range + ABILITIES.rush.minRange && d0 <= ABILITIES.rush.maxRange)) continue
        const t = at.get(near.id)!, k = (d0 - (range - 4)) / d0 // land just inside melee reach
        events.push({ type: 'ability', source: unit.id, ability: id, targets: [near.id] })
        unit.x += (t.x - o.x) * k; unit.y += (t.y - o.y) * k
        if (this.strike(unit, near, this.hurt(unit, near, ABILITIES.rush.damage), false, events, id)) { near.stun = Math.max(near.stun, ABILITIES.rush.stun); events.push({ type: 'status', target: near.id, status: 'stun', ticks: ABILITIES.rush.stun }) }
      } else if (id === 'bite') {
        if (d0 > range + 6) continue
        events.push({ type: 'ability', source: unit.id, ability: id, targets: [near.id] })
        if (this.strike(unit, near, this.hurt(unit, near, ABILITIES.bite.damage), false, events, id)) { near.disarm = Math.max(near.disarm, ABILITIES.bite.disarm); events.push({ type: 'status', target: near.id, status: 'disarm', ticks: ABILITIES.bite.disarm }) }
      } else if (id === 'cloak') {
        if (unit.cloak > 0 || d0 > ABILITIES.cloak.trigger) continue
        events.push({ type: 'ability', source: unit.id, ability: id, targets: [] })
        unit.cloak = ABILITIES.cloak.duration; unit.dodges = 1
      } else if (id === 'venom') {
        if (d0 > range + 6) continue
        events.push({ type: 'ability', source: unit.id, ability: id, targets: [near.id] })
        if (this.strike(unit, near, this.hurt(unit, near, ABILITIES.venom.damage), false, events, id)) {
          near.poison = Math.max(near.poison, ABILITIES.venom.poisonTicks) // refresh, never stack
          near.poisonDamage = Math.max(near.poisonDamage, ABILITIES.venom.poisonDamage)
          events.push({ type: 'status', target: near.id, status: 'poison', ticks: near.poison })
        }
      } else { // blackout
        const victims = enemies.filter(e => dist(e) <= ABILITIES.blackout.radius).slice(0, ABILITIES.blackout.targets)
        if (!victims.length) continue
        events.push({ type: 'ability', source: unit.id, ability: id, targets: victims.map(e => e.id) })
        const t = at.get(victims[0]!.id)!, d = Math.hypot(t.x - o.x, t.y - o.y) || 1, k = (d - (range - 4)) / d
        unit.x += (t.x - o.x) * k; unit.y += (t.y - o.y) * k // reappears beside the nearest victim
        for (const e of victims) {
          const total = this.hurt(unit, e, ABILITIES.blackout.damage) * ABILITIES.blackout.hits // a rapid combination: each hit is reduced by defence
          this.strike(unit, e, total, false, events, id)
        }
        unit.cloak = Math.max(unit.cloak, ABILITIES.blackout.evade); unit.dodges = Math.max(unit.dodges, 1) // brief evasion afterwards
      }
      unit.abilityCooldown[id] = rule.cooldown
      unit.cooldown = unit.definition.cooldown // the ability was this tick's action
      return true
    }
    return false
  }
  /** In reach but waiting on the cooldown: ranged fighters kite back, melee fighters step away after a swing, everyone else circles the target. (ux, uy) points at it. */
  private reposition(unit: Unit, ux: number, uy: number, distance: number) {
    const { speed, range, cooldown } = unit.definition, step = speed * CONFIG.tickMs / 1000
    const back = range >= 100 ? distance < range * .7 : unit.cooldown > cooldown / 2
    const side = (unit.id + Math.floor(this.tick / 24)) % 2 ? 1 : -1 // flips every 1.2 s
    const [mx, my] = back ? [-ux * .8, -uy * .8] : [-uy * side * .5, ux * side * .5]
    const { left, right, top, bottom } = CONFIG.arena // margins keep the whole sprite (body, health bar, floating text) on screen
    unit.x = Math.min(right - 70, Math.max(left + 70, unit.x + mx * step)); unit.y = Math.min(bottom - 55, Math.max(top + 60, unit.y + my * step))
  }
  step(): CombatEvent[] {
    if (this.winner !== null) return []
    this.tick++
    const events: CombatEvent[] = []
    const alive = this.units.filter(u => u.hp > 0)
    // Poison pulses first, so a unit that dies of poison never acts this tick.
    for (const unit of alive) if (unit.poison > 0) {
      if (unit.poison % ABILITIES.venom.every === 0) events.push({ type: 'poison', target: unit.id, damage: unit.poisonDamage })
      if (--unit.poison === 0) unit.poisonDamage = 0
    }
    // Snapshot targeting and movement avoid iteration-order movement advantages.
    const positions = new Map(alive.map(u => [u.id, { x: u.x, y: u.y }]))
    for (const unit of alive) {
      unit.cooldown = Math.max(0, unit.cooldown - 1)
      for (const id of unit.definition.abilities ?? []) unit.abilityCooldown[id] = Math.max(0, (unit.abilityCooldown[id] ?? 0) - 1)
      if (unit.cloak > 0 && --unit.cloak === 0) unit.dodges = 0 // stealth always runs out
      const stunned = unit.stun > 0, disarmed = unit.disarm > 0
      if (unit.stun > 0) unit.stun--
      if (unit.disarm > 0) unit.disarm--
      if (stunned) continue
      const origin = positions.get(unit.id)!
      const enemies = alive.filter(e => e.team !== unit.team)
      enemies.sort((a, b) => {
        const pa = positions.get(a.id)!, pb = positions.get(b.id)!
        return Math.hypot(pa.x - origin.x, pa.y - origin.y) - Math.hypot(pb.x - origin.x, pb.y - origin.y) || a.id - b.id
      })
      const target = enemies[0]
      if (!target) continue
      if (!disarmed && unit.definition.abilities && this.useAbility(unit, enemies, positions, events)) continue
      const destination = positions.get(target.id)!
      const dx = destination.x - origin.x, dy = destination.y - origin.y
      const distance = Math.hypot(dx, dy)
      if (distance > unit.definition.range) {
        const move = Math.min(unit.definition.speed * CONFIG.tickMs / 1000, distance - unit.definition.range)
        unit.x += dx / distance * move
        unit.y += dy / distance * move
      } else if (unit.cooldown === 0 && !disarmed) {
        const critical = this.random.next() < unit.definition.crit
        const damage = Math.max(1, Math.round((unit.definition.attack - target.definition.defense) * (critical ? 1.75 : 1)))
        this.strike(unit, target, damage, critical, events)
        unit.cooldown = unit.definition.cooldown
      } else this.reposition(unit, dx / distance, dy / distance, distance)
    }
    for (const event of events) if (event.type === 'hit' || event.type === 'poison') {
      const target = this.units[event.target]!
      target.hp = Math.max(0, target.hp - event.damage)
    }
    for (const unit of alive) if (unit.hp === 0) events.push({ type: 'death', target: unit.id })
    const playerAlive = this.units.some(u => u.team === 'player' && u.hp > 0)
    const aiAlive = this.units.some(u => u.team === 'ai' && u.hp > 0)
    if (!playerAlive || !aiAlive) this.winner = playerAlive ? 'player' : aiAlive ? 'ai' : 'draw'
    else if (this.tick >= CONFIG.maxTicks) {
      // At 90 seconds, compare remaining health as a fraction of starting health.
      const score = (team: Team) => this.units.filter(u => u.team === team).reduce((sum, u) => sum + u.hp / u.definition.health, 0)
      const difference = score('player') - score('ai')
      this.winner = Math.abs(difference) < 1e-9 ? 'draw' : difference > 0 ? 'player' : 'ai'
    }
    if (this.winner !== null) events.push({ type: 'end', winner: this.winner })
    return events
  }
}
