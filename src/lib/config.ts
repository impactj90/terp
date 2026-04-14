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
  /**
   * Dev-only kill switch for the platform-operator → tenant impersonation
   * branch in src/trpc/init.ts. The primary safety is that the
   * platform-session cookie is scoped to the platform host in prod and
   * therefore never delivered to tenant /api/trpc/* requests. This flag is
   * defense-in-depth: even if someone sets PLATFORM_COOKIE_DOMAIN=.terp.de
   * (parent-domain) to prepare for cross-domain UX, the impersonation
   * branch remains dead code until this flag is explicitly flipped.
   * Default: false. Set PLATFORM_IMPERSONATION_ENABLED=true in .env.local.
   *
   * Implemented as a getter so `vi.stubEnv` works in tests — the rest of
   * `serverEnv` is evaluated once at module load, but this value must
   * re-read `process.env` on every access.
   */
  get platformImpersonationEnabled() {
    return process.env.PLATFORM_IMPERSONATION_ENABLED === 'true'
  },
  /**
   * Phase 10a: Operator tenant for platform subscription billing. When set,
   * platform module bookings also create BillingRecurringInvoice rows inside
   * this tenant. Leave empty to disable subscription features entirely.
   *
   * Implemented as a getter so `vi.stubEnv` works in tests — see
   * platformImpersonationEnabled for the same rationale.
   */
  get platformOperatorTenantId() {
    return process.env.PLATFORM_OPERATOR_TENANT_ID ?? ''
  },
  /**
   * Phase 3c: Temporärer Konsistenz-Check zwischen dem gespeicherten
   * `inbound_invoices.payment_status` und dem aus den PaymentRunItems
   * abgeleiteten Wert. Auf staging zuerst, danach prod. Sobald 4 Wochen
   * ohne `consistency_warning`-Audit-Entries vorbeigegangen sind, wird
   * dieser Block + die zugehörige Service-/Repo-/Plan-Logik entfernt.
   * Plan: thoughts/shared/plans/2026-04-14-camt-preflight-items.md
   * Phase 3c. TODO(2026-05-26).
   *
   * Getter, weil der Service direkt aus `process.env` liest, falls der
   * Check zur Laufzeit Noise produziert und ohne Restart deaktiviert
   * werden soll.
   */
  get inboundInvoicePaymentConsistencyCheck() {
    return process.env.INBOUND_INVOICE_PAYMENT_CONSISTENCY_CHECK === 'true'
  },
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
