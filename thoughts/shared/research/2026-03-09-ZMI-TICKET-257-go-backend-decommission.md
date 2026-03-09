# Research: ZMI-TICKET-257 Go Backend Decommission

## 1. Go Backend Structure (`apps/api/`)

### Overview
- Total files: 807
- Go version: 1.24.0 (specified in `go.work`)
- Entry point: `apps/api/cmd/server/main.go`
- Embedded OpenAPI spec: `apps/api/cmd/server/openapi.bundled.yaml`
- OpenAPI embed helper: `apps/api/cmd/server/openapi_embed.go`
- Hot reload config: `apps/api/.air.toml`
- Dependencies: `apps/api/go.mod`, `apps/api/go.sum`

### Internal Directory Structure (`apps/api/internal/`)
| Directory | Files | Purpose |
|-----------|-------|---------|
| `handler/` | 95 .go files | HTTP handlers (Chi router), includes `swagger-ui/` subdirectory |
| `service/` | 131 .go files | Business logic, calculation engine, scheduler |
| `repository/` | 88 .go files | GORM-based data access |
| `model/` | 67 .go files | Domain models (GORM structs) |
| `auth/` | ~20 files | JWT management, dev user simulation, dev data seeding |
| `middleware/` | Auth + tenant context injection |
| `config/` | Environment config loading |
| `calculation/` | Calculation types and logic |
| `permissions/` | Permission system |
| `access/` | Access control logic |
| `holiday/` | Holiday calculation logic |
| `testutil/` | Test utilities (shared dev DB with transaction rollback) |
| `timeutil/` | Time utility functions |

### Generated Models
- Location: `apps/api/gen/models/`
- Count: 347 generated Go model files
- Generated from OpenAPI spec via `go-swagger`

### Other Files in `apps/api/`
- `apps/api/pkg/pointer/` - utility package
- `apps/api/server` - compiled binary (38MB, uncommitted)
- `apps/api/handler.test`, `apps/api/service.test` - compiled test binaries
- `apps/api/coverage.out`, `apps/api/coverage.html` - test coverage artifacts

### `go.work` File
```
go 1.24.0

use ./apps/api
```

### `go.work.sum`
- Exists at repository root

## 2. OpenAPI Spec (`api/`)

### Structure
| Path | Contents |
|------|----------|
| `api/openapi.yaml` | Main OpenAPI spec entry point (58KB) |
| `api/paths/` | 61 YAML path definition files |
| `api/schemas/` | 59 YAML schema definition files |
| `api/responses/` | Response definition files |
| `api/openapi.bundled.yaml` | Bundled single-file spec (551KB) |
| `api/openapi.bundled.v3.yaml` | Converted OpenAPI 3.0 version (627KB) |

The bundled spec is also copied to `apps/api/cmd/server/openapi.bundled.yaml` for Go embedding.

## 3. Database Migrations

### Legacy golang-migrate Migrations (`db/migrations/`)
- Count: 178 files (89 up + 89 down migration pairs)
- Format: `000001_create_users.up.sql` / `000001_create_users.down.sql`
- Range: 000001 through 000089

### Supabase Migrations (`supabase/migrations/`)
- Count: 5 files
- These are the newer migrations added during the tRPC migration phase:
  - `20260303000000_handle_new_user_trigger.sql`
  - `20260306212231_add_shifts_macros_employee_messages.sql`
  - `20260306234026_add_export_interfaces_payroll_reports.sql`
  - `20260307064331_add_terminal_bookings_vehicles_trip_records.sql`
  - `20260307073508_add_travel_allowance_rules.sql`

## 4. Docker / Infrastructure

