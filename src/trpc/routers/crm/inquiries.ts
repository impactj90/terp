import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as crmInquiryService from "@/lib/services/crm-inquiry-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const INQ_VIEW = permissionIdByKey("crm_inquiries.view")!
const INQ_CREATE = permissionIdByKey("crm_inquiries.create")!
const INQ_EDIT = permissionIdByKey("crm_inquiries.edit")!
const INQ_DELETE = permissionIdByKey("crm_inquiries.delete")!

// --- Base procedure with module guard ---
const crmProcedure = tenantProcedure.use(requireModule("crm"))

// --- Input Schemas ---
const listInput = z.object({
  addressId: z.string().uuid().optional(),
  search: z.string().optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "CLOSED", "CANCELLED"]).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})

const createInput = z.object({
  title: z.string().min(1),
  addressId: z.string().uuid(),
  contactId: z.string().uuid().optional(),
  effort: z.string().optional(),
  notes: z.string().optional(),
})

const updateInput = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).optional(),
  contactId: z.string().uuid().nullable().optional(),
  effort: z.string().nullable().optional(),
  creditRating: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

const closeInput = z.object({
  id: z.string().uuid(),
  closingReason: z.string().optional(),
  closingRemarks: z.string().optional(),
  closeLinkedOrder: z.boolean().optional().default(false),
})

const cancelInput = z.object({
  id: z.string().uuid(),
  reason: z.string().optional(),
})

const idInput = z.object({ id: z.string().uuid() })

const linkOrderInput = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
})

const createOrderInput = z.object({
  id: z.string().uuid(),
  orderName: z.string().optional(),
})

// --- Router ---
export const crmInquiriesRouter = createTRPCRouter({
  list: crmProcedure
    .use(requirePermission(INQ_VIEW))
    .input(listInput)
    .query(async ({ ctx, input }) => {
      try {
        return await crmInquiryService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: crmProcedure
    .use(requirePermission(INQ_VIEW))
    .input(idInput)
    .query(async ({ ctx, input }) => {
      try {
        return await crmInquiryService.getById(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: crmProcedure
    .use(requirePermission(INQ_CREATE))
    .input(createInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await crmInquiryService.create(
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

  update: crmProcedure
    .use(requirePermission(INQ_EDIT))
    .input(updateInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await crmInquiryService.update(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  close: crmProcedure
    .use(requirePermission(INQ_EDIT))
    .input(closeInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await crmInquiryService.close(
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

  cancel: crmProcedure
    .use(requirePermission(INQ_EDIT))
    .input(cancelInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await crmInquiryService.cancel(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          input.reason,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  reopen: crmProcedure
    .use(requirePermission(INQ_EDIT))
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await crmInquiryService.reopen(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  linkOrder: crmProcedure
    .use(requirePermission(INQ_EDIT))
    .input(linkOrderInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await crmInquiryService.linkOrder(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          input.orderId,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  createOrder: crmProcedure
    .use(requirePermission(INQ_EDIT))
    .input(createOrderInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await crmInquiryService.createOrder(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          { orderName: input.orderName },
          ctx.user!.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  delete: crmProcedure
    .use(requirePermission(INQ_DELETE))
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      try {
        await crmInquiryService.remove(
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
