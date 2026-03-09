/**
 * Tests for /api/cron/execute-macros route
 *
 * Tests cover:
 * - CRON_SECRET authorization
 * - Date query parameter validation
 * - Default date behavior (today)
 * - Tenant iteration and error handling
 * - Empty results (no macros due)
 *
 * @see ZMI-TICKET-246
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ---- Route handler tests ----

const {
  mockExecuteDueMacros,
  mockEnsureSchedule,
  mockStartExecution,
  mockCompleteExecution,
  mockTenantFindMany,
} = vi.hoisted(() => ({
  mockExecuteDueMacros: vi.fn(),
  mockEnsureSchedule: vi.fn(),
  mockStartExecution: vi.fn(),
  mockCompleteExecution: vi.fn(),
  mockTenantFindMany: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    tenant: { findMany: mockTenantFindMany },
    schedule: { upsert: vi.fn() },
    scheduleExecution: { create: vi.fn(), update: vi.fn() },
    scheduleTaskExecution: { update: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock("@/server/services/macro-executor", () => ({
  MacroExecutor: class MockMacroExecutor {
    executeDueMacros = mockExecuteDueMacros
  },
}))

vi.mock("@/server/services/cron-execution-logger", () => ({
  CronExecutionLogger: class MockCronExecutionLogger {
    ensureSchedule = mockEnsureSchedule
    startExecution = mockStartExecution
    completeExecution = mockCompleteExecution
  },
}))

describe("GET /api/cron/execute-macros", () => {
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
    const url = new URL("http://localhost:3000/api/cron/execute-macros")
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
    it("returns 400 for invalid date format", async () => {
      const GET = await importGET()
      const res = await GET(
        makeRequest("Bearer test-secret", { date: "not-a-date" }),
      )
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain("Invalid date format")
    })

    it("returns 400 for partial date", async () => {
      const GET = await importGET()
      const res = await GET(
        makeRequest("Bearer test-secret", { date: "2026-03" }),
      )
      expect(res.status).toBe(400)
    })

    it("respects date query param", async () => {
      mockTenantFindMany.mockResolvedValue([])

      const GET = await importGET()
      const res = await GET(
        makeRequest("Bearer test-secret", { date: "2026-03-08" }),
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.date).toBe("2026-03-08")
    })

    it("defaults to today when no date provided", async () => {
      mockTenantFindMany.mockResolvedValue([])

      const GET = await importGET()
      const res = await GET(makeRequest("Bearer test-secret"))
      expect(res.status).toBe(200)
      const body = await res.json()
      // Should have a valid date string
      expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  // ---- Tenant iteration tests ----

  describe("tenant iteration", () => {
    it("processes all active tenants", async () => {
      mockTenantFindMany.mockResolvedValue([{ id: "t-1" }, { id: "t-2" }])
      mockExecuteDueMacros.mockResolvedValue({
        executed: 3,
        failed: 0,
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
        makeRequest("Bearer test-secret", { date: "2026-03-08" }),
      )
      expect(res.status).toBe(200)
      const body = await res.json()

      expect(body.tenantsProcessed).toBe(2)
      expect(body.tenantsFailed).toBe(0)
      expect(body.totalExecuted).toBe(6) // 2 tenants * 3
      expect(body.totalFailed).toBe(0)
      expect(body.results).toHaveLength(2)
      expect(body.ok).toBe(true)
    })

    it("returns ok=true with 0 executed when no macros are due", async () => {
      mockTenantFindMany.mockResolvedValue([{ id: "t-1" }])
      mockExecuteDueMacros.mockResolvedValue({
        executed: 0,
        failed: 0,
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
        makeRequest("Bearer test-secret", { date: "2026-03-08" }),
      )
      expect(res.status).toBe(200)
      const body = await res.json()

      expect(body.ok).toBe(true)
      expect(body.totalExecuted).toBe(0)
      expect(body.totalFailed).toBe(0)
    })

    it("returns empty results when no active tenants", async () => {
      mockTenantFindMany.mockResolvedValue([])

      const GET = await importGET()
      const res = await GET(
        makeRequest("Bearer test-secret", { date: "2026-03-08" }),
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
      mockExecuteDueMacros
        .mockResolvedValueOnce({
          executed: 2,
          failed: 0,
          errors: [],
        })
        .mockRejectedValueOnce(new Error("DB connection lost"))
        .mockResolvedValueOnce({
          executed: 1,
          failed: 0,
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
        makeRequest("Bearer test-secret", { date: "2026-03-08" }),
      )
      expect(res.status).toBe(200)
      const body = await res.json()

      expect(body.tenantsProcessed).toBe(3)
      expect(body.tenantsFailed).toBe(1)
      expect(body.totalExecuted).toBe(3) // 2 + 1
      expect(body.results).toHaveLength(3)

      const failedResult = body.results.find(
        (r: TenantResult) => r.tenantId === "t-2",
      )
      expect(failedResult).toBeDefined()
      expect(failedResult.error).toBe("DB connection lost")
      expect(body.ok).toBe(false)
    })

    it("reports partial status when some macros fail within a tenant", async () => {
      mockTenantFindMany.mockResolvedValue([{ id: "t-1" }])
      mockExecuteDueMacros.mockResolvedValue({
        executed: 2,
        failed: 1,
        errors: [
          {
            macroId: "m-1",
            assignmentId: "a-1",
            error: "action failed",
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
        makeRequest("Bearer test-secret", { date: "2026-03-08" }),
      )
      expect(res.status).toBe(200)
      const body = await res.json()

      expect(body.tenantsFailed).toBe(1) // partial counts as failed
      expect(body.totalExecuted).toBe(2)
      expect(body.totalFailed).toBe(1)

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
        makeRequest("Bearer test-secret", { date: "2026-03-08" }),
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
  executed: number
  failed: number
  durationMs: number
  error?: string
}
