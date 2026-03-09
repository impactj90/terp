import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// --- Access Zones ---

interface UseAccessZonesOptions {
  enabled?: boolean
}

/**
 * Hook to fetch access zones (tRPC).
 */
export function useAccessZones(options: UseAccessZonesOptions = {}) {
  const { enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.accessZones.list.queryOptions(undefined, { enabled })
  )
}

/**
 * Hook to fetch a single access zone by ID (tRPC).
 */
export function useAccessZone(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.accessZones.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

/**
 * Hook to create a new access zone (tRPC).
 */
export function useCreateAccessZone() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.accessZones.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.accessZones.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing access zone (tRPC).
 */
export function useUpdateAccessZone() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.accessZones.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.accessZones.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete an access zone (tRPC).
 */
export function useDeleteAccessZone() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.accessZones.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.accessZones.list.queryKey(),
      })
    },
  })
}

// --- Access Profiles ---

interface UseAccessProfilesOptions {
  enabled?: boolean
}

/**
 * Hook to fetch access profiles (tRPC).
 */
export function useAccessProfiles(options: UseAccessProfilesOptions = {}) {
  const { enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.accessProfiles.list.queryOptions(undefined, { enabled })
  )
}

/**
 * Hook to fetch a single access profile by ID (tRPC).
 */
export function useAccessProfile(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.accessProfiles.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

/**
 * Hook to create a new access profile (tRPC).
 */
export function useCreateAccessProfile() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.accessProfiles.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.accessProfiles.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing access profile (tRPC).
 */
export function useUpdateAccessProfile() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.accessProfiles.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.accessProfiles.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete an access profile (tRPC).
 */
export function useDeleteAccessProfile() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.accessProfiles.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.accessProfiles.list.queryKey(),
      })
    },
  })
}

// --- Employee Access Assignments ---

interface UseEmployeeAccessAssignmentsOptions {
  enabled?: boolean
}

/**
 * Hook to fetch employee access assignments (tRPC).
 */
export function useEmployeeAccessAssignments(
  options: UseEmployeeAccessAssignmentsOptions = {}
) {
  const { enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.employeeAccessAssignments.list.queryOptions(undefined, {
      enabled,
    })
  )
}

/**
 * Hook to create a new employee access assignment (tRPC).
 */
export function useCreateEmployeeAccessAssignment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeAccessAssignments.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeAccessAssignments.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing employee access assignment (tRPC).
 */
export function useUpdateEmployeeAccessAssignment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeAccessAssignments.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeAccessAssignments.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete an employee access assignment (tRPC).
 */
export function useDeleteEmployeeAccessAssignment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeAccessAssignments.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeAccessAssignments.list.queryKey(),
      })
    },
  })
}
