# Research: NOK-136 - Create Absence Service

**Date**: 2026-01-24
**Ticket**: NOK-136 (TICKET-078)
**Status**: Research Complete

## Summary of Findings

The Absence Service needs to orchestrate absence range creation with date-skipping logic (weekends/holidays/off-days), validate absence types, check for existing absences, and trigger recalculation after mutations. All dependencies exist in the codebase:

- **AbsenceDay model and repository** (TICKET-077/NOK-135): Fully implemented with CRUD, range operations, and `CountByTypeInRange`.
- **AbsenceType model and repository** (TICKET-075/NOK-133): Fully implemented with `GetByID`, `GetByCode`, category filtering.
- **RecalcService** (TICKET-071): Fully implemented with `TriggerRecalc` (single day), `TriggerRecalcRange`, `TriggerRecalcBatch`, and `TriggerRecalcAll`.
- **Holiday access**: `HolidayRepository.GetByDate()` returns `nil, nil` when no holiday exists -- used in `DailyCalcService` and `HolidayService`.
- **Employee Day Plans**: `EmployeeDayPlanRepository.GetForEmployeeDate()` returns `nil, nil` when no plan exists (off day). Model has `IsOffDay()` helper.

The existing `BookingService` provides the closest pattern to follow: concrete struct, private interface definitions for dependencies, input structs for complex operations, recalc triggering after mutations, and testify/mock-based unit tests.

---

## AbsenceDay Model and Repository

### Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/absenceday.go`

```go
package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// AbsenceStatus represents the approval status of an absence day.
type AbsenceStatus string

const (
	AbsenceStatusPending   AbsenceStatus = "pending"
	AbsenceStatusApproved  AbsenceStatus = "approved"
	AbsenceStatusRejected  AbsenceStatus = "rejected"
	AbsenceStatusCancelled AbsenceStatus = "cancelled"
)

// HalfDayPeriod represents which half of the day an absence covers.
type HalfDayPeriod string

const (
	HalfDayPeriodMorning   HalfDayPeriod = "morning"
	HalfDayPeriodAfternoon HalfDayPeriod = "afternoon"
)

// AbsenceDay represents an employee absence record for a specific date.
type AbsenceDay struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID   uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
	EmployeeID uuid.UUID `gorm:"type:uuid;not null;index" json:"employee_id"`
	CreatedAt  time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt  time.Time `gorm:"default:now()" json:"updated_at"`

	// The date and type of absence
	AbsenceDate   time.Time `gorm:"type:date;not null" json:"absence_date"`
	AbsenceTypeID uuid.UUID `gorm:"type:uuid;not null" json:"absence_type_id"`

	// Duration: 1.00 = full day, 0.50 = half day
	Duration decimal.Decimal `gorm:"type:decimal(3,2);not null;default:1.00" json:"duration"`

	// Half day specification (when duration = 0.5)
	HalfDayPeriod *HalfDayPeriod `gorm:"type:varchar(10)" json:"half_day_period,omitempty"`

	// Approval workflow
	Status          AbsenceStatus `gorm:"type:varchar(20);not null;default:'pending'" json:"status"`
	ApprovedBy      *uuid.UUID    `gorm:"type:uuid" json:"approved_by,omitempty"`
	ApprovedAt      *time.Time    `gorm:"type:timestamptz" json:"approved_at,omitempty"`
	RejectionReason *string       `gorm:"type:text" json:"rejection_reason,omitempty"`

	// Optional notes
	Notes *string `gorm:"type:text" json:"notes,omitempty"`

	// Audit
	CreatedBy *uuid.UUID `gorm:"type:uuid" json:"created_by,omitempty"`

	// Relations
	Employee    *Employee    `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
	AbsenceType *AbsenceType `gorm:"foreignKey:AbsenceTypeID" json:"absence_type,omitempty"`
}

func (AbsenceDay) TableName() string {
	return "absence_days"
}

// IsFullDay returns true if this is a full day absence.
func (ad *AbsenceDay) IsFullDay() bool {
	return ad.Duration.Equal(decimal.NewFromInt(1))
}

