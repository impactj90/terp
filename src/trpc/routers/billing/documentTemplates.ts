import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as templateService from "@/lib/services/billing-document-template-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const BILLING_VIEW = permissionIdByKey("billing_documents.view")!
const BILLING_EDIT = permissionIdByKey("billing_documents.edit")!

// --- Base procedure with module guard ---
const billingProcedure = tenantProcedure.use(requireModule("billing"))

// --- Input Schemas ---
const documentTypeEnum = z.enum([
  "OFFER", "ORDER_CONFIRMATION", "DELIVERY_NOTE",
  "SERVICE_NOTE", "RETURN_DELIVERY", "INVOICE", "CREDIT_NOTE",
])

const idInput = z.object({ id: z.string().uuid() })

const createInput = z.object({
  name: z.string().min(1).max(255),
  documentType: documentTypeEnum.nullable().optional(),
  headerText: z.string().nullable().optional(),
  footerText: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
})

const updateInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  documentType: documentTypeEnum.nullable().optional(),
  headerText: z.string().nullable().optional(),
  footerText: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
})

// --- Router ---
export const billingDocumentTemplatesRouter = createTRPCRouter({
  list: billingProcedure
    .use(requirePermission(BILLING_VIEW))
    .query(async ({ ctx }) => {
      try {
        return await templateService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!
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
        return await templateService.getById(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  listByType: billingProcedure
    .use(requirePermission(BILLING_VIEW))
    .input(z.object({ documentType: documentTypeEnum }))
    .query(async ({ ctx, input }) => {
      try {
        return await templateService.listByType(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.documentType
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getDefault: billingProcedure
    .use(requirePermission(BILLING_VIEW))
    .input(z.object({ documentType: documentTypeEnum }))
    .query(async ({ ctx, input }) => {
      try {
        return await templateService.getDefault(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.documentType
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: billingProcedure
    .use(requirePermission(BILLING_EDIT))
    .input(createInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await templateService.create(
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
        const { id, ...data } = input
        return await templateService.update(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          id,
          data
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  delete: billingProcedure
    .use(requirePermission(BILLING_EDIT))
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      try {
        await templateService.remove(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  setDefault: billingProcedure
    .use(requirePermission(BILLING_EDIT))
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await templateService.setDefault(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
