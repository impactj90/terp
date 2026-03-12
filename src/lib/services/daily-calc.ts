/**
 * DailyCalcService
 *
 * Orchestrates daily time calculations for employees.
 * Loads bookings, day plans, holidays, runs pure calculation engine,
 * and persists DailyValue + DailyAccountValue results.
 *
 * Ported from Go: apps/api/internal/service/daily_calc.go (1,251 lines)
 *
 * Dependencies:
 * - ZMI-TICKET-231: Prisma models (Booking, DailyValue, DailyAccountValue, EmployeeDayPlan)
 * - ZMI-TICKET-232: Bookings CRUD
 * - ZMI-TICKET-233: Calculation Engine (pure math functions)
 */

import type { PrismaClient, DailyValue } from "@/generated/prisma/client"
import {
  calculate,
  splitOvernightSurcharge,
  extractWorkPeriods,
  calculateSurcharges,
  ShiftDetector,
} from "@/lib/calculation"
import type {
  CalculationInput,
  CalculationResult,
  BookingPair,
  BookingInput,
  BreakConfig,
  RoundingConfig,
  ToleranceConfig,
  ShiftDetectionInput,
  DayPlanLoader,
  SurchargeConfig,
} from "@/lib/calculation"
import type {
  BookingWithType,
  EmployeeDayPlanWithDetails,
  DayPlanWithDetails,
  DailyValueInput,
  AbsenceDayRow,
  CalculationLog,
  CalculationLogStep,
} from "./daily-calc.types"
import {
  DAY_CHANGE_NONE,
  DAY_CHANGE_AT_ARRIVAL,
  DAY_CHANGE_AT_DEPARTURE,
  DAY_CHANGE_AUTO_COMPLETE,
  NO_BOOKING_ERROR,
  NO_BOOKING_ADOPT_TARGET,
  NO_BOOKING_DEDUCT_TARGET,
  NO_BOOKING_VOCATIONAL_SCHOOL,
  NO_BOOKING_TARGET_WITH_ORDER,
  DV_STATUS_CALCULATED,
  DV_STATUS_ERROR,
  DAV_SOURCE_NET_TIME,
  DAV_SOURCE_CAPPED_TIME,
  DAV_SOURCE_SURCHARGE,
  AUTO_COMPLETE_NOTES,
} from "./daily-calc.types"
import {
  sameDate,
  addDays,
  dateOnly,
  isBreakBookingType,
  effectiveTime,
  sortedBookingsFromMap,
  filterBookingsByDate,
  partitionBookingsByDate,
  pairWorkBookingsAcrossDays,
  applyDayChangeBehavior,
  findFirstLastWorkBookings,
  getHolidayCredit,
  hasShiftDetection,
  getAlternativePlanIDs,
  getEffectiveRegularHours,
  convertBonusesToSurchargeConfigs,
  calculateAbsenceCredit,
} from "./daily-calc.helpers"

/**
 * DailyCalcService orchestrates daily time calculations.
 *
 * Usage:
 * ```typescript
 * const service = new DailyCalcService(prisma)
 * const dailyValue = await service.calculateDay(tenantId, employeeId, date)
 * ```
 */
export class DailyCalcService {
  constructor(private prisma: PrismaClient) {}

  // =========================================================================
  // Public Methods
  // =========================================================================

  /**
   * Calculate daily time values for an employee on a specific date.
   * This is the main entry point, ported from Go CalculateDay() (lines 176-249).
   *
   * @returns The calculated and persisted DailyValue, or null if calculation should be skipped.
   */
  async calculateDay(
    tenantId: string,
    employeeId: string,
    date: Date
  ): Promise<DailyValue | null> {
    const calcDate = dateOnly(date)

    // 1. Check for holiday
    const { isHoliday, holidayCategory } = await this.checkHoliday(
      tenantId,
      calcDate
    )

    // 2. Get day plan (null = no plan assigned = off day)
    const empDayPlan = await this.loadEmployeeDayPlan(employeeId, calcDate)

    // 3. Load bookings (includes adjacent days for day change behavior)
    const bookings = await this.loadBookingsForCalculation(
      tenantId,
      employeeId,
      calcDate,
      empDayPlan
    )

    // 4. Branch: determine daily value
    let dvInput: DailyValueInput | null = null
    let calcPairs: BookingPair[] = []

    if (!empDayPlan || !empDayPlan.dayPlanId) {
      // Off day - no day plan assigned
      dvInput = this.handleOffDay(employeeId, calcDate, bookings)
    } else if (isHoliday && bookings.length === 0) {
      // Holiday without bookings -- check absence priority override
      const absence = await this.loadAbsenceDay(employeeId, calcDate)
      if (
        absence &&
        absence.status === "approved" &&
        absence.at_priority !== null &&
        absence.at_priority > 0
      ) {
        dvInput = await this.handleAbsenceCredit(
          employeeId,
          calcDate,
          empDayPlan,
          absence
        )
      } else {
        dvInput = await this.handleHolidayCredit(
          employeeId,
          calcDate,
          empDayPlan,
          holidayCategory
        )
      }
    } else if (bookings.length === 0) {
      // No bookings -- apply no-booking behavior
      dvInput = await this.handleNoBookings(
        tenantId,
        employeeId,
        calcDate,
        empDayPlan
      )
      if (dvInput === null) {
        return null // Skip behavior
      }
    } else {
      // Normal calculation with bookings
      const result = await this.calculateWithBookings(
        tenantId,
        employeeId,
        calcDate,
        empDayPlan,
        bookings,
        isHoliday
      )
      dvInput = result.dailyValue
      calcPairs = result.calcPairs
    }

    // 5. Get previous value (for error notification comparison)
    const previousValue = await this.getPreviousDailyValue(employeeId, calcDate)

    // 6. Set tenant and upsert
    dvInput.tenantId = tenantId
    const savedDv = await this.upsertDailyValue(dvInput)

    // 7. Post daily account values (net/cap)
    await this.postDailyAccountValues(
      tenantId,
      employeeId,
      calcDate,
      empDayPlan,
      dvInput
    )

    // 8. Post surcharge values
    await this.postSurchargeValues(
      tenantId,
      employeeId,
      calcDate,
      empDayPlan,
      dvInput,
      calcPairs,
      isHoliday,
      holidayCategory
    )

    // 9. Notify on new errors
    await this.notifyDailyCalcError(
      tenantId,
      employeeId,
      calcDate,
      previousValue?.hasError ?? false,
      dvInput.hasError
    )

    return savedDv
  }

