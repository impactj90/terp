/**
 * Tests for /api/cron/generate-day-plans route
 *
 * Tests cover:
 * - CRON_SECRET authorization
 * - days_ahead query parameter validation
 * - Tenant iteration and error handling
 * - Default behavior (days_ahead=14)
 * - Date range computation
 *
 * @see ZMI-TICKET-246
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ---- Route handler tests ----

const {
  mockGenerateFromTariff,
  mockEnsureSchedule,
  mockStartExecution,
  mockCompleteExecution,
  mockTenantFindMany,
} = vi.hoisted(() => ({
  mockGenerateFromTariff: vi.fn(),
  mockEnsureSchedule: vi.fn(),
  mockStartExecution: vi.fn(),
  mockCompleteExecution: vi.fn(),
  mockTenantFindMany: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    tenant: { findMany: mockTenantFindMany },
    employee: { findMany: vi.fn() },
    schedule: { upsert: vi.fn() },
    scheduleExecution: { create: vi.fn(), update: vi.fn() },
    scheduleTaskExecution: { update: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock("@/server/services/employee-day-plan-generator", () => ({
  EmployeeDayPlanGenerator: class MockEmployeeDayPlanGenerator {
    generateFromTariff = mockGenerateFromTariff
  },
}))

vi.mock("@/server/services/cron-execution-logger", () => ({
  CronExecutionLogger: class MockCronExecutionLogger {
    ensureSchedule = mockEnsureSchedule
    startExecution = mockStartExecution
    completeExecution = mockCompleteExecution
  },
}))

describe("GET /api/cron/generate-day-plans", () => {
  let originalCronSecret: string | undefined

  beforeEach(() => {
    originalCronSecret = process.env.CRON_SECRET
    process.env.CRON_SECRET = "test-secret"
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET
    } else {
      process.env.CRON_SECRET = originalCronSecret
    }
  })

  async function importGET() {
    const mod = await import("../route")
    return mod.GET
  }

  function makeRequest(
    authHeader?: string,
    queryParams?: Record<string, string>,
  ) {
    const url = new URL("http://localhost:3000/api/cron/generate-day-plans")
    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) {
        url.searchParams.set(key, value)
      }
    }
    const headers: Record<string, string> = {}
    if (authHeader !== undefined) {
      headers["authorization"] = authHeader
    }
    return new Request(url.toString(), { headers })
  }

  // ---- Auth tests ----

  describe("authorization", () => {
    it("returns 401 when no Authorization header", async () => {
      const GET = await importGET()
      const res = await GET(makeRequest())
      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.error).toBe("Unauthorized")
    })

    it("returns 401 when wrong CRON_SECRET", async () => {
      const GET = await importGET()
      const res = await GET(makeRequest("Bearer wrong-secret"))
      expect(res.status).toBe(401)
    })

    it("returns 401 when Authorization header is missing Bearer prefix", async () => {
      const GET = await importGET()
      const res = await GET(makeRequest("test-secret"))
      expect(res.status).toBe(401)
    })
  })

  // ---- Query param validation tests ----

  describe("query parameter validation", () => {
    it("returns 400 for invalid days_ahead", async () => {
      const GET = await importGET()
      const res = await GET(
        makeRequest("Bearer test-secret", { days_ahead: "abc" }),
      )
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain("Invalid days_ahead")
    })

    it("returns 400 for days_ahead=0", async () => {
      const GET = await importGET()
      const res = await GET(
        makeRequest("Bearer test-secret", { days_ahead: "0" }),
      )
      expect(res.status).toBe(400)
    })

    it("returns 400 for negative days_ahead", async () => {
      const GET = await importGET()
      const res = await GET(
        makeRequest("Bearer test-secret", { days_ahead: "-1" }),
      )
      expect(res.status).toBe(400)
    })

    it("returns 400 for days_ahead > 365", async () => {
      const GET = await importGET()
      const res = await GET(
        makeRequest("Bearer test-secret", { days_ahead: "999" }),
      )
      expect(res.status).toBe(400)
    })

    it("respects days_ahead query param", async () => {
      mockTenantFindMany.mockResolvedValue([])

      const GET = await importGET()
      const res = await GET(
        makeRequest("Bearer test-secret", { days_ahead: "7" }),
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.daysAhead).toBe(7)
    })

    it("defaults to 14 days when no days_ahead provided", async () => {
      mockTenantFindMany.mockResolvedValue([])

      const GET = await importGET()
      const res = await GET(makeRequest("Bearer test-secret"))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.daysAhead).toBe(14)
    })
  })

  // ---- Tenant iteration tests ----

  describe("tenant iteration", () => {
    it("processes all active tenants", async () => {
      mockTenantFindMany.mockResolvedValue([{ id: "t-1" }, { id: "t-2" }])
      mockGenerateFromTariff.mockResolvedValue({
        employeesProcessed: 3,
        plansCreated: 10,
        plansUpdated: 2,
        employeesSkipped: 1,
      })
      mockEnsureSchedule.mockResolvedValue("schedule-1")
      mockStartExecution.mockResolvedValue({
        executionId: "exec-1",
        taskExecutionId: "task-exec-1",
      })
      mockCompleteExecution.mockResolvedValue(undefined)

      const GET = await importGET()
      const res = await GET(makeRequest("Bearer test-secret"))
      expect(res.status).toBe(200)
      const body = await res.json()

      expect(body.tenantsProcessed).toBe(2)
      expect(body.tenantsFailed).toBe(0)
      expect(body.totalEmployeesProcessed).toBe(6) // 2 tenants * 3
      expect(body.totalPlansCreated).toBe(20) // 2 tenants * 10
      expect(body.totalPlansUpdated).toBe(4) // 2 tenants * 2
      expect(body.totalEmployeesSkipped).toBe(2) // 2 tenants * 1
      expect(body.results).toHaveLength(2)
      expect(body.ok).toBe(true)
    })

    it("returns empty results when no active tenants", async () => {
      mockTenantFindMany.mockResolvedValue([])

      const GET = await importGET()
      const res = await GET(makeRequest("Bearer test-secret"))
      expect(res.status).toBe(200)
      const body = await res.json()

      expect(body.tenantsProcessed).toBe(0)
      expect(body.tenantsFailed).toBe(0)
      expect(body.results).toHaveLength(0)
    })

    it("continues processing when one tenant fails", async () => {
      mockTenantFindMany.mockResolvedValue([
        { id: "t-1" },
        { id: "t-2" },
        { id: "t-3" },
      ])
      mockGenerateFromTariff
        .mockResolvedValueOnce({
          employeesProcessed: 2,
          plansCreated: 5,
          plansUpdated: 0,
          employeesSkipped: 0,
        })
        .mockRejectedValueOnce(new Error("DB connection lost"))
        .mockResolvedValueOnce({
          employeesProcessed: 3,
          plansCreated: 7,
          plansUpdated: 1,
          employeesSkipped: 0,
        })
      mockEnsureSchedule.mockResolvedValue("schedule-1")
      mockStartExecution.mockResolvedValue({
        executionId: "exec-1",
        taskExecutionId: "task-exec-1",
      })
      mockCompleteExecution.mockResolvedValue(undefined)

      const GET = await importGET()
      const res = await GET(makeRequest("Bearer test-secret"))
      expect(res.status).toBe(200)
      const body = await res.json()

      expect(body.tenantsProcessed).toBe(3)
      expect(body.tenantsFailed).toBe(1)
      expect(body.totalPlansCreated).toBe(12) // 5 + 7
      expect(body.results).toHaveLength(3)

      const failedResult = body.results.find(
        (r: TenantResult) => r.tenantId === "t-2",
      )
      expect(failedResult).toBeDefined()
      expect(failedResult.error).toBe("DB connection lost")
      expect(body.ok).toBe(false)
    })
  })

  // ---- 500 error handling ----

  describe("fatal error handling", () => {
    it("returns 500 when tenant loading throws", async () => {
      mockTenantFindMany.mockRejectedValue(new Error("Database unreachable"))

      const GET = await importGET()
      const res = await GET(makeRequest("Bearer test-secret"))
      expect(res.status).toBe(500)
      const body = await res.json()
      expect(body.error).toBe("Internal server error")
      expect(body.message).toBe("Database unreachable")
    })
  })
})

// Type for tenant result assertions
type TenantResult = {
  tenantId: string
  employeesProcessed: number
  plansCreated: number
  plansUpdated: number
  employeesSkipped: number
  durationMs: number
  error?: string
}
