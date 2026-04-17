import { useTRPC } from "@/trpc"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

export function useEmployeeOvertimePayoutOverride(
  employeeId: string | undefined,
  enabled = true,
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.employeeOvertimePayoutOverrides.getByEmployeeId.queryOptions(
      { employeeId: employeeId! },
      { enabled: enabled && !!employeeId },
    ),
  )
}

export function useCreateEmployeeOvertimePayoutOverride() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeOvertimePayoutOverrides.create.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeOvertimePayoutOverrides.getByEmployeeId.queryKey({
          employeeId: variables.employeeId,
        }),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employeeOvertimePayoutOverrides.list.queryKey(),
      })
    },
  })
}

export function useUpdateEmployeeOvertimePayoutOverride() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeOvertimePayoutOverrides.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeOvertimePayoutOverrides.getByEmployeeId.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employeeOvertimePayoutOverrides.list.queryKey(),
      })
    },
  })
}

export function useDeleteEmployeeOvertimePayoutOverride() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeOvertimePayoutOverrides.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeOvertimePayoutOverrides.getByEmployeeId.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employeeOvertimePayoutOverrides.list.queryKey(),
      })
    },
  })
}
