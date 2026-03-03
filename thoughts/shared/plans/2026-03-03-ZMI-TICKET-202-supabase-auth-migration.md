# Implementation Plan: ZMI-TICKET-202 — Supabase Auth Migration

Date: 2026-03-03
Status: Ready for Implementation
Dependencies: ZMI-TICKET-200 (Prisma Schema), ZMI-TICKET-201 (tRPC Server Setup)

---

## Overview

Migrate authentication from the custom JWT-based Go backend to Supabase Auth. This means:
- Login/logout/session-refresh handled by Supabase Auth (client-side SDK)
- A DB trigger syncs `auth.users` to `public.users` on signup
- tRPC `auth` router provides `me`, `permissions`, and `logout` endpoints
- The tRPC context factory resolves the authenticated user from the Supabase session
- The frontend AuthProvider is rewritten to use Supabase session state
- Protected routes use the new Supabase-backed auth flow

### What Gets Replaced

| Current (Go backend)                     | New (Supabase + tRPC)                        |
|------------------------------------------|----------------------------------------------|
| `POST /auth/login` (Go handler)          | `supabase.auth.signInWithPassword()` (client) |
| `POST /auth/refresh` (Go handler)        | Supabase automatic token refresh              |
| `GET /auth/me` (Go handler)              | `trpc.auth.me` query                          |
| `GET /auth/permissions` (Go handler)     | `trpc.auth.permissions` query                 |
| `POST /auth/logout` (Go handler)         | `trpc.auth.logout` mutation                   |
| `GET /auth/dev/login` (Go handler)       | Supabase test users (seeded via dashboard)     |
| JWT cookie + localStorage token          | Supabase session cookies (via `@supabase/ssr`) |
| `middleware/auth.go` (Go middleware)      | tRPC `protectedProcedure` with Supabase validation |

### What Stays Unchanged

- The Go backend still serves all REST API endpoints (employees, bookings, etc.)
- The Go auth middleware still protects Go REST endpoints (not migrated here)
- The `user_tenants` join table stays as-is
- The permission system (UserGroup.permissions JSONB) stays as-is
- The `GET /permissions` catalog endpoint stays on the Go backend

---

## Phase 1: Supabase Client Setup & Environment Configuration

**Goal:** Install Supabase dependencies, configure environment variables, and create reusable Supabase client utilities for both server-side and client-side usage.

**Dependencies:** None (first phase)

### 1.1 Install Dependencies

- [ ] Install `@supabase/supabase-js` and `@supabase/ssr` in `apps/web`

```bash
cd apps/web && pnpm add @supabase/supabase-js @supabase/ssr
```

### 1.2 Add Environment Variables

- [ ] **Modify:** `apps/web/.env.local`

Add:
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<local-service-role-key>
```

Note: The local keys come from `supabase start` output. For production, these are from the Supabase dashboard.

### 1.3 Extend Environment Config

- [ ] **Modify:** `apps/web/src/config/env.ts`

Add Supabase variables to `clientEnv` and `serverEnv`:

```typescript
// Server-side only
export const serverEnv = {
  apiUrl: process.env.API_URL ?? 'http://localhost:8080/api/v1',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
} as const

// Client-side accessible
export const clientEnv = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1',
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'Terp',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
} as const
```

Update `validateEnv()` to require Supabase vars.

### 1.4 Create Supabase Client Utilities

- [ ] **Create:** `apps/web/src/lib/supabase/client.ts` — Browser client

```typescript
// Browser-side Supabase client (used in Client Components)
import { createBrowserClient } from '@supabase/ssr'
import { clientEnv } from '@/config/env'

export function createClient() {
  return createBrowserClient(
    clientEnv.supabaseUrl,
    clientEnv.supabaseAnonKey
  )
}
```

- [ ] **Create:** `apps/web/src/lib/supabase/server.ts` — Server client (for Server Components, Route Handlers, Server Actions)

```typescript
// Server-side Supabase client (uses cookies for session)
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { clientEnv } from '@/config/env'

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(
    clientEnv.supabaseUrl,
    clientEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )
}
```

- [ ] **Create:** `apps/web/src/lib/supabase/middleware.ts` — Middleware client (for Next.js middleware session refresh)

```typescript
// Supabase client for Next.js middleware (refreshes session tokens)
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { clientEnv } from '@/config/env'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    clientEnv.supabaseUrl,
    clientEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh the session (this handles token refresh automatically)
  await supabase.auth.getUser()

  return supabaseResponse
}
```

- [ ] **Create:** `apps/web/src/lib/supabase/admin.ts` — Admin/service-role client (for server-side operations that bypass RLS)

```typescript
// Service-role client for admin operations (bypasses RLS)
import { createClient } from '@supabase/supabase-js'
import { clientEnv, serverEnv } from '@/config/env'

export function createAdminClient() {
  return createClient(
    clientEnv.supabaseUrl,
    serverEnv.supabaseServiceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
```

### 1.5 Extend Next.js Middleware for Session Refresh

- [ ] **Modify:** `apps/web/src/middleware.ts`

The current middleware only handles i18n routing. Extend it to also refresh the Supabase session on every request:

```typescript
import { type NextRequest } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'
import { updateSession } from '@/lib/supabase/middleware'

const intlMiddleware = createIntlMiddleware(routing)

export async function middleware(request: NextRequest) {
  // Refresh Supabase session first
  const supabaseResponse = await updateSession(request)

  // Then run i18n middleware
  const intlResponse = intlMiddleware(request)

  // Merge cookies from Supabase response into intl response
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    intlResponse.cookies.set(cookie.name, cookie.value)
  })

  return intlResponse
}

