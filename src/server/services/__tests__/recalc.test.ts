/**
 * RecalcService Tests
 *
 * Tests for the RecalcService orchestration layer.
 * Mocks DailyCalcService and MonthlyCalcService to test coordination logic.
 *
 * Ported from Go: apps/api/internal/service/recalc_test.go (292 lines)
 */
import { describe, it, expect, vi } from "vitest"
import { RecalcService } from "../recalc"
import type { PrismaClient, DailyValue } from "@/generated/prisma/client"
import type { DailyCalcService } from "../daily-calc"
import type { MonthlyCalcService } from "../monthly-calc"

// --- Mock Services ---

function createMockDailyCalcService() {
  return {
    calculateDay: vi.fn().mockResolvedValue(makeDailyValue()),
    calculateDateRange: vi.fn().mockResolvedValue({ count: 0, values: [] }),
  } as unknown as DailyCalcService
}

function createMockMonthlyCalcService() {
  return {
    calculateMonth: vi.fn().mockResolvedValue({}),
  } as unknown as MonthlyCalcService
}

function createMockPrisma(employees: Array<{ id: string }> = []) {
  return {
    employee: {
      findMany: vi.fn().mockResolvedValue(employees),
    },
  } as unknown as PrismaClient
}

// --- Test Data ---

const TENANT_ID = "t-1"
const EMPLOYEE_ID = "e-1"
const DATE = new Date("2026-01-20T00:00:00Z")

function makeDailyValue(): Partial<DailyValue> {
  return { id: "dv-1", employeeId: EMPLOYEE_ID, valueDate: DATE }
}

// --- Tests ---

