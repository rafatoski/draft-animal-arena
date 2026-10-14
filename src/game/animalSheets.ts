import Phaser from 'phaser'
import type { SpriteKit } from './spriteKit'
import type { AbilityId } from './abilities'
import { ABILITY_SHEET, SHEET_FRAMES, K9_LAYOUT, PLATYPUS_LAYOUT } from './sheetLayouts'
import type { AbilityLayout } from './sheetLayouts'

/**
 * Shared layout for the animal spritesheets (public/assets/sprites/<name>/<name>-spritesheet.png):
 * 1536×1280, 6×5 cells of 256×256, feet on a baseline at y=222 of every cell.
 * Frames (row-major): 0-3 idle front, 6-11 walk back, 12-17 walk front, 18-23 attack, 24-26 hit, 27-29 death.
 * Cells 4 and 5 are intentionally empty.
 */
const SHEET = { width: 1536, height: 1280, frameWidth: 256, frameHeight: 256, frames: 30 }
const FEET = 222 // default baseline row inside each cell
const CLIPS = [
  ['idle', 'idle-front', 0, 3, 4, -1], ['walkBack', 'walk-back', 6, 11, 9, -1], ['walkFront', 'walk-front', 12, 17, 9, -1],
  ['attack', 'attack', 18, 23, 12, 0], ['hit', 'hit', 24, 26, 10, 0], ['death', 'death', 27, 29, 7, 0], // repeat 0 = once, holds last frame
] as const

interface SheetOptions {
  /** Overrides default clip frame rates, e.g. a heavier fighter's slower walk. */
  rates?: Partial<Record<(typeof CLIPS)[number][1], number>>
  /** World scale of one 256px cell, and the baseline row this sheet was packed with. */
  scale?: number; feet?: number
}
function animalSheetKit(name: string, texture: string, { rates = {}, scale = .4, feet = FEET }: SheetOptions = {}): SpriteKit {
  const key = (clip: string) => `${name}-${clip}`
  const ensureAnimations = (scene: Phaser.Scene) => {
    const tex = scene.textures.get(texture), image = tex.getSourceImage()
    if (image.width !== SHEET.width || image.height !== SHEET.height || tex.frameTotal - 1 !== SHEET.frames) {
      throw new Error(`${name} sheet must be ${SHEET.width}×${SHEET.height} (${SHEET.frames} frames); got ${image.width}×${image.height} (${tex.frameTotal - 1})`)
    }
    for (const [, clip, start, end, defaultRate, repeat] of CLIPS) {
      if (scene.anims.exists(key(clip))) continue // global registry: create once for the whole game
      scene.anims.create({ key: key(clip), frameRate: rates[clip] ?? defaultRate, repeat, frames: scene.anims.generateFrameNumbers(texture, { start, end }) })
    }
  }
  return {
    anims: { idle: key('idle-front'), attack: key('attack'), hit: key('hit'), death: key('death') },
    // Up shows the back; down and sideways show the front.
    walk: (dx, dy) => dy < 0 && Math.abs(dy) > Math.abs(dx) ? key('walk-back') : key('walk-front'),
    flip: () => false,
    preload(scene) {
      if (!scene.textures.exists(texture)) scene.load.spritesheet(texture, `${import.meta.env.BASE_URL}assets/sprites/${name}/${name}-spritesheet.png`, { frameWidth: SHEET.frameWidth, frameHeight: SHEET.frameHeight })
    },
    create(scene) {
      ensureAnimations(scene)
      const sprite = scene.add.sprite(0, 26, texture).setOrigin(.5, feet / SHEET.frameHeight).setScale(scale)
      sprite.play({ key: key('idle-front'), startFrame: Phaser.Math.Between(0, 3) })
      return sprite
    },
  }
}

export const chickenKit = animalSheetKit('chicken', 'boxer-chicken')
export const frogKit = animalSheetKit('frog', 'wizard-frog')
export const raccoonKit = animalSheetKit('raccoon', 'ninja-raccoon')
// Bulky berserker: the axe sticks out far, so the sheet is packed smaller; the world scale compensates.
export const pigKit = animalSheetKit('pig', 'berserker-pig', { scale: .42, feet: 232 })
// Agile archer: quicker walk; tall ears and bow, so a lower baseline and slightly smaller world scale.
export const foxKit = animalSheetKit('fox', 'archer-fox', { rates: { 'walk-back': 10, 'walk-front': 10 }, scale: .37, feet: 232 })
// Heavy tank: slower clips; its raised-club frames are taller, so the sheet is packed smaller on a lower baseline.
export const capybaraKit = animalSheetKit('capybara', 'tank-capybara', {
  rates: { 'walk-back': 7, 'walk-front': 7, attack: 10, hit: 9, death: 6 }, scale: .43, feet: 232,
})

/** Fighters with active abilities (K9 Enforcer, Agent Platypus): 1536x3072 sheets of 256px cells, clips from sheetLayouts.ts. */
function abilitySheetKit(name: string, texture: string, layout: AbilityLayout, abilities: readonly AbilityId[]): SpriteKit {
  const key = (clip: string) => `${name}-${clip}`
  const ensure = (scene: Phaser.Scene) => {
    const tex = scene.textures.get(texture), image = tex.getSourceImage()
    if (image.width !== ABILITY_SHEET.width || image.height !== ABILITY_SHEET.height || tex.frameTotal - 1 !== SHEET_FRAMES) {
      throw new Error(`${name} sheet must be ${ABILITY_SHEET.width}×${ABILITY_SHEET.height} (${SHEET_FRAMES} frames); got ${image.width}×${image.height} (${tex.frameTotal - 1})`)
    }
    for (const [clip, def] of Object.entries(layout.clips)) {
      if (scene.anims.exists(key(clip))) continue
      scene.anims.create({ key: key(clip), frameRate: def.rate, repeat: def.loop ? -1 : 0, frames: def.frames.map(frame => ({ key: texture, frame })) })
    }
  }
  return {
    anims: { idle: key('idle'), attack: key('strike'), hit: key('hit'), death: key('death'), stun: key('stun'), abilities: Object.fromEntries(abilities.map(a => [a, key(a)])) },
    walk: (dx, dy) => Math.abs(dy) > Math.abs(dx) ? key(dy < 0 ? 'walkUp' : 'walkDown') : key(dx < 0 ? 'walkLeft' : 'walkRight'),
    flip: dx => dx < 0, // attack art faces right
    walkFlip: dx => layout.mirrorLeft && dx < 0,
    preload(scene) {
      if (!scene.textures.exists(texture)) scene.load.spritesheet(texture, `${import.meta.env.BASE_URL}assets/sprites/${name}/${name}-spritesheet.png`, { frameWidth: ABILITY_SHEET.cell, frameHeight: ABILITY_SHEET.cell })
    },
    create(scene) {
      ensure(scene)
      const sprite = scene.add.sprite(0, 26, texture).setOrigin(.5, layout.feet / ABILITY_SHEET.cell).setScale(layout.scale)
      sprite.play({ key: key('idle'), startFrame: Phaser.Math.Between(0, 3) })
      return sprite
    },
  }
}
export const k9Kit = abilitySheetKit('k9', 'k9-enforcer', K9_LAYOUT, ['rush', 'bite', 'codered'])
export const platypusKit = abilitySheetKit('platypus', 'agent-platypus', PLATYPUS_LAYOUT, ['cloak', 'venom', 'blackout'])
