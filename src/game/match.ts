import { FIGHTERS, ROBOT_IDS } from './fighters'
import { SeededRandom } from '../simulation/random'
export interface MatchSetup { player: string[]; ai: string[]; seed: number; combatSeed: number; practice?: true }
/** Practice swaps only the enemy roster for the training robots; everything else is unchanged. */
export function draftMatch(selection: readonly string[], seed: number, practice = false): MatchSetup {
  const random = new SeededRandom(seed)
  const player = [...selection]
  const available = random.shuffle(FIGHTERS.map(f => f.id).filter(id => !player.includes(id)))
  while (player.length < 3) player.push(available.shift()!)
  const ai = practice ? [...ROBOT_IDS] : random.shuffle(FIGHTERS.map(f => f.id)).slice(0, 3)
  return { player, ai, seed, combatSeed: random.state, ...(practice && { practice: true as const }) }
}
/** A rematch keeps ordered rosters and the original seed, but shares no mutable state. */
export function rematch(setup: MatchSetup): MatchSetup {
  return { ...setup, player: [...setup.player], ai: [...setup.ai] }
}
export function newSeed() { return crypto.getRandomValues(new Uint32Array(1))[0]! }
