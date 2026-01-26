import { useApiQuery, useApiMutation } from '@/hooks'

interface UseWeekPlansOptions {
  active?: boolean
  enabled?: boolean
}

/**
 * Hook to fetch list of week plans with optional filters.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useWeekPlans({
 *   active: true,
 * })
 * ```
 */
export function useWeekPlans(options: UseWeekPlansOptions = {}) {
  const { active, enabled = true } = options

  return useApiQuery('/week-plans', {
    params: { active },
    enabled,
  })
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
  return useApiQuery('/week-plans/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to create a new week plan.
 *
 * @example
 * ```tsx
 * const createWeekPlan = useCreateWeekPlan()
 * createWeekPlan.mutate({
 *   body: { code: 'WEEK-1', name: 'Standard Week', monday_day_plan_id: '...' }
 * })
 * ```
 */
export function useCreateWeekPlan() {
  return useApiMutation('/week-plans', 'post', {
    invalidateKeys: [['/week-plans']],
  })
}

/**
 * Hook to update an existing week plan.
 *
 * @example
 * ```tsx
 * const updateWeekPlan = useUpdateWeekPlan()
 * updateWeekPlan.mutate({
 *   path: { id: weekPlanId },
 *   body: { name: 'Updated Name' }
 * })
 * ```
 */
export function useUpdateWeekPlan() {
  return useApiMutation('/week-plans/{id}', 'put', {
    invalidateKeys: [['/week-plans']],
  })
}

/**
 * Hook to delete a week plan.
 *
 * @example
 * ```tsx
 * const deleteWeekPlan = useDeleteWeekPlan()
 * deleteWeekPlan.mutate({ path: { id: weekPlanId } })
 * ```
 */
export function useDeleteWeekPlan() {
  return useApiMutation('/week-plans/{id}', 'delete', {
    invalidateKeys: [['/week-plans']],
  })
}
