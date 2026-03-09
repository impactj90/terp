import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { activitiesRouter } from "../activities"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const ACTIVITIES_MANAGE = permissionIdByKey("activities.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ACTIVITY_ID = "a0000000-0000-4000-a000-000000000500"
const ACTIVITY_B_ID = "a0000000-0000-4000-a000-000000000501"

const createCaller = createCallerFactory(activitiesRouter)

// --- Helpers ---

function makeActivity(
  overrides: Partial<{
    id: string
    tenantId: string
    code: string
    name: string
    description: string | null
    isActive: boolean
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: ACTIVITY_ID,
    tenantId: TENANT_ID,
    code: "ACT001",
    name: "Development",
    description: null,
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
    user: createUserWithPermissions([ACTIVITIES_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- activities.list tests ---

describe("activities.list", () => {
  it("returns activities for tenant", async () => {
    const activities = [
      makeActivity({ id: ACTIVITY_ID, code: "ACT001" }),
      makeActivity({ id: ACTIVITY_B_ID, code: "ACT002", name: "Testing" }),
    ]
    const mockPrisma = {
      activity: {
        findMany: vi.fn().mockResolvedValue(activities),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toHaveLength(2)
    expect(result.data[0]!.code).toBe("ACT001")
    expect(mockPrisma.activity.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID },
      orderBy: { code: "asc" },
    })
  })

  it("filters by isActive when provided", async () => {
    const mockPrisma = {
      activity: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ isActive: true })
    expect(mockPrisma.activity.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, isActive: true },
      orderBy: { code: "asc" },
    })
  })

  it("returns empty array when no activities", async () => {
    const mockPrisma = {
      activity: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toEqual([])
  })
})

// --- activities.getById tests ---

describe("activities.getById", () => {
  it("returns activity when found", async () => {
    const activity = makeActivity()
    const mockPrisma = {
      activity: {
        findFirst: vi.fn().mockResolvedValue(activity),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: ACTIVITY_ID })
    expect(result.id).toBe(ACTIVITY_ID)
    expect(result.code).toBe("ACT001")
  })

  it("throws NOT_FOUND for missing activity", async () => {
    const mockPrisma = {
      activity: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: ACTIVITY_ID })).rejects.toThrow(
      "Activity not found"
    )
  })
})

// --- activities.create tests ---

describe("activities.create", () => {
  it("creates activity successfully", async () => {
    const created = makeActivity()
    const mockPrisma = {
      activity: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({ code: "ACT001", name: "Development" })
    expect(result.code).toBe("ACT001")
    expect(mockPrisma.activity.create).toHaveBeenCalled()
  })

  it("trims whitespace from code, name, description", async () => {
    const created = makeActivity({ description: "Some desc" })
    const mockPrisma = {
      activity: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      code: "  ACT001  ",
      name: "  Development  ",
      description: "  Some desc  ",
    })
    const createCall = mockPrisma.activity.create.mock.calls[0]![0]
    expect(createCall.data.code).toBe("ACT001")
    expect(createCall.data.name).toBe("Development")
    expect(createCall.data.description).toBe("Some desc")
  })

  it("rejects empty code with BAD_REQUEST", async () => {
    const mockPrisma = {
      activity: {},
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "   ", name: "Development" })
    ).rejects.toThrow("Activity code is required")
  })

  it("rejects empty name with BAD_REQUEST", async () => {
    const mockPrisma = {
      activity: {},
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "ACT001", name: "   " })
    ).rejects.toThrow("Activity name is required")
  })

  it("rejects duplicate code with CONFLICT", async () => {
    const mockPrisma = {
      activity: {
        findFirst: vi.fn().mockResolvedValue(makeActivity()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "ACT001", name: "Development" })
    ).rejects.toThrow("Activity code already exists")
  })

  it("always sets isActive true (no isActive input)", async () => {
    const created = makeActivity({ isActive: true })
    const mockPrisma = {
      activity: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({ code: "ACT001", name: "Development" })
    const createCall = mockPrisma.activity.create.mock.calls[0]![0]
    expect(createCall.data.isActive).toBe(true)
  })
})

// --- activities.update tests ---

describe("activities.update", () => {
  it("updates name and description", async () => {
    const existing = makeActivity()
    const updated = makeActivity({ name: "Updated", description: "New desc" })
    const mockPrisma = {
      activity: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: ACTIVITY_ID,
      name: "Updated",
      description: "New desc",
    })
    expect(result.name).toBe("Updated")
  })

  it("rejects empty name with BAD_REQUEST", async () => {
    const existing = makeActivity()
    const mockPrisma = {
      activity: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: ACTIVITY_ID, name: "   " })
    ).rejects.toThrow("Activity name is required")
  })

  it("rejects empty code with BAD_REQUEST", async () => {
    const existing = makeActivity()
    const mockPrisma = {
      activity: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: ACTIVITY_ID, code: "   " })
    ).rejects.toThrow("Activity code is required")
  })

  it("rejects duplicate code with CONFLICT", async () => {
    const existing = makeActivity({ code: "OLD" })
    const conflicting = makeActivity({ id: ACTIVITY_B_ID, code: "NEW" })
    const mockPrisma = {
      activity: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(conflicting),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: ACTIVITY_ID, code: "NEW" })
    ).rejects.toThrow("Activity code already exists")
  })

  it("allows same code (no duplicate check when code unchanged)", async () => {
    const existing = makeActivity({ code: "ACT001" })
    const updated = makeActivity({ code: "ACT001" })
    const mockPrisma = {
      activity: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: ACTIVITY_ID, code: "ACT001" })
    expect(result.code).toBe("ACT001")
    // Only called once for existence check, not a second time for uniqueness
    expect(mockPrisma.activity.findFirst).toHaveBeenCalledTimes(1)
  })

  it("throws NOT_FOUND for missing activity", async () => {
    const mockPrisma = {
      activity: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: ACTIVITY_ID, name: "Updated" })
    ).rejects.toThrow("Activity not found")
  })

  it("can set isActive to false", async () => {
    const existing = makeActivity({ isActive: true })
    const updated = makeActivity({ isActive: false })
    const mockPrisma = {
      activity: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: ACTIVITY_ID, isActive: false })
    expect(result.isActive).toBe(false)
    const updateCall = mockPrisma.activity.update.mock.calls[0]![0]
    expect(updateCall.data.isActive).toBe(false)
  })
})

// --- activities.delete tests ---

describe("activities.delete", () => {
  it("deletes activity successfully", async () => {
    const existing = makeActivity()
    const mockPrisma = {
      activity: {
        findFirst: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(existing),
      },
      employee: {
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: ACTIVITY_ID })
    expect(result.success).toBe(true)
    expect(mockPrisma.activity.delete).toHaveBeenCalledWith({
      where: { id: ACTIVITY_ID },
    })
  })

  it("throws NOT_FOUND for missing activity", async () => {
    const mockPrisma = {
      activity: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: ACTIVITY_ID })).rejects.toThrow(
      "Activity not found"
    )
  })

  it("rejects deletion when employees have defaultActivityId", async () => {
    const existing = makeActivity()
    const mockPrisma = {
      activity: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
      employee: {
        count: vi.fn().mockResolvedValue(2),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: ACTIVITY_ID })).rejects.toThrow(
      "Cannot delete activity with assigned employees"
    )
    expect(mockPrisma.employee.count).toHaveBeenCalledWith({
      where: { defaultActivityId: ACTIVITY_ID },
    })
  })
})
