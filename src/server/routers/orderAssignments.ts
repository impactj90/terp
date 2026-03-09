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
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as orderAssignmentService from "@/lib/services/order-assignment-service"

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
      try {
        const tenantId = ctx.tenantId!
        const assignments = await orderAssignmentService.list(
          ctx.prisma,
          tenantId,
          {
            orderId: input?.orderId,
            employeeId: input?.employeeId,
          }
        )
        return { data: assignments.map(mapAssignmentToOutput) }
      } catch (err) {
        handleServiceError(err)
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
      try {
        const tenantId = ctx.tenantId!
        const assignment = await orderAssignmentService.getById(
          ctx.prisma,
          tenantId,
          input.id
        )
        return mapAssignmentToOutput(assignment)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const tenantId = ctx.tenantId!
        const assignments = await orderAssignmentService.byOrder(
          ctx.prisma,
          tenantId,
          input.orderId
        )
        return { data: assignments.map(mapAssignmentToOutput) }
      } catch (err) {
        handleServiceError(err)
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
      try {
        const tenantId = ctx.tenantId!
        const assignment = await orderAssignmentService.create(
          ctx.prisma,
          tenantId,
          input
        )
        return mapAssignmentToOutput(assignment)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const tenantId = ctx.tenantId!
        const assignment = await orderAssignmentService.update(
          ctx.prisma,
          tenantId,
          input
        )
        return mapAssignmentToOutput(assignment)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const tenantId = ctx.tenantId!
        await orderAssignmentService.remove(ctx.prisma, tenantId, input.id)
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
