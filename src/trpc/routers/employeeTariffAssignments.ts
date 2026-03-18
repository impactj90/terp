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
import type { PrismaClient } from "@/generated/prisma/client"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission, applyDataScope, type DataScope } from "@/lib/auth/middleware"
import { checkRelatedEmployeeDataScope } from "@/lib/auth/data-scope"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"

// --- Permission Constants ---

const EMPLOYEES_VIEW = permissionIdByKey("employees.view")!
const EMPLOYEES_EDIT = permissionIdByKey("employees.edit")!

// --- Output Schemas ---

const employeeTariffAssignmentOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  employeeId: z.string(),
  tariffId: z.string(),
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

/**
 * Checks whether a new/updated assignment overlaps with existing active assignments.
 * Ported from Go repository/employeetariffassignment.go:149-172.
 *
 * Overlap logic: A.start <= B.end AND A.end >= B.start (NULL end = infinity).
 */
async function hasOverlap(
  prisma: PrismaClient,
  employeeId: string,
  effectiveFrom: Date,
  effectiveTo: Date | null,
  excludeId?: string
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {
    employeeId,
    isActive: true,
  }

  // Overlap condition: existing.start <= new.end AND existing.end >= new.start
  // When effectiveTo is null (infinity), we only need existing.end >= new.start
  if (effectiveTo) {
    where.effectiveFrom = { lte: effectiveTo }
  }

  where.OR = [
    { effectiveTo: null }, // existing has no end date (infinite)
    { effectiveTo: { gte: effectiveFrom } }, // existing end >= new start
  ]

  if (excludeId) {
    where.NOT = { id: excludeId }
  }

  const count = await prisma.employeeTariffAssignment.count({ where })
  return count > 0
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
   * Validates dates, checks for overlapping assignments.
   * Defaults overwriteBehavior to "preserve_manual".
   *
   * Requires: employees.edit permission
   *
   * NOTE: Day plan sync and vacation recalculation are deferred (depend on Tariff model).
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

        // Validate date range
        const effectiveTo = input.effectiveTo ?? null
        if (effectiveTo && effectiveTo < input.effectiveFrom) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Effective to date cannot be before effective from date",
          })
        }

        // Use transaction for atomic overlap check + create
        const assignment = await ctx.prisma.$transaction(async (tx) => {
          const overlap = await hasOverlap(
            tx as unknown as PrismaClient,
            input.employeeId,
            input.effectiveFrom,
            effectiveTo
          )
          if (overlap) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Overlapping tariff assignment exists",
            })
          }

          return tx.employeeTariffAssignment.create({
            data: {
              tenantId,
              employeeId: input.employeeId,
              tariffId: input.tariffId,
              effectiveFrom: input.effectiveFrom,
              effectiveTo,
              overwriteBehavior: input.overwriteBehavior?.trim() || "preserve_manual",
              notes: input.notes?.trim() || null,
              isActive: true,
            },
          })
        })

        return mapAssignmentToOutput(assignment)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeTariffAssignments.update -- Updates a tariff assignment.
   *
   * Supports partial updates. Re-checks overlap when dates change (excluding self).
   *
   * Requires: employees.edit permission
   *
   * NOTE: Day plan resync is deferred.
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

        // Fetch existing assignment, verify tenant/employee match
        const existing =
          await ctx.prisma.employeeTariffAssignment.findFirst({
            where: {
              id: input.id,
              employeeId: input.employeeId,
              tenantId,
            },
          })

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Tariff assignment not found",
          })
        }

        // Build partial update data
        const data: Record<string, unknown> = {}

        if (input.effectiveFrom !== undefined) {
          data.effectiveFrom = input.effectiveFrom
        }
        if (input.effectiveTo !== undefined) {
          data.effectiveTo = input.effectiveTo
        }
        if (input.overwriteBehavior !== undefined) {
          data.overwriteBehavior = input.overwriteBehavior.trim()
        }
        if (input.notes !== undefined) {
          data.notes =
            input.notes === null ? null : input.notes.trim() || null
        }
        if (input.isActive !== undefined) {
          data.isActive = input.isActive
        }

        // If dates changed, validate and re-check overlap
        const effectiveFrom =
          (data.effectiveFrom as Date | undefined) ?? existing.effectiveFrom
        const effectiveTo =
          data.effectiveTo !== undefined
            ? (data.effectiveTo as Date | null)
            : existing.effectiveTo

        if (effectiveTo && effectiveTo < effectiveFrom) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Effective to date cannot be before effective from date",
          })
        }

        // Use transaction for atomic overlap check + update
        const assignment = await ctx.prisma.$transaction(async (tx) => {
          if (
            input.effectiveFrom !== undefined ||
            input.effectiveTo !== undefined
          ) {
            const overlap = await hasOverlap(
              tx as unknown as PrismaClient,
              input.employeeId,
              effectiveFrom,
              effectiveTo,
              input.id
            )
            if (overlap) {
              throw new TRPCError({
                code: "CONFLICT",
                message: "Overlapping tariff assignment exists",
              })
            }
          }

          return tx.employeeTariffAssignment.update({
            where: { id: input.id },
            data,
          })
        })

        return mapAssignmentToOutput(assignment)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeTariffAssignments.delete -- Hard deletes a tariff assignment.
   *
   * Verifies the assignment belongs to the correct employee and tenant.
   *
   * Requires: employees.edit permission
   *
   * NOTE: Day plan resync is deferred.
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

        // Fetch assignment, verify tenant/employee match
        const existing =
          await ctx.prisma.employeeTariffAssignment.findFirst({
            where: {
              id: input.id,
              employeeId: input.employeeId,
              tenantId,
            },
          })

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Tariff assignment not found",
          })
        }

        // Hard delete
        await ctx.prisma.employeeTariffAssignment.delete({
          where: { id: input.id },
        })

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
