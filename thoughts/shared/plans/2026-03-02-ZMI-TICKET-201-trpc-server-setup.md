# ZMI-TICKET-201: tRPC Server Setup — Implementation Plan

## Overview

Set up a tRPC v11 server in the Next.js app (`apps/web/`) with a context factory (PrismaClient, auth user, session, tenantId), three procedure types (`publicProcedure`, `protectedProcedure`, `tenantProcedure`), an App Router handler, a React Query-integrated tRPC client, and a health check procedure for end-to-end verification. This establishes the foundation for all tRPC routers that follow (ZMI-TICKET-210+).

## Current State Analysis

**What exists:**
- Next.js 16 App Router app at `apps/web/` with `[locale]` segment (next-intl)
- Prisma 7 with PrismaPg adapter, singleton at `src/lib/db/prisma.ts` (ZMI-TICKET-200)
- TanStack React Query v5 with singleton QueryClient at `src/providers/query-provider.tsx`
- Client-side JWT auth via localStorage, AuthProvider at `src/providers/auth-provider.tsx`
- openapi-fetch typed HTTP client at `src/lib/api/client.ts` (55+ domain hooks)
- Tenant ID stored in localStorage, sent as `X-Tenant-ID` header via `tenantIdStorage`
- Next.js middleware already excludes `trpc` and `api` paths from i18n processing (`src/middleware.ts:7`)
- pnpm package manager, TypeScript strict mode, path alias `@/*` -> `./src/*`
- `next.config.ts`: standalone output, next-intl plugin, no `serverExternalPackages`

**What does NOT exist:**
- No `@trpc/*` packages installed
- No `zod` or `superjson` installed
- No `src/server/` directory
- No `src/trpc/` directory
- No `src/app/api/` directory (no API route handlers at all)
- No server-side data fetching in any page (all pages are client components using React Query)

### Key Discoveries:
- `apps/web/src/middleware.ts:7` — `trpc` already excluded from i18n matcher: `'/((?!api|trpc|_next|_vercel|.*\\..*).*)'`
- `apps/web/src/providers/query-provider.tsx:18-53` — Existing `QueryProvider` uses browser singleton pattern with `makeQueryClient()` and `getQueryClient()`
- `apps/web/src/lib/db/prisma.ts:34` — PrismaClient exported as `prisma` via `@/lib/db`
- `apps/web/src/lib/api/client.ts:43-56` — Auth token and tenant ID both stored in localStorage with SSR-safe getters
- `apps/web/src/app/[locale]/layout.tsx:44-53` — Provider hierarchy: `NextIntlClientProvider > ThemeProvider > QueryProvider > AuthProvider`
- `apps/web/package.json` — `@tanstack/react-query` v5.90.20 already installed (compatible with tRPC v11)
- Auth is entirely client-side JWT-based. No server-side sessions exist yet (Supabase Auth comes in ZMI-TICKET-202)

## Desired End State

1. tRPC v11 server initialized with context factory providing `{ prisma, user, session, tenantId }`
2. Three procedure types exported: `publicProcedure`, `protectedProcedure`, `tenantProcedure`
3. App Router handler at `src/app/api/trpc/[trpc]/route.ts` responding to GET and POST
4. tRPC React client with `TRPCProvider` and `useTRPC` hook integrated into the app
5. Health check procedure (`health.check`) working end-to-end from browser to database
6. Zod validation errors correctly surfaced as tRPC errors
7. TypeScript types fully inferred end-to-end (input -> server -> output -> client)
8. Existing openapi-fetch hooks continue to work alongside tRPC (coexistence during migration)
9. Optional server-side caller at `src/trpc/server.ts` ready for future RSC usage

### Verification:
- `curl http://localhost:3001/api/trpc/health.check` returns `{"result":{"data":{"status":"ok","timestamp":"...","database":"connected"}}}`
- `pnpm typecheck` passes with zero errors
- `pnpm lint` passes
- Health check procedure callable from a client component via `useTRPC` + `useQuery`
- `protectedProcedure` returns UNAUTHORIZED when no auth token is present
- `tenantProcedure` returns FORBIDDEN when no tenant ID header is sent

