import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission, applyDataScope } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as overtimePayoutService from "@/lib/services/overtime-payout-service"

const OVERTIME_PAYOUTS_MANAGE = permissionIdByKey("overtime_payouts.manage")!

const overtimePayoutOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  employeeId: z.string(),
  year: z.number(),
  month: z.number(),
  payoutMinutes: z.number(),
  status: z.string(),
  sourceFlextimeEnd: z.number(),
  tariffRuleSnapshot: z.unknown(),
  approvedBy: z.string().nullable(),
  approvedAt: z.date().nullable(),
  rejectedBy: z.string().nullable(),
  rejectedAt: z.date().nullable(),
  rejectedReason: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  employee: z
    .object({
      firstName: z.string().nullable(),
      lastName: z.string().nullable(),
      personnelNumber: z.string().nullable(),
      departmentId: z.string().nullable(),
    })
    .optional(),
})

export const overtimePayoutsRouter = createTRPCRouter({
  list: tenantProcedure
    .use(requirePermission(OVERTIME_PAYOUTS_MANAGE))
    .use(applyDataScope())
    .input(
      z
        .object({
          employeeId: z.string().optional(),
          year: z.number().int().optional(),
          month: z.number().int().min(1).max(12).optional(),
          status: z.enum(["pending", "approved", "rejected"]).optional(),
          departmentId: z.string().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(overtimePayoutOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const items = await overtimePayoutService.list(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
        return { data: items as z.infer<typeof overtimePayoutOutputSchema>[] }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: tenantProcedure
    .use(requirePermission(OVERTIME_PAYOUTS_MANAGE))
    .use(applyDataScope())
    .input(z.object({ id: z.string() }))
    .output(overtimePayoutOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const item = await overtimePayoutService.getById(
          ctx.prisma,
          ctx.tenantId!,
          input.id
        )
        return item as z.infer<typeof overtimePayoutOutputSchema>
      } catch (err) {
        handleServiceError(err)
      }
    }),

  countPending: tenantProcedure
    .use(requirePermission(OVERTIME_PAYOUTS_MANAGE))
    .input(
      z
        .object({
          year: z.number().int().optional(),
          month: z.number().int().min(1).max(12).optional(),
        })
        .optional()
    )
    .output(z.object({ count: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
        const count = await overtimePayoutService.countPending(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
        return { count }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  approve: tenantProcedure
    .use(requirePermission(OVERTIME_PAYOUTS_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(overtimePayoutOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await overtimePayoutService.approve(
          ctx.prisma,
          ctx.tenantId!,
          input.id,
          ctx.user!.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return result as z.infer<typeof overtimePayoutOutputSchema>
      } catch (err) {
        handleServiceError(err)
      }
    }),

  reject: tenantProcedure
    .use(requirePermission(OVERTIME_PAYOUTS_MANAGE))
    .input(z.object({ id: z.string(), reason: z.string().min(1) }))
    .output(overtimePayoutOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await overtimePayoutService.reject(
          ctx.prisma,
          ctx.tenantId!,
          input.id,
          ctx.user!.id,
          input.reason,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return result as z.infer<typeof overtimePayoutOutputSchema>
      } catch (err) {
        handleServiceError(err)
      }
    }),

  approveBatch: tenantProcedure
    .use(requirePermission(OVERTIME_PAYOUTS_MANAGE))
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .output(
      z.object({
        approvedCount: z.number(),
        errors: z.array(
          z.object({ payoutId: z.string(), reason: z.string() })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await overtimePayoutService.approveBatch(
          ctx.prisma,
          ctx.tenantId!,
          input.ids,
          ctx.user!.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
