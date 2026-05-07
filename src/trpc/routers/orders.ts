/**
 * Orders Router
 *
 * Provides order CRUD operations via tRPC procedures.
 * Includes CostCenter relation data in responses.
 *
 * Replaces the Go backend order endpoints:
 * - GET /orders -> orders.list
 * - GET /orders/{id} -> orders.getById
 * - POST /orders -> orders.create
 * - PATCH /orders/{id} -> orders.update
 * - DELETE /orders/{id} -> orders.delete
 *
 * @see apps/api/internal/service/order.go
 */
import { z } from "zod"
import type { Prisma } from "@/generated/prisma/client"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as orderService from "@/lib/services/order-service"

// --- Permission Constants ---

const ORDERS_MANAGE = permissionIdByKey("orders.manage")!

// --- Output Schemas ---

const costCenterIncludeSchema = z
  .object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
  })
  .nullable()

const orderOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  customer: z.string().nullable(),
  costCenterId: z.string().nullable(),
  costCenter: costCenterIncludeSchema,
  billingRatePerHour: z.number().nullable(),
  validFrom: z.date().nullable(),
  validTo: z.date().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  serviceObjectId: z.string().nullable(),
  // NK-1 (Decision 15)
  orderTypeId: z.string().nullable(),
})

type OrderOutput = z.infer<typeof orderOutputSchema>

// --- Input Schemas ---

const createOrderInputSchema = z.object({
  code: z.string().min(1, "Code is required").max(50),
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().max(2000).optional(),
  status: z.string().max(50).optional(),
  customer: z.string().max(255).optional(),
  costCenterId: z.string().optional(),
  billingRatePerHour: z.number().min(0).max(999999.99).optional(),
  validFrom: z.string().date().optional(),
  validTo: z.string().date().optional(),
  serviceObjectId: z.string().uuid().nullable().optional(),
  // NK-1 (Decision 15)
  orderTypeId: z.string().nullable().optional(),
})

const updateOrderInputSchema = z.object({
  id: z.string(),
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: z.string().max(50).optional(),
  customer: z.string().max(255).nullable().optional(),
  costCenterId: z.string().nullable().optional(),
  billingRatePerHour: z.number().min(0).max(999999.99).nullable().optional(),
  validFrom: z.string().date().nullable().optional(),
  validTo: z.string().date().nullable().optional(),
  isActive: z.boolean().optional(),
  serviceObjectId: z.string().uuid().nullable().optional(),
  // NK-1 (Decision 15)
  orderTypeId: z.string().nullable().optional(),
})

// --- Helpers ---

/**
 * Maps a Prisma Order record (with costCenter include) to the output schema shape.
 */
function mapOrderToOutput(
  o: {
    id: string
    tenantId: string
    code: string
    name: string
    description: string | null
    status: string
    customer: string | null
    costCenterId: string | null
    billingRatePerHour: Prisma.Decimal | null
    validFrom: Date | null
    validTo: Date | null
    isActive: boolean
    createdAt: Date
    updatedAt: Date
    serviceObjectId: string | null
    orderTypeId?: string | null
    costCenter?: { id: string; code: string; name: string } | null
  }
): OrderOutput {
  return {
    id: o.id,
    tenantId: o.tenantId,
    code: o.code,
    name: o.name,
    description: o.description,
    status: o.status,
    customer: o.customer,
    costCenterId: o.costCenterId,
    costCenter: o.costCenter ?? null,
    billingRatePerHour:
      o.billingRatePerHour !== null ? Number(o.billingRatePerHour) : null,
    validFrom: o.validFrom,
    validTo: o.validTo,
    isActive: o.isActive,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    serviceObjectId: o.serviceObjectId,
    orderTypeId: o.orderTypeId ?? null,
  }
}

// --- Router ---

export const ordersRouter = createTRPCRouter({
  /**
   * orders.list -- Returns orders for the current tenant.
   *
   * Supports optional filters: isActive, status.
   * Orders by code ASC.
   * Includes costCenter in response.
   *
   * Requires: orders.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(ORDERS_MANAGE))
    .input(
      z
        .object({
          isActive: z.boolean().optional(),
          status: z.string().max(50).optional(),
          serviceObjectId: z.string().uuid().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(orderOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const orders = await orderService.list(ctx.prisma, ctx.tenantId!, input)
        return {
          data: orders.map(mapOrderToOutput),
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * orders.getById -- Returns a single order by ID.
   *
   * Tenant-scoped: only returns orders belonging to the current tenant.
   * Includes costCenter in response.
   *
   * Requires: orders.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(ORDERS_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(orderOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const order = await orderService.getById(
          ctx.prisma,
          ctx.tenantId!,
          input.id
        )
        return mapOrderToOutput(order)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * orders.create -- Creates a new order.
   *
   * Validates code and name are non-empty after trimming.
   * Checks code uniqueness within tenant.
   * Defaults: status "active", isActive true.
   * Re-fetches with CostCenter preload after creation.
   *
   * Requires: orders.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(ORDERS_MANAGE))
    .input(createOrderInputSchema)
    .output(orderOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const order = await orderService.create(
          ctx.prisma,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapOrderToOutput(order)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * orders.update -- Updates an existing order.
   *
   * Supports partial updates. Code uniqueness check if code changed.
   * Handles nullable fields (costCenterId, billingRatePerHour, validFrom, validTo).
   * Re-fetches with CostCenter preload after update.
   *
   * Requires: orders.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(ORDERS_MANAGE))
    .input(updateOrderInputSchema)
    .output(orderOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const order = await orderService.update(
          ctx.prisma,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapOrderToOutput(order)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * orders.delete -- Deletes an order.
   *
   * OrderAssignments cascade-delete per DB FK, so no explicit check needed.
   *
   * Requires: orders.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(ORDERS_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await orderService.remove(ctx.prisma, ctx.tenantId!, input.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
