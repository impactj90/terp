import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

interface UseContactTypesOptions {
  active?: boolean
  enabled?: boolean
}

/**
 * Hook to fetch contact types.
 *
 * @example
 * ```tsx
 * const { data } = useContactTypes({ active: true })
 * const contactTypes = data?.data ?? []
 * ```
 */
export function useContactTypes(options: UseContactTypesOptions = {}) {
  const { active, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.contactTypes.list.queryOptions({ isActive: active }, { enabled })
  )
}

/**
 * Hook to fetch a single contact type by ID.
 *
 * @example
 * ```tsx
 * const { data: contactType } = useContactType(contactTypeId)
 * ```
 */
export function useContactType(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.contactTypes.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new contact type.
 */
export function useCreateContactType() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.contactTypes.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.contactTypes.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing contact type.
 */
export function useUpdateContactType() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.contactTypes.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.contactTypes.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a contact type.
 */
export function useDeleteContactType() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.contactTypes.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.contactTypes.list.queryKey(),
      })
    },
  })
}
