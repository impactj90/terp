import { useApiQuery, useApiMutation } from '@/hooks'

// ==================== Query Hooks ====================

interface UseEmployeeMessagesOptions {
  status?: 'pending' | 'sent' | 'failed'
  limit?: number
  offset?: number
  enabled?: boolean
}

/**
 * Hook to fetch paginated list of employee messages.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmployeeMessages({ status: 'sent' })
 * const messages = data?.data ?? []
 * ```
 */
export function useEmployeeMessages(options: UseEmployeeMessagesOptions = {}) {
  const { status, limit = 20, offset = 0, enabled = true } = options

  return useApiQuery('/employee-messages', {
    params: {
      status,
      limit,
      offset,
    },
    enabled,
  })
}

/**
 * Hook to fetch a single employee message by ID.
 *
 * @example
 * ```tsx
 * const { data: message, isLoading } = useEmployeeMessage(messageId)
 * ```
 */
export function useEmployeeMessage(id: string, enabled = true) {
  return useApiQuery('/employee-messages/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to fetch messages for a specific employee.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmployeeMessagesForEmployee(employeeId)
 * ```
 */
export function useEmployeeMessagesForEmployee(
  employeeId: string,
  options: { limit?: number; offset?: number; enabled?: boolean } = {}
) {
  const { limit = 20, offset = 0, enabled = true } = options

  return useApiQuery('/employees/{id}/messages', {
    path: { id: employeeId },
    params: { limit, offset },
    enabled: enabled && !!employeeId,
  })
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new employee message.
 *
 * @example
 * ```tsx
 * const createMessage = useCreateEmployeeMessage()
 * createMessage.mutate({
 *   body: { subject: 'Hello', body: 'Content', employee_ids: ['uuid1'] }
 * })
 * ```
 */
export function useCreateEmployeeMessage() {
  return useApiMutation('/employee-messages', 'post', {
    invalidateKeys: [['/employee-messages']],
  })
}

/**
 * Hook to send an employee message to all pending recipients.
 *
 * @example
 * ```tsx
 * const sendMessage = useSendEmployeeMessage()
 * sendMessage.mutate({ path: { id: messageId } })
 * ```
 */
export function useSendEmployeeMessage() {
  return useApiMutation('/employee-messages/{id}/send', 'post', {
    invalidateKeys: [['/employee-messages']],
  })
}
