/**
 * Supabase client for Next.js middleware.
 *
 * Refreshes session tokens on every request to keep the session alive.
 * This must run in the middleware to update cookies before the request
 * reaches Server Components or Route Handlers.
 */
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { clientEnv, serverEnv } from '@/lib/config'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    serverEnv.supabaseUrl || clientEnv.supabaseUrl,
    clientEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh the session (this handles token refresh automatically)
  await supabase.auth.getUser()

  return supabaseResponse
}
