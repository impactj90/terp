/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { employeeOtherEmploymentsRouter } from "../employeeOtherEmployments"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"
import * as otherEmploymentService from "@/lib/services/employee-other-employments-service"

vi.mock("@/lib/services/employee-other-employments-service", () => ({
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
  OtherEmploymentNotFoundError: class OtherEmploymentNotFoundError extends Error {
    constructor() {
      super("Other employment not found")
      this.name = "OtherEmploymentNotFoundError"
    }
  },
  OtherEmploymentValidationError: class OtherEmploymentValidationError extends Error {
    constructor(message: string) {
      super(message)
      this.name = "OtherEmploymentValidationError"
    }
  },
}))
vi.mock("@/lib/services/audit-logs-service", () => ({
  log: vi.fn().mockResolvedValue(undefined),
  computeChanges: vi.fn().mockReturnValue(null),
}))

// --- Constants ---

const VIEW_PERM = permissionIdByKey("personnel.payroll_data.view")!
const EDIT_PERM = permissionIdByKey("personnel.payroll_data.edit")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const EMP_ID = "a0000000-0000-4000-a000-000000000500"
const EMPLOYMENT_ID = "a0000000-0000-4000-a000-000000000700"

const createCaller = createCallerFactory(employeeOtherEmploymentsRouter)

// --- Helpers ---

function makeEmployment(
  overrides: Partial<{
    id: string
    tenantId: string
    employeeId: string
    employerName: string
    monthlyIncome: number | null
    weeklyHours: number | null
    isMinijob: boolean
    startDate: Date
    endDate: Date | null
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: EMPLOYMENT_ID,
    tenantId: TENANT_ID,
    employeeId: EMP_ID,
    employerName: "Müller GmbH",
    monthlyIncome: null,
    weeklyHours: null,
    isMinijob: false,
    startDate: new Date("2025-03-01"),
    endDate: null,
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

// --- employeeOtherEmployments.list tests ---

describe("employeeOtherEmployments.list", () => {
  it("returns other employments for employee", async () => {
    const employments = [makeEmployment()]
    vi.mocked(otherEmploymentService.list).mockResolvedValue(employments as any)
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list({ employeeId: EMP_ID })
    expect(result).toHaveLength(1)
    expect(result[0]!.employerName).toBe("Müller GmbH")
  })

  it("rejects without payroll_data.view permission", async () => {
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma, []))
    await expect(caller.list({ employeeId: EMP_ID })).rejects.toThrow()
  })
})

// --- employeeOtherEmployments.create tests ---

describe("employeeOtherEmployments.create", () => {
  it("creates employment successfully", async () => {
    const created = makeEmployment()
    vi.mocked(otherEmploymentService.create).mockResolvedValue(created as any)
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      employeeId: EMP_ID,
      employerName: "Müller GmbH",
      startDate: new Date("2025-03-01"),
    })
    expect(result.employerName).toBe("Müller GmbH")
    expect(otherEmploymentService.create).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      expect.objectContaining({
        employeeId: EMP_ID,
        employerName: "Müller GmbH",
      }),
      expect.objectContaining({ userId: expect.any(String) })
    )
  })

  it("rejects without payroll_data.edit permission", async () => {
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma, [VIEW_PERM]))
    await expect(
      caller.create({
        employeeId: EMP_ID,
        employerName: "Müller GmbH",
        startDate: new Date("2025-03-01"),
      })
    ).rejects.toThrow()
  })
})

// --- employeeOtherEmployments.update tests ---

describe("employeeOtherEmployments.update", () => {
  it("performs partial update", async () => {
    const updated = makeEmployment({ employerName: "Schmidt AG", isMinijob: true })
    vi.mocked(otherEmploymentService.update).mockResolvedValue(updated as any)
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: EMPLOYMENT_ID,
      employerName: "Schmidt AG",
      isMinijob: true,
    })
    expect(result.employerName).toBe("Schmidt AG")
    expect(result.isMinijob).toBe(true)
  })

  it("throws NOT_FOUND for missing employment", async () => {
    vi.mocked(otherEmploymentService.update).mockRejectedValue(
      new otherEmploymentService.OtherEmploymentNotFoundError()
    )
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: EMPLOYMENT_ID, employerName: "Schmidt AG" })
    ).rejects.toThrow("Other employment not found")
  })
})

// --- employeeOtherEmployments.delete tests ---

describe("employeeOtherEmployments.delete", () => {
  it("removes employment successfully", async () => {
    vi.mocked(otherEmploymentService.remove).mockResolvedValue({ success: true })
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: EMPLOYMENT_ID })
    expect(result.success).toBe(true)
    expect(otherEmploymentService.remove).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      EMPLOYMENT_ID,
      expect.objectContaining({ userId: expect.any(String) })
    )
  })

  it("throws NOT_FOUND for missing employment", async () => {
    vi.mocked(otherEmploymentService.remove).mockRejectedValue(
      new otherEmploymentService.OtherEmploymentNotFoundError()
    )
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: EMPLOYMENT_ID })).rejects.toThrow(
      "Other employment not found"
    )
  })
})

// --- Permission isolation tests ---

describe("employeeOtherEmployments permission isolation", () => {
  it("rejects without payroll_data.view permission", async () => {
    const foreignAssignmentViewPerm = permissionIdByKey("personnel.foreign_assignment.view")!
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma, [foreignAssignmentViewPerm]))
    await expect(caller.list({ employeeId: EMP_ID })).rejects.toThrow()
  })
})
