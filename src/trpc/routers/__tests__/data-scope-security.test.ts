/**
 * Data Scope Security Tests
 *
 * Comprehensive tests verifying that data scope enforcement works correctly
 * across all routers that handle employee data. Tests cover:
 * - DEPARTMENT scope: user can only see employees in their assigned departments
 * - EMPLOYEE scope: user can only see specific assigned employees
 * - ALL scope: user can see all employees (no filtering)
 * - getById bypass prevention: restricted users cannot fetch by guessing IDs
 *
 * @security This is a critical security test suite
 */
import { describe, it, expect, vi } from "vitest"
import { Prisma } from "@/generated/prisma/client"
import { createCallerFactory } from "@/trpc/init"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"
import { employeesRouter } from "../employees"
import { correctionsRouter } from "../corrections"
import { monthlyValuesRouter } from "../monthlyValues"
import { vacationBalancesRouter } from "../vacationBalances"
import { orderBookingsRouter } from "../orderBookings"
import {
  buildRelatedEmployeeDataScopeWhere,
  checkRelatedEmployeeDataScope,
  DataScopeForbiddenError,
} from "@/lib/auth/data-scope"

// --- Constants ---

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const DEPT_A_ID = "a0000000-0000-4000-a000-000000000200"
const DEPT_B_ID = "a0000000-0000-4000-a000-000000000201"
const EMP_IN_DEPT_A = "a0000000-0000-4000-a000-000000000500"
const EMP_IN_DEPT_B = "a0000000-0000-4000-a000-000000000501"
const EMP_SPECIFIC = "a0000000-0000-4000-a000-000000000502"
const CORRECTION_ID = "a0000000-0000-4000-a000-000000000600"
const MV_ID = "a0000000-0000-4000-a000-000000000700"
const VB_ID = "a0000000-0000-4000-a000-000000000800"
const OB_ID = "a0000000-0000-4000-a000-000000000900"

// Permission IDs
const EMPLOYEES_VIEW = permissionIdByKey("employees.view")!
const CORRECTIONS_MANAGE = permissionIdByKey("corrections.manage")!
const REPORTS_VIEW = permissionIdByKey("reports.view")!
const REPORTS_MANAGE = permissionIdByKey("reports.manage")!
const ABSENCES_MANAGE = permissionIdByKey("absences.manage")!
const OB_VIEW = permissionIdByKey("order_bookings.view")!
const OB_MANAGE = permissionIdByKey("order_bookings.manage")!

// --- Helpers ---

