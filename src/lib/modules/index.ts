/**
 * Module Guard Utility
 *
 * Provides functions to check and enforce which feature modules are enabled
 * for a given tenant. Follows the same middleware patterns as the permission
 * system in src/lib/auth/middleware.ts.
 *
 * Available modules:
 * - "core"      — always enabled, cannot be disabled
 * - "crm"       — CRM (addresses, contacts, correspondence, inquiries)
 * - "billing"   — Billing (documents, invoices, payments)
 * - "warehouse" — Warehouse (articles, stock, purchasing)
 */
import { TRPCError } from "@trpc/server"
import type { PrismaClient } from "@/generated/prisma/client"
import { createMiddleware } from "@/trpc/init"

// Re-export constants from client-safe module
export { AVAILABLE_MODULES, type ModuleId } from "./constants"

/**
 * Returns the list of enabled module strings for a tenant.
 * "core" is always included even if not in the database.
 */
export async function getEnabledModules(
  prisma: PrismaClient,
  tenantId: string
): Promise<string[]> {
  const rows = await prisma.tenantModule.findMany({
    where: { tenantId },
    select: { module: true },
  })

  const modules = rows.map((r) => r.module)

  // "core" is always enabled
  if (!modules.includes("core")) {
    modules.push("core")
  }

  return modules
}

/**
 * Checks if a specific module is enabled for a tenant.
 * "core" is always considered enabled.
 */
export async function hasModule(
  prisma: PrismaClient,
  tenantId: string,
  module: string
): Promise<boolean> {
  if (module === "core") return true

  const row = await prisma.tenantModule.findUnique({
    where: { tenantId_module: { tenantId, module } },
  })

  return row !== null
}

/**
 * tRPC middleware that throws FORBIDDEN if the specified module is not
 * enabled for the current tenant.
 *
 * Usage: tenantProcedure.use(requireModule("crm")).query(...)
 *
 * Follows the same pattern as requirePermission() in src/lib/auth/middleware.ts.
 */
export function requireModule(module: string) {
  return createMiddleware(async ({ ctx, next }) => {
    const { tenantId, prisma } = ctx as {
      tenantId?: string | null
      prisma: PrismaClient
    }

    if (!tenantId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Tenant ID required",
      })
    }

    if (module === "core") {
      return next({ ctx })
    }

    const enabled = await hasModule(prisma, tenantId, module)
    if (!enabled) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Module "${module}" is not enabled for this tenant`,
      })
    }

    return next({ ctx })
  })
}
