/**
 * Calculation Engine Types
 *
 * All input/output types, enums, and constants for the daily calculation engine.
 * Ported from Go: apps/api/internal/calculation/types.go
 *
 * All times are integers in minutes from midnight (0-1439).
 * All durations are integers in minutes.
 * UUIDs are passed through as strings (no validation in this layer).
 */

// --- Enums (string literal union types) ---

export type BookingDirection = "in" | "out"

export type BookingCategory = "work" | "break"

export type BreakType = "fixed" | "variable" | "minimum"

export type RoundingType = "none" | "up" | "down" | "nearest" | "add" | "subtract"

export type PlanType = "fixed" | "flextime"

export type CappingSource = "early_arrival" | "late_leave" | "max_net_time"

export type SurchargeCalculationType = "per_minute" | "fixed" | "percentage"

// --- Input Types ---

/** A single booking for calculation. */
export interface BookingInput {
  id: string
  time: number          // Minutes from midnight (0-1439)
  direction: BookingDirection
  category: BookingCategory
  pairId: string | null
}

/** Break rule from the day plan. */
export interface BreakConfig {
  type: BreakType
  startTime: number | null    // For fixed breaks: window start (minutes from midnight)
  endTime: number | null      // For fixed breaks: window end (minutes from midnight)
  duration: number            // Break duration in minutes
  afterWorkMinutes: number | null  // For minimum breaks: trigger threshold
  autoDeduct: boolean
  isPaid: boolean
  minutesDifference: boolean  // For minimum breaks: proportional deduction when near threshold
}

/** Rounding rules. */
export interface RoundingConfig {
  type: RoundingType
  interval: number      // Rounding interval in minutes for up/down/nearest modes
  addValue: number      // Fixed value to add/subtract for add/subtract modes
  anchorTime: number | null  // Optional: anchor point for relative rounding (minutes from midnight)
}

/** Tolerance/grace period rules. */
export interface ToleranceConfig {
  comePlus: number      // Grace period for late arrivals (minutes)
  comeMinus: number     // Grace period for early arrivals (minutes)
  goPlus: number        // Grace period for late departures (minutes)
  goMinus: number       // Grace period for early departures (minutes)
}

/** All configuration needed for a day's calculation. */
export interface DayPlanInput {
  planType: PlanType

  // Time windows (minutes from midnight)
  comeFrom: number | null     // Earliest allowed arrival
  comeTo: number | null       // Latest allowed arrival
  goFrom: number | null       // Earliest allowed departure
  goTo: number | null         // Latest allowed departure
  coreStart: number | null    // Flextime core hours start
  coreEnd: number | null      // Flextime core hours end

  // Target hours
  regularHours: number        // Target work duration in minutes

  // Rules
  tolerance: ToleranceConfig
  roundingCome: RoundingConfig | null
  roundingGo: RoundingConfig | null
  breaks: BreakConfig[]
  minWorkTime: number | null       // Minimum work duration
  maxNetWorkTime: number | null    // Maximum credited work time

  // VariableWorkTime enables tolerance_come_minus for evaluation window capping.
  // ZMI: variable Arbeitszeit
  variableWorkTime: boolean

  // RoundAllBookings applies rounding to every in/out booking.
  // When false (default), only the first arrival and last departure are rounded.
  // ZMI: Alle Buchungen runden
  roundAllBookings: boolean

  // RoundRelativeToPlan anchors rounding grid at ComeFrom/GoFrom instead of midnight.
  // ZMI: "Abgleich relativ zur Kommt-/Gehtzeit" (Section 7.8)
  roundRelativeToPlan: boolean
}

/** All data needed for a day's calculation. */
export interface CalculationInput {
  employeeId: string
  date: Date
  bookings: BookingInput[]
  dayPlan: DayPlanInput
}

// --- Output Types ---

/** A paired in/out booking. */
export interface BookingPair {
  inBooking: BookingInput | null
  outBooking: BookingInput | null
  category: BookingCategory
  duration: number          // Calculated duration in minutes
}

/** A single instance of time being capped. */
export interface CappedTime {
  minutes: number           // Amount of time capped in minutes
  source: CappingSource     // Why the time was capped
  reason: string            // Human-readable explanation
}

/** Aggregated capping information for a day. */
export interface CappingResult {
  totalCapped: number       // Total minutes capped from all sources
  items: CappedTime[]       // Individual capping items with details
}

/** Results of pairing bookings. */
export interface PairingResult {
  pairs: BookingPair[]
  unpairedInIds: string[]
  unpairedOutIds: string[]
  warnings: string[]
}

/** Result of break calculations. */
export interface BreakDeductionResult {
  deductedMinutes: number   // Total minutes to deduct
  warnings: string[]        // Any warnings generated
}

/** All calculated values for a day. */
export interface CalculationResult {
  // Time calculations (all in minutes)
  grossTime: number         // Total time before breaks
  netTime: number           // Time after breaks
  targetTime: number        // Expected work time from day plan
  overtime: number          // max(0, netTime - targetTime)
  undertime: number         // max(0, targetTime - netTime)
  breakTime: number         // Total break duration

  // Booking summary
  firstCome: number | null  // First arrival (minutes from midnight)
  lastGo: number | null     // Last departure (minutes from midnight)
  bookingCount: number

  // Calculated times per booking (for updating Booking.CalculatedTime)
  calculatedTimes: Map<string, number>

  // Pairing results
  pairs: BookingPair[]
  unpairedInIds: string[]
  unpairedOutIds: string[]

  // Capping results
  cappedTime: number        // Total minutes capped from all sources
  capping: CappingResult    // Detailed capping breakdown

  // Status
  hasError: boolean
  errorCodes: string[]
  warnings: string[]
}

// --- Surcharge Types ---

/** A work period in minutes from midnight. */
export interface TimePeriod {
  start: number             // Minutes from midnight (0-1439)
  end: number               // Minutes from midnight (0-1440)
}

/** Surcharge configuration from day plan bonuses. */
export interface SurchargeConfig {
  accountId: string
  accountCode: string
  timeFrom: number          // Window start: minutes from midnight (0-1439)
  timeTo: number            // Window end: minutes from midnight (0-1440, must be > timeFrom)
  appliesOnHoliday: boolean
  appliesOnWorkday: boolean
  holidayCategories: number[]  // Which holiday categories (1, 2, 3) - empty = all
  calculationType: string   // "per_minute" (default), "fixed", "percentage"
  valueMinutes: number      // Flat value for fixed, percentage for percentage type
  minWorkMinutes: number | null  // Minimum daily net work time required to apply bonus
}

/** Calculated surcharge for one config. */
export interface SurchargeResult {
  accountId: string
  accountCode: string
  minutes: number
}

/** All surcharges for a day. */
export interface SurchargeCalculationResult {
  surcharges: SurchargeResult[]
  totalMinutes: number
}