## What We're NOT Doing

- Implementing domain routers (ZMI-TICKET-210+)
- Implementing Supabase Auth integration (ZMI-TICKET-202) — context factory uses placeholder stubs for `user` and `session` that extract from request headers
- Implementing permission middleware (`requirePermission`, etc.) — that is ZMI-TICKET-203
- Replacing existing openapi-fetch hooks — they remain active during migration
- Adding SSR prefetching to existing pages — that is optional future work
- Modifying the existing `QueryProvider` — tRPC creates its own QueryClient wrapper
- Adding `superjson` transformer — not needed for initial setup; can be added later if Date serialization becomes an issue

## Implementation Approach

Work in 5 phases: install dependencies, create tRPC server infrastructure, create App Router handler, create tRPC client for frontend, and implement health check procedure with end-to-end verification. Each phase is independently verifiable.

**React Query coexistence strategy:** The tRPC `TRPCProvider` will wrap its own `QueryClientProvider` internally. We will nest the `TRPCProvider` _inside_ the existing provider hierarchy, replacing the current `QueryProvider`. The tRPC provider internally creates a `QueryClientProvider`, so both the existing `useApiQuery`/`useApiMutation` hooks (which call `useQueryClient()`) and the new tRPC hooks will share the same `QueryClient` instance. This is the cleanest approach: a single `QueryClient` serves both old openapi-fetch hooks and new tRPC hooks.

**Auth context strategy (pre-Supabase):** Since ZMI-TICKET-202 has not been implemented yet, the tRPC context factory will extract the JWT token from the `Authorization` header and the tenant ID from the `X-Tenant-ID` header of the incoming request. It will NOT validate the token or resolve a user from the database — that is ZMI-TICKET-202's responsibility. For now, `user` and `session` will be `null`. The `protectedProcedure` middleware will check for the presence of the Authorization header (as a bearer token) and throw UNAUTHORIZED if missing. The `tenantProcedure` will additionally check for `X-Tenant-ID`. This gives us the procedure type scaffolding that ZMI-TICKET-202 will later enhance with real Supabase session resolution.

---

## Phase 1: Install Dependencies

### Overview
Install all tRPC v11 packages, zod for input validation, and the `server-only` / `client-only` boundary packages.

### Changes Required:

#### 1. Install packages
**Command:**
```bash
cd apps/web && pnpm add @trpc/server@^11 @trpc/client@^11 @trpc/tanstack-react-query@^11 zod server-only client-only
```

Packages added:
- `@trpc/server` — tRPC server core (context, router, procedures, adapters)
- `@trpc/client` — tRPC client (httpBatchLink, createTRPCClient)
- `@trpc/tanstack-react-query` — React Query integration (TRPCProvider, useTRPC, createTRPCContext)
- `zod` — Schema validation for tRPC input/output
- `server-only` — Prevents server-only modules from being imported in client components
- `client-only` — Prevents client-only modules from being imported in server components

### Success Criteria:

#### Automated Verification:
- [x] All packages install without errors: `cd apps/web && pnpm ls @trpc/server @trpc/client @trpc/tanstack-react-query zod server-only client-only`
- [x] TypeScript still compiles: `cd apps/web && pnpm typecheck`

#### Manual Verification:
- [ ] None for this phase

---

## Phase 2: tRPC Server Infrastructure

### Overview
Create the tRPC server initialization, context factory, procedure types, root router, and health check router under `src/server/`.

### Changes Required:

#### 1. Create tRPC initialization and context factory
**File to create:** `apps/web/src/server/trpc.ts`

