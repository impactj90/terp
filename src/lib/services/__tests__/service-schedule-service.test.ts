import { describe, it, expect, vi, beforeEach } from "vitest"
import type { PrismaClient } from "@/generated/prisma/client"
import * as service from "../service-schedule-service"

// --- Constants ---
const TENANT_A = "a0000000-0000-4000-a000-000000000100"
const TENANT_B = "a0000000-0000-4000-a000-000000000200"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const SO_ID = "50000000-0000-4000-a000-000000000001"
const CUSTOMER_ID = "c0000000-0000-4000-a000-000000000001"
const ACTIVITY_ID = "ac000000-0000-4000-a000-000000000001"
const EMPLOYEE_ID = "e0000000-0000-4000-a000-000000000001"
const SCHEDULE_ID = "55000000-0000-4000-a000-000000000001"
const ORDER_ID = "00000000-0000-4000-a000-000000000001"

// --- Fixtures ---

const baseServiceObject = {
  id: SO_ID,
  tenantId: TENANT_A,
  number: "SO-001",
  name: "Kältemaschine Halle 2",
  kind: "EQUIPMENT" as const,
  customerAddress: {
    id: CUSTOMER_ID,
    number: "K-001",
    company: "Firma A",
  },
}

function makeSchedule(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: SCHEDULE_ID,
    tenantId: TENANT_A,
    serviceObjectId: SO_ID,
    name: "Quartalsservice",
    description: null,
    intervalType: "TIME_BASED" as const,
    intervalValue: 3,
    intervalUnit: "MONTHS" as const,
    anchorDate: null,
    defaultActivityId: ACTIVITY_ID,
    responsibleEmployeeId: EMPLOYEE_ID,
    estimatedHours: null,
    lastCompletedAt: null,
    nextDueAt: null,
    leadTimeDays: 14,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdById: USER_ID,
    updatedById: USER_ID,
    serviceObject: baseServiceObject,
    defaultActivity: { id: ACTIVITY_ID, code: "WARTUNG", name: "Wartung" },
    responsibleEmployee: {
      id: EMPLOYEE_ID,
      firstName: "Hans",
      lastName: "Müller",
    },
    ...overrides,
  }
}

// --- Mock Prisma factory ---

