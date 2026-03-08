import { describe, it, expect, vi } from "vitest"
import type { Prisma } from "@/generated/prisma/client"
import {
  resolveVacationBasis,
  buildCalcInput,
  calculateAvailable,
  type ResolvedCalcGroup,
} from "../lib/vacation-helpers"

// --- calculateAvailable tests ---

describe("calculateAvailable", () => {
  it("computes correct available: entitlement + carryover + adjustments - taken", () => {
    const result = calculateAvailable({
      entitlement: 30,
      carryover: 5,
      adjustments: 2,
      taken: 10,
    })
    expect(result).toBe(27) // 30 + 5 + 2 - 10
  })

  it("handles Prisma Decimal values (as objects with toString)", () => {
    // Prisma Decimals have a toString() and can be coerced via Number()
    const mockDecimal = (val: number) => ({
      toString: () => String(val),
      valueOf: () => val,
      [Symbol.toPrimitive]: () => val,
    })

    const result = calculateAvailable({
      entitlement: mockDecimal(25) as unknown as number,
      carryover: mockDecimal(3) as unknown as number,
      adjustments: mockDecimal(1.5) as unknown as number,
      taken: mockDecimal(8) as unknown as number,
    })
    expect(result).toBe(21.5) // 25 + 3 + 1.5 - 8
  })

  it("handles zero values", () => {
    const result = calculateAvailable({
      entitlement: 0,
      carryover: 0,
      adjustments: 0,
      taken: 0,
    })
    expect(result).toBe(0)
  })

  it("handles negative available (when taken > total)", () => {
    const result = calculateAvailable({
      entitlement: 10,
      carryover: 0,
      adjustments: 0,
      taken: 15,
    })
    expect(result).toBe(-5) // 10 + 0 + 0 - 15
  })
})

// --- buildCalcInput tests ---

describe("buildCalcInput", () => {
  const baseEmployee = {
    birthDate: new Date(Date.UTC(1985, 5, 15)),
    entryDate: new Date(Date.UTC(2020, 0, 1)),
    exitDate: null,
    weeklyHours: 40,
    vacationDaysPerYear: 30,
    disabilityFlag: false,
  }

  it("sets reference date to Jan 1 for calendar_year basis", () => {
    const { calcInput } = buildCalcInput(baseEmployee, 2025, null, null, "calendar_year")
    expect(calcInput.referenceDate.getUTCFullYear()).toBe(2025)
    expect(calcInput.referenceDate.getUTCMonth()).toBe(0) // January
    expect(calcInput.referenceDate.getUTCDate()).toBe(1)
  })

  it("sets reference date to entry anniversary for entry_date basis", () => {
    const employee = {
      ...baseEmployee,
      entryDate: new Date(Date.UTC(2020, 3, 15)), // April 15
    }
    const { calcInput } = buildCalcInput(employee, 2025, null, null, "entry_date")
    expect(calcInput.referenceDate.getUTCFullYear()).toBe(2025)
    expect(calcInput.referenceDate.getUTCMonth()).toBe(3) // April
    expect(calcInput.referenceDate.getUTCDate()).toBe(15)
  })

  it("applies tariff StandardWeeklyHours (default 40)", () => {
    const { standardWeeklyHours: defaultHours } = buildCalcInput(
      baseEmployee,
      2025,
      null,
      null,
      "calendar_year"
    )
    expect(defaultHours).toBe(40)

    const { standardWeeklyHours: tariffHours } = buildCalcInput(
      baseEmployee,
      2025,
      { weeklyTargetHours: 38.5 as unknown as Prisma.Decimal, annualVacationDays: null },
      null,
      "calendar_year"
    )
    expect(tariffHours).toBe(38.5)
  })

  it("applies tariff AnnualVacationDays", () => {
    const { baseVacationDays } = buildCalcInput(
      baseEmployee,
      2025,
      { weeklyTargetHours: null, annualVacationDays: 28 as unknown as Prisma.Decimal },
      null,
      "calendar_year"
    )
    expect(baseVacationDays).toBe(28)
  })

  it("builds special calcs from calc group links", () => {
    const calcGroup: ResolvedCalcGroup = {
      id: "group-1",
      name: "Test Group",
      basis: "calendar_year",
      specialCalcLinks: [
        {
          specialCalculation: {
            type: "age",
            threshold: 50,
            bonusDays: { toString: () => "2", valueOf: () => 2, [Symbol.toPrimitive]: () => 2 } as unknown as import("@/generated/prisma/client").Prisma.Decimal,
          },
        },
        {
          specialCalculation: {
            type: "tenure",
            threshold: 10,
            bonusDays: { toString: () => "3", valueOf: () => 3, [Symbol.toPrimitive]: () => 3 } as unknown as import("@/generated/prisma/client").Prisma.Decimal,
          },
        },
      ],
    }
    const { calcInput } = buildCalcInput(baseEmployee, 2025, null, calcGroup, "calendar_year")
    expect(calcInput.specialCalcs).toHaveLength(2)
    expect(calcInput.specialCalcs[0]!.type).toBe("age")
    expect(calcInput.specialCalcs[0]!.threshold).toBe(50)
    expect(calcInput.specialCalcs[0]!.bonusDays).toBe(2)
    expect(calcInput.specialCalcs[1]!.type).toBe("tenure")
  })
})

// --- resolveVacationBasis tests ---

describe("resolveVacationBasis", () => {
  function makeMockPrisma(tenantBasis: string | null = null) {
    return {
      tenant: {
        findFirst: vi.fn().mockResolvedValue(
          tenantBasis ? { vacationBasis: tenantBasis } : null
        ),
      },
    } as unknown as import("@/generated/prisma/client").PrismaClient
  }

  it("returns calendar_year as default when no overrides", async () => {
    const prisma = makeMockPrisma(null)
    const result = await resolveVacationBasis(
      prisma,
      { tenantId: "t1" },
      null,
      null,
      "t1"
    )
    expect(result).toBe("calendar_year")
  })

  it("uses tenant basis when set", async () => {
    const prisma = makeMockPrisma("entry_date")
    const result = await resolveVacationBasis(
      prisma,
      { tenantId: "t1" },
      null,
      null,
      "t1"
    )
    expect(result).toBe("entry_date")
  })

  it("tariff basis overrides tenant basis", async () => {
    const prisma = makeMockPrisma("entry_date")
    const result = await resolveVacationBasis(
      prisma,
      { tenantId: "t1" },
      { vacationBasis: "calendar_year" },
      null,
      "t1"
    )
    expect(result).toBe("calendar_year")
  })

  it("calc group basis overrides all", async () => {
    const prisma = makeMockPrisma("calendar_year")
    const result = await resolveVacationBasis(
      prisma,
      { tenantId: "t1" },
      { vacationBasis: "calendar_year" },
      { basis: "entry_date" },
      "t1"
    )
    expect(result).toBe("entry_date")
  })
})
