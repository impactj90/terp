import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { travelAllowancePreviewRouter } from "../travelAllowancePreview"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"
import { Decimal } from "@prisma/client/runtime/client"

// --- Constants ---

const TRAVEL_ALLOWANCE_MANAGE = permissionIdByKey("travel_allowance.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const RULE_SET_ID = "a0000000-0000-4000-a000-000000000200"

const createCaller = createCallerFactory(travelAllowancePreviewRouter)

// --- Helpers ---

function makeRuleSet() {
  return {
    id: RULE_SET_ID,
    tenantId: TENANT_ID,
    code: "RS-001",
    name: "Standard Rule Set",
    description: null,
    validFrom: null,
    validTo: null,
    calculationBasis: "per_day",
    distanceRule: "longest",
    isActive: true,
    sortOrder: 0,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
  }
}

function makeLocalRule(overrides: Record<string, unknown> = {}) {
  return {
    id: "a0000000-0000-4000-a000-000000000300",
    tenantId: TENANT_ID,
    ruleSetId: RULE_SET_ID,
    minDistanceKm: new Decimal(0),
    maxDistanceKm: new Decimal(50),
    minDurationMinutes: 0,
    maxDurationMinutes: 480,
    taxFreeAmount: new Decimal(10),
    taxableAmount: new Decimal(5),
    isActive: true,
    sortOrder: 0,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

function makeExtendedRule(overrides: Record<string, unknown> = {}) {
  return {
    id: "a0000000-0000-4000-a000-000000000400",
    tenantId: TENANT_ID,
    ruleSetId: RULE_SET_ID,
    arrivalDayTaxFree: new Decimal(14),
    arrivalDayTaxable: new Decimal(8),
    departureDayTaxFree: new Decimal(14),
    departureDayTaxable: new Decimal(8),
    intermediateDayTaxFree: new Decimal(28),
    intermediateDayTaxable: new Decimal(16),
    threeMonthEnabled: true,
    threeMonthTaxFree: new Decimal(20),
    threeMonthTaxable: new Decimal(12),
    isActive: true,
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
    user: createUserWithPermissions([TRAVEL_ALLOWANCE_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

function createNoPermContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- travelAllowancePreview.preview (local) tests ---

describe("travelAllowancePreview.preview (local)", () => {
  it("calculates local travel preview correctly", async () => {
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn().mockResolvedValue(makeRuleSet()),
      },
      localTravelRule: {
        findMany: vi.fn().mockResolvedValue([makeLocalRule()]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.preview({
      ruleSetId: RULE_SET_ID,
      tripType: "local",
      distanceKm: 25,
      durationMinutes: 60,
    })

    expect(result.tripType).toBe("local")
    expect(result.ruleSetId).toBe(RULE_SET_ID)
    expect(result.ruleSetName).toBe("Standard Rule Set")
    expect(result.taxFreeTotal).toBe(10)
    expect(result.taxableTotal).toBe(5)
    expect(result.totalAllowance).toBe(15)
    expect(result.breakdown).toHaveLength(1)
    expect(result.breakdown[0]!.description).toBe("Local travel allowance")
    expect(result.breakdown[0]!.days).toBe(1)
  })

  it("throws NOT_FOUND for invalid ruleSetId", async () => {
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.preview({
        ruleSetId: RULE_SET_ID,
        tripType: "local",
        distanceKm: 25,
      })
    ).rejects.toThrow("Rule set not found")
  })

  it("throws BAD_REQUEST when distanceKm and durationMinutes both 0", async () => {
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn().mockResolvedValue(makeRuleSet()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.preview({
        ruleSetId: RULE_SET_ID,
        tripType: "local",
        distanceKm: 0,
        durationMinutes: 0,
      })
    ).rejects.toThrow(
      "Distance or duration is required for local travel preview"
    )
  })

  it("throws BAD_REQUEST when no matching rule found", async () => {
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn().mockResolvedValue(makeRuleSet()),
      },
      localTravelRule: {
        findMany: vi.fn().mockResolvedValue([
          makeLocalRule({
            minDistanceKm: new Decimal(100),
            maxDistanceKm: new Decimal(200),
          }),
        ]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.preview({
        ruleSetId: RULE_SET_ID,
        tripType: "local",
        distanceKm: 25,
        durationMinutes: 60,
      })
    ).rejects.toThrow("No matching local travel rule found")
  })

  it("filters out inactive rules", async () => {
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn().mockResolvedValue(makeRuleSet()),
      },
      localTravelRule: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.preview({
        ruleSetId: RULE_SET_ID,
        tripType: "local",
        distanceKm: 25,
        durationMinutes: 60,
      })
    ).rejects.toThrow("No matching local travel rule found")

    // Verify the findMany was called with isActive filter
    expect(mockPrisma.localTravelRule.findMany).toHaveBeenCalledWith({
      where: { ruleSetId: RULE_SET_ID, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { minDistanceKm: "asc" }],
    })
  })
})

// --- travelAllowancePreview.preview (extended) tests ---

describe("travelAllowancePreview.preview (extended)", () => {
  it("calculates extended travel breakdown for multi-day trip", async () => {
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn().mockResolvedValue(makeRuleSet()),
      },
      extendedTravelRule: {
        findMany: vi.fn().mockResolvedValue([makeExtendedRule()]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.preview({
      ruleSetId: RULE_SET_ID,
      tripType: "extended",
      startDate: "2025-06-01",
      endDate: "2025-06-05",
    })

    expect(result.tripType).toBe("extended")
    expect(result.ruleSetId).toBe(RULE_SET_ID)
    expect(result.ruleSetName).toBe("Standard Rule Set")
    expect(result.breakdown).toHaveLength(3)
    expect(result.breakdown[0]!.description).toBe("Arrival day")
    expect(result.breakdown[1]!.description).toBe("Intermediate days x3")
    expect(result.breakdown[2]!.description).toBe("Departure day")

    // Total: arrival (14+8) + 3*intermediate (3*28 + 3*16) + departure (14+8) = 176
    expect(result.totalAllowance).toBe(176)
  })

  it("throws NOT_FOUND for invalid ruleSetId", async () => {
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.preview({
        ruleSetId: RULE_SET_ID,
        tripType: "extended",
        startDate: "2025-06-01",
        endDate: "2025-06-05",
      })
    ).rejects.toThrow("Rule set not found")
  })

  it("throws BAD_REQUEST when startDate or endDate missing", async () => {
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn().mockResolvedValue(makeRuleSet()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.preview({
        ruleSetId: RULE_SET_ID,
        tripType: "extended",
      })
    ).rejects.toThrow(
      "Start date and end date are required for extended travel preview"
    )
  })

  it("throws BAD_REQUEST when no active extended rule found", async () => {
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn().mockResolvedValue(makeRuleSet()),
      },
      extendedTravelRule: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.preview({
        ruleSetId: RULE_SET_ID,
        tripType: "extended",
        startDate: "2025-06-01",
        endDate: "2025-06-05",
      })
    ).rejects.toThrow(
      "No active extended travel rule found for this rule set"
    )
  })

  it("applies three-month rule when active and enabled", async () => {
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn().mockResolvedValue(makeRuleSet()),
      },
      extendedTravelRule: {
        findMany: vi.fn().mockResolvedValue([makeExtendedRule()]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.preview({
      ruleSetId: RULE_SET_ID,
      tripType: "extended",
      startDate: "2025-06-01",
      endDate: "2025-06-05",
      threeMonthActive: true,
    })

    expect(result.breakdown[1]!.description).toBe(
      "Intermediate days (three-month rule) x3"
    )
    expect(result.breakdown[1]!.taxFreeAmount).toBe(20)
    expect(result.breakdown[1]!.taxableAmount).toBe(12)
  })
})

// --- Permission tests ---

describe("travelAllowancePreview permission", () => {
  it("throws FORBIDDEN without travel_allowance.manage", async () => {
    const mockPrisma = {
      travelAllowanceRuleSet: {
        findFirst: vi.fn().mockResolvedValue(makeRuleSet()),
      },
    }
    const caller = createCaller(createNoPermContext(mockPrisma))
    await expect(
      caller.preview({
        ruleSetId: RULE_SET_ID,
        tripType: "local",
        distanceKm: 25,
      })
    ).rejects.toThrow("Insufficient permissions")
  })
})
