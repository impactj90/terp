/**
 * Employee Tariff Assignment Service
 *
 * Business logic for employee tariff assignment operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./employee-tariff-assignment-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
import { checkRelatedEmployeeDataScope } from "@/lib/auth/data-scope"
import type { DataScope } from "@/lib/auth/middleware"
import { EmployeeDayPlanGenerator } from "./employee-day-plan-generator"
import { RecalcService } from "./recalc"

// --- Audit ---

const TRACKED_FIELDS = [
  "employeeId",
  "tariffId",
  "effectiveFrom",
  "effectiveTo",
  "overwriteBehavior",
  "notes",
  "isActive",
]

// --- Post-Commit Sync Helpers ---

/**
 * Computes the date range that needs to be regenerated/recalculated after
 * an assignment lifecycle event. When effectiveTo is null (open-ended),
 * uses today+3 months as a pragmatic upper bound that matches the default
 * range used by the generator and weekly cron.
 */
function computeRecalcRange(
  effectiveFrom: Date,
  effectiveTo: Date | null,
  today: Date = new Date(),
): { from: Date; to: Date } {
  let to: Date
  if (effectiveTo) {
    to = effectiveTo
  } else {
    const upperBound = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    )
    upperBound.setUTCMonth(upperBound.getUTCMonth() + 3)
    to = upperBound
  }
  return { from: effectiveFrom, to }
}

// Clamp window for daily value recalc: how far back and forward from today
// to synchronously recalculate when an assignment changes. A longer window
// means a more complete immediate result; a shorter window means faster
// mutations. 2 months on each side keeps the per-request cost bounded
// (~120 calculateDay calls ≈ 1s) while still covering the common "fix
// my timesheet for yesterday/last week/last month" case. DailyValue rows
// outside this window stay stale until the user views them (cache miss
// triggers fresh calc) or until the weekly cron.
const RECALC_CLAMP_MONTHS = 2

function clampRecalcWindow(
  range: { from: Date; to: Date },
  today: Date = new Date(),
): { from: Date; to: Date } {
  const minFrom = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  )
  minFrom.setUTCMonth(minFrom.getUTCMonth() - RECALC_CLAMP_MONTHS)
  const maxTo = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  )
  maxTo.setUTCMonth(maxTo.getUTCMonth() + RECALC_CLAMP_MONTHS)

  const from =
    range.from.getTime() < minFrom.getTime() ? minFrom : range.from
  const to = range.to.getTime() > maxTo.getTime() ? maxTo : range.to
  return { from, to }
}

/**
 * Post-commit side effects for assignment create/update/remove.
 * Regenerates EmployeeDayPlan rows for the affected range and triggers
 * daily value recalculation. Best-effort: errors are logged but not thrown,
 * so the assignment operation itself remains committed.
 */
async function runPostCommitSync(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  range: { from: Date; to: Date },
  opts: { deleteOrphaned: boolean },
): Promise<void> {
  try {
    const generator = new EmployeeDayPlanGenerator(prisma)
    await generator.generateFromTariff({
      tenantId,
      employeeIds: [employeeId],
      from: range.from,
      to: range.to,
      overwriteTariffSource: true,
      deleteOrphanedTariffPlansInRange: opts.deleteOrphaned,
    })
  } catch (err) {
    console.error(
      "[employee-tariff-assignment-service] generateFromTariff failed",
      { tenantId, employeeId, range, err },
    )
  }

  // Clamp the recalc window to [today - 3mo, today + 3mo]. This keeps the
  // synchronous side-effect bounded even for long-lived assignments.
  const recalcWindow = clampRecalcWindow(range)
  if (recalcWindow.from.getTime() > recalcWindow.to.getTime()) {
    // Assignment is fully outside the clamp window (e.g. far future or
    // distant past): nothing meaningful to recalc synchronously.
    return
  }

  try {
    const recalcService = new RecalcService(
      prisma,
      undefined,
      undefined,
      tenantId,
    )
    await recalcService.triggerRecalcRange(
      tenantId,
      employeeId,
      recalcWindow.from,
      recalcWindow.to,
    )
  } catch (err) {
    console.error(
      "[employee-tariff-assignment-service] triggerRecalcRange failed",
      { tenantId, employeeId, range: recalcWindow, err },
    )
  }
}

// --- Error Classes ---

export class EmployeeTariffAssignmentNotFoundError extends Error {
  constructor(message = "Tariff assignment not found") {
    super(message)
    this.name = "EmployeeTariffAssignmentNotFoundError"
  }
}

export class EmployeeTariffAssignmentValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EmployeeTariffAssignmentValidationError"
  }
}

export class EmployeeTariffAssignmentConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EmployeeTariffAssignmentConflictError"
  }
}

