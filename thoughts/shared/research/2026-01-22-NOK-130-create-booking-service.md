---
date: 2026-01-22T17:02:00+01:00
researcher: Claude
git_commit: d65caae00d2dcf95e794db6561be5e49c25ef21d
branch: master
repository: terp
topic: "NOK-130: Create Booking Service with CRUD Operations and Recalc Triggering"
tags: [research, codebase, booking, service, validation, recalculation]
status: complete
last_updated: 2026-01-22
last_updated_by: Claude
---

# Research: NOK-130 - Create Booking Service

**Date**: 2026-01-22T17:02:00+01:00
**Researcher**: Claude
**Git Commit**: d65caae00d2dcf95e794db6561be5e49c25ef21d
**Branch**: master
**Repository**: terp

## Research Question

Research the codebase to understand patterns and dependencies needed to implement TICKET-072: Create Booking Service with CRUD operations, validation, and recalculation triggering.

## Summary

The Booking Service will follow established codebase patterns:
- **Private interface pattern** for repository dependencies
- **Package-level error variables** using `errors.New()`
- **Input structs** for Create/Update operations with pointer fields for optional updates
- **Integration with RecalcService** to trigger daily recalculations on booking changes

Key finding: **Monthly value repository (TICKET-086) is NOT yet implemented**, so month closure validation cannot be fully implemented yet. The service should define the error type but may need to defer the actual validation or stub it initially.

## Detailed Findings

### 1. Service Layer Patterns

All services follow a consistent architecture pattern.

#### Private Repository Interface Pattern

Services define narrow private interfaces within the service package:

```go
// From apps/api/internal/service/costcenter.go:20-29
type costCenterRepository interface {
    Create(ctx context.Context, cc *model.CostCenter) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.CostCenter, error)
    // ... other methods
}
```

For the Booking Service, this would be:

```go
// bookingRepository defines the interface for booking data access.
type bookingRepository interface {
    Create(ctx context.Context, booking *model.Booking) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.Booking, error)
    Update(ctx context.Context, booking *model.Booking) error
    Delete(ctx context.Context, id uuid.UUID) error
    GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) ([]model.Booking, error)
    GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.Booking, error)
}
```

#### Cross-Service Dependencies Use Narrow Interfaces

For the RecalcService dependency:

```go
// From apps/api/internal/service/tariff.go:41-44
type weekPlanRepositoryForTariff interface {
    GetByID(ctx context.Context, id uuid.UUID) (*model.WeekPlan, error)
}
```

For Booking Service, the recalc interface would be:

```go
// recalcServiceForBooking defines the interface for triggering recalculation.
type recalcServiceForBooking interface {
    TriggerRecalc(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (*RecalcResult, error)
}
```

### 2. Error Definition Pattern

Services define package-level error variables:

```go
// From apps/api/internal/service/employee.go:16-33
var (
    ErrEmployeeNotFound          = errors.New("employee not found")
    ErrPersonnelNumberRequired   = errors.New("personnel number is required")
    // ...
)
```

For Booking Service, the ticket specifies:

```go
var (
    ErrBookingNotFound     = errors.New("booking not found")
    ErrMonthClosed         = errors.New("cannot modify closed month")
    ErrInvalidBookingTime  = errors.New("invalid booking time")
    ErrBookingOverlap      = errors.New("overlapping bookings exist")
)
```

### 3. Validation Patterns

#### Input Structs for Create/Update Operations

```go
// From apps/api/internal/service/costcenter.go:39-46
type CreateCostCenterInput struct {
    TenantID    uuid.UUID
    Code        string
    Name        string
    Description string
    IsActive    bool
}
```

#### Pointer Fields for Optional Updates

```go
// From apps/api/internal/service/costcenter.go:99-105
type UpdateCostCenterInput struct {
    Code        *string   // Pointer = optional field
    Name        *string
    Description *string
    IsActive    *bool
}
```

#### Validation Order

From `apps/api/internal/service/costcenter.go:49-78`:

1. Trim and validate required fields
2. Check uniqueness constraints
3. Validate foreign key references
4. Build model object
5. Call repository create

### 4. Booking Repository Interface (Already Implemented)

The repository is already implemented at `apps/api/internal/repository/booking.go`:

