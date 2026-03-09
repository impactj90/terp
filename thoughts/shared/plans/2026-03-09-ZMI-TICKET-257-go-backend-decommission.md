# Implementation Plan: ZMI-TICKET-257 Go Backend Decommission

## Overview

Remove the Go backend (`apps/api/`), OpenAPI spec (`api/`), legacy migrations (`db/migrations/`), Go-specific Docker/deploy infrastructure, and legacy frontend API client code. The project becomes a Next.js/tRPC monorepo with Prisma for DB management and Vercel for deployment.

## Critical Dependencies Identified

Before removing the legacy API client, these components must be addressed:

1. **`tenantIdStorage`** from `apps/web/src/lib/api/client.ts` is used by:
   - `apps/web/src/trpc/provider.tsx` (tRPC header forwarding)
   - `apps/web/src/providers/tenant-provider.tsx` (tenant selection/persistence)

2. **`authStorage`** from `apps/web/src/lib/api/client.ts` is used by:
   - `apps/web/src/providers/auth-provider.tsx` (session token caching)

3. **`type { components }` from `apps/web/src/lib/api/types.ts`** is used by 150 component/page files for type definitions (e.g., `components['schemas']['Employee']`).

4. **`tenant-provider.tsx`** still uses `useApiQuery` from the legacy hooks to fetch tenants via the Go backend's `/tenants` endpoint.

5. **4 legacy hook files** still use `useApiQuery`/`useApiMutation`:
   - `use-accounts.ts`, `use-account-groups.ts`, `use-contact-types.ts`, `use-contact-kinds.ts`

6. **`team-upcoming-absences.tsx`** directly imports `api` from `@/lib/api` to make Go backend REST calls.

---

## Phase 1: Migrate Remaining Legacy Hooks to tRPC

**Goal:** Eliminate all runtime dependencies on the Go backend before removing it.

### Step 1.1: Migrate `tenant-provider.tsx` off `useApiQuery`
- **File:** `apps/web/src/providers/tenant-provider.tsx`
- **Action:** Replace `useApiQuery` with the tRPC `tenants.list` query
- **Current:** `import { useApiQuery } from '@/hooks'` + calls `useApiQuery('/tenants', ...)`
- **Target:** `import { useTRPC } from '@/trpc'` + use `trpc.tenants.list.queryOptions(...)`
- **Verification:** App loads, tenant selector works, tenant switching works

### Step 1.2: Migrate `use-accounts.ts` to tRPC
- **File:** `apps/web/src/hooks/api/use-accounts.ts`
- **Action:** Rewrite using `useTRPC()` pattern (tRPC router: `accounts` -- NOTE: there is no `accounts` tRPC router yet, so this hook file should be **removed** and any components using it need to be checked. If the router is missing, the hook was already dead code since the Go backend was the only provider.)
- **Verification:** Check if any component actually calls these hooks at runtime. If the tRPC router exists, migrate. If not, verify the hooks are dead code and remove.

### Step 1.3: Migrate `use-account-groups.ts` to tRPC
- **File:** `apps/web/src/hooks/api/use-account-groups.ts`
- **Action:** Same analysis as Step 1.2 -- check for tRPC router or mark as dead code
- **Verification:** Same as Step 1.2

### Step 1.4: Migrate `use-contact-types.ts` to tRPC
- **File:** `apps/web/src/hooks/api/use-contact-types.ts`
- **Action:** Same analysis -- check for tRPC router or mark as dead code
- **Verification:** Same as Step 1.2

### Step 1.5: Migrate `use-contact-kinds.ts` to tRPC
- **File:** `apps/web/src/hooks/api/use-contact-kinds.ts`
- **Action:** Same analysis -- check for tRPC router or mark as dead code
- **Verification:** Same as Step 1.2

