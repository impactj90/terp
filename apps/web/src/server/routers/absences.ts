/**
 * Absences Router
 *
 * Provides absence day CRUD, range creation with weekend/off-day exclusion,
 * and approval workflow (approve/reject/cancel) via tRPC procedures.
 * Includes vacation balance recalculation after approval status changes.
 *
 * Replaces the Go backend absence endpoints:
 * - GET /absences -> absences.list
 * - GET /absences/{id} -> absences.getById
 * - GET /employees/{id}/absences -> absences.forEmployee
 * - POST /employees/{id}/absences -> absences.createRange
 * - PATCH /absences/{id} -> absences.update
 * - DELETE /absences/{id} -> absences.delete
 * - POST /absences/{id}/approve -> absences.approve
 * - POST /absences/{id}/reject -> absences.reject
 * - POST /absences/{id}/cancel -> absences.cancel
 *
 * @see apps/api/internal/service/absence.go
 * @see apps/api/internal/handler/absence.go
 * @see apps/api/internal/repository/absenceday.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { Decimal } from "@prisma/client/runtime/client"
import type { PrismaClient } from "@/generated/prisma/client"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import {
  requirePermission,
  requireEmployeePermission,
  applyDataScope,
  type DataScope,
} from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"
import { RecalcService } from "../services/recalc"

// --- Permission Constants ---
// Matching Go route registration at apps/api/internal/handler/routes.go:513-562

const ABSENCE_REQUEST = permissionIdByKey("absences.request")!
const ABSENCE_APPROVE = permissionIdByKey("absences.approve")!
const ABSENCE_MANAGE = permissionIdByKey("absences.manage")!

// --- Output Schemas ---

const absenceDayOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  absenceDate: z.string(), // YYYY-MM-DD string for dates
  absenceTypeId: z.string().uuid(),
  duration: z.number(), // Decimal -> number
  halfDayPeriod: z.string().nullable(),
  status: z.string(), // "pending" | "approved" | "rejected" | "cancelled"
  approvedBy: z.string().uuid().nullable(),
  approvedAt: z.date().nullable(),
  rejectionReason: z.string().nullable(),
  notes: z.string().nullable(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  // Nested relations (included in list/getById)
  employee: z
    .object({
      id: z.string().uuid(),
      firstName: z.string(),
      lastName: z.string(),
      personnelNumber: z.string(),
      isActive: z.boolean(),
      departmentId: z.string().uuid().nullable(),
    })
    .nullable()
    .optional(),
  absenceType: z
    .object({
      id: z.string().uuid(),
      code: z.string(),
      name: z.string(),
      category: z.string(),
      color: z.string(),
      deductsVacation: z.boolean(),
    })
    .nullable()
    .optional(),
})

// --- Input Schemas ---

const listInputSchema = z.object({
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(50),
  employeeId: z.string().uuid().optional(),
  absenceTypeId: z.string().uuid().optional(),
  status: z
    .enum(["pending", "approved", "rejected", "cancelled"])
    .optional(),
  fromDate: z.string().date().optional(), // YYYY-MM-DD
  toDate: z.string().date().optional(), // YYYY-MM-DD
})

const forEmployeeInputSchema = z.object({
  employeeId: z.string().uuid(),
  fromDate: z.string().date().optional(),
  toDate: z.string().date().optional(),
  status: z
    .enum(["pending", "approved", "rejected", "cancelled"])
    .optional(),
})

const getByIdInputSchema = z.object({
  id: z.string().uuid(),
})

const createRangeInputSchema = z.object({
  employeeId: z.string().uuid(),
  absenceTypeId: z.string().uuid(),
  fromDate: z.string().date(), // YYYY-MM-DD
  toDate: z.string().date(), // YYYY-MM-DD
  duration: z.number().min(0.5).max(1).default(1),
  halfDayPeriod: z.enum(["morning", "afternoon"]).optional(),
  notes: z.string().optional(),
})

const createRangeOutputSchema = z.object({
  createdDays: z.array(absenceDayOutputSchema),
  skippedDates: z.array(z.string()), // YYYY-MM-DD strings of skipped dates
})

const updateInputSchema = z.object({
  id: z.string().uuid(),
  duration: z.number().min(0.5).max(1).optional(),
  halfDayPeriod: z.enum(["morning", "afternoon"]).nullable().optional(),
  notes: z.string().nullable().optional(),
})

const deleteInputSchema = z.object({
  id: z.string().uuid(),
})

const approveInputSchema = z.object({
  id: z.string().uuid(),
})

const rejectInputSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().optional(),
})

const cancelInputSchema = z.object({
  id: z.string().uuid(),
})

// --- Prisma Include Objects ---

const absenceDayListInclude = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      personnelNumber: true,
      isActive: true,
      departmentId: true,
    },
  },
  absenceType: {
    select: {
      id: true,
      code: true,
      name: true,
      category: true,
      color: true,
      deductsVacation: true,
    },
  },
} as const

// --- Data Scope Helpers ---

/**
 * Builds a Prisma WHERE clause for absence data scope filtering.
 * Absences are scoped via the employee relation.
 */
