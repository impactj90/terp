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
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const BOOKING_TYPES_MANAGE = permissionIdByKey("booking_types.manage")!

// --- Constants ---

const VALID_REFERENCE_TIMES = ["plan_start", "plan_end", "booking_time"] as const

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

/**
 * Validates that reference_time and offset_minutes are consistently set.
 * Both must be set or both must be null.
 */
function validateAdjustmentFields(
  referenceTime: string | null | undefined,
  offsetMinutes: number | null | undefined
): void {
  const hasRef = referenceTime !== null && referenceTime !== undefined
  const hasOffset = offsetMinutes !== null && offsetMinutes !== undefined
  if (hasRef !== hasOffset) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "reference_time and offset_minutes must both be set or both be null",
    })
  }
  if (hasRef) {
    if (
      !VALID_REFERENCE_TIMES.includes(
        referenceTime as (typeof VALID_REFERENCE_TIMES)[number]
      )
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `reference_time must be one of: ${VALID_REFERENCE_TIMES.join(", ")}`,
      })
    }
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
      const tenantId = ctx.tenantId!
      const where: Record<string, unknown> = { tenantId }

      if (input?.bookingTypeId !== undefined) {
        where.bookingTypeId = input.bookingTypeId
      }

      const reasons = await ctx.prisma.bookingReason.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      })

      return {
        data: reasons.map(mapToOutput),
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
      const tenantId = ctx.tenantId!
      const reason = await ctx.prisma.bookingReason.findFirst({
        where: { id: input.id, tenantId },
      })

      if (!reason) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Booking reason not found",
        })
      }

      return mapToOutput(reason)
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
      const tenantId = ctx.tenantId!

      // Trim and validate code
      const code = input.code.trim()
      if (code.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Booking reason code is required",
        })
      }

      // Trim and validate label
      const label = input.label.trim()
      if (label.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Booking reason label is required",
        })
      }

      // Validate adjustment fields consistency
      validateAdjustmentFields(
        input.referenceTime ?? null,
        input.offsetMinutes ?? null
      )

      // Check code uniqueness within (tenantId, bookingTypeId)
      const existingByCode = await ctx.prisma.bookingReason.findFirst({
        where: { tenantId, bookingTypeId: input.bookingTypeId, code },
      })
      if (existingByCode) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Booking reason code already exists for this booking type",
        })
      }

      // Create booking reason -- always isActive: true
      const reason = await ctx.prisma.bookingReason.create({
        data: {
          tenantId,
          bookingTypeId: input.bookingTypeId,
          code,
          label,
          isActive: true,
          sortOrder: input.sortOrder ?? 0,
          referenceTime: input.referenceTime || null,
          offsetMinutes: input.offsetMinutes ?? null,
          adjustmentBookingTypeId: input.adjustmentBookingTypeId || null,
        },
      })

      return mapToOutput(reason)
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
      const tenantId = ctx.tenantId!

      // Verify reason exists (tenant-scoped)
      const existing = await ctx.prisma.bookingReason.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Booking reason not found",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = {}

      // Handle label update
      if (input.label !== undefined) {
        const label = input.label.trim()
        if (label.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Booking reason label is required",
          })
        }
        data.label = label
      }

      // Handle isActive update
      if (input.isActive !== undefined) {
        data.isActive = input.isActive
      }

      // Handle sortOrder update
      if (input.sortOrder !== undefined) {
        data.sortOrder = input.sortOrder
      }

      // Handle clearAdjustment flag -- clears all three adjustment fields
      if (input.clearAdjustment) {
        data.referenceTime = null
        data.offsetMinutes = null
        data.adjustmentBookingTypeId = null
      } else {
        // Handle individual adjustment field updates
        if (input.referenceTime !== undefined) {
          data.referenceTime = input.referenceTime
        }
        if (input.offsetMinutes !== undefined) {
          data.offsetMinutes = input.offsetMinutes
        }
        if (input.adjustmentBookingTypeId !== undefined) {
          data.adjustmentBookingTypeId = input.adjustmentBookingTypeId
        }
      }

      // Re-validate adjustment consistency after building update data
      // Merge existing values with update values to check final state
      const finalRefTime =
        "referenceTime" in data
          ? (data.referenceTime as string | null)
          : existing.referenceTime
      const finalOffset =
        "offsetMinutes" in data
          ? (data.offsetMinutes as number | null)
          : existing.offsetMinutes
      validateAdjustmentFields(finalRefTime, finalOffset)

      const reason = await ctx.prisma.bookingReason.update({
        where: { id: input.id },
        data,
      })

      return mapToOutput(reason)
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
      const tenantId = ctx.tenantId!

      // Verify reason exists (tenant-scoped)
      const existing = await ctx.prisma.bookingReason.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Booking reason not found",
        })
      }

      // Hard delete
      await ctx.prisma.bookingReason.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
