/**
 * DailyCalcContext — Batch-loading for daily calculation optimization.
 *
 * Pre-loads all data needed for a date range so calculateDay() can read
 * from in-memory maps instead of issuing individual DB queries per day.
 *
 * Two-tier caching:
 * - TenantCalcCache: shared across all employees in a cron run (holidays, settings)
 * - DailyCalcContext: per-employee data for a date range
 */

import type { PrismaClient, Prisma } from "@/generated/prisma/client"
import type {
  AbsenceDayRow,
  BookingWithType,
  EmployeeDayPlanWithDetails,
} from "./daily-calc.types"
import { addDays, dateOnly } from "./daily-calc.helpers"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Tenant-level data shared across all employees in a cron run */
export interface TenantCalcCache {
  holidays: Map<string, { isHoliday: boolean; holidayCategory: number }>
  systemSettings: { roundingRelativeToPlan: boolean }
}

/** Employee-level pre-loaded data for a date range */
export interface DailyCalcContext {
  tenant: TenantCalcCache
  dayPlans: Map<string, EmployeeDayPlanWithDetails | null>
  absences: Map<string, AbsenceDayRow | null>
  bookingsByDate: Map<string, BookingWithType[]>
  allBookingsExtended: BookingWithType[]
  previousValues: Map<string, { hasError: boolean } | null>
  /**
   * Dates (YYYY-MM-DD) for which an approved OvertimeRequest exists.
   * Used by calculateWithBookings to suppress UNAPPROVED_OVERTIME when
   * overtime > 0 is already sanctioned.
   */
  approvedOvertimeDates: Set<string>
  employeeMaster: {
    dailyTargetHours: Prisma.Decimal | null
    defaultOrderId: string | null
    defaultActivityId: string | null
    tenantId: string
  } | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Date key for maps: "YYYY-MM-DD" */
function dateKey(d: Date): string {
  return d.toISOString().split("T")[0]!
}

// ---------------------------------------------------------------------------
// Batch-loading functions
// ---------------------------------------------------------------------------

/**
 * Load tenant-level data that is constant across all employees.
 * Called once per tenant per cron run.
 */
export async function loadTenantCalcCache(
  prisma: PrismaClient,
  tenantId: string,
  from: Date,
  to: Date,
): Promise<TenantCalcCache> {
  const [holidays, settings] = await Promise.all([
    prisma.holiday.findMany({
      where: {
        tenantId,
        holidayDate: { gte: dateOnly(from), lte: dateOnly(to) },
      },
    }),
    prisma.systemSetting.findFirst({
      where: { tenantId },
      select: { roundingRelativeToPlan: true },
    }),
  ])

  const holidayMap = new Map<
    string,
    { isHoliday: boolean; holidayCategory: number }
  >()
  for (const h of holidays) {
    holidayMap.set(dateKey(h.holidayDate), {
      isHoliday: true,
      holidayCategory: h.holidayCategory,
    })
  }

  return {
    holidays: holidayMap,
    systemSettings: {
      roundingRelativeToPlan: settings?.roundingRelativeToPlan ?? false,
    },
  }
}

/**
 * Load employee-level data for a date range.
 * Called once per employee per cron run.
 */
export async function loadEmployeeCalcContext(
  prisma: PrismaClient,
  tenantCache: TenantCalcCache,
  tenantId: string,
  employeeId: string,
  from: Date,
  to: Date,
): Promise<DailyCalcContext> {
  const fromDate = dateOnly(from)
  const toDate = dateOnly(to)
  // Extended range for day-change behavior (need prev/next day bookings)
  const extFrom = addDays(fromDate, -1)
  const extTo = addDays(toDate, 1)

  const [
    dayPlanRows,
    absenceRows,
    bookingRows,
    prevValueRows,
    empRow,
    approvedOvertimeRows,
  ] = await Promise.all([
      // Day plans with full includes
      prisma.employeeDayPlan.findMany({
        where: {
          tenantId,
          employeeId,
          planDate: { gte: fromDate, lte: toDate },
        },
        include: {
          dayPlan: {
            include: {
              breaks: { orderBy: { sortOrder: "asc" } },
              bonuses: {
                include: { account: true },
                orderBy: { sortOrder: "asc" },
              },
            },
          },
        },
      }),

      // Absences with type + calculation rule (raw SQL, matches loadAbsenceDay)
      prisma.$queryRaw<AbsenceDayRow[]>`
        SELECT ad.*,
               at.portion as at_portion,
               at.priority as at_priority,
               at.code as at_code,
               cr.account_id as cr_account_id,
               cr.value as cr_value,
               cr.factor::text as cr_factor
        FROM absence_days ad
        LEFT JOIN absence_types at ON at.id = ad.absence_type_id
        LEFT JOIN calculation_rules cr ON cr.id = at.calculation_rule_id
        WHERE ad.employee_id = ${employeeId}::uuid
          AND ad.tenant_id = ${tenantId}::uuid
          AND ad.absence_date >= ${fromDate}::date
          AND ad.absence_date <= ${toDate}::date
      `,

      // Bookings with extended range for day-change behavior
      prisma.booking.findMany({
        where: {
          tenantId,
          employeeId,
          bookingDate: { gte: extFrom, lte: extTo },
        },
        include: { bookingType: true },
        orderBy: [{ bookingDate: "asc" }, { editedTime: "asc" }],
      }),

      // Previous daily values for error notification comparison
      prisma.dailyValue.findMany({
        where: {
          tenantId,
          employeeId,
          valueDate: { gte: fromDate, lte: toDate },
        },
        select: { valueDate: true, hasError: true },
      }),

      // Employee master data (target hours, default order/activity)
      prisma.employee.findFirst({
        where: { id: employeeId, tenantId },
        select: {
          dailyTargetHours: true,
          defaultOrderId: true,
          defaultActivityId: true,
          tenantId: true,
        },
      }),

      // Approved overtime requests in the range — used to suppress
      // UNAPPROVED_OVERTIME.
      prisma.overtimeRequest.findMany({
        where: {
          tenantId,
          employeeId,
          status: "approved",
          requestDate: { gte: fromDate, lte: toDate },
        },
        select: { requestDate: true },
      }),
    ])

  // Build day plans map
  const dayPlans = new Map<string, EmployeeDayPlanWithDetails | null>()
  for (const dp of dayPlanRows) {
    dayPlans.set(dateKey(dp.planDate), dp)
  }

  // Build absences map
  const absences = new Map<string, AbsenceDayRow | null>()
  for (const a of absenceRows) {
    absences.set(dateKey(a.absence_date), a)
  }

  // Build bookings-by-date map
  const bookingsByDate = new Map<string, BookingWithType[]>()
  for (const b of bookingRows) {
    const key = dateKey(b.bookingDate)
    const list = bookingsByDate.get(key)
    if (list) {
      list.push(b)
    } else {
      bookingsByDate.set(key, [b])
    }
  }

  // Build previous values map
  const previousValues = new Map<
    string,
    { hasError: boolean } | null
  >()
  for (const pv of prevValueRows) {
    previousValues.set(dateKey(pv.valueDate), { hasError: pv.hasError })
  }

  const approvedOvertimeDates = new Set<string>()
  for (const r of approvedOvertimeRows) {
    approvedOvertimeDates.add(dateKey(r.requestDate))
  }

  return {
    tenant: tenantCache,
    dayPlans,
    absences,
    bookingsByDate,
    allBookingsExtended: bookingRows,
    previousValues,
    approvedOvertimeDates,
    employeeMaster: empRow,
  }
}
