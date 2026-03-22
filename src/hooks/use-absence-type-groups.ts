import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

/**
 * Hook to fetch absence type groups.
 */
export function useAbsenceTypeGroups(
  options: {
    isActive?: boolean
    enabled?: boolean
  } = {}
) {
  const { isActive, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.absenceTypeGroups.list.queryOptions({ isActive }, { enabled })
  )
}

/**
 * Hook to fetch a single absence type group by ID.
 */
export function useAbsenceTypeGroup(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.absenceTypeGroups.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new absence type group.
 */
export function useCreateAbsenceTypeGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.absenceTypeGroups.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.absenceTypeGroups.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing absence type group.
 */
export function useUpdateAbsenceTypeGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.absenceTypeGroups.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.absenceTypeGroups.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.absenceTypeGroups.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete an absence type group.
 */
export function useDeleteAbsenceTypeGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.absenceTypeGroups.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.absenceTypeGroups.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.absenceTypeGroups.getById.queryKey(),
      })
    },
  })
}
