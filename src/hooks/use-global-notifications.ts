'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useSubscription } from '@trpc/tanstack-react-query'
import { useTRPC } from '@/trpc'
import { playNotificationSound } from '@/lib/notification-sound'

/**
 * Opens a tRPC subscription to notifications.onEvent.
 * - Pushes unread_count updates into the React Query cache
 * - Plays a notification sound for incoming notifications
 * - Invalidates the notifications list on new events
 *
 * Mount this once at the layout level.
 */
export function useGlobalNotifications(enabled: boolean = true) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  useSubscription(
    trpc.notifications.onEvent.subscriptionOptions(undefined, {
      enabled,
      onData: (event) => {
        if (event.type === 'connected') {
          queryClient.setQueryData(
            trpc.notifications.unreadCount.queryKey(),
            { unread_count: event.unread_count },
          )
        } else if (event.type === 'notification') {
          const subtype = (event as Record<string, unknown>).subtype as string | undefined

          // Silent data-only events (no notification badge/sound)
          if (subtype === 'booking_change') {
            queryClient.invalidateQueries({ queryKey: trpc.employees.dayView.queryKey() })
            queryClient.invalidateQueries({ queryKey: trpc.dailyValues.listAll.queryKey() })
            return
          }

          // Real notifications: update badge + sound
          if (typeof event.unread_count === 'number') {
            queryClient.setQueryData(
              trpc.notifications.unreadCount.queryKey(),
              { unread_count: event.unread_count },
            )
          } else {
            queryClient.invalidateQueries({ queryKey: trpc.notifications.unreadCount.queryKey() })
          }
          queryClient.invalidateQueries({ queryKey: trpc.notifications.list.queryKey() })

          // Invalidate domain-specific queries based on notification subtype
          if (subtype?.startsWith('absence_')) {
            queryClient.invalidateQueries({ queryKey: trpc.absences.list.queryKey() })
            queryClient.invalidateQueries({ queryKey: trpc.absences.forEmployee.queryKey() })
            queryClient.invalidateQueries({ queryKey: trpc.vacation.getBalance.queryKey() })
          }

          playNotificationSound()
        }
      },
    }),
  )
}
