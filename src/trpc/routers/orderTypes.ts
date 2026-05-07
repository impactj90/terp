/**
 * Order Types Router (NK-1, Decision 15)
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as orderTypeService from "@/lib/services/order-type-service"
import type { PrismaClient } from "@/generated/prisma/client"

const ORDER_TYPES_VIEW = permissionIdByKey("order_types.view")!
const ORDER_TYPES_MANAGE = permissionIdByKey("order_types.manage")!

const orderTypeOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  code: z.string(),
  name: z.string(),
  sortOrder: z.number(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type OrderTypeOutput = z.infer<typeof orderTypeOutputSchema>

function mapToOutput(o: {
  id: string
  tenantId: string
  code: string
  name: string
  sortOrder: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}): OrderTypeOutput {
  return {
    id: o.id,
    tenantId: o.tenantId,
    code: o.code,
    name: o.name,
    sortOrder: o.sortOrder,
    isActive: o.isActive,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  }
}

export const orderTypesRouter = createTRPCRouter({
  list: tenantProcedure
    .use(requirePermission(ORDER_TYPES_VIEW, ORDER_TYPES_MANAGE))
    .input(z.object({ isActive: z.boolean().optional() }).optional())
    .output(z.object({ data: z.array(orderTypeOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const data = await orderTypeService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
        )
        return { data: data.map(mapToOutput) }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: tenantProcedure
    .use(requirePermission(ORDER_TYPES_VIEW, ORDER_TYPES_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(orderTypeOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const ot = await orderTypeService.getById(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
        )
        return mapToOutput(ot)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: tenantProcedure
    .use(requirePermission(ORDER_TYPES_MANAGE))
    .input(
      z.object({
        code: z.string().min(1).max(50),
        name: z.string().min(1).max(255),
        sortOrder: z.number().int().min(0).optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .output(orderTypeOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const ot = await orderTypeService.create(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
        )
        return mapToOutput(ot)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  update: tenantProcedure
    .use(requirePermission(ORDER_TYPES_MANAGE))
    .input(
      z.object({
        id: z.string(),
        code: z.string().min(1).max(50).optional(),
        name: z.string().min(1).max(255).optional(),
        sortOrder: z.number().int().min(0).optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .output(orderTypeOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const ot = await orderTypeService.update(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
        )
        return mapToOutput(ot)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  delete: tenantProcedure
    .use(requirePermission(ORDER_TYPES_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await orderTypeService.remove(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
