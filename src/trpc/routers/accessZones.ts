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
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as accessZoneService from "@/lib/services/access-zone-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---

const ACCESS_CONTROL_MANAGE = permissionIdByKey("access_control.manage")!

// --- Output Schemas ---

const accessZoneOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
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
  id: z.string(),
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
      try {
        const tenantId = ctx.tenantId!
        const zones = await accessZoneService.list(
          ctx.prisma as unknown as PrismaClient,
          tenantId
        )
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
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * accessZones.getById -- Returns a single access zone by ID.
   *
   * Requires: access_control.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(ACCESS_CONTROL_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(accessZoneOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const zone = await accessZoneService.getById(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input.id
        )
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
      } catch (err) {
        handleServiceError(err)
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
      try {
        const tenantId = ctx.tenantId!
        const zone = await accessZoneService.create(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input
        )
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
      } catch (err) {
        handleServiceError(err)
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
      try {
        const tenantId = ctx.tenantId!
        const zone = await accessZoneService.update(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input
        )
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
      } catch (err) {
        handleServiceError(err)
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
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        await accessZoneService.remove(
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
