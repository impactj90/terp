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
import { Decimal } from "@prisma/client/runtime/client"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure, createMiddleware } from "@/trpc/init"
import type { ContextUser } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import {
  requirePermission,
  requireEmployeePermission,
  applyDataScope,
  type DataScope,
} from "@/lib/auth/middleware"
import { hasPermission, isUserAdmin } from "@/lib/auth/permissions"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as absencesService from "@/lib/services/absences-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
// Matching Go route registration at apps/api/internal/handler/routes.go:513-562

const ABSENCE_REQUEST = permissionIdByKey("absences.request")!
const ABSENCE_APPROVE = permissionIdByKey("absences.approve")!
const ABSENCE_MANAGE = permissionIdByKey("absences.manage")!

// --- Custom Middleware ---

/**
 * Allows access if:
 * - User is admin (bypass)
 * - User has `allPermission` (manage/approve — any absence)
 * - User has `ownPermission` (request) AND the absence belongs to their employee
 *
 * Resolves the absence's employeeId by looking up the absence by input.id.
 */
function requireOwnAbsenceOrPermission(ownPermission: string, allPermission: string) {
  return createMiddleware(async (opts) => {
    const { ctx, next } = opts
    const user = (ctx as { user: ContextUser }).user
    if (!user) throw new TRPCError({ code: "UNAUTHORIZED" })
    if (isUserAdmin(user)) return next({ ctx })
    if (hasPermission(user, allPermission)) return next({ ctx })

    // Check own-absence access
    if (user.employeeId && hasPermission(user, ownPermission)) {
      const resolvedInput = opts.input ?? await (opts as unknown as { getRawInput: () => Promise<unknown> }).getRawInput()
      const absenceId = (resolvedInput as { id: string }).id
      const prisma = (ctx as { prisma: PrismaClient }).prisma
      const absence = await prisma.absenceDay.findUnique({
        where: { id: absenceId },
        select: { employeeId: true },
      })
      if (absence && absence.employeeId === user.employeeId) {
        return next({ ctx })
      }
    }

    throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions" })
  })
}

// --- Output Schemas ---

const absenceDayOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  employeeId: z.string(),
  absenceDate: z.string(), // YYYY-MM-DD string for dates
  absenceTypeId: z.string(),
  duration: z.number(), // Decimal -> number
  halfDayPeriod: z.string().nullable(),
  status: z.string(), // "pending" | "approved" | "rejected" | "cancelled"
  approvedBy: z.string().nullable(),
  approvedAt: z.date().nullable(),
  rejectionReason: z.string().nullable(),
  notes: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  // Nested relations (included in list/getById)
  employee: z
    .object({
      id: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      personnelNumber: z.string(),
      isActive: z.boolean(),
      departmentId: z.string().nullable(),
    })
    .nullable()
    .optional(),
  absenceType: z
    .object({
      id: z.string(),
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
  employeeId: z.string().optional(),
  absenceTypeId: z.string().optional(),
  status: z
    .enum(["pending", "approved", "rejected", "cancelled"])
    .optional(),
  fromDate: z.string().date().optional(), // YYYY-MM-DD
  toDate: z.string().date().optional(), // YYYY-MM-DD
})

const forEmployeeInputSchema = z.object({
  employeeId: z.string(),
  fromDate: z.string().date().optional(),
  toDate: z.string().date().optional(),
  status: z
    .enum(["pending", "approved", "rejected", "cancelled"])
    .optional(),
})

const getByIdInputSchema = z.object({
  id: z.string(),
})

const createRangeInputSchema = z.object({
  employeeId: z.string(),
  absenceTypeId: z.string(),
  fromDate: z.string().date(), // YYYY-MM-DD
  toDate: z.string().date(), // YYYY-MM-DD
  duration: z.number().min(0.5).max(1).default(1),
  halfDayPeriod: z.enum(["morning", "afternoon"]).optional(),
  notes: z.string().max(2000).optional(),
})

