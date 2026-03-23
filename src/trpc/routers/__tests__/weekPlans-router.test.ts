import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { weekPlansRouter } from "../weekPlans"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"
import * as weekPlanService from "@/lib/services/week-plan-service"

vi.mock("@/lib/services/week-plan-service", () => ({
  update: vi.fn(),
  remove: vi.fn(),
  WeekPlanNotFoundError: class WeekPlanNotFoundError extends Error {
    constructor(message = "Week plan not found") {
      super(message)
      this.name = "WeekPlanNotFoundError"
    }
  },
  WeekPlanValidationError: class WeekPlanValidationError extends Error {
    constructor(message: string) {
      super(message)
      this.name = "WeekPlanValidationError"
    }
  },
  WeekPlanConflictError: class WeekPlanConflictError extends Error {
    constructor(message: string) {
      super(message)
      this.name = "WeekPlanConflictError"
    }
  },
}))
vi.mock("@/lib/services/audit-logs-service", () => ({
  log: vi.fn().mockResolvedValue(undefined),
  computeChanges: vi.fn().mockReturnValue(null),
}))

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
        findUnique: vi.fn().mockResolvedValue(created),
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
        findUnique: vi.fn().mockResolvedValue(created),
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
    const updated = makeWeekPlan({ name: "Updated" })
    vi.mocked(weekPlanService.update).mockResolvedValue(updated as ReturnType<typeof makeWeekPlan>)
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: WEEK_PLAN_ID, name: "Updated" })
    expect(result.name).toBe("Updated")
    expect(weekPlanService.update).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      expect.objectContaining({ id: WEEK_PLAN_ID, name: "Updated" }),
      expect.objectContaining({ userId: expect.any(String) })
    )
  })

  it("rejects duplicate code with CONFLICT", async () => {
    vi.mocked(weekPlanService.update).mockRejectedValue(
      new weekPlanService.WeekPlanConflictError("Week plan code already exists")
    )
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: WEEK_PLAN_ID, code: "NEW" })
    ).rejects.toThrow("Week plan code already exists")
  })

  it("allows same code (no false conflict)", async () => {
    vi.mocked(weekPlanService.update).mockClear()
    const updated = makeWeekPlan({ code: "WEEK-1" })
    vi.mocked(weekPlanService.update).mockResolvedValue(updated as ReturnType<typeof makeWeekPlan>)
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: WEEK_PLAN_ID, code: "WEEK-1" })
    expect(result.code).toBe("WEEK-1")
    expect(weekPlanService.update).toHaveBeenCalledTimes(1)
  })

  it("throws NOT_FOUND for missing week plan", async () => {
    vi.mocked(weekPlanService.update).mockRejectedValue(
      new weekPlanService.WeekPlanNotFoundError()
    )
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: WEEK_PLAN_ID, name: "Updated" })
    ).rejects.toThrow("Week plan not found")
  })

  it("verifies completeness after update (all 7 days must have plans)", async () => {
    vi.mocked(weekPlanService.update).mockRejectedValue(
      new weekPlanService.WeekPlanValidationError(
        "Week plan must have a day plan assigned for all 7 days"
      )
    )
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: WEEK_PLAN_ID, mondayDayPlanId: null })
    ).rejects.toThrow(
      "Week plan must have a day plan assigned for all 7 days"
    )
  })

  it("validates day plan IDs when changed", async () => {
    vi.mocked(weekPlanService.update).mockRejectedValue(
      new weekPlanService.WeekPlanValidationError("Invalid day plan reference")
    )
    const mockPrisma = {}
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
    vi.mocked(weekPlanService.remove).mockResolvedValue(undefined)
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: WEEK_PLAN_ID })
    expect(result.success).toBe(true)
    expect(weekPlanService.remove).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      WEEK_PLAN_ID,
      expect.objectContaining({ userId: expect.any(String) })
    )
  })

  it("throws NOT_FOUND for missing week plan", async () => {
    vi.mocked(weekPlanService.remove).mockRejectedValue(
      new weekPlanService.WeekPlanNotFoundError()
    )
    const mockPrisma = {}
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: WEEK_PLAN_ID })).rejects.toThrow(
      "Week plan not found"
    )
  })
})
