import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { whWithdrawalsRouter } from "../warehouse/withdrawals"
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
const OTHER_TENANT_ID = "ff000000-0000-4000-a000-000000000999"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ARTICLE_ID = "e1000000-0000-4000-a000-000000000001"
const MOVEMENT_ID = "f1000000-0000-4000-a000-000000000001"
const ORDER_ID = "c1000000-0000-4000-a000-000000000001"
const DOCUMENT_ID = "d1000000-0000-4000-a000-000000000001"

const ALL_PERMS = [WH_STOCK_VIEW, WH_STOCK_MANAGE]

const createCaller = createCallerFactory(whWithdrawalsRouter)

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
const mockArticle = {
  id: ARTICLE_ID,
  tenantId: TENANT_ID,
  number: "ART-1",
  name: "Test Article",
  currentStock: 50,
  stockTracking: true,
  unit: "Stk",
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

// --- Tests ---

describe("warehouse.withdrawals", () => {
  // ===========================================================================
  // create
  // ===========================================================================

  describe("create", () => {
    it("creates withdrawal with negative quantity", async () => {
      const prisma = {
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(mockArticle),
          update: vi.fn().mockResolvedValue({ ...mockArticle, currentStock: 45 }),
        },
        whStockMovement: {
          create: vi.fn().mockResolvedValue(mockWithdrawalMovement),
        },
        auditLog: { create: vi.fn() },
        $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.create({
        articleId: ARTICLE_ID,
        quantity: 5,
        referenceType: "NONE",
      })
      expect(result).toBeDefined()
      expect(result!.type).toBe("WITHDRAWAL")
    })

    it("requires wh_stock.manage permission", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma, [WH_STOCK_VIEW]))
      await expect(
        caller.create({
          articleId: ARTICLE_ID,
          quantity: 5,
          referenceType: "NONE",
        })
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
        caller.create({
          articleId: ARTICLE_ID,
          quantity: 5,
          referenceType: "NONE",
        })
      ).rejects.toThrow()
    })

    it("rejects insufficient stock", async () => {
      const prisma = {
        whArticle: {
          findFirst: vi.fn().mockResolvedValue({ ...mockArticle, currentStock: 2 }),
          update: vi.fn(),
        },
        whStockMovement: { create: vi.fn() },
        auditLog: { create: vi.fn() },
        $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
      }
      const caller = createCaller(createTestContext(prisma))
      await expect(
        caller.create({
          articleId: ARTICLE_ID,
          quantity: 5,
          referenceType: "NONE",
        })
      ).rejects.toThrow()
    })

    it("validates articleId is UUID", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma))
      await expect(
        caller.create({
          articleId: "not-a-uuid",
          quantity: 5,
          referenceType: "NONE",
        })
      ).rejects.toThrow()
    })
  })

  // ===========================================================================
  // createBatch
  // ===========================================================================

  describe("createBatch", () => {
    it("creates batch withdrawal for multiple articles", async () => {
      const prisma = {
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(mockArticle),
          update: vi.fn().mockResolvedValue({ ...mockArticle, currentStock: 45 }),
        },
        whStockMovement: {
          create: vi.fn().mockResolvedValue(mockWithdrawalMovement),
        },
        auditLog: { create: vi.fn() },
        $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.createBatch({
        referenceType: "NONE",
        items: [{ articleId: ARTICLE_ID, quantity: 5 }],
      })
      expect(result).toBeDefined()
      expect(result).toHaveLength(1)
    })

    it("requires wh_stock.manage permission", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma, [WH_STOCK_VIEW]))
      await expect(
        caller.createBatch({
          referenceType: "NONE",
          items: [{ articleId: ARTICLE_ID, quantity: 5 }],
        })
      ).rejects.toThrow("Insufficient permissions")
    })

    it("validates items array is not empty", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma))
      await expect(
        caller.createBatch({
          referenceType: "NONE",
          items: [],
        })
      ).rejects.toThrow()
    })
  })

  // ===========================================================================
  // cancel
  // ===========================================================================

  describe("cancel", () => {
    it("creates positive reversal movement", async () => {
      const prisma = {
        whStockMovement: {
          findFirst: vi.fn().mockResolvedValue(mockWithdrawalMovement),
          create: vi.fn().mockResolvedValue({ ...mockWithdrawalMovement, quantity: 5 }),
        },
        whArticle: {
          findFirst: vi.fn().mockResolvedValue({ ...mockArticle, currentStock: 45 }),
          update: vi.fn().mockResolvedValue({ ...mockArticle, currentStock: 50 }),
        },
        auditLog: { create: vi.fn() },
        $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.cancel({ movementId: MOVEMENT_ID })
      expect(result).toBeDefined()
    })

    it("requires wh_stock.manage permission", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma, [WH_STOCK_VIEW]))
      await expect(
        caller.cancel({ movementId: MOVEMENT_ID })
      ).rejects.toThrow("Insufficient permissions")
    })

    it("rejects if movement is not WITHDRAWAL type", async () => {
      const prisma = {
        whStockMovement: {
          findFirst: vi.fn().mockResolvedValue({ ...mockWithdrawalMovement, type: "GOODS_RECEIPT" }),
          create: vi.fn(),
        },
        whArticle: { findFirst: vi.fn(), update: vi.fn() },
        auditLog: { create: vi.fn() },
        $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
      }
      const caller = createCaller(createTestContext(prisma))
      await expect(
        caller.cancel({ movementId: MOVEMENT_ID })
      ).rejects.toThrow()
    })
  })

  // ===========================================================================
  // list
  // ===========================================================================

  describe("list", () => {
    it("returns paginated withdrawals", async () => {
      const prisma = {
        whStockMovement: {
          findMany: vi.fn().mockResolvedValue([mockWithdrawalMovement]),
          count: vi.fn().mockResolvedValue(1),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.list({ page: 1, pageSize: 10 })
      expect(result!.items).toHaveLength(1)
      expect(result!.total).toBe(1)
    })

    it("requires wh_stock.view permission", async () => {
      const prisma = {}
      const caller = createCaller(createNoPermContext(prisma))
      await expect(
        caller.list({ page: 1, pageSize: 10 })
      ).rejects.toThrow("Insufficient permissions")
    })

    it("filters by orderId", async () => {
      const prisma = {
        whStockMovement: {
          findMany: vi.fn().mockResolvedValue([mockWithdrawalMovement]),
          count: vi.fn().mockResolvedValue(1),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.list({
        orderId: ORDER_ID,
        page: 1,
        pageSize: 10,
      })
      expect(result).toBeDefined()
    })

    it("filters by date range", async () => {
      const prisma = {
        whStockMovement: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.list({
        dateFrom: "2026-01-01",
        dateTo: "2026-12-31",
        page: 1,
        pageSize: 10,
      })
      expect(result!.items).toHaveLength(0)
    })
  })

  // ===========================================================================
  // listByOrder
  // ===========================================================================

  describe("listByOrder", () => {
    it("returns withdrawals for an order", async () => {
      const prisma = {
        whStockMovement: {
          findMany: vi.fn().mockResolvedValue([mockWithdrawalMovement]),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.listByOrder({ orderId: ORDER_ID })
      expect(result).toBeDefined()
      expect(result).toHaveLength(1)
    })

    it("requires wh_stock.view permission", async () => {
      const prisma = {}
      const caller = createCaller(createNoPermContext(prisma))
      await expect(
        caller.listByOrder({ orderId: ORDER_ID })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  // ===========================================================================
  // listByDocument
  // ===========================================================================

  describe("listByDocument", () => {
    it("returns withdrawals for a document", async () => {
      const prisma = {
        whStockMovement: {
          findMany: vi.fn().mockResolvedValue([mockWithdrawalMovement]),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.listByDocument({ documentId: DOCUMENT_ID })
      expect(result).toBeDefined()
      expect(result).toHaveLength(1)
    })

    it("requires wh_stock.view permission", async () => {
      const prisma = {}
      const caller = createCaller(createNoPermContext(prisma))
      await expect(
        caller.listByDocument({ documentId: DOCUMENT_ID })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  // ===========================================================================
  // TENANT ISOLATION TESTS (MANDATORY)
  // ===========================================================================

  describe("tenant isolation", () => {
    it("create rejects article from another tenant", async () => {
      const prisma = {
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
        whStockMovement: { create: vi.fn() },
        auditLog: { create: vi.fn() },
        $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
      }
      // Use OTHER_TENANT_ID context
      const ctx = createMockContext({
        prisma: withModuleMock(prisma) as unknown as ReturnType<typeof createMockContext>["prisma"],
        authToken: "test-token",
        user: createUserWithPermissions(ALL_PERMS, {
          id: USER_ID,
          userTenants: [createMockUserTenant(USER_ID, OTHER_TENANT_ID)],
        }),
        session: createMockSession(),
        tenantId: OTHER_TENANT_ID,
      })
      const caller = createCaller(ctx)
      await expect(
        caller.create({
          articleId: ARTICLE_ID,
          quantity: 5,
          referenceType: "NONE",
        })
      ).rejects.toThrow()
    })

    it("cancel rejects movement from another tenant", async () => {
      const prisma = {
        whStockMovement: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn(),
        },
        whArticle: { findFirst: vi.fn(), update: vi.fn() },
        auditLog: { create: vi.fn() },
        $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
      }
      const ctx = createMockContext({
        prisma: withModuleMock(prisma) as unknown as ReturnType<typeof createMockContext>["prisma"],
        authToken: "test-token",
        user: createUserWithPermissions(ALL_PERMS, {
          id: USER_ID,
          userTenants: [createMockUserTenant(USER_ID, OTHER_TENANT_ID)],
        }),
        session: createMockSession(),
        tenantId: OTHER_TENANT_ID,
      })
      const caller = createCaller(ctx)
      await expect(
        caller.cancel({ movementId: MOVEMENT_ID })
      ).rejects.toThrow()
    })

    it("list returns empty for other tenant", async () => {
      const prisma = {
        whStockMovement: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
      }
      const ctx = createMockContext({
        prisma: withModuleMock(prisma) as unknown as ReturnType<typeof createMockContext>["prisma"],
        authToken: "test-token",
        user: createUserWithPermissions(ALL_PERMS, {
          id: USER_ID,
          userTenants: [createMockUserTenant(USER_ID, OTHER_TENANT_ID)],
        }),
        session: createMockSession(),
        tenantId: OTHER_TENANT_ID,
      })
      const caller = createCaller(ctx)
      const result = await caller.list({ page: 1, pageSize: 10 })
      expect(result!.items).toHaveLength(0)
    })

    it("listByOrder returns empty for other tenant", async () => {
      const prisma = {
        whStockMovement: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      }
      const ctx = createMockContext({
        prisma: withModuleMock(prisma) as unknown as ReturnType<typeof createMockContext>["prisma"],
        authToken: "test-token",
        user: createUserWithPermissions(ALL_PERMS, {
          id: USER_ID,
          userTenants: [createMockUserTenant(USER_ID, OTHER_TENANT_ID)],
        }),
        session: createMockSession(),
        tenantId: OTHER_TENANT_ID,
      })
      const caller = createCaller(ctx)
      const result = await caller.listByOrder({ orderId: ORDER_ID })
      expect(result).toHaveLength(0)
    })

    it("listByDocument returns empty for other tenant", async () => {
      const prisma = {
        whStockMovement: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      }
      const ctx = createMockContext({
        prisma: withModuleMock(prisma) as unknown as ReturnType<typeof createMockContext>["prisma"],
        authToken: "test-token",
        user: createUserWithPermissions(ALL_PERMS, {
          id: USER_ID,
          userTenants: [createMockUserTenant(USER_ID, OTHER_TENANT_ID)],
        }),
        session: createMockSession(),
        tenantId: OTHER_TENANT_ID,
      })
      const caller = createCaller(ctx)
      const result = await caller.listByDocument({ documentId: DOCUMENT_ID })
      expect(result).toHaveLength(0)
    })
  })
})
