import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { departmentsRouter } from "../departments"
import { buildDepartmentTree } from "../departments"
import type { DepartmentTreeNode } from "../departments"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const DEPARTMENTS_MANAGE = permissionIdByKey("departments.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const DEPT_ID = "a0000000-0000-4000-a000-000000000200"
const PARENT_ID = "a0000000-0000-4000-a000-000000000201"
const DEPT_A_ID = "a0000000-0000-4000-a000-00000000000a"
const DEPT_B_ID = "a0000000-0000-4000-a000-00000000000b"
const DEPT_C_ID = "a0000000-0000-4000-a000-00000000000c"
const DEPT_D_ID = "a0000000-0000-4000-a000-00000000000d"
const ORPHAN_PARENT_ID = "a0000000-0000-4000-a000-0000000009ff"

const createCaller = createCallerFactory(departmentsRouter)

// --- Helpers ---

function makeDept(overrides: Partial<{
  id: string
  tenantId: string
  parentId: string | null
  code: string
  name: string
  description: string | null
  managerEmployeeId: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}> = {}) {
  return {
    id: DEPT_ID,
    tenantId: TENANT_ID,
    parentId: null,
    code: "ENG",
    name: "Engineering",
    description: null,
    managerEmployeeId: null,
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
    user: createUserWithPermissions([DEPARTMENTS_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- buildDepartmentTree tests ---

describe("buildDepartmentTree", () => {
  it("builds correct tree from flat list", () => {
    const departments = [
      makeDept({ id: DEPT_A_ID, parentId: null, code: "ENG", name: "Engineering" }),
      makeDept({ id: DEPT_B_ID, parentId: DEPT_A_ID, code: "BACKEND", name: "Backend" }),
      makeDept({ id: DEPT_C_ID, parentId: DEPT_A_ID, code: "FRONTEND", name: "Frontend" }),
      makeDept({ id: DEPT_D_ID, parentId: null, code: "HR", name: "HR" }),
    ]
    const tree = buildDepartmentTree(departments)
    expect(tree).toHaveLength(2)
    const eng = tree.find((n: DepartmentTreeNode) => n.department.code === "ENG")
    expect(eng?.children).toHaveLength(2)
    const hr = tree.find((n: DepartmentTreeNode) => n.department.code === "HR")
    expect(hr?.children).toHaveLength(0)
  })

  it("returns empty array for empty input", () => {
    expect(buildDepartmentTree([])).toEqual([])
  })

  it("handles orphan nodes (parent not in list)", () => {
    const departments = [
      makeDept({ id: DEPT_A_ID, parentId: ORPHAN_PARENT_ID, code: "ORPHAN", name: "Orphan" }),
    ]
    const tree = buildDepartmentTree(departments)
    expect(tree).toHaveLength(0)
  })
})

// --- departments.list tests ---

describe("departments.list", () => {
  it("returns departments for tenant", async () => {
    const depts = [
      makeDept({ id: DEPT_A_ID, code: "ENG", name: "Engineering" }),
      makeDept({ id: DEPT_B_ID, code: "HR", name: "HR" }),
    ]
    const mockPrisma = {
      department: {
        findMany: vi.fn().mockResolvedValue(depts),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toHaveLength(2)
    expect(result.data[0]!.code).toBe("ENG")
    expect(mockPrisma.department.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID },
      orderBy: { code: "asc" },
    })
  })

  it("filters by isActive when provided", async () => {
    const mockPrisma = {
      department: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ isActive: true })
    expect(mockPrisma.department.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, isActive: true },
      orderBy: { code: "asc" },
    })
  })

  it("filters by parentId when provided", async () => {
    const mockPrisma = {
      department: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ parentId: PARENT_ID })
    expect(mockPrisma.department.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, parentId: PARENT_ID },
      orderBy: { code: "asc" },
    })
  })

  it("returns empty array when no departments", async () => {
    const mockPrisma = {
      department: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toEqual([])
  })
})

// --- departments.getTree tests ---

