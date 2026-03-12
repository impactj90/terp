/**
 * Employee Messages Repository
 *
 * Pure Prisma query functions for employee message data access.
 */
import type { PrismaClient } from "@/generated/prisma/client"

/**
 * Lists employee messages for a tenant with optional status filtering.
 * Returns paginated messages with recipients.
 */
export async function listMessages(
  prisma: PrismaClient,
  tenantId: string,
  opts: {
    status?: string
    limit: number
    offset: number
  }
) {
  const where: Record<string, unknown> = { tenantId }
  if (opts.status) {
    where.recipients = { some: { status: opts.status } }
  }

  const [messages, total] = await Promise.all([
    prisma.employeeMessage.findMany({
      where,
      include: { recipients: true },
      orderBy: { createdAt: "desc" },
      take: opts.limit,
      skip: opts.offset,
    }),
    prisma.employeeMessage.count({ where }),
  ])

  return { messages, total }
}

/**
 * Finds a single message by ID within a tenant, including recipients.
 */
export async function findMessageById(
  prisma: PrismaClient,
  tenantId: string,
  messageId: string
) {
  return prisma.employeeMessage.findFirst({
    where: { id: messageId, tenantId },
    include: { recipients: true },
  })
}

/**
 * Lists messages for a specific employee (via recipient relation).
 * Returns paginated results.
 */
export async function listMessagesForEmployee(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  opts: { limit: number; offset: number }
) {
  const where = {
    employeeId,
    message: { tenantId },
  }

  const [recipients, total] = await Promise.all([
    prisma.employeeMessageRecipient.findMany({
      where,
      include: {
        message: {
          include: { recipients: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: opts.limit,
      skip: opts.offset,
    }),
    prisma.employeeMessageRecipient.count({ where }),
  ])

  return { recipients, total }
}

/**
 * Creates a message and its recipients atomically in a transaction.
 * Returns the created message ID.
 */
export async function createMessageWithRecipients(
  prisma: PrismaClient,
  data: {
    tenantId: string
    senderId: string
    subject: string
    body: string
    employeeIds: string[]
  }
) {
  return prisma.$transaction(async (tx) => {
    const msg = await tx.employeeMessage.create({
      data: {
        tenantId: data.tenantId,
        senderId: data.senderId,
        subject: data.subject,
        body: data.body,
      },
    })

    await tx.employeeMessageRecipient.createMany({
      data: data.employeeIds.map((employeeId) => ({
        messageId: msg.id,
        employeeId,
        status: "pending",
      })),
    })

    return msg
  })
}

/**
 * Finds an employee by ID within a tenant, including the linked user.
 */
export async function findEmployeeWithUser(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string
) {
  return prisma.employee.findFirst({
    where: { id: employeeId, tenantId },
    include: { user: true },
  })
}

/**
 * Creates a notification record.
 */
export async function createNotification(
  prisma: PrismaClient,
  data: {
    tenantId: string
    userId: string
    type: string
    title: string
    message: string
  }
) {
  return prisma.notification.create({ data })
}

/**
 * Updates a message recipient's status (scoped to tenant via message relation).
 */
export async function updateRecipientStatus(
  prisma: PrismaClient,
  tenantId: string,
  recipientId: string,
  data: {
    status: string
    sentAt?: Date
    errorMessage?: string
  }
) {
  const existing = await prisma.employeeMessageRecipient.findFirst({ where: { id: recipientId, message: { tenantId } } })
  if (!existing) {
    return false
  }
  await prisma.employeeMessageRecipient.update({
    where: { id: recipientId },
    data,
  })
  return true
}
