---
date: 2026-01-22T17:20:00+00:00
researcher: Claude
git_commit: e1b6c6958a0e3e70502eb1213fb3cb53c3d157c3
branch: master
repository: terp
topic: "NOK-131: Create Booking Handler"
tags: [research, codebase, handler, booking, time-tracking, api]
status: complete
last_updated: 2026-01-22
last_updated_by: Claude
---

# Research: NOK-131 - Create Booking Handler

**Date**: 2026-01-22T17:20:00+00:00
**Researcher**: Claude
**Git Commit**: e1b6c6958a0e3e70502eb1213fb3cb53c3d157c3
**Branch**: master
**Repository**: terp

## Research Question

Research the codebase to understand all components needed to implement the Booking HTTP Handler (TICKET-073), including existing handler patterns, OpenAPI specifications, service interfaces, and generated models.

## Summary

The Booking Handler implementation requires creating `apps/api/internal/handler/booking.go` with CRUD endpoints for bookings and day-view functionality. The codebase has well-established patterns for handlers including Chi router usage, tenant context extraction, generated OpenAPI models for request/response, and service layer integration. The required services (`BookingService` and `DailyCalcService`) are already implemented and ready for handler integration.

## Detailed Findings

### 1. Handler Structure Pattern

All handlers in `apps/api/internal/handler/` follow a consistent pattern:

**Struct Definition:**
```go
type BookingHandler struct {
    bookingService  *service.BookingService   // Required for CRUD
    dailyCalcService *service.DailyCalcService // Required for Calculate endpoint
}
```

**Constructor:**
```go
func NewBookingHandler(
    bookingService *service.BookingService,
    dailyCalcService *service.DailyCalcService,
) *BookingHandler {
    return &BookingHandler{
        bookingService:   bookingService,
        dailyCalcService: dailyCalcService,
    }
}
```

**Route Registration** (in `handler/routes.go`):
```go
func RegisterBookingRoutes(r chi.Router, h *BookingHandler) {
    r.Route("/bookings", func(r chi.Router) {
        r.Get("/", h.List)
        r.Post("/", h.Create)
        r.Get("/{id}", h.GetByID)
        r.Put("/{id}", h.Update)
        r.Delete("/{id}", h.Delete)
    })
    r.Route("/employees/{id}/day/{date}", func(r chi.Router) {
        r.Get("/", h.GetDayView)
        r.Post("/calculate", h.Calculate)
    })
}
```

### 2. OpenAPI Endpoints to Implement

Based on `api/paths/bookings.yaml` and `api/paths/employees.yaml`:

| Method | Path | Operation ID | Description |
|--------|------|--------------|-------------|
| GET | `/bookings` | listBookings | List with filters |
| POST | `/bookings` | createBooking | Create new booking |
| GET | `/bookings/{id}` | getBooking | Get by ID |
| PUT | `/bookings/{id}` | updateBooking | Update booking |
| DELETE | `/bookings/{id}` | deleteBooking | Delete booking |
| GET | `/employees/{id}/day/{date}` | getEmployeeDayView | Day view with calculations |
| POST | `/employees/{id}/day/{date}/calculate` | calculateEmployeeDay | Manual recalculation |

### 3. Request/Response Models (Generated)

The handler MUST use generated models from `apps/api/gen/models/`:

**Request Models:**
- `models.CreateBookingRequest` - Required: `employee_id`, `booking_date`, `booking_type_id`, `time` (HH:MM format)
- `models.UpdateBookingRequest` - Optional: `time`, `notes`

**Response Models:**
- `models.Booking` - Full booking with relations
- `models.BookingList` - Paginated list with `data` and `total`
- `models.DayView` - Complete day info with bookings, daily_value, errors

### 4. Service Interfaces

#### BookingService (`apps/api/internal/service/booking.go`)

