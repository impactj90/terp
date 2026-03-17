import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Correspondence Hooks ====================

interface UseCrmCorrespondenceOptions {
  enabled?: boolean
  addressId?: string
  inquiryId?: string
  search?: string
  direction?: "INCOMING" | "OUTGOING" | "INTERNAL"
  type?: string
  dateFrom?: Date
  dateTo?: Date
  page?: number
  pageSize?: number
}

export function useCrmCorrespondence(options: UseCrmCorrespondenceOptions = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.crm.correspondence.list.queryOptions(
      {
        addressId: input.addressId,
        inquiryId: input.inquiryId,
        search: input.search,
        direction: input.direction,
        type: input.type,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        page: input.page ?? 1,
        pageSize: input.pageSize ?? 25,
      },
      { enabled }
    )
  )
}

export function useCrmCorrespondenceById(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.crm.correspondence.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useCreateCrmCorrespondence() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.correspondence.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.correspondence.list.queryKey(),
      })
    },
  })
}

export function useUpdateCrmCorrespondence() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.correspondence.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.correspondence.list.queryKey(),
      })
    },
  })
}

export function useDeleteCrmCorrespondence() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.correspondence.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.correspondence.list.queryKey(),
      })
    },
  })
}
