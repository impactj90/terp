import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as billingDocService from "@/lib/services/billing-document-service"
import * as billingPdfService from "@/lib/services/billing-document-pdf-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const BILLING_VIEW = permissionIdByKey("billing_documents.view")!
const BILLING_CREATE = permissionIdByKey("billing_documents.create")!
const BILLING_EDIT = permissionIdByKey("billing_documents.edit")!
const BILLING_DELETE = permissionIdByKey("billing_documents.delete")!
const BILLING_FINALIZE = permissionIdByKey("billing_documents.finalize")!

// --- Base procedure with module guard ---
const billingProcedure = tenantProcedure.use(requireModule("billing"))

// --- Input Schemas ---
const documentTypeEnum = z.enum([
  "OFFER", "ORDER_CONFIRMATION", "DELIVERY_NOTE",
  "SERVICE_NOTE", "RETURN_DELIVERY", "INVOICE", "CREDIT_NOTE",
])

const documentStatusEnum = z.enum([
  "DRAFT", "PRINTED", "PARTIALLY_FORWARDED", "FORWARDED", "CANCELLED",
])

const positionTypeEnum = z.enum(["ARTICLE", "FREE", "TEXT", "PAGE_BREAK", "SUBTOTAL"])
const priceTypeEnum = z.enum(["STANDARD", "ESTIMATE", "BY_EFFORT"])

const listInput = z.object({
  type: documentTypeEnum.optional(),
  status: documentStatusEnum.optional(),
  addressId: z.string().uuid().optional(),
  inquiryId: z.string().uuid().optional(),
  search: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})

const createInput = z.object({
  type: documentTypeEnum,
  addressId: z.string().uuid(),
  contactId: z.string().uuid().optional(),
  deliveryAddressId: z.string().uuid().optional(),
  invoiceAddressId: z.string().uuid().optional(),
  inquiryId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  orderDate: z.coerce.date().optional(),
  documentDate: z.coerce.date().optional(),
  deliveryDate: z.coerce.date().optional(),
  deliveryType: z.string().optional(),
  deliveryTerms: z.string().optional(),
  paymentTermDays: z.number().int().optional(),
  discountPercent: z.number().optional(),
  discountDays: z.number().int().optional(),
  discountPercent2: z.number().optional(),
  discountDays2: z.number().int().optional(),
  shippingCostNet: z.number().optional(),
  shippingCostVatRate: z.number().optional(),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
  headerText: z.string().optional(),
  footerText: z.string().optional(),
})

const updateInput = z.object({
  id: z.string().uuid(),
  contactId: z.string().uuid().nullable().optional(),
  deliveryAddressId: z.string().uuid().nullable().optional(),
  invoiceAddressId: z.string().uuid().nullable().optional(),
  orderDate: z.coerce.date().nullable().optional(),
  documentDate: z.coerce.date().optional(),
  deliveryDate: z.coerce.date().nullable().optional(),
  deliveryType: z.string().nullable().optional(),
  deliveryTerms: z.string().nullable().optional(),
  paymentTermDays: z.number().int().nullable().optional(),
  discountPercent: z.number().nullable().optional(),
  discountDays: z.number().int().nullable().optional(),
  discountPercent2: z.number().nullable().optional(),
  discountDays2: z.number().int().nullable().optional(),
  shippingCostNet: z.number().nullable().optional(),
  shippingCostVatRate: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  internalNotes: z.string().nullable().optional(),
  headerText: z.string().nullable().optional(),
  footerText: z.string().nullable().optional(),
})

const idInput = z.object({ id: z.string().uuid() })

const forwardInput = z.object({
  id: z.string().uuid(),
  targetType: z.enum([
    "ORDER_CONFIRMATION", "DELIVERY_NOTE", "SERVICE_NOTE", "INVOICE", "CREDIT_NOTE",
  ]),
})

const cancelInput = z.object({
  id: z.string().uuid(),
  reason: z.string().optional(),
})

