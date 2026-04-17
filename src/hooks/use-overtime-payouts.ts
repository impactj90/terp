import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

interface UseOvertimePayoutsOptions {
  year?: number
  month?: number
  status?: "pending" | "approved" | "rejected"
  departmentId?: string
  employeeId?: string
  enabled?: boolean
}

export function useOvertimePayouts(options: UseOvertimePayoutsOptions = {}) {
  const { year, month, status, departmentId, employeeId, enabled = true } = options
  const trpc = useTRPC()
  return useQuery({
    ...trpc.overtimePayouts.list.queryOptions(
      { year, month, status, departmentId, employeeId },
      { enabled }
    ),
  })
}

export function useOvertimePayout(id: string | undefined) {
  const trpc = useTRPC()
  return useQuery({
    ...trpc.overtimePayouts.getById.queryOptions(
      { id: id! },
      { enabled: !!id }
    ),
  })
}

export function useCountPendingPayouts(params?: { year?: number; month?: number }) {
  const trpc = useTRPC()
  return useQuery({
    ...trpc.overtimePayouts.countPending.queryOptions(params),
  })
}

export function useApproveOvertimePayout() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.overtimePayouts.approve.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [["overtimePayouts"]] })
      queryClient.invalidateQueries({ queryKey: [["monthlyValues"]] })
    },
  })
}

export function useRejectOvertimePayout() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.overtimePayouts.reject.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [["overtimePayouts"]] })
    },
  })
}

export function useBatchApproveOvertimePayouts() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.overtimePayouts.approveBatch.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [["overtimePayouts"]] })
      queryClient.invalidateQueries({ queryKey: [["monthlyValues"]] })
    },
  })
}
