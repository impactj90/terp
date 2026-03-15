import { describe, it, expect, vi } from "vitest"
import { Prisma } from "@/generated/prisma/client"
import { createCallerFactory } from "@/trpc/init"
import { dayPlansRouter } from "../dayPlans"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const DAY_PLANS_MANAGE = permissionIdByKey("day_plans.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const DAY_PLAN_ID = "a0000000-0000-4000-a000-000000000700"
const DAY_PLAN_B_ID = "a0000000-0000-4000-a000-000000000701"
const BREAK_ID = "a0000000-0000-4000-a000-000000000800"
const BONUS_ID = "a0000000-0000-4000-a000-000000000900"
const ACCOUNT_ID = "a0000000-0000-4000-a000-000000000350"

const createCaller = createCallerFactory(dayPlansRouter)

// --- Helpers ---

function makeDayPlan(
  overrides: Record<string, unknown> = {}
) {
  return {
    id: DAY_PLAN_ID,
    tenantId: TENANT_ID,
    code: "STD-1",
    name: "Standard Day",
    description: null,
    planType: "fixed",
    comeFrom: null,
    comeTo: null,
    goFrom: null,
    goTo: null,
    coreStart: null,
    coreEnd: null,
    regularHours: 480,
    regularHours2: null,
    fromEmployeeMaster: false,
    toleranceComePlus: 0,
    toleranceComeMinus: 0,
    toleranceGoPlus: 0,
    toleranceGoMinus: 0,
    roundingComeType: null,
    roundingComeInterval: null,
    roundingGoType: null,
    roundingGoInterval: null,
    minWorkTime: null,
    maxNetWorkTime: null,
    variableWorkTime: false,
    roundAllBookings: false,
    roundingComeAddValue: null,
    roundingGoAddValue: null,
    holidayCreditCat1: null,
    holidayCreditCat2: null,
    holidayCreditCat3: null,
    vacationDeduction: new Prisma.Decimal("1.00"),
    noBookingBehavior: "error",
    dayChangeBehavior: "none",
    shiftDetectArriveFrom: null,
    shiftDetectArriveTo: null,
    shiftDetectDepartFrom: null,
    shiftDetectDepartTo: null,
    shiftAltPlan1: null,
    shiftAltPlan2: null,
    shiftAltPlan3: null,
    shiftAltPlan4: null,
    shiftAltPlan5: null,
    shiftAltPlan6: null,
    netAccountId: null,
    capAccountId: null,
    isActive: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    breaks: [],
    bonuses: [],
    ...overrides,
  }
}

function makeBreak(overrides: Record<string, unknown> = {}) {
  return {
    id: BREAK_ID,
    dayPlanId: DAY_PLAN_ID,
    breakType: "fixed",
    startTime: 720,
    endTime: 750,
    duration: 30,
    afterWorkMinutes: null,
    autoDeduct: true,
    isPaid: false,
    minutesDifference: false,
    sortOrder: 0,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

function makeBonus(overrides: Record<string, unknown> = {}) {
  return {
    id: BONUS_ID,
    dayPlanId: DAY_PLAN_ID,
    accountId: ACCOUNT_ID,
    timeFrom: 1320,
    timeTo: 1440,
    calculationType: "per_minute",
    valueMinutes: 15,
    minWorkMinutes: null,
    appliesOnHoliday: false,
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
    user: createUserWithPermissions([DAY_PLANS_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- dayPlans.list tests ---

describe("dayPlans.list", () => {
  it("returns day plans ordered by code ASC", async () => {
    const plans = [
      makeDayPlan({ id: DAY_PLAN_ID, code: "A-PLAN" }),
      makeDayPlan({ id: DAY_PLAN_B_ID, code: "B-PLAN" }),
    ]
    const mockPrisma = {
      dayPlan: {
        findMany: vi.fn().mockResolvedValue(plans),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toHaveLength(2)
    expect(result.data[0]!.code).toBe("A-PLAN")
    expect(result.data[1]!.code).toBe("B-PLAN")
  })

  it("filters by isActive", async () => {
    const mockPrisma = {
      dayPlan: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ isActive: true })
    expect(mockPrisma.dayPlan.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, isActive: true },
      orderBy: { code: "asc" },
    })
  })

  it("filters by planType", async () => {
    const mockPrisma = {
      dayPlan: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ planType: "flextime" })
    expect(mockPrisma.dayPlan.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, planType: "flextime" },
      orderBy: { code: "asc" },
    })
  })

  it("returns empty array", async () => {
    const mockPrisma = {
      dayPlan: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toEqual([])
  })
})

// --- dayPlans.getById tests ---

describe("dayPlans.getById", () => {
  it("returns day plan with breaks and bonuses", async () => {
    const plan = makeDayPlan({
      breaks: [makeBreak()],
      bonuses: [makeBonus()],
    })
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(plan),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: DAY_PLAN_ID })
    expect(result.id).toBe(DAY_PLAN_ID)
    expect(result.breaks).toHaveLength(1)
    expect(result.bonuses).toHaveLength(1)
  })

  it("throws NOT_FOUND for missing day plan", async () => {
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: DAY_PLAN_ID })).rejects.toThrow(
      "Day plan not found"
    )
  })
})

