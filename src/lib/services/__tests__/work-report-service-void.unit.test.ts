/**
 * Unit tests for `workReportService.voidReport` (Phase 7).
 *
 * Uses a hand-rolled Prisma mock plus Vitest module-mocks for the audit
 * log. No real DB, no real storage. Focused on the business rules of
 * the SIGNED→VOID transition: reason validation, status guards, race
 * handling via the count=0 branch and audit attribution.
 *
 * Integration coverage (actual DB rows, parallel voids, overlay PDF) in
 * `work-report-service-void.integration.test.ts`.
 *
 * Plan: 2026-04-22-workreport-arbeitsschein-m1.md (Phase 7)
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { PrismaClient } from "@/generated/prisma/client"
import type * as AuditModule from "../audit-logs-service"

// --- Module mocks ---

vi.mock("../audit-logs-service", async () => {
  const actual =
    await vi.importActual<typeof AuditModule>("../audit-logs-service")
  return {
    ...actual,
    log: vi.fn().mockResolvedValue(undefined),
  }
})

import * as auditLog from "../audit-logs-service"
import * as service from "../work-report-service"

// --- Fixture IDs ---

const TENANT_A = "b0000000-0000-4000-a000-000000009001"
const USER_ID = "b0000000-0000-4000-a000-000000009002"
const WORK_REPORT_ID = "b0000000-0000-4000-a000-000000009003"

const VALID_REASON = "Kunde meldete Fehler auf der Rechnung"

// --- Mock Prisma factory ---

interface PrismaMocks {
  workReportFindFirst: ReturnType<typeof vi.fn>
  workReportUpdateMany: ReturnType<typeof vi.fn>
}

function makePrisma(
  simpleRecord: {
    id: string
    status: "DRAFT" | "SIGNED" | "VOID"
    tenantId: string
    code: string
  } | null = {
    id: WORK_REPORT_ID,
    tenantId: TENANT_A,
    status: "SIGNED",
    code: "AS-7",
  },
): { prisma: PrismaClient; mocks: PrismaMocks } {
  const mocks: PrismaMocks = {
    // First call: findByIdSimple pre-fetch.
    // Subsequent calls: re-fetch after count=0 (mocked per-test) or the
    // final full findById for the return value (we return a shaped-up
    // object for that one in the individual tests).
    workReportFindFirst: vi.fn().mockResolvedValue(simpleRecord),
    workReportUpdateMany: vi.fn().mockResolvedValue({ count: 1 }),
  }

  const prisma = {
    workReport: {
      findFirst: mocks.workReportFindFirst,
      updateMany: mocks.workReportUpdateMany,
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    platformAuditLog: { create: vi.fn().mockResolvedValue({}) },
  } as unknown as PrismaClient

  return { prisma, mocks }
}

/**
 * Builds a minimal WorkReport-with-includes shape for the final
 * return-value findById. We only need the fields the tests assert on,
 * so we cast through unknown.
 */
