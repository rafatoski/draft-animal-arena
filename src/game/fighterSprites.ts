import type Phaser from 'phaser'
import type { FighterDefinition } from './fighters'
import type { SpriteKit } from './spriteKit'
import { chickenKit, frogKit, raccoonKit, capybaraKit, foxKit, pigKit } from './animalSheets'
import { robotKit } from './robotArt'

/** Fighters with a spritesheet; every other animal keeps its procedural drawing. */
export function spriteKit(fighter: FighterDefinition): SpriteKit | undefined {
  return fighter.robot ? robotKit : fighter.id === 'chicken' ? chickenKit : fighter.id === 'frog' ? frogKit : fighter.id === 'raccoon' ? raccoonKit : fighter.id === 'capybara' ? capybaraKit : fighter.id === 'fox' ? foxKit : fighter.id === 'pig' ? pigKit : undefined
}
export function preloadFighterSprites(scene: Phaser.Scene, practice: boolean) {
  chickenKit.preload(scene); frogKit.preload(scene); raccoonKit.preload(scene); capybaraKit.preload(scene); foxKit.preload(scene); pigKit.preload(scene)
  if (practice) robotKit.preload(scene)
}
