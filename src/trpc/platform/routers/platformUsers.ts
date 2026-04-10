/**
 * Platform users CRUD router.
 *
 * Lets an authenticated platform operator manage peer operators. Two hard
 * server-side invariants:
 *
 *   1. A caller cannot delete or deactivate themselves — they would lock
 *      themselves out. Use another operator (or the bootstrap script) to
 *      perform such actions.
 *   2. The last active platform user must never be removed/deactivated.
 *      Bootstrapping a fresh operator requires CLI access
 *      (`scripts/bootstrap-platform-user.ts`), so letting the UI empty the
 *      table would strand the system.
 *
 * Password changes go through `hashPassword`; MFA reset wipes the stored
 * secret so the target operator is forced through enrollment on next login.
 * All mutations write a `platform_audit_logs` entry.
 */
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import type { PrismaClient } from "@/generated/prisma/client"
import {
  platformAuthedProcedure,
  createTRPCRouter,
} from "../init"
import { hashPassword } from "@/lib/platform/password"
import * as platformAudit from "@/lib/platform/audit-service"

const uuid = z.string().uuid()

async function assertNotLastActive(
  prisma: PrismaClient
): Promise<void> {
  const activeCount = await prisma.platformUser.count({
    where: { isActive: true },
  })
  if (activeCount <= 1) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Cannot remove the last active platform user",
    })
  }
}

export const platformUsersRouter = createTRPCRouter({
  list: platformAuthedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.prisma.platformUser.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        displayName: true,
        isActive: true,
        mfaEnrolledAt: true,
        lastLoginAt: true,
        lastLoginIp: true,
        createdAt: true,
        createdBy: true,
      },
    })
    return rows
  }),

  create: platformAuthedProcedure
    .input(
      z.object({
        email: z.string().email().max(255),
        displayName: z.string().min(1).max(255),
        password: z.string().min(12).max(256),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.platformUser.findUnique({
        where: { email: input.email },
      })
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A platform user with this email already exists",
        })
      }
      const passwordHash = await hashPassword(input.password)
      const created = await ctx.prisma.platformUser.create({
        data: {
          email: input.email,
          displayName: input.displayName,
          passwordHash,
          createdBy: ctx.platformUser.id,
        },
        select: {
          id: true,
          email: true,
          displayName: true,
          isActive: true,
          createdAt: true,
        },
      })
      await platformAudit.log(ctx.prisma, {
        platformUserId: ctx.platformUser.id,
        action: "platform_user.created",
        entityType: "platform_user",
        entityId: created.id,
        metadata: { email: created.email, displayName: created.displayName },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })
      return created
    }),

  updatePassword: platformAuthedProcedure
    .input(
      z.object({
        id: uuid,
        newPassword: z.string().min(12).max(256),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const passwordHash = await hashPassword(input.newPassword)
      const updated = await ctx.prisma.platformUser.update({
        where: { id: input.id },
        data: { passwordHash },
        select: { id: true },
      })
      await platformAudit.log(ctx.prisma, {
        platformUserId: ctx.platformUser.id,
        action: "platform_user.password_changed",
        entityType: "platform_user",
        entityId: updated.id,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })
      return { ok: true as const }
    }),

  resetMfa: platformAuthedProcedure
    .input(z.object({ id: uuid }))
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.prisma.platformUser.update({
        where: { id: input.id },
        data: {
          mfaSecret: null,
          mfaEnrolledAt: null,
          recoveryCodes: undefined,
        },
        select: { id: true },
      })
      await platformAudit.log(ctx.prisma, {
        platformUserId: ctx.platformUser.id,
        action: "platform_user.mfa_reset",
        entityType: "platform_user",
        entityId: updated.id,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })
      return { ok: true as const }
    }),

  setActive: platformAuthedProcedure
    .input(z.object({ id: uuid, isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (input.id === ctx.platformUser.id && !input.isActive) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Cannot deactivate yourself",
        })
      }
      if (!input.isActive) {
        await assertNotLastActive(ctx.prisma)
      }
      const updated = await ctx.prisma.platformUser.update({
        where: { id: input.id },
        data: { isActive: input.isActive },
        select: { id: true, isActive: true },
      })
      await platformAudit.log(ctx.prisma, {
        platformUserId: ctx.platformUser.id,
        action: input.isActive
          ? "platform_user.activated"
          : "platform_user.deactivated",
        entityType: "platform_user",
        entityId: updated.id,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })
      return updated
    }),

  delete: platformAuthedProcedure
    .input(z.object({ id: uuid }))
    .mutation(async ({ ctx, input }) => {
      if (input.id === ctx.platformUser.id) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Cannot delete yourself",
        })
      }
      await assertNotLastActive(ctx.prisma)
      await ctx.prisma.platformUser.delete({ where: { id: input.id } })
      await platformAudit.log(ctx.prisma, {
        platformUserId: ctx.platformUser.id,
        action: "platform_user.deleted",
        entityType: "platform_user",
        entityId: input.id,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })
      return { ok: true as const }
    }),
})
