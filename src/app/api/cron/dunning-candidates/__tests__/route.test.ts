/**
 * Tests for /api/cron/dunning-candidates route.
 *
 * Covers:
 *  - CRON_SECRET authorization
 *  - Tenant iteration (only enabled tenants)
 *  - Notification deduplication (no duplicate row same day)
 *  - Recipient resolution via dunning.view permission
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const {
  mockReminderSettingsFindMany,
  mockEligibilityList,
  mockUserFindMany,
  mockNotificationFindFirst,
  mockNotificationCreate,
  mockNotificationCount,
} = vi.hoisted(() => ({
  mockReminderSettingsFindMany: vi.fn(),
  mockEligibilityList: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockNotificationFindFirst: vi.fn(),
  mockNotificationCreate: vi.fn(),
  mockNotificationCount: vi.fn().mockResolvedValue(0),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    reminderSettings: { findMany: mockReminderSettingsFindMany },
    user: { findMany: mockUserFindMany },
    notification: {
      findFirst: mockNotificationFindFirst,
      create: mockNotificationCreate,
      count: mockNotificationCount,
    },
  },
}))

vi.mock("@/lib/services/reminder-eligibility-service", () => ({
  listEligibleInvoices: (...args: unknown[]) => mockEligibilityList(...args),
}))

vi.mock("@/lib/pubsub/singleton", () => ({
  getHub: vi.fn().mockResolvedValue({ publish: vi.fn() }),
}))

vi.mock("@/lib/pubsub/topics", () => ({
  userTopic: (id: string) => `user:${id}`,
}))

const TENANT_A = "a0000000-0000-4000-a000-000000000100"
const TENANT_B = "a0000000-0000-4000-a000-000000000200"
const ADMIN_USER = "b0000000-0000-4000-a000-000000000001"

const ADMIN_GROUP = {
  id: "g-admin",
  name: "Admins",
  code: "admin",
  permissions: [],
  isAdmin: true,
  isActive: true,
  isSystem: false,
}

function adminUserRow(id: string) {
  return {
    id,
    isActive: true,
    isLocked: false,
    role: "user",
    userGroup: ADMIN_GROUP,
    userTenants: [],
  }
}

describe("GET /api/cron/dunning-candidates", () => {
  let originalCronSecret: string | undefined

  beforeEach(() => {
    originalCronSecret = process.env.CRON_SECRET
    process.env.CRON_SECRET = "test-secret"
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET
    } else {
      process.env.CRON_SECRET = originalCronSecret
    }
  })

  async function importGET() {
    const mod = await import("../route")
    return mod.GET
  }

  function makeRequest(authHeader?: string) {
    const headers: Record<string, string> = {}
    if (authHeader !== undefined) headers["authorization"] = authHeader
    return new Request("http://localhost:3000/api/cron/dunning-candidates", {
      headers,
    })
  }

  describe("authorization", () => {
    it("returns 503 when CRON_SECRET is unset", async () => {
      delete process.env.CRON_SECRET
      const GET = await importGET()
      const res = await GET(makeRequest("Bearer test-secret"))
      expect(res.status).toBe(503)
    })

    it("returns 401 with no authorization header", async () => {
      const GET = await importGET()
      const res = await GET(makeRequest())
      expect(res.status).toBe(401)
    })

    it("returns 401 with wrong secret", async () => {
      const GET = await importGET()
      const res = await GET(makeRequest("Bearer wrong"))
      expect(res.status).toBe(401)
    })
  })

  describe("execution", () => {
    it("does nothing when no tenant has dunning enabled", async () => {
      mockReminderSettingsFindMany.mockResolvedValue([])
      const GET = await importGET()
      const res = await GET(makeRequest("Bearer test-secret"))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.tenantsEnabled).toBe(0)
      expect(body.tenantsNotified).toBe(0)
      expect(body.notificationsCreated).toBe(0)
      expect(mockNotificationCreate).not.toHaveBeenCalled()
    })

    it("skips tenants with no eligible invoices", async () => {
      mockReminderSettingsFindMany.mockResolvedValue([{ tenantId: TENANT_A }])
      mockEligibilityList.mockResolvedValue([])
      const GET = await importGET()
      const res = await GET(makeRequest("Bearer test-secret"))
      const body = await res.json()
      expect(body.tenantsNotified).toBe(0)
      expect(mockUserFindMany).not.toHaveBeenCalled()
    })

    it("creates notifications for admin recipients of tenants with eligible groups", async () => {
      mockReminderSettingsFindMany.mockResolvedValue([{ tenantId: TENANT_A }])
      mockEligibilityList.mockResolvedValue([
        { customerAddressId: "x", groupTargetLevel: 1 },
        { customerAddressId: "y", groupTargetLevel: 2 },
      ])
      mockUserFindMany.mockResolvedValue([adminUserRow(ADMIN_USER)])
      mockNotificationFindFirst.mockResolvedValue(null)
      mockNotificationCreate.mockResolvedValue({ id: "notif-1" })

      const GET = await importGET()
      const res = await GET(makeRequest("Bearer test-secret"))
      const body = await res.json()

      expect(body.tenantsNotified).toBe(1)
      expect(body.notificationsCreated).toBe(1)
      expect(body.totalCustomersAffected).toBe(2)

      expect(mockNotificationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT_A,
            userId: ADMIN_USER,
            type: "reminders",
            link: "/orders/dunning",
          }),
        })
      )
    })

    it("does not create duplicate notifications for the same day", async () => {
      mockReminderSettingsFindMany.mockResolvedValue([{ tenantId: TENANT_A }])
      mockEligibilityList.mockResolvedValue([
        { customerAddressId: "x", groupTargetLevel: 1 },
      ])
      mockUserFindMany.mockResolvedValue([adminUserRow(ADMIN_USER)])
      mockNotificationFindFirst.mockResolvedValue({ id: "existing" })

      const GET = await importGET()
      const res = await GET(makeRequest("Bearer test-secret"))
      const body = await res.json()

      expect(body.tenantsNotified).toBe(0)
      expect(body.notificationsCreated).toBe(0)
      expect(mockNotificationCreate).not.toHaveBeenCalled()
    })

    it("processes multiple tenants independently", async () => {
      mockReminderSettingsFindMany.mockResolvedValue([
        { tenantId: TENANT_A },
        { tenantId: TENANT_B },
      ])
      mockEligibilityList
        .mockResolvedValueOnce([{ customerAddressId: "x", groupTargetLevel: 1 }])
        .mockResolvedValueOnce([])
      mockUserFindMany.mockResolvedValue([adminUserRow(ADMIN_USER)])
      mockNotificationFindFirst.mockResolvedValue(null)
      mockNotificationCreate.mockResolvedValue({ id: "notif" })

      const GET = await importGET()
      const res = await GET(makeRequest("Bearer test-secret"))
      const body = await res.json()

      expect(body.tenantsEnabled).toBe(2)
      expect(body.tenantsNotified).toBe(1)
      expect(body.totalCustomersAffected).toBe(1)
    })

    it("handles eligibility errors per tenant without aborting", async () => {
      mockReminderSettingsFindMany.mockResolvedValue([
        { tenantId: TENANT_A },
        { tenantId: TENANT_B },
      ])
      mockEligibilityList
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce([{ customerAddressId: "x", groupTargetLevel: 1 }])
      mockUserFindMany.mockResolvedValue([adminUserRow(ADMIN_USER)])
      mockNotificationFindFirst.mockResolvedValue(null)
      mockNotificationCreate.mockResolvedValue({ id: "notif" })

      const GET = await importGET()
      const res = await GET(makeRequest("Bearer test-secret"))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.tenantsNotified).toBe(1)
    })
  })
})
