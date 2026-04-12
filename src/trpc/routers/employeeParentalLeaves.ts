/**
 * Employee Parental Leaves Router
 *
 * Provides employee parental leave CRUD operations via tRPC procedures.
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as service from "@/lib/services/employee-parental-leaves-service"

// --- Permission Constants ---

const PAYROLL_VIEW = permissionIdByKey("personnel.payroll_data.view")!
const PAYROLL_EDIT = permissionIdByKey("personnel.payroll_data.edit")!

// --- Router ---

export const employeeParentalLeavesRouter = createTRPCRouter({
  /**
   * employeeParentalLeaves.list -- Returns parental leaves for an employee.
   *
   * Requires: personnel.payroll_data.view permission
   */
  list: tenantProcedure
    .use(requirePermission(PAYROLL_VIEW))
    .input(z.object({ employeeId: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        return await service.list(ctx.prisma, ctx.tenantId!, input.employeeId)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeParentalLeaves.create -- Creates a new parental leave for an employee.
   *
   * Requires: personnel.payroll_data.edit permission
   */
  create: tenantProcedure
    .use(requirePermission(PAYROLL_EDIT))
    .input(
      z.object({
        employeeId: z.string(),
        startDate: z.coerce.date(),
        endDate: z.coerce.date().nullable().optional(),
        childId: z.string().optional(),
        isPartnerMonths: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await service.create(ctx.prisma, ctx.tenantId!, {
          ...input,
          endDate: input.endDate ?? new Date("2099-12-31"),
        },
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent })
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeParentalLeaves.update -- Updates an employee parental leave.
   *
   * Requires: personnel.payroll_data.edit permission
   */
  update: tenantProcedure
    .use(requirePermission(PAYROLL_EDIT))
    .input(
      z.object({
        id: z.string(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().nullable().optional(),
        childId: z.string().nullable().optional(),
        isPartnerMonths: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { id, ...data } = input
        return await service.update(ctx.prisma, ctx.tenantId!, id, data,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent })
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeParentalLeaves.delete -- Deletes an employee parental leave.
   *
   * Requires: personnel.payroll_data.edit permission
   */
  delete: tenantProcedure
    .use(requirePermission(PAYROLL_EDIT))
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await service.remove(ctx.prisma, ctx.tenantId!, input.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent })
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
