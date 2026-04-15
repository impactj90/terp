/**
 * Platform demo-tenant management router.
 *
 * Owns the demo-tenant lifecycle from the platform-admin world. Every
 * mutation writes exactly one `platform_audit_logs` row with the real
 * platform operator as the acting party. Tenant-side `audit_logs` are NOT
 * written by this router — those are reserved for tenant-user actions.
 *
 * The `convert` procedure is the most intricate: it snapshots enabled
 * modules BEFORE the (optional) wipe inside the service layer, re-inserts
 * them after the wipe (outside the atomic tx because subscription creates
 * open their own $transaction), then drives the subscription bridge by
 * calling `subscriptionService.createSubscription` once per module.
 *
 * See thoughts/shared/plans/2026-04-11-demo-tenant-platform-migration.md.
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"

import { createTRPCRouter, platformAuthedProcedure } from "../init"
import * as platformAudit from "@/lib/platform/audit-service"
import * as demoService from "@/lib/services/demo-tenant-service"
import * as subscriptionService from "@/lib/platform/subscription-service"
import {
  DEFAULT_TENANT_TEMPLATE,
  listTenantTemplates,
} from "@/lib/tenant-templates/registry"
import type { ModuleId } from "@/lib/modules/constants"

// --- Schemas ---------------------------------------------------------------

// Lenient UUID-like id validator matching the pattern in tenantManagement.ts.
const tenantIdSchema = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  )

const createDemoInputSchema = z.object({
  tenantName: z.string().trim().min(1).max(255),
  tenantSlug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(100)
    .regex(
      /^[a-z0-9-]+$/,
      "Slug darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten",
    ),
  addressStreet: z.string().trim().min(1),
  addressZip: z.string().trim().min(1),
  addressCity: z.string().trim().min(1),
  addressCountry: z.string().trim().min(1),
  adminEmail: z.string().email(),
  adminDisplayName: z.string().trim().min(1),
  demoTemplate: z.string().optional().default(DEFAULT_TENANT_TEMPLATE),
  demoDurationDays: z.number().int().min(1).max(90).optional(),
  notes: z.string().nullish(),
})

// --- Router ----------------------------------------------------------------

export const platformDemoTenantManagementRouter = createTRPCRouter({
  /**
   * Returns the list of available demo templates (key + label + description).
   * Used by the platform admin UI's create-demo sheet dropdown.
   */
  templates: platformAuthedProcedure.query(() => listTenantTemplates()),

  /**
   * Lists ALL demo tenants (active + expired) with creator DTO and
   * daysRemaining metadata.
   */
  list: platformAuthedProcedure.query(async ({ ctx }) => {
    return await demoService.listDemos(ctx.prisma)
  }),

  /**
   * Creates a new demo tenant. Writes the platform operator into the new
   * `demo_created_by_platform_user_id` column and the 4 `tenant_modules`
   * rows' `enabled_by_platform_user_id` column. The legacy tenant-side
   * `demo_created_by` / `enabled_by_id` columns stay NULL.
   */
  create: platformAuthedProcedure
    .input(createDemoInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await demoService.createDemo(
          ctx.prisma,
          input,
          ctx.platformUser.id,
          { ipAddress: ctx.ipAddress, userAgent: ctx.userAgent },
        )
        await platformAudit.log(ctx.prisma, {
          platformUserId: ctx.platformUser.id,
          action: "demo.created",
          entityType: "tenant",
          entityId: result.tenantId,
          targetTenantId: result.tenantId,
          metadata: {
            tenantName: input.tenantName,
            tenantSlug: input.tenantSlug,
            demoTemplate: result.demoTemplate,
            demoExpiresAt: result.demoExpiresAt.toISOString(),
            adminUserId: result.adminUserId,
            adminEmail: input.adminEmail,
            welcomeEmailSent: result.welcomeEmailSent,
          },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })
        return result
      } catch (err) {
        if (err instanceof demoService.DemoTenantValidationError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err.message,
          })
        }
        if (err instanceof demoService.DemoTenantNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message })
        }
        throw err
      }
    }),

  /**
   * Extends a demo's expiration by 7 or 14 days. If the demo was already
   * expired (isActive=false), reactivates it and surfaces that in the
   * audit log metadata.
   */
  extend: platformAuthedProcedure
    .input(
      z.object({
        tenantId: tenantIdSchema,
        additionalDays: z.union([z.literal(7), z.literal(14)]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const before = await ctx.prisma.tenant.findUnique({
        where: { id: input.tenantId },
        select: { demoExpiresAt: true, isActive: true, name: true },
      })
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Demo tenant not found",
        })
      }
      try {
        const updated = await demoService.extendDemo(
          ctx.prisma,
          input.tenantId,
          input.additionalDays,
        )
        const wasReactivated = before.isActive === false
        await platformAudit.log(ctx.prisma, {
          platformUserId: ctx.platformUser.id,
          action: "demo.extended",
          entityType: "tenant",
          entityId: input.tenantId,
          targetTenantId: input.tenantId,
          changes: {
            demoExpiresAt: {
              old: before.demoExpiresAt,
              new: updated.demoExpiresAt,
            },
            ...(wasReactivated
              ? { isActive: { old: false, new: true } }
              : {}),
          },
          metadata: {
            additionalDays: input.additionalDays,
            tenantName: before.name,
            wasReactivated,
          },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })
        return updated
      } catch (err) {
        if (err instanceof demoService.DemoTenantNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message })
        }
        throw err
      }
    }),

  /**
   * Converts a demo to a real tenant.
   *
   * Orchestration order:
   *   1. `demoService.convertDemo` snapshots modules, optionally wipes,
   *      strips demo flags (all inside a single $transaction).
   *   2. If `discardData=true`, re-insert `tenant_modules` rows so the
   *      tenant's module envelope survives the wipe (subscription bridge
   *      below expects them).
   *   3. For each module, call `subscriptionService.createSubscription`
   *      (skipped if billing is disabled or tenant === operator tenant).
   *      Partial failures are collected in `failedModules[]`.
   *   4. One audit row with all the metadata.
   *
   * Known limitation: subscription creates open their own $transaction and
   * cannot be nested inside the convert tx, so a subscription failure after
   * a successful convert leaves the tenant converted without that
   * subscription row. The operator must retry via the modules page.
   */
  convert: platformAuthedProcedure
    .input(
      z.object({
        tenantId: tenantIdSchema,
        discardData: z.boolean(),
        billingCycle: z.enum(["MONTHLY", "ANNUALLY"]).default("MONTHLY"),
        billingExempt: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Step 1: atomic service call
      let convertResult: demoService.ConvertDemoResult
      try {
        convertResult = await demoService.convertDemo(
          ctx.prisma,
          input.tenantId,
          { discardData: input.discardData },
        )
      } catch (err) {
        if (err instanceof demoService.DemoTenantNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message })
        }
        throw err
      }

      // Step 2: re-insert modules after discardData wipe
      if (input.discardData) {
        for (const moduleKey of convertResult.snapshottedModules) {
          await ctx.prisma.tenantModule.upsert({
            where: {
              tenantId_module: {
                tenantId: input.tenantId,
                module: moduleKey,
              },
            },
            create: {
              tenantId: input.tenantId,
              module: moduleKey,
              enabledAt: new Date(),
              enabledById: null,
              enabledByPlatformUserId: ctx.platformUser.id,
              operatorNote: "Re-enabled after demo conversion (discardData=true)",
            },
            update: {
              enabledAt: new Date(),
              enabledById: null,
              enabledByPlatformUserId: ctx.platformUser.id,
            },
          })
        }
      }

      // Step 2b: flag the tenant as billing-exempt if requested. Must run
      // BEFORE the subscription bridge so createSubscription's defense guard
      // (PlatformSubscriptionBillingExemptError) doesn't trip if the caller
      // fails to skip.
      if (input.billingExempt) {
        await ctx.prisma.tenant.update({
          where: { id: input.tenantId },
          data: { billingExempt: true },
        })
      }

      // Step 3: subscription bridge — one createSubscription per module.
      const subscriptionIds: string[] = []
      const failedModules: Array<{ module: string; error: string }> = []
      const isHouseTenant = subscriptionService.isOperatorTenant(
        input.tenantId,
      )

      if (
        subscriptionService.isSubscriptionBillingEnabled() &&
        !isHouseTenant &&
        !input.billingExempt
      ) {
        for (const moduleKey of convertResult.snapshottedModules) {
          try {
            // Reuse an existing active subscription for this (tenant, module)
            // if one already exists — handles the re-enable-after-convert
            // edge case where a prior partial failure left a stale subscription.
            const existing = await ctx.prisma.platformSubscription.findFirst({
              where: {
                tenantId: input.tenantId,
                module: moduleKey,
                status: "active",
              },
              select: { id: true },
            })
            if (existing) {
              subscriptionIds.push(existing.id)
              continue
            }
            const subResult = await subscriptionService.createSubscription(
              ctx.prisma,
              {
                customerTenantId: input.tenantId,
                module: moduleKey as ModuleId,
                billingCycle: input.billingCycle,
              },
              ctx.platformUser.id,
            )
            subscriptionIds.push(subResult.subscriptionId)
          } catch (err) {
            failedModules.push({
              module: moduleKey,
              error: err instanceof Error ? err.message : String(err),
            })
          }
        }
      } else if (input.billingExempt && !isHouseTenant) {
        // Exempt path: create the CRM address once so the customer is
        // visible in the operator CRM, but skip all subscription creates.
        // Non-fatal on failure — convert is already committed.
        try {
          await subscriptionService.findOrCreateOperatorCrmAddress(
            ctx.prisma,
            input.tenantId,
          )
        } catch (err) {
          failedModules.push({
            module: "__crm_address__",
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }

      // Step 4: audit (platform-side only)
      await platformAudit.log(ctx.prisma, {
        platformUserId: ctx.platformUser.id,
        action: "demo.converted",
        entityType: "tenant",
        entityId: input.tenantId,
        targetTenantId: input.tenantId,
        changes: { isDemo: { old: true, new: false } },
        metadata: {
          tenantName: convertResult.tenantName,
          discardData: input.discardData,
          originalTemplate: convertResult.originalTemplate,
          billingCycle: input.billingCycle,
          billingExempt: input.billingExempt,
          moduleCount: convertResult.snapshottedModules.length,
          moduleKeys: convertResult.snapshottedModules,
          subscriptionIds,
          failedModules: failedModules.length > 0 ? failedModules : null,
          isHouseTenant,
        },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })

      return {
        ok: true as const,
        subscriptionIds,
        failedModules,
      }
    }),

  /**
   * Manually expires a demo (admin "kill switch"). Sets isActive=false and
   * demo_expires_at=now.
   */
  expireNow: platformAuthedProcedure
    .input(z.object({ tenantId: tenantIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const before = await ctx.prisma.tenant.findUnique({
        where: { id: input.tenantId },
        select: { name: true, isActive: true },
      })
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Demo tenant not found",
        })
      }
      try {
        const result = await demoService.expireDemoNow(
          ctx.prisma,
          input.tenantId,
        )
        await platformAudit.log(ctx.prisma, {
          platformUserId: ctx.platformUser.id,
          action: "demo.expired_manually",
          entityType: "tenant",
          entityId: input.tenantId,
          targetTenantId: input.tenantId,
          changes: { isActive: { old: before.isActive, new: false } },
          metadata: { tenantName: before.name },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })
        return result
      } catch (err) {
        if (err instanceof demoService.DemoTenantNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message })
        }
        throw err
      }
    }),

  /**
   * Hard-deletes an expired demo. Writes the audit row BEFORE the delete so
   * `target_tenant_id` is still valid at insert time. The
   * `platform_audit_logs.target_tenant_id` FK cascades to NULL on delete
   * (SET NULL), but `metadata.tenantName` / `metadata.tenantSlug` survive
   * for post-mortem lookup.
   */
  delete: platformAuthedProcedure
    .input(z.object({ tenantId: tenantIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.tenant.findUnique({
        where: { id: input.tenantId },
        select: {
          name: true,
          slug: true,
          demoTemplate: true,
          createdAt: true,
          demoExpiresAt: true,
          isActive: true,
          isDemo: true,
        },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Demo tenant not found",
        })
      }
      if (!existing.isDemo) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Not a demo tenant",
        })
      }
      if (existing.isActive !== false) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot delete an active demo — expire first",
        })
      }

      // Audit BEFORE the cascade. See route-level doc above for rationale.
      await platformAudit.log(ctx.prisma, {
        platformUserId: ctx.platformUser.id,
        action: "demo.deleted",
        entityType: "tenant",
        entityId: input.tenantId,
        targetTenantId: input.tenantId,
        metadata: {
          tenantName: existing.name,
          tenantSlug: existing.slug,
          originalTemplate: existing.demoTemplate,
          createdAt: existing.createdAt?.toISOString() ?? null,
          demoExpiredAt: existing.demoExpiresAt?.toISOString() ?? null,
        },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })

      try {
        return await demoService.deleteDemo(ctx.prisma, input.tenantId)
      } catch (err) {
        if (err instanceof demoService.DemoTenantNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message })
        }
        if (err instanceof demoService.DemoTenantForbiddenError) {
          throw new TRPCError({ code: "FORBIDDEN", message: err.message })
        }
        throw err
      }
    }),
})
