# AI Assistant Feature — Codebase Research

**Date:** 2026-04-02
**Purpose:** Document all existing patterns relevant to implementing an in-app AI assistant that answers user questions about the Terp handbook using the Anthropic API with prompt caching (no RAG).

---

## 1. tRPC Router Pattern

### Router File Structure

Routers live in `src/trpc/routers/`. Each router file follows a consistent pattern:
1. Imports (zod, tRPC init, middleware, service)
2. Permission constants
3. Output/input Zod schemas
4. Router definition with procedures

**Simple router example** — `src/trpc/routers/health.ts`:

```ts
import { z } from "zod"
import { createTRPCRouter, publicProcedure } from "@/trpc/init"

export const healthRouter = createTRPCRouter({
  check: publicProcedure
    .output(
      z.object({
        status: z.string(),
        timestamp: z.string(),
      })
    )
    .query(async ({ ctx }) => {
      try {
        await ctx.prisma.$queryRaw`SELECT 1`
      } catch {
        // ...
      }
      return {
        status: "ok",
        timestamp: new Date().toISOString(),
      }
    }),
})
```

**Typical CRUD router** — `src/trpc/routers/tenantModules.ts`:

```ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as tenantModuleService from "@/lib/services/tenant-module-service"

const SETTINGS_MANAGE = permissionIdByKey("settings.manage")!

export const tenantModulesRouter = createTRPCRouter({
  list: tenantProcedure
    .output(z.object({ modules: z.array(moduleOutputSchema) }))
    .query(async ({ ctx }) => {
      try {
        const modules = await tenantModuleService.list(ctx.prisma, ctx.tenantId!)
        return { modules }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  enable: tenantProcedure
    .use(requirePermission(SETTINGS_MANAGE))
    .input(z.object({ module: z.string() }))
    .output(moduleOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await tenantModuleService.enable(
          ctx.prisma, ctx.tenantId!, input.module, ctx.user!.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
```

### Router Registration

All routers are registered in `src/trpc/routers/_app.ts`:

```ts
import { createTRPCRouter, createCallerFactory } from "../init"
import { healthRouter } from "./health"
import { auditLogsRouter } from "./auditLogs"
// ... 80+ imports

export const appRouter = createTRPCRouter({
  health: healthRouter,
  auditLogs: auditLogsRouter,
  // ... 80+ entries
})

export type AppRouter = typeof appRouter
export const createCaller = createCallerFactory(appRouter)
```

Sub-routers (warehouse, billing, crm) are nested:

```ts
// src/trpc/routers/warehouse/index.ts
import { createTRPCRouter } from "@/trpc/init"
import { whArticlesRouter } from "./articles"
// ...
export const warehouseRouter = createTRPCRouter({
  articles: whArticlesRouter,
  // ...
})
```

### tRPC Init — `src/trpc/init.ts`

Provides:
- **`TRPCContext`** — `{ prisma, authToken, user, session, tenantId, ipAddress, userAgent }`
- **`createTRPCContext()`** — Resolves Supabase auth, loads user with relations
- **`publicProcedure`** — No auth required
- **`protectedProcedure`** — Requires auth (user + session non-null)
- **`tenantProcedure`** — Requires auth + tenant ID + user has access to tenant
- **`createTRPCRouter`** — Router factory
- **`createMiddleware`** — Middleware factory
- **`ContextUser`** type — `PrismaUser & { userGroup: UserGroup | null, userTenants: (UserTenant & { tenant: Tenant })[] }`

Key context fields available in routers:
- `ctx.prisma` — Prisma client
- `ctx.user` — Full user with userGroup and userTenants (non-null in protected/tenant procedures)
- `ctx.tenantId` — Tenant ID string (non-null in tenant procedures)
- `ctx.ipAddress` — Client IP from X-Forwarded-For
- `ctx.userAgent` — Client User-Agent header

### Error Handling — `src/trpc/errors.ts`

