/**
 * Audit Logs Service
 *
 * Business logic for audit log retrieval.
 * Audit log creation is internal only (called by other services).
 */
import type { PrismaClient, Prisma } from "@/generated/prisma/client"
import * as repo from "./audit-logs-repository"
import type { AuditLogListParams, AuditLogCreateInput } from "./audit-logs-repository"
import { getImpersonation } from "@/lib/platform/impersonation-context"

// Re-export for convenience
export type { AuditLogCreateInput }

// Tx accepts PrismaClient OR a TransactionClient so services can log from
// inside prisma.$transaction callbacks.
type Tx = PrismaClient | Prisma.TransactionClient

/**
 * Audit context passed from tRPC routers to services.
 * Contains the acting user's ID and request metadata.
 */
export interface AuditContext {
  userId: string
  ipAddress?: string | null
  userAgent?: string | null
}

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

// --- Write Path ---

/**
 * Compute a changes diff between two records.
 *
 * Returns an object of `{ fieldName: { old: value, new: value } }` for each
 * field that differs. Fields present in `fieldsToTrack` are compared; all
 * others are ignored. If `fieldsToTrack` is omitted, all keys present in
 * either record are compared.
 *
 * Designed for use with Prisma model objects — handles Date, Decimal, null.
 */
export function computeChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fieldsToTrack?: string[]
): Record<string, { old: unknown; new: unknown }> | null {
  const keys = fieldsToTrack ?? [
    ...new Set([...Object.keys(before), ...Object.keys(after)]),
  ]

  const changes: Record<string, { old: unknown; new: unknown }> = {}

  for (const key of keys) {
    const oldVal = normalize(before[key])
    const newVal = normalize(after[key])

    if (!deepEqual(oldVal, newVal)) {
      changes[key] = { old: oldVal, new: newVal }
    }
  }

  return Object.keys(changes).length > 0 ? changes : null
}

/**
 * Normalize a value for comparison:
 * - Date → ISO string
 * - Decimal → number
 * - undefined → null
 */
function normalize(val: unknown): unknown {
  if (val === undefined) return null
  if (val instanceof Date) return val.toISOString()
  if (val !== null && typeof val === "object" && "toNumber" in val) {
    return (val as { toNumber(): number }).toNumber()
  }
  return val
}

/**
 * Simple deep equality check for JSON-compatible values.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (typeof a !== typeof b) return false
  if (typeof a !== "object") return false
  const aObj = a as Record<string, unknown>
  const bObj = b as Record<string, unknown>
  const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)])
  for (const key of keys) {
    if (!deepEqual(aObj[key], bObj[key])) return false
  }
  return true
}

/**
 * Write an audit log entry. Fire-and-forget — never throws.
 *
 * This function catches all errors internally. Audit log failures
 * must NEVER block the actual business operation.
 *
 * Callers SHOULD still use `.catch()` as defense-in-depth:
 *   await auditLog.log({ ... }).catch(err => console.error('[AuditLog] Failed:', err))
 */
export async function log(
  prisma: Tx,
  data: AuditLogCreateInput
): Promise<void> {
  const impersonation = getImpersonation()
  try {
    await repo.create(prisma, data)

    // Dual-write: when this request is running inside a platform
    // impersonation, also write a platform_audit_logs row so operators
    // can trace exactly what they touched across tenants. This runs in
    // the same try/catch — an error in either write is logged and
    // swallowed (audit logging must never break the business operation).
    // Plan: Phase 7.5.
    if (impersonation) {
      await (prisma as PrismaClient).platformAuditLog.create({
        data: {
          platformUserId: impersonation.platformUserId,
          action: `impersonation.${data.action}`,
          entityType: data.entityType,
          entityId: data.entityId,
          targetTenantId: data.tenantId,
          supportSessionId: impersonation.supportSessionId,
          changes: (data.changes as Prisma.InputJsonValue) ?? undefined,
          metadata: {
            entityName: data.entityName ?? null,
            originalUserId: data.userId,
          } as Prisma.InputJsonValue,
          ipAddress: data.ipAddress ?? null,
          userAgent: data.userAgent ?? null,
        },
      })
    }
  } catch (err) {
    // Never throw — audit failures must not block the actual operation
    console.error("[AuditLog] Failed to write audit log:", err, {
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
    })
  }
}

/**
 * Write multiple audit log entries in a single batch. Fire-and-forget — never throws.
 *
 * Uses prisma.auditLog.createMany() for a single INSERT statement
 * instead of N sequential creates.
 */
export async function logBulk(
  prisma: Tx,
  data: AuditLogCreateInput[]
): Promise<void> {
  if (data.length === 0) return
  const impersonation = getImpersonation()
  try {
    await repo.createBulk(prisma, data)

    // Mirror the single-write impersonation dual-write. Plan: Phase 7.5.
    if (impersonation) {
      await (prisma as PrismaClient).platformAuditLog.createMany({
        data: data.map((d) => ({
          platformUserId: impersonation.platformUserId,
          action: `impersonation.${d.action}`,
          entityType: d.entityType,
          entityId: d.entityId,
          targetTenantId: d.tenantId,
          supportSessionId: impersonation.supportSessionId,
          changes: (d.changes as Prisma.InputJsonValue) ?? undefined,
          metadata: {
            entityName: d.entityName ?? null,
            originalUserId: d.userId,
          } as Prisma.InputJsonValue,
          ipAddress: d.ipAddress ?? null,
          userAgent: d.userAgent ?? null,
        })),
      })
    }
  } catch (err) {
    console.error("[AuditLog] Failed to write bulk audit logs:", err, {
      count: data.length,
      entityType: data[0]?.entityType,
    })
  }
}
