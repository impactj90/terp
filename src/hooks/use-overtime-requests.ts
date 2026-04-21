import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

interface UseOvertimeRequestsOptions {
  employeeId?: string
  status?: "pending" | "approved" | "rejected" | "cancelled"
  requestType?: "PLANNED" | "REOPEN"
  from?: string
  to?: string
  page?: number
  pageSize?: number
  enabled?: boolean
}

export function useOvertimeRequests(options: UseOvertimeRequestsOptions = {}) {
  const { enabled = true, ...params } = options
  const trpc = useTRPC()
  return useQuery({
    ...trpc.overtimeRequests.list.queryOptions(params, { enabled }),
  })
}

export function useOvertimeRequest(id: string | undefined) {
  const trpc = useTRPC()
  return useQuery({
    ...trpc.overtimeRequests.getById.queryOptions(
      { id: id! },
      { enabled: !!id }
    ),
  })
}

export function usePendingOvertimeRequestCount(enabled = true) {
  const trpc = useTRPC()
  return useQuery({
    ...trpc.overtimeRequests.pendingCount.queryOptions(undefined, { enabled }),
  })
}

function useOvertimeInvalidation() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({
      queryKey: trpc.overtimeRequests.list.queryKey(),
    })
    queryClient.invalidateQueries({
      queryKey: trpc.overtimeRequests.getById.queryKey(),
    })
    queryClient.invalidateQueries({
      queryKey: trpc.overtimeRequests.pendingCount.queryKey(),
    })
  }
}

export function useCreateOvertimeRequest() {
  const trpc = useTRPC()
  const invalidate = useOvertimeInvalidation()
  return useMutation({
    ...trpc.overtimeRequests.create.mutationOptions(),
    onSuccess: invalidate,
  })
}

export function useApproveOvertimeRequest() {
  const trpc = useTRPC()
  const invalidate = useOvertimeInvalidation()
  return useMutation({
    ...trpc.overtimeRequests.approve.mutationOptions(),
    onSuccess: invalidate,
  })
}

export function useRejectOvertimeRequest() {
  const trpc = useTRPC()
  const invalidate = useOvertimeInvalidation()
  return useMutation({
    ...trpc.overtimeRequests.reject.mutationOptions(),
    onSuccess: invalidate,
  })
}

export function useCancelOvertimeRequest() {
  const trpc = useTRPC()
  const invalidate = useOvertimeInvalidation()
  return useMutation({
    ...trpc.overtimeRequests.cancel.mutationOptions(),
    onSuccess: invalidate,
  })
}

export function useOvertimeRequestConfig(enabled = true) {
  const trpc = useTRPC()
  return useQuery({
    ...trpc.overtimeRequestConfig.get.queryOptions(undefined, { enabled }),
  })
}

export function useOvertimeRequestConfigPublic(enabled = true) {
  const trpc = useTRPC()
  return useQuery({
    ...trpc.overtimeRequestConfig.getPublic.queryOptions(undefined, { enabled }),
  })
}

export function usePendingReopenCount(enabled = true) {
  const trpc = useTRPC()
  return useQuery({
    ...trpc.overtimeRequestConfig.pendingReopenCount.queryOptions(undefined, {
      enabled,
    }),
  })
}

export function useUpdateOvertimeRequestConfig() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.overtimeRequestConfig.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.overtimeRequestConfig.get.queryKey(),
      })
    },
  })
}

export function useApproveAsOvertime() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.correctionAssistant.approveAsOvertime.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.correctionAssistant.listItems.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.overtimeRequests.list.queryKey(),
      })
    },
  })
}
