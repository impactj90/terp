import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "../trpc"
import { accountsRouter } from "../routers/accounts"
import { permissionIdByKey } from "../lib/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"
import { Prisma } from "@prisma/client"

// --- Constants ---

const ACCOUNTS_MANAGE = permissionIdByKey("accounts.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ACC_ID = "a0000000-0000-4000-a000-000000000700"
const ACC_B_ID = "a0000000-0000-4000-a000-000000000701"
const SYS_ACC_ID = "a0000000-0000-4000-a000-000000000702"

const createCaller = createCallerFactory(accountsRouter)

// --- Helpers ---

function makeAccount(
  overrides: Partial<{
    id: string
    tenantId: string | null
    code: string
    name: string
    accountType: string
    unit: string
    displayFormat: string
    bonusFactor: Prisma.Decimal | null
    description: string | null
    accountGroupId: string | null
    isPayrollRelevant: boolean
    payrollCode: string | null
    sortOrder: number
    yearCarryover: boolean
    isSystem: boolean
    isActive: boolean
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: ACC_ID,
    tenantId: TENANT_ID,
    code: "ACC001",
    name: "Test Account",
    accountType: "bonus",
    unit: "minutes",
    displayFormat: "decimal",
    bonusFactor: null as Prisma.Decimal | null,
    description: null,
    accountGroupId: null,
    isPayrollRelevant: false,
    payrollCode: null,
    sortOrder: 0,
    yearCarryover: true,
    isSystem: false,
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
    user: createUserWithPermissions([ACCOUNTS_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- accounts.list tests ---

describe("accounts.list", () => {
  it("returns accounts for tenant", async () => {
    const accounts = [
      makeAccount({ id: ACC_ID, code: "ACC001" }),
      makeAccount({ id: ACC_B_ID, code: "ACC002" }),
    ]
    const mockPrisma = {
      account: {
        findMany: vi.fn().mockResolvedValue(accounts),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toHaveLength(2)
    expect(result.data[0]!.code).toBe("ACC001")
    expect(mockPrisma.account.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID },
      orderBy: [{ isSystem: "desc" }, { sortOrder: "asc" }, { code: "asc" }],
    })
  })

  it("includes system accounts when includeSystem is true", async () => {
    const mockPrisma = {
      account: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ includeSystem: true })
    expect(mockPrisma.account.findMany).toHaveBeenCalledWith({
      where: { OR: [{ tenantId: TENANT_ID }, { tenantId: null }] },
      orderBy: [{ isSystem: "desc" }, { sortOrder: "asc" }, { code: "asc" }],
    })
  })

  it("filters by isActive when provided", async () => {
    const mockPrisma = {
      account: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ isActive: true })
    expect(mockPrisma.account.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, isActive: true },
      orderBy: [{ isSystem: "desc" }, { sortOrder: "asc" }, { code: "asc" }],
    })
  })

  it("filters by accountType when provided", async () => {
    const mockPrisma = {
      account: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ accountType: "bonus" })
    expect(mockPrisma.account.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, accountType: "bonus" },
      orderBy: [{ isSystem: "desc" }, { sortOrder: "asc" }, { code: "asc" }],
    })
  })

  it("filters by payrollRelevant when provided", async () => {
    const mockPrisma = {
      account: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ payrollRelevant: true })
    expect(mockPrisma.account.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, isPayrollRelevant: true },
      orderBy: [{ isSystem: "desc" }, { sortOrder: "asc" }, { code: "asc" }],
    })
  })
})

// --- accounts.getById tests ---

describe("accounts.getById", () => {
  it("returns account when found (tenant)", async () => {
    const acc = makeAccount()
    const mockPrisma = {
      account: {
        findFirst: vi.fn().mockResolvedValue(acc),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: ACC_ID })
    expect(result.id).toBe(ACC_ID)
    expect(result.code).toBe("ACC001")
  })

  it("returns system account (tenantId null)", async () => {
    const sysAcc = makeAccount({
      id: SYS_ACC_ID,
      tenantId: null,
      isSystem: true,
      code: "FLEX",
    })
    const mockPrisma = {
      account: {
        findFirst: vi.fn().mockResolvedValue(sysAcc),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: SYS_ACC_ID })
    expect(result.tenantId).toBeNull()
    expect(result.isSystem).toBe(true)
  })

  it("throws NOT_FOUND for missing account", async () => {
    const mockPrisma = {
      account: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: ACC_ID })).rejects.toThrow(
      "Account not found"
    )
  })
})

