import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { bookingReasonsRouter } from "../bookingReasons"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const BOOKING_TYPES_MANAGE = permissionIdByKey("booking_types.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const REASON_ID = "a0000000-0000-4000-a000-000000001000"
const REASON_B_ID = "a0000000-0000-4000-a000-000000001001"
const BT_ID = "a0000000-0000-4000-a000-000000000900"
const ADJ_BT_ID = "a0000000-0000-4000-a000-000000000901"

const createCaller = createCallerFactory(bookingReasonsRouter)

// --- Helpers ---

function makeReason(
  overrides: Partial<{
    id: string
    tenantId: string
    bookingTypeId: string
    code: string
    label: string
    isActive: boolean
    sortOrder: number
    referenceTime: string | null
    offsetMinutes: number | null
    adjustmentBookingTypeId: string | null
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: REASON_ID,
    tenantId: TENANT_ID,
    bookingTypeId: BT_ID,
    code: "LATE",
    label: "Late Arrival",
    isActive: true,
    sortOrder: 0,
    referenceTime: null,
    offsetMinutes: null,
    adjustmentBookingTypeId: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([BOOKING_TYPES_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- bookingReasons.list tests ---

describe("bookingReasons.list", () => {
  it("returns reasons for tenant", async () => {
    const reasons = [
      makeReason({ id: REASON_ID, code: "LATE" }),
      makeReason({ id: REASON_B_ID, code: "EARLY", label: "Early Departure" }),
    ]
    const mockPrisma = {
      bookingReason: {
        findMany: vi.fn().mockResolvedValue(reasons),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toHaveLength(2)
    expect(result.data[0]!.code).toBe("LATE")
    expect(mockPrisma.bookingReason.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    })
  })

  it("filters by bookingTypeId when provided", async () => {
    const mockPrisma = {
      bookingReason: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ bookingTypeId: BT_ID })
    expect(mockPrisma.bookingReason.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, bookingTypeId: BT_ID },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    })
  })
})

// --- bookingReasons.getById tests ---

describe("bookingReasons.getById", () => {
  it("returns reason when found", async () => {
    const reason = makeReason()
    const mockPrisma = {
      bookingReason: {
        findFirst: vi.fn().mockResolvedValue(reason),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: REASON_ID })
    expect(result.id).toBe(REASON_ID)
    expect(result.code).toBe("LATE")
  })

  it("throws NOT_FOUND for missing reason", async () => {
    const mockPrisma = {
      bookingReason: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: REASON_ID })).rejects.toThrow(
      "Booking reason not found"
    )
  })
})

// --- bookingReasons.create tests ---

describe("bookingReasons.create", () => {
  it("creates reason successfully", async () => {
    const created = makeReason()
    const mockPrisma = {
      bookingReason: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      bookingTypeId: BT_ID,
      code: "LATE",
      label: "Late Arrival",
    })
    expect(result.code).toBe("LATE")
    expect(result.bookingTypeId).toBe(BT_ID)
  })

  it("checks code uniqueness within (tenantId, bookingTypeId)", async () => {
    const existing = makeReason()
    const mockPrisma = {
      bookingReason: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        bookingTypeId: BT_ID,
        code: "LATE",
        label: "Late Arrival",
      })
    ).rejects.toThrow(
      "Booking reason code already exists for this booking type"
    )
    expect(mockPrisma.bookingReason.findFirst).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, bookingTypeId: BT_ID, code: "LATE" },
    })
  })

  it("validates adjustment consistency (reference_time without offset_minutes)", async () => {
    const mockPrisma = {
      bookingReason: {},
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        bookingTypeId: BT_ID,
        code: "ADJ",
        label: "Adjusted",
        referenceTime: "plan_start",
      })
    ).rejects.toThrow(
      "reference_time and offset_minutes must both be set or both be null"
    )
  })

  it("validates reference_time enum", async () => {
    const mockPrisma = {
      bookingReason: {},
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        bookingTypeId: BT_ID,
        code: "ADJ",
        label: "Adjusted",
        referenceTime: "invalid",
        offsetMinutes: 30,
      })
    ).rejects.toThrow("reference_time must be one of:")
  })

  it("creates with valid adjustment fields", async () => {
    const created = makeReason({
      referenceTime: "plan_start",
      offsetMinutes: 30,
      adjustmentBookingTypeId: ADJ_BT_ID,
    })
    const mockPrisma = {
      bookingReason: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      bookingTypeId: BT_ID,
      code: "ADJ",
      label: "Adjusted",
      referenceTime: "plan_start",
      offsetMinutes: 30,
      adjustmentBookingTypeId: ADJ_BT_ID,
    })
    expect(result.referenceTime).toBe("plan_start")
    expect(result.offsetMinutes).toBe(30)
  })
})

// --- bookingReasons.update tests ---

describe("bookingReasons.update", () => {
  it("updates label, sortOrder, isActive", async () => {
    const existing = makeReason()
    const updated = makeReason({
      label: "Updated",
      sortOrder: 5,
      isActive: false,
    })
    const mockPrisma = {
      bookingReason: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(updated),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: REASON_ID,
      label: "Updated",
      sortOrder: 5,
      isActive: false,
    })
    expect(result.label).toBe("Updated")
    expect(result.sortOrder).toBe(5)
    expect(result.isActive).toBe(false)
  })

  it("handles clearAdjustment flag", async () => {
    const existing = makeReason({
      referenceTime: "plan_start",
      offsetMinutes: 30,
      adjustmentBookingTypeId: ADJ_BT_ID,
    })
    const updated = makeReason({
      referenceTime: null,
      offsetMinutes: null,
      adjustmentBookingTypeId: null,
    })
    const mockPrisma = {
      bookingReason: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(updated),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: REASON_ID,
      clearAdjustment: true,
    })
    expect(result.referenceTime).toBeNull()
    expect(result.offsetMinutes).toBeNull()
    expect(result.adjustmentBookingTypeId).toBeNull()
    const updateCall = mockPrisma.bookingReason.updateMany.mock.calls[0]![0]
    expect(updateCall.data.referenceTime).toBeNull()
    expect(updateCall.data.offsetMinutes).toBeNull()
    expect(updateCall.data.adjustmentBookingTypeId).toBeNull()
  })

  it("validates adjustment consistency after update", async () => {
    // Existing has referenceTime set, update clears offsetMinutes only
    const existing = makeReason({
      referenceTime: "plan_start",
      offsetMinutes: 30,
    })
    const mockPrisma = {
      bookingReason: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({
        id: REASON_ID,
        offsetMinutes: null,
      })
    ).rejects.toThrow(
      "reference_time and offset_minutes must both be set or both be null"
    )
  })

  it("throws NOT_FOUND for missing reason", async () => {
    const mockPrisma = {
      bookingReason: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: REASON_ID, label: "Updated" })
    ).rejects.toThrow("Booking reason not found")
  })
})

// --- bookingReasons.delete tests ---

describe("bookingReasons.delete", () => {
  it("deletes reason successfully", async () => {
    const existing = makeReason()
    const mockPrisma = {
      bookingReason: {
        findFirst: vi.fn().mockResolvedValue(existing),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: REASON_ID })
    expect(result.success).toBe(true)
    expect(mockPrisma.bookingReason.deleteMany).toHaveBeenCalledWith({
      where: { id: REASON_ID, tenantId: TENANT_ID },
    })
  })

  it("throws NOT_FOUND for missing reason", async () => {
    const mockPrisma = {
      bookingReason: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: REASON_ID })).rejects.toThrow(
      "Booking reason not found"
    )
  })
})
