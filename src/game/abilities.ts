/** Active abilities of the newer fighters. Pure data, shared with the Supabase Edge Functions (scripts/sync-shared.mjs). All times are combat ticks (50 ms). */
export type AbilityId = 'rush' | 'bite' | 'codered' | 'cloak' | 'venom' | 'blackout'

export const ABILITIES = {
  // K9 Enforcer
  /** Dash to the nearest enemy beyond melee reach: moderate damage and a short stun. */
  rush: { cooldown: 140, initial: 40, minRange: 12, maxRange: 210, damage: 1.2, stun: 14 },
  /** Bite in melee: direct damage and the target cannot attack for a while (it can still move). */
  bite: { cooldown: 100, initial: 20, damage: 1.1, disarm: 24 },
  /** Ultimate: shockwave around K9 hitting every enemy in the radius, plus a short stun. Needs two enemies close (or one left). */
  codered: { cooldown: 380, initial: 160, radius: 150, damage: 1.0, stun: 12 },
  // Agent Platypus
  /** Stealth: the next incoming attack (basic or ability) is evaded; ends after `duration` ticks at the latest. */
  cloak: { cooldown: 220, initial: 30, duration: 40, trigger: 170 },
  /** Hind-leg spur: direct damage, then poison (flat damage every `every` ticks, ignoring defence; re-applying refreshes, never stacks). */
  venom: { cooldown: 90, initial: 10, damage: 1.1, poisonTicks: 60, poisonDamage: 3, every: 10 },
  /** Ultimate: vanishes in smoke, reappears beside the nearest enemy and strikes up to three enemies `hits` times each. */
  blackout: { cooldown: 420, initial: 200, radius: 220, targets: 3, hits: 3, damage: .6, evade: 20 },
} as const
