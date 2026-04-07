import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { dsgvoRouter } from "../dsgvo"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"
import * as dsgvoService from "@/lib/services/dsgvo-retention-service"

// Mock the service module
vi.mock("@/lib/services/dsgvo-retention-service", () => ({
  listRules: vi.fn().mockResolvedValue([
    {
      id: "r1",
      tenantId: "t1",
      dataType: "BOOKINGS",
      retentionMonths: 36,
      action: "DELETE",
      isActive: true,
      description: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  updateRule: vi.fn().mockResolvedValue({
    rule: {
      id: "r1",
      tenantId: "t1",
      dataType: "BOOKINGS",
      retentionMonths: 24,
      action: "DELETE",
      isActive: true,
      description: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    legalWarning: undefined,
  }),
  previewRetention: vi.fn().mockResolvedValue([
    {
      dataType: "BOOKINGS",
      count: 42,
      cutoffDate: new Date(),
      action: "DELETE",
      retentionMonths: 36,
    },
  ]),
  executeRetention: vi.fn().mockResolvedValue([
    {
      dataType: "BOOKINGS",
      action: "DELETE",
      recordCount: 42,
      cutoffDate: new Date(),
      durationMs: 150,
      dryRun: false,
    },
  ]),
  listDeleteLogs: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  DsgvoValidationError: class extends Error {
    constructor(msg: string) { super(msg); this.name = "DsgvoValidationError" }
  },
  DsgvoNotFoundError: class extends Error {
    constructor(msg: string) { super(msg); this.name = "DsgvoNotFoundError" }
  },
}))

// --- Constants ---

const DSGVO_VIEW = permissionIdByKey("dsgvo.view")!
const DSGVO_MANAGE = permissionIdByKey("dsgvo.manage")!
const DSGVO_EXECUTE = permissionIdByKey("dsgvo.execute")!

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"

const ALL_PERMS = [DSGVO_VIEW, DSGVO_MANAGE, DSGVO_EXECUTE]

const createCaller = createCallerFactory(dsgvoRouter)

function createTestContext(
  prisma: Record<string, unknown>,
  permissions: string[] = ALL_PERMS
) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
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

describe("dsgvo router", () => {
  describe("rules.list", () => {
    it("returns rules for tenant with dsgvo.view permission", async () => {
      const ctx = createTestContext({})
      const caller = createCaller(ctx)
      const result = await caller.rules.list({})
      expect(result).toHaveLength(1)
      expect(result[0].dataType).toBe("BOOKINGS")
      expect(dsgvoService.listRules).toHaveBeenCalledWith(
        expect.anything(),
        TENANT_ID
      )
    })

    it("throws FORBIDDEN without dsgvo.view permission", async () => {
      const ctx = createNoPermContext({})
      const caller = createCaller(ctx)
      await expect(caller.rules.list({})).rejects.toMatchObject({
        code: "FORBIDDEN",
      })
    })
  })

  describe("rules.update", () => {
    it("updates rule with dsgvo.manage permission", async () => {
      const ctx = createTestContext({})
      const caller = createCaller(ctx)
      const result = await caller.rules.update({
        dataType: "BOOKINGS",
        retentionMonths: 24,
        action: "DELETE",
        isActive: true,
      })
      expect(result.rule.retentionMonths).toBe(24)
      expect(dsgvoService.updateRule).toHaveBeenCalledWith(
        expect.anything(),
        TENANT_ID,
        {
          dataType: "BOOKINGS",
          retentionMonths: 24,
          action: "DELETE",
          isActive: true,
        },
        expect.anything()
      )
    })

    it("throws FORBIDDEN without dsgvo.manage permission", async () => {
      const ctx = createTestContext({}, [DSGVO_VIEW])
      const caller = createCaller(ctx)
      await expect(
        caller.rules.update({
          dataType: "BOOKINGS",
          retentionMonths: 24,
          action: "DELETE",
          isActive: true,
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
    })

    it("validates minimum retention months >= 6", async () => {
      const ctx = createTestContext({})
      const caller = createCaller(ctx)
      await expect(
        caller.rules.update({
          dataType: "BOOKINGS",
          retentionMonths: 3,
          action: "DELETE",
          isActive: true,
        })
      ).rejects.toThrow()
    })

    it("validates action is DELETE or ANONYMIZE", async () => {
      const ctx = createTestContext({})
      const caller = createCaller(ctx)
      await expect(
        caller.rules.update({
          dataType: "BOOKINGS",
          retentionMonths: 24,
          action: "INVALID" as "DELETE",
          isActive: true,
        })
      ).rejects.toThrow()
    })
  })

  describe("preview", () => {
    it("returns preview counts with dsgvo.view permission", async () => {
      const ctx = createTestContext({})
      const caller = createCaller(ctx)
      const result = await caller.preview({})
      expect(result).toHaveLength(1)
      expect(result[0].count).toBe(42)
      expect(dsgvoService.previewRetention).toHaveBeenCalledWith(
        expect.anything(),
        TENANT_ID,
        undefined
      )
    })

    it("accepts optional dataType filter", async () => {
      const ctx = createTestContext({})
      const caller = createCaller(ctx)
      await caller.preview({ dataType: "ABSENCES" })
      expect(dsgvoService.previewRetention).toHaveBeenCalledWith(
        expect.anything(),
        TENANT_ID,
        "ABSENCES"
      )
    })
  })

  describe("execute", () => {
    it("requires dsgvo.execute permission", async () => {
      const ctx = createTestContext({})
      const caller = createCaller(ctx)
      const result = await caller.execute({ dryRun: false })
      expect(result).toHaveLength(1)
      expect(result[0].recordCount).toBe(42)
    })

    it("throws FORBIDDEN without dsgvo.execute permission", async () => {
      const ctx = createTestContext({}, [DSGVO_VIEW])
      const caller = createCaller(ctx)
      await expect(
        caller.execute({ dryRun: false })
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
    })

    it("passes dryRun flag to service", async () => {
      const ctx = createTestContext({})
      const caller = createCaller(ctx)
      await caller.execute({ dryRun: true })
      expect(dsgvoService.executeRetention).toHaveBeenCalledWith(
        expect.anything(),
        TENANT_ID,
        expect.objectContaining({ dryRun: true }),
        expect.anything()
      )
    })

    it("passes executedBy from context user", async () => {
      const ctx = createTestContext({})
      const caller = createCaller(ctx)
      await caller.execute({ dryRun: false })
      expect(dsgvoService.executeRetention).toHaveBeenCalledWith(
        expect.anything(),
        TENANT_ID,
        expect.objectContaining({ executedBy: USER_ID }),
        expect.anything()
      )
    })
  })

  describe("logs.list", () => {
    it("returns paginated logs with dsgvo.view permission", async () => {
      const ctx = createTestContext({})
      const caller = createCaller(ctx)
      const result = await caller.logs.list({ page: 1, pageSize: 20 })
      expect(result).toEqual({ items: [], total: 0 })
    })

    it("uses default page=1 and pageSize=20", async () => {
      const ctx = createTestContext({})
      const caller = createCaller(ctx)
      await caller.logs.list({})
      expect(dsgvoService.listDeleteLogs).toHaveBeenCalledWith(
        expect.anything(),
        TENANT_ID,
        { page: 1, pageSize: 20 }
      )
    })
  })

  describe("tenant isolation", () => {
    it("rules.list only returns rules for the caller's tenant", async () => {
      const ctx = createTestContext({})
      const caller = createCaller(ctx)
      await caller.rules.list({})
      expect(dsgvoService.listRules).toHaveBeenCalledWith(
        expect.anything(),
        TENANT_ID
      )
    })

    it("execute only processes data for the caller's tenant", async () => {
      const ctx = createTestContext({})
      const caller = createCaller(ctx)
      await caller.execute({ dryRun: false })
      expect(dsgvoService.executeRetention).toHaveBeenCalledWith(
        expect.anything(),
        TENANT_ID,
        expect.anything(),
        expect.anything()
      )
    })

    it("logs.list only returns logs for the caller's tenant", async () => {
      const ctx = createTestContext({})
      const caller = createCaller(ctx)
      await caller.logs.list({})
      expect(dsgvoService.listDeleteLogs).toHaveBeenCalledWith(
        expect.anything(),
        TENANT_ID,
        expect.anything()
      )
    })
  })
})
