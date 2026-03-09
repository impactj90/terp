/**
 * EmployeeDayPlanGenerator
 *
 * Standalone service for generating employee day plans from tariff configurations.
 * Extracted from the employeeDayPlans tRPC router for reuse by cron routes.
 *
 * Resolves day plans per date based on tariff rhythm type (weekly, rolling_weekly, x_days).
 * Default date range: today to today + 3 months.
 * Preserves manual/holiday plans (source != 'tariff').
 *
 * @see ZMI-TICKET-246: Vercel Cron monthly/dayplans/macros
 * @see apps/api/internal/service/employeedayplan.go
 */

import type { PrismaClient } from "@/generated/prisma/client"

// --- Exported Types ---

export interface GenerateFromTariffInput {
  tenantId: string
  employeeIds?: string[]
  from?: Date
  to?: Date
  overwriteTariffSource?: boolean
}

export interface GenerateFromTariffResult {
  employeesProcessed: number
  plansCreated: number
  plansUpdated: number
  employeesSkipped: number
}

// --- Exported Helper Types ---

export interface WeekPlanData {
  mondayDayPlanId: string | null
  tuesdayDayPlanId: string | null
  wednesdayDayPlanId: string | null
  thursdayDayPlanId: string | null
  fridayDayPlanId: string | null
  saturdayDayPlanId: string | null
  sundayDayPlanId: string | null
}

export interface TariffForGenerate {
  rhythmType: string | null
  weekPlanId: string | null
  weekPlan: WeekPlanData | null
  rhythmStartDate: Date | null
  cycleDays: number | null
  validFrom: Date | null
  validTo: Date | null
  tariffWeekPlans: Array<{
    sequenceOrder: number
    weekPlan: WeekPlanData
  }>
  tariffDayPlans: Array<{
    dayPosition: number
    dayPlanId: string | null
  }>
}

export interface EmployeeForGenerate {
  id: string
  tariffId: string | null
  entryDate: Date
  exitDate: Date | null
}

// --- Exported Prisma Include Object ---

export const tariffGenerateInclude = {
  weekPlan: true,
  tariffWeekPlans: {
    orderBy: { sequenceOrder: "asc" as const },
    include: { weekPlan: true },
  },
  tariffDayPlans: {
    orderBy: { dayPosition: "asc" as const },
  },
} as const

// --- Exported Helper Functions ---

/**
 * Maps a JS Date.getDay() (0=Sunday) to the correct weekPlan day plan ID column.
 */
export function getWeekdayDayPlanId(
  weekPlan: WeekPlanData,
  weekday: number,
): string | null {
  switch (weekday) {
    case 0:
      return weekPlan.sundayDayPlanId
    case 1:
      return weekPlan.mondayDayPlanId
    case 2:
      return weekPlan.tuesdayDayPlanId
    case 3:
      return weekPlan.wednesdayDayPlanId
    case 4:
      return weekPlan.thursdayDayPlanId
    case 5:
      return weekPlan.fridayDayPlanId
    case 6:
      return weekPlan.saturdayDayPlanId
    default:
      return null
  }
}

/**
 * Resolves the day plan ID for a given date based on the tariff's rhythm type.
 *
 * Port of Go model.Tariff.GetDayPlanIDForDate(date).
 *
 * Rhythm types:
 * - weekly: Uses the tariff's single weekPlan, maps weekday to day plan ID
 * - rolling_weekly: Cycles through tariffWeekPlans by weeks since rhythmStartDate
 * - x_days: Cycles through tariffDayPlans by days since rhythmStartDate
 */
