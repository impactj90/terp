import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { whStocktakeRouter } from "../warehouse/stocktake"
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
const WH_STOCKTAKE_VIEW = permissionIdByKey("wh_stocktake.view")!
const WH_STOCKTAKE_CREATE = permissionIdByKey("wh_stocktake.create")!
const WH_STOCKTAKE_COUNT = permissionIdByKey("wh_stocktake.count")!
const WH_STOCKTAKE_COMPLETE = permissionIdByKey("wh_stocktake.complete")!
const WH_STOCKTAKE_DELETE = permissionIdByKey("wh_stocktake.delete")!

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const STOCKTAKE_ID = "b1000000-0000-4000-a000-000000000001"
const ARTICLE_ID = "c1000000-0000-4000-a000-000000000001"
const POSITION_ID = "d1000000-0000-4000-a000-000000000001"

const ALL_PERMS = [
  WH_STOCKTAKE_VIEW,
  WH_STOCKTAKE_CREATE,
  WH_STOCKTAKE_COUNT,
  WH_STOCKTAKE_COMPLETE,
  WH_STOCKTAKE_DELETE,
]

const createCaller = createCallerFactory(whStocktakeRouter)

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
const mockStocktake = {
  id: STOCKTAKE_ID,
  tenantId: TENANT_ID,
  number: "INV-0001",
  name: "Year-end stocktake",
  description: null,
  status: "DRAFT",
  scope: null,
  scopeFilter: null,
  notes: null,
  referenceDate: new Date(),
  createdById: USER_ID,
  completedAt: null,
  completedById: null,
  cancelledAt: null,
  printedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { positions: 3 },
}

