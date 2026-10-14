export type Language = 'en' | 'es'
export interface Preferences { language: Language; music: boolean; sfx: boolean }
const KEY = 'animal-arena.preferences.v1'
export function parsePreferences(raw: string | null): Preferences {
  const defaults: Preferences = { language: 'en', music: true, sfx: true }
  try {
    const value = JSON.parse(raw ?? 'null')
    return { language: value?.language === 'es' ? 'es' : 'en',
      music: typeof value?.music === 'boolean' ? value.music : defaults.music,
      sfx: typeof value?.sfx === 'boolean' ? value.sfx : defaults.sfx }
  } catch { return defaults }
}
function load(): Preferences {
  try { return parsePreferences(localStorage.getItem(KEY)) } catch { return parsePreferences(null) }
}
export const preferences = load()
export function savePreferences(change: Partial<Preferences>) {
  Object.assign(preferences, change)
  try { localStorage.setItem(KEY, JSON.stringify(preferences)) } catch { /* Play remains available when storage is blocked. */ }
}
