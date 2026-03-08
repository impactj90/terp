/**
 * Vacation Balance Hooks (tRPC)
 *
 * Migrated from legacy REST (useApiQuery/useApiMutation) to tRPC.
 * Preserves the same exported function signatures for backward compatibility
 * with the 9 consuming components.
 *
 * Legacy REST endpoints replaced:
 * - GET /vacation-balances -> vacationBalances.list
 * - GET /vacation-balances/:id -> vacationBalances.getById
 * - GET /employees/:id/vacation-balance -> vacation.getBalance
 * - POST /vacation-balances -> vacationBalances.create
 * - PATCH /vacation-balances/:id -> vacationBalances.update
 * - POST /vacation-balances/initialize -> vacation.initializeBatch
 */
import { useTRPC, useTRPCClient } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// --- Legacy Shape Interface ---

interface LegacyVacationBalance {
  id: string
  tenant_id: string
  employee_id: string
  year: number
  base_entitlement: number
  additional_entitlement: number
  total_entitlement: number
  carryover_from_previous: number
  manual_adjustment: number
  taken: number
  available: number
  total: number
  carryover_expires_at: string | null
  created_at: string
  updated_at: string
  employee?: {
    id: string
    first_name: string
    last_name: string
    personnel_number: string
    is_active: boolean
    department_id?: string | null
  } | null
}

// --- Transform Helpers ---

/**
 * Transforms tRPC camelCase balance output to legacy snake_case shape.
 * Note: Go splits entitlement into base+additional; TypeScript uses single entitlement.
 * Map: base_entitlement = entitlement, additional_entitlement = 0.
 */
function transformToLegacy(
  balance: Record<string, unknown>
): LegacyVacationBalance {
  const employee = balance.employee as
    | Record<string, unknown>
    | null
    | undefined

  return {
    id: balance.id as string,
    tenant_id: balance.tenantId as string,
    employee_id: balance.employeeId as string,
    year: balance.year as number,
    base_entitlement: balance.entitlement as number,
    additional_entitlement: 0,
    total_entitlement: balance.entitlement as number,
    carryover_from_previous: balance.carryover as number,
    manual_adjustment: balance.adjustments as number,
    taken: balance.taken as number,
    available: balance.available as number,
    total: balance.total as number,
    carryover_expires_at: balance.carryoverExpiresAt
      ? String(balance.carryoverExpiresAt)
      : null,
    created_at: balance.createdAt ? String(balance.createdAt) : "",
    updated_at: balance.updatedAt ? String(balance.updatedAt) : "",
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
  }
}

// --- Invalidation Helper ---

function useVacationBalanceInvalidation() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  return () => {
    queryClient.invalidateQueries({
      queryKey: trpc.vacationBalances.list.queryKey(),
    })
    queryClient.invalidateQueries({
      queryKey: trpc.vacationBalances.getById.queryKey(),
    })
    queryClient.invalidateQueries({
      queryKey: trpc.vacation.getBalance.queryKey(),
    })
    // Keep legacy invalidation during transition
    queryClient.invalidateQueries({
      queryKey: ["/vacation-balances"],
    })
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey as unknown[]
        return (
          typeof key[0] === "string" && key[0].includes("vacation-balance")
        )
      },
    })
  }
}

// --- Query Options Type ---

interface UseVacationBalancesOptions {
  employeeId?: string
  year?: number
  departmentId?: string
  enabled?: boolean
}

// --- Hooks ---

/**
 * Hook to fetch list of vacation balances.
 *
 * @example
 * ```tsx
 * const { data } = useVacationBalances({
 *   employeeId: '123',
 *   year: 2026,
 * })
 * ```
 */
export function useVacationBalances(options: UseVacationBalancesOptions = {}) {
  const { employeeId, year, departmentId, enabled = true } = options
  const trpc = useTRPC()

  return useQuery({
    ...trpc.vacationBalances.list.queryOptions(
      { employeeId, year, departmentId },
      { enabled }
    ),
    select: (data) => ({
      data: data.map((item) =>
        transformToLegacy(item as unknown as Record<string, unknown>)
      ),
    }),
  })
}

/**
 * Hook to fetch a single vacation balance by ID.
 */
