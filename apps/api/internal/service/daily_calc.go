package service

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"

	"github.com/tolga/terp/internal/calculation"
	"github.com/tolga/terp/internal/model"
)

// HolidayCreditCategory represents how holidays credit time.
// ZMI: Zeitgutschrift an Feiertagen
type HolidayCreditCategory int

const (
	// HolidayCreditTarget - Credit target time (Sollzeit)
	// ZMI: Kategorie 1
	HolidayCreditTarget HolidayCreditCategory = 1

	// HolidayCreditAverage - Credit average time (Durchschnittszeit)
	// ZMI: Kategorie 2 - BLOCKED by TICKET-127
	HolidayCreditAverage HolidayCreditCategory = 2

	// HolidayCreditNone - No credit on holidays
	// ZMI: Kategorie 3
	HolidayCreditNone HolidayCreditCategory = 3
)

// NoBookingBehavior defines how to handle days without bookings.
// ZMI: Tage ohne Buchungen
type NoBookingBehavior string

const (
	NoBookingError        NoBookingBehavior = "error"
	NoBookingCreditTarget NoBookingBehavior = "credit_target"
	NoBookingCreditZero   NoBookingBehavior = "credit_zero"
	NoBookingSkip         NoBookingBehavior = "skip"
	NoBookingUseAbsence   NoBookingBehavior = "use_absence"
)

// DayChangeBehavior defines how to handle cross-midnight shifts.
// ZMI: Tageswechsel
type DayChangeBehavior string

const (
	DayChangeToFirst  DayChangeBehavior = "to_first"
	DayChangeToSecond DayChangeBehavior = "to_second"
	DayChangeSplit    DayChangeBehavior = "split"
	DayChangeByShift  DayChangeBehavior = "by_shift"
)

// DailyCalcConfig contains ZMI configuration for daily calculation.
// NOTE: These settings should come from DayPlan once NOK-145 adds the fields.
// For now, defaults are used.
type DailyCalcConfig struct {
	HolidayCredit     HolidayCreditCategory
	NoBookingBehavior NoBookingBehavior
	DayChangeBehavior DayChangeBehavior
}

// DefaultDailyCalcConfig returns sensible defaults until NOK-145 adds
// the ZMI fields to day_plans table.
func DefaultDailyCalcConfig() *DailyCalcConfig {
	return &DailyCalcConfig{
		HolidayCredit:     HolidayCreditTarget,
		NoBookingBehavior: NoBookingError,
		DayChangeBehavior: DayChangeToFirst,
	}
}

// bookingRepository defines the interface for booking data access.
type bookingRepository interface {
	GetByEmployeeAndDate(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) ([]model.Booking, error)
	UpdateCalculatedTimes(ctx context.Context, updates map[uuid.UUID]int) error
}

// employeeDayPlanRepository defines the interface for employee day plan data access.
type employeeDayPlanRepository interface {
	GetForEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.EmployeeDayPlan, error)
}

// dailyValueRepository defines the interface for daily value data access.
type dailyValueRepository interface {
	Upsert(ctx context.Context, dv *model.DailyValue) error
	GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.DailyValue, error)
}

// holidayLookup defines the interface for holiday date lookups in daily calculation.
// This is a subset of holidayRepository - the full interface is defined in holiday.go.
type holidayLookup interface {
	GetByDate(ctx context.Context, tenantID uuid.UUID, date time.Time) (*model.Holiday, error)
}

// DailyCalcService orchestrates daily time calculations.
type DailyCalcService struct {
	bookingRepo    bookingRepository
	empDayPlanRepo employeeDayPlanRepository
	dailyValueRepo dailyValueRepository
	holidayRepo    holidayLookup
	calc           *calculation.Calculator
}

// NewDailyCalcService creates a new DailyCalcService instance.
func NewDailyCalcService(
	bookingRepo bookingRepository,
	empDayPlanRepo employeeDayPlanRepository,
	dailyValueRepo dailyValueRepository,
	holidayRepo holidayLookup,
) *DailyCalcService {
	return &DailyCalcService{
		bookingRepo:    bookingRepo,
		empDayPlanRepo: empDayPlanRepo,
		dailyValueRepo: dailyValueRepo,
		holidayRepo:    holidayRepo,
		calc:           calculation.NewCalculator(),
	}
}

