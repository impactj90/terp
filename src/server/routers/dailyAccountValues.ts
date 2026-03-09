/**
 * Daily Account Values Router
 *
 * Provides daily account value list operations via tRPC procedures.
 * Daily account values store per-day minutes allocated to specific accounts
 * (e.g., time accounts, surcharge accounts, capped time accounts).
 *
 * Replaces the Go backend daily account value endpoints:
 * - GET /daily-account-values -> dailyAccountValues.list
 *
 * @see apps/api/internal/service/daily_account_value.go
 * @see apps/api/internal/handler/daily_account_value.go
 * @see apps/api/internal/repository/daily_account_value.go
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---
const ACCOUNTS_MANAGE = permissionIdByKey("accounts.manage")!

// --- Output Schemas ---

const accountSummarySchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    accountType: z.string(),
    unit: z.string(),
    isSystem: z.boolean(),
    isActive: z.boolean(),
  })
  .nullable()

const dailyAccountValueOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  accountId: z.string().uuid(),
  valueDate: z.date(),
  valueMinutes: z.number().int(),
  source: z.string(), // "net_time" | "capped_time" | "surcharge"
  dayPlanId: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  // Nested account details
  account: accountSummarySchema.optional(),
})

// --- Input Schemas ---

const listInputSchema = z
  .object({
    employeeId: z.string().uuid().optional(),
    accountId: z.string().uuid().optional(),
    fromDate: z.string().date().optional(), // YYYY-MM-DD
    toDate: z.string().date().optional(), // YYYY-MM-DD
    source: z.enum(["net_time", "capped_time", "surcharge"]).optional(),
  })
  .optional()

// --- Prisma Include Objects ---

const dailyAccountValueInclude = {
  account: {
    select: {
      id: true,
      code: true,
      name: true,
      accountType: true,
      unit: true,
      isSystem: true,
      isActive: true,
    },
  },
} as const

// --- Router ---

export const dailyAccountValuesRouter = createTRPCRouter({
  /**
   * dailyAccountValues.list -- Returns daily account values with optional filters.
   *
   * Includes account details (name, code, type) for each value.
   * Orders by valueDate ASC, source ASC (matches Go behavior).
   *
   * Replaces: GET /daily-account-values
   *
   * Requires: accounts.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(ACCOUNTS_MANAGE))
    .input(listInputSchema)
    .output(z.object({ items: z.array(dailyAccountValueOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const where: Record<string, unknown> = { tenantId }

      if (input?.employeeId) {
        where.employeeId = input.employeeId
      }

      if (input?.accountId) {
        where.accountId = input.accountId
      }

      if (input?.source) {
        where.source = input.source
      }

      // Date range filters
      if (input?.fromDate || input?.toDate) {
        const valueDate: Record<string, unknown> = {}
        if (input?.fromDate) {
          valueDate.gte = new Date(input.fromDate)
        }
        if (input?.toDate) {
          valueDate.lte = new Date(input.toDate)
        }
        where.valueDate = valueDate
      }

      const items = await ctx.prisma.dailyAccountValue.findMany({
        where,
        include: dailyAccountValueInclude,
        orderBy: [{ valueDate: "asc" }, { source: "asc" }],
      })

      return {
        items: items.map((item) => ({
          id: item.id,
          tenantId: item.tenantId,
          employeeId: item.employeeId,
          accountId: item.accountId,
          valueDate: item.valueDate,
          valueMinutes: item.valueMinutes,
          source: item.source,
          dayPlanId: item.dayPlanId,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          account: item.account
            ? {
                id: item.account.id,
                code: item.account.code,
                name: item.account.name,
                accountType: item.account.accountType,
                unit: item.account.unit,
                isSystem: item.account.isSystem,
                isActive: item.account.isActive,
              }
            : null,
        })),
      }
    }),
})
