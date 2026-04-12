/**
 * Employee Pensions Router
 *
 * Provides employee pension CRUD operations via tRPC procedures.
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as service from "@/lib/services/employee-pensions-service"

// --- Permission Constants ---

const PAYROLL_VIEW = permissionIdByKey("personnel.payroll_data.view")!
const PAYROLL_EDIT = permissionIdByKey("personnel.payroll_data.edit")!

// --- Router ---

export const employeePensionsRouter = createTRPCRouter({
  /**
   * employeePensions.list -- Returns pensions for an employee.
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
   * employeePensions.create -- Creates a new pension for an employee.
   *
   * Requires: personnel.payroll_data.edit permission
   */
  create: tenantProcedure
    .use(requirePermission(PAYROLL_EDIT))
    .input(
      z.object({
        employeeId: z.string(),
        executionType: z.string(),
        providerName: z.string(),
        contractNumber: z.string().optional(),
        employeeContribution: z.number().optional(),
        employerContribution: z.number().optional(),
        mandatoryEmployerSubsidy: z.number().optional(),
        startDate: z.coerce.date(),
        endDate: z.coerce.date().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await service.create(ctx.prisma, ctx.tenantId!, {
          ...input,
          employeeContribution: input.employeeContribution ?? 0,
          employerContribution: input.employerContribution ?? 0,
        },
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent })
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeePensions.update -- Updates an employee pension.
   *
   * Requires: personnel.payroll_data.edit permission
   */
  update: tenantProcedure
    .use(requirePermission(PAYROLL_EDIT))
    .input(
      z.object({
        id: z.string(),
        executionType: z.string().optional(),
        providerName: z.string().optional(),
        contractNumber: z.string().nullable().optional(),
        employeeContribution: z.number().optional(),
        employerContribution: z.number().optional(),
        mandatoryEmployerSubsidy: z.number().optional(),
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
   * employeePensions.delete -- Deletes an employee pension.
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
