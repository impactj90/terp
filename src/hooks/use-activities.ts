import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

/**
 * Hook to fetch list of activities.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useActivities()
 * const activities = data?.data ?? []
 * ```
 */
export function useActivities(
  options: { isActive?: boolean; enabled?: boolean } = {}
) {
  const { isActive, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.activities.list.queryOptions({ isActive }, { enabled })
  )
}

/**
 * Hook to fetch a single activity by ID.
 *
 * @example
 * ```tsx
 * const { data: activity, isLoading } = useActivity(activityId)
 * ```
 */
export function useActivity(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.activities.getById.queryOptions({ id }, { enabled: enabled && !!id })
  )
}

export function useCreateActivity() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.activities.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.activities.list.queryKey(),
      })
    },
  })
}

export function useUpdateActivity() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.activities.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.activities.list.queryKey(),
      })
    },
  })
}

export function useDeleteActivity() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.activities.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.activities.list.queryKey(),
      })
    },
  })
}
