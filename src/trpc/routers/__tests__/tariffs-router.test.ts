import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { tariffsRouter } from "../tariffs"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const TARIFFS_MANAGE = permissionIdByKey("tariffs.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const TARIFF_ID = "a0000000-0000-4000-a000-000000000700"
const TARIFF_B_ID = "a0000000-0000-4000-a000-000000000704"
const WEEK_PLAN_ID = "a0000000-0000-4000-a000-000000000701"
const WEEK_PLAN_B_ID = "a0000000-0000-4000-a000-000000000705"
const WEEK_PLAN_C_ID = "a0000000-0000-4000-a000-000000000706"
const DAY_PLAN_ID = "a0000000-0000-4000-a000-000000000702"
const BREAK_ID = "a0000000-0000-4000-a000-000000000703"

const createCaller = createCallerFactory(tariffsRouter)

// --- Helpers ---

function makeTariff(
  overrides: Partial<{
    id: string
    tenantId: string
    code: string
    name: string
    description: string | null
    weekPlanId: string | null
    validFrom: Date | null
    validTo: Date | null
    isActive: boolean
    annualVacationDays: number | null
    workDaysPerWeek: number | null
    vacationBasis: string | null
    dailyTargetHours: number | null
    weeklyTargetHours: number | null
    monthlyTargetHours: number | null
    annualTargetHours: number | null
    maxFlextimePerMonth: number | null
    upperLimitAnnual: number | null
    lowerLimitAnnual: number | null
    flextimeThreshold: number | null
    creditType: string | null
    rhythmType: string | null
    cycleDays: number | null
    rhythmStartDate: Date | null
    vacationCappingRuleGroupId: string | null
    createdAt: Date
    updatedAt: Date
    weekPlan: { id: string; code: string; name: string } | null
    breaks: Array<Record<string, unknown>>
    tariffWeekPlans: Array<Record<string, unknown>>
    tariffDayPlans: Array<Record<string, unknown>>
  }> = {}
) {
  return {
    id: TARIFF_ID,
    tenantId: TENANT_ID,
    code: "T001",
    name: "Standard Tariff",
    description: null,
    weekPlanId: null,
    validFrom: null,
    validTo: null,
    isActive: true,
    annualVacationDays: null,
    workDaysPerWeek: 5,
    vacationBasis: "calendar_year",
    dailyTargetHours: null,
    weeklyTargetHours: null,
    monthlyTargetHours: null,
    annualTargetHours: null,
    maxFlextimePerMonth: null,
    upperLimitAnnual: null,
    lowerLimitAnnual: null,
    flextimeThreshold: null,
    creditType: "no_evaluation",
    rhythmType: "weekly",
    cycleDays: null,
    rhythmStartDate: null,
    vacationCappingRuleGroupId: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    weekPlan: null,
    breaks: [],
    tariffWeekPlans: [],
    tariffDayPlans: [],
    ...overrides,
  }
}

function makeTariffBreak(
  overrides: Partial<{
    id: string
    tariffId: string
    breakType: string
    afterWorkMinutes: number | null
    duration: number
    isPaid: boolean
    sortOrder: number
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: BREAK_ID,
    tariffId: TARIFF_ID,
    breakType: "fixed",
    afterWorkMinutes: null,
    duration: 30,
    isPaid: false,
    sortOrder: 0,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([TARIFFS_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- tariffs.list tests ---

describe("tariffs.list", () => {
  it("returns all tariffs for tenant, ordered by code", async () => {
    const tariffs = [
      makeTariff({ id: TARIFF_ID, code: "T001" }),
      makeTariff({ id: TARIFF_B_ID, code: "T002", name: "Premium Tariff" }),
    ]
    const mockPrisma = {
      tariff: {
        findMany: vi.fn().mockResolvedValue(tariffs),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toHaveLength(2)
    expect(result.data[0]!.code).toBe("T001")
    expect(result.data[1]!.code).toBe("T002")
    expect(mockPrisma.tariff.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID },
      include: {
        weekPlan: { select: { id: true, code: true, name: true } },
      },
      orderBy: { code: "asc" },
    })
  })

  it("filters by isActive when provided", async () => {
    const mockPrisma = {
      tariff: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ isActive: true })
    expect(mockPrisma.tariff.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, isActive: true },
      include: {
        weekPlan: { select: { id: true, code: true, name: true } },
      },
      orderBy: { code: "asc" },
    })
  })

  it("returns empty array when no tariffs exist", async () => {
    const mockPrisma = {
      tariff: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toEqual([])
  })
})

// --- tariffs.getById tests ---

describe("tariffs.getById", () => {
  it("returns tariff with breaks and rhythm data", async () => {
    const tariff = makeTariff({
      breaks: [makeTariffBreak()],
      weekPlan: { id: WEEK_PLAN_ID, code: "WP1", name: "Week Plan 1" },
      weekPlanId: WEEK_PLAN_ID,
    })
    const mockPrisma = {
      tariff: {
        findFirst: vi.fn().mockResolvedValue(tariff),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: TARIFF_ID })
    expect(result.id).toBe(TARIFF_ID)
    expect(result.code).toBe("T001")
    expect(result.breaks).toHaveLength(1)
    expect(result.weekPlan).toEqual({
      id: WEEK_PLAN_ID,
      code: "WP1",
      name: "Week Plan 1",
    })
  })

  it("throws NOT_FOUND for non-existent tariff", async () => {
    const mockPrisma = {
      tariff: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: TARIFF_ID })).rejects.toThrow(
      "Tariff not found"
    )
  })

  it("does not return tariff from different tenant", async () => {
    const mockPrisma = {
      tariff: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: TARIFF_ID })).rejects.toThrow(
      "Tariff not found"
    )
    expect(mockPrisma.tariff.findFirst).toHaveBeenCalledWith({
      where: { id: TARIFF_ID, tenantId: TENANT_ID },
      include: expect.any(Object),
    })
  })
})

