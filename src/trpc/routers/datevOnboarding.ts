/**
 * DATEV Onboarding Router (Phase 3.6)
 */
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as service from "@/lib/services/datev-onboarding-service"

const VIEW = permissionIdByKey("payroll.view")!

export const datevOnboardingRouter = createTRPCRouter({
  getStatus: tenantProcedure
    .use(requirePermission(VIEW))
    .query(async ({ ctx }) => {
      try {
        return await service.getStatus(ctx.prisma, ctx.tenantId!)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  generatePdf: tenantProcedure
    .use(requirePermission(VIEW))
    .query(async ({ ctx }) => {
      try {
        const result = await service.generateSteuerberaterPdf(
          ctx.prisma,
          ctx.tenantId!,
        )
        return {
          contentBase64: result.buffer.toString("base64"),
          filename: result.filename,
          contentType: "application/pdf",
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
