import { describe, it, expect, vi, beforeEach } from "vitest"
import type { PrismaClient } from "@/generated/prisma/client"
import * as service from "../email-template-service"

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const TEMPLATE_ID = "c0000000-0000-4000-c000-000000000001"

const mockTemplate = {
  id: TEMPLATE_ID,
  tenantId: TENANT_ID,
  documentType: "INVOICE",
  name: "Rechnung Standard",
  subject: "Rechnung {Dokumentennummer}",
  bodyHtml: "<p>Hallo {Kundenname}</p>",
  isDefault: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    emailTemplate: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => {
      const txPrisma = createMockPrisma(overrides)
      return fn(txPrisma)
    }),
    ...overrides,
  } as unknown as PrismaClient
}

describe("email-template-service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("list", () => {
    it("returns templates filtered by documentType", async () => {
      const prisma = createMockPrisma()
      ;(prisma.emailTemplate.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        mockTemplate,
      ])

      const result = await service.list(prisma, TENANT_ID, "INVOICE")
      expect(result).toHaveLength(1)
      expect(prisma.emailTemplate.findMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, documentType: "INVOICE" },
        orderBy: { createdAt: "desc" },
      })
    })

    it("returns all templates when no filter", async () => {
      const prisma = createMockPrisma()
      ;(prisma.emailTemplate.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        mockTemplate,
      ])

      await service.list(prisma, TENANT_ID)
      expect(prisma.emailTemplate.findMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
        orderBy: { createdAt: "desc" },
      })
    })
  })

  describe("getById", () => {
    it("returns template when found", async () => {
      const prisma = createMockPrisma()
      ;(prisma.emailTemplate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockTemplate
      )

      const result = await service.getById(prisma, TENANT_ID, TEMPLATE_ID)
      expect(result.id).toBe(TEMPLATE_ID)
    })

    it("throws EmailTemplateNotFoundError when not found", async () => {
      const prisma = createMockPrisma()
      ;(prisma.emailTemplate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        null
      )

      await expect(
        service.getById(prisma, TENANT_ID, TEMPLATE_ID)
      ).rejects.toThrow(service.EmailTemplateNotFoundError)
    })
  })

  describe("getDefault", () => {
    it("returns DB default template when exists", async () => {
      const prisma = createMockPrisma()
      ;(prisma.emailTemplate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockTemplate
      )

      const result = await service.getDefault(prisma, TENANT_ID, "INVOICE")
      expect(result).toEqual(mockTemplate)
    })

    it("returns code-level fallback template when no DB default", async () => {
      const prisma = createMockPrisma()
      ;(prisma.emailTemplate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        null
      )

      const result = await service.getDefault(prisma, TENANT_ID, "INVOICE")
      expect(result).not.toBeNull()
      expect(result?.subject).toContain("{Dokumentennummer}")
      expect(result?.id).toBeNull()
    })

    it("returns correct fallback for each document type", async () => {
      const prisma = createMockPrisma()
      ;(prisma.emailTemplate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        null
      )

      const offer = await service.getDefault(prisma, TENANT_ID, "OFFER")
      expect(offer?.subject).toContain("Angebot")

      const po = await service.getDefault(prisma, TENANT_ID, "PURCHASE_ORDER")
      expect(po?.subject).toContain("Bestellung")
    })
  })

  describe("remove", () => {
    it("throws EmailTemplateNotFoundError for wrong tenant", async () => {
      const prisma = createMockPrisma()
      ;(prisma.emailTemplate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        null
      )

      await expect(
        service.remove(prisma, TENANT_ID, TEMPLATE_ID)
      ).rejects.toThrow(service.EmailTemplateNotFoundError)
    })
  })
})
