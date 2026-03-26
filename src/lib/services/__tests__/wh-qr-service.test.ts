import { describe, it, expect, vi } from "vitest"
import * as service from "../wh-qr-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Constants ---
const TENANT_ID = "a0b1c2d3-0000-4000-a000-000000000100"
const OTHER_TENANT_ID = "ff000000-0000-4000-a000-000000000999"
const ARTICLE_ID = "b1000000-0000-4000-a000-000000000001"
const ARTICLE_ID_2 = "b1000000-0000-4000-a000-000000000002"
const MOVEMENT_ID = "e1000000-0000-4000-a000-000000000001"

// --- Mock Data ---

const mockArticle = {
  id: ARTICLE_ID,
  number: "ART-00042",
  name: "Schrauben M8x20",
  unit: "Stk",
  currentStock: 100,
  minStock: 10,
  warehouseLocation: "Regal A1",
  images: null,
  stockTracking: true,
}

const mockArticle2 = {
  ...mockArticle,
  id: ARTICLE_ID_2,
  number: "ART-00043",
  name: "Muttern M8",
}

const mockMovement = {
  id: MOVEMENT_ID,
  type: "WITHDRAWAL",
  quantity: -5,
  previousStock: 100,
  newStock: 95,
  date: new Date(),
  reason: null,
  notes: null,
  createdAt: new Date(),
  purchaseOrderId: null,
  orderId: null,
  documentId: null,
  article: { id: ARTICLE_ID, number: "ART-00042", name: "Schrauben M8x20", unit: "Stk" },
}

// --- Mock Prisma Factory ---

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  const prisma = {
    whArticle: {
      findFirst: vi.fn().mockResolvedValue(mockArticle),
      findMany: vi.fn().mockResolvedValue([mockArticle, mockArticle2]),
    },
    whStockMovement: {
      findMany: vi.fn().mockResolvedValue([mockMovement]),
    },
    whPurchaseOrderPosition: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  } as unknown as PrismaClient

  return prisma
}

// --- Tests ---

