/**
 * Demo Tenants Router
 *
 * Admin-only endpoints for the demo-tenant lifecycle plus a single
 * self-service endpoint used by the /demo-expired page.
 *
 * See thoughts/shared/plans/2026-04-09-demo-tenant-system.md (Phase 3).
 */
import { z } from "zod"
import { createTRPCRouter, protectedProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as demoService from "@/lib/services/demo-tenant-service"
import { DEFAULT_DEMO_TEMPLATE, listDemoTemplates } from "@/lib/demo/registry"

const TENANTS_MANAGE = permissionIdByKey("tenants.manage")!

const createDemoInputSchema = z.object({
  tenantName: z.string().min(1).max(255),
  tenantSlug: z
    .string()
    .min(3)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, digits, and hyphens"),
  addressStreet: z.string().min(1),
  addressZip: z.string().min(1),
  addressCity: z.string().min(1),
  addressCountry: z.string().min(1),
  adminEmail: z.string().email(),
  adminDisplayName: z.string().min(1),
  demoTemplate: z.string().optional().default(DEFAULT_DEMO_TEMPLATE),
  demoDurationDays: z.number().int().min(1).max(90).optional(),
  notes: z.string().nullish(),
})

export const demoTenantsRouter = createTRPCRouter({
  /**
   * Returns the list of available demo templates (key + label + description).
   * Used by the admin UI's create-demo sheet dropdown.
   */
  templates: protectedProcedure
    .use(requirePermission(TENANTS_MANAGE))
    .query(() => listDemoTemplates()),

  /**
   * Lists all active demos (is_demo=true AND is_active=true) with days
   * remaining until expiration.
   */
  list: protectedProcedure
    .use(requirePermission(TENANTS_MANAGE))
    .query(async ({ ctx }) => {
      try {
        return await demoService.listActiveDemos(ctx.prisma)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * Creates a new demo tenant end-to-end: tenant row, 4 modules, admin user,
   * template data, audit log. Returns an inviteLink (null on success) that
   * the UI falls back to when the welcome email could not be delivered.
   */
  create: protectedProcedure
    .use(requirePermission(TENANTS_MANAGE))
    .input(createDemoInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await demoService.createDemo(ctx.prisma, ctx.user!.id, input, {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * Extends a demo's expiration by 7 or 14 days. If the demo was already
   * expired (inactive), reactivates it atomically.
   */
  extend: protectedProcedure
    .use(requirePermission(TENANTS_MANAGE))
    .input(
      z.object({
        tenantId: z.string().uuid(),
        additionalDays: z.union([z.literal(7), z.literal(14)]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await demoService.extendDemo(
          ctx.prisma,
          input.tenantId,
          input.additionalDays,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * Converts a demo to a real tenant. With discardData=true the content is
   * wiped but the admin user + user_tenants + user_groups survive. With
   * discardData=false the content is kept; only the demo flags are stripped.
   */
  convert: protectedProcedure
    .use(requirePermission(TENANTS_MANAGE))
    .input(
      z.object({
        tenantId: z.string().uuid(),
        discardData: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await demoService.convertDemo(
          ctx.prisma,
          input.tenantId,
          { discardData: input.discardData },
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * Manually expires a demo now (admin "kill switch"). Sets isActive=false
   * and demo_expires_at=now.
   */
  expireNow: protectedProcedure
    .use(requirePermission(TENANTS_MANAGE))
    .input(z.object({ tenantId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await demoService.expireDemoNow(ctx.prisma, input.tenantId, {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * Hard-deletes an inactive demo. Throws FORBIDDEN if the demo is still
   * active — admin must expireNow first. Writes a demo_delete audit entry
   * before the delete (audit_logs has no FK to tenants so the entry
   * survives).
   */
  delete: protectedProcedure
    .use(requirePermission(TENANTS_MANAGE))
    .input(z.object({ tenantId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await demoService.deleteDemo(ctx.prisma, input.tenantId, {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * Called by the /demo-expired page CTA.
   *
   * Deliberately NOT gated by `tenants.manage` — the demo admin user does
   * not have that permission, they only have access to their own demo tenant
   * via `user_tenants`. Authorization is enforced by the service:
   *   - caller must have a user_tenants row for the target tenant
   *   - target tenant must be is_demo=true AND expired
   */
  requestConvertFromExpired: protectedProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await demoService.requestConvertFromExpired(
          ctx.prisma,
          ctx.user!.id,
          input.tenantId,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
