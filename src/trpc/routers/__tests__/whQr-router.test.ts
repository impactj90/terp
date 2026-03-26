import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { whQrRouter } from "../warehouse/qr"
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
const WH_QR_SCAN = permissionIdByKey("wh_qr.scan")!
const WH_QR_PRINT = permissionIdByKey("wh_qr.print")!
const TENANT_ID = "a0b1c200-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ARTICLE_ID = "e1000000-0000-4000-a000-000000000001"

const ALL_PERMS = [WH_QR_SCAN, WH_QR_PRINT]

const createCaller = createCallerFactory(whQrRouter)

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
  number: "ART-00042",
  name: "Test Article",
  unit: "Stk",
  currentStock: 50,
  minStock: 10,
  warehouseLocation: "A1",
  images: null,
  stockTracking: true,
}

const mockMovement = {
  id: "m1000000-0000-4000-a000-000000000001",
  type: "WITHDRAWAL",
  quantity: -5,
  previousStock: 50,
  newStock: 45,
  date: new Date(),
  reason: null,
  notes: null,
  createdAt: new Date(),
  purchaseOrderId: null,
  orderId: null,
  documentId: null,
  article: { id: ARTICLE_ID, number: "ART-00042", name: "Test Article", unit: "Stk" },
}

// --- Tests ---

describe("warehouse.qr", () => {
  // ===========================================================================
  // resolveCode
  // ===========================================================================

  describe("resolveCode", () => {
    it("returns article for valid QR code", async () => {
      const prisma = {
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(mockArticle),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.resolveCode({
        code: "TERP:ART:a0b1c2:ART-00042",
      })
      expect(result).toMatchObject({
        id: ARTICLE_ID,
        number: "ART-00042",
        name: "Test Article",
      })
    })

    it("requires wh_qr.scan permission", async () => {
      const prisma = {
        whArticle: { findFirst: vi.fn().mockResolvedValue(mockArticle) },
      }
      const caller = createCaller(createNoPermContext(prisma))
      await expect(
        caller.resolveCode({ code: "TERP:ART:a0b1c2:ART-00042" })
      ).rejects.toThrow()
    })

    it("rejects cross-tenant QR code with FORBIDDEN", async () => {
      const prisma = {
        whArticle: { findFirst: vi.fn().mockResolvedValue(mockArticle) },
      }
      const caller = createCaller(createTestContext(prisma))
      await expect(
        caller.resolveCode({ code: "TERP:ART:ffffff:ART-00042" })
      ).rejects.toThrow(/FORBIDDEN|gehört zu einem anderen/)
    })

    it("rejects invalid QR code format", async () => {
      const prisma = {
        whArticle: { findFirst: vi.fn().mockResolvedValue(mockArticle) },
      }
      const caller = createCaller(createTestContext(prisma))
      await expect(
        caller.resolveCode({ code: "INVALID" })
      ).rejects.toThrow()
    })
  })

  // ===========================================================================
  // resolveByNumber
  // ===========================================================================

  describe("resolveByNumber", () => {
    it("returns article for valid number", async () => {
      const prisma = {
        whArticle: { findFirst: vi.fn().mockResolvedValue(mockArticle) },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.resolveByNumber({
        articleNumber: "ART-00042",
      })
      expect(result).toMatchObject({ id: ARTICLE_ID })
    })

    it("requires wh_qr.scan permission", async () => {
      const prisma = {
        whArticle: { findFirst: vi.fn().mockResolvedValue(mockArticle) },
      }
      const caller = createCaller(createNoPermContext(prisma))
      await expect(
        caller.resolveByNumber({ articleNumber: "ART-00042" })
      ).rejects.toThrow()
    })
  })

  // ===========================================================================
  // generateSingleQr
  // ===========================================================================

  describe("generateSingleQr", () => {
    it("returns data URL for valid article", async () => {
      const prisma = {
        whArticle: { findFirst: vi.fn().mockResolvedValue(mockArticle) },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.generateSingleQr({
        articleId: ARTICLE_ID,
      })
      expect(result?.dataUrl).toMatch(/^data:image\/png;base64,/)
      expect(result?.content).toBe("TERP:ART:a0b1c2:ART-00042")
    })

    it("requires wh_qr.print permission", async () => {
      const prisma = {
        whArticle: { findFirst: vi.fn().mockResolvedValue(mockArticle) },
      }
      const caller = createCaller(createNoPermContext(prisma))
      await expect(
        caller.generateSingleQr({ articleId: ARTICLE_ID })
      ).rejects.toThrow()
    })
  })

  // ===========================================================================
  // recentMovements
  // ===========================================================================

  describe("recentMovements", () => {
    it("returns movements for article", async () => {
      const prisma = {
        whStockMovement: {
          findMany: vi.fn().mockResolvedValue([mockMovement]),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.recentMovements({
        articleId: ARTICLE_ID,
      })
      expect(result).toHaveLength(1)
      expect(result![0]).toMatchObject({ type: "WITHDRAWAL" })
    })

    it("requires wh_qr.scan permission", async () => {
      const prisma = {
        whStockMovement: { findMany: vi.fn().mockResolvedValue([]) },
      }
      const caller = createCaller(createNoPermContext(prisma))
      await expect(
        caller.recentMovements({ articleId: ARTICLE_ID })
      ).rejects.toThrow()
    })
  })

  // ===========================================================================
  // pendingPositionsForArticle
  // ===========================================================================

  describe("pendingPositionsForArticle", () => {
    it("returns pending positions for article", async () => {
      const mockPosition = {
        id: "p1",
        quantity: 10,
        receivedQuantity: 3,
        purchaseOrder: {
          id: "po1",
          number: "PO-001",
          orderDate: new Date(),
          supplier: { id: "s1", company: "Test Supplier" },
        },
      }
      const prisma = {
        whPurchaseOrderPosition: {
          findMany: vi.fn().mockResolvedValue([mockPosition]),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.pendingPositionsForArticle({
        articleId: ARTICLE_ID,
      })
      expect(result).toHaveLength(1)
    })

    it("requires wh_qr.scan permission", async () => {
      const prisma = {
        whPurchaseOrderPosition: { findMany: vi.fn().mockResolvedValue([]) },
      }
      const caller = createCaller(createNoPermContext(prisma))
      await expect(
        caller.pendingPositionsForArticle({ articleId: ARTICLE_ID })
      ).rejects.toThrow()
    })
  })
})
