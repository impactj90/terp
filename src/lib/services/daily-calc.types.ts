/**
 * DailyCalcService Types
 *
 * TypeScript interfaces, types, and constants for the DailyCalcService.
 * Ported from Go: apps/api/internal/service/daily_calc.go
 */

import type { Prisma } from "@/generated/prisma/client"

// --- Raw SQL types for AbsenceDay (not in Prisma schema) ---

export interface AbsenceDayRow {
  id: string
  tenant_id: string
  employee_id: string
  absence_date: Date
  absence_type_id: string
  duration: string // Decimal as string from raw SQL
  half_day_period: string | null
  status: string
  approved_by: string | null
  approved_at: Date | null
  rejection_reason: string | null
  notes: string | null
  created_by: string | null
  created_at: Date
  updated_at: Date
  // Joined fields from absence_types
  at_portion: number | null
  at_priority: number | null
  at_code: string | null
  // Joined fields from calculation_rules (via absence_types.calculation_rule_id)
  cr_account_id: string | null
  cr_value: number | null
  cr_factor: string | null // Decimal as string from raw SQL
}

// --- Day Change Behavior constants ---

export const DAY_CHANGE_NONE = "none"
export const DAY_CHANGE_AT_ARRIVAL = "at_arrival"
export const DAY_CHANGE_AT_DEPARTURE = "at_departure"
export const DAY_CHANGE_AUTO_COMPLETE = "auto_complete"

// --- No Booking Behavior constants ---

export const NO_BOOKING_ERROR = "error"
export const NO_BOOKING_ADOPT_TARGET = "adopt_target"
export const NO_BOOKING_DEDUCT_TARGET = "deduct_target"
export const NO_BOOKING_VOCATIONAL_SCHOOL = "vocational_school"
export const NO_BOOKING_TARGET_WITH_ORDER = "target_with_order"

// --- DailyValue status constants ---

export const DV_STATUS_CALCULATED = "calculated"
export const DV_STATUS_ERROR = "error"
export const DV_STATUS_PENDING = "pending"
export const DV_STATUS_APPROVED = "approved"

// --- DailyAccountValue source constants ---

export const DAV_SOURCE_NET_TIME = "net_time"
export const DAV_SOURCE_CAPPED_TIME = "capped_time"
export const DAV_SOURCE_SURCHARGE = "surcharge"
export const DAV_SOURCE_ABSENCE_RULE = "absence_rule"

// --- Auto-complete constants ---

export const AUTO_COMPLETE_NOTES = "Auto-complete day change"

// --- Break booking type codes ---

export const BREAK_CODES = new Set(["P1", "P2", "BREAK_START", "BREAK_END"])

// --- Prisma include types ---

/** Booking with bookingType relation loaded */
export type BookingWithType = Prisma.BookingGetPayload<{
  include: { bookingType: true }
}>

/** EmployeeDayPlan with DayPlan + Breaks + Bonuses loaded */
export type EmployeeDayPlanWithDetails = Prisma.EmployeeDayPlanGetPayload<{
  include: {
    dayPlan: {
      include: {
        breaks: true
        bonuses: { include: { account: true } }
      }
    }
  }
}>

/** DayPlan with breaks and bonuses loaded */
export type DayPlanWithDetails = Prisma.DayPlanGetPayload<{
  include: {
    breaks: true
    bonuses: { include: { account: true } }
  }
}>

// --- Cross-day booking types ---

export interface CrossDayBooking {
  booking: BookingWithType
  offset: number // -1 = previous day, 0 = current day, +1 = next day
  absTime: number // offset * 1440 + editedTime
}

export interface CrossDayPair {
  arrival: CrossDayBooking
  departure: CrossDayBooking
}

// --- DailyValue creation input (before Prisma upsert) ---

export interface DailyValueInput {
  tenantId: string
  employeeId: string
  valueDate: Date
  status: string
  grossTime: number
  netTime: number
  targetTime: number
  overtime: number
  undertime: number
  breakTime: number
  hasError: boolean
  errorCodes: string[]
  warnings: string[]
  firstCome: number | null
  lastGo: number | null
  bookingCount: number
  calculatedAt: Date
  calculationVersion: number
}

// --- Calculation Log types ---

export interface CalculationLog {
  timestamp: string
  employeeId: string
  date: string
  steps: CalculationLogStep[]
}

export interface CalculationLogStep {
  phase: string
  description: string
  input?: Record<string, unknown>
  output?: Record<string, unknown>
}
