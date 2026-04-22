/**
 * ServiceSchedules Router Tests
 *
 * Covers the 8 procedures on `serviceSchedulesRouter`:
 * - Permission gating (view / manage / delete / generate_order)
 * - Tenant-header validation
 * - Happy-path reads (list / getById / listByServiceObject / getDashboardSummary)
 * - Happy-path writes (create / update / delete / generateOrder)
 * - Zod input validation (CALENDAR_FIXED without anchorDate → BAD_REQUEST)
 *
 * Plan: 2026-04-22-serviceobjekte-wartungsintervalle.md (Phase D)
 */
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { serviceSchedulesRouter } from "../serviceSchedules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// requireModule("crm") uses db.prisma.tenantModule.findUnique.
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "crm" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}))

// --- Constants ---
const SCHED_VIEW = permissionIdByKey("service_schedules.view")!
const SCHED_MANAGE = permissionIdByKey("service_schedules.manage")!
const SCHED_DELETE = permissionIdByKey("service_schedules.delete")!
const SCHED_GENERATE_ORDER = permissionIdByKey(
  "service_schedules.generate_order"
)!

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const OTHER_TENANT_ID = "b0000000-0000-4000-b000-000000000200"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const SO_ID = "50000000-0000-4000-a000-000000000001"
const CUSTOMER_ID = "c0000000-0000-4000-a000-000000000001"
const ACTIVITY_ID = "ac000000-0000-4000-a000-000000000001"
const EMPLOYEE_ID = "e0000000-0000-4000-a000-000000000001"
const SCHEDULE_ID = "55000000-0000-4000-a000-000000000001"
const ORDER_ID = "00000000-0000-4000-a000-000000000001"

const createCaller = createCallerFactory(serviceSchedulesRouter)

const MODULE_MOCK = {
  tenantModule: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "crm" }),
  },
}

function withModuleMock(prisma: Record<string, unknown>) {
  return { ...MODULE_MOCK, ...prisma }
}

