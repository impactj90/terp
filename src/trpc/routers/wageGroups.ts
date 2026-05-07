/**
 * Wage Groups Router (NK-1, Decision 2)
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as wageGroupService from "@/lib/services/wage-group-service"
import type { PrismaClient } from "@/generated/prisma/client"

const WAGE_GROUPS_VIEW = permissionIdByKey("wage_groups.view")!
const WAGE_GROUPS_MANAGE = permissionIdByKey("wage_groups.manage")!

const wageGroupOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  code: z.string(),
  name: z.string(),
  internalHourlyRate: z.number().nullable(),
  billingHourlyRate: z.number().nullable(),
  sortOrder: z.number(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type WageGroupOutput = z.infer<typeof wageGroupOutputSchema>

function mapToOutput(w: {
  id: string
  tenantId: string
  code: string
  name: string
  internalHourlyRate: { toString(): string } | null
  billingHourlyRate: { toString(): string } | null
  sortOrder: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}): WageGroupOutput {
  return {
    id: w.id,
    tenantId: w.tenantId,
    code: w.code,
    name: w.name,
    internalHourlyRate:
      w.internalHourlyRate == null ? null : Number(w.internalHourlyRate),
    billingHourlyRate:
      w.billingHourlyRate == null ? null : Number(w.billingHourlyRate),
    sortOrder: w.sortOrder,
    isActive: w.isActive,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  }
}

export const wageGroupsRouter = createTRPCRouter({
  list: tenantProcedure
    .use(requirePermission(WAGE_GROUPS_VIEW, WAGE_GROUPS_MANAGE))
    .input(z.object({ isActive: z.boolean().optional() }).optional())
    .output(z.object({ data: z.array(wageGroupOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const data = await wageGroupService.list(
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
    .use(requirePermission(WAGE_GROUPS_VIEW, WAGE_GROUPS_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(wageGroupOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const wg = await wageGroupService.getById(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
        )
        return mapToOutput(wg)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: tenantProcedure
    .use(requirePermission(WAGE_GROUPS_MANAGE))
    .input(
      z.object({
        code: z.string().min(1).max(50),
        name: z.string().min(1).max(255),
        internalHourlyRate: z.number().min(0).max(9999.99).nullable().optional(),
        billingHourlyRate: z.number().min(0).max(9999.99).nullable().optional(),
        sortOrder: z.number().int().min(0).optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .output(wageGroupOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const wg = await wageGroupService.create(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
        )
        return mapToOutput(wg)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  update: tenantProcedure
    .use(requirePermission(WAGE_GROUPS_MANAGE))
    .input(
      z.object({
        id: z.string(),
        code: z.string().min(1).max(50).optional(),
        name: z.string().min(1).max(255).optional(),
        internalHourlyRate: z.number().min(0).max(9999.99).nullable().optional(),
        billingHourlyRate: z.number().min(0).max(9999.99).nullable().optional(),
        sortOrder: z.number().int().min(0).optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .output(wageGroupOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const wg = await wageGroupService.update(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
        )
        return mapToOutput(wg)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  delete: tenantProcedure
    .use(requirePermission(WAGE_GROUPS_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await wageGroupService.remove(
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
