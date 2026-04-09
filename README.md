# Terp — Time Tracking Platform

A multi-tenant time tracking and workforce management platform.

## Tech Stack

- **Backend**: Next.js 16+ App Router with tRPC (TypeScript)
- **Frontend**: Next.js 16+ (TypeScript, Tailwind CSS v4, Shadcn/ui)
- **Database**: PostgreSQL 16 (Prisma ORM, Supabase CLI for migrations)
- **Auth**: Supabase Auth (JWT)
- **Infrastructure**: Docker, Supabase (local dev + hosted staging/prod)

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 9+
- Docker & Docker Compose
- Supabase CLI

### Development

```bash
# Install dependencies
pnpm install

# Start all services (Supabase + Docker)
pnpm docker:dev

# Reset local DB (apply migrations + seed)
pnpm db:reset

# Start Next.js dev server (port 3001)
pnpm dev

# Run tests
pnpm test

# Type check + lint
pnpm typecheck
pnpm lint
```

### Dev Login Credentials

After `pnpm db:reset`, two test users are available:

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@dev.local` | `dev-password-admin` |
| User | `user@dev.local` | `dev-password-user` |

### Staging Setup (one-time)

Requires `.env.staging` in project root (with `DATABASE_URL`, Supabase keys, etc.) and `psql` installed locally.

```bash
# Link to staging Supabase project
npx supabase link --project-ref kurzyavaszziyeinjiks

# Push migrations to staging
pnpm db:push:staging

# Seed staging with dev users + sample data
pnpm seed:staging
```

### Staging: Push New Migrations

```bash
pnpm db:push:staging    # push migrations
pnpm seed:staging       # re-seed if needed
```

### Vercel Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `DATABASE_URL` | PostgreSQL connection URL (Supabase pooler) |
| `CRON_SECRET` | Secret for cron job authentication |
| `INTERNAL_API_KEY` | Secret for internal API authentication |
| `NEXT_PUBLIC_ENV` | `development` (local/staging) or `production` |
| `NEXT_PUBLIC_APP_NAME` | Application display name |
| `NEXT_PUBLIC_APP_URL` | Base URL the app is served from. Used as the `redirectTo` target for Supabase recovery / welcome-email links. Must match `supabase/config.toml [auth] site_url` in local dev. Default: `http://127.0.0.1:3001`. |

**Note:** When using the Supabase connection pooler (`pooler.supabase.com:6543`), the Prisma pg adapter is configured to accept Supabase's certificate chain (`ssl: { rejectUnauthorized: false }` in production). No special `DATABASE_URL` params are needed beyond `?sslmode=require&pgbouncer=true`.

## Project Structure

```
src/
  app/                  # Next.js App Router pages + API routes
  trpc/
    routers/            # tRPC routers (thin wrappers calling services)
    init.ts             # tRPC context, router factory, middleware
    routers/_app.ts     # Root router (merges all sub-routers)
    errors.ts           # handleServiceError utility
  lib/
    services/           # Service + repository files (business logic + data access)
    auth/               # Auth helpers, permissions, authorization middleware
    supabase/           # Supabase client variants (browser, server, admin, middleware)
    db/                 # Prisma client singleton
    config.ts           # Environment configuration
  hooks/                # React hooks wrapping tRPC queries/mutations
  components/           # React components (UI)
  providers/            # Context providers (auth, tenant, theme)
prisma/
  schema.prisma         # Database schema (Prisma)
supabase/
  migrations/           # SQL migrations (managed via Supabase CLI)
  seed.sql              # Dev seed data
scripts/                # Utility scripts (seed-staging, etc.)
docker/                 # Docker Compose dev environment
```

## Architecture

### Service + Repository Pattern

All backend logic follows the service + repository pattern:

```
tRPC Router (thin wrapper: input validation + call service)
  → Service (business logic)
    → Repository (Prisma queries)
```

### Multi-Tenancy

tRPC context injects the tenant from the `x-tenant-id` header. The `tenantProcedure` middleware validates that the user has access to the requested tenant via the `user_tenants` join table.

### Auth Flow

