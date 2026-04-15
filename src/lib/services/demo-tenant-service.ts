/**
 * Demo Tenant Service
 *
 * Orchestrates the demo-tenant lifecycle: create (with template apply),
 * list, extend, convert, expire-now, delete, and the self-service
 * "request convert from expired" flow.
 *
 * Platform-side migration (Phase 2): createDemo/extendDemo/convertDemo/
 * expireDemoNow/deleteDemo no longer write tenant-side `audit_logs` rows —
 * the platform router writes one `platform_audit_logs` row per action
 * instead. `requestConvertFromExpired` is unchanged — it still writes
 * tenant-side audit + email_send_log because it is a self-service action
 * from a tenant user.
 *
 * See thoughts/shared/plans/2026-04-11-demo-tenant-platform-migration.md.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  DEFAULT_TENANT_TEMPLATE,
  getTenantTemplate,
} from "@/lib/tenant-templates/registry"
import { PLATFORM_SYSTEM_USER_ID } from "@/trpc/init"
import * as repo from "./demo-tenant-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
import { create as createUser } from "./users-service"
import * as emailSendLogRepo from "./email-send-log-repository"
import * as demoConvertRequestService from "./demo-convert-request-service"

const DEMO_DEFAULT_DURATION_DAYS = 14
const DEMO_MODULES = ["core", "crm", "billing", "warehouse"] as const

// --- Error classes ---------------------------------------------------------

export class DemoTenantValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DemoTenantValidationError"
  }
}

export class DemoTenantNotFoundError extends Error {
  constructor(message = "Demo tenant not found") {
    super(message)
    this.name = "DemoTenantNotFoundError"
  }
}

export class DemoTenantForbiddenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DemoTenantForbiddenError"
  }
}

// --- Input / output types --------------------------------------------------

export interface CreateDemoInput {
  tenantName: string
  tenantSlug: string
  addressStreet: string
  addressZip: string
  addressCity: string
  addressCountry: string
  adminEmail: string
  adminDisplayName: string
  demoTemplate?: string
  demoDurationDays?: number
  notes?: string | null
}

export interface CreateDemoResult {
  tenantId: string
  adminUserId: string
  /**
   * Recovery link the admin must click to set their password. Same semantics
   * as `users-service.create` returns via `welcomeEmail.fallbackLink`.
   *
   * `null` means the welcome email was sent successfully (admin does not need
   * the link as a fallback). `string` means SMTP was missing/failed and the
   * admin UI must present the link for manual sharing.
   */
  inviteLink: string | null
  /** Whether the welcome email was delivered automatically via tenant SMTP. */
  welcomeEmailSent: boolean
  demoExpiresAt: Date
  demoTemplate: string
}

/**
 * Discriminated creator DTO exposed by `listDemos()` so UI can render the
 * creator with the correct badge regardless of whether the demo was created
 * by a platform operator (new path) or by a tenant-side user (legacy path).
 */
export type DemoCreatorDTO = {
  source: "platform" | "tenant" | "unknown"
  id: string | null
  displayName: string | null
  email: string | null
}

export interface ConvertDemoResult {
  /** Module keys enabled on the demo at the time of convert, in any order. */
  snapshottedModules: string[]
  /** Template key the demo was created from (may be null on legacy rows). */
  originalTemplate: string | null
  /** Tenant name at time of convert — used for the audit metadata. */
  tenantName: string
}

// --- Helpers ---------------------------------------------------------------

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
}

// --- createDemo ------------------------------------------------------------

/**
 * Orchestrates the full demo-tenant creation flow atomically.
 *
 * Steps inside one prisma.$transaction:
 *   1. Insert tenant row (`is_demo=true`, `demo_expires_at=now+14d`,
 *      `demo_created_by_platform_user_id=<operator>`, `demo_created_by=null`)
 *   2. Enable all demo modules (core/crm/billing/warehouse),
 *      attributed to the platform operator via `enabledByPlatformUserId`
 *   3. Resolve the system-wide "Demo Admin" group
 *   4. Create the admin user via users-service.create — the users-service
 *      writes its internal `audit_logs.create` row attributed to the
 *      `PLATFORM_SYSTEM_USER_ID` sentinel (not to `platformUserId`, which
 *      is not a valid tenant-side `users.id`)
 *   5. Apply the selected demo template
 *
 * NO tenant-side audit_logs write for the demo_create action itself — the
 * platform router writes one `platform_audit_logs` row with the operator
 * as the acting party.
 *
 * On any failure inside the transaction, Prisma writes roll back and the
 * catch-block compensates the Supabase Auth user via `auth.admin.deleteUser`.
 */
