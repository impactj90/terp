import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { weekPlansRouter } from "../routers/weekPlans"
import { permissionIdByKey } from "../lib/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const WEEK_PLANS_MANAGE = permissionIdByKey("week_plans.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const WEEK_PLAN_ID = "a0000000-0000-4000-a000-000000001000"
const WEEK_PLAN_B_ID = "a0000000-0000-4000-a000-000000001001"
const DAY_PLAN_MON_ID = "a0000000-0000-4000-a000-000000000710"
const DAY_PLAN_TUE_ID = "a0000000-0000-4000-a000-000000000711"
const DAY_PLAN_WED_ID = "a0000000-0000-4000-a000-000000000712"
const DAY_PLAN_THU_ID = "a0000000-0000-4000-a000-000000000713"
const DAY_PLAN_FRI_ID = "a0000000-0000-4000-a000-000000000714"
const DAY_PLAN_SAT_ID = "a0000000-0000-4000-a000-000000000715"
const DAY_PLAN_SUN_ID = "a0000000-0000-4000-a000-000000000716"

const createCaller = createCallerFactory(weekPlansRouter)

// --- Helpers ---

function makeDayPlanSummary(overrides: Record<string, unknown> = {}) {
  return {
    id: DAY_PLAN_MON_ID,
    code: "STD-1",
    name: "Standard Day",
    planType: "fixed",
    ...overrides,
  }
}

