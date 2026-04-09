import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"
import { employeeCompanyCarsRouter } from "../employeeCompanyCars"
import { employeeJobBikesRouter } from "../employeeJobBikes"
import { employeeMealAllowancesRouter } from "../employeeMealAllowances"
import { employeeVouchersRouter } from "../employeeVouchers"
import { employeeJobTicketsRouter } from "../employeeJobTickets"
import * as companyCarsService from "@/lib/services/employee-company-cars-service"
import * as jobBikesService from "@/lib/services/employee-job-bikes-service"
import * as mealAllowancesService from "@/lib/services/employee-meal-allowances-service"
import * as vouchersService from "@/lib/services/employee-vouchers-service"
import * as jobTicketsService from "@/lib/services/employee-job-tickets-service"

// --- Service Mocks ---

vi.mock("@/lib/services/employee-company-cars-service", () => ({
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
  CompanyCarNotFoundError: class CompanyCarNotFoundError extends Error {
    constructor() {
      super("Company car not found")
      this.name = "CompanyCarNotFoundError"
    }
  },
  CompanyCarValidationError: class CompanyCarValidationError extends Error {
    constructor(message: string) {
      super(message)
      this.name = "CompanyCarValidationError"
    }
  },
}))

vi.mock("@/lib/services/employee-job-bikes-service", () => ({
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
  JobBikeNotFoundError: class JobBikeNotFoundError extends Error {
    constructor() {
      super("Job bike not found")
      this.name = "JobBikeNotFoundError"
    }
  },
  JobBikeValidationError: class JobBikeValidationError extends Error {
    constructor(message: string) {
      super(message)
      this.name = "JobBikeValidationError"
    }
  },
}))

vi.mock("@/lib/services/employee-meal-allowances-service", () => ({
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
  MealAllowanceNotFoundError: class MealAllowanceNotFoundError extends Error {
    constructor() {
      super("Meal allowance not found")
      this.name = "MealAllowanceNotFoundError"
    }
  },
  MealAllowanceValidationError: class MealAllowanceValidationError extends Error {
    constructor(message: string) {
      super(message)
      this.name = "MealAllowanceValidationError"
    }
  },
}))

vi.mock("@/lib/services/employee-vouchers-service", () => ({
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
  VoucherNotFoundError: class VoucherNotFoundError extends Error {
    constructor() {
      super("Voucher not found")
      this.name = "VoucherNotFoundError"
    }
  },
  VoucherValidationError: class VoucherValidationError extends Error {
    constructor(message: string) {
      super(message)
      this.name = "VoucherValidationError"
    }
  },
}))

