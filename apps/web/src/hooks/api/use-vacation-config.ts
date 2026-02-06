import { useApiQuery, useApiMutation } from '@/hooks'

// ==================== Vacation Special Calculations ====================

interface UseVacationSpecialCalculationsOptions {
  enabled?: boolean
}

/**
 * Hook to fetch vacation special calculations.
 */
export function useVacationSpecialCalculations(options: UseVacationSpecialCalculationsOptions = {}) {
  const { enabled = true } = options
  return useApiQuery('/vacation-special-calculations', { enabled })
}

/**
 * Hook to fetch a single vacation special calculation by ID.
 */
export function useVacationSpecialCalculation(id: string, enabled = true) {
  return useApiQuery('/vacation-special-calculations/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to create a new vacation special calculation.
 */
export function useCreateVacationSpecialCalculation() {
  return useApiMutation('/vacation-special-calculations', 'post', {
    invalidateKeys: [['/vacation-special-calculations']],
  })
}

/**
 * Hook to update an existing vacation special calculation.
 */
export function useUpdateVacationSpecialCalculation() {
  return useApiMutation('/vacation-special-calculations/{id}', 'patch', {
    invalidateKeys: [['/vacation-special-calculations'], ['/vacation-special-calculations/{id}']],
  })
}

/**
 * Hook to delete a vacation special calculation.
 */
export function useDeleteVacationSpecialCalculation() {
  return useApiMutation('/vacation-special-calculations/{id}', 'delete', {
    invalidateKeys: [['/vacation-special-calculations'], ['/vacation-special-calculations/{id}']],
  })
}

// ==================== Vacation Calculation Groups ====================

interface UseVacationCalculationGroupsOptions {
  enabled?: boolean
}

/**
 * Hook to fetch vacation calculation groups.
 */
export function useVacationCalculationGroups(options: UseVacationCalculationGroupsOptions = {}) {
  const { enabled = true } = options
  return useApiQuery('/vacation-calculation-groups', { enabled })
}

/**
 * Hook to fetch a single vacation calculation group by ID.
 */
export function useVacationCalculationGroup(id: string, enabled = true) {
  return useApiQuery('/vacation-calculation-groups/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to create a new vacation calculation group.
 */
export function useCreateVacationCalculationGroup() {
  return useApiMutation('/vacation-calculation-groups', 'post', {
    invalidateKeys: [['/vacation-calculation-groups']],
  })
}

/**
 * Hook to update an existing vacation calculation group.
 */
export function useUpdateVacationCalculationGroup() {
  return useApiMutation('/vacation-calculation-groups/{id}', 'patch', {
    invalidateKeys: [['/vacation-calculation-groups'], ['/vacation-calculation-groups/{id}']],
  })
}

/**
 * Hook to delete a vacation calculation group.
 */
export function useDeleteVacationCalculationGroup() {
  return useApiMutation('/vacation-calculation-groups/{id}', 'delete', {
    invalidateKeys: [['/vacation-calculation-groups'], ['/vacation-calculation-groups/{id}']],
  })
}

// ==================== Vacation Capping Rules ====================

interface UseVacationCappingRulesOptions {
  enabled?: boolean
}

/**
 * Hook to fetch vacation capping rules.
 */
export function useVacationCappingRules(options: UseVacationCappingRulesOptions = {}) {
  const { enabled = true } = options
  return useApiQuery('/vacation-capping-rules', { enabled })
}

/**
 * Hook to fetch a single vacation capping rule by ID.
 */
export function useVacationCappingRule(id: string, enabled = true) {
  return useApiQuery('/vacation-capping-rules/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to create a new vacation capping rule.
 */
export function useCreateVacationCappingRule() {
  return useApiMutation('/vacation-capping-rules', 'post', {
    invalidateKeys: [['/vacation-capping-rules']],
  })
}

/**
 * Hook to update an existing vacation capping rule.
 */
export function useUpdateVacationCappingRule() {
  return useApiMutation('/vacation-capping-rules/{id}', 'patch', {
    invalidateKeys: [['/vacation-capping-rules'], ['/vacation-capping-rules/{id}']],
  })
}

/**
 * Hook to delete a vacation capping rule.
 */
export function useDeleteVacationCappingRule() {
  return useApiMutation('/vacation-capping-rules/{id}', 'delete', {
    invalidateKeys: [['/vacation-capping-rules'], ['/vacation-capping-rules/{id}']],
  })
}

// ==================== Vacation Capping Rule Groups ====================

interface UseVacationCappingRuleGroupsOptions {
  enabled?: boolean
}

/**
 * Hook to fetch vacation capping rule groups.
 */
export function useVacationCappingRuleGroups(options: UseVacationCappingRuleGroupsOptions = {}) {
  const { enabled = true } = options
  return useApiQuery('/vacation-capping-rule-groups', { enabled })
}

/**
 * Hook to fetch a single vacation capping rule group by ID.
 */
export function useVacationCappingRuleGroup(id: string, enabled = true) {
  return useApiQuery('/vacation-capping-rule-groups/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to create a new vacation capping rule group.
 */
export function useCreateVacationCappingRuleGroup() {
  return useApiMutation('/vacation-capping-rule-groups', 'post', {
    invalidateKeys: [['/vacation-capping-rule-groups']],
  })
}

/**
 * Hook to update an existing vacation capping rule group.
 */
export function useUpdateVacationCappingRuleGroup() {
  return useApiMutation('/vacation-capping-rule-groups/{id}', 'patch', {
    invalidateKeys: [['/vacation-capping-rule-groups'], ['/vacation-capping-rule-groups/{id}']],
  })
}

/**
 * Hook to delete a vacation capping rule group.
 */
export function useDeleteVacationCappingRuleGroup() {
  return useApiMutation('/vacation-capping-rule-groups/{id}', 'delete', {
    invalidateKeys: [['/vacation-capping-rule-groups'], ['/vacation-capping-rule-groups/{id}']],
  })
}

// ==================== Employee Capping Exceptions ====================

interface UseEmployeeCappingExceptionsOptions {
  enabled?: boolean
}

/**
 * Hook to fetch employee capping exceptions.
 */
export function useEmployeeCappingExceptions(options: UseEmployeeCappingExceptionsOptions = {}) {
  const { enabled = true } = options
  return useApiQuery('/employee-capping-exceptions', { enabled })
}

/**
 * Hook to fetch a single employee capping exception by ID.
 */
export function useEmployeeCappingException(id: string, enabled = true) {
  return useApiQuery('/employee-capping-exceptions/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to create a new employee capping exception.
 */
export function useCreateEmployeeCappingException() {
  return useApiMutation('/employee-capping-exceptions', 'post', {
    invalidateKeys: [['/employee-capping-exceptions']],
  })
}

/**
 * Hook to update an existing employee capping exception.
 */
export function useUpdateEmployeeCappingException() {
  return useApiMutation('/employee-capping-exceptions/{id}', 'patch', {
    invalidateKeys: [['/employee-capping-exceptions'], ['/employee-capping-exceptions/{id}']],
  })
}

/**
 * Hook to delete an employee capping exception.
 */
export function useDeleteEmployeeCappingException() {
  return useApiMutation('/employee-capping-exceptions/{id}', 'delete', {
    invalidateKeys: [['/employee-capping-exceptions'], ['/employee-capping-exceptions/{id}']],
  })
}

// ==================== Previews ====================

/**
 * Hook to calculate vacation entitlement preview.
 */
export function useVacationEntitlementPreview() {
  return useApiMutation('/vacation-entitlement/preview', 'post', {
    invalidateKeys: [],
  })
}

/**
 * Hook to calculate vacation carryover preview.
 */
export function useVacationCarryoverPreview() {
  return useApiMutation('/vacation-carryover/preview', 'post', {
    invalidateKeys: [],
  })
}
