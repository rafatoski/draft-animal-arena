import type Phaser from 'phaser'

/** What the arena needs to drive one fighter's spritesheet: clip names, direction choice, and a factory. */
export interface SpriteKit {
  anims: { idle: string; attack: string; hit: string; death: string; stun?: string; abilities?: Partial<Record<string, string>> }
  /** Looping clip for the direction of travel (screen-space deltas, y grows downward). */
  walk(dx: number, dy: number): string
  /** Mirror for an attack aimed along dx. */
  flip(dx: number): boolean
  /** Mirror while walking along dx, when that differs from `flip` (sheets with real left-facing walk art). */
  walkFlip?(dx: number): boolean
  preload(scene: Phaser.Scene): void
  create(scene: Phaser.Scene): Phaser.GameObjects.Sprite
}
