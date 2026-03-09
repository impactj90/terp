import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

/**
 * Hook to fetch employee contacts.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmployeeContacts(employeeId)
 * const contacts = data?.data ?? []
 * ```
 */
export function useEmployeeContacts(employeeId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.employeeContacts.list.queryOptions(
      { employeeId },
      { enabled: enabled && !!employeeId }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new employee contact.
 *
 * @example
 * ```tsx
 * const createContact = useCreateEmployeeContact()
 * createContact.mutate({
 *   employeeId: '...',
 *   contactType: 'email',
 *   value: 'john@example.com',
 * })
 * ```
 */
export function useCreateEmployeeContact() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeContacts.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeContacts.list.queryKey(),
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
 * Hook to delete an employee contact.
 *
 * @example
 * ```tsx
 * const deleteContact = useDeleteEmployeeContact()
 * deleteContact.mutate({ id: contactId })
 * ```
 */
export function useDeleteEmployeeContact() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeContacts.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeContacts.list.queryKey(),
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