// --- dayPlans.create tests ---

describe("dayPlans.create", () => {
  it("creates day plan with defaults", async () => {
    const created = makeDayPlan()
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
        findUnique: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "STD-1",
      name: "Standard Day",
    })
    expect(result.code).toBe("STD-1")
    expect(result.planType).toBe("fixed")
    expect(result.regularHours).toBe(480)
    expect(result.isActive).toBe(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createCall = (mockPrisma.dayPlan.create.mock.calls[0]![0] as any).data
    expect(createCall.planType).toBe("fixed")
    expect(createCall.regularHours).toBe(480)
    expect(createCall.isActive).toBe(true)
  })

  it("trims whitespace on code, name, description", async () => {
    const created = makeDayPlan({ description: "Desc" })
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
        findUnique: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      code: "  STD-1  ",
      name: "  Standard Day  ",
      description: "  Desc  ",
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createCall = (mockPrisma.dayPlan.create.mock.calls[0]![0] as any).data
    expect(createCall.code).toBe("STD-1")
    expect(createCall.name).toBe("Standard Day")
    expect(createCall.description).toBe("Desc")
  })

  it("rejects empty code", async () => {
    const mockPrisma = { dayPlan: {} }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "   ", name: "Plan" })
    ).rejects.toThrow("Day plan code is required")
  })

  it("rejects empty name", async () => {
    const mockPrisma = { dayPlan: {} }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "STD-1", name: "   " })
    ).rejects.toThrow("Day plan name is required")
  })

  it('rejects reserved code "U" (case-insensitive)', async () => {
    const mockPrisma = { dayPlan: {} }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "U", name: "Plan" })
    ).rejects.toThrow("Day plan code is reserved")
  })

  it('rejects reserved code "k" (lowercase)', async () => {
    const mockPrisma = { dayPlan: {} }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "k", name: "Plan" })
    ).rejects.toThrow("Day plan code is reserved")
  })

  it("rejects duplicate code with CONFLICT", async () => {
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(makeDayPlan()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "STD-1", name: "Plan" })
    ).rejects.toThrow("Day plan code already exists")
  })

  it("validates regularHours > 0", async () => {
    const mockPrisma = { dayPlan: {} }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "STD-1", name: "Plan", regularHours: 0 })
    ).rejects.toThrow("Regular hours must be positive")
  })

  it('applies flextime normalization when planType is "flextime"', async () => {
    const created = makeDayPlan({ planType: "flextime" })
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
        findUnique: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      code: "FLEX-1",
      name: "Flex Plan",
      planType: "flextime",
      toleranceComePlus: 15,
      toleranceGoMinus: 15,
      variableWorkTime: true,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createCall = (mockPrisma.dayPlan.create.mock.calls[0]![0] as any).data
    expect(createCall.toleranceComePlus).toBe(0)
    expect(createCall.toleranceGoMinus).toBe(0)
    expect(createCall.variableWorkTime).toBe(false)
  })

  it("handles vacationDeduction as Decimal", async () => {
    const created = makeDayPlan({
      vacationDeduction: new Prisma.Decimal("0.50"),
    })
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
        findUnique: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "STD-1",
      name: "Plan",
      vacationDeduction: 0.5,
    })
    expect(result.vacationDeduction).toBe(0.5)
  })
})

// --- dayPlans.update tests ---