// --- tariffs.create tests ---

describe("tariffs.create", () => {
  it("creates tariff with required fields only", async () => {
    const created = makeTariff()
    const mockPrisma = {
      tariff: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null) // code uniqueness check
          .mockResolvedValueOnce(created), // re-fetch with details
      },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          tariff: {
            create: vi.fn().mockResolvedValue(created),
          },
          tariffWeekPlan: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          tariffDayPlan: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        })
      }),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "T001",
      name: "Standard Tariff",
    })
    expect(result.code).toBe("T001")
    expect(result.name).toBe("Standard Tariff")
  })

  it("creates tariff with week plan (weekly rhythm)", async () => {
    const created = makeTariff({
      weekPlanId: WEEK_PLAN_ID,
      weekPlan: { id: WEEK_PLAN_ID, code: "WP1", name: "Week Plan 1" },
    })
    const mockPrisma = {
      tariff: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null) // code uniqueness
          .mockResolvedValueOnce(created), // re-fetch
      },
      weekPlan: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: WEEK_PLAN_ID, tenantId: TENANT_ID }),
      },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          tariff: {
            create: vi.fn().mockResolvedValue(created),
          },
          tariffWeekPlan: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          tariffDayPlan: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        })
      }),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "T001",
      name: "Standard Tariff",
      weekPlanId: WEEK_PLAN_ID,
    })
    expect(result.weekPlanId).toBe(WEEK_PLAN_ID)
    expect(mockPrisma.weekPlan.findFirst).toHaveBeenCalledWith({
      where: { id: WEEK_PLAN_ID, tenantId: TENANT_ID },
    })
  })

  it("creates tariff with description", async () => {
    const created = makeTariff({ description: "A description" })
    const mockPrisma = {
      tariff: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(created),
      },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          tariff: {
            create: vi.fn().mockResolvedValue(created),
          },
          tariffWeekPlan: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          tariffDayPlan: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        })
      }),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "T001",
      name: "Standard Tariff",
      description: "A description",
    })
    expect(result.description).toBe("A description")
  })

  it("creates tariff with validity dates", async () => {
    const validFrom = new Date("2025-01-01")
    const validTo = new Date("2025-12-31")
    const created = makeTariff({ validFrom, validTo })
    const mockPrisma = {
      tariff: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(created),
      },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          tariff: {
            create: vi.fn().mockResolvedValue(created),
          },
          tariffWeekPlan: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          tariffDayPlan: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        })
      }),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "T001",
      name: "Standard Tariff",
      validFrom: "2025-01-01",
      validTo: "2025-12-31",
    })
    expect(result.validFrom).toEqual(validFrom)
    expect(result.validTo).toEqual(validTo)
  })

  it("creates tariff with vacation configuration", async () => {
    const created = makeTariff({
      annualVacationDays: 30,
      workDaysPerWeek: 5,
      vacationBasis: "calendar_year",
    })
    const mockPrisma = {
      tariff: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(created),
      },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          tariff: {
            create: vi.fn().mockResolvedValue(created),
          },
          tariffWeekPlan: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          tariffDayPlan: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        })
      }),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "T001",
      name: "Standard Tariff",
      annualVacationDays: 30,
      workDaysPerWeek: 5,
      vacationBasis: "calendar_year",
    })
    expect(result.annualVacationDays).toBe(30)
    expect(result.workDaysPerWeek).toBe(5)
    expect(result.vacationBasis).toBe("calendar_year")
  })

  it("creates tariff with target hours", async () => {
    const created = makeTariff({
      dailyTargetHours: 8,
      weeklyTargetHours: 40,
      monthlyTargetHours: 173.33,
      annualTargetHours: 2080,
    })
    const mockPrisma = {
      tariff: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(created),
      },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          tariff: {
            create: vi.fn().mockResolvedValue(created),
          },
          tariffWeekPlan: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          tariffDayPlan: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        })
      }),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "T001",
      name: "Standard Tariff",
      dailyTargetHours: 8,
      weeklyTargetHours: 40,
      monthlyTargetHours: 173.33,
      annualTargetHours: 2080,
    })
    expect(result.dailyTargetHours).toBe(8)
    expect(result.weeklyTargetHours).toBe(40)
    expect(result.monthlyTargetHours).toBe(173.33)
    expect(result.annualTargetHours).toBe(2080)
  })

  it("creates tariff with flextime configuration", async () => {
    const created = makeTariff({
      maxFlextimePerMonth: 40,
      upperLimitAnnual: 100,
      lowerLimitAnnual: -50,
      flextimeThreshold: 10,
      creditType: "complete_carryover",
    })
    const mockPrisma = {
      tariff: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(created),
      },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          tariff: {
            create: vi.fn().mockResolvedValue(created),
          },
          tariffWeekPlan: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          tariffDayPlan: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        })
      }),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "T001",
      name: "Standard Tariff",
      maxFlextimePerMonth: 40,
      upperLimitAnnual: 100,
      lowerLimitAnnual: -50,
      flextimeThreshold: 10,
      creditType: "complete_carryover",
    })
    expect(result.maxFlextimePerMonth).toBe(40)
    expect(result.creditType).toBe("complete_carryover")
  })

  it("throws BAD_REQUEST for empty code", async () => {
    const mockPrisma = {
      tariff: {},
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "   ", name: "Tariff" })
    ).rejects.toThrow("Tariff code is required")
  })

  it("throws BAD_REQUEST for empty name", async () => {
    const mockPrisma = {
      tariff: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "T001", name: "   " })
    ).rejects.toThrow("Tariff name is required")
  })

  it("throws CONFLICT for duplicate code within tenant", async () => {
    const mockPrisma = {
      tariff: {
        findFirst: vi.fn().mockResolvedValue(makeTariff()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "T001", name: "Tariff" })
    ).rejects.toThrow("Tariff code already exists")
  })

  it("throws BAD_REQUEST for invalid week plan reference", async () => {
    const mockPrisma = {
      tariff: {
        findFirst: vi.fn().mockResolvedValue(null), // code uniqueness
      },
      weekPlan: {
        findFirst: vi.fn().mockResolvedValue(null), // invalid WP
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        code: "T001",
        name: "Tariff",
        weekPlanId: WEEK_PLAN_ID,
      })
    ).rejects.toThrow("Invalid week plan reference")
  })

  it("creates tariff with rolling_weekly rhythm + week plan IDs", async () => {
    const created = makeTariff({
      rhythmType: "rolling_weekly",
      rhythmStartDate: new Date("2025-01-01"),
    })
    let txCreateManyCalled = false
    const mockPrisma = {
      tariff: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null) // code uniqueness
          .mockResolvedValueOnce(created), // re-fetch
      },
      weekPlan: {
        findMany: vi.fn().mockResolvedValue([
          { id: WEEK_PLAN_ID },
          { id: WEEK_PLAN_B_ID },
        ]),
      },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          tariff: {
            create: vi.fn().mockResolvedValue(created),
          },
          tariffWeekPlan: {
            createMany: vi.fn().mockImplementation(async () => {
              txCreateManyCalled = true
              return { count: 2 }
            }),
          },
          tariffDayPlan: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        })
      }),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "T001",
      name: "Rolling Tariff",
      rhythmType: "rolling_weekly",
      rhythmStartDate: "2025-01-01",
      weekPlanIds: [WEEK_PLAN_ID, WEEK_PLAN_B_ID],
    })
    expect(result.rhythmType).toBe("rolling_weekly")
    expect(txCreateManyCalled).toBe(true)
  })

  it("creates tariff with rolling_weekly 3-week rotation (early/late/night)", async () => {
    const created = makeTariff({
      rhythmType: "rolling_weekly",
      rhythmStartDate: new Date("2026-01-06"),
    })
    let createdData: { data: Array<{ weekPlanId: string; sequenceOrder: number }> } | undefined
    const mockPrisma = {
      tariff: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null) // code uniqueness
          .mockResolvedValueOnce(created), // re-fetch
      },
      weekPlan: {
        findMany: vi.fn().mockResolvedValue([
          { id: WEEK_PLAN_ID },
          { id: WEEK_PLAN_B_ID },
          { id: WEEK_PLAN_C_ID },
        ]),
      },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          tariff: {
            create: vi.fn().mockResolvedValue(created),
          },
          tariffWeekPlan: {
            createMany: vi.fn().mockImplementation(async (args: typeof createdData) => {
              createdData = args
              return { count: 3 }
            }),
          },
          tariffDayPlan: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        })
      }),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "PROD-WS",
      name: "Produktion Wechselschicht",
      rhythmType: "rolling_weekly",
      rhythmStartDate: "2026-01-06",
      weekPlanIds: [WEEK_PLAN_ID, WEEK_PLAN_B_ID, WEEK_PLAN_C_ID],
    })
    expect(result.rhythmType).toBe("rolling_weekly")
    expect(createdData).toBeDefined()
    expect(createdData!.data).toHaveLength(3)
    expect(createdData!.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ weekPlanId: WEEK_PLAN_ID, sequenceOrder: 1 }),
        expect.objectContaining({ weekPlanId: WEEK_PLAN_B_ID, sequenceOrder: 2 }),
        expect.objectContaining({ weekPlanId: WEEK_PLAN_C_ID, sequenceOrder: 3 }),
      ])
    )
  })

  it("creates tariff with x_days rhythm + day plans", async () => {
    const created = makeTariff({
      rhythmType: "x_days",
      cycleDays: 14,
      rhythmStartDate: new Date("2025-01-01"),
    })
    let txCreateManyCalled = false
    const mockPrisma = {
      tariff: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null) // code uniqueness
          .mockResolvedValueOnce(created), // re-fetch
      },
      dayPlan: {
        findMany: vi.fn().mockResolvedValue([
          { id: DAY_PLAN_ID },
        ]),
      },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          tariff: {
            create: vi.fn().mockResolvedValue(created),
          },
          tariffWeekPlan: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          tariffDayPlan: {
            createMany: vi.fn().mockImplementation(async () => {
              txCreateManyCalled = true
              return { count: 2 }
            }),
          },
        })
      }),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "T001",
      name: "X Days Tariff",
      rhythmType: "x_days",
      cycleDays: 14,
      rhythmStartDate: "2025-01-01",
      dayPlans: [
        { dayPosition: 1, dayPlanId: DAY_PLAN_ID },
        { dayPosition: 2, dayPlanId: null },
      ],
    })
    expect(result.rhythmType).toBe("x_days")
    expect(result.cycleDays).toBe(14)
    expect(txCreateManyCalled).toBe(true)
  })

  it("throws BAD_REQUEST when rolling_weekly missing start date", async () => {
    const mockPrisma = {
      tariff: {
        findFirst: vi.fn().mockResolvedValue(null), // code uniqueness
      },
      weekPlan: {
        findFirst: vi.fn().mockResolvedValue({
          id: WEEK_PLAN_ID,
          tenantId: TENANT_ID,
        }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        code: "T001",
        name: "Tariff",
        rhythmType: "rolling_weekly",
        weekPlanIds: [WEEK_PLAN_ID],
      })
    ).rejects.toThrow(
      "rhythm_start_date is required for rolling_weekly and x_days rhythms"
    )
  })

  it("throws BAD_REQUEST when x_days missing cycle_days", async () => {
    const mockPrisma = {
      tariff: {
        findFirst: vi.fn().mockResolvedValue(null), // code uniqueness
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        code: "T001",
        name: "Tariff",
        rhythmType: "x_days",
        rhythmStartDate: "2025-01-01",
      })
    ).rejects.toThrow("cycle_days is required for x_days rhythm")
  })
})

