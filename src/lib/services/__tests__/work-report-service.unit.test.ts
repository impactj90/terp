/**
 * Unit tests for work-report-service (Phase 2: DRAFT CRUD).
 *
 * Uses a hand-rolled Prisma mock — no real DB. Integration coverage
 * lives in `work-report-service.integration.test.ts`.
 *
 * Plan: 2026-04-22-workreport-arbeitsschein-m1.md (Phase 2)
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { PrismaClient } from "@/generated/prisma/client"
import * as service from "../work-report-service"

// --- Constants ---

const TENANT_A = "a0000000-0000-4000-a000-000000007701"
const TENANT_B = "a0000000-0000-4000-a000-000000007702"
const USER_ID = "a0000000-0000-4000-a000-000000007703"
const ORDER_ID = "a0000000-0000-4000-a000-000000007704"
const SO_ID = "a0000000-0000-4000-a000-000000007705"
const WORK_REPORT_ID = "a0000000-0000-4000-a000-000000007706"

function makeReport(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: WORK_REPORT_ID,
    tenantId: TENANT_A,
    orderId: ORDER_ID,
    serviceObjectId: null,
    code: "AS-1",
    visitDate: new Date("2026-04-22T00:00:00Z"),
    travelMinutes: null,
    workDescription: null,
    status: "DRAFT" as const,
    signedAt: null,
    signedById: null,
    signerName: null,
    signerRole: null,
    signerIpHash: null,
    signaturePath: null,
    pdfUrl: null,
    voidedAt: null,
    voidedById: null,
    voidReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdById: USER_ID,
    order: { id: ORDER_ID, code: "A-1", name: "Auftrag", customer: null },
    serviceObject: null,
    assignments: [],
    attachments: [],
    ...overrides,
  }
}

// --- Mock Prisma factory ---

interface PrismaMocks {
  orderFindFirst: ReturnType<typeof vi.fn>
  serviceObjectFindFirst: ReturnType<typeof vi.fn>
  workReportFindFirst: ReturnType<typeof vi.fn>
  workReportFindMany: ReturnType<typeof vi.fn>
  workReportCount: ReturnType<typeof vi.fn>
  workReportCreate: ReturnType<typeof vi.fn>
  workReportUpdateMany: ReturnType<typeof vi.fn>
  workReportDeleteMany: ReturnType<typeof vi.fn>
  numberSequenceUpsert: ReturnType<typeof vi.fn>
  auditLogCreate: ReturnType<typeof vi.fn>
}

function makePrisma(): { prisma: PrismaClient; mocks: PrismaMocks } {
  const mocks: PrismaMocks = {
    orderFindFirst: vi.fn().mockResolvedValue({ id: ORDER_ID }),
    serviceObjectFindFirst: vi.fn().mockResolvedValue({ id: SO_ID }),
    workReportFindFirst: vi.fn(),
    workReportFindMany: vi.fn().mockResolvedValue([]),
    workReportCount: vi.fn().mockResolvedValue(0),
    workReportCreate: vi.fn(),
    workReportUpdateMany: vi.fn().mockResolvedValue({ count: 1 }),
    workReportDeleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    numberSequenceUpsert: vi
      .fn()
      .mockResolvedValue({ prefix: "AS-", nextValue: 2 }),
    auditLogCreate: vi.fn().mockResolvedValue({}),
  }

  const prisma = {
    order: { findFirst: mocks.orderFindFirst },
    serviceObject: { findFirst: mocks.serviceObjectFindFirst },
    workReport: {
      findFirst: mocks.workReportFindFirst,
      findMany: mocks.workReportFindMany,
      count: mocks.workReportCount,
      create: mocks.workReportCreate,
      updateMany: mocks.workReportUpdateMany,
      deleteMany: mocks.workReportDeleteMany,
    },
    numberSequence: { upsert: mocks.numberSequenceUpsert },
    auditLog: { create: mocks.auditLogCreate },
    platformAuditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(),
  } as unknown as PrismaClient

  ;(prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    (fnOrArr: unknown) => {
      if (typeof fnOrArr === "function") {
        return (fnOrArr as (tx: unknown) => unknown)(prisma)
      }
      return Promise.all(fnOrArr as unknown[])
    },
  )

  return { prisma, mocks }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe("create", () => {
  it("allocates an AS- code, writes a DRAFT row, and emits a create audit log", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportCreate.mockResolvedValueOnce(makeReport({ code: "AS-1" }))

    const result = await service.create(
      prisma,
      TENANT_A,
      {
        orderId: ORDER_ID,
        visitDate: "2026-04-22",
        workDescription: "Filter gewechselt",
      },
      { userId: USER_ID },
    )

    expect(result.code).toBe("AS-1")
    expect(result.status).toBe("DRAFT")

    // Sequence upsert was called with the `work_report` key.
    expect(mocks.numberSequenceUpsert).toHaveBeenCalledTimes(1)
    const seqArgs = mocks.numberSequenceUpsert.mock.calls[0]![0]
    expect(seqArgs.where.tenantId_key).toEqual({
      tenantId: TENANT_A,
      key: "work_report",
    })

    // Create was called with normalized data and tenant scoping.
    expect(mocks.workReportCreate).toHaveBeenCalledTimes(1)
    const createArgs = mocks.workReportCreate.mock.calls[0]![0]
    expect(createArgs.data.tenantId).toBe(TENANT_A)
    expect(createArgs.data.orderId).toBe(ORDER_ID)
    expect(createArgs.data.code).toMatch(/^AS-\d+$/)
    expect(createArgs.data.status).toBe("DRAFT")
    expect(createArgs.data.workDescription).toBe("Filter gewechselt")

    // Audit row emitted.
    expect(mocks.auditLogCreate).toHaveBeenCalledTimes(1)
    const auditArgs = mocks.auditLogCreate.mock.calls[0]![0]
    expect(auditArgs.data.action).toBe("create")
    expect(auditArgs.data.entityType).toBe("work_report")
    expect(auditArgs.data.entityName).toBe("AS-1")
  })

  it("rejects when Order does not belong to the tenant", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.orderFindFirst.mockResolvedValueOnce(null)

    await expect(
      service.create(
        prisma,
        TENANT_A,
        { orderId: ORDER_ID, visitDate: "2026-04-22" },
        { userId: USER_ID },
      ),
    ).rejects.toMatchObject({ name: "WorkReportValidationError" })

    // No sequence allocated, no insert attempted.
    expect(mocks.numberSequenceUpsert).not.toHaveBeenCalled()
    expect(mocks.workReportCreate).not.toHaveBeenCalled()
  })

  it("rejects when ServiceObject belongs to another tenant", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.serviceObjectFindFirst.mockResolvedValueOnce(null)

    await expect(
      service.create(
        prisma,
        TENANT_A,
        {
          orderId: ORDER_ID,
          serviceObjectId: SO_ID,
          visitDate: "2026-04-22",
        },
        { userId: USER_ID },
      ),
    ).rejects.toMatchObject({ name: "WorkReportValidationError" })

    expect(mocks.workReportCreate).not.toHaveBeenCalled()
  })

  it("trims the workDescription and maps empty strings to null", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportCreate.mockResolvedValueOnce(makeReport())

    await service.create(
      prisma,
      TENANT_A,
      { orderId: ORDER_ID, visitDate: "2026-04-22", workDescription: "   " },
      { userId: USER_ID },
    )

    const createArgs = mocks.workReportCreate.mock.calls[0]![0]
    expect(createArgs.data.workDescription).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe("update", () => {
  it("applies the partial update when the record is in DRAFT", async () => {
    const { prisma, mocks } = makePrisma()
    const before = makeReport({ workDescription: "alt" })
    const after = makeReport({ workDescription: "neu" })

    // findById pre-fetch + post-update re-fetch both resolve with the
    // mocked record.
    mocks.workReportFindFirst
      .mockResolvedValueOnce(before) // pre-fetch (with include)
      .mockResolvedValueOnce(after) // post-fetch (with include)

    const result = await service.update(
      prisma,
      TENANT_A,
      { id: WORK_REPORT_ID, workDescription: "neu" },
      { userId: USER_ID },
    )

    expect(result.workDescription).toBe("neu")

    // Atomic DRAFT-guard updateMany invoked with the status filter.
    expect(mocks.workReportUpdateMany).toHaveBeenCalledTimes(1)
    const updateArgs = mocks.workReportUpdateMany.mock.calls[0]![0]
    expect(updateArgs.where).toMatchObject({
      id: WORK_REPORT_ID,
      tenantId: TENANT_A,
      status: "DRAFT",
    })
    expect(updateArgs.data.workDescription).toBe("neu")

    // Audit row for `update`.
    expect(mocks.auditLogCreate).toHaveBeenCalledTimes(1)
    const auditArgs = mocks.auditLogCreate.mock.calls[0]![0]
    expect(auditArgs.data.action).toBe("update")
    expect(auditArgs.data.entityType).toBe("work_report")
  })

  it("rejects edits on a SIGNED record with WorkReportValidationError", async () => {
    const { prisma, mocks } = makePrisma()
    const signed = makeReport({ status: "SIGNED" as const })

    mocks.workReportFindFirst.mockResolvedValueOnce(signed) // pre-fetch
    // updateMany returns count 0 because the status filter doesn't match.
    mocks.workReportUpdateMany.mockResolvedValueOnce({ count: 0 })
    // Simple re-fetch to disambiguate NotFound vs NotEditable.
    mocks.workReportFindFirst.mockResolvedValueOnce({
      id: WORK_REPORT_ID,
      status: "SIGNED",
      tenantId: TENANT_A,
      code: "AS-1",
    })

    await expect(
      service.update(
        prisma,
        TENANT_A,
        { id: WORK_REPORT_ID, workDescription: "neu" },
        { userId: USER_ID },
      ),
    ).rejects.toMatchObject({ name: "WorkReportValidationError" })

    // No audit row written on validation failure.
    expect(mocks.auditLogCreate).not.toHaveBeenCalled()
  })

  it("wraps the race-condition (existing DRAFT, count=0) in WorkReportConflictError", async () => {
    const { prisma, mocks } = makePrisma()
    const draft = makeReport()

    mocks.workReportFindFirst.mockResolvedValueOnce(draft) // pre-fetch
    mocks.workReportUpdateMany.mockResolvedValueOnce({ count: 0 })
    // Re-fetch shows the row is STILL DRAFT — signals a transient race,
    // not a status flip.
    mocks.workReportFindFirst.mockResolvedValueOnce({
      id: WORK_REPORT_ID,
      status: "DRAFT",
      tenantId: TENANT_A,
      code: "AS-1",
    })

    await expect(
      service.update(
        prisma,
        TENANT_A,
        { id: WORK_REPORT_ID, workDescription: "neu" },
        { userId: USER_ID },
      ),
    ).rejects.toMatchObject({ name: "WorkReportConflictError" })
  })

  it("maps NotFound to WorkReportNotFoundError", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst.mockResolvedValueOnce(null)

    await expect(
      service.update(
        prisma,
        TENANT_A,
        { id: WORK_REPORT_ID, workDescription: "neu" },
        { userId: USER_ID },
      ),
    ).rejects.toMatchObject({ name: "WorkReportNotFoundError" })
  })

  it("no-op update still enforces the DRAFT guard on SIGNED records", async () => {
    const { prisma, mocks } = makePrisma()
    const signed = makeReport({ status: "SIGNED" as const })
    mocks.workReportFindFirst.mockResolvedValueOnce(signed)

    await expect(
      service.update(
        prisma,
        TENANT_A,
        { id: WORK_REPORT_ID },
        { userId: USER_ID },
      ),
    ).rejects.toMatchObject({ name: "WorkReportValidationError" })

    // updateMany never called — we short-circuited on the empty payload.
    expect(mocks.workReportUpdateMany).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------

describe("remove", () => {
  it("deletes a DRAFT record and emits a delete audit log", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst.mockResolvedValueOnce({
      id: WORK_REPORT_ID,
      status: "DRAFT",
      tenantId: TENANT_A,
      code: "AS-1",
    })

    await service.remove(prisma, TENANT_A, WORK_REPORT_ID, { userId: USER_ID })

    expect(mocks.workReportDeleteMany).toHaveBeenCalledTimes(1)
    const delArgs = mocks.workReportDeleteMany.mock.calls[0]![0]
    expect(delArgs.where).toMatchObject({
      id: WORK_REPORT_ID,
      tenantId: TENANT_A,
      status: "DRAFT",
    })

    expect(mocks.auditLogCreate).toHaveBeenCalledTimes(1)
    expect(mocks.auditLogCreate.mock.calls[0]![0].data.action).toBe("delete")
    expect(mocks.auditLogCreate.mock.calls[0]![0].data.entityName).toBe("AS-1")
  })

  it("rejects deletion of a SIGNED record", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst.mockResolvedValueOnce({
      id: WORK_REPORT_ID,
      status: "SIGNED",
      tenantId: TENANT_A,
      code: "AS-1",
    })

    await expect(
      service.remove(prisma, TENANT_A, WORK_REPORT_ID, { userId: USER_ID }),
    ).rejects.toMatchObject({ name: "WorkReportValidationError" })

    expect(mocks.workReportDeleteMany).not.toHaveBeenCalled()
    expect(mocks.auditLogCreate).not.toHaveBeenCalled()
  })

  it("rejects deletion of a VOID record", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst.mockResolvedValueOnce({
      id: WORK_REPORT_ID,
      status: "VOID",
      tenantId: TENANT_A,
      code: "AS-1",
    })

    await expect(
      service.remove(prisma, TENANT_A, WORK_REPORT_ID, { userId: USER_ID }),
    ).rejects.toMatchObject({ name: "WorkReportValidationError" })
  })

  it("detects a race where pre-check sees DRAFT but deleteMany hits count=0", async () => {
    const { prisma, mocks } = makePrisma()
    // Pre-check: record is DRAFT.
    mocks.workReportFindFirst.mockResolvedValueOnce({
      id: WORK_REPORT_ID,
      status: "DRAFT",
      tenantId: TENANT_A,
      code: "AS-1",
    })
    // deleteMany with status filter sees zero rows (someone signed it
    // concurrently).
    mocks.workReportDeleteMany.mockResolvedValueOnce({ count: 0 })
    // Re-fetch shows the row now SIGNED.
    mocks.workReportFindFirst.mockResolvedValueOnce({
      id: WORK_REPORT_ID,
      status: "SIGNED",
      tenantId: TENANT_A,
      code: "AS-1",
    })

    await expect(
      service.remove(prisma, TENANT_A, WORK_REPORT_ID, { userId: USER_ID }),
    ).rejects.toMatchObject({ name: "WorkReportValidationError" })

    expect(mocks.auditLogCreate).not.toHaveBeenCalled()
  })

  it("maps NotFound to WorkReportNotFoundError", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst.mockResolvedValueOnce(null)

    await expect(
      service.remove(prisma, TENANT_A, WORK_REPORT_ID, { userId: USER_ID }),
    ).rejects.toMatchObject({ name: "WorkReportNotFoundError" })
  })
})

// ---------------------------------------------------------------------------
// Read paths
// ---------------------------------------------------------------------------

describe("getById", () => {
  it("returns the report when present", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst.mockResolvedValueOnce(makeReport())

    const result = await service.getById(prisma, TENANT_A, WORK_REPORT_ID)
    expect(result.code).toBe("AS-1")
  })

  it("throws WorkReportNotFoundError for a missing record", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst.mockResolvedValueOnce(null)

    await expect(
      service.getById(prisma, TENANT_A, WORK_REPORT_ID),
    ).rejects.toMatchObject({ name: "WorkReportNotFoundError" })
  })

  it("scopes by tenant — Tenant-B caller sees nothing even with the right id", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst.mockResolvedValueOnce(null)

    await expect(
      service.getById(prisma, TENANT_B, WORK_REPORT_ID),
    ).rejects.toMatchObject({ name: "WorkReportNotFoundError" })

    // Verify the repo query used Tenant-B in its where filter.
    const findArgs = mocks.workReportFindFirst.mock.calls[0]![0]
    expect(findArgs.where.tenantId).toBe(TENANT_B)
  })
})

describe("list / listByOrder / listByServiceObject", () => {
  it("list returns items + total with tenant filter", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindMany.mockResolvedValueOnce([makeReport()])
    mocks.workReportCount.mockResolvedValueOnce(1)

    const result = await service.list(prisma, TENANT_A)

    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)

    const findArgs = mocks.workReportFindMany.mock.calls[0]![0]
    expect(findArgs.where).toMatchObject({ tenantId: TENANT_A })
  })

  it("list passes status + orderId filter down to the repo", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindMany.mockResolvedValueOnce([])
    mocks.workReportCount.mockResolvedValueOnce(0)

    await service.list(prisma, TENANT_A, {
      status: "DRAFT",
      orderId: ORDER_ID,
    })

    const findArgs = mocks.workReportFindMany.mock.calls[0]![0]
    expect(findArgs.where).toMatchObject({
      tenantId: TENANT_A,
      status: "DRAFT",
      orderId: ORDER_ID,
    })
  })

  it("listByOrder scopes by order_id + tenant", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindMany.mockResolvedValueOnce([makeReport()])

    await service.listByOrder(prisma, TENANT_A, ORDER_ID)

    const findArgs = mocks.workReportFindMany.mock.calls[0]![0]
    expect(findArgs.where).toMatchObject({
      tenantId: TENANT_A,
      orderId: ORDER_ID,
    })
  })

  it("listByServiceObject respects the limit parameter", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindMany.mockResolvedValueOnce([])

    await service.listByServiceObject(prisma, TENANT_A, SO_ID, 5)

    const findArgs = mocks.workReportFindMany.mock.calls[0]![0]
    expect(findArgs.take).toBe(5)
    expect(findArgs.where).toMatchObject({
      tenantId: TENANT_A,
      serviceObjectId: SO_ID,
    })
  })
})
