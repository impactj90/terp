import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { orderAssignmentsRouter } from "../orderAssignments"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const ORDER_ASSIGNMENTS_MANAGE = permissionIdByKey("order_assignments.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ASSIGNMENT_ID = "a0000000-0000-4000-a000-000000000700"
const ORDER_ID = "a0000000-0000-4000-a000-000000000600"
const EMPLOYEE_ID = "a0000000-0000-4000-a000-000000000200"

const createCaller = createCallerFactory(orderAssignmentsRouter)

// --- Helpers ---

const mockOrder = { id: ORDER_ID, code: "ORD001", name: "Project Alpha" }
const mockEmployee = {
  id: EMPLOYEE_ID,
  firstName: "John",
  lastName: "Doe",
  personnelNumber: "EMP001",
}

function makeAssignment(
  overrides: Partial<{
    id: string
    tenantId: string
    orderId: string
    employeeId: string
    role: string
    validFrom: Date | null
    validTo: Date | null
    isActive: boolean
    createdAt: Date
    updatedAt: Date
    order: { id: string; code: string; name: string }
    employee: {
      id: string
      firstName: string
      lastName: string
      personnelNumber: string
    }
  }> = {}
) {
  return {
    id: ASSIGNMENT_ID,
    tenantId: TENANT_ID,
    orderId: ORDER_ID,
    employeeId: EMPLOYEE_ID,
    role: "worker",
    validFrom: null,
    validTo: null,
    isActive: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    order: mockOrder,
    employee: mockEmployee,
    ...overrides,
  }
}

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([ORDER_ASSIGNMENTS_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- orderAssignments.list tests ---

describe("orderAssignments.list", () => {
  it("returns assignments with relations", async () => {
    const assignments = [makeAssignment()]
    const mockPrisma = {
      orderAssignment: {
        findMany: vi.fn().mockResolvedValue(assignments),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toHaveLength(1)
    expect(result.data[0]!.order.code).toBe("ORD001")
    expect(result.data[0]!.employee.firstName).toBe("John")
  })

  it("filters by orderId", async () => {
    const mockPrisma = {
      orderAssignment: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ orderId: ORDER_ID })
    expect(mockPrisma.orderAssignment.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, orderId: ORDER_ID },
      orderBy: { createdAt: "desc" },
      include: {
        order: { select: { id: true, code: true, name: true } },
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            personnelNumber: true,
          },
        },
      },
    })
  })

  it("filters by employeeId", async () => {
    const mockPrisma = {
      orderAssignment: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ employeeId: EMPLOYEE_ID })
    expect(mockPrisma.orderAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_ID, employeeId: EMPLOYEE_ID },
      })
    )
  })

  it("returns empty array", async () => {
    const mockPrisma = {
      orderAssignment: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toEqual([])
  })
})

// --- orderAssignments.getById tests ---

describe("orderAssignments.getById", () => {
  it("returns assignment with relations", async () => {
    const assignment = makeAssignment()
    const mockPrisma = {
      orderAssignment: {
        findFirst: vi.fn().mockResolvedValue(assignment),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: ASSIGNMENT_ID })
    expect(result.id).toBe(ASSIGNMENT_ID)
    expect(result.order.code).toBe("ORD001")
    expect(result.employee.lastName).toBe("Doe")
  })

  it("throws NOT_FOUND for missing assignment", async () => {
    const mockPrisma = {
      orderAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.getById({ id: ASSIGNMENT_ID })
    ).rejects.toThrow("Order assignment not found")
  })
})

// --- orderAssignments.byOrder tests ---

describe("orderAssignments.byOrder", () => {
  it("returns assignments for order with employee details", async () => {
    const assignments = [
      makeAssignment({ role: "leader" }),
      makeAssignment({
        id: "a0000000-0000-4000-a000-000000000701",
        role: "worker",
      }),
    ]
    const mockPrisma = {
      orderAssignment: {
        findMany: vi.fn().mockResolvedValue(assignments),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.byOrder({ orderId: ORDER_ID })
    expect(result.data).toHaveLength(2)
    expect(result.data[0]!.role).toBe("leader")
    expect(mockPrisma.orderAssignment.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, orderId: ORDER_ID },
      orderBy: [{ role: "asc" }, { createdAt: "desc" }],
      include: {
        order: { select: { id: true, code: true, name: true } },
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            personnelNumber: true,
          },
        },
      },
    })
  })

  it("returns empty when no assignments", async () => {
    const mockPrisma = {
      orderAssignment: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.byOrder({ orderId: ORDER_ID })
    expect(result.data).toEqual([])
  })
})

