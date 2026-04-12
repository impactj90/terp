/**
 * Auth token storage interface.
 * Provides synchronous access to the current Supabase access token.
 *
 * The token is synced from the Supabase session by the AuthProvider.
 * This allows hooks to use `authStorage.getToken()` synchronously.
 */
export interface AuthTokenStorage {
  getToken: () => string | null
  setToken: (token: string) => void
  clearToken: () => void
}

/**
 * Tenant ID storage interface.
 * Allows different storage implementations.
 */
export interface TenantStorage {
  getTenantId: () => string | null
  setTenantId: (tenantId: string) => void
  clearTenantId: () => void
}

// Default implementations using localStorage (client-side only)
const createLocalStorage = (key: string) => ({
  get: (): string | null => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(key)
  },
  set: (value: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(key, value)
    }
  },
  clear: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(key)
    }
  },
})

const tenantStorage = createLocalStorage('tenant_id')

/**
 * Module-level cache for the Supabase access token.
 * Updated by AuthProvider when the session changes.
 *
 * This bridges the gap between Supabase's async session API
 * and hooks that need synchronous token access.
 */
let cachedAccessToken: string | null = null

export const authStorage: AuthTokenStorage = {
  getToken: () => cachedAccessToken,
  setToken: (token: string) => {
    cachedAccessToken = token
  },
  clearToken: () => {
    cachedAccessToken = null
  },
}

export const tenantIdStorage: TenantStorage = {
  getTenantId: tenantStorage.get,
  setTenantId: tenantStorage.set,
  clearTenantId: tenantStorage.clear,
}

/**
 * Platform operator impersonation state.
 *
 * When a platform operator activates a support session and clicks
 * "Tenant öffnen" in /platform/support-sessions, we persist
 * {supportSessionId, tenantId, expiresAt} here. The tenant tRPC client
 * (src/trpc/client.tsx) reads this slot on every request and injects
 * `x-support-session-id` + overrides `x-tenant-id`. It explicitly does
 * NOT attach the Authorization header — see S2 in the plan at
 * thoughts/shared/plans/2026-04-10-platform-impersonation-ui-bridge.md.
 *
 * The actual platform auth token lives in the HttpOnly `platform-session`
 * cookie — this localStorage slot only carries routing hints. Forging
 * this slot from an XSS payload is useless without the cookie, which
 * the backend validates in src/trpc/init.ts.
 *
 * Scope: dev (same-host `localhost:3001`) only. Prod cross-domain
 * handling is a follow-up.
 */
export interface PlatformImpersonationRef {
  supportSessionId: string
  tenantId: string
  /** ISO 8601 — used for client-side auto-clear of stale entries. */
  expiresAt: string
}

export interface PlatformImpersonationStorage {
  get: () => PlatformImpersonationRef | null
  set: (ref: PlatformImpersonationRef) => void
  clear: () => void
}

const PLATFORM_IMPERSONATION_KEY = 'terp_platform_impersonation'

export const platformImpersonationStorage: PlatformImpersonationStorage = {
  get: () => {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(PLATFORM_IMPERSONATION_KEY)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as PlatformImpersonationRef
      // Auto-clear if past expiry — the 4h absolute cap is enforced
      // server-side too, this is a UX nicety.
      if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
        window.localStorage.removeItem(PLATFORM_IMPERSONATION_KEY)
        return null
      }
      return parsed
    } catch {
      window.localStorage.removeItem(PLATFORM_IMPERSONATION_KEY)
      return null
    }
  },
  set: (ref) => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      PLATFORM_IMPERSONATION_KEY,
      JSON.stringify(ref),
    )
  },
  clear: () => {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(PLATFORM_IMPERSONATION_KEY)
  },
}
