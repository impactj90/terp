import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as serviceCaseService from "@/lib/services/billing-service-case-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const SC_VIEW = permissionIdByKey("billing_service_cases.view")!
const SC_CREATE = permissionIdByKey("billing_service_cases.create")!
const SC_EDIT = permissionIdByKey("billing_service_cases.edit")!
const SC_DELETE = permissionIdByKey("billing_service_cases.delete")!

// --- Base procedure with module guard ---
const billingProcedure = tenantProcedure.use(requireModule("billing"))

// --- Input Schemas ---
const serviceCaseStatusEnum = z.enum(["OPEN", "IN_PROGRESS", "CLOSED", "INVOICED"])

// Relaxed UUID: Zod v4's z.string().uuid() rejects non-standard UUIDs (version=0)
// used in seed data. Use regex to accept any 8-4-4-4-12 hex string.
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const uuid = z.string().regex(UUID_RE, "Invalid UUID")
const optionalUuid = uuid.optional()
const nullableUuid = uuid.nullable().optional()

const listInput = z.object({
  status: serviceCaseStatusEnum.optional(),
  addressId: optionalUuid,
  assignedToId: optionalUuid,
  search: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})

const createInput = z.object({
  title: z.string().min(1).max(255),
  addressId: uuid,
  contactId: optionalUuid,
  inquiryId: optionalUuid,
  description: z.string().optional(),
  assignedToId: optionalUuid,
  customerNotifiedCost: z.boolean().optional(),
  reportedAt: z.coerce.date().optional(),
})

const updateInput = z.object({
  id: uuid,
  title: z.string().min(1).max(255).optional(),
  contactId: nullableUuid,
  description: z.string().nullable().optional(),
  assignedToId: nullableUuid,
  customerNotifiedCost: z.boolean().optional(),
})

const idInput = z.object({ id: uuid })

const closeInput = z.object({
  id: uuid,
  closingReason: z.string().min(1),
})

const createInvoiceInput = z.object({
  id: uuid,
  positions: z.array(z.object({
    description: z.string(),
    quantity: z.number().optional(),
    unit: z.string().optional(),
    unitPrice: z.number().optional(),
    flatCosts: z.number().optional(),
    vatRate: z.number().optional(),
  })).min(1),
})

const createOrderInput = z.object({
  id: uuid,
  orderName: z.string().optional(),
  orderDescription: z.string().optional(),
})

// --- Router ---
export const billingServiceCasesRouter = createTRPCRouter({
  list: billingProcedure
    .use(requirePermission(SC_VIEW))
    .input(listInput)
    .query(async ({ ctx, input }) => {
      try {
        return await serviceCaseService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: billingProcedure
    .use(requirePermission(SC_VIEW))
    .input(idInput)
    .query(async ({ ctx, input }) => {
      try {
        return await serviceCaseService.getById(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: billingProcedure
    .use(requirePermission(SC_CREATE))
    .input(createInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await serviceCaseService.create(
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
    .use(requirePermission(SC_EDIT))
    .input(updateInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await serviceCaseService.update(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  close: billingProcedure
    .use(requirePermission(SC_EDIT))
    .input(closeInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await serviceCaseService.close(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          input.closingReason,
          ctx.user!.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  createInvoice: billingProcedure
    .use(requirePermission(SC_EDIT))
    .input(createInvoiceInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await serviceCaseService.createInvoice(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          input.positions,
          ctx.user!.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  createOrder: billingProcedure
    .use(requirePermission(SC_EDIT))
    .input(createOrderInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await serviceCaseService.createOrder(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          { orderName: input.orderName, orderDescription: input.orderDescription },
          ctx.user!.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  delete: billingProcedure
    .use(requirePermission(SC_DELETE))
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      try {
        await serviceCaseService.remove(
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
})