describe("dayPlans.update", () => {
  it("updates partial fields successfully", async () => {
    const existing = makeDayPlan()
    const updated = makeDayPlan({ name: "Updated" })
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
        findUnique: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: DAY_PLAN_ID, name: "Updated" })
    expect(result.name).toBe("Updated")
  })

  it("rejects empty code", async () => {
    const existing = makeDayPlan()
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: DAY_PLAN_ID, code: "   " })
    ).rejects.toThrow("Day plan code is required")
  })

  it("rejects empty name", async () => {
    const existing = makeDayPlan()
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: DAY_PLAN_ID, name: "   " })
    ).rejects.toThrow("Day plan name is required")
  })

  it("rejects duplicate code with CONFLICT", async () => {
    const existing = makeDayPlan({ code: "OLD" })
    const conflicting = makeDayPlan({ id: DAY_PLAN_B_ID, code: "NEW" })
    const mockPrisma = {
      dayPlan: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(conflicting),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: DAY_PLAN_ID, code: "NEW" })
    ).rejects.toThrow("Day plan code already exists")
  })

  it("allows same code (no false conflict)", async () => {
    const existing = makeDayPlan({ code: "STD-1" })
    const updated = makeDayPlan({ code: "STD-1" })
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
        findUnique: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: DAY_PLAN_ID, code: "STD-1" })
    expect(result.code).toBe("STD-1")
    // findFirst should be called only once (existence check)
    expect(mockPrisma.dayPlan.findFirst).toHaveBeenCalledTimes(1)
  })

  it("throws NOT_FOUND for missing day plan", async () => {
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: DAY_PLAN_ID, name: "Updated" })
    ).rejects.toThrow("Day plan not found")
  })

  it("applies flextime normalization on planType change", async () => {
    const existing = makeDayPlan({
      planType: "fixed",
      toleranceComePlus: 15,
      toleranceGoMinus: 15,
      variableWorkTime: true,
    })
    const updated = makeDayPlan({
      planType: "flextime",
      toleranceComePlus: 0,
      toleranceGoMinus: 0,
      variableWorkTime: false,
    })
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
        findUnique: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.update({ id: DAY_PLAN_ID, planType: "flextime" })
    const updateCall = mockPrisma.dayPlan.update.mock.calls[0]![0]
    expect(updateCall.data.toleranceComePlus).toBe(0)
    expect(updateCall.data.toleranceGoMinus).toBe(0)
    expect(updateCall.data.variableWorkTime).toBe(false)
  })

  it("can set nullable fields to null", async () => {
    const existing = makeDayPlan({ comeFrom: 480, comeTo: 540 })
    const updated = makeDayPlan({ comeFrom: null, comeTo: null })
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
        findUnique: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: DAY_PLAN_ID,
      comeFrom: null,
      comeTo: null,
    })
    expect(result.comeFrom).toBeNull()
    expect(result.comeTo).toBeNull()
    const updateCall = mockPrisma.dayPlan.update.mock.calls[0]![0]
    expect(updateCall.data.comeFrom).toBeNull()
    expect(updateCall.data.comeTo).toBeNull()
  })
})

// --- dayPlans.delete tests ---

describe("dayPlans.delete", () => {
  it("deletes day plan successfully", async () => {
    const existing = makeDayPlan()
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(existing),
      },
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ count: 0 }]),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: DAY_PLAN_ID })
    expect(result.success).toBe(true)
  })

  it("throws NOT_FOUND for missing day plan", async () => {
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: DAY_PLAN_ID })).rejects.toThrow(
      "Day plan not found"
    )
  })

  it("rejects deletion when referenced by week plans", async () => {
    const existing = makeDayPlan()
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ count: 2 }]),
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: DAY_PLAN_ID })).rejects.toThrow(
      "Cannot delete day plan that is referenced by week plans"
    )
  })
})

// --- dayPlans.copy tests ---

