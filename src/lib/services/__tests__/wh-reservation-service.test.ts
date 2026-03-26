import { describe, it, expect, vi } from "vitest"
import * as service from "../wh-reservation-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Constants ---
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const OTHER_TENANT_ID = "ff000000-0000-4000-a000-000000000999"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ARTICLE_ID = "b1000000-0000-4000-a000-000000000001"
const ARTICLE_ID_2 = "b1000000-0000-4000-a000-000000000002"
const DOCUMENT_ID = "c1000000-0000-4000-a000-000000000001"
const POSITION_ID = "d1000000-0000-4000-a000-000000000001"
const POSITION_ID_2 = "d1000000-0000-4000-a000-000000000002"
const RESERVATION_ID = "e1000000-0000-4000-a000-000000000001"

// --- Mock Data ---
const mockArticle = {
  id: ARTICLE_ID,
  tenantId: TENANT_ID,
  number: "ART-1",
  name: "Test Article",
  unit: "Stk",
  currentStock: 100,
  stockTracking: true,
}

const mockArticleNoTracking = {
  ...mockArticle,
  id: ARTICLE_ID_2,
  stockTracking: false,
}

const mockReservation = {
  id: RESERVATION_ID,
  tenantId: TENANT_ID,
  articleId: ARTICLE_ID,
  documentId: DOCUMENT_ID,
  positionId: POSITION_ID,
  quantity: 30,
  status: "ACTIVE",
  releasedAt: null,
  releasedById: null,
  releaseReason: null,
  createdAt: new Date("2026-03-26T10:00:00Z"),
  updatedAt: new Date("2026-03-26T10:00:00Z"),
  createdById: USER_ID,
  article: { id: ARTICLE_ID, number: "ART-1", name: "Test Article", unit: "Stk" },
}

const mockDocument = {
  id: DOCUMENT_ID,
  tenantId: TENANT_ID,
  type: "ORDER_CONFIRMATION",
  status: "PRINTED",
  number: "AB-001",
  positions: [
    {
      id: POSITION_ID,
      type: "ARTICLE",
      articleId: ARTICLE_ID,
      quantity: 30,
      sortOrder: 0,
    },
    {
      id: POSITION_ID_2,
      type: "ARTICLE",
      articleId: ARTICLE_ID_2,
      quantity: 10,
      sortOrder: 1,
    },
    {
      id: "d1000000-0000-4000-a000-000000000003",
      type: "TEXT",
      articleId: null,
      quantity: null,
      sortOrder: 2,
    },
  ],
}

// --- Mock Prisma Factory ---
function createMockPrisma(overrides: Record<string, unknown> = {}) {
  const prisma = {
    whStockReservation: {
      findMany: vi.fn().mockResolvedValue([mockReservation]),
      findFirst: vi.fn().mockResolvedValue(mockReservation),
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn().mockResolvedValue(mockReservation),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      aggregate: vi.fn().mockResolvedValue({ _sum: { quantity: 30 } }),
    },
    whArticle: {
      findFirst: vi.fn().mockResolvedValue(mockArticle),
    },
    billingDocument: {
      findFirst: vi.fn().mockResolvedValue(mockDocument),
      findMany: vi.fn().mockResolvedValue([
        { id: DOCUMENT_ID, number: "AB-001", address: { company: "Test GmbH" } },
      ]),
    },
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    ...overrides,
  } as unknown as PrismaClient
  return prisma
}