```typescript
/**
 * tRPC Server Initialization
 *
 * This file initializes tRPC, defines the context factory, and exports
 * the procedure types used by all routers.
 *
 * @see https://trpc.io/docs/server/routers
 */
import { initTRPC, TRPCError } from "@trpc/server"
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch"
import { ZodError } from "zod"
import { prisma } from "@/lib/db"
import type { PrismaClient } from "@/generated/prisma/client"

/**
 * tRPC Context
 *
 * Available to all procedures. Extended by middleware for procedure-specific
 * guarantees (e.g., protectedProcedure guarantees `authToken` is non-null).
 *
 * NOTE: `user` and `session` are null until ZMI-TICKET-202 (Supabase Auth)
 * implements actual user resolution from the auth token.
 */
export type TRPCContext = {
  prisma: PrismaClient
  /** Raw Authorization header value (Bearer token). Null if not provided. */
  authToken: string | null
  /** User object resolved from session. Null until ZMI-TICKET-202. */
  user: null
  /** Session object. Null until ZMI-TICKET-202. */
  session: null
  /** Tenant ID from X-Tenant-ID header. Null if not provided. */
  tenantId: string | null
}

/**
 * Creates the tRPC context for each request.
 *
 * Extracts auth token and tenant ID from request headers.
 * User/session resolution will be added in ZMI-TICKET-202.
 */
export function createTRPCContext(
  opts: FetchCreateContextFnOptions
): TRPCContext {
  const authHeader = opts.req.headers.get("authorization")
  const authToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null

  const tenantId = opts.req.headers.get("x-tenant-id")

  return {
    prisma,
    authToken,
    user: null,
    session: null,
    tenantId,
  }
}

/**
 * tRPC instance initialization.
 *
 * Error formatting includes Zod validation details when available.
 */
const t = initTRPC.context<TRPCContext>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    }
  },
})

/**
 * Router and middleware factories.
 */
export const createTRPCRouter = t.router
export const createCallerFactory = t.createCallerFactory

/**
 * Public procedure — no authentication required.
 * Available to anyone, including unauthenticated users.
 */
export const publicProcedure = t.procedure

/**
 * Protected procedure — requires a valid auth token.
 * Throws UNAUTHORIZED if no Bearer token is present in the Authorization header.
 *
 * NOTE: This currently only checks for token presence, not validity.
 * ZMI-TICKET-202 will add Supabase session validation and user resolution.
 */
export const protectedProcedure = t.procedure.use(
  async ({ ctx, next }) => {
    if (!ctx.authToken) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      })
    }

    return next({
      ctx: {
        ...ctx,
        authToken: ctx.authToken, // narrowed to non-null
      },
    })
  }
)

/**
 * Tenant procedure — requires auth token AND tenant ID.
 * Extends protectedProcedure with tenant ID requirement.
 * Throws UNAUTHORIZED if no auth token, FORBIDDEN if no tenant ID.
 *
 * NOTE: Does not validate that the user has access to the tenant.
 * ZMI-TICKET-203 will add tenant access validation.
 */
export const tenantProcedure = protectedProcedure.use(
  async ({ ctx, next }) => {
    if (!ctx.tenantId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Tenant ID required",
      })
    }

    return next({
      ctx: {
        ...ctx,
        tenantId: ctx.tenantId, // narrowed to non-null
      },
    })
  }
)
```

#### 2. Create the health check router
**File to create:** `apps/web/src/server/routers/health.ts`

```typescript
/**
 * Health Check Router
 *
 * Provides a simple health check endpoint to verify tRPC is working
 * end-to-end, including database connectivity.
 */
import { z } from "zod"
import { createTRPCRouter, publicProcedure } from "../trpc"

export const healthRouter = createTRPCRouter({
  check: publicProcedure
    .output(
      z.object({
        status: z.string(),
        timestamp: z.string(),
        database: z.string(),
      })
    )
    .query(async ({ ctx }) => {
      // Verify database connectivity with a simple query
      let dbStatus = "disconnected"
      try {
        await ctx.prisma.$queryRaw`SELECT 1`
        dbStatus = "connected"
      } catch {
        dbStatus = "error"
      }

      return {
        status: "ok",
        timestamp: new Date().toISOString(),
        database: dbStatus,
      }
    }),
})
```

