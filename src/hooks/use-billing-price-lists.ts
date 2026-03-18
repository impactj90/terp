import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Billing Price List Hooks ====================

interface UseBillingPriceListsOptions {
  enabled?: boolean
  isActive?: boolean
  search?: string
  page?: number
  pageSize?: number
}

export function useBillingPriceLists(options: UseBillingPriceListsOptions = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.priceLists.list.queryOptions(
      { isActive: input.isActive, search: input.search, page: input.page ?? 1, pageSize: input.pageSize ?? 25 },
      { enabled }
    )
  )
}

export function useBillingPriceList(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.priceLists.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useBillingPriceLookup(input: { addressId: string; articleId?: string; itemKey?: string; quantity?: number }, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.priceLists.lookupPrice.queryOptions(
      input,
      { enabled: enabled && !!input.addressId && !!(input.articleId || input.itemKey) }
    )
  )
}

export function usePriceListEntriesForAddress(addressId: string | undefined, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.priceLists.entriesForAddress.queryOptions(
      { addressId: addressId! },
      { enabled: enabled && !!addressId }
    )
  )
}

export function useCreateBillingPriceList() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.priceLists.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.list.queryKey() })
    },
  })
}

export function useUpdateBillingPriceList() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.priceLists.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.getById.queryKey() })
    },
  })
}

export function useDeleteBillingPriceList() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.priceLists.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.list.queryKey() })
    },
  })
}

export function useSetDefaultBillingPriceList() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.priceLists.setDefault.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.getById.queryKey() })
    },
  })
}

// --- Entry Hooks ---

export function useBillingPriceListEntries(priceListId: string, search?: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.priceLists.entries.list.queryOptions(
      { priceListId, search },
      { enabled: enabled && !!priceListId }
    )
  )
}

export function useCreateBillingPriceListEntry() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.priceLists.entries.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.entries.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.getById.queryKey() })
    },
  })
}

export function useUpdateBillingPriceListEntry() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.priceLists.entries.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.entries.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.getById.queryKey() })
    },
  })
}

export function useDeleteBillingPriceListEntry() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.priceLists.entries.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.entries.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.getById.queryKey() })
    },
  })
}

export function useBulkImportBillingPriceListEntries() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.priceLists.entries.bulkImport.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.entries.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.getById.queryKey() })
    },
  })
}
