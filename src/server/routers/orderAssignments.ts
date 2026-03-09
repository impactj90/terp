/**
 * Order Assignments Router
 *
 * Provides order assignment CRUD operations via tRPC procedures.
 * Includes relation data for both Order and Employee in responses.
 *
 * Replaces the Go backend order assignment endpoints:
 * - GET /order-assignments -> orderAssignments.list
 * - GET /order-assignments/{id} -> orderAssignments.getById
 * - GET /orders/{id}/assignments -> orderAssignments.byOrder
 * - POST /order-assignments -> orderAssignments.create
 * - PATCH /order-assignments/{id} -> orderAssignments.update
 * - DELETE /order-assignments/{id} -> orderAssignments.delete
 *
 * @see apps/api/internal/service/order_assignment.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const ORDER_ASSIGNMENTS_MANAGE = permissionIdByKey("order_assignments.manage")!

// --- Output Schemas ---

const orderIncludeSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
})

const employeeIncludeSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  personnelNumber: z.string(),
})

const orderAssignmentOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  orderId: z.string().uuid(),
  employeeId: z.string().uuid(),
  role: z.string(),
  validFrom: z.date().nullable(),
  validTo: z.date().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  order: orderIncludeSchema,
  employee: employeeIncludeSchema,
})

type OrderAssignmentOutput = z.infer<typeof orderAssignmentOutputSchema>

// --- Input Schemas ---

const createOrderAssignmentInputSchema = z.object({
  orderId: z.string().uuid(),
  employeeId: z.string().uuid(),
  role: z.string().optional(),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
})

const updateOrderAssignmentInputSchema = z.object({
  id: z.string().uuid(),
  role: z.string().optional(),
  validFrom: z.string().nullable().optional(),
  validTo: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

// --- Prisma include for relation preloads ---

const assignmentInclude = {
  order: { select: { id: true, code: true, name: true } },
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      personnelNumber: true,
    },
  },
} as const

// --- Helpers ---

/**
 * Maps a Prisma OrderAssignment record (with includes) to the output schema shape.
 */
function mapAssignmentToOutput(
  a: {
    id: string
    tenantId: string
    orderId: string
    employeeId: string
    role: string
    validFrom: Date | null
    validTo: Date | null
    isActive: boolean
    createdAt: Date
    updatedAt: Date
    order: { id: string; code: string; name: string }
    employee: {
      id: string
      firstName: string
      lastName: string
      personnelNumber: string
    }
  }
): OrderAssignmentOutput {
  return {
    id: a.id,
    tenantId: a.tenantId,
    orderId: a.orderId,
    employeeId: a.employeeId,
    role: a.role,
    validFrom: a.validFrom,
    validTo: a.validTo,
    isActive: a.isActive,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    order: a.order,
    employee: a.employee,
  }
}

/**
 * Parses an ISO date string ("2026-01-15") into a Date at midnight UTC.
 */
function parseDate(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00Z")
}

/**
 * Checks if a Prisma error is a unique constraint violation (P2002).
 */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  )
}

// --- Router ---

