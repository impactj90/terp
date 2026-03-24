/**
 * Warehouse Purchase Orders Router
 *
 * tRPC procedures for purchase order (Einkauf / Bestellungen) operations.
 * All procedures require warehouse module and appropriate permissions.
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as poService from "@/lib/services/wh-purchase-order-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const PO_VIEW = permissionIdByKey("wh_purchase_orders.view")!
const PO_CREATE = permissionIdByKey("wh_purchase_orders.create")!
const PO_EDIT = permissionIdByKey("wh_purchase_orders.edit")!
const PO_DELETE = permissionIdByKey("wh_purchase_orders.delete")!
const PO_ORDER = permissionIdByKey("wh_purchase_orders.order")!

// --- Base procedure with module guard ---
const whProcedure = tenantProcedure.use(requireModule("warehouse"))

// --- Positions Sub-Router ---
const positionsRouter = createTRPCRouter({
  list: whProcedure
    .use(requirePermission(PO_VIEW))
    .input(z.object({ purchaseOrderId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await poService.listPositions(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.purchaseOrderId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  add: whProcedure
    .use(requirePermission(PO_EDIT))
    .input(
      z.object({
        purchaseOrderId: z.string().uuid(),
        articleId: z.string().uuid(),
        quantity: z.number().positive(),
        unitPrice: z.number().optional(),
        unit: z.string().optional(),
        description: z.string().optional(),
        flatCosts: z.number().optional(),
        requestedDelivery: z.string().optional(),
        confirmedDelivery: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const audit = {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }
        return await poService.addPosition(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          audit
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  update: whProcedure
    .use(requirePermission(PO_EDIT))
    .input(
      z.object({
        id: z.string().uuid(),
        quantity: z.number().positive().optional(),
        unitPrice: z.number().optional(),
        unit: z.string().optional(),
        description: z.string().optional(),
        flatCosts: z.number().optional(),
        requestedDelivery: z.string().optional(),
        confirmedDelivery: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const audit = {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }
        return await poService.updatePosition(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          audit
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  delete: whProcedure
    .use(requirePermission(PO_EDIT))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const audit = {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }
        return await poService.deletePosition(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          audit
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})

// --- Main Router ---
export const whPurchaseOrdersRouter = createTRPCRouter({
  list: whProcedure
    .use(requirePermission(PO_VIEW))
    .input(
      z.object({
        supplierId: z.string().uuid().optional(),
        status: z
          .enum([
            "DRAFT",
            "ORDERED",
            "PARTIALLY_RECEIVED",
            "RECEIVED",
            "CANCELLED",
          ])
          .optional(),
        search: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await poService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: whProcedure
    .use(requirePermission(PO_VIEW))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await poService.getById(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: whProcedure
    .use(requirePermission(PO_CREATE))
    .input(
      z.object({
        supplierId: z.string().uuid(),
        contactId: z.string().uuid().optional(),
        requestedDelivery: z.string().optional(),
        notes: z.string().optional(),
        inquiryId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const audit = {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }
        return await poService.create(
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

  update: whProcedure
    .use(requirePermission(PO_EDIT))
    .input(
      z.object({
        id: z.string().uuid(),
        supplierId: z.string().uuid().optional(),
        contactId: z.string().uuid().nullish(),
        requestedDelivery: z.string().nullish(),
        confirmedDelivery: z.string().nullish(),
        notes: z.string().nullish(),
        inquiryId: z.string().uuid().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const audit = {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }
        return await poService.update(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          audit
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  delete: whProcedure
    .use(requirePermission(PO_DELETE))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const audit = {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }
        return await poService.deleteOrder(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          audit
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  sendOrder: whProcedure
    .use(requirePermission(PO_ORDER))
    .input(
      z.object({
        id: z.string().uuid(),
        method: z.enum(["PHONE", "EMAIL", "FAX", "PRINT"]),
        methodNote: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const audit = {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }
        return await poService.sendOrder(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          { method: input.method, methodNote: input.methodNote },
          audit
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  cancel: whProcedure
    .use(requirePermission(PO_EDIT))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const audit = {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }
        return await poService.cancel(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          audit
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  reorderSuggestions: whProcedure
    .use(requirePermission(PO_VIEW))
    .input(z.object({ supplierId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      try {
        return await poService.getReorderSuggestions(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.supplierId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  createFromSuggestions: whProcedure
    .use(requirePermission(PO_CREATE))
    .input(
      z.object({
        supplierId: z.string().uuid(),
        articleIds: z.array(z.string().uuid()).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const audit = {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }
        return await poService.createFromSuggestions(
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

  positions: positionsRouter,
})
