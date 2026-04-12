/**
 * Platform tenants router.
 *
 * Operators can see the tenant directory (`list`) without a support
 * session — tenant names/slugs are operational metadata, not tenant data.
 * Reading a tenant's business state (`detail`) requires an active
 * `SupportSession`, which is why `detail` sits behind
 * `platformImpersonationProcedure`.
 *
 * Phase 9 will extend this router with tenant lifecycle mutations
 * (create / setActive / updatePlan / bookModule / …). That phase
 * introduces its own operator-hoheit procedures and does not flow
 * through impersonation, since those actions are not "reads into tenant
 * data" — they are platform-level decisions about the tenant.
 */
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import {
  platformAuthedProcedure,
  platformImpersonationProcedure,
  createTRPCRouter,
} from "../init"

export const platformTenantsRouter = createTRPCRouter({
  /**
   * Directory of tenants — minimal metadata, no impersonation required.
   * Optional `q` filters by name/slug prefix for the picker UI.
   */
  list: platformAuthedProcedure
    .input(
      z
        .object({
          q: z.string().max(255).optional(),
          includeInactive: z.boolean().default(false),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const q = input?.q?.trim()
      const where: Record<string, unknown> = {}
      if (!input?.includeInactive) {
        where.isActive = true
      }
      if (q) {
        where.OR = [
          { name: { contains: q, mode: "insensitive" } },
          { slug: { contains: q, mode: "insensitive" } },
        ]
      }
      const rows = await ctx.prisma.tenant.findMany({
        where,
        orderBy: { name: "asc" },
        take: 100,
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
          createdAt: true,
        },
      })
      return rows
    }),

  /**
   * Read detailed tenant state. Requires an active `SupportSession`
   * whose `tenantId` matches the requested tenant — enforced here
   * (platformImpersonationProcedure only proves the session exists).
   */
  detail: platformImpersonationProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Re-verify that the session is scoped to the requested tenant.
      const session = await ctx.prisma.supportSession.findFirst({
        where: {
          id: ctx.activeSupportSessionId!,
          tenantId: input.id,
          platformUserId: ctx.platformUser.id,
          status: "active",
          expiresAt: { gt: new Date() },
        },
      })
      if (!session) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Support session not scoped to this tenant",
        })
      }

      const tenant = await ctx.prisma.tenant.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
          addressStreet: true,
          addressZip: true,
          addressCity: true,
          addressCountry: true,
          phone: true,
          email: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
        },
      })
      return tenant
    }),
})
