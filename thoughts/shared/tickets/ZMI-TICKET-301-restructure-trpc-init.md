# ZMI-TICKET-301: Restructure tRPC Initialization

Status: Todo
Priority: P0
Depends on: ZMI-TICKET-300

## Goal
Move tRPC server initialization from `src/server/trpc.ts` to `src/trpc/init.ts` and root router from `src/server/root.ts` to `src/trpc/routers/_app.ts`. Create `src/trpc/errors.ts` for centralized error handling. Rename client files to match workbook naming conventions.

## Scope
- **In scope:**
  - Move & rename tRPC init file
  - Move root router to `_app.ts`
  - Create `errors.ts` with `handleServiceError()`
  - Rename client files (provider.tsx → client.tsx, server.ts → server.tsx)
  - Update ALL imports across the codebase
- **Out of scope:**
  - Moving individual router files (Phase 1 tickets)
  - Service extraction (Phase 1 tickets)

## Implementation Steps

### 1. Create `src/trpc/init.ts`
Move content from `src/server/trpc.ts` (225 lines). This contains:
- `createTRPCContext` — context factory (auth, tenant, prisma)
- `publicProcedure`, `protectedProcedure`, `tenantProcedure`
- tRPC initialization with Zod error formatting
- Auth token extraction from headers/connection params
- Supabase session validation

**Key change:** Update internal imports within the file (e.g., `../lib/db/prisma` may need to become `@/lib/db/prisma`).

### 2. Create `src/trpc/routers/_app.ts`
Move content from `src/server/root.ts` (158 lines). This contains:
- Import of all 68 sub-routers
- `appRouter` creation merging all sub-routers
- `AppRouter` type export
- `createCaller` factory export

**Important:** During this ticket, sub-routers are still at `@/server/routers/*`. The imports in `_app.ts` will temporarily point to the old location. Phase 1 tickets will update these as each router moves.

### 3. Create `src/trpc/errors.ts`
New file matching workbook pattern:
```typescript
import { TRPCError } from '@trpc/server'

export function handleServiceError(err: unknown): never {
  if (err && typeof err === 'object' && 'name' in err) {
    const name = (err as Error).name
    if (name.endsWith('NotFoundError')) {
      throw new TRPCError({ code: 'NOT_FOUND', message: (err as Error).message })
    }
    if (name === 'PermissionDeniedError' || name === 'ForbiddenError') {
      throw new TRPCError({ code: 'FORBIDDEN', message: (err as Error).message })
    }
    if (name.endsWith('ValidationError') || name.endsWith('InvalidError')) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: (err as Error).message })
    }
    if (name === 'ConflictError' || name.endsWith('ExistsError')) {
      throw new TRPCError({ code: 'CONFLICT', message: (err as Error).message })
    }
  }
  throw err
}
```
This will be expanded as service errors are defined in Phase 1 tickets.

### 4. Rename client files
- `src/trpc/provider.tsx` → `src/trpc/client.tsx`
- `src/trpc/server.ts` → `src/trpc/server.tsx`
- Keep `src/trpc/context.ts` as-is (already correct)
- Extract QueryClient config into `src/trpc/query-client.ts` if not already separate

### 5. Delete old files
- Delete `src/server/trpc.ts`
- Delete `src/server/root.ts`
- Delete `src/server/index.ts` (barrel export)

### 6. Update all imports
Search and replace across the entire codebase:

| Old import | New import |
|------------|------------|
| `@/server/trpc` | `@/trpc/init` |
| `@/server/root` | `@/trpc/routers/_app` |
| `@/server` (barrel) | Individual imports from `@/trpc/init` or `@/trpc/routers/_app` |
| `@/trpc/provider` | `@/trpc/client` |
| `@/trpc/server` | `@/trpc/server` (same name but .tsx extension) |

**Files that import from `@/server/trpc` (ALL 68 routers + middleware + services):**
Every router file imports `createTRPCRouter`, `tenantProcedure`, `protectedProcedure` from `@/server/trpc`. These must all be updated to `@/trpc/init`.

**Files that import from `@/server/root`:**
- `src/app/api/trpc/[trpc]/route.ts`
- `src/trpc/context.ts`
- Any test files using `createCaller`

**Files that import from `@/trpc/provider`:**
- `src/app/[locale]/(dashboard)/layout.tsx` or similar layout files

### 7. Update API route handler
`src/app/api/trpc/[trpc]/route.ts` — update imports to use `@/trpc/routers/_app` and `@/trpc/init`.

## Verification
```bash
make typecheck   # All type errors resolved
make lint        # No new errors
make test        # Tests pass
make build       # Builds successfully
```

## Files Created
- `src/trpc/init.ts`
- `src/trpc/routers/_app.ts`
- `src/trpc/errors.ts`
- `src/trpc/query-client.ts` (if extracted)

## Files Deleted
- `src/server/trpc.ts`
- `src/server/root.ts`
- `src/server/index.ts`

## Files Renamed
- `src/trpc/provider.tsx` → `src/trpc/client.tsx`
- `src/trpc/server.ts` → `src/trpc/server.tsx`

## Files Modified (imports only)
- All 68 router files in `src/server/routers/`
- `src/server/middleware/authorization.ts`
- `src/app/api/trpc/[trpc]/route.ts`
- `src/trpc/context.ts`
- Layout files importing provider
- All cron route files
- Test files
