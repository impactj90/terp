/**
 * System Export Templates Router (Phase 3)
 *
 * Read-only access to the shipped standard templates + `copyToTenant`
 * which materialises a system template as an editable per-tenant copy.
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as service from "@/lib/services/system-export-template-service"

const VIEW = permissionIdByKey("export_template.view")!
const CREATE = permissionIdByKey("export_template.create")!

export const systemExportTemplatesRouter = createTRPCRouter({
  list: tenantProcedure
    .use(requirePermission(VIEW))
    .query(async ({ ctx }) => {
      try {
        return await service.list(ctx.prisma)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: tenantProcedure
    .use(requirePermission(VIEW))
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        return await service.getById(ctx.prisma, input.id)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  copyToTenant: tenantProcedure
    .use(requirePermission(CREATE))
    .input(
      z.object({
        systemTemplateId: z.string(),
        nameOverride: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await service.copyToTenant(
          ctx.prisma,
          ctx.tenantId!,
          input.systemTemplateId,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
          { nameOverride: input.nameOverride },
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
