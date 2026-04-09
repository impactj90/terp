import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { employeeSavingsRouter } from "../employeeSavings"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"
import * as savingsService from "@/lib/services/employee-savings-service"

vi.mock("@/lib/services/employee-savings-service", () => ({
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
  SavingsNotFoundError: class SavingsNotFoundError extends Error {
    constructor() {
      super("Savings record not found")
      this.name = "SavingsNotFoundError"
    }
  },
  SavingsValidationError: class SavingsValidationError extends Error {
    constructor(message: string) {
      super(message)
      this.name = "SavingsValidationError"
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
const SAVINGS_ID = "a0000000-0000-4000-a000-000000000700"

const createCaller = createCallerFactory(employeeSavingsRouter)

// --- Helpers ---

function makeSavings(
  overrides: Partial<{
    id: string
    tenantId: string
    employeeId: string
    investmentType: string
    recipient: string
    recipientIban: string | null
    contractNumber: string | null
    monthlyAmount: number
    employerShare: number
    employeeShare: number
    startDate: Date
    endDate: Date | null
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: SAVINGS_ID,
    tenantId: TENANT_ID,
    employeeId: EMP_ID,
    investmentType: "Bausparvertrag",
    recipient: "Schwäbisch Hall",
    recipientIban: "DE89370400440532013000",
    contractNumber: "BSV-98765",
    monthlyAmount: 40,
    employerShare: 26.59,
    employeeShare: 13.41,
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

// --- employeeSavings.list tests ---

describe("employeeSavings.list", () => {
  it("returns savings for employee", async () => {
    const savings = [makeSavings()]
    vi.mocked(savingsService.list).mockResolvedValue(savings)
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list({ employeeId: EMP_ID })
    expect(result).toHaveLength(1)
    expect(result[0]!.investmentType).toBe("Bausparvertrag")
    expect(savingsService.list).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      EMP_ID
    )
  })
})

// --- employeeSavings.create tests ---

describe("employeeSavings.create", () => {
  it("creates saving with encrypted IBAN (verifies call args)", async () => {
    const created = makeSavings()
    vi.mocked(savingsService.create).mockResolvedValue(created)
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      employeeId: EMP_ID,
      investmentType: "Bausparvertrag",
      recipient: "Schwäbisch Hall",
      recipientIban: "DE89370400440532013000",
      contractNumber: "BSV-98765",
      monthlyAmount: 40,
      startDate: new Date("2025-01-01"),
    })
    expect(result!.recipient).toBe("Schwäbisch Hall")
    expect(savingsService.create).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      expect.objectContaining({
        employeeId: EMP_ID,
        investmentType: "Bausparvertrag",
        recipient: "Schwäbisch Hall",
        recipientIban: "DE89370400440532013000",
        monthlyAmount: 40,
        employerShare: 0,
        employeeShare: 0,
      }),
      expect.objectContaining({
        userId: expect.any(String),
        ipAddress: null,
        userAgent: null,
      })
    )
  })
})

// --- employeeSavings.update tests ---

describe("employeeSavings.update", () => {
  it("performs partial update", async () => {
    const updated = makeSavings({ recipient: "LBS Bayern" })
    vi.mocked(savingsService.update).mockResolvedValue(updated)
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: SAVINGS_ID,
      recipient: "LBS Bayern",
    })
    expect(result!.recipient).toBe("LBS Bayern")
    expect(savingsService.update).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      SAVINGS_ID,
      expect.objectContaining({ recipient: "LBS Bayern" }),
      expect.objectContaining({ userId: expect.any(String) })
    )
  })
})

// --- employeeSavings.delete tests ---

describe("employeeSavings.delete", () => {
  it("removes savings record", async () => {
    vi.mocked(savingsService.remove).mockResolvedValue({ success: true })
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: SAVINGS_ID })
    expect(result!.success).toBe(true)
    expect(savingsService.remove).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      SAVINGS_ID,
      expect.objectContaining({ userId: expect.any(String) })
    )
  })
})
