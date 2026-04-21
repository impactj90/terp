/**
 * Overtime Request Repository
 *
 * Pure Prisma data-access for OvertimeRequest model. Mirrors
 * absences-repository structure, including CAS `updateIfStatus` and
 * raw-SQL permission-based approver lookup.
 */
import { Prisma } from "@/generated/prisma/client"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Include Objects ---

export const overtimeRequestListInclude = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      personnelNumber: true,
      isActive: true,
      departmentId: true,
    },
  },
} as const

type Tx = PrismaClient | Prisma.TransactionClient

// --- Query Functions ---

export interface FindManyFilter {
  employeeId?: string
  status?: string
  requestType?: string
  from?: Date
  to?: Date
  departmentIds?: string[]
  employeeIds?: string[]
}

export async function findMany(
  prisma: Tx,
  tenantId: string,
  filter: FindManyFilter,
  pagination: { skip: number; take: number }
) {
  const where = buildWhere(tenantId, filter)
  return prisma.overtimeRequest.findMany({
    where,
    include: overtimeRequestListInclude,
    orderBy: [{ requestDate: "desc" }, { createdAt: "desc" }],
    skip: pagination.skip,
    take: pagination.take,
  })
}

export async function count(
  prisma: Tx,
  tenantId: string,
  filter: FindManyFilter
) {
  return prisma.overtimeRequest.count({
    where: buildWhere(tenantId, filter),
  })
}

function buildWhere(tenantId: string, filter: FindManyFilter) {
  const where: Record<string, unknown> = { tenantId }
  if (filter.employeeId) where.employeeId = filter.employeeId
  if (filter.status) where.status = filter.status
  if (filter.requestType) where.requestType = filter.requestType
  if (filter.from || filter.to) {
    const range: Record<string, Date> = {}
    if (filter.from) range.gte = filter.from
    if (filter.to) range.lte = filter.to
    where.requestDate = range
  }
  if (filter.employeeIds) {
    where.employeeId = { in: filter.employeeIds }
  }
  if (filter.departmentIds) {
    where.employee = { departmentId: { in: filter.departmentIds } }
  }
  return where
}

export async function findById(
  prisma: Tx,
  tenantId: string,
  id: string
) {
  return prisma.overtimeRequest.findFirst({
    where: { id, tenantId },
    include: overtimeRequestListInclude,
  })
}

export interface CreateInput {
  tenantId: string
  employeeId: string
  requestType: string
  requestDate: Date
  plannedMinutes: number
  reason: string
  status: string
  approvedBy: string | null
  approvedAt: Date | null
  arbzgWarnings: string[]
  createdBy: string | null
}

export async function create(prisma: Tx, data: CreateInput) {
  return prisma.overtimeRequest.create({
    data: {
      tenantId: data.tenantId,
      employeeId: data.employeeId,
      requestType: data.requestType,
      requestDate: data.requestDate,
      plannedMinutes: data.plannedMinutes,
      reason: data.reason,
      status: data.status,
      approvedBy: data.approvedBy,
      approvedAt: data.approvedAt,
      arbzgWarnings: data.arbzgWarnings,
      createdBy: data.createdBy,
    },
    include: overtimeRequestListInclude,
  })
}

/**
 * Atomically updates a request only if it has the expected status.
 * Returns the updated record, or null if the status didn't match.
 */
export async function updateIfStatus(
  prisma: Tx,
  tenantId: string,
  id: string,
  expectedStatus: string,
  data: Record<string, unknown>
) {
  const { count: affected } = await prisma.overtimeRequest.updateMany({
    where: { id, tenantId, status: expectedStatus },
    data,
  })
  if (affected === 0) return null
  return prisma.overtimeRequest.findFirst({
    where: { id, tenantId },
    include: overtimeRequestListInclude,
  })
}

/**
 * Active approved REOPEN lookup used by the bookings-service reopen gate
 * (phase 6) and by the approve-flow self-check. Fast-path backed by the
 * partial unique index `overtime_requests_active_reopen`.
 */
export async function hasActiveReopen(
  prisma: Tx,
  tenantId: string,
  employeeId: string,
  date: Date
): Promise<boolean> {
  const c = await prisma.overtimeRequest.count({
    where: {
      tenantId,
      employeeId,
      requestType: "REOPEN",
      status: "approved",
      requestDate: date,
    },
  })
  return c > 0
}

/**
 * Batch lookup used by daily-calc UNAPPROVED_OVERTIME integration.
 * Returns a Set of ISO date keys (YYYY-MM-DD) for which an approved
 * OvertimeRequest exists in [from, to].
 */
export async function findApprovedRequestDates(
  prisma: Tx,
  tenantId: string,
  employeeId: string,
  from: Date,
  to: Date
): Promise<Set<string>> {
  const rows = await prisma.overtimeRequest.findMany({
    where: {
      tenantId,
      employeeId,
      status: "approved",
      requestDate: { gte: from, lte: to },
    },
    select: { requestDate: true },
  })
  const out = new Set<string>()
  for (const r of rows) {
    out.add(r.requestDate.toISOString().slice(0, 10))
  }
  return out
}

// --- Notification & Approver Lookup ---

export async function createNotification(
  prisma: Tx,
  data: {
    tenantId: string
    userId: string
    type: string
    title: string
    message: string
    link: string
  }
) {
  return prisma.notification.create({ data })
}

export async function findUserIdForEmployee(
  prisma: Tx,
  tenantId: string,
  employeeId: string
): Promise<string | null> {
  const result = await prisma.$queryRaw<{ user_id: string }[]>`
    SELECT ut.user_id
    FROM user_tenants ut
    JOIN users u ON u.id = ut.user_id
    WHERE ut.tenant_id = ${tenantId}::uuid
      AND u.employee_id = ${employeeId}::uuid
    LIMIT 1
  `
  return result && result.length > 0 ? result[0]!.user_id : null
}

/**
 * Raw-SQL approver lookup keyed on a permission key held by the user's
 * group (JSONB containment). Mirrors absences-repository.findApproverUserIds.
 */
export async function findApproverUserIds(
  prisma: Tx,
  tenantId: string,
  permissionKey: "overtime.approve" | "overtime.approve_escalated",
  excludeUserId?: string
): Promise<string[]> {
  const permissionLiteral = JSON.stringify([permissionKey])
  const rows = await prisma.$queryRaw<{ user_id: string }[]>`
    SELECT DISTINCT u.id AS user_id
    FROM users u
    JOIN user_tenants ut ON ut.user_id = u.id AND ut.tenant_id = ${tenantId}::uuid
    JOIN user_groups ug ON ug.id = u.user_group_id
    WHERE (
      ug.is_admin = true
      OR ug.permissions @> ${permissionLiteral}::jsonb
    )
    ${excludeUserId ? Prisma.sql`AND u.id != ${excludeUserId}::uuid` : Prisma.empty}
  `
  return rows.map((r) => r.user_id)
}
