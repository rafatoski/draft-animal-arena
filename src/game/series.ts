import type { Team, Winner } from '../simulation/combat'

/** Match-level state for the best-of-3. Round-level state lives in CombatSimulation. */
export const WINS_NEEDED = 2
export interface Series { round: number; attempt: number; wins: Record<Team, number>; winner: Team | null }

export function newSeries(): Series { return { round: 1, attempt: 0, wins: { player: 0, ai: 0 }, winner: null } }

/**
 * Draw policy: a drawn round (simultaneous elimination or exactly equal health at the time
 * limit) is void. Nobody scores, the round number does not advance, and the round is replayed
 * with the next derived seed. Once the series is decided, further results are ignored, so a
 * duplicate round-end can never score twice.
 */
export function recordRound(series: Series, result: Winner): Series {
  if (series.winner !== null) return series
  if (result === 'draw') return { ...series, attempt: series.attempt + 1 }
  const wins = { ...series.wins, [result]: series.wins[result] + 1 }
  return { round: series.round + 1, attempt: series.attempt + 1, wins, winner: wins[result] >= WINS_NEEDED ? result : null }
}

export function isFinalRound(series: Series) { return series.wins.player === WINS_NEEDED - 1 && series.wins.ai === WINS_NEEDED - 1 }

/** Round 1 keeps the match's own combat seed, so existing seeds and rematches reproduce. */
export function roundSeed(combatSeed: number, attempt: number) { return (combatSeed + Math.imul(attempt, 0x9E3779B1)) >>> 0 }
