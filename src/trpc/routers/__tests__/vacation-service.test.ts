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

const ABSENCES_MANAGE = permissionIdByKey("absences.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const EMPLOYEE_ID = "a0000000-0000-4000-a000-000000000d00"
const TARIFF_ID = "a0000000-0000-4000-a000-000000000d01"

const createCaller = createCallerFactory(vacationRouter)

// --- Helpers ---

function makeEmployee(overrides: Record<string, unknown> = {}) {
  return {
    id: EMPLOYEE_ID,
    tenantId: TENANT_ID,
    firstName: "John",
    lastName: "Doe",
    personnelNumber: "EMP001",
    birthDate: new Date(Date.UTC(1985, 5, 15)),
    entryDate: new Date(Date.UTC(2020, 0, 1)),
    exitDate: null,
    weeklyHours: 40,
    vacationDaysPerYear: 30,
    disabilityFlag: false,
    tariffId: TARIFF_ID,
    employmentType: null,
    isActive: true,
    departmentId: null,
    ...overrides,
  }
}

function makeBalance(overrides: Record<string, unknown> = {}) {
  return {
    id: "a0000000-0000-4000-a000-000000000b00",
    tenantId: TENANT_ID,
    employeeId: EMPLOYEE_ID,
    year: 2025,
    entitlement: 30,
    carryover: 5,
    adjustments: 2,
    taken: 10,
    carryoverExpiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    employee: {
      id: EMPLOYEE_ID,
      firstName: "John",
      lastName: "Doe",
      personnelNumber: "EMP001",
      isActive: true,
      departmentId: null,
    },
    ...overrides,
  }
}

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([ABSENCES_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- vacation.getBalance tests ---

describe("vacation.getBalance", () => {
  it("returns balance for existing employee/year", async () => {
    const balance = makeBalance()
    const mockPrisma = {
      vacationBalance: {
        findFirst: vi.fn().mockResolvedValue(balance),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getBalance({
      employeeId: EMPLOYEE_ID,
      year: 2025,
    })
    expect(result.employeeId).toBe(EMPLOYEE_ID)
    expect(result.year).toBe(2025)
    expect(result.entitlement).toBe(30)
    expect(result.carryover).toBe(5)
    expect(result.adjustments).toBe(2)
    expect(result.taken).toBe(10)
  })

  it("throws NOT_FOUND for missing balance", async () => {
    const mockPrisma = {
      vacationBalance: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.getBalance({ employeeId: EMPLOYEE_ID, year: 2025 })
    ).rejects.toThrow("Vacation balance not found")
  })

  it("computes total and available correctly", async () => {
    const balance = makeBalance({
      entitlement: 30,
      carryover: 5,
      adjustments: 3,
      taken: 12,
    })
    const mockPrisma = {
      vacationBalance: {
        findFirst: vi.fn().mockResolvedValue(balance),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getBalance({
      employeeId: EMPLOYEE_ID,
      year: 2025,
    })
    expect(result.total).toBe(38) // 30 + 5 + 3
    expect(result.available).toBe(26) // 38 - 12
  })
})

// --- vacation.initializeYear tests ---

describe("vacation.initializeYear", () => {
  it("creates new balance with calculated entitlement", async () => {
    const employee = makeEmployee()
    const upsertedBalance = makeBalance({
      entitlement: 30,
      carryover: 0,
      adjustments: 0,
      taken: 0,
    })
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(employee),
      },
      vacationCalculationGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      employeeTariffAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      tariff: {
        findFirst: vi.fn().mockResolvedValue({
          id: TARIFF_ID,
          weeklyTargetHours: 40,
          annualVacationDays: 30,
          vacationBasis: null,
          vacationCappingRuleGroupId: null,
        }),
      },
      tenant: {
        findFirst: vi.fn().mockResolvedValue({ vacationBasis: "calendar_year" }),
      },
      vacationBalance: {
        upsert: vi.fn().mockResolvedValue(upsertedBalance),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.initializeYear({
      employeeId: EMPLOYEE_ID,
      year: 2025,
    })
    expect(result.employeeId).toBe(EMPLOYEE_ID)
    expect(result.entitlement).toBe(30)
    expect(mockPrisma.vacationBalance.upsert).toHaveBeenCalledOnce()
  })

  it("throws NOT_FOUND for missing employee", async () => {
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.initializeYear({ employeeId: EMPLOYEE_ID, year: 2025 })
    ).rejects.toThrow("Employee not found")
  })

  it("handles employee without tariff (uses defaults)", async () => {
    const employee = makeEmployee({ tariffId: null })
    const upsertedBalance = makeBalance({
      entitlement: 30,
      carryover: 0,
      adjustments: 0,
      taken: 0,
    })
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(employee),
      },
      vacationCalculationGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      employeeTariffAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      tariff: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      tenant: {
        findFirst: vi.fn().mockResolvedValue({ vacationBasis: "calendar_year" }),
      },
      vacationBalance: {
        upsert: vi.fn().mockResolvedValue(upsertedBalance),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.initializeYear({
      employeeId: EMPLOYEE_ID,
      year: 2025,
    })
    // Should succeed with employee's own vacationDaysPerYear
    expect(result.employeeId).toBe(EMPLOYEE_ID)
    expect(mockPrisma.vacationBalance.upsert).toHaveBeenCalledOnce()
  })

  it("handles employee without calc group (uses defaults)", async () => {
    const employee = makeEmployee({ employmentType: null })
    const upsertedBalance = makeBalance({
      entitlement: 30,
      carryover: 0,
      adjustments: 0,
      taken: 0,
    })
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(employee),
      },
      employeeTariffAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      tariff: {
        findFirst: vi.fn().mockResolvedValue({
          id: TARIFF_ID,
          weeklyTargetHours: 40,
          annualVacationDays: 30,
          vacationBasis: null,
          vacationCappingRuleGroupId: null,
        }),
      },
      tenant: {
        findFirst: vi.fn().mockResolvedValue({ vacationBasis: "calendar_year" }),
      },
      vacationBalance: {
        upsert: vi.fn().mockResolvedValue(upsertedBalance),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.initializeYear({
      employeeId: EMPLOYEE_ID,
      year: 2025,
    })
    expect(result.employeeId).toBe(EMPLOYEE_ID)
  })
})

// --- vacation.adjustBalance tests ---

describe("vacation.adjustBalance", () => {
  it("accumulates positive adjustment", async () => {
    const existing = makeBalance({ adjustments: 2 })
    const updated = makeBalance({ adjustments: 7 }) // 2 + 5
    const mockPrisma = {
      vacationBalance: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.adjustBalance({
      employeeId: EMPLOYEE_ID,
      year: 2025,
      adjustment: 5,
    })
    expect(result.adjustments).toBe(7)
    expect(mockPrisma.vacationBalance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { adjustments: { increment: 5 } },
      })
    )
  })

  it("accumulates negative adjustment", async () => {
    const existing = makeBalance({ adjustments: 5 })
    const updated = makeBalance({ adjustments: 2 }) // 5 - 3
    const mockPrisma = {
      vacationBalance: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.adjustBalance({
      employeeId: EMPLOYEE_ID,
      year: 2025,
      adjustment: -3,
    })
    expect(result.adjustments).toBe(2)
  })

  it("throws NOT_FOUND for missing balance", async () => {
    const mockPrisma = {
      vacationBalance: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.adjustBalance({
        employeeId: EMPLOYEE_ID,
        year: 2025,
        adjustment: 5,
      })
    ).rejects.toThrow("Vacation balance not found")
  })
})

// --- vacation.carryoverFromPreviousYear tests ---

describe("vacation.carryoverFromPreviousYear", () => {
  it("carries over available balance (no capping rules)", async () => {
    const employee = makeEmployee()
    const prevBalance = makeBalance({
      year: 2024,
      entitlement: 30,
      carryover: 0,
      adjustments: 0,
      taken: 10,
    })
    const upsertedBalance = makeBalance({
      year: 2025,
      carryover: 20, // 30 - 10 = 20 available, no cap
    })
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(employee),
      },
      vacationBalance: {
        findFirst: vi.fn().mockResolvedValue(prevBalance),
        upsert: vi.fn().mockResolvedValue(upsertedBalance),
      },
      employeeTariffAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      tariff: {
        findFirst: vi.fn().mockResolvedValue({
          id: TARIFF_ID,
          vacationCappingRuleGroupId: null,
        }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.carryoverFromPreviousYear({
      employeeId: EMPLOYEE_ID,
      year: 2025,
    })
    expect(result).not.toBeNull()
    expect(result!.carryover).toBe(20)
    expect(mockPrisma.vacationBalance.upsert).toHaveBeenCalledOnce()
  })

  it("returns null when no previous balance", async () => {
    const employee = makeEmployee()
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(employee),
      },
      vacationBalance: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.carryoverFromPreviousYear({
      employeeId: EMPLOYEE_ID,
      year: 2025,
    })
    expect(result).toBeNull()
  })

  it("returns null when carryover is zero (all taken)", async () => {
    const employee = makeEmployee()
    const prevBalance = makeBalance({
      year: 2024,
      entitlement: 30,
      carryover: 0,
      adjustments: 0,
      taken: 30,
    })
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(employee),
      },
      vacationBalance: {
        findFirst: vi.fn().mockResolvedValue(prevBalance),
      },
      employeeTariffAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      tariff: {
        findFirst: vi.fn().mockResolvedValue({
          id: TARIFF_ID,
          vacationCappingRuleGroupId: null,
        }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.carryoverFromPreviousYear({
      employeeId: EMPLOYEE_ID,
      year: 2025,
    })
    expect(result).toBeNull()
  })

  it("caps carryover with capping rules", async () => {
    const employee = makeEmployee()
    const prevBalance = makeBalance({
      year: 2024,
      entitlement: 30,
      carryover: 0,
      adjustments: 0,
      taken: 10,
    })
    const cappingGroup = {
      id: "a0000000-0000-4000-a000-000000000d03",
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
    const upsertedBalance = makeBalance({
      year: 2025,
      carryover: 10,
    })
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(employee),
      },
      vacationBalance: {
        findFirst: vi.fn().mockResolvedValue(prevBalance),
        upsert: vi.fn().mockResolvedValue(upsertedBalance),
      },
      employeeTariffAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      tariff: {
        findFirst: vi.fn().mockResolvedValue({
          id: TARIFF_ID,
          vacationCappingRuleGroupId: "a0000000-0000-4000-a000-000000000d03",
        }),
      },
      vacationCappingRuleGroup: {
        findFirst: vi.fn().mockResolvedValue(cappingGroup),
      },
      employeeCappingException: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.carryoverFromPreviousYear({
      employeeId: EMPLOYEE_ID,
      year: 2025,
    })
    expect(result).not.toBeNull()
    // Available is 20 (30 - 10), capped to 10
    expect(result!.carryover).toBe(10)
  })
})
