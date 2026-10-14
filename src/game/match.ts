import { FIGHTERS, ROBOT_IDS } from './fighters'
import { SeededRandom } from '../simulation/random'
import type { TeamBonus } from './upgrades'
/** The computer opponent drafts from the first six fighters only (the newer, diamond-unlock fighters are player choices). */
const AI_ROSTER = 6
export interface MatchSetup { player: string[]; ai: string[]; seed: number; combatSeed: number; practice?: true; bonus?: { player?: TeamBonus; ai?: TeamBonus } }
/** Practice swaps only the enemy roster for the training robots; everything else is unchanged. */
export function draftMatch(selection: readonly string[], seed: number, practice = false, allowed?: readonly string[]): MatchSetup {
  const random = new SeededRandom(seed)
  const player = [...selection]
  // Empty draft slots auto-fill only from fighters the player may use (all six when no restriction is given).
  const available = random.shuffle(FIGHTERS.map(f => f.id).filter(id => !player.includes(id) && (!allowed || allowed.includes(id))))
  while (player.length < 3) player.push(available.shift()!)
  const ai = practice ? [...ROBOT_IDS] : random.shuffle(FIGHTERS.slice(0, AI_ROSTER).map(f => f.id)).slice(0, 3) // the computer drafts from the original six, so existing seeds replay unchanged
  return { player, ai, seed, combatSeed: random.state, ...(practice && { practice: true as const }) }
}
/** A rematch keeps ordered rosters and the original seed, but shares no mutable state. */
export function rematch(setup: MatchSetup): MatchSetup {
  return { ...setup, player: [...setup.player], ai: [...setup.ai], ...(setup.bonus && { bonus: { ...setup.bonus } }) }
}
export function newSeed() { return crypto.getRandomValues(new Uint32Array(1))[0]! }
