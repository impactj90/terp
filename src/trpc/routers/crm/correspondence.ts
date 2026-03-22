import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as crmCorrespondenceService from "@/lib/services/crm-correspondence-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const CORR_VIEW = permissionIdByKey("crm_correspondence.view")!
const CORR_CREATE = permissionIdByKey("crm_correspondence.create")!
const CORR_EDIT = permissionIdByKey("crm_correspondence.edit")!
const CORR_DELETE = permissionIdByKey("crm_correspondence.delete")!

// --- Base procedure with module guard ---
const crmProcedure = tenantProcedure.use(requireModule("crm"))

// --- Input Schemas ---
const listInput = z.object({
  addressId: z.string().uuid().optional(),
  inquiryId: z.string().uuid().optional(),
  search: z.string().max(255).optional(),
  direction: z.enum(["INCOMING", "OUTGOING", "INTERNAL"]).optional(),
  type: z.string().max(255).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})

const createInput = z.object({
  addressId: z.string().uuid(),
  direction: z.enum(["INCOMING", "OUTGOING", "INTERNAL"]),
  type: z.string().min(1).max(255),
  date: z.coerce.date(),
  contactId: z.string().uuid().optional(),
  inquiryId: z.string().uuid().optional(),
  fromUser: z.string().max(255).optional(),
  toUser: z.string().max(255).optional(),
  subject: z.string().min(1).max(255),
  content: z.string().max(2000).optional(),
  attachments: z.array(z.object({
    name: z.string().max(255),
    url: z.string().url(),
    size: z.number().min(0).max(52428800),
    mimeType: z.string().max(255),
  })).optional(),
})

const updateInput = z.object({
  id: z.string().uuid(),
  direction: z.enum(["INCOMING", "OUTGOING", "INTERNAL"]).optional(),
  type: z.string().min(1).max(255).optional(),
  date: z.coerce.date().optional(),
  contactId: z.string().uuid().nullable().optional(),
  inquiryId: z.string().uuid().nullable().optional(),
  fromUser: z.string().max(255).nullable().optional(),
  toUser: z.string().max(255).nullable().optional(),
  subject: z.string().min(1).max(255).optional(),
  content: z.string().max(2000).nullable().optional(),
  attachments: z.array(z.object({
    name: z.string().max(255),
    url: z.string().url(),
    size: z.number().min(0).max(52428800),
    mimeType: z.string().max(255),
  })).nullable().optional(),
})

// --- Router ---
export const crmCorrespondenceRouter = createTRPCRouter({
  list: crmProcedure
    .use(requirePermission(CORR_VIEW))
    .input(listInput)
    .query(async ({ ctx, input }) => {
      try {
        return await crmCorrespondenceService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: crmProcedure
    .use(requirePermission(CORR_VIEW))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await crmCorrespondenceService.getById(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: crmProcedure
    .use(requirePermission(CORR_CREATE))
    .input(createInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await crmCorrespondenceService.create(
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
    .use(requirePermission(CORR_EDIT))
    .input(updateInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await crmCorrespondenceService.update(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  delete: crmProcedure
    .use(requirePermission(CORR_DELETE))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await crmCorrespondenceService.remove(
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
