import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { realSession, onAuthChange } from './auth'
import { ECONOMY } from '../game/economy'
import { bonusFromLevels, noLevels } from '../game/upgrades'
import type { StatLevels, TeamBonus, UpgradeStat } from '../game/upgrades'

// ───────── profile + progression (read-only for the browser; the server pays out) ─────────
export interface OnlineProfile {
  id: string; displayName: string; accountType: 'guest' | 'google'
  coins: number; diamonds: number; owned: string[]; wins: number; losses: number; totalMatches: number
  /** Purchased upgrade levels per fighter (missing fighter = all zero). Loaded from fighter_upgrades. */
  upgrades: Record<string, StatLevels>
}
let profile: OnlineProfile | null = null
const profileListeners = new Set<(p: OnlineProfile | null) => void>()
const setProfile = (p: OnlineProfile | null) => { profile = p; profileListeners.forEach(l => l(p)) }
export const getProfile = () => profile
export function onProfile(listener: (p: OnlineProfile | null) => void) { profileListeners.add(listener); return () => { profileListeners.delete(listener) } }

/** Loads profile and progress for the signed-in user. Failures keep the previous (or no) profile: the game stays playable offline. */
export async function refreshProfile(): Promise<OnlineProfile | null> {
  if (!supabase) return null
  try {
    const session = await realSession()
    if (!session) { setProfile(null); return null }
    const [p, g, f, u] = await Promise.all([
      supabase.from('profiles').select('id, display_name, account_type').eq('id', session.user.id).single(),
      supabase.from('player_progress').select('*').eq('player_id', session.user.id).single(),
      supabase.from('player_fighters').select('fighter_id').eq('player_id', session.user.id),
      supabase.from('fighter_upgrades').select('fighter_id, stat, level').eq('player_id', session.user.id),
    ])
    if (p.error || g.error) { console.warn('[profile] could not load', p.error?.message ?? g.error?.message); return profile }
    const upgrades: Record<string, StatLevels> = {}
    for (const row of u.error ? [] : u.data) (upgrades[row.fighter_id] ??= noLevels())[row.stat as UpgradeStat] = row.level
    setProfile({ id: p.data.id, displayName: p.data.display_name, accountType: p.data.account_type,
      coins: g.data.coins, diamonds: g.data.diamonds ?? 0, owned: f.error ? [...ECONOMY.starterFighters] : f.data.map(r => r.fighter_id), upgrades,
      wins: g.data.wins, losses: g.data.losses, totalMatches: g.data.total_matches })
  } catch { /* offline */ }
  return profile
}

/** Called once at startup: restores the session's profile and keeps it in step with sign-in / sign-out. */
export function startOnlineProfile() {
  if (!supabase) return
  void refreshProfile()
  onAuthChange(user => { if (user && !user.is_anonymous) void refreshProfile(); else setProfile(null) })
}

/**
 * Fighters the player may use. Signed in: what the server says they own. Signed out or offline: the starters only;
 * the locked three stay locked until a purchase is recorded on the server.
 */
/** Bonus map for the combat engine from the signed-in player's purchased upgrades (empty for guests / signed out). */
export const myBonus = (team: readonly string[]): TeamBonus => bonusFromLevels(Object.fromEntries(team.filter(id => profile?.upgrades[id]).map(id => [id, profile!.upgrades[id]!])))

