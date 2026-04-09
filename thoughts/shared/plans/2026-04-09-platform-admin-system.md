# Platform-Admin-System Implementation Plan

Date: 2026-04-09
Based on research: `thoughts/shared/research/2026-04-09-platform-admin-system.md`
Obsoletes: `thoughts/shared/tickets/misc/platform-admin-tenant-access.md`

## Overview

Build a **separate security/identity domain above the tenant world**: its own
`PlatformUser` table with argon2 credentials, its own tRPC context, its own
API route, its own admin UI under `admin.terp.de` (with a same-host fallback
for dev), mandatory TOTP 2FA, and a tenant-side consent flow (`SupportSession`)
that lets platform operators impersonate into a tenant only with explicit,
time-boxed approval from a tenant admin. Every platform-initiated tenant write
produces a double audit entry (tenant `AuditLog` + new `PlatformAuditLog`),
so both the tenant and the platform operator can trace exactly what happened.

This replaces the prior, weaker ticket
`thoughts/shared/tickets/misc/platform-admin-tenant-access.md`, which proposed
a simple `platform_admins` flag on `auth.users` with a read-only bypass of
`tenantProcedure`. That approach is incompatible with the new model and will
be marked obsolete in Phase 8.

## Current State Analysis

The research document at
`thoughts/shared/research/2026-04-09-platform-admin-system.md` establishes
that terp is a strictly single-domain multi-tenant app:

- **One** Supabase Auth project and one `public.users` table. `createTRPCContext`
  (`src/trpc/init.ts:103-111`) hard-wires `prisma.user.findUnique({ where: { id: supabaseUser.id } })`.
- **One** tRPC API route (`src/app/api/trpc/[trpc]/route.ts`), one `appRouter`
  merging 105 sub-routers (`src/trpc/routers/_app.ts`), one React TRPCProvider
  (`src/trpc/client.tsx:70`).
- **One** route-group tree under `src/app/[locale]/`: `(auth)` and `(dashboard)`.
  The dashboard layout wraps every page in
  `ProtectedRoute → TenantProvider → TenantGuard → AppLayout`
  (`src/app/[locale]/(dashboard)/layout.tsx:14-21`).
- **No** host-based dispatch. The Next.js middleware entry is `src/proxy.ts`
  (legacy filename), which chains `updateSession` + `next-intl`. No host check,
  no domain rewrite.
- **No** password hashing infrastructure inside the repo. `User.passwordHash`
  exists as a column but nothing writes to it.
- **No** MFA/2FA/TOTP/WebAuthn code (zero matches in `src/`).
- **No** server-side login handler — `supabase.auth.signInWithPassword`
  runs client-side in `src/app/[locale]/(auth)/login/page.tsx:41`.
- **No** global rate limiting. The only example is the DB-counter pattern in
  `src/lib/services/ai-assistant-service.ts`.
- **`AuditLog.tenantId` is `NOT NULL`** (`prisma/schema.prisma:2885`) and 131
  callers depend on it.
- **`tenantProcedure`** performs an in-memory scan of `ctx.user.userTenants`
  at `src/trpc/init.ts:220-222`.
- **`qrcode@^1.5.4` is installed.** `argon2`, `otpauth`, `jose` are not.
- **Field encryption is already available**: `src/lib/services/field-encryption.ts`
  exports `encryptField`/`decryptField` using AES-256-GCM and
  `FIELD_ENCRYPTION_KEY_V1`. We reuse this directly for MFA secret storage —
  no new crypto module needed.
- **Tenant creation does NOT auto-create a user group**. `src/lib/services/tenant-service.ts:76-149`
  creates the tenant row and adds the creator to `user_tenants` with
  `role='owner'`, but does not create any `UserGroup`. Admin access is granted
  via `User.role === 'admin'` or `UserGroup.isAdmin = true`, both of which
  trigger the `isUserAdmin` bypass in
  `src/lib/auth/permissions.ts:73-93` and grant ALL permissions implicitly.
  **Consequence**: no default-permissions code path needs to be patched when
  a new permission is introduced; the backfill migration only affects
  existing rows for consistency.

### Key Discoveries

- `createTRPCContext` at `src/trpc/init.ts:103` is the single chokepoint that
  blocks a second user domain. A second context factory is cheaper than
  unifying 105 routers around a discriminated union.
- 131 `AuditLog.tenantId`-dependent callers → a separate `PlatformAuditLog`
  table is the realistic path.
- `src/proxy.ts:23-25` uses `matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)'`,
  which already excludes `/api/*`. The new `/api/trpc-platform/*` route will
  skip this middleware cleanly.
- The deterministic UUIDv5 permission pattern
  (`src/lib/auth/permission-catalog.ts:10-29`) lets us add
  `platform.support_access.grant` as a catalog entry plus a backfill SQL
  migration, mirroring
  `supabase/migrations/20260415100000_add_audit_log_export_permission.sql`.
- Vitest router tests use `createCallerFactory` + helpers from
  `src/trpc/routers/__tests__/helpers.ts`; these are cloneable for the
  platform tRPC layer.
- Playwright e2e tests live under `src/e2e-browser/` with `auth.setup.ts`
  session persistence — reusable for the tenant-side consent spec.

## Desired End State

When this plan is complete:

1. An operator visits `https://admin.terp.de/login` (prod) or
   `http://localhost:3001/platform/login` (dev) and authenticates against
   `public.platform_users` with email + argon2 password. The tenant app at
   `https://app.terp.de` is unaffected — separate cookies, JWT, session,
   tRPC endpoint.
2. After the first successful password check, the operator is forced to
   enroll a TOTP factor (QR via `qrcode`). Subsequent logins require a valid
   6-digit code or a recovery code. Recovery codes (10 single-use) are shown
   once at enrollment.
3. Failed login attempts (wrong password **and** wrong recovery code) are
   rate-limited via a DB counter on `platform_login_attempts`: 5 failures
   per email / 15 min → 15 min lockout; 20 failures per IP / 15 min → 15 min
   IP lockout.
4. The operator cannot read any tenant data until a tenant admin explicitly
   grants access. A direct tRPC call from a platform session to a tenant
   route without an active `SupportSession` throws `FORBIDDEN`.
5. A tenant admin opens `/admin/settings/support-access`, fills in `reason`,
   `ttl` (≤ 4 h), optional `consentReference`, and creates a `SupportSession`
   (status `pending`). A consent entry is written to both `audit_logs` and
   `platform_audit_logs`.
6. The operator sees the pending session in the Platform UI at
   `admin.terp.de/support-sessions`, clicks "Beitreten" → status becomes
   `active`, `activatedAt` is set.
7. The operator can then open a tenant in the Platform UI. A persistent
   yellow banner in **both** UIs shows "Support-Zugriff aktiv bis 14:25 —
   Support (Tolga), Grund: Bug #1234".
8. Every mutation during the session writes **two** audit entries: tenant
   `AuditLog` (with `userId` = the Platform System sentinel user) and
   `PlatformAuditLog` (`targetTenantId`, `supportSessionId`,
   `platformUserId` populated).
9. **Pending sessions that are not activated within 30 minutes auto-expire**
   via the new cleanup cron. When `expiresAt` is reached on an active
   session, the next impersonation call throws `FORBIDDEN` and the row flips
   to `expired`.
10. Platform session timeout: 30 min idle, 4 h absolute. Enforced server-side
    on every request. Client-side idle detection warns at 28 min.
11. Bootstrap: `pnpm tsx scripts/bootstrap-platform-user.ts <email> <displayName>`
    creates the first operator (prompts for password twice). The same
    script with `--reset-mfa <email>` clears the MFA secret so a locked-out
    operator can re-enroll.
12. The prior-art ticket
    `thoughts/shared/tickets/misc/platform-admin-tenant-access.md` is renamed
    to `_OBSOLETE.md` with a pointer to this plan.

### Verification

- `pnpm typecheck` passes.
- `pnpm vitest run` all-green including the new platform tests.
- Playwright spec `src/e2e-browser/99-platform-support-consent.spec.ts`
  drives the tenant-side consent flow end-to-end.
- Manual: direct `curl` against `/api/trpc-platform/tenants.detail` with a
  valid platform JWT but no active `SupportSession` returns `FORBIDDEN`.

## What We're NOT Doing

- Feature flags, maintenance mode, system-wide banners.
- Subscription billing / MRR / Stripe.
- IP allow-listing, CSP headers, CORS hardening.
- Migrating existing users to `PlatformUser` (greenfield; first operator comes
  from the bootstrap script).
- Second Supabase project for platform auth.
- Making `AuditLog.tenantId` nullable.
- Per-tenant configurable TTL for support sessions (the 4 h cap is a constant).
- Rate limiting via Redis/Upstash (we reuse the DB-counter pattern).
- Changing the existing `src/proxy.ts` middleware API beyond the rename and
  the new host/path branch.

## Implementation Approach

1. Ship the data model and bootstrap tooling first (Phase 1).
2. Build the auth primitives as pure, unit-tested functions (Phase 2).
3. Assemble the platform tRPC layer (Phase 3), wire the routing (Phase 4),
   then build the UI (Phase 5).
4. Add the tenant-side consent flow (Phase 6).
5. Extend `createTRPCContext` with the impersonation branch last (Phase 7).
6. Clean up and document (Phase 8).

Every new server module gets a Vitest file. The consent flow gets one
Playwright spec at the end.

---

## Phase 1 — Data model & bootstrap

### Overview

Ship the four new tables, the argon2 wrapper, the CLI bootstrap script, and
the `platform-audit-service`. No tRPC, no HTTP, no UI yet.

### Changes required

#### 1.1 — Prisma models

**File**: `prisma/schema.prisma`

Append after `model UserTenant` (around line 1157):

