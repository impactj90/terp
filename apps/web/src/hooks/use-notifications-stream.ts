'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/providers/auth-provider'
import { useTRPC } from '@/trpc'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface UseNotificationsStreamOptions {
  enabled?: boolean
}

/**
 * Hook that subscribes to Supabase Realtime postgres_changes on the
 * notifications table. On INSERT events for the current user, it
 * invalidates the notifications query cache so the UI auto-refreshes.
 *
 * Replaces the previous SSE-based implementation (TICKET-230).
 */
export function useNotificationsStream(options: UseNotificationsStreamOptions = {}) {
  const { enabled = true } = options
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const trpc = useTRPC()
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    if (!enabled || !user?.id) {
      return undefined
    }

    const supabase = createClient()

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Invalidate tRPC notifications list (updates badge + list)
          queryClient.invalidateQueries({
            queryKey: trpc.notifications.list.queryKey(),
          })
          // Invalidate legacy Go API absence queries (some notifications
          // relate to absence approvals and the absences hooks still use
          // the legacy API client)
          queryClient.invalidateQueries({ queryKey: ['/absences'] })
          queryClient.invalidateQueries({ queryKey: ['/employees/{id}/absences'] })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Handles mark-read and mark-all-read updates
          queryClient.invalidateQueries({
            queryKey: trpc.notifications.list.queryKey(),
          })
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [enabled, user?.id, queryClient, trpc])
}
