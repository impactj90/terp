import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { bookingTypesRouter } from "../bookingTypes"
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
const BT_ID = "a0000000-0000-4000-a000-000000000900"
const BT_B_ID = "a0000000-0000-4000-a000-000000000901"
const SYSTEM_BT_ID = "a0000000-0000-4000-a000-000000000902"

const createCaller = createCallerFactory(bookingTypesRouter)

// --- Helpers ---

function makeBookingType(
  overrides: Partial<{
    id: string
    tenantId: string | null
    code: string
    name: string
    description: string | null
    direction: string
    category: string
    accountId: string | null
    requiresReason: boolean
    isSystem: boolean
    isActive: boolean
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: BT_ID,
    tenantId: TENANT_ID,
    code: "COME",
    name: "Clock In",
    description: null,
    direction: "in",
    category: "work",
    accountId: null,
    requiresReason: false,
    isSystem: false,
    isActive: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

function makeSystemType(
  overrides: Partial<ReturnType<typeof makeBookingType>> = {}
) {
  return makeBookingType({
    id: SYSTEM_BT_ID,
    tenantId: null,
    code: "SYS_COME",
    name: "System Clock In",
    isSystem: true,
    ...overrides,
  })
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

// --- bookingTypes.list tests ---

describe("bookingTypes.list", () => {
  it("returns types including system types (null tenant)", async () => {
    const types = [makeSystemType(), makeBookingType()]
    const mockPrisma = {
      bookingType: {
        findMany: vi.fn().mockResolvedValue(types),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toHaveLength(2)
    expect(result.data[0]!.isSystem).toBe(true)
    expect(result.data[0]!.tenantId).toBeNull()
    expect(mockPrisma.bookingType.findMany).toHaveBeenCalledWith({
      where: { OR: [{ tenantId: TENANT_ID }, { tenantId: null }] },
      orderBy: [{ isSystem: "desc" }, { code: "asc" }],
    })
  })

  it("filters by isActive when provided", async () => {
    const mockPrisma = {
      bookingType: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ isActive: true })
    expect(mockPrisma.bookingType.findMany).toHaveBeenCalledWith({
      where: {
        OR: [{ tenantId: TENANT_ID }, { tenantId: null }],
        isActive: true,
      },
      orderBy: [{ isSystem: "desc" }, { code: "asc" }],
    })
  })

  it("filters by direction when provided", async () => {
    const mockPrisma = {
      bookingType: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ direction: "in" })
    expect(mockPrisma.bookingType.findMany).toHaveBeenCalledWith({
      where: {
        OR: [{ tenantId: TENANT_ID }, { tenantId: null }],
        direction: "in",
      },
      orderBy: [{ isSystem: "desc" }, { code: "asc" }],
    })
  })
})

// --- bookingTypes.getById tests ---

describe("bookingTypes.getById", () => {
  it("returns type including system type", async () => {
    const systemType = makeSystemType()
    const mockPrisma = {
      bookingType: {
        findFirst: vi.fn().mockResolvedValue(systemType),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: SYSTEM_BT_ID })
    expect(result.id).toBe(SYSTEM_BT_ID)
    expect(result.isSystem).toBe(true)
    expect(result.tenantId).toBeNull()
  })

  it("throws NOT_FOUND for missing type", async () => {
    const mockPrisma = {
      bookingType: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: BT_ID })).rejects.toThrow(
      "Booking type not found"
    )
  })
})

// --- bookingTypes.create tests ---

describe("bookingTypes.create", () => {
  it("creates type successfully", async () => {
    const created = makeBookingType()
    const mockPrisma = {
      bookingType: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "COME",
      name: "Clock In",
      direction: "in",
    })
    expect(result.code).toBe("COME")
    expect(result.isSystem).toBe(false)
    expect(mockPrisma.bookingType.create).toHaveBeenCalled()
  })

  it("validates direction enum", async () => {
    const mockPrisma = {
      bookingType: {},
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "BT", name: "Type", direction: "invalid" })
    ).rejects.toThrow("Direction must be one of: in, out")
  })

  it("validates category enum", async () => {
    const mockPrisma = {
      bookingType: {},
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        code: "BT",
        name: "Type",
        direction: "in",
        category: "invalid",
      })
    ).rejects.toThrow("Category must be one of:")
  })

  it("defaults category to work", async () => {
    const created = makeBookingType({ category: "work" })
    const mockPrisma = {
      bookingType: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({ code: "BT", name: "Type", direction: "in" })
    const createCall = mockPrisma.bookingType.create.mock.calls[0]![0]
    expect(createCall.data.category).toBe("work")
  })

  it("rejects duplicate code with CONFLICT", async () => {
    const mockPrisma = {
      bookingType: {
        findFirst: vi.fn().mockResolvedValue(makeBookingType()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "COME", name: "Clock In", direction: "in" })
    ).rejects.toThrow("Booking type code already exists")
  })

  it("sets isSystem false", async () => {
    const created = makeBookingType({ isSystem: false })
    const mockPrisma = {
      bookingType: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({ code: "BT", name: "Type", direction: "in" })
    const createCall = mockPrisma.bookingType.create.mock.calls[0]![0]
    expect(createCall.data.isSystem).toBe(false)
  })

  it("trims whitespace from code, name", async () => {
    const created = makeBookingType()
    const mockPrisma = {
      bookingType: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      code: "  COME  ",
      name: "  Clock In  ",
      direction: "in",
    })
    const createCall = mockPrisma.bookingType.create.mock.calls[0]![0]
    expect(createCall.data.code).toBe("COME")
    expect(createCall.data.name).toBe("Clock In")
  })
})