function makePrisma(overrides: Record<string, unknown> = {}) {
  const prisma = {
    serviceObject: {
      findFirst: vi.fn().mockResolvedValue({ id: SO_ID }),
    },
    activity: {
      findFirst: vi.fn().mockResolvedValue({ id: ACTIVITY_ID }),
    },
    employee: {
      findFirst: vi.fn().mockResolvedValue({ id: EMPLOYEE_ID }),
    },
    serviceSchedule: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    order: {
      create: vi.fn().mockResolvedValue({
        id: ORDER_ID,
        tenantId: TENANT_A,
        code: "WA-1",
        name: "Quartalsservice",
        costCenter: null,
      }),
      findFirst: vi.fn().mockResolvedValue({
        id: ORDER_ID,
        tenantId: TENANT_A,
        code: "WA-1",
        name: "Quartalsservice",
        costCenter: null,
      }),
    },
    orderAssignment: {
      create: vi.fn().mockResolvedValue({
        id: "oa000000-0000-4000-a000-000000000001",
        orderId: ORDER_ID,
        employeeId: EMPLOYEE_ID,
        role: "worker",
        isActive: true,
      }),
    },
    numberSequence: {
      upsert: vi.fn().mockResolvedValue({ prefix: "WA-", nextValue: 2 }),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    platformAuditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(),
    ...overrides,
  } as unknown as PrismaClient

  ;(prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    (fnOrArr: unknown) => {
      if (typeof fnOrArr === "function") {
        return (fnOrArr as (tx: unknown) => unknown)(prisma)
      }
      return Promise.all(fnOrArr as unknown[])
    },
  )

  return prisma
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// deriveStatus
// ---------------------------------------------------------------------------

describe("deriveStatus", () => {
  const now = new Date("2026-05-01T00:00:00Z")

  it("returns inactive when schedule is disabled", () => {
    const status = service.deriveStatus(
      { isActive: false, nextDueAt: null, leadTimeDays: 14 },
      now,
    )
    expect(status).toBe("inactive")
  })

  it("returns ok when nextDueAt is null", () => {
    const status = service.deriveStatus(
      { isActive: true, nextDueAt: null, leadTimeDays: 14 },
      now,
    )
    expect(status).toBe("ok")
  })

  it("returns overdue when nextDueAt is before now", () => {
    const status = service.deriveStatus(
      {
        isActive: true,
        nextDueAt: new Date("2026-04-01T00:00:00Z"),
        leadTimeDays: 14,
      },
      now,
    )
    expect(status).toBe("overdue")
  })

  it("returns due_soon when nextDueAt is within leadTimeDays", () => {
    const status = service.deriveStatus(
      {
        isActive: true,
        nextDueAt: new Date("2026-05-10T00:00:00Z"), // +9 days
        leadTimeDays: 14,
      },
      now,
    )
    expect(status).toBe("due_soon")
  })

  it("returns ok when nextDueAt is far in the future", () => {
    const status = service.deriveStatus(
      {
        isActive: true,
        nextDueAt: new Date("2026-08-01T00:00:00Z"), // +90 days
        leadTimeDays: 14,
      },
      now,
    )
    expect(status).toBe("ok")
  })
})

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe("list", () => {
  it("delegates to repo and derives status per row", async () => {
    const now = new Date("2026-05-01T00:00:00Z")
    const prisma = makePrisma()
    ;(prisma.serviceSchedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
      [
        makeSchedule({ id: "row-1", nextDueAt: new Date("2026-04-01T00:00:00Z") }),
        makeSchedule({ id: "row-2", nextDueAt: null }),
      ],
    )
    ;(prisma.serviceSchedule.count as ReturnType<typeof vi.fn>).mockResolvedValue(2)

    const result = await service.list(prisma, TENANT_A, undefined, now)

    expect(result.items).toHaveLength(2)
    expect(result.items[0]!.status).toBe("overdue")
    expect(result.items[1]!.status).toBe("ok")
    expect(result.total).toBe(2)
  })

  it("filters derived status in memory", async () => {
    const now = new Date("2026-05-01T00:00:00Z")
    const prisma = makePrisma()
    ;(prisma.serviceSchedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
      [
        makeSchedule({ id: "overdue-1", nextDueAt: new Date("2026-04-01T00:00:00Z") }),
        makeSchedule({ id: "ok-1", nextDueAt: new Date("2026-08-01T00:00:00Z") }),
      ],
    )
    ;(prisma.serviceSchedule.count as ReturnType<typeof vi.fn>).mockResolvedValue(2)

    const result = await service.list(prisma, TENANT_A, { status: "overdue" }, now)

    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.id).toBe("overdue-1")
    expect(result.total).toBe(1)
  })

  it("passes serviceObjectId filter to repo", async () => {
    const prisma = makePrisma()
    ;(prisma.serviceSchedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.serviceSchedule.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)

    await service.list(prisma, TENANT_A, { serviceObjectId: SO_ID })

    const calls = (prisma.serviceSchedule.findMany as ReturnType<typeof vi.fn>)
      .mock.calls
    expect(calls[0]![0].where).toMatchObject({
      tenantId: TENANT_A,
      serviceObjectId: SO_ID,
    })
  })
})

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe("create", () => {
  it("sets nextDueAt = null for TIME_BASED with no completion yet", async () => {
    const prisma = makePrisma()
    ;(prisma.serviceSchedule.create as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSchedule(),
    )

    const result = await service.create(prisma, TENANT_A, {
      serviceObjectId: SO_ID,
      name: "Quartalsservice",
      intervalType: "TIME_BASED",
      intervalValue: 3,
      intervalUnit: "MONTHS",
    })

    expect(result.id).toBe(SCHEDULE_ID)
    const createCall = (prisma.serviceSchedule.create as ReturnType<typeof vi.fn>)
      .mock.calls[0]!
    expect(createCall[0].data.nextDueAt).toBeNull()
  })

  it("computes nextDueAt from anchorDate for CALENDAR_FIXED", async () => {
    const prisma = makePrisma()
    ;(prisma.serviceSchedule.create as ReturnType<typeof vi.fn>).mockImplementation(
      (args: { data: Record<string, unknown> }) => ({
        ...makeSchedule(),
        ...args.data,
      }),
    )

    const futureAnchor = new Date("2030-03-01")
    const result = await service.create(prisma, TENANT_A, {
      serviceObjectId: SO_ID,
      name: "DGUV V3",
      intervalType: "CALENDAR_FIXED",
      intervalValue: 1,
      intervalUnit: "YEARS",
      anchorDate: futureAnchor,
    })

    expect(result.status).toBeDefined()
    const createCall = (prisma.serviceSchedule.create as ReturnType<typeof vi.fn>)
      .mock.calls[0]!
    const nextDue = createCall[0].data.nextDueAt as Date
    expect(nextDue).toBeInstanceOf(Date)
    // Anchor is in the future, no advance needed
    expect(nextDue.getFullYear()).toBe(2030)
    expect(nextDue.getMonth()).toBe(2)
  })

  it("rejects intervalValue = 0 with ValidationError", async () => {
    const prisma = makePrisma()
    await expect(
      service.create(prisma, TENANT_A, {
        serviceObjectId: SO_ID,
        name: "Bad",
        intervalType: "TIME_BASED",
        intervalValue: 0,
        intervalUnit: "MONTHS",
      }),
    ).rejects.toBeInstanceOf(service.ServiceScheduleValidationError)
  })

  it("rejects CALENDAR_FIXED without anchorDate", async () => {
    const prisma = makePrisma()
    await expect(
      service.create(prisma, TENANT_A, {
        serviceObjectId: SO_ID,
        name: "Bad",
        intervalType: "CALENDAR_FIXED",
        intervalValue: 1,
        intervalUnit: "YEARS",
      }),
    ).rejects.toBeInstanceOf(service.ServiceScheduleValidationError)
  })

  it("rejects TIME_BASED with anchorDate", async () => {
    const prisma = makePrisma()
    await expect(
      service.create(prisma, TENANT_A, {
        serviceObjectId: SO_ID,
        name: "Bad",
        intervalType: "TIME_BASED",
        intervalValue: 1,
        intervalUnit: "YEARS",
        anchorDate: "2026-03-01",
      }),
    ).rejects.toBeInstanceOf(service.ServiceScheduleValidationError)
  })

  it("rejects when serviceObject not found in tenant", async () => {
    const prisma = makePrisma({
      serviceObject: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    })
    await expect(
      service.create(prisma, TENANT_A, {
        serviceObjectId: SO_ID,
        name: "Orphan",
        intervalType: "TIME_BASED",
        intervalValue: 1,
        intervalUnit: "YEARS",
      }),
    ).rejects.toBeInstanceOf(service.ServiceScheduleValidationError)
  })

  it("rejects empty name", async () => {
    const prisma = makePrisma()
    await expect(
      service.create(prisma, TENANT_A, {
        serviceObjectId: SO_ID,
        name: "   ",
        intervalType: "TIME_BASED",
        intervalValue: 1,
        intervalUnit: "YEARS",
      }),
    ).rejects.toBeInstanceOf(service.ServiceScheduleValidationError)
  })

  it("queries tenantId in serviceObject validation", async () => {
    const prisma = makePrisma()
    ;(prisma.serviceSchedule.create as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSchedule(),
    )

    await service.create(prisma, TENANT_A, {
      serviceObjectId: SO_ID,
      name: "Test",
      intervalType: "TIME_BASED",
      intervalValue: 1,
      intervalUnit: "YEARS",
    })

    const soCall = (prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>)
      .mock.calls[0]!
    expect(soCall[0].where).toMatchObject({ id: SO_ID, tenantId: TENANT_A })
  })
})

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe("update", () => {
  it("recomputes nextDueAt when interval changes", async () => {
    const existing = makeSchedule({
      lastCompletedAt: new Date("2026-03-01"),
      nextDueAt: new Date("2026-06-01"),
      intervalValue: 3,
      intervalUnit: "MONTHS",
    })
    const prisma = makePrisma()
    ;(prisma.serviceSchedule.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(existing) // initial load
      .mockResolvedValueOnce({ ...existing, intervalValue: 6 }) // refetch

    await service.update(prisma, TENANT_A, SCHEDULE_ID, {
      intervalValue: 6,
    })

    const updateMany = (prisma.serviceSchedule.updateMany as ReturnType<
      typeof vi.fn
    >).mock.calls[0]!
    // new nextDueAt = lastCompletedAt (2026-03-01) + 6 months = 2026-09-01
    const newNextDueAt = updateMany[0].data.nextDueAt as Date
    expect(newNextDueAt.getMonth()).toBe(8)
    expect(newNextDueAt.getDate()).toBe(1)
  })

  it("does not recompute nextDueAt when only name changes", async () => {
    const existing = makeSchedule({
      lastCompletedAt: new Date("2026-03-01"),
      nextDueAt: new Date("2026-06-01"),
    })
    const prisma = makePrisma()
    ;(prisma.serviceSchedule.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce({ ...existing, name: "Renamed" })

    await service.update(prisma, TENANT_A, SCHEDULE_ID, { name: "Renamed" })

    const updateMany = (prisma.serviceSchedule.updateMany as ReturnType<
      typeof vi.fn
    >).mock.calls[0]!
    expect(updateMany[0].data).not.toHaveProperty("nextDueAt")
  })

  it("throws NotFoundError when schedule missing", async () => {
    const prisma = makePrisma()
    ;(prisma.serviceSchedule.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    )

    await expect(
      service.update(prisma, TENANT_A, SCHEDULE_ID, { name: "X" }),
    ).rejects.toBeInstanceOf(service.ServiceScheduleNotFoundError)
  })

  it("rejects TIME_BASED update that leaves CALENDAR_FIXED without anchor", async () => {
    const existing = makeSchedule({
      intervalType: "CALENDAR_FIXED",
      anchorDate: new Date("2026-03-01"),
    })
    const prisma = makePrisma()
    ;(prisma.serviceSchedule.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      existing,
    )

    // Setting anchor=null while keeping CALENDAR_FIXED → invalid
    await expect(
      service.update(prisma, TENANT_A, SCHEDULE_ID, { anchorDate: null }),
    ).rejects.toBeInstanceOf(service.ServiceScheduleValidationError)
  })
})

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------

describe("remove", () => {
  it("hard-deletes the schedule", async () => {
    const prisma = makePrisma()
    ;(prisma.serviceSchedule.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSchedule(),
    )

    await service.remove(prisma, TENANT_A, SCHEDULE_ID, {
      userId: USER_ID,
    })

    expect(prisma.serviceSchedule.deleteMany).toHaveBeenCalledWith({
      where: { id: SCHEDULE_ID, tenantId: TENANT_A },
    })
  })

  it("throws NotFoundError when missing", async () => {
    const prisma = makePrisma()
    ;(prisma.serviceSchedule.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    )
    await expect(
      service.remove(prisma, TENANT_A, SCHEDULE_ID),
    ).rejects.toBeInstanceOf(service.ServiceScheduleNotFoundError)
  })
})

// ---------------------------------------------------------------------------
// generateOrder
// ---------------------------------------------------------------------------

describe("generateOrder", () => {
  it("creates order with serviceScheduleId back-link and WA- code", async () => {
    const prisma = makePrisma()
    ;(prisma.serviceSchedule.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSchedule(),
    )

    const result = await service.generateOrder(
      prisma,
      TENANT_A,
      SCHEDULE_ID,
      { createInitialAssignment: true },
      USER_ID,
    )

    expect(result.order?.code).toBe("WA-1")
    const orderCreate = (prisma.order.create as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(orderCreate[0].data).toMatchObject({
      tenantId: TENANT_A,
      serviceObjectId: SO_ID,
      serviceScheduleId: SCHEDULE_ID,
      status: "active",
    })
  })

  it("creates assignment when createInitialAssignment=true and responsibleEmployee exists", async () => {
    const prisma = makePrisma()
    ;(prisma.serviceSchedule.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSchedule(),
    )

    const result = await service.generateOrder(
      prisma,
      TENANT_A,
      SCHEDULE_ID,
      { createInitialAssignment: true },
      USER_ID,
    )

    expect(result.assignment).not.toBeNull()
    expect(prisma.orderAssignment.create).toHaveBeenCalledWith({
      data: {
        tenantId: TENANT_A,
        orderId: ORDER_ID,
        employeeId: EMPLOYEE_ID,
        role: "worker",
        isActive: true,
      },
    })
  })

  it("skips assignment when responsibleEmployee is null", async () => {
    const prisma = makePrisma()
    ;(prisma.serviceSchedule.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSchedule({ responsibleEmployeeId: null, responsibleEmployee: null }),
    )

    const result = await service.generateOrder(
      prisma,
      TENANT_A,
      SCHEDULE_ID,
      { createInitialAssignment: true },
      USER_ID,
    )

    expect(result.assignment).toBeNull()
    expect(prisma.orderAssignment.create).not.toHaveBeenCalled()
  })

  it("skips assignment when createInitialAssignment=false", async () => {
    const prisma = makePrisma()
    ;(prisma.serviceSchedule.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSchedule(),
    )

    const result = await service.generateOrder(
      prisma,
      TENANT_A,
      SCHEDULE_ID,
      { createInitialAssignment: false },
      USER_ID,
    )

    expect(result.assignment).toBeNull()
    expect(prisma.orderAssignment.create).not.toHaveBeenCalled()
  })

  it("writes two audit logs (service_schedule + order)", async () => {
    const prisma = makePrisma()
    ;(prisma.serviceSchedule.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSchedule(),
    )

    await service.generateOrder(
      prisma,
      TENANT_A,
      SCHEDULE_ID,
      { createInitialAssignment: true },
      USER_ID,
      { userId: USER_ID },
    )

    const auditCalls = (prisma.auditLog.create as ReturnType<typeof vi.fn>)
      .mock.calls
    expect(auditCalls.length).toBe(2)
    const actions = auditCalls.map((c) => c[0].data.action)
    expect(actions).toContain("generate_order")
    expect(actions).toContain("create")
  })

  it("does NOT touch lastCompletedAt or nextDueAt on the schedule", async () => {
    const prisma = makePrisma()
    ;(prisma.serviceSchedule.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSchedule(),
    )

    await service.generateOrder(
      prisma,
      TENANT_A,
      SCHEDULE_ID,
      { createInitialAssignment: false },
      USER_ID,
    )

    // No schedule-update during generateOrder
    expect(prisma.serviceSchedule.updateMany).not.toHaveBeenCalled()
  })

  it("throws NotFoundError when schedule missing", async () => {
    const prisma = makePrisma()
    ;(prisma.serviceSchedule.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    )

    await expect(
      service.generateOrder(
        prisma,
        TENANT_A,
        SCHEDULE_ID,
        { createInitialAssignment: true },
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(service.ServiceScheduleNotFoundError)
  })

  it("defends against cross-tenant via tenantId double-check", async () => {
    const prisma = makePrisma()
    // Simulate a router that somehow loaded schedule for wrong tenant
    ;(prisma.serviceSchedule.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      null, // repo.findById with where: { id, tenantId } returns null when tenant mismatch
    )

    await expect(
      service.generateOrder(
        prisma,
        TENANT_B,
        SCHEDULE_ID,
        { createInitialAssignment: true },
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(service.ServiceScheduleNotFoundError)
  })
})

// ---------------------------------------------------------------------------
// recordCompletion
// ---------------------------------------------------------------------------

describe("recordCompletion", () => {
  it("updates lastCompletedAt and recomputes nextDueAt", async () => {
    const prisma = makePrisma()
    ;(prisma.serviceSchedule.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(
        makeSchedule({
          intervalType: "TIME_BASED",
          intervalValue: 3,
          intervalUnit: "MONTHS",
        }),
      )
      .mockResolvedValueOnce(makeSchedule()) // refetch after update

    const completedAt = new Date("2026-04-01")
    await service.recordCompletion(
      prisma,
      TENANT_A,
      SCHEDULE_ID,
      completedAt,
    )

    const updateCall = (prisma.serviceSchedule.updateMany as ReturnType<
      typeof vi.fn
    >).mock.calls[0]!
    expect(updateCall[0].data.lastCompletedAt).toEqual(completedAt)
    const newNextDue = updateCall[0].data.nextDueAt as Date
    // April 1 + 3 months = July 1
    expect(newNextDue.getMonth()).toBe(6) // July
    expect(newNextDue.getDate()).toBe(1)
  })

  it("silently no-ops when schedule is deactivated", async () => {
    const prisma = makePrisma()
    ;(prisma.serviceSchedule.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSchedule({ isActive: false }),
    )

    await service.recordCompletion(
      prisma,
      TENANT_A,
      SCHEDULE_ID,
      new Date("2026-04-01"),
    )

    expect(prisma.serviceSchedule.updateMany).not.toHaveBeenCalled()
  })

  it("silently no-ops when schedule is missing", async () => {
    const prisma = makePrisma()
    ;(prisma.serviceSchedule.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    )

    await expect(
      service.recordCompletion(
        prisma,
        TENANT_A,
        SCHEDULE_ID,
        new Date("2026-04-01"),
      ),
    ).resolves.toBeUndefined()
    expect(prisma.serviceSchedule.updateMany).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// getDashboardSummary
// ---------------------------------------------------------------------------

describe("getDashboardSummary", () => {
  it("returns counts from repo.countByStatus", async () => {
    const prisma = makePrisma()
    ;(prisma.serviceSchedule.count as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(3) // overdue
      .mockResolvedValueOnce(12) // due soon
      .mockResolvedValueOnce(42) // ok

    const result = await service.getDashboardSummary(prisma, TENANT_A)

    expect(result).toEqual({
      overdueCount: 3,
      dueSoonCount: 12,
      okCount: 42,
    })
  })

  it("scopes counts to tenantId", async () => {
    const prisma = makePrisma()
    ;(prisma.serviceSchedule.count as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)

    await service.getDashboardSummary(prisma, TENANT_A)

    const calls = (prisma.serviceSchedule.count as ReturnType<typeof vi.fn>)
      .mock.calls
    for (const call of calls) {
      expect(call[0].where).toMatchObject({ tenantId: TENANT_A })
    }
  })
})

// ---------------------------------------------------------------------------
// Tenant-scoping verification
// ---------------------------------------------------------------------------

describe("tenant scoping", () => {
  it("list() passes tenantId into repo.findMany where-clause", async () => {
    const prisma = makePrisma()
    ;(prisma.serviceSchedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.serviceSchedule.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)

    await service.list(prisma, TENANT_A)

    const findMany = (prisma.serviceSchedule.findMany as ReturnType<typeof vi.fn>)
      .mock.calls[0]!
    expect(findMany[0].where.tenantId).toBe(TENANT_A)
  })

  it("getById() passes tenantId", async () => {
    const prisma = makePrisma()
    ;(prisma.serviceSchedule.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSchedule(),
    )

    await service.getById(prisma, TENANT_A, SCHEDULE_ID)

    const findFirst = (prisma.serviceSchedule.findFirst as ReturnType<typeof vi.fn>)
      .mock.calls[0]!
    expect(findFirst[0].where).toMatchObject({
      id: SCHEDULE_ID,
      tenantId: TENANT_A,
    })
  })
})
