import { NextResponse, type NextRequest } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'
import { updateSession } from '@/lib/supabase/middleware'
import { serverEnv } from '@/lib/config'

const intlMiddleware = createIntlMiddleware(routing)

export async function proxy(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  const platformDomain = serverEnv.platformCookieDomain
  const path = request.nextUrl.pathname

  // Subdomain mode: if a platform domain is configured AND the current host
  // matches it, rewrite "/" to "/platform/" and bypass intl/supabase entirely.
  if (platformDomain && host === platformDomain) {
    if (!path.startsWith('/platform')) {
      const url = request.nextUrl.clone()
      url.pathname = `/platform${path}`
      return NextResponse.rewrite(url)
    }
    return NextResponse.next()
  }

  // Path-prefix mode: same host. If the request is already for /platform/*,
  // bypass intl/supabase (the platform app has its own session and fixed locale).
  if (path.startsWith('/platform')) {
    return NextResponse.next()
  }

  // Tenant-world flow (unchanged).
  // Refresh Supabase session first (handles token refresh), then run i18n.
  const supabaseResponse = await updateSession(request)
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
