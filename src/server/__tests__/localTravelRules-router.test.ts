import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { localTravelRulesRouter } from "../routers/localTravelRules"
import { permissionIdByKey } from "../lib/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"
import { Decimal } from "@prisma/client/runtime/client"

// --- Constants ---

const TRAVEL_ALLOWANCE_MANAGE = permissionIdByKey("travel_allowance.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const RULE_ID = "a0000000-0000-4000-a000-000000000300"
const RULE_SET_ID = "a0000000-0000-4000-a000-000000000200"

const createCaller = createCallerFactory(localTravelRulesRouter)

// --- Helpers ---

function makeRule(
  overrides: Partial<{
    id: string
    tenantId: string
    ruleSetId: string
    minDistanceKm: Decimal
    maxDistanceKm: Decimal | null
    minDurationMinutes: number
    maxDurationMinutes: number | null
    taxFreeAmount: Decimal
    taxableAmount: Decimal
    isActive: boolean
    sortOrder: number
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: RULE_ID,
    tenantId: TENANT_ID,
    ruleSetId: RULE_SET_ID,
    minDistanceKm: new Decimal(0),
    maxDistanceKm: new Decimal(50),
    minDurationMinutes: 0,
    maxDurationMinutes: 480,
    taxFreeAmount: new Decimal(10),
    taxableAmount: new Decimal(5),
    isActive: true,
    sortOrder: 0,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([TRAVEL_ALLOWANCE_MANAGE], {
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

// --- localTravelRules.list tests ---

describe("localTravelRules.list", () => {
  it("returns tenant-scoped rules", async () => {
    const rules = [
      makeRule({ sortOrder: 0 }),
      makeRule({
        id: "a0000000-0000-4000-a000-000000000301",
        minDistanceKm: new Decimal(50),
        sortOrder: 1,
      }),
    ]
    const mockPrisma = {
      localTravelRule: {
        findMany: vi.fn().mockResolvedValue(rules),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()

    expect(result.data).toHaveLength(2)
    expect(result.data[0]!.minDistanceKm).toBe(0)
    expect(result.data[1]!.minDistanceKm).toBe(50)
    expect(mockPrisma.localTravelRule.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID },
      orderBy: [{ sortOrder: "asc" }, { minDistanceKm: "asc" }],
    })
  })

  it("supports ruleSetId filter", async () => {
    const mockPrisma = {
      localTravelRule: {
        findMany: vi.fn().mockResolvedValue([makeRule()]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ ruleSetId: RULE_SET_ID })

    expect(mockPrisma.localTravelRule.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, ruleSetId: RULE_SET_ID },
      orderBy: [{ sortOrder: "asc" }, { minDistanceKm: "asc" }],
    })
  })

  it("denies access without permission", async () => {
    const mockPrisma = {
      localTravelRule: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createNoPermContext(mockPrisma))
    await expect(caller.list()).rejects.toThrow("Insufficient permissions")
  })
})

// --- localTravelRules.getById tests ---

describe("localTravelRules.getById", () => {
  it("returns rule by ID", async () => {
    const rule = makeRule()
    const mockPrisma = {
      localTravelRule: {
        findFirst: vi.fn().mockResolvedValue(rule),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: RULE_ID })

    expect(result.id).toBe(RULE_ID)
    expect(result.ruleSetId).toBe(RULE_SET_ID)
    expect(result.minDistanceKm).toBe(0)
    expect(result.maxDistanceKm).toBe(50)
    expect(result.taxFreeAmount).toBe(10)
    expect(result.taxableAmount).toBe(5)
  })

  it("throws NOT_FOUND for missing ID", async () => {
    const mockPrisma = {
      localTravelRule: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: RULE_ID })).rejects.toThrow(
      "Local travel rule not found"
    )
  })
})

// --- localTravelRules.create tests ---

describe("localTravelRules.create", () => {
  it("creates rule with valid input and FK validation", async () => {
    const rule = makeRule()
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn().mockResolvedValue({ id: RULE_SET_ID }),
      },
      localTravelRule: {
        create: vi.fn().mockResolvedValue(rule),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      ruleSetId: RULE_SET_ID,
      minDistanceKm: 0,
      maxDistanceKm: 50,
      taxFreeAmount: 10,
      taxableAmount: 5,
    })

    expect(result.id).toBe(RULE_ID)
    expect(mockPrisma.travelAllowanceRuleSet.findFirst).toHaveBeenCalledWith({
      where: { id: RULE_SET_ID, tenantId: TENANT_ID },
    })
  })

  it("validates ruleSetId FK exists", async () => {
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ ruleSetId: RULE_SET_ID })
    ).rejects.toThrow("Rule set not found")
  })

  it("defaults decimal fields to 0", async () => {
    const rule = makeRule()
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn().mockResolvedValue({ id: RULE_SET_ID }),
      },
      localTravelRule: {
        create: vi.fn().mockResolvedValue(rule),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({ ruleSetId: RULE_SET_ID })

    expect(mockPrisma.localTravelRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        minDistanceKm: 0,
        maxDistanceKm: null,
        minDurationMinutes: 0,
        maxDurationMinutes: null,
        taxFreeAmount: 0,
        taxableAmount: 0,
        isActive: true,
        sortOrder: 0,
      }),
    })
  })

  it("handles nullable maxDistanceKm/maxDurationMinutes", async () => {
    const ruleWithNulls = makeRule({
      maxDistanceKm: null,
      maxDurationMinutes: null,
    })
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn().mockResolvedValue({ id: RULE_SET_ID }),
      },
      localTravelRule: {
        create: vi.fn().mockResolvedValue(ruleWithNulls),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      ruleSetId: RULE_SET_ID,
    })

    expect(result.maxDistanceKm).toBeNull()
    expect(result.maxDurationMinutes).toBeNull()
  })
})

