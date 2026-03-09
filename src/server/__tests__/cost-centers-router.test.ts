import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { costCentersRouter } from "../routers/costCenters"
import { permissionIdByKey } from "../lib/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const COST_CENTERS_MANAGE = permissionIdByKey("cost_centers.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const CC_ID = "a0000000-0000-4000-a000-000000000300"
const CC_B_ID = "a0000000-0000-4000-a000-000000000301"

const createCaller = createCallerFactory(costCentersRouter)

// --- Helpers ---

function makeCostCenter(
  overrides: Partial<{
    id: string
    tenantId: string
    code: string
    name: string
    description: string | null
    isActive: boolean
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: CC_ID,
    tenantId: TENANT_ID,
    code: "CC001",
    name: "Engineering",
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
    user: createUserWithPermissions([COST_CENTERS_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- costCenters.list tests ---

describe("costCenters.list", () => {
  it("returns cost centers for tenant", async () => {
    const ccs = [
      makeCostCenter({ id: CC_ID, code: "CC001", name: "Engineering" }),
      makeCostCenter({ id: CC_B_ID, code: "CC002", name: "Marketing" }),
    ]
    const mockPrisma = {
      costCenter: {
        findMany: vi.fn().mockResolvedValue(ccs),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toHaveLength(2)
    expect(result.data[0]!.code).toBe("CC001")
    expect(mockPrisma.costCenter.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID },
      orderBy: { code: "asc" },
    })
  })

  it("filters by isActive when provided", async () => {
    const mockPrisma = {
      costCenter: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ isActive: true })
    expect(mockPrisma.costCenter.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, isActive: true },
      orderBy: { code: "asc" },
    })
  })

  it("returns empty array when no cost centers", async () => {
    const mockPrisma = {
      costCenter: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toEqual([])
  })
})

// --- costCenters.getById tests ---

describe("costCenters.getById", () => {
  it("returns cost center when found", async () => {
    const cc = makeCostCenter()
    const mockPrisma = {
      costCenter: {
        findFirst: vi.fn().mockResolvedValue(cc),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: CC_ID })
    expect(result.id).toBe(CC_ID)
    expect(result.code).toBe("CC001")
  })

  it("throws NOT_FOUND for missing cost center", async () => {
    const mockPrisma = {
      costCenter: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: CC_ID })).rejects.toThrow(
      "Cost center not found"
    )
  })
})

// --- costCenters.create tests ---

describe("costCenters.create", () => {
  it("creates cost center successfully", async () => {
    const created = makeCostCenter()
    const mockPrisma = {
      costCenter: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({ code: "CC001", name: "Engineering" })
    expect(result.code).toBe("CC001")
    expect(mockPrisma.costCenter.create).toHaveBeenCalled()
  })

  it("trims whitespace from code, name, description", async () => {
    const created = makeCostCenter({ description: "Some desc" })
    const mockPrisma = {
      costCenter: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      code: "  CC001  ",
      name: "  Engineering  ",
      description: "  Some desc  ",
    })
    const createCall = mockPrisma.costCenter.create.mock.calls[0]![0]
    expect(createCall.data.code).toBe("CC001")
    expect(createCall.data.name).toBe("Engineering")
    expect(createCall.data.description).toBe("Some desc")
  })

  it("rejects duplicate code with CONFLICT", async () => {
    const mockPrisma = {
      costCenter: {
        findFirst: vi.fn().mockResolvedValue(makeCostCenter()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "CC001", name: "Engineering" })
    ).rejects.toThrow("Cost center code already exists")
  })

  it("sets isActive true by default", async () => {
    const created = makeCostCenter({ isActive: true })
    const mockPrisma = {
      costCenter: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({ code: "CC001", name: "Engineering" })
    const createCall = mockPrisma.costCenter.create.mock.calls[0]![0]
    expect(createCall.data.isActive).toBe(true)
  })
})

// --- costCenters.update tests ---

describe("costCenters.update", () => {
  it("updates name and description", async () => {
    const existing = makeCostCenter()
    const updated = makeCostCenter({
      name: "Updated",
      description: "New desc",
    })
    const mockPrisma = {
      costCenter: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: CC_ID,
      name: "Updated",
      description: "New desc",
    })
    expect(result.name).toBe("Updated")
  })

  it("rejects empty name with BAD_REQUEST", async () => {
    const existing = makeCostCenter()
    const mockPrisma = {
      costCenter: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: CC_ID, name: "   " })
    ).rejects.toThrow("Cost center name is required")
  })

  it("rejects empty code with BAD_REQUEST", async () => {
    const existing = makeCostCenter()
    const mockPrisma = {
      costCenter: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: CC_ID, code: "   " })
    ).rejects.toThrow("Cost center code is required")
  })

  it("rejects duplicate code with CONFLICT", async () => {
    const existing = makeCostCenter({ code: "OLD" })
    const conflicting = makeCostCenter({ id: CC_B_ID, code: "NEW" })
    const mockPrisma = {
      costCenter: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(conflicting),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: CC_ID, code: "NEW" })
    ).rejects.toThrow("Cost center code already exists")
  })

  it("allows updating to same code (no false conflict)", async () => {
    const existing = makeCostCenter({ code: "CC001" })
    const updated = makeCostCenter({ code: "CC001" })
    const mockPrisma = {
      costCenter: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: CC_ID, code: "CC001" })
    expect(result.code).toBe("CC001")
    expect(mockPrisma.costCenter.findFirst).toHaveBeenCalledTimes(1)
  })

  it("throws NOT_FOUND for missing cost center", async () => {
    const mockPrisma = {
      costCenter: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: CC_ID, name: "Updated" })
    ).rejects.toThrow("Cost center not found")
  })
})

// --- costCenters.delete tests ---

describe("costCenters.delete", () => {
  it("deletes cost center successfully", async () => {
    const existing = makeCostCenter()
    const mockPrisma = {
      costCenter: {
        findFirst: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(existing),
      },
      employee: {
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: CC_ID })
    expect(result.success).toBe(true)
    expect(mockPrisma.costCenter.delete).toHaveBeenCalledWith({
      where: { id: CC_ID },
    })
  })

  it("throws NOT_FOUND for missing cost center", async () => {
    const mockPrisma = {
      costCenter: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: CC_ID })).rejects.toThrow(
      "Cost center not found"
    )
  })

  it("rejects deletion when employees are assigned", async () => {
    const existing = makeCostCenter()
    const mockPrisma = {
      costCenter: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
      employee: {
        count: vi.fn().mockResolvedValue(3),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: CC_ID })).rejects.toThrow(
      "Cannot delete cost center with assigned employees"
    )
  })
})
