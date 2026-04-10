/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { employeeGarnishmentsRouter } from "../employeeGarnishments"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"
import * as garnishmentService from "@/lib/services/employee-garnishments-service"

vi.mock("@/lib/services/employee-garnishments-service", () => ({
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
  GarnishmentNotFoundError: class GarnishmentNotFoundError extends Error {
    constructor() {
      super("Garnishment not found")
      this.name = "GarnishmentNotFoundError"
    }
  },
  GarnishmentValidationError: class GarnishmentValidationError extends Error {
    constructor(message: string) {
      super(message)
      this.name = "GarnishmentValidationError"
    }
  },
}))
vi.mock("@/lib/services/audit-logs-service", () => ({
  log: vi.fn().mockResolvedValue(undefined),
  computeChanges: vi.fn().mockReturnValue(null),
}))

// --- Constants ---

const GARNISHMENT_VIEW = permissionIdByKey("personnel.garnishment.view")!
const GARNISHMENT_EDIT = permissionIdByKey("personnel.garnishment.edit")!
const PAYROLL_VIEW = permissionIdByKey("personnel.payroll_data.view")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const EMP_ID = "a0000000-0000-4000-a000-000000000500"
const GARNISHMENT_ID = "a0000000-0000-4000-a000-000000000700"

const createCaller = createCallerFactory(employeeGarnishmentsRouter)

// --- Helpers ---

function makeGarnishment(
  overrides: Partial<{
    id: string
    tenantId: string
    employeeId: string
    creditorName: string
    creditorAddress: string | null
    fileReference: string | null
    garnishmentAmount: number
    calculationMethod: string
    dependentsCount: number
    rank: number
    isPAccount: boolean
    maintenanceObligation: boolean
    startDate: Date
    endDate: Date | null
    attachmentFileId: string | null
    notes: string | null
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: GARNISHMENT_ID,
    tenantId: TENANT_ID,
    employeeId: EMP_ID,
    creditorName: "Finanzamt München",
    creditorAddress: "Deroystr. 6, 80335 München",
    fileReference: "FA-2025-001",
    garnishmentAmount: 350,
    calculationMethod: "fixed",
    dependentsCount: 0,
    rank: 1,
    isPAccount: false,
    maintenanceObligation: false,
    startDate: new Date("2025-01-01"),
    endDate: null,
    attachmentFileId: null,
    notes: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

function createTestContext(
  prisma: Record<string, unknown>,
  permissions: string[] = [GARNISHMENT_VIEW, GARNISHMENT_EDIT]
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

// --- employeeGarnishments.list tests ---

describe("employeeGarnishments.list", () => {
  it("returns garnishments for employee", async () => {
    const garnishments = [makeGarnishment()]
    vi.mocked(garnishmentService.list).mockResolvedValue(garnishments as any)
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list({ employeeId: EMP_ID })
    expect(result).toHaveLength(1)
    expect(result[0]!.creditorName).toBe("Finanzamt München")
    expect(garnishmentService.list).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      EMP_ID
    )
  })
})

// --- employeeGarnishments.create tests ---

describe("employeeGarnishments.create", () => {
  it("creates garnishment with encrypted fields (verifies call args)", async () => {
    const created = makeGarnishment()
    vi.mocked(garnishmentService.create).mockResolvedValue(created as any)
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      employeeId: EMP_ID,
      creditorName: "Finanzamt München",
      creditorAddress: "Deroystr. 6, 80335 München",
      fileReference: "FA-2025-001",
      garnishmentAmount: 350,
      calculationMethod: "fixed",
      dependentsCount: 0,
      rank: 1,
      startDate: new Date("2025-01-01"),
    })
    expect(result!.creditorName).toBe("Finanzamt München")
    expect(garnishmentService.create).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      expect.objectContaining({
        employeeId: EMP_ID,
        creditorName: "Finanzamt München",
        garnishmentAmount: 350,
        calculationMethod: "fixed",
      }),
      expect.objectContaining({
        userId: expect.any(String),
        ipAddress: null,
        userAgent: null,
      })
    )
  })
})

// --- employeeGarnishments.update tests ---

describe("employeeGarnishments.update", () => {
  it("performs partial update", async () => {
    const updated = makeGarnishment({ garnishmentAmount: 500 })
    vi.mocked(garnishmentService.update).mockResolvedValue(updated as any)
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: GARNISHMENT_ID,
      garnishmentAmount: 500,
    })
    expect(result!.garnishmentAmount).toBe(500)
    expect(garnishmentService.update).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      GARNISHMENT_ID,
      expect.objectContaining({ garnishmentAmount: 500 }),
      expect.objectContaining({ userId: expect.any(String) })
    )
  })
})

// --- employeeGarnishments.delete tests ---

describe("employeeGarnishments.delete", () => {
  it("removes garnishment", async () => {
    vi.mocked(garnishmentService.remove).mockResolvedValue({ success: true })
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: GARNISHMENT_ID })
    expect(result!.success).toBe(true)
    expect(garnishmentService.remove).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      GARNISHMENT_ID,
      expect.objectContaining({ userId: expect.any(String) })
    )
  })

  it("throws NOT_FOUND for missing garnishment", async () => {
    vi.mocked(garnishmentService.remove).mockRejectedValue(
      new garnishmentService.GarnishmentNotFoundError()
    )
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: GARNISHMENT_ID })).rejects.toThrow(
      "Garnishment not found"
    )
  })
})

// --- Permission tests ---

describe("employeeGarnishments permissions", () => {
  it("rejects with payroll_data.view (wrong permission)", async () => {
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma, [PAYROLL_VIEW]))
    await expect(caller.list({ employeeId: EMP_ID })).rejects.toThrow()
  })

  it("accepts with garnishment.view", async () => {
    const garnishments = [makeGarnishment()]
    vi.mocked(garnishmentService.list).mockResolvedValue(garnishments as any)
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma, [GARNISHMENT_VIEW]))
    const result = await caller.list({ employeeId: EMP_ID })
    expect(result).toHaveLength(1)
  })
})
