/**
 * Platform Audit Service
 *
 * Fire-and-forget writes to `platform_audit_logs` plus pagination/detail
 * reads. Mirrors the tenant-side `src/lib/services/audit-logs-service.ts`
 * pattern but scoped to the platform admin domain — entries are keyed by
 * `platformUserId` and (optionally) `targetTenantId`/`supportSessionId`.
 */
import type { PrismaClient, Prisma } from "@/generated/prisma/client"

// Tx accepts either the root PrismaClient or a TransactionClient so
// services can log from inside prisma.$transaction callbacks.
type Tx = PrismaClient | Prisma.TransactionClient

// --- Error Classes ---

export class PlatformAuditLogNotFoundError extends Error {
  constructor(id: string) {
    super(`Platform audit log not found: ${id}`)
    this.name = "PlatformAuditLogNotFoundError"
  }
}

// --- Input/Output Types ---

export interface PlatformAuditLogInput {
  platformUserId: string | null
  action: string
  entityType?: string | null
  entityId?: string | null
  targetTenantId?: string | null
  supportSessionId?: string | null
  changes?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  ipAddress?: string | null
  userAgent?: string | null
}

export interface PlatformAuditLogListParams {
  page?: number
  pageSize?: number
  platformUserId?: string
  targetTenantId?: string
  action?: string
  fromDate?: string
  toDate?: string
}

function buildWhere(params?: PlatformAuditLogListParams) {
  const where: Record<string, unknown> = {}

  if (params?.platformUserId) {
    where.platformUserId = params.platformUserId
  }
  if (params?.targetTenantId) {
    where.targetTenantId = params.targetTenantId
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

// --- Write Path ---

/**
 * Write a platform audit log entry. Fire-and-forget — never throws.
 *
 * Audit log failures must NEVER block the actual business operation.
 */
export async function log(
  prisma: Tx,
  data: PlatformAuditLogInput
): Promise<void> {
  try {
    await prisma.platformAuditLog.create({
      data: {
        platformUserId: data.platformUserId,
        action: data.action,
        entityType: data.entityType ?? null,
        entityId: data.entityId ?? null,
        targetTenantId: data.targetTenantId ?? null,
        supportSessionId: data.supportSessionId ?? null,
        changes: (data.changes as Prisma.InputJsonValue) ?? undefined,
        metadata: (data.metadata as Prisma.InputJsonValue) ?? undefined,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
      },
    })
  } catch (err) {
    console.error("[PlatformAuditLog] Failed to write:", err, {
      action: data.action,
      platformUserId: data.platformUserId,
      targetTenantId: data.targetTenantId,
    })
  }
}

// --- Read Path ---

export async function list(
  prisma: PrismaClient,
  params?: PlatformAuditLogListParams
) {
  const where = buildWhere(params)
  const page = params?.page ?? 1
  const pageSize = params?.pageSize ?? 20

  const [items, total] = await Promise.all([
    prisma.platformAuditLog.findMany({
      where,
      orderBy: { performedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.platformAuditLog.count({ where }),
  ])

  return { items, total }
}

export async function getById(prisma: PrismaClient, id: string) {
  const entry = await prisma.platformAuditLog.findUnique({ where: { id } })
  if (!entry) {
    throw new PlatformAuditLogNotFoundError(id)
  }
  return entry
}
