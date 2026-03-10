import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { tripRecordsRouter } from "../tripRecords"
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
const TRIP_RECORD_ID = "a0000000-0000-4000-a000-000000001001"
const VEHICLE_ID = "a0000000-0000-4000-a000-000000002001"
const ROUTE_ID = "a0000000-0000-4000-a000-000000003001"

const VEHICLE_DATA_MANAGE = permissionIdByKey("vehicle_data.manage")!

const createCaller = createCallerFactory(tripRecordsRouter)

// --- Helpers ---

function makeTripRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: TRIP_RECORD_ID,
    tenantId: TENANT_ID,
    vehicleId: VEHICLE_ID,
    routeId: ROUTE_ID,
    tripDate: new Date("2025-01-15"),
    startMileage: 10000,
    endMileage: 10050,
    distanceKm: 50,
    notes: "Regular delivery run",
    createdAt: new Date("2025-01-15"),
    updatedAt: new Date("2025-01-15"),
    vehicle: {
      id: VEHICLE_ID,
      code: "VEH-001",
      name: "Truck Alpha",
    },
    vehicleRoute: {
      id: ROUTE_ID,
      code: "RT-001",
      name: "City Loop",
    },
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

// --- tripRecords.list tests ---

describe("tripRecords.list", () => {
  it("returns tenant-scoped trip records", async () => {
    const records = [makeTripRecord()]
    const mockPrisma = {
      tripRecord: {
        findMany: vi.fn().mockResolvedValue(records),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list({})

    expect(result.data).toHaveLength(1)
    expect(result.meta.total).toBe(1)
    expect(mockPrisma.tripRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_ID },
      })
    )
  })

  it("filters by vehicleId", async () => {
    const mockPrisma = {
      tripRecord: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ vehicleId: VEHICLE_ID })

    expect(mockPrisma.tripRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_ID,
          vehicleId: VEHICLE_ID,
        }),
      })
    )
  })

  it("filters by date range", async () => {
    const mockPrisma = {
      tripRecord: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ fromDate: "2025-01-01", toDate: "2025-01-31" })

    expect(mockPrisma.tripRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_ID,
          tripDate: {
            gte: expect.any(Date),
            lte: expect.any(Date),
          },
        }),
      })
    )
  })

  it("supports pagination", async () => {
    const mockPrisma = {
      tripRecord: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(100),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list({ limit: 10, page: 2 })

    expect(mockPrisma.tripRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10,
        skip: 10,
      })
    )
    expect(result.meta.hasMore).toBe(true)
  })

  it("includes vehicle and vehicleRoute relations", async () => {
    const mockPrisma = {
      tripRecord: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({})

    expect(mockPrisma.tripRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          vehicle: expect.any(Object),
          vehicleRoute: expect.any(Object),
        }),
      })
    )
  })

  it("converts Decimal fields to numbers", async () => {
    // Simulate Prisma Decimal objects
    const decStart = { toString: () => "10000" }
    const decEnd = { toString: () => "10050" }
    const decDist = { toString: () => "50" }
    const records = [
      makeTripRecord({
        startMileage: decStart,
        endMileage: decEnd,
        distanceKm: decDist,
      }),
    ]
    const mockPrisma = {
      tripRecord: {
        findMany: vi.fn().mockResolvedValue(records),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list({})

    expect(result.data[0]!.startMileage).toBe(10000)
    expect(result.data[0]!.endMileage).toBe(10050)
    expect(result.data[0]!.distanceKm).toBe(50)
    expect(typeof result.data[0]!.startMileage).toBe("number")
  })

  it("handles null Decimal fields", async () => {
    const records = [
      makeTripRecord({
        startMileage: null,
        endMileage: null,
        distanceKm: null,
      }),
    ]
    const mockPrisma = {
      tripRecord: {
        findMany: vi.fn().mockResolvedValue(records),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list({})

    expect(result.data[0]!.startMileage).toBeNull()
    expect(result.data[0]!.endMileage).toBeNull()
    expect(result.data[0]!.distanceKm).toBeNull()
  })
})

// --- tripRecords.getById tests ---

describe("tripRecords.getById", () => {
  it("returns trip record by ID", async () => {
    const record = makeTripRecord()
    const mockPrisma = {
      tripRecord: {
        findFirst: vi.fn().mockResolvedValue(record),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: TRIP_RECORD_ID })

    expect(result.id).toBe(TRIP_RECORD_ID)
    expect(result.vehicleId).toBe(VEHICLE_ID)
    expect(result.vehicle?.code).toBe("VEH-001")
    expect(result.vehicleRoute?.code).toBe("RT-001")
  })

  it("throws NOT_FOUND for missing record", async () => {
    const mockPrisma = {
      tripRecord: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.getById({ id: TRIP_RECORD_ID })
    ).rejects.toThrow("Trip record not found")
  })
})

// --- tripRecords.create tests ---

describe("tripRecords.create", () => {
  it("creates a trip record with vehicle and date", async () => {
    const created = makeTripRecord()
    const mockPrisma = {
      vehicle: {
        findFirst: vi.fn().mockResolvedValue({ id: VEHICLE_ID }),
      },
      vehicleRoute: {
        findFirst: vi.fn().mockResolvedValue({ id: ROUTE_ID }),
      },
      tripRecord: {
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      vehicleId: VEHICLE_ID,
      routeId: ROUTE_ID,
      tripDate: "2025-01-15",
      startMileage: 10000,
      endMileage: 10050,
      distanceKm: 50,
    })

    expect(result.id).toBe(TRIP_RECORD_ID)
    expect(mockPrisma.tripRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          vehicleId: VEHICLE_ID,
          routeId: ROUTE_ID,
        }),
      })
    )
  })

  it("validates vehicleId FK", async () => {
    const mockPrisma = {
      vehicle: {
        findFirst: vi.fn().mockResolvedValue(null), // vehicle not found
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        vehicleId: VEHICLE_ID,
        tripDate: "2025-01-15",
      })
    ).rejects.toThrow("Vehicle not found")
  })

  it("validates routeId FK when provided", async () => {
    const mockPrisma = {
      vehicle: {
        findFirst: vi.fn().mockResolvedValue({ id: VEHICLE_ID }),
      },
      vehicleRoute: {
        findFirst: vi.fn().mockResolvedValue(null), // route not found
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        vehicleId: VEHICLE_ID,
        routeId: ROUTE_ID,
        tripDate: "2025-01-15",
      })
    ).rejects.toThrow("Vehicle route not found")
  })

  it("creates without routeId", async () => {
    const created = makeTripRecord({ routeId: null, vehicleRoute: null })
    const mockPrisma = {
      vehicle: {
        findFirst: vi.fn().mockResolvedValue({ id: VEHICLE_ID }),
      },
      tripRecord: {
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      vehicleId: VEHICLE_ID,
      tripDate: "2025-01-15",
    })

    expect(result.routeId).toBeNull()
    expect(mockPrisma.tripRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          routeId: null,
        }),
      })
    )
  })

  it("rejects invalid trip date", async () => {
    const mockPrisma = {
      vehicle: {
        findFirst: vi.fn().mockResolvedValue({ id: VEHICLE_ID }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        vehicleId: VEHICLE_ID,
        tripDate: "not-a-date",
      })
    ).rejects.toThrow("Invalid trip date")
  })
})

