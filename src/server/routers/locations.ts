/**
 * Locations Router
 *
 * Provides location CRUD operations via tRPC procedures.
 * Replaces the Go backend location endpoints:
 * - GET /locations -> locations.list
 * - GET /locations/{id} -> locations.getById
 * - POST /locations -> locations.create
 * - PATCH /locations/{id} -> locations.update
 * - DELETE /locations/{id} -> locations.delete
 *
 * @see apps/api/internal/service/location.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const LOCATIONS_MANAGE = permissionIdByKey("locations.manage")!

// --- Output Schemas ---

const locationOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  address: z.string(),
  city: z.string(),
  country: z.string(),
  timezone: z.string(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type LocationOutput = z.infer<typeof locationOutputSchema>

// --- Input Schemas ---

const createLocationInputSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  timezone: z.string().optional(),
})

const updateLocationInputSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  timezone: z.string().optional(),
  isActive: z.boolean().optional(),
})

// --- Helpers ---

/**
 * Maps a Prisma Location record to the output schema shape.
 */
function mapLocationToOutput(loc: {
  id: string
  tenantId: string
  code: string
  name: string
  description: string
  address: string
  city: string
  country: string
  timezone: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}): LocationOutput {
  return {
    id: loc.id,
    tenantId: loc.tenantId,
    code: loc.code,
    name: loc.name,
    description: loc.description,
    address: loc.address,
    city: loc.city,
    country: loc.country,
    timezone: loc.timezone,
    isActive: loc.isActive,
    createdAt: loc.createdAt,
    updatedAt: loc.updatedAt,
  }
}

// --- Router ---

export const locationsRouter = createTRPCRouter({
  /**
   * locations.list -- Returns locations for the current tenant.
   *
   * Supports optional filter: isActive.
   * Orders by code ASC.
   *
   * Requires: locations.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(LOCATIONS_MANAGE))
    .input(
      z
        .object({
          isActive: z.boolean().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(locationOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const where: Record<string, unknown> = { tenantId }

      if (input?.isActive !== undefined) {
        where.isActive = input.isActive
      }

      const locations = await ctx.prisma.location.findMany({
        where,
        orderBy: { code: "asc" },
      })

      return {
        data: locations.map(mapLocationToOutput),
      }
    }),

  /**
   * locations.getById -- Returns a single location by ID.
   *
   * Tenant-scoped: only returns locations belonging to the current tenant.
   *
   * Requires: locations.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(LOCATIONS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(locationOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const location = await ctx.prisma.location.findFirst({
        where: { id: input.id, tenantId },
      })

      if (!location) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Location not found",
        })
      }

      return mapLocationToOutput(location)
    }),

  /**
   * locations.create -- Creates a new location.
   *
   * Validates code and name are non-empty after trimming.
   * Checks code uniqueness within tenant via unique constraint.
   *
   * Requires: locations.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(LOCATIONS_MANAGE))
    .input(createLocationInputSchema)
    .output(locationOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Trim and validate code
      const code = input.code.trim()
      if (code.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Location code is required",
        })
      }

      // Trim and validate name
      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Location name is required",
        })
      }

      // Check code uniqueness within tenant
      const existingByCode = await ctx.prisma.location.findFirst({
        where: { tenantId, code },
      })
      if (existingByCode) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Location code already exists",
        })
      }

      // Create location with defaults for address fields
      const location = await ctx.prisma.location.create({
        data: {
          tenantId,
          code,
          name,
          description: input.description?.trim() ?? "",
          address: input.address?.trim() ?? "",
          city: input.city?.trim() ?? "",
          country: input.country?.trim() ?? "",
          timezone: input.timezone?.trim() ?? "",
          isActive: true,
        },
      })

      return mapLocationToOutput(location)
    }),

  /**
   * locations.update -- Updates an existing location.
   *
   * Supports partial updates. Validates code uniqueness when changed.
   *
   * Requires: locations.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(LOCATIONS_MANAGE))
    .input(updateLocationInputSchema)
    .output(locationOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify location exists (tenant-scoped)
      const existing = await ctx.prisma.location.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Location not found",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = {}

      // Handle code update
      if (input.code !== undefined) {
        const code = input.code.trim()
        if (code.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Location code is required",
          })
        }
        // Check uniqueness if changed
        if (code !== existing.code) {
          const existingByCode = await ctx.prisma.location.findFirst({
            where: {
              tenantId,
              code,
              NOT: { id: input.id },
            },
          })
          if (existingByCode) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Location code already exists",
            })
          }
        }
        data.code = code
      }

      // Handle name update
      if (input.name !== undefined) {
        const name = input.name.trim()
        if (name.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Location name is required",
          })
        }
        data.name = name
      }

      // Handle address field updates
      if (input.description !== undefined) {
        data.description = input.description.trim()
      }
      if (input.address !== undefined) {
        data.address = input.address.trim()
      }
      if (input.city !== undefined) {
        data.city = input.city.trim()
      }
      if (input.country !== undefined) {
        data.country = input.country.trim()
      }
      if (input.timezone !== undefined) {
        data.timezone = input.timezone.trim()
      }

      // Handle isActive update
      if (input.isActive !== undefined) {
        data.isActive = input.isActive
      }

      const location = await ctx.prisma.location.update({
        where: { id: input.id },
        data,
      })

      return mapLocationToOutput(location)
    }),

  /**
   * locations.delete -- Deletes a location.
   *
   * Requires: locations.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(LOCATIONS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify location exists (tenant-scoped)
      const existing = await ctx.prisma.location.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Location not found",
        })
      }

      // Hard delete
      await ctx.prisma.location.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
