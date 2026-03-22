import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Address Hooks ====================

interface UseCrmAddressesOptions {
  search?: string
  type?: "CUSTOMER" | "SUPPLIER" | "BOTH"
  isActive?: boolean
  page?: number
  pageSize?: number
  enabled?: boolean
}

export function useCrmAddresses(options: UseCrmAddressesOptions = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.crm.addresses.list.queryOptions(
      {
        search: input.search,
        type: input.type,
        isActive: input.isActive,
        page: input.page ?? 1,
        pageSize: input.pageSize ?? 25,
      },
      { enabled }
    )
  )
}

export function useCrmAddress(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.crm.addresses.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useCreateCrmAddress() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.addresses.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.list.queryKey(),
      })
    },
  })
}

export function useUpdateCrmAddress() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.addresses.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.getById.queryKey(),
      })
    },
  })
}

export function useDeleteCrmAddress() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.addresses.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.getById.queryKey(),
      })
    },
  })
}

export function useRestoreCrmAddress() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.addresses.restore.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.getById.queryKey(),
      })
    },
  })
}

// ==================== Contact Hooks ====================

export function useCrmContacts(addressId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.crm.addresses.contactsList.queryOptions(
      { addressId },
      { enabled: enabled && !!addressId }
    )
  )
}

export function useCreateCrmContact() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.addresses.contactsCreate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.contactsList.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.getById.queryKey(),
      })
    },
  })
}

export function useUpdateCrmContact() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.addresses.contactsUpdate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.contactsList.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.getById.queryKey(),
      })
    },
  })
}

export function useDeleteCrmContact() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.addresses.contactsDelete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.contactsList.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.getById.queryKey(),
      })
    },
  })
}

// ==================== Bank Account Hooks ====================

export function useCrmBankAccounts(addressId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.crm.addresses.bankAccountsList.queryOptions(
      { addressId },
      { enabled: enabled && !!addressId }
    )
  )
}

export function useCreateCrmBankAccount() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.addresses.bankAccountsCreate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.bankAccountsList.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.getById.queryKey(),
      })
    },
  })
}

export function useUpdateCrmBankAccount() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.addresses.bankAccountsUpdate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.bankAccountsList.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.getById.queryKey(),
      })
    },
  })
}

export function useDeleteCrmBankAccount() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.addresses.bankAccountsDelete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.bankAccountsList.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.getById.queryKey(),
      })
    },
  })
}
