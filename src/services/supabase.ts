import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** True when both public env vars are present. The game never requires it: everything works offline without. */
export const supabaseConfigured = Boolean(url && key)
/** Browser client with the publishable key (safe to ship; row-level security protects data). Undefined when not configured. */
export const supabase = url && key
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } })
  : undefined
export const supabaseUrl = url
export const supabasePublicKey = key