describe("dayPlans.copy", () => {
  it("copies day plan with breaks and bonuses", async () => {
    const original = makeDayPlan({
      breaks: [makeBreak()],
      bonuses: [makeBonus()],
    })
    const copyResult = makeDayPlan({
      id: DAY_PLAN_B_ID,
      code: "STD-2",
      name: "Copy",
      breaks: [makeBreak({ id: "a0000000-0000-4000-a000-000000000801", dayPlanId: DAY_PLAN_B_ID })],
      bonuses: [makeBonus({ id: "a0000000-0000-4000-a000-000000000901", dayPlanId: DAY_PLAN_B_ID })],
    })
    const mockPrisma = {
      dayPlan: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(original) // fetch original
          .mockResolvedValueOnce(null), // code uniqueness check
        create: vi.fn().mockResolvedValue({ ...copyResult, id: DAY_PLAN_B_ID }),
        findUnique: vi.fn().mockResolvedValue(copyResult),
      },
      dayPlanBreak: {
        create: vi.fn().mockResolvedValue({}),
      },
      dayPlanBonus: {
        create: vi.fn().mockResolvedValue({}),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.copy({
      id: DAY_PLAN_ID,
      newCode: "STD-2",
      newName: "Copy",
    })
    expect(result.id).toBe(DAY_PLAN_B_ID)
    expect(result.code).toBe("STD-2")
    expect(result.name).toBe("Copy")
    expect(result.breaks).toHaveLength(1)
    expect(result.bonuses).toHaveLength(1)
    expect(mockPrisma.dayPlanBreak.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.dayPlanBonus.create).toHaveBeenCalledTimes(1)
  })

  it("trims and validates newCode, newName", async () => {
    const mockPrisma = { dayPlan: {} }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.copy({ id: DAY_PLAN_ID, newCode: "   ", newName: "Copy" })
    ).rejects.toThrow("New code is required")
  })

  it("rejects reserved newCode", async () => {
    const mockPrisma = { dayPlan: {} }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.copy({ id: DAY_PLAN_ID, newCode: "S", newName: "Copy" })
    ).rejects.toThrow("Day plan code is reserved")
  })

  it("rejects duplicate newCode", async () => {
    const original = makeDayPlan()
    const mockPrisma = {
      dayPlan: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(original) // fetch original
          .mockResolvedValueOnce(makeDayPlan()), // code uniqueness check - returns existing
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.copy({ id: DAY_PLAN_ID, newCode: "STD-1", newName: "Copy" })
    ).rejects.toThrow("Day plan code already exists")
  })

  it("throws NOT_FOUND for missing source day plan", async () => {
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.copy({ id: DAY_PLAN_ID, newCode: "STD-2", newName: "Copy" })
    ).rejects.toThrow("Day plan not found")
  })
})

// --- dayPlans.createBreak tests ---

describe("dayPlans.createBreak", () => {
  it("creates fixed break with start/end time", async () => {
    const brk = makeBreak()
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(makeDayPlan()),
      },
      dayPlanBreak: {
        create: vi.fn().mockResolvedValue(brk),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.createBreak({
      dayPlanId: DAY_PLAN_ID,
      breakType: "fixed",
      startTime: 720,
      endTime: 750,
      duration: 30,
    })
    expect(result.id).toBe(BREAK_ID)
    expect(result.breakType).toBe("fixed")
  })

  it("creates variable break (no time requirements)", async () => {
    const brk = makeBreak({ breakType: "variable", startTime: null, endTime: null })
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(makeDayPlan()),
      },
      dayPlanBreak: {
        create: vi.fn().mockResolvedValue(brk),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.createBreak({
      dayPlanId: DAY_PLAN_ID,
      breakType: "variable",
      duration: 30,
    })
    expect(result.breakType).toBe("variable")
  })

  it("creates minimum break with afterWorkMinutes", async () => {
    const brk = makeBreak({
      breakType: "minimum",
      startTime: null,
      endTime: null,
      afterWorkMinutes: 360,
    })
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(makeDayPlan()),
      },
      dayPlanBreak: {
        create: vi.fn().mockResolvedValue(brk),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.createBreak({
      dayPlanId: DAY_PLAN_ID,
      breakType: "minimum",
      duration: 30,
      afterWorkMinutes: 360,
    })
    expect(result.breakType).toBe("minimum")
    expect(result.afterWorkMinutes).toBe(360)
  })

  it("validates fixed break requires startTime and endTime", async () => {
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(makeDayPlan()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.createBreak({
        dayPlanId: DAY_PLAN_ID,
        breakType: "fixed",
        duration: 30,
      })
    ).rejects.toThrow("Fixed break requires start time and end time")
  })

  it("validates fixed break startTime < endTime", async () => {
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(makeDayPlan()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.createBreak({
        dayPlanId: DAY_PLAN_ID,
        breakType: "fixed",
        startTime: 750,
        endTime: 720,
        duration: 30,
      })
    ).rejects.toThrow("Break start time must be before end time")
  })

  it("validates minimum break requires afterWorkMinutes", async () => {
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(makeDayPlan()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.createBreak({
        dayPlanId: DAY_PLAN_ID,
        breakType: "minimum",
        duration: 30,
      })
    ).rejects.toThrow("Minimum break requires after work minutes")
  })

  it("throws NOT_FOUND when parent day plan missing", async () => {
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.createBreak({
        dayPlanId: DAY_PLAN_ID,
        breakType: "variable",
        duration: 30,
      })
    ).rejects.toThrow("Day plan not found")
  })
})

