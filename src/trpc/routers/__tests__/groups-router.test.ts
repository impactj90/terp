import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { groupsRouter } from "../groups"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const GROUPS_MANAGE = permissionIdByKey("groups.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const GROUP_ID = "a0000000-0000-4000-a000-000000000400"
const GROUP_B_ID = "a0000000-0000-4000-a000-000000000401"

const createCaller = createCallerFactory(groupsRouter)

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
    code: "GRP001",
    name: "Group Alpha",
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
    user: createUserWithPermissions([GROUPS_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- groups.list tests ---

describe("groups.list", () => {
  it("returns groups for each type", async () => {
    for (const type of ["employee", "workflow", "activity"] as const) {
      const groups = [
        makeGroup({ id: GROUP_ID, code: "GRP001" }),
        makeGroup({ id: GROUP_B_ID, code: "GRP002" }),
      ]
      const delegateName =
        type === "employee"
          ? "employeeGroup"
          : type === "workflow"
            ? "workflowGroup"
            : "activityGroup"
      const mockPrisma = {
        [delegateName]: {
          findMany: vi.fn().mockResolvedValue(groups),
        },
      }
      const caller = createCaller(createTestContext(mockPrisma))
      const result = await caller.list({ type })
      expect(result.data).toHaveLength(2)
      expect(result.data[0]!.code).toBe("GRP001")
    }
  })

  it("filters by isActive when provided", async () => {
    const mockPrisma = {
      employeeGroup: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ type: "employee", isActive: true })
    expect(mockPrisma.employeeGroup.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, isActive: true },
      orderBy: { code: "asc" },
    })
  })

  it("returns empty array when no groups", async () => {
    const mockPrisma = {
      employeeGroup: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list({ type: "employee" })
    expect(result.data).toEqual([])
  })
})

// --- groups.getById tests ---

describe("groups.getById", () => {
  it("returns group when found for each type", async () => {
    for (const type of ["employee", "workflow", "activity"] as const) {
      const group = makeGroup()
      const delegateName =
        type === "employee"
          ? "employeeGroup"
          : type === "workflow"
            ? "workflowGroup"
            : "activityGroup"
      const mockPrisma = {
        [delegateName]: {
          findFirst: vi.fn().mockResolvedValue(group),
        },
      }
      const caller = createCaller(createTestContext(mockPrisma))
      const result = await caller.getById({ type, id: GROUP_ID })
      expect(result.id).toBe(GROUP_ID)
      expect(result.code).toBe("GRP001")
    }
  })

  it("throws NOT_FOUND for missing group", async () => {
    const mockPrisma = {
      employeeGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.getById({ type: "employee", id: GROUP_ID })
    ).rejects.toThrow("Group not found")
  })
})

// --- groups.create tests ---

describe("groups.create", () => {
  it("creates group successfully", async () => {
    const created = makeGroup()
    const mockPrisma = {
      employeeGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      type: "employee",
      code: "GRP001",
      name: "Group Alpha",
    })
    expect(result.code).toBe("GRP001")
    expect(mockPrisma.employeeGroup.create).toHaveBeenCalled()
  })

  it("trims whitespace from code, name, description", async () => {
    const created = makeGroup({ description: "Some desc" })
    const mockPrisma = {
      employeeGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      type: "employee",
      code: "  GRP001  ",
      name: "  Group Alpha  ",
      description: "  Some desc  ",
    })
    const createCall = mockPrisma.employeeGroup.create.mock.calls[0]![0]
    expect(createCall.data.code).toBe("GRP001")
    expect(createCall.data.name).toBe("Group Alpha")
    expect(createCall.data.description).toBe("Some desc")
  })

  it("rejects empty code with BAD_REQUEST", async () => {
    const mockPrisma = {
      employeeGroup: {},
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ type: "employee", code: "   ", name: "Group Alpha" })
    ).rejects.toThrow("Group code is required")
  })

  it("rejects empty name with BAD_REQUEST", async () => {
    const mockPrisma = {
      employeeGroup: {},
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ type: "employee", code: "GRP001", name: "   " })
    ).rejects.toThrow("Group name is required")
  })

  it("rejects duplicate code with CONFLICT", async () => {
    const mockPrisma = {
      employeeGroup: {
        findFirst: vi.fn().mockResolvedValue(makeGroup()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ type: "employee", code: "GRP001", name: "Group Alpha" })
    ).rejects.toThrow("Group code already exists")
  })

  it("sets isActive true by default", async () => {
    const created = makeGroup({ isActive: true })
    const mockPrisma = {
      employeeGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      type: "employee",
      code: "GRP001",
      name: "Group Alpha",
    })
    const createCall = mockPrisma.employeeGroup.create.mock.calls[0]![0]
    expect(createCall.data.isActive).toBe(true)
  })
})

