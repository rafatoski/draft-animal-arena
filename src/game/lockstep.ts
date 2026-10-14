/** A press made at local tick t takes effect at t + INPUT_DELAY on both screens (6 ticks = 300 ms): longer than a typical network trip, too short to feel. */
export const INPUT_DELAY = 6
/** What each side broadcasts: round (series attempt), frontier ("every press of mine taking effect at or before this tick is already in `p`"), and all its presses of that round as [tick, unit]. Resent whole, so a lost message costs nothing. */
export interface SyncMessage { r: number; f: number; p: [number, number][] }

/**
 * Keeps two clients' simulations in step. The simulation is deterministic, so identical presses at identical ticks give identical fights;
 * this only decides when a step may run (the rival's presses for it are known) and which presses land on it. No networking in here.
 */
export class Lockstep {
  private peer = new Map<number, { frontier: number; presses: [number, number][] }>()
  private mine: [number, number][] = []
  private readonly peerUnits: readonly number[]
  constructor(peerUnits: readonly number[]) { this.peerUnits = peerUnits }
  /** Untrusted input from the channel: only the rival's own fighters are accepted. */
  receive(m: SyncMessage) {
    if (!m || !Number.isInteger(m.r) || !Number.isInteger(m.f) || !Array.isArray(m.p)) return
    const slot = this.peer.get(m.r) ?? { frontier: 0, presses: [] }
    slot.frontier = Math.max(slot.frontier, m.f)
    for (const [tick, unit] of m.p.slice(0, 60)) {
      if (Number.isInteger(tick) && tick > 0 && this.peerUnits.includes(unit) && !slot.presses.some(q => q[0] === tick && q[1] === unit)) slot.presses.push([tick, unit])
    }
    this.peer.set(m.r, slot)
  }
  startRound() { this.mine = [] }
  /** My press, made while the simulation sits at `tick`. Returns the tick it will take effect on. */
  schedule(tick: number, unit: number) { this.mine.push([tick + INPUT_DELAY, unit]); return tick + INPUT_DELAY }
  /** True while one of my presses is still waiting for its tick. */
  pendingUnit(tick: number) { return this.mine.find(([t]) => t > tick)?.[1] }
  message(round: number, tick: number): SyncMessage { return { r: round, f: tick + INPUT_DELAY - 1, p: this.mine } }
  /** May the simulation make step `tick`? The rival's frontier starts at the free window nobody can have pressed in yet. */
  ready(round: number, tick: number) { return Math.max(this.peer.get(round)?.frontier ?? 0, INPUT_DELAY - 1) >= tick }
  /** Units (both teams) whose press takes effect on `tick`, in unit order. */
  due(round: number, tick: number) {
    const all = [...this.mine, ...(this.peer.get(round)?.presses ?? [])]
    return all.filter(([t]) => t === tick).map(([, unit]) => unit).sort((a, b) => a - b)
  }
}
