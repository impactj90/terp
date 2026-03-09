/**
 * Browser-side Supabase client.
 *
 * Used in Client Components for auth operations (login, logout, session).
 * The browser client automatically handles session persistence via cookies.
 */
import { createBrowserClient } from '@supabase/ssr'
import { clientEnv } from '@/config/env'

export function createClient() {
  return createBrowserClient(
    clientEnv.supabaseUrl,
    clientEnv.supabaseAnonKey
  )
}