export async function createDemo(
  prisma: PrismaClient,
  input: CreateDemoInput,
  platformUserId: string,
  audit: { ipAddress?: string | null; userAgent?: string | null },
): Promise<CreateDemoResult> {
  const templateKey = input.demoTemplate ?? DEFAULT_TENANT_TEMPLATE
  const template = getTenantTemplate(templateKey) // throws if unknown

  const durationDays = input.demoDurationDays ?? DEMO_DEFAULT_DURATION_DAYS
  if (durationDays < 1 || durationDays > 90) {
    throw new DemoTenantValidationError("demoDurationDays must be between 1 and 90")
  }

  const demoExpiresAt = addDays(new Date(), durationDays)

  // Tracked so the outer catch can compensate the Supabase Auth side effect.
  let createdAuthUserId: string | null = null

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // 1. Tenant row — real operator attribution via the new column.
        //    Legacy `demo_created_by` column is left at its default NULL
        //    (the repo omits the field because Prisma's relation-aware
        //    input rejects the scalar directly).
        const tenant = await repo.createDemoTenant(tx, {
          name: input.tenantName.trim(),
          slug: input.tenantSlug.trim().toLowerCase(),
          addressStreet: input.addressStreet.trim(),
          addressZip: input.addressZip.trim(),
          addressCity: input.addressCity.trim(),
          addressCountry: input.addressCountry.trim(),
          notes: null,
          demoExpiresAt,
          demoTemplate: templateKey,
          demoCreatedByPlatformUserId: platformUserId,
          demoNotes: input.notes?.trim() ?? null,
        })

        // 2. Enable demo modules — also attribute to the platform operator
        //    via the parallel enabled_by_platform_user_id column.
        for (const mod of DEMO_MODULES) {
          await tx.tenantModule.upsert({
            where: { tenantId_module: { tenantId: tenant.id, module: mod } },
            create: {
              tenantId: tenant.id,
              module: mod,
              enabledById: null,
              enabledByPlatformUserId: platformUserId,
            },
            update: {},
          })
        }

        // 3. Ensure the system-wide "Demo Admin" group exists.
        const demoAdminGroup = await repo.findSystemDemoAdminGroup(tx)

        // 4. Create admin user via users-service (Phase 0 flow). The audit
        //    userId for the users-service internal audit row is the platform
        //    sentinel — platformUserId is a platform_users.id and would fail
        //    a tenant-side users.id FK lookup.
        const { user: adminUser, welcomeEmail } = await createUser(
          tx,
          tenant.id,
          {
            email: input.adminEmail.trim().toLowerCase(),
            displayName: input.adminDisplayName.trim(),
            userGroupId: demoAdminGroup.id,
            isActive: true,
            isLocked: false,
          },
          {
            userId: PLATFORM_SYSTEM_USER_ID,
            ipAddress: audit.ipAddress,
            userAgent: audit.userAgent,
          },
        )
        createdAuthUserId = adminUser.id

        // 5. Apply the demo template
        const templateCtx = {
          tx,
          tenantId: tenant.id,
          adminUserId: adminUser.id,
        }
        const templateConfig = await template.applyConfig(templateCtx)
        if (template.kind === "showcase" && template.applySeedData) {
          await template.applySeedData(templateCtx, templateConfig)
        }

        return { tenant, adminUser, welcomeEmail }
      },
      { timeout: 120_000 }, // 2min — template apply + supabase roundtrip
    )

    // NO tenant-side audit log — the platform router writes platform_audit_logs.

    return {
      tenantId: result.tenant.id,
      adminUserId: result.adminUser.id,
      inviteLink: result.welcomeEmail.fallbackLink,
      welcomeEmailSent: result.welcomeEmail.sent,
      demoExpiresAt,
      demoTemplate: templateKey,
    }
  } catch (err) {
    // Compensation: the prisma tx rolled back all DB writes, but the Supabase
    // Auth user created by users-service.create is still there. Remove it so
    // auth.users doesn't accumulate orphans.
    if (createdAuthUserId) {
      try {
        const admin = createAdminClient()
        await admin.auth.admin.deleteUser(createdAuthUserId)
      } catch (rollbackErr) {
        console.error(
          "[demo-tenant-service] Failed to rollback Supabase Auth user:",
          rollbackErr,
        )
      }
    }
    throw err
  }
}

