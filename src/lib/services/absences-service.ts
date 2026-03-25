/**
 * Absences Service
 *
 * Business logic for absence day operations including range creation,
 * approval workflow, vacation balance recalculation, and notifications.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import type { DataScope } from "@/lib/auth/middleware";
import { Decimal } from "@prisma/client/runtime/client";
import { RecalcService } from "@/lib/services/recalc";
import * as repo from "./absences-repository";
import * as auditLog from "./audit-logs-service";
import type { AuditContext } from "./audit-logs-service";

const TRACKED_FIELDS = [
  "duration",
  "halfDayPeriod",
  "notes",
  "status",
  "approvedById",
  "rejectedReason",
];

// --- Error Classes ---

export class AbsenceNotFoundError extends Error {
  constructor(message = "Absence not found") {
    super(message);
    this.name = "AbsenceNotFoundError";
  }
}

export class AbsenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AbsenceValidationError";
  }
}

export class AbsenceForbiddenError extends Error {
  constructor(message = "Absence not within data scope") {
    super(message);
    this.name = "AbsenceForbiddenError";
  }
}

// --- Data Scope Helpers ---

export function buildAbsenceDataScopeWhere(
  dataScope: DataScope,
): Record<string, unknown> | null {
  if (dataScope.type === "department") {
    return { employee: { departmentId: { in: dataScope.departmentIds } } };
  } else if (dataScope.type === "employee") {
    return { employeeId: { in: dataScope.employeeIds } };
  }
  return null;
}

export function checkAbsenceDataScope(
  dataScope: DataScope,
  item: {
    employeeId: string;
    employee?: { departmentId: string | null } | null;
  },
): void {
  if (dataScope.type === "department") {
    if (
      !item.employee?.departmentId ||
      !dataScope.departmentIds.includes(item.employee.departmentId)
    ) {
      throw new AbsenceForbiddenError();
    }
  } else if (dataScope.type === "employee") {
    if (!dataScope.employeeIds.includes(item.employeeId)) {
      throw new AbsenceForbiddenError();
    }
  }
}

// --- Helper Functions ---

/**
 * Determines if a date should be skipped during range creation.
 * Port of Go shouldSkipDate() from service/absence.go.
 *
 * Skip rules:
 * 1. Weekends (Saturday=6, Sunday=0 via getUTCDay())
 * 2. No EmployeeDayPlan for the date (no_plan)
 * 3. EmployeeDayPlan exists but dayPlanId is null (off_day)
 *
 * Holidays are NOT skipped per ZMI spec Section 18.2.
 */
export function shouldSkipDate(
  date: Date,
  dayPlanMap: Map<string, { dayPlanId: string | null }>,
): boolean {
  const dayOfWeek = date.getUTCDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return true; // weekend

  const dateKey = date.toISOString().split("T")[0]!;
  const dayPlan = dayPlanMap.get(dateKey);
  if (!dayPlan) return true; // no plan -> skip
  if (!dayPlan.dayPlanId) return true; // off-day -> skip

  return false;
}

// --- Recalculation Helpers ---

async function triggerRecalc(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  date: Date,
): Promise<void> {
  try {
    const service = new RecalcService(prisma, undefined, undefined, tenantId);
    await service.triggerRecalc(tenantId, employeeId, date);
  } catch (error) {
    console.error(
      `Recalc failed for employee ${employeeId} on ${date.toISOString().split("T")[0]}:`,
      error,
    );
  }
}

async function triggerRecalcRange(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  fromDate: Date,
  toDate: Date,
): Promise<void> {
  try {
    const service = new RecalcService(prisma, undefined, undefined, tenantId);
    await service.triggerRecalcRange(tenantId, employeeId, fromDate, toDate);
  } catch (error) {
    console.error(`Recalc range failed for employee ${employeeId}:`, error);
  }
}

/**
 * Recalculates vacation taken for an employee/year.
 * Sums up all approved absence days for vacation-deducting types,
 * weighted by dayPlan.vacationDeduction * absence.duration.
 *
 * Port of Go VacationService.RecalculateTaken().
 */
