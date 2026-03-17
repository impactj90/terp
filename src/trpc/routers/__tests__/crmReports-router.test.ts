import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { crmReportsRouter } from "../crm/reports"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// Mock the db module used by requireModule middleware
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "crm" }),
    },
  },
}))

// --- Constants ---
const ADDR_VIEW = permissionIdByKey("crm_addresses.view")!
const CORR_VIEW = permissionIdByKey("crm_correspondence.view")!
const INQ_VIEW = permissionIdByKey("crm_inquiries.view")!
const TASK_VIEW = permissionIdByKey("crm_tasks.view")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"

const createCaller = createCallerFactory(crmReportsRouter)

// --- Helpers ---

const MODULE_MOCK = {
  tenantModule: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "crm" }),
  },
}

function withModuleMock(prisma: Record<string, unknown>) {
  return { ...MODULE_MOCK, ...prisma }
}

function createTestContext(
  prisma: Record<string, unknown>,
  permissions: string[] = [ADDR_VIEW, CORR_VIEW, INQ_VIEW, TASK_VIEW]
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

// --- crm.reports.overview ---

describe("crm.reports.overview", () => {
  it("returns summary metrics", async () => {
    const prisma = {
      crmAddress: {
        count: vi.fn().mockResolvedValue(10),
      },
      crmInquiry: {
        count: vi.fn().mockResolvedValue(3),
      },
      crmTask: {
        count: vi.fn().mockResolvedValue(5),
      },
      crmCorrespondence: {
        count: vi.fn().mockResolvedValue(7),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.overview()

    expect(result).toBeDefined()
    expect(result!.totalAddresses).toBe(10)
  })

  it("requires crm_addresses.view permission", async () => {
    const prisma = {
      crmAddress: { count: vi.fn() },
      crmInquiry: { count: vi.fn() },
      crmTask: { count: vi.fn() },
      crmCorrespondence: { count: vi.fn() },
    }

    const caller = createCaller(createNoPermContext(prisma))

    await expect(caller.overview()).rejects.toThrow("Insufficient permissions")
  })

  it("requires CRM module enabled", async () => {
    const prisma = {
      crmAddress: { count: vi.fn() },
      crmInquiry: { count: vi.fn() },
      crmTask: { count: vi.fn() },
      crmCorrespondence: { count: vi.fn() },
    }

    const ctx = createMockContext({
      prisma: {
        ...prisma,
        tenantModule: {
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn().mockResolvedValue(null),
        },
      } as unknown as ReturnType<typeof createMockContext>["prisma"],
      authToken: "test-token",
      user: createUserWithPermissions([ADDR_VIEW], {
        id: USER_ID,
        userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
      }),
      session: createMockSession(),
      tenantId: TENANT_ID,
    })

    const caller = createCaller(ctx)

    await expect(caller.overview()).rejects.toThrow(/Module "crm" is not enabled/)
  })
})

// --- crm.reports.addressStats ---

describe("crm.reports.addressStats", () => {
  it("returns address distribution data", async () => {
    const prisma = {
      crmAddress: {
        groupBy: vi.fn().mockResolvedValue([
          { type: "CUSTOMER", _count: 20 },
        ]),
        count: vi.fn().mockResolvedValue(20),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.addressStats({})

    expect(result).toBeDefined()
    expect(result!.byType).toHaveLength(1)
    expect(result!.byType[0]!.type).toBe("CUSTOMER")
  })

  it("requires crm_addresses.view permission", async () => {
    const prisma = {
      crmAddress: {
        groupBy: vi.fn(),
        count: vi.fn(),
      },
    }

    const caller = createCaller(createNoPermContext(prisma))

    await expect(caller.addressStats({})).rejects.toThrow("Insufficient permissions")
  })
})

// --- crm.reports.correspondenceByPeriod ---

describe("crm.reports.correspondenceByPeriod", () => {
  it("returns grouped correspondence data", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        { period: new Date("2026-01-01"), direction: "INCOMING", count: BigInt(5) },
      ]),
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.correspondenceByPeriod({
      dateFrom: "2026-01-01T00:00:00.000Z",
      dateTo: "2026-03-01T00:00:00.000Z",
      groupBy: "month",
    })

    expect(result).toBeDefined()
    expect(result!.periods).toHaveLength(1)
    expect(result!.periods[0]!.incoming).toBe(5)
  })

  it("requires crm_correspondence.view permission", async () => {
    const prisma = { $queryRaw: vi.fn() }

    const caller = createCaller(createTestContext(prisma, [ADDR_VIEW]))

    await expect(
      caller.correspondenceByPeriod({
        dateFrom: "2026-01-01T00:00:00.000Z",
        dateTo: "2026-03-01T00:00:00.000Z",
        groupBy: "month",
      })
    ).rejects.toThrow("Insufficient permissions")
  })
})

// --- crm.reports.correspondenceByType ---

describe("crm.reports.correspondenceByType", () => {
  it("returns type distribution data", async () => {
    const prisma = {
      crmCorrespondence: {
        groupBy: vi.fn().mockResolvedValue([
          { type: "email", _count: 15 },
          { type: "phone", _count: 8 },
        ]),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.correspondenceByType({
      dateFrom: "2026-01-01T00:00:00.000Z",
      dateTo: "2026-03-01T00:00:00.000Z",
    })

    expect(result).toBeDefined()
    expect(result!.byType).toHaveLength(2)
  })
})

// --- crm.reports.inquiryPipeline ---

describe("crm.reports.inquiryPipeline", () => {
  it("returns pipeline data with avg close time", async () => {
    const prisma = {
      crmInquiry: {
        groupBy: vi
          .fn()
          .mockResolvedValueOnce([{ status: "CLOSED", _count: 1 }])
          .mockResolvedValueOnce([]),
        findMany: vi.fn().mockResolvedValueOnce([
          {
            createdAt: new Date("2026-03-01"),
            closedAt: new Date("2026-03-11"),
          },
        ]),
      },
      crmAddress: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.inquiryPipeline({})

    expect(result).toBeDefined()
    expect(result!.avgDaysToClose).toBe(10)
  })

  it("requires crm_inquiries.view permission", async () => {
    const prisma = {
      crmInquiry: {
        groupBy: vi.fn(),
        findMany: vi.fn(),
      },
      crmAddress: { findMany: vi.fn() },
    }

    const caller = createCaller(createTestContext(prisma, [ADDR_VIEW]))

    await expect(caller.inquiryPipeline({})).rejects.toThrow("Insufficient permissions")
  })
})

// --- crm.reports.inquiryByEffort ---

describe("crm.reports.inquiryByEffort", () => {
  it("returns effort distribution data", async () => {
    const prisma = {
      crmInquiry: {
        groupBy: vi.fn().mockResolvedValue([
          { effort: "Gering", _count: 4 },
        ]),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.inquiryByEffort({})

    expect(result).toBeDefined()
    expect(result!.byEffort).toHaveLength(1)
  })
})

// --- crm.reports.taskCompletion ---

describe("crm.reports.taskCompletion", () => {
  it("returns completion metrics", async () => {
    const prisma = {
      crmTask: {
        count: vi
          .fn()
          .mockResolvedValueOnce(10) // total
          .mockResolvedValueOnce(8) // completed
          .mockResolvedValueOnce(1) // cancelled
          .mockResolvedValueOnce(0), // overdue
        findMany: vi.fn().mockResolvedValueOnce([]),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.taskCompletion({})

    expect(result).toBeDefined()
    expect(result!.total).toBe(10)
    expect(result!.completed).toBe(8)
    expect(result!.completionRate).toBe(80)
  })

  it("requires crm_tasks.view permission", async () => {
    const prisma = {
      crmTask: {
        count: vi.fn(),
        findMany: vi.fn(),
      },
    }

    const caller = createCaller(createTestContext(prisma, [ADDR_VIEW]))

    await expect(caller.taskCompletion({})).rejects.toThrow("Insufficient permissions")
  })
})

// --- crm.reports.tasksByAssignee ---

describe("crm.reports.tasksByAssignee", () => {
  it("returns per-assignee breakdown", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          employee_id: "emp-1",
          first_name: "Max",
          last_name: "Mustermann",
          total: 10,
          completed: 7,
          open: 3,
        },
      ]),
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.tasksByAssignee({})

    expect(result).toBeDefined()
    expect(result!.assignees).toHaveLength(1)
    expect(result!.assignees[0]!.name).toBe("Max Mustermann")
    expect(result!.assignees[0]!.total).toBe(10)
  })
})
