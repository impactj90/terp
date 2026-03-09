import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { systemSettingsRouter } from "../systemSettings"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
  createMockUser,
} from "./helpers"

// --- Constants ---

const SETTINGS_MANAGE = permissionIdByKey("settings.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const SETTINGS_ID = "a0000000-0000-4000-a000-000000000800"
const ORDER_ID_1 = "a0000000-0000-4000-a000-000000000901"
const ORDER_ID_2 = "a0000000-0000-4000-a000-000000000902"

const createCaller = createCallerFactory(systemSettingsRouter)

// --- Helpers ---

function makeSettings(
  overrides: Partial<{
    id: string
    tenantId: string
    roundingRelativeToPlan: boolean
    errorListEnabled: boolean
    trackedErrorCodes: string[]
    autoFillOrderEndBookings: boolean
    birthdayWindowDaysBefore: number
    birthdayWindowDaysAfter: number
    followUpEntriesEnabled: boolean
    proxyHost: string | null
    proxyPort: number | null
    proxyUsername: string | null
    proxyPassword: string | null
    proxyEnabled: boolean
    serverAliveEnabled: boolean
    serverAliveExpectedCompletionTime: number | null
    serverAliveThresholdMinutes: number | null
    serverAliveNotifyAdmins: boolean
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: SETTINGS_ID,
    tenantId: TENANT_ID,
    roundingRelativeToPlan: false,
    errorListEnabled: true,
    trackedErrorCodes: [],
    autoFillOrderEndBookings: false,
    birthdayWindowDaysBefore: 7,
    birthdayWindowDaysAfter: 7,
    followUpEntriesEnabled: false,
    proxyHost: null,
    proxyPort: null,
    proxyUsername: null,
    proxyPassword: null,
    proxyEnabled: false,
    serverAliveEnabled: false,
    serverAliveExpectedCompletionTime: null,
    serverAliveThresholdMinutes: 30,
    serverAliveNotifyAdmins: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([SETTINGS_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

function createNoPermContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- systemSettings.get tests ---

describe("systemSettings.get", () => {
  it("returns existing settings", async () => {
    const settings = makeSettings()
    const mockPrisma = {
      systemSetting: {
        findUnique: vi.fn().mockResolvedValue(settings),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.get()

    expect(result.id).toBe(SETTINGS_ID)
    expect(result.tenantId).toBe(TENANT_ID)
    expect(result.roundingRelativeToPlan).toBe(false)
    expect(result.errorListEnabled).toBe(true)
    expect(result.birthdayWindowDaysBefore).toBe(7)
    // proxyPassword should not be in output
    expect("proxyPassword" in result).toBe(false)
  })

  it("creates defaults when no settings exist", async () => {
    const newSettings = makeSettings()
    const mockPrisma = {
      systemSetting: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(newSettings),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.get()

    expect(result.id).toBe(SETTINGS_ID)
    expect(mockPrisma.systemSetting.findUnique).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID },
    })
    expect(mockPrisma.systemSetting.create).toHaveBeenCalledWith({
      data: { tenantId: TENANT_ID },
    })
  })

  it("denies access without settings.manage permission", async () => {
    const mockPrisma = {
      systemSetting: {
        findUnique: vi.fn().mockResolvedValue(makeSettings()),
      },
    }
    const caller = createCaller(createNoPermContext(mockPrisma))
    await expect(caller.get()).rejects.toThrow("Insufficient permissions")
  })
})

// --- systemSettings.update tests ---

describe("systemSettings.update", () => {
  it("partial update succeeds", async () => {
    const existing = makeSettings()
    const updated = makeSettings({
      roundingRelativeToPlan: true,
      birthdayWindowDaysBefore: 14,
    })
    const mockPrisma = {
      systemSetting: {
        findUnique: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      roundingRelativeToPlan: true,
      birthdayWindowDaysBefore: 14,
    })

    expect(result.roundingRelativeToPlan).toBe(true)
    expect(result.birthdayWindowDaysBefore).toBe(14)
    expect(mockPrisma.systemSetting.update).toHaveBeenCalledWith({
      where: { id: SETTINGS_ID },
      data: {
        roundingRelativeToPlan: true,
        birthdayWindowDaysBefore: 14,
      },
    })
  })

  it("validates birthday window range (0-90)", async () => {
    const mockPrisma = {
      systemSetting: {
        findUnique: vi.fn().mockResolvedValue(makeSettings()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ birthdayWindowDaysBefore: 91 })
    ).rejects.toThrow()
    await expect(
      caller.update({ birthdayWindowDaysAfter: -1 })
    ).rejects.toThrow()
  })

  it("validates server alive time range (0-1439)", async () => {
    const mockPrisma = {
      systemSetting: {
        findUnique: vi.fn().mockResolvedValue(makeSettings()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ serverAliveExpectedCompletionTime: 1440 })
    ).rejects.toThrow()
  })

  it("validates server alive threshold > 0", async () => {
    const mockPrisma = {
      systemSetting: {
        findUnique: vi.fn().mockResolvedValue(makeSettings()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ serverAliveThresholdMinutes: 0 })
    ).rejects.toThrow()
  })
})

// --- systemSettings.cleanupMarkDeleteOrders tests ---

describe("systemSettings.cleanupMarkDeleteOrders", () => {
  it("preview returns count", async () => {
    const mockPrisma = {
      order: {
        count: vi.fn().mockResolvedValue(3),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.cleanupMarkDeleteOrders({
      orderIds: [ORDER_ID_1, ORDER_ID_2],
      confirm: false,
    })

    expect(result.operation).toBe("mark_delete_orders")
    expect(result.affectedCount).toBe(3)
    expect(result.preview).toBe(true)
    expect(mockPrisma.order.count).toHaveBeenCalledWith({
      where: {
        id: { in: [ORDER_ID_1, ORDER_ID_2] },
        tenantId: TENANT_ID,
      },
    })
  })

  it("execute deletes orders", async () => {
    const mockPrisma = {
      order: {
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.cleanupMarkDeleteOrders({
      orderIds: [ORDER_ID_1, ORDER_ID_2],
      confirm: true,
    })

    expect(result.operation).toBe("mark_delete_orders")
    expect(result.affectedCount).toBe(2)
    expect(result.preview).toBe(false)
    expect(mockPrisma.order.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: [ORDER_ID_1, ORDER_ID_2] },
        tenantId: TENANT_ID,
      },
    })
  })

  it("fails without order IDs", async () => {
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.cleanupMarkDeleteOrders({ orderIds: [], confirm: false })
    ).rejects.toThrow()
  })
})

// --- systemSettings.cleanupDeleteBookings tests ---

describe("systemSettings.cleanupDeleteBookings", () => {
  it("preview returns count", async () => {
    const mockPrisma = {
      booking: {
        count: vi.fn().mockResolvedValue(42),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.cleanupDeleteBookings({
      dateFrom: "2025-01-01",
      dateTo: "2025-03-01",
      confirm: false,
    })

    expect(result.operation).toBe("delete_bookings")
    expect(result.affectedCount).toBe(42)
    expect(result.preview).toBe(true)
    expect(mockPrisma.booking.count).toHaveBeenCalled()
  })

  it("execute deletes bookings", async () => {
    const mockPrisma = {
      booking: {
        deleteMany: vi.fn().mockResolvedValue({ count: 42 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.cleanupDeleteBookings({
      dateFrom: "2025-01-01",
      dateTo: "2025-03-01",
      confirm: true,
    })

    expect(result.operation).toBe("delete_bookings")
    expect(result.affectedCount).toBe(42)
    expect(result.preview).toBe(false)
  })

  it("validates date range (dateFrom > dateTo)", async () => {
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.cleanupDeleteBookings({
        dateFrom: "2025-06-01",
        dateTo: "2025-01-01",
        confirm: false,
      })
    ).rejects.toThrow("dateFrom must be before or equal to dateTo")
  })

  it("validates date range (> 366 days)", async () => {
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.cleanupDeleteBookings({
        dateFrom: "2024-01-01",
        dateTo: "2026-01-01",
        confirm: false,
      })
    ).rejects.toThrow("Date range must not exceed 366 days")
  })
})

// --- systemSettings.cleanupReReadBookings tests ---

describe("systemSettings.cleanupReReadBookings", () => {
  it("preview returns count", async () => {
    const mockPrisma = {
      booking: {
        count: vi.fn().mockResolvedValue(10),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.cleanupReReadBookings({
      dateFrom: "2025-01-01",
      dateTo: "2025-02-01",
      confirm: false,
    })

    expect(result.operation).toBe("re_read_bookings")
    expect(result.affectedCount).toBe(10)
    expect(result.preview).toBe(true)
  })

  it("execute recalculates all active employees when no employeeIds", async () => {
    const mockPrisma = {
      employee: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.cleanupReReadBookings({
      dateFrom: "2025-01-01",
      dateTo: "2025-02-01",
      confirm: true,
    })

    expect(result.operation).toBe("re_read_bookings")
    expect(result.affectedCount).toBe(0)
    expect(result.preview).toBe(false)
    expect(mockPrisma.employee.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT_ID,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    })
  })
})

// --- systemSettings.cleanupDeleteBookingData tests ---

describe("systemSettings.cleanupDeleteBookingData", () => {
  it("preview returns combined count", async () => {
    const mockPrisma = {
      booking: {
        count: vi.fn().mockResolvedValue(10),
      },
      dailyValue: {
        count: vi.fn().mockResolvedValue(5),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.cleanupDeleteBookingData({
      dateFrom: "2025-01-01",
      dateTo: "2025-02-01",
      confirm: false,
    })

    expect(result.operation).toBe("delete_booking_data")
    expect(result.affectedCount).toBe(15)
    expect(result.preview).toBe(true)
    expect(result.details).toEqual({
      bookings: 10,
      dailyValues: 5,
    })
  })

  it("execute deletes all three entity types", async () => {
    const mockPrisma = {
      booking: {
        deleteMany: vi.fn().mockResolvedValue({ count: 10 }),
      },
      dailyValue: {
        deleteMany: vi.fn().mockResolvedValue({ count: 5 }),
      },
      employeeDayPlan: {
        deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.cleanupDeleteBookingData({
      dateFrom: "2025-01-01",
      dateTo: "2025-02-01",
      confirm: true,
    })

    expect(result.operation).toBe("delete_booking_data")
    expect(result.affectedCount).toBe(18)
    expect(result.preview).toBe(false)
    expect(result.details).toEqual({
      bookings: 10,
      dailyValues: 5,
      employeeDayPlans: 3,
    })
  })
})
