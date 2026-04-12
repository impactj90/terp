import { describe, it, expect, vi } from "vitest"
import * as service from "../wh-purchase-order-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Constants ---
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const OTHER_TENANT_ID = "ff000000-0000-4000-a000-000000000999"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const PO_ID = "b2000000-0000-4000-a000-000000000001"
const SUPPLIER_ID = "c1000000-0000-4000-a000-000000000001"
const CONTACT_ID = "c2000000-0000-4000-a000-000000000001"
const ARTICLE_ID = "b1000000-0000-4000-a000-000000000001"
const _ARTICLE_ID_2 = "b1000000-0000-4000-a000-000000000002"
const POSITION_ID = "d1000000-0000-4000-a000-000000000001"

// --- Mock Data ---

const mockSupplier = { id: SUPPLIER_ID, type: "SUPPLIER" }

const mockPurchaseOrder = {
  id: PO_ID,
  tenantId: TENANT_ID,
  number: "BE-1",
  supplierId: SUPPLIER_ID,
  contactId: null,
  inquiryId: null,
  status: "DRAFT",
  orderDate: null,
  requestedDelivery: null,
  confirmedDelivery: null,
  orderMethod: null,
  orderMethodNote: null,
  notes: null,
  subtotalNet: 0,
  totalGross: 0,
  printedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdById: USER_ID,
  supplier: { id: SUPPLIER_ID, number: "L-1", company: "Test Supplier" },
  contact: null,
  inquiry: null,
  positions: [],
}

const mockArticle = {
  id: ARTICLE_ID,
  tenantId: TENANT_ID,
  number: "ART-1",
  name: "Test Article",
  unit: "Stk",
  buyPrice: 50.0,
  stockTracking: true,
  currentStock: 3,
  minStock: 10,
}

const mockPosition = {
  id: POSITION_ID,
  purchaseOrderId: PO_ID,
  sortOrder: 0,
  articleId: ARTICLE_ID,
  supplierArticleNumber: null,
  description: null,
  quantity: 10,
  receivedQuantity: 0,
  unit: "Stk",
  unitPrice: 50.0,
  flatCosts: null,
  totalPrice: 500.0,
  requestedDelivery: null,
  confirmedDelivery: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  article: {
    id: ARTICLE_ID,
    number: "ART-1",
    name: "Test Article",
    unit: "Stk",
    buyPrice: 50.0,
  },
}

// --- Mock Prisma Factory ---

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    whPurchaseOrder: {
      findFirst: vi.fn().mockResolvedValue(mockPurchaseOrder),
      findMany: vi.fn().mockResolvedValue([mockPurchaseOrder]),
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn().mockResolvedValue(mockPurchaseOrder),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    whPurchaseOrderPosition: {
      findFirst: vi.fn().mockResolvedValue(mockPosition),
      findMany: vi.fn().mockResolvedValue([mockPosition]),
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn().mockResolvedValue(mockPosition),
      update: vi.fn().mockResolvedValue(mockPosition),
      delete: vi.fn().mockResolvedValue(mockPosition),
    },
    whArticle: {
      findFirst: vi.fn().mockResolvedValue(mockArticle),
      findMany: vi.fn().mockResolvedValue([mockArticle]),
    },
    whArticleSupplier: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    crmAddress: {
      findFirst: vi.fn().mockResolvedValue(mockSupplier),
    },
    crmContact: {
      findFirst: vi.fn().mockResolvedValue({ id: CONTACT_ID }),
    },
    numberSequence: {
      upsert: vi.fn().mockResolvedValue({
        tenantId: TENANT_ID,
        key: "purchase_order",
        prefix: "BE-",
        nextValue: 2,
      }),
    },
    auditLog: {
      create: vi.fn(),
    },
    ...overrides,
  } as unknown as PrismaClient
}

const audit = { userId: USER_ID, ipAddress: null, userAgent: null }

// --- Tests ---