// CalculateDay performs daily calculation for an employee on a specific date.
// Returns the calculated DailyValue (persisted) or nil if calculation should be skipped.
func (s *DailyCalcService) CalculateDay(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (*model.DailyValue, error) {
	// Use defaults until NOK-145 adds ZMI fields to day_plans
	config := DefaultDailyCalcConfig()

	// 1. Check for holiday
	holiday, _ := s.holidayRepo.GetByDate(ctx, tenantID, date)
	isHoliday := holiday != nil

	// 2. Get day plan (nil, nil = no plan assigned = off day)
	empDayPlan, err := s.empDayPlanRepo.GetForEmployeeDate(ctx, employeeID, date)
	if err != nil {
		return nil, err
	}

	// 3. Get bookings
	bookings, err := s.bookingRepo.GetByEmployeeAndDate(ctx, tenantID, employeeID, date)
	if err != nil {
		return nil, err
	}

	// 4. Handle special cases
	var dailyValue *model.DailyValue

	if empDayPlan == nil || empDayPlan.DayPlanID == nil {
		// Off day - no day plan assigned
		dailyValue = s.handleOffDay(employeeID, date, bookings)
	} else if isHoliday && len(bookings) == 0 {
		// Holiday without bookings - apply holiday credit
		dailyValue = s.handleHolidayCredit(employeeID, date, empDayPlan, config)
	} else if len(bookings) == 0 {
		// No bookings, no holiday - apply no-booking behavior
		dailyValue, err = s.handleNoBookings(ctx, employeeID, date, empDayPlan, config)
		if err != nil {
			return nil, err
		}
		if dailyValue == nil {
			// Skip behavior - don't create/update daily value
			return nil, nil
		}
	} else {
		// Normal calculation with bookings
		dailyValue, err = s.calculateWithBookings(ctx, employeeID, date, empDayPlan, bookings, isHoliday)
		if err != nil {
			return nil, err
		}
	}

	// 5. Set tenant and persist
	dailyValue.TenantID = tenantID
	if err := s.dailyValueRepo.Upsert(ctx, dailyValue); err != nil {
		return nil, err
	}

	return dailyValue, nil
}

func (s *DailyCalcService) handleOffDay(employeeID uuid.UUID, date time.Time, bookings []model.Booking) *model.DailyValue {
	now := time.Now()
	dv := &model.DailyValue{
		EmployeeID:   employeeID,
		ValueDate:    date,
		TargetTime:   0, // No target on off days
		CalculatedAt: &now,
		Warnings:     pq.StringArray{"OFF_DAY"},
	}

	if len(bookings) > 0 {
		// Has bookings on an off day - flag as warning
		dv.Warnings = append(dv.Warnings, "BOOKINGS_ON_OFF_DAY")
		dv.BookingCount = len(bookings)
	}

	return dv
}

func (s *DailyCalcService) handleHolidayCredit(
	employeeID uuid.UUID,
	date time.Time,
	empDayPlan *model.EmployeeDayPlan,
	config *DailyCalcConfig,
) *model.DailyValue {
	now := time.Now()
	dv := &model.DailyValue{
		EmployeeID:   employeeID,
		ValueDate:    date,
		CalculatedAt: &now,
		Warnings:     pq.StringArray{"HOLIDAY"},
	}

	targetTime := 0
	if empDayPlan != nil && empDayPlan.DayPlan != nil {
		targetTime = empDayPlan.DayPlan.RegularHours
	}
	dv.TargetTime = targetTime

	switch config.HolidayCredit {
	case HolidayCreditTarget:
		// Credit full target time
		dv.NetTime = targetTime
		dv.GrossTime = targetTime
	case HolidayCreditAverage:
		// TODO: Calculate average from previous days (TICKET-127)
		dv.NetTime = targetTime
		dv.GrossTime = targetTime
		dv.Warnings = append(dv.Warnings, "AVERAGE_NOT_IMPLEMENTED")
	case HolidayCreditNone:
		// No credit
		dv.NetTime = 0
		dv.GrossTime = 0
		dv.Undertime = targetTime
	}

	return dv
}

func (s *DailyCalcService) handleNoBookings(
	ctx context.Context,
	employeeID uuid.UUID,
	date time.Time,
	empDayPlan *model.EmployeeDayPlan,
	config *DailyCalcConfig,
) (*model.DailyValue, error) {
	now := time.Now()
	targetTime := 0
	if empDayPlan != nil && empDayPlan.DayPlan != nil {
		targetTime = empDayPlan.DayPlan.RegularHours
	}

	switch config.NoBookingBehavior {
	case NoBookingSkip:
		return nil, nil

	case NoBookingCreditTarget:
		return &model.DailyValue{
			EmployeeID:   employeeID,
			ValueDate:    date,
			TargetTime:   targetTime,
			NetTime:      targetTime,
			GrossTime:    targetTime,
			Warnings:     pq.StringArray{"NO_BOOKINGS_CREDITED"},
			CalculatedAt: &now,
		}, nil

	case NoBookingCreditZero:
		return &model.DailyValue{
			EmployeeID:   employeeID,
			ValueDate:    date,
			TargetTime:   targetTime,
			NetTime:      0,
			GrossTime:    0,
			Undertime:    targetTime,
			Warnings:     pq.StringArray{"NO_BOOKINGS_ZERO"},
			CalculatedAt: &now,
		}, nil

	case NoBookingUseAbsence:
		// TODO: Check absence when AbsenceDayRepository exists (NOK-132-137)
		// For now, fall through to error with warning
		return &model.DailyValue{
			EmployeeID:   employeeID,
			ValueDate:    date,
			TargetTime:   targetTime,
			NetTime:      0,
			GrossTime:    0,
			Undertime:    targetTime,
			HasError:     true,
			ErrorCodes:   pq.StringArray{"NO_BOOKINGS"},
			Warnings:     pq.StringArray{"ABSENCE_NOT_IMPLEMENTED"},
			CalculatedAt: &now,
		}, nil

	case NoBookingError:
		fallthrough
	default:
		return &model.DailyValue{
			EmployeeID:   employeeID,
			ValueDate:    date,
			TargetTime:   targetTime,
			NetTime:      0,
			GrossTime:    0,
			Undertime:    targetTime,
			HasError:     true,
			ErrorCodes:   pq.StringArray{"NO_BOOKINGS"},
			CalculatedAt: &now,
		}, nil
	}
}

func (s *DailyCalcService) calculateWithBookings(
	ctx context.Context,
	employeeID uuid.UUID,
	date time.Time,
	empDayPlan *model.EmployeeDayPlan,
	bookings []model.Booking,
	isHoliday bool,
) (*model.DailyValue, error) {
	// Build calculation input
	input := s.buildCalcInput(employeeID, date, empDayPlan, bookings)

	// Run calculation
	result := s.calc.Calculate(input)

	// Add holiday warning if applicable
	if isHoliday {
		result.Warnings = append(result.Warnings, "WORKED_ON_HOLIDAY")
	}

	// Convert to DailyValue
	dailyValue := s.resultToDailyValue(employeeID, date, result)

	// Update booking calculated times
	if len(result.CalculatedTimes) > 0 {
		if err := s.bookingRepo.UpdateCalculatedTimes(ctx, result.CalculatedTimes); err != nil {
			return nil, err
		}
	}

	return dailyValue, nil
}

func (s *DailyCalcService) buildCalcInput(
	employeeID uuid.UUID,
	date time.Time,
	empDayPlan *model.EmployeeDayPlan,
	bookings []model.Booking,
) calculation.CalculationInput {
	input := calculation.CalculationInput{
		EmployeeID: employeeID,
		Date:       date,
		Bookings:   make([]calculation.BookingInput, 0, len(bookings)),
	}

	// Convert day plan
	if empDayPlan != nil && empDayPlan.DayPlan != nil {
		dp := empDayPlan.DayPlan
		input.DayPlan = calculation.DayPlanInput{
			RegularHours:   dp.RegularHours,
			ComeFrom:       dp.ComeFrom,
			ComeTo:         dp.ComeTo,
			GoFrom:         dp.GoFrom,
			GoTo:           dp.GoTo,
			CoreStart:      dp.CoreStart,
			CoreEnd:        dp.CoreEnd,
			MinWorkTime:    dp.MinWorkTime,
			MaxNetWorkTime: dp.MaxNetWorkTime,
			Tolerance: calculation.ToleranceConfig{
				ComePlus:  dp.ToleranceComePlus,
				ComeMinus: dp.ToleranceComeMinus,
				GoPlus:    dp.ToleranceGoPlus,
				GoMinus:   dp.ToleranceGoMinus,
			},
		}

		// Rounding - come
		if dp.RoundingComeType != nil && dp.RoundingComeInterval != nil {
			input.DayPlan.RoundingCome = &calculation.RoundingConfig{
				Type:     calculation.RoundingType(*dp.RoundingComeType),
				Interval: *dp.RoundingComeInterval,
			}
		}

		// Rounding - go
		if dp.RoundingGoType != nil && dp.RoundingGoInterval != nil {
			input.DayPlan.RoundingGo = &calculation.RoundingConfig{
				Type:     calculation.RoundingType(*dp.RoundingGoType),
				Interval: *dp.RoundingGoInterval,
			}
		}

		// Breaks
		for _, b := range dp.Breaks {
			input.DayPlan.Breaks = append(input.DayPlan.Breaks, calculation.BreakConfig{
				Type:             calculation.BreakType(b.BreakType),
				StartTime:        b.StartTime,
				EndTime:          b.EndTime,
				Duration:         b.Duration,
				AfterWorkMinutes: b.AfterWorkMinutes,
				AutoDeduct:       b.AutoDeduct,
				IsPaid:           b.IsPaid,
			})
		}
	}

	// Convert bookings
	for _, b := range bookings {
		category := calculation.CategoryWork
		if b.BookingType != nil &&
			(b.BookingType.Code == "BREAK_START" || b.BookingType.Code == "BREAK_END") {
			category = calculation.CategoryBreak
		}

		direction := calculation.DirectionIn
		if b.BookingType != nil && b.BookingType.Direction == model.BookingDirectionOut {
			direction = calculation.DirectionOut
		}

		input.Bookings = append(input.Bookings, calculation.BookingInput{
			ID:        b.ID,
			Time:      b.EffectiveTime(),
			Direction: direction,
			Category:  category,
			PairID:    b.PairID,
		})
	}

	return input
}

func (s *DailyCalcService) resultToDailyValue(employeeID uuid.UUID, date time.Time, result calculation.CalculationResult) *model.DailyValue {
	now := time.Now()
	return &model.DailyValue{
		EmployeeID:         employeeID,
		ValueDate:          date,
		GrossTime:          result.GrossTime,
		NetTime:            result.NetTime,
		TargetTime:         result.TargetTime,
		Overtime:           result.Overtime,
		Undertime:          result.Undertime,
		BreakTime:          result.BreakTime,
		HasError:           result.HasError,
		ErrorCodes:         result.ErrorCodes,
		Warnings:           result.Warnings,
		FirstCome:          result.FirstCome,
		LastGo:             result.LastGo,
		BookingCount:       result.BookingCount,
		CalculatedAt:       &now,
		CalculationVersion: 1,
	}
}

// RecalculateRange recalculates daily values for a date range.
func (s *DailyCalcService) RecalculateRange(ctx context.Context, tenantID, employeeID uuid.UUID, from, to time.Time) (int, error) {
	count := 0
	for date := from; !date.After(to); date = date.AddDate(0, 0, 1) {
		_, err := s.CalculateDay(ctx, tenantID, employeeID, date)
		if err != nil {
			return count, err
		}
		count++
	}
	return count, nil
}
