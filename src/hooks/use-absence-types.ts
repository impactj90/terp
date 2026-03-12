import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

/**
 * Hook to fetch absence types (tRPC).
 *
 * Includes system types by default. Supports optional filters.
 */
export function useAbsenceTypes(
  options: {
    isActive?: boolean
    category?: string
    includeSystem?: boolean
    enabled?: boolean
  } = {}
) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.absenceTypes.list.queryOptions(
      Object.keys(input).length > 0 ? input : undefined,
      { enabled }
    )
  )
}

/**
 * Hook to fetch a single absence type by ID (tRPC).
 */
export function useAbsenceType(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.absenceTypes.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new absence type (tRPC).
 */
export function useCreateAbsenceType() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.absenceTypes.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.absenceTypes.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.absenceTypes.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing absence type (tRPC).
 */
export function useUpdateAbsenceType() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.absenceTypes.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.absenceTypes.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.absenceTypes.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete an absence type (tRPC).
 */
export function useDeleteAbsenceType() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.absenceTypes.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.absenceTypes.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.absenceTypes.getById.queryKey(),
      })
    },
  })
}
