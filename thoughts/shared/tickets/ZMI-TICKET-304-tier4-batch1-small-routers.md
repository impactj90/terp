# ZMI-TICKET-304: Extract Services — Tier 4 Batch 1 (Small Routers)

Status: Todo
Priority: P1
Depends on: ZMI-TICKET-303

## Goal
Extract service + repository layers for the smallest routers: health, permissions, auth, auditLogs, dailyAccountValues. Move these routers from `src/server/routers/` to `src/trpc/routers/`.

## Pattern
For each router, follow the workbook service+repository pattern:

1. **Repository** (`src/lib/services/{domain}-repository.ts`): Pure Prisma queries. All functions accept `prisma: PrismaClient` and `tenantId: string` as first params.
2. **Service** (`src/lib/services/{domain}-service.ts`): Business logic, validation, permission checks. Calls repository. Defines typed error classes.
3. **Router** (`src/trpc/routers/{domain}.ts`): Thin wrapper — Zod input validation, call service, use `handleServiceError`.

## Routers

### health.ts (~35 lines)
- **Special case:** No service/repo needed — too trivial
- Just move to `src/trpc/routers/health.ts`
- Update import of `createTRPCRouter`, `publicProcedure` from `@/trpc/init`

### permissions.ts (~40 lines)
- **Special case:** Query-only, reads from permission catalog
- Create `src/lib/services/permission-service.ts` (resolves user permissions)
- No repository needed (reads from catalog, not DB)
- Move router to `src/trpc/routers/permissions.ts`

### auth.ts (~128 lines)
- Contains: login (Supabase), me (get current user), logout
- Create `src/lib/services/auth-service.ts`:
  - `getCurrentUser(prisma, userId)` — fetch user with relations
  - `login(prisma, supabase, credentials)` — authenticate
  - Error classes: `AuthenticationError`, `UserNotFoundError`
- Create `src/lib/services/auth-repository.ts`:
  - `findUserById(prisma, userId)` — user with userGroup, employee
  - `findUserByEmail(prisma, email)`
- Move router to `src/trpc/routers/auth.ts`

### auditLogs.ts (~201 lines)
- Contains: list (paginated with filters)
- Create `src/lib/services/audit-log-repository.ts`:
  - `findMany(prisma, tenantId, params)` — paginated query with filters
  - `count(prisma, tenantId, params)` — total count for pagination
- Create `src/lib/services/audit-log-service.ts`:
  - `list(prisma, tenantId, params)` — calls repo, returns paginated result
- Move router to `src/trpc/routers/auditLogs.ts`

### dailyAccountValues.ts (~158 lines)
- Contains: list (read-only queries)
- Create `src/lib/services/daily-account-value-repository.ts`:
  - `findMany(prisma, tenantId, params)` — query with date range + employee filter
- Create `src/lib/services/daily-account-value-service.ts`:
  - `list(prisma, tenantId, params)`
- Move router to `src/trpc/routers/dailyAccountValues.ts`

## For Each Router — Checklist
- [ ] Create repository file (if needed)
- [ ] Create service file with error classes
- [ ] Rewrite router as thin wrapper using `handleServiceError`
- [ ] Move router to `src/trpc/routers/`
- [ ] Update `src/trpc/routers/_app.ts` import path
- [ ] Delete old file from `src/server/routers/`
- [ ] Run `make typecheck`

## Files Created
- `src/lib/services/auth-service.ts`
- `src/lib/services/auth-repository.ts`
- `src/lib/services/audit-log-service.ts`
- `src/lib/services/audit-log-repository.ts`
- `src/lib/services/daily-account-value-service.ts`
- `src/lib/services/daily-account-value-repository.ts`
- `src/lib/services/permission-service.ts`

## Files Moved
- `src/server/routers/health.ts` → `src/trpc/routers/health.ts`
- `src/server/routers/permissions.ts` → `src/trpc/routers/permissions.ts`
- `src/server/routers/auth.ts` → `src/trpc/routers/auth.ts`
- `src/server/routers/auditLogs.ts` → `src/trpc/routers/auditLogs.ts`
- `src/server/routers/dailyAccountValues.ts` → `src/trpc/routers/dailyAccountValues.ts`

## Verification
```bash
make typecheck
make test
```
