import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

/**
 * Hook to fetch employee job tickets.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmployeeJobTickets(employeeId)
 * const jobTickets = data?.data ?? []
 * ```
 */
export function useEmployeeJobTickets(employeeId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.employeeJobTickets.list.queryOptions(
      { employeeId },
      { enabled: enabled && !!employeeId }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new employee job ticket.
 *
 * @example
 * ```tsx
 * const createJobTicket = useCreateEmployeeJobTicket()
 * createJobTicket.mutate({ employeeId: '...', ... })
 * ```
 */
export function useCreateEmployeeJobTicket() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeJobTickets.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeJobTickets.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an employee job ticket.
 *
 * @example
 * ```tsx
 * const updateJobTicket = useUpdateEmployeeJobTicket()
 * updateJobTicket.mutate({ id: '...', ... })
 * ```
 */
export function useUpdateEmployeeJobTicket() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeJobTickets.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeJobTickets.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete an employee job ticket.
 *
 * @example
 * ```tsx
 * const deleteJobTicket = useDeleteEmployeeJobTicket()
 * deleteJobTicket.mutate({ id: '...' })
 * ```
 */
export function useDeleteEmployeeJobTicket() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeJobTickets.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeJobTickets.list.queryKey(),
      })
    },
  })
}
