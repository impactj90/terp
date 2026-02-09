import { useApiQuery, useApiMutation } from '@/hooks'

// === Query Options Types ===
interface UseSchedulesOptions {
  enabled?: boolean
}

// === Schedule CRUD ===
export function useSchedules(options: UseSchedulesOptions = {}) {
  const { enabled = true } = options
  return useApiQuery('/schedules', { enabled })
}

export function useSchedule(id: string, enabled = true) {
  return useApiQuery('/schedules/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateSchedule() {
  return useApiMutation('/schedules', 'post', {
    invalidateKeys: [['/schedules']],
  })
}

export function useUpdateSchedule() {
  return useApiMutation('/schedules/{id}', 'patch', {
    invalidateKeys: [['/schedules']],
  })
}

export function useDeleteSchedule() {
  return useApiMutation('/schedules/{id}', 'delete', {
    invalidateKeys: [['/schedules']],
  })
}

// === Schedule Tasks ===
export function useScheduleTasks(scheduleId: string, enabled = true) {
  return useApiQuery('/schedules/{id}/tasks', {
    path: { id: scheduleId },
    enabled: enabled && !!scheduleId,
  })
}

export function useCreateScheduleTask() {
  return useApiMutation('/schedules/{id}/tasks', 'post', {
    invalidateKeys: [['/schedules'], ['/schedules/{id}/tasks']],
  })
}

export function useUpdateScheduleTask() {
  return useApiMutation('/schedules/{id}/tasks/{taskId}', 'patch', {
    invalidateKeys: [['/schedules'], ['/schedules/{id}/tasks']],
  })
}

export function useDeleteScheduleTask() {
  return useApiMutation('/schedules/{id}/tasks/{taskId}', 'delete', {
    invalidateKeys: [['/schedules'], ['/schedules/{id}/tasks']],
  })
}

// === Schedule Execution ===
export function useExecuteSchedule() {
  return useApiMutation('/schedules/{id}/execute', 'post', {
    invalidateKeys: [['/schedules']],
  })
}

export function useScheduleExecutions(scheduleId: string, enabled = true) {
  return useApiQuery('/schedules/{id}/executions', {
    path: { id: scheduleId },
    enabled: enabled && !!scheduleId,
  })
}

export function useScheduleExecution(id: string, enabled = true) {
  return useApiQuery('/schedule-executions/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

// === Task Catalog ===
export function useTaskCatalog(enabled = true) {
  return useApiQuery('/scheduler/task-catalog', { enabled })
}
