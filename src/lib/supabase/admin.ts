/**
 * Service-role Supabase client for admin operations.
 *
 * Bypasses RLS (Row Level Security). Use only on the server side
 * for operations that require elevated privileges (e.g., revoking sessions).
 *
 * NEVER expose the service role key to the client.
 */
import { createClient } from '@supabase/supabase-js'
import { clientEnv, serverEnv } from '@/lib/config'

export function createAdminClient() {
  return createClient(
    clientEnv.supabaseUrl,
    serverEnv.supabaseServiceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
