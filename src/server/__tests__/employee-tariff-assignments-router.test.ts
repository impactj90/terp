import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { employeeTariffAssignmentsRouter } from "../routers/employeeTariffAssignments"
import { permissionIdByKey } from "../lib/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const EMPLOYEES_VIEW = permissionIdByKey("employees.view")!
const EMPLOYEES_EDIT = permissionIdByKey("employees.edit")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const EMP_ID = "a0000000-0000-4000-a000-000000000500"
const ASSIGN_ID = "a0000000-0000-4000-a000-000000000800"
const TARIFF_ID = "a0000000-0000-4000-a000-000000000900"

const createCaller = createCallerFactory(employeeTariffAssignmentsRouter)

// --- Helpers ---

function makeAssignment(
  overrides: Partial<{
    id: string
    tenantId: string
    employeeId: string
    tariffId: string
    effectiveFrom: Date
    effectiveTo: Date | null
    overwriteBehavior: string
    notes: string | null
    isActive: boolean
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: ASSIGN_ID,
    tenantId: TENANT_ID,
    employeeId: EMP_ID,
    tariffId: TARIFF_ID,
    effectiveFrom: new Date("2025-01-01"),
    effectiveTo: null,
    overwriteBehavior: "preserve_manual",
    notes: null,
    isActive: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

function createTestContext(
  prisma: Record<string, unknown>,
  permissions: string[] = [EMPLOYEES_VIEW, EMPLOYEES_EDIT]
) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions(permissions, {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- employeeTariffAssignments.list tests ---

describe("employeeTariffAssignments.list", () => {
  it("returns assignments for employee", async () => {
    const assignments = [makeAssignment()]
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue({ id: EMP_ID }),
      },
      employeeTariffAssignment: {
        findMany: vi.fn().mockResolvedValue(assignments),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list({ employeeId: EMP_ID })
    expect(result.data).toHaveLength(1)
    expect(result.data[0]!.tariffId).toBe(TARIFF_ID)
  })

  it("filters by isActive", async () => {
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue({ id: EMP_ID }),
      },
      employeeTariffAssignment: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ employeeId: EMP_ID, isActive: true })
    const findManyCall =
      mockPrisma.employeeTariffAssignment.findMany.mock.calls[0]![0]
    expect(findManyCall.where.isActive).toBe(true)
  })

  it("verifies employee belongs to tenant", async () => {
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.list({ employeeId: EMP_ID })
    ).rejects.toThrow("Employee not found")
  })
})

// --- employeeTariffAssignments.getById tests ---

describe("employeeTariffAssignments.getById", () => {
  it("returns assignment when found", async () => {
    const assignment = makeAssignment()
    const mockPrisma = {
      employeeTariffAssignment: {
        findFirst: vi.fn().mockResolvedValue(assignment),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({
      employeeId: EMP_ID,
      id: ASSIGN_ID,
    })
    expect(result.id).toBe(ASSIGN_ID)
    expect(result.tariffId).toBe(TARIFF_ID)
  })

  it("throws NOT_FOUND for missing assignment", async () => {
    const mockPrisma = {
      employeeTariffAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.getById({ employeeId: EMP_ID, id: ASSIGN_ID })
    ).rejects.toThrow("Tariff assignment not found")
  })
})

// --- employeeTariffAssignments.create tests ---

describe("employeeTariffAssignments.create", () => {
  it("creates assignment successfully", async () => {
    const created = makeAssignment()
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue({ id: EMP_ID }),
      },
      employeeTariffAssignment: {
        count: vi.fn().mockResolvedValue(0), // no overlap
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      employeeId: EMP_ID,
      tariffId: TARIFF_ID,
      effectiveFrom: new Date("2025-01-01"),
    })
    expect(result.tariffId).toBe(TARIFF_ID)
    expect(result.overwriteBehavior).toBe("preserve_manual")
  })

  it("rejects overlapping assignments", async () => {
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue({ id: EMP_ID }),
      },
      employeeTariffAssignment: {
        count: vi.fn().mockResolvedValue(1), // overlap found
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        employeeId: EMP_ID,
        tariffId: TARIFF_ID,
        effectiveFrom: new Date("2025-01-01"),
      })
    ).rejects.toThrow("Overlapping tariff assignment exists")
  })

  it("validates dates (effectiveTo >= effectiveFrom)", async () => {
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue({ id: EMP_ID }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        employeeId: EMP_ID,
        tariffId: TARIFF_ID,
        effectiveFrom: new Date("2025-06-01"),
        effectiveTo: new Date("2025-01-01"),
      })
    ).rejects.toThrow(
      "Effective to date cannot be before effective from date"
    )
  })

  it("defaults overwriteBehavior to preserve_manual", async () => {
    const created = makeAssignment()
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue({ id: EMP_ID }),
      },
      employeeTariffAssignment: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      employeeId: EMP_ID,
      tariffId: TARIFF_ID,
      effectiveFrom: new Date("2025-01-01"),
    })
    const createCall =
      mockPrisma.employeeTariffAssignment.create.mock.calls[0]![0]
    expect(createCall.data.overwriteBehavior).toBe("preserve_manual")
  })

  it("verifies employee belongs to tenant", async () => {
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        employeeId: EMP_ID,
        tariffId: TARIFF_ID,
        effectiveFrom: new Date("2025-01-01"),
      })
    ).rejects.toThrow("Employee not found")
  })
})

