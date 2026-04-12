import * as React from "react"
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Vacation Special Calculations ====================

/**
 * Hook to fetch vacation special calculations (tRPC).
 *
 * Supports optional isActive filter.
 */
export function useVacationSpecialCalculations(
  options: { isActive?: boolean; type?: string; enabled?: boolean } = {}
) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.vacationSpecialCalcs.list.queryOptions(
      Object.keys(input).length > 0 ? input : undefined,
      { enabled }
    )
  )
}

/**
 * Hook to fetch a single vacation special calculation by ID (tRPC).
 */
export function useVacationSpecialCalculation(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.vacationSpecialCalcs.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

/**
 * Hook to create a new vacation special calculation (tRPC).
 */
export function useCreateVacationSpecialCalculation() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.vacationSpecialCalcs.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.vacationSpecialCalcs.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.vacationSpecialCalcs.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing vacation special calculation (tRPC).
 */
export function useUpdateVacationSpecialCalculation() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.vacationSpecialCalcs.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.vacationSpecialCalcs.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.vacationSpecialCalcs.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a vacation special calculation (tRPC).
 */
export function useDeleteVacationSpecialCalculation() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.vacationSpecialCalcs.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.vacationSpecialCalcs.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.vacationSpecialCalcs.getById.queryKey(),
      })
    },
  })
}

// ==================== Vacation Calculation Groups ====================

/**
 * Hook to fetch vacation calculation groups (tRPC).
 *
 * Supports optional isActive filter.
 */
export function useVacationCalculationGroups(
  options: { isActive?: boolean; enabled?: boolean } = {}
) {
  const trpc = useTRPC()
  const { enabled = true, ...input } = options
  return useQuery(
    trpc.vacationCalcGroups.list.queryOptions(
      Object.keys(input).length > 0 ? input : undefined,
      { enabled }
    )
  )
}

/**
 * Hook to fetch a single vacation calculation group by ID (tRPC).
 */
export function useVacationCalculationGroup(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.vacationCalcGroups.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

/**
 * Hook to create a new vacation calculation group (tRPC).
 */
export function useCreateVacationCalculationGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.vacationCalcGroups.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.vacationCalcGroups.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.vacationCalcGroups.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing vacation calculation group (tRPC).
 */
export function useUpdateVacationCalculationGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.vacationCalcGroups.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.vacationCalcGroups.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.vacationCalcGroups.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a vacation calculation group (tRPC).
 */
export function useDeleteVacationCalculationGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.vacationCalcGroups.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.vacationCalcGroups.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.vacationCalcGroups.getById.queryKey(),
      })
    },
  })
}

// ==================== Vacation Capping Rules ====================

/**
 * Hook to fetch vacation capping rules (tRPC).
 *
 * Supports optional isActive and ruleType filters.
 */
export function useVacationCappingRules(
  options: { isActive?: boolean; ruleType?: string; enabled?: boolean } = {}
) {
  const trpc = useTRPC()
  const { enabled = true, ...input } = options
  return useQuery(
    trpc.vacationCappingRules.list.queryOptions(
      Object.keys(input).length > 0 ? input : undefined,
      { enabled }
    )
  )
}

/**
 * Hook to fetch a single vacation capping rule by ID (tRPC).
 */
export function useVacationCappingRule(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.vacationCappingRules.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

/**
 * Hook to create a new vacation capping rule (tRPC).
 */
export function useCreateVacationCappingRule() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.vacationCappingRules.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.vacationCappingRules.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.vacationCappingRules.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing vacation capping rule (tRPC).
 */
export function useUpdateVacationCappingRule() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.vacationCappingRules.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.vacationCappingRules.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.vacationCappingRules.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a vacation capping rule (tRPC).
 */
export function useDeleteVacationCappingRule() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.vacationCappingRules.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.vacationCappingRules.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.vacationCappingRules.getById.queryKey(),
      })
    },
  })
}

// ==================== Vacation Capping Rule Groups ====================

/**
 * Hook to fetch vacation capping rule groups (tRPC).
 *
 * Supports optional isActive filter.
 */
export function useVacationCappingRuleGroups(
  options: { isActive?: boolean; enabled?: boolean } = {}
) {
  const trpc = useTRPC()
  const { enabled = true, ...input } = options
  return useQuery(
    trpc.vacationCappingRuleGroups.list.queryOptions(
      Object.keys(input).length > 0 ? input : undefined,
      { enabled }
    )
  )
}

