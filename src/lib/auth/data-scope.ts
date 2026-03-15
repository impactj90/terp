/**
 * Shared Data Scope Utilities
 *
 * Reusable functions for enforcing data scope on models that reference
 * employees via an `employeeId` FK (corrections, order bookings, etc.).
 *
 * Two enforcement patterns:
 * 1. Pre-filter (list queries): buildRelatedEmployeeDataScopeWhere() -> Prisma WHERE clause
 * 2. Post-fetch (getById/mutations): checkRelatedEmployeeDataScope() -> throws if out of scope
 */
import type { DataScope } from "./middleware"

/**
 * Error thrown when a record is outside the user's data scope.
 * Mapped to FORBIDDEN by handleServiceError (name ends with "ForbiddenError").
 */
export class DataScopeForbiddenError extends Error {
  constructor(message = "Record not within data scope") {
    super(message)
    this.name = "DataScopeForbiddenError"
  }
}

/**
 * Builds a Prisma WHERE clause for data scope filtering on models
 * that have an `employeeId` FK with an employee relation that has `departmentId`.
 *
 * For "department" scope: { employee: { departmentId: { in: departmentIds } } }
 * For "employee" scope: { employeeId: { in: employeeIds } }
 * For "all" or "tenant": null (no additional filter needed)
 */
export function buildRelatedEmployeeDataScopeWhere(
  dataScope: DataScope
): Record<string, unknown> | null {
  if (dataScope.type === "department") {
    return { employee: { departmentId: { in: dataScope.departmentIds } } }
  } else if (dataScope.type === "employee") {
    return { employeeId: { in: dataScope.employeeIds } }
  }
  return null
}

/**
 * Checks that a record with an employeeId falls within the user's data scope.
 * Throws DataScopeForbiddenError if not.
 *
 * Requires the record to have `employeeId` and optionally `employee.departmentId`
 * (the latter is needed for department-scoped checks).
 */
export function checkRelatedEmployeeDataScope(
  dataScope: DataScope,
  item: {
    employeeId: string
    employee?: { departmentId: string | null } | null
  },
  entityName = "Record"
): void {
  if (dataScope.type === "department") {
    if (
      !item.employee?.departmentId ||
      !dataScope.departmentIds.includes(item.employee.departmentId)
    ) {
      throw new DataScopeForbiddenError(`${entityName} not within data scope`)
    }
  } else if (dataScope.type === "employee") {
    if (!dataScope.employeeIds.includes(item.employeeId)) {
      throw new DataScopeForbiddenError(`${entityName} not within data scope`)
    }
  }
}

/**
 * Merges a data scope WHERE clause into an existing WHERE object.
 * Handles the case where both the existing WHERE and scope WHERE
 * have an `employee` relation filter by merging them.
 */
export function mergeDataScopeWhere(
  where: Record<string, unknown>,
  scopeWhere: Record<string, unknown> | null
): void {
  if (!scopeWhere) return

  if (scopeWhere.employee && where.employee) {
    where.employee = {
      ...((where.employee as Record<string, unknown>) || {}),
      ...((scopeWhere.employee as Record<string, unknown>) || {}),
    }
  } else {
    Object.assign(where, scopeWhere)
  }
}
