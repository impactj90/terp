/**
 * Booking Types Router
 *
 * Provides booking type CRUD operations via tRPC procedures.
 * Includes system types (NULL tenant) in list queries.
 * Prevents modification/deletion of system types.
 *
 * Replaces the Go backend booking type endpoints:
 * - GET /booking-types -> bookingTypes.list
 * - GET /booking-types/{id} -> bookingTypes.getById
 * - POST /booking-types -> bookingTypes.create
 * - PATCH /booking-types/{id} -> bookingTypes.update
 * - DELETE /booking-types/{id} -> bookingTypes.delete
 *
 * @see apps/api/internal/service/bookingtype.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const BOOKING_TYPES_MANAGE = permissionIdByKey("booking_types.manage")!

// --- Constants ---

const VALID_DIRECTIONS = ["in", "out"] as const
const VALID_CATEGORIES = ["work", "break", "business_trip", "other"] as const

// --- Output Schemas ---

const bookingTypeOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  direction: z.string(),
  category: z.string(),
  accountId: z.string().uuid().nullable(),
  requiresReason: z.boolean(),
  isSystem: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type BookingTypeOutput = z.infer<typeof bookingTypeOutputSchema>

// --- Input Schemas ---

const createBookingTypeInputSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  direction: z.string().min(1, "Direction is required"),
  category: z.string().optional(),
  accountId: z.string().uuid().optional(),
  requiresReason: z.boolean().optional(),
})

const updateBookingTypeInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  category: z.string().optional(),
  accountId: z.string().uuid().nullable().optional(),
  requiresReason: z.boolean().optional(),
})

// --- Helpers ---

/**
 * Maps a Prisma BookingType record to the output schema shape.
 */
function mapToOutput(bt: {
  id: string
  tenantId: string | null
  code: string
  name: string
  description: string | null
  direction: string
  category: string
  accountId: string | null
  requiresReason: boolean
  isSystem: boolean
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}): BookingTypeOutput {
  return {
    id: bt.id,
    tenantId: bt.tenantId,
    code: bt.code,
    name: bt.name,
    description: bt.description,
    direction: bt.direction,
    category: bt.category,
    accountId: bt.accountId,
    requiresReason: bt.requiresReason,
    isSystem: bt.isSystem,
    isActive: bt.isActive,
    createdAt: bt.createdAt,
    updatedAt: bt.updatedAt,
  }
}

// --- Router ---

