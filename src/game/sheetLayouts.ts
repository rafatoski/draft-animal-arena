import type { AbilityId } from './abilities'
/**
 * Layout of the repacked ability-fighter spritesheets (public/assets/sprites/<id>/<id>-spritesheet.png, written by
 * scripts/pack-fighter-sheet.py from the supplied 1024x1536 sheets): 1536x3072, 6 columns x 12 rows of 256x256 cells.
 * Frame = row * 6 + column. Every clip below is a [first, last] frame range of ONE row, or an explicit list.
 * Pure data (no Phaser) so tests can validate it against the real PNG dimensions.
 */
export const ABILITY_SHEET = { width: 1536, height: 3072, cell: 256, columns: 6, rows: 12 }
export const SHEET_FRAMES = ABILITY_SHEET.columns * ABILITY_SHEET.rows

export type ClipName = 'idle' | 'walkDown' | 'walkUp' | 'walkRight' | 'walkLeft' | 'strike' | 'hit' | 'stun' | 'death' | AbilityId
export interface Clip { frames: readonly number[]; rate: number; loop: boolean }
export interface AbilityLayout {
  clips: Record<ClipName, Clip>
  /** Scale of one 256px cell in the arena and the baseline row of the feet inside a cell. */
  scale: number; feet: number
  /** true: the side art only faces right, so left is the mirrored image; false: the sheet has real left-facing frames. */
  mirrorLeft: boolean
}
const row = (r: number, from = 0, to = 5) => Array.from({ length: to - from + 1 }, (_, i) => r * 6 + from + i)

/**
 * K9 Enforcer: the supplied sheet has 11 rows (no separate basic-attack row), so K9 Strike reuses the first three frames of the
 * Shield Rush row (shield up, guard, punch). Rows: 0 idle, 1 walk down, 2 walk up, 3 walk right, 4 walk left (real left art),
 * 5 shield rush, 6 lockdown bite, 7 code red, 8 hit, 9 stun, 10 knockout (5 frames). Row 11 is empty.
 */
export const K9_LAYOUT: AbilityLayout = {
  scale: .33, feet: 250, mirrorLeft: false,
  clips: {
    idle: { frames: row(0), rate: 5, loop: true }, walkDown: { frames: row(1), rate: 8, loop: true }, walkUp: { frames: row(2), rate: 8, loop: true },
    walkRight: { frames: row(3), rate: 8, loop: true }, walkLeft: { frames: row(4), rate: 8, loop: true },
    strike: { frames: row(5, 0, 2), rate: 14, loop: false }, rush: { frames: row(5), rate: 12, loop: false },
    bite: { frames: row(6), rate: 11, loop: false }, codered: { frames: row(7), rate: 8, loop: false },
    hit: { frames: row(8, 0, 4), rate: 10, loop: false }, stun: { frames: row(9, 0, 1), rate: 4, loop: true }, death: { frames: row(10, 0, 4), rate: 6, loop: false },
    cloak: { frames: row(0, 0, 0), rate: 1, loop: false }, venom: { frames: row(0, 0, 0), rate: 1, loop: false }, blackout: { frames: row(0, 0, 0), rate: 1, loop: false },
  },
}
/**
 * Agent Platypus (12 rows as specified): 0 idle, 1 walk down, 2 walk up, 3 and 4 side walks (BOTH face right in the supplied art,
 * so walking left plays row 4 mirrored), 5 basic attack, 6 shadow cloak, 7 venom strike, 8 operation blackout, 9 hit,
 * 10 stun (dizzy standing frames), 11 knockout. The hit row's last three frames are dizzy frames, so Hit uses its first three
 * and Stun uses frames 57-59 of the hit row plus the stun row's standing frames.
 */
export const PLATYPUS_LAYOUT: AbilityLayout = {
  scale: .34, feet: 250, mirrorLeft: true,
  clips: {
    idle: { frames: row(0), rate: 5, loop: true }, walkDown: { frames: row(1), rate: 9, loop: true }, walkUp: { frames: row(2), rate: 9, loop: true },
    walkRight: { frames: row(3), rate: 11, loop: true }, walkLeft: { frames: row(4), rate: 11, loop: true },
    strike: { frames: row(5), rate: 16, loop: false }, cloak: { frames: row(6), rate: 9, loop: false },
    venom: { frames: row(7), rate: 14, loop: false }, blackout: { frames: row(8), rate: 10, loop: false },
    hit: { frames: row(9, 0, 2), rate: 10, loop: false }, stun: { frames: row(9, 3, 5), rate: 6, loop: true }, death: { frames: row(11), rate: 7, loop: false },
    rush: { frames: row(0, 0, 0), rate: 1, loop: false }, bite: { frames: row(0, 0, 0), rate: 1, loop: false }, codered: { frames: row(0, 0, 0), rate: 1, loop: false },
  },
}
