/**
 * Audit Logs Repository
 *
 * Pure Prisma data-access functions for the AuditLog model.
 */
import type { PrismaClient } from "@/generated/prisma/client"

export interface AuditLogListParams {
  page?: number
  pageSize?: number
  userId?: string
  entityType?: string
  entityId?: string
  action?: string
  fromDate?: string
  toDate?: string
}

const auditLogUserInclude = {
  user: {
    select: { id: true, email: true, displayName: true },
  },
} as const

function buildWhere(tenantId: string, params?: AuditLogListParams) {
  const where: Record<string, unknown> = { tenantId }

  if (params?.userId) {
    where.userId = params.userId
  }
  if (params?.entityType) {
    where.entityType = params.entityType
  }
  if (params?.entityId) {
    where.entityId = params.entityId
  }
  if (params?.action) {
    where.action = params.action
  }
  if (params?.fromDate || params?.toDate) {
    const performedAt: Record<string, Date> = {}
    if (params.fromDate) {
      performedAt.gte = new Date(params.fromDate)
    }
    if (params.toDate) {
      performedAt.lte = new Date(params.toDate)
    }
    where.performedAt = performedAt
  }

  return where
}

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: AuditLogListParams
) {
  const where = buildWhere(tenantId, params)
  const page = params?.page ?? 1
  const pageSize = params?.pageSize ?? 20

  return prisma.auditLog.findMany({
    where,
    include: auditLogUserInclude,
    orderBy: { performedAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  })
}

export async function count(
  prisma: PrismaClient,
  tenantId: string,
  params?: AuditLogListParams
) {
  const where = buildWhere(tenantId, params)
  return prisma.auditLog.count({ where })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.auditLog.findFirst({
    where: { id, tenantId },
    include: auditLogUserInclude,
  })
}
