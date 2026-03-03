---
date: 2026-03-02T15:00:00+01:00
researcher: claude
git_commit: a30ae857
branch: staging
repository: terp
topic: "ZMI-TICKET-201: tRPC Server Setup — Current Next.js App State and Integration Points"
tags: [research, codebase, trpc, nextjs, prisma, auth, api-client, app-router]
status: complete
last_updated: 2026-03-02
last_updated_by: claude
---

# Research: ZMI-TICKET-201 — tRPC Server Setup

**Date**: 2026-03-02T15:00:00+01:00
**Researcher**: claude
**Git Commit**: a30ae857
**Branch**: staging
**Repository**: terp

## Research Question

Document the current state of the Next.js app (`apps/web/`) across all areas relevant to the tRPC server setup described in ZMI-TICKET-201: app structure, Prisma setup, auth patterns, API client patterns, middleware, tenant handling, package manager, and Next.js configuration.

## Summary

The Next.js app at `apps/web/` is a mature Next.js 16 application using the App Router with `[locale]` segment for i18n (next-intl). It uses **pnpm** as its package manager. The app currently communicates exclusively with a Go backend API via `openapi-fetch` (typed HTTP client generated from OpenAPI spec) and TanStack React Query. There is **no tRPC, no Supabase, no zod, and no superjson** installed. Authentication is JWT-based via localStorage, with auth/tenant state managed through React context providers. Prisma 7 with PrismaPg adapter was recently added (ZMI-TICKET-200) with a singleton client at `src/lib/db/prisma.ts` and generated types at `src/generated/prisma/`. There are no existing API route handlers under `src/app/api/` — the `api` path is already excluded from the next-intl middleware matcher. The `src/server/` directory (proposed by the ticket) does not exist yet.

## Detailed Findings

### 1. Next.js App Structure

The app uses Next.js 16 with App Router and Turbopack for development (`next dev --turbopack -p 3001`).

**Top-level `src/` directory layout:**
```
src/
├── app/              # App Router pages and layouts
│   ├── globals.css
│   └── [locale]/     # i18n locale segment
│       ├── layout.tsx         # Root locale layout (providers)
│       ├── page.tsx           # Root page (redirects to /dashboard or /login)
│       ├── design-system/     # Design system page
│       ├── (auth)/            # Auth group (login)
│       │   ├── layout.tsx     # Centered layout
│       │   └── login/page.tsx
│       └── (dashboard)/       # Dashboard group (protected)
│           ├── layout.tsx     # ProtectedRoute + TenantProvider + AppLayout
│           ├── dashboard/
│           ├── admin/         # ~35 admin sub-pages
│           └── ...            # ~10 user-facing pages
├── components/       # UI components (shadcn/ui + domain components)
│   ├── ui/           # ~35 shadcn/ui primitives
│   ├── auth/         # ProtectedRoute, TenantGuard, UserMenu
│   ├── layout/       # AppLayout, Sidebar, etc.
│   └── [domain]/     # Domain-specific components
├── config/           # Environment config (env.ts)
├── generated/        # Prisma generated client
│   └── prisma/
├── hooks/            # React hooks
│   ├── use-api-query.ts     # Generic typed GET hook
│   ├── use-api-mutation.ts  # Generic typed mutation hook
│   ├── use-auth.ts          # Auth hooks (login, logout, me)
│   ├── use-has-role.ts
│   ├── use-has-permission.ts
│   └── api/                 # ~55 domain-specific API hooks
├── i18n/             # Internationalization config
├── lib/              # Shared utilities
│   ├── api/          # API client (openapi-fetch)
│   ├── db/           # Prisma client singleton
│   ├── utils.ts
│   └── time-utils.ts
├── middleware.ts      # Next.js middleware (i18n only)
├── providers/        # React context providers
│   ├── auth-provider.tsx
│   ├── query-provider.tsx
│   ├── tenant-provider.tsx
│   └── theme-provider.tsx
├── stories/          # Storybook stories
└── types/            # Custom type definitions (mostly empty)
```

