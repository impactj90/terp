/**
 * Employee Children Router
 *
 * Provides employee child CRUD operations via tRPC procedures.
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as service from "@/lib/services/employee-children-service"

// --- Permission Constants ---

const PAYROLL_VIEW = permissionIdByKey("personnel.payroll_data.view")!
const PAYROLL_EDIT = permissionIdByKey("personnel.payroll_data.edit")!

// --- Router ---

export const employeeChildrenRouter = createTRPCRouter({
  /**
   * employeeChildren.list -- Returns children for an employee.
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
   * employeeChildren.create -- Creates a new child for an employee.
   *
   * Requires: personnel.payroll_data.edit permission
   */
  create: tenantProcedure
    .use(requirePermission(PAYROLL_EDIT))
    .input(
      z.object({
        employeeId: z.string(),
        firstName: z.string(),
        lastName: z.string(),
        birthDate: z.coerce.date(),
        taxAllowanceShare: z.number().optional(),
        livesInHousehold: z.boolean().optional(),
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
   * employeeChildren.update -- Updates an employee child.
   *
   * Requires: personnel.payroll_data.edit permission
   */
  update: tenantProcedure
    .use(requirePermission(PAYROLL_EDIT))
    .input(
      z.object({
        id: z.string(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        birthDate: z.coerce.date().optional(),
        taxAllowanceShare: z.number().optional(),
        livesInHousehold: z.boolean().optional(),
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
   * employeeChildren.delete -- Deletes an employee child.
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
