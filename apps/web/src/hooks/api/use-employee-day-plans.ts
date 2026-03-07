import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// --- Query Hooks ---

interface UseEmployeeDayPlansOptions {
  employeeId?: string
  from?: string
  to?: string
  enabled?: boolean
}

/**
 * Hook to fetch list of employee day plans with date range filter (tRPC).
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmployeeDayPlans({
 *   from: '2026-01-01',
 *   to: '2026-01-31',
 * })
 * const plans = data?.data ?? []
 * ```
 */
export function useEmployeeDayPlans(options: UseEmployeeDayPlansOptions = {}) {
  const { employeeId, from, to, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.employeeDayPlans.list.queryOptions(
      { from: from ?? "", to: to ?? "", employeeId },
      { enabled: enabled && !!from && !!to }
    )
  )
}

/**
 * Hook to fetch day plans for a specific employee within a date range (tRPC).
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmployeeDayPlansForEmployee(employeeId, '2026-01-01', '2026-01-31')
 * ```
 */
export function useEmployeeDayPlansForEmployee(
  employeeId: string,
  from: string,
  to: string,
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.employeeDayPlans.forEmployee.queryOptions(
      { employeeId, from, to },
      { enabled: enabled && !!employeeId && !!from && !!to }
    )
  )
}

// --- Mutation Hooks ---

/**
 * Hook to create a single employee day plan (tRPC).
 *
 * @example
 * ```tsx
 * const createPlan = useCreateEmployeeDayPlan()
 * createPlan.mutate({
 *   employeeId: '...', planDate: '2026-01-15', dayPlanId: '...', source: 'manual'
 * })
 * ```
 */
export function useCreateEmployeeDayPlan() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeDayPlans.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeDayPlans.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employeeDayPlans.forEmployee.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing employee day plan by ID (tRPC).
 *
 * @example
 * ```tsx
 * const updatePlan = useUpdateEmployeeDayPlan()
 * updatePlan.mutate({ id: '...', dayPlanId: '...', source: 'manual' })
 * ```
 */
export function useUpdateEmployeeDayPlan() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeDayPlans.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeDayPlans.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employeeDayPlans.forEmployee.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employeeDayPlans.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to bulk create/upsert employee day plans (tRPC).
 *
 * @example
 * ```tsx
 * const bulkCreate = useBulkCreateEmployeeDayPlans()
 * bulkCreate.mutate({
 *   entries: [{ employeeId: '...', planDate: '2026-01-15', dayPlanId: '...', source: 'tariff' }]
 * })
 * ```
 */
export function useBulkCreateEmployeeDayPlans() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeDayPlans.bulkCreate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeDayPlans.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employeeDayPlans.forEmployee.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete employee day plans in a date range (tRPC).
 *
 * @example
 * ```tsx
 * const deleteRange = useDeleteEmployeeDayPlanRange()
 * deleteRange.mutate({ employeeId: '...', from: '2026-01-01', to: '2026-01-31' })
 * ```
 */
export function useDeleteEmployeeDayPlanRange() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeDayPlans.deleteRange.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeDayPlans.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employeeDayPlans.forEmployee.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a single employee day plan by ID (tRPC).
 *
 * @example
 * ```tsx
 * const deletePlan = useDeleteEmployeeDayPlan()
 * deletePlan.mutate({ id: '...' })
 * ```
 */
export function useDeleteEmployeeDayPlan() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeDayPlans.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeDayPlans.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employeeDayPlans.forEmployee.queryKey(),
      })
    },
  })
}

/**
 * Hook to generate employee day plans from tariff week plans (tRPC).
 * After generation, invalidates all employee day plan queries so views
 * (timesheet, day view, daily values) show the updated day plans.
 *
 * @example
 * ```tsx
 * const generate = useGenerateFromTariff()
 * generate.mutate({ overwriteTariffSource: true })
 * ```
 */
export function useGenerateFromTariff() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeDayPlans.generateFromTariff.mutationOptions(),
    onSuccess: () => {
      // Invalidate all employee day plan queries
      queryClient.invalidateQueries({
        queryKey: trpc.employeeDayPlans.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employeeDayPlans.forEmployee.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employeeDayPlans.getById.queryKey(),
      })
    },
  })
}