// --- listDemos -------------------------------------------------------------

/**
 * Lists ALL demo tenants (active + expired), returning a shape suitable for
 * the platform-admin demo-tenants page. Computes `daysRemaining`, a `status`
 * label, and a `DemoCreatorDTO` per row.
 */
export async function listDemos(prisma: PrismaClient) {
  const demos = await repo.findDemos(prisma)
  const now = Date.now()
  return demos.map((d) => {
    const daysRemaining = d.demoExpiresAt
      ? Math.ceil((d.demoExpiresAt.getTime() - now) / (24 * 60 * 60 * 1000))
      : 0
    const status: "active" | "expired" = d.isActive ? "active" : "expired"
    const creator: DemoCreatorDTO = d.demoCreatedByPlatformUser
      ? {
          source: "platform",
          id: d.demoCreatedByPlatformUser.id,
          displayName: d.demoCreatedByPlatformUser.displayName,
          email: d.demoCreatedByPlatformUser.email,
        }
      : d.demoCreatedBy
        ? {
            source: "tenant",
            id: d.demoCreatedBy.id,
            displayName: d.demoCreatedBy.displayName,
            email: d.demoCreatedBy.email,
          }
        : { source: "unknown", id: null, displayName: null, email: null }
    return {
      id: d.id,
      name: d.name,
      slug: d.slug,
      isActive: d.isActive,
      isDemo: d.isDemo,
      demoExpiresAt: d.demoExpiresAt,
      demoTemplate: d.demoTemplate,
      demoNotes: d.demoNotes,
      createdAt: d.createdAt,
      daysRemaining,
      status,
      creator,
    }
  })
}

// --- extendDemo ------------------------------------------------------------

/**
 * Extend a demo's expiration window.
 *
 * Intentional behavior — reactivation of already-expired demos: if the demo
 * has already been expired by the cron (`isActive=false`, user hit the
 * /demo-expired gate), calling extend reactivates it. Rationale: sales wants
 * to "rescue" a demo after a last-minute deal conversation without having to
 * flip isActive in the DB manually.
 */
export async function extendDemo(
  prisma: PrismaClient,
  tenantId: string,
  additionalDays: 7 | 14,
) {
  const existing = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!existing || !existing.isDemo) throw new DemoTenantNotFoundError()

  // Extension base: if still valid, extend from the current expiry; if already
  // past, extend from "now" so the caller always gets at least `additionalDays`
  // of fresh runway.
  const now = new Date()
  const base =
    existing.demoExpiresAt && existing.demoExpiresAt > now
      ? existing.demoExpiresAt
      : now
  const newExpiresAt = addDays(base, additionalDays)

  const wasInactive = existing.isActive !== true
  const updated = await repo.extendDemoExpiration(
    prisma,
    tenantId,
    newExpiresAt,
    wasInactive,
  )

  // NO tenant-side audit log — platform router does platform_audit_logs.
  return updated
}

// --- convertDemo -----------------------------------------------------------

/**
 * Converts a demo tenant to a real tenant.
 *
 * Atomic steps inside a $transaction:
 *   1. Snapshot the module keys enabled on the demo (must happen BEFORE the
 *      optional wipe, because wipeTenantData L3 deletes `tenant_modules` and
 *      would otherwise lose the list).
 *   2. Optionally wipe tenant content (keepAuth=true so the admin user
 *      survives).
 *   3. Strip demo flags via `convertDemoKeepData`.
 *
 * Re-insertion of the modules (after a discardData wipe) and the subscription
 * bridge both live in the PLATFORM ROUTER — not in this service — because
 * `subscriptionService.createSubscription` opens its own `$transaction` and
 * cannot be nested inside an outer tx.
 */