```prisma
// -----------------------------------------------------------------------------
// Platform Admin Domain (separate from tenant auth)
// -----------------------------------------------------------------------------
// Migration: 20260420000000_create_platform_admin_tables

model PlatformUser {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email         String    @unique @db.VarChar(255)
  passwordHash  String    @map("password_hash") @db.Text
  displayName   String    @map("display_name") @db.VarChar(255)
  isActive      Boolean   @default(true) @map("is_active")
  mfaSecret     String?   @map("mfa_secret") @db.Text           // encrypted via field-encryption
  mfaEnrolledAt DateTime? @map("mfa_enrolled_at") @db.Timestamptz(6)
  recoveryCodes Json?     @map("recovery_codes") @db.JsonB      // array of argon2-hashed codes
  lastLoginAt   DateTime? @map("last_login_at") @db.Timestamptz(6)
  lastLoginIp   String?   @map("last_login_ip") @db.Text
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  createdBy     String?   @map("created_by") @db.Uuid

  supportSessions SupportSession[]

  @@map("platform_users")
}

model SupportSession {
  id                String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String    @map("tenant_id") @db.Uuid
  platformUserId    String?   @map("platform_user_id") @db.Uuid
  requestedByUserId String    @map("requested_by_user_id") @db.Uuid
  reason            String    @db.Text
  consentReference  String?   @map("consent_reference") @db.VarChar(255)
  status            String    @db.VarChar(20)                    // pending | active | expired | revoked
  expiresAt         DateTime  @map("expires_at") @db.Timestamptz(6)
  activatedAt       DateTime? @map("activated_at") @db.Timestamptz(6)
  revokedAt         DateTime? @map("revoked_at") @db.Timestamptz(6)
  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)

  tenant       Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  platformUser PlatformUser? @relation(fields: [platformUserId], references: [id], onDelete: SetNull)

  @@index([tenantId, status], map: "idx_support_sessions_tenant_status")
  @@index([platformUserId, status], map: "idx_support_sessions_platform_user_status")
  @@index([status, expiresAt], map: "idx_support_sessions_status_expires")
  @@map("support_sessions")
}

model PlatformAuditLog {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  platformUserId   String?  @map("platform_user_id") @db.Uuid
  action           String   @db.VarChar(50)
  entityType       String?  @map("entity_type") @db.VarChar(100)
  entityId         String?  @map("entity_id") @db.Uuid
  targetTenantId   String?  @map("target_tenant_id") @db.Uuid
  supportSessionId String?  @map("support_session_id") @db.Uuid
  changes          Json?    @db.JsonB
  metadata         Json?    @db.JsonB
  ipAddress        String?  @map("ip_address") @db.Text
  userAgent        String?  @map("user_agent") @db.Text
  performedAt      DateTime @default(now()) @map("performed_at") @db.Timestamptz(6)

  @@index([platformUserId, performedAt], map: "idx_platform_audit_logs_user_performed")
  @@index([targetTenantId, performedAt], map: "idx_platform_audit_logs_tenant_performed")
  @@index([action, performedAt], map: "idx_platform_audit_logs_action_performed")
  @@map("platform_audit_logs")
}

model PlatformLoginAttempt {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email       String   @db.VarChar(255)
  ipAddress   String   @map("ip_address") @db.Text
  success     Boolean
  failReason  String?  @map("fail_reason") @db.VarChar(50)
  attemptedAt DateTime @default(now()) @map("attempted_at") @db.Timestamptz(6)

  @@index([email, attemptedAt], map: "idx_platform_login_attempts_email")
  @@index([ipAddress, attemptedAt], map: "idx_platform_login_attempts_ip")
  @@map("platform_login_attempts")
}
```

Also add to `model Tenant` (inside the `// Relations` block):

```prisma
  supportSessions SupportSession[]
```

#### 1.2 — SQL migration

**File**: `supabase/migrations/20260420000000_create_platform_admin_tables.sql` (new)

```sql
-- =============================================================
-- Platform Admin Domain: platform_users, support_sessions,
--   platform_audit_logs, platform_login_attempts
-- =============================================================

CREATE TABLE platform_users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email            VARCHAR(255) NOT NULL UNIQUE,
  password_hash    TEXT NOT NULL,
  display_name     VARCHAR(255) NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  mfa_secret       TEXT,
  mfa_enrolled_at  TIMESTAMPTZ,
  recovery_codes   JSONB,
  last_login_at    TIMESTAMPTZ,
  last_login_ip    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID REFERENCES platform_users(id) ON DELETE SET NULL
);

CREATE TABLE support_sessions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform_user_id     UUID REFERENCES platform_users(id) ON DELETE SET NULL,
  requested_by_user_id UUID NOT NULL,
  reason               TEXT NOT NULL,
  consent_reference    VARCHAR(255),
  status               VARCHAR(20) NOT NULL,
  expires_at           TIMESTAMPTZ NOT NULL,
  activated_at         TIMESTAMPTZ,
  revoked_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT support_sessions_status_check
    CHECK (status IN ('pending', 'active', 'expired', 'revoked'))
);
CREATE INDEX idx_support_sessions_tenant_status ON support_sessions(tenant_id, status);
CREATE INDEX idx_support_sessions_platform_user_status ON support_sessions(platform_user_id, status);
CREATE INDEX idx_support_sessions_status_expires ON support_sessions(status, expires_at);

CREATE TABLE platform_audit_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id    UUID REFERENCES platform_users(id) ON DELETE SET NULL,
  action              VARCHAR(50) NOT NULL,
  entity_type         VARCHAR(100),
  entity_id           UUID,
  target_tenant_id    UUID REFERENCES tenants(id) ON DELETE SET NULL,
  support_session_id  UUID REFERENCES support_sessions(id) ON DELETE SET NULL,
  changes             JSONB,
  metadata            JSONB,
  ip_address          TEXT,
  user_agent          TEXT,
  performed_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_platform_audit_logs_user_performed     ON platform_audit_logs(platform_user_id, performed_at DESC);
CREATE INDEX idx_platform_audit_logs_tenant_performed   ON platform_audit_logs(target_tenant_id, performed_at DESC);
CREATE INDEX idx_platform_audit_logs_action_performed   ON platform_audit_logs(action, performed_at DESC);

CREATE TABLE platform_login_attempts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) NOT NULL,
  ip_address    TEXT NOT NULL,
  success       BOOLEAN NOT NULL,
  fail_reason   VARCHAR(50),
  attempted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_platform_login_attempts_email ON platform_login_attempts(email, attempted_at DESC);
CREATE INDEX idx_platform_login_attempts_ip    ON platform_login_attempts(ip_address, attempted_at DESC);
```

#### 1.3 — New dependencies

**File**: `package.json`

Add to `dependencies`:

```json
"argon2": "^0.41.1",
"otpauth": "^9.3.4",
"jose": "^5.9.6"
```

(`qrcode@^1.5.4` already present.) Run `pnpm install`.

#### 1.4 — Password utility

**File**: `src/lib/platform/password.ts` (new)

```ts
import argon2 from "argon2"

const ARGON2_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
}

export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < 12) {
    throw new Error("Platform password must be at least 12 characters")
  }
  return argon2.hash(plain, ARGON2_OPTS)
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain)
  } catch {
    return false
  }
}
```

#### 1.5 — Platform audit service

**File**: `src/lib/platform/audit-service.ts` (new)

Mirrors `src/lib/services/audit-logs-service.ts:168-182` fire-and-forget.
Exports:

- `log(prisma, data)` — fire-and-forget write to `platform_audit_logs`
- `list(prisma, params)` — pagination, filters on `platformUserId`, `targetTenantId`, `action`, date range
- `getById(prisma, id)` → throws `PlatformAuditLogNotFoundError`

```ts
import type { PrismaClient, Prisma } from "@/generated/prisma/client"

export interface PlatformAuditLogInput {
  platformUserId: string | null
  action: string
  entityType?: string | null
  entityId?: string | null
  targetTenantId?: string | null
  supportSessionId?: string | null
  changes?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  ipAddress?: string | null
  userAgent?: string | null
}

export async function log(
  prisma: PrismaClient,
  data: PlatformAuditLogInput
): Promise<void> {
  try {
    await prisma.platformAuditLog.create({
      data: {
        platformUserId: data.platformUserId,
        action: data.action,
        entityType: data.entityType ?? null,
        entityId: data.entityId ?? null,
        targetTenantId: data.targetTenantId ?? null,
        supportSessionId: data.supportSessionId ?? null,
        changes: (data.changes as Prisma.InputJsonValue) ?? undefined,
        metadata: (data.metadata as Prisma.InputJsonValue) ?? undefined,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
      },
    })
  } catch (err) {
    console.error("[PlatformAuditLog] Failed:", err, { action: data.action })
  }
}
```

Plus a `list`/`getById` pair mirroring `audit-logs-repository.ts:54-178`
but scoped to `platform_audit_logs`.

#### 1.6 — Bootstrap CLI

**File**: `scripts/bootstrap-platform-user.ts` (new)

```ts
/**
 * Usage:
 *   pnpm tsx scripts/bootstrap-platform-user.ts <email> <displayName>
 *   pnpm tsx scripts/bootstrap-platform-user.ts --reset-mfa <email>
 */
import { prisma } from "@/lib/db/prisma"
import { hashPassword } from "@/lib/platform/password"
import readline from "node:readline/promises"
import { stdin, stdout } from "node:process"

async function promptPassword(q: string): Promise<string> {
  stdout.write(q)
  return new Promise((resolve) => {
    const onData = (data: Buffer) => {
      stdin.off("data", onData)
      resolve(data.toString().trim())
    }
    stdin.on("data", onData)
  })
}

async function main() {
  const args = process.argv.slice(2)

  if (args[0] === "--reset-mfa") {
    const email = args[1]
    if (!email) throw new Error("Usage: --reset-mfa <email>")
    const updated = await prisma.platformUser.update({
      where: { email },
      data: { mfaSecret: null, mfaEnrolledAt: null, recoveryCodes: null },
    })
    console.log(`MFA reset for ${updated.email}`)
    return
  }

  const [email, displayName] = args
  if (!email || !displayName) throw new Error("Usage: <email> <displayName>")
  const existing = await prisma.platformUser.findUnique({ where: { email } })
  if (existing) throw new Error(`Platform user ${email} already exists`)

  const pw1 = await promptPassword("Password: ")
  const pw2 = await promptPassword("\nConfirm: ")
  if (pw1 !== pw2) throw new Error("Passwords do not match")

  const hash = await hashPassword(pw1)
  const created = await prisma.platformUser.create({
    data: { email, displayName, passwordHash: hash },
  })
  console.log(`\nCreated ${created.email} (${created.id})`)
  console.log(`Log in and enroll MFA on first login.`)
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
```

#### 1.7 — Regenerate Prisma client

`pnpm db:generate` after schema changes so `prisma.platformUser`,
`prisma.supportSession`, etc. become available.

### Success criteria

#### Automated verification

- [ ] `pnpm db:reset` applies migrations cleanly
- [ ] `pnpm db:generate` regenerates the client
- [ ] `pnpm typecheck` passes
- [ ] `pnpm vitest run src/lib/platform/__tests__/password.test.ts` — round-trip and length check
- [ ] `pnpm lint` passes

#### Manual verification

