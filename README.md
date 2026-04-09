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

### Secrets Management (env files)

The three env files — `.env.local`, `.env.staging`, `.env.production` — contain DB URLs, Supabase service-role keys, and other secrets. They are **not** committed as plaintext (see `.gitignore`); instead, encrypted `.env.*.vault` counterparts are checked in using [ansible-vault](https://docs.ansible.com/ansible/latest/vault_guide/index.html).

**Prerequisite**: `ansible-vault` on your PATH (`pipx install ansible-core`), and the shared vault password (stored in the team password manager — ask the maintainer).

```bash
# First-time checkout: decrypt all three vault files into plaintext.
# Prompts once for the vault password.
scripts/decrypt-env.sh

# After editing a plaintext env file, re-encrypt it before committing.
scripts/encrypt-env.sh                 # re-encrypts every plaintext that exists
scripts/encrypt-env.sh .env.staging    # or target a specific file
```

**Workflow when adding a new secret:**

1. Add the variable name (with a placeholder) to `.env.example` so it's documented.
2. Edit the relevant plaintext `.env.*` file(s) — local, staging, prod as applicable.
3. Run `scripts/encrypt-env.sh` to regenerate the matching `.env.*.vault` files.
4. Commit the updated `.vault` files (plaintext stays ignored by git).
5. For staging/prod, also set the variable in the Vercel dashboard so deployments pick it up.

**Skip the password prompt on trusted machines:** put the vault password in `~/.vault_pass` (chmod 600) and export `ANSIBLE_VAULT_PASSWORD_FILE=~/.vault_pass` — both scripts will read it non-interactively.

### Staging Setup (one-time)

Requires `.env.staging` in project root (run `scripts/decrypt-env.sh` first if you only have `.env.staging.vault`) and `psql` installed locally.

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
| `PLATFORM_JWT_SECRET` | **Required.** Secret used to sign platform-admin session JWTs (HS256). Generate with `openssl rand -base64 48`. See [Platform Admin System](#platform-admin-system) below. Must be rotated independently from Supabase secrets. |
| `PLATFORM_COOKIE_DOMAIN` | Optional. Subdomain the platform-admin UI is served from (e.g. `admin.terp.de`) in prod. When set, the middleware rewrites `/` → `/platform` on that host and scopes the `platform-session` cookie to it. Leave empty in dev — platform is then served at `/platform/*` on the same host as the tenant app with a host-only cookie. |

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

### Demo-Tenant System

Internal sales-enablement tooling for spinning up fully populated demo tenants on the production infrastructure. Not a customer feature — only users with the `tenants.manage` permission see it.

**Lifecycle**:

1. **Create** — Admin opens `/admin/tenants → Neue Demo`, fills the sheet (tenant name, address, demo admin email, template, duration in days, optional notes) and submits. The service (`src/lib/services/demo-tenant-service.ts`, function `createDemo`) atomically creates:
   - Tenant row with `is_demo=true`, `demo_expires_at=now()+N days`
   - All 4 demo modules (`core`, `crm`, `billing`, `warehouse`) via `tenant-module-repository.upsert`
   - Admin user with a Supabase Auth identity (reuses the welcome-email flow from above, so the admin receives a recovery link; if SMTP is down, the UI falls back to a copyable invite link)
   - Template data applied via `src/lib/demo/templates/*.ts` (today: `industriedienstleister_150` — ~150 employees, departments, bookings, groups)
   - `audit_logs` entry `demo_create`
2. **Banner** — Once the demo admin logs in, the dashboard layout (`src/components/layout/demo-banner.tsx`) shows a yellow sticky banner "Demo-Modus: noch X Tage verbleibend". Countdown is computed client-side from `tenant.demo_expires_at`.
3. **Extend** — Admin can extend a demo by +7 or +14 days from the row action menu. If the demo was already expired (`isActive=false`), extend reactivates it atomically — useful when sales wants to rescue a demo after a last-minute deal conversation.
4. **Expire** — Automatic via the Vercel Cron `/api/cron/expire-demo-tenants` (daily at `0 1 * * *`), which finds rows with `is_demo=true AND demo_expires_at < now() AND is_active=true`, flips them to `is_active=false`, and writes a `demo_expired` audit log. Manual "Expire Now" is available from the row action menu.
5. **Expired gate** — When an expired demo's admin user refreshes, `DemoExpirationGate` (`src/components/layout/demo-expiration-gate.tsx`, mounted in the dashboard layout) redirects to `/demo-expired`. The check is `isDemo && demo_expires_at < now()` — NOT `isDemo && !isActive`, so a regular soft-deactivated tenant is not misclassified.
6. **Convert** — Admin can convert a demo to a real tenant from the row action menu. Dialog offers two options:
   - **Discard demo data (default)** — wipes all tenant content, keeps only the tenant shell + admin user + `user_tenants` + `user_groups` + `audit_logs`. Useful when the prospect wants a clean start.
   - **Keep demo data** — only strips the demo flags (`is_demo`, `demo_expires_at`, `demo_template`, `demo_created_by`), everything else stays. Useful for seamless handover.
7. **Delete** — Hard-delete is only allowed on already-expired demos (to force the admin to expire first as a safeguard). Writes a `demo_delete` audit entry before the delete so the history survives in `audit_logs`.
8. **Convert request from /demo-expired** — The demo admin can click "In echten Kunden konvertieren" on the expired page. This calls the self-service `requestConvertFromExpired` endpoint, which writes an `email_send_log` row for `DEMO_CONVERT_NOTIFICATION_EMAIL` (fallback `sales@terp.dev`) so the existing email-retry cron delivers the notification. No state change on the tenant. **Follow-up**: once the platform-admin system exists (see `thoughts/shared/plans/2026-04-09-platform-admin-system.md`), this should additionally surface the request in the platform dashboard so it's not email-only.

**Key files**:

- Router: `src/trpc/routers/demo-tenants.ts` (all procedures gated by `tenants.manage`, except `requestConvertFromExpired` which is gated by tenant membership)
- Service + repository: `src/lib/services/demo-tenant-service.ts`, `src/lib/services/demo-tenant-repository.ts`
- Template engine: `src/lib/demo/registry.ts`, `src/lib/demo/templates/industriedienstleister_150.ts`
- Cron: `src/app/api/cron/expire-demo-tenants/route.ts` (registered in `vercel.json`)
- Admin UI: `src/components/tenants/demo/*` mounted in `/admin/tenants/page.tsx`
- Expired page + gate: `src/app/[locale]/demo-expired/`, `src/components/layout/demo-expiration-gate.tsx`

**Environment variables**:

| Variable | Description |
|----------|-------------|
| `DEMO_CONVERT_NOTIFICATION_EMAIL` | Optional. Recipient for demo-convert-request notifications. Default: `sales@terp.dev`. |
| `CRON_SECRET` | Already documented above. Required for the expire-demo-tenants cron. |

**Adding a new template**: create `src/lib/demo/templates/<key>.ts` exporting a `DemoTemplate` (key, label, description, `apply(tx, tenantId)` function). Register it in `src/lib/demo/registry.ts`. The UI template dropdown is automatically populated from the registry.

**Rollback plan**: if the feature needs to be disabled temporarily, (a) remove the cron entry from `vercel.json`, (b) hide the demo panel in `/admin/tenants/page.tsx`, (c) set all demos to `is_demo=false, demo_expires_at=null` via one-off SQL. Data is preserved.

### Platform Admin System

A **separate security/identity domain above the tenant world** — its own `PlatformUser` table with argon2 credentials, its own tRPC context, its own API route, its own admin UI under `admin.terp.de` (with a same-host `/platform/*` fallback for dev), mandatory TOTP 2FA, and a tenant-side consent flow (`SupportSession`) that lets operators impersonate into a tenant only with explicit, time-boxed approval from a tenant admin. Every platform-initiated tenant write produces a double audit entry (tenant `AuditLog` + new `PlatformAuditLog`).

**Why this instead of a platform-admin flag on regular users?** The goals are (1) a blast radius that's strictly contained to the platform domain (a compromised tenant user can never escalate to operator), (2) no silent cross-tenant reads (every impersonation requires tenant-side consent first), (3) a complete audit trail on both sides, and (4) independent authentication (separate JWT secret, separate cookie, separate MFA enrollment) so rotating platform credentials doesn't disrupt tenant sessions. A flag-table approach couldn't deliver any of these.

**Plan & status**:

- **Plan**: `thoughts/shared/plans/2026-04-09-platform-admin-system.md` — the authoritative spec. Read this file before touching anything in `src/lib/platform/` or `src/trpc/platform/`.
- **Research**: `thoughts/shared/research/2026-04-09-platform-admin-system.md` — the initial codebase analysis that led to the plan.
- **Obsoleted**: the earlier `thoughts/shared/tickets/misc/platform-admin-tenant-access.md` (a simple `platform_admins` flag-table) is superseded and should be renamed `_OBSOLETE.md` in Phase 8.
- **Current phase**: **Phase 2 complete** (data model + auth primitives). Phases 3–8 pending — see the plan for the full breakdown:
  - Phase 1 ✅ Data model + bootstrap (tables, argon2, CLI)
  - Phase 2 ✅ Auth core (JWT, TOTP, rate limit, login service)
  - Phase 3 ⏳ Platform tRPC layer (separate context, separate root router, `/api/trpc-platform`)
  - Phase 4 ⏳ Routing & middleware (subdomain OR `/platform/*` fallback)
  - Phase 5 ⏳ Platform UI (login, dashboard, support-sessions, audit logs)
  - Phase 6 ⏳ Consent flow (tenant-side `SupportSession` creation, settings page, yellow banner)
  - Phase 7 ⏳ Impersonation (extend `createTRPCContext` + `AsyncLocalStorage` for the audit double-write)
  - Phase 8 ⏳ Cleanup cron, docs, E2E spec

**Data model** (all four tables created by `supabase/migrations/20260421000000_create_platform_admin_tables.sql`):

| Table | Purpose |
|-------|---------|
| `platform_users` | Operator accounts — email, argon2id password hash, encrypted TOTP secret, argon2-hashed recovery codes, `is_active`. **No `auth.users` counterpart** — these users log in through the platform auth flow, NOT Supabase. |
| `support_sessions` | Consent records. Status: `pending` → `active` → `expired \| revoked`. Created by a tenant admin, activated by an operator, enforced by Phase 7's context branch. `expires_at` is ≤ 4 h from creation, enforced server-side. |
| `platform_audit_logs` | Every platform-side action. Separate from tenant `audit_logs` because `AuditLog.tenantId` is `NOT NULL` and 131 callers depend on that. Populated via `src/lib/platform/audit-service.ts`. |
| `platform_login_attempts` | DB-counter table for rate limiting. 5 fails/email/15min → email lockout, 20 fails/IP/15min → IP lockout. The same table absorbs `bad_password`, `bad_totp`, AND `bad_recovery_code` failures — a brute-force loop on recovery codes trips the same lockout as a brute-force loop on passwords. |

**Auth flow** (three steps, once Phase 3 wires the tRPC layer):

1. **`passwordStep`** — operator enters email + password. On success, if MFA isn't enrolled yet returns `mfa_enrollment_required` with a 5 min enrollment token + a freshly generated (not-yet-persisted) base32 secret + an `otpauth://` URI for the QR code. Otherwise returns `mfa_required` with a 5 min challenge token.
2. **`mfaEnrollStep`** — operator scans the QR code, types their first 6-digit code. If it validates against the secret carried in the enrollment token, the service persists the encrypted secret + 10 argon2-hashed recovery codes, issues a session JWT, and returns the plaintext recovery codes (shown ONCE — never retrievable again).
3. **`mfaVerifyStep`** — operator types either a current TOTP code or one of their recovery codes. On success, issues the session JWT. Recovery codes are single-use: on match the matching hash is spliced out of the stored array and persisted.

**Session JWT details**: HS256 via `jose`, signed with `PLATFORM_JWT_SECRET`. Two lifetime cutoffs enforced on every `verify()`:
- **Absolute maximum**: 4 h from `sessionStartedAt`. Token is hard-rejected after that regardless of activity.
- **Sliding idle**: 30 min from `lastActivity`. Every response refreshes `lastActivity` to "now" via `refresh()`, so an active operator keeps the session alive indefinitely (within the 4 h cap). An operator who walks away for 30 min is auto-logged-out on the next request.

**Key files** (what exists today):

- Data layer: `prisma/schema.prisma` (models `PlatformUser`, `SupportSession`, `PlatformAuditLog`, `PlatformLoginAttempt`), `supabase/migrations/20260421000000_create_platform_admin_tables.sql`
- Auth primitives: `src/lib/platform/password.ts`, `src/lib/platform/jwt.ts`, `src/lib/platform/totp.ts`, `src/lib/platform/rate-limit.ts`
- Login orchestration: `src/lib/platform/login-service.ts` (exports `passwordStep`, `mfaEnrollStep`, `mfaVerifyStep`, `InvalidCredentialsError`, `InvalidMfaTokenError`, `RateLimitedError`, `AccountDisabledError`)
- Audit: `src/lib/platform/audit-service.ts` (`log`, `list`, `getById`, `PlatformAuditLogNotFoundError`)
- Bootstrap CLI: `scripts/bootstrap-platform-user.ts`
- Tests: `src/lib/platform/__tests__/` — 55 unit tests covering password / JWT / TOTP / rate limit / login service (including the 5×bad-recovery-code rate-limit guard)

**Key files** (planned, future phases):

- Phase 3: `src/trpc/platform/init.ts`, `src/trpc/platform/_app.ts`, `src/trpc/platform/routers/{auth,platformUsers,tenants,supportSessions,auditLogs}.ts`, `src/app/api/trpc-platform/[trpc]/route.ts`
- Phase 4: `src/middleware.ts` (absorbs `src/proxy.ts`), `src/app/platform/**/*.tsx`, `src/lib/platform/cookie.ts`
- Phase 5: `src/trpc/platform/client.tsx`, `src/hooks/use-platform-idle-timeout.ts`, `src/components/platform/sidebar.tsx`
- Phase 6: `src/app/[locale]/(dashboard)/admin/settings/support-access/page.tsx`, `src/components/auth/support-session-banner.tsx`, permission `platform.support_access.grant` in `src/lib/auth/permission-catalog.ts`
- Phase 7: `src/lib/platform/impersonation-context.ts` (AsyncLocalStorage), migration for the `Platform System` sentinel user (`00000000-0000-0000-0000-00000000beef`), extension of `src/trpc/init.ts:103` with the impersonation branch
- Phase 8: `src/app/api/cron/platform-cleanup/route.ts`, `src/e2e-browser/99-platform-support-consent.spec.ts`

**Bootstrapping the first operator**:

Since there's no platform UI yet to create operators (chicken-and-egg), use the CLI:

```bash
# Local dev — writes to the Supabase dev DB (localhost:54322)
pnpm tsx scripts/bootstrap-platform-user.ts tolga@terp.de "Tolga"

# Reset MFA for an operator who lost their TOTP device
pnpm tsx scripts/bootstrap-platform-user.ts --reset-mfa tolga@terp.de
```

The script prompts twice for a password (noecho via raw-mode stdin), enforces the 12-character minimum, and prints the target `DATABASE_URL` (password-redacted) so you can confirm you're not accidentally hitting prod. After the row is created, the operator can log in once Phases 3–5 ship.

**Running the bootstrap against staging or prod** (once you're actually ready to deploy, NOT for day-to-day local work):

```bash
# Option A — shell-substitute the remote DATABASE_URL from an encrypted env file
scripts/decrypt-env.sh        # gets .env.staging onto disk
DATABASE_URL="$(grep '^DATABASE_URL' .env.staging | cut -d= -f2-)" \
  pnpm tsx scripts/bootstrap-platform-user.ts admin@terp.de "Platform Admin"

# Option B — let Node load the env file for you
pnpm tsx --env-file=.env.staging scripts/bootstrap-platform-user.ts admin@terp.de "Platform Admin"
```

Do this **only from a trusted machine** — the script opens a direct DB connection with full write permissions; never run it from CI or a shared box. After first login from the Platform UI (Phase 5), additional operators are created through the UI, so this script is only needed for the initial bootstrap and for MFA recovery.

**Rate limit tuning**: all constants live in `src/lib/platform/rate-limit.ts` (`WINDOW_MS=15min`, `MAX_PER_EMAIL=5`, `MAX_PER_IP=20`). Intentionally aggressive because the platform surface has very few legitimate actors — if this turns out to be too tight in practice, relax `MAX_PER_EMAIL` first (the IP threshold also protects against attackers spraying a large dictionary across many accounts).

**Rotating `PLATFORM_JWT_SECRET`**: the secret is only used by `src/lib/platform/jwt.ts` — no other code path reads it. To rotate, set the new value in Vercel, redeploy, and every existing platform session is immediately invalidated (existing JWTs fail the HMAC check and trip the `invalid` branch in `verify()`). Operators just log in again. Zero tenant-side impact — the tenant app uses Supabase Auth, which has a separate JWT secret.

**Relationship to field encryption**: the platform code deliberately reuses `src/lib/services/field-encryption.ts` (`encryptField`/`decryptField`) for storing the TOTP secret at rest. No separate crypto module. This means `FIELD_ENCRYPTION_KEY_V1` rotation affects platform operators' stored TOTP secrets the same way it affects tenant-side encrypted fields — decrypt-re-encrypt is handled by the same key-versioning mechanism.