/**
 * Hook to fetch a single vacation capping rule group by ID (tRPC).
 */
export function useVacationCappingRuleGroup(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.vacationCappingRuleGroups.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

/**
 * Hook to create a new vacation capping rule group (tRPC).
 */
export function useCreateVacationCappingRuleGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.vacationCappingRuleGroups.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.vacationCappingRuleGroups.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.vacationCappingRuleGroups.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing vacation capping rule group (tRPC).
 */
export function useUpdateVacationCappingRuleGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.vacationCappingRuleGroups.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.vacationCappingRuleGroups.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.vacationCappingRuleGroups.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a vacation capping rule group (tRPC).
 */
export function useDeleteVacationCappingRuleGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.vacationCappingRuleGroups.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.vacationCappingRuleGroups.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.vacationCappingRuleGroups.getById.queryKey(),
      })
    },
  })
}

// ==================== Employee Capping Exceptions ====================

/**
 * Hook to fetch employee capping exceptions (tRPC).
 *
 * Supports optional employeeId, cappingRuleId, year filters.
 */
export function useEmployeeCappingExceptions(
  options: {
    employeeId?: string
    cappingRuleId?: string
    year?: number
    enabled?: boolean
  } = {}
) {
  const trpc = useTRPC()
  const { enabled = true, ...input } = options
  return useQuery(
    trpc.employeeCappingExceptions.list.queryOptions(
      Object.keys(input).length > 0 ? input : undefined,
      { enabled }
    )
  )
}

/**
 * Hook to fetch a single employee capping exception by ID (tRPC).
 */
export function useEmployeeCappingException(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.employeeCappingExceptions.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

/**
 * Hook to create a new employee capping exception (tRPC).
 */
export function useCreateEmployeeCappingException() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeCappingExceptions.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeCappingExceptions.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employeeCappingExceptions.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing employee capping exception (tRPC).
 */
export function useUpdateEmployeeCappingException() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeCappingExceptions.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeCappingExceptions.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employeeCappingExceptions.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete an employee capping exception (tRPC).
 */
export function useDeleteEmployeeCappingException() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeCappingExceptions.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeCappingExceptions.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employeeCappingExceptions.getById.queryKey(),
      })
    },
  })
}

// ==================== Previews ====================

/**
 * Hook to calculate vacation entitlement preview (tRPC).
 *
 * These were changed from mutations to queries (AUDIT-014) since they are
 * read-only calculations. This hook preserves the mutation-like API surface
 * (data, isPending, mutateAsync) for backward compatibility with the UI
 * component that triggers calculation via a button click.
 */
export function useVacationEntitlementPreview() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [data, setData] = React.useState<Awaited<ReturnType<typeof fetchPreview>> | undefined>()
  const [isPending, setIsPending] = React.useState(false)

  type PreviewInput = { employeeId: string; year: number; calcGroupId?: string }

  const fetchPreview = async (params: PreviewInput) => {
    const opts = trpc.vacation.entitlementPreview.queryOptions(params)
    return queryClient.fetchQuery({ ...opts, staleTime: 0 })
  }

  return {
    data,
    isPending,
    mutateAsync: async (params: PreviewInput) => {
      setIsPending(true)
      try {
        const result = await fetchPreview(params)
        setData(result)
        return result
      } finally {
        setIsPending(false)
      }
    },
  }
}

/**
 * Hook to calculate vacation carryover preview (tRPC).
 *
 * Same pattern as useVacationEntitlementPreview -- preserves mutation-like
 * API surface while using the query endpoint underneath.
 */
export function useVacationCarryoverPreview() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [data, setData] = React.useState<Awaited<ReturnType<typeof fetchPreview>> | undefined>()
  const [isPending, setIsPending] = React.useState(false)

  type PreviewInput = { employeeId: string; year: number }

  const fetchPreview = async (params: PreviewInput) => {
    const opts = trpc.vacation.carryoverPreview.queryOptions(params)
    return queryClient.fetchQuery({ ...opts, staleTime: 0 })
  }

  return {
    data,
    isPending,
    mutateAsync: async (params: PreviewInput) => {
      setIsPending(true)
      try {
        const result = await fetchPreview(params)
        setData(result)
        return result
      } finally {
        setIsPending(false)
      }
    },
  }
}