async function recalculateVacationTaken(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  year: number,
): Promise<void> {
  const vacationTypes = await repo.findVacationDeductingTypes(prisma, tenantId);
  if (vacationTypes.length === 0) return;

  const typeIds = vacationTypes.map((t) => t.id);

  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31));

  const absenceDays = await repo.findApprovedAbsenceDaysForYear(
    prisma,
    tenantId,
    employeeId,
    typeIds,
    yearStart,
    yearEnd,
  );

  const dayPlans = await repo.findEmployeeDayPlansWithVacationDeduction(
    prisma,
    tenantId,
    employeeId,
    yearStart,
    yearEnd,
  );

  const dayPlanMap = new Map<string, number>();
  for (const dp of dayPlans) {
    const dateKey = dp.planDate.toISOString().split("T")[0]!;
    const deduction = dp.dayPlan?.vacationDeduction;
    dayPlanMap.set(
      dateKey,
      deduction instanceof Decimal
        ? deduction.toNumber()
        : Number(deduction ?? 1),
    );
  }

  let totalTaken = 0;
  for (const absence of absenceDays) {
    const dateKey = absence.absenceDate.toISOString().split("T")[0]!;
    const vacationDeduction = dayPlanMap.get(dateKey) ?? 1.0;
    const dur =
      absence.duration instanceof Decimal
        ? absence.duration.toNumber()
        : Number(absence.duration);
    totalTaken += vacationDeduction * dur;
  }

  await repo.upsertVacationBalance(
    prisma,
    tenantId,
    employeeId,
    year,
    totalTaken,
  );
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    page?: number;
    pageSize?: number;
    employeeId?: string;
    absenceTypeId?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
  },
  dataScope: DataScope,
) {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 50;

  const where: Record<string, unknown> = {};

  if (input.employeeId) {
    where.employeeId = input.employeeId;
  }
  if (input.absenceTypeId) {
    where.absenceTypeId = input.absenceTypeId;
  }
  if (input.status) {
    where.status = input.status;
  }

  if (input.fromDate || input.toDate) {
    const absenceDate: Record<string, unknown> = {};
    if (input.fromDate) {
      absenceDate.gte = new Date(input.fromDate);
    }
    if (input.toDate) {
      absenceDate.lte = new Date(input.toDate);
    }
    where.absenceDate = absenceDate;
  }

  // Apply data scope filtering
  const scopeWhere = buildAbsenceDataScopeWhere(dataScope);
  if (scopeWhere) {
    if (scopeWhere.employee && where.employee) {
      where.employee = {
        ...((where.employee as Record<string, unknown>) || {}),
        ...((scopeWhere.employee as Record<string, unknown>) || {}),
      };
    } else {
      Object.assign(where, scopeWhere);
    }
  }

  const [items, total] = await Promise.all([
    repo.findMany(prisma, tenantId, {
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    repo.count(prisma, tenantId, where),
  ]);

  return { items, total };
}

export async function forEmployee(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string;
    fromDate?: string;
    toDate?: string;
    status?: string;
  },
) {
  const where: Record<string, unknown> = { employeeId: input.employeeId };

  if (input.status) {
    where.status = input.status;
  }

  if (input.fromDate || input.toDate) {
    const absenceDate: Record<string, unknown> = {};
    if (input.fromDate) {
      absenceDate.gte = new Date(input.fromDate);
    }
    if (input.toDate) {
      absenceDate.lte = new Date(input.toDate);
    }
    where.absenceDate = absenceDate;
  }

  return repo.findForEmployee(prisma, tenantId, where);
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  dataScope: DataScope,
) {
  const absence = await repo.findById(prisma, tenantId, id);

  if (!absence) {
    throw new AbsenceNotFoundError();
  }

  checkAbsenceDataScope(dataScope, absence);

  return absence;
}

// TODO: refactor this later
export async function createRange(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string;
    absenceTypeId: string;
    fromDate: string;
    toDate: string;
    duration: number;
    halfDayPeriod?: string;
    notes?: string;
  },
  audit: AuditContext | null,
) {
  const {
    employeeId,
    absenceTypeId,
    fromDate: fromDateStr,
    toDate: toDateStr,
    duration,
    halfDayPeriod,
    notes,
  } = input;

  const fromDate = new Date(fromDateStr);
  const toDate = new Date(toDateStr);

  // 1. Validate fromDate <= toDate
  if (fromDate > toDate) {
    throw new AbsenceValidationError(
      "fromDate must be before or equal to toDate",
    );
  }

  // 2. Validate absence type exists, is active, belongs to tenant (or system type)
  const absenceType = await repo.findActiveAbsenceType(
    prisma,
    tenantId,
    absenceTypeId,
  );
  if (!absenceType) {
    throw new AbsenceNotFoundError("Absence type not found or inactive");
  }

  // Determine auto-approve: if the type does not require approval, approve immediately
  const autoApprove = absenceType.requiresApproval === false;
  const status = autoApprove ? "approved" : "pending";

  // 3-7. Wrap check-and-create in a transaction to prevent duplicate inserts
  //       from concurrent requests for the same employee/date range.
  const { toCreate, skippedDates, createdAbsences } = await prisma.$transaction(
    async (tx) => {
      const txPrisma = tx as unknown as PrismaClient;
      // 3. Batch-fetch EmployeeDayPlan records for the date range
      const dayPlans = await repo.findEmployeeDayPlans(
        txPrisma,
        tenantId,
        employeeId,
        fromDate,
        toDate,
      );

      const dayPlanMap = new Map<string, { dayPlanId: string | null }>();
      for (const dp of dayPlans) {
        const dateKey = dp.planDate.toISOString().split("T")[0]!;
        dayPlanMap.set(dateKey, { dayPlanId: dp.dayPlanId });
      }

      // 4. Batch-fetch existing absences for employee in range where status != 'cancelled'
      const existingAbsences = await repo.findExistingAbsences(
        txPrisma,
        tenantId,
        employeeId,
        fromDate,
        toDate,
      );

      const existingMap = new Set<string>();
      for (const ea of existingAbsences) {
        existingMap.add(ea.absenceDate.toISOString().split("T")[0]!);
      }

      // 5. Iterate day-by-day and build records to create
      const txToCreate: Array<{
        tenantId: string;
        employeeId: string;
        absenceDate: Date;
        absenceTypeId: string;
        duration: number;
        halfDayPeriod: string | null;
        status: string;
        notes: string | null;
        createdBy: string | null;
        approvedBy?: string | null;
        approvedAt?: Date | null;
      }> = [];
      const txSkippedDates: string[] = [];

      const currentDate = new Date(fromDate);
      while (currentDate <= toDate) {
        const dateKey = currentDate.toISOString().split("T")[0]!;

        if (shouldSkipDate(currentDate, dayPlanMap)) {
          txSkippedDates.push(dateKey);
        } else if (existingMap.has(dateKey)) {
          txSkippedDates.push(dateKey);
        } else {
          txToCreate.push({
            tenantId,
            employeeId,
            absenceDate: new Date(currentDate),
            absenceTypeId,
            duration,
            halfDayPeriod: halfDayPeriod ?? null,
            status,
            notes: notes ?? null,
            createdBy: audit?.userId ?? null,
            approvedBy: autoApprove ? (audit?.userId ?? null) : null,
            approvedAt: autoApprove ? new Date() : null,
          });
        }

        // Advance to next day
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      }

      // 6. Batch create
      if (txToCreate.length > 0) {
        await repo.createMany(txPrisma, txToCreate);
      }

      // 7. Re-fetch created records with relations
      const txCreatedAbsences =
        txToCreate.length > 0
          ? await repo.findCreatedAbsences(txPrisma, tenantId, {
              employeeId,
              absenceTypeId,
              fromDate,
              toDate,
              createdBy: audit?.userId ?? undefined,
              status,
            })
          : [];

      return {
        toCreate: txToCreate,
        skippedDates: txSkippedDates,
        createdAbsences: txCreatedAbsences,
      };
    },
  );

  // 8. Trigger recalc range (best effort, outside transaction)
  if (toCreate.length > 0) {
    await triggerRecalcRange(prisma, tenantId, employeeId, fromDate, toDate);

    if (autoApprove) {
      // Monthly recalc per affected month (approve-level)
      const monthDates = new Map<string, Date>();
      for (const r of toCreate) {
        const d = r.absenceDate;
        const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
        if (!monthDates.has(key)) monthDates.set(key, d);
      }
      for (const date of monthDates.values()) {
        await triggerRecalc(prisma, tenantId, employeeId, date);
      }

      // Recalculate vacation balance if type deducts vacation
      if (absenceType.deductsVacation) {
        const years = new Set(
          toCreate.map((r) => r.absenceDate.getUTCFullYear()),
        );
        for (const year of years) {
          try {
            await recalculateVacationTaken(prisma, tenantId, employeeId, year);
          } catch (error) {
            console.error(`Vacation recalc failed for year ${year}:`, error);
          }
        }
      }
    }
  }

  // Never throws — audit failures must not block the actual operation
  if (audit && createdAbsences.length > 0) {
    await auditLog.logBulk(
      prisma,
      createdAbsences.map((created) => ({
        tenantId,
        userId: audit.userId,
        action: "create",
        entityType: "absence_day",
        entityId: (created as unknown as Record<string, unknown>).id as string,
        entityName: null,
        ipAddress: audit.ipAddress ?? null,
        userAgent: audit.userAgent ?? null,
      })),
    );
  }

  return { createdAbsences, skippedDates };
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string;
    duration?: number;
    halfDayPeriod?: string | null;
    notes?: string | null;
  },
  dataScope: DataScope,
  audit: AuditContext,
) {
  // 1. Fetch the absence
  const absence = await repo.findByIdWithEmployee(prisma, tenantId, input.id);

  if (!absence) {
    throw new AbsenceNotFoundError();
  }

  // 2. Check data scope
  checkAbsenceDataScope(dataScope, absence);

  // 3. Validate status is pending
  if (absence.status !== "pending") {
    throw new AbsenceValidationError("Only pending absences can be updated");
  }

  // 4. Build update data
  const updateData: Record<string, unknown> = {};
  if (input.duration !== undefined) {
    updateData.duration = input.duration;
  }
  if (input.halfDayPeriod !== undefined) {
    updateData.halfDayPeriod = input.halfDayPeriod;
  }
  if (input.notes !== undefined) {
    updateData.notes = input.notes;
  }

  // 5. Update
  const updated = await repo.update(prisma, tenantId, input.id, updateData);

  // 6. Trigger recalc (best effort)
  await triggerRecalc(
    prisma,
    tenantId,
    absence.employeeId,
    absence.absenceDate,
  );

  // Never throws — audit failures must not block the actual operation
  const changes = auditLog.computeChanges(
    absence as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>,
    TRACKED_FIELDS,
  );
  await auditLog
    .log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "absence_day",
      entityId: input.id,
      entityName: null,
      changes,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    })
    .catch((err) => console.error("[AuditLog] Failed:", err));

  return updated;
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  dataScope: DataScope,
  audit: AuditContext,
) {
  // 1. Fetch the absence with type info
  const absence = await repo.findByIdWithEmployeeAndType(prisma, tenantId, id);

  if (!absence) {
    throw new AbsenceNotFoundError();
  }

  // 2. Check data scope
  checkAbsenceDataScope(dataScope, absence);

  const wasApproved = absence.status === "approved";
  const deductsVacation = absence.absenceType?.deductsVacation ?? false;
  const absenceDate = absence.absenceDate;
  const absenceYear = absenceDate.getUTCFullYear();

  // 3. Hard delete
  await repo.deleteById(prisma, tenantId, id);

  // 4. Trigger recalc (best effort)
  await triggerRecalc(prisma, tenantId, absence.employeeId, absenceDate);

  // 5. If was approved and type deducts vacation, recalculate vacation balance
  if (wasApproved && deductsVacation) {
    try {
      await recalculateVacationTaken(
        prisma,
        tenantId,
        absence.employeeId,
        absenceYear,
      );
    } catch (error) {
      console.error(
        `Vacation recalc failed for employee ${absence.employeeId}:`,
        error,
      );
    }
  }

  // Never throws — audit failures must not block the actual operation
  await auditLog
    .log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "absence_day",
      entityId: id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    })
    .catch((err) => console.error("[AuditLog] Failed:", err));
}

