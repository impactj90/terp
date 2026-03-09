import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { employmentTypesRouter } from "../routers/employmentTypes"
import { permissionIdByKey } from "../lib/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const EMPLOYMENT_TYPES_MANAGE = permissionIdByKey("employment_types.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ET_ID = "a0000000-0000-4000-a000-000000000400"
const ET_B_ID = "a0000000-0000-4000-a000-000000000401"
const VACATION_GROUP_ID = "a0000000-0000-4000-a000-000000000500"

const createCaller = createCallerFactory(employmentTypesRouter)

// --- Helpers ---

function makeEmploymentType(
  overrides: Partial<{
    id: string
    tenantId: string | null
    code: string
    name: string
    weeklyHoursDefault: number
    isActive: boolean
    vacationCalcGroupId: string | null
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: ET_ID,
    tenantId: TENANT_ID,
    code: "FT",
    name: "Full Time",
    weeklyHoursDefault: 40.0,
    isActive: true,
    vacationCalcGroupId: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([EMPLOYMENT_TYPES_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- employmentTypes.list tests ---

describe("employmentTypes.list", () => {
  it("returns employment types for tenant", async () => {
    const ets = [
      makeEmploymentType({ id: ET_ID, code: "FT", name: "Full Time" }),
      makeEmploymentType({ id: ET_B_ID, code: "PT", name: "Part Time" }),
    ]
    const mockPrisma = {
      employmentType: {
        findMany: vi.fn().mockResolvedValue(ets),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toHaveLength(2)
    expect(result.data[0]!.code).toBe("FT")
    expect(mockPrisma.employmentType.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID },
      orderBy: { code: "asc" },
    })
  })

  it("filters by isActive when provided", async () => {
    const mockPrisma = {
      employmentType: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ isActive: true })
    expect(mockPrisma.employmentType.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, isActive: true },
      orderBy: { code: "asc" },
    })
  })

  it("returns empty array when no employment types", async () => {
    const mockPrisma = {
      employmentType: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toEqual([])
  })
})

// --- employmentTypes.getById tests ---

describe("employmentTypes.getById", () => {
  it("returns employment type when found", async () => {
    const et = makeEmploymentType()
    const mockPrisma = {
      employmentType: {
        findFirst: vi.fn().mockResolvedValue(et),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: ET_ID })
    expect(result.id).toBe(ET_ID)
    expect(result.code).toBe("FT")
  })

  it("throws NOT_FOUND for missing employment type", async () => {
    const mockPrisma = {
      employmentType: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: ET_ID })).rejects.toThrow(
      "Employment type not found"
    )
  })
})

// --- employmentTypes.create tests ---

describe("employmentTypes.create", () => {
  it("creates employment type successfully", async () => {
    const created = makeEmploymentType()
    const mockPrisma = {
      employmentType: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({ code: "FT", name: "Full Time" })
    expect(result.code).toBe("FT")
    expect(mockPrisma.employmentType.create).toHaveBeenCalled()
  })

  it("trims whitespace from code and name", async () => {
    const created = makeEmploymentType()
    const mockPrisma = {
      employmentType: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      code: "  FT  ",
      name: "  Full Time  ",
    })
    const createCall = mockPrisma.employmentType.create.mock.calls[0]![0]
    expect(createCall.data.code).toBe("FT")
    expect(createCall.data.name).toBe("Full Time")
  })

  it("rejects duplicate code with CONFLICT", async () => {
    const mockPrisma = {
      employmentType: {
        findFirst: vi.fn().mockResolvedValue(makeEmploymentType()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "FT", name: "Full Time" })
    ).rejects.toThrow("Employment type code already exists")
  })

  it("sets isActive true and weeklyHoursDefault 40 by default", async () => {
    const created = makeEmploymentType({ isActive: true, weeklyHoursDefault: 40 })
    const mockPrisma = {
      employmentType: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({ code: "FT", name: "Full Time" })
    const createCall = mockPrisma.employmentType.create.mock.calls[0]![0]
    expect(createCall.data.isActive).toBe(true)
    expect(Number(createCall.data.weeklyHoursDefault)).toBe(40)
  })

  it("accepts custom weeklyHoursDefault", async () => {
    const created = makeEmploymentType({ weeklyHoursDefault: 20 })
    const mockPrisma = {
      employmentType: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "PT",
      name: "Part Time",
      weeklyHoursDefault: 20,
    })
    expect(result.weeklyHoursDefault).toBe(20)
    const createCall = mockPrisma.employmentType.create.mock.calls[0]![0]
    expect(Number(createCall.data.weeklyHoursDefault)).toBe(20)
  })

  it("accepts vacationCalcGroupId", async () => {
    const created = makeEmploymentType({ vacationCalcGroupId: VACATION_GROUP_ID })
    const mockPrisma = {
      employmentType: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "FT",
      name: "Full Time",
      vacationCalcGroupId: VACATION_GROUP_ID,
    })
    expect(result.vacationCalcGroupId).toBe(VACATION_GROUP_ID)
  })
})

