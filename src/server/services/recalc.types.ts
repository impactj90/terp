/**
 * RecalcService Types
 *
 * TypeScript interfaces and types for the RecalcService.
 * Ported from Go: apps/api/internal/service/recalc.go
 */

/** A single recalculation failure. */
export interface RecalcError {
  employeeId: string
  date: Date
  error: string
}

/** Outcome of a recalculation operation. */
export interface RecalcResult {
  processedDays: number
  failedDays: number
  errors: RecalcError[]
}
