import { useApiQuery, useApiMutation } from '@/hooks'

interface UseActivitiesOptions {
  active?: boolean
  enabled?: boolean
}

/**
 * Hook to fetch list of activities.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useActivities()
 * const activities = data?.data ?? []
 * ```
 */
export function useActivities(options: UseActivitiesOptions = {}) {
  const { active, enabled = true } = options

  return useApiQuery('/activities', {
    params: { active },
    enabled,
  })
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
  return useApiQuery('/activities/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateActivity() {
  return useApiMutation('/activities', 'post', {
    invalidateKeys: [['/activities']],
  })
}

export function useUpdateActivity() {
  return useApiMutation('/activities/{id}', 'patch', {
    invalidateKeys: [['/activities']],
  })
}

export function useDeleteActivity() {
  return useApiMutation('/activities/{id}', 'delete', {
    invalidateKeys: [['/activities']],
  })
}
