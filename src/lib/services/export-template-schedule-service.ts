/**
 * Export Template Schedule Service (Phase 4.4)
 *
 * Cron-driven automatic exports. A schedule declares:
 *   - which template to run
 *   - how often (daily/weekly/monthly)
 *   - at what hour (0-23, server-local/UTC)
 *   - which period to export (previous_month | current_month)
 *   - the list of email recipients
 *
 * The cron route /api/cron/export-template-schedules calls
 * `runDueSchedules` every 15 minutes. For each due schedule it
 * renders the template, emails the file, stores a status row, and
 * updates `next_run_at`.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./export-template-schedule-repository"
import * as templateRepo from "./export-template-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
import { generateExport } from "./export-engine-service"
import * as smtpConfigService from "./email-smtp-config-service"
import { SmtpNotConfiguredError } from "./email-smtp-config-service"

export class ScheduleNotFoundError extends Error {
  constructor() {
    super("Schedule not found")
    this.name = "ScheduleNotFoundError"
  }
}

export class ScheduleValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ScheduleValidationError"
  }
}

export class ScheduleConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ScheduleConflictError"
  }
}

/**
 * Sentinel user ID used for audit log entries written by the cron
 * route. The all-zero UUID is reserved and never assigned to a real
 * user — see other cron-driven services for the same pattern.
 */
const SYSTEM_CRON_USER_ID = "00000000-0000-0000-0000-000000000000"

export type Frequency = "daily" | "weekly" | "monthly"
export type DayPeriod = "previous_month" | "current_month"

export interface ScheduleInput {
  templateId: string
  name: string
  isActive?: boolean
  frequency: Frequency
  dayOfWeek?: number | null
  dayOfMonth?: number | null
  hourOfDay: number
  dayPeriod?: DayPeriod
  recipientEmails: string
  exportInterfaceId?: string | null
}

// ──────────────────────────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateRecipients(raw: string): string[] {
  const list = raw
    .split(/[;,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (list.length === 0) {
    throw new ScheduleValidationError("At least one recipient email is required")
  }
  for (const addr of list) {
    if (!EMAIL_REGEX.test(addr)) {
      throw new ScheduleValidationError(`Invalid email: ${addr}`)
    }
  }
  return list
}

function validateInput(input: ScheduleInput) {
  if (!input.name || input.name.trim().length === 0) {
    throw new ScheduleValidationError("Name is required")
  }
  if (!["daily", "weekly", "monthly"].includes(input.frequency)) {
    throw new ScheduleValidationError("Invalid frequency")
  }
  if (input.frequency === "weekly") {
    if (
      input.dayOfWeek === null ||
      input.dayOfWeek === undefined ||
      input.dayOfWeek < 0 ||
      input.dayOfWeek > 6
    ) {
      throw new ScheduleValidationError(
        "weekly schedules require dayOfWeek (0-6)",
      )
    }
  }
  if (input.frequency === "monthly") {
    if (
      input.dayOfMonth === null ||
      input.dayOfMonth === undefined ||
      input.dayOfMonth < 1 ||
      input.dayOfMonth > 28
    ) {
      throw new ScheduleValidationError(
        "monthly schedules require dayOfMonth (1-28)",
      )
    }
  }
  if (input.hourOfDay < 0 || input.hourOfDay > 23) {
    throw new ScheduleValidationError("hourOfDay must be 0-23")
  }
  if (input.dayPeriod && !["previous_month", "current_month"].includes(input.dayPeriod)) {
    throw new ScheduleValidationError("Invalid dayPeriod")
  }
  validateRecipients(input.recipientEmails)
}

// ──────────────────────────────────────────────────────────────────
// Next-run-at computation (pure — easy to unit test)
// ──────────────────────────────────────────────────────────────────

/**
 * Computes the next fire time for a schedule relative to `from`.
 * All math is performed in UTC — schedules do not attempt to honour a
 * specific timezone. This keeps the behaviour predictable and matches
 * the cron route which runs on UTC Vercel infrastructure.
 *
 * Rules:
 *   daily   — next occurrence of hourOfDay (tomorrow if hour already passed)
 *   weekly  — next occurrence of dayOfWeek + hourOfDay
 *   monthly — next occurrence of dayOfMonth + hourOfDay
 */
export function computeNextRunAt(
  schedule: {
    frequency: Frequency
    dayOfWeek: number | null
    dayOfMonth: number | null
    hourOfDay: number
  },
  from: Date,
): Date {
  const next = new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate(),
      schedule.hourOfDay,
      0,
      0,
      0,
    ),
  )

  if (schedule.frequency === "daily") {
    if (next.getTime() <= from.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1)
    }
    return next
  }

  if (schedule.frequency === "weekly") {
    const target = schedule.dayOfWeek ?? 0
    // Walk forward until we land on target day at the target hour.
    while (
      next.getUTCDay() !== target ||
      next.getTime() <= from.getTime()
    ) {
      next.setUTCDate(next.getUTCDate() + 1)
    }
    return next
  }

  // monthly
  const targetDay = schedule.dayOfMonth ?? 1
  next.setUTCDate(targetDay)
  if (next.getTime() <= from.getTime()) {
    next.setUTCMonth(next.getUTCMonth() + 1)
    next.setUTCDate(targetDay)
  }
  return next
}

