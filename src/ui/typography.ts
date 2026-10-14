import lilitaOneUrl from '../assets/lilita-one-regular.ttf'

export const GAME_FONT_NAME = 'Lilita One'
export const GAME_FONT_FALLBACK = '"Trebuchet MS", Arial, sans-serif'
export const GAME_FONT_FAMILY = `"${GAME_FONT_NAME}", ${GAME_FONT_FALLBACK}`

/**
 * Register and load the local Google Fonts file before Phaser creates any Text
 * objects. A failed load is non-fatal because every text style includes the
 * existing system-font fallback.
 */
export async function loadGameFont(): Promise<boolean> {
  if (!('fonts' in document) || typeof FontFace === 'undefined') return false
  if (document.fonts.check(`16px "${GAME_FONT_NAME}"`, 'ÁÉÍÓÚÜÑáéíóúüñ¡¿')) return true

  try {
    const face = new FontFace(
      GAME_FONT_NAME,
      `url(${lilitaOneUrl}) format("truetype")`,
      { style: 'normal', weight: '400', display: 'swap' },
    )
    const loaded = await face.load()
    document.fonts.add(loaded)
    return document.fonts.check(`16px "${GAME_FONT_NAME}"`, 'ÁÉÍÓÚÜÑáéíóúüñ¡¿')
  } catch {
    return false
  }
}
