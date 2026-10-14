import Phaser from 'phaser'
import { COLOSSEUM_TEXTURE } from '../game/assets'
import { BACKGROUND_ART, BACKGROUND_PLACEMENT } from './battlefield'

/** One original texture behind the world; the rest of the screen is plain black. No crop, tint, warp, or generated overlay. */
export function createColosseum(scene: Phaser.Scene, world: Phaser.GameObjects.Layer) {
  const background = scene.add.image(BACKGROUND_PLACEMENT.x, BACKGROUND_PLACEMENT.y, COLOSSEUM_TEXTURE)
    .setOrigin(0).setScale(BACKGROUND_ART.scale).setDepth(-100)
  world.add(background)
}
