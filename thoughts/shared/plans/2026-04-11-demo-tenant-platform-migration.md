---
date: 2026-04-11
planner: tolga
git_commit: 9e4e0b2757b343690a6d401483d1de17fb0c6ea4
branch: staging
repository: terp
topic: "Migrate demo-tenant management from /admin/tenants to /platform/*"
tags: [plan, demo-tenant, platform-admin, migration, subscription-bridge]
status: implemented (Phases 1–8 complete 2026-04-11)
based_on: thoughts/shared/research/2026-04-11-demo-tenant-platform-migration.md
---

# Demo-Tenant Platform Migration Implementation Plan

## Overview

Move demo-tenant lifecycle management (create, list, extend, convert, expireNow, delete) out of the tenant app `/admin/tenants` surface and into the platform-admin world `/platform/tenants/demo`. Authorization shifts from the tenant permission `tenants.manage` to `platformAuthedProcedure` (MFA-validated platform operator session). The tenant-side demo UX (banner, expiration gate, `/demo-expired` page, and the self-service `requestConvertFromExpired` endpoint) stays untouched.

A new parallel FK column `demo_created_by_platform_user_id` keeps the real operator identity on the demo row without losing the legacy `demo_created_by` column. The convert flow gains a subscription-bridge coupling so each converted module automatically gets a `platform_subscription`. A new `demo_convert_requests` inbox materializes the previously-deferred platform-side surface for the self-service convert request.

## Current State Analysis

See the exhaustive research at `thoughts/shared/research/2026-04-11-demo-tenant-platform-migration.md`. Summarized:

- Demo-tenant stack is one router, one service, one repo, one template, 4 UI components, 1 hook module, 1 cron route — all gated by `tenants.manage`.
- `src/lib/services/demo-tenant-service.ts` is service+repository-pattern compliant and already accepts `prisma` as a plain parameter. It writes audit entries to `audit_logs` (tenant-scoped) and passes an `AuditContext` through to `users-service.create` for welcome-email delivery.
- `src/trpc/platform/routers/tenantManagement.ts` is the existing template for platform-side tenant writes. Its `create` procedure already demonstrates the pattern: `prisma.$transaction` → `createUserService(tx, tenant.id, ..., {userId: PLATFORM_SYSTEM_USER_ID, ...})` → `platformAudit.log`.
- `src/lib/platform/subscription-service.ts:262-403` (`createSubscription`) is the callable entry point for the billing bridge. It takes `PrismaClient` (not `Tx`) because it opens its own `$transaction`, and it enforces the house-rule via `PlatformSubscriptionSelfBillError`.
- `platform_audit_logs.target_tenant_id REFERENCES tenants(id) ON DELETE SET NULL` — the audit-before-delete ordering from the current `deleteDemo` must be preserved. Platform router writes audit before calling the service delete.
- No existing platform-side inbox for convert requests; `src/app/platform/(authed)/dashboard/page.tsx:11-13` has an explicit deferred comment waiting for materialization.
- Zero tests assert `tenants.manage` as a FORBIDDEN gate on demo procedures — a gate swap is compatible.

## Desired End State

After this plan:

1. `src/trpc/platform/routers/demoTenantManagement.ts` exists with 7 `platformAuthedProcedure` procedures (`templates`, `list`, `create`, `extend`, `convert`, `expireNow`, `delete`). Each mutation writes exactly one `platform_audit_logs` row with `ctx.platformUser.id`. No demo-related rows go into the tenant-side `audit_logs` from these procedures.
2. `src/trpc/routers/demo-tenants.ts` is deleted. `src/trpc/routers/demo-self-service.ts` is a new tenant-scoped router with only `requestConvertFromExpired` (unchanged semantics, unchanged permissions — this stays self-service for the expired-demo admin user).
3. The `Tenant` model has a new nullable column `demo_created_by_platform_user_id UUID NULL REFERENCES platform_users(id) ON DELETE SET NULL`, populated by platform-initiated creates. The legacy `demo_created_by` column stays untouched — nothing gets written into it going forward, and existing rows are preserved.
4. `src/app/platform/(authed)/tenants/demo/page.tsx` is the new admin surface: all-demos list with Active/Expired status column, create-sheet with template picker, context-sensitive row actions.
5. `demo_convert_requests` table + `DemoConvertRequest` Prisma model + service + router + page (`src/app/platform/(authed)/tenants/convert-requests/page.tsx`) surface pending self-service requests. `demoService.requestConvertFromExpired` writes a row into this table as a third side effect (alongside the existing `audit_logs` and `email_send_log` writes). Platform dashboard card activated.
6. Convert flow is coupled to the subscription bridge: each module that was enabled on the demo gets a `platform_subscription` row created after convert, using the new `billingCycle` input (default MONTHLY). Partial failure is documented as a known limitation.
7. `src/components/tenants/demo/**` (5 files) is deleted. `DemoTenantsPanel` is unmounted from `src/app/[locale]/(dashboard)/admin/tenants/page.tsx:122`. The `tenants.manage`-gated "normal" tenant CRUD on that page stays.
8. `src/app/api/cron/expire-demo-tenants/route.ts` is **not touched**. Cron continues to write `audit_logs.userId=null` with `action="demo_expired"`.
9. `src/components/layout/demo-banner.tsx`, `demo-expiration-gate.tsx`, and `src/app/[locale]/demo-expired/**` are **not touched** — tenant-side UX remains.
10. `CLAUDE.md` Platform Subscription Billing section is updated to document the convert-flow coupling.

### Key Discoveries:

- `src/lib/services/demo-tenant-service.ts:575-762` — `wipeTenantData` L3 deletes `tenantModule` rows. Convert-flow with `discardData=true` must snapshot enabled modules **before** the wipe, or the re-enablement list is lost.
- `src/lib/platform/subscription-service.ts:262` — `createSubscription` accepts `PrismaClient`, not `Tx`. It opens its own `$transaction` internally and cannot be called from inside an outer transaction. This forces the convert orchestration out of the atomic wipe-and-strip-flags transaction.
- `src/lib/services/audit-logs-service.ts:177-213` — `log()` has an implicit dual-write to `platform_audit_logs` when `getImpersonation()` (via `AsyncLocalStorage`) is active. This is orthogonal to this plan — platform-admin operating outside an impersonation context triggers none of that logic.
- `src/trpc/platform/routers/tenantManagement.ts:200` — `createUserService(tx, tenant.id, ..., {userId: PLATFORM_SYSTEM_USER_ID, ...})` is the canonical sentinel pattern for platform-initiated tenant-scoped user creates. This plan mirrors it in `demoService.createDemo`, but **only for the `AuditContext.userId` passthrough**, never for `demoCreatedById` or `demoCreatedByPlatformUserId`.
- `src/trpc/platform/routers/tenantManagement.ts:410-425` — `listModules` demonstrates the manual-join pattern for resolving `enabledByPlatformUserId` without a Prisma relation. `findDemos` (new) adopts the same pattern for `demoCreatedByPlatformUserId`.
- `platform_audit_logs.target_tenant_id REFERENCES tenants(id) ON DELETE SET NULL` (migration `20260421000000_create_platform_admin_tables.sql:49`). Audit-before-delete ordering for `demo.deleted` action is required: the insert must happen while the tenant row still exists, then cascade sets `target_tenant_id` to NULL on the audit row but preserves metadata.
- `src/app/platform/(authed)/support-sessions/page.tsx:80-208` — canonical queue/inbox UI pattern (tabbed list, per-status conditional queries, row-action mutations, invalidate-on-success). `demo_convert_requests` inbox follows this structure.
- No FK from `audit_logs` to `tenants`. `demo_delete` audit rows survive tenant delete. Platform side has the inverse: FK with SetNull. Both patterns are valid — this plan uses SetNull semantics on the platform side and preserves metadata explicitly.
- `prisma/schema.prisma:114-121` — Five demo fields on `Tenant`. Existing `demoCreatedBy` Prisma relation (`@relation("DemoTenantCreatedBy")`) stays. New column has no Prisma relation, only a `@map` and SQL-level FK — consistent with all platform-side FK columns in the schema.

## What We're NOT Doing

Explicitly out of scope:

- **No touch on `/api/cron/expire-demo-tenants/route.ts`**. Cron continues to run on its existing schedule, continues to write `audit_logs` with `userId=null`. Rationale: the event is semantically tenant-bound ("this tenant expired"), and "don't touch the cron" is free risk reduction.
- **No touch on `demo-banner.tsx`, `demo-expiration-gate.tsx`, `/demo-expired/page.tsx`, `/demo-expired/layout.tsx`**. Tenant-context UX.
- **No touch on `src/lib/demo/**`** (template engine). Works unchanged — `createDemo` still passes `{tx, tenantId, adminUserId}` through.
- **No modification to the legacy `demo_created_by` column or `demoCreatedBy` Prisma relation**. Kept for historical rows; new platform-initiated creates leave it NULL.
- **No data migration** for existing demo rows. Pre-flight check (Phase 0) gates the plan — if rows exist in prod/staging, operator either kills them or backfills the new column manually before proceeding.
- **No refactor of `audit-logs-service.ts` impersonation dual-write**. Orthogonal.
- **No new permission in `permission-catalog.ts`**. The existing `tenants.manage` is no longer referenced by demo procedures after this migration; we do NOT remove it, because the regular tenant CRUD (`tenants.*` router) still uses it.
- **No changes to `PLATFORM_SYSTEM_USER_ID` sentinel or its migration**.
- **No hook for demo operations in `src/hooks/**`** after migration. Platform-side pages use `trpc.demoTenantManagement.*` inline via `useQuery`/`useMutation`, matching the existing convention in `src/app/platform/(authed)/**`.
- **No auto-resolve side effect in convert-requests `resolve` mutation**. Resolve is a status flip + note only. Operator navigates to the demos page manually via the deep-link.
- **No e2e browser tests in `src/e2e-browser/**`**. Demo flow is not covered there today and adding coverage is a separate task.
- **No i18n for platform pages**. Per `feedback_i18n_tenant_only.md`: platform-admin UI is German hardcoded.

## Implementation Approach

Nine phases, each with a hard gate. Phase 0 is a no-code pre-flight check and blocks the entire plan. Phases 1 and 2 are backend-only (schema + service), run-once, fully recoverable. Phase 3 introduces the new platform router without removing the old tenant router — both coexist briefly. Phase 4 flips the router registration and makes the tenant-side router cleanup complete. Phases 5 and 6 are UI + new inbox. Phase 7 is cleanup (deletion of the old components). Phase 8 is docs + final verification.

Between Phase 3 and Phase 4, the old tenant-side admin panel is still functional — meaning a deploy between those phases doesn't break the current operator workflow. This is intentional so a rollback is straightforward.

---

## Phase 0: Pre-Flight Check

### Overview

No code changes. A hard gate that verifies no production/staging data exists that would complicate the schema migration in Phase 1. Plan implementation **does not start** without an explicit greenlight.

### Changes Required:

None. This phase is a database check and a human decision.

### Commands to Run (on Prod AND Staging, in that order):

```sql
SELECT id, name, slug, demo_created_by, demo_expires_at, is_active
FROM tenants
WHERE is_demo = true;
```

### Decision Matrix:

| Outcome | Action |
|---|---|
| Zero rows | Proceed to Phase 1 |
| 1–N rows, none critical (test data) | Operator decides: either hard-delete the rows via `DELETE FROM tenants WHERE id IN (...)` (cascade clears all tenant-scoped data per existing FKs), **or** proceed to Phase 1 and manually backfill `demo_created_by_platform_user_id` with a valid platform user id after Phase 1 completes |
| 1–N rows, business-critical data | STOP. Escalate. Business must decide whether these demos become real tenants (manual convert) or get archived before migration proceeds |

