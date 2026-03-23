import { describe, it, expect, vi } from "vitest"
import * as service from "../wh-article-price-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Constants ---
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ARTICLE_ID = "b1000000-0000-4000-a000-000000000001"
const ARTICLE_ID_2 = "b1000000-0000-4000-a000-000000000002"
const PRICE_LIST_ID = "c1000000-0000-4000-a000-000000000001"
const PRICE_LIST_ID_2 = "c1000000-0000-4000-a000-000000000002"
const ENTRY_ID = "d1000000-0000-4000-a000-000000000001"
const GROUP_ID = "e1000000-0000-4000-a000-000000000001"

// --- Mock Data ---
const mockPriceList = {
  id: PRICE_LIST_ID,
  tenantId: TENANT_ID,
  name: "Standard Price List",
  isDefault: true,
  isActive: true,
  validFrom: null,
  validTo: null,
  description: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdById: null,
}

const mockPriceList2 = {
  ...mockPriceList,
  id: PRICE_LIST_ID_2,
  name: "VIP Price List",
  isDefault: false,
}

const mockArticle = {
  id: ARTICLE_ID,
  tenantId: TENANT_ID,
  number: "ART-1",
  name: "Test Article",
  unit: "Stk",
  sellPrice: 100.0,
  groupId: null,
}

const mockArticle2 = {
  ...mockArticle,
  id: ARTICLE_ID_2,
  number: "ART-2",
  name: "Test Article 2",
}

const mockEntry = {
  id: ENTRY_ID,
  priceListId: PRICE_LIST_ID,
  articleId: ARTICLE_ID,
  itemKey: null,
  description: null,
  unitPrice: 99.99,
  minQuantity: null,
  unit: "Stk",
  validFrom: null,
  validTo: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    billingPriceList: {
      findFirst: vi.fn().mockResolvedValue(mockPriceList),
    },
    billingPriceListEntry: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([mockEntry]),
      create: vi.fn().mockResolvedValue(mockEntry),
      update: vi.fn().mockResolvedValue(mockEntry),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    whArticle: {
      findFirst: vi.fn().mockResolvedValue(mockArticle),
      findMany: vi.fn().mockResolvedValue([mockArticle]),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn().mockImplementation(async (fn: (tx: PrismaClient) => Promise<unknown>) => {
      // The transaction callback receives the same prisma mock
      const self = createMockPrisma(overrides)
      return fn(self as unknown as PrismaClient)
    }),
    ...overrides,
  } as unknown as PrismaClient
}

const audit = { userId: USER_ID, ipAddress: null, userAgent: null }

// --- Tests ---

