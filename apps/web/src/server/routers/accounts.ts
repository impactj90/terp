/**
 * Accounts Router
 *
 * Provides account CRUD operations via tRPC procedures.
 * Replaces the Go backend account endpoints:
 * - GET /accounts -> accounts.list
 * - GET /accounts/{id} -> accounts.getById
 * - POST /accounts -> accounts.create
 * - PATCH /accounts/{id} -> accounts.update
 * - DELETE /accounts/{id} -> accounts.delete
 * - GET /accounts/{id}/usage -> accounts.getUsage
 *
 * @see apps/api/internal/service/account.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { Prisma } from "@prisma/client"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const ACCOUNTS_MANAGE = permissionIdByKey("accounts.manage")!

// --- Output Schemas ---

const accountOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  code: z.string(),
  name: z.string(),
  accountType: z.string(),
  unit: z.string(),
  displayFormat: z.string(),
  bonusFactor: z.number().nullable(),
  description: z.string().nullable(),
  accountGroupId: z.string().uuid().nullable(),
  isPayrollRelevant: z.boolean(),
  payrollCode: z.string().nullable(),
  sortOrder: z.number().int(),
  yearCarryover: z.boolean(),
  isSystem: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type AccountOutput = z.infer<typeof accountOutputSchema>

const accountUsageOutputSchema = z.object({
  accountId: z.string().uuid(),
  usageCount: z.number().int(),
  dayPlans: z.array(
    z.object({
      id: z.string().uuid(),
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
  accountGroupId: z.string().uuid().optional(),
  description: z.string().optional(),
  isPayrollRelevant: z.boolean().optional(),
  payrollCode: z.string().optional(),
  sortOrder: z.number().int().optional(),
  yearCarryover: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

const updateAccountInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  unit: z.enum(["minutes", "hours", "days"]).optional(),
  displayFormat: z.enum(["decimal", "hh_mm"]).optional(),
  bonusFactor: z.number().nullable().optional(),
  accountGroupId: z.string().uuid().nullable().optional(),
  yearCarryover: z.boolean().optional(),
  isPayrollRelevant: z.boolean().optional(),
  payrollCode: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
})

// --- Helpers ---

/**
 * Maps a Prisma Account record to the output schema shape.
 * Converts Decimal bonusFactor to number | null.
 */
function mapAccountToOutput(account: {
  id: string
  tenantId: string | null
  code: string
  name: string
  accountType: string
  unit: string
  displayFormat: string
  bonusFactor: Prisma.Decimal | null
  description: string | null
  accountGroupId: string | null
  isPayrollRelevant: boolean
  payrollCode: string | null
  sortOrder: number
  yearCarryover: boolean
  isSystem: boolean
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}): AccountOutput {
  return {
    id: account.id,
    tenantId: account.tenantId,
    code: account.code,
    name: account.name,
    accountType: account.accountType,
    unit: account.unit,
    displayFormat: account.displayFormat,
    bonusFactor: account.bonusFactor ? Number(account.bonusFactor) : null,
    description: account.description,
    accountGroupId: account.accountGroupId,
    isPayrollRelevant: account.isPayrollRelevant,
    payrollCode: account.payrollCode,
    sortOrder: account.sortOrder,
    yearCarryover: account.yearCarryover,
    isSystem: account.isSystem,
    isActive: account.isActive,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  }
}

// --- Router ---

