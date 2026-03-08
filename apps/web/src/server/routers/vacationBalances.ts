/**
 * Vacation Balances CRUD Router
 *
 * Provides CRUD operations on vacation balance records via tRPC procedures.
 * Separated from the vacation router which handles business logic mutations.
 *
 * Replaces the Go backend endpoints:
 * - GET    /vacation-balances      -> vacationBalances.list
 * - GET    /vacation-balances/:id  -> vacationBalances.getById
 * - POST   /vacation-balances      -> vacationBalances.create
 * - PATCH  /vacation-balances/:id  -> vacationBalances.update
 *
 * @see apps/api/internal/service/vacationbalance.go
 * @see apps/api/internal/handler/vacation_balance.go
 */
import { z } from "zod"
import type { Prisma } from "@/generated/prisma/client"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import {
  requirePermission,
  applyDataScope,
  type DataScope,
} from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"
import {
  vacationBalanceOutputSchema,
  mapBalanceToOutput,
  employeeSelect,
} from "../lib/vacation-balance-output"

// --- Permission Constants ---

const ABSENCES_MANAGE = permissionIdByKey("absences.manage")!

// --- Data Scope Helper ---

/**
 * Builds a Prisma WHERE clause for vacation balance data scope filtering.
 * Vacation balances are scoped via the employee relation.
 */
function buildVacationBalanceDataScopeWhere(
  dataScope: DataScope
): Record<string, unknown> | null {
  if (dataScope.type === "department") {
    return { employee: { departmentId: { in: dataScope.departmentIds } } }
  } else if (dataScope.type === "employee") {
    return { employeeId: { in: dataScope.employeeIds } }
  }
  return null
}

// --- Router ---

export const vacationBalancesRouter = createTRPCRouter({
  /**
   * vacationBalances.list -- Lists vacation balances with optional filters.
   *
   * Returns paginated results with { items, total }.
   * Applies data scope filtering via applyDataScope() middleware.
   *
   * Port of Go VacationBalanceService.List() + VacationBalanceRepository.ListAll()
   * Requires: absences.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(ABSENCES_MANAGE))
    .use(applyDataScope())
    .input(
      z
        .object({
          page: z.number().int().positive().optional(),
          pageSize: z.number().int().min(1).max(100).optional(),
          employeeId: z.string().uuid().optional(),
          year: z.number().int().optional(),
          departmentId: z.string().uuid().optional(),
        })
        .optional()
        .default({})
    )
    .output(
      z.object({
        items: z.array(vacationBalanceOutputSchema),
        total: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const page = input.page ?? 1
      const pageSize = input.pageSize ?? 50
      const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

      // Build where clause
      const where: Record<string, unknown> = { tenantId }
      if (input.employeeId) {
        where.employeeId = input.employeeId
      }
      if (input.year) {
        where.year = input.year
      }
      if (input.departmentId) {
        where.employee = { departmentId: input.departmentId }
      }

      // Apply data scope filtering
      const scopeWhere = buildVacationBalanceDataScopeWhere(dataScope)
      if (scopeWhere) {
        if (scopeWhere.employee && where.employee) {
          where.employee = {
            ...((where.employee as Record<string, unknown>) || {}),
            ...((scopeWhere.employee as Record<string, unknown>) || {}),
          }
        } else {
          Object.assign(where, scopeWhere)
        }
      }

      const [items, total] = await Promise.all([
        ctx.prisma.vacationBalance.findMany({
          where,
          include: { employee: { select: employeeSelect } },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { year: "desc" },
        }),
        ctx.prisma.vacationBalance.count({ where }),
      ])

      return {
        items: items.map(mapBalanceToOutput),
        total,
      }
    }),

  /**
   * vacationBalances.getById -- Returns a single vacation balance by ID.
   *
   * Port of Go VacationBalanceService.GetByID()
   * Requires: absences.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(ABSENCES_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(vacationBalanceOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const balance = await ctx.prisma.vacationBalance.findFirst({
        where: { id: input.id, tenantId },
        include: { employee: { select: employeeSelect } },
      })

      if (!balance) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Vacation balance not found",
        })
      }

      return mapBalanceToOutput(balance)
    }),

  /**
   * vacationBalances.create -- Creates a new vacation balance.
   *
   * Returns CONFLICT if a balance already exists for the employee/year.
   *
   * Port of Go VacationBalanceService.Create()
   * Requires: absences.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(ABSENCES_MANAGE))
    .input(
      z.object({
        employeeId: z.string().uuid(),
        year: z.number().int().min(1900).max(2200),
        entitlement: z.number().default(0),
        carryover: z.number().default(0),
        adjustments: z.number().default(0),
        carryoverExpiresAt: z.date().nullable().optional(),
      })
    )
    .output(vacationBalanceOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Check for existing balance
      const existing = await ctx.prisma.vacationBalance.findFirst({
        where: {
          employeeId: input.employeeId,
          year: input.year,
          tenantId,
        },
      })
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Vacation balance already exists for this employee and year",
        })
      }

      const balance = await ctx.prisma.vacationBalance.create({
        data: {
          tenantId,
          employeeId: input.employeeId,
          year: input.year,
          entitlement: input.entitlement,
          carryover: input.carryover,
          adjustments: input.adjustments,
          taken: 0,
          carryoverExpiresAt: input.carryoverExpiresAt ?? null,
        },
        include: { employee: { select: employeeSelect } },
      })

      return mapBalanceToOutput(balance)
    }),

  /**
   * vacationBalances.update -- Partially updates an existing vacation balance.
   *
   * Port of Go VacationBalanceService.Update()
   * Requires: absences.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(ABSENCES_MANAGE))
    .input(
      z.object({
        id: z.string().uuid(),
        entitlement: z.number().optional(),
        carryover: z.number().optional(),
        adjustments: z.number().optional(),
        carryoverExpiresAt: z.date().nullable().optional(),
      })
    )
    .output(vacationBalanceOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Find balance by ID + tenant scope
      const existing = await ctx.prisma.vacationBalance.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Vacation balance not found",
        })
      }

      // Build partial update data
      const data: Prisma.VacationBalanceUpdateInput = {}
      if (input.entitlement !== undefined) {
        data.entitlement = input.entitlement
      }
      if (input.carryover !== undefined) {
        data.carryover = input.carryover
      }
      if (input.adjustments !== undefined) {
        data.adjustments = input.adjustments
      }
      if (input.carryoverExpiresAt !== undefined) {
        data.carryoverExpiresAt = input.carryoverExpiresAt
      }

      const balance = await ctx.prisma.vacationBalance.update({
        where: { id: input.id },
        data,
        include: { employee: { select: employeeSelect } },
      })

      return mapBalanceToOutput(balance)
    }),
})
