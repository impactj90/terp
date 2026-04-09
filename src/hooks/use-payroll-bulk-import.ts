import { useTRPC } from "@/trpc"
import { useMutation, useQueryClient } from "@tanstack/react-query"

export function useParsePayrollBulkFile() {
  const trpc = useTRPC()
  return useMutation(trpc.payrollBulkImport.parseFile.mutationOptions())
}

export function useConfirmPayrollBulkImport() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.payrollBulkImport.confirmImport.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employees.list.queryKey(),
      })
    },
  })
}
