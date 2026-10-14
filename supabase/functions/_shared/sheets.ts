// Pure helpers for the Google Sheets export: row building and A1 ranges. No network, unit-tested in Node.
export interface PlayerRow { id: string; display_name: string; account_type: string; level: number; experience: number; coins: number; ranking_points: number; wins: number; losses: number; total_matches: number; updated_at: string }
export interface LeaderRow { position: number; player: string; ranking_points: number; wins: number; losses: number; total_matches: number }
export interface MatchRow { id: string; match_type: string; player_1: string; player_2: string; winner: string | null; match_status: string; finished_at: string | null; started_at: string }

export const SHEETS = {
  PLAYERS: ['Player ID', 'Display Name', 'Account Type', 'Level', 'XP', 'Coins', 'Ranking Points', 'Wins', 'Losses', 'Total Matches', 'Last Updated'],
  LEADERBOARD: ['Rank', 'Player', 'Ranking Points', 'Wins', 'Losses', 'Total Matches'],
  MATCHES: ['Match ID', 'Match Type', 'Player 1', 'Player 2', 'Winner', 'Match Status', 'Date'],
} as const

/** Privacy: only the first 8 characters of an id leave the database; no emails, no avatar URLs. */
export const shortId = (id: string) => id.slice(0, 8)
/** Spreadsheet formulas can be injected through display names; neutralise leading =, +, -, @. */
export const safeCell = (value: string | number | null) => typeof value === 'string' && /^[=+\-@]/.test(value) ? `'${value}` : (value ?? '')

export const playerRows = (rows: PlayerRow[]) => rows.map((r) => [shortId(r.id), safeCell(r.display_name), r.account_type, r.level, r.experience, r.coins, r.ranking_points, r.wins, r.losses, r.total_matches, r.updated_at])
export const leaderboardRows = (rows: LeaderRow[]) => rows.map((r) => [r.position, safeCell(r.player), r.ranking_points, r.wins, r.losses, r.total_matches])
export const matchRows = (rows: MatchRow[]) => rows.map((r) => [shortId(r.id), r.match_type, safeCell(r.player_1), safeCell(r.player_2), safeCell(r.winner), r.match_status, r.finished_at ?? r.started_at])
/** Rows already in the sheet are never appended again, so a retry after a partial failure cannot duplicate matches. */
export const unseenMatches = (rows: MatchRow[], existingShortIds: Iterable<string>) => { const seen = new Set(existingShortIds); return rows.filter((r) => !seen.has(shortId(r.id))) }
export const range = (sheet: keyof typeof SHEETS, rows: number) => `${sheet}!A2:${String.fromCharCode(64 + SHEETS[sheet].length)}${rows + 1}`