export type UpgradeResult = { ok: true; coins: number; level: number; nextCost: number | null } | { ok: false; reason: 'signed-out' | 'not-enough' | 'changed' | 'maxed' | 'locked' | 'failed'; missing?: number }
/** Buys one upgrade level. The server prices it and checks identity, ownership, balance and that `level` is still current (so a repeat charges nothing). */
export async function upgradeFighter(id: string, stat: UpgradeStat, level: number): Promise<UpgradeResult> {
  if (!supabase || !profile) return { ok: false, reason: 'signed-out' }
  try {
    const { data, error } = await supabase.rpc('upgrade_fighter', { p_fighter: id, p_stat: stat, p_expected_level: level })
    if (error) {
      console.warn('[upgrade] refused:', error.message)
      const need = /need (\d+) more/.exec(error.message)
      await refreshProfile()
      if (need) return { ok: false, reason: 'not-enough', missing: Number(need[1]) }
      if (/level changed/.test(error.message)) return { ok: false, reason: 'changed' }
      if (/max level/.test(error.message)) return { ok: false, reason: 'maxed' }
      if (/not unlocked/.test(error.message)) return { ok: false, reason: 'locked' }
      return { ok: false, reason: 'failed' }
    }
    await refreshProfile()
    return { ok: true, coins: data.coins, level: data.level, nextCost: data.next_cost }
  } catch { return { ok: false, reason: 'failed' } }
}
export const ownedFighters = (): readonly string[] => profile?.owned ?? ECONOMY.starterFighters
export const isUnlocked = (id: string) => ownedFighters().includes(id)

export type UnlockResult = { ok: true } | { ok: false; reason: 'signed-out' | 'not-enough' | 'owned' | 'failed'; missing?: number }
/** Buys a locked fighter. The server checks identity, ownership and balance atomically; the client only names the fighter. */
export async function unlockFighter(id: string): Promise<UnlockResult> {
  if (!supabase || !profile) return { ok: false, reason: 'signed-out' }
  try {
    const { error } = await supabase.rpc('unlock_fighter', { p_fighter: id })
    if (error) {
      const need = /need (\d+) more/.exec(error.message)
      if (need) { await refreshProfile(); return { ok: false, reason: 'not-enough', missing: Number(need[1]) } }
      if (/already unlocked/.test(error.message)) { await refreshProfile(); return { ok: false, reason: 'owned' } }
      return { ok: false, reason: 'failed' }
    }
    await refreshProfile()
    return { ok: true }
  } catch { return { ok: false, reason: 'failed' } }
}

export async function renameProfile(name: string): Promise<boolean> {
  if (!supabase || !profile) return false
  const clean = name.trim().slice(0, 24)
  if (clean.length < 2) return false
  const { error } = await supabase.from('profiles').update({ display_name: clean }).eq('id', profile.id)
  if (!error) await refreshProfile()
  return !error
}

// ───────── leaderboard ─────────
export interface LeaderEntry { position: number; playerId: string; player: string; wins: number; losses: number; totalMatches: number; winRate: number }
export async function fetchLeaderboard(offset: number, limit: number): Promise<{ rows: LeaderEntry[]; error?: string }> {
  if (!supabase) return { rows: [], error: 'offline' }
  try {
    const { data, error } = await supabase.from('leaderboard').select('*').order('position', { ascending: true }).range(offset, offset + limit - 1)
    if (error) return { rows: [], error: error.message }
    return { rows: data.map(r => ({ position: r.position, playerId: r.player_id, player: r.player, wins: r.wins, losses: r.losses, totalMatches: r.total_matches, winRate: r.win_rate })) }
  } catch { return { rows: [], error: 'offline' } }
}

// ───────── rooms ─────────
export type RoomStatus = 'waiting' | 'lobby' | 'in_match' | 'finished' | 'closed'
/** `deadline` = end of the 30 s fighter selection in server-clock epoch ms (null when nobody is waiting on a countdown). */
export interface Room { id: string; code: string; hostId: string; guestId: string | null; status: RoomStatus; matchId: string | null; deadline: number | null }
export interface Seat { playerId: string; name: string; team: string[]; ready: boolean; rematch: boolean }
export interface RoomState { room: Room; seats: Seat[] }

const toRoom = (r: { id: string; room_code: string; host_player_id: string; guest_player_id: string | null; status: RoomStatus; current_match_id: string | null; selection_deadline?: string | null }): Room =>
  ({ id: r.id, code: r.room_code, hostId: r.host_player_id, guestId: r.guest_player_id, status: r.status, matchId: r.current_match_id, deadline: r.selection_deadline ? Date.parse(r.selection_deadline) : null })
