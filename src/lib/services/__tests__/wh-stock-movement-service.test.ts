import { describe, it, expect, vi } from "vitest"
import * as service from "../wh-stock-movement-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Constants ---
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const OTHER_TENANT_ID = "ff000000-0000-4000-a000-000000000999"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ARTICLE_ID = "b1000000-0000-4000-a000-000000000001"
const ARTICLE_ID_2 = "b1000000-0000-4000-a000-000000000002"
const PO_ID = "c1000000-0000-4000-a000-000000000001"
const POSITION_ID = "d1000000-0000-4000-a000-000000000001"
const POSITION_ID_2 = "d1000000-0000-4000-a000-000000000002"
const MOVEMENT_ID = "e1000000-0000-4000-a000-000000000001"

// --- Mock Data ---

const mockArticle = {
  id: ARTICLE_ID,
  tenantId: TENANT_ID,
  number: "ART-1",
  name: "Test Article",
  currentStock: 10,
  stockTracking: true,
  unit: "Stk",
}

const _mockArticle2 = {
  ...mockArticle,
  id: ARTICLE_ID_2,
  number: "ART-2",
  name: "Test Article 2",
  currentStock: 5,
}

const mockPO = {
  id: PO_ID,
  tenantId: TENANT_ID,
  number: "BES-1",
  status: "ORDERED",
  supplierId: "sup-1",
  supplier: { id: "sup-1", number: "L-1", company: "Test Supplier" },
}

const mockPosition = {
  id: POSITION_ID,
  purchaseOrderId: PO_ID,
  articleId: ARTICLE_ID,
  quantity: 20,
  receivedQuantity: 0,
  sortOrder: 0,
  unit: "Stk",
  article: {
    id: ARTICLE_ID,
    number: "ART-1",
    name: "Test Article",
    unit: "Stk",
    currentStock: 10,
    stockTracking: true,
  },
}

const mockPosition2 = {
  ...mockPosition,
  id: POSITION_ID_2,
  articleId: ARTICLE_ID_2,
  quantity: 10,
  receivedQuantity: 0,
  article: {
    id: ARTICLE_ID_2,
    number: "ART-2",
    name: "Test Article 2",
    unit: "Stk",
    currentStock: 5,
    stockTracking: true,
  },
}

const mockMovement = {
  id: MOVEMENT_ID,
  tenantId: TENANT_ID,
  articleId: ARTICLE_ID,
  type: "GOODS_RECEIPT",
  quantity: 5,
  previousStock: 10,
  newStock: 15,
  date: new Date(),
  purchaseOrderId: PO_ID,
  purchaseOrderPositionId: POSITION_ID,
  documentId: null,
  orderId: null,
  inventorySessionId: null,
  reason: null,
  notes: null,
  createdById: USER_ID,
  createdAt: new Date(),
  article: { id: ARTICLE_ID, number: "ART-1", name: "Test Article", unit: "Stk" },
  purchaseOrder: { id: PO_ID, number: "BES-1" },
}

// --- Mock Prisma Factory ---

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  const prisma = {
    whStockMovement: {
      findMany: vi.fn().mockResolvedValue([mockMovement]),
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn().mockResolvedValue(mockMovement),
    },
    whPurchaseOrder: {
      findFirst: vi.fn().mockResolvedValue(mockPO),
      findMany: vi.fn().mockResolvedValue([mockPO]),
      update: vi.fn().mockResolvedValue({ ...mockPO, status: "RECEIVED" }),
    },
    whPurchaseOrderPosition: {
      findFirst: vi.fn().mockResolvedValue(mockPosition),
      findMany: vi.fn().mockResolvedValue([mockPosition]),
      update: vi.fn().mockResolvedValue({ ...mockPosition, receivedQuantity: 20 }),
    },
    whArticle: {
      findFirst: vi.fn().mockResolvedValue(mockArticle),
      update: vi.fn().mockResolvedValue({ ...mockArticle, currentStock: 30 }),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
    ...overrides,
  } as unknown as PrismaClient

  return prisma
}

