/**
 * Employee Day Plans Router
 *
 * Provides employee day plan CRUD, bulk create (upsert), delete range,
 * per-employee listing, and tariff-based generation via tRPC procedures.
 *
 * Replaces the Go backend employee day plan endpoints:
 * - GET /employee-day-plans -> employeeDayPlans.list
 * - GET /employees/{employee_id}/day-plans -> employeeDayPlans.forEmployee
 * - GET /employee-day-plans/{id} -> employeeDayPlans.getById
 * - POST /employee-day-plans -> employeeDayPlans.create
 * - PUT /employee-day-plans/{id} -> employeeDayPlans.update
 * - DELETE /employee-day-plans/{id} -> employeeDayPlans.delete
 * - POST /employee-day-plans/bulk -> employeeDayPlans.bulkCreate
 * - POST /employee-day-plans/delete-range -> employeeDayPlans.deleteRange
 * - POST /employee-day-plans/generate-from-tariff -> employeeDayPlans.generateFromTariff
 *
 * @see apps/api/internal/service/employeedayplan.go
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission, applyDataScope, type DataScope } from "@/lib/auth/middleware"
import { checkRelatedEmployeeDataScope, buildRelatedEmployeeDataScopeWhere } from "@/lib/auth/data-scope"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as edpService from "@/lib/services/employee-day-plans-service"

// --- Permission Constants ---

const TIME_PLANS_MANAGE = permissionIdByKey("time_plans.manage")!

// --- Source Enum ---

const EDP_SOURCES = ["tariff", "manual", "holiday"] as const

// --- Output Schemas ---

const dayPlanSummarySchema = z
  .object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    planType: z.string(),
  })
  .nullable()

const shiftSummarySchema = z
  .object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
  })
  .nullable()

const employeeDayPlanOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  employeeId: z.string(),
  planDate: z.date(),
  dayPlanId: z.string().nullable(),
  shiftId: z.string().nullable(),
  source: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  dayPlan: dayPlanSummarySchema.optional(),
  shift: shiftSummarySchema.optional(),
})

// --- Input Schemas ---

const listInputSchema = z.object({
  employeeId: z.string().optional(),
  from: z.string().date(),
  to: z.string().date(),
})

const forEmployeeInputSchema = z.object({
  employeeId: z.string(),
  from: z.string().date(),
  to: z.string().date(),
})

const createInputSchema = z.object({
  employeeId: z.string(),
  planDate: z.string().date(),
  dayPlanId: z.string().optional(),
  shiftId: z.string().optional(),
  source: z.enum(EDP_SOURCES),
  notes: z.string().optional(),
})

const updateInputSchema = z.object({
  id: z.string(),
  dayPlanId: z.string().nullable().optional(),
  shiftId: z.string().nullable().optional(),
  source: z.enum(EDP_SOURCES).optional(),
  notes: z.string().nullable().optional(),
})

const bulkCreateEntrySchema = z.object({
  employeeId: z.string(),
  planDate: z.string().date(),
  dayPlanId: z.string().optional(),
  shiftId: z.string().optional(),
  source: z.enum(EDP_SOURCES),
  notes: z.string().optional(),
})

const bulkCreateInputSchema = z.object({
  entries: z.array(bulkCreateEntrySchema).min(1),
})

const deleteRangeInputSchema = z.object({
  employeeId: z.string(),
  from: z.string().date(),
  to: z.string().date(),
})

const generateFromTariffInputSchema = z.object({
  employeeIds: z.array(z.string()).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  overwriteTariffSource: z.boolean().optional(),
})

// --- Router ---

export const employeeDayPlansRouter = createTRPCRouter({
  /**
   * employeeDayPlans.list -- List employee day plans with required date range.
   *
   * Optional employeeId filter. Includes dayPlan and shift summaries.
   * Orders by employeeId ASC, planDate ASC.
   *
   * Requires: time_plans.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(TIME_PLANS_MANAGE))
    .use(applyDataScope())
    .input(listInputSchema)
    .output(z.object({ data: z.array(employeeDayPlanOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        if (input.employeeId) {
          const employee = await ctx.prisma.employee.findFirst({
            where: { id: input.employeeId, tenantId: ctx.tenantId!, deletedAt: null },
            select: { id: true, departmentId: true },
          })
          if (employee) {
            checkRelatedEmployeeDataScope(dataScope, {
              employeeId: employee.id,
              employee: { departmentId: employee.departmentId },
            }, "EmployeeDayPlan")
          }
        }
        const scopeWhere = buildRelatedEmployeeDataScopeWhere(dataScope)
        return await edpService.list(ctx.prisma, ctx.tenantId!, input, scopeWhere)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeDayPlans.forEmployee -- List day plans for a specific employee within date range.
   *
   * Includes richer dayPlan data (breaks, bonuses) and full shift details.
   * Orders by planDate ASC.
   *
   * Requires: time_plans.manage permission
   */
  forEmployee: tenantProcedure
    .use(requirePermission(TIME_PLANS_MANAGE))
    .use(applyDataScope())
    .input(forEmployeeInputSchema)
    .output(z.object({ data: z.array(employeeDayPlanOutputSchema) }))
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
          }, "EmployeeDayPlan")
        }
        return await edpService.forEmployee(ctx.prisma, ctx.tenantId!, input)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeDayPlans.getById -- Get a single employee day plan by ID.
   *
   * Tenant-scoped. Includes dayPlan and shift summaries.
   *
   * Requires: time_plans.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(TIME_PLANS_MANAGE))
    .use(applyDataScope())
    .input(z.object({ id: z.string() }))
    .output(employeeDayPlanOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const result = await edpService.getById(ctx.prisma, ctx.tenantId!, input.id)
        const employee = await ctx.prisma.employee.findFirst({
          where: { id: result.employeeId, tenantId: ctx.tenantId!, deletedAt: null },
          select: { id: true, departmentId: true },
        })
        if (employee) {
          checkRelatedEmployeeDataScope(dataScope, {
            employeeId: employee.id,
            employee: { departmentId: employee.departmentId },
          }, "EmployeeDayPlan")
        }
        return result
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeDayPlans.create -- Create a single employee day plan.
   *
   * Validates employee exists in tenant, shift FK, dayPlan FK.
   * Auto-populates dayPlanId from shift if not provided.
   * Handles unique constraint on [employeeId, planDate].
   *
   * Requires: time_plans.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(TIME_PLANS_MANAGE))
    .use(applyDataScope())
    .input(createInputSchema)
    .output(employeeDayPlanOutputSchema)
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
          }, "EmployeeDayPlan")
        }
        return await edpService.create(ctx.prisma, ctx.tenantId!, input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeDayPlans.update -- Partial update of an employee day plan.
   *
   * Supports nullable fields (null = clear). Same shift->dayPlan auto-populate logic.
   *
   * Requires: time_plans.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(TIME_PLANS_MANAGE))
    .use(applyDataScope())
    .input(updateInputSchema)
    .output(employeeDayPlanOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const existing = await ctx.prisma.employeeDayPlan.findFirst({
          where: { id: input.id, tenantId: ctx.tenantId! },
          include: { employee: { select: { id: true, departmentId: true } } },
        })
        if (existing?.employee) {
          checkRelatedEmployeeDataScope(dataScope, {
            employeeId: existing.employeeId,
            employee: { departmentId: existing.employee.departmentId },
          }, "EmployeeDayPlan")
        }
        return await edpService.update(ctx.prisma, ctx.tenantId!, input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeDayPlans.delete -- Delete a single employee day plan.
   *
   * Tenant-scoped. Hard delete.
   *
   * Requires: time_plans.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(TIME_PLANS_MANAGE))
    .use(applyDataScope())
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const existing = await ctx.prisma.employeeDayPlan.findFirst({
          where: { id: input.id, tenantId: ctx.tenantId! },
          include: { employee: { select: { id: true, departmentId: true } } },
        })
        if (existing?.employee) {
          checkRelatedEmployeeDataScope(dataScope, {
            employeeId: existing.employeeId,
            employee: { departmentId: existing.employee.departmentId },
          }, "EmployeeDayPlan")
        }
        return await edpService.remove(ctx.prisma, ctx.tenantId!, input.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeDayPlans.bulkCreate -- Bulk upsert employee day plans.
   *
   * Uses $transaction with individual upsert() calls (ON CONFLICT employee_id + plan_date).
   * Validates all entries before creating.
   *
   * Requires: time_plans.manage permission
   */
  bulkCreate: tenantProcedure
    .use(requirePermission(TIME_PLANS_MANAGE))
    .use(applyDataScope())
    .input(bulkCreateInputSchema)
    .output(z.object({ created: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        // Check scope for all unique employeeIds in the batch
        const uniqueEmployeeIds = [...new Set(input.entries.map((e) => e.employeeId))]
        const employees = await ctx.prisma.employee.findMany({
          where: { id: { in: uniqueEmployeeIds }, tenantId: ctx.tenantId!, deletedAt: null },
          select: { id: true, departmentId: true },
        })
        for (const employee of employees) {
          checkRelatedEmployeeDataScope(dataScope, {
            employeeId: employee.id,
            employee: { departmentId: employee.departmentId },
          }, "EmployeeDayPlan")
        }
        return await edpService.bulkCreate(ctx.prisma, ctx.tenantId!, input)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeDayPlans.deleteRange -- Delete employee day plans by employee + date range.
   *
   * Validates employee exists. Returns count of deleted records.
   *
   * Requires: time_plans.manage permission
   */
  deleteRange: tenantProcedure
    .use(requirePermission(TIME_PLANS_MANAGE))
    .use(applyDataScope())
    .input(deleteRangeInputSchema)
    .output(z.object({ deleted: z.number() }))
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
          }, "EmployeeDayPlan")
        }
        return await edpService.deleteRange(ctx.prisma, ctx.tenantId!, input)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeDayPlans.generateFromTariff -- Generate day plans from employee tariffs.
   *
   * Port of Go GenerateFromTariff. Resolves day plans per date based on tariff
   * rhythm type (weekly, rolling_weekly, x_days).
   *
   * Default date range: today to today + 3 months.
   * Default overwriteTariffSource: true.
   *
   * Preserves manual/holiday plans (source != 'tariff').
   * Returns processing statistics.
   *
   * Requires: time_plans.manage permission
   */
  generateFromTariff: tenantProcedure
    .use(requirePermission(TIME_PLANS_MANAGE))
    .use(applyDataScope())
    .input(generateFromTariffInputSchema)
    .output(
      z.object({
        employeesProcessed: z.number(),
        plansCreated: z.number(),
        plansUpdated: z.number(),
        employeesSkipped: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        // Check scope for specific employeeIds if provided
        if (input.employeeIds && input.employeeIds.length > 0) {
          const employees = await ctx.prisma.employee.findMany({
            where: { id: { in: input.employeeIds }, tenantId: ctx.tenantId!, deletedAt: null },
            select: { id: true, departmentId: true },
          })
          for (const employee of employees) {
            checkRelatedEmployeeDataScope(dataScope, {
              employeeId: employee.id,
              employee: { departmentId: employee.departmentId },
            }, "EmployeeDayPlan")
          }
        }
        return await edpService.generateFromTariff(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
