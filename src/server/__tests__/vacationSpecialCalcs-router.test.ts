import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { vacationSpecialCalcsRouter } from "../routers/vacationSpecialCalcs"
import { permissionIdByKey } from "../lib/permission-catalog"
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
const CALC_ID = "a0000000-0000-4000-a000-000000000800"

const createCaller = createCallerFactory(vacationSpecialCalcsRouter)

// --- Helpers ---

function makeSpecialCalc(
  overrides: Partial<{
    id: string
    tenantId: string
    type: string
    threshold: number
    bonusDays: number
    description: string | null
    isActive: boolean
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: CALC_ID,
    tenantId: TENANT_ID,
    type: "age",
    threshold: 30,
    bonusDays: 2,
    description: null,
    isActive: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
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

// --- vacationSpecialCalcs.list tests ---

describe("vacationSpecialCalcs.list", () => {
  it("returns all special calcs for tenant", async () => {
    const items = [
      makeSpecialCalc({ type: "age", threshold: 30 }),
      makeSpecialCalc({ type: "tenure", threshold: 5 }),
    ]
    const mockPrisma = {
      vacationSpecialCalculation: {
        findMany: vi.fn().mockResolvedValue(items),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toHaveLength(2)
    expect(mockPrisma.vacationSpecialCalculation.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID },
      orderBy: [{ type: "asc" }, { threshold: "asc" }],
    })
  })

  it("filters by isActive", async () => {
    const mockPrisma = {
      vacationSpecialCalculation: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ isActive: true })
    expect(mockPrisma.vacationSpecialCalculation.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, isActive: true },
      orderBy: [{ type: "asc" }, { threshold: "asc" }],
    })
  })

  it("filters by type", async () => {
    const mockPrisma = {
      vacationSpecialCalculation: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ type: "age" })
    expect(mockPrisma.vacationSpecialCalculation.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, type: "age" },
      orderBy: [{ type: "asc" }, { threshold: "asc" }],
    })
  })
})

// --- vacationSpecialCalcs.getById tests ---

describe("vacationSpecialCalcs.getById", () => {
  it("returns special calc by id", async () => {
    const item = makeSpecialCalc()
    const mockPrisma = {
      vacationSpecialCalculation: {
        findFirst: vi.fn().mockResolvedValue(item),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: CALC_ID })
    expect(result.id).toBe(CALC_ID)
    expect(result.type).toBe("age")
    expect(result.threshold).toBe(30)
  })

  it("throws NOT_FOUND for non-existent calc", async () => {
    const mockPrisma = {
      vacationSpecialCalculation: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: CALC_ID })).rejects.toThrow(
      "Vacation special calculation not found"
    )
  })
})

// --- vacationSpecialCalcs.create tests ---

describe("vacationSpecialCalcs.create", () => {
  it("creates age type special calc", async () => {
    const created = makeSpecialCalc()
    const mockPrisma = {
      vacationSpecialCalculation: {
        findFirst: vi.fn().mockResolvedValue(null), // uniqueness check
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      type: "age",
      threshold: 30,
      bonusDays: 2,
    })
    expect(result.type).toBe("age")
    expect(result.threshold).toBe(30)
    expect(result.bonusDays).toBe(2)
  })

  it("creates disability type with threshold 0", async () => {
    const created = makeSpecialCalc({ type: "disability", threshold: 0, bonusDays: 5 })
    const mockPrisma = {
      vacationSpecialCalculation: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      type: "disability",
      threshold: 0,
      bonusDays: 5,
    })
    expect(result.type).toBe("disability")
    expect(result.threshold).toBe(0)
  })

  it("throws BAD_REQUEST for disability with non-zero threshold", async () => {
    const mockPrisma = {
      vacationSpecialCalculation: {},
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ type: "disability", threshold: 5, bonusDays: 5 })
    ).rejects.toThrow("Threshold must be 0 for disability type")
  })

  it("throws BAD_REQUEST for age with zero threshold", async () => {
    const mockPrisma = {
      vacationSpecialCalculation: {},
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ type: "age", threshold: 0, bonusDays: 2 })
    ).rejects.toThrow("Threshold must be positive for age type")
  })

  it("throws CONFLICT for duplicate type+threshold", async () => {
    const mockPrisma = {
      vacationSpecialCalculation: {
        findFirst: vi.fn().mockResolvedValue(makeSpecialCalc()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ type: "age", threshold: 30, bonusDays: 2 })
    ).rejects.toThrow(
      "A special calculation with this type and threshold already exists"
    )
  })
})

// --- vacationSpecialCalcs.update tests ---

describe("vacationSpecialCalcs.update", () => {
  it("updates bonusDays", async () => {
    const existing = makeSpecialCalc()
    const updated = makeSpecialCalc({ bonusDays: 5 })
    const mockPrisma = {
      vacationSpecialCalculation: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: CALC_ID, bonusDays: 5 })
    expect(result.bonusDays).toBe(5)
  })

  it("throws NOT_FOUND for non-existent calc", async () => {
    const mockPrisma = {
      vacationSpecialCalculation: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: CALC_ID, bonusDays: 5 })
    ).rejects.toThrow("Vacation special calculation not found")
  })

  it("throws BAD_REQUEST when setting non-zero threshold on disability type", async () => {
    const existing = makeSpecialCalc({ type: "disability", threshold: 0 })
    const mockPrisma = {
      vacationSpecialCalculation: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: CALC_ID, threshold: 5 })
    ).rejects.toThrow("Threshold must be 0 for disability type")
  })
})

// --- vacationSpecialCalcs.delete tests ---

describe("vacationSpecialCalcs.delete", () => {
  it("deletes special calc successfully", async () => {
    const existing = makeSpecialCalc()
    const mockPrisma = {
      vacationSpecialCalculation: {
        findFirst: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(existing),
      },
      vacationCalcGroupSpecialCalc: {
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: CALC_ID })
    expect(result.success).toBe(true)
  })

  it("throws NOT_FOUND for non-existent calc", async () => {
    const mockPrisma = {
      vacationSpecialCalculation: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: CALC_ID })).rejects.toThrow(
      "Vacation special calculation not found"
    )
  })

  it("throws BAD_REQUEST when calc is used by calc groups", async () => {
    const existing = makeSpecialCalc()
    const mockPrisma = {
      vacationSpecialCalculation: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
      vacationCalcGroupSpecialCalc: {
        count: vi.fn().mockResolvedValue(2),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: CALC_ID })).rejects.toThrow(
      "Cannot delete special calculation that is assigned to calculation groups"
    )
  })
})
