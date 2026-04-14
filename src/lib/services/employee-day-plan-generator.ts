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
  /**
   * If true, deletes all existing `source='tariff'` EmployeeDayPlan rows
   * within the range before generating new ones. Used by the tariff
   * assignment delete/update paths so that orphaned plans from removed
   * assignments are cleaned up. Preserves manual/holiday plans
   * (source != 'tariff').
   */
  deleteOrphanedTariffPlansInRange?: boolean
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
  /**
   * Legacy field, preserved for backwards compatibility with tests/callers
   * that still seed `employee.tariffId` directly. The generator itself
   * ignores this field and resolves tariffs via `EmployeeTariffAssignment`.
   */
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
    const deleteOrphaned = input.deleteOrphanedTariffPlansInRange ?? false

    // Get employees to process
    const employeeSelect = {
      id: true,
      entryDate: true,
      exitDate: true,
    } as const

    let employees: EmployeeForGenerate[]

    if (input.employeeIds && input.employeeIds.length > 0) {
      const fetched = await this.prisma.employee.findMany({
        where: {
          id: { in: input.employeeIds },
          tenantId,
        },
        select: employeeSelect,
      })
      employees = fetched.map((e) => ({ ...e, tariffId: null }))
    } else {
      const fetched = await this.prisma.employee.findMany({
        where: {
          tenantId,
          isActive: true,
          deletedAt: null,
        },
        select: employeeSelect,
      })
      employees = fetched.map((e) => ({ ...e, tariffId: null }))
    }

    // Initialize result counters
    let employeesProcessed = 0
    let plansCreated = 0
    let plansUpdated = 0
    let employeesSkipped = 0

    // Optional: delete orphaned tariff-source plans in the range for these
    // employees before generating. Used by delete/update paths to clean up
    // plans from removed or shifted assignments. Preserves manual/holiday
    // plans (source != 'tariff').
    if (deleteOrphaned && employees.length > 0) {
      await this.prisma.employeeDayPlan.deleteMany({
        where: {
          tenantId,
          employeeId: { in: employees.map((e) => e.id) },
          source: "tariff",
          planDate: { gte: fromDate, lte: toDate },
        },
      })
    }

    // Load all active tariff assignments overlapping the input range for
    // these employees. Each assignment defines a segment [effectiveFrom,
    // effectiveTo ?? +inf] → tariffId that the generator will use.
    const assignments = await this.prisma.employeeTariffAssignment.findMany({
      where: {
        tenantId,
        employeeId: { in: employees.map((e) => e.id) },
        isActive: true,
        effectiveFrom: { lte: toDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: fromDate } }],
      },
      orderBy: [{ employeeId: "asc" }, { effectiveFrom: "asc" }],
      select: {
        id: true,
        employeeId: true,
        tariffId: true,
        effectiveFrom: true,
        effectiveTo: true,
      },
    })

    // Group assignments by employeeId
    const assignmentsByEmployee = new Map<string, typeof assignments>()
    for (const a of assignments) {
      const list = assignmentsByEmployee.get(a.employeeId) ?? []
      list.push(a)
      assignmentsByEmployee.set(a.employeeId, list)
    }

    // Batch-load referenced tariffs
    const tariffIds = [...new Set(assignments.map((a) => a.tariffId))]
    const tariffRows =
      tariffIds.length > 0
        ? await this.prisma.tariff.findMany({
            where: { id: { in: tariffIds }, tenantId },
            include: tariffGenerateInclude,
          })
        : []
    const tariffMap = new Map(tariffRows.map((t) => [t.id, t]))

    // Batch-load existing plans for all employees in the date range
    const employeeIdsWithAssignments = [
      ...new Set(assignments.map((a) => a.employeeId)),
    ]

    const allExistingPlans =
      employeeIdsWithAssignments.length > 0
        ? await this.prisma.employeeDayPlan.findMany({
            where: {
              tenantId,
              employeeId: { in: employeeIdsWithAssignments },
              planDate: { gte: fromDate, lte: toDate },
            },
          })
        : []

    // Group existing plans by employeeId
    const existingPlansByEmployee = new Map<string, typeof allExistingPlans>()
    for (const plan of allExistingPlans) {
      const list = existingPlansByEmployee.get(plan.employeeId) ?? []
      list.push(plan)
      existingPlansByEmployee.set(plan.employeeId, list)
    }

    // Collect all upserts across all employees, then batch-execute
    const allPlansToUpsert: Array<{
      employeeId: string
      planDate: Date
      dayPlanId: string | null
      isUpdate: boolean
    }> = []

    // Process each employee
    for (const employee of employees) {
      const empAssignments = assignmentsByEmployee.get(employee.id) ?? []
      if (empAssignments.length === 0) {
        employeesSkipped++
        continue
      }

      // Build segments: one per assignment, intersected with employee
      // entry/exit, tariff validity, and input range.
      const segments: Array<{
        tariff: TariffForGenerate
        start: Date
        end: Date
      }> = []

      for (const assignment of empAssignments) {
        const tariff = tariffMap.get(assignment.tariffId)
        if (!tariff) continue

        // Clip assignment [effectiveFrom, effectiveTo ?? toDate] to input range
        const assignmentStart =
          assignment.effectiveFrom.getTime() > fromDate.getTime()
            ? assignment.effectiveFrom
            : fromDate
        const assignmentEnd =
          assignment.effectiveTo === null ||
          assignment.effectiveTo.getTime() > toDate.getTime()
            ? toDate
            : assignment.effectiveTo

        // Further constrain by employee entry/exit and tariff validity
        const window = getTariffSyncWindow(
          employee,
          tariff as unknown as TariffForGenerate,
          assignmentStart,
          assignmentEnd,
        )
        if (!window) continue

        segments.push({
          tariff: tariff as unknown as TariffForGenerate,
          start: window.start,
          end: window.end,
        })
      }

      if (segments.length === 0) {
        employeesSkipped++
        continue
      }

      // Pre-compute existing plan state across the employee's entire range
      const existingPlans = existingPlansByEmployee.get(employee.id) ?? []
      const existingByDateKey = new Map<string, (typeof existingPlans)[number]>()
      for (const plan of existingPlans) {
        const dateKey = plan.planDate.toISOString().split("T")[0]!
        existingByDateKey.set(dateKey, plan)
      }

      // Expand each segment day-by-day
      for (const segment of segments) {
        const current = new Date(segment.start.getTime())
        while (current.getTime() <= segment.end.getTime()) {
          const dateKey = current.toISOString().split("T")[0]!
          const existing = existingByDateKey.get(dateKey)

          let skip = false
          if (existing) {
            if (existing.source !== "tariff") {
              // Always preserve manual/holiday plans
              skip = true
            } else if (!overwriteTariffSource) {
              // Preserve existing tariff plans if overwrite disabled
              skip = true
            }
          }

          if (!skip) {
            const dayPlanId = getDayPlanIdForDate(segment.tariff, current)
            if (dayPlanId !== null) {
              allPlansToUpsert.push({
                employeeId: employee.id,
                planDate: new Date(current.getTime()),
                dayPlanId,
                // After deleteOrphaned, existing map is stale for source=tariff
                // rows, so we only treat non-deleted entries as updates.
                isUpdate: existing !== undefined && !deleteOrphaned,
              })
            }
          }

          current.setUTCDate(current.getUTCDate() + 1)
        }
      }

      employeesProcessed++
    }

    // Bulk upsert all plans in chunked transactions (max 500 per transaction
    // to avoid Prisma timeout on very large batches)
    const CHUNK_SIZE = 500
    for (let i = 0; i < allPlansToUpsert.length; i += CHUNK_SIZE) {
      const chunk = allPlansToUpsert.slice(i, i + CHUNK_SIZE)
      await this.prisma.$transaction(
        chunk.map((plan) =>
          this.prisma.employeeDayPlan.upsert({
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
          }),
        ),
      )
    }

    // Count created vs updated
    for (const plan of allPlansToUpsert) {
      if (plan.isUpdate) {
        plansUpdated++
      } else {
        plansCreated++
      }
    }

    return {
      employeesProcessed,
      plansCreated,
      plansUpdated,
      employeesSkipped,
    }
  }
}
