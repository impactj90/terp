import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

/**
 * Hook to fetch list of day plans with optional filters.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useDayPlans({ active: true, planType: 'fixed' })
 * const dayPlans = data?.data ?? []
 * ```
 */
export function useDayPlans(
  options: {
    active?: boolean
    planType?: string
    enabled?: boolean
  } = {}
) {
  const { active, planType, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.dayPlans.list.queryOptions(
      { isActive: active, planType },
      { enabled }
    )
  )
}

/**
 * Hook to fetch a single day plan by ID with breaks and bonuses.
 *
 * @example
 * ```tsx
 * const { data: dayPlan, isLoading } = useDayPlan(dayPlanId)
 * ```
 */
export function useDayPlan(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.dayPlans.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

/**
 * Hook to create a new day plan.
 */
export function useCreateDayPlan() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.dayPlans.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.dayPlans.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.dayPlans.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing day plan.
 */
export function useUpdateDayPlan() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.dayPlans.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.dayPlans.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.dayPlans.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employees.dayView.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a day plan.
 */
export function useDeleteDayPlan() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.dayPlans.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.dayPlans.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.dayPlans.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employees.dayView.queryKey(),
      })
    },
  })
}

/**
 * Hook to copy a day plan with a new code and name.
 */
export function useCopyDayPlan() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.dayPlans.copy.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.dayPlans.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.dayPlans.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to add a break to a day plan.
 */
export function useCreateDayPlanBreak() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.dayPlans.createBreak.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.dayPlans.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.dayPlans.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employees.dayView.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a break from a day plan.
 */
export function useDeleteDayPlanBreak() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.dayPlans.deleteBreak.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.dayPlans.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.dayPlans.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employees.dayView.queryKey(),
      })
    },
  })
}

/**
 * Hook to add a bonus/surcharge to a day plan.
 */
export function useCreateDayPlanBonus() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.dayPlans.createBonus.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.dayPlans.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.dayPlans.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employees.dayView.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing bonus/surcharge on a day plan.
 */
export function useUpdateDayPlanBonus() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.dayPlans.updateBonus.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.dayPlans.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.dayPlans.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employees.dayView.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a bonus/surcharge from a day plan.
 */
export function useDeleteDayPlanBonus() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.dayPlans.deleteBonus.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.dayPlans.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.dayPlans.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employees.dayView.queryKey(),
      })
    },
  })
}
