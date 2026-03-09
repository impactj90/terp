import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "../trpc"
import { vacationBalancesRouter } from "../routers/vacationBalances"
import { permissionIdByKey } from "../lib/permission-catalog"
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
const BALANCE_ID = "a0000000-0000-4000-a000-000000000b00"

const createCaller = createCallerFactory(vacationBalancesRouter)

// --- Helpers ---

function makeBalance(overrides: Record<string, unknown> = {}) {
  return {
    id: BALANCE_ID,
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

// --- vacationBalances.list tests ---

describe("vacationBalances.list", () => {
  it("returns all balances for tenant with paginated shape", async () => {
    const balances = [
      makeBalance({ year: 2025 }),
      makeBalance({ id: "a0000000-0000-4000-a000-000000000b01", year: 2024 }),
    ]
    const mockPrisma = {
      vacationBalance: {
        findMany: vi.fn().mockResolvedValue(balances),
        count: vi.fn().mockResolvedValue(2),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list({})
    expect(result.items).toHaveLength(2)
    expect(result.total).toBe(2)
    expect(result.items[0]!.year).toBe(2025)
    expect(result.items[1]!.year).toBe(2024)
  })

  it("filters by employeeId and year", async () => {
    const balances = [makeBalance()]
    const mockPrisma = {
      vacationBalance: {
        findMany: vi.fn().mockResolvedValue(balances),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list({
      employeeId: EMPLOYEE_ID,
      year: 2025,
    })
    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
    // Verify the where clause
    expect(mockPrisma.vacationBalance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_ID,
          employeeId: EMPLOYEE_ID,
          year: 2025,
        }),
      })
    )
  })

  it("filters by departmentId (via employee relation)", async () => {
    const deptId = "a0000000-0000-4000-a000-000000000e00"
    const mockPrisma = {
      vacationBalance: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ departmentId: deptId })
    expect(mockPrisma.vacationBalance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employee: { departmentId: deptId },
        }),
      })
    )
  })

  it("respects page and pageSize", async () => {
    const mockPrisma = {
      vacationBalance: {
        findMany: vi.fn().mockResolvedValue([makeBalance()]),
        count: vi.fn().mockResolvedValue(10),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list({ page: 2, pageSize: 5 })
    expect(mockPrisma.vacationBalance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 5, // (2-1) * 5
        take: 5,
      })
    )
    expect(result.total).toBe(10)
  })

  it("applies department data scope filter", async () => {
    const deptId = "a0000000-0000-4000-a000-000000000e00"
    const mockPrisma = {
      vacationBalance: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    // Create context with department data scope
    const ctx = createMockContext({
      prisma: mockPrisma as unknown as ReturnType<
        typeof createMockContext
      >["prisma"],
      authToken: "test-token",
      user: createUserWithPermissions([ABSENCES_MANAGE], {
        userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
        dataScopeType: "department",
        dataScopeDepartmentIds: [deptId],
      }),
      session: createMockSession(),
      tenantId: TENANT_ID,
    })
    const caller = createCaller(ctx)
    await caller.list({})
    expect(mockPrisma.vacationBalance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employee: expect.objectContaining({
            departmentId: { in: [deptId] },
          }),
        }),
      })
    )
  })

  it("applies employee data scope filter", async () => {
    const scopedEmployeeId = "a0000000-0000-4000-a000-000000000f00"
    const mockPrisma = {
      vacationBalance: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    // Create context with employee data scope
    const ctx = createMockContext({
      prisma: mockPrisma as unknown as ReturnType<
        typeof createMockContext
      >["prisma"],
      authToken: "test-token",
      user: createUserWithPermissions([ABSENCES_MANAGE], {
        userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
        dataScopeType: "employee",
        dataScopeEmployeeIds: [scopedEmployeeId],
      }),
      session: createMockSession(),
      tenantId: TENANT_ID,
    })
    const caller = createCaller(ctx)
    await caller.list({})
    expect(mockPrisma.vacationBalance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employeeId: { in: [scopedEmployeeId] },
        }),
      })
    )
  })
})

// --- vacationBalances.create tests ---

describe("vacationBalances.create", () => {
  it("creates a new balance", async () => {
    const created = makeBalance()
    const mockPrisma = {
      vacationBalance: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      employeeId: EMPLOYEE_ID,
      year: 2025,
      entitlement: 30,
      carryover: 5,
      adjustments: 2,
    })
    expect(result.employeeId).toBe(EMPLOYEE_ID)
    expect(result.entitlement).toBe(30)
    expect(mockPrisma.vacationBalance.create).toHaveBeenCalledOnce()
  })

  it("throws CONFLICT for duplicate employee+year", async () => {
    const existing = makeBalance()
    const mockPrisma = {
      vacationBalance: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        employeeId: EMPLOYEE_ID,
        year: 2025,
      })
    ).rejects.toThrow(
      "Vacation balance already exists for this employee and year"
    )
  })

  it("returns balance with computed total/available", async () => {
    const created = makeBalance({
      entitlement: 25,
      carryover: 3,
      adjustments: 1,
      taken: 0,
    })
    const mockPrisma = {
      vacationBalance: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      employeeId: EMPLOYEE_ID,
      year: 2025,
      entitlement: 25,
      carryover: 3,
      adjustments: 1,
    })
    expect(result.total).toBe(29) // 25 + 3 + 1
    expect(result.available).toBe(29) // 29 - 0
  })
})

// --- vacationBalances.update tests ---

describe("vacationBalances.update", () => {
  it("partial update of entitlement", async () => {
    const existing = makeBalance()
    const updated = makeBalance({ entitlement: 28 })
    const mockPrisma = {
      vacationBalance: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: BALANCE_ID,
      entitlement: 28,
    })
    expect(result.entitlement).toBe(28)
    expect(mockPrisma.vacationBalance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entitlement: 28 }),
      })
    )
  })

  it("partial update of carryover", async () => {
    const existing = makeBalance()
    const updated = makeBalance({ carryover: 8 })
    const mockPrisma = {
      vacationBalance: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: BALANCE_ID,
      carryover: 8,
    })
    expect(result.carryover).toBe(8)
  })

  it("throws NOT_FOUND for missing balance", async () => {
    const mockPrisma = {
      vacationBalance: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: BALANCE_ID, entitlement: 28 })
    ).rejects.toThrow("Vacation balance not found")
  })
})
