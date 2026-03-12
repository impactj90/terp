import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { travelAllowanceRuleSetsRouter } from "../travelAllowanceRuleSets"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const TRAVEL_ALLOWANCE_MANAGE = permissionIdByKey("travel_allowance.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const RULE_SET_ID = "a0000000-0000-4000-a000-000000000200"

const createCaller = createCallerFactory(travelAllowanceRuleSetsRouter)

// --- Helpers ---

function makeRuleSet(
  overrides: Partial<{
    id: string
    tenantId: string
    code: string
    name: string
    description: string | null
    validFrom: Date | null
    validTo: Date | null
    calculationBasis: string
    distanceRule: string
    isActive: boolean
    sortOrder: number
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: RULE_SET_ID,
    tenantId: TENANT_ID,
    code: "RS-001",
    name: "Standard Rule Set",
    description: null,
    validFrom: null,
    validTo: null,
    calculationBasis: "per_day",
    distanceRule: "longest",
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

// --- travelAllowanceRuleSets.list tests ---

describe("travelAllowanceRuleSets.list", () => {
  it("returns all rule sets ordered by sortOrder/code", async () => {
    const ruleSets = [
      makeRuleSet({ code: "RS-001", sortOrder: 0 }),
      makeRuleSet({
        id: "a0000000-0000-4000-a000-000000000201",
        code: "RS-002",
        sortOrder: 1,
      }),
    ]
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findMany: vi.fn().mockResolvedValue(ruleSets),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()

    expect(result.data).toHaveLength(2)
    expect(result.data[0]!.code).toBe("RS-001")
    expect(result.data[1]!.code).toBe("RS-002")
    expect(mockPrisma.travelAllowanceRuleSet.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    })
  })

  it("denies access without permission", async () => {
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createNoPermContext(mockPrisma))
    await expect(caller.list()).rejects.toThrow("Insufficient permissions")
  })
})

// --- travelAllowanceRuleSets.getById tests ---

describe("travelAllowanceRuleSets.getById", () => {
  it("returns rule set by ID", async () => {
    const ruleSet = makeRuleSet()
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn().mockResolvedValue(ruleSet),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: RULE_SET_ID })

    expect(result.id).toBe(RULE_SET_ID)
    expect(result.code).toBe("RS-001")
    expect(result.name).toBe("Standard Rule Set")
    expect(mockPrisma.travelAllowanceRuleSet.findFirst).toHaveBeenCalledWith({
      where: { id: RULE_SET_ID, tenantId: TENANT_ID },
    })
  })

  it("throws NOT_FOUND for missing ID", async () => {
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: RULE_SET_ID })).rejects.toThrow(
      "Travel allowance rule set not found"
    )
  })
})

// --- travelAllowanceRuleSets.create tests ---

describe("travelAllowanceRuleSets.create", () => {
  it("creates rule set with valid input", async () => {
    const ruleSet = makeRuleSet()
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(ruleSet),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "RS-001",
      name: "Standard Rule Set",
    })

    expect(result.id).toBe(RULE_SET_ID)
    expect(result.code).toBe("RS-001")
    expect(mockPrisma.travelAllowanceRuleSet.create).toHaveBeenCalledWith({
      data: {
        tenantId: TENANT_ID,
        code: "RS-001",
        name: "Standard Rule Set",
        description: null,
        validFrom: null,
        validTo: null,
        calculationBasis: "per_day",
        distanceRule: "longest",
        isActive: true,
        sortOrder: 0,
      },
    })
  })

  it("validates code required (empty after trim)", async () => {
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn(),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "   ", name: "Test" })
    ).rejects.toThrow("Rule set code is required")
  })

  it("validates name required (empty after trim)", async () => {
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "RS-001", name: "   " })
    ).rejects.toThrow("Rule set name is required")
  })

  it("rejects duplicate code within tenant (CONFLICT)", async () => {
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn().mockResolvedValue(makeRuleSet()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "RS-001", name: "Test" })
    ).rejects.toThrow("Rule set code already exists")
  })

  it("defaults calculationBasis/distanceRule/isActive/sortOrder", async () => {
    const ruleSet = makeRuleSet()
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(ruleSet),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({ code: "RS-001", name: "Test" })

    expect(mockPrisma.travelAllowanceRuleSet.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        calculationBasis: "per_day",
        distanceRule: "longest",
        isActive: true,
        sortOrder: 0,
      }),
    })
  })

  it("accepts validFrom/validTo dates", async () => {
    const ruleSet = makeRuleSet({
      validFrom: new Date("2025-01-01T00:00:00.000Z"),
      validTo: new Date("2025-12-31T00:00:00.000Z"),
    })
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(ruleSet),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "RS-001",
      name: "Test",
      validFrom: "2025-01-01",
      validTo: "2025-12-31",
    })

    expect(mockPrisma.travelAllowanceRuleSet.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        validFrom: new Date("2025-01-01T00:00:00.000Z"),
        validTo: new Date("2025-12-31T00:00:00.000Z"),
      }),
    })
    expect(result.validFrom).toEqual(new Date("2025-01-01T00:00:00.000Z"))
  })
})

// --- travelAllowanceRuleSets.update tests ---

describe("travelAllowanceRuleSets.update", () => {
  it("partial update succeeds", async () => {
    const existing = makeRuleSet()
    const updated = makeRuleSet({ name: "Updated Name", sortOrder: 3 })
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: RULE_SET_ID,
      name: "Updated Name",
      sortOrder: 3,
    })

    expect(result.name).toBe("Updated Name")
    expect(result.sortOrder).toBe(3)
    expect(mockPrisma.travelAllowanceRuleSet.update).toHaveBeenCalledWith({
      where: { id: RULE_SET_ID },
      data: { name: "Updated Name", sortOrder: 3 },
    })
  })

  it("throws NOT_FOUND for missing rule set", async () => {
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: RULE_SET_ID, name: "New Name" })
    ).rejects.toThrow("Travel allowance rule set not found")
  })

  it("validates name non-empty when provided", async () => {
    const existing = makeRuleSet()
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: RULE_SET_ID, name: "   " })
    ).rejects.toThrow("Rule set name is required")
  })

  it("can clear validFrom/validTo to null", async () => {
    const existing = makeRuleSet({
      validFrom: new Date("2025-01-01T00:00:00.000Z"),
      validTo: new Date("2025-12-31T00:00:00.000Z"),
    })
    const updated = makeRuleSet({ validFrom: null, validTo: null })
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.update({
      id: RULE_SET_ID,
      validFrom: null,
      validTo: null,
    })

    expect(mockPrisma.travelAllowanceRuleSet.update).toHaveBeenCalledWith({
      where: { id: RULE_SET_ID },
      data: { validFrom: null, validTo: null },
    })
  })
})

// --- travelAllowanceRuleSets.delete tests ---

describe("travelAllowanceRuleSets.delete", () => {
  it("deletes existing rule set", async () => {
    const existing = makeRuleSet()
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn().mockResolvedValue(existing),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: RULE_SET_ID })

    expect(result.success).toBe(true)
    expect(mockPrisma.travelAllowanceRuleSet.deleteMany).toHaveBeenCalledWith({
      where: { id: RULE_SET_ID, tenantId: TENANT_ID },
    })
  })

  it("throws NOT_FOUND for missing rule set", async () => {
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: RULE_SET_ID })).rejects.toThrow(
      "Travel allowance rule set not found"
    )
  })
})
