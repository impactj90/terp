import { describe, it, expect, vi } from "vitest"
import * as service from "../wh-withdrawal-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Constants ---
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const OTHER_TENANT_ID = "ff000000-0000-4000-a000-000000000999"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ARTICLE_ID = "b1000000-0000-4000-a000-000000000001"
const ARTICLE_ID_2 = "b1000000-0000-4000-a000-000000000002"
const MOVEMENT_ID = "e1000000-0000-4000-a000-000000000001"
const ORDER_ID = "c1000000-0000-4000-a000-000000000001"
const DOCUMENT_ID = "d1000000-0000-4000-a000-000000000001"

// --- Mock Data ---

const mockArticle = {
  id: ARTICLE_ID,
  tenantId: TENANT_ID,
  number: "ART-1",
  name: "Test Article",
  currentStock: 50,
  stockTracking: true,
  unit: "Stk",
  minStock: 5,
}

const mockArticle2 = {
  ...mockArticle,
  id: ARTICLE_ID_2,
  number: "ART-2",
  name: "Test Article 2",
  currentStock: 20,
}

const mockWithdrawalMovement = {
  id: MOVEMENT_ID,
  tenantId: TENANT_ID,
  articleId: ARTICLE_ID,
  type: "WITHDRAWAL",
  quantity: -5,
  previousStock: 50,
  newStock: 45,
  date: new Date(),
  purchaseOrderId: null,
  purchaseOrderPositionId: null,
  documentId: null,
  orderId: null,
  inventorySessionId: null,
  machineId: null,
  reason: null,
  notes: null,
  createdById: USER_ID,
  createdAt: new Date(),
  article: { id: ARTICLE_ID, number: "ART-1", name: "Test Article", unit: "Stk" },
}

