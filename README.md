# Terp Web Frontend

Next.js 16 frontend for Terp time tracking system.

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS v4 (CSS-first configuration)
- **Components**: Shadcn/ui
- **Backend**: tRPC routers (co-located in `src/server/`)
- **Database**: Prisma ORM with PostgreSQL (Supabase)
- **Auth**: Supabase Auth
- **Font**: Inter via next/font

## Development

```bash
# Install dependencies
pnpm install

# Start development server (with Turbopack)
pnpm run dev

# Type check
pnpm run typecheck

# Lint
pnpm run lint

# Format
pnpm run format
```

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

```bash
cp .env.example .env.local
```

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_APP_NAME` | Application name | `Terp` |
| `DATABASE_URL` | PostgreSQL connection URL | `postgresql://postgres:postgres@localhost:54322/postgres` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | - |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | - |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | - |

## Project Structure

```
src/
  app/              # Next.js App Router pages
  server/           # tRPC routers, context, middleware
  components/
    ui/             # Shadcn/ui components
    layout/         # Layout components
    forms/          # Form components
  hooks/            # Custom React hooks
  lib/              # Utility functions
  types/            # TypeScript type definitions
  config/           # Configuration modules
  trpc/             # tRPC client hooks and provider
  providers/        # Context providers (auth, tenant, theme)
prisma/
  schema.prisma     # Database schema
```

## Adding Shadcn Components

```bash
pnpm dlx shadcn@latest add [component-name]
```

Example:
```bash
pnpm dlx shadcn@latest add card dialog input
```

## Building for Production

```bash
pnpm run build
pnpm run start
```
