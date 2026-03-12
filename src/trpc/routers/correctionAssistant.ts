/**
 * Correction Assistant Router
 *
 * Provides correction message catalog management (list, get, update + auto-seed)
 * and correction assistant items query (daily values with errors) via tRPC procedures.
 *
 * Replaces the Go backend correction assistant endpoints:
 * - GET   /correction-messages      -> correctionAssistant.listMessages
 * - GET   /correction-messages/{id} -> correctionAssistant.getMessage
 * - PATCH /correction-messages/{id} -> correctionAssistant.updateMessage
 * - GET   /correction-assistant     -> correctionAssistant.listItems
 *
 * @see apps/api/internal/service/correction_assistant.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---

const TIME_TRACKING_VIEW_ALL = permissionIdByKey("time_tracking.view_all")!
const CORRECTIONS_MANAGE = permissionIdByKey("corrections.manage")!

// --- Error Codes (from calculation/errors.go) ---

const ERR_MISSING_COME = "MISSING_COME"
const ERR_MISSING_GO = "MISSING_GO"
const ERR_UNPAIRED_BOOKING = "UNPAIRED_BOOKING"
const ERR_EARLY_COME = "EARLY_COME"
const ERR_LATE_COME = "LATE_COME"
const ERR_EARLY_GO = "EARLY_GO"
const ERR_LATE_GO = "LATE_GO"
const ERR_MISSED_CORE_START = "MISSED_CORE_START"
const ERR_MISSED_CORE_END = "MISSED_CORE_END"
const ERR_BELOW_MIN_WORK_TIME = "BELOW_MIN_WORK_TIME"
const ERR_NO_BOOKINGS = "NO_BOOKINGS"
const ERR_INVALID_TIME = "INVALID_TIME"
const ERR_DUPLICATE_IN_TIME = "DUPLICATE_IN_TIME"
const ERR_NO_MATCHING_SHIFT = "NO_MATCHING_SHIFT"

// Warning codes
const WARN_CROSS_MIDNIGHT = "CROSS_MIDNIGHT"
const WARN_MAX_TIME_REACHED = "MAX_TIME_REACHED"
const WARN_MANUAL_BREAK = "MANUAL_BREAK"
const WARN_NO_BREAK_RECORDED = "NO_BREAK_RECORDED"
const WARN_SHORT_BREAK = "SHORT_BREAK"
const WARN_AUTO_BREAK_APPLIED = "AUTO_BREAK_APPLIED"
const WARN_MONTHLY_CAP = "MONTHLY_CAP_REACHED"
const WARN_FLEXTIME_CAPPED = "FLEXTIME_CAPPED"
const WARN_BELOW_THRESHOLD = "BELOW_THRESHOLD"
const WARN_NO_CARRYOVER = "NO_CARRYOVER"

// --- Error Type Mapping ---

function mapCorrectionErrorType(code: string): string {
  switch (code) {
    case ERR_MISSING_COME:
    case ERR_MISSING_GO:
    case ERR_NO_BOOKINGS:
      return "missing_booking"
    case ERR_UNPAIRED_BOOKING:
      return "unpaired_booking"
    case ERR_DUPLICATE_IN_TIME:
      return "overlapping_bookings"
    case ERR_EARLY_COME:
    case ERR_LATE_COME:
    case ERR_EARLY_GO:
    case ERR_LATE_GO:
    case ERR_MISSED_CORE_START:
    case ERR_MISSED_CORE_END:
      return "core_time_violation"
    case ERR_BELOW_MIN_WORK_TIME:
      return "below_min_hours"
    case WARN_NO_BREAK_RECORDED:
    case WARN_SHORT_BREAK:
    case WARN_MANUAL_BREAK:
    case WARN_AUTO_BREAK_APPLIED:
      return "break_violation"
    case WARN_MAX_TIME_REACHED:
      return "exceeds_max_hours"
    default:
      return "invalid_sequence"
  }
}

// --- Default Correction Messages ---

function defaultCorrectionMessages(tenantId: string) {
  return [
    // Error codes
    { tenantId, code: ERR_MISSING_COME, defaultText: "Missing arrival booking", severity: "error", description: "No arrival booking found for this work day" },
    { tenantId, code: ERR_MISSING_GO, defaultText: "Missing departure booking", severity: "error", description: "No departure booking found for this work day" },
    { tenantId, code: ERR_UNPAIRED_BOOKING, defaultText: "Unpaired booking", severity: "error", description: "A booking exists without a matching pair" },
    { tenantId, code: ERR_EARLY_COME, defaultText: "Arrival before allowed window", severity: "error", description: "Employee arrived before the allowed time window" },
    { tenantId, code: ERR_LATE_COME, defaultText: "Arrival after allowed window", severity: "error", description: "Employee arrived after the allowed time window" },
    { tenantId, code: ERR_EARLY_GO, defaultText: "Departure before allowed window", severity: "error", description: "Employee departed before the allowed time window" },
    { tenantId, code: ERR_LATE_GO, defaultText: "Departure after allowed window", severity: "error", description: "Employee departed after the allowed time window" },
    { tenantId, code: ERR_MISSED_CORE_START, defaultText: "Missed core hours start", severity: "error", description: "Employee arrived after mandatory core hours started" },
    { tenantId, code: ERR_MISSED_CORE_END, defaultText: "Missed core hours end", severity: "error", description: "Employee departed before mandatory core hours ended" },
    { tenantId, code: ERR_BELOW_MIN_WORK_TIME, defaultText: "Below minimum work time", severity: "error", description: "Actual work time is below the required minimum" },
    { tenantId, code: ERR_NO_BOOKINGS, defaultText: "No bookings for the day", severity: "error", description: "No bookings exist for an active work day" },
    { tenantId, code: ERR_INVALID_TIME, defaultText: "Invalid time value", severity: "error", description: "A booking has a time value outside the valid range" },
    { tenantId, code: ERR_DUPLICATE_IN_TIME, defaultText: "Duplicate arrival time", severity: "error", description: "Multiple arrival bookings at the same time" },
    { tenantId, code: ERR_NO_MATCHING_SHIFT, defaultText: "No matching time plan found", severity: "error", description: "No day plan matches the booking times for shift detection" },
    // Warning codes (mapped to "hint" severity)
    { tenantId, code: WARN_CROSS_MIDNIGHT, defaultText: "Shift spans midnight", severity: "hint", description: "The work shift crosses midnight into the next day" },
    { tenantId, code: WARN_MAX_TIME_REACHED, defaultText: "Maximum work time reached", severity: "hint", description: "Net time was capped at the maximum allowed" },
    { tenantId, code: WARN_MANUAL_BREAK, defaultText: "Manual break booking exists", severity: "hint", description: "Break bookings exist; automatic break deduction was skipped" },
    { tenantId, code: WARN_NO_BREAK_RECORDED, defaultText: "No break booking recorded", severity: "hint", description: "No break was booked although a break is required" },
    { tenantId, code: WARN_SHORT_BREAK, defaultText: "Break duration too short", severity: "hint", description: "Recorded break is shorter than the required minimum" },
    { tenantId, code: WARN_AUTO_BREAK_APPLIED, defaultText: "Automatic break applied", severity: "hint", description: "Break was automatically deducted per day plan rules" },
    { tenantId, code: WARN_MONTHLY_CAP, defaultText: "Monthly cap reached", severity: "hint", description: "Flextime credit was capped at the monthly maximum" },
    { tenantId, code: WARN_FLEXTIME_CAPPED, defaultText: "Flextime balance capped", severity: "hint", description: "Flextime balance was limited by positive or negative cap" },
    { tenantId, code: WARN_BELOW_THRESHOLD, defaultText: "Below threshold", severity: "hint", description: "Overtime is below the configured threshold and was forfeited" },
    { tenantId, code: WARN_NO_CARRYOVER, defaultText: "No carryover", severity: "hint", description: "Account credit type resets to zero with no carryover" },
  ]
}

// --- EnsureDefaults ---

async function ensureDefaults(prisma: PrismaClient, tenantId: string): Promise<void> {
  const count = await prisma.correctionMessage.count({ where: { tenantId } })
  if (count > 0) return

  await prisma.correctionMessage.createMany({
    data: defaultCorrectionMessages(tenantId),
  })
}

// --- Output Schemas ---

const correctionMessageOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  code: z.string(),
  defaultText: z.string(),
  customText: z.string().nullable(),
  effectiveText: z.string(),
  severity: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const correctionAssistantErrorSchema = z.object({
  code: z.string(),
  severity: z.string(),
  message: z.string(),
  errorType: z.string(),
})

const correctionAssistantItemSchema = z.object({
  dailyValueId: z.string(),
  employeeId: z.string(),
  employeeName: z.string(),
  departmentId: z.string().nullable(),
  departmentName: z.string().nullable(),
  valueDate: z.string(),
  errors: z.array(correctionAssistantErrorSchema),
})

// --- Helper: Map CorrectionMessage to output with effectiveText ---

function mapMessage(msg: {
  id: string
  tenantId: string
  code: string
  defaultText: string
  customText: string | null
  severity: string
  description: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}) {
  return {
    ...msg,
    effectiveText: msg.customText || msg.defaultText,
  }
}

// --- Raw SQL row type for daily values query ---

// --- Router ---

export const correctionAssistantRouter = createTRPCRouter({
  /**
   * correctionAssistant.listMessages -- Returns correction messages for the current tenant.
   *
   * Auto-seeds default messages on first access.
   * Supports optional severity, isActive, and code filters.
   * Orders by severity ASC, code ASC.
   *
   * Requires: time_tracking.view_all permission
   */
  listMessages: tenantProcedure
    .use(requirePermission(TIME_TRACKING_VIEW_ALL))
    .input(
      z.object({
        severity: z.enum(["error", "hint"]).optional(),
        isActive: z.boolean().optional(),
        code: z.string().optional(),
      }).optional()
    )
    .output(z.object({ data: z.array(correctionMessageOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!

        await ensureDefaults(ctx.prisma, tenantId)

        const where: Record<string, unknown> = { tenantId }
        if (input?.severity !== undefined) {
          where.severity = input.severity
        }
        if (input?.isActive !== undefined) {
          where.isActive = input.isActive
        }
        if (input?.code !== undefined) {
          where.code = input.code
        }

        const messages = await ctx.prisma.correctionMessage.findMany({
          where,
          orderBy: [{ severity: "asc" }, { code: "asc" }],
        })

        return { data: messages.map(mapMessage) }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * correctionAssistant.getMessage -- Returns a single correction message by ID.
   *
   * Requires: time_tracking.view_all permission
   */
  getMessage: tenantProcedure
    .use(requirePermission(TIME_TRACKING_VIEW_ALL))
    .input(z.object({ id: z.string() }))
    .output(correctionMessageOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!

        const message = await ctx.prisma.correctionMessage.findFirst({
          where: { id: input.id, tenantId },
        })

        if (!message) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Correction message not found",
          })
        }

        return mapMessage(message)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * correctionAssistant.updateMessage -- Updates a correction message.
   *
   * Supports partial update of customText, severity, and isActive.
   * Setting customText to empty string clears it to null.
   *
   * Requires: corrections.manage permission
   */
  updateMessage: tenantProcedure
    .use(requirePermission(CORRECTIONS_MANAGE))
    .input(z.object({
      id: z.string(),
      customText: z.string().nullable().optional(),
      severity: z.enum(["error", "hint"]).optional(),
      isActive: z.boolean().optional(),
    }))
    .output(correctionMessageOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!

        // Verify exists with tenant scope
        const existing = await ctx.prisma.correctionMessage.findFirst({
          where: { id: input.id, tenantId },
        })
        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Correction message not found",
          })
        }

        // Build partial update data
        const data: Record<string, unknown> = {}

        if (input.customText !== undefined) {
          if (input.customText === null || input.customText === "") {
            data.customText = null
          } else {
            const trimmed = input.customText.trim()
            data.customText = trimmed === "" ? null : trimmed
          }
        }

        if (input.severity !== undefined) {
          data.severity = input.severity
        }

        if (input.isActive !== undefined) {
          data.isActive = input.isActive
        }

        const updated = await ctx.prisma.correctionMessage.update({
          where: { id: input.id },
          data,
        })

        return mapMessage(updated)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * correctionAssistant.listItems -- Returns daily values with errors for correction.
   *
   * Auto-seeds default messages on first access.
   * Queries daily_values via Prisma with employee/department includes.
   * Applies in-memory pagination after filtering.
   *
   * Requires: time_tracking.view_all permission
   */
  listItems: tenantProcedure
    .use(requirePermission(TIME_TRACKING_VIEW_ALL))
    .input(
      z.object({
        from: z.string().date().optional(),
        to: z.string().date().optional(),
        employeeId: z.string().optional(),
        departmentId: z.string().optional(),
        severity: z.enum(["error", "hint"]).optional(),
        errorCode: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional(),
      }).optional()
    )
    .output(z.object({
      data: z.array(correctionAssistantItemSchema),
      meta: z.object({
        total: z.number(),
        limit: z.number(),
        offset: z.number(),
        hasMore: z.boolean(),
      }),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!

        await ensureDefaults(ctx.prisma, tenantId)

        // Calculate date range
        const now = new Date()
        let fromDate: Date
        let toDate: Date

        if (input?.from) {
          fromDate = new Date(input.from)
        } else {
          // First day of previous month
          fromDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        }

        if (input?.to) {
          toDate = new Date(input.to)
        } else {
          // Last day of current month
          toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        }

        // Load message catalog for resolution
        const activeMessages = await ctx.prisma.correctionMessage.findMany({
          where: { tenantId, isActive: true },
        })
        const messageMap = new Map(activeMessages.map((m) => [m.code, m]))

        // Build Prisma query with dynamic filters
        const dvWhere: Record<string, unknown> = {
          tenantId,
          hasError: true,
          valueDate: {
            gte: fromDate,
            lte: toDate,
          },
        }

        if (input?.employeeId) {
          dvWhere.employeeId = input.employeeId
        }

        if (input?.departmentId) {
          dvWhere.employee = { departmentId: input.departmentId }
        }

        const rows = await ctx.prisma.dailyValue.findMany({
          where: dvWhere,
          include: {
            employee: {
              select: {
                firstName: true,
                lastName: true,
                departmentId: true,
                department: {
                  select: { name: true },
                },
              },
            },
          },
          orderBy: { valueDate: "asc" },
        })

        // Build correction assistant items
        const severityFilter = input?.severity
        const codeFilter = input?.errorCode

        interface CorrectionAssistantError {
          code: string
          severity: string
          message: string
          errorType: string
        }

        interface CorrectionAssistantItem {
          dailyValueId: string
          employeeId: string
          employeeName: string
          departmentId: string | null
          departmentName: string | null
          valueDate: string
          errors: CorrectionAssistantError[]
        }

        const items: CorrectionAssistantItem[] = []

        for (const row of rows) {
          const errors: CorrectionAssistantError[] = []

          // Process error codes
          if (row.errorCodes) {
            for (const code of row.errorCodes) {
              if (severityFilter && severityFilter !== "error") continue
              if (codeFilter && codeFilter !== code) continue

              let message = code // Fallback to raw code
              let severity = "error"
              const catalogEntry = messageMap.get(code)
              if (catalogEntry) {
                message = catalogEntry.customText || catalogEntry.defaultText
                severity = catalogEntry.severity
              }

              errors.push({
                code,
                severity,
                message,
                errorType: mapCorrectionErrorType(code),
              })
            }
          }

          // Process warnings as "hint" severity
          if (row.warnings) {
            for (const code of row.warnings) {
              if (severityFilter && severityFilter !== "hint") continue
              if (codeFilter && codeFilter !== code) continue

              let message = code // Fallback to raw code
              let severity = "hint"
              const catalogEntry = messageMap.get(code)
              if (catalogEntry) {
                message = catalogEntry.customText || catalogEntry.defaultText
                severity = catalogEntry.severity
              }

              errors.push({
                code,
                severity,
                message,
                errorType: mapCorrectionErrorType(code),
              })
            }
          }

          if (errors.length === 0) continue

          // Format date as YYYY-MM-DD string
          const valueDate = row.valueDate instanceof Date
            ? row.valueDate.toISOString().split("T")[0]!
            : String(row.valueDate).split("T")[0]!

          items.push({
            dailyValueId: row.id,
            employeeId: row.employeeId,
            employeeName: `${row.employee.firstName} ${row.employee.lastName}`,
            departmentId: row.employee.departmentId,
            departmentName: row.employee.department?.name ?? null,
            valueDate,
            errors,
          })
        }

        const total = items.length
        const limit = input?.limit ?? 50
        const offset = input?.offset ?? 0

        // Apply pagination
        const paginatedItems = items.slice(offset, offset + limit)
        const hasMore = offset + limit < total

        return {
          data: paginatedItems,
          meta: {
            total,
            limit,
            offset,
            hasMore,
          },
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