export class EmployeeNotFoundError extends Error {
  constructor(message = "Employee not found") {
    super(message)
    this.name = "EmployeeNotFoundError"
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params: { employeeId: string; isActive?: boolean }
) {
  // Verify employee exists and belongs to tenant
  const employee = await repo.findEmployeeById(
    prisma,
    tenantId,
    params.employeeId
  )
  if (!employee) {
    throw new EmployeeNotFoundError()
  }

  return repo.findMany(prisma, tenantId, params.employeeId, {
    isActive: params.isActive,
  })
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  id: string
) {
  const assignment = await repo.findById(prisma, tenantId, employeeId, id)
  if (!assignment) {
    throw new EmployeeTariffAssignmentNotFoundError()
  }
  return assignment
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    tariffId: string
    effectiveFrom: Date
    effectiveTo?: Date | null
    overwriteBehavior?: string
    notes?: string
  },
  audit?: AuditContext,
  dataScope?: DataScope,
) {
  // Verify employee exists and belongs to tenant
  const employee = await repo.findEmployeeById(
    prisma,
    tenantId,
    input.employeeId,
    { id: true, departmentId: true },
  )
  if (!employee) {
    throw new EmployeeNotFoundError()
  }

  // Check data scope if provided
  if (dataScope) {
    checkRelatedEmployeeDataScope(
      dataScope,
      {
        employeeId: input.employeeId,
        employee: {
          departmentId: (employee as unknown as {
            departmentId: string | null
          }).departmentId,
        },
      },
      "EmployeeTariffAssignment",
    )
  }

  // Validate date range
  const effectiveTo = input.effectiveTo ?? null
  if (effectiveTo && effectiveTo < input.effectiveFrom) {
    throw new EmployeeTariffAssignmentValidationError(
      "Effective to date cannot be before effective from date"
    )
  }

  // Atomic overlap check + create in a single transaction
  const created = await prisma.$transaction(async (tx) => {
    const overlap = await repo.hasOverlap(
      tx as unknown as PrismaClient,
      input.employeeId,
      input.effectiveFrom,
      effectiveTo
    )
    if (overlap) {
      throw new EmployeeTariffAssignmentConflictError(
        "Overlapping tariff assignment exists"
      )
    }

    return repo.create(tx as unknown as PrismaClient, {
      tenantId,
      employeeId: input.employeeId,
      tariffId: input.tariffId,
      effectiveFrom: input.effectiveFrom,
      effectiveTo,
      overwriteBehavior:
        input.overwriteBehavior?.trim() || "preserve_manual",
      notes: input.notes?.trim() || null,
      isActive: true,
    })
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "employee_tariff_assignment",
      entityId: created.id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  // Post-commit: regenerate day plans + recalculate daily values for the
  // affected range. Best-effort — failures are logged but do not roll back
  // the assignment.
  const range = computeRecalcRange(created.effectiveFrom, created.effectiveTo)
  await runPostCommitSync(prisma, tenantId, created.employeeId, range, {
    deleteOrphaned: false,
  })

  return created
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    id: string
    effectiveFrom?: Date
    effectiveTo?: Date | null
    overwriteBehavior?: string
    notes?: string | null
    isActive?: boolean
  },
  audit?: AuditContext,
  dataScope?: DataScope
) {
  // Fetch existing assignment, verify tenant/employee match
  const existing = await repo.findById(
    prisma,
    tenantId,
    input.employeeId,
    input.id
  )
  if (!existing) {
    throw new EmployeeTariffAssignmentNotFoundError()
  }

  // Check data scope if provided
  if (dataScope) {
    const employee = await repo.findEmployeeById(prisma, tenantId, input.employeeId, { id: true, departmentId: true })
    if (employee) {
      checkRelatedEmployeeDataScope(dataScope, {
        employeeId: input.employeeId,
        employee: { departmentId: (employee as unknown as { departmentId: string | null }).departmentId },
      }, "EmployeeTariffAssignment")
    }
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  if (input.effectiveFrom !== undefined) {
    data.effectiveFrom = input.effectiveFrom
  }
  if (input.effectiveTo !== undefined) {
    data.effectiveTo = input.effectiveTo
  }
  if (input.overwriteBehavior !== undefined) {
    data.overwriteBehavior = input.overwriteBehavior.trim()
  }
  if (input.notes !== undefined) {
    data.notes =
      input.notes === null ? null : input.notes.trim() || null
  }
  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  // If dates changed, validate and re-check overlap
  const effectiveFrom =
    (data.effectiveFrom as Date | undefined) ?? existing.effectiveFrom
  const effectiveTo =
    data.effectiveTo !== undefined
      ? (data.effectiveTo as Date | null)
      : existing.effectiveTo

  if (effectiveTo && effectiveTo < effectiveFrom) {
    throw new EmployeeTariffAssignmentValidationError(
      "Effective to date cannot be before effective from date"
    )
  }

  // Wrap overlap check + update in transaction for atomicity (Tier 3)
  const updated = await prisma.$transaction(async (tx) => {
    // Re-check overlap if dates changed (exclude self)
    if (
      input.effectiveFrom !== undefined ||
      input.effectiveTo !== undefined
    ) {
      const overlap = await repo.hasOverlap(
        tx as unknown as PrismaClient,
        input.employeeId,
        effectiveFrom,
        effectiveTo,
        input.id
      )
      if (overlap) {
        throw new EmployeeTariffAssignmentConflictError(
          "Overlapping tariff assignment exists"
        )
      }
    }

    return (await repo.update(tx as unknown as PrismaClient, tenantId, input.id, data))!
  })

  if (audit) {
    const changes = auditLog.computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      TRACKED_FIELDS
    )
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "employee_tariff_assignment",
      entityId: input.id,
      entityName: null,
      changes,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  // Post-commit: if date fields or the tariffId changed, regenerate day
  // plans + recalc daily values for the union of the old and new ranges.
  // Changes to notes/overwriteBehavior/isActive alone don't affect the
  // generated plans, so skip the sync in that case.
  const datesChanged =
    (input.effectiveFrom !== undefined &&
      +input.effectiveFrom !== +existing.effectiveFrom) ||
    (input.effectiveTo !== undefined &&
      (input.effectiveTo?.getTime() ?? null) !==
        (existing.effectiveTo?.getTime() ?? null))

  if (datesChanged) {
    const today = new Date()
    const oldRange = computeRecalcRange(
      existing.effectiveFrom,
      existing.effectiveTo,
      today,
    )
    const newRange = computeRecalcRange(
      updated.effectiveFrom,
      updated.effectiveTo,
      today,
    )
    const unionRange = {
      from:
        oldRange.from.getTime() < newRange.from.getTime()
          ? oldRange.from
          : newRange.from,
      to:
        oldRange.to.getTime() > newRange.to.getTime()
          ? oldRange.to
          : newRange.to,
    }
    await runPostCommitSync(
      prisma,
      tenantId,
      existing.employeeId,
      unionRange,
      { deleteOrphaned: true },
    )
  }

  return updated
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  id: string,
  audit?: AuditContext,
  dataScope?: DataScope
) {
  // Fetch assignment, verify tenant/employee match
  const existing = await repo.findById(prisma, tenantId, employeeId, id)
  if (!existing) {
    throw new EmployeeTariffAssignmentNotFoundError()
  }

  // Check data scope if provided
  if (dataScope) {
    const employee = await repo.findEmployeeById(prisma, tenantId, employeeId, { id: true, departmentId: true })
    if (employee) {
      checkRelatedEmployeeDataScope(dataScope, {
        employeeId,
        employee: { departmentId: (employee as unknown as { departmentId: string | null }).departmentId },
      }, "EmployeeTariffAssignment")
    }
  }

  await repo.deleteById(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "employee_tariff_assignment",
      entityId: id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  // Post-commit: clean up tariff-source day plans left over from the
  // removed assignment, regenerate from any remaining assignments, then
  // recalc daily values. Dates/days no longer covered by any assignment
  // will be recalculated as OFF_DAY by `triggerRecalcRange`.
  const range = computeRecalcRange(
    existing.effectiveFrom,
    existing.effectiveTo,
  )
  await runPostCommitSync(prisma, tenantId, existing.employeeId, range, {
    deleteOrphaned: true,
  })
}

export async function getEffective(
  prisma: PrismaClient,
  tenantId: string,
  params: { employeeId: string; date: string }
) {
  // Parse date
  const date = new Date(params.date)
  if (isNaN(date.getTime())) {
    throw new EmployeeTariffAssignmentValidationError("Invalid date")
  }

  // Verify employee exists and belongs to tenant
  const employee = await repo.findEmployeeById(
    prisma,
    tenantId,
    params.employeeId,
    { id: true, tariffId: true }
  )
  if (!employee) {
    throw new EmployeeNotFoundError()
  }

  // Find active assignment covering the date
  const assignment = await repo.findEffective(
    prisma,
    tenantId,
    params.employeeId,
    date
  )

  if (assignment) {
    return {
      tariffId: assignment.tariffId,
      source: "assignment" as const,
      assignmentId: assignment.id,
    }
  }

  // Fall back to employee's default tariffId
  const employeeWithTariff = employee as unknown as { id: string; tariffId: string | null }
  if (employeeWithTariff.tariffId) {
    return {
      tariffId: employeeWithTariff.tariffId,
      source: "default" as const,
      assignmentId: null,
    }
  }

  // No tariff
  return {
    tariffId: null,
    source: "none" as const,
    assignmentId: null,
  }
}
