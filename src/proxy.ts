import { type NextRequest } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'
import { updateSession } from '@/lib/supabase/middleware'

const intlMiddleware = createIntlMiddleware(routing)

export async function proxy(request: NextRequest) {
  // Refresh Supabase session first (handles token refresh)
  const supabaseResponse = await updateSession(request)

  // Then run i18n middleware
  const intlResponse = intlMiddleware(request)

  // Merge cookies from Supabase response into intl response
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    intlResponse.cookies.set(cookie)
  })

  return intlResponse
}

export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
}
