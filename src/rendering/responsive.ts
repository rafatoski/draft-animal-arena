import Phaser from 'phaser'
import { portraitLayout } from './layout'
/** Retain the original menu composition on a responsive canvas. */
export function fitPortraitScene(scene: Phaser.Scene) {
  const resize = () => {
    const layout = portraitLayout(scene.scale.width, scene.scale.height)
    scene.cameras.main.setViewport(0, 0, scene.scale.width, scene.scale.height)
      .setZoom(layout.zoom).centerOn(240, 420)
  }
  resize()
  scene.scale.on(Phaser.Scale.Events.RESIZE, resize)
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(Phaser.Scale.Events.RESIZE, resize))
}