// IsHalfDay returns true if this is a half day absence.
func (ad *AbsenceDay) IsHalfDay() bool {
	return ad.Duration.Equal(decimal.NewFromFloat(0.5))
}

// IsApproved returns true if the absence has been approved.
func (ad *AbsenceDay) IsApproved() bool {
	return ad.Status == AbsenceStatusApproved
}

// IsCancelled returns true if the absence has been cancelled.
func (ad *AbsenceDay) IsCancelled() bool {
	return ad.Status == AbsenceStatusCancelled
}

// CalculateCredit computes the time credit for this absence day.
// Formula: regelarbeitszeit * absenceType.CreditMultiplier() * duration
// Requires AbsenceType relation to be preloaded.
// Returns 0 if AbsenceType is not loaded.
func (ad *AbsenceDay) CalculateCredit(regelarbeitszeit int) int {
	if ad.AbsenceType == nil {
		return 0
	}
	multiplier := ad.AbsenceType.CreditMultiplier()
	duration := ad.Duration.InexactFloat64()
	return int(float64(regelarbeitszeit) * multiplier * duration)
}
```

### Repository

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/absenceday.go`

```go
package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var ErrAbsenceDayNotFound = errors.New("absence day not found")

// AbsenceDayRepository handles absence day data access.
type AbsenceDayRepository struct {
	db *DB
}

// NewAbsenceDayRepository creates a new absence day repository.
func NewAbsenceDayRepository(db *DB) *AbsenceDayRepository {
	return &AbsenceDayRepository{db: db}
}

// Create creates a new absence day.
func (r *AbsenceDayRepository) Create(ctx context.Context, ad *model.AbsenceDay) error {
	return r.db.GORM.WithContext(ctx).Create(ad).Error
}

// CreateRange creates multiple absence days in a batch.
func (r *AbsenceDayRepository) CreateRange(ctx context.Context, days []model.AbsenceDay) error {
	if len(days) == 0 {
		return nil
	}
	return r.db.GORM.WithContext(ctx).CreateInBatches(days, 100).Error
}

// GetByID retrieves an absence day by ID with AbsenceType preloaded.
func (r *AbsenceDayRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceDay, error) {
	var ad model.AbsenceDay
	err := r.db.GORM.WithContext(ctx).
		Preload("AbsenceType").
		First(&ad, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrAbsenceDayNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get absence day: %w", err)
	}
	return &ad, nil
}

// GetByEmployeeDate retrieves the absence day for an employee on a specific date.
// Returns nil, nil if no record exists (not an error).
// Only returns non-cancelled absences (matching the unique constraint).
func (r *AbsenceDayRepository) GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.AbsenceDay, error) {
	var ad model.AbsenceDay
	err := r.db.GORM.WithContext(ctx).
		Preload("AbsenceType").
		Where("employee_id = ? AND absence_date = ? AND status != ?", employeeID, date, model.AbsenceStatusCancelled).
		First(&ad).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get absence day: %w", err)
	}
	return &ad, nil
}

// GetByEmployeeDateRange retrieves all absence days for an employee within a date range.
func (r *AbsenceDayRepository) GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.AbsenceDay, error) {
	var days []model.AbsenceDay
	err := r.db.GORM.WithContext(ctx).
		Preload("AbsenceType").
		Where("employee_id = ? AND absence_date >= ? AND absence_date <= ?", employeeID, from, to).
		Order("absence_date ASC").
		Find(&days).Error

	if err != nil {
		return nil, fmt.Errorf("failed to get absence days for range: %w", err)
	}
	return days, nil
}

// Update updates an absence day.
func (r *AbsenceDayRepository) Update(ctx context.Context, ad *model.AbsenceDay) error {
	return r.db.GORM.WithContext(ctx).Save(ad).Error
}

// Delete deletes an absence day by ID.
func (r *AbsenceDayRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.AbsenceDay{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete absence day: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrAbsenceDayNotFound
	}
	return nil
}

// DeleteRange deletes all absence days for an employee within a date range.
func (r *AbsenceDayRepository) DeleteRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) error {
	result := r.db.GORM.WithContext(ctx).
		Where("employee_id = ? AND absence_date >= ? AND absence_date <= ?", employeeID, from, to).
		Delete(&model.AbsenceDay{})

	if result.Error != nil {
		return fmt.Errorf("failed to delete absence days: %w", result.Error)
	}
	return nil
}

// CountByTypeInRange sums the duration of approved absences for an employee
// of a specific type within a date range.
func (r *AbsenceDayRepository) CountByTypeInRange(ctx context.Context, employeeID, typeID uuid.UUID, from, to time.Time) (decimal.Decimal, error) {
	var result decimal.Decimal
	err := r.db.GORM.WithContext(ctx).
		Model(&model.AbsenceDay{}).
		Select("COALESCE(SUM(duration), 0)").
		Where("employee_id = ? AND absence_type_id = ? AND absence_date >= ? AND absence_date <= ? AND status = ?",
			employeeID, typeID, from, to, model.AbsenceStatusApproved).
		Scan(&result).Error

	if err != nil {
		return decimal.Zero, fmt.Errorf("failed to count absence days by type: %w", err)
	}
	return result, nil
}
```