### Docker Files
| File | Purpose |
|------|---------|
| `docker/api.dev.Dockerfile` | Go dev container (golang:1.24-alpine, air hot-reload, migrate CLI) |
| `docker/api.Dockerfile` | Go production build (multi-stage, CGO_ENABLED=0) |
| `docker/web.Dockerfile` | Next.js production build |
| `docker/docker-compose.yml` | Main dev compose: `api` + `web` services |
| `docker/docker-compose.demo.yml` | Demo overlay: adds `caddy` + `ngrok` services |
| `docker/docker-compose.prod.yml` | Production: `api` + `caddy` services |
| `docker/Caddyfile.demo` | Demo reverse proxy (frontend + API behind basic auth) |
| `docker/Caddyfile.prod` | Production reverse proxy (API only) |
| `docker/caddy-demo-entrypoint.sh` | Demo Caddy entrypoint script |

### `docker/docker-compose.yml` Services
1. **`api`** (Go-specific): Builds from `docker/api.dev.Dockerfile`, port 8080, mounts `apps/api`, connects to Supabase Postgres
2. **`web`** (shared): node:22-alpine, port 3001, mounts `apps/web`, depends on `api`

### `docker/docker-compose.demo.yml` Additional Services
- Overrides `api` with `FRONTEND_URL` env
- Overrides `web` with `NEXT_PUBLIC_API_URL=/api/v1`
- **`caddy`**: Reverse proxy for demo (routes `/api/*` and `/swagger/*` to api:8080, rest to web:3001)
- **`ngrok`**: Public tunnel

### `docker/docker-compose.prod.yml` Services
1. **`api`**: Uses pre-built `terp-api:latest` image, production env vars
2. **`caddy`**: Production reverse proxy to `api:8080`

### Deploy Scripts (`deploy/`)
- `deploy/setup.sh` - One-time Hetzner VPS setup (Docker, firewall, .env.prod generation)
- `deploy/deploy.sh` - Build and deploy Go API: docker build, scp, docker-compose up, run migrations

### Caddy Configuration
- `Caddyfile.prod`: Reverse proxies all traffic to `api:8080`
- `Caddyfile.demo`: Routes `/api/*` and `/swagger/*` to `api:8080`, everything else to `web:3001`

### Vercel Configuration
- `apps/web/vercel.json` exists with 4 cron job definitions (for tRPC-era cron routes)
- No root `vercel.json`

## 5. Makefile

### Go-Specific Targets
| Target | Command |
|--------|---------|
| `build` | `docker build -f docker/api.Dockerfile -t terp-api:latest .` |
| `test` | `cd apps/api && go test -p 1 -v -race -cover ./...` |
| `test-coverage` | `cd apps/api && go test -p 1 -coverprofile=coverage.out ./...` |
| `lint` | `cd apps/api && golangci-lint run ./...` |
| `fmt` | `cd apps/api && gofmt -s -w . && goimports -w .` |
| `tidy` | `cd apps/api && go mod tidy` |
| `swagger-bundle` | Bundles OpenAPI spec, copies to `apps/api/cmd/server/` |
| `generate` | Validates spec, generates Go models to `apps/api/gen/models/` |
| `generate-web` | Converts Swagger 2.0 to OpenAPI 3.0, generates TypeScript types |
| `generate-all` | Runs both `generate` and `generate-web` |
| `install-tools` | Installs golangci-lint, goimports, air, go-swagger, swagger-cli |
| `clean` | Removes `apps/api/tmp`, coverage files, `bin/` |

### Go-Specific Production Targets
| Target | Command |
|--------|---------|
| `prod-setup` | Runs `deploy/setup.sh` on remote server |
| `prod-deploy` | Runs `deploy/deploy.sh` (builds and deploys Go API) |
| `prod-logs` | Tails Docker compose logs on remote server |
| `prod-ssh` | SSH into remote server |

### Targets That Reference Go API Service
| Target | Issue |
|--------|-------|
| `dev` | Runs `$(DOCKER_COMPOSE) up --build -d` which starts the `api` service |
| `dev-down` | Stops all Docker services including `api` |
| `dev-reset` | Runs `$(DOCKER_COMPOSE) restart api` |
| `dev-clean` | Force removes `terp-api` container |
| `demo` | Starts demo including API service |
| `demo-down` | Force removes `terp-api` container |