const mockPosition = {
  id: POSITION_ID,
  stocktakeId: STOCKTAKE_ID,
  articleId: ARTICLE_ID,
  articleNumber: "ART-001",
  articleName: "Test Article",
  unit: "Stk",
  warehouseLocation: "A-01",
  expectedQuantity: 10,
  countedQuantity: null,
  difference: null,
  valueDifference: null,
  buyPrice: 5.0,
  countedById: null,
  countedAt: null,
  reviewed: false,
  skipped: false,
  skipReason: null,
  note: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockPositionWithStocktake = {
  ...mockPosition,
  stocktake: {
    id: STOCKTAKE_ID,
    tenantId: TENANT_ID,
    status: "IN_PROGRESS",
  },
}

// --- Tests ---

describe("warehouse.stocktake", () => {
  // ===========================================================================
  // list
  // ===========================================================================

  describe("list", () => {
    it("returns paginated stocktakes", async () => {
      const prisma = {
        whStocktake: {
          findMany: vi.fn().mockResolvedValue([mockStocktake]),
          count: vi.fn().mockResolvedValue(1),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.list({ page: 1, pageSize: 25 })
      expect(result).toBeDefined()
      expect(result!.items).toHaveLength(1)
      expect(result!.total).toBe(1)
    })

    it("rejects without wh_stocktake.view permission", async () => {
      const prisma = {}
      const caller = createCaller(createNoPermContext(prisma))
      await expect(
        caller.list({ page: 1, pageSize: 25 })
      ).rejects.toThrow("Insufficient permissions")
    })

    it("requires warehouse module enabled", async () => {
      const prisma = {
        tenantModule: {
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn().mockResolvedValue(null),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      await expect(
        caller.list({ page: 1, pageSize: 25 })
      ).rejects.toThrow()
    })
  })

  // ===========================================================================
  // getById
  // ===========================================================================

  describe("getById", () => {
    it("returns a stocktake with stats", async () => {
      const prisma = {
        whStocktake: {
          findFirst: vi.fn().mockResolvedValue(mockStocktake),
        },
        whStocktakePosition: {
          count: vi.fn().mockResolvedValue(3),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.getById({ id: STOCKTAKE_ID })
      expect(result).toBeDefined()
      expect(result!.id).toBe(STOCKTAKE_ID)
    })

    it("rejects without wh_stocktake.view permission", async () => {
      const prisma = {}
      const caller = createCaller(createNoPermContext(prisma))
      await expect(
        caller.getById({ id: STOCKTAKE_ID })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  // ===========================================================================
  // getPositions
  // ===========================================================================

  describe("getPositions", () => {
    it("returns positions for a stocktake", async () => {
      const prisma = {
        whStocktake: {
          findFirst: vi.fn().mockResolvedValue(mockStocktake),
        },
        whStocktakePosition: {
          findMany: vi.fn().mockResolvedValue([mockPosition]),
          count: vi.fn().mockResolvedValue(1),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.getPositions({ stocktakeId: STOCKTAKE_ID })
      expect(result).toBeDefined()
      expect(result!.items).toHaveLength(1)
      expect(result!.total).toBe(1)
    })

    it("rejects without wh_stocktake.view permission", async () => {
      const prisma = {}
      const caller = createCaller(createNoPermContext(prisma))
      await expect(
        caller.getPositions({ stocktakeId: STOCKTAKE_ID })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  // ===========================================================================
  // getPositionByArticle
  // ===========================================================================

  describe("getPositionByArticle", () => {
    it("returns position for given article", async () => {
      const prisma = {
        whStocktake: {
          findFirst: vi.fn().mockResolvedValue(mockStocktake),
        },
        whStocktakePosition: {
          findFirst: vi.fn().mockResolvedValue(mockPosition),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.getPositionByArticle({
        stocktakeId: STOCKTAKE_ID,
        articleId: ARTICLE_ID,
      })
      expect(result).toBeDefined()
      expect(result!.articleId).toBe(ARTICLE_ID)
    })

    it("rejects without wh_stocktake.count permission", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma, [WH_STOCKTAKE_VIEW]))
      await expect(
        caller.getPositionByArticle({
          stocktakeId: STOCKTAKE_ID,
          articleId: ARTICLE_ID,
        })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  // ===========================================================================
  // getStats
  // ===========================================================================

  describe("getStats", () => {
    it("returns stats for a stocktake", async () => {
      const prisma = {
        whStocktake: {
          findFirst: vi.fn().mockResolvedValue(mockStocktake),
        },
        whStocktakePosition: {
          count: vi.fn().mockResolvedValue(3),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.getStats({ stocktakeId: STOCKTAKE_ID })
      expect(result).toBeDefined()
      expect(result!.total).toBe(3)
    })

    it("rejects without wh_stocktake.view permission", async () => {
      const prisma = {}
      const caller = createCaller(createNoPermContext(prisma))
      await expect(
        caller.getStats({ stocktakeId: STOCKTAKE_ID })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  // ===========================================================================
  // create
  // ===========================================================================

  describe("create", () => {
    it("creates a stocktake with positions", async () => {
      const createdStocktake = { ...mockStocktake, status: "DRAFT" }
      const prisma = {
        whArticle: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: ARTICLE_ID,
              number: "ART-001",
              name: "Test Article",
              unit: "Stk",
              currentStock: 10,
              buyPrice: 5.0,
              warehouseLocation: "A-01",
            },
          ]),
        },
        numberSequence: {
          upsert: vi.fn().mockResolvedValue({
            id: "ns-1",
            tenantId: TENANT_ID,
            key: "stocktake",
            prefix: "INV-",
            nextValue: 2,
          }),
        },
        whStocktake: {
          create: vi.fn().mockResolvedValue(createdStocktake),
        },
        whStocktakePosition: {
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        auditLog: {
          create: vi.fn(),
        },
        $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.create({ name: "Year-end stocktake" })
      expect(result).toBeDefined()
    })

    it("rejects without wh_stocktake.create permission", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma, [WH_STOCKTAKE_VIEW]))
      await expect(
        caller.create({ name: "Year-end stocktake" })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  // ===========================================================================
  // startCounting
  // ===========================================================================

  describe("startCounting", () => {
    it("transitions stocktake from DRAFT to IN_PROGRESS", async () => {
      const updatedStocktake = { ...mockStocktake, status: "IN_PROGRESS" }
      const prisma = {
        whStocktake: {
          findFirst: vi.fn().mockResolvedValue({ ...mockStocktake, status: "DRAFT" }),
          update: vi.fn().mockResolvedValue(updatedStocktake),
        },
        auditLog: {
          create: vi.fn(),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.startCounting({ id: STOCKTAKE_ID })
      expect(result).toBeDefined()
    })

    it("rejects without wh_stocktake.create permission", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma, [WH_STOCKTAKE_VIEW]))
      await expect(
        caller.startCounting({ id: STOCKTAKE_ID })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  // ===========================================================================
  // recordCount
  // ===========================================================================

  describe("recordCount", () => {
    it("records a count for a position", async () => {
      const updatedPosition = {
        ...mockPosition,
        countedQuantity: 8,
        difference: -2,
        countedById: USER_ID,
        countedAt: new Date(),
      }
      const prisma = {
        whStocktake: {
          findFirst: vi.fn().mockResolvedValue({ ...mockStocktake, status: "IN_PROGRESS" }),
        },
        whStocktakePosition: {
          findFirst: vi.fn().mockResolvedValue(mockPosition),
          update: vi.fn().mockResolvedValue(updatedPosition),
        },
        auditLog: {
          create: vi.fn(),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.recordCount({
        stocktakeId: STOCKTAKE_ID,
        articleId: ARTICLE_ID,
        countedQuantity: 8,
      })
      expect(result).toBeDefined()
    })

    it("rejects without wh_stocktake.count permission", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma, [WH_STOCKTAKE_VIEW]))
      await expect(
        caller.recordCount({
          stocktakeId: STOCKTAKE_ID,
          articleId: ARTICLE_ID,
          countedQuantity: 8,
        })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  // ===========================================================================
  // reviewPosition
  // ===========================================================================

  describe("reviewPosition", () => {
    it("marks a position as reviewed", async () => {
      const updatedPosition = { ...mockPosition, reviewed: true }
      const prisma = {
        whStocktakePosition: {
          findUnique: vi.fn().mockResolvedValue(mockPositionWithStocktake),
          update: vi.fn().mockResolvedValue(updatedPosition),
        },
        auditLog: {
          create: vi.fn(),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.reviewPosition({
        positionId: POSITION_ID,
        reviewed: true,
      })
      expect(result).toBeDefined()
    })

    it("rejects without wh_stocktake.complete permission", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma, [WH_STOCKTAKE_VIEW]))
      await expect(
        caller.reviewPosition({
          positionId: POSITION_ID,
          reviewed: true,
        })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  // ===========================================================================
  // skipPosition
  // ===========================================================================

  describe("skipPosition", () => {
    it("skips a position with a reason", async () => {
      const updatedPosition = { ...mockPosition, skipped: true, skipReason: "Not accessible" }
      const prisma = {
        whStocktakePosition: {
          findUnique: vi.fn().mockResolvedValue(mockPositionWithStocktake),
          update: vi.fn().mockResolvedValue(updatedPosition),
        },
        auditLog: {
          create: vi.fn(),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.skipPosition({
        positionId: POSITION_ID,
        skipReason: "Not accessible",
      })
      expect(result).toBeDefined()
    })

    it("rejects without wh_stocktake.count permission", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma, [WH_STOCKTAKE_VIEW]))
      await expect(
        caller.skipPosition({
          positionId: POSITION_ID,
          skipReason: "Not accessible",
        })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  // ===========================================================================
  // complete
  // ===========================================================================

  describe("complete", () => {
    it("completes a stocktake and creates stock movements", async () => {
      const inProgressStocktake = {
        ...mockStocktake,
        status: "IN_PROGRESS",
        positions: [
          {
            ...mockPosition,
            countedQuantity: 8,
            difference: -2,
            skipped: false,
          },
        ],
      }
      const prisma = {
        whStocktake: {
          findFirst: vi.fn().mockResolvedValue(inProgressStocktake),
          update: vi.fn().mockResolvedValue({ ...mockStocktake, status: "COMPLETED" }),
        },
        whArticle: {
          findFirst: vi.fn().mockResolvedValue({
            id: ARTICLE_ID,
            currentStock: 10,
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        whStockMovement: {
          create: vi.fn().mockResolvedValue({
            id: "mov-1",
            type: "INVENTORY",
            quantity: -2,
          }),
        },
        auditLog: {
          create: vi.fn(),
        },
        $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.complete({ id: STOCKTAKE_ID })
      expect(result).toBeDefined()
      expect(result!.movements).toBeDefined()
    })

    it("rejects without wh_stocktake.complete permission", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma, [WH_STOCKTAKE_VIEW]))
      await expect(
        caller.complete({ id: STOCKTAKE_ID })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  // ===========================================================================
  // cancel
  // ===========================================================================

  describe("cancel", () => {
    it("cancels a draft stocktake", async () => {
      const cancelledStocktake = { ...mockStocktake, status: "CANCELLED" }
      const prisma = {
        whStocktake: {
          findFirst: vi.fn().mockResolvedValue({ ...mockStocktake, status: "DRAFT" }),
          update: vi.fn().mockResolvedValue(cancelledStocktake),
        },
        auditLog: {
          create: vi.fn(),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.cancel({ id: STOCKTAKE_ID })
      expect(result).toBeDefined()
    })

    it("rejects without wh_stocktake.complete permission", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma, [WH_STOCKTAKE_VIEW]))
      await expect(
        caller.cancel({ id: STOCKTAKE_ID })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  // ===========================================================================
  // remove
  // ===========================================================================

  describe("remove", () => {
    it("removes a draft stocktake", async () => {
      const prisma = {
        whStocktake: {
          findFirst: vi.fn().mockResolvedValue({ ...mockStocktake, status: "DRAFT" }),
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        auditLog: {
          create: vi.fn(),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.remove({ id: STOCKTAKE_ID })
      expect(result).toBeDefined()
      expect(result!.deleted).toBe(true)
    })

    it("rejects without wh_stocktake.delete permission", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma, [WH_STOCKTAKE_VIEW]))
      await expect(
        caller.remove({ id: STOCKTAKE_ID })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  // ===========================================================================
  // generatePdf
  // ===========================================================================

  describe("generatePdf", () => {
    it("rejects without wh_stocktake.complete permission", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma, [WH_STOCKTAKE_VIEW]))
      await expect(
        caller.generatePdf({ id: STOCKTAKE_ID })
      ).rejects.toThrow("Insufficient permissions")
    })
  })
})
