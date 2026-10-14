import { CONFIG } from '../game/config'

/** Measured landmarks in the unmodified 1672×941 source PNG. */
export const BACKGROUND_ART = {
  width: 1672, height: 941,
  // Conservative inset within the rounded sandy floor, excluding walls and rocks.
  sand: { left: 610, right: 1062, top: 130, bottom: 835 },
  // Immediate outer stone rim, excluding banners, towers, and spectator walkways.
  rim: { left: 578, right: 1094 },
  anchor: { x: 836, y: 485 },
  scale: .9,
} as const
export const PLAYABLE_BOUNDS = CONFIG.arena
const centerX = (PLAYABLE_BOUNDS.left + PLAYABLE_BOUNDS.right) / 2
const centerY = (PLAYABLE_BOUNDS.top + PLAYABLE_BOUNDS.bottom) / 2
export const BACKGROUND_PLACEMENT = {
  x: centerX - BACKGROUND_ART.anchor.x * BACKGROUND_ART.scale,
  y: centerY - BACKGROUND_ART.anchor.y * BACKGROUND_ART.scale,
  width: BACKGROUND_ART.width * BACKGROUND_ART.scale,
  height: BACKGROUND_ART.height * BACKGROUND_ART.scale,
}
export function sourceToWorld(x: number, y: number) {
  return { x: BACKGROUND_PLACEMENT.x + x * BACKGROUND_ART.scale,
    y: BACKGROUND_PLACEMENT.y + y * BACKGROUND_ART.scale }
}