/**
 * Determines the (year, month) tuple for which data should be exported
 * during a run that fires on `runAt`.
 */
export function computeExportPeriod(
  dayPeriod: DayPeriod,
  runAt: Date,
): { year: number; month: number } {
  const y = runAt.getUTCFullYear()
  const m = runAt.getUTCMonth() + 1
  if (dayPeriod === "current_month") {
    return { year: y, month: m }
  }
  // previous_month
  if (m === 1) return { year: y - 1, month: 12 }
  return { year: y, month: m - 1 }
}

// ──────────────────────────────────────────────────────────────────
// CRUD
// ──────────────────────────────────────────────────────────────────

export async function list(prisma: PrismaClient, tenantId: string) {
  return repo.listForTenant(prisma, tenantId)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
) {
  const row = await repo.findById(prisma, tenantId, id)
  if (!row) throw new ScheduleNotFoundError()
  return row
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: ScheduleInput,
  audit: AuditContext,
) {
  validateInput(input)

  // Verify template exists in this tenant.
  const tpl = await templateRepo.findById(prisma, tenantId, input.templateId)
  if (!tpl) throw new ScheduleValidationError("Template not found")

  const nextRunAt = computeNextRunAt(
    {
      frequency: input.frequency,
      dayOfWeek: input.dayOfWeek ?? null,
      dayOfMonth: input.dayOfMonth ?? null,
      hourOfDay: input.hourOfDay,
    },
    new Date(),
  )

  try {
    const created = await repo.create(prisma, {
      tenantId,
      templateId: input.templateId,
      exportInterfaceId: input.exportInterfaceId ?? null,
      name: input.name.trim(),
      // Default OFF — a new schedule must be explicitly activated so
      // nothing fires until the admin has reviewed recipients + cron
      // secret.
      isActive: input.isActive ?? false,
      frequency: input.frequency,
      dayOfWeek: input.dayOfWeek ?? null,
      dayOfMonth: input.dayOfMonth ?? null,
      hourOfDay: input.hourOfDay,
      dayPeriod: input.dayPeriod ?? "previous_month",
      recipientEmails: input.recipientEmails.trim(),
      nextRunAt,
      createdBy: audit.userId ?? null,
      updatedBy: audit.userId ?? null,
    })
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "create",
        entityType: "export_template_schedule",
        entityId: created.id,
        entityName: created.name,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
    return created
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      throw new ScheduleConflictError(
        `Schedule named "${input.name}" already exists`,
      )
    }
    throw err
  }
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: Partial<ScheduleInput>,
  audit: AuditContext,
) {
  const existing = await getById(prisma, tenantId, id)

  // Merge for validation of "effective state"
  const merged: ScheduleInput = {
    templateId: input.templateId ?? existing.templateId,
    name: input.name ?? existing.name,
    isActive: input.isActive ?? existing.isActive,
    frequency: (input.frequency ?? existing.frequency) as Frequency,
    dayOfWeek:
      input.dayOfWeek !== undefined ? input.dayOfWeek : existing.dayOfWeek,
    dayOfMonth:
      input.dayOfMonth !== undefined ? input.dayOfMonth : existing.dayOfMonth,
    hourOfDay: input.hourOfDay ?? existing.hourOfDay,
    dayPeriod: (input.dayPeriod ?? existing.dayPeriod) as DayPeriod,
    recipientEmails: input.recipientEmails ?? existing.recipientEmails,
    exportInterfaceId:
      input.exportInterfaceId !== undefined
        ? input.exportInterfaceId
        : existing.exportInterfaceId,
  }
  validateInput(merged)

  const triggersChanged =
    input.frequency !== undefined ||
    input.dayOfWeek !== undefined ||
    input.dayOfMonth !== undefined ||
    input.hourOfDay !== undefined ||
    input.isActive === true

  const nextRunAt = triggersChanged
    ? computeNextRunAt(
        {
          frequency: merged.frequency,
          dayOfWeek: merged.dayOfWeek ?? null,
          dayOfMonth: merged.dayOfMonth ?? null,
          hourOfDay: merged.hourOfDay,
        },
        new Date(),
      )
    : undefined

  const updated = await repo.update(prisma, tenantId, id, {
    name: merged.name.trim(),
    isActive: merged.isActive ?? false,
    templateId: merged.templateId,
    exportInterfaceId: merged.exportInterfaceId ?? null,
    frequency: merged.frequency,
    dayOfWeek: merged.dayOfWeek ?? null,
    dayOfMonth: merged.dayOfMonth ?? null,
    hourOfDay: merged.hourOfDay,
    dayPeriod: merged.dayPeriod ?? "previous_month",
    recipientEmails: merged.recipientEmails.trim(),
    updatedBy: audit.userId ?? null,
    ...(nextRunAt ? { nextRunAt } : {}),
  })
  if (!updated) throw new ScheduleNotFoundError()
  return updated
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit: AuditContext,
) {
  const existing = await getById(prisma, tenantId, id)
  await repo.remove(prisma, tenantId, id)
  await auditLog
    .log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "export_template_schedule",
      entityId: id,
      entityName: existing.name,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    })
    .catch((err) => console.error("[AuditLog] Failed:", err))
  return { success: true }
}

