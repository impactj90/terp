/**
 * Export Template Snapshots Router (Phase 4.2)
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as service from "@/lib/services/export-template-snapshot-service"

const SNAPSHOT = permissionIdByKey("export_template.snapshot")!

export const exportTemplateSnapshotsRouter = createTRPCRouter({
  list: tenantProcedure
    .use(requirePermission(SNAPSHOT))
    .input(z.object({ templateId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      try {
        return await service.list(ctx.prisma, ctx.tenantId!, input?.templateId)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: tenantProcedure
    .use(requirePermission(SNAPSHOT))
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        return await service.getById(ctx.prisma, ctx.tenantId!, input.id)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  record: tenantProcedure
    .use(requirePermission(SNAPSHOT))
    .input(
      z.object({
        templateId: z.string(),
        name: z.string().min(1).max(200),
        description: z.string().nullable().optional(),
        year: z.number().int().min(2000).max(2100),
        month: z.number().int().min(1).max(12),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await service.record(ctx.prisma, ctx.tenantId!, input, {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })
      } catch (err) {
        handleServiceError(err)
      }
    }),

  verify: tenantProcedure
    .use(requirePermission(SNAPSHOT))
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await service.verify(ctx.prisma, ctx.tenantId!, input.id, {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })
      } catch (err) {
        handleServiceError(err)
      }
    }),

  delete: tenantProcedure
    .use(requirePermission(SNAPSHOT))
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await service.remove(ctx.prisma, ctx.tenantId!, input.id, {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