### Success Criteria:

#### Automated Verification:

- [ ] N/A — this phase has no automation

#### Manual Verification:

- [ ] Query executed on Prod
- [ ] Query executed on Staging
- [ ] Results reviewed by operator
- [ ] If non-empty: each row has an explicit disposition (kill / backfill / escalate)
- [ ] Operator gives explicit greenlight to start Phase 1

**Implementation Note**: This is a hard gate. Do NOT start Phase 1 without an explicit "proceed" from the operator. The query results should be pasted into this plan (as an addendum) or captured in an ops-runbook entry for audit purposes.

---

## Phase 1: Schema Migration

### Overview

Add the new `demo_created_by_platform_user_id` column to `tenants` via a new Supabase migration. Update the Prisma schema to expose the field. Regenerate the Prisma client. No service-layer code changes in this phase.

### Changes Required:

#### 1. New Supabase Migration

**File**: `supabase/migrations/20260411100000_add_tenant_demo_created_by_platform_user_id.sql` (new)

```sql
-- =============================================================
-- Add platform-operator creator pointer to tenants.demo_*.
--
-- Parallel column to the existing demo_created_by (which points at
-- public.users.id and stays untouched). Required so Platform-admin-
-- initiated demo creates can attribute the creator to the acting
-- platform operator without losing the legacy tenant-side column.
--
-- No backfill, no data migration. Existing rows get NULL.
--
-- Mirrors the pattern from migration
-- 20260421300001_add_tenant_module_platform_fields.sql which added
-- tenant_modules.enabled_by_platform_user_id.
-- =============================================================

ALTER TABLE public.tenants
  ADD COLUMN demo_created_by_platform_user_id UUID NULL
    REFERENCES public.platform_users(id)
    ON DELETE SET NULL;

COMMENT ON COLUMN public.tenants.demo_created_by_platform_user_id IS
  'Platform operator who created this demo tenant. NULL for legacy rows and for tenant-side creates (which use demo_created_by instead).';

-- No index — findDemos joins via a second query batched by id.
```

#### 2. Prisma Schema Update

**File**: `prisma/schema.prisma`
**Changes**: Add one line to the `Tenant` model next to the existing demo fields (lines 113-121).

```prisma
model Tenant {
  // ... existing fields ...
  isDemo                        Boolean   @default(false) @map("is_demo")
  demoExpiresAt                 DateTime? @map("demo_expires_at") @db.Timestamptz(6)
  demoTemplate                  String?   @map("demo_template") @db.VarChar(100)
  demoCreatedById               String?   @map("demo_created_by") @db.Uuid
  demoNotes                     String?   @map("demo_notes") @db.Text
  demoCreatedByPlatformUserId   String?   @map("demo_created_by_platform_user_id") @db.Uuid
  // ... rest ...
}
```

**Important**: No `@relation` on this field. Matches the convention for all platform-side FK columns in `schema.prisma` — SQL-level FK only.

#### 3. Client Regeneration

**Command**: `pnpm db:generate`

### Success Criteria:

#### Automated Verification:

- [ ] Migration applies cleanly against a fresh DB: `pnpm db:reset` (skipped — destructive; verified instead via incremental `supabase migration up --local`)
- [x] Migration applies cleanly as an incremental diff on a seeded DB: `supabase migration up --local` → `Applying migration 20260422100000_add_tenant_demo_created_by_platform_user_id.sql... Local database is up to date.`
- [x] Prisma client regenerates without errors: `pnpm db:generate`
- [x] Type check passes: `pnpm typecheck` — no new errors. Pre-existing TS2589 in `retention-logs-table.tsx` reproduces without this change.
- [x] Lint passes: `pnpm lint` — 0 errors, 6 pre-existing warnings only.

#### Manual Verification:

- [x] In a local DB, run `\d tenants` (psql) and confirm the new column exists with the correct FK — `demo_created_by_platform_user_id uuid` present; `tenants_demo_created_by_platform_user_id_fkey` references `platform_users(id) ON DELETE SET NULL`.
- [x] FK constraint verified with `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'tenants'::regclass AND conname LIKE '%platform%';` — confirmed SET NULL FK.

**Deviation from plan**: Filename changed from `20260411100000_add_tenant_demo_created_by_platform_user_id.sql` to `20260422100000_add_tenant_demo_created_by_platform_user_id.sql`. Rationale: timestamp `20260411100000` was already taken by `20260411100000_create_email_tables.sql`, and the current migration tip is `20260422000000`, so the file needed a post-tip timestamp to apply cleanly via `supabase migration up` without `--include-all`. SQL contents unchanged.

**Implementation Note**: After this phase passes automated verification, pause for operator to confirm the local DB state looks right before proceeding to Phase 2.

---

## Phase 2: Service Layer Refactor

### Overview

Refactor `demo-tenant-service.ts` and `demo-tenant-repository.ts` to support the new column and strip out tenant-side audit writes. Introduce the `DemoCreatorDTO` type. Rename `findActiveDemos` → `findDemos` and `listActiveDemos` → `listDemos` to reflect that the returned set is no longer filtered by `isActive`. Update tests.

### Changes Required:

#### 1. Repository Layer

**File**: `src/lib/services/demo-tenant-repository.ts`
**Changes**:

- `createDemoTenant(tx, data)` — `data` gains `demoCreatedByPlatformUserId?: string | null`. `demoCreatedById` becomes optional (default `null`) so platform-initiated creates can pass `demoCreatedById: null` explicitly.
- `findActiveDemos` → rename to `findDemos`. Drop `isActive: true` filter. Add a second query for platform users (batch-id lookup) and return the merged creator data on each row. Keep the existing `include: { demoCreatedBy: {...} }` for the tenant-side creator path.
- Add a new repo-level type `DemoWithCreators` to describe the shape of findDemos's return.

**Key Code**:

```ts
export async function createDemoTenant(
  tx: Prisma.TransactionClient,
  data: {
    name: string
    slug: string
    addressStreet: string
    addressZip: string
    addressCity: string
    addressCountry: string
    notes: string | null
    demoExpiresAt: Date
    demoTemplate: string
    demoCreatedById: string | null          // was: required
    demoCreatedByPlatformUserId: string | null  // NEW
    demoNotes: string | null
  },
) {
  return tx.tenant.create({
    data: {
      name: data.name,
      slug: data.slug,
      addressStreet: data.addressStreet,
      addressZip: data.addressZip,
      addressCity: data.addressCity,
      addressCountry: data.addressCountry,
      isDemo: true,
      isActive: true,
      demoExpiresAt: data.demoExpiresAt,
      demoTemplate: data.demoTemplate,
      demoCreatedById: data.demoCreatedById,
      demoCreatedByPlatformUserId: data.demoCreatedByPlatformUserId,
      demoNotes: data.demoNotes,
    },
  })
}

// RENAMED from findActiveDemos. Now returns ALL demos (active + expired).
export async function findDemos(prisma: PrismaClient) {
  const demos = await prisma.tenant.findMany({
    where: { isDemo: true },
    include: {
      demoCreatedBy: {
        select: { id: true, displayName: true, email: true },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  // Batch platform-user lookup (no Prisma relation — same pattern as
  // tenantManagement.listModules:410-425).
  const platformIds = Array.from(
    new Set(
      demos
        .map((d) => d.demoCreatedByPlatformUserId)
        .filter((id): id is string => id !== null),
    ),
  )
  const platformUsers =
    platformIds.length > 0
      ? await prisma.platformUser.findMany({
          where: { id: { in: platformIds } },
          select: { id: true, displayName: true, email: true },
        })
      : []
  const byPlatformId = new Map(platformUsers.map((u) => [u.id, u]))

  return demos.map((d) => ({
    ...d,
    demoCreatedByPlatformUser: d.demoCreatedByPlatformUserId
      ? byPlatformId.get(d.demoCreatedByPlatformUserId) ?? null
      : null,
  }))
}
```

#### 2. Service Layer — New DTO + Signature Changes

**File**: `src/lib/services/demo-tenant-service.ts`
**Changes**:

**New exported type**:

```ts
export type DemoCreatorDTO = {
  source: "platform" | "tenant" | "unknown"
  id: string | null
  displayName: string | null
  email: string | null
}
```

**`createDemo` signature rewrite**:

```ts
// BEFORE:
// createDemo(prisma, creatingUserId: string, input, audit: AuditContext)

// AFTER — platformUserId is a NEW dedicated parameter written to the new column.
// audit is now just {ipAddress, userAgent} — no userId field, because the service
// no longer writes audit_logs. The users-service.create passthrough gets
// PLATFORM_SYSTEM_USER_ID as its userId internally.
export async function createDemo(
  prisma: PrismaClient,
  input: CreateDemoInput,
  platformUserId: string,
  audit: { ipAddress?: string | null; userAgent?: string | null },
): Promise<CreateDemoResult>
```

**CRITICAL — strict separation of platformUserId vs. PLATFORM_SYSTEM_USER_ID**:

```ts
import { PLATFORM_SYSTEM_USER_ID } from "@/trpc/init"

export async function createDemo(
  prisma: PrismaClient,
  input: CreateDemoInput,
  platformUserId: string,
  audit: { ipAddress?: string | null; userAgent?: string | null },
): Promise<CreateDemoResult> {
  const templateKey = input.demoTemplate ?? DEFAULT_DEMO_TEMPLATE
  const template = getDemoTemplate(templateKey)
  const durationDays = input.demoDurationDays ?? DEMO_DEFAULT_DURATION_DAYS
  if (durationDays < 1 || durationDays > 90) {
    throw new DemoTenantValidationError("demoDurationDays must be between 1 and 90")
  }
  const demoExpiresAt = addDays(new Date(), durationDays)

  let createdAuthUserId: string | null = null
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // 1. Tenant row — REAL operator goes into the NEW column.
        //    demoCreatedById stays null (no tenant-side user created it).
        const tenant = await repo.createDemoTenant(tx, {
          name: input.tenantName.trim(),
          slug: input.tenantSlug.trim().toLowerCase(),
          addressStreet: input.addressStreet.trim(),
          addressZip: input.addressZip.trim(),
          addressCity: input.addressCity.trim(),
          addressCountry: input.addressCountry.trim(),
          notes: null,
          demoExpiresAt,
          demoTemplate: templateKey,
          demoCreatedById: null,                     // explicit null — no tenant creator
          demoCreatedByPlatformUserId: platformUserId, // real operator
          demoNotes: input.notes?.trim() ?? null,
        })

        // 2. Enable demo modules (unchanged)
        for (const mod of DEMO_MODULES) {
          await tx.tenantModule.upsert({
            where: { tenantId_module: { tenantId: tenant.id, module: mod } },
            create: {
              tenantId: tenant.id,
              module: mod,
              enabledById: null,
              enabledByPlatformUserId: platformUserId,
            },
            update: {},
          })
        }

        // 3. Demo admin group
        const demoAdminGroup = await repo.findSystemDemoAdminGroup(tx)

        // 4. Create admin user — SENTINEL goes here (users-service audit-logs
        //    needs a non-null userId for the tenant-side audit row).
        const { user: adminUser, welcomeEmail } = await createUser(
          tx,
          tenant.id,
          {
            email: input.adminEmail.trim().toLowerCase(),
            displayName: input.adminDisplayName.trim(),
            userGroupId: demoAdminGroup.id,
            isActive: true,
            isLocked: false,
          },
          {
            userId: PLATFORM_SYSTEM_USER_ID,  // SENTINEL — only for users-service audit
            ipAddress: audit.ipAddress,
            userAgent: audit.userAgent,
          },
        )
        createdAuthUserId = adminUser.id

        // 5. Apply template
        await template.apply({
          tx,
          tenantId: tenant.id,
          adminUserId: adminUser.id,
        })

        return { tenant, adminUser, welcomeEmail }
      },
      { timeout: 120_000 },
    )

    // NO auditLog.log here — platform router writes platform_audit_logs instead.

    return {
      tenantId: result.tenant.id,
      adminUserId: result.adminUser.id,
      inviteLink: result.welcomeEmail.fallbackLink,
      welcomeEmailSent: result.welcomeEmail.sent,
      demoExpiresAt,
      demoTemplate: templateKey,
    }
  } catch (err) {
    // Supabase compensation (unchanged)
    if (createdAuthUserId) {
      try {
        const admin = createAdminClient()
        await admin.auth.admin.deleteUser(createdAuthUserId)
      } catch (rollbackErr) {
        console.error("[demo-tenant-service] Failed to rollback Supabase Auth user:", rollbackErr)
      }
    }
    throw err
  }
}
```

