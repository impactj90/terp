import { z } from "zod"
import type { PrismaClient } from "@/generated/prisma/client"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { requireModule } from "@/lib/modules"
import { handleServiceError } from "@/trpc/errors"
import * as emailLogRepo from "@/lib/services/inbound-email-log-repository"

const MANAGE = permissionIdByKey("inbound_invoices.manage")!
const invProcedure = tenantProcedure.use(requireModule("inbound_invoices"))

export const emailLogRouter = createTRPCRouter({
  list: invProcedure
    .use(requirePermission(MANAGE))
    .input(z.object({
      status: z.string().optional(),
      search: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(25),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { page, pageSize, ...filters } = input
        return await emailLogRepo.findMany(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          {
            status: filters.status,
            search: filters.search,
            dateFrom: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
            dateTo: filters.dateTo ? new Date(filters.dateTo) : undefined,
          },
          { page, pageSize }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
