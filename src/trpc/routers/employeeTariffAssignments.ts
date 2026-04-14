/**
 * Employee Tariff Assignments Router
 *
 * Provides employee tariff assignment CRUD and effective tariff resolution
 * via tRPC procedures.
 * Replaces the Go backend employee tariff assignment endpoints:
 * - GET /employees/{id}/tariff-assignments -> employeeTariffAssignments.list
 * - POST /employees/{id}/tariff-assignments -> employeeTariffAssignments.create
 * - GET /employees/{id}/tariff-assignments/{assignmentId} -> employeeTariffAssignments.getById
 * - PUT /employees/{id}/tariff-assignments/{assignmentId} -> employeeTariffAssignments.update
 * - DELETE /employees/{id}/tariff-assignments/{assignmentId} -> employeeTariffAssignments.delete
 * - GET /employees/{id}/effective-tariff -> employeeTariffAssignments.effective
 *
 * @see apps/api/internal/service/employeetariffassignment.go
 * @see apps/api/internal/handler/employeetariffassignment.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission, applyDataScope, type DataScope } from "@/lib/auth/middleware"
import { checkRelatedEmployeeDataScope } from "@/lib/auth/data-scope"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as employeeTariffAssignmentService from "@/lib/services/employee-tariff-assignment-service"

// --- Permission Constants ---

const EMPLOYEES_VIEW = permissionIdByKey("employees.view")!
const EMPLOYEES_EDIT = permissionIdByKey("employees.edit")!

// --- Output Schemas ---

const employeeTariffAssignmentOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  employeeId: z.string(),
  tariffId: z.string(),
  tariff: z.object({ id: z.string(), code: z.string(), name: z.string() }).nullable().optional(),
  effectiveFrom: z.date(),
  effectiveTo: z.date().nullable(),
  overwriteBehavior: z.string(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type EmployeeTariffAssignmentOutput = z.infer<
  typeof employeeTariffAssignmentOutputSchema
>

const effectiveTariffOutputSchema = z.object({
  tariffId: z.string().nullable(),
  tariffLabel: z.string().nullable().optional(),
  source: z.enum(["assignment", "default", "none"]),
  assignmentId: z.string().nullable(),
})

// --- Helpers ---

/**
 * Maps a Prisma EmployeeTariffAssignment record to the output schema shape.
 */
function mapAssignmentToOutput(a: {
  id: string
  tenantId: string
  employeeId: string
  tariffId: string
  effectiveFrom: Date
  effectiveTo: Date | null
  overwriteBehavior: string
  notes: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}): EmployeeTariffAssignmentOutput {
  return {
    id: a.id,
    tenantId: a.tenantId,
    employeeId: a.employeeId,
    tariffId: a.tariffId,
    effectiveFrom: a.effectiveFrom,
    effectiveTo: a.effectiveTo,
    overwriteBehavior: a.overwriteBehavior,
    notes: a.notes,
    isActive: a.isActive,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }
}

// --- Router ---

