export interface AuditLogEntry {
  id: string
  tenantId: string
  userId: string | null
  action: string
  entityType: string
  entityId: string
  entityName: string | null
  changes: unknown
  metadata: unknown
  ipAddress: string | null
  userAgent: string | null
  performedAt: string | Date
  user?: {
    id: string
    email: string
    displayName: string
  } | null
}