// --- tariffs.update tests ---

describe("tariffs.update", () => {
  it("updates name successfully", async () => {
    const existing = makeTariff()
    const updated = makeTariff({ name: "Updated Tariff" })
    const mockPrisma = {
      tariff: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing) // existence check
          .mockResolvedValueOnce(updated), // re-fetch
        update: vi.fn().mockResolvedValue(updated),
      },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          tariff: {
            update: vi.fn().mockResolvedValue(updated),
          },
          tariffWeekPlan: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          tariffDayPlan: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        })
      }),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: TARIFF_ID,
      name: "Updated Tariff",
    })
    expect(result.name).toBe("Updated Tariff")
  })

  it("updates description (set and clear via null)", async () => {
    const existing = makeTariff()
    const withDesc = makeTariff({ description: "New desc" })
    const cleared = makeTariff({ description: null })
    const mockPrismaSet = {
      tariff: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(withDesc),
      },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          tariff: {
            update: vi.fn().mockResolvedValue(withDesc),
          },
          tariffWeekPlan: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          tariffDayPlan: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        })
      }),
    }
    const caller1 = createCaller(createTestContext(mockPrismaSet))
    const result1 = await caller1.update({
      id: TARIFF_ID,
      description: "New desc",
    })
    expect(result1.description).toBe("New desc")

    // Now clear it
    const mockPrismaClear = {
      tariff: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(withDesc)
          .mockResolvedValueOnce(cleared),
      },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          tariff: {
            update: vi.fn().mockResolvedValue(cleared),
          },
          tariffWeekPlan: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          tariffDayPlan: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        })
      }),
    }
    const caller2 = createCaller(createTestContext(mockPrismaClear))
    const result2 = await caller2.update({
      id: TARIFF_ID,
      description: null,
    })
    expect(result2.description).toBeNull()
  })

  it("adds week plan reference", async () => {
    const existing = makeTariff()
    const updated = makeTariff({
      weekPlanId: WEEK_PLAN_ID,
      weekPlan: { id: WEEK_PLAN_ID, code: "WP1", name: "Week Plan 1" },
    })
    const mockPrisma = {
      tariff: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(updated),
      },
      weekPlan: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: WEEK_PLAN_ID, tenantId: TENANT_ID }),
      },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          tariff: {
            update: vi.fn().mockResolvedValue(updated),
          },
          tariffWeekPlan: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          tariffDayPlan: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        })
      }),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: TARIFF_ID,
      weekPlanId: WEEK_PLAN_ID,
    })
    expect(result.weekPlanId).toBe(WEEK_PLAN_ID)
  })

  it("clears week plan reference (null)", async () => {
    const existing = makeTariff({ weekPlanId: WEEK_PLAN_ID })
    const updated = makeTariff({ weekPlanId: null, weekPlan: null })
    const mockPrisma = {
      tariff: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(updated),
      },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          tariff: {
            update: vi.fn().mockResolvedValue(updated),
          },
          tariffWeekPlan: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          tariffDayPlan: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        })
      }),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: TARIFF_ID,
      weekPlanId: null,
    })
    expect(result.weekPlanId).toBeNull()
  })

  it("throws NOT_FOUND for non-existent tariff", async () => {
    const mockPrisma = {
      tariff: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: TARIFF_ID, name: "Updated" })
    ).rejects.toThrow("Tariff not found")
  })

  it("throws BAD_REQUEST for empty name", async () => {
    const existing = makeTariff()
    const mockPrisma = {
      tariff: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: TARIFF_ID, name: "   " })
    ).rejects.toThrow("Tariff name is required")
  })
})