**No `src/app/api/` directory exists.** There are no API route handlers in the Next.js app. All data flows through the Go backend.

**No `src/server/` directory exists.** This is the directory proposed by ZMI-TICKET-201 for tRPC server code.

### 2. Prisma Setup (ZMI-TICKET-200 Dependency)

Prisma 7 was added as part of ZMI-TICKET-200. It is configured as READ-ONLY against the existing PostgreSQL database.

**Schema location:** `apps/web/prisma/schema.prisma`
- Generator outputs to `../src/generated/prisma` (relative to schema)
- Uses `prisma-client` generator (Prisma 7 style)
- Datasource: PostgreSQL (no URL in schema — loaded via config)
- Models: `User`, `Tenant`, `UserGroup`, `UserTenant` (core foundation only)

**Prisma config:** `apps/web/prisma.config.ts`
- Loads `.env.local` then `.env` via `dotenv`
- Points to `prisma/schema.prisma`

**Prisma Client singleton:** `apps/web/src/lib/db/prisma.ts`
- Uses the global singleton pattern for Next.js hot-reload safety
- Creates `PrismaPg` adapter with `process.env.DATABASE_URL` connection string
- Development logging: `["query", "error", "warn"]`; production: `["error"]`
- Exported as `prisma` from `@/lib/db` (barrel export in `src/lib/db/index.ts`)

**Generated client location:** `apps/web/src/generated/prisma/`
- `client.ts` — PrismaClient class and type exports (User, Tenant, UserGroup, UserTenant)
- `models.ts` — barrel export of all model types
- `models/` — individual model type files
- `enums.ts`, `browser.ts`, `commonInputTypes.ts`, `internal/` — Prisma runtime

**Import pattern:**
```typescript
import { PrismaClient } from "@/generated/prisma/client"
```

**Package versions:**
- `@prisma/client`: `^7.4.2`
- `@prisma/adapter-pg`: `^7.4.2`
- `prisma` (dev): `^7.4.2`
- `pg`: `^8.19.0`

### 3. Authentication Patterns

Authentication is entirely client-side JWT-based, communicating with the Go backend.

**Auth token storage:** `apps/web/src/lib/api/client.ts`
- `authStorage` — reads/writes JWT to `localStorage` under key `auth_token`
- `tenantIdStorage` — reads/writes tenant ID to `localStorage` under key `tenant_id`
- Both check `typeof window !== 'undefined'` for SSR safety

**Auth hooks:** `apps/web/src/hooks/use-auth.ts`
- `useCurrentUser()` — calls `GET /auth/me` via Go API (uses `useApiQuery`)
- `useLogin()` — calls `POST /auth/login`, stores token + tenant ID on success
- `useDevLogin()` — calls `GET /auth/dev/login` (dev only), stores token + tenant ID
- `useDevUsers()` — calls `GET /auth/dev/users` (dev only)
- `useLogout()` — calls `POST /auth/logout`, clears localStorage

**Auth Provider:** `apps/web/src/providers/auth-provider.tsx`
- React context providing: `user`, `isLoading`, `isAuthenticated`, `error`, `logout`, `refetch`
- Checks `authStorage.getToken()` before making the `/auth/me` API call
- On logout: clears all React Query cache

**Protected Route:** `apps/web/src/components/auth/protected-route.tsx`
- Client component that redirects to `/login?returnUrl=...` when not authenticated
- Uses `useAuth()` context hook
- Shows loading fallback during auth check

**Auth flow:**
```
Login page → POST /auth/login (Go API) → JWT stored in localStorage
→ useCurrentUser() → GET /auth/me → AuthContext.user set
→ All subsequent API calls include Bearer token via middleware
```

**No Supabase auth exists.** No `@supabase/supabase-js` package is installed. No Supabase env vars. This is planned for ZMI-TICKET-202.

**No server-side session management.** All auth state is client-side via localStorage + React context.

### 4. API Client Patterns (openapi-fetch)

