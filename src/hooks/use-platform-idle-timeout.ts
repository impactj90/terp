"use client"

/**
 * Client-side idle detection for platform-admin sessions.
 *
 * Server-side enforcement is already in place: `verify()` in
 * `src/lib/platform/jwt.ts` rejects tokens whose `lastActivity` is older
 * than the idle threshold, and every tRPC procedure refreshes that
 * claim. This hook is the UX layer: it bounces the operator back to
 * `/platform/login?reason=idle_timeout` before their next request eats
 * a 401.
 *
 * Mounted once in `src/app/platform/(authed)/layout.tsx`. Listens for
 * pointer/keyboard/scroll events; a passive 30s interval checks elapsed
 * idle time and redirects past the logout threshold.
 */
import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

const LOGOUT_AT_MS = 30 * 60 * 1000 // 30 min — matches `verify()` server side

export function usePlatformIdleTimeout() {
  const router = useRouter()
  const lastActivity = useRef(Date.now())

  useEffect(() => {
    const bump = () => {
      lastActivity.current = Date.now()
    }
    const events = ["mousemove", "keydown", "touchstart", "scroll"] as const
    events.forEach((e) =>
      window.addEventListener(e, bump, { passive: true })
    )

    const id = window.setInterval(() => {
      const idle = Date.now() - lastActivity.current
      if (idle > LOGOUT_AT_MS) {
        router.push("/platform/login?reason=idle_timeout")
      }
    }, 30 * 1000)

    return () => {
      window.clearInterval(id)
      events.forEach((e) => window.removeEventListener(e, bump))
    }
  }, [router])
}
