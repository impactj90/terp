import { useApiQuery, useApiMutation } from '@/hooks'

/**
 * Hook to fetch employee contacts.
 *
 * @example
 * ```tsx
 * const { data: contacts, isLoading } = useEmployeeContacts(employeeId)
 * ```
 */
export function useEmployeeContacts(employeeId: string, enabled = true) {
  return useApiQuery('/employees/{id}/contacts', {
    path: { id: employeeId },
    enabled: enabled && !!employeeId,
  })
}

/**
 * Hook to create a new employee contact.
 *
 * @example
 * ```tsx
 * const createContact = useCreateEmployeeContact()
 * createContact.mutate({
 *   path: { id: employeeId },
 *   body: { contact_type: 'email', value: 'john@example.com', is_primary: false }
 * })
 * ```
 */
export function useCreateEmployeeContact() {
  return useApiMutation('/employees/{id}/contacts', 'post', {
    invalidateKeys: [['/employees/{id}/contacts'], ['/employees/{id}'], ['/employees']],
  })
}

/**
 * Hook to delete an employee contact.
 *
 * @example
 * ```tsx
 * const deleteContact = useDeleteEmployeeContact()
 * deleteContact.mutate({ path: { id: employeeId, contactId: contactId } })
 * ```
 */
export function useDeleteEmployeeContact() {
  return useApiMutation('/employees/{id}/contacts/{contactId}', 'delete', {
    invalidateKeys: [['/employees/{id}/contacts'], ['/employees/{id}'], ['/employees']],
  })
}
