/**
 * Demo Self-Service Router.
 *
 * Single endpoint used by the /demo-expired page: the expired demo's admin
 * user clicks "Request Convert" and the service writes three side effects:
 *   1. `demo_convert_requests` row for the platform-admin inbox (Phase 6).
 *   2. Pending `email_send_log` row for sales notification.
 *   3. Tenant-side `audit_logs` row (`demo_convert_req` action).
 *
 * Deliberately NOT gated by `tenants.manage`. Authorization is enforced by
 * the service: caller must be a member of the target tenant (via
 * user_tenants) AND the target tenant must be an expired demo.
 */
import { z } from "zod"
import { createTRPCRouter, protectedProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import * as demoService from "@/lib/services/demo-tenant-service"

export const demoSelfServiceRouter = createTRPCRouter({
  requestConvertFromExpired: protectedProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await demoService.requestConvertFromExpired(
          ctx.prisma,
          ctx.user!.id,
          input.tenantId,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
