import { ECONOMY } from '../game/economy'

/**
 * Guest session: plain in-memory state, on purpose. Nothing is written to localStorage or Supabase, so a page reload or
 * a sign-in to Google starts from zero and the coins can never be recovered or merged into an account.
 */
export interface GuestSession { name: string; coins: number }
let guest: GuestSession | null = null

export const getGuest = () => guest
export const startGuest = (random = Math.random): GuestSession => (guest = { name: `Guest${1000 + Math.floor(random() * 9000)}`, coins: 0 })
export const endGuest = () => { guest = null }
/** Practice win as a guest: 1-3 session-only coins. Returns the amount granted (0 when there is no guest session). */
export function guestPracticeWin(random = Math.random) {
  if (!guest) return 0
  const { min, max } = ECONOMY.coinReward, coins = min + Math.floor(random() * (max - min + 1))
  guest.coins += coins
  return coins
}