- [ ] `pnpm tsx scripts/bootstrap-platform-user.ts tolga@terp.de "Tolga"` creates a row; `password_hash` starts with `$argon2id$v=19$`
- [ ] Second invocation with same email fails with "already exists"
- [ ] `--reset-mfa` nulls the MFA columns

**Pause for manual confirmation before proceeding to Phase 2.**

---

## Phase 2 — Platform auth core

### Overview

Pure functions for JWT signing/verification, TOTP, recovery codes, rate
limiting, and the login service. No HTTP, no tRPC yet.

### Pre-flight: field encryption

`src/lib/services/field-encryption.ts` already exports `encryptField` and
`decryptField` (AES-256-GCM, versioned via `FIELD_ENCRYPTION_KEY_V1`). The
platform auth code **reuses these directly** for `PlatformUser.mfaSecret`
storage. No separate `src/lib/platform/crypto.ts` module is introduced.

### Changes required

#### 2.1 — Environment variables

**File**: `src/lib/config.ts`

Add to `serverEnv`:

```ts
platformJwtSecret: process.env.PLATFORM_JWT_SECRET ?? '',
/** Optional. If set, middleware treats this host as the platform subdomain.
 *  If empty, the platform is served at /platform/* on the same host as the tenant app. */
platformCookieDomain: process.env.PLATFORM_COOKIE_DOMAIN ?? '',
```

Add **only** `PLATFORM_JWT_SECRET` to the `validateEnv()` required list.
`PLATFORM_COOKIE_DOMAIN` is optional.

**File**: `.env.example`

```
# Required
PLATFORM_JWT_SECRET=change-me-in-prod-32-bytes-min-base64
# Optional. Leave empty in dev to serve the platform at /platform/* on localhost.
# Set to the subdomain in prod (e.g. "admin.terp.de") to activate host-based routing
# and domain-scoped cookies.
PLATFORM_COOKIE_DOMAIN=
```

#### 2.2 — JWT utility

**File**: `src/lib/platform/jwt.ts` (new)

```ts
import { SignJWT, jwtVerify } from "jose"
import { serverEnv } from "@/lib/config"

const SESSION_IDLE_MS = 30 * 60 * 1000       // 30 min
const SESSION_MAX_MS  = 4  * 60 * 60 * 1000  // 4 h
const ISSUER   = "terp-platform"
const AUDIENCE = "terp-platform-admin"

export interface PlatformJwtClaims {
  sub: string              // platformUser.id
  email: string
  displayName: string
  iat: number
  lastActivity: number     // seconds, refreshed on each response
  sessionStartedAt: number // seconds, anchor for max session
  mfaVerified: boolean
}

function secretKey() {
  if (!serverEnv.platformJwtSecret) throw new Error("PLATFORM_JWT_SECRET not configured")
  return new TextEncoder().encode(serverEnv.platformJwtSecret)
}

export async function sign(claims: Omit<PlatformJwtClaims, "iat">): Promise<string> {
  const iat = Math.floor(Date.now() / 1000)
  return await new SignJWT({ ...claims, iat })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER).setAudience(AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + SESSION_MAX_MS / 1000)
    .sign(secretKey())
}

export type VerifyResult =
  | { ok: true; claims: PlatformJwtClaims }
  | { ok: false; reason: "invalid" | "expired" | "idle_timeout" }

export async function verify(token: string): Promise<VerifyResult> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER, audience: AUDIENCE,
    })
    const claims = payload as unknown as PlatformJwtClaims
    const now = Math.floor(Date.now() / 1000)
    if (now - claims.lastActivity > SESSION_IDLE_MS / 1000) {
      return { ok: false, reason: "idle_timeout" }
    }
    if (now - claims.sessionStartedAt > SESSION_MAX_MS / 1000) {
      return { ok: false, reason: "expired" }
    }
    return { ok: true, claims }
  } catch {
    return { ok: false, reason: "invalid" }
  }
}

export async function refresh(claims: PlatformJwtClaims): Promise<string> {
  return sign({ ...claims, lastActivity: Math.floor(Date.now() / 1000) })
}

export const SESSION_CONSTANTS = { SESSION_IDLE_MS, SESSION_MAX_MS } as const
```

#### 2.3 — TOTP utility

**File**: `src/lib/platform/totp.ts` (new)

```ts
import { TOTP, Secret } from "otpauth"
import { randomBytes } from "node:crypto"
import argon2 from "argon2"
import { encryptField, decryptField } from "@/lib/services/field-encryption"

const ISSUER = "terp-admin"

export function generateSecret(): string {
  return new Secret({ size: 20 }).base32
}

export function encryptSecret(plainBase32: string): string {
  return encryptField(plainBase32)
}

export function decryptSecret(ciphertext: string): string {
  return decryptField(ciphertext)
}

export function buildUri(email: string, secretBase32: string): string {
  const t = new TOTP({
    issuer: ISSUER, label: email,
    secret: Secret.fromBase32(secretBase32),
    algorithm: "SHA1", digits: 6, period: 30,
  })
  return t.toString()
}

export function verifyToken(secretBase32: string, token: string): boolean {
  const t = new TOTP({
    issuer: ISSUER, secret: Secret.fromBase32(secretBase32),
    algorithm: "SHA1", digits: 6, period: 30,
  })
  return t.validate({ token, window: 1 }) !== null
}

// Recovery codes — 10 single-use, stored hashed.
export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () =>
    randomBytes(5).toString("hex").toUpperCase().match(/.{1,5}/g)!.join("-")
  )
}

export async function hashRecoveryCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((c) => argon2.hash(c, { type: argon2.argon2id })))
}

export async function consumeRecoveryCode(
  storedHashes: string[],
  candidate: string
): Promise<{ matched: boolean; remaining: string[] }> {
  for (let i = 0; i < storedHashes.length; i++) {
    if (await argon2.verify(storedHashes[i], candidate)) {
      const remaining = [...storedHashes]
      remaining.splice(i, 1)
      return { matched: true, remaining }
    }
  }
  return { matched: false, remaining: storedHashes }
}
```

`PlatformUser.mfaSecret` is written via `encryptSecret(base32)` and read via
`decryptSecret(row.mfaSecret)` in the login service.

#### 2.4 — Rate limiting

**File**: `src/lib/platform/rate-limit.ts` (new)

```ts
import type { PrismaClient } from "@/generated/prisma/client"

const WINDOW_MS = 15 * 60 * 1000
const MAX_PER_EMAIL = 5
const MAX_PER_IP = 20

export interface RateLimitResult {
  allowed: boolean
  reason?: "email_locked" | "ip_locked"
  retryAfterMs?: number
}

export async function checkLoginRateLimit(
  prisma: PrismaClient,
  email: string,
  ipAddress: string
): Promise<RateLimitResult> {
  const since = new Date(Date.now() - WINDOW_MS)
  const [emailFails, ipFails] = await Promise.all([
    prisma.platformLoginAttempt.count({
      where: { email, success: false, attemptedAt: { gte: since } },
    }),
    prisma.platformLoginAttempt.count({
      where: { ipAddress, success: false, attemptedAt: { gte: since } },
    }),
  ])
  if (emailFails >= MAX_PER_EMAIL) return { allowed: false, reason: "email_locked", retryAfterMs: WINDOW_MS }
  if (ipFails    >= MAX_PER_IP)    return { allowed: false, reason: "ip_locked",    retryAfterMs: WINDOW_MS }
  return { allowed: true }
}

export async function recordAttempt(
  prisma: PrismaClient,
  data: { email: string; ipAddress: string; success: boolean; failReason?: string }
): Promise<void> {
  await prisma.platformLoginAttempt.create({ data })
}
```

#### 2.5 — Login service

**File**: `src/lib/platform/login-service.ts` (new)

Encapsulates the full login flow with explicit failure-mode handling.
**All** failure branches — bad password, bad TOTP, bad recovery code — record
a `platform_login_attempts` row with a distinct `failReason`, and all count
toward the same rate-limit window. This closes the recovery-code brute-force
gap.

Exported functions:

```ts
export async function passwordStep(
  prisma: PrismaClient,
  email: string,
  password: string,
  ipAddress: string,
  userAgent: string | null
): Promise<
  | { status: "mfa_enrollment_required"; enrollmentToken: string; secretBase32: string }
  | { status: "mfa_required"; challengeToken: string }
>

export async function mfaVerifyStep(
  prisma: PrismaClient,
  challengeToken: string,
  input: { token?: string; recoveryCode?: string },
  ipAddress: string,
  userAgent: string | null
): Promise<{ jwt: string; claims: PlatformJwtClaims }>

export async function mfaEnrollStep(
  prisma: PrismaClient,
  enrollmentToken: string,
  firstToken: string,
  ipAddress: string,
  userAgent: string | null
): Promise<{ jwt: string; recoveryCodes: string[] }>
```

Flow details:

1. `passwordStep`: `checkLoginRateLimit` → bail with `RateLimitedError` if
   locked. Look up user. `verifyPassword`. On failure: `recordAttempt({ success: false, failReason: 'bad_password' })`, throw `InvalidCredentialsError`.
2. If `user.mfaEnrolledAt == null`: generate a new secret, return
   `mfa_enrollment_required` with a short-lived (5 min) `enrollmentToken`
   (separate audience `terp-platform-mfa-enrollment`). The secret is NOT
   persisted until `mfaEnrollStep` succeeds.
3. Otherwise return `mfa_required` with a short-lived `challengeToken`
   (audience `terp-platform-mfa-challenge`).
4. `mfaVerifyStep`: decrypt stored secret; if `input.token` supplied, call
   `verifyToken`. If `input.recoveryCode` supplied, call `consumeRecoveryCode`
   and persist the reduced list. **Both failure branches**:
   - Bad TOTP: `recordAttempt({ success: false, failReason: 'bad_totp' })`, throw `InvalidMfaTokenError`.
   - Bad recovery code: `recordAttempt({ success: false, failReason: 'bad_recovery_code' })`, throw `InvalidMfaTokenError`.
   On success: `recordAttempt({ success: true })`, update `lastLoginAt`/
   `lastLoginIp`, `log()` to `platform_audit_logs` (`action: 'login.success'`),
   sign session JWT with `mfaVerified: true`.
5. `mfaEnrollStep`: decrypt the enrollment token to recover the proposed
   secret, verify the user's first TOTP code against it, persist via
   `encryptSecret`, generate and persist recovery codes, set `mfaEnrolledAt`,
   return the (plain, one-time) recovery codes to the caller.

Error classes:

```ts
export class InvalidCredentialsError extends Error {}
export class InvalidMfaTokenError extends Error {}
export class RateLimitedError extends Error {
  constructor(public retryAfterMs: number) { super("Rate limited") }
}
```

