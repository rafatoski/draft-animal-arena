export interface FighterDefinition {
  id: string; name: string; role: string; color: number
  health: number; attack: number; defense: number; speed: number; crit: number
  range: number; cooldown: number; robot?: true
}
export const FIGHTERS: readonly FighterDefinition[] = [
  { id: 'chicken', name: 'Boxing Chicken', role: 'QUICK JABS', color: 0xffe4a1, health: 125, attack: 19, defense: 4, speed: 66, crit: .20, range: 43, cooldown: 12 },
  { id: 'capybara', name: 'Capybara Tank', role: 'UNBOTHERED', color: 0xbb9169, health: 230, attack: 17, defense: 10, speed: 35, crit: .08, range: 44, cooldown: 21 },
  { id: 'raccoon', name: 'Ninja Raccoon', role: 'TRASH ASSASSIN', color: 0x9ca9be, health: 100, attack: 23, defense: 3, speed: 85, crit: .32, range: 40, cooldown: 15 },
  { id: 'frog', name: 'Wizard Frog', role: 'CROAK & DESTROY', color: 0x91d681, health: 95, attack: 29, defense: 2, speed: 42, crit: .18, range: 140, cooldown: 26 },
  { id: 'fox', name: 'Archer Fox', role: 'VERY POINTY', color: 0xf6a05f, health: 105, attack: 20, defense: 3, speed: 58, crit: .24, range: 165, cooldown: 19 },
  { id: 'pig', name: 'Berserker Pig', role: 'FULL HAM', color: 0xf39eb0, health: 165, attack: 31, defense: 5, speed: 55, crit: .15, range: 46, cooldown: 24 },
]
/** Practice opponents. Deliberately not in FIGHTERS, so drafting and the roster screen never see them. */
export const ROBOTS: readonly FighterDefinition[] = ['robot1', 'robot2', 'robot3'].map(id => (
  { id, name: 'Training Bot', role: 'LASER DRILL', color: 0x9aa8bd, health: 130, attack: 18, defense: 4, speed: 48, crit: .1, range: 150, cooldown: 24, robot: true as const }))
export const ROBOT_IDS = ROBOTS.map(r => r.id)
export function fighterById(id: string): FighterDefinition {
  const fighter = FIGHTERS.find(f => f.id === id) ?? ROBOTS.find(f => f.id === id)
  if (!fighter) throw new Error(`Unknown fighter: ${id}`)
  return fighter
}
