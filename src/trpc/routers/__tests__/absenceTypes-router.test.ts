import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { absenceTypesRouter } from "../absenceTypes"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const ABSENCE_TYPES_MANAGE = permissionIdByKey("absence_types.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const TYPE_ID = "a0000000-0000-4000-a000-000000000900"
const TYPE_B_ID = "a0000000-0000-4000-a000-000000000901"

const createCaller = createCallerFactory(absenceTypesRouter)

// --- Helpers ---

function makeAbsenceType(
  overrides: Partial<{
    id: string
    tenantId: string | null
    code: string
    name: string
    description: string | null
    category: string
    portion: number
    holidayCode: string | null
    priority: number
    deductsVacation: boolean
    requiresApproval: boolean
    requiresDocument: boolean
    color: string
    sortOrder: number
    isSystem: boolean
    isActive: boolean
    absenceTypeGroupId: string | null
    calculationRuleId: string | null
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: TYPE_ID,
    tenantId: TENANT_ID,
    code: "U01",
    name: "Custom Vacation",
    description: null,
    category: "vacation",
    portion: 1,
    holidayCode: null,
    priority: 0,
    deductsVacation: true,
    requiresApproval: true,
    requiresDocument: false,
    color: "#4CAF50",
    sortOrder: 1,
    isSystem: false,
    isActive: true,
    absenceTypeGroupId: null,
    calculationRuleId: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([ABSENCE_TYPES_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- absenceTypes.list tests ---

describe("absenceTypes.list", () => {
  it("returns types for tenant (including system types)", async () => {
    const types = [
      makeAbsenceType({ id: TYPE_ID, code: "U01" }),
      makeAbsenceType({
        id: TYPE_B_ID,
        tenantId: null,
        code: "K01",
        name: "System Sick Leave",
        category: "illness",
        isSystem: true,
      }),
    ]
    const mockPrisma = {
      absenceType: {
        findMany: vi.fn().mockResolvedValue(types),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toHaveLength(2)
    expect(result.data[0]!.code).toBe("U01")
    expect(result.data[1]!.isSystem).toBe(true)
    expect(mockPrisma.absenceType.findMany).toHaveBeenCalledWith({
      where: { OR: [{ tenantId: TENANT_ID }, { tenantId: null }] },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    })
  })

  it("filters by isActive when provided", async () => {
    const mockPrisma = {
      absenceType: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ isActive: true })
    expect(mockPrisma.absenceType.findMany).toHaveBeenCalledWith({
      where: {
        OR: [{ tenantId: TENANT_ID }, { tenantId: null }],
        isActive: true,
      },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    })
  })

  it("filters by category when provided", async () => {
    const mockPrisma = {
      absenceType: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ category: "vacation" })
    expect(mockPrisma.absenceType.findMany).toHaveBeenCalledWith({
      where: {
        OR: [{ tenantId: TENANT_ID }, { tenantId: null }],
        category: "vacation",
      },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    })
  })

  it("excludes system types when includeSystem is false", async () => {
    const mockPrisma = {
      absenceType: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ includeSystem: false })
    expect(mockPrisma.absenceType.findMany).toHaveBeenCalledWith({
      where: {
        OR: [{ tenantId: TENANT_ID }, { tenantId: null }],
        isSystem: false,
      },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    })
  })

  it("returns empty array when no types", async () => {
    const mockPrisma = {
      absenceType: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toEqual([])
  })
})

// --- absenceTypes.getById tests ---

describe("absenceTypes.getById", () => {
  it("returns type when found (tenant-owned)", async () => {
    const type = makeAbsenceType()
    const mockPrisma = {
      absenceType: {
        findFirst: vi.fn().mockResolvedValue(type),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: TYPE_ID })
    expect(result.id).toBe(TYPE_ID)
    expect(result.code).toBe("U01")
  })

  it("returns system type (tenantId: null)", async () => {
    const systemType = makeAbsenceType({
      tenantId: null,
      isSystem: true,
      code: "K01",
    })
    const mockPrisma = {
      absenceType: {
        findFirst: vi.fn().mockResolvedValue(systemType),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: TYPE_ID })
    expect(result.tenantId).toBeNull()
    expect(result.isSystem).toBe(true)
    expect(mockPrisma.absenceType.findFirst).toHaveBeenCalledWith({
      where: {
        id: TYPE_ID,
        OR: [{ tenantId: TENANT_ID }, { tenantId: null }],
      },
    })
  })

  it("throws NOT_FOUND for missing type", async () => {
    const mockPrisma = {
      absenceType: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: TYPE_ID })).rejects.toThrow(
      "Absence type not found"
    )
  })
})

// --- absenceTypes.create tests ---

describe("absenceTypes.create", () => {
  it("creates type successfully", async () => {
    const created = makeAbsenceType()
    const mockPrisma = {
      absenceType: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "U01",
      name: "Custom Vacation",
      category: "vacation",
    })
    expect(result.code).toBe("U01")
    expect(result.isSystem).toBe(false)
    expect(mockPrisma.absenceType.create).toHaveBeenCalled()
  })

  it("trims whitespace from code, name, description", async () => {
    const created = makeAbsenceType({ description: "Some desc" })
    const mockPrisma = {
      absenceType: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      code: "  U01  ",
      name: "  Custom Vacation  ",
      description: "  Some desc  ",
      category: "vacation",
    })
    const createCall = mockPrisma.absenceType.create.mock.calls[0]![0]
    expect(createCall.data.code).toBe("U01")
    expect(createCall.data.name).toBe("Custom Vacation")
    expect(createCall.data.description).toBe("Some desc")
  })

  it("rejects empty code with BAD_REQUEST", async () => {
    const mockPrisma = {
      absenceType: {},
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "   ", name: "Type", category: "vacation" })
    ).rejects.toThrow("Absence type code is required")
  })

  it("rejects empty name with BAD_REQUEST", async () => {
    const mockPrisma = {
      absenceType: {},
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "U01", name: "   ", category: "vacation" })
    ).rejects.toThrow("Absence type name is required")
  })

  it("rejects duplicate code with CONFLICT", async () => {
    const mockPrisma = {
      absenceType: {
        findFirst: vi.fn().mockResolvedValue(makeAbsenceType()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "U01", name: "Type", category: "vacation" })
    ).rejects.toThrow("Absence type code already exists")
  })

  it("validates code prefix matches category (U for vacation)", async () => {
    const mockPrisma = {
      absenceType: {},
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "K01", name: "Type", category: "vacation" })
    ).rejects.toThrow("Code must start with 'U' for category 'vacation'")
  })

  it("validates code prefix matches category (K for illness)", async () => {
    const mockPrisma = {
      absenceType: {},
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "U01", name: "Type", category: "illness" })
    ).rejects.toThrow("Code must start with 'K' for category 'illness'")
  })

  it("validates code prefix matches category (S for special)", async () => {
    const mockPrisma = {
      absenceType: {},
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "U01", name: "Type", category: "special" })
    ).rejects.toThrow("Code must start with 'S' for category 'special'")
  })

  it("forces isSystem to false", async () => {
    const created = makeAbsenceType({ isSystem: false })
    const mockPrisma = {
      absenceType: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      code: "U01",
      name: "Custom Vacation",
      category: "vacation",
    })
    const createCall = mockPrisma.absenceType.create.mock.calls[0]![0]
    expect(createCall.data.isSystem).toBe(false)
  })

  it("sets default values for optional fields", async () => {
    const created = makeAbsenceType()
    const mockPrisma = {
      absenceType: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      code: "U01",
      name: "Custom Vacation",
      category: "vacation",
    })
    const createCall = mockPrisma.absenceType.create.mock.calls[0]![0]
    expect(createCall.data.portion).toBe(1)
    expect(createCall.data.priority).toBe(0)
    expect(createCall.data.deductsVacation).toBe(false)
    expect(createCall.data.requiresApproval).toBe(true)
    expect(createCall.data.requiresDocument).toBe(false)
    expect(createCall.data.color).toBe("#808080")
    expect(createCall.data.sortOrder).toBe(0)
    expect(createCall.data.isActive).toBe(true)
  })
})