describe("RecalcService", () => {
  describe("triggerRecalc", () => {
    it("returns processedDays: 1 on success", async () => {
      const mockDaily = createMockDailyCalcService()
      const mockMonthly = createMockMonthlyCalcService()
      const mockPrisma = createMockPrisma()
      const service = new RecalcService(mockPrisma, mockDaily, mockMonthly)

      const result = await service.triggerRecalc(TENANT_ID, EMPLOYEE_ID, DATE)

      expect(result.processedDays).toBe(1)
      expect(result.failedDays).toBe(0)
      expect(result.errors).toHaveLength(0)
      expect(mockDaily.calculateDay).toHaveBeenCalledWith(
        TENANT_ID,
        EMPLOYEE_ID,
        DATE,
      )
    })

    it("calls monthly recalc after daily calc", async () => {
      const mockDaily = createMockDailyCalcService()
      const mockMonthly = createMockMonthlyCalcService()
      const mockPrisma = createMockPrisma()
      const service = new RecalcService(mockPrisma, mockDaily, mockMonthly)

      await service.triggerRecalc(TENANT_ID, EMPLOYEE_ID, DATE)

      expect(mockMonthly.calculateMonth).toHaveBeenCalledWith(
        EMPLOYEE_ID,
        2026, // DATE.getUTCFullYear()
        1, // DATE.getUTCMonth() + 1
      )
    })

    it("returns failedDays: 1 when calculateDay fails", async () => {
      const mockDaily = createMockDailyCalcService()
      ;(mockDaily.calculateDay as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("calculation failed"),
      )
      const mockMonthly = createMockMonthlyCalcService()
      const mockPrisma = createMockPrisma()
      const service = new RecalcService(mockPrisma, mockDaily, mockMonthly)

      const result = await service.triggerRecalc(TENANT_ID, EMPLOYEE_ID, DATE)

      expect(result.processedDays).toBe(0)
      expect(result.failedDays).toBe(1)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]!.employeeId).toBe(EMPLOYEE_ID)
      expect(result.errors[0]!.error).toBe("calculation failed")
      // Monthly recalc should NOT be called when daily fails
      expect(mockMonthly.calculateMonth).not.toHaveBeenCalled()
    })

    it("swallows monthly recalc errors (best-effort)", async () => {
      const mockDaily = createMockDailyCalcService()
      const mockMonthly = createMockMonthlyCalcService()
      ;(
        mockMonthly.calculateMonth as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error("month closed"))
      const mockPrisma = createMockPrisma()
      const service = new RecalcService(mockPrisma, mockDaily, mockMonthly)

      const result = await service.triggerRecalc(TENANT_ID, EMPLOYEE_ID, DATE)

      expect(result.processedDays).toBe(1)
      expect(result.failedDays).toBe(0)
      expect(result.errors).toHaveLength(0)
    })
  })

  describe("triggerRecalcRange", () => {
    it("returns processedDays from calculateDateRange count", async () => {
      const from = new Date("2026-01-20T00:00:00Z")
      const to = new Date("2026-01-24T00:00:00Z") // 5 days
      const mockDaily = createMockDailyCalcService()
      ;(
        mockDaily.calculateDateRange as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        count: 5,
        values: [],
      })
      const mockMonthly = createMockMonthlyCalcService()
      const mockPrisma = createMockPrisma()
      const service = new RecalcService(mockPrisma, mockDaily, mockMonthly)

      const result = await service.triggerRecalcRange(
        TENANT_ID,
        EMPLOYEE_ID,
        from,
        to,
      )

      expect(result.processedDays).toBe(5)
      expect(result.failedDays).toBe(0)
      expect(result.errors).toHaveLength(0)
    })

    it("reports all days as failed when calculateDateRange throws", async () => {
      const from = new Date("2026-01-20T00:00:00Z")
      const to = new Date("2026-01-24T00:00:00Z") // 5 days
      const mockDaily = createMockDailyCalcService()
      ;(
        mockDaily.calculateDateRange as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error("db error"))
      const mockMonthly = createMockMonthlyCalcService()
      const mockPrisma = createMockPrisma()
      const service = new RecalcService(mockPrisma, mockDaily, mockMonthly)

      const result = await service.triggerRecalcRange(
        TENANT_ID,
        EMPLOYEE_ID,
        from,
        to,
      )

      expect(result.processedDays).toBe(0)
      expect(result.failedDays).toBe(5) // all 5 days failed
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]!.error).toBe("db error")
    })
  })

  describe("triggerRecalcBatch", () => {
    it("aggregates results from all employees", async () => {
      const from = new Date("2026-01-20T00:00:00Z")
      const to = new Date("2026-01-21T00:00:00Z") // 2 days
      const employeeIds = ["e-1", "e-2", "e-3"]
      const mockDaily = createMockDailyCalcService()
      ;(
        mockDaily.calculateDateRange as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        count: 2,
        values: [],
      })
      const mockMonthly = createMockMonthlyCalcService()
      const mockPrisma = createMockPrisma()
      const service = new RecalcService(mockPrisma, mockDaily, mockMonthly)

      const result = await service.triggerRecalcBatch(
        TENANT_ID,
        employeeIds,
        from,
        to,
      )

      expect(result.processedDays).toBe(6) // 3 employees x 2 days
      expect(result.failedDays).toBe(0)
      expect(result.errors).toHaveLength(0)
    })

    it("continues on error and aggregates failures", async () => {
      const from = new Date("2026-01-20T00:00:00Z")
      const to = new Date("2026-01-21T00:00:00Z") // 2 days
      const employeeIds = ["e-1", "e-2", "e-3"]
      const mockDaily = createMockDailyCalcService()
      ;(mockDaily.calculateDateRange as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ count: 2, values: [] }) // e-1 OK
        .mockRejectedValueOnce(new Error("db error")) // e-2 fails
        .mockResolvedValueOnce({ count: 2, values: [] }) // e-3 OK
      const mockMonthly = createMockMonthlyCalcService()
      const mockPrisma = createMockPrisma()
      const service = new RecalcService(mockPrisma, mockDaily, mockMonthly)

      const result = await service.triggerRecalcBatch(
        TENANT_ID,
        employeeIds,
        from,
        to,
      )

      expect(result.processedDays).toBe(4) // e-1 (2) + e-3 (2)
      expect(result.failedDays).toBe(2) // e-2 (2 days failed)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]!.employeeId).toBe("e-2")
      expect(result.errors[0]!.error).toBe("db error")
    })

    it("returns zero counts for empty employee list", async () => {
      const from = new Date("2026-01-20T00:00:00Z")
      const to = new Date("2026-01-21T00:00:00Z")
      const mockDaily = createMockDailyCalcService()
      const mockMonthly = createMockMonthlyCalcService()
      const mockPrisma = createMockPrisma()
      const service = new RecalcService(mockPrisma, mockDaily, mockMonthly)

      const result = await service.triggerRecalcBatch(
        TENANT_ID,
        [],
        from,
        to,
      )

      expect(result.processedDays).toBe(0)
      expect(result.failedDays).toBe(0)
      expect(result.errors).toHaveLength(0)
    })
  })

  describe("triggerRecalcAll", () => {
    it("lists active employees and recalcs each", async () => {
      const from = new Date("2026-01-20T00:00:00Z")
      const to = new Date("2026-01-21T00:00:00Z") // 2 days
      const mockDaily = createMockDailyCalcService()
      ;(
        mockDaily.calculateDateRange as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        count: 2,
        values: [],
      })
      const mockMonthly = createMockMonthlyCalcService()
      const employees = [{ id: "e-1" }, { id: "e-2" }]
      const mockPrisma = createMockPrisma(employees)
      const service = new RecalcService(mockPrisma, mockDaily, mockMonthly)

      const result = await service.triggerRecalcAll(TENANT_ID, from, to)

      expect(result.processedDays).toBe(4) // 2 employees x 2 days
      expect(result.failedDays).toBe(0)
      expect(result.errors).toHaveLength(0)

      // Verify it queried for active employees
      expect(mockPrisma.employee.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: TENANT_ID,
          isActive: true,
          deletedAt: null,
        },
        select: { id: true },
      })
    })

    it("throws when employee listing fails", async () => {
      const from = new Date("2026-01-20T00:00:00Z")
      const to = new Date("2026-01-21T00:00:00Z")
      const mockDaily = createMockDailyCalcService()
      const mockMonthly = createMockMonthlyCalcService()
      const mockPrisma = createMockPrisma()
      ;(
        mockPrisma.employee.findMany as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error("db connection lost"))
      const service = new RecalcService(mockPrisma, mockDaily, mockMonthly)

      await expect(
        service.triggerRecalcAll(TENANT_ID, from, to),
      ).rejects.toThrow("db connection lost")
    })
  })
})
