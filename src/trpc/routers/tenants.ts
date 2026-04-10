/**
 * Tenants Router
 *
 * Provides tenant CRUD operations via tRPC procedures.
 * Replaces the Go backend tenant endpoints:
 * - GET /tenants (list) -> tenants.list
 * - GET /tenants/{id} -> tenants.getById
 * - POST /tenants -> tenants.create
 * - PATCH /tenants/{id} -> tenants.update
 * - DELETE /tenants/{id} -> tenants.deactivate
 *
 * @see apps/api/internal/service/tenant.go
 * @see apps/api/internal/handler/tenant.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import {
  createTRPCRouter,
  protectedProcedure,
  tenantProcedure,
} from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as auditLog from "@/lib/services/audit-logs-service"
import * as platformAudit from "@/lib/platform/audit-service"

// --- Permission Constants ---

const TENANTS_MANAGE = permissionIdByKey("tenants.manage")!
const SUPPORT_ACCESS_GRANT = permissionIdByKey(
  "platform.support_access.grant"
)!

// --- Enums ---

const vacationBasisEnum = z.enum(["calendar_year", "entry_date"])

// --- Output Schema ---

const tenantOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  isActive: z.boolean().nullable(),
  addressStreet: z.string().nullable(),
  addressZip: z.string().nullable(),
  addressCity: z.string().nullable(),
  addressCountry: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  payrollExportBasePath: z.string().nullable(),
  notes: z.string().nullable(),
  vacationBasis: z.string(),
  settings: z.unknown().nullable(),
  createdAt: z.date().nullable(),
  updatedAt: z.date().nullable(),
  // Demo-tenant fields — see plan 2026-04-09-demo-tenant-system.md (Phase 3).
  // Exposed so the frontend TenantProvider / demo-expired gate can read them
  // from tenants.list without a dedicated query.
  isDemo: z.boolean(),
  demoExpiresAt: z.date().nullable(),
  demoTemplate: z.string().nullable(),
  demoCreatedById: z.string().nullable(),
  demoNotes: z.string().nullable(),
})

// --- Helpers ---
/**
 * Projects a prisma Tenant row onto the tRPC output schema. Centralized so
 * all four CRUD procedures (list, getById, create, update) stay in sync with
 * the schema above.
 */
function toTenantOutput(t: {
  id: string
  name: string
  slug: string
  isActive: boolean | null
  addressStreet: string | null
  addressZip: string | null
  addressCity: string | null
  addressCountry: string | null
  phone: string | null
  email: string | null
  payrollExportBasePath: string | null
  notes: string | null
  vacationBasis: string
  settings: unknown
  createdAt: Date | null
  updatedAt: Date | null
  isDemo: boolean
  demoExpiresAt: Date | null
  demoTemplate: string | null
  demoCreatedById: string | null
  demoNotes: string | null
}) {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    isActive: t.isActive,
    addressStreet: t.addressStreet,
    addressZip: t.addressZip,
    addressCity: t.addressCity,
    addressCountry: t.addressCountry,
    phone: t.phone,
    email: t.email,
    payrollExportBasePath: t.payrollExportBasePath,
    notes: t.notes,
    vacationBasis: t.vacationBasis,
    settings: t.settings,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    isDemo: t.isDemo,
    demoExpiresAt: t.demoExpiresAt,
    demoTemplate: t.demoTemplate,
    demoCreatedById: t.demoCreatedById,
    demoNotes: t.demoNotes,
  }
}

// --- Input: Create ---

const createTenantInputSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(3, "Slug must be at least 3 characters"),
  addressStreet: z.string().min(1, "Street is required"),
  addressZip: z.string().min(1, "ZIP is required"),
  addressCity: z.string().min(1, "City is required"),
  addressCountry: z.string().min(1, "Country is required"),
  phone: z.string().nullish(),
  email: z.string().email().nullish(),
  payrollExportBasePath: z.string().nullish(),
  notes: z.string().nullish(),
  vacationBasis: vacationBasisEnum.optional().default("calendar_year"),
})

// --- Input: Update ---

const updateTenantInputSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  addressStreet: z.string().min(1).optional(),
  addressZip: z.string().min(1).optional(),
  addressCity: z.string().min(1).optional(),
  addressCountry: z.string().min(1).optional(),
  phone: z.string().nullish(),
  email: z.string().email().nullish(),
  payrollExportBasePath: z.string().nullish(),
  notes: z.string().nullish(),
  vacationBasis: vacationBasisEnum.optional(),
  isActive: z.boolean().optional(),
})

// --- Helpers ---

