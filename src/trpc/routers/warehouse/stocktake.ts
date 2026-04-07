/**
 * Warehouse Stocktake Router
 *
 * tRPC procedures for stocktake (Inventur) operations.
 * All procedures require warehouse module and appropriate permissions.
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as stocktakeService from "@/lib/services/wh-stocktake-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const WH_STOCKTAKE_VIEW = permissionIdByKey("wh_stocktake.view")!
const WH_STOCKTAKE_CREATE = permissionIdByKey("wh_stocktake.create")!
const WH_STOCKTAKE_COUNT = permissionIdByKey("wh_stocktake.count")!
const WH_STOCKTAKE_COMPLETE = permissionIdByKey("wh_stocktake.complete")!
const WH_STOCKTAKE_DELETE = permissionIdByKey("wh_stocktake.delete")!

// --- Base procedure with module guard ---
const whProcedure = tenantProcedure.use(requireModule("warehouse"))

export const whStocktakeRouter = createTRPCRouter({
  list: whProcedure
    .use(requirePermission(WH_STOCKTAKE_VIEW))
    .input(
      z.object({
        status: z
          .enum(["DRAFT", "IN_PROGRESS", "COMPLETED", "CANCELLED"])
          .optional(),
        search: z.string().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await stocktakeService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: whProcedure
    .use(requirePermission(WH_STOCKTAKE_VIEW))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await stocktakeService.getById(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getPositions: whProcedure
    .use(requirePermission(WH_STOCKTAKE_VIEW))
    .input(
      z.object({
        stocktakeId: z.string().uuid(),
        search: z.string().optional(),
        uncountedOnly: z.boolean().optional(),
        differenceOnly: z.boolean().optional(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(200).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await stocktakeService.getPositions(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.stocktakeId,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getPositionByArticle: whProcedure
    .use(requirePermission(WH_STOCKTAKE_COUNT))
    .input(
      z.object({
        stocktakeId: z.string().uuid(),
        articleId: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await stocktakeService.getPositionByArticle(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.stocktakeId,
          input.articleId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getStats: whProcedure
    .use(requirePermission(WH_STOCKTAKE_VIEW))
    .input(z.object({ stocktakeId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await stocktakeService.getStats(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.stocktakeId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: whProcedure
    .use(requirePermission(WH_STOCKTAKE_CREATE))
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().max(2000).nullish(),
        scope: z.enum(["ALL", "GROUP", "LOCATION"]).nullish(),
        scopeFilter: z.unknown().nullish(),
        notes: z.string().max(2000).nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const audit = {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }
        return await stocktakeService.create(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          ctx.user!.id,
          audit
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  startCounting: whProcedure
    .use(requirePermission(WH_STOCKTAKE_CREATE))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const audit = {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }
        return await stocktakeService.startCounting(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          audit
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  recordCount: whProcedure
    .use(requirePermission(WH_STOCKTAKE_COUNT))
    .input(
      z.object({
        stocktakeId: z.string().uuid(),
        articleId: z.string().uuid(),
        countedQuantity: z.number().min(0),
        note: z.string().max(500).nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const audit = {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }
        return await stocktakeService.recordCount(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          ctx.user!.id,
          audit
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  reviewPosition: whProcedure
    .use(requirePermission(WH_STOCKTAKE_COMPLETE))
    .input(
      z.object({
        positionId: z.string().uuid(),
        reviewed: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const audit = {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }
        return await stocktakeService.reviewPosition(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.positionId,
          input.reviewed,
          audit
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  skipPosition: whProcedure
    .use(requirePermission(WH_STOCKTAKE_COUNT))
    .input(
      z.object({
        positionId: z.string().uuid(),
        skipReason: z.string().min(1).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const audit = {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }
        return await stocktakeService.skipPositionFn(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.positionId,
          input.skipReason,
          audit
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  complete: whProcedure
    .use(requirePermission(WH_STOCKTAKE_COMPLETE))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const audit = {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }
        return await stocktakeService.complete(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          ctx.user!.id,
          audit
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  cancel: whProcedure
    .use(requirePermission(WH_STOCKTAKE_COMPLETE))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const audit = {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }
        return await stocktakeService.cancel(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          audit
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  remove: whProcedure
    .use(requirePermission(WH_STOCKTAKE_DELETE))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const audit = {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }
        return await stocktakeService.remove(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          audit
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  generatePdf: whProcedure
    .use(requirePermission(WH_STOCKTAKE_COMPLETE))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { generateAndGetDownloadUrl } = await import(
          "@/lib/services/wh-stocktake-pdf-service"
        )
        return await generateAndGetDownloadUrl(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
