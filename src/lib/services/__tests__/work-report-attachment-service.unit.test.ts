/**
 * Unit tests for work-report-attachment-service (Phase 4).
 *
 * Uses a hand-rolled Prisma mock plus Vitest module-mocks for Supabase
 * storage and the audit log. No DB or real storage traffic.
 *
 * Plan: 2026-04-22-workreport-arbeitsschein-m1.md (Phase 4)
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PrismaClient } from "@/generated/prisma/client"
import * as service from "../work-report-attachment-service"

vi.mock("@/lib/supabase/storage", () => ({
  createSignedUploadUrl: vi.fn().mockResolvedValue({
    signedUrl: "https://signed.example/upload",
    path: "ignored",
    token: "tok-123",
  }),
  createSignedReadUrl: vi
    .fn()
    .mockResolvedValue("https://signed.example/download"),
  upload: vi.fn().mockResolvedValue({ path: "ok" }),
  remove: vi.fn().mockResolvedValue(undefined),
  removeBatched: vi.fn().mockResolvedValue(undefined),
  fixSignedUrl: vi.fn((u: string) => u),
}))

vi.mock("../audit-logs-service", () => ({
  log: vi.fn().mockResolvedValue(undefined),
  computeChanges: vi.fn().mockReturnValue(null),
}))

const TENANT_A = "a0000000-0000-4000-a000-000000008801"
const TENANT_B = "a0000000-0000-4000-a000-000000008802"
const USER_ID = "a0000000-0000-4000-a000-000000008803"
const WORK_REPORT_ID = "a0000000-0000-4000-a000-000000008804"
const ATTACHMENT_ID = "a0000000-0000-4000-a000-000000008805"

function makeReport(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: WORK_REPORT_ID,
    tenantId: TENANT_A,
    status: "DRAFT",
    code: "AS-1",
    ...overrides,
  }
}

function makeAttachment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ATTACHMENT_ID,
    tenantId: TENANT_A,
    workReportId: WORK_REPORT_ID,
    filename: "foto.jpg",
    storagePath: `${TENANT_A}/${WORK_REPORT_ID}/abc.jpg`,
    mimeType: "image/jpeg",
    sizeBytes: 500,
    createdAt: new Date("2026-04-22T10:00:00Z"),
    createdById: USER_ID,
    ...overrides,
  }
}

interface PrismaMocks {
  workReportFindFirst: ReturnType<typeof vi.fn>
  attachmentFindFirst: ReturnType<typeof vi.fn>
  attachmentFindMany: ReturnType<typeof vi.fn>
  attachmentCount: ReturnType<typeof vi.fn>
  attachmentCreate: ReturnType<typeof vi.fn>
  attachmentDeleteMany: ReturnType<typeof vi.fn>
}

function makePrisma(
  reportOverride: ReturnType<typeof makeReport> | null = makeReport(),
): { prisma: PrismaClient; mocks: PrismaMocks } {
  const mocks: PrismaMocks = {
    workReportFindFirst: vi.fn().mockResolvedValue(reportOverride),
    attachmentFindFirst: vi.fn().mockResolvedValue(makeAttachment()),
    attachmentFindMany: vi.fn().mockResolvedValue([makeAttachment()]),
    attachmentCount: vi.fn().mockResolvedValue(0),
    attachmentCreate: vi.fn().mockResolvedValue(makeAttachment()),
    attachmentDeleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  }

  const prisma = {
    workReport: { findFirst: mocks.workReportFindFirst },
    workReportAttachment: {
      findFirst: mocks.attachmentFindFirst,
      findMany: mocks.attachmentFindMany,
      count: mocks.attachmentCount,
      create: mocks.attachmentCreate,
      deleteMany: mocks.attachmentDeleteMany,
    },
  } as unknown as PrismaClient

  return { prisma, mocks }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("getUploadUrl", () => {
  it("returns a signed upload URL with the expected path namespace for a DRAFT parent", async () => {
    const { prisma } = makePrisma()

    const result = await service.getUploadUrl(
      prisma,
      TENANT_A,
      WORK_REPORT_ID,
      "foto.jpg",
      "image/jpeg",
    )

    expect(result.signedUrl).toMatch(/^https:\/\//)
    expect(result.storagePath).toMatch(
      new RegExp(`^${TENANT_A}/${WORK_REPORT_ID}/[\\w-]+\\.jpg$`),
    )
    expect(result.token).toBe("tok-123")
  })

  it("rejects disallowed MIME types with WorkReportAttachmentValidationError", async () => {
    const { prisma } = makePrisma()

    await expect(
      service.getUploadUrl(
        prisma,
        TENANT_A,
        WORK_REPORT_ID,
        "malware.sh",
        "application/x-sh",
      ),
    ).rejects.toBeInstanceOf(service.WorkReportAttachmentValidationError)
  })

  it("rejects SIGNED parent records with WorkReportValidationError", async () => {
    const { prisma } = makePrisma(makeReport({ status: "SIGNED" }))

    await expect(
      service.getUploadUrl(
        prisma,
        TENANT_A,
        WORK_REPORT_ID,
        "foto.jpg",
        "image/jpeg",
      ),
    ).rejects.toMatchObject({ name: "WorkReportValidationError" })
  })

  it("rejects VOID parent records with WorkReportValidationError", async () => {
    const { prisma } = makePrisma(makeReport({ status: "VOID" }))

    await expect(
      service.getUploadUrl(
        prisma,
        TENANT_A,
        WORK_REPORT_ID,
        "foto.jpg",
        "image/jpeg",
      ),
    ).rejects.toMatchObject({ name: "WorkReportValidationError" })
  })

  it("rejects missing or cross-tenant parents with WorkReportNotFoundError", async () => {
    const { prisma } = makePrisma(null)

    await expect(
      service.getUploadUrl(
        prisma,
        TENANT_B,
        WORK_REPORT_ID,
        "foto.jpg",
        "image/jpeg",
      ),
    ).rejects.toMatchObject({ name: "WorkReportNotFoundError" })
  })

  it("enforces the 30-attachment-per-report limit", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.attachmentCount.mockResolvedValueOnce(30)

    await expect(
      service.getUploadUrl(
        prisma,
        TENANT_A,
        WORK_REPORT_ID,
        "foto.jpg",
        "image/jpeg",
      ),
    ).rejects.toBeInstanceOf(service.WorkReportAttachmentValidationError)
  })

  it("allows image/png, image/webp, image/heic and application/pdf", async () => {
    for (const mime of [
      "image/png",
      "image/webp",
      "image/heic",
      "application/pdf",
    ]) {
      const { prisma } = makePrisma()
      const result = await service.getUploadUrl(
        prisma,
        TENANT_A,
        WORK_REPORT_ID,
        "f",
        mime,
      )
      expect(result.signedUrl).toMatch(/^https:\/\//)
    }
  })
})

describe("confirmUpload", () => {
  it("inserts the DB row and writes an audit entry attributed to the parent WorkReport", async () => {
    const { prisma, mocks } = makePrisma()

    const attachment = await service.confirmUpload(
      prisma,
      TENANT_A,
      WORK_REPORT_ID,
      `${TENANT_A}/${WORK_REPORT_ID}/abc.jpg`,
      "foto.jpg",
      "image/jpeg",
      500,
      USER_ID,
      { userId: USER_ID },
    )

    expect(attachment.id).toBe(ATTACHMENT_ID)
    expect(mocks.attachmentCreate).toHaveBeenCalledTimes(1)
    const createArgs = mocks.attachmentCreate.mock.calls[0]![0]
    expect(createArgs.data).toMatchObject({
      tenantId: TENANT_A,
      workReportId: WORK_REPORT_ID,
      filename: "foto.jpg",
      storagePath: `${TENANT_A}/${WORK_REPORT_ID}/abc.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 500,
      createdById: USER_ID,
    })

    const auditLog = await import("../audit-logs-service")
    expect(auditLog.log).toHaveBeenCalledTimes(1)
    const auditCall = (auditLog.log as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]![1]
    expect(auditCall).toMatchObject({
      action: "attachment_added",
      entityType: "work_report",
      entityId: WORK_REPORT_ID,
      entityName: "AS-1",
    })
    expect(auditCall.metadata).toMatchObject({
      attachmentId: ATTACHMENT_ID,
      filename: "foto.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 500,
    })
  })

  it("rejects oversized files (>10 MB) with WorkReportAttachmentValidationError", async () => {
    const { prisma, mocks } = makePrisma()

    await expect(
      service.confirmUpload(
        prisma,
        TENANT_A,
        WORK_REPORT_ID,
        `${TENANT_A}/${WORK_REPORT_ID}/big.jpg`,
        "big.jpg",
        "image/jpeg",
        11 * 1024 * 1024,
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(service.WorkReportAttachmentValidationError)

    expect(mocks.attachmentCreate).not.toHaveBeenCalled()
  })

  it("rejects disallowed MIME types on confirm (defense-in-depth)", async () => {
    const { prisma, mocks } = makePrisma()

    await expect(
      service.confirmUpload(
        prisma,
        TENANT_A,
        WORK_REPORT_ID,
        `${TENANT_A}/${WORK_REPORT_ID}/x.sh`,
        "x.sh",
        "application/x-sh",
        500,
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(service.WorkReportAttachmentValidationError)

    expect(mocks.attachmentCreate).not.toHaveBeenCalled()
  })

  it("rejects path-traversal via cross-tenant storage paths", async () => {
    const { prisma, mocks } = makePrisma()

    await expect(
      service.confirmUpload(
        prisma,
        TENANT_A,
        WORK_REPORT_ID,
        `${TENANT_B}/otherReport/x.jpg`,
        "x.jpg",
        "image/jpeg",
        500,
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(service.WorkReportAttachmentValidationError)

    expect(mocks.attachmentCreate).not.toHaveBeenCalled()
  })

  it("rejects paths with traversal-like components that escape the expected prefix", async () => {
    const { prisma, mocks } = makePrisma()

    await expect(
      service.confirmUpload(
        prisma,
        TENANT_A,
        WORK_REPORT_ID,
        "../../etc/passwd",
        "passwd",
        "image/jpeg",
        500,
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(service.WorkReportAttachmentValidationError)

    expect(mocks.attachmentCreate).not.toHaveBeenCalled()
  })

  it("rejects SIGNED parent records with WorkReportValidationError", async () => {
    const { prisma, mocks } = makePrisma(makeReport({ status: "SIGNED" }))

    await expect(
      service.confirmUpload(
        prisma,
        TENANT_A,
        WORK_REPORT_ID,
        `${TENANT_A}/${WORK_REPORT_ID}/abc.jpg`,
        "abc.jpg",
        "image/jpeg",
        500,
        USER_ID,
      ),
    ).rejects.toMatchObject({ name: "WorkReportValidationError" })

    expect(mocks.attachmentCreate).not.toHaveBeenCalled()
  })

  it("enforces the count limit a second time at confirm", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.attachmentCount.mockResolvedValueOnce(30)

    await expect(
      service.confirmUpload(
        prisma,
        TENANT_A,
        WORK_REPORT_ID,
        `${TENANT_A}/${WORK_REPORT_ID}/x.jpg`,
        "x.jpg",
        "image/jpeg",
        500,
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(service.WorkReportAttachmentValidationError)

    expect(mocks.attachmentCreate).not.toHaveBeenCalled()
  })
})

describe("listAttachments", () => {
  it("maps each DB row to include a downloadUrl", async () => {
    const { prisma } = makePrisma()
    const list = await service.listAttachments(prisma, TENANT_A, WORK_REPORT_ID)

    expect(list).toHaveLength(1)
    expect(list[0]!.downloadUrl).toMatch(/^https:\/\//)
    expect(list[0]!.id).toBe(ATTACHMENT_ID)
  })

  it("rejects missing parents with WorkReportNotFoundError", async () => {
    const { prisma } = makePrisma(null)

    await expect(
      service.listAttachments(prisma, TENANT_A, WORK_REPORT_ID),
    ).rejects.toMatchObject({ name: "WorkReportNotFoundError" })
  })

  it("allows listing on SIGNED parents (read-only is always allowed)", async () => {
    const { prisma } = makePrisma(makeReport({ status: "SIGNED" }))
    const list = await service.listAttachments(prisma, TENANT_A, WORK_REPORT_ID)
    expect(list).toHaveLength(1)
  })
})

describe("getDownloadUrl", () => {
  it("returns a signed URL for the tenant's attachment", async () => {
    const { prisma } = makePrisma()
    const result = await service.getDownloadUrl(prisma, TENANT_A, ATTACHMENT_ID)
    expect(result.signedUrl).toMatch(/^https:\/\//)
  })

  it("cross-tenant read is blocked (findFirst returns null for wrong tenant)", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.attachmentFindFirst.mockResolvedValueOnce(null)

    await expect(
      service.getDownloadUrl(prisma, TENANT_B, ATTACHMENT_ID),
    ).rejects.toBeInstanceOf(service.WorkReportAttachmentNotFoundError)
  })
})

describe("remove", () => {
  it("deletes storage + DB row + writes audit on a DRAFT parent", async () => {
    const { prisma, mocks } = makePrisma()

    const result = await service.remove(prisma, TENANT_A, ATTACHMENT_ID, {
      userId: USER_ID,
    })
    expect(result).toEqual({ success: true })
    expect(mocks.attachmentDeleteMany).toHaveBeenCalledWith({
      where: { id: ATTACHMENT_ID, tenantId: TENANT_A },
    })

    const auditLog = await import("../audit-logs-service")
    expect(auditLog.log).toHaveBeenCalledTimes(1)
    const auditCall = (auditLog.log as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]![1]
    expect(auditCall).toMatchObject({
      action: "attachment_removed",
      entityType: "work_report",
      entityId: WORK_REPORT_ID,
    })
    expect(auditCall.metadata).toMatchObject({
      attachmentId: ATTACHMENT_ID,
      filename: "foto.jpg",
    })
  })

  it("cross-tenant delete is blocked (findFirst returns null for wrong tenant)", async () => {
    const { prisma, mocks } = makePrisma()
    mocks.attachmentFindFirst.mockResolvedValueOnce(null)

    await expect(
      service.remove(prisma, TENANT_B, ATTACHMENT_ID),
    ).rejects.toBeInstanceOf(service.WorkReportAttachmentNotFoundError)
    expect(mocks.attachmentDeleteMany).not.toHaveBeenCalled()
  })

  it("rejects delete when the parent WorkReport is SIGNED", async () => {
    const { prisma, mocks } = makePrisma(makeReport({ status: "SIGNED" }))

    await expect(
      service.remove(prisma, TENANT_A, ATTACHMENT_ID, { userId: USER_ID }),
    ).rejects.toMatchObject({ name: "WorkReportValidationError" })

    expect(mocks.attachmentDeleteMany).not.toHaveBeenCalled()
  })

  it("rejects delete when the parent WorkReport is VOID", async () => {
    const { prisma, mocks } = makePrisma(makeReport({ status: "VOID" }))

    await expect(
      service.remove(prisma, TENANT_A, ATTACHMENT_ID, { userId: USER_ID }),
    ).rejects.toMatchObject({ name: "WorkReportValidationError" })

    expect(mocks.attachmentDeleteMany).not.toHaveBeenCalled()
  })
})
