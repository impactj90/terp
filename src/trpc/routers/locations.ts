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
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as locationService from "@/lib/services/location-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---

const LOCATIONS_MANAGE = permissionIdByKey("locations.manage")!

// --- Output Schemas ---

const locationOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
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
  id: z.string(),
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
      try {
        const tenantId = ctx.tenantId!
        const locations = await locationService.list(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input
        )
        return {
          data: locations.map(mapLocationToOutput),
        }
      } catch (err) {
        handleServiceError(err)
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
    .input(z.object({ id: z.string() }))
    .output(locationOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const location = await locationService.getById(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input.id
        )
        return mapLocationToOutput(location)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const tenantId = ctx.tenantId!
        const location = await locationService.create(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input
        )
        return mapLocationToOutput(location)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const tenantId = ctx.tenantId!
        const location = await locationService.update(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input
        )
        return mapLocationToOutput(location)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * locations.delete -- Deletes a location.
   *
   * Requires: locations.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(LOCATIONS_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        await locationService.remove(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input.id
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
