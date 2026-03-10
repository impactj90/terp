import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from './types'
import { clientEnv } from '@/lib/config'

/**
 * Auth token storage interface.
 * Provides synchronous access to the current Supabase access token.
 *
 * The token is synced from the Supabase session by the AuthProvider.
 * This allows legacy hooks (use-monthly-values, use-reports, etc.)
 * to continue using `authStorage.getToken()` synchronously.
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
 * and legacy hooks that need synchronous token access.
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
 * Auth middleware that adds Authorization header from Supabase session.
 *
 * Reads the access token from the Supabase browser client so that
 * Go backend REST API calls are authenticated with the Supabase JWT.
 */
const authMiddleware: Middleware = {
  async onRequest({ request }) {
    if (typeof window !== 'undefined') {
      const { createClient: createSupabaseClient } = await import(
        '@/lib/supabase/client'
      )
      const supabase = createSupabaseClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session?.access_token) {
        request.headers.set('Authorization', `Bearer ${session.access_token}`)
      }
    }
    return request
  },
}

/**
 * Tenant middleware that adds X-Tenant-ID header to all requests.
 */
const tenantMiddleware: Middleware = {
  async onRequest({ request }) {
    const tenantId = tenantIdStorage.getTenantId()
    if (tenantId) {
      request.headers.set('X-Tenant-ID', tenantId)
    }
    return request
  },
}

/**
 * Create the typed API client with all middleware.
 */
function createApiClient() {
  const client = createClient<paths>({
    baseUrl: (clientEnv as Record<string, string>).apiUrl ?? '',
    cache: 'no-store',
  })

  // Register middleware
  client.use(authMiddleware)
  client.use(tenantMiddleware)

  return client
}

/**
 * The main API client instance.
 * Use this for all API calls.
 *
 * @example
 * ```ts
 * const { data, error } = await api.GET('/employees')
 * if (error) {
 *   console.error(error)
 *   return
 * }
 * console.log(data.items)
 * ```
 */
export const api = createApiClient()

/**
 * Type helper to extract response data type from an endpoint.
 */
export type ApiResponse<
  Path extends keyof paths,
  Method extends keyof paths[Path],
> = paths[Path][Method] extends { responses: { 200: { content: { 'application/json': infer R } } } }
  ? R
  : never

/**
 * Type helper to extract request body type from an endpoint.
 */
export type ApiRequestBody<
  Path extends keyof paths,
  Method extends keyof paths[Path],
> = paths[Path][Method] extends { requestBody: { content: { 'application/json': infer B } } }
  ? B
  : never