// --- tripRecords.update tests ---

describe("tripRecords.update", () => {
  it("updates trip record (partial)", async () => {
    const existing = makeTripRecord()
    const updated = makeTripRecord({ notes: "Updated notes" })
    const mockPrisma = {
      tripRecord: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: TRIP_RECORD_ID,
      notes: "Updated notes",
    })

    expect(result.notes).toBe("Updated notes")
  })

  it("sets routeId to null", async () => {
    const existing = makeTripRecord()
    const updated = makeTripRecord({ routeId: null, vehicleRoute: null })
    const mockPrisma = {
      tripRecord: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.update({ id: TRIP_RECORD_ID, routeId: null })

    expect(mockPrisma.tripRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          routeId: null,
        }),
      })
    )
  })

  it("validates routeId FK when setting a new route", async () => {
    const existing = makeTripRecord()
    const mockPrisma = {
      tripRecord: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
      vehicleRoute: {
        findFirst: vi.fn().mockResolvedValue(null), // route not found
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: TRIP_RECORD_ID, routeId: ROUTE_ID })
    ).rejects.toThrow("Vehicle route not found")
  })

  it("throws NOT_FOUND for missing record", async () => {
    const mockPrisma = {
      tripRecord: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: TRIP_RECORD_ID, notes: "test" })
    ).rejects.toThrow("Trip record not found")
  })

  it("updates nullable Decimal fields", async () => {
    const existing = makeTripRecord()
    const updated = makeTripRecord({
      startMileage: null,
      endMileage: null,
      distanceKm: null,
    })
    const mockPrisma = {
      tripRecord: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.update({
      id: TRIP_RECORD_ID,
      startMileage: null,
      endMileage: null,
      distanceKm: null,
    })

    expect(mockPrisma.tripRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          startMileage: null,
          endMileage: null,
          distanceKm: null,
        }),
      })
    )
  })
})

// --- tripRecords.delete tests ---

describe("tripRecords.delete", () => {
  it("deletes a trip record", async () => {
    const existing = makeTripRecord()
    const mockPrisma = {
      tripRecord: {
        findFirst: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: TRIP_RECORD_ID })

    expect(result.success).toBe(true)
    expect(mockPrisma.tripRecord.delete).toHaveBeenCalledWith({
      where: { id: TRIP_RECORD_ID },
    })
  })

  it("throws NOT_FOUND for missing record", async () => {
    const mockPrisma = {
      tripRecord: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.delete({ id: TRIP_RECORD_ID })
    ).rejects.toThrow("Trip record not found")
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
    await expect(caller.list({})).rejects.toThrow("Authentication required")
  })
})
