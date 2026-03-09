/**
 * Access Zones Router
 *
 * Provides access zone CRUD operations via tRPC procedures.
 *
 * Replaces the Go backend access zone endpoints:
 * - GET /access-zones -> accessZones.list
 * - GET /access-zones/{id} -> accessZones.getById
 * - POST /access-zones -> accessZones.create
 * - PATCH /access-zones/{id} -> accessZones.update
 * - DELETE /access-zones/{id} -> accessZones.delete
 *
 * @see apps/api/internal/service/access_zone.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const ACCESS_CONTROL_MANAGE = permissionIdByKey("access_control.manage")!

// --- Output Schemas ---

const accessZoneOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

// --- Input Schemas ---

const createAccessZoneInputSchema = z.object({
  code: z.string().min(1, "Code is required").max(50),
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  sortOrder: z.number().int().optional(),
})

const updateAccessZoneInputSchema = z.object({
  id: z.string().uuid(),
  // Code is NOT updatable (immutable after creation)
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

// --- Router ---

export const accessZonesRouter = createTRPCRouter({
  /**
   * accessZones.list -- Returns all access zones for the current tenant.
   *
   * Orders by sortOrder ASC, code ASC.
   *
   * Requires: access_control.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(ACCESS_CONTROL_MANAGE))
    .input(z.void().optional())
    .output(z.object({ data: z.array(accessZoneOutputSchema) }))
    .query(async ({ ctx }) => {
      const tenantId = ctx.tenantId!

      const zones = await ctx.prisma.accessZone.findMany({
        where: { tenantId },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      })

      return {
        data: zones.map((z) => ({
          id: z.id,
          tenantId: z.tenantId,
          code: z.code,
          name: z.name,
          description: z.description,
          isActive: z.isActive,
          sortOrder: z.sortOrder,
          createdAt: z.createdAt,
          updatedAt: z.updatedAt,
        })),
      }
    }),

  /**
   * accessZones.getById -- Returns a single access zone by ID.
   *
   * Requires: access_control.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(ACCESS_CONTROL_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(accessZoneOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const zone = await ctx.prisma.accessZone.findFirst({
        where: { id: input.id, tenantId },
      })

      if (!zone) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Access zone not found",
        })
      }

      return {
        id: zone.id,
        tenantId: zone.tenantId,
        code: zone.code,
        name: zone.name,
        description: zone.description,
        isActive: zone.isActive,
        sortOrder: zone.sortOrder,
        createdAt: zone.createdAt,
        updatedAt: zone.updatedAt,
      }
    }),

  /**
   * accessZones.create -- Creates a new access zone.
   *
   * Validates code/name non-empty, code uniqueness per tenant.
   *
   * Requires: access_control.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(ACCESS_CONTROL_MANAGE))
    .input(createAccessZoneInputSchema)
    .output(accessZoneOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Trim and validate code
      const code = input.code.trim()
      if (code.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Access zone code is required",
        })
      }

      // Trim and validate name
      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Access zone name is required",
        })
      }

      // Check code uniqueness within tenant
      const existingByCode = await ctx.prisma.accessZone.findFirst({
        where: { tenantId, code },
      })
      if (existingByCode) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Access zone code already exists",
        })
      }

      const zone = await ctx.prisma.accessZone.create({
        data: {
          tenantId,
          code,
          name,
          description: input.description?.trim() || null,
          isActive: true,
          sortOrder: input.sortOrder ?? 0,
        },
      })

      return {
        id: zone.id,
        tenantId: zone.tenantId,
        code: zone.code,
        name: zone.name,
        description: zone.description,
        isActive: zone.isActive,
        sortOrder: zone.sortOrder,
        createdAt: zone.createdAt,
        updatedAt: zone.updatedAt,
      }
    }),

  /**
   * accessZones.update -- Updates an existing access zone.
   *
   * Supports partial updates. Code is NOT updatable.
   *
   * Requires: access_control.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(ACCESS_CONTROL_MANAGE))
    .input(updateAccessZoneInputSchema)
    .output(accessZoneOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify zone exists (tenant-scoped)
      const existing = await ctx.prisma.accessZone.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Access zone not found",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = {}

      if (input.name !== undefined) {
        const name = input.name.trim()
        if (name.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Access zone name is required",
          })
        }
        data.name = name
      }

      if (input.description !== undefined) {
        data.description =
          input.description === null ? null : input.description.trim()
      }

      if (input.isActive !== undefined) {
        data.isActive = input.isActive
      }

      if (input.sortOrder !== undefined) {
        data.sortOrder = input.sortOrder
      }

      const zone = await ctx.prisma.accessZone.update({
        where: { id: input.id },
        data,
      })

      return {
        id: zone.id,
        tenantId: zone.tenantId,
        code: zone.code,
        name: zone.name,
        description: zone.description,
        isActive: zone.isActive,
        sortOrder: zone.sortOrder,
        createdAt: zone.createdAt,
        updatedAt: zone.updatedAt,
      }
    }),

  /**
   * accessZones.delete -- Deletes an access zone.
   *
   * No in-use check (unlike access profiles).
   *
   * Requires: access_control.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(ACCESS_CONTROL_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify zone exists (tenant-scoped)
      const existing = await ctx.prisma.accessZone.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Access zone not found",
        })
      }

      // Hard delete
      await ctx.prisma.accessZone.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
