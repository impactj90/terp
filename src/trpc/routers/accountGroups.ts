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
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as accountGroupService from "@/lib/services/account-group-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---

const ACCOUNTS_MANAGE = permissionIdByKey("accounts.manage")!

// --- Output Schemas ---

const accountGroupOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type AccountGroupOutput = z.infer<typeof accountGroupOutputSchema>

// --- Input Schemas ---

const createAccountGroupInputSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

const updateAccountGroupInputSchema = z.object({
  id: z.string(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
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
  isActive: boolean
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}): AccountGroupOutput {
  return {
    id: ag.id,
    tenantId: ag.tenantId,
    code: ag.code,
    name: ag.name,
    description: ag.description,
    isActive: ag.isActive,
    sortOrder: ag.sortOrder,
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
   * Orders by code ASC.
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
      try {
        const groups = await accountGroupService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
        return {
          data: groups.map(mapAccountGroupToOutput),
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * accountGroups.getById -- Returns a single account group by ID.
   *
   * Tenant-scoped: only returns groups belonging to the current tenant.
   *
   * Requires: accounts.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(ACCOUNTS_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(accountGroupOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const group = await accountGroupService.getById(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
        return mapAccountGroupToOutput(group)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const group = await accountGroupService.create(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
        return mapAccountGroupToOutput(group)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const group = await accountGroupService.update(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
        return mapAccountGroupToOutput(group)
      } catch (err) {
        handleServiceError(err)
      }
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
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await accountGroupService.remove(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