// --- dayPlans.deleteBreak tests ---

describe("dayPlans.deleteBreak", () => {
  it("deletes break successfully", async () => {
    const brk = makeBreak()
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(makeDayPlan()),
      },
      dayPlanBreak: {
        findFirst: vi.fn().mockResolvedValue(brk),
        delete: vi.fn().mockResolvedValue(brk),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.deleteBreak({
      dayPlanId: DAY_PLAN_ID,
      breakId: BREAK_ID,
    })
    expect(result.success).toBe(true)
  })

  it("throws NOT_FOUND when break missing", async () => {
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(makeDayPlan()),
      },
      dayPlanBreak: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.deleteBreak({ dayPlanId: DAY_PLAN_ID, breakId: BREAK_ID })
    ).rejects.toThrow("Break not found")
  })

  it("throws NOT_FOUND when parent day plan missing", async () => {
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.deleteBreak({ dayPlanId: DAY_PLAN_ID, breakId: BREAK_ID })
    ).rejects.toThrow("Day plan not found")
  })
})

// --- dayPlans.createBonus tests ---

describe("dayPlans.createBonus", () => {
  it("creates bonus successfully", async () => {
    const bonus = makeBonus()
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(makeDayPlan()),
      },
      dayPlanBonus: {
        create: vi.fn().mockResolvedValue(bonus),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.createBonus({
      dayPlanId: DAY_PLAN_ID,
      accountId: ACCOUNT_ID,
      timeFrom: 1320,
      timeTo: 1440,
      calculationType: "per_minute",
      valueMinutes: 15,
    })
    expect(result.id).toBe(BONUS_ID)
    expect(result.calculationType).toBe("per_minute")
  })

  it("validates timeFrom !== timeTo", async () => {
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(makeDayPlan()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.createBonus({
        dayPlanId: DAY_PLAN_ID,
        accountId: ACCOUNT_ID,
        timeFrom: 1320,
        timeTo: 1320,
        calculationType: "per_minute",
        valueMinutes: 15,
      })
    ).rejects.toThrow("Bonus time from and time to must not be equal")
  })

  it("allows overnight bonus (timeFrom > timeTo)", async () => {
    const bonus = makeBonus({ timeFrom: 1320, timeTo: 360 })
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(makeDayPlan()),
      },
      dayPlanBonus: {
        create: vi.fn().mockResolvedValue(bonus),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.createBonus({
      dayPlanId: DAY_PLAN_ID,
      accountId: ACCOUNT_ID,
      timeFrom: 1320,
      timeTo: 360,
      calculationType: "per_minute",
      valueMinutes: 15,
    })
    expect(result.id).toBe(BONUS_ID)
    expect(result.timeFrom).toBe(1320)
    expect(result.timeTo).toBe(360)
  })

  it("throws NOT_FOUND when parent day plan missing", async () => {
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.createBonus({
        dayPlanId: DAY_PLAN_ID,
        accountId: ACCOUNT_ID,
        timeFrom: 1320,
        timeTo: 1440,
        calculationType: "per_minute",
        valueMinutes: 15,
      })
    ).rejects.toThrow("Day plan not found")
  })
})

// --- dayPlans.deleteBonus tests ---

describe("dayPlans.deleteBonus", () => {
  it("deletes bonus successfully", async () => {
    const bonus = makeBonus()
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(makeDayPlan()),
      },
      dayPlanBonus: {
        findFirst: vi.fn().mockResolvedValue(bonus),
        delete: vi.fn().mockResolvedValue(bonus),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.deleteBonus({
      dayPlanId: DAY_PLAN_ID,
      bonusId: BONUS_ID,
    })
    expect(result.success).toBe(true)
  })

  it("throws NOT_FOUND when bonus missing", async () => {
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(makeDayPlan()),
      },
      dayPlanBonus: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.deleteBonus({ dayPlanId: DAY_PLAN_ID, bonusId: BONUS_ID })
    ).rejects.toThrow("Bonus not found")
  })

  it("throws NOT_FOUND when parent day plan missing", async () => {
    const mockPrisma = {
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.deleteBonus({ dayPlanId: DAY_PLAN_ID, bonusId: BONUS_ID })
    ).rejects.toThrow("Day plan not found")
  })
})
