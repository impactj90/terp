/**
 * AUDIT-005 verification tests — bookings-service caller passes tenantId
 *
 * Verifies that resolveReferenceTime in bookings-service passes tenantId
 * to findEmployeeDayPlan for both plan_start and plan_end reference times.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { PrismaClient } from "@/generated/prisma/client"
import type * as BookingsRepository from "../bookings-repository"

// --- Constants ---

const TENANT_A = "a0000000-0000-4000-a000-000000000001"
const EMPLOYEE_ID = "e0000000-0000-4000-a000-000000000001"

// ============================================================================
// Module mocks — must be at top level (vi.mock is hoisted)
// ============================================================================

// Spy on bookings-repository to capture findEmployeeDayPlan calls
vi.mock("../bookings-repository", async (importOriginal) => {
  const original = await importOriginal<typeof BookingsRepository>()
  return {
    ...original,
    findEmployeeDayPlan: vi.fn().mockResolvedValue({
      id: "edp-1",
      tenantId: TENANT_A,
      employeeId: EMPLOYEE_ID,
      dayPlan: { comeFrom: 480, goFrom: 1020 },
    }),
    findBookingReason: vi.fn().mockResolvedValue({
      id: "reason-1",
      tenantId: TENANT_A,
      code: "TEST",
      referenceTime: "plan_start",
      offsetMinutes: 30,
      adjustmentBookingTypeId: null,
    }),
    findDerivedByOriginalId: vi.fn().mockResolvedValue(null),
    createDerived: vi.fn().mockResolvedValue({ id: "derived-1" }),
    findEmployeeById: vi.fn().mockResolvedValue({
      id: EMPLOYEE_ID,
      tenantId: TENANT_A,
      departmentId: "dept-1",
    }),
    findBookingType: vi.fn().mockResolvedValue({
      id: "bt-1",
      tenantId: TENANT_A,
      code: "K",
      name: "Kommen",
      direction: "in",
      isActive: true,
    }),
    create: vi.fn().mockResolvedValue({
      id: "booking-1",
      tenantId: TENANT_A,
      employeeId: EMPLOYEE_ID,
      bookingDate: new Date("2026-03-23"),
      bookingTypeId: "bt-1",
      editedTime: 480,
      bookingReasonId: "reason-1",
    }),
  }
})

vi.mock("../monthly-values-repository", () => ({
  findByEmployeeYearMonth: vi.fn().mockResolvedValue(null),
}))

vi.mock("../recalc", () => {
  const MockRecalcService = vi.fn()
  MockRecalcService.prototype.triggerRecalc = vi.fn().mockResolvedValue(undefined)
  return { RecalcService: MockRecalcService }
})

vi.mock("../audit-logs-service", () => ({
  log: vi.fn().mockResolvedValue(undefined),
  computeChanges: vi.fn().mockReturnValue({}),
}))

// ============================================================================
// Tests
// ============================================================================

describe("AUDIT-005: resolveReferenceTime passes tenantId", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createMockPrisma() {
    const mockTx = {
      booking: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "derived-1" }),
      },
    }

    return {
      $transaction: vi.fn().mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)
      ),
    } as unknown as PrismaClient
  }

  it("AUDIT-005: createBooking with plan_start reason passes tenantId to findEmployeeDayPlan", async () => {
    const repo = await import("../bookings-repository")
    const prisma = createMockPrisma()

    const { createBooking } = await import("../bookings-service")

    await createBooking(
      prisma,
      TENANT_A,
      {
        employeeId: EMPLOYEE_ID,
        bookingTypeId: "bt-1",
        bookingDate: "2026-03-23",
        time: "08:00",
        bookingReasonId: "reason-1",
      },
      { type: "all", departmentIds: [], employeeIds: [] },
      "user-1",
      { userId: "user-1", ipAddress: "127.0.0.1", userAgent: "test" }
    )

    // resolveReferenceTime calls findEmployeeDayPlan for plan_start
    expect(repo.findEmployeeDayPlan).toHaveBeenCalled()

    // Verify tenantId is passed as the second argument
    const calls = (repo.findEmployeeDayPlan as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      // call[0] = prisma, call[1] = tenantId, call[2] = employeeId, call[3] = planDate
      expect(call[1]).toBe(TENANT_A)
    }
  })

  it("AUDIT-005: createBooking with plan_end reason passes tenantId to findEmployeeDayPlan", async () => {
    const repo = await import("../bookings-repository")

    // Override findBookingReason to return plan_end
    ;(repo.findBookingReason as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "reason-2",
      tenantId: TENANT_A,
      code: "TEST-END",
      referenceTime: "plan_end",
      offsetMinutes: -15,
      adjustmentBookingTypeId: null,
    })

    const prisma = createMockPrisma()

    const { createBooking } = await import("../bookings-service")

    await createBooking(
      prisma,
      TENANT_A,
      {
        employeeId: EMPLOYEE_ID,
        bookingTypeId: "bt-1",
        bookingDate: "2026-03-23",
        time: "17:00",
        bookingReasonId: "reason-2",
      },
      { type: "all", departmentIds: [], employeeIds: [] },
      "user-1",
      { userId: "user-1", ipAddress: "127.0.0.1", userAgent: "test" }
    )

    expect(repo.findEmployeeDayPlan).toHaveBeenCalled()

    const calls = (repo.findEmployeeDayPlan as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(call[1]).toBe(TENANT_A)
    }
  })
})
