import { z } from "zod"
import type { PrismaClient } from "@/generated/prisma/client"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { requireModule } from "@/lib/modules"
import { handleServiceError } from "@/trpc/errors"
import * as inboundInvoiceService from "@/lib/services/inbound-invoice-service"
import * as approvalService from "@/lib/services/inbound-invoice-approval-service"
import * as approvalRepo from "@/lib/services/inbound-invoice-approval-repository"
import * as datevExportService from "@/lib/services/inbound-invoice-datev-export-service"

// --- Permission Constants ---

const VIEW = permissionIdByKey("inbound_invoices.view")!
const UPLOAD = permissionIdByKey("inbound_invoices.upload")!
const EDIT = permissionIdByKey("inbound_invoices.edit")!
const APPROVE = permissionIdByKey("inbound_invoices.approve")!
const EXPORT = permissionIdByKey("inbound_invoices.export")!
const MANAGE = permissionIdByKey("inbound_invoices.manage")!

// --- Base procedure with module guard ---

const invProcedure = tenantProcedure.use(requireModule("inbound_invoices"))

// --- Input Schemas ---

const listSchema = z.object({
  status: z.string().optional(),
  supplierId: z.string().uuid().optional(),
  supplierStatus: z.string().optional(),
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})

const createFromUploadSchema = z.object({
  fileBase64: z.string().min(1),
  filename: z.string().min(1).max(255),
})

const updateSchema = z.object({
  id: z.string().uuid(),
  invoiceNumber: z.string().max(100).optional(),
  invoiceDate: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  totalNet: z.number().nullable().optional(),
  totalVat: z.number().nullable().optional(),
  totalGross: z.number().nullable().optional(),
  paymentTermDays: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
})

const lineItemSchema = z.object({
  position: z.number().int().optional(),
  articleNumber: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  quantity: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  unitPriceNet: z.number().nullable().optional(),
  totalNet: z.number().nullable().optional(),
  vatRate: z.number().nullable().optional(),
  vatAmount: z.number().nullable().optional(),
  totalGross: z.number().nullable().optional(),
  sortOrder: z.number().int().optional(),
})

const lineItemsSchema = z.object({
  invoiceId: z.string().uuid(),
  items: z.array(lineItemSchema),
})

const assignSupplierSchema = z.object({
  id: z.string().uuid(),
  supplierId: z.string().uuid(),
})

// --- Router ---

export const inboundInvoiceRouter = createTRPCRouter({
  list: invProcedure
    .use(requirePermission(VIEW))
    .input(listSchema)
    .query(async ({ ctx, input }) => {
      try {
        const { page, pageSize, ...filters } = input
        return await inboundInvoiceService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          filters,
          { page, pageSize }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: invProcedure
    .use(requirePermission(VIEW))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await inboundInvoiceService.getById(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getUploadUrl: invProcedure
    .use(requirePermission(UPLOAD))
    .mutation(async ({ ctx }) => {
      try {
        return await inboundInvoiceService.getUploadUrl(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  createFromUpload: invProcedure
    .use(requirePermission(UPLOAD))
    .input(createFromUploadSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const fileBuffer = Buffer.from(input.fileBase64, "base64")
        return await inboundInvoiceService.createFromUpload(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          fileBuffer,
          input.filename,
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

  update: invProcedure
    .use(requirePermission(EDIT))
    .input(updateSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const { id, ...data } = input
        // Convert date strings to Date objects
        const updateData: Record<string, unknown> = { ...data }
        if (data.invoiceDate !== undefined) {
          updateData.invoiceDate = data.invoiceDate ? new Date(data.invoiceDate) : null
        }
        if (data.dueDate !== undefined) {
          updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null
        }

        return await inboundInvoiceService.update(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          id,
          updateData,
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

  updateLineItems: invProcedure
    .use(requirePermission(EDIT))
    .input(lineItemsSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        await inboundInvoiceService.updateLineItems(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.invoiceId,
          input.items,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          }
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  assignSupplier: invProcedure
    .use(requirePermission(EDIT))
    .input(assignSupplierSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await inboundInvoiceService.assignSupplier(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          input.supplierId,
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

  submitForApproval: invProcedure
    .use(requirePermission(EDIT))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await inboundInvoiceService.submitForApproval(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
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

  reopenExported: invProcedure
    .use(requirePermission(MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await inboundInvoiceService.reopenExported(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
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

  cancel: invProcedure
    .use(requirePermission(MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await inboundInvoiceService.cancel(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          }
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  remove: invProcedure
    .use(requirePermission(MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await inboundInvoiceService.remove(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          }
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getPdfUrl: invProcedure
    .use(requirePermission(VIEW))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await inboundInvoiceService.getPdfSignedUrl(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  // --- Approval Procedures ---

  approve: invProcedure
    .use(requirePermission(APPROVE))
    .input(z.object({
      invoiceId: z.string().uuid(),
      approvalId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await approvalService.approve(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.invoiceId,
          input.approvalId,
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

  reject: invProcedure
    .use(requirePermission(APPROVE))
    .input(z.object({
      invoiceId: z.string().uuid(),
      approvalId: z.string().uuid(),
      reason: z.string().min(1).max(1000),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await approvalService.reject(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.invoiceId,
          input.approvalId,
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

  pendingApprovals: invProcedure
    .use(requirePermission(APPROVE))
    .query(async ({ ctx }) => {
      try {
        return await approvalRepo.findPendingForUser(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          ctx.user!.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  approvalHistory: invProcedure
    .use(requirePermission(VIEW))
    .input(z.object({ invoiceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await approvalRepo.findByInvoiceId(
          ctx.prisma as unknown as PrismaClient,
          input.invoiceId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  // --- DATEV Export ---

  exportDatev: invProcedure
    .use(requirePermission(EXPORT))
    .input(z.object({
      invoiceIds: z.array(z.string().uuid()).optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await datevExportService.exportToCsv(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          {
            invoiceIds: input.invoiceIds,
            dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined,
            dateTo: input.dateTo ? new Date(input.dateTo) : undefined,
          },
          ctx.user!.id,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          }
        )
        return {
          csv: result.csv.toString("base64"),
          filename: result.filename,
          count: result.count,
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
