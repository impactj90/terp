/**
 * Booking Type Groups Router
 *
 * Provides booking type group CRUD operations via tRPC procedures.
 * Includes member management via the booking_type_group_members join table.
 * Members are included in every response with their BookingType relation data.
 *
 * Replaces the Go backend booking type group endpoints:
 * - GET /booking-type-groups -> bookingTypeGroups.list
 * - GET /booking-type-groups/{id} -> bookingTypeGroups.getById
 * - POST /booking-type-groups -> bookingTypeGroups.create
 * - PATCH /booking-type-groups/{id} -> bookingTypeGroups.update
 * - DELETE /booking-type-groups/{id} -> bookingTypeGroups.delete
 *
 * @see apps/api/internal/service/bookingtypegroup.go
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as bookingTypeGroupService from "@/lib/services/booking-type-group-service"

// --- Permission Constants ---

const BOOKING_TYPES_MANAGE = permissionIdByKey("booking_types.manage")!

// --- Output Schemas ---

const memberOutputSchema = z.object({
  id: z.string(),
  bookingTypeId: z.string(),
  sortOrder: z.number(),
  bookingType: z.object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    direction: z.string(),
    category: z.string(),
  }),
})

const bookingTypeGroupOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  members: z.array(memberOutputSchema),
})

type BookingTypeGroupOutput = z.infer<typeof bookingTypeGroupOutputSchema>

// --- Input Schemas ---

const createBookingTypeGroupInputSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  bookingTypeIds: z.array(z.string()).optional(),
})

const updateBookingTypeGroupInputSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  bookingTypeIds: z.array(z.string()).optional(),
})

// --- Types for Prisma results with includes ---

type PrismaGroupWithMembers = {
  id: string
  tenantId: string
  code: string
  name: string
  description: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  members: Array<{
    id: string
    bookingTypeId: string
    sortOrder: number
    bookingType: {
      id: string
      code: string
      name: string
      direction: string
      category: string
    }
  }>
}

// --- Helpers ---

/**
 * Maps a Prisma BookingTypeGroup record (with members include) to the output schema shape.
 */
function mapToOutput(g: PrismaGroupWithMembers): BookingTypeGroupOutput {
  return {
    id: g.id,
    tenantId: g.tenantId,
    code: g.code,
    name: g.name,
    description: g.description,
    isActive: g.isActive,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
    members: g.members.map((m) => ({
      id: m.id,
      bookingTypeId: m.bookingTypeId,
      sortOrder: m.sortOrder,
      bookingType: m.bookingType,
    })),
  }
}

// --- Router ---

export const bookingTypeGroupsRouter = createTRPCRouter({
  /**
   * bookingTypeGroups.list -- Returns booking type groups for the current tenant.
   *
   * Includes members with booking type relation data.
   * Orders by code ASC.
   *
   * Requires: booking_types.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(BOOKING_TYPES_MANAGE))
    .input(
      z
        .object({
          isActive: z.boolean().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(bookingTypeGroupOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const groups = await bookingTypeGroupService.list(
          ctx.prisma,
          tenantId,
          input ?? undefined
        )
        return {
          data: (groups as unknown as PrismaGroupWithMembers[]).map(
            mapToOutput
          ),
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * bookingTypeGroups.getById -- Returns a single booking type group by ID.
   *
   * Includes members with booking type relation data.
   * Tenant-scoped.
   *
   * Requires: booking_types.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(BOOKING_TYPES_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(bookingTypeGroupOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const group = await bookingTypeGroupService.getById(
          ctx.prisma,
          tenantId,
          input.id
        )
        return mapToOutput(group as unknown as PrismaGroupWithMembers)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * bookingTypeGroups.create -- Creates a new booking type group.
   *
   * Validates code and name are non-empty after trimming.
   * Checks code uniqueness within tenant.
   * Optionally creates members from bookingTypeIds array.
   * Re-fetches with includes for response.
   *
   * Requires: booking_types.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(BOOKING_TYPES_MANAGE))
    .input(createBookingTypeGroupInputSchema)
    .output(bookingTypeGroupOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const group = await bookingTypeGroupService.create(
          ctx.prisma,
          tenantId,
          input
        )
        return mapToOutput(group as unknown as PrismaGroupWithMembers)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * bookingTypeGroups.update -- Updates an existing booking type group.
   *
   * Supports partial updates: name, description (nullable), isActive.
   * If bookingTypeIds is provided (not undefined), replaces all members.
   * If bookingTypeIds is undefined, members are unchanged.
   * Re-fetches with includes for response.
   *
   * Requires: booking_types.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(BOOKING_TYPES_MANAGE))
    .input(updateBookingTypeGroupInputSchema)
    .output(bookingTypeGroupOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const group = await bookingTypeGroupService.update(
          ctx.prisma,
          tenantId,
          input
        )
        return mapToOutput(group as unknown as PrismaGroupWithMembers)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * bookingTypeGroups.delete -- Deletes a booking type group.
   *
   * Members cascade-delete per FK.
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
        await bookingTypeGroupService.remove(ctx.prisma, tenantId, input.id)
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