### Success criteria

#### Automated verification

- [ ] `pnpm typecheck` passes
- [ ] `pnpm vitest run src/lib/platform/__tests__/jwt.test.ts` — sign/verify round-trip, expired, idle, tampered
- [ ] `pnpm vitest run src/lib/platform/__tests__/totp.test.ts` — verify current, reject stale, recovery-code consume, 10×11-char format, encryption round-trip
- [ ] `pnpm vitest run src/lib/platform/__tests__/rate-limit.test.ts` — 5 email fails locked, 20 IP fails locked, success doesn't count
- [ ] `pnpm vitest run src/lib/platform/__tests__/login-service.test.ts`:
  - Wrong password → `InvalidCredentialsError`, attempt recorded with `bad_password`
  - First-time user → `mfa_enrollment_required`
  - Valid TOTP → JWT with `mfaVerified: true`
  - Invalid TOTP → `InvalidMfaTokenError`, attempt recorded with `bad_totp`
  - **Invalid recovery code → `InvalidMfaTokenError`, attempt recorded with `bad_recovery_code`**
  - **5 × bad recovery code → 6th attempt rate-limited even with correct password/TOTP**
  - Recovery code success consumes and persists reduced list
  - Rate-limited → `RateLimitedError` before DB user lookup

#### Manual verification

- [ ] REPL round-trip: `pnpm tsx -e "..."` on `jwt.ts` and `totp.ts` works end-to-end

**Pause for manual confirmation before proceeding to Phase 3.**

---

## Phase 3 — Platform tRPC layer

### Overview

Second tRPC root: separate context factory, separate `platformAppRouter`,
separate API route. No UI yet.

### Changes required

#### 3.1 — Platform tRPC init

**File**: `src/trpc/platform/init.ts` (new)

Parallels `src/trpc/init.ts` but:

- Reads JWT from cookie `platform-session` (or `Authorization: Bearer` for programmatic callers).
- Uses `verify()` from `@/lib/platform/jwt`.
- Loads `prisma.platformUser.findUnique({ where: { id: claims.sub } })`.
- Exposes `PlatformContextUser` type.

```ts
export type PlatformTRPCContext = {
  prisma: PrismaClient
  platformUser: PlatformContextUser | null
  claims: PlatformJwtClaims | null
  ipAddress: string | null
  userAgent: string | null
  activeSupportSessionId: string | null  // set per-request by clients that impersonate
  responseHeaders: Headers               // adapter layer mutates Set-Cookie on refresh
}
```

Exports:

```ts
export const platformPublicProcedure = t.procedure
export const platformAuthedProcedure = t.procedure.use(/* require claims + platformUser + mfaVerified */)
export const platformImpersonationProcedure = platformAuthedProcedure.use(
  /* re-read SupportSession by id on every call; throw FORBIDDEN if status !== 'active' or expiresAt <= now() */
)
```

#### 3.2 — Platform sub-routers

**Directory**: `src/trpc/platform/routers/` (new)

Files:

- `auth.ts` — `passwordStep`, `mfaVerify`, `mfaEnroll`, `logout`, `me`
- `platformUsers.ts` — CRUD (cannot delete self or last platform user; server-side invariant)
- `tenants.ts` — `list` (authed, no impersonation needed), `detail` (impersonation-only)
- `supportSessions.ts` — `list`, `activate` (pending → active), `revoke`
- `auditLogs.ts` — `list` / `getById` on `platform_audit_logs`

All routers use the existing `handleServiceError` from `src/trpc/errors.ts`.

#### 3.3 — Platform root router

**File**: `src/trpc/platform/_app.ts` (new)

```ts
import { createTRPCRouter } from "./init"
import { platformAuthRouter } from "./routers/auth"
import { platformUsersRouter } from "./routers/platformUsers"
import { platformTenantsRouter } from "./routers/tenants"
import { platformSupportSessionsRouter } from "./routers/supportSessions"
import { platformAuditLogsRouter } from "./routers/auditLogs"

export const platformAppRouter = createTRPCRouter({
  auth: platformAuthRouter,
  platformUsers: platformUsersRouter,
  tenants: platformTenantsRouter,
  supportSessions: platformSupportSessionsRouter,
  auditLogs: platformAuditLogsRouter,
})

export type PlatformAppRouter = typeof platformAppRouter
```

#### 3.4 — Platform API route

**File**: `src/app/api/trpc-platform/[trpc]/route.ts` (new)

Mirrors `src/app/api/trpc/[trpc]/route.ts:1-26`. Always sets
`x-auth-domain: platform` on the response.

```ts
import { fetchRequestHandler } from "@trpc/server/adapters/fetch"
import { platformAppRouter } from "@/trpc/platform/_app"
import { createPlatformTRPCContext } from "@/trpc/platform/init"

const handler = async (req: Request) => {
  const responseHeaders = new Headers()
  responseHeaders.set("x-auth-domain", "platform")

  const response = await fetchRequestHandler({
    endpoint: "/api/trpc-platform",
    req,
    router: platformAppRouter,
    createContext: (opts) => createPlatformTRPCContext(opts, responseHeaders),
    onError({ error, path }) {
      if (error.code === "INTERNAL_SERVER_ERROR") {
        console.error(`[tRPC-platform] Internal error on '${path}':`, error)
      }
    },
  })

  responseHeaders.forEach((v, k) => response.headers.set(k, v))
  return response
}

export { handler as GET, handler as POST }
```

`createPlatformTRPCContext` calls `refresh()` and appends a `Set-Cookie`
header to `responseHeaders`. Cookie attributes are built by `buildCookie()`
in `src/lib/platform/cookie.ts` — if `serverEnv.platformCookieDomain` is
set, `Domain=<value>` is appended; otherwise no `Domain` attribute (host-only
cookie on the current host).

### Success criteria

#### Automated verification

- [ ] `pnpm typecheck` passes
- [ ] `pnpm vitest run src/trpc/platform/__tests__/init.test.ts`:
  - No cookie → `ctx.platformUser === null`
  - Valid cookie → populated, `x-auth-domain: platform` set
  - Expired cookie → 401 + `Set-Cookie` clearing the cookie
  - `mfaVerified: false` → `platformAuthedProcedure` throws `UNAUTHORIZED`
- [ ] `pnpm vitest run src/trpc/platform/routers/__tests__/auth.test.ts`
- [ ] `pnpm vitest run src/trpc/platform/routers/__tests__/supportSessions.test.ts`:
  - List scoped to operator
  - Activate pending → active
  - Activate already-active → `CONFLICT`
  - Revoke → revoked
  - Expired cannot be activated
- [ ] `pnpm vitest run src/trpc/platform/routers/__tests__/tenants.test.ts`:
  - `tenants.detail` without active session → `FORBIDDEN`

#### Manual verification

- [ ] `curl -i http://localhost:3001/api/trpc-platform/auth.me` (no cookie) → 401 with `x-auth-domain: platform`

**Pause for manual confirmation before proceeding to Phase 4.**

---

## Phase 4 — Routing & middleware

### Overview

Two operating modes, selected via the `PLATFORM_COOKIE_DOMAIN` env var:

- **Subdomain mode** (prod, `PLATFORM_COOKIE_DOMAIN=admin.terp.de`):
  middleware detects the host and rewrites `/` → `/platform`. Platform
  cookies are scoped to `admin.terp.de` only.
- **Path-prefix mode** (dev, `PLATFORM_COOKIE_DOMAIN` empty): the
  `/platform/*` path is served from the same host as the tenant app. No
  rewrite; no host check. Platform cookies are host-only on the current host.

Also migrates `src/proxy.ts` to the canonical `src/middleware.ts` filename.

### Changes required

#### 4.1 — Middleware with dual mode

**File**: `src/middleware.ts` (new, absorbs `src/proxy.ts`)

```ts
import { NextResponse, type NextRequest } from "next/server"
import createIntlMiddleware from "next-intl/middleware"
import { routing } from "./i18n/routing"
import { updateSession } from "@/lib/supabase/middleware"
import { serverEnv } from "@/lib/config"

const intlMiddleware = createIntlMiddleware(routing)

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? ""
  const platformDomain = serverEnv.platformCookieDomain
  const path = request.nextUrl.pathname

  // Subdomain mode: if a platform domain is configured AND the current host
  // matches it, rewrite "/" to "/platform/" and bypass intl/supabase entirely.
  if (platformDomain && host === platformDomain) {
    if (!path.startsWith("/platform")) {
      const url = request.nextUrl.clone()
      url.pathname = `/platform${path}`
      return NextResponse.rewrite(url)
    }
    return NextResponse.next()
  }

  // Path-prefix mode: same host. If the request is already for /platform/*,
  // bypass intl/supabase (the platform app has its own session and fixed locale).
  if (path.startsWith("/platform")) {
    return NextResponse.next()
  }

  // Tenant-world flow (unchanged).
  const supabaseResponse = await updateSession(request)
  const intlResponse = intlMiddleware(request)
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    intlResponse.cookies.set(cookie)
  })
  return intlResponse
}

export const config = {
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
}
```

Delete `src/proxy.ts` after `src/middleware.ts` is confirmed to be picked
up by Next.js (it is the canonical filename). The matcher already excludes
`/api/*`, so `/api/trpc-platform/*` lands on its handler directly.

#### 4.2 — Platform route tree

**Directory**: `src/app/platform/` (new — concrete top-level segment, NOT inside `[locale]`)

Files:

- `layout.tsx` — minimal HTML shell with `<html lang="de">`. Loads `PlatformTRPCProvider`. Does **not** mount `AuthProvider`, `TenantProvider`, `ProtectedRoute`, or `TenantGuard`.
- `page.tsx` — server-side redirect to `/platform/dashboard` or `/platform/login`.
- `login/page.tsx`, `dashboard/page.tsx`, `tenants/page.tsx`, `tenants/[id]/page.tsx`, `support-sessions/page.tsx`, `audit-logs/page.tsx`, `platform-users/page.tsx`, `profile/mfa/page.tsx`.

Next.js routing: concrete segments take precedence over dynamic ones, so
`/platform/*` is served by `src/app/platform/**` and never by
`src/app/[locale]/**`. Next-intl's middleware is bypassed for `/platform/*`
by the Phase 4.1 middleware branch, so `hasLocale(routing.locales, "platform")`
is never evaluated at runtime.

`src/app/platform/layout.tsx`:

