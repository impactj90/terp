# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

Go monorepo using `go.work` workspace:

- `apps/api/` - Go backend (Chi router, GORM ORM, PostgreSQL)
- `apps/web/` - Next.js frontend (placeholder)
- `api/` - Multi-file OpenAPI spec (Swagger 2.0)
- `db/migrations/` - SQL migrations (golang-migrate)
- `docker/` - Docker Compose dev environment

## Commands

```bash
make install-tools    # Install dev tools (run first on new machine)
make dev              # Start all services (DB + API with hot reload)
make dev-down         # Stop services
make dev-logs         # Follow logs
make dev-ps           # Check service status
make migrate-up       # Apply migrations
make migrate-down     # Rollback last migration
make migrate-create name=foo  # Create new migration
make swagger-bundle   # Bundle multi-file OpenAPI into single file
make generate         # Generate Go models from OpenAPI spec
make test             # Run tests with race detection
make lint             # Run golangci-lint
make fmt              # Format code (gofmt + goimports)
```

Run single test: `cd apps/api && go test -v -run TestName ./internal/service/...`

## Architecture

Clean architecture in `apps/api/internal/`:

```
handler/   → HTTP handlers (request parsing, response formatting)
service/   → Business logic (validation, orchestration)
repository/→ Data access (GORM queries, DB wrapper)
model/     → Domain models (GORM structs)
middleware/→ Auth, tenant context injection
auth/      → JWT management, dev user simulation
config/    → Environment config loading
```

**Multi-tenancy**: Routes require `X-Tenant-ID` header. Tenant context injected via middleware.

**Route registration**: Handlers have `Register*Routes(r chi.Router, h *Handler)` functions called from `cmd/server/main.go`.

## API Design

- OpenAPI-first: Define endpoints in `api/paths/*.yaml`, schemas in `api/schemas/*.yaml`
- Bundle with `make swagger-bundle` → outputs `api/openapi.bundled.yaml`
- Generate Go models with `make generate` → outputs to `apps/api/gen/models/`
- Swagger UI available at `/swagger/` in dev mode

## Important

- When creating handlers always make sure that they match the openapi spec before implementing them.
- Always you the generated models from the `gen/models` folder when dealing with request and response payloads instead of creating new structs.
- If you have any open questions about implementing/researching a new feature from a ticket,
