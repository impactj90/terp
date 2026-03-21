/**
 * Employee Capping Exceptions Router
 *
 * Provides CRUD operations for employee capping exceptions via tRPC procedures.
 *
 * Replaces the Go backend endpoints:
 * - GET /employee-capping-exceptions -> employeeCappingExceptions.list
 * - GET /employee-capping-exceptions/{id} -> employeeCappingExceptions.getById
 * - POST /employee-capping-exceptions -> employeeCappingExceptions.create
 * - PATCH /employee-capping-exceptions/{id} -> employeeCappingExceptions.update
 * - DELETE /employee-capping-exceptions/{id} -> employeeCappingExceptions.delete
 *
 * @see apps/api/internal/service/employeecappingexception.go
 */
import { z } from "zod"
import type { Prisma } from "@/generated/prisma/client"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission, applyDataScope, type DataScope } from "@/lib/auth/middleware"
import { checkRelatedEmployeeDataScope, buildRelatedEmployeeDataScopeWhere } from "@/lib/auth/data-scope"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as employeeCappingExceptionService from "@/lib/services/employee-capping-exception-service"

// --- Permission Constants ---

const VACATION_CONFIG_MANAGE = permissionIdByKey("vacation_config.manage")!

// --- Enum Constants ---

const EXEMPTION_TYPES = ["full", "partial"] as const

// --- Output Schemas ---

const employeeCappingExceptionOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  employeeId: z.string(),
  cappingRuleId: z.string(),
  exemptionType: z.string(),
  retainDays: z.number().nullable(),
  year: z.number().nullable(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type EmployeeCappingExceptionOutput = z.infer<
  typeof employeeCappingExceptionOutputSchema
>

// --- Input Schemas ---

const createEmployeeCappingExceptionInputSchema = z.object({
  employeeId: z.string(),
  cappingRuleId: z.string(),
  exemptionType: z.enum(EXEMPTION_TYPES),
  retainDays: z.number().min(0).optional(),
  year: z.number().int().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional().default(true),
})

const updateEmployeeCappingExceptionInputSchema = z.object({
  id: z.string(),
  exemptionType: z.enum(EXEMPTION_TYPES).optional(),
  retainDays: z.number().min(0).nullable().optional(),
  year: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

// --- Helpers ---

function decimalToNumber(
  val: Prisma.Decimal | null | undefined
): number | null {
  if (val === null || val === undefined) return null
  return Number(val)
}

function mapToOutput(
  r: Record<string, unknown>
): EmployeeCappingExceptionOutput {
  return {
    id: r.id as string,
    tenantId: r.tenantId as string,
    employeeId: r.employeeId as string,
    cappingRuleId: r.cappingRuleId as string,
    exemptionType: r.exemptionType as string,
    retainDays: decimalToNumber(
      r.retainDays as Prisma.Decimal | null | undefined
    ),
    year: (r.year as number | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    isActive: r.isActive as boolean,
    createdAt: r.createdAt as Date,
    updatedAt: r.updatedAt as Date,
  }
}

// --- Router ---

export const employeeCappingExceptionsRouter = createTRPCRouter({
  /**
   * employeeCappingExceptions.list -- Returns exceptions for the current tenant.
   *
   * Supports optional filters: employeeId, cappingRuleId, year.
   * Year filter matches both specific year AND null-year entries (per Go behavior).
   * Orders by createdAt DESC.
   *
   * Requires: vacation_config.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(VACATION_CONFIG_MANAGE))
    .use(applyDataScope())
    .input(
      z
        .object({
          employeeId: z.string().optional(),
          cappingRuleId: z.string().optional(),
          year: z.number().int().optional(),
        })
        .optional()
    )
    .output(
      z.object({ data: z.array(employeeCappingExceptionOutputSchema) })
    )
    .query(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const scopeWhere = buildRelatedEmployeeDataScopeWhere(dataScope)
        const items = await employeeCappingExceptionService.list(
          ctx.prisma,
          ctx.tenantId!,
          input
            ? {
                employeeId: input.employeeId,
                cappingRuleId: input.cappingRuleId,
                year: input.year,
              }
            : undefined,
          scopeWhere
        )
        return {
          data: items.map((item) =>
            mapToOutput(item as unknown as Record<string, unknown>)
          ),
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeCappingExceptions.getById -- Returns a single exception by ID.
   *
   * Requires: vacation_config.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(VACATION_CONFIG_MANAGE))
    .use(applyDataScope())
    .input(z.object({ id: z.string() }))
    .output(employeeCappingExceptionOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const item = await employeeCappingExceptionService.getById(
          ctx.prisma,
          ctx.tenantId!,
          input.id
        )
        const employee = await ctx.prisma.employee.findFirst({
          where: { id: (item as unknown as Record<string, unknown>).employeeId as string, tenantId: ctx.tenantId!, deletedAt: null },
          select: { id: true, departmentId: true },
        })
        if (employee) {
          checkRelatedEmployeeDataScope(dataScope, {
            employeeId: employee.id,
            employee: { departmentId: employee.departmentId },
          }, "EmployeeCappingException")
        }
        return mapToOutput(item as unknown as Record<string, unknown>)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeCappingExceptions.create -- Creates a new exception.
   *
   * Validates:
   * - Capping rule exists
   * - RetainDays required for partial exemption type
   * - Uniqueness by employee + rule + year
   *
   * Requires: vacation_config.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(VACATION_CONFIG_MANAGE))
    .use(applyDataScope())
    .input(createEmployeeCappingExceptionInputSchema)
    .output(employeeCappingExceptionOutputSchema)
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
          }, "EmployeeCappingException")
        }
        const created = await employeeCappingExceptionService.create(
          ctx.prisma,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapToOutput(created as unknown as Record<string, unknown>)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeCappingExceptions.update -- Updates an existing exception.
   *
   * Supports partial updates. Validates retainDays required for partial type
   * after all changes applied.
   *
   * Requires: vacation_config.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(VACATION_CONFIG_MANAGE))
    .use(applyDataScope())
    .input(updateEmployeeCappingExceptionInputSchema)
    .output(employeeCappingExceptionOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const existing = await ctx.prisma.employeeCappingException.findFirst({
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
            }, "EmployeeCappingException")
          }
        }
        const updated = await employeeCappingExceptionService.update(
          ctx.prisma,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapToOutput(updated as unknown as Record<string, unknown>)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeCappingExceptions.delete -- Deletes an exception.
   *
   * Requires: vacation_config.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(VACATION_CONFIG_MANAGE))
    .use(applyDataScope())
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const existing = await ctx.prisma.employeeCappingException.findFirst({
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
            }, "EmployeeCappingException")
          }
        }
        await employeeCappingExceptionService.remove(
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