// --- accounts.create tests ---

describe("accounts.create", () => {
  it("creates account with defaults", async () => {
    const created = makeAccount()
    const mockPrisma = {
      account: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "ACC001",
      name: "Test Account",
      accountType: "bonus",
    })
    expect(result.code).toBe("ACC001")
    const createCall = mockPrisma.account.create.mock.calls[0]![0]
    expect(createCall.data.unit).toBe("minutes")
    expect(createCall.data.displayFormat).toBe("decimal")
    expect(createCall.data.yearCarryover).toBe(true)
    expect(createCall.data.isSystem).toBe(false)
    expect(createCall.data.isActive).toBe(true)
  })

  it("rejects duplicate code with CONFLICT", async () => {
    const mockPrisma = {
      account: {
        findFirst: vi.fn().mockResolvedValue(makeAccount()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        code: "ACC001",
        name: "Test Account",
        accountType: "bonus",
      })
    ).rejects.toThrow("Account code already exists")
  })

  it("always sets isSystem to false", async () => {
    const created = makeAccount()
    const mockPrisma = {
      account: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      code: "ACC001",
      name: "Test Account",
      accountType: "bonus",
    })
    const createCall = mockPrisma.account.create.mock.calls[0]![0]
    expect(createCall.data.isSystem).toBe(false)
  })
})

// --- accounts.update tests ---

describe("accounts.update", () => {
  it("updates account fields", async () => {
    const existing = makeAccount()
    const updated = makeAccount({ name: "Updated", description: "New desc" })
    const mockPrisma = {
      account: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: ACC_ID,
      name: "Updated",
      description: "New desc",
    })
    expect(result.name).toBe("Updated")
  })

  it("rejects system account modification", async () => {
    const sysAccount = makeAccount({
      id: SYS_ACC_ID,
      tenantId: null,
      isSystem: true,
    })
    const mockPrisma = {
      account: {
        findFirst: vi.fn().mockResolvedValue(sysAccount),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: SYS_ACC_ID, name: "Updated" })
    ).rejects.toThrow("Cannot modify system account")
  })

  it("rejects empty name with BAD_REQUEST", async () => {
    const existing = makeAccount()
    const mockPrisma = {
      account: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: ACC_ID, name: "   " })
    ).rejects.toThrow("Account name is required")
  })

  it("throws NOT_FOUND for missing account", async () => {
    const mockPrisma = {
      account: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: ACC_ID, name: "Updated" })
    ).rejects.toThrow("Account not found")
  })
})

// --- accounts.delete tests ---

describe("accounts.delete", () => {
  it("deletes account successfully", async () => {
    const existing = makeAccount()
    const mockPrisma = {
      account: {
        findFirst: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: ACC_ID })
    expect(result.success).toBe(true)
  })

  it("rejects system account deletion", async () => {
    const sysAccount = makeAccount({
      id: SYS_ACC_ID,
      tenantId: null,
      isSystem: true,
    })
    const mockPrisma = {
      account: {
        findFirst: vi.fn().mockResolvedValue(sysAccount),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: SYS_ACC_ID })).rejects.toThrow(
      "Cannot delete system account"
    )
  })

  it("throws NOT_FOUND for missing account", async () => {
    const mockPrisma = {
      account: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: ACC_ID })).rejects.toThrow(
      "Account not found"
    )
  })
})

// --- accounts.getUsage tests ---

describe("accounts.getUsage", () => {
  it("returns usage data", async () => {
    const acc = makeAccount()
    const dayPlans = [
      { id: "dp-1", code: "DP001", name: "Day Plan 1" },
      { id: "dp-2", code: "DP002", name: "Day Plan 2" },
    ]
    const mockPrisma = {
      account: {
        findFirst: vi.fn().mockResolvedValue(acc),
      },
      $queryRaw: vi.fn().mockResolvedValue(dayPlans),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getUsage({ id: ACC_ID })
    expect(result.accountId).toBe(ACC_ID)
    expect(result.usageCount).toBe(2)
    expect(result.dayPlans).toHaveLength(2)
    expect(result.dayPlans[0]!.code).toBe("DP001")
  })

  it("returns empty for no usage", async () => {
    const acc = makeAccount()
    const mockPrisma = {
      account: {
        findFirst: vi.fn().mockResolvedValue(acc),
      },
      $queryRaw: vi.fn().mockResolvedValue([]),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getUsage({ id: ACC_ID })
    expect(result.usageCount).toBe(0)
    expect(result.dayPlans).toEqual([])
  })
})