export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
}
```

### Verification (Phase 1)

- [ ] `pnpm typecheck` passes in `apps/web`
- [ ] `createClient()` can be called in a client component without errors
- [ ] `createServerSupabaseClient()` can be called in a Server Component / route handler
- [ ] The middleware runs without errors (check dev server logs)
- [ ] No import errors or missing module issues

---

## Phase 2: DB Trigger for `auth.users` to `public.users` Sync

**Goal:** When a user signs up or is created in Supabase Auth (`auth.users`), automatically create/update a corresponding row in `public.users`.

**Dependencies:** Phase 1 (Supabase must be configured)

### 2.1 Create Supabase SQL Migration

- [ ] **Create:** `supabase/migrations/<timestamp>_handle_new_user_trigger.sql`

This SQL runs in the Supabase dashboard (or via `supabase db push` / Supabase migrations). It does NOT go in `db/migrations/` since it operates on the `auth` schema which is managed by Supabase.

```sql
-- Trigger function: sync auth.users → public.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, username, display_name, role, is_active, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    'user',
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: fire on INSERT into auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### 2.2 Considerations for Existing Users

The trigger uses `ON CONFLICT (id) DO UPDATE`, so if we need to retroactively sync existing Supabase auth users, we can run a one-time backfill:

```sql
-- One-time backfill (run manually if needed)
INSERT INTO public.users (id, email, username, display_name, role, is_active, created_at, updated_at)
SELECT
  au.id,
  au.email,
  au.email,
  COALESCE(au.raw_user_meta_data->>'display_name', split_part(au.email, '@', 1)),
  'user',
  true,
  NOW(),
  NOW()
FROM auth.users au
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  updated_at = NOW();
```

### 2.3 Handle the `email` Unique Constraint

The `public.users` table has `email VARCHAR(255) UNIQUE NOT NULL`. But with multi-tenancy, there is also `@@unique([tenantId, email])`. The trigger inserts WITHOUT a `tenant_id`, so:

- The global `email` unique index could conflict if the same email exists with `tenant_id = NULL`.
- Since the trigger sets `tenant_id` as NULL, and the user gets assigned to a tenant later (via `user_tenants` or by updating `tenant_id`), this is fine as long as each email appears at most once with `tenant_id IS NULL`.
- The `ON CONFLICT (id)` clause handles re-inserts gracefully.

**Important:** The unique constraint is on `(id)` for the conflict clause, not `(email)`. If a user already exists with that email but a different ID, the insert will fail on the email unique constraint. This is intentional — it prevents duplicate accounts.

### Verification (Phase 2)

- [ ] Create a test user via Supabase dashboard or `supabase.auth.admin.createUser()`
- [ ] Verify a corresponding row appears in `public.users` with the same UUID
- [ ] Verify `display_name` is populated (from metadata or email prefix)
- [ ] Verify `role` defaults to `'user'`
- [ ] Verify `ON CONFLICT` path works: update the user's email in Supabase and check `public.users`

---

## Phase 3: Context Factory — Load User from Supabase Session

**Goal:** Update the tRPC context factory to validate the Supabase access token and resolve the authenticated user from the database.

**Dependencies:** Phase 1 (Supabase client), Phase 2 (user sync trigger)

### 3.1 Update TRPCContext Type

- [ ] **Modify:** `apps/web/src/server/trpc.ts`

Change the `TRPCContext` type to include the resolved user and session:

```typescript
import type { User as SupabaseUser, Session } from '@supabase/supabase-js'

// Prisma User type for the resolved DB user
import type { User as PrismaUser, UserGroup, UserTenant, Tenant } from '@/generated/prisma/client'

// The user object stored in context after resolution
export type ContextUser = PrismaUser & {
  userGroup: (UserGroup & { permissions: unknown }) | null
  userTenants: (UserTenant & { tenant: Tenant })[]
}

export type TRPCContext = {
  prisma: PrismaClient
  /** Raw Authorization header value (Bearer token). Null if not provided. */
  authToken: string | null
  /** Resolved database user. Null if not authenticated. */
  user: ContextUser | null
  /** Supabase session. Null if not authenticated. */
  session: Session | null
  /** Tenant ID from X-Tenant-ID header. Null if not provided. */
  tenantId: string | null
}
```

### 3.2 Update Context Factory

- [ ] **Modify:** `apps/web/src/server/trpc.ts` — `createTRPCContext` function

The context factory should:
1. Extract the access token from the Authorization header (or cookie via Supabase SSR).
2. Validate the token with Supabase (`supabase.auth.getUser(token)`).
3. If valid, look up the full user from `public.users` with relations.
4. Return the enriched context.

```typescript
import { createClient } from '@supabase/supabase-js'
import { clientEnv, serverEnv } from '@/config/env'

export async function createTRPCContext(
  opts: FetchCreateContextFnOptions
): Promise<TRPCContext> {
  const authHeader = opts.req.headers.get("authorization")
  const authToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null

  const tenantId = opts.req.headers.get("x-tenant-id")

  let user: ContextUser | null = null
  let session: Session | null = null

  if (authToken) {
    // Create a Supabase client with the service role to validate tokens
    const supabase = createClient(
      clientEnv.supabaseUrl,
      serverEnv.supabaseServiceRoleKey,
      {
        auth: { autoRefreshToken: false, persistSession: false },
      }
    )

    // Validate the access token
    const { data: { user: supabaseUser }, error } = await supabase.auth.getUser(authToken)

    if (supabaseUser && !error) {
      // Look up the full user from public.users with relations
      const dbUser = await prisma.user.findUnique({
        where: { id: supabaseUser.id },
        include: {
          userGroup: true,
          userTenants: {
            include: { tenant: true },
          },
        },
      })

      if (dbUser && dbUser.isActive && !dbUser.isLocked) {
        user = dbUser as ContextUser
        // Construct a minimal session object
        session = {
          access_token: authToken,
          user: supabaseUser,
        } as Session
      }
    }
  }

  return {
    prisma,
    authToken,
    user,
    session,
    tenantId,
  }
}
```