### Step 1.6: Migrate `team-upcoming-absences.tsx` off direct `api` import
- **File:** `apps/web/src/components/team-overview/team-upcoming-absences.tsx`
- **Action:** Replace `import { api } from '@/lib/api'` + direct `api.GET(...)` calls with tRPC queries
- **Verification:** Team overview page loads, upcoming absences display correctly

### Phase 1 Verification
- [ ] `grep -r "useApiQuery\|useApiMutation" apps/web/src/ --include="*.ts" --include="*.tsx"` returns zero results (excluding the hook definition files themselves)
- [ ] `grep -r "from '@/lib/api'" apps/web/src/ --include="*.ts" --include="*.tsx"` returns only type imports and the files being removed in Phase 2
- [ ] `pnpm --filter web build` succeeds
- [ ] App starts and core flows work (login, tenant selection, navigation)

---

## Phase 2: Extract Shared Utilities from Legacy API Client

**Goal:** Move `tenantIdStorage` and `authStorage` to a non-legacy location so the entire `@/lib/api/` directory can be deleted.

### Step 2.1: Create `apps/web/src/lib/storage.ts`
- **Action:** Create new file with `authStorage` and `tenantIdStorage` (extracted from `apps/web/src/lib/api/client.ts`)
- **Contents:** Copy the `AuthTokenStorage` interface, `TenantStorage` interface, `authStorage` object, and `tenantIdStorage` object
- **Do NOT copy:** The `api` client, middleware, `ApiResponse` type, `ApiRequestBody` type

### Step 2.2: Update imports in consuming files
- **Files to update:**
  - `apps/web/src/providers/auth-provider.tsx`: Change `import { authStorage } from '@/lib/api/client'` to `import { authStorage } from '@/lib/storage'`
  - `apps/web/src/providers/tenant-provider.tsx`: Change `import { tenantIdStorage } from '@/lib/api/client'` to `import { tenantIdStorage } from '@/lib/storage'`
  - `apps/web/src/trpc/provider.tsx`: Change `import { tenantIdStorage } from '@/lib/api/client'` to `import { tenantIdStorage } from '@/lib/storage'`
- **Verification:** `pnpm --filter web build` succeeds

### Step 2.3: Handle `type { components }` imports across 150 files

This is the largest single migration task. The 150 files all import `type { components } from '@/lib/api/types'` to access schema types like `components['schemas']['Employee']`.

**Strategy options (choose one during implementation):**
- **Option A (Recommended): Keep `types.ts` in place temporarily** -- Move `apps/web/src/lib/api/types.ts` to `apps/web/src/lib/legacy-types.ts`, update all 150 imports. This is a mechanical find-and-replace. The types file is 22K lines but is pure type definitions with zero runtime impact.
- **Option B: Create Prisma-derived type aliases** -- Over time, replace `components['schemas']['X']` references with Prisma-generated types. This is a larger effort and should be a separate ticket.

**Recommended approach:** Option A for this ticket. Move the file, bulk-update imports. Create a follow-up ticket for Option B.

- **Action:**
  1. Move `apps/web/src/lib/api/types.ts` to `apps/web/src/types/legacy-api-types.ts`
  2. Find-and-replace across all 150 files: `from '@/lib/api/types'` -> `from '@/types/legacy-api-types'`
  3. Update `apps/web/src/providers/tenant-provider.tsx` (also imports `type { components }`)
- **Verification:** `pnpm --filter web typecheck` succeeds

### Phase 2 Verification
- [ ] `grep -r "from '@/lib/api" apps/web/src/ --include="*.ts" --include="*.tsx"` returns zero results
- [ ] `pnpm --filter web build` succeeds
- [ ] `pnpm --filter web typecheck` succeeds

---

## Phase 3: Remove Legacy Frontend Files

**Goal:** Delete all legacy API client infrastructure from the frontend.

### Step 3.1: Delete legacy API client files
- **Delete:**
  - `apps/web/src/lib/api/client.ts`
  - `apps/web/src/lib/api/errors.ts`
  - `apps/web/src/lib/api/index.ts`
  - `apps/web/src/lib/api/` directory (should be empty after moving types.ts in Phase 2)

