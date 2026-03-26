import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// --- Query Hooks ---

interface UseWhCorrectionMessagesOptions {
  status?: "OPEN" | "RESOLVED" | "DISMISSED" | "IGNORED"
  severity?: "ERROR" | "WARNING" | "INFO"
  code?: string
  articleId?: string
  page?: number
  pageSize?: number
  enabled?: boolean
}

export function useWhCorrectionMessages(options: UseWhCorrectionMessagesOptions = {}) {
  const { enabled = true, ...params } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.corrections.messages.list.queryOptions(
      {
        status: params.status,
        severity: params.severity,
        code: params.code,
        articleId: params.articleId,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 25,
      },
      { enabled }
    )
  )
}

export function useWhCorrectionMessageById(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.corrections.messages.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useWhCorrectionSummary(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.corrections.summary.queryOptions(
      undefined,
      { enabled }
    )
  )
}

interface UseWhCorrectionRunsOptions {
  page?: number
  pageSize?: number
  enabled?: boolean
}

export function useWhCorrectionRuns(options: UseWhCorrectionRunsOptions = {}) {
  const { enabled = true, ...params } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.corrections.runs.list.queryOptions(
      { page: params.page ?? 1, pageSize: params.pageSize ?? 10 },
      { enabled }
    )
  )
}

// --- Mutation Hooks ---

export function useResolveWhCorrection() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.corrections.messages.resolve.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.corrections.messages.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.corrections.summary.queryKey() })
    },
  })
}

export function useDismissWhCorrection() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.corrections.messages.dismiss.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.corrections.messages.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.corrections.summary.queryKey() })
    },
  })
}

export function useResolveBulkWhCorrection() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.corrections.messages.resolveBulk.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.corrections.messages.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.corrections.summary.queryKey() })
    },
  })
}

export function useTriggerWhCorrectionRun() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.corrections.runs.trigger.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.corrections.messages.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.corrections.summary.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.corrections.runs.list.queryKey() })
    },
  })
}
