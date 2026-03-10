import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { accessZonesRouter } from "../accessZones"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const ACCESS_CONTROL_MANAGE = permissionIdByKey("access_control.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ZONE_ID = "a0000000-0000-4000-a000-000000000200"

const createCaller = createCallerFactory(accessZonesRouter)

// --- Helpers ---

function makeZone(
  overrides: Partial<{
    id: string
    tenantId: string
    code: string
    name: string
    description: string | null
    isActive: boolean
    sortOrder: number
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: ZONE_ID,
    tenantId: TENANT_ID,
    code: "ZONE-A",
    name: "Zone A",
    description: null,
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
    user: createUserWithPermissions([ACCESS_CONTROL_MANAGE], {
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

// --- accessZones.list tests ---

describe("accessZones.list", () => {
  it("returns all zones ordered by sortOrder/code", async () => {
    const zones = [
      makeZone({ code: "ZONE-A", sortOrder: 0 }),
      makeZone({ id: "a0000000-0000-4000-a000-000000000201", code: "ZONE-B", sortOrder: 1 }),
    ]
    const mockPrisma = {
      accessZone: {
        findMany: vi.fn().mockResolvedValue(zones),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()

    expect(result.data).toHaveLength(2)
    expect(result.data[0]!.code).toBe("ZONE-A")
    expect(result.data[1]!.code).toBe("ZONE-B")
    expect(mockPrisma.accessZone.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    })
  })

  it("denies access without permission", async () => {
    const mockPrisma = {
      accessZone: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createNoPermContext(mockPrisma))
    await expect(caller.list()).rejects.toThrow("Insufficient permissions")
  })
})

// --- accessZones.getById tests ---

describe("accessZones.getById", () => {
  it("returns zone by ID", async () => {
    const zone = makeZone()
    const mockPrisma = {
      accessZone: {
        findFirst: vi.fn().mockResolvedValue(zone),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: ZONE_ID })

    expect(result.id).toBe(ZONE_ID)
    expect(result.code).toBe("ZONE-A")
    expect(result.name).toBe("Zone A")
    expect(mockPrisma.accessZone.findFirst).toHaveBeenCalledWith({
      where: { id: ZONE_ID, tenantId: TENANT_ID },
    })
  })

  it("throws NOT_FOUND for missing ID", async () => {
    const mockPrisma = {
      accessZone: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: ZONE_ID })).rejects.toThrow(
      "Access zone not found"
    )
  })
})

// --- accessZones.create tests ---

describe("accessZones.create", () => {
  it("creates zone with valid input", async () => {
    const zone = makeZone()
    const mockPrisma = {
      accessZone: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(zone),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "ZONE-A",
      name: "Zone A",
      description: "A zone",
      sortOrder: 5,
    })

    expect(result.id).toBe(ZONE_ID)
    expect(result.code).toBe("ZONE-A")
    expect(mockPrisma.accessZone.create).toHaveBeenCalledWith({
      data: {
        tenantId: TENANT_ID,
        code: "ZONE-A",
        name: "Zone A",
        description: "A zone",
        isActive: true,
        sortOrder: 5,
      },
    })
  })

  it("validates code required (empty after trim)", async () => {
    const mockPrisma = {
      accessZone: {
        findFirst: vi.fn(),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "   ", name: "Zone A" })
    ).rejects.toThrow("Access zone code is required")
  })

  it("validates name required (empty after trim)", async () => {
    const mockPrisma = {
      accessZone: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "ZONE-A", name: "   " })
    ).rejects.toThrow("Access zone name is required")
  })

  it("rejects duplicate code within tenant (CONFLICT)", async () => {
    const mockPrisma = {
      accessZone: {
        findFirst: vi.fn().mockResolvedValue(makeZone()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "ZONE-A", name: "Zone A" })
    ).rejects.toThrow("Access zone code already exists")
  })

  it("defaults sortOrder to 0", async () => {
    const zone = makeZone({ sortOrder: 0 })
    const mockPrisma = {
      accessZone: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(zone),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({ code: "ZONE-A", name: "Zone A" })

    expect(mockPrisma.accessZone.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ sortOrder: 0 }),
    })
  })
})

// --- accessZones.update tests ---

describe("accessZones.update", () => {
  it("partial update succeeds", async () => {
    const existing = makeZone()
    const updated = makeZone({ name: "Zone A Updated", sortOrder: 3 })
    const mockPrisma = {
      accessZone: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: ZONE_ID,
      name: "Zone A Updated",
      sortOrder: 3,
    })

    expect(result.name).toBe("Zone A Updated")
    expect(result.sortOrder).toBe(3)
    expect(mockPrisma.accessZone.update).toHaveBeenCalledWith({
      where: { id: ZONE_ID },
      data: { name: "Zone A Updated", sortOrder: 3 },
    })
  })

  it("throws NOT_FOUND for missing zone", async () => {
    const mockPrisma = {
      accessZone: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: ZONE_ID, name: "New Name" })
    ).rejects.toThrow("Access zone not found")
  })

  it("validates name non-empty when provided", async () => {
    const existing = makeZone()
    const mockPrisma = {
      accessZone: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: ZONE_ID, name: "   " })
    ).rejects.toThrow("Access zone name is required")
  })
})

// --- accessZones.delete tests ---

describe("accessZones.delete", () => {
  it("deletes existing zone", async () => {
    const existing = makeZone()
    const mockPrisma = {
      accessZone: {
        findFirst: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: ZONE_ID })

    expect(result.success).toBe(true)
    expect(mockPrisma.accessZone.delete).toHaveBeenCalledWith({
      where: { id: ZONE_ID },
    })
  })

  it("throws NOT_FOUND for missing zone", async () => {
    const mockPrisma = {
      accessZone: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: ZONE_ID })).rejects.toThrow(
      "Access zone not found"
    )
  })
})
