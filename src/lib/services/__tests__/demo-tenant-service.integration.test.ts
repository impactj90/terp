/**
 * End-to-end integration tests for demo-tenant-service.
 *
 * Requires:
 *   - Local Supabase running (`pnpm db:start`)
 *   - DATABASE_URL + NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in
 *     .env.local so the service can hit the local auth server
 *
 * Phase 2 migration (2026-04-11): `createDemo` now takes a platform user id
 * as the acting actor, not a tenant user id. This test suite creates its
 * own ephemeral `platform_users` fixture row in beforeAll and deletes it
 * in afterAll. The seed admin user is no longer used for platform-initiated
 * demo creates (but is still used by the self-service test).
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest"

import { prisma } from "@/lib/db/prisma"
import { createAdminClient } from "@/lib/supabase/admin"
import * as demoService from "../demo-tenant-service"
import {
  DemoTenantForbiddenError,
} from "../demo-tenant-service"
import * as repo from "../demo-tenant-repository"

const HAS_DB = Boolean(process.env.DATABASE_URL)

// Seed admin user (from supabase/seed.sql) — used only as the `requestingUserId`
// fallback in the self-service test, since that test creates its own demo
// admin user via createDemo and uses that id.
const SEED_ADMIN_USER_ID = "00000000-0000-0000-0000-000000000001"

const PLATFORM_AUDIT = {
  ipAddress: "127.0.0.1",
  userAgent: "vitest",
}

const SELF_SERVICE_AUDIT = {
  userId: SEED_ADMIN_USER_ID,
  ipAddress: "127.0.0.1",
  userAgent: "vitest",
}

// Track ids we create so we can clean up even if individual tests fail.
const createdAuthUserIds = new Set<string>()
const createdTenantIds = new Set<string>()

// Populated in beforeAll — the platform-user fixture id used by createDemo.
let platformUserId: string = ""

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
}

function baseCreateInput(suffix: string) {
  return {
    tenantName: `Demo Service Test ${suffix}`,
    tenantSlug: `demo-svc-${suffix}`,
    addressStreet: "Teststrasse 1",
    addressZip: "80000",
    addressCity: "München",
    addressCountry: "DE",
    adminEmail: `demo-svc-${suffix}@test.local`,
    adminDisplayName: "Demo Svc Admin",
  }
}

async function cleanupAuthUser(id: string) {
  try {
    const client = createAdminClient()
    await client.auth.admin.deleteUser(id)
  } catch (err) {
    console.warn(`[cleanup] failed to delete auth user ${id}:`, err)
  }
}

async function cleanupTenant(tenantId: string) {
  // Try deleteDemo; fall back to hard delete if it's already been deleted or
  // is still active (in which case we expire first).
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    })
    if (!tenant) return
    if (tenant.isActive !== false) {
      await demoService.expireDemoNow(prisma, tenantId)
    }
    await demoService.deleteDemo(prisma, tenantId)
  } catch (err) {
    console.warn(`[cleanup] deleteDemo failed for ${tenantId}:`, err)
  }
}

describe.skipIf(!HAS_DB)("demo-tenant-service integration", () => {
  beforeAll(async () => {
    // Platform-user fixture. passwordHash is a dummy bcrypt placeholder — the
    // test never logs this user in, only uses its id for FK attribution.
    const platformUser = await prisma.platformUser.create({
      data: {
        email: `demo-test-${uniqueSuffix()}@platform.local`,
        passwordHash:
          "$2b$10$test.fixture.hash.test.fixture.hash.test.fixture.hash.tes",
        displayName: "Demo Test Platform Fixture",
        isActive: true,
      },
      select: { id: true },
    })
    platformUserId = platformUser.id
  })

  afterAll(async () => {
    for (const uId of Array.from(createdAuthUserIds)) {
      await cleanupAuthUser(uId)
    }
    createdAuthUserIds.clear()
    if (platformUserId) {
      try {
        await prisma.platformUser.delete({ where: { id: platformUserId } })
      } catch (err) {
        console.warn(
          `[cleanup] failed to delete platform user fixture ${platformUserId}:`,
          err,
        )
      }
    }
  })

  beforeEach(() => {
    // Nothing — each test scopes its own ids.
  })

  afterEach(async () => {
    // Clean up anything each test created but didn't already remove.
    for (const tId of Array.from(createdTenantIds)) {
      await cleanupTenant(tId)
      createdTenantIds.delete(tId)
    }
  })

  // -------------------------------------------------------------------------
  // Happy path: create, assert all side effects
  // -------------------------------------------------------------------------
  test(
    "createDemo commits tenant, modules, admin user and template data",
    async () => {
      const s = uniqueSuffix()
      const result = await demoService.createDemo(
        prisma,
        baseCreateInput(s),
        platformUserId,
        PLATFORM_AUDIT,
      )
      createdTenantIds.add(result.tenantId)
      createdAuthUserIds.add(result.adminUserId)

      // Tenant row flags
      const tenant = await prisma.tenant.findUnique({
        where: { id: result.tenantId },
      })
      expect(tenant).not.toBeNull()
      expect(tenant?.isDemo).toBe(true)
      expect(tenant?.isActive).toBe(true)
      expect(tenant?.demoTemplate).toBe(result.demoTemplate)
      // Creator attribution: NEW column populated with the platform fixture,
      // legacy column explicitly NULL.
      expect(tenant?.demoCreatedByPlatformUserId).toBe(platformUserId)
      expect(tenant?.demoCreatedById).toBeNull()
      expect(tenant?.demoExpiresAt).toBeInstanceOf(Date)
      // ~14 days from now (default)
      const diffDays =
        ((tenant!.demoExpiresAt!.getTime() - Date.now()) /
          (24 * 60 * 60 * 1000))
      expect(diffDays).toBeGreaterThan(13)
      expect(diffDays).toBeLessThan(15)

      // 5 tenant_modules attributed to the platform fixture (4 from the
      // platform router's per-tenant default set + `nachkalkulation` from
      // the showcase template's `modulesToEnable` (NK-1 Decision 32))
      const modules = await prisma.tenantModule.findMany({
        where: { tenantId: result.tenantId },
      })
      expect(modules.map((m) => m.module).sort()).toEqual([
        "billing",
        "core",
        "crm",
        "nachkalkulation",
        "warehouse",
      ])
      for (const m of modules) {
        expect(m.enabledByPlatformUserId).toBe(platformUserId)
        expect(m.enabledById).toBeNull()
      }

      // Admin user exists and is linked via user_tenants
      const adminUser = await prisma.user.findUnique({
        where: { id: result.adminUserId },
      })
      expect(adminUser).not.toBeNull()
      expect(adminUser?.tenantId).toBe(result.tenantId)
      expect(adminUser?.userGroupId).toBe(repo.DEMO_ADMIN_GROUP_ID)

      const membership = await prisma.userTenant.findUnique({
        where: {
          userId_tenantId: {
            userId: result.adminUserId,
            tenantId: result.tenantId,
          },
        },
      })
      expect(membership).not.toBeNull()

      // Template seeded 150 employees
      const empCount = await prisma.employee.count({
        where: { tenantId: result.tenantId },
      })
      expect(empCount).toBe(150)

      // NO tenant-side audit_logs entry for demo_create — the platform
      // router writes platform_audit_logs instead.
      const auditEntry = await prisma.auditLog.findFirst({
        where: {
          tenantId: result.tenantId,
          action: "demo_create",
        },
      })
      expect(auditEntry).toBeNull()
    },
    180_000,
  )

  // -------------------------------------------------------------------------
  // listDemos — returns both active and expired, with creator DTO
  // -------------------------------------------------------------------------
  test(
    "listDemos returns platform-created demo with creator.source='platform'",
    async () => {
      const s = uniqueSuffix()
      const created = await demoService.createDemo(
        prisma,
        baseCreateInput(s),
        platformUserId,
        PLATFORM_AUDIT,
      )
      createdTenantIds.add(created.tenantId)
      createdAuthUserIds.add(created.adminUserId)

      const all = await demoService.listDemos(prisma)
      const row = all.find((d) => d.id === created.tenantId)
      expect(row).toBeDefined()
      expect(row!.creator.source).toBe("platform")
      expect(row!.creator.id).toBe(platformUserId)
      expect(row!.status).toBe("active")
    },
    180_000,
  )

  // -------------------------------------------------------------------------
  // extendDemo happy path + reactivation
  // -------------------------------------------------------------------------
  test(
    "extendDemo bumps expiration by +7 days",
    async () => {
      const s = uniqueSuffix()
      const created = await demoService.createDemo(
        prisma,
        baseCreateInput(s),
        platformUserId,
        PLATFORM_AUDIT,
      )
      createdTenantIds.add(created.tenantId)
      createdAuthUserIds.add(created.adminUserId)

      const beforeExp = created.demoExpiresAt
      const updated = await demoService.extendDemo(
        prisma,
        created.tenantId,
        7,
      )
      const delta =
        (updated.demoExpiresAt!.getTime() - beforeExp.getTime()) /
        (24 * 60 * 60 * 1000)
      expect(delta).toBeCloseTo(7, 0)
    },
    180_000,
  )

  test(
    "extendDemo on an expired demo reactivates it",
    async () => {
      const s = uniqueSuffix()
      const created = await demoService.createDemo(
        prisma,
        baseCreateInput(s),
        platformUserId,
        PLATFORM_AUDIT,
      )
      createdTenantIds.add(created.tenantId)
      createdAuthUserIds.add(created.adminUserId)

      await demoService.expireDemoNow(prisma, created.tenantId)

      const beforeExpire = await prisma.tenant.findUnique({
        where: { id: created.tenantId },
      })
      expect(beforeExpire?.isActive).toBe(false)

      const updated = await demoService.extendDemo(
        prisma,
        created.tenantId,
        14,
      )
      expect(updated.isActive).toBe(true)
      expect(updated.demoExpiresAt!.getTime()).toBeGreaterThan(Date.now())
    },
    180_000,
  )

  // -------------------------------------------------------------------------
  // convertDemo — keep data path
  // -------------------------------------------------------------------------
  test(
    "convertDemo with discardData=false keeps all content and snapshots modules",
    async () => {
      const s = uniqueSuffix()
      const created = await demoService.createDemo(
        prisma,
        baseCreateInput(s),
        platformUserId,
        PLATFORM_AUDIT,
      )
      createdTenantIds.add(created.tenantId)
      createdAuthUserIds.add(created.adminUserId)

      const result = await demoService.convertDemo(
        prisma,
        created.tenantId,
        { discardData: false },
      )
      // NK-1 (Decision 32): showcase template auto-enables nachkalkulation,
      // so the convert-snapshot must include it as a 5th entry.
      expect(result.snapshottedModules.sort()).toEqual([
        "billing",
        "core",
        "crm",
        "nachkalkulation",
        "warehouse",
      ])
      expect(result.originalTemplate).toBe(created.demoTemplate)
      expect(result.tenantName).toContain("Demo Service Test")

      const tenant = await prisma.tenant.findUnique({
        where: { id: created.tenantId },
      })
      expect(tenant?.isDemo).toBe(false)
      expect(tenant?.demoExpiresAt).toBeNull()
      expect(tenant?.demoTemplate).toBeNull()
      expect(tenant?.demoCreatedByPlatformUserId).toBeNull()

      const empCount = await prisma.employee.count({
        where: { tenantId: created.tenantId },
      })
      expect(empCount).toBe(150)
    },
    180_000,
  )

  // -------------------------------------------------------------------------
  // convertDemo — discard data but preserve auth
  // -------------------------------------------------------------------------
  test(
    "convertDemo with discardData=true wipes content but keeps admin",
    async () => {
      const s = uniqueSuffix()
      const created = await demoService.createDemo(
        prisma,
        baseCreateInput(s),
        platformUserId,
        PLATFORM_AUDIT,
      )
      createdTenantIds.add(created.tenantId)
      createdAuthUserIds.add(created.adminUserId)

      const result = await demoService.convertDemo(
        prisma,
        created.tenantId,
        { discardData: true },
      )
      // NK-1 (Decision 32): 4 platform-defaults + nachkalkulation = 5
      expect(result.snapshottedModules.length).toBe(5)

      // Tenant stays, is no longer a demo
      const tenant = await prisma.tenant.findUnique({
        where: { id: created.tenantId },
      })
      expect(tenant).not.toBeNull()
      expect(tenant?.isDemo).toBe(false)

      // Content wiped
      const empCount = await prisma.employee.count({
        where: { tenantId: created.tenantId },
      })
      expect(empCount).toBe(0)
      const articles = await prisma.whArticle.count({
        where: { tenantId: created.tenantId },
      })
      expect(articles).toBe(0)

      // tenant_modules also wiped — the platform router re-inserts them
      // after the service call. This test asserts the SERVICE behavior only.
      const modulesPost = await prisma.tenantModule.count({
        where: { tenantId: created.tenantId },
      })
      expect(modulesPost).toBe(0)

      // Auth preserved
      const admin = await prisma.user.findUnique({
        where: { id: created.adminUserId },
      })
      expect(admin).not.toBeNull()

      const membership = await prisma.userTenant.findUnique({
        where: {
          userId_tenantId: {
            userId: created.adminUserId,
            tenantId: created.tenantId,
          },
        },
      })
      expect(membership).not.toBeNull()
    },
    180_000,
  )

  // -------------------------------------------------------------------------
  // expireDemoNow
  // -------------------------------------------------------------------------
  test(
    "expireDemoNow sets isActive=false and demoExpiresAt~now",
    async () => {
      const s = uniqueSuffix()
      const created = await demoService.createDemo(
        prisma,
        baseCreateInput(s),
        platformUserId,
        PLATFORM_AUDIT,
      )
      createdTenantIds.add(created.tenantId)
      createdAuthUserIds.add(created.adminUserId)

      const before = Date.now()
      await demoService.expireDemoNow(prisma, created.tenantId)

      const tenant = await prisma.tenant.findUnique({
        where: { id: created.tenantId },
      })
      expect(tenant?.isActive).toBe(false)
      expect(tenant?.demoExpiresAt).toBeInstanceOf(Date)
      expect(tenant?.demoExpiresAt!.getTime()).toBeGreaterThanOrEqual(before)
    },
    180_000,
  )

  // -------------------------------------------------------------------------
  // deleteDemo — guarded against active, allowed on expired
  // -------------------------------------------------------------------------
  test(
    "deleteDemo refuses to remove an active demo",
    async () => {
      const s = uniqueSuffix()
      const created = await demoService.createDemo(
        prisma,
        baseCreateInput(s),
        platformUserId,
        PLATFORM_AUDIT,
      )
      createdTenantIds.add(created.tenantId)
      createdAuthUserIds.add(created.adminUserId)

      await expect(
        demoService.deleteDemo(prisma, created.tenantId),
      ).rejects.toBeInstanceOf(DemoTenantForbiddenError)
    },
    180_000,
  )

  test(
    "deleteDemo removes an expired demo",
    async () => {
      const s = uniqueSuffix()
      const created = await demoService.createDemo(
        prisma,
        baseCreateInput(s),
        platformUserId,
        PLATFORM_AUDIT,
      )
      createdAuthUserIds.add(created.adminUserId)
      // We intentionally do NOT add to createdTenantIds because we delete it
      // here — afterEach would try to delete it again and warn.

      await demoService.expireDemoNow(prisma, created.tenantId)
      await demoService.deleteDemo(prisma, created.tenantId)

      const tenant = await prisma.tenant.findUnique({
        where: { id: created.tenantId },
      })
      expect(tenant).toBeNull()
    },
    240_000,
  )

  // -------------------------------------------------------------------------
  // requestConvertFromExpired — self-service CTA
  // -------------------------------------------------------------------------
  test(
    "requestConvertFromExpired succeeds for demo admin after expiry",
    async () => {
      const s = uniqueSuffix()
      const created = await demoService.createDemo(
        prisma,
        baseCreateInput(s),
        platformUserId,
        PLATFORM_AUDIT,
      )
      createdTenantIds.add(created.tenantId)
      createdAuthUserIds.add(created.adminUserId)

      // Within window → forbidden
      await expect(
        demoService.requestConvertFromExpired(
          prisma,
          created.adminUserId,
          created.tenantId,
          { ...SELF_SERVICE_AUDIT, userId: created.adminUserId },
        ),
      ).rejects.toBeInstanceOf(DemoTenantForbiddenError)

      // Expire the demo (sets demoExpiresAt=now, isActive=false)
      await demoService.expireDemoNow(prisma, created.tenantId)

      // Now it should succeed
      const result = await demoService.requestConvertFromExpired(
        prisma,
        created.adminUserId,
        created.tenantId,
        { ...SELF_SERVICE_AUDIT, userId: created.adminUserId },
      )
      expect(result).toEqual({ ok: true })

      // email_send_log pending row exists
      const emailLog = await prisma.emailSendLog.findFirst({
        where: {
          tenantId: created.tenantId,
          status: "pending",
        },
      })
      expect(emailLog).not.toBeNull()

      // Tenant-side audit entry — self-service action unchanged from Phase 1
      const audit = await prisma.auditLog.findFirst({
        where: {
          tenantId: created.tenantId,
          action: "demo_convert_req",
        },
      })
      expect(audit).not.toBeNull()
    },
    240_000,
  )

  test(
    "requestConvertFromExpired refuses non-members",
    async () => {
      const s = uniqueSuffix()
      const created = await demoService.createDemo(
        prisma,
        baseCreateInput(s),
        platformUserId,
        PLATFORM_AUDIT,
      )
      createdTenantIds.add(created.tenantId)
      createdAuthUserIds.add(created.adminUserId)

      const randomUserId = "11111111-1111-1111-1111-111111111111"
      await expect(
        demoService.requestConvertFromExpired(
          prisma,
          randomUserId,
          created.tenantId,
          { ...SELF_SERVICE_AUDIT, userId: randomUserId },
        ),
      ).rejects.toBeInstanceOf(DemoTenantForbiddenError)
    },
    180_000,
  )

  // -------------------------------------------------------------------------
  // Rollback compensation: slug conflict on second insert
  // -------------------------------------------------------------------------
  test(
    "createDemo rolls back prisma tx on slug collision",
    async () => {
      const s = uniqueSuffix()
      const first = await demoService.createDemo(
        prisma,
        baseCreateInput(s),
        platformUserId,
        PLATFORM_AUDIT,
      )
      createdTenantIds.add(first.tenantId)
      createdAuthUserIds.add(first.adminUserId)

      // Second call reuses the slug but different email → tenant.create
      // throws P2002 (unique constraint) before the admin user is created.
      const s2 = uniqueSuffix()
      await expect(
        demoService.createDemo(
          prisma,
          {
            ...baseCreateInput(s2),
            tenantSlug: `demo-svc-${s}`, // collision
          },
          platformUserId,
          PLATFORM_AUDIT,
        ),
      ).rejects.toThrow()

      // Only the first tenant exists
      const tenants = await prisma.tenant.findMany({
        where: { slug: `demo-svc-${s}` },
      })
      expect(tenants).toHaveLength(1)

      // No admin user for s2's email was created (auth OR public)
      const s2Email = `demo-svc-${s2}@test.local`
      const publicUser = await prisma.user.findFirst({
        where: { email: s2Email },
      })
      expect(publicUser).toBeNull()
    },
    240_000,
  )
})
