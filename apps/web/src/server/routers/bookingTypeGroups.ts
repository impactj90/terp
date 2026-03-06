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
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const BOOKING_TYPES_MANAGE = permissionIdByKey("booking_types.manage")!

// --- Output Schemas ---

const memberOutputSchema = z.object({
  id: z.string().uuid(),
  bookingTypeId: z.string().uuid(),
  sortOrder: z.number(),
  bookingType: z.object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    direction: z.string(),
    category: z.string(),
  }),
})

const bookingTypeGroupOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
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
  bookingTypeIds: z.array(z.string().uuid()).optional(),
})

const updateBookingTypeGroupInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  bookingTypeIds: z.array(z.string().uuid()).optional(),
})

// --- Prisma include for members ---

const groupInclude = {
  members: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      bookingType: {
        select: {
          id: true,
          code: true,
          name: true,
          direction: true,
          category: true,
        },
      },
    },
  },
} as const

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
      const tenantId = ctx.tenantId!
      const where: Record<string, unknown> = { tenantId }

      if (input?.isActive !== undefined) {
        where.isActive = input.isActive
      }

      const groups = await ctx.prisma.bookingTypeGroup.findMany({
        where,
        orderBy: { code: "asc" },
        include: groupInclude,
      })

      return {
        data: (groups as unknown as PrismaGroupWithMembers[]).map(mapToOutput),
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
    .input(z.object({ id: z.string().uuid() }))
    .output(bookingTypeGroupOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const group = await ctx.prisma.bookingTypeGroup.findFirst({
        where: { id: input.id, tenantId },
        include: groupInclude,
      })

      if (!group) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Booking type group not found",
        })
      }

      return mapToOutput(group as unknown as PrismaGroupWithMembers)
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
      const tenantId = ctx.tenantId!

      // Trim and validate code
      const code = input.code.trim()
      if (code.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Booking type group code is required",
        })
      }

      // Trim and validate name
      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Booking type group name is required",
        })
      }

      // Check code uniqueness within tenant
      const existingByCode = await ctx.prisma.bookingTypeGroup.findFirst({
        where: { tenantId, code },
      })
      if (existingByCode) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Booking type group code already exists",
        })
      }

      // Trim description if provided
      const description = input.description?.trim() || null

      // Create group
      const created = await ctx.prisma.bookingTypeGroup.create({
        data: {
          tenantId,
          code,
          name,
          description,
          isActive: true,
        },
      })

      // Create members if bookingTypeIds provided
      if (input.bookingTypeIds && input.bookingTypeIds.length > 0) {
        await ctx.prisma.bookingTypeGroupMember.createMany({
          data: input.bookingTypeIds.map((btId, idx) => ({
            groupId: created.id,
            bookingTypeId: btId,
            sortOrder: idx,
          })),
        })
      }

      // Re-fetch with includes for response
      const group = await ctx.prisma.bookingTypeGroup.findUniqueOrThrow({
        where: { id: created.id },
        include: groupInclude,
      })

      return mapToOutput(group as unknown as PrismaGroupWithMembers)
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
      const tenantId = ctx.tenantId!

      // Verify group exists (tenant-scoped)
      const existing = await ctx.prisma.bookingTypeGroup.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Booking type group not found",
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
            message: "Booking type group name is required",
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

      // Update group fields
      if (Object.keys(data).length > 0) {
        await ctx.prisma.bookingTypeGroup.update({
          where: { id: input.id },
          data,
        })
      }

      // Replace members if bookingTypeIds is provided (not undefined)
      if (input.bookingTypeIds !== undefined) {
        // Delete all existing members
        await ctx.prisma.bookingTypeGroupMember.deleteMany({
          where: { groupId: input.id },
        })
        // Create new members
        if (input.bookingTypeIds.length > 0) {
          await ctx.prisma.bookingTypeGroupMember.createMany({
            data: input.bookingTypeIds.map((btId, idx) => ({
              groupId: input.id,
              bookingTypeId: btId,
              sortOrder: idx,
            })),
          })
        }
      }

      // Re-fetch with includes for response
      const group = await ctx.prisma.bookingTypeGroup.findUniqueOrThrow({
        where: { id: input.id },
        include: groupInclude,
      })

      return mapToOutput(group as unknown as PrismaGroupWithMembers)
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
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify group exists (tenant-scoped)
      const existing = await ctx.prisma.bookingTypeGroup.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Booking type group not found",
        })
      }

      // Hard delete (members cascade via FK)
      await ctx.prisma.bookingTypeGroup.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
