import { supabase, supabaseConfigured, supabaseUrl, supabasePublicKey } from './supabase'

export interface Diagnostic { configured: boolean; auth: 'ok' | 'failed' | 'skipped'; database: 'reachable' | 'failed' | 'skipped'; detail: string[] }

const timeout = (ms: number) => AbortSignal.timeout(ms)

/**
 * Real network checks (not just "the client was constructed"). Dev only; prints status words, never keys or tokens.
 * - auth: GET /auth/v1/health
 * - database: a select on a table that does not exist yet. PostgREST answering 404 PGRST205 means the API is reachable.
 */
export async function runSupabaseDiagnostic(): Promise<Diagnostic> {
  const result: Diagnostic = { configured: supabaseConfigured, auth: 'skipped', database: 'skipped', detail: [] }
  if (!supabase || !supabaseUrl || !supabasePublicKey) { result.detail.push('VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY not set'); return result }
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/health`, { headers: { apikey: supabasePublicKey }, signal: timeout(8000) })
    result.auth = response.ok ? 'ok' : 'failed'; result.detail.push(`auth health HTTP ${response.status}`)
  } catch (error) { result.auth = 'failed'; result.detail.push(`auth unreachable: ${error instanceof Error ? error.name : 'error'}`) }
  try {
    const { error } = await supabase.from('__connection_check').select('*').limit(1).abortSignal(timeout(8000))
    result.database = !error || error.code === 'PGRST205' || error.code === '42P01' ? 'reachable' : 'failed'
    result.detail.push(error ? `database responded: ${error.code ?? 'error'}` : 'database responded')
  } catch (error) { result.database = 'failed'; result.detail.push(`database unreachable: ${error instanceof Error ? error.name : 'error'}`) }
  return result
}
