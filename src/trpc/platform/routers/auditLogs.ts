/**
 * Platform audit logs router.
 *
 * Thin wrapper over `src/lib/platform/audit-service.ts`. Listing is
 * paginated and filterable by operator, target tenant, action, and
 * date range. Every query here is read-only — writes go through the
 * audit-service module, not the UI.
 */
import { z } from "zod"
import {
  platformAuthedProcedure,
  createTRPCRouter,
} from "../init"
import * as platformAudit from "@/lib/platform/audit-service"
import { handleServiceError } from "@/trpc/errors"

const uuid = z.string().uuid()

export const platformAuditLogsRouter = createTRPCRouter({
  list: platformAuthedProcedure
    .input(
      z
        .object({
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(100).default(20),
          platformUserId: uuid.optional(),
          targetTenantId: uuid.optional(),
          action: z.string().max(50).optional(),
          fromDate: z.string().datetime().optional(),
          toDate: z.string().datetime().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      try {
        return await platformAudit.list(ctx.prisma, input)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: platformAuthedProcedure
    .input(z.object({ id: uuid }))
    .query(async ({ ctx, input }) => {
      try {
        return await platformAudit.getById(ctx.prisma, input.id)
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
