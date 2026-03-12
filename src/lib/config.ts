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
} as const

// Client-side accessible
export const clientEnv = {
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'Terp',
  env: (process.env.NEXT_PUBLIC_ENV ?? 'development') as 'development' | 'production',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
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
  ]
  const missing = required.filter((key) => !process.env[key])

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}
