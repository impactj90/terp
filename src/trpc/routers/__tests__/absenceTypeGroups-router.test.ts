import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { absenceTypeGroupsRouter } from "../absenceTypeGroups"
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
const GROUP_ID = "a0000000-0000-4000-a000-000000000600"
const GROUP_B_ID = "a0000000-0000-4000-a000-000000000601"

const createCaller = createCallerFactory(absenceTypeGroupsRouter)

// --- Helpers ---

function makeGroup(
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
    id: GROUP_ID,
    tenantId: TENANT_ID,
    code: "ATG001",
    name: "Vacation Group",
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
    user: createUserWithPermissions([ABSENCE_TYPES_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- absenceTypeGroups.list tests ---

describe("absenceTypeGroups.list", () => {
  it("returns groups for tenant", async () => {
    const groups = [
      makeGroup({ id: GROUP_ID, code: "ATG001" }),
      makeGroup({ id: GROUP_B_ID, code: "ATG002", name: "Sick Leave Group" }),
    ]
    const mockPrisma = {
      absenceTypeGroup: {
        findMany: vi.fn().mockResolvedValue(groups),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toHaveLength(2)
    expect(result.data[0]!.code).toBe("ATG001")
    expect(mockPrisma.absenceTypeGroup.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID },
      orderBy: { code: "asc" },
    })
  })

  it("filters by isActive when provided", async () => {
    const mockPrisma = {
      absenceTypeGroup: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ isActive: true })
    expect(mockPrisma.absenceTypeGroup.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, isActive: true },
      orderBy: { code: "asc" },
    })
  })

  it("returns empty array when no groups", async () => {
    const mockPrisma = {
      absenceTypeGroup: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toEqual([])
  })
})

// --- absenceTypeGroups.getById tests ---

describe("absenceTypeGroups.getById", () => {
  it("returns group when found", async () => {
    const group = makeGroup()
    const mockPrisma = {
      absenceTypeGroup: {
        findFirst: vi.fn().mockResolvedValue(group),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: GROUP_ID })
    expect(result.id).toBe(GROUP_ID)
    expect(result.code).toBe("ATG001")
  })

  it("throws NOT_FOUND for missing group", async () => {
    const mockPrisma = {
      absenceTypeGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: GROUP_ID })).rejects.toThrow(
      "Absence type group not found"
    )
  })
})

// --- absenceTypeGroups.create tests ---

describe("absenceTypeGroups.create", () => {
  it("creates group successfully", async () => {
    const created = makeGroup()
    const mockPrisma = {
      absenceTypeGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "ATG001",
      name: "Vacation Group",
    })
    expect(result.code).toBe("ATG001")
    expect(mockPrisma.absenceTypeGroup.create).toHaveBeenCalled()
  })

  it("trims whitespace from code, name, description", async () => {
    const created = makeGroup({ description: "Some desc" })
    const mockPrisma = {
      absenceTypeGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      code: "  ATG001  ",
      name: "  Vacation Group  ",
      description: "  Some desc  ",
    })
    const createCall = mockPrisma.absenceTypeGroup.create.mock.calls[0]![0]
    expect(createCall.data.code).toBe("ATG001")
    expect(createCall.data.name).toBe("Vacation Group")
    expect(createCall.data.description).toBe("Some desc")
  })

  it("rejects empty code with BAD_REQUEST", async () => {
    const mockPrisma = {
      absenceTypeGroup: {},
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "   ", name: "Vacation Group" })
    ).rejects.toThrow("Absence type group code is required")
  })

  it("rejects empty name with BAD_REQUEST", async () => {
    const mockPrisma = {
      absenceTypeGroup: {},
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "ATG001", name: "   " })
    ).rejects.toThrow("Absence type group name is required")
  })

  it("rejects duplicate code with CONFLICT", async () => {
    const mockPrisma = {
      absenceTypeGroup: {
        findFirst: vi.fn().mockResolvedValue(makeGroup()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "ATG001", name: "Vacation Group" })
    ).rejects.toThrow("Absence type group code already exists")
  })
})

// --- absenceTypeGroups.update tests ---

describe("absenceTypeGroups.update", () => {
  it("updates name and description", async () => {
    const existing = makeGroup()
    const updated = makeGroup({ name: "Updated", description: "New desc" })
    const mockPrisma = {
      absenceTypeGroup: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: GROUP_ID,
      name: "Updated",
      description: "New desc",
    })
    expect(result.name).toBe("Updated")
  })

  it("updates code with uniqueness re-check", async () => {
    const existing = makeGroup({ code: "OLD" })
    const updated = makeGroup({ code: "NEW" })
    const mockPrisma = {
      absenceTypeGroup: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(null),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: GROUP_ID, code: "NEW" })
    expect(result.code).toBe("NEW")
  })

  it("rejects duplicate code with CONFLICT", async () => {
    const existing = makeGroup({ code: "OLD" })
    const conflicting = makeGroup({ id: GROUP_B_ID, code: "NEW" })
    const mockPrisma = {
      absenceTypeGroup: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(conflicting),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: GROUP_ID, code: "NEW" })
    ).rejects.toThrow("Absence type group code already exists")
  })

  it("allows same code (no duplicate check when code unchanged)", async () => {
    const existing = makeGroup({ code: "ATG001" })
    const updated = makeGroup({ code: "ATG001" })
    const mockPrisma = {
      absenceTypeGroup: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: GROUP_ID, code: "ATG001" })
    expect(result.code).toBe("ATG001")
    // Only called once for existence check, not a second time for uniqueness
    expect(mockPrisma.absenceTypeGroup.findFirst).toHaveBeenCalledTimes(1)
  })

  it("throws NOT_FOUND for missing group", async () => {
    const mockPrisma = {
      absenceTypeGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: GROUP_ID, name: "Updated" })
    ).rejects.toThrow("Absence type group not found")
  })

  it("can set isActive to false", async () => {
    const existing = makeGroup({ isActive: true })
    const updated = makeGroup({ isActive: false })
    const mockPrisma = {
      absenceTypeGroup: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: GROUP_ID, isActive: false })
    expect(result.isActive).toBe(false)
    const updateCall = mockPrisma.absenceTypeGroup.update.mock.calls[0]![0]
    expect(updateCall.data.isActive).toBe(false)
  })
})

// --- absenceTypeGroups.delete tests ---

describe("absenceTypeGroups.delete", () => {
  it("deletes group successfully", async () => {
    const existing = makeGroup()
    const mockPrisma = {
      absenceTypeGroup: {
        findFirst: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: GROUP_ID })
    expect(result.success).toBe(true)
    expect(mockPrisma.absenceTypeGroup.delete).toHaveBeenCalledWith({
      where: { id: GROUP_ID },
    })
  })

  it("throws NOT_FOUND for missing group", async () => {
    const mockPrisma = {
      absenceTypeGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: GROUP_ID })).rejects.toThrow(
      "Absence type group not found"
    )
  })
})