// --- localTravelRules.update tests ---

describe("localTravelRules.update", () => {
  it("partial update succeeds", async () => {
    const existing = makeRule()
    const updated = makeRule({ taxFreeAmount: new Decimal(20) })
    const mockPrisma = {
      localTravelRule: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: RULE_ID,
      taxFreeAmount: 20,
    })

    expect(result.taxFreeAmount).toBe(20)
    expect(mockPrisma.localTravelRule.update).toHaveBeenCalledWith({
      where: { id: RULE_ID },
      data: { taxFreeAmount: 20 },
    })
  })

  it("throws NOT_FOUND for missing rule", async () => {
    const mockPrisma = {
      localTravelRule: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: RULE_ID, taxFreeAmount: 20 })
    ).rejects.toThrow("Local travel rule not found")
  })

  it("can set maxDistanceKm/maxDurationMinutes to null", async () => {
    const existing = makeRule()
    const updated = makeRule({
      maxDistanceKm: null,
      maxDurationMinutes: null,
    })
    const mockPrisma = {
      localTravelRule: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.update({
      id: RULE_ID,
      maxDistanceKm: null,
      maxDurationMinutes: null,
    })

    expect(mockPrisma.localTravelRule.update).toHaveBeenCalledWith({
      where: { id: RULE_ID },
      data: { maxDistanceKm: null, maxDurationMinutes: null },
    })
  })
})

// --- localTravelRules.delete tests ---

describe("localTravelRules.delete", () => {
  it("deletes existing rule", async () => {
    const existing = makeRule()
    const mockPrisma = {
      localTravelRule: {
        findFirst: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: RULE_ID })

    expect(result.success).toBe(true)
    expect(mockPrisma.localTravelRule.delete).toHaveBeenCalledWith({
      where: { id: RULE_ID },
    })
  })

  it("throws NOT_FOUND for missing rule", async () => {
    const mockPrisma = {
      localTravelRule: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: RULE_ID })).rejects.toThrow(
      "Local travel rule not found"
    )
  })
})