### Step 3.2: Delete legacy hook infrastructure
- **Delete:**
  - `apps/web/src/hooks/use-api-query.ts`
  - `apps/web/src/hooks/use-api-mutation.ts`

### Step 3.3: Clean up `apps/web/src/hooks/index.ts`
- **File:** `apps/web/src/hooks/index.ts`
- **Action:** Remove the lines:
  ```typescript
  export { useApiQuery } from './use-api-query'
  export { useApiMutation } from './use-api-mutation'
  ```
- **Keep:** All other exports (useHasRole, useHasPermission, etc.)

### Step 3.4: Delete the 4 migrated legacy hook files (if migrated in Phase 1) or verify they were removed
- **Delete (if not already done in Phase 1):**
  - `apps/web/src/hooks/api/use-accounts.ts`
  - `apps/web/src/hooks/api/use-account-groups.ts`
  - `apps/web/src/hooks/api/use-contact-types.ts`
  - `apps/web/src/hooks/api/use-contact-kinds.ts`
- **Update:** `apps/web/src/hooks/api/index.ts` -- remove the export blocks for these 4 hook files

### Step 3.5: Remove legacy vacation balance invalidation
- **File:** `apps/web/src/hooks/api/use-vacation-balance.ts`
- **Action:** Remove the legacy query key invalidation lines (lines ~110-119 that invalidate `["/vacation-balances"]` patterns)

### Step 3.6: Clean up frontend env config
- **File:** `apps/web/src/config/env.ts`
  - Remove `apiUrl` from `serverEnv` object
  - Remove `apiUrl` from `clientEnv` object
  - Remove `'NEXT_PUBLIC_API_URL'` from the `required` array in `validateEnv()`
- **File:** `apps/web/.env.example`
  - Remove `API_URL=http://localhost:8080/api/v1` line
  - Remove `NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1` line

### Step 3.7: Clean up frontend package.json
- **File:** `apps/web/package.json`
  - Remove `"generate:api"` script
  - Remove `"openapi-fetch"` from dependencies
  - Remove `"openapi-typescript"` from devDependencies
- **Delete:** `apps/web/scripts/fix-api-types.mjs`

### Phase 3 Verification
- [ ] `pnpm --filter web build` succeeds
- [ ] `pnpm --filter web typecheck` succeeds
- [ ] No files in `apps/web/src/lib/api/` remain
- [ ] `grep -r "useApiQuery\|useApiMutation\|openapi-fetch" apps/web/src/` returns zero results
- [ ] `grep -r "localhost:8080" apps/web/src/` returns zero results

---

## Phase 4: Remove Go Backend and OpenAPI Spec

**Goal:** Delete the Go backend application and OpenAPI specification.

### Step 4.1: Delete Go backend
- **Delete directory:** `apps/api/` (807 files, includes all Go source, generated models, test binaries, coverage artifacts)

### Step 4.2: Delete OpenAPI spec
- **Delete directory:** `api/` (includes `openapi.yaml`, `paths/`, `schemas/`, `responses/`, bundled specs)

### Step 4.3: Delete Go workspace files
- **Delete files:**
  - `go.work`
  - `go.work.sum`
  - `.golangci.yml`

### Step 4.4: Delete legacy database migrations
- **Delete directory:** `db/migrations/` (178 SQL files)
- **Delete directory:** `db/` (parent, will be empty)

### Step 4.5: Delete Go deployment scripts
- **Delete directory:** `deploy/` (setup.sh, deploy.sh)

### Phase 4 Verification
- [ ] `ls apps/api` returns "No such file or directory"
- [ ] `ls api` returns "No such file or directory"
- [ ] `ls go.work` returns "No such file or directory"
- [ ] `ls db` returns "No such file or directory"
- [ ] `ls deploy` returns "No such file or directory"
- [ ] Repository still has all Next.js/tRPC/Prisma files intact

