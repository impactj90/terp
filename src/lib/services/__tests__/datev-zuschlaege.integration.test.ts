/**
 * Integration tests for the end-to-end DATEV-Zuschlag flow.
 *
 * Covers:
 *   - DayPlanBonus → calculateDay → DailyAccountValue (source="surcharge")
 *   - buildExportContext exposes accountValues (sparse, hours, by code)
 *   - terp_value filter resolves both account: and monthlyValues sources
 *   - Seed system templates render correctly with the new filter
 *   - Multi-tenant isolation: accountValues scoped per tenant
 *   - updateBonus + recalc reflects new values
 *   - Backwards-compat: tenants still on the old monthlyValues pattern work
 *
 * Uses far-future dates (July 2028) to avoid seed-data conflicts.
 *
 * Known limitation: cross-midnight work pairs (e.g. Mon 22:00 → Tue 06:00)
 * are not normalised by `extractWorkPeriods` in surcharges.ts, so the
 * surcharge engine produces 0 minutes for true night shifts with
 * `dayChangeBehavior=at_arrival`. A skipped test below documents this.
 * These integration tests deliberately use an EVENING shift (16:00–23:00)
 * with a late-night surcharge window (22:00–23:59) that stays within one
 * day, which fully exercises the pipeline end-to-end.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/db/prisma"
import { RecalcService } from "../recalc"
import { buildExportContext } from "../export-context-builder"
import { renderTemplate } from "../export-engine-service"
import * as dayPlansService from "../day-plans-service"

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

const TENANT_A = "b0000000-0000-4000-a000-000000000a01"
const TENANT_B = "b0000000-0000-4000-a000-000000000a02"

const EMP_A = "b0000000-0000-4000-a000-000000000b01"
const EMP_B = "b0000000-0000-4000-a000-000000000b02"

const PLAN_A = "b0000000-0000-4000-a000-000000000c01"
const PLAN_B = "b0000000-0000-4000-a000-000000000c02"

const ACCOUNT_NIGHT_A = "b0000000-0000-4000-a000-000000000d01"
const ACCOUNT_NIGHT_B = "b0000000-0000-4000-a000-000000000d02"

const USER_ID = "b0000000-0000-4000-a000-000000000e01"

// July 2028: Mon=3, Tue=4. Use Mon/Tue so the shift is Mon 22:00 → Tue 06:00.
const TEST_YEAR = 2028
const TEST_MONTH = 7
const MON = new Date(Date.UTC(TEST_YEAR, TEST_MONTH - 1, 3))
const TUE = new Date(Date.UTC(TEST_YEAR, TEST_MONTH - 1, 4))

const CLEANUP_FROM = new Date(Date.UTC(TEST_YEAR, TEST_MONTH - 1, 1))
const CLEANUP_TO = new Date(Date.UTC(TEST_YEAR, TEST_MONTH - 1, 31))

let kommenBookingTypeId: string
let gehenBookingTypeId: string

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

async function createBooking(
  tenantId: string,
  employeeId: string,
  bookingDate: Date,
  bookingTypeId: string,
  editedTime: number,
) {
  return prisma.booking.create({
    data: {
      tenantId,
      employeeId,
      bookingDate,
      bookingTypeId,
      originalTime: editedTime,
      editedTime,
    },
  })
}

async function cleanupAll() {
  const tenantIds = [TENANT_A, TENANT_B]
  const employeeIds = [EMP_A, EMP_B]
  const planIds = [PLAN_A, PLAN_B]
  const accountIds = [ACCOUNT_NIGHT_A, ACCOUNT_NIGHT_B]

  await prisma.dailyAccountValue
    .deleteMany({
      where: {
        tenantId: { in: tenantIds },
        valueDate: { gte: CLEANUP_FROM, lte: CLEANUP_TO },
      },
    })
    .catch(() => {})
  await prisma.dailyValue
    .deleteMany({
      where: {
        tenantId: { in: tenantIds },
        valueDate: { gte: CLEANUP_FROM, lte: CLEANUP_TO },
      },
    })
    .catch(() => {})
  await prisma.booking
    .deleteMany({
      where: {
        tenantId: { in: tenantIds },
        bookingDate: { gte: CLEANUP_FROM, lte: CLEANUP_TO },
      },
    })
    .catch(() => {})
  await prisma.employeeDayPlan
    .deleteMany({
      where: {
        tenantId: { in: tenantIds },
        planDate: { gte: CLEANUP_FROM, lte: CLEANUP_TO },
      },
    })
    .catch(() => {})
  await prisma.monthlyValue
    .deleteMany({
      where: {
        tenantId: { in: tenantIds },
        employeeId: { in: employeeIds },
      },
    })
    .catch(() => {})
  await prisma.dayPlanBonus
    .deleteMany({ where: { dayPlanId: { in: planIds } } })
    .catch(() => {})
  await prisma.employee
    .deleteMany({ where: { id: { in: employeeIds } } })
    .catch(() => {})
  await prisma.dayPlan
    .deleteMany({ where: { id: { in: planIds } } })
    .catch(() => {})
  await prisma.account
    .deleteMany({ where: { id: { in: accountIds } } })
    .catch(() => {})
  await prisma.tenantPayrollWage
    .deleteMany({ where: { tenantId: { in: tenantIds } } })
    .catch(() => {})
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }).catch(() => {})
}

// ─────────────────────────────────────────────────────────────────
// Setup / Teardown
// ─────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await cleanupAll()

  // Tenants
  for (const id of [TENANT_A, TENANT_B]) {
    await prisma.tenant.create({
      data: {
        id,
        name: `DATEV-Zuschlag integration ${id.slice(-2)}`,
        slug: `datev-zuschlag-${id.slice(-2)}`,
        isActive: true,
      },
    })
  }

  // Booking types (seed)
  const kommenBt = await prisma.bookingType.findFirst({ where: { code: "A1" } })
  const gehenBt = await prisma.bookingType.findFirst({ where: { code: "A2" } })
  if (!kommenBt || !gehenBt) {
    throw new Error("Booking types A1/A2 not found in seed")
  }
  kommenBookingTypeId = kommenBt.id
  gehenBookingTypeId = gehenBt.id

  // Bonus accounts (one per tenant, code NIGHT on both)
  await prisma.account.create({
    data: {
      id: ACCOUNT_NIGHT_A,
      tenantId: TENANT_A,
      code: "NIGHT",
      name: "Night Shift Bonus A",
      accountType: "bonus",
      unit: "minutes",
      isSystem: false,
      isActive: true,
      isPayrollRelevant: true,
      payrollCode: "1015",
    },
  })
  await prisma.account.create({
    data: {
      id: ACCOUNT_NIGHT_B,
      tenantId: TENANT_B,
      code: "NIGHT",
      name: "Night Shift Bonus B",
      accountType: "bonus",
      unit: "minutes",
      isSystem: false,
      isActive: true,
      isPayrollRelevant: true,
      payrollCode: "1015",
    },
  })

  // DayPlans: evening shift 16:00-23:00 (same-day, no cross-midnight).
  await prisma.dayPlan.create({
    data: {
      id: PLAN_A,
      tenantId: TENANT_A,
      code: "EVE-IT-A",
      name: "Evening integration A",
      planType: "fixed",
      comeFrom: 960,
      comeTo: 1020,
      goFrom: 1320,
      goTo: 1380,
      regularHours: 420,
      dayChangeBehavior: "none",
      noBookingBehavior: "error",
      isActive: true,
    },
  })
  await prisma.dayPlan.create({
    data: {
      id: PLAN_B,
      tenantId: TENANT_B,
      code: "EVE-IT-B",
      name: "Evening integration B",
      planType: "fixed",
      comeFrom: 960,
      comeTo: 1020,
      goFrom: 1320,
      goTo: 1380,
      regularHours: 420,
      dayChangeBehavior: "none",
      noBookingBehavior: "error",
      isActive: true,
    },
  })

  // Bonuses: 22:00–23:59 window, same-day. Tenant A = 25%, Tenant B = 50%.
  // Work from 16:00-23:00 overlaps 22:00-23:00 = 60 min of late-night work.
  await prisma.dayPlanBonus.create({
    data: {
      dayPlanId: PLAN_A,
      accountId: ACCOUNT_NIGHT_A,
      timeFrom: 1320,
      timeTo: 1439,
      calculationType: "percentage",
      valueMinutes: 25,
      appliesOnHoliday: false,
      sortOrder: 0,
    },
  })
  await prisma.dayPlanBonus.create({
    data: {
      dayPlanId: PLAN_B,
      accountId: ACCOUNT_NIGHT_B,
      timeFrom: 1320,
      timeTo: 1439,
      calculationType: "percentage",
      valueMinutes: 50,
      appliesOnHoliday: false,
      sortOrder: 0,
    },
  })

  // Employees
  await prisma.employee.create({
    data: {
      id: EMP_A,
      tenantId: TENANT_A,
      personnelNumber: "EMP-IT-A",
      pin: "1001",
      firstName: "Alex",
      lastName: "Alpha",
      isActive: true,
      entryDate: new Date(Date.UTC(2025, 0, 1)),
    },
  })
  await prisma.employee.create({
    data: {
      id: EMP_B,
      tenantId: TENANT_B,
      personnelNumber: "EMP-IT-B",
      pin: "1002",
      firstName: "Brit",
      lastName: "Beta",
      isActive: true,
      entryDate: new Date(Date.UTC(2025, 0, 1)),
    },
  })

  // Employee day-plans for Mon+Tue (both tenants)
  await prisma.employeeDayPlan.createMany({
    data: [
      { tenantId: TENANT_A, employeeId: EMP_A, planDate: MON, dayPlanId: PLAN_A, source: "integration_test" },
      { tenantId: TENANT_A, employeeId: EMP_A, planDate: TUE, dayPlanId: PLAN_A, source: "integration_test" },
      { tenantId: TENANT_B, employeeId: EMP_B, planDate: MON, dayPlanId: PLAN_B, source: "integration_test" },
      { tenantId: TENANT_B, employeeId: EMP_B, planDate: TUE, dayPlanId: PLAN_B, source: "integration_test" },
    ],
  })

  // Bookings: Mon 16:00 → Mon 23:00 (same-day evening shift, 420 min gross).
  await createBooking(TENANT_A, EMP_A, MON, kommenBookingTypeId, 960)
  await createBooking(TENANT_A, EMP_A, MON, gehenBookingTypeId, 1380)
  await createBooking(TENANT_B, EMP_B, MON, kommenBookingTypeId, 960)
  await createBooking(TENANT_B, EMP_B, MON, gehenBookingTypeId, 1380)

  // Run daily calculation for both tenants (surcharge side-effects live here)
  const recalcA = new RecalcService(prisma, undefined, undefined, TENANT_A)
  await recalcA.triggerRecalc(TENANT_A, EMP_A, MON)

  const recalcB = new RecalcService(prisma, undefined, undefined, TENANT_B)
  await recalcB.triggerRecalc(TENANT_B, EMP_B, MON)

  // MonthlyCalcService.calculateMonth() rejects future months. Since these
  // tests use a far-future test year (2028) to avoid seed conflicts, populate
  // MonthlyValue directly so buildExportContext finds a row for each employee.
  const monthlyFields = {
    year: TEST_YEAR,
    month: TEST_MONTH,
    totalTargetTime: 420,
    totalNetTime: 420,
    totalGrossTime: 420,
    totalOvertime: 0,
    totalUndertime: 0,
    workDays: 1,
    vacationTaken: 0,
    sickDays: 0,
    otherAbsenceDays: 0,
  }
  await prisma.monthlyValue.create({
    data: { ...monthlyFields, tenantId: TENANT_A, employeeId: EMP_A },
  })
  await prisma.monthlyValue.create({
    data: { ...monthlyFields, tenantId: TENANT_B, employeeId: EMP_B },
  })

  // Tenant payroll wages (Tenant A only — used in template render test)
  await prisma.tenantPayrollWage.create({
    data: {
      tenantId: TENANT_A,
      code: "1015",
      name: "Nachtarbeit",
      terpSource: "account:NIGHT",
      category: "time",
      isActive: true,
    },
  })
  await prisma.tenantPayrollWage.create({
    data: {
      tenantId: TENANT_A,
      code: "1001",
      name: "Iststunden",
      terpSource: "workedHours",
      category: "time",
      isActive: true,
    },
  })
}, 60000)

afterAll(async () => {
  await cleanupAll()
}, 30000)

// ─────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────

describe.sequential("DATEV-Zuschläge integration", () => {
  it("calculateDay persists DailyAccountValue rows with source=surcharge on the NIGHT account", async () => {
    const rows = await prisma.dailyAccountValue.findMany({
      where: {
        tenantId: TENANT_A,
        employeeId: EMP_A,
        accountId: ACCOUNT_NIGHT_A,
        source: "surcharge",
      },
    })
    expect(rows.length).toBeGreaterThan(0)

    const totalMinutes = rows.reduce((sum, r) => sum + r.valueMinutes, 0)
    // Work 16:00-23:00 overlaps surcharge window 22:00-23:59 for ~60 min
    // (at_arrival=none; work ends at 23:00 = minute 1380; surcharge window
    // is 1320-1439; overlap = 1380-1320 = 60). 25% of 60 = 15 min.
    // calculateSurcharges uses Math.floor, allow ±2 min tolerance.
    expect(totalMinutes).toBeGreaterThanOrEqual(13)
    expect(totalMinutes).toBeLessThanOrEqual(17)
  })

  it("buildExportContext exposes accountValues with hours keyed by Account.code", async () => {
    const ctx = await buildExportContext(prisma, {
      tenantId: TENANT_A,
      year: TEST_YEAR,
      month: TEST_MONTH,
      employeeIds: [EMP_A],
    })
    expect(ctx.employees).toHaveLength(1)

    const emp = ctx.employees[0]!
    expect(emp).toBeDefined()
    expect(emp.accountValues).toBeDefined()
    expect(typeof emp.accountValues).toBe("object")

    // NIGHT should be present with ~15 minutes = 0.25 hours.
    expect(emp.accountValues.NIGHT).toBeGreaterThanOrEqual(13 / 60)
    expect(emp.accountValues.NIGHT).toBeLessThanOrEqual(17 / 60)
  })

  it("accountValues is sparse — accounts with zero minutes are omitted", async () => {
    const ctx = await buildExportContext(prisma, {
      tenantId: TENANT_A,
      year: TEST_YEAR,
      month: TEST_MONTH,
      employeeIds: [EMP_A],
    })
    const emp = ctx.employees[0]!
    // Check that random account codes that never got bookings don't appear.
    expect(emp.accountValues.NONEXISTENT_CODE).toBeUndefined()
    expect(emp.accountValues.SAT).toBeUndefined()
  })

  it("multi-tenant isolation: tenant B accountValues uses its own 50% bonus", async () => {
    const ctxA = await buildExportContext(prisma, {
      tenantId: TENANT_A,
      year: TEST_YEAR,
      month: TEST_MONTH,
      employeeIds: [EMP_A],
    })
    const ctxB = await buildExportContext(prisma, {
      tenantId: TENANT_B,
      year: TEST_YEAR,
      month: TEST_MONTH,
      employeeIds: [EMP_B],
    })

    const valA = ctxA.employees[0]!.accountValues.NIGHT
    const valB = ctxB.employees[0]!.accountValues.NIGHT
    expect(valA).toBeDefined()
    expect(valB).toBeDefined()
    // Tenant B is 50%/25% = 2× Tenant A (allow some tolerance for Math.floor).
    expect(valB!).toBeGreaterThan(valA!)
    expect(valB! / valA!).toBeGreaterThanOrEqual(1.8)
    expect(valB! / valA!).toBeLessThanOrEqual(2.2)

    // Cross-contamination check: ctxA does not see employee B and vice versa.
    expect(ctxA.employees.every((e) => e.personnelNumber !== "EMP-IT-B")).toBe(true)
    expect(ctxB.employees.every((e) => e.personnelNumber !== "EMP-IT-A")).toBe(true)
  })

  it("renderTemplate with terp_value filter outputs the NIGHT hour value", async () => {
    const ctx = await buildExportContext(prisma, {
      tenantId: TENANT_A,
      year: TEST_YEAR,
      month: TEST_MONTH,
      employeeIds: [EMP_A],
    })

    const template = `{%- for employee in employees -%}
{%- for wage in payrollWages -%}
{%- assign val = wage.terpSource | terp_value: employee -%}
{%- if val and val != 0 -%}
{{ employee.personnelNumber }};{{ wage.code }};{{ val | datev_decimal: 2 }}
{% endif -%}
{%- endfor -%}
{%- endfor -%}`

    const output = await renderTemplate(template, ctx)
    // Expect a line like "EMP-IT-A;1015;0,25"
    expect(output).toMatch(/EMP-IT-A;1015;0,\d{2}/)
    // Exact match against the account-sourced value
    const nightHours = ctx.employees[0]!.accountValues.NIGHT!
    const expected = nightHours.toFixed(2).replace(".", ",")
    expect(output).toContain(`EMP-IT-A;1015;${expected}`)
  })

  it("terp_value filter falls back to monthlyValues for non-account sources", async () => {
    const ctx = await buildExportContext(prisma, {
      tenantId: TENANT_A,
      year: TEST_YEAR,
      month: TEST_MONTH,
      employeeIds: [EMP_A],
    })

    // Render a template that uses workedHours (a monthlyValues source)
    const template = `{%- for employee in employees -%}
{{ "workedHours" | terp_value: employee | datev_decimal: 2 }}
{%- endfor -%}`

    const output = await renderTemplate(template, ctx)
    const expected = ctx.employees[0]!.monthlyValues.workedHours
      .toFixed(2)
      .replace(".", ",")
    expect(output.trim()).toBe(expected)
  })

  it("backward compat: old template pattern employee.monthlyValues[wage.terpSource] still renders for non-account sources", async () => {
    const ctx = await buildExportContext(prisma, {
      tenantId: TENANT_A,
      year: TEST_YEAR,
      month: TEST_MONTH,
      employeeIds: [EMP_A],
    })

    const template = `{%- for employee in employees -%}
{%- for wage in payrollWages -%}
{%- assign val = employee.monthlyValues[wage.terpSource] -%}
{%- if val and val != 0 -%}
{{ employee.personnelNumber }};{{ wage.code }};{{ val | datev_decimal: 2 }}
{% endif -%}
{%- endfor -%}
{%- endfor -%}`

    const output = await renderTemplate(template, ctx)
    // workedHours (monthly) should still render on code 1001 under the legacy pattern.
    expect(output).toMatch(/EMP-IT-A;1001;/)
    // account:NIGHT → old pattern looks up monthlyValues["account:NIGHT"] which
    // is undefined → should NOT appear in output.
    expect(output).not.toMatch(/EMP-IT-A;1015;/)
  })

  it("updateBonus + recalc: changing valueMinutes updates DailyAccountValue after re-run", async () => {
    const bonus = await prisma.dayPlanBonus.findFirst({
      where: { dayPlanId: PLAN_A },
    })
    expect(bonus).toBeTruthy()

    // Change 25% → 50%
    await dayPlansService.updateBonusFn(
      prisma,
      TENANT_A,
      {
        dayPlanId: PLAN_A,
        bonusId: bonus!.id,
        valueMinutes: 50,
      },
      { userId: USER_ID, ipAddress: null, userAgent: null },
    )

    // Re-run daily calculation
    const recalc = new RecalcService(prisma, undefined, undefined, TENANT_A)
    await recalc.triggerRecalc(TENANT_A, EMP_A, MON)

    const rows = await prisma.dailyAccountValue.findMany({
      where: {
        tenantId: TENANT_A,
        employeeId: EMP_A,
        accountId: ACCOUNT_NIGHT_A,
        source: "surcharge",
      },
    })
    const totalMinutes = rows.reduce((sum, r) => sum + r.valueMinutes, 0)
    // 50% × 60 overlap ≈ 30 min (±2 for rounding)
    expect(totalMinutes).toBeGreaterThanOrEqual(28)
    expect(totalMinutes).toBeLessThanOrEqual(32)

    // Revert to 25% so other tests in the same file don't see changed state.
    await dayPlansService.updateBonusFn(
      prisma,
      TENANT_A,
      {
        dayPlanId: PLAN_A,
        bonusId: bonus!.id,
        valueMinutes: 25,
      },
    )
    await recalc.triggerRecalc(TENANT_A, EMP_A, MON)
  })

  // Cross-midnight overnight night-shift surcharge — the real Pro-Di case.
  // Fixed by splitting the work period at midnight in extractWorkPeriods /
  // deductFixedBreak (symmetric with splitOvernightSurcharge).
  describe.sequential("overnight 22:00 → 06:00 night shift", () => {
    // Separate tenant + fixtures to keep state isolated from the
    // same-day tests above.
    const T_NS = "b0000000-0000-4000-a000-000000000a10"
    const EMP_NS = "b0000000-0000-4000-a000-000000000b10"
    const PLAN_NS = "b0000000-0000-4000-a000-000000000c10"
    const NIGHT_NS = "b0000000-0000-4000-a000-000000000d10"
    // Mon/Tue dates distinct from the main suite (use same July 2028 month)
    const NS_MON = new Date(Date.UTC(TEST_YEAR, TEST_MONTH - 1, 10))
    const NS_TUE = new Date(Date.UTC(TEST_YEAR, TEST_MONTH - 1, 11))

    async function cleanupOvernight() {
      await prisma.dailyAccountValue
        .deleteMany({
          where: { tenantId: T_NS, valueDate: { gte: CLEANUP_FROM, lte: CLEANUP_TO } },
        })
        .catch(() => {})
      await prisma.dailyValue
        .deleteMany({
          where: { tenantId: T_NS, valueDate: { gte: CLEANUP_FROM, lte: CLEANUP_TO } },
        })
        .catch(() => {})
      await prisma.booking
        .deleteMany({
          where: { tenantId: T_NS, bookingDate: { gte: CLEANUP_FROM, lte: CLEANUP_TO } },
        })
        .catch(() => {})
      await prisma.employeeDayPlan
        .deleteMany({
          where: { tenantId: T_NS, planDate: { gte: CLEANUP_FROM, lte: CLEANUP_TO } },
        })
        .catch(() => {})
      await prisma.monthlyValue
        .deleteMany({ where: { tenantId: T_NS, employeeId: EMP_NS } })
        .catch(() => {})
      await prisma.dayPlanBreak
        .deleteMany({ where: { dayPlanId: PLAN_NS } })
        .catch(() => {})
      await prisma.dayPlanBonus
        .deleteMany({ where: { dayPlanId: PLAN_NS } })
        .catch(() => {})
      await prisma.employee
        .deleteMany({ where: { id: EMP_NS } })
        .catch(() => {})
      await prisma.dayPlan.deleteMany({ where: { id: PLAN_NS } }).catch(() => {})
      await prisma.account.deleteMany({ where: { id: NIGHT_NS } }).catch(() => {})
      await prisma.tenant.deleteMany({ where: { id: T_NS } }).catch(() => {})
    }

    beforeAll(async () => {
      await cleanupOvernight()

      await prisma.tenant.create({
        data: {
          id: T_NS,
          name: "Overnight NS integration",
          slug: "overnight-ns-it",
          isActive: true,
        },
      })
      await prisma.account.create({
        data: {
          id: NIGHT_NS,
          tenantId: T_NS,
          code: "NIGHT",
          name: "Night Shift Bonus (overnight)",
          accountType: "bonus",
          unit: "minutes",
          isSystem: false,
          isActive: true,
          isPayrollRelevant: true,
          payrollCode: "1015",
        },
      })
      await prisma.dayPlan.create({
        data: {
          id: PLAN_NS,
          tenantId: T_NS,
          code: "NS-OVERNIGHT",
          name: "Overnight NS",
          planType: "fixed",
          comeFrom: 1320,
          comeTo: 1380,
          goFrom: 300,
          goTo: 360,
          regularHours: 480,
          dayChangeBehavior: "at_arrival",
          noBookingBehavior: "error",
          isActive: true,
        },
      })
      // Overnight night bonus 22:00 – 06:00 at 25 %
      await prisma.dayPlanBonus.create({
        data: {
          dayPlanId: PLAN_NS,
          accountId: NIGHT_NS,
          timeFrom: 1320,
          timeTo: 360,
          calculationType: "percentage",
          valueMinutes: 25,
          appliesOnHoliday: false,
          sortOrder: 0,
        },
      })
      // Fixed break 22:30 – 23:00 (30 min) — exercises the deductFixedBreak
      // cross-midnight path on the evening half of the split work window.
      await prisma.dayPlanBreak.create({
        data: {
          dayPlanId: PLAN_NS,
          breakType: "fixed",
          startTime: 1350,
          endTime: 1380,
          duration: 30,
          autoDeduct: true,
          isPaid: false,
          minutesDifference: false,
          sortOrder: 0,
        },
      })
      await prisma.employee.create({
        data: {
          id: EMP_NS,
          tenantId: T_NS,
          personnelNumber: "EMP-NS-OVN",
          pin: "1010",
          firstName: "Nacht",
          lastName: "Arbeiter",
          isActive: true,
          entryDate: new Date(Date.UTC(2025, 0, 1)),
        },
      })
      await prisma.employeeDayPlan.createMany({
        data: [
          { tenantId: T_NS, employeeId: EMP_NS, planDate: NS_MON, dayPlanId: PLAN_NS, source: "integration_test" },
          { tenantId: T_NS, employeeId: EMP_NS, planDate: NS_TUE, dayPlanId: PLAN_NS, source: "integration_test" },
        ],
      })
      // Overnight bookings: Mon 22:00 Kommen + Tue 06:00 Gehen.
      await createBooking(T_NS, EMP_NS, NS_MON, kommenBookingTypeId, 1320)
      await createBooking(T_NS, EMP_NS, NS_TUE, gehenBookingTypeId, 360)

      // Run recalc only for Monday — at_arrival attributes the shift to Mon.
      const recalc = new RecalcService(prisma, undefined, undefined, T_NS)
      await recalc.triggerRecalc(T_NS, EMP_NS, NS_MON)
    }, 30000)

    afterAll(async () => {
      await cleanupOvernight()
    }, 15000)

    it("attributes the full overnight shift to Monday with 30 min fixed-break deduction", async () => {
      const dv = await prisma.dailyValue.findFirst({
        where: { tenantId: T_NS, employeeId: EMP_NS, valueDate: NS_MON },
      })
      expect(dv).toBeTruthy()
      expect(dv!.firstCome).toBe(1320)
      expect(dv!.lastGo).toBe(360)
      expect(dv!.bookingCount).toBe(2)
      // gross = 480 min (22:00 → 06:00), minus 30 min break = 450 min net.
      // Tolerate ±1 for rounding across the pairing layer.
      expect(dv!.netTime).toBeGreaterThanOrEqual(449)
      expect(dv!.netTime).toBeLessThanOrEqual(450)
      expect(dv!.breakTime).toBeGreaterThanOrEqual(30)
    })

    it("persists DailyAccountValue with source=surcharge on NIGHT = 120 min", async () => {
      const rows = await prisma.dailyAccountValue.findMany({
        where: {
          tenantId: T_NS,
          employeeId: EMP_NS,
          accountId: NIGHT_NS,
          source: "surcharge",
        },
      })
      expect(rows.length).toBeGreaterThan(0)
      const totalMinutes = rows.reduce((sum, r) => sum + r.valueMinutes, 0)
      // Surcharge is computed against the RAW work period (before break
      // subtraction). Work 22:00→06:00 splits into [1320,1440] + [0,360]
      // (= 120 + 360 min). Surcharge window 22:00→06:00 splits into the
      // same two halves. Cross-product overlap = 120 + 360. With
      // percentage=25, each split config floors independently:
      //   evening: floor(120 * 25 / 100) = 30
      //   morning: floor(360 * 25 / 100) = 90
      //   total: 120 min
      expect(totalMinutes).toBe(120)
    })
  })

  it("global migration: default_payroll_wages codes 1003/1004/1005 use the account:-prefix", async () => {
    const wages = await prisma.defaultPayrollWage.findMany({
      where: { code: { in: ["1003", "1004", "1005"] } },
      orderBy: { code: "asc" },
    })
    expect(wages.length).toBeGreaterThanOrEqual(3)
    const byCode = Object.fromEntries(wages.map((w) => [w.code, w.terpSource]))
    expect(byCode["1003"]).toBe("account:NIGHT")
    expect(byCode["1004"]).toBe("account:SUN")
    expect(byCode["1005"]).toBe("account:HOLIDAY")
  })

  it("system templates use the terp_value filter (post-migration)", async () => {
    const templates = await prisma.systemExportTemplate.findMany({
      where: {
        templateBody: { contains: "employee.monthlyValues[wage.terpSource]" },
      },
    })
    // After the migration every occurrence of the old pattern must be gone.
    expect(templates).toHaveLength(0)

    // And at least one system template must contain the new filter call.
    const withFilter = await prisma.systemExportTemplate.findMany({
      where: {
        templateBody: { contains: "terp_value: employee" },
      },
    })
    expect(withFilter.length).toBeGreaterThan(0)
  })
})