### 3.3 Update `protectedProcedure` Middleware

- [ ] **Modify:** `apps/web/src/server/trpc.ts` — `protectedProcedure`

Now that `user` is resolved in context, the protected procedure should check for a valid user (not just token presence):

```typescript
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user || !ctx.session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    })
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,       // narrowed to non-null
      session: ctx.session,  // narrowed to non-null
    },
  })
})
```

### 3.4 Update `tenantProcedure` Middleware

- [ ] **Modify:** `apps/web/src/server/trpc.ts` — `tenantProcedure`

No change needed to the logic (it already checks `ctx.tenantId`), but the types flow through from the updated `protectedProcedure`.

### 3.5 Update Server-Side Caller

- [ ] **Modify:** `apps/web/src/trpc/server.ts`

Update the synthetic context to match the new types:

```typescript
export async function getServerTrpc() {
  const { prisma } = await import("@/lib/db")
  const caller = createCaller({
    prisma,
    authToken: null,
    user: null,
    session: null,
    tenantId: null,
  })
  return caller
}
```

(No structural change needed here, just ensure types align.)

### 3.6 Update Test Mocks

- [ ] **Modify:** `apps/web/src/server/__tests__/procedures.test.ts`

Update `createMockContext` to reflect the new types:

```typescript
function createMockContext(overrides: Partial<TRPCContext> = {}): TRPCContext {
  return {
    prisma: {} as TRPCContext["prisma"],
    authToken: null,
    user: null,
    session: null,
    tenantId: null,
    ...overrides,
  }
}
```

Update the `protectedProcedure` tests: now they need a `user` and `session` object, not just `authToken`:

```typescript
it("allows access with valid user session", async () => {
  const caller = createCaller(
    createMockContext({
      authToken: "test-token",
      user: mockUser,      // a mock ContextUser object
      session: mockSession, // a mock Session object
    })
  )
  const result = await caller.protected()
  expect(result).toBe("protected")
})
```

### Verification (Phase 3)

- [ ] `pnpm typecheck` passes
- [ ] Unit tests pass with updated mocks
- [ ] Manual test: call `GET /api/trpc/health.check` — should work without auth
- [ ] Manual test: call a protected tRPC endpoint without auth — should return UNAUTHORIZED
- [ ] Manual test: obtain a Supabase access token, pass as `Authorization: Bearer <token>` — protected endpoint returns data

---

## Phase 4: tRPC Auth Router (`me`, `permissions`, `logout`)

**Goal:** Create the `auth` tRPC router that replaces the Go `GET /auth/me`, `GET /auth/permissions`, and `POST /auth/logout` endpoints.

**Dependencies:** Phase 3 (context factory resolves user)

### 4.1 Create Auth Router

- [ ] **Create:** `apps/web/src/server/routers/auth.ts`

```typescript
import { z } from "zod"
import { createTRPCRouter, protectedProcedure } from "../trpc"
import { TRPCError } from "@trpc/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const authRouter = createTRPCRouter({
  /**
   * auth.me — Returns the current authenticated user with permissions and tenants.
   *
   * Replaces: GET /auth/me + partial GET /auth/permissions
   */
  me: protectedProcedure
    .query(async ({ ctx }) => {
      const { user } = ctx

      // Build permissions list
      const permissions = resolvePermissions(user)

      // Build tenants list from userTenants relation
      const tenants = user.userTenants.map((ut) => ({
        id: ut.tenant.id,
        name: ut.tenant.name,
        slug: ut.tenant.slug,
      }))

      return {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          role: user.role,
          tenantId: user.tenantId,
          userGroupId: user.userGroupId,
          employeeId: user.employeeId,
          isActive: user.isActive,
        },
        permissions,
        tenants,
      }
    }),

  /**
   * auth.permissions — Returns only the permission keys for the current user.
   *
   * Replaces: GET /auth/permissions
   */
  permissions: protectedProcedure
    .query(async ({ ctx }) => {
      const { user } = ctx
      const permissions = resolvePermissions(user)
      const isAdmin = !!(user.userGroup?.isAdmin) || user.role === 'admin'

      return {
        permission_ids: permissions,
        is_admin: isAdmin,
      }
    }),

  /**
   * auth.logout — Signs out the current user from Supabase.
   *
   * Replaces: POST /auth/logout
   */
  logout: protectedProcedure
    .mutation(async ({ ctx }) => {
      // Use admin client to revoke the session server-side
      const adminClient = createAdminClient()
      const supabaseUserId = ctx.session.user.id

      // Sign out the user globally (invalidates all sessions)
      await adminClient.auth.admin.signOut(supabaseUserId)

      return { success: true }
    }),
})
```

### 4.2 Permission Resolution Helper

- [ ] **Create:** `apps/web/src/server/lib/permissions.ts`

This mirrors the Go permission resolution logic from `handler/auth.go` and `middleware/authorization.go`:

```typescript
import type { ContextUser } from '../trpc'

/**
 * Resolves the effective permission IDs for a user.
 *
 * Logic (mirrors Go backend):
 * 1. If user has no UserGroup or UserGroup is inactive: empty permissions
 * 2. If UserGroup.isAdmin is true: return ALL permission IDs (admin gets everything)
 * 3. Otherwise: return the permission IDs from UserGroup.permissions (JSONB array)
 * 4. Fallback: if user.role === 'admin' (no UserGroup): return ALL permission IDs
 */
export function resolvePermissions(user: ContextUser): string[] {
  const userGroup = user.userGroup

  // No UserGroup — fall back to role-based check
  if (!userGroup) {
    if (user.role === 'admin') {
      return getAllPermissionIds()
    }
    return []
  }

  // Inactive UserGroup — no permissions
  if (!userGroup.isActive) {
    return []
  }

  // Admin UserGroup — all permissions
  if (userGroup.isAdmin) {
    return getAllPermissionIds()
  }

  // Regular UserGroup — parse permissions from JSONB
  const permissions = userGroup.permissions as string[] | null
  return permissions ?? []
}

/**
 * Returns all permission IDs from the permission catalog.
 *
 * NOTE: The permission catalog is currently defined in the Go backend
 * (apps/api/internal/permissions/permissions.go). The frontend fetches
 * the catalog via GET /permissions. For the tRPC auth router, we need
 * to replicate this list or fetch it.
 *
 * Option A: Hardcode the permission IDs here (sync manually with Go).
 * Option B: Fetch from the Go backend at startup.
 * Option C: Query the catalog from the DB (if permissions are stored there).
 *
 * Since the Go backend's GET /permissions endpoint remains active and the
 * frontend already fetches the catalog separately, we use Option A for now
 * and just return the IDs from the UserGroup (which already stores UUIDs).
 * Admin users are identified by the is_admin flag, and the frontend
 * already handles "admin gets all" via the is_admin boolean.
 */
function getAllPermissionIds(): string[] {
  // For admin users, we return an empty array but set is_admin=true.
  // The frontend already handles this: if is_admin is true, all
  // permission checks pass regardless of the permission_ids array.
  // This matches the current Go behavior where the frontend checks
  // is_admin first, then falls back to checking permission_ids.
  return []
}
```

**Decision note:** The current Go endpoint returns `{ permission_ids: [...], is_admin: true }` for admins, with `permission_ids` containing ALL permission UUIDs. The frontend's `usePermissionChecker` checks `is_admin` first and short-circuits to `true`. For the tRPC migration, we can simplify by returning `is_admin: true` with an empty `permission_ids` array for admins, since the frontend already handles this case. For non-admin users, we return the UUIDs from `UserGroup.permissions`.

### 4.3 Register Auth Router

- [ ] **Modify:** `apps/web/src/server/root.ts`

```typescript
import { createTRPCRouter, createCallerFactory } from "./trpc"
import { healthRouter } from "./routers/health"
import { authRouter } from "./routers/auth"

export const appRouter = createTRPCRouter({
  health: healthRouter,
  auth: authRouter,
})
```

### 4.4 Zod Output Schemas

Define output schemas in the router for type safety and validation:

```typescript
const userOutputSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  role: z.string(),
  tenantId: z.string().uuid().nullable(),
  userGroupId: z.string().uuid().nullable(),
  employeeId: z.string().uuid().nullable(),
  isActive: z.boolean().nullable(),
})

const tenantOutputSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
})

const meOutputSchema = z.object({
  user: userOutputSchema,
  permissions: z.array(z.string()),
  tenants: z.array(tenantOutputSchema),
})

const permissionsOutputSchema = z.object({
  permission_ids: z.array(z.string()),
  is_admin: z.boolean(),
})
```

### Verification (Phase 4)

- [ ] `pnpm typecheck` passes
- [ ] Call `trpc.auth.me` with a valid Supabase token — returns user data with permissions and tenants
- [ ] Call `trpc.auth.permissions` — returns `{ permission_ids: [...], is_admin: boolean }`
- [ ] Call `trpc.auth.logout` — invalidates the session; subsequent requests with the same token return UNAUTHORIZED
- [ ] Call any auth endpoint without a token — returns UNAUTHORIZED

---

## Phase 5: Frontend Auth Provider & Login Page

**Goal:** Rewrite the frontend auth provider and login page to use Supabase Auth instead of the custom JWT flow.

**Dependencies:** Phase 1 (Supabase client), Phase 4 (tRPC auth router)

### 5.1 Rewrite Auth Provider

- [ ] **Modify:** `apps/web/src/providers/auth-provider.tsx`

Replace the current implementation that uses `useCurrentUser` (which calls `GET /auth/me` on the Go backend) with a Supabase-based implementation:

```typescript
'use client'

import { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useTRPC } from '@/trpc'
import { useQuery } from '@tanstack/react-query'
import type { Session, User as SupabaseUser } from '@supabase/supabase-js'

export interface AuthContextValue {
  /** Current authenticated user from DB (via tRPC auth.me) */
  user: AuthUser | null
  /** Supabase session */
  session: Session | null
  /** Whether auth state is being loaded */
  isLoading: boolean
  /** Whether user is authenticated */
  isAuthenticated: boolean
  /** Auth error if any */
  error: Error | null
  /** Logout the current user */
  logout: () => Promise<void>
  /** Refetch user data */
  refetch: () => Promise<void>
}

// User type from tRPC auth.me response
type AuthUser = {
  id: string
  email: string
  displayName: string
  avatarUrl: string | null
  role: string
  tenantId: string | null
  userGroupId: string | null
  employeeId: string | null
  isActive: boolean | null
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const supabase = useMemo(() => createClient(), [])
  const trpc = useTRPC()
  const [session, setSession] = useState<Session | null>(null)
  const [isSessionLoading, setIsSessionLoading] = useState(true)

  // Listen for Supabase auth state changes
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setIsSessionLoading(false)
    })

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        setIsSessionLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [supabase])

  // Fetch user data from tRPC when session is available
  const meQuery = useQuery(
    trpc.auth.me.queryOptions(undefined, {
      enabled: !!session,
      retry: false,
      staleTime: 5 * 60 * 1000,
    })
  )

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    queryClient.clear()
    setSession(null)
  }, [supabase, queryClient])

  const refetch = useCallback(async () => {
    await meQuery.refetch()
  }, [meQuery])

  const value = useMemo<AuthContextValue>(() => ({
    user: meQuery.data?.user ?? null,
    session,
    isLoading: isSessionLoading || (!!session && meQuery.isLoading),
    isAuthenticated: !!session && !!meQuery.data?.user,
    error: meQuery.error as Error | null,
    logout,
    refetch,
  }), [session, isSessionLoading, meQuery.data, meQuery.isLoading, meQuery.error, logout, refetch])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
```

### 5.2 Update Provider Hierarchy

- [ ] **Modify:** `apps/web/src/app/[locale]/layout.tsx`

The provider order stays the same: `TRPCReactProvider > AuthProvider`. No structural changes needed.

### 5.3 Update tRPC Provider — Remove localStorage Token Forwarding

- [ ] **Modify:** `apps/web/src/trpc/provider.tsx`

The tRPC client currently forwards the auth token from `authStorage.getToken()` (localStorage). With Supabase, the token comes from the Supabase session cookie. However, since the tRPC handler runs as a Next.js API route handler, the cookie is automatically included in the request.

But the tRPC client uses `httpBatchLink` which makes fetch requests to `/api/trpc`. The Supabase session cookie is already included automatically by the browser. The issue is that the tRPC context factory reads from the `Authorization` header, not cookies.

**Solution:** The tRPC client should read the access token from the Supabase client and send it as the `Authorization: Bearer` header:

```typescript
const [trpcClient] = useState(() =>
  createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${getBaseUrl()}/api/trpc`,
        async headers() {
          const headers: Record<string, string> = {}

          // Get the current Supabase session token
          const supabase = createClient()
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.access_token) {
            headers["authorization"] = `Bearer ${session.access_token}`
          }

          // Forward tenant ID
          const tenantId = tenantIdStorage.getTenantId()
          if (tenantId) {
            headers["x-tenant-id"] = tenantId
          }

          return headers
        },
      }),
    ],
  })
)
```

**Important:** Remove the dependency on `authStorage.getToken()` (localStorage). The Supabase session is the single source of truth for auth tokens.

### 5.4 Rewrite Login Page

- [ ] **Modify:** `apps/web/src/app/[locale]/(auth)/login/page.tsx`

Replace the current login flow (which calls `POST /auth/login` on the Go backend) with Supabase Auth:

```typescript
'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/providers/auth-provider'
import { createClient } from '@/lib/supabase/client'