```tsx
import "../globals.css"
import { PlatformTRPCProvider } from "@/trpc/platform/client"
import { Toaster } from "sonner"

export default function PlatformLayout({
  children,
}: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-muted/20 font-sans antialiased">
        <PlatformTRPCProvider>
          {children}
          <Toaster richColors closeButton position="bottom-right" />
        </PlatformTRPCProvider>
      </body>
    </html>
  )
}
```

**Build-compat fallback**: If `pnpm build` fails with a next-intl error
about `/platform` not matching a locale (unexpected, because our middleware
branch prevents the intl plugin from ever seeing `/platform/*`), move
`src/app/[locale]/` into a new route group `src/app/(tenant)/[locale]/`
so the two trees become siblings under isolated route groups. This is a
pure file move (route group `(name)` is path-invisible) and does not change
any URLs. This fallback is only used if the primary approach breaks the
build; otherwise the primary layout stands.

#### 4.3 — Cookie builder

**File**: `src/lib/platform/cookie.ts` (new)

```ts
import { serverEnv } from "@/lib/config"
import { SESSION_CONSTANTS } from "./jwt"

export function buildSessionCookie(value: string): string {
  const parts = [
    `platform-session=${value}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    `Max-Age=${Math.floor(SESSION_CONSTANTS.SESSION_MAX_MS / 1000)}`,
  ]
  if (serverEnv.platformCookieDomain) {
    parts.push(`Domain=${serverEnv.platformCookieDomain}`)
  }
  return parts.join("; ")
}

export function buildClearCookie(): string {
  const parts = [
    "platform-session=",
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Max-Age=0",
  ]
  if (serverEnv.platformCookieDomain) {
    parts.push(`Domain=${serverEnv.platformCookieDomain}`)
  }
  return parts.join("; ")
}
```

In prod the cookie is scoped to `admin.terp.de` — invisible to `app.terp.de`.
In dev the cookie is host-only on `localhost`, sitting alongside the
Supabase cookies but isolated by a different name.

#### 4.4 — Vercel domain configuration (ops documentation only)

`vercel.json` stays unchanged — Vercel attaches both `app.terp.de` and
`admin.terp.de` to the same project via the dashboard. Documented in
Phase 8.

### Success criteria

#### Automated verification

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm build` succeeds — **explicit smoke test**: next-intl does not throw about missing/invalid locale segments for `/platform/*`. If it does, apply the Phase 4.2 fallback (move `[locale]` into `(tenant)` route group) and re-run `pnpm build`.

#### Manual verification

- [ ] Dev mode (path-prefix): `http://localhost:3001/platform/login` renders the platform login page; `http://localhost:3001/login` still renders the tenant login page.
- [ ] `http://localhost:3001/admin/settings` still loads the tenant admin area unchanged.
- [ ] Subdomain mode: set `PLATFORM_COOKIE_DOMAIN=admin.localhost`, add `127.0.0.1 admin.localhost` to `/etc/hosts`, restart. `http://admin.localhost:3001/` rewrites internally to `/platform` and shows the login page. `http://localhost:3001/` still shows the tenant login.
- [ ] In subdomain mode, DevTools confirms `platform-session` is scoped to `admin.localhost` and **not** sent on requests to `localhost:3001`.

**Pause for manual confirmation before proceeding to Phase 5.**

---

## Phase 5 — Platform UI

### Overview

Implementation of all pages from Phase 4.2. MFA enrollment uses `qrcode`.
Idle timeout is detected client-side, with server enforcement already in
place via Phase 2.2 `verify()`.

### Changes required

#### 5.1 — Platform tRPC client

**File**: `src/trpc/platform/client.tsx` (new)

Parallels `src/trpc/client.tsx:70-148` but:

- Single `httpBatchLink` (no subscriptions, no split-link).
- URL: `/api/trpc-platform`.
- Custom `fetch` wrapper that:
  - Sends cookies with `credentials: "include"`.
  - Reads response headers to detect the auth domain.
  - On 401 + `x-auth-domain: platform` → navigates to `/platform/login?reason=session`.

Code snippet for the fetch wrapper and link wiring:

```tsx
"use client"
import { useState } from "react"
import { QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query"
import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client"
import { toast } from "sonner"
import type { PlatformAppRouter } from "@/trpc/platform/_app"
import { TRPCProvider as PlatformTRPCContext } from "./context"

function platformFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, credentials: "include" }).then((res) => {
    if (res.status === 401 && res.headers.get("x-auth-domain") === "platform") {
      if (typeof window !== "undefined") {
        window.location.href = "/platform/login?reason=session"
      }
    }
    return res
  })
}

function makeQueryClient() {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (error) => {
        const msg = error instanceof TRPCClientError ? error.message : "An unexpected error occurred"
        toast.error(msg)
      },
    }),
    defaultOptions: {
      queries: { staleTime: 60 * 1000, retry: 0, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
}

export function PlatformTRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => makeQueryClient())
  const [trpcClient] = useState(() =>
    createTRPCClient<PlatformAppRouter>({
      links: [
        httpBatchLink({
          url: "/api/trpc-platform",
          fetch: platformFetch,
        }),
      ],
    })
  )
  return (
    <QueryClientProvider client={queryClient}>
      <PlatformTRPCContext trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </PlatformTRPCContext>
    </QueryClientProvider>
  )
}
```

The platform client does **not** read `Supabase.getSession()` and does
**not** set `x-tenant-id`.

#### 5.2 — Login page

**File**: `src/app/platform/login/page.tsx` (new)

Three visual states driven by a local state machine:

1. **Password** — email + password. On submit → `platformTrpc.auth.passwordStep`. Route to 2a or 2b based on `status`.
2a. **MFA enrollment** — QR code (via `qrcode.toDataURL(buildUri(...))`), input for first code, on verify shows the 10 recovery codes with a mandatory "I saved these" checkbox.
2b. **MFA verification** — 6-digit input + "Use recovery code instead" toggle.

Rate-limit errors show "Zu viele Fehlversuche — bitte in ~N Minuten erneut versuchen". On success the server sets `Set-Cookie` and the client does
`router.push('/platform/dashboard')`.

#### 5.3 — Dashboard + listing pages

- `dashboard/page.tsx` — cards: active support sessions count, pending count, latest 10 platform audit events, **pending demo-convert requests** (see follow-up note below). Uses `platformTrpc.supportSessions.list` + `auditLogs.list` (+ a new `platformTrpc.demoConvertRequests.list` once the demo-tenant-system wiring ships — see below).
- `tenants/page.tsx` — searchable list. Per-row action "Request access template" (copies a text block to clipboard; does not create a session — creation is tenant-initiated). For rows where `tenant.is_demo = true`, show the demo-template + days-remaining badge inline, so operators can spot expiring demos without leaving the platform UI.
- `support-sessions/page.tsx` — tabs `pending | active | expired/revoked`. "Beitreten" button on pending rows.
- `audit-logs/page.tsx` — table + filters. Reuses `src/components/audit-logs/audit-log-json-diff.tsx` for the `changes` column (pure JSON render, tenant-agnostic).
- `platform-users/page.tsx` — list + create form. Cannot delete self. Cannot delete the last platform user.

**Follow-up — Demo-convert-request integration**

The `requestConvertFromExpired` endpoint in `demoTenantsRouter` currently only writes an `email_send_log` row and relies on the email-retry cron to notify sales (see `src/lib/services/demo-tenant-service.ts` function `notifyConvertRequest`, and the "What We're NOT Doing" bullet in `thoughts/shared/plans/2026-04-09-demo-tenant-system.md`). Once this platform-admin system exists, extend that service so it **additionally** materializes a row that the platform dashboard can query — options:

1. **Minimal** — query the existing `audit_logs` table on the platform side for `action = 'demo_convert_req'` entries, filter by a "not yet acknowledged" flag stored in `platform_audit_logs` or a dedicated `demo_convert_request_state` table. No new write from `demo-tenant-service.ts`.
2. **Explicit** — new table `demo_convert_requests` (`id`, `tenant_id`, `requested_by_user_id`, `status` enum `pending|converted|dismissed`, `created_at`, `resolved_at`, `resolved_by_platform_user_id`). `requestConvertFromExpired` inserts a `pending` row alongside the audit log; the platform dashboard card shows `status = pending`, "Beitreten" opens the tenant via a SupportSession, and `demoTenants.convert`/`demoTenants.extend`/`demoTenants.delete` transition the row to `converted|dismissed`.

Pick option 2 when the platform UI actually needs actionable rows; the email fallback stays in place as a belt-and-braces notification. Mark the `DEMO_CONVERT_NOTIFICATION_EMAIL` env optional at that point.

#### 5.4 — Idle timeout detection

**File**: `src/hooks/use-platform-idle-timeout.ts` (new)

```ts
"use client"
import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

const WARN_AT_MS   = 28 * 60 * 1000
const LOGOUT_AT_MS = 30 * 60 * 1000

export function usePlatformIdleTimeout() {
  const router = useRouter()
  const lastActivity = useRef(Date.now())
  useEffect(() => {
    const bump = () => { lastActivity.current = Date.now() }
    const events = ["mousemove", "keydown", "touchstart", "scroll"]
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }))
    const id = setInterval(() => {
      const idle = Date.now() - lastActivity.current
      if (idle > LOGOUT_AT_MS) router.push("/platform/login?reason=idle_timeout")
      // else if (idle > WARN_AT_MS) toast.warning(...)
    }, 30 * 1000)
    return () => {
      clearInterval(id)
      events.forEach((e) => window.removeEventListener(e, bump))
    }
  }, [router])
}
```

Mounted in `src/app/platform/(authed)/layout.tsx`, a nested layout for all
authenticated platform pages.

#### 5.5 — Platform sidebar

**File**: `src/components/platform/sidebar.tsx` (new, ~50 lines)

Minimal static sidebar: Dashboard · Tenants · Support-Sessions · Audit-Log ·
Platform-Users · Profile. **Does not** import
`src/components/layout/app-layout.tsx` (that imports `TenantProvider`).

### Success criteria