// --- absenceTypes.update tests ---

describe("absenceTypes.update", () => {
  it("updates name and description", async () => {
    const existing = makeAbsenceType()
    const updated = makeAbsenceType({ name: "Updated", description: "New desc" })
    const mockPrisma = {
      absenceType: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: TYPE_ID,
      name: "Updated",
      description: "New desc",
    })
    expect(result.name).toBe("Updated")
  })

  it("blocks modification of system types", async () => {
    const systemType = makeAbsenceType({ isSystem: true, tenantId: null })
    const mockPrisma = {
      absenceType: {
        findFirst: vi.fn().mockResolvedValue(systemType),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: TYPE_ID, name: "Updated" })
    ).rejects.toThrow("Cannot modify system absence type")
  })

  it("throws NOT_FOUND for missing type", async () => {
    const mockPrisma = {
      absenceType: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: TYPE_ID, name: "Updated" })
    ).rejects.toThrow("Absence type not found")
  })

  it("supports partial updates (only changes provided fields)", async () => {
    const existing = makeAbsenceType()
    const updated = makeAbsenceType({ name: "Updated" })
    const mockPrisma = {
      absenceType: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.update({ id: TYPE_ID, name: "Updated" })
    const updateCall = mockPrisma.absenceType.update.mock.calls[0]![0]
    expect(updateCall.data.name).toBe("Updated")
    // Other fields should not be in the data
    expect(updateCall.data.category).toBeUndefined()
    expect(updateCall.data.color).toBeUndefined()
  })

  it("can set isActive to false", async () => {
    const existing = makeAbsenceType({ isActive: true })
    const updated = makeAbsenceType({ isActive: false })
    const mockPrisma = {
      absenceType: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: TYPE_ID, isActive: false })
    expect(result.isActive).toBe(false)
    const updateCall = mockPrisma.absenceType.update.mock.calls[0]![0]
    expect(updateCall.data.isActive).toBe(false)
  })

  it("can set nullable fields to null", async () => {
    const existing = makeAbsenceType({ description: "Some desc" })
    const updated = makeAbsenceType({ description: null })
    const mockPrisma = {
      absenceType: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: TYPE_ID,
      description: null,
    })
    expect(result.description).toBeNull()
    const updateCall = mockPrisma.absenceType.update.mock.calls[0]![0]
    expect(updateCall.data.description).toBeNull()
  })

  it("validates code prefix if category changes", async () => {
    // code is "U01" -- changing category to "illness" should fail because U != K
    const existing = makeAbsenceType({ code: "U01", category: "vacation" })
    const mockPrisma = {
      absenceType: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: TYPE_ID, category: "illness" })
    ).rejects.toThrow(
      "Code 'U01' does not match prefix 'K' for category 'illness'"
    )
  })
})

