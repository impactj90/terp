/**
 * Tenant Modules Router
 *
 * Phase 9: read-only from the tenant side. Module booking is an operator
 * action handled by `platform/routers/tenantManagement.ts`. The tenant
 * `enable` / `disable` procedures were deleted along with the self-service
 * toggle UI — any stale frontend caller now fails at compile time thanks
 * to tRPC's generated types.
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import * as tenantModuleService from "@/lib/services/tenant-module-service"

// --- Output Schemas ---

const moduleOutputSchema = z.object({
  module: z.string(),
  enabledAt: z.date(),
})

// --- Router ---

export const tenantModulesRouter = createTRPCRouter({
  /**
   * tenantModules.list — returns enabled modules for the current tenant.
   * Any authenticated tenant user can call this (needed for sidebar filtering).
   */
  list: tenantProcedure
    .output(z.object({ modules: z.array(moduleOutputSchema) }))
    .query(async ({ ctx }) => {
      try {
        const modules = await tenantModuleService.list(ctx.prisma, ctx.tenantId!)
        return { modules }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