// --- groups.update tests ---

describe("groups.update", () => {
  it("updates name and description", async () => {
    const existing = makeGroup()
    const updated = makeGroup({ name: "Updated", description: "New desc" })
    const mockPrisma = {
      employeeGroup: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(updated),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      type: "employee",
      id: GROUP_ID,
      name: "Updated",
      description: "New desc",
    })
    expect(result.name).toBe("Updated")
  })

  it("rejects empty name with BAD_REQUEST", async () => {
    const existing = makeGroup()
    const mockPrisma = {
      employeeGroup: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ type: "employee", id: GROUP_ID, name: "   " })
    ).rejects.toThrow("Group name is required")
  })

  it("rejects empty code with BAD_REQUEST", async () => {
    const existing = makeGroup()
    const mockPrisma = {
      employeeGroup: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ type: "employee", id: GROUP_ID, code: "   " })
    ).rejects.toThrow("Group code is required")
  })

  it("rejects duplicate code with CONFLICT", async () => {
    const existing = makeGroup({ code: "OLD" })
    const conflicting = makeGroup({ id: GROUP_B_ID, code: "NEW" })
    const mockPrisma = {
      employeeGroup: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(conflicting),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ type: "employee", id: GROUP_ID, code: "NEW" })
    ).rejects.toThrow("Group code already exists")
  })

  it("allows updating to same code (no false conflict)", async () => {
    const existing = makeGroup({ code: "GRP001" })
    const updated = makeGroup({ code: "GRP001" })
    const mockPrisma = {
      employeeGroup: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(updated),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      type: "employee",
      id: GROUP_ID,
      code: "GRP001",
    })
    expect(result.code).toBe("GRP001")
    // findFirst called twice: once for existence check, once for re-fetch after updateMany
    expect(mockPrisma.employeeGroup.findFirst).toHaveBeenCalledTimes(2)
  })

  it("throws NOT_FOUND for missing group", async () => {
    const mockPrisma = {
      employeeGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ type: "employee", id: GROUP_ID, name: "Updated" })
    ).rejects.toThrow("Group not found")
  })
})

// --- groups.delete tests ---

describe("groups.delete", () => {
  it("deletes group successfully", async () => {
    const existing = makeGroup()
    const mockPrisma = {
      employeeGroup: {
        findFirst: vi.fn().mockResolvedValue(existing),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      employee: {
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ type: "employee", id: GROUP_ID })
    expect(result.success).toBe(true)
    expect(mockPrisma.employeeGroup.deleteMany).toHaveBeenCalledWith({
      where: { id: GROUP_ID, tenantId: TENANT_ID },
    })
  })

  it("throws NOT_FOUND for missing group", async () => {
    const mockPrisma = {
      employeeGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.delete({ type: "employee", id: GROUP_ID })
    ).rejects.toThrow("Group not found")
  })

  it("rejects deletion when employees are assigned", async () => {
    const existing = makeGroup()
    const mockPrisma = {
      employeeGroup: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
      employee: {
        count: vi.fn().mockResolvedValue(3),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.delete({ type: "employee", id: GROUP_ID })
    ).rejects.toThrow("Cannot delete group with assigned employees")
  })

  it("checks correct employee FK for each group type", async () => {
    for (const type of ["employee", "workflow", "activity"] as const) {
      const existing = makeGroup()
      const delegateName =
        type === "employee"
          ? "employeeGroup"
          : type === "workflow"
            ? "workflowGroup"
            : "activityGroup"
      const fkColumn =
        type === "employee"
          ? "employeeGroupId"
          : type === "workflow"
            ? "workflowGroupId"
            : "activityGroupId"
      const mockPrisma = {
        [delegateName]: {
          findFirst: vi.fn().mockResolvedValue(existing),
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        employee: {
          count: vi.fn().mockResolvedValue(0),
        },
      }
      const caller = createCaller(createTestContext(mockPrisma))
      await caller.delete({ type, id: GROUP_ID })
      expect(mockPrisma.employee.count).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, [fkColumn]: GROUP_ID },
      })
    }
  })
})
