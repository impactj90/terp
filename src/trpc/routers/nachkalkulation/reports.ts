/**
 * Nachkalkulation: Reports Router (NK-1, Phase 6)
 *
 * Read-only queries powered by `nk-aggregator.ts`. Module-gated
 * (Decision 23).
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { requireModule } from "@/lib/modules"
import * as aggregator from "@/lib/services/nk-aggregator"
import type { PrismaClient } from "@/generated/prisma/client"

const NK_VIEW = permissionIdByKey("nachkalkulation.view")!
const NK_MANAGE = permissionIdByKey("nachkalkulation.manage")!

const nkProcedure = tenantProcedure.use(requireModule("nachkalkulation"))

export const reportsRouter = createTRPCRouter({
  istAufwand: nkProcedure
    .use(requirePermission(NK_VIEW, NK_MANAGE))
    .input(z.object({ orderId: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        return await aggregator.calculateIstAufwand(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.orderId,
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  sollIst: nkProcedure
    .use(requirePermission(NK_VIEW, NK_MANAGE))
    .input(z.object({ orderId: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        return await aggregator.calculateSollIstReport(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.orderId,
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  istAufwandBatch: nkProcedure
    .use(requirePermission(NK_VIEW, NK_MANAGE))
    .input(
      z.object({
        orderIds: z.array(z.string()).max(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const map = await aggregator.calculateIstAufwandBatch(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.orderIds,
        )
        return { data: Array.from(map.values()) }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  byDimension: nkProcedure
    .use(requirePermission(NK_VIEW, NK_MANAGE))
    .input(
      z.object({
        dimension: z.enum([
          "customer",
          "service_object",
          "employee",
          "order_type",
        ]),
        dateFrom: z.string().date(),
        dateTo: z.string().date(),
        orderTypeId: z.string().optional(),
        sortBy: z
          .enum([
            "margin_desc",
            "margin_asc",
            "hourly_margin_desc",
            "revenue_desc",
          ])
          .default("margin_desc"),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const data = await aggregator.aggregateByDimension(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          {
            dimension: input.dimension,
            dateFrom: new Date(input.dateFrom),
            dateTo: new Date(input.dateTo),
            orderTypeId: input.orderTypeId,
            sortBy: input.sortBy,
            limit: input.limit,
          },
        )
        return { data }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  recentOrdersDashboard: nkProcedure
    .use(requirePermission(NK_VIEW, NK_MANAGE))
    .input(
      z.object({
        days: z.number().int().min(1).max(90).default(7),
        sortBy: z
          .enum(["margin_desc", "margin_asc", "hourly_margin_desc"])
          .default("hourly_margin_desc"),
        limit: z.number().int().min(1).max(20).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const data = await aggregator.recentOrdersDashboard(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
        )
        return { data }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
