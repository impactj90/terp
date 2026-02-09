import { useApiQuery, useApiMutation } from '@/hooks'

interface UseMacrosOptions {
  enabled?: boolean
}

// === Macro CRUD ===
export function useMacros(options: UseMacrosOptions = {}) {
  const { enabled = true } = options
  return useApiQuery('/macros', { enabled })
}

export function useMacro(id: string, enabled = true) {
  return useApiQuery('/macros/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateMacro() {
  return useApiMutation('/macros', 'post', {
    invalidateKeys: [['/macros']],
  })
}

export function useUpdateMacro() {
  return useApiMutation('/macros/{id}', 'patch', {
    invalidateKeys: [['/macros']],
  })
}

export function useDeleteMacro() {
  return useApiMutation('/macros/{id}', 'delete', {
    invalidateKeys: [['/macros']],
  })
}

// === Macro Assignments ===
export function useMacroAssignments(macroId: string, enabled = true) {
  return useApiQuery('/macros/{id}/assignments', {
    path: { id: macroId },
    enabled: enabled && !!macroId,
  })
}

export function useCreateMacroAssignment() {
  return useApiMutation('/macros/{id}/assignments', 'post', {
    invalidateKeys: [['/macros']],
  })
}

export function useUpdateMacroAssignment() {
  return useApiMutation('/macros/{id}/assignments/{assignmentId}', 'patch', {
    invalidateKeys: [['/macros']],
  })
}

export function useDeleteMacroAssignment() {
  return useApiMutation('/macros/{id}/assignments/{assignmentId}', 'delete', {
    invalidateKeys: [['/macros']],
  })
}

// === Macro Execution ===
export function useExecuteMacro() {
  return useApiMutation('/macros/{id}/execute', 'post', {
    invalidateKeys: [['/macros']],
  })
}

export function useMacroExecutions(macroId: string, enabled = true) {
  return useApiQuery('/macros/{id}/executions', {
    path: { id: macroId },
    enabled: enabled && !!macroId,
  })
}

export function useMacroExecution(id: string, enabled = true) {
  return useApiQuery('/macro-executions/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}
