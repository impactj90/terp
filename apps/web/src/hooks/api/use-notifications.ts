import { useApiQuery, useApiMutation } from '@/hooks'

type NotificationType = 'approvals' | 'errors' | 'reminders' | 'system'

interface UseNotificationsOptions {
  type?: NotificationType
  unread?: boolean
  from?: string
  to?: string
  limit?: number
  offset?: number
  enabled?: boolean
}

/**
 * Hook to fetch notifications for the current user.
 */
export function useNotifications(options: UseNotificationsOptions = {}) {
  const { enabled = true, ...params } = options

  return useApiQuery('/notifications', {
    params,
    enabled,
  })
}

/**
 * Hook to mark a notification as read.
 */
export function useMarkNotificationRead() {
  return useApiMutation('/notifications/{id}/read', 'post', {
    invalidateKeys: [['/notifications']],
  })
}

/**
 * Hook to mark all notifications as read.
 */
export function useMarkAllNotificationsRead() {
  return useApiMutation('/notifications/read-all', 'post', {
    invalidateKeys: [['/notifications']],
  })
}

/**
 * Hook to fetch notification preferences.
 */
export function useNotificationPreferences(enabled = true) {
  return useApiQuery('/notification-preferences', { enabled })
}

/**
 * Hook to update notification preferences.
 */
export function useUpdateNotificationPreferences() {
  return useApiMutation('/notification-preferences', 'put', {
    invalidateKeys: [['/notification-preferences']],
  })
}
