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
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as bookingTypeService from "@/lib/services/booking-type-service"

// --- Permission Constants ---

const BOOKING_TYPES_MANAGE = permissionIdByKey("booking_types.manage")!

// --- Output Schemas ---

const bookingTypeOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string().nullable(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  direction: z.string(),
  category: z.string(),
  accountId: z.string().nullable(),
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
  accountId: z.string().optional(),
  requiresReason: z.boolean().optional(),
})

const updateBookingTypeInputSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  category: z.string().optional(),
  accountId: z.string().nullable().optional(),
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
      try {
        const tenantId = ctx.tenantId!
        const types = await bookingTypeService.list(ctx.prisma, tenantId, {
          isActive: input?.isActive,
          direction: input?.direction,
        })
        return { data: types.map(mapToOutput) }
      } catch (err) {
        handleServiceError(err)
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
    .input(z.object({ id: z.string() }))
    .output(bookingTypeOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const bt = await bookingTypeService.getById(
          ctx.prisma,
          tenantId,
          input.id
        )
        return mapToOutput(bt)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const tenantId = ctx.tenantId!
        const bt = await bookingTypeService.create(ctx.prisma, tenantId, input)
        return mapToOutput(bt)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const tenantId = ctx.tenantId!
        const bt = await bookingTypeService.update(ctx.prisma, tenantId, input)
        return mapToOutput(bt)
      } catch (err) {
        handleServiceError(err)
      }
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
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        await bookingTypeService.remove(ctx.prisma, tenantId, input.id)
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