function makeWeekPlan(overrides: Record<string, unknown> = {}) {
  return {
    id: WEEK_PLAN_ID,
    tenantId: TENANT_ID,
    code: "WEEK-1",
    name: "Standard Week",
    description: null,
    mondayDayPlanId: DAY_PLAN_MON_ID,
    tuesdayDayPlanId: DAY_PLAN_TUE_ID,
    wednesdayDayPlanId: DAY_PLAN_WED_ID,
    thursdayDayPlanId: DAY_PLAN_THU_ID,
    fridayDayPlanId: DAY_PLAN_FRI_ID,
    saturdayDayPlanId: DAY_PLAN_SAT_ID,
    sundayDayPlanId: DAY_PLAN_SUN_ID,
    mondayDayPlan: makeDayPlanSummary({ id: DAY_PLAN_MON_ID }),
    tuesdayDayPlan: makeDayPlanSummary({ id: DAY_PLAN_TUE_ID }),
    wednesdayDayPlan: makeDayPlanSummary({ id: DAY_PLAN_WED_ID }),
    thursdayDayPlan: makeDayPlanSummary({ id: DAY_PLAN_THU_ID }),
    fridayDayPlan: makeDayPlanSummary({ id: DAY_PLAN_FRI_ID }),
    saturdayDayPlan: makeDayPlanSummary({ id: DAY_PLAN_SAT_ID }),
    sundayDayPlan: makeDayPlanSummary({ id: DAY_PLAN_SUN_ID }),
    isActive: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([WEEK_PLANS_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- weekPlans.list tests ---

describe("weekPlans.list", () => {
  it("returns week plans with day plan summaries", async () => {
    const plans = [
      makeWeekPlan({ id: WEEK_PLAN_ID, code: "WEEK-1" }),
      makeWeekPlan({ id: WEEK_PLAN_B_ID, code: "WEEK-2" }),
    ]
    const mockPrisma = {
      weekPlan: {
        findMany: vi.fn().mockResolvedValue(plans),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toHaveLength(2)
    expect(result.data[0]!.mondayDayPlan).toBeTruthy()
    expect(result.data[0]!.mondayDayPlan!.code).toBe("STD-1")
  })

  it("filters by isActive", async () => {
    const mockPrisma = {
      weekPlan: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ isActive: true })
    expect(mockPrisma.weekPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_ID, isActive: true },
      })
    )
  })

  it("returns empty array", async () => {
    const mockPrisma = {
      weekPlan: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toEqual([])
  })
})

// --- weekPlans.getById tests ---

describe("weekPlans.getById", () => {
  it("returns week plan with 7 day plan relations", async () => {
    const plan = makeWeekPlan()
    const mockPrisma = {
      weekPlan: {
        findFirst: vi.fn().mockResolvedValue(plan),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: WEEK_PLAN_ID })
    expect(result.id).toBe(WEEK_PLAN_ID)
    expect(result.mondayDayPlan).toBeTruthy()
    expect(result.sundayDayPlan).toBeTruthy()
  })

  it("throws NOT_FOUND for missing week plan", async () => {
    const mockPrisma = {
      weekPlan: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: WEEK_PLAN_ID })).rejects.toThrow(
      "Week plan not found"
    )
  })
})

// --- weekPlans.create tests ---

describe("weekPlans.create", () => {
  it("creates week plan with all 7 day plans", async () => {
    const created = makeWeekPlan()
    const mockPrisma = {
      weekPlan: {
        findFirst: vi.fn().mockResolvedValue(null), // code uniqueness
        create: vi.fn().mockResolvedValue(created),
        findUniqueOrThrow: vi.fn().mockResolvedValue(created),
      },
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue({ id: "exists" }), // all 7 validations pass
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "WEEK-1",
      name: "Standard Week",
      mondayDayPlanId: DAY_PLAN_MON_ID,
      tuesdayDayPlanId: DAY_PLAN_TUE_ID,
      wednesdayDayPlanId: DAY_PLAN_WED_ID,
      thursdayDayPlanId: DAY_PLAN_THU_ID,
      fridayDayPlanId: DAY_PLAN_FRI_ID,
      saturdayDayPlanId: DAY_PLAN_SAT_ID,
      sundayDayPlanId: DAY_PLAN_SUN_ID,
    })
    expect(result.code).toBe("WEEK-1")
    expect(result.mondayDayPlanId).toBe(DAY_PLAN_MON_ID)
  })

  it("trims whitespace on code, name", async () => {
    const created = makeWeekPlan()
    const mockPrisma = {
      weekPlan: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
        findUniqueOrThrow: vi.fn().mockResolvedValue(created),
      },
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue({ id: "exists" }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      code: "  WEEK-1  ",
      name: "  Standard Week  ",
      mondayDayPlanId: DAY_PLAN_MON_ID,
      tuesdayDayPlanId: DAY_PLAN_TUE_ID,
      wednesdayDayPlanId: DAY_PLAN_WED_ID,
      thursdayDayPlanId: DAY_PLAN_THU_ID,
      fridayDayPlanId: DAY_PLAN_FRI_ID,
      saturdayDayPlanId: DAY_PLAN_SAT_ID,
      sundayDayPlanId: DAY_PLAN_SUN_ID,
    })
    const createCall = mockPrisma.weekPlan.create.mock.calls[0]![0]
    expect(createCall.data.code).toBe("WEEK-1")
    expect(createCall.data.name).toBe("Standard Week")
  })

  it("rejects empty code", async () => {
    const mockPrisma = { weekPlan: {}, dayPlan: {} }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        code: "   ",
        name: "Week",
        mondayDayPlanId: DAY_PLAN_MON_ID,
        tuesdayDayPlanId: DAY_PLAN_TUE_ID,
        wednesdayDayPlanId: DAY_PLAN_WED_ID,
        thursdayDayPlanId: DAY_PLAN_THU_ID,
        fridayDayPlanId: DAY_PLAN_FRI_ID,
        saturdayDayPlanId: DAY_PLAN_SAT_ID,
        sundayDayPlanId: DAY_PLAN_SUN_ID,
      })
    ).rejects.toThrow("Week plan code is required")
  })

  it("rejects empty name", async () => {
    const mockPrisma = { weekPlan: {}, dayPlan: {} }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        code: "WEEK-1",
        name: "   ",
        mondayDayPlanId: DAY_PLAN_MON_ID,
        tuesdayDayPlanId: DAY_PLAN_TUE_ID,
        wednesdayDayPlanId: DAY_PLAN_WED_ID,
        thursdayDayPlanId: DAY_PLAN_THU_ID,
        fridayDayPlanId: DAY_PLAN_FRI_ID,
        saturdayDayPlanId: DAY_PLAN_SAT_ID,
        sundayDayPlanId: DAY_PLAN_SUN_ID,
      })
    ).rejects.toThrow("Week plan name is required")
  })

  it("rejects duplicate code with CONFLICT", async () => {
    const mockPrisma = {
      weekPlan: {
        findFirst: vi.fn().mockResolvedValue(makeWeekPlan()),
      },
      dayPlan: {},
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        code: "WEEK-1",
        name: "Week",
        mondayDayPlanId: DAY_PLAN_MON_ID,
        tuesdayDayPlanId: DAY_PLAN_TUE_ID,
        wednesdayDayPlanId: DAY_PLAN_WED_ID,
        thursdayDayPlanId: DAY_PLAN_THU_ID,
        fridayDayPlanId: DAY_PLAN_FRI_ID,
        saturdayDayPlanId: DAY_PLAN_SAT_ID,
        sundayDayPlanId: DAY_PLAN_SUN_ID,
      })
    ).rejects.toThrow("Week plan code already exists")
  })

  it("rejects when a referenced day plan does not exist (BAD_REQUEST)", async () => {
    const mockPrisma = {
      weekPlan: {
        findFirst: vi.fn().mockResolvedValue(null), // code uniqueness passes
      },
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(null), // validation fails
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        code: "WEEK-1",
        name: "Week",
        mondayDayPlanId: DAY_PLAN_MON_ID,
        tuesdayDayPlanId: DAY_PLAN_TUE_ID,
        wednesdayDayPlanId: DAY_PLAN_WED_ID,
        thursdayDayPlanId: DAY_PLAN_THU_ID,
        fridayDayPlanId: DAY_PLAN_FRI_ID,
        saturdayDayPlanId: DAY_PLAN_SAT_ID,
        sundayDayPlanId: DAY_PLAN_SUN_ID,
      })
    ).rejects.toThrow("Invalid day plan reference")
  })
})

