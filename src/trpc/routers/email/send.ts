import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as emailSendService from "@/lib/services/email-send-service"

const DOCUMENTS_SEND = permissionIdByKey("documents.send")!

// --- Input Schemas ---

const sendInputSchema = z.object({
  documentId: z.string().uuid(),
  documentType: z.string(),
  to: z.string().email(),
  cc: z.array(z.string().email()).optional(),
  templateId: z.string().uuid().optional(),
  subject: z.string().min(1).max(500),
  bodyHtml: z.string().min(1),
  attachDefaults: z.boolean().default(true),
})

// --- Router ---

export const emailSendRouter = createTRPCRouter({
  getContext: tenantProcedure
    .use(requirePermission(DOCUMENTS_SEND))
    .input(
      z.object({
        documentId: z.string().uuid(),
        documentType: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await emailSendService.getDocumentEmailContext(
          ctx.prisma,
          ctx.tenantId!,
          input.documentId,
          input.documentType
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  send: tenantProcedure
    .use(requirePermission(DOCUMENTS_SEND))
    .input(sendInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await emailSendService.send(
          ctx.prisma,
          ctx.tenantId!,
          input,
          ctx.user!.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  sendLog: tenantProcedure
    .use(requirePermission(DOCUMENTS_SEND))
    .input(
      z.object({
        documentId: z.string().uuid(),
        page: z.number().default(1),
        pageSize: z.number().default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await emailSendService.getSendLog(
          ctx.prisma,
          ctx.tenantId!,
          input.documentId,
          { page: input.page, pageSize: input.pageSize }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
