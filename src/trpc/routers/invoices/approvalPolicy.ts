import { z } from "zod"
import type { PrismaClient } from "@/generated/prisma/client"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { requireModule } from "@/lib/modules"
import { handleServiceError } from "@/trpc/errors"
import * as policyRepo from "@/lib/services/inbound-invoice-approval-policy-repository"

// --- Permission Constants ---

const MANAGE = permissionIdByKey("inbound_invoices.manage")!

// --- Base procedure ---

const invProcedure = tenantProcedure.use(requireModule("inbound_invoices"))

// --- Input Schemas ---

const createSchema = z.object({
  amountMin: z.number().min(0),
  amountMax: z.number().nullable().optional(),
  stepOrder: z.number().int().min(1),
  approverGroupId: z.string().uuid().nullable().optional(),
  approverUserId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
}).refine(
  (d) => d.approverGroupId || d.approverUserId,
  { message: "Either approverGroupId or approverUserId must be provided" }
)

const updateSchema = z.object({
  id: z.string().uuid(),
  amountMin: z.number().min(0).optional(),
  amountMax: z.number().nullable().optional(),
  stepOrder: z.number().int().min(1).optional(),
  approverGroupId: z.string().uuid().nullable().optional(),
  approverUserId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
})

// --- Router ---

export const approvalPolicyRouter = createTRPCRouter({
  list: invProcedure
    .use(requirePermission(MANAGE))
    .query(async ({ ctx }) => {
      try {
        return await policyRepo.findByTenant(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: invProcedure
    .use(requirePermission(MANAGE))
    .input(createSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await policyRepo.create(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  update: invProcedure
    .use(requirePermission(MANAGE))
    .input(updateSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const { id, ...data } = input
        return await policyRepo.update(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          id,
          data
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  remove: invProcedure
    .use(requirePermission(MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await policyRepo.remove(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
