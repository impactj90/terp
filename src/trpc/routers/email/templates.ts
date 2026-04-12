import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as emailTemplateService from "@/lib/services/email-template-service"

const EMAIL_TEMPLATES_VIEW = permissionIdByKey("email_templates.view")!
const EMAIL_TEMPLATES_MANAGE = permissionIdByKey("email_templates.manage")!

// --- Input Schemas ---

const listInput = z.object({
  documentType: z.string().optional(),
})

const createInput = z.object({
  documentType: z.string().min(1).max(30),
  name: z.string().min(1).max(255),
  subject: z.string().min(1).max(500),
  bodyHtml: z.string().min(1),
  isDefault: z.boolean().default(false),
})

const updateInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  subject: z.string().min(1).max(500).optional(),
  bodyHtml: z.string().min(1).optional(),
  isDefault: z.boolean().optional(),
  documentType: z.string().min(1).max(30).optional(),
})

// --- Router ---

export const emailTemplateRouter = createTRPCRouter({
  list: tenantProcedure
    .use(requirePermission(EMAIL_TEMPLATES_VIEW))
    .input(listInput)
    .query(async ({ ctx, input }) => {
      try {
        return await emailTemplateService.list(
          ctx.prisma,
          ctx.tenantId!,
          input.documentType
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: tenantProcedure
    .use(requirePermission(EMAIL_TEMPLATES_VIEW))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await emailTemplateService.getById(
          ctx.prisma,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getDefault: tenantProcedure
    .use(requirePermission(EMAIL_TEMPLATES_VIEW))
    .input(z.object({ documentType: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        return await emailTemplateService.getDefault(
          ctx.prisma,
          ctx.tenantId!,
          input.documentType
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: tenantProcedure
    .use(requirePermission(EMAIL_TEMPLATES_MANAGE))
    .input(createInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await emailTemplateService.create(
          ctx.prisma,
          ctx.tenantId!,
          input,
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

  update: tenantProcedure
    .use(requirePermission(EMAIL_TEMPLATES_MANAGE))
    .input(updateInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const { id, ...data } = input
        return await emailTemplateService.update(
          ctx.prisma,
          ctx.tenantId!,
          id,
          data,
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

  remove: tenantProcedure
    .use(requirePermission(EMAIL_TEMPLATES_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await emailTemplateService.remove(
          ctx.prisma,
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

  seedDefaults: tenantProcedure
    .use(requirePermission(EMAIL_TEMPLATES_MANAGE))
    .mutation(async ({ ctx }) => {
      try {
        return await emailTemplateService.seedDefaults(
          ctx.prisma,
          ctx.tenantId!
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
