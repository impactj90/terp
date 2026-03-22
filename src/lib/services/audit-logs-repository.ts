/**
 * Audit Logs Repository
 *
 * Pure Prisma data-access functions for the AuditLog model.
 */
import type { PrismaClient, Prisma } from "@/generated/prisma/client"

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

export interface AuditLogCreateInput {
  tenantId: string
  userId: string | null
  action: string
  entityType: string
  entityId: string
  entityName?: string | null
  changes?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  ipAddress?: string | null
  userAgent?: string | null
}

export async function create(
  prisma: PrismaClient,
  data: AuditLogCreateInput
) {
  return prisma.auditLog.create({
    data: {
      tenantId: data.tenantId,
      userId: data.userId,
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      entityName: data.entityName ?? null,
      changes: (data.changes as Prisma.InputJsonValue) ?? undefined,
      metadata: (data.metadata as Prisma.InputJsonValue) ?? undefined,
      ipAddress: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
    },
  })
}

export async function createBulk(
  prisma: PrismaClient,
  data: AuditLogCreateInput[]
) {
  return prisma.auditLog.createMany({
    data: data.map((d) => ({
      tenantId: d.tenantId,
      userId: d.userId,
      action: d.action,
      entityType: d.entityType,
      entityId: d.entityId,
      entityName: d.entityName ?? null,
      changes: (d.changes as Prisma.InputJsonValue) ?? undefined,
      metadata: (d.metadata as Prisma.InputJsonValue) ?? undefined,
      ipAddress: d.ipAddress ?? null,
      userAgent: d.userAgent ?? null,
    })),
  })
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
