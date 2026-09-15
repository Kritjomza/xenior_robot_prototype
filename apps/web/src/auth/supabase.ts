import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface SupabaseEnvironment {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

export function createBrowserSupabaseClient(
  environment: SupabaseEnvironment,
): SupabaseClient | null {
  const url = environment.VITE_SUPABASE_URL?.trim()
  const publishableKey = environment.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!url || !publishableKey) return null
  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  })
}

export const supabase = createBrowserSupabaseClient({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
})
