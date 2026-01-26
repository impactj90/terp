import { useApiQuery, useApiMutation } from '@/hooks'

/**
 * Hook to fetch employee access cards.
 *
 * @example
 * ```tsx
 * const { data: cards, isLoading } = useEmployeeCards(employeeId)
 * ```
 */
export function useEmployeeCards(employeeId: string, enabled = true) {
  return useApiQuery('/employees/{id}/cards', {
    path: { id: employeeId },
    enabled: enabled && !!employeeId,
  })
}

/**
 * Hook to create a new employee access card.
 *
 * @example
 * ```tsx
 * const createCard = useCreateEmployeeCard()
 * createCard.mutate({
 *   path: { id: employeeId },
 *   body: { card_number: 'CARD001', card_type: 'rfid', valid_from: '2024-01-01' }
 * })
 * ```
 */
export function useCreateEmployeeCard() {
  return useApiMutation('/employees/{id}/cards', 'post', {
    invalidateKeys: [['/employees/{id}/cards'], ['/employees/{id}'], ['/employees']],
  })
}

/**
 * Hook to deactivate an employee access card.
 *
 * @example
 * ```tsx
 * const deactivateCard = useDeactivateEmployeeCard()
 * deactivateCard.mutate({ path: { id: employeeId, cardId: cardId } })
 * ```
 */
export function useDeactivateEmployeeCard() {
  return useApiMutation('/employees/{id}/cards/{cardId}', 'delete', {
    invalidateKeys: [['/employees/{id}/cards'], ['/employees/{id}'], ['/employees']],
  })
}
