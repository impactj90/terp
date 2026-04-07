import { describe, it, expect, vi, beforeEach } from "vitest"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Constants ---
const TENANT_ID = "a0000000-0000-4000-a000-000000000200"
const OTHER_TENANT_ID = "ff000000-0000-4000-a000-000000000999"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const STOCKTAKE_ID = "st000000-0000-4000-a000-000000000001"
const POSITION_ID = "sp000000-0000-4000-a000-000000000001"
const POSITION_ID_2 = "sp000000-0000-4000-a000-000000000002"
const POSITION_ID_3 = "sp000000-0000-4000-a000-000000000003"
const ARTICLE_ID = "ar000000-0000-4000-a000-000000000001"
const ARTICLE_ID_2 = "ar000000-0000-4000-a000-000000000002"

// --- Mock Data ---

const mockStocktake = {
  id: STOCKTAKE_ID,
  tenantId: TENANT_ID,
  number: "INV-1",
  name: "Q1 Inventory",
  description: "Quarterly inventory count",
  status: "DRAFT",
  referenceDate: new Date("2026-04-01"),
  scope: "ALL",
  scopeFilter: null,
  notes: null,
  createdById: USER_ID,
  completedAt: null,
  completedById: null,
  cancelledAt: null,
  printedAt: null,
  createdAt: new Date("2026-04-01"),
  updatedAt: new Date("2026-04-01"),
  _count: { positions: 2 },
}

const mockPosition = {
  id: POSITION_ID,
  stocktakeId: STOCKTAKE_ID,
  articleId: ARTICLE_ID,
  articleNumber: "ART-1",
  articleName: "Test Article",
  unit: "Stk",
  warehouseLocation: "A1",
  expectedQuantity: 10,
  countedQuantity: null as number | null,
  difference: null as number | null,
  valueDifference: null as number | null,
  buyPrice: 5.0,
  countedById: null as string | null,
  countedAt: null as Date | null,
  reviewed: false,
  skipped: false,
  skipReason: null as string | null,
  note: null as string | null,
  stocktake: { id: STOCKTAKE_ID, tenantId: TENANT_ID, status: "IN_PROGRESS" },
}

const mockPosition2 = {
  ...mockPosition,
  id: POSITION_ID_2,
  articleId: ARTICLE_ID_2,
  articleNumber: "ART-2",
  articleName: "Test Article 2",
  expectedQuantity: 5,
  buyPrice: 10.0,
}

const mockPositionCounted = {
  ...mockPosition,
  countedQuantity: 12,
  difference: 2,
  valueDifference: 10.0,
  countedById: USER_ID,
  countedAt: new Date("2026-04-02"),
}

const mockArticle = {
  id: ARTICLE_ID,
  tenantId: TENANT_ID,
  number: "ART-1",
  name: "Test Article",
  unit: "Stk",
  currentStock: 10,
  buyPrice: 5.0,
  stockTracking: true,
  isActive: true,
  warehouseLocation: "A1",
}

const mockArticle2 = {
  ...mockArticle,
  id: ARTICLE_ID_2,
  number: "ART-2",
  name: "Test Article 2",
  currentStock: 5,
  buyPrice: 10.0,
  warehouseLocation: "B2",
}

const mockStats = { total: 2, counted: 1, skipped: 0, reviewed: 0 }

// --- Mock repository ---
vi.mock("../wh-stocktake-repository", () => ({
  findMany: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  findById: vi.fn().mockResolvedValue(null),
  create: vi.fn().mockResolvedValue(null),
  createPositionsBulk: vi.fn().mockResolvedValue(0),
  updateStatus: vi.fn().mockResolvedValue(null),
  remove: vi.fn().mockResolvedValue(undefined),
  findPositions: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  findPositionByArticle: vi.fn().mockResolvedValue(null),
  findPositionById: vi.fn().mockResolvedValue(null),
  updatePositionCount: vi.fn().mockResolvedValue(null),
  updatePositionReviewed: vi.fn().mockResolvedValue(null),
  skipPosition: vi.fn().mockResolvedValue(null),
  countPositionStats: vi.fn().mockResolvedValue({ total: 0, counted: 0, skipped: 0, reviewed: 0 }),
}))

// --- Mock number sequence service ---
vi.mock("../number-sequence-service", () => ({
  getNextNumber: vi.fn().mockResolvedValue("INV-1"),
}))

// --- Mock audit log service ---
vi.mock("../audit-logs-service", () => ({
  log: vi.fn().mockResolvedValue(undefined),
}))

// Now import service and mocked modules
import * as service from "../wh-stocktake-service"
import * as repo from "../wh-stocktake-repository"
import * as numberSeqService from "../number-sequence-service"

const audit = { userId: USER_ID, ipAddress: null, userAgent: null }

