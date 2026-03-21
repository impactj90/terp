/**
 * Tests for MonthlyCalcService
 *
 * Uses vitest mocking to test the service without a real database.
 * Ported from Go:
 * - apps/api/internal/service/monthlycalc_test.go (429 lines)
 * - apps/api/internal/service/monthlyeval_test.go (858 lines)
 */

import { describe, it, expect, vi } from "vitest"
import { MonthlyCalcService } from "../monthly-calc"
import { Decimal } from "@prisma/client/runtime/client"
import type { PrismaClient } from "@/generated/prisma/client"
import {
  ERR_FUTURE_MONTH,
  ERR_MONTH_CLOSED,
  ERR_MONTH_NOT_CLOSED,
  ERR_INVALID_MONTH,
  ERR_INVALID_YEAR_MONTH,
  ERR_MONTHLY_VALUE_NOT_FOUND,
  ERR_EMPLOYEE_NOT_FOUND,
} from "../monthly-calc.types"

// --- Mock Prisma Client ---

function createMockPrisma() {
  const mocks = {
    monthlyValue: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    dailyValue: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    absenceDay: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    employee: {
      findUnique: vi.fn().mockResolvedValue(null),
      // findFirst delegates to findUnique so existing test setups work
      get findFirst() { return this.findUnique },
    },
    tariff: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  }
  return { prisma: mocks as unknown as PrismaClient, mocks }
}

// --- Test Data Factories ---

const TENANT_ID = "t-1"
const EMPLOYEE_ID = "e-1"
const TARIFF_ID = "tariff-1"
const CLOSER_ID = "closer-1"

function makeEmployee(overrides: Record<string, unknown> = {}) {
  return {
    id: EMPLOYEE_ID,
    tenantId: TENANT_ID,
    tariffId: TARIFF_ID,
    ...overrides,
  }
}

function makeMonthlyValue(
  year: number,
  month: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "mv-1",
    tenantId: TENANT_ID,
    employeeId: EMPLOYEE_ID,
    year,
    month,
    totalGrossTime: 0,
    totalNetTime: 0,
    totalTargetTime: 0,
    totalOvertime: 0,
    totalUndertime: 0,
    totalBreakTime: 0,
    flextimeStart: 0,
    flextimeChange: 0,
    flextimeEnd: 0,
    flextimeCarryover: 0,
    vacationTaken: new Decimal(0),
    sickDays: 0,
    otherAbsenceDays: 0,
    workDays: 0,
    daysWithErrors: 0,
    isClosed: false,
    closedAt: null,
    closedBy: null,
    reopenedAt: null,
    reopenedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeDailyValue(dateStr: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `dv-${dateStr}`,
    tenantId: TENANT_ID,
    employeeId: EMPLOYEE_ID,
    valueDate: new Date(`${dateStr}T00:00:00Z`),
    grossTime: 510,
    netTime: 480,
    targetTime: 480,
    overtime: 0,
    undertime: 0,
    breakTime: 30,
    hasError: false,
    ...overrides,
  }
}

function makeTariff(overrides: Record<string, unknown> = {}) {
  return {
    id: TARIFF_ID,
    tenantId: TENANT_ID,
    creditType: "no_evaluation",
    flextimeThreshold: null,
    maxFlextimePerMonth: null,
    upperLimitAnnual: null,
    lowerLimitAnnual: null,
    ...overrides,
  }
}

// --- CalculateMonth Tests ---

describe("CalculateMonth", () => {
  it("Success - calculates and returns persisted value", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    const year = 2025
    const month = 1

    mocks.employee.findUnique.mockResolvedValue(makeEmployee())
    // First call: check if closed (not found)
    // Second call: retrieve persisted value
    const mv = makeMonthlyValue(year, month, {
      totalNetTime: 9600,
      flextimeEnd: 120,
    })
    mocks.monthlyValue.findUnique
      .mockResolvedValueOnce(null) // recalculateMonth: check if closed
      .mockResolvedValueOnce(null) // recalculateMonth: getPreviousMonth
      .mockResolvedValueOnce(mv) // calculateMonth: retrieve persisted
    const result = await svc.calculateMonth(EMPLOYEE_ID, year, month)

    expect(result.totalNetTime).toBe(9600)
    expect(result.flextimeEnd).toBe(120)
  })

  it("FutureMonth - throws ERR_FUTURE_MONTH", async () => {
    const { prisma } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    const futureYear = new Date().getFullYear() + 1

    await expect(
      svc.calculateMonth(EMPLOYEE_ID, futureYear, 1),
    ).rejects.toThrow(ERR_FUTURE_MONTH)
  })

  it("MonthClosed - throws ERR_MONTH_CLOSED", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    mocks.employee.findUnique.mockResolvedValue(makeEmployee())
    mocks.monthlyValue.findUnique.mockResolvedValue(
      makeMonthlyValue(2025, 1, { isClosed: true }),
    )

    await expect(svc.calculateMonth(EMPLOYEE_ID, 2025, 1)).rejects.toThrow(
      ERR_MONTH_CLOSED,
    )
  })

  it("CurrentMonth - current month succeeds", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    mocks.employee.findUnique.mockResolvedValue(makeEmployee())
    const mv = makeMonthlyValue(year, month)
    mocks.monthlyValue.findUnique
      .mockResolvedValueOnce(null) // check if closed
      .mockResolvedValueOnce(null) // getPreviousMonth
      .mockResolvedValueOnce(mv) // retrieve persisted
    const result = await svc.calculateMonth(EMPLOYEE_ID, year, month)

    expect(result.year).toBe(year)
    expect(result.month).toBe(month)
  })
})

// --- CalculateMonthBatch Tests ---