export const accountsRouter = createTRPCRouter({
  /**
   * accounts.list -- Returns accounts for the current tenant.
   *
   * Supports optional filters: includeSystem, isActive, accountType, payrollRelevant.
   * Orders by isSystem DESC, sortOrder ASC, code ASC.
   *
   * Requires: accounts.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(ACCOUNTS_MANAGE))
    .input(
      z
        .object({
          includeSystem: z.boolean().optional(),
          isActive: z.boolean().optional(),
          accountType: z.enum(["bonus", "day", "month"]).optional(),
          payrollRelevant: z.boolean().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(accountOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Build where clause
      const where: Record<string, unknown> = {}

      if (input?.includeSystem) {
        where.OR = [{ tenantId }, { tenantId: null }]
      } else {
        where.tenantId = tenantId
      }

      if (input?.isActive !== undefined) {
        where.isActive = input.isActive
      }

      if (input?.accountType !== undefined) {
        where.accountType = input.accountType
      }

      if (input?.payrollRelevant !== undefined) {
        where.isPayrollRelevant = input.payrollRelevant
      }

      const accounts = await ctx.prisma.account.findMany({
        where,
        orderBy: [{ isSystem: "desc" }, { sortOrder: "asc" }, { code: "asc" }],
      })

      return {
        data: accounts.map(mapAccountToOutput),
      }
    }),

  /**
   * accounts.getById -- Returns a single account by ID.
   *
   * Allows fetching system accounts (tenantId IS NULL) as well as tenant accounts.
   *
   * Requires: accounts.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(ACCOUNTS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(accountOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const account = await ctx.prisma.account.findFirst({
        where: {
          id: input.id,
          OR: [{ tenantId }, { tenantId: null }],
        },
      })

      if (!account) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not found",
        })
      }

      return mapAccountToOutput(account)
    }),

  /**
   * accounts.create -- Creates a new account.
   *
   * Validates code and name are non-empty after trimming.
   * Checks code uniqueness within tenant.
   * Sets isSystem to false always.
   *
   * Requires: accounts.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(ACCOUNTS_MANAGE))
    .input(createAccountInputSchema)
    .output(accountOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Trim and validate code
      const code = input.code.trim()
      if (code.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Account code is required",
        })
      }

      // Trim and validate name
      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Account name is required",
        })
      }

      // Check code uniqueness within tenant
      const existingByCode = await ctx.prisma.account.findFirst({
        where: { tenantId, code },
      })
      if (existingByCode) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Account code already exists",
        })
      }

      // Trim description if provided
      const description = input.description?.trim() || null

      // Trim payrollCode if provided
      const payrollCode = input.payrollCode?.trim() || null

      // Create account
      const account = await ctx.prisma.account.create({
        data: {
          tenantId,
          code,
          name,
          accountType: input.accountType,
          unit: input.unit ?? "minutes",
          displayFormat: input.displayFormat ?? "decimal",
          bonusFactor: input.bonusFactor ?? null,
          accountGroupId: input.accountGroupId ?? null,
          description,
          isPayrollRelevant: input.isPayrollRelevant ?? false,
          payrollCode,
          sortOrder: input.sortOrder ?? 0,
          yearCarryover: input.yearCarryover ?? true,
          isSystem: false,
          isActive: input.isActive ?? true,
        },
      })

      return mapAccountToOutput(account)
    }),

  /**
   * accounts.update -- Updates an existing account.
   *
   * Supports partial updates. System accounts cannot be modified.
   *
   * Requires: accounts.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(ACCOUNTS_MANAGE))
    .input(updateAccountInputSchema)
    .output(accountOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Fetch existing account
      const existing = await ctx.prisma.account.findFirst({
        where: { id: input.id },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not found",
        })
      }

      // System accounts cannot be modified
      if (existing.isSystem) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot modify system account",
        })
      }

      // Verify tenant ownership
      if (existing.tenantId !== tenantId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not found",
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
            message: "Account name is required",
          })
        }
        data.name = name
      }

      // Handle description update
      if (input.description !== undefined) {
        data.description =
          input.description === null ? null : input.description.trim() || null
      }

      // Handle unit update
      if (input.unit !== undefined) {
        data.unit = input.unit
      }

      // Handle displayFormat update
      if (input.displayFormat !== undefined) {
        data.displayFormat = input.displayFormat
      }

      // Handle bonusFactor update
      if (input.bonusFactor !== undefined) {
        data.bonusFactor = input.bonusFactor
      }

      // Handle accountGroupId update
      if (input.accountGroupId !== undefined) {
        data.accountGroupId = input.accountGroupId
      }

      // Handle yearCarryover update
      if (input.yearCarryover !== undefined) {
        data.yearCarryover = input.yearCarryover
      }

      // Handle isPayrollRelevant update
      if (input.isPayrollRelevant !== undefined) {
        data.isPayrollRelevant = input.isPayrollRelevant
      }

      // Handle payrollCode update
      if (input.payrollCode !== undefined) {
        data.payrollCode =
          input.payrollCode === null ? null : input.payrollCode.trim() || null
      }

      // Handle sortOrder update
      if (input.sortOrder !== undefined) {
        data.sortOrder = input.sortOrder
      }

      // Handle isActive update
      if (input.isActive !== undefined) {
        data.isActive = input.isActive
      }

      const account = await ctx.prisma.account.update({
        where: { id: input.id },
        data,
      })

      return mapAccountToOutput(account)
    }),

  /**
   * accounts.delete -- Deletes an account.
   *
   * System accounts cannot be deleted.
   *
   * Requires: accounts.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(ACCOUNTS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Fetch existing account
      const existing = await ctx.prisma.account.findFirst({
        where: { id: input.id },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not found",
        })
      }

      // System accounts cannot be deleted
      if (existing.isSystem) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete system account",
        })
      }

      // Verify tenant ownership
      if (existing.tenantId !== tenantId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not found",
        })
      }

      // Hard delete
      await ctx.prisma.account.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),

  /**
   * accounts.getUsage -- Returns day plans that reference this account.
   *
   * Uses raw SQL to query day_plans and day_plan_bonuses tables
   * (not yet modeled in Prisma).
   *
   * Requires: accounts.manage permission
   */
  getUsage: tenantProcedure
    .use(requirePermission(ACCOUNTS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(accountUsageOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify account exists (tenant-scoped or system)
      const account = await ctx.prisma.account.findFirst({
        where: {
          id: input.id,
          OR: [{ tenantId }, { tenantId: null }],
        },
      })
      if (!account) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not found",
        })
      }

      // Query day plans that reference this account
      const dayPlans = await ctx.prisma.$queryRaw<
        Array<{ id: string; code: string; name: string }>
      >`
        SELECT DISTINCT dp.id, dp.code, dp.name
        FROM day_plans dp
        WHERE dp.tenant_id = ${tenantId}::uuid
        AND (
          dp.id IN (SELECT day_plan_id FROM day_plan_bonuses WHERE account_id = ${input.id}::uuid)
          OR dp.net_account_id = ${input.id}::uuid
          OR dp.cap_account_id = ${input.id}::uuid
        )
        ORDER BY dp.code ASC
      `

      return {
        accountId: input.id,
        usageCount: dayPlans.length,
        dayPlans,
      }
    }),
})
