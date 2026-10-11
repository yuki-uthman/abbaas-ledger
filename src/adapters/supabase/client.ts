// The ONLY place a Supabase client is constructed. Only the project URL and the
// anon key cross into the bundle, as the two documented build-time variables; the
// service-role key exists only in the acceptance support, outside the browser.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const required = (name: string, value: string | undefined): string => {
  if (!value) {
    // Starting without these would mean a bundle that silently cannot sign in.
    throw new Error(`${name} is missing: the bundle must be built with it.`)
  }
  return value
}

export const createSupabaseClient = (): SupabaseClient =>
  createClient(
    required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
    required('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY),
    {
      auth: {
        // The persisted session is the only session: the browser keeps it and the
        // client refreshes it, so a later visit on this phone opens Home directly.
        persistSession: true,
        autoRefreshToken: true,
        // No session ever arrives in the URL: email and password only.
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    },
  )
