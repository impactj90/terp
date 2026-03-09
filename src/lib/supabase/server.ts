/**
 * Server-side Supabase client.
 *
 * Used in Server Components, Route Handlers, and Server Actions.
 * Reads/writes session cookies for server-side auth resolution.
 */
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { clientEnv } from '@/config/env'

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(
    clientEnv.supabaseUrl,
    clientEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )
}
