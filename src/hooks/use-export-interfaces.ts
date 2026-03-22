import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

interface UseExportInterfacesOptions {
  activeOnly?: boolean
  enabled?: boolean
}

/**
 * Hook to fetch list of export interfaces (tRPC).
 */
export function useExportInterfaces(options: UseExportInterfacesOptions = {}) {
  const { activeOnly, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.exportInterfaces.list.queryOptions(
      { activeOnly },
      { enabled }
    )
  )
}

/**
 * Hook to fetch a single export interface by ID (tRPC).
 */
export function useExportInterface(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.exportInterfaces.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

/**
 * Hook to fetch accounts assigned to an export interface (tRPC).
 */
export function useExportInterfaceAccounts(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.exportInterfaces.listAccounts.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new export interface (tRPC).
 */
export function useCreateExportInterface() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.exportInterfaces.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.exportInterfaces.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.exportInterfaces.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing export interface (tRPC).
 */
export function useUpdateExportInterface() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.exportInterfaces.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.exportInterfaces.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.exportInterfaces.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete an export interface (tRPC).
 */
export function useDeleteExportInterface() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.exportInterfaces.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.exportInterfaces.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.exportInterfaces.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.exportInterfaces.listAccounts.queryKey(),
      })
    },
  })
}

/**
 * Hook to set (replace all) accounts for an export interface (tRPC).
 */
export function useSetExportInterfaceAccounts() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.exportInterfaces.setAccounts.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.exportInterfaces.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.exportInterfaces.listAccounts.queryKey(),
      })
    },
  })
}
