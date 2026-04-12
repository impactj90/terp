/**
 * Accounts Router
 *
 * Provides account CRUD operations and usage lookup via tRPC procedures.
 * Replaces the Go backend account endpoints:
 * - GET /accounts -> accounts.list
 * - GET /accounts/{id} -> accounts.getById
 * - GET /accounts/{id}/usage -> accounts.getUsage
 * - POST /accounts -> accounts.create
 * - PATCH /accounts/{id} -> accounts.update
 * - DELETE /accounts/{id} -> accounts.delete
 *
 * @see apps/api/internal/service/account.go
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as accountService from "@/lib/services/account-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---

const ACCOUNTS_MANAGE = permissionIdByKey("accounts.manage")!

// --- Output Schemas ---

const accountOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string().nullable(),
  code: z.string(),
  name: z.string(),
  accountType: z.string(),
  unit: z.string(),
  isSystem: z.boolean(),
  isActive: z.boolean(),
  description: z.string().nullable(),
  isPayrollRelevant: z.boolean(),
  payrollCode: z.string().nullable(),
  sortOrder: z.number().int(),
  yearCarryover: z.boolean(),
  accountGroupId: z.string().nullable(),
  displayFormat: z.string(),
  bonusFactor: z.number().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type AccountOutput = z.infer<typeof accountOutputSchema>

const accountUsageOutputSchema = z.object({
  accountId: z.string(),
  usageCount: z.number().int(),
  dayPlans: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
    })
  ),
})

// --- Input Schemas ---

const createAccountInputSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  accountType: z.enum(["bonus", "day", "month"]),
  unit: z.enum(["minutes", "hours", "days"]).optional(),
  displayFormat: z.enum(["decimal", "hh_mm"]).optional(),
  bonusFactor: z.number().optional(),
  accountGroupId: z.string().optional(),
  description: z.string().optional(),
  isPayrollRelevant: z.boolean().optional(),
  payrollCode: z.string().optional(),
  sortOrder: z.number().int().optional(),
  yearCarryover: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

const updateAccountInputSchema = z.object({
  id: z.string(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  accountType: z.enum(["bonus", "day", "month"]).optional(),
  unit: z.enum(["minutes", "hours", "days"]).optional(),
  displayFormat: z.enum(["decimal", "hh_mm"]).optional(),
  bonusFactor: z.number().nullable().optional(),
  accountGroupId: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  isPayrollRelevant: z.boolean().optional(),
  payrollCode: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  yearCarryover: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

// --- Helpers ---

/**
 * Maps a Prisma Account record to the output schema shape.
 */
function mapAccountToOutput(acc: {
  id: string
  tenantId: string | null
  code: string
  name: string
  accountType: string
  unit: string
  isSystem: boolean
  isActive: boolean
  description: string | null
  isPayrollRelevant: boolean
  payrollCode: string | null
  sortOrder: number
  yearCarryover: boolean
  accountGroupId: string | null
  displayFormat: string
  bonusFactor: unknown
  createdAt: Date
  updatedAt: Date
}): AccountOutput {
  return {
    id: acc.id,
    tenantId: acc.tenantId,
    code: acc.code,
    name: acc.name,
    accountType: acc.accountType,
    unit: acc.unit,
    isSystem: acc.isSystem,
    isActive: acc.isActive,
    description: acc.description,
    isPayrollRelevant: acc.isPayrollRelevant,
    payrollCode: acc.payrollCode,
    sortOrder: acc.sortOrder,
    yearCarryover: acc.yearCarryover,
    accountGroupId: acc.accountGroupId,
    displayFormat: acc.displayFormat,
    bonusFactor: acc.bonusFactor != null ? Number(acc.bonusFactor) : null,
    createdAt: acc.createdAt,
    updatedAt: acc.updatedAt,
  }
}

// --- Router ---

export const accountsRouter = createTRPCRouter({
  /**
   * accounts.list -- Returns accounts for the current tenant.
   *
   * Supports optional filters: includeSystem, active, accountType, payrollRelevant.
   * Orders by code ASC.
   *
   * Requires: accounts.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(ACCOUNTS_MANAGE))
    .input(
      z
        .object({
          includeSystem: z.boolean().optional(),
          active: z.boolean().optional(),
          accountType: z.string().optional(),
          payrollRelevant: z.boolean().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(accountOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const accounts = await accountService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
        return {
          data: accounts.map(mapAccountToOutput),
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * accounts.getById -- Returns a single account by ID.
   *
   * Tenant-scoped: returns accounts belonging to the current tenant or system accounts.
   *
   * Requires: accounts.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(ACCOUNTS_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(accountOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const account = await accountService.getById(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
        return mapAccountToOutput(account)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * accounts.getUsage -- Returns day plans referencing this account.
   *
   * Checks day_plan_bonuses, net_account_id, and cap_account_id references.
   *
   * Requires: accounts.manage permission
   */
  getUsage: tenantProcedure
    .use(requirePermission(ACCOUNTS_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(accountUsageOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await accountService.getUsage(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * accounts.create -- Creates a new account.
   *
   * Validates code, name, accountType, and code uniqueness.
   *
   * Requires: accounts.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(ACCOUNTS_MANAGE))
    .input(createAccountInputSchema)
    .output(accountOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const account = await accountService.create(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapAccountToOutput(account)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * accounts.update -- Updates an existing account.
   *
   * Supports partial updates. Validates code/name uniqueness when changed.
   * Cannot modify system account code.
   *
   * Requires: accounts.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(ACCOUNTS_MANAGE))
    .input(updateAccountInputSchema)
    .output(accountOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const account = await accountService.update(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapAccountToOutput(account)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * accounts.delete -- Deletes an account.
   *
   * Cannot delete system accounts.
   *
   * Requires: accounts.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(ACCOUNTS_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await accountService.remove(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