describe("CalculateMonthBatch", () => {
  it("Success - all employees succeed", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    const emp1 = "e-1"
    const emp2 = "e-2"
    const emp3 = "e-3"
    const year = 2025
    const month = 1

    mocks.employee.findUnique.mockResolvedValue(makeEmployee())
    mocks.monthlyValue.findUnique.mockResolvedValue(null) // not closed, no previous

    const result = await svc.calculateMonthBatch(
      [emp1, emp2, emp3],
      year,
      month,
    )

    expect(result.processedMonths).toBe(3)
    expect(result.failedMonths).toBe(0)
    expect(result.skippedMonths).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it("WithFailures - one employee fails", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    const emp1 = "e-1"
    const emp2 = "e-2"
    const emp3 = "e-3"
    const year = 2025
    const month = 1

    mocks.employee.findUnique.mockImplementation(
      async (args: { where: { id: string } }) => {
        if (args.where.id === emp2) return null // Not found
        return makeEmployee({ id: args.where.id })
      },
    )
    mocks.monthlyValue.findUnique.mockResolvedValue(null)

    const result = await svc.calculateMonthBatch(
      [emp1, emp2, emp3],
      year,
      month,
    )

    expect(result.processedMonths).toBe(2)
    expect(result.failedMonths).toBe(1)
    expect(result.skippedMonths).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]!.employeeId).toBe(emp2)
  })

  it("WithClosedMonths - closed month is skipped", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    const emp1 = "e-1"
    const emp2 = "e-2"
    const year = 2025
    const month = 1

    mocks.employee.findUnique.mockResolvedValue(makeEmployee())
    // emp1 not closed, emp2 closed
    mocks.monthlyValue.findUnique.mockImplementation(
      async (args: { where: { employeeId_year_month?: { employeeId: string } } }) => {
        const empId = args.where.employeeId_year_month?.employeeId
        if (empId === emp2) {
          return makeMonthlyValue(year, month, {
            employeeId: emp2,
            isClosed: true,
          })
        }
        return null
      },
    )
    // updateMany default returns { count: 0 }, create mock already set

    const result = await svc.calculateMonthBatch([emp1, emp2], year, month)

    expect(result.processedMonths).toBe(1)
    expect(result.failedMonths).toBe(0)
    expect(result.skippedMonths).toBe(1)
    expect(result.errors).toHaveLength(0)
  })

  it("FutureMonth - all employees fail", async () => {
    const { prisma } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    const emp1 = "e-1"
    const emp2 = "e-2"
    const futureYear = new Date().getFullYear() + 1

    const result = await svc.calculateMonthBatch([emp1, emp2], futureYear, 1)

    expect(result.processedMonths).toBe(0)
    expect(result.failedMonths).toBe(2)
    expect(result.errors).toHaveLength(2)
  })
})

// --- RecalculateFromMonth Tests ---

describe("RecalculateFromMonth", () => {
  it("Success - cascading from past to current month", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    const now = new Date()
    const startYear = 2025
    const startMonth = 11

    mocks.employee.findUnique.mockResolvedValue(makeEmployee())
    mocks.monthlyValue.findUnique.mockResolvedValue(null)
    // updateMany default returns { count: 0 }, create mock already set

    const result = await svc.recalculateFromMonth(
      EMPLOYEE_ID,
      startYear,
      startMonth,
    )

    // Count expected months
    let expectedMonths = 0
    let y = startYear
    let m = startMonth
    while (
      y < now.getFullYear() ||
      (y === now.getFullYear() && m <= now.getMonth() + 1)
    ) {
      expectedMonths++
      m++
      if (m > 12) {
        m = 1
        y++
      }
    }

    expect(result.processedMonths).toBe(expectedMonths)
    expect(result.failedMonths).toBe(0)
    expect(result.skippedMonths).toBe(0)
  })

  it("SkipsClosedMonths - continues cascade past closed months", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    mocks.employee.findUnique.mockResolvedValue(makeEmployee())
    // Nov 2025 is closed, all others open
    mocks.monthlyValue.findUnique.mockImplementation(
      async (args: { where: { employeeId_year_month?: { year: number; month: number } } }) => {
        const ym = args.where.employeeId_year_month
        if (ym && ym.year === 2025 && ym.month === 11) {
          return makeMonthlyValue(2025, 11, { isClosed: true })
        }
        return null
      },
    )
    // updateMany default returns { count: 0 }, create mock already set

    const result = await svc.recalculateFromMonth(EMPLOYEE_ID, 2025, 10)

    expect(result.skippedMonths).toBe(1) // November skipped
    expect(result.processedMonths).toBeGreaterThanOrEqual(2) // At least Oct and Dec
    expect(result.failedMonths).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it("ContinuesOnError - processes remaining months after error", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    // Oct 2025 employee not found, all others succeed
    let callCount = 0
    mocks.employee.findUnique.mockImplementation(async () => {
      callCount++
      if (callCount === 1) return null // First month: employee not found
      return makeEmployee()
    })
    mocks.monthlyValue.findUnique.mockResolvedValue(null)
    // updateMany default returns { count: 0 }, create mock already set

    const result = await svc.recalculateFromMonth(EMPLOYEE_ID, 2025, 10)

    expect(result.failedMonths).toBe(1) // October failed
    expect(result.processedMonths).toBeGreaterThanOrEqual(2) // Nov and Dec succeeded
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]!.year).toBe(2025)
    expect(result.errors[0]!.month).toBe(10)
  })

  it("YearBoundary - December to January transition", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    mocks.employee.findUnique.mockResolvedValue(makeEmployee())
    mocks.monthlyValue.findUnique.mockResolvedValue(null)
    // updateMany default returns { count: 0 }, create mock already set

    const result = await svc.recalculateFromMonth(EMPLOYEE_ID, 2025, 12)

    expect(result.processedMonths).toBeGreaterThanOrEqual(2) // At least Dec 2025 and Jan 2026
    expect(result.failedMonths).toBe(0)
  })

  it("CurrentMonth - single month when start = current", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    mocks.employee.findUnique.mockResolvedValue(makeEmployee())
    mocks.monthlyValue.findUnique.mockResolvedValue(null)
    // updateMany default returns { count: 0 }, create mock already set

    const result = await svc.recalculateFromMonth(EMPLOYEE_ID, year, month)

    expect(result.processedMonths).toBe(1)
    expect(result.failedMonths).toBe(0)
  })

  it("FutureMonth - processes nothing", async () => {
    const { prisma } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    const futureYear = new Date().getFullYear() + 1

    const result = await svc.recalculateFromMonth(EMPLOYEE_ID, futureYear, 1)

    expect(result.processedMonths).toBe(0)
    expect(result.failedMonths).toBe(0)
    expect(result.errors).toHaveLength(0)
  })
})