#### 3. Create the root router (app router)
**File to create:** `apps/web/src/server/root.ts`

```typescript
/**
 * Root tRPC Router
 *
 * Merges all sub-routers into a single appRouter.
 * The AppRouter type is exported for client-side type inference.
 *
 * Add new routers here as they are implemented (ZMI-TICKET-210+).
 */
import { createTRPCRouter, createCallerFactory } from "./trpc"
import { healthRouter } from "./routers/health"

export const appRouter = createTRPCRouter({
  health: healthRouter,
})

/** Type-only export for client-side inference. */
export type AppRouter = typeof appRouter

/**
 * Server-side caller factory.
 * Used for server-side tRPC calls without HTTP round-trips.
 */
export const createCaller = createCallerFactory(appRouter)
```

#### 4. Create barrel export for server
**File to create:** `apps/web/src/server/index.ts`

```typescript
export { appRouter, type AppRouter, createCaller } from "./root"
export {
  createTRPCContext,
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
  tenantProcedure,
} from "./trpc"
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `cd apps/web && pnpm typecheck`
- [x] Files exist at correct paths:
  - `apps/web/src/server/trpc.ts`
  - `apps/web/src/server/root.ts`
  - `apps/web/src/server/routers/health.ts`
  - `apps/web/src/server/index.ts`

#### Manual Verification:
- [ ] None for this phase (tested in Phase 5)

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 3.

---

## Phase 3: App Router Handler

### Overview
Create the Next.js App Router API route handler that bridges HTTP requests to the tRPC server.

### Changes Required:

#### 1. Create the tRPC route handler
**File to create:** `apps/web/src/app/api/trpc/[trpc]/route.ts`

```typescript
/**
 * tRPC App Router Handler
 *
 * Handles all tRPC requests at /api/trpc/*.
 * Uses the fetch adapter for Next.js App Router compatibility.
 *
 * @see https://trpc.io/docs/server/adapters/fetch
 */
import { fetchRequestHandler } from "@trpc/server/adapters/fetch"
import { appRouter } from "@/server/root"
import { createTRPCContext } from "@/server/trpc"

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: createTRPCContext,
  })

export { handler as GET, handler as POST }
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `cd apps/web && pnpm typecheck`
- [x] File exists: `apps/web/src/app/api/trpc/[trpc]/route.ts`

#### Manual Verification:
- [ ] After starting dev server (`pnpm dev` in `apps/web`): `curl http://localhost:3001/api/trpc/health.check` returns valid JSON with `status: "ok"` and `database: "connected"`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the curl test works before proceeding to Phase 4.

---

## Phase 4: tRPC Client Setup for Frontend

### Overview
Create the tRPC React client with React Query integration, the TRPCProvider wrapper, and integrate it into the app layout. The existing `QueryProvider` will be replaced by the tRPC provider which internally wraps `QueryClientProvider`.

### Changes Required:

#### 1. Create tRPC React context (client-side type binding)
**File to create:** `apps/web/src/trpc/context.ts`

```typescript
/**
 * tRPC React Context
 *
 * Creates the typed TRPCProvider and useTRPC hook from the AppRouter type.
 * This file is imported by both client and provider components.
 */
import { createTRPCContext } from "@trpc/tanstack-react-query"
import type { AppRouter } from "@/server/root"

export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>()
```

#### 2. Create tRPC + React Query provider
**File to create:** `apps/web/src/trpc/provider.tsx`

```typescript
"use client"

import { useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { createTRPCClient, httpBatchLink } from "@trpc/client"
import type { AppRouter } from "@/server/root"
import { TRPCProvider } from "./context"
import { authStorage, tenantIdStorage } from "@/lib/api/client"

/**
 * Creates a QueryClient with defaults matching the existing QueryProvider.
 * This replaces the previous QueryProvider to unify React Query for both
 * tRPC and legacy openapi-fetch hooks.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: true,
        retry: 1,
        retryDelay: (attemptIndex) =>
          Math.min(1000 * 2 ** attemptIndex, 30000),
      },
      mutations: {
        retry: false,
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined

function getQueryClient() {
  if (typeof window === "undefined") {
    return makeQueryClient()
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient()
  }
  return browserQueryClient
}

function getBaseUrl() {
  if (typeof window !== "undefined") return ""
  return `http://localhost:${process.env.PORT ?? 3001}`
}

