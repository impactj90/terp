/**
 * Warehouse Stock Movements Router
 *
 * tRPC procedures for goods receipt (Wareneingang) and stock movement
 * (Lagerbewegungen) operations. All procedures require warehouse module
 * and appropriate permissions.
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as stockMovementService from "@/lib/services/wh-stock-movement-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const WH_STOCK_VIEW = permissionIdByKey("wh_stock.view")!
const WH_STOCK_MANAGE = permissionIdByKey("wh_stock.manage")!

// --- Base procedure with module guard ---
const whProcedure = tenantProcedure.use(requireModule("warehouse"))

// --- Goods Receipt Sub-Router ---
const goodsReceiptRouter = createTRPCRouter({
  listPendingOrders: whProcedure
    .use(requirePermission(WH_STOCK_VIEW))
    .input(z.object({ supplierId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      try {
        return await stockMovementService.listPendingOrders(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.supplierId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getOrderPositions: whProcedure
    .use(requirePermission(WH_STOCK_VIEW))
    .input(z.object({ purchaseOrderId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await stockMovementService.getOrderPositions(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.purchaseOrderId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  book: whProcedure
    .use(requirePermission(WH_STOCK_MANAGE))
    .input(
      z.object({
        purchaseOrderId: z.string().uuid(),
        positions: z
          .array(
            z.object({
              positionId: z.string().uuid(),
              quantity: z.number().positive(),
            })
          )
          .min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const audit = {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }
        return await stockMovementService.bookGoodsReceipt(
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

  bookSingle: whProcedure
    .use(requirePermission(WH_STOCK_MANAGE))
    .input(
      z.object({
        purchaseOrderPositionId: z.string().uuid(),
        quantity: z.number().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const audit = {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }
        return await stockMovementService.bookSinglePosition(
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
})

// --- Movements Sub-Router ---
const movementsRouter = createTRPCRouter({
  list: whProcedure
    .use(requirePermission(WH_STOCK_VIEW))
    .input(
      z.object({
        articleId: z.string().uuid().optional(),
        type: z
          .enum([
            "GOODS_RECEIPT",
            "WITHDRAWAL",
            "ADJUSTMENT",
            "INVENTORY",
            "RETURN",
          ])
          .optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        purchaseOrderId: z.string().uuid().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await stockMovementService.listMovements(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  recent: whProcedure
    .use(requirePermission(WH_STOCK_VIEW))
    .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ ctx, input }) => {
      try {
        return await stockMovementService.listRecent(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.limit
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  listByArticle: whProcedure
    .use(requirePermission(WH_STOCK_VIEW))
    .input(z.object({ articleId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await stockMovementService.listByArticle(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.articleId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})

// --- Main Router Export ---
export const whStockMovementsRouter = createTRPCRouter({
  goodsReceipt: goodsReceiptRouter,
  movements: movementsRouter,
})
