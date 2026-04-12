import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { whReservationsRouter } from "../warehouse/reservations"
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
const WH_RESERVATIONS_VIEW = permissionIdByKey("wh_reservations.view")!
const WH_RESERVATIONS_MANAGE = permissionIdByKey("wh_reservations.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ARTICLE_ID = "b1000000-0000-4000-a000-000000000001"
const DOCUMENT_ID = "c1000000-0000-4000-a000-000000000001"
const RESERVATION_ID = "e1000000-0000-4000-a000-000000000001"

const createCaller = createCallerFactory(whReservationsRouter)

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
  permissions: string[] = [WH_RESERVATIONS_VIEW]
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

// --- Mock Reservation Data ---
const mockReservation = {
  id: RESERVATION_ID,
  tenantId: TENANT_ID,
  articleId: ARTICLE_ID,
  documentId: DOCUMENT_ID,
  positionId: "d1000000-0000-4000-a000-000000000001",
  quantity: 30,
  status: "ACTIVE",
  releasedAt: null,
  releasedById: null,
  releaseReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdById: USER_ID,
  article: { id: ARTICLE_ID, number: "ART-1", name: "Test Article", unit: "Stk" },
}

// --- Tests ---
describe("warehouse.reservations", () => {
  describe("list", () => {
    it("returns paginated results", async () => {
      const prisma = {
        whStockReservation: {
          findMany: vi.fn().mockResolvedValue([mockReservation]),
          count: vi.fn().mockResolvedValue(1),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.list({ page: 1, pageSize: 10 })
      expect(result!.items).toHaveLength(1)
      expect(result!.total).toBe(1)
    })

    it("requires wh_reservations.view permission", async () => {
      const caller = createCaller(createNoPermContext({}))
      await expect(caller.list({ page: 1, pageSize: 10 })).rejects.toThrow()
    })
  })

  describe("getByArticle", () => {
    it("returns available stock info", async () => {
      const prisma = {
        whArticle: {
          findFirst: vi.fn().mockResolvedValue({
            id: ARTICLE_ID,
            number: "ART-1",
            name: "Test Article",
            unit: "Stk",
            currentStock: 100,
            stockTracking: true,
          }),
        },
        whStockReservation: {
          findMany: vi.fn().mockResolvedValue([mockReservation]),
          aggregate: vi.fn().mockResolvedValue({ _sum: { quantity: 30 } }),
        },
        billingDocument: {
          findMany: vi.fn().mockResolvedValue([
            { id: DOCUMENT_ID, number: "AB-001", address: { company: "Test GmbH" } },
          ]),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.getByArticle({ articleId: ARTICLE_ID })
      expect(result!.currentStock).toBe(100)
      expect(result!.reservedStock).toBe(30)
      expect(result!.availableStock).toBe(70)
      expect(result!.reservations).toHaveLength(1)
    })
  })

  describe("release", () => {
    it("requires wh_reservations.manage permission", async () => {
      const caller = createCaller(createTestContext({}, [WH_RESERVATIONS_VIEW]))
      await expect(
        caller.release({ id: RESERVATION_ID })
      ).rejects.toThrow()
    })

    it("sets RELEASED with reason", async () => {
      const releasedReservation = { ...mockReservation, status: "RELEASED", releaseReason: "Test" }
      const prisma = {
        whStockReservation: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce(mockReservation) // findById
            .mockResolvedValueOnce(releasedReservation), // findById after update
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      }
      const caller = createCaller(
        createTestContext(prisma, [WH_RESERVATIONS_VIEW, WH_RESERVATIONS_MANAGE])
      )
      const result = await caller.release({ id: RESERVATION_ID, reason: "Test" })
      expect(result!.status).toBe("RELEASED")
    })
  })

  describe("releaseBulk", () => {
    it("releases all reservations for document", async () => {
      const prisma = {
        billingDocument: {
          findFirst: vi.fn().mockResolvedValue({ id: DOCUMENT_ID }),
        },
        whStockReservation: {
          updateMany: vi.fn().mockResolvedValue({ count: 3 }),
        },
      }
      const caller = createCaller(
        createTestContext(prisma, [WH_RESERVATIONS_VIEW, WH_RESERVATIONS_MANAGE])
      )
      const result = await caller.releaseBulk({ documentId: DOCUMENT_ID })
      expect(result!.releasedCount).toBe(3)
    })
  })
})
