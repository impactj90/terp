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
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as service from "@/lib/services/employee-messages-service"

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
      try {
        return await service.listMessages(ctx.prisma, ctx.tenantId!, {
          status: input?.status,
          limit: input?.limit ?? 20,
          offset: input?.offset ?? 0,
        })
      } catch (err) {
        handleServiceError(err)
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
      try {
        return await service.getMessageById(ctx.prisma, ctx.tenantId!, input.id)
      } catch (err) {
        handleServiceError(err)
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
      try {
        return await service.listMessagesForEmployee(
          ctx.prisma,
          ctx.tenantId!,
          input.employeeId,
          { limit: input.limit, offset: input.offset }
        )
      } catch (err) {
        handleServiceError(err)
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
      try {
        return await service.createMessage(
          ctx.prisma,
          ctx.tenantId!,
          ctx.user!.id,
          input
        )
      } catch (err) {
        handleServiceError(err)
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
      try {
        return await service.sendMessage(ctx.prisma, ctx.tenantId!, input.id)
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