// --- orderAssignments.create tests ---

describe("orderAssignments.create", () => {
  it("creates assignment with default role worker", async () => {
    const created = makeAssignment()
    const mockPrisma = {
      orderAssignment: {
        create: vi.fn().mockResolvedValue(created),
        findFirst: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      orderId: ORDER_ID,
      employeeId: EMPLOYEE_ID,
    })
    expect(result.role).toBe("worker")
    const createCall = mockPrisma.orderAssignment.create.mock.calls[0]![0]
    expect(createCall.data.role).toBe("worker")
    expect(createCall.data.isActive).toBe(true)
  })

  it("creates with explicit role", async () => {
    const created = makeAssignment({ role: "leader" })
    const mockPrisma = {
      orderAssignment: {
        create: vi.fn().mockResolvedValue(created),
        findFirst: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      orderId: ORDER_ID,
      employeeId: EMPLOYEE_ID,
      role: "leader",
    })
    expect(result.role).toBe("leader")
  })

  it("handles dates", async () => {
    const created = makeAssignment({
      validFrom: new Date("2026-01-15T00:00:00Z"),
      validTo: new Date("2026-12-31T00:00:00Z"),
    })
    const mockPrisma = {
      orderAssignment: {
        create: vi.fn().mockResolvedValue(created),
        findFirst: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      orderId: ORDER_ID,
      employeeId: EMPLOYEE_ID,
      validFrom: "2026-01-15",
      validTo: "2026-12-31",
    })
    expect(result.validFrom).toEqual(new Date("2026-01-15T00:00:00Z"))
    expect(result.validTo).toEqual(new Date("2026-12-31T00:00:00Z"))
  })

  it("re-fetches with relations after create", async () => {
    const created = { id: ASSIGNMENT_ID }
    const fetched = makeAssignment()
    const mockPrisma = {
      orderAssignment: {
        create: vi.fn().mockResolvedValue(created),
        findFirst: vi.fn().mockResolvedValue(fetched),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      orderId: ORDER_ID,
      employeeId: EMPLOYEE_ID,
    })
    expect(result.order.code).toBe("ORD001")
    expect(mockPrisma.orderAssignment.findFirst).toHaveBeenCalledWith({
      where: { id: ASSIGNMENT_ID, tenantId: TENANT_ID },
      include: {
        order: { select: { id: true, code: true, name: true } },
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            personnelNumber: true,
          },
        },
      },
    })
  })

  it("rejects duplicate (orderId, employeeId, role) with CONFLICT", async () => {
    const prismaError = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
    })
    const mockPrisma = {
      orderAssignment: {
        create: vi.fn().mockRejectedValue(prismaError),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        orderId: ORDER_ID,
        employeeId: EMPLOYEE_ID,
        role: "worker",
      })
    ).rejects.toThrow(
      "Order assignment already exists for this employee, order, and role"
    )
  })
})

// --- orderAssignments.update tests ---

describe("orderAssignments.update", () => {
  it("updates successfully", async () => {
    const existing = makeAssignment()
    const updated = makeAssignment({ role: "leader" })
    const mockPrisma = {
      orderAssignment: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(updated)
          .mockResolvedValueOnce(updated),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: ASSIGNMENT_ID, role: "leader" })
    expect(result.role).toBe("leader")
  })

  it("partial update", async () => {
    const existing = makeAssignment()
    const updated = makeAssignment({ isActive: false })
    const mockPrisma = {
      orderAssignment: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(updated)
          .mockResolvedValueOnce(updated),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: ASSIGNMENT_ID, isActive: false })
    expect(result.isActive).toBe(false)
  })

  it("throws NOT_FOUND for missing assignment", async () => {
    const mockPrisma = {
      orderAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: ASSIGNMENT_ID, role: "leader" })
    ).rejects.toThrow("Order assignment not found")
  })
})

// --- orderAssignments.delete tests ---

describe("orderAssignments.delete", () => {
  it("deletes successfully", async () => {
    const existing = makeAssignment()
    const mockPrisma = {
      orderAssignment: {
        findFirst: vi.fn().mockResolvedValue(existing),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: ASSIGNMENT_ID })
    expect(result.success).toBe(true)
    expect(mockPrisma.orderAssignment.deleteMany).toHaveBeenCalledWith({
      where: { id: ASSIGNMENT_ID, order: { tenantId: TENANT_ID } },
    })
  })

  it("throws NOT_FOUND for missing assignment", async () => {
    const mockPrisma = {
      orderAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.delete({ id: ASSIGNMENT_ID })
    ).rejects.toThrow("Order assignment not found")
  })
})