function buildAbsenceDataScopeWhere(
  dataScope: DataScope
): Record<string, unknown> | null {
  if (dataScope.type === "department") {
    return { employee: { departmentId: { in: dataScope.departmentIds } } }
  } else if (dataScope.type === "employee") {
    return { employeeId: { in: dataScope.employeeIds } }
  }
  return null
}

/**
 * Checks that an absence falls within the user's data scope.
 * Throws FORBIDDEN if not.
 */
function checkAbsenceDataScope(
  dataScope: DataScope,
  item: {
    employeeId: string
    employee?: { departmentId: string | null } | null
  }
): void {
  if (dataScope.type === "department") {
    if (
      !item.employee?.departmentId ||
      !dataScope.departmentIds.includes(item.employee.departmentId)
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Absence not within data scope",
      })
    }
  } else if (dataScope.type === "employee") {
    if (!dataScope.employeeIds.includes(item.employeeId)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Absence not within data scope",
      })
    }
  }
}

// --- Helper Functions ---

/**
 * Maps a Prisma AbsenceDay record to the output schema shape.
 * Handles Decimal duration conversion and relation mapping.
 */
function mapAbsenceDayToOutput(
  record: Record<string, unknown>
): z.infer<typeof absenceDayOutputSchema> {
  const duration =
    record.duration instanceof Decimal
      ? (record.duration as Decimal).toNumber()
      : Number(record.duration)

  const absenceDate =
    record.absenceDate instanceof Date
      ? record.absenceDate.toISOString().split("T")[0]!
      : String(record.absenceDate)

  const result: Record<string, unknown> = {
    id: record.id,
    tenantId: record.tenantId,
    employeeId: record.employeeId,
    absenceDate,
    absenceTypeId: record.absenceTypeId,
    duration,
    halfDayPeriod: record.halfDayPeriod ?? null,
    status: record.status,
    approvedBy: record.approvedBy ?? null,
    approvedAt: record.approvedAt ?? null,
    rejectionReason: record.rejectionReason ?? null,
    notes: record.notes ?? null,
    createdBy: record.createdBy ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }

  // Include employee if present
  const employee = record.employee as
    | Record<string, unknown>
    | undefined
    | null
  if (employee !== undefined) {
    result.employee = employee
      ? {
          id: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          personnelNumber: employee.personnelNumber,
          isActive: employee.isActive,
          departmentId: employee.departmentId ?? null,
        }
      : null
  }

  // Include absenceType if present
  const absenceType = record.absenceType as
    | Record<string, unknown>
    | undefined
    | null
  if (absenceType !== undefined) {
    result.absenceType = absenceType
      ? {
          id: absenceType.id,
          code: absenceType.code,
          name: absenceType.name,
          category: absenceType.category,
          color: absenceType.color,
          deductsVacation: absenceType.deductsVacation,
        }
      : null
  }

  return result as z.infer<typeof absenceDayOutputSchema>
}

/**
 * Determines if a date should be skipped during range creation.
 * Port of Go shouldSkipDate() from service/absence.go.
 *
 * Skip rules:
 * 1. Weekends (Saturday=6, Sunday=0 via getUTCDay())
 * 2. No EmployeeDayPlan for the date (no_plan)
 * 3. EmployeeDayPlan exists but dayPlanId is null (off_day)
 *
 * Holidays are NOT skipped per ZMI spec Section 18.2.
 */
