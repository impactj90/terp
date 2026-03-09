import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { vacationCappingRuleGroupsRouter } from "../routers/vacationCappingRuleGroups"
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
const GROUP_ID = "a0000000-0000-4000-a000-000000000b00"
const RULE_ID = "a0000000-0000-4000-a000-000000000b01"

const createCaller = createCallerFactory(vacationCappingRuleGroupsRouter)

// --- Helpers ---

function makeRuleGroup(
  overrides: Partial<{
    id: string
    tenantId: string
    code: string
    name: string
    description: string | null
    isActive: boolean
    createdAt: Date
    updatedAt: Date
    cappingRuleLinks: Array<{
      cappingRule: {
        id: string
        code: string
        name: string
        ruleType: string
        capValue: number
      }
    }>
  }> = {}
) {
  return {
    id: GROUP_ID,
    tenantId: TENANT_ID,
    code: "CRG001",
    name: "Standard Rule Group",
    description: null,
    isActive: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    cappingRuleLinks: [],
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

// --- vacationCappingRuleGroups.list tests ---

describe("vacationCappingRuleGroups.list", () => {
  it("returns all rule groups for tenant", async () => {
    const items = [
      makeRuleGroup({ code: "CRG001" }),
      makeRuleGroup({ code: "CRG002", name: "Premium Rule Group" }),
    ]
    const mockPrisma = {
      vacationCappingRuleGroup: {
        findMany: vi.fn().mockResolvedValue(items),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toHaveLength(2)
    expect(result.data[0]!.code).toBe("CRG001")
  })

  it("filters by isActive", async () => {
    const mockPrisma = {
      vacationCappingRuleGroup: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ isActive: false })
    expect(mockPrisma.vacationCappingRuleGroup.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, isActive: false },
      include: expect.any(Object),
      orderBy: { code: "asc" },
    })
  })
})

// --- vacationCappingRuleGroups.getById tests ---

describe("vacationCappingRuleGroups.getById", () => {
  it("returns rule group with capping rules", async () => {
    const item = makeRuleGroup({
      cappingRuleLinks: [
        {
          cappingRule: {
            id: RULE_ID,
            code: "CR001",
            name: "Year End Cap",
            ruleType: "year_end",
            capValue: 10,
          },
        },
      ],
    })
    const mockPrisma = {
      vacationCappingRuleGroup: {
        findFirst: vi.fn().mockResolvedValue(item),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: GROUP_ID })
    expect(result.id).toBe(GROUP_ID)
    expect(result.cappingRules).toHaveLength(1)
    expect(result.cappingRules![0]!.ruleType).toBe("year_end")
  })

  it("throws NOT_FOUND for non-existent group", async () => {
    const mockPrisma = {
      vacationCappingRuleGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: GROUP_ID })).rejects.toThrow(
      "Vacation capping rule group not found"
    )
  })
})

// --- vacationCappingRuleGroups.create tests ---

describe("vacationCappingRuleGroups.create", () => {
  it("creates rule group with required fields", async () => {
    const created = makeRuleGroup()
    const mockPrisma = {
      vacationCappingRuleGroup: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null) // code uniqueness
          .mockResolvedValueOnce(created), // re-fetch
      },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          vacationCappingRuleGroup: {
            create: vi.fn().mockResolvedValue(created),
          },
          vacationCappingRuleGroupRule: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        })
      }),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "CRG001",
      name: "Standard Rule Group",
    })
    expect(result.code).toBe("CRG001")
    expect(result.name).toBe("Standard Rule Group")
  })

  it("creates rule group with capping rule IDs", async () => {
    const created = makeRuleGroup({
      cappingRuleLinks: [
        {
          cappingRule: {
            id: RULE_ID,
            code: "CR001",
            name: "Year End Cap",
            ruleType: "year_end",
            capValue: 10,
          },
        },
      ],
    })
    const mockPrisma = {
      vacationCappingRuleGroup: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null) // code uniqueness
          .mockResolvedValueOnce(created), // re-fetch
      },
      vacationCappingRule: {
        findMany: vi.fn().mockResolvedValue([{ id: RULE_ID }]),
      },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          vacationCappingRuleGroup: {
            create: vi.fn().mockResolvedValue({ ...created, cappingRuleLinks: undefined }),
          },
          vacationCappingRuleGroupRule: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        })
      }),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "CRG001",
      name: "Standard Rule Group",
      cappingRuleIds: [RULE_ID],
    })
    expect(result.cappingRules).toHaveLength(1)
  })

  it("throws CONFLICT for duplicate code", async () => {
    const mockPrisma = {
      vacationCappingRuleGroup: {
        findFirst: vi.fn().mockResolvedValue(makeRuleGroup()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "CRG001", name: "Group" })
    ).rejects.toThrow("Capping rule group code already exists")
  })

  it("throws BAD_REQUEST for empty code", async () => {
    const mockPrisma = {
      vacationCappingRuleGroup: {},
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "   ", name: "Group" })
    ).rejects.toThrow("Code is required")
  })

  it("throws BAD_REQUEST for invalid capping rule IDs", async () => {
    const mockPrisma = {
      vacationCappingRuleGroup: {
        findFirst: vi.fn().mockResolvedValue(null), // code uniqueness
      },
      vacationCappingRule: {
        findMany: vi.fn().mockResolvedValue([]), // none found
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        code: "CRG001",
        name: "Group",
        cappingRuleIds: [RULE_ID],
      })
    ).rejects.toThrow("One or more capping rule IDs are invalid")
  })
})

// --- vacationCappingRuleGroups.update tests ---

describe("vacationCappingRuleGroups.update", () => {
  it("updates name successfully", async () => {
    const existing = makeRuleGroup()
    const updated = makeRuleGroup({ name: "Updated Group" })
    const mockPrisma = {
      vacationCappingRuleGroup: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing) // existence check
          .mockResolvedValueOnce(updated), // re-fetch
      },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          vacationCappingRuleGroup: {
            update: vi.fn().mockResolvedValue(updated),
          },
          vacationCappingRuleGroupRule: {
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
      vacationCappingRuleGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: GROUP_ID, name: "Updated" })
    ).rejects.toThrow("Vacation capping rule group not found")
  })

  it("throws BAD_REQUEST for empty name", async () => {
    const existing = makeRuleGroup()
    const mockPrisma = {
      vacationCappingRuleGroup: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: GROUP_ID, name: "   " })
    ).rejects.toThrow("Name is required")
  })
})

// --- vacationCappingRuleGroups.delete tests ---

describe("vacationCappingRuleGroups.delete", () => {
  it("deletes rule group successfully", async () => {
    const existing = makeRuleGroup()
    const mockPrisma = {
      vacationCappingRuleGroup: {
        findFirst: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(existing),
      },
      tariff: {
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: GROUP_ID })
    expect(result.success).toBe(true)
  })

  it("throws NOT_FOUND for non-existent group", async () => {
    const mockPrisma = {
      vacationCappingRuleGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: GROUP_ID })).rejects.toThrow(
      "Vacation capping rule group not found"
    )
  })

  it("throws BAD_REQUEST when group is used by tariffs", async () => {
    const existing = makeRuleGroup()
    const mockPrisma = {
      vacationCappingRuleGroup: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
      tariff: {
        count: vi.fn().mockResolvedValue(2),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: GROUP_ID })).rejects.toThrow(
      "Cannot delete capping rule group that is assigned to tariffs"
    )
  })
})
