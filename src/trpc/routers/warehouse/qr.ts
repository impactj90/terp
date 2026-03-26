/**
 * Warehouse QR Scanner Router
 *
 * tRPC procedures for QR code resolution, label PDF generation,
 * and scanner-related queries. All procedures require warehouse module.
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as qrService from "@/lib/services/wh-qr-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const WH_QR_SCAN = permissionIdByKey("wh_qr.scan")!
const WH_QR_PRINT = permissionIdByKey("wh_qr.print")!

// --- Base procedure with module guard ---
const whProcedure = tenantProcedure.use(requireModule("warehouse"))

// --- Router ---
export const whQrRouter = createTRPCRouter({
  /**
   * Resolve a QR code string to an article.
   * Mutation (not query) because it is called imperatively on scan events.
   */
  resolveCode: whProcedure
    .use(requirePermission(WH_QR_SCAN))
    .input(z.object({ code: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await qrService.resolveQrCode(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.code
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * Resolve an article by its number (manual input fallback).
   */
  resolveByNumber: whProcedure
    .use(requirePermission(WH_QR_SCAN))
    .input(z.object({ articleNumber: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await qrService.resolveByNumber(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.articleNumber
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * Generate label PDF for selected articles.
   * Returns signed URL for download.
   */
  generateLabelPdf: whProcedure
    .use(requirePermission(WH_QR_PRINT))
    .input(
      z.object({
        articleIds: z.array(z.string().uuid()).min(1).max(200),
        format: z.enum(["AVERY_L4736", "AVERY_L4731"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await qrService.generateLabelPdf(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.articleIds,
          input.format
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * Generate label PDF for all articles (optional group filter).
   * Returns signed URL for download.
   */
  generateAllLabelsPdf: whProcedure
    .use(requirePermission(WH_QR_PRINT))
    .input(
      z.object({
        articleGroupId: z.string().uuid().optional(),
        format: z.enum(["AVERY_L4736", "AVERY_L4731"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await qrService.generateAllLabelsPdf(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * Generate single QR code as data URL for inline display.
   */
  generateSingleQr: whProcedure
    .use(requirePermission(WH_QR_PRINT))
    .input(z.object({ articleId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await qrService.generateSingleQr(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.articleId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * Recent stock movements for an article (for Storno flow).
   */
  recentMovements: whProcedure
    .use(requirePermission(WH_QR_SCAN))
    .input(
      z.object({
        articleId: z.string().uuid(),
        limit: z.number().int().min(1).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await qrService.listRecentMovements(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.articleId,
          input.limit
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * Find pending purchase order positions for an article (Wareneingang flow).
   */
  pendingPositionsForArticle: whProcedure
    .use(requirePermission(WH_QR_SCAN))
    .input(z.object({ articleId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await qrService.findPendingPositionsForArticle(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.articleId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