function shouldSkipDate(
  date: Date,
  dayPlanMap: Map<string, { dayPlanId: string | null }>
): boolean {
  const dayOfWeek = date.getUTCDay()
  if (dayOfWeek === 0 || dayOfWeek === 6) return true // weekend

  const dateKey = date.toISOString().split("T")[0]!
  const dayPlan = dayPlanMap.get(dateKey)
  if (!dayPlan) return true // no plan -> skip
  if (!dayPlan.dayPlanId) return true // off-day -> skip

  return false
}

// --- Recalculation Helpers ---

/**
 * Triggers recalculation for a specific employee/day.
 * Best effort -- errors logged but don't fail parent operation.
 * Uses RecalcService which triggers both daily calc AND monthly recalc.
 *
 * @see ZMI-TICKET-243
 */
async function triggerRecalc(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  date: Date
): Promise<void> {
  try {
    const service = new RecalcService(prisma)
    await service.triggerRecalc(tenantId, employeeId, date)
  } catch (error) {
    console.error(
      `Recalc failed for employee ${employeeId} on ${date.toISOString().split("T")[0]}:`,
      error
    )
  }
}

/**
 * Triggers recalculation for a date range.
 * Best effort -- errors logged but don't fail parent operation.
 * Uses RecalcService for centralized recalc logic.
 *
 * @see ZMI-TICKET-243
 */
async function triggerRecalcRange(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  fromDate: Date,
  toDate: Date
): Promise<void> {
  try {
    const service = new RecalcService(prisma)
    await service.triggerRecalcRange(tenantId, employeeId, fromDate, toDate)
  } catch (error) {
    console.error(
      `Recalc range failed for employee ${employeeId}:`,
      error
    )
  }
}

/**
 * Recalculates vacation taken for an employee/year.
 * Sums up all approved absence days for vacation-deducting types,
 * weighted by dayPlan.vacationDeduction * absence.duration.
 *
 * Port of Go VacationService.RecalculateTaken().
 */
async function recalculateVacationTaken(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  year: number
): Promise<void> {
  // 1. Get all absence types where deductsVacation = true
  const vacationTypes = await prisma.absenceType.findMany({
    where: {
      OR: [{ tenantId }, { tenantId: null }],
      deductsVacation: true,
    },
    select: { id: true },
  })

  if (vacationTypes.length === 0) return

  const typeIds = vacationTypes.map((t) => t.id)

  // 2. Year range
  const yearStart = new Date(Date.UTC(year, 0, 1))
  const yearEnd = new Date(Date.UTC(year, 11, 31))

  // 3. Fetch approved absence days for these types in the year
  const absenceDays = await prisma.absenceDay.findMany({
    where: {
      employeeId,
      absenceTypeId: { in: typeIds },
      status: "approved",
      absenceDate: { gte: yearStart, lte: yearEnd },
    },
    select: {
      absenceDate: true,
      duration: true,
    },
  })

  // 4. Fetch day plans for the year (for vacationDeduction)
  const dayPlans = await prisma.employeeDayPlan.findMany({
    where: {
      employeeId,
      planDate: { gte: yearStart, lte: yearEnd },
    },
    include: {
      dayPlan: {
        select: { vacationDeduction: true },
      },
    },
  })

  // Build dayPlan lookup by date
  const dayPlanMap = new Map<string, number>()
  for (const dp of dayPlans) {
    const dateKey = dp.planDate.toISOString().split("T")[0]!
    const deduction = dp.dayPlan?.vacationDeduction
    dayPlanMap.set(
      dateKey,
      deduction instanceof Decimal
        ? deduction.toNumber()
        : Number(deduction ?? 1)
    )
  }

  // 5. Calculate total taken
  let totalTaken = 0
  for (const absence of absenceDays) {
    const dateKey = absence.absenceDate.toISOString().split("T")[0]!
    const vacationDeduction = dayPlanMap.get(dateKey) ?? 1.0
    const dur =
      absence.duration instanceof Decimal
        ? absence.duration.toNumber()
        : Number(absence.duration)
    totalTaken += vacationDeduction * dur
  }

  // 6. Upsert vacation balance
  await prisma.vacationBalance.upsert({
    where: {
      employeeId_year: { employeeId, year },
    },
    update: {
      taken: totalTaken,
    },
    create: {
      tenantId,
      employeeId,
      year,
      taken: totalTaken,
      entitlement: 0,
      carryover: 0,
      adjustments: 0,
    },
  })
}

