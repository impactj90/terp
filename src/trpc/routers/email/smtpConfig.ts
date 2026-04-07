import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as smtpConfigService from "@/lib/services/email-smtp-config-service"

const EMAIL_SMTP_VIEW = permissionIdByKey("email_smtp.view")!
const EMAIL_SMTP_MANAGE = permissionIdByKey("email_smtp.manage")!

// --- Input Schemas ---

const upsertInputSchema = z.object({
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  username: z.string().max(255).default(""),
  password: z.string().max(500).optional(),
  encryption: z.enum(["STARTTLS", "SSL", "NONE"]),
  fromEmail: z.string().email().max(255),
  fromName: z.string().max(255).nullish(),
  replyToEmail: z.string().email().max(255).nullish(),
})

// --- Helpers ---

function mapToOutput(config: Record<string, unknown>) {
  return {
    id: config.id as string,
    tenantId: config.tenantId as string,
    host: config.host as string,
    port: config.port as number,
    username: config.username as string,
    encryption: config.encryption as string,
    fromEmail: config.fromEmail as string,
    fromName: (config.fromName as string | null) ?? null,
    replyToEmail: (config.replyToEmail as string | null) ?? null,
    isVerified: config.isVerified as boolean,
    verifiedAt: (config.verifiedAt as Date | null) ?? null,
    hasPassword: !!(config.password as string),
    createdAt: config.createdAt as Date,
    updatedAt: config.updatedAt as Date,
  }
}

// --- Router ---

export const emailSmtpConfigRouter = createTRPCRouter({
  get: tenantProcedure
    .use(requirePermission(EMAIL_SMTP_VIEW))
    .query(async ({ ctx }) => {
      try {
        const config = await smtpConfigService.get(ctx.prisma, ctx.tenantId!)
        return config ? mapToOutput(config as unknown as Record<string, unknown>) : null
      } catch (err) {
        handleServiceError(err)
      }
    }),

  upsert: tenantProcedure
    .use(requirePermission(EMAIL_SMTP_MANAGE))
    .input(upsertInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await smtpConfigService.upsert(
          ctx.prisma,
          ctx.tenantId!,
          input,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          }
        )
        return mapToOutput(result as unknown as Record<string, unknown>)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  testConnection: tenantProcedure
    .use(requirePermission(EMAIL_SMTP_MANAGE))
    .mutation(async ({ ctx }) => {
      try {
        return await smtpConfigService.testConnection(ctx.prisma, ctx.tenantId!)
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
