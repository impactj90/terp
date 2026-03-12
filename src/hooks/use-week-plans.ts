import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

/**
 * Hook to fetch list of week plans with optional filters.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useWeekPlans({ active: true })
 * const weekPlans = data?.data ?? []
 * ```
 */
export function useWeekPlans(
  options: {
    active?: boolean
    enabled?: boolean
  } = {}
) {
  const { active, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.weekPlans.list.queryOptions(
      { isActive: active },
      { enabled }
    )
  )
}

/**
 * Hook to fetch a single week plan by ID with day plan relations.
 *
 * @example
 * ```tsx
 * const { data: weekPlan, isLoading } = useWeekPlan(weekPlanId)
 * ```
 */
export function useWeekPlan(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.weekPlans.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

/**
 * Hook to create a new week plan.
 */
export function useCreateWeekPlan() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.weekPlans.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.weekPlans.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.weekPlans.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing week plan.
 */
export function useUpdateWeekPlan() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.weekPlans.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.weekPlans.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.weekPlans.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a week plan.
 */
export function useDeleteWeekPlan() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.weekPlans.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.weekPlans.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.weekPlans.getById.queryKey(),
      })
    },
  })
}