**Key observations**:
- Repository uses concrete struct (not interface) pattern
- `GetByEmployeeDate` returns `nil, nil` when not found (normal query, not error)
- `GetByID` returns `ErrAbsenceDayNotFound` sentinel error
- `DeleteRange` does NOT check RowsAffected (deleting 0 is acceptable)
- `CreateRange` uses `CreateInBatches(days, 100)` for efficient bulk inserts
- Preloads `AbsenceType` on all read operations
- **No `ListByEmployee` method exists** in the current repository -- the service will need to use `GetByEmployeeDateRange` or this method must be added

---

## AbsenceType Model and Repository

### Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/absencetype.go`

```go
package model

import (
	"time"

	"github.com/google/uuid"
)

type AbsenceCategory string

const (
	AbsenceCategoryVacation AbsenceCategory = "vacation"
	AbsenceCategoryIllness  AbsenceCategory = "illness"
	AbsenceCategorySpecial  AbsenceCategory = "special"
	AbsenceCategoryUnpaid   AbsenceCategory = "unpaid"
)

type AbsencePortion int

const (
	AbsencePortionNone AbsencePortion = 0
	AbsencePortionFull AbsencePortion = 1
	AbsencePortionHalf AbsencePortion = 2
)

type AbsenceType struct {
	ID        uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID  *uuid.UUID `gorm:"type:uuid;index" json:"tenant_id,omitempty"`
	CreatedAt time.Time  `gorm:"default:now()" json:"created_at"`
	UpdatedAt time.Time  `gorm:"default:now()" json:"updated_at"`

	Code        string          `gorm:"type:varchar(10);not null" json:"code"`
	Name        string          `gorm:"type:varchar(100);not null" json:"name"`
	Description *string         `gorm:"type:text" json:"description,omitempty"`
	Category    AbsenceCategory `gorm:"type:varchar(20);not null" json:"category"`

	// ZMI: Anteil - determines time credit
	Portion AbsencePortion `gorm:"type:int;not null;default:1" json:"portion"`

	// ZMI: Kuerzel am Feiertag
	HolidayCode *string `gorm:"type:varchar(10)" json:"holiday_code,omitempty"`

	// ZMI: Prioritaet
	Priority int `gorm:"type:int;not null;default:0" json:"priority"`

	// Behavior flags
	DeductsVacation  bool `gorm:"default:false" json:"deducts_vacation"`
	RequiresApproval bool `gorm:"default:true" json:"requires_approval"`
	RequiresDocument bool `gorm:"default:false" json:"requires_document"`

	// Display
	Color     string `gorm:"type:varchar(7);default:'#808080'" json:"color"`
	SortOrder int    `gorm:"type:int;default:0" json:"sort_order"`

	// Status
	IsSystem bool `gorm:"default:false" json:"is_system"`
	IsActive bool `gorm:"default:true" json:"is_active"`

	Tenant *Tenant `gorm:"foreignKey:TenantID" json:"tenant,omitempty"`
}

func (AbsenceType) TableName() string {
	return "absence_types"
}

func (at *AbsenceType) CreditMultiplier() float64 {
	switch at.Portion {
	case AbsencePortionNone:
		return 0.0
	case AbsencePortionFull:
		return 1.0
	case AbsencePortionHalf:
		return 0.5
	default:
		return 1.0
	}
}

func (at *AbsenceType) CalculateCredit(regelarbeitszeit int) int {
	return int(float64(regelarbeitszeit) * at.CreditMultiplier())
}

func (at *AbsenceType) GetEffectiveCode(isHoliday bool) string {
	if isHoliday && at.HolidayCode != nil && *at.HolidayCode != "" {
		return *at.HolidayCode
	}
	return at.Code
}

func (at *AbsenceType) IsVacationType() bool {
	return at.Category == AbsenceCategoryVacation
}

func (at *AbsenceType) IsIllnessType() bool {
	return at.Category == AbsenceCategoryIllness
}
```

