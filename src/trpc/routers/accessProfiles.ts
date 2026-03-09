/**
 * Access Profiles Router
 *
 * Provides access profile CRUD operations via tRPC procedures.
 *
 * Replaces the Go backend access profile endpoints:
 * - GET /access-profiles -> accessProfiles.list
 * - GET /access-profiles/{id} -> accessProfiles.getById
 * - POST /access-profiles -> accessProfiles.create
 * - PATCH /access-profiles/{id} -> accessProfiles.update
 * - DELETE /access-profiles/{id} -> accessProfiles.delete
 *
 * @see apps/api/internal/service/access_profile.go
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as accessProfileService from "@/lib/services/access-profile-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---

const ACCESS_CONTROL_MANAGE = permissionIdByKey("access_control.manage")!

// --- Output Schemas ---

const accessProfileOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

// --- Input Schemas ---

const createAccessProfileInputSchema = z.object({
  code: z.string().min(1, "Code is required").max(50),
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
})

const updateAccessProfileInputSchema = z.object({
  id: z.string().uuid(),
  // Code is NOT updatable (immutable after creation)
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

// --- Router ---

export const accessProfilesRouter = createTRPCRouter({
  /**
   * accessProfiles.list -- Returns all access profiles for the current tenant.
   *
   * Orders by code ASC.
   *
   * Requires: access_control.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(ACCESS_CONTROL_MANAGE))
    .input(z.void().optional())
    .output(z.object({ data: z.array(accessProfileOutputSchema) }))
    .query(async ({ ctx }) => {
      try {
        const tenantId = ctx.tenantId!
        const profiles = await accessProfileService.list(
          ctx.prisma as unknown as PrismaClient,
          tenantId
        )
        return {
          data: profiles.map((p) => ({
            id: p.id,
            tenantId: p.tenantId,
            code: p.code,
            name: p.name,
            description: p.description,
            isActive: p.isActive,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
          })),
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * accessProfiles.getById -- Returns a single access profile by ID.
   *
   * Requires: access_control.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(ACCESS_CONTROL_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(accessProfileOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const profile = await accessProfileService.getById(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input.id
        )
        return {
          id: profile.id,
          tenantId: profile.tenantId,
          code: profile.code,
          name: profile.name,
          description: profile.description,
          isActive: profile.isActive,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * accessProfiles.create -- Creates a new access profile.
   *
   * Validates code/name non-empty, code uniqueness per tenant.
   *
   * Requires: access_control.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(ACCESS_CONTROL_MANAGE))
    .input(createAccessProfileInputSchema)
    .output(accessProfileOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const profile = await accessProfileService.create(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input
        )
        return {
          id: profile.id,
          tenantId: profile.tenantId,
          code: profile.code,
          name: profile.name,
          description: profile.description,
          isActive: profile.isActive,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * accessProfiles.update -- Updates an existing access profile.
   *
   * Supports partial updates. Code is NOT updatable.
   *
   * Requires: access_control.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(ACCESS_CONTROL_MANAGE))
    .input(updateAccessProfileInputSchema)
    .output(accessProfileOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const profile = await accessProfileService.update(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input
        )
        return {
          id: profile.id,
          tenantId: profile.tenantId,
          code: profile.code,
          name: profile.name,
          description: profile.description,
          isActive: profile.isActive,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * accessProfiles.delete -- Deletes an access profile.
   *
   * Checks if the profile is in use by employee assignments before deletion.
   *
   * Requires: access_control.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(ACCESS_CONTROL_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        await accessProfileService.remove(
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
