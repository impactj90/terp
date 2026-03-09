import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { vacationCappingRulesRouter } from "../vacationCappingRules"
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
const RULE_ID = "a0000000-0000-4000-a000-000000000a00"

const createCaller = createCallerFactory(vacationCappingRulesRouter)

// --- Helpers ---

function makeCappingRule(
  overrides: Partial<{
    id: string
    tenantId: string
    code: string
    name: string
    description: string | null
    ruleType: string
    cutoffMonth: number
    cutoffDay: number
    capValue: number
    isActive: boolean
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: RULE_ID,
    tenantId: TENANT_ID,
    code: "CR001",
    name: "Year End Cap",
    description: null,
    ruleType: "year_end",
    cutoffMonth: 12,
    cutoffDay: 31,
    capValue: 10,
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

// --- vacationCappingRules.list tests ---

describe("vacationCappingRules.list", () => {
  it("returns all capping rules for tenant", async () => {
    const items = [
      makeCappingRule({ code: "CR001" }),
      makeCappingRule({ code: "CR002", name: "Mid Year Cap", ruleType: "mid_year" }),
    ]
    const mockPrisma = {
      vacationCappingRule: {
        findMany: vi.fn().mockResolvedValue(items),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toHaveLength(2)
    expect(mockPrisma.vacationCappingRule.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID },
      orderBy: { code: "asc" },
    })
  })

  it("filters by isActive", async () => {
    const mockPrisma = {
      vacationCappingRule: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ isActive: true })
    expect(mockPrisma.vacationCappingRule.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, isActive: true },
      orderBy: { code: "asc" },
    })
  })

  it("filters by ruleType", async () => {
    const mockPrisma = {
      vacationCappingRule: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ ruleType: "mid_year" })
    expect(mockPrisma.vacationCappingRule.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, ruleType: "mid_year" },
      orderBy: { code: "asc" },
    })
  })
})

// --- vacationCappingRules.getById tests ---

describe("vacationCappingRules.getById", () => {
  it("returns capping rule by id", async () => {
    const item = makeCappingRule()
    const mockPrisma = {
      vacationCappingRule: {
        findFirst: vi.fn().mockResolvedValue(item),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: RULE_ID })
    expect(result.id).toBe(RULE_ID)
    expect(result.ruleType).toBe("year_end")
    expect(result.capValue).toBe(10)
  })

  it("throws NOT_FOUND for non-existent rule", async () => {
    const mockPrisma = {
      vacationCappingRule: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: RULE_ID })).rejects.toThrow(
      "Vacation capping rule not found"
    )
  })
})

// --- vacationCappingRules.create tests ---

describe("vacationCappingRules.create", () => {
  it("creates year_end capping rule", async () => {
    const created = makeCappingRule()
    const mockPrisma = {
      vacationCappingRule: {
        findFirst: vi.fn().mockResolvedValue(null), // code uniqueness
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "CR001",
      name: "Year End Cap",
      ruleType: "year_end",
      capValue: 10,
    })
    expect(result.code).toBe("CR001")
    expect(result.ruleType).toBe("year_end")
    expect(result.capValue).toBe(10)
  })

  it("creates mid_year capping rule with custom cutoff", async () => {
    const created = makeCappingRule({
      ruleType: "mid_year",
      cutoffMonth: 3,
      cutoffDay: 31,
      capValue: 5,
    })
    const mockPrisma = {
      vacationCappingRule: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "CR001",
      name: "Mid Year Cap",
      ruleType: "mid_year",
      cutoffMonth: 3,
      cutoffDay: 31,
      capValue: 5,
    })
    expect(result.ruleType).toBe("mid_year")
    expect(result.cutoffMonth).toBe(3)
    expect(result.cutoffDay).toBe(31)
  })

  it("throws CONFLICT for duplicate code", async () => {
    const mockPrisma = {
      vacationCappingRule: {
        findFirst: vi.fn().mockResolvedValue(makeCappingRule()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "CR001", name: "Rule", ruleType: "year_end" })
    ).rejects.toThrow("Capping rule code already exists")
  })

  it("throws BAD_REQUEST for empty code", async () => {
    const mockPrisma = {
      vacationCappingRule: {},
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "   ", name: "Rule", ruleType: "year_end" })
    ).rejects.toThrow("Code is required")
  })
})

// --- vacationCappingRules.update tests ---

describe("vacationCappingRules.update", () => {
  it("updates name and capValue", async () => {
    const existing = makeCappingRule()
    const updated = makeCappingRule({ name: "Updated Cap", capValue: 15 })
    const mockPrisma = {
      vacationCappingRule: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: RULE_ID,
      name: "Updated Cap",
      capValue: 15,
    })
    expect(result.name).toBe("Updated Cap")
    expect(result.capValue).toBe(15)
  })

  it("throws NOT_FOUND for non-existent rule", async () => {
    const mockPrisma = {
      vacationCappingRule: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: RULE_ID, name: "Updated" })
    ).rejects.toThrow("Vacation capping rule not found")
  })

  it("throws BAD_REQUEST for empty name", async () => {
    const existing = makeCappingRule()
    const mockPrisma = {
      vacationCappingRule: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: RULE_ID, name: "   " })
    ).rejects.toThrow("Name is required")
  })
})

// --- vacationCappingRules.delete tests ---

describe("vacationCappingRules.delete", () => {
  it("deletes capping rule successfully", async () => {
    const existing = makeCappingRule()
    const mockPrisma = {
      vacationCappingRule: {
        findFirst: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(existing),
      },
      vacationCappingRuleGroupRule: {
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: RULE_ID })
    expect(result.success).toBe(true)
  })

  it("throws NOT_FOUND for non-existent rule", async () => {
    const mockPrisma = {
      vacationCappingRule: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: RULE_ID })).rejects.toThrow(
      "Vacation capping rule not found"
    )
  })

  it("throws BAD_REQUEST when rule is used by rule groups", async () => {
    const existing = makeCappingRule()
    const mockPrisma = {
      vacationCappingRule: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
      vacationCappingRuleGroupRule: {
        count: vi.fn().mockResolvedValue(2),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: RULE_ID })).rejects.toThrow(
      "Cannot delete capping rule that is assigned to capping rule groups"
    )
  })
})