### Targets That Should Remain (Database/Supabase)
| Target | Command |
|--------|---------|
| `db-start` | `npx supabase start` |
| `db-stop` | `npx supabase stop` |
| `db-reset` | `npx supabase db reset` |
| `db-status` | `npx supabase status` |
| `db-migrate-new` | `npx supabase migration new $(name)` |
| `prod-migrate` | `npx supabase db push` |

### Makefile Variables
- `GOBIN = $(shell go env GOPATH)/bin` - Go-specific
- `DOCKER_COMPOSE` - References `docker/docker-compose.yml` (contains `api` service)
- `DOCKER_COMPOSE_DEMO` - References demo compose (contains `api` service)
- `LOCAL_DB` - Shared (Supabase Postgres, not Go-specific)

### Root Config
- `.golangci.yml` - golangci-lint configuration at repository root

## 6. Frontend Legacy Hooks (`apps/web/src/hooks/api/`)

### Total Hook Files: 68 files + 1 index.ts

### Hooks Using Legacy OpenAPI Client (`useApiQuery`/`useApiMutation`)
These 5 hooks still use the legacy `openapi-fetch` client pattern:
1. `use-accounts.ts`
2. `use-account-groups.ts`
3. `use-contact-types.ts`
4. `use-contact-kinds.ts`
5. `use-vacation-balance.ts` (header says "tRPC" but imports from `@/lib/api`)

Note: `use-vacation-balance.ts` has a header comment saying "Migrated from legacy REST to tRPC" but actually still imports from `@/lib/api` via the `useApiQuery`/`useApiMutation` wrappers. Further inspection shows it actually uses `useTRPC()` -- the file appears in both search results because it imports types from `@/lib/api` but uses tRPC for data fetching.

### Hooks Using tRPC
The remaining 64 hooks all use the tRPC pattern (`useTRPC()` from `@/trpc`).

### Legacy API Client Utilities
| File | Purpose |
|------|---------|
| `apps/web/src/lib/api/client.ts` | `openapi-fetch` client with auth + tenant middleware, targets Go backend |
| `apps/web/src/lib/api/types.ts` | Generated TypeScript types from OpenAPI spec (22,141 lines) |
| `apps/web/src/lib/api/errors.ts` | RFC 7807 Problem Details error parsing |
| `apps/web/src/lib/api/index.ts` | Barrel export for api client, types, errors |
| `apps/web/src/hooks/use-api-query.ts` | Generic typed query hook wrapping `openapi-fetch` |
| `apps/web/src/hooks/use-api-mutation.ts` | Generic typed mutation hook wrapping `openapi-fetch` |
| `apps/web/src/hooks/index.ts` | Re-exports `useApiQuery`, `useApiMutation` |

### Files Importing from `@/lib/api`
155 files across the codebase import from `@/lib/api`. These are spread across:
- Component files (for type imports like `paths`, `components`)
- Provider files (`auth-provider.tsx`, `tenant-provider.tsx`)
- tRPC infrastructure (`server/trpc.ts`, `trpc/provider.tsx`)
- Hook files

### Files Importing from `@/hooks/api`
187 files import from `@/hooks/api` (the legacy hook barrel export).

### Files Importing from `@/hooks` (barrel)
62 files import from the `@/hooks` barrel (which re-exports `useApiQuery`/`useApiMutation`).

## 7. tRPC Current State