```ts
export function handleServiceError(err: unknown): never {
  // Maps service error class names to tRPC codes:
  // *NotFoundError      -> NOT_FOUND
  // *ValidationError    -> BAD_REQUEST
  // *InvalidError       -> BAD_REQUEST
  // *ConflictError      -> CONFLICT
  // *DuplicateError     -> CONFLICT
  // *ForbiddenError     -> FORBIDDEN
  // *AccessDeniedError  -> FORBIDDEN
  // Prisma P2025        -> NOT_FOUND
  // Prisma P2002        -> CONFLICT
  // Prisma P2003        -> BAD_REQUEST
  // Fallback            -> INTERNAL_SERVER_ERROR
}
```

---

## 2. Service + Repository Pattern

### File Naming Convention

In `src/lib/services/`:
- `{feature}-service.ts` — Business logic
- `{feature}-repository.ts` — Prisma data access

### Service Structure

Services are **stateless module exports** (not classes). They receive `prisma: PrismaClient` as the first argument.

**Example** — `src/lib/services/users-service.ts`:

```ts
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./users-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Error Classes ---
export class UserNotFoundError extends Error {
  constructor(message = "User not found") {
    super(message)
    this.name = "UserNotFoundError"
  }
}

export class UserValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UserValidationError"
  }
}

// --- Service Functions ---
export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: { search?: string; limit?: number }
) {
  return repo.findMany(prisma, tenantId, params)
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: { ... },
  audit: AuditContext
) {
  // Validation logic
  // Create via repo
  const user = await repo.create(prisma, { ... })
  // Audit log (fire-and-forget)
  await auditLog.log(prisma, {
    tenantId, userId: audit.userId, action: "create",
    entityType: "user", entityId: user.id,
    entityName: user.displayName || user.email,
    changes: null,
    ipAddress: audit.ipAddress, userAgent: audit.userAgent,
  }).catch(err => console.error('[AuditLog] Failed:', err))
  return user
}
```

**Error class naming convention** — Error classes end with `NotFoundError`, `ValidationError`, `ForbiddenError`, `ConflictError`. The class name suffix is matched by `handleServiceError`.

### How Services Interact with Prisma

Services never call Prisma directly. They import `* as repo from "./{feature}-repository"` and delegate all database access to repository functions. The `prisma` client is passed through from the tRPC context.

---

## 3. Audit Log System

### Implementation Files

- **Repository:** `src/lib/services/audit-logs-repository.ts`
- **Service:** `src/lib/services/audit-logs-service.ts`
- **Router (read-only):** `src/trpc/routers/auditLogs.ts`

### AuditLog Prisma Schema

```prisma
model AuditLog {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  userId      String?  @map("user_id") @db.Uuid
  action      String   @db.VarChar(20)      // "create", "update", "delete"
  entityType  String   @map("entity_type") @db.VarChar(100)  // "user", "booking", etc.
  entityId    String   @map("entity_id") @db.Uuid
  entityName  String?  @map("entity_name") @db.Text
  changes     Json?    @db.JsonB            // { field: { old: val, new: val } }
  metadata    Json?    @db.JsonB
  ipAddress   String?  @map("ip_address") @db.Text
  userAgent   String?  @map("user_agent") @db.Text
  performedAt DateTime @default(now()) @map("performed_at") @db.Timestamptz(6)
  user        User?    @relation(...)
  @@map("audit_logs")
}
```

### AuditContext Interface

```ts
export interface AuditContext {
  userId: string
  ipAddress?: string | null
  userAgent?: string | null
}
```

### AuditLogCreateInput

```ts
export interface AuditLogCreateInput {
  tenantId: string
  userId: string | null
  action: string          // "create" | "update" | "delete"
  entityType: string      // e.g. "user", "tenant_module", "booking"
  entityId: string
  entityName?: string | null
  changes?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  ipAddress?: string | null
  userAgent?: string | null
}
```

### How Audit Logs Are Written

From services — **fire-and-forget, never throws**:

```ts
import * as auditLog from "./audit-logs-service"

// Inside a service function:
await auditLog.log(prisma, {
  tenantId,
  userId: audit.userId,
  action: "create",
  entityType: "tenant_module",
  entityId: row.id ?? module,
  entityName: module,
  changes: null,
  ipAddress: audit.ipAddress,
  userAgent: audit.userAgent,
}).catch(err => console.error('[AuditLog] Failed:', err))
```