export function getDayPlanIdForDate(
  tariff: TariffForGenerate,
  date: Date,
): string | null {
  const rhythmType = tariff.rhythmType ?? "weekly"

  switch (rhythmType) {
    case "weekly": {
      if (!tariff.weekPlan) return null
      const weekday = date.getUTCDay()
      return getWeekdayDayPlanId(tariff.weekPlan, weekday)
    }

    case "rolling_weekly": {
      if (!tariff.rhythmStartDate || tariff.tariffWeekPlans.length === 0) {
        return null
      }
      const msPerWeek = 7 * 24 * 60 * 60 * 1000
      const diffMs = date.getTime() - tariff.rhythmStartDate.getTime()
      let weeksSinceStart = Math.floor(diffMs / msPerWeek)
      if (weeksSinceStart < 0) weeksSinceStart = 0

      const cyclePosition =
        (weeksSinceStart % tariff.tariffWeekPlans.length) + 1

      const twp = tariff.tariffWeekPlans.find(
        (t) => t.sequenceOrder === cyclePosition,
      )
      if (!twp || !twp.weekPlan) return null

      const weekday = date.getUTCDay()
      return getWeekdayDayPlanId(twp.weekPlan, weekday)
    }

    case "x_days": {
      if (
        !tariff.rhythmStartDate ||
        !tariff.cycleDays ||
        tariff.cycleDays === 0
      ) {
        return null
      }
      const msPerDay = 24 * 60 * 60 * 1000
      const diffMs = date.getTime() - tariff.rhythmStartDate.getTime()
      let daysSinceStart = Math.floor(diffMs / msPerDay)
      if (daysSinceStart < 0) daysSinceStart = 0

      const cyclePosition = (daysSinceStart % tariff.cycleDays) + 1

      const tdp = tariff.tariffDayPlans.find(
        (t) => t.dayPosition === cyclePosition,
      )
      return tdp?.dayPlanId ?? null
    }

    default:
      return null
  }
}

/**
 * Calculates the effective sync window for generating day plans, constrained by
 * employee entry/exit dates and tariff validity dates.
 *
 * Port of Go getTariffSyncWindow.
 */
export function getTariffSyncWindow(
  employee: EmployeeForGenerate,
  tariff: TariffForGenerate,
  from: Date,
  to: Date,
): { start: Date; end: Date } | null {
  let start = new Date(from.getTime())
  let end = new Date(to.getTime())

  // Constrain by employee entry date
  if (employee.entryDate.getTime() > start.getTime()) {
    start = new Date(employee.entryDate.getTime())
  }

  // Constrain by employee exit date
  if (employee.exitDate && employee.exitDate.getTime() < end.getTime()) {
    end = new Date(employee.exitDate.getTime())
  }

  // Constrain by tariff validity
  if (tariff.validFrom && tariff.validFrom.getTime() > start.getTime()) {
    start = new Date(tariff.validFrom.getTime())
  }
  if (tariff.validTo && tariff.validTo.getTime() < end.getTime()) {
    end = new Date(tariff.validTo.getTime())
  }

  // Check window validity
  if (start.getTime() > end.getTime()) {
    return null
  }

  return { start, end }
}

// --- Service Class ---

export class EmployeeDayPlanGenerator {
  constructor(private prisma: PrismaClient) {}

  async generateFromTariff(
    input: GenerateFromTariffInput,
  ): Promise<GenerateFromTariffResult> {
    const { tenantId } = input

    // Apply defaults for date range
    const today = new Date()
    const defaultTo = new Date()
    defaultTo.setUTCMonth(defaultTo.getUTCMonth() + 3)

    const fromDate =
      input.from ??
      new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
      )
    const toDate =
      input.to ??
      new Date(
        Date.UTC(
          defaultTo.getUTCFullYear(),
          defaultTo.getUTCMonth(),
          defaultTo.getUTCDate(),
        ),
      )

    const overwriteTariffSource = input.overwriteTariffSource ?? true

    // Get employees to process
    let employees: EmployeeForGenerate[]

