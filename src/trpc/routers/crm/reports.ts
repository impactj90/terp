import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as crmReportService from "@/lib/services/crm-report-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const ADDR_VIEW = permissionIdByKey("crm_addresses.view")!
const CORR_VIEW = permissionIdByKey("crm_correspondence.view")!
const INQ_VIEW = permissionIdByKey("crm_inquiries.view")!
const TASK_VIEW = permissionIdByKey("crm_tasks.view")!

// --- Base procedure with module guard ---
const crmProcedure = tenantProcedure.use(requireModule("crm"))

// --- Input Schemas ---
const dateRangeOptional = z.object({
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
})

const dateRangeRequired = z.object({
  dateFrom: z.string().datetime(),
  dateTo: z.string().datetime(),
})

// --- Router ---
export const crmReportsRouter = createTRPCRouter({
  overview: crmProcedure
    .use(requirePermission(ADDR_VIEW))
    .query(async ({ ctx }) => {
      try {
        return await crmReportService.overview(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  addressStats: crmProcedure
    .use(requirePermission(ADDR_VIEW))
    .input(
      z.object({
        type: z.enum(["CUSTOMER", "SUPPLIER", "BOTH"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await crmReportService.addressStats(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  correspondenceByPeriod: crmProcedure
    .use(requirePermission(CORR_VIEW))
    .input(
      dateRangeRequired.extend({
        groupBy: z.enum(["day", "week", "month"]),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await crmReportService.correspondenceByPeriod(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  correspondenceByType: crmProcedure
    .use(requirePermission(CORR_VIEW))
    .input(dateRangeRequired)
    .query(async ({ ctx, input }) => {
      try {
        return await crmReportService.correspondenceByType(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  inquiryPipeline: crmProcedure
    .use(requirePermission(INQ_VIEW))
    .input(dateRangeOptional)
    .query(async ({ ctx, input }) => {
      try {
        return await crmReportService.inquiryPipeline(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  inquiryByEffort: crmProcedure
    .use(requirePermission(INQ_VIEW))
    .input(dateRangeOptional)
    .query(async ({ ctx, input }) => {
      try {
        return await crmReportService.inquiryByEffort(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  taskCompletion: crmProcedure
    .use(requirePermission(TASK_VIEW))
    .input(dateRangeOptional)
    .query(async ({ ctx, input }) => {
      try {
        return await crmReportService.taskCompletion(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  tasksByAssignee: crmProcedure
    .use(requirePermission(TASK_VIEW))
    .input(dateRangeOptional)
    .query(async ({ ctx, input }) => {
      try {
        return await crmReportService.tasksByAssignee(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