// --- RecalculateFromMonthBatch Tests ---

describe("RecalculateFromMonthBatch", () => {
  it("Success - 2 employees", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    mocks.employee.findUnique.mockResolvedValue(makeEmployee())
    mocks.monthlyValue.findUnique.mockResolvedValue(null)
    // updateMany default returns { count: 0 }, create mock already set

    const result = await svc.recalculateFromMonthBatch(
      ["e-1", "e-2"],
      year,
      month,
    )

    expect(result.processedMonths).toBe(2)
    expect(result.failedMonths).toBe(0)
  })

  it("MixedResults - 1 processed, 1 closed", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    mocks.employee.findUnique.mockResolvedValue(makeEmployee())
    // e-2 is closed
    mocks.monthlyValue.findUnique.mockImplementation(
      async (args: { where: { employeeId_year_month?: { employeeId: string } } }) => {
        const empId = args.where.employeeId_year_month?.employeeId
        if (empId === "e-2") {
          return makeMonthlyValue(year, month, {
            employeeId: "e-2",
            isClosed: true,
          })
        }
        return null
      },
    )
    // updateMany default returns { count: 0 }, create mock already set

    const result = await svc.recalculateFromMonthBatch(
      ["e-1", "e-2"],
      year,
      month,
    )

    expect(result.processedMonths).toBe(1)
    expect(result.skippedMonths).toBe(1)
    expect(result.failedMonths).toBe(0)
  })
})

// --- GetMonthSummary Tests ---

describe("GetMonthSummary", () => {
  it("Success - persisted monthly value found", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    const mv = makeMonthlyValue(2026, 1, {
      totalNetTime: 9600,
      totalTargetTime: 9600,
      flextimeEnd: 120,
    })
    mocks.monthlyValue.findUnique.mockResolvedValue(mv)

    const result = await svc.getMonthSummary(EMPLOYEE_ID, 2026, 1)

    expect(result.employeeId).toBe(EMPLOYEE_ID)
    expect(result.totalNetTime).toBe(9600)
    expect(result.flextimeEnd).toBe(120)
  })

  it("NotFound_CalculatesOnTheFly - calculates from daily values", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    // No persisted monthly value
    mocks.monthlyValue.findUnique.mockResolvedValue(null)

    // Employee exists (no tariff)
    mocks.employee.findUnique.mockResolvedValue(
      makeEmployee({ tariffId: null }),
    )

    // One work day
    mocks.dailyValue.findMany.mockResolvedValue([
      makeDailyValue("2026-01-06"),
    ])

    const result = await svc.getMonthSummary(EMPLOYEE_ID, 2026, 1)

    expect(result.employeeId).toBe(EMPLOYEE_ID)
    expect(result.totalNetTime).toBe(480)
    expect(result.workDays).toBe(1)
    expect(result.isClosed).toBe(false)
  })

  it("InvalidYear - throws ERR_INVALID_YEAR_MONTH", async () => {
    const { prisma } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    await expect(svc.getMonthSummary(EMPLOYEE_ID, 1800, 1)).rejects.toThrow(
      ERR_INVALID_YEAR_MONTH,
    )
    await expect(svc.getMonthSummary(EMPLOYEE_ID, 2500, 1)).rejects.toThrow(
      ERR_INVALID_YEAR_MONTH,
    )
  })

  it("InvalidMonth - throws ERR_INVALID_MONTH", async () => {
    const { prisma } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    await expect(svc.getMonthSummary(EMPLOYEE_ID, 2026, 0)).rejects.toThrow(
      ERR_INVALID_MONTH,
    )
    await expect(svc.getMonthSummary(EMPLOYEE_ID, 2026, 13)).rejects.toThrow(
      ERR_INVALID_MONTH,
    )
  })
})

// --- RecalculateMonth Tests ---

