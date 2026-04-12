/**
 * Integration tests for the expire-demo-tenants cron route.
 *
 * Tests against real DB — verifies expired demo detection, isActive flip,
 * audit log emission, and checkpoint idempotency.
 *
 * @see thoughts/shared/plans/2026-04-09-demo-tenant-system.md (Phase 4)
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest"

import { prisma } from "@/lib/db/prisma"
import { GET, executeExpireDemoTenants } from "../route"

// --- Constants ---

const ACTIVE_DEMO_ID = "f0000000-0000-4000-a000-000000001001"
const EXPIRED_DEMO_ID = "f0000000-0000-4000-a000-000000001002"
const NON_DEMO_ID = "f0000000-0000-4000-a000-000000001003"
const CRON_SECRET = "expire-demo-tenants-test-secret"

const NOW = new Date("2026-04-09T12:00:00.000Z")
const FUTURE_EXPIRES_AT = new Date("2026-04-16T12:00:00.000Z") // +7 days
const PAST_EXPIRES_AT = new Date("2026-04-08T12:00:00.000Z") // -1 day

function makeRequest() {
  return new Request("http://localhost/api/cron/expire-demo-tenants", {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  })
}

async function cleanupCheckpoints() {
  await prisma.cronCheckpoint
    .deleteMany({ where: { cronName: "expire_demo_tenants" } })
    .catch(() => {})
}

async function cleanupAuditLogs() {
  await prisma.auditLog
    .deleteMany({
      where: {
        action: "demo_expired",
        tenantId: { in: [ACTIVE_DEMO_ID, EXPIRED_DEMO_ID, NON_DEMO_ID] },
      },
    })
    .catch(() => {})
}

async function cleanupTenants() {
  await prisma.tenant
    .deleteMany({
      where: { id: { in: [ACTIVE_DEMO_ID, EXPIRED_DEMO_ID, NON_DEMO_ID] } },
    })
    .catch(() => {})
}

async function seedTenants() {
  // (a) Active demo — expires in the future, should be untouched
  await prisma.tenant.create({
    data: {
      id: ACTIVE_DEMO_ID,
      name: "Active Demo",
      slug: `active-demo-${Date.now()}`,
      isActive: true,
      isDemo: true,
      demoExpiresAt: FUTURE_EXPIRES_AT,
      demoTemplate: "industriedienstleister_150",
    },
  })

  // (b) Expired active demo — should be flipped to isActive=false
  await prisma.tenant.create({
    data: {
      id: EXPIRED_DEMO_ID,
      name: "Expired Demo",
      slug: `expired-demo-${Date.now()}`,
      isActive: true,
      isDemo: true,
      demoExpiresAt: PAST_EXPIRES_AT,
      demoTemplate: "industriedienstleister_150",
    },
  })

  // (c) Non-demo tenant — should never be touched even if flags look stale
  await prisma.tenant.create({
    data: {
      id: NON_DEMO_ID,
      name: "Normal Tenant",
      slug: `normal-${Date.now()}`,
      isActive: true,
      isDemo: false,
    },
  })
}

// --- Setup & Teardown ---

beforeAll(() => {
  process.env.CRON_SECRET = CRON_SECRET
})

afterAll(async () => {
  await cleanupAuditLogs()
  await cleanupCheckpoints()
  await cleanupTenants()
})

beforeEach(async () => {
  await cleanupAuditLogs()
  await cleanupCheckpoints()
  await cleanupTenants()
  await seedTenants()
})

// --- Tests ---

describe.sequential("expire-demo-tenants cron", () => {
  it("flips isActive=false only for expired demos", async () => {
    const result = await executeExpireDemoTenants(NOW)

    expect(result.ok).toBe(true)
    expect(result.processed).toBe(1)
    expect(result.failed).toBe(0)
    expect(result.results).toHaveLength(1)
    expect(result.results[0]!.tenantId).toBe(EXPIRED_DEMO_ID)

    // (a) active demo untouched
    const activeDemo = await prisma.tenant.findUniqueOrThrow({
      where: { id: ACTIVE_DEMO_ID },
    })
    expect(activeDemo.isActive).toBe(true)

    // (b) expired demo flipped
    const expiredDemo = await prisma.tenant.findUniqueOrThrow({
      where: { id: EXPIRED_DEMO_ID },
    })
    expect(expiredDemo.isActive).toBe(false)

    // (c) non-demo tenant untouched
    const nonDemo = await prisma.tenant.findUniqueOrThrow({
      where: { id: NON_DEMO_ID },
    })
    expect(nonDemo.isActive).toBe(true)
  })

  it("writes a demo_expired audit log for each expired tenant", async () => {
    await executeExpireDemoTenants(NOW)

    const logs = await prisma.auditLog.findMany({
      where: { action: "demo_expired", tenantId: EXPIRED_DEMO_ID },
    })
    expect(logs).toHaveLength(1)
    expect(logs[0]!.entityType).toBe("tenant")
    expect(logs[0]!.entityId).toBe(EXPIRED_DEMO_ID)
    expect(logs[0]!.userId).toBeNull()
    expect(logs[0]!.userAgent).toBe("cron/expire-demo-tenants")
    expect(logs[0]!.changes).toEqual({
      isActive: { old: true, new: false },
    })
  })

  it("writes a cron_checkpoints row for each processed tenant", async () => {
    await executeExpireDemoTenants(NOW)

    const runKey = NOW.toISOString().slice(0, 10)
    const checkpoints = await prisma.cronCheckpoint.findMany({
      where: {
        cronName: "expire_demo_tenants",
        runKey,
      },
    })
    expect(checkpoints).toHaveLength(1)
    expect(checkpoints[0]!.tenantId).toBe(EXPIRED_DEMO_ID)
    expect(checkpoints[0]!.status).toBe("completed")
  })

  it("is idempotent on re-run (checkpoint skips already-processed tenants)", async () => {
    const first = await executeExpireDemoTenants(NOW)
    expect(first.processed).toBe(1)

    const second = await executeExpireDemoTenants(NOW)
    // On re-run, the expired tenant is already isActive=false, so the
    // findExpiredActiveDemos query returns zero rows. processed = 0.
    expect(second.processed).toBe(0)
    expect(second.failed).toBe(0)

    // Only one audit log was written — no duplicate on re-run.
    const logs = await prisma.auditLog.findMany({
      where: { action: "demo_expired", tenantId: EXPIRED_DEMO_ID },
    })
    expect(logs).toHaveLength(1)
  })

  it("returns 401 without valid CRON_SECRET", async () => {
    const request = new Request(
      "http://localhost/api/cron/expire-demo-tenants",
      {
        headers: { authorization: "Bearer wrong-secret" },
      },
    )
    const response = await GET(request)
    expect(response.status).toBe(401)
  })

  it("GET with valid secret returns 200 and processes expired demos", async () => {
    const response = await GET(makeRequest())
    expect(response.status).toBe(200)

    const body = (await response.json()) as {
      ok: boolean
      processed: number
      failed: number
    }
    expect(body.ok).toBe(true)
    // Note: GET() uses `new Date()` internally; the seeded expired demo has a
    // demoExpiresAt in 2026-04-08 which is always < real "now", so it is picked up.
    expect(body.processed).toBe(1)
    expect(body.failed).toBe(0)
  })
})
