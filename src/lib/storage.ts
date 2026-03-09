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
