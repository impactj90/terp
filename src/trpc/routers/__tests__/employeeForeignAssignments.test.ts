import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { employeeForeignAssignmentsRouter } from "../employeeForeignAssignments"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"
import * as foreignAssignmentService from "@/lib/services/employee-foreign-assignments-service"

vi.mock("@/lib/services/employee-foreign-assignments-service", () => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  EmployeeNotFoundError: class EmployeeNotFoundError extends Error {
    constructor() {
      super("Employee not found")
      this.name = "EmployeeNotFoundError"
    }
  },
  ForeignAssignmentNotFoundError: class ForeignAssignmentNotFoundError extends Error {
    constructor() {
      super("Foreign assignment not found")
      this.name = "ForeignAssignmentNotFoundError"
    }
  },
  ForeignAssignmentValidationError: class ForeignAssignmentValidationError extends Error {
    constructor(message: string) {
      super(message)
      this.name = "ForeignAssignmentValidationError"
    }
  },
}))
vi.mock("@/lib/services/audit-logs-service", () => ({
  log: vi.fn().mockResolvedValue(undefined),
  computeChanges: vi.fn().mockReturnValue(null),
}))

// --- Constants ---

const VIEW_PERM = permissionIdByKey("personnel.foreign_assignment.view")!
const EDIT_PERM = permissionIdByKey("personnel.foreign_assignment.edit")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const EMP_ID = "a0000000-0000-4000-a000-000000000500"
const ASSIGN_ID = "a0000000-0000-4000-a000-000000000700"

const createCaller = createCallerFactory(employeeForeignAssignmentsRouter)

// --- Helpers ---

function makeAssignment(
  overrides: Partial<{
    id: string
    tenantId: string
    employeeId: string
    countryCode: string
    countryName: string
    startDate: Date
    endDate: Date | null
    a1CertificateNumber: string | null
    a1ValidFrom: Date | null
    a1ValidUntil: Date | null
    foreignActivityExemption: boolean
    notes: string | null
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: ASSIGN_ID,
    tenantId: TENANT_ID,
    employeeId: EMP_ID,
    countryCode: "AT",
    countryName: "Austria",
    startDate: new Date("2025-03-01"),
    endDate: null,
    a1CertificateNumber: null,
    a1ValidFrom: null,
    a1ValidUntil: null,
    foreignActivityExemption: false,
    notes: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

function createTestContext(
  prisma: Record<string, unknown>,
  permissions: string[] = [VIEW_PERM, EDIT_PERM]
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

// --- employeeForeignAssignments.list tests ---

describe("employeeForeignAssignments.list", () => {
  it("returns foreign assignments for employee", async () => {
    const assignments = [makeAssignment()]
    vi.mocked(foreignAssignmentService.list).mockResolvedValue(assignments)
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list({ employeeId: EMP_ID })
    expect(result).toHaveLength(1)
    expect(result[0]!.countryCode).toBe("AT")
    expect(result[0]!.countryName).toBe("Austria")
  })

  it("rejects without foreign_assignment.view permission", async () => {
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma, []))
    await expect(caller.list({ employeeId: EMP_ID })).rejects.toThrow()
  })
})

// --- employeeForeignAssignments.create tests ---

describe("employeeForeignAssignments.create", () => {
  it("creates assignment successfully", async () => {
    const created = makeAssignment()
    vi.mocked(foreignAssignmentService.create).mockResolvedValue(created)
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      employeeId: EMP_ID,
      countryCode: "AT",
      countryName: "Austria",
      startDate: new Date("2025-03-01"),
    })
    expect(result.countryCode).toBe("AT")
    expect(result.countryName).toBe("Austria")
    expect(foreignAssignmentService.create).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      expect.objectContaining({
        employeeId: EMP_ID,
        countryCode: "AT",
        countryName: "Austria",
      }),
      expect.objectContaining({ userId: expect.any(String) })
    )
  })

  it("rejects without foreign_assignment.edit permission", async () => {
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma, [VIEW_PERM]))
    await expect(
      caller.create({
        employeeId: EMP_ID,
        countryCode: "AT",
        countryName: "Austria",
        startDate: new Date("2025-03-01"),
      })
    ).rejects.toThrow()
  })
})

// --- employeeForeignAssignments.update tests ---

describe("employeeForeignAssignments.update", () => {
  it("performs partial update", async () => {
    const updated = makeAssignment({ countryCode: "CH", countryName: "Switzerland" })
    vi.mocked(foreignAssignmentService.update).mockResolvedValue(updated)
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: ASSIGN_ID,
      countryCode: "CH",
      countryName: "Switzerland",
    })
    expect(result.countryCode).toBe("CH")
    expect(result.countryName).toBe("Switzerland")
  })

  it("throws NOT_FOUND for missing assignment", async () => {
    vi.mocked(foreignAssignmentService.update).mockRejectedValue(
      new foreignAssignmentService.ForeignAssignmentNotFoundError()
    )
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: ASSIGN_ID, countryCode: "CH" })
    ).rejects.toThrow("Foreign assignment not found")
  })
})

// --- employeeForeignAssignments.delete tests ---

describe("employeeForeignAssignments.delete", () => {
  it("removes assignment successfully", async () => {
    vi.mocked(foreignAssignmentService.remove).mockResolvedValue({ success: true })
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: ASSIGN_ID })
    expect(result.success).toBe(true)
    expect(foreignAssignmentService.remove).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      ASSIGN_ID,
      expect.objectContaining({ userId: expect.any(String) })
    )
  })

  it("throws NOT_FOUND for missing assignment", async () => {
    vi.mocked(foreignAssignmentService.remove).mockRejectedValue(
      new foreignAssignmentService.ForeignAssignmentNotFoundError()
    )
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: ASSIGN_ID })).rejects.toThrow(
      "Foreign assignment not found"
    )
  })
})

// --- Permission isolation tests ---

describe("employeeForeignAssignments permission isolation", () => {
  it("having payroll_data.view does NOT grant access to foreign assignments", async () => {
    const payrollViewPerm = permissionIdByKey("personnel.payroll_data.view")!
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma, [payrollViewPerm]))
    await expect(caller.list({ employeeId: EMP_ID })).rejects.toThrow()
  })
})
