import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { requireModule } from "@/lib/modules"
import { handleServiceError } from "@/trpc/errors"
import * as imapConfigService from "@/lib/services/email-imap-config-service"

const IMAP_VIEW = permissionIdByKey("email_imap.view")!
const IMAP_MANAGE = permissionIdByKey("email_imap.manage")!

const invProcedure = tenantProcedure.use(requireModule("inbound_invoices"))

// --- Input Schemas ---

const upsertInputSchema = z.object({
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  username: z.string().max(255).default(""),
  password: z.string().max(500).optional(),
  encryption: z.enum(["SSL", "STARTTLS", "NONE"]),
  mailbox: z.string().max(255).default("INBOX"),
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
    mailbox: config.mailbox as string,
    isVerified: config.isVerified as boolean,
    verifiedAt: (config.verifiedAt as Date | null) ?? null,
    lastPollAt: (config.lastPollAt as Date | null) ?? null,
    consecutiveFailures: config.consecutiveFailures as number,
    lastPollError: (config.lastPollError as string | null) ?? null,
    isActive: config.isActive as boolean,
    hasPassword: !!(config.password as string),
    createdAt: config.createdAt as Date,
    updatedAt: config.updatedAt as Date,
  }
}

// --- Router ---

export const imapConfigRouter = createTRPCRouter({
  get: invProcedure
    .use(requirePermission(IMAP_VIEW))
    .query(async ({ ctx }) => {
      try {
        const config = await imapConfigService.get(ctx.prisma, ctx.tenantId!)
        return config ? mapToOutput(config as unknown as Record<string, unknown>) : null
      } catch (err) {
        handleServiceError(err)
      }
    }),

  upsert: invProcedure
    .use(requirePermission(IMAP_MANAGE))
    .input(upsertInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await imapConfigService.upsert(
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

  testConnection: invProcedure
    .use(requirePermission(IMAP_MANAGE))
    .mutation(async ({ ctx }) => {
      try {
        return await imapConfigService.testConnection(ctx.prisma, ctx.tenantId!)
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
