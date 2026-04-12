import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { whArticlePricesRouter } from "../warehouse/articlePrices"
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
const WH_VIEW = permissionIdByKey("wh_articles.view")!
const PL_VIEW = permissionIdByKey("billing_price_lists.view")!
const PL_MANAGE = permissionIdByKey("billing_price_lists.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ARTICLE_ID = "b1000000-0000-4000-a000-000000000001"
const PRICE_LIST_ID = "c1000000-0000-4000-a000-000000000001"
const PRICE_LIST_ID_2 = "c1000000-0000-4000-a000-000000000002"
const ENTRY_ID = "d1000000-0000-4000-a000-000000000001"

const createCaller = createCallerFactory(whArticlePricesRouter)

// --- Helpers ---
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
  permissions: string[] = [WH_VIEW, PL_VIEW, PL_MANAGE]
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

const mockPriceList = {
  id: PRICE_LIST_ID,
  tenantId: TENANT_ID,
  name: "Standard Price List",
  isDefault: true,
  isActive: true,
  validFrom: null,
  validTo: null,
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
  priceList: mockPriceList,
}

// --- Tests ---

describe("warehouse.articlePrices", () => {
  describe("listByArticle", () => {
    it("returns entries for article", async () => {
      const prisma = {
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(mockArticle),
        },
        billingPriceListEntry: {
          findMany: vi.fn().mockResolvedValue([mockEntry]),
        },
      }

      const caller = createCaller(createTestContext(prisma))
      const result = await caller.listByArticle({ articleId: ARTICLE_ID })

      expect(result).toHaveLength(1)
      expect(result![0]!.unitPrice).toBe(99.99)
    })

    it("rejects without wh_articles.view permission", async () => {
      const prisma = {
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(mockArticle),
        },
        billingPriceListEntry: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      }

      const caller = createCaller(createNoPermContext(prisma))

      await expect(
        caller.listByArticle({ articleId: ARTICLE_ID })
      ).rejects.toThrow("Insufficient permissions")
    })

    it("rejects when warehouse module not enabled", async () => {
      const prisma = {
        tenantModule: {
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn().mockResolvedValue(null), // Module NOT enabled
        },
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(mockArticle),
        },
        billingPriceListEntry: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      }

      const ctx = createMockContext({
        prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
        authToken: "test-token",
        user: createUserWithPermissions([WH_VIEW, PL_VIEW, PL_MANAGE], {
          id: USER_ID,
          userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
        }),
        session: createMockSession(),
        tenantId: TENANT_ID,
      })

      const caller = createCaller(ctx)

      await expect(
        caller.listByArticle({ articleId: ARTICLE_ID })
      ).rejects.toThrow(/not enabled/)
    })
  })

  describe("listByPriceList", () => {
    it("returns articles with prices", async () => {
      const prisma = {
        billingPriceList: {
          findFirst: vi.fn().mockResolvedValue(mockPriceList),
        },
        billingPriceListEntry: {
          findMany: vi.fn().mockResolvedValue([{
            ...mockEntry,
            articleId: ARTICLE_ID,
          }]),
        },
        whArticle: {
          findMany: vi.fn().mockResolvedValue([mockArticle]),
        },
      }

      const caller = createCaller(createTestContext(prisma))
      const result = await caller.listByPriceList({ priceListId: PRICE_LIST_ID })

      expect(result).toBeDefined()
      expect(Array.isArray(result)).toBe(true)
    })

    it("rejects without billing_price_lists.view permission", async () => {
      const prisma = {
        billingPriceList: {
          findFirst: vi.fn().mockResolvedValue(mockPriceList),
        },
      }

      const caller = createCaller(createTestContext(prisma, [WH_VIEW])) // no PL_VIEW

      await expect(
        caller.listByPriceList({ priceListId: PRICE_LIST_ID })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  describe("setPrice", () => {
    it("creates/updates price entry", async () => {
      const prisma = {
        billingPriceList: {
          findFirst: vi.fn().mockResolvedValue(mockPriceList),
        },
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(mockArticle),
        },
        billingPriceListEntry: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(mockEntry),
        },
      }

      const caller = createCaller(createTestContext(prisma))
      const result = await caller.setPrice({
        priceListId: PRICE_LIST_ID,
        articleId: ARTICLE_ID,
        unitPrice: 49.99,
      })

      expect(result).toBeDefined()
    })

    it("rejects without billing_price_lists.manage permission", async () => {
      const prisma = {
        billingPriceList: {
          findFirst: vi.fn().mockResolvedValue(mockPriceList),
        },
      }

      const caller = createCaller(createTestContext(prisma, [WH_VIEW, PL_VIEW])) // no PL_MANAGE

      await expect(
        caller.setPrice({
          priceListId: PRICE_LIST_ID,
          articleId: ARTICLE_ID,
          unitPrice: 49.99,
        })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  describe("removePrice", () => {
    it("removes price entry", async () => {
      const prisma = {
        billingPriceList: {
          findFirst: vi.fn().mockResolvedValue(mockPriceList),
        },
        billingPriceListEntry: {
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      }

      const caller = createCaller(createTestContext(prisma))
      const result = await caller.removePrice({
        priceListId: PRICE_LIST_ID,
        articleId: ARTICLE_ID,
      })

      expect(result).toEqual({ removed: 1 })
    })
  })

  describe("bulkSetPrices", () => {
    it("upserts multiple entries", async () => {
      const prisma = {
        billingPriceList: {
          findFirst: vi.fn().mockResolvedValue(mockPriceList),
        },
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(mockArticle),
          findMany: vi.fn().mockResolvedValue([mockArticle]),
        },
        billingPriceListEntry: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(mockEntry),
        },
        $transaction: vi.fn().mockImplementation(async (fn: unknown) => {
          if (typeof fn === "function") {
            const txPrisma = {
              billingPriceListEntry: {
                findFirst: vi.fn().mockResolvedValue(null),
                create: vi.fn().mockResolvedValue(mockEntry),
                update: vi.fn(),
              },
            }
            return fn(txPrisma)
          }
        }),
      }

      const caller = createCaller(createTestContext(prisma))
      const result = await caller.bulkSetPrices({
        priceListId: PRICE_LIST_ID,
        entries: [
          { articleId: ARTICLE_ID, unitPrice: 49.99 },
        ],
      })

      expect(result).toEqual({ created: 1, updated: 0 })
    })
  })

  describe("adjustPrices", () => {
    it("bulk adjusts by percentage", async () => {
      const entry100 = { ...mockEntry, unitPrice: 100.0 }

      const prisma = {
        billingPriceList: {
          findFirst: vi.fn().mockResolvedValue(mockPriceList),
        },
        billingPriceListEntry: {
          findMany: vi.fn().mockResolvedValue([entry100]),
        },
        $transaction: vi.fn().mockImplementation(async (fn: unknown) => {
          if (typeof fn === "function") {
            const txPrisma = {
              billingPriceListEntry: {
                update: vi.fn().mockResolvedValue({ ...entry100, unitPrice: 110.0 }),
              },
            }
            return fn(txPrisma)
          }
        }),
      }

      const caller = createCaller(createTestContext(prisma))
      const result = await caller.adjustPrices({
        priceListId: PRICE_LIST_ID,
        adjustmentPercent: 10,
      })

      expect(result).toEqual({ adjustedCount: 1 })
    })
  })

  describe("copyPriceList", () => {
    it("copies entries between lists", async () => {
      const prisma = {
        billingPriceList: {
          findFirst: vi.fn().mockResolvedValue(mockPriceList),
        },
        billingPriceListEntry: {
          findMany: vi.fn().mockResolvedValue([mockEntry]),
        },
        $transaction: vi.fn().mockImplementation(async (fn: unknown) => {
          if (typeof fn === "function") {
            const txPrisma = {
              billingPriceListEntry: {
                findFirst: vi.fn().mockResolvedValue(null),
                create: vi.fn().mockResolvedValue(mockEntry),
                deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
              },
            }
            return fn(txPrisma)
          }
        }),
      }

      const caller = createCaller(createTestContext(prisma))
      const result = await caller.copyPriceList({
        sourceId: PRICE_LIST_ID,
        targetId: PRICE_LIST_ID_2,
        overwrite: false,
      })

      expect(result).toEqual({ copied: 1, skipped: 0 })
    })
  })
})
