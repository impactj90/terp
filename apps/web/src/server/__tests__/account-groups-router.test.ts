import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "../trpc"
import { accountGroupsRouter } from "../routers/accountGroups"
import { permissionIdByKey } from "../lib/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const ACCOUNTS_MANAGE = permissionIdByKey("accounts.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const AG_ID = "a0000000-0000-4000-a000-000000000400"
const AG_B_ID = "a0000000-0000-4000-a000-000000000401"

const createCaller = createCallerFactory(accountGroupsRouter)

// --- Helpers ---

function makeAccountGroup(
  overrides: Partial<{
    id: string
    tenantId: string
    code: string
    name: string
    description: string | null
    sortOrder: number
    isActive: boolean
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: AG_ID,
    tenantId: TENANT_ID,
    code: "AG001",
    name: "Group A",
    description: null,
    sortOrder: 0,
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

// --- accountGroups.list tests ---

describe("accountGroups.list", () => {
  it("returns account groups for tenant", async () => {
    const groups = [
      makeAccountGroup({ id: AG_ID, code: "AG001", name: "Group A" }),
      makeAccountGroup({ id: AG_B_ID, code: "AG002", name: "Group B" }),
    ]
    const mockPrisma = {
      accountGroup: {
        findMany: vi.fn().mockResolvedValue(groups),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toHaveLength(2)
    expect(result.data[0]!.code).toBe("AG001")
    expect(mockPrisma.accountGroup.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    })
  })

  it("filters by isActive when provided", async () => {
    const mockPrisma = {
      accountGroup: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ isActive: true })
    expect(mockPrisma.accountGroup.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    })
  })

  it("returns empty array when no account groups", async () => {
    const mockPrisma = {
      accountGroup: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toEqual([])
  })
})

// --- accountGroups.getById tests ---

describe("accountGroups.getById", () => {
  it("returns account group when found", async () => {
    const ag = makeAccountGroup()
    const mockPrisma = {
      accountGroup: {
        findFirst: vi.fn().mockResolvedValue(ag),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: AG_ID })
    expect(result.id).toBe(AG_ID)
    expect(result.code).toBe("AG001")
  })

  it("throws NOT_FOUND for missing account group", async () => {
    const mockPrisma = {
      accountGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: AG_ID })).rejects.toThrow(
      "Account group not found"
    )
  })
})

// --- accountGroups.create tests ---

describe("accountGroups.create", () => {
  it("creates account group successfully", async () => {
    const created = makeAccountGroup()
    const mockPrisma = {
      accountGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({ code: "AG001", name: "Group A" })
    expect(result.code).toBe("AG001")
    expect(mockPrisma.accountGroup.create).toHaveBeenCalled()
  })

  it("trims whitespace from code, name, description", async () => {
    const created = makeAccountGroup({ description: "Some desc" })
    const mockPrisma = {
      accountGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      code: "  AG001  ",
      name: "  Group A  ",
      description: "  Some desc  ",
    })
    const createCall = mockPrisma.accountGroup.create.mock.calls[0]![0]
    expect(createCall.data.code).toBe("AG001")
    expect(createCall.data.name).toBe("Group A")
    expect(createCall.data.description).toBe("Some desc")
  })

  it("rejects duplicate code with CONFLICT", async () => {
    const mockPrisma = {
      accountGroup: {
        findFirst: vi.fn().mockResolvedValue(makeAccountGroup()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "AG001", name: "Group A" })
    ).rejects.toThrow("Account group code already exists")
  })

  it("sets isActive true by default", async () => {
    const created = makeAccountGroup({ isActive: true })
    const mockPrisma = {
      accountGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({ code: "AG001", name: "Group A" })
    const createCall = mockPrisma.accountGroup.create.mock.calls[0]![0]
    expect(createCall.data.isActive).toBe(true)
  })

  it("converts empty description to null", async () => {
    const created = makeAccountGroup()
    const mockPrisma = {
      accountGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({ code: "AG001", name: "Group A", description: "   " })
    const createCall = mockPrisma.accountGroup.create.mock.calls[0]![0]
    expect(createCall.data.description).toBeNull()
  })
})

// --- accountGroups.update tests ---

describe("accountGroups.update", () => {
  it("updates name and description", async () => {
    const existing = makeAccountGroup()
    const updated = makeAccountGroup({
      name: "Updated",
      description: "New desc",
    })
    const mockPrisma = {
      accountGroup: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: AG_ID,
      name: "Updated",
      description: "New desc",
    })
    expect(result.name).toBe("Updated")
  })

  it("rejects empty name with BAD_REQUEST", async () => {
    const existing = makeAccountGroup()
    const mockPrisma = {
      accountGroup: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: AG_ID, name: "   " })
    ).rejects.toThrow("Account group name is required")
  })

  it("rejects empty code with BAD_REQUEST", async () => {
    const existing = makeAccountGroup()
    const mockPrisma = {
      accountGroup: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: AG_ID, code: "   " })
    ).rejects.toThrow("Account group code is required")
  })

  it("rejects duplicate code with CONFLICT", async () => {
    const existing = makeAccountGroup({ code: "OLD" })
    const conflicting = makeAccountGroup({ id: AG_B_ID, code: "NEW" })
    const mockPrisma = {
      accountGroup: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(conflicting),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: AG_ID, code: "NEW" })
    ).rejects.toThrow("Account group code already exists")
  })

  it("allows updating to same code (no false conflict)", async () => {
    const existing = makeAccountGroup({ code: "AG001" })
    const updated = makeAccountGroup({ code: "AG001" })
    const mockPrisma = {
      accountGroup: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: AG_ID, code: "AG001" })
    expect(result.code).toBe("AG001")
    expect(mockPrisma.accountGroup.findFirst).toHaveBeenCalledTimes(1)
  })

  it("throws NOT_FOUND for missing account group", async () => {
    const mockPrisma = {
      accountGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: AG_ID, name: "Updated" })
    ).rejects.toThrow("Account group not found")
  })
})

// --- accountGroups.delete tests ---

describe("accountGroups.delete", () => {
  it("deletes account group successfully", async () => {
    const existing = makeAccountGroup()
    const mockPrisma = {
      accountGroup: {
        findFirst: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(existing),
      },
      account: {
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: AG_ID })
    expect(result.success).toBe(true)
    expect(mockPrisma.accountGroup.delete).toHaveBeenCalledWith({
      where: { id: AG_ID },
    })
  })

  it("throws NOT_FOUND for missing account group", async () => {
    const mockPrisma = {
      accountGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: AG_ID })).rejects.toThrow(
      "Account group not found"
    )
  })

  it("rejects deletion when accounts are assigned", async () => {
    const existing = makeAccountGroup()
    const mockPrisma = {
      accountGroup: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
      account: {
        count: vi.fn().mockResolvedValue(3),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: AG_ID })).rejects.toThrow(
      "Cannot delete account group with assigned accounts"
    )
  })
})
