# ZMI-TICKET-326: Final Cleanup — Delete src/server/ + Documentation

Status: Todo
Priority: P1
Depends on: ALL Phase 1 tickets (304-324) + ZMI-TICKET-325

## Goal
Final cleanup: verify all routers have been moved, delete the old `src/server/` directory, update documentation, and do a full verification pass.

## Implementation Steps

### 1. Verify all routers moved
Check that `src/server/routers/` is empty (all files moved to `src/trpc/routers/`):
```bash
ls src/server/routers/  # Should be empty or not exist
```

### 2. Verify `_app.ts` imports
`src/trpc/routers/_app.ts` should import ALL routers from relative paths:
```typescript
import { employeesRouter } from './employees'  // Not @/server/routers/employees
```

### 3. Delete `src/server/` entirely
```bash
rm -rf src/server/
```
This directory should be completely empty after all Phase 0 + Phase 1 tickets.

### 4. Verify no remaining references to old paths
Search for any remaining imports to old paths:
```bash
grep -r "@/server/" src/    # Should return 0 results
grep -r "hooks/api/" src/   # Should return 0 results
grep -r "config/env" src/   # Should return 0 results
```

### 5. Move test files
Ensure all test files are in their new locations:
- `src/trpc/routers/__tests__/` — router tests
- `src/lib/services/__tests__/` — service tests
- `src/lib/calculation/__tests__/` — calculation tests (if moved)

### 6. Update CLAUDE.md
Update the architecture section:
```markdown
## Architecture

Next.js App Router with tRPC:

src/trpc/routers/     -> tRPC routers (thin wrappers, input validation)
src/trpc/init.ts      -> tRPC context, router factory, middleware
src/trpc/routers/_app.ts -> Root router (merges all sub-routers)
src/trpc/errors.ts    -> Centralized error handling
src/trpc/client.tsx   -> React tRPC client provider
src/trpc/server.tsx   -> Server-side tRPC caller
src/lib/services/     -> Business logic (services) + data access (repositories)
src/lib/auth/         -> Auth, permissions, authorization middleware
src/lib/db/           -> Prisma client setup
src/lib/config.ts     -> Environment configuration
src/app/api/trpc/     -> Next.js API route handler for tRPC
src/app/api/cron/     -> Vercel Cron job routes
src/hooks/            -> React hooks wrapping tRPC queries/mutations
src/components/       -> React components (UI)
src/providers/        -> Context providers (auth, tenant, theme)
prisma/schema.prisma  -> Database schema (Prisma)
```

### 7. Update AGENTS.md
If it exists, update with new structure.

### 8. Update Makefile
Verify all commands still work with the final structure.

### 9. Full verification
```bash
make typecheck   # No type errors
make lint        # No lint errors
make test        # All tests pass
make build       # Next.js builds
make dev         # Dev server starts and pages load
```

### 10. Verify no circular dependencies
```bash
# Check for any circular import issues
npx madge --circular src/
```

## Checklist
- [ ] `src/server/` directory deleted
- [ ] No imports reference `@/server/`
- [ ] No imports reference `@/hooks/api/`
- [ ] No imports reference `@/config/env`
- [ ] All routers in `src/trpc/routers/`
- [ ] All services in `src/lib/services/`
- [ ] All auth in `src/lib/auth/`
- [ ] `_app.ts` imports all routers correctly
- [ ] CLAUDE.md updated
- [ ] `make typecheck` passes
- [ ] `make lint` passes
- [ ] `make test` passes
- [ ] `make build` passes
- [ ] `make dev` starts successfully