The `log()` function itself also has internal try/catch — double safety:

```ts
export async function log(prisma: PrismaClient, data: AuditLogCreateInput): Promise<void> {
  try {
    await repo.create(prisma, data)
  } catch (err) {
    console.error("[AuditLog] Failed to write audit log:", err, { ... })
  }
}
```

### Passing AuditContext from Router to Service

Routers construct the AuditContext from `ctx`:

```ts
{ userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
```

### computeChanges Utility

For update operations, services use `computeChanges(before, after, fieldsToTrack?)` to diff records and store the changes JSON.

---

## 4. Module System (TenantModule)

### Definition — `src/lib/modules/constants.ts`

```ts
export const AVAILABLE_MODULES = ["core", "crm", "billing", "warehouse"] as const
export type ModuleId = (typeof AVAILABLE_MODULES)[number]
```

### Module Guard — `src/lib/modules/index.ts`

```ts
import { TRPCError } from "@trpc/server"
import { createMiddleware } from "@/trpc/init"

// Check if module is enabled for tenant
export async function hasModule(prisma, tenantId, module): Promise<boolean>

// tRPC middleware — throws FORBIDDEN if module not enabled
export function requireModule(module: string) {
  return createMiddleware(async ({ ctx, next }) => {
    // "core" always passes
    // Otherwise checks tenantModule table
    // Throws FORBIDDEN if not enabled
  })
}
```

### Usage in Routers

Module-gated routers create a derived procedure:

```ts
// src/trpc/routers/billing/documents.ts
import { requireModule } from "@/lib/modules"
const billingProcedure = tenantProcedure.use(requireModule("billing"))

// Then use billingProcedure instead of tenantProcedure:
billingProcedure.input(...).query(...)
```

### "core" Module

The "core" module is **always enabled** and **cannot be disabled**. It covers the base ERP functionality (employees, time tracking, absences, etc.). Non-core modules (crm, billing, warehouse) must be explicitly enabled per tenant.

---

## 5. Auth & Middleware

### Files

- `src/lib/auth/permissions.ts` — `hasPermission`, `hasAnyPermission`, `isUserAdmin`, `resolvePermissions`
- `src/lib/auth/middleware.ts` — `requirePermission`, `requireSelfOrPermission`, `requireEmployeePermission`, `applyDataScope`
- `src/lib/auth/permission-catalog.ts` — 101 permissions with deterministic UUIDs

### Available Middleware

1. **`requirePermission(...permissionIds)`** — Checks user has ANY of the listed permissions. Admin users pass all checks.
   ```ts
   .use(requirePermission(USERS_MANAGE, REPORTS_VIEW))
   ```

2. **`requireSelfOrPermission(userIdGetter, permissionId)`** — Allows self-access or requires permission.
   ```ts
   .use(requireSelfOrPermission((input) => (input as { userId: string }).userId, USERS_MANAGE))
   ```

3. **`requireEmployeePermission(employeeIdGetter, ownPermission, allPermission)`** — Own vs all employee-scoped access with team-based read sharing.

4. **`applyDataScope()`** — Adds `DataScope` object to context for Prisma query filtering.

### Permission Catalog

`src/lib/auth/permission-catalog.ts` contains 101 permissions. Key helper:

```ts
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
const SETTINGS_MANAGE = permissionIdByKey("settings.manage")!
```

### Accessing User/Tenant in Routers

After `tenantProcedure`:
- `ctx.user` — `ContextUser` (non-null, includes `userGroup`, `userTenants`)
- `ctx.user.id` — User UUID
- `ctx.tenantId` — Tenant UUID (non-null)
- `ctx.session` — Supabase session
- `ctx.ipAddress` / `ctx.userAgent` — Request metadata

---

## 6. Frontend Patterns

### UI Library

- **shadcn/ui** (Radix primitives + Tailwind CSS)
- Components in `src/components/ui/`: button, dialog, sheet, popover, card, table, tabs, input, select, badge, tooltip, dropdown-menu, etc.
- **Tailwind CSS** for styling with `cn()` utility from `src/lib/utils`
- **Lucide React** for icons
- **sonner** for toast notifications
- **cmdk** for command palette

