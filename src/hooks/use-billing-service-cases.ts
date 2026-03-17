import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Billing Service Case Hooks ====================

interface UseBillingServiceCasesOptions {
  enabled?: boolean
  status?: "OPEN" | "IN_PROGRESS" | "CLOSED" | "INVOICED"
  addressId?: string
  assignedToId?: string
  search?: string
  page?: number
  pageSize?: number
}

export function useBillingServiceCases(options: UseBillingServiceCasesOptions = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.serviceCases.list.queryOptions(
      {
        status: input.status,
        addressId: input.addressId,
        assignedToId: input.assignedToId,
        search: input.search,
        page: input.page ?? 1,
        pageSize: input.pageSize ?? 25,
      },
      { enabled }
    )
  )
}

export function useBillingServiceCase(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.serviceCases.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useCreateBillingServiceCase() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.serviceCases.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.serviceCases.list.queryKey(),
      })
    },
  })
}

export function useUpdateBillingServiceCase() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.serviceCases.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.serviceCases.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.serviceCases.getById.queryKey(),
      })
    },
  })
}

export function useCloseBillingServiceCase() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.serviceCases.close.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.serviceCases.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.serviceCases.getById.queryKey(),
      })
    },
  })
}

export function useCreateInvoiceFromServiceCase() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.serviceCases.createInvoice.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.serviceCases.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.serviceCases.getById.queryKey(),
      })
    },
  })
}

export function useCreateOrderFromServiceCase() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.serviceCases.createOrder.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.serviceCases.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.serviceCases.getById.queryKey(),
      })
    },
  })
}

export function useDeleteBillingServiceCase() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.serviceCases.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.serviceCases.list.queryKey(),
      })
    },
  })
}
