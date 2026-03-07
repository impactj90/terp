import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

type NotificationType = "approvals" | "errors" | "reminders" | "system"

interface UseNotificationsOptions {
  type?: NotificationType
  unread?: boolean
  fromDate?: string
  toDate?: string
  page?: number
  pageSize?: number
  enabled?: boolean
}

/**
 * Hook to fetch notifications for the current user (tRPC).
 * Returns items, total, and unreadCount.
 */
export function useNotifications(options: UseNotificationsOptions = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.notifications.list.queryOptions(
      Object.keys(input).length > 0 ? input : undefined,
      { enabled }
    )
  )
}

/**
 * Hook to mark a notification as read (tRPC).
 * Invalidates notifications list on success.
 */
export function useMarkNotificationRead() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.notifications.markRead.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.notifications.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.notifications.unreadCount.queryKey(),
      })
    },
  })
}

/**
 * Hook to mark all notifications as read (tRPC).
 * Invalidates notifications list on success.
 */
export function useMarkAllNotificationsRead() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.notifications.markAllRead.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.notifications.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.notifications.unreadCount.queryKey(),
      })
    },
  })
}

/**
 * Hook to fetch notification preferences (tRPC).
 */
export function useNotificationPreferences(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.notifications.preferences.queryOptions(undefined, { enabled })
  )
}

/**
 * Hook to update notification preferences (tRPC).
 * Invalidates preferences query on success.
 */
export function useUpdateNotificationPreferences() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.notifications.updatePreferences.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.notifications.preferences.queryKey(),
      })
    },
  })
}
