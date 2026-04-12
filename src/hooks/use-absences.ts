import { useTRPC, useTRPCClient } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTimeDataInvalidation } from "./use-time-data-invalidation"

interface UseAbsencesOptions {
  employeeId?: string
  from?: string
  to?: string
  status?: 'pending' | 'approved' | 'rejected' | 'cancelled'
  enabled?: boolean
}

/** Legacy snake_case absence shape matching components['schemas']['Absence'] */
interface LegacyAbsence {
  id: string
  tenant_id: string
  employee_id: string
  absence_type_id: string
  absence_date: string
  duration: number
  status?: 'pending' | 'approved' | 'rejected' | 'cancelled'
  notes?: string | null
  rejection_reason?: string | null
  approved_by?: string | null
  approved_at?: string | null
  created_at?: string
  updated_at?: string
  created_by?: string | null
  half_day_period?: string | null
  employee?: {
    id: string
    first_name: string
    last_name: string
    personnel_number: string
    is_active: boolean
    department_id?: string | null
  } | null
  absence_type?: {
    id: string
    code: string
    name: string
    category: string
    color: string
    deducts_vacation: boolean
  } | null
}

/**
 * Transform tRPC absence output (camelCase) to legacy snake_case shape.
 * Preserves backward compatibility with components using OpenAPI Absence type.
 */
function transformToLegacy(
  absence: Record<string, unknown>
): LegacyAbsence {
  const employee = absence.employee as
    | Record<string, unknown>
    | null
    | undefined
  const absenceType = absence.absenceType as
    | Record<string, unknown>
    | null
    | undefined

  return {
    id: absence.id as string,
    tenant_id: absence.tenantId as string,
    employee_id: absence.employeeId as string,
    absence_type_id: absence.absenceTypeId as string,
    absence_date: absence.absenceDate as string,
    duration: absence.duration as number,
    status: absence.status as LegacyAbsence["status"],
    notes: (absence.notes as string | null) ?? null,
    rejection_reason: (absence.rejectionReason as string | null) ?? null,
    approved_by: (absence.approvedBy as string | null) ?? null,
    approved_at: absence.approvedAt
      ? String(absence.approvedAt)
      : null,
    created_at: absence.createdAt ? String(absence.createdAt) : undefined,
    updated_at: absence.updatedAt ? String(absence.updatedAt) : undefined,
    created_by: (absence.createdBy as string | null) ?? null,
    half_day_period: (absence.halfDayPeriod as string | null) ?? null,
    employee: employee
      ? {
          id: employee.id as string,
          first_name: employee.firstName as string,
          last_name: employee.lastName as string,
          personnel_number: employee.personnelNumber as string,
          is_active: employee.isActive as boolean,
          department_id: (employee.departmentId as string | null) ?? null,
        }
      : (employee as null | undefined),
    absence_type: absenceType
      ? {
          id: absenceType.id as string,
          code: absenceType.code as string,
          name: absenceType.name as string,
          category: absenceType.category as string,
          color: absenceType.color as string,
          deducts_vacation: absenceType.deductsVacation as boolean,
        }
      : (absenceType as null | undefined),
  }
}

/**
 * Common invalidation helper for absence mutations.
 * Invalidates all absence-related tRPC queries and legacy vacation balance REST queries.
 */
function useAbsenceInvalidation() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const invalidateTimeData = useTimeDataInvalidation()

  return () => {
    queryClient.invalidateQueries({
      queryKey: trpc.absences.list.queryKey(),
    })
    queryClient.invalidateQueries({
      queryKey: trpc.absences.forEmployee.queryKey(),
    })
    queryClient.invalidateQueries({
      queryKey: trpc.absences.getById.queryKey(),
    })
    // Invalidate tRPC vacation balance queries
    queryClient.invalidateQueries({
      queryKey: trpc.vacationBalances.list.queryKey(),
    })
    queryClient.invalidateQueries({
      queryKey: trpc.vacation.getBalance.queryKey(),
    })
    // Invalidate legacy REST vacation balance queries (during transition)
    queryClient.invalidateQueries({
      queryKey: ["/vacation-balances"],
    })
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey as unknown[]
        return (
          typeof key[0] === "string" &&
          key[0].includes("vacation-balance")
        )
      },
    })
    // Invalidate downstream recalc cascade (dayView → dailyValues → monthlyValues)
    invalidateTimeData()
  }
}