export type RoomResult<T> = { ok: true; value: T } | { ok: false; message: string }
async function rpc<T>(name: string, args: object, map: (data: unknown) => T): Promise<RoomResult<T>> {
  if (!supabase) return { ok: false, message: 'offline' }
  try {
    const { data, error } = await supabase.rpc(name, args)
    return error ? { ok: false, message: error.message } : { ok: true, value: map(data) }
  } catch { return { ok: false, message: 'offline' } }
}
export const createRoom = () => rpc('create_room', {}, d => toRoom(d as never))
export const joinRoom = (code: string) => rpc('join_room', { p_code: code }, d => toRoom(d as never))
export const leaveRoom = (roomId: string) => rpc('leave_room', { p_room: roomId }, () => undefined)
export const setTeam = (roomId: string, team: string[]) => rpc('set_team', { p_room: roomId, p_team: team }, () => undefined)
export const setReady = (roomId: string, ready: boolean) => rpc('set_ready', { p_room: roomId, p_ready: ready }, () => undefined)
/** Casts this player's rematch vote. true = both agreed and the room is back in the lobby. */
/** Server clock minus local clock in ms (round-trip corrected), so the countdown follows the server's deadline, not this device's clock. */
export async function serverClockOffset(): Promise<number> {
  if (!supabase) return 0
  try {
    const sent = Date.now(), { data, error } = await supabase.rpc('server_time'), received = Date.now()
    return error || !data ? 0 : Date.parse(data) - (sent + received) / 2
  } catch { return 0 }
}
/** Asks the server to close the selection once its own clock says time is up (refused earlier). Fills incomplete teams with owned fighters. */
export const finalizeSelection = (roomId: string) => rpc('finalize_selection', { p_room: roomId }, () => undefined)
export const saveDraft = (roomId: string, picks: string[]) => rpc('save_draft', { p_room: roomId, p_picks: picks }, () => undefined)
export const rematchRoom = (roomId: string) => rpc('rematch_room', { p_room: roomId }, d => d === true)

export type QuickMatchState = { state: 'searching' } | { state: 'matched'; room: Room }
/** One poll of the matchmaking queue (call every couple of seconds while searching). The server pairs two distinct players atomically. */
export const quickMatch = () => rpc<QuickMatchState>('quick_match', {}, d => {
  const r = d as { state: string; room: Parameters<typeof toRoom>[0] }
  return r.state === 'matched' ? { state: 'matched', room: toRoom(r.room) } : { state: 'searching' }
})
export const cancelQuickMatch = () => rpc('cancel_quick_match', {}, () => undefined)
/** The caller's unfinished room (so a refresh or reconnect can go back into it), or null. */
export async function myActiveRoom(): Promise<Room | null> {
  if (!supabase || !profile) return null
  try {
    const { data, error } = await supabase.rpc('my_active_room')
    return error || !data?.id ? null : toRoom(data)
  } catch { return null }
}

export async function fetchRoomState(roomId: string): Promise<RoomState | null> {
  if (!supabase) return null
  try {
    const room = await supabase.from('multiplayer_rooms').select('*').eq('id', roomId).single()
    if (room.error) return null
    const seats = await supabase.from('room_players').select('player_id, team_selection, ready, rematch').eq('room_id', roomId)
    const ids = [room.data.host_player_id, room.data.guest_player_id].filter(Boolean) as string[]
    const names = await supabase.from('profiles').select('id, display_name').in('id', ids)
    const nameOf = (id: string) => names.data?.find(n => n.id === id)?.display_name ?? '…'
    return { room: toRoom(room.data), seats: (seats.data ?? []).map(s => ({ playerId: s.player_id, name: nameOf(s.player_id), team: s.team_selection, ready: s.ready, rematch: s.rematch })) }
  } catch { return null }
}

