/**
 * The canvas is sized in device pixels (capped at 2x for fill-rate) and displayed at CSS size, so lines, sprites and
 * text land on real screen pixels instead of being stretched by the browser. Scenes that lay things out in CSS pixels
 * divide `scale.width/height` by DPR and zoom their camera by DPR.
 */
export const DPR = Math.min(2, Math.max(1, window.devicePixelRatio || 1))
/** Phaser rasterises Text at resolution 1 unless told otherwise; the portrait cameras zoom it up to ~2x. */
export const TEXT_RESOLUTION = DPR >= 2 ? 3 : 2
