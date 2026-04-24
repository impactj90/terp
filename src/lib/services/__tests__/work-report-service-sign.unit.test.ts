/**
 * Unit tests for `workReportService.sign` (Phase 6).
 *
 * Uses a hand-rolled Prisma mock plus Vitest module-mocks for Supabase
 * storage, PDF service, field-encryption (IP hashing) and the audit log.
 * No real DB, no real storage, no real PDF renderer.
 *
 * Integration coverage (race condition, actual storage writes, PDF
 * bytes, audit rows in Postgres) lives in
 * `work-report-service-sign.integration.test.ts`.
 *
 * Plan: 2026-04-22-workreport-arbeitsschein-m1.md (Phase 6)
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { PrismaClient } from "@/generated/prisma/client"
import type * as AuditModule from "../audit-logs-service"

// --- Module mocks (must be registered before the service import) ---

vi.mock("@/lib/supabase/storage", () => ({
  upload: vi.fn().mockResolvedValue({ path: "ok" }),
  remove: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../work-report-pdf-service", () => ({
  generateSignedAndStore: vi.fn().mockResolvedValue({
    storagePath: "arbeitsscheine/tenant/report.pdf",
  }),
}))

vi.mock("../field-encryption", () => ({
  hashField: vi.fn((ip: string) => `hash:${ip}`),
}))

vi.mock("../audit-logs-service", async () => {
  const actual =
    await vi.importActual<typeof AuditModule>("../audit-logs-service")
  return {
    ...actual,
    log: vi.fn().mockResolvedValue(undefined),
  }
})

import * as storage from "@/lib/supabase/storage"
import * as pdfService from "../work-report-pdf-service"
import * as fieldEncryption from "../field-encryption"
import * as auditLog from "../audit-logs-service"
import * as service from "../work-report-service"

// --- Fixture IDs ---

const TENANT_A = "a0000000-0000-4000-a000-000000009001"
const USER_ID = "a0000000-0000-4000-a000-000000009002"
const WORK_REPORT_ID = "a0000000-0000-4000-a000-000000009003"
const EMPLOYEE_ID = "a0000000-0000-4000-a000-000000009004"
const ORDER_ID = "a0000000-0000-4000-a000-000000009005"

// Tiny valid-looking PNG as a data URL — only decoded length matters for
// the service's size guard, the bytes themselves are never inspected.
const VALID_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg=="

function makeReport(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: WORK_REPORT_ID,
    tenantId: TENANT_A,
    orderId: ORDER_ID,
    serviceObjectId: null,
    code: "AS-1",
    visitDate: new Date("2026-04-22T00:00:00Z"),
    travelMinutes: null,
    workDescription: "Filter gewechselt und Dichtung erneuert",
    status: "DRAFT" as "DRAFT" | "SIGNED" | "VOID",
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
    assignments: [
      {
        id: "a0000000-0000-4000-a000-000000009010",
        workReportId: WORK_REPORT_ID,
        employeeId: EMPLOYEE_ID,
        role: "Techniker",
        createdAt: new Date(),
        employee: {
          id: EMPLOYEE_ID,
          firstName: "Hans",
          lastName: "Müller",
          personnelNumber: "E-001",
        },
      },
    ],
    attachments: [],
    ...overrides,
  }
}

interface PrismaMocks {
  workReportFindFirst: ReturnType<typeof vi.fn>
  workReportUpdateMany: ReturnType<typeof vi.fn>
  workReportUpdate: ReturnType<typeof vi.fn>
}

function makePrisma(
  reportOverride: ReturnType<typeof makeReport> | null = makeReport(),
): { prisma: PrismaClient; mocks: PrismaMocks } {
  const mocks: PrismaMocks = {
    // `sign` calls findById (full record) then later findByIdSimple on race,
    // and after the update another findById for the return value. We supply
    // the same record for both the pre-fetch and the post-fetch so the
    // common-happy-path tests don't need to queue values.
    workReportFindFirst: vi.fn().mockResolvedValue(reportOverride),
    workReportUpdateMany: vi.fn().mockResolvedValue({ count: 1 }),
    workReportUpdate: vi.fn().mockResolvedValue(reportOverride),
  }

  const prisma = {
    workReport: {
      findFirst: mocks.workReportFindFirst,
      updateMany: mocks.workReportUpdateMany,
      update: mocks.workReportUpdate,
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    platformAuditLog: { create: vi.fn().mockResolvedValue({}) },
  } as unknown as PrismaClient

  return { prisma, mocks }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Validation — happy-path prerequisites
// ---------------------------------------------------------------------------

describe("sign — input validation", () => {
  it("rejects short signerName with WorkReportValidationError", async () => {
    const { prisma } = makePrisma()
    await expect(
      service.sign(prisma, TENANT_A, {
        id: WORK_REPORT_ID,
        signerName: "a",
        signerRole: "Werkmeister",
        signatureDataUrl: VALID_PNG_DATA_URL,
      }),
    ).rejects.toMatchObject({ name: "WorkReportValidationError" })
  })

  it("rejects short signerRole with WorkReportValidationError", async () => {
    const { prisma } = makePrisma()
    await expect(
      service.sign(prisma, TENANT_A, {
        id: WORK_REPORT_ID,
        signerName: "Max Müller",
        signerRole: "a",
        signatureDataUrl: VALID_PNG_DATA_URL,
      }),
    ).rejects.toMatchObject({ name: "WorkReportValidationError" })
  })

  it("rejects non-PNG data URL prefix with WorkReportValidationError", async () => {
    const { prisma } = makePrisma()
    await expect(
      service.sign(prisma, TENANT_A, {
        id: WORK_REPORT_ID,
        signerName: "Max Müller",
        signerRole: "Werkmeister",
        signatureDataUrl: "data:image/jpeg;base64,AAAA",
      }),
    ).rejects.toMatchObject({ name: "WorkReportValidationError" })
  })

  it("rejects an empty base64 payload with WorkReportValidationError", async () => {
    const { prisma } = makePrisma()
    await expect(
      service.sign(prisma, TENANT_A, {
        id: WORK_REPORT_ID,
        signerName: "Max Müller",
        signerRole: "Werkmeister",
        signatureDataUrl: "data:image/png;base64,",
      }),
    ).rejects.toMatchObject({ name: "WorkReportValidationError" })
  })

  it("rejects a >1 MiB decoded payload with WorkReportValidationError", async () => {
    const { prisma } = makePrisma()
    // 1 MiB + 1 byte of zeros, base64-encoded.
    const big = Buffer.alloc(1024 * 1024 + 1, 0).toString("base64")
    await expect(
      service.sign(prisma, TENANT_A, {
        id: WORK_REPORT_ID,
        signerName: "Max Müller",
        signerRole: "Werkmeister",
        signatureDataUrl: `data:image/png;base64,${big}`,
      }),
    ).rejects.toMatchObject({ name: "WorkReportValidationError" })

    // Upload must never be attempted for oversized payloads.
    expect(storage.upload).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Pre-fetch / business-rule failures
// ---------------------------------------------------------------------------

describe("sign — business validation", () => {
  it("throws WorkReportNotFoundError when no record matches id + tenant", async () => {
    const { prisma } = makePrisma(null)
    await expect(
      service.sign(prisma, TENANT_A, {
        id: WORK_REPORT_ID,
        signerName: "Max Müller",
        signerRole: "Werkmeister",
        signatureDataUrl: VALID_PNG_DATA_URL,
      }),
    ).rejects.toMatchObject({ name: "WorkReportNotFoundError" })
    expect(storage.upload).not.toHaveBeenCalled()
  })

  it("throws WorkReportAlreadySignedError when status is already SIGNED", async () => {
    const { prisma } = makePrisma(makeReport({ status: "SIGNED" }))
    await expect(
      service.sign(prisma, TENANT_A, {
        id: WORK_REPORT_ID,
        signerName: "Max Müller",
        signerRole: "Werkmeister",
        signatureDataUrl: VALID_PNG_DATA_URL,
      }),
    ).rejects.toMatchObject({ name: "WorkReportConflictError" })
    expect(storage.upload).not.toHaveBeenCalled()
  })

  it("throws WorkReportValidationError when workDescription is empty", async () => {
    const { prisma } = makePrisma(
      makeReport({ workDescription: "   " }),
    )
    await expect(
      service.sign(prisma, TENANT_A, {
        id: WORK_REPORT_ID,
        signerName: "Max Müller",
        signerRole: "Werkmeister",
        signatureDataUrl: VALID_PNG_DATA_URL,
      }),
    ).rejects.toMatchObject({ name: "WorkReportValidationError" })
    // Uploads must not happen before the pre-validation passes — otherwise
    // we'd leak orphan blobs for every invalid sign attempt.
    expect(storage.upload).not.toHaveBeenCalled()
  })

  it("throws WorkReportValidationError when assignments array is empty", async () => {
    const { prisma } = makePrisma(makeReport({ assignments: [] }))
    await expect(
      service.sign(prisma, TENANT_A, {
        id: WORK_REPORT_ID,
        signerName: "Max Müller",
        signerRole: "Werkmeister",
        signatureDataUrl: VALID_PNG_DATA_URL,
      }),
    ).rejects.toMatchObject({ name: "WorkReportValidationError" })
    expect(storage.upload).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("sign — happy path", () => {
  it("uploads signature, flips DRAFT→SIGNED, renders PDF, writes audit", async () => {
    const { prisma, mocks } = makePrisma()

    const result = await service.sign(
      prisma,
      TENANT_A,
      {
        id: WORK_REPORT_ID,
        signerName: "Max Müller",
        signerRole: "Werkmeister",
        signatureDataUrl: VALID_PNG_DATA_URL,
      },
      { userId: USER_ID, ipAddress: "10.0.0.1", userAgent: "vitest" },
    )

    expect(result).toBeDefined()

    // Signature was uploaded with upsert:false to the UUID-suffixed path.
    expect(storage.upload).toHaveBeenCalledTimes(1)
    const uploadCall = (storage.upload as ReturnType<typeof vi.fn>).mock
      .calls[0]!
    expect(uploadCall[0]).toBe("workreport-signatures")
    expect(uploadCall[1]).toMatch(
      new RegExp(`^${TENANT_A}/${WORK_REPORT_ID}-[0-9a-f-]+\\.png$`),
    )
    expect(Buffer.isBuffer(uploadCall[2])).toBe(true)
    expect(uploadCall[3]).toMatchObject({
      contentType: "image/png",
      upsert: false,
    })

    // IP hash computed via field-encryption.
    expect(fieldEncryption.hashField).toHaveBeenCalledWith("10.0.0.1")

    // Atomic updateMany with DRAFT guard.
    expect(mocks.workReportUpdateMany).toHaveBeenCalledTimes(1)
    const upArgs = mocks.workReportUpdateMany.mock.calls[0]![0]
    expect(upArgs.where).toMatchObject({
      id: WORK_REPORT_ID,
      tenantId: TENANT_A,
      status: "DRAFT",
    })
    expect(upArgs.data.status).toBe("SIGNED")
    expect(upArgs.data.signedById).toBe(USER_ID)
    expect(upArgs.data.signerName).toBe("Max Müller")
    expect(upArgs.data.signerRole).toBe("Werkmeister")
    expect(upArgs.data.signerIpHash).toBe("hash:10.0.0.1")
    expect(upArgs.data.signaturePath).toMatch(
      new RegExp(`^${TENANT_A}/${WORK_REPORT_ID}-[0-9a-f-]+\\.png$`),
    )

    // PDF render + persist.
    expect(pdfService.generateSignedAndStore).toHaveBeenCalledWith(
      prisma,
      TENANT_A,
      WORK_REPORT_ID,
    )
    expect(mocks.workReportUpdate).toHaveBeenCalledWith({
      where: { id: WORK_REPORT_ID },
      data: { pdfUrl: "arbeitsscheine/tenant/report.pdf" },
    })

    // Audit row.
    expect(auditLog.log).toHaveBeenCalledTimes(1)
    const auditArgs = (auditLog.log as ReturnType<typeof vi.fn>).mock
      .calls[0]![1]
    expect(auditArgs.action).toBe("sign")
    expect(auditArgs.entityType).toBe("work_report")
    expect(auditArgs.entityId).toBe(WORK_REPORT_ID)
    expect(auditArgs.entityName).toBe("AS-1")
    expect(auditArgs.metadata).toMatchObject({
      signerName: "Max Müller",
      signerRole: "Werkmeister",
      signerIpHash: "hash:10.0.0.1",
      assignmentCount: 1,
    })

    // The signature orphan-cleanup path must NOT run on the happy path.
    expect(storage.remove).not.toHaveBeenCalled()
  })

  it("skips hashField when audit.ipAddress is undefined", async () => {
    const { prisma } = makePrisma()

    await service.sign(
      prisma,
      TENANT_A,
      {
        id: WORK_REPORT_ID,
        signerName: "Max Müller",
        signerRole: "Werkmeister",
        signatureDataUrl: VALID_PNG_DATA_URL,
      },
      { userId: USER_ID },
    )

    expect(fieldEncryption.hashField).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Race-condition loss (count === 0 on updateMany)
// ---------------------------------------------------------------------------

describe("sign — concurrent status flip", () => {
  it("cleans up the orphan signature and throws AlreadySignedError when another writer won", async () => {
    // Pre-fetch returns DRAFT, but by the time updateMany fires the row
    // has flipped to SIGNED. Simulate: pre-fetch DRAFT, updateMany=0,
    // re-fetch SIGNED.
    const draft = makeReport()
    const signed = {
      id: WORK_REPORT_ID,
      tenantId: TENANT_A,
      status: "SIGNED" as const,
      code: "AS-1",
    }

    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst
      .mockResolvedValueOnce(draft) // initial findById (full record)
      .mockResolvedValueOnce(signed) // re-fetch after count=0

    mocks.workReportUpdateMany.mockResolvedValueOnce({ count: 0 })

    await expect(
      service.sign(
        prisma,
        TENANT_A,
        {
          id: WORK_REPORT_ID,
          signerName: "Max Müller",
          signerRole: "Werkmeister",
          signatureDataUrl: VALID_PNG_DATA_URL,
        },
        { userId: USER_ID },
      ),
    ).rejects.toMatchObject({ name: "WorkReportConflictError" })

    // Orphan blob must be removed — signature bucket + upload-path.
    expect(storage.remove).toHaveBeenCalledTimes(1)
    const removeCall = (storage.remove as ReturnType<typeof vi.fn>).mock
      .calls[0]!
    expect(removeCall[0]).toBe("workreport-signatures")
    expect(Array.isArray(removeCall[1])).toBe(true)
    expect(removeCall[1][0]).toMatch(
      new RegExp(`^${TENANT_A}/${WORK_REPORT_ID}-[0-9a-f-]+\\.png$`),
    )

    // PDF service is never invoked on a race loss.
    expect(pdfService.generateSignedAndStore).not.toHaveBeenCalled()
  })

  it("throws WorkReportConflictError when the row is still DRAFT but count=0 (phantom race)", async () => {
    const draft = makeReport()
    const stillDraft = {
      id: WORK_REPORT_ID,
      tenantId: TENANT_A,
      status: "DRAFT" as const,
      code: "AS-1",
    }

    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce(stillDraft)
    mocks.workReportUpdateMany.mockResolvedValueOnce({ count: 0 })

    await expect(
      service.sign(prisma, TENANT_A, {
        id: WORK_REPORT_ID,
        signerName: "Max Müller",
        signerRole: "Werkmeister",
        signatureDataUrl: VALID_PNG_DATA_URL,
      }),
    ).rejects.toMatchObject({ name: "WorkReportConflictError" })
    expect(storage.remove).toHaveBeenCalledTimes(1)
  })

  it("throws WorkReportNotFoundError when the row has been deleted between fetch and update", async () => {
    const draft = makeReport()
    const { prisma, mocks } = makePrisma()
    mocks.workReportFindFirst
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce(null) // row gone
    mocks.workReportUpdateMany.mockResolvedValueOnce({ count: 0 })

    await expect(
      service.sign(prisma, TENANT_A, {
        id: WORK_REPORT_ID,
        signerName: "Max Müller",
        signerRole: "Werkmeister",
        signatureDataUrl: VALID_PNG_DATA_URL,
      }),
    ).rejects.toMatchObject({ name: "WorkReportNotFoundError" })
    expect(storage.remove).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Best-effort PDF generation
// ---------------------------------------------------------------------------

describe("sign — best-effort PDF behavior", () => {
  it("does NOT roll back the SIGNED commit when PDF rendering throws", async () => {
    const { prisma, mocks } = makePrisma()

    ;(
      pdfService.generateSignedAndStore as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error("Render exploded"))

    // The call still resolves — sign() swallows PDF failures.
    const result = await service.sign(
      prisma,
      TENANT_A,
      {
        id: WORK_REPORT_ID,
        signerName: "Max Müller",
        signerRole: "Werkmeister",
        signatureDataUrl: VALID_PNG_DATA_URL,
      },
      { userId: USER_ID },
    )
    expect(result).toBeDefined()

    // SIGNED status was committed (updateMany ran with count=1).
    expect(mocks.workReportUpdateMany).toHaveBeenCalledTimes(1)
    // `pdfUrl` write was skipped (since generateSignedAndStore threw).
    expect(mocks.workReportUpdate).not.toHaveBeenCalled()

    // Audit row still written — metadata.pdfPath is null since PDF failed.
    expect(auditLog.log).toHaveBeenCalledTimes(1)
    const auditArgs = (auditLog.log as ReturnType<typeof vi.fn>).mock
      .calls[0]![1]
    expect(auditArgs.metadata.pdfPath).toBeNull()
  })
})
