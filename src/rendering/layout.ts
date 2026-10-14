import { BACKGROUND_ART, BACKGROUND_PLACEMENT, sourceToWorld } from './battlefield'
export interface Viewport { x: number; y: number; width: number; height: number }
// Desktop contains the original image. Portrait fits only the immediate stone rim.
export const COLOSSEUM = BACKGROUND_PLACEMENT
const rimLeft = sourceToWorld(BACKGROUND_ART.rim.left, 0).x
const rimRight = sourceToWorld(BACKGROUND_ART.rim.right, 0).x
// Vertical safety envelope includes all spawn positions, health bars and rising damage.
// Decorative image height must never force the portrait camera to zoom out.
export const COMBAT_FRAME = { x: rimLeft, y: 140, width: rimRight - rimLeft, height: 550 }
export function portraitLayout(width: number, height: number) {
  const zoom = Math.min(width / 480, height / 840)
  return { x: (width - 480 * zoom) / 2, y: (height - 840 * zoom) / 2, width: 480 * zoom, height: 840 * zoom, zoom }
}
export function arenaLayout(width: number, height: number) {
  const landscape = width > height
  // Reserved overlay clearance, not opaque bars or cropped camera viewports.
  const header = height < 500 ? 62 : 96
  const footer = 12
  const viewport: Viewport = { x: 0, y: 0, width, height }
  const frame = landscape ? COLOSSEUM : COMBAT_FRAME
  const zoom = Math.min(width / frame.width, landscape ? height / frame.height : (height - header - footer) / COMBAT_FRAME.height)
  let centerY = frame.y + frame.height / 2
  const effectsTop = height / 2 + (COMBAT_FRAME.y - centerY) * zoom
  if (effectsTop < header) centerY -= (header - effectsTop) / zoom
  return { viewport, zoom, centerX: frame.x + frame.width / 2, centerY, landscape, header, footer }
}