const createRangeOutputSchema = z.object({
  createdDays: z.array(absenceDayOutputSchema),
  skippedDates: z.array(z.string()), // YYYY-MM-DD strings of skipped dates
})

const updateInputSchema = z.object({
  id: z.string(),
  duration: z.number().min(0.5).max(1).optional(),
  halfDayPeriod: z.enum(["morning", "afternoon"]).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
})

const deleteInputSchema = z.object({
  id: z.string(),
})

const approveInputSchema = z.object({
  id: z.string(),
})

const rejectInputSchema = z.object({
  id: z.string(),
  reason: z.string().max(2000).optional(),
})

const cancelInputSchema = z.object({
  id: z.string(),
})

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
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const { items, total } = await absencesService.list(
          ctx.prisma,
          ctx.tenantId!,
          input,
          dataScope
        )
        return {
          items: items.map((item) =>
            mapAbsenceDayToOutput(item as unknown as Record<string, unknown>)
          ),
          total,
        }
      } catch (err) {
        handleServiceError(err)
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
      try {
        const absences = await absencesService.forEmployee(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
        return absences.map((a) =>
          mapAbsenceDayToOutput(a as unknown as Record<string, unknown>)
        )
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const absence = await absencesService.getById(
          ctx.prisma,
          ctx.tenantId!,
          input.id,
          dataScope
        )
        return mapAbsenceDayToOutput(
          absence as unknown as Record<string, unknown>
        )
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const { createdAbsences, skippedDates } =
          await absencesService.createRange(
            ctx.prisma,
            ctx.tenantId!,
            input,
            ctx.user ? { userId: ctx.user.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent } : null
          )
        return {
          createdDays: createdAbsences.map((a) =>
            mapAbsenceDayToOutput(a as unknown as Record<string, unknown>)
          ),
          skippedDates,
        }
      } catch (err) {
        handleServiceError(err)
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
   * Requires: absences.request (own pending) or absences.manage (any)
   */
  update: tenantProcedure
    .use(requireOwnAbsenceOrPermission(ABSENCE_REQUEST, ABSENCE_MANAGE))
    .use(applyDataScope())
    .input(updateInputSchema)
    .output(absenceDayOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const updated = await absencesService.update(
          ctx.prisma,
          ctx.tenantId!,
          input,
          dataScope,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapAbsenceDayToOutput(
          updated as unknown as Record<string, unknown>
        )
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        await absencesService.remove(
          ctx.prisma,
          ctx.tenantId!,
          input.id,
          dataScope,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const updated = await absencesService.approve(
          ctx.prisma,
          ctx.tenantId!,
          input.id,
          dataScope,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapAbsenceDayToOutput(
          updated as unknown as Record<string, unknown>
        )
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const updated = await absencesService.reject(
          ctx.prisma,
          ctx.tenantId!,
          input.id,
          input.reason,
          dataScope,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapAbsenceDayToOutput(
          updated as unknown as Record<string, unknown>
        )
      } catch (err) {
        handleServiceError(err)
      }
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
   * Requires: absences.request (own pending) or absences.approve (any)
   */
  cancel: tenantProcedure
    .use(requireOwnAbsenceOrPermission(ABSENCE_REQUEST, ABSENCE_APPROVE))
    .use(applyDataScope())
    .input(cancelInputSchema)
    .output(absenceDayOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const updated = await absencesService.cancel(
          ctx.prisma,
          ctx.tenantId!,
          input.id,
          dataScope,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapAbsenceDayToOutput(
          updated as unknown as Record<string, unknown>
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})

// --- Exported helpers for testing ---

export {
  mapAbsenceDayToOutput,
}

// Re-export from service for backward compatibility
export {
  buildAbsenceDataScopeWhere,
  checkAbsenceDataScope,
  shouldSkipDate,
} from "@/lib/services/absences-service"
