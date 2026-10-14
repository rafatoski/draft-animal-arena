import { CONFIG } from '../game/config'
import { fighterById } from '../game/fighters'
import type { FighterDefinition } from '../game/fighters'
import { SeededRandom } from './random'
export type Team = 'player' | 'ai'
export type Winner = Team | 'draw'
export interface Unit {
  id: number; team: Team; definition: FighterDefinition
  x: number; y: number; hp: number; cooldown: number
}
export type CombatEvent =
  | { type: 'hit'; source: number; target: number; damage: number; critical: boolean }
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
  constructor(player: readonly string[], ai: readonly string[], seed: number) {
    for (const team of [player, ai]) {
      if (team.length !== CONFIG.teamSize || new Set(team).size !== team.length) throw new Error('Teams need three distinct fighters')
    }
    this.random = new SeededRandom(seed)
    this.units = [player, ai].flatMap((roster, teamIndex) => roster.map((id, slot) => {
      const definition = fighterById(id)
      return { id: teamIndex * 3 + slot, team: teamIndex === 0 ? 'player' as const : 'ai' as const,
        definition, x: 120 + slot * 120, y: teamIndex === 0 ? 605 : 265,
        hp: definition.health, cooldown: 0 }
    }))
  }
  step(): CombatEvent[] {
    if (this.winner !== null) return []
    this.tick++
    const events: CombatEvent[] = []
    const alive = this.units.filter(u => u.hp > 0)
    // Snapshot targeting and movement avoid iteration-order movement advantages.
    const positions = new Map(alive.map(u => [u.id, { x: u.x, y: u.y }]))
    for (const unit of alive) {
      unit.cooldown = Math.max(0, unit.cooldown - 1)
      const origin = positions.get(unit.id)!
      const enemies = alive.filter(e => e.team !== unit.team)
      enemies.sort((a, b) => {
        const pa = positions.get(a.id)!, pb = positions.get(b.id)!
        return Math.hypot(pa.x - origin.x, pa.y - origin.y) - Math.hypot(pb.x - origin.x, pb.y - origin.y) || a.id - b.id
      })
      const target = enemies[0]
      if (!target) continue
      const destination = positions.get(target.id)!
      const dx = destination.x - origin.x, dy = destination.y - origin.y
      const distance = Math.hypot(dx, dy)
      if (distance > unit.definition.range) {
        const move = Math.min(unit.definition.speed * CONFIG.tickMs / 1000, distance - unit.definition.range)
        unit.x += dx / distance * move
        unit.y += dy / distance * move
      } else if (unit.cooldown === 0) {
        const critical = this.random.next() < unit.definition.crit
        const damage = Math.max(1, Math.round((unit.definition.attack - target.definition.defense) * (critical ? 1.75 : 1)))
        events.push({ type: 'hit', source: unit.id, target: target.id, damage, critical })
        unit.cooldown = unit.definition.cooldown
      }
    }
    for (const event of events) if (event.type === 'hit') {
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