export async function approve(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  dataScope: DataScope,
  audit: AuditContext,
) {
  // 1. Fetch absence with relations
  const absence = await repo.findByIdForApproval(prisma, tenantId, id);

  if (!absence) {
    throw new AbsenceNotFoundError();
  }

  // 2. Check data scope
  checkAbsenceDataScope(dataScope, absence);

  // 3. Atomically update only if status is still pending (prevents double-approve)
  const updated = await repo.updateIfStatus(prisma, tenantId, id, "pending", {
    status: "approved",
    approvedBy: audit.userId,
    approvedAt: new Date(),
  });

  if (!updated) {
    throw new AbsenceValidationError("Only pending absences can be approved");
  }

  // 4. Trigger recalc (best effort)
  await triggerRecalc(
    prisma,
    tenantId,
    absence.employeeId,
    absence.absenceDate,
  );

  // 5. If deductsVacation, recalculate vacation balance (best effort)
  if (absence.absenceType?.deductsVacation) {
    try {
      const absenceYear = absence.absenceDate.getUTCFullYear();
      await recalculateVacationTaken(
        prisma,
        tenantId,
        absence.employeeId,
        absenceYear,
      );
    } catch (error) {
      console.error(
        `Vacation recalc failed for employee ${absence.employeeId}:`,
        error,
      );
    }
  }

  // Never throws — audit failures must not block the actual operation
  const changes = auditLog.computeChanges(
    absence as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>,
    TRACKED_FIELDS,
  );
  await auditLog
    .log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "approve",
      entityType: "absence_day",
      entityId: id,
      entityName: null,
      changes,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    })
    .catch((err) => console.error("[AuditLog] Failed:", err));

  // 7. Send notification to employee (best effort)
  try {
    const dateLabel = absence.absenceDate.toISOString().split("T")[0];
    const typeName = absence.absenceType?.name ?? "Absence";
    const link = "/absences";

    const employeeUserId = await repo.findUserIdForEmployee(
      prisma,
      tenantId,
      absence.employeeId,
    );

    if (employeeUserId) {
      await repo.createNotification(prisma, {
        tenantId,
        userId: employeeUserId,
        type: "approvals",
        title: "Absence approved",
        message: `${typeName} on ${dateLabel} was approved.`,
        link,
      });
    }
  } catch {
    console.error("Failed to send approval notification for absence", id);
  }

  return updated;
}

