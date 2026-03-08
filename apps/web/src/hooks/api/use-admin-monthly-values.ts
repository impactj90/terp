import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// --- Interfaces ---

interface UseAdminMonthlyValuesOptions {
  year?: number
  month?: number
  status?: "open" | "calculated" | "closed" | "exported"
  departmentId?: string
  employeeId?: string
  enabled?: boolean
}

// --- Query Hooks ---

/**
 * List all monthly values with filters (admin view).
 * Uses tRPC monthlyValues.list query.
 */
export function useAdminMonthlyValues(
  options: UseAdminMonthlyValuesOptions = {}
) {
  const { year, month, status, departmentId, employeeId, enabled = true } =
    options
  const trpc = useTRPC()

  return useQuery({
    ...trpc.monthlyValues.list.queryOptions(
      {
        year: year!,
        month: month!,
        status: status as "open" | "calculated" | "closed" | undefined,
        departmentId,
        employeeId,
      },
      { enabled: enabled && !!year && !!month }
    ),
  })
}

/**
 * Get a single monthly value by ID.
 * Uses tRPC monthlyValues.getById query.
 */
export function useMonthlyValueById(id: string | undefined) {
  const trpc = useTRPC()

  return useQuery({
    ...trpc.monthlyValues.getById.queryOptions(
      { id: id! },
      { enabled: !!id }
    ),
  })
}

// --- Mutation Hooks ---

/**
 * Close a single month by monthly value ID.
 * Uses tRPC monthlyValues.close mutation with { id } input.
 */
export function useCloseMonthById() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  return useMutation({
    ...trpc.monthlyValues.close.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.monthlyValues.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.monthlyValues.getById.queryKey(),
      })
    },
  })
}

/**
 * Reopen a single month by monthly value ID.
 * Uses tRPC monthlyValues.reopen mutation with { id } input.
 */
export function useReopenMonthById() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  return useMutation({
    ...trpc.monthlyValues.reopen.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.monthlyValues.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.monthlyValues.getById.queryKey(),
      })
    },
  })
}

/**
 * Batch close monthly values.
 * Uses tRPC monthlyValues.closeBatch mutation.
 */
export function useCloseMonthBatch() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  return useMutation({
    ...trpc.monthlyValues.closeBatch.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.monthlyValues.list.queryKey(),
      })
    },
  })
}

/**
 * Recalculate monthly values.
 * Uses tRPC monthlyValues.recalculate mutation.
 */
export function useRecalculateMonthlyValues() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  return useMutation({
    ...trpc.monthlyValues.recalculate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.monthlyValues.list.queryKey(),
      })
    },
  })
}