export const bookingTypesRouter = createTRPCRouter({
  /**
   * bookingTypes.list -- Returns booking types for the current tenant.
   *
   * Includes system types (tenantId: null) alongside tenant-specific types.
   * Supports optional filters: isActive, direction.
   * Orders by isSystem DESC, code ASC (system types first).
   *
   * Requires: booking_types.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(BOOKING_TYPES_MANAGE))
    .input(
      z
        .object({
          isActive: z.boolean().optional(),
          direction: z.string().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(bookingTypeOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const where: Record<string, unknown> = {
        OR: [{ tenantId }, { tenantId: null }],
      }

      if (input?.isActive !== undefined) {
        where.isActive = input.isActive
      }
      if (input?.direction !== undefined) {
        where.direction = input.direction
      }

      const types = await ctx.prisma.bookingType.findMany({
        where,
        orderBy: [{ isSystem: "desc" }, { code: "asc" }],
      })

      return {
        data: types.map(mapToOutput),
      }
    }),

  /**
   * bookingTypes.getById -- Returns a single booking type by ID.
   *
   * Allows fetching system types (tenantId: null) in addition to tenant types.
   *
   * Requires: booking_types.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(BOOKING_TYPES_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(bookingTypeOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const bt = await ctx.prisma.bookingType.findFirst({
        where: {
          id: input.id,
          OR: [{ tenantId }, { tenantId: null }],
        },
      })

      if (!bt) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Booking type not found",
        })
      }

      return mapToOutput(bt)
    }),

  /**
   * bookingTypes.create -- Creates a new booking type.
   *
   * Validates code, name, direction. Category defaults to "work".
   * Checks code uniqueness within tenant (not system types).
   * Always sets isSystem: false, isActive: true.
   *
   * Requires: booking_types.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(BOOKING_TYPES_MANAGE))
    .input(createBookingTypeInputSchema)
    .output(bookingTypeOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Trim and validate code
      const code = input.code.trim()
      if (code.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Booking type code is required",
        })
      }

      // Trim and validate name
      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Booking type name is required",
        })
      }

      // Validate direction
      const direction = input.direction.trim()
      if (!VALID_DIRECTIONS.includes(direction as (typeof VALID_DIRECTIONS)[number])) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Direction must be one of: ${VALID_DIRECTIONS.join(", ")}`,
        })
      }

      // Validate category
      const category = input.category?.trim() || "work"
      if (!VALID_CATEGORIES.includes(category as (typeof VALID_CATEGORIES)[number])) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Category must be one of: ${VALID_CATEGORIES.join(", ")}`,
        })
      }

      // Check code uniqueness within tenant (not system types)
      const existingByCode = await ctx.prisma.bookingType.findFirst({
        where: { tenantId, code },
      })
      if (existingByCode) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Booking type code already exists",
        })
      }

      // Trim description if provided
      const description = input.description?.trim() || null

      // Create booking type -- always isSystem: false, isActive: true
      const bt = await ctx.prisma.bookingType.create({
        data: {
          tenantId,
          code,
          name,
          description,
          direction,
          category,
          accountId: input.accountId || undefined,
          requiresReason: input.requiresReason ?? false,
          isSystem: false,
          isActive: true,
        },
      })

      return mapToOutput(bt)
    }),

  /**
   * bookingTypes.update -- Updates an existing booking type.
   *
   * Blocks modification of system types.
   * Supports partial updates: name, description, isActive, category,
   * accountId (nullable), requiresReason.
   * No code or direction update per Go behavior.
   *
   * Requires: booking_types.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(BOOKING_TYPES_MANAGE))
    .input(updateBookingTypeInputSchema)
    .output(bookingTypeOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify booking type exists
      const existing = await ctx.prisma.bookingType.findFirst({
        where: {
          id: input.id,
          OR: [{ tenantId }, { tenantId: null }],
        },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Booking type not found",
        })
      }

      // Block modification of system types
      if (existing.isSystem) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot modify system booking types",
        })
      }

      // Verify tenant ownership
      if (existing.tenantId !== tenantId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Booking type not found",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = {}

      // Handle name update
      if (input.name !== undefined) {
        const name = input.name.trim()
        if (name.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Booking type name is required",
          })
        }
        data.name = name
      }

      // Handle description update
      if (input.description !== undefined) {
        data.description =
          input.description === null ? null : input.description.trim()
      }

      // Handle isActive update
      if (input.isActive !== undefined) {
        data.isActive = input.isActive
      }

      // Handle category update
      if (input.category !== undefined) {
        if (!VALID_CATEGORIES.includes(input.category as (typeof VALID_CATEGORIES)[number])) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Category must be one of: ${VALID_CATEGORIES.join(", ")}`,
          })
        }
        data.category = input.category
      }

      // Handle accountId update (nullable -- null clears it)
      if (input.accountId !== undefined) {
        data.accountId = input.accountId
      }

      // Handle requiresReason update
      if (input.requiresReason !== undefined) {
        data.requiresReason = input.requiresReason
      }

      const bt = await ctx.prisma.bookingType.update({
        where: { id: input.id },
        data,
      })

      return mapToOutput(bt)
    }),

  /**
   * bookingTypes.delete -- Deletes a booking type.
   *
   * Blocks deletion of system types.
   * Checks usage in bookings table before deletion (via raw SQL).
   *
   * Requires: booking_types.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(BOOKING_TYPES_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify booking type exists
      const existing = await ctx.prisma.bookingType.findFirst({
        where: {
          id: input.id,
          OR: [{ tenantId }, { tenantId: null }],
        },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Booking type not found",
        })
      }

      // Block deletion of system types
      if (existing.isSystem) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete system booking types",
        })
      }

      // Verify tenant ownership
      if (existing.tenantId !== tenantId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Booking type not found",
        })
      }

      // Check usage in bookings table
      const bookingCount = await ctx.prisma.booking.count({
        where: { bookingTypeId: input.id },
      })
      if (bookingCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete booking type that is in use",
        })
      }

      // Hard delete
      await ctx.prisma.bookingType.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