const audit = { userId: USER_ID, ipAddress: null, userAgent: null }

// --- Tests ---

describe("wh-stock-movement-service", () => {
  // ===========================================================================
  // listMovements
  // ===========================================================================

  describe("listMovements", () => {
    it("returns paginated movements", async () => {
      const prisma = createMockPrisma()
      const result = await service.listMovements(prisma, TENANT_ID, { page: 1, pageSize: 25 })
      expect(result.items).toHaveLength(1)
      expect(result.total).toBe(1)
      expect((prisma.whStockMovement.findMany as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_ID }),
        })
      )
    })

    it("filters by articleId", async () => {
      const prisma = createMockPrisma()
      await service.listMovements(prisma, TENANT_ID, {
        articleId: ARTICLE_ID,
        page: 1,
        pageSize: 25,
      })
      expect((prisma.whStockMovement.findMany as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_ID, articleId: ARTICLE_ID }),
        })
      )
    })

    it("filters by type", async () => {
      const prisma = createMockPrisma()
      await service.listMovements(prisma, TENANT_ID, {
        type: "GOODS_RECEIPT",
        page: 1,
        pageSize: 25,
      })
      expect((prisma.whStockMovement.findMany as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_ID, type: "GOODS_RECEIPT" }),
        })
      )
    })

    it("filters by date range", async () => {
      const prisma = createMockPrisma()
      await service.listMovements(prisma, TENANT_ID, {
        dateFrom: "2026-01-01",
        dateTo: "2026-12-31",
        page: 1,
        pageSize: 25,
      })
      expect((prisma.whStockMovement.findMany as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            date: {
              gte: new Date("2026-01-01"),
              lte: new Date("2026-12-31"),
            },
          }),
        })
      )
    })
  })

  // ===========================================================================
  // listByArticle
  // ===========================================================================

  describe("listByArticle", () => {
    it("returns movements for an article", async () => {
      const prisma = createMockPrisma()
      const result = await service.listByArticle(prisma, TENANT_ID, ARTICLE_ID)
      expect(result).toHaveLength(1)
      expect((prisma.whArticle.findFirst as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ARTICLE_ID, tenantId: TENANT_ID },
        })
      )
    })

    it("throws if article not found", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
      })
      await expect(
        service.listByArticle(prisma, TENANT_ID, "nonexistent-id")
      ).rejects.toThrow(service.WhStockMovementNotFoundError)
    })
  })

  // ===========================================================================
  // listPendingOrders
  // ===========================================================================

  describe("listPendingOrders", () => {
    it("returns ORDERED and PARTIALLY_RECEIVED POs", async () => {
      const prisma = createMockPrisma()
      const result = await service.listPendingOrders(prisma, TENANT_ID)
      expect(result).toHaveLength(1)
      expect((prisma.whPurchaseOrder.findMany as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            status: { in: ["ORDERED", "PARTIALLY_RECEIVED"] },
          }),
        })
      )
    })

    it("filters by supplierId", async () => {
      const prisma = createMockPrisma()
      await service.listPendingOrders(prisma, TENANT_ID, "sup-1")
      expect((prisma.whPurchaseOrder.findMany as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            supplierId: "sup-1",
          }),
        })
      )
    })
  })

  // ===========================================================================
  // getOrderPositions
  // ===========================================================================

  describe("getOrderPositions", () => {
    it("returns PO with positions", async () => {
      const poWithPositions = {
        ...mockPO,
        positions: [mockPosition],
      }
      const prisma = createMockPrisma({
        whPurchaseOrder: {
          findFirst: vi.fn().mockResolvedValue(poWithPositions),
          findMany: vi.fn().mockResolvedValue([mockPO]),
          update: vi.fn(),
        },
      })
      const result = await service.getOrderPositions(prisma, TENANT_ID, PO_ID)
      expect(result.id).toBe(PO_ID)
      expect(result.positions).toHaveLength(1)
    })

    it("throws if PO not found", async () => {
      const prisma = createMockPrisma({
        whPurchaseOrder: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          update: vi.fn(),
        },
      })
      await expect(
        service.getOrderPositions(prisma, TENANT_ID, "nonexistent-id")
      ).rejects.toThrow(service.WhStockMovementNotFoundError)
    })
  })

  // ===========================================================================
  // bookGoodsReceipt
  // ===========================================================================

  describe("bookGoodsReceipt", () => {
    it("creates stock movement for each position", async () => {
      const prisma = createMockPrisma()
      const result = await service.bookGoodsReceipt(
        prisma,
        TENANT_ID,
        {
          purchaseOrderId: PO_ID,
          positions: [{ positionId: POSITION_ID, quantity: 5 }],
        },
        USER_ID,
        audit
      )
      expect(result.movements).toHaveLength(1)
      expect((prisma.whStockMovement.create as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "GOODS_RECEIPT",
            quantity: 5,
            previousStock: 10,
            newStock: 15,
            tenantId: TENANT_ID,
            articleId: ARTICLE_ID,
          }),
        })
      )
    })

    it("updates article currentStock", async () => {
      const prisma = createMockPrisma()
      await service.bookGoodsReceipt(
        prisma,
        TENANT_ID,
        {
          purchaseOrderId: PO_ID,
          positions: [{ positionId: POSITION_ID, quantity: 5 }],
        },
        USER_ID
      )
      expect((prisma.whArticle.update as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ARTICLE_ID },
          data: { currentStock: 15 },
        })
      )
    })

    it("updates position receivedQuantity", async () => {
      const prisma = createMockPrisma()
      await service.bookGoodsReceipt(
        prisma,
        TENANT_ID,
        {
          purchaseOrderId: PO_ID,
          positions: [{ positionId: POSITION_ID, quantity: 5 }],
        },
        USER_ID
      )
      expect((prisma.whPurchaseOrderPosition.update as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: POSITION_ID },
          data: { receivedQuantity: { increment: 5 } },
        })
      )
    })

    it("sets PO status to PARTIALLY_RECEIVED when some positions fulfilled", async () => {
      // 2 positions, book only first one partially
      const prisma = createMockPrisma({
        whPurchaseOrder: {
          findFirst: vi.fn().mockResolvedValue(mockPO),
          update: vi.fn().mockResolvedValue({ ...mockPO, status: "PARTIALLY_RECEIVED" }),
        },
        whPurchaseOrderPosition: {
          findFirst: vi.fn().mockResolvedValue(mockPosition),
          findMany: vi.fn().mockResolvedValue([
            { ...mockPosition, receivedQuantity: 5, quantity: 20 },
            { ...mockPosition2, receivedQuantity: 0, quantity: 10 },
          ]),
          update: vi.fn().mockResolvedValue({ ...mockPosition, receivedQuantity: 5 }),
        },
      })
      await service.bookGoodsReceipt(
        prisma,
        TENANT_ID,
        {
          purchaseOrderId: PO_ID,
          positions: [{ positionId: POSITION_ID, quantity: 5 }],
        },
        USER_ID
      )
      expect((prisma.whPurchaseOrder.update as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: "PARTIALLY_RECEIVED" },
        })
      )
    })

    it("sets PO status to RECEIVED when all positions fully received", async () => {
      const prisma = createMockPrisma({
        whPurchaseOrder: {
          findFirst: vi.fn().mockResolvedValue(mockPO),
          update: vi.fn().mockResolvedValue({ ...mockPO, status: "RECEIVED" }),
        },
        whPurchaseOrderPosition: {
          findFirst: vi.fn().mockResolvedValue({ ...mockPosition, quantity: 20, receivedQuantity: 0 }),
          findMany: vi.fn().mockResolvedValue([
            { ...mockPosition, quantity: 20, receivedQuantity: 20 },
          ]),
          update: vi.fn().mockResolvedValue({ ...mockPosition, receivedQuantity: 20 }),
        },
      })
      await service.bookGoodsReceipt(
        prisma,
        TENANT_ID,
        {
          purchaseOrderId: PO_ID,
          positions: [{ positionId: POSITION_ID, quantity: 20 }],
        },
        USER_ID
      )
      expect((prisma.whPurchaseOrder.update as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: "RECEIVED" },
        })
      )
    })

    it("rejects if quantity exceeds remaining", async () => {
      // Position has 10 ordered, 8 received => remaining = 2, booking 5
      const prisma = createMockPrisma({
        whPurchaseOrderPosition: {
          findFirst: vi.fn().mockResolvedValue({
            ...mockPosition,
            quantity: 10,
            receivedQuantity: 8,
          }),
          findMany: vi.fn().mockResolvedValue([]),
          update: vi.fn(),
        },
      })
      await expect(
        service.bookGoodsReceipt(
          prisma,
          TENANT_ID,
          {
            purchaseOrderId: PO_ID,
            positions: [{ positionId: POSITION_ID, quantity: 5 }],
          },
          USER_ID
        )
      ).rejects.toThrow(service.WhStockMovementValidationError)
    })

    it("rejects if PO is DRAFT", async () => {
      const prisma = createMockPrisma({
        whPurchaseOrder: {
          findFirst: vi.fn().mockResolvedValue({ ...mockPO, status: "DRAFT" }),
          update: vi.fn(),
        },
      })
      await expect(
        service.bookGoodsReceipt(
          prisma,
          TENANT_ID,
          {
            purchaseOrderId: PO_ID,
            positions: [{ positionId: POSITION_ID, quantity: 5 }],
          },
          USER_ID
        )
      ).rejects.toThrow(service.WhStockMovementValidationError)
    })

    it("rejects if PO is RECEIVED", async () => {
      const prisma = createMockPrisma({
        whPurchaseOrder: {
          findFirst: vi.fn().mockResolvedValue({ ...mockPO, status: "RECEIVED" }),
          update: vi.fn(),
        },
      })
      await expect(
        service.bookGoodsReceipt(
          prisma,
          TENANT_ID,
          {
            purchaseOrderId: PO_ID,
            positions: [{ positionId: POSITION_ID, quantity: 5 }],
          },
          USER_ID
        )
      ).rejects.toThrow(service.WhStockMovementValidationError)
    })

    it("rejects if PO is CANCELLED", async () => {
      const prisma = createMockPrisma({
        whPurchaseOrder: {
          findFirst: vi.fn().mockResolvedValue({ ...mockPO, status: "CANCELLED" }),
          update: vi.fn(),
        },
      })
      await expect(
        service.bookGoodsReceipt(
          prisma,
          TENANT_ID,
          {
            purchaseOrderId: PO_ID,
            positions: [{ positionId: POSITION_ID, quantity: 5 }],
          },
          USER_ID
        )
      ).rejects.toThrow(service.WhStockMovementValidationError)
    })

    it("rejects if position does not belong to PO", async () => {
      const prisma = createMockPrisma({
        whPurchaseOrderPosition: {
          findFirst: vi.fn().mockResolvedValue(null), // position not found for this PO
          findMany: vi.fn().mockResolvedValue([]),
          update: vi.fn(),
        },
      })
      await expect(
        service.bookGoodsReceipt(
          prisma,
          TENANT_ID,
          {
            purchaseOrderId: PO_ID,
            positions: [{ positionId: "wrong-position-id", quantity: 5 }],
          },
          USER_ID
        )
      ).rejects.toThrow(service.WhStockMovementValidationError)
    })
  })

  // ===========================================================================
  // bookSinglePosition
  // ===========================================================================

  describe("bookSinglePosition", () => {
    it("books a single position via bookGoodsReceipt", async () => {
      const prisma = createMockPrisma({
        whPurchaseOrderPosition: {
          findFirst: vi.fn().mockResolvedValue({
            ...mockPosition,
            purchaseOrder: { id: PO_ID, tenantId: TENANT_ID },
          }),
          findMany: vi.fn().mockResolvedValue([
            { ...mockPosition, receivedQuantity: 5, quantity: 20 },
          ]),
          update: vi.fn().mockResolvedValue({ ...mockPosition, receivedQuantity: 5 }),
        },
      })
      const result = await service.bookSinglePosition(
        prisma,
        TENANT_ID,
        { purchaseOrderPositionId: POSITION_ID, quantity: 5 },
        USER_ID,
        audit
      )
      expect(result.movements).toHaveLength(1)
    })

    it("validates tenant via PO parent", async () => {
      const prisma = createMockPrisma({
        whPurchaseOrderPosition: {
          findFirst: vi.fn().mockResolvedValue({
            ...mockPosition,
            purchaseOrder: { id: PO_ID, tenantId: OTHER_TENANT_ID },
          }),
          findMany: vi.fn().mockResolvedValue([]),
          update: vi.fn(),
        },
      })
      await expect(
        service.bookSinglePosition(
          prisma,
          TENANT_ID,
          { purchaseOrderPositionId: POSITION_ID, quantity: 5 },
          USER_ID
        )
      ).rejects.toThrow(service.WhStockMovementNotFoundError)
    })
  })

  // ===========================================================================
  // TENANT ISOLATION TESTS (MANDATORY)
  // ===========================================================================

  describe("tenant isolation", () => {
    it("listMovements returns empty for other tenant", async () => {
      const prisma = createMockPrisma({
        whStockMovement: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
      })
      const result = await service.listMovements(prisma, OTHER_TENANT_ID, { page: 1, pageSize: 25 })
      expect(result.items).toHaveLength(0)
      expect(result.total).toBe(0)
      expect((prisma.whStockMovement.findMany as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: OTHER_TENANT_ID }),
        })
      )
    })

    it("listByArticle rejects article from another tenant", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
      })
      await expect(
        service.listByArticle(prisma, OTHER_TENANT_ID, ARTICLE_ID)
      ).rejects.toThrow(service.WhStockMovementNotFoundError)
    })

    it("listPendingOrders returns empty for other tenant", async () => {
      const prisma = createMockPrisma({
        whPurchaseOrder: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          update: vi.fn(),
        },
      })
      const result = await service.listPendingOrders(prisma, OTHER_TENANT_ID)
      expect(result).toHaveLength(0)
      expect((prisma.whPurchaseOrder.findMany as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: OTHER_TENANT_ID }),
        })
      )
    })

    it("getOrderPositions rejects PO from another tenant", async () => {
      const prisma = createMockPrisma({
        whPurchaseOrder: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          update: vi.fn(),
        },
      })
      await expect(
        service.getOrderPositions(prisma, OTHER_TENANT_ID, PO_ID)
      ).rejects.toThrow(service.WhStockMovementNotFoundError)
    })

    it("bookGoodsReceipt rejects PO from another tenant", async () => {
      const prisma = createMockPrisma({
        whPurchaseOrder: {
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
      })
      await expect(
        service.bookGoodsReceipt(
          prisma,
          OTHER_TENANT_ID,
          {
            purchaseOrderId: PO_ID,
            positions: [{ positionId: POSITION_ID, quantity: 5 }],
          },
          USER_ID
        )
      ).rejects.toThrow(service.WhStockMovementNotFoundError)
    })

    it("bookSinglePosition rejects position from another tenant", async () => {
      const prisma = createMockPrisma({
        whPurchaseOrderPosition: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          update: vi.fn(),
        },
      })
      await expect(
        service.bookSinglePosition(
          prisma,
          OTHER_TENANT_ID,
          { purchaseOrderPositionId: POSITION_ID, quantity: 5 },
          USER_ID
        )
      ).rejects.toThrow(service.WhStockMovementNotFoundError)
    })
  })
})
