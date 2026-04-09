/**
 * Export Template Schedules Router (Phase 4.4)
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as service from "@/lib/services/export-template-schedule-service"

const SCHEDULE = permissionIdByKey("export_template.schedule")!

const frequencyEnum = z.enum(["daily", "weekly", "monthly"])
const dayPeriodEnum = z.enum(["previous_month", "current_month"])

export const exportTemplateSchedulesRouter = createTRPCRouter({
  list: tenantProcedure
    .use(requirePermission(SCHEDULE))
    .query(async ({ ctx }) => {
      try {
        return await service.list(ctx.prisma, ctx.tenantId!)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: tenantProcedure
    .use(requirePermission(SCHEDULE))
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        return await service.getById(ctx.prisma, ctx.tenantId!, input.id)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: tenantProcedure
    .use(requirePermission(SCHEDULE))
    .input(
      z.object({
        templateId: z.string(),
        name: z.string().min(1).max(200),
        isActive: z.boolean().optional(),
        frequency: frequencyEnum,
        dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
        dayOfMonth: z.number().int().min(1).max(28).nullable().optional(),
        hourOfDay: z.number().int().min(0).max(23),
        dayPeriod: dayPeriodEnum.optional(),
        recipientEmails: z.string().min(1),
        exportInterfaceId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await service.create(ctx.prisma, ctx.tenantId!, input, {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })
      } catch (err) {
        handleServiceError(err)
      }
    }),

  update: tenantProcedure
    .use(requirePermission(SCHEDULE))
    .input(
      z.object({
        id: z.string(),
        templateId: z.string().optional(),
        name: z.string().min(1).max(200).optional(),
        isActive: z.boolean().optional(),
        frequency: frequencyEnum.optional(),
        dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
        dayOfMonth: z.number().int().min(1).max(28).nullable().optional(),
        hourOfDay: z.number().int().min(0).max(23).optional(),
        dayPeriod: dayPeriodEnum.optional(),
        recipientEmails: z.string().min(1).optional(),
        exportInterfaceId: z.string().nullable().optional(),
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

  delete: tenantProcedure
    .use(requirePermission(SCHEDULE))
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
