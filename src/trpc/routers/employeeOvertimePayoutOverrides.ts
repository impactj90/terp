import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission, applyDataScope, type DataScope } from "@/lib/auth/middleware"
import { checkRelatedEmployeeDataScope, buildRelatedEmployeeDataScopeWhere } from "@/lib/auth/data-scope"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as overrideService from "@/lib/services/employee-overtime-payout-override-service"

const TARIFFS_MANAGE = permissionIdByKey("tariffs.manage")!

const PAYOUT_MODES = ["ALL_ABOVE_THRESHOLD", "PERCENTAGE", "FIXED_AMOUNT"] as const

const overrideOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  employeeId: z.string(),
  overtimePayoutEnabled: z.boolean(),
  overtimePayoutMode: z.string().nullable(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  employee: z
    .object({
      firstName: z.string().nullable(),
      lastName: z.string().nullable(),
      personnelNumber: z.string().nullable(),
    })
    .optional(),
})

export const employeeOvertimePayoutOverridesRouter = createTRPCRouter({
  list: tenantProcedure
    .use(requirePermission(TARIFFS_MANAGE))
    .use(applyDataScope())
    .input(
      z
        .object({
          employeeId: z.string().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(overrideOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const scopeWhere = buildRelatedEmployeeDataScopeWhere(dataScope)
        const items = await overrideService.list(
          ctx.prisma,
          ctx.tenantId!,
          input ? { employeeId: input.employeeId } : undefined,
          scopeWhere
        )
        return { data: items as z.infer<typeof overrideOutputSchema>[] }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: tenantProcedure
    .use(requirePermission(TARIFFS_MANAGE))
    .use(applyDataScope())
    .input(z.object({ id: z.string() }))
    .output(overrideOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const item = await overrideService.getById(
          ctx.prisma,
          ctx.tenantId!,
          input.id
        )
        const employee = await ctx.prisma.employee.findFirst({
          where: { id: (item as Record<string, unknown>).employeeId as string, tenantId: ctx.tenantId!, deletedAt: null },
          select: { id: true, departmentId: true },
        })
        if (employee) {
          checkRelatedEmployeeDataScope(dataScope, {
            employeeId: employee.id,
            employee: { departmentId: employee.departmentId },
          }, "EmployeeOvertimePayoutOverride")
        }
        return item as z.infer<typeof overrideOutputSchema>
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getByEmployeeId: tenantProcedure
    .use(requirePermission(TARIFFS_MANAGE))
    .use(applyDataScope())
    .input(z.object({ employeeId: z.string() }))
    .output(overrideOutputSchema.nullable())
    .query(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const employee = await ctx.prisma.employee.findFirst({
          where: { id: input.employeeId, tenantId: ctx.tenantId!, deletedAt: null },
          select: { id: true, departmentId: true },
        })
        if (employee) {
          checkRelatedEmployeeDataScope(dataScope, {
            employeeId: employee.id,
            employee: { departmentId: employee.departmentId },
          }, "EmployeeOvertimePayoutOverride")
        }
        const item = await overrideService.getByEmployeeId(
          ctx.prisma,
          ctx.tenantId!,
          input.employeeId
        )
        return (item as z.infer<typeof overrideOutputSchema>) ?? null
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: tenantProcedure
    .use(requirePermission(TARIFFS_MANAGE))
    .use(applyDataScope())
    .input(
      z.object({
        employeeId: z.string(),
        overtimePayoutEnabled: z.boolean(),
        overtimePayoutMode: z.enum(PAYOUT_MODES).nullable().optional(),
        notes: z.string().nullable().optional(),
      })
    )
    .output(overrideOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const employee = await ctx.prisma.employee.findFirst({
          where: { id: input.employeeId, tenantId: ctx.tenantId!, deletedAt: null },
          select: { id: true, departmentId: true },
        })
        if (employee) {
          checkRelatedEmployeeDataScope(dataScope, {
            employeeId: employee.id,
            employee: { departmentId: employee.departmentId },
          }, "EmployeeOvertimePayoutOverride")
        }
        const created = await overrideService.create(
          ctx.prisma,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return created as z.infer<typeof overrideOutputSchema>
      } catch (err) {
        handleServiceError(err)
      }
    }),

  update: tenantProcedure
    .use(requirePermission(TARIFFS_MANAGE))
    .use(applyDataScope())
    .input(
      z.object({
        id: z.string(),
        overtimePayoutEnabled: z.boolean().optional(),
        overtimePayoutMode: z.enum(PAYOUT_MODES).nullable().optional(),
        notes: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const existing = await ctx.prisma.employeeOvertimePayoutOverride.findFirst({
          where: { id: input.id, tenantId: ctx.tenantId! },
        })
        if (existing) {
          const employee = await ctx.prisma.employee.findFirst({
            where: { id: existing.employeeId, tenantId: ctx.tenantId!, deletedAt: null },
            select: { id: true, departmentId: true },
          })
          if (employee) {
            checkRelatedEmployeeDataScope(dataScope, {
              employeeId: employee.id,
              employee: { departmentId: employee.departmentId },
            }, "EmployeeOvertimePayoutOverride")
          }
        }
        await overrideService.update(
          ctx.prisma,
          ctx.tenantId!,
          input.id,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  delete: tenantProcedure
    .use(requirePermission(TARIFFS_MANAGE))
    .use(applyDataScope())
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const existing = await ctx.prisma.employeeOvertimePayoutOverride.findFirst({
          where: { id: input.id, tenantId: ctx.tenantId! },
        })
        if (existing) {
          const employee = await ctx.prisma.employee.findFirst({
            where: { id: existing.employeeId, tenantId: ctx.tenantId!, deletedAt: null },
            select: { id: true, departmentId: true },
          })
          if (employee) {
            checkRelatedEmployeeDataScope(dataScope, {
              employeeId: employee.id,
              employee: { departmentId: employee.departmentId },
            }, "EmployeeOvertimePayoutOverride")
          }
        }
        await overrideService.remove(
          ctx.prisma,
          ctx.tenantId!,
          input.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
