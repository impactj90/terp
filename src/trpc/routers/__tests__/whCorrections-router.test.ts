import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { whCorrectionsRouter } from "../warehouse/corrections"
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
const WH_CORRECTIONS_VIEW = permissionIdByKey("wh_corrections.view")!
const WH_CORRECTIONS_MANAGE = permissionIdByKey("wh_corrections.manage")!
const WH_CORRECTIONS_RUN = permissionIdByKey("wh_corrections.run")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"

const createCaller = createCallerFactory(whCorrectionsRouter)

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
  permissions: string[] = [WH_CORRECTIONS_VIEW]
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

// --- Tests ---
describe("warehouse.corrections", () => {
  describe("messages.list", () => {
    it("returns paginated messages", async () => {
      const mockMessages = [
        {
          id: "b1000000-0000-4000-a000-000000000001",
          tenantId: TENANT_ID,
          code: "NEGATIVE_STOCK",
          severity: "ERROR",
          status: "OPEN",
          message: "Test message",
          createdAt: new Date(),
        },
      ]
      const prisma = {
        whCorrectionMessage: {
          findMany: vi.fn().mockResolvedValue(mockMessages),
          count: vi.fn().mockResolvedValue(1),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.messages.list({ page: 1, pageSize: 10 })
      expect(result!.items).toHaveLength(1)
      expect(result!.total).toBe(1)
    })

    it("rejects without permission", async () => {
      const caller = createCaller(createNoPermContext({}))
      await expect(caller.messages.list({ page: 1, pageSize: 10 })).rejects.toThrow()
    })
  })

  describe("messages.resolve", () => {
    it("resolves a message", async () => {
      const mockMessage = {
        id: "b1000000-0000-4000-a000-000000000001",
        tenantId: TENANT_ID,
        code: "NEGATIVE_STOCK",
        severity: "ERROR",
        status: "OPEN",
        message: "Test message",
        createdAt: new Date(),
      }
      const prisma = {
        whCorrectionMessage: {
          findFirst: vi.fn()
            .mockResolvedValueOnce(mockMessage) // for exists check in service
            .mockResolvedValueOnce({ ...mockMessage, status: "RESOLVED" }), // for refetch after update
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      }
      const caller = createCaller(
        createTestContext(prisma, [WH_CORRECTIONS_VIEW, WH_CORRECTIONS_MANAGE])
      )
      const result = await caller.messages.resolve({ id: "b1000000-0000-4000-a000-000000000001", note: "Fixed" })
      expect(result!.status).toBe("RESOLVED")
    })
  })

  describe("messages.dismiss", () => {
    it("dismisses a message", async () => {
      const mockMessage = {
        id: "b1000000-0000-4000-a000-000000000001",
        tenantId: TENANT_ID,
        code: "NEGATIVE_STOCK",
        severity: "ERROR",
        status: "OPEN",
        message: "Test message",
        createdAt: new Date(),
      }
      const prisma = {
        whCorrectionMessage: {
          findFirst: vi.fn()
            .mockResolvedValueOnce(mockMessage)
            .mockResolvedValueOnce({ ...mockMessage, status: "DISMISSED" }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      }
      const caller = createCaller(
        createTestContext(prisma, [WH_CORRECTIONS_VIEW, WH_CORRECTIONS_MANAGE])
      )
      const result = await caller.messages.dismiss({ id: "b1000000-0000-4000-a000-000000000001", note: "Not relevant" })
      expect(result!.status).toBe("DISMISSED")
    })
  })

  describe("messages.resolveBulk", () => {
    it("resolves multiple messages", async () => {
      const prisma = {
        whCorrectionMessage: {
          updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
      }
      const caller = createCaller(
        createTestContext(prisma, [WH_CORRECTIONS_VIEW, WH_CORRECTIONS_MANAGE])
      )
      const result = await caller.messages.resolveBulk({
        ids: ["b1000000-0000-4000-a000-000000000001", "b2000000-0000-4000-a000-000000000002"],
        note: "Batch fix",
      })
      expect(result).toEqual({ count: 2 })
    })

    it("rejects without manage permission", async () => {
      const caller = createCaller(createTestContext({}, [WH_CORRECTIONS_VIEW]))
      await expect(
        caller.messages.resolveBulk({ ids: ["b1000000-0000-4000-a000-000000000001"] })
      ).rejects.toThrow()
    })
  })

  describe("summary", () => {
    it("returns grouped counts", async () => {
      const prisma = {
        whCorrectionMessage: {
          groupBy: vi.fn().mockResolvedValue([
            { severity: "ERROR", _count: { id: 3 } },
            { severity: "WARNING", _count: { id: 5 } },
            { severity: "INFO", _count: { id: 2 } },
          ]),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.summary()
      expect(result!.errors).toBe(3)
      expect(result!.warnings).toBe(5)
      expect(result!.infos).toBe(2)
      expect(result!.total).toBe(10)
    })
  })

  describe("runs.trigger", () => {
    it("requires wh_corrections.run permission", async () => {
      const caller = createCaller(createTestContext({}, [WH_CORRECTIONS_VIEW]))
      await expect(caller.runs.trigger()).rejects.toThrow()
    })

    it("executes checks and returns summary when permitted", async () => {
      const mockRun = {
        id: "c1000000-0000-4000-a000-000000000001",
        tenantId: TENANT_ID,
        trigger: "MANUAL",
        triggeredById: USER_ID,
        startedAt: new Date(),
        completedAt: null,
        checksRun: 0,
        issuesFound: 0,
      }
      const prisma = {
        whCorrectionRun: {
          create: vi.fn().mockResolvedValue(mockRun),
          update: vi.fn().mockResolvedValue({ ...mockRun, completedAt: new Date(), checksRun: 6 }),
        },
        whCorrectionMessage: {
          findFirst: vi.fn().mockResolvedValue(null), // no duplicates
          createMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        $queryRaw: vi.fn().mockResolvedValue([]), // no issues found
      }
      const caller = createCaller(
        createTestContext(prisma, [WH_CORRECTIONS_VIEW, WH_CORRECTIONS_RUN])
      )
      const result = await caller.runs.trigger()
      expect(result!.runId).toBe("c1000000-0000-4000-a000-000000000001")
      expect(result!.checksRun).toBe(6)
    })
  })

  describe("runs.list", () => {
    it("returns paginated runs", async () => {
      const mockRuns = [
        {
          id: "c1000000-0000-4000-a000-000000000001",
          tenantId: TENANT_ID,
          trigger: "MANUAL",
          startedAt: new Date(),
          completedAt: new Date(),
          checksRun: 6,
          issuesFound: 3,
        },
      ]
      const prisma = {
        whCorrectionRun: {
          findMany: vi.fn().mockResolvedValue(mockRuns),
          count: vi.fn().mockResolvedValue(1),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.runs.list({ page: 1, pageSize: 10 })
      expect(result!.items).toHaveLength(1)
      expect(result!.total).toBe(1)
    })
  })

  describe("tenant isolation", () => {
    it("messages.list filters by tenantId", async () => {
      const prisma = {
        whCorrectionMessage: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      await caller.messages.list({ page: 1, pageSize: 10 })
      expect(prisma.whCorrectionMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_ID }),
        })
      )
    })

    it("summary filters by tenantId", async () => {
      const prisma = {
        whCorrectionMessage: {
          groupBy: vi.fn().mockResolvedValue([]),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      await caller.summary()
      expect(prisma.whCorrectionMessage.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_ID }),
        })
      )
    })

    it("runs.list filters by tenantId", async () => {
      const prisma = {
        whCorrectionRun: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
      }
      const caller = createCaller(createTestContext(prisma))
      await caller.runs.list({ page: 1, pageSize: 10 })
      expect(prisma.whCorrectionRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_ID }),
        })
      )
    })
  })
})
