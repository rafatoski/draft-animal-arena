import Phaser from 'phaser'
import type { FighterDefinition } from './fighters'
/** All characters are drawn with primitives; no image assets or downloads. */
export function animalArt(scene: Phaser.Scene, fighter: FighterDefinition): Phaser.GameObjects.Container {
  const g = scene.add.graphics()
  const ink = 0x253344
  g.fillStyle(0x101c25, .2).fillEllipse(0, 28, 62, 15)
  g.lineStyle(3, ink).fillStyle(fighter.color)
  g.fillRoundedRect(-25, -22, 50, 49, 19).strokeRoundedRect(-25, -22, 50, 49, 19)
  if (fighter.id === 'fox' || fighter.id === 'raccoon') {
    g.fillTriangle(-24, -12, -24, -39, -5, -23).strokeTriangle(-24, -12, -24, -39, -5, -23)
    g.fillTriangle(24, -12, 24, -39, 5, -23).strokeTriangle(24, -12, 24, -39, 5, -23)
  }
  if (fighter.id === 'capybara' || fighter.id === 'pig') {
    g.fillCircle(-20, -23, 9).strokeCircle(-20, -23, 9)
    g.fillCircle(20, -23, 9).strokeCircle(20, -23, 9)
  }
  if (fighter.id === 'raccoon') g.fillStyle(ink).fillRoundedRect(-24, -12, 48, 17, 7)
  if (fighter.id === 'frog') {
    g.fillStyle(fighter.color).fillCircle(-17, -20, 12).fillCircle(17, -20, 12)
    g.fillStyle(0x8665c3).fillTriangle(-22, -27, 0, -62, 22, -27)
    g.fillStyle(0xffdd7b).fillCircle(0, -39, 4)
    g.lineStyle(5, 0x8f6247).lineBetween(34, 24, 34, -26)
    g.fillStyle(0xb5a1ff).fillCircle(34, -29, 8)
  }
  const eyeY = fighter.id === 'frog' ? -20 : -6
  g.fillStyle(0xffffff).fillEllipse(-10, eyeY, 12, 14).fillEllipse(10, eyeY, 12, 14)
  g.fillStyle(ink).fillCircle(-8, eyeY + 1, 3).fillCircle(12, eyeY + 1, 3)
  if (fighter.id === 'chicken') {
    g.fillStyle(0xf16c64).fillCircle(-7, -27, 7).fillCircle(4, -31, 8).fillCircle(13, -25, 6)
    g.fillStyle(0xffaf45).fillTriangle(-8, 5, 8, 5, 0, 17)
    g.fillStyle(0xe65f60).fillCircle(-30, 14, 12).fillCircle(30, 14, 12)
  } else if (fighter.id === 'pig') {
    g.fillStyle(0xe27894).fillEllipse(0, 12, 28, 18)
    g.fillStyle(ink).fillCircle(-5, 12, 2).fillCircle(5, 12, 2)
    g.lineStyle(5, 0xb64555).lineBetween(-18, -17, -3, -12).lineBetween(18, -17, 3, -12)
  } else {
    g.fillStyle(fighter.id === 'fox' ? 0xffefd7 : 0xdbc0a1).fillEllipse(0, 13, 29, 17)
    g.fillStyle(ink).fillEllipse(0, 8, 9, 6)
    g.lineStyle(2, ink).lineBetween(-5, 19, 5, 19)
  }
  if (fighter.id === 'fox') {
    g.lineStyle(3, 0x754e30).beginPath().arc(24, 7, 24, -1.3, 1.3).strokePath()
    g.lineStyle(1, 0xffebc5).lineBetween(30, -16, 30, 30)
  }
  if (fighter.id === 'capybara') {
    g.fillStyle(0x678e9b).fillRoundedRect(-36, 4, 19, 32, 6)
    g.lineStyle(2, 0xc4dae1).strokeRoundedRect(-36, 4, 19, 32, 6)
  }
  if (fighter.id === 'raccoon') {
    g.fillStyle(0x8e7ada).fillRect(-25, -19, 50, 6)
    g.fillTriangle(23, -17, 40, -9, 37, -23)
  }
  return scene.add.container(0, 0, [g])
}
