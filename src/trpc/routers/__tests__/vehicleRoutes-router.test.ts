import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { vehicleRoutesRouter } from "../vehicleRoutes"
import {
  createMockContext,
  createMockSession,
  createMockUserTenant,
  createUserWithPermissions,
} from "./helpers"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"

// --- Constants ---

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ROUTE_ID = "a0000000-0000-4000-a000-000000001001"

const VEHICLE_DATA_MANAGE = permissionIdByKey("vehicle_data.manage")!

const createCaller = createCallerFactory(vehicleRoutesRouter)

// --- Helpers ---

function makeRoute(overrides: Record<string, unknown> = {}) {
  return {
    id: ROUTE_ID,
    tenantId: TENANT_ID,
    code: "RT-001",
    name: "City Loop",
    description: "Downtown circular route",
    distanceKm: 42.5,
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
    user: createUserWithPermissions([VEHICLE_DATA_MANAGE], {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- vehicleRoutes.list tests ---

describe("vehicleRoutes.list", () => {
  it("returns tenant-scoped routes", async () => {
    const routes = [makeRoute()]
    const mockPrisma = {
      vehicleRoute: {
        findMany: vi.fn().mockResolvedValue(routes),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()

    expect(result.data).toHaveLength(1)
    expect(result.data[0]!.id).toBe(ROUTE_ID)
    expect(mockPrisma.vehicleRoute.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_ID },
      })
    )
  })

  it("converts Decimal distanceKm to number", async () => {
    // Simulate Prisma Decimal by using an object with toString
    const decimalValue = { toString: () => "42.5" }
    const routes = [makeRoute({ distanceKm: decimalValue })]
    const mockPrisma = {
      vehicleRoute: {
        findMany: vi.fn().mockResolvedValue(routes),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()

    expect(result.data[0]!.distanceKm).toBe(42.5)
    expect(typeof result.data[0]!.distanceKm).toBe("number")
  })

  it("handles null distanceKm", async () => {
    const routes = [makeRoute({ distanceKm: null })]
    const mockPrisma = {
      vehicleRoute: {
        findMany: vi.fn().mockResolvedValue(routes),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()

    expect(result.data[0]!.distanceKm).toBeNull()
  })

  it("orders by sortOrder then code", async () => {
    const mockPrisma = {
      vehicleRoute: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list()

    expect(mockPrisma.vehicleRoute.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      })
    )
  })
})

// --- vehicleRoutes.getById tests ---

describe("vehicleRoutes.getById", () => {
  it("returns route by ID", async () => {
    const route = makeRoute()
    const mockPrisma = {
      vehicleRoute: {
        findFirst: vi.fn().mockResolvedValue(route),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: ROUTE_ID })

    expect(result.id).toBe(ROUTE_ID)
    expect(result.name).toBe("City Loop")
  })

  it("throws NOT_FOUND for missing route", async () => {
    const mockPrisma = {
      vehicleRoute: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.getById({ id: ROUTE_ID })
    ).rejects.toThrow("Vehicle route not found")
  })
})

// --- vehicleRoutes.create tests ---

describe("vehicleRoutes.create", () => {
  it("creates a route with code and name", async () => {
    const created = makeRoute()
    const mockPrisma = {
      vehicleRoute: {
        findFirst: vi.fn().mockResolvedValue(null), // no duplicate
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "RT-001",
      name: "City Loop",
      distanceKm: 42.5,
    })

    expect(result.id).toBe(ROUTE_ID)
    expect(mockPrisma.vehicleRoute.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          code: "RT-001",
          name: "City Loop",
          distanceKm: 42.5,
          isActive: true,
        }),
      })
    )
  })

  it("trims code and name", async () => {
    const created = makeRoute()
    const mockPrisma = {
      vehicleRoute: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      code: "  RT-001  ",
      name: "  City Loop  ",
    })

    expect(mockPrisma.vehicleRoute.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: "RT-001",
          name: "City Loop",
        }),
      })
    )
  })

  it("rejects duplicate code within tenant", async () => {
    const mockPrisma = {
      vehicleRoute: {
        findFirst: vi.fn().mockResolvedValue(makeRoute()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        code: "RT-001",
        name: "Another Route",
      })
    ).rejects.toThrow("Vehicle route code already exists")
  })

  it("rejects whitespace-only code", async () => {
    const mockPrisma = {
      vehicleRoute: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        code: "   ",
        name: "Valid Name",
      })
    ).rejects.toThrow("Vehicle route code is required")
  })

  it("rejects whitespace-only name", async () => {
    const mockPrisma = {
      vehicleRoute: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        code: "RT-001",
        name: "   ",
      })
    ).rejects.toThrow("Vehicle route name is required")
  })
})