### tRPC Infrastructure
| File | Purpose |
|------|---------|
| `apps/web/src/server/trpc.ts` | tRPC context creation, router factory |
| `apps/web/src/server/root.ts` | Root router (merges all sub-routers) |
| `apps/web/src/server/index.ts` | Server barrel export |
| `apps/web/src/trpc/context.ts` | tRPC context type |
| `apps/web/src/trpc/index.ts` | tRPC client hooks |
| `apps/web/src/trpc/server.ts` | Server-side tRPC caller |
| `apps/web/src/trpc/provider.tsx` | React Query + tRPC provider |
| `apps/web/src/app/api/trpc/[trpc]/route.ts` | Next.js API route handler |

### tRPC Routers (67 routers)
All registered in `apps/web/src/server/root.ts`:
health, auth, permissions, tenants, users, userGroups, departments, teams, costCenters, employmentTypes, locations, holidays, employees, evaluations, employeeContacts, employeeCards, employeeTariffAssignments, groups, activities, orders, orderAssignments, orderBookings, bookingTypes, bookingReasons, bookings, bookingTypeGroups, absenceTypeGroups, calculationRules, absenceTypes, dayPlans, weekPlans, tariffs, vacationSpecialCalcs, vacationCalcGroups, vacationCappingRules, vacationCappingRuleGroups, employeeCappingExceptions, vacation, systemSettings, auditLogs, notifications, shifts, macros, employeeMessages, accessZones, accessProfiles, employeeAccessAssignments, exportInterfaces, payrollExports, reports, schedules, terminalBookings, vehicles, vehicleRoutes, tripRecords, travelAllowanceRuleSets, localTravelRules, extendedTravelRules, travelAllowancePreview, monthlyEvalTemplates, corrections, correctionAssistant, employeeDayPlans, dailyValues, dailyAccountValues, monthlyValues, absences, vacationBalances

### Router Test Files
4 test files in `apps/web/src/server/routers/__tests__/`:
- `monthlyValues.test.ts`
- `absences.test.ts`
- `orderBookings.test.ts`
- `corrections.test.ts`

### Vercel Cron Routes
4 cron routes in `apps/web/src/app/api/cron/`:
- `calculate-days/route.ts` (with test)
- `calculate-months/route.ts` (with test)
- `generate-day-plans/route.ts` (with test)
- `execute-macros/route.ts` (with test)

### Internal API Route
- `apps/web/src/app/api/internal/notifications/publish/route.ts`

### Prisma
- Schema: `apps/web/prisma/schema.prisma`
- Generated client output: `apps/web/src/generated/` (gitignored)

## 8. Environment Configuration

### `apps/web/.env.example`
Contains Go backend references:
- `API_URL=http://localhost:8080/api/v1`
- `NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1`

### `apps/web/src/config/env.ts`
- `serverEnv.apiUrl` defaults to `http://localhost:8080/api/v1`
- `clientEnv.apiUrl` defaults to `http://localhost:8080/api/v1`
- `validateEnv()` requires `NEXT_PUBLIC_API_URL` as a required env var

## 9. CI/CD Configuration

- No `.github/workflows/` directory found
- No root `vercel.json`
- `apps/web/vercel.json` contains only cron definitions (not Go-related)
- Deploy scripts in `deploy/` are entirely Go-focused

## 10. References to Go Backend Throughout the Codebase

### Source Code References to `localhost:8080`
| File | Context |
|------|---------|
| `apps/web/.env.example` | API_URL and NEXT_PUBLIC_API_URL defaults |
| `apps/web/src/config/env.ts` | apiUrl defaults in serverEnv and clientEnv |
| `apps/api/internal/config/config.go` | BaseURL default |
| `api/openapi.yaml` | host field |
| `api/openapi.bundled.yaml` | host field |
| `api/openapi.bundled.v3.yaml` | server URLs |
| `apps/api/cmd/server/openapi.bundled.yaml` | host field |

