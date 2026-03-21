/**
 * Tenant Modules Router
 *
 * Manages which feature modules are enabled per tenant.
 * Admin-only operations for enable/disable; any tenant user can list.
 *
 * Procedures:
 * - list    — returns enabled modules for current tenant
 * - enable  — enables a module (requires settings.manage)
 * - disable — disables a module (requires settings.manage, cannot disable "core")
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as tenantModuleService from "@/lib/services/tenant-module-service"

// --- Permission Constants ---

const SETTINGS_MANAGE = permissionIdByKey("settings.manage")!

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

  /**
   * tenantModules.enable — enables a module for the current tenant.
   * Requires: settings.manage permission
   */
  enable: tenantProcedure
    .use(requirePermission(SETTINGS_MANAGE))
    .input(z.object({ module: z.string() }))
    .output(moduleOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await tenantModuleService.enable(
          ctx.prisma,
          ctx.tenantId!,
          input.module,
          ctx.user!.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * tenantModules.disable — disables a module for the current tenant.
   * Requires: settings.manage permission. Cannot disable "core".
   */
  disable: tenantProcedure
    .use(requirePermission(SETTINGS_MANAGE))
    .input(z.object({ module: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await tenantModuleService.disable(
          ctx.prisma,
          ctx.tenantId!,
          input.module,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