function ctx(
  prisma: Record<string, unknown>,
  permissions: string[] = [
    SCHED_VIEW,
    SCHED_MANAGE,
    SCHED_DELETE,
    SCHED_GENERATE_ORDER,
  ],
  tenantId: string | null = TENANT_ID
) {
  return createMockContext({
    prisma: withModuleMock(prisma) as unknown as ReturnType<
      typeof createMockContext
    >["prisma"],
    authToken: "tok",
    user: createUserWithPermissions(permissions, {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId,
  })
}

// --- Fixtures ---

const baseServiceObjectRel = {
  id: SO_ID,
  number: "SO-001",
  name: "Kältemaschine Halle 2",
  kind: "EQUIPMENT" as const,
  customerAddress: {
    id: CUSTOMER_ID,
    number: "K-001",
    company: "Firma A",
  },
}

function makeScheduleRow(
  overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    id: SCHEDULE_ID,
    tenantId: TENANT_ID,
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
    serviceObject: baseServiceObjectRel,
    defaultActivity: {
      id: ACTIVITY_ID,
      code: "WARTUNG",
      name: "Wartung",
    },
    responsibleEmployee: {
      id: EMPLOYEE_ID,
      firstName: "Hans",
      lastName: "Müller",
    },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Permission gating
// ---------------------------------------------------------------------------

describe("serviceSchedules router — permission checks", () => {
  it("rejects list without service_schedules.view permission", async () => {
    const caller = createCaller(
      ctx(
        {
          serviceSchedule: {
            findMany: vi.fn().mockResolvedValue([]),
            count: vi.fn().mockResolvedValue(0),
          },
        },
        /* no permissions */ []
      )
    )
    await expect(caller.list({})).rejects.toThrow()
  })

  it("rejects create without service_schedules.manage permission", async () => {
    const caller = createCaller(
      ctx(
        {
          serviceSchedule: { create: vi.fn() },
          serviceObject: { findFirst: vi.fn() },
        },
        [SCHED_VIEW] // view only
      )
    )
    await expect(
      caller.create({
        serviceObjectId: SO_ID,
        name: "Quartalsservice",
        intervalType: "TIME_BASED",
        intervalValue: 3,
        intervalUnit: "MONTHS",
      })
    ).rejects.toThrow()
  })

  it("rejects delete without service_schedules.delete permission", async () => {
    const caller = createCaller(
      ctx(
        {
          serviceSchedule: { findFirst: vi.fn() },
        },
        [SCHED_VIEW, SCHED_MANAGE]
      )
    )
    await expect(caller.delete({ id: SCHEDULE_ID })).rejects.toThrow()
  })

  it("rejects generateOrder without service_schedules.generate_order permission", async () => {
    const caller = createCaller(
      ctx(
        {
          serviceSchedule: { findFirst: vi.fn() },
        },
        [SCHED_VIEW, SCHED_MANAGE, SCHED_DELETE] // no generate_order
      )
    )
    await expect(
      caller.generateOrder({
        id: SCHEDULE_ID,
        createInitialAssignment: true,
      })
    ).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Tenant header validation
// ---------------------------------------------------------------------------

describe("serviceSchedules router — tenant header validation", () => {
  it("rejects when tenantId is missing in context", async () => {
    const caller = createCaller(
      ctx(
        {
          serviceSchedule: {
            findMany: vi.fn().mockResolvedValue([]),
            count: vi.fn().mockResolvedValue(0),
          },
        },
        [SCHED_VIEW],
        /* no tenant */ null
      )
    )
    await expect(caller.list({})).rejects.toThrow()
  })

  it("rejects when user has no membership in the given tenant", async () => {
    const caller = createCaller(
      ctx(
        {
          serviceSchedule: {
            findMany: vi.fn().mockResolvedValue([]),
            count: vi.fn().mockResolvedValue(0),
          },
        },
        [SCHED_VIEW],
        OTHER_TENANT_ID // user only belongs to TENANT_ID
      )
    )
    await expect(caller.list({})).rejects.toThrow(/tenant/i)
  })
})

// ---------------------------------------------------------------------------
// Read procedures
// ---------------------------------------------------------------------------

describe("serviceSchedules router — list / getById / listByServiceObject", () => {
  it("list returns tenant-scoped page with enriched status", async () => {
    const caller = createCaller(
      ctx({
        serviceSchedule: {
          findMany: vi.fn().mockResolvedValue([makeScheduleRow()]),
          count: vi.fn().mockResolvedValue(1),
        },
      })
    )
    const res = await caller.list({ page: 1, pageSize: 25 })
    expect(res?.total).toBe(1)
    expect(res?.items).toHaveLength(1)
    // `status` is derived, should be present on every row
    expect(res?.items[0]).toHaveProperty("status")
  })

  it("list forwards page/pageSize to service", async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const count = vi.fn().mockResolvedValue(0)
    const caller = createCaller(
      ctx({
        serviceSchedule: { findMany, count },
      })
    )
    await caller.list({ page: 2, pageSize: 10 })
    // findMany in repo uses skip/take derived from page + pageSize
    expect(findMany).toHaveBeenCalledTimes(1)
    const call = findMany.mock.calls[0]![0] as {
      skip: number
      take: number
    }
    expect(call.skip).toBe(10)
    expect(call.take).toBe(10)
  })

  it("getById returns the enriched DTO for an existing schedule", async () => {
    const caller = createCaller(
      ctx({
        serviceSchedule: {
          findFirst: vi.fn().mockResolvedValue(makeScheduleRow()),
        },
      })
    )
    const res = await caller.getById({ id: SCHEDULE_ID })
    expect(res?.id).toBe(SCHEDULE_ID)
    expect(res?.status).toBeDefined()
  })

  it("getById throws NOT_FOUND when schedule missing", async () => {
    const caller = createCaller(
      ctx({
        serviceSchedule: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      })
    )
    await expect(caller.getById({ id: SCHEDULE_ID })).rejects.toThrow()
  })

  it("listByServiceObject forwards serviceObjectId", async () => {
    const findMany = vi.fn().mockResolvedValue([makeScheduleRow()])
    const caller = createCaller(
      ctx({
        serviceSchedule: { findMany },
      })
    )
    const res = await caller.listByServiceObject({ serviceObjectId: SO_ID })
    expect(res).toHaveLength(1)
    // The repo-level findMany receives a where with both tenantId and serviceObjectId
    expect(findMany).toHaveBeenCalledTimes(1)
    const where = (findMany.mock.calls[0]![0] as { where: Record<string, unknown> })
      .where
    expect(where).toMatchObject({ tenantId: TENANT_ID, serviceObjectId: SO_ID })
  })

  it("getDashboardSummary returns the 3-bucket count object", async () => {
    const caller = createCaller(
      ctx({
        serviceSchedule: {
          count: vi
            .fn()
            .mockResolvedValueOnce(3) // overdue
            .mockResolvedValueOnce(7) // dueSoon
            .mockResolvedValueOnce(42), // ok
        },
      })
    )
    const res = await caller.getDashboardSummary()
    expect(res).toEqual({
      overdueCount: 3,
      dueSoonCount: 7,
      okCount: 42,
    })
  })
})

// ---------------------------------------------------------------------------
// Zod input validation (BAD_REQUEST wins before service layer runs)
// ---------------------------------------------------------------------------

describe("serviceSchedules router — input validation", () => {
  it("rejects CALENDAR_FIXED without anchorDate (BAD_REQUEST)", async () => {
    const caller = createCaller(
      ctx({
        serviceSchedule: { create: vi.fn() },
        serviceObject: { findFirst: vi.fn() },
      })
    )
    await expect(
      caller.create({
        serviceObjectId: SO_ID,
        name: "DGUV V3",
        intervalType: "CALENDAR_FIXED",
        intervalValue: 1,
        intervalUnit: "YEARS",
        // anchorDate intentionally missing
      })
    ).rejects.toThrow()
  })

  it("rejects TIME_BASED with anchorDate (BAD_REQUEST)", async () => {
    const caller = createCaller(
      ctx({
        serviceSchedule: { create: vi.fn() },
        serviceObject: { findFirst: vi.fn() },
      })
    )
    await expect(
      caller.create({
        serviceObjectId: SO_ID,
        name: "Quartalsservice",
        intervalType: "TIME_BASED",
        intervalValue: 3,
        intervalUnit: "MONTHS",
        anchorDate: "2026-03-01",
      })
    ).rejects.toThrow()
  })

  it("rejects intervalValue < 1 (BAD_REQUEST)", async () => {
    const caller = createCaller(
      ctx({
        serviceSchedule: { create: vi.fn() },
        serviceObject: { findFirst: vi.fn() },
      })
    )
    await expect(
      caller.create({
        serviceObjectId: SO_ID,
        name: "Bad",
        intervalType: "TIME_BASED",
        intervalValue: 0,
        intervalUnit: "MONTHS",
      })
    ).rejects.toThrow()
  })

  it("rejects anchorDate more than 100 years in the past", async () => {
    const caller = createCaller(
      ctx({
        serviceSchedule: { create: vi.fn() },
        serviceObject: { findFirst: vi.fn() },
      })
    )
    await expect(
      caller.create({
        serviceObjectId: SO_ID,
        name: "Ancient",
        intervalType: "CALENDAR_FIXED",
        intervalValue: 1,
        intervalUnit: "YEARS",
        anchorDate: "1900-03-01",
      })
    ).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Create / Update / Delete happy paths
// ---------------------------------------------------------------------------

describe("serviceSchedules router — create / update / delete", () => {
  it("create TIME_BASED passes through to service and returns DTO", async () => {
    const created = makeScheduleRow({ name: "Quartalsservice" })
    const caller = createCaller(
      ctx({
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
          create: vi.fn().mockResolvedValue(created),
        },
      })
    )
    const res = await caller.create({
      serviceObjectId: SO_ID,
      name: "Quartalsservice",
      intervalType: "TIME_BASED",
      intervalValue: 3,
      intervalUnit: "MONTHS",
      defaultActivityId: ACTIVITY_ID,
      responsibleEmployeeId: EMPLOYEE_ID,
    })
    expect(res?.id).toBe(SCHEDULE_ID)
    expect(res?.name).toBe("Quartalsservice")
    expect(res?.status).toBeDefined()
  })

  it("update forwards id + partial fields to service", async () => {
    const existing = makeScheduleRow()
    const updated = { ...existing, name: "Halbjahresservice" }
    // tenantScopedUpdate calls findFirst → updateMany → findFirst (refetch),
    // and service.update additionally calls findFirst first to load `existing`.
    // Sequence: [service.findById, tenantScopedUpdate.refetch]
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(updated)
    const caller = createCaller(
      ctx({
        serviceSchedule: {
          findFirst,
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      })
    )
    const res = await caller.update({
      id: SCHEDULE_ID,
      name: "Halbjahresservice",
    })
    expect(res?.name).toBe("Halbjahresservice")
  })

  it("delete returns success sentinel", async () => {
    const caller = createCaller(
      ctx({
        serviceSchedule: {
          findFirst: vi.fn().mockResolvedValue(makeScheduleRow()),
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      })
    )
    const res = await caller.delete({ id: SCHEDULE_ID })
    expect(res).toEqual({ success: true })
  })
})

// ---------------------------------------------------------------------------
// generateOrder happy path
// ---------------------------------------------------------------------------

describe("serviceSchedules router — generateOrder", () => {
  it("returns { order, assignment, schedule } on success", async () => {
    const schedule = makeScheduleRow()
    const mockOrder = {
      id: ORDER_ID,
      tenantId: TENANT_ID,
      code: "WA-1",
      name: "Quartalsservice",
      description: null,
      status: "active",
      customer: "Firma A",
      costCenterId: null,
      serviceObjectId: SO_ID,
      serviceScheduleId: SCHEDULE_ID,
      billingRatePerHour: null,
      validFrom: null,
      validTo: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      costCenter: null,
    }
    const mockAssignment = {
      id: "oa000000-0000-4000-a000-000000000001",
      orderId: ORDER_ID,
      employeeId: EMPLOYEE_ID,
      role: "worker",
      isActive: true,
    }

    const caller = createCaller(
      ctx({
        serviceSchedule: {
          findFirst: vi.fn().mockResolvedValue(schedule),
        },
        order: {
          create: vi.fn().mockResolvedValue(mockOrder),
          findFirst: vi.fn().mockResolvedValue(mockOrder),
        },
        orderAssignment: {
          create: vi.fn().mockResolvedValue(mockAssignment),
        },
        numberSequence: {
          upsert: vi.fn().mockResolvedValue({ prefix: "WA-", nextValue: 2 }),
        },
        $transaction: vi
          .fn()
          .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
            fn({
              serviceSchedule: {
                findFirst: vi.fn().mockResolvedValue(schedule),
              },
              order: {
                create: vi.fn().mockResolvedValue(mockOrder),
                findFirst: vi.fn().mockResolvedValue(mockOrder),
              },
              orderAssignment: {
                create: vi.fn().mockResolvedValue(mockAssignment),
              },
              numberSequence: {
                upsert: vi
                  .fn()
                  .mockResolvedValue({ prefix: "WA-", nextValue: 2 }),
              },
              auditLog: { create: vi.fn().mockResolvedValue({}) },
              platformAuditLog: {
                create: vi.fn().mockResolvedValue({}),
              },
            })
          ),
      })
    )
    const res = await caller.generateOrder({
      id: SCHEDULE_ID,
      createInitialAssignment: true,
    })
    expect(res?.order?.code).toBe("WA-1")
    expect(res?.assignment?.employeeId).toBe(EMPLOYEE_ID)
    expect(res?.schedule?.id).toBe(SCHEDULE_ID)
  })
})