/**
 * Combined tRPC + React Query provider.
 *
 * Replaces the previous standalone QueryProvider. The QueryClientProvider
 * inside this component serves both tRPC hooks (useTRPC) and legacy
 * openapi-fetch hooks (useApiQuery/useApiMutation).
 */
export function TRPCReactProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const queryClient = getQueryClient()

  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          headers() {
            const headers: Record<string, string> = {}

            // Forward auth token to tRPC server
            const token = authStorage.getToken()
            if (token) {
              headers["authorization"] = `Bearer ${token}`
            }

            // Forward tenant ID to tRPC server
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

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools
          initialIsOpen={false}
          buttonPosition="bottom-left"
        />
      )}
    </QueryClientProvider>
  )
}
```

#### 3. Create barrel export for trpc client
**File to create:** `apps/web/src/trpc/index.ts`

```typescript
export { TRPCProvider, useTRPC, useTRPCClient } from "./context"
export { TRPCReactProvider } from "./provider"
```

#### 4. Create optional server-side caller (for future RSC usage)
**File to create:** `apps/web/src/trpc/server.ts`

```typescript
/**
 * Server-side tRPC caller
 *
 * For use in Server Components and server-side code.
 * Calls tRPC procedures directly without HTTP round-trips.
 *
 * Usage:
 *   import { serverTrpc } from "@/trpc/server"
 *   const health = await serverTrpc.health.check()
 *
 * NOTE: This is optional for ZMI-TICKET-201. The primary use case is
 * client-side tRPC via the TRPCReactProvider. Server-side usage can
 * be adopted incrementally in future tickets.
 */
import "server-only"
import { createCaller, createTRPCContext } from "@/server"

/**
 * Creates a server-side tRPC caller with a minimal context.
 * Since there is no HTTP request in server components, we construct
 * a synthetic context with the prisma client and null auth/tenant.
 */
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

#### 5. Replace QueryProvider with TRPCReactProvider in root layout
**File:** `apps/web/src/app/[locale]/layout.tsx`

**Change:** Replace `QueryProvider` import and usage with `TRPCReactProvider`.

Before:
```typescript
import { QueryProvider } from '@/providers/query-provider'
```

After:
```typescript
import { TRPCReactProvider } from '@/trpc/provider'
```

And in the JSX, replace:
```tsx
<QueryProvider>
  <AuthProvider>
    {children}
  </AuthProvider>
</QueryProvider>
```

With:
```tsx
<TRPCReactProvider>
  <AuthProvider>
    {children}
  </AuthProvider>
</TRPCReactProvider>
```

The `TRPCReactProvider` internally renders `QueryClientProvider`, so the existing `useApiQuery`/`useApiMutation` hooks (which call `useQueryClient()`) will continue to work because they find the `QueryClient` from the same provider.

**Note:** Do NOT delete `src/providers/query-provider.tsx`. Keep it for reference and in case it is imported elsewhere. It can be cleaned up in a future ticket.

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `cd apps/web && pnpm typecheck`
- [x] Lint passes: `cd apps/web && pnpm lint` (only pre-existing lint errors in payroll-export-preview.tsx remain)
- [x] Files exist:
  - `apps/web/src/trpc/context.ts`
  - `apps/web/src/trpc/provider.tsx`
  - `apps/web/src/trpc/index.ts`
  - `apps/web/src/trpc/server.ts`
- [x] Root layout imports `TRPCReactProvider` instead of `QueryProvider`