function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const t = useTranslations('login')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const returnUrl = searchParams.get('returnUrl') ?? '/dashboard'

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !isAuthLoading) {
      router.push(returnUrl)
    }
  }, [isAuthenticated, isAuthLoading, router, returnUrl])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        setError(t('loginFailed'))
        return
      }

      // The onAuthStateChange listener in AuthProvider will pick up the session.
      // Redirect will happen via the useEffect above once isAuthenticated is true.
      router.push(returnUrl)
    } catch {
      setError(t('loginFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  // Dev login: Supabase test users (created via Supabase dashboard or seed script)
  const handleDevLogin = async (role: 'admin' | 'user') => {
    setIsLoading(true)
    setError(null)

    const devCredentials = {
      admin: { email: 'admin@dev.local', password: 'dev-password-admin' },
      user: { email: 'user@dev.local', password: 'dev-password-user' },
    }

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword(
        devCredentials[role]
      )

      if (signInError) {
        setError(t('loginFailed'))
        return
      }

      router.push(returnUrl)
    } catch {
      setError(t('loginFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  // ... rest of the JSX stays mostly the same, just using handleLogin and handleDevLogin
}
```

### 5.5 Remove/Update Legacy Auth Hooks

- [ ] **Modify:** `apps/web/src/hooks/use-auth.ts`

Remove or deprecate the hooks that call Go backend auth endpoints:
- `useCurrentUser()` — replaced by `trpc.auth.me` in AuthProvider
- `useLogin()` — replaced by `supabase.auth.signInWithPassword()` in login page
- `useDevLogin()` — replaced by `supabase.auth.signInWithPassword()` with dev credentials
- `useDevUsers()` — no longer needed (dev users are in Supabase)
- `useLogout()` — replaced by `supabase.auth.signOut()` in AuthProvider

Keep the file but mark everything as deprecated, or remove entirely if no other code references them. The `User` type export may still be used — check consumers.

### 5.6 Remove localStorage Token Management

- [ ] **Modify:** `apps/web/src/lib/api/client.ts`

The `authStorage` (localStorage token management) is no longer needed for auth flow. However, the Go backend's openapi-fetch client still needs the `Authorization` header for Go API calls.

**Option A:** Keep `authStorage` but populate it from the Supabase session token (so Go API calls still work during the transition).
**Option B:** Modify the openapi-fetch middleware to read from the Supabase client directly.

Recommended: **Option B** — cleaner, single source of truth:

```typescript
const authMiddleware: Middleware = {
  async onRequest({ request }) {
    // Read token from Supabase session (browser client)
    if (typeof window !== 'undefined') {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        request.headers.set('Authorization', `Bearer ${session.access_token}`)
      }
    }
    return request
  },
}
```

**Note:** The Go backend auth middleware (`middleware/auth.go`) validates JWT tokens using `JWTManager.Validate()` with the Go `JWT_SECRET`. Supabase access tokens are JWTs signed with the Supabase JWT secret. The Go backend will NOT be able to validate Supabase tokens unless we update it to use the Supabase JWT secret. This is a critical consideration.

**Resolution:** Since this ticket focuses on the frontend + tRPC migration, the Go backend endpoints that require auth will need a separate update (or we configure the Go backend's `JWT_SECRET` to match the Supabase JWT secret). This is out of scope for this ticket but should be noted.

### 5.7 Tenant ID Storage

The `tenantIdStorage` (localStorage for `tenant_id`) remains unchanged. The tenant ID is not part of the Supabase session — it is selected by the user after login and stored in localStorage. The tenant selection flow (TenantProvider, TenantGuard) stays the same.

### Verification (Phase 5)

- [ ] Login page renders correctly
- [ ] Email/password login via Supabase works — user is authenticated, redirected to dashboard
- [ ] Dev login buttons work with pre-seeded Supabase test users
- [ ] AuthProvider correctly reflects `isAuthenticated` after login
- [ ] Logout clears session, user is redirected to login
- [ ] Session persists across page refreshes (Supabase cookie)
- [ ] Token refresh happens automatically (via middleware session refresh)
- [ ] No more localStorage `auth_token` usage for auth (tenant_id in localStorage is fine)

---

## Phase 6: Frontend Hook Migration (`use-current-permissions` to tRPC)

**Goal:** Migrate the permission hooks from the Go backend API calls to tRPC queries.

**Dependencies:** Phase 4 (tRPC auth router), Phase 5 (auth provider rewrite)

### 6.1 Migrate `use-current-permissions.ts`

- [ ] **Modify:** `apps/web/src/hooks/api/use-current-permissions.ts`

Replace the openapi-fetch call with a tRPC query:

```typescript
import { useTRPC } from '@/trpc'
import { useQuery } from '@tanstack/react-query'

export function useCurrentPermissions(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.auth.permissions.queryOptions(undefined, {
      enabled,
      staleTime: 5 * 60 * 1000,
    })
  )
}
```

### 6.2 Update `use-has-permission.ts`

- [ ] **Modify:** `apps/web/src/hooks/use-has-permission.ts`

The `usePermissionChecker` hook currently reads from two data sources:
1. `usePermissions()` — fetches the permission catalog from `GET /permissions` (Go backend)
2. `useCurrentPermissions()` — fetches current user's permissions from `GET /auth/permissions` (Go backend, now migrated to tRPC)

After migration, `useCurrentPermissions()` returns tRPC data with shape `{ permission_ids: string[], is_admin: boolean }`. The permission catalog still comes from the Go backend.

Update the hook to handle the new response shape:

```typescript
const isAdmin = useMemo(() => {
  if (!isAuthenticated || !currentPermissionsQuery.data) {
    return false
  }
  return currentPermissionsQuery.data.is_admin === true
}, [isAuthenticated, currentPermissionsQuery.data])

const allowedSet = useMemo(() => {
  return new Set(currentPermissionsQuery.data?.permission_ids ?? [])
}, [currentPermissionsQuery.data])
```

Note the difference: the Go endpoint returned `{ data: { permission_ids, is_admin } }` (wrapped in a `data` envelope), while the tRPC endpoint returns `{ permission_ids, is_admin }` directly.

### 6.3 Update `use-has-role.ts`

- [ ] **Modify:** `apps/web/src/hooks/use-has-role.ts`

The `User` type changes from the OpenAPI-generated type to the tRPC auth.me response type. Update the type import:

```typescript
// Before: User type from OpenAPI schema
// import type { components } from '@/lib/api/types'
// export type UserRole = components['schemas']['User']['role']

// After: role is a string from tRPC auth.me
export type UserRole = 'user' | 'admin'
```

### 6.4 Update User Menu

- [ ] **Modify:** `apps/web/src/components/auth/user-menu.tsx`

The user menu uses `useAuth()` which now returns the tRPC-based user. Field names may differ:
- Before: `user.display_name` (snake_case from OpenAPI)
- After: `user.displayName` (camelCase from Prisma/tRPC)

Update field references accordingly.

### Verification (Phase 6)

- [ ] `useCurrentPermissions()` returns data from tRPC (not Go API)
- [ ] `useHasPermission(['employees.view'])` works correctly for regular users
- [ ] Admin users get all permissions (via `is_admin` flag)
- [ ] `useHasRole(['admin'])` works correctly
- [ ] User menu displays correct name and role
- [ ] `pnpm typecheck` passes

---

## Phase 7: Protected Routes

**Goal:** Ensure protected routes work correctly with the new Supabase-based auth flow.

**Dependencies:** Phase 5 (auth provider rewrite)

### 7.1 Review Protected Route Component

- [ ] **Verify:** `apps/web/src/components/auth/protected-route.tsx`

The ProtectedRoute component uses `useAuth()` which now returns Supabase-backed auth state. No code changes should be needed — the interface is the same (`isAuthenticated`, `isLoading`).

Verify the redirect behavior:
- Not authenticated -> redirect to `/login?returnUrl=<current>`
- Loading -> show loading fallback
- Authenticated -> render children

### 7.2 Verify Dashboard Layout

- [ ] **Verify:** `apps/web/src/app/[locale]/(dashboard)/layout.tsx`

The layout uses `ProtectedRoute > TenantProvider > TenantGuard > AppLayout`. No changes expected.

### 7.3 Create Supabase Dev Seed Script

- [ ] **Create:** `apps/web/scripts/seed-supabase-dev-users.ts` (or `.sql`)

Since DevLogin is removed, we need a way to create test users in Supabase for development:

```sql
-- Run in Supabase SQL editor or via supabase/seed.sql
-- Create admin dev user
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at,
  raw_user_meta_data, created_at, updated_at,
  instance_id, aud, role
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'admin@dev.local',
  crypt('dev-password-admin', gen_salt('bf')),
  NOW(),
  '{"display_name": "Dev Admin"}'::jsonb,
  NOW(), NOW(),
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
) ON CONFLICT (id) DO NOTHING;

-- Create regular dev user
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at,
  raw_user_meta_data, created_at, updated_at,
  instance_id, aud, role
) VALUES (
  '00000000-0000-0000-0000-000000000002',
  'user@dev.local',
  crypt('dev-password-user', gen_salt('bf')),
  NOW(),
  '{"display_name": "Dev User"}'::jsonb,
  NOW(), NOW(),
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
) ON CONFLICT (id) DO NOTHING;
```

These use the SAME UUIDs as the current Go dev users (`00000000-...01` and `00000000-...02`), so existing `public.users` rows, `user_tenants` entries, and all related data remain linked.

### 7.4 Update Docker/Dev Environment

- [ ] **Modify:** `docker/docker-compose.yml` (or create `docker/docker-compose.supabase.yml`)

Add Supabase local development services (or document using `supabase start` CLI).

The Supabase CLI (`supabase start`) is recommended for local development as it handles all Supabase services (Auth, DB, etc.) with a single command.

Document in README or CLAUDE.md:
```bash
# Start Supabase local development
npx supabase start

# This outputs the local URLs and keys:
# API URL: http://localhost:54321
# anon key: eyJh...
# service_role key: eyJh...

# Use these in apps/web/.env.local
```

### Verification (Phase 7)

- [ ] Unauthenticated user visiting `/dashboard` is redirected to `/login?returnUrl=/dashboard`
- [ ] After login, user is redirected back to the `returnUrl`
- [ ] Session persists across page refreshes
- [ ] Closing and reopening browser tab maintains session (cookie-based)
- [ ] Logout clears session and redirects to login
- [ ] Dev login buttons work with seeded Supabase users

---

## Cross-Cutting Concerns

### Go Backend Compatibility

The Go backend's auth middleware validates JWTs using `JWTManager` with the app's `JWT_SECRET`. After migrating to Supabase, the frontend will send Supabase access tokens. These are JWTs signed with the Supabase JWT secret.

**For this ticket:** The Go backend REST API endpoints remain unchanged. The frontend will still call Go APIs for non-auth operations (employees, bookings, etc.). The Go auth middleware needs to validate the Supabase JWT.

**Options:**
1. **Set Go `JWT_SECRET` to match Supabase JWT secret** — simplest approach. The Supabase JWT secret is available in the Supabase dashboard. Configure the Go backend to use the same secret.
2. **Update Go middleware to validate Supabase JWTs** — requires Go code changes (different issuer, audience, etc.).
3. **Proxy Go API calls through Next.js** — all Go API calls go through a Next.js API route that handles auth.

**Recommendation:** Option 1 is the fastest path. Set the Go backend's `JWT_SECRET` environment variable to the Supabase project's JWT secret. The Supabase JWT structure includes `sub` (user ID), `email`, and `role` fields, which can be mapped to the existing Go `Claims` struct.

**Action item (not in this ticket):** Update Go auth middleware to parse Supabase JWT claims structure (the claim names differ slightly from the current custom JWT).

### Environment Variables Summary

| Variable | Where | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `apps/web/.env.local` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `apps/web/.env.local` | Supabase anonymous key (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | `apps/web/.env.local` | Supabase service role key (server only) |
| `JWT_SECRET` | Go backend env | Set to Supabase JWT secret for compatibility |

### Migration Checklist for Existing Data

- [ ] Existing `public.users` rows remain untouched (the trigger only fires on new `auth.users` inserts)
- [ ] Existing users need to be created in Supabase Auth (one-time migration script)
- [ ] User IDs must match between `auth.users` and `public.users` (use the same UUIDs)
- [ ] `user_tenants` entries remain linked via user UUIDs
- [ ] `user_groups` assignments remain linked via `user_group_id`

---

## Acceptance Criteria Mapping

| Acceptance Criteria | Phase | Implementation |
|---|---|---|
| Login over Supabase Auth works (Email/Password) | Phase 5 | `supabase.auth.signInWithPassword()` in login page |
| Session is automatically refreshed | Phase 1 | `updateSession()` in Next.js middleware |
| DB trigger syncs `auth.users` to `public.users` | Phase 2 | PostgreSQL trigger function |
| `auth.me` returns user with permissions and tenants | Phase 4 | tRPC `auth.me` query |
| `auth.logout` ends the session | Phase 4 | tRPC `auth.logout` mutation |
| Frontend auth provider manages session state | Phase 5 | Rewritten `AuthProvider` with Supabase |
| Protected routes redirect to login when not authenticated | Phase 7 | Existing `ProtectedRoute` (no changes needed) |
| Existing user data is not lost | Phase 2 | Trigger uses `ON CONFLICT`, migration script preserves IDs |

---

## Test Plan

### Unit Tests
- [ ] tRPC `auth.me` returns user data when authenticated
- [ ] tRPC `auth.me` throws UNAUTHORIZED when not authenticated
- [ ] tRPC `auth.permissions` returns correct permissions for regular users
- [ ] tRPC `auth.permissions` returns `is_admin: true` for admin users
- [ ] tRPC `auth.logout` invalidates the session
- [ ] `resolvePermissions()` returns empty array for inactive UserGroup
- [ ] `resolvePermissions()` returns all permissions for admin UserGroup
- [ ] `resolvePermissions()` returns specific permissions for regular UserGroup

### Integration Tests
- [ ] Login -> auth.me -> logout flow end-to-end
- [ ] Token refresh after expiry (Supabase handles this automatically)
- [ ] Unauthenticated requests to protected endpoints return UNAUTHORIZED
- [ ] DB trigger creates `public.users` row on Supabase signup

### E2E Tests
- [ ] Login page -> enter credentials -> redirected to dashboard
- [ ] Dashboard shows correct user name and role
- [ ] Logout button -> redirected to login
- [ ] Visiting protected page without session -> redirected to login with returnUrl
- [ ] After login, returnUrl redirect works correctly

---

## File Change Summary

### New Files
| File | Phase | Description |
|---|---|---|
| `apps/web/src/lib/supabase/client.ts` | 1 | Browser Supabase client |
| `apps/web/src/lib/supabase/server.ts` | 1 | Server Supabase client (cookie-based) |
| `apps/web/src/lib/supabase/middleware.ts` | 1 | Middleware Supabase client (session refresh) |
| `apps/web/src/lib/supabase/admin.ts` | 1 | Service-role Supabase client |
| `apps/web/src/server/routers/auth.ts` | 4 | tRPC auth router (me, permissions, logout) |
| `apps/web/src/server/lib/permissions.ts` | 4 | Permission resolution helper |
| `supabase/migrations/*_handle_new_user_trigger.sql` | 2 | DB trigger SQL |
| `apps/web/scripts/seed-supabase-dev-users.sql` | 7 | Dev user seed script |

### Modified Files
| File | Phase | Changes |
|---|---|---|
| `apps/web/package.json` | 1 | Add `@supabase/supabase-js`, `@supabase/ssr` |
| `apps/web/.env.local` | 1 | Add Supabase env vars |
| `apps/web/src/config/env.ts` | 1 | Add Supabase config |
| `apps/web/src/middleware.ts` | 1 | Add Supabase session refresh |
| `apps/web/src/server/trpc.ts` | 3 | Update context type, factory, protectedProcedure |
| `apps/web/src/server/root.ts` | 4 | Register auth router |
| `apps/web/src/server/__tests__/procedures.test.ts` | 3 | Update mock context |
| `apps/web/src/trpc/server.ts` | 3 | Update synthetic context types |
| `apps/web/src/providers/auth-provider.tsx` | 5 | Rewrite for Supabase |
| `apps/web/src/trpc/provider.tsx` | 5 | Use Supabase token for tRPC requests |
| `apps/web/src/app/[locale]/(auth)/login/page.tsx` | 5 | Rewrite for Supabase login |
| `apps/web/src/hooks/use-auth.ts` | 5 | Deprecate/remove Go-based auth hooks |
| `apps/web/src/lib/api/client.ts` | 5 | Update auth middleware to use Supabase token |
| `apps/web/src/hooks/api/use-current-permissions.ts` | 6 | Use tRPC instead of openapi-fetch |
| `apps/web/src/hooks/use-has-permission.ts` | 6 | Update for new response shape |
| `apps/web/src/hooks/use-has-role.ts` | 6 | Update User type |
| `apps/web/src/components/auth/user-menu.tsx` | 6 | Update field names (snake_case -> camelCase) |

### Files NOT Modified (Verified Unchanged)
| File | Reason |
|---|---|
| `apps/web/src/components/auth/protected-route.tsx` | Uses `useAuth()` — interface unchanged |
| `apps/web/src/app/[locale]/(dashboard)/layout.tsx` | Uses `ProtectedRoute` — no changes needed |
| `apps/web/src/app/[locale]/layout.tsx` | Provider hierarchy unchanged |
| `apps/web/prisma/schema.prisma` | Read-only, no schema changes |
| `apps/web/src/hooks/api/use-permissions.ts` | Still fetches catalog from Go backend |
| Go backend files | Out of scope for this ticket |

---

## Implementation Order

```
Phase 1: Supabase Client Setup
    |
    v
Phase 2: DB Trigger ──────────────┐
    |                              |
    v                              |
Phase 3: Context Factory  <────────┘
    |
    v
Phase 4: tRPC Auth Router
    |
    v
Phase 5: Frontend Auth Provider & Login
    |
    v
Phase 6: Hook Migration
    |
    v
Phase 7: Protected Routes & Dev Seed
```

Phases 1 and 2 can be done in parallel. Phase 3 depends on both. Everything else is sequential.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Go backend cannot validate Supabase JWTs | Go REST API calls fail | Set Go `JWT_SECRET` to Supabase JWT secret |
| Existing user UUIDs don't match Supabase IDs | Data integrity issues | Migration script creates Supabase users with matching UUIDs |
| `email` unique constraint conflicts in trigger | Trigger fails on signup | `ON CONFLICT (id) DO UPDATE` handles gracefully |
| Supabase session cookies conflict with existing cookies | Auth issues | Supabase uses its own cookie names (`sb-*`) — no conflict |
| Frontend breaks during migration | Users cannot access app | Phase the rollout; keep Go auth endpoints running in parallel |
