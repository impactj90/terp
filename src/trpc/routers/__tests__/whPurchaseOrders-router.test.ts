import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { whPurchaseOrdersRouter } from "../warehouse/purchaseOrders"
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
const PO_VIEW = permissionIdByKey("wh_purchase_orders.view")!
const PO_CREATE = permissionIdByKey("wh_purchase_orders.create")!
const PO_EDIT = permissionIdByKey("wh_purchase_orders.edit")!
const PO_DELETE = permissionIdByKey("wh_purchase_orders.delete")!
const PO_ORDER = permissionIdByKey("wh_purchase_orders.order")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const PO_ID = "c1000000-0000-4000-a000-000000000001"
const SUPPLIER_ID = "d1000000-0000-4000-a000-000000000001"
const ARTICLE_ID = "e1000000-0000-4000-a000-000000000001"
const POSITION_ID = "f1000000-0000-4000-a000-000000000001"

const ALL_PERMS = [PO_VIEW, PO_CREATE, PO_EDIT, PO_DELETE, PO_ORDER]

const createCaller = createCallerFactory(whPurchaseOrdersRouter)

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
  supplier: { id: SUPPLIER_ID, company: "Test Supplier", type: "SUPPLIER" },
  positions: [],
}

const mockPosition = {
  id: POSITION_ID,
  purchaseOrderId: PO_ID,
  sortOrder: 0,
  positionType: "ARTICLE" as const,
  articleId: ARTICLE_ID,
  freeText: null,
  supplierArticleNumber: null,
  description: "Test Article",
  quantity: 10,
  receivedQuantity: 0,
  unit: "Stk",
  unitPrice: 5.0,
  flatCosts: null,
  totalPrice: 50,
  vatRate: 19,
  requestedDelivery: null,
  confirmedDelivery: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

// --- Tests ---

describe("warehouse.purchaseOrders", () => {
  describe("list", () => {
    it("returns paginated purchase orders", async () => {
      const prisma = {
        whPurchaseOrder: {
          findMany: vi.fn().mockResolvedValue([mockPO]),
          count: vi.fn().mockResolvedValue(1),
        },
      }

      const caller = createCaller(createTestContext(prisma))
      const result = await caller.list({ page: 1, pageSize: 10 })

      expect(result!.items).toHaveLength(1)
      expect(result!.total).toBe(1)
      expect(result!.items[0]!.number).toBe("BES-1")
    })

    it("rejects without wh_purchase_orders.view permission", async () => {
      const prisma = {
        whPurchaseOrder: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
      }

      const caller = createCaller(createNoPermContext(prisma))

      await expect(
        caller.list({ page: 1, pageSize: 10 })
      ).rejects.toThrow("Insufficient permissions")
    })

    it("requires warehouse module enabled", async () => {
      const prisma = {
        tenantModule: {
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn().mockResolvedValue(null),
        },
        whPurchaseOrder: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
      }

      const caller = createCaller(createTestContext(prisma))

      await expect(
        caller.list({ page: 1, pageSize: 10 })
      ).rejects.toThrow()
    })
  })

  describe("create", () => {
    it("auto-generates PO number", async () => {
      const prisma = {
        crmAddress: {
          findFirst: vi.fn().mockResolvedValue({ id: SUPPLIER_ID, type: "SUPPLIER" }),
        },
        numberSequence: {
          upsert: vi.fn().mockResolvedValue({ prefix: "BES-", nextValue: 2 }),
        },
        whPurchaseOrder: {
          create: vi.fn().mockResolvedValue({ ...mockPO, number: "BES-1" }),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({}),
        },
      }

      const caller = createCaller(createTestContext(prisma))
      const result = await caller.create({ supplierId: SUPPLIER_ID })

      expect(result).toBeDefined()
      expect(result!.number).toBe("BES-1")
    })

    it("rejects without wh_purchase_orders.create permission", async () => {
      const prisma = {}

      const caller = createCaller(createTestContext(prisma, [PO_VIEW]))

      await expect(
        caller.create({ supplierId: SUPPLIER_ID })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  describe("update", () => {
    it("updates draft PO fields", async () => {
      const updatedPO = { ...mockPO, notes: "Updated notes" }
      const prisma = {
        whPurchaseOrder: {
          findFirst: vi.fn().mockResolvedValue({ ...mockPO, positions: [] }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      }

      const caller = createCaller(createTestContext(prisma))
      // We mock the find to return DRAFT, so update should proceed
      prisma.whPurchaseOrder.findFirst.mockResolvedValueOnce({ ...mockPO, positions: [] })
      // For the update call in repo:
      prisma.whPurchaseOrder.updateMany = vi.fn().mockResolvedValue({ count: 1 })

      // The repo.update uses updateMany + findFirst again
      prisma.whPurchaseOrder.findFirst
        .mockResolvedValueOnce({ ...mockPO, positions: [] }) // getById in update
        .mockResolvedValueOnce(updatedPO) // findFirst after update

      const result = await caller.update({ id: PO_ID, notes: "Updated notes" })
      expect(result).toBeDefined()
    })
  })

  describe("delete", () => {
    it("rejects without wh_purchase_orders.delete permission", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma, [PO_VIEW]))

      await expect(
        caller.delete({ id: PO_ID })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  describe("sendOrder", () => {
    it("finalizes PO with method", async () => {
      const poWithPositions = { ...mockPO, positions: [mockPosition] }
      const sentPO = {
        ...mockPO,
        status: "ORDERED",
        orderDate: new Date(),
        orderMethod: "EMAIL",
      }

      const prisma = {
        whPurchaseOrder: {
          findFirst: vi.fn()
            .mockResolvedValueOnce(poWithPositions) // getById
            .mockResolvedValueOnce(sentPO), // after update
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      }

      const caller = createCaller(createTestContext(prisma))
      const result = await caller.sendOrder({ id: PO_ID, method: "EMAIL" })

      expect(result).toBeDefined()
      expect(result!.status).toBe("ORDERED")
    })

    it("rejects without wh_purchase_orders.order permission", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma, [PO_VIEW, PO_EDIT]))

      await expect(
        caller.sendOrder({ id: PO_ID, method: "EMAIL" })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  describe("cancel", () => {
    it("cancels a PO", async () => {
      const cancelledPO = { ...mockPO, status: "CANCELLED" }
      const prisma = {
        whPurchaseOrder: {
          findFirst: vi.fn()
            .mockResolvedValueOnce({ ...mockPO, positions: [] }) // getById
            .mockResolvedValueOnce(cancelledPO), // after update
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      }

      const caller = createCaller(createTestContext(prisma))
      const result = await caller.cancel({ id: PO_ID })

      expect(result).toBeDefined()
      expect(result!.status).toBe("CANCELLED")
    })
  })

  describe("reorderSuggestions", () => {
    it("returns articles below min stock", async () => {
      const prisma = {
        whArticle: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: ARTICLE_ID,
              number: "ART-1",
              name: "Test Article",
              currentStock: 2,
              minStock: 10,
              buyPrice: 5.0,
              unit: "Stk",
              suppliers: [
                {
                  supplierId: SUPPLIER_ID,
                  supplierArticleNumber: "SUP-001",
                  buyPrice: 4.5,
                  defaultOrderQty: 20,
                  supplier: { company: "Test Supplier" },
                },
              ],
            },
          ]),
        },
      }

      const caller = createCaller(createTestContext(prisma))
      const result = await caller.reorderSuggestions({})

      expect(result).toHaveLength(1)
      expect(result![0]!.articleId).toBe(ARTICLE_ID)
      expect(result![0]!.deficit).toBe(8)
      expect(result![0]!.suggestedQty).toBe(20) // max(deficit=8, defaultOrderQty=20)
    })
  })

  describe("positions", () => {
    describe("positions.list", () => {
      it("returns positions for a PO", async () => {
        const prisma = {
          whPurchaseOrder: {
            findFirst: vi.fn().mockResolvedValue({
              ...mockPO,
              positions: [mockPosition],
            }),
          },
        }

        const caller = createCaller(createTestContext(prisma))
        const result = await caller.positions.list({ purchaseOrderId: PO_ID })

        expect(result).toHaveLength(1)
        expect(result![0]!.articleId).toBe(ARTICLE_ID)
      })
    })

    describe("positions.add", () => {
      it("adds position with auto-fill", async () => {
        const prisma = {
          whPurchaseOrder: {
            findFirst: vi.fn().mockResolvedValue({
              ...mockPO,
              positions: [],
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          whArticle: {
            findFirst: vi.fn().mockResolvedValue({
              id: ARTICLE_ID,
              number: "ART-1",
              name: "Test Article",
              unit: "Stk",
              buyPrice: 5.0,
            }),
          },
          whArticleSupplier: {
            findFirst: vi.fn().mockResolvedValue({
              supplierArticleNumber: "SUP-001",
              buyPrice: 4.5,
              orderUnit: "Stk",
              defaultOrderQty: 20,
            }),
          },
          whPurchaseOrderPosition: {
            count: vi.fn().mockResolvedValue(0),
            create: vi.fn().mockResolvedValue(mockPosition),
            findMany: vi.fn().mockResolvedValue([mockPosition]),
          },
        }

        const caller = createCaller(createTestContext(prisma))
        const result = await caller.positions.add({
          purchaseOrderId: PO_ID,
          articleId: ARTICLE_ID,
          quantity: 10,
        })

        expect(result).toBeDefined()
        expect(result!.articleId).toBe(ARTICLE_ID)
      })

      it("rejects without wh_purchase_orders.edit permission", async () => {
        const prisma = {}
        const caller = createCaller(createTestContext(prisma, [PO_VIEW]))

        await expect(
          caller.positions.add({
            purchaseOrderId: PO_ID,
            articleId: ARTICLE_ID,
            quantity: 10,
          })
        ).rejects.toThrow("Insufficient permissions")
      })
    })

    describe("positions.add FREETEXT", () => {
      it("creates position without article", async () => {
        const freetextPosition = {
          ...mockPosition,
          positionType: "FREETEXT",
          articleId: null,
          freeText: "Special item",
          quantity: 2,
          unitPrice: 25,
          totalPrice: 50,
          article: null,
        }
        const prisma = {
          whPurchaseOrder: {
            findFirst: vi.fn().mockResolvedValue({
              ...mockPO,
              positions: [],
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          whPurchaseOrderPosition: {
            count: vi.fn().mockResolvedValue(0),
            create: vi.fn().mockResolvedValue(freetextPosition),
            findMany: vi.fn().mockResolvedValue([freetextPosition]),
          },
        }

        const caller = createCaller(createTestContext(prisma))
        const result = await caller.positions.add({
          purchaseOrderId: PO_ID,
          positionType: "FREETEXT",
          freeText: "Special item",
          quantity: 2,
          unitPrice: 25,
        })

        expect(result).toBeDefined()
        expect(result!.positionType).toBe("FREETEXT")
        expect(result!.article).toBeNull()
      })
    })

    describe("positions.add TEXT", () => {
      it("creates text-only position", async () => {
        const textPosition = {
          ...mockPosition,
          positionType: "TEXT",
          articleId: null,
          freeText: "Note: deliver before 10am",
          quantity: null,
          unitPrice: null,
          totalPrice: null,
          article: null,
        }
        const prisma = {
          whPurchaseOrder: {
            findFirst: vi.fn().mockResolvedValue({
              ...mockPO,
              positions: [],
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          whPurchaseOrderPosition: {
            count: vi.fn().mockResolvedValue(0),
            create: vi.fn().mockResolvedValue(textPosition),
            findMany: vi.fn().mockResolvedValue([textPosition]),
          },
        }

        const caller = createCaller(createTestContext(prisma))
        const result = await caller.positions.add({
          purchaseOrderId: PO_ID,
          positionType: "TEXT",
          freeText: "Note: deliver before 10am",
        })

        expect(result).toBeDefined()
        expect(result!.totalPrice).toBeNull()
        expect(result!.quantity).toBeNull()
      })
    })

    describe("positions.add totals", () => {
      it("TEXT positions excluded from order totals", async () => {
        const articlePosition = {
          ...mockPosition,
          positionType: "ARTICLE",
          totalPrice: 50,
          vatRate: 19,
        }
        const textPosition = {
          ...mockPosition,
          id: "f2000000-0000-4000-a000-000000000002",
          positionType: "TEXT",
          articleId: null,
          freeText: "Some note",
          quantity: null,
          unitPrice: null,
          totalPrice: null,
          article: null,
        }
        const prisma = {
          whPurchaseOrder: {
            findFirst: vi.fn().mockResolvedValue({
              ...mockPO,
              positions: [],
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          whPurchaseOrderPosition: {
            count: vi.fn().mockResolvedValue(1),
            create: vi.fn().mockResolvedValue(textPosition),
            findMany: vi.fn().mockResolvedValue([articlePosition, textPosition]),
          },
        }

        const caller = createCaller(createTestContext(prisma))
        await caller.positions.add({
          purchaseOrderId: PO_ID,
          positionType: "TEXT",
          freeText: "Some note",
        })

        // Verify recalculateTotals only summed the ARTICLE position
        expect(prisma.whPurchaseOrder.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              subtotalNet: 50, // Only ARTICLE position totalPrice
            }),
          })
        )
      })
    })

    describe("positions.delete", () => {
      it("removes position", async () => {
        const prisma = {
          whPurchaseOrderPosition: {
            findFirst: vi.fn().mockResolvedValue({
              ...mockPosition,
              purchaseOrder: { id: PO_ID, tenantId: TENANT_ID, status: "DRAFT" },
            }),
            delete: vi.fn().mockResolvedValue(mockPosition),
            findMany: vi.fn().mockResolvedValue([]),
          },
          whPurchaseOrder: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        }

        const caller = createCaller(createTestContext(prisma))
        await caller.positions.delete({ id: POSITION_ID })

        // If we get here without throwing, the delete succeeded
        expect(true).toBe(true)
      })
    })
  })
})
