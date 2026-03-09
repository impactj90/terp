/**
 * Audit Logs Service
 *
 * Business logic for audit log retrieval.
 * Audit log creation is internal only (called by other services).
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./audit-logs-repository"
import type { AuditLogListParams } from "./audit-logs-repository"

// --- Error Classes ---

export class AuditLogNotFoundError extends Error {
  constructor(id: string) {
    super(`Audit log not found: ${id}`)
    this.name = "AuditLogNotFoundError"
  }
}

// --- Mapper ---

function mapToOutput(log: Record<string, unknown>) {
  const user = log.user as
    | { id: string; email: string; displayName: string }
    | null
    | undefined

  return {
    id: log.id as string,
    tenantId: log.tenantId as string,
    userId: (log.userId as string | null) ?? null,
    action: log.action as string,
    entityType: log.entityType as string,
    entityId: log.entityId as string,
    entityName: (log.entityName as string | null) ?? null,
    changes: (log.changes as unknown) ?? null,
    metadata: (log.metadata as unknown) ?? null,
    ipAddress: (log.ipAddress as string | null) ?? null,
    userAgent: (log.userAgent as string | null) ?? null,
    performedAt: log.performedAt as Date,
    ...(user !== undefined ? { user: user ?? null } : {}),
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: AuditLogListParams
) {
  const [items, total] = await Promise.all([
    repo.findMany(prisma, tenantId, params),
    repo.count(prisma, tenantId, params),
  ])

  return {
    items: items.map((item) =>
      mapToOutput(item as unknown as Record<string, unknown>)
    ),
    total,
  }
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const log = await repo.findById(prisma, tenantId, id)

  if (!log) {
    throw new AuditLogNotFoundError(id)
  }

  return mapToOutput(log as unknown as Record<string, unknown>)
}
