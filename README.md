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

**Fix `EACCES` on `pnpm db:generate`**: if `src/generated/prisma/{internal,models}/` is root-owned after a prior Docker-based Prisma run, reset ownership without sudo:

```bash
docker run --rm -v ./src/generated:/t alpine chown -R $(id -u):$(id -g) /t
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

### Production Deployment

#### Infrastructure Overview

| Role | Prod | Staging |
|---|---|---|
| Tenant App | `app.t-erp.de` | `app.staging.t-erp.de` |
| Platform Admin | `admin.t-erp.de` | `admin.staging.t-erp.de` |
| Supabase Project | separate prod project | separate staging project |
| Vercel Environment | Production (branch: `master`) | Preview (branch: `staging`) |
| Git Branch | `master` | `staging` |

All four domains are CNAMEs to `cname.vercel-dns.com` (DNS at IONOS). Vercel provisions Let's Encrypt certificates automatically. The staging domains are assigned to the `staging` branch via Vercel's domain settings (Settings → Domains → Edit → Git Branch).

`PLATFORM_COOKIE_DOMAIN` controls the admin subdomain rewrite in `src/proxy.ts:16` — requests hitting the admin host get rewritten from `/` to `/platform`. Without this var, the platform admin is served at `/platform/*` on the same host as the tenant app.

#### Email Setup (IONOS)

Three separate email channels exist. Only the first two need IONOS credentials:

**1. Supabase Auth SMTP** (password reset, welcome, verify — configured per Supabase project in Dashboard → Authentication → Emails → SMTP Settings):

| Field | Value |
|---|---|
| Sender email | `noreply@t-erp.de` |
| Sender name | `Terp` (prod) / `Terp (Staging)` (staging) |
| Host | `smtp.ionos.de` |
| Port | `587` |
| Username | `noreply@t-erp.de` |
| Password | IONOS mailbox password |

**2. Tenant SMTP/IMAP** (outgoing invoices + incoming invoice polling — configured per tenant in tenant UI → Settings → Email):

| | SMTP (outgoing) | IMAP (incoming invoices) |
|---|---|---|
| Host | `smtp.ionos.de` | `imap.ionos.de` |
| Port | `587` (STARTTLS) | `993` (SSL) |
| Username | `noreply@t-erp.de` | `rechnung@t-erp.de` |
| From / Reply-To | `noreply@t-erp.de` / `ops@t-erp.de` | — |

**3. Demo convert notifications** — env var `DEMO_CONVERT_NOTIFICATION_EMAIL` (default `sales@terp.dev`), delivered via the demo tenant's own SMTP. Set to `ops@t-erp.de` in both environments.

IONOS enforces `From:` = authenticated mailbox. Rate limit ~100-300 mails/day per mailbox.

#### Syncing Env Files with Vercel

The local `.env.production` and `.env.staging` files should mirror what's in Vercel. To sync:

```bash
# One-time: link Vercel CLI to the project
npx vercel link

# Pull env vars from Vercel into plaintext files
npx vercel env pull .env.production --environment=production --yes
npx vercel env pull .env.staging --environment=preview --yes

# IMPORTANT: DATABASE_URL from Vercel may have sslmode=require.
# Change it to sslmode=no-verify (see note in env var table below).

# Re-encrypt for git
scripts/encrypt-env.sh
git add .env.production.vault .env.staging.vault
git commit -m "Update env vaults"
```

For scripts that need prod/staging DB access (e.g. bootstrap):

```bash
pnpm tsx --env-file=.env.production scripts/bootstrap-platform-user.ts ...
```

The bootstrap script preserves an externally-provided `DATABASE_URL` even when `.env.local` is present (it saves the value before dotenv loads and restores it after).

#### Pushing Migrations to Production

```bash
# Get the direct (non-pooling) DB URL from Vercel or .env.production
SUPABASE_DB_URL='<POSTGRES_URL_NON_POOLING value>' pnpm db:push:prod
```

Always create a Supabase backup (Dashboard → Database → Backups) before running migrations against prod.

#### New Tenant Checklist

When creating a tenant via `admin.t-erp.de` → Tenants → Create:

1. **Tenant + admin user are created automatically** — the admin gets a per-tenant "Administratoren" group with `is_admin=true` (full permissions, no explicit permission entries needed).
2. **Welcome email** — if the tenant has no SMTP configured yet (new tenant), the dialog shows a manual setup link. Copy it, send it to the admin, they set their password via the link.
3. **Enable modules** — Tenants → click tenant → Modules. Activate the modules the customer needs (CRM, Billing, Warehouse, etc.). The sidebar updates on next login.
4. **Configure tenant email** — the tenant admin configures SMTP (outgoing) and IMAP (incoming invoices) in their own tenant UI under Settings → Email. This is per-tenant, not platform-level.

#### Supabase Auth URL Configuration

Each Supabase project needs the correct redirect URLs (Dashboard → Authentication → URL Configuration):

| | Prod | Staging |
|---|---|---|
| Site URL | `https://app.t-erp.de` | `https://app.staging.t-erp.de` |
| Redirect URLs | `https://app.t-erp.de/**` | `https://app.staging.t-erp.de/**` |

Without this, password-reset and welcome-email links point to `localhost:3001`.

### Vercel Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `DATABASE_URL` | PostgreSQL connection URL (Supabase pooler) |
| `CRON_SECRET` | Secret for cron job authentication |
| `INTERNAL_API_KEY` | Secret for internal API authentication |
| `NEXT_PUBLIC_ENV` | `production` on both staging and prod. Only `development` for local dev (enables quick-login buttons on login page). |
| `NEXT_PUBLIC_APP_NAME` | Application display name |
| `NEXT_PUBLIC_APP_URL` | Base URL the app is served from. Used as the `redirectTo` target for Supabase recovery / welcome-email links. Must match `supabase/config.toml [auth] site_url` in local dev. Default: `http://127.0.0.1:3001`. |
| `PLATFORM_JWT_SECRET` | **Required.** Secret used to sign platform-admin session JWTs (HS256). Generate with `openssl rand -base64 48`. See [Platform Admin System](#platform-admin-system) below. Must be rotated independently from Supabase secrets. |
| `PLATFORM_COOKIE_DOMAIN` | Optional. Subdomain the platform-admin UI is served from (e.g. `admin.terp.de`) in prod. When set, the middleware rewrites `/` → `/platform` on that host and scopes the `platform-session` cookie to it. Leave empty in dev — platform is then served at `/platform/*` on the same host as the tenant app with a host-only cookie. |
| `PLATFORM_OPERATOR_TENANT_ID` | Optional. UUID of the "house" tenant that acts as the billing backend for all subscription invoices (Phase 10a). When set, platform module bookings on other tenants automatically create `BillingRecurringInvoice` rows inside this tenant. Leave empty to disable subscription-billing features entirely — module toggles still work, they just don't produce contracts. See [Platform Subscription Billing](#platform-subscription-billing-phase-10a) below. |

**Note:** When using the Supabase connection pooler (`pooler.supabase.com:6543`), `DATABASE_URL` **must** use `sslmode=no-verify` (not `sslmode=require`). The pooler (Supavisor) uses a self-signed certificate that Node.js's TLS rejects with `sslmode=require`. The connection is still encrypted — `no-verify` only skips certificate chain validation, which is safe for server-to-server connections within AWS. Example: `postgresql://...@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=no-verify&pgbouncer=true`.

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
   - Template data applied via `src/lib/tenant-templates/templates/*.ts` (today: `industriedienstleister_150` — ~150 employees, departments, bookings, groups)
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
- Template engine: `src/lib/tenant-templates/registry.ts`, `src/lib/tenant-templates/templates/industriedienstleister_150.ts`
- Cron: `src/app/api/cron/expire-demo-tenants/route.ts` (registered in `vercel.json`)
- Admin UI: `src/components/tenants/demo/*` mounted in `/admin/tenants/page.tsx`
- Expired page + gate: `src/app/[locale]/demo-expired/`, `src/components/layout/demo-expiration-gate.tsx`

**Environment variables**:

| Variable | Description |
|----------|-------------|
| `DEMO_CONVERT_NOTIFICATION_EMAIL` | Optional. Recipient for demo-convert-request notifications. Default: `sales@terp.dev`. |
| `CRON_SECRET` | Already documented above. Required for the expire-demo-tenants cron. |

**Adding a new template**: create `src/lib/tenant-templates/templates/<key>.ts` exporting a `TenantTemplate` (key, label, description, `apply(tx, tenantId)` function). Register it in `src/lib/tenant-templates/registry.ts`. The UI template dropdown is automatically populated from the registry.

**Rollback plan**: if the feature needs to be disabled temporarily, (a) remove the cron entry from `vercel.json`, (b) hide the demo panel in `/admin/tenants/page.tsx`, (c) set all demos to `is_demo=false, demo_expires_at=null` via one-off SQL. Data is preserved.

### Tenant Templates (Showcase & Starter)

Tenant-Templates leben unter `src/lib/tenant-templates/`. Jedes Template hat ein `kind`-Feld, das entscheidet, in welchem Pfad es verwendet wird:

- **`kind: "showcase"`** — wird im Demo-Pfad (`/platform/tenants/demo`) verwendet, läuft auf einem Demo-Tenant (`isDemo=true`) und seedet Stammdaten + Fake-Mitarbeiter + Beispiel-Belege. Heute: `industriedienstleister_150` (~150 Employees, Bayern-Feiertage, Demo-Rechnungen).
- **`kind: "starter"`** — wird im Tenant-Create-Pfad (`/platform/tenants/new` mit aktiviertem Template-Toggle) verwendet, läuft auf einem produktiven Tenant (`isDemo=false`) und seedet **ausschließlich** die branchen-typische Stammdaten-Ebene (Departments, Tariffs, DayPlans/WeekPlans, BookingTypes, AbsenceTypes, WhArticleGroups, Accounts) plus universelle Defaults (ReminderTemplates, EmailTemplates, ReminderSettings nach BGB §288 Abs. 2) und Feiertage für das operator-gewählte Bundesland. **Keine** Personen, Buchungen oder Belege. Heute: `industriedienstleister_starter`.

**Eine neue Branche hinzufügen**:

1. Neuen Ordner `src/lib/tenant-templates/templates/<branche>/` anlegen.
2. `shared-config.ts` mit `apply<Branche>Config(ctx)` schreiben — diese Funktion seedet Departments, Tariffs, etc. und gibt ein `TenantTemplateConfigResult` zurück.
3. `showcase.ts` mit dem `kind: "showcase"`-Template schreiben, das sowohl `applyConfig` als auch `applySeedData` (Personen + Belege) implementiert.
4. `starter.ts` mit dem `kind: "starter"`-Template schreiben, das `applyConfig` ruft und danach `seedUniversalDefaults(ctx.tx, ctx.tenantId)` aufruft.
5. Beide Templates in `src/lib/tenant-templates/registry.ts` registrieren.

**Wann welchen Pfad nutzen**:

- **Sales-Demo** (Showcase): `/platform/tenants/demo` mit dem heutigen Demo-Flow. Tenant bekommt ein Expiration-Gate und wird nach N Tagen deaktiviert.
- **Kunden-Go-Live** (Starter): `/platform/tenants/new` mit aktiviertem Toggle "Mit Branchen-Template starten". Operator füllt zusätzlich Firmen-Stammdaten (BillingTenantConfig), Bundesland und Default-Location aus. Tenant hat `isDemo=false` und startet produktiv.

**Key Files**:

- Registry + Interface: `src/lib/tenant-templates/registry.ts`, `src/lib/tenant-templates/types.ts`
- Branchen-Templates: `src/lib/tenant-templates/templates/<branche>/{shared-config,showcase,starter}.ts`
- Universal-Defaults-Seeder: `src/lib/tenant-templates/seed-universal-defaults.ts`
- Showcase-Pfad-Router: `src/trpc/platform/routers/demoTenantManagement.ts` (`templates`, `create`)
- Starter-Pfad-Router: `src/trpc/platform/routers/tenantManagement.ts` (`starterTemplates`, `createFromTemplate`)
- Admin-UI Starter: `src/app/platform/(authed)/tenants/new/page.tsx` (Template-Toggle)
- Admin-UI Showcase: `src/app/platform/(authed)/tenants/demo/page.tsx`

### Platform Admin System

A **separate security/identity domain above the tenant world** — its own `PlatformUser` table with argon2 credentials, its own tRPC context, its own API route, its own admin UI under `admin.terp.de` (with a same-host `/platform/*` fallback for dev), mandatory TOTP 2FA, and a tenant-side consent flow (`SupportSession`) that lets operators impersonate into a tenant only with explicit, time-boxed approval from a tenant admin. Every platform-initiated tenant write produces a double audit entry (tenant `AuditLog` + new `PlatformAuditLog`).

**Why this instead of a platform-admin flag on regular users?** The goals are (1) a blast radius that's strictly contained to the platform domain (a compromised tenant user can never escalate to operator), (2) no silent cross-tenant reads (every impersonation requires tenant-side consent first), (3) a complete audit trail on both sides, and (4) independent authentication (separate JWT secret, separate cookie, separate MFA enrollment) so rotating platform credentials doesn't disrupt tenant sessions. A flag-table approach couldn't deliver any of these.

**Plan & status**:

- **Plan**: `thoughts/shared/plans/2026-04-09-platform-admin-system.md` — the authoritative spec. Read this file before touching anything in `src/lib/platform/` or `src/trpc/platform/`.
- **Research**: `thoughts/shared/research/2026-04-09-platform-admin-system.md` — the initial codebase analysis that led to the plan.
- **Obsoleted**: the earlier `thoughts/shared/tickets/misc/platform-admin-tenant-access.md` (a simple `platform_admins` flag-table) is superseded and should be renamed `_OBSOLETE.md` in Phase 8.
- **Current phase**: **Phase 7 complete** (backend impersonation mechanic shipped) **+ UI bridge follow-up shipped** (operators have a clickable path end-to-end in dev). Phase 8 still pending — see the plan for the full breakdown:
  - Phase 1 ✅ Data model + bootstrap (tables, argon2, CLI)
  - Phase 2 ✅ Auth core (JWT, TOTP, rate limit, login service)
  - Phase 3 ✅ Platform tRPC layer (separate context, separate root router, `/api/trpc-platform`)
  - Phase 4 ✅ Routing & middleware (subdomain OR `/platform/*` fallback)
  - Phase 5 ✅ Platform UI (login, dashboard, tenants, support-sessions, audit logs, platform-users)
  - Phase 6 ✅ Consent flow (tenant-side `SupportSession` creation, settings page, yellow banner)
  - Phase 7 ✅ Impersonation (`createTRPCContext` branch + `AsyncLocalStorage` + audit dual-write)
  - **UI Bridge ✅** Dev-only wiring: "Tenant öffnen" button, client header injection, `AuthProvider` second auth source, `platform_audit_logs` end-to-end — see the dedicated subsection below
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

#### Platform Impersonation UI Bridge (dev-only)

Phase 7 landed the backend impersonation mechanic (sentinel user, `createTRPCContext` branch, `AsyncLocalStorage` + audit dual-write), but left the operator UX as "curl/devtools only" — no clickable path from the platform admin UI into the tenant dashboard. The UI Bridge plan (`thoughts/shared/plans/2026-04-10-platform-impersonation-ui-bridge.md`) closes that gap **for dev only** (same-host `localhost:3001`). Prod cross-host support (`admin.terp.de` ↔ `app.terp.de`) is explicitly deferred — see "What we're NOT doing" in the plan.

**What it enables end-to-end (dev):**

1. Tenant admin creates a pending `SupportSession` from `/de/admin/settings/support-access` (Phase 6)
2. Operator logs in at `/platform/login`, navigates to `/platform/support-sessions`, clicks "Beitreten" on the pending row — status flips to `active`
3. Operator switches to the "Aktiv" tab and clicks **"Tenant öffnen"** — browser hard-navigates to `/de/dashboard` with the target tenant auto-selected and the yellow support banner up top
4. Every mutation the operator makes writes a pair of rows: tenant `audit_logs` (author = Platform System sentinel) + `platform_audit_logs` (`action=impersonation.<original>`, `platform_user_id = real operator`, `support_session_id = session`)
5. Operator clicks **"Session verlassen"** in the banner — localStorage is cleared and the browser navigates back to `/platform/support-sessions`

**Env flag (must be set in dev, must be UNSET in prod):**

```bash
# .env.local
PLATFORM_IMPERSONATION_ENABLED=true
```

This is a kill-switch in `src/lib/config.ts` (implemented as a getter so `vi.stubEnv` works in tests). When unset, the entire impersonation branch in `src/trpc/init.ts:158` is dead code — the `if (!user && serverEnv.platformImpersonationEnabled)` guard short-circuits before the JWT verifier is even called. The primary prod safety is still cookie scoping (`PLATFORM_COOKIE_DOMAIN` keeps the `platform-session` cookie off the tenant host), but this flag is defense-in-depth: if someone sets a parent-domain cookie scope to prepare for cross-host UX, this flag must still be flipped before the branch becomes reachable.

**Client-side storage slot** (`src/lib/storage.ts` → `platformImpersonationStorage`):

```ts
interface PlatformImpersonationRef {
  supportSessionId: string
  tenantId: string
  expiresAt: string  // ISO 8601 — past-expiry entries auto-clear on read
}
```

localStorage key: `terp_platform_impersonation`. Non-HttpOnly by design — the actual auth token lives in the HttpOnly `platform-session` cookie; this slot only carries routing hints. An XSS-set slot is useless without the cookie because the backend validates the cookie's JWT, the MFA flag, AND the SupportSession row independently.

**Key files changed by the UI bridge** (additive to Phase 7):

| File | What it does |
|---|---|
| `src/lib/config.ts` | `serverEnv.platformImpersonationEnabled` getter |
| `src/lib/storage.ts` | `platformImpersonationStorage` helper with auto-expire |
| `src/trpc/init.ts` | Kill-switch wrap around the impersonation branch |
| `src/trpc/client.tsx` | Header injection (`getHeaders`, `httpSubscriptionLink.connectionParams`) + `impersonationErrorLink` for S3 |
| `src/trpc/routers/tenants.ts` | `tenants.list` reads `ctx.user.userTenants` under impersonation (DB has zero rows for the sentinel) |
| `src/providers/auth-provider.tsx` | Second auth source alongside Supabase; storage-event listener; logout-while-impersonating warning |
| `src/providers/tenant-provider.tsx` | `tenants.length === 0` guard is now load-bearing — comment-flagged, **do not remove** |
| `src/app/platform/(authed)/support-sessions/page.tsx` | "Tenant öffnen" button on active rows |
| `src/components/auth/support-session-banner.tsx` | "Session verlassen" variant when viewer is the operator |
| `messages/{de,en}.json` | `adminSupportAccess.bannerExit` i18n key |

**Three security mitigations that must stay in place** (each labeled in the plan for traceability):

- **S1 — Dev-only kill-switch**: `PLATFORM_IMPERSONATION_ENABLED` must remain unset in prod env. The impersonation branch in `src/trpc/init.ts` is dead code otherwise. If you prepare a cross-host cookie scheme, audit this flag's callers first.

- **S2 — No auth mixing**: `src/trpc/client.tsx` `getHeaders()` returns early when the storage slot is populated and **intentionally omits the `Authorization` header**. Without this, a concurrent Supabase tenant session in the same browser would hijack the request into the normal tenant-auth path — the mutation would succeed but `platform_audit_logs` would get no entry, creating a silent forensic gap. Do not add Supabase header fallback to this branch.

- **S3 — Auto-clear on UNAUTHORIZED**: The `impersonationErrorLink` in `src/trpc/client.tsx` watches for `UNAUTHORIZED` responses on requests carrying `x-support-session-id`. When it sees one, it clears the localStorage slot and hard-navigates to `/platform/support-sessions`. Without this, a tenant-admin revoke (during an active operator session) would leave the operator tab in a silent broken state — every subsequent request failing, banner still showing "aktiv bis HH:MM".

**Impersonation is super-admin by design.** The synthesized `ContextUser` carries `userGroup.isAdmin = true` (see `src/trpc/init.ts:217`), which bypasses every `requirePermission(…)` check in the tenant codebase. An active support session is effectively full write access for its lifetime — scoping to specific modules would require a parallel permission catalogue that Phase 7 did not build. The mitigating controls are (a) tenant-admin consent required to activate, (b) every mutation dual-logged with the real operator's ID, and (c) 4h hard expiry. If you need read-only or module-scoped support sessions, that's a new plan.

**Tenant isolation during impersonation**: `ctx.user.userTenants` is synthesized with exactly one entry (the target tenant). `tenantProcedure` at `src/trpc/init.ts:354-382` scans that array, so the operator cannot pivot to other tenants within one session — they'd need a separate SupportSession row, which requires separate tenant-admin consent.

**Audit trail reconciliation** — every impersonated mutation creates two audit entries that reconcile on timestamp + entity ID:

- **Tenant side** (`audit_logs`): `user_id = 00000000-0000-0000-0000-00000000beef` (sentinel), `entity_type`, `entity_id`, `changes` as usual. The tenant sees "Platform System did X" without needing platform access.
- **Platform side** (`platform_audit_logs`): `action = 'impersonation.<original_action>'` (e.g. `impersonation.update`), `platform_user_id = real operator`, `support_session_id`, same `entity_type` / `entity_id`, `metadata.originalUserId = sentinel`. Compliance can bridge "Platform System" → real human via this side.

**Testing the bridge end-to-end in dev**:

1. Start the dev server (`pnpm dev`) — confirm `.env.local` contains `PLATFORM_IMPERSONATION_ENABLED=true`
2. Log in as a tenant admin, navigate to `/de/admin/settings/support-access`, create a request (reason ≥10 chars, ttl 15-240 min)
3. Log out
4. Log in at `/platform/login` as your platform operator, complete MFA, land on `/platform/dashboard`
5. `/platform/support-sessions` → "Offen" tab → click "Beitreten" → switch to "Aktiv" tab → click "Tenant öffnen"
6. You should land on `/de/dashboard` with the tenant sidebar populated and the yellow banner up top. Dashboard will say "no employee for this user" — expected, the sentinel has no linked employee
7. Edit anything (an employee, a booking) → check `platform_audit_logs` for an `impersonation.update` row and `audit_logs` for a "Platform System" row
8. Click "Session verlassen" → back to `/platform/support-sessions`
9. Try navigating to `/de/dashboard` directly → you should be redirected to `/login` (impersonation cleared, no Supabase session)

**Prod cross-host follow-up** (NOT implemented): when prod cross-domain support lands, the localStorage slot may need to be replaced by a parent-domain cookie (`.terp.de`) or a signed one-time redirect token from `admin.terp.de` → `app.terp.de`. Phases 1, 3, and 4 of the UI bridge plan should not need changes — they're agnostic about where the impersonation state comes from. Phase 2 (transport layer) is the boundary that would need rethinking.

#### Production Requirements

Everything you need to stand up the platform-admin console on a real deployment (Vercel + hosted Supabase). Read this end-to-end before your first prod deploy — most of these are one-time setup, but skipping any of them will either break login, leak secrets, or permanently lock you out.

**1. Environment variables** (set in Vercel → Project → Settings → Environment Variables):

| Variable | Required | Notes |
|----------|----------|-------|
| `PLATFORM_JWT_SECRET` | ✅ | 32+ bytes of random data, base64. Generate with `openssl rand -base64 48`. Rotation invalidates all active platform sessions (see rotation note above). **Must NOT match any Supabase or tenant JWT secret** — that's the whole point of the separate identity domain. |
| `FIELD_ENCRYPTION_KEY_V1` | ✅ | Already required for tenant-side field encryption. The platform TOTP secrets are stored with the same key. If this isn't set, `mfaEnrollStep` throws at enrollment time. |
| `FIELD_ENCRYPTION_KEY_CURRENT_VERSION` | optional | Defaults to `1`. Only set when rotating to V2+. |
| `PLATFORM_COOKIE_DOMAIN` | recommended | E.g. `admin.terp.de`. When set, `src/proxy.ts` rewrites `/` → `/platform` on that host, and the `platform-session` cookie is scoped to that domain only. Leave empty to fall back to same-host `/platform/*` routing (fine for staging, not recommended for prod — see "Host separation" below). |
| `DATABASE_URL` | ✅ | Already required for the tenant app. Platform tables live in the same database (`platform_users`, `support_sessions`, `platform_audit_logs`, `platform_login_attempts`). |

**2. Database migrations**: the platform tables are in `supabase/migrations/20260421000000_create_platform_admin_tables.sql`. They ship with every `pnpm db:push:staging` / normal migration apply — no separate step. Verify post-deploy with `\dt platform_*` in psql.

**3. First operator bootstrap** (one-time, from a trusted machine — never CI):

```bash
# Decrypt the prod env file locally
scripts/decrypt-env.sh

# Verify the URL the script will hit (password-redacted) before continuing
pnpm tsx --env-file=.env.production scripts/bootstrap-platform-user.ts \
  you@terp.de "Your Name"
```

The script prompts twice for the password (≥12 chars, argon2id-hashed before write). On first login the platform-auth flow forces MFA enrollment — have a TOTP app ready (1Password, Authy, Google Authenticator). After enrollment you'll see 10 recovery codes **once** — store them in your password manager immediately; they're argon2-hashed server-side and not retrievable.

Every subsequent operator is created through the Platform UI (`/platform/platform-users`), not the CLI. Only use the CLI for (a) the very first operator and (b) `--reset-mfa <email>` when someone loses their TOTP device.

**4. Host separation** (strongly recommended, mandatory for anything customer-facing):

Deploy the platform console on a **dedicated subdomain** (`admin.terp.de`) rather than `/platform/*` on the tenant app domain. Reasons:

- Cookie isolation — the `platform-session` cookie scopes to its host, so a compromised tenant XSS cannot read the platform cookie (and vice versa).
- Reduced attack surface — your WAF/CDN can apply stricter rules (IP allowlist, geo-block, rate limits) to the admin host without affecting customer traffic.
- Clear audit boundaries — access logs for `admin.terp.de` contain exactly the platform-operator traffic, no noise.
- TLS + HSTS scoping — the admin subdomain can opt in to preload HSTS independently.

In Vercel: add `admin.terp.de` as a domain on the same project, then set `PLATFORM_COOKIE_DOMAIN=admin.terp.de`. The middleware at `src/proxy.ts:10-25` handles the rest — requests hitting `admin.terp.de/` get rewritten to `/platform`, and requests to the tenant domain never see the `/platform` tree.

DNS: standard `A`/`CNAME` to Vercel's edge. No wildcard needed.

**5. Operational hygiene**:

- **Rotate `PLATFORM_JWT_SECRET` every 90 days** or immediately if an operator's laptop is compromised. Rotation just means setting a new value in Vercel and redeploying — no migration, no data touch. Every active platform session is killed, operators just log in again.
- **Minimum 2 active platform users in prod at all times**. The router at `src/trpc/platform/routers/platformUsers.ts` enforces this as a hard invariant (you cannot delete or deactivate the last active operator via the UI), but bootstrap a second account *immediately* after the first so you have a peer operator who can reset your MFA if you lose your TOTP device. A single-operator setup is a wedge that turns a lost phone into a full DB restore.
- **Never run bootstrap from CI or a shared box**. The script opens a direct, unthrottled DB connection with full write permissions — it is explicitly a trusted-laptop tool. If prod needs a new operator and no trusted laptop is available, temporarily restore access via an existing operator's UI instead.
- **Do not expose `admin.terp.de` to search engines**. The platform layout already sets `robots: { index: false, follow: false }` metadata, but also consider an IP allowlist at the edge if your operator team is <10 people.
- **Monitor `platform_audit_logs`**. Every login, every support session activation, every platform-user mutation writes a row. Wire a Grafana/Supabase alert on unusual patterns — bursts of `login.failure`, off-hours `support_session.activated`, unexpected `platform_user.created`. The Phase 8 cleanup cron will also age out old `platform_login_attempts` rows; until then the table grows monotonically, so either run Phase 8 or schedule your own monthly truncate.
- **Do not copy the TOTP secret between environments**. Each operator enrolls MFA separately on staging and on prod — don't try to "sync" them. The recovery-code flow exists exactly so that losing access on one environment doesn't compromise another.

**6. Testing before shipping operator access**: after bootstrap, manually verify in staging:

- Password → QR enrollment → 6-digit → recovery codes → dashboard
- Log out, log back in: password → 6-digit → dashboard (no re-enrollment)
- Try a recovery code — it should work once, then fail on replay
- Walk away for 30 min, come back, click anything — you should be redirected to `/platform/login?reason=idle_timeout`
- From a peer account, reset your own MFA, then log in again and re-enroll

If all five pass on staging, you're ready for prod. If any fails, **do not** bootstrap a prod operator until it's fixed — you'd be locking in a broken flow.

#### Recovery & Lockout Procedures

An operator lost their TOTP device / phone / laptop. They cannot log in. You have three ways to get them back, in order of preference:

**Option A — Peer operator via the Platform UI (preferred).** Any other active operator opens `/platform/platform-users`, finds the locked-out user, and clicks the "MFA Reset" button (`src/app/platform/(authed)/platform-users/page.tsx`). This calls `platformUsers.resetMfa`, which clears `mfaSecret` + `mfaEnrolledAt`. On the locked-out operator's next login, the password step returns `mfa_enrollment_required` and they walk through fresh QR enrollment. Zero CLI, zero DB access, fully audited in `platform_audit_logs` (`action = 'platform_user.mfa_reset'`).

> This is **why every prod install needs at least 2 active operators**. If you're alone and lose your TOTP, you fall back to Option B or C — both of which require trusted-machine access to prod secrets.

**Option B — Bootstrap CLI (when there's no peer operator).** From a trusted laptop with `.env.production` decrypted:

```bash
scripts/decrypt-env.sh
pnpm tsx --env-file=.env.production scripts/bootstrap-platform-user.ts \
  --reset-mfa you@terp.de
```

This directly connects to the prod DB with full write permissions, clears `mfa_secret`, `mfa_enrolled_at`, AND `recovery_codes` (the CLI uses `Prisma.DbNull` which actually writes, unlike the router's current `undefined` — see the known issue below). Same outcome: next login forces re-enrollment.

The CLI writes its own `platform_audit_logs` entry (`action = 'platform_user.mfa_reset'`, `platform_user_id = NULL`, `metadata = { source: 'bootstrap-cli', invokedBy, hostname, targetEmail }`) so the forensic trail records **who ran the CLI from which machine** even though no Platform-UI session exists. Same applies to `scripts/bootstrap-platform-user.ts <email> <displayName>` — the initial-create path emits a `platform_user.created` audit entry with the same metadata shape.

**Option C — Direct SQL (emergency only, no CLI available).** Connect via `psql` to the prod Supabase DB (get the connection string from Supabase Dashboard → Database → Connection → URI, or from `.env.production`). Then:

```sql
-- Reset MFA for a specific operator. Next login forces re-enrollment.
UPDATE platform_users
SET mfa_secret      = NULL,
    mfa_enrolled_at = NULL,
    recovery_codes  = NULL
WHERE email = 'you@terp.de'
RETURNING id, email, display_name, is_active;
```

Verify the row count is `1` before committing (if you're in a transaction). Double-check the email spelling — there is no undo.

**What NOT to do from the DB:**

- **Never touch `password_hash` directly.** argon2id hashes are not something you type by hand; generating a replacement hash outside the service risks parameter mismatches. If a password reset is needed, use the Platform UI (`platformUsers.updatePassword`) from a peer operator, or delete the row and re-bootstrap with the CLI.
- **Never clear just `mfa_secret` and leave `mfa_enrolled_at` set.** That puts the row in an inconsistent state where `mfaVerifyStep` throws `InvalidCredentialsError` on every login (the service treats "enrolled but no secret" as a tampered challenge). Always clear both.
- **Never delete rows from `platform_audit_logs` to "clean up".** It's an immutable forensic trail. If you need to prune for disk space, run the Phase 8 cleanup cron when it ships, or a dated `DELETE WHERE performed_at < now() - interval '1 year'` — never target specific operators or actions.
- **Never reset MFA on the last active operator without a plan to re-enroll immediately.** If the re-enrollment login fails for any reason (network, bad TOTP clock, bug), you've just locked the platform.

**After a direct-SQL reset (Option C only), write an audit entry manually** — the UI path (Option A) and the CLI path (Option B) both emit `platform_audit_logs` entries on their own. Raw SQL does not. Insert a row like this in the same psql session, right after the `UPDATE`:

```sql
INSERT INTO platform_audit_logs (
  platform_user_id, action, entity_type, entity_id, metadata, ip_address, user_agent
) VALUES (
  NULL,
  'platform_user.mfa_reset',
  'platform_user',
  (SELECT id FROM platform_users WHERE email = 'you@terp.de'),
  jsonb_build_object(
    'source', 'direct-sql',
    'invokedBy', current_user,
    'reason', 'lost TOTP device'
  ),
  NULL,
  NULL
);
```

The forensic review later only trusts what's in the table — if Option C is used without this manual insert, there is a silent gap in the trail.

**Lost password (not MFA)**: same decision tree. Peer operator via UI (`platformUsers.updatePassword`) is preferred. Bootstrap CLI doesn't currently have a `--reset-password` flag, so the fallback is to `DELETE FROM platform_users WHERE email = '…'` and re-bootstrap from scratch — the operator will need to re-enroll MFA on next login regardless.

**Known issue — `resetMfa` recovery codes**: the router's `resetMfa` mutation (`src/trpc/platform/routers/platformUsers.ts:143`) currently passes `recoveryCodes: undefined`, which is a Prisma no-op — the old hashed recovery codes stay in the DB after a UI reset. Functionally harmless (the next enrollment overwrites them, and `mfaVerifyStep` throws as soon as `!mfaEnrolledAt`), but defense-in-depth-wise the codes should be cleared. The CLI path (`--reset-mfa`) uses `Prisma.DbNull` and does clear them. Fix pending — tracked as a follow-up to Phase 5.

### Platform Subscription Billing (Phase 10a)

The dogfood billing bridge: every time an operator books a module for a customer tenant through the platform admin UI, the platform also creates a `BillingRecurringInvoice` inside a designated "house" tenant, which then produces finalized monthly/annual invoices through the tenant app's own billing module — the exact same PDF + XRechnung pipeline customers already use for their own recurring billing. The platform operator becomes a first-class customer of their own billing product.

**Why dogfood**: no parallel billing engine, no Stripe integration, no second PDF stack. Everything reuses `BillingRecurringInvoice`, `BillingDocument.finalize()`, `billing-document-pdf-service`, and `billing-document-einvoice-service`. Every bug in the billing flow is a bug the operator feels personally, which is the strongest possible QA against drift between "platform billing" and "tenant billing" — they cannot diverge by construction.

**Plan & status**:

- **Plan**: `thoughts/shared/plans/2026-04-10-platform-subscription-billing.md` — authoritative spec with the full phase breakdown, decision log, and flag tracker. Read before modifying `src/lib/platform/subscription-*.ts` or the autofinalize cron.
- **Research**: `thoughts/shared/research/2026-04-10-platform-subscription-billing.md` — codebase analysis that led to the plan.
- **Current status**: Phase 10a complete. Phases 10b (auto-email delivery) and 10c (SEPA Lastschrift) are explicitly deferred — see "Out of scope" below.

#### The "House" tenant concept

The platform binds to **one Terp tenant per environment** that plays two roles simultaneously:

1. **Your own working tenant** — you log in to it like any other tenant (normal Supabase auth, not platform auth) and use Terp for your own company's day-to-day operations.
2. **The billing backend for every customer subscription** — recurring invoices, `CrmAddress` rows for each customer, generated `BillingDocument` rows, payments, Mahnwesen all live inside this tenant.

The house tenant is identified by `PLATFORM_OPERATOR_TENANT_ID` — a single env var per environment. Dev, staging, prod each have their own value. Setting it is the entire bootstrap — there is no DB flag, no platform UI field, no separate setup script. The value is read from `serverEnv.platformOperatorTenantId` (a getter in `src/lib/config.ts` so `vi.stubEnv` works in tests) and compared at request time via `subscriptionService.isOperatorTenant(tenantId)`.

**Setup in three steps**:

1. Find the UUID of your house tenant: `SELECT id, name FROM tenants WHERE slug = '<your-slug>'`.
2. Set `PLATFORM_OPERATOR_TENANT_ID=<uuid>` in `.env.local` (dev), Vercel env (staging/prod).
3. Restart the app. On startup you should see:
   ```
   [platform-subscriptions] Operator tenant "<name>" active. This tenant is
   the "house" — modules booked on it will NOT generate self-issued invoices.
   All other tenants will be billed normally.
   ```
   If the env var points at a non-existent UUID you get a warning but the app still boots — subscription features throw at request time, everything else works.

**Changing the house tenant later is deliberately unsupported**. There's no migration, no UI switch. If your company restructures, it's a manual SQL job with data migration — the plan calls this out explicitly because for 0–5 customers with a single operator, a switch-feature isn't worth building.

#### The "no self-billing" guard

A hard rule enforced at two layers: **the house tenant is never billed for modules booked on itself**. When you enable a module on your own house tenant (e.g. you want to use CRM internally), the feature toggle works normally but no subscription is created.

- **Router layer**: `enableModule` and `disableModule` in `src/trpc/platform/routers/tenantManagement.ts` check `subscriptionService.isOperatorTenant(input.tenantId)` and skip the subscription block entirely — `tenant_modules` upsert/delete still runs, but `createSubscription` / `cancelSubscription` are never called. The audit log still records the action with `subscriptionId: null`, `billingRecurringInvoiceId: null` so the absence is traceable.
- **Service layer (defense-in-depth)**: `subscriptionService.createSubscription` throws `PlatformSubscriptionSelfBillError` if `customerTenantId === operatorTenantId`. A direct service call bypassing the router still cannot create a self-billing subscription.

This prevents the footgun where an operator clicks "enable CRM for our own company" and unintentionally starts generating monthly self-invoices that have no legal or bookkeeping meaning.

#### Billing-exempt tenants (non-paying customers)

A per-tenant boolean flag `tenants.billing_exempt` (added in migration `20260423100000_add_tenant_billing_exempt.sql`) marks customers that **use the platform but are never automatically invoiced** — sales partners, pilot accounts, frame-contract exceptions, anyone the operator wants to keep in the CRM but bill manually (or not at all). It's **orthogonal** to `PLATFORM_OPERATOR_TENANT_ID`: the house tenant is always implicitly exempt via the self-bill guard above; the flag is for "we know this customer, we just don't want to charge them through the automatic bridge."

**What a subscription ("Abo") actually is**: a `PlatformSubscription` row paired with a `BillingRecurringInvoice` inside the operator tenant. Together they mean "the nightly cron will generate a fresh `BillingDocument` every cycle for this customer." Toggling the exempt flag is the only way to enable module bookings **without** creating this pair — everything else (module availability, UI, tenant lifecycle) is untouched.

**What happens on module enable for an exempt tenant**:

| Action                                          | Normal customer | Exempt customer |
| ------------------------------------------------ | --------------- | --------------- |
| `tenant_modules` row upsert                      | ✅              | ✅              |
| `CrmAddress` in operator tenant (first module)   | ✅              | ✅              |
| `PlatformSubscription` row                       | ✅              | ❌              |
| `BillingRecurringInvoice` row/join               | ✅              | ❌              |
| Nightly DRAFT invoice generated                  | ✅              | ❌              |
| Audit row in `platform_audit_logs`               | ✅              | ✅ (`billingExempt=true`) |

The CrmAddress is still created because the operator needs to see the customer in their CRM ledger (for manual invoicing, support contacts, correspondence) even when nothing is auto-billed. `findOrCreateOperatorCrmAddress` is idempotent, so re-enabling modules doesn't duplicate it.

**Defense-in-depth**: `subscriptionService.createSubscription` does a `SELECT billing_exempt FROM tenants WHERE id=?` inside its transaction and throws `PlatformSubscriptionBillingExemptError` if the flag is true. Direct service callers that forget the check fail loud instead of silently generating phantom recurring invoices.

**UI touchpoints**:

- **`/platform/tenants/new`** — checkbox "Automatische Fakturierung" (default on = normal billing). Unchecking creates the tenant with `billing_exempt=true` from the start.
- **`/platform/tenants/<id>`** → Übersicht — amber `Nicht fakturierbar` badge next to the Demo badge when the flag is set.
- **`/platform/tenants/<id>`** → Einstellungen → **Fakturierung** card — toggle button opens a confirmation dialog with a mandatory reason (3–500 chars). Each flip writes one `platform_audit_logs` row with `action="tenant.billing_exempt_changed"`, `changes={billingExempt:{old,new}}`, `metadata.reason`.
- **`/platform/tenants/<id>/modules`** — amber info banner at the top of the modules list warning the operator that bookings on this tenant won't create subscriptions.
- **`/platform/tenants/demo`** → convert dialog — new checkbox "Von Fakturierung ausnehmen" lets the operator convert a demo straight into the exempt state in one step (skips the subscription bridge, still creates the CrmAddress).

**No retroactive changes** — by design, and surfaced in the dialog warnings:

- **Normal → Exempt**: active subscriptions are **not auto-cancelled**. The operator must disable each active module manually if they want the existing recurring invoices to stop. Reasoning: cancellation is money-relevant and should never be a side-effect of a settings toggle.
- **Exempt → Normal**: previously-booked modules do **not** retroactively get subscriptions. The operator must disable and re-enable each module to create the subscription. Reasoning: a bulk "create subscriptions for all currently-enabled modules" would silently start billing the customer without them seeing a new contract.

**Operator tenant is not toggleable**: `setBillingExempt` rejects a flip on the tenant pointed at by `PLATFORM_OPERATOR_TENANT_ID` with `BAD_REQUEST "Der Operator-Tenant kann nicht umgeschaltet werden"`. The house rule already covers it; having two conflicting sources of truth for "is the operator exempt" would just confuse future debugging.

**Key files**:

- `supabase/migrations/20260423100000_add_tenant_billing_exempt.sql` — column + comment
- `src/lib/platform/subscription-service.ts` — `PlatformSubscriptionBillingExemptError` + transaction-level guard
- `src/trpc/platform/routers/tenantManagement.ts` — `create` input field, `setBillingExempt` mutation, exempt-path branches in `enableModule` / `disableModule`
- `src/trpc/platform/routers/demoTenantManagement.ts` — `convert` input field + skip branch
- `src/app/platform/(authed)/tenants/new/page.tsx`, `[id]/page.tsx`, `[id]/modules/page.tsx`, `demo/page.tsx` — UI
- Plan: `thoughts/shared/plans/2026-04-13-platform-billing-exempt-tenants.md`

#### Business workflow (step by step)

The actual lifecycle of a customer, from prospect to long-term billing:

1. **Customer agrees to use Terp** — sales/contract step, happens outside Terp.
2. **Create the tenant via `/platform/tenants → Tenant erstellen`** — fills name, slug, address, initial admin email. A `tenants` row, an initial admin user, and a welcome email are created. **No `CrmAddress`, no `platform_subscription`, no recurring invoice yet** — lazy creation is intentional (see "CrmAddress lazy creation" below).
3. **Agree on module package + cycle** — which modules (Core/CRM/Billing/Warehouse/Inbound Invoices), which billing cycle (MONTHLY / ANNUALLY). Prices are hardcoded in `src/lib/platform/module-pricing.ts` (`MODULE_PRICES`).
4. **Enable modules via `/platform/tenants/<id>/modules`** — for each module: click **Aktivieren**, fill the optional operator note, select the billing cycle, submit. Under the hood:
   - First module for this customer: creates a new `CrmAddress` inside the house tenant from the tenant's address fields, creates a new `BillingRecurringInvoice`, creates a `platform_subscription` row, links everything.
   - Second module on the **same cycle**: joins the existing recurring invoice — adds a position to `positionTemplate` and a marker to `internalNotes`, creates a new `platform_subscription` row pointing at the same `billingRecurringInvoiceId`.
   - Second module on a **different cycle**: creates a second recurring invoice (monthly and annual cannot share, by design).
5. **Hand off login** — welcome email gives the customer's admin a one-shot recovery link. They log in at the tenant URL, land in their own Terp, see only the modules you enabled. They never see the platform layer.
6. **Nightly crons generate + finalize invoices**:
   - **04:00 UTC** — `/api/cron/recurring-invoices` (existing Terp cron, **unchanged by Phase 10a**) generates DRAFT `BillingDocument` rows for every recurring template whose `nextDueDate` has arrived. Cross-tenant — picks up both tenant-internal recurring invoices and platform-subscription-driven ones.
   - **04:15 UTC** — `/api/cron/platform-subscription-autofinalize` (new platform cron) finds the DRAFTs generated today for platform subscriptions (matched via the `[platform_subscription:<id>]` marker in `internalNotes`), calls `billingDocService.finalize()` on each, which transitions DRAFT → PRINTED and triggers PDF + XRechnung generation as a side effect. Also sweeps cancelled subscriptions whose recurring template has deactivated into status `ended`.
7. **Send the invoices** (manual, ~2 clicks per invoice) — you log in to your **own house tenant** (tenant auth, not platform), open Fakturierung → Rechnungen, see the newly PRINTED invoices, click the send-email button on each. For 5 customers with monthly billing that's ~10 clicks per month. Auto-email is deferred to Phase 10b.
8. **Customer pays** — you log their bank transfer as a Payment against the invoice in the house tenant's normal billing UI. Invoice status flips from "open" to "paid", and the Überfällig badge on the platform modules page clears automatically.
9. **Customer cancels modules** — click **Deaktivieren** on each module in the platform admin:
   - **Path A — last active subscription on this recurring invoice**: sets the recurring invoice's `endDate = nextDueDate - 1ms`, which trips the upfront gate in `billing-recurring-invoice-service.generate()` on the next cron run. Zero more invoices generated. The `sweepEndedSubscriptions` step promotes the subscription from `cancelled` to `ended` once the recurring deactivates.
   - **Path B — other subscriptions still share this recurring invoice**: removes this module's position from `positionTemplate` (matched by `description === MODULE_PRICES[module].description`) and removes this subscription's marker from `internalNotes`. The recurring invoice keeps running for the remaining modules. The cancelled subscription row records `end_date = cancelledAt`, `status = cancelled`, the reason, and the platform user who cancelled.
10. **Customer leaves permanently** — you deactivate the tenant itself via `/platform/tenants/<id>` → Deaktivieren. The tenant's data stays in the DB for audit/legal reasons (no hard delete in Phase 10a).

**CrmAddress lazy creation**: step 2 does NOT create a `CrmAddress` in the house tenant. The `CrmAddress` is created on the **first `enableModule` call** for that customer (step 4), and reused for subsequent module bookings of the same customer. This is deliberate — test/demo tenants you throw away never pollute the house tenant's CRM. The downside is that a tenant without any modules enabled has no CRM presence in the house tenant, which means no ad-hoc invoicing is possible before the first module booking. For the intended business model (SaaS monthly subscriptions, no ad-hoc charges before contract signature), this is the right trade-off.

#### Mental model: three levels you log into

Phase 10a introduces a second login context you actively work in. In total there are three:

1. **Platform admin** (`/platform/login`, eventually `admin.terp.de`) — the god view. Only used to create/deactivate tenants and toggle modules. You manage *customers* here.
2. **Your own tenant (the house tenant)** — normal tenant login at the tenant URL. This is where you run your own business AND where all customer invoices physically live. You send invoices, track payments, and manage your own CRM here. You log in daily.
3. **Customer tenants** — you almost never log in. The customer does. The only path for you to enter a customer tenant is via the Phase 6/7 consent-based impersonation flow — an explicit, time-boxed, dual-audited `SupportSession` the customer's admin must create first.

The subscription bridge connects level 1 (where bookings happen) to level 2 (where invoices live). Level 3 is orthogonal — Phase 10a does not touch it.

#### What Phase 10a adds on top of Phase 9

Phase 9 gave the operator the ability to create/deactivate customer tenants and toggle modules on/off — but those toggles were pure feature gates with no billing linkage. Phase 10a turns the module toggle into a real monetized contract:

| Concern | Phase 9 | Phase 10a |
|---|---|---|
| Create a tenant | ✅ | ✅ (unchanged) |
| Enable a module | Feature toggle only | Feature toggle + subscription + recurring invoice in house tenant |
| Track "who's paying what" | No — `operator_note` was a free-text breadcrumb | Yes — `platform_subscriptions` table with status lifecycle |
| Monthly invoicing | Manual outside Terp | Automated via crons, invoice lives in house tenant |
| Finalize invoices | Manual | Automated (04:15 UTC autofinalize cron) |
| Email delivery | — | Manual (~2 clicks per invoice, ~10 clicks/month for 5 customers) |
| Cancel a subscription mid-cycle | Delete the `tenant_modules` row | Same, PLUS subscription lifecycle (Path A sets `endDate`, Path B removes position + marker) |

#### Minimal monthly operational effort

Target for 0–5 customers:

- **Per new customer onboarding**: ~5 minutes in the platform UI (create tenant + enable modules).
- **Per month, recurring**: ~5 minutes to send the finalized invoices from the house tenant's billing UI. Crons do everything else automatically at 04:00 + 04:15 UTC.
- **Per incoming payment**: the normal billing workflow you already use for any other invoice — record the bank transfer, the overdue badge clears automatically.

Total operator overhead for subscription billing at 5 customers: well under 30 minutes per month.

#### How the bridge works under the hood

**Shared-invoice model**: Multiple active subscriptions for the same customer share **one** `BillingRecurringInvoice` per `(customerTenantId, billingCycle)` combination. A customer with 3 monthly modules gets ONE monthly recurring invoice with 3 positions — not 3 separate recurring invoices. Maximum 2 recurring invoices per customer: one MONTHLY, one ANNUALLY. The `platform_subscriptions` table still has one row per module (1-to-1 with module bookings); multiple rows can point at the same `billing_recurring_invoice_id`.

**Marker convention**: The subscription-service writes `[platform_subscription:<uuid>]` to `BillingRecurringInvoice.internalNotes` at creation time. Under the shared-invoice model a recurring invoice's `internalNotes` contains a space-separated list of markers, one per active subscription. The existing `billing-recurring-invoice-service.generate()` at line 357 copies `internalNotes` verbatim onto every generated `BillingDocument`, so every generated invoice carries markers for all subscriptions that contributed a position. The autofinalize cron uses a `contains` match on a single subscription's marker to find the DRAFT invoice — this matches correctly even when the invoice carries multiple markers.

**Autofinalize shared-doc deduplication**: When two subscriptions share the same DRAFT document, the first one's `finalize()` call flips it to PRINTED. The autofinalize loop finds the document by marker regardless of status and branches:
- Status is DRAFT → finalize + track in `finalizedThisRun` set
- Status is not DRAFT but id is in `finalizedThisRun` → sibling already finalized this run, just update the pointer + audit with `sharedDoc: 'already-finalized-this-run'`
- Status is not DRAFT and id is not in `finalizedThisRun` → prior-run partial failure, recover by updating the pointer only

This was a real bug the integration tests caught: the original code filtered by `status = 'DRAFT'` in the query, which returned null for siblings after the first finalize flipped the state. Mocks in unit tests didn't simulate the status change so the bug slipped through. The fix shows exactly why integration tests against the real DB are worth the extra cost.

**Two separate crons, not one extended cron** — the existing `/api/cron/recurring-invoices` is treated as Terp infrastructure and is **not modified** by Phase 10a. The new autofinalize cron runs 15 minutes later and reconstructs "what did the 04:00 cron generate today for platform subscriptions" via DB queries (`BillingRecurringInvoice.lastGeneratedAt >= today 00:00 UTC` + marker match). Order matters — running autofinalize first produces a zeroed summary, no state pollution. In production they're scheduled 15 minutes apart so ordering is automatic.

#### Hard constraint: Terp code stays unchanged

Operator-declared rule for Phase 10a: **Terp-side services (`src/lib/services/billing-*`, `src/lib/services/crm-*`, `src/lib/services/email-*`, `src/trpc/routers/*`) are not modified by platform features.** Platform code may READ Terp models directly via Prisma, but all WRITES go through the existing Terp services with `(prisma, tenantId, …)` as plain parameters.

Two design consequences:

1. **No Prisma `@relation` fields on Terp models.** The `PlatformSubscription` model has plain `String? @db.Uuid` columns for `operatorCrmAddressId`, `billingRecurringInvoiceId`, `lastGeneratedInvoiceId` — no `@relation` declarations, no inverse relations added to `CrmAddress` / `BillingRecurringInvoice` / `BillingDocument`. The SQL-level foreign keys (via `REFERENCES` clauses in the migration) enforce referential integrity at the DB level with `ON DELETE SET NULL`, but Prisma's generated TypeScript types for those Terp models remain byte-identical — they don't gain a `platformSubscriptions` array field. Platform code reads related Terp rows via explicit two-query patterns (e.g. `listForCustomer` batch-fetches recurring invoices and last-generated docs in separate queries instead of using `include`).

2. **A new cron route instead of extending the existing one.** `/api/cron/recurring-invoices/route.ts` is not touched. The new `/api/cron/platform-subscription-autofinalize/route.ts` is a pure platform route that reads Terp models directly via Prisma (read-only, via defense-in-depth `tenantId` filters) and writes Terp rows exclusively through `billing-document-service.finalize()`.

#### Key files

| File | Purpose |
|------|---------|
| `src/lib/platform/module-pricing.ts` | Hardcoded `MODULE_PRICES` catalog. Description field is a stable identifier used by cancellation Path B — **do not change descriptions on shipped modules** without a migration plan (see FLAG 9 in the plan). |
| `src/lib/platform/subscription-service.ts` | Core bridge logic: `createSubscription`, `cancelSubscription` (Path A/B), `findOrCreateOperatorCrmAddress`, `listForCustomer`, `sweepEndedSubscriptions`, `isOperatorTenant`, marker helpers. Errors: `PlatformSubscriptionConfigError`, `PlatformSubscriptionNotFoundError`, `PlatformSubscriptionSelfBillError`. |
| `src/lib/platform/subscription-autofinalize-service.ts` | `autofinalizePending` — scans active subscriptions, finds today's DRAFTs, finalizes them with shared-doc dedup. Returns a summary with `scanned`, `finalized`, `subscriptionPointersUpdated`, `skippedSharedDocAlreadyFinalizedThisRun`, `endedSubscriptions`, `errors`. |
| `src/app/api/cron/platform-subscription-autofinalize/route.ts` | Cron entry point. Validates `CRON_SECRET`, calls `autofinalizePending`, returns JSON summary. |
| `src/trpc/platform/routers/tenantManagement.ts` | `listSubscriptions` query + subscription wiring in `enableModule` / `disableModule` (house-tenant guard applied here). |
| `src/app/platform/(authed)/tenants/[id]/modules/page.tsx` | Modules page with the billing cycle selector in the Aktivieren dialog and the Abo column showing cycle, price, next-due date, last invoice number, and overdue badge. |
| `prisma/schema.prisma` — `PlatformSubscription` | Subscription state table. No `@relation` fields on purpose. |
| `supabase/migrations/20260422000000_create_platform_subscriptions.sql` | Schema + CHECK constraints (status ∈ {active, cancelled, ended}, cycle ∈ {MONTHLY, ANNUALLY}, module ∈ {core, crm, billing, warehouse, inbound_invoices}, cancelled/ended-state field consistency) + 4 indexes + SQL-level FKs. |
| `src/lib/platform/__tests__/subscription-service.integration.test.ts` | 6 integration tests against the real dev DB: createSubscription, shared-invoice join, end-to-end cron flow, self-bill guard, isOperatorTenant, Path B cancellation. Caught the shared-doc autofinalize bug. |
| `thoughts/shared/plans/2026-04-10-platform-subscription-billing.md` | The full plan with flag tracker (10 flags documenting accepted trade-offs), manual verification checklist, and out-of-scope breakdown. |

#### Cron schedule and failure modes

`vercel.json`:

```json
{ "path": "/api/cron/recurring-invoices", "schedule": "0 4 * * *" },
{ "path": "/api/cron/platform-subscription-autofinalize", "schedule": "15 4 * * *" }
```

**Failure modes**:

- **Main cron succeeds, autofinalize fails**: DRAFT invoices exist but not finalized. You manually finalize them from the house tenant's billing UI. The next day's autofinalize run picks them up automatically if they're still DRAFT (marker + `lastGeneratedAt` checks still pass).
- **Main cron fails, autofinalize runs anyway**: autofinalize finds no new DRAFTs (nothing was generated), returns a zeroed summary. No state pollution.
- **Both succeed**: normal flow, all invoices PRINTED.
- **Reversed order** (autofinalize before generate — only possible via manual curl, not in prod): autofinalize returns zeroed summary (`skippedNotDueToday` for every sub), the next generate run creates the DRAFTs, the next autofinalize picks them up.

#### Operator tenant bootstrap in staging / prod

**FLAG 1 from the plan — `NumberSequence` row must exist**: The house tenant in staging/prod must have a `number_sequences` row for the `invoice` key before the first subscription billing run, otherwise the first generated invoice number will literally be `"1"` with an empty prefix. The dev seed handles this automatically (`RE-` prefix), but staging/prod need a one-time SQL:

```sql
INSERT INTO number_sequences (tenant_id, key, prefix, next_value)
VALUES ('<prod-house-tenant-id>', 'invoice', 'RE-', 1);
```

Do this **before** enabling any modules on customer tenants in prod.

#### Out of scope (deferred to later phases)

- **Phase 10b — Auto-email delivery**: the autofinalize step currently stops at PRINTED + PDF + XRechnung. Email delivery is manual. Deferred because email has the most edge cases (SMTP down, bounces, wrong recipient) and the per-operator click cost is ~10 clicks/month for 5 customers.
- **Phase 10c — SEPA Lastschrift**: no `pain.008.xml` generation, no mandate management, no Creditor-ID registration, no return-debit handling. Large standalone project.
- **Automated Mahnwesen / dunning**: operator checks overdue status via the tenant-side `listOpenItems` UI and nudges customers manually. The platform modules page shows a small "überfällig" badge as a hint, nothing more.
- **Pro-rated cancellation / mid-cycle refunds**: customer is billed through end of current period. No pro-rata, no partial refunds. If you want to refund, issue a credit note manually in the house tenant's billing UI.
- **Tiered pricing, volume discounts, promo codes**: `unit_price` is a single flat Float per subscription.
- **Multi-currency**: EUR only.
- **Payment-provider webhooks** (Stripe, PayPal, sevDesk).
- **Price catalog UI**: `MODULE_PRICES` is a hardcoded TypeScript constant. If price changes become frequent (est. 18+ months away), migrate to a DB-backed price list.
- **Platform-wide subscription dashboard**: `/platform/subscriptions` page listing all contracts across tenants with MRR, churn, upcoming renewals. The per-tenant modules page is enough for 0–5 customers.
- **Multiple operator tenants**: `PLATFORM_OPERATOR_TENANT_ID` is a single pinned tenant per environment. There is no concept of "which operator tenant bills which subscription" — single source of truth by design.
