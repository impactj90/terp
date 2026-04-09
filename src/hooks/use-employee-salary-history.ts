import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useEmployeeSalaryHistory(employeeId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.employeeSalaryHistory.list.queryOptions(
      { employeeId },
      { enabled: enabled && !!employeeId },
    ),
  )
}

function useInvalidate(employeeId: string) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({
      queryKey: trpc.employeeSalaryHistory.list.queryKey({ employeeId }),
    })
    queryClient.invalidateQueries({
      queryKey: trpc.employees.getById.queryKey({ id: employeeId }),
    })
  }
}

export function useCreateSalaryHistoryEntry(employeeId: string) {
  const trpc = useTRPC()
  const invalidate = useInvalidate(employeeId)
  return useMutation({
    ...trpc.employeeSalaryHistory.create.mutationOptions(),
    onSuccess: invalidate,
  })
}

export function useUpdateSalaryHistoryEntry(employeeId: string) {
  const trpc = useTRPC()
  const invalidate = useInvalidate(employeeId)
  return useMutation({
    ...trpc.employeeSalaryHistory.update.mutationOptions(),
    onSuccess: invalidate,
  })
}

export function useDeleteSalaryHistoryEntry(employeeId: string) {
  const trpc = useTRPC()
  const invalidate = useInvalidate(employeeId)
  return useMutation({
    ...trpc.employeeSalaryHistory.delete.mutationOptions(),
    onSuccess: invalidate,
  })
}
