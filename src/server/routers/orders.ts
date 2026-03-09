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
import { Prisma } from "@/generated/prisma/client"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const ORDERS_MANAGE = permissionIdByKey("orders.manage")!

// --- Output Schemas ---

const costCenterIncludeSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
  })
  .nullable()

const orderOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  customer: z.string().nullable(),
  costCenterId: z.string().uuid().nullable(),
  costCenter: costCenterIncludeSchema,
  billingRatePerHour: z.number().nullable(),
  validFrom: z.date().nullable(),
  validTo: z.date().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type OrderOutput = z.infer<typeof orderOutputSchema>

// --- Input Schemas ---

const createOrderInputSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  status: z.string().optional(),
  customer: z.string().optional(),
  costCenterId: z.string().uuid().optional(),
  billingRatePerHour: z.number().optional(),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
})

const updateOrderInputSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.string().optional(),
  customer: z.string().nullable().optional(),
  costCenterId: z.string().uuid().nullable().optional(),
  billingRatePerHour: z.number().nullable().optional(),
  validFrom: z.string().nullable().optional(),
  validTo: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

// --- Prisma include for CostCenter preload ---

const orderInclude = {
  costCenter: {
    select: { id: true, code: true, name: true },
  },
} as const

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
  }
}

/**
 * Parses an ISO date string ("2026-01-15") into a Date at midnight UTC.
 */
function parseDate(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00Z")
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
          status: z.string().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(orderOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const where: Record<string, unknown> = { tenantId }

      if (input?.isActive !== undefined) {
        where.isActive = input.isActive
      }
      if (input?.status !== undefined) {
        where.status = input.status
      }

      const orders = await ctx.prisma.order.findMany({
        where,
        orderBy: { code: "asc" },
        include: orderInclude,
      })

      return {
        data: orders.map(mapOrderToOutput),
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
    .input(z.object({ id: z.string().uuid() }))
    .output(orderOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const order = await ctx.prisma.order.findFirst({
        where: { id: input.id, tenantId },
        include: orderInclude,
      })

      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found",
        })
      }

      return mapOrderToOutput(order)
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
      const tenantId = ctx.tenantId!

      // Trim and validate code
      const code = input.code.trim()
      if (code.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Order code is required",
        })
      }

      // Trim and validate name
      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Order name is required",
        })
      }

      // Check code uniqueness within tenant
      const existingByCode = await ctx.prisma.order.findFirst({
        where: { tenantId, code },
      })
      if (existingByCode) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Order code already exists",
        })
      }

      // Trim optional string fields
      const description = input.description?.trim() || null
      const customer = input.customer?.trim() || null

      // Create order
      const created = await ctx.prisma.order.create({
        data: {
          tenantId,
          code,
          name,
          description,
          status: input.status || "active",
          customer,
          isActive: true,
          costCenterId: input.costCenterId || undefined,
          billingRatePerHour:
            input.billingRatePerHour !== undefined
              ? new Prisma.Decimal(input.billingRatePerHour)
              : undefined,
          validFrom: input.validFrom ? parseDate(input.validFrom) : undefined,
          validTo: input.validTo ? parseDate(input.validTo) : undefined,
        },
      })

      // Re-fetch with CostCenter preload (matching Go behavior)
      const order = await ctx.prisma.order.findUniqueOrThrow({
        where: { id: created.id },
        include: orderInclude,
      })

      return mapOrderToOutput(order)
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
      const tenantId = ctx.tenantId!

      // Verify order exists (tenant-scoped)
      const existing = await ctx.prisma.order.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = {}

      // Handle code update
      if (input.code !== undefined) {
        const code = input.code.trim()
        if (code.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Order code is required",
          })
        }
        // Check uniqueness if changed
        if (code !== existing.code) {
          const existingByCode = await ctx.prisma.order.findFirst({
            where: {
              tenantId,
              code,
              NOT: { id: input.id },
            },
          })
          if (existingByCode) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Order code already exists",
            })
          }
        }
        data.code = code
      }

      // Handle name update
      if (input.name !== undefined) {
        const name = input.name.trim()
        if (name.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Order name is required",
          })
        }
        data.name = name
      }

      // Handle description update
      if (input.description !== undefined) {
        data.description =
          input.description === null ? null : input.description.trim()
      }

      // Handle status update
      if (input.status !== undefined) {
        data.status = input.status
      }

      // Handle customer update
      if (input.customer !== undefined) {
        data.customer =
          input.customer === null ? null : input.customer.trim()
      }

      // Handle costCenterId update (nullable)
      if (input.costCenterId !== undefined) {
        data.costCenterId = input.costCenterId
      }

      // Handle billingRatePerHour update (nullable)
      if (input.billingRatePerHour !== undefined) {
        data.billingRatePerHour =
          input.billingRatePerHour === null
            ? null
            : new Prisma.Decimal(input.billingRatePerHour)
      }

      // Handle validFrom update (nullable)
      if (input.validFrom !== undefined) {
        data.validFrom =
          input.validFrom === null ? null : parseDate(input.validFrom)
      }

      // Handle validTo update (nullable)
      if (input.validTo !== undefined) {
        data.validTo =
          input.validTo === null ? null : parseDate(input.validTo)
      }

      // Handle isActive update
      if (input.isActive !== undefined) {
        data.isActive = input.isActive
      }

      await ctx.prisma.order.update({
        where: { id: input.id },
        data,
      })

      // Re-fetch with CostCenter preload
      const order = await ctx.prisma.order.findUniqueOrThrow({
        where: { id: input.id },
        include: orderInclude,
      })

      return mapOrderToOutput(order)
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
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify order exists (tenant-scoped)
      const existing = await ctx.prisma.order.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found",
        })
      }

      // Hard delete (OrderAssignments cascade via FK)
      await ctx.prisma.order.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
