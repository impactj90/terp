import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

interface UseEmploymentTypesOptions {
  enabled?: boolean
  isActive?: boolean
}

/**
 * Hook to fetch list of employment types.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmploymentTypes()
 * const employmentTypes = data?.data ?? []
 * ```
 */
export function useEmploymentTypes(options: UseEmploymentTypesOptions = {}) {
  const { enabled = true, isActive } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.employmentTypes.list.queryOptions({ isActive }, { enabled })
  )
}

/**
 * Hook to fetch a single employment type by ID.
 *
 * @example
 * ```tsx
 * const { data: employmentType, isLoading } = useEmploymentType(typeId)
 * ```
 */
export function useEmploymentType(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.employmentTypes.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new employment type.
 *
 * @example
 * ```tsx
 * const createEmploymentType = useCreateEmploymentType()
 * createEmploymentType.mutate({ code: 'FT', name: 'Full Time' })
 * ```
 */
export function useCreateEmploymentType() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employmentTypes.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employmentTypes.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing employment type.
 *
 * @example
 * ```tsx
 * const updateEmploymentType = useUpdateEmploymentType()
 * updateEmploymentType.mutate({ id: typeId, name: 'Updated Name' })
 * ```
 */
export function useUpdateEmploymentType() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employmentTypes.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employmentTypes.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employmentTypes.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete an employment type.
 *
 * @example
 * ```tsx
 * const deleteEmploymentType = useDeleteEmploymentType()
 * deleteEmploymentType.mutate({ id: typeId })
 * ```
 */
export function useDeleteEmploymentType() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employmentTypes.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employmentTypes.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employmentTypes.getById.queryKey(),
      })
    },
  })
}
