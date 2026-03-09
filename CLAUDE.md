# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

Next.js app with tRPC backend:

- `src/` - Next.js app (tRPC API, Prisma ORM, Supabase Auth, PostgreSQL)
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

Run single test: `pnpm vitest run src/server/routers/__tests__/TestName.test.ts`

## Architecture

Next.js App Router with tRPC:

```
src/trpc/routers/     -> tRPC routers (thin wrappers calling services)
src/trpc/init.ts      -> tRPC context, router factory, middleware
src/trpc/routers/_app.ts -> Root router (merges all sub-routers)
src/trpc/errors.ts    -> handleServiceError utility
src/lib/services/     -> Service + repository files (business logic + data access)
src/lib/auth/         -> Auth helpers, permissions, authorization middleware
src/app/api/trpc/     -> Next.js API route handler for tRPC
src/app/api/cron/     -> Vercel Cron job routes
src/hooks/            -> React hooks wrapping tRPC queries/mutations
src/components/       -> React components (UI)
src/providers/        -> Context providers (auth, tenant, theme)
src/trpc/client.tsx   -> tRPC React provider
src/trpc/server.tsx   -> Server-side tRPC caller
prisma/schema.prisma  -> Database schema (Prisma)
```

**Multi-tenancy**: tRPC context injects tenant from `x-tenant-id` header. Middleware validates access.

**Auth**: Supabase Auth with JWT. tRPC context extracts user from Supabase session.

**Database**: Prisma ORM with PostgreSQL (Supabase). Migrations via `supabase migration new`.

## Important

- All new backend logic uses service + repository pattern in `src/lib/services/`
- tRPC routers in `src/trpc/routers/` are thin wrappers (input validation + call service)
- Use Prisma client for all database access (not raw SQL unless necessary)
- Frontend hooks that wrap tRPC calls go in `src/hooks/`
- Types come from Prisma generated client (`@prisma/client`) for DB models
- Legacy OpenAPI types exist in `src/types/legacy-api-types.ts` -- prefer Prisma types for new code
