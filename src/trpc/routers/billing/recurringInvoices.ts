import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as recurringService from "@/lib/services/billing-recurring-invoice-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const REC_VIEW = permissionIdByKey("billing_recurring.view")!
const REC_MANAGE = permissionIdByKey("billing_recurring.manage")!
const REC_GENERATE = permissionIdByKey("billing_recurring.generate")!

// --- Base procedure with module guard ---
const billingProcedure = tenantProcedure.use(requireModule("billing"))

// --- Input Schemas ---

// Relaxed UUID: Zod v4's z.string().uuid() rejects non-standard UUIDs (version=0)
// used in seed data. Use regex to accept any 8-4-4-4-12 hex string.
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const uuid = z.string().regex(UUID_RE, "Invalid UUID")

const listInput = z.object({
  isActive: z.boolean().optional(),
  addressId: uuid.optional(),
  search: z.string().max(255).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})

const positionTemplateSchema = z.array(z.object({
  type: z.enum(["ARTICLE", "FREE", "TEXT"]),
  articleId: uuid.optional(),
  articleNumber: z.string().max(255).optional(),
  description: z.string().max(2000).optional(),
  quantity: z.number().min(0).max(999999).optional(),
  unit: z.string().max(255).optional(),
  unitPrice: z.number().min(-999999999.99).max(999999999.99).optional(),
  flatCosts: z.number().min(-999999999.99).max(999999999.99).optional(),
  vatRate: z.number().min(0).max(100).optional(),
}))

const servicePeriodModeEnum = z.enum(["IN_ARREARS", "IN_ADVANCE"])

const createInput = z.object({
  name: z.string().min(1).max(255),
  addressId: uuid,
  contactId: uuid.optional(),
  interval: z.enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUALLY", "ANNUALLY"]),
  servicePeriodMode: servicePeriodModeEnum.optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  autoGenerate: z.boolean().optional(),
  deliveryType: z.string().max(100).optional(),
  deliveryTerms: z.string().max(100).optional(),
  paymentTermDays: z.number().int().min(0).max(365).optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  discountDays: z.number().int().min(0).max(365).optional(),
  notes: z.string().max(2000).optional(),
  internalNotes: z.string().max(2000).optional(),
  positionTemplate: positionTemplateSchema,
})

const updateInput = z.object({
  id: uuid,
  name: z.string().min(1).max(255).optional(),
  contactId: uuid.nullable().optional(),
  interval: z.enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUALLY", "ANNUALLY"]).optional(),
  servicePeriodMode: servicePeriodModeEnum.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().nullable().optional(),
  autoGenerate: z.boolean().optional(),
  deliveryType: z.string().max(100).nullable().optional(),
  deliveryTerms: z.string().max(100).nullable().optional(),
  paymentTermDays: z.number().int().min(0).max(365).nullable().optional(),
  discountPercent: z.number().min(0).max(100).nullable().optional(),
  discountDays: z.number().int().min(0).max(365).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  internalNotes: z.string().max(2000).nullable().optional(),
  positionTemplate: positionTemplateSchema.optional(),
})

const idInput = z.object({ id: uuid })

// --- Router ---
export const billingRecurringInvoicesRouter = createTRPCRouter({
  list: billingProcedure
    .use(requirePermission(REC_VIEW))
    .input(listInput)
    .query(async ({ ctx, input }) => {
      try {
        return await recurringService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: billingProcedure
    .use(requirePermission(REC_VIEW))
    .input(idInput)
    .query(async ({ ctx, input }) => {
      try {
        return await recurringService.getById(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: billingProcedure
    .use(requirePermission(REC_MANAGE))
    .input(createInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await recurringService.create(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          ctx.user!.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  update: billingProcedure
    .use(requirePermission(REC_MANAGE))
    .input(updateInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await recurringService.update(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  delete: billingProcedure
    .use(requirePermission(REC_MANAGE))
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      try {
        await recurringService.remove(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  activate: billingProcedure
    .use(requirePermission(REC_MANAGE))
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await recurringService.activate(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  deactivate: billingProcedure
    .use(requirePermission(REC_MANAGE))
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await recurringService.deactivate(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  generate: billingProcedure
    .use(requirePermission(REC_GENERATE))
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await recurringService.generate(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          ctx.user!.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  generateDue: billingProcedure
    .use(requirePermission(REC_GENERATE))
    .mutation(async ({ ctx }) => {
      try {
        return await recurringService.generateDue(
          ctx.prisma as unknown as PrismaClient
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  preview: billingProcedure
    .use(requirePermission(REC_VIEW))
    .input(idInput)
    .query(async ({ ctx, input }) => {
      try {
        return await recurringService.preview(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
