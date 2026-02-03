import { useApiQuery, useApiMutation } from '@/hooks'

interface UseAbsencesOptions {
  employeeId?: string
  from?: string
  to?: string
  status?: 'pending' | 'approved' | 'rejected' | 'cancelled'
  enabled?: boolean
}

/**
 * Hook to fetch list of absence types.
 *
 * @example
 * ```tsx
 * const { data } = useAbsenceTypes()
 * ```
 */
export function useAbsenceTypes(enabled = true) {
  return useApiQuery('/absence-types', {
    params: { active: true },
    enabled,
  })
}

/**
 * Hook to fetch a single absence type by ID.
 */
export function useAbsenceType(id: string, enabled = true) {
  return useApiQuery('/absence-types/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to fetch list of absences.
 *
 * @example
 * ```tsx
 * const { data } = useAbsences({
 *   employeeId: '123',
 *   from: '2026-01-01',
 *   to: '2026-12-31',
 * })
 * ```
 */
export function useAbsences(options: UseAbsencesOptions = {}) {
  const { employeeId, from, to, status, enabled = true } = options

  return useApiQuery('/absences', {
    params: {
      employee_id: employeeId,
      from,
      to,
      status,
    },
    enabled,
  })
}

/**
 * Hook to fetch employee absences with date range filter.
 *
 * @example
 * ```tsx
 * const { data } = useEmployeeAbsences('employee-id', {
 *   from: '2026-01-01',
 *   to: '2026-12-31',
 * })
 * ```
 */
export function useEmployeeAbsences(
  employeeId: string,
  options?: { from?: string; to?: string; enabled?: boolean }
) {
  return useApiQuery('/employees/{id}/absences', {
    path: { id: employeeId },
    params: {
      from: options?.from,
      to: options?.to,
    },
    enabled: (options?.enabled ?? true) && !!employeeId,
  })
}

/**
 * Hook to fetch a single absence by ID.
 */
export function useAbsence(id: string, enabled = true) {
  return useApiQuery('/absences/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to create absences for a date range.
 *
 * @example
 * ```tsx
 * const createAbsence = useCreateAbsenceRange()
 * createAbsence.mutate({
 *   path: { id: employeeId },
 *   body: {
 *     absence_type_id: 'type-id',
 *     start_date: '2026-01-15',
 *     end_date: '2026-01-20',
 *   }
 * })
 * ```
 */
export function useCreateAbsenceRange() {
  return useApiMutation('/employees/{id}/absences', 'post', {
    invalidateKeys: [
      ['/absences'],
      ['/employees/{id}/absences'],
      ['/employees/{id}/vacation-balance'],
      ['/vacation-balances'],
    ],
  })
}

/**
 * Hook to update an absence (edit duration/notes, or cancel via status change).
 */
export function useUpdateAbsence() {
  return useApiMutation('/absences/{id}', 'patch', {
    invalidateKeys: [
      ['/absences'],
      ['/employees/{id}/absences'],
      ['/employees/{id}/vacation-balance'],
      ['/vacation-balances'],
    ],
  })
}

/**
 * Hook to delete an absence.
 */
export function useDeleteAbsence() {
  return useApiMutation('/absences/{id}', 'delete', {
    invalidateKeys: [
      ['/absences'],
      ['/employees/{id}/absences'],
      ['/employees/{id}/vacation-balance'],
      ['/vacation-balances'],
    ],
  })
}

/**
 * Hook to approve an absence.
 */
export function useApproveAbsence() {
  return useApiMutation('/absences/{id}/approve', 'post', {
    invalidateKeys: [
      ['/absences'],
      ['/employees/{id}/absences'],
    ],
  })
}

/**
 * Hook to reject an absence.
 */
export function useRejectAbsence() {
  return useApiMutation('/absences/{id}/reject', 'post', {
    invalidateKeys: [
      ['/absences'],
      ['/employees/{id}/absences'],
    ],
  })
}

/**
 * Hook to create a new absence type.
 */
export function useCreateAbsenceType() {
  return useApiMutation('/absence-types', 'post', {
    invalidateKeys: [['/absence-types']],
  })
}

/**
 * Hook to update an absence type.
 */
export function useUpdateAbsenceType() {
  return useApiMutation('/absence-types/{id}', 'patch', {
    invalidateKeys: [['/absence-types']],
  })
}

/**
 * Hook to delete an absence type.
 */
export function useDeleteAbsenceType() {
  return useApiMutation('/absence-types/{id}', 'delete', {
    invalidateKeys: [['/absence-types']],
  })
}