// --- weekPlans.update tests ---

describe("weekPlans.update", () => {
  it("updates partial fields successfully", async () => {
    const existing = makeWeekPlan()
    const updated = makeWeekPlan({ name: "Updated" })
    const mockPrisma = {
      weekPlan: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
        findUniqueOrThrow: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: WEEK_PLAN_ID, name: "Updated" })
    expect(result.name).toBe("Updated")
  })

  it("rejects duplicate code with CONFLICT", async () => {
    const existing = makeWeekPlan({ code: "OLD" })
    const conflicting = makeWeekPlan({ id: WEEK_PLAN_B_ID, code: "NEW" })
    const mockPrisma = {
      weekPlan: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(conflicting),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: WEEK_PLAN_ID, code: "NEW" })
    ).rejects.toThrow("Week plan code already exists")
  })

  it("allows same code (no false conflict)", async () => {
    const existing = makeWeekPlan({ code: "WEEK-1" })
    const updated = makeWeekPlan({ code: "WEEK-1" })
    const mockPrisma = {
      weekPlan: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
        findUniqueOrThrow: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: WEEK_PLAN_ID, code: "WEEK-1" })
    expect(result.code).toBe("WEEK-1")
    expect(mockPrisma.weekPlan.findFirst).toHaveBeenCalledTimes(1)
  })

  it("throws NOT_FOUND for missing week plan", async () => {
    const mockPrisma = {
      weekPlan: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: WEEK_PLAN_ID, name: "Updated" })
    ).rejects.toThrow("Week plan not found")
  })

  it("verifies completeness after update (all 7 days must have plans)", async () => {
    const existing = makeWeekPlan()
    const incompleteUpdated = makeWeekPlan({ mondayDayPlanId: null, mondayDayPlan: null })
    const mockPrisma = {
      weekPlan: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(incompleteUpdated),
        findUniqueOrThrow: vi.fn().mockResolvedValue(incompleteUpdated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: WEEK_PLAN_ID, mondayDayPlanId: null })
    ).rejects.toThrow(
      "Week plan must have a day plan assigned for all 7 days"
    )
  })

  it("validates day plan IDs when changed", async () => {
    const existing = makeWeekPlan()
    const mockPrisma = {
      weekPlan: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
      dayPlan: {
        findFirst: vi.fn().mockResolvedValue(null), // day plan not found
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({
        id: WEEK_PLAN_ID,
        mondayDayPlanId: "a0000000-0000-4000-a000-000000099999",
      })
    ).rejects.toThrow("Invalid day plan reference")
  })
})

// --- weekPlans.delete tests ---

describe("weekPlans.delete", () => {
  it("deletes week plan successfully", async () => {
    const existing = makeWeekPlan()
    const mockPrisma = {
      weekPlan: {
        findFirst: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: WEEK_PLAN_ID })
    expect(result.success).toBe(true)
    expect(mockPrisma.weekPlan.delete).toHaveBeenCalledWith({
      where: { id: WEEK_PLAN_ID },
    })
  })

  it("throws NOT_FOUND for missing week plan", async () => {
    const mockPrisma = {
      weekPlan: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: WEEK_PLAN_ID })).rejects.toThrow(
      "Week plan not found"
    )
  })
})
