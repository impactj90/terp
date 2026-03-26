/**
 * Warehouse Reservations Router
 *
 * tRPC procedures for stock reservation (Artikelreservierungen) operations.
 * All procedures require warehouse module and appropriate permissions.
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as reservationService from "@/lib/services/wh-reservation-service"
import type { PrismaClient } from "@/generated/prisma/client"

const WH_RESERVATIONS_VIEW = permissionIdByKey("wh_reservations.view")!
const WH_RESERVATIONS_MANAGE = permissionIdByKey("wh_reservations.manage")!

const whProcedure = tenantProcedure.use(requireModule("warehouse"))

export const whReservationsRouter = createTRPCRouter({
  list: whProcedure
    .use(requirePermission(WH_RESERVATIONS_VIEW))
    .input(z.object({
      articleId: z.string().uuid().optional(),
      documentId: z.string().uuid().optional(),
      status: z.enum(["ACTIVE", "RELEASED", "FULFILLED"]).optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(25),
    }))
    .query(async ({ ctx, input }) => {
      try {
        return await reservationService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getByArticle: whProcedure
    .use(requirePermission(WH_RESERVATIONS_VIEW))
    .input(z.object({ articleId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await reservationService.getByArticle(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.articleId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  release: whProcedure
    .use(requirePermission(WH_RESERVATIONS_MANAGE))
    .input(z.object({
      id: z.string().uuid(),
      reason: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await reservationService.release(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          ctx.user!.id,
          input.reason
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  releaseBulk: whProcedure
    .use(requirePermission(WH_RESERVATIONS_MANAGE))
    .input(z.object({
      documentId: z.string().uuid(),
      reason: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await reservationService.releaseBulk(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.documentId,
          ctx.user!.id,
          input.reason
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
