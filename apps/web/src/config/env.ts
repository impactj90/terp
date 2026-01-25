/**
 * Environment configuration with type safety.
 * Server-side variables (without NEXT_PUBLIC_) are only available in Server Components.
 * Client-side variables (with NEXT_PUBLIC_) are available everywhere.
 */

// Server-side only
export const serverEnv = {
  apiUrl: process.env.API_URL ?? 'http://localhost:8080/api/v1',
} as const

// Client-side accessible
export const clientEnv = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1',
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'Terp',
} as const

/**
 * Validates that required environment variables are set.
 * Call this in server startup or build.
 */
export function validateEnv() {
  const required = ['NEXT_PUBLIC_API_URL']
  const missing = required.filter((key) => !process.env[key])

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}
