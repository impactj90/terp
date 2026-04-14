import { describe, it, expect, vi, beforeEach } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { employeeTariffAssignmentsRouter } from "../employeeTariffAssignments"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"
import * as employeeTariffAssignmentService from "@/lib/services/employee-tariff-assignment-service"

vi.mock("@/lib/services/employee-tariff-assignment-service", () => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  EmployeeTariffAssignmentNotFoundError: class EmployeeTariffAssignmentNotFoundError extends Error {
    constructor(message = "Tariff assignment not found") {
      super(message)
      this.name = "EmployeeTariffAssignmentNotFoundError"
    }
  },
  EmployeeTariffAssignmentConflictError: class EmployeeTariffAssignmentConflictError extends Error {
    constructor(message: string) {
      super(message)
      this.name = "EmployeeTariffAssignmentConflictError"
    }
  },
  EmployeeTariffAssignmentValidationError: class EmployeeTariffAssignmentValidationError extends Error {
    constructor(message: string) {
      super(message)
      this.name = "EmployeeTariffAssignmentValidationError"
    }
  },
  EmployeeNotFoundError: class EmployeeNotFoundError extends Error {
    constructor(message = "Employee not found") {
      super(message)
      this.name = "EmployeeNotFoundError"
    }
  },
}))
vi.mock("@/lib/services/audit-logs-service", () => ({
  log: vi.fn().mockResolvedValue(undefined),
  computeChanges: vi.fn().mockReturnValue(null),
}))

// --- Constants ---

const EMPLOYEES_VIEW = permissionIdByKey("employees.view")!
const EMPLOYEES_EDIT = permissionIdByKey("employees.edit")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const EMP_ID = "a0000000-0000-4000-a000-000000000500"
const ASSIGN_ID = "a0000000-0000-4000-a000-000000000800"
const TARIFF_ID = "a0000000-0000-4000-a000-000000000900"

const createCaller = createCallerFactory(employeeTariffAssignmentsRouter)

beforeEach(() => {
  vi.mocked(employeeTariffAssignmentService.create).mockReset()
  vi.mocked(employeeTariffAssignmentService.update).mockReset()
  vi.mocked(employeeTariffAssignmentService.remove).mockReset()
})

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
  it("creates assignment successfully via service", async () => {
    const created = makeAssignment()
    vi.mocked(employeeTariffAssignmentService.create).mockResolvedValue(
      created as ReturnType<typeof makeAssignment>,
    )
    const caller = createCaller(createTestContext({}))
    const result = await caller.create({
      employeeId: EMP_ID,
      tariffId: TARIFF_ID,
      effectiveFrom: new Date("2025-01-01"),
    })
    expect(result.tariffId).toBe(TARIFF_ID)
    expect(result.overwriteBehavior).toBe("preserve_manual")
    expect(employeeTariffAssignmentService.create).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      expect.objectContaining({
        employeeId: EMP_ID,
        tariffId: TARIFF_ID,
        effectiveFrom: expect.any(Date),
      }),
      expect.objectContaining({ userId: expect.any(String) }),
      expect.anything(), // dataScope
    )
  })

  it("rejects overlapping assignments from service error", async () => {
    vi.mocked(employeeTariffAssignmentService.create).mockRejectedValue(
      new employeeTariffAssignmentService.EmployeeTariffAssignmentConflictError(
        "Overlapping tariff assignment exists",
      ),
    )
    const caller = createCaller(createTestContext({}))
    await expect(
      caller.create({
        employeeId: EMP_ID,
        tariffId: TARIFF_ID,
        effectiveFrom: new Date("2025-01-01"),
      }),
    ).rejects.toThrow("Overlapping tariff assignment exists")
  })

  it("rejects invalid date range from service error", async () => {
    vi.mocked(employeeTariffAssignmentService.create).mockRejectedValue(
      new employeeTariffAssignmentService.EmployeeTariffAssignmentValidationError(
        "Effective to date cannot be before effective from date",
      ),
    )
    const caller = createCaller(createTestContext({}))
    await expect(
      caller.create({
        employeeId: EMP_ID,
        tariffId: TARIFF_ID,
        effectiveFrom: new Date("2025-06-01"),
        effectiveTo: new Date("2025-01-01"),
      }),
    ).rejects.toThrow("Effective to date cannot be before effective from date")
  })

  it("propagates employee-not-found error from service", async () => {
    vi.mocked(employeeTariffAssignmentService.create).mockRejectedValue(
      new employeeTariffAssignmentService.EmployeeNotFoundError(),
    )
    const caller = createCaller(createTestContext({}))
    await expect(
      caller.create({
        employeeId: EMP_ID,
        tariffId: TARIFF_ID,
        effectiveFrom: new Date("2025-01-01"),
      }),
    ).rejects.toThrow("Employee not found")
  })
})

// --- employeeTariffAssignments.update tests ---

describe("employeeTariffAssignments.update", () => {
  it("performs partial update", async () => {
    const updated = makeAssignment({ notes: "Updated note" })
    vi.mocked(employeeTariffAssignmentService.update).mockResolvedValue(updated as ReturnType<typeof makeAssignment>)
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      employeeId: EMP_ID,
      id: ASSIGN_ID,
      notes: "Updated note",
    })
    expect(result.notes).toBe("Updated note")
    expect(employeeTariffAssignmentService.update).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      expect.objectContaining({ employeeId: EMP_ID, id: ASSIGN_ID, notes: "Updated note" }),
      expect.objectContaining({ userId: expect.any(String) }),
      expect.anything() // dataScope
    )
  })

  it("rejects overlap when dates change (excluding self)", async () => {
    vi.mocked(employeeTariffAssignmentService.update).mockRejectedValue(
      new employeeTariffAssignmentService.EmployeeTariffAssignmentConflictError(
        "Overlapping tariff assignment exists"
      )
    )
    const mockPrisma = {}
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
    vi.mocked(employeeTariffAssignmentService.update).mockRejectedValue(
      new employeeTariffAssignmentService.EmployeeTariffAssignmentValidationError(
        "Effective to date cannot be before effective from date"
      )
    )
    const mockPrisma = {}
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
    vi.mocked(employeeTariffAssignmentService.update).mockRejectedValue(
      new employeeTariffAssignmentService.EmployeeTariffAssignmentNotFoundError()
    )
    const mockPrisma = {}
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
    vi.mocked(employeeTariffAssignmentService.remove).mockResolvedValue(undefined)
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({
      employeeId: EMP_ID,
      id: ASSIGN_ID,
    })
    expect(result.success).toBe(true)
    expect(employeeTariffAssignmentService.remove).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      EMP_ID,
      ASSIGN_ID,
      expect.objectContaining({ userId: expect.any(String) }),
      expect.anything() // dataScope
    )
  })

  it("throws NOT_FOUND for missing assignment", async () => {
    vi.mocked(employeeTariffAssignmentService.remove).mockRejectedValue(
      new employeeTariffAssignmentService.EmployeeTariffAssignmentNotFoundError()
    )
    const mockPrisma = {}
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
