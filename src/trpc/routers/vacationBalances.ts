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
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import {
  requirePermission,
  applyDataScope,
  type DataScope,
} from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import { vacationBalanceOutputSchema } from "@/lib/services/vacation-balance-output"
import * as service from "@/lib/services/vacation-balances-service"

// --- Permission Constants ---

const ABSENCES_MANAGE = permissionIdByKey("absences.manage")!

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
      const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
      try {
        return await service.listBalances(ctx.prisma, ctx.tenantId!, dataScope, {
          page: input.page ?? 1,
          pageSize: input.pageSize ?? 50,
          employeeId: input.employeeId,
          year: input.year,
          departmentId: input.departmentId,
        })
      } catch (err) {
        handleServiceError(err)
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
      try {
        return await service.getBalanceById(ctx.prisma, ctx.tenantId!, input.id)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        return await service.createBalance(ctx.prisma, ctx.tenantId!, input)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        return await service.updateBalance(ctx.prisma, ctx.tenantId!, input)
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
