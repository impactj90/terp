import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { vacationRouter } from "../vacation"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const VACATION_CONFIG_MANAGE = permissionIdByKey("vacation_config.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const EMPLOYEE_ID = "a0000000-0000-4000-a000-000000000d00"
const TARIFF_ID = "a0000000-0000-4000-a000-000000000d01"
const CALC_GROUP_ID = "a0000000-0000-4000-a000-000000000d02"
const CAPPING_GROUP_ID = "a0000000-0000-4000-a000-000000000d03"

const createCaller = createCallerFactory(vacationRouter)

// --- Helpers ---

function makeEmployee(overrides: Record<string, unknown> = {}) {
  return {
    id: EMPLOYEE_ID,
    tenantId: TENANT_ID,
    firstName: "John",
    lastName: "Doe",
    birthDate: new Date(Date.UTC(1985, 5, 15)),
    entryDate: new Date(Date.UTC(2020, 0, 1)),
    exitDate: null,
    weeklyHours: 40,
    vacationDaysPerYear: 30,
    disabilityFlag: false,
    tariffId: TARIFF_ID,
    employmentType: null,
    ...overrides,
  }
}

function makeCalcGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: CALC_GROUP_ID,
    tenantId: TENANT_ID,
    name: "Standard Group",
    basis: "calendar_year",
    specialCalcLinks: [],
    ...overrides,
  }
}

function makeTariff(overrides: Record<string, unknown> = {}) {
  return {
    id: TARIFF_ID,
    tenantId: TENANT_ID,
    annualVacationDays: 30,
    weeklyTargetHours: 40,
    vacationCappingRuleGroupId: CAPPING_GROUP_ID,
    ...overrides,
  }
}

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([VACATION_CONFIG_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- vacation.entitlementPreview tests ---

describe("vacation.entitlementPreview", () => {
  it("calculates full-year entitlement for full-time employee", async () => {
    const employee = makeEmployee()
    const tariff = makeTariff()
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(employee),
      },
      employeeTariffAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      tariff: {
        findFirst: vi.fn().mockResolvedValue(tariff),
      },
      tenant: {
        findFirst: vi.fn().mockResolvedValue({ vacationBasis: "calendar_year" }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.entitlementPreview({
      employeeId: EMPLOYEE_ID,
      year: 2025,
    })
    expect(result.employeeId).toBe(EMPLOYEE_ID)
    expect(result.employeeName).toBe("John Doe")
    expect(result.year).toBe(2025)
    expect(result.totalEntitlement).toBe(30)
    expect(result.monthsEmployed).toBe(12)
    expect(result.baseEntitlement).toBe(30)
  })

  it("uses calc group override when provided", async () => {
    const employee = makeEmployee()
    const tariff = makeTariff()
    const calcGroup = makeCalcGroup({
      specialCalcLinks: [
        {
          specialCalculation: {
            type: "age",
            threshold: 30,
            bonusDays: 2,
          },
        },
      ],
    })
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(employee),
      },
      vacationCalculationGroup: {
        findFirst: vi.fn().mockResolvedValue(calcGroup),
      },
      employeeTariffAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      tariff: {
        findFirst: vi.fn().mockResolvedValue(tariff),
      },
      tenant: {
        findFirst: vi.fn().mockResolvedValue({ vacationBasis: "calendar_year" }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.entitlementPreview({
      employeeId: EMPLOYEE_ID,
      year: 2025,
      calcGroupId: CALC_GROUP_ID,
    })
    expect(result.calcGroupId).toBe(CALC_GROUP_ID)
    expect(result.ageBonus).toBe(2) // Age 39 >= threshold 30
    expect(result.totalEntitlement).toBe(32) // 30 + 2
  })

  it("throws NOT_FOUND for non-existent employee", async () => {
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.entitlementPreview({ employeeId: EMPLOYEE_ID, year: 2025 })
    ).rejects.toThrow("Employee not found")
  })
})

// --- vacation.carryoverPreview tests ---

describe("vacation.carryoverPreview", () => {
  it("calculates carryover with capping rules", async () => {
    const employee = makeEmployee()
    const tariff = makeTariff()
    const cappingGroup = {
      id: CAPPING_GROUP_ID,
      tenantId: TENANT_ID,
      cappingRuleLinks: [
        {
          cappingRule: {
            id: "a0000000-0000-4000-a000-000000000d04",
            name: "Year End Cap",
            ruleType: "year_end",
            cutoffMonth: 12,
            cutoffDay: 31,
            capValue: 10,
          },
        },
      ],
    }
    const balance = {
      employeeId: EMPLOYEE_ID,
      year: 2025,
      entitlement: 30,
      carryover: 0,
      adjustments: 0,
      taken: 10,
    }
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(employee),
      },
      employeeTariffAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      tariff: {
        findFirst: vi.fn().mockResolvedValue(tariff),
      },
      vacationCappingRuleGroup: {
        findFirst: vi.fn().mockResolvedValue(cappingGroup),
      },
      vacationBalance: {
        findFirst: vi.fn().mockResolvedValue(balance),
      },
      employeeCappingException: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.carryoverPreview({
      employeeId: EMPLOYEE_ID,
      year: 2025,
    })
    expect(result.employeeId).toBe(EMPLOYEE_ID)
    expect(result.availableDays).toBe(20) // 30 + 0 + 0 - 10
    expect(result.cappedCarryover).toBe(10) // cap at 10
    expect(result.forfeitedDays).toBe(10) // 20 - 10
    expect(result.rulesApplied).toHaveLength(1)
    expect(result.rulesApplied[0]!.applied).toBe(true)
  })

  it("throws NOT_FOUND for non-existent employee", async () => {
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.carryoverPreview({ employeeId: EMPLOYEE_ID, year: 2025 })
    ).rejects.toThrow("Employee not found")
  })

  it("throws BAD_REQUEST for employee without tariff", async () => {
    const employee = makeEmployee({ tariffId: null })
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(employee),
      },
      employeeTariffAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      tariff: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.carryoverPreview({ employeeId: EMPLOYEE_ID, year: 2025 })
    ).rejects.toThrow("Employee has no tariff assigned")
  })

  it("throws BAD_REQUEST for tariff without capping rule group", async () => {
    const employee = makeEmployee()
    const tariff = makeTariff({ vacationCappingRuleGroupId: null })
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(employee),
      },
      employeeTariffAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      tariff: {
        findFirst: vi.fn().mockResolvedValue(tariff),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.carryoverPreview({ employeeId: EMPLOYEE_ID, year: 2025 })
    ).rejects.toThrow("Tariff has no capping rule group assigned")
  })

  it("handles zero balance (no vacation balance record)", async () => {
    const employee = makeEmployee()
    const tariff = makeTariff()
    const cappingGroup = {
      id: CAPPING_GROUP_ID,
      tenantId: TENANT_ID,
      cappingRuleLinks: [],
    }
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(employee),
      },
      employeeTariffAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      tariff: {
        findFirst: vi.fn().mockResolvedValue(tariff),
      },
      vacationCappingRuleGroup: {
        findFirst: vi.fn().mockResolvedValue(cappingGroup),
      },
      vacationBalance: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      employeeCappingException: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.carryoverPreview({
      employeeId: EMPLOYEE_ID,
      year: 2025,
    })
    expect(result.availableDays).toBe(0)
    expect(result.cappedCarryover).toBe(0)
    expect(result.forfeitedDays).toBe(0)
  })
})