#### Manual Verification:
- [ ] Dev server starts without errors: `cd apps/web && pnpm dev`
- [ ] Existing pages load correctly (login, dashboard) — no regressions from provider swap
- [ ] React Query Devtools still appear in bottom-left corner
- [ ] All existing openapi-fetch hooks still work (test by navigating through the app)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the existing app still works correctly before proceeding to Phase 5.

---

## Phase 5: End-to-End Health Check Verification

### Overview
Create a simple test component and write integration tests to verify the full tRPC stack works end-to-end. Also verify error handling behavior for `protectedProcedure` and `tenantProcedure`.

### Changes Required:

#### 1. Add a temporary health check test section to an existing page (optional)

This is for manual verification only. Add a small component to verify tRPC works from the browser.

**File to create:** `apps/web/src/components/dev/trpc-health-check.tsx`

```typescript
"use client"

import { useQuery } from "@tanstack/react-query"
import { useTRPC } from "@/trpc/context"

/**
 * Development-only component to verify tRPC health check.
 * Remove after ZMI-TICKET-201 is verified.
 */
export function TrpcHealthCheck() {
  const trpc = useTRPC()
  const { data, error, isLoading } = useQuery(
    trpc.health.check.queryOptions()
  )

  if (process.env.NODE_ENV !== "development") return null

  return (
    <div className="fixed bottom-12 right-4 z-50 rounded border bg-background p-3 text-xs shadow-lg">
      <div className="font-semibold mb-1">tRPC Health</div>
      {isLoading && <div>Checking...</div>}
      {error && <div className="text-destructive">Error: {error.message}</div>}
      {data && (
        <div className="space-y-0.5">
          <div>Status: {data.status}</div>
          <div>DB: {data.database}</div>
          <div>Time: {new Date(data.timestamp).toLocaleTimeString()}</div>
        </div>
      )}
    </div>
  )
}
```

#### 2. Verify procedure error behavior via curl

These are manual verification steps, not code changes:

```bash
# publicProcedure — should succeed without auth
curl -s http://localhost:3001/api/trpc/health.check | jq .

# protectedProcedure — should fail UNAUTHORIZED without token
# (No protected procedure exists yet beyond the base middleware,
#  but we can test by creating a temporary test or verifying
#  the middleware logic via unit tests)

# tenantProcedure — should fail FORBIDDEN without tenant header
# (Same as above — verified via unit tests below)
```

#### 3. Create unit tests for tRPC context and procedures
**File to create:** `apps/web/src/server/__tests__/trpc.test.ts`

```typescript
import { describe, it, expect } from "vitest"
import { appRouter } from "../root"
import { createCaller } from "../root"
import type { TRPCContext } from "../trpc"

function createMockContext(overrides: Partial<TRPCContext> = {}): TRPCContext {
  return {
    prisma: {} as TRPCContext["prisma"], // Mock for non-DB tests
    authToken: null,
    user: null,
    session: null,
    tenantId: null,
    ...overrides,
  }
}

describe("health router", () => {
  it("health.check returns ok status", async () => {
    const mockPrisma = {
      $queryRaw: async () => [{ "?column?": 1 }],
    } as unknown as TRPCContext["prisma"]

    const caller = createCaller({
      ...createMockContext(),
      prisma: mockPrisma,
    })

    const result = await caller.health.check()

    expect(result.status).toBe("ok")
    expect(result.database).toBe("connected")
    expect(result.timestamp).toBeDefined()
  })

  it("health.check reports database error gracefully", async () => {
    const mockPrisma = {
      $queryRaw: async () => {
        throw new Error("Connection refused")
      },
    } as unknown as TRPCContext["prisma"]

    const caller = createCaller({
      ...createMockContext(),
      prisma: mockPrisma,
    })

    const result = await caller.health.check()

    expect(result.status).toBe("ok")
    expect(result.database).toBe("error")
  })
})

describe("procedure middleware", () => {
  // We need a router with protected and tenant procedures to test middleware.
  // Import them and create a test router.
})
```

**File to create:** `apps/web/src/server/__tests__/procedures.test.ts`