describe("RecalculateMonth", () => {
  it("Success - 5 work days with overtime/undertime", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    mocks.employee.findUnique.mockResolvedValue(makeEmployee({ tariffId: null }))
    mocks.monthlyValue.findUnique.mockResolvedValue(null)

    const dailyValues = [
      makeDailyValue("2026-01-06"),
      makeDailyValue("2026-01-07"),
      makeDailyValue("2026-01-08"),
      makeDailyValue("2026-01-09"),
      makeDailyValue("2026-01-10"),
    ]
    mocks.dailyValue.findMany.mockResolvedValue(dailyValues)
    // updateMany default returns { count: 0 }, create mock already set

    await svc.recalculateMonth(EMPLOYEE_ID, 2026, 1)

    // New flow: updateMany returns 0 → create is called
    expect(mocks.monthlyValue.create).toHaveBeenCalledTimes(1)
    const createArg = mocks.monthlyValue.create.mock.calls[0]![0] as {
      data: Record<string, unknown>
    }
    expect(createArg.data.totalNetTime).toBe(2400) // 5 * 480
    expect(createArg.data.totalTargetTime).toBe(2400)
    expect(createArg.data.workDays).toBe(5)
  })

  it("MonthClosed - throws ERR_MONTH_CLOSED", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    mocks.employee.findUnique.mockResolvedValue(makeEmployee())
    mocks.monthlyValue.findUnique.mockResolvedValue(
      makeMonthlyValue(2026, 1, { isClosed: true }),
    )

    await expect(svc.recalculateMonth(EMPLOYEE_ID, 2026, 1)).rejects.toThrow(
      ERR_MONTH_CLOSED,
    )
  })

  it("WithPreviousCarryover - flextime chain from previous month", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    mocks.employee.findUnique.mockResolvedValue(makeEmployee({ tariffId: null }))
    // New flow: getPreviousMonth is called first, then getByEmployeeMonth after updateMany=0
    mocks.monthlyValue.findUnique
      .mockResolvedValueOnce(makeMonthlyValue(2026, 1, { flextimeEnd: 60 })) // getPreviousMonth: Jan carryover
      .mockResolvedValueOnce(null) // getByEmployeeMonth: Feb not found → create

    const dailyValues = [
      makeDailyValue("2026-02-02", { overtime: 30 }),
    ]
    mocks.dailyValue.findMany.mockResolvedValue(dailyValues)

    await svc.recalculateMonth(EMPLOYEE_ID, 2026, 2)

    // New flow: updateMany returns 0 → create is called
    const createArg = mocks.monthlyValue.create.mock.calls[0]![0] as {
      data: Record<string, unknown>
    }
    expect(createArg.data.flextimeStart).toBe(60) // Previous month's end
    expect(createArg.data.flextimeChange).toBe(30) // 30 min overtime
    expect(createArg.data.flextimeEnd).toBe(90) // 60 + 30
  })

  it("EmployeeNotFound - throws ERR_EMPLOYEE_NOT_FOUND", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    mocks.employee.findUnique.mockResolvedValue(null)

    await expect(svc.recalculateMonth(EMPLOYEE_ID, 2026, 1)).rejects.toThrow(
      ERR_EMPLOYEE_NOT_FOUND,
    )
  })

  it("InvalidMonth - throws ERR_INVALID_MONTH", async () => {
    const { prisma } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    await expect(svc.recalculateMonth(EMPLOYEE_ID, 2026, 0)).rejects.toThrow(
      ERR_INVALID_MONTH,
    )
    await expect(svc.recalculateMonth(EMPLOYEE_ID, 2026, 13)).rejects.toThrow(
      ERR_INVALID_MONTH,
    )
  })
})

// --- CloseMonth Tests ---

describe("CloseMonth", () => {
  it("Success - close an open month", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    mocks.monthlyValue.updateMany.mockResolvedValue({ count: 1 })

    await svc.closeMonth(EMPLOYEE_ID, 2026, 1, CLOSER_ID)

    expect(mocks.monthlyValue.updateMany).toHaveBeenCalledTimes(1)
    const updateArg = mocks.monthlyValue.updateMany.mock.calls[0]![0] as {
      data: Record<string, unknown>
    }
    expect(updateArg.data.isClosed).toBe(true)
    expect(updateArg.data.closedBy).toBe(CLOSER_ID)
  })

  it("AlreadyClosed - throws ERR_MONTH_CLOSED", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    // updateMany returns 0 (no rows matched isClosed: false)
    mocks.monthlyValue.updateMany.mockResolvedValue({ count: 0 })
    // fallback findUnique returns the closed record
    mocks.monthlyValue.findUnique.mockResolvedValue(
      makeMonthlyValue(2026, 1, { isClosed: true }),
    )

    await expect(
      svc.closeMonth(EMPLOYEE_ID, 2026, 1, CLOSER_ID),
    ).rejects.toThrow(ERR_MONTH_CLOSED)
  })

  it("NotFound - throws ERR_MONTHLY_VALUE_NOT_FOUND", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    // updateMany returns 0, fallback findUnique returns null
    mocks.monthlyValue.updateMany.mockResolvedValue({ count: 0 })
    mocks.monthlyValue.findUnique.mockResolvedValue(null)

    await expect(
      svc.closeMonth(EMPLOYEE_ID, 2026, 1, CLOSER_ID),
    ).rejects.toThrow(ERR_MONTHLY_VALUE_NOT_FOUND)
  })

  it("InvalidMonth - throws ERR_INVALID_MONTH", async () => {
    const { prisma } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    await expect(
      svc.closeMonth(EMPLOYEE_ID, 2026, 13, CLOSER_ID),
    ).rejects.toThrow(ERR_INVALID_MONTH)
  })
})

// --- ReopenMonth Tests ---

describe("ReopenMonth", () => {
  it("Success - reopen a closed month", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    mocks.monthlyValue.updateMany.mockResolvedValue({ count: 1 })

    await svc.reopenMonth(EMPLOYEE_ID, 2026, 1, CLOSER_ID)

    expect(mocks.monthlyValue.updateMany).toHaveBeenCalledTimes(1)
    const updateArg = mocks.monthlyValue.updateMany.mock.calls[0]![0] as {
      data: Record<string, unknown>
    }
    expect(updateArg.data.isClosed).toBe(false)
    expect(updateArg.data.reopenedBy).toBe(CLOSER_ID)
  })

  it("NotClosed - throws ERR_MONTH_NOT_CLOSED", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    // updateMany returns 0 (no rows matched isClosed: true)
    mocks.monthlyValue.updateMany.mockResolvedValue({ count: 0 })
    // fallback findUnique returns the open record
    mocks.monthlyValue.findUnique.mockResolvedValue(
      makeMonthlyValue(2026, 1, { isClosed: false }),
    )

    await expect(
      svc.reopenMonth(EMPLOYEE_ID, 2026, 1, CLOSER_ID),
    ).rejects.toThrow(ERR_MONTH_NOT_CLOSED)
  })

  it("NotFound - throws ERR_MONTHLY_VALUE_NOT_FOUND", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    // updateMany returns 0, fallback findUnique returns null
    mocks.monthlyValue.updateMany.mockResolvedValue({ count: 0 })
    mocks.monthlyValue.findUnique.mockResolvedValue(null)

    await expect(
      svc.reopenMonth(EMPLOYEE_ID, 2026, 1, CLOSER_ID),
    ).rejects.toThrow(ERR_MONTHLY_VALUE_NOT_FOUND)
  })
})

