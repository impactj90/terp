/**
 * Employee Messages Service
 *
 * Business logic for employee message operations.
 * Delegates data access to the repository layer.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./employee-messages-repository"

// --- Error Classes ---

export class MessageNotFoundError extends Error {
  constructor() {
    super("Employee message not found")
    this.name = "MessageNotFoundError"
  }
}

export class MessageValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MessageValidationError"
  }
}

// --- Helpers ---

function mapRecipient(r: {
  id: string
  messageId: string
  employeeId: string
  status: string
  sentAt: Date | null
  errorMessage: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: r.id,
    messageId: r.messageId,
    employeeId: r.employeeId,
    status: r.status,
    sentAt: r.sentAt,
    errorMessage: r.errorMessage,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

function mapMessage(m: {
  id: string
  tenantId: string
  senderId: string
  subject: string
  body: string
  createdAt: Date
  updatedAt: Date
  recipients: Array<{
    id: string
    messageId: string
    employeeId: string
    status: string
    sentAt: Date | null
    errorMessage: string | null
    createdAt: Date
    updatedAt: Date
  }>
}) {
  return {
    id: m.id,
    tenantId: m.tenantId,
    senderId: m.senderId,
    subject: m.subject,
    body: m.body,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    recipients: m.recipients.map(mapRecipient),
  }
}

// --- Service Functions ---

/**
 * Paginated list of messages for the tenant.
 * Supports filtering by recipient status. Returns { items, total }.
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
  const { messages, total } = await repo.listMessages(prisma, tenantId, opts)

  return {
    items: messages.map(mapMessage),
    total,
  }
}

/**
 * Returns a single message by ID with recipients.
 */
export async function getMessageById(
  prisma: PrismaClient,
  tenantId: string,
  messageId: string
) {
  const message = await repo.findMessageById(prisma, tenantId, messageId)
  if (!message) {
    throw new MessageNotFoundError()
  }

  return mapMessage(message)
}

/**
 * Fetches messages for a specific employee (via recipient relation).
 */
export async function listMessagesForEmployee(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  opts: { limit: number; offset: number }
) {
  const { recipients, total } = await repo.listMessagesForEmployee(
    prisma,
    tenantId,
    employeeId,
    opts
  )

  return {
    items: recipients.map((r) => mapMessage(r.message)),
    total,
  }
}

/**
 * Creates a new employee message with recipients.
 * Validates subject/body non-empty.
 * Uses a transaction to create message + recipients atomically.
 */
export async function createMessage(
  prisma: PrismaClient,
  tenantId: string,
  senderId: string,
  input: {
    subject: string
    body: string
    employeeIds: string[]
  }
) {
  const subject = input.subject.trim()
  if (subject.length === 0) {
    throw new MessageValidationError("Subject is required")
  }

  const body = input.body.trim()
  if (body.length === 0) {
    throw new MessageValidationError("Body is required")
  }

  const message = await repo.createMessageWithRecipients(prisma, {
    tenantId,
    senderId,
    subject,
    body,
    employeeIds: input.employeeIds,
  })

  // Re-fetch with recipients
  const result = await repo.findMessageById(prisma, tenantId, message.id)

  return mapMessage(result!)
}

/**
 * Sends a message to all pending recipients.
 * For each pending recipient:
 * 1. Looks up the employee's linked user
 * 2. Creates a Notification record
 * 3. Updates recipient status to "sent" or "failed"
 * Returns { messageId, sent, failed }.
 */
export async function sendMessage(
  prisma: PrismaClient,
  tenantId: string,
  messageId: string
) {
  const message = await repo.findMessageById(prisma, tenantId, messageId)
  if (!message) {
    throw new MessageNotFoundError()
  }

  const pendingRecipients = message.recipients.filter(
    (r) => r.status === "pending"
  )

  let sentCount = 0
  let failedCount = 0

  for (const recipient of pendingRecipients) {
    try {
      const employee = await repo.findEmployeeWithUser(prisma, recipient.employeeId)

      if (employee?.user) {
        await repo.createNotification(prisma, {
          tenantId,
          userId: employee.user.id,
          type: "system",
          title: message.subject,
          message: message.body,
        })
      }

      await repo.updateRecipientStatus(prisma, recipient.id, {
        status: "sent",
        sentAt: new Date(),
      })
      sentCount++
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Unknown error"
      await repo.updateRecipientStatus(prisma, recipient.id, {
        status: "failed",
        errorMessage: errorMsg,
      })
      failedCount++
    }
  }

  return {
    messageId: message.id,
    sent: sentCount,
    failed: failedCount,
  }
}