export async function reject(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  reason: string | undefined,
  dataScope: DataScope,
  audit: AuditContext,
) {
  // 1. Fetch absence with relations
  const absence = await repo.findByIdForRejection(prisma, tenantId, id);

  if (!absence) {
    throw new AbsenceNotFoundError();
  }

  // 2. Check data scope
  checkAbsenceDataScope(dataScope, absence);

  // 3. Atomically update only if status is still pending (prevents double-reject)
  const updated = await repo.updateIfStatus(prisma, tenantId, id, "pending", {
    status: "rejected",
    rejectionReason: reason ?? null,
  });

  if (!updated) {
    throw new AbsenceValidationError("Only pending absences can be rejected");
  }

  // 4. Trigger recalc (best effort)
  await triggerRecalc(
    prisma,
    tenantId,
    absence.employeeId,
    absence.absenceDate,
  );

  // Never throws — audit failures must not block the actual operation
  const changes = auditLog.computeChanges(
    absence as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>,
    TRACKED_FIELDS,
  );
  await auditLog
    .log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "reject",
      entityType: "absence_day",
      entityId: id,
      entityName: null,
      changes,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    })
    .catch((err) => console.error("[AuditLog] Failed:", err));

  // 6. Send rejection notification to employee (best effort)
  try {
    const dateLabel = absence.absenceDate.toISOString().split("T")[0];
    const typeName = absence.absenceType?.name ?? "Absence";
    const reasonSuffix = reason ? ` (Reason: ${reason})` : "";
    const link = "/absences";

    const employeeUserId = await repo.findUserIdForEmployee(
      prisma,
      tenantId,
      absence.employeeId,
    );

    if (employeeUserId) {
      await repo.createNotification(prisma, {
        tenantId,
        userId: employeeUserId,
        type: "approvals",
        title: "Absence rejected",
        message: `${typeName} on ${dateLabel} was rejected.${reasonSuffix}`,
        link,
      });
    }
  } catch {
    console.error("Failed to send rejection notification for absence", id);
  }

  return updated;
}