/**
 * Hook to fetch list of absences.
 * Returns { data: legacyAbsence[] } for backward compatibility.
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
  const trpc = useTRPC()

  return useQuery({
    ...trpc.absences.list.queryOptions(
      {
        employeeId,
        fromDate: from,
        toDate: to,
        status,
      },
      { enabled }
    ),
    select: (data) => ({
      data: data.items.map((item) =>
        transformToLegacy(item as unknown as Record<string, unknown>)
      ),
      total: data.total,
    }),
  })
}

/**
 * Hook to fetch employee absences with date range filter.
 * Returns { data: legacyAbsence[] } for backward compatibility.
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
  const trpc = useTRPC()

  return useQuery({
    ...trpc.absences.forEmployee.queryOptions(
      {
        employeeId,
        fromDate: options?.from,
        toDate: options?.to,
      },
      { enabled: (options?.enabled ?? true) && !!employeeId }
    ),
    select: (data) => ({
      data: data.map((item) =>
        transformToLegacy(item as unknown as Record<string, unknown>)
      ),
    }),
  })
}

/**
 * Hook to fetch a single absence by ID.
 * Returns legacy snake_case shape for backward compatibility.
 */
export function useAbsence(id: string, enabled = true) {
  const trpc = useTRPC()

  return useQuery({
    ...trpc.absences.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    ),
    select: (data) =>
      transformToLegacy(data as unknown as Record<string, unknown>),
  })
}

/**
 * Hook to create absences for a date range.
 *
 * Accepts legacy shape: { path: { id: employeeId }, body: { absence_type_id, from, to, duration, notes } }
 * Translates to tRPC input.
 *
 * @example
 * ```tsx
 * const createAbsence = useCreateAbsenceRange()
 * createAbsence.mutate({
 *   path: { id: employeeId },
 *   body: {
 *     absence_type_id: 'type-id',
 *     from: '2026-01-15',
 *     to: '2026-01-20',
 *   }
 * })
 * ```
 */
export function useCreateAbsenceRange() {
  const client = useTRPCClient()
  const invalidate = useAbsenceInvalidation()

  return useMutation({
    mutationFn: async (params: {
      path: { id: string }
      body: {
        absence_type_id: string
        from: string
        to: string
        duration?: number
        notes?: string
      }
    }) => {
      return client.absences.createRange.mutate({
        employeeId: params.path.id,
        absenceTypeId: params.body.absence_type_id,
        fromDate: params.body.from,
        toDate: params.body.to,
        duration: params.body.duration ?? 1,
        notes: params.body.notes,
      })
    },
    onSuccess: invalidate,
  })
}

/**
 * Hook to update an absence (edit duration/notes).
 *
 * Accepts legacy shape: { path: { id }, body: { duration?, notes? } }
 */
export function useUpdateAbsence() {
  const client = useTRPCClient()
  const invalidate = useAbsenceInvalidation()

  return useMutation({
    mutationFn: async (params: {
      path: { id: string }
      body: {
        duration?: number
        notes?: string
      }
    }) => {
      return client.absences.update.mutate({
        id: params.path.id,
        duration: params.body.duration,
        notes: params.body.notes,
      })
    },
    onSuccess: invalidate,
  })
}

/**
 * Hook to delete an absence.
 *
 * Accepts legacy shape: { path: { id } }
 */
export function useDeleteAbsence() {
  const client = useTRPCClient()
  const invalidate = useAbsenceInvalidation()

  return useMutation({
    mutationFn: async (params: { path: { id: string } }) => {
      return client.absences.delete.mutate({
        id: params.path.id,
      })
    },
    onSuccess: invalidate,
  })
}

/**
 * Hook to approve an absence.
 *
 * Accepts legacy shape: { path: { id } }
 */
export function useApproveAbsence() {
  const client = useTRPCClient()
  const invalidate = useAbsenceInvalidation()

  return useMutation({
    mutationFn: async (params: { path: { id: string } }) => {
      return client.absences.approve.mutate({
        id: params.path.id,
      })
    },
    onSuccess: invalidate,
  })
}

/**
 * Hook to reject an absence.
 *
 * Accepts legacy shape: { path: { id }, body?: { reason } }
 */
export function useRejectAbsence() {
  const client = useTRPCClient()
  const invalidate = useAbsenceInvalidation()

  return useMutation({
    mutationFn: async (params: {
      path: { id: string }
      body?: { reason?: string }
    }) => {
      return client.absences.reject.mutate({
        id: params.path.id,
        reason: params.body?.reason,
      })
    },
    onSuccess: invalidate,
  })
}

/**
 * Hook to cancel an approved absence.
 * New hook not present in the legacy REST hooks.
 * Uses native tRPC shape (no legacy adapter needed).
 */
export function useCancelAbsence() {
  const trpc = useTRPC()
  const invalidate = useAbsenceInvalidation()

  return useMutation({
    ...trpc.absences.cancel.mutationOptions(),
    onSuccess: invalidate,
  })
}
