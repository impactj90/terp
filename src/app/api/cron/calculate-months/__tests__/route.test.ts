/**
 * Tests for /api/cron/calculate-months route
 *
 * Tests cover:
 * - computeDefaultMonth pure function
 * - CRON_SECRET authorization
 * - Year/month query parameter validation
 * - Tenant iteration and error handling
 * - Execution logging
 *
 * @see ZMI-TICKET-246
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { computeDefaultMonth } from "../route"

// ---- computeDefaultMonth unit tests ----

describe("computeDefaultMonth", () => {
  it("returns December of previous year when now is January", () => {
    const now = new Date("2026-01-15T12:00:00Z")
    const result = computeDefaultMonth(now)
    expect(result.year).toBe(2025)
    expect(result.month).toBe(12)
  })

  it("returns February when now is March", () => {
    const now = new Date("2026-03-08T12:00:00Z")
    const result = computeDefaultMonth(now)
    expect(result.year).toBe(2026)
    expect(result.month).toBe(2)
  })

  it("returns November when now is December", () => {
    const now = new Date("2026-12-02T03:00:00Z")
    const result = computeDefaultMonth(now)
    expect(result.year).toBe(2026)
    expect(result.month).toBe(11)
  })

  it("returns July when now is August 1st", () => {
    const now = new Date("2026-08-01T00:00:00Z")
    const result = computeDefaultMonth(now)
    expect(result.year).toBe(2026)
    expect(result.month).toBe(7)
  })
})

// ---- Route handler tests ----

const {
  mockCalculateMonthBatch,
  mockEnsureSchedule,
  mockStartExecution,
  mockCompleteExecution,
  mockTenantFindMany,
  mockEmployeeFindMany,
} = vi.hoisted(() => ({
  mockCalculateMonthBatch: vi.fn(),
  mockEnsureSchedule: vi.fn(),
  mockStartExecution: vi.fn(),
  mockCompleteExecution: vi.fn(),
  mockTenantFindMany: vi.fn(),
  mockEmployeeFindMany: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    tenant: { findMany: mockTenantFindMany },
    employee: { findMany: mockEmployeeFindMany },
    schedule: { upsert: vi.fn() },
    scheduleExecution: { create: vi.fn(), update: vi.fn() },
    scheduleTaskExecution: { update: vi.fn() },
    cronCheckpoint: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock("@/lib/services/monthly-calc", () => ({
  MonthlyCalcService: class MockMonthlyCalcService {
    calculateMonthBatch = mockCalculateMonthBatch
  },
}))

vi.mock("@/lib/services/cron-execution-logger", () => ({
  CronExecutionLogger: class MockCronExecutionLogger {
    ensureSchedule = mockEnsureSchedule
    startExecution = mockStartExecution
    completeExecution = mockCompleteExecution
  },
}))

describe("GET /api/cron/calculate-months", () => {
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
    const url = new URL("http://localhost:3000/api/cron/calculate-months")
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
    it("returns 400 for invalid year", async () => {
      const GET = await importGET()
      const res = await GET(
        makeRequest("Bearer test-secret", { year: "abc" }),
      )
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain("Invalid year")
    })

    it("returns 400 for year out of range", async () => {
      const GET = await importGET()
      const res = await GET(
        makeRequest("Bearer test-secret", { year: "2500" }),
      )
      expect(res.status).toBe(400)
    })

    it("returns 400 for invalid month", async () => {
      const GET = await importGET()
      const res = await GET(
        makeRequest("Bearer test-secret", { month: "13" }),
      )
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain("Invalid month")
    })

    it("returns 400 for month 0", async () => {
      const GET = await importGET()
      const res = await GET(
        makeRequest("Bearer test-secret", { month: "0" }),
      )
      expect(res.status).toBe(400)
    })

    it("respects year and month query params", async () => {
      mockTenantFindMany.mockResolvedValue([])

      const GET = await importGET()
      const res = await GET(
        makeRequest("Bearer test-secret", { year: "2026", month: "1" }),
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.year).toBe(2026)
      expect(body.month).toBe(1)
    })

    it("defaults to previous month when no params provided", async () => {
      mockTenantFindMany.mockResolvedValue([])

      const GET = await importGET()
      const res = await GET(makeRequest("Bearer test-secret"))
      expect(res.status).toBe(200)
      const body = await res.json()
      // Should be previous month relative to "now"
      expect(body.year).toBeDefined()
      expect(body.month).toBeDefined()
    })
  })

  // ---- Tenant iteration tests ----

  describe("tenant iteration", () => {
    it("processes all active tenants", async () => {
      mockTenantFindMany.mockResolvedValue([{ id: "t-1" }, { id: "t-2" }])
      mockEmployeeFindMany.mockResolvedValue([{ id: "e-1" }, { id: "e-2" }])
      mockCalculateMonthBatch.mockResolvedValue({
        processedMonths: 2,
        skippedMonths: 0,
        failedMonths: 0,
        errors: [],
      })
      mockEnsureSchedule.mockResolvedValue("schedule-1")
      mockStartExecution.mockResolvedValue({
        executionId: "exec-1",
        taskExecutionId: "task-exec-1",
      })
      mockCompleteExecution.mockResolvedValue(undefined)

      const GET = await importGET()
      const res = await GET(
        makeRequest("Bearer test-secret", { year: "2026", month: "2" }),
      )
      expect(res.status).toBe(200)
      const body = await res.json()

      expect(body.tenantsProcessed).toBe(2)
      expect(body.tenantsFailed).toBe(0)
      expect(body.totalProcessedMonths).toBe(4) // 2 tenants * 2 employees
      expect(body.results).toHaveLength(2)
      expect(body.ok).toBe(true)
    })

    it("returns empty results when no active tenants", async () => {
      mockTenantFindMany.mockResolvedValue([])

      const GET = await importGET()
      const res = await GET(
        makeRequest("Bearer test-secret", { year: "2026", month: "2" }),
      )
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
      mockEmployeeFindMany.mockResolvedValue([{ id: "e-1" }])
      mockCalculateMonthBatch
        .mockResolvedValueOnce({
          processedMonths: 1,
          skippedMonths: 0,
          failedMonths: 0,
          errors: [],
        })
        .mockRejectedValueOnce(new Error("DB connection lost"))
        .mockResolvedValueOnce({
          processedMonths: 1,
          skippedMonths: 0,
          failedMonths: 0,
          errors: [],
        })
      mockEnsureSchedule.mockResolvedValue("schedule-1")
      mockStartExecution.mockResolvedValue({
        executionId: "exec-1",
        taskExecutionId: "task-exec-1",
      })
      mockCompleteExecution.mockResolvedValue(undefined)

      const GET = await importGET()
      const res = await GET(
        makeRequest("Bearer test-secret", { year: "2026", month: "2" }),
      )
      expect(res.status).toBe(200)
      const body = await res.json()

      expect(body.tenantsProcessed).toBe(3)
      expect(body.tenantsFailed).toBe(1)
      expect(body.totalProcessedMonths).toBe(2) // t-1(1) + t-3(1)
      expect(body.results).toHaveLength(3)

      const failedResult = body.results.find(
        (r: TenantResult) => r.tenantId === "t-2",
      )
      expect(failedResult).toBeDefined()
      expect(failedResult.error).toBe("DB connection lost")
      expect(body.ok).toBe(false)
    })

    it("reports partial status when some employees fail within a tenant", async () => {
      mockTenantFindMany.mockResolvedValue([{ id: "t-1" }])
      mockEmployeeFindMany.mockResolvedValue([{ id: "e-1" }, { id: "e-2" }])
      mockCalculateMonthBatch.mockResolvedValue({
        processedMonths: 1,
        skippedMonths: 0,
        failedMonths: 1,
        errors: [
          {
            employeeId: "e-2",
            year: 2026,
            month: 2,
            error: "calculation failed",
          },
        ],
      })
      mockEnsureSchedule.mockResolvedValue("schedule-1")
      mockStartExecution.mockResolvedValue({
        executionId: "exec-1",
        taskExecutionId: "task-exec-1",
      })
      mockCompleteExecution.mockResolvedValue(undefined)

      const GET = await importGET()
      const res = await GET(
        makeRequest("Bearer test-secret", { year: "2026", month: "2" }),
      )
      expect(res.status).toBe(200)
      const body = await res.json()

      expect(body.tenantsFailed).toBe(1) // partial counts as failed
      expect(body.totalProcessedMonths).toBe(1)
      expect(body.totalFailedMonths).toBe(1)

      expect(mockCompleteExecution).toHaveBeenCalledWith(
        "exec-1",
        "task-exec-1",
        "schedule-1",
        expect.objectContaining({ status: "partial" }),
      )
    })
  })

  // ---- 500 error handling ----

  describe("fatal error handling", () => {
    it("returns 500 when tenant loading throws", async () => {
      mockTenantFindMany.mockRejectedValue(new Error("Database unreachable"))

      const GET = await importGET()
      const res = await GET(
        makeRequest("Bearer test-secret", { year: "2026", month: "2" }),
      )
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
  processedMonths: number
  skippedMonths: number
  failedMonths: number
  durationMs: number
  error?: string
}