export async function cancel(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  dataScope: DataScope,
  audit: AuditContext,
) {
  // 1. Fetch absence with relations
  const absence = await repo.findByIdForCancel(prisma, tenantId, id);

  if (!absence) {
    throw new AbsenceNotFoundError();
  }

  // 2. Check data scope
  checkAbsenceDataScope(dataScope, absence);

  // 3. Atomically update only if status is still approved (prevents double-cancel)
  const updated = await repo.updateIfStatus(prisma, tenantId, id, "approved", {
    status: "cancelled",
  });

  if (!updated) {
    throw new AbsenceValidationError("Only approved absences can be cancelled");
  }

  // 5. Trigger recalc (best effort)
  await triggerRecalc(
    prisma,
    tenantId,
    absence.employeeId,
    absence.absenceDate,
  );

  // 6. If deductsVacation, recalculate vacation balance (best effort)
  if (absence.absenceType?.deductsVacation) {
    try {
      const absenceYear = absence.absenceDate.getUTCFullYear();
      await recalculateVacationTaken(
        prisma,
        tenantId,
        absence.employeeId,
        absenceYear,
      );
    } catch (error) {
      console.error(
        `Vacation recalc failed for employee ${absence.employeeId}:`,
        error,
      );
    }
  }

  // Never throws — audit failures must not block the actual operation
  const changes = auditLog.computeChanges(
    absence as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>,
    TRACKED_FIELDS,
  );
  await auditLog
    .log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "cancel",
      entityType: "absence_day",
      entityId: id,
      entityName: null,
      changes,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    })
    .catch((err) => console.error("[AuditLog] Failed:", err));

  return updated;
}
