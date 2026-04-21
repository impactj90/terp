import { describe, it, expect, vi, beforeEach } from "vitest"
import * as service from "../service-object-qr-service"
import type { PrismaClient } from "@/generated/prisma/client"

vi.mock("@/lib/supabase/storage", () => ({
  upload: vi.fn().mockResolvedValue({ path: "ok" }),
  createSignedReadUrl: vi
    .fn()
    .mockResolvedValue("https://signed.example/labels.pdf"),
}))

vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer: vi
    .fn()
    .mockResolvedValue(Buffer.from("%PDF-1.4\n% mocked")),
}))

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,mock"),
  },
}))

// The PDF component is imported but never rendered by hand — stub it.
vi.mock("@/lib/pdf/qr-label-pdf", () => ({
  QrLabelPdf: () => null,
}))

const TENANT_A = "aabbcc11-2233-4455-6677-8899aabbccdd"
// tenantShort derived from TENANT_A: first 6 hex chars -> "aabbcc"
const SHORT_A = TENANT_A.substring(0, 6)
const SO_ID = "so000000-0000-4000-a000-000000000001"

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    serviceObject: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  } as unknown as PrismaClient
}

describe("service-object-qr-service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("buildServiceObjectQrContent", () => {
    it("produces deterministic payload", () => {
      expect(
        service.buildServiceObjectQrContent(TENANT_A, "SO-001")
      ).toBe(`TERP:SO:${SHORT_A}:SO-001`)
    })
  })

  describe("resolveServiceObjectQrCode", () => {
    it("returns service object for a valid payload", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        {
          id: SO_ID,
          number: "SO-001",
          name: "Kältemaschine",
          kind: "EQUIPMENT",
          status: "OPERATIONAL",
          customerAddress: { id: "c1", company: "Acme", number: "K-1" },
        }
      )
      const result = await service.resolveServiceObjectQrCode(
        prisma,
        TENANT_A,
        `TERP:SO:${SHORT_A}:SO-001`
      )
      expect(result.serviceObjectId).toBe(SO_ID)
      expect(result.redirectUrl).toBe(`/serviceobjects/${SO_ID}`)
    })

    it("throws ValidationError for malformed payload", async () => {
      const prisma = makePrisma()
      await expect(
        service.resolveServiceObjectQrCode(prisma, TENANT_A, "nope")
      ).rejects.toBeInstanceOf(service.ServiceObjectQrValidationError)
    })

    it("throws ValidationError for wrong prefix (e.g. TERP:ART:)", async () => {
      const prisma = makePrisma()
      await expect(
        service.resolveServiceObjectQrCode(
          prisma,
          TENANT_A,
          `TERP:ART:${SHORT_A}:ART-1`
        )
      ).rejects.toBeInstanceOf(service.ServiceObjectQrValidationError)
    })

    it("throws ForbiddenError for payload from a different tenant", async () => {
      const prisma = makePrisma()
      await expect(
        service.resolveServiceObjectQrCode(
          prisma,
          TENANT_A,
          `TERP:SO:ffffff:SO-001` // different tenantShort
        )
      ).rejects.toBeInstanceOf(service.ServiceObjectQrForbiddenError)
    })

    it("throws NotFoundError when number doesn't exist", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        null
      )
      await expect(
        service.resolveServiceObjectQrCode(
          prisma,
          TENANT_A,
          `TERP:SO:${SHORT_A}:MISSING`
        )
      ).rejects.toBeInstanceOf(service.ServiceObjectQrNotFoundError)
    })
  })

  describe("generateServiceObjectQrDataUrl", () => {
    it("returns dataUrl + content for an existing object", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        {
          id: SO_ID,
          number: "SO-001",
          name: "Test",
          kind: "EQUIPMENT",
          status: "OPERATIONAL",
          customerAddress: { id: "c1", company: "Acme", number: "K-1" },
        }
      )
      const result = await service.generateServiceObjectQrDataUrl(
        prisma,
        TENANT_A,
        SO_ID
      )
      expect(result.dataUrl).toBe("data:image/png;base64,mock")
      expect(result.content).toBe(`TERP:SO:${SHORT_A}:SO-001`)
    })

    it("throws NotFoundError for missing id", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        null
      )
      await expect(
        service.generateServiceObjectQrDataUrl(prisma, TENANT_A, SO_ID)
      ).rejects.toBeInstanceOf(service.ServiceObjectQrNotFoundError)
    })
  })

  describe("generateServiceObjectLabelPdf", () => {
    it("uploads PDF and returns signed URL + filename", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        [
          {
            id: SO_ID,
            number: "SO-001",
            name: "Kältemaschine mit sehr langem Namen der über 30 Zeichen hinausgeht",
            customerAddress: { company: "Acme" },
          },
        ]
      )
      const res = await service.generateServiceObjectLabelPdf(
        prisma,
        TENANT_A,
        [SO_ID],
        "AVERY_L4736"
      )
      expect(res.signedUrl).toMatch(/^https:\/\//)
      expect(res.filename).toMatch(/^Serviceobjekt-Etiketten_/)
    })

    it("rejects when no active objects match", async () => {
      const prisma = makePrisma()
      await expect(
        service.generateServiceObjectLabelPdf(
          prisma,
          TENANT_A,
          [SO_ID],
          "AVERY_L4736"
        )
      ).rejects.toBeInstanceOf(service.ServiceObjectQrNotFoundError)
    })
  })
})