describe("departments.getTree", () => {
  it("builds correct tree from flat list", async () => {
    const depts = [
      makeDept({ id: DEPT_A_ID, parentId: null, code: "ENG", name: "Engineering" }),
      makeDept({ id: DEPT_B_ID, parentId: DEPT_A_ID, code: "BACKEND", name: "Backend" }),
      makeDept({ id: DEPT_C_ID, parentId: DEPT_A_ID, code: "FRONTEND", name: "Frontend" }),
      makeDept({ id: DEPT_D_ID, parentId: null, code: "HR", name: "HR" }),
    ]
    const mockPrisma = {
      department: {
        findMany: vi.fn().mockResolvedValue(depts),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const tree = await caller.getTree()
    expect(tree).toHaveLength(2)
    const eng = tree.find((n) => n.department.code === "ENG")
    expect(eng?.children).toHaveLength(2)
    const hr = tree.find((n) => n.department.code === "HR")
    expect(hr?.children).toHaveLength(0)
  })

  it("returns empty array for empty tenant", async () => {
    const mockPrisma = {
      department: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const tree = await caller.getTree()
    expect(tree).toEqual([])
  })
})

// --- departments.getById tests ---

describe("departments.getById", () => {
  it("returns department when found", async () => {
    const dept = makeDept()
    const mockPrisma = {
      department: {
        findFirst: vi.fn().mockResolvedValue(dept),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: DEPT_ID })
    expect(result.id).toBe(DEPT_ID)
    expect(result.code).toBe("ENG")
  })

  it("throws NOT_FOUND for missing department", async () => {
    const mockPrisma = {
      department: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: DEPT_ID })).rejects.toThrow(
      "Department not found"
    )
  })

  it("scopes query to tenant", async () => {
    const dept = makeDept()
    const mockPrisma = {
      department: {
        findFirst: vi.fn().mockResolvedValue(dept),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.getById({ id: DEPT_ID })
    expect(mockPrisma.department.findFirst).toHaveBeenCalledWith({
      where: { id: DEPT_ID, tenantId: TENANT_ID },
    })
  })
})

// --- departments.create tests ---

describe("departments.create", () => {
  it("creates department successfully", async () => {
    const created = makeDept()
    const mockPrisma = {
      department: {
        findFirst: vi.fn().mockResolvedValue(null), // no existing
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({ code: "ENG", name: "Engineering" })
    expect(result.code).toBe("ENG")
    expect(mockPrisma.department.create).toHaveBeenCalled()
  })

  it("trims whitespace from code, name, description", async () => {
    const created = makeDept({ description: "Some desc" })
    const mockPrisma = {
      department: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      code: "  ENG  ",
      name: "  Engineering  ",
      description: "  Some desc  ",
    })
    const createCall = mockPrisma.department.create.mock.calls[0]![0]
    expect(createCall.data.code).toBe("ENG")
    expect(createCall.data.name).toBe("Engineering")
    expect(createCall.data.description).toBe("Some desc")
  })

  it("rejects duplicate code with CONFLICT", async () => {
    const mockPrisma = {
      department: {
        findFirst: vi.fn().mockResolvedValue(makeDept()), // existing found
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "ENG", name: "Engineering" })
    ).rejects.toThrow("Department code already exists")
  })

  it("creates with parent successfully", async () => {
    const parentDept = makeDept({ id: PARENT_ID })
    const created = makeDept({ parentId: PARENT_ID })
    const mockPrisma = {
      department: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null) // code uniqueness check
          .mockResolvedValueOnce(parentDept), // parent check
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "BACKEND",
      name: "Backend",
      parentId: PARENT_ID,
    })
    expect(result.parentId).toBe(PARENT_ID)
  })

  it("rejects non-existent parent with BAD_REQUEST", async () => {
    const mockPrisma = {
      department: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null) // code uniqueness check
          .mockResolvedValueOnce(null), // parent not found
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        code: "BACKEND",
        name: "Backend",
        parentId: PARENT_ID,
      })
    ).rejects.toThrow("Parent department not found")
  })

  it("sets isActive true by default", async () => {
    const created = makeDept({ isActive: true })
    const mockPrisma = {
      department: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({ code: "ENG", name: "Engineering" })
    const createCall = mockPrisma.department.create.mock.calls[0]![0]
    expect(createCall.data.isActive).toBe(true)
  })
})

// --- departments.update tests ---

