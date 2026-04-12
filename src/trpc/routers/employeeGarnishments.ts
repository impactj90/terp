/**
 * Employee Garnishments Router
 *
 * Provides employee garnishment CRUD operations via tRPC procedures.
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as service from "@/lib/services/employee-garnishments-service"

// --- Permission Constants ---

const GARNISHMENT_VIEW = permissionIdByKey("personnel.garnishment.view")!
const GARNISHMENT_EDIT = permissionIdByKey("personnel.garnishment.edit")!

// --- Router ---

export const employeeGarnishmentsRouter = createTRPCRouter({
  /**
   * employeeGarnishments.list -- Returns garnishments for an employee.
   *
   * Requires: personnel.garnishment.view permission
   */
  list: tenantProcedure
    .use(requirePermission(GARNISHMENT_VIEW))
    .input(z.object({ employeeId: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        return await service.list(ctx.prisma, ctx.tenantId!, input.employeeId)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeGarnishments.create -- Creates a new garnishment for an employee.
   *
   * Requires: personnel.garnishment.edit permission
   */
  create: tenantProcedure
    .use(requirePermission(GARNISHMENT_EDIT))
    .input(
      z.object({
        employeeId: z.string(),
        creditorName: z.string(),
        creditorAddress: z.string().optional(),
        fileReference: z.string().optional(),
        garnishmentAmount: z.number(),
        calculationMethod: z.string(),
        dependentsCount: z.number().optional(),
        rank: z.number().optional(),
        isPAccount: z.boolean().optional(),
        maintenanceObligation: z.boolean().optional(),
        startDate: z.coerce.date(),
        endDate: z.coerce.date().nullable().optional(),
        attachmentFileId: z.string().optional(),
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
   * employeeGarnishments.update -- Updates an employee garnishment.
   *
   * Requires: personnel.garnishment.edit permission
   */
  update: tenantProcedure
    .use(requirePermission(GARNISHMENT_EDIT))
    .input(
      z.object({
        id: z.string(),
        creditorName: z.string().optional(),
        creditorAddress: z.string().nullable().optional(),
        fileReference: z.string().nullable().optional(),
        garnishmentAmount: z.number().optional(),
        calculationMethod: z.string().optional(),
        dependentsCount: z.number().optional(),
        rank: z.number().optional(),
        isPAccount: z.boolean().optional(),
        maintenanceObligation: z.boolean().optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().nullable().optional(),
        attachmentFileId: z.string().nullable().optional(),
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
   * employeeGarnishments.delete -- Deletes an employee garnishment.
   *
   * Requires: personnel.garnishment.edit permission
   */
  delete: tenantProcedure
    .use(requirePermission(GARNISHMENT_EDIT))
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
