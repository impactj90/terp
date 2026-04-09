/**
 * Payroll Bulk Import Router (Phase 3.4)
 *
 * Procedures:
 * - parseFile     — validates a file and returns a preview
 * - confirmImport — writes changes inside a transaction
 * - downloadTemplate — returns a header-only CSV template
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as service from "@/lib/services/payroll-bulk-import-service"

const PAYROLL_EDIT = permissionIdByKey("personnel.payroll_data.edit")!

export const payrollBulkImportRouter = createTRPCRouter({
  parseFile: tenantProcedure
    .use(requirePermission(PAYROLL_EDIT))
    .input(
      z.object({
        fileBase64: z.string().min(1),
        filename: z.string().min(1),
        columnMapping: z.record(z.string(), z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await service.parseFile(
          ctx.prisma,
          ctx.tenantId!,
          input.fileBase64,
          input.filename,
          input.columnMapping,
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  confirmImport: tenantProcedure
    .use(requirePermission(PAYROLL_EDIT))
    .input(
      z.object({
        fileBase64: z.string().min(1),
        filename: z.string().min(1),
        columnMapping: z.record(z.string(), z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await service.confirmImport(
          ctx.prisma,
          ctx.tenantId!,
          input.fileBase64,
          input.filename,
          input.columnMapping,
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

  downloadTemplate: tenantProcedure
    .use(requirePermission(PAYROLL_EDIT))
    .query(() => {
      const csv = service.buildCsvTemplate()
      return {
        contentBase64: Buffer.from(csv, "utf8").toString("base64"),
        filename: "payroll_bulk_import_template.csv",
        contentType: "text/csv",
      }
    }),
})
