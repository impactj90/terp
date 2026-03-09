import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "../trpc"
import { employeeAccessAssignmentsRouter } from "../routers/employeeAccessAssignments"
import { permissionIdByKey } from "../lib/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const ACCESS_CONTROL_MANAGE = permissionIdByKey("access_control.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ASSIGNMENT_ID = "a0000000-0000-4000-a000-000000000400"
const EMPLOYEE_ID = "a0000000-0000-4000-a000-000000000500"
const PROFILE_ID = "a0000000-0000-4000-a000-000000000300"

const createCaller = createCallerFactory(employeeAccessAssignmentsRouter)

// --- Helpers ---

function makeAssignment(
  overrides: Partial<{
    id: string
    tenantId: string
    employeeId: string
    accessProfileId: string
    validFrom: Date | null
    validTo: Date | null
    isActive: boolean
    createdAt: Date
    updatedAt: Date
    employee: { id: string; firstName: string; lastName: string; personnelNumber: string | null } | null
    accessProfile: { id: string; code: string; name: string } | null
  }> = {}
) {
  return {
    id: ASSIGNMENT_ID,
    tenantId: TENANT_ID,
    employeeId: EMPLOYEE_ID,
    accessProfileId: PROFILE_ID,
    validFrom: null,
    validTo: null,
    isActive: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    employee: {
      id: EMPLOYEE_ID,
      firstName: "John",
      lastName: "Doe",
      personnelNumber: "EMP-001",
    },
    accessProfile: {
      id: PROFILE_ID,
      code: "PROF-A",
      name: "Profile A",
    },
    ...overrides,
  }
}

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([ACCESS_CONTROL_MANAGE], {
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

// --- employeeAccessAssignments.list tests ---

describe("employeeAccessAssignments.list", () => {
  it("returns all assignments ordered by createdAt DESC", async () => {
    const assignments = [
      makeAssignment(),
      makeAssignment({
        id: "a0000000-0000-4000-a000-000000000401",
        createdAt: new Date("2025-01-02"),
      }),
    ]
    const mockPrisma = {
      employeeAccessAssignment: {
        findMany: vi.fn().mockResolvedValue(assignments),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()

    expect(result.data).toHaveLength(2)
    expect(mockPrisma.employeeAccessAssignment.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID },
      orderBy: { createdAt: "desc" },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            personnelNumber: true,
          },
        },
        accessProfile: {
          select: { id: true, code: true, name: true },
        },
      },
    })
  })

  it("denies access without permission", async () => {
    const mockPrisma = {
      employeeAccessAssignment: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createNoPermContext(mockPrisma))
    await expect(caller.list()).rejects.toThrow("Insufficient permissions")
  })
})

// --- employeeAccessAssignments.getById tests ---

describe("employeeAccessAssignments.getById", () => {
  it("returns assignment by ID", async () => {
    const assignment = makeAssignment()
    const mockPrisma = {
      employeeAccessAssignment: {
        findFirst: vi.fn().mockResolvedValue(assignment),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: ASSIGNMENT_ID })

    expect(result.id).toBe(ASSIGNMENT_ID)
    expect(result.employeeId).toBe(EMPLOYEE_ID)
    expect(result.accessProfileId).toBe(PROFILE_ID)
    expect(result.employee?.firstName).toBe("John")
    expect(result.accessProfile?.code).toBe("PROF-A")
  })

  it("throws NOT_FOUND for missing ID", async () => {
    const mockPrisma = {
      employeeAccessAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: ASSIGNMENT_ID })).rejects.toThrow(
      "Employee access assignment not found"
    )
  })
})

// --- employeeAccessAssignments.create tests ---

