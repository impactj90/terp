# Implementation Plan: ZMI-TICKET-035 - Booking Reason Time Adjustments

## Overview

Extend booking reasons to support automatic time adjustments that create derived bookings.
When a booking is created with a reason that has adjustment configuration, the system
automatically creates a second (derived) booking at a computed time based on a reference
point (plan start, plan end, or the booking's own time) plus an offset in minutes.

**Manual reference**: 3.4.4.10 Buchen mit Grund (Booking with Reason)

## Dependencies

- ZMI-TICKET-010 (Booking Types and Groups) -- complete
- ZMI-TICKET-011 (Booking Ingest/Edit Flow) -- complete
- ZMI-TICKET-006 (Day Plan Advanced Rules) -- complete

## Key Design Decisions

1. **Derived booking source**: Add a new `BookingSource` value `"derived"` to clearly identify auto-generated bookings, following the pattern of `"correction"` for auto-complete bookings.
2. **Linking**: Add `booking_reason_id` and `original_booking_id` columns to `bookings`. The `original_booking_id` links a derived booking back to the booking that triggered it.
3. **is_auto_generated**: Boolean flag on `bookings` for quick filtering.
4. **Idempotency**: Delete-and-recreate pattern (matching `OrderBookingService.DeleteAutoBookingsByDate`). Before creating a derived booking, delete any existing derived booking with the same `original_booking_id`.
5. **Reference time mapping**: `plan_start` maps to `DayPlan.ComeFrom`, `plan_end` maps to `DayPlan.GoTo`, `booking_time` uses the original booking's `EditedTime`.
6. **Derived booking creation**: Happens in `BookingService.Create` after the primary booking is saved, before recalculation is triggered. This keeps the logic centralized.
7. **Day plan access**: `BookingService` needs a new dependency on `employeeDayPlanRepository` to resolve plan-based reference times.

---

## Phase 1: Database Migration

### File: `db/migrations/000078_booking_reason_adjustments.up.sql` (new)

```sql
-- =============================================================
-- Phase 1a: Add adjustment configuration to booking_reasons
-- =============================================================
ALTER TABLE booking_reasons
    ADD COLUMN reference_time VARCHAR(20),
    ADD COLUMN offset_minutes INT,
    ADD COLUMN adjustment_booking_type_id UUID REFERENCES booking_types(id) ON DELETE SET NULL;

COMMENT ON COLUMN booking_reasons.reference_time IS 'Reference point for time adjustment: plan_start, plan_end, or booking_time';
COMMENT ON COLUMN booking_reasons.offset_minutes IS 'Signed offset in minutes to apply to reference time (positive = later, negative = earlier)';
COMMENT ON COLUMN booking_reasons.adjustment_booking_type_id IS 'Booking type for the derived booking. If NULL, uses the opposite direction of the original booking type';

CREATE INDEX idx_booking_reasons_adj_bt ON booking_reasons(adjustment_booking_type_id) WHERE adjustment_booking_type_id IS NOT NULL;

-- =============================================================
-- Phase 1b: Add reason and derived-booking fields to bookings
-- =============================================================
ALTER TABLE bookings
    ADD COLUMN booking_reason_id UUID REFERENCES booking_reasons(id) ON DELETE SET NULL,
    ADD COLUMN is_auto_generated BOOLEAN DEFAULT false,
    ADD COLUMN original_booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE;

CREATE INDEX idx_bookings_reason ON bookings(booking_reason_id) WHERE booking_reason_id IS NOT NULL;
CREATE INDEX idx_bookings_auto_gen ON bookings(is_auto_generated) WHERE is_auto_generated = true;
CREATE INDEX idx_bookings_original ON bookings(original_booking_id) WHERE original_booking_id IS NOT NULL;

COMMENT ON COLUMN bookings.booking_reason_id IS 'Optional reason code selected when creating this booking';
COMMENT ON COLUMN bookings.is_auto_generated IS 'True if this booking was automatically created as a derived booking from a reason adjustment';
COMMENT ON COLUMN bookings.original_booking_id IS 'For derived bookings: the ID of the original booking that triggered creation';
```

### File: `db/migrations/000078_booking_reason_adjustments.down.sql` (new)

```sql
ALTER TABLE bookings
    DROP COLUMN IF EXISTS original_booking_id,
    DROP COLUMN IF EXISTS is_auto_generated,
    DROP COLUMN IF EXISTS booking_reason_id;

ALTER TABLE booking_reasons
    DROP COLUMN IF EXISTS adjustment_booking_type_id,
    DROP COLUMN IF EXISTS offset_minutes,
    DROP COLUMN IF EXISTS reference_time;
```

### Verification

```bash
make migrate-up
# Confirm columns exist:
# psql: \d booking_reasons  -- should show reference_time, offset_minutes, adjustment_booking_type_id
# psql: \d bookings         -- should show booking_reason_id, is_auto_generated, original_booking_id
```

---

## Phase 2: OpenAPI Spec Updates

### File: `/home/tolga/projects/terp/api/schemas/booking-reasons.yaml` (modify)

Add adjustment fields to `BookingReason`, `CreateBookingReasonRequest`, and `UpdateBookingReasonRequest`:

**BookingReason** -- add after `sort_order`:
```yaml
    reference_time:
      type: string
      enum:
        - plan_start
        - plan_end
        - booking_time
      x-nullable: true
      description: >
        Reference point for automatic time adjustment. When set along with offset_minutes,
        a derived booking is automatically created when bookings use this reason.
    offset_minutes:
      type: integer
      x-nullable: true
      description: >
        Signed offset in minutes from the reference time. Positive = later, negative = earlier.
        Example: -30 with plan_start=07:00 creates a derived booking at 06:30.
    adjustment_booking_type_id:
      type: string
      format: uuid
      x-nullable: true
      description: >
        Booking type to use for the derived booking. If not set, the system uses
        the opposite direction of the original booking type.
```

**CreateBookingReasonRequest** -- add after `sort_order`:
```yaml
    reference_time:
      type: string
      enum:
        - plan_start
        - plan_end
        - booking_time
    offset_minutes:
      type: integer
    adjustment_booking_type_id:
      type: string
      format: uuid
```

**UpdateBookingReasonRequest** -- add after `sort_order`:
```yaml
    reference_time:
      type: string
      enum:
        - plan_start
        - plan_end
        - booking_time
      x-nullable: true
    offset_minutes:
      type: integer
      x-nullable: true
    adjustment_booking_type_id:
      type: string
      format: uuid
      x-nullable: true
```

### File: `/home/tolga/projects/terp/api/schemas/bookings.yaml` (modify)

**Booking** -- add after `notes`:
```yaml
    booking_reason_id:
      type: string
      format: uuid
      x-nullable: true
      description: Reason code selected when creating this booking
    is_auto_generated:
      type: boolean
      description: True if this booking was automatically derived from a reason adjustment
    original_booking_id:
      type: string
      format: uuid
      x-nullable: true
      description: For derived bookings, the ID of the original booking that triggered creation
    booking_reason:
      allOf:
        - $ref: './booking-reasons.yaml#/BookingReason'
      x-nullable: true
```

**Booking source enum** -- add `derived`:
```yaml
    source:
      type: string
      enum:
        - web
        - terminal
        - api
        - import
        - correction
        - derived
```

**CreateBookingRequest** -- add after `notes`:
```yaml
    booking_reason_id:
      type: string
      format: uuid
      description: Optional reason code for this booking
```

### Verification

```bash
make swagger-bundle
# Confirm bundled spec includes new fields
# Inspect api/openapi.bundled.yaml for booking_reason_id, reference_time, etc.
```

---

## Phase 3: Model Updates

### 3.1 Regenerate models

```bash
make generate
```

This updates generated models in `apps/api/gen/models/`:
- `booking_reason.go` -- adds `ReferenceTime`, `OffsetMinutes`, `AdjustmentBookingTypeID`
- `booking.go` -- adds `BookingReasonID`, `IsAutoGenerated`, `OriginalBookingID`, `BookingReason`
- `create_booking_request.go` -- adds `BookingReasonID`
- `create_booking_reason_request.go` -- adds `ReferenceTime`, `OffsetMinutes`, `AdjustmentBookingTypeID`
- `update_booking_reason_request.go` -- adds `ReferenceTime`, `OffsetMinutes`, `AdjustmentBookingTypeID`

### 3.2 Update GORM model: BookingReason

**File**: `/home/tolga/projects/terp/apps/api/internal/model/bookingreason.go` (modify)

Add these fields after `SortOrder`:

```go
// Adjustment configuration (ZMI: Buchen mit Grund)
ReferenceTime          *string    `gorm:"type:varchar(20)" json:"reference_time,omitempty"`
OffsetMinutes          *int       `gorm:"type:int" json:"offset_minutes,omitempty"`
AdjustmentBookingTypeID *uuid.UUID `gorm:"type:uuid" json:"adjustment_booking_type_id,omitempty"`
```

Add a helper method:

```go
// ReferenceTime enum constants
const (
    ReferenceTimePlanStart   = "plan_start"
    ReferenceTimePlanEnd     = "plan_end"
    ReferenceTimeBookingTime = "booking_time"
)

// HasAdjustment returns true if this reason is configured to create derived bookings.
func (br *BookingReason) HasAdjustment() bool {
    return br.ReferenceTime != nil && br.OffsetMinutes != nil
}
```

### 3.3 Update GORM model: Booking

**File**: `/home/tolga/projects/terp/apps/api/internal/model/booking.go` (modify)

Add new source constant:

```go
BookingSourceDerived BookingSource = "derived"
```

Add fields after `Notes` (before `CreatedAt`):

```go
// Reason and derived booking tracking
BookingReasonID   *uuid.UUID `gorm:"type:uuid" json:"booking_reason_id,omitempty"`
IsAutoGenerated   bool       `gorm:"default:false" json:"is_auto_generated"`
OriginalBookingID *uuid.UUID `gorm:"type:uuid" json:"original_booking_id,omitempty"`
```

Add relation after existing relations:

```go
BookingReason   *BookingReason `gorm:"foreignKey:BookingReasonID" json:"booking_reason,omitempty"`
OriginalBooking *Booking       `gorm:"foreignKey:OriginalBookingID" json:"original_booking,omitempty"`
```

Add helper method:

```go
// IsDerived returns true if this booking was auto-generated from a reason adjustment.
func (b *Booking) IsDerived() bool {
    return b.IsAutoGenerated && b.OriginalBookingID != nil
}
```

### Verification

```bash
cd /home/tolga/projects/terp/apps/api && go build ./...
# Should compile without errors
```

---

## Phase 4: Repository Layer

### 4.1 Update BookingReasonRepository

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/bookingreason.go` (modify)

No new methods needed -- GORM auto-handles the new columns. Existing `Create`, `GetByID`, `Update`,
`List`, `ListByBookingType` will include the new fields automatically because GORM reads from the struct.

### 4.2 Update BookingRepository

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/booking.go` (modify)

Add three new methods:

```go
// DeleteDerivedByOriginalBookingID deletes all derived bookings linked to an original booking.
// Used for idempotent re-creation of derived bookings.
func (r *BookingRepository) DeleteDerivedByOriginalBookingID(ctx context.Context, originalBookingID uuid.UUID) error {
    result := r.db.GORM.WithContext(ctx).
        Where("original_booking_id = ? AND is_auto_generated = true", originalBookingID).
        Delete(&model.Booking{})
    if result.Error != nil {
        return fmt.Errorf("failed to delete derived bookings: %w", result.Error)
    }
    return nil
}

// GetDerivedByOriginalBookingID retrieves all derived bookings for an original booking.
func (r *BookingRepository) GetDerivedByOriginalBookingID(ctx context.Context, originalBookingID uuid.UUID) ([]model.Booking, error) {
    var bookings []model.Booking
    err := r.db.GORM.WithContext(ctx).
        Where("original_booking_id = ? AND is_auto_generated = true", originalBookingID).
        Find(&bookings).Error
    if err != nil {
        return nil, fmt.Errorf("failed to get derived bookings: %w", err)
    }
    return bookings, nil
}

// DeleteDerivedByEmployeeDate deletes all derived bookings for an employee on a date.
// Used during recalculation to clean up before re-deriving.
func (r *BookingRepository) DeleteDerivedByEmployeeDate(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) error {
    result := r.db.GORM.WithContext(ctx).
        Where("tenant_id = ? AND employee_id = ? AND booking_date = ? AND is_auto_generated = true",
            tenantID, employeeID, date).
        Delete(&model.Booking{})
    if result.Error != nil {
        return fmt.Errorf("failed to delete derived bookings by date: %w", result.Error)
    }
    return nil
}
```

Update `GetByEmployeeAndDate` and `GetWithDetails` to preload `BookingReason`:

In `GetWithDetails`:
```go
Preload("BookingReason").
```

In `GetByEmployeeAndDate`:
```go
Preload("BookingReason").
```

### Verification

```bash
cd /home/tolga/projects/terp/apps/api && go build ./...
```

---

## Phase 5: Service Layer

### 5.1 Add BookingReasonRepository interface to BookingService

**File**: `/home/tolga/projects/terp/apps/api/internal/service/booking.go` (modify)

Add new interface definitions:

```go
// bookingReasonLookup provides booking reason data for derived booking creation.
type bookingReasonLookup interface {
    GetByID(ctx context.Context, id uuid.UUID) (*model.BookingReason, error)
}

// employeeDayPlanLookupForBooking provides day plan access for reference time resolution.
type employeeDayPlanLookupForBooking interface {
    GetForEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.EmployeeDayPlan, error)
}

// derivedBookingRepository provides methods for managing derived bookings.
type derivedBookingRepository interface {
    DeleteDerivedByOriginalBookingID(ctx context.Context, originalBookingID uuid.UUID) error
}
```

Update `BookingService` struct to add new dependencies:

```go
type BookingService struct {
    bookingRepo      bookingRepositoryForService
    bookingTypeRepo  bookingTypeRepositoryForService
    recalcSvc        recalcServiceForBooking
    monthlyValueRepo monthlyValueLookupForBooking
    // New dependencies for derived bookings
    reasonRepo       bookingReasonLookup
    empDayPlanRepo   employeeDayPlanLookupForBooking
    derivedRepo      derivedBookingRepository
}
```

Update `NewBookingService` to accept new optional dependencies:

```go
func NewBookingService(
    bookingRepo bookingRepositoryForService,
    bookingTypeRepo bookingTypeRepositoryForService,
    recalcSvc recalcServiceForBooking,
    monthlyValueRepo monthlyValueLookupForBooking,
) *BookingService {
    return &BookingService{
        bookingRepo:      bookingRepo,
        bookingTypeRepo:  bookingTypeRepo,
        recalcSvc:        recalcSvc,
        monthlyValueRepo: monthlyValueRepo,
    }
}

// SetReasonDeps sets the optional dependencies for derived booking creation.
func (s *BookingService) SetReasonDeps(
    reasonRepo bookingReasonLookup,
    empDayPlanRepo employeeDayPlanLookupForBooking,
    derivedRepo derivedBookingRepository,
) {
    s.reasonRepo = reasonRepo
    s.empDayPlanRepo = empDayPlanRepo
    s.derivedRepo = derivedRepo
}
```

### 5.2 Update CreateBookingInput

**File**: `/home/tolga/projects/terp/apps/api/internal/service/booking.go` (modify)

Add to `CreateBookingInput`:

```go
type CreateBookingInput struct {
    TenantID        uuid.UUID
    EmployeeID      uuid.UUID
    BookingTypeID   uuid.UUID
    BookingDate     time.Time
    OriginalTime    int
    EditedTime      int
    Source          model.BookingSource
    TerminalID      *uuid.UUID
    Notes           string
    CreatedBy       *uuid.UUID
    BookingReasonID *uuid.UUID  // NEW: optional reason
}
```

### 5.3 Update Create method

**File**: `/home/tolga/projects/terp/apps/api/internal/service/booking.go` (modify)

Update `Create` to set `BookingReasonID` and call derived booking logic:

```go
func (s *BookingService) Create(ctx context.Context, input CreateBookingInput) (*model.Booking, error) {
    // ... existing validation ...

    // Build model
    booking := &model.Booking{
        TenantID:        input.TenantID,
        EmployeeID:      input.EmployeeID,
        BookingTypeID:   input.BookingTypeID,
        BookingDate:     input.BookingDate,
        OriginalTime:    input.OriginalTime,
        EditedTime:      input.EditedTime,
        Source:          input.Source,
        TerminalID:      input.TerminalID,
        Notes:           input.Notes,
        CreatedBy:       input.CreatedBy,
        UpdatedBy:       input.CreatedBy,
        BookingReasonID: input.BookingReasonID,  // NEW
    }

    // Create booking
    if err := s.bookingRepo.Create(ctx, booking); err != nil {
        return nil, err
    }

    // Create derived booking if reason has adjustment config (NEW)
    if input.BookingReasonID != nil {
        s.handleDerivedBooking(ctx, booking, bt)
    }

    // Trigger recalculation for the affected date
    _, _ = s.recalcSvc.TriggerRecalc(ctx, input.TenantID, input.EmployeeID, input.BookingDate)

    return booking, nil
}
```

### 5.4 Implement derived booking logic

**File**: `/home/tolga/projects/terp/apps/api/internal/service/booking.go` (modify)

Add new error:

```go
var (
    ErrDerivedBookingSkipped = errors.New("derived booking skipped: no day plan available for plan-based reference time")
)
```

Add derived booking methods:

```go
// handleDerivedBooking creates or replaces a derived booking based on reason adjustment config.
// Errors are logged but do not fail the original booking creation.
func (s *BookingService) handleDerivedBooking(ctx context.Context, original *model.Booking, bt *model.BookingType) {
    if s.reasonRepo == nil || s.empDayPlanRepo == nil || s.derivedRepo == nil {
        return
    }

    reason, err := s.reasonRepo.GetByID(ctx, *original.BookingReasonID)
    if err != nil || !reason.HasAdjustment() {
        return
    }

    // Resolve reference time
    refTime, err := s.resolveReferenceTime(ctx, original, reason)
    if err != nil {
        // Plan-based reference without a day plan -- skip silently
        return
    }

    // Compute derived time
    derivedTime := refTime + *reason.OffsetMinutes

    // Clamp to valid range [0, 1439]
    if derivedTime < 0 {
        derivedTime = 0
    }
    if derivedTime > 1439 {
        derivedTime = 1439
    }

    // Determine booking type for derived booking
    derivedBookingTypeID := original.BookingTypeID
    if reason.AdjustmentBookingTypeID != nil {
        derivedBookingTypeID = *reason.AdjustmentBookingTypeID
    }

    // Delete existing derived booking for idempotency
    _ = s.derivedRepo.DeleteDerivedByOriginalBookingID(ctx, original.ID)

    // Create derived booking
    derived := &model.Booking{
        TenantID:          original.TenantID,
        EmployeeID:        original.EmployeeID,
        BookingDate:       original.BookingDate,
        BookingTypeID:     derivedBookingTypeID,
        OriginalTime:      derivedTime,
        EditedTime:        derivedTime,
        Source:            model.BookingSourceDerived,
        Notes:             "Derived from reason: " + reason.Code,
        IsAutoGenerated:   true,
        OriginalBookingID: &original.ID,
        BookingReasonID:   original.BookingReasonID,
    }

    _ = s.bookingRepo.Create(ctx, derived)
}

// resolveReferenceTime determines the base time for the derived booking computation.
func (s *BookingService) resolveReferenceTime(ctx context.Context, booking *model.Booking, reason *model.BookingReason) (int, error) {
    switch *reason.ReferenceTime {
    case model.ReferenceTimePlanStart:
        return s.getPlanTime(ctx, booking.EmployeeID, booking.BookingDate, true)
    case model.ReferenceTimePlanEnd:
        return s.getPlanTime(ctx, booking.EmployeeID, booking.BookingDate, false)
    case model.ReferenceTimeBookingTime:
        return booking.EditedTime, nil
    default:
        return booking.EditedTime, nil
    }
}

// getPlanTime retrieves the plan start (ComeFrom) or plan end (GoTo) time.
func (s *BookingService) getPlanTime(ctx context.Context, employeeID uuid.UUID, date time.Time, isStart bool) (int, error) {
    edp, err := s.empDayPlanRepo.GetForEmployeeDate(ctx, employeeID, date)
    if err != nil || edp == nil || edp.DayPlanID == nil || edp.DayPlan == nil {
        return 0, ErrDerivedBookingSkipped
    }

    if isStart {
        if edp.DayPlan.ComeFrom != nil {
            return *edp.DayPlan.ComeFrom, nil
        }
    } else {
        if edp.DayPlan.GoTo != nil {
            return *edp.DayPlan.GoTo, nil
        }
    }

    return 0, ErrDerivedBookingSkipped
}
```

### 5.5 Handle derived booking on Delete

**File**: `/home/tolga/projects/terp/apps/api/internal/service/booking.go` (modify)

When an original booking is deleted, its derived bookings should also be deleted
(handled by ON DELETE CASCADE on `original_booking_id` FK). No code change needed
since the DB cascade handles this.

However, we should also ensure that if the original booking is updated
(e.g., time changed), the derived booking is refreshed:

### 5.6 Handle derived booking on Update

**File**: `/home/tolga/projects/terp/apps/api/internal/service/booking.go` (modify)

In the `Update` method, after saving changes but before triggering recalc:

```go
func (s *BookingService) Update(ctx context.Context, id uuid.UUID, input UpdateBookingInput) (*model.Booking, error) {
    // ... existing logic ...

    // Save changes
    if err := s.bookingRepo.Update(ctx, booking); err != nil {
        return nil, err
    }

    // Refresh derived booking if this booking has a reason with adjustment (NEW)
    if booking.BookingReasonID != nil && input.EditedTime != nil {
        bt, _ := s.bookingTypeRepo.GetByID(ctx, booking.BookingTypeID)
        if bt != nil {
            s.handleDerivedBooking(ctx, booking, bt)
        }
    }

    // Trigger recalculation
    _, _ = s.recalcSvc.TriggerRecalc(ctx, booking.TenantID, booking.EmployeeID, booking.BookingDate)

    return booking, nil
}
```

### 5.7 Update BookingReasonService

**File**: `/home/tolga/projects/terp/apps/api/internal/service/bookingreason.go` (modify)

Update `CreateBookingReasonInput`:

```go
type CreateBookingReasonInput struct {
    TenantID                uuid.UUID
    BookingTypeID           uuid.UUID
    Code                    string
    Label                   string
    SortOrder               *int
    ReferenceTime           *string
    OffsetMinutes           *int
    AdjustmentBookingTypeID *uuid.UUID
}
```

Update `Create` method to populate new fields:

```go
br := &model.BookingReason{
    TenantID:                input.TenantID,
    BookingTypeID:           input.BookingTypeID,
    Code:                    code,
    Label:                   label,
    IsActive:                true,
    ReferenceTime:           input.ReferenceTime,
    OffsetMinutes:           input.OffsetMinutes,
    AdjustmentBookingTypeID: input.AdjustmentBookingTypeID,
}
```

Update `UpdateBookingReasonInput`:

```go
type UpdateBookingReasonInput struct {
    Label                   *string
    IsActive                *bool
    SortOrder               *int
    ReferenceTime           *string    // nil = don't change, pointer to empty string = clear
    OffsetMinutes           *int       // nil = don't change
    AdjustmentBookingTypeID *uuid.UUID // nil = don't change
}
```

Update `Update` method to apply new fields:

```go
if input.ReferenceTime != nil {
    br.ReferenceTime = input.ReferenceTime
}
if input.OffsetMinutes != nil {
    br.OffsetMinutes = input.OffsetMinutes
}
if input.AdjustmentBookingTypeID != nil {
    br.AdjustmentBookingTypeID = input.AdjustmentBookingTypeID
}
```

Add validation for adjustment config -- `reference_time` and `offset_minutes` must both be set or both be nil:

```go
var ErrBookingReasonAdjustmentIncomplete = errors.New("reference_time and offset_minutes must both be set or both be empty")

// In Create:
if (input.ReferenceTime != nil) != (input.OffsetMinutes != nil) {
    return nil, ErrBookingReasonAdjustmentIncomplete
}
if input.ReferenceTime != nil {
    rt := *input.ReferenceTime
    if rt != model.ReferenceTimePlanStart && rt != model.ReferenceTimePlanEnd && rt != model.ReferenceTimeBookingTime {
        return nil, errors.New("invalid reference_time value")
    }
}
```

### 5.8 Wire new dependencies in main.go

**File**: `/home/tolga/projects/terp/apps/api/cmd/server/main.go` (modify)

After creating `bookingService`, add:

```go
// Wire derived booking dependencies
bookingService.SetReasonDeps(bookingReasonRepo, empDayPlanRepo, bookingRepo)
```

This requires:
- `bookingReasonRepo` (already created earlier in main.go)
- `empDayPlanRepo` (already created earlier in main.go)
- `bookingRepo` (already created earlier in main.go)

### Verification

```bash
cd /home/tolga/projects/terp/apps/api && go build ./...
```

---

## Phase 6: Handler Layer

### 6.1 Update BookingReasonHandler

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/bookingreason.go` (modify)

**Create handler** -- parse new fields from request:

```go
func (h *BookingReasonHandler) Create(w http.ResponseWriter, r *http.Request) {
    // ... existing code ...

    input := service.CreateBookingReasonInput{
        TenantID:      tenantID,
        BookingTypeID: btID,
        Code:          *req.Code,
        Label:         *req.Label,
    }
    if req.SortOrder != 0 {
        so := int(req.SortOrder)
        input.SortOrder = &so
    }
    // NEW: adjustment fields
    if req.ReferenceTime != "" {
        input.ReferenceTime = &req.ReferenceTime
    }
    if req.OffsetMinutes != 0 {
        om := int(req.OffsetMinutes)
        input.OffsetMinutes = &om
    }
    if req.AdjustmentBookingTypeID != "" {
        abtID, err := uuid.Parse(req.AdjustmentBookingTypeID.String())
        if err != nil {
            respondError(w, http.StatusBadRequest, "Invalid adjustment_booking_type_id")
            return
        }
        input.AdjustmentBookingTypeID = &abtID
    }

    // ... rest of handler ...
}
```

**Update handler** -- parse new fields:

```go
func (h *BookingReasonHandler) Update(w http.ResponseWriter, r *http.Request) {
    // ... existing code ...

    input := service.UpdateBookingReasonInput{}
    // ... existing field mapping ...

    // NEW: adjustment fields
    if req.ReferenceTime != "" {
        input.ReferenceTime = &req.ReferenceTime
    }
    if req.OffsetMinutes != nil {
        om := int(*req.OffsetMinutes)
        input.OffsetMinutes = &om
    }
    if req.AdjustmentBookingTypeID != nil {
        abtID, err := uuid.Parse(req.AdjustmentBookingTypeID.String())
        if err != nil {
            respondError(w, http.StatusBadRequest, "Invalid adjustment_booking_type_id")
            return
        }
        input.AdjustmentBookingTypeID = &abtID
    }

    // ... rest of handler ...
}
```

**Response mapper** -- add new fields to `bookingReasonToResponse`:

```go
func bookingReasonToResponse(br *model.BookingReason) *models.BookingReason {
    // ... existing code ...

    resp := &models.BookingReason{
        // ... existing fields ...
    }

    // NEW: adjustment fields
    if br.ReferenceTime != nil {
        resp.ReferenceTime = *br.ReferenceTime
    }
    if br.OffsetMinutes != nil {
        om := int64(*br.OffsetMinutes)
        resp.OffsetMinutes = &om
    }
    if br.AdjustmentBookingTypeID != nil {
        abtID := strfmt.UUID(br.AdjustmentBookingTypeID.String())
        resp.AdjustmentBookingTypeID = &abtID
    }

    return resp
}
```

**Error handler** -- add new error case:

```go
case service.ErrBookingReasonAdjustmentIncomplete:
    respondError(w, http.StatusBadRequest, "reference_time and offset_minutes must both be set or both be empty")
```

### 6.2 Update BookingHandler

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/booking.go` (modify)

**Create handler** -- parse `booking_reason_id` from request:

In the `Create` method, after parsing `bookingTypeID`:

```go
// Parse optional booking_reason_id (NEW)
var bookingReasonID *uuid.UUID
if req.BookingReasonID != nil && req.BookingReasonID.String() != "" {
    brID, err := uuid.Parse(req.BookingReasonID.String())
    if err != nil {
        respondError(w, http.StatusBadRequest, "Invalid booking_reason_id")
        return
    }
    bookingReasonID = &brID
}

input := service.CreateBookingInput{
    // ... existing fields ...
    BookingReasonID: bookingReasonID,  // NEW
}
```

**Response mapper** -- add new fields to `modelToResponse`:

```go
// In modelToResponse, after existing optional fields:

// Optional booking reason
if b.BookingReasonID != nil {
    brID := strfmt.UUID(b.BookingReasonID.String())
    resp.BookingReasonID = &brID
}

// Auto-generated flag
resp.IsAutoGenerated = b.IsAutoGenerated

// Original booking ID for derived bookings
if b.OriginalBookingID != nil {
    obID := strfmt.UUID(b.OriginalBookingID.String())
    resp.OriginalBookingID = &obID
}
```

### Verification

```bash
make swagger-bundle && make generate
cd /home/tolga/projects/terp/apps/api && go build ./...
make test
```

---

## Phase 7: Tests

### 7.1 Unit Tests: BookingReason adjustment validation

**File**: `/home/tolga/projects/terp/apps/api/internal/service/bookingreason_test.go` (modify)

Add new test cases:

```go
func TestBookingReasonService_Create_WithAdjustment(t *testing.T)
// Input: reference_time=plan_start, offset_minutes=-30
// Expected: Creates reason with adjustment config

func TestBookingReasonService_Create_AdjustmentIncomplete_ReferenceOnly(t *testing.T)
// Input: reference_time=plan_start, offset_minutes=nil
// Expected: ErrBookingReasonAdjustmentIncomplete

func TestBookingReasonService_Create_AdjustmentIncomplete_OffsetOnly(t *testing.T)
// Input: reference_time=nil, offset_minutes=-30
// Expected: ErrBookingReasonAdjustmentIncomplete

func TestBookingReasonService_Create_InvalidReferenceTime(t *testing.T)
// Input: reference_time="invalid_value", offset_minutes=10
// Expected: error "invalid reference_time value"

func TestBookingReasonService_Update_AdjustmentFields(t *testing.T)
// Input: Update existing reason, set reference_time=booking_time, offset_minutes=20
// Expected: Fields updated successfully

func TestBookingReasonService_HasAdjustment(t *testing.T)
// Test model method HasAdjustment() returns correct values
```

### 7.2 Unit Tests: Derived booking time computation

**File**: `/home/tolga/projects/terp/apps/api/internal/service/booking_test.go` (modify)

Add mock for new interfaces:

```go
type mockBookingReasonLookup struct {
    mock.Mock
}

func (m *mockBookingReasonLookup) GetByID(ctx context.Context, id uuid.UUID) (*model.BookingReason, error) {
    args := m.Called(ctx, id)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.BookingReason), args.Error(1)
}

type mockEmpDayPlanLookupForBooking struct {
    mock.Mock
}

func (m *mockEmpDayPlanLookupForBooking) GetForEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.EmployeeDayPlan, error) {
    args := m.Called(ctx, employeeID, date)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.EmployeeDayPlan), args.Error(1)
}

type mockDerivedBookingRepo struct {
    mock.Mock
}

func (m *mockDerivedBookingRepo) DeleteDerivedByOriginalBookingID(ctx context.Context, id uuid.UUID) error {
    args := m.Called(ctx, id)
    return args.Error(0)
}
```

Add test cases:

```go
func TestBookingService_Create_WithReasonPlanStartOffset(t *testing.T)
// Setup: Reason with reference_time=plan_start, offset_minutes=-30
//        Day plan ComeFrom=420 (07:00)
// Action: Create booking at 07:05
// Expected: Derived booking created at 390 (06:30)
//           Derived booking has is_auto_generated=true
//           Derived booking has original_booking_id set
//           Derived booking source is "derived"

func TestBookingService_Create_WithReasonPlanEndOffset(t *testing.T)
// Setup: Reason with reference_time=plan_end, offset_minutes=+20
//        Day plan GoTo=960 (16:00)
// Action: Create booking at 16:05
// Expected: Derived booking created at 980 (16:20)

func TestBookingService_Create_WithReasonBookingTimeOffset(t *testing.T)
// Setup: Reason with reference_time=booking_time, offset_minutes=+20
// Action: Create booking at 1020 (17:00)
// Expected: Derived booking created at 1040 (17:20)

func TestBookingService_Create_WithReasonNoDayPlan(t *testing.T)
// Setup: Reason with reference_time=plan_start, offset_minutes=-30
//        No day plan assigned (empDayPlanRepo returns nil)
// Action: Create booking at 07:00
// Expected: Original booking created OK; derived booking skipped (no error)

func TestBookingService_Create_WithReasonNegativeClamp(t *testing.T)
// Setup: Reason with reference_time=booking_time, offset_minutes=-500
// Action: Create booking at 60 (01:00)
// Expected: Derived time clamped to 0

func TestBookingService_Create_WithReasonOverflowClamp(t *testing.T)
// Setup: Reason with reference_time=booking_time, offset_minutes=+500
// Action: Create booking at 1400 (23:20)
// Expected: Derived time clamped to 1439

func TestBookingService_Create_WithReasonNoAdjustment(t *testing.T)
// Setup: Reason with no adjustment config (reference_time=nil, offset_minutes=nil)
// Action: Create booking with that reason
// Expected: No derived booking created; original booking still has BookingReasonID set

func TestBookingService_Create_DerivedIdempotency(t *testing.T)
// Setup: Reason with adjustment, existing derived booking for same original
// Action: Create booking (simulating re-import)
// Expected: Old derived booking deleted, new one created

func TestBookingService_Create_WithAdjustmentBookingTypeID(t *testing.T)
// Setup: Reason with adjustment_booking_type_id pointing to a specific booking type
// Action: Create booking
// Expected: Derived booking uses the specified booking type ID (not the original's)

func TestBookingService_Update_RefreshDerivedBooking(t *testing.T)
// Setup: Booking with reason adjustment, existing derived booking
// Action: Update booking's edited_time
// Expected: Derived booking re-created with new computed time

func TestBookingService_Delete_CascadesDerivedBooking(t *testing.T)
// Setup: Original booking with a derived booking
// Action: Delete original booking
// Expected: Derived booking also deleted (DB cascade)
```

### 7.3 Integration Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/service/bookingreason_test.go` (modify)

Add integration test with real DB:

```go
func TestBookingReasonService_Create_WithAdjustment_Integration(t *testing.T)
// Uses testutil.SetupTestDB
// Creates booking type, then reason with adjustment
// Verifies reason saved with correct adjustment fields
```

### 7.4 Daily Calculation Impact Test

**File**: `/home/tolga/projects/terp/apps/api/internal/service/daily_calc_test.go` (modify, if exists)

Add a test verifying that derived bookings participate in daily calculation:

```go
func TestDailyCalc_DerivedBookingAffectsNetTime(t *testing.T)
// Setup: Day plan 07:00-16:00, 540 min target
//        Original booking: A1 (arrive) at 07:00
//        Reason: reference_time=plan_start, offset_minutes=-30
//        Result: derived booking at 06:30 (A1 arrive)
//        Additional booking: A2 (depart) at 16:00
// Expected: The arrive time from the derived booking (06:30) is used
//           in pairing, resulting in different net time than without the
//           derived booking.
```

### Verification

```bash
cd /home/tolga/projects/terp/apps/api && go test -v -run "TestBookingReasonService_Create_With" ./internal/service/...
cd /home/tolga/projects/terp/apps/api && go test -v -run "TestBookingService_Create_WithReason" ./internal/service/...
make test
```

---

## Phase 8: Verification

### Manual Verification Checklist

1. **Create a booking reason with adjustment config**:
   ```
   POST /booking-reasons
   {
     "booking_type_id": "<ARRIVE_TYPE_ID>",
     "code": "EARLY_START",
     "label": "Early Start (30 min before plan)",
     "reference_time": "plan_start",
     "offset_minutes": -30
   }
   ```
   Verify: Response includes `reference_time`, `offset_minutes` fields.

2. **Create a booking with that reason**:
   ```
   POST /bookings
   {
     "employee_id": "<EMP_ID>",
     "booking_date": "2026-02-01",
     "booking_type_id": "<ARRIVE_TYPE_ID>",
     "time": "07:05",
     "booking_reason_id": "<EARLY_START_REASON_ID>"
   }
   ```
   Verify:
   - Original booking created with `booking_reason_id` set.
   - A second (derived) booking exists for the same employee and date.
   - Derived booking has `is_auto_generated: true`, `original_booking_id` set, `source: "derived"`.
   - If day plan has `come_from=420` (07:00), derived time = 420 - 30 = 390 (06:30).

3. **Re-create the same booking (idempotency)**:
   Delete the original booking and create again with same parameters.
   Verify: Only one derived booking exists (no duplicates).

4. **Create booking with reason but no adjustment**:
   Create a reason without `reference_time`/`offset_minutes`, then create a booking with it.
   Verify: No derived booking is created. Booking still has `booking_reason_id` set.

5. **Create booking with plan-based reason but no day plan**:
   Assign an employee with no day plan for that date.
   Create booking with `plan_start` reference reason.
   Verify: Original booking succeeds. No derived booking (gracefully skipped).

6. **Day view shows derived bookings**:
   ```
   GET /bookings/day-view?employee_id=<ID>&date=2026-02-01
   ```
   Verify: Both original and derived bookings appear in the bookings array.

7. **Update original booking time**:
   Update the original booking's time.
   If reason reference is `booking_time`, verify the derived booking time also updates.

8. **Delete original booking**:
   Delete the original booking.
   Verify: Derived booking is also deleted (CASCADE).

### Expected API Behavior Examples

**Example 1: Plan-based offset**
```
Day plan: ComeFrom=420 (07:00), GoTo=960 (16:00)
Reason: reference_time=plan_start, offset_minutes=-30

POST /bookings { time: "07:05", booking_reason_id: "..." }
  -> Original booking: time=425
  -> Derived booking: time=390 (06:30), is_auto_generated=true
```

**Example 2: Booking-time offset**
```
Reason: reference_time=booking_time, offset_minutes=+20

POST /bookings { time: "17:00", booking_reason_id: "..." }
  -> Original booking: time=1020
  -> Derived booking: time=1040 (17:20), is_auto_generated=true
```

**Example 3: Missing day plan**
```
Reason: reference_time=plan_start, offset_minutes=-30
Employee has no day plan for date.

POST /bookings { time: "07:00", booking_reason_id: "..." }
  -> Original booking: time=420 (created normally)
  -> Derived booking: not created (skipped, no plan)
```

---

## Files Modified Summary

| File | Action | Phase |
|------|--------|-------|
| `db/migrations/000078_booking_reason_adjustments.up.sql` | Create | 1 |
| `db/migrations/000078_booking_reason_adjustments.down.sql` | Create | 1 |
| `api/schemas/booking-reasons.yaml` | Modify | 2 |
| `api/schemas/bookings.yaml` | Modify | 2 |
| `apps/api/gen/models/booking_reason.go` | Regenerate | 3 |
| `apps/api/gen/models/booking.go` | Regenerate | 3 |
| `apps/api/gen/models/create_booking_request.go` | Regenerate | 3 |
| `apps/api/gen/models/create_booking_reason_request.go` | Regenerate | 3 |
| `apps/api/gen/models/update_booking_reason_request.go` | Regenerate | 3 |
| `apps/api/internal/model/bookingreason.go` | Modify | 3 |
| `apps/api/internal/model/booking.go` | Modify | 3 |
| `apps/api/internal/repository/booking.go` | Modify | 4 |
| `apps/api/internal/service/bookingreason.go` | Modify | 5 |
| `apps/api/internal/service/booking.go` | Modify | 5 |
| `apps/api/cmd/server/main.go` | Modify | 5 |
| `apps/api/internal/handler/bookingreason.go` | Modify | 6 |
| `apps/api/internal/handler/booking.go` | Modify | 6 |
| `apps/api/internal/service/bookingreason_test.go` | Modify | 7 |
| `apps/api/internal/service/booking_test.go` | Modify | 7 |

## Success Criteria

1. A booking reason with `reference_time` and `offset_minutes` creates a derived booking when used.
2. Derived bookings have `is_auto_generated=true`, `original_booking_id` set, `source="derived"`.
3. Recalculation or re-import does not create duplicate derived bookings (idempotency).
4. Reasons without adjustment config cause no behavioral change.
5. Missing day plan for plan-based reference gracefully skips derived booking creation.
6. Derived bookings participate in daily calculation like normal bookings.
7. All unit tests pass. All existing tests still pass.