#### Automated verification

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm build` succeeds

#### Manual verification

- [ ] Dev mode login flow works: password → QR code (first time) → scan with authenticator → 6-digit → recovery codes → dashboard
- [ ] Second login: password → 6-digit → dashboard
- [ ] Using a recovery code once works; same code fails the second time
- [ ] 30 min browser idle → next click redirects to login with `reason=idle_timeout`

**Pause for manual confirmation before proceeding to Phase 6.**

---

## Phase 6 — Consent flow (tenant side)

### Overview

Tenant admins grant time-boxed support sessions. New permission, new
settings page, new tRPC endpoints extending the existing `tenantsRouter`,
active-session banner.

### Changes required

#### 6.1 — Permission catalog entry

**File**: `src/lib/auth/permission-catalog.ts`

Add to `ALL_PERMISSIONS`:

```ts
p(
  "platform.support_access.grant",
  "platform",
  "support_access.grant",
  "Grant platform operators time-limited support access to this tenant"
),
```

#### 6.2 — Permission backfill migration (existing rows only)

**File**: `supabase/migrations/20260420000001_add_platform_support_access_permission.sql` (new)

Pre-compute the UUID before writing the migration:

```bash
pnpm tsx -e "import { v5 } from 'uuid'; console.log(v5('platform.support_access.grant', 'f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1'))"
```

Substitute into:

```sql
-- Add platform.support_access.grant to existing ADMIN groups for consistency.
-- Note: admin access is granted via is_admin=true bypass in TypeScript
-- (src/lib/auth/permissions.ts:73-93), so this JSONB entry is not required
-- for functionality — it's maintained for parity with other permissions.

UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"<uuid-here>"'::jsonb
  ) sub
) WHERE is_admin = TRUE;
```

#### 6.3 — New-tenant permission handling (no code change required)

**Verification task** (not an implementation task): Confirm that
`src/lib/services/tenant-service.ts:76-149` creates a tenant and
adds the creator to `user_tenants` without creating any `UserGroup`.
Tenant admins therefore get the new permission via one of two paths:

1. `User.role === 'admin'` → triggers `isUserAdmin` bypass in
   `src/lib/auth/permissions.ts:73-93` → returns `true` for every permission
   without consulting the `permissions` JSONB.
2. A custom `UserGroup` with `isAdmin = true` → same bypass.

**Therefore, no default-permissions code path requires patching for new
tenants.** Add a regression test that codifies this invariant:

**File**: `src/trpc/routers/__tests__/tenants-support-access-new-tenant.test.ts` (new)

```ts
// Given: a fresh tenant, no UserGroup attached, creator has user.role='admin'.
// When: caller invokes tenantsRouter.requestSupportAccess.
// Then: the call succeeds — proving requirePermission(SUPPORT_ACCESS_GRANT)
//       passes through isUserAdmin bypass without the JSONB containing the permission.
```

If this test fails in the future because someone changes the bypass logic,
the regression surfaces immediately.

#### 6.4 — tRPC endpoints on tenants router

**File**: `src/trpc/routers/tenants.ts`

Add three procedures at the end of `tenantsRouter`:

```ts
const SUPPORT_ACCESS_GRANT = permissionIdByKey("platform.support_access.grant")!

requestSupportAccess: tenantProcedure
  .use(requirePermission(SUPPORT_ACCESS_GRANT))
  .input(
    z.object({
      reason: z.string().min(10).max(1000),
      ttlMinutes: z.number().int().min(15).max(240),  // max 4 h
      consentReference: z.string().max(255).optional(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    const expiresAt = new Date(Date.now() + input.ttlMinutes * 60 * 1000)
    const session = await ctx.prisma.supportSession.create({
      data: {
        tenantId: ctx.tenantId,
        requestedByUserId: ctx.user.id,
        reason: input.reason,
        consentReference: input.consentReference ?? null,
        status: "pending",
        expiresAt,
      },
    })

    await auditLog.log(ctx.prisma, {
      tenantId: ctx.tenantId,
      userId: ctx.user.id,
      action: "create",
      entityType: "support_session",
      entityId: session.id,
      entityName: input.reason.slice(0, 80),
      metadata: { expiresAt: expiresAt.toISOString(), ttlMinutes: input.ttlMinutes },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
    await platformAudit.log(ctx.prisma, {
      platformUserId: null,
      action: "support_session.requested",
      entityType: "support_session",
      entityId: session.id,
      targetTenantId: ctx.tenantId,
      supportSessionId: session.id,
      metadata: { requestedBy: ctx.user.id, ttlMinutes: input.ttlMinutes },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })

    return session
  }),

revokeSupportAccess: tenantProcedure
  .use(requirePermission(SUPPORT_ACCESS_GRANT))
  .input(z.object({ id: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    const session = await ctx.prisma.supportSession.findFirst({
      where: { id: input.id, tenantId: ctx.tenantId },
    })
    if (!session) throw new TRPCError({ code: "NOT_FOUND" })
    if (session.status === "expired" || session.status === "revoked") {
      throw new TRPCError({ code: "CONFLICT", message: "Session already closed" })
    }
    const updated = await ctx.prisma.supportSession.update({
      where: { id: session.id },
      data: { status: "revoked", revokedAt: new Date() },
    })
    // double audit (same shape, action: "support_session.revoked")
    return updated
  }),

listSupportSessions: tenantProcedure
  .use(requirePermission(SUPPORT_ACCESS_GRANT))
  .query(async ({ ctx }) => {
    return ctx.prisma.supportSession.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
    })
  }),

activeSupportSession: tenantProcedure
  .query(async ({ ctx }) => {
    return ctx.prisma.supportSession.findFirst({
      where: {
        tenantId: ctx.tenantId,
        status: "active",
        expiresAt: { gt: new Date() },
      },
      include: { platformUser: { select: { displayName: true, email: true } } },
    })
  }),
```

#### 6.5 — Settings page

**File**: `src/app/[locale]/(dashboard)/admin/settings/support-access/page.tsx` (new)

- Sheet form: reason (min 10), ttl (select 30/60/120/240), optional consentReference
- Submit → `tenantsRouter.requestSupportAccess`
- Table below: pending / active / expired / revoked with revoke button on pending/active rows

#### 6.6 — Sidebar entry

**File**: `src/components/layout/sidebar/sidebar-nav-config.ts`

Add after `access-control`:

```ts
{
  href: "/admin/settings/support-access",
  label: "Support-Zugriff",
  icon: LifeBuoy,
  permission: "platform.support_access.grant",
},
```

#### 6.7 — Active-session banner

**File**: `src/components/auth/support-session-banner.tsx` (new)

Yellow top strip shown when `tenantsRouter.activeSupportSession` returns a
row. Displays "Support-Zugriff aktiv bis HH:MM — Operator: <displayName>
(Grund: <reason>) [Zugriff sofort entziehen]".

Mounted inside `src/app/[locale]/(dashboard)/layout.tsx` between
`TenantGuard` and `AppLayout`.

### Success criteria

#### Automated verification

- [ ] `pnpm db:reset` applies the backfill migration cleanly
- [ ] `pnpm typecheck` passes
- [ ] `pnpm vitest run src/trpc/routers/__tests__/tenants-support-access.test.ts`:
  - No permission → `FORBIDDEN`
  - Reason <10 chars → `BAD_REQUEST`
  - TTL > 240 → `BAD_REQUEST`
  - Valid request creates pending session + two audit entries
  - Revoke pending → `revoked`, two audit entries
  - Revoke already-revoked → `CONFLICT`
- [ ] `pnpm vitest run src/trpc/routers/__tests__/tenants-support-access-new-tenant.test.ts`:
  - Fresh tenant, no user group, user.role='admin' → `requestSupportAccess` succeeds (isAdmin bypass)

#### Manual verification

- [ ] As tenant admin: open `/admin/settings/support-access`, create a 30-min request, see it in the table
- [ ] Revoke the session → removed

**Pause for manual confirmation before proceeding to Phase 7.**

---

## Phase 7 — Impersonation mechanic

### Overview

Extending `createTRPCContext` with a second auth branch so platform
operators with an active `SupportSession` can reach the tenant tRPC
router with all 105 sub-routers intact. The audit double-write is wired
via Node's `AsyncLocalStorage`, which reaches all 131 audit callers
without touching any of them.

### Pre-flight: `users(id)` FK inventory and sentinel strategy

`grep` on `prisma/schema.prisma` finds the following columns that reference
`users.id`:

- `AuditLog.userId` (SetNull)
- `TenantModule.enabledById` (nullable, SetNull)
- `Tenant.demoCreatedById` (nullable, SetNull)
- `InboundInvoice.submittedBy` / `.datevExportedBy` / `.createdBy` (all nullable, SetNull)
- `InboundInvoiceApprovalPolicy.approverUserId` (nullable, SetNull)
- `InboundInvoiceApproval.approverUserId` / `.decidedBy` (nullable, SetNull)
- Twenty-plus service tables carrying `createdById String? @db.Uuid` (all nullable, observed from Grep on `prisma/schema.prisma:293, 383, 586, 615, 651, 695, 801, 877, 951, 1005, 1031, 1105, 4626, 4658, 4773, 4845, 4902, 4935, 5033, 5076, 5162, 5189`)

**All existing FKs to `users.id` are nullable.** The count is far more than
three.

**Decision — option (a): Create a real, locked "Platform System" user row in `public.users`.**

Rationale (contradicting the review's numeric heuristic, with justification):
Option (b) — making FK columns NULL during impersonation — is trivial at the
schema level (columns are already nullable) but expensive at the code level,
because every service site that writes `createdById: ctx.user.id` would need
to branch on the impersonation flag. With >20 such writes, that's a large
and error-prone surface. Option (a) is constant-time: a single migration
creates one row with the sentinel UUID. FK writes succeed naturally; service
code stays untouched. The "fake user pollution" concern is mitigated by:

- Sentinel UUID `00000000-0000-0000-0000-00000000beef` (obviously not a real user)
- `is_active = false`, `is_locked = true` → cannot log in via Supabase, cannot appear in user lists filtered on active/unlocked
- Distinctive email `platform-system@internal.terp` and display name "Platform System"
- UIs that render creator names can special-case this UUID to display "Platform Support (Tolga via support session)" by joining against `platform_audit_logs` on the same `tenantId`/`entityId`/`performedAt` window

### Changes required

#### 7.1 — Migration: Platform System sentinel user

**File**: `supabase/migrations/20260420000002_create_platform_system_user.sql` (new)

```sql
-- Sentinel "Platform System" user for impersonation-originated writes.
-- Locked and inactive — cannot log in via Supabase Auth.
-- Referenced by FKs when platform operators write into tenant tables via a SupportSession.
INSERT INTO users (
  id, email, username, display_name, role,
  is_active, is_locked, tenant_id, user_group_id,
  created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-00000000beef',
  'platform-system@internal.terp',
  'platform-system',
  'Platform System',
  'system',
  false,   -- is_active
  true,    -- is_locked
  NULL,
  NULL,
  now(),
  now()
) ON CONFLICT (id) DO NOTHING;
```

Since the app's Supabase login flow calls
`supabase.auth.signInWithPassword`, and this row has no matching
`auth.users` entry, it is not reachable as a login identity.

#### 7.2 — Impersonation context (AsyncLocalStorage)

**File**: `src/lib/platform/impersonation-context.ts` (new)

```ts
import { AsyncLocalStorage } from "node:async_hooks"

export interface ImpersonationContext {
  platformUserId: string
  supportSessionId: string
}

export const impersonationStorage = new AsyncLocalStorage<ImpersonationContext>()

export function getImpersonation(): ImpersonationContext | null {
  return impersonationStorage.getStore() ?? null
}
```

This single module is the entire wiring. `createTRPCContext` starts the
store for impersonation requests; `audit-logs-service.log()` reads it
implicitly. **No caller changes anywhere.**

#### 7.3 — Extend `createTRPCContext` with the impersonation branch

**File**: `src/trpc/init.ts`

Extend `TRPCContext`:

```ts
export type TRPCContext = {
  prisma: PrismaClient
  authToken: string | null
  user: ContextUser | null
  session: Session | null
  tenantId: string | null
  ipAddress: string | null
  userAgent: string | null
  impersonation: ImpersonationContext | null  // NEW
}
```

And extend `createTRPCContext` between the existing tenant-auth block
(ends at line ~126) and the `return` statement:

```ts
import { verify as verifyPlatformJwt } from "@/lib/platform/jwt"
import type { ImpersonationContext } from "@/lib/platform/impersonation-context"

// ... existing tenant auth (lines 84-126) unchanged ...

let impersonation: ImpersonationContext | null = null

// Platform impersonation path: runs only if no tenant user was resolved,
// a platform cookie is present, AND a support-session header is set.
if (!user) {
  const cookieHeader = opts.req.headers.get("cookie") ?? ""
  const platformJwt = cookieHeader.match(/platform-session=([^;]+)/)?.[1] ?? null
  const supportSessionId =
    opts.req.headers.get("x-support-session-id") ??
    (connParams?.["x-support-session-id"] as string | undefined) ?? null

  if (platformJwt && supportSessionId && tenantId) {
    const verified = await verifyPlatformJwt(platformJwt)
    if (verified.ok && verified.claims.mfaVerified) {
      const session = await prisma.supportSession.findFirst({
        where: {
          id: supportSessionId,
          tenantId,
          platformUserId: verified.claims.sub,
          status: "active",
          expiresAt: { gt: new Date() },
        },
      })
      if (session) {
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
        const platformSystemUser = await prisma.user.findUnique({
          where: { id: "00000000-0000-0000-0000-00000000beef" },
          include: {
            userGroup: true,
            userTenants: { include: { tenant: true } },
          },
        })
        if (tenant && platformSystemUser) {
          // Synthesize ContextUser: the Platform System sentinel row,
          // augmented with a single synthetic userTenant for the active tenant
          // so the existing tenantProcedure scan succeeds without modification.
          user = {
            ...platformSystemUser,
            userGroup: { isAdmin: true, ...platformSystemUser.userGroup } as ContextUser["userGroup"],
            userTenants: [
              {
                userId: platformSystemUser.id,
                tenantId: tenant.id,
                role: "support",
                createdAt: session.createdAt,
                tenant,
              },
            ],
          } as ContextUser
          session = {
            access_token: "synthetic-platform-impersonation",
            user: { id: platformSystemUser.id, email: platformSystemUser.email } as Session["user"],
          } as Session
          impersonation = {
            platformUserId: verified.claims.sub,
            supportSessionId: session.id,
          }
        }
      }
    }
  }
}

return {
  prisma,
  authToken,
  user,
  session,
  tenantId,
  ipAddress,
  userAgent,
  impersonation,
}
```

Notes:

- The branch runs **only** if the tenant-auth path did not resolve a user. A
  normal Supabase-authenticated request is completely unaffected — it takes
  the exact same path as before.
- The synthesized `userGroup.isAdmin = true` means `isUserAdmin(user)`
  returns `true`, so all `requirePermission(...)` calls succeed for the
  operator.
- The synthesized `userTenants` contains one row for the active tenant, so
  the existing `tenantProcedure` scan at `src/trpc/init.ts:220-222` succeeds
  unmodified.
- `ctx.impersonation` is non-null only on impersonation requests.

#### 7.4 — Wrap execution in AsyncLocalStorage

**File**: `src/trpc/init.ts` — add a middleware at the top level

After the tRPC init (`const t = initTRPC...`), add:

```ts
import { impersonationStorage } from "@/lib/platform/impersonation-context"

/** Runs every procedure inside the impersonation AsyncLocalStorage when active. */
const impersonationBoundary = t.middleware(({ ctx, next }) => {
  const c = ctx as TRPCContext
  if (c.impersonation) {
    return impersonationStorage.run(c.impersonation, () => next())
  }
  return next()
})

// Apply to the foundation so every downstream procedure inherits the store.
export const publicProcedure = t.procedure.use(impersonationBoundary)
export const protectedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.user || !ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" })
  }
  return next({ ctx: { ...ctx, user: ctx.user, session: ctx.session } })
})
```

`tenantProcedure` continues to derive from `protectedProcedure` (existing
code at lines 210-238, unchanged).

#### 7.5 — Audit service reads impersonation context

**File**: `src/lib/services/audit-logs-service.ts`

Modify the single `log()` function (lines 168-182) to detect impersonation
via the store and dual-write. **No caller changes.** The repository layer
stays unchanged.

```ts
import { getImpersonation } from "@/lib/platform/impersonation-context"

