/**
 * InboundInvoicePayments tRPC router.
 *
 * Thin wrapper over inbound-invoice-payment-service. Mirrors
 * routers/billing/payments.ts for the supplier side.
 *
 * Plan: thoughts/shared/plans/2026-04-14-camt-preflight-items.md Phase 3b.
 */
import { z } from "zod"
import type { PrismaClient } from "@/generated/prisma/client"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { requireModule } from "@/lib/modules"
import * as paymentService from "@/lib/services/inbound-invoice-payment-service"

const VIEW = permissionIdByKey("inbound_invoice_payments.view")!
const CREATE = permissionIdByKey("inbound_invoice_payments.create")!
const CANCEL = permissionIdByKey("inbound_invoice_payments.cancel")!

const procedure = tenantProcedure.use(requireModule("inbound_invoices"))

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i)

export const inboundInvoicePaymentsRouter = createTRPCRouter({
  list: procedure
    .use(requirePermission(VIEW))
    .input(z.object({ invoiceId: uuid }))
    .query(async ({ ctx, input }) => {
      try {
        return await paymentService.listPayments(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.invoiceId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: procedure
    .use(requirePermission(CREATE))
    .input(
      z.object({
        invoiceId: uuid,
        date: z.coerce.date(),
        amount: z.number().positive().max(999_999_999.99),
        type: z.enum(["CASH", "BANK"]),
        notes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await paymentService.createPayment(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          ctx.user!.id,
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

  cancel: procedure
    .use(requirePermission(CANCEL))
    .input(z.object({ id: uuid, reason: z.string().max(2000).optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await paymentService.cancelPayment(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          ctx.user!.id,
          input.reason,
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
