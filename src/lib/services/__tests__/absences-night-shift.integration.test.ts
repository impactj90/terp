/**
 * Integration tests for night-shift absence day assignment.
 *
 * Tests all 4 dayChangeBehavior modes (none, at_departure, at_arrival,
 * auto_complete) with real database operations.
 *
 * Uses a far-future date range (June 2028) to avoid conflicts with seed data.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/db/prisma"
import { createRange, approve } from "../absences-service"
import { RecalcService } from "../recalc"
import { MonthlyCalcService } from "../monthly-calc"
import type { DataScope } from "@/lib/auth/middleware"

const DATA_SCOPE_ALL: DataScope = {
  type: "all",
  tenantIds: [],
  departmentIds: [],
  employeeIds: [],
}

// --- Constants ---

const TEST_TENANT_ID = "10000000-0000-0000-0000-000000000001" // seed tenant
const NS_PLAN_ID = "00000000-0000-0000-0000-000000000508" // seed NS plan (at_arrival, comeFrom=1320, goTo=360)
const STD_PLAN_ID = "00000000-0000-0000-0000-000000000502" // seed STD-8H plan (none)
const TEST_EMPLOYEE_ID = "00000000-0000-0000-0000-00000000001b" // seed shift worker (EMP011)
const AUDIT = { userId: "00000000-0000-0000-0000-000000000001", ipAddress: "127.0.0.1", userAgent: "integration-test" }

// Test DayPlan IDs (created in beforeAll)
const AT_DEPARTURE_PLAN_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaa001"
const AUTO_COMPLETE_PLAN_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaa002"

// June 2028 dates (Mon June 5 - Fri June 9)
// June 4 = Sun, June 5 = Mon, June 6 = Tue, June 7 = Wed, June 8 = Thu, June 9 = Fri, June 10 = Sat
const TEST_YEAR = 2028
const SUN = new Date(Date.UTC(TEST_YEAR, 5, 4))
const MON = new Date(Date.UTC(TEST_YEAR, 5, 5))
const TUE = new Date(Date.UTC(TEST_YEAR, 5, 6))
const WED = new Date(Date.UTC(TEST_YEAR, 5, 7))
const THU = new Date(Date.UTC(TEST_YEAR, 5, 8))
const FRI = new Date(Date.UTC(TEST_YEAR, 5, 9))

// Cleanup range (wider than test range)
const CLEANUP_FROM = new Date(Date.UTC(TEST_YEAR, 5, 1))
const CLEANUP_TO = new Date(Date.UTC(TEST_YEAR, 5, 30))

let vacationTypeId: string
let sickTypeId: string

// --- Helpers ---

function dateKey(d: Date): string {
  return d.toISOString().split("T")[0]!
}

async function createEmployeeDayPlans(
  dates: Date[],
  dayPlanId: string,
  employeeId = TEST_EMPLOYEE_ID,
) {
  const data = dates.map((d) => ({
    tenantId: TEST_TENANT_ID,
    employeeId,
    planDate: d,
    dayPlanId,
    source: "integration_test",
  }))
  await prisma.employeeDayPlan.createMany({ data })
}

async function getAbsenceDays(employeeId: string, from: Date, to: Date) {
  return prisma.absenceDay.findMany({
    where: {
      employeeId,
      absenceDate: { gte: from, lte: to },
      status: { not: "cancelled" },
      employee: { tenantId: TEST_TENANT_ID },
    },
    orderBy: { absenceDate: "asc" },
    select: { id: true, absenceDate: true, status: true, duration: true },
  })
}

let kommenBookingTypeId: string
let gehenBookingTypeId: string

async function createBooking(
  employeeId: string,
  bookingDate: Date,
  bookingTypeId: string,
  editedTime: number,
) {
  return prisma.booking.create({
    data: {
      tenantId: TEST_TENANT_ID,
      employeeId,
      bookingDate,
      bookingTypeId,
      originalTime: editedTime,
      editedTime,
    },
  })
}

async function getDailyValue(employeeId: string, valueDate: Date) {
  return prisma.dailyValue.findFirst({
    where: {
      tenantId: TEST_TENANT_ID,
      employeeId,
      valueDate,
    },
  })
}

async function cleanup() {
  // Delete in FK-dependency order
  await prisma.absenceDay.deleteMany({
    where: {
      employeeId: TEST_EMPLOYEE_ID,
      absenceDate: { gte: CLEANUP_FROM, lte: CLEANUP_TO },
    },
  }).catch(() => {})

  await prisma.booking.deleteMany({
    where: {
      employeeId: TEST_EMPLOYEE_ID,
      bookingDate: { gte: CLEANUP_FROM, lte: CLEANUP_TO },
    },
  }).catch(() => {})

  await prisma.dailyAccountValue.deleteMany({
    where: {
      employeeId: TEST_EMPLOYEE_ID,
      valueDate: { gte: CLEANUP_FROM, lte: CLEANUP_TO },
    },
  }).catch(() => {})

  await prisma.dailyValue.deleteMany({
    where: {
      employeeId: TEST_EMPLOYEE_ID,
      valueDate: { gte: CLEANUP_FROM, lte: CLEANUP_TO },
    },
  }).catch(() => {})

  await prisma.employeeDayPlan.deleteMany({
    where: {
      employeeId: TEST_EMPLOYEE_ID,
      planDate: { gte: CLEANUP_FROM, lte: CLEANUP_TO },
    },
  }).catch(() => {})

  await prisma.vacationBalance.deleteMany({
    where: {
      tenantId: TEST_TENANT_ID,
      employeeId: TEST_EMPLOYEE_ID,
      year: TEST_YEAR,
    },
  }).catch(() => {})
}

// --- Setup / Teardown ---

beforeAll(async () => {
  // Clean up any leftover data from previous runs
  await cleanup()

  // Create test DayPlans (at_departure, auto_complete)
  await prisma.dayPlan.upsert({
    where: { id: AT_DEPARTURE_PLAN_ID },
    update: {},
    create: {
      id: AT_DEPARTURE_PLAN_ID,
      tenantId: TEST_TENANT_ID,
      code: "NS-DEP-TEST",
      name: "NS at_departure (test)",
      planType: "fixed",
      comeFrom: 1320,
      comeTo: 1380,
      goFrom: 300,
      goTo: 360,
      regularHours: 480,
      dayChangeBehavior: "at_departure",
      noBookingBehavior: "error",
      isActive: true,
    },
  })

  await prisma.dayPlan.upsert({
    where: { id: AUTO_COMPLETE_PLAN_ID },
    update: {},
    create: {
      id: AUTO_COMPLETE_PLAN_ID,
      tenantId: TEST_TENANT_ID,
      code: "NS-AC-TEST",
      name: "NS auto_complete (test)",
      planType: "fixed",
      comeFrom: 1320,
      comeTo: 1380,
      goFrom: 300,
      goTo: 360,
      regularHours: 480,
      dayChangeBehavior: "auto_complete",
      noBookingBehavior: "error",
      isActive: true,
    },
  })

  // Look up absence types from seed
  const vacType = await prisma.absenceType.findFirst({
    where: { code: "U", isActive: true },
  })
  if (!vacType) throw new Error("Vacation absence type (code U) not found in seed")
  vacationTypeId = vacType.id

  const sickType = await prisma.absenceType.findFirst({
    where: { code: "K", isActive: true },
  })
  if (!sickType) throw new Error("Sick absence type (code K) not found in seed")
  sickTypeId = sickType.id

  // Look up booking types
  const kommenBt = await prisma.bookingType.findFirst({ where: { code: "A1" } })
  if (!kommenBt) throw new Error("Booking type A1 (Kommen) not found in seed")
  kommenBookingTypeId = kommenBt.id

  const gehenBt = await prisma.bookingType.findFirst({ where: { code: "A2" } })
  if (!gehenBt) throw new Error("Booking type A2 (Gehen) not found in seed")
  gehenBookingTypeId = gehenBt.id
}, 30000)

afterAll(async () => {
  await cleanup()

  // Delete test DayPlans
  await prisma.dayPlan.deleteMany({
    where: { id: { in: [AT_DEPARTURE_PLAN_ID, AUTO_COMPLETE_PLAN_ID] } },
  }).catch(() => {})
}, 15000)

// --- Tests ---

describe.sequential("night-shift absence integration", () => {
  describe.sequential("at_departure end-to-end", () => {
    beforeAll(async () => {
      await cleanup()
      // Create EmployeeDayPlans for So-Fr with at_departure NS plan
      // So is the arrival day for Mo, Mo for Di, etc.
      await createEmployeeDayPlans([SUN, MON, TUE, WED, THU, FRI], AT_DEPARTURE_PLAN_ID)
    })

    it("creates AbsenceDay records for Mo-Fr (not So)", async () => {
      await createRange(prisma, TEST_TENANT_ID, {
        employeeId: TEST_EMPLOYEE_ID,
        absenceTypeId: vacationTypeId,
        fromDate: dateKey(MON),
        toDate: dateKey(FRI),
        duration: 1,
      }, AUDIT)

      const days = await getAbsenceDays(TEST_EMPLOYEE_ID, CLEANUP_FROM, CLEANUP_TO)
      const dates = days.map((d) => dateKey(d.absenceDate))

      // at_departure: Mo-Fr are departure days (work days), So is arrival-only
      expect(dates).toContain(dateKey(MON))
      expect(dates).toContain(dateKey(TUE))
      expect(dates).toContain(dateKey(WED))
      expect(dates).toContain(dateKey(THU))
      expect(dates).toContain(dateKey(FRI))
      expect(dates).not.toContain(dateKey(SUN))
      expect(days).toHaveLength(5)
    })
  })

  describe.sequential("at_arrival end-to-end", () => {
    beforeAll(async () => {
      await cleanup()
      // Create EmployeeDayPlans for So-Do with at_arrival NS plan (seed NS plan)
      await createEmployeeDayPlans([SUN, MON, TUE, WED, THU], NS_PLAN_ID)
    })

    it("creates AbsenceDay records for So-Do (not Fr)", async () => {
      await createRange(prisma, TEST_TENANT_ID, {
        employeeId: TEST_EMPLOYEE_ID,
        absenceTypeId: vacationTypeId,
        fromDate: dateKey(MON),
        toDate: dateKey(FRI),
        duration: 1,
      }, AUDIT)

      const days = await getAbsenceDays(TEST_EMPLOYEE_ID, CLEANUP_FROM, CLEANUP_TO)
      const dates = days.map((d) => dateKey(d.absenceDate))

      // at_arrival: So-Do are arrival days (work days), Fr is departure-only
      expect(dates).toContain(dateKey(SUN))
      expect(dates).toContain(dateKey(MON))
      expect(dates).toContain(dateKey(TUE))
      expect(dates).toContain(dateKey(WED))
      expect(dates).toContain(dateKey(THU))
      expect(dates).not.toContain(dateKey(FRI))
      expect(days).toHaveLength(5)
    })
  })

  describe.sequential("auto_complete end-to-end", () => {
    beforeAll(async () => {
      await cleanup()
      // Create EmployeeDayPlans for Mo-Fr with auto_complete NS plan
      await createEmployeeDayPlans([MON, TUE, WED, THU, FRI], AUTO_COMPLETE_PLAN_ID)
    })

    it("creates AbsenceDay records for Mo-Fr (standard per-calendar-day)", async () => {
      await createRange(prisma, TEST_TENANT_ID, {
        employeeId: TEST_EMPLOYEE_ID,
        absenceTypeId: vacationTypeId,
        fromDate: dateKey(MON),
        toDate: dateKey(FRI),
        duration: 1,
      }, AUDIT)

      const days = await getAbsenceDays(TEST_EMPLOYEE_ID, CLEANUP_FROM, CLEANUP_TO)
      const dates = days.map((d) => dateKey(d.absenceDate))

      expect(dates).toEqual([
        dateKey(MON), dateKey(TUE), dateKey(WED), dateKey(THU), dateKey(FRI),
      ])
      expect(days).toHaveLength(5)
    })
  })

  describe.sequential("none backward compatibility", () => {
    beforeAll(async () => {
      await cleanup()
      // Create EmployeeDayPlans for Mo-Fr with STD-8H plan (none)
      await createEmployeeDayPlans([MON, TUE, WED, THU, FRI], STD_PLAN_ID)
    })

    it("creates AbsenceDay records for Mo-Fr (identical to old behavior)", async () => {
      await createRange(prisma, TEST_TENANT_ID, {
        employeeId: TEST_EMPLOYEE_ID,
        absenceTypeId: vacationTypeId,
        fromDate: dateKey(MON),
        toDate: dateKey(FRI),
        duration: 1,
      }, AUDIT)

      const days = await getAbsenceDays(TEST_EMPLOYEE_ID, CLEANUP_FROM, CLEANUP_TO)
      const dates = days.map((d) => dateKey(d.absenceDate))

      expect(dates).toEqual([
        dateKey(MON), dateKey(TUE), dateKey(WED), dateKey(THU), dateKey(FRI),
      ])
      expect(days).toHaveLength(5)
    })
  })

  describe.sequential("mixed rotation", () => {
    beforeAll(async () => {
      await cleanup()
      // Mo: STD plan (none), Di: at_departure NS, Mi: no plan, Do: at_departure NS, Fr: no plan
      await createEmployeeDayPlans([MON], STD_PLAN_ID)
      await createEmployeeDayPlans([TUE, THU], AT_DEPARTURE_PLAN_ID)
      // Mi and Fr have no EmployeeDayPlan
    })

    it("correctly handles mixed day-shift and night-shift days", async () => {
      await createRange(prisma, TEST_TENANT_ID, {
        employeeId: TEST_EMPLOYEE_ID,
        absenceTypeId: vacationTypeId,
        fromDate: dateKey(MON),
        toDate: dateKey(FRI),
        duration: 1,
      }, AUDIT)

      const days = await getAbsenceDays(TEST_EMPLOYEE_ID, CLEANUP_FROM, CLEANUP_TO)
      const dates = days.map((d) => dateKey(d.absenceDate))

      // Mo: standard work day (none) -> true
      // Di: at_departure NS arrival-only -> false (skip)
      // Mi: departure of Di NS -> true (resolved by resolveEffectiveWorkDay)
      // Do: at_departure NS arrival-only -> false (skip)
      // Fr: departure of Do NS -> true (resolved by resolveEffectiveWorkDay)
      expect(dates).toContain(dateKey(MON))
      expect(dates).not.toContain(dateKey(TUE))
      expect(dates).toContain(dateKey(WED))
      expect(dates).not.toContain(dateKey(THU))
      expect(dates).toContain(dateKey(FRI))
      expect(days).toHaveLength(3)
    })
  })

  describe.sequential("sick day with at_departure", () => {
    beforeAll(async () => {
      await cleanup()
      await createEmployeeDayPlans([SUN, MON, TUE, WED, THU, FRI], AT_DEPARTURE_PLAN_ID)
    })

    it("creates sick days on correct departure dates", async () => {
      await createRange(prisma, TEST_TENANT_ID, {
        employeeId: TEST_EMPLOYEE_ID,
        absenceTypeId: sickTypeId,
        fromDate: dateKey(MON),
        toDate: dateKey(FRI),
        duration: 1,
      }, AUDIT)

      const days = await getAbsenceDays(TEST_EMPLOYEE_ID, CLEANUP_FROM, CLEANUP_TO)
      const dates = days.map((d) => dateKey(d.absenceDate))

      // Same day assignment logic as vacation: departure days only
      expect(dates).toContain(dateKey(MON))
      expect(dates).toContain(dateKey(TUE))
      expect(dates).toContain(dateKey(WED))
      expect(dates).toContain(dateKey(THU))
      expect(dates).toContain(dateKey(FRI))
      expect(dates).not.toContain(dateKey(SUN))
      expect(days).toHaveLength(5)
    })
  })
})

// =============================================================================
// Vacation balance consistency — verify vacation_balances.taken after approval
// =============================================================================
describe.sequential("vacation balance consistency", () => {
  describe.sequential("at_departure: approve absences and verify vacation_balances.taken", () => {
    beforeAll(async () => {
      await cleanup()
      await createEmployeeDayPlans([SUN, MON, TUE, WED, THU, FRI], AT_DEPARTURE_PLAN_ID)
    })

    it("vacation_balances.taken equals 5 after approving Mo-Fr on at_departure NS", async () => {
      // Create pending vacation (U type has requiresApproval=true)
      await createRange(prisma, TEST_TENANT_ID, {
        employeeId: TEST_EMPLOYEE_ID,
        absenceTypeId: vacationTypeId,
        fromDate: dateKey(MON),
        toDate: dateKey(FRI),
        duration: 1,
      }, AUDIT)

      const pendingDays = await getAbsenceDays(TEST_EMPLOYEE_ID, CLEANUP_FROM, CLEANUP_TO)
      expect(pendingDays).toHaveLength(5)
      for (const d of pendingDays) {
        expect(d.status).toBe("pending")
      }

      // Approve each absence day — this triggers recalculateVacationTaken
      for (const day of pendingDays) {
        await approve(prisma, TEST_TENANT_ID, day.id, DATA_SCOPE_ALL, AUDIT)
      }

      // Verify vacation_balances.taken reflects 5 approved days × vacationDeduction(1.0)
      const balance = await prisma.vacationBalance.findFirst({
        where: {
          tenantId: TEST_TENANT_ID,
          employeeId: TEST_EMPLOYEE_ID,
          year: TEST_YEAR,
        },
      })
      expect(balance).not.toBeNull()
      expect(Number(balance!.taken)).toBe(5)
    })
  })

  describe.sequential("at_arrival: approve absences and verify vacation_balances.taken", () => {
    beforeAll(async () => {
      await cleanup()
      await createEmployeeDayPlans([SUN, MON, TUE, WED, THU], NS_PLAN_ID)
    })

    it("vacation_balances.taken equals 5 after approving Mo-Fr on at_arrival NS", async () => {
      await createRange(prisma, TEST_TENANT_ID, {
        employeeId: TEST_EMPLOYEE_ID,
        absenceTypeId: vacationTypeId,
        fromDate: dateKey(MON),
        toDate: dateKey(FRI),
        duration: 1,
      }, AUDIT)

      const pendingDays = await getAbsenceDays(TEST_EMPLOYEE_ID, CLEANUP_FROM, CLEANUP_TO)
      // at_arrival: So-Do (5 days)
      expect(pendingDays).toHaveLength(5)
      const dates = pendingDays.map((d) => dateKey(d.absenceDate))
      expect(dates).toContain(dateKey(SUN))
      expect(dates).not.toContain(dateKey(FRI))

      for (const day of pendingDays) {
        await approve(prisma, TEST_TENANT_ID, day.id, DATA_SCOPE_ALL, AUDIT)
      }

      const balance = await prisma.vacationBalance.findFirst({
        where: {
          tenantId: TEST_TENANT_ID,
          employeeId: TEST_EMPLOYEE_ID,
          year: TEST_YEAR,
        },
      })
      expect(balance).not.toBeNull()
      expect(Number(balance!.taken)).toBe(5)
    })
  })
})

// =============================================================================
// DailyCalcService: real bookings (Kommen/Gehen) attributed to correct day
// =============================================================================
describe.sequential("DailyCalc night-shift day assignment", () => {
  describe.sequential("at_arrival: night shift Mo 22:00 -> Di 06:00 is credited to Mo", async () => {
    beforeAll(async () => {
      await cleanup()
      // Mo has NS at_arrival DayPlan — the shift "belongs to" Mo (arrival day)
      await createEmployeeDayPlans([MON, TUE], NS_PLAN_ID)

      // Kommen Mo 22:00 (editedTime = 1320)
      await createBooking(TEST_EMPLOYEE_ID, MON, kommenBookingTypeId, 1320)
      // Gehen Di 06:00 (editedTime = 360)
      await createBooking(TEST_EMPLOYEE_ID, TUE, gehenBookingTypeId, 360)
    })

    it("Mo daily_value.netTime ≈ 480 (8h), Di daily_value.netTime ≈ 0", async () => {
      const recalc = new RecalcService(prisma, undefined, undefined, TEST_TENANT_ID)
      await recalc.triggerRecalc(TEST_TENANT_ID, TEST_EMPLOYEE_ID, MON)
      await recalc.triggerRecalc(TEST_TENANT_ID, TEST_EMPLOYEE_ID, TUE)

      const monValue = await getDailyValue(TEST_EMPLOYEE_ID, MON)
      const tueValue = await getDailyValue(TEST_EMPLOYEE_ID, TUE)

      expect(monValue).not.toBeNull()
      expect(tueValue).not.toBeNull()

      // at_arrival: arrival-on-Mon + departure-on-Tue BOTH attributed to Mon
      // -> Mon has the full 8h netTime, Tue has 0h (no bookings attributed)
      expect(monValue!.bookingCount).toBe(2) // IN (Mo 22:00) + OUT (Tue 06:00)
      expect(monValue!.firstCome).toBe(1320) // 22:00
      expect(monValue!.lastGo).toBe(360) // 06:00 next day (value from next-day booking)
      expect(monValue!.netTime).toBeGreaterThanOrEqual(470) // ~480 min (8h), allowing for breaks
      expect(monValue!.netTime).toBeLessThanOrEqual(480)

      expect(tueValue!.bookingCount).toBe(0) // OUT excluded, no own IN
      expect(tueValue!.netTime).toBe(0)
    })
  })

  describe.sequential("at_departure: night shift Mo 22:00 -> Di 06:00 is credited to Di", async () => {
    beforeAll(async () => {
      await cleanup()
      // Mo+Di have NS at_departure DayPlan — shift "belongs to" Di (departure day)
      await createEmployeeDayPlans([MON, TUE], AT_DEPARTURE_PLAN_ID)

      // Kommen Mo 22:00, Gehen Di 06:00
      await createBooking(TEST_EMPLOYEE_ID, MON, kommenBookingTypeId, 1320)
      await createBooking(TEST_EMPLOYEE_ID, TUE, gehenBookingTypeId, 360)
    })

    it("Mo daily_value.netTime ≈ 0, Di daily_value.netTime ≈ 480 (8h)", async () => {
      const recalc = new RecalcService(prisma, undefined, undefined, TEST_TENANT_ID)
      await recalc.triggerRecalc(TEST_TENANT_ID, TEST_EMPLOYEE_ID, MON)
      await recalc.triggerRecalc(TEST_TENANT_ID, TEST_EMPLOYEE_ID, TUE)

      const monValue = await getDailyValue(TEST_EMPLOYEE_ID, MON)
      const tueValue = await getDailyValue(TEST_EMPLOYEE_ID, TUE)

      expect(monValue).not.toBeNull()
      expect(tueValue).not.toBeNull()

      // at_departure: arrival-on-Mon + departure-on-Tue BOTH attributed to Tue
      // -> Mon has 0h netTime (IN excluded), Tue has the full 8h
      expect(monValue!.bookingCount).toBe(0) // IN excluded, no OUT on Mo
      expect(monValue!.netTime).toBe(0)

      expect(tueValue!.bookingCount).toBe(2) // IN from Mo + OUT on Tue
      expect(tueValue!.firstCome).toBe(1320) // 22:00 (previous day)
      expect(tueValue!.lastGo).toBe(360) // 06:00
      expect(tueValue!.netTime).toBeGreaterThanOrEqual(470)
      expect(tueValue!.netTime).toBeLessThanOrEqual(480)
    })
  })
})

// =============================================================================
// Half-day vacation (duration=0.5) with night shift
// =============================================================================
describe.sequential("half-day vacation with night shift", () => {
  describe.sequential("at_departure: halbtags Mo-Fr = 2.5 days taken", () => {
    beforeAll(async () => {
      await cleanup()
      await createEmployeeDayPlans([SUN, MON, TUE, WED, THU, FRI], AT_DEPARTURE_PLAN_ID)
    })

    it("creates 5 AbsenceDays with duration=0.5 on Mo-Fr and vacation_balances.taken=2.5", async () => {
      await createRange(prisma, TEST_TENANT_ID, {
        employeeId: TEST_EMPLOYEE_ID,
        absenceTypeId: vacationTypeId,
        fromDate: dateKey(MON),
        toDate: dateKey(FRI),
        duration: 0.5,
        halfDayPeriod: "morning",
      }, AUDIT)

      const days = await getAbsenceDays(TEST_EMPLOYEE_ID, CLEANUP_FROM, CLEANUP_TO)
      expect(days).toHaveLength(5)

      // Verify correct day assignment (at_departure: Mo-Fr, not So)
      const dates = days.map((d) => dateKey(d.absenceDate))
      expect(dates).toContain(dateKey(MON))
      expect(dates).toContain(dateKey(FRI))
      expect(dates).not.toContain(dateKey(SUN))

      // Verify duration is 0.5 on each day
      for (const day of days) {
        expect(Number(day.duration)).toBe(0.5)
      }

      // Approve all → verify vacation_balances.taken = 5 × 0.5 = 2.5
      for (const day of days) {
        await approve(prisma, TEST_TENANT_ID, day.id, DATA_SCOPE_ALL, AUDIT)
      }

      const balance = await prisma.vacationBalance.findFirst({
        where: {
          tenantId: TEST_TENANT_ID,
          employeeId: TEST_EMPLOYEE_ID,
          year: TEST_YEAR,
        },
      })
      expect(balance).not.toBeNull()
      expect(Number(balance!.taken)).toBe(2.5)
    })
  })
})

// =============================================================================
// Multi-tenant isolation — wrong tenantId returns no data
// =============================================================================
describe.sequential("multi-tenant isolation", () => {
  // Second seed tenant exists for platform-billing tests; reuse it here.
  const OTHER_TENANT_ID = "20000000-0000-0000-0000-000000000001"

  beforeAll(async () => {
    await cleanup()
    await createEmployeeDayPlans([SUN, MON, TUE, WED, THU, FRI], AT_DEPARTURE_PLAN_ID)
  })

  it("createRange with wrong tenantId creates 0 AbsenceDays (employee's day plans not visible)", async () => {
    // Baseline: correct tenant creates 5 absences
    const result = await createRange(prisma, TEST_TENANT_ID, {
      employeeId: TEST_EMPLOYEE_ID,
      absenceTypeId: vacationTypeId,
      fromDate: dateKey(MON),
      toDate: dateKey(FRI),
      duration: 1,
    }, AUDIT)
    expect(result.createdAbsences).toHaveLength(5)

    // Clean up this baseline before running the isolation check
    await prisma.absenceDay.deleteMany({
      where: {
        tenantId: TEST_TENANT_ID,
        employeeId: TEST_EMPLOYEE_ID,
        absenceDate: { gte: CLEANUP_FROM, lte: CLEANUP_TO },
      },
    })

    // Wrong tenant: vacation type (U) is system-wide so lookup succeeds,
    // but the employee's day plans are scoped by `employee: { tenantId }` →
    // no day plans visible → all calendar days skipped → 0 absences created
    const crossTenantResult = await createRange(prisma, OTHER_TENANT_ID, {
      employeeId: TEST_EMPLOYEE_ID,
      absenceTypeId: vacationTypeId,
      fromDate: dateKey(MON),
      toDate: dateKey(FRI),
      duration: 1,
    }, AUDIT)
    expect(crossTenantResult.createdAbsences).toHaveLength(0)

    // Assert nothing was persisted in the other tenant either
    const leakedRows = await prisma.absenceDay.findMany({
      where: {
        tenantId: OTHER_TENANT_ID,
        employeeId: TEST_EMPLOYEE_ID,
      },
    })
    expect(leakedRows).toHaveLength(0)

    // Original tenant's data still unaffected after second call
    const originalTenantRows = await prisma.absenceDay.findMany({
      where: {
        tenantId: TEST_TENANT_ID,
        employeeId: TEST_EMPLOYEE_ID,
        absenceDate: { gte: CLEANUP_FROM, lte: CLEANUP_TO },
      },
    })
    expect(originalTenantRows).toHaveLength(0) // we deleted them above
  })
})

// =============================================================================
// monthly_values.vacation_taken consistency after approve
// =============================================================================
describe.sequential("monthly_values.vacation_taken consistency", () => {
  describe.sequential("at_departure: monthly vacation_taken matches daily approvals", () => {
    beforeAll(async () => {
      await cleanup()
      // Delete any existing monthly_values for our test month
      await prisma.monthlyValue.deleteMany({
        where: {
          tenantId: TEST_TENANT_ID,
          employeeId: TEST_EMPLOYEE_ID,
          year: TEST_YEAR,
          month: 6,
        },
      }).catch(() => {})

      await createEmployeeDayPlans([SUN, MON, TUE, WED, THU, FRI], AT_DEPARTURE_PLAN_ID)
    })

    afterAll(async () => {
      await prisma.monthlyValue.deleteMany({
        where: {
          tenantId: TEST_TENANT_ID,
          employeeId: TEST_EMPLOYEE_ID,
          year: TEST_YEAR,
          month: 6,
        },
      }).catch(() => {})
    })

    it("monthly_values.vacation_taken = 5 after approving Mo-Fr vacation (at_departure)", async () => {
      await createRange(prisma, TEST_TENANT_ID, {
        employeeId: TEST_EMPLOYEE_ID,
        absenceTypeId: vacationTypeId,
        fromDate: dateKey(MON),
        toDate: dateKey(FRI),
        duration: 1,
      }, AUDIT)

      const pendingDays = await getAbsenceDays(TEST_EMPLOYEE_ID, CLEANUP_FROM, CLEANUP_TO)
      expect(pendingDays).toHaveLength(5)

      for (const day of pendingDays) {
        await approve(prisma, TEST_TENANT_ID, day.id, DATA_SCOPE_ALL, AUDIT)
      }

      // Explicitly trigger monthly calc — approve's monthly trigger is best-effort
      // and swallows errors. Use recalculateMonth (not calculateMonth) because our
      // test dates are in the future (2028), which calculateMonth rejects.
      const monthlyCalc = new MonthlyCalcService(prisma, TEST_TENANT_ID)
      await monthlyCalc.recalculateMonth(TEST_EMPLOYEE_ID, TEST_YEAR, 6)

      // Both pathways should show 5 days:
      // (1) vacation_balances.taken via recalculateVacationTaken
      const balance = await prisma.vacationBalance.findFirst({
        where: { tenantId: TEST_TENANT_ID, employeeId: TEST_EMPLOYEE_ID, year: TEST_YEAR },
      })
      expect(Number(balance!.taken)).toBe(5)

      // (2) monthly_values.vacation_taken via MonthlyCalcService.buildAbsenceSummary
      const monthly = await prisma.monthlyValue.findFirst({
        where: {
          tenantId: TEST_TENANT_ID,
          employeeId: TEST_EMPLOYEE_ID,
          year: TEST_YEAR,
          month: 6, // June 2028 (month is 1-indexed in MonthlyValue)
        },
      })
      expect(monthly).not.toBeNull()
      expect(Number(monthly!.vacationTaken)).toBe(5)
    })
  })
})
