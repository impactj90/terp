/**
 * Employee Messages Router
 *
 * Provides employee message CRUD and send operations via tRPC procedures.
 *
 * Replaces the Go backend employee message endpoints:
 * - GET /employee-messages -> employeeMessages.list
 * - GET /employee-messages/{id} -> employeeMessages.getById
 * - GET /employees/{id}/messages -> employeeMessages.listForEmployee
 * - POST /employee-messages -> employeeMessages.create
 * - POST /employee-messages/{id}/send -> employeeMessages.send
 *
 * @see apps/api/internal/service/employee_message.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const NOTIFICATIONS_MANAGE = permissionIdByKey("notifications.manage")!

// --- Enum Constants ---

const RECIPIENT_STATUSES = ["pending", "sent", "failed"] as const

// --- Output Schemas ---

const recipientOutputSchema = z.object({
  id: z.string().uuid(),
  messageId: z.string().uuid(),
  employeeId: z.string().uuid(),
  status: z.string(),
  sentAt: z.date().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const employeeMessageOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  senderId: z.string().uuid(),
  subject: z.string(),
  body: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  recipients: z.array(recipientOutputSchema).optional(),
})

const sendResultOutputSchema = z.object({
  messageId: z.string().uuid(),
  sent: z.number(),
  failed: z.number(),
})

// --- Input Schemas ---

const createMessageInputSchema = z.object({
  subject: z.string().min(1, "Subject is required").max(255),
  body: z.string().min(1, "Body is required"),
  employeeIds: z
    .array(z.string().uuid())
    .min(1, "At least one recipient is required"),
})

const listMessagesInputSchema = z
  .object({
    status: z.enum(RECIPIENT_STATUSES).optional(),
    limit: z.number().int().min(1).max(100).optional().default(20),
    offset: z.number().int().min(0).optional().default(0),
  })
  .optional()

// --- Router ---

export const employeeMessagesRouter = createTRPCRouter({
  /**
   * employeeMessages.list -- Paginated list of messages for the tenant.
   *
   * Supports filtering by recipient status. Returns { items, total }.
   * Orders by createdAt DESC.
   *
   * Requires: notifications.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(NOTIFICATIONS_MANAGE))
    .input(listMessagesInputSchema)
    .output(
      z.object({
        items: z.array(employeeMessageOutputSchema),
        total: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const limit = input?.limit ?? 20
      const offset = input?.offset ?? 0
      const status = input?.status

      // Build where clause
      const where: Record<string, unknown> = { tenantId }
      if (status) {
        where.recipients = {
          some: { status },
        }
      }

      const [messages, total] = await Promise.all([
        ctx.prisma.employeeMessage.findMany({
          where,
          include: { recipients: true },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        ctx.prisma.employeeMessage.count({ where }),
      ])

      return {
        items: messages.map((m) => ({
          id: m.id,
          tenantId: m.tenantId,
          senderId: m.senderId,
          subject: m.subject,
          body: m.body,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
          recipients: m.recipients.map((r) => ({
            id: r.id,
            messageId: r.messageId,
            employeeId: r.employeeId,
            status: r.status,
            sentAt: r.sentAt,
            errorMessage: r.errorMessage,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          })),
        })),
        total,
      }
    }),

  /**
   * employeeMessages.getById -- Returns a single message by ID with recipients.
   *
   * Requires: notifications.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(NOTIFICATIONS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(employeeMessageOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const message = await ctx.prisma.employeeMessage.findFirst({
        where: { id: input.id, tenantId },
        include: { recipients: true },
      })

      if (!message) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Employee message not found",
        })
      }

      return {
        id: message.id,
        tenantId: message.tenantId,
        senderId: message.senderId,
        subject: message.subject,
        body: message.body,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
        recipients: message.recipients.map((r) => ({
          id: r.id,
          messageId: r.messageId,
          employeeId: r.employeeId,
          status: r.status,
          sentAt: r.sentAt,
          errorMessage: r.errorMessage,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
      }
    }),

  /**
   * employeeMessages.listForEmployee -- Fetches messages for a specific employee.
   *
   * Queries via employeeMessageRecipient -> includes message.
   *
   * Requires: notifications.manage permission
   */
  listForEmployee: tenantProcedure
    .use(requirePermission(NOTIFICATIONS_MANAGE))
    .input(
      z.object({
        employeeId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).optional().default(20),
        offset: z.number().int().min(0).optional().default(0),
      })
    )
    .output(
      z.object({
        items: z.array(employeeMessageOutputSchema),
        total: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Find messages where this employee is a recipient
      const [recipients, total] = await Promise.all([
        ctx.prisma.employeeMessageRecipient.findMany({
          where: {
            employeeId: input.employeeId,
            message: { tenantId },
          },
          include: {
            message: {
              include: { recipients: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take: input.limit,
          skip: input.offset,
        }),
        ctx.prisma.employeeMessageRecipient.count({
          where: {
            employeeId: input.employeeId,
            message: { tenantId },
          },
        }),
      ])

      return {
        items: recipients.map((r) => ({
          id: r.message.id,
          tenantId: r.message.tenantId,
          senderId: r.message.senderId,
          subject: r.message.subject,
          body: r.message.body,
          createdAt: r.message.createdAt,
          updatedAt: r.message.updatedAt,
          recipients: r.message.recipients.map((rec) => ({
            id: rec.id,
            messageId: rec.messageId,
            employeeId: rec.employeeId,
            status: rec.status,
            sentAt: rec.sentAt,
            errorMessage: rec.errorMessage,
            createdAt: rec.createdAt,
            updatedAt: rec.updatedAt,
          })),
        })),
        total,
      }
    }),

  /**
   * employeeMessages.create -- Creates a new employee message with recipients.
   *
   * Validates subject/body non-empty, at least one employeeId.
   * Uses a transaction to create message + recipients atomically.
   *
   * Requires: notifications.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(NOTIFICATIONS_MANAGE))
    .input(createMessageInputSchema)
    .output(employeeMessageOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const senderId = ctx.user!.id

      // Trim and validate
      const subject = input.subject.trim()
      if (subject.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Subject is required",
        })
      }

      const body = input.body.trim()
      if (body.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Body is required",
        })
      }

      // Create message + recipients atomically
      const message = await ctx.prisma.$transaction(async (tx) => {
        const msg = await tx.employeeMessage.create({
          data: {
            tenantId,
            senderId,
            subject,
            body,
          },
        })

        await tx.employeeMessageRecipient.createMany({
          data: input.employeeIds.map((employeeId) => ({
            messageId: msg.id,
            employeeId,
            status: "pending",
          })),
        })

        return msg
      })

      // Re-fetch with recipients
      const result = await ctx.prisma.employeeMessage.findFirst({
        where: { id: message.id, tenantId },
        include: { recipients: true },
      })

      return {
        id: result!.id,
        tenantId: result!.tenantId,
        senderId: result!.senderId,
        subject: result!.subject,
        body: result!.body,
        createdAt: result!.createdAt,
        updatedAt: result!.updatedAt,
        recipients: result!.recipients.map((r) => ({
          id: r.id,
          messageId: r.messageId,
          employeeId: r.employeeId,
          status: r.status,
          sentAt: r.sentAt,
          errorMessage: r.errorMessage,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
      }
    }),

  /**
   * employeeMessages.send -- Sends a message to all pending recipients.
   *
   * For each pending recipient:
   * 1. Looks up the employee's linked user
   * 2. Creates a Notification record
   * 3. Updates recipient status to "sent" or "failed"
   *
   * Returns { messageId, sent, failed }.
   *
   * Requires: notifications.manage permission
   */
  send: tenantProcedure
    .use(requirePermission(NOTIFICATIONS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(sendResultOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Fetch message with recipients
      const message = await ctx.prisma.employeeMessage.findFirst({
        where: { id: input.id, tenantId },
        include: { recipients: true },
      })

      if (!message) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Employee message not found",
        })
      }

      // Filter to pending recipients
      const pendingRecipients = message.recipients.filter(
        (r) => r.status === "pending"
      )

      let sentCount = 0
      let failedCount = 0

      for (const recipient of pendingRecipients) {
        try {
          // Look up the employee to find their linked user
          const employee = await ctx.prisma.employee.findFirst({
            where: { id: recipient.employeeId },
            include: { user: true },
          })

          if (employee?.user) {
            // Create notification for the employee's user
            await ctx.prisma.notification.create({
              data: {
                tenantId,
                userId: employee.user.id,
                type: "system",
                title: message.subject,
                message: message.body,
              },
            })
          }

          // Update recipient status to sent
          await ctx.prisma.employeeMessageRecipient.update({
            where: { id: recipient.id },
            data: {
              status: "sent",
              sentAt: new Date(),
            },
          })
          sentCount++
        } catch (err) {
          // Update recipient status to failed
          const errorMsg =
            err instanceof Error ? err.message : "Unknown error"
          await ctx.prisma.employeeMessageRecipient.update({
            where: { id: recipient.id },
            data: {
              status: "failed",
              errorMessage: errorMsg,
            },
          })
          failedCount++
        }
      }

      return {
        messageId: message.id,
        sent: sentCount,
        failed: failedCount,
      }
    }),
})