export async function log(
  prisma: PrismaClient,
  data: AuditLogCreateInput
): Promise<void> {
  const impersonation = getImpersonation()
  try {
    // Tenant audit log write (unchanged).
    await repo.create(prisma, data)

    // Second write: platform audit log. Only when impersonation is active.
    if (impersonation) {
      await prisma.platformAuditLog.create({
        data: {
          platformUserId: impersonation.platformUserId,
          action: `impersonation.${data.action}`,
          entityType: data.entityType,
          entityId: data.entityId,
          targetTenantId: data.tenantId,
          supportSessionId: impersonation.supportSessionId,
          changes: (data.changes as Prisma.InputJsonValue) ?? undefined,
          metadata: {
            entityName: data.entityName ?? null,
            originalUserId: data.userId,  // = the Platform System sentinel
          },
          ipAddress: data.ipAddress ?? null,
          userAgent: data.userAgent ?? null,
        },
      })
    }
  } catch (err) {
    console.error("[AuditLog] Failed:", err, {
      action: data.action, entityType: data.entityType, entityId: data.entityId,
    })
  }
}
```

Both writes live inside the same try/catch: an error in either write is
logged and swallowed (audit logging must never break the business
operation). This preserves the fire-and-forget contract that all 131
callers already rely on.

The `logBulk` function gets the same treatment — mirror the `if (impersonation) { ... }` block after the bulk tenant write.

#### 7.6 — Impersonation banner in tenant UI

The banner from Phase 6.7 already handles the generic case (yellow strip
when `tenantsRouter.activeSupportSession` returns a row). No additional
work: when the tenant's own admin sees the banner, they see it because a
SupportSession is active. When the operator sees the tenant UI through an
impersonation request, the same `activeSupportSession` query returns the
same row.

### Success criteria

#### Automated verification

- [ ] `pnpm db:reset` applies the sentinel-user migration cleanly; `SELECT id, is_locked, is_active FROM users WHERE id = '00000000-0000-0000-0000-00000000beef'` returns one row
- [ ] `pnpm typecheck` passes
- [ ] `pnpm vitest run src/trpc/__tests__/init-impersonation.test.ts`:
  - Platform cookie + no `x-support-session-id` → `ctx.user === null`, `ctx.impersonation === null`
  - Platform cookie + valid session id + correct tenant → `ctx.user.id === '…beef'`, `ctx.user.userGroup.isAdmin === true`, `ctx.impersonation` populated
  - Platform cookie + session for a different tenant → `ctx.user === null`
  - Platform cookie + session for a different platform user → `ctx.user === null`
  - Platform cookie + expired session → `ctx.user === null`
- [ ] `pnpm vitest run src/lib/services/__tests__/audit-logs-impersonation.test.ts`:
  - Impersonation context active during `log()` → writes both tenant row AND platform row with matching entity fields
  - No impersonation context → writes tenant row only, platform row untouched
  - Error in platform write does not propagate (try/catch holds)
- [ ] `pnpm vitest run src/trpc/__tests__/async-storage-propagation.test.ts`:
  - `impersonationStorage.getStore()` is readable from inside a service call invoked from a tRPC procedure when `ctx.impersonation` is set
  - Returns `null` when `ctx.impersonation` is absent

#### Manual verification

- [ ] Log in at `/platform/login`, activate a pending session for tenant X, navigate to the tenant UI with the platform cookie and `x-support-session-id` header, create an employee
- [ ] Yellow banner "Support-Zugriff aktiv …" visible in the tenant UI
- [ ] `audit_logs` row: `user_id` = Platform System sentinel UUID
- [ ] `platform_audit_logs` row: `action='impersonation.create'`, `target_tenant_id` = tenant X id, `support_session_id` populated, `platform_user_id` = real operator
- [ ] After `expires_at` passes, next tRPC call returns `FORBIDDEN`
- [ ] A different operator cannot reuse the first operator's `x-support-session-id`

**Pause for manual confirmation before proceeding to Phase 8.**

---

## Phase 8 — Cleanup, docs, cron

### Changes required

#### 8.1 — Cleanup cron

**File**: `src/app/api/cron/platform-cleanup/route.ts` (new)

Mirrors `src/app/api/cron/dsgvo-retention/route.ts:19-100` (CRON_SECRET
auth, `runtime: "nodejs"`, error handling). Responsibilities:

1. Flip **pending** sessions older than 30 minutes to `expired` (answers
   Desired-End-State #9).
2. Flip **active** sessions whose `expires_at <= now()` to `expired`. Write
   a `platform_audit_logs` row per auto-expired session (`action: 'support_session.expired'`).
3. Delete `platform_login_attempts` rows older than 30 days.

**File**: `vercel.json` — add:

```json
{
  "path": "/api/cron/platform-cleanup",
  "schedule": "*/5 * * * *"
}
```

#### 8.2 — Mark prior-art ticket obsolete

**File**: `thoughts/shared/tickets/misc/platform-admin-tenant-access.md` →
rename to `platform-admin-tenant-access_OBSOLETE.md` and replace content
with:

```markdown
# OBSOLETE — superseded by 2026-04-09 Platform Admin System