export function useVacationBalance(id: string, enabled = true) {
  const trpc = useTRPC()

  return useQuery({
    ...trpc.vacationBalances.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    ),
    select: (data) =>
      transformToLegacy(data as unknown as Record<string, unknown>),
  })
}

/**
 * Hook to fetch vacation balance for a specific employee and year.
 *
 * @example
 * ```tsx
 * const { data } = useEmployeeVacationBalance('123', 2026)
 * ```
 */
export function useEmployeeVacationBalance(
  employeeId: string,
  year?: number,
  enabled = true
) {
  const trpc = useTRPC()
  const currentYear = year ?? new Date().getFullYear()

  return useQuery({
    ...trpc.vacation.getBalance.queryOptions(
      { employeeId, year: currentYear },
      { enabled: enabled && !!employeeId }
    ),
    select: (data) =>
      transformToLegacy(data as unknown as Record<string, unknown>),
  })
}

/**
 * Hook to create a new vacation balance.
 *
 * Accepts legacy shape: { body: { employee_id, year, base_entitlement, ... } }
 * Translates to tRPC input.
 *
 * @example
 * ```tsx
 * const createBalance = useCreateVacationBalance()
 * createBalance.mutate({
 *   body: { employee_id: '...', year: 2026, base_entitlement: 30 }
 * })
 * ```
 */
export function useCreateVacationBalance() {
  const client = useTRPCClient()
  const invalidate = useVacationBalanceInvalidation()

  return useMutation({
    mutationFn: async (params: {
      body: {
        employee_id: string
        year: number
        base_entitlement?: number
        carryover_from_previous?: number
        manual_adjustment?: number
        carryover_expires_at?: string | null
      }
    }) => {
      return client.vacationBalances.create.mutate({
        employeeId: params.body.employee_id,
        year: params.body.year,
        entitlement: params.body.base_entitlement ?? 0,
        carryover: params.body.carryover_from_previous ?? 0,
        adjustments: params.body.manual_adjustment ?? 0,
        carryoverExpiresAt: params.body.carryover_expires_at
          ? new Date(params.body.carryover_expires_at)
          : null,
      })
    },
    onSuccess: invalidate,
  })
}

/**
 * Hook to update an existing vacation balance.
 *
 * Accepts legacy shape: { path: { id }, body: { base_entitlement, ... } }
 * Translates to tRPC input.
 *
 * @example
 * ```tsx
 * const updateBalance = useUpdateVacationBalance()
 * updateBalance.mutate({
 *   path: { id: '...' },
 *   body: { base_entitlement: 25 }
 * })
 * ```
 */
export function useUpdateVacationBalance() {
  const client = useTRPCClient()
  const invalidate = useVacationBalanceInvalidation()

  return useMutation({
    mutationFn: async (params: {
      path: { id: string }
      body: {
        base_entitlement?: number
        carryover_from_previous?: number
        manual_adjustment?: number
        carryover_expires_at?: string | null
      }
    }) => {
      return client.vacationBalances.update.mutate({
        id: params.path.id,
        entitlement: params.body.base_entitlement,
        carryover: params.body.carryover_from_previous,
        adjustments: params.body.manual_adjustment,
        carryoverExpiresAt:
          params.body.carryover_expires_at !== undefined
            ? params.body.carryover_expires_at
              ? new Date(params.body.carryover_expires_at)
              : null
            : undefined,
      })
    },
    onSuccess: invalidate,
  })
}

/**
 * Hook to initialize vacation balances for all active employees for a year.
 *
 * Accepts legacy shape: { body: { year, carryover } }
 * Translates to tRPC input.
 *
 * @example
 * ```tsx
 * const initialize = useInitializeVacationBalances()
 * initialize.mutate({
 *   body: { year: 2026, carryover: true }
 * })
 * ```
 */
export function useInitializeVacationBalances() {
  const client = useTRPCClient()
  const invalidate = useVacationBalanceInvalidation()

  return useMutation({
    mutationFn: async (params: {
      body: {
        year: number
        carryover?: boolean
      }
    }) => {
      return client.vacation.initializeBatch.mutate({
        year: params.body.year,
        carryover: params.body.carryover ?? true,
      })
    },
    onSuccess: invalidate,
  })
}
