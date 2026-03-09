import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { terminalBookingsRouter } from "../routers/terminalBookings"
import {
  createMockContext,
  createMockSession,
  createMockUserTenant,
  createUserWithPermissions,
} from "./helpers"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Constants ---

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const BATCH_ID = "a0000000-0000-4000-a000-000000001001"
const BOOKING_ID = "a0000000-0000-4000-a000-000000002001"
const EMPLOYEE_ID = "a0000000-0000-4000-a000-000000003001"
const BOOKING_TYPE_ID = "a0000000-0000-4000-a000-000000004001"

const TERMINAL_BOOKINGS_MANAGE = permissionIdByKey("terminal_bookings.manage")!

const createCaller = createCallerFactory(terminalBookingsRouter)

// --- Helpers ---

function makeBatch(overrides: Record<string, unknown> = {}) {
  return {
    id: BATCH_ID,
    tenantId: TENANT_ID,
    batchReference: "BATCH-001",
    source: "terminal",
    terminalId: "T1",
    status: "completed",
    recordsTotal: 2,
    recordsImported: 2,
    recordsFailed: 0,
    errorMessage: null,
    startedAt: new Date("2025-01-01"),
    completedAt: new Date("2025-01-01"),
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

function makeRawBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: BOOKING_ID,
    tenantId: TENANT_ID,
    importBatchId: BATCH_ID,
    terminalId: "T1",
    employeePin: "1234",
    employeeId: EMPLOYEE_ID,
    rawTimestamp: new Date("2025-01-01T08:00:00Z"),
    rawBookingCode: "COME",
    bookingDate: new Date("2025-01-01"),
    bookingTypeId: BOOKING_TYPE_ID,
    processedBookingId: null,
    status: "pending",
    errorMessage: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    employee: {
      id: EMPLOYEE_ID,
      firstName: "John",
      lastName: "Doe",
      personnelNumber: "EMP001",
    },
    bookingType: {
      id: BOOKING_TYPE_ID,
      code: "COME",
      name: "Come",
    },
    ...overrides,
  }
}

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([TERMINAL_BOOKINGS_MANAGE], {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- terminalBookings.list tests ---

describe("terminalBookings.list", () => {
  it("returns tenant-scoped bookings", async () => {
    const bookings = [makeRawBooking()]
    const mockPrisma = {
      rawTerminalBooking: {
        findMany: vi.fn().mockResolvedValue(bookings),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list({})

    expect(result.data).toHaveLength(1)
    expect(result.meta.total).toBe(1)
    expect(mockPrisma.rawTerminalBooking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_ID },
      })
    )
  })

  it("filters by date range", async () => {
    const mockPrisma = {
      rawTerminalBooking: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ from: "2025-01-01", to: "2025-01-31" })

    expect(mockPrisma.rawTerminalBooking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_ID,
          bookingDate: {
            gte: expect.any(Date),
            lte: expect.any(Date),
          },
        }),
      })
    )
  })

  it("filters by status", async () => {
    const mockPrisma = {
      rawTerminalBooking: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ status: "pending" })

    expect(mockPrisma.rawTerminalBooking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "pending",
        }),
      })
    )
  })

  it("supports pagination", async () => {
    const mockPrisma = {
      rawTerminalBooking: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(100),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list({ limit: 10, page: 2 })

    expect(mockPrisma.rawTerminalBooking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10,
        skip: 10,
      })
    )
    expect(result.meta.hasMore).toBe(true)
  })
})

// --- terminalBookings.import tests ---

