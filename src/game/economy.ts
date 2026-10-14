/**
 * Client-side mirror of the economy settings that the UI needs to show. The server (public.economy_config) is the
 * authority for every purchase and reward; tests/economy.test.mjs keeps these defaults equal to the SQL seed.
 */
export const ECONOMY = {
  starterFighters: ['chicken', 'capybara', 'frog'] as readonly string[],
  unlockPriceDiamonds: 10,
}
export const isStarter = (id: string) => ECONOMY.starterFighters.includes(id)