// --- Mock Prisma Factory ---

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  const prisma = {
    whStockMovement: {
      findFirst: vi.fn().mockResolvedValue(mockWithdrawalMovement),
      findMany: vi.fn().mockResolvedValue([mockWithdrawalMovement]),
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn().mockResolvedValue(mockWithdrawalMovement),
    },
    whArticle: {
      findFirst: vi.fn().mockResolvedValue(mockArticle),
      update: vi.fn().mockResolvedValue({ ...mockArticle, currentStock: 45 }),
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

describe("wh-withdrawal-service", () => {
  // ===========================================================================
  // createWithdrawal
  // ===========================================================================

  describe("createWithdrawal", () => {
    it("creates movement with negative quantity", async () => {
      const prisma = createMockPrisma()
      const result = await service.createWithdrawal(
        prisma,
        TENANT_ID,
        {
          articleId: ARTICLE_ID,
          quantity: 5,
          referenceType: "NONE",
        },
        USER_ID,
        audit
      )
      expect(result).toBeDefined()
      expect((prisma.whStockMovement.create as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "WITHDRAWAL",
            quantity: -5,
            previousStock: 50,
            newStock: 45,
            tenantId: TENANT_ID,
            articleId: ARTICLE_ID,
          }),
        })
      )
    })

    it("updates article currentStock", async () => {
      const prisma = createMockPrisma()
      await service.createWithdrawal(
        prisma,
        TENANT_ID,
        {
          articleId: ARTICLE_ID,
          quantity: 5,
          referenceType: "NONE",
        },
        USER_ID
      )
      expect((prisma.whArticle.update as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ARTICLE_ID },
          data: { currentStock: 45 },
        })
      )
    })

    it("sets orderId when referenceType=ORDER", async () => {
      const prisma = createMockPrisma()
      await service.createWithdrawal(
        prisma,
        TENANT_ID,
        {
          articleId: ARTICLE_ID,
          quantity: 5,
          referenceType: "ORDER",
          referenceId: ORDER_ID,
        },
        USER_ID
      )
      expect((prisma.whStockMovement.create as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderId: ORDER_ID,
            documentId: null,
            machineId: null,
          }),
        })
      )
    })

    it("sets documentId when referenceType=DOCUMENT", async () => {
      const prisma = createMockPrisma()
      await service.createWithdrawal(
        prisma,
        TENANT_ID,
        {
          articleId: ARTICLE_ID,
          quantity: 5,
          referenceType: "DOCUMENT",
          referenceId: DOCUMENT_ID,
        },
        USER_ID
      )
      expect((prisma.whStockMovement.create as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderId: null,
            documentId: DOCUMENT_ID,
            machineId: null,
          }),
        })
      )
    })

    it("sets machineId when referenceType=MACHINE", async () => {
      const prisma = createMockPrisma()
      await service.createWithdrawal(
        prisma,
        TENANT_ID,
        {
          articleId: ARTICLE_ID,
          quantity: 5,
          referenceType: "MACHINE",
          machineId: "M-001",
        },
        USER_ID
      )
      expect((prisma.whStockMovement.create as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderId: null,
            documentId: null,
            machineId: "M-001",
          }),
        })
      )
    })

    it("sets no reference when referenceType=NONE", async () => {
      const prisma = createMockPrisma()
      await service.createWithdrawal(
        prisma,
        TENANT_ID,
        {
          articleId: ARTICLE_ID,
          quantity: 5,
          referenceType: "NONE",
        },
        USER_ID
      )
      expect((prisma.whStockMovement.create as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderId: null,
            documentId: null,
            machineId: null,
          }),
        })
      )
    })

    it("rejects if article not found", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
      })
      await expect(
        service.createWithdrawal(
          prisma,
          TENANT_ID,
          { articleId: ARTICLE_ID, quantity: 5, referenceType: "NONE" },
          USER_ID
        )
      ).rejects.toThrow(service.WhWithdrawalNotFoundError)
    })

    it("rejects if stock tracking disabled", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue({ ...mockArticle, stockTracking: false }),
          update: vi.fn(),
        },
      })
      await expect(
        service.createWithdrawal(
          prisma,
          TENANT_ID,
          { articleId: ARTICLE_ID, quantity: 5, referenceType: "NONE" },
          USER_ID
        )
      ).rejects.toThrow(service.WhWithdrawalValidationError)
    })

    it("rejects if insufficient stock", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue({ ...mockArticle, currentStock: 3 }),
          update: vi.fn(),
        },
      })
      await expect(
        service.createWithdrawal(
          prisma,
          TENANT_ID,
          { articleId: ARTICLE_ID, quantity: 5, referenceType: "NONE" },
          USER_ID
        )
      ).rejects.toThrow(service.WhWithdrawalValidationError)
    })
  })

  // ===========================================================================
  // createBatchWithdrawal
  // ===========================================================================

  describe("createBatchWithdrawal", () => {
    it("processes multiple articles in one transaction", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn()
            .mockResolvedValueOnce(mockArticle)
            .mockResolvedValueOnce(mockArticle2),
          update: vi.fn().mockResolvedValue({}),
        },
        whStockMovement: {
          create: vi.fn()
            .mockResolvedValueOnce({ ...mockWithdrawalMovement, articleId: ARTICLE_ID })
            .mockResolvedValueOnce({ ...mockWithdrawalMovement, id: "mov-2", articleId: ARTICLE_ID_2 }),
        },
      })
      const result = await service.createBatchWithdrawal(
        prisma,
        TENANT_ID,
        {
          referenceType: "NONE",
          items: [
            { articleId: ARTICLE_ID, quantity: 3 },
            { articleId: ARTICLE_ID_2, quantity: 2 },
          ],
        },
        USER_ID,
        audit
      )
      expect(result).toHaveLength(2)
      expect((prisma.whStockMovement.create as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2)
      expect((prisma.whArticle.update as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2)
    })

    it("rolls back all if any article fails", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn()
            .mockResolvedValueOnce(mockArticle)
            .mockResolvedValueOnce(null), // Second article not found
          update: vi.fn(),
        },
      })
      await expect(
        service.createBatchWithdrawal(
          prisma,
          TENANT_ID,
          {
            referenceType: "NONE",
            items: [
              { articleId: ARTICLE_ID, quantity: 3 },
              { articleId: ARTICLE_ID_2, quantity: 2 },
            ],
          },
          USER_ID
        )
      ).rejects.toThrow(service.WhWithdrawalNotFoundError)
    })

    it("returns array of created movements", async () => {
      const prisma = createMockPrisma()
      const result = await service.createBatchWithdrawal(
        prisma,
        TENANT_ID,
        {
          referenceType: "ORDER",
          referenceId: ORDER_ID,
          items: [{ articleId: ARTICLE_ID, quantity: 3 }],
        },
        USER_ID
      )
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(1)
    })
  })

  // ===========================================================================
  // cancelWithdrawal
  // ===========================================================================

  describe("cancelWithdrawal", () => {
    it("creates positive reversal movement", async () => {
      const prisma = createMockPrisma()
      await service.cancelWithdrawal(prisma, TENANT_ID, MOVEMENT_ID, USER_ID, audit)
      expect((prisma.whStockMovement.create as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "WITHDRAWAL",
            quantity: 5, // Positive (reversal of -5)
          }),
        })
      )
    })

    it("restores article stock", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue({ ...mockArticle, currentStock: 45 }),
          update: vi.fn().mockResolvedValue({}),
        },
      })
      await service.cancelWithdrawal(prisma, TENANT_ID, MOVEMENT_ID, USER_ID)
      expect((prisma.whArticle.update as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ARTICLE_ID },
          data: { currentStock: 50 }, // 45 + 5 = 50 (restored)
        })
      )
    })

    it("copies reference fields from original movement", async () => {
      const movementWithRefs = {
        ...mockWithdrawalMovement,
        orderId: ORDER_ID,
        documentId: null,
        machineId: "M-001",
      }
      const prisma = createMockPrisma({
        whStockMovement: {
          findFirst: vi.fn().mockResolvedValue(movementWithRefs),
          create: vi.fn().mockResolvedValue(movementWithRefs),
        },
      })
      await service.cancelWithdrawal(prisma, TENANT_ID, MOVEMENT_ID, USER_ID)
      expect((prisma.whStockMovement.create as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderId: ORDER_ID,
            documentId: null,
            machineId: "M-001",
          }),
        })
      )
    })

    it("sets reason to Storno message", async () => {
      const prisma = createMockPrisma()
      await service.cancelWithdrawal(prisma, TENANT_ID, MOVEMENT_ID, USER_ID)
      expect((prisma.whStockMovement.create as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reason: `Storno of movement ${MOVEMENT_ID}`,
          }),
        })
      )
    })

    it("rejects if movement not found", async () => {
      const prisma = createMockPrisma({
        whStockMovement: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn(),
        },
      })
      await expect(
        service.cancelWithdrawal(prisma, TENANT_ID, MOVEMENT_ID, USER_ID)
      ).rejects.toThrow(service.WhWithdrawalNotFoundError)
    })

    it("rejects if movement is not WITHDRAWAL type", async () => {
      const prisma = createMockPrisma({
        whStockMovement: {
          findFirst: vi.fn().mockResolvedValue({
            ...mockWithdrawalMovement,
            type: "GOODS_RECEIPT",
          }),
          create: vi.fn(),
        },
      })
      await expect(
        service.cancelWithdrawal(prisma, TENANT_ID, MOVEMENT_ID, USER_ID)
      ).rejects.toThrow(service.WhWithdrawalValidationError)
    })

    it("rejects if movement is already a reversal (positive quantity)", async () => {
      const prisma = createMockPrisma({
        whStockMovement: {
          findFirst: vi.fn().mockResolvedValue({
            ...mockWithdrawalMovement,
            quantity: 5, // Positive = already a reversal
          }),
          create: vi.fn(),
        },
      })
      await expect(
        service.cancelWithdrawal(prisma, TENANT_ID, MOVEMENT_ID, USER_ID)
      ).rejects.toThrow(service.WhWithdrawalValidationError)
    })
  })

  // ===========================================================================
  // listWithdrawals
  // ===========================================================================

  describe("listWithdrawals", () => {
    it("returns paginated results filtered to WITHDRAWAL type", async () => {
      const prisma = createMockPrisma()
      const result = await service.listWithdrawals(prisma, TENANT_ID, { page: 1, pageSize: 25 })
      expect(result.items).toHaveLength(1)
      expect(result.total).toBe(1)
      expect((prisma.whStockMovement.findMany as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            type: "WITHDRAWAL",
          }),
        })
      )
    })

    it("filters by orderId", async () => {
      const prisma = createMockPrisma()
      await service.listWithdrawals(prisma, TENANT_ID, {
        orderId: ORDER_ID,
        page: 1,
        pageSize: 25,
      })
      expect((prisma.whStockMovement.findMany as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            type: "WITHDRAWAL",
            orderId: ORDER_ID,
          }),
        })
      )
    })

    it("filters by machineId", async () => {
      const prisma = createMockPrisma()
      await service.listWithdrawals(prisma, TENANT_ID, {
        machineId: "M-001",
        page: 1,
        pageSize: 25,
      })
      expect((prisma.whStockMovement.findMany as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            type: "WITHDRAWAL",
            machineId: "M-001",
          }),
        })
      )
    })

    it("filters by date range", async () => {
      const prisma = createMockPrisma()
      await service.listWithdrawals(prisma, TENANT_ID, {
        dateFrom: "2026-01-01",
        dateTo: "2026-12-31",
        page: 1,
        pageSize: 25,
      })
      expect((prisma.whStockMovement.findMany as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            type: "WITHDRAWAL",
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
  // listByOrder
  // ===========================================================================

  describe("listByOrder", () => {
    it("returns withdrawals for specific order", async () => {
      const prisma = createMockPrisma()
      const result = await service.listByOrder(prisma, TENANT_ID, ORDER_ID)
      expect(result).toHaveLength(1)
      expect((prisma.whStockMovement.findMany as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_ID, type: "WITHDRAWAL", orderId: ORDER_ID },
        })
      )
    })
  })

  // ===========================================================================
  // listByDocument
  // ===========================================================================

  describe("listByDocument", () => {
    it("returns withdrawals for specific document", async () => {
      const prisma = createMockPrisma()
      const result = await service.listByDocument(prisma, TENANT_ID, DOCUMENT_ID)
      expect(result).toHaveLength(1)
      expect((prisma.whStockMovement.findMany as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_ID, type: "WITHDRAWAL", documentId: DOCUMENT_ID },
        })
      )
    })
  })

  // ===========================================================================
  // TENANT ISOLATION TESTS (MANDATORY)
  // ===========================================================================

  describe("tenant isolation", () => {
    it("createWithdrawal rejects article from another tenant", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(null), // Article not found for other tenant
          update: vi.fn(),
        },
      })
      await expect(
        service.createWithdrawal(
          prisma,
          OTHER_TENANT_ID,
          { articleId: ARTICLE_ID, quantity: 5, referenceType: "NONE" },
          USER_ID
        )
      ).rejects.toThrow(service.WhWithdrawalNotFoundError)
      expect((prisma.whArticle.findFirst as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ARTICLE_ID, tenantId: OTHER_TENANT_ID },
        })
      )
    })

    it("cancelWithdrawal rejects movement from another tenant", async () => {
      const prisma = createMockPrisma({
        whStockMovement: {
          findFirst: vi.fn().mockResolvedValue(null), // Movement not found for other tenant
          create: vi.fn(),
        },
      })
      await expect(
        service.cancelWithdrawal(prisma, OTHER_TENANT_ID, MOVEMENT_ID, USER_ID)
      ).rejects.toThrow(service.WhWithdrawalNotFoundError)
      expect((prisma.whStockMovement.findFirst as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MOVEMENT_ID, tenantId: OTHER_TENANT_ID },
        })
      )
    })

    it("listWithdrawals returns empty for other tenant", async () => {
      const prisma = createMockPrisma({
        whStockMovement: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
      })
      const result = await service.listWithdrawals(prisma, OTHER_TENANT_ID, { page: 1, pageSize: 25 })
      expect(result.items).toHaveLength(0)
      expect(result.total).toBe(0)
      expect((prisma.whStockMovement.findMany as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: OTHER_TENANT_ID }),
        })
      )
    })

    it("listByOrder returns empty for other tenant", async () => {
      const prisma = createMockPrisma({
        whStockMovement: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      })
      const result = await service.listByOrder(prisma, OTHER_TENANT_ID, ORDER_ID)
      expect(result).toHaveLength(0)
      expect((prisma.whStockMovement.findMany as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: OTHER_TENANT_ID }),
        })
      )
    })

    it("listByDocument returns empty for other tenant", async () => {
      const prisma = createMockPrisma({
        whStockMovement: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      })
      const result = await service.listByDocument(prisma, OTHER_TENANT_ID, DOCUMENT_ID)
      expect(result).toHaveLength(0)
      expect((prisma.whStockMovement.findMany as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: OTHER_TENANT_ID }),
        })
      )
    })
  })
})
