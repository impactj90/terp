/**
 * DSGVO Retention Router
 *
 * Provides tRPC procedures for managing DSGVO data retention rules,
 * previewing affected records, executing retention, and viewing logs.
 *
 * @see src/lib/services/dsgvo-retention-service.ts
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as dsgvoService from "@/lib/services/dsgvo-retention-service"

// --- Permission Constants ---

const DSGVO_VIEW = permissionIdByKey("dsgvo.view")!
const DSGVO_MANAGE = permissionIdByKey("dsgvo.manage")!
const DSGVO_EXECUTE = permissionIdByKey("dsgvo.execute")!

// --- Router ---

export const dsgvoRouter = createTRPCRouter({
  rules: createTRPCRouter({
    /**
     * dsgvo.rules.list -- Returns all retention rules for the tenant.
     * Creates default rules if none exist.
     *
     * Requires: dsgvo.view permission
     */
    list: tenantProcedure
      .use(requirePermission(DSGVO_VIEW))
      .input(z.object({}).optional())
      .query(async ({ ctx }) => {
        try {
          return await dsgvoService.listRules(ctx.prisma, ctx.tenantId!)
        } catch (err) {
          handleServiceError(err)
        }
      }),

    /**
     * dsgvo.rules.update -- Update a retention rule.
     * Validates minimum retention months and action compatibility.
     *
     * Requires: dsgvo.manage permission
     */
    update: tenantProcedure
      .use(requirePermission(DSGVO_MANAGE))
      .input(
        z.object({
          dataType: z.string(),
          retentionMonths: z.number().int().min(6),
          action: z.enum(["DELETE", "ANONYMIZE"]),
          isActive: z.boolean(),
          description: z.string().nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await dsgvoService.updateRule(
            ctx.prisma,
            ctx.tenantId!,
            input,
            { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),
  }),

  /**
   * dsgvo.preview -- Preview affected record counts.
   * Returns count per data type that would be affected by retention execution.
   *
   * Requires: dsgvo.view permission
   */
  preview: tenantProcedure
    .use(requirePermission(DSGVO_VIEW))
    .input(
      z
        .object({
          dataType: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      try {
        return await dsgvoService.previewRetention(
          ctx.prisma,
          ctx.tenantId!,
          input?.dataType
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * dsgvo.execute -- Execute retention (delete/anonymize records).
   * Supports dry-run mode and optional data type filtering.
   *
   * Requires: dsgvo.execute permission
   */
  execute: tenantProcedure
    .use(requirePermission(DSGVO_EXECUTE))
    .input(
      z.object({
        dataType: z.string().optional(),
        dryRun: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await dsgvoService.executeRetention(ctx.prisma, ctx.tenantId!, {
          dataType: input.dataType,
          dryRun: input.dryRun,
          executedBy: ctx.user?.id,
        }, { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent })
      } catch (err) {
        handleServiceError(err)
      }
    }),

  logs: createTRPCRouter({
    /**
     * dsgvo.logs.list -- Returns paginated deletion logs.
     *
     * Requires: dsgvo.view permission
     */
    list: tenantProcedure
      .use(requirePermission(DSGVO_VIEW))
      .input(
        z
          .object({
            page: z.number().int().min(1).optional().default(1),
            pageSize: z.number().int().min(1).max(100).optional().default(20),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        try {
          return await dsgvoService.listDeleteLogs(
            ctx.prisma,
            ctx.tenantId!,
            input
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),
  }),
})
