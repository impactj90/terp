/**
 * Demo Tenant Service
 *
 * Orchestrates the demo-tenant lifecycle: create (with template apply),
 * list, extend, convert, expire-now, delete, and the self-service
 * "request convert from expired" flow.
 *
 * See thoughts/shared/plans/2026-04-09-demo-tenant-system.md (Phase 3).
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  DEFAULT_DEMO_TEMPLATE,
  getDemoTemplate,
} from "@/lib/demo/registry"
import * as repo from "./demo-tenant-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
import { create as createUser } from "./users-service"
import * as emailSendLogRepo from "./email-send-log-repository"

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

// --- Helpers ---------------------------------------------------------------

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
}

// --- createDemo ------------------------------------------------------------

/**
 * Orchestrates the full demo-tenant creation flow atomically.
 *
 * Steps inside one prisma.$transaction:
 *   1. Insert tenant row (`is_demo=true`, `demo_expires_at=now+14d`)
 *   2. Enable all demo modules (core/crm/billing/warehouse)
 *   3. Resolve the system-wide "Demo Admin" group
 *   4. Create the admin user via users-service.create (Phase 0 flow) —
 *      this triggers Supabase Auth user creation + welcome email
 *   5. Apply the selected demo template
 *
 * On any failure inside the transaction, the Prisma writes roll back and the
 * catch-block compensates the Supabase Auth user via `auth.admin.deleteUser`.
 */
export async function createDemo(
  prisma: PrismaClient,
  creatingUserId: string,
  input: CreateDemoInput,
  audit: AuditContext,
): Promise<CreateDemoResult> {
  const templateKey = input.demoTemplate ?? DEFAULT_DEMO_TEMPLATE
  const template = getDemoTemplate(templateKey) // throws if unknown

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
        // 1. Tenant row
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
          demoCreatedById: creatingUserId,
          demoNotes: input.notes?.trim() ?? null,
        })

        // 2. Enable demo modules
        for (const mod of DEMO_MODULES) {
          await tx.tenantModule.upsert({
            where: { tenantId_module: { tenantId: tenant.id, module: mod } },
            create: {
              tenantId: tenant.id,
              module: mod,
              enabledById: creatingUserId,
            },
            update: {},
          })
        }

        // 3. Ensure the system-wide "Demo Admin" group exists.
        const demoAdminGroup = await repo.findSystemDemoAdminGroup(tx)

        // 4. Create admin user via users-service (Phase 0 flow). Returns the
        //    created public.users row and the welcome-email delivery result.
        //    users-service has already created the auth.users row — we capture
        //    the id for the outer catch-block rollback.
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
          audit,
        )
        createdAuthUserId = adminUser.id

        // 5. Apply the demo template
        await template.apply({
          tx,
          tenantId: tenant.id,
          adminUserId: adminUser.id,
        })

        return { tenant, adminUser, welcomeEmail }
      },
      { timeout: 120_000 }, // 2min — template apply + supabase roundtrip
    )

    // 6. Audit after commit — matches the existing pattern in tenants.ts:344.
    await auditLog
      .log(prisma, {
        tenantId: result.tenant.id,
        userId: creatingUserId,
        action: "demo_create",
        entityType: "tenant",
        entityId: result.tenant.id,
        entityName: result.tenant.name,
        changes: null,
        metadata: {
          demoTemplate: templateKey,
          demoExpiresAt: demoExpiresAt.toISOString(),
          durationDays,
          adminUserId: result.adminUser.id,
          adminEmail: input.adminEmail,
          welcomeEmailSent: result.welcomeEmail.sent,
        },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] demo_create failed:", err))

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

// --- listActiveDemos -------------------------------------------------------

export async function listActiveDemos(prisma: PrismaClient) {
  const demos = await repo.findActiveDemos(prisma)
  const now = Date.now()
  return demos.map((d) => ({
    ...d,
    daysRemaining: d.demoExpiresAt
      ? Math.ceil((d.demoExpiresAt.getTime() - now) / (24 * 60 * 60 * 1000))
      : 0,
  }))
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
 *
 * The reactivation is logged as part of the `demo_extend` audit entry.
 */
export async function extendDemo(
  prisma: PrismaClient,
  tenantId: string,
  additionalDays: 7 | 14,
  audit: AuditContext,
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
    wasInactive, // reactivate if it was inactive
  )

  await auditLog
    .log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "demo_extend",
      entityType: "tenant",
      entityId: tenantId,
      entityName: existing.name,
      changes: {
        demoExpiresAt: {
          old: existing.demoExpiresAt,
          new: newExpiresAt,
        },
        ...(wasInactive
          ? { isActive: { old: existing.isActive, new: true } }
          : {}),
      },
      metadata: { additionalDays },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    })
    .catch((err) => console.error("[AuditLog] demo_extend failed:", err))

  return updated
}