### Repository

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/absencetype.go`

```go
package repository

var ErrAbsenceTypeNotFound = errors.New("absence type not found")

type AbsenceTypeRepository struct {
	db *DB
}

func NewAbsenceTypeRepository(db *DB) *AbsenceTypeRepository {
	return &AbsenceTypeRepository{db: db}
}

// Key methods relevant to AbsenceService:
func (r *AbsenceTypeRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceType, error)
func (r *AbsenceTypeRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.AbsenceType, error)
func (r *AbsenceTypeRepository) List(ctx context.Context, tenantID uuid.UUID, includeSystem bool) ([]model.AbsenceType, error)
func (r *AbsenceTypeRepository) ListByCategory(ctx context.Context, tenantID uuid.UUID, category model.AbsenceCategory) ([]model.AbsenceType, error)
```

**Key observations**:
- `TenantID` is a pointer (`*uuid.UUID`) because system types have `nil` tenant
- `GetByID` returns `ErrAbsenceTypeNotFound` sentinel error
- `GetByCode` prefers tenant-specific types over system types (ORDER BY tenant_id DESC NULLS LAST)
- The AbsenceService needs `GetByID` to validate the absence type exists

---

## Recalculation Trigger Service

**File**: `/home/tolga/projects/terp/apps/api/internal/service/recalc.go`

### Interface (as used by BookingService)

```go
// recalcServiceForBooking defines the interface for triggering recalculation.
type recalcServiceForBooking interface {
	TriggerRecalc(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (*RecalcResult, error)
}
```

### Full RecalcService methods

```go
type RecalcService struct {
	dailyCalc    dailyCalcServiceForRecalc
	employeeRepo employeeRepositoryForRecalc
}

func NewRecalcService(dailyCalc dailyCalcServiceForRecalc, employeeRepo employeeRepositoryForRecalc) *RecalcService

// Single day recalculation
func (s *RecalcService) TriggerRecalc(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (*RecalcResult, error)

// Date range recalculation for one employee
func (s *RecalcService) TriggerRecalcRange(ctx context.Context, tenantID, employeeID uuid.UUID, from, to time.Time) (*RecalcResult, error)

// Date range recalculation for multiple employees
func (s *RecalcService) TriggerRecalcBatch(ctx context.Context, tenantID uuid.UUID, employeeIDs []uuid.UUID, from, to time.Time) *RecalcResult

// Date range recalculation for all active employees in a tenant
func (s *RecalcService) TriggerRecalcAll(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (*RecalcResult, error)
```

### RecalcResult type

```go
type RecalcResult struct {
	ProcessedDays int
	FailedDays    int
	Errors        []RecalcError
}

type RecalcError struct {
	EmployeeID uuid.UUID
	Date       time.Time
	Error      string
}
```

### Usage pattern in BookingService

The BookingService calls recalc synchronously and ignores the result:
```go
// Trigger recalculation for the affected date
_, _ = s.recalcSvc.TriggerRecalc(ctx, input.TenantID, input.EmployeeID, input.BookingDate)
```

**Note**: The TICKET-078 plan shows async (`go func()`) recalc triggering, but the existing BookingService uses synchronous calls. The absence service should follow the BookingService pattern (synchronous).

### Wiring in main.go

```go
recalcService := service.NewRecalcService(dailyCalcService, employeeRepo)
bookingService := service.NewBookingService(bookingRepo, bookingTypeRepo, recalcService, nil)
```

---

## Existing Service Patterns (BookingService)

**File**: `/home/tolga/projects/terp/apps/api/internal/service/booking.go`

### Structure pattern:

1. **Package-level errors** using `errors.New`:
```go
var (
	ErrBookingNotFound    = errors.New("booking not found")
	ErrMonthClosed        = errors.New("cannot modify closed month")
	ErrInvalidBookingTime = errors.New("invalid booking time")
	ErrBookingOverlap     = errors.New("overlapping bookings exist")
	ErrInvalidBookingType = errors.New("invalid booking type")
)
```

2. **Private interfaces for dependencies** (not exported):
```go
type bookingRepositoryForService interface {
	Create(ctx context.Context, booking *model.Booking) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.Booking, error)
	// ...
}

type recalcServiceForBooking interface {
	TriggerRecalc(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (*RecalcResult, error)
}
```

3. **Concrete struct with constructor**:
```go
type BookingService struct {
	bookingRepo      bookingRepositoryForService
	bookingTypeRepo  bookingTypeRepositoryForService
	recalcSvc        recalcServiceForBooking
	monthlyValueRepo monthlyValueLookupForBooking
}

func NewBookingService(
	bookingRepo bookingRepositoryForService,
	bookingTypeRepo bookingTypeRepositoryForService,
	recalcSvc recalcServiceForBooking,
	monthlyValueRepo monthlyValueLookupForBooking,
) *BookingService
```

4. **Input structs** for complex operations:
```go
type CreateBookingInput struct {
	TenantID      uuid.UUID
	EmployeeID    uuid.UUID
	BookingTypeID uuid.UUID
	BookingDate   time.Time
	OriginalTime  int
	EditedTime    int
	Source        model.BookingSource
	TerminalID    *uuid.UUID
	Notes         string
	CreatedBy     *uuid.UUID
}
```

5. **Methods pattern**: validate -> check preconditions -> build model -> persist -> trigger recalc -> return
6. **Recalc is called synchronously** and its error is ignored: `_, _ = s.recalcSvc.TriggerRecalc(...)`
7. **Delete fetches first** to get metadata for recalc, then deletes, then triggers recalc

### Testing pattern:

**File**: `/home/tolga/projects/terp/apps/api/internal/service/booking_test.go`

- Package: `package service` (internal test package)
- Uses `testify/mock` for all dependencies
- Mock structs implement the private interfaces
- Helper function creates service with all mocks:
```go
func newTestBookingService() (*BookingService, *mockBookingRepositoryForService, ...) {
	bookingRepo := new(mockBookingRepositoryForService)
	// ...
	svc := NewBookingService(bookingRepo, bookingTypeRepo, recalcSvc, monthlyValueRepo)
	return svc, bookingRepo, bookingTypeRepo, recalcSvc, monthlyValueRepo
}
```
- Tests cover: success paths, validation failures, not found, precondition failures
- Uses `mock.MatchedBy()` for complex assertions on created objects
- Uses `assert.ErrorIs()` for error type checking

---

## Holiday Access Patterns

### HolidayRepository

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/holiday.go`

Key method for absence service:
```go
// GetByDate retrieves a holiday for a specific date and tenant.
// Returns nil, nil if no holiday exists on that date.
func (r *HolidayRepository) GetByDate(ctx context.Context, tenantID uuid.UUID, date time.Time) (*model.Holiday, error)

// GetByDateRange retrieves holidays within a date range for a tenant.
func (r *HolidayRepository) GetByDateRange(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]model.Holiday, error)
```

### Holiday Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/holiday.go`

```go
type Holiday struct {
	ID           uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID     uuid.UUID  `gorm:"type:uuid;not null;index" json:"tenant_id"`
	HolidayDate  time.Time  `gorm:"type:date;not null" json:"holiday_date"`
	Name         string     `gorm:"type:varchar(255);not null" json:"name"`
	IsHalfDay    bool       `json:"is_half_day"`
	AppliesToAll bool       `json:"applies_to_all"`
	DepartmentID *uuid.UUID `gorm:"type:uuid" json:"department_id,omitempty"`
	CreatedAt    time.Time  `gorm:"default:now()" json:"created_at"`
	UpdatedAt    time.Time  `gorm:"default:now()" json:"updated_at"`
}
```

### Usage in DailyCalcService

```go
// holidayLookup defines the interface for holiday date lookups in daily calculation.
type holidayLookup interface {
	GetByDate(ctx context.Context, tenantID uuid.UUID, date time.Time) (*model.Holiday, error)
}

// In CalculateDay:
holiday, _ := s.holidayRepo.GetByDate(ctx, tenantID, date)
isHoliday := holiday != nil
```

**For the absence service**: Use the same `GetByDate` pattern to check if a date is a holiday. The service can use `GetByDateRange` to fetch all holidays in the absence range at once for efficiency, then check membership in a set.

---

## Employee Day Plans (Off-Day Detection)

### Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/employeedayplan.go`

```go
type EmployeeDayPlan struct {
	ID         uuid.UUID             `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID   uuid.UUID             `gorm:"type:uuid;not null;index" json:"tenant_id"`
	EmployeeID uuid.UUID             `gorm:"type:uuid;not null;index" json:"employee_id"`
	PlanDate   time.Time             `gorm:"type:date;not null" json:"plan_date"`
	DayPlanID  *uuid.UUID            `gorm:"type:uuid" json:"day_plan_id,omitempty"`
	Source     EmployeeDayPlanSource `gorm:"type:varchar(20);default:'tariff'" json:"source"`
	Notes      string                `gorm:"type:text" json:"notes,omitempty"`
	CreatedAt  time.Time             `gorm:"default:now()" json:"created_at"`
	UpdatedAt  time.Time             `gorm:"default:now()" json:"updated_at"`

	Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
	DayPlan  *DayPlan  `gorm:"foreignKey:DayPlanID" json:"day_plan,omitempty"`
}

// IsOffDay returns true if no day plan is assigned (employee is off).
func (edp *EmployeeDayPlan) IsOffDay() bool {
	return edp.DayPlanID == nil
}
```

### Repository

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/employeedayplan.go`

Key methods for absence service:
```go
// GetForEmployeeDate retrieves the day plan for an employee on a specific date.
// Returns nil, nil if no plan exists for that date.
func (r *EmployeeDayPlanRepository) GetForEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.EmployeeDayPlan, error)

// GetForEmployeeDateRange retrieves all day plans for an employee within a date range.
func (r *EmployeeDayPlanRepository) GetForEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.EmployeeDayPlan, error)
```

### Off-Day Detection Logic (from DailyCalcService)

```go
// Get day plan (nil, nil = no plan assigned = off day)
empDayPlan, err := s.empDayPlanRepo.GetForEmployeeDate(ctx, employeeID, date)
if err != nil {
    return nil, err
}

if empDayPlan == nil || empDayPlan.DayPlanID == nil {
    // Off day - no day plan assigned
}
```

**For the absence service**: A date is a "skip" date when:
1. `empDayPlan == nil` (no plan record exists for that date) -- this means the employee has no scheduled work
2. `empDayPlan.DayPlanID == nil` (plan record exists but with no plan assigned -- explicit off day)

The `GetForEmployeeDateRange` method can be used to batch-fetch all plans in the absence range at once rather than querying day by day.

---

## Reference Manual Notes (Absence-Related)

**File**: `/home/tolga/projects/terp/thoughts/shared/reference/zmi-calculataion-manual-reference.md`

### Section 15: Fehltage - Absence Days (Pages 159-161)

**15.1 Absence Type Prefixes**:
- U = Urlaub (Vacation)
- K = Krankheit (Sickness)
- S = Sondertage (Special days)
- Booking type IDs must NOT use U, K, or S as they are reserved for absence codes

**15.2 Anteil (Portion)** -- Determines time credit:
- 0 = No credit (target time set to zero)
- 1 = Full Regelarbeitszeit credited
- 2 = Half Regelarbeitszeit credited

Formula: `credit = regelarbeitszeit * CreditMultiplier()`

**15.3 Account Assignment Formula**:
- `Account value = Value * Factor`
- Exception: If Value = 0, use `Daily target time * Factor`

### Section 8.2: Regelarbeitszeit 2

> "Regelarbeitszeit 2 can be filled if a different regular working time should be valid on this day for stored absence days."

This means DayPlan has an alternative `RegularHours` field for absence days. Currently the DayPlan model only has `RegularHours` (one field). The alternative hours for absence days are not yet implemented.

### Section 18.2: Holiday + Absence Priority

> "The priority determines which calculation takes effect if an absence day is entered in addition to a holiday."

When holiday and absence overlap, the `Priority` field on `AbsenceType` determines which wins. The absence service should still CREATE the absence on holidays (the priority resolution happens during daily calculation, not during absence creation). However, the TICKET-078 plan specifies skipping holidays -- this is about not creating absences on holidays where an employee would not be working anyway.

### Section 8.5: No-Booking Behavior -- `use_absence`

In `DailyCalcService`, the `NoBookingUseAbsence` behavior has a TODO:
```go
case NoBookingUseAbsence:
    // TODO: Check absence when AbsenceDayRepository exists (NOK-132-137)
```

This indicates the daily calculation will eventually query absences for credit calculation on days without bookings.

### Vacation Tracking

From Section 19 (Urlaubsberechnung):
- Annual vacation entitlement stored in employee master
- `CountByTypeInRange` on AbsenceDayRepository is used to track used vacation days
- Only `status = 'approved'` absences count toward vacation deduction
- `AbsenceType.DeductsVacation` flag determines if an absence type deducts from vacation balance

---

## Existing Ticket Plan Pattern Differences

The TICKET-078 plan in `thoughts/shared/plans/tickets/TICKET-078-create-absence-service.md` shows:
1. An **interface-based** pattern (`AbsenceService interface` + `absenceService struct`) -- but the actual codebase uses **concrete structs** (like `BookingService`)
2. **Async recalc** with `go func()` -- but existing code uses **synchronous** calls
3. References `repository.AbsenceRepository` as an interface -- but the actual repo is a **concrete struct** `AbsenceDayRepository`
4. The `TriggerRecalcRange` call is missing `tenantID` parameter -- actual signature requires it
5. Uses string `Notes` field -- but actual model uses `*string` (pointer for nullable)

The implementation should follow the BookingService pattern (concrete struct, private interfaces, synchronous recalc) rather than the ticket plan's interface pattern.

---

## Missing Repository Method: ListByEmployee

The ticket interface requires:
```go
ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.AbsenceDay, error)
```

This method does NOT exist in the current `AbsenceDayRepository`. It would need to be added, or the service can implement it using `GetByEmployeeDateRange` with a wide date range. Adding it to the repository would be cleaner and match the ticket spec.

---

## Dependencies Summary

| Dependency | Status | Location |
|---|---|---|
| AbsenceDay Model | Implemented | `/home/tolga/projects/terp/apps/api/internal/model/absenceday.go` |
| AbsenceDayRepository | Implemented | `/home/tolga/projects/terp/apps/api/internal/repository/absenceday.go` |
| AbsenceType Model | Implemented | `/home/tolga/projects/terp/apps/api/internal/model/absencetype.go` |
| AbsenceTypeRepository | Implemented | `/home/tolga/projects/terp/apps/api/internal/repository/absencetype.go` |
| RecalcService | Implemented | `/home/tolga/projects/terp/apps/api/internal/service/recalc.go` |
| HolidayRepository | Implemented | `/home/tolga/projects/terp/apps/api/internal/repository/holiday.go` |
| EmployeeDayPlanRepository | Implemented | `/home/tolga/projects/terp/apps/api/internal/repository/employeedayplan.go` |
| DayPlan Model | Implemented | `/home/tolga/projects/terp/apps/api/internal/model/dayplan.go` |
