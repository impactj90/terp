/**
 * Employee Salary History Service (Phase 3.5)
 *
 * Timeline of salary changes per employee. The newest entry (the one
 * with `validTo = NULL`) is considered "current"; creating a new entry
 * automatically closes the previous one by setting its `validTo` to
 * `new.validFrom - 1 day`. The Employee.grossSalary / hourlyRate fields
 * are kept in sync with the current open entry so other parts of the
 * system keep working unchanged.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./employee-salary-history-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

export class SalaryHistoryNotFoundError extends Error {
  constructor() {
    super("Salary history entry not found")
    this.name = "SalaryHistoryNotFoundError"
  }
}

export class SalaryHistoryValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SalaryHistoryValidationError"
  }
}

const VALID_PAYMENT_TYPES = new Set(["monthly", "hourly"])
const VALID_CHANGE_REASONS = new Set([
  "initial",
  "raise",
  "tariff_change",
  "promotion",
  "other",
])

export interface CreateInput {
  employeeId: string
  validFrom: Date
  grossSalary?: number | null
  hourlyRate?: number | null
  paymentType: string
  changeReason: string
  notes?: string | null
}

export interface UpdateInput {
  validFrom?: Date
  validTo?: Date | null
  grossSalary?: number | null
  hourlyRate?: number | null
  paymentType?: string
  changeReason?: string
  notes?: string | null
}

function validateInput(paymentType?: string, changeReason?: string): void {
  if (paymentType !== undefined && !VALID_PAYMENT_TYPES.has(paymentType)) {
    throw new SalaryHistoryValidationError(
      `Ungültiger Zahlungstyp: ${paymentType}`,
    )
  }
  if (changeReason !== undefined && !VALID_CHANGE_REASONS.has(changeReason)) {
    throw new SalaryHistoryValidationError(
      `Ungültiger Änderungsgrund: ${changeReason}`,
    )
  }
}

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
) {
  return repo.listForEmployee(prisma, tenantId, employeeId)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
) {
  const entry = await repo.findById(prisma, tenantId, id)
  if (!entry) throw new SalaryHistoryNotFoundError()
  return entry
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: CreateInput,
  audit?: AuditContext,
) {
  validateInput(input.paymentType, input.changeReason)

  // Ensure employee exists and belongs to tenant
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, tenantId },
    select: { id: true },
  })
  if (!employee) {
    throw new SalaryHistoryValidationError(
      `Mitarbeiter ${input.employeeId} nicht gefunden`,
    )
  }

  if (input.paymentType === "monthly" && input.grossSalary == null) {
    throw new SalaryHistoryValidationError(
      "Bei Zahlungstyp 'monthly' ist grossSalary erforderlich",
    )
  }
  if (input.paymentType === "hourly" && input.hourlyRate == null) {
    throw new SalaryHistoryValidationError(
      "Bei Zahlungstyp 'hourly' ist hourlyRate erforderlich",
    )
  }

  // Close the currently-open entry (if any) by setting its validTo to
  // validFrom - 1 day. We run sequential operations instead of wrapping
  // them in `prisma.$transaction` — the only thing that would fail
  // mid-stream is a constraint violation, and then we want the partial
  // state visible so the admin can fix it manually.
  const open = await prisma.employeeSalaryHistory.findFirst({
    where: { tenantId, employeeId: input.employeeId, validTo: null },
    orderBy: { validFrom: "desc" },
  })
  if (open) {
    const closeAt = new Date(input.validFrom)
    closeAt.setUTCDate(closeAt.getUTCDate() - 1)
    if (closeAt < open.validFrom) {
      throw new SalaryHistoryValidationError(
        "Das neue validFrom darf nicht vor dem validFrom des offenen Eintrags liegen",
      )
    }
    await prisma.employeeSalaryHistory.update({
      where: { id: open.id },
      data: { validTo: closeAt },
    })
  }

  const created = await prisma.employeeSalaryHistory.create({
    data: {
      tenantId,
      employeeId: input.employeeId,
      validFrom: input.validFrom,
      validTo: null,
      grossSalary: input.grossSalary ?? null,
      hourlyRate: input.hourlyRate ?? null,
      paymentType: input.paymentType,
      changeReason: input.changeReason,
      notes: input.notes ?? null,
      createdBy: audit?.userId ?? null,
    },
  })

  // Sync Employee master fields with the now-current entry.
  await prisma.employee.update({
    where: { id: input.employeeId },
    data: {
      grossSalary: input.grossSalary ?? null,
      hourlyRate: input.hourlyRate ?? null,
      paymentType: input.paymentType,
    },
  })

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "create",
        entityType: "employee_salary_history",
        entityId: created.id,
        entityName: `Gehaltshistorie ${input.employeeId}`,
        changes: {
          validFrom: input.validFrom,
          grossSalary: input.grossSalary,
          hourlyRate: input.hourlyRate,
          paymentType: input.paymentType,
          changeReason: input.changeReason,
        },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) =>
        console.error("[AuditLog] salary_history.create failed:", err),
      )
  }

  return created
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: UpdateInput,
  audit?: AuditContext,
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new SalaryHistoryNotFoundError()
  validateInput(input.paymentType, input.changeReason)

  const data: Record<string, unknown> = {}
  if (input.validFrom !== undefined) data.validFrom = input.validFrom
  if (input.validTo !== undefined) data.validTo = input.validTo
  if (input.grossSalary !== undefined) data.grossSalary = input.grossSalary
  if (input.hourlyRate !== undefined) data.hourlyRate = input.hourlyRate
  if (input.paymentType !== undefined) data.paymentType = input.paymentType
  if (input.changeReason !== undefined) data.changeReason = input.changeReason
  if (input.notes !== undefined) data.notes = input.notes

  const updated = await repo.update(prisma, tenantId, id, data)
  if (!updated) throw new SalaryHistoryNotFoundError()

  // If the open entry was updated, keep Employee master fields in sync
  if (updated.validTo === null) {
    await prisma.employee.update({
      where: { id: existing.employeeId },
      data: {
        grossSalary: updated.grossSalary,
        hourlyRate: updated.hourlyRate,
        paymentType: updated.paymentType,
      },
    })
  }

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "update",
        entityType: "employee_salary_history",
        entityId: updated.id,
        entityName: `Gehaltshistorie ${existing.employeeId}`,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) =>
        console.error("[AuditLog] salary_history.update failed:", err),
      )
  }

  return updated
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext,
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new SalaryHistoryNotFoundError()

  await repo.remove(prisma, tenantId, id)

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "delete",
        entityType: "employee_salary_history",
        entityId: id,
        entityName: `Gehaltshistorie ${existing.employeeId}`,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) =>
        console.error("[AuditLog] salary_history.delete failed:", err),
      )
  }

  return { success: true }
}
