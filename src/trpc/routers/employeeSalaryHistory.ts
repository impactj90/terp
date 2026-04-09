/**
 * Employee Salary History Router (Phase 3.5)
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as service from "@/lib/services/employee-salary-history-service"

const VIEW = permissionIdByKey("personnel.payroll_data.view")!
const EDIT = permissionIdByKey("personnel.payroll_data.edit")!

const paymentTypeEnum = z.enum(["monthly", "hourly"])
const changeReasonEnum = z.enum([
  "initial",
  "raise",
  "tariff_change",
  "promotion",
  "other",
])

export const employeeSalaryHistoryRouter = createTRPCRouter({
  list: tenantProcedure
    .use(requirePermission(VIEW))
    .input(z.object({ employeeId: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        return await service.list(ctx.prisma, ctx.tenantId!, input.employeeId)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: tenantProcedure
    .use(requirePermission(EDIT))
    .input(
      z.object({
        employeeId: z.string(),
        validFrom: z.coerce.date(),
        grossSalary: z.number().nullable().optional(),
        hourlyRate: z.number().nullable().optional(),
        paymentType: paymentTypeEnum,
        changeReason: changeReasonEnum,
        notes: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await service.create(ctx.prisma, ctx.tenantId!, input, {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })
      } catch (err) {
        handleServiceError(err)
      }
    }),

  update: tenantProcedure
    .use(requirePermission(EDIT))
    .input(
      z.object({
        id: z.string(),
        validFrom: z.coerce.date().optional(),
        validTo: z.coerce.date().nullable().optional(),
        grossSalary: z.number().nullable().optional(),
        hourlyRate: z.number().nullable().optional(),
        paymentType: paymentTypeEnum.optional(),
        changeReason: changeReasonEnum.optional(),
        notes: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { id, ...rest } = input
        return await service.update(ctx.prisma, ctx.tenantId!, id, rest, {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })
      } catch (err) {
        handleServiceError(err)
      }
    }),

  delete: tenantProcedure
    .use(requirePermission(EDIT))
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await service.remove(ctx.prisma, ctx.tenantId!, input.id, {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