describe("terminalBookings.import", () => {
  it("creates batch and raw bookings", async () => {
    const createdBatch = makeBatch({ status: "processing" })
    const updatedBatch = makeBatch({ status: "completed", recordsImported: 1 })

    const mockPrisma = {
      importBatch: {
        findFirst: vi.fn().mockResolvedValue(null), // no existing
        create: vi.fn().mockResolvedValue(createdBatch),
        update: vi.fn().mockResolvedValue(updatedBatch),
      },
      rawTerminalBooking: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      employee: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      bookingType: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.import({
      batchReference: "BATCH-001",
      terminalId: "T1",
      bookings: [
        {
          employeePin: "1234",
          rawTimestamp: "2025-01-01T08:00:00Z",
          rawBookingCode: "COME",
        },
      ],
    })

    expect(result.wasDuplicate).toBe(false)
    expect(result.batch.status).toBe("completed")
    expect(mockPrisma.rawTerminalBooking.createMany).toHaveBeenCalled()
  })

  it("returns existing batch for duplicate reference (idempotency)", async () => {
    const existingBatch = makeBatch()
    const mockPrisma = {
      importBatch: {
        findFirst: vi.fn().mockResolvedValue(existingBatch),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.import({
      batchReference: "BATCH-001",
      terminalId: "T1",
      bookings: [
        {
          employeePin: "1234",
          rawTimestamp: "2025-01-01T08:00:00Z",
          rawBookingCode: "COME",
        },
      ],
    })

    expect(result.wasDuplicate).toBe(true)
    expect(result.batch.id).toBe(BATCH_ID)
  })

  it("resolves employee by PIN", async () => {
    const createdBatch = makeBatch({ status: "processing" })
    const updatedBatch = makeBatch({ status: "completed" })

    const mockPrisma = {
      importBatch: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(createdBatch),
        update: vi.fn().mockResolvedValue(updatedBatch),
      },
      rawTerminalBooking: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      employee: {
        findFirst: vi.fn().mockResolvedValue({ id: EMPLOYEE_ID }),
      },
      bookingType: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.import({
      batchReference: "BATCH-002",
      terminalId: "T1",
      bookings: [
        {
          employeePin: "1234",
          rawTimestamp: "2025-01-01T08:00:00Z",
          rawBookingCode: "COME",
        },
      ],
    })

    expect(mockPrisma.rawTerminalBooking.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            employeeId: EMPLOYEE_ID,
          }),
        ]),
      })
    )
  })

  it("resolves booking type by code", async () => {
    const createdBatch = makeBatch({ status: "processing" })
    const updatedBatch = makeBatch({ status: "completed" })

    const mockPrisma = {
      importBatch: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(createdBatch),
        update: vi.fn().mockResolvedValue(updatedBatch),
      },
      rawTerminalBooking: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      employee: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      bookingType: {
        findFirst: vi.fn().mockResolvedValue({ id: BOOKING_TYPE_ID }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.import({
      batchReference: "BATCH-003",
      terminalId: "T1",
      bookings: [
        {
          employeePin: "1234",
          rawTimestamp: "2025-01-01T08:00:00Z",
          rawBookingCode: "COME",
        },
      ],
    })

    expect(mockPrisma.rawTerminalBooking.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            bookingTypeId: BOOKING_TYPE_ID,
          }),
        ]),
      })
    )
  })

  it("marks batch as failed on insert error", async () => {
    const createdBatch = makeBatch({ status: "processing" })

    const mockPrisma = {
      importBatch: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(createdBatch),
        update: vi.fn().mockResolvedValue(createdBatch),
      },
      rawTerminalBooking: {
        createMany: vi.fn().mockRejectedValue(new Error("DB error")),
      },
      employee: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      bookingType: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.import({
        batchReference: "BATCH-FAIL",
        terminalId: "T1",
        bookings: [
          {
            employeePin: "1234",
            rawTimestamp: "2025-01-01T08:00:00Z",
            rawBookingCode: "COME",
          },
        ],
      })
    ).rejects.toThrow("DB error")

    expect(mockPrisma.importBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "failed",
        }),
      })
    )
  })
})

// --- terminalBookings.batches tests ---

describe("terminalBookings.batches", () => {
  it("returns tenant-scoped batches", async () => {
    const batches = [makeBatch()]
    const mockPrisma = {
      importBatch: {
        findMany: vi.fn().mockResolvedValue(batches),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.batches({})

    expect(result.data).toHaveLength(1)
    expect(mockPrisma.importBatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_ID },
      })
    )
  })

  it("filters by status", async () => {
    const mockPrisma = {
      importBatch: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.batches({ status: "completed" })

    expect(mockPrisma.importBatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "completed",
        }),
      })
    )
  })
})

// --- terminalBookings.batch tests ---

describe("terminalBookings.batch", () => {
  it("returns batch by ID", async () => {
    const batch = makeBatch()
    const mockPrisma = {
      importBatch: {
        findFirst: vi.fn().mockResolvedValue(batch),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.batch({ id: BATCH_ID })

    expect(result.id).toBe(BATCH_ID)
  })

  it("throws NOT_FOUND for missing batch", async () => {
    const mockPrisma = {
      importBatch: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.batch({ id: BATCH_ID })
    ).rejects.toThrow("Import batch not found")
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
