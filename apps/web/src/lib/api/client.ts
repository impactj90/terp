import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from './types'
import { clientEnv } from '@/config/env'

/**
 * Auth token storage interface.
 * Allows different storage implementations (localStorage, cookies, etc.)
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

const tokenStorage = createLocalStorage('auth_token')
const tenantStorage = createLocalStorage('tenant_id')

export const authStorage: AuthTokenStorage = {
  getToken: tokenStorage.get,
  setToken: tokenStorage.set,
  clearToken: tokenStorage.clear,
}

export const tenantIdStorage: TenantStorage = {
  getTenantId: tenantStorage.get,
  setTenantId: tenantStorage.set,
  clearTenantId: tenantStorage.clear,
}

/**
 * Auth middleware that adds Authorization header to all requests.
 */
const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = authStorage.getToken()
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`)
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
    baseUrl: clientEnv.apiUrl,
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
