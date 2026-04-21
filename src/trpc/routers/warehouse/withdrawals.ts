/**
 * Warehouse Withdrawals Router
 *
 * tRPC procedures for stock withdrawals (Lagerentnahmen).
 * All procedures require warehouse module and appropriate permissions.
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as withdrawalService from "@/lib/services/wh-withdrawal-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const WH_STOCK_VIEW = permissionIdByKey("wh_stock.view")!
const WH_STOCK_MANAGE = permissionIdByKey("wh_stock.manage")!

// --- Base procedure with module guard ---
const whProcedure = tenantProcedure.use(requireModule("warehouse"))

// --- Input Schemas ---
const referenceTypeEnum = z.enum([
  "ORDER",
  "DOCUMENT",
  "MACHINE",
  "SERVICE_OBJECT",
  "NONE",
])

// --- Router ---
export const whWithdrawalsRouter = createTRPCRouter({
  create: whProcedure
    .use(requirePermission(WH_STOCK_MANAGE))
    .input(
      z.object({
        articleId: z.string().uuid(),
        quantity: z.number().positive(),
        referenceType: referenceTypeEnum,
        referenceId: z.string().optional(),
        machineId: z.string().optional(),
        serviceObjectId: z.string().uuid().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const audit = {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }
        return await withdrawalService.createWithdrawal(
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

  createBatch: whProcedure
    .use(requirePermission(WH_STOCK_MANAGE))
    .input(
      z.object({
        referenceType: referenceTypeEnum,
        referenceId: z.string().optional(),
        machineId: z.string().optional(),
        serviceObjectId: z.string().uuid().optional(),
        items: z
          .array(
            z.object({
              articleId: z.string().uuid(),
              quantity: z.number().positive(),
            })
          )
          .min(1),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const audit = {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }
        return await withdrawalService.createBatchWithdrawal(
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

  cancel: whProcedure
    .use(requirePermission(WH_STOCK_MANAGE))
    .input(z.object({ movementId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const audit = {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }
        return await withdrawalService.cancelWithdrawal(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.movementId,
          ctx.user!.id,
          audit
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  list: whProcedure
    .use(requirePermission(WH_STOCK_VIEW))
    .input(
      z.object({
        orderId: z.string().uuid().optional(),
        documentId: z.string().uuid().optional(),
        machineId: z.string().optional(),
        serviceObjectId: z.string().uuid().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await withdrawalService.listWithdrawals(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  listByOrder: whProcedure
    .use(requirePermission(WH_STOCK_VIEW))
    .input(z.object({ orderId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await withdrawalService.listByOrder(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.orderId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  listByDocument: whProcedure
    .use(requirePermission(WH_STOCK_VIEW))
    .input(z.object({ documentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await withdrawalService.listByDocument(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.documentId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
