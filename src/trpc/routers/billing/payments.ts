import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as paymentService from "@/lib/services/billing-payment-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const PAY_VIEW = permissionIdByKey("billing_payments.view")!
const PAY_CREATE = permissionIdByKey("billing_payments.create")!
const PAY_CANCEL = permissionIdByKey("billing_payments.cancel")!

// --- Base procedure with module guard ---
const billingProcedure = tenantProcedure.use(requireModule("billing"))

// --- Input Schemas ---
// Relaxed UUID: Zod v4's z.string().uuid() rejects non-standard UUIDs (version=0)
// used in seed data. Use regex to accept any 8-4-4-4-12 hex string.
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const uuid = z.string().regex(UUID_RE, "Invalid UUID")
const optionalUuid = uuid.optional()

const openItemsListInput = z.object({
  addressId: optionalUuid,
  status: z.enum(["open", "partial", "paid", "overdue"]).optional(),
  search: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})

const createPaymentInput = z.object({
  documentId: uuid,
  date: z.coerce.date(),
  amount: z.number().positive(),
  type: z.enum(["CASH", "BANK"]),
  isDiscount: z.boolean().optional().default(false),
  notes: z.string().optional(),
})

// --- Router ---
export const billingPaymentsRouter = createTRPCRouter({
  openItems: createTRPCRouter({
    list: billingProcedure
      .use(requirePermission(PAY_VIEW))
      .input(openItemsListInput)
      .query(async ({ ctx, input }) => {
        try {
          return await paymentService.listOpenItems(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    getById: billingProcedure
      .use(requirePermission(PAY_VIEW))
      .input(z.object({ documentId: uuid }))
      .query(async ({ ctx, input }) => {
        try {
          return await paymentService.getOpenItemById(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.documentId
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    summary: billingProcedure
      .use(requirePermission(PAY_VIEW))
      .input(z.object({ addressId: optionalUuid }))
      .query(async ({ ctx, input }) => {
        try {
          return await paymentService.getOpenItemsSummary(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.addressId
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),
  }),

  list: billingProcedure
    .use(requirePermission(PAY_VIEW))
    .input(z.object({ documentId: uuid }))
    .query(async ({ ctx, input }) => {
      try {
        return await paymentService.listPayments(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.documentId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: billingProcedure
    .use(requirePermission(PAY_CREATE))
    .input(createPaymentInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await paymentService.createPayment(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          ctx.user!.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  cancel: billingProcedure
    .use(requirePermission(PAY_CANCEL))
    .input(z.object({ id: uuid, reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await paymentService.cancelPayment(
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
})
