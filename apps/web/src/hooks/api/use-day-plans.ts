import { useApiQuery, useApiMutation } from '@/hooks'

interface UseDayPlansOptions {
  active?: boolean
  planType?: 'fixed' | 'flextime'
  enabled?: boolean
}

/**
 * Hook to fetch list of day plans with optional filters.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useDayPlans({
 *   active: true,
 *   planType: 'fixed',
 * })
 * ```
 */
export function useDayPlans(options: UseDayPlansOptions = {}) {
  const { active, planType, enabled = true } = options

  return useApiQuery('/day-plans', {
    params: {
      active,
      plan_type: planType,
    },
    enabled,
  })
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
  return useApiQuery('/day-plans/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to create a new day plan.
 *
 * @example
 * ```tsx
 * const createDayPlan = useCreateDayPlan()
 * createDayPlan.mutate({
 *   body: { code: 'STD-1', name: 'Standard Day', plan_type: 'fixed', regular_hours: 480 }
 * })
 * ```
 */
export function useCreateDayPlan() {
  return useApiMutation('/day-plans', 'post', {
    invalidateKeys: [['/day-plans']],
  })
}

/**
 * Hook to update an existing day plan.
 *
 * @example
 * ```tsx
 * const updateDayPlan = useUpdateDayPlan()
 * updateDayPlan.mutate({
 *   path: { id: dayPlanId },
 *   body: { name: 'Updated Name' }
 * })
 * ```
 */
export function useUpdateDayPlan() {
  return useApiMutation('/day-plans/{id}', 'put', {
    invalidateKeys: [['/day-plans']],
  })
}

/**
 * Hook to delete a day plan.
 *
 * @example
 * ```tsx
 * const deleteDayPlan = useDeleteDayPlan()
 * deleteDayPlan.mutate({ path: { id: dayPlanId } })
 * ```
 */
export function useDeleteDayPlan() {
  return useApiMutation('/day-plans/{id}', 'delete', {
    invalidateKeys: [['/day-plans']],
  })
}

/**
 * Hook to copy a day plan with a new code and name.
 *
 * @example
 * ```tsx
 * const copyDayPlan = useCopyDayPlan()
 * copyDayPlan.mutate({
 *   path: { id: dayPlanId },
 *   body: { new_code: 'STD-2', new_name: 'Standard Day Copy' }
 * })
 * ```
 */
export function useCopyDayPlan() {
  return useApiMutation('/day-plans/{id}/copy', 'post', {
    invalidateKeys: [['/day-plans']],
  })
}

/**
 * Hook to add a break to a day plan.
 *
 * @example
 * ```tsx
 * const createBreak = useCreateDayPlanBreak()
 * createBreak.mutate({
 *   path: { id: dayPlanId },
 *   body: { break_type: 'fixed', duration: 30 }
 * })
 * ```
 */
export function useCreateDayPlanBreak() {
  return useApiMutation('/day-plans/{id}/breaks', 'post', {
    invalidateKeys: [['/day-plans']],
  })
}

/**
 * Hook to delete a break from a day plan.
 *
 * @example
 * ```tsx
 * const deleteBreak = useDeleteDayPlanBreak()
 * deleteBreak.mutate({ path: { id: dayPlanId, breakId: breakId } })
 * ```
 */
export function useDeleteDayPlanBreak() {
  return useApiMutation('/day-plans/{id}/breaks/{breakId}', 'delete', {
    invalidateKeys: [['/day-plans']],
  })
}

/**
 * Hook to add a bonus/surcharge to a day plan.
 *
 * @example
 * ```tsx
 * const createBonus = useCreateDayPlanBonus()
 * createBonus.mutate({
 *   path: { id: dayPlanId },
 *   body: { account_id: accountId, time_from: 1320, time_to: 1440, calculation_type: 'per_minute', value_minutes: 15 }
 * })
 * ```
 */
export function useCreateDayPlanBonus() {
  return useApiMutation('/day-plans/{id}/bonuses', 'post', {
    invalidateKeys: [['/day-plans']],
  })
}

/**
 * Hook to delete a bonus/surcharge from a day plan.
 *
 * @example
 * ```tsx
 * const deleteBonus = useDeleteDayPlanBonus()
 * deleteBonus.mutate({ path: { id: dayPlanId, bonusId: bonusId } })
 * ```
 */
export function useDeleteDayPlanBonus() {
  return useApiMutation('/day-plans/{id}/bonuses/{bonusId}', 'delete', {
    invalidateKeys: [['/day-plans']],
  })
}
