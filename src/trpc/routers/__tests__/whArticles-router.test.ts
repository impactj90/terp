import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { whArticlesRouter } from "../warehouse/articles"
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
const WH_CREATE = permissionIdByKey("wh_articles.create")!
const WH_EDIT = permissionIdByKey("wh_articles.edit")!
const WH_DELETE = permissionIdByKey("wh_articles.delete")!
const WH_GROUPS_MANAGE = permissionIdByKey("wh_article_groups.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ARTICLE_ID = "b1000000-0000-4000-a000-000000000001"

const createCaller = createCallerFactory(whArticlesRouter)

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
  permissions: string[] = [WH_VIEW, WH_CREATE, WH_EDIT, WH_DELETE, WH_GROUPS_MANAGE]
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

const mockArticle = {
  id: ARTICLE_ID,
  tenantId: TENANT_ID,
  number: "ART-1",
  name: "Test Widget",
  description: null,
  descriptionAlt: null,
  groupId: null,
  matchCode: "TEST WIDGET",
  unit: "Stk",
  vatRate: 19.0,
  sellPrice: 99.0,
  buyPrice: 49.0,
  discountGroup: null,
  orderType: null,
  stockTracking: true,
  currentStock: 10,
  minStock: 5,
  warehouseLocation: "A-1",
  images: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdById: USER_ID,
  group: null,
  suppliers: [],
  bomParent: [],
}

// --- Tests ---

describe("warehouse.articles", () => {
  describe("list", () => {
    it("returns paginated articles", async () => {
      const prisma = {
        whArticle: {
          findMany: vi.fn().mockResolvedValue([mockArticle]),
          count: vi.fn().mockResolvedValue(1),
        },
      }

      const caller = createCaller(createTestContext(prisma))
      const result = await caller.list({ page: 1, pageSize: 10 })

      expect(result!.items).toHaveLength(1)
      expect(result!.total).toBe(1)
      expect(result!.items[0]!.name).toBe("Test Widget")
    })

    it("rejects without wh_articles.view permission", async () => {
      const prisma = {
        whArticle: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
      }

      const caller = createCaller(createNoPermContext(prisma))

      await expect(
        caller.list({ page: 1, pageSize: 10 })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  describe("create", () => {
    it("assigns auto-generated number", async () => {
      const prisma = {
        numberSequence: {
          upsert: vi.fn().mockResolvedValue({
            prefix: "ART-",
            nextValue: 2,
          }),
        },
        whArticle: {
          create: vi.fn().mockResolvedValue({
            ...mockArticle,
            number: "ART-1",
          }),
        },
      }

      const caller = createCaller(createTestContext(prisma))
      const result = await caller.create({ name: "New Widget" })

      expect(result).toBeDefined()
      expect(result!.number).toBe("ART-1")
    })

    it("rejects without wh_articles.create permission", async () => {
      const prisma = {
        whArticle: {
          create: vi.fn(),
        },
      }

      const caller = createCaller(createTestContext(prisma, [WH_VIEW]))

      await expect(
        caller.create({ name: "Test" })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  describe("delete", () => {
    it("soft-deletes article", async () => {
      const prisma = {
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(mockArticle),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      }

      const caller = createCaller(createTestContext(prisma))
      await caller.delete({ id: ARTICLE_ID })

      expect(prisma.whArticle.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: false }),
        })
      )
    })
  })

  describe("adjustStock", () => {
    it("updates stock", async () => {
      const prisma = {
        whArticle: {
          findFirst: vi.fn().mockResolvedValue(mockArticle),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      }

      const caller = createCaller(createTestContext(prisma))
      await caller.adjustStock({ id: ARTICLE_ID, quantity: 5 })

      expect(prisma.whArticle.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentStock: { increment: 5 },
          }),
        })
      )
    })
  })

  describe("search", () => {
    it("returns matching articles", async () => {
      const prisma = {
        whArticle: {
          findMany: vi.fn().mockResolvedValue([
            { id: ARTICLE_ID, number: "ART-1", name: "Test Widget", unit: "Stk", sellPrice: 99 },
          ]),
        },
      }

      const caller = createCaller(createTestContext(prisma))
      const result = await caller.search({ query: "ART" })

      expect(result).toHaveLength(1)
      expect(result![0]!.number).toBe("ART-1")
    })
  })

  describe("groups.tree", () => {
    it("returns hierarchical structure", async () => {
      const prisma = {
        whArticleGroup: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "g1",
              tenantId: TENANT_ID,
              parentId: null,
              name: "Root Group",
              sortOrder: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            {
              id: "g2",
              tenantId: TENANT_ID,
              parentId: "g1",
              name: "Child Group",
              sortOrder: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
        },
      }

      const caller = createCaller(createTestContext(prisma))
      const result = await caller.groups.tree()

      expect(result).toHaveLength(1)
      expect(result![0]!.group.name).toBe("Root Group")
      expect(result![0]!.children).toHaveLength(1)
      expect(result![0]!.children[0]!.group.name).toBe("Child Group")
    })
  })
})
