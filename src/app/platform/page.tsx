import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { verify } from "@/lib/platform/jwt"
import { PLATFORM_SESSION_COOKIE_NAME } from "@/lib/platform/cookie"

/**
 * Platform root page — server-side redirect.
 *
 * If a valid platform-session cookie is present, land the admin on the
 * dashboard; otherwise send them to the login page. Session verification
 * is done here (rather than in a client guard) so that the tenant app's
 * client code never runs on the platform tree.
 */
export default async function PlatformRootPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get(PLATFORM_SESSION_COOKIE_NAME)?.value ?? null

  if (token) {
    const result = await verify(token)
    if (result.ok) {
      redirect("/platform/dashboard")
    }
  }

  redirect("/platform/login")
}
