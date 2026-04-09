/**
 * Environment configuration with type safety.
 * Server-side variables (without NEXT_PUBLIC_) are only available in Server Components.
 * Client-side variables (with NEXT_PUBLIC_) are available everywhere.
 */

// Server-side only
export const serverEnv = {
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  // Internal Supabase URL for server-side requests (e.g., inside Docker).
  // Falls back to NEXT_PUBLIC_SUPABASE_URL when not set.
  supabaseUrl: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  // AI Assistant (Anthropic)
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  // Field-level encryption
  fieldEncryptionKeyV1: process.env.FIELD_ENCRYPTION_KEY_V1 ?? '',
  fieldEncryptionKeyCurrentVersion: process.env.FIELD_ENCRYPTION_KEY_CURRENT_VERSION ?? '1',
  // Platform admin auth (separate domain — see plan 2026-04-09-platform-admin-system.md)
  platformJwtSecret: process.env.PLATFORM_JWT_SECRET ?? '',
  /**
   * Optional. If set, middleware treats this host as the platform subdomain
   * (prod: e.g. "admin.terp.de") and scopes the platform-session cookie to
   * that domain. Leave empty in dev — the platform is then served at
   * /platform/* on the same host as the tenant app with a host-only cookie.
   */
  platformCookieDomain: process.env.PLATFORM_COOKIE_DOMAIN ?? '',
} as const

// Client-side accessible
export const clientEnv = {
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'Terp',
  env: (process.env.NEXT_PUBLIC_ENV ?? 'development') as 'development' | 'production',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  // Base URL the recovery/welcome email links point back to. Matches
  // supabase/config.toml [auth] site_url for the same port. Set
  // NEXT_PUBLIC_APP_URL in .env.local / deployment env for non-defaults.
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://127.0.0.1:3001',
} as const

export const isDev = clientEnv.env === 'development'
export const isProd = clientEnv.env === 'production'

/**
 * Validates that required environment variables are set.
 * Call this in server startup or build.
 */
export function validateEnv() {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'CRON_SECRET',
    'INTERNAL_API_KEY',
    'ANTHROPIC_API_KEY',
    'FIELD_ENCRYPTION_KEY_V1',
    'PLATFORM_JWT_SECRET',
  ]
  const missing = required.filter((key) => !process.env[key])

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}
