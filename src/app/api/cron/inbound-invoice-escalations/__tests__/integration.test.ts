/**
 * Integration tests for the inbound-invoice-escalations cron route.
 * Tests against real DB — verifies overdue step detection, reminder creation,
 * and 24h cooldown.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest"

// Mock PubSub (not available in test)
vi.mock("@/lib/pubsub/singleton", () => ({
  getHub: vi.fn().mockResolvedValue({
    publish: vi.fn().mockResolvedValue(undefined),
  }),
}))
vi.mock("@/lib/pubsub/topics", () => ({
  userTopic: vi.fn((id: string) => `user:${id}`),
}))

import { prisma } from "@/lib/db/prisma"
import { GET } from "../route"

// --- Constants ---

const TEST_TENANT_ID = "f0000000-0000-4000-a000-000000000707"
const TEST_TENANT_SLUG = "escalation-integration"
const APPROVER_ID = "a0000000-0000-4000-a000-000000000701"
const CRON_SECRET = "escalation-test-cron-secret"

function makeRequest() {
  return new Request("http://localhost/api/cron/inbound-invoice-escalations", {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  })
}

// --- Setup & Teardown ---

beforeAll(async () => {
  process.env.CRON_SECRET = CRON_SECRET

  await prisma.tenant.upsert({
    where: { id: TEST_TENANT_ID },
    update: {},
    create: { id: TEST_TENANT_ID, name: "Escalation Test", slug: TEST_TENANT_SLUG, isActive: true },
  })

  await prisma.user.upsert({
    where: { id: APPROVER_ID },
    update: {},
    create: { id: APPROVER_ID, email: "escalation-approver@test.local", displayName: "Escalation Approver" },
  })

  await prisma.userTenant.upsert({
    where: { userId_tenantId: { userId: APPROVER_ID, tenantId: TEST_TENANT_ID } },
    update: {},
    create: { userId: APPROVER_ID, tenantId: TEST_TENANT_ID },
  })
})

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  await prisma.inboundInvoiceApproval.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  await prisma.inboundInvoiceLineItem.deleteMany({ where: { invoice: { tenantId: TEST_TENANT_ID } } }).catch(() => {})
  await prisma.inboundInvoice.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  await prisma.numberSequence.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  await prisma.userTenant.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  await prisma.user.deleteMany({ where: { id: APPROVER_ID } }).catch(() => {})
  await prisma.tenant.deleteMany({ where: { id: TEST_TENANT_ID } }).catch(() => {})
})

async function cleanupTestData() {
  await prisma.notification.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  await prisma.inboundInvoiceApproval.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  await prisma.inboundInvoiceLineItem.deleteMany({ where: { invoice: { tenantId: TEST_TENANT_ID } } }).catch(() => {})
  await prisma.inboundInvoice.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
}

/**
 * Create a test invoice + approval step with a specific due_at.
 */
async function createOverdueApproval(dueAt: Date, lastReminderAt?: Date) {
  const invoice = await prisma.inboundInvoice.create({
    data: {
      tenantId: TEST_TENANT_ID,
      number: `ER-ESC-${Date.now()}`,
      source: "manual",
      status: "PENDING_APPROVAL",
      supplierStatus: "unknown",
    },
  })

  const approval = await prisma.inboundInvoiceApproval.create({
    data: {
      invoiceId: invoice.id,
      tenantId: TEST_TENANT_ID,
      stepOrder: 1,
      approvalVersion: 1,
      approverUserId: APPROVER_ID,
      status: "PENDING",
      dueAt,
      lastReminderAt: lastReminderAt ?? null,
    },
  })

  return { invoice, approval }
}

// --- Tests ---

describe.sequential("Escalation Cron Integration", () => {
  beforeEach(async () => {
    await cleanupTestData()
  })

  it("sends reminder for overdue step", async () => {
    const pastDue = new Date(Date.now() - 2 * 60 * 60 * 1000) // 2h ago
    await createOverdueApproval(pastDue)

    const response = await GET(makeRequest())
    const body = await response.json()

    expect(body.ok).toBe(true)
    expect(body.reminded).toBe(1)

    // Check notification was created
    const notifications = await prisma.notification.findMany({
      where: { tenantId: TEST_TENANT_ID, userId: APPROVER_ID },
    })
    expect(notifications).toHaveLength(1)
    expect(notifications[0]!.type).toBe("reminders")
    expect(notifications[0]!.title).toContain("Erinnerung")
  })

  it("skips step within 24h cooldown", async () => {
    const pastDue = new Date(Date.now() - 2 * 60 * 60 * 1000)
    const recentReminder = new Date(Date.now() - 1 * 60 * 60 * 1000) // 1h ago
    await createOverdueApproval(pastDue, recentReminder)

    const response = await GET(makeRequest())
    const body = await response.json()

    expect(body.ok).toBe(true)
    expect(body.skipped).toBe(1)
    expect(body.reminded).toBe(0)

    // No new notification
    const notifications = await prisma.notification.findMany({
      where: { tenantId: TEST_TENANT_ID },
    })
    expect(notifications).toHaveLength(0)
  })

  it("sends reminder when cooldown has expired", async () => {
    const pastDue = new Date(Date.now() - 48 * 60 * 60 * 1000)
    const oldReminder = new Date(Date.now() - 25 * 60 * 60 * 1000) // 25h ago
    await createOverdueApproval(pastDue, oldReminder)

    const response = await GET(makeRequest())
    const body = await response.json()

    expect(body.reminded).toBe(1)

    const notifications = await prisma.notification.findMany({
      where: { tenantId: TEST_TENANT_ID },
    })
    expect(notifications).toHaveLength(1)
  })

  it("ignores non-overdue steps", async () => {
    const futureDue = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h from now
    await createOverdueApproval(futureDue)

    const response = await GET(makeRequest())
    const body = await response.json()

    expect(body.overdue).toBe(0)
    expect(body.reminded).toBe(0)
  })

  it("returns 401 without valid cron secret", async () => {
    const request = new Request("http://localhost/api/cron/inbound-invoice-escalations", {
      headers: { authorization: "Bearer wrong-secret" },
    })
    const response = await GET(request)
    expect(response.status).toBe(401)
  })
})