**Core client:** `apps/web/src/lib/api/client.ts`
- Uses `openapi-fetch` library with generated TypeScript types from OpenAPI spec
- Base URL from `clientEnv.apiUrl` (defaults to `http://localhost:8080/api/v1`)
- Two middleware chains:
  1. `authMiddleware` — adds `Authorization: Bearer {token}` header
  2. `tenantMiddleware` — adds `X-Tenant-ID: {tenantId}` header
- Exported as `api` singleton

**Type generation:**
- Script: `pnpm generate:api` runs `openapi-typescript ../../api/openapi.bundled.v3.yaml -o src/lib/api/types.ts`
- Generated types file: `src/lib/api/types.ts` — exports `paths`, `components`, `operations`

**useApiQuery hook:** `apps/web/src/hooks/use-api-query.ts`
- Wraps TanStack `useQuery` with typed path extraction
- Type-safe GET endpoint paths, query params, path params, response types
- Query key pattern: `[path, ...params, ...pathParams]`
- Calls `api.GET(path, { params: { query, path } })`

**useApiMutation hook:** `apps/web/src/hooks/use-api-mutation.ts`
- Wraps TanStack `useMutation` for POST/PUT/PATCH/DELETE
- Accepts `invalidateKeys` for automatic React Query cache invalidation
- Type-safe request body, path params, response types

**Domain API hooks:** `apps/web/src/hooks/api/` (55+ files)
- Each domain entity has its own file (e.g., `use-employees.ts`, `use-bookings.ts`)
- All built on top of `useApiQuery` and `useApiMutation`
- Barrel export from `src/hooks/api/index.ts` (540+ lines of exports)
- Example pattern:
  ```typescript
  export function useEmployees(options) {
    return useApiQuery('/employees', { params: { limit, page, search, ... }, enabled })
  }
  export function useCreateEmployee() {
    return useApiMutation('/employees', 'post', { invalidateKeys: [['/employees']] })
  }
  ```

**Error handling:** `apps/web/src/lib/api/errors.ts`
- RFC 7807 ProblemDetails parsing
- Helper functions: `parseApiError`, `getErrorMessage`, `isAuthError`, `isForbiddenError`, `isValidationError`, `isNotFoundError`

### 5. Middleware and Tenant Handling

**Next.js Middleware:** `apps/web/src/middleware.ts`
- Uses `next-intl` middleware only (locale detection/routing)
- Matcher: `'/((?!api|trpc|_next|_vercel|.*\\..*).*)'`
- The `trpc` path is already excluded from the middleware matcher, indicating forethought about tRPC integration
- The `api` path is also excluded

**Tenant Provider:** `apps/web/src/providers/tenant-provider.tsx`
- React context managing tenant selection state
- Loads tenant ID from `localStorage` on mount
- Fetches available tenants via `useApiQuery('/tenants')`
- Auto-selects if only one tenant is available
- `selectTenant()` stores ID and reloads page (`window.location.reload()`)
- `clearTenant()` removes from localStorage

**Tenant Guard:** `apps/web/src/components/auth/tenant-guard.tsx`
- Shows tenant selector UI if multiple tenants are available
- Shows error if no tenants are available
- Renders children only when a tenant is selected

**Tenant in API calls:**
- The `tenantMiddleware` in `client.ts` automatically adds `X-Tenant-ID` header to every API call
- Tenant ID comes from `localStorage` via `tenantIdStorage`

**Provider hierarchy in root locale layout:** `apps/web/src/app/[locale]/layout.tsx`
```
<NextIntlClientProvider>
  <ThemeProvider>
    <QueryProvider>          ← TanStack React Query
      <AuthProvider>         ← Auth context (useCurrentUser)
        {children}
      </AuthProvider>
    </QueryProvider>
  </ThemeProvider>
</NextIntlClientProvider>
```

**Provider hierarchy in dashboard layout:** `apps/web/src/app/[locale]/(dashboard)/layout.tsx`
```
<ProtectedRoute>             ← Redirects to login if not authenticated
  <TenantProvider>           ← Tenant selection context
    <TenantGuard>            ← Blocks rendering until tenant is selected
      <AppLayout>            ← Main app shell (sidebar, header, etc.)
        {children}
      </AppLayout>
    </TenantGuard>
  </TenantProvider>
</ProtectedRoute>
```