/**
 * Normalizes an optional string: trims whitespace, returns null if empty.
 * Mirrors Go's normalizeOptionalString (tenant.go lines 264-271).
 */
function normalizeOptionalString(
  value: string | null | undefined
): string | null {
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

// --- Helpers ---

/**
 * Verifies the authenticated user has access to the given tenant
 * via the userTenants join table loaded in context.
 */
function assertUserHasTenantAccess(
  userTenants: { tenantId: string }[],
  tenantId: string
) {
  const hasAccess = userTenants.some((ut) => ut.tenantId === tenantId)
  if (!hasAccess) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Access to tenant denied",
    })
  }
}

// --- Router ---

export const tenantsRouter = createTRPCRouter({
  /**
   * tenants.list -- Returns tenants the current user has access to.
   *
   * No permission required -- data is filtered to user's authorized tenants.
   * Uses protectedProcedure (not tenantProcedure) since listing tenants
   * does not require a tenant context.
   *
   * Replaces: GET /tenants (Go TenantHandler.List)
   */
  list: protectedProcedure
    .input(
      z
        .object({
          name: z.string().optional(),
          active: z.boolean().optional(),
        })
        .optional()
    )
    .output(z.array(tenantOutputSchema))
    .query(async ({ ctx, input }) => {
      try {
        // Get user's authorized tenants via userTenants join table
        const userTenants = await ctx.prisma.userTenant.findMany({
          where: { userId: ctx.user.id },
          include: { tenant: true },
        })

        let tenants = userTenants.map((ut) => ut.tenant)

        // Apply optional name filter (case-insensitive contains)
        if (input?.name) {
          const lowerName = input.name.toLowerCase()
          tenants = tenants.filter((t) =>
            t.name.toLowerCase().includes(lowerName)
          )
        }

        // Apply optional active filter
        if (input?.active !== undefined) {
          tenants = tenants.filter((t) => t.isActive === input.active)
        }

        return tenants.map(toTenantOutput)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * tenants.getById -- Returns a single tenant by ID.
   *
   * Requires: tenants.manage permission
   *
   * Replaces: GET /tenants/{id} (Go TenantHandler.Get)
   */
  getById: protectedProcedure
    .use(requirePermission(TENANTS_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(tenantOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        assertUserHasTenantAccess(ctx.user!.userTenants, input.id)

        const tenant = await ctx.prisma.tenant.findUnique({
          where: { id: input.id },
        })

        if (!tenant) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Tenant not found",
          })
        }

        return toTenantOutput(tenant)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * tenants.create -- Creates a new tenant.
   *
   * Requires: tenants.manage permission
   * Auto-adds the creating user to the tenant with role "owner".
   *
   * Replaces: POST /tenants (Go TenantHandler.Create + TenantService.Create)
   */
  create: protectedProcedure
    .use(requirePermission(TENANTS_MANAGE))
    .input(createTenantInputSchema)
    .output(tenantOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        // Normalize slug and name
        const slug = input.slug.trim().toLowerCase()
        const name = input.name.trim()

        // Re-validate after trim
        if (slug.length < 3) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Slug must be at least 3 characters",
          })
        }
        if (name.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Name is required",
          })
        }

        // Validate address fields after trim
        const addressStreet = input.addressStreet.trim()
        const addressZip = input.addressZip.trim()
        const addressCity = input.addressCity.trim()
        const addressCountry = input.addressCountry.trim()

        if (
          !addressStreet ||
          !addressZip ||
          !addressCity ||
          !addressCountry
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "All address fields are required",
          })
        }

        // Use transaction for atomic slug check + tenant + userTenant creation
        const tenant = await ctx.prisma.$transaction(async (tx) => {
          // Check slug uniqueness inside transaction
          const existingBySlug = await tx.tenant.findUnique({
            where: { slug },
          })
          if (existingBySlug) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Tenant slug already exists",
            })
          }

          // Normalize optional strings
          const phone = normalizeOptionalString(input.phone)
          const email = normalizeOptionalString(input.email)
          const payrollExportBasePath = normalizeOptionalString(
            input.payrollExportBasePath
          )
          const notes = normalizeOptionalString(input.notes)

          // Create tenant
          const created = await tx.tenant.create({
            data: {
              name,
              slug,
              addressStreet,
              addressZip,
              addressCity,
              addressCountry,
              phone,
              email,
              payrollExportBasePath,
              notes,
              vacationBasis: input.vacationBasis,
              isActive: true,
            },
          })

          // Auto-add creator to tenant with role "owner"
          const userId = ctx.user!.id
          await tx.userTenant.upsert({
            where: {
              userId_tenantId: {
                userId,
                tenantId: created.id,
              },
            },
            create: {
              userId,
              tenantId: created.id,
              role: "owner",
            },
            update: {},
          })

          return created
        })

        await auditLog.log(ctx.prisma, {
          tenantId: tenant.id,
          userId: ctx.user!.id,
          action: "create",
          entityType: "tenant",
          entityId: tenant.id,
          entityName: tenant.name,
          changes: null,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }).catch(err => console.error('[AuditLog] Failed:', err))

        return toTenantOutput(tenant)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * tenants.update -- Updates an existing tenant.
   *
   * Requires: tenants.manage permission
   * Only updates provided fields (partial update).
   *
   * Replaces: PATCH /tenants/{id} (Go TenantHandler.Update + TenantService.Update)
   */
  update: protectedProcedure
    .use(requirePermission(TENANTS_MANAGE))
    .input(updateTenantInputSchema)
    .output(tenantOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        assertUserHasTenantAccess(ctx.user!.userTenants, input.id)

        // Verify tenant exists
        const existing = await ctx.prisma.tenant.findUnique({
          where: { id: input.id },
        })
        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Tenant not found",
          })
        }

        // Build update data with only provided fields
        const data: Record<string, unknown> = {}

        if (input.name !== undefined) {
          const name = input.name.trim()
          if (name.length === 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Name cannot be empty",
            })
          }
          data.name = name
        }

        if (input.addressStreet !== undefined) {
          const val = input.addressStreet.trim()
          if (val.length === 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Street cannot be empty",
            })
          }
          data.addressStreet = val
        }

        if (input.addressZip !== undefined) {
          const val = input.addressZip.trim()
          if (val.length === 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "ZIP cannot be empty",
            })
          }
          data.addressZip = val
        }

        if (input.addressCity !== undefined) {
          const val = input.addressCity.trim()
          if (val.length === 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "City cannot be empty",
            })
          }
          data.addressCity = val
        }

        if (input.addressCountry !== undefined) {
          const val = input.addressCountry.trim()
          if (val.length === 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Country cannot be empty",
            })
          }
          data.addressCountry = val
        }

        if (input.phone !== undefined) {
          data.phone = normalizeOptionalString(input.phone)
        }

        if (input.email !== undefined) {
          data.email = normalizeOptionalString(input.email)
        }

        if (input.payrollExportBasePath !== undefined) {
          data.payrollExportBasePath = normalizeOptionalString(
            input.payrollExportBasePath
          )
        }

        if (input.notes !== undefined) {
          data.notes = normalizeOptionalString(input.notes)
        }

        if (input.vacationBasis !== undefined) {
          data.vacationBasis = input.vacationBasis
        }

        if (input.isActive !== undefined) {
          data.isActive = input.isActive
        }

        const tenant = await ctx.prisma.tenant.update({
          where: { id: input.id },
          data,
        })

        const changes = auditLog.computeChanges(
          existing as unknown as Record<string, unknown>,
          tenant as unknown as Record<string, unknown>,
          ["name", "addressStreet", "addressZip", "addressCity", "addressCountry", "phone", "email", "payrollExportBasePath", "notes", "vacationBasis", "isActive"]
        )
        await auditLog.log(ctx.prisma, {
          tenantId: tenant.id,
          userId: ctx.user!.id,
          action: "update",
          entityType: "tenant",
          entityId: tenant.id,
          entityName: tenant.name,
          changes,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }).catch(err => console.error('[AuditLog] Failed:', err))

        return toTenantOutput(tenant)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * tenants.deactivate -- Soft-deletes a tenant by setting isActive = false.
   *
   * Requires: tenants.manage permission
   *
   * Replaces: DELETE /tenants/{id} (Go TenantHandler.Delete -> TenantService.Deactivate)
   */
  deactivate: protectedProcedure
    .use(requirePermission(TENANTS_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        assertUserHasTenantAccess(ctx.user!.userTenants, input.id)

        // Verify tenant exists
        const existing = await ctx.prisma.tenant.findUnique({
          where: { id: input.id },
        })
        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Tenant not found",
          })
        }

        await ctx.prisma.tenant.update({
          where: { id: input.id },
          data: { isActive: false },
        })

        await auditLog.log(ctx.prisma, {
          tenantId: input.id,
          userId: ctx.user!.id,
          action: "update",
          entityType: "tenant",
          entityId: input.id,
          entityName: existing.name,
          changes: { isActive: { old: true, new: false } },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }).catch(err => console.error('[AuditLog] Failed:', err))

        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  // -------------------------------------------------------------------------
  // Support access (Phase 6 — platform-admin-system)
  //
  // Tenant admins grant time-boxed support sessions to platform operators.
  // Every state transition writes a double audit entry (tenant AuditLog +
  // platform PlatformAuditLog) so both domains can trace what happened.
  // -------------------------------------------------------------------------

  /**
   * tenants.requestSupportAccess -- Tenant admin grants a time-limited
   * support session to the platform operator pool. Creates a pending row
   * in support_sessions that any operator can claim via the Platform UI.
   */
  requestSupportAccess: tenantProcedure
    .use(requirePermission(SUPPORT_ACCESS_GRANT))
    .input(
      z.object({
        reason: z.string().min(10).max(1000),
        ttlMinutes: z.number().int().min(15).max(240),
        consentReference: z.string().max(255).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const userId = ctx.user!.id
        const expiresAt = new Date(Date.now() + input.ttlMinutes * 60 * 1000)

        const session = await ctx.prisma.supportSession.create({
          data: {
            tenantId,
            requestedByUserId: userId,
            reason: input.reason,
            consentReference: input.consentReference ?? null,
            status: "pending",
            expiresAt,
          },
        })

        await auditLog
          .log(ctx.prisma, {
            tenantId,
            userId,
            action: "create",
            entityType: "support_session",
            entityId: session.id,
            entityName: input.reason.slice(0, 80),
            metadata: {
              expiresAt: expiresAt.toISOString(),
              ttlMinutes: input.ttlMinutes,
              consentReference: input.consentReference ?? null,
            },
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          })
          .catch((err) =>
            console.error("[AuditLog] Failed:", err)
          )

        await platformAudit.log(ctx.prisma, {
          platformUserId: null,
          action: "support_session.requested",
          entityType: "support_session",
          entityId: session.id,
          targetTenantId: tenantId,
          supportSessionId: session.id,
          metadata: {
            requestedBy: userId,
            ttlMinutes: input.ttlMinutes,
          },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })

        return session
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * tenants.revokeSupportAccess -- Tenant admin revokes an existing pending
   * or active session. Writes a double audit entry.
   */
  revokeSupportAccess: tenantProcedure
    .use(requirePermission(SUPPORT_ACCESS_GRANT))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const userId = ctx.user!.id

        const session = await ctx.prisma.supportSession.findFirst({
          where: { id: input.id, tenantId },
        })
        if (!session) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Support session not found",
          })
        }
        if (session.status === "expired" || session.status === "revoked") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Session already closed",
          })
        }

        const updated = await ctx.prisma.supportSession.update({
          where: { id: session.id },
          data: { status: "revoked", revokedAt: new Date() },
        })

        await auditLog
          .log(ctx.prisma, {
            tenantId,
            userId,
            action: "update",
            entityType: "support_session",
            entityId: updated.id,
            entityName: session.reason.slice(0, 80),
            changes: {
              status: { old: session.status, new: "revoked" },
            },
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          })
          .catch((err) =>
            console.error("[AuditLog] Failed:", err)
          )

        await platformAudit.log(ctx.prisma, {
          platformUserId: updated.platformUserId ?? null,
          action: "support_session.revoked",
          entityType: "support_session",
          entityId: updated.id,
          targetTenantId: tenantId,
          supportSessionId: updated.id,
          metadata: {
            revokedByTenantUserId: userId,
            previousStatus: session.status,
          },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        })

        return updated
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * tenants.listSupportSessions -- Returns recent support sessions for the
   * current tenant (pending / active / expired / revoked). Limited to 50
   * newest rows — the table is tenant-facing history, not a full audit.
   */
  listSupportSessions: tenantProcedure
    .use(requirePermission(SUPPORT_ACCESS_GRANT))
    .query(async ({ ctx }) => {
      return ctx.prisma.supportSession.findMany({
        where: { tenantId: ctx.tenantId! },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          platformUser: {
            select: { displayName: true, email: true },
          },
        },
      })
    }),

  /**
   * tenants.activeSupportSession -- Returns the currently-active session (if
   * any) for the banner. Open to every tenant user since the banner is
   * shown tenant-wide; no permission check required.
   */
  activeSupportSession: tenantProcedure.query(async ({ ctx }) => {
    return ctx.prisma.supportSession.findFirst({
      where: {
        tenantId: ctx.tenantId!,
        status: "active",
        expiresAt: { gt: new Date() },
      },
      include: {
        platformUser: {
          select: { displayName: true, email: true },
        },
      },
    })
  }),
})
