/**
 * Employee Other Employments Router
 *
 * Provides employee other employment CRUD operations via tRPC procedures.
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as service from "@/lib/services/employee-other-employments-service"

// --- Permission Constants ---

const PAYROLL_VIEW = permissionIdByKey("personnel.payroll_data.view")!
const PAYROLL_EDIT = permissionIdByKey("personnel.payroll_data.edit")!

// --- Router ---

export const employeeOtherEmploymentsRouter = createTRPCRouter({
  /**
   * employeeOtherEmployments.list -- Returns other employments for an employee.
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
   * employeeOtherEmployments.create -- Creates a new other employment for an employee.
   *
   * Requires: personnel.payroll_data.edit permission
   */
  create: tenantProcedure
    .use(requirePermission(PAYROLL_EDIT))
    .input(
      z.object({
        employeeId: z.string(),
        employerName: z.string(),
        monthlyIncome: z.number().optional(),
        weeklyHours: z.number().optional(),
        isMinijob: z.boolean().optional(),
        startDate: z.coerce.date(),
        endDate: z.coerce.date().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await service.create(ctx.prisma, ctx.tenantId!, input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent })
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeOtherEmployments.update -- Updates an employee other employment.
   *
   * Requires: personnel.payroll_data.edit permission
   */
  update: tenantProcedure
    .use(requirePermission(PAYROLL_EDIT))
    .input(
      z.object({
        id: z.string(),
        employerName: z.string().optional(),
        monthlyIncome: z.number().nullable().optional(),
        weeklyHours: z.number().nullable().optional(),
        isMinijob: z.boolean().optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().nullable().optional(),
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
   * employeeOtherEmployments.delete -- Deletes an employee other employment.
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
