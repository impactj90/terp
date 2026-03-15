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
import { requirePermission, applyDataScope, type DataScope } from "@/lib/auth/middleware"
import { buildRelatedEmployeeDataScopeWhere } from "@/lib/auth/data-scope"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as dailyAccountValuesService from "@/lib/services/daily-account-values-service"

// --- Permission Constants ---
const ACCOUNTS_MANAGE = permissionIdByKey("accounts.manage")!

// --- Output Schemas ---

const accountSummarySchema = z
  .object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    accountType: z.string(),
    unit: z.string(),
    isSystem: z.boolean(),
    isActive: z.boolean(),
  })
  .nullable()

const dailyAccountValueOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  employeeId: z.string(),
  accountId: z.string(),
  valueDate: z.date(),
  valueMinutes: z.number().int(),
  source: z.string(), // "net_time" | "capped_time" | "surcharge"
  dayPlanId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  // Nested account details
  account: accountSummarySchema.optional(),
})

// --- Input Schemas ---

const listInputSchema = z
  .object({
    employeeId: z.string().optional(),
    accountId: z.string().optional(),
    fromDate: z.string().date().optional(), // YYYY-MM-DD
    toDate: z.string().date().optional(), // YYYY-MM-DD
    source: z.enum(["net_time", "capped_time", "surcharge"]).optional(),
  })
  .optional()

const summaryInputSchema = z.object({
  accountId: z.string(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
})

const summaryItemSchema = z.object({
  employeeId: z.string(),
  personnelNumber: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  departmentName: z.string(),
  locationName: z.string(),
  totalMinutes: z.number().int(),
})

const summaryOutputSchema = z.object({
  items: z.array(summaryItemSchema),
  totalMinutes: z.number().int(),
})

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
    .use(applyDataScope())
    .input(listInputSchema)
    .output(z.object({ items: z.array(dailyAccountValueOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const scopeWhere = buildRelatedEmployeeDataScopeWhere(dataScope)
        return await dailyAccountValuesService.list(
          ctx.prisma,
          ctx.tenantId!,
          input,
          scopeWhere
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * dailyAccountValues.summary -- Returns per-employee aggregated minutes for an account in a given month.
   *
   * Groups daily account values by employee, returns sorted by last name.
   * Includes employee name, personnel number, and total minutes.
   *
   * Requires: accounts.manage permission
   */
  summary: tenantProcedure
    .use(requirePermission(ACCOUNTS_MANAGE))
    .use(applyDataScope())
    .input(summaryInputSchema)
    .output(summaryOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const scopeWhere = buildRelatedEmployeeDataScopeWhere(dataScope)
        return await dailyAccountValuesService.summaryByEmployee(
          ctx.prisma,
          ctx.tenantId!,
          input,
          scopeWhere
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