export async function convertDemo(
  prisma: PrismaClient,
  tenantId: string,
  input: { discardData: boolean },
): Promise<ConvertDemoResult> {
  const existing = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!existing || !existing.isDemo) throw new DemoTenantNotFoundError()

  const snapshottedModules = await prisma.$transaction(
    async (tx) => {
      // Snapshot modules INSIDE the tx, BEFORE the wipe (wipeTenantData L3
      // would nuke tenant_modules otherwise).
      const existingModules = await tx.tenantModule.findMany({
        where: { tenantId },
        select: { module: true },
      })
      const moduleKeys = existingModules.map((m) => m.module)

      if (input.discardData) {
        // Wipe tenant content but preserve users/user_groups/user_tenants so
        // the prospect's admin account survives the conversion.
        await wipeTenantData(tx, tenantId, { keepAuth: true })
      }

      await repo.convertDemoKeepData(tx, tenantId)

      return moduleKeys
    },
    { timeout: 120_000 },
  )

  // NO notifyConvertRequest — platform router orchestrates the post-convert
  // flow (re-insert modules, subscription bridge, audit).
  // NO tenant-side audit log — platform router does platform_audit_logs.

  return {
    snapshottedModules,
    originalTemplate: existing.demoTemplate,
    tenantName: existing.name,
  }
}

// --- expireDemoNow ---------------------------------------------------------

export async function expireDemoNow(
  prisma: PrismaClient,
  tenantId: string,
) {
  const existing = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!existing || !existing.isDemo) throw new DemoTenantNotFoundError()

  await repo.markDemoExpired(prisma, tenantId, new Date())

  // NO tenant-side audit log — platform router does platform_audit_logs.
  return { ok: true as const }
}

// --- deleteDemo ------------------------------------------------------------

export async function deleteDemo(
  prisma: PrismaClient,
  tenantId: string,
) {
  const existing = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!existing || !existing.isDemo) throw new DemoTenantNotFoundError()
  if (existing.isActive !== false) {
    throw new DemoTenantForbiddenError(
      "Cannot delete an active demo — expire first",
    )
  }

  // Platform router writes audit BEFORE calling this — `target_tenant_id`
  // is still a valid row at that point. Once the delete commits, the
  // `platform_audit_logs.target_tenant_id` FK cascades to NULL (SET NULL)
  // but the row's metadata survives for post-mortem lookup.
  await prisma.$transaction(
    async (tx) => {
      await wipeTenantData(tx, tenantId, { keepAuth: false })
      await tx.tenant.delete({ where: { id: tenantId } })
    },
    { timeout: 180_000 },
  )

  return { ok: true as const }
}

// --- requestConvertFromExpired ---------------------------------------------

/**
 * Self-service endpoint called by the /demo-expired page CTA.
 *
 * Authorization: caller must be a member of the target demo tenant (via
 * user_tenants) AND the demo must be expired. Does NOT require the
 * `tenants.manage` permission — the demo admin user only has access to
 * their own demo.
 *
 * Side effects (all fire-and-forget, ordered):
 *   1. Insert a `demo_convert_requests` row for the platform inbox
 *      (Phase 6 — wired once the table exists).
 *   2. Insert a pending `email_send_log` row so the retry cron delivers
 *      the sales notification.
 *   3. Write a `demo_convert_req` row to tenant-side `audit_logs`.
 */