// --- GetYearOverview Tests ---

describe("GetYearOverview", () => {
  it("Success - 2 months returned", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    mocks.monthlyValue.findMany.mockResolvedValue([
      makeMonthlyValue(2026, 1, {
        totalNetTime: 9600,
        flextimeEnd: 60,
      }),
      makeMonthlyValue(2026, 2, {
        totalNetTime: 9120,
        flextimeEnd: 30,
      }),
    ])

    const result = await svc.getYearOverview(EMPLOYEE_ID, 2026)

    expect(result).toHaveLength(2)
    expect(result[0]!.month).toBe(1)
    expect(result[0]!.flextimeEnd).toBe(60)
    expect(result[1]!.month).toBe(2)
    expect(result[1]!.flextimeEnd).toBe(30)
  })

  it("Empty - no months returns empty array", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    mocks.monthlyValue.findMany.mockResolvedValue([])

    const result = await svc.getYearOverview(EMPLOYEE_ID, 2026)

    expect(result).toHaveLength(0)
  })

  it("InvalidYear - throws ERR_INVALID_YEAR_MONTH", async () => {
    const { prisma } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    await expect(svc.getYearOverview(EMPLOYEE_ID, 1800)).rejects.toThrow(
      ERR_INVALID_YEAR_MONTH,
    )
  })
})

// --- Helper Function Tests ---

describe("validateYearMonth", () => {
  it("valid year/month succeeds", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    mocks.monthlyValue.findUnique.mockResolvedValue(null)
    mocks.employee.findUnique.mockResolvedValue(
      makeEmployee({ tariffId: null }),
    )

    // Should not throw for valid year/month
    const result = await svc.getMonthSummary(EMPLOYEE_ID, 2026, 6)
    expect(result).toBeDefined()
  })

  it("year too low throws ERR_INVALID_YEAR_MONTH", async () => {
    const { prisma } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    await expect(svc.getMonthSummary(EMPLOYEE_ID, 1800, 6)).rejects.toThrow(
      ERR_INVALID_YEAR_MONTH,
    )
  })

  it("year too high throws ERR_INVALID_YEAR_MONTH", async () => {
    const { prisma } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    await expect(svc.getMonthSummary(EMPLOYEE_ID, 2500, 6)).rejects.toThrow(
      ERR_INVALID_YEAR_MONTH,
    )
  })

  it("month 0 throws ERR_INVALID_MONTH", async () => {
    const { prisma } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    await expect(svc.getMonthSummary(EMPLOYEE_ID, 2026, 0)).rejects.toThrow(
      ERR_INVALID_MONTH,
    )
  })

  it("month 13 throws ERR_INVALID_MONTH", async () => {
    const { prisma } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    await expect(svc.getMonthSummary(EMPLOYEE_ID, 2026, 13)).rejects.toThrow(
      ERR_INVALID_MONTH,
    )
  })

  it("edge case min year 1900 succeeds", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    mocks.monthlyValue.findUnique.mockResolvedValue(null)
    mocks.employee.findUnique.mockResolvedValue(
      makeEmployee({ tariffId: null }),
    )

    const result = await svc.getMonthSummary(EMPLOYEE_ID, 1900, 1)
    expect(result).toBeDefined()
  })

  it("edge case max year 2200 succeeds", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    mocks.monthlyValue.findUnique.mockResolvedValue(null)
    mocks.employee.findUnique.mockResolvedValue(
      makeEmployee({ tariffId: null }),
    )

    const result = await svc.getMonthSummary(EMPLOYEE_ID, 2200, 12)
    expect(result).toBeDefined()
  })
})

describe("monthDateRange", () => {
  // We test through getDailyBreakdown which calls monthDateRange internally
  it("January - 31 days", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    mocks.dailyValue.findMany.mockResolvedValue([])

    await svc.getDailyBreakdown(EMPLOYEE_ID, 2026, 1)

    const findManyArg = mocks.dailyValue.findMany.mock.calls[0]![0] as {
      where: { valueDate: { gte: Date; lte: Date } }
    }
    expect(findManyArg.where.valueDate.gte).toEqual(
      new Date(Date.UTC(2026, 0, 1)),
    )
    expect(findManyArg.where.valueDate.lte).toEqual(
      new Date(Date.UTC(2026, 1, 0)),
    ) // Jan 31
  })

  it("February non-leap - 28 days", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    mocks.dailyValue.findMany.mockResolvedValue([])

    await svc.getDailyBreakdown(EMPLOYEE_ID, 2026, 2)

    const findManyArg = mocks.dailyValue.findMany.mock.calls[0]![0] as {
      where: { valueDate: { gte: Date; lte: Date } }
    }
    expect(findManyArg.where.valueDate.gte).toEqual(
      new Date(Date.UTC(2026, 1, 1)),
    )
    expect(findManyArg.where.valueDate.lte).toEqual(
      new Date(Date.UTC(2026, 2, 0)),
    ) // Feb 28
  })

  it("February leap year - 29 days", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    mocks.dailyValue.findMany.mockResolvedValue([])

    await svc.getDailyBreakdown(EMPLOYEE_ID, 2024, 2)

    const findManyArg = mocks.dailyValue.findMany.mock.calls[0]![0] as {
      where: { valueDate: { gte: Date; lte: Date } }
    }
    expect(findManyArg.where.valueDate.gte).toEqual(
      new Date(Date.UTC(2024, 1, 1)),
    )
    expect(findManyArg.where.valueDate.lte).toEqual(
      new Date(Date.UTC(2024, 2, 0)),
    ) // Feb 29
  })

  it("December - 31 days", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    mocks.dailyValue.findMany.mockResolvedValue([])

    await svc.getDailyBreakdown(EMPLOYEE_ID, 2026, 12)

    const findManyArg = mocks.dailyValue.findMany.mock.calls[0]![0] as {
      where: { valueDate: { gte: Date; lte: Date } }
    }
    expect(findManyArg.where.valueDate.gte).toEqual(
      new Date(Date.UTC(2026, 11, 1)),
    )
    expect(findManyArg.where.valueDate.lte).toEqual(
      new Date(Date.UTC(2027, 0, 0)),
    ) // Dec 31
  })
})

