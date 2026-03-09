import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { vehiclesRouter } from "../vehicles"
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
const VEHICLE_ID = "a0000000-0000-4000-a000-000000001001"

const VEHICLE_DATA_MANAGE = permissionIdByKey("vehicle_data.manage")!

const createCaller = createCallerFactory(vehiclesRouter)

// --- Helpers ---

function makeVehicle(overrides: Record<string, unknown> = {}) {
  return {
    id: VEHICLE_ID,
    tenantId: TENANT_ID,
    code: "VEH-001",
    name: "Truck Alpha",
    description: "Primary delivery truck",
    licensePlate: "AB-CD-1234",
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

// --- vehicles.list tests ---

describe("vehicles.list", () => {
  it("returns tenant-scoped vehicles", async () => {
    const vehicles = [makeVehicle()]
    const mockPrisma = {
      vehicle: {
        findMany: vi.fn().mockResolvedValue(vehicles),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()

    expect(result.data).toHaveLength(1)
    expect(result.data[0].id).toBe(VEHICLE_ID)
    expect(mockPrisma.vehicle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_ID },
      })
    )
  })

  it("orders by sortOrder then code", async () => {
    const mockPrisma = {
      vehicle: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list()

    expect(mockPrisma.vehicle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      })
    )
  })
})

// --- vehicles.getById tests ---

describe("vehicles.getById", () => {
  it("returns vehicle by ID", async () => {
    const vehicle = makeVehicle()
    const mockPrisma = {
      vehicle: {
        findFirst: vi.fn().mockResolvedValue(vehicle),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: VEHICLE_ID })

    expect(result.id).toBe(VEHICLE_ID)
    expect(result.name).toBe("Truck Alpha")
  })

  it("throws NOT_FOUND for missing vehicle", async () => {
    const mockPrisma = {
      vehicle: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.getById({ id: VEHICLE_ID })
    ).rejects.toThrow("Vehicle not found")
  })
})

// --- vehicles.create tests ---

describe("vehicles.create", () => {
  it("creates a vehicle with code and name", async () => {
    const created = makeVehicle()
    const mockPrisma = {
      vehicle: {
        findFirst: vi.fn().mockResolvedValue(null), // no duplicate
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "VEH-001",
      name: "Truck Alpha",
    })

    expect(result.id).toBe(VEHICLE_ID)
    expect(mockPrisma.vehicle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          code: "VEH-001",
          name: "Truck Alpha",
          isActive: true,
        }),
      })
    )
  })

  it("trims code and name", async () => {
    const created = makeVehicle()
    const mockPrisma = {
      vehicle: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      code: "  VEH-001  ",
      name: "  Truck Alpha  ",
    })

    expect(mockPrisma.vehicle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: "VEH-001",
          name: "Truck Alpha",
        }),
      })
    )
  })

  it("rejects duplicate code within tenant", async () => {
    const mockPrisma = {
      vehicle: {
        findFirst: vi.fn().mockResolvedValue(makeVehicle()), // existing
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        code: "VEH-001",
        name: "Another Truck",
      })
    ).rejects.toThrow("Vehicle code already exists")
  })

  it("rejects whitespace-only code", async () => {
    const mockPrisma = {
      vehicle: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        code: "   ",
        name: "Valid Name",
      })
    ).rejects.toThrow("Vehicle code is required")
  })

  it("rejects whitespace-only name", async () => {
    const mockPrisma = {
      vehicle: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        code: "VEH-001",
        name: "   ",
      })
    ).rejects.toThrow("Vehicle name is required")
  })
})

// --- vehicles.update tests ---

describe("vehicles.update", () => {
  it("updates vehicle name (partial)", async () => {
    const existing = makeVehicle()
    const updated = makeVehicle({ name: "Updated Truck" })
    const mockPrisma = {
      vehicle: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: VEHICLE_ID,
      name: "Updated Truck",
    })

    expect(result.name).toBe("Updated Truck")
    expect(mockPrisma.vehicle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Updated Truck",
        }),
      })
    )
  })

  it("rejects whitespace-only name on update", async () => {
    const existing = makeVehicle()
    const mockPrisma = {
      vehicle: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: VEHICLE_ID, name: "   " })
    ).rejects.toThrow("Vehicle name is required")
  })

  it("throws NOT_FOUND for missing vehicle", async () => {
    const mockPrisma = {
      vehicle: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: VEHICLE_ID, name: "New Name" })
    ).rejects.toThrow("Vehicle not found")
  })

  it("supports partial updates (isActive, sortOrder)", async () => {
    const existing = makeVehicle()
    const updated = makeVehicle({ isActive: false, sortOrder: 5 })
    const mockPrisma = {
      vehicle: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.update({ id: VEHICLE_ID, isActive: false, sortOrder: 5 })

    expect(mockPrisma.vehicle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isActive: false,
          sortOrder: 5,
        }),
      })
    )
  })
})

// --- vehicles.delete tests ---

describe("vehicles.delete", () => {
  it("deletes a vehicle with no trip records", async () => {
    const existing = makeVehicle()
    const mockPrisma = {
      vehicle: {
        findFirst: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(existing),
      },
      tripRecord: {
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: VEHICLE_ID })

    expect(result.success).toBe(true)
    expect(mockPrisma.vehicle.delete).toHaveBeenCalledWith({
      where: { id: VEHICLE_ID },
    })
  })

  it("rejects deletion when trip records exist", async () => {
    const existing = makeVehicle()
    const mockPrisma = {
      vehicle: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
      tripRecord: {
        count: vi.fn().mockResolvedValue(3),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.delete({ id: VEHICLE_ID })
    ).rejects.toThrow("Cannot delete vehicle that has trip records")
  })

  it("throws NOT_FOUND for missing vehicle", async () => {
    const mockPrisma = {
      vehicle: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.delete({ id: VEHICLE_ID })
    ).rejects.toThrow("Vehicle not found")
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