// ──────────────────────────────────────────────────────────────────
// Cron entry point
// ──────────────────────────────────────────────────────────────────

export interface RunDueResult {
  total: number
  succeeded: number
  failed: number
  results: Array<{
    scheduleId: string
    tenantId: string
    status: "success" | "error"
    message?: string
  }>
}

export interface SendMailFn {
  (opts: {
    tenantId: string
    recipients: string[]
    subject: string
    body: string
    attachment: { filename: string; content: Buffer; contentType: string }
  }): Promise<void>
}

/**
 * Default mailer implementation — looks up the tenant SMTP config and
 * sends the export file as a single attachment. The function is
 * injectable so unit tests can run `runDueSchedules` without touching
 * nodemailer.
 */
export async function defaultSendMail(
  prisma: PrismaClient,
): Promise<SendMailFn> {
  return async ({ tenantId, recipients, subject, body, attachment }) => {
    const smtpConfig = await smtpConfigService.get(prisma, tenantId)
    if (!smtpConfig) throw new SmtpNotConfiguredError()
    const transporter = smtpConfigService.createTransporter(smtpConfig)
    const from = smtpConfig.fromName
      ? `"${smtpConfig.fromName}" <${smtpConfig.fromEmail}>`
      : smtpConfig.fromEmail
    await transporter.sendMail({
      from,
      to: recipients.join(", "),
      subject,
      text: body,
      attachments: [attachment],
    })
  }
}

/**
 * Picks all due schedules and runs them sequentially. Intentionally
 * serialised: exports can be expensive and the monthly batch is
 * typically small (one schedule per tenant per month).
 */
export async function runDueSchedules(
  prisma: PrismaClient,
  now: Date,
  sendMail: SendMailFn,
): Promise<RunDueResult> {
  const due = await repo.findDue(prisma, now)
  const result: RunDueResult = {
    total: due.length,
    succeeded: 0,
    failed: 0,
    results: [],
  }

  for (const sched of due) {
    try {
      const { year, month } = computeExportPeriod(
        sched.dayPeriod as DayPeriod,
        now,
      )
      const exportResult = await generateExport(
        prisma,
        sched.tenantId,
        {
          templateId: sched.templateId,
          exportInterfaceId: sched.exportInterfaceId ?? undefined,
          year,
          month,
        },
        { userId: SYSTEM_CRON_USER_ID, ipAddress: null, userAgent: "cron:schedule" },
        { isTest: false },
      )

      const recipients = sched.recipientEmails
        .split(/[;,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)

      await sendMail({
        tenantId: sched.tenantId,
        recipients,
        subject: `[Terp] Export: ${sched.template.name} ${year}-${String(month).padStart(2, "0")}`,
        body: `Automatischer Export des Templates "${sched.template.name}" für den Zeitraum ${String(month).padStart(2, "0")}/${year}.\nDateiname: ${exportResult.filename}\nHash: ${exportResult.fileHash}\n`,
        attachment: {
          filename: exportResult.filename,
          content: exportResult.file,
          contentType: "application/octet-stream",
        },
      })

      const nextRunAt = computeNextRunAt(
        {
          frequency: sched.frequency as Frequency,
          dayOfWeek: sched.dayOfWeek,
          dayOfMonth: sched.dayOfMonth,
          hourOfDay: sched.hourOfDay,
        },
        now,
      )
      await prisma.exportTemplateSchedule.update({
        where: { id: sched.id },
        data: {
          lastRunAt: now,
          lastRunStatus: "success",
          lastRunMessage: `Exported ${exportResult.employeeCount} employees (${exportResult.byteSize} bytes)`,
          nextRunAt,
        },
      })

      result.succeeded++
      result.results.push({
        scheduleId: sched.id,
        tenantId: sched.tenantId,
        status: "success",
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const nextRunAt = computeNextRunAt(
        {
          frequency: sched.frequency as Frequency,
          dayOfWeek: sched.dayOfWeek,
          dayOfMonth: sched.dayOfMonth,
          hourOfDay: sched.hourOfDay,
        },
        now,
      )
      await prisma.exportTemplateSchedule
        .update({
          where: { id: sched.id },
          data: {
            lastRunAt: now,
            lastRunStatus: "error",
            lastRunMessage: message.slice(0, 1000),
            nextRunAt,
          },
        })
        .catch(() => {})
      result.failed++
      result.results.push({
        scheduleId: sched.id,
        tenantId: sched.tenantId,
        status: "error",
        message,
      })
    }
  }
  return result
}