function createTestContext(
  prisma: Record<string, unknown>,
  scopeType: string,
  scopeIds: string[],
  permissions: string[]
) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions(permissions, {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
      dataScopeType: scopeType,
      dataScopeDepartmentIds: scopeType === "department" ? scopeIds : [],
      dataScopeEmployeeIds: scopeType === "employee" ? scopeIds : [],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

function makeEmployee(id: string, departmentId: string | null) {
  return {
    id,
    tenantId: TENANT_ID,
    personnelNumber: `EMP-${id.slice(-3)}`,
    pin: id.slice(-3),
    firstName: "Test",
    lastName: `Employee-${id.slice(-3)}`,
    email: null,
    phone: null,
    entryDate: new Date("2025-01-01"),
    exitDate: null,
    departmentId,
    costCenterId: null,
    employmentTypeId: null,
    locationId: null,
    tariffId: null,
    weeklyHours: new Prisma.Decimal(40),
    vacationDaysPerYear: new Prisma.Decimal(30),
    isActive: true,
    disabilityFlag: false,
    exitReason: null,
    notes: null,
    addressStreet: null,
    addressZip: null,
    addressCity: null,
    addressCountry: null,
    birthDate: null,
    gender: null,
    nationality: null,
    religion: null,
    maritalStatus: null,
    birthPlace: null,
    birthCountry: null,
    roomNumber: null,
    photoUrl: null,
    employeeGroupId: null,
    workflowGroupId: null,
    activityGroupId: null,
    defaultOrderId: null,
    defaultActivityId: null,
    partTimePercent: null,
    dailyTargetHours: null,
    weeklyTargetHours: null,
    monthlyTargetHours: null,
    annualTargetHours: null,
    workDaysPerWeek: null,
    calculationStartDate: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    department: departmentId
      ? { id: departmentId, code: `DEPT-${departmentId.slice(-3)}`, name: `Department ${departmentId.slice(-3)}` }
      : null,
    location: null,
    tariff: null,
    costCenter: null,
    employmentType: null,
    contacts: [],
    cards: [],
  }
}

// ============================================================================
// EMPLOYEES ROUTER
// ============================================================================

describe("employees data scope", () => {
  const createCaller = createCallerFactory(employeesRouter)

  describe("employees.list", () => {
    it("DEPARTMENT scope filters employees by departmentId in WHERE", async () => {
      const mockPrisma = {
        employee: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
      }
      const ctx = createTestContext(mockPrisma, "department", [DEPT_A_ID], [EMPLOYEES_VIEW])
      const caller = createCaller(ctx)

      await caller.list()

      const findManyCall = mockPrisma.employee.findMany.mock.calls[0]![0]
      expect(findManyCall.where.departmentId).toEqual({ in: [DEPT_A_ID] })
    })

    it("EMPLOYEE scope filters employees by id in WHERE", async () => {
      const mockPrisma = {
        employee: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
      }
      const ctx = createTestContext(mockPrisma, "employee", [EMP_SPECIFIC], [EMPLOYEES_VIEW])
      const caller = createCaller(ctx)

      await caller.list()

      const findManyCall = mockPrisma.employee.findMany.mock.calls[0]![0]
      expect(findManyCall.where.id).toEqual({ in: [EMP_SPECIFIC] })
    })

    it("ALL scope does not add scope filter", async () => {
      const mockPrisma = {
        employee: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
      }
      const ctx = createTestContext(mockPrisma, "all", [], [EMPLOYEES_VIEW])
      const caller = createCaller(ctx)

      await caller.list()

      const findManyCall = mockPrisma.employee.findMany.mock.calls[0]![0]
      expect(findManyCall.where.departmentId).toBeUndefined()
      expect(findManyCall.where.id).toBeUndefined()
    })
  })

  describe("employees.getById", () => {
    it("DEPARTMENT scope rejects employee outside scope", async () => {
      const empOutsideScope = makeEmployee(EMP_IN_DEPT_B, DEPT_B_ID)
      const mockPrisma = {
        employee: {
          findFirst: vi.fn().mockResolvedValue(empOutsideScope),
        },
      }
      const ctx = createTestContext(mockPrisma, "department", [DEPT_A_ID], [EMPLOYEES_VIEW])
      const caller = createCaller(ctx)

      await expect(caller.getById({ id: EMP_IN_DEPT_B })).rejects.toThrow(
        /not within data scope|FORBIDDEN/
      )
    })

    it("DEPARTMENT scope allows employee inside scope", async () => {
      const empInsideScope = makeEmployee(EMP_IN_DEPT_A, DEPT_A_ID)
      const mockPrisma = {
        employee: {
          findFirst: vi.fn().mockResolvedValue(empInsideScope),
        },
      }
      const ctx = createTestContext(mockPrisma, "department", [DEPT_A_ID], [EMPLOYEES_VIEW])
      const caller = createCaller(ctx)

      const result = await caller.getById({ id: EMP_IN_DEPT_A })
      expect(result.id).toBe(EMP_IN_DEPT_A)
    })

    it("EMPLOYEE scope rejects employee not in scope list", async () => {
      const empOutsideScope = makeEmployee(EMP_IN_DEPT_A, DEPT_A_ID)
      const mockPrisma = {
        employee: {
          findFirst: vi.fn().mockResolvedValue(empOutsideScope),
        },
      }
      const ctx = createTestContext(mockPrisma, "employee", [EMP_SPECIFIC], [EMPLOYEES_VIEW])
      const caller = createCaller(ctx)

      await expect(caller.getById({ id: EMP_IN_DEPT_A })).rejects.toThrow(
        /not within data scope|FORBIDDEN/
      )
    })

    it("EMPLOYEE scope allows employee in scope list", async () => {
      const empInScope = makeEmployee(EMP_SPECIFIC, DEPT_A_ID)
      const mockPrisma = {
        employee: {
          findFirst: vi.fn().mockResolvedValue(empInScope),
        },
      }
      const ctx = createTestContext(mockPrisma, "employee", [EMP_SPECIFIC], [EMPLOYEES_VIEW])
      const caller = createCaller(ctx)

      const result = await caller.getById({ id: EMP_SPECIFIC })
      expect(result.id).toBe(EMP_SPECIFIC)
    })
  })

  describe("employees.search", () => {
    it("DEPARTMENT scope filters search results by departmentId", async () => {
      const mockPrisma = {
        employee: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      }
      const ctx = createTestContext(mockPrisma, "department", [DEPT_A_ID], [EMPLOYEES_VIEW])
      const caller = createCaller(ctx)

      await caller.search({ query: "test" })

      const findManyCall = mockPrisma.employee.findMany.mock.calls[0]![0]
      expect(findManyCall.where.departmentId).toEqual({ in: [DEPT_A_ID] })
    })

    it("EMPLOYEE scope filters search results by id", async () => {
      const mockPrisma = {
        employee: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      }
      const ctx = createTestContext(mockPrisma, "employee", [EMP_SPECIFIC], [EMPLOYEES_VIEW])
      const caller = createCaller(ctx)

      await caller.search({ query: "test" })

      const findManyCall = mockPrisma.employee.findMany.mock.calls[0]![0]
      expect(findManyCall.where.id).toEqual({ in: [EMP_SPECIFIC] })
    })
  })

  describe("employees.update", () => {
    it("DEPARTMENT scope blocks update for employee outside scope", async () => {
      const empOutsideScope = makeEmployee(EMP_IN_DEPT_B, DEPT_B_ID)
      const mockPrisma = {
        employee: {
          findFirst: vi.fn().mockResolvedValue(empOutsideScope),
        },
      }
      const ctx = createTestContext(mockPrisma, "department", [DEPT_A_ID], [
        permissionIdByKey("employees.edit")!,
      ])
      const caller = createCaller(ctx)

      await expect(
        caller.update({ id: EMP_IN_DEPT_B, firstName: "Hacked" })
      ).rejects.toThrow(/not within data scope|FORBIDDEN/)
    })
  })

  describe("employees.delete", () => {
    it("EMPLOYEE scope blocks delete for employee outside scope", async () => {
      const empOutsideScope = makeEmployee(EMP_IN_DEPT_A, DEPT_A_ID)
      const mockPrisma = {
        employee: {
          findFirst: vi.fn().mockResolvedValue(empOutsideScope),
        },
      }
      const ctx = createTestContext(mockPrisma, "employee", [EMP_SPECIFIC], [
        permissionIdByKey("employees.delete")!,
      ])
      const caller = createCaller(ctx)

      await expect(caller.delete({ id: EMP_IN_DEPT_A })).rejects.toThrow(
        /not within data scope|FORBIDDEN/
      )
    })
  })
})

// ============================================================================
// CORRECTIONS ROUTER
// ============================================================================

describe("corrections data scope", () => {
  const createCaller = createCallerFactory(correctionsRouter)

  function makeCorrection(employeeId: string, departmentId: string | null) {
    return {
      id: CORRECTION_ID,
      tenantId: TENANT_ID,
      employeeId,
      correctionDate: new Date("2025-06-15"),
      correctionType: "time",
      accountId: null,
      valueMinutes: 60,
      reason: "Test correction",
      status: "pending",
      approvedBy: null,
      approvedAt: null,
      createdBy: USER_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      employee: departmentId !== null
        ? { id: employeeId, firstName: "Test", lastName: "Emp", personnelNumber: "E001", departmentId }
        : null,
      account: null,
    }
  }

  describe("corrections.list", () => {
    it("DEPARTMENT scope filters corrections by employee department", async () => {
      const mockPrisma = {
        correction: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
      }
      const ctx = createTestContext(mockPrisma, "department", [DEPT_A_ID], [CORRECTIONS_MANAGE])
      const caller = createCaller(ctx)

      await caller.list()

      const findManyCall = mockPrisma.correction.findMany.mock.calls[0]![0]
      expect(findManyCall.where.employee).toEqual({ departmentId: { in: [DEPT_A_ID] } })
    })

    it("EMPLOYEE scope filters corrections by employeeId", async () => {
      const mockPrisma = {
        correction: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
      }
      const ctx = createTestContext(mockPrisma, "employee", [EMP_SPECIFIC], [CORRECTIONS_MANAGE])
      const caller = createCaller(ctx)

      await caller.list()

      const findManyCall = mockPrisma.correction.findMany.mock.calls[0]![0]
      expect(findManyCall.where.employeeId).toEqual({ in: [EMP_SPECIFIC] })
    })
  })

  describe("corrections.getById", () => {
    it("DEPARTMENT scope rejects correction for employee outside department", async () => {
      const correction = makeCorrection(EMP_IN_DEPT_B, DEPT_B_ID)
      const mockPrisma = {
        correction: {
          findFirst: vi.fn().mockResolvedValue(correction),
        },
      }
      const ctx = createTestContext(mockPrisma, "department", [DEPT_A_ID], [CORRECTIONS_MANAGE])
      const caller = createCaller(ctx)

      await expect(caller.getById({ id: CORRECTION_ID })).rejects.toThrow(
        /not within data scope|FORBIDDEN/
      )
    })

    it("DEPARTMENT scope allows correction for employee in scope", async () => {
      const correction = makeCorrection(EMP_IN_DEPT_A, DEPT_A_ID)
      const mockPrisma = {
        correction: {
          findFirst: vi.fn().mockResolvedValue(correction),
        },
      }
      const ctx = createTestContext(mockPrisma, "department", [DEPT_A_ID], [CORRECTIONS_MANAGE])
      const caller = createCaller(ctx)

      const result = await caller.getById({ id: CORRECTION_ID })
      expect(result.id).toBe(CORRECTION_ID)
    })

    it("EMPLOYEE scope rejects correction for non-scoped employee", async () => {
      const correction = makeCorrection(EMP_IN_DEPT_A, DEPT_A_ID)
      const mockPrisma = {
        correction: {
          findFirst: vi.fn().mockResolvedValue(correction),
        },
      }
      const ctx = createTestContext(mockPrisma, "employee", [EMP_SPECIFIC], [CORRECTIONS_MANAGE])
      const caller = createCaller(ctx)

      await expect(caller.getById({ id: CORRECTION_ID })).rejects.toThrow(
        /not within data scope|FORBIDDEN/
      )
    })
  })

  describe("corrections.create", () => {
    it("DEPARTMENT scope blocks creating correction for employee outside scope", async () => {
      const mockPrisma = {
        employee: {
          findFirst: vi.fn().mockResolvedValue({ id: EMP_IN_DEPT_B, departmentId: DEPT_B_ID }),
        },
        correction: {},
      }
      const ctx = createTestContext(mockPrisma, "department", [DEPT_A_ID], [CORRECTIONS_MANAGE])
      const caller = createCaller(ctx)

      await expect(
        caller.create({
          employeeId: EMP_IN_DEPT_B,
          correctionDate: "2025-06-15",
          correctionType: "time",
          valueMinutes: 60,
        })
      ).rejects.toThrow(/not within data scope|FORBIDDEN/)
    })
  })
})

// ============================================================================
// MONTHLY VALUES ROUTER
// ============================================================================

describe("monthlyValues data scope", () => {
  const createCaller = createCallerFactory(monthlyValuesRouter)

  function makeMV(employeeId: string, departmentId: string | null) {
    return {
      id: MV_ID,
      tenantId: TENANT_ID,
      employeeId,
      year: 2025,
      month: 6,
      totalGrossTime: 9600,
      totalNetTime: 9000,
      totalTargetTime: 9600,
      totalOvertime: 0,
      totalUndertime: 600,
      totalBreakTime: 600,
      flextimeStart: 0,
      flextimeChange: -600,
      flextimeEnd: -600,
      flextimeCarryover: 0,
      vacationTaken: new Prisma.Decimal(0),
      sickDays: 0,
      otherAbsenceDays: 0,
      workDays: 20,
      daysWithErrors: 0,
      isClosed: false,
      closedAt: null,
      closedBy: null,
      reopenedAt: null,
      reopenedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      employee: departmentId !== null
        ? { id: employeeId, firstName: "Test", lastName: "Emp", personnelNumber: "E001", isActive: true, departmentId }
        : null,
    }
  }

  describe("monthlyValues.list", () => {
    it("DEPARTMENT scope filters list by employee department", async () => {
      const mockPrisma = {
        monthlyValue: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
      }
      const ctx = createTestContext(mockPrisma, "department", [DEPT_A_ID], [REPORTS_VIEW])
      const caller = createCaller(ctx)

      await caller.list({ year: 2025, month: 6 })

      const findManyCall = mockPrisma.monthlyValue.findMany.mock.calls[0]![0]
      expect(findManyCall.where.employee).toEqual(
        expect.objectContaining({ departmentId: { in: [DEPT_A_ID] } })
      )
    })
  })

  describe("monthlyValues.getById", () => {
    it("DEPARTMENT scope rejects MV for employee outside scope", async () => {
      const mv = makeMV(EMP_IN_DEPT_B, DEPT_B_ID)
      const mockPrisma = {
        monthlyValue: {
          findFirst: vi.fn().mockResolvedValue(mv),
        },
      }
      const ctx = createTestContext(mockPrisma, "department", [DEPT_A_ID], [REPORTS_VIEW])
      const caller = createCaller(ctx)

      await expect(caller.getById({ id: MV_ID })).rejects.toThrow(
        /not within data scope|FORBIDDEN/
      )
    })

    it("EMPLOYEE scope rejects MV for non-scoped employee", async () => {
      const mv = makeMV(EMP_IN_DEPT_A, DEPT_A_ID)
      const mockPrisma = {
        monthlyValue: {
          findFirst: vi.fn().mockResolvedValue(mv),
        },
      }
      const ctx = createTestContext(mockPrisma, "employee", [EMP_SPECIFIC], [REPORTS_VIEW])
      const caller = createCaller(ctx)

      await expect(caller.getById({ id: MV_ID })).rejects.toThrow(
        /not within data scope|FORBIDDEN/
      )
    })

    it("DEPARTMENT scope allows MV for employee in scope", async () => {
      const mv = makeMV(EMP_IN_DEPT_A, DEPT_A_ID)
      const mockPrisma = {
        monthlyValue: {
          findFirst: vi.fn().mockResolvedValue(mv),
        },
      }
      const ctx = createTestContext(mockPrisma, "department", [DEPT_A_ID], [REPORTS_VIEW])
      const caller = createCaller(ctx)

      const result = await caller.getById({ id: MV_ID })
      expect(result.id).toBe(MV_ID)
    })
  })

  describe("monthlyValues.close", () => {
    it("DEPARTMENT scope blocks close for employee outside scope", async () => {
      const mv = makeMV(EMP_IN_DEPT_B, DEPT_B_ID)
      const mockPrisma = {
        monthlyValue: {
          findFirst: vi.fn().mockResolvedValue(mv),
        },
      }
      const ctx = createTestContext(mockPrisma, "department", [DEPT_A_ID], [REPORTS_MANAGE])
      const caller = createCaller(ctx)

      await expect(caller.close({ id: MV_ID })).rejects.toThrow(
        /not within data scope|FORBIDDEN/
      )
    })
  })

  describe("monthlyValues.reopen", () => {
    it("EMPLOYEE scope blocks reopen for non-scoped employee", async () => {
      const mv = makeMV(EMP_IN_DEPT_A, DEPT_A_ID)
      mv.isClosed = true
      const mockPrisma = {
        monthlyValue: {
          findFirst: vi.fn().mockResolvedValue(mv),
        },
      }
      const ctx = createTestContext(mockPrisma, "employee", [EMP_SPECIFIC], [REPORTS_MANAGE])
      const caller = createCaller(ctx)

      await expect(caller.reopen({ id: MV_ID })).rejects.toThrow(
        /not within data scope|FORBIDDEN/
      )
    })
  })
})

// ============================================================================
// VACATION BALANCES ROUTER
// ============================================================================

describe("vacationBalances data scope", () => {
  const createCaller = createCallerFactory(vacationBalancesRouter)

  function makeBalance(employeeId: string, departmentId: string | null) {
    return {
      id: VB_ID,
      tenantId: TENANT_ID,
      employeeId,
      year: 2025,
      entitlement: new Prisma.Decimal(30),
      carryover: new Prisma.Decimal(0),
      adjustments: new Prisma.Decimal(0),
      taken: new Prisma.Decimal(5),
      carryoverExpiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      employee: departmentId !== null
        ? { id: employeeId, firstName: "Test", lastName: "Emp", personnelNumber: "E001", isActive: true, departmentId }
        : null,
    }
  }

  describe("vacationBalances.list", () => {
    it("DEPARTMENT scope filters balances by employee department", async () => {
      const mockPrisma = {
        vacationBalance: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
      }
      const ctx = createTestContext(mockPrisma, "department", [DEPT_A_ID], [ABSENCES_MANAGE])
      const caller = createCaller(ctx)

      await caller.list({})

      const findManyCall = mockPrisma.vacationBalance.findMany.mock.calls[0]![0]
      expect(findManyCall.where.employee).toEqual(
        expect.objectContaining({ departmentId: { in: [DEPT_A_ID] } })
      )
    })
  })

  describe("vacationBalances.getById", () => {
    it("DEPARTMENT scope rejects balance for employee outside scope", async () => {
      const balance = makeBalance(EMP_IN_DEPT_B, DEPT_B_ID)
      const mockPrisma = {
        vacationBalance: {
          findFirst: vi.fn().mockResolvedValue(balance),
        },
      }
      const ctx = createTestContext(mockPrisma, "department", [DEPT_A_ID], [ABSENCES_MANAGE])
      const caller = createCaller(ctx)

      await expect(caller.getById({ id: VB_ID })).rejects.toThrow(
        /not within data scope|FORBIDDEN/
      )
    })

    it("EMPLOYEE scope rejects balance for non-scoped employee", async () => {
      const balance = makeBalance(EMP_IN_DEPT_A, DEPT_A_ID)
      const mockPrisma = {
        vacationBalance: {
          findFirst: vi.fn().mockResolvedValue(balance),
        },
      }
      const ctx = createTestContext(mockPrisma, "employee", [EMP_SPECIFIC], [ABSENCES_MANAGE])
      const caller = createCaller(ctx)

      await expect(caller.getById({ id: VB_ID })).rejects.toThrow(
        /not within data scope|FORBIDDEN/
      )
    })

    it("EMPLOYEE scope allows balance for scoped employee", async () => {
      const balance = makeBalance(EMP_SPECIFIC, DEPT_A_ID)
      const mockPrisma = {
        vacationBalance: {
          findFirst: vi.fn().mockResolvedValue(balance),
        },
      }
      const ctx = createTestContext(mockPrisma, "employee", [EMP_SPECIFIC], [ABSENCES_MANAGE])
      const caller = createCaller(ctx)

      const result = await caller.getById({ id: VB_ID })
      expect(result.id).toBe(VB_ID)
    })
  })

  describe("vacationBalances.create", () => {
    it("DEPARTMENT scope blocks creation for employee outside scope", async () => {
      const mockPrisma = {
        employee: {
          findFirst: vi.fn().mockResolvedValue({ id: EMP_IN_DEPT_B, departmentId: DEPT_B_ID }),
        },
        vacationBalance: {},
      }
      const ctx = createTestContext(mockPrisma, "department", [DEPT_A_ID], [ABSENCES_MANAGE])
      const caller = createCaller(ctx)

      await expect(
        caller.create({
          employeeId: EMP_IN_DEPT_B,
          year: 2025,
          entitlement: 30,
          carryover: 0,
          adjustments: 0,
        })
      ).rejects.toThrow(/not within data scope|FORBIDDEN/)
    })
  })

  describe("vacationBalances.update", () => {
    it("EMPLOYEE scope blocks update for non-scoped employee", async () => {
      const balance = makeBalance(EMP_IN_DEPT_A, DEPT_A_ID)
      const mockPrisma = {
        vacationBalance: {
          findFirst: vi.fn().mockResolvedValue(balance),
        },
      }
      const ctx = createTestContext(mockPrisma, "employee", [EMP_SPECIFIC], [ABSENCES_MANAGE])
      const caller = createCaller(ctx)

      await expect(
        caller.update({ id: VB_ID, entitlement: 25 })
      ).rejects.toThrow(/not within data scope|FORBIDDEN/)
    })
  })
})

// ============================================================================
// ORDER BOOKINGS ROUTER
// ============================================================================

describe("orderBookings data scope", () => {
  const createCaller = createCallerFactory(orderBookingsRouter)

  function makeOB(employeeId: string, departmentId: string | null) {
    return {
      id: OB_ID,
      tenantId: TENANT_ID,
      employeeId,
      orderId: "a0000000-0000-4000-a000-000000001000",
      activityId: null,
      bookingDate: new Date("2025-06-15"),
      timeMinutes: 480,
      description: "Test booking",
      source: "manual",
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: USER_ID,
      updatedBy: USER_ID,
      employee: departmentId !== null
        ? { id: employeeId, firstName: "Test", lastName: "Emp", personnelNumber: "E001", departmentId }
        : null,
      order: { id: "a0000000-0000-4000-a000-000000001000", code: "ORD1", name: "Order 1" },
      activity: null,
    }
  }

  describe("orderBookings.list", () => {
    it("DEPARTMENT scope filters order bookings by employee department", async () => {
      const mockPrisma = {
        orderBooking: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
      }
      const ctx = createTestContext(mockPrisma, "department", [DEPT_A_ID], [OB_VIEW])
      const caller = createCaller(ctx)

      await caller.list()

      const findManyCall = mockPrisma.orderBooking.findMany.mock.calls[0]![0]
      expect(findManyCall.where.employee).toEqual({ departmentId: { in: [DEPT_A_ID] } })
    })

    it("EMPLOYEE scope filters order bookings by employeeId", async () => {
      const mockPrisma = {
        orderBooking: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
      }
      const ctx = createTestContext(mockPrisma, "employee", [EMP_SPECIFIC], [OB_VIEW])
      const caller = createCaller(ctx)

      await caller.list()

      const findManyCall = mockPrisma.orderBooking.findMany.mock.calls[0]![0]
      expect(findManyCall.where.employeeId).toEqual({ in: [EMP_SPECIFIC] })
    })
  })

  describe("orderBookings.getById", () => {
    it("DEPARTMENT scope rejects OB for employee outside scope", async () => {
      const ob = makeOB(EMP_IN_DEPT_B, DEPT_B_ID)
      const mockPrisma = {
        orderBooking: {
          findFirst: vi.fn().mockResolvedValue(ob),
        },
      }
      const ctx = createTestContext(mockPrisma, "department", [DEPT_A_ID], [OB_VIEW])
      const caller = createCaller(ctx)

      await expect(caller.getById({ id: OB_ID })).rejects.toThrow(
        /not within data scope|FORBIDDEN/
      )
    })

    it("EMPLOYEE scope rejects OB for non-scoped employee", async () => {
      const ob = makeOB(EMP_IN_DEPT_A, DEPT_A_ID)
      const mockPrisma = {
        orderBooking: {
          findFirst: vi.fn().mockResolvedValue(ob),
        },
      }
      const ctx = createTestContext(mockPrisma, "employee", [EMP_SPECIFIC], [OB_VIEW])
      const caller = createCaller(ctx)

      await expect(caller.getById({ id: OB_ID })).rejects.toThrow(
        /not within data scope|FORBIDDEN/
      )
    })
  })

  describe("orderBookings.create", () => {
    it("DEPARTMENT scope blocks creating OB for employee outside scope", async () => {
      const mockPrisma = {
        employee: {
          findFirst: vi.fn().mockResolvedValue({ id: EMP_IN_DEPT_B, departmentId: DEPT_B_ID }),
        },
        orderBooking: {},
      }
      const ctx = createTestContext(mockPrisma, "department", [DEPT_A_ID], [OB_MANAGE])
      const caller = createCaller(ctx)

      await expect(
        caller.create({
          employeeId: EMP_IN_DEPT_B,
          orderId: "a0000000-0000-4000-a000-000000001000",
          bookingDate: "2025-06-15",
          timeMinutes: 480,
        })
      ).rejects.toThrow(/not within data scope|FORBIDDEN/)
    })
  })

  describe("orderBookings.delete", () => {
    it("EMPLOYEE scope blocks deleting OB for non-scoped employee", async () => {
      const ob = makeOB(EMP_IN_DEPT_A, DEPT_A_ID)
      const mockPrisma = {
        orderBooking: {
          findFirst: vi.fn().mockResolvedValue(ob),
        },
      }
      const ctx = createTestContext(mockPrisma, "employee", [EMP_SPECIFIC], [OB_MANAGE])
      const caller = createCaller(ctx)

      await expect(caller.delete({ id: OB_ID })).rejects.toThrow(
        /not within data scope|FORBIDDEN/
      )
    })
  })
})

// ============================================================================
// SHARED DATA SCOPE UTILITY TESTS
// ============================================================================

describe("shared data scope utilities", () => {

  describe("buildRelatedEmployeeDataScopeWhere", () => {
    it("returns null for 'all' scope", () => {
      expect(
        buildRelatedEmployeeDataScopeWhere({ type: "all", tenantIds: [], departmentIds: [], employeeIds: [] })
      ).toBeNull()
    })

    it("returns null for 'tenant' scope", () => {
      expect(
        buildRelatedEmployeeDataScopeWhere({ type: "tenant", tenantIds: [TENANT_ID], departmentIds: [], employeeIds: [] })
      ).toBeNull()
    })

    it("returns department filter for 'department' scope", () => {
      const result = buildRelatedEmployeeDataScopeWhere({
        type: "department",
        tenantIds: [],
        departmentIds: [DEPT_A_ID, DEPT_B_ID],
        employeeIds: [],
      })
      expect(result).toEqual({
        employee: { departmentId: { in: [DEPT_A_ID, DEPT_B_ID] } },
      })
    })

    it("returns employeeId filter for 'employee' scope", () => {
      const result = buildRelatedEmployeeDataScopeWhere({
        type: "employee",
        tenantIds: [],
        departmentIds: [],
        employeeIds: [EMP_SPECIFIC],
      })
      expect(result).toEqual({
        employeeId: { in: [EMP_SPECIFIC] },
      })
    })
  })

  describe("checkRelatedEmployeeDataScope", () => {
    it("passes for 'all' scope", () => {
      expect(() =>
        checkRelatedEmployeeDataScope(
          { type: "all", tenantIds: [], departmentIds: [], employeeIds: [] },
          { employeeId: EMP_IN_DEPT_B, employee: { departmentId: DEPT_B_ID } }
        )
      ).not.toThrow()
    })

    it("passes when employee is in department scope", () => {
      expect(() =>
        checkRelatedEmployeeDataScope(
          { type: "department", tenantIds: [], departmentIds: [DEPT_A_ID], employeeIds: [] },
          { employeeId: EMP_IN_DEPT_A, employee: { departmentId: DEPT_A_ID } }
        )
      ).not.toThrow()
    })

    it("throws when employee is NOT in department scope", () => {
      expect(() =>
        checkRelatedEmployeeDataScope(
          { type: "department", tenantIds: [], departmentIds: [DEPT_A_ID], employeeIds: [] },
          { employeeId: EMP_IN_DEPT_B, employee: { departmentId: DEPT_B_ID } }
        )
      ).toThrow(DataScopeForbiddenError)
    })

    it("throws when employee has null departmentId in department scope", () => {
      expect(() =>
        checkRelatedEmployeeDataScope(
          { type: "department", tenantIds: [], departmentIds: [DEPT_A_ID], employeeIds: [] },
          { employeeId: EMP_IN_DEPT_B, employee: { departmentId: null } }
        )
      ).toThrow(DataScopeForbiddenError)
    })

    it("throws when employee relation is missing in department scope", () => {
      expect(() =>
        checkRelatedEmployeeDataScope(
          { type: "department", tenantIds: [], departmentIds: [DEPT_A_ID], employeeIds: [] },
          { employeeId: EMP_IN_DEPT_B }
        )
      ).toThrow(DataScopeForbiddenError)
    })

    it("passes when employee is in employee scope", () => {
      expect(() =>
        checkRelatedEmployeeDataScope(
          { type: "employee", tenantIds: [], departmentIds: [], employeeIds: [EMP_SPECIFIC] },
          { employeeId: EMP_SPECIFIC }
        )
      ).not.toThrow()
    })

    it("throws when employee is NOT in employee scope", () => {
      expect(() =>
        checkRelatedEmployeeDataScope(
          { type: "employee", tenantIds: [], departmentIds: [], employeeIds: [EMP_SPECIFIC] },
          { employeeId: EMP_IN_DEPT_A }
        )
      ).toThrow(DataScopeForbiddenError)
    })

    it("includes entity name in error message", () => {
      try {
        checkRelatedEmployeeDataScope(
          { type: "employee", tenantIds: [], departmentIds: [], employeeIds: [EMP_SPECIFIC] },
          { employeeId: EMP_IN_DEPT_A },
          "Correction"
        )
        expect.fail("Should have thrown")
      } catch (err: unknown) {
        expect((err as Error).message).toContain("Correction")
      }
    })
  })
})