// --- Tests ---
describe("wh-reservation-service", () => {
  describe("createReservationsForDocument", () => {
    it("creates reservation for each ARTICLE position with stockTracking", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce({ id: ARTICLE_ID, stockTracking: true })
            .mockResolvedValueOnce({ id: ARTICLE_ID_2, stockTracking: true }),
        },
      })

      const result = await service.createReservationsForDocument(
        prisma,
        TENANT_ID,
        DOCUMENT_ID,
        USER_ID
      )

      expect(result).toEqual({ reservedCount: 2 })
      expect((prisma.whStockReservation as unknown as { create: ReturnType<typeof vi.fn> }).create).toHaveBeenCalledTimes(2)
    })

    it("skips positions without articleId", async () => {
      const docWithTextOnly = {
        ...mockDocument,
        positions: [
          { id: "p1", type: "TEXT", articleId: null, quantity: null, sortOrder: 0 },
          { id: "p2", type: "PAGE_BREAK", articleId: null, quantity: null, sortOrder: 1 },
        ],
      }
      const prisma = createMockPrisma({
        billingDocument: {
          findFirst: vi.fn().mockResolvedValue(docWithTextOnly),
          findMany: vi.fn().mockResolvedValue([]),
        },
      })

      const result = await service.createReservationsForDocument(
        prisma,
        TENANT_ID,
        DOCUMENT_ID,
        USER_ID
      )

      expect(result).toEqual({ reservedCount: 0 })
    })

    it("skips positions where article has stockTracking=false", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(mockArticleNoTracking),
        },
      })

      const result = await service.createReservationsForDocument(
        prisma,
        TENANT_ID,
        DOCUMENT_ID,
        USER_ID
      )

      expect(result).toEqual({ reservedCount: 0 })
    })

    it("skips non-ORDER_CONFIRMATION documents", async () => {
      const prisma = createMockPrisma({
        billingDocument: {
          findFirst: vi.fn().mockResolvedValue(null), // query with type filter returns null
          findMany: vi.fn().mockResolvedValue([]),
        },
      })

      const result = await service.createReservationsForDocument(
        prisma,
        TENANT_ID,
        DOCUMENT_ID,
        USER_ID
      )

      expect(result).toEqual({ reservedCount: 0 })
    })
  })

  describe("getAvailableStock", () => {
    it("returns currentStock - reservedStock as availableStock", async () => {
      const prisma = createMockPrisma()

      const result = await service.getAvailableStock(prisma, TENANT_ID, ARTICLE_ID)

      expect(result).toEqual({
        currentStock: 100,
        reservedStock: 30,
        availableStock: 70,
      })
    })

    it("counts only ACTIVE reservations (not RELEASED or FULFILLED)", async () => {
      const prisma = createMockPrisma({
        whStockReservation: {
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(null),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          updateMany: vi.fn(),
          aggregate: vi.fn().mockResolvedValue({ _sum: { quantity: 0 } }),
        },
      })

      const result = await service.getAvailableStock(prisma, TENANT_ID, ARTICLE_ID)

      expect(result.reservedStock).toBe(0)
      expect(result.availableStock).toBe(100)
      // Verify aggregate was called with status: "ACTIVE"
      expect(
        (prisma.whStockReservation as unknown as { aggregate: ReturnType<typeof vi.fn> }).aggregate
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: "ACTIVE" }),
        })
      )
    })

    it("returns 0 reservedStock when no reservations exist", async () => {
      const prisma = createMockPrisma({
        whStockReservation: {
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(null),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          updateMany: vi.fn(),
          aggregate: vi.fn().mockResolvedValue({ _sum: { quantity: null } }),
        },
      })

      const result = await service.getAvailableStock(prisma, TENANT_ID, ARTICLE_ID)

      expect(result.reservedStock).toBe(0)
      expect(result.availableStock).toBe(100)
    })
  })

  describe("release", () => {
    it("sets status=RELEASED with reason and timestamp", async () => {
      const updatedReservation = { ...mockReservation, status: "RELEASED", releaseReason: "Test reason" }
      const prisma = createMockPrisma({
        whStockReservation: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce(mockReservation) // findById
            .mockResolvedValueOnce(updatedReservation), // findById after update
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          aggregate: vi.fn().mockResolvedValue({ _sum: { quantity: 0 } }),
        },
      })

      const result = await service.release(prisma, TENANT_ID, RESERVATION_ID, USER_ID, "Test reason")

      expect(result!.status).toBe("RELEASED")
      expect(
        (prisma.whStockReservation as unknown as { updateMany: ReturnType<typeof vi.fn> }).updateMany
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: RESERVATION_ID, tenantId: TENANT_ID },
          data: expect.objectContaining({
            status: "RELEASED",
            releaseReason: "Test reason",
          }),
        })
      )
    })

    it("throws WhReservationNotFoundError for unknown id", async () => {
      const prisma = createMockPrisma({
        whStockReservation: {
          findFirst: vi.fn().mockResolvedValue(null),
          updateMany: vi.fn(),
          aggregate: vi.fn().mockResolvedValue({ _sum: { quantity: 0 } }),
        },
      })

      await expect(
        service.release(prisma, TENANT_ID, "unknown-id", USER_ID)
      ).rejects.toThrow("Stock reservation not found")
    })

    it("throws WhReservationValidationError for non-ACTIVE reservation", async () => {
      const releasedReservation = { ...mockReservation, status: "RELEASED" }
      const prisma = createMockPrisma({
        whStockReservation: {
          findFirst: vi.fn().mockResolvedValue(releasedReservation),
          updateMany: vi.fn(),
          aggregate: vi.fn().mockResolvedValue({ _sum: { quantity: 0 } }),
        },
      })

      await expect(
        service.release(prisma, TENANT_ID, RESERVATION_ID, USER_ID)
      ).rejects.toThrow("Only active reservations can be released")
    })

    it("uses 'MANUAL' as default reason when none provided", async () => {
      const updatedReservation = { ...mockReservation, status: "RELEASED", releaseReason: "MANUAL" }
      const prisma = createMockPrisma({
        whStockReservation: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce(mockReservation)
            .mockResolvedValueOnce(updatedReservation),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          aggregate: vi.fn().mockResolvedValue({ _sum: { quantity: 0 } }),
        },
      })

      await service.release(prisma, TENANT_ID, RESERVATION_ID, USER_ID)

      expect(
        (prisma.whStockReservation as unknown as { updateMany: ReturnType<typeof vi.fn> }).updateMany
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            releaseReason: "MANUAL",
          }),
        })
      )
    })
  })

  describe("releaseReservationsForDeliveryNote", () => {
    it("releases parent AB reservations when delivery note is created", async () => {
      const deliveryNote = {
        id: "dn-1",
        type: "DELIVERY_NOTE",
        parentDocumentId: DOCUMENT_ID,
      }
      const prisma = createMockPrisma({
        billingDocument: {
          findFirst: vi.fn().mockResolvedValue(deliveryNote),
          findMany: vi.fn().mockResolvedValue([]),
        },
      })

      const result = await service.releaseReservationsForDeliveryNote(
        prisma,
        TENANT_ID,
        "dn-1",
        USER_ID
      )

      expect(result).toEqual({ releasedCount: 1 })
      expect(
        (prisma.whStockReservation as unknown as { updateMany: ReturnType<typeof vi.fn> }).updateMany
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            documentId: DOCUMENT_ID,
            status: "ACTIVE",
          }),
          data: expect.objectContaining({
            status: "FULFILLED",
            releaseReason: "DELIVERY_NOTE",
          }),
        })
      )
    })

    it("sets status=FULFILLED with releaseReason=DELIVERY_NOTE", async () => {
      const deliveryNote = {
        id: "dn-1",
        type: "DELIVERY_NOTE",
        parentDocumentId: DOCUMENT_ID,
      }
      const prisma = createMockPrisma({
        billingDocument: {
          findFirst: vi.fn().mockResolvedValue(deliveryNote),
          findMany: vi.fn().mockResolvedValue([]),
        },
      })

      await service.releaseReservationsForDeliveryNote(prisma, TENANT_ID, "dn-1", USER_ID)

      expect(
        (prisma.whStockReservation as unknown as { updateMany: ReturnType<typeof vi.fn> }).updateMany
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "FULFILLED",
            releaseReason: "DELIVERY_NOTE",
          }),
        })
      )
    })

    it("is no-op when delivery note has no parentDocumentId", async () => {
      const deliveryNote = {
        id: "dn-1",
        type: "DELIVERY_NOTE",
        parentDocumentId: null,
      }
      const prisma = createMockPrisma({
        billingDocument: {
          findFirst: vi.fn().mockResolvedValue(deliveryNote),
          findMany: vi.fn().mockResolvedValue([]),
        },
      })

      const result = await service.releaseReservationsForDeliveryNote(
        prisma,
        TENANT_ID,
        "dn-1",
        USER_ID
      )

      expect(result).toEqual({ releasedCount: 0 })
      expect(
        (prisma.whStockReservation as unknown as { updateMany: ReturnType<typeof vi.fn> }).updateMany
      ).not.toHaveBeenCalled()
    })
  })

  describe("releaseReservationsForCancel", () => {
    it("releases all active reservations for cancelled document", async () => {
      const prisma = createMockPrisma()

      const result = await service.releaseReservationsForCancel(
        prisma,
        TENANT_ID,
        DOCUMENT_ID,
        USER_ID
      )

      expect(result).toEqual({ releasedCount: 1 })
    })

    it("sets status=RELEASED with releaseReason=CANCELLED", async () => {
      const prisma = createMockPrisma()

      await service.releaseReservationsForCancel(prisma, TENANT_ID, DOCUMENT_ID, USER_ID)

      expect(
        (prisma.whStockReservation as unknown as { updateMany: ReturnType<typeof vi.fn> }).updateMany
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "RELEASED",
            releaseReason: "CANCELLED",
          }),
        })
      )
    })

    it("is no-op when document has no reservations", async () => {
      const prisma = createMockPrisma({
        whStockReservation: {
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(null),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          aggregate: vi.fn().mockResolvedValue({ _sum: { quantity: 0 } }),
        },
      })

      const result = await service.releaseReservationsForCancel(
        prisma,
        TENANT_ID,
        DOCUMENT_ID,
        USER_ID
      )

      expect(result).toEqual({ releasedCount: 0 })
    })
  })

  describe("releaseBulk", () => {
    it("releases all active reservations for a document", async () => {
      const prisma = createMockPrisma()

      const result = await service.releaseBulk(prisma, TENANT_ID, DOCUMENT_ID, USER_ID)

      expect(result).toEqual({ releasedCount: 1 })
    })

    it("returns { releasedCount } with correct count", async () => {
      const prisma = createMockPrisma({
        whStockReservation: {
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(null),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          updateMany: vi.fn().mockResolvedValue({ count: 5 }),
          aggregate: vi.fn().mockResolvedValue({ _sum: { quantity: 0 } }),
        },
      })

      const result = await service.releaseBulk(prisma, TENANT_ID, DOCUMENT_ID, USER_ID)

      expect(result.releasedCount).toBe(5)
    })
  })

  // MANDATORY: Tenant isolation tests
  describe("tenant isolation", () => {
    it("list — returns only reservations for the given tenant", async () => {
      const prisma = createMockPrisma()

      await service.list(prisma, TENANT_ID, { page: 1, pageSize: 25 })

      expect(
        (prisma.whStockReservation as unknown as { findMany: ReturnType<typeof vi.fn> }).findMany
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_ID }),
        })
      )
    })

    it("getByArticle — returns empty for article belonging to other tenant", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(null), // not found for other tenant
        },
      })

      await expect(
        service.getByArticle(prisma, OTHER_TENANT_ID, ARTICLE_ID)
      ).rejects.toThrow("Article not found")
    })

    it("release — throws NotFoundError for reservation from other tenant", async () => {
      const prisma = createMockPrisma({
        whStockReservation: {
          findFirst: vi.fn().mockResolvedValue(null), // not found for other tenant
          updateMany: vi.fn(),
          aggregate: vi.fn().mockResolvedValue({ _sum: { quantity: 0 } }),
        },
      })

      await expect(
        service.release(prisma, OTHER_TENANT_ID, RESERVATION_ID, USER_ID)
      ).rejects.toThrow("Stock reservation not found")
    })

    it("getAvailableStock — only sums reservations for the given tenant", async () => {
      const prisma = createMockPrisma()

      await service.getAvailableStock(prisma, TENANT_ID, ARTICLE_ID)

      expect(
        (prisma.whStockReservation as unknown as { aggregate: ReturnType<typeof vi.fn> }).aggregate
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_ID }),
        })
      )
    })
  })
})
