/**
 * Notifications Router
 *
 * Provides notification listing, read marking, preference management,
 * and realtime subscription via tRPC procedures. All operations are
 * user-scoped (users can only access their own notifications).
 *
 * Notification creation is internal only (called by other services).
 * Realtime events delivered via PubSub hub + tRPC subscription (onEvent).
 *
 * Replaces the Go backend notification endpoints:
 * - GET /notifications -> notifications.list
 * - POST /notifications/{id}/read -> notifications.markRead
 * - POST /notifications/read-all -> notifications.markAllRead
 * - GET /notification-preferences -> notifications.preferences
 * - PUT /notification-preferences -> notifications.updatePreferences
 *
 * @see apps/api/internal/service/notification.go
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import * as notificationService from "@/lib/services/notification-service"

// No permission middleware -- notifications are user-scoped.
// Any authenticated user with tenant access can manage their own notifications.
// The Go code uses notifications.manage permission on the route, but since all
// notification operations are self-scoped (user can only see/manage their own),
// we don't require an additional permission beyond authentication + tenant access.

// --- Output Schemas ---

const notificationOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  type: z.string(),
  title: z.string(),
  message: z.string(),
  link: z.string().nullable(),
  readAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const notificationPreferencesOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  approvalsEnabled: z.boolean(),
  errorsEnabled: z.boolean(),
  remindersEnabled: z.boolean(),
  systemEnabled: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

// --- Input Schemas ---

const NOTIFICATION_TYPES = [
  "approvals",
  "errors",
  "reminders",
  "system",
] as const

const listInputSchema = z
  .object({
    page: z.number().int().min(1).optional().default(1),
    pageSize: z.number().int().min(1).max(100).optional().default(20),
    type: z.enum(NOTIFICATION_TYPES).optional(),
    unread: z.boolean().optional(),
    fromDate: z.string().datetime().optional(),
    toDate: z.string().datetime().optional(),
  })
  .optional()

const updatePreferencesInputSchema = z.object({
  approvalsEnabled: z.boolean().optional(),
  errorsEnabled: z.boolean().optional(),
  remindersEnabled: z.boolean().optional(),
  systemEnabled: z.boolean().optional(),
})

// --- Helpers ---

function mapNotification(n: {
  id: string
  tenantId: string
  userId: string
  type: string
  title: string
  message: string
  link: string | null
  readAt: Date | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: n.id,
    tenantId: n.tenantId,
    userId: n.userId,
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link ?? null,
    readAt: n.readAt ?? null,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  }
}

function mapPreferences(p: {
  id: string
  tenantId: string
  userId: string
  approvalsEnabled: boolean
  errorsEnabled: boolean
  remindersEnabled: boolean
  systemEnabled: boolean
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: p.id,
    tenantId: p.tenantId,
    userId: p.userId,
    approvalsEnabled: p.approvalsEnabled,
    errorsEnabled: p.errorsEnabled,
    remindersEnabled: p.remindersEnabled,
    systemEnabled: p.systemEnabled,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }
}

// --- Router ---

export const notificationsRouter = createTRPCRouter({
  /**
   * notifications.list -- Returns paginated user-scoped notifications.
   *
   * Supports filtering by type, unread status, and date range.
   * Results are ordered by createdAt DESC.
   * Also returns total count and unreadCount for badge display.
   *
   * No additional permission required -- user-scoped.
   */
  list: tenantProcedure
    .input(listInputSchema)
    .output(
      z.object({
        items: z.array(notificationOutputSchema),
        total: z.number(),
        unreadCount: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const { items, total, unreadCount } = await notificationService.list(
          ctx.prisma,
          ctx.tenantId!,
          ctx.user.id,
          input
            ? {
                type: input.type,
                unread: input.unread,
                fromDate: input.fromDate,
                toDate: input.toDate,
                page: input.page,
                pageSize: input.pageSize,
              }
            : undefined
        )
        return {
          items: items.map(mapNotification),
          total,
          unreadCount,
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * notifications.markRead -- Marks a single notification as read.
   *
   * Verifies that the notification belongs to the current user and tenant.
   * Throws NOT_FOUND if the notification doesn't exist or belongs to another user.
   *
   * No additional permission required -- user-scoped.
   */
  markRead: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = ctx.user.id
        const { newCount } = await notificationService.markRead(
          ctx.prisma,
          ctx.tenantId!,
          userId,
          input.id
        )

        // Publish unread count update via PubSub
        const { getHub } = await import('@/lib/pubsub/singleton')
        const { userTopic } = await import('@/lib/pubsub/topics')
        const hub = getHub()
        await hub.publish(userTopic(userId), { event: 'unread_count', unread_count: newCount }, true)

        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * notifications.markAllRead -- Marks all unread notifications as read.
   *
   * Scoped to the current tenant + user.
   * Returns the count of notifications that were updated.
   *
   * No additional permission required -- user-scoped.
   */
  markAllRead: tenantProcedure
    .output(z.object({ success: z.boolean(), count: z.number() }))
    .mutation(async ({ ctx }) => {
      try {
        const userId = ctx.user.id
        const { count } = await notificationService.markAllRead(
          ctx.prisma,
          ctx.tenantId!,
          userId
        )

        // Publish unread count update via PubSub (count is now 0)
        const { getHub } = await import('@/lib/pubsub/singleton')
        const { userTopic } = await import('@/lib/pubsub/topics')
        const hub = getHub()
        await hub.publish(userTopic(userId), { event: 'unread_count', unread_count: 0 }, true)

        return { success: true, count }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * notifications.unreadCount -- Returns the count of unread notifications.
   *
   * Used by the useUnreadCount hook for badge display.
   * The subscription (onEvent) also pushes count updates in realtime.
   *
   * No additional permission required -- user-scoped.
   */
  unreadCount: tenantProcedure
    .query(async ({ ctx }) => {
      try {
        const count = await notificationService.unreadCount(
          ctx.prisma,
          ctx.tenantId!,
          ctx.user.id
        )
        return { unread_count: count }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * notifications.onEvent -- Realtime subscription for notification events.
   *
   * Uses PubSub hub to deliver events via SSE (httpSubscriptionLink).
   * Yields an initial 'connected' event with the current unread count,
   * then streams 'notification' events as they arrive.
   *
   * Adapted from workbook for terp's multi-tenant architecture.
   */
  onEvent: tenantProcedure.subscription(async function* ({ ctx, signal }) {
    const { getHub } = await import('@/lib/pubsub/singleton')
    const { userTopic } = await import('@/lib/pubsub/topics')
    const hub = getHub()
    const userId = ctx.user.id
    const tenantId = ctx.tenantId!

    // Yield initial connected event with unread count
    let unreadCount = 0
    try {
      unreadCount = await notificationService.unreadCount(
        ctx.prisma,
        tenantId,
        userId
      )
    } catch {
      // Silently ignore
    }
    yield { type: 'connected' as const, unread_count: unreadCount }

    // Queue + resolver pattern to bridge callback-based PubSub to async generator
    const queue: Array<{ type: 'notification' | 'feed_update'; subtype?: string; unread_count?: number }> = []
    let resolve: (() => void) | null = null

    const userSub = hub.subscribe(userTopic(userId), (msg) => {
      const payload = msg.payload as Record<string, unknown> | undefined
      queue.push({
        type: 'notification',
        subtype: (payload?.type as string) ?? undefined,
        unread_count: typeof payload?.unread_count === 'number' ? payload.unread_count : undefined,
      })
      resolve?.()
    })

    signal?.addEventListener('abort', () => {
      resolve?.()
    })

    try {
      while (!signal?.aborted) {
        if (queue.length === 0) {
          await new Promise<void>((r) => { resolve = r })
          resolve = null
        }
        while (queue.length > 0 && !signal?.aborted) {
          yield queue.shift()!
        }
      }
    } finally {
      hub.unsubscribe(userSub)
    }
  }),

  /**
   * notifications.preferences -- Returns notification preferences for the user.
   *
   * Uses getOrCreate pattern: creates default preferences on first access.
   *
   * No additional permission required -- user-scoped.
   */
  preferences: tenantProcedure
    .output(notificationPreferencesOutputSchema)
    .query(async ({ ctx }) => {
      try {
        const prefs = await notificationService.getPreferences(
          ctx.prisma,
          ctx.tenantId!,
          ctx.user.id
        )
        return mapPreferences(prefs)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * notifications.updatePreferences -- Updates notification preferences.
   *
   * Uses upsert to create or update preferences atomically.
   *
   * No additional permission required -- user-scoped.
   */
  updatePreferences: tenantProcedure
    .input(updatePreferencesInputSchema)
    .output(notificationPreferencesOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await notificationService.updatePreferences(
          ctx.prisma,
          ctx.tenantId!,
          ctx.user.id,
          input
        )
        return mapPreferences(result)
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