### Component Structure

`src/components/` organized by feature:
```
src/components/
  ui/           -> Reusable primitives (shadcn/ui)
  layout/       -> App layout, sidebar, header, command-menu
  employees/    -> Employee-specific components
  bookings/     -> Booking-specific components
  billing/      -> Billing components
  crm/          -> CRM components
  hilfe/        -> Handbook/help page
  dashboard/    -> Dashboard components
  forms/        -> Shared form components
  ...
```

### Hook Pattern (tRPC)

Hooks in `src/hooks/` wrap tRPC calls using `useTRPC()` context.

**Query hook example** — `src/hooks/use-audit-logs.ts`:

```ts
import { useTRPC } from "@/trpc"
import { useQuery } from "@tanstack/react-query"

export function useAuditLogs(options: UseAuditLogsOptions = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.auditLogs.list.queryOptions(
      Object.keys(input).length > 0 ? input : undefined,
      { enabled }
    )
  )
}
```

**Mutation hook example** — `src/hooks/use-bookings.ts`:

```ts
import { useTRPC } from "@/trpc"
import { useMutation, useQueryClient } from "@tanstack/react-query"

export function useCreateBooking() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.bookings.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.bookings.list.queryKey(),
      })
    },
  })
}
```

**Module hook example** — `src/hooks/use-modules.ts`:

```ts
export function useModules(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.tenantModules.list.queryOptions(undefined, {
      enabled,
      staleTime: 5 * 60 * 1000,
    })
  )
}
```

### Hook Index

All hooks are re-exported from `src/hooks/index.ts` as a barrel file.

### tRPC Client Setup — `src/trpc/client.tsx`

The `TRPCReactProvider` wraps the app with:
- `QueryClientProvider` (TanStack React Query)
- `TRPCProvider` (typed tRPC context)
- `httpBatchLink` for queries/mutations
- `httpSubscriptionLink` (SSE) for subscriptions
- Auth headers injected via `getHeaders()` (Supabase session + tenant ID)
- Global mutation error handler: toast.error with TRPCClientError message

### tRPC Context — `src/trpc/context.ts`

```ts
import { createTRPCContext } from "@trpc/tanstack-react-query"
import type { AppRouter } from "@/trpc/routers/_app"

export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>()
```

### Floating/Overlay UI Components

Available in `src/components/ui/`:

- **Dialog** (`dialog.tsx`) — Radix Dialog, used for modals. Used by command menu.
- **Sheet** (`sheet.tsx`) — Radix Dialog as slide-out panel (right/left/top/bottom). Used throughout for create/edit forms.
- **Popover** (`popover.tsx`) — Radix Popover for floating content anchored to a trigger.
- **Dropdown Menu** (`dropdown-menu.tsx`) — Radix DropdownMenu.
- **Confirm Dialog** (`confirm-dialog.tsx`) — Delete/action confirmation.

**Command Menu** (`src/components/layout/command-menu.tsx`) is an example of a floating overlay:
- Triggered by Cmd+K
- Uses Dialog + cmdk library
- Fixed positioning, centered overlay

### Markdown Rendering

The app already renders markdown via `react-markdown` + `remark-gfm`.

**Dependencies** (from `package.json`):
```
"react-markdown": "^10.1.0",
"remark-gfm": "^4.0.1",
```

**Implementation** — `src/components/hilfe/hilfe-page.tsx`:

Full markdown rendering with custom components for headings, tables, code blocks, blockquotes, lists. Uses `memo()` for performance:

```tsx
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const markdownComponents = {
  h1: createHeading(1),
  h2: createHeading(2),
  // ... table, code, blockquote, list components
  p: ({ children }) => <p className="my-3 leading-7">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
}

const MemoizedMarkdown = memo(function MemoizedMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {content}
    </ReactMarkdown>
  )
})
```

---

## 7. Rate Limiting

**No rate limiting exists in the codebase.** A search for `rate.?limit` across all of `src/` returned zero results.

---

## 8. Environment Config — `src/lib/config.ts`

