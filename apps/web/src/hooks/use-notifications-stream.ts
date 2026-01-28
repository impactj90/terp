import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authStorage, tenantIdStorage } from '@/lib/api'
import { clientEnv } from '@/config/env'

interface UseNotificationsStreamOptions {
  enabled?: boolean
}

export function useNotificationsStream(options: UseNotificationsStreamOptions = {}) {
  const { enabled = true } = options
  const queryClient = useQueryClient()
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) {
      return undefined
    }

    const token = authStorage.getToken()
    const tenantId = tenantIdStorage.getTenantId()
    if (!token || !tenantId) {
      return undefined
    }

    const controller = new AbortController()
    let isActive = true

    const handleEvent = (eventName: string) => {
      if (eventName.startsWith('notification.')) {
        queryClient.invalidateQueries({ queryKey: ['/notifications'] })
      }
      if (eventName === 'notification.created') {
        queryClient.invalidateQueries({ queryKey: ['/absences'] })
        queryClient.invalidateQueries({ queryKey: ['/employees/{id}/absences'] })
      }
    }

    const connect = async () => {
      try {
        const response = await fetch(`${clientEnv.apiUrl}/notifications/stream`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Tenant-ID': tenantId,
          },
          signal: controller.signal,
        })

        if (!response.ok || !response.body) {
          throw new Error('Notification stream unavailable')
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder('utf-8')
        let buffer = ''
        let eventName = 'message'
        let dataLines: string[] = []

        while (isActive) {
          const { done, value } = await reader.read()
          if (done) {
            break
          }

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (line.startsWith(':')) {
              continue
            }
            if (line.startsWith('event:')) {
              eventName = line.slice(6).trim() || 'message'
              continue
            }
            if (line.startsWith('data:')) {
              dataLines.push(line.slice(5).trim())
              continue
            }
            if (line.trim() === '') {
              if (dataLines.length > 0) {
                handleEvent(eventName)
                dataLines = []
                eventName = 'message'
              }
            }
          }
        }
      } catch {
        // Ignore errors; attempt to reconnect below.
      }

      if (isActive && !controller.signal.aborted) {
        reconnectTimeoutRef.current = setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      isActive = false
      controller.abort()
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [enabled, queryClient])
}