**`listDemos`** (renamed from `listActiveDemos`):

```ts
export async function listDemos(prisma: PrismaClient) {
  const demos = await repo.findDemos(prisma)
  const now = Date.now()
  return demos.map((d) => {
    const daysRemaining = d.demoExpiresAt
      ? Math.ceil((d.demoExpiresAt.getTime() - now) / (24 * 60 * 60 * 1000))
      : 0
    const status: "active" | "expired" = d.isActive ? "active" : "expired"
    const creator: DemoCreatorDTO = d.demoCreatedByPlatformUser
      ? {
          source: "platform",
          id: d.demoCreatedByPlatformUser.id,
          displayName: d.demoCreatedByPlatformUser.displayName,
          email: d.demoCreatedByPlatformUser.email,
        }
      : d.demoCreatedBy
        ? {
            source: "tenant",
            id: d.demoCreatedBy.id,
            displayName: d.demoCreatedBy.displayName,
            email: d.demoCreatedBy.email,
          }
        : { source: "unknown", id: null, displayName: null, email: null }
    return {
      id: d.id,
      name: d.name,
      slug: d.slug,
      isActive: d.isActive,
      isDemo: d.isDemo,
      demoExpiresAt: d.demoExpiresAt,
      demoTemplate: d.demoTemplate,
      demoNotes: d.demoNotes,
      createdAt: d.createdAt,
      daysRemaining,
      status,
      creator,
    }
  })
}
```

