import type Phaser from 'phaser'

/** What the arena needs to drive one fighter's spritesheet: clip names, direction choice, and a factory. */
export interface SpriteKit {
  anims: { idle: string; attack: string; hit: string; death: string }
  /** Looping clip for the direction of travel (screen-space deltas, y grows downward). */
  walk(dx: number, dy: number): string
  flip(dx: number): boolean
  preload(scene: Phaser.Scene): void
  create(scene: Phaser.Scene): Phaser.GameObjects.Sprite
}
