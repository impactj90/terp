/**
 * Account Groups Router
 *
 * Provides account group CRUD operations via tRPC procedures.
 * Replaces the Go backend account group endpoints:
 * - GET /account-groups -> accountGroups.list
 * - GET /account-groups/{id} -> accountGroups.getById
 * - POST /account-groups -> accountGroups.create
 * - PATCH /account-groups/{id} -> accountGroups.update
 * - DELETE /account-groups/{id} -> accountGroups.delete
 *
 * @see apps/api/internal/service/accountgroup.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const ACCOUNTS_MANAGE = permissionIdByKey("accounts.manage")!

// --- Output Schemas ---

const accountGroupOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type AccountGroupOutput = z.infer<typeof accountGroupOutputSchema>

// --- Input Schemas ---

const createAccountGroupInputSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
})

const updateAccountGroupInputSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
})

// --- Helpers ---

/**
 * Maps a Prisma AccountGroup record to the output schema shape.
 */
function mapAccountGroupToOutput(ag: {
  id: string
  tenantId: string
  code: string
  name: string
  description: string | null
  sortOrder: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}): AccountGroupOutput {
  return {
    id: ag.id,
    tenantId: ag.tenantId,
    code: ag.code,
    name: ag.name,
    description: ag.description,
    sortOrder: ag.sortOrder,
    isActive: ag.isActive,
    createdAt: ag.createdAt,
    updatedAt: ag.updatedAt,
  }
}

// --- Router ---

export const accountGroupsRouter = createTRPCRouter({
  /**
   * accountGroups.list -- Returns account groups for the current tenant.
   *
   * Supports optional filter: isActive.
   * Orders by sortOrder ASC, code ASC.
   *
   * Requires: accounts.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(ACCOUNTS_MANAGE))
    .input(
      z
        .object({
          isActive: z.boolean().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(accountGroupOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const where: Record<string, unknown> = { tenantId }

      if (input?.isActive !== undefined) {
        where.isActive = input.isActive
      }

      const accountGroups = await ctx.prisma.accountGroup.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      })

      return {
        data: accountGroups.map(mapAccountGroupToOutput),
      }
    }),

  /**
   * accountGroups.getById -- Returns a single account group by ID.
   *
   * Tenant-scoped: only returns account groups belonging to the current tenant.
   *
   * Requires: accounts.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(ACCOUNTS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(accountGroupOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const accountGroup = await ctx.prisma.accountGroup.findFirst({
        where: { id: input.id, tenantId },
      })

      if (!accountGroup) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account group not found",
        })
      }

      return mapAccountGroupToOutput(accountGroup)
    }),

  /**
   * accountGroups.create -- Creates a new account group.
   *
   * Validates code and name are non-empty after trimming.
   * Checks code uniqueness within tenant.
   *
   * Requires: accounts.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(ACCOUNTS_MANAGE))
    .input(createAccountGroupInputSchema)
    .output(accountGroupOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Trim and validate code
      const code = input.code.trim()
      if (code.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Account group code is required",
        })
      }

      // Trim and validate name
      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Account group name is required",
        })
      }

      // Check code uniqueness within tenant
      const existingByCode = await ctx.prisma.accountGroup.findFirst({
        where: { tenantId, code },
      })
      if (existingByCode) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Account group code already exists",
        })
      }

      // Trim description if provided
      const description = input.description?.trim() || null

      // Create account group
      const accountGroup = await ctx.prisma.accountGroup.create({
        data: {
          tenantId,
          code,
          name,
          description,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
        },
      })

      return mapAccountGroupToOutput(accountGroup)
    }),

  /**
   * accountGroups.update -- Updates an existing account group.
   *
   * Supports partial updates. Validates code/name uniqueness when changed.
   *
   * Requires: accounts.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(ACCOUNTS_MANAGE))
    .input(updateAccountGroupInputSchema)
    .output(accountGroupOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify account group exists (tenant-scoped)
      const existing = await ctx.prisma.accountGroup.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account group not found",
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
            message: "Account group code is required",
          })
        }
        // Check uniqueness if changed
        if (code !== existing.code) {
          const existingByCode = await ctx.prisma.accountGroup.findFirst({
            where: {
              tenantId,
              code,
              NOT: { id: input.id },
            },
          })
          if (existingByCode) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Account group code already exists",
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
            message: "Account group name is required",
          })
        }
        data.name = name
      }

      // Handle description update
      if (input.description !== undefined) {
        data.description =
          input.description === null ? null : input.description.trim() || null
      }

      // Handle sortOrder update
      if (input.sortOrder !== undefined) {
        data.sortOrder = input.sortOrder
      }

      // Handle isActive update
      if (input.isActive !== undefined) {
        data.isActive = input.isActive
      }

      const accountGroup = await ctx.prisma.accountGroup.update({
        where: { id: input.id },
        data,
      })

      return mapAccountGroupToOutput(accountGroup)
    }),

  /**
   * accountGroups.delete -- Deletes an account group.
   *
   * Prevents deletion when accounts are assigned to this group.
   *
   * Requires: accounts.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(ACCOUNTS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify account group exists (tenant-scoped)
      const existing = await ctx.prisma.accountGroup.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account group not found",
        })
      }

      // Check for accounts assigned to this group
      const accountCount = await ctx.prisma.account.count({
        where: { accountGroupId: input.id },
      })
      if (accountCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete account group with assigned accounts",
        })
      }

      // Hard delete
      await ctx.prisma.accountGroup.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
