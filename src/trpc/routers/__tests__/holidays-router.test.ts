import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { holidaysRouter } from "../holidays"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const HOLIDAYS_MANAGE = permissionIdByKey("holidays.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const HOLIDAY_ID = "a0000000-0000-4000-a000-000000000700"
const HOLIDAY_B_ID = "a0000000-0000-4000-a000-000000000701"
const DEPT_ID = "a0000000-0000-4000-a000-000000000800"

const createCaller = createCallerFactory(holidaysRouter)

// --- Helpers ---

function makeHoliday(
  overrides: Partial<{
    id: string
    tenantId: string
    holidayDate: Date
    name: string
    holidayCategory: number
    appliesToAll: boolean
    departmentId: string | null
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: HOLIDAY_ID,
    tenantId: TENANT_ID,
    holidayDate: new Date(Date.UTC(2026, 0, 1)),
    name: "Neujahr",
    holidayCategory: 1,
    appliesToAll: true,
    departmentId: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([HOLIDAYS_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- holidays.list tests ---

describe("holidays.list", () => {
  it("returns holidays for tenant", async () => {
    const holidays = [
      makeHoliday({ id: HOLIDAY_ID, name: "Neujahr" }),
      makeHoliday({
        id: HOLIDAY_B_ID,
        name: "Karfreitag",
        holidayDate: new Date(Date.UTC(2026, 3, 3)),
      }),
    ]
    const mockPrisma = {
      holiday: {
        findMany: vi.fn().mockResolvedValue(holidays),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toHaveLength(2)
  })

  it("filters by year when provided", async () => {
    const mockPrisma = {
      holiday: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ year: 2026 })
    expect(mockPrisma.holiday.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT_ID,
        holidayDate: {
          gte: new Date(Date.UTC(2026, 0, 1)),
          lt: new Date(Date.UTC(2027, 0, 1)),
        },
      },
      orderBy: { holidayDate: "asc" },
    })
  })

  it("returns empty array when no holidays", async () => {
    const mockPrisma = {
      holiday: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toEqual([])
  })
})

// --- holidays.getById tests ---

describe("holidays.getById", () => {
  it("returns holiday when found", async () => {
    const holiday = makeHoliday()
    const mockPrisma = {
      holiday: {
        findFirst: vi.fn().mockResolvedValue(holiday),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: HOLIDAY_ID })
    expect(result.id).toBe(HOLIDAY_ID)
    expect(result.name).toBe("Neujahr")
  })

  it("throws NOT_FOUND for missing holiday", async () => {
    const mockPrisma = {
      holiday: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: HOLIDAY_ID })).rejects.toThrow(
      "Holiday not found"
    )
  })
})

// --- holidays.create tests ---

describe("holidays.create", () => {
  it("creates holiday successfully", async () => {
    const created = makeHoliday()
    const mockPrisma = {
      holiday: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      holidayDate: "2026-01-01",
      name: "Neujahr",
      holidayCategory: 1,
    })
    expect(result.name).toBe("Neujahr")
  })

  it("trims name", async () => {
    const created = makeHoliday()
    const mockPrisma = {
      holiday: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      holidayDate: "2026-01-01",
      name: "  Neujahr  ",
      holidayCategory: 1,
    })
    const createCall = mockPrisma.holiday.create.mock.calls[0]![0]
    expect(createCall.data.name).toBe("Neujahr")
  })

  it("rejects duplicate date with CONFLICT", async () => {
    const mockPrisma = {
      holiday: {
        findFirst: vi.fn().mockResolvedValue(makeHoliday()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        holidayDate: "2026-01-01",
        name: "Neujahr",
        holidayCategory: 1,
      })
    ).rejects.toThrow("Holiday already exists on this date")
  })

  it("sets defaults for appliesToAll and departmentId", async () => {
    const created = makeHoliday()
    const mockPrisma = {
      holiday: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      holidayDate: "2026-01-01",
      name: "Neujahr",
      holidayCategory: 1,
    })
    const createCall = mockPrisma.holiday.create.mock.calls[0]![0]
    expect(createCall.data.appliesToAll).toBe(true)
    expect(createCall.data.departmentId).toBeNull()
  })
})

// --- holidays.update tests ---