// --- employmentTypes.update tests ---

describe("employmentTypes.update", () => {
  it("updates name successfully", async () => {
    const existing = makeEmploymentType()
    const updated = makeEmploymentType({ name: "Updated" })
    const mockPrisma = {
      employmentType: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: ET_ID, name: "Updated" })
    expect(result.name).toBe("Updated")
  })

  it("rejects empty name with BAD_REQUEST", async () => {
    const existing = makeEmploymentType()
    const mockPrisma = {
      employmentType: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: ET_ID, name: "   " })
    ).rejects.toThrow("Employment type name is required")
  })

  it("rejects empty code with BAD_REQUEST", async () => {
    const existing = makeEmploymentType()
    const mockPrisma = {
      employmentType: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: ET_ID, code: "   " })
    ).rejects.toThrow("Employment type code is required")
  })

  it("rejects duplicate code with CONFLICT", async () => {
    const existing = makeEmploymentType({ code: "OLD" })
    const conflicting = makeEmploymentType({ id: ET_B_ID, code: "NEW" })
    const mockPrisma = {
      employmentType: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(conflicting),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: ET_ID, code: "NEW" })
    ).rejects.toThrow("Employment type code already exists")
  })

  it("allows updating to same code (no false conflict)", async () => {
    const existing = makeEmploymentType({ code: "FT" })
    const updated = makeEmploymentType({ code: "FT" })
    const mockPrisma = {
      employmentType: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: ET_ID, code: "FT" })
    expect(result.code).toBe("FT")
    expect(mockPrisma.employmentType.findFirst).toHaveBeenCalledTimes(1)
  })

  it("throws NOT_FOUND for missing employment type", async () => {
    const mockPrisma = {
      employmentType: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: ET_ID, name: "Updated" })
    ).rejects.toThrow("Employment type not found")
  })

  it("clears vacationCalcGroupId with clearVacationCalcGroupId flag", async () => {
    const existing = makeEmploymentType({
      vacationCalcGroupId: VACATION_GROUP_ID,
    })
    const updated = makeEmploymentType({ vacationCalcGroupId: null })
    const mockPrisma = {
      employmentType: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: ET_ID,
      clearVacationCalcGroupId: true,
    })
    expect(result.vacationCalcGroupId).toBeNull()
    const updateCall = mockPrisma.employmentType.update.mock.calls[0]![0]
    expect(updateCall.data.vacationCalcGroupId).toBeNull()
  })

  it("updates weeklyHoursDefault correctly", async () => {
    const existing = makeEmploymentType({ weeklyHoursDefault: 40 })
    const updated = makeEmploymentType({ weeklyHoursDefault: 30.5 })
    const mockPrisma = {
      employmentType: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: ET_ID,
      weeklyHoursDefault: 30.5,
    })
    expect(result.weeklyHoursDefault).toBe(30.5)
  })
})

// --- employmentTypes.delete tests ---

describe("employmentTypes.delete", () => {
  it("deletes employment type successfully", async () => {
    const existing = makeEmploymentType()
    const mockPrisma = {
      employmentType: {
        findFirst: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(existing),
      },
      employee: {
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: ET_ID })
    expect(result.success).toBe(true)
    expect(mockPrisma.employmentType.delete).toHaveBeenCalledWith({
      where: { id: ET_ID },
    })
  })

  it("throws NOT_FOUND for missing employment type", async () => {
    const mockPrisma = {
      employmentType: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: ET_ID })).rejects.toThrow(
      "Employment type not found"
    )
  })

  it("rejects deletion when employees are assigned", async () => {
    const existing = makeEmploymentType()
    const mockPrisma = {
      employmentType: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
      employee: {
        count: vi.fn().mockResolvedValue(3),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: ET_ID })).rejects.toThrow(
      "Cannot delete employment type with assigned employees"
    )
  })
})
