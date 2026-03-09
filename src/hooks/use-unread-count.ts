'use client'

import { useQuery } from '@tanstack/react-query'
import { useTRPC } from '@/trpc'

export function useUnreadCount(enabled: boolean = true) {
  const trpc = useTRPC()
  const { data } = useQuery({
    ...trpc.notifications.unreadCount.queryOptions(),
    enabled,
    refetchOnWindowFocus: true,
  })

  return { unreadCount: data?.unread_count ?? 0 }
}
