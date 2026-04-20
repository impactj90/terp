import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as service from "@/lib/services/outgoing-invoice-book-service"
import * as pdfService from "@/lib/services/outgoing-invoice-book-pdf-service"
import * as csvService from "@/lib/services/outgoing-invoice-book-csv-service"
import type { PrismaClient } from "@/generated/prisma/client"

const OUTGOING_VIEW = permissionIdByKey("outgoing_invoice_book.view")!
const OUTGOING_EXPORT = permissionIdByKey("outgoing_invoice_book.export")!

const billingProcedure = tenantProcedure.use(requireModule("billing"))

const rangeInput = z.object({
  dateFrom: z.coerce.date(),
  dateTo: z.coerce.date(),
})

export const billingOutgoingInvoiceBookRouter = createTRPCRouter({
  list: billingProcedure
    .use(requirePermission(OUTGOING_VIEW))
    .input(rangeInput)
    .query(async ({ ctx, input }) => {
      try {
        return await service.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  exportPdf: billingProcedure
    .use(requirePermission(OUTGOING_EXPORT))
    .input(rangeInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await pdfService.generateAndGetDownloadUrl(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  exportCsv: billingProcedure
    .use(requirePermission(OUTGOING_EXPORT))
    .input(
      rangeInput.extend({
        encoding: z.enum(["utf8", "win1252"]).default("utf8"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await csvService.exportToCsv(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