// --- convertDemo -----------------------------------------------------------

export async function convertDemo(
  prisma: PrismaClient,
  tenantId: string,
  input: { discardData: boolean },
  audit: AuditContext,
) {
  const existing = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!existing || !existing.isDemo) throw new DemoTenantNotFoundError()

  await prisma.$transaction(
    async (tx) => {
      if (input.discardData) {
        // Wipe tenant content but preserve users/user_groups/user_tenants so
        // the prospect's admin account survives the conversion.
        await wipeTenantData(tx, tenantId, { keepAuth: true })
      }

      await repo.convertDemoKeepData(tx, tenantId)
    },
    { timeout: 120_000 },
  )

  await auditLog
    .log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "demo_convert",
      entityType: "tenant",
      entityId: tenantId,
      entityName: existing.name,
      changes: {
        isDemo: { old: true, new: false },
      },
      metadata: {
        discardData: input.discardData,
        originalTemplate: existing.demoTemplate,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    })
    .catch((err) => console.error("[AuditLog] demo_convert failed:", err))

  // Notify sales about the conversion — fire-and-forget via email_send_log.
  await notifyConvertRequest(prisma, existing, audit.userId).catch((err) =>
    console.error("[demo-tenant-service] convert notification failed:", err),
  )

  return { ok: true as const }
}

// --- expireDemoNow ---------------------------------------------------------

export async function expireDemoNow(
  prisma: PrismaClient,
  tenantId: string,
  audit: AuditContext,
) {
  const existing = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!existing || !existing.isDemo) throw new DemoTenantNotFoundError()

  await repo.markDemoExpired(prisma, tenantId, new Date())

  await auditLog
    .log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "demo_manual_expire",
      entityType: "tenant",
      entityId: tenantId,
      entityName: existing.name,
      changes: { isActive: { old: existing.isActive, new: false } },
      metadata: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    })
    .catch((err) =>
      console.error("[AuditLog] demo_manual_expire failed:", err),
    )

  return { ok: true as const }
}

// --- deleteDemo ------------------------------------------------------------

export async function deleteDemo(
  prisma: PrismaClient,
  tenantId: string,
  audit: AuditContext,
) {
  const existing = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!existing || !existing.isDemo) throw new DemoTenantNotFoundError()
  if (existing.isActive !== false) {
    throw new DemoTenantForbiddenError(
      "Cannot delete an active demo — expire first",
    )
  }

  // Audit BEFORE delete so the audit row's tenantId stays valid and we keep a
  // historical record. audit_logs has NO FK to tenants, so the entry survives.
  await auditLog
    .log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "demo_delete",
      entityType: "tenant",
      entityId: tenantId,
      entityName: existing.name,
      changes: null,
      metadata: {
        originalTemplate: existing.demoTemplate,
        createdAt: existing.createdAt,
        demoExpiredAt: existing.demoExpiresAt,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    })
    .catch((err) => console.error("[AuditLog] demo_delete failed:", err))

  // Hard delete: wipe tenant content + auth, then the tenant row itself.
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

  // 3. Fire-and-forget notification
  await notifyConvertRequest(prisma, tenant, requestingUserId).catch((err) =>
    console.error(
      "[demo-tenant-service] convert-request notification failed:",
      err,
    ),
  )

  // 4. Audit
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