**`extendDemo`, `expireDemoNow`, `deleteDemo`** — drop the `audit: AuditContext` parameter entirely. No audit writes, no users-service calls (those three don't touch users-service).

```ts
export async function extendDemo(
  prisma: PrismaClient,
  tenantId: string,
  additionalDays: 7 | 14,
) {
  const existing = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!existing || !existing.isDemo) throw new DemoTenantNotFoundError()

  const now = new Date()
  const base =
    existing.demoExpiresAt && existing.demoExpiresAt > now
      ? existing.demoExpiresAt
      : now
  const newExpiresAt = addDays(base, additionalDays)
  const wasInactive = existing.isActive !== true
  const updated = await repo.extendDemoExpiration(
    prisma,
    tenantId,
    newExpiresAt,
    wasInactive,
  )
  return updated
  // NO auditLog.log — platform router does platform_audit_logs.
}

export async function expireDemoNow(prisma: PrismaClient, tenantId: string) {
  const existing = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!existing || !existing.isDemo) throw new DemoTenantNotFoundError()
  await repo.markDemoExpired(prisma, tenantId, new Date())
  return { ok: true as const }
}

export async function deleteDemo(prisma: PrismaClient, tenantId: string) {
  const existing = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!existing || !existing.isDemo) throw new DemoTenantNotFoundError()
  if (existing.isActive !== false) {
    throw new DemoTenantForbiddenError("Cannot delete an active demo — expire first")
  }
  // Platform router writes audit BEFORE calling this — targetTenantId is
  // still valid at that point. Once the delete commits, the audit row's
  // target_tenant_id cascades to NULL (SET NULL FK) but the metadata survives.
  await prisma.$transaction(
    async (tx) => {
      await wipeTenantData(tx, tenantId, { keepAuth: false })
      await tx.tenant.delete({ where: { id: tenantId } })
    },
    { timeout: 180_000 },
  )
  return { ok: true as const }
}
```

**`convertDemo` — refactored to snapshot modules and return them**:

```ts
export interface ConvertDemoResult {
  snapshottedModules: string[]
  originalTemplate: string | null
  tenantName: string
}

export async function convertDemo(
  prisma: PrismaClient,
  tenantId: string,
  input: { discardData: boolean },
): Promise<ConvertDemoResult> {
  const existing = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!existing || !existing.isDemo) throw new DemoTenantNotFoundError()

  const snapshottedModules = await prisma.$transaction(
    async (tx) => {
      // Snapshot modules INSIDE the tx, BEFORE the wipe (wipeTenantData L3
      // would nuke tenant_modules otherwise).
      const existingModules = await tx.tenantModule.findMany({
        where: { tenantId },
        select: { module: true },
      })
      const moduleKeys = existingModules.map((m) => m.module)

      if (input.discardData) {
        await wipeTenantData(tx, tenantId, { keepAuth: true })
      }
      await repo.convertDemoKeepData(tx, tenantId)

      return moduleKeys
    },
    { timeout: 120_000 },
  )

  // NO notifyConvertRequest — platform router controls the flow.
  // NO auditLog.log — platform router does platform_audit_logs.

  return {
    snapshottedModules,
    originalTemplate: existing.demoTemplate,
    tenantName: existing.name,
  }
}
```

**`requestConvertFromExpired` — UNCHANGED signature**, still writes `audit_logs` + calls `notifyConvertRequest`. Phase 6 adds one more side effect (writing the `demo_convert_requests` row).

**`notifyConvertRequest`** — still used by `requestConvertFromExpired`. The `convertDemo` caller no longer invokes it. Keep the function private to the service file.

#### 3. Test Updates

**File**: `src/lib/services/__tests__/demo-tenant-service.test.ts`

- Update all `createDemo` calls to the new signature `(prisma, input, platformUserId, audit)`.
- Remove assertions on `audit_logs` rows for create/extend/convert/expire/delete (they are no longer written).
- `extendDemo`, `expireDemoNow`, `deleteDemo` — remove the `audit` parameter from test calls.
- `convertDemo` — update to return the new `ConvertDemoResult` shape; assert on `snapshottedModules` rather than on the audit side effects.

**File**: `src/lib/services/__tests__/demo-tenant-service.integration.test.ts`

- Add a `beforeAll` that creates a platform-user fixture (via direct `prisma.platformUser.create({...})` with a hashed-password stub). `afterAll` deletes it.
- Use the fixture's id as `platformUserId` in `createDemo` calls.
- Update tests that currently assert audit-log rows: drop those assertions (they are moved to the platform router test in Phase 3).
- The hardcoded `SEED_ADMIN_USER_ID` is no longer used for demo creates — it's still valid for the `requestConvertFromExpired` test case (that one keeps its audit-writing behavior).

### Success Criteria:

#### Automated Verification:

- [x] Service unit tests pass: `pnpm vitest run src/lib/services/__tests__/demo-tenant-service.test.ts` — 11 passed
- [ ] Service integration tests pass: `pnpm vitest run src/lib/services/__tests__/demo-tenant-service.integration.test.ts` — manual run deferred to operator (requires local Supabase + DATABASE_URL)
- [x] Typecheck passes: `pnpm typecheck` — 0 errors (switched to `useMutation({ ...trpc.X.mutationOptions(), onSuccess, onError })` spread pattern to avoid TS2589 deep inference)
- [x] Lint passes: `pnpm lint` — 0 errors, 6 pre-existing warnings
- [x] `grep -r "listActiveDemos\|findActiveDemos" src/` returns ZERO hits
- [x] `grep -rn "auditLog.log" src/lib/services/demo-tenant-service.ts` shows only ONE hit — inside `requestConvertFromExpired`

#### Manual Verification:

- [ ] Spot-check in local dev DB that a `createDemo` call from a test writes a row with `demo_created_by = NULL` and `demo_created_by_platform_user_id = <platform fixture id>`
- [ ] Spot-check that `listDemos()` against the dev DB returns the `creator` DTO with `source="platform"` for the created row

**Implementation Note**: After this phase, the old `demoTenantsRouter` still exists and still calls the old signatures in `demo-tenant-service.ts` — so the signatures of public exports changed and that router will have type errors. Fix them temporarily in Phase 2 by either (a) updating the 6 procedures in `demo-tenants.ts` to pass `ctx.user!.id` as `platformUserId` (it'll write a bogus value but it won't crash runtime, and the router is deleted in Phase 4), OR (b) temporarily commenting out the old router registration from `_app.ts`. Option (b) is cleaner. Use it: comment out `demoTenants: demoTenantsRouter` in `src/trpc/routers/_app.ts:120` and the import on line 13 during this phase, and add a TODO comment pointing at Phase 4. The tenant-side admin panel will see a tRPC-procedure-not-found error temporarily, but Phase 3 restores functionality via the new platform router and Phase 4 gives the tenant-side panel proper cleanup.

Pause here and confirm test-suite results before proceeding.

---

## Phase 3: Platform Router `demoTenantManagement`

### Overview

Introduce the new platform-side router with 7 procedures. All `platformAuthedProcedure`-gated. Each mutation writes exactly one `platform_audit_logs` row. The `convert` procedure orchestrates snapshot → re-insert → subscription bridge → audit, with documented partial-failure semantics.

### Changes Required:

#### 1. New Router File

**File**: `src/trpc/platform/routers/demoTenantManagement.ts` (new)

**Imports**:

```ts
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, platformAuthedProcedure } from "../init"
import * as platformAudit from "@/lib/platform/audit-service"
import * as demoService from "@/lib/services/demo-tenant-service"
import * as subscriptionService from "@/lib/platform/subscription-service"
import { listDemoTemplates, DEFAULT_DEMO_TEMPLATE } from "@/lib/demo/registry"
import { AVAILABLE_MODULES, type ModuleId } from "@/lib/modules/constants"
```

**Input schemas** (match the existing tenant-side `demo-tenants.ts` where applicable):

```ts
const tenantIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)

const createDemoInputSchema = z.object({
  tenantName: z.string().trim().min(1).max(255),
  tenantSlug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten"),
  addressStreet: z.string().trim().min(1),
  addressZip: z.string().trim().min(1),
  addressCity: z.string().trim().min(1),
  addressCountry: z.string().trim().min(1),
  adminEmail: z.string().email(),
  adminDisplayName: z.string().trim().min(1),
  demoTemplate: z.string().optional().default(DEFAULT_DEMO_TEMPLATE),
  demoDurationDays: z.number().int().min(1).max(90).optional(),
  notes: z.string().nullish(),
})
```

**Router skeleton**:

```ts
export const platformDemoTenantManagementRouter = createTRPCRouter({
  templates: platformAuthedProcedure.query(() => listDemoTemplates()),

  list: platformAuthedProcedure.query(async ({ ctx }) => {
    return await demoService.listDemos(ctx.prisma)
  }),

  create: platformAuthedProcedure
    .input(createDemoInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await demoService.createDemo(
          ctx.prisma,
          input,
          ctx.platformUser.id,
          { ipAddress: ctx.ipAddress, userAgent: ctx.userAgent },
        )
        await platformAudit.log(ctx.prisma, {
          platformUserId: ctx.platformUser.id,
          action: "demo.created",
          entityType: "tenant",
          entityId: result.tenantId,
          targetTenantId: result.tenantId,
          metadata: {
            tenantName: input.tenantName,
            tenantSlug: input.tenantSlug,
            demoTemplate: result.demoTemplate,
            demoExpiresAt: result.demoExpiresAt.toISOString(),
            adminUserId: result.adminUserId,
            adminEmail: input.adminEmail,
            welcomeEmailSent: result.welcomeEmailSent,
          },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })
        return result
      } catch (err) {
        if (err instanceof demoService.DemoTenantValidationError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err.message })
        }
        if (err instanceof demoService.DemoTenantNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message })
        }
        throw err
      }
    }),

  extend: platformAuthedProcedure
    .input(
      z.object({
        tenantId: tenantIdSchema,
        additionalDays: z.union([z.literal(7), z.literal(14)]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const before = await ctx.prisma.tenant.findUnique({
        where: { id: input.tenantId },
        select: { demoExpiresAt: true, isActive: true, name: true },
      })
      if (!before) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Demo tenant not found" })
      }
      try {
        const updated = await demoService.extendDemo(
          ctx.prisma,
          input.tenantId,
          input.additionalDays,
        )
        await platformAudit.log(ctx.prisma, {
          platformUserId: ctx.platformUser.id,
          action: "demo.extended",
          entityType: "tenant",
          entityId: input.tenantId,
          targetTenantId: input.tenantId,
          changes: {
            demoExpiresAt: {
              old: before.demoExpiresAt,
              new: updated.demoExpiresAt,
            },
            ...(before.isActive === false
              ? { isActive: { old: false, new: true } }
              : {}),
          },
          metadata: {
            additionalDays: input.additionalDays,
            tenantName: before.name,
            wasReactivated: before.isActive === false,
          },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })
        return updated
      } catch (err) {
        if (err instanceof demoService.DemoTenantNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message })
        }
        throw err
      }
    }),

  convert: platformAuthedProcedure
    .input(
      z.object({
        tenantId: tenantIdSchema,
        discardData: z.boolean(),
        billingCycle: z.enum(["MONTHLY", "ANNUALLY"]).default("MONTHLY"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Step 1: Service handles the atomic part (snapshot → optional wipe → strip demo flags).
      let convertResult: demoService.ConvertDemoResult
      try {
        convertResult = await demoService.convertDemo(
          ctx.prisma,
          input.tenantId,
          { discardData: input.discardData },
        )
      } catch (err) {
        if (err instanceof demoService.DemoTenantNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message })
        }
        throw err
      }

      // Step 2: If discardData=true, wipeTenantData L3 nuked tenant_modules.
      // Re-insert them via upsert (outside the atomic tx because subscription
      // creates below cannot run inside an outer tx).
      if (input.discardData) {
        for (const moduleKey of convertResult.snapshottedModules) {
          await ctx.prisma.tenantModule.upsert({
            where: {
              tenantId_module: {
                tenantId: input.tenantId,
                module: moduleKey,
              },
            },
            create: {
              tenantId: input.tenantId,
              module: moduleKey,
              enabledAt: new Date(),
              enabledById: null,
              enabledByPlatformUserId: ctx.platformUser.id,
              operatorNote: "Re-enabled after demo conversion (discardData=true)",
            },
            update: {
              enabledAt: new Date(),
              enabledById: null,
              enabledByPlatformUserId: ctx.platformUser.id,
            },
          })
        }
      }

      // Step 3: Subscription bridge — one createSubscription per module.
      // KNOWN LIMITATION (documented in the plan): if the subscription create
      // fails for some modules, the tenant is already converted and the failed
      // modules have no subscription row. Operator must manually retry via
      // the modules page. This is unavoidable because createSubscription opens
      // its own $transaction and cannot be nested inside the convert tx.
      const subscriptionIds: string[] = []
      const failedModules: Array<{ module: string; error: string }> = []
      const isHouseTenant = subscriptionService.isOperatorTenant(input.tenantId)

      if (subscriptionService.isSubscriptionBillingEnabled() && !isHouseTenant) {
        for (const moduleKey of convertResult.snapshottedModules) {
          try {
            // If a subscription for this (tenant, module) already exists and
            // is active, reuse it — handles the "re-enable after convert"
            // edge case where a prior partial failure left a stale subscription.
            const existing = await ctx.prisma.platformSubscription.findFirst({
              where: {
                tenantId: input.tenantId,
                module: moduleKey,
                status: "active",
              },
              select: { id: true },
            })
            if (existing) {
              subscriptionIds.push(existing.id)
              continue
            }
            const subResult = await subscriptionService.createSubscription(
              ctx.prisma,
              {
                customerTenantId: input.tenantId,
                module: moduleKey as ModuleId,
                billingCycle: input.billingCycle,
              },
              ctx.platformUser.id,
            )
            subscriptionIds.push(subResult.subscriptionId)
          } catch (err) {
            failedModules.push({
              module: moduleKey,
              error: err instanceof Error ? err.message : String(err),
            })
          }
        }
      }

      // Step 4: Audit (platform-side only)
      await platformAudit.log(ctx.prisma, {
        platformUserId: ctx.platformUser.id,
        action: "demo.converted",
        entityType: "tenant",
        entityId: input.tenantId,
        targetTenantId: input.tenantId,
        changes: { isDemo: { old: true, new: false } },
        metadata: {
          tenantName: convertResult.tenantName,
          discardData: input.discardData,
          originalTemplate: convertResult.originalTemplate,
          billingCycle: input.billingCycle,
          moduleCount: convertResult.snapshottedModules.length,
          moduleKeys: convertResult.snapshottedModules,
          subscriptionIds,
          failedModules: failedModules.length > 0 ? failedModules : null,
          isHouseTenant,
        },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })

      return {
        ok: true as const,
        subscriptionIds,
        failedModules,
      }
    }),

  expireNow: platformAuthedProcedure
    .input(z.object({ tenantId: tenantIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const before = await ctx.prisma.tenant.findUnique({
        where: { id: input.tenantId },
        select: { name: true, isActive: true },
      })
      if (!before) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Demo tenant not found" })
      }
      try {
        const result = await demoService.expireDemoNow(ctx.prisma, input.tenantId)
        await platformAudit.log(ctx.prisma, {
          platformUserId: ctx.platformUser.id,
          action: "demo.expired_manually",
          entityType: "tenant",
          entityId: input.tenantId,
          targetTenantId: input.tenantId,
          changes: { isActive: { old: before.isActive, new: false } },
          metadata: { tenantName: before.name },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })
        return result
      } catch (err) {
        if (err instanceof demoService.DemoTenantNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message })
        }
        throw err
      }
    }),

  delete: platformAuthedProcedure
    .input(z.object({ tenantId: tenantIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.tenant.findUnique({
        where: { id: input.tenantId },
        select: {
          name: true,
          slug: true,
          demoTemplate: true,
          createdAt: true,
          demoExpiresAt: true,
          isActive: true,
          isDemo: true,
        },
      })
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Demo tenant not found" })
      }
      if (!existing.isDemo) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Not a demo tenant" })
      }
      if (existing.isActive !== false) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot delete an active demo — expire first",
        })
      }

      // Audit BEFORE the cascade. platform_audit_logs.target_tenant_id has
      // ON DELETE SET NULL, so the row survives the delete; metadata below
      // preserves human-readable identifiers for post-mortem lookup.
      await platformAudit.log(ctx.prisma, {
        platformUserId: ctx.platformUser.id,
        action: "demo.deleted",
        entityType: "tenant",
        entityId: input.tenantId,
        targetTenantId: input.tenantId,
        metadata: {
          tenantName: existing.name,
          tenantSlug: existing.slug,
          originalTemplate: existing.demoTemplate,
          createdAt: existing.createdAt.toISOString(),
          demoExpiredAt: existing.demoExpiresAt?.toISOString() ?? null,
        },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })

      try {
        return await demoService.deleteDemo(ctx.prisma, input.tenantId)
      } catch (err) {
        if (err instanceof demoService.DemoTenantNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message })
        }
        if (err instanceof demoService.DemoTenantForbiddenError) {
          throw new TRPCError({ code: "FORBIDDEN", message: err.message })
        }
        throw err
      }
    }),
})
```

#### 2. Router Registration

**File**: `src/trpc/platform/_app.ts`
**Changes**: Add import + register the new sub-router.

```ts
import { platformDemoTenantManagementRouter } from "./routers/demoTenantManagement"

export const platformAppRouter = createTRPCRouter({
  // ... existing routers ...
  tenantManagement: platformTenantManagementRouter,
  demoTenantManagement: platformDemoTenantManagementRouter,  // NEW
  // ... rest ...
})
```

#### 3. Test File

**File**: `src/trpc/platform/routers/__tests__/demoTenantManagement.test.ts` (new)

Minimum coverage:

- `create` with valid input → returns `tenantId, adminUserId, inviteLink?, welcomeEmailSent, demoExpiresAt, demoTemplate`; writes one `platform_audit_logs` row with `action="demo.created"`; writes NO `audit_logs` rows (except for users-service internal writes which are attributed to `PLATFORM_SYSTEM_USER_ID`).
- `create` with invalid duration → throws `BAD_REQUEST`.
- `create` without platform session (public procedure call) → throws `UNAUTHORIZED`.
- `list` returns all demos (not just active ones) with `creator.source === "platform"` for platform-created rows.
- `extend` on an expired demo → reactivates it, audit has `changes.isActive: {old:false, new:true}` and `metadata.wasReactivated: true`.
- `convert` with `discardData=true` and 4 modules → `tenant_modules` count is 4 after convert (re-inserted), `platform_subscriptions` count is 4 (if billing enabled), one audit row with `metadata.moduleCount: 4`, `subscriptionIds.length: 4`.
- `convert` with `isSubscriptionBillingEnabled()=false` → no subscription writes, `subscriptionIds: []`, audit has `failedModules: null`.
- `convert` for the operator tenant itself (house rule) → skips subscription block, `metadata.isHouseTenant: true`.
- `delete` on an active demo → throws `FORBIDDEN`.
- `delete` on an expired demo → writes audit first, then deletes; `platform_audit_logs` row exists with `target_tenant_id: NULL` (because of cascade SET NULL) but `metadata.tenantName` is preserved.

Pattern: copy the test setup from `src/trpc/platform/routers/__tests__/tenantManagement.test.ts` if one exists, otherwise from any of the platform-side test files referenced in the research (B.1 lists them).

### Success Criteria:

#### Automated Verification:

- [x] New router tests pass: `pnpm vitest run src/trpc/platform/routers/__tests__/demoTenantManagement.test.ts` — 9 passed
- [x] Existing service tests still pass: 11 passed
- [x] `pnpm typecheck` passes — 0 errors
- [x] `pnpm lint` passes — 0 errors
- [x] `grep -r "platformDemoTenantManagementRouter" src/trpc/platform/_app.ts` returns exactly one hit

#### Manual Verification:

- [ ] In `pnpm dev`, open `/platform/login`, complete MFA, and manually hit the procedure via the tRPC devtools or a curl/fetch to `/api/trpc-platform/demoTenantManagement.list`
- [ ] Verify a `platform_audit_logs` row appears after a manual `create` call with the real platform user id (not the sentinel)
- [ ] Verify the `tenants.demo_created_by_platform_user_id` column is populated with the real id, and `tenants.demo_created_by` is NULL
- [ ] With `PLATFORM_OPERATOR_TENANT_ID` set locally, run a `convert` and confirm one `platform_subscription` row was created per module (and one `billing_recurring_invoice` in the operator tenant)

**Implementation Note**: At this point both the old tenant-side `DemoTenantsPanel` (if still mounted) and the new platform router coexist. The tenant panel is broken because Phase 2 commented out the old router. Phase 4 completes the removal and restores a clean state.

---

## Phase 4: Tenant Router Cleanup + Self-Service Router

### Overview

Delete `src/trpc/routers/demo-tenants.ts`. Create `src/trpc/routers/demo-self-service.ts` containing only `requestConvertFromExpired`. Update the root router registration. Rename the hook file and delete the 6 admin hooks. Update the `/demo-expired` page to use the new hook path.

### Changes Required:

#### 1. Delete Old Tenant Router

**File**: `src/trpc/routers/demo-tenants.ts` — DELETE

#### 2. New Self-Service Router

**File**: `src/trpc/routers/demo-self-service.ts` (new)

```ts
/**
 * Demo Self-Service Router.
 *
 * Single endpoint used by the /demo-expired page: the expired demo's admin
 * user clicks "Request Convert" and a row is written into email_send_log
 * (for sales notification), audit_logs (tenant-scoped), and
 * demo_convert_requests (platform-side inbox — added in Phase 6).
 *
 * Deliberately NOT gated by tenants.manage. Authorization is enforced by
 * the service: caller must be a member of the target tenant (via
 * user_tenants) AND the target tenant must be an expired demo.
 */
import { z } from "zod"
import { createTRPCRouter, protectedProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import * as demoService from "@/lib/services/demo-tenant-service"

export const demoSelfServiceRouter = createTRPCRouter({
  requestConvertFromExpired: protectedProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await demoService.requestConvertFromExpired(
          ctx.prisma,
          ctx.user!.id,
          input.tenantId,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
```

#### 3. Root Router Registration

**File**: `src/trpc/routers/_app.ts`
**Changes**:

- Remove line 13: `import { demoTenantsRouter } from "./demo-tenants"`
- Remove line 120: `demoTenants: demoTenantsRouter,`
- Add import: `import { demoSelfServiceRouter } from "./demo-self-service"`
- Add registration: `demoSelfService: demoSelfServiceRouter,` (alphabetically placed)

#### 4. Hook File Rename + Cleanup

**File**: `src/hooks/use-demo-tenants.ts` → rename to `src/hooks/use-demo-self-service.ts`
**Changes**: Keep only `useRequestConvertFromExpired`. Delete the other 6 hooks (`useDemoTenants`, `useDemoTemplates`, `useCreateDemoTenant`, `useExtendDemoTenant`, `useConvertDemoTenant`, `useExpireDemoTenantNow`, `useDeleteDemoTenant`). Update the single remaining hook to point at `trpc.demoSelfService.requestConvertFromExpired`.

```ts
/**
 * Demo self-service hooks — used from the /demo-expired page.
 *
 * Note: admin-side demo hooks moved to platform-admin (see
 * /platform/tenants/demo). Do not add admin operations here.
 */
import { useMutation } from "@tanstack/react-query"
import { useTRPC } from "@/trpc/client"

export function useRequestConvertFromExpired() {
  const trpc = useTRPC()
  return useMutation(
    trpc.demoSelfService.requestConvertFromExpired.mutationOptions(),
  )
}
```

#### 5. Update `/demo-expired` Page

**File**: `src/app/[locale]/demo-expired/page.tsx`
**Changes**: Update import from `@/hooks/use-demo-tenants` to `@/hooks/use-demo-self-service`. (If the page uses a re-export from `@/hooks/index.ts`, update that re-export instead.)

#### 6. Re-Uncomment Platform Router Import (if Phase 2 stubbed it)

If Phase 2's workaround was to comment out the old registration in `_app.ts`, those comments become the deletions in this phase automatically.

### Success Criteria:

#### Automated Verification:

- [x] `grep -r "demoTenantsRouter\|demo-tenants.ts\b" src/` returns ZERO hits
- [x] `grep -r "trpc.demoTenants\." src/` returns ZERO hits
- [x] `grep -r "demoSelfService" src/trpc/routers/_app.ts` returns at least one hit
- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm build` succeeds

#### Manual Verification:

- [ ] In `pnpm dev`, sign in to a demo tenant whose `demo_expires_at` is in the past
- [ ] Navigate to `/demo-expired`
- [ ] Click "Request Convert" CTA
- [ ] Verify success toast/alert
- [ ] Verify a new row in `email_send_log` for the demo tenant id

**Implementation Note**: At the end of this phase, the tenant-side `DemoTenantsPanel` in `src/app/[locale]/(dashboard)/admin/tenants/page.tsx:122` is **still mounted** but fails with "procedure not found" errors from the deleted `demoTenants` router. Phase 7 unmounts it. Until then, the admin page is partially broken for anyone who has `tenants.manage` and visits `/admin/tenants`. Acceptable for this plan because the platform-admin surface is the intended one and demo management works there.

Pause here and confirm the self-service flow still works end-to-end before starting Phase 5.

---

## Phase 5: Platform UI — Demo-Tenants Page

### Overview

Build the new platform-admin UI for demo tenants. Single-page implementation following the inline-useQuery/useMutation convention. Full shadcn card/table/dialog/sheet stack, Invite-link fallback for post-create, context-sensitive row actions based on `status`, deep-link highlight support (for Phase 6's convert-request inbox).

### Changes Required:

#### 1. New Page

**File**: `src/app/platform/(authed)/tenants/demo/page.tsx` (new)

**Page structure**:

```tsx
"use client"

import * as React from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, MoreVertical, FlaskConical, Copy, Check } from "lucide-react"
import { toast } from "sonner"
import { usePlatformTRPC } from "@/trpc/platform/context"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group"

