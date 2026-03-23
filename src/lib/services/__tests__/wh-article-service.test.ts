import { describe, it, expect, vi } from "vitest"
import * as service from "../wh-article-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Constants ---
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ARTICLE_ID = "b1000000-0000-4000-a000-000000000001"
const ARTICLE_ID_2 = "b1000000-0000-4000-a000-000000000002"
const ARTICLE_ID_3 = "b1000000-0000-4000-a000-000000000003"
const SUPPLIER_ID = "c1000000-0000-4000-a000-000000000001"

const mockArticle = {
  id: ARTICLE_ID,
  tenantId: TENANT_ID,
  number: "ART-1",
  name: "Test Article",
  description: null,
  descriptionAlt: null,
  groupId: null,
  matchCode: "TEST ARTICLE",
  unit: "Stk",
  vatRate: 19.0,
  sellPrice: 100.0,
  buyPrice: 50.0,
  discountGroup: null,
  orderType: null,
  stockTracking: true,
  currentStock: 10,
  minStock: 5,
  warehouseLocation: "A-1-01",
  images: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdById: USER_ID,
  group: null,
  suppliers: [],
  bomParent: [],
}

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    whArticle: {
      findFirst: vi.fn().mockResolvedValue(mockArticle),
      findMany: vi.fn().mockResolvedValue([mockArticle]),
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn().mockResolvedValue(mockArticle),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    whArticleGroup: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    whArticleSupplier: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    whBillOfMaterial: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    crmAddress: {
      findFirst: vi.fn(),
    },
    numberSequence: {
      upsert: vi.fn().mockResolvedValue({
        tenantId: TENANT_ID,
        key: "article",
        prefix: "ART-",
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

describe("wh-article-service", () => {
  describe("create", () => {
    it("generates article number via NumberSequence", async () => {
      const prisma = createMockPrisma()
      const result = await service.create(
        prisma,
        TENANT_ID,
        { name: "New Article" },
        USER_ID,
        audit
      )
      expect(result).toBeDefined()
      // NumberSequence upsert should have been called
      expect(prisma.numberSequence.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId_key: { tenantId: TENANT_ID, key: "article" } },
        })
      )
    })

    it("auto-generates matchCode from name when not provided", async () => {
      const prisma = createMockPrisma()
      await service.create(prisma, TENANT_ID, { name: "Test Widget Pro" }, USER_ID)

      // Check that the article was created with matchCode derived from name
      expect((prisma.whArticle.create as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            matchCode: "TEST WIDGET PRO",
          }),
        })
      )
    })

    it("rejects empty name", async () => {
      const prisma = createMockPrisma()
      await expect(
        service.create(prisma, TENANT_ID, { name: "  " }, USER_ID)
      ).rejects.toThrow(service.WhArticleValidationError)
    })
  })

  describe("list", () => {
    it("delegates to repository with filters", async () => {
      const prisma = createMockPrisma()
      const result = await service.list(prisma, TENANT_ID, { page: 1, pageSize: 25 })
      expect(result).toHaveProperty("items")
      expect(result).toHaveProperty("total")
    })
  })

  describe("remove (soft-delete)", () => {
    it("sets isActive to false", async () => {
      const prisma = createMockPrisma()
      await service.remove(prisma, TENANT_ID, ARTICLE_ID, audit)
      expect(prisma.whArticle.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: false }),
        })
      )
    })

    it("throws WhArticleNotFoundError if not found", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(null),
          updateMany: vi.fn(),
          deleteMany: vi.fn(),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
        },
      })
      await expect(
        service.remove(prisma, TENANT_ID, ARTICLE_ID, audit)
      ).rejects.toThrow(service.WhArticleNotFoundError)
    })
  })

  describe("hardDelete", () => {
    it("deletes article when no BOM references exist", async () => {
      const prisma = createMockPrisma({
        whBillOfMaterial: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      })
      const result = await service.hardDelete(prisma, TENANT_ID, ARTICLE_ID, audit)
      expect(result).toBe(true)
      expect(prisma.whArticle.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ARTICLE_ID, tenantId: TENANT_ID },
        })
      )
    })
  })

  describe("restoreArticle", () => {
    it("sets isActive to true", async () => {
      const prisma = createMockPrisma()
      await service.restoreArticle(prisma, TENANT_ID, ARTICLE_ID, audit)
      expect(prisma.whArticle.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: true }),
        })
      )
    })
  })

  describe("adjustStock", () => {
    it("updates currentStock by delta", async () => {
      const prisma = createMockPrisma()
      await service.adjustStock(prisma, TENANT_ID, ARTICLE_ID, 5, "Restock", audit)
      expect(prisma.whArticle.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentStock: { increment: 5 },
          }),
        })
      )
    })

    it("throws if stockTracking is false", async () => {
      const noTrackingArticle = { ...mockArticle, stockTracking: false }
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(noTrackingArticle),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          deleteMany: vi.fn(),
        },
      })
      await expect(
        service.adjustStock(prisma, TENANT_ID, ARTICLE_ID, 5, undefined, audit)
      ).rejects.toThrow(service.WhArticleValidationError)
    })
  })

  describe("search", () => {
    it("returns articles matching number or name", async () => {
      const prisma = createMockPrisma()
      const result = await service.searchArticles(prisma, TENANT_ID, "ART")
      expect(result).toBeDefined()
      expect(prisma.whArticle.findMany).toHaveBeenCalled()
    })
  })

  describe("BOM operations", () => {
    it("adds component to assembly", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn()
            .mockResolvedValueOnce({ ...mockArticle, id: ARTICLE_ID }) // parent
            .mockResolvedValueOnce({ ...mockArticle, id: ARTICLE_ID_2 }), // child
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          updateMany: vi.fn(),
          deleteMany: vi.fn(),
        },
        whBillOfMaterial: {
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockResolvedValue({
            id: "bom1",
            parentArticleId: ARTICLE_ID,
            childArticleId: ARTICLE_ID_2,
            quantity: 2,
            sortOrder: 0,
            notes: null,
            createdAt: new Date(),
          }),
        },
      })

      const result = await service.addBom(prisma, TENANT_ID, {
        parentArticleId: ARTICLE_ID,
        childArticleId: ARTICLE_ID_2,
        quantity: 2,
      })
      expect(result).toBeDefined()
      expect(result.parentArticleId).toBe(ARTICLE_ID)
    })

    it("rejects self-reference (parentArticleId === childArticleId)", async () => {
      const prisma = createMockPrisma()
      await expect(
        service.addBom(prisma, TENANT_ID, {
          parentArticleId: ARTICLE_ID,
          childArticleId: ARTICLE_ID,
          quantity: 1,
        })
      ).rejects.toThrow(service.WhArticleValidationError)
    })

    it("rejects transitive circular reference", async () => {
      // A -> B -> C, trying to add C -> A should fail
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn()
            .mockResolvedValueOnce({ ...mockArticle, id: ARTICLE_ID_3 }) // parent (C)
            .mockResolvedValueOnce({ ...mockArticle, id: ARTICLE_ID }), // child (A)
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          updateMany: vi.fn(),
          deleteMany: vi.fn(),
        },
        whBillOfMaterial: {
          findMany: vi.fn()
            // First call: find BOM children of A (returns B)
            .mockResolvedValueOnce([{ childArticleId: ARTICLE_ID_2 }])
            // Second call: find BOM children of B (returns C)
            .mockResolvedValueOnce([{ childArticleId: ARTICLE_ID_3 }])
            // Third call: find BOM children of C (returns nothing)
            .mockResolvedValueOnce([]),
          create: vi.fn(),
        },
      })

      await expect(
        service.addBom(prisma, TENANT_ID, {
          parentArticleId: ARTICLE_ID_3,
          childArticleId: ARTICLE_ID,
          quantity: 1,
        })
      ).rejects.toThrow(service.WhArticleValidationError)
    })
  })

  // =========================================================================
  // TENANT ISOLATION TESTS
  // =========================================================================
  describe("tenant isolation", () => {
    const OTHER_TENANT_ID = "ff000000-0000-4000-a000-000000000999"
    const SUPPLIER_LINK_ID = "s1000000-0000-4000-a000-000000000001"
    const BOM_ID = "bom00000-0000-4000-a000-000000000001"

    it("getById returns nothing for article from another tenant", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(null), // not found for other tenant
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          updateMany: vi.fn(),
          deleteMany: vi.fn(),
        },
      })
      await expect(
        service.getById(prisma, OTHER_TENANT_ID, ARTICLE_ID)
      ).rejects.toThrow(service.WhArticleNotFoundError)
    })

    it("update rejects article from another tenant", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(null), // tenant mismatch
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          updateMany: vi.fn(),
          deleteMany: vi.fn(),
        },
      })
      await expect(
        service.update(prisma, OTHER_TENANT_ID, { id: ARTICLE_ID, name: "Hacked" })
      ).rejects.toThrow(service.WhArticleNotFoundError)
    })

    it("remove rejects article from another tenant", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          updateMany: vi.fn(),
          deleteMany: vi.fn(),
        },
      })
      await expect(
        service.remove(prisma, OTHER_TENANT_ID, ARTICLE_ID)
      ).rejects.toThrow(service.WhArticleNotFoundError)
    })

    it("listSuppliers rejects article from another tenant", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          updateMany: vi.fn(),
          deleteMany: vi.fn(),
        },
      })
      await expect(
        service.listSuppliers(prisma, OTHER_TENANT_ID, ARTICLE_ID)
      ).rejects.toThrow(service.WhArticleNotFoundError)
    })

    it("updateSupplier rejects supplier link from another tenant", async () => {
      const prisma = createMockPrisma({
        whArticleSupplier: {
          findFirst: vi.fn().mockResolvedValue(null), // tenant mismatch
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        },
      })
      await expect(
        service.updateSupplier(prisma, OTHER_TENANT_ID, SUPPLIER_LINK_ID, { isPrimary: true })
      ).rejects.toThrow(service.WhArticleNotFoundError)
    })

    it("removeSupplier rejects supplier link from another tenant", async () => {
      const prisma = createMockPrisma({
        whArticleSupplier: {
          findFirst: vi.fn().mockResolvedValue(null), // tenant mismatch
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        },
      })
      await expect(
        service.removeSupplier(prisma, OTHER_TENANT_ID, SUPPLIER_LINK_ID)
      ).rejects.toThrow(service.WhArticleNotFoundError)
    })

    it("listBom rejects article from another tenant", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          updateMany: vi.fn(),
          deleteMany: vi.fn(),
        },
      })
      await expect(
        service.listBom(prisma, OTHER_TENANT_ID, ARTICLE_ID)
      ).rejects.toThrow(service.WhArticleNotFoundError)
    })

    it("updateBom rejects BOM entry from another tenant", async () => {
      const prisma = createMockPrisma({
        whBillOfMaterial: {
          findFirst: vi.fn().mockResolvedValue(null), // tenant mismatch
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        },
      })
      await expect(
        service.updateBom(prisma, OTHER_TENANT_ID, BOM_ID, { quantity: 99 })
      ).rejects.toThrow(service.WhArticleNotFoundError)
    })

    it("removeBom rejects BOM entry from another tenant", async () => {
      const prisma = createMockPrisma({
        whBillOfMaterial: {
          findFirst: vi.fn().mockResolvedValue(null), // tenant mismatch
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        },
      })
      await expect(
        service.removeBom(prisma, OTHER_TENANT_ID, BOM_ID)
      ).rejects.toThrow(service.WhArticleNotFoundError)
    })

    it("adjustStock rejects article from another tenant", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          updateMany: vi.fn(),
          deleteMany: vi.fn(),
        },
      })
      await expect(
        service.adjustStock(prisma, OTHER_TENANT_ID, ARTICLE_ID, 10)
      ).rejects.toThrow(service.WhArticleNotFoundError)
    })

    it("addBom rejects parent article from another tenant", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(null), // parent not found for other tenant
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          updateMany: vi.fn(),
          deleteMany: vi.fn(),
        },
      })
      await expect(
        service.addBom(prisma, OTHER_TENANT_ID, {
          parentArticleId: ARTICLE_ID,
          childArticleId: ARTICLE_ID_2,
          quantity: 1,
        })
      ).rejects.toThrow(service.WhArticleNotFoundError)
    })

    it("addSupplier rejects article from another tenant", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(null), // article not found for other tenant
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          updateMany: vi.fn(),
          deleteMany: vi.fn(),
        },
      })
      await expect(
        service.addSupplier(prisma, OTHER_TENANT_ID, {
          articleId: ARTICLE_ID,
          supplierId: SUPPLIER_ID,
        })
      ).rejects.toThrow(service.WhArticleNotFoundError)
    })
  })

  describe("supplier operations", () => {
    it("adds supplier to article", async () => {
      const prisma = createMockPrisma({
        crmAddress: {
          findFirst: vi.fn().mockResolvedValue({
            id: SUPPLIER_ID,
            type: "SUPPLIER",
          }),
        },
        whArticleSupplier: {
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockResolvedValue({
            id: "sup1",
            articleId: ARTICLE_ID,
            supplierId: SUPPLIER_ID,
            isPrimary: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        },
      })

      const result = await service.addSupplier(prisma, TENANT_ID, {
        articleId: ARTICLE_ID,
        supplierId: SUPPLIER_ID,
      })
      expect(result).toBeDefined()
      expect(result.articleId).toBe(ARTICLE_ID)
    })

    it("validates supplier is SUPPLIER or BOTH type", async () => {
      const prisma = createMockPrisma({
        crmAddress: {
          findFirst: vi.fn().mockResolvedValue({
            id: SUPPLIER_ID,
            type: "CUSTOMER",
          }),
        },
      })

      await expect(
        service.addSupplier(prisma, TENANT_ID, {
          articleId: ARTICLE_ID,
          supplierId: SUPPLIER_ID,
        })
      ).rejects.toThrow(service.WhArticleValidationError)
    })
  })
})