describe("wh-purchase-order-service", () => {
  // ===========================================================================
  // CRUD Operations
  // ===========================================================================

  describe("create", () => {
    it("generates PO number via NumberSequence with key 'purchase_order'", async () => {
      const prisma = createMockPrisma()
      const result = await service.create(
        prisma,
        TENANT_ID,
        { supplierId: SUPPLIER_ID },
        USER_ID,
        audit
      )
      expect(result).toBeDefined()
      expect(prisma.numberSequence.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId_key: { tenantId: TENANT_ID, key: "purchase_order" },
          },
        })
      )
    })

    it("validates supplier is SUPPLIER or BOTH type", async () => {
      const prisma = createMockPrisma({
        crmAddress: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ id: SUPPLIER_ID, type: "CUSTOMER" }),
        },
      })
      await expect(
        service.create(
          prisma,
          TENANT_ID,
          { supplierId: SUPPLIER_ID },
          USER_ID
        )
      ).rejects.toThrow(service.WhPurchaseOrderValidationError)
    })

    it("rejects when supplier not found", async () => {
      const prisma = createMockPrisma({
        crmAddress: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      })
      await expect(
        service.create(
          prisma,
          TENANT_ID,
          { supplierId: SUPPLIER_ID },
          USER_ID
        )
      ).rejects.toThrow(service.WhPurchaseOrderValidationError)
    })

    it("sets status to DRAFT", async () => {
      const prisma = createMockPrisma()
      await service.create(
        prisma,
        TENANT_ID,
        { supplierId: SUPPLIER_ID },
        USER_ID
      )
      expect(prisma.whPurchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "DRAFT",
            number: "BE-1",
          }),
        })
      )
    })

    it("validates contactId belongs to the supplier", async () => {
      const prisma = createMockPrisma({
        crmContact: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      })
      await expect(
        service.create(
          prisma,
          TENANT_ID,
          { supplierId: SUPPLIER_ID, contactId: CONTACT_ID },
          USER_ID
        )
      ).rejects.toThrow(service.WhPurchaseOrderValidationError)
    })

    it("accepts supplier of type BOTH", async () => {
      const prisma = createMockPrisma({
        crmAddress: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ id: SUPPLIER_ID, type: "BOTH" }),
        },
      })
      const result = await service.create(
        prisma,
        TENANT_ID,
        { supplierId: SUPPLIER_ID },
        USER_ID
      )
      expect(result).toBeDefined()
    })
  })

  describe("getById", () => {
    it("returns PO with positions", async () => {
      const poWithPositions = {
        ...mockPurchaseOrder,
        positions: [mockPosition],
      }
      const prisma = createMockPrisma({
        whPurchaseOrder: {
          findFirst: vi.fn().mockResolvedValue(poWithPositions),
          findMany: vi.fn().mockResolvedValue([poWithPositions]),
          count: vi.fn().mockResolvedValue(1),
          create: vi.fn(),
          updateMany: vi.fn(),
          deleteMany: vi.fn(),
        },
      })
      const result = await service.getById(prisma, TENANT_ID, PO_ID)
      expect(result.positions).toHaveLength(1)
      expect(result.positions[0]!.articleId).toBe(ARTICLE_ID)
    })

    it("throws WhPurchaseOrderNotFoundError when not found", async () => {
      const prisma = createMockPrisma({
        whPurchaseOrder: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          updateMany: vi.fn(),
          deleteMany: vi.fn(),
        },
      })
      await expect(
        service.getById(prisma, TENANT_ID, PO_ID)
      ).rejects.toThrow(service.WhPurchaseOrderNotFoundError)
    })
  })

  describe("update", () => {
    it("updates allowed fields when DRAFT", async () => {
      const prisma = createMockPrisma()
      // tenantScopedUpdate uses updateMany then findFirst to refetch
      const updatedPO = { ...mockPurchaseOrder, notes: "Updated note" }
      ;(
        prisma.whPurchaseOrder.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(mockPurchaseOrder) // getById check
      ;(
        prisma.whPurchaseOrder.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(updatedPO) // refetch after updateMany

      const result = await service.update(prisma, TENANT_ID, {
        id: PO_ID,
        notes: "Updated note",
      })
      expect(result).toBeDefined()
      expect(prisma.whPurchaseOrder.updateMany).toHaveBeenCalled()
    })

    it("rejects update when not DRAFT", async () => {
      const orderedPO = { ...mockPurchaseOrder, status: "ORDERED" }
      const prisma = createMockPrisma({
        whPurchaseOrder: {
          findFirst: vi.fn().mockResolvedValue(orderedPO),
          findMany: vi.fn().mockResolvedValue([orderedPO]),
          count: vi.fn().mockResolvedValue(1),
          create: vi.fn(),
          updateMany: vi.fn(),
          deleteMany: vi.fn(),
        },
      })
      await expect(
        service.update(prisma, TENANT_ID, { id: PO_ID, notes: "No" })
      ).rejects.toThrow(service.WhPurchaseOrderValidationError)
    })

    it("validates new supplier when supplierId changed", async () => {
      const newSupplierId = "c1000000-0000-4000-a000-000000000099"
      const prisma = createMockPrisma({
        crmAddress: {
          findFirst: vi.fn().mockResolvedValue(null), // supplier not found
        },
      })
      await expect(
        service.update(prisma, TENANT_ID, {
          id: PO_ID,
          supplierId: newSupplierId,
        })
      ).rejects.toThrow(service.WhPurchaseOrderValidationError)
    })
  })

  describe("deleteOrder", () => {
    it("deletes DRAFT PO", async () => {
      const prisma = createMockPrisma()
      await service.deleteOrder(prisma, TENANT_ID, PO_ID, audit)
      expect(prisma.whPurchaseOrder.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: PO_ID, tenantId: TENANT_ID, status: "DRAFT" },
        })
      )
    })

    it("rejects when not DRAFT", async () => {
      const orderedPO = { ...mockPurchaseOrder, status: "ORDERED" }
      const prisma = createMockPrisma({
        whPurchaseOrder: {
          findFirst: vi.fn().mockResolvedValue(orderedPO),
          findMany: vi.fn().mockResolvedValue([orderedPO]),
          count: vi.fn().mockResolvedValue(1),
          create: vi.fn(),
          updateMany: vi.fn(),
          deleteMany: vi.fn(),
        },
      })
      await expect(
        service.deleteOrder(prisma, TENANT_ID, PO_ID)
      ).rejects.toThrow(service.WhPurchaseOrderValidationError)
    })

    it("throws NotFoundError when deleteMany returns count 0", async () => {
      const prisma = createMockPrisma({
        whPurchaseOrder: {
          findFirst: vi.fn().mockResolvedValue(mockPurchaseOrder),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          updateMany: vi.fn(),
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      })
      await expect(
        service.deleteOrder(prisma, TENANT_ID, PO_ID)
      ).rejects.toThrow(service.WhPurchaseOrderNotFoundError)
    })
  })

  // ===========================================================================
  // Status Workflow
  // ===========================================================================

  describe("sendOrder", () => {
    it("sets ORDERED status and orderDate", async () => {
      const poWithPositions = {
        ...mockPurchaseOrder,
        positions: [mockPosition],
      }
      const updatedPO = {
        ...poWithPositions,
        status: "ORDERED",
        orderDate: new Date(),
        orderMethod: "EMAIL",
      }
      const prisma = createMockPrisma({
        whPurchaseOrder: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce(poWithPositions) // getById
            .mockResolvedValueOnce(updatedPO), // refetch after update
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(1),
          create: vi.fn(),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          deleteMany: vi.fn(),
        },
      })
      const result = await service.sendOrder(prisma, TENANT_ID, PO_ID, {
        method: "EMAIL",
      })
      expect(result).toBeDefined()
      expect(prisma.whPurchaseOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "ORDERED",
            orderDate: expect.any(Date),
            orderMethod: "EMAIL",
          }),
        })
      )
    })

    it("records order method and note", async () => {
      const poWithPositions = {
        ...mockPurchaseOrder,
        positions: [mockPosition],
      }
      const updatedPO = {
        ...poWithPositions,
        status: "ORDERED",
        orderMethod: "PHONE",
        orderMethodNote: "Called Mr. Schmidt",
      }
      const prisma = createMockPrisma({
        whPurchaseOrder: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce(poWithPositions) // getById
            .mockResolvedValueOnce(updatedPO), // refetch
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(1),
          create: vi.fn(),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          deleteMany: vi.fn(),
        },
      })
      const result = await service.sendOrder(prisma, TENANT_ID, PO_ID, {
        method: "PHONE",
        methodNote: "Called Mr. Schmidt",
      })
      expect(result).toBeDefined()
      expect(prisma.whPurchaseOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderMethod: "PHONE",
            orderMethodNote: "Called Mr. Schmidt",
          }),
        })
      )
    })

    it("rejects if not DRAFT", async () => {
      const orderedPO = {
        ...mockPurchaseOrder,
        status: "ORDERED",
        positions: [mockPosition],
      }
      const prisma = createMockPrisma({
        whPurchaseOrder: {
          findFirst: vi.fn().mockResolvedValue(orderedPO),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(1),
          create: vi.fn(),
          updateMany: vi.fn(),
          deleteMany: vi.fn(),
        },
      })
      await expect(
        service.sendOrder(prisma, TENANT_ID, PO_ID, { method: "EMAIL" })
      ).rejects.toThrow(service.WhPurchaseOrderValidationError)
    })

    it("rejects if no positions", async () => {
      // Default mockPurchaseOrder has positions: []
      const prisma = createMockPrisma()
      await expect(
        service.sendOrder(prisma, TENANT_ID, PO_ID, { method: "EMAIL" })
      ).rejects.toThrow(service.WhPurchaseOrderValidationError)
    })
  })

  describe("cancel", () => {
    it("sets CANCELLED status", async () => {
      const cancelledPO = { ...mockPurchaseOrder, status: "CANCELLED" }
      const prisma = createMockPrisma({
        whPurchaseOrder: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce(mockPurchaseOrder) // getById
            .mockResolvedValueOnce(cancelledPO), // refetch after update
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(1),
          create: vi.fn(),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          deleteMany: vi.fn(),
        },
      })
      const result = await service.cancel(prisma, TENANT_ID, PO_ID)
      expect(result).toBeDefined()
      expect(prisma.whPurchaseOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "CANCELLED" }),
        })
      )
    })

    it("rejects cancel on RECEIVED order", async () => {
      const receivedPO = { ...mockPurchaseOrder, status: "RECEIVED" }
      const prisma = createMockPrisma({
        whPurchaseOrder: {
          findFirst: vi.fn().mockResolvedValue(receivedPO),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(1),
          create: vi.fn(),
          updateMany: vi.fn(),
          deleteMany: vi.fn(),
        },
      })
      await expect(
        service.cancel(prisma, TENANT_ID, PO_ID)
      ).rejects.toThrow(service.WhPurchaseOrderValidationError)
    })

    it("rejects cancel on already CANCELLED order", async () => {
      const cancelledPO = { ...mockPurchaseOrder, status: "CANCELLED" }
      const prisma = createMockPrisma({
        whPurchaseOrder: {
          findFirst: vi.fn().mockResolvedValue(cancelledPO),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(1),
          create: vi.fn(),
          updateMany: vi.fn(),
          deleteMany: vi.fn(),
        },
      })
      await expect(
        service.cancel(prisma, TENANT_ID, PO_ID)
      ).rejects.toThrow(service.WhPurchaseOrderValidationError)
    })
  })

  // ===========================================================================
  // Positions
  // ===========================================================================

  describe("addPosition", () => {
    it("auto-fills supplier article details when WhArticleSupplier link exists", async () => {
      const prisma = createMockPrisma({
        whArticleSupplier: {
          findFirst: vi.fn().mockResolvedValue({
            supplierArticleNumber: "SUP-ART-1",
            buyPrice: 45.0,
            orderUnit: "Pkg",
            defaultOrderQty: null,
          }),
        },
      })
      await service.addPosition(prisma, TENANT_ID, {
        purchaseOrderId: PO_ID,
        articleId: ARTICLE_ID,
        quantity: 10,
      })
      expect(prisma.whPurchaseOrderPosition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            supplierArticleNumber: "SUP-ART-1",
            unitPrice: 45.0,
            unit: "Pkg",
          }),
        })
      )
    })

    it("falls back to article buyPrice when no supplier link", async () => {
      const prisma = createMockPrisma({
        whArticleSupplier: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      })
      await service.addPosition(prisma, TENANT_ID, {
        purchaseOrderId: PO_ID,
        articleId: ARTICLE_ID,
        quantity: 10,
      })
      expect(prisma.whPurchaseOrderPosition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            unitPrice: 50.0, // article.buyPrice
            unit: "Stk", // article.unit
          }),
        })
      )
    })

    it("calculates totalPrice = (quantity * unitPrice) + flatCosts", async () => {
      const prisma = createMockPrisma()
      await service.addPosition(prisma, TENANT_ID, {
        purchaseOrderId: PO_ID,
        articleId: ARTICLE_ID,
        quantity: 10,
        unitPrice: 50,
        flatCosts: 25,
      })
      expect(prisma.whPurchaseOrderPosition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalPrice: 525, // (10 * 50) + 25
          }),
        })
      )
    })

    it("recalculates order totals after adding position", async () => {
      const prisma = createMockPrisma()
      await service.addPosition(prisma, TENANT_ID, {
        purchaseOrderId: PO_ID,
        articleId: ARTICLE_ID,
        quantity: 10,
      })
      // recalculateTotals calls whPurchaseOrderPosition.findMany then whPurchaseOrder.updateMany
      expect(prisma.whPurchaseOrderPosition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { purchaseOrderId: PO_ID },
        })
      )
      expect(prisma.whPurchaseOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: PO_ID, tenantId: TENANT_ID },
          data: expect.objectContaining({
            subtotalNet: expect.any(Number),
            totalGross: expect.any(Number),
          }),
        })
      )
    })

    it("rejects if PO is ORDERED", async () => {
      const orderedPO = {
        ...mockPurchaseOrder,
        status: "ORDERED",
        positions: [mockPosition],
      }
      const prisma = createMockPrisma({
        whPurchaseOrder: {
          findFirst: vi.fn().mockResolvedValue(orderedPO),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(1),
          create: vi.fn(),
          updateMany: vi.fn(),
          deleteMany: vi.fn(),
        },
      })
      await expect(
        service.addPosition(prisma, TENANT_ID, {
          purchaseOrderId: PO_ID,
          articleId: ARTICLE_ID,
          quantity: 10,
        })
      ).rejects.toThrow(service.WhPurchaseOrderValidationError)
    })

    it("rejects if article not found", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
        },
      })
      await expect(
        service.addPosition(prisma, TENANT_ID, {
          purchaseOrderId: PO_ID,
          articleId: ARTICLE_ID,
          quantity: 10,
        })
      ).rejects.toThrow(service.WhPurchaseOrderValidationError)
    })

    it("uses explicit unitPrice over supplier/article defaults", async () => {
      const prisma = createMockPrisma({
        whArticleSupplier: {
          findFirst: vi.fn().mockResolvedValue({
            supplierArticleNumber: "SUP-ART-1",
            buyPrice: 45.0,
            orderUnit: "Pkg",
            defaultOrderQty: null,
          }),
        },
      })
      await service.addPosition(prisma, TENANT_ID, {
        purchaseOrderId: PO_ID,
        articleId: ARTICLE_ID,
        quantity: 5,
        unitPrice: 99.0,
        unit: "Box",
      })
      expect(prisma.whPurchaseOrderPosition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            unitPrice: 99.0,
            unit: "Box",
          }),
        })
      )
    })

    it("addPosition FREETEXT — creates position without articleId", async () => {
      const freetextPosition = {
        ...mockPosition,
        positionType: "FREETEXT",
        articleId: null,
        freeText: "Custom gasket",
        quantity: 5,
        unitPrice: 12.5,
        totalPrice: 62.5,
        article: null,
      }
      const prisma = createMockPrisma({
        whPurchaseOrderPosition: {
          findFirst: vi.fn().mockResolvedValue(mockPosition),
          findMany: vi.fn().mockResolvedValue([freetextPosition]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(freetextPosition),
          update: vi.fn(),
          delete: vi.fn(),
        },
      })
      await service.addPosition(prisma, TENANT_ID, {
        purchaseOrderId: PO_ID,
        positionType: "FREETEXT",
        freeText: "Custom gasket",
        quantity: 5,
        unitPrice: 12.5,
        vatRate: 19,
      })
      expect(prisma.whPurchaseOrderPosition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            positionType: "FREETEXT",
            articleId: null,
            freeText: "Custom gasket",
            totalPrice: 62.5,
          }),
        })
      )
      // Article lookup should NOT be called
      expect(prisma.whArticle.findFirst).not.toHaveBeenCalled()
    })

    it("addPosition FREETEXT — rejects without freeText", async () => {
      const prisma = createMockPrisma()
      await expect(
        service.addPosition(prisma, TENANT_ID, {
          purchaseOrderId: PO_ID,
          positionType: "FREETEXT",
          quantity: 5,
          unitPrice: 12.5,
        })
      ).rejects.toThrow(service.WhPurchaseOrderValidationError)
    })

    it("addPosition FREETEXT — rejects without unitPrice", async () => {
      const prisma = createMockPrisma()
      await expect(
        service.addPosition(prisma, TENANT_ID, {
          purchaseOrderId: PO_ID,
          positionType: "FREETEXT",
          freeText: "Something",
          quantity: 5,
        })
      ).rejects.toThrow(service.WhPurchaseOrderValidationError)
    })

    it("addPosition FREETEXT — rejects without quantity", async () => {
      const prisma = createMockPrisma()
      await expect(
        service.addPosition(prisma, TENANT_ID, {
          purchaseOrderId: PO_ID,
          positionType: "FREETEXT",
          freeText: "Something",
          unitPrice: 10,
        })
      ).rejects.toThrow(service.WhPurchaseOrderValidationError)
    })

    it("addPosition TEXT — creates position without price/quantity", async () => {
      const textPosition = {
        ...mockPosition,
        positionType: "TEXT",
        articleId: null,
        freeText: "Garantiebedingungen: 2 Jahre",
        quantity: null,
        unitPrice: null,
        totalPrice: null,
        flatCosts: null,
        article: null,
      }
      const prisma = createMockPrisma({
        whPurchaseOrderPosition: {
          findFirst: vi.fn().mockResolvedValue(mockPosition),
          findMany: vi.fn().mockResolvedValue([textPosition]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(textPosition),
          update: vi.fn(),
          delete: vi.fn(),
        },
      })
      await service.addPosition(prisma, TENANT_ID, {
        purchaseOrderId: PO_ID,
        positionType: "TEXT",
        freeText: "Garantiebedingungen: 2 Jahre",
      })
      expect(prisma.whPurchaseOrderPosition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            positionType: "TEXT",
            quantity: null,
            unitPrice: null,
            totalPrice: null,
            freeText: "Garantiebedingungen: 2 Jahre",
          }),
        })
      )
    })

    it("addPosition TEXT — rejects without freeText", async () => {
      const prisma = createMockPrisma()
      await expect(
        service.addPosition(prisma, TENANT_ID, {
          purchaseOrderId: PO_ID,
          positionType: "TEXT",
        })
      ).rejects.toThrow(service.WhPurchaseOrderValidationError)
    })

    it("addPosition TEXT — excluded from totals (totalPrice is null)", async () => {
      const articlePosition = {
        ...mockPosition,
        positionType: "ARTICLE",
        totalPrice: 100,
        vatRate: 19,
      }
      const textPosition = {
        ...mockPosition,
        id: "d1000000-0000-4000-a000-000000000099",
        positionType: "TEXT",
        totalPrice: null,
        vatRate: 19,
      }
      const prisma = createMockPrisma({
        whPurchaseOrderPosition: {
          findFirst: vi.fn().mockResolvedValue(mockPosition),
          findMany: vi.fn().mockResolvedValue([articlePosition, textPosition]),
          count: vi.fn().mockResolvedValue(1),
          create: vi.fn().mockResolvedValue(textPosition),
          update: vi.fn(),
          delete: vi.fn(),
        },
      })
      await service.addPosition(prisma, TENANT_ID, {
        purchaseOrderId: PO_ID,
        positionType: "TEXT",
        freeText: "Note text",
      })
      // recalculateTotals should only use positions with totalPrice != null
      expect(prisma.whPurchaseOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subtotalNet: 100, // Only the ARTICLE position's totalPrice
          }),
        })
      )
    })

    it("addPosition ARTICLE — still requires articleId", async () => {
      const prisma = createMockPrisma()
      await expect(
        service.addPosition(prisma, TENANT_ID, {
          purchaseOrderId: PO_ID,
          positionType: "ARTICLE",
          quantity: 5,
        })
      ).rejects.toThrow(service.WhPurchaseOrderValidationError)
    })
  })

  describe("updatePosition", () => {
    it("updates position and recalculates totals", async () => {
      const positionWithOrder = {
        ...mockPosition,
        purchaseOrder: {
          id: PO_ID,
          tenantId: TENANT_ID,
          status: "DRAFT",
        },
      }
      const updatedPosition = { ...mockPosition, quantity: 20, totalPrice: 1000 }
      const prisma = createMockPrisma({
        whPurchaseOrderPosition: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce(positionWithOrder) // verify position
            .mockResolvedValueOnce(positionWithOrder), // repo.updatePosition verify
          findMany: vi.fn().mockResolvedValue([updatedPosition]),
          count: vi.fn().mockResolvedValue(1),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue(updatedPosition),
          delete: vi.fn(),
        },
      })
      const result = await service.updatePosition(prisma, TENANT_ID, {
        id: POSITION_ID,
        quantity: 20,
      })
      expect(result).toBeDefined()
      // Verify recalculateTotals called
      expect(prisma.whPurchaseOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: PO_ID, tenantId: TENANT_ID },
          data: expect.objectContaining({
            subtotalNet: expect.any(Number),
          }),
        })
      )
    })

    it("rejects if PO is not DRAFT", async () => {
      const positionWithOrderedPO = {
        ...mockPosition,
        purchaseOrder: {
          id: PO_ID,
          tenantId: TENANT_ID,
          status: "ORDERED",
        },
      }
      const prisma = createMockPrisma({
        whPurchaseOrderPosition: {
          findFirst: vi.fn().mockResolvedValue(positionWithOrderedPO),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(1),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        },
      })
      await expect(
        service.updatePosition(prisma, TENANT_ID, {
          id: POSITION_ID,
          quantity: 5,
        })
      ).rejects.toThrow(service.WhPurchaseOrderValidationError)
    })

    it("throws NotFoundError when position not found", async () => {
      const prisma = createMockPrisma({
        whPurchaseOrderPosition: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        },
      })
      await expect(
        service.updatePosition(prisma, TENANT_ID, {
          id: POSITION_ID,
          quantity: 5,
        })
      ).rejects.toThrow(service.WhPurchaseOrderNotFoundError)
    })

    it("updates freeText on FREETEXT position", async () => {
      const freetextPositionWithOrder = {
        ...mockPosition,
        positionType: "FREETEXT",
        freeText: "Old text",
        articleId: null,
        purchaseOrder: {
          id: PO_ID,
          tenantId: TENANT_ID,
          status: "DRAFT",
        },
      }
      const updatedPosition = { ...freetextPositionWithOrder, freeText: "Updated text" }
      const prisma = createMockPrisma({
        whPurchaseOrderPosition: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce(freetextPositionWithOrder) // verify position
            .mockResolvedValueOnce(freetextPositionWithOrder), // repo.updatePosition verify
          findMany: vi.fn().mockResolvedValue([updatedPosition]),
          count: vi.fn().mockResolvedValue(1),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue(updatedPosition),
          delete: vi.fn(),
        },
      })
      const result = await service.updatePosition(prisma, TENANT_ID, {
        id: POSITION_ID,
        freeText: "Updated text",
      })
      expect(result).toBeDefined()
      expect(prisma.whPurchaseOrderPosition.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            freeText: "Updated text",
          }),
        })
      )
    })

    it("TEXT position keeps totalPrice null on update", async () => {
      const textPositionWithOrder = {
        ...mockPosition,
        positionType: "TEXT",
        freeText: "Old text",
        articleId: null,
        quantity: null,
        unitPrice: null,
        totalPrice: null,
        purchaseOrder: {
          id: PO_ID,
          tenantId: TENANT_ID,
          status: "DRAFT",
        },
      }
      const updatedPosition = { ...textPositionWithOrder, freeText: "New text" }
      const prisma = createMockPrisma({
        whPurchaseOrderPosition: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce(textPositionWithOrder) // verify position
            .mockResolvedValueOnce(textPositionWithOrder), // repo.updatePosition verify
          findMany: vi.fn().mockResolvedValue([updatedPosition]),
          count: vi.fn().mockResolvedValue(1),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue(updatedPosition),
          delete: vi.fn(),
        },
      })
      const result = await service.updatePosition(prisma, TENANT_ID, {
        id: POSITION_ID,
        freeText: "New text",
      })
      expect(result).toBeDefined()
      expect(prisma.whPurchaseOrderPosition.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalPrice: null,
          }),
        })
      )
    })
  })

  describe("deletePosition", () => {
    it("removes position and recalculates totals", async () => {
      const positionWithOrder = {
        ...mockPosition,
        purchaseOrder: {
          id: PO_ID,
          tenantId: TENANT_ID,
          status: "DRAFT",
        },
      }
      const prisma = createMockPrisma({
        whPurchaseOrderPosition: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce(positionWithOrder) // verify position
            .mockResolvedValueOnce(positionWithOrder), // repo.deletePosition verify
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn().mockResolvedValue(positionWithOrder),
        },
      })
      await service.deletePosition(prisma, TENANT_ID, POSITION_ID)
      expect(prisma.whPurchaseOrderPosition.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: POSITION_ID },
        })
      )
      // Verify recalculateTotals called
      expect(prisma.whPurchaseOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: PO_ID, tenantId: TENANT_ID },
        })
      )
    })

    it("rejects if PO is not DRAFT", async () => {
      const positionWithOrderedPO = {
        ...mockPosition,
        purchaseOrder: {
          id: PO_ID,
          tenantId: TENANT_ID,
          status: "ORDERED",
        },
      }
      const prisma = createMockPrisma({
        whPurchaseOrderPosition: {
          findFirst: vi.fn().mockResolvedValue(positionWithOrderedPO),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        },
      })
      await expect(
        service.deletePosition(prisma, TENANT_ID, POSITION_ID)
      ).rejects.toThrow(service.WhPurchaseOrderValidationError)
    })

    it("throws NotFoundError when position not found", async () => {
      const prisma = createMockPrisma({
        whPurchaseOrderPosition: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        },
      })
      await expect(
        service.deletePosition(prisma, TENANT_ID, POSITION_ID)
      ).rejects.toThrow(service.WhPurchaseOrderNotFoundError)
    })
  })

  // ===========================================================================
  // Reorder Suggestions
  // ===========================================================================

  describe("reorderSuggestions", () => {
    it("returns articles below minimum stock", async () => {
      const belowMinArticle = {
        ...mockArticle,
        currentStock: 3,
        minStock: 10,
        suppliers: [
          {
            supplierId: SUPPLIER_ID,
            supplierArticleNumber: "SUP-1",
            buyPrice: 45.0,
            defaultOrderQty: 0,
            supplier: {
              id: SUPPLIER_ID,
              number: "L-1",
              company: "Test Supplier",
            },
          },
        ],
      }
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(mockArticle),
          findMany: vi.fn().mockResolvedValue([belowMinArticle]),
        },
      })
      const result = await service.getReorderSuggestions(prisma, TENANT_ID)
      expect(result).toHaveLength(1)
      expect(result[0]!.deficit).toBe(7) // 10 - 3
      expect(result[0]!.articleId).toBe(ARTICLE_ID)
    })

    it("calculates suggestedQty as max(deficit, defaultOrderQty)", async () => {
      const belowMinArticle = {
        ...mockArticle,
        currentStock: 3,
        minStock: 10,
        suppliers: [
          {
            supplierId: SUPPLIER_ID,
            supplierArticleNumber: "SUP-1",
            buyPrice: 45.0,
            defaultOrderQty: 20,
            supplier: {
              id: SUPPLIER_ID,
              number: "L-1",
              company: "Test Supplier",
            },
          },
        ],
      }
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(mockArticle),
          findMany: vi.fn().mockResolvedValue([belowMinArticle]),
        },
      })
      const result = await service.getReorderSuggestions(prisma, TENANT_ID)
      // deficit=7, defaultOrderQty=20 => max(7, 20) = 20
      expect(result[0]!.suggestedQty).toBe(20)
    })

    it("filters by supplier", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(mockArticle),
          findMany: vi.fn().mockResolvedValue([]),
        },
      })
      const result = await service.getReorderSuggestions(
        prisma,
        TENANT_ID,
        SUPPLIER_ID
      )
      expect(result).toEqual([])
      expect(prisma.whArticle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            stockTracking: true,
            suppliers: { some: { supplierId: SUPPLIER_ID } },
          }),
        })
      )
    })

    it("returns empty array when no articles below min stock", async () => {
      const aboveMinArticle = {
        ...mockArticle,
        currentStock: 20,
        minStock: 10,
        suppliers: [],
      }
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(mockArticle),
          // findArticlesBelowMinStock filters in-memory: currentStock < minStock
          // 20 < 10 => false, so filtered out
          findMany: vi.fn().mockResolvedValue([aboveMinArticle]),
        },
      })
      const result = await service.getReorderSuggestions(prisma, TENANT_ID)
      expect(result).toEqual([])
    })
  })

  describe("createFromSuggestions", () => {
    it("creates PO with positions for all specified articles", async () => {
      const createdPO = { ...mockPurchaseOrder, id: "new-po-id" }
      const poWithPositions = {
        ...createdPO,
        positions: [mockPosition],
      }
      const articleForSuggestion = {
        ...mockArticle,
        currentStock: 3,
        minStock: 10,
      }
      const prisma = createMockPrisma({
        whPurchaseOrder: {
          findFirst: vi
            .fn()
            .mockResolvedValue(poWithPositions),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(1),
          create: vi.fn().mockResolvedValue(createdPO),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          deleteMany: vi.fn(),
        },
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(articleForSuggestion),
          findMany: vi.fn().mockResolvedValue([]),
        },
      })
      const result = await service.createFromSuggestions(
        prisma,
        TENANT_ID,
        { supplierId: SUPPLIER_ID, articleIds: [ARTICLE_ID] },
        USER_ID
      )
      expect(result).toBeDefined()
      // Verify PO was created
      expect(prisma.whPurchaseOrder.create).toHaveBeenCalled()
      // Verify position was added (article deficit = 7)
      expect(prisma.whPurchaseOrderPosition.create).toHaveBeenCalled()
    })

    it("validates supplier before creating", async () => {
      const prisma = createMockPrisma({
        crmAddress: {
          findFirst: vi.fn().mockResolvedValue(null), // supplier not found
        },
      })
      await expect(
        service.createFromSuggestions(
          prisma,
          TENANT_ID,
          { supplierId: SUPPLIER_ID, articleIds: [ARTICLE_ID] },
          USER_ID
        )
      ).rejects.toThrow(service.WhPurchaseOrderValidationError)
    })

    it("skips articles with suggestedQty <= 0", async () => {
      const createdPO = { ...mockPurchaseOrder, id: "new-po-id" }
      const poWithNoPositions = { ...createdPO, positions: [] }
      const articleAboveMin = {
        ...mockArticle,
        currentStock: 20,
        minStock: 10, // deficit = -10 => suggestedQty = max(-10, 0) = 0
      }
      const prisma = createMockPrisma({
        whPurchaseOrder: {
          findFirst: vi.fn().mockResolvedValue(poWithNoPositions),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(1),
          create: vi.fn().mockResolvedValue(createdPO),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          deleteMany: vi.fn(),
        },
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(articleAboveMin),
          findMany: vi.fn().mockResolvedValue([]),
        },
        whArticleSupplier: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      })
      await service.createFromSuggestions(
        prisma,
        TENANT_ID,
        { supplierId: SUPPLIER_ID, articleIds: [ARTICLE_ID] },
        USER_ID
      )
      // Position should not be created since suggestedQty = 0
      expect(prisma.whPurchaseOrderPosition.create).not.toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // List
  // ===========================================================================

  describe("list", () => {
    it("delegates to repository with filters", async () => {
      const prisma = createMockPrisma()
      const result = await service.list(prisma, TENANT_ID, {
        page: 1,
        pageSize: 25,
      })
      expect(result).toHaveProperty("items")
      expect(result).toHaveProperty("total")
    })
  })

  // ===========================================================================
  // TENANT ISOLATION TESTS
  // ===========================================================================

  describe("tenant isolation", () => {
    function createNullPOPrisma() {
      return createMockPrisma({
        whPurchaseOrder: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          updateMany: vi.fn(),
          deleteMany: vi.fn(),
        },
      })
    }

    function createNullPositionPrisma() {
      return createMockPrisma({
        whPurchaseOrderPosition: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        },
      })
    }

    it("getById rejects PO from another tenant", async () => {
      const prisma = createNullPOPrisma()
      await expect(
        service.getById(prisma, OTHER_TENANT_ID, PO_ID)
      ).rejects.toThrow(service.WhPurchaseOrderNotFoundError)
    })

    it("list scopes to tenant (returns empty for other tenant)", async () => {
      const prisma = createNullPOPrisma()
      const result = await service.list(prisma, OTHER_TENANT_ID, {
        page: 1,
        pageSize: 25,
      })
      expect(result.items).toEqual([])
      expect(result.total).toBe(0)
    })

    it("update rejects PO from another tenant", async () => {
      const prisma = createNullPOPrisma()
      await expect(
        service.update(prisma, OTHER_TENANT_ID, {
          id: PO_ID,
          notes: "Hacked",
        })
      ).rejects.toThrow(service.WhPurchaseOrderNotFoundError)
    })

    it("deleteOrder rejects PO from another tenant", async () => {
      const prisma = createNullPOPrisma()
      await expect(
        service.deleteOrder(prisma, OTHER_TENANT_ID, PO_ID)
      ).rejects.toThrow(service.WhPurchaseOrderNotFoundError)
    })

    it("sendOrder rejects PO from another tenant", async () => {
      const prisma = createNullPOPrisma()
      await expect(
        service.sendOrder(prisma, OTHER_TENANT_ID, PO_ID, {
          method: "EMAIL",
        })
      ).rejects.toThrow(service.WhPurchaseOrderNotFoundError)
    })

    it("cancel rejects PO from another tenant", async () => {
      const prisma = createNullPOPrisma()
      await expect(
        service.cancel(prisma, OTHER_TENANT_ID, PO_ID)
      ).rejects.toThrow(service.WhPurchaseOrderNotFoundError)
    })

    it("addPosition rejects when PO belongs to another tenant", async () => {
      const prisma = createNullPOPrisma()
      await expect(
        service.addPosition(prisma, OTHER_TENANT_ID, {
          purchaseOrderId: PO_ID,
          articleId: ARTICLE_ID,
          quantity: 10,
        })
      ).rejects.toThrow(service.WhPurchaseOrderNotFoundError)
    })

    it("updatePosition rejects position from another tenant's PO", async () => {
      const prisma = createNullPositionPrisma()
      await expect(
        service.updatePosition(prisma, OTHER_TENANT_ID, {
          id: POSITION_ID,
          quantity: 5,
        })
      ).rejects.toThrow(service.WhPurchaseOrderNotFoundError)
    })

    it("deletePosition rejects position from another tenant's PO", async () => {
      const prisma = createNullPositionPrisma()
      await expect(
        service.deletePosition(prisma, OTHER_TENANT_ID, POSITION_ID)
      ).rejects.toThrow(service.WhPurchaseOrderNotFoundError)
    })

    it("listPositions rejects when PO belongs to another tenant", async () => {
      const prisma = createNullPOPrisma()
      await expect(
        service.listPositions(prisma, OTHER_TENANT_ID, PO_ID)
      ).rejects.toThrow(service.WhPurchaseOrderNotFoundError)
    })
  })
})