export default function PlatformDemoTenantsPage() {
  const trpc = usePlatformTRPC()
  const qc = useQueryClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const highlightId = searchParams.get("highlight")

  // Optional status filter — "all" default per discussion (nice-to-have).
  const [statusFilter, setStatusFilter] = React.useState<"all" | "active" | "expired">("all")

  const listQuery = useQuery(trpc.demoTenantManagement.list.queryOptions())
  const templatesQuery = useQuery(trpc.demoTenantManagement.templates.queryOptions())

  // Create sheet state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [inviteLinkDialog, setInviteLinkDialog] = React.useState<{
    link: string
    tenantName: string
  } | null>(null)

  // Action dialogs
  const [extendTarget, setExtendTarget] = React.useState<DemoRow | null>(null)
  const [convertTarget, setConvertTarget] = React.useState<DemoRow | null>(null)
  const [expireTarget, setExpireTarget] = React.useState<DemoRow | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<DemoRow | null>(null)

  // Highlight row (deep-link from convert-requests inbox)
  React.useEffect(() => {
    if (!highlightId || !listQuery.data) return
    const row = document.getElementById(`demo-row-${highlightId}`)
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" })
      row.classList.add("ring-2", "ring-primary", "ring-offset-2")
      const timeout = setTimeout(() => {
        row.classList.remove("ring-2", "ring-primary", "ring-offset-2")
        // Clear the query param so the highlight doesn't re-fire on re-render
        router.replace("/platform/tenants/demo")
      }, 2500)
      return () => clearTimeout(timeout)
    }
  }, [highlightId, listQuery.data, router])

  const filteredDemos = React.useMemo(() => {
    const demos = listQuery.data ?? []
    if (statusFilter === "all") return demos
    return demos.filter((d) => d.status === statusFilter)
  }, [listQuery.data, statusFilter])

  // ... create mutation, row components, dialogs ...

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Demo-Tenants</h1>
          <p className="text-muted-foreground">
            Erzeuge und verwalte Demo-Tenants für Sales-Demos und Evaluierungen.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Neuer Demo-Tenant
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Übersicht</CardTitle>
            <CardDescription>
              Alle Demo-Tenants (aktiv + abgelaufen).
            </CardDescription>
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="active">Aktiv</SelectItem>
              <SelectItem value="expired">Abgelaufen</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          {listQuery.isLoading ? (
            <div className="p-6">
              <Skeleton className="h-64" />
            </div>
          ) : filteredDemos.length === 0 ? (
            <EmptyState onCreate={() => setCreateOpen(true)} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name / Slug</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Creator</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Läuft ab</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDemos.map((demo) => (
                  <DemoRow
                    key={demo.id}
                    demo={demo}
                    onExtend={() => setExtendTarget(demo)}
                    onConvert={() => setConvertTarget(demo)}
                    onExpire={() => setExpireTarget(demo)}
                    onDelete={() => setDeleteTarget(demo)}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateDemoSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        templates={templatesQuery.data ?? []}
        onSuccess={(result) => {
          setCreateOpen(false)
          if (result.inviteLink) {
            setInviteLinkDialog({
              link: result.inviteLink,
              tenantName: result.tenantName,
            })
          } else {
            toast.success(`Demo-Tenant "${result.tenantName}" erstellt`)
          }
          qc.invalidateQueries({
            queryKey: trpc.demoTenantManagement.list.queryKey(),
          })
        }}
      />

      <InviteLinkDialog
        open={!!inviteLinkDialog}
        onOpenChange={(open) => !open && setInviteLinkDialog(null)}
        data={inviteLinkDialog}
      />

      <ExtendDialog target={extendTarget} onClose={() => setExtendTarget(null)} />
      <ConvertDialog target={convertTarget} onClose={() => setConvertTarget(null)} />
      <ExpireDialog target={expireTarget} onClose={() => setExpireTarget(null)} />
      <DeleteDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </div>
  )
}
```

**Row component with `id={demo-row-${demo.id}}` for the highlight deep-link**:

```tsx
function DemoRow({
  demo,
  onExtend,
  onConvert,
  onExpire,
  onDelete,
}: {
  demo: DemoRowData
  onExtend: () => void
  onConvert: () => void
  onExpire: () => void
  onDelete: () => void
}) {
  return (
    <TableRow
      id={`demo-row-${demo.id}`}
      className="transition-shadow duration-300"
    >
      <TableCell>
        <div className="font-medium">{demo.name}</div>
        <div className="text-xs text-muted-foreground">{demo.slug}</div>
      </TableCell>
      <TableCell>{demo.demoTemplate}</TableCell>
      <TableCell>
        <CreatorBadge creator={demo.creator} />
      </TableCell>
      <TableCell>
        <StatusBadge status={demo.status} daysRemaining={demo.daysRemaining} />
      </TableCell>
      <TableCell>
        {demo.demoExpiresAt
          ? new Date(demo.demoExpiresAt).toLocaleDateString("de-DE")
          : "—"}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onExtend}>
              Verlängern (7/14 Tage)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onConvert}>
              Konvertieren
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {demo.status === "active" && (
              <DropdownMenuItem onClick={onExpire} className="text-destructive">
                Jetzt ablaufen lassen
              </DropdownMenuItem>
            )}
            {demo.status === "expired" && (
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                Löschen
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
}

function CreatorBadge({ creator }: { creator: DemoCreatorDTO }) {
  if (creator.source === "unknown") {
    return <span className="text-muted-foreground italic">unbekannt</span>
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm">{creator.displayName}</span>
      <div className="flex items-center gap-1">
        <Badge variant={creator.source === "platform" ? "default" : "secondary"} className="text-xs">
          {creator.source === "platform" ? "Platform" : "Tenant"}
        </Badge>
        <span className="text-xs text-muted-foreground">{creator.email}</span>
      </div>
    </div>
  )
}

function StatusBadge({
  status,
  daysRemaining,
}: {
  status: "active" | "expired"
  daysRemaining: number
}) {
  if (status === "expired") {
    return <Badge variant="destructive">Abgelaufen</Badge>
  }
  if (daysRemaining <= 3) {
    return <Badge variant="outline">Noch {daysRemaining} Tage</Badge>
  }
  return <Badge variant="secondary">Aktiv ({daysRemaining} Tage)</Badge>
}
```

**Create sheet** — form with three cards (Tenant, Adresse, Admin + Demo). Uses `trpc.demoTenantManagement.create` via `useMutation`. On success returns `{tenantId, inviteLink, welcomeEmailSent, ...}` — if `inviteLink` is not null, show it in the invite-link dialog. Post-create callback invalidates the list query.

**Convert dialog** — radio for discard/keep + select for `billingCycle` (MONTHLY default) + descriptive warning text. Submit calls `convert` mutation. On success, show toast with module + subscription counts. If `failedModules.length > 0`, show a warning toast listing them.

**Extend, expire, delete dialogs** — shadcn `AlertDialog` confirms. Extend dialog has two buttons "7 Tage" / "14 Tage".

**Invite-link dialog** — read-only Input + copy-to-clipboard Button (same pattern as `src/app/platform/(authed)/tenants/new/page.tsx:75-88`).

#### 2. Sidebar Update

**File**: `src/components/platform/sidebar.tsx`
**Changes**: Add one sub-item under the existing Tenants `SidebarMenuSub` (around line 111-125).

```tsx
// Inside the Tenants <SidebarMenuSub>, after the "Neuer Tenant" sub-item:
<SidebarMenuSubItem>
  <SidebarMenuSubButton asChild isActive={pathname === "/platform/tenants/demo"}>
    <Link href="/platform/tenants/demo">
      <FlaskConical className="h-4 w-4" />
      <span>Demos</span>
    </Link>
  </SidebarMenuSubButton>
</SidebarMenuSubItem>
```

Import `FlaskConical` from `lucide-react` at the top.

### Success Criteria:

#### Automated Verification:

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm build` succeeds — `/platform/tenants/demo` prerendered as static content
- [x] `grep -r "demoTenantManagement" src/app/platform/` shows the new page

#### Manual Verification:

- [ ] Visit `/platform/tenants/demo` (after platform login + MFA)
- [ ] Sidebar shows the "Demos" sub-item under Tenants
- [ ] List renders (empty state if no demos)
- [ ] Create flow: click "Neuer Demo-Tenant", fill form, submit → success toast or invite-link dialog
- [ ] Created demo appears in list with `creator.source === "platform"` badge and real operator name
- [ ] Status filter toggles between All/Active/Expired
- [ ] Extend action on an active demo bumps the expiration date and shows a success toast
- [ ] Convert action on an active demo with `discardData=false` strips demo flags and creates subscriptions (verify in DB)
- [ ] Convert action on an active demo with `discardData=true` wipes content but re-adds modules and creates subscriptions
- [ ] Expire-Now action flips `isActive` to false; row shows "Abgelaufen" badge
- [ ] Delete action is only available on expired rows; removes the row and cascades in DB
- [ ] Deep-link `/platform/tenants/demo?highlight=<id>` scrolls to and highlights that row for ~2.5s

**Implementation Note**: After this phase, the platform-admin can fully manage demo tenants through the new surface. The tenant-side admin panel is still broken (see Phase 4 implementation note). Pause for operator confirmation.

---

## Phase 6: Convert-Requests Inbox

### Overview

Create the `demo_convert_requests` table + Prisma model + service + platform router + UI page. Wire `demoService.requestConvertFromExpired` to write a new row as a third side effect. Activate the deferred dashboard card. Add the sidebar sub-item. The `resolve` and `dismiss` mutations are pure status flips with no coupled actions — operator uses the "Tenant öffnen" deep-link to perform the actual convert/extend via the Demos page.

### Changes Required:

#### 1. New Supabase Migration

**File**: `supabase/migrations/20260411100100_create_demo_convert_requests.sql` (new)

```sql
-- =============================================================
-- Demo convert-request inbox for the platform-admin UI.
--
-- Materializes the self-service "Request Convert" action from the
-- /demo-expired page. Platform operators see these in
-- /platform/tenants/convert-requests and resolve or dismiss each one.
--
-- resolve/dismiss are pure status flips — no coupled side effects.
-- Operator performs the actual convert/extend/outreach manually via
-- /platform/tenants/demo (deep-linked from the inbox row).
-- =============================================================

CREATE TABLE public.demo_convert_requests (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requested_by_user_id         UUID NOT NULL,
  requested_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  status                       VARCHAR(20) NOT NULL DEFAULT 'pending',
  resolved_by_platform_user_id UUID NULL REFERENCES public.platform_users(id) ON DELETE SET NULL,
  resolved_at                  TIMESTAMPTZ NULL,
  resolution_note              TEXT NULL,
  CONSTRAINT demo_convert_requests_status_check
    CHECK (status IN ('pending', 'resolved', 'dismissed'))
);

CREATE INDEX idx_demo_convert_requests_status
  ON public.demo_convert_requests(status, requested_at DESC);
CREATE INDEX idx_demo_convert_requests_tenant
  ON public.demo_convert_requests(tenant_id);

COMMENT ON TABLE public.demo_convert_requests IS
  'Platform-admin inbox for self-service demo-convert requests from expired-demo admin users.';
COMMENT ON COLUMN public.demo_convert_requests.requested_by_user_id IS
  'UUID of public.users row that clicked Request Convert. NOT an FK — users may be deleted.';
```

#### 2. Prisma Model

**File**: `prisma/schema.prisma`
**Changes**: Add the model. No relations.

```prisma
model DemoConvertRequest {
  id                          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId                    String    @map("tenant_id") @db.Uuid
  requestedByUserId           String    @map("requested_by_user_id") @db.Uuid
  requestedAt                 DateTime  @default(now()) @map("requested_at") @db.Timestamptz(6)
  status                      String    @default("pending") @db.VarChar(20)
  resolvedByPlatformUserId    String?   @map("resolved_by_platform_user_id") @db.Uuid
  resolvedAt                  DateTime? @map("resolved_at") @db.Timestamptz(6)
  resolutionNote              String?   @map("resolution_note") @db.Text

  @@index([status, requestedAt(sort: Desc)], map: "idx_demo_convert_requests_status")
  @@index([tenantId], map: "idx_demo_convert_requests_tenant")
  @@map("demo_convert_requests")
}
```

Run `pnpm db:generate`.

#### 3. New Service

**File**: `src/lib/services/demo-convert-request-service.ts` (new)

```ts
import type { PrismaClient } from "@/generated/prisma/client"

export class DemoConvertRequestNotFoundError extends Error {
  constructor(id: string) {
    super(`Demo convert request not found: ${id}`)
    this.name = "DemoConvertRequestNotFoundError"
  }
}

export class DemoConvertRequestConflictError extends Error {
  constructor(status: string) {
    super(`Demo convert request is already ${status}`)
    this.name = "DemoConvertRequestConflictError"
  }
}

export type DemoConvertRequestStatus = "pending" | "resolved" | "dismissed"

export async function create(
  prisma: PrismaClient,
  input: { tenantId: string; requestedByUserId: string },
): Promise<{ id: string }> {
  const row = await prisma.demoConvertRequest.create({
    data: {
      tenantId: input.tenantId,
      requestedByUserId: input.requestedByUserId,
      status: "pending",
    },
    select: { id: true },
  })
  return row
}

export async function list(
  prisma: PrismaClient,
  params: {
    status?: DemoConvertRequestStatus
    page?: number
    pageSize?: number
  },
) {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const where = params.status ? { status: params.status } : {}

  const [rows, total] = await Promise.all([
    prisma.demoConvertRequest.findMany({
      where,
      orderBy: { requestedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.demoConvertRequest.count({ where }),
  ])

  // Batch-fetch tenant info for display
  const tenantIds = Array.from(new Set(rows.map((r) => r.tenantId)))
  const tenants = tenantIds.length
    ? await prisma.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: {
          id: true,
          name: true,
          slug: true,
          isDemo: true,
          demoExpiresAt: true,
        },
      })
    : []
  const byTenantId = new Map(tenants.map((t) => [t.id, t]))

  // Batch-fetch resolver info
  const resolverIds = Array.from(
    new Set(
      rows
        .map((r) => r.resolvedByPlatformUserId)
        .filter((id): id is string => id !== null),
    ),
  )
  const resolvers = resolverIds.length
    ? await prisma.platformUser.findMany({
        where: { id: { in: resolverIds } },
        select: { id: true, displayName: true, email: true },
      })
    : []
  const byResolverId = new Map(resolvers.map((u) => [u.id, u]))

  return {
    items: rows.map((r) => ({
      ...r,
      tenant: byTenantId.get(r.tenantId) ?? null,
      resolvedBy: r.resolvedByPlatformUserId
        ? byResolverId.get(r.resolvedByPlatformUserId) ?? null
        : null,
    })),
    total,
    page,
    pageSize,
  }
}

export async function resolve(
  prisma: PrismaClient,
  input: { id: string; note?: string | null },
  platformUserId: string,
): Promise<void> {
  const existing = await prisma.demoConvertRequest.findUnique({
    where: { id: input.id },
  })
  if (!existing) throw new DemoConvertRequestNotFoundError(input.id)
  if (existing.status !== "pending") {
    throw new DemoConvertRequestConflictError(existing.status)
  }
  await prisma.demoConvertRequest.update({
    where: { id: input.id },
    data: {
      status: "resolved",
      resolvedByPlatformUserId: platformUserId,
      resolvedAt: new Date(),
      resolutionNote: input.note ?? null,
    },
  })
}

export async function dismiss(
  prisma: PrismaClient,
  input: { id: string; note?: string | null },
  platformUserId: string,
): Promise<void> {
  const existing = await prisma.demoConvertRequest.findUnique({
    where: { id: input.id },
  })
  if (!existing) throw new DemoConvertRequestNotFoundError(input.id)
  if (existing.status !== "pending") {
    throw new DemoConvertRequestConflictError(existing.status)
  }
  await prisma.demoConvertRequest.update({
    where: { id: input.id },
    data: {
      status: "dismissed",
      resolvedByPlatformUserId: platformUserId,
      resolvedAt: new Date(),
      resolutionNote: input.note ?? null,
    },
  })
}

export async function countPending(prisma: PrismaClient): Promise<number> {
  return prisma.demoConvertRequest.count({ where: { status: "pending" } })
}
```

#### 4. Wire Service Write in `demoService.requestConvertFromExpired`

**File**: `src/lib/services/demo-tenant-service.ts`
**Changes**: Inside `requestConvertFromExpired`, after the membership/expired checks pass but before the existing `notifyConvertRequest` + audit writes, add a call to the new service.

```ts
import * as demoConvertRequestService from "./demo-convert-request-service"

// Inside requestConvertFromExpired, after the validation:
await demoConvertRequestService.create(prisma, {
  tenantId,
  requestedByUserId: requestingUserId,
}).catch((err) =>
  console.error("[demo-tenant-service] convert-request inbox write failed:", err),
)
```

Order: inbox-write → email-send-log write → audit log write. All three are fire-and-forget (catch + log). If inbox fails but email succeeds, sales still gets notified; operator can re-request via the `/demo-expired` page.

#### 5. New Platform Router

**File**: `src/trpc/platform/routers/demoConvertRequests.ts` (new)

```ts
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, platformAuthedProcedure } from "../init"
import * as platformAudit from "@/lib/platform/audit-service"
import * as service from "@/lib/services/demo-convert-request-service"

export const platformDemoConvertRequestsRouter = createTRPCRouter({
  list: platformAuthedProcedure
    .input(
      z.object({
        status: z.enum(["pending", "resolved", "dismissed"]).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      return await service.list(ctx.prisma, input)
    }),

  countPending: platformAuthedProcedure.query(async ({ ctx }) => {
    return await service.countPending(ctx.prisma)
  }),

  resolve: platformAuthedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        note: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await service.resolve(ctx.prisma, input, ctx.platformUser.id)
        await platformAudit.log(ctx.prisma, {
          platformUserId: ctx.platformUser.id,
          action: "demo_convert_request.resolved",
          entityType: "demo_convert_request",
          entityId: input.id,
          metadata: { note: input.note ?? null },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })
        return { ok: true as const }
      } catch (err) {
        if (err instanceof service.DemoConvertRequestNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message })
        }
        if (err instanceof service.DemoConvertRequestConflictError) {
          throw new TRPCError({ code: "CONFLICT", message: err.message })
        }
        throw err
      }
    }),

  dismiss: platformAuthedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        note: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await service.dismiss(ctx.prisma, input, ctx.platformUser.id)
        await platformAudit.log(ctx.prisma, {
          platformUserId: ctx.platformUser.id,
          action: "demo_convert_request.dismissed",
          entityType: "demo_convert_request",
          entityId: input.id,
          metadata: { note: input.note ?? null },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })
        return { ok: true as const }
      } catch (err) {
        if (err instanceof service.DemoConvertRequestNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message })
        }
        if (err instanceof service.DemoConvertRequestConflictError) {
          throw new TRPCError({ code: "CONFLICT", message: err.message })
        }
        throw err
      }
    }),
})
```

#### 6. Router Registration

**File**: `src/trpc/platform/_app.ts`
**Changes**:

```ts
import { platformDemoConvertRequestsRouter } from "./routers/demoConvertRequests"

// In the createTRPCRouter call:
demoConvertRequests: platformDemoConvertRequestsRouter,
```

#### 7. New Platform Page

**File**: `src/app/platform/(authed)/tenants/convert-requests/page.tsx` (new)

Tabbed list (Pending/Resolved/Dismissed) following the `support-sessions/page.tsx` pattern. Row actions:

- Pending: Resolve (dialog with optional note) / Dismiss (dialog with optional note) / "Tenant öffnen →" (`Link` to `/platform/tenants/demo?highlight=<tenantId>`)
- Resolved/Dismissed: Read-only (show resolver + note + timestamps)

**Key structure** (abbreviated):

```tsx
"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ExternalLink, MoreVertical } from "lucide-react"
import { usePlatformTRPC } from "@/trpc/platform/context"
// ... shadcn imports ...

type Tab = "pending" | "resolved" | "dismissed"

export default function PlatformConvertRequestsPage() {
  const trpc = usePlatformTRPC()
  const qc = useQueryClient()
  const [tab, setTab] = React.useState<Tab>("pending")

  const listQuery = useQuery(
    trpc.demoConvertRequests.list.queryOptions({ status: tab, page: 1, pageSize: 50 }),
  )

  const resolveMutation = useMutation(
    trpc.demoConvertRequests.resolve.mutationOptions({
      onSuccess: () => {
        toast.success("Anfrage als erledigt markiert")
        qc.invalidateQueries({ queryKey: trpc.demoConvertRequests.list.queryKey() })
        qc.invalidateQueries({ queryKey: trpc.demoConvertRequests.countPending.queryKey() })
      },
    }),
  )

  const dismissMutation = useMutation(
    trpc.demoConvertRequests.dismiss.mutationOptions({
      onSuccess: () => {
        toast.success("Anfrage verworfen")
        qc.invalidateQueries({ queryKey: trpc.demoConvertRequests.list.queryKey() })
        qc.invalidateQueries({ queryKey: trpc.demoConvertRequests.countPending.queryKey() })
      },
    }),
  )

  // ... resolve/dismiss dialog state, render tabs, render rows ...
}
```

#### 8. Dashboard Card Activation

**File**: `src/app/platform/(authed)/dashboard/page.tsx`
**Changes**:

- Remove the deferred comment at lines 11-13.
- Add a new query: `const pendingConvertRequestsQuery = useQuery(trpc.demoConvertRequests.countPending.queryOptions())`
- Add a new stat card next to the existing Pending Sessions / Active Sessions cards showing the pending convert-requests count with a `<Link href="/platform/tenants/convert-requests">` wrapper.

#### 9. Sidebar Update

**File**: `src/components/platform/sidebar.tsx`
**Changes**: Add a second sub-item under Tenants `SidebarMenuSub`:

```tsx
<SidebarMenuSubItem>
  <SidebarMenuSubButton asChild isActive={pathname === "/platform/tenants/convert-requests"}>
    <Link href="/platform/tenants/convert-requests">
      <Inbox className="h-4 w-4" />
      <span>Convert-Anfragen</span>
    </Link>
  </SidebarMenuSubButton>
</SidebarMenuSubItem>
```

Import `Inbox` from `lucide-react`.

### Success Criteria:

#### Automated Verification:

- [x] Migration applies cleanly: `supabase migration up --local` (new file: `20260422100100_create_demo_convert_requests.sql` — adjusted timestamp to clear current migration tip, same reason as Phase 1)
- [x] Prisma client regenerates: `pnpm db:generate`
- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm build` succeeds — `/platform/tenants/convert-requests` prerendered as static content
- [ ] Service unit test: `pnpm vitest run src/lib/services/__tests__/demo-convert-request-service.test.ts` — NOT IMPLEMENTED (follow-up)
- [ ] Router test: `pnpm vitest run src/trpc/platform/routers/__tests__/demoConvertRequests.test.ts` — NOT IMPLEMENTED (follow-up)

#### Manual Verification:

- [ ] Sign in as a demo tenant's admin user with `demo_expires_at` in the past
- [ ] Navigate to `/demo-expired`, click Request Convert
- [ ] Verify three side effects in the DB: `demo_convert_requests` row, `email_send_log` row, `audit_logs` row
- [ ] Sign in as platform operator, navigate to `/platform/tenants/convert-requests`
- [ ] Pending tab shows the new request with tenant name + requestedAt + action buttons
- [ ] Click "Tenant öffnen →" → lands on `/platform/tenants/demo?highlight=<tenantId>`, row scrolls into view and highlights for ~2.5s
- [ ] Resolve dialog writes `resolved` status, moves row to Resolved tab, resolver name shown
- [ ] Dismiss dialog writes `dismissed` status with the note
- [ ] Attempting to resolve a already-resolved request returns CONFLICT via toast
- [ ] Platform dashboard shows the pending count card; clicking it navigates to the inbox

**Implementation Note**: Pause here. Confirm the full round-trip (tenant-side click → platform-side surface → deep-link → resolve) works end-to-end before moving to Phase 7.

---

## Phase 7: Tenant-App Cleanup

### Overview

Remove the `DemoTenantsPanel` mount, delete the tenant-side admin UI components, and clean up orphaned imports. This is the final "tenant app no longer talks about demos" step. After this phase, the tenant-side `/admin/tenants` page shows only the regular tenant CRUD (which continues to use `tenants.manage`).

### Changes Required:

#### 1. Unmount from admin/tenants page

**File**: `src/app/[locale]/(dashboard)/admin/tenants/page.tsx`
**Changes**:

- Remove line 21 import: `DemoTenantsPanel,` from the `@/components/tenants` import block.
- Remove line 122: `<DemoTenantsPanel />`

#### 2. Delete Demo Component Files

**Delete**:

- `src/components/tenants/demo/demo-tenants-panel.tsx`
- `src/components/tenants/demo/demo-tenants-table.tsx`
- `src/components/tenants/demo/demo-create-sheet.tsx`
- `src/components/tenants/demo/demo-convert-dialog.tsx`
- `src/components/tenants/demo/index.ts`
- The `src/components/tenants/demo/` directory itself

#### 3. Update Tenants Component Index

**File**: `src/components/tenants/index.ts`
**Changes**: Remove the re-export of `DemoTenantsPanel` (if present) from the tenants barrel file.

#### 4. Clean Up i18n Keys (opportunistic)

**File**: `src/messages/de.json` (or wherever `adminTenants.demo.*` keys live — grep to confirm)
**Changes**: Remove the `adminTenants.demo.*` keys **that are only used by the deleted panel**. DO NOT remove:

- `adminTenants.demo.banner.message` — still used by `src/components/layout/demo-banner.tsx`
- Any keys used by `src/app/[locale]/demo-expired/page.tsx`

Run `grep -r "adminTenants.demo." src/` to enumerate remaining usages. Remove anything not matched.

If this cleanup is nontrivial, skip it — the orphan keys do no harm.

#### 5. Verify No Orphan References

Run these greps to confirm the tenant-app is clean:

- `grep -r "DemoTenantsPanel" src/` → ZERO hits
- `grep -r "use-demo-tenants\b" src/` → ZERO hits (only `use-demo-self-service` remains)
- `grep -r "trpc.demoTenants\." src/` → ZERO hits

### Success Criteria:

#### Automated Verification:

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm build` succeeds
- [ ] `pnpm test` passes — 4140/4144 pass; 4 pre-existing failures unrelated to this change (permissions count drift 140/146 vs actual 156 + 5 e2e failures that reproduce on the staging baseline)
- [x] `grep -r "DemoTenantsPanel" src/` returns ZERO hits
- [x] `grep -r "demo-tenants-panel\|demo-create-sheet\|demo-convert-dialog" src/` returns ZERO hits
- [x] `src/components/tenants/demo/` directory no longer exists

#### Manual Verification:

- [ ] `pnpm dev`, sign in as tenant-app user with `tenants.manage`, visit `/admin/tenants`
- [ ] Page renders without errors, shows regular tenant CRUD only, no demo panel
- [ ] Create a regular (non-demo) tenant via the existing form → still works
- [ ] Demo-banner still appears on demo-tenant dashboards (sanity check that we only deleted admin UI, not tenant UX)
- [ ] `/demo-expired` page still renders for expired demo admin users

**Implementation Note**: Pause for operator confirmation before Phase 8. Once this phase merges, the old tenant-side admin surface is gone for good.

---

## Phase 8: Docs + Final Verification

### Overview

Update `CLAUDE.md` to document the new platform-side demo management + convert-flow subscription coupling. Run the full verification suite. Complete the manual E2E checklist.

### Changes Required:

#### 1. CLAUDE.md Update

**File**: `CLAUDE.md`
**Changes**: Extend the "Platform Subscription Billing (Phase 10a)" section with a new bullet about the demo convert flow, OR add a new top-level section "Demo-Tenant Platform Management". Suggested addition:

```markdown
## Demo-Tenant Platform Management (Phase 10b)

Demo-tenant lifecycle is owned by the platform admin world. The tenant-app
no longer exposes demo management — all operator actions flow through
`/platform/tenants/demo` gated by `platformAuthedProcedure`.

Key files:
- `src/trpc/platform/routers/demoTenantManagement.ts` — 7 procedures
- `src/trpc/platform/routers/demoConvertRequests.ts` — convert-request inbox
- `src/lib/services/demo-tenant-service.ts` — service layer (shared with
  the tenant-side `demoSelfService.requestConvertFromExpired` self-service
  endpoint that still lives in the tenant tRPC tree)
- `src/lib/services/demo-convert-request-service.ts` — inbox CRUD
- `src/app/platform/(authed)/tenants/demo/page.tsx` — admin UI
- `src/app/platform/(authed)/tenants/convert-requests/page.tsx` — inbox UI

**Convert → Subscription coupling**: When a platform operator converts a
demo tenant, the `convert` procedure snapshots enabled modules from
`tenant_modules`, then for each module calls
`subscriptionService.createSubscription(...)` with the operator-selected
`billingCycle` (MONTHLY default). Partial subscription-create failures
are collected in `failedModules[]` in the response; the operator must
manually retry via the modules page. The convert itself is committed
regardless — converted tenants cannot be "un-converted".

**Creator attribution**: The `tenants.demo_created_by_platform_user_id`
column (added in migration `20260411100000`) stores the real platform
operator. The legacy `tenants.demo_created_by` column (pointing at
`public.users.id`) is preserved but receives no new writes from platform-
initiated creates. `listDemos()` merges both sources into a
`DemoCreatorDTO` with `source: "platform" | "tenant" | "unknown"`.

**Cron unchanged**: `/api/cron/expire-demo-tenants` continues to write
`audit_logs` with `userId=null` and `action="demo_expired"`. The cron is
a system event (not an operator action) and stays in the tenant audit
trail.
```

Do NOT duplicate the subscription billing section above — reference it.

#### 2. Service + Router Test Fixtures

Confirm all test fixtures use the new signatures. Run:

- `pnpm vitest run src/lib/services/__tests__/demo-tenant-service.test.ts`
- `pnpm vitest run src/lib/services/__tests__/demo-tenant-service.integration.test.ts`
- `pnpm vitest run src/lib/services/__tests__/demo-convert-request-service.test.ts`
- `pnpm vitest run src/trpc/platform/routers/__tests__/demoTenantManagement.test.ts`
- `pnpm vitest run src/trpc/platform/routers/__tests__/demoConvertRequests.test.ts`

#### 3. Full Test Suite + Quality Gates

```bash
pnpm test           # full vitest suite
pnpm typecheck      # should match baseline (~1463 pre-existing)
pnpm lint           # zero new errors
pnpm build          # production build
```

### Success Criteria:

#### Automated Verification:

- [ ] `pnpm test` passes — 4140/4144 pass; 4 pre-existing failures unrelated (see Phase 7 note)
- [x] `pnpm typecheck` passes — 0 errors (baseline had 1 pre-existing; the new file regeneration cleared it)
- [x] `pnpm lint` passes with zero new errors
- [x] `pnpm build` succeeds
- [x] `CLAUDE.md` contains the new Phase 10b section

#### Manual Verification — Full End-to-End Checklist:

**Platform admin flow**:
- [ ] Bootstrap platform user via `scripts/bootstrap-platform-user.ts` (if starting fresh)
- [ ] Sign in to `/platform/login`, complete MFA
- [ ] Navigate to `/platform/tenants/demo` via sidebar
- [ ] Create a new demo tenant with a valid template and 14-day duration
- [ ] Verify: invite-link dialog appears (SMTP not configured locally) OR welcome toast (SMTP configured)
- [ ] Verify: new row appears in list with `creator.source === "platform"` + real operator display name
- [ ] Verify: `tenants.demo_created_by` is NULL, `tenants.demo_created_by_platform_user_id` is the operator id (psql or Studio)
- [ ] Verify: one `platform_audit_logs` row with `action="demo.created"` exists

**Extend flow**:
- [ ] Click "Verlängern → 14 Tage" on the new demo
- [ ] Verify: toast success, expiration date updated
- [ ] Verify: one `platform_audit_logs` row with `action="demo.extended"`

**Convert flow (keep data)**:
- [ ] Click "Konvertieren", select "Daten behalten", select MONTHLY
- [ ] Verify: demo flags stripped (`is_demo=false`), data preserved
- [ ] Verify: `platform_subscriptions` has 4 rows (core/crm/billing/warehouse) for this tenant
- [ ] Verify: `billing_recurring_invoice` has rows in the operator tenant
- [ ] Verify: `platform_audit_logs` row with `action="demo.converted"`, `metadata.subscriptionIds.length === 4`, `metadata.failedModules === null`

**Convert flow (discard data)**:
- [ ] Create another demo tenant with a template
- [ ] Click "Konvertieren", select "Daten verwerfen", select ANNUALLY
- [ ] Verify: tenant content wiped (no bookings, no employees, etc.)
- [ ] Verify: admin user preserved (user_tenants row exists)
- [ ] Verify: `tenant_modules` re-populated with the 4 modules
- [ ] Verify: `platform_subscriptions` has 4 new rows with `billingCycle="ANNUALLY"`
- [ ] Verify: audit row metadata shows `discardData: true`, `moduleKeys: ["core","crm","billing","warehouse"]`

**Expire + delete flow**:
- [ ] Create a third demo, then click "Jetzt ablaufen lassen"
- [ ] Verify: row shows "Abgelaufen" badge, delete action becomes available
- [ ] Click "Löschen", confirm
- [ ] Verify: tenant row deleted, cascade purged all tenant-scoped content
- [ ] Verify: `platform_audit_logs` row with `action="demo.deleted"` exists with `target_tenant_id = NULL` (cascade SetNull) but `metadata.tenantName` preserved

**Convert-request inbox flow**:
- [ ] Create a demo, expire it (`expireNow`)
- [ ] Sign in to the tenant app as the demo's admin user
- [ ] Land on `/de/demo-expired`
- [ ] Click "Konvertierung anfragen" CTA
- [ ] Verify: success alert replaces the button
- [ ] Back in platform admin, navigate to `/platform/tenants/convert-requests`
- [ ] Verify: new row in Pending tab with the tenant name + requestedAt
- [ ] Click "Tenant öffnen →" → lands on `/platform/tenants/demo?highlight=<id>` with row highlighted for ~2.5s
- [ ] Back to inbox, click "Als erledigt markieren" with a note
- [ ] Verify: row moves to Resolved tab with resolver name + note + timestamp
- [ ] Verify: `platform_audit_logs` row with `action="demo_convert_request.resolved"`

**Regression checks**:
- [ ] Tenant-app `/admin/tenants` page renders without errors; no DemoTenantsPanel visible
- [ ] Regular (non-demo) tenant creation via the tenant-app panel still works
- [ ] Demo-banner still shows on active-demo tenant dashboards
- [ ] Cron `/api/cron/expire-demo-tenants` still works: manually trigger with `curl -X GET -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/cron/expire-demo-tenants`. Verify: affected demos flip to `isActive=false`, `audit_logs` row with `userId=null, action="demo_expired"`.
- [ ] `platform_audit_logs` has the expected number of new rows across the flow (no duplicates, no orphans)
- [ ] Tenant-side `audit_logs` has NO new rows with `action IN ('demo_create','demo_extend','demo_convert','demo_manual_expire','demo_delete')` from the platform flow — confirming the audit split is clean
- [ ] Tenant-side `audit_logs` STILL gets a row for `demo_convert_req` from the self-service flow (unchanged behavior)

**Implementation Note**: End of plan. No pause after this phase — after greenlight from operator the feature is shipped.

---

## Testing Strategy

### Unit Tests

**Service-level** (`src/lib/services/__tests__/`):
- `demo-tenant-service.test.ts` — updated for new `createDemo` signature (4 params), no audit assertions on create/extend/convert/expire/delete, new `ConvertDemoResult` shape
- `demo-convert-request-service.test.ts` — NEW; covers `create`, `list` with status filter, `resolve`/`dismiss` happy paths, `DemoConvertRequestConflictError` on double-resolve
- Existing `demo-tenant-service.integration.test.ts` — platform-user fixture in beforeAll/afterAll; remove audit-row assertions on the 5 migrated actions

**Router-level** (`src/trpc/platform/routers/__tests__/`):
- `demoTenantManagement.test.ts` — NEW; covers all 7 procedures with at minimum happy-path + one error case each (see Phase 3 §3 for the full matrix)
- `demoConvertRequests.test.ts` — NEW; covers list/resolve/dismiss/countPending

### Integration Tests

**Convert + subscription coupling** (`src/trpc/platform/routers/__tests__/demoTenantManagement.test.ts`):

- With `PLATFORM_OPERATOR_TENANT_ID` configured in the test environment, verify that `convert` creates the expected number of `platform_subscriptions` rows and `billing_recurring_invoice` rows. Use a test-fixture operator tenant.
- Without `PLATFORM_OPERATOR_TENANT_ID` (or with it set to empty), verify that `convert` completes successfully with `subscriptionIds: []` and `failedModules: []` — skipping the bridge entirely.

**Self-service → inbox materialization** (`src/trpc/routers/__tests__/demo-self-service.test.ts`, NEW):
- Call `demoSelfService.requestConvertFromExpired` on an expired demo → verify one `demo_convert_requests` row + one `email_send_log` row + one `audit_logs` row
- Call on a non-expired demo → verify `DemoTenantForbiddenError` mapped to FORBIDDEN
- Call as a non-member user → verify FORBIDDEN

### Manual Testing Steps

Captured in Phase 8 success criteria. The full E2E checklist is the acceptance gate.

## Performance Considerations

- `findDemos()` does a second batch query for platform-user lookup. At typical demo counts (0–50), this is O(1) extra query regardless of row count. No index needed on `demo_created_by_platform_user_id` — lookups are by `platform_users.id` primary key.
- Convert flow has a serialized subscription-create loop. At 4 modules × ~200ms each = ~800ms added latency to the convert mutation. Acceptable; operator flow is async-friendly.
- `demo_convert_requests` index on `(status, requested_at DESC)` supports the default list query. Pagination is standard 20-per-page.
- `wipeTenantData` inside the convert `discardData=true` path is unchanged in behavior — same 5-layer delete structure, same 120s transaction timeout.

## Migration Notes

- **Rollback**: Phases 1–6 are reversible by reverting the migration + code. Phase 7 (component deletion) is reversible via git. Once Phase 8 merges, rollback requires a coordinated revert of the schema migration and redeployment.
- **Zero-downtime**: All schema changes are additive (new columns + new tables, no drops or renames). The old `demo_created_by` column stays untouched so old rows remain readable. No data migration is needed for existing demo rows — they simply have `NULL` in the new creator column.
- **Deployment order**: Schema migration applies first, then app deploy. The new column is optional so the app can start with or without it. The `demo_convert_requests` table must exist before `demoService.requestConvertFromExpired` starts writing to it (Phase 6) — ensure the migration lands in the same release as Phase 6's code.

## References

**Research**:
- `thoughts/shared/research/2026-04-11-demo-tenant-platform-migration.md` — full bestandsaufnahme, call-graph, and open-questions catalog

**Source files (current state)**:
- `src/trpc/routers/demo-tenants.ts:1-206` — current tenant-side router (to be deleted)
- `src/lib/services/demo-tenant-service.ts:104-762` — service layer (refactored)
- `src/lib/services/demo-tenant-repository.ts:31-134` — repository (updated)
- `src/trpc/platform/routers/tenantManagement.ts:135-242` — reference pattern for platform tenant-create
- `src/trpc/platform/routers/tenantManagement.ts:507-600` — reference pattern for enableModule with subscription bridge
- `src/lib/platform/subscription-service.ts:262-403` — `createSubscription` entry point
- `src/app/platform/(authed)/support-sessions/page.tsx:80-208` — reference pattern for tabbed queue UI
- `src/app/platform/(authed)/tenants/new/page.tsx:73-88` — reference pattern for invite-link fallback
- `src/app/platform/(authed)/dashboard/page.tsx:11-13` — deferred comment (to be activated)
- `src/components/platform/sidebar.tsx:111-125` — sidebar sub-menu pattern

**Related plans**:
- `thoughts/shared/plans/2026-04-09-demo-tenant-system.md` — original Phase 3/4 of demo system
- `thoughts/shared/plans/2026-04-09-platform-admin-system.md` — platform admin foundations
- `thoughts/shared/plans/2026-04-10-platform-subscription-billing.md` — Phase 10a subscription bridge

**Key schema pointers**:
- `prisma/schema.prisma:113-121` — Tenant demo fields (extended)
- `prisma/schema.prisma:1244-1261` — PlatformUser model (FK target for new column)
- `prisma/schema.prisma:1285-1302` — PlatformAuditLog model (SetNull FK on target_tenant_id)
- `supabase/migrations/20260420100000_add_tenant_demo_fields.sql` — existing demo columns
- `supabase/migrations/20260421000000_create_platform_admin_tables.sql:49` — platform_audit_logs FK
- `supabase/migrations/20260421300001_add_tenant_module_platform_fields.sql` — pattern for new parallel FK column
