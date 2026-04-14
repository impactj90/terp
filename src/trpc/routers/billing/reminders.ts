/**
 * Reminders Router (Mahnwesen)
 *
 * Thin tRPC wrapper over the reminder service + repository. All
 * business logic lives in `src/lib/services/reminder-*`. This file
 * only does input validation, permission checks, and error mapping.
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as reminderService from "@/lib/services/reminder-service"
import * as reminderRepo from "@/lib/services/reminder-repository"
import * as reminderEligibilityService from "@/lib/services/reminder-eligibility-service"
import * as reminderSettingsService from "@/lib/services/reminder-settings-service"
import * as reminderTemplateService from "@/lib/services/reminder-template-service"
import * as reminderPdfService from "@/lib/services/reminder-pdf-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const DUNNING_VIEW = permissionIdByKey("dunning.view")!
const DUNNING_CREATE = permissionIdByKey("dunning.create")!
const DUNNING_SEND = permissionIdByKey("dunning.send")!
const DUNNING_CANCEL = permissionIdByKey("dunning.cancel")!
const DUNNING_SETTINGS = permissionIdByKey("dunning.settings")!

// --- Base procedure with module guard ---
const dunningProcedure = tenantProcedure.use(requireModule("billing"))

// --- Input Schemas ---

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const uuid = z.string().regex(UUID_RE, "Invalid UUID")

const idInput = z.object({ id: uuid })

const settingsUpdateInput = z.object({
  enabled: z.boolean().optional(),
  maxLevel: z.number().int().min(1).max(4).optional(),
  gracePeriodDays: z.array(z.number().int().min(0).max(365)).optional(),
  feeAmounts: z.array(z.number().min(0).max(99999)).optional(),
  interestEnabled: z.boolean().optional(),
  interestRatePercent: z.number().min(0).max(100).optional(),
  feesEnabled: z.boolean().optional(),
})

const templateCreateInput = z.object({
  name: z.string().min(1).max(255),
  level: z.number().int().min(1).max(4),
  headerText: z.string().max(20000).optional(),
  footerText: z.string().max(20000).optional(),
  emailSubject: z.string().max(255).optional(),
  emailBody: z.string().max(20000).optional(),
  isDefault: z.boolean().optional(),
})

const templateUpdateInput = z.object({
  id: uuid,
  name: z.string().min(1).max(255).optional(),
  level: z.number().int().min(1).max(4).optional(),
  headerText: z.string().max(20000).optional(),
  footerText: z.string().max(20000).optional(),
  emailSubject: z.string().max(255).optional(),
  emailBody: z.string().max(20000).optional(),
  isDefault: z.boolean().optional(),
})

const createRunInput = z.object({
  groups: z
    .array(
      z.object({
        customerAddressId: uuid,
        billingDocumentIds: z.array(uuid).min(1),
      })
    )
    .min(1),
})

const sendInput = z.object({ id: uuid })

const markSentManuallyInput = z.object({
  id: uuid,
  method: z.enum(["letter", "manual"]),
})

const cancelInput = z.object({
  id: uuid,
  reason: z.string().max(500).optional(),
})

const setInvoiceBlockInput = z.object({
  billingDocumentId: uuid,
  blocked: z.boolean(),
  reason: z.string().max(500).optional(),
})

const setCustomerBlockInput = z.object({
  customerAddressId: uuid,
  blocked: z.boolean(),
  reason: z.string().max(500).optional(),
})

const listRunsInput = z.object({
  status: z.enum(["DRAFT", "SENT", "CANCELLED", "ALL"]).optional(),
})

// --- Router ---

export const remindersRouter = createTRPCRouter({
  // --- Eligibility / Proposal ---

  getEligibleProposal: dunningProcedure
    .use(requirePermission(DUNNING_VIEW))
    .query(async ({ ctx }) => {
      try {
        return await reminderEligibilityService.listEligibleInvoices(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  // --- Settings ---

  getSettings: dunningProcedure
    .use(requirePermission(DUNNING_VIEW))
    .query(async ({ ctx }) => {
      try {
        return await reminderSettingsService.getSettings(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  updateSettings: dunningProcedure
    .use(requirePermission(DUNNING_SETTINGS))
    .input(settingsUpdateInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await reminderSettingsService.updateSettings(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
        // Seed default templates the first time dunning is enabled —
        // idempotent, no-op if any template already exists.
        if (input.enabled === true) {
          await reminderTemplateService.seedDefaultsForTenant(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!
          )
        }
        return result
      } catch (err) {
        handleServiceError(err)
      }
    }),

  // --- Templates ---

  listTemplates: dunningProcedure
    .use(requirePermission(DUNNING_VIEW))
    .query(async ({ ctx }) => {
      try {
        return await reminderTemplateService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getTemplate: dunningProcedure
    .use(requirePermission(DUNNING_VIEW))
    .input(idInput)
    .query(async ({ ctx, input }) => {
      try {
        return await reminderTemplateService.getById(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  createTemplate: dunningProcedure
    .use(requirePermission(DUNNING_SETTINGS))
    .input(templateCreateInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await reminderTemplateService.create(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          ctx.user!.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  updateTemplate: dunningProcedure
    .use(requirePermission(DUNNING_SETTINGS))
    .input(templateUpdateInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const { id, ...rest } = input
        return await reminderTemplateService.update(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          id,
          rest
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  deleteTemplate: dunningProcedure
    .use(requirePermission(DUNNING_SETTINGS))
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      try {
        await reminderTemplateService.remove(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  seedDefaultTemplates: dunningProcedure
    .use(requirePermission(DUNNING_SETTINGS))
    .mutation(async ({ ctx }) => {
      try {
        return await reminderTemplateService.seedDefaultsForTenant(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  // --- Runs ---

  createRun: dunningProcedure
    .use(requirePermission(DUNNING_CREATE))
    .input(createRunInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await reminderService.createRun(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          ctx.user!.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  listRuns: dunningProcedure
    .use(requirePermission(DUNNING_VIEW))
    .input(listRunsInput)
    .query(async ({ ctx, input }) => {
      try {
        const status =
          input.status && input.status !== "ALL" ? input.status : undefined
        return await reminderRepo.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          { status }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getRun: dunningProcedure
    .use(requirePermission(DUNNING_VIEW))
    .input(idInput)
    .query(async ({ ctx, input }) => {
      try {
        return await reminderService.getReminderForView(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  // --- Sending ---

  send: dunningProcedure
    .use(requirePermission(DUNNING_SEND))
    .input(sendInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await reminderService.sendReminder(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          ctx.user!.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  markSentManually: dunningProcedure
    .use(requirePermission(DUNNING_SEND))
    .input(markSentManuallyInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await reminderService.markSentManually(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          input.method,
          ctx.user!.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  cancel: dunningProcedure
    .use(requirePermission(DUNNING_CANCEL))
    .input(cancelInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await reminderService.cancelReminderWithSideEffects(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          input.reason ?? null,
          ctx.user!.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  // --- PDF ---

  getPdfDownloadUrl: dunningProcedure
    .use(requirePermission(DUNNING_VIEW))
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await reminderPdfService.getSignedDownloadUrl(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  generatePdfPreview: dunningProcedure
    .use(requirePermission(DUNNING_VIEW))
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const prisma = ctx.prisma as unknown as PrismaClient
        const path = await reminderPdfService.generateAndStorePdf(
          prisma,
          ctx.tenantId!,
          input.id
        )
        // Draft reminders never persist pdfStoragePath — look the number up
        // directly so the signed URL can be built without a DB roundtrip on
        // the stored path.
        const reminder = await prisma.reminder.findFirst({
          where: { id: input.id, tenantId: ctx.tenantId! },
          select: { number: true },
        })
        if (!reminder) return null
        return await reminderPdfService.getSignedDownloadUrlForPath(
          path,
          reminder.number
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  // --- Blocks ---

  setInvoiceBlock: dunningProcedure
    .use(requirePermission(DUNNING_CANCEL))
    .input(setInvoiceBlockInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await reminderService.setInvoiceBlock(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.billingDocumentId,
          input.blocked,
          input.reason ?? null,
          ctx.user!.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  setCustomerBlock: dunningProcedure
    .use(requirePermission(DUNNING_CANCEL))
    .input(setCustomerBlockInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await reminderService.setCustomerBlock(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.customerAddressId,
          input.blocked,
          input.reason ?? null,
          ctx.user!.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
