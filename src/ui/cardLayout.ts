/**
 * Slot geometry of the collectible-card template, measured from public/assets/cards/chicken-card.png
 * at its original 1086×1448 size. Every illustrated card shares this template, so cards of any
 * resolution (same aspect ratio) reuse these rectangles scaled to the card width.
 */
export const CARD_REFERENCE = { width: 1086, height: 1448 }
interface Rect { x: number; y: number; width: number; height: number }
const NAME_SLOT: Rect = { x: 162, y: 139, width: 761, height: 137 }
const STAT_SLOTS: readonly Rect[] = [
  { x: 130, y: 1115, width: 243, height: 150 },
  { x: 426, y: 1115, width: 232, height: 150 },
  { x: 711, y: 1115, width: 243, height: 150 },
]
/** The framed window that holds the illustration, used only by the fallback card. */
const ART_WINDOW: Rect = { x: 92, y: 300, width: 902, height: 740 }
/**
 * Central illustration of a card for a tile of the given width:height aspect, in template pixels.
 * Always full height of the framed art window (inset past its gold edge), centred horizontally, so the
 * name plate, stat slots and card border are excluded.
 */
export function illustrationCrop(aspect: number) {
  const inset = 14, height = ART_WINDOW.height - inset * 2, width = Math.min(ART_WINDOW.width - inset * 2, height * aspect)
  return { x: ART_WINDOW.x + ART_WINDOW.width / 2 - width / 2, y: ART_WINDOW.y + inset, width, height }
}
/** Chamfered ends of the name plate are unsafe for text; use this inner fraction of its width. */
const NAME_SAFE = .78

/** All rectangles in pixels relative to the card centre, for a card `width` pixels wide. */
export function cardSlots(width: number) {
  const k = width / CARD_REFERENCE.width, height = CARD_REFERENCE.height * k
  const rect = (r: Rect): Rect => ({ x: r.x * k - width / 2, y: r.y * k - height / 2, width: r.width * k, height: r.height * k })
  const name = rect(NAME_SLOT)
  return { scale: k, height, name, nameMaxWidth: name.width * NAME_SAFE, stats: STAT_SLOTS.map(rect), art: rect(ART_WINDOW) }
}