describe("holidays.update", () => {
  it("updates name successfully", async () => {
    const existing = makeHoliday()
    const updated = makeHoliday({ name: "Updated" })
    const mockPrisma = {
      holiday: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: HOLIDAY_ID, name: "Updated" })
    expect(result.name).toBe("Updated")
  })

  it("rejects empty name with BAD_REQUEST", async () => {
    const existing = makeHoliday()
    const mockPrisma = {
      holiday: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: HOLIDAY_ID, name: "   " })
    ).rejects.toThrow("Holiday name is required")
  })

  it("throws NOT_FOUND for missing holiday", async () => {
    const mockPrisma = {
      holiday: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: HOLIDAY_ID, name: "Updated" })
    ).rejects.toThrow("Holiday not found")
  })
})

// --- holidays.delete tests ---

describe("holidays.delete", () => {
  it("deletes holiday successfully", async () => {
    const existing = makeHoliday()
    const mockPrisma = {
      holiday: {
        findFirst: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: HOLIDAY_ID })
    expect(result.success).toBe(true)
  })

  it("throws NOT_FOUND for missing holiday", async () => {
    const mockPrisma = {
      holiday: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: HOLIDAY_ID })).rejects.toThrow(
      "Holiday not found"
    )
  })
})

// --- holidays.generate tests ---