  /**
   * Calculate daily values for a date range.
   * Iterates day-by-day calling calculateDay().
   * Ported from Go RecalculateRange() (lines 1240-1250).
   */
  async calculateDateRange(
    tenantId: string,
    employeeId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<{ count: number; values: DailyValue[] }> {
    const values: DailyValue[] = []
    let count = 0
    const from = dateOnly(fromDate)
    const to = dateOnly(toDate)
    const current = new Date(from)

    while (current <= to) {
      const dv = await this.calculateDay(
        tenantId,
        employeeId,
        new Date(current)
      )
      count++
      if (dv) {
        values.push(dv)
      }
      current.setUTCDate(current.getUTCDate() + 1)
    }

    return { count, values }
  }

  // =========================================================================
  // Private: Data Loading
  // =========================================================================

  /**
   * Load employee day plan with full DayPlan + breaks + bonuses.
   * Ported from Go: empDayPlanRepo.GetForEmployeeDate()
   */
  private async loadEmployeeDayPlan(
    employeeId: string,
    date: Date
  ): Promise<EmployeeDayPlanWithDetails | null> {
    return this.prisma.employeeDayPlan.findFirst({
      where: {
        employeeId,
        planDate: date,
      },
      include: {
        dayPlan: {
          include: {
            breaks: { orderBy: { sortOrder: "asc" } },
            bonuses: {
              include: { account: true },
              orderBy: { sortOrder: "asc" },
            },
          },
        },
      },
    })
  }

  /**
   * Check if the date is a holiday for this tenant.
   * Ported from Go: holidayRepo.GetByDate()
   */
  private async checkHoliday(
    tenantId: string,
    date: Date
  ): Promise<{ isHoliday: boolean; holidayCategory: number }> {
    const holiday = await this.prisma.holiday.findFirst({
      where: { tenantId, holidayDate: date },
    })
    return {
      isHoliday: holiday !== null,
      holidayCategory: holiday?.holidayCategory ?? 0,
    }
  }

  /**
   * Resolve target hours using ZMI priority chain.
   * Ported from Go: resolveTargetHours() (lines 151-172)
   */
  private async resolveTargetHours(
    employeeId: string,
    date: Date,
    dayPlan: DayPlanWithDetails
  ): Promise<number> {
    let employeeTargetMinutes: number | null = null

    // 1. If fromEmployeeMaster, look up employee's dailyTargetHours
    if (dayPlan.fromEmployeeMaster) {
      const emp = await this.prisma.employee.findFirst({
        where: { id: employeeId },
        select: { dailyTargetHours: true },
      })
      if (emp?.dailyTargetHours !== null && emp?.dailyTargetHours !== undefined) {
        employeeTargetMinutes = Math.round(Number(emp.dailyTargetHours) * 60)
      }
    }

    // 2. Check if absence day
    let isAbsenceDay = false
    const absence = await this.loadAbsenceDay(employeeId, date)
    if (absence && absence.status === "approved") {
      isAbsenceDay = true
    }

    // 3. Apply priority chain
    return getEffectiveRegularHours(dayPlan, isAbsenceDay, employeeTargetMinutes)
  }

  /**
   * Load absence day with type (raw SQL since not in Prisma schema).
   * Ported from Go: absenceDayRepo.GetByEmployeeDate()
   */
  private async loadAbsenceDay(
    employeeId: string,
    date: Date
  ): Promise<AbsenceDayRow | null> {
    const rows = await this.prisma.$queryRaw<AbsenceDayRow[]>`
      SELECT ad.*,
             at.portion as at_portion,
             at.priority as at_priority,
             at.code as at_code
      FROM absence_days ad
      LEFT JOIN absence_types at ON at.id = ad.absence_type_id
      WHERE ad.employee_id = ${employeeId}::uuid
        AND ad.absence_date = ${date}::date
      LIMIT 1
    `
    return rows[0] ?? null
  }

  /**
   * Check if rounding is relative to plan from system settings.
   * Ported from Go: settingsLookup.IsRoundingRelativeToPlan()
   */
  private async isRoundingRelativeToPlan(tenantId: string): Promise<boolean> {
    const settings = await this.prisma.systemSetting.findFirst({
      where: { tenantId },
      select: { roundingRelativeToPlan: true },
    })
    return settings?.roundingRelativeToPlan ?? false
  }

  /**
   * Get the previous DailyValue for error notification comparison.
   */
  private async getPreviousDailyValue(
    employeeId: string,
    date: Date
  ): Promise<{ hasError: boolean } | null> {
    return this.prisma.dailyValue.findUnique({
      where: {
        employeeId_valueDate: { employeeId, valueDate: date },
      },
      select: { hasError: true },
    })
  }

  // =========================================================================
  // Private: Booking Loading + Day Change Behavior
  // =========================================================================

  /**
   * Load bookings for the calculation date, handling day change behavior.
   * Ported from Go: loadBookingsForCalculation() (lines 396-426)
   */
  private async loadBookingsForCalculation(
    tenantId: string,
    employeeId: string,
    date: Date,
    empDayPlan: EmployeeDayPlanWithDetails | null
  ): Promise<BookingWithType[]> {
    // Simple load if no day plan or no day change behavior
    if (!empDayPlan || !empDayPlan.dayPlan) {
      return this.loadBookingsForDate(tenantId, employeeId, date)
    }

    const behavior = empDayPlan.dayPlan.dayChangeBehavior
    if (!behavior || behavior === "" || behavior === DAY_CHANGE_NONE) {
      return this.loadBookingsForDate(tenantId, employeeId, date)
    }

    // Load 3-day range for day change behaviors
    const bookings = await this.loadBookingsForDateRange(
      tenantId,
      employeeId,
      addDays(date, -1),
      addDays(date, 1)
    )

    switch (behavior) {
      case DAY_CHANGE_AT_ARRIVAL:
      case DAY_CHANGE_AT_DEPARTURE:
        return applyDayChangeBehavior(date, behavior, bookings)

      case DAY_CHANGE_AUTO_COMPLETE:
        return this.applyAutoCompleteDayChange(
          tenantId,
          employeeId,
          date,
          bookings
        )

      default:
        return filterBookingsByDate(bookings, date)
    }
  }

  /**
   * Load bookings for a single date.
   */
  private async loadBookingsForDate(
    tenantId: string,
    employeeId: string,
    date: Date
  ): Promise<BookingWithType[]> {
    return this.prisma.booking.findMany({
      where: { tenantId, employeeId, bookingDate: date },
      include: { bookingType: true },
      orderBy: [{ bookingDate: "asc" }, { editedTime: "asc" }],
    })
  }

  /**
   * Load bookings for a date range (inclusive).
   */
  private async loadBookingsForDateRange(
    tenantId: string,
    employeeId: string,
    startDate: Date,
    endDate: Date
  ): Promise<BookingWithType[]> {
    return this.prisma.booking.findMany({
      where: {
        tenantId,
        employeeId,
        bookingDate: { gte: startDate, lte: endDate },
      },
      include: { bookingType: true },
      orderBy: [{ bookingDate: "asc" }, { editedTime: "asc" }],
    })
  }

  /**
   * Apply auto-complete day change: create synthetic midnight bookings
   * for cross-day pairs.
   * Ported from Go: applyAutoCompleteDayChange() (lines 692-753)
   */
  private async applyAutoCompleteDayChange(
    tenantId: string,
    employeeId: string,
    date: Date,
    bookings: BookingWithType[]
  ): Promise<BookingWithType[]> {
    const { prev, current, next } = partitionBookingsByDate(bookings, date)
    const pairs = pairWorkBookingsAcrossDays(prev, current, next)

    const selected = new Map<string, BookingWithType>()
    for (const b of current) {
      selected.set(b.id, b)
    }

    const nextDate = addDays(date, 1)
    for (const pair of pairs) {
      // Only process cross-midnight pairs (arrival day 0, departure day +1)
      if (pair.arrival.offset !== 0 || pair.departure.offset !== 1) continue

      if (!pair.arrival.booking.bookingType || !pair.departure.booking.bookingType) {
        throw new Error("auto-complete day change requires booking types to be loaded")
      }

      // Create GO booking at midnight on next day
      const goResult = await this.ensureAutoCompleteBooking(
        tenantId,
        employeeId,
        nextDate,
        pair.departure.booking.bookingType,
        "out",
        bookings
      )
      if (goResult.created) {
        bookings.push(goResult.booking)
      }

      // Create COME booking at midnight on next day
      const comeResult = await this.ensureAutoCompleteBooking(
        tenantId,
        employeeId,
        nextDate,
        pair.arrival.booking.bookingType,
        "in",
        bookings
      )
      if (comeResult.created) {
        bookings.push(comeResult.booking)
      }

      // Add the GO booking to selected for current day
      selected.set(goResult.booking.id, goResult.booking)
    }

    return sortedBookingsFromMap(selected)
  }

  /**
   * Idempotent creation of an auto-complete booking at midnight.
   * Ported from Go: ensureAutoCompleteBooking() (lines 755-792)
   */
  private async ensureAutoCompleteBooking(
    tenantId: string,
    employeeId: string,
    date: Date,
    bookingType: BookingWithType["bookingType"],
    direction: "in" | "out",
    existingBookings: BookingWithType[]
  ): Promise<{ booking: BookingWithType; created: boolean }> {
    // Check in-memory list first (fast path)
    for (const b of existingBookings) {
      if (!sameDate(b.bookingDate, date)) continue
      if (b.source !== "correction" || b.notes !== AUTO_COMPLETE_NOTES || b.editedTime !== 0) continue
      if (
        b.bookingType &&
        b.bookingType.direction === direction &&
        b.bookingTypeId === bookingType.id
      ) {
        return { booking: b, created: false }
      }
    }

    // Re-query DB to guard against concurrent creation (in-memory list may be stale)
    const dbExisting = await this.prisma.booking.findFirst({
      where: {
        tenantId,
        employeeId,
        bookingDate: date,
        bookingTypeId: bookingType.id,
        source: "correction",
        notes: AUTO_COMPLETE_NOTES,
        editedTime: 0,
      },
      include: { bookingType: true },
    })

    if (dbExisting) {
      return { booking: dbExisting, created: false }
    }

    // Create new auto-complete booking
    const newBooking = await this.prisma.booking.create({
      data: {
        tenantId,
        employeeId,
        bookingDate: date,
        bookingTypeId: bookingType.id,
        originalTime: 0,
        editedTime: 0,
        source: "correction",
        notes: AUTO_COMPLETE_NOTES,
      },
      include: { bookingType: true },
    })

    return { booking: newBooking, created: true }
  }

  // =========================================================================
  // Private: Special Case Handlers
  // =========================================================================

  /**
   * Handle off day: no assigned day plan.
   * Ported from Go: handleOffDay() (lines 428-446)
   */
  private handleOffDay(
    employeeId: string,
    date: Date,
    bookings: BookingWithType[]
  ): DailyValueInput {
    const dv: DailyValueInput = {
      tenantId: "", // set by caller
      employeeId,
      valueDate: date,
      status: DV_STATUS_CALCULATED,
      grossTime: 0,
      netTime: 0,
      targetTime: 0,
      overtime: 0,
      undertime: 0,
      breakTime: 0,
      hasError: false,
      errorCodes: [],
      warnings: ["OFF_DAY"],
      firstCome: null,
      lastGo: null,
      bookingCount: 0,
      calculatedAt: new Date(),
      calculationVersion: 1,
    }

    if (bookings.length > 0) {
      dv.warnings.push("BOOKINGS_ON_OFF_DAY")
      dv.bookingCount = bookings.length
    }

    return dv
  }

  /**
   * Handle holiday with no bookings: credit from day plan category.
   * Ported from Go: handleHolidayCredit() (lines 448-484)
   */
  private async handleHolidayCredit(
    employeeId: string,
    date: Date,
    empDayPlan: EmployeeDayPlanWithDetails,
    holidayCategory: number
  ): Promise<DailyValueInput> {
    let targetTime = 0
    if (empDayPlan.dayPlan) {
      targetTime = await this.resolveTargetHours(
        employeeId,
        date,
        empDayPlan.dayPlan
      )
    }

    // Get holiday credit from day plan
    let credit = 0
    if (empDayPlan.dayPlan && holidayCategory > 0) {
      credit = getHolidayCredit(empDayPlan.dayPlan, holidayCategory)
    }

    return {
      tenantId: "", // set by caller
      employeeId,
      valueDate: date,
      status: DV_STATUS_CALCULATED,
      grossTime: credit,
      netTime: credit,
      targetTime,
      overtime: 0,
      undertime: credit < targetTime ? targetTime - credit : 0,
      breakTime: 0,
      hasError: false,
      errorCodes: [],
      warnings: ["HOLIDAY"],
      firstCome: null,
      lastGo: null,
      bookingCount: 0,
      calculatedAt: new Date(),
      calculationVersion: 1,
    }
  }

  /**
   * Handle absence priority override on holiday.
   * Ported from Go: handleAbsenceCredit() (lines 488-519)
   */
  private async handleAbsenceCredit(
    employeeId: string,
    date: Date,
    empDayPlan: EmployeeDayPlanWithDetails,
    absenceDay: AbsenceDayRow
  ): Promise<DailyValueInput> {
    let targetTime = 0
    if (empDayPlan.dayPlan) {
      targetTime = await this.resolveTargetHours(
        employeeId,
        date,
        empDayPlan.dayPlan
      )
    }

    // Calculate credit: regelarbeitszeit * portion * duration
    const credit = calculateAbsenceCredit(
      targetTime,
      absenceDay.at_portion ?? 1,
      Number(absenceDay.duration)
    )

    return {
      tenantId: "", // set by caller
      employeeId,
      valueDate: date,
      status: DV_STATUS_CALCULATED,
      grossTime: credit,
      netTime: credit,
      targetTime,
      overtime: 0,
      undertime: credit < targetTime ? targetTime - credit : 0,
      breakTime: 0,
      hasError: false,
      errorCodes: [],
      warnings: ["ABSENCE_ON_HOLIDAY"],
      firstCome: null,
      lastGo: null,
      bookingCount: 0,
      calculatedAt: new Date(),
      calculationVersion: 1,
    }
  }

  /**
   * Handle no bookings: apply noBookingBehavior from day plan.
   * Ported from Go: handleNoBookings() (lines 521-653)
   *
   * Returns null to signal "skip" behavior (no daily value should be created).
   */
  private async handleNoBookings(
    tenantId: string,
    employeeId: string,
    date: Date,
    empDayPlan: EmployeeDayPlanWithDetails
  ): Promise<DailyValueInput | null> {
    let targetTime = 0
    let behavior = NO_BOOKING_ERROR
    if (empDayPlan.dayPlan) {
      targetTime = await this.resolveTargetHours(
        employeeId,
        date,
        empDayPlan.dayPlan
      )
      behavior = empDayPlan.dayPlan.noBookingBehavior || NO_BOOKING_ERROR
    }

    const now = new Date()

    switch (behavior) {
      case NO_BOOKING_ADOPT_TARGET:
        // ZMI: Sollzeit uebernehmen -- credit target time as if worked
        return {
          tenantId: "",
          employeeId,
          valueDate: date,
          status: DV_STATUS_CALCULATED,
          grossTime: targetTime,
          netTime: targetTime,
          targetTime,
          overtime: 0,
          undertime: 0,
          breakTime: 0,
          hasError: false,
          errorCodes: [],
          warnings: ["NO_BOOKINGS_CREDITED"],
          firstCome: null,
          lastGo: null,
          bookingCount: 0,
          calculatedAt: now,
          calculationVersion: 1,
        }

      case NO_BOOKING_DEDUCT_TARGET:
        // ZMI: Sollzeit abziehen -- undertime = target, no credit
        return {
          tenantId: "",
          employeeId,
          valueDate: date,
          status: DV_STATUS_CALCULATED,
          grossTime: 0,
          netTime: 0,
          targetTime,
          overtime: 0,
          undertime: targetTime,
          breakTime: 0,
          hasError: false,
          errorCodes: [],
          warnings: ["NO_BOOKINGS_DEDUCTED"],
          firstCome: null,
          lastGo: null,
          bookingCount: 0,
          calculatedAt: now,
          calculationVersion: 1,
        }

      case NO_BOOKING_VOCATIONAL_SCHOOL: {
        // ZMI: Berufsschule -- auto-create absence for past dates
        const warnings: string[] = ["VOCATIONAL_SCHOOL"]

        // Only create absence for past dates (before today)
        const today = dateOnly(new Date())
        if (date < today) {
          // Check if absence already exists (idempotency)
          const existing = await this.loadAbsenceDay(employeeId, date)
          if (!existing) {
            try {
              await this.createAutoAbsenceByCode(
                tenantId,
                employeeId,
                date,
                "SB"
              )
              warnings.push("ABSENCE_CREATED")
            } catch {
              warnings.push("ABSENCE_CREATION_FAILED")
            }
          }
        }

        return {
          tenantId: "",
          employeeId,
          valueDate: date,
          status: DV_STATUS_CALCULATED,
          grossTime: targetTime,
          netTime: targetTime,
          targetTime,
          overtime: 0,
          undertime: 0,
          breakTime: 0,
          hasError: false,
          errorCodes: [],
          warnings,
          firstCome: null,
          lastGo: null,
          bookingCount: 0,
          calculatedAt: now,
          calculationVersion: 1,
        }
      }

      case NO_BOOKING_TARGET_WITH_ORDER: {
        // ZMI: Sollzeit mit Auftrag -- credit target and create auto order booking
        const warnings: string[] = ["NO_BOOKINGS_CREDITED"]

        if (targetTime > 0) {
          const emp = await this.prisma.employee.findFirst({
            where: { id: employeeId },
            select: {
              id: true,
              tenantId: true,
              defaultOrderId: true,
              defaultActivityId: true,
            },
          })

          if (emp?.defaultOrderId) {
            try {
              // Delete any previous auto-bookings for this date
              await this.prisma.orderBooking.deleteMany({
                where: {
                  employeeId,
                  bookingDate: new Date(date),
                  source: "auto",
                },
              })
              // Create fresh auto order booking
              await this.prisma.orderBooking.create({
                data: {
                  tenantId: emp.tenantId,
                  employeeId,
                  orderId: emp.defaultOrderId,
                  activityId: emp.defaultActivityId,
                  bookingDate: new Date(date),
                  timeMinutes: targetTime,
                  source: "auto",
                },
              })
              warnings.push("ORDER_BOOKING_CREATED")
            } catch {
              warnings.push("ORDER_BOOKING_FAILED")
            }
          } else {
            warnings.push("NO_DEFAULT_ORDER")
          }
        }

        return {
          tenantId: "",
          employeeId,
          valueDate: date,
          status: DV_STATUS_CALCULATED,
          grossTime: targetTime,
          netTime: targetTime,
          targetTime,
          overtime: 0,
          undertime: 0,
          breakTime: 0,
          hasError: false,
          errorCodes: [],
          warnings,
          firstCome: null,
          lastGo: null,
          bookingCount: 0,
          calculatedAt: now,
          calculationVersion: 1,
        }
      }

      case NO_BOOKING_ERROR:
      default:
        // ZMI: Keine Auswertung -- mark as error
        return {
          tenantId: "",
          employeeId,
          valueDate: date,
          status: DV_STATUS_ERROR,
          grossTime: 0,
          netTime: 0,
          targetTime,
          overtime: 0,
          undertime: targetTime,
          breakTime: 0,
          hasError: true,
          errorCodes: ["NO_BOOKINGS"],
          warnings: [],
          firstCome: null,
          lastGo: null,
          bookingCount: 0,
          calculatedAt: now,
          calculationVersion: 1,
        }
    }
  }

  /**
   * Create an auto absence day by type code (raw SQL).
   * Used by vocational_school no-booking behavior.
   */
  private async createAutoAbsenceByCode(
    tenantId: string,
    employeeId: string,
    date: Date,
    absenceTypeCode: string
  ): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO absence_days (
        tenant_id, employee_id, absence_date, absence_type_id,
        duration, status, created_at, updated_at
      )
      SELECT
        ${tenantId}::uuid, ${employeeId}::uuid, ${date}::date, at.id,
        1.00, 'approved', NOW(), NOW()
      FROM absence_types at
      WHERE at.tenant_id = ${tenantId}::uuid
        AND at.code = ${absenceTypeCode}
      LIMIT 1
    `
  }

  // =========================================================================
  // Private: Calculation with Bookings
  // =========================================================================

  /**
   * Calculate with bookings: shift detection + build input + run calc engine.
   * Ported from Go: calculateWithBookings() (lines 998-1068)
   */
  private async calculateWithBookings(
    tenantId: string,
    employeeId: string,
    date: Date,
    empDayPlan: EmployeeDayPlanWithDetails,
    bookings: BookingWithType[],
    isHoliday: boolean
  ): Promise<{ dailyValue: DailyValueInput; calcPairs: BookingPair[] }> {
    let currentEmpDayPlan = empDayPlan
    let shiftResult: { hasError: boolean; errorCode: string } | null = null

    // 1. Shift detection (if configured)
    if (currentEmpDayPlan.dayPlan && hasShiftDetection(currentEmpDayPlan.dayPlan)) {
      const { firstCome, lastGo } = findFirstLastWorkBookings(bookings)

      // Build shift detection loader with pre-loaded alternative plans
      const loader = await this.preloadShiftDetectionPlans(currentEmpDayPlan.dayPlan)
      const detector = new ShiftDetector(loader)

      const assignedInput = this.buildShiftDetectionInput(currentEmpDayPlan.dayPlan)
      const result = detector.detectShift(assignedInput, firstCome, lastGo)
      shiftResult = { hasError: result.hasError, errorCode: result.errorCode }

      // If shifted to different plan, reload it
      if (!result.isOriginalPlan && result.matchedPlanId) {
        const matchedPlan = await this.prisma.dayPlan.findFirst({
          where: { id: result.matchedPlanId },
          include: {
            breaks: { orderBy: { sortOrder: "asc" } },
            bonuses: {
              include: { account: true },
              orderBy: { sortOrder: "asc" },
            },
          },
        })

        if (matchedPlan) {
          // Create a synthetic EmployeeDayPlan with the matched plan
          currentEmpDayPlan = {
            ...currentEmpDayPlan,
            dayPlanId: matchedPlan.id,
            dayPlan: matchedPlan,
          }
        }
      }
    }

    // 2. Build calculation input
    const input = await this.buildCalcInput(
      tenantId,
      employeeId,
      date,
      currentEmpDayPlan,
      bookings
    )

    // 3. Run calculation
    const result = calculate(input)

    // 4. Apply shift detection errors
    if (shiftResult?.hasError) {
      result.errorCodes.push(shiftResult.errorCode)
      result.hasError = true
    }

    // 5. Add holiday warning if applicable
    if (isHoliday) {
      result.warnings.push("WORKED_ON_HOLIDAY")
    }

    // 6. Convert to DailyValueInput
    const dailyValue = this.resultToDailyValue(employeeId, date, result)

    // 7. Update booking calculated times
    if (result.calculatedTimes.size > 0) {
      const updates = Array.from(result.calculatedTimes.entries()).map(
        ([id, time]) =>
          this.prisma.booking.update({
            where: { id },
            data: { calculatedTime: time },
          })
      )
      await this.prisma.$transaction(updates)
    }

    return { dailyValue, calcPairs: result.pairs }
  }

  /**
   * Build CalculationInput from Prisma models.
   * Ported from Go: buildCalcInput() (lines 1070-1207)
   */
  private async buildCalcInput(
    tenantId: string,
    employeeId: string,
    date: Date,
    empDayPlan: EmployeeDayPlanWithDetails,
    bookings: BookingWithType[]
  ): Promise<CalculationInput> {
    const input: CalculationInput = {
      employeeId,
      date,
      bookings: [],
      dayPlan: {
        planType: "fixed",
        comeFrom: null,
        comeTo: null,
        goFrom: null,
        goTo: null,
        coreStart: null,
        coreEnd: null,
        regularHours: 0,
        tolerance: { comePlus: 0, comeMinus: 0, goPlus: 0, goMinus: 0 },
        roundingCome: null,
        roundingGo: null,
        breaks: [],
        minWorkTime: null,
        maxNetWorkTime: null,
        variableWorkTime: false,
        roundAllBookings: false,
        roundRelativeToPlan: false,
      },
    }

    // Build DayPlan input
    if (empDayPlan.dayPlan) {
      const dp = empDayPlan.dayPlan

      // Tolerance with plan-type adjustments
      const tolerance: ToleranceConfig = {
        comePlus: dp.toleranceComePlus,
        comeMinus: dp.toleranceComeMinus,
        goPlus: dp.toleranceGoPlus,
        goMinus: dp.toleranceGoMinus,
      }
      let variableWorkTime = dp.variableWorkTime

      switch (dp.planType) {
        case "flextime":
          // ZMI: flextime ignores Come+ and Go-; variable work time not applicable
          tolerance.comePlus = 0
          tolerance.goMinus = 0
          variableWorkTime = false
          break
        case "fixed":
          // ZMI: Come- only applies to fixed plans if variable work time is enabled
          if (!dp.variableWorkTime) {
            tolerance.comeMinus = 0
          }
          break
      }

      // Resolve target hours using ZMI priority chain
      const regularHours = await this.resolveTargetHours(
        employeeId,
        date,
        dp
      )

      // Check system setting for relative rounding
      const roundRelativeToPlan = await this.isRoundingRelativeToPlan(tenantId)

      input.dayPlan = {
        planType: dp.planType as "fixed" | "flextime",
        comeFrom: dp.comeFrom,
        comeTo: dp.comeTo,
        goFrom: dp.goFrom,
        goTo: dp.goTo,
        coreStart: dp.coreStart,
        coreEnd: dp.coreEnd,
        regularHours,
        tolerance,
        roundingCome: null,
        roundingGo: null,
        breaks: [],
        minWorkTime: dp.minWorkTime,
        maxNetWorkTime: dp.maxNetWorkTime,
        variableWorkTime,
        roundAllBookings: dp.roundAllBookings,
        roundRelativeToPlan,
      }

      // Rounding - come
      if (dp.roundingComeType) {
        const config: RoundingConfig = {
          type: dp.roundingComeType as RoundingConfig["type"],
          interval: dp.roundingComeInterval ?? 0,
          addValue: dp.roundingComeAddValue ?? 0,
          anchorTime: null,
        }
        input.dayPlan.roundingCome = config
      }

      // Rounding - go
      if (dp.roundingGoType) {
        const config: RoundingConfig = {
          type: dp.roundingGoType as RoundingConfig["type"],
          interval: dp.roundingGoInterval ?? 0,
          addValue: dp.roundingGoAddValue ?? 0,
          anchorTime: null,
        }
        input.dayPlan.roundingGo = config
      }

      // Breaks
      input.dayPlan.breaks = dp.breaks.map(
        (b): BreakConfig => ({
          type: b.breakType as BreakConfig["type"],
          startTime: b.startTime,
          endTime: b.endTime,
          duration: b.duration,
          afterWorkMinutes: b.afterWorkMinutes,
          autoDeduct: b.autoDeduct,
          isPaid: b.isPaid,
          minutesDifference: b.minutesDifference,
        })
      )
    }

    // Convert bookings
    input.bookings = bookings.map(
      (b): BookingInput => ({
        id: b.id,
        time: effectiveTime(b),
        direction:
          b.bookingType?.direction === "out" ? "out" : "in",
        category:
          b.bookingType && isBreakBookingType(b.bookingType.code)
            ? "break"
            : "work",
        pairId: b.pairId,
      })
    )

    return input
  }

  /**
   * Convert CalculationResult to DailyValueInput.
   * Ported from Go: resultToDailyValue() (lines 1209-1237)
   */
  private resultToDailyValue(
    employeeId: string,
    date: Date,
    result: CalculationResult
  ): DailyValueInput {
    return {
      tenantId: "", // set by caller
      employeeId,
      valueDate: date,
      status: result.hasError ? DV_STATUS_ERROR : DV_STATUS_CALCULATED,
      grossTime: result.grossTime,
      netTime: result.netTime,
      targetTime: result.targetTime,
      overtime: result.overtime,
      undertime: result.undertime,
      breakTime: result.breakTime,
      hasError: result.hasError,
      errorCodes: result.errorCodes,
      warnings: result.warnings,
      firstCome: result.firstCome,
      lastGo: result.lastGo,
      bookingCount: result.bookingCount,
      calculatedAt: new Date(),
      calculationVersion: 1,
    }
  }

  // =========================================================================
  // Private: Shift Detection Helpers
  // =========================================================================

  /**
   * Build ShiftDetectionInput from a DayPlan.
   * Ported from Go: buildShiftDetectionInput() (lines 962-975)
   */
  private buildShiftDetectionInput(
    dayPlan: DayPlanWithDetails
  ): ShiftDetectionInput {
    return {
      planId: dayPlan.id,
      planCode: dayPlan.code,
      arriveFrom: dayPlan.shiftDetectArriveFrom,
      arriveTo: dayPlan.shiftDetectArriveTo,
      departFrom: dayPlan.shiftDetectDepartFrom,
      departTo: dayPlan.shiftDetectDepartTo,
      alternativePlanIds: getAlternativePlanIDs(dayPlan),
    }
  }

  /**
   * Create a caching DayPlanLoader for shift detection.
   * Ported from Go: shiftDetectionLoader (lines 931-975)
   */
  private createShiftDetectionLoader(): DayPlanLoader {
    const cache = new Map<string, ShiftDetectionInput | null>()

    return {
      loadShiftDetectionInput(id: string): ShiftDetectionInput | null {
        // Note: This is synchronous in the interface but we need async Prisma.
        // For shift detection, we pre-cache via the plan's alternativePlanIds.
        // The Go code uses a sync interface too, with internal caching.
        // For the TS port, we'll use a pre-loaded cache approach.
        if (cache.has(id)) {
          return cache.get(id) ?? null
        }
        // If not cached, return null (plan not pre-loaded).
        // In practice, the detector only calls this for alternative plan IDs
        // which should be pre-loaded before calling detectShift().
        return null
      },
    }
  }

  /**
   * Pre-load alternative plans into the shift detection loader cache.
   * Must be called before detectShift() when shift detection is active.
   */
  private async preloadShiftDetectionPlans(
    dayPlan: DayPlanWithDetails
  ): Promise<DayPlanLoader> {
    const cache = new Map<string, ShiftDetectionInput | null>()
    const altIds = getAlternativePlanIDs(dayPlan)

    // Load all alternative plans in parallel
    const plans = await Promise.all(
      altIds.map((id) =>
        this.prisma.dayPlan.findFirst({
          where: { id },
          select: {
            id: true,
            code: true,
            shiftDetectArriveFrom: true,
            shiftDetectArriveTo: true,
            shiftDetectDepartFrom: true,
            shiftDetectDepartTo: true,
            shiftAltPlan1: true,
            shiftAltPlan2: true,
            shiftAltPlan3: true,
            shiftAltPlan4: true,
            shiftAltPlan5: true,
            shiftAltPlan6: true,
          },
        })
      )
    )

    for (const plan of plans) {
      if (plan) {
        cache.set(plan.id, {
          planId: plan.id,
          planCode: plan.code,
          arriveFrom: plan.shiftDetectArriveFrom,
          arriveTo: plan.shiftDetectArriveTo,
          departFrom: plan.shiftDetectDepartFrom,
          departTo: plan.shiftDetectDepartTo,
          alternativePlanIds: [
            plan.shiftAltPlan1,
            plan.shiftAltPlan2,
            plan.shiftAltPlan3,
            plan.shiftAltPlan4,
            plan.shiftAltPlan5,
            plan.shiftAltPlan6,
          ].filter((id): id is string => id !== null),
        })
      }
    }

    return {
      loadShiftDetectionInput(id: string): ShiftDetectionInput | null {
        return cache.get(id) ?? null
      },
    }
  }

  // =========================================================================
  // Private: Persistence (Upsert + Account Postings + Notification)
  // =========================================================================

  /**
   * Upsert DailyValue using Prisma's composite unique.
   * Ported from Go: dailyValueRepo.Upsert()
   */
  private async upsertDailyValue(input: DailyValueInput): Promise<DailyValue> {
    return this.prisma.dailyValue.upsert({
      where: {
        employeeId_valueDate: {
          employeeId: input.employeeId,
          valueDate: input.valueDate,
        },
      },
      create: {
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        valueDate: input.valueDate,
        status: input.status,
        grossTime: input.grossTime,
        netTime: input.netTime,
        targetTime: input.targetTime,
        overtime: input.overtime,
        undertime: input.undertime,
        breakTime: input.breakTime,
        hasError: input.hasError,
        errorCodes: input.errorCodes,
        warnings: input.warnings,
        firstCome: input.firstCome,
        lastGo: input.lastGo,
        bookingCount: input.bookingCount,
        calculatedAt: input.calculatedAt,
        calculationVersion: input.calculationVersion,
      },
      update: {
        grossTime: input.grossTime,
        netTime: input.netTime,
        targetTime: input.targetTime,
        overtime: input.overtime,
        undertime: input.undertime,
        breakTime: input.breakTime,
        hasError: input.hasError,
        errorCodes: input.errorCodes,
        warnings: input.warnings,
        firstCome: input.firstCome,
        lastGo: input.lastGo,
        bookingCount: input.bookingCount,
        calculatedAt: input.calculatedAt,
        calculationVersion: input.calculationVersion,
        status: input.status,
        updatedAt: new Date(),
      },
    })
  }

  /**
   * Post net time and capped time to configured accounts.
   * Ported from Go: postDailyAccountValues() (lines 282-337)
   */
  private async postDailyAccountValues(
    tenantId: string,
    employeeId: string,
    date: Date,
    empDayPlan: EmployeeDayPlanWithDetails | null,
    dailyValue: DailyValueInput
  ): Promise<void> {
    const dayPlan = empDayPlan?.dayPlan ?? null

    if (!dayPlan) {
      // No day plan -- clean up any previous postings for this date
      await this.prisma.dailyAccountValue.deleteMany({
        where: { employeeId, valueDate: date },
      })
      return
    }

    // Post net time to net account
    if (dayPlan.netAccountId) {
      await this.prisma.dailyAccountValue.upsert({
        where: {
          employeeId_valueDate_accountId_source: {
            employeeId,
            valueDate: date,
            accountId: dayPlan.netAccountId,
            source: DAV_SOURCE_NET_TIME,
          },
        },
        create: {
          tenantId,
          employeeId,
          accountId: dayPlan.netAccountId,
          valueDate: date,
          valueMinutes: dailyValue.netTime,
          source: DAV_SOURCE_NET_TIME,
          dayPlanId: dayPlan.id,
        },
        update: {
          valueMinutes: dailyValue.netTime,
          dayPlanId: dayPlan.id,
          updatedAt: new Date(),
        },
      })
    }

    // Post capped minutes to cap account
    if (dayPlan.capAccountId && dayPlan.maxNetWorkTime !== null) {
      const cappedMinutes = Math.max(
        0,
        dailyValue.grossTime - dayPlan.maxNetWorkTime
      )
      await this.prisma.dailyAccountValue.upsert({
        where: {
          employeeId_valueDate_accountId_source: {
            employeeId,
            valueDate: date,
            accountId: dayPlan.capAccountId,
            source: DAV_SOURCE_CAPPED_TIME,
          },
        },
        create: {
          tenantId,
          employeeId,
          accountId: dayPlan.capAccountId,
          valueDate: date,
          valueMinutes: cappedMinutes,
          source: DAV_SOURCE_CAPPED_TIME,
          dayPlanId: dayPlan.id,
        },
        update: {
          valueMinutes: cappedMinutes,
          dayPlanId: dayPlan.id,
          updatedAt: new Date(),
        },
      })
    }
  }

  /**
   * Calculate and post surcharge bonuses.
   * Ported from Go: postSurchargeValues() (lines 339-394)
   */
  private async postSurchargeValues(
    tenantId: string,
    employeeId: string,
    date: Date,
    empDayPlan: EmployeeDayPlanWithDetails | null,
    dailyValue: DailyValueInput,
    calcPairs: BookingPair[],
    isHoliday: boolean,
    holidayCategory: number
  ): Promise<void> {
    // Clean up old surcharge postings
    await this.prisma.dailyAccountValue.deleteMany({
      where: { employeeId, valueDate: date, source: DAV_SOURCE_SURCHARGE },
    })

    const dayPlan = empDayPlan?.dayPlan ?? null
    if (!dayPlan || !dayPlan.bonuses || dayPlan.bonuses.length === 0) {
      return
    }

    // Convert bonuses to surcharge configs (handles overnight splits)
    const rawConfigs = convertBonusesToSurchargeConfigs(dayPlan.bonuses)
    const configs: SurchargeConfig[] = rawConfigs.flatMap((c) =>
      splitOvernightSurcharge(c)
    )

    // Extract work periods from calculation result pairs
    const workPeriods = extractWorkPeriods(calcPairs)

    // Calculate surcharges
    const surchargeResult = calculateSurcharges(
      workPeriods,
      configs,
      isHoliday,
      holidayCategory,
      dailyValue.netTime
    )

    // Post all surcharges in a single batch transaction
    if (surchargeResult.surcharges.length > 0) {
      await this.prisma.$transaction(
        surchargeResult.surcharges.map((sr) =>
          this.prisma.dailyAccountValue.upsert({
            where: {
              employeeId_valueDate_accountId_source: {
                employeeId,
                valueDate: date,
                accountId: sr.accountId,
                source: DAV_SOURCE_SURCHARGE,
              },
            },
            create: {
              tenantId,
              employeeId,
              accountId: sr.accountId,
              valueDate: date,
              valueMinutes: sr.minutes,
              source: DAV_SOURCE_SURCHARGE,
              dayPlanId: dayPlan.id,
            },
            update: {
              valueMinutes: sr.minutes,
              dayPlanId: dayPlan.id,
              updatedAt: new Date(),
            },
          }),
        ),
      )
    }
  }

  /**
   * Notify on newly detected calculation errors.
   * Ported from Go: notifyDailyCalcError() (lines 251-277)
   */
  private async notifyDailyCalcError(
    tenantId: string,
    employeeId: string,
    date: Date,
    previousHadError: boolean,
    currentHasError: boolean
  ): Promise<void> {
    // Skip if current has no error
    if (!currentHasError) return

    // Skip if previous already had error (prevent duplicate notifications)
    if (previousHadError) return

    // Find user linked to this employee (best-effort)
    try {
      const emp = await this.prisma.employee.findFirst({
        where: { id: employeeId },
        select: { id: true },
      })
      if (!emp) return

      // Look up user via user_tenants (employee -> user mapping)
      const userTenant = await this.prisma.$queryRaw<
        { user_id: string }[]
      >`
        SELECT ut.user_id
        FROM user_tenants ut
        JOIN users u ON u.id = ut.user_id
        WHERE ut.tenant_id = ${tenantId}::uuid
          AND u.employee_id = ${employeeId}::uuid
        LIMIT 1
      `

      if (!userTenant || userTenant.length === 0) return

      const userId = userTenant[0]!.user_id
      const dateLabel = date.toISOString().split("T")[0]
      const link = `/timesheet?view=day&date=${dateLabel}`

      await this.prisma.notification.create({
        data: {
          tenantId,
          userId,
          type: "errors",
          title: "Timesheet error",
          message: `Calculation error detected on ${dateLabel}.`,
          link,
        },
      })
    } catch {
      // Best effort - silently ignore notification failures
    }
  }

  // =========================================================================
  // Private: Calculation Log (Phase 8 - informational only)
  // =========================================================================

  /**
   * Build a calculation log summarizing the calculation steps.
   * This is informational and does not affect calculation correctness.
   * Can be persisted when a calculationLog column is added to the schema.
   */
  private buildCalculationLog(
    employeeId: string,
    date: Date,
    steps: CalculationLogStep[]
  ): CalculationLog {
    return {
      timestamp: new Date().toISOString(),
      employeeId,
      date: date.toISOString().split("T")[0]!,
      steps,
    }
  }
}
