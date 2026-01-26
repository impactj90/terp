import { useApiQuery, useApiMutation } from '@/hooks'

interface UseTariffsOptions {
  active?: boolean
  enabled?: boolean
}

/**
 * Hook to fetch list of tariffs with optional filters.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useTariffs({
 *   active: true,
 * })
 * ```
 */
export function useTariffs(options: UseTariffsOptions = {}) {
  const { active, enabled = true } = options

  return useApiQuery('/tariffs', {
    params: {
      active,
    },
    enabled,
  })
}

/**
 * Hook to fetch a single tariff by ID with breaks.
 *
 * @example
 * ```tsx
 * const { data: tariff, isLoading } = useTariff(tariffId)
 * ```
 */
export function useTariff(id: string, enabled = true) {
  return useApiQuery('/tariffs/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to create a new tariff.
 *
 * @example
 * ```tsx
 * const createTariff = useCreateTariff()
 * createTariff.mutate({
 *   body: { code: 'TARIFF-001', name: 'Standard Tariff' }
 * })
 * ```
 */
export function useCreateTariff() {
  return useApiMutation('/tariffs', 'post', {
    invalidateKeys: [['/tariffs']],
  })
}

/**
 * Hook to update an existing tariff.
 *
 * @example
 * ```tsx
 * const updateTariff = useUpdateTariff()
 * updateTariff.mutate({
 *   path: { id: tariffId },
 *   body: { name: 'Updated Name' }
 * })
 * ```
 */
export function useUpdateTariff() {
  return useApiMutation('/tariffs/{id}', 'put', {
    invalidateKeys: [['/tariffs']],
  })
}

/**
 * Hook to delete a tariff.
 *
 * @example
 * ```tsx
 * const deleteTariff = useDeleteTariff()
 * deleteTariff.mutate({ path: { id: tariffId } })
 * ```
 */
export function useDeleteTariff() {
  return useApiMutation('/tariffs/{id}', 'delete', {
    invalidateKeys: [['/tariffs']],
  })
}

/**
 * Hook to add a break to a tariff.
 *
 * @example
 * ```tsx
 * const createBreak = useCreateTariffBreak()
 * createBreak.mutate({
 *   path: { id: tariffId },
 *   body: { break_type: 'minimum', after_work_minutes: 300, duration: 30 }
 * })
 * ```
 */
export function useCreateTariffBreak() {
  return useApiMutation('/tariffs/{id}/breaks', 'post', {
    invalidateKeys: [['/tariffs']],
  })
}

/**
 * Hook to delete a break from a tariff.
 *
 * @example
 * ```tsx
 * const deleteBreak = useDeleteTariffBreak()
 * deleteBreak.mutate({ path: { id: tariffId, breakId: breakId } })
 * ```
 */
export function useDeleteTariffBreak() {
  return useApiMutation('/tariffs/{id}/breaks/{breakId}', 'delete', {
    invalidateKeys: [['/tariffs']],
  })
}
