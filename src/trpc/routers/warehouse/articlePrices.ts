/**
 * Warehouse Article Prices Router
 *
 * tRPC procedures for managing article prices across billing price lists.
 * All procedures require warehouse module and appropriate permissions.
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as whArticlePriceService from "@/lib/services/wh-article-price-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const WH_VIEW = permissionIdByKey("wh_articles.view")!
const PL_VIEW = permissionIdByKey("billing_price_lists.view")!
const PL_MANAGE = permissionIdByKey("billing_price_lists.manage")!

// --- Base procedure with module guard ---
const whProcedure = tenantProcedure.use(requireModule("warehouse"))

// --- Router ---
export const whArticlePricesRouter = createTRPCRouter({
  listPriceLists: whProcedure
    .use(requirePermission(PL_VIEW))
    .input(
      z.object({
        isActive: z.boolean().optional(),
        search: z.string().max(255).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      try {
        return await whArticlePriceService.listPriceLists(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input ?? {}
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  createPriceList: whProcedure
    .use(requirePermission(PL_MANAGE))
    .input(
      z.object({
        name: z.string().min(1).max(255),
        isDefault: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await whArticlePriceService.createPriceList(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  updatePriceList: whProcedure
    .use(requirePermission(PL_MANAGE))
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        isDefault: z.boolean().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await whArticlePriceService.updatePriceList(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          { name: input.name, isDefault: input.isDefault, isActive: input.isActive },
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  deletePriceList: whProcedure
    .use(requirePermission(PL_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await whArticlePriceService.deletePriceList(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  listByArticle: whProcedure
    .use(requirePermission(WH_VIEW))
    .input(z.object({ articleId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await whArticlePriceService.listByArticle(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.articleId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  listByPriceList: whProcedure
    .use(requirePermission(PL_VIEW))
    .input(
      z.object({
        priceListId: z.string().uuid(),
        search: z.string().max(255).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await whArticlePriceService.listByPriceList(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.priceListId,
          { search: input.search }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  setPrice: whProcedure
    .use(requirePermission(PL_MANAGE))
    .input(
      z.object({
        priceListId: z.string().uuid(),
        articleId: z.string().uuid(),
        unitPrice: z.number().min(0),
        minQuantity: z.number().min(0).optional(),
        unit: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await whArticlePriceService.setPrice(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  removePrice: whProcedure
    .use(requirePermission(PL_MANAGE))
    .input(
      z.object({
        priceListId: z.string().uuid(),
        articleId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await whArticlePriceService.removePrice(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  bulkSetPrices: whProcedure
    .use(requirePermission(PL_MANAGE))
    .input(
      z.object({
        priceListId: z.string().uuid(),
        entries: z
          .array(
            z.object({
              articleId: z.string().uuid(),
              unitPrice: z.number().min(0),
              minQuantity: z.number().min(0).optional(),
            })
          )
          .min(1)
          .max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await whArticlePriceService.bulkSetPrices(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.priceListId,
          input.entries,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  copyPriceList: whProcedure
    .use(requirePermission(PL_MANAGE))
    .input(
      z.object({
        sourceId: z.string().uuid(),
        targetId: z.string().uuid(),
        overwrite: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await whArticlePriceService.copyPriceList(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  adjustPrices: whProcedure
    .use(requirePermission(PL_MANAGE))
    .input(
      z.object({
        priceListId: z.string().uuid(),
        adjustmentPercent: z.number().min(-99).max(999),
        articleGroupId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await whArticlePriceService.adjustPrices(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
