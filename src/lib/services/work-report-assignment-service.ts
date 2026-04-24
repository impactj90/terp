/**
 * WorkReport Assignment Service
 *
 * Incremental add/remove flow for assigning employees to DRAFT
 * WorkReports. Parent attribution is used for audit logs.
 *
 * Plan: 2026-04-22-workreport-arbeitsschein-m1.md (Phase 3)
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./work-report-assignment-repository"
import type { WorkReportAssignmentWithIncludes } from "./work-report-assignment-repository"
import * as workReportRepo from "./work-report-repository"
import {
  WorkReportNotFoundError,
  WorkReportValidationError,
} from "./work-report-service"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

const AUDIT_ENTITY_TYPE = "work_report"

export class WorkReportAssignmentNotFoundError extends Error {
  constructor(message = "WorkReport assignment not found") {
    super(message)
    this.name = "WorkReportAssignmentNotFoundError"
  }
}

export class WorkReportAssignmentConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WorkReportAssignmentConflictError"
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  )
}

function normalizeRole(role: string | null | undefined): string | null {
  const trimmed = role?.trim()
  if (!trimmed) {
    return null
  }
  if (trimmed.length > 50) {
    throw new WorkReportValidationError("Role must be at most 50 characters")
  }
  return trimmed
}

async function assertEmployeeInTenant(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
): Promise<void> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId, deletedAt: null },
    select: { id: true },
  })
  if (!employee) {
    throw new WorkReportValidationError("Employee not found for this tenant")
  }
}

async function getEditableWorkReport(
  prisma: PrismaClient,
  tenantId: string,
  workReportId: string,
) {
  const report = await workReportRepo.findByIdSimple(
    prisma,
    tenantId,
    workReportId,
  )
  if (!report) {
    throw new WorkReportNotFoundError()
  }
  if (report.status !== "DRAFT") {
    throw new WorkReportValidationError(
      "WorkReport is not editable in its current status",
    )
  }
  return report
}

export async function listByWorkReport(
  prisma: PrismaClient,
  tenantId: string,
  workReportId: string,
): Promise<WorkReportAssignmentWithIncludes[]> {
  const report = await workReportRepo.findByIdSimple(
    prisma,
    tenantId,
    workReportId,
  )
  if (!report) {
    throw new WorkReportNotFoundError()
  }
  return repo.findMany(prisma, tenantId, workReportId)
}

export async function add(
  prisma: PrismaClient,
  tenantId: string,
  input: { workReportId: string; employeeId: string; role?: string | null },
  audit?: AuditContext,
): Promise<WorkReportAssignmentWithIncludes> {
  const report = await getEditableWorkReport(
    prisma,
    tenantId,
    input.workReportId,
  )
  await assertEmployeeInTenant(prisma, tenantId, input.employeeId)

  const role = normalizeRole(input.role)

  let created: WorkReportAssignmentWithIncludes
  try {
    created = await repo.create(prisma, {
      tenantId,
      workReportId: input.workReportId,
      employeeId: input.employeeId,
      role,
    })
  } catch (error: unknown) {
    if (isUniqueConstraintError(error)) {
      throw new WorkReportAssignmentConflictError(
        "Assignment already exists for this employee+role",
      )
    }
    throw error
  }

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "assignment_added",
        entityType: AUDIT_ENTITY_TYPE,
        entityId: report.id,
        entityName: report.code,
        changes: null,
        metadata: {
          assignmentId: created.id,
          employeeId: created.employeeId,
          role: created.role,
        },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return created
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext,
): Promise<void> {
  const assignment = await repo.findByIdSimple(prisma, tenantId, id)
  if (!assignment) {
    throw new WorkReportAssignmentNotFoundError()
  }

  const report = await getEditableWorkReport(
    prisma,
    tenantId,
    assignment.workReportId,
  )

  const deleted = await repo.deleteById(prisma, tenantId, id)
  if (!deleted) {
    throw new WorkReportAssignmentNotFoundError()
  }

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "assignment_removed",
        entityType: AUDIT_ENTITY_TYPE,
        entityId: report.id,
        entityName: report.code,
        changes: null,
        metadata: {
          assignmentId: assignment.id,
          employeeId: assignment.employeeId,
          role: assignment.role,
        },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }
}