// --- Router ---

export const absencesRouter = createTRPCRouter({
  /**
   * absences.list -- Returns paginated absences for the admin view.
   *
   * Supports filters: employeeId, absenceTypeId, status, fromDate, toDate.
   * Applies data scope filtering via employee relation.
   * Includes employee and absenceType in each result.
   * Orders by absenceDate DESC.
   *
   * Used by: admin approvals page, absence management.
   * Replaces: GET /absences
   *
   * Requires: absences.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(ABSENCE_MANAGE))
    .use(applyDataScope())
    .input(listInputSchema)
    .output(
      z.object({
        items: z.array(absenceDayOutputSchema),
        total: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const page = input.page ?? 1
      const pageSize = input.pageSize ?? 50
      const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

      const where: Record<string, unknown> = { tenantId }

      // Optional filters
      if (input.employeeId) {
        where.employeeId = input.employeeId
      }

      if (input.absenceTypeId) {
        where.absenceTypeId = input.absenceTypeId
      }

      if (input.status) {
        where.status = input.status
      }

      // Date range filters
      if (input.fromDate || input.toDate) {
        const absenceDate: Record<string, unknown> = {}
        if (input.fromDate) {
          absenceDate.gte = new Date(input.fromDate)
        }
        if (input.toDate) {
          absenceDate.lte = new Date(input.toDate)
        }
        where.absenceDate = absenceDate
      }

      // Apply data scope filtering
      const scopeWhere = buildAbsenceDataScopeWhere(dataScope)
      if (scopeWhere) {
        if (scopeWhere.employee && where.employee) {
          where.employee = {
            ...((where.employee as Record<string, unknown>) || {}),
            ...((scopeWhere.employee as Record<string, unknown>) || {}),
          }
        } else {
          Object.assign(where, scopeWhere)
        }
      }

      const [items, total] = await Promise.all([
        ctx.prisma.absenceDay.findMany({
          where,
          include: absenceDayListInclude,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { absenceDate: "desc" },
        }),
        ctx.prisma.absenceDay.count({ where }),
      ])

      return {
        items: items.map((item) =>
          mapAbsenceDayToOutput(item as unknown as Record<string, unknown>)
        ),
        total,
      }
    }),

  /**
   * absences.forEmployee -- Returns absences for a specific employee.
   *
   * Supports optional date range and status filters.
   * Employee-scoped: own access with absences.request, all with absences.manage.
   *
   * Used by: absence request form, absence calendar view, pending requests.
   * Replaces: GET /employees/{id}/absences
   *
   * Requires: absences.request (own) or absences.manage (any employee)
   */
  forEmployee: tenantProcedure
    .use(
      requireEmployeePermission(
        (input) => (input as { employeeId: string }).employeeId,
        ABSENCE_REQUEST,
        ABSENCE_MANAGE
      )
    )
    .input(forEmployeeInputSchema)
    .output(z.array(absenceDayOutputSchema))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const { employeeId } = input

      const where: Record<string, unknown> = { tenantId, employeeId }

      if (input.status) {
        where.status = input.status
      }

      // Date range filters
      if (input.fromDate || input.toDate) {
        const absenceDate: Record<string, unknown> = {}
        if (input.fromDate) {
          absenceDate.gte = new Date(input.fromDate)
        }
        if (input.toDate) {
          absenceDate.lte = new Date(input.toDate)
        }
        where.absenceDate = absenceDate
      }

      const absences = await ctx.prisma.absenceDay.findMany({
        where,
        include: absenceDayListInclude,
        orderBy: { absenceDate: "desc" },
      })

      return absences.map((a) =>
        mapAbsenceDayToOutput(a as unknown as Record<string, unknown>)
      )
    }),

  /**
   * absences.getById -- Returns a single absence by ID.
   *
   * Includes employee and absenceType relations.
   * Applies data scope check.
   *
   * Used by: absence detail view.
   * Replaces: GET /absences/{id}
   *
   * Requires: absences.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(ABSENCE_MANAGE))
    .use(applyDataScope())
    .input(getByIdInputSchema)
    .output(absenceDayOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

      const absence = await ctx.prisma.absenceDay.findFirst({
        where: { id: input.id, tenantId },
        include: absenceDayListInclude,
      })

      if (!absence) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Absence not found",
        })
      }

      // Check data scope
      checkAbsenceDataScope(dataScope, absence)

      return mapAbsenceDayToOutput(
        absence as unknown as Record<string, unknown>
      )
    }),

  /**
   * absences.createRange -- Creates absence days for a date range.
   *
   * Generates per-day AbsenceDay records, skipping weekends and off-days.
   * Skips dates that already have an absence (idempotent).
   * Triggers recalculation after creation.
   *
   * Port of Go AbsenceService.CreateRange().
   *
   * Used by: absence request form.
   * Replaces: POST /employees/{id}/absences
   *
   * Requires: absences.request (own) or absences.manage (any employee)
   */
  createRange: tenantProcedure
    .use(
      requireEmployeePermission(
        (input) => (input as { employeeId: string }).employeeId,
        ABSENCE_REQUEST,
        ABSENCE_MANAGE
      )
    )
    .input(createRangeInputSchema)
    .output(createRangeOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const {
        employeeId,
        absenceTypeId,
        fromDate: fromDateStr,
        toDate: toDateStr,
        duration,
        halfDayPeriod,
        notes,
      } = input

      const fromDate = new Date(fromDateStr)
      const toDate = new Date(toDateStr)

      // 1. Validate fromDate <= toDate
      if (fromDate > toDate) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "fromDate must be before or equal to toDate",
        })
      }

      // 2. Validate absence type exists, is active, belongs to tenant (or system type)
      const absenceType = await ctx.prisma.absenceType.findFirst({
        where: {
          id: absenceTypeId,
          OR: [{ tenantId }, { tenantId: null }],
          isActive: true,
        },
      })

      if (!absenceType) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Absence type not found or inactive",
        })
      }

      // 3. Batch-fetch EmployeeDayPlan records for the date range
      const dayPlans = await ctx.prisma.employeeDayPlan.findMany({
        where: {
          employeeId,
          planDate: { gte: fromDate, lte: toDate },
        },
        select: {
          planDate: true,
          dayPlanId: true,
        },
      })

      const dayPlanMap = new Map<string, { dayPlanId: string | null }>()
      for (const dp of dayPlans) {
        const dateKey = dp.planDate.toISOString().split("T")[0]!
        dayPlanMap.set(dateKey, { dayPlanId: dp.dayPlanId })
      }

      // 4. Batch-fetch existing absences for employee in range where status != 'cancelled'
      const existingAbsences = await ctx.prisma.absenceDay.findMany({
        where: {
          employeeId,
          absenceDate: { gte: fromDate, lte: toDate },
          status: { not: "cancelled" },
        },
        select: { absenceDate: true },
      })

      const existingMap = new Set<string>()
      for (const ea of existingAbsences) {
        existingMap.add(ea.absenceDate.toISOString().split("T")[0]!)
      }

      // 5. Iterate day-by-day and build records to create
      const toCreate: Array<{
        tenantId: string
        employeeId: string
        absenceDate: Date
        absenceTypeId: string
        duration: number
        halfDayPeriod: string | null
        status: string
        notes: string | null
        createdBy: string | null
      }> = []
      const skippedDates: string[] = []

      const currentDate = new Date(fromDate)
      while (currentDate <= toDate) {
        const dateKey = currentDate.toISOString().split("T")[0]!

        if (shouldSkipDate(currentDate, dayPlanMap)) {
          skippedDates.push(dateKey)
        } else if (existingMap.has(dateKey)) {
          skippedDates.push(dateKey)
        } else {
          toCreate.push({
            tenantId,
            employeeId,
            absenceDate: new Date(currentDate),
            absenceTypeId,
            duration,
            halfDayPeriod: halfDayPeriod ?? null,
            status: "pending",
            notes: notes ?? null,
            createdBy: ctx.user?.id ?? null,
          })
        }

        // Advance to next day
        currentDate.setUTCDate(currentDate.getUTCDate() + 1)
      }

      // 6. Batch create
      if (toCreate.length > 0) {
        await ctx.prisma.absenceDay.createMany({ data: toCreate })
      }

      // 7. Re-fetch created records with relations
      const createdAbsences = toCreate.length > 0
        ? await ctx.prisma.absenceDay.findMany({
            where: {
              employeeId,
              absenceTypeId,
              absenceDate: {
                gte: fromDate,
                lte: toDate,
              },
              status: "pending",
              createdBy: ctx.user?.id ?? undefined,
            },
            include: absenceDayListInclude,
            orderBy: { absenceDate: "asc" },
          })
        : []

      // 8. Trigger recalc range (best effort)
      if (toCreate.length > 0) {
        await triggerRecalcRange(
          ctx.prisma,
          tenantId,
          employeeId,
          fromDate,
          toDate
        )
      }

      // 9. Return created days + skipped dates
      return {
        createdDays: createdAbsences.map((a) =>
          mapAbsenceDayToOutput(a as unknown as Record<string, unknown>)
        ),
        skippedDates,
      }
    }),

  /**
   * absences.update -- Updates a pending absence (duration, halfDayPeriod, notes).
   *
   * Only pending absences can be updated.
   * Triggers recalculation after update.
   *
   * Used by: absence edit form sheet.
   * Replaces: PATCH /absences/{id}
   *
   * Requires: absences.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(ABSENCE_MANAGE))
    .use(applyDataScope())
    .input(updateInputSchema)
    .output(absenceDayOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

      // 1. Fetch the absence
      const absence = await ctx.prisma.absenceDay.findFirst({
        where: { id: input.id, tenantId },
        include: {
          employee: {
            select: { id: true, departmentId: true },
          },
        },
      })

      if (!absence) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Absence not found",
        })
      }

      // 2. Check data scope
      checkAbsenceDataScope(dataScope, absence)

      // 3. Validate status is pending
      if (absence.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only pending absences can be updated",
        })
      }

      // 4. Build update data
      const updateData: Record<string, unknown> = {}
      if (input.duration !== undefined) {
        updateData.duration = input.duration
      }
      if (input.halfDayPeriod !== undefined) {
        updateData.halfDayPeriod = input.halfDayPeriod
      }
      if (input.notes !== undefined) {
        updateData.notes = input.notes
      }

      // 5. Update
      const updated = await ctx.prisma.absenceDay.update({
        where: { id: input.id },
        data: updateData,
        include: absenceDayListInclude,
      })

      // 6. Trigger recalc (best effort)
      await triggerRecalc(ctx.prisma, tenantId, absence.employeeId, absence.absenceDate)

      return mapAbsenceDayToOutput(
        updated as unknown as Record<string, unknown>
      )
    }),

  /**
   * absences.delete -- Deletes an absence.
   *
   * If the deleted absence was approved and its type deducts vacation,
   * triggers vacation balance recalculation.
   * Triggers recalculation after delete.
   *
   * Used by: absence management.
   * Replaces: DELETE /absences/{id}
   *
   * Requires: absences.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(ABSENCE_MANAGE))
    .use(applyDataScope())
    .input(deleteInputSchema)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

      // 1. Fetch the absence with type info
      const absence = await ctx.prisma.absenceDay.findFirst({
        where: { id: input.id, tenantId },
        include: {
          employee: {
            select: { id: true, departmentId: true },
          },
          absenceType: {
            select: { deductsVacation: true },
          },
        },
      })

      if (!absence) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Absence not found",
        })
      }

      // 2. Check data scope
      checkAbsenceDataScope(dataScope, absence)

      const wasApproved = absence.status === "approved"
      const deductsVacation = absence.absenceType?.deductsVacation ?? false
      const absenceDate = absence.absenceDate
      const absenceYear = absenceDate.getUTCFullYear()

      // 3. Hard delete
      await ctx.prisma.absenceDay.delete({ where: { id: input.id } })

      // 4. Trigger recalc (best effort)
      await triggerRecalc(ctx.prisma, tenantId, absence.employeeId, absenceDate)

      // 5. If was approved and type deducts vacation, recalculate vacation balance
      if (wasApproved && deductsVacation) {
        try {
          await recalculateVacationTaken(
            ctx.prisma,
            tenantId,
            absence.employeeId,
            absenceYear
          )
        } catch (error) {
          console.error(
            `Vacation recalc failed for employee ${absence.employeeId}:`,
            error
          )
        }
      }

      return { success: true }
    }),

  /**
   * absences.approve -- Approves a pending absence.
   *
   * Sets status to "approved", records approvedBy and approvedAt.
   * Triggers recalculation and vacation balance update (if type deducts vacation).
   * Sends notification to employee.
   *
   * Port of Go AbsenceService.Approve().
   *
   * Used by: admin approvals page.
   * Replaces: POST /absences/{id}/approve
   *
   * Requires: absences.approve permission
   */
  approve: tenantProcedure
    .use(requirePermission(ABSENCE_APPROVE))
    .use(applyDataScope())
    .input(approveInputSchema)
    .output(absenceDayOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

      // 1. Fetch absence with relations
      const absence = await ctx.prisma.absenceDay.findFirst({
        where: { id: input.id, tenantId },
        include: {
          employee: {
            select: { id: true, departmentId: true },
          },
          absenceType: {
            select: {
              id: true,
              name: true,
              deductsVacation: true,
            },
          },
        },
      })

      if (!absence) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Absence not found",
        })
      }

      // 2. Check data scope
      checkAbsenceDataScope(dataScope, absence)

      // 3. Validate status is pending
      if (absence.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only pending absences can be approved",
        })
      }

      // 4. Update status to approved
      const updated = await ctx.prisma.absenceDay.update({
        where: { id: input.id },
        data: {
          status: "approved",
          approvedBy: ctx.user!.id,
          approvedAt: new Date(),
        },
        include: absenceDayListInclude,
      })

      // 5. Trigger recalc (best effort)
      await triggerRecalc(ctx.prisma, tenantId, absence.employeeId, absence.absenceDate)

      // 6. If deductsVacation, recalculate vacation balance (best effort)
      if (absence.absenceType?.deductsVacation) {
        try {
          const absenceYear = absence.absenceDate.getUTCFullYear()
          await recalculateVacationTaken(
            ctx.prisma,
            tenantId,
            absence.employeeId,
            absenceYear
          )
        } catch (error) {
          console.error(
            `Vacation recalc failed for employee ${absence.employeeId}:`,
            error
          )
        }
      }

      // 7. Send notification to employee (best effort)
      try {
        const dateLabel = absence.absenceDate.toISOString().split("T")[0]
        const typeName = absence.absenceType?.name ?? "Absence"
        const link = "/absences"

        const userTenant = await ctx.prisma.$queryRaw<
          { user_id: string }[]
        >`
          SELECT ut.user_id
          FROM user_tenants ut
          JOIN users u ON u.id = ut.user_id
          WHERE ut.tenant_id = ${tenantId}::uuid
            AND u.employee_id = ${absence.employeeId}::uuid
          LIMIT 1
        `

        if (userTenant && userTenant.length > 0) {
          await ctx.prisma.notification.create({
            data: {
              tenantId,
              userId: userTenant[0]!.user_id,
              type: "approvals",
              title: "Absence approved",
              message: `${typeName} on ${dateLabel} was approved.`,
              link,
            },
          })
        }
      } catch {
        console.error(
          "Failed to send approval notification for absence",
          input.id
        )
      }

      return mapAbsenceDayToOutput(
        updated as unknown as Record<string, unknown>
      )
    }),

  /**
   * absences.reject -- Rejects a pending absence.
   *
   * Sets status to "rejected" and stores optional rejection reason.
   * Triggers recalculation.
   * Sends notification to employee.
   *
   * Port of Go AbsenceService.Reject().
   *
   * Used by: admin approvals page.
   * Replaces: POST /absences/{id}/reject
   *
   * Requires: absences.approve permission
   */
  reject: tenantProcedure
    .use(requirePermission(ABSENCE_APPROVE))
    .use(applyDataScope())
    .input(rejectInputSchema)
    .output(absenceDayOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

      // 1. Fetch absence with relations
      const absence = await ctx.prisma.absenceDay.findFirst({
        where: { id: input.id, tenantId },
        include: {
          employee: {
            select: { id: true, departmentId: true },
          },
          absenceType: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })

      if (!absence) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Absence not found",
        })
      }

      // 2. Check data scope
      checkAbsenceDataScope(dataScope, absence)

      // 3. Validate status is pending
      if (absence.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only pending absences can be rejected",
        })
      }

      // 4. Update status to rejected
      const updated = await ctx.prisma.absenceDay.update({
        where: { id: input.id },
        data: {
          status: "rejected",
          rejectionReason: input.reason ?? null,
        },
        include: absenceDayListInclude,
      })

      // 5. Trigger recalc (best effort)
      await triggerRecalc(ctx.prisma, tenantId, absence.employeeId, absence.absenceDate)

      // 6. Send rejection notification to employee (best effort)
      try {
        const dateLabel = absence.absenceDate.toISOString().split("T")[0]
        const typeName = absence.absenceType?.name ?? "Absence"
        const reasonSuffix = input.reason ? ` (Reason: ${input.reason})` : ""
        const link = "/absences"

        const userTenant = await ctx.prisma.$queryRaw<
          { user_id: string }[]
        >`
          SELECT ut.user_id
          FROM user_tenants ut
          JOIN users u ON u.id = ut.user_id
          WHERE ut.tenant_id = ${tenantId}::uuid
            AND u.employee_id = ${absence.employeeId}::uuid
          LIMIT 1
        `

        if (userTenant && userTenant.length > 0) {
          await ctx.prisma.notification.create({
            data: {
              tenantId,
              userId: userTenant[0]!.user_id,
              type: "approvals",
              title: "Absence rejected",
              message: `${typeName} on ${dateLabel} was rejected.${reasonSuffix}`,
              link,
            },
          })
        }
      } catch {
        console.error(
          "Failed to send rejection notification for absence",
          input.id
        )
      }

      return mapAbsenceDayToOutput(
        updated as unknown as Record<string, unknown>
      )
    }),

  /**
   * absences.cancel -- Cancels an approved absence.
   *
   * Sets status to "cancelled".
   * Triggers recalculation and vacation balance update (if type deducts vacation).
   *
   * Port of Go AbsenceService.Cancel().
   *
   * Used by: absence cancel dialog.
   * Replaces: POST /absences/{id}/cancel
   *
   * Requires: absences.approve permission
   */
  cancel: tenantProcedure
    .use(requirePermission(ABSENCE_APPROVE))
    .use(applyDataScope())
    .input(cancelInputSchema)
    .output(absenceDayOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

      // 1. Fetch absence with relations
      const absence = await ctx.prisma.absenceDay.findFirst({
        where: { id: input.id, tenantId },
        include: {
          employee: {
            select: { id: true, departmentId: true },
          },
          absenceType: {
            select: {
              id: true,
              deductsVacation: true,
            },
          },
        },
      })

      if (!absence) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Absence not found",
        })
      }

      // 2. Check data scope
      checkAbsenceDataScope(dataScope, absence)

      // 3. Validate status is approved (only approved can be cancelled)
      if (absence.status !== "approved") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only approved absences can be cancelled",
        })
      }

      // 4. Update status to cancelled
      const updated = await ctx.prisma.absenceDay.update({
        where: { id: input.id },
        data: { status: "cancelled" },
        include: absenceDayListInclude,
      })

      // 5. Trigger recalc (best effort)
      await triggerRecalc(ctx.prisma, tenantId, absence.employeeId, absence.absenceDate)

      // 6. If deductsVacation, recalculate vacation balance (best effort)
      if (absence.absenceType?.deductsVacation) {
        try {
          const absenceYear = absence.absenceDate.getUTCFullYear()
          await recalculateVacationTaken(
            ctx.prisma,
            tenantId,
            absence.employeeId,
            absenceYear
          )
        } catch (error) {
          console.error(
            `Vacation recalc failed for employee ${absence.employeeId}:`,
            error
          )
        }
      }

      return mapAbsenceDayToOutput(
        updated as unknown as Record<string, unknown>
      )
    }),
})

// --- Exported helpers for testing ---

export {
  mapAbsenceDayToOutput,
  buildAbsenceDataScopeWhere,
  checkAbsenceDataScope,
  shouldSkipDate,
}
