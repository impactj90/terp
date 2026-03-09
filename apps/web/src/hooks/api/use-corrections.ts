import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

interface UseCorrectionsOptions {
  employeeId?: string
  fromDate?: string
  toDate?: string
  correctionType?: string
  status?: string
  pageSize?: number
  page?: number
  enabled?: boolean
}

/**
 * Hook to fetch paginated list of corrections.
 *
 * @example
 * ```tsx
 * const { data } = useCorrections({ employeeId, status: 'pending' })
 * const corrections = data?.items ?? []
 * ```
 */
export function useCorrections(options: UseCorrectionsOptions = {}) {
  const { enabled = true, ...params } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.corrections.list.queryOptions(
      {
        employeeId: params.employeeId,
        fromDate: params.fromDate,
        toDate: params.toDate,
        correctionType: params.correctionType,
        status: params.status,
        pageSize: params.pageSize,
        page: params.page,
      },
      { enabled }
    )
  )
}

/**
 * Hook to fetch a single correction by ID.
 */
export function useCorrection(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.corrections.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

/**
 * Hook to create a new correction.
 */
export function useCreateCorrection() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.corrections.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.corrections.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.corrections.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.correctionAssistant.listItems.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing correction.
 */
export function useUpdateCorrection() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.corrections.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.corrections.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.corrections.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.correctionAssistant.listItems.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a correction.
 */
export function useDeleteCorrection() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.corrections.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.corrections.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.corrections.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.correctionAssistant.listItems.queryKey(),
      })
    },
  })
}

/**
 * Hook to approve a pending correction.
 * Triggers recalculation on the server side.
 */
export function useApproveCorrection() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.corrections.approve.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.corrections.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.corrections.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.correctionAssistant.listItems.queryKey(),
      })
      // Approve triggers recalc which changes daily values
      queryClient.invalidateQueries({
        queryKey: trpc.dailyValues.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to reject a pending correction.
 */
export function useRejectCorrection() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.corrections.reject.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.corrections.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.corrections.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.correctionAssistant.listItems.queryKey(),
      })
    },
  })
}