// --- Mock Prisma Factory ---

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  const prisma = {
    whArticle: {
      findMany: vi.fn().mockResolvedValue([mockArticle, mockArticle2]),
      findFirst: vi.fn().mockResolvedValue(mockArticle),
      update: vi.fn().mockResolvedValue(mockArticle),
    },
    whStocktake: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(mockStocktake),
      update: vi.fn().mockResolvedValue(mockStocktake),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    whStocktakePosition: {
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
      findFirst: vi.fn().mockResolvedValue(mockPosition),
      findMany: vi.fn().mockResolvedValue([mockPosition, mockPosition2]),
      update: vi.fn().mockResolvedValue(mockPosition),
      count: vi.fn().mockResolvedValue(2),
    },
    whStockMovement: {
      create: vi.fn().mockResolvedValue({
        id: "mv-001",
        tenantId: TENANT_ID,
        articleId: ARTICLE_ID,
        type: "INVENTORY",
        quantity: 2,
        previousStock: 10,
        newStock: 12,
      }),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
    ...overrides,
  } as unknown as PrismaClient

  return prisma
}

// --- Tests ---

describe("wh-stocktake-service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ===========================================================================
  // list
  // ===========================================================================

  describe("list", () => {
    it("returns paginated results", async () => {
      const prisma = createMockPrisma()
      const mockResult = { items: [mockStocktake], total: 1 }
      vi.mocked(repo.findMany).mockResolvedValue(mockResult)

      const result = await service.list(prisma, TENANT_ID, { page: 1, pageSize: 25 })

      expect(result.items).toHaveLength(1)
      expect(result.total).toBe(1)
      expect(repo.findMany).toHaveBeenCalledWith(prisma, TENANT_ID, {
        page: 1,
        pageSize: 25,
      })
    })

    it("passes tenantId filter to repository", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findMany).mockResolvedValue({ items: [], total: 0 })

      await service.list(prisma, TENANT_ID, { page: 1, pageSize: 10 })

      expect(repo.findMany).toHaveBeenCalledWith(
        prisma,
        TENANT_ID,
        expect.objectContaining({ page: 1, pageSize: 10 })
      )
    })

    it("passes status filter to repository", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findMany).mockResolvedValue({ items: [], total: 0 })

      await service.list(prisma, TENANT_ID, { status: "IN_PROGRESS", page: 1, pageSize: 25 })

      expect(repo.findMany).toHaveBeenCalledWith(prisma, TENANT_ID, {
        status: "IN_PROGRESS",
        page: 1,
        pageSize: 25,
      })
    })

    it("passes search term to repository", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findMany).mockResolvedValue({ items: [], total: 0 })

      await service.list(prisma, TENANT_ID, { search: "Q1", page: 1, pageSize: 25 })

      expect(repo.findMany).toHaveBeenCalledWith(prisma, TENANT_ID, {
        search: "Q1",
        page: 1,
        pageSize: 25,
      })
    })
  })

  // ===========================================================================
  // getById
  // ===========================================================================

  describe("getById", () => {
    it("returns stocktake with stats", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue(mockStocktake as never)
      vi.mocked(repo.countPositionStats).mockResolvedValue(mockStats)

      const result = await service.getById(prisma, TENANT_ID, STOCKTAKE_ID)

      expect(result.id).toBe(STOCKTAKE_ID)
      expect(result.stats).toEqual(mockStats)
      expect(repo.findById).toHaveBeenCalledWith(prisma, TENANT_ID, STOCKTAKE_ID)
      expect(repo.countPositionStats).toHaveBeenCalledWith(prisma, STOCKTAKE_ID)
    })

    it("throws WhStocktakeNotFoundError when not found", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue(null)

      await expect(
        service.getById(prisma, TENANT_ID, "nonexistent-id")
      ).rejects.toThrow(service.WhStocktakeNotFoundError)
    })
  })

  // ===========================================================================
  // getPositions
  // ===========================================================================

  describe("getPositions", () => {
    it("returns positions for a stocktake", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue(mockStocktake as never)
      vi.mocked(repo.findPositions).mockResolvedValue({
        items: [mockPosition, mockPosition2],
        total: 2,
      })

      const result = await service.getPositions(prisma, TENANT_ID, STOCKTAKE_ID)

      expect(result.items).toHaveLength(2)
      expect(result.total).toBe(2)
      expect(repo.findPositions).toHaveBeenCalledWith(prisma, STOCKTAKE_ID, undefined)
    })

    it("throws if stocktake not found", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue(null)

      await expect(
        service.getPositions(prisma, TENANT_ID, "nonexistent-id")
      ).rejects.toThrow(service.WhStocktakeNotFoundError)
    })

    it("applies search and filter params", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue(mockStocktake as never)
      vi.mocked(repo.findPositions).mockResolvedValue({ items: [], total: 0 })

      const params = { search: "ART-1", uncountedOnly: true, page: 1, pageSize: 50 }
      await service.getPositions(prisma, TENANT_ID, STOCKTAKE_ID, params)

      expect(repo.findPositions).toHaveBeenCalledWith(prisma, STOCKTAKE_ID, params)
    })

    it("passes differenceOnly filter", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue(mockStocktake as never)
      vi.mocked(repo.findPositions).mockResolvedValue({ items: [], total: 0 })

      const params = { differenceOnly: true }
      await service.getPositions(prisma, TENANT_ID, STOCKTAKE_ID, params)

      expect(repo.findPositions).toHaveBeenCalledWith(prisma, STOCKTAKE_ID, params)
    })
  })

  // ===========================================================================
  // getPositionByArticle
  // ===========================================================================

  describe("getPositionByArticle", () => {
    it("returns position for a given article", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue(mockStocktake as never)
      vi.mocked(repo.findPositionByArticle).mockResolvedValue(mockPosition as never)

      const result = await service.getPositionByArticle(prisma, TENANT_ID, STOCKTAKE_ID, ARTICLE_ID)

      expect(result).toEqual(mockPosition)
      expect(repo.findPositionByArticle).toHaveBeenCalledWith(prisma, STOCKTAKE_ID, ARTICLE_ID)
    })

    it("throws if stocktake not found", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue(null)

      await expect(
        service.getPositionByArticle(prisma, TENANT_ID, "nonexistent-id", ARTICLE_ID)
      ).rejects.toThrow(service.WhStocktakeNotFoundError)
    })
  })

  // ===========================================================================
  // getStats
  // ===========================================================================

  describe("getStats", () => {
    it("returns correct stats", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue(mockStocktake as never)
      vi.mocked(repo.countPositionStats).mockResolvedValue(mockStats)

      const result = await service.getStats(prisma, TENANT_ID, STOCKTAKE_ID)

      expect(result).toEqual(mockStats)
      expect(repo.countPositionStats).toHaveBeenCalledWith(prisma, STOCKTAKE_ID)
    })

    it("throws if stocktake not found", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue(null)

      await expect(
        service.getStats(prisma, TENANT_ID, "nonexistent-id")
      ).rejects.toThrow(service.WhStocktakeNotFoundError)
    })
  })

  // ===========================================================================
  // create
  // ===========================================================================

  describe("create", () => {
    it("calls getNextNumber for stocktake sequence", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.create).mockResolvedValue(mockStocktake as never)
      vi.mocked(repo.createPositionsBulk).mockResolvedValue(2)

      await service.create(
        prisma,
        TENANT_ID,
        { name: "Q1 Inventory" },
        USER_ID,
        audit
      )

      expect(numberSeqService.getNextNumber).toHaveBeenCalledWith(prisma, TENANT_ID, "stocktake")
    })

    it("creates stocktake with positions in transaction", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.create).mockResolvedValue(mockStocktake as never)
      vi.mocked(repo.createPositionsBulk).mockResolvedValue(2)

      const result = await service.create(
        prisma,
        TENANT_ID,
        { name: "Q1 Inventory", description: "Quarterly count" },
        USER_ID,
        audit
      )

      expect(prisma.$transaction).toHaveBeenCalled()
      expect(repo.create).toHaveBeenCalledWith(
        prisma, // tx (which is prisma in the mock)
        expect.objectContaining({
          tenantId: TENANT_ID,
          number: "INV-1",
          name: "Q1 Inventory",
          description: "Quarterly count",
          createdById: USER_ID,
        })
      )
      expect(repo.createPositionsBulk).toHaveBeenCalledWith(
        prisma,
        expect.arrayContaining([
          expect.objectContaining({
            stocktakeId: STOCKTAKE_ID,
            articleId: ARTICLE_ID,
            articleNumber: "ART-1",
            expectedQuantity: 10,
          }),
        ])
      )
      expect(result.positionCount).toBe(2)
    })

    it("throws ValidationError when no articles match scope filter", async () => {
      const prisma = createMockPrisma({
        whArticle: {
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
      })

      await expect(
        service.create(
          prisma,
          TENANT_ID,
          { name: "Empty", scope: "GROUP", scopeFilter: { groupId: "nonexistent" } },
          USER_ID
        )
      ).rejects.toThrow(service.WhStocktakeValidationError)
    })

    it("filters by GROUP scope", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.create).mockResolvedValue(mockStocktake as never)
      vi.mocked(repo.createPositionsBulk).mockResolvedValue(1)

      await service.create(
        prisma,
        TENANT_ID,
        { name: "Group check", scope: "GROUP", scopeFilter: { groupId: "group-1" } },
        USER_ID
      )

      expect((prisma.whArticle.findMany as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            stockTracking: true,
            isActive: true,
            groupId: "group-1",
          }),
        })
      )
    })

    it("filters by LOCATION scope", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.create).mockResolvedValue(mockStocktake as never)
      vi.mocked(repo.createPositionsBulk).mockResolvedValue(1)

      await service.create(
        prisma,
        TENANT_ID,
        { name: "Location check", scope: "LOCATION", scopeFilter: { location: "A1" } },
        USER_ID
      )

      expect((prisma.whArticle.findMany as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            stockTracking: true,
            isActive: true,
            warehouseLocation: "A1",
          }),
        })
      )
    })

    it("filters by articleIds scope", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.create).mockResolvedValue(mockStocktake as never)
      vi.mocked(repo.createPositionsBulk).mockResolvedValue(2)

      await service.create(
        prisma,
        TENANT_ID,
        { name: "Selected articles", scopeFilter: { articleIds: [ARTICLE_ID, ARTICLE_ID_2] } },
        USER_ID
      )

      expect((prisma.whArticle.findMany as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            id: { in: [ARTICLE_ID, ARTICLE_ID_2] },
          }),
        })
      )
    })

    it("returns stocktake with positionCount", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.create).mockResolvedValue(mockStocktake as never)
      vi.mocked(repo.createPositionsBulk).mockResolvedValue(2)

      const result = await service.create(
        prisma,
        TENANT_ID,
        { name: "Q1" },
        USER_ID
      )

      expect(result.id).toBe(STOCKTAKE_ID)
      expect(result.number).toBe("INV-1")
      expect(result.positionCount).toBe(2)
    })
  })

  // ===========================================================================
  // startCounting
  // ===========================================================================

  describe("startCounting", () => {
    it("transitions DRAFT to IN_PROGRESS", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue(mockStocktake as never)
      const updatedStocktake = { ...mockStocktake, status: "IN_PROGRESS" }
      vi.mocked(repo.updateStatus).mockResolvedValue(updatedStocktake as never)

      const result = await service.startCounting(prisma, TENANT_ID, STOCKTAKE_ID, audit)

      expect(result.status).toBe("IN_PROGRESS")
      expect(repo.updateStatus).toHaveBeenCalledWith(prisma, STOCKTAKE_ID, {
        status: "IN_PROGRESS",
      })
    })

    it("throws if stocktake not found", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue(null)

      await expect(
        service.startCounting(prisma, TENANT_ID, "nonexistent-id")
      ).rejects.toThrow(service.WhStocktakeNotFoundError)
    })

    it("throws if status is not DRAFT", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue({
        ...mockStocktake,
        status: "IN_PROGRESS",
      } as never)

      await expect(
        service.startCounting(prisma, TENANT_ID, STOCKTAKE_ID)
      ).rejects.toThrow(service.WhStocktakeValidationError)
    })

    it("throws if status is COMPLETED", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue({
        ...mockStocktake,
        status: "COMPLETED",
      } as never)

      await expect(
        service.startCounting(prisma, TENANT_ID, STOCKTAKE_ID)
      ).rejects.toThrow("Stocktake must be in DRAFT status to start counting")
    })
  })

  // ===========================================================================
  // recordCount
  // ===========================================================================

  describe("recordCount", () => {
    it("updates position with count and calculates difference", async () => {
      const prisma = createMockPrisma()
      const inProgressStocktake = { ...mockStocktake, status: "IN_PROGRESS" }
      vi.mocked(repo.findById).mockResolvedValue(inProgressStocktake as never)
      vi.mocked(repo.findPositionByArticle).mockResolvedValue(mockPosition as never)
      vi.mocked(repo.updatePositionCount).mockResolvedValue(mockPositionCounted as never)

      const result = await service.recordCount(
        prisma,
        TENANT_ID,
        {
          stocktakeId: STOCKTAKE_ID,
          articleId: ARTICLE_ID,
          countedQuantity: 12,
          note: "counted by hand",
        },
        USER_ID,
        audit
      )

      expect(repo.updatePositionCount).toHaveBeenCalledWith(
        prisma,
        POSITION_ID,
        expect.objectContaining({
          countedQuantity: 12,
          difference: 2, // 12 - 10
          valueDifference: 10.0, // 2 * 5.0
          countedById: USER_ID,
          note: "counted by hand",
        })
      )
      expect(result).toEqual(mockPositionCounted)
    })

    it("calculates valueDifference as null when buyPrice is null", async () => {
      const prisma = createMockPrisma()
      const inProgressStocktake = { ...mockStocktake, status: "IN_PROGRESS" }
      vi.mocked(repo.findById).mockResolvedValue(inProgressStocktake as never)
      const positionNoBuyPrice = { ...mockPosition, buyPrice: null }
      vi.mocked(repo.findPositionByArticle).mockResolvedValue(positionNoBuyPrice as never)
      vi.mocked(repo.updatePositionCount).mockResolvedValue(positionNoBuyPrice as never)

      await service.recordCount(
        prisma,
        TENANT_ID,
        {
          stocktakeId: STOCKTAKE_ID,
          articleId: ARTICLE_ID,
          countedQuantity: 12,
        },
        USER_ID
      )

      expect(repo.updatePositionCount).toHaveBeenCalledWith(
        prisma,
        POSITION_ID,
        expect.objectContaining({
          valueDifference: null,
        })
      )
    })

    it("handles negative difference (less stock than expected)", async () => {
      const prisma = createMockPrisma()
      const inProgressStocktake = { ...mockStocktake, status: "IN_PROGRESS" }
      vi.mocked(repo.findById).mockResolvedValue(inProgressStocktake as never)
      vi.mocked(repo.findPositionByArticle).mockResolvedValue(mockPosition as never)
      vi.mocked(repo.updatePositionCount).mockResolvedValue({
        ...mockPosition,
        countedQuantity: 8,
        difference: -2,
        valueDifference: -10.0,
      } as never)

      await service.recordCount(
        prisma,
        TENANT_ID,
        {
          stocktakeId: STOCKTAKE_ID,
          articleId: ARTICLE_ID,
          countedQuantity: 8,
        },
        USER_ID
      )

      expect(repo.updatePositionCount).toHaveBeenCalledWith(
        prisma,
        POSITION_ID,
        expect.objectContaining({
          countedQuantity: 8,
          difference: -2, // 8 - 10
          valueDifference: -10.0, // -2 * 5.0
        })
      )
    })

    it("throws if stocktake not found", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue(null)

      await expect(
        service.recordCount(
          prisma,
          TENANT_ID,
          { stocktakeId: "nonexistent", articleId: ARTICLE_ID, countedQuantity: 10 },
          USER_ID
        )
      ).rejects.toThrow(service.WhStocktakeNotFoundError)
    })

    it("throws if stocktake is not IN_PROGRESS", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue(mockStocktake as never) // status = DRAFT

      await expect(
        service.recordCount(
          prisma,
          TENANT_ID,
          { stocktakeId: STOCKTAKE_ID, articleId: ARTICLE_ID, countedQuantity: 10 },
          USER_ID
        )
      ).rejects.toThrow("Stocktake must be IN_PROGRESS to record counts")
    })

    it("throws if position (article) not found in stocktake", async () => {
      const prisma = createMockPrisma()
      const inProgressStocktake = { ...mockStocktake, status: "IN_PROGRESS" }
      vi.mocked(repo.findById).mockResolvedValue(inProgressStocktake as never)
      vi.mocked(repo.findPositionByArticle).mockResolvedValue(null)

      await expect(
        service.recordCount(
          prisma,
          TENANT_ID,
          { stocktakeId: STOCKTAKE_ID, articleId: "nonexistent-article", countedQuantity: 10 },
          USER_ID
        )
      ).rejects.toThrow("Article not found in this stocktake")
    })
  })

  // ===========================================================================
  // reviewPosition
  // ===========================================================================

  describe("reviewPosition", () => {
    it("marks position as reviewed", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findPositionById).mockResolvedValue(mockPosition as never)
      vi.mocked(repo.updatePositionReviewed).mockResolvedValue({
        ...mockPosition,
        reviewed: true,
      } as never)

      const result = await service.reviewPosition(prisma, TENANT_ID, POSITION_ID, true, audit)

      expect(result.reviewed).toBe(true)
      expect(repo.updatePositionReviewed).toHaveBeenCalledWith(prisma, POSITION_ID, true)
    })

    it("un-marks position as reviewed", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findPositionById).mockResolvedValue({
        ...mockPosition,
        reviewed: true,
      } as never)
      vi.mocked(repo.updatePositionReviewed).mockResolvedValue({
        ...mockPosition,
        reviewed: false,
      } as never)

      const result = await service.reviewPosition(prisma, TENANT_ID, POSITION_ID, false)

      expect(result.reviewed).toBe(false)
    })

    it("throws if position not found", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findPositionById).mockResolvedValue(null)

      await expect(
        service.reviewPosition(prisma, TENANT_ID, "nonexistent", true)
      ).rejects.toThrow("Position not found")
    })

    it("throws if position belongs to different tenant", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findPositionById).mockResolvedValue({
        ...mockPosition,
        stocktake: { id: STOCKTAKE_ID, tenantId: OTHER_TENANT_ID, status: "IN_PROGRESS" },
      } as never)

      await expect(
        service.reviewPosition(prisma, TENANT_ID, POSITION_ID, true)
      ).rejects.toThrow("Position not found")
    })
  })

  // ===========================================================================
  // skipPositionFn
  // ===========================================================================

  describe("skipPositionFn", () => {
    it("marks position as skipped with reason", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findPositionById).mockResolvedValue(mockPosition as never)
      vi.mocked(repo.skipPosition).mockResolvedValue({
        ...mockPosition,
        skipped: true,
        skipReason: "Item not accessible",
      } as never)

      const result = await service.skipPositionFn(
        prisma,
        TENANT_ID,
        POSITION_ID,
        "Item not accessible",
        audit
      )

      expect(result.skipped).toBe(true)
      expect(result.skipReason).toBe("Item not accessible")
      expect(repo.skipPosition).toHaveBeenCalledWith(prisma, POSITION_ID, "Item not accessible")
    })

    it("throws if position not found", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findPositionById).mockResolvedValue(null)

      await expect(
        service.skipPositionFn(prisma, TENANT_ID, "nonexistent", "reason")
      ).rejects.toThrow("Position not found")
    })

    it("throws if position belongs to different tenant", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findPositionById).mockResolvedValue({
        ...mockPosition,
        stocktake: { id: STOCKTAKE_ID, tenantId: OTHER_TENANT_ID, status: "IN_PROGRESS" },
      } as never)

      await expect(
        service.skipPositionFn(prisma, TENANT_ID, POSITION_ID, "reason")
      ).rejects.toThrow("Position not found")
    })

    it("throws if stocktake is not IN_PROGRESS", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findPositionById).mockResolvedValue({
        ...mockPosition,
        stocktake: { id: STOCKTAKE_ID, tenantId: TENANT_ID, status: "DRAFT" },
      } as never)

      await expect(
        service.skipPositionFn(prisma, TENANT_ID, POSITION_ID, "reason")
      ).rejects.toThrow("Stocktake must be IN_PROGRESS to skip positions")
    })

    it("throws if stocktake is COMPLETED", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findPositionById).mockResolvedValue({
        ...mockPosition,
        stocktake: { id: STOCKTAKE_ID, tenantId: TENANT_ID, status: "COMPLETED" },
      } as never)

      await expect(
        service.skipPositionFn(prisma, TENANT_ID, POSITION_ID, "reason")
      ).rejects.toThrow("Stocktake must be IN_PROGRESS to skip positions")
    })
  })

  // ===========================================================================
  // complete
  // ===========================================================================

  describe("complete", () => {
    it("creates INVENTORY movements and updates article stock", async () => {
      const prisma = createMockPrisma({
        whStocktake: {
          findFirst: vi.fn().mockResolvedValue({
            ...mockStocktake,
            status: "IN_PROGRESS",
            positions: [
              { ...mockPositionCounted, articleId: ARTICLE_ID, countedQuantity: 12, skipped: false },
            ],
          }),
          update: vi.fn().mockResolvedValue({ ...mockStocktake, status: "COMPLETED" }),
        },
      })
      vi.mocked(repo.updateStatus).mockResolvedValue({
        ...mockStocktake,
        status: "COMPLETED",
      } as never)

      const result = await service.complete(prisma, TENANT_ID, STOCKTAKE_ID, USER_ID, audit)

      expect(result.movements).toBe(1)
      expect((prisma.whStockMovement.create as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT_ID,
            articleId: ARTICLE_ID,
            type: "INVENTORY",
            quantity: 2, // 12 - 10
            previousStock: 10,
            newStock: 12,
            inventorySessionId: STOCKTAKE_ID,
            createdById: USER_ID,
          }),
        })
      )
      expect((prisma.whArticle.update as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ARTICLE_ID },
          data: { currentStock: 12 },
        })
      )
    })

    it("skips movement creation when countedQuantity equals currentStock", async () => {
      const prisma = createMockPrisma({
        whStocktake: {
          findFirst: vi.fn().mockResolvedValue({
            ...mockStocktake,
            status: "IN_PROGRESS",
            positions: [
              { ...mockPositionCounted, articleId: ARTICLE_ID, countedQuantity: 10, skipped: false },
            ],
          }),
          update: vi.fn(),
        },
        whArticle: {
          findMany: vi.fn().mockResolvedValue([mockArticle]),
          findFirst: vi.fn().mockResolvedValue({ ...mockArticle, currentStock: 10 }),
          update: vi.fn(),
        },
      })
      vi.mocked(repo.updateStatus).mockResolvedValue({
        ...mockStocktake,
        status: "COMPLETED",
      } as never)

      const result = await service.complete(prisma, TENANT_ID, STOCKTAKE_ID, USER_ID)

      expect(result.movements).toBe(0)
      expect((prisma.whStockMovement.create as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
    })

    it("skips positions that are marked as skipped", async () => {
      const prisma = createMockPrisma({
        whStocktake: {
          findFirst: vi.fn().mockResolvedValue({
            ...mockStocktake,
            status: "IN_PROGRESS",
            positions: [
              { ...mockPosition, skipped: true, countedQuantity: null },
            ],
          }),
          update: vi.fn(),
        },
      })
      vi.mocked(repo.updateStatus).mockResolvedValue({
        ...mockStocktake,
        status: "COMPLETED",
      } as never)

      const result = await service.complete(prisma, TENANT_ID, STOCKTAKE_ID, USER_ID)

      expect(result.movements).toBe(0)
      expect((prisma.whStockMovement.create as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
    })

    it("throws if stocktake not found", async () => {
      const prisma = createMockPrisma({
        whStocktake: {
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
      })

      await expect(
        service.complete(prisma, TENANT_ID, "nonexistent", USER_ID)
      ).rejects.toThrow(service.WhStocktakeNotFoundError)
    })

    it("throws if stocktake is not IN_PROGRESS", async () => {
      const prisma = createMockPrisma({
        whStocktake: {
          findFirst: vi.fn().mockResolvedValue({
            ...mockStocktake,
            status: "DRAFT",
            positions: [],
          }),
          update: vi.fn(),
        },
      })

      await expect(
        service.complete(prisma, TENANT_ID, STOCKTAKE_ID, USER_ID)
      ).rejects.toThrow("Stocktake must be IN_PROGRESS to complete")
    })

    it("throws if uncounted positions remain", async () => {
      const prisma = createMockPrisma({
        whStocktake: {
          findFirst: vi.fn().mockResolvedValue({
            ...mockStocktake,
            status: "IN_PROGRESS",
            positions: [
              { ...mockPosition, countedQuantity: null, skipped: false },
              { ...mockPosition2, countedQuantity: 5, skipped: false },
            ],
          }),
          update: vi.fn(),
        },
      })

      await expect(
        service.complete(prisma, TENANT_ID, STOCKTAKE_ID, USER_ID)
      ).rejects.toThrow("1 positions are neither counted nor skipped")
    })

    it("throws with correct count for multiple uncounted positions", async () => {
      const prisma = createMockPrisma({
        whStocktake: {
          findFirst: vi.fn().mockResolvedValue({
            ...mockStocktake,
            status: "IN_PROGRESS",
            positions: [
              { ...mockPosition, countedQuantity: null, skipped: false },
              { ...mockPosition2, countedQuantity: null, skipped: false },
              {
                id: POSITION_ID_3,
                countedQuantity: null,
                skipped: false,
                articleId: "art-3",
              },
            ],
          }),
          update: vi.fn(),
        },
      })

      await expect(
        service.complete(prisma, TENANT_ID, STOCKTAKE_ID, USER_ID)
      ).rejects.toThrow("3 positions are neither counted nor skipped")
    })

    it("returns movement count", async () => {
      const prisma = createMockPrisma({
        whStocktake: {
          findFirst: vi.fn().mockResolvedValue({
            ...mockStocktake,
            status: "IN_PROGRESS",
            positions: [
              { ...mockPositionCounted, articleId: ARTICLE_ID, countedQuantity: 12, skipped: false },
              { ...mockPosition2, id: POSITION_ID_2, articleId: ARTICLE_ID_2, countedQuantity: 3, skipped: false },
            ],
          }),
          update: vi.fn(),
        },
        whArticle: {
          findMany: vi.fn().mockResolvedValue([mockArticle, mockArticle2]),
          findFirst: vi.fn()
            .mockResolvedValueOnce({ id: ARTICLE_ID, currentStock: 10 })
            .mockResolvedValueOnce({ id: ARTICLE_ID_2, currentStock: 5 }),
          update: vi.fn(),
        },
      })
      vi.mocked(repo.updateStatus).mockResolvedValue({
        ...mockStocktake,
        status: "COMPLETED",
      } as never)

      const result = await service.complete(prisma, TENANT_ID, STOCKTAKE_ID, USER_ID, audit)

      // Article 1: 12 - 10 = 2 (movement needed)
      // Article 2: 3 - 5 = -2 (movement needed)
      expect(result.movements).toBe(2)
    })

    it("continues when article is not found for a position", async () => {
      const prisma = createMockPrisma({
        whStocktake: {
          findFirst: vi.fn().mockResolvedValue({
            ...mockStocktake,
            status: "IN_PROGRESS",
            positions: [
              { ...mockPositionCounted, articleId: ARTICLE_ID, countedQuantity: 12, skipped: false },
            ],
          }),
          update: vi.fn(),
        },
        whArticle: {
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(null), // Article not found
          update: vi.fn(),
        },
      })
      vi.mocked(repo.updateStatus).mockResolvedValue({
        ...mockStocktake,
        status: "COMPLETED",
      } as never)

      const result = await service.complete(prisma, TENANT_ID, STOCKTAKE_ID, USER_ID)

      expect(result.movements).toBe(0)
    })
  })

  // ===========================================================================
  // cancel
  // ===========================================================================

  describe("cancel", () => {
    it("cancels a DRAFT stocktake", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue(mockStocktake as never)
      vi.mocked(repo.updateStatus).mockResolvedValue({
        ...mockStocktake,
        status: "CANCELLED",
      } as never)

      const result = await service.cancel(prisma, TENANT_ID, STOCKTAKE_ID, audit)

      expect(result.status).toBe("CANCELLED")
      expect(repo.updateStatus).toHaveBeenCalledWith(prisma, STOCKTAKE_ID, {
        status: "CANCELLED",
        cancelledAt: expect.any(Date),
      })
    })

    it("cancels an IN_PROGRESS stocktake", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue({
        ...mockStocktake,
        status: "IN_PROGRESS",
      } as never)
      vi.mocked(repo.updateStatus).mockResolvedValue({
        ...mockStocktake,
        status: "CANCELLED",
      } as never)

      const result = await service.cancel(prisma, TENANT_ID, STOCKTAKE_ID, audit)

      expect(result.status).toBe("CANCELLED")
    })

    it("throws if stocktake is COMPLETED", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue({
        ...mockStocktake,
        status: "COMPLETED",
      } as never)

      await expect(
        service.cancel(prisma, TENANT_ID, STOCKTAKE_ID)
      ).rejects.toThrow("Cannot cancel a completed stocktake")
    })

    it("throws if stocktake is already CANCELLED", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue({
        ...mockStocktake,
        status: "CANCELLED",
      } as never)

      await expect(
        service.cancel(prisma, TENANT_ID, STOCKTAKE_ID)
      ).rejects.toThrow("Stocktake is already cancelled")
    })

    it("throws if stocktake not found", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue(null)

      await expect(
        service.cancel(prisma, TENANT_ID, "nonexistent")
      ).rejects.toThrow(service.WhStocktakeNotFoundError)
    })
  })

  // ===========================================================================
  // remove
  // ===========================================================================

  describe("remove", () => {
    it("deletes DRAFT stocktake", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue(mockStocktake as never) // DRAFT
      vi.mocked(repo.remove).mockResolvedValue(undefined)

      const result = await service.remove(prisma, TENANT_ID, STOCKTAKE_ID, audit)

      expect(result).toEqual({ deleted: true })
      expect(repo.remove).toHaveBeenCalledWith(prisma, TENANT_ID, STOCKTAKE_ID)
    })

    it("throws if stocktake is not DRAFT", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue({
        ...mockStocktake,
        status: "IN_PROGRESS",
      } as never)

      await expect(
        service.remove(prisma, TENANT_ID, STOCKTAKE_ID)
      ).rejects.toThrow("Only DRAFT stocktakes can be deleted")
    })

    it("throws if stocktake is COMPLETED", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue({
        ...mockStocktake,
        status: "COMPLETED",
      } as never)

      await expect(
        service.remove(prisma, TENANT_ID, STOCKTAKE_ID)
      ).rejects.toThrow("Only DRAFT stocktakes can be deleted")
    })

    it("throws if stocktake not found", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue(null)

      await expect(
        service.remove(prisma, TENANT_ID, "nonexistent")
      ).rejects.toThrow(service.WhStocktakeNotFoundError)
    })
  })

  // ===========================================================================
  // TENANT ISOLATION TESTS (MANDATORY)
  // ===========================================================================

  describe("tenant isolation", () => {
    it("list returns empty for other tenant", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findMany).mockResolvedValue({ items: [], total: 0 })

      const result = await service.list(prisma, OTHER_TENANT_ID, { page: 1, pageSize: 25 })

      expect(result.items).toHaveLength(0)
      expect(result.total).toBe(0)
      expect(repo.findMany).toHaveBeenCalledWith(prisma, OTHER_TENANT_ID, {
        page: 1,
        pageSize: 25,
      })
    })

    it("getById throws for other tenant", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue(null)

      await expect(
        service.getById(prisma, OTHER_TENANT_ID, STOCKTAKE_ID)
      ).rejects.toThrow(service.WhStocktakeNotFoundError)
    })

    it("getPositions throws for other tenant", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue(null)

      await expect(
        service.getPositions(prisma, OTHER_TENANT_ID, STOCKTAKE_ID)
      ).rejects.toThrow(service.WhStocktakeNotFoundError)
    })

    it("getPositionByArticle throws for other tenant", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue(null)

      await expect(
        service.getPositionByArticle(prisma, OTHER_TENANT_ID, STOCKTAKE_ID, ARTICLE_ID)
      ).rejects.toThrow(service.WhStocktakeNotFoundError)
    })

    it("getStats throws for other tenant", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue(null)

      await expect(
        service.getStats(prisma, OTHER_TENANT_ID, STOCKTAKE_ID)
      ).rejects.toThrow(service.WhStocktakeNotFoundError)
    })

    it("startCounting throws for other tenant", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue(null)

      await expect(
        service.startCounting(prisma, OTHER_TENANT_ID, STOCKTAKE_ID)
      ).rejects.toThrow(service.WhStocktakeNotFoundError)
    })

    it("recordCount throws for other tenant", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue(null)

      await expect(
        service.recordCount(
          prisma,
          OTHER_TENANT_ID,
          { stocktakeId: STOCKTAKE_ID, articleId: ARTICLE_ID, countedQuantity: 10 },
          USER_ID
        )
      ).rejects.toThrow(service.WhStocktakeNotFoundError)
    })

    it("reviewPosition throws for position from other tenant", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findPositionById).mockResolvedValue({
        ...mockPosition,
        stocktake: { id: STOCKTAKE_ID, tenantId: OTHER_TENANT_ID, status: "IN_PROGRESS" },
      } as never)

      await expect(
        service.reviewPosition(prisma, TENANT_ID, POSITION_ID, true)
      ).rejects.toThrow("Position not found")
    })

    it("skipPositionFn throws for position from other tenant", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findPositionById).mockResolvedValue({
        ...mockPosition,
        stocktake: { id: STOCKTAKE_ID, tenantId: OTHER_TENANT_ID, status: "IN_PROGRESS" },
      } as never)

      await expect(
        service.skipPositionFn(prisma, TENANT_ID, POSITION_ID, "reason")
      ).rejects.toThrow("Position not found")
    })

    it("complete throws for other tenant", async () => {
      const prisma = createMockPrisma({
        whStocktake: {
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
      })

      await expect(
        service.complete(prisma, OTHER_TENANT_ID, STOCKTAKE_ID, USER_ID)
      ).rejects.toThrow(service.WhStocktakeNotFoundError)
    })

    it("cancel throws for other tenant", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue(null)

      await expect(
        service.cancel(prisma, OTHER_TENANT_ID, STOCKTAKE_ID)
      ).rejects.toThrow(service.WhStocktakeNotFoundError)
    })

    it("remove throws for other tenant", async () => {
      const prisma = createMockPrisma()
      vi.mocked(repo.findById).mockResolvedValue(null)

      await expect(
        service.remove(prisma, OTHER_TENANT_ID, STOCKTAKE_ID)
      ).rejects.toThrow(service.WhStocktakeNotFoundError)
    })
  })
})