function makeVoidedReport(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: WORK_REPORT_ID,
    tenantId: TENANT_A,
    orderId: "b0000000-0000-4000-a000-000000009005",
    serviceObjectId: null,
    code: "AS-7",
    visitDate: new Date("2026-04-22T00:00:00Z"),
    travelMinutes: null,
    workDescription: "Filter gewechselt",
    status: "VOID" as const,
    signedAt: new Date(),
    signedById: USER_ID,
    signerName: "Max Müller",
    signerRole: "Werkmeister",
    signerIpHash: "hash",
    signaturePath: "path.png",
    pdfUrl: "arbeitsscheine/tenant/report.pdf",
    voidedAt: new Date(),
    voidedById: USER_ID,
    voidReason: VALID_REASON,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdById: USER_ID,
    order: null,
    serviceObject: null,
    assignments: [],
    attachments: [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Reason validation
// ---------------------------------------------------------------------------

describe("voidReport — reason validation", () => {
  it("rejects a reason shorter than 10 characters with WorkReportValidationError", async () => {
    const { prisma, mocks } = makePrisma()

    await expect(
      service.voidReport(prisma, TENANT_A, {
        id: WORK_REPORT_ID,
        reason: "kurz",
      }),
    ).rejects.toMatchObject({ name: "WorkReportValidationError" })

    // Short-circuits before the DB is touched at all.
    expect(mocks.workReportFindFirst).not.toHaveBeenCalled()
    expect(mocks.workReportUpdateMany).not.toHaveBeenCalled()
  })

  it("rejects a whitespace-only reason as too short", async () => {
    const { prisma, mocks } = makePrisma()

    await expect(
      service.voidReport(prisma, TENANT_A, {
        id: WORK_REPORT_ID,
        reason: "                  ",
      }),
    ).rejects.toMatchObject({ name: "WorkReportValidationError" })

    expect(mocks.workReportUpdateMany).not.toHaveBeenCalled()
  })

  it("trims leading/trailing whitespace before length-check and before storing", async () => {
    const { prisma, mocks } = makePrisma()
    // Return value from the final findById — shape doesn't matter for this assertion.
    mocks.workReportFindFirst
      .mockResolvedValueOnce({
        id: WORK_REPORT_ID,
        tenantId: TENANT_A,
        status: "SIGNED",
        code: "AS-7",
      })
      .mockResolvedValueOnce(makeVoidedReport())

    await service.voidReport(
      prisma,
      TENANT_A,
      { id: WORK_REPORT_ID, reason: `   ${VALID_REASON}   ` },
      { userId: USER_ID },
    )

    // The stored voidReason must be trimmed.
    const updateArgs = mocks.workReportUpdateMany.mock.calls[0]![0]
    expect(updateArgs.data.voidReason).toBe(VALID_REASON)
  })
})

// ---------------------------------------------------------------------------
// Status guards
// ---------------------------------------------------------------------------

describe("voidReport — status guards", () => {
  it("throws WorkReportNotFoundError when the record does not exist in the tenant", async () => {
    const { prisma, mocks } = makePrisma(null)

    await expect(
      service.voidReport(prisma, TENANT_A, {
        id: WORK_REPORT_ID,
        reason: VALID_REASON,
      }),
    ).rejects.toMatchObject({ name: "WorkReportNotFoundError" })

    expect(mocks.workReportUpdateMany).not.toHaveBeenCalled()
  })

  it("rejects a void on a DRAFT record with WorkReportValidationError", async () => {
    const { prisma, mocks } = makePrisma({
      id: WORK_REPORT_ID,
      tenantId: TENANT_A,
      status: "DRAFT",
      code: "AS-7",
    })

    await expect(
      service.voidReport(prisma, TENANT_A, {
        id: WORK_REPORT_ID,
        reason: VALID_REASON,
      }),
    ).rejects.toMatchObject({ name: "WorkReportValidationError" })

    expect(mocks.workReportUpdateMany).not.toHaveBeenCalled()
  })

  it("rejects a void on an already-VOID record with WorkReportAlreadyVoidedError", async () => {
    const { prisma, mocks } = makePrisma({
      id: WORK_REPORT_ID,
      tenantId: TENANT_A,
      status: "VOID",
      code: "AS-7",
    })

    await expect(
      service.voidReport(prisma, TENANT_A, {
        id: WORK_REPORT_ID,
        reason: VALID_REASON,
      }),
    ).rejects.toMatchObject({ name: "WorkReportConflictError" })

    expect(mocks.workReportUpdateMany).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("voidReport — happy path", () => {
  it("commits SIGNED→VOID atomically and writes a void audit row", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst
      .mockResolvedValueOnce({
        id: WORK_REPORT_ID,
        tenantId: TENANT_A,
        status: "SIGNED",
        code: "AS-7",
      })
      .mockResolvedValueOnce(makeVoidedReport())

    const result = await service.voidReport(
      prisma,
      TENANT_A,
      { id: WORK_REPORT_ID, reason: VALID_REASON },
      { userId: USER_ID, ipAddress: "10.0.0.1", userAgent: "vitest" },
    )

    expect(result.status).toBe("VOID")

    // Atomic updateMany with SIGNED guard.
    expect(mocks.workReportUpdateMany).toHaveBeenCalledTimes(1)
    const upArgs = mocks.workReportUpdateMany.mock.calls[0]![0]
    expect(upArgs.where).toMatchObject({
      id: WORK_REPORT_ID,
      tenantId: TENANT_A,
      status: "SIGNED",
    })
    expect(upArgs.data.status).toBe("VOID")
    expect(upArgs.data.voidedAt).toBeInstanceOf(Date)
    expect(upArgs.data.voidedById).toBe(USER_ID)
    expect(upArgs.data.voidReason).toBe(VALID_REASON)

    // Audit row.
    expect(auditLog.log).toHaveBeenCalledTimes(1)
    const auditArgs = (auditLog.log as ReturnType<typeof vi.fn>).mock
      .calls[0]![1]
    expect(auditArgs.action).toBe("void")
    expect(auditArgs.entityType).toBe("work_report")
    expect(auditArgs.entityId).toBe(WORK_REPORT_ID)
    expect(auditArgs.entityName).toBe("AS-7")
    expect(auditArgs.metadata).toEqual({ reason: VALID_REASON })
    expect(auditArgs.ipAddress).toBe("10.0.0.1")
    expect(auditArgs.userAgent).toBe("vitest")
  })

  it("does not emit an audit row when no audit context is supplied", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst
      .mockResolvedValueOnce({
        id: WORK_REPORT_ID,
        tenantId: TENANT_A,
        status: "SIGNED",
        code: "AS-7",
      })
      .mockResolvedValueOnce(makeVoidedReport())

    await service.voidReport(prisma, TENANT_A, {
      id: WORK_REPORT_ID,
      reason: VALID_REASON,
    })

    // Status transition still committed, but no audit row is written.
    expect(mocks.workReportUpdateMany).toHaveBeenCalledTimes(1)
    expect(auditLog.log).not.toHaveBeenCalled()
  })

  it("sets voidedById to null when no audit context is passed", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst
      .mockResolvedValueOnce({
        id: WORK_REPORT_ID,
        tenantId: TENANT_A,
        status: "SIGNED",
        code: "AS-7",
      })
      .mockResolvedValueOnce(makeVoidedReport({ voidedById: null }))

    await service.voidReport(prisma, TENANT_A, {
      id: WORK_REPORT_ID,
      reason: VALID_REASON,
    })

    const upArgs = mocks.workReportUpdateMany.mock.calls[0]![0]
    expect(upArgs.data.voidedById).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Race-condition loss (count === 0)
// ---------------------------------------------------------------------------

describe("voidReport — concurrent status flip", () => {
  it("throws WorkReportAlreadyVoidedError when a concurrent writer already voided the row", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst
      .mockResolvedValueOnce({
        // Pre-fetch saw SIGNED
        id: WORK_REPORT_ID,
        tenantId: TENANT_A,
        status: "SIGNED",
        code: "AS-7",
      })
      .mockResolvedValueOnce({
        // Re-fetch sees VOID
        id: WORK_REPORT_ID,
        tenantId: TENANT_A,
        status: "VOID",
        code: "AS-7",
      })
    mocks.workReportUpdateMany.mockResolvedValueOnce({ count: 0 })

    await expect(
      service.voidReport(prisma, TENANT_A, {
        id: WORK_REPORT_ID,
        reason: VALID_REASON,
      }),
    ).rejects.toMatchObject({ name: "WorkReportConflictError" })
  })

  it("throws WorkReportNotFoundError when the row disappeared between fetch and update", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst
      .mockResolvedValueOnce({
        id: WORK_REPORT_ID,
        tenantId: TENANT_A,
        status: "SIGNED",
        code: "AS-7",
      })
      .mockResolvedValueOnce(null) // row gone
    mocks.workReportUpdateMany.mockResolvedValueOnce({ count: 0 })

    await expect(
      service.voidReport(prisma, TENANT_A, {
        id: WORK_REPORT_ID,
        reason: VALID_REASON,
      }),
    ).rejects.toMatchObject({ name: "WorkReportNotFoundError" })
  })

  it("throws WorkReportConflictError on a phantom race (row still SIGNED but count=0)", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst
      .mockResolvedValueOnce({
        id: WORK_REPORT_ID,
        tenantId: TENANT_A,
        status: "SIGNED",
        code: "AS-7",
      })
      .mockResolvedValueOnce({
        id: WORK_REPORT_ID,
        tenantId: TENANT_A,
        status: "SIGNED",
        code: "AS-7",
      })
    mocks.workReportUpdateMany.mockResolvedValueOnce({ count: 0 })

    await expect(
      service.voidReport(prisma, TENANT_A, {
        id: WORK_REPORT_ID,
        reason: VALID_REASON,
      }),
    ).rejects.toMatchObject({ name: "WorkReportConflictError" })
  })

  it("throws WorkReportValidationError when the row unexpectedly moved back to DRAFT", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst
      .mockResolvedValueOnce({
        id: WORK_REPORT_ID,
        tenantId: TENANT_A,
        status: "SIGNED",
        code: "AS-7",
      })
      .mockResolvedValueOnce({
        id: WORK_REPORT_ID,
        tenantId: TENANT_A,
        status: "DRAFT",
        code: "AS-7",
      })
    mocks.workReportUpdateMany.mockResolvedValueOnce({ count: 0 })

    await expect(
      service.voidReport(prisma, TENANT_A, {
        id: WORK_REPORT_ID,
        reason: VALID_REASON,
      }),
    ).rejects.toMatchObject({ name: "WorkReportValidationError" })
  })
})
