/**
 * E2E Test Helpers
 *
 * Provides real-database tRPC callers for API-level E2E tests.
 * Uses the seed data from supabase/seed.sql as baseline.
 *
 * Requirements:
 *   - Local Supabase running (`pnpm db:start`)
 *   - Seed data applied (`pnpm db:reset`)
 */
import { createClient } from "@supabase/supabase-js"
import { prisma } from "@/lib/db"
import { createCaller } from "@/trpc/routers/_app"
import type { TRPCContext, ContextUser } from "@/trpc/init"
import type { Session } from "@supabase/supabase-js"

// --- Seed data constants (from supabase/seed.sql) ---

export const SEED = {
  TENANT_ID: "10000000-0000-0000-0000-000000000001",
  ADMIN_USER_ID: "00000000-0000-0000-0000-000000000001",
  REGULAR_USER_ID: "00000000-0000-0000-0000-000000000002",
  ADMIN_GROUP_ID: "20000000-0000-0000-0000-000000000001",
  USER_GROUP_ID: "20000000-0000-0000-0000-000000000002",
  ADMIN_EMAIL: "admin@dev.local",
  ADMIN_PASSWORD: "dev-password-admin",
  USER_EMAIL: "user@dev.local",
  USER_PASSWORD: "dev-password-user",
} as const

// --- Auth ---

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Sign in via Supabase and return the access token + user ID.
 */
export async function signIn(
  email: string,
  password: string
): Promise<{ token: string; userId: string }> {
  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (error || !data.session) {
    throw new Error(
      `Sign-in failed for ${email}: ${error?.message ?? "no session"}`
    )
  }
  return { token: data.session.access_token, userId: data.user.id }
}

// --- Context & Caller ---

/**
 * Resolve user from database with relations (mirrors createTRPCContext).
 */
async function resolveUser(userId: string): Promise<ContextUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userGroup: true,
      userTenants: { include: { tenant: true } },
    },
  })
  if (!user) throw new Error(`User ${userId} not found in database`)
  return user as ContextUser
}

/**
 * Create a tRPC caller with real auth + real database.
 */
export async function createAuthenticatedCaller(
  token: string,
  userId: string,
  tenantId: string
) {
  const user = await resolveUser(userId)
  const context: TRPCContext = {
    prisma,
    authToken: token,
    user,
    session: { access_token: token, user: { id: userId } } as Session,
    tenantId,
    ipAddress: "127.0.0.1",
    userAgent: "e2e-test",
    impersonation: null,
  }
  return createCaller(context)
}

/**
 * Create a caller authenticated as the seed admin user.
 */
export async function createAdminCaller() {
  const { token } = await signIn(SEED.ADMIN_EMAIL, SEED.ADMIN_PASSWORD)
  return createAuthenticatedCaller(token, SEED.ADMIN_USER_ID, SEED.TENANT_ID)
}

/**
 * Create a caller authenticated as the seed regular user.
 */
export async function createUserCaller() {
  const { token } = await signIn(SEED.USER_EMAIL, SEED.USER_PASSWORD)
  return createAuthenticatedCaller(
    token,
    SEED.REGULAR_USER_ID,
    SEED.TENANT_ID
  )
}

// Export prisma for direct DB access in cleanup/assertions
export { prisma }