// --- vehicleRoutes.update tests ---

describe("vehicleRoutes.update", () => {
  it("updates route name (partial)", async () => {
    const existing = makeRoute()
    const updated = makeRoute({ name: "Updated Loop" })
    const mockPrisma = {
      vehicleRoute: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(existing)   // existence check
          .mockResolvedValueOnce(updated),   // refetch after updateMany
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: ROUTE_ID,
      name: "Updated Loop",
    })

    expect(result.name).toBe("Updated Loop")
  })

  it("updates distanceKm", async () => {
    const existing = makeRoute()
    const updated = makeRoute({ distanceKm: 100.0 })
    const mockPrisma = {
      vehicleRoute: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(existing)   // existence check
          .mockResolvedValueOnce(updated),   // refetch after updateMany
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.update({ id: ROUTE_ID, distanceKm: 100.0 })

    expect(mockPrisma.vehicleRoute.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          distanceKm: 100.0,
        }),
      })
    )
  })

  it("sets distanceKm to null", async () => {
    const existing = makeRoute()
    const updated = makeRoute({ distanceKm: null })
    const mockPrisma = {
      vehicleRoute: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(existing)   // existence check
          .mockResolvedValueOnce(updated),   // refetch after updateMany
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.update({ id: ROUTE_ID, distanceKm: null })

    expect(mockPrisma.vehicleRoute.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          distanceKm: null,
        }),
      })
    )
  })

  it("rejects whitespace-only name on update", async () => {
    const existing = makeRoute()
    const mockPrisma = {
      vehicleRoute: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: ROUTE_ID, name: "   " })
    ).rejects.toThrow("Vehicle route name is required")
  })

  it("throws NOT_FOUND for missing route", async () => {
    const mockPrisma = {
      vehicleRoute: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: ROUTE_ID, name: "New Name" })
    ).rejects.toThrow("Vehicle route not found")
  })
})

// --- vehicleRoutes.delete tests ---

describe("vehicleRoutes.delete", () => {
  it("deletes a route with no trip records", async () => {
    const existing = makeRoute()
    const mockPrisma = {
      vehicleRoute: {
        findFirst: vi.fn().mockResolvedValue(existing),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      tripRecord: {
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: ROUTE_ID })

    expect(result.success).toBe(true)
    expect(mockPrisma.vehicleRoute.deleteMany).toHaveBeenCalledWith({
      where: { id: ROUTE_ID, tenantId: TENANT_ID },
    })
  })

  it("rejects deletion when trip records exist", async () => {
    const existing = makeRoute()
    const mockPrisma = {
      vehicleRoute: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
      tripRecord: {
        count: vi.fn().mockResolvedValue(5),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.delete({ id: ROUTE_ID })
    ).rejects.toThrow("Cannot delete vehicle route that has trip records")
  })

  it("throws NOT_FOUND for missing route", async () => {
    const mockPrisma = {
      vehicleRoute: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.delete({ id: ROUTE_ID })
    ).rejects.toThrow("Vehicle route not found")
  })
})

// --- Authentication test ---

describe("authentication", () => {
  it("throws UNAUTHORIZED for unauthenticated request", async () => {
    const mockPrisma = {}
    const ctx = createMockContext({
      prisma: mockPrisma as unknown as ReturnType<typeof createMockContext>["prisma"],
      authToken: null,
      user: null,
      session: null,
      tenantId: TENANT_ID,
    })
    const caller = createCaller(ctx)
    await expect(caller.list()).rejects.toThrow("Authentication required")
  })
})
