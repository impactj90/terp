/**
 * Warehouse Supplier Invoices Router
 *
 * tRPC procedures for supplier invoice (Lieferantenrechnungen) operations.
 * All procedures require warehouse module and appropriate permissions.
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as siService from "@/lib/services/wh-supplier-invoice-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const SI_VIEW = permissionIdByKey("wh_supplier_invoices.view")!
const SI_CREATE = permissionIdByKey("wh_supplier_invoices.create")!
const SI_EDIT = permissionIdByKey("wh_supplier_invoices.edit")!
const SI_PAY = permissionIdByKey("wh_supplier_invoices.pay")!

// --- Base procedure with module guard ---
const whProcedure = tenantProcedure.use(requireModule("warehouse"))

// --- Payments Sub-Router ---
const paymentsRouter = createTRPCRouter({
  list: whProcedure
    .use(requirePermission(SI_VIEW))
    .input(z.object({ invoiceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await siService.listPayments(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.invoiceId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: whProcedure
    .use(requirePermission(SI_PAY))
    .input(
      z.object({
        invoiceId: z.string().uuid(),
        date: z.string(),
        amount: z.number().positive(),
        type: z.enum(["CASH", "BANK"]),
        isDiscount: z.boolean().optional(),
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
        return await siService.createPayment(
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
    .use(requirePermission(SI_PAY))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const audit = {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }
        return await siService.cancelPayment(
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
})

// --- Main Router ---
export const whSupplierInvoicesRouter = createTRPCRouter({
  list: whProcedure
    .use(requirePermission(SI_VIEW))
    .input(
      z.object({
        supplierId: z.string().uuid().optional(),
        status: z
          .enum(["OPEN", "PARTIAL", "PAID", "CANCELLED"])
          .optional(),
        search: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().positive().max(100).default(25),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await siService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: whProcedure
    .use(requirePermission(SI_VIEW))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await siService.getById(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: whProcedure
    .use(requirePermission(SI_CREATE))
    .input(
      z.object({
        number: z.string().min(1),
        supplierId: z.string().uuid(),
        purchaseOrderId: z.string().uuid().optional(),
        invoiceDate: z.string(),
        receivedDate: z.string().optional(),
        totalNet: z.number(),
        totalVat: z.number(),
        totalGross: z.number(),
        paymentTermDays: z.number().int().optional(),
        dueDate: z.string().optional(),
        discountPercent: z.number().optional(),
        discountDays: z.number().int().optional(),
        discountPercent2: z.number().optional(),
        discountDays2: z.number().int().optional(),
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
        return await siService.create(
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
    .use(requirePermission(SI_EDIT))
    .input(
      z.object({
        id: z.string().uuid(),
        number: z.string().min(1).optional(),
        invoiceDate: z.string().optional(),
        totalNet: z.number().optional(),
        totalVat: z.number().optional(),
        totalGross: z.number().optional(),
        paymentTermDays: z.number().int().nullable().optional(),
        dueDate: z.string().nullable().optional(),
        discountPercent: z.number().nullable().optional(),
        discountDays: z.number().int().nullable().optional(),
        discountPercent2: z.number().nullable().optional(),
        discountDays2: z.number().int().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const audit = {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }
        return await siService.update(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          audit
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  cancel: whProcedure
    .use(requirePermission(SI_EDIT))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const audit = {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }
        return await siService.cancel(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          audit
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  summary: whProcedure
    .use(requirePermission(SI_VIEW))
    .input(
      z.object({
        supplierId: z.string().uuid().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await siService.summary(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.supplierId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  payments: paymentsRouter,
})
