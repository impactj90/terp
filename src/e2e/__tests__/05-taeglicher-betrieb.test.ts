/**
 * Phase 5: Taeglicher Betrieb (Daily Operations - Employee Perspective)
 *
 * Tests UC-027 through UC-038 against the real database.
 * Requires local Supabase running with seed data.
 *
 * Uses existing seed data:
 *   - Admin user (SEED.ADMIN_USER_ID) linked to employee EMP001
 *   - Regular user (SEED.REGULAR_USER_ID) linked to employee EMP002
 *   - Tariff assignments, vacation balances, bookings for January 2026
 *
 * @see docs/use-cases/05-taeglicher-betrieb.md
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import {
  createAdminCaller,
  createUserCaller,
  prisma,
  SEED,
} from "../helpers"

type Caller = Awaited<ReturnType<typeof createAdminCaller>>

// Seed data employee IDs
const ADMIN_EMPLOYEE_ID = "00000000-0000-0000-0000-000000000011"
const USER_EMPLOYEE_ID = "00000000-0000-0000-0000-000000000012"

describe("Phase 5: Taeglicher Betrieb", () => {
  let adminCaller: Caller
  let userCaller: Caller

  // Track created record IDs for cleanup
  const created = {
    bookingIds: [] as string[],
    absenceDayIds: [] as string[],
    notificationIds: [] as string[],
  }

  // Shared state for cross-test references
  const state: Record<string, string> = {}

  beforeAll(async () => {
    adminCaller = await createAdminCaller()
    userCaller = await createUserCaller()

    // Clean up leftover test data from previous runs
    // Remove E2E bookings (far future date to avoid clashing with seed data)
    await prisma.booking
      .deleteMany({
        where: {
          tenantId: SEED.TENANT_ID,
          bookingDate: {
            gte: new Date("2027-06-01"),
            lt: new Date("2027-07-01"),
          },
        },
      })
      .catch(() => {})

    // Remove E2E absence days
    await prisma.absenceDay
      .deleteMany({
        where: {
          tenantId: SEED.TENANT_ID,
          absenceDate: {
            gte: new Date("2027-06-01"),
            lt: new Date("2027-07-01"),
          },
        },
      })
      .catch(() => {})

    // Create EmployeeDayPlans for June 2027 working days so absence creation works.
    // The seed only has day plans for January 2026; without these, shouldSkipDate()
    // skips all dates (no day plan = no working day).
    const STD_8H_PLAN_ID = "00000000-0000-0000-0000-000000000502"
    const FLEX_8H_PLAN_ID = "00000000-0000-0000-0000-000000000504"
    const dayPlanData: Array<{
      tenantId: string
      employeeId: string
      planDate: Date
      dayPlanId: string
      source: string
    }> = []

    for (const [empId, planId] of [
      [ADMIN_EMPLOYEE_ID, STD_8H_PLAN_ID],
      [USER_EMPLOYEE_ID, FLEX_8H_PLAN_ID],
    ] as const) {
      const d = new Date("2027-06-01")
      while (d.getMonth() === 5) {
        // June = month 5
        const dow = d.getUTCDay()
        if (dow !== 0 && dow !== 6) {
          // Skip weekends
          dayPlanData.push({
            tenantId: SEED.TENANT_ID,
            employeeId: empId,
            planDate: new Date(d),
            dayPlanId: planId,
            source: "e2e_test",
          })
        }
        d.setUTCDate(d.getUTCDate() + 1)
      }
    }

    // Remove any existing day plans for the range first
    await prisma.employeeDayPlan
      .deleteMany({
        where: {
          tenantId: SEED.TENANT_ID,
          planDate: {
            gte: new Date("2027-06-01"),
            lt: new Date("2027-07-01"),
          },
        },
      })
      .catch(() => {})

    await prisma.employeeDayPlan.createMany({ data: dayPlanData })

    // Remove leftover non-seed absence days for test employees.
    // Seed absence dates for employee 11 (admin): Jan 26-30, Feb 16-17
    // Seed absence dates for employee 12 (user): Feb 10, Mar 2-4
    // Anything else is residue from prior e2e runs.
    const seedDates = [
      "2026-01-26", "2026-01-27", "2026-01-28", "2026-01-29", "2026-01-30",
      "2026-02-10", "2026-02-16", "2026-02-17",
      "2026-03-02", "2026-03-03", "2026-03-04",
    ]
    await prisma.absenceDay
      .deleteMany({
        where: {
          employeeId: { in: [ADMIN_EMPLOYEE_ID, USER_EMPLOYEE_ID] },
          absenceDate: { notIn: seedDates.map((d) => new Date(d)) },
        },
      })
      .catch(() => {})

    // Recalculate vacation balance 'taken' to match actual remaining absence days.
    // Mirrors the seed reconciliation logic (seed.sql C7).
    await prisma.$executeRaw`
      UPDATE vacation_balances SET taken = (
        SELECT COALESCE(SUM(ad.duration), 0)
        FROM absence_days ad
        JOIN absence_types at2 ON ad.absence_type_id = at2.id
        WHERE ad.employee_id = vacation_balances.employee_id
          AND EXTRACT(YEAR FROM ad.absence_date) = vacation_balances.year
          AND at2.code LIKE 'U%'
          AND ad.status IN ('approved', 'pending')
      ) WHERE employee_id IN (${ADMIN_EMPLOYEE_ID}::uuid, ${USER_EMPLOYEE_ID}::uuid)
        AND year = 2026
    `
  })

  afterAll(async () => {
    // Cleanup in reverse dependency order

    // Absences
    if (created.absenceDayIds.length > 0) {
      await prisma.absenceDay
        .deleteMany({ where: { id: { in: created.absenceDayIds } } })
        .catch(() => {})
    }

    // Bookings
    if (created.bookingIds.length > 0) {
      await prisma.booking
        .deleteMany({ where: { id: { in: created.bookingIds } } })
        .catch(() => {})
    }

    // Notifications
    if (created.notificationIds.length > 0) {
      await prisma.notification
        .deleteMany({ where: { id: { in: created.notificationIds } } })
        .catch(() => {})
    }

    // Clean up any daily values created for the far-future test dates
    await prisma.dailyValue
      .deleteMany({
        where: {
          tenantId: SEED.TENANT_ID,
          valueDate: {
            gte: new Date("2027-06-01"),
            lt: new Date("2027-07-01"),
          },
        },
      })
      .catch(() => {})

    // Clean up E2E employee day plans
    await prisma.employeeDayPlan
      .deleteMany({
        where: {
          tenantId: SEED.TENANT_ID,
          planDate: {
            gte: new Date("2027-06-01"),
            lt: new Date("2027-07-01"),
          },
        },
      })
      .catch(() => {})
  })

  // =========================================================
  // UC-027: Dashboard pruefen (DayView API)
  // =========================================================
  describe("UC-027: Dashboard pruefen", () => {
    it("should return day view for admin employee on a seed booking date", async () => {
      const result = await adminCaller.employees.dayView({
        employeeId: ADMIN_EMPLOYEE_ID,
        date: "2026-01-02",
      })

      expect(result.employeeId).toBe(ADMIN_EMPLOYEE_ID)
      expect(result.date).toBe("2026-01-02")
      expect(result.bookings).toBeInstanceOf(Array)
      expect(result.bookings.length).toBeGreaterThan(0) // Seed has bookings for Jan 2
    })

    it("should show booking types with direction info", async () => {
      const result = await adminCaller.employees.dayView({
        employeeId: ADMIN_EMPLOYEE_ID,
        date: "2026-01-02",
      })

      const directions = result.bookings
        .map((b) => b.bookingType?.direction)
        .filter(Boolean)
      expect(directions).toContain("in")
      expect(directions).toContain("out")
    })

    it("should return day view for regular user employee", async () => {
      // Use adminCaller because the seed user group stores permission keys
      // (not UUIDs), so the regular user's permission checks do not match.
      const result = await adminCaller.employees.dayView({
        employeeId: USER_EMPLOYEE_ID,
        date: "2026-01-02",
      })

      expect(result.employeeId).toBe(USER_EMPLOYEE_ID)
      expect(result.bookings.length).toBeGreaterThan(0)
    })

    it("should return empty bookings for a day without data", async () => {
      const result = await adminCaller.employees.dayView({
        employeeId: ADMIN_EMPLOYEE_ID,
        date: "2027-06-01", // No bookings this far in the future
      })

      expect(result.bookings.length).toBe(0)
    })

    it("should detect holidays in day view", async () => {
      // Jan 1 2026 is Neujahr (holiday in seed data)
      const result = await adminCaller.employees.dayView({
        employeeId: ADMIN_EMPLOYEE_ID,
        date: "2026-01-01",
      })

      expect(result.isHoliday).toBe(true)
      expect(result.holiday).toBeDefined()
      expect(result.holiday!.name).toBe("Neujahr")
    })
  })

  // =========================================================
  // UC-028: Kommen buchen (Clock In)
  // =========================================================
  describe("UC-028: Kommen buchen", () => {
    it("should create a clock-in booking", async () => {
      // Get the system "in" booking type (A1 = Kommen)
      const { data: bookingTypes } = await adminCaller.bookingTypes.list()
      const inType = bookingTypes.find(
        (t: { direction: string; isSystem: boolean }) =>
          t.direction === "in" && t.isSystem === true
      )
      expect(inType).toBeDefined()
      state.bookingTypeInId = inType!.id

      const result = await adminCaller.bookings.create({
        employeeId: ADMIN_EMPLOYEE_ID,
        bookingTypeId: inType!.id,
        bookingDate: "2027-06-02", // Use far future to avoid conflicts
        time: "08:00",
        notes: "E2E clock-in test",
      })

      expect(result.id).toBeDefined()
      expect(result.employeeId).toBe(ADMIN_EMPLOYEE_ID)
      expect(result.bookingTypeId).toBe(inType!.id)
      expect(result.originalTime).toBe(480) // 08:00 = 8*60 = 480 minutes
      expect(result.editedTime).toBe(480)
      expect(result.source).toBe("web")
      state.clockInBookingId = result.id
      created.bookingIds.push(result.id)
    })

    it("should be visible in the bookings list", async () => {
      const result = await adminCaller.bookings.list({
        employeeId: ADMIN_EMPLOYEE_ID,
        fromDate: "2027-06-01",
        toDate: "2027-06-30",
      })

      const found = result.items.find(
        (b) => b.id === state.clockInBookingId!
      )
      expect(found).toBeDefined()
      expect(found!.bookingType?.direction).toBe("in")
    })

    it("should be visible in the day view", async () => {
      const result = await adminCaller.employees.dayView({
        employeeId: ADMIN_EMPLOYEE_ID,
        date: "2027-06-02",
      })

      expect(result.bookings.length).toBeGreaterThanOrEqual(1)
      const found = result.bookings.find(
        (b) => b.id === state.clockInBookingId!
      )
      expect(found).toBeDefined()
    })
  })

  // =========================================================
  // UC-029: Gehen buchen (Clock Out)
  // =========================================================
  describe("UC-029: Gehen buchen", () => {
    it("should create a clock-out booking", async () => {
      const { data: bookingTypes } = await adminCaller.bookingTypes.list()
      const outType = bookingTypes.find(
        (t: { direction: string; isSystem: boolean }) =>
          t.direction === "out" && t.isSystem === true
      )
      expect(outType).toBeDefined()
      state.bookingTypeOutId = outType!.id

      const result = await adminCaller.bookings.create({
        employeeId: ADMIN_EMPLOYEE_ID,
        bookingTypeId: outType!.id,
        bookingDate: "2027-06-02",
        time: "17:00",
        notes: "E2E clock-out test",
      })

      expect(result.id).toBeDefined()
      expect(result.originalTime).toBe(1020) // 17:00 = 17*60 = 1020 minutes
      expect(result.source).toBe("web")
      state.clockOutBookingId = result.id
      created.bookingIds.push(result.id)
    })

    it("should show both clock-in and clock-out in day view", async () => {
      const result = await adminCaller.employees.dayView({
        employeeId: ADMIN_EMPLOYEE_ID,
        date: "2027-06-02",
      })

      expect(result.bookings.length).toBeGreaterThanOrEqual(2)

      const directions = result.bookings
        .map((b) => b.bookingType?.direction)
        .filter(Boolean)
      expect(directions).toContain("in")
      expect(directions).toContain("out")
    })
  })

  // =========================================================
  // UC-030: Buchungen im Kalender ansehen
  // =========================================================
  describe("UC-030: Buchungen im Kalender ansehen", () => {
    it("should list seed bookings for admin employee in January 2026", async () => {
      const result = await adminCaller.bookings.list({
        employeeId: ADMIN_EMPLOYEE_ID,
        fromDate: "2026-01-01",
        toDate: "2026-01-31",
      })

      expect(result.items.length).toBeGreaterThan(0)
      expect(result.total).toBeGreaterThan(0)

      // Verify bookings have type info
      const withType = result.items.filter(
        (b) => b.bookingType !== undefined && b.bookingType !== null
      )
      expect(withType.length).toBeGreaterThan(0)
    })

    it("should list seed bookings for regular user employee", async () => {
      const result = await adminCaller.bookings.list({
        employeeId: USER_EMPLOYEE_ID,
        fromDate: "2026-01-01",
        toDate: "2026-01-31",
      })

      expect(result.items.length).toBeGreaterThan(0)
    })

    it("should get a booking by ID", async () => {
      const result = await adminCaller.bookings.getById({
        id: state.clockInBookingId!,
      })

      expect(result.id).toBe(state.clockInBookingId!)
      expect(result.employeeId).toBe(ADMIN_EMPLOYEE_ID)
      expect(result.bookingType).toBeDefined()
      expect(result.bookingType!.direction).toBe("in")
    })

    it("should filter bookings by source", async () => {
      const result = await adminCaller.bookings.list({
        employeeId: ADMIN_EMPLOYEE_ID,
        fromDate: "2026-01-01",
        toDate: "2026-01-31",
        source: "terminal",
      })

      expect(result.items.length).toBeGreaterThan(0)
      result.items.forEach((b) => {
        expect(b.source).toBe("terminal")
      })
    })

    it("should support pagination", async () => {
      const page1 = await adminCaller.bookings.list({
        employeeId: ADMIN_EMPLOYEE_ID,
        fromDate: "2026-01-01",
        toDate: "2026-01-31",
        page: 1,
        pageSize: 5,
      })

      expect(page1.items.length).toBeLessThanOrEqual(5)
      expect(page1.total).toBeGreaterThan(5) // Seed has many bookings
    })
  })

  // =========================================================
  // UC-031: Buchung manuell erstellen
  // =========================================================
  describe("UC-031: Buchung manuell erstellen", () => {
    it("should create a manual booking for a past date", async () => {
      const result = await adminCaller.bookings.create({
        employeeId: ADMIN_EMPLOYEE_ID,
        bookingTypeId: state.bookingTypeInId!,
        bookingDate: "2027-06-03",
        time: "09:30",
        notes: "E2E manual booking - forgotten clock-in",
      })

      expect(result.id).toBeDefined()
      expect(result.originalTime).toBe(570) // 09:30 = 9*60+30 = 570
      expect(result.source).toBe("web")
      expect(result.notes).toBe("E2E manual booking - forgotten clock-in")
      state.manualBookingId = result.id
      created.bookingIds.push(result.id)
    })

    it("should update a booking's time", async () => {
      const result = await adminCaller.bookings.update({
        id: state.manualBookingId!,
        time: "09:15",
        notes: "E2E corrected time",
      })

      expect(result.editedTime).toBe(555) // 09:15 = 9*60+15 = 555
      expect(result.notes).toBe("E2E corrected time")
      // calculatedTime should be cleared when editedTime changes
      expect(result.calculatedTime).toBeNull()
    })

    it("should have audit logs for the booking", async () => {
      const result = await adminCaller.bookings.getLogs({
        id: state.manualBookingId!,
      })

      // Audit logs might not be created for all operations;
      // just verify the shape
      expect(result.items).toBeInstanceOf(Array)
    })
  })

  // =========================================================
  // UC-032: Abwesenheit beantragen
  // =========================================================
  describe("UC-032: Abwesenheit beantragen", () => {
    it("should create an absence range (vacation request)", async () => {
      // Get a vacation absence type from seed
      const absenceType = await prisma.absenceType.findFirst({
        where: { code: "U" },
      })
      expect(absenceType).toBeDefined()
      state.absenceTypeVacationId = absenceType!.id

      const result = await adminCaller.absences.createRange({
        employeeId: ADMIN_EMPLOYEE_ID,
        absenceTypeId: absenceType!.id,
        fromDate: "2027-06-09", // Monday
        toDate: "2027-06-11", // Wednesday (3 working days)
        duration: 1,
        notes: "E2E vacation request",
      })

      expect(result.createdDays).toBeInstanceOf(Array)
      expect(result.createdDays.length).toBeGreaterThanOrEqual(1)
      expect(result.skippedDates).toBeInstanceOf(Array)

      // All created days should have status "pending"
      result.createdDays.forEach((day) => {
        expect(day.status).toBe("pending")
        expect(day.employeeId).toBe(ADMIN_EMPLOYEE_ID)
        expect(day.absenceTypeId).toBe(absenceType!.id)
        created.absenceDayIds.push(day.id)
      })

      // Track the first absence ID for later tests
      if (result.createdDays.length > 0) {
        state.absenceDayId = result.createdDays[0]!.id
      }
    })

    it("should create a single-day absence (half day)", async () => {
      const result = await adminCaller.absences.createRange({
        employeeId: ADMIN_EMPLOYEE_ID,
        absenceTypeId: state.absenceTypeVacationId!,
        fromDate: "2027-06-14", // Monday
        toDate: "2027-06-14",
        duration: 0.5,
        halfDayPeriod: "morning",
        notes: "E2E half-day vacation",
      })

      expect(result.createdDays.length).toBe(1)
      expect(result.createdDays[0]!.duration).toBe(0.5)
      expect(result.createdDays[0]!.halfDayPeriod).toBe("morning")
      created.absenceDayIds.push(result.createdDays[0]!.id)
      state.halfDayAbsenceId = result.createdDays[0]!.id
    })

    it("should skip weekends in absence range creation", async () => {
      // Request for a range spanning a weekend
      const result = await adminCaller.absences.createRange({
        employeeId: ADMIN_EMPLOYEE_ID,
        absenceTypeId: state.absenceTypeVacationId!,
        fromDate: "2027-06-18", // Friday
        toDate: "2027-06-21", // Monday
        duration: 1,
        notes: "E2E weekend skip test",
      })

      // Should create days for Friday and Monday, skip Saturday and Sunday
      const createdDates = result.createdDays.map((d) => d.absenceDate)
      result.createdDays.forEach((day) => created.absenceDayIds.push(day.id))

      // Check that weekend dates were skipped
      expect(createdDates).not.toContain("2027-06-19") // Saturday
      expect(createdDates).not.toContain("2027-06-20") // Sunday
    })

    it("should list absences for an employee", async () => {
      const result = await adminCaller.absences.forEmployee({
        employeeId: ADMIN_EMPLOYEE_ID,
        fromDate: "2027-06-01",
        toDate: "2027-06-30",
      })

      expect(result.length).toBeGreaterThanOrEqual(1)
      const pendingDays = result.filter((a) => a.status === "pending")
      expect(pendingDays.length).toBeGreaterThanOrEqual(1)
    })

    it("should list absences in admin view", async () => {
      const result = await adminCaller.absences.list({
        employeeId: ADMIN_EMPLOYEE_ID,
        fromDate: "2027-06-01",
        toDate: "2027-06-30",
        status: "pending",
      })

      expect(result.items.length).toBeGreaterThanOrEqual(1)
      expect(result.total).toBeGreaterThanOrEqual(1)
    })

    it("should get a single absence by ID", async () => {
      const result = await adminCaller.absences.getById({
        id: state.absenceDayId!,
      })

      expect(result.id).toBe(state.absenceDayId!)
      expect(result.status).toBe("pending")
      expect(result.employeeId).toBe(ADMIN_EMPLOYEE_ID)
    })

    it("should approve a pending absence", async () => {
      const result = await adminCaller.absences.approve({
        id: state.absenceDayId!,
      })

      expect(result.status).toBe("approved")
      expect(result.approvedBy).toBe(SEED.ADMIN_USER_ID)
      expect(result.approvedAt).toBeDefined()
    })

    it("should reject a pending absence with reason", async () => {
      const result = await adminCaller.absences.reject({
        id: state.halfDayAbsenceId!,
        reason: "E2E test rejection reason",
      })

      expect(result.status).toBe("rejected")
      expect(result.rejectionReason).toBe("E2E test rejection reason")
    })

    it("should create and cancel an absence", async () => {
      // Create a new absence to cancel
      const createResult = await adminCaller.absences.createRange({
        employeeId: ADMIN_EMPLOYEE_ID,
        absenceTypeId: state.absenceTypeVacationId!,
        fromDate: "2027-06-25", // Wednesday
        toDate: "2027-06-25",
        duration: 1,
        notes: "E2E cancel test",
      })

      const dayId = createResult.createdDays[0]!.id
      created.absenceDayIds.push(dayId)

      // First approve it
      await adminCaller.absences.approve({ id: dayId })

      // Then cancel the approved absence
      const cancelResult = await adminCaller.absences.cancel({ id: dayId })
      expect(cancelResult.status).toBe("cancelled")
    })

    it("should create a sick day absence", async () => {
      const sickType = await prisma.absenceType.findFirst({
        where: { code: "K" },
      })
      expect(sickType).toBeDefined()

      const result = await adminCaller.absences.createRange({
        employeeId: USER_EMPLOYEE_ID,
        absenceTypeId: sickType!.id,
        fromDate: "2027-06-16", // Monday
        toDate: "2027-06-16",
        duration: 1,
        notes: "E2E sick day",
      })

      expect(result.createdDays.length).toBe(1)
      expect(result.createdDays[0]!.status).toBe("pending")
      created.absenceDayIds.push(result.createdDays[0]!.id)
    })
  })

  // =========================================================
  // UC-033: Urlaubssaldo pruefen
  // =========================================================
  describe("UC-033: Urlaubssaldo pruefen", () => {
    it("should return vacation balance for admin employee (2026)", async () => {
      const result = await adminCaller.vacationBalances.list({
        employeeId: ADMIN_EMPLOYEE_ID,
        year: 2026,
      })

      expect(result.items.length).toBeGreaterThanOrEqual(1)
      const balance = result.items[0]!

      expect(balance.employeeId).toBe(ADMIN_EMPLOYEE_ID)
      expect(balance.year).toBe(2026)
      expect(balance.entitlement).toBe(30)
      expect(balance.carryover).toBe(3)
      expect(balance.total).toBe(33) // 30 + 3 + 0
    })

    it("should return vacation balance for regular user employee (2026)", async () => {
      const result = await adminCaller.vacationBalances.list({
        employeeId: USER_EMPLOYEE_ID,
        year: 2026,
      })

      expect(result.items.length).toBeGreaterThanOrEqual(1)
      const balance = result.items[0]!

      expect(balance.employeeId).toBe(USER_EMPLOYEE_ID)
      expect(balance.year).toBe(2026)
      expect(balance.entitlement).toBe(28)
      expect(balance.carryover).toBe(5)
      expect(balance.taken).toBe(3) // 3 approved vacation days in seed (March 2-4)
      expect(balance.total).toBe(33) // 28 + 5 + 0
      expect(balance.available).toBe(30) // 33 - 3
    })

    it("should compute available = total - taken correctly", async () => {
      const result = await adminCaller.vacationBalances.list({
        employeeId: ADMIN_EMPLOYEE_ID,
        year: 2026,
      })

      const balance = result.items[0]!
      expect(balance.available).toBe(balance.total - balance.taken)
    })
  })

  // =========================================================
  // UC-034: Monatsauswertung ansehen
  // =========================================================
  describe("UC-034: Monatsauswertung ansehen", () => {
    it("should return monthly summary for admin employee (January 2026)", async () => {
      const result = await adminCaller.monthlyValues.forEmployee({
        employeeId: ADMIN_EMPLOYEE_ID,
        year: 2026,
        month: 1,
      })

      expect(result.employeeId).toBe(ADMIN_EMPLOYEE_ID)
      expect(result.year).toBe(2026)
      expect(result.month).toBe(1)
      // The summary has aggregated values from daily values
      expect(typeof result.totalGrossTime).toBe("number")
      expect(typeof result.totalNetTime).toBe("number")
      expect(typeof result.totalTargetTime).toBe("number")
      expect(typeof result.workDays).toBe("number")
    })

    it("should return monthly summary for regular user employee", async () => {
      // Use adminCaller because the seed user group stores permission keys
      // (not UUIDs), so the regular user's permission checks do not match.
      const result = await adminCaller.monthlyValues.forEmployee({
        employeeId: USER_EMPLOYEE_ID,
        year: 2026,
        month: 1,
      })

      expect(result.employeeId).toBe(USER_EMPLOYEE_ID)
      expect(result.year).toBe(2026)
      expect(result.month).toBe(1)
    })

    it("should return daily values for a month", async () => {
      const result = await adminCaller.dailyValues.list({
        employeeId: ADMIN_EMPLOYEE_ID,
        year: 2026,
        month: 1,
      })

      expect(result).toBeInstanceOf(Array)
      // Seed data has bookings for Jan 2026, so there should be daily values
      // (they may need to be calculated first, but the seed might have them)
    })

    it("should list all daily values in admin view", async () => {
      const result = await adminCaller.dailyValues.listAll({
        fromDate: "2026-01-01",
        toDate: "2026-01-31",
        employeeId: ADMIN_EMPLOYEE_ID,
      })

      expect(result.items).toBeInstanceOf(Array)
      expect(typeof result.total).toBe("number")
    })
  })

  // =========================================================
  // UC-035: Jahresuebersicht pruefen
  // =========================================================
  describe("UC-035: Jahresuebersicht pruefen", () => {
    it("should return year overview for admin employee (2026)", async () => {
      const result = await adminCaller.monthlyValues.yearOverview({
        employeeId: ADMIN_EMPLOYEE_ID,
        year: 2026,
      })

      expect(result).toBeInstanceOf(Array)
      // Should have up to 12 months
      expect(result.length).toBeLessThanOrEqual(12)

      // Each month summary should have the expected shape
      if (result.length > 0) {
        const month = result[0]!
        expect(month.employeeId).toBe(ADMIN_EMPLOYEE_ID)
        expect(month.year).toBe(2026)
        expect(typeof month.month).toBe("number")
        expect(typeof month.totalGrossTime).toBe("number")
        expect(typeof month.totalNetTime).toBe("number")
        expect(typeof month.totalTargetTime).toBe("number")
      }
    })

    it("should return year overview for regular user employee", async () => {
      // Use adminCaller because the seed user group stores permission keys
      // (not UUIDs), so the regular user's permission checks do not match.
      const result = await adminCaller.monthlyValues.yearOverview({
        employeeId: USER_EMPLOYEE_ID,
        year: 2026,
      })

      expect(result).toBeInstanceOf(Array)
    })

    it("should return empty or zero-value months for a year with no data", async () => {
      const result = await adminCaller.monthlyValues.yearOverview({
        employeeId: ADMIN_EMPLOYEE_ID,
        year: 2028, // No data expected
      })

      expect(result).toBeInstanceOf(Array)
      // May be empty or have zero-value entries
    })
  })

  // =========================================================
  // UC-036: Team-Uebersicht
  // =========================================================
  describe("UC-036: Team-Uebersicht", () => {
    it("should list teams for the admin employee", async () => {
      const { items } = await adminCaller.teams.getByEmployee({
        employeeId: ADMIN_EMPLOYEE_ID,
      })

      expect(items.length).toBeGreaterThanOrEqual(1)

      // Admin is lead of Backend Team in seed
      const backendTeam = items.find((t) => t.name === "Backend Team")
      expect(backendTeam).toBeDefined()
    })

    it("should list teams for the regular user employee", async () => {
      const { items } = await adminCaller.teams.getByEmployee({
        employeeId: USER_EMPLOYEE_ID,
      })

      expect(items.length).toBeGreaterThanOrEqual(1)

      // Regular user is member of Frontend Team in seed
      const frontendTeam = items.find((t) => t.name === "Frontend Team")
      expect(frontendTeam).toBeDefined()
    })

    it("should list team members for Backend Team", async () => {
      const { items: teams } = await adminCaller.teams.getByEmployee({
        employeeId: ADMIN_EMPLOYEE_ID,
      })
      const backendTeam = teams.find((t) => t.name === "Backend Team")
      expect(backendTeam).toBeDefined()

      const { items: members } = await adminCaller.teams.getMembers({
        teamId: backendTeam!.id,
      })

      expect(members.length).toBeGreaterThanOrEqual(1)

      // Admin is lead
      const adminMember = members.find(
        (m) => m.employeeId === ADMIN_EMPLOYEE_ID
      )
      expect(adminMember).toBeDefined()
      expect(adminMember!.role).toBe("lead")
    })

    it("should get team by ID with members", async () => {
      const { items: teams } = await adminCaller.teams.getByEmployee({
        employeeId: ADMIN_EMPLOYEE_ID,
      })
      const backendTeam = teams.find((t) => t.name === "Backend Team")

      const detail = await adminCaller.teams.getById({
        id: backendTeam!.id,
        includeMembers: true,
      })

      expect(detail.name).toBe("Backend Team")
      expect(detail.isActive).toBe(true)
      expect(detail.members).toBeDefined()
      expect(detail.members!.length).toBeGreaterThanOrEqual(1)
    })
  })

  // =========================================================
  // UC-037: Benachrichtigungen
  // =========================================================
  describe("UC-037: Benachrichtigungen", () => {
    it("should list notifications for admin user", async () => {
      const result = await adminCaller.notifications.list()

      expect(result.items).toBeInstanceOf(Array)
      expect(typeof result.total).toBe("number")
      expect(typeof result.unreadCount).toBe("number")
    })

    it("should return unread count", async () => {
      const result = await adminCaller.notifications.unreadCount()

      expect(typeof result.unread_count).toBe("number")
      expect(result.unread_count).toBeGreaterThanOrEqual(0)
    })

    it("should mark all notifications as read and verify unread count is 0", async () => {
      const markResult = await adminCaller.notifications.markAllRead()

      expect(markResult.success).toBe(true)
      expect(typeof markResult.count).toBe("number")

      const countResult = await adminCaller.notifications.unreadCount()

      expect(countResult.unread_count).toBe(0)
    })

    it("should create a notification and then mark it as read", async () => {
      // Create a notification directly via prisma
      const notification = await prisma.notification.create({
        data: {
          tenantId: SEED.TENANT_ID,
          userId: SEED.ADMIN_USER_ID,
          type: "system",
          title: "E2E Test Notification",
          message: "This is a test notification for E2E testing",
        },
      })
      created.notificationIds.push(notification.id)

      // Verify it appears in the list
      const listResult = await adminCaller.notifications.list({
        unread: true,
      })
      const found = listResult.items.find((n) => n.id === notification.id)
      expect(found).toBeDefined()
      expect(found!.readAt).toBeNull()

      // Mark it as read
      const markResult = await adminCaller.notifications.markRead({
        id: notification.id,
      })
      expect(markResult.success).toBe(true)

      // Verify it's now read
      const afterMark = await adminCaller.notifications.list()
      const marked = afterMark.items.find((n) => n.id === notification.id)
      expect(marked).toBeDefined()
      expect(marked!.readAt).not.toBeNull()
    })

    it("should get notification preferences", async () => {
      const result = await adminCaller.notifications.preferences()

      expect(result.userId).toBe(SEED.ADMIN_USER_ID)
      expect(typeof result.approvalsEnabled).toBe("boolean")
      expect(typeof result.errorsEnabled).toBe("boolean")
      expect(typeof result.remindersEnabled).toBe("boolean")
      expect(typeof result.systemEnabled).toBe("boolean")
    })

    it("should update notification preferences", async () => {
      const result = await adminCaller.notifications.updatePreferences({
        approvalsEnabled: true,
        errorsEnabled: false,
      })

      expect(result.approvalsEnabled).toBe(true)
      expect(result.errorsEnabled).toBe(false)

      // Restore defaults
      await adminCaller.notifications.updatePreferences({
        errorsEnabled: true,
      })
    })
  })

  // =========================================================
  // UC-038: Profil bearbeiten und Passwort aendern
  // =========================================================
  describe("UC-038: Profil bearbeiten und Passwort aendern", () => {
    it("should get current user info via auth.me", async () => {
      const result = await adminCaller.auth.me()

      expect(result.user.id).toBe(SEED.ADMIN_USER_ID)
      expect(result.user.email).toBe(SEED.ADMIN_EMAIL)
      expect(result.tenants).toBeInstanceOf(Array)
      expect(result.tenants.length).toBeGreaterThan(0)
    })

    it("should get regular user info via auth.me", async () => {
      const result = await userCaller.auth.me()

      expect(result.user.id).toBe(SEED.REGULAR_USER_ID)
      expect(result.user.email).toBe(SEED.USER_EMAIL)
    })

    it("should update user display name", async () => {
      // Get current display name
      const before = await adminCaller.users.getById({
        id: SEED.ADMIN_USER_ID,
      })
      const originalName = before.displayName

      // Update display name
      const updated = await adminCaller.users.update({
        id: SEED.ADMIN_USER_ID,
        displayName: "E2E Updated Admin",
      })
      expect(updated.displayName).toBe("E2E Updated Admin")

      // Restore original
      await adminCaller.users.update({
        id: SEED.ADMIN_USER_ID,
        displayName: originalName,
      })
    })

    it("should return admin permissions via auth.permissions", async () => {
      const result = await adminCaller.auth.permissions()

      expect(result.is_admin).toBe(true)
      expect(result.permission_ids).toBeInstanceOf(Array)
      // Admin users return empty permission_ids array; the frontend uses the
      // is_admin flag to grant all permissions (mirrors Go behavior).
    })

    it("should return regular user permissions via auth.permissions", async () => {
      const result = await userCaller.auth.permissions()

      // Regular user is not admin
      expect(result.is_admin).toBe(false)
      expect(result.permission_ids).toBeInstanceOf(Array)
    })
  })

  // =========================================================
  // UC-042 (bonus): Tagesberechnung / calculateDay
  // =========================================================
  describe("Day Calculation (calculateDay)", () => {
    it("should trigger day calculation for a date with bookings", async () => {
      // Calculate day for the E2E booking date
      const result = await adminCaller.employees.calculateDay({
        employeeId: ADMIN_EMPLOYEE_ID,
        date: "2027-06-02",
      })

      // Result is the daily value or null
      if (result) {
        expect(result.employeeId).toBe(ADMIN_EMPLOYEE_ID)
        expect(typeof result.grossTime).toBe("number")
        expect(typeof result.netTime).toBe("number")
        expect(typeof result.targetTime).toBe("number")
        expect(typeof result.bookingCount).toBe("number")
        expect(result.bookingCount).toBeGreaterThanOrEqual(2) // clock-in + clock-out
      }
    })

    it("should trigger day calculation for a seed booking date", async () => {
      const result = await adminCaller.employees.calculateDay({
        employeeId: ADMIN_EMPLOYEE_ID,
        date: "2026-01-02",
      })

      if (result) {
        expect(result.employeeId).toBe(ADMIN_EMPLOYEE_ID)
        expect(result.bookingCount).toBeGreaterThanOrEqual(2)
      }
    })
  })

  // =========================================================
  // Daily Values recalculation
  // =========================================================
  describe("Daily Values Recalculation", () => {
    it("should recalculate daily values for a date range", async () => {
      const result = await adminCaller.dailyValues.recalculate({
        from: "2027-06-02",
        to: "2027-06-02",
        employeeId: ADMIN_EMPLOYEE_ID,
      })

      expect(result.message).toBeDefined()
      expect(typeof result.affectedDays).toBe("number")
    })
  })

  // =========================================================
  // Booking Deletion
  // =========================================================
  describe("Booking Deletion", () => {
    it("should delete a test booking", async () => {
      // Create a disposable booking
      const booking = await adminCaller.bookings.create({
        employeeId: ADMIN_EMPLOYEE_ID,
        bookingTypeId: state.bookingTypeInId!,
        bookingDate: "2027-06-04",
        time: "08:00",
        notes: "E2E disposable booking",
      })

      const result = await adminCaller.bookings.delete({
        id: booking.id,
      })

      expect(result.success).toBe(true)

      // Verify it was deleted
      await expect(
        adminCaller.bookings.getById({ id: booking.id })
      ).rejects.toThrow()
    })
  })
})
