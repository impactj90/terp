import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { whStockMovementsRouter } from "../warehouse/stockMovements"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// Mock the db module for requireModule middleware
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "warehouse" }),
    },
  },
}))

// --- Constants ---
const WH_STOCK_VIEW = permissionIdByKey("wh_stock.view")!
const WH_STOCK_MANAGE = permissionIdByKey("wh_stock.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const PO_ID = "c1000000-0000-4000-a000-000000000001"
const POSITION_ID = "d1000000-0000-4000-a000-000000000001"
const ARTICLE_ID = "e1000000-0000-4000-a000-000000000001"
const MOVEMENT_ID = "f1000000-0000-4000-a000-000000000001"

const ALL_PERMS = [WH_STOCK_VIEW, WH_STOCK_MANAGE]

const createCaller = createCallerFactory(whStockMovementsRouter)

// --- Module Mock ---
const MODULE_MOCK = {
  tenantModule: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "warehouse" }),
  },
}

function withModuleMock(prisma: Record<string, unknown>) {
  return { ...MODULE_MOCK, ...prisma }
}

function createTestContext(
  prisma: Record<string, unknown>,
  permissions: string[] = ALL_PERMS
) {
  return createMockContext({
    prisma: withModuleMock(prisma) as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions(permissions, {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

function createNoPermContext(prisma: Record<string, unknown>) {
  return createTestContext(prisma, [])
}

// --- Mock Data ---
const mockPO = {
  id: PO_ID,
  tenantId: TENANT_ID,
  number: "BES-1",
  status: "ORDERED",
  supplierId: "sup-1",
  supplier: { id: "sup-1", number: "L-1", company: "Test Supplier" },
  _count: { positions: 2 },
  createdAt: new Date(),
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

// --- Tests ---

describe("warehouse.stockMovements", () => {
  // ===========================================================================
  // goodsReceipt.listPendingOrders
  // ===========================================================================

  describe("goodsReceipt.listPendingOrders", () => {
    it("returns pending orders", async () => {
      const prisma = {
        whPurchaseOrder: {
          findMany: vi.fn().mockResolvedValue([mockPO]),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.goodsReceipt.listPendingOrders({})
      expect(result).toBeDefined()
      expect(result).toHaveLength(1)
    })

    it("rejects without wh_stock.view permission", async () => {
      const prisma = {}
      const caller = createCaller(createNoPermContext(prisma))
      await expect(
        caller.goodsReceipt.listPendingOrders({})
      ).rejects.toThrow("Insufficient permissions")
    })

    it("requires warehouse module enabled", async () => {
      const prisma = {
        tenantModule: {
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn().mockResolvedValue(null), // module NOT enabled
        },
      }
      const caller = createCaller(createTestContext(prisma))
      await expect(
        caller.goodsReceipt.listPendingOrders({})
      ).rejects.toThrow()
    })
  })

  // ===========================================================================
  // goodsReceipt.getOrderPositions
  // ===========================================================================

  describe("goodsReceipt.getOrderPositions", () => {
    it("returns PO with positions", async () => {
      const mockPOWithPositions = {
        ...mockPO,
        positions: [{
          id: POSITION_ID,
          articleId: ARTICLE_ID,
          quantity: 10,
          receivedQuantity: 0,
          article: { id: ARTICLE_ID, number: "ART-1", name: "Test Article", unit: "Stk", currentStock: 10, stockTracking: true },
        }],
      }
      const prisma = {
        whPurchaseOrder: {
          findFirst: vi.fn().mockResolvedValue(mockPOWithPositions),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.goodsReceipt.getOrderPositions({ purchaseOrderId: PO_ID })
      expect(result).toBeDefined()
    })

    it("rejects without wh_stock.view permission", async () => {
      const prisma = {}
      const caller = createCaller(createNoPermContext(prisma))
      await expect(
        caller.goodsReceipt.getOrderPositions({ purchaseOrderId: PO_ID })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  // ===========================================================================
  // goodsReceipt.book
  // ===========================================================================

  describe("goodsReceipt.book", () => {
    it("books goods receipt and returns result", async () => {
      const prisma = {
        whPurchaseOrder: {
          findFirst: vi.fn().mockResolvedValue(mockPO),
          update: vi.fn().mockResolvedValue({ ...mockPO, status: "RECEIVED" }),
        },
        whPurchaseOrderPosition: {
          findFirst: vi.fn().mockResolvedValue({
            id: POSITION_ID,
            purchaseOrderId: PO_ID,
            articleId: ARTICLE_ID,
            quantity: 20,
            receivedQuantity: 0,
          }),
          findMany: vi.fn().mockResolvedValue([
            { id: POSITION_ID, quantity: 20, receivedQuantity: 5 },
          ]),
          update: vi.fn().mockResolvedValue({}),
        },
        whArticle: {
          findFirst: vi.fn().mockResolvedValue({
            id: ARTICLE_ID,
            tenantId: TENANT_ID,
            currentStock: 10,
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        whStockMovement: {
          create: vi.fn().mockResolvedValue(mockMovement),
        },
        auditLog: {
          create: vi.fn(),
        },
        $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
          // The transaction fn receives the prisma client itself
          return fn(prisma)
        }),
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.goodsReceipt.book({
        purchaseOrderId: PO_ID,
        positions: [{ positionId: POSITION_ID, quantity: 5 }],
      })
      expect(result).toBeDefined()
      expect(result!.movements).toHaveLength(1)
    })

    it("rejects without wh_stock.manage permission", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma, [WH_STOCK_VIEW]))
      await expect(
        caller.goodsReceipt.book({
          purchaseOrderId: PO_ID,
          positions: [{ positionId: POSITION_ID, quantity: 5 }],
        })
      ).rejects.toThrow("Insufficient permissions")
    })

    it("validates input schema (empty positions array)", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma))
      await expect(
        caller.goodsReceipt.book({
          purchaseOrderId: PO_ID,
          positions: [],
        })
      ).rejects.toThrow()
    })
  })

  // ===========================================================================
  // goodsReceipt.bookSingle
  // ===========================================================================

  describe("goodsReceipt.bookSingle", () => {
    it("books a single position", async () => {
      const prisma = {
        whPurchaseOrder: {
          findFirst: vi.fn().mockResolvedValue(mockPO),
          update: vi.fn().mockResolvedValue({ ...mockPO, status: "PARTIALLY_RECEIVED" }),
        },
        whPurchaseOrderPosition: {
          findFirst: vi.fn()
            .mockResolvedValueOnce({
              id: POSITION_ID,
              purchaseOrderId: PO_ID,
              articleId: ARTICLE_ID,
              quantity: 20,
              receivedQuantity: 0,
              purchaseOrder: { id: PO_ID, tenantId: TENANT_ID },
            })
            .mockResolvedValueOnce({
              id: POSITION_ID,
              purchaseOrderId: PO_ID,
              articleId: ARTICLE_ID,
              quantity: 20,
              receivedQuantity: 0,
            }),
          findMany: vi.fn().mockResolvedValue([
            { id: POSITION_ID, quantity: 20, receivedQuantity: 5 },
          ]),
          update: vi.fn().mockResolvedValue({}),
        },
        whArticle: {
          findFirst: vi.fn().mockResolvedValue({
            id: ARTICLE_ID,
            tenantId: TENANT_ID,
            currentStock: 10,
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        whStockMovement: {
          create: vi.fn().mockResolvedValue(mockMovement),
        },
        auditLog: {
          create: vi.fn(),
        },
        $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.goodsReceipt.bookSingle({
        purchaseOrderPositionId: POSITION_ID,
        quantity: 5,
      })
      expect(result).toBeDefined()
    })

    it("rejects without wh_stock.manage permission", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma, [WH_STOCK_VIEW]))
      await expect(
        caller.goodsReceipt.bookSingle({
          purchaseOrderPositionId: POSITION_ID,
          quantity: 5,
        })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  // ===========================================================================
  // movements.list
  // ===========================================================================

  describe("movements.list", () => {
    it("returns paginated movements", async () => {
      const prisma = {
        whStockMovement: {
          findMany: vi.fn().mockResolvedValue([mockMovement]),
          count: vi.fn().mockResolvedValue(1),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.movements.list({ page: 1, pageSize: 10 })
      expect(result!.items).toHaveLength(1)
      expect(result!.total).toBe(1)
    })

    it("rejects without wh_stock.view permission", async () => {
      const prisma = {}
      const caller = createCaller(createNoPermContext(prisma))
      await expect(
        caller.movements.list({ page: 1, pageSize: 10 })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  // ===========================================================================
  // movements.listByArticle
  // ===========================================================================

  describe("movements.listByArticle", () => {
    it("returns movements for an article", async () => {
      const prisma = {
        whArticle: {
          findFirst: vi.fn().mockResolvedValue({ id: ARTICLE_ID }),
        },
        whStockMovement: {
          findMany: vi.fn().mockResolvedValue([mockMovement]),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.movements.listByArticle({ articleId: ARTICLE_ID })
      expect(result).toBeDefined()
      expect(result).toHaveLength(1)
    })

    it("rejects without wh_stock.view permission", async () => {
      const prisma = {}
      const caller = createCaller(createNoPermContext(prisma))
      await expect(
        caller.movements.listByArticle({ articleId: ARTICLE_ID })
      ).rejects.toThrow("Insufficient permissions")
    })
  })
})