export async function requestConvertFromExpired(
  prisma: PrismaClient,
  requestingUserId: string,
  tenantId: string,
  audit: AuditContext,
): Promise<{ ok: true }> {
  // 1. Membership check — via the join table
  const membership = await prisma.userTenant.findUnique({
    where: {
      userId_tenantId: { userId: requestingUserId, tenantId },
    },
  })
  if (!membership) {
    throw new DemoTenantForbiddenError("No access to this tenant")
  }

  // 2. Must be an expired demo
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant || !tenant.isDemo) {
    throw new DemoTenantNotFoundError()
  }
  if (!tenant.demoExpiresAt || tenant.demoExpiresAt > new Date()) {
    throw new DemoTenantForbiddenError("Demo is not expired")
  }

  // 3. Inbox row for platform admin — fire-and-forget. If this fails, the
  //    email still goes out and the operator can re-request manually.
  await demoConvertRequestService
    .create(prisma, {
      tenantId,
      requestedByUserId: requestingUserId,
    })
    .catch((err) =>
      console.error(
        "[demo-tenant-service] convert-request inbox write failed:",
        err,
      ),
    )

  // 4. Fire-and-forget email notification
  await notifyConvertRequest(prisma, tenant, requestingUserId).catch((err) =>
    console.error(
      "[demo-tenant-service] convert-request notification failed:",
      err,
    ),
  )

  // 5. Tenant-side audit log (unchanged — this is a self-service tenant action)
  await auditLog
    .log(prisma, {
      tenantId,
      userId: requestingUserId,
      action: "demo_convert_req",
      entityType: "tenant",
      entityId: tenantId,
      entityName: tenant.name,
      changes: null,
      metadata: {
        requestedBy: requestingUserId,
        expiredAt: tenant.demoExpiresAt?.toISOString() ?? null,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    })
    .catch((err) =>
      console.error("[AuditLog] demo_convert_req failed:", err),
    )

  return { ok: true }
}

// --- Internal helpers ------------------------------------------------------

/**
 * Writes a pending row into email_send_log so the existing email-retry cron
 * picks it up and delivers the convert-request notification to sales.
 *
 * The row is scoped to the demo tenant's own tenantId because email_send_log
 * requires a tenantId FK. Recipient is controlled by env
 * `DEMO_CONVERT_NOTIFICATION_EMAIL` (fallback `sales@terp.dev`).
 */