```typescript
import { describe, it, expect } from "vitest"
import { z } from "zod"
import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
  tenantProcedure,
  createCallerFactory,
} from "../trpc"
import type { TRPCContext } from "../trpc"

/**
 * Test router with all three procedure types.
 */
const testRouter = createTRPCRouter({
  public: publicProcedure.query(() => "public"),
  protected: protectedProcedure.query(() => "protected"),
  tenant: tenantProcedure.query(({ ctx }) => `tenant:${ctx.tenantId}`),
  validatedInput: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .query(({ input }) => `hello ${input.name}`),
})

const createCaller = createCallerFactory(testRouter)

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

describe("publicProcedure", () => {
  it("allows unauthenticated access", async () => {
    const caller = createCaller(createMockContext())
    const result = await caller.public()
    expect(result).toBe("public")
  })
})

describe("protectedProcedure", () => {
  it("throws UNAUTHORIZED without auth token", async () => {
    const caller = createCaller(createMockContext())
    await expect(caller.protected()).rejects.toThrow("Authentication required")
  })

  it("allows access with auth token", async () => {
    const caller = createCaller(
      createMockContext({ authToken: "test-token-123" })
    )
    const result = await caller.protected()
    expect(result).toBe("protected")
  })
})

describe("tenantProcedure", () => {
  it("throws UNAUTHORIZED without auth token", async () => {
    const caller = createCaller(createMockContext({ tenantId: "tenant-1" }))
    await expect(caller.tenant()).rejects.toThrow("Authentication required")
  })

  it("throws FORBIDDEN without tenant ID", async () => {
    const caller = createCaller(
      createMockContext({ authToken: "test-token-123" })
    )
    await expect(caller.tenant()).rejects.toThrow("Tenant ID required")
  })

  it("allows access with auth token and tenant ID", async () => {
    const caller = createCaller(
      createMockContext({
        authToken: "test-token-123",
        tenantId: "tenant-abc",
      })
    )
    const result = await caller.tenant()
    expect(result).toBe("tenant:tenant-abc")
  })
})

describe("zod validation", () => {
  it("rejects invalid input", async () => {
    const caller = createCaller(createMockContext())
    await expect(
      caller.validatedInput({ name: "" })
    ).rejects.toThrow()
  })

  it("accepts valid input", async () => {
    const caller = createCaller(createMockContext())
    const result = await caller.validatedInput({ name: "world" })
    expect(result).toBe("hello world")
  })
})
```

### Success Criteria:

#### Automated Verification:
- [x] Unit tests pass: `cd apps/web && pnpm vitest run src/server/__tests__/` (10 tests, 2 files)
- [x] TypeScript compiles: `cd apps/web && pnpm typecheck`
- [x] Lint passes: `cd apps/web && pnpm lint` (only pre-existing lint errors remain)

#### Manual Verification:
- [ ] `curl -s http://localhost:3001/api/trpc/health.check` returns `{"result":{"data":{"status":"ok","timestamp":"...","database":"connected"}}}`
- [ ] Health check component renders correctly in the browser (if added to a page)
- [ ] Existing app functionality is not broken (navigate through login, dashboard, admin pages)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human.

---

## Testing Strategy

### Unit Tests:
- Context factory correctly extracts auth token from Authorization header
- Context factory correctly extracts tenant ID from X-Tenant-ID header
- `publicProcedure` allows unauthenticated access
- `protectedProcedure` throws UNAUTHORIZED without auth token
- `protectedProcedure` allows access with auth token
- `tenantProcedure` throws UNAUTHORIZED without auth token
- `tenantProcedure` throws FORBIDDEN without tenant ID
- `tenantProcedure` allows access with both auth token and tenant ID
- Zod validation errors are correctly formatted with `zodError` field
- Health check returns database status

### Integration Tests:
- Health check procedure returns valid response via HTTP (`/api/trpc/health.check`)
- Batch requests work correctly via httpBatchLink
- Client-side health check query works via `useTRPC` + `useQuery`