/** Runs the authoritative match on the server. Safe to call from both players: the server starts it only once. */
export async function startMatch(roomId: string): Promise<RoomResult<{ matchId: string; created: boolean }>> {
  if (!supabase) return { ok: false, message: 'offline' }
  try {
    const { data, error } = await supabase.functions.invoke('start-match', { body: { room_id: roomId } })
    return error || !data?.match_id ? { ok: false, message: error?.message ?? data?.error ?? 'start failed' } : { ok: true, value: { matchId: data.match_id, created: data.created } }
  } catch { return { ok: false, message: 'offline' } }
}

export interface OnlineMatch {
  id: string; player1: string; player2: string; team1: string[]; team2: string[]; matchSeed: number; combatSeed: number; bonus1: TeamBonus; bonus2: TeamBonus
  status: 'in_progress' | 'finished' | 'aborted'; winnerId: string | null; score1: number | null; score2: number | null; ticks: number | null
}
export async function fetchMatch(matchId: string): Promise<OnlineMatch | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.from('matches').select('*').eq('id', matchId).single()
    if (error) return null
    return { id: data.id, player1: data.player_1_id, player2: data.player_2_id, team1: data.team_1, team2: data.team_2, matchSeed: Number(data.match_seed), combatSeed: Number(data.combat_seed), bonus1: data.bonus_1 ?? {}, bonus2: data.bonus_2 ?? {},
      status: data.match_status, winnerId: data.winner_id, score1: data.score_1, score2: data.score_2, ticks: data.duration_ticks }
  } catch { return null }
}
/** Waits for the server's verdict (written when the match was started; usually already there). */
export async function waitForResult(matchId: string, tries = 12): Promise<OnlineMatch | null> {
  for (let i = 0; i < tries; i++) {
    const match = await fetchMatch(matchId)
    if (match && match.status !== 'in_progress') return match
    await new Promise(resolve => setTimeout(resolve, 800))
  }
  return null
}

/** Realtime: row changes for the room plus presence (who currently has the lobby open). Call the returned function to leave. */
export function watchRoom(roomId: string, myId: string, onChange: () => void, onPresence: (online: Set<string>) => void) {
  if (!supabase) return () => {}
  const channel: RealtimeChannel = supabase.channel(`room:${roomId}`, { config: { presence: { key: myId } } })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'multiplayer_rooms', filter: `id=eq.${roomId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` }, onChange)
    .on('presence', { event: 'sync' }, () => onPresence(new Set(Object.keys(channel.presenceState()))))
    .subscribe(status => { if (status === 'SUBSCRIBED') void channel.track({ at: Date.now() }) })
  return () => { void supabase!.removeChannel(channel) }
}

// ───────── rewards (always read back from the server; nothing here is computed on the client) ─────────
export interface Reward { coins: number; diamonds: number }
/** The payout the server recorded for this player and online match, or null when it cannot be read. */
export async function fetchReward(matchId: string): Promise<Reward | null> {
  const id = getProfile()?.id
  if (!supabase || !id) return null
  try {
    const { data, error } = await supabase.from('reward_ledger').select('coins, diamonds').eq('match_id', matchId).eq('player_id', id).maybeSingle()
    return error || !data ? null : { coins: data.coins, diamonds: data.diamonds }
  } catch { return null }
}

export interface PracticeLaunch { matchId: string; team: string[]; robots: string[]; combatSeed: number; playerWon: boolean; coins: number; limited: boolean; bonus: TeamBonus }
/** Asks the server to run a practice match: it picks the seed, simulates it and records the reward. null = could not be verified. */
export async function practiceMatch(team: readonly string[]): Promise<PracticeLaunch | null> {
  if (!supabase || !profile) return null
  try {
    const { data, error } = await supabase.functions.invoke('practice-match', { body: { team, request_id: crypto.randomUUID() } })
    if (error || !data?.match_id) return null
    return { matchId: data.match_id, team: data.team, robots: data.robot_team, combatSeed: data.combat_seed, playerWon: data.player_won, coins: data.coins, limited: data.limited, bonus: data.bonus ?? {} }
  } catch { return null }
}