describe("departments.update", () => {
  it("updates name, description, isActive", async () => {
    const existing = makeDept()
    const updated = makeDept({
      name: "Updated",
      description: "New desc",
      isActive: false,
    })
    const mockPrisma = {
      department: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: DEPT_ID,
      name: "Updated",
      description: "New desc",
      isActive: false,
    })
    expect(result.name).toBe("Updated")
  })

  it("updates code", async () => {
    const existing = makeDept({ code: "OLD" })
    const updated = makeDept({ code: "NEW" })
    const mockPrisma = {
      department: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing) // exists check
          .mockResolvedValueOnce(null), // uniqueness check
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: DEPT_ID, code: "NEW" })
    expect(result.code).toBe("NEW")
  })

  it("rejects empty name with BAD_REQUEST", async () => {
    const existing = makeDept()
    const mockPrisma = {
      department: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: DEPT_ID, name: "   " })
    ).rejects.toThrow("Department name is required")
  })

  it("rejects empty code with BAD_REQUEST", async () => {
    const existing = makeDept()
    const mockPrisma = {
      department: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: DEPT_ID, code: "   " })
    ).rejects.toThrow("Department code is required")
  })

  it("rejects duplicate code with CONFLICT", async () => {
    const existing = makeDept({ code: "OLD" })
    const conflicting = makeDept({ id: DEPT_B_ID, code: "NEW" })
    const mockPrisma = {
      department: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing) // exists check
          .mockResolvedValueOnce(conflicting), // uniqueness check -> conflict
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: DEPT_ID, code: "NEW" })
    ).rejects.toThrow("Department code already exists")
  })

  it("allows updating to same code (no false conflict)", async () => {
    const existing = makeDept({ code: "ENG" })
    const updated = makeDept({ code: "ENG" })
    const mockPrisma = {
      department: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: DEPT_ID, code: "ENG" })
    expect(result.code).toBe("ENG")
    // Should NOT do uniqueness check when code hasn't changed
    expect(mockPrisma.department.findFirst).toHaveBeenCalledTimes(1)
  })

  it("rejects NOT_FOUND for missing department", async () => {
    const mockPrisma = {
      department: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: DEPT_ID, name: "Updated" })
    ).rejects.toThrow("Department not found")
  })

  it("rejects self-referencing parent with BAD_REQUEST", async () => {
    const existing = makeDept()
    const mockPrisma = {
      department: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: DEPT_ID, parentId: DEPT_ID })
    ).rejects.toThrow("Circular reference detected")
  })

  it("rejects circular chain parent with BAD_REQUEST", async () => {
    // Setup: A -> B -> C, try to set A.parent = C (creates cycle C -> ... -> A -> C)
    const deptA = makeDept({ id: DEPT_A_ID, parentId: null })
    const deptC = makeDept({ id: DEPT_C_ID, parentId: DEPT_B_ID })
    const mockPrisma = {
      department: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(deptA) // exists check for A
          .mockResolvedValueOnce(deptC) // parent existence check for C
          .mockResolvedValueOnce({ parentId: DEPT_B_ID }) // findParentId: C.parentId = B
          .mockResolvedValueOnce({ parentId: DEPT_A_ID }), // findParentId: B.parentId = A -> circular!
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: DEPT_A_ID, parentId: DEPT_C_ID })
    ).rejects.toThrow("Circular reference detected")
  })

  it("rejects non-existent parent with BAD_REQUEST", async () => {
    const existing = makeDept()
    const mockPrisma = {
      department: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing) // exists check
          .mockResolvedValueOnce(null), // parent not found
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: DEPT_ID, parentId: PARENT_ID })
    ).rejects.toThrow("Parent department not found")
  })

  it("clears parent when parentId is explicitly null", async () => {
    const existing = makeDept({ parentId: PARENT_ID })
    const updated = makeDept({ parentId: null })
    const mockPrisma = {
      department: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: DEPT_ID, parentId: null })
    expect(result.parentId).toBeNull()
    const updateCall = mockPrisma.department.update.mock.calls[0]![0]
    expect(updateCall.data.parentId).toBeNull()
  })
})

// --- departments.delete tests ---

describe("departments.delete", () => {
  it("deletes department successfully", async () => {
    const existing = makeDept()
    const mockPrisma = {
      department: {
        findFirst: vi.fn().mockResolvedValue(existing),
        count: vi.fn().mockResolvedValue(0), // no children
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      employee: {
        count: vi.fn().mockResolvedValue(0), // no employees
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: DEPT_ID })
    expect(result.success).toBe(true)
    expect(mockPrisma.department.deleteMany).toHaveBeenCalledWith({
      where: { id: DEPT_ID, tenantId: expect.any(String) },
    })
  })

  it("throws NOT_FOUND for missing department", async () => {
    const mockPrisma = {
      department: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: DEPT_ID })).rejects.toThrow(
      "Department not found"
    )
  })

  it("rejects deletion when department has children", async () => {
    const existing = makeDept()
    const mockPrisma = {
      department: {
        findFirst: vi.fn().mockResolvedValue(existing),
        count: vi.fn().mockResolvedValue(2), // has children
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: DEPT_ID })).rejects.toThrow(
      "Cannot delete department with child departments"
    )
  })

  it("rejects deletion when department has employees", async () => {
    const existing = makeDept()
    const mockPrisma = {
      department: {
        findFirst: vi.fn().mockResolvedValue(existing),
        count: vi.fn().mockResolvedValue(0), // no children
      },
      employee: {
        count: vi.fn().mockResolvedValue(3), // has employees
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: DEPT_ID })).rejects.toThrow(
      "Cannot delete department with assigned employees"
    )
  })
})