### Manual Testing Steps:
1. Start dev server: `cd apps/web && pnpm dev`
2. Verify health check: `curl http://localhost:3001/api/trpc/health.check`
3. Login to the app via the existing login page
4. Navigate through dashboard pages — verify no regressions
5. Check React Query Devtools — should show both openapi-fetch and tRPC queries
6. (Optional) Add `TrpcHealthCheck` component to a page and verify it renders

## Performance Considerations

- The `httpBatchLink` batches multiple tRPC calls into a single HTTP request, reducing network overhead
- The existing `QueryClient` configuration (5 min stale time, 30 min GC) is preserved in the tRPC provider
- The Prisma singleton is reused across requests (no new connections per tRPC call)
- The `server-only` package on `src/trpc/server.ts` prevents accidental bundling of server code into the client

## Migration Notes

- The `QueryProvider` at `src/providers/query-provider.tsx` is replaced by `TRPCReactProvider` in the root layout but NOT deleted (may be imported elsewhere)
- All existing `useApiQuery` and `useApiMutation` hooks continue to work because they access the same `QueryClient` provided by `TRPCReactProvider`'s internal `QueryClientProvider`
- The `authStorage` and `tenantIdStorage` from `src/lib/api/client.ts` are reused by the tRPC httpBatchLink headers function to ensure consistent auth/tenant forwarding
- No database migrations required
- No environment variable changes required (DATABASE_URL already exists from ZMI-TICKET-200)

## File Summary

### New Files:
| File | Purpose |
|------|---------|
| `src/server/trpc.ts` | tRPC init, context factory, procedure types |
| `src/server/root.ts` | Root appRouter, AppRouter type, createCaller |
| `src/server/routers/health.ts` | Health check router |
| `src/server/index.ts` | Server barrel export |
| `src/app/api/trpc/[trpc]/route.ts` | Next.js App Router handler |
| `src/trpc/context.ts` | Client-side tRPC React context (TRPCProvider, useTRPC) |
| `src/trpc/provider.tsx` | TRPCReactProvider (combined tRPC + React Query) |
| `src/trpc/index.ts` | Client trpc barrel export |
| `src/trpc/server.ts` | Optional server-side caller |
| `src/components/dev/trpc-health-check.tsx` | Dev-only health check widget |
| `src/server/__tests__/trpc.test.ts` | Unit tests for health router |
| `src/server/__tests__/procedures.test.ts` | Unit tests for procedure types |

### Modified Files:
| File | Change |
|------|--------|
| `src/app/[locale]/layout.tsx` | Replace `QueryProvider` with `TRPCReactProvider` |
| `package.json` | Add `@trpc/*`, `zod`, `server-only`, `client-only` dependencies |

### Unchanged Files (remain active during migration):
| File | Why |
|------|-----|
| `src/providers/query-provider.tsx` | Kept for reference, may be imported elsewhere |
| `src/lib/api/client.ts` | openapi-fetch client still used by 55+ hooks |
| `src/hooks/use-api-query.ts` | Legacy hooks still active |
| `src/hooks/use-api-mutation.ts` | Legacy hooks still active |
| All `src/hooks/api/*.ts` | Legacy domain hooks still active |

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-201-trpc-server-setup.md`
- Research document: `thoughts/shared/research/2026-03-02-ZMI-TICKET-201-trpc-server-setup.md`
- Dependency (Prisma): `thoughts/shared/plans/2026-03-02-ZMI-TICKET-200-prisma-schema-core-foundation.md`
- Downstream tickets: ZMI-TICKET-202 (Supabase Auth), ZMI-TICKET-203 (Authorization Middleware), ZMI-TICKET-210 (First domain routers)
- tRPC v11 docs: https://trpc.io/docs/client/tanstack-react-query/setup
- tRPC RSC setup: https://trpc.io/docs/client/tanstack-react-query/server-components
- tRPC fetch adapter: https://trpc.io/docs/server/adapters/fetch
