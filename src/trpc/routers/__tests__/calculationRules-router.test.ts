import { describe, it, expect, vi } from "vitest"
import { Prisma } from "@/generated/prisma/client"
import { createCallerFactory } from "@/trpc/init"
import { calculationRulesRouter } from "../calculationRules"
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
const RULE_ID = "a0000000-0000-4000-a000-000000000700"
const RULE_B_ID = "a0000000-0000-4000-a000-000000000701"
const ACCOUNT_ID = "a0000000-0000-4000-a000-000000000800"

const createCaller = createCallerFactory(calculationRulesRouter)

// --- Helpers ---

function makeRule(
  overrides: Partial<{
    id: string
    tenantId: string
    code: string
    name: string
    description: string | null
    accountId: string | null
    value: number
    factor: Prisma.Decimal
    isActive: boolean
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: RULE_ID,
    tenantId: TENANT_ID,
    code: "CR001",
    name: "Standard Rule",
    description: null,
    accountId: null,
    value: 0,
    factor: new Prisma.Decimal(1.0),
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
    user: createUserWithPermissions([ABSENCE_TYPES_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- calculationRules.list tests ---

describe("calculationRules.list", () => {
  it("returns rules for tenant", async () => {
    const rules = [
      makeRule({ id: RULE_ID, code: "CR001" }),
      makeRule({ id: RULE_B_ID, code: "CR002", name: "Half Rule" }),
    ]
    const mockPrisma = {
      calculationRule: {
        findMany: vi.fn().mockResolvedValue(rules),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toHaveLength(2)
    expect(result.data[0]!.code).toBe("CR001")
    expect(result.data[0]!.factor).toBe(1.0)
    expect(mockPrisma.calculationRule.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID },
      orderBy: { code: "asc" },
    })
  })

  it("filters by isActive when provided", async () => {
    const mockPrisma = {
      calculationRule: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ isActive: true })
    expect(mockPrisma.calculationRule.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, isActive: true },
      orderBy: { code: "asc" },
    })
  })
})

// --- calculationRules.getById tests ---

describe("calculationRules.getById", () => {
  it("returns rule when found", async () => {
    const rule = makeRule()
    const mockPrisma = {
      calculationRule: {
        findFirst: vi.fn().mockResolvedValue(rule),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: RULE_ID })
    expect(result.id).toBe(RULE_ID)
    expect(result.code).toBe("CR001")
    expect(result.factor).toBe(1.0)
  })

  it("throws NOT_FOUND for missing rule", async () => {
    const mockPrisma = {
      calculationRule: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: RULE_ID })).rejects.toThrow(
      "Calculation rule not found"
    )
  })
})

// --- calculationRules.create tests ---

describe("calculationRules.create", () => {
  it("creates rule successfully", async () => {
    const created = makeRule()
    const mockPrisma = {
      calculationRule: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({ code: "CR001", name: "Standard Rule" })
    expect(result.code).toBe("CR001")
    expect(result.factor).toBe(1.0)
    expect(mockPrisma.calculationRule.create).toHaveBeenCalled()
  })

  it("validates value >= 0", async () => {
    const mockPrisma = {
      calculationRule: {},
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "CR001", name: "Rule", value: -1 })
    ).rejects.toThrow("Value must be >= 0")
  })

  it("validates factor > 0", async () => {
    const mockPrisma = {
      calculationRule: {},
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "CR001", name: "Rule", factor: -1 })
    ).rejects.toThrow("Factor must be > 0")
  })

  it("defaults factor to 1.0 when 0", async () => {
    const created = makeRule({ factor: new Prisma.Decimal(1.0) })
    const mockPrisma = {
      calculationRule: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({ code: "CR001", name: "Rule", factor: 0 })
    const createCall = mockPrisma.calculationRule.create.mock.calls[0]![0]
    expect(Number(createCall.data.factor)).toBe(1.0)
  })

  it("rejects duplicate code with CONFLICT", async () => {
    const mockPrisma = {
      calculationRule: {
        findFirst: vi.fn().mockResolvedValue(makeRule()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "CR001", name: "Rule" })
    ).rejects.toThrow("Calculation rule code already exists")
  })
})

// --- calculationRules.update tests ---

describe("calculationRules.update", () => {
  it("updates name, description, value, factor", async () => {
    const existing = makeRule()
    const updated = makeRule({
      name: "Updated",
      description: "Desc",
      value: 100,
      factor: new Prisma.Decimal(1.5),
    })
    const mockPrisma = {
      calculationRule: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(updated),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: RULE_ID,
      name: "Updated",
      description: "Desc",
      value: 100,
      factor: 1.5,
    })
    expect(result.name).toBe("Updated")
    expect(result.factor).toBe(1.5)
  })

  it("handles nullable accountId", async () => {
    const existing = makeRule({ accountId: ACCOUNT_ID })
    const updated = makeRule({ accountId: null })
    const mockPrisma = {
      calculationRule: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(updated),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: RULE_ID, accountId: null })
    expect(result.accountId).toBeNull()
    const updateCall = mockPrisma.calculationRule.updateMany.mock.calls[0]![0]
    expect(updateCall.data.accountId).toBeNull()
  })

  it("throws NOT_FOUND for missing rule", async () => {
    const mockPrisma = {
      calculationRule: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: RULE_ID, name: "Updated" })
    ).rejects.toThrow("Calculation rule not found")
  })
})

// --- calculationRules.delete tests ---

describe("calculationRules.delete", () => {
  it("deletes rule successfully", async () => {
    const existing = makeRule()
    const mockPrisma = {
      calculationRule: {
        findFirst: vi.fn().mockResolvedValue(existing),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ count: 0 }]),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: RULE_ID })
    expect(result.success).toBe(true)
    expect(mockPrisma.calculationRule.deleteMany).toHaveBeenCalledWith({
      where: { id: RULE_ID, tenantId: TENANT_ID },
    })
  })

  it("rejects deletion when absence types reference it", async () => {
    const existing = makeRule()
    const mockPrisma = {
      calculationRule: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ count: 3 }]),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: RULE_ID })).rejects.toThrow(
      "Cannot delete calculation rule that is in use by absence types"
    )
  })

  it("throws NOT_FOUND for missing rule", async () => {
    const mockPrisma = {
      calculationRule: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: RULE_ID })).rejects.toThrow(
      "Calculation rule not found"
    )
  })
})
