/**
 * Unit tests for employee-tariff-assignment-service post-commit sync.
 *
 * Verifies that create/update/remove trigger the day-plan generator and
 * daily value recalc with the correct ranges, and that best-effort error
 * handling keeps the assignment committed even if side effects fail.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { PrismaClient } from "@/generated/prisma/client"
import * as service from "../employee-tariff-assignment-service"
import * as repo from "../employee-tariff-assignment-repository"

// --- Mocks ---
const generateFromTariffMock = vi.fn()
const triggerRecalcRangeMock = vi.fn()

vi.mock("../employee-day-plan-generator", () => ({
  EmployeeDayPlanGenerator: class {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    generateFromTariff(...args: any[]) {
      return generateFromTariffMock(...args)
    }
  },
}))

vi.mock("../recalc", () => ({
  RecalcService: class {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    triggerRecalcRange(...args: any[]) {
      return triggerRecalcRangeMock(...args)
    }
  },
}))

vi.mock("../employee-tariff-assignment-repository", () => ({
  findEmployeeById: vi.fn(),
  findById: vi.fn(),
  findMany: vi.fn(),
  findEffective: vi.fn(),
  hasOverlap: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteById: vi.fn(),
}))

vi.mock("../audit-logs-service", () => ({
  log: vi.fn().mockResolvedValue(undefined),
  computeChanges: vi.fn().mockReturnValue(null),
}))

// --- Fixtures ---

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222"
const ASSIGNMENT_ID = "33333333-3333-4333-8333-333333333333"
const TARIFF_ID = "44444444-4444-4444-8444-444444444444"

function buildAssignment(
  overrides: Partial<{
    id: string
    tenantId: string
    employeeId: string
    tariffId: string
    effectiveFrom: Date
    effectiveTo: Date | null
    overwriteBehavior: string
    notes: string | null
    isActive: boolean
    createdAt: Date
    updatedAt: Date
  }> = {},
) {
  return {
    id: ASSIGNMENT_ID,
    tenantId: TENANT_ID,
    employeeId: EMPLOYEE_ID,
    tariffId: TARIFF_ID,
    effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
    effectiveTo: null as Date | null,
    overwriteBehavior: "preserve_manual",
    notes: null,
    isActive: true,
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    ...overrides,
  }
}

function createMockPrisma(): PrismaClient {
  return {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      // Call the transaction callback with a proxy tx
      return await fn({} as unknown)
    }),
  } as unknown as PrismaClient
}

// --- Tests ---

describe("employee-tariff-assignment-service post-commit sync", () => {
  beforeEach(() => {
    generateFromTariffMock.mockReset().mockResolvedValue({
      employeesProcessed: 1,
      plansCreated: 5,
      plansUpdated: 0,
      employeesSkipped: 0,
    })
    triggerRecalcRangeMock.mockReset().mockResolvedValue({
      processedDays: 5,
      failedDays: 0,
      errors: [],
    })
    vi.mocked(repo.findEmployeeById).mockReset()
    vi.mocked(repo.findById).mockReset()
    vi.mocked(repo.hasOverlap).mockReset()
    vi.mocked(repo.create).mockReset()
    vi.mocked(repo.update).mockReset()
    vi.mocked(repo.deleteById).mockReset()
  })

  describe("create()", () => {
    it("triggers generateFromTariff and recalc with range [effectiveFrom, effectiveTo]", async () => {
      vi.mocked(repo.findEmployeeById).mockResolvedValue({
        id: EMPLOYEE_ID,
        departmentId: null,
      } as unknown as Awaited<ReturnType<typeof repo.findEmployeeById>>)
      vi.mocked(repo.hasOverlap).mockResolvedValue(false)
      const created = buildAssignment({
        effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
        effectiveTo: new Date("2026-04-30T00:00:00.000Z"),
      })
      vi.mocked(repo.create).mockResolvedValue(created as Awaited<ReturnType<typeof repo.create>>)

      await service.create(createMockPrisma(), TENANT_ID, {
        employeeId: EMPLOYEE_ID,
        tariffId: TARIFF_ID,
        effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
        effectiveTo: new Date("2026-04-30T00:00:00.000Z"),
      })

      expect(generateFromTariffMock).toHaveBeenCalledOnce()
      const genArgs = generateFromTariffMock.mock.calls[0]![0]
      expect(genArgs.tenantId).toBe(TENANT_ID)
      expect(genArgs.employeeIds).toEqual([EMPLOYEE_ID])
      expect(genArgs.from).toEqual(new Date("2026-04-01T00:00:00.000Z"))
      expect(genArgs.to).toEqual(new Date("2026-04-30T00:00:00.000Z"))
      expect(genArgs.deleteOrphanedTariffPlansInRange).toBe(false)
      expect(genArgs.overwriteTariffSource).toBe(true)

      expect(triggerRecalcRangeMock).toHaveBeenCalledOnce()
      const recalcArgs = triggerRecalcRangeMock.mock.calls[0]!
      expect(recalcArgs[0]).toBe(TENANT_ID)
      expect(recalcArgs[1]).toBe(EMPLOYEE_ID)
      expect(recalcArgs[2]).toEqual(new Date("2026-04-01T00:00:00.000Z"))
      expect(recalcArgs[3]).toEqual(new Date("2026-04-30T00:00:00.000Z"))
    })

    it("uses today+3mo as upper bound when effectiveTo is null", async () => {
      vi.mocked(repo.findEmployeeById).mockResolvedValue({
        id: EMPLOYEE_ID,
        departmentId: null,
      } as unknown as Awaited<ReturnType<typeof repo.findEmployeeById>>)
      vi.mocked(repo.hasOverlap).mockResolvedValue(false)
      const created = buildAssignment({
        effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
        effectiveTo: null,
      })
      vi.mocked(repo.create).mockResolvedValue(created as Awaited<ReturnType<typeof repo.create>>)

      await service.create(createMockPrisma(), TENANT_ID, {
        employeeId: EMPLOYEE_ID,
        tariffId: TARIFF_ID,
        effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
      })

      const genArgs = generateFromTariffMock.mock.calls[0]![0]
      expect(genArgs.from).toEqual(new Date("2026-04-01T00:00:00.000Z"))
      // Upper bound should be ~3 months from today
      const threeMonthsFromNow = new Date()
      threeMonthsFromNow.setUTCMonth(threeMonthsFromNow.getUTCMonth() + 3)
      const delta = Math.abs(
        genArgs.to.getTime() - threeMonthsFromNow.getTime(),
      )
      expect(delta).toBeLessThan(24 * 60 * 60 * 1000) // within 1 day
    })

    it("assignment remains committed even if generateFromTariff throws", async () => {
      vi.mocked(repo.findEmployeeById).mockResolvedValue({
        id: EMPLOYEE_ID,
        departmentId: null,
      } as unknown as Awaited<ReturnType<typeof repo.findEmployeeById>>)
      vi.mocked(repo.hasOverlap).mockResolvedValue(false)
      const created = buildAssignment()
      vi.mocked(repo.create).mockResolvedValue(created as Awaited<ReturnType<typeof repo.create>>)
      generateFromTariffMock.mockRejectedValueOnce(new Error("boom"))
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      const result = await service.create(createMockPrisma(), TENANT_ID, {
        employeeId: EMPLOYEE_ID,
        tariffId: TARIFF_ID,
        effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
      })

      expect(result).toEqual(created)
      expect(errSpy).toHaveBeenCalled()
      // Recalc still runs even if generator fails (both are independently caught)
      expect(triggerRecalcRangeMock).toHaveBeenCalledOnce()
      errSpy.mockRestore()
    })
  })

  describe("update()", () => {
    it("triggers sync with union range when effectiveFrom changes", async () => {
      const existing = buildAssignment({
        effectiveFrom: new Date("2026-04-15T00:00:00.000Z"),
        effectiveTo: new Date("2026-05-15T00:00:00.000Z"),
      })
      const updated = buildAssignment({
        effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
        effectiveTo: new Date("2026-05-15T00:00:00.000Z"),
      })
      vi.mocked(repo.findById).mockResolvedValue(existing as Awaited<ReturnType<typeof repo.findById>>)
      vi.mocked(repo.hasOverlap).mockResolvedValue(false)
      vi.mocked(repo.update).mockResolvedValue(updated as Awaited<ReturnType<typeof repo.update>>)

      await service.update(createMockPrisma(), TENANT_ID, {
        employeeId: EMPLOYEE_ID,
        id: ASSIGNMENT_ID,
        effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
      })

      expect(generateFromTariffMock).toHaveBeenCalledOnce()
      const genArgs = generateFromTariffMock.mock.calls[0]![0]
      // Union range: from = min(old 15.04, new 01.04) = 01.04
      expect(genArgs.from).toEqual(new Date("2026-04-01T00:00:00.000Z"))
      // Union range: to = max(old 15.05, new 15.05) = 15.05
      expect(genArgs.to).toEqual(new Date("2026-05-15T00:00:00.000Z"))
      // Update uses deleteOrphaned=true so the old range is cleaned up
      expect(genArgs.deleteOrphanedTariffPlansInRange).toBe(true)
    })

    it("triggers sync even when only notes change (acts as re-sync escape hatch)", async () => {
      const existing = buildAssignment()
      const updated = buildAssignment({ notes: "Updated notes" })
      vi.mocked(repo.findById).mockResolvedValue(existing as Awaited<ReturnType<typeof repo.findById>>)
      vi.mocked(repo.update).mockResolvedValue(updated as Awaited<ReturnType<typeof repo.update>>)

      await service.update(createMockPrisma(), TENANT_ID, {
        employeeId: EMPLOYEE_ID,
        id: ASSIGNMENT_ID,
        notes: "Updated notes",
      })

      expect(generateFromTariffMock).toHaveBeenCalledOnce()
      expect(triggerRecalcRangeMock).toHaveBeenCalledOnce()
      // deleteOrphaned=true so a re-save cleans up stale plans
      const genArgs = generateFromTariffMock.mock.calls[0]![0]
      expect(genArgs.deleteOrphanedTariffPlansInRange).toBe(true)
    })

    it("triggers sync when effectiveTo changes from date to null", async () => {
      const existing = buildAssignment({
        effectiveTo: new Date("2026-04-30T00:00:00.000Z"),
      })
      const updated = buildAssignment({ effectiveTo: null })
      vi.mocked(repo.findById).mockResolvedValue(existing as Awaited<ReturnType<typeof repo.findById>>)
      vi.mocked(repo.hasOverlap).mockResolvedValue(false)
      vi.mocked(repo.update).mockResolvedValue(updated as Awaited<ReturnType<typeof repo.update>>)

      await service.update(createMockPrisma(), TENANT_ID, {
        employeeId: EMPLOYEE_ID,
        id: ASSIGNMENT_ID,
        effectiveTo: null,
      })

      expect(generateFromTariffMock).toHaveBeenCalledOnce()
    })
  })

  describe("remove()", () => {
    it("triggers sync with deleteOrphaned=true for the removed range", async () => {
      const existing = buildAssignment({
        effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
        effectiveTo: new Date("2026-04-30T00:00:00.000Z"),
      })
      vi.mocked(repo.findById).mockResolvedValue(existing as Awaited<ReturnType<typeof repo.findById>>)
      vi.mocked(repo.deleteById).mockResolvedValue(
        undefined as unknown as Awaited<ReturnType<typeof repo.deleteById>>,
      )

      await service.remove(
        createMockPrisma(),
        TENANT_ID,
        EMPLOYEE_ID,
        ASSIGNMENT_ID,
      )

      expect(generateFromTariffMock).toHaveBeenCalledOnce()
      const genArgs = generateFromTariffMock.mock.calls[0]![0]
      expect(genArgs.employeeIds).toEqual([EMPLOYEE_ID])
      expect(genArgs.from).toEqual(new Date("2026-04-01T00:00:00.000Z"))
      expect(genArgs.to).toEqual(new Date("2026-04-30T00:00:00.000Z"))
      expect(genArgs.deleteOrphanedTariffPlansInRange).toBe(true)

      expect(triggerRecalcRangeMock).toHaveBeenCalledOnce()
    })
  })
})
