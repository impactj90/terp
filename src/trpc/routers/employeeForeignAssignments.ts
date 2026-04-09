/**
 * Employee Foreign Assignments Router
 *
 * Provides employee foreign assignment CRUD operations via tRPC procedures.
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as service from "@/lib/services/employee-foreign-assignments-service"

// --- Permission Constants ---

const FOREIGN_ASSIGNMENT_VIEW = permissionIdByKey("personnel.foreign_assignment.view")!
const FOREIGN_ASSIGNMENT_EDIT = permissionIdByKey("personnel.foreign_assignment.edit")!

// --- Router ---

export const employeeForeignAssignmentsRouter = createTRPCRouter({
  /**
   * employeeForeignAssignments.list -- Returns foreign assignments for an employee.
   *
   * Requires: personnel.foreign_assignment.view permission
   */
  list: tenantProcedure
    .use(requirePermission(FOREIGN_ASSIGNMENT_VIEW))
    .input(z.object({ employeeId: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        return await service.list(ctx.prisma, ctx.tenantId!, input.employeeId)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeForeignAssignments.create -- Creates a new foreign assignment for an employee.
   *
   * Requires: personnel.foreign_assignment.edit permission
   */
  create: tenantProcedure
    .use(requirePermission(FOREIGN_ASSIGNMENT_EDIT))
    .input(
      z.object({
        employeeId: z.string(),
        countryCode: z.string(),
        countryName: z.string(),
        startDate: z.coerce.date(),
        endDate: z.coerce.date().nullable().optional(),
        a1CertificateNumber: z.string().optional(),
        a1ValidFrom: z.coerce.date().nullable().optional(),
        a1ValidUntil: z.coerce.date().nullable().optional(),
        foreignActivityExemption: z.boolean().optional(),
        notes: z.string().optional(),
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
   * employeeForeignAssignments.update -- Updates an employee foreign assignment.
   *
   * Requires: personnel.foreign_assignment.edit permission
   */
  update: tenantProcedure
    .use(requirePermission(FOREIGN_ASSIGNMENT_EDIT))
    .input(
      z.object({
        id: z.string(),
        countryCode: z.string().optional(),
        countryName: z.string().optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().nullable().optional(),
        a1CertificateNumber: z.string().nullable().optional(),
        a1ValidFrom: z.coerce.date().nullable().optional(),
        a1ValidUntil: z.coerce.date().nullable().optional(),
        foreignActivityExemption: z.boolean().optional(),
        notes: z.string().nullable().optional(),
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
   * employeeForeignAssignments.delete -- Deletes an employee foreign assignment.
   *
   * Requires: personnel.foreign_assignment.edit permission
   */
  delete: tenantProcedure
    .use(requirePermission(FOREIGN_ASSIGNMENT_EDIT))
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
