/**
 * Overtime Request Config Router
 *
 * Admin-only get/update of the singleton OvertimeRequestConfig row per
 * tenant. Drives approval policy (approvalRequired, leadTimeHours,
 * monthlyWarnThreshold, escalationThreshold).
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as configService from "@/lib/services/overtime-request-config-service"

const SETTINGS_MANAGE = permissionIdByKey("settings.manage")!

const configOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  approvalRequired: z.boolean(),
  leadTimeHours: z.number().int(),
  monthlyWarnThresholdMinutes: z.number().int().nullable(),
  escalationThresholdMinutes: z.number().int().nullable(),
  reopenRequired: z.boolean(),
})

const publicPolicySchema = z.object({
  reopenRequired: z.boolean(),
  approvalRequired: z.boolean(),
})

export const overtimeRequestConfigRouter = createTRPCRouter({
  get: tenantProcedure
    .use(requirePermission(SETTINGS_MANAGE))
    .output(configOutputSchema)
    .query(async ({ ctx }) => {
      try {
        return await configService.getOrCreate(ctx.prisma, ctx.tenantId!)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  update: tenantProcedure
    .use(requirePermission(SETTINGS_MANAGE))
    .input(
      z.object({
        approvalRequired: z.boolean().optional(),
        leadTimeHours: z.number().int().min(0).max(24 * 365).optional(),
        monthlyWarnThresholdMinutes: z
          .number()
          .int()
          .min(0)
          .nullable()
          .optional(),
        escalationThresholdMinutes: z
          .number()
          .int()
          .min(0)
          .nullable()
          .optional(),
        reopenRequired: z.boolean().optional(),
      })
    )
    .output(configOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await configService.update(ctx.prisma, ctx.tenantId!, input, {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * Policy-only read for regular tenant members so the overtime-request form
   * can render itself correctly (hide REOPEN radio when reopenRequired=false,
   * suppress pending-state hint when approvalRequired=false).
   * Never exposes threshold numbers — those stay settings.manage-only.
   */
  getPublic: tenantProcedure
    .output(publicPolicySchema)
    .query(async ({ ctx }) => {
      try {
        const config = await configService.getOrCreate(ctx.prisma, ctx.tenantId!)
        return {
          reopenRequired: config.reopenRequired,
          approvalRequired: config.approvalRequired,
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * Count of pending REOPEN requests. Used by the admin config page to show
   * a preflight warning before a destructive reopenRequired flip (true→false).
   */
  pendingReopenCount: tenantProcedure
    .use(requirePermission(SETTINGS_MANAGE))
    .output(z.object({ count: z.number().int() }))
    .query(async ({ ctx }) => {
      try {
        const count = await ctx.prisma.overtimeRequest.count({
          where: {
            tenantId: ctx.tenantId!,
            status: "pending",
            requestType: "REOPEN",
          },
        })
        return { count }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
