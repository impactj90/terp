import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as numberSequenceService from "@/lib/services/number-sequence-service"
import type { PrismaClient } from "@/generated/prisma/client"

const SETTINGS_MANAGE = permissionIdByKey("settings.manage")!

export const numberSequencesRouter = createTRPCRouter({
  list: tenantProcedure
    .use(requirePermission(SETTINGS_MANAGE))
    .query(async ({ ctx }) => {
      try {
        return await numberSequenceService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  update: tenantProcedure
    .use(requirePermission(SETTINGS_MANAGE))
    .input(z.object({
      key: z.string().min(1),
      prefix: z.string().optional(),
      nextValue: z.number().int().min(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await numberSequenceService.update(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.key,
          { prefix: input.prefix, nextValue: input.nextValue },
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