async function notifyConvertRequest(
  prisma: PrismaClient,
  tenant: { id: string; name: string; demoTemplate: string | null },
  triggeringUserId: string,
): Promise<void> {
  const recipient =
    process.env.DEMO_CONVERT_NOTIFICATION_EMAIL ?? "sales@terp.dev"

  const subject = `[Terp] Demo-Konvertierung angefragt: ${tenant.name}`
  const bodyHtml = `
    <p>Es liegt eine Demo-Konvertierungsanfrage vor.</p>
    <ul>
      <li><strong>Tenant:</strong> ${escapeHtml(tenant.name)} (${tenant.id})</li>
      <li><strong>Template:</strong> ${escapeHtml(tenant.demoTemplate ?? "-")}</li>
      <li><strong>Ausgelöst von User:</strong> ${triggeringUserId}</li>
      <li><strong>Zeitpunkt:</strong> ${new Date().toISOString()}</li>
    </ul>
    <p>Bitte im Admin-Panel bearbeiten.</p>
  `

  await emailSendLogRepo.create(prisma, tenant.id, {
    toEmail: recipient,
    subject,
    bodyHtml,
    status: "pending",
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * Deletes all tenant-scoped content in FK-safe order.
 *
 * Modes:
 * - `keepAuth: true`   (convert flow) — preserves users, user_groups,
 *                       user_tenants and audit_logs so the prospect's admin
 *                       account and history survive the conversion.
 * - `keepAuth: false`  (delete flow)  — wipes everything including auth;
 *                       caller is responsible for the final tenant.delete().
 *
 * The order is grouped into layers L1 → L5. Within a layer, rows do not
 * reference each other, so intra-layer order is irrelevant.
 */
async function wipeTenantData(
  tx: Prisma.TransactionClient,
  tenantId: string,
  opts: { keepAuth: boolean },
): Promise<void> {
  const where = { tenantId }

  // ------------------------------------------------------------------------
  // L1 — Leaves: transient runtime, bookings, time-tracking, messages,
  //              runs, attachments. These tables are referenced by nothing
  //              within the tenant scope, so they go first.
  // ------------------------------------------------------------------------
  await tx.booking.deleteMany({ where })
  await tx.rawTerminalBooking.deleteMany({ where })
  await tx.dailyValue.deleteMany({ where })
  await tx.dailyAccountValue.deleteMany({ where })
  await tx.absenceDay.deleteMany({ where })
  await tx.orderBooking.deleteMany({ where })
  await tx.employeeDayPlan.deleteMany({ where })
  await tx.shiftAssignment.deleteMany({ where })
  await tx.employeeCappingException.deleteMany({ where })
  await tx.employeeAccessAssignment.deleteMany({ where })
  await tx.vacationBalance.deleteMany({ where })
  await tx.employeeTariffAssignment.deleteMany({ where })
  await tx.employeeCard.deleteMany({ where })
  await tx.employeeMessage.deleteMany({ where })
  await tx.macroAssignment.deleteMany({ where })
  await tx.macroExecution.deleteMany({ where })
  await tx.orderAssignment.deleteMany({ where })
  await tx.correctionMessage.deleteMany({ where })
  await tx.correction.deleteMany({ where })
  await tx.scheduleExecution.deleteMany({ where })
  await tx.notification.deleteMany({ where })
  await tx.notificationPreference.deleteMany({ where })
  await tx.importBatch.deleteMany({ where })
  await tx.tripRecord.deleteMany({ where })
  await tx.vehicleRoute.deleteMany({ where })
  await tx.payrollExport.deleteMany({ where })
  await tx.report.deleteMany({ where })
  await tx.monthlyValue.deleteMany({ where })
  await tx.cronCheckpoint.deleteMany({ where })
  await tx.numberSequence.deleteMany({ where })

  // Employee payroll extension tables (L1 — they reference only employees,
  // but we delete them before employees to keep dependency graph clean).
  await tx.employeeChild.deleteMany({ where })
  await tx.employeeCompanyCar.deleteMany({ where })
  await tx.employeeForeignAssignment.deleteMany({ where })
  await tx.employeeGarnishment.deleteMany({ where })
  await tx.employeeJobBike.deleteMany({ where })
  await tx.employeeJobTicket.deleteMany({ where })
  await tx.employeeMaternityLeave.deleteMany({ where })
  await tx.employeeMealAllowance.deleteMany({ where })
  await tx.employeeOtherEmployment.deleteMany({ where })
  await tx.employeeParentalLeave.deleteMany({ where })
  await tx.employeePension.deleteMany({ where })
  await tx.employeeSavings.deleteMany({ where })
  await tx.employeeVoucher.deleteMany({ where })
  await tx.employeeSalaryHistory.deleteMany({ where })

  // HR personnel file
  await tx.hrPersonnelFileAttachment.deleteMany({ where })
  await tx.hrPersonnelFileEntry.deleteMany({ where })
  await tx.hrPersonnelFileCategory.deleteMany({ where })

  // DSGVO
  await tx.dsgvoDeleteLog.deleteMany({ where })
  await tx.dsgvoRetentionRule.deleteMany({ where })

  // Email infrastructure (log rows first, then templates)
  await tx.emailSendLog.deleteMany({ where })
  await tx.emailDefaultAttachment.deleteMany({ where })

  // Warehouse leaves
  await tx.whStockReservation.deleteMany({ where })
  await tx.whStockMovement.deleteMany({ where })
  await tx.whSupplierPayment.deleteMany({ where })
  await tx.whSupplierInvoice.deleteMany({ where })
  await tx.whPurchaseOrder.deleteMany({ where })
  await tx.whStocktake.deleteMany({ where })
  await tx.whCorrectionMessage.deleteMany({ where })
  await tx.whCorrectionRun.deleteMany({ where })
  await tx.whArticleImage.deleteMany({ where })

  // Inbound invoice leaves (approvals → invoices → policies)
  await tx.inboundInvoiceApproval.deleteMany({ where })
  await tx.inboundInvoiceApprovalPolicy.deleteMany({ where })
  await tx.inboundInvoice.deleteMany({ where })
  await tx.inboundEmailLog.deleteMany({ where })

  // Billing leaves (payments → service cases → documents)
  await tx.billingPayment.deleteMany({ where })
  await tx.billingServiceCase.deleteMany({ where })
  await tx.billingRecurringInvoice.deleteMany({ where })
  await tx.billingDocument.deleteMany({ where })
  await tx.billingDocumentTemplate.deleteMany({ where })
  await tx.billingTenantConfig.deleteMany({ where })
  await tx.billingPriceList.deleteMany({ where })

  // CRM leaves
  await tx.crmCorrespondenceAttachment.deleteMany({ where })
  await tx.crmCorrespondence.deleteMany({ where })
  await tx.crmTask.deleteMany({ where })
  await tx.crmInquiry.deleteMany({ where })
  await tx.crmContact.deleteMany({ where })
  await tx.crmBankAccount.deleteMany({ where })

  // Export templates (snapshots/schedules → templates)
  await tx.exportTemplateSnapshot.deleteMany({ where })
  await tx.exportTemplateSchedule.deleteMany({ where })
  await tx.exportTemplate.deleteMany({ where })
  await tx.tenantPayrollWage.deleteMany({ where })

  // ------------------------------------------------------------------------
  // L2 — Mid-tier entities (employees, orders, shifts, plans, macros, ...)
  //      These are referenced by the L1 leaves we just deleted.
  // ------------------------------------------------------------------------
  await tx.whArticle.deleteMany({ where })
  await tx.whArticleGroup.deleteMany({ where })
  await tx.crmAddress.deleteMany({ where })
  await tx.employee.deleteMany({ where })
  await tx.order.deleteMany({ where })
  await tx.shift.deleteMany({ where })
  await tx.macro.deleteMany({ where })
  await tx.vehicle.deleteMany({ where })
  await tx.schedule.deleteMany({ where })
  await tx.bookingReason.deleteMany({ where })
  await tx.bookingType.deleteMany({ where })
  await tx.absenceType.deleteMany({ where })

  // ------------------------------------------------------------------------
  // L3 — Master data and configuration
  // ------------------------------------------------------------------------
  await tx.tariff.deleteMany({ where })
  await tx.weekPlan.deleteMany({ where })
  await tx.dayPlan.deleteMany({ where })
  await tx.department.deleteMany({ where })
  await tx.team.deleteMany({ where })
  await tx.employmentType.deleteMany({ where })
  await tx.activity.deleteMany({ where })
  await tx.activityGroup.deleteMany({ where })
  await tx.calculationRule.deleteMany({ where })
  await tx.account.deleteMany({ where })
  await tx.accountGroup.deleteMany({ where })
  await tx.costCenter.deleteMany({ where })
  await tx.location.deleteMany({ where })
  await tx.holiday.deleteMany({ where })
  await tx.workflowGroup.deleteMany({ where })
  await tx.employeeGroup.deleteMany({ where })
  await tx.contactKind.deleteMany({ where })
  await tx.contactType.deleteMany({ where })
  await tx.vacationSpecialCalculation.deleteMany({ where })
  await tx.vacationCalculationGroup.deleteMany({ where })
  await tx.vacationCappingRule.deleteMany({ where })
  await tx.vacationCappingRuleGroup.deleteMany({ where })
  await tx.bookingTypeGroup.deleteMany({ where })
  await tx.absenceTypeGroup.deleteMany({ where })
  await tx.accessProfile.deleteMany({ where })
  await tx.accessZone.deleteMany({ where })
  await tx.exportInterface.deleteMany({ where })
  await tx.monthlyEvaluationTemplate.deleteMany({ where })
  await tx.localTravelRule.deleteMany({ where })
  await tx.extendedTravelRule.deleteMany({ where })
  await tx.travelAllowanceRuleSet.deleteMany({ where })
  await tx.tenantModule.deleteMany({ where })
  await tx.systemSetting.deleteMany({ where })
  await tx.emailTemplate.deleteMany({ where })
  await tx.tenantImapConfig.deleteMany({ where })
  await tx.tenantSmtpConfig.deleteMany({ where })

  // ------------------------------------------------------------------------
  // L4 — Auth (only when keepAuth=false)
  // ------------------------------------------------------------------------
  if (!opts.keepAuth) {
    // user_tenants → users → user_groups
    await tx.userTenant.deleteMany({ where: { tenantId } })
    // Delete users that have this tenant as their primary tenantId AND no
    // other tenant memberships. Demo admins are created exclusively for their
    // demo tenant so this will match them.
    await tx.user.deleteMany({
      where: {
        tenantId,
        userTenants: { none: {} },
      },
    })
    await tx.userGroup.deleteMany({ where: { tenantId } })
  }
}
