import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

interface UseEmployeeMessagesOptions {
  status?: 'pending' | 'sent' | 'failed'
  limit?: number
  offset?: number
  enabled?: boolean
}

/**
 * Hook to fetch paginated list of employee messages (tRPC).
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmployeeMessages({ status: 'sent' })
 * const messages = data?.items ?? []
 * ```
 */
export function useEmployeeMessages(options: UseEmployeeMessagesOptions = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.employeeMessages.list.queryOptions(
      Object.keys(input).length > 0 ? input : undefined,
      { enabled }
    )
  )
}

/**
 * Hook to fetch a single employee message by ID (tRPC).
 *
 * @example
 * ```tsx
 * const { data: message, isLoading } = useEmployeeMessage(messageId)
 * ```
 */
export function useEmployeeMessage(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.employeeMessages.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

/**
 * Hook to fetch messages for a specific employee (tRPC).
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
  const trpc = useTRPC()
  return useQuery(
    trpc.employeeMessages.listForEmployee.queryOptions(
      { employeeId, limit, offset },
      { enabled: enabled && !!employeeId }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new employee message (tRPC).
 *
 * @example
 * ```tsx
 * const createMessage = useCreateEmployeeMessage()
 * createMessage.mutate({ subject: 'Hello', body: 'Content', employeeIds: ['uuid1'] })
 * ```
 */
export function useCreateEmployeeMessage() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeMessages.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeMessages.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to send an employee message to all pending recipients (tRPC).
 *
 * @example
 * ```tsx
 * const sendMessage = useSendEmployeeMessage()
 * sendMessage.mutate({ id: messageId })
 * ```
 */
export function useSendEmployeeMessage() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeMessages.send.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeMessages.list.queryKey(),
      })
    },
  })
}
