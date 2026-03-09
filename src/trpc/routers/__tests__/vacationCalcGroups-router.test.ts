import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { vacationCalcGroupsRouter } from "../vacationCalcGroups"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const VACATION_CONFIG_MANAGE = permissionIdByKey("vacation_config.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const GROUP_ID = "a0000000-0000-4000-a000-000000000900"
const SPECIAL_CALC_ID = "a0000000-0000-4000-a000-000000000901"

const createCaller = createCallerFactory(vacationCalcGroupsRouter)

// --- Helpers ---

function makeCalcGroup(
  overrides: Partial<{
    id: string
    tenantId: string
    code: string
    name: string
    description: string | null
    basis: string
    isActive: boolean
    createdAt: Date
    updatedAt: Date
    specialCalcLinks: Array<{
      specialCalculation: { id: string; type: string; threshold: number; bonusDays: number }
    }>
  }> = {}
) {
  return {
    id: GROUP_ID,
    tenantId: TENANT_ID,
    code: "CG001",
    name: "Standard Calc Group",
    description: null,
    basis: "calendar_year",
    isActive: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    specialCalcLinks: [],
    ...overrides,
  }
}

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([VACATION_CONFIG_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- vacationCalcGroups.list tests ---

describe("vacationCalcGroups.list", () => {
  it("returns all calc groups for tenant", async () => {
    const items = [
      makeCalcGroup({ code: "CG001" }),
      makeCalcGroup({ code: "CG002", name: "Premium Group" }),
    ]
    const mockPrisma = {
      vacationCalculationGroup: {
        findMany: vi.fn().mockResolvedValue(items),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toHaveLength(2)
    expect(result.data[0]!.code).toBe("CG001")
  })

  it("filters by isActive", async () => {
    const mockPrisma = {
      vacationCalculationGroup: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ isActive: true })
    expect(mockPrisma.vacationCalculationGroup.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, isActive: true },
      include: expect.any(Object),
      orderBy: { code: "asc" },
    })
  })
})

// --- vacationCalcGroups.getById tests ---

describe("vacationCalcGroups.getById", () => {
  it("returns calc group with special calcs", async () => {
    const item = makeCalcGroup({
      specialCalcLinks: [
        {
          specialCalculation: {
            id: SPECIAL_CALC_ID,
            type: "age",
            threshold: 30,
            bonusDays: 2,
          },
        },
      ],
    })
    const mockPrisma = {
      vacationCalculationGroup: {
        findFirst: vi.fn().mockResolvedValue(item),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: GROUP_ID })
    expect(result.id).toBe(GROUP_ID)
    expect(result.specialCalculations).toHaveLength(1)
    expect(result.specialCalculations![0]!.type).toBe("age")
  })

  it("throws NOT_FOUND for non-existent group", async () => {
    const mockPrisma = {
      vacationCalculationGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: GROUP_ID })).rejects.toThrow(
      "Vacation calculation group not found"
    )
  })
})

// --- vacationCalcGroups.create tests ---