// --- buildAbsenceSummary Tests ---

describe("buildAbsenceSummary", () => {
  it("counts vacation full + half day with Decimal addition", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    mocks.employee.findUnique.mockResolvedValue(
      makeEmployee({ tariffId: null }),
    )
    mocks.monthlyValue.findUnique.mockResolvedValue(null)

    const absences = [
      {
        id: "a-1",
        tenantId: TENANT_ID,
        employeeId: EMPLOYEE_ID,
        absenceDate: new Date("2026-01-06"),
        absenceTypeId: "at-1",
        duration: new Decimal(1),
        halfDayPeriod: null,
        status: "approved",
        approvedBy: null,
        approvedAt: null,
        rejectionReason: null,
        notes: null,
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        absenceType: { id: "at-1", tenantId: TENANT_ID, category: "vacation", name: "Vacation", code: "V", description: null, isActive: true, isSickLeave: false, affectsVacation: true, requiresApproval: true, maxDaysPerYear: null, color: null, icon: null, sortOrder: 0, createdAt: new Date(), updatedAt: new Date(), portion: null, priority: null },
      },
      {
        id: "a-2",
        tenantId: TENANT_ID,
        employeeId: EMPLOYEE_ID,
        absenceDate: new Date("2026-01-07"),
        absenceTypeId: "at-1",
        duration: new Decimal("0.5"),
        halfDayPeriod: "morning",
        status: "approved",
        approvedBy: null,
        approvedAt: null,
        rejectionReason: null,
        notes: null,
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        absenceType: { id: "at-1", tenantId: TENANT_ID, category: "vacation", name: "Vacation", code: "V", description: null, isActive: true, isSickLeave: false, affectsVacation: true, requiresApproval: true, maxDaysPerYear: null, color: null, icon: null, sortOrder: 0, createdAt: new Date(), updatedAt: new Date(), portion: null, priority: null },
      },
    ]
    mocks.absenceDay.findMany.mockResolvedValue(absences)

    const result = await svc.getMonthSummary(EMPLOYEE_ID, 2026, 1)

    expect(result.vacationTaken.equals(new Decimal("1.5"))).toBe(true)
  })

  it("illness rounds up half day to 1", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    mocks.employee.findUnique.mockResolvedValue(
      makeEmployee({ tariffId: null }),
    )
    mocks.monthlyValue.findUnique.mockResolvedValue(null)

    const absences = [
      {
        id: "a-1",
        tenantId: TENANT_ID,
        employeeId: EMPLOYEE_ID,
        absenceDate: new Date("2026-01-06"),
        absenceTypeId: "at-2",
        duration: new Decimal(1),
        halfDayPeriod: null,
        status: "approved",
        approvedBy: null,
        approvedAt: null,
        rejectionReason: null,
        notes: null,
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        absenceType: { id: "at-2", tenantId: TENANT_ID, category: "illness", name: "Sick", code: "S", description: null, isActive: true, isSickLeave: true, affectsVacation: false, requiresApproval: false, maxDaysPerYear: null, color: null, icon: null, sortOrder: 0, createdAt: new Date(), updatedAt: new Date(), portion: null, priority: null },
      },
      {
        id: "a-2",
        tenantId: TENANT_ID,
        employeeId: EMPLOYEE_ID,
        absenceDate: new Date("2026-01-07"),
        absenceTypeId: "at-2",
        duration: new Decimal("0.5"),
        halfDayPeriod: "morning",
        status: "approved",
        approvedBy: null,
        approvedAt: null,
        rejectionReason: null,
        notes: null,
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        absenceType: { id: "at-2", tenantId: TENANT_ID, category: "illness", name: "Sick", code: "S", description: null, isActive: true, isSickLeave: true, affectsVacation: false, requiresApproval: false, maxDaysPerYear: null, color: null, icon: null, sortOrder: 0, createdAt: new Date(), updatedAt: new Date(), portion: null, priority: null },
      },
    ]
    mocks.absenceDay.findMany.mockResolvedValue(absences)

    const result = await svc.getMonthSummary(EMPLOYEE_ID, 2026, 1)

    // 1 full day + 0.5 day (ceil to 1) = 2 sick days
    expect(result.sickDays).toBe(2)
  })

  it("special/other category counted as 1 each", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    mocks.employee.findUnique.mockResolvedValue(
      makeEmployee({ tariffId: null }),
    )
    mocks.monthlyValue.findUnique.mockResolvedValue(null)

    const absences = [
      {
        id: "a-1",
        tenantId: TENANT_ID,
        employeeId: EMPLOYEE_ID,
        absenceDate: new Date("2026-01-06"),
        absenceTypeId: "at-3",
        duration: new Decimal(1),
        halfDayPeriod: null,
        status: "approved",
        approvedBy: null,
        approvedAt: null,
        rejectionReason: null,
        notes: null,
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        absenceType: { id: "at-3", tenantId: TENANT_ID, category: "special", name: "Special", code: "SP", description: null, isActive: true, isSickLeave: false, affectsVacation: false, requiresApproval: true, maxDaysPerYear: null, color: null, icon: null, sortOrder: 0, createdAt: new Date(), updatedAt: new Date(), portion: null, priority: null },
      },
    ]
    mocks.absenceDay.findMany.mockResolvedValue(absences)

    const result = await svc.getMonthSummary(EMPLOYEE_ID, 2026, 1)

    expect(result.otherAbsenceDays).toBe(1)
  })

  it("pending status excluded", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    mocks.employee.findUnique.mockResolvedValue(
      makeEmployee({ tariffId: null }),
    )
    mocks.monthlyValue.findUnique.mockResolvedValue(null)

    const absences = [
      {
        id: "a-1",
        tenantId: TENANT_ID,
        employeeId: EMPLOYEE_ID,
        absenceDate: new Date("2026-01-06"),
        absenceTypeId: "at-1",
        duration: new Decimal(1),
        halfDayPeriod: null,
        status: "pending", // NOT approved
        approvedBy: null,
        approvedAt: null,
        rejectionReason: null,
        notes: null,
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        absenceType: { id: "at-1", tenantId: TENANT_ID, category: "vacation", name: "Vacation", code: "V", description: null, isActive: true, isSickLeave: false, affectsVacation: true, requiresApproval: true, maxDaysPerYear: null, color: null, icon: null, sortOrder: 0, createdAt: new Date(), updatedAt: new Date(), portion: null, priority: null },
      },
    ]
    mocks.absenceDay.findMany.mockResolvedValue(absences)

    const result = await svc.getMonthSummary(EMPLOYEE_ID, 2026, 1)

    expect(result.vacationTaken.equals(new Decimal(0))).toBe(true)
  })

  it("null absenceType excluded", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    mocks.employee.findUnique.mockResolvedValue(
      makeEmployee({ tariffId: null }),
    )
    mocks.monthlyValue.findUnique.mockResolvedValue(null)

    const absences = [
      {
        id: "a-1",
        tenantId: TENANT_ID,
        employeeId: EMPLOYEE_ID,
        absenceDate: new Date("2026-01-06"),
        absenceTypeId: "at-1",
        duration: new Decimal(1),
        halfDayPeriod: null,
        status: "approved",
        approvedBy: null,
        approvedAt: null,
        rejectionReason: null,
        notes: null,
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        absenceType: null, // null type
      },
    ]
    mocks.absenceDay.findMany.mockResolvedValue(absences)

    const result = await svc.getMonthSummary(EMPLOYEE_ID, 2026, 1)

    expect(result.vacationTaken.equals(new Decimal(0))).toBe(true)
    expect(result.sickDays).toBe(0)
    expect(result.otherAbsenceDays).toBe(0)
  })
})

