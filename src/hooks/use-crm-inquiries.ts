import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Inquiry Hooks ====================

interface UseCrmInquiriesOptions {
  enabled?: boolean
  addressId?: string
  search?: string
  status?: "OPEN" | "IN_PROGRESS" | "CLOSED" | "CANCELLED"
  page?: number
  pageSize?: number
}

export function useCrmInquiries(options: UseCrmInquiriesOptions = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.crm.inquiries.list.queryOptions(
      {
        addressId: input.addressId,
        search: input.search,
        status: input.status,
        page: input.page ?? 1,
        pageSize: input.pageSize ?? 25,
      },
      { enabled }
    )
  )
}

export function useCrmInquiryById(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.crm.inquiries.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useCreateCrmInquiry() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.inquiries.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.inquiries.list.queryKey(),
      })
    },
  })
}

export function useUpdateCrmInquiry() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.inquiries.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.inquiries.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.inquiries.getById.queryKey(),
      })
    },
  })
}

export function useCloseCrmInquiry() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.inquiries.close.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.inquiries.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.inquiries.getById.queryKey(),
      })
    },
  })
}

export function useCancelCrmInquiry() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.inquiries.cancel.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.inquiries.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.inquiries.getById.queryKey(),
      })
    },
  })
}

export function useReopenCrmInquiry() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.inquiries.reopen.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.inquiries.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.inquiries.getById.queryKey(),
      })
    },
  })
}

export function useLinkCrmInquiryOrder() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.inquiries.linkOrder.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.inquiries.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.inquiries.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.orders.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.orders.getById.queryKey(),
      })
    },
  })
}

export function useCreateCrmInquiryOrder() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.inquiries.createOrder.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.inquiries.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.inquiries.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.orders.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.orders.getById.queryKey(),
      })
    },
  })
}

export function useDeleteCrmInquiry() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.inquiries.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.inquiries.list.queryKey(),
      })
    },
  })
}