describe("vacationCalcGroups.create", () => {
  it("creates calc group with required fields", async () => {
    const created = makeCalcGroup()
    const mockPrisma = {
      vacationCalculationGroup: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null) // code uniqueness
          .mockResolvedValueOnce(created), // re-fetch
      },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          vacationCalculationGroup: {
            create: vi.fn().mockResolvedValue(created),
          },
          vacationCalcGroupSpecialCalc: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        })
      }),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "CG001",
      name: "Standard Calc Group",
    })
    expect(result.code).toBe("CG001")
    expect(result.name).toBe("Standard Calc Group")
  })

  it("creates calc group with special calculation IDs", async () => {
    const created = makeCalcGroup({
      specialCalcLinks: [
        {
          specialCalculation: {
            id: SPECIAL_CALC_ID,
            type: "age",
            threshold: 30,
            bonusDays: 2,
          },
        },
      ],
    })
    const mockPrisma = {
      vacationCalculationGroup: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null) // code uniqueness
          .mockResolvedValueOnce(created), // re-fetch
      },
      vacationSpecialCalculation: {
        findMany: vi.fn().mockResolvedValue([{ id: SPECIAL_CALC_ID }]),
      },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          vacationCalculationGroup: {
            create: vi.fn().mockResolvedValue({ ...created, specialCalcLinks: undefined }),
          },
          vacationCalcGroupSpecialCalc: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        })
      }),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "CG001",
      name: "Standard Calc Group",
      specialCalculationIds: [SPECIAL_CALC_ID],
    })
    expect(result.specialCalculations).toHaveLength(1)
  })

  it("throws CONFLICT for duplicate code", async () => {
    const mockPrisma = {
      vacationCalculationGroup: {
        findFirst: vi.fn().mockResolvedValue(makeCalcGroup()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "CG001", name: "Group" })
    ).rejects.toThrow("Calculation group code already exists")
  })

  it("throws BAD_REQUEST for empty code", async () => {
    const mockPrisma = {
      vacationCalculationGroup: {},
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "   ", name: "Group" })
    ).rejects.toThrow("Code is required")
  })

  it("throws BAD_REQUEST for invalid special calc IDs", async () => {
    const mockPrisma = {
      vacationCalculationGroup: {
        findFirst: vi.fn().mockResolvedValue(null), // code uniqueness
      },
      vacationSpecialCalculation: {
        findMany: vi.fn().mockResolvedValue([]), // none found
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        code: "CG001",
        name: "Group",
        specialCalculationIds: [SPECIAL_CALC_ID],
      })
    ).rejects.toThrow("One or more special calculation IDs are invalid")
  })
})

// --- vacationCalcGroups.update tests ---

describe("vacationCalcGroups.update", () => {
  it("updates name successfully", async () => {
    const existing = makeCalcGroup()
    const updated = makeCalcGroup({ name: "Updated Group" })
    const mockPrisma = {
      vacationCalculationGroup: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing) // existence check
          .mockResolvedValueOnce(updated), // re-fetch
      },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          vacationCalculationGroup: {
            update: vi.fn().mockResolvedValue(updated),
          },
          vacationCalcGroupSpecialCalc: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        })
      }),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: GROUP_ID,
      name: "Updated Group",
    })
    expect(result.name).toBe("Updated Group")
  })

  it("throws NOT_FOUND for non-existent group", async () => {
    const mockPrisma = {
      vacationCalculationGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: GROUP_ID, name: "Updated" })
    ).rejects.toThrow("Vacation calculation group not found")
  })

  it("throws BAD_REQUEST for empty name", async () => {
    const existing = makeCalcGroup()
    const mockPrisma = {
      vacationCalculationGroup: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: GROUP_ID, name: "   " })
    ).rejects.toThrow("Name is required")
  })
})

// --- vacationCalcGroups.delete tests ---

describe("vacationCalcGroups.delete", () => {
  it("deletes calc group successfully", async () => {
    const existing = makeCalcGroup()
    const mockPrisma = {
      vacationCalculationGroup: {
        findFirst: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(existing),
      },
      employmentType: {
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: GROUP_ID })
    expect(result.success).toBe(true)
  })

  it("throws NOT_FOUND for non-existent group", async () => {
    const mockPrisma = {
      vacationCalculationGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: GROUP_ID })).rejects.toThrow(
      "Vacation calculation group not found"
    )
  })

  it("throws BAD_REQUEST when group is used by employment types", async () => {
    const existing = makeCalcGroup()
    const mockPrisma = {
      vacationCalculationGroup: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
      employmentType: {
        count: vi.fn().mockResolvedValue(3),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: GROUP_ID })).rejects.toThrow(
      "Cannot delete calculation group that is assigned to employment types"
    )
  })
})
