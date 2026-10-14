import type { Session, User } from '@supabase/supabase-js'
import { supabase, supabaseUrl, supabasePublicKey } from './supabase'

export type AuthFailure = 'not-configured' | 'provider-disabled' | 'network' | 'error'
export type AuthResult = { ok: true; user: User } | { ok: false; reason: AuthFailure; message: string }

const classify = (message: string, fallback: AuthFailure = 'error'): AuthFailure =>
  /provider/i.test(message) && /(not|isn.t) enabled|disabled|unsupported/i.test(message) ? 'provider-disabled'
  : /fetch|network|timeout/i.test(message) ? 'network' : fallback
const failure = (error: unknown): AuthResult => {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? 'Network error')
  return { ok: false, reason: classify(message), message }
}

/** Current stored session, if any. Reads local storage only; no network request and no account creation. */
export async function currentSession(): Promise<Session | null> {
  if (!supabase) return null
  try { return (await supabase.auth.getSession()).data.session } catch { return null }
}

/**
 * "Continue with Google": navigates to Google and comes back to this page, where supabase-js completes the PKCE exchange
 * on load. Needs the Google provider enabled and this origin in the dashboard's redirect URLs.
 */
export async function signInWithGoogle(): Promise<AuthResult | { ok: true; redirecting: true }> {
  if (!supabase) return { ok: false, reason: 'not-configured', message: 'Supabase env vars are missing.' }
  const redirectTo = window.location.origin + window.location.pathname
  try {
    // Ask the public auth settings first: navigating to a disabled provider would replace the game with a raw JSON error page.
    const settings = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: supabasePublicKey! }, signal: AbortSignal.timeout(8000) })
    if (settings.ok && !(await settings.json())?.external?.google) return { ok: false, reason: 'provider-disabled', message: 'Google provider is not enabled.' }
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } })
    if (error || !data?.url) return failure(error ?? new Error('No redirect URL'))
    window.location.assign(data.url)
    return { ok: true, redirecting: true }
  } catch (error) { return failure(error) }
}

/**
 * The session the game may use: a real (Google) one. Guests are never Supabase users, so a leftover anonymous session
 * (from an older build) is discarded locally instead of being treated as an account.
 */
export async function realSession(): Promise<Session | null> {
  const session = await currentSession()
  if (session?.user.is_anonymous) { try { await supabase?.auth.signOut({ scope: 'local' }) } catch { /* ignore */ } return null }
  return session
}

export async function signOut() {
  try { await supabase?.auth.signOut() } catch { /* offline: the local session is dropped anyway */ }
}

/** Subscribe to sign-in / sign-out. Returns an unsubscribe function. */
export function onAuthChange(listener: (user: User | null) => void) {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_event, session) => listener(session?.user ?? null))
  return () => data.subscription.unsubscribe()
}