### 6. Existing tRPC or Similar RPC Setup

**No tRPC exists.** No `@trpc/*` packages in `package.json`. No tRPC-related files anywhere in the codebase. No `src/server/` directory. No `src/trpc/` directory.

**No zod exists.** Not in `package.json`. No validation library is used on the frontend side.

**No superjson exists.** Not in `package.json`.

The only data fetching pattern is `openapi-fetch` + TanStack React Query as described in Section 4.

### 7. Package Manager

**pnpm** is used as the package manager.

Evidence:
- `pnpm-lock.yaml` (317,662 bytes) exists at `apps/web/pnpm-lock.yaml`
- `.pnpm-store/` directory exists at `apps/web/.pnpm-store/`
- No `package-lock.json`, `yarn.lock`, or `bun.lockb` files

### 8. Next.js Configuration

**Next.js version:** `^16.1.0` (latest major version)

**`next.config.ts`:**
```typescript
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  output: "standalone",
}

export default withNextIntl(nextConfig)
```

- Uses `standalone` output mode (for containerized deployment)
- Wrapped with `next-intl` plugin pointing to `./src/i18n/request.ts`
- No `serverExternalPackages`, no `experimental` flags, no custom webpack config

**TypeScript configuration (`tsconfig.json`):**
- Target: ES2022, Module: ESNext, ModuleResolution: bundler
- Strict mode enabled, `noUncheckedIndexedAccess`, `noImplicitReturns`
- Path alias: `@/*` → `./src/*`
- Next.js plugin included

**i18n setup:**
- `next-intl` v4.7.0 with App Router integration
- Locales: `['de', 'en']`, default: `'de'`
- Locale prefix: `'as-needed'` (no `/de/` prefix for default locale)
- Messages in `apps/web/messages/{locale}.json`

**Development port:** 3001 (configured in `package.json` scripts)

**Environment variables:**
- `API_URL` — server-side Go API URL (default: `http://localhost:8080/api/v1`)
- `NEXT_PUBLIC_API_URL` — client-side Go API URL (same default)
- `NEXT_PUBLIC_APP_NAME` — app name (default: `Terp`)
- `DATABASE_URL` — PostgreSQL connection string (for Prisma)

**Other tooling:**
- Storybook 10 with `@storybook/nextjs-vite`
- shadcn/ui (new-york style) with Radix UI primitives
- Tailwind CSS v4 with PostCSS
- ESLint 9 with `typescript-eslint` and `@next/eslint-plugin-next`
- Prettier for formatting
- Vitest + Playwright for testing

### 9. React Query Provider Configuration

`apps/web/src/providers/query-provider.tsx`:
- Default stale time: 5 minutes
- GC time: 30 minutes
- `refetchOnWindowFocus: true`
- Retry: 1 for queries, 0 for mutations
- Browser: singleton QueryClient; Server: new client per request
- React Query Devtools in development mode

### 10. Key Packages Already Installed (Relevant to tRPC Setup)

| Package | Version | Relevance |
|---------|---------|-----------|
| `@tanstack/react-query` | `^5.90.20` | tRPC v11 uses React Query integration |
| `@tanstack/react-query-devtools` | `^5.91.2` | Already configured |
| `@prisma/client` | `^7.4.2` | For tRPC context factory |
| `@prisma/adapter-pg` | `^7.4.2` | PrismaPg adapter |
| `pg` | `^8.19.0` | PostgreSQL driver |
| `next` | `^16.1.0` | App Router handler |
| `react` | `^19.2.0` | React 19 |
| `typescript` | `^5.7.0` | Type safety |

**Packages NOT installed (needed for tRPC):**
- `@trpc/server` — tRPC server core
- `@trpc/client` — tRPC client
- `@trpc/react-query` — tRPC React Query integration
- `@trpc/next` — tRPC Next.js adapter (or may use `@trpc/server/adapters/fetch` for App Router)
- `zod` — Schema validation (used by tRPC for input validation)
- `superjson` — Data transformer for tRPC (optional but common)

