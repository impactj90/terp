/**
 * Notification Repository
 *
 * Pure Prisma data-access functions for the Notification and
 * NotificationPreference models.
 */
import type { PrismaClient } from "@/generated/prisma/client"

export async function findMany(
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
  const page = params?.page ?? 1
  const pageSize = params?.pageSize ?? 20

  // Build dynamic where clause (always scoped to tenant + user)
  const where: Record<string, unknown> = { tenantId, userId }

  if (params?.type) {
    where.type = params.type
  }
  if (params?.unread === true) {
    where.readAt = null
  } else if (params?.unread === false) {
    where.readAt = { not: null }
  }
  if (params?.fromDate || params?.toDate) {
    const createdAt: Record<string, Date> = {}
    if (params?.fromDate) {
      createdAt.gte = new Date(params.fromDate)
    }
    if (params?.toDate) {
      createdAt.lte = new Date(params.toDate)
    }
    where.createdAt = createdAt
  }

  // Run three queries in parallel
  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({
      where: { tenantId, userId, readAt: null },
    }),
  ])

  return { items, total, unreadCount }
}

export async function findByIdForUser(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
  id: string
) {
  return prisma.notification.findFirst({
    where: { id, tenantId, userId },
  })
}

export async function markRead(prisma: PrismaClient, tenantId: string, id: string) {
  return prisma.notification.update({ where: { id }, data: { readAt: new Date() } })
}

export async function markAllRead(
  prisma: PrismaClient,
  tenantId: string,
  userId: string
) {
  return prisma.notification.updateMany({
    where: { tenantId, userId, readAt: null },
    data: { readAt: new Date() },
  })
}

export async function countUnread(
  prisma: PrismaClient,
  tenantId: string,
  userId: string
) {
  return prisma.notification.count({
    where: { tenantId, userId, readAt: null },
  })
}

export async function findPreferences(
  prisma: PrismaClient,
  tenantId: string,
  userId: string
) {
  return prisma.notificationPreference.findUnique({
    where: {
      tenantId_userId: { tenantId, userId },
    },
  })
}

export async function createPreferences(
  prisma: PrismaClient,
  tenantId: string,
  userId: string
) {
  return prisma.notificationPreference.create({
    data: { tenantId, userId },
  })
}

export async function upsertPreferences(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
  input: {
    approvalsEnabled?: boolean
    errorsEnabled?: boolean
    remindersEnabled?: boolean
    systemEnabled?: boolean
  }
) {
  return prisma.notificationPreference.upsert({
    where: {
      tenantId_userId: { tenantId, userId },
    },
    update: input,
    create: {
      tenantId,
      userId,
      ...input,
    },
  })
}