// --- employeeTariffAssignments.update tests ---

describe("employeeTariffAssignments.update", () => {
  it("performs partial update", async () => {
    const existing = makeAssignment()
    const updated = makeAssignment({ notes: "Updated note" })
    const mockPrisma = {
      employeeTariffAssignment: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      employeeId: EMP_ID,
      id: ASSIGN_ID,
      notes: "Updated note",
    })
    expect(result.notes).toBe("Updated note")
  })

  it("rejects overlap when dates change (excluding self)", async () => {
    const existing = makeAssignment()
    const mockPrisma = {
      employeeTariffAssignment: {
        findFirst: vi.fn().mockResolvedValue(existing),
        count: vi.fn().mockResolvedValue(1), // overlap found (excluding self)
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({
        employeeId: EMP_ID,
        id: ASSIGN_ID,
        effectiveFrom: new Date("2025-06-01"),
      })
    ).rejects.toThrow("Overlapping tariff assignment exists")
  })

  it("validates dates on update", async () => {
    const existing = makeAssignment({
      effectiveFrom: new Date("2025-06-01"),
    })
    const mockPrisma = {
      employeeTariffAssignment: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({
        employeeId: EMP_ID,
        id: ASSIGN_ID,
        effectiveTo: new Date("2025-01-01"),
      })
    ).rejects.toThrow(
      "Effective to date cannot be before effective from date"
    )
  })

  it("throws NOT_FOUND for missing assignment", async () => {
    const mockPrisma = {
      employeeTariffAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({
        employeeId: EMP_ID,
        id: ASSIGN_ID,
        notes: "test",
      })
    ).rejects.toThrow("Tariff assignment not found")
  })
})

// --- employeeTariffAssignments.delete tests ---

describe("employeeTariffAssignments.delete", () => {
  it("hard deletes assignment", async () => {
    const existing = makeAssignment()
    const mockPrisma = {
      employeeTariffAssignment: {
        findFirst: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({
      employeeId: EMP_ID,
      id: ASSIGN_ID,
    })
    expect(result.success).toBe(true)
    expect(
      mockPrisma.employeeTariffAssignment.delete
    ).toHaveBeenCalledWith({ where: { id: ASSIGN_ID } })
  })

  it("throws NOT_FOUND for missing assignment", async () => {
    const mockPrisma = {
      employeeTariffAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.delete({ employeeId: EMP_ID, id: ASSIGN_ID })
    ).rejects.toThrow("Tariff assignment not found")
  })
})

// --- employeeTariffAssignments.effective tests ---

describe("employeeTariffAssignments.effective", () => {
  it("returns assignment-based tariff", async () => {
    const assignment = makeAssignment()
    const mockPrisma = {
      employee: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: EMP_ID, tariffId: null }),
      },
      employeeTariffAssignment: {
        findFirst: vi.fn().mockResolvedValue(assignment),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.effective({
      employeeId: EMP_ID,
      date: "2025-06-15",
    })
    expect(result.tariffId).toBe(TARIFF_ID)
    expect(result.source).toBe("assignment")
    expect(result.assignmentId).toBe(ASSIGN_ID)
  })

  it("falls back to default tariff", async () => {
    const mockPrisma = {
      employee: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: EMP_ID, tariffId: TARIFF_ID }),
      },
      employeeTariffAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.effective({
      employeeId: EMP_ID,
      date: "2025-06-15",
    })
    expect(result.tariffId).toBe(TARIFF_ID)
    expect(result.source).toBe("default")
    expect(result.assignmentId).toBeNull()
  })

  it('returns "none" when no tariff', async () => {
    const mockPrisma = {
      employee: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: EMP_ID, tariffId: null }),
      },
      employeeTariffAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.effective({
      employeeId: EMP_ID,
      date: "2025-06-15",
    })
    expect(result.tariffId).toBeNull()
    expect(result.source).toBe("none")
    expect(result.assignmentId).toBeNull()
  })

  it("verifies employee belongs to tenant", async () => {
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.effective({ employeeId: EMP_ID, date: "2025-06-15" })
    ).rejects.toThrow("Employee not found")
  })
})