// --- Tariff Evaluation Rules Tests ---

describe("Tariff Evaluation Rules", () => {
  it("CompleteCarryoverCapped - all tariff fields applied", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    const tariff = makeTariff({
      creditType: "complete_carryover",
      maxFlextimePerMonth: 120,
      upperLimitAnnual: 600,
      lowerLimitAnnual: 300,
    })

    mocks.employee.findUnique.mockResolvedValue(makeEmployee())
    mocks.monthlyValue.findUnique.mockResolvedValue(null) // not closed, no previous
    mocks.tariff.findUnique.mockResolvedValue(tariff)

    // 3 hours overtime
    const dailyValues = [
      makeDailyValue("2026-01-06", {
        grossTime: 660,
        netTime: 660,
        targetTime: 480,
        overtime: 180,
        breakTime: 0,
      }),
    ]
    mocks.dailyValue.findMany.mockResolvedValue(dailyValues)
    // updateMany default returns { count: 0 }, create mock already set

    await svc.recalculateMonth(EMPLOYEE_ID, 2026, 1)

    const createArg = mocks.monthlyValue.create.mock.calls[0]![0] as {
      data: Record<string, unknown>
    }
    expect(createArg.data.flextimeStart).toBe(0)
    expect(createArg.data.flextimeChange).toBe(180)
    // Monthly cap 120 applied: credited = 120, forfeited = 60
    expect(createArg.data.flextimeEnd).toBe(120)
    expect(createArg.data.flextimeCarryover).toBe(120)
  })

  it("AfterThreshold - threshold applied", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    const tariff = makeTariff({
      creditType: "after_threshold",
      flextimeThreshold: 60,
    })

    mocks.employee.findUnique.mockResolvedValue(makeEmployee())
    mocks.monthlyValue.findUnique.mockResolvedValue(null)
    mocks.tariff.findUnique.mockResolvedValue(tariff)

    // 90 min overtime, only 30 should be credited (90 - 60 threshold)
    const dailyValues = [
      makeDailyValue("2026-01-06", {
        grossTime: 600,
        netTime: 570,
        targetTime: 480,
        overtime: 90,
        breakTime: 30,
      }),
    ]
    mocks.dailyValue.findMany.mockResolvedValue(dailyValues)
    // updateMany default returns { count: 0 }, create mock already set

    await svc.recalculateMonth(EMPLOYEE_ID, 2026, 1)

    const createArg = mocks.monthlyValue.create.mock.calls[0]![0] as {
      data: Record<string, unknown>
    }
    expect(createArg.data.flextimeEnd).toBe(30) // 90 - 60 threshold
  })

  it("NoCarryover - resets to 0", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    const tariff = makeTariff({ creditType: "no_carryover" })

    mocks.employee.findUnique.mockResolvedValue(makeEmployee())
    // New flow: getPreviousMonth is called first, then getByEmployeeMonth after updateMany=0
    mocks.monthlyValue.findUnique
      .mockResolvedValueOnce(makeMonthlyValue(2025, 12, { flextimeEnd: 60 })) // getPreviousMonth: Dec carryover
      .mockResolvedValueOnce(null) // getByEmployeeMonth: not found → create
    mocks.tariff.findUnique.mockResolvedValue(tariff)

    const dailyValues = [
      makeDailyValue("2026-01-06", { overtime: 30 }),
    ]
    mocks.dailyValue.findMany.mockResolvedValue(dailyValues)
    // updateMany default returns { count: 0 }, create mock already set

    await svc.recalculateMonth(EMPLOYEE_ID, 2026, 1)

    const createArg = mocks.monthlyValue.create.mock.calls[0]![0] as {
      data: Record<string, unknown>
    }
    expect(createArg.data.flextimeStart).toBe(60) // Previous carryover
    expect(createArg.data.flextimeEnd).toBe(0) // Reset to 0
    expect(createArg.data.flextimeCarryover).toBe(0)
  })

  it("TariffNotFound - graceful fallback (direct transfer)", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    mocks.employee.findUnique.mockResolvedValue(makeEmployee())
    mocks.monthlyValue.findUnique.mockResolvedValue(null)
    // Tariff not found
    mocks.tariff.findUnique.mockResolvedValue(null)

    const dailyValues = [
      makeDailyValue("2026-01-06", {
        grossTime: 570,
        netTime: 540,
        targetTime: 480,
        overtime: 60,
        breakTime: 30,
      }),
    ]
    mocks.dailyValue.findMany.mockResolvedValue(dailyValues)
    // updateMany default returns { count: 0 }, create mock already set

    await svc.recalculateMonth(EMPLOYEE_ID, 2026, 1)

    const createArg = mocks.monthlyValue.create.mock.calls[0]![0] as {
      data: Record<string, unknown>
    }
    // Direct transfer: flextime = overtime (60)
    expect(createArg.data.flextimeEnd).toBe(60)
    expect(createArg.data.flextimeChange).toBe(60)
  })
})

