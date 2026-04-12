/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { employeePensionsRouter } from "../employeePensions"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"
import * as pensionService from "@/lib/services/employee-pensions-service"

vi.mock("@/lib/services/employee-pensions-service", () => ({
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
  PensionNotFoundError: class PensionNotFoundError extends Error {
    constructor() {
      super("Pension not found")
      this.name = "PensionNotFoundError"
    }
  },
  PensionValidationError: class PensionValidationError extends Error {
    constructor(message: string) {
      super(message)
      this.name = "PensionValidationError"
    }
  },
}))
vi.mock("@/lib/services/audit-logs-service", () => ({
  log: vi.fn().mockResolvedValue(undefined),
  computeChanges: vi.fn().mockReturnValue(null),
}))

// --- Constants ---

const PAYROLL_VIEW = permissionIdByKey("personnel.payroll_data.view")!
const PAYROLL_EDIT = permissionIdByKey("personnel.payroll_data.edit")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const EMP_ID = "a0000000-0000-4000-a000-000000000500"
const PENSION_ID = "a0000000-0000-4000-a000-000000000700"

const createCaller = createCallerFactory(employeePensionsRouter)

// --- Helpers ---

function makePension(
  overrides: Partial<{
    id: string
    tenantId: string
    employeeId: string
    executionType: string
    providerName: string
    contractNumber: string | null
    employeeContribution: number
    employerContribution: number
    mandatoryEmployerSubsidy: number
    startDate: Date
    endDate: Date | null
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: PENSION_ID,
    tenantId: TENANT_ID,
    employeeId: EMP_ID,
    executionType: "Direktversicherung",
    providerName: "Allianz",
    contractNumber: "C-12345",
    employeeContribution: 100,
    employerContribution: 50,
    mandatoryEmployerSubsidy: 15,
    startDate: new Date("2025-01-01"),
    endDate: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

function createTestContext(
  prisma: Record<string, unknown>,
  permissions: string[] = [PAYROLL_VIEW, PAYROLL_EDIT]
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

// --- employeePensions.list tests ---

describe("employeePensions.list", () => {
  it("returns pensions for employee", async () => {
    const pensions = [makePension()]
    vi.mocked(pensionService.list).mockResolvedValue(pensions as any)
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list({ employeeId: EMP_ID })
    expect(result).toHaveLength(1)
    expect(result[0]!.providerName).toBe("Allianz")
    expect(pensionService.list).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      EMP_ID
    )
  })

  it("rejects without permission", async () => {
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma, []))
    await expect(caller.list({ employeeId: EMP_ID })).rejects.toThrow()
  })
})

// --- employeePensions.create tests ---

describe("employeePensions.create", () => {
  it("creates pension with all fields and passes audit context", async () => {
    const created = makePension()
    vi.mocked(pensionService.create).mockResolvedValue(created as any)
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      employeeId: EMP_ID,
      executionType: "Direktversicherung",
      providerName: "Allianz",
      contractNumber: "C-12345",
      employeeContribution: 100,
      employerContribution: 50,
      mandatoryEmployerSubsidy: 15,
      startDate: new Date("2025-01-01"),
    })
    expect(result!.providerName).toBe("Allianz")
    expect(pensionService.create).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      expect.objectContaining({
        employeeId: EMP_ID,
        executionType: "Direktversicherung",
        providerName: "Allianz",
        employeeContribution: 100,
        employerContribution: 50,
      }),
      expect.objectContaining({
        userId: expect.any(String),
        ipAddress: null,
        userAgent: null,
      })
    )
  })
})

// --- employeePensions.update tests ---

describe("employeePensions.update", () => {
  it("performs partial update", async () => {
    const updated = makePension({ providerName: "Munich Re" })
    vi.mocked(pensionService.update).mockResolvedValue(updated as any)
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: PENSION_ID,
      providerName: "Munich Re",
    })
    expect(result!.providerName).toBe("Munich Re")
    expect(pensionService.update).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      PENSION_ID,
      expect.objectContaining({ providerName: "Munich Re" }),
      expect.objectContaining({ userId: expect.any(String) })
    )
  })

  it("throws NOT_FOUND for missing pension", async () => {
    vi.mocked(pensionService.update).mockRejectedValue(
      new pensionService.PensionNotFoundError()
    )
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: PENSION_ID, providerName: "Test" })
    ).rejects.toThrow("Pension not found")
  })
})

// --- employeePensions.delete tests ---

describe("employeePensions.delete", () => {
  it("removes pension", async () => {
    vi.mocked(pensionService.remove).mockResolvedValue({ success: true })
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: PENSION_ID })
    expect(result!.success).toBe(true)
    expect(pensionService.remove).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      PENSION_ID,
      expect.objectContaining({ userId: expect.any(String) })
    )
  })

  it("throws NOT_FOUND for missing pension", async () => {
    vi.mocked(pensionService.remove).mockRejectedValue(
      new pensionService.PensionNotFoundError()
    )
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: PENSION_ID })).rejects.toThrow(
      "Pension not found"
    )
  })
})
