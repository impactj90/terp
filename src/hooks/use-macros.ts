import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Macro CRUD Hooks ====================

interface UseMacrosOptions {
  enabled?: boolean
}

/**
 * Hook to fetch list of macros with assignments (tRPC).
 */
export function useMacros(options: UseMacrosOptions = {}) {
  const { enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.macros.list.queryOptions(undefined, { enabled })
  )
}

/**
 * Hook to fetch a single macro by ID with assignments (tRPC).
 */
export function useMacro(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.macros.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

/**
 * Hook to create a new macro (tRPC).
 */
export function useCreateMacro() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.macros.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.macros.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing macro (tRPC).
 */
export function useUpdateMacro() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.macros.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.macros.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a macro (tRPC).
 */
export function useDeleteMacro() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.macros.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.macros.list.queryKey(),
      })
    },
  })
}

// ==================== Assignment Hooks ====================

/**
 * Hook to fetch assignments for a macro (tRPC).
 */
export function useMacroAssignments(macroId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.macros.listAssignments.queryOptions(
      { macroId },
      { enabled: enabled && !!macroId }
    )
  )
}

/**
 * Hook to create a new macro assignment (tRPC).
 */
export function useCreateMacroAssignment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.macros.createAssignment.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.macros.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.macros.listAssignments.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing macro assignment (tRPC).
 */
export function useUpdateMacroAssignment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.macros.updateAssignment.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.macros.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.macros.listAssignments.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a macro assignment (tRPC).
 */
export function useDeleteMacroAssignment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.macros.deleteAssignment.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.macros.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.macros.listAssignments.queryKey(),
      })
    },
  })
}

// ==================== Execution Hooks ====================

/**
 * Hook to manually execute a macro (tRPC).
 */
export function useExecuteMacro() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.macros.triggerExecution.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.macros.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to fetch execution history for a macro (tRPC).
 */
export function useMacroExecutions(macroId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.macros.listExecutions.queryOptions(
      { macroId },
      { enabled: enabled && !!macroId }
    )
  )
}

/**
 * Hook to fetch a single macro execution (tRPC).
 */
export function useMacroExecution(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.macros.getExecution.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}
