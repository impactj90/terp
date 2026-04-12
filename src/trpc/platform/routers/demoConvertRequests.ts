/**
 * Platform demo-convert-requests router.
 *
 * Exposes the `demo_convert_requests` inbox to the platform-admin UI:
 * list, count pending, resolve, dismiss. Writes are pure status flips —
 * no coupled business logic. The operator navigates to
 * `/platform/tenants/demo?highlight=<tenantId>` to perform the actual
 * convert/extend/outreach manually.
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, platformAuthedProcedure } from "../init"
import * as platformAudit from "@/lib/platform/audit-service"
import * as service from "@/lib/services/demo-convert-request-service"

export const platformDemoConvertRequestsRouter = createTRPCRouter({
  list: platformAuthedProcedure
    .input(
      z.object({
        status: z.enum(["pending", "resolved", "dismissed"]).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      return await service.list(ctx.prisma, input)
    }),

  countPending: platformAuthedProcedure.query(async ({ ctx }) => {
    return await service.countPending(ctx.prisma)
  }),

  resolve: platformAuthedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        note: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await service.resolve(ctx.prisma, input, ctx.platformUser.id)
        await platformAudit.log(ctx.prisma, {
          platformUserId: ctx.platformUser.id,
          action: "demo_convert_request.resolved",
          entityType: "demo_convert_request",
          entityId: input.id,
          metadata: { note: input.note ?? null },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })
        return { ok: true as const }
      } catch (err) {
        if (err instanceof service.DemoConvertRequestNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message })
        }
        if (err instanceof service.DemoConvertRequestConflictError) {
          throw new TRPCError({ code: "CONFLICT", message: err.message })
        }
        throw err
      }
    }),

  dismiss: platformAuthedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        note: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await service.dismiss(ctx.prisma, input, ctx.platformUser.id)
        await platformAudit.log(ctx.prisma, {
          platformUserId: ctx.platformUser.id,
          action: "demo_convert_request.dismissed",
          entityType: "demo_convert_request",
          entityId: input.id,
          metadata: { note: input.note ?? null },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })
        return { ok: true as const }
      } catch (err) {
        if (err instanceof service.DemoConvertRequestNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message })
        }
        if (err instanceof service.DemoConvertRequestConflictError) {
          throw new TRPCError({ code: "CONFLICT", message: err.message })
        }
        throw err
      }
    }),
})