vi.mock("@/lib/services/employee-job-tickets-service", () => ({
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
  JobTicketNotFoundError: class JobTicketNotFoundError extends Error {
    constructor() {
      super("Job ticket not found")
      this.name = "JobTicketNotFoundError"
    }
  },
  JobTicketValidationError: class JobTicketValidationError extends Error {
    constructor(message: string) {
      super(message)
      this.name = "JobTicketValidationError"
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
const ITEM_ID = "a0000000-0000-4000-a000-000000000700"

// --- Helpers ---

function createTestContext(
  mockPrisma: Record<string, unknown>,
  permissions: string[] = [PAYROLL_VIEW, PAYROLL_EDIT]
) {
  return createMockContext({
    prisma: mockPrisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions(permissions, {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// ============================================================
// employeeCompanyCars
// ============================================================

describe("employeeCompanyCars", () => {
  const createCaller = createCallerFactory(employeeCompanyCarsRouter)

  it("list returns items", async () => {
    const items = [
      {
        id: ITEM_ID,
        tenantId: TENANT_ID,
        employeeId: EMP_ID,
        listPrice: 45000,
        propulsionType: "electric",
        distanceToWorkKm: 25,
        usageType: "private_and_commute",
        licensePlate: "B-AB 1234",
        makeModel: "Tesla Model 3",
        startDate: new Date("2025-01-01"),
        endDate: null,
        notes: null,
        createdAt: new Date("2025-01-01"),
        updatedAt: new Date("2025-01-01"),
      },
    ]
    vi.mocked(companyCarsService.list).mockResolvedValue(items)
    const caller = createCaller(createTestContext({}))
    const result = await caller.list({ employeeId: EMP_ID })
    expect(result).toHaveLength(1)
    expect(result![0]!.listPrice).toBe(45000)
    expect(companyCarsService.list).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      EMP_ID
    )
  })

  it("create calls service with audit context", async () => {
    const created = {
      id: ITEM_ID,
      tenantId: TENANT_ID,
      employeeId: EMP_ID,
      listPrice: 45000,
      propulsionType: "electric",
      distanceToWorkKm: 25,
      usageType: "private_and_commute",
      licensePlate: null,
      makeModel: null,
      startDate: new Date("2025-01-01"),
      endDate: null,
      notes: null,
      createdAt: new Date("2025-01-01"),
      updatedAt: new Date("2025-01-01"),
    }
    vi.mocked(companyCarsService.create).mockResolvedValue(created)
    const caller = createCaller(createTestContext({}))
    const result = await caller.create({
      employeeId: EMP_ID,
      listPrice: 45000,
      propulsionType: "electric",
      distanceToWorkKm: 25,
      usageType: "private_and_commute",
      startDate: new Date("2025-01-01"),
    })
    expect(result!.id).toBe(ITEM_ID)
    expect(companyCarsService.create).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      expect.objectContaining({ employeeId: EMP_ID, listPrice: 45000 }),
      expect.objectContaining({ userId: expect.any(String) })
    )
  })
})

// ============================================================
// employeeJobBikes
// ============================================================

describe("employeeJobBikes", () => {
  const createCaller = createCallerFactory(employeeJobBikesRouter)

  it("list returns items", async () => {
    const items = [
      {
        id: ITEM_ID,
        tenantId: TENANT_ID,
        employeeId: EMP_ID,
        listPrice: 3500,
        usageType: "leasing",
        startDate: new Date("2025-03-01"),
        endDate: null,
        createdAt: new Date("2025-03-01"),
        updatedAt: new Date("2025-03-01"),
      },
    ]
    vi.mocked(jobBikesService.list).mockResolvedValue(items)
    const caller = createCaller(createTestContext({}))
    const result = await caller.list({ employeeId: EMP_ID })
    expect(result).toHaveLength(1)
    expect(result![0]!.listPrice).toBe(3500)
    expect(jobBikesService.list).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      EMP_ID
    )
  })

  it("create calls service with audit context", async () => {
    const created = {
      id: ITEM_ID,
      tenantId: TENANT_ID,
      employeeId: EMP_ID,
      listPrice: 3500,
      usageType: "leasing",
      startDate: new Date("2025-03-01"),
      endDate: null,
      createdAt: new Date("2025-03-01"),
      updatedAt: new Date("2025-03-01"),
    }
    vi.mocked(jobBikesService.create).mockResolvedValue(created)
    const caller = createCaller(createTestContext({}))
    const result = await caller.create({
      employeeId: EMP_ID,
      listPrice: 3500,
      usageType: "leasing",
      startDate: new Date("2025-03-01"),
    })
    expect(result!.id).toBe(ITEM_ID)
    expect(jobBikesService.create).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      expect.objectContaining({ employeeId: EMP_ID, listPrice: 3500 }),
      expect.objectContaining({ userId: expect.any(String) })
    )
  })
})

// ============================================================
// employeeMealAllowances
// ============================================================

describe("employeeMealAllowances", () => {
  const createCaller = createCallerFactory(employeeMealAllowancesRouter)

  it("list returns items", async () => {
    const items = [
      {
        id: ITEM_ID,
        tenantId: TENANT_ID,
        employeeId: EMP_ID,
        dailyAmount: 6.57,
        workDaysPerMonth: 20,
        startDate: new Date("2025-01-01"),
        endDate: null,
        createdAt: new Date("2025-01-01"),
        updatedAt: new Date("2025-01-01"),
      },
    ]
    vi.mocked(mealAllowancesService.list).mockResolvedValue(items)
    const caller = createCaller(createTestContext({}))
    const result = await caller.list({ employeeId: EMP_ID })
    expect(result).toHaveLength(1)
    expect(result![0]!.dailyAmount).toBe(6.57)
    expect(mealAllowancesService.list).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      EMP_ID
    )
  })

  it("create calls service with audit context", async () => {
    const created = {
      id: ITEM_ID,
      tenantId: TENANT_ID,
      employeeId: EMP_ID,
      dailyAmount: 6.57,
      workDaysPerMonth: 20,
      startDate: new Date("2025-01-01"),
      endDate: null,
      createdAt: new Date("2025-01-01"),
      updatedAt: new Date("2025-01-01"),
    }
    vi.mocked(mealAllowancesService.create).mockResolvedValue(created)
    const caller = createCaller(createTestContext({}))
    const result = await caller.create({
      employeeId: EMP_ID,
      dailyAmount: 6.57,
      startDate: new Date("2025-01-01"),
    })
    expect(result!.id).toBe(ITEM_ID)
    expect(mealAllowancesService.create).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      expect.objectContaining({ employeeId: EMP_ID, dailyAmount: 6.57, workDaysPerMonth: 20 }),
      expect.objectContaining({ userId: expect.any(String) })
    )
  })
})

// ============================================================
// employeeVouchers
// ============================================================

describe("employeeVouchers", () => {
  const createCaller = createCallerFactory(employeeVouchersRouter)

  it("list returns items", async () => {
    const items = [
      {
        id: ITEM_ID,
        tenantId: TENANT_ID,
        employeeId: EMP_ID,
        monthlyAmount: 50,
        provider: "Sodexo",
        startDate: new Date("2025-01-01"),
        endDate: null,
        createdAt: new Date("2025-01-01"),
        updatedAt: new Date("2025-01-01"),
      },
    ]
    vi.mocked(vouchersService.list).mockResolvedValue(items)
    const caller = createCaller(createTestContext({}))
    const result = await caller.list({ employeeId: EMP_ID })
    expect(result).toHaveLength(1)
    expect(result![0]!.monthlyAmount).toBe(50)
    expect(vouchersService.list).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      EMP_ID
    )
  })

  it("create calls service with audit context", async () => {
    const created = {
      id: ITEM_ID,
      tenantId: TENANT_ID,
      employeeId: EMP_ID,
      monthlyAmount: 50,
      provider: "Sodexo",
      startDate: new Date("2025-01-01"),
      endDate: null,
      createdAt: new Date("2025-01-01"),
      updatedAt: new Date("2025-01-01"),
    }
    vi.mocked(vouchersService.create).mockResolvedValue(created)
    const caller = createCaller(createTestContext({}))
    const result = await caller.create({
      employeeId: EMP_ID,
      monthlyAmount: 50,
      provider: "Sodexo",
      startDate: new Date("2025-01-01"),
    })
    expect(result!.id).toBe(ITEM_ID)
    expect(vouchersService.create).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      expect.objectContaining({ employeeId: EMP_ID, monthlyAmount: 50 }),
      expect.objectContaining({ userId: expect.any(String) })
    )
  })
})

// ============================================================
// employeeJobTickets
// ============================================================

describe("employeeJobTickets", () => {
  const createCaller = createCallerFactory(employeeJobTicketsRouter)

  it("list returns items", async () => {
    const items = [
      {
        id: ITEM_ID,
        tenantId: TENANT_ID,
        employeeId: EMP_ID,
        monthlyAmount: 49,
        provider: "DB",
        isAdditional: false,
        startDate: new Date("2025-01-01"),
        endDate: null,
        createdAt: new Date("2025-01-01"),
        updatedAt: new Date("2025-01-01"),
      },
    ]
    vi.mocked(jobTicketsService.list).mockResolvedValue(items)
    const caller = createCaller(createTestContext({}))
    const result = await caller.list({ employeeId: EMP_ID })
    expect(result).toHaveLength(1)
    expect(result![0]!.monthlyAmount).toBe(49)
    expect(jobTicketsService.list).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      EMP_ID
    )
  })

  it("create calls service with audit context", async () => {
    const created = {
      id: ITEM_ID,
      tenantId: TENANT_ID,
      employeeId: EMP_ID,
      monthlyAmount: 49,
      provider: "DB",
      isAdditional: false,
      startDate: new Date("2025-01-01"),
      endDate: null,
      createdAt: new Date("2025-01-01"),
      updatedAt: new Date("2025-01-01"),
    }
    vi.mocked(jobTicketsService.create).mockResolvedValue(created)
    const caller = createCaller(createTestContext({}))
    const result = await caller.create({
      employeeId: EMP_ID,
      monthlyAmount: 49,
      provider: "DB",
      startDate: new Date("2025-01-01"),
    })
    expect(result!.id).toBe(ITEM_ID)
    expect(jobTicketsService.create).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      expect.objectContaining({ employeeId: EMP_ID, monthlyAmount: 49 }),
      expect.objectContaining({ userId: expect.any(String) })
    )
  })
})
