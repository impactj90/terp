/**
 * Payroll Wages Router (Phase 2)
 *
 * Manages tenant-specific Lohnart codes used by templates via the
 * export-engine context.
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as service from "@/lib/services/payroll-wage-service"

const PAYROLL_VIEW = permissionIdByKey("personnel.payroll_data.view")!
const PAYROLL_EDIT = permissionIdByKey("personnel.payroll_data.edit")!

export const payrollWagesRouter = createTRPCRouter({
  listDefaults: tenantProcedure
    .use(requirePermission(PAYROLL_VIEW))
    .query(async ({ ctx }) => {
      try {
        return await service.listDefaults(ctx.prisma)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  list: tenantProcedure
    .use(requirePermission(PAYROLL_VIEW))
    .query(async ({ ctx }) => {
      try {
        return await service.listForTenant(ctx.prisma, ctx.tenantId!)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  initialize: tenantProcedure
    .use(requirePermission(PAYROLL_EDIT))
    .mutation(async ({ ctx }) => {
      try {
        return await service.initializeForTenant(ctx.prisma, ctx.tenantId!, {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })
      } catch (err) {
        handleServiceError(err)
      }
    }),

  update: tenantProcedure
    .use(requirePermission(PAYROLL_EDIT))
    .input(
      z.object({
        id: z.string(),
        code: z.string().optional(),
        name: z.string().optional(),
        terpSource: z.string().optional(),
        category: z.string().optional(),
        description: z.string().nullable().optional(),
        sortOrder: z.number().int().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { id, ...rest } = input
        return await service.update(ctx.prisma, ctx.tenantId!, id, rest, {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })
      } catch (err) {
        handleServiceError(err)
      }
    }),

  reset: tenantProcedure
    .use(requirePermission(PAYROLL_EDIT))
    .mutation(async ({ ctx }) => {
      try {
        return await service.reset(ctx.prisma, ctx.tenantId!, {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
