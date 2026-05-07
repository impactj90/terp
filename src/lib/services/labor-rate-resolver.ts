/**
 * Labor Rate Resolver (NK-1, Decision 28)
 *
 * Final, authoritative implementation of the labor and travel rate
 * lookup hierarchy. Used by:
 * - Phase 3: `order-booking-service.create/update` to populate
 *   `OrderBooking.hourlyRateAtBooking`
 * - Phase 5: `work-report-service.sign` to populate
 *   `WorkReport.travelRateAtSign` and the
 *   `work-report-invoice-bridge-service` proposed-positions flow.
 *
 * Lookup hierarchy (Decision 7, Decision 20):
 *   1. Position-Override (Generate-Dialog) — handled outside this file
 *   2. Activity (FLAT_RATE.flatRate, HOURLY.hourlyRate; PER_UNIT
 *      cascades to next level)
 *   3. Order.billingRatePerHour
 *   4. Employee.wageGroup.billingHourlyRate
 *   5. Employee.hourlyRate
 *   6. NULL → manual price required
 */
import type { Decimal } from "@prisma/client/runtime/client"

export type HourlyRateSource =
  | "activity_flat"
  | "activity_hourly"
  | "order"
  | "wage_group"
  | "employee"
  | "none"

export interface ResolvedRate {
  rate: number | null
  source: HourlyRateSource
}

export interface LaborRateResolverInput {
  bookingActivity: {
    pricingType: "HOURLY" | "FLAT_RATE" | "PER_UNIT"
    flatRate: Decimal | null
    hourlyRate: Decimal | null
    unit: string | null
  } | null
  orderRate: Decimal | null
  employeeWageGroupRate: Decimal | null
  employeeRate: Decimal | null
}

export interface TravelRateResolverInput {
  orderRate: Decimal | null
  assignmentEmployees: Array<{
    hourlyRate: Decimal | null
    wageGroup: { billingHourlyRate: Decimal | null } | null
  }>
}

function decimalToNumber(d: unknown): number | null {
  if (d == null) return null
  if (typeof d === "number") return d
  if (typeof d === "object" && d !== null && "toNumber" in d) {
    return (d as { toNumber(): number }).toNumber()
  }
  const parsed = Number(d)
  return Number.isFinite(parsed) ? parsed : null
}

function toPositiveRate(value: unknown): number | null {
  const n = decimalToNumber(value)
  if (n === null) return null
  if (n <= 0) return null
  return n
}

/**
 * Resolves the per-booking labor rate (Decision 7, Decision 20).
 *
 * - FLAT_RATE activity → uses flatRate
 * - HOURLY activity    → uses hourlyRate
 * - PER_UNIT activity  → falls through (handled in aggregator separately)
 * - falls through to Order/WageGroup/Employee in priority order
 */
export function resolveLaborRateExtended(
  args: LaborRateResolverInput,
): ResolvedRate {
  if (args.bookingActivity) {
    if (args.bookingActivity.pricingType === "FLAT_RATE") {
      const r = toPositiveRate(args.bookingActivity.flatRate)
      if (r !== null) return { rate: r, source: "activity_flat" }
    }
    if (args.bookingActivity.pricingType === "HOURLY") {
      const r = toPositiveRate(args.bookingActivity.hourlyRate)
      if (r !== null) return { rate: r, source: "activity_hourly" }
    }
    // PER_UNIT durchfällt — Stunden-Pfad gilt nicht
  }
  const order = toPositiveRate(args.orderRate)
  if (order !== null) return { rate: order, source: "order" }
  const wageGroup = toPositiveRate(args.employeeWageGroupRate)
  if (wageGroup !== null) return { rate: wageGroup, source: "wage_group" }
  const employee = toPositiveRate(args.employeeRate)
  if (employee !== null) return { rate: employee, source: "employee" }
  return { rate: null, source: "none" }
}

/**
 * Resolves the per-WorkReport travel rate (Decision 27).
 *
 * - Order.billingRatePerHour wins outright
 * - Otherwise the maximum WageGroup-billing-rate across all assigned
 *   employees, then the maximum Employee.hourlyRate
 * - Maximum (not average) so the report bills travel time at the
 *   senior worker's rate when a mixed crew is on site.
 */
export function resolveTravelRateExtended(
  args: TravelRateResolverInput,
): ResolvedRate {
  const order = toPositiveRate(args.orderRate)
  if (order !== null) return { rate: order, source: "order" }

  // Maximum aus WageGroup-Sätzen aller Assignment-Mitarbeiter
  let maxWageGroup: number | null = null
  for (const emp of args.assignmentEmployees) {
    const r = toPositiveRate(emp.wageGroup?.billingHourlyRate ?? null)
    if (r === null) continue
    if (maxWageGroup === null || r > maxWageGroup) maxWageGroup = r
  }
  if (maxWageGroup !== null) return { rate: maxWageGroup, source: "wage_group" }

  // Maximum aus Employee-Sätzen
  let maxEmployee: number | null = null
  for (const emp of args.assignmentEmployees) {
    const r = toPositiveRate(emp.hourlyRate)
    if (r === null) continue
    if (maxEmployee === null || r > maxEmployee) maxEmployee = r
  }
  if (maxEmployee !== null) return { rate: maxEmployee, source: "employee" }

  return { rate: null, source: "none" }
}