// --- bookingTypes.update tests ---

describe("bookingTypes.update", () => {
  it("updates fields", async () => {
    const existing = makeBookingType()
    const updated = makeBookingType({ name: "Updated", category: "break" })
    const mockPrisma = {
      bookingType: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: BT_ID,
      name: "Updated",
      category: "break",
    })
    expect(result.name).toBe("Updated")
    expect(result.category).toBe("break")
  })

  it("blocks modification of system types", async () => {
    const systemType = makeSystemType()
    const mockPrisma = {
      bookingType: {
        findFirst: vi.fn().mockResolvedValue(systemType),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: SYSTEM_BT_ID, name: "Modified" })
    ).rejects.toThrow("Cannot modify system booking types")
  })

  it("throws NOT_FOUND for missing type", async () => {
    const mockPrisma = {
      bookingType: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: BT_ID, name: "Updated" })
    ).rejects.toThrow("Booking type not found")
  })
})

// --- bookingTypes.delete tests ---

describe("bookingTypes.delete", () => {
  it("deletes type successfully", async () => {
    const existing = makeBookingType()
    const mockPrisma = {
      bookingType: {
        findFirst: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(existing),
      },
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ count: 0 }]),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: BT_ID })
    expect(result.success).toBe(true)
    expect(mockPrisma.bookingType.delete).toHaveBeenCalledWith({
      where: { id: BT_ID },
    })
  })

  it("blocks deletion of system types", async () => {
    const systemType = makeSystemType()
    const mockPrisma = {
      bookingType: {
        findFirst: vi.fn().mockResolvedValue(systemType),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: SYSTEM_BT_ID })).rejects.toThrow(
      "Cannot delete system booking types"
    )
  })

  it("rejects deletion when bookings reference it", async () => {
    const existing = makeBookingType()
    const mockPrisma = {
      bookingType: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ count: 5 }]),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: BT_ID })).rejects.toThrow(
      "Cannot delete booking type that is in use"
    )
  })

  it("throws NOT_FOUND for missing type", async () => {
    const mockPrisma = {
      bookingType: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: BT_ID })).rejects.toThrow(
      "Booking type not found"
    )
  })
})