## Code References

- `apps/web/package.json` — Package manager (pnpm), dependencies, scripts
- `apps/web/next.config.ts` — Next.js config (standalone output, next-intl)
- `apps/web/tsconfig.json` — TypeScript config (path alias `@/*`)
- `apps/web/prisma/schema.prisma` — Prisma schema (4 models, output to `src/generated/prisma`)
- `apps/web/prisma.config.ts` — Prisma config (dotenv loading)
- `apps/web/src/lib/db/prisma.ts` — PrismaClient singleton
- `apps/web/src/lib/db/index.ts` — Barrel export for prisma
- `apps/web/src/generated/prisma/client.ts` — Generated PrismaClient class + type exports
- `apps/web/src/lib/api/client.ts` — openapi-fetch client with auth/tenant middleware
- `apps/web/src/lib/api/errors.ts` — RFC 7807 error parsing
- `apps/web/src/lib/api/index.ts` — API barrel exports
- `apps/web/src/hooks/use-api-query.ts` — Generic typed GET hook (useQuery wrapper)
- `apps/web/src/hooks/use-api-mutation.ts` — Generic typed mutation hook (useMutation wrapper)
- `apps/web/src/hooks/use-auth.ts` — Auth hooks (login, logout, me, dev-login)
- `apps/web/src/hooks/index.ts` — Hook barrel exports
- `apps/web/src/hooks/api/index.ts` — 55+ domain API hook barrel exports
- `apps/web/src/hooks/api/use-employees.ts` — Example domain hook pattern
- `apps/web/src/providers/auth-provider.tsx` — AuthContext (user, isAuthenticated, logout)
- `apps/web/src/providers/query-provider.tsx` — TanStack React Query provider (singleton)
- `apps/web/src/providers/tenant-provider.tsx` — TenantContext (tenant selection, localStorage)
- `apps/web/src/providers/theme-provider.tsx` — Theme context (light/dark/system)
- `apps/web/src/middleware.ts` — Next.js middleware (i18n only, excludes `api` and `trpc` paths)
- `apps/web/src/app/[locale]/layout.tsx` — Root layout (provider hierarchy)
- `apps/web/src/app/[locale]/(dashboard)/layout.tsx` — Dashboard layout (ProtectedRoute + TenantProvider)
- `apps/web/src/components/auth/protected-route.tsx` — Auth guard component
- `apps/web/src/components/auth/tenant-guard.tsx` — Tenant selection guard component
- `apps/web/src/config/env.ts` — Environment variable configuration
- `apps/web/src/i18n/routing.ts` — i18n routing config (de/en)
- `apps/web/src/i18n/request.ts` — Server-side i18n config
- `apps/web/global.d.ts` — next-intl type augmentation
- `apps/web/components.json` — shadcn/ui configuration
- `apps/web/eslint.config.mjs` — ESLint flat config

## Architecture Documentation

### Current Data Flow
```
Browser → React Component
       → useApiQuery/useApiMutation (TanStack React Query)
       → openapi-fetch client (typed HTTP)
       → Auth middleware (Bearer token from localStorage)
       → Tenant middleware (X-Tenant-ID from localStorage)
       → Go backend API (localhost:8080/api/v1)
       → PostgreSQL
```

### Planned Data Flow (after tRPC)
```
Browser → React Component
       → trpc.{router}.{procedure}.useQuery/useMutation (TanStack React Query via tRPC)
       → tRPC client (HTTP to /api/trpc/*)
       → Next.js App Router handler (app/api/trpc/[trpc]/route.ts)
       → tRPC server (context factory, middleware, procedures)
       → Prisma Client
       → PostgreSQL
```

### Provider Nesting Order
```
<html>
  <body>
    <NextIntlClientProvider>           ← i18n
      <ThemeProvider>                  ← Dark/light mode
        <QueryProvider>                ← TanStack React Query
          <AuthProvider>               ← Auth state from Go API
            <ProtectedRoute>           ← Auth guard (dashboard only)
              <TenantProvider>         ← Tenant selection (dashboard only)
                <TenantGuard>          ← Tenant guard (dashboard only)
                  <AppLayout>          ← App shell
                    {page}
```

