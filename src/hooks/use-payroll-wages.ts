import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function usePayrollWages(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.payrollWages.list.queryOptions(undefined, { enabled }),
  )
}

export function useDefaultPayrollWages(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.payrollWages.listDefaults.queryOptions(undefined, { enabled }),
  )
}

export function useInitializePayrollWages() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.payrollWages.initialize.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.payrollWages.list.queryKey(),
      })
    },
  })
}

export function useUpdatePayrollWage() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.payrollWages.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.payrollWages.list.queryKey(),
      })
    },
  })
}

export function useResetPayrollWages() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.payrollWages.reset.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.payrollWages.list.queryKey(),
      })
    },
  })
}
