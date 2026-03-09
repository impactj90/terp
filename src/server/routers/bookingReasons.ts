/**
 * Booking Reasons Router
 *
 * Provides booking reason CRUD operations via tRPC procedures.
 * Includes adjustment field validation (reference_time + offset_minutes consistency).
 *
 * Replaces the Go backend booking reason endpoints:
 * - GET /booking-reasons -> bookingReasons.list
 * - GET /booking-reasons/{id} -> bookingReasons.getById
 * - POST /booking-reasons -> bookingReasons.create
 * - PATCH /booking-reasons/{id} -> bookingReasons.update
 * - DELETE /booking-reasons/{id} -> bookingReasons.delete
 *
 * @see apps/api/internal/service/bookingreason.go
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as bookingReasonService from "@/lib/services/booking-reason-service"

// --- Permission Constants ---

const BOOKING_TYPES_MANAGE = permissionIdByKey("booking_types.manage")!

// --- Output Schemas ---

const bookingReasonOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  bookingTypeId: z.string().uuid(),
  code: z.string(),
  label: z.string(),
  isActive: z.boolean(),
  sortOrder: z.number(),
  referenceTime: z.string().nullable(),
  offsetMinutes: z.number().nullable(),
  adjustmentBookingTypeId: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type BookingReasonOutput = z.infer<typeof bookingReasonOutputSchema>

// --- Input Schemas ---

const createBookingReasonInputSchema = z.object({
  bookingTypeId: z.string().uuid(),
  code: z.string().min(1, "Code is required"),
  label: z.string().min(1, "Label is required"),
  sortOrder: z.number().optional(),
  referenceTime: z.string().optional(),
  offsetMinutes: z.number().optional(),
  adjustmentBookingTypeId: z.string().uuid().optional(),
})

const updateBookingReasonInputSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().optional(),
  referenceTime: z.string().nullable().optional(),
  offsetMinutes: z.number().nullable().optional(),
  adjustmentBookingTypeId: z.string().uuid().nullable().optional(),
  clearAdjustment: z.boolean().optional(),
})

// --- Helpers ---

/**
 * Maps a Prisma BookingReason record to the output schema shape.
 */
function mapToOutput(r: {
  id: string
  tenantId: string
  bookingTypeId: string
  code: string
  label: string
  isActive: boolean
  sortOrder: number
  referenceTime: string | null
  offsetMinutes: number | null
  adjustmentBookingTypeId: string | null
  createdAt: Date
  updatedAt: Date
}): BookingReasonOutput {
  return {
    id: r.id,
    tenantId: r.tenantId,
    bookingTypeId: r.bookingTypeId,
    code: r.code,
    label: r.label,
    isActive: r.isActive,
    sortOrder: r.sortOrder,
    referenceTime: r.referenceTime,
    offsetMinutes: r.offsetMinutes,
    adjustmentBookingTypeId: r.adjustmentBookingTypeId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

// --- Router ---

export const bookingReasonsRouter = createTRPCRouter({
  /**
   * bookingReasons.list -- Returns booking reasons for the current tenant.
   *
   * Supports optional filter: bookingTypeId.
   * Orders by sortOrder ASC, code ASC.
   *
   * Requires: booking_types.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(BOOKING_TYPES_MANAGE))
    .input(
      z
        .object({
          bookingTypeId: z.string().uuid().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(bookingReasonOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const reasons = await bookingReasonService.list(
          ctx.prisma,
          tenantId,
          input ?? undefined
        )
        return {
          data: reasons.map(mapToOutput),
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * bookingReasons.getById -- Returns a single booking reason by ID.
   *
   * Tenant-scoped: only returns reasons belonging to the current tenant.
   *
   * Requires: booking_types.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(BOOKING_TYPES_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(bookingReasonOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const reason = await bookingReasonService.getById(
          ctx.prisma,
          tenantId,
          input.id
        )
        return mapToOutput(reason)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * bookingReasons.create -- Creates a new booking reason.
   *
   * Validates code, label, bookingTypeId.
   * Checks code uniqueness within (tenantId, bookingTypeId).
   * Validates adjustment field consistency.
   * Always sets isActive to true.
   *
   * Requires: booking_types.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(BOOKING_TYPES_MANAGE))
    .input(createBookingReasonInputSchema)
    .output(bookingReasonOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const reason = await bookingReasonService.create(
          ctx.prisma,
          tenantId,
          input
        )
        return mapToOutput(reason)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * bookingReasons.update -- Updates an existing booking reason.
   *
   * Supports partial updates: label, isActive, sortOrder,
   * referenceTime (nullable), offsetMinutes (nullable),
   * adjustmentBookingTypeId (nullable).
   * clearAdjustment flag clears all three adjustment fields.
   * Re-validates adjustment consistency after building update data.
   *
   * Requires: booking_types.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(BOOKING_TYPES_MANAGE))
    .input(updateBookingReasonInputSchema)
    .output(bookingReasonOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const reason = await bookingReasonService.update(
          ctx.prisma,
          tenantId,
          input
        )
        return mapToOutput(reason)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * bookingReasons.delete -- Deletes a booking reason.
   *
   * Requires: booking_types.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(BOOKING_TYPES_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        await bookingReasonService.remove(ctx.prisma, tenantId, input.id)
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