describe("employeeAccessAssignments.create", () => {
  it("creates assignment with valid input", async () => {
    const assignment = makeAssignment()
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue({ id: EMPLOYEE_ID }),
      },
      accessProfile: {
        findFirst: vi.fn().mockResolvedValue({ id: PROFILE_ID }),
      },
      employeeAccessAssignment: {
        create: vi.fn().mockResolvedValue(assignment),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      employeeId: EMPLOYEE_ID,
      accessProfileId: PROFILE_ID,
    })

    expect(result.id).toBe(ASSIGNMENT_ID)
    expect(result.employeeId).toBe(EMPLOYEE_ID)
    expect(result.accessProfileId).toBe(PROFILE_ID)
    expect(result.isActive).toBe(true)
    expect(mockPrisma.employeeAccessAssignment.create).toHaveBeenCalledWith({
      data: {
        tenantId: TENANT_ID,
        employeeId: EMPLOYEE_ID,
        accessProfileId: PROFILE_ID,
        validFrom: null,
        validTo: null,
        isActive: true,
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            personnelNumber: true,
          },
        },
        accessProfile: {
          select: { id: true, code: true, name: true },
        },
      },
    })
  })

  it("creates assignment with validFrom/validTo", async () => {
    const assignment = makeAssignment({
      validFrom: new Date("2025-03-01"),
      validTo: new Date("2025-12-31"),
    })
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue({ id: EMPLOYEE_ID }),
      },
      accessProfile: {
        findFirst: vi.fn().mockResolvedValue({ id: PROFILE_ID }),
      },
      employeeAccessAssignment: {
        create: vi.fn().mockResolvedValue(assignment),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      employeeId: EMPLOYEE_ID,
      accessProfileId: PROFILE_ID,
      validFrom: "2025-03-01",
      validTo: "2025-12-31",
    })

    expect(result.validFrom).toEqual(new Date("2025-03-01"))
    expect(result.validTo).toEqual(new Date("2025-12-31"))
    expect(mockPrisma.employeeAccessAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        validFrom: new Date("2025-03-01"),
        validTo: new Date("2025-12-31"),
      }),
      include: expect.any(Object),
    })
  })

  it("rejects invalid employee ID (BAD_REQUEST)", async () => {
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      accessProfile: {
        findFirst: vi.fn().mockResolvedValue({ id: PROFILE_ID }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        employeeId: EMPLOYEE_ID,
        accessProfileId: PROFILE_ID,
      })
    ).rejects.toThrow("Employee not found")
  })

  it("rejects invalid access profile ID (BAD_REQUEST)", async () => {
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue({ id: EMPLOYEE_ID }),
      },
      accessProfile: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        employeeId: EMPLOYEE_ID,
        accessProfileId: PROFILE_ID,
      })
    ).rejects.toThrow("Access profile not found")
  })
})

// --- employeeAccessAssignments.update tests ---

describe("employeeAccessAssignments.update", () => {
  it("partial update succeeds (isActive, validFrom, validTo)", async () => {
    const existing = makeAssignment()
    const updated = makeAssignment({
      isActive: false,
      validFrom: new Date("2025-06-01"),
      validTo: new Date("2025-12-31"),
    })
    const mockPrisma = {
      employeeAccessAssignment: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: ASSIGNMENT_ID,
      isActive: false,
      validFrom: "2025-06-01",
      validTo: "2025-12-31",
    })

    expect(result.isActive).toBe(false)
    expect(result.validFrom).toEqual(new Date("2025-06-01"))
    expect(result.validTo).toEqual(new Date("2025-12-31"))
    expect(mockPrisma.employeeAccessAssignment.update).toHaveBeenCalledWith({
      where: { id: ASSIGNMENT_ID },
      data: {
        isActive: false,
        validFrom: new Date("2025-06-01"),
        validTo: new Date("2025-12-31"),
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            personnelNumber: true,
          },
        },
        accessProfile: {
          select: { id: true, code: true, name: true },
        },
      },
    })
  })

  it("throws NOT_FOUND for missing assignment", async () => {
    const mockPrisma = {
      employeeAccessAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: ASSIGNMENT_ID, isActive: false })
    ).rejects.toThrow("Employee access assignment not found")
  })
})

// --- employeeAccessAssignments.delete tests ---

describe("employeeAccessAssignments.delete", () => {
  it("deletes existing assignment", async () => {
    const existing = makeAssignment()
    const mockPrisma = {
      employeeAccessAssignment: {
        findFirst: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: ASSIGNMENT_ID })

    expect(result.success).toBe(true)
    expect(mockPrisma.employeeAccessAssignment.delete).toHaveBeenCalledWith({
      where: { id: ASSIGNMENT_ID },
    })
  })

  it("throws NOT_FOUND for missing assignment", async () => {
    const mockPrisma = {
      employeeAccessAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: ASSIGNMENT_ID })).rejects.toThrow(
      "Employee access assignment not found"
    )
  })
})
