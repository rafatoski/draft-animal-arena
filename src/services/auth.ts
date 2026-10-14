import type { Session, User } from '@supabase/supabase-js'
import { supabase, supabaseUrl, supabasePublicKey } from './supabase'

export type AuthFailure = 'not-configured' | 'anonymous-disabled' | 'provider-disabled' | 'network' | 'error'
export type AuthResult = { ok: true; user: User } | { ok: false; reason: AuthFailure; message: string }

const classify = (message: string, fallback: AuthFailure = 'error'): AuthFailure =>
  /anonymous/i.test(message) && /disabled|not enabled/i.test(message) ? 'anonymous-disabled'
  : /provider/i.test(message) && /(not|isn.t) enabled|disabled|unsupported/i.test(message) ? 'provider-disabled'
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
 * "Play as Guest": reuses the saved session when there is one, otherwise creates one anonymous user.
 * Only ever called from the explicit button (or a feature that needs an identity), never on page load.
 * Anonymous sign-ins must be enabled in the Supabase dashboard (Authentication > Sign In / Providers).
 */
export async function ensurePlayer(): Promise<AuthResult> {
  if (!supabase) return { ok: false, reason: 'not-configured', message: 'Supabase env vars are missing.' }
  try {
    const existing = await currentSession()
    if (existing) return { ok: true, user: existing.user }
    const { data, error } = await supabase.auth.signInAnonymously()
    return error ? failure(error) : { ok: true, user: data.user! }
  } catch (error) { return failure(error) }
}

/**
 * "Continue with Google". A guest is upgraded in place (linkIdentity keeps the user id, so progress is kept);
 * anyone else signs in normally. Both navigate away to Google and come back to this page, where supabase-js
 * completes the PKCE exchange on load. Needs the Google provider and manual linking enabled in the dashboard.
 */
export async function signInWithGoogle(): Promise<AuthResult | { ok: true; redirecting: true }> {
  if (!supabase) return { ok: false, reason: 'not-configured', message: 'Supabase env vars are missing.' }
  const redirectTo = window.location.origin + window.location.pathname
  try {
    // Ask the public auth settings first: navigating to a disabled provider would replace the game with a raw JSON error page.
    const settings = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: supabasePublicKey! }, signal: AbortSignal.timeout(8000) })
    if (settings.ok && !(await settings.json())?.external?.google) return { ok: false, reason: 'provider-disabled', message: 'Google provider is not enabled.' }
    const session = await currentSession()
    const options = { redirectTo, skipBrowserRedirect: true }
    const { data, error } = session?.user.is_anonymous
      ? await supabase.auth.linkIdentity({ provider: 'google', options })
      : await supabase.auth.signInWithOAuth({ provider: 'google', options })
    if (error || !data?.url) return failure(error ?? new Error('No redirect URL'))
    window.location.assign(data.url)
    return { ok: true, redirecting: true }
  } catch (error) { return failure(error) }
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