describe("wh-article-price-service", () => {
  describe("listByArticle", () => {
    it("returns entries across all price lists for an article", async () => {
      const entriesWithPriceList = [
        {
          ...mockEntry,
          priceList: {
            id: PRICE_LIST_ID,
            name: "Standard Price List",
            isDefault: true,
            isActive: true,
            validFrom: null,
            validTo: null,
          },
        },
      ]
      const prisma = createMockPrisma({
        billingPriceListEntry: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue(entriesWithPriceList),
          create: vi.fn(),
          update: vi.fn(),
          deleteMany: vi.fn(),
        },
      })

      const result = await service.listByArticle(prisma, TENANT_ID, ARTICLE_ID)
      expect(result).toHaveLength(1)
      expect(result[0]).toHaveProperty("priceList")
      expect(result[0]!.priceList.name).toBe("Standard Price List")
    })

    it("throws WhArticlePriceNotFoundError if article not found", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
        },
      })

      await expect(
        service.listByArticle(prisma, TENANT_ID, ARTICLE_ID)
      ).rejects.toThrow(service.WhArticlePriceNotFoundError)
    })
  })

  describe("listByPriceList", () => {
    it("returns article entries in a price list", async () => {
      const prisma = createMockPrisma()

      const result = await service.listByPriceList(prisma, TENANT_ID, PRICE_LIST_ID)
      expect(result).toBeDefined()
      expect(Array.isArray(result)).toBe(true)
    })

    it("throws WhArticlePriceNotFoundError if price list not found", async () => {
      const prisma = createMockPrisma({
        billingPriceList: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      })

      await expect(
        service.listByPriceList(prisma, TENANT_ID, PRICE_LIST_ID)
      ).rejects.toThrow(service.WhArticlePriceNotFoundError)
    })

    it("filters by search term", async () => {
      const prisma = createMockPrisma()

      // Should not throw
      const result = await service.listByPriceList(prisma, TENANT_ID, PRICE_LIST_ID, { search: "ART" })
      expect(result).toBeDefined()
      // Verify the whArticle.findMany was called with search filter
      expect(prisma.whArticle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ number: expect.objectContaining({ contains: "ART" }) }),
            ]),
          }),
        })
      )
    })
  })

  describe("setPrice", () => {
    it("creates entry if not exists", async () => {
      const prisma = createMockPrisma()

      const result = await service.setPrice(prisma, TENANT_ID, {
        priceListId: PRICE_LIST_ID,
        articleId: ARTICLE_ID,
        unitPrice: 49.99,
      }, audit)

      expect(result).toBeDefined()
      expect(prisma.billingPriceListEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            priceListId: PRICE_LIST_ID,
            articleId: ARTICLE_ID,
            unitPrice: 49.99,
          }),
        })
      )
    })

    it("updates entry if exists (same articleId + minQuantity)", async () => {
      const prisma = createMockPrisma({
        billingPriceListEntry: {
          findFirst: vi.fn().mockResolvedValue(mockEntry),
          findMany: vi.fn().mockResolvedValue([mockEntry]),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue({ ...mockEntry, unitPrice: 79.99 }),
          deleteMany: vi.fn(),
        },
      })

      const result = await service.setPrice(prisma, TENANT_ID, {
        priceListId: PRICE_LIST_ID,
        articleId: ARTICLE_ID,
        unitPrice: 79.99,
      }, audit)

      expect(result).toBeDefined()
      expect(prisma.billingPriceListEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ENTRY_ID },
          data: expect.objectContaining({ unitPrice: 79.99 }),
        })
      )
    })

    it("throws if price list not found", async () => {
      const prisma = createMockPrisma({
        billingPriceList: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      })

      await expect(
        service.setPrice(prisma, TENANT_ID, {
          priceListId: PRICE_LIST_ID,
          articleId: ARTICLE_ID,
          unitPrice: 49.99,
        })
      ).rejects.toThrow(service.WhArticlePriceNotFoundError)
    })

    it("throws if article not found", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
        },
      })

      await expect(
        service.setPrice(prisma, TENANT_ID, {
          priceListId: PRICE_LIST_ID,
          articleId: ARTICLE_ID,
          unitPrice: 49.99,
        })
      ).rejects.toThrow(service.WhArticlePriceNotFoundError)
    })
  })

  describe("removePrice", () => {
    it("removes all entries for article in price list", async () => {
      const prisma = createMockPrisma()

      const result = await service.removePrice(prisma, TENANT_ID, {
        priceListId: PRICE_LIST_ID,
        articleId: ARTICLE_ID,
      }, audit)

      expect(result).toEqual({ removed: 1 })
      expect(prisma.billingPriceListEntry.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            priceListId: PRICE_LIST_ID,
            articleId: ARTICLE_ID,
          },
        })
      )
    })

    it("throws WhArticlePriceNotFoundError if no entries found", async () => {
      const prisma = createMockPrisma({
        billingPriceListEntry: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn(),
          update: vi.fn(),
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      })

      await expect(
        service.removePrice(prisma, TENANT_ID, {
          priceListId: PRICE_LIST_ID,
          articleId: ARTICLE_ID,
        })
      ).rejects.toThrow(service.WhArticlePriceNotFoundError)
    })
  })

  describe("bulkSetPrices", () => {
    it("upserts multiple entries in a transaction", async () => {
      const txCreateMock = vi.fn().mockResolvedValue(mockEntry)
      const txFindFirstMock = vi.fn().mockResolvedValue(null) // no existing entries

      const prisma = createMockPrisma({
        $transaction: vi.fn().mockImplementation(async (fn: (tx: PrismaClient) => Promise<unknown>) => {
          const txPrisma = {
            billingPriceListEntry: {
              findFirst: txFindFirstMock,
              create: txCreateMock,
              update: vi.fn(),
            },
          }
          return fn(txPrisma as unknown as PrismaClient)
        }),
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(mockArticle),
          findMany: vi.fn().mockResolvedValue([mockArticle, mockArticle2]),
        },
      })

      const result = await service.bulkSetPrices(
        prisma, TENANT_ID, PRICE_LIST_ID,
        [
          { articleId: ARTICLE_ID, unitPrice: 49.99 },
          { articleId: ARTICLE_ID_2, unitPrice: 59.99 },
        ],
        audit
      )

      expect(result).toEqual({ created: 2, updated: 0 })
    })

    it("returns created and updated counts", async () => {
      const txFindFirstMock = vi.fn()
        .mockResolvedValueOnce(mockEntry) // first entry exists
        .mockResolvedValueOnce(null) // second entry is new
      const txCreateMock = vi.fn().mockResolvedValue(mockEntry)
      const txUpdateMock = vi.fn().mockResolvedValue(mockEntry)

      const prisma = createMockPrisma({
        $transaction: vi.fn().mockImplementation(async (fn: (tx: PrismaClient) => Promise<unknown>) => {
          const txPrisma = {
            billingPriceListEntry: {
              findFirst: txFindFirstMock,
              create: txCreateMock,
              update: txUpdateMock,
            },
          }
          return fn(txPrisma as unknown as PrismaClient)
        }),
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(mockArticle),
          findMany: vi.fn().mockResolvedValue([mockArticle, mockArticle2]),
        },
      })

      const result = await service.bulkSetPrices(
        prisma, TENANT_ID, PRICE_LIST_ID,
        [
          { articleId: ARTICLE_ID, unitPrice: 49.99 },
          { articleId: ARTICLE_ID_2, unitPrice: 59.99 },
        ],
        audit
      )

      expect(result).toEqual({ created: 1, updated: 1 })
    })
  })

  describe("copyPriceList", () => {
    it("copies all entries from source to target", async () => {
      const sourceEntries = [
        { ...mockEntry, articleId: ARTICLE_ID },
        { ...mockEntry, id: "en2", articleId: ARTICLE_ID_2 },
      ]
      const txCreateMock = vi.fn().mockResolvedValue(mockEntry)

      const prisma = createMockPrisma({
        billingPriceList: {
          findFirst: vi.fn().mockResolvedValue(mockPriceList),
        },
        billingPriceListEntry: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue(sourceEntries),
          create: vi.fn(),
          update: vi.fn(),
          deleteMany: vi.fn(),
        },
        $transaction: vi.fn().mockImplementation(async (fn: (tx: PrismaClient) => Promise<unknown>) => {
          const txPrisma = {
            billingPriceListEntry: {
              findFirst: vi.fn().mockResolvedValue(null),
              create: txCreateMock,
              deleteMany: vi.fn(),
            },
          }
          return fn(txPrisma as unknown as PrismaClient)
        }),
      })

      const result = await service.copyPriceList(prisma, TENANT_ID, {
        sourceId: PRICE_LIST_ID,
        targetId: PRICE_LIST_ID_2,
        overwrite: true,
      }, audit)

      expect(result).toEqual({ copied: 2, skipped: 0 })
    })

    it("with overwrite=false skips existing entries", async () => {
      const sourceEntries = [
        { ...mockEntry, articleId: ARTICLE_ID },
        { ...mockEntry, id: "en2", articleId: ARTICLE_ID_2 },
      ]
      const txFindFirstMock = vi.fn()
        .mockResolvedValueOnce(mockEntry) // first entry exists in target
        .mockResolvedValueOnce(null) // second entry doesn't
      const txCreateMock = vi.fn().mockResolvedValue(mockEntry)

      const prisma = createMockPrisma({
        billingPriceList: {
          findFirst: vi.fn().mockResolvedValue(mockPriceList),
        },
        billingPriceListEntry: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue(sourceEntries),
          create: vi.fn(),
          update: vi.fn(),
          deleteMany: vi.fn(),
        },
        $transaction: vi.fn().mockImplementation(async (fn: (tx: PrismaClient) => Promise<unknown>) => {
          const txPrisma = {
            billingPriceListEntry: {
              findFirst: txFindFirstMock,
              create: txCreateMock,
              deleteMany: vi.fn(),
            },
          }
          return fn(txPrisma as unknown as PrismaClient)
        }),
      })

      const result = await service.copyPriceList(prisma, TENANT_ID, {
        sourceId: PRICE_LIST_ID,
        targetId: PRICE_LIST_ID_2,
        overwrite: false,
      }, audit)

      expect(result).toEqual({ copied: 1, skipped: 1 })
    })

    it("with overwrite=true replaces existing entries", async () => {
      const sourceEntries = [{ ...mockEntry, articleId: ARTICLE_ID }]
      const txDeleteManyMock = vi.fn().mockResolvedValue({ count: 3 })
      const txCreateMock = vi.fn().mockResolvedValue(mockEntry)

      const prisma = createMockPrisma({
        billingPriceList: {
          findFirst: vi.fn().mockResolvedValue(mockPriceList),
        },
        billingPriceListEntry: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue(sourceEntries),
          create: vi.fn(),
          update: vi.fn(),
          deleteMany: vi.fn(),
        },
        $transaction: vi.fn().mockImplementation(async (fn: (tx: PrismaClient) => Promise<unknown>) => {
          const txPrisma = {
            billingPriceListEntry: {
              findFirst: vi.fn().mockResolvedValue(null),
              create: txCreateMock,
              deleteMany: txDeleteManyMock,
            },
          }
          return fn(txPrisma as unknown as PrismaClient)
        }),
      })

      const result = await service.copyPriceList(prisma, TENANT_ID, {
        sourceId: PRICE_LIST_ID,
        targetId: PRICE_LIST_ID_2,
        overwrite: true,
      }, audit)

      expect(result).toEqual({ copied: 1, skipped: 0 })
      expect(txDeleteManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            priceListId: PRICE_LIST_ID_2,
            articleId: { not: null },
          }),
        })
      )
    })
  })

  describe("adjustPrices", () => {
    it("adjusts by positive percentage (+5%)", async () => {
      const entry100 = { ...mockEntry, unitPrice: 100.0 }
      const txUpdateMock = vi.fn().mockResolvedValue({ ...entry100, unitPrice: 105.0 })

      const prisma = createMockPrisma({
        billingPriceListEntry: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([entry100]),
          create: vi.fn(),
          update: vi.fn(),
          deleteMany: vi.fn(),
        },
        $transaction: vi.fn().mockImplementation(async (fn: (tx: PrismaClient) => Promise<unknown>) => {
          const txPrisma = {
            billingPriceListEntry: {
              update: txUpdateMock,
            },
          }
          return fn(txPrisma as unknown as PrismaClient)
        }),
      })

      const result = await service.adjustPrices(prisma, TENANT_ID, {
        priceListId: PRICE_LIST_ID,
        adjustmentPercent: 5,
      }, audit)

      expect(result).toEqual({ adjustedCount: 1 })
      expect(txUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { unitPrice: 105.0 },
        })
      )
    })

    it("adjusts by negative percentage (-3%)", async () => {
      const entry100 = { ...mockEntry, unitPrice: 100.0 }
      const txUpdateMock = vi.fn().mockResolvedValue({ ...entry100, unitPrice: 97.0 })

      const prisma = createMockPrisma({
        billingPriceListEntry: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([entry100]),
          create: vi.fn(),
          update: vi.fn(),
          deleteMany: vi.fn(),
        },
        $transaction: vi.fn().mockImplementation(async (fn: (tx: PrismaClient) => Promise<unknown>) => {
          const txPrisma = {
            billingPriceListEntry: {
              update: txUpdateMock,
            },
          }
          return fn(txPrisma as unknown as PrismaClient)
        }),
      })

      const result = await service.adjustPrices(prisma, TENANT_ID, {
        priceListId: PRICE_LIST_ID,
        adjustmentPercent: -3,
      }, audit)

      expect(result).toEqual({ adjustedCount: 1 })
      expect(txUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { unitPrice: 97.0 },
        })
      )
    })

    it("filters by article group when articleGroupId provided", async () => {
      const groupArticle = { id: ARTICLE_ID }
      const entry = { ...mockEntry, unitPrice: 100.0 }

      const prisma = createMockPrisma({
        billingPriceListEntry: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([entry]),
          create: vi.fn(),
          update: vi.fn(),
          deleteMany: vi.fn(),
        },
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(mockArticle),
          findMany: vi.fn().mockResolvedValue([groupArticle]),
        },
        $transaction: vi.fn().mockImplementation(async (fn: (tx: PrismaClient) => Promise<unknown>) => {
          const txPrisma = {
            billingPriceListEntry: {
              update: vi.fn().mockResolvedValue(entry),
            },
          }
          return fn(txPrisma as unknown as PrismaClient)
        }),
      })

      const result = await service.adjustPrices(prisma, TENANT_ID, {
        priceListId: PRICE_LIST_ID,
        adjustmentPercent: 10,
        articleGroupId: GROUP_ID,
      }, audit)

      expect(result).toEqual({ adjustedCount: 1 })
      // Verify article lookup was done with group filter
      expect(prisma.whArticle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            groupId: GROUP_ID,
          }),
        })
      )
    })

    it("rounds adjusted prices to 2 decimal places", async () => {
      // 33.33 * 1.10 = 36.663 -> should round to 36.66
      const entry = { ...mockEntry, unitPrice: 33.33 }
      const txUpdateMock = vi.fn().mockResolvedValue(entry)

      const prisma = createMockPrisma({
        billingPriceListEntry: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([entry]),
          create: vi.fn(),
          update: vi.fn(),
          deleteMany: vi.fn(),
        },
        $transaction: vi.fn().mockImplementation(async (fn: (tx: PrismaClient) => Promise<unknown>) => {
          const txPrisma = {
            billingPriceListEntry: {
              update: txUpdateMock,
            },
          }
          return fn(txPrisma as unknown as PrismaClient)
        }),
      })

      await service.adjustPrices(prisma, TENANT_ID, {
        priceListId: PRICE_LIST_ID,
        adjustmentPercent: 10,
      }, audit)

      expect(txUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { unitPrice: 36.66 },
        })
      )
    })
  })

  // =========================================================================
  // TENANT ISOLATION TESTS
  // =========================================================================
  describe("tenant isolation", () => {
    const OTHER_TENANT_ID = "ff000000-0000-4000-a000-000000000999"

    it("listByArticle rejects article from another tenant", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
        },
      })
      await expect(
        service.listByArticle(prisma, OTHER_TENANT_ID, ARTICLE_ID)
      ).rejects.toThrow(service.WhArticlePriceNotFoundError)
    })

    it("listByPriceList rejects price list from another tenant", async () => {
      const prisma = createMockPrisma({
        billingPriceList: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      })
      await expect(
        service.listByPriceList(prisma, OTHER_TENANT_ID, PRICE_LIST_ID)
      ).rejects.toThrow(service.WhArticlePriceNotFoundError)
    })

    it("setPrice rejects price list from another tenant", async () => {
      const prisma = createMockPrisma({
        billingPriceList: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      })
      await expect(
        service.setPrice(prisma, OTHER_TENANT_ID, {
          priceListId: PRICE_LIST_ID,
          articleId: ARTICLE_ID,
          unitPrice: 49.99,
        })
      ).rejects.toThrow(service.WhArticlePriceNotFoundError)
    })

    it("setPrice rejects article from another tenant", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
        },
      })
      await expect(
        service.setPrice(prisma, OTHER_TENANT_ID, {
          priceListId: PRICE_LIST_ID,
          articleId: ARTICLE_ID,
          unitPrice: 49.99,
        })
      ).rejects.toThrow(service.WhArticlePriceNotFoundError)
    })

    it("removePrice rejects price list from another tenant", async () => {
      const prisma = createMockPrisma({
        billingPriceList: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      })
      await expect(
        service.removePrice(prisma, OTHER_TENANT_ID, {
          priceListId: PRICE_LIST_ID,
          articleId: ARTICLE_ID,
        })
      ).rejects.toThrow(service.WhArticlePriceNotFoundError)
    })

    it("copyPriceList rejects source from another tenant", async () => {
      const prisma = createMockPrisma({
        billingPriceList: {
          findFirst: vi.fn().mockResolvedValue(null), // source not found
        },
      })
      await expect(
        service.copyPriceList(prisma, OTHER_TENANT_ID, {
          sourceId: PRICE_LIST_ID,
          targetId: PRICE_LIST_ID_2,
        })
      ).rejects.toThrow(service.WhArticlePriceNotFoundError)
    })

    it("copyPriceList rejects target from another tenant", async () => {
      const prisma = createMockPrisma({
        billingPriceList: {
          findFirst: vi.fn()
            .mockResolvedValueOnce(mockPriceList) // source OK
            .mockResolvedValueOnce(null), // target not found
        },
      })
      await expect(
        service.copyPriceList(prisma, OTHER_TENANT_ID, {
          sourceId: PRICE_LIST_ID,
          targetId: PRICE_LIST_ID_2,
        })
      ).rejects.toThrow(service.WhArticlePriceNotFoundError)
    })

    it("adjustPrices rejects price list from another tenant", async () => {
      const prisma = createMockPrisma({
        billingPriceList: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      })
      await expect(
        service.adjustPrices(prisma, OTHER_TENANT_ID, {
          priceListId: PRICE_LIST_ID,
          adjustmentPercent: 5,
        })
      ).rejects.toThrow(service.WhArticlePriceNotFoundError)
    })
  })
})
