import { describe, it, expect, vi, beforeEach } from "vitest"
import * as service from "../service-object-attachment-service"
import type { PrismaClient } from "@/generated/prisma/client"

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

const TENANT_A = "a0000000-0000-4000-a000-000000000100"
const TENANT_B = "b0000000-0000-4000-b000-000000000200"
const SO_ID = "so000000-0000-4000-a000-000000000001"
const ATT_ID = "at000000-0000-4000-a000-000000000001"
const USER_ID = "u0000000-0000-4000-a000-000000000001"

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    serviceObject: {
      findFirst: vi.fn().mockResolvedValue({ id: SO_ID }),
    },
    serviceObjectAttachment: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    ...overrides,
  } as unknown as PrismaClient
}

describe("service-object-attachment-service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("getUploadUrl", () => {
    it("returns a signed upload URL for an allowed MIME type", async () => {
      const prisma = makePrisma()
      const result = await service.getUploadUrl(
        prisma,
        TENANT_A,
        SO_ID,
        "invoice.pdf",
        "application/pdf"
      )
      expect(result?.signedUrl).toMatch(/^https:\/\//)
      expect(result?.storagePath).toMatch(
        new RegExp(`^${TENANT_A}/${SO_ID}/[\\w-]+\\.pdf$`)
      )
    })

    it("rejects disallowed MIME types", async () => {
      const prisma = makePrisma()
      await expect(
        service.getUploadUrl(
          prisma,
          TENANT_A,
          SO_ID,
          "malware.exe",
          "application/x-msdownload"
        )
      ).rejects.toBeInstanceOf(
        service.ServiceObjectAttachmentValidationError
      )
    })

    it("rejects if service object not found in tenant", async () => {
      const prisma = makePrisma({
        serviceObject: { findFirst: vi.fn().mockResolvedValue(null) },
      })
      await expect(
        service.getUploadUrl(prisma, TENANT_A, SO_ID, "x.pdf", "application/pdf")
      ).rejects.toBeInstanceOf(service.ServiceObjectAttachmentNotFoundError)
    })

    it("enforces 20-attachment limit", async () => {
      const prisma = makePrisma({
        serviceObjectAttachment: {
          ...makePrisma().serviceObjectAttachment,
          count: vi.fn().mockResolvedValue(20),
        },
      })
      await expect(
        service.getUploadUrl(prisma, TENANT_A, SO_ID, "x.pdf", "application/pdf")
      ).rejects.toBeInstanceOf(
        service.ServiceObjectAttachmentValidationError
      )
    })
  })

  describe("confirmUpload", () => {
    it("inserts the DB row and writes an audit entry", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObjectAttachment.create as ReturnType<
        typeof vi.fn
      >).mockResolvedValue({
        id: ATT_ID,
        filename: "x.pdf",
        tenantId: TENANT_A,
        serviceObjectId: SO_ID,
      })

      const attachment = await service.confirmUpload(
        prisma,
        TENANT_A,
        SO_ID,
        `${TENANT_A}/${SO_ID}/abc.pdf`,
        "x.pdf",
        "application/pdf",
        500,
        USER_ID,
        { userId: USER_ID }
      )
      expect(attachment.id).toBe(ATT_ID)
    })

    it("rejects oversized files (>10 MB)", async () => {
      const prisma = makePrisma()
      await expect(
        service.confirmUpload(
          prisma,
          TENANT_A,
          SO_ID,
          `${TENANT_A}/${SO_ID}/big.pdf`,
          "big.pdf",
          "application/pdf",
          11 * 1024 * 1024,
          USER_ID
        )
      ).rejects.toBeInstanceOf(
        service.ServiceObjectAttachmentValidationError
      )
    })

    it("rejects storage paths that don't match expected prefix (path-traversal guard)", async () => {
      const prisma = makePrisma()
      await expect(
        service.confirmUpload(
          prisma,
          TENANT_A,
          SO_ID,
          `${TENANT_B}/otherFile.pdf`, // client-supplied cross-tenant path
          "x.pdf",
          "application/pdf",
          100,
          USER_ID
        )
      ).rejects.toBeInstanceOf(
        service.ServiceObjectAttachmentValidationError
      )
      expect(prisma.serviceObjectAttachment.create).not.toHaveBeenCalled()
    })

    it("re-checks MIME on confirm (defense-in-depth)", async () => {
      const prisma = makePrisma()
      await expect(
        service.confirmUpload(
          prisma,
          TENANT_A,
          SO_ID,
          `${TENANT_A}/${SO_ID}/x.pdf`,
          "x.pdf",
          "application/x-msdownload",
          500,
          USER_ID
        )
      ).rejects.toBeInstanceOf(
        service.ServiceObjectAttachmentValidationError
      )
    })
  })

  describe("deleteAttachment", () => {
    it("deletes storage + DB row + writes audit", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObjectAttachment.findFirst as ReturnType<
        typeof vi.fn
      >).mockResolvedValue({
        id: ATT_ID,
        tenantId: TENANT_A,
        storagePath: `${TENANT_A}/${SO_ID}/abc.pdf`,
        filename: "abc.pdf",
      })

      const res = await service.deleteAttachment(prisma, TENANT_A, ATT_ID, {
        userId: USER_ID,
      })
      expect(res).toEqual({ success: true })
      expect(prisma.serviceObjectAttachment.deleteMany).toHaveBeenCalledWith({
        where: { id: ATT_ID, tenantId: TENANT_A },
      })
    })

    it("cross-tenant delete is blocked (findFirst returns null for wrong tenant)", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObjectAttachment.findFirst as ReturnType<
        typeof vi.fn
      >).mockResolvedValue(null)

      await expect(
        service.deleteAttachment(prisma, TENANT_B, ATT_ID)
      ).rejects.toBeInstanceOf(service.ServiceObjectAttachmentNotFoundError)
      expect(prisma.serviceObjectAttachment.deleteMany).not.toHaveBeenCalled()
    })
  })

  describe("getDownloadUrl", () => {
    it("returns signed URL for tenant's attachment", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObjectAttachment.findFirst as ReturnType<
        typeof vi.fn
      >).mockResolvedValue({
        id: ATT_ID,
        tenantId: TENANT_A,
        storagePath: `${TENANT_A}/${SO_ID}/abc.pdf`,
      })
      const result = await service.getDownloadUrl(prisma, TENANT_A, ATT_ID)
      expect(result?.signedUrl).toMatch(/^https:\/\//)
    })

    it("cross-tenant read is blocked", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObjectAttachment.findFirst as ReturnType<
        typeof vi.fn
      >).mockResolvedValue(null)
      await expect(
        service.getDownloadUrl(prisma, TENANT_B, ATT_ID)
      ).rejects.toBeInstanceOf(service.ServiceObjectAttachmentNotFoundError)
    })
  })

  describe("listAttachments", () => {
    it("maps each DB row to include a downloadUrl", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObjectAttachment.findMany as ReturnType<
        typeof vi.fn
      >).mockResolvedValue([
        { id: ATT_ID, storagePath: "a", filename: "a.pdf" },
      ])
      const list = await service.listAttachments(prisma, TENANT_A, SO_ID)
      expect(list).toHaveLength(1)
      expect(list[0]!.downloadUrl).toMatch(/^https:\/\//)
    })
  })
})
