/**
 * Employee Access Assignments Router
 *
 * Provides employee access assignment CRUD operations via tRPC procedures.
 *
 * Replaces the Go backend employee access assignment endpoints:
 * - GET /employee-access-assignments -> employeeAccessAssignments.list
 * - GET /employee-access-assignments/{id} -> employeeAccessAssignments.getById
 * - POST /employee-access-assignments -> employeeAccessAssignments.create
 * - PATCH /employee-access-assignments/{id} -> employeeAccessAssignments.update
 * - DELETE /employee-access-assignments/{id} -> employeeAccessAssignments.delete
 *
 * @see apps/api/internal/service/employee_access_assignment.go
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission, applyDataScope, type DataScope } from "@/lib/auth/middleware"
import { checkRelatedEmployeeDataScope, buildRelatedEmployeeDataScopeWhere } from "@/lib/auth/data-scope"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as employeeAccessAssignmentService from "@/lib/services/employee-access-assignment-service"

// --- Permission Constants ---

const ACCESS_CONTROL_MANAGE = permissionIdByKey("access_control.manage")!

// --- Output Schemas ---

const employeeAccessAssignmentOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  employeeId: z.string(),
  accessProfileId: z.string(),
  validFrom: z.date().nullable(),
  validTo: z.date().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  employee: z
    .object({
      id: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      personnelNumber: z.string().nullable(),
    })
    .optional(),
  accessProfile: z
    .object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
    })
    .optional(),
})

// --- Input Schemas ---

const createEmployeeAccessAssignmentInputSchema = z.object({
  employeeId: z.string(),
  accessProfileId: z.string(),
  validFrom: z.string().date().optional(),
  validTo: z.string().date().optional(),
})

const updateEmployeeAccessAssignmentInputSchema = z.object({
  id: z.string(),
  // EmployeeID and AccessProfileID are NOT updatable
  validFrom: z.string().date().nullable().optional(),
  validTo: z.string().date().nullable().optional(),
  isActive: z.boolean().optional(),
})

// --- Helper ---

function mapAssignment(a: {
  id: string
  tenantId: string
  employeeId: string
  accessProfileId: string
  validFrom: Date | null
  validTo: Date | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  employee?: {
    id: string
    firstName: string
    lastName: string
    personnelNumber: string | null
  } | null
  accessProfile?: {
    id: string
    code: string
    name: string
  } | null
}) {
  return {
    id: a.id,
    tenantId: a.tenantId,
    employeeId: a.employeeId,
    accessProfileId: a.accessProfileId,
    validFrom: a.validFrom,
    validTo: a.validTo,
    isActive: a.isActive,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    ...(a.employee
      ? {
          employee: {
            id: a.employee.id,
            firstName: a.employee.firstName,
            lastName: a.employee.lastName,
            personnelNumber: a.employee.personnelNumber,
          },
        }
      : {}),
    ...(a.accessProfile
      ? {
          accessProfile: {
            id: a.accessProfile.id,
            code: a.accessProfile.code,
            name: a.accessProfile.name,
          },
        }
      : {}),
  }
}

// --- Router ---

export const employeeAccessAssignmentsRouter = createTRPCRouter({
  /**
   * employeeAccessAssignments.list -- Returns all assignments for the current tenant.
   *
   * Orders by createdAt DESC. Includes employee and accessProfile relations.
   *
   * Requires: access_control.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(ACCESS_CONTROL_MANAGE))
    .use(applyDataScope())
    .input(z.void().optional())
    .output(
      z.object({ data: z.array(employeeAccessAssignmentOutputSchema) })
    )
    .query(async ({ ctx }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const scopeWhere = buildRelatedEmployeeDataScopeWhere(dataScope)
        const assignments = await employeeAccessAssignmentService.list(
          ctx.prisma,
          ctx.tenantId!,
          scopeWhere
        )
        return { data: assignments.map(mapAssignment) }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeAccessAssignments.getById -- Returns a single assignment by ID.
   *
   * Includes employee and accessProfile relations.
   *
   * Requires: access_control.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(ACCESS_CONTROL_MANAGE))
    .use(applyDataScope())
    .input(z.object({ id: z.string() }))
    .output(employeeAccessAssignmentOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const assignment = await employeeAccessAssignmentService.getById(
          ctx.prisma,
          ctx.tenantId!,
          input.id
        )
        const employee = await ctx.prisma.employee.findFirst({
          where: { id: assignment.employeeId, tenantId: ctx.tenantId!, deletedAt: null },
          select: { id: true, departmentId: true },
        })
        if (employee) {
          checkRelatedEmployeeDataScope(dataScope, {
            employeeId: employee.id,
            employee: { departmentId: employee.departmentId },
          }, "EmployeeAccessAssignment")
        }
        return mapAssignment(assignment)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeAccessAssignments.create -- Creates a new assignment.
   *
   * Validates that referenced employee and access profile exist in the same tenant.
   *
   * Requires: access_control.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(ACCESS_CONTROL_MANAGE))
    .use(applyDataScope())
    .input(createEmployeeAccessAssignmentInputSchema)
    .output(employeeAccessAssignmentOutputSchema)
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
          }, "EmployeeAccessAssignment")
        }
        const assignment = await employeeAccessAssignmentService.create(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
        return mapAssignment(assignment)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeAccessAssignments.update -- Updates an existing assignment.
   *
   * Supports partial updates. EmployeeID and AccessProfileID are NOT updatable.
   *
   * Requires: access_control.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(ACCESS_CONTROL_MANAGE))
    .use(applyDataScope())
    .input(updateEmployeeAccessAssignmentInputSchema)
    .output(employeeAccessAssignmentOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        // Fetch existing to check scope
        const existing = await ctx.prisma.employeeAccessAssignment.findFirst({
          where: { id: input.id, tenantId: ctx.tenantId! },
          include: { employee: { select: { id: true, departmentId: true } } },
        })
        if (existing?.employee) {
          checkRelatedEmployeeDataScope(dataScope, {
            employeeId: existing.employeeId,
            employee: { departmentId: existing.employee.departmentId },
          }, "EmployeeAccessAssignment")
        }
        const assignment = await employeeAccessAssignmentService.update(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
        return mapAssignment(assignment)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeAccessAssignments.delete -- Deletes an assignment.
   *
   * Requires: access_control.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(ACCESS_CONTROL_MANAGE))
    .use(applyDataScope())
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const existing = await ctx.prisma.employeeAccessAssignment.findFirst({
          where: { id: input.id, tenantId: ctx.tenantId! },
          include: { employee: { select: { id: true, departmentId: true } } },
        })
        if (existing?.employee) {
          checkRelatedEmployeeDataScope(dataScope, {
            employeeId: existing.employeeId,
            employee: { departmentId: existing.employee.departmentId },
          }, "EmployeeAccessAssignment")
        }
        await employeeAccessAssignmentService.remove(
          ctx.prisma,
          ctx.tenantId!,
          input.id
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
