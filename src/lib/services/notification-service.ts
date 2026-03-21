/**
 * Notification Service
 *
 * Business logic for notification operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./notification-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Error Classes ---

export class NotificationNotFoundError extends Error {
  constructor(message = "Notification not found") {
    super(message)
    this.name = "NotificationNotFoundError"
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
  params?: {
    type?: string
    unread?: boolean
    fromDate?: string
    toDate?: string
    page?: number
    pageSize?: number
  }
) {
  return repo.findMany(prisma, tenantId, userId, params)
}

export async function markRead(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
  id: string
) {
  // Verify notification exists and belongs to this user
  const notification = await repo.findByIdForUser(
    prisma,
    tenantId,
    userId,
    id
  )
  if (!notification) {
    throw new NotificationNotFoundError()
  }

  await repo.markRead(prisma, tenantId, id)

  // Return new unread count for PubSub
  const newCount = await repo.countUnread(prisma, tenantId, userId)
  return { newCount }
}

export async function markAllRead(
  prisma: PrismaClient,
  tenantId: string,
  userId: string
) {
  const result = await repo.markAllRead(prisma, tenantId, userId)
  return { count: result.count }
}

export async function unreadCount(
  prisma: PrismaClient,
  tenantId: string,
  userId: string
) {
  return repo.countUnread(prisma, tenantId, userId)
}

export async function getPreferences(
  prisma: PrismaClient,
  tenantId: string,
  userId: string
) {
  // getOrCreate pattern
  const existing = await repo.findPreferences(prisma, tenantId, userId)
  if (existing) {
    return existing
  }

  // Create with defaults
  return repo.createPreferences(prisma, tenantId, userId)
}

export async function updatePreferences(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
  input: {
    approvalsEnabled?: boolean
    errorsEnabled?: boolean
    remindersEnabled?: boolean
    systemEnabled?: boolean
  },
  audit?: AuditContext
) {
  const updated = await repo.upsertPreferences(prisma, tenantId, userId, input)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "notification_preference",
      entityId: updated.id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}