// --- absenceTypes.delete tests ---

describe("absenceTypes.delete", () => {
  it("deletes type successfully", async () => {
    const existing = makeAbsenceType()
    const mockPrisma = {
      absenceType: {
        findFirst: vi.fn().mockResolvedValue(existing),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      absenceDay: { count: vi.fn().mockResolvedValue(0) },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: TYPE_ID })
    expect(result.success).toBe(true)
    expect(mockPrisma.absenceType.deleteMany).toHaveBeenCalledWith({
      where: { id: TYPE_ID, tenantId: TENANT_ID },
    })
  })

  it("blocks deletion of system types", async () => {
    const systemType = makeAbsenceType({ isSystem: true, tenantId: null })
    const mockPrisma = {
      absenceType: {
        findFirst: vi.fn().mockResolvedValue(systemType),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: TYPE_ID })).rejects.toThrow(
      "Cannot delete system absence type"
    )
  })

  it("throws NOT_FOUND for missing type", async () => {
    const mockPrisma = {
      absenceType: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: TYPE_ID })).rejects.toThrow(
      "Absence type not found"
    )
  })

  it("blocks deletion when absence_days reference the type", async () => {
    const existing = makeAbsenceType()
    const mockPrisma = {
      absenceType: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
      absenceDay: { count: vi.fn().mockResolvedValue(5) },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: TYPE_ID })).rejects.toThrow(
      "Cannot delete absence type that is in use by absence days"
    )
  })
})
