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
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const ACCESS_CONTROL_MANAGE = permissionIdByKey("access_control.manage")!

// --- Output Schemas ---

const employeeAccessAssignmentOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  accessProfileId: z.string().uuid(),
  validFrom: z.date().nullable(),
  validTo: z.date().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  employee: z
    .object({
      id: z.string().uuid(),
      firstName: z.string(),
      lastName: z.string(),
      personnelNumber: z.string().nullable(),
    })
    .optional(),
  accessProfile: z
    .object({
      id: z.string().uuid(),
      code: z.string(),
      name: z.string(),
    })
    .optional(),
})

// --- Input Schemas ---

const createEmployeeAccessAssignmentInputSchema = z.object({
  employeeId: z.string().uuid(),
  accessProfileId: z.string().uuid(),
  validFrom: z.string().date().optional(),
  validTo: z.string().date().optional(),
})

const updateEmployeeAccessAssignmentInputSchema = z.object({
  id: z.string().uuid(),
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
    .input(z.void().optional())
    .output(
      z.object({ data: z.array(employeeAccessAssignmentOutputSchema) })
    )
    .query(async ({ ctx }) => {
      const tenantId = ctx.tenantId!

      const assignments =
        await ctx.prisma.employeeAccessAssignment.findMany({
          where: { tenantId },
          orderBy: { createdAt: "desc" },
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                personnelNumber: true,
              },
            },
            accessProfile: {
              select: { id: true, code: true, name: true },
            },
          },
        })

      return {
        data: assignments.map(mapAssignment),
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
    .input(z.object({ id: z.string().uuid() }))
    .output(employeeAccessAssignmentOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const assignment =
        await ctx.prisma.employeeAccessAssignment.findFirst({
          where: { id: input.id, tenantId },
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                personnelNumber: true,
              },
            },
            accessProfile: {
              select: { id: true, code: true, name: true },
            },
          },
        })

      if (!assignment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Employee access assignment not found",
        })
      }

      return mapAssignment(assignment)
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
    .input(createEmployeeAccessAssignmentInputSchema)
    .output(employeeAccessAssignmentOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify employee exists in same tenant
      const employee = await ctx.prisma.employee.findFirst({
        where: { id: input.employeeId, tenantId },
      })
      if (!employee) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Employee not found",
        })
      }

      // Verify access profile exists in same tenant
      const accessProfile = await ctx.prisma.accessProfile.findFirst({
        where: { id: input.accessProfileId, tenantId },
      })
      if (!accessProfile) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Access profile not found",
        })
      }

      const assignment =
        await ctx.prisma.employeeAccessAssignment.create({
          data: {
            tenantId,
            employeeId: input.employeeId,
            accessProfileId: input.accessProfileId,
            validFrom: input.validFrom
              ? new Date(input.validFrom)
              : null,
            validTo: input.validTo ? new Date(input.validTo) : null,
            isActive: true,
          },
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                personnelNumber: true,
              },
            },
            accessProfile: {
              select: { id: true, code: true, name: true },
            },
          },
        })

      return mapAssignment(assignment)
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
    .input(updateEmployeeAccessAssignmentInputSchema)
    .output(employeeAccessAssignmentOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify assignment exists (tenant-scoped)
      const existing =
        await ctx.prisma.employeeAccessAssignment.findFirst({
          where: { id: input.id, tenantId },
        })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Employee access assignment not found",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = {}

      if (input.validFrom !== undefined) {
        data.validFrom =
          input.validFrom === null ? null : new Date(input.validFrom)
      }

      if (input.validTo !== undefined) {
        data.validTo =
          input.validTo === null ? null : new Date(input.validTo)
      }

      if (input.isActive !== undefined) {
        data.isActive = input.isActive
      }

      const assignment =
        await ctx.prisma.employeeAccessAssignment.update({
          where: { id: input.id },
          data,
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                personnelNumber: true,
              },
            },
            accessProfile: {
              select: { id: true, code: true, name: true },
            },
          },
        })

      return mapAssignment(assignment)
    }),

  /**
   * employeeAccessAssignments.delete -- Deletes an assignment.
   *
   * Requires: access_control.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(ACCESS_CONTROL_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify assignment exists (tenant-scoped)
      const existing =
        await ctx.prisma.employeeAccessAssignment.findFirst({
          where: { id: input.id, tenantId },
        })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Employee access assignment not found",
        })
      }

      // Hard delete
      await ctx.prisma.employeeAccessAssignment.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