### Route Groups
- `(auth)` — login page, centered layout, no auth required
- `(dashboard)` — all app pages, protected + tenant-scoped

### Middleware Exclusion Pattern
The Next.js middleware already excludes `api` and `trpc` from i18n processing:
```typescript
export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)'
};
```

## Historical Context (from thoughts/)

### ZMI-TICKET-200 Research
- `thoughts/shared/research/2026-03-02-ZMI-TICKET-200-prisma-schema-core-foundation.md` — Documents the current state of four core entities across Go backend + Next.js frontend. Confirms frontend had zero database integration before Prisma was added. Prisma schema was implemented as part of this ticket.

### Related Tickets in Migration Roadmap
- `thoughts/shared/tickets/ZMI-TICKET-200-prisma-schema-core-foundation.md` — Prisma core schema (dependency of 201)
- `thoughts/shared/tickets/ZMI-TICKET-201-trpc-server-setup.md` — This ticket: tRPC server setup
- `thoughts/shared/tickets/ZMI-TICKET-202-supabase-auth-migration.md` — Supabase auth (depends on 200, 201). Plans to replace JWT/localStorage auth with Supabase Auth. Defines `auth` tRPC router.
- `thoughts/shared/tickets/ZMI-TICKET-203-authorization-middleware.md` — Permission middleware (depends on 200, 201, 202). Plans `requirePermission()`, `requireSelfOrPermission()`, `requireEmployeePermission()` tRPC middleware.
- `thoughts/shared/tickets/ZMI-TICKET-210-tenants-users-usergroups.md` — First domain tRPC router (depends on 201)

### Implementation Plan
- `thoughts/shared/plans/2026-03-02-ZMI-TICKET-200-prisma-schema-core-foundation.md` — Plan for Prisma core schema implementation

## Related Research

- `thoughts/shared/research/2026-03-02-ZMI-TICKET-200-prisma-schema-core-foundation.md` — Prisma setup context
- `thoughts/shared/research/2026-01-25-NOK-214-nextjs-project-init.md` — Original Next.js project initialization
- `thoughts/shared/research/2026-01-25-NOK-215-generate-typescript-api-client.md` — OpenAPI TypeScript client generation
- `thoughts/shared/research/2026-01-25-NOK-216-implement-authentication-flow.md` — Auth flow implementation

## Open Questions

1. **tRPC version**: The ticket specifies "tRPC v11". As of March 2026, tRPC v11 is the current stable release. The App Router adapter approach (using `fetchRequestHandler` from `@trpc/server/adapters/fetch`) is the recommended pattern for Next.js App Router.

2. **React Query coexistence**: The existing `QueryProvider` creates a singleton `QueryClient`. tRPC's React Query integration typically creates its own `QueryClient` or wraps the existing one. The coexistence strategy during the migration period (both `useApiQuery` and `trpc.*` hooks active) needs to be considered.

3. **Auth context for tRPC**: The ticket's context factory requires `user` and `session`. Currently, auth state lives only in client-side localStorage (JWT token). For server-side tRPC procedures, the context factory will need to extract auth from the HTTP request headers (Bearer token or cookies). ZMI-TICKET-202 plans to replace this with Supabase Auth sessions.

4. **Tenant ID for tRPC**: Currently, tenant ID is stored in localStorage and sent as `X-Tenant-ID` header. The tRPC context factory will need to extract this from the incoming request headers. The tRPC client will need to send this header.

5. **Prisma schema coverage**: Currently only 4 models exist (User, Tenant, UserGroup, UserTenant). Domain routers starting from ZMI-TICKET-210 will need additional Prisma models (ZMI-TICKET-204, 205 are separate schema tickets).

6. **SSR caller**: The ticket mentions an optional server-side tRPC caller (`src/trpc/server.ts`). This would enable Server Components to call tRPC procedures directly without HTTP round-trips. The current app has no Server Component data fetching — all pages are client components using React Query hooks.
