import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useApprovalPolicies(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.invoices.approvalPolicy.list.queryOptions(undefined, { enabled })
  )
}

export function useCreateApprovalPolicy() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.invoices.approvalPolicy.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.invoices.approvalPolicy.list.queryKey(),
      })
    },
  })
}

export function useUpdateApprovalPolicy() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.invoices.approvalPolicy.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.invoices.approvalPolicy.list.queryKey(),
      })
    },
  })
}

export function useRemoveApprovalPolicy() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.invoices.approvalPolicy.remove.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.invoices.approvalPolicy.list.queryKey(),
      })
    },
  })
}
