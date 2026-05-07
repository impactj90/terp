/**
 * Nachkalkulation: OrderTarget Router (NK-1, Decision 1, Decision 23)
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { requireModule } from "@/lib/modules"
import * as targetService from "@/lib/services/order-target-service"
import type { PrismaClient } from "@/generated/prisma/client"

const NK_VIEW = permissionIdByKey("nachkalkulation.view")!
const NK_MANAGE = permissionIdByKey("nachkalkulation.manage")!

const nkProcedure = tenantProcedure.use(requireModule("nachkalkulation"))

const targetUnitItemSchema = z.object({
  activityId: z.string(),
  quantity: z.number().min(0.01),
})

const orderTargetOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  orderId: z.string(),
  version: z.number(),
  validFrom: z.date(),
  validTo: z.date().nullable(),
  targetHours: z.number().nullable(),
  targetMaterialCost: z.number().nullable(),
  targetTravelMinutes: z.number().nullable(),
  targetExternalCost: z.number().nullable(),
  targetRevenue: z.number().nullable(),
  targetUnitItems: z.array(targetUnitItemSchema).nullable(),
  changeReason: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: z.string().nullable(),
})

type OrderTargetOutput = z.infer<typeof orderTargetOutputSchema>

function mapToOutput(t: {
  id: string
  tenantId: string
  orderId: string
  version: number
  validFrom: Date
  validTo: Date | null
  targetHours: { toString(): string } | null
  targetMaterialCost: { toString(): string } | null
  targetTravelMinutes: number | null
  targetExternalCost: { toString(): string } | null
  targetRevenue: { toString(): string } | null
  targetUnitItems: unknown
  changeReason: string | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
  createdBy: string | null
}): OrderTargetOutput {
  return {
    id: t.id,
    tenantId: t.tenantId,
    orderId: t.orderId,
    version: t.version,
    validFrom: t.validFrom,
    validTo: t.validTo,
    targetHours: t.targetHours == null ? null : Number(t.targetHours),
    targetMaterialCost:
      t.targetMaterialCost == null ? null : Number(t.targetMaterialCost),
    targetTravelMinutes: t.targetTravelMinutes,
    targetExternalCost:
      t.targetExternalCost == null ? null : Number(t.targetExternalCost),
    targetRevenue: t.targetRevenue == null ? null : Number(t.targetRevenue),
    targetUnitItems:
      Array.isArray(t.targetUnitItems)
        ? (t.targetUnitItems as Array<{ activityId: string; quantity: number }>)
        : null,
    changeReason: t.changeReason,
    notes: t.notes,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    createdBy: t.createdBy,
  }
}

const upsertInputSchema = z.object({
  orderId: z.string(),
  validFrom: z.string().date(),
  targetHours: z.number().min(0).max(99999.99).nullable().optional(),
  targetMaterialCost: z.number().min(0).max(9999999.99).nullable().optional(),
  targetTravelMinutes: z.number().int().min(0).nullable().optional(),
  targetExternalCost: z.number().min(0).max(9999999.99).nullable().optional(),
  targetRevenue: z.number().min(0).max(9999999.99).nullable().optional(),
  targetUnitItems: z.array(targetUnitItemSchema).nullable().optional(),
  changeReason: z.string().max(50).optional(),
  notes: z.string().max(2000).optional(),
})

export const targetsRouter = createTRPCRouter({
  getActive: nkProcedure
    .use(requirePermission(NK_VIEW, NK_MANAGE))
    .input(z.object({ orderId: z.string() }))
    .output(orderTargetOutputSchema.nullable())
    .query(async ({ ctx, input }) => {
      try {
        const t = await targetService.getActiveTarget(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.orderId,
        )
        return t == null ? null : mapToOutput(t)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  listVersions: nkProcedure
    .use(requirePermission(NK_VIEW, NK_MANAGE))
    .input(z.object({ orderId: z.string() }))
    .output(z.object({ data: z.array(orderTargetOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const data = await targetService.listVersions(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.orderId,
        )
        return { data: data.map(mapToOutput) }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  upsert: nkProcedure
    .use(requirePermission(NK_MANAGE))
    .input(upsertInputSchema)
    .output(
      z.object({
        target: orderTargetOutputSchema,
        mode: z.enum(["created", "replanned"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await targetService.upsertTarget(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
        )
        return {
          target: mapToOutput(result.target),
          mode: result.mode,
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