---

## Phase 5: Update Docker Infrastructure

**Goal:** Remove Go-specific Docker configuration while preserving the web service.

### Step 5.1: Delete Go-specific Docker files
- **Delete:**
  - `docker/api.dev.Dockerfile`
  - `docker/api.Dockerfile`
  - `docker/docker-compose.prod.yml` (entirely Go API + Caddy for Go API)
  - `docker/Caddyfile.prod` (reverse proxies to Go API only)

### Step 5.2: Update `docker/docker-compose.yml`
- **Remove:** Entire `api` service block (lines 1-18)
- **Update `web` service:** Remove `depends_on: - api`
- **Result:** Only `web` service and `web_node_modules` volume remain

### Step 5.3: Update `docker/docker-compose.demo.yml`
- **Remove:** The `api` service override block
- **Update `web` service:** Remove `NEXT_PUBLIC_API_URL=/api/v1` environment variable
- **Update `caddy` service:** Remove `depends_on: - api`, keep `depends_on: - web`
- **Keep:** `ngrok` service as-is

### Step 5.4: Update `docker/Caddyfile.demo`
- **Remove:** The `@frontend not path /api/* /swagger/*` line
- **Remove:** The `@backend path /api/* /swagger/*` block and its `handle @backend` reverse_proxy
- **Update:** Apply `basicauth` to all requests (or the single `handle` block)
- **Result:** All traffic goes to `web:3001`, basic auth protects everything

### Step 5.5: Decide on `docker/caddy-demo-entrypoint.sh`
- **Keep:** Still needed for the demo Caddy setup (generates password hash)

### Phase 5 Verification
- [ ] `docker compose -f docker/docker-compose.yml config` validates successfully
- [ ] `docker compose -f docker/docker-compose.yml -f docker/docker-compose.demo.yml config` validates successfully
- [ ] No references to `api:8080` or `terp-api` in any Docker file

---

## Phase 6: Update Makefile

**Goal:** Remove all Go-specific targets, update dev targets to reflect the new architecture.

### Step 6.1: Remove Go-specific variables
- **Remove:** `GOBIN = $(shell go env GOPATH)/bin`
- **Keep:** `DOCKER_COMPOSE`, `DOCKER_COMPOSE_DEMO`, `LOCAL_DB`

### Step 6.2: Remove Go-specific targets entirely
Remove these targets from the Makefile:
- `build` (builds Go Docker image)
- `test` (runs Go tests)
- `test-coverage` (Go test coverage)
- `lint` (golangci-lint)
- `fmt` (gofmt + goimports)
- `tidy` (go mod tidy)
- `swagger-bundle` (bundles OpenAPI spec)
- `generate` (generates Go models)
- `generate-web` (generates TypeScript types from OpenAPI)
- `generate-all` (runs generate + generate-web)
- `clean` (removes Go build artifacts)
- `install-tools` (installs Go tools)

### Step 6.3: Remove Go-specific production targets
Remove these targets:
- `prod-setup` (Hetzner VPS setup)
- `prod-deploy` (builds + deploys Go API)
- `prod-logs` (tails Go API logs on VPS)
- `prod-ssh` (SSH into VPS)

### Step 6.4: Update `dev-reset` target
- **Old:** `npx supabase db reset` + `$(DOCKER_COMPOSE) restart api`
- **New:** `npx supabase db reset` only (no API container to restart)

### Step 6.5: Update `dev-clean` target
- **Old:** Removes `terp-api`, `terp-web` containers
- **New:** Remove only `terp-web` container reference, remove `terp-api` reference

### Step 6.6: Update `demo-down` target
- **Old:** Force removes `terp-api terp-web terp-caddy terp-ngrok`
- **New:** Force removes `terp-web terp-caddy terp-ngrok` (remove `terp-api`)

