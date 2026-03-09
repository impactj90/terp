import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

/**
 * Hook to fetch employee access cards.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmployeeCards(employeeId)
 * const cards = data?.data ?? []
 * ```
 */
export function useEmployeeCards(employeeId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.employeeCards.list.queryOptions(
      { employeeId },
      { enabled: enabled && !!employeeId }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new employee access card.
 *
 * @example
 * ```tsx
 * const createCard = useCreateEmployeeCard()
 * createCard.mutate({
 *   employeeId: '...',
 *   cardNumber: 'CARD001',
 * })
 * ```
 */
export function useCreateEmployeeCard() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeCards.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeCards.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employees.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employees.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to deactivate an employee access card.
 *
 * @example
 * ```tsx
 * const deactivateCard = useDeactivateEmployeeCard()
 * deactivateCard.mutate({ id: cardId, reason: 'Lost' })
 * ```
 */
export function useDeactivateEmployeeCard() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeCards.deactivate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeCards.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employees.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employees.list.queryKey(),
      })
    },
  })
}
