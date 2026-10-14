/**
 * Client-side mirror of the economy settings that the UI needs to show. The server (public.economy_config) is the
 * authority for every purchase and reward; tests/economy.test.mjs keeps these defaults equal to the SQL seed.
 */
export const ECONOMY = {
  starterFighters: ['chicken', 'capybara', 'frog'] as readonly string[],
  unlockPriceDiamonds: 10,
  coinReward: { min: 1, max: 3 },
}
export const isStarter = (id: string) => ECONOMY.starterFighters.includes(id)

/** What the results screen may claim. Only 'ok' and 'session' carry amounts, and 'ok' amounts come from the server's own records. */
export type RewardInfo =
  | { status: 'ok'; coins: number; diamonds: number }   // saved by the server
  | { status: 'session'; coins: number }                // guest: temporary, in memory only
  | { status: 'limited' }                               // server refused to pay (practice rate limit)
  | { status: 'failed' }                                // could not be verified or saved
