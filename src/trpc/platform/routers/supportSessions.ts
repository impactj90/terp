/**
 * Platform support sessions router.
 *
 * Operators see the queue of tenant-initiated support requests, activate
 * pending ones (after a tenant admin has granted access), and revoke
 * active sessions early when they are done. All state transitions write
 * a `platform_audit_logs` entry.
 *
 * State machine:
 *
 *     pending --activate--> active --(revoke | expire)--> revoked|expired
 *     pending --revoke/expire--> revoked|expired
 *
 * `activate` is idempotent-by-error: activating an already-active session
 * throws CONFLICT, activating an expired one throws CONFLICT as well.
 * Activation also enforces that the session's platformUserId is either
 * unassigned (`null`) or already bound to this operator — you cannot
 * steal another operator's pending session.
 */
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import {
  platformAuthedProcedure,
  createTRPCRouter,
} from "../init"
import * as platformAudit from "@/lib/platform/audit-service"

const uuid = z.string().uuid()

export const platformSupportSessionsRouter = createTRPCRouter({
  /**
   * List sessions visible to the caller.
   *
   * - `pending` rows are shown regardless of `platformUserId` so operators
   *   can pick up a tenant-initiated request.
   * - `active` / closed rows are scoped to this operator to keep the UI
   *   focused on their own work.
   */
  list: platformAuthedProcedure
    .input(
      z
        .object({
          status: z
            .enum(["pending", "active", "revoked", "expired"])
            .optional(),
          tenantId: uuid.optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {}
      if (input?.status) {
        where.status = input.status
      }
      if (input?.tenantId) {
        where.tenantId = input.tenantId
      }
      // Pending: visible to all operators.
      // Non-pending: scoped to this operator.
      if (input?.status && input.status !== "pending") {
        where.platformUserId = ctx.platformUser.id
      } else if (!input?.status) {
        where.OR = [
          { status: "pending" },
          { platformUserId: ctx.platformUser.id },
        ]
      }

      const rows = await ctx.prisma.supportSession.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          tenant: {
            select: { id: true, name: true, slug: true },
          },
        },
      })
      return rows
    }),

  getById: platformAuthedProcedure
    .input(z.object({ id: uuid }))
    .query(async ({ ctx, input }) => {
      const session = await ctx.prisma.supportSession.findUnique({
        where: { id: input.id },
        include: {
          tenant: {
            select: { id: true, name: true, slug: true },
          },
        },
      })
      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Support session not found",
        })
      }
      return session
    }),

  /**
   * Activate a pending session. Transitions status pending → active and
   * binds the platformUserId to the caller. Throws CONFLICT if the row is
   * already active/revoked/expired, or if `expiresAt` has already passed.
   */
  activate: platformAuthedProcedure
    .input(z.object({ id: uuid }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.supportSession.findUnique({
        where: { id: input.id },
      })
      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Support session not found",
        })
      }
      if (session.status !== "pending") {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Session is ${session.status}, not pending`,
        })
      }
      if (session.expiresAt.getTime() <= Date.now()) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Session has already expired",
        })
      }
      if (
        session.platformUserId &&
        session.platformUserId !== ctx.platformUser.id
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Session is assigned to another operator",
        })
      }

      const updated = await ctx.prisma.supportSession.update({
        where: { id: session.id },
        data: {
          status: "active",
          platformUserId: ctx.platformUser.id,
          activatedAt: new Date(),
        },
      })

      await platformAudit.log(ctx.prisma, {
        platformUserId: ctx.platformUser.id,
        action: "support_session.activated",
        entityType: "support_session",
        entityId: updated.id,
        targetTenantId: updated.tenantId,
        supportSessionId: updated.id,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })

      return updated
    }),

  /**
   * Revoke an active or pending session owned by this operator.
   */
  revoke: platformAuthedProcedure
    .input(z.object({ id: uuid }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.supportSession.findUnique({
        where: { id: input.id },
      })
      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Support session not found",
        })
      }
      if (
        session.platformUserId &&
        session.platformUserId !== ctx.platformUser.id
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Session is not yours to revoke",
        })
      }
      if (session.status === "revoked" || session.status === "expired") {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Session is already ${session.status}`,
        })
      }

      const updated = await ctx.prisma.supportSession.update({
        where: { id: session.id },
        data: { status: "revoked", revokedAt: new Date() },
      })

      await platformAudit.log(ctx.prisma, {
        platformUserId: ctx.platformUser.id,
        action: "support_session.revoked",
        entityType: "support_session",
        entityId: updated.id,
        targetTenantId: updated.tenantId,
        supportSessionId: updated.id,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })

      return updated
    }),
})
