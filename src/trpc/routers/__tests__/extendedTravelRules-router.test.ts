import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { extendedTravelRulesRouter } from "../extendedTravelRules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
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
const RULE_ID = "a0000000-0000-4000-a000-000000000400"
const RULE_SET_ID = "a0000000-0000-4000-a000-000000000200"

const createCaller = createCallerFactory(extendedTravelRulesRouter)

// --- Helpers ---

function makeRule(
  overrides: Partial<{
    id: string
    tenantId: string
    ruleSetId: string
    arrivalDayTaxFree: Decimal
    arrivalDayTaxable: Decimal
    departureDayTaxFree: Decimal
    departureDayTaxable: Decimal
    intermediateDayTaxFree: Decimal
    intermediateDayTaxable: Decimal
    threeMonthEnabled: boolean
    threeMonthTaxFree: Decimal
    threeMonthTaxable: Decimal
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
    arrivalDayTaxFree: new Decimal(14),
    arrivalDayTaxable: new Decimal(8),
    departureDayTaxFree: new Decimal(14),
    departureDayTaxable: new Decimal(8),
    intermediateDayTaxFree: new Decimal(28),
    intermediateDayTaxable: new Decimal(16),
    threeMonthEnabled: false,
    threeMonthTaxFree: new Decimal(0),
    threeMonthTaxable: new Decimal(0),
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

// --- extendedTravelRules.list tests ---

describe("extendedTravelRules.list", () => {
  it("returns tenant-scoped rules", async () => {
    const rules = [makeRule()]
    const mockPrisma = {
      extendedTravelRule: {
        findMany: vi.fn().mockResolvedValue(rules),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()

    expect(result.data).toHaveLength(1)
    expect(result.data[0]!.arrivalDayTaxFree).toBe(14)
    expect(mockPrisma.extendedTravelRule.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID },
      orderBy: [{ sortOrder: "asc" }],
    })
  })

  it("supports ruleSetId filter", async () => {
    const mockPrisma = {
      extendedTravelRule: {
        findMany: vi.fn().mockResolvedValue([makeRule()]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ ruleSetId: RULE_SET_ID })

    expect(mockPrisma.extendedTravelRule.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, ruleSetId: RULE_SET_ID },
      orderBy: [{ sortOrder: "asc" }],
    })
  })

  it("denies access without permission", async () => {
    const mockPrisma = {
      extendedTravelRule: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createNoPermContext(mockPrisma))
    await expect(caller.list()).rejects.toThrow("Insufficient permissions")
  })
})

// --- extendedTravelRules.getById tests ---

describe("extendedTravelRules.getById", () => {
  it("returns rule by ID", async () => {
    const rule = makeRule()
    const mockPrisma = {
      extendedTravelRule: {
        findFirst: vi.fn().mockResolvedValue(rule),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: RULE_ID })

    expect(result.id).toBe(RULE_ID)
    expect(result.arrivalDayTaxFree).toBe(14)
    expect(result.arrivalDayTaxable).toBe(8)
    expect(result.threeMonthEnabled).toBe(false)
  })

  it("throws NOT_FOUND for missing ID", async () => {
    const mockPrisma = {
      extendedTravelRule: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: RULE_ID })).rejects.toThrow(
      "Extended travel rule not found"
    )
  })
})

// --- extendedTravelRules.create tests ---

describe("extendedTravelRules.create", () => {
  it("creates rule with valid input and FK validation", async () => {
    const rule = makeRule()
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn().mockResolvedValue({ id: RULE_SET_ID }),
      },
      extendedTravelRule: {
        create: vi.fn().mockResolvedValue(rule),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      ruleSetId: RULE_SET_ID,
      arrivalDayTaxFree: 14,
      arrivalDayTaxable: 8,
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

  it("defaults all decimal fields to 0 and threeMonthEnabled to false", async () => {
    const rule = makeRule()
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn().mockResolvedValue({ id: RULE_SET_ID }),
      },
      extendedTravelRule: {
        create: vi.fn().mockResolvedValue(rule),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({ ruleSetId: RULE_SET_ID })

    expect(mockPrisma.extendedTravelRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        arrivalDayTaxFree: 0,
        arrivalDayTaxable: 0,
        departureDayTaxFree: 0,
        departureDayTaxable: 0,
        intermediateDayTaxFree: 0,
        intermediateDayTaxable: 0,
        threeMonthEnabled: false,
        threeMonthTaxFree: 0,
        threeMonthTaxable: 0,
        isActive: true,
        sortOrder: 0,
      }),
    })
  })
})

// --- extendedTravelRules.update tests ---

describe("extendedTravelRules.update", () => {
  it("partial update succeeds", async () => {
    const existing = makeRule()
    const updated = makeRule({
      arrivalDayTaxFree: new Decimal(20),
      threeMonthEnabled: true,
    })
    const mockPrisma = {
      extendedTravelRule: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: RULE_ID,
      arrivalDayTaxFree: 20,
      threeMonthEnabled: true,
    })

    expect(result.arrivalDayTaxFree).toBe(20)
    expect(result.threeMonthEnabled).toBe(true)
    expect(mockPrisma.extendedTravelRule.update).toHaveBeenCalledWith({
      where: { id: RULE_ID },
      data: { arrivalDayTaxFree: 20, threeMonthEnabled: true },
    })
  })

  it("throws NOT_FOUND for missing rule", async () => {
    const mockPrisma = {
      extendedTravelRule: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: RULE_ID, arrivalDayTaxFree: 20 })
    ).rejects.toThrow("Extended travel rule not found")
  })
})

// --- extendedTravelRules.delete tests ---

describe("extendedTravelRules.delete", () => {
  it("deletes existing rule", async () => {
    const existing = makeRule()
    const mockPrisma = {
      extendedTravelRule: {
        findFirst: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: RULE_ID })

    expect(result.success).toBe(true)
    expect(mockPrisma.extendedTravelRule.delete).toHaveBeenCalledWith({
      where: { id: RULE_ID },
    })
  })

  it("throws NOT_FOUND for missing rule", async () => {
    const mockPrisma = {
      extendedTravelRule: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: RULE_ID })).rejects.toThrow(
      "Extended travel rule not found"
    )
  })
})
