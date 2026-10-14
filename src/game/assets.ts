import Phaser from 'phaser'
import logoUrl from '../assets/draft-animal-arena-logo.png'
import heartUrl from '../assets/heart.png'
import colosseumUrl from '../assets/roman-colosseum.png'

export const LOGO_TEXTURE = 'draft-animal-arena-logo'
/** Load the original PNG once; Phaser retains the texture across scene transitions. */
export function preloadLogo(scene: Phaser.Scene) {
  if (!scene.textures.exists(LOGO_TEXTURE)) scene.load.image(LOGO_TEXTURE, logoUrl)
}

export const COLOSSEUM_TEXTURE = 'roman-colosseum'
export function preloadColosseum(scene: Phaser.Scene) {
  if (!scene.textures.exists(COLOSSEUM_TEXTURE)) scene.load.image(COLOSSEUM_TEXTURE, colosseumUrl)
}

export const HEART_TEXTURE = 'round-heart'
export function preloadHeart(scene: Phaser.Scene) {
  if (!scene.textures.exists(HEART_TEXTURE)) scene.load.image(HEART_TEXTURE, heartUrl)
}