Plan:     thoughts/shared/plans/2026-04-09-platform-admin-system.md
Research: thoughts/shared/research/2026-04-09-platform-admin-system.md

The `platform_admins` flag-table approach proposed here was rejected in
favour of a fully separated auth domain (own PlatformUser table, own JWT,
mandatory MFA, no userTenants bypass, consent-based impersonation).
```

#### 8.3 — Docs

**File**: `docs/platform-admin/README.md` (new)

Sections: architecture diagram (two parallel worlds sharing the same
Prisma), operator onboarding, support-session lifecycle state machine,
audit log layout (tenant + platform), troubleshooting (lost MFA, locked
out, cookies), JWT-secret rotation runbook.

**File**: `TERP_HANDBUCH_V2.md` — DSGVO section update

New subsection "Support-Zugriff durch den Betreiber":

- Antrag und Freigabe eines Support-Zugriffs
- Art. 6 Abs. 1 lit. b und f DSGVO als Rechtsgrundlage
- Pflicht zur Dokumentation von Grund und Consent-Referenz
- AVV-Ergänzung: Audit-Trail, Zweckbindung, TTL
- Hinweis auf den gelben Banner in der UI

#### 8.4 — Deployment docs

**File**: `docs/deployment/platform-admin.md` (new)

- Vercel: add `admin.terp.de` alongside `app.terp.de` in Domains
- Env vars: `PLATFORM_JWT_SECRET` (32+ random bytes base64), `PLATFORM_COOKIE_DOMAIN=admin.terp.de`
- DNS: CNAME `admin` → Vercel
- Initial bootstrap (one-time, from trusted dev machine):
  `pnpm tsx scripts/bootstrap-platform-user.ts tolga@terp.de "Tolga"`

#### 8.5 — E2E coverage

**File**: `src/e2e-browser/99-platform-support-consent.spec.ts` (new)

Follows `src/e2e-browser/*.spec.ts`, reuses `helpers/auth.ts` for tenant
login. Covers the tenant-side consent flow:

1. Tenant admin logs in
2. Navigates to `/admin/settings/support-access`
3. Creates a 30-min request
4. Verifies the row appears in the table
5. Revokes it
6. Verifies the banner is gone

(The cross-domain platform side is covered by Vitest in Phases 2-3.)

### Success criteria

#### Automated verification

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm vitest run` all-green (full suite)
- [ ] `pnpm playwright test src/e2e-browser/99-platform-support-consent.spec.ts` passes
- [ ] `pnpm build` succeeds

#### Manual verification

- [ ] Prior-art ticket renamed
- [ ] Handbook DSGVO subsection present
- [ ] Cron test: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/cron/platform-cleanup` returns `{ok: true, expired: N, deleted: M}`
- [ ] A pending session older than 30 minutes flips to `expired` on the next cron run; an active session whose `expires_at` has passed also flips to `expired`

---

## Testing Strategy

### Unit tests (Vitest)

- `src/lib/platform/__tests__/password.test.ts`
- `src/lib/platform/__tests__/jwt.test.ts`
- `src/lib/platform/__tests__/totp.test.ts`
- `src/lib/platform/__tests__/rate-limit.test.ts`
- `src/lib/platform/__tests__/login-service.test.ts`
- `src/lib/services/__tests__/audit-logs-impersonation.test.ts`

### Router / context tests (Vitest)

- `src/trpc/platform/routers/__tests__/auth.test.ts`
- `src/trpc/platform/routers/__tests__/platformUsers.test.ts`
- `src/trpc/platform/routers/__tests__/tenants.test.ts`
- `src/trpc/platform/routers/__tests__/supportSessions.test.ts`
- `src/trpc/platform/routers/__tests__/auditLogs.test.ts`
- `src/trpc/routers/__tests__/tenants-support-access.test.ts`
- `src/trpc/routers/__tests__/tenants-support-access-new-tenant.test.ts`
- `src/trpc/__tests__/init-impersonation.test.ts`
- `src/trpc/__tests__/async-storage-propagation.test.ts`

### End-to-end (Playwright)

- `src/e2e-browser/99-platform-support-consent.spec.ts`

### Key edge cases

- Wrong password counts toward rate limit; right password does not
- Wrong TOTP counts toward rate limit
- **Wrong recovery code counts toward rate limit (`failReason='bad_recovery_code'`)**
- 5 × wrong recovery code → 6th attempt rate-limited even with correct password
- MFA code from 90 s ago rejected; from 20 s ago accepted
- Recovery code single-use
- Impersonation cannot cross tenants (session for A does not unlock B)
- Impersonation cannot be reused after `expiresAt`
- Concurrent activation race → second activator gets `CONFLICT`
- Platform audit double-write inside `AsyncLocalStorage` context reaches `log()` transitively through 2+ service layers
- Tenant-world requests (no platform cookie) have `impersonationStorage.getStore() === null` — zero leakage
- Next-intl never sees `/platform/*` because middleware returns before calling `intlMiddleware` for that path

## Performance Considerations

- `platform_login_attempts` grows indefinitely without the cleanup cron (Phase 8.1 handles this with a 30-day retention). Rate-limit queries are bounded to a 15-min window and hit composite indexes.
- `createTRPCContext` adds **one extra cookie-header scan** for normal tenant traffic and does **zero extra DB reads** when no platform cookie is present. The expensive DB hits (SupportSession lookup, Platform System user lookup) only run when the header/cookie combination signals impersonation.
- `AsyncLocalStorage` has measurable but negligible overhead in Node — confirmed as acceptable by the Node.js docs for per-request context propagation.
- `platform_audit_logs` is write-heavy during active sessions; indexes on `(platform_user_id, performed_at)` and `(target_tenant_id, performed_at)` support the expected query shape.
- Platform JWT refresh is HMAC-SHA256, cheap; runs on every platform request.

## Migration Notes

- **Greenfield.** No `platform_users`/`support_sessions` data to migrate.
- **Backward compatible for tenants.** Tenant code paths unchanged except:
  - `createTRPCContext` gains a second auth branch (no-op without platform cookie).
  - `audit-logs-service.log()` gains an `AsyncLocalStorage` read (no-op without active store).
  - `publicProcedure` runs inside the impersonation middleware boundary (no-op without active store).
- **Rollback**: `supabase migration down` on the three new migrations removes all four platform tables and the sentinel user; deleting `src/app/platform/`, `src/trpc/platform/`, `src/lib/platform/`, `src/lib/services/audit-logs-service.ts` revert, and restoring `src/proxy.ts` returns the repo to the previous state.
- **Permission backfill**: the `platform.support_access.grant` permission is added to all `user_groups WHERE is_admin = TRUE` in Phase 6.2. This is purely for data consistency because the runtime path uses the `isAdmin` bypass.

## References

- Research: `thoughts/shared/research/2026-04-09-platform-admin-system.md`
- Related research: `thoughts/shared/research/2026-04-09-demo-tenant-system.md`
- Obsoleted ticket: `thoughts/shared/tickets/misc/platform-admin-tenant-access.md`
- tRPC context: `src/trpc/init.ts:61-238`
- Audit service: `src/lib/services/audit-logs-service.ts:168-182`
- Audit repository: `src/lib/services/audit-logs-repository.ts:94-132`
- Tenants router: `src/trpc/routers/tenants.ts`
- Permission catalog: `src/lib/auth/permission-catalog.ts:10-29`
- Permission migration pattern: `supabase/migrations/20260415100000_add_audit_log_export_permission.sql`
- Cron route pattern: `src/app/api/cron/dsgvo-retention/route.ts:19-100`
- DB-counter rate-limit prior art: `src/lib/services/ai-assistant-service.ts`
- Field encryption: `src/lib/services/field-encryption.ts`
- Middleware entry: `src/proxy.ts` (to become `src/middleware.ts`)
- Tenant login: `src/app/[locale]/(auth)/login/page.tsx:41`
- Dashboard layout chain: `src/app/[locale]/(dashboard)/layout.tsx:14-21`
- Test helpers: `src/trpc/routers/__tests__/helpers.ts`
- Permissions bypass: `src/lib/auth/permissions.ts:73-93`
- Tenant service: `src/lib/services/tenant-service.ts:76-149`
- i18n routing: `src/i18n/routing.ts`

---

## Changelog

Revisions applied after the 2026-04-09 review:

1. Phase 7.3 rewritten from scratch as a single `AsyncLocalStorage`-based mechanism in `src/lib/platform/impersonation-context.ts`; `audit-logs-service.log()` reads the store implicitly — zero caller changes, no sentinel-check safety nets, no multi-mechanism fallback.
2. Phase 7.1 collapsed to the final solution only — a single `createTRPCContext` branch that detects `platform-session` cookie + `x-support-session-id` header. The earlier "extend `tenantProcedure`" draft has been removed.
3. Phase 7 gains a pre-flight FK inventory on `prisma/schema.prisma` with an explicit, justified decision: option (a) — real locked "Platform System" user row in `public.users` via migration `20260420000002`. Rationale: with >20 nullable `createdById` FKs, option (a) is constant-time at the code level while option (b) would require intercepting every service-layer write.
4. Phase 4.2 documents the next-intl/concrete-vs-dynamic-route reasoning and adds an explicit `pnpm build` smoke test in the success criteria; a fallback layout (`src/app/(tenant)/[locale]/`) is documented for use only if the primary breaks the build.
5. `PLATFORM_COOKIE_DOMAIN` is now optional. Middleware has two modes: subdomain (if set) and path-prefix (if empty). Phase 2.1, 4.1, and `.env.example` updated accordingly.
6. Phase 2 pre-flight confirms `src/lib/services/field-encryption.ts` already exists with AES-256-GCM and `FIELD_ENCRYPTION_KEY_V1`; the TOTP utility reuses it directly. No separate `src/lib/platform/crypto.ts` module.
7. Phase 5.1 specifies a concrete custom `fetch` wrapper that reads response headers, detects `401 + x-auth-domain: platform`, and redirects to `/platform/login`. Full code snippet inlined.
8. Desired End State #9 now explicitly covers the 30-minute pending-session auto-expire.
9. Phase 2.5 makes failed recovery-code verifications also record `PlatformLoginAttempt` rows with `failReason: 'bad_recovery_code'`, closing the brute-force gap. Phase 2 tests extended to cover this path.
10. Phase 6 documents that no new-tenant permission-backfill code change is required: `tenant-service.ts:76-149` does not create user groups, and tenant admins get the permission via the `isAdmin` bypass in `permissions.ts:73-93`. A regression test `tenants-support-access-new-tenant.test.ts` codifies this invariant.
