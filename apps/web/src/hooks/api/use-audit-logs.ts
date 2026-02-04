import { useApiQuery } from '@/hooks'
import type { components } from '@/lib/api/types'

// --- Interfaces ---

type AuditAction = components['schemas']['AuditLog']['action']

interface UseAuditLogsOptions {
  userId?: string
  entityType?: string
  entityId?: string
  action?: AuditAction
  from?: string
  to?: string
  limit?: number
  cursor?: string
  enabled?: boolean
}

// --- Query Hooks ---

/**
 * List audit logs with filters.
 * GET /audit-logs
 */
export function useAuditLogs(options: UseAuditLogsOptions = {}) {
  const { userId, entityType, entityId, action, from, to, limit, cursor, enabled = true } = options
  return useApiQuery('/audit-logs', {
    params: {
      user_id: userId,
      entity_type: entityType,
      entity_id: entityId,
      action,
      from,
      to,
      limit,
      cursor,
    },
    enabled,
  })
}

/**
 * Get a single audit log by ID.
 * GET /audit-logs/{id}
 */
export function useAuditLog(id: string | undefined) {
  return useApiQuery('/audit-logs/{id}', {
    path: { id: id! },
    enabled: !!id,
  })
}
