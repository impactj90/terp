# TICKET-070: Create Daily Calculation Service

**Type**: Service
**Effort**: L
**Sprint**: 12 - Booking Service
**Dependencies**: TICKET-068, TICKET-054, TICKET-056, TICKET-058

## Blocked Features

> **Note**: Some features in this ticket have TODO placeholders that are blocked by other tickets:
> - `HolidayCreditAverage` (Kategorie 2) - Blocked by **TICKET-127** (Complete Holiday Average Calculation)
> - `DayChangeBehavior` full implementation - Blocked by **TICKET-128** (Complete Day Change Implementation)

## Description

Create the service that orchestrates daily calculation with database access, including ZMI-compliant handling for holidays, absences, days without bookings, and day change (cross-midnight) scenarios.

## ZMI Reference

> "Zeitgutschrift an Feiertagen: Kategorie 1=Sollzeit, Kategorie 2=Durchschnittszeit, Kategorie 3=Keine"
> "Tage ohne Buchungen: Verschiedene Optionen für Tage ohne erfasste Zeiten"
> "Tageswechsel: Behandlung von Schichten die über Mitternacht gehen"

## Files to Create

- `apps/api/internal/service/daily_calc.go`
- `apps/api/internal/service/daily_calc_test.go`

## Implementation

```go
package service

import (
    "context"
    "errors"
    "time"

    "github.com/google/uuid"
    "gorm.io/gorm"

    "terp/apps/api/internal/calculation"
    "terp/apps/api/internal/model"
    "terp/apps/api/internal/repository"
)

// HolidayCreditCategory represents how holidays credit time
// ZMI: Zeitgutschrift an Feiertagen
type HolidayCreditCategory int

const (
    // HolidayCreditTarget - Credit target time (Sollzeit)
    // ZMI: Kategorie 1
    HolidayCreditTarget HolidayCreditCategory = 1

    // HolidayCreditAverage - Credit average time (Durchschnittszeit)
    // ZMI: Kategorie 2
    HolidayCreditAverage HolidayCreditCategory = 2

    // HolidayCreditNone - No credit on holidays
    // ZMI: Kategorie 3
    HolidayCreditNone HolidayCreditCategory = 3
)

// NoBookingBehavior defines how to handle days without bookings
// ZMI: Tage ohne Buchungen
type NoBookingBehavior string

const (
    // NoBookingError - Mark as error, no credit
    NoBookingError NoBookingBehavior = "error"

    // NoBookingCreditTarget - Credit target time
    NoBookingCreditTarget NoBookingBehavior = "credit_target"

    // NoBookingCreditZero - Credit zero (no error)
    NoBookingCreditZero NoBookingBehavior = "credit_zero"

    // NoBookingSkip - Skip calculation entirely
    NoBookingSkip NoBookingBehavior = "skip"

    // NoBookingUseAbsence - Use absence if exists, else error
    NoBookingUseAbsence NoBookingBehavior = "use_absence"
)

// DayChangeBehavior defines how to handle cross-midnight shifts
// ZMI: Tageswechsel
type DayChangeBehavior string

const (
    // DayChangeToFirst - All time credited to first day
    DayChangeToFirst DayChangeBehavior = "to_first"

    // DayChangeToSecond - All time credited to second day
    DayChangeToSecond DayChangeBehavior = "to_second"

    // DayChangeSplit - Split at midnight
    DayChangeSplit DayChangeBehavior = "split"

    // DayChangeByShift - Use shift detection rules
    DayChangeByShift DayChangeBehavior = "by_shift"
)

// DailyCalcConfig contains ZMI configuration for daily calculation
type DailyCalcConfig struct {
    HolidayCredit     HolidayCreditCategory
    NoBookingBehavior NoBookingBehavior
    DayChangeBehavior DayChangeBehavior
}

type DailyCalcService interface {
    CalculateDay(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (*model.DailyValue, error)
    RecalculateRange(ctx context.Context, tenantID, employeeID uuid.UUID, from, to time.Time) error
    GetConfig(ctx context.Context, tenantID uuid.UUID) (*DailyCalcConfig, error)
}

type dailyCalcService struct {
    bookingRepo     repository.BookingRepository
    empDayPlanRepo  repository.EmployeeDayPlanRepository
    dailyValueRepo  repository.DailyValueRepository
    absenceRepo     repository.AbsenceDayRepository
    holidayRepo     repository.HolidayRepository
    dayPlanRepo     repository.DayPlanRepository
    employeeRepo    repository.EmployeeRepository
    tenantRepo      repository.TenantRepository
}

func NewDailyCalcService(
    bookingRepo repository.BookingRepository,
    empDayPlanRepo repository.EmployeeDayPlanRepository,
    dailyValueRepo repository.DailyValueRepository,
    absenceRepo repository.AbsenceDayRepository,
    holidayRepo repository.HolidayRepository,
    dayPlanRepo repository.DayPlanRepository,
    employeeRepo repository.EmployeeRepository,
    tenantRepo repository.TenantRepository,
) DailyCalcService {
    return &dailyCalcService{
        bookingRepo:    bookingRepo,
        empDayPlanRepo: empDayPlanRepo,
        dailyValueRepo: dailyValueRepo,
        absenceRepo:    absenceRepo,
        holidayRepo:    holidayRepo,
        dayPlanRepo:    dayPlanRepo,
        employeeRepo:   employeeRepo,
        tenantRepo:     tenantRepo,
    }
}

func (s *dailyCalcService) CalculateDay(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (*model.DailyValue, error) {
    // 1. Get configuration
    config, err := s.GetConfig(ctx, tenantID)
    if err != nil {
        return nil, err
    }

    // 2. Check for holiday
    holiday, _ := s.holidayRepo.GetByDate(ctx, tenantID, date)
    isHoliday := holiday != nil

    // 3. Check for absence
    absence, _ := s.absenceRepo.GetByEmployeeDate(ctx, employeeID, date)
    hasAbsence := absence != nil

    // 4. Get day plan
    empDayPlan, err := s.empDayPlanRepo.GetForEmployeeDate(ctx, employeeID, date)
    if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
        return nil, err
    }

    // 5. Get bookings
    bookings, err := s.bookingRepo.GetByEmployeeAndDate(ctx, tenantID, employeeID, date)
    if err != nil {
        return nil, err
    }

    // 6. Handle special cases
    var dailyValue *model.DailyValue

    if isHoliday && len(bookings) == 0 {
        // Holiday without bookings - apply holiday credit
        dailyValue = s.handleHolidayCredit(ctx, employeeID, date, empDayPlan, config, absence)
    } else if hasAbsence && len(bookings) == 0 {
        // Absence without bookings - apply absence credit
        dailyValue = s.handleAbsenceCredit(ctx, employeeID, date, empDayPlan, absence)
    } else if len(bookings) == 0 {
        // No bookings, no holiday, no absence - apply no-booking behavior
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
        dailyValue, err = s.calculateWithBookings(ctx, employeeID, date, empDayPlan, bookings, isHoliday, config)
        if err != nil {
            return nil, err
        }
    }

    // 7. Set tenant and persist
    dailyValue.TenantID = tenantID
    if err := s.dailyValueRepo.Upsert(ctx, dailyValue); err != nil {
        return nil, err
    }

    return dailyValue, nil
}

func (s *dailyCalcService) handleHolidayCredit(
    ctx context.Context,
    employeeID uuid.UUID,
    date time.Time,
    empDayPlan *model.EmployeeDayPlan,
    config *DailyCalcConfig,
    absence *model.AbsenceDay,
) *model.DailyValue {
    now := time.Now()
    dv := &model.DailyValue{
        EmployeeID:   employeeID,
        ValueDate:    date,
        CalculatedAt: &now,
        Warnings:     []string{"HOLIDAY"},
    }

    // If absence exists with higher priority, use absence credit instead
    if absence != nil && absence.AbsenceType != nil {
        if absence.AbsenceType.Priority > 0 {
            return s.handleAbsenceCredit(ctx, employeeID, date, empDayPlan, absence)
        }
    }

    targetTime := 0
    if empDayPlan != nil && empDayPlan.DayPlan != nil {
        targetTime = empDayPlan.DayPlan.RegularHours
    }

    switch config.HolidayCredit {
    case HolidayCreditTarget:
        // Credit full target time
        dv.TargetTime = targetTime
        dv.NetTime = targetTime
        dv.GrossTime = targetTime
    case HolidayCreditAverage:
        // TODO: Calculate average from previous days
        dv.TargetTime = targetTime
        dv.NetTime = targetTime
        dv.GrossTime = targetTime
        dv.Warnings = append(dv.Warnings, "AVERAGE_NOT_IMPLEMENTED")
    case HolidayCreditNone:
        // No credit
        dv.TargetTime = 0
        dv.NetTime = 0
        dv.GrossTime = 0
    }

    return dv
}

func (s *dailyCalcService) handleAbsenceCredit(
    ctx context.Context,
    employeeID uuid.UUID,
    date time.Time,
    empDayPlan *model.EmployeeDayPlan,
    absence *model.AbsenceDay,
) *model.DailyValue {
    now := time.Now()
    dv := &model.DailyValue{
        EmployeeID:   employeeID,
        ValueDate:    date,
        CalculatedAt: &now,
        Warnings:     []string{"ABSENCE:" + absence.AbsenceType.Code},
    }

    targetTime := 0
    if empDayPlan != nil && empDayPlan.DayPlan != nil {
        targetTime = empDayPlan.DayPlan.RegularHours
    }

    // Calculate credit based on absence type portion and duration
    // Formula: targetTime * portion_multiplier * duration
    credit := absence.AbsenceType.CalculateCredit(targetTime)
    if absence.Duration.LessThan(decimal.NewFromInt(1)) {
        // Half day - multiply credit by duration
        creditDec := decimal.NewFromInt(int64(credit))
        credit = int(creditDec.Mul(absence.Duration).IntPart())
    }

    dv.TargetTime = targetTime
    dv.NetTime = credit
    dv.GrossTime = credit

    return dv
}

func (s *dailyCalcService) handleNoBookings(
    ctx context.Context,
    employeeID uuid.UUID,
    date time.Time,
    empDayPlan *model.EmployeeDayPlan,
    config *DailyCalcConfig,
) (*model.DailyValue, error) {
    now := time.Now()

    switch config.NoBookingBehavior {
    case NoBookingSkip:
        return nil, nil

    case NoBookingCreditTarget:
        targetTime := 0
        if empDayPlan != nil && empDayPlan.DayPlan != nil {
            targetTime = empDayPlan.DayPlan.RegularHours
        }
        return &model.DailyValue{
            EmployeeID:   employeeID,
            ValueDate:    date,
            TargetTime:   targetTime,
            NetTime:      targetTime,
            GrossTime:    targetTime,
            Warnings:     []string{"NO_BOOKINGS_CREDITED"},
            CalculatedAt: &now,
        }, nil

    case NoBookingCreditZero:
        targetTime := 0
        if empDayPlan != nil && empDayPlan.DayPlan != nil {
            targetTime = empDayPlan.DayPlan.RegularHours
        }
        return &model.DailyValue{
            EmployeeID:   employeeID,
            ValueDate:    date,
            TargetTime:   targetTime,
            NetTime:      0,
            GrossTime:    0,
            Undertime:    targetTime,
            Warnings:     []string{"NO_BOOKINGS_ZERO"},
            CalculatedAt: &now,
        }, nil

    case NoBookingUseAbsence:
        // Check if absence exists
        absence, _ := s.absenceRepo.GetByEmployeeDate(ctx, employeeID, date)
        if absence != nil {
            return s.handleAbsenceCredit(ctx, employeeID, date, empDayPlan, absence), nil
        }
        // Fall through to error
        fallthrough

    case NoBookingError:
        fallthrough
    default:
        targetTime := 0
        if empDayPlan != nil && empDayPlan.DayPlan != nil {
            targetTime = empDayPlan.DayPlan.RegularHours
        }
        return &model.DailyValue{
            EmployeeID:   employeeID,
            ValueDate:    date,
            TargetTime:   targetTime,
            NetTime:      0,
            GrossTime:    0,
            Undertime:    targetTime,
            HasError:     true,
            ErrorCodes:   []string{"NO_BOOKINGS"},
            CalculatedAt: &now,
        }, nil
    }
}

func (s *dailyCalcService) calculateWithBookings(
    ctx context.Context,
    employeeID uuid.UUID,
    date time.Time,
    empDayPlan *model.EmployeeDayPlan,
    bookings []model.Booking,
    isHoliday bool,
    config *DailyCalcConfig,
) (*model.DailyValue, error) {
    // Build calculation input
    input := s.buildCalcInput(empDayPlan, bookings, isHoliday)

    // Run calculation
    calculator := calculation.NewCalculator()
    output := calculator.Calculate(input)

    // Convert to model
    dailyValue := s.outputToDailyValue(employeeID, date, output)

    // Update booking calculated times
    if len(output.CalculatedTimes) > 0 {
        if err := s.bookingRepo.UpdateCalculatedTimes(ctx, output.CalculatedTimes); err != nil {
            return nil, err
        }
    }

    return dailyValue, nil
}

func (s *dailyCalcService) buildCalcInput(
    empDayPlan *model.EmployeeDayPlan,
    bookings []model.Booking,
    isHoliday bool,
) calculation.CalculationInput {
    input := calculation.CalculationInput{
        Bookings:  make([]calculation.BookingInput, 0, len(bookings)),
        IsHoliday: isHoliday,
    }

    // Convert day plan
    if empDayPlan != nil && empDayPlan.DayPlan != nil {
        dp := empDayPlan.DayPlan
        input.DayPlan = &calculation.DayPlanInput{
            PlanType:       string(dp.PlanType),
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

        // Rounding
        if dp.RoundingComeType != nil {
            input.DayPlan.Rounding.ComeType = calculation.RoundingType(*dp.RoundingComeType)
            if dp.RoundingComeInterval != nil {
                input.DayPlan.Rounding.ComeInterval = *dp.RoundingComeInterval
            }
        }
        if dp.RoundingGoType != nil {
            input.DayPlan.Rounding.GoType = calculation.RoundingType(*dp.RoundingGoType)
            if dp.RoundingGoInterval != nil {
                input.DayPlan.Rounding.GoInterval = *dp.RoundingGoInterval
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
                MinutesDifference: b.MinutesDifference,
            })
        }
    }

    // Convert bookings
    for _, b := range bookings {
        category := calculation.BookingCategoryWork
        if b.BookingType.Code == "BREAK_START" || b.BookingType.Code == "BREAK_END" {
            category = calculation.BookingCategoryBreak
        }

        direction := calculation.BookingDirectionIn
        if b.BookingType.Direction == model.BookingDirectionOut {
            direction = calculation.BookingDirectionOut
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

func (s *dailyCalcService) outputToDailyValue(employeeID uuid.UUID, date time.Time, output calculation.CalculationResult) *model.DailyValue {
    now := time.Now()
    return &model.DailyValue{
        EmployeeID:         employeeID,
        ValueDate:          date,
        GrossTime:          output.GrossTime,
        NetTime:            output.NetTime,
        TargetTime:         output.TargetTime,
        Overtime:           output.Overtime,
        Undertime:          output.Undertime,
        BreakTime:          output.BreakTime,
        HasError:           output.HasError,
        ErrorCodes:         output.ErrorCodes,
        Warnings:           output.Warnings,
        FirstCome:          output.FirstCome,
        LastGo:             output.LastGo,
        BookingCount:       output.BookingCount,
        CalculatedAt:       &now,
        CalculationVersion: 1,
    }
}

func (s *dailyCalcService) RecalculateRange(ctx context.Context, tenantID, employeeID uuid.UUID, from, to time.Time) error {
    for date := from; !date.After(to); date = date.AddDate(0, 0, 1) {
        if _, err := s.CalculateDay(ctx, tenantID, employeeID, date); err != nil {
            return err
        }
    }
    return nil
}

func (s *dailyCalcService) GetConfig(ctx context.Context, tenantID uuid.UUID) (*DailyCalcConfig, error) {
    tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
    if err != nil {
        return nil, err
    }

    // Extract config from tenant settings JSON
    config := &DailyCalcConfig{
        HolidayCredit:     HolidayCreditTarget,    // Default
        NoBookingBehavior: NoBookingError,         // Default
        DayChangeBehavior: DayChangeToFirst,       // Default
    }

    if tenant.Settings != nil {
        // Parse settings JSON for calc config
        // TODO: Implement settings parsing
    }

    return config, nil
}
```