```ts
// Server-side only
export const serverEnv = {
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
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
```

**Current `.env.example`:**
```
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from pnpm db:start>
SUPABASE_SERVICE_ROLE_KEY=<from pnpm db:start>
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
CRON_SECRET=<random-secret>
INTERNAL_API_KEY=<random-secret>
NEXT_PUBLIC_ENV=development
NEXT_PUBLIC_APP_NAME=Terp
```

No `ANTHROPIC_API_KEY` or similar AI-related env vars exist yet.

---

## 9. Existing Handbook File

**File:** `docs/TERP_HANDBUCH.md` (note: NOT `TERP_HANDBUCH_V2.md`)

- **Lines:** 8,699
- **Size:** ~464 KB (~454 KB of text content)
- **Language:** German
- **Format:** Markdown with GFM tables
- **Title:** "Terp -- Benutzerhandbuch (V2)"

First lines:
```
# Terp — Benutzerhandbuch (V2)

Dieses Handbuch erklärt jede Funktion von Terp und zeigt genau, wo sie in der
Anwendung zu finden ist. Es dient gleichzeitig als **Prüfliste**: Jeder Abschnitt
kann geöffnet, durchgeklickt und verifiziert werden.
```

This file is already rendered in the Hilfe (Help) page at `src/components/hilfe/hilfe-page.tsx`.

---

## Summary of Patterns to Follow

| Area | Pattern |
|------|---------|
| **New router** | Create `src/trpc/routers/aiAssistant.ts`, import `tenantProcedure`, `handleServiceError`, register in `_app.ts` |
| **New service** | Create `src/lib/services/ai-assistant-service.ts` with stateless exports, `prisma` as first arg |
| **Procedure type** | Use `tenantProcedure` (requires auth + tenant) |
| **Permissions** | Use `requirePermission()` if needed, or skip if all authenticated users get access |
| **Audit logging** | Use `auditLog.log()` fire-and-forget with `.catch()` |
| **Error handling** | Define `*ValidationError` etc. in service, wrap router calls in `try/catch` + `handleServiceError` |
| **Frontend hook** | Create `src/hooks/use-ai-assistant.ts`, use `useTRPC()` + `useMutation()` |
| **UI component** | Use shadcn/ui primitives (Sheet, Dialog, or Popover), Tailwind, Lucide icons |
| **Markdown rendering** | Reuse `react-markdown` + `remark-gfm` (already installed) |
| **Env vars** | Add `ANTHROPIC_API_KEY` to `serverEnv` in `src/lib/config.ts` and to `validateEnv()` required list |
| **Module guard** | If AI is a separate module, use `requireModule("ai")`. If core, no guard needed. |

### Gotchas and Conventions

1. **Handbook filename** is `docs/TERP_HANDBUCH.md`, not `docs/TERP_HANDBUCH_V2.md`. The user message references V2 but only the non-V2 file exists. The file title says "(V2)" but the filename does not.

2. **No Anthropic SDK is installed yet.** `package.json` has no `@anthropic-ai/sdk` or similar dependency.

3. **No rate limiting** exists anywhere in the codebase. The AI assistant will need its own rate limiting to prevent abuse.

4. **Services are stateless module exports**, not classes. Functions receive `prisma` as the first argument.

5. **Error class names drive error mapping.** The suffix (`NotFoundError`, `ValidationError`, etc.) is matched by string in `handleServiceError`. New error classes must follow this convention.

6. **Audit logs are fire-and-forget.** Always use `.catch()` at the call site AND the `log()` function has internal error handling. Never let audit failures break business operations.

7. **Frontend hooks** use the `useTRPC()` context pattern (not direct imports from tRPC client). Query options come from `trpc.{router}.{procedure}.queryOptions()`.

8. **Markdown rendering** is already available. The `hilfe-page.tsx` component has a complete set of styled markdown components that could be extracted/reused.

9. **The handbook is ~464 KB.** This is well within Anthropic's prompt caching limits (the cached system prompt approach is viable).

10. **tRPC context provides `ipAddress` and `userAgent`** which are needed for audit logging. These are extracted from request headers in `createTRPCContext`.
