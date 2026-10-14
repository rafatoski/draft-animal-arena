import Phaser from 'phaser'
import sheetUrl from '../assets/robot-sheet.png'
import type { SpriteKit } from './spriteKit'

/**
 * Training-robot spritesheet: 660×480, 6 columns × 5 rows of 110×96 frames, feet on a shared baseline.
 * Rows: idle (4 frames), walk (6), attack (4), hit (3), death (5); unused cells are empty.
 * The sheet art faces right.
 */
export const ROBOT_TEXTURE = 'training-robot'
const FRAME = { frameWidth: 110, frameHeight: 96 }
const COLUMNS = 6
/** The art faces right, so mirror it whenever the robot heads or aims left. */
export const robotFlip = (dx: number) => dx < 0
export const ROBOT_ANIMS = { idle: 'robot-idle', walk: 'robot-walk', attack: 'robot-attack', hit: 'robot-hit', death: 'robot-death' } as const
const CLIPS: readonly [keyof typeof ROBOT_ANIMS, row: number, frames: number, frameRate: number, repeat: number][] = [
  ['idle', 0, 4, 6, -1], ['walk', 1, 6, 10, -1], ['attack', 2, 4, 12, 0], ['hit', 3, 3, 10, 0], ['death', 4, 5, 8, 0],
]

export function preloadRobot(scene: Phaser.Scene) {
  if (!scene.textures.exists(ROBOT_TEXTURE)) scene.load.spritesheet(ROBOT_TEXTURE, sheetUrl, FRAME)
}

/** Animations are global to the game: create each once, never per round or per scene. */
export function ensureRobotAnimations(scene: Phaser.Scene) {
  const frames = scene.textures.get(ROBOT_TEXTURE).frameTotal - 1 // minus Phaser's __BASE frame
  if (frames !== COLUMNS * CLIPS.length) throw new Error(`Robot sheet needs ${COLUMNS * CLIPS.length} frames of ${FRAME.frameWidth}×${FRAME.frameHeight}, found ${frames}`)
  for (const [name, row, count, frameRate, repeat] of CLIPS) {
    if (scene.anims.exists(ROBOT_ANIMS[name])) continue
    scene.anims.create({ key: ROBOT_ANIMS[name], frameRate, repeat,
      frames: scene.anims.generateFrameNumbers(ROBOT_TEXTURE, { start: row * COLUMNS, end: row * COLUMNS + count - 1 }) })
  }
}

export function createRobotSprite(scene: Phaser.Scene) {
  ensureRobotAnimations(scene)
  const sprite = scene.add.sprite(0, 26, ROBOT_TEXTURE).setOrigin(.5, .97).setScale(.85)
  sprite.play({ key: ROBOT_ANIMS.idle, startFrame: Phaser.Math.Between(0, 3) })
  return sprite
}

/** Purely visual: colour comes from Math.random so it never touches the seeded simulation or damage. */
export function fireLaser(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, from: { x: number; y: number }, to: { x: number; y: number }) {
  const color = Math.random() < .5 ? 0xff3b3b : 0x3bff6a
  const bolt = scene.add.container(from.x, from.y - 6, [
    scene.add.rectangle(0, 0, 28, 8, color).setOrigin(.5),
    scene.add.rectangle(0, 0, 20, 3, 0xffffff).setOrigin(.5),
  ]).setRotation(Phaser.Math.Angle.Between(from.x, from.y, to.x, to.y)).setDepth(850)
  layer.add(bolt)
  const distance = Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y)
  scene.tweens.add({ targets: bolt, x: to.x, y: to.y - 6, duration: Phaser.Math.Clamp(distance / 1.8, 80, 260), onComplete: () => {
    bolt.destroy()
    const ring = scene.add.circle(to.x, to.y - 6, 7, color, .9).setDepth(850)
    const core = scene.add.circle(to.x, to.y - 6, 4, 0xffffff).setDepth(851)
    layer.add([ring, core])
    scene.tweens.add({ targets: ring, scale: 2.8, alpha: 0, duration: 240, onComplete: () => ring.destroy() })
    scene.tweens.add({ targets: core, scale: 1.8, alpha: 0, duration: 140, onComplete: () => core.destroy() })
  } })
}

export const robotKit: SpriteKit = {
  anims: { idle: ROBOT_ANIMS.idle, attack: ROBOT_ANIMS.attack, hit: ROBOT_ANIMS.hit, death: ROBOT_ANIMS.death },
  walk: () => ROBOT_ANIMS.walk, flip: robotFlip, preload: preloadRobot, create: createRobotSprite,
}