## Unit Tests

**File**: `apps/api/internal/service/daily_calc_test.go`

```go
package service

import (
    "context"
    "testing"
    "time"

    "github.com/google/uuid"
    "github.com/shopspring/decimal"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/mock"
    "github.com/stretchr/testify/require"

    "terp/apps/api/internal/model"
)

// Mock repositories...
// (Include comprehensive mocks for all repositories)

func TestDailyCalcService_CalculateDay_NormalWithBookings(t *testing.T) {
    // Setup mocks
    svc := setupDailyCalcService(t)
    ctx := context.Background()
    tenantID := uuid.New()
    employeeID := uuid.New()
    date := time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC)

    // Mock day plan
    mockDayPlan(svc, employeeID, date, 480) // 8 hour target

    // Mock bookings: 8:00 - 16:30 (8.5 hours)
    mockBookings(svc, tenantID, employeeID, date, []int{480, 990})

    // Mock no holiday, no absence
    mockNoHoliday(svc, tenantID, date)
    mockNoAbsence(svc, employeeID, date)

    // Execute
    result, err := svc.CalculateDay(ctx, tenantID, employeeID, date)

    require.NoError(t, err)
    assert.Equal(t, 480, result.TargetTime)
    assert.Equal(t, 510, result.GrossTime) // 8.5 hours
    assert.Equal(t, 30, result.Overtime)
    assert.False(t, result.HasError)
}

func TestDailyCalcService_CalculateDay_Holiday(t *testing.T) {
    tests := []struct {
        name          string
        creditType    HolidayCreditCategory
        expectedNet   int
        expectedGross int
    }{
        {
            name:          "holiday credit target",
            creditType:    HolidayCreditTarget,
            expectedNet:   480,
            expectedGross: 480,
        },
        {
            name:          "holiday credit none",
            creditType:    HolidayCreditNone,
            expectedNet:   0,
            expectedGross: 0,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            svc := setupDailyCalcServiceWithConfig(t, &DailyCalcConfig{
                HolidayCredit: tt.creditType,
            })
            ctx := context.Background()
            tenantID := uuid.New()
            employeeID := uuid.New()
            date := time.Date(2024, 12, 25, 0, 0, 0, 0, time.UTC)

            mockDayPlan(svc, employeeID, date, 480)
            mockHoliday(svc, tenantID, date)
            mockNoBookings(svc, tenantID, employeeID, date)
            mockNoAbsence(svc, employeeID, date)

            result, err := svc.CalculateDay(ctx, tenantID, employeeID, date)

            require.NoError(t, err)
            assert.Equal(t, tt.expectedNet, result.NetTime)
            assert.Equal(t, tt.expectedGross, result.GrossTime)
            assert.Contains(t, result.Warnings, "HOLIDAY")
        })
    }
}

func TestDailyCalcService_CalculateDay_NoBookings(t *testing.T) {
    tests := []struct {
        name            string
        behavior        NoBookingBehavior
        hasAbsence      bool
        expectedError   bool
        expectedNet     int
        expectSkip      bool
    }{
        {
            name:          "error behavior",
            behavior:      NoBookingError,
            expectedError: true,
            expectedNet:   0,
        },
        {
            name:        "credit target",
            behavior:    NoBookingCreditTarget,
            expectedNet: 480,
        },
        {
            name:        "credit zero",
            behavior:    NoBookingCreditZero,
            expectedNet: 0,
        },
        {
            name:       "skip",
            behavior:   NoBookingSkip,
            expectSkip: true,
        },
        {
            name:        "use absence - has absence",
            behavior:    NoBookingUseAbsence,
            hasAbsence:  true,
            expectedNet: 480, // Full day absence credit
        },
        {
            name:          "use absence - no absence",
            behavior:      NoBookingUseAbsence,
            hasAbsence:    false,
            expectedError: true,
            expectedNet:   0,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            svc := setupDailyCalcServiceWithConfig(t, &DailyCalcConfig{
                NoBookingBehavior: tt.behavior,
            })
            ctx := context.Background()
            tenantID := uuid.New()
            employeeID := uuid.New()
            date := time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC)

            mockDayPlan(svc, employeeID, date, 480)
            mockNoHoliday(svc, tenantID, date)
            mockNoBookings(svc, tenantID, employeeID, date)

            if tt.hasAbsence {
                mockAbsence(svc, employeeID, date, "U", model.AbsencePortionFull)
            } else {
                mockNoAbsence(svc, employeeID, date)
            }

            result, err := svc.CalculateDay(ctx, tenantID, employeeID, date)

            require.NoError(t, err)

            if tt.expectSkip {
                assert.Nil(t, result)
            } else {
                assert.NotNil(t, result)
                assert.Equal(t, tt.expectedError, result.HasError)
                assert.Equal(t, tt.expectedNet, result.NetTime)
            }
        })
    }
}

func TestDailyCalcService_CalculateDay_AbsenceCredit(t *testing.T) {
    tests := []struct {
        name        string
        portion     model.AbsencePortion
        duration    decimal.Decimal
        targetTime  int
        expectedNet int
    }{
        {
            name:        "full day full portion",
            portion:     model.AbsencePortionFull,
            duration:    decimal.NewFromInt(1),
            targetTime:  480,
            expectedNet: 480,
        },
        {
            name:        "half day full portion",
            portion:     model.AbsencePortionFull,
            duration:    decimal.NewFromFloat(0.5),
            targetTime:  480,
            expectedNet: 240,
        },
        {
            name:        "full day half portion",
            portion:     model.AbsencePortionHalf,
            duration:    decimal.NewFromInt(1),
            targetTime:  480,
            expectedNet: 240,
        },
        {
            name:        "full day no portion",
            portion:     model.AbsencePortionNone,
            duration:    decimal.NewFromInt(1),
            targetTime:  480,
            expectedNet: 0,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            svc := setupDailyCalcService(t)
            ctx := context.Background()
            tenantID := uuid.New()
            employeeID := uuid.New()
            date := time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC)

            mockDayPlan(svc, employeeID, date, tt.targetTime)
            mockNoHoliday(svc, tenantID, date)
            mockNoBookings(svc, tenantID, employeeID, date)
            mockAbsenceWithDuration(svc, employeeID, date, tt.portion, tt.duration)

            result, err := svc.CalculateDay(ctx, tenantID, employeeID, date)

            require.NoError(t, err)
            assert.Equal(t, tt.expectedNet, result.NetTime)
        })
    }
}

func TestDailyCalcService_RecalculateRange(t *testing.T) {
    svc := setupDailyCalcService(t)
    ctx := context.Background()
    tenantID := uuid.New()
    employeeID := uuid.New()
    from := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
    to := time.Date(2024, 1, 3, 0, 0, 0, 0, time.UTC)

    // Setup mocks for 3 days
    for i := 0; i < 3; i++ {
        date := from.AddDate(0, 0, i)
        mockDayPlan(svc, employeeID, date, 480)
        mockNoHoliday(svc, tenantID, date)
        mockNoBookings(svc, tenantID, employeeID, date)
        mockNoAbsence(svc, employeeID, date)
    }

    err := svc.RecalculateRange(ctx, tenantID, employeeID, from, to)

    require.NoError(t, err)
    // Verify Upsert was called 3 times
    svc.dailyValueRepo.(*MockDailyValueRepository).AssertNumberOfCalls(t, "Upsert", 3)
}
```

## ZMI Compliance

| ZMI Feature | Implementation |
|-------------|----------------|
| Zeitgutschrift an Feiertagen | `HolidayCreditCategory` enum (1/2/3) |
| Tage ohne Buchungen | `NoBookingBehavior` enum with 5 options |
| Tageswechsel | `DayChangeBehavior` enum (placeholder for future) |
| Fehltag mit Priorität | `AbsenceType.Priority` check in holiday handling |
| Anteil-based credit | `CalculateCredit()` in absence handling |

## Acceptance Criteria

- [ ] Holiday credit applies when no bookings (3 categories)
- [ ] Absence credit calculated correctly with portion
- [ ] No-booking behavior configurable (5 options)
- [ ] Absence priority checked against holidays
- [ ] Half-day absences calculate proportional credit
- [ ] RecalculateRange processes date range
- [ ] Config loaded from tenant settings
- [ ] `make test` passes with comprehensive tests
- [ ] Tests cover all ZMI-specific behaviors