```go
type BookingRepository interface {
    Create(ctx context.Context, booking *model.Booking) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.Booking, error)
    Update(ctx context.Context, booking *model.Booking) error
    Delete(ctx context.Context, id uuid.UUID) error
    GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) ([]model.Booking, error)
    GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.Booking, error)
    List(ctx context.Context, filter BookingFilter) ([]model.Booking, int64, error)
    GetUnpaired(ctx context.Context, employeeID uuid.UUID, date time.Time, category model.BookingCategory) ([]model.Booking, error)
    SetPair(ctx context.Context, bookingID, pairID uuid.UUID) error
    ClearPair(ctx context.Context, bookingID uuid.UUID) error
    UpdateCalculatedTimes(ctx context.Context, updates map[uuid.UUID]int) error
}
```

### 5. Booking Model (Already Implemented)

The model is at `apps/api/internal/model/booking.go`:

```go
type Booking struct {
    ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
    TenantID      uuid.UUID
    EmployeeID    uuid.UUID
    BookingDate   time.Time
    BookingTypeID uuid.UUID
    OriginalTime   int    // Minutes from midnight
    EditedTime     int    // Minutes from midnight
    CalculatedTime *int
    PairID *uuid.UUID
    Source     BookingSource
    TerminalID *uuid.UUID
    Notes      string
    // ... relations
}
```

Key helper methods:
- `EffectiveTime()` - Returns calculated_time if set, else edited_time
- `TimeString()` - Returns edited time as HH:MM string
- `IsEdited()` - Returns true if edited_time differs from original_time

### 6. RecalcService Integration (Already Implemented)

The RecalcService at `apps/api/internal/service/recalc.go` provides:

```go
type RecalcService struct {
    dailyCalc    dailyCalcServiceForRecalc
    employeeRepo employeeRepositoryForRecalc
}

// TriggerRecalc recalculates a single day for one employee.
func (s *RecalcService) TriggerRecalc(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (*RecalcResult, error)
```

The Booking Service should call `TriggerRecalc` after any Create/Update/Delete operation.

### 7. Month Closure Validation (NOT YET IMPLEMENTED)

**IMPORTANT FINDING**: The Monthly Value repository (TICKET-086) and service (TICKET-090) are NOT yet implemented. The month closure check cannot be fully implemented yet.

From the OpenAPI spec at `api/schemas/monthly-values.yaml`, the MonthlyValue will have:
- `closed_at` - Timestamp when month was closed
- `closed_by` - User ID who closed the month

**Recommended approach**: Define the error (`ErrMonthClosed`) and the interface method now, but either:
1. Stub the check to always return "not closed", or
2. Make the monthlyValueRepo dependency optional (nil check)

The generated model exists at `apps/api/gen/models/monthly_value.go` with:
```go
ClosedAt *strfmt.DateTime
ClosedBy *strfmt.UUID
```

### 8. Test Patterns

#### Mock-Based Unit Tests

From `apps/api/internal/service/recalc_test.go`:

```go
type mockDailyCalcServiceForRecalc struct {
    mock.Mock
}

func (m *mockDailyCalcServiceForRecalc) CalculateDay(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (*model.DailyValue, error) {
    args := m.Called(ctx, tenantID, employeeID, date)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.DailyValue), args.Error(1)
}
```

Test setup:
```go
mockCalc := new(mockDailyCalcServiceForRecalc)
mockEmpRepo := new(mockEmployeeRepositoryForRecalc)
svc := NewRecalcService(mockCalc, mockEmpRepo)

mockCalc.On("CalculateDay", ctx, tenantID, employeeID, date).Return(&model.DailyValue{}, nil)
```

#### Assertion Libraries

Uses testify:
- `require.NoError(t, err)` - Halts test on failure
- `assert.Equal(t, expected, actual)` - Continues test on failure
- `mock.MatchedBy()` - Flexible argument matching

## Code References

- `apps/api/internal/model/booking.go:20-49` - Booking model struct
- `apps/api/internal/repository/booking.go` - Repository interface (TICKET-054, DONE)
- `apps/api/internal/service/recalc.go:39-53` - RecalcService struct and constructor
- `apps/api/internal/service/costcenter.go:13-18` - Error definition pattern
- `apps/api/internal/service/costcenter.go:39-46` - Input struct pattern
- `apps/api/internal/service/recalc_test.go:18-47` - Mock implementation pattern

## Architecture Insights

### Service Dependencies for BookingService

```
BookingService
├── bookingRepository (existing - apps/api/internal/repository/booking.go)
├── recalcService (existing - apps/api/internal/service/recalc.go)
├── monthlyValueRepository (NOT YET - planned in TICKET-086)
└── bookingTypeRepository (may need for validation)
```

### Flow for Create Booking

```
1. Validate input (time format, required fields)
2. Check month not closed (deferred - dependency missing)
3. Validate booking type exists
4. Check for overlapping bookings (optional, based on requirements)
5. Create booking via repository
6. Trigger recalc for the booking date
7. Return created booking
```