1. Client authenticates via Supabase Auth (`signInWithPassword`)
2. tRPC client sends the access token as `Authorization: Bearer <token>`
3. tRPC context validates the token with Supabase, resolves the full user from `public.users`
4. `protectedProcedure` ensures the user is authenticated; `tenantProcedure` additionally requires a tenant

### User Creation & Welcome-Email Flow

When an admin creates a user via `/admin/users → Neuer Benutzer`, the server-side flow is:

1. **Generate placeholder password** — 16 bytes of `crypto.randomBytes` (base64url). The user never sees or uses this; it only exists so Supabase Auth has a password row to overwrite later.
2. **`supabase.auth.admin.createUser`** with `email_confirm: true` and `user_metadata: { skip_public_sync: 'true' }`. The `skip_public_sync` flag is read by the `handle_new_user` trigger (`supabase/migrations/20260420100001_handle_new_user_skip_flag.sql`) and prevents the trigger from auto-inserting a `public.users` row that would race with our service.
3. **Prisma insert** of `public.users` + `user_tenants` using the id returned by Supabase (so `auth.users.id === public.users.id`). On any Prisma failure, the auth user is rolled back via `auth.admin.deleteUser` so we never leave an orphan.
4. **`supabase.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: ${NEXT_PUBLIC_APP_URL}/reset-password } })`** to obtain a single-use password-set link. `recovery` (not `invite`) because the user already exists in `auth.users` after step 2 — `invite` only works for non-existent users.
5. **Welcome email send** via `src/lib/services/user-welcome-email-service.ts`. Reuses the existing tenant SMTP infrastructure (`TenantSmtpConfig` + `email-smtp-config-service.createTransporter` + `email-send-log-repository`). The email contains the branded message and the recovery link.
6. **Fallback when no SMTP**: if the tenant has no SMTP config or delivery fails, the service returns `{ sent: false, fallbackLink }`. The admin UI opens `WelcomeEmailFallbackDialog`, which shows the link with a copy-to-clipboard button so the admin can share it out-of-band (chat, SMS).

**Reset-password page** (`src/app/[locale]/(auth)/reset-password/page.tsx`): when the user clicks the link, Supabase verifies the token server-side and issues a 303 redirect to `${NEXT_PUBLIC_APP_URL}/reset-password` with `#access_token=...&refresh_token=...` in the URL hash fragment (implicit flow). The page:

1. Parses the hash explicitly (does **not** rely on `@supabase/ssr`'s `detectSessionInUrl` — it races with next-intl's locale routing in Next.js 16 and silently misses the tokens).
2. Calls `supabase.auth.setSession({ access_token, refresh_token })` to persist the session into cookies.
3. Shows a "set new password" form.
4. Submits via `supabase.auth.updateUser({ password })` and redirects to `/dashboard` (user is now fully logged in).

The hash fragment is never sent to any server — it exists only in the browser — so the tokens are not written to Nginx/proxy/Next.js logs.

**Security properties of this flow:**

- The admin never sees any password (initial or otherwise)
- The user sets their own password directly on the reset-password page
- The recovery token is hashed in `auth.users.recovery_token`; only Supabase can validate it
- The token is single-use (Supabase clears it after a successful verify) and expires after 1 hour by default
- When SMTP is not configured, the fallback link has the same security properties — it goes through the same Supabase verify flow

**Supabase local config** (`supabase/config.toml`): the `[auth]` block sets `site_url = "http://127.0.0.1:3001"` and `additional_redirect_urls = ["http://127.0.0.1:3001/**"]` so the verify endpoint accepts our app as a redirect target. After editing `config.toml`, restart the Supabase stack with `pnpm db:stop && pnpm db:start` — `pnpm db:reset` alone does not reload auth config.

**`NEXT_PUBLIC_APP_URL`**: set in `.env.local` for local dev. Without it, the default from `src/lib/config.ts` (`http://127.0.0.1:3001`) is used. In production/staging, set this to the public app URL and mirror it in `supabase/config.toml` (or the equivalent Dashboard setting).

**HMR cross-origin warning**: because the Supabase verify endpoint (`:54321`) redirects to the dev server (`:3001`), Next.js 16 would otherwise log a cross-origin HMR warning. `allowedDevOrigins: ['127.0.0.1']` in `next.config.ts` silences this without affecting production builds.
