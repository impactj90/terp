import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

interface UseContactKindsOptions {
  contactTypeId?: string
  isActive?: boolean
  enabled?: boolean
}

/**
 * Hook to fetch contact kinds.
 *
 * @example
 * ```tsx
 * const { data } = useContactKinds({ contactTypeId: selectedType.id })
 * const contactKinds = data?.data ?? []
 * ```
 */
export function useContactKinds(options: UseContactKindsOptions = {}) {
  const { contactTypeId, isActive, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.contactKinds.list.queryOptions(
      { contactTypeId, isActive },
      { enabled }
    )
  )
}

/**
 * Hook to fetch a single contact kind by ID.
 *
 * @example
 * ```tsx
 * const { data: contactKind } = useContactKind(contactKindId)
 * ```
 */
export function useContactKind(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.contactKinds.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new contact kind.
 */
export function useCreateContactKind() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.contactKinds.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.contactKinds.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing contact kind.
 */
export function useUpdateContactKind() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.contactKinds.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.contactKinds.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a contact kind.
 */
export function useDeleteContactKind() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.contactKinds.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.contactKinds.list.queryKey(),
      })
    },
  })
}