```go
// Available methods
Create(ctx context.Context, input CreateBookingInput) (*model.Booking, error)
GetByID(ctx context.Context, id uuid.UUID) (*model.Booking, error)
Update(ctx context.Context, id uuid.UUID, input UpdateBookingInput) (*model.Booking, error)
Delete(ctx context.Context, id uuid.UUID) error
ListByEmployeeDate(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) ([]model.Booking, error)
ListByEmployeeDateRange(ctx context.Context, tenantID, employeeID uuid.UUID, from, to time.Time) ([]model.Booking, error)
```

**Service Errors:**
- `service.ErrBookingNotFound` - Booking doesn't exist
- `service.ErrMonthClosed` - Month is closed for edits (HTTP 403)
- `service.ErrInvalidBookingTime` - Time outside 0-1439 range (HTTP 400)
- `service.ErrInvalidBookingType` - Booking type doesn't exist (HTTP 400)

#### DailyCalcService (`apps/api/internal/service/daily_calc.go`)

```go
CalculateDay(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (*model.DailyValue, error)
```

### 5. Time Handling

**Time Format Conversion:**
- API accepts: `"HH:MM"` string (e.g., "08:30")
- Internal: Minutes from midnight (0-1439)
- Use `timeutil.ParseTimeString()` to convert

```go
import "terp/apps/api/internal/timeutil"

// Parse HH:MM to minutes
minutes, err := timeutil.ParseTimeString("08:30")  // Returns 510
if err != nil {
    // err == timeutil.ErrInvalidTimeFormat
}

// Convert minutes to HH:MM string
str := timeutil.MinutesToString(510)  // Returns "08:30"
```

### 6. Tenant Context

All handlers must extract tenant context:

```go
tenantID, ok := middleware.TenantFromContext(r.Context())
if !ok {
    respondError(w, http.StatusUnauthorized, "Tenant required")
    return
}
```

### 7. Standard Response Helpers

From `apps/api/internal/handler/response.go`:

```go
// Success response
respondJSON(w, http.StatusOK, data)
respondJSON(w, http.StatusCreated, data)
w.WriteHeader(http.StatusNoContent)

// Error response
respondError(w, http.StatusBadRequest, "Invalid request body")
respondError(w, http.StatusNotFound, "Booking not found")
respondError(w, http.StatusForbidden, "Month is closed")
```

### 8. Query Parameter Parsing

Pattern from existing handlers:

```go
// Employee ID filter
if empID := r.URL.Query().Get("employee_id"); empID != "" {
    id, err := uuid.Parse(empID)
    if err == nil {
        filter.EmployeeID = &id
    }
}

// Date range
if from := r.URL.Query().Get("from"); from != "" {
    if t, err := time.Parse("2006-01-02", from); err == nil {
        filter.StartDate = &t
    }
}

// Pagination
if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
    if limit, err := strconv.Atoi(limitStr); err == nil && limit > 0 {
        filter.Limit = limit
    }
}
```

### 9. BookingFilter for List

```go
type BookingFilter struct {
    TenantID   uuid.UUID
    EmployeeID *uuid.UUID
    StartDate  *time.Time
    EndDate    *time.Time
    Direction  *model.BookingDirection
    Source     *model.BookingSource
    HasPair    *bool
    Offset     int
    Limit      int
}
```

### 10. DayView Response Assembly

The DayView combines multiple data sources:

```go
type DayView struct {
    EmployeeID uuid.UUID
    Date       time.Time
    Bookings   []model.Booking
    DailyValue *model.DailyValue  // From DailyCalcService or lookup
    DayPlan    *model.DayPlanSummary  // From EmployeeDayPlan
    IsHoliday  bool
    Holiday    *model.Holiday
    Errors     []model.DailyError
}
```

## Code References

- Handler patterns: `apps/api/internal/handler/employee.go:19-25`
- Route registration: `apps/api/internal/handler/routes.go:136-151`
- Response helpers: `apps/api/internal/handler/response.go:13-25`
- Tenant context: `apps/api/internal/middleware/tenant.go:29-33`
- BookingService: `apps/api/internal/service/booking.go:48-140`
- DailyCalcService: `apps/api/internal/service/daily_calc.go:122-178`
- Time utilities: `apps/api/internal/timeutil/timeutil.go:39-58`
- OpenAPI booking schema: `api/schemas/bookings.yaml:115-148`
- Generated models: `apps/api/gen/models/booking.go`, `create_booking_request.go`

