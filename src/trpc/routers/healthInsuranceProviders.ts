/**
 * Health Insurance Providers Router
 *
 * Read-only lookup for active health insurance providers.
 * Queries Prisma directly (no service layer needed for simple lookups).
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"

// --- Permission Constants ---

const PAYROLL_VIEW = permissionIdByKey("personnel.payroll_data.view")!

// --- Router ---

export const healthInsuranceProvidersRouter = createTRPCRouter({
  /**
   * healthInsuranceProviders.list -- Returns all active health insurance providers.
   *
   * Requires: personnel.payroll_data.view permission
   */
  list: tenantProcedure
    .use(requirePermission(PAYROLL_VIEW))
    .output(
      z.object({
        data: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            institutionCode: z.string(),
          })
        ),
      })
    )
    .query(async ({ ctx }) => {
      try {
        const providers = await ctx.prisma.healthInsuranceProvider.findMany({
          where: { isActive: true },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            institutionCode: true,
          },
        })
        return { data: providers }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
