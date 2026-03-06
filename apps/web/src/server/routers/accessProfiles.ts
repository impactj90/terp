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
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

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
      const tenantId = ctx.tenantId!

      const profiles = await ctx.prisma.accessProfile.findMany({
        where: { tenantId },
        orderBy: { code: "asc" },
      })

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
      const tenantId = ctx.tenantId!

      const profile = await ctx.prisma.accessProfile.findFirst({
        where: { id: input.id, tenantId },
      })

      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Access profile not found",
        })
      }

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
      const tenantId = ctx.tenantId!

      // Trim and validate code
      const code = input.code.trim()
      if (code.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Access profile code is required",
        })
      }

      // Trim and validate name
      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Access profile name is required",
        })
      }

      // Check code uniqueness within tenant
      const existingByCode = await ctx.prisma.accessProfile.findFirst({
        where: { tenantId, code },
      })
      if (existingByCode) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Access profile code already exists",
        })
      }

      const profile = await ctx.prisma.accessProfile.create({
        data: {
          tenantId,
          code,
          name,
          description: input.description?.trim() || null,
          isActive: true,
        },
      })

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
      const tenantId = ctx.tenantId!

      // Verify profile exists (tenant-scoped)
      const existing = await ctx.prisma.accessProfile.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Access profile not found",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = {}

      if (input.name !== undefined) {
        const name = input.name.trim()
        if (name.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Access profile name is required",
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

      const profile = await ctx.prisma.accessProfile.update({
        where: { id: input.id },
        data,
      })

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
      const tenantId = ctx.tenantId!

      // Verify profile exists (tenant-scoped)
      const existing = await ctx.prisma.accessProfile.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Access profile not found",
        })
      }

      // Check if profile is in use by employee assignments
      const assignmentCount =
        await ctx.prisma.employeeAccessAssignment.count({
          where: { accessProfileId: input.id },
        })
      if (assignmentCount > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Access profile is in use by employee assignments and cannot be deleted",
        })
      }

      // Hard delete
      await ctx.prisma.accessProfile.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
