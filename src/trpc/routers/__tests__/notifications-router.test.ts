import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { notificationsRouter } from "../notifications"
import {
  createMockContext,
  createMockSession,
  createMockUser,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const OTHER_USER_ID = "a0000000-0000-4000-a000-000000000099"
const NOTIFICATION_ID = "a0000000-0000-4000-a000-000000000820"
const NOTIFICATION_ID_2 = "a0000000-0000-4000-a000-000000000821"
const PREF_ID = "a0000000-0000-4000-a000-000000000830"

const createCaller = createCallerFactory(notificationsRouter)

// --- Helpers ---

function makeNotification(
  overrides: Partial<{
    id: string
    tenantId: string
    userId: string
    type: string
    title: string
    message: string
    link: string | null
    readAt: Date | null
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: NOTIFICATION_ID,
    tenantId: TENANT_ID,
    userId: USER_ID,
    type: "approvals",
    title: "Absence approved",
    message: "Your absence request has been approved.",
    link: null,
    readAt: null,
    createdAt: new Date("2025-02-15T10:30:00Z"),
    updatedAt: new Date("2025-02-15T10:30:00Z"),
    ...overrides,
  }
}

function makePreferences(
  overrides: Partial<{
    id: string
    tenantId: string
    userId: string
    approvalsEnabled: boolean
    errorsEnabled: boolean
    remindersEnabled: boolean
    systemEnabled: boolean
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: PREF_ID,
    tenantId: TENANT_ID,
    userId: USER_ID,
    approvalsEnabled: true,
    errorsEnabled: true,
    remindersEnabled: true,
    systemEnabled: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createMockUser({
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- notifications.list tests ---

describe("notifications.list", () => {
  it("returns user-scoped notifications with total and unreadCount", async () => {
    const notifications = [
      makeNotification(),
      makeNotification({ id: NOTIFICATION_ID_2, readAt: new Date() }),
    ]
    const mockPrisma = {
      notification: {
        findMany: vi.fn().mockResolvedValue(notifications),
        count: vi
          .fn()
          .mockResolvedValueOnce(2) // total
          .mockResolvedValueOnce(1), // unreadCount
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()

    expect(result.items).toHaveLength(2)
    expect(result.total).toBe(2)
    expect(result.unreadCount).toBe(1)

    // Verify user-scoping
    expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_ID, userId: USER_ID },
      })
    )
  })

  it("filters by type", async () => {
    const mockPrisma = {
      notification: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ type: "errors" })

    expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_ID, userId: USER_ID, type: "errors" },
      })
    )
  })

  it("filters by unread status (unread: true)", async () => {
    const mockPrisma = {
      notification: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ unread: true })

    expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_ID, userId: USER_ID, readAt: null },
      })
    )
  })

  it("filters by unread status (unread: false)", async () => {
    const mockPrisma = {
      notification: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ unread: false })

    expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: TENANT_ID,
          userId: USER_ID,
          readAt: { not: null },
        },
      })
    )
  })
})

// --- notifications.markRead tests ---

describe("notifications.markRead", () => {
  it("sets readAt on notification", async () => {
    const notification = makeNotification()
    const mockPrisma = {
      notification: {
        findFirst: vi.fn().mockResolvedValue(notification),
        update: vi.fn().mockResolvedValue({ ...notification, readAt: new Date() }),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.markRead({ id: NOTIFICATION_ID })

    expect(result.success).toBe(true)
    expect(mockPrisma.notification.findFirst).toHaveBeenCalledWith({
      where: { id: NOTIFICATION_ID, tenantId: TENANT_ID, userId: USER_ID },
    })
    expect(mockPrisma.notification.update).toHaveBeenCalledWith({
      where: { id: NOTIFICATION_ID },
      data: { readAt: expect.any(Date) },
    })
  })

  it("throws NOT_FOUND for wrong user's notification", async () => {
    const mockPrisma = {
      notification: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.markRead({ id: NOTIFICATION_ID })
    ).rejects.toThrow("Notification not found")
  })
})

// --- notifications.markAllRead tests ---

describe("notifications.markAllRead", () => {
  it("updates all unread to read", async () => {
    const mockPrisma = {
      notification: {
        updateMany: vi.fn().mockResolvedValue({ count: 5 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.markAllRead()

    expect(result.success).toBe(true)
    expect(result.count).toBe(5)
    expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, userId: USER_ID, readAt: null },
      data: { readAt: expect.any(Date) },
    })
  })
})

// --- notifications.preferences tests ---

describe("notifications.preferences", () => {
  it("returns existing preferences", async () => {
    const prefs = makePreferences()
    const mockPrisma = {
      notificationPreference: {
        findUnique: vi.fn().mockResolvedValue(prefs),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.preferences()

    expect(result.id).toBe(PREF_ID)
    expect(result.approvalsEnabled).toBe(true)
    expect(result.errorsEnabled).toBe(true)
    expect(result.remindersEnabled).toBe(true)
    expect(result.systemEnabled).toBe(true)
  })

  it("creates defaults when none exist", async () => {
    const newPrefs = makePreferences()
    const mockPrisma = {
      notificationPreference: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(newPrefs),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.preferences()

    expect(result.id).toBe(PREF_ID)
    expect(mockPrisma.notificationPreference.findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_userId: { tenantId: TENANT_ID, userId: USER_ID },
      },
    })
    expect(mockPrisma.notificationPreference.create).toHaveBeenCalledWith({
      data: { tenantId: TENANT_ID, userId: USER_ID },
    })
  })
})

// --- notifications.updatePreferences tests ---

describe("notifications.updatePreferences", () => {
  it("upserts preferences", async () => {
    const updated = makePreferences({
      approvalsEnabled: false,
      systemEnabled: false,
    })
    const mockPrisma = {
      notificationPreference: {
        upsert: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.updatePreferences({
      approvalsEnabled: false,
      systemEnabled: false,
    })

    expect(result.approvalsEnabled).toBe(false)
    expect(result.systemEnabled).toBe(false)
    expect(mockPrisma.notificationPreference.upsert).toHaveBeenCalledWith({
      where: {
        tenantId_userId: { tenantId: TENANT_ID, userId: USER_ID },
      },
      update: { approvalsEnabled: false, systemEnabled: false },
      create: {
        tenantId: TENANT_ID,
        userId: USER_ID,
        approvalsEnabled: false,
        systemEnabled: false,
      },
    })
  })
})

// --- Authentication test ---

describe("authentication", () => {
  it("throws UNAUTHORIZED for unauthenticated request", async () => {
    const mockPrisma = {}
    const ctx = createMockContext({
      prisma: mockPrisma as unknown as ReturnType<typeof createMockContext>["prisma"],
      authToken: null,
      user: null,
      session: null,
      tenantId: TENANT_ID,
    })
    const caller = createCaller(ctx)
    await expect(caller.list()).rejects.toThrow("Authentication required")
  })
})