// --- tariffs.delete tests ---

describe("tariffs.delete", () => {
  it("deletes tariff successfully", async () => {
    const existing = makeTariff()
    const mockPrisma = {
      tariff: {
        findFirst: vi.fn().mockResolvedValue(existing),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      employeeTariffAssignment: {
        count: vi.fn().mockResolvedValue(0),
      },
      employee: {
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: TARIFF_ID })
    expect(result.success).toBe(true)
    expect(mockPrisma.tariff.deleteMany).toHaveBeenCalledWith({
      where: { id: TARIFF_ID, tenantId: TENANT_ID },
    })
  })

  it("throws NOT_FOUND for non-existent tariff", async () => {
    const mockPrisma = {
      tariff: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: TARIFF_ID })).rejects.toThrow(
      "Tariff not found"
    )
  })

  it("throws BAD_REQUEST when tariff has employee assignments", async () => {
    const existing = makeTariff()
    const mockPrisma = {
      tariff: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
      employeeTariffAssignment: {
        count: vi.fn().mockResolvedValue(3),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: TARIFF_ID })).rejects.toThrow(
      "Cannot delete tariff that is assigned to employees"
    )
  })

  it("throws BAD_REQUEST when tariff is referenced by employees directly", async () => {
    const existing = makeTariff()
    const mockPrisma = {
      tariff: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
      employeeTariffAssignment: {
        count: vi.fn().mockResolvedValue(0),
      },
      employee: {
        count: vi.fn().mockResolvedValue(2),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: TARIFF_ID })).rejects.toThrow(
      "Cannot delete tariff that is assigned to employees"
    )
  })
})

