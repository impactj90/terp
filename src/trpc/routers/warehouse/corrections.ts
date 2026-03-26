/**
 * Warehouse Corrections Router
 *
 * tRPC procedures for warehouse correction assistant.
 * All procedures require warehouse module and appropriate permissions.
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as whCorrectionService from "@/lib/services/wh-correction-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const WH_CORRECTIONS_VIEW = permissionIdByKey("wh_corrections.view")!
const WH_CORRECTIONS_MANAGE = permissionIdByKey("wh_corrections.manage")!
const WH_CORRECTIONS_RUN = permissionIdByKey("wh_corrections.run")!

// --- Base procedure with module guard ---
const whProcedure = tenantProcedure.use(requireModule("warehouse"))

// --- Sub-routers ---

const messagesRouter = createTRPCRouter({
  list: whProcedure
    .use(requirePermission(WH_CORRECTIONS_VIEW))
    .input(
      z.object({
        status: z.enum(["OPEN", "RESOLVED", "DISMISSED", "IGNORED"]).optional(),
        severity: z.enum(["ERROR", "WARNING", "INFO"]).optional(),
        code: z.string().optional(),
        articleId: z.string().uuid().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await whCorrectionService.listMessages(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: whProcedure
    .use(requirePermission(WH_CORRECTIONS_VIEW))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await whCorrectionService.getMessageById(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  resolve: whProcedure
    .use(requirePermission(WH_CORRECTIONS_MANAGE))
    .input(z.object({
      id: z.string().uuid(),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await whCorrectionService.resolveMessage(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          ctx.user!.id,
          input.note
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  dismiss: whProcedure
    .use(requirePermission(WH_CORRECTIONS_MANAGE))
    .input(z.object({
      id: z.string().uuid(),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await whCorrectionService.dismissMessage(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          ctx.user!.id,
          input.note
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  resolveBulk: whProcedure
    .use(requirePermission(WH_CORRECTIONS_MANAGE))
    .input(z.object({
      ids: z.array(z.string().uuid()).min(1).max(100),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await whCorrectionService.resolveBulk(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.ids,
          ctx.user!.id,
          input.note
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})

const runsRouter = createTRPCRouter({
  list: whProcedure
    .use(requirePermission(WH_CORRECTIONS_VIEW))
    .input(z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(10),
    }))
    .query(async ({ ctx, input }) => {
      try {
        return await whCorrectionService.listRuns(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  trigger: whProcedure
    .use(requirePermission(WH_CORRECTIONS_RUN))
    .mutation(async ({ ctx }) => {
      try {
        return await whCorrectionService.runCorrectionChecks(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          ctx.user!.id,
          "MANUAL"
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})

// --- Main Router ---

export const whCorrectionsRouter = createTRPCRouter({
  messages: messagesRouter,
  runs: runsRouter,
  summary: whProcedure
    .use(requirePermission(WH_CORRECTIONS_VIEW))
    .query(async ({ ctx }) => {
      try {
        return await whCorrectionService.getSummary(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