### Step 6.7: Add new tRPC-era targets
Add these new targets:
```makefile
## test: Run Next.js tests
test: ## Run web app tests
	cd apps/web && pnpm test

## typecheck: Run TypeScript type checking
typecheck: ## Type-check the web app
	cd apps/web && pnpm typecheck

## lint: Run ESLint
lint: ## Lint the web app
	cd apps/web && pnpm lint

## build: Build the web app
build: ## Build the Next.js app
	cd apps/web && pnpm build

## db-generate: Generate Prisma client
db-generate: ## Regenerate Prisma client from schema
	cd apps/web && pnpm db:generate

## clean: Remove build artifacts
clean: ## Remove build artifacts and temp files
	rm -rf apps/web/.next
	rm -rf apps/web/out

## install: Install dependencies
install: ## Install all dependencies
	cd apps/web && pnpm install
```

### Step 6.8: Update `.PHONY` declaration
- **Action:** Update the `.PHONY` line to list only the remaining/new targets

### Step 6.9: Keep `prod-migrate` target
- **Keep as-is:** `prod-migrate` uses `npx supabase db push` which is still relevant

### Phase 6 Verification
- [ ] `make help` shows only relevant targets
- [ ] `make dev` works (starts Supabase + web service)
- [ ] `make dev-down` works
- [ ] `make db-start`, `make db-stop`, `make db-reset`, `make db-status` all work
- [ ] No references to Go, golangci-lint, gofmt, or go-swagger in Makefile

---

## Phase 7: Update `.gitignore`

**Goal:** Remove Go-specific entries, keep general and Next.js entries.

### Step 7.1: Remove Go-specific sections
- **Remove:**
  ```
  # Binaries
  *.exe
  *.exe~
  *.dll
  *.so
  *.dylib
  bin/
  dist/

  # Go build artifacts
  *.o
  *.a
  *.test
  *.out
  *.prof
  coverage.out
  coverage.html

  # Go workspace (optional - uncomment if you don't want to commit)
  # go.work
  # go.work.sum

  # Dependency directories
  vendor/

  # Generated OpenAPI bundle (regenerate with make swagger-bundle)
  # Uncomment if you prefer to regenerate rather than commit
  # api/openapi.bundled.yaml

  # Air (Go hot reload)
  tmp/
  ```

- **Keep (but update comment if needed):**
  ```
  # Temporary files
  tmp/
  ```
  (One `tmp/` entry is enough -- remove the "Air" duplicate)

### Phase 7 Verification
- [ ] `.gitignore` contains no Go-specific entries
- [ ] `.gitignore` still has Next.js, Prisma, env, IDE, and OS entries

---

## Phase 8: Update Documentation and Claude Commands

**Goal:** Rewrite `CLAUDE.md` and update Claude command templates.

### Step 8.1: Rewrite `CLAUDE.md`
Replace the entire file with content reflecting the current architecture:

```markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

Next.js monorepo with tRPC backend:

- `apps/web/` - Next.js app (tRPC API, Prisma ORM, Supabase Auth, PostgreSQL)
- `supabase/` - Supabase configuration and migrations
- `docker/` - Docker Compose dev environment

## Commands

```bash
make install          # Install dependencies
make dev              # Start Supabase + Docker services
make dev-down         # Stop Docker services (Supabase keeps running)
make dev-logs         # Follow logs
make dev-ps           # Check service status
make db-start         # Start Supabase (local Postgres + Studio)
make db-stop          # Stop Supabase
make db-reset         # Reset DB (drops all data, reruns migrations + seed)
make db-status        # Show Supabase connection info
make db-migrate-new name=foo  # Create new Supabase migration
make db-generate      # Regenerate Prisma client
make test             # Run tests
make lint             # Run ESLint
make typecheck        # Type-check with TypeScript
make build            # Build the Next.js app
```

Run single test: `cd apps/web && pnpm vitest run src/server/routers/__tests__/TestName.test.ts`

## Architecture

Next.js App Router with tRPC in `apps/web/`:

```
src/server/routers/   -> tRPC routers (business logic + data access)
src/server/trpc.ts    -> tRPC context, router factory, middleware
src/server/root.ts    -> Root router (merges all sub-routers)
src/app/api/trpc/     -> Next.js API route handler for tRPC
src/app/api/cron/     -> Vercel Cron job routes
src/hooks/api/        -> React hooks wrapping tRPC queries/mutations
src/components/       -> React components (UI)
src/providers/        -> Context providers (auth, tenant, theme)
src/trpc/             -> tRPC client hooks and provider
prisma/schema.prisma  -> Database schema (Prisma)
```

**Multi-tenancy**: tRPC context injects tenant from `x-tenant-id` header. Middleware validates access.

**Auth**: Supabase Auth with JWT. tRPC context extracts user from Supabase session.

**Database**: Prisma ORM with PostgreSQL (Supabase). Migrations via `supabase migration new`.

## Important

- All new backend logic goes in tRPC routers under `src/server/routers/`
- Use Prisma client for all database access (not raw SQL unless necessary)
- Frontend hooks that wrap tRPC calls go in `src/hooks/api/`
- Types come from Prisma generated client (`@prisma/client`) for DB models
- Legacy OpenAPI types exist in `src/types/legacy-api-types.ts` -- prefer Prisma types for new code
```

### Step 8.2: Update Claude command templates
- **Files:**
  - `.claude/commands/create_plan.md`
  - `.claude/commands/create_plan_nt.md`
  - `.claude/commands/create_plan_generic.md`
- **Action:** In each file, replace the verification section that references Go:
  - Remove: `- [ ] Database migration runs successfully: \`make migrate\``
  - Remove: `- [ ] All unit tests pass: \`go test ./...\``
  - Remove: `- [ ] No linting errors: \`golangci-lint run\``
  - Remove: `- [ ] API endpoint returns 200: \`curl localhost:8080/api/new-endpoint\``
  - Replace with:
    ```
    - [ ] TypeScript types pass: `pnpm --filter web typecheck`
    - [ ] Tests pass: `pnpm --filter web test`
    - [ ] Build succeeds: `pnpm --filter web build`
    ```

### Step 8.3: Update `apps/web/README.md`
- **Action:** Remove references to `API_URL` and `NEXT_PUBLIC_API_URL` pointing to Go backend

### Phase 8 Verification
- [ ] `CLAUDE.md` accurately describes the tRPC architecture
- [ ] No references to Go, Chi router, GORM, OpenAPI, or `localhost:8080` in any `.md` file under `.claude/commands/`
- [ ] `grep -r "localhost:8080" . --include="*.md"` returns only files in `thoughts/` (historical records)

---

## Phase 9: Final Verification

### Step 9.1: Full build verification
```bash
cd apps/web && pnpm install && pnpm build
```

### Step 9.2: Type check
```bash
cd apps/web && pnpm typecheck
```

### Step 9.3: Test suite
```bash
cd apps/web && pnpm test
```

### Step 9.4: Grep for any remaining Go backend references in active code
```bash
# Should return no results (excluding thoughts/ and .git/)
grep -r "localhost:8080\|apps/api\|go-swagger\|golangci\|goimports\|openapi-fetch" \
  --include="*.ts" --include="*.tsx" --include="*.yml" --include="*.yaml" \
  --include="*.json" --include="Makefile" --include="*.md" \
  --exclude-dir=thoughts --exclude-dir=.git --exclude-dir=node_modules .
```

### Step 9.5: Verify Docker compose
```bash
docker compose -f docker/docker-compose.yml config
```

### Step 9.6: Verify Makefile
```bash
make help
```

---

## Summary of Deletions

### Directories (4)
| Directory | Files | Reason |
|-----------|-------|--------|
| `apps/api/` | ~807 | Entire Go backend |
| `api/` | ~125 | OpenAPI specification |
| `db/` | ~178 | Legacy golang-migrate migrations |
| `deploy/` | 2 | Go-specific deploy scripts |

