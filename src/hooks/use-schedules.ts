import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Schedule CRUD Hooks ====================

interface UseSchedulesOptions {
  enabled?: boolean
}

/**
 * Hook to fetch list of schedules with tasks (tRPC).
 */
export function useSchedules(options: UseSchedulesOptions = {}) {
  const { enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.schedules.list.queryOptions(undefined, { enabled })
  )
}

/**
 * Hook to fetch a single schedule by ID with tasks (tRPC).
 */
export function useSchedule(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.schedules.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

/**
 * Hook to create a new schedule (tRPC).
 */
export function useCreateSchedule() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.schedules.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.schedules.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing schedule (tRPC).
 */
export function useUpdateSchedule() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.schedules.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.schedules.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a schedule (tRPC).
 */
export function useDeleteSchedule() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.schedules.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.schedules.list.queryKey(),
      })
    },
  })
}

// ==================== Task Hooks ====================

/**
 * Hook to fetch tasks for a schedule (tRPC).
 */
export function useScheduleTasks(scheduleId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.schedules.tasks.queryOptions(
      { scheduleId },
      { enabled: enabled && !!scheduleId }
    )
  )
}

/**
 * Hook to create a new schedule task (tRPC).
 */
export function useCreateScheduleTask() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.schedules.createTask.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.schedules.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.schedules.tasks.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing schedule task (tRPC).
 */
export function useUpdateScheduleTask() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.schedules.updateTask.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.schedules.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.schedules.tasks.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a schedule task (tRPC).
 */
export function useDeleteScheduleTask() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.schedules.deleteTask.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.schedules.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.schedules.tasks.queryKey(),
      })
    },
  })
}

// ==================== Execution Hooks ====================

/**
 * Hook to manually execute a schedule (tRPC).
 */
export function useExecuteSchedule() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.schedules.execute.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.schedules.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to fetch execution history for a schedule (tRPC).
 */
export function useScheduleExecutions(scheduleId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.schedules.executions.queryOptions(
      { scheduleId },
      { enabled: enabled && !!scheduleId }
    )
  )
}

/**
 * Hook to fetch a single schedule execution (tRPC).
 */
export function useScheduleExecution(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.schedules.execution.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

// ==================== Task Catalog Hook ====================

/**
 * Hook to fetch available task types (tRPC).
 */
export function useTaskCatalog(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.schedules.taskCatalog.queryOptions(undefined, { enabled })
  )
}