export const employeeTariffAssignmentsRouter = createTRPCRouter({
  /**
   * employeeTariffAssignments.list -- Returns tariff assignments for an employee.
   *
   * Verifies employee belongs to tenant.
   * Optionally filters by isActive. Orders by effectiveFrom descending.
   *
   * Requires: employees.view permission
   */
  list: tenantProcedure
    .use(requirePermission(EMPLOYEES_VIEW))
    .use(applyDataScope())
    .input(
      z.object({
        employeeId: z.string(),
        isActive: z.boolean().optional(),
      })
    )
    .output(
      z.object({ data: z.array(employeeTariffAssignmentOutputSchema) })
    )
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

        // Verify employee exists and belongs to tenant
        const employee = await ctx.prisma.employee.findFirst({
          where: { id: input.employeeId, tenantId, deletedAt: null },
          select: { id: true, departmentId: true },
        })
        if (!employee) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Employee not found",
          })
        }
        checkRelatedEmployeeDataScope(dataScope, {
          employeeId: employee.id,
          employee: { departmentId: employee.departmentId },
        }, "EmployeeTariffAssignment")

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const where: Record<string, any> = { employeeId: input.employeeId }
        if (input.isActive !== undefined) {
          where.isActive = input.isActive
        }

        const assignments =
          await ctx.prisma.employeeTariffAssignment.findMany({
            where,
            orderBy: { effectiveFrom: "desc" },
            include: { tariff: { select: { id: true, code: true, name: true } } },
          })

        return {
          data: assignments.map((a) => ({
            ...mapAssignmentToOutput(a),
            tariff: a.tariff ? { id: a.tariff.id, code: a.tariff.code, name: a.tariff.name } : null,
          })),
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeTariffAssignments.getById -- Returns a single tariff assignment.
   *
   * Verifies the assignment belongs to the correct employee and tenant.
   *
   * Requires: employees.view permission
   */
  getById: tenantProcedure
    .use(requirePermission(EMPLOYEES_VIEW))
    .use(applyDataScope())
    .input(
      z.object({
        employeeId: z.string(),
        id: z.string(),
      })
    )
    .output(employeeTariffAssignmentOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

        // Check scope on target employee
        const employee = await ctx.prisma.employee.findFirst({
          where: { id: input.employeeId, tenantId, deletedAt: null },
          select: { id: true, departmentId: true },
        })
        if (employee) {
          checkRelatedEmployeeDataScope(dataScope, {
            employeeId: employee.id,
            employee: { departmentId: employee.departmentId },
          }, "EmployeeTariffAssignment")
        }

        const assignment =
          await ctx.prisma.employeeTariffAssignment.findFirst({
            where: {
              id: input.id,
              employeeId: input.employeeId,
              tenantId,
            },
          })

        if (!assignment) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Tariff assignment not found",
          })
        }

        return mapAssignmentToOutput(assignment)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeTariffAssignments.create -- Creates a new tariff assignment.
   *
   * Delegates to the service, which performs an atomic overlap check +
   * create and then post-commit regenerates EmployeeDayPlan rows and
   * triggers daily value recalculation for the affected range.
   *
   * Requires: employees.edit permission
   */
  create: tenantProcedure
    .use(requirePermission(EMPLOYEES_EDIT))
    .use(applyDataScope())
    .input(
      z.object({
        employeeId: z.string(),
        tariffId: z.string(),
        effectiveFrom: z.coerce.date(),
        effectiveTo: z.coerce.date().optional(),
        overwriteBehavior: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .output(employeeTariffAssignmentOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

        const assignment = await employeeTariffAssignmentService.create(
          ctx.prisma,
          tenantId,
          input,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
          dataScope,
        )

        return mapAssignmentToOutput(assignment)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeTariffAssignments.update -- Updates a tariff assignment.
   *
   * Supports partial updates. Re-checks overlap when dates change
   * (excluding self). If date fields change, post-commit regenerates day
   * plans and triggers daily value recalculation for the union of the old
   * and new ranges.
   *
   * Requires: employees.edit permission
   */
  update: tenantProcedure
    .use(requirePermission(EMPLOYEES_EDIT))
    .use(applyDataScope())
    .input(
      z.object({
        employeeId: z.string(),
        id: z.string(),
        effectiveFrom: z.coerce.date().optional(),
        effectiveTo: z.coerce.date().nullable().optional(),
        overwriteBehavior: z.string().optional(),
        notes: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .output(employeeTariffAssignmentOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

        const assignment = await employeeTariffAssignmentService.update(
          ctx.prisma,
          tenantId,
          input,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
          dataScope
        )

        return mapAssignmentToOutput(assignment)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeTariffAssignments.delete -- Hard deletes a tariff assignment.
   *
   * Verifies the assignment belongs to the correct employee and tenant.
   * Post-commit cleans up tariff-source day plans for the removed
   * assignment's range and recalculates daily values.
   *
   * Requires: employees.edit permission
   */
  delete: tenantProcedure
    .use(requirePermission(EMPLOYEES_EDIT))
    .use(applyDataScope())
    .input(
      z.object({
        employeeId: z.string(),
        id: z.string(),
      })
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

        await employeeTariffAssignmentService.remove(
          ctx.prisma,
          tenantId,
          input.employeeId,
          input.id,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
          dataScope
        )

        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeTariffAssignments.effective -- Returns the effective tariff for a date.
   *
   * Resolution order:
   * 1. Find active assignment covering the date
   * 2. Fall back to employee's default tariffId
   * 3. Return source="none" if no tariff
   *
   * Requires: employees.view permission
   */
  effective: tenantProcedure
    .use(requirePermission(EMPLOYEES_VIEW))
    .use(applyDataScope())
    .input(
      z.object({
        employeeId: z.string(),
        date: z.string().date(),
      })
    )
    .output(effectiveTariffOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

        // Parse date
        const date = new Date(input.date)
        if (isNaN(date.getTime())) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid date",
          })
        }

        // Verify employee exists and belongs to tenant
        const employee = await ctx.prisma.employee.findFirst({
          where: { id: input.employeeId, tenantId, deletedAt: null },
          select: { id: true, tariffId: true, departmentId: true },
        })
        if (!employee) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Employee not found",
          })
        }
        checkRelatedEmployeeDataScope(dataScope, {
          employeeId: employee.id,
          employee: { departmentId: employee.departmentId },
        }, "EmployeeTariffAssignment")

        // Find active assignment covering the date
        const assignment =
          await ctx.prisma.employeeTariffAssignment.findFirst({
            where: {
              employeeId: input.employeeId,
              isActive: true,
              effectiveFrom: { lte: date },
              OR: [
                { effectiveTo: null },
                { effectiveTo: { gte: date } },
              ],
            },
            orderBy: { effectiveFrom: "desc" },
            include: { tariff: { select: { id: true, code: true, name: true } } },
          })

        if (assignment) {
          return {
            tariffId: assignment.tariffId,
            tariffLabel: assignment.tariff ? `${assignment.tariff.code} — ${assignment.tariff.name}` : null,
            source: "assignment" as const,
            assignmentId: assignment.id,
          }
        }

        // Fall back to employee's default tariffId
        if (employee.tariffId) {
          return {
            tariffId: employee.tariffId,
            source: "default" as const,
            assignmentId: null,
          }
        }

        // No tariff
        return {
          tariffId: null,
          source: "none" as const,
          assignmentId: null,
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