    if (input.employeeIds && input.employeeIds.length > 0) {
      const fetched = await this.prisma.employee.findMany({
        where: {
          id: { in: input.employeeIds },
          tenantId,
        },
        select: {
          id: true,
          tariffId: true,
          entryDate: true,
          exitDate: true,
        },
      })
      employees = fetched
    } else {
      const fetched = await this.prisma.employee.findMany({
        where: {
          tenantId,
          isActive: true,
          deletedAt: null,
        },
        select: {
          id: true,
          tariffId: true,
          entryDate: true,
          exitDate: true,
        },
      })
      employees = fetched
    }

    // Initialize result counters
    let employeesProcessed = 0
    let plansCreated = 0
    let plansUpdated = 0
    let employeesSkipped = 0

    // Process each employee
    for (const employee of employees) {
      // Skip if no tariffId
      if (!employee.tariffId) {
        employeesSkipped++
        continue
      }

      // Fetch tariff with full details
      const tariff = await this.prisma.tariff.findFirst({
        where: { id: employee.tariffId, tenantId },
        include: tariffGenerateInclude,
      })

      if (!tariff) {
        employeesSkipped++
        continue
      }

      // Calculate sync window
      const window = getTariffSyncWindow(
        employee,
        tariff as unknown as TariffForGenerate,
        fromDate,
        toDate,
      )
      if (!window) {
        employeesSkipped++
        continue
      }

      // Get existing EDPs in date range for this employee
      const existingPlans = await this.prisma.employeeDayPlan.findMany({
        where: {
          tenantId,
          employeeId: employee.id,
          planDate: {
            gte: window.start,
            lte: window.end,
          },
        },
      })

      // Build skip map: dates to skip based on source
      const skipDates = new Set<string>()
      for (const plan of existingPlans) {
        const dateKey = plan.planDate.toISOString().split("T")[0]!
        if (plan.source !== "tariff") {
          // Always skip manual/holiday plans
          skipDates.add(dateKey)
        } else if (!overwriteTariffSource) {
          // Skip existing tariff plans if overwrite is false
          skipDates.add(dateKey)
        }
      }

      // Generate plans for each day in window
      const plansToUpsert: Array<{
        employeeId: string
        planDate: Date
        dayPlanId: string | null
      }> = []

      const current = new Date(window.start.getTime())
      while (current.getTime() <= window.end.getTime()) {
        const dateKey = current.toISOString().split("T")[0]!

        if (!skipDates.has(dateKey)) {
          const dayPlanId = getDayPlanIdForDate(
            tariff as unknown as TariffForGenerate,
            current,
          )

          if (dayPlanId !== null) {
            plansToUpsert.push({
              employeeId: employee.id,
              planDate: new Date(current.getTime()),
              dayPlanId,
            })
          }
        }

        current.setUTCDate(current.getUTCDate() + 1)
      }

      // Bulk upsert plans
      if (plansToUpsert.length > 0) {
        // Track which are new vs updates
        const existingDateKeys = new Set(
          existingPlans.map(
            (p) => p.planDate.toISOString().split("T")[0]!,
          ),
        )

        await this.prisma.$transaction(async (tx) => {
          for (const plan of plansToUpsert) {
            await tx.employeeDayPlan.upsert({
              where: {
                employeeId_planDate: {
                  employeeId: plan.employeeId,
                  planDate: plan.planDate,
                },
              },
              create: {
                tenantId,
                employeeId: plan.employeeId,
                planDate: plan.planDate,
                dayPlanId: plan.dayPlanId,
                source: "tariff",
              },
              update: {
                dayPlanId: plan.dayPlanId,
                source: "tariff",
              },
            })
          }
        })

        for (const plan of plansToUpsert) {
          const dateKey = plan.planDate.toISOString().split("T")[0]!
          if (existingDateKeys.has(dateKey)) {
            plansUpdated++
          } else {
            plansCreated++
          }
        }
      }

      employeesProcessed++
    }

    return {
      employeesProcessed,
      plansCreated,
      plansUpdated,
      employeesSkipped,
    }
  }
}
