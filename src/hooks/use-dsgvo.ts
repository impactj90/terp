/**
 * DSGVO Retention Hooks
 *
 * React hooks wrapping tRPC queries/mutations for DSGVO data retention
 * rules, preview, execution, and deletion logs.
 */
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useDsgvoRules() {
  const trpc = useTRPC()
  return useQuery(trpc.dsgvo.rules.list.queryOptions({}))
}

export function useUpdateDsgvoRule() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.dsgvo.rules.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.dsgvo.rules.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.dsgvo.preview.queryKey(),
      })
    },
  })
}

export function useDsgvoPreview(dataType?: string) {
  const trpc = useTRPC()
  return useQuery(trpc.dsgvo.preview.queryOptions({ dataType }))
}

export function useExecuteDsgvoRetention() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.dsgvo.execute.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.dsgvo.logs.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.dsgvo.preview.queryKey(),
      })
    },
  })
}

export function useDsgvoLogs(
  params?: { page?: number; pageSize?: number }
) {
  const trpc = useTRPC()
  return useQuery(trpc.dsgvo.logs.list.queryOptions(params))
}
