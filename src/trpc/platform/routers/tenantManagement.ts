/**
 * Platform tenant management router.
 *
 * Operator-hoheit mutations on the tenant envelope: create/update/
 * deactivate/reactivate/soft-delete, plus module booking. Writes only to
 * `platform_audit_logs` (never the tenant `audit_logs`) because these
 * actions exist outside the tenant's own security model — a tenant cannot
 * consent to "being deactivated".
 *
 * Split intentionally from `platform/routers/tenants.ts`: that router is
 * impersonation-guarded for reads/writes INTO tenant data through a
 * SupportSession; this router is pure operator control of the tenant
 * record itself and flows through `platformAuthedProcedure`.
 */
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { createTRPCRouter, platformAuthedProcedure } from "../init"
import * as platformAudit from "@/lib/platform/audit-service"
import * as subscriptionService from "@/lib/platform/subscription-service"
import * as billingPaymentService from "@/lib/services/billing-payment-service"
import { create as createUserService } from "@/lib/services/users-service"
import { AVAILABLE_MODULES } from "@/lib/modules/constants"
import { PLATFORM_SYSTEM_USER_ID } from "@/trpc/init"

// --- Schemas ----------------------------------------------------------------

const moduleEnum = z.enum(AVAILABLE_MODULES)

const slugPattern = /^[a-z0-9-]+$/

// Lenient UUID-like id validator: the dev-seeded tenant id
// `10000000-0000-0000-0000-000000000001` is a nil-pattern fixture, not a
// v4 UUID, so `tenantIdSchema` rejects it under zod v4. Real production
// tenants still use `gen_random_uuid()` (v4), so both formats must pass.
const tenantIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)

// --- Helpers ----------------------------------------------------------------

function computeChanges<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  keys: (keyof T)[],
): Record<string, { old: unknown; new: unknown }> {
  const changes: Record<string, { old: unknown; new: unknown }> = {}
  for (const key of keys) {
    if (after[key] === undefined) continue
    if (before[key] !== after[key]) {
      changes[key as string] = { old: before[key], new: after[key] }
    }
  }
  return changes
}

// --- Router -----------------------------------------------------------------

