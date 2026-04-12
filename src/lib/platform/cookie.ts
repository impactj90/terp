/**
 * Platform-admin session cookie builders.
 *
 * Two modes, selected by `PLATFORM_COOKIE_DOMAIN`:
 *
 *   - Set (prod, e.g. `admin.terp.de`): cookie is scoped to that domain, so
 *     the tenant app at `app.terp.de` never sees it.
 *   - Empty (dev): host-only cookie on the current host. Sits next to the
 *     Supabase tenant cookies on `localhost` but is isolated by its own
 *     distinct name (`platform-session`).
 *
 * The cookie is always `HttpOnly; Secure; SameSite=Strict`. Max-Age matches
 * the JWT absolute session cap from `./jwt` so the browser drops the cookie
 * at the same moment the token stops verifying.
 */
import { serverEnv } from "@/lib/config"
import { SESSION_CONSTANTS } from "./jwt"

export const PLATFORM_SESSION_COOKIE_NAME = "platform-session"

export function buildSessionCookie(value: string): string {
  const parts = [
    `${PLATFORM_SESSION_COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    `Max-Age=${Math.floor(SESSION_CONSTANTS.SESSION_MAX_MS / 1000)}`,
  ]
  if (serverEnv.platformCookieDomain) {
    parts.push(`Domain=${serverEnv.platformCookieDomain}`)
  }
  return parts.join("; ")
}

export function buildClearCookie(): string {
  const parts = [
    `${PLATFORM_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Max-Age=0",
  ]
  if (serverEnv.platformCookieDomain) {
    parts.push(`Domain=${serverEnv.platformCookieDomain}`)
  }
  return parts.join("; ")
}

/**
 * Extract the platform-session cookie value from a raw Cookie header.
 * Returns null if the header is missing or the cookie is not present.
 */
export function readSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(";")
  for (const part of parts) {
    const [rawName, ...rest] = part.split("=")
    const name = rawName?.trim()
    if (name === PLATFORM_SESSION_COOKIE_NAME) {
      return rest.join("=").trim() || null
    }
  }
  return null
}
