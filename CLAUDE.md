# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

Next.js app with tRPC backend:

- `src/` - Next.js app (tRPC API, Prisma ORM, Supabase Auth, PostgreSQL)
- `supabase/` - Supabase configuration and migrations
- `docker/` - Docker Compose dev environment

## Commands

```bash
pnpm install              # Install dependencies
pnpm dev                  # Start Next.js dev server (port 3001)
pnpm build                # Build the Next.js app
pnpm test                 # Run tests
pnpm test:watch           # Run tests in watch mode
pnpm lint                 # Run ESLint
pnpm typecheck            # Type-check with TypeScript
pnpm clean                # Remove build artifacts

# Docker
pnpm docker:dev           # Start Supabase + Docker services
pnpm docker:down          # Stop Docker services
pnpm docker:clean         # Force remove all containers, volumes, stop Supabase
pnpm docker:logs          # Follow logs
pnpm docker:ps            # Check service status

# Database
pnpm db:start             # Start Supabase (local Postgres + Studio)
pnpm db:stop              # Stop Supabase
pnpm db:reset             # Reset DB (drops all data, reruns migrations + seed)
pnpm db:status            # Show Supabase connection info
pnpm db:migrate:new <name>  # Create new Supabase migration
pnpm db:generate          # Regenerate Prisma client
pnpm db:studio            # Open Prisma Studio
pnpm db:push:staging      # Push migrations to staging Supabase

# Demo
pnpm demo:dev             # Start demo with public tunnel
pnpm demo:down            # Stop demo environment
pnpm demo:logs            # Follow demo logs
```

Run single test: `pnpm vitest run src/trpc/routers/__tests__/TestName.test.ts`

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
