/**
 * HR Personnel File Router
 *
 * tRPC router for personnel file categories, entries, and attachments.
 * No module guard — HR is core functionality.
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as hrService from "@/lib/services/hr-personnel-file-service"
import * as attachmentService from "@/lib/services/hr-personnel-file-attachment-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const PF_VIEW = permissionIdByKey("hr_personnel_file.view")!
const PF_CREATE = permissionIdByKey("hr_personnel_file.create")!
const PF_EDIT = permissionIdByKey("hr_personnel_file.edit")!
const PF_DELETE = permissionIdByKey("hr_personnel_file.delete")!
const PF_CAT_MANAGE = permissionIdByKey("hr_personnel_file_categories.manage")!

// --- Input Schemas ---
const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(50).regex(/^[A-Z_]+$/),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  sortOrder: z.number().int().min(0).optional(),
  visibleToRoles: z.array(z.string()).optional(),
})

const updateCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  code: z.string().min(1).max(50).regex(/^[A-Z_]+$/).optional(),
  description: z.string().max(500).nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  visibleToRoles: z.array(z.string()).optional(),
})

const listEntriesSchema = z.object({
  employeeId: z.string().min(1),
  categoryId: z.string().min(1).optional(),
  search: z.string().max(255).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})

const createEntrySchema = z.object({
  employeeId: z.string().min(1),
  categoryId: z.string().min(1),
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  entryDate: z.coerce.date(),
  expiresAt: z.coerce.date().optional(),
  reminderDate: z.coerce.date().optional(),
  reminderNote: z.string().max(500).optional(),
  isConfidential: z.boolean().optional(),
})

const updateEntrySchema = z.object({
  id: z.string().min(1),
  categoryId: z.string().min(1).optional(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  entryDate: z.coerce.date().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  reminderDate: z.coerce.date().nullable().optional(),
  reminderNote: z.string().max(500).nullable().optional(),
  isConfidential: z.boolean().optional(),
})

const reminderSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})

const expiringSchema = z.object({
  withinDays: z.number().int().min(1).max(365).default(30),
})

const uploadUrlSchema = z.object({
  entryId: z.string().min(1),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
})

const confirmSchema = z.object({
  entryId: z.string().min(1),
  storagePath: z.string().min(1),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().min(1),
})

// --- Router ---
export const hrPersonnelFileRouter = createTRPCRouter({
  categories: createTRPCRouter({
    list: tenantProcedure
      .use(requirePermission(PF_VIEW))
      .query(async ({ ctx }) => {
        try {
          return await hrService.listCategories(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    create: tenantProcedure
      .use(requirePermission(PF_CAT_MANAGE))
      .input(createCategorySchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await hrService.createCategory(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    update: tenantProcedure
      .use(requirePermission(PF_CAT_MANAGE))
      .input(updateCategorySchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await hrService.updateCategory(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    delete: tenantProcedure
      .use(requirePermission(PF_CAT_MANAGE))
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        try {
          await hrService.deleteCategory(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.id
          )
          return { success: true }
        } catch (err) {
          handleServiceError(err)
        }
      }),
  }),

  entries: createTRPCRouter({
    list: tenantProcedure
      .use(requirePermission(PF_VIEW))
      .input(listEntriesSchema)
      .query(async ({ ctx, input }) => {
        try {
          return await hrService.listEntries(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            ctx.user!.id,
            ctx.user!.userGroup ? [ctx.user!.userGroup] : [],
            input
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    getById: tenantProcedure
      .use(requirePermission(PF_VIEW))
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        try {
          return await hrService.getEntryById(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            ctx.user!.id,
            ctx.user!.userGroup ? [ctx.user!.userGroup] : [],
            input.id
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    create: tenantProcedure
      .use(requirePermission(PF_CREATE))
      .input(createEntrySchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await hrService.createEntry(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input,
            ctx.user!.id
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    update: tenantProcedure
      .use(requirePermission(PF_EDIT))
      .input(updateEntrySchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await hrService.updateEntry(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    delete: tenantProcedure
      .use(requirePermission(PF_DELETE))
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        try {
          await hrService.deleteEntry(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.id
          )
          return { success: true }
        } catch (err) {
          handleServiceError(err)
        }
      }),

    getReminders: tenantProcedure
      .use(requirePermission(PF_VIEW))
      .input(reminderSchema)
      .query(async ({ ctx, input }) => {
        try {
          return await hrService.getReminders(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    getExpiring: tenantProcedure
      .use(requirePermission(PF_VIEW))
      .input(expiringSchema)
      .query(async ({ ctx, input }) => {
        try {
          return await hrService.getExpiringEntries(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.withinDays
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),
  }),

  attachments: createTRPCRouter({
    getUploadUrl: tenantProcedure
      .use(requirePermission(PF_CREATE))
      .input(uploadUrlSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await attachmentService.getUploadUrl(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.entryId,
            input.filename,
            input.mimeType
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    confirm: tenantProcedure
      .use(requirePermission(PF_CREATE))
      .input(confirmSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await attachmentService.confirmUpload(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.entryId,
            input.storagePath,
            input.filename,
            input.mimeType,
            input.sizeBytes,
            ctx.user!.id
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    delete: tenantProcedure
      .use(requirePermission(PF_DELETE))
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await attachmentService.deleteAttachment(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.id
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    getDownloadUrl: tenantProcedure
      .use(requirePermission(PF_VIEW))
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        try {
          return await attachmentService.getDownloadUrl(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.id
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),
  }),
})