export const orderAssignmentsRouter = createTRPCRouter({
  /**
   * orderAssignments.list -- Returns order assignments for the current tenant.
   *
   * Supports optional filters: orderId, employeeId.
   * Orders by createdAt DESC.
   * Includes order and employee relation data.
   *
   * Requires: order_assignments.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(ORDER_ASSIGNMENTS_MANAGE))
    .input(
      z
        .object({
          orderId: z.string().uuid().optional(),
          employeeId: z.string().uuid().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(orderAssignmentOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const where: Record<string, unknown> = { tenantId }

      if (input?.orderId !== undefined) {
        where.orderId = input.orderId
      }
      if (input?.employeeId !== undefined) {
        where.employeeId = input.employeeId
      }

      const assignments = await ctx.prisma.orderAssignment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: assignmentInclude,
      })

      return {
        data: assignments.map(mapAssignmentToOutput),
      }
    }),

  /**
   * orderAssignments.getById -- Returns a single order assignment by ID.
   *
   * Tenant-scoped. Includes order and employee relation data.
   *
   * Requires: order_assignments.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(ORDER_ASSIGNMENTS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(orderAssignmentOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const assignment = await ctx.prisma.orderAssignment.findFirst({
        where: { id: input.id, tenantId },
        include: assignmentInclude,
      })

      if (!assignment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order assignment not found",
        })
      }

      return mapAssignmentToOutput(assignment)
    }),

  /**
   * orderAssignments.byOrder -- Returns assignments for a specific order.
   *
   * Orders by role ASC, createdAt DESC.
   * Includes employee details.
   *
   * Requires: order_assignments.manage permission
   */
  byOrder: tenantProcedure
    .use(requirePermission(ORDER_ASSIGNMENTS_MANAGE))
    .input(z.object({ orderId: z.string().uuid() }))
    .output(z.object({ data: z.array(orderAssignmentOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const assignments = await ctx.prisma.orderAssignment.findMany({
        where: { tenantId, orderId: input.orderId },
        orderBy: [{ role: "asc" }, { createdAt: "desc" }],
        include: assignmentInclude,
      })

      return {
        data: assignments.map(mapAssignmentToOutput),
      }
    }),

  /**
   * orderAssignments.create -- Creates a new order assignment.
   *
   * Defaults role to "worker". Sets isActive to true.
   * Catches unique constraint violation on (orderId, employeeId, role) -> CONFLICT.
   * Re-fetches with relation preloads after creation.
   *
   * Requires: order_assignments.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(ORDER_ASSIGNMENTS_MANAGE))
    .input(createOrderAssignmentInputSchema)
    .output(orderAssignmentOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      let created: { id: string }
      try {
        created = await ctx.prisma.orderAssignment.create({
          data: {
            tenantId,
            orderId: input.orderId,
            employeeId: input.employeeId,
            role: input.role || "worker",
            isActive: true,
            validFrom: input.validFrom ? parseDate(input.validFrom) : undefined,
            validTo: input.validTo ? parseDate(input.validTo) : undefined,
          },
        })
      } catch (error: unknown) {
        if (isUniqueConstraintError(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Order assignment already exists for this employee, order, and role",
          })
        }
        throw error
      }

      // Re-fetch with relation preloads
      const assignment = await ctx.prisma.orderAssignment.findUniqueOrThrow({
        where: { id: created.id },
        include: assignmentInclude,
      })

      return mapAssignmentToOutput(assignment)
    }),

  /**
   * orderAssignments.update -- Updates an existing order assignment.
   *
   * Supports partial update of role, validFrom, validTo, isActive.
   * Re-fetches with relation preloads after update.
   *
   * Requires: order_assignments.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(ORDER_ASSIGNMENTS_MANAGE))
    .input(updateOrderAssignmentInputSchema)
    .output(orderAssignmentOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify assignment exists (tenant-scoped)
      const existing = await ctx.prisma.orderAssignment.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order assignment not found",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = {}

      if (input.role !== undefined) {
        data.role = input.role
      }
      if (input.validFrom !== undefined) {
        data.validFrom =
          input.validFrom === null ? null : parseDate(input.validFrom)
      }
      if (input.validTo !== undefined) {
        data.validTo =
          input.validTo === null ? null : parseDate(input.validTo)
      }
      if (input.isActive !== undefined) {
        data.isActive = input.isActive
      }

      await ctx.prisma.orderAssignment.update({
        where: { id: input.id },
        data,
      })

      // Re-fetch with relation preloads
      const assignment = await ctx.prisma.orderAssignment.findUniqueOrThrow({
        where: { id: input.id },
        include: assignmentInclude,
      })

      return mapAssignmentToOutput(assignment)
    }),

  /**
   * orderAssignments.delete -- Deletes an order assignment.
   *
   * Requires: order_assignments.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(ORDER_ASSIGNMENTS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify assignment exists (tenant-scoped)
      const existing = await ctx.prisma.orderAssignment.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order assignment not found",
        })
      }

      // Hard delete
      await ctx.prisma.orderAssignment.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
