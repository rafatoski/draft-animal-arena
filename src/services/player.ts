export interface PlayerProfile { name: string | null; coins: number }
/** Local display state only; no invented rewards, purchases, account, or backend. */
export function loadPlayer(): PlayerProfile {
  try {
    const value = JSON.parse(localStorage.getItem('animal-arena.player.v1') ?? 'null')
    return { name: typeof value?.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 24) : null,
      coins: Number.isSafeInteger(value?.coins) && value.coins >= 0 ? value.coins : 0 }
  } catch { return { name: null, coins: 0 } }
}
