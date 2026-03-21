/**
 * Tests for /api/cron/calculate-days route
 *
 * Tests cover:
 * - CRON_SECRET authorization
 * - Date range parsing and computation
 * - Tenant iteration and error handling
 * - Execution logging
 *
 * @see ZMI-TICKET-245
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { PrismaClient } from "@/generated/prisma/client"
import type * as CronLoggerModule from "@/lib/services/cron-execution-logger"
import { computeDateRange } from "../route"

// ---- computeDateRange unit tests ----

describe("computeDateRange", () => {
  // Fixed reference time: 2026-03-08T12:00:00Z
  const now = new Date("2026-03-08T12:00:00Z")

  it("computes 'today' as the current UTC date", () => {
    const { from, to } = computeDateRange("today", now)
    expect(from.toISOString()).toBe("2026-03-08T00:00:00.000Z")
    expect(to.toISOString()).toBe("2026-03-08T00:00:00.000Z")
  })

  it("computes 'yesterday' as one day before", () => {
    const { from, to } = computeDateRange("yesterday", now)
    expect(from.toISOString()).toBe("2026-03-07T00:00:00.000Z")
    expect(to.toISOString()).toBe("2026-03-07T00:00:00.000Z")
  })

  it("computes 'last_7_days' as 6 days ago to today", () => {
    const { from, to } = computeDateRange("last_7_days", now)
    expect(from.toISOString()).toBe("2026-03-02T00:00:00.000Z")
    expect(to.toISOString()).toBe("2026-03-08T00:00:00.000Z")
  })

  it("computes 'current_month' as 1st of month to today", () => {
    const { from, to } = computeDateRange("current_month", now)
    expect(from.toISOString()).toBe("2026-03-01T00:00:00.000Z")
    expect(to.toISOString()).toBe("2026-03-08T00:00:00.000Z")
  })

  it("handles month boundary for yesterday at month start", () => {
    const monthStart = new Date("2026-03-01T02:00:00Z")
    const { from, to } = computeDateRange("yesterday", monthStart)
    expect(from.toISOString()).toBe("2026-02-28T00:00:00.000Z")
    expect(to.toISOString()).toBe("2026-02-28T00:00:00.000Z")
  })

  it("handles year boundary for yesterday at year start", () => {
    const yearStart = new Date("2026-01-01T02:00:00Z")
    const { from, to } = computeDateRange("yesterday", yearStart)
    expect(from.toISOString()).toBe("2025-12-31T00:00:00.000Z")
    expect(to.toISOString()).toBe("2025-12-31T00:00:00.000Z")
  })

  it("returns midnight UTC dates regardless of time component", () => {
    const lateEvening = new Date("2026-03-08T23:59:59.999Z")
    const { from, to } = computeDateRange("today", lateEvening)
    expect(from.toISOString()).toBe("2026-03-08T00:00:00.000Z")
    expect(to.toISOString()).toBe("2026-03-08T00:00:00.000Z")
  })
})

// ---- Route handler tests ----

// Use vi.hoisted() so mock state is available inside vi.mock() factories
const {
  mockTriggerRecalcAll,
  mockEnsureSchedule,
  mockStartExecution,
  mockCompleteExecution,
  mockTenantFindMany,
} = vi.hoisted(() => ({
  mockTriggerRecalcAll: vi.fn(),
  mockEnsureSchedule: vi.fn(),
  mockStartExecution: vi.fn(),
  mockCompleteExecution: vi.fn(),
  mockTenantFindMany: vi.fn(),
}))

// Mock modules before importing the route handler
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    tenant: { findMany: mockTenantFindMany },
    employee: { findMany: vi.fn() },
    schedule: { upsert: vi.fn() },
    scheduleExecution: { create: vi.fn(), update: vi.fn() },
    scheduleTaskExecution: { update: vi.fn() },
    cronCheckpoint: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock("@/lib/services/recalc", () => ({
  RecalcService: class MockRecalcService {
    triggerRecalcAll = mockTriggerRecalcAll
  },
}))

vi.mock("@/lib/services/cron-execution-logger", () => ({
  CronExecutionLogger: class MockCronExecutionLogger {
    ensureSchedule = mockEnsureSchedule
    startExecution = mockStartExecution
    completeExecution = mockCompleteExecution
  },
}))

describe("GET /api/cron/calculate-days", () => {
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
    const url = new URL("http://localhost:3000/api/cron/calculate-days")
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

  // ---- Date range validation tests ----

  describe("date_range validation", () => {
    it("returns 400 for unknown date_range", async () => {
      const GET = await importGET()
      const res = await GET(
        makeRequest("Bearer test-secret", { date_range: "invalid" }),
      )
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain("Invalid date_range")
    })

    it("accepts valid date_range values", async () => {
      mockTenantFindMany.mockResolvedValue([])

      const GET = await importGET()

      for (const dr of [
        "today",
        "yesterday",
        "last_7_days",
        "current_month",
      ]) {
        const res = await GET(
          makeRequest("Bearer test-secret", { date_range: dr }),
        )
        expect(res.status).toBe(200)
      }
    })

    it("defaults to 'today' when no date_range is provided", async () => {
      mockTenantFindMany.mockResolvedValue([])

      const GET = await importGET()
      const res = await GET(makeRequest("Bearer test-secret"))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.dateRange).toBe("today")
    })
  })

  // ---- Tenant iteration tests ----

  describe("tenant iteration", () => {
    it("processes all active tenants", async () => {
      mockTenantFindMany.mockResolvedValue([{ id: "t-1" }, { id: "t-2" }])
      mockTriggerRecalcAll.mockResolvedValue({
        processedDays: 5,
        failedDays: 0,
        errors: [],
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
      expect(body.totalProcessedDays).toBe(10) // 2 tenants * 5 days
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
      mockTriggerRecalcAll
        .mockResolvedValueOnce({
          processedDays: 3,
          failedDays: 0,
          errors: [],
        })
        .mockRejectedValueOnce(new Error("DB connection lost"))
        .mockResolvedValueOnce({
          processedDays: 4,
          failedDays: 0,
          errors: [],
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

      // All 3 tenants were processed, 1 failed
      expect(body.tenantsProcessed).toBe(3)
      expect(body.tenantsFailed).toBe(1)
      expect(body.totalProcessedDays).toBe(7) // t-1(3) + t-3(4)
      expect(body.results).toHaveLength(3)

      // The failed tenant should have an error in results
      const failedResult = body.results.find(
        (r: TenantResult) => r.tenantId === "t-2",
      )
      expect(failedResult).toBeDefined()
      expect(failedResult.error).toBe("DB connection lost")
      expect(body.ok).toBe(false)
    })

    it("reports partial status when some employees fail within a tenant", async () => {
      mockTenantFindMany.mockResolvedValue([{ id: "t-1" }])
      mockTriggerRecalcAll.mockResolvedValue({
        processedDays: 8,
        failedDays: 2,
        errors: [
          {
            employeeId: "e-1",
            date: new Date("2026-03-08T00:00:00Z"),
            error: "missing day plan",
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
      const res = await GET(makeRequest("Bearer test-secret"))
      expect(res.status).toBe(200)
      const body = await res.json()

      expect(body.tenantsFailed).toBe(1) // partial counts as failed
      expect(body.totalProcessedDays).toBe(8)
      expect(body.totalFailedDays).toBe(2)

      // Verify the logger was called with "partial" status
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
      const res = await GET(makeRequest("Bearer test-secret"))
      expect(res.status).toBe(500)
      const body = await res.json()
      expect(body.error).toBe("Internal server error")
      expect(body.message).toBe("Database unreachable")
    })
  })
})

// ---- CronExecutionLogger unit tests ----

describe("CronExecutionLogger", () => {
  // Test the logger separately without route handler integration
  // These test the class interface and method contracts

  it("can be instantiated with a PrismaClient", async () => {
    // Direct import (not mocked) to verify the class shape
    const { CronExecutionLogger } = await vi.importActual<typeof CronLoggerModule>("@/lib/services/cron-execution-logger")

    const mockPrisma = {} as unknown as PrismaClient
    const logger = new CronExecutionLogger(mockPrisma)
    expect(logger).toBeDefined()
    expect(logger).toBeInstanceOf(CronExecutionLogger)
  })

  it("ensureSchedule upserts with correct parameters", async () => {
    const { CronExecutionLogger } = await vi.importActual<typeof CronLoggerModule>("@/lib/services/cron-execution-logger")

    const mockUpsert = vi.fn().mockResolvedValue({ id: "schedule-123" })
    const mockPrisma = {
      schedule: { upsert: mockUpsert },
    } as unknown as PrismaClient

    const logger = new CronExecutionLogger(mockPrisma)
    const id = await logger.ensureSchedule(
      "tenant-1",
      "calculate_days_cron",
      "calculate_days",
    )

    expect(id).toBe("schedule-123")
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_name: {
            tenantId: "tenant-1",
            name: "calculate_days_cron",
          },
        },
        create: expect.objectContaining({
          tenantId: "tenant-1",
          name: "calculate_days_cron",
          timingType: "daily",
          isEnabled: true,
        }),
        update: expect.objectContaining({
          isEnabled: true,
        }),
        select: { id: true },
      }),
    )
  })

  it("startExecution creates execution with running status", async () => {
    const { CronExecutionLogger } = await vi.importActual<typeof CronLoggerModule>("@/lib/services/cron-execution-logger")

    const mockCreate = vi.fn().mockResolvedValue({
      id: "exec-123",
      taskExecutions: [{ id: "task-exec-123" }],
    })
    const mockPrisma = {
      scheduleExecution: { create: mockCreate },
    } as unknown as PrismaClient

    const logger = new CronExecutionLogger(mockPrisma)
    const result = await logger.startExecution(
      "tenant-1",
      "schedule-1",
      "scheduled",
      "calculate_days",
    )

    expect(result.executionId).toBe("exec-123")
    expect(result.taskExecutionId).toBe("task-exec-123")
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "tenant-1",
          scheduleId: "schedule-1",
          status: "running",
          triggerType: "scheduled",
          tasksTotal: 1,
        }),
      }),
    )
  })

  it("completeExecution updates all records in transaction", async () => {
    const { CronExecutionLogger } = await vi.importActual<typeof CronLoggerModule>("@/lib/services/cron-execution-logger")

    const mockTransaction = vi.fn().mockResolvedValue([{}, {}, {}])
    const mockPrisma = {
      $transaction: mockTransaction,
      scheduleTaskExecution: {
        update: vi.fn().mockReturnValue("task-update-op"),
      },
      scheduleExecution: { update: vi.fn().mockReturnValue("exec-update-op") },
      schedule: { update: vi.fn().mockReturnValue("schedule-update-op") },
    } as unknown as PrismaClient

    const logger = new CronExecutionLogger(mockPrisma)
    await logger.completeExecution("exec-1", "task-exec-1", "schedule-1", {
      status: "completed",
      taskResult: { processed_days: 10, failed_days: 0 },
    })

    // Verify $transaction was called with an array of 3 operations
    expect(mockTransaction).toHaveBeenCalledWith([
      "task-update-op",
      "exec-update-op",
      "schedule-update-op",
    ])
  })

  it("completeExecution sets tasksFailed=1 when status is 'failed'", async () => {
    const { CronExecutionLogger } = await vi.importActual<typeof CronLoggerModule>("@/lib/services/cron-execution-logger")

    const mockTransaction = vi.fn().mockResolvedValue([{}, {}, {}])
    const mockPrisma = {
      $transaction: mockTransaction,
      scheduleTaskExecution: {
        update: vi.fn().mockReturnValue("task-update-op"),
      },
      scheduleExecution: {
        update: vi.fn().mockReturnValue("exec-update-op"),
      },
      schedule: {
        update: vi.fn().mockReturnValue("schedule-update-op"),
      },
    } as unknown as PrismaClient

    const logger = new CronExecutionLogger(mockPrisma)
    await logger.completeExecution("exec-1", "task-exec-1", "schedule-1", {
      status: "failed",
      taskResult: { error: "everything broke" },
      errorMessage: "everything broke",
    })

    // Verify the ScheduleExecution update includes tasksFailed=1
    expect(mockPrisma.scheduleExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "exec-1" },
        data: expect.objectContaining({
          status: "failed",
          tasksFailed: 1,
          tasksSucceeded: 0,
          errorMessage: "everything broke",
        }),
      }),
    )

    // Verify the ScheduleTaskExecution update has status "failed"
    expect(mockPrisma.scheduleTaskExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "task-exec-1" },
        data: expect.objectContaining({
          status: "failed",
          errorMessage: "everything broke",
        }),
      }),
    )
  })
})

// Type for tenant result assertions
type TenantResult = {
  tenantId: string
  processedDays: number
  failedDays: number
  durationMs: number
  error?: string
}