export const platformTenantManagementRouter = createTRPCRouter({
  // --- Tenant CRUD ---------------------------------------------------------

  list: platformAuthedProcedure
    .input(
      z.object({
        search: z.string().trim().max(255).optional(),
        status: z.enum(["active", "inactive", "all"]).default("all"),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {}
      if (input.status === "active") where.isActive = true
      if (input.status === "inactive") where.isActive = false
      if (input.search) {
        where.OR = [
          { name: { contains: input.search, mode: "insensitive" } },
          { slug: { contains: input.search, mode: "insensitive" } },
        ]
      }

      const [items, total] = await Promise.all([
        ctx.prisma.tenant.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
            isDemo: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        ctx.prisma.tenant.count({ where }),
      ])

      return { items, total, page: input.page, pageSize: input.pageSize }
    }),

  getById: platformAuthedProcedure
    .input(z.object({ id: tenantIdSchema }))
    .query(async ({ ctx, input }) => {
      const tenant = await ctx.prisma.tenant.findUnique({
        where: { id: input.id },
      })
      if (!tenant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" })
      }

      const [userCount, activeSupportSessions, enabledModules] = await Promise.all([
        ctx.prisma.user.count({ where: { tenantId: tenant.id } }),
        ctx.prisma.supportSession.count({
          where: {
            tenantId: tenant.id,
            status: "active",
            expiresAt: { gt: new Date() },
          },
        }),
        ctx.prisma.tenantModule.count({ where: { tenantId: tenant.id } }),
      ])

      return {
        tenant,
        counts: {
          users: userCount,
          enabledModules,
          activeSupportSessions,
        },
      }
    }),

  create: platformAuthedProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(255),
        slug: z
          .string()
          .trim()
          .toLowerCase()
          .min(2)
          .max(100)
          .regex(slugPattern, "Slug darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten"),
        contactEmail: z.string().email(),
        initialAdminEmail: z.string().email(),
        initialAdminDisplayName: z.string().trim().min(2).max(255),
        addressStreet: z.string().trim().min(1).max(255),
        addressZip: z.string().trim().min(1).max(20),
        addressCity: z.string().trim().min(1).max(100),
        addressCountry: z.string().trim().min(1).max(100),
        billingExempt: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Create tenant row + initial admin user in a single transaction.
      // users-service.create widened its Tx parameter (Phase 0 fix) exactly
      // so platform flows can reuse it from inside an outer transaction.
      let createdAuthUserId: string | null = null
      try {
        const result = await ctx.prisma.$transaction(
          async (tx) => {
            const existing = await tx.tenant.findUnique({
              where: { slug: input.slug },
            })
            if (existing) {
              throw new TRPCError({
                code: "CONFLICT",
                message: "Tenant-Slug existiert bereits",
              })
            }

            const tenant = await tx.tenant.create({
              data: {
                name: input.name,
                slug: input.slug,
                email: input.contactEmail,
                addressStreet: input.addressStreet,
                addressZip: input.addressZip,
                addressCity: input.addressCity,
                addressCountry: input.addressCountry,
                isActive: true,
                billingExempt: input.billingExempt,
              },
            })

            // Create a per-tenant admin group so the initial user has full
            // permissions (is_admin bypass). Without this, the first user
            // cannot access the UI to manage permissions — chicken-and-egg.
            const adminGroup = await tx.userGroup.create({
              data: {
                tenantId: tenant.id,
                name: "Administratoren",
                code: "ADMIN",
                description: "Vollzugriff auf alle Module und Funktionen",
                permissions: [],
                isAdmin: true,
                isSystem: false,
                isActive: true,
              },
            })

            const { user: adminUser, welcomeEmail } = await createUserService(
              tx,
              tenant.id,
              {
                email: input.initialAdminEmail,
                displayName: input.initialAdminDisplayName,
                userGroupId: adminGroup.id,
                isActive: true,
                isLocked: false,
              },
              {
                // Tenant-side audit attributes the action to the platform
                // system sentinel — the acting platform operator is not a
                // member of the new tenant. The authoritative record of
                // the actor lives in platform_audit_logs below.
                userId: PLATFORM_SYSTEM_USER_ID,
                ipAddress: ctx.ipAddress,
                userAgent: ctx.userAgent,
              },
            )
            createdAuthUserId = adminUser.id

            return { tenant, adminUser, welcomeEmail }
          },
          { timeout: 60_000 },
        )

        await platformAudit.log(ctx.prisma, {
          platformUserId: ctx.platformUser.id,
          action: "tenant.created",
          entityType: "tenant",
          entityId: result.tenant.id,
          targetTenantId: result.tenant.id,
          metadata: {
            slug: result.tenant.slug,
            initialAdminEmail: input.initialAdminEmail,
            welcomeEmailSent: result.welcomeEmail.sent,
            billingExempt: input.billingExempt,
          },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })

        return {
          tenant: result.tenant,
          inviteLink: result.welcomeEmail.fallbackLink,
          welcomeEmailSent: result.welcomeEmail.sent,
        }
      } catch (err) {
        // On transaction failure AFTER auth.users was created, users-service
        // already rolled the auth user back itself (it catches repo errors
        // internally and calls auth.admin.deleteUser). But if the tenant
        // insert raced into the catch BEFORE users-service ran, there is
        // nothing to compensate — createdAuthUserId is still null. The
        // reference assignment above is defensive; we do not double-rollback.
        void createdAuthUserId
        throw err
      }
    }),

  update: platformAuthedProcedure
    .input(
      z.object({
        id: tenantIdSchema,
        name: z.string().trim().min(2).max(255).optional(),
        contactEmail: z.string().email().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.tenant.findUnique({
        where: { id: input.id },
      })
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" })
      }

      const data: Record<string, unknown> = {}
      if (input.name !== undefined) data.name = input.name
      if (input.contactEmail !== undefined) data.email = input.contactEmail

      const updated = await ctx.prisma.tenant.update({
        where: { id: input.id },
        data,
      })

      const changes = computeChanges(
        {
          name: existing.name,
          email: existing.email,
        },
        {
          name: updated.name,
          email: updated.email,
        },
        ["name", "email"],
      )

      await platformAudit.log(ctx.prisma, {
        platformUserId: ctx.platformUser.id,
        action: "tenant.updated",
        entityType: "tenant",
        entityId: updated.id,
        targetTenantId: updated.id,
        changes,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })

      return updated
    }),

  setBillingExempt: platformAuthedProcedure
    .input(
      z.object({
        id: tenantIdSchema,
        billingExempt: z.boolean(),
        reason: z.string().trim().min(3).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.tenant.findUnique({
        where: { id: input.id },
        select: { id: true, billingExempt: true, name: true },
      })
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" })
      }
      if (existing.billingExempt === input.billingExempt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Das Flag ist bereits auf diesem Wert",
        })
      }

      // Defense: refuse to flip the operator tenant — it is implicitly
      // exempt via the self-bill guard and should never appear in this UI,
      // but we fail loud if the operator ever tries.
      if (subscriptionService.isOperatorTenant(input.id)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Der Operator-Tenant kann nicht umgeschaltet werden",
        })
      }

      await ctx.prisma.tenant.update({
        where: { id: input.id },
        data: { billingExempt: input.billingExempt },
      })

      await platformAudit.log(ctx.prisma, {
        platformUserId: ctx.platformUser.id,
        action: "tenant.billing_exempt_changed",
        entityType: "tenant",
        entityId: input.id,
        targetTenantId: input.id,
        changes: {
          billingExempt: {
            old: existing.billingExempt,
            new: input.billingExempt,
          },
        },
        metadata: { reason: input.reason },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })

      return { success: true }
    }),

  deactivate: platformAuthedProcedure
    .input(
      z.object({
        id: tenantIdSchema,
        reason: z.string().trim().min(3).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.tenant.findUnique({
        where: { id: input.id },
      })
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" })
      }

      await ctx.prisma.tenant.update({
        where: { id: input.id },
        data: { isActive: false },
      })

      await platformAudit.log(ctx.prisma, {
        platformUserId: ctx.platformUser.id,
        action: "tenant.deactivated",
        entityType: "tenant",
        entityId: input.id,
        targetTenantId: input.id,
        metadata: { reason: input.reason },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })

      return { success: true }
    }),

  reactivate: platformAuthedProcedure
    .input(z.object({ id: tenantIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.tenant.findUnique({
        where: { id: input.id },
      })
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" })
      }

      await ctx.prisma.tenant.update({
        where: { id: input.id },
        data: { isActive: true },
      })

      await platformAudit.log(ctx.prisma, {
        platformUserId: ctx.platformUser.id,
        action: "tenant.reactivated",
        entityType: "tenant",
        entityId: input.id,
        targetTenantId: input.id,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })

      return { success: true }
    }),

  softDelete: platformAuthedProcedure
    .input(
      z.object({
        id: tenantIdSchema,
        reason: z.string().trim().min(3).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.tenant.findUnique({
        where: { id: input.id },
      })
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" })
      }

      // No deleted_at column on tenants — soft delete = isActive=false with
      // a distinct audit action so operators can distinguish "deactivated
      // temporarily" from "closed out" in the audit trail.
      await ctx.prisma.tenant.update({
        where: { id: input.id },
        data: { isActive: false },
      })

      await platformAudit.log(ctx.prisma, {
        platformUserId: ctx.platformUser.id,
        action: "tenant.soft_deleted",
        entityType: "tenant",
        entityId: input.id,
        targetTenantId: input.id,
        metadata: { reason: input.reason },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })

      return { success: true }
    }),

  // --- Module management ---------------------------------------------------

  listModules: platformAuthedProcedure
    .input(z.object({ tenantId: tenantIdSchema }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.tenantModule.findMany({
        where: { tenantId: input.tenantId },
        orderBy: { module: "asc" },
        include: {
          enabledBy: {
            select: { id: true, displayName: true, email: true },
          },
        },
      })

      // Join enabledByPlatformUserId → display name in a second query so
      // we don't need an FK on the column. Batch the lookups.
      const platformUserIds = Array.from(
        new Set(
          rows
            .map((r) => r.enabledByPlatformUserId)
            .filter((id): id is string => id !== null),
        ),
      )
      const platformUsers =
        platformUserIds.length > 0
          ? await ctx.prisma.platformUser.findMany({
              where: { id: { in: platformUserIds } },
              select: { id: true, displayName: true, email: true },
            })
          : []
      const platformUserById = new Map(platformUsers.map((u) => [u.id, u]))

      // Merge with the full AVAILABLE_MODULES list so the UI can render
      // disabled rows alongside enabled ones.
      const enabledByKey = new Map(rows.map((r) => [r.module, r]))
      return AVAILABLE_MODULES.map((moduleKey) => {
        const row = enabledByKey.get(moduleKey)
        if (!row) {
          return {
            module: moduleKey,
            enabled: false,
            enabledAt: null,
            operatorNote: null,
            enabledBy: null as null | {
              kind: "tenant" | "platform"
              id: string
              displayName: string
              email: string
            },
          }
        }
        const tenantEnabledBy = row.enabledBy
        const platformEnabledBy = row.enabledByPlatformUserId
          ? platformUserById.get(row.enabledByPlatformUserId)
          : undefined
        return {
          module: row.module,
          enabled: true,
          enabledAt: row.enabledAt,
          operatorNote: row.operatorNote,
          enabledBy: platformEnabledBy
            ? {
                kind: "platform" as const,
                id: platformEnabledBy.id,
                displayName: platformEnabledBy.displayName,
                email: platformEnabledBy.email,
              }
            : tenantEnabledBy
              ? {
                  kind: "tenant" as const,
                  id: tenantEnabledBy.id,
                  displayName: tenantEnabledBy.displayName,
                  email: tenantEnabledBy.email,
                }
              : null,
        }
      })
    }),

  listSubscriptions: platformAuthedProcedure
    .input(z.object({ tenantId: tenantIdSchema }))
    .query(async ({ ctx, input }) => {
      const subs = await subscriptionService.listForCustomer(
        ctx.prisma,
        input.tenantId,
      )

      if (!subscriptionService.isSubscriptionBillingEnabled()) {
        return subs.map((s) => ({ ...s, isOverdue: false }))
      }
      const operatorTenantId = subscriptionService.requireOperatorTenantId()
      const result: Array<(typeof subs)[number] & { isOverdue: boolean }> = []
      for (const sub of subs) {
        let isOverdue = false
        if (sub.lastGeneratedInvoiceId) {
          try {
            const openItem = await billingPaymentService.getOpenItemById(
              ctx.prisma,
              operatorTenantId,
              sub.lastGeneratedInvoiceId,
            )
            isOverdue = openItem?.isOverdue ?? false
          } catch {
            // invoice might not be in open-items (already paid or not
            // matching type filters) — leave isOverdue=false
          }
        }
        result.push({ ...sub, isOverdue })
      }
      return result
    }),

  enableModule: platformAuthedProcedure
    .input(
      z.object({
        tenantId: tenantIdSchema,
        moduleKey: moduleEnum,
        operatorNote: z.string().trim().max(255).optional(),
        billingCycle: z.enum(["MONTHLY", "ANNUALLY"]).default("MONTHLY"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenant = await ctx.prisma.tenant.findUnique({
        where: { id: input.tenantId },
        select: { id: true, billingExempt: true },
      })
      if (!tenant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" })
      }

      const row = await ctx.prisma.tenantModule.upsert({
        where: {
          tenantId_module: {
            tenantId: input.tenantId,
            module: input.moduleKey,
          },
        },
        create: {
          tenantId: input.tenantId,
          module: input.moduleKey,
          enabledAt: new Date(),
          enabledById: null,
          enabledByPlatformUserId: ctx.platformUser.id,
          operatorNote: input.operatorNote ?? null,
        },
        update: {
          enabledAt: new Date(),
          enabledById: null,
          enabledByPlatformUserId: ctx.platformUser.id,
          operatorNote: input.operatorNote ?? null,
        },
      })

      // Phase 10a: also create a platform_subscription if billing is enabled.
      // Skip conditions:
      //   1. Operator tenant booking modules on itself — the "house" is
      //      not billed (see subscription-service.isOperatorTenant +
      //      PlatformSubscriptionSelfBillError).
      //   2. Customer tenant is billing-exempt — CRM address still created
      //      so the customer is visible in the operator CRM, but no abos
      //      or recurring invoices (plan 2026-04-13-platform-billing-exempt-tenants).
      //   3. An active subscription already exists for (tenantId, module) —
      //      that happens on a re-enable.
      let subscriptionResult:
        | Awaited<ReturnType<typeof subscriptionService.createSubscription>>
        | null = null
      let operatorCrmAddressId: string | null = null
      const isHouseTenant = subscriptionService.isOperatorTenant(input.tenantId)
      const shouldBill =
        subscriptionService.isSubscriptionBillingEnabled() &&
        !isHouseTenant &&
        !tenant.billingExempt

      if (shouldBill) {
        const existing = await ctx.prisma.platformSubscription.findFirst({
          where: {
            tenantId: input.tenantId,
            module: input.moduleKey,
            status: "active",
          },
          select: { id: true },
        })
        if (!existing) {
          subscriptionResult = await subscriptionService.createSubscription(
            ctx.prisma,
            {
              customerTenantId: input.tenantId,
              module: input.moduleKey,
              billingCycle: input.billingCycle,
            },
            ctx.platformUser.id,
          )
          operatorCrmAddressId = subscriptionResult?.operatorCrmAddressId ?? null
        }
      } else if (
        tenant.billingExempt &&
        subscriptionService.isSubscriptionBillingEnabled() &&
        !isHouseTenant
      ) {
        // Exempt-Pfad: CRM-Adresse im Operator-Tenant anlegen, damit der
        // Kunde im Operator-CRM sichtbar ist, auch wenn keine Abos laufen.
        // findOrCreateOperatorCrmAddress ist idempotent.
        operatorCrmAddressId =
          await subscriptionService.findOrCreateOperatorCrmAddress(
            ctx.prisma,
            input.tenantId,
          )
      }

      await platformAudit.log(ctx.prisma, {
        platformUserId: ctx.platformUser.id,
        action: "module.enabled",
        entityType: "tenant_module",
        entityId: row.id,
        targetTenantId: input.tenantId,
        metadata: {
          moduleKey: input.moduleKey,
          operatorNote: input.operatorNote ?? null,
          billingCycle: input.billingCycle,
          subscriptionId: subscriptionResult?.subscriptionId ?? null,
          billingRecurringInvoiceId:
            subscriptionResult?.billingRecurringInvoiceId ?? null,
          operatorCrmAddressId,
          billingExempt: tenant.billingExempt,
        },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })

      return row
    }),

  disableModule: platformAuthedProcedure
    .input(
      z.object({
        tenantId: tenantIdSchema,
        moduleKey: moduleEnum,
        reason: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.moduleKey === "core") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Das Core-Modul kann nicht deaktiviert werden",
        })
      }

      const tenant = await ctx.prisma.tenant.findUnique({
        where: { id: input.tenantId },
        select: { billingExempt: true },
      })

      const row = await ctx.prisma.tenantModule.findUnique({
        where: {
          tenantId_module: {
            tenantId: input.tenantId,
            module: input.moduleKey,
          },
        },
      })
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Modul ist für diesen Tenant nicht aktiviert",
        })
      }

      await ctx.prisma.tenantModule.delete({
        where: { id: row.id },
      })

      // Phase 10a: cancel the active subscription if billing is enabled.
      // Skip for the operator tenant itself (house) and for billing-exempt
      // tenants (both have no subscription to cancel).
      let cancelledSubscriptionId: string | null = null
      const isHouseTenant = subscriptionService.isOperatorTenant(input.tenantId)
      if (
        subscriptionService.isSubscriptionBillingEnabled() &&
        !isHouseTenant &&
        !tenant?.billingExempt
      ) {
        const activeSub = await ctx.prisma.platformSubscription.findFirst({
          where: {
            tenantId: input.tenantId,
            module: input.moduleKey,
            status: "active",
          },
          select: { id: true },
        })
        if (activeSub) {
          await subscriptionService.cancelSubscription(
            ctx.prisma,
            {
              subscriptionId: activeSub.id,
              reason: input.reason ?? "Platform module disabled",
            },
            ctx.platformUser.id,
          )
          cancelledSubscriptionId = activeSub.id
        }
      }

      await platformAudit.log(ctx.prisma, {
        platformUserId: ctx.platformUser.id,
        action: "module.disabled",
        entityType: "tenant_module",
        entityId: row.id,
        targetTenantId: input.tenantId,
        metadata: {
          moduleKey: input.moduleKey,
          reason: input.reason ?? null,
          operatorNote: row.operatorNote,
          cancelledSubscriptionId,
          billingExempt: tenant?.billingExempt ?? false,
        },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })

      return { success: true }
    }),
})