describe("holidays.generate", () => {
  function makeGeneratedId(n: number): string {
    return `a0000000-0000-4000-a000-${String(n).padStart(12, "0")}`
  }

  it("generates holidays for BY 2026", async () => {
    // Generate service: findMany (existing) -> createMany -> findMany (created)
    const generatedHolidays = Array.from({ length: 13 }, (_, i) => ({
      id: makeGeneratedId(i + 1),
      tenantId: TENANT_ID,
      holidayDate: new Date(Date.UTC(2026, i % 12, 1)),
      name: `Holiday ${i + 1}`,
      holidayCategory: 1,
      appliesToAll: true,
      departmentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
    const mockPrisma = {
      holiday: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([]) // no existing
          .mockResolvedValueOnce(generatedHolidays), // created records
        createMany: vi.fn().mockResolvedValue({ count: 13 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.generate({
      year: 2026,
      state: "BY",
    })
    // Bayern has 13 holidays
    expect(result.created).toHaveLength(13)
    expect(result.created[0]!.holidayCategory).toBe(1)
    expect(result.created[0]!.appliesToAll).toBe(true)
  })

  it("skips existing holidays when skipExisting is true", async () => {
    const existingHoliday = makeHoliday({
      holidayDate: new Date(Date.UTC(2026, 0, 1)),
    })
    // Generate service: findMany (existing) -> createMany -> findMany (created)
    const generatedHolidays = Array.from({ length: 12 }, (_, i) => ({
      id: makeGeneratedId(i + 1),
      tenantId: TENANT_ID,
      holidayDate: new Date(Date.UTC(2026, i + 1, 1)),
      name: `Holiday ${i + 1}`,
      holidayCategory: 1,
      appliesToAll: true,
      departmentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
    const mockPrisma = {
      holiday: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([existingHoliday]) // existing holidays
          .mockResolvedValueOnce(generatedHolidays), // created records (12, Jan 1 skipped)
        createMany: vi.fn().mockResolvedValue({ count: 12 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.generate({
      year: 2026,
      state: "BY",
      skipExisting: true,
    })
    // Should skip Neujahr (Jan 1) since it exists
    expect(result.created).toHaveLength(12)
    const names = result.created.map((h) => h.name)
    expect(names).not.toContain("Neujahr")
  })

  it("rejects invalid state code", async () => {
    const mockPrisma = {
      holiday: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.generate({ year: 2026, state: "XX" })
    ).rejects.toThrow("Invalid state code")
  })
})

// --- holidays.copy tests ---

describe("holidays.copy", () => {
  function makeCopyId(n: number): string {
    return `b0000000-0000-4000-a000-${String(n).padStart(12, "0")}`
  }

  it("copies holidays from source to target year", async () => {
    const sourceHolidays = [
      makeHoliday({
        id: HOLIDAY_ID,
        holidayDate: new Date(Date.UTC(2026, 0, 1)),
        name: "Neujahr",
      }),
      makeHoliday({
        id: HOLIDAY_B_ID,
        holidayDate: new Date(Date.UTC(2026, 11, 25)),
        name: "1. Weihnachtstag",
      }),
    ]
    const copiedHolidays = [
      makeHoliday({
        id: makeCopyId(1),
        holidayDate: new Date(Date.UTC(2027, 0, 1)),
        name: "Neujahr",
      }),
      makeHoliday({
        id: makeCopyId(2),
        holidayDate: new Date(Date.UTC(2027, 11, 25)),
        name: "1. Weihnachtstag",
      }),
    ]
    const mockPrisma = {
      holiday: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce(sourceHolidays) // source year
          .mockResolvedValueOnce([]) // target year (empty)
          .mockResolvedValueOnce(copiedHolidays), // created records
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.copy({
      sourceYear: 2026,
      targetYear: 2027,
    })
    expect(result.copied).toHaveLength(2)
    // Verify dates are in target year
    for (const h of result.copied) {
      expect(h.holidayDate.getUTCFullYear()).toBe(2027)
    }
  })

  it("applies category overrides", async () => {
    const sourceHolidays = [
      makeHoliday({
        holidayDate: new Date(Date.UTC(2026, 0, 1)),
        name: "Neujahr",
        holidayCategory: 1,
      }),
    ]
    const copiedHolidays = [
      makeHoliday({
        id: makeCopyId(1),
        holidayDate: new Date(Date.UTC(2027, 0, 1)),
        name: "Neujahr",
        holidayCategory: 3,
      }),
    ]
    const mockPrisma = {
      holiday: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce(sourceHolidays)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce(copiedHolidays),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.copy({
      sourceYear: 2026,
      targetYear: 2027,
      categoryOverrides: [{ month: 1, day: 1, category: 3 }],
    })
    expect(result.copied).toHaveLength(1)
    expect(result.copied[0]!.holidayCategory).toBe(3)
  })

  it("skips Feb 29 in non-leap target year", async () => {
    const sourceHolidays = [
      makeHoliday({
        holidayDate: new Date(Date.UTC(2024, 1, 29)), // Feb 29, 2024 (leap year)
        name: "Leap Day",
      }),
    ]
    const mockPrisma = {
      holiday: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce(sourceHolidays)
          .mockResolvedValueOnce([]),
        createMany: vi.fn(),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.copy({
      sourceYear: 2024,
      targetYear: 2025, // Not a leap year
    })
    expect(result.copied).toHaveLength(0)
    expect(mockPrisma.holiday.createMany).not.toHaveBeenCalled()
  })

  it("skips existing when skipExisting is true", async () => {
    const sourceHolidays = [
      makeHoliday({
        holidayDate: new Date(Date.UTC(2026, 0, 1)),
        name: "Neujahr",
      }),
    ]
    const targetExisting = [
      makeHoliday({
        holidayDate: new Date(Date.UTC(2027, 0, 1)),
        name: "Neujahr",
      }),
    ]
    const mockPrisma = {
      holiday: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce(sourceHolidays)
          .mockResolvedValueOnce(targetExisting),
        createMany: vi.fn(),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.copy({
      sourceYear: 2026,
      targetYear: 2027,
      skipExisting: true,
    })
    expect(result.copied).toHaveLength(0)
    expect(mockPrisma.holiday.createMany).not.toHaveBeenCalled()
  })

  it("rejects same year with BAD_REQUEST", async () => {
    const mockPrisma = {
      holiday: {
        findMany: vi.fn(),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.copy({ sourceYear: 2026, targetYear: 2026 })
    ).rejects.toThrow("Source and target year must differ")
  })

  it("rejects empty source year", async () => {
    const mockPrisma = {
      holiday: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.copy({ sourceYear: 2026, targetYear: 2027 })
    ).rejects.toThrow("No holidays found for source year")
  })

  it("preserves departmentId from source", async () => {
    const sourceHolidays = [
      makeHoliday({
        holidayDate: new Date(Date.UTC(2026, 0, 1)),
        name: "Neujahr",
        departmentId: DEPT_ID,
      }),
    ]
    const copiedHolidays = [
      makeHoliday({
        id: makeCopyId(1),
        holidayDate: new Date(Date.UTC(2027, 0, 1)),
        name: "Neujahr",
        departmentId: DEPT_ID,
      }),
    ]
    const mockPrisma = {
      holiday: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce(sourceHolidays)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce(copiedHolidays),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.copy({
      sourceYear: 2026,
      targetYear: 2027,
    })
    expect(result.copied[0]!.departmentId).toBe(DEPT_ID)
  })
})