### Documentation References
| File | Content |
|------|---------|
| `CLAUDE.md` | Entire file describes Go backend architecture |
| `apps/web/README.md` | References API_URL and NEXT_PUBLIC_API_URL pointing to Go backend |
| `.claude/commands/create_plan.md` | References `curl localhost:8080` |
| `.claude/commands/create_plan_nt.md` | References `curl localhost:8080` |
| `.claude/commands/create_plan_generic.md` | References `curl localhost:8080` |
| Multiple files in `thoughts/shared/research/` | Historical references to Go backend |
| Multiple files in `thoughts/shared/plans/` | Historical references to Go backend |

### `.gitignore` Go-Specific Entries
- `*.exe`, `*.dll`, `*.so`, `*.dylib`, `bin/`, `dist/`
- `*.o`, `*.a`, `*.test`, `*.out`, `*.prof`
- `coverage.out`, `coverage.html`
- `go.work`, `go.work.sum` (commented out)
- `vendor/`
- Air hot reload: `tmp/`

### Other Root-Level Go Files
- `go.work` - Go workspace file
- `go.work.sum` - Go workspace checksum
- `.golangci.yml` - Linter configuration

## 11. Summary of Items to Remove

### Directories to Remove
- `apps/api/` - Entire Go backend (807 files)
- `api/` - OpenAPI spec directory
- `db/migrations/` - Legacy golang-migrate migrations (178 files)
- `deploy/` - Go-specific deployment scripts

### Files to Remove
- `go.work` - Go workspace
- `go.work.sum` - Go workspace checksum
- `.golangci.yml` - Go linter config
- `docker/api.dev.Dockerfile` - Go dev Dockerfile
- `docker/api.Dockerfile` - Go prod Dockerfile
- `docker/docker-compose.prod.yml` - Go production compose (API + Caddy only)
- `docker/Caddyfile.prod` - Production Caddy (proxies to Go API only)

### Files to Modify
- `docker/docker-compose.yml` - Remove `api` service, remove `depends_on: api` from web
- `docker/docker-compose.demo.yml` - Remove `api` overrides, update Caddy config
- `docker/Caddyfile.demo` - Remove `/api/*` and `/swagger/*` reverse proxy rules
- `Makefile` - Remove all Go-specific targets, update `dev`/`dev-down`/`dev-reset`/`dev-clean`/`demo`/`demo-down`
- `CLAUDE.md` - Rewrite to reflect tRPC-only architecture
- `apps/web/README.md` - Remove Go backend URL references
- `apps/web/.env.example` - Remove `API_URL` and `NEXT_PUBLIC_API_URL`
- `apps/web/src/config/env.ts` - Remove `apiUrl` references
- `.gitignore` - Remove Go-specific entries
- `.claude/commands/create_plan.md` - Remove `curl localhost:8080` references
- `.claude/commands/create_plan_nt.md` - Remove `curl localhost:8080` references
- `.claude/commands/create_plan_generic.md` - Remove `curl localhost:8080` references

### Frontend Files to Remove (Legacy API Client)
- `apps/web/src/lib/api/client.ts` - openapi-fetch client
- `apps/web/src/lib/api/types.ts` - Generated TypeScript types (22,141 lines)
- `apps/web/src/lib/api/errors.ts` - Error utilities
- `apps/web/src/lib/api/index.ts` - Barrel export
- `apps/web/src/hooks/use-api-query.ts` - Legacy query hook
- `apps/web/src/hooks/use-api-mutation.ts` - Legacy mutation hook

### Frontend Files to Audit
- `apps/web/src/hooks/index.ts` - Remove `useApiQuery`/`useApiMutation` re-exports
- 4 hook files still using legacy pattern: `use-accounts.ts`, `use-account-groups.ts`, `use-contact-types.ts`, `use-contact-kinds.ts`
- 155 files importing from `@/lib/api` (need audit - some may only import types)
- 187 files importing from `@/hooks/api` (the barrel - these use tRPC but route through the barrel)
- `apps/web/src/providers/auth-provider.tsx` - imports from `@/lib/api`
- `apps/web/src/providers/tenant-provider.tsx` - imports from `@/lib/api`