const addPositionInput = z.object({
  documentId: z.string().uuid(),
  type: positionTypeEnum,
  articleId: z.string().uuid().optional(),
  articleNumber: z.string().optional(),
  description: z.string().optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  unitPrice: z.number().optional(),
  flatCosts: z.number().optional(),
  priceType: priceTypeEnum.optional(),
  vatRate: z.number().optional(),
  deliveryDate: z.coerce.date().optional(),
  confirmedDate: z.coerce.date().optional(),
})

const updatePositionInput = z.object({
  id: z.string().uuid(),
  description: z.string().optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  unitPrice: z.number().optional(),
  flatCosts: z.number().optional(),
  priceType: priceTypeEnum.optional(),
  vatRate: z.number().optional(),
  deliveryDate: z.coerce.date().nullable().optional(),
  confirmedDate: z.coerce.date().nullable().optional(),
})

const reorderInput = z.object({
  documentId: z.string().uuid(),
  positionIds: z.array(z.string().uuid()),
})

// --- Router ---
export const billingDocumentsRouter = createTRPCRouter({
  // Document CRUD
  list: billingProcedure
    .use(requirePermission(BILLING_VIEW))
    .input(listInput)
    .query(async ({ ctx, input }) => {
      try {
        return await billingDocService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: billingProcedure
    .use(requirePermission(BILLING_VIEW))
    .input(idInput)
    .query(async ({ ctx, input }) => {
      try {
        return await billingDocService.getById(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: billingProcedure
    .use(requirePermission(BILLING_CREATE))
    .input(createInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await billingDocService.create(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          ctx.user!.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  update: billingProcedure
    .use(requirePermission(BILLING_EDIT))
    .input(updateInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await billingDocService.update(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  delete: billingProcedure
    .use(requirePermission(BILLING_DELETE))
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      try {
        await billingDocService.remove(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  // Workflow
  finalize: billingProcedure
    .use(requirePermission(BILLING_FINALIZE))
    .input(z.object({
      id: z.string().uuid(),
      orderName: z.string().optional(),
      orderDescription: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const orderParams = input.orderName
          ? { orderName: input.orderName, orderDescription: input.orderDescription }
          : undefined
        return await billingDocService.finalize(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          ctx.user!.id,
          orderParams
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  forward: billingProcedure
    .use(requirePermission(BILLING_CREATE))
    .input(forwardInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await billingDocService.forward(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          input.targetType as Parameters<typeof billingDocService.forward>[3],
          ctx.user!.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  cancel: billingProcedure
    .use(requirePermission(BILLING_EDIT))
    .input(cancelInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await billingDocService.cancel(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          input.reason
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  duplicate: billingProcedure
    .use(requirePermission(BILLING_CREATE))
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await billingDocService.duplicate(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          ctx.user!.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  generatePdf: billingProcedure
    .use(requirePermission(BILLING_VIEW))
    .input(idInput)
    .query(async ({ ctx, input }) => {
      try {
        return await billingPdfService.generatePdf(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  downloadPdf: billingProcedure
    .use(requirePermission(BILLING_VIEW))
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await billingPdfService.generateAndGetDownloadUrl(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        console.error("downloadPdf error:", err)
        handleServiceError(err)
      }
    }),

  // Position sub-procedures
  positions: createTRPCRouter({
    list: billingProcedure
      .use(requirePermission(BILLING_VIEW))
      .input(z.object({ documentId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        try {
          return await billingDocService.listPositions(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.documentId
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    add: billingProcedure
      .use(requirePermission(BILLING_EDIT))
      .input(addPositionInput)
      .mutation(async ({ ctx, input }) => {
        try {
          return await billingDocService.addPosition(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    update: billingProcedure
      .use(requirePermission(BILLING_EDIT))
      .input(updatePositionInput)
      .mutation(async ({ ctx, input }) => {
        try {
          return await billingDocService.updatePosition(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    delete: billingProcedure
      .use(requirePermission(BILLING_EDIT))
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        try {
          await billingDocService.deletePosition(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.id
          )
          return { success: true }
        } catch (err) {
          handleServiceError(err)
        }
      }),

    reorder: billingProcedure
      .use(requirePermission(BILLING_EDIT))
      .input(reorderInput)
      .mutation(async ({ ctx, input }) => {
        try {
          return await billingDocService.reorderPositions(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.documentId,
            input.positionIds
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),
  }),
})