## Architecture Documentation

### Handler Integration Flow

```
HTTP Request
    ↓
Chi Router
    ↓
Auth Middleware (JWT)
    ↓
Tenant Middleware (X-Tenant-ID)
    ↓
BookingHandler
    ├── Parse request body → generated models
    ├── Convert HH:MM → minutes (timeutil)
    ├── Build service input
    ├── Call BookingService / DailyCalcService
    ├── Map errors to HTTP status
    └── respondJSON with generated model
```

### Error Code Mapping

| Service Error | HTTP Status | Message |
|---------------|-------------|---------|
| ErrBookingNotFound | 404 | "Booking not found" |
| ErrMonthClosed | 403 | "Month is closed" |
| ErrInvalidBookingTime | 400 | "Invalid time format" |
| ErrInvalidBookingType | 400 | "Invalid booking type" |
| ErrBookingOverlap | 409 | "Overlapping bookings" |
| default | 500 | "Internal server error" |

## Historical Context (from thoughts/)

**Plan file:** `thoughts/shared/plans/tickets/TICKET-073-create-booking-handler.md`
- Contains draft implementation code
- Note: Draft defines custom request structs but should use generated models instead per project conventions

## Related Research

- `thoughts/shared/plans/2026-01-22-NOK-128-create-daily-calculation-service.md` - DailyCalcService implementation
- `thoughts/shared/plans/2026-01-22-NOK-130-create-booking-service.md` - BookingService implementation

## Implementation Checklist

Based on acceptance criteria from NOK-131:

- [ ] Time parsing (HH:MM format) - Use `timeutil.ParseTimeString()`
- [ ] Day view endpoint with calculations - Combine BookingService + DailyCalcService
- [ ] CRUD endpoints functional - Map to BookingService methods
- [ ] Proper error responses - Use error mapping table above
- [ ] Unit tests with mocked service - Follow `handler/*_test.go` patterns
- [ ] `make test` passes
- [ ] `make lint` passes

## ZMI Time Reference Context

From `thoughts/shared/reference/zmi-calculataion-manual-reference.md`:

**Booking Value Types (Section 21.1):**
- **Original** - Value read from terminal, immutable
- **Edited** - User-modifiable, defaults to Original
- **Calculated** - After tolerance/rounding applied, used for calculations

This maps to our `model.Booking`:
- `OriginalTime` → Original
- `EditedTime` → Edited
- `CalculatedTime` → Calculated (nullable)

**Day Calculation Trigger (Section 21.2):**
- Manual calculation via "Tag berechnen" (Calculate day) for immediate feedback
- Final calculation occurs next day during automatic nightly batch
- Our `/employees/{id}/day/{date}/calculate` endpoint implements the manual trigger

**Booking Pairing:**
- Bookings are paired (A1=Kommen/Arrival, A2=Gehen/Departure)
- ZMI Time finds matching IN/OUT pairs and puts them in one row
- Our `PairID` field on `model.Booking` tracks this relationship

## Open Questions (Resolved)

1. **Pagination approach:** Use existing codebase pattern with `limit`/`offset` query parameters (matches `employee.go`, `holiday.go` patterns). The OpenAPI spec can be updated later if needed.

2. **DayView model:** Use the generated `models.DayView` from OpenAPI for the response. Map internal models to generated models in the handler.

3. **GetDayView data assembly:** Assemble in the handler following existing patterns. The handler will:
   - Call `BookingService.ListByEmployeeDate()` for bookings
   - Look up or trigger calculation for `DailyValue`
   - Look up `EmployeeDayPlan` for day plan info
   - Check `HolidayRepository` for holiday status
   - Assemble into `models.DayView` response
