/**
 * Nachkalkulation: Threshold Configuration Router (NK-1, Phase 7,
 * Decision 9)
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { requireModule } from "@/lib/modules"
import * as thresholdService from "@/lib/services/nk-threshold-config-service"
import type { PrismaClient } from "@/generated/prisma/client"

const NK_VIEW = permissionIdByKey("nachkalkulation.view")!
const NK_CONFIG = permissionIdByKey("nachkalkulation.config")!

const nkProcedure = tenantProcedure.use(requireModule("nachkalkulation"))

const thresholdSetSchema = z
  .object({
    marginAmberFromPercent: z.number().min(-100).max(100),
    marginRedFromPercent: z.number().min(-100).max(100),
    productivityAmberFromPercent: z.number().min(-100).max(100),
    productivityRedFromPercent: z.number().min(-100).max(100),
  })
  .refine((d) => d.marginAmberFromPercent > d.marginRedFromPercent, {
    message: "marginAmberFromPercent must be greater than marginRedFromPercent",
  })
  .refine(
    (d) => d.productivityAmberFromPercent > d.productivityRedFromPercent,
    {
      message:
        "productivityAmberFromPercent must be greater than productivityRedFromPercent",
    },
  )

const configOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  orderTypeId: z.string().nullable(),
  marginAmberFromPercent: z.number(),
  marginRedFromPercent: z.number(),
  productivityAmberFromPercent: z.number(),
  productivityRedFromPercent: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

function mapToOutput(c: {
  id: string
  tenantId: string
  orderTypeId: string | null
  marginAmberFromPercent: { toString(): string }
  marginRedFromPercent: { toString(): string }
  productivityAmberFromPercent: { toString(): string }
  productivityRedFromPercent: { toString(): string }
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: c.id,
    tenantId: c.tenantId,
    orderTypeId: c.orderTypeId,
    marginAmberFromPercent: Number(c.marginAmberFromPercent),
    marginRedFromPercent: Number(c.marginRedFromPercent),
    productivityAmberFromPercent: Number(c.productivityAmberFromPercent),
    productivityRedFromPercent: Number(c.productivityRedFromPercent),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }
}

export const thresholdsRouter = createTRPCRouter({
  list: nkProcedure
    .use(requirePermission(NK_VIEW, NK_CONFIG))
    .output(z.object({ data: z.array(configOutputSchema) }))
    .query(async ({ ctx }) => {
      try {
        const data = await thresholdService.listConfigs(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
        )
        return { data: data.map(mapToOutput) }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  upsertDefault: nkProcedure
    .use(requirePermission(NK_CONFIG))
    .input(thresholdSetSchema)
    .output(configOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const c = await thresholdService.upsertDefault(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
        )
        return mapToOutput(c)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  upsertOverride: nkProcedure
    .use(requirePermission(NK_CONFIG))
    .input(
      z
        .object({
          marginAmberFromPercent: z.number().min(-100).max(100),
          marginRedFromPercent: z.number().min(-100).max(100),
          productivityAmberFromPercent: z.number().min(-100).max(100),
          productivityRedFromPercent: z.number().min(-100).max(100),
          orderTypeId: z.string(),
        })
        .refine((d) => d.marginAmberFromPercent > d.marginRedFromPercent, {
          message:
            "marginAmberFromPercent must be greater than marginRedFromPercent",
        })
        .refine(
          (d) => d.productivityAmberFromPercent > d.productivityRedFromPercent,
          {
            message:
              "productivityAmberFromPercent must be greater than productivityRedFromPercent",
          },
        ),
    )
    .output(configOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const { orderTypeId, ...thresholds } = input
        const c = await thresholdService.upsertOverride(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          orderTypeId,
          thresholds,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
        )
        return mapToOutput(c)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  removeOverride: nkProcedure
    .use(requirePermission(NK_CONFIG))
    .input(z.object({ orderTypeId: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await thresholdService.removeOverride(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.orderTypeId,
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