### Root Files (3)
| File | Reason |
|------|--------|
| `go.work` | Go workspace |
| `go.work.sum` | Go workspace checksum |
| `.golangci.yml` | Go linter config |

### Docker Files (3)
| File | Reason |
|------|--------|
| `docker/api.dev.Dockerfile` | Go dev container |
| `docker/api.Dockerfile` | Go prod container |
| `docker/docker-compose.prod.yml` | Go production compose |
| `docker/Caddyfile.prod` | Reverse proxy to Go API |

### Frontend Files (7 deleted + 1 moved)
| File | Action |
|------|--------|
| `apps/web/src/lib/api/client.ts` | Delete (storage extracted to `lib/storage.ts`) |
| `apps/web/src/lib/api/errors.ts` | Delete |
| `apps/web/src/lib/api/index.ts` | Delete |
| `apps/web/src/lib/api/types.ts` | Move to `src/types/legacy-api-types.ts` |
| `apps/web/src/hooks/use-api-query.ts` | Delete |
| `apps/web/src/hooks/use-api-mutation.ts` | Delete |
| `apps/web/scripts/fix-api-types.mjs` | Delete |

### Frontend Files Modified
| File | Change |
|------|--------|
| `apps/web/src/hooks/index.ts` | Remove useApiQuery/useApiMutation exports |
| `apps/web/src/hooks/api/index.ts` | Remove exports for 4 legacy hooks |
| `apps/web/src/hooks/api/use-accounts.ts` | Delete or migrate |
| `apps/web/src/hooks/api/use-account-groups.ts` | Delete or migrate |
| `apps/web/src/hooks/api/use-contact-types.ts` | Delete or migrate |
| `apps/web/src/hooks/api/use-contact-kinds.ts` | Delete or migrate |
| `apps/web/src/hooks/api/use-vacation-balance.ts` | Remove legacy invalidation keys |
| `apps/web/src/providers/auth-provider.tsx` | Update import path |
| `apps/web/src/providers/tenant-provider.tsx` | Migrate to tRPC, update import paths |
| `apps/web/src/trpc/provider.tsx` | Update import path |
| `apps/web/src/components/team-overview/team-upcoming-absences.tsx` | Migrate to tRPC |
| 150 component/page files | Update `@/lib/api/types` import path |
| `apps/web/src/config/env.ts` | Remove apiUrl references |
| `apps/web/.env.example` | Remove Go API URL vars |
| `apps/web/package.json` | Remove openapi deps and generate:api script |

### Files Kept (NOT deleted)
| File/Directory | Reason |
|---------------|--------|
| `supabase/` | Active migration system |
| `apps/web/prisma/` | Active ORM schema |
| `docker/docker-compose.yml` | Dev environment (web service) |
| `docker/docker-compose.demo.yml` | Demo environment |
| `docker/Caddyfile.demo` | Demo reverse proxy (modified) |
| `docker/caddy-demo-entrypoint.sh` | Demo Caddy helper |
| `docker/web.Dockerfile` | Next.js production build |
| `apps/web/vercel.json` | Vercel cron config |
| All Makefile `db-*` targets | Supabase DB management |
| `prod-migrate` target | Supabase production migrations |

## Execution Order

1. Phase 1 (migrate hooks) -- must be first, ensures no runtime Go dependencies
2. Phase 2 (extract storage) -- must precede Phase 3
3. Phase 3 (delete frontend legacy) -- depends on Phases 1 and 2
4. Phase 4 (delete Go backend) -- independent of Phase 3 but logically follows
5. Phase 5 (Docker cleanup) -- depends on Phase 4
6. Phase 6 (Makefile) -- depends on Phases 4 and 5
7. Phase 7 (gitignore) -- independent, can run anytime after Phase 4
8. Phase 8 (docs) -- should be last to reflect final state
9. Phase 9 (verification) -- final