// --- buildEvaluationRules Tests ---

describe("buildEvaluationRules", () => {
  it("NoEvaluation returns null rules", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    mocks.employee.findUnique.mockResolvedValue(makeEmployee())
    mocks.monthlyValue.findUnique.mockResolvedValue(null)
    mocks.tariff.findUnique.mockResolvedValue(
      makeTariff({ creditType: "no_evaluation" }),
    )

    const dailyValues = [makeDailyValue("2026-01-06", { overtime: 60 })]
    mocks.dailyValue.findMany.mockResolvedValue(dailyValues)
    // updateMany default returns { count: 0 }, create mock already set

    await svc.recalculateMonth(EMPLOYEE_ID, 2026, 1)

    const createArg = mocks.monthlyValue.create.mock.calls[0]![0] as {
      data: Record<string, unknown>
    }
    // no_evaluation = direct transfer, same as null
    expect(createArg.data.flextimeEnd).toBe(60)
  })

  it("EmptyCreditType defaults to no_evaluation (null rules)", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    mocks.employee.findUnique.mockResolvedValue(makeEmployee())
    mocks.monthlyValue.findUnique.mockResolvedValue(null)
    mocks.tariff.findUnique.mockResolvedValue(
      makeTariff({ creditType: "" }),
    )

    const dailyValues = [makeDailyValue("2026-01-06", { overtime: 60 })]
    mocks.dailyValue.findMany.mockResolvedValue(dailyValues)
    // updateMany default returns { count: 0 }, create mock already set

    await svc.recalculateMonth(EMPLOYEE_ID, 2026, 1)

    const createArg = mocks.monthlyValue.create.mock.calls[0]![0] as {
      data: Record<string, unknown>
    }
    // empty credit type defaults to no_evaluation = direct transfer
    expect(createArg.data.flextimeEnd).toBe(60)
  })
})

// --- Integration Scenario Tests ---

describe("Integration Scenarios", () => {
  it("CloseReopenRecalculate - close -> recalc blocked -> reopen -> recalc allowed", async () => {
    const { prisma, mocks } = createMockPrisma()
    const svc = new MonthlyCalcService(prisma)

    const year = 2026
    const month = 1
    const reopenedBy = "reopener-1"

    mocks.employee.findUnique.mockResolvedValue(
      makeEmployee({ tariffId: null }),
    )

    // Step 1: Month is closed -> recalculate should fail
    // New flow: getPreviousMonth first (returns null), then updateMany returns 0,
    // then getByEmployeeMonth returns closed record → throws
    mocks.monthlyValue.findUnique
      .mockResolvedValueOnce(null) // getPreviousMonth: no previous
      .mockResolvedValueOnce(makeMonthlyValue(year, month, { isClosed: true })) // getByEmployeeMonth: closed

    await expect(
      svc.recalculateMonth(EMPLOYEE_ID, year, month),
    ).rejects.toThrow(ERR_MONTH_CLOSED)

    // Step 2: Reopen the month
    mocks.monthlyValue.updateMany.mockResolvedValueOnce({ count: 1 })

    await svc.reopenMonth(EMPLOYEE_ID, year, month, reopenedBy)
    // updateMany called once for recalculate step 1 (returned 0) + once for reopen (returned 1)
    expect(mocks.monthlyValue.updateMany).toHaveBeenCalledTimes(2)

    // Step 3: Recalculate should now succeed (month is open)
    // New flow: getPreviousMonth first, then updateMany returns 0, then getByEmployeeMonth
    mocks.monthlyValue.findUnique
      .mockResolvedValueOnce(null) // getPreviousMonth: no previous
      .mockResolvedValueOnce(null) // getByEmployeeMonth: not found → create

    await svc.recalculateMonth(EMPLOYEE_ID, year, month)
    expect(mocks.monthlyValue.create).toHaveBeenCalled()
  })
})