// --- tariffs.createBreak tests ---

describe("tariffs.createBreak", () => {
  it("creates break with all fields", async () => {
    const brk = makeTariffBreak({
      breakType: "minimum",
      afterWorkMinutes: 300,
      duration: 30,
      isPaid: false,
    })
    const mockPrisma = {
      tariff: {
        findFirst: vi.fn().mockResolvedValue(makeTariff()),
      },
      tariffBreak: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue(brk),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.createBreak({
      tariffId: TARIFF_ID,
      breakType: "minimum",
      afterWorkMinutes: 300,
      duration: 30,
    })
    expect(result.breakType).toBe("minimum")
    expect(result.afterWorkMinutes).toBe(300)
    expect(result.duration).toBe(30)
  })

  it("auto-calculates sortOrder", async () => {
    const brk = makeTariffBreak({ sortOrder: 2 })
    const mockPrisma = {
      tariff: {
        findFirst: vi.fn().mockResolvedValue(makeTariff()),
      },
      tariffBreak: {
        count: vi.fn().mockResolvedValue(2),
        create: vi.fn().mockResolvedValue(brk),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.createBreak({
      tariffId: TARIFF_ID,
      breakType: "fixed",
      duration: 15,
    })
    const createCall = mockPrisma.tariffBreak.create.mock.calls[0]![0]
    expect(createCall.data.sortOrder).toBe(2)
  })

  it("throws NOT_FOUND when tariff not found", async () => {
    const mockPrisma = {
      tariff: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.createBreak({
        tariffId: TARIFF_ID,
        breakType: "fixed",
        duration: 15,
      })
    ).rejects.toThrow("Tariff not found")
  })

  it("throws validation error for zero duration", async () => {
    const mockPrisma = {
      tariff: {},
    }
    const caller = createCaller(createTestContext(mockPrisma))
    // Zod schema validation should reject duration < 1
    await expect(
      caller.createBreak({
        tariffId: TARIFF_ID,
        breakType: "fixed",
        duration: 0,
      })
    ).rejects.toThrow()
  })
})

// --- tariffs.deleteBreak tests ---

describe("tariffs.deleteBreak", () => {
  it("deletes break successfully", async () => {
    const brk = makeTariffBreak()
    const mockPrisma = {
      tariff: {
        findFirst: vi.fn().mockResolvedValue(makeTariff()),
      },
      tariffBreak: {
        findFirst: vi.fn().mockResolvedValue(brk),
        delete: vi.fn().mockResolvedValue(brk),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.deleteBreak({
      tariffId: TARIFF_ID,
      breakId: BREAK_ID,
    })
    expect(result.success).toBe(true)
    expect(mockPrisma.tariffBreak.delete).toHaveBeenCalledWith({
      where: { id: BREAK_ID },
    })
  })

  it("throws NOT_FOUND when tariff not found", async () => {
    const mockPrisma = {
      tariff: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.deleteBreak({
        tariffId: TARIFF_ID,
        breakId: BREAK_ID,
      })
    ).rejects.toThrow("Tariff not found")
  })

  it("throws NOT_FOUND when break not found", async () => {
    const mockPrisma = {
      tariff: {
        findFirst: vi.fn().mockResolvedValue(makeTariff()),
      },
      tariffBreak: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.deleteBreak({
        tariffId: TARIFF_ID,
        breakId: BREAK_ID,
      })
    ).rejects.toThrow("Tariff break not found")
  })

  it("throws NOT_FOUND when break belongs to different tariff", async () => {
    // findFirst with { id: breakId, tariffId: tariffId } returns null
    // because the break doesn't belong to this tariff
    const mockPrisma = {
      tariff: {
        findFirst: vi.fn().mockResolvedValue(makeTariff()),
      },
      tariffBreak: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.deleteBreak({
        tariffId: TARIFF_ID,
        breakId: BREAK_ID,
      })
    ).rejects.toThrow("Tariff break not found")
  })
})