### Flow for Delete Booking

```
1. Get booking by ID (verify exists)
2. Check month not closed (deferred)
3. Delete booking via repository
4. Trigger recalc for the affected date
5. Return success
```

## Historical Context (from thoughts/)

- `thoughts/shared/plans/tickets/TICKET-054-create-booking-repository-DONE.md` - Repository already implemented with comprehensive tests
- `thoughts/shared/plans/tickets/TICKET-070-create-daily-calculation-service.md` - DailyCalcService design with ZMI compliance
- `thoughts/shared/plans/2026-01-22-NOK-129-create-recalculation-trigger-service.md` - RecalcService implementation plan

## Related Research

- `thoughts/shared/research/2026-01-22-NOK-128-create-daily-calculation-service.md` - Daily calculation research
- `thoughts/shared/research/2026-01-22-NOK-129-create-recalculation-trigger-service.md` - Recalc service research

## Open Questions

1. **Month closure validation**: Should we stub this or make it optional until TICKET-086 is complete?
   - **Recommendation**: Make monthlyValueRepo an optional dependency; skip check if nil

2. **Booking overlap validation**: The ticket mentions `ErrBookingOverlap` - what are the exact rules?
   - Same employee, same date, same time?
   - Same employee, same date, overlapping time windows?
   - **Recommendation**: Initially skip overlap check; add in follow-up ticket if needed

3. **BookingType validation**: Should we validate that the booking type exists and belongs to the tenant?
   - **Recommendation**: Yes, follow the cross-entity validation pattern from other services

4. **Existing bookings**: The repository has `GetByEmployeeDate` - should Create check for existing bookings to prevent duplicates?
   - **Recommendation**: Allow multiple bookings per day (come/go pairs); overlap check is separate concern

## Implementation Recommendations

### Proposed Service Structure

```go
package service

import (
    "context"
    "errors"
    "time"

    "github.com/google/uuid"
    "github.com/tolga/terp/internal/model"
)

var (
    ErrBookingNotFound    = errors.New("booking not found")
    ErrMonthClosed        = errors.New("cannot modify closed month")
    ErrInvalidBookingTime = errors.New("invalid booking time")
    ErrBookingOverlap     = errors.New("overlapping bookings exist")
    ErrInvalidBookingType = errors.New("invalid booking type")
)

// bookingRepository defines the interface for booking data access.
type bookingRepository interface {
    Create(ctx context.Context, booking *model.Booking) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.Booking, error)
    Update(ctx context.Context, booking *model.Booking) error
    Delete(ctx context.Context, id uuid.UUID) error
    GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) ([]model.Booking, error)
    GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.Booking, error)
}

// recalcServiceForBooking triggers recalculation after booking changes.
type recalcServiceForBooking interface {
    TriggerRecalc(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (*RecalcResult, error)
}

// monthlyValueLookup checks if a month is closed (optional dependency).
type monthlyValueLookup interface {
    IsMonthClosed(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (bool, error)
}

type BookingService struct {
    bookingRepo      bookingRepository
    recalcSvc        recalcServiceForBooking
    monthlyValueRepo monthlyValueLookup // Optional - may be nil until TICKET-086
}

func NewBookingService(
    bookingRepo bookingRepository,
    recalcSvc recalcServiceForBooking,
    monthlyValueRepo monthlyValueLookup, // Pass nil if not yet implemented
) *BookingService {
    return &BookingService{
        bookingRepo:      bookingRepo,
        recalcSvc:        recalcSvc,
        monthlyValueRepo: monthlyValueRepo,
    }
}
```

### Input Structs

```go
type CreateBookingInput struct {
    TenantID      uuid.UUID
    EmployeeID    uuid.UUID
    BookingTypeID uuid.UUID
    BookingDate   time.Time
    OriginalTime  int // Minutes from midnight (0-1439)
    EditedTime    int // Minutes from midnight (0-1439)
    Source        model.BookingSource
    TerminalID    *uuid.UUID
    Notes         string
}

type UpdateBookingInput struct {
    EditedTime *int
    Notes      *string
}
```

### Month Closure Check Pattern

```go
func (s *BookingService) checkMonthNotClosed(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) error {
    // Skip check if monthly value repo not yet implemented
    if s.monthlyValueRepo == nil {
        return nil
    }

    closed, err := s.monthlyValueRepo.IsMonthClosed(ctx, tenantID, employeeID, date)
    if err != nil {
        return err
    }
    if closed {
        return ErrMonthClosed
    }
    return nil
}
```