describe("wh-qr-service", () => {
  describe("buildQrContent", () => {
    it("constructs correct format from tenant ID and article number", () => {
      expect(service.buildQrContent(TENANT_ID, "ART-00042")).toBe(
        "TERP:ART:a0b1c2:ART-00042"
      )
    })

    it("uses first 6 characters of tenant ID", () => {
      const result = service.buildQrContent("abcdef99-xxxx-xxxx-xxxx-xxxxxxxxxxxx", "X-1")
      expect(result).toBe("TERP:ART:abcdef:X-1")
    })
  })

  describe("generateQrDataUrl", () => {
    it("returns a valid data URL string", async () => {
      const url = await service.generateQrDataUrl("TERP:ART:a0b1c2:ART-00042")
      expect(url).toMatch(/^data:image\/png;base64,/)
    })

    it("accepts custom size parameter", async () => {
      const url = await service.generateQrDataUrl("TERP:ART:a0b1c2:ART-1", 300)
      expect(url).toMatch(/^data:image\/png;base64,/)
    })
  })

  describe("resolveQrCode", () => {
    it("parses valid TERP:ART: code and returns article", async () => {
      const prisma = createMockPrisma()
      const result = await service.resolveQrCode(
        prisma,
        TENANT_ID,
        "TERP:ART:a0b1c2:ART-00042"
      )
      expect(result).toMatchObject({
        id: ARTICLE_ID,
        number: "ART-00042",
        name: "Schrauben M8x20",
      })
      expect(prisma.whArticle.findFirst).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, number: "ART-00042", isActive: true },
        select: expect.objectContaining({ id: true, number: true, name: true }),
      })
    })

    it("rejects invalid QR code format", async () => {
      const prisma = createMockPrisma()
      await expect(
        service.resolveQrCode(prisma, TENANT_ID, "INVALID-CODE")
      ).rejects.toThrow(service.WhQrValidationError)
    })

    it("rejects QR code without TERP:ART: prefix", async () => {
      const prisma = createMockPrisma()
      await expect(
        service.resolveQrCode(prisma, TENANT_ID, "https://example.com")
      ).rejects.toThrow(service.WhQrValidationError)
    })

    it("rejects QR code from different tenant", async () => {
      const prisma = createMockPrisma()
      await expect(
        service.resolveQrCode(prisma, TENANT_ID, "TERP:ART:ffffff:ART-00042")
      ).rejects.toThrow(service.WhQrForbiddenError)
    })

    it("rejects unknown/inactive article", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
        },
      })
      await expect(
        service.resolveQrCode(prisma, TENANT_ID, "TERP:ART:a0b1c2:NOEXIST")
      ).rejects.toThrow(service.WhQrNotFoundError)
    })
  })

  describe("resolveByNumber", () => {
    it("returns article for valid number", async () => {
      const prisma = createMockPrisma()
      const result = await service.resolveByNumber(prisma, TENANT_ID, "ART-00042")
      expect(result).toMatchObject({ id: ARTICLE_ID, number: "ART-00042" })
    })

    it("throws WhQrNotFoundError for unknown article", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
        },
      })
      await expect(
        service.resolveByNumber(prisma, TENANT_ID, "NOEXIST")
      ).rejects.toThrow(service.WhQrNotFoundError)
    })

    it("includes tenantId in query", async () => {
      const prisma = createMockPrisma()
      await service.resolveByNumber(prisma, TENANT_ID, "ART-00042")
      expect(prisma.whArticle.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_ID }),
        })
      )
    })
  })

  describe("generateSingleQr", () => {
    it("returns data URL and article info", async () => {
      const prisma = createMockPrisma()
      const result = await service.generateSingleQr(prisma, TENANT_ID, ARTICLE_ID)
      expect(result.dataUrl).toMatch(/^data:image\/png;base64,/)
      expect(result.content).toBe("TERP:ART:a0b1c2:ART-00042")
      expect(result.article).toMatchObject({
        id: ARTICLE_ID,
        number: "ART-00042",
      })
    })

    it("throws for unknown article", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
        },
      })
      await expect(
        service.generateSingleQr(prisma, TENANT_ID, "nonexistent")
      ).rejects.toThrow(service.WhQrNotFoundError)
    })
  })

  describe("listRecentMovements", () => {
    it("returns movements for article", async () => {
      const prisma = createMockPrisma()
      const result = await service.listRecentMovements(prisma, TENANT_ID, ARTICLE_ID)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ id: MOVEMENT_ID, type: "WITHDRAWAL" })
    })

    it("includes tenantId in query", async () => {
      const prisma = createMockPrisma()
      await service.listRecentMovements(prisma, TENANT_ID, ARTICLE_ID, 5)
      expect(prisma.whStockMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_ID, articleId: ARTICLE_ID },
          take: 5,
        })
      )
    })

    it("defaults to 10 results", async () => {
      const prisma = createMockPrisma()
      await service.listRecentMovements(prisma, TENANT_ID, ARTICLE_ID)
      expect(prisma.whStockMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 })
      )
    })
  })

  describe("findPendingPositionsForArticle", () => {
    it("queries by tenantId and articleId", async () => {
      const prisma = createMockPrisma()
      await service.findPendingPositionsForArticle(prisma, TENANT_ID, ARTICLE_ID)
      expect(prisma.whPurchaseOrderPosition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            articleId: ARTICLE_ID,
            purchaseOrder: expect.objectContaining({
              tenantId: TENANT_ID,
            }),
          }),
        })
      )
    })

    it("filters out fully received positions", async () => {
      const prisma = createMockPrisma({
        whPurchaseOrderPosition: {
          findMany: vi.fn().mockResolvedValue([
            { id: "p1", quantity: 10, receivedQuantity: 5, purchaseOrder: { id: "po1", number: "PO-1" } },
            { id: "p2", quantity: 10, receivedQuantity: 10, purchaseOrder: { id: "po2", number: "PO-2" } },
            { id: "p3", quantity: 20, receivedQuantity: 0, purchaseOrder: { id: "po3", number: "PO-3" } },
          ]),
        },
      })
      const result = await service.findPendingPositionsForArticle(prisma, TENANT_ID, ARTICLE_ID)
      expect(result).toHaveLength(2)
      expect(result.map((p: { id: string }) => p.id)).toEqual(["p1", "p3"])
    })
  })

  describe("tenant isolation - cross-tenant", () => {
    it("resolveQrCode rejects code from other tenant", async () => {
      const prisma = createMockPrisma()
      const otherTenantCode = service.buildQrContent(OTHER_TENANT_ID, "ART-00042")
      await expect(
        service.resolveQrCode(prisma, TENANT_ID, otherTenantCode)
      ).rejects.toThrow(service.WhQrForbiddenError)
    })

    it("resolveByNumber filters by tenantId", async () => {
      const prisma = createMockPrisma()
      await service.resolveByNumber(prisma, TENANT_ID, "ART-00042")
      expect(prisma.whArticle.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_ID }),
        })
      )
    })
  })
})
