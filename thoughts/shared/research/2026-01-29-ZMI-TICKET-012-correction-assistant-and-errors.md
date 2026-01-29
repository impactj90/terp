# Research: ZMI-TICKET-012 - Correction Assistant, Error/Hint Catalog, and Logs

**Date**: 2026-01-29
**Ticket**: ZMI-TICKET-012
**Status**: Research complete

---

## 1. Ticket Summary

ZMI-TICKET-012 requires the correction assistant data model and APIs: an error/hint catalog, correction assistant list queries with filtering, custom message overrides, and correction message catalog. The correction assistant shows errors and hints produced by daily calculation (missing bookings, core time violations, minimum work time violations, etc.) and allows supervisors to view, filter, and manage them.

Key requirements:
- Error/hint catalog data model: code, default text, custom override text, severity classification
- Error/hint records per employee-date: error code, severity, message, timestamps, resolved flag
- Correction assistant list queries: filter by date range, department, employee
- Default date range: previous month + current month
- Custom message overrides replace default text in outputs
- Endpoints: list correction items, retrieve error catalog, update custom message text and severity

Dependencies:
- Daily calculation engine (ZMI-TICKET-006) -- already implemented
- User management (ZMI-TICKET-003) -- already implemented

---

## 2. Existing Codebase State

### 2.1 Current Error Code Infrastructure

**File**: `/home/tolga/projects/terp/apps/api/internal/calculation/errors.go`

Error codes are defined as string constants in the calculation package:

```go
// Pairing errors
ErrCodeMissingCome     = "MISSING_COME"
ErrCodeMissingGo       = "MISSING_GO"
ErrCodeUnpairedBooking = "UNPAIRED_BOOKING"

// Time window errors
ErrCodeEarlyCome = "EARLY_COME"
ErrCodeLateCome  = "LATE_COME"
ErrCodeEarlyGo   = "EARLY_GO"
ErrCodeLateGo    = "LATE_GO"

// Core hours errors
ErrCodeMissedCoreStart = "MISSED_CORE_START"
ErrCodeMissedCoreEnd   = "MISSED_CORE_END"

// Work time errors
ErrCodeBelowMinWorkTime = "BELOW_MIN_WORK_TIME"
ErrCodeNoBookings       = "NO_BOOKINGS"

// Data errors
ErrCodeInvalidTime     = "INVALID_TIME"
ErrCodeDuplicateInTime = "DUPLICATE_IN_TIME"

// Shift detection errors
ErrCodeNoMatchingShift = "NO_MATCHING_SHIFT"
```

Warning codes:
```go
WarnCodeCrossMidnight    = "CROSS_MIDNIGHT"
WarnCodeMaxTimeReached   = "MAX_TIME_REACHED"
WarnCodeManualBreak      = "MANUAL_BREAK"
WarnCodeNoBreakRecorded  = "NO_BREAK_RECORDED"
WarnCodeShortBreak       = "SHORT_BREAK"
WarnCodeAutoBreakApplied = "AUTO_BREAK_APPLIED"
WarnCodeMonthlyCap       = "MONTHLY_CAP_REACHED"
WarnCodeFlextimeCapped   = "FLEXTIME_CAPPED"
WarnCodeBelowThreshold   = "BELOW_THRESHOLD"
WarnCodeNoCarryover      = "NO_CARRYOVER"
```

The `IsError()` function classifies codes as errors (returns true) vs warnings (returns false).

### 2.2 DailyValue Error Storage

**File**: `/home/tolga/projects/terp/apps/api/internal/model/dailyvalue.go`

Errors are stored directly on the DailyValue model:

```go
type DailyValue struct {
    // ...
    HasError   bool           `gorm:"default:false" json:"has_error"`
    ErrorCodes pq.StringArray `gorm:"type:text[]" json:"error_codes,omitempty"`
    Warnings   pq.StringArray `gorm:"type:text[]" json:"warnings,omitempty"`
    Status     DailyValueStatus `gorm:"type:varchar(20);not null;default:'calculated'" json:"status"`
    // ...
}
```

The database table (`db/migrations/000024_create_daily_values.up.sql`) stores these as PostgreSQL text arrays:
```sql
has_error BOOLEAN DEFAULT false,
error_codes TEXT[],
warnings TEXT[],
```

A partial index exists for error filtering:
```sql
CREATE INDEX idx_daily_values_errors ON daily_values(employee_id, has_error) WHERE has_error = true;
```

### 2.3 DailyValue List Options (Error Filtering)

**File**: `/home/tolga/projects/terp/apps/api/internal/model/dailyvalue.go`

```go
type DailyValueListOptions struct {
    EmployeeID         *uuid.UUID
    Status             *DailyValueStatus
    From               *time.Time
    To                 *time.Time
    HasErrors          *bool
    ScopeType          DataScopeType
    ScopeDepartmentIDs []uuid.UUID
    ScopeEmployeeIDs   []uuid.UUID
}
```

The repository applies this filter:
```go
if opts.HasErrors != nil {
    q = q.Where("has_error = ?", *opts.HasErrors)
}
```

### 2.4 DailyError in OpenAPI Spec and Generated Models

**File**: `/home/tolga/projects/terp/api/schemas/daily-values.yaml`

The `DailyError` schema already exists:

```yaml
DailyError:
  type: object
  required:
    - id
    - daily_value_id
    - error_type
    - message
  properties:
    id:
      type: string
      format: uuid
    daily_value_id:
      type: string
      format: uuid
    error_type:
      type: string
      enum:
        - missing_booking
        - unpaired_booking
        - overlapping_bookings
        - core_time_violation
        - exceeds_max_hours
        - below_min_hours
        - break_violation
        - invalid_sequence
    message:
      type: string
    severity:
      type: string
      enum:
        - warning
        - error
    booking_id:
      type: string
      format: uuid
      x-nullable: true
    created_at:
      type: string
      format: date-time
```

**File**: `/home/tolga/projects/terp/apps/api/gen/models/daily_error.go`

The generated model includes:
- `DailyErrorErrorType*` constants for each error type enum value
- `DailyErrorSeverityWarning` and `DailyErrorSeverityError` constants

### 2.5 Error-to-Type Mapping in Handler

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/booking.go` (lines 760-842)

The `buildDailyErrors()` function constructs `DailyError` responses from raw error codes:

```go
func buildDailyErrors(dv *model.DailyValue) []*models.DailyError {
    // ... iterates ErrorCodes (severity "error") and Warnings (severity "warning")
    // calls appendError() which creates DailyError with mapped error_type
}

func mapDailyErrorType(code string) string {
    switch code {
    case calculation.ErrCodeMissingCome, calculation.ErrCodeMissingGo, calculation.ErrCodeNoBookings:
        return models.DailyErrorErrorTypeMissingBooking
    case calculation.ErrCodeUnpairedBooking:
        return models.DailyErrorErrorTypeUnpairedBooking
    case calculation.ErrCodeDuplicateInTime:
        return models.DailyErrorErrorTypeOverlappingBookings
    case calculation.ErrCodeEarlyCome, calculation.ErrCodeLateCome, calculation.ErrCodeEarlyGo,
         calculation.ErrCodeLateGo, calculation.ErrCodeMissedCoreStart, calculation.ErrCodeMissedCoreEnd:
        return models.DailyErrorErrorTypeCoreTimeViolation
    case calculation.ErrCodeBelowMinWorkTime:
        return models.DailyErrorErrorTypeBelowMinHours
    case calculation.WarnCodeNoBreakRecorded, calculation.WarnCodeShortBreak,
         calculation.WarnCodeManualBreak, calculation.WarnCodeAutoBreakApplied:
        return models.DailyErrorErrorTypeBreakViolation
    case calculation.WarnCodeMaxTimeReached:
        return models.DailyErrorErrorTypeExceedsMaxHours
    default:
        return models.DailyErrorErrorTypeInvalidSequence
    }
}
```

Currently, the message is just the raw error code string (e.g., "MISSING_COME"). There is no human-readable default text or custom override.

### 2.6 Existing Correction OpenAPI Spec (Manual Corrections)

**File**: `/home/tolga/projects/terp/api/paths/corrections.yaml`

An existing OpenAPI spec for "corrections" covers manual time/balance adjustments (NOT the correction assistant). This is a different concept:

Endpoints:
- `GET /corrections` -- List corrections with employee_id, from, to, correction_type, status filters
- `POST /corrections` -- Create correction
- `GET /corrections/{id}` -- Get by ID
- `PATCH /corrections/{id}` -- Update correction
- `DELETE /corrections/{id}` -- Delete correction
- `POST /corrections/{id}/approve` -- Approve
- `POST /corrections/{id}/reject` -- Reject

**File**: `/home/tolga/projects/terp/api/schemas/corrections.yaml`

Existing Correction schema models:
- `Correction`: id, tenant_id, employee_id, correction_date, correction_type (time/balance/vacation/account adjustment), value_minutes, reason, status (pending/approved/rejected), approved_by, approved_at
- `CorrectionSummary`, `CreateCorrectionRequest`, `UpdateCorrectionRequest`, `CorrectionList`

**File**: `/home/tolga/projects/terp/apps/api/gen/models/correction.go`

Generated model exists with all fields. These models cover MANUAL corrections with approval workflows, NOT the automatic error/hint catalog from daily calculation.

**Important distinction**: The existing "corrections" feature deals with manual time adjustments. ZMI-TICKET-012's "correction assistant" is a different concept -- it is a read-only view of daily calculation errors/hints with a configurable message catalog.

### 2.7 No Correction Assistant Implementation

There is NO existing backend implementation for:
- Correction message catalog table
- Correction assistant endpoint/handler/service/repository
- Custom message override functionality
- Error catalog lookup with default text

The error/hint information is only accessible indirectly through:
1. `GET /daily-values` with `has_errors=true` filter
2. `GET /employees/{id}/day/{date}` day view which builds `DailyError` objects

### 2.8 Daily Calculation Error Emission

**File**: `/home/tolga/projects/terp/apps/api/internal/service/daily_calc.go`

The daily calculation service emits errors in the `CalculationResult`:
```go
type CalculationResult struct {
    HasError   bool
    ErrorCodes []string
    // ... other fields
}
```

Errors are emitted for:
- No bookings on work day: `ErrCodeNoBookings`
- Missing go booking: `ErrCodeMissingGo`
- Missing come booking: `ErrCodeMissingCome`
- Core time violations: `ErrCodeMissedCoreStart`, `ErrCodeMissedCoreEnd`
- Below minimum work time: `ErrCodeBelowMinWorkTime`
- No matching shift/day plan: `ErrCodeNoMatchingShift`

Warnings are emitted for:
- `NO_BOOKINGS_CREDITED` (credit mode with no bookings)
- `NO_BOOKINGS_DEDUCTED` (deduct mode with no bookings)

The results are saved to the `daily_values` table:
```go
HasError:           result.HasError,
ErrorCodes:         result.ErrorCodes,
```

### 2.9 Reference Manual: Correction Assistant Behavior

**File**: `/home/tolga/projects/terp/thoughts/shared/reference/zmi-calculation-manual-reference.md`

The ZMI manual references the correction assistant (Korrekturassistent) in these contexts:

1. **No booking, no evaluation mode**: "Nothing is calculated, the day is shown as erroneous in the correction assistant."
2. **Deduct target hours mode**: "The stored target hours are automatically deducted, there is no notification in the correction assistant."
3. **Vocational school day mode**: "A vocational school day is automatically entered [...] Thus no entry is created in the correction assistant."
4. **No matching day plan**: "ZMI Time generates a message in the correction assistant: 'No matching time plan found'."

This confirms the correction assistant is a VIEW of errors/hints from daily calculation, not a separate data entry system.

---

## 3. Architectural Patterns (Existing)

### 3.1 Model Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/model/base.go`

Base model:
```go
type BaseModel struct {
    ID        uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
    CreatedAt time.Time `gorm:"not null;default:now()"`
    UpdatedAt time.Time `gorm:"not null;default:now()"`
}
```

Model conventions (from `bookingtype.go`, `auditlog.go`, `dailyvalue.go`):
- UUID primary key with `gen_random_uuid()` default
- `TenantID uuid.UUID` with index for multi-tenancy
- `TableName()` method returning the database table name
- GORM struct tags for types, constraints, and defaults
- String type aliases for enums (e.g., `DailyValueStatus string`, `AuditAction string`)
- Constants for enum values
- List options struct for filtering (e.g., `DailyValueListOptions`)

### 3.2 Repository Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/auditlog.go`

Repository conventions:
- Constructor: `NewXxxRepository(db *DB) *XxxRepository`
- Struct holds `db *DB` (GORM + pgx pool wrapper)
- Sentinel error variables: `var ErrXxxNotFound = errors.New("xxx not found")`
- Filter struct: `XxxFilter` with optional pointer fields
- `Create(ctx, model)`, `GetByID(ctx, id)`, `List(ctx, filter)` methods
- GORM queries with `WithContext(ctx)`, `Preload()`, `Where()`, `Order()`, `Limit()`
- Returns `([]Model, int64, error)` for paginated lists (data, total count, error)

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/bookingtype.go`

BookingType repository example:
- `Create`, `GetByID`, `GetByCode`, `Update`, `Delete`, `List` methods
- Tenant-scoped queries: `Where("tenant_id = ? OR tenant_id IS NULL", tenantID)`
- Usage count via raw SQL: `db.GORM.Raw("SELECT COUNT(*) ...")`

### 3.3 Service Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/service/bookingtype.go`

Service conventions:
- Constructor: `NewXxxService(repo) *XxxService`
- Input structs: `CreateXxxInput`, `UpdateXxxInput`
- Business validation before repository calls
- Sentinel errors: `var ErrXxxNotFound = errors.New(...)`
- Methods return `(*model.Xxx, error)` for single items, `([]model.Xxx, error)` for lists

**File**: `/home/tolga/projects/terp/apps/api/internal/service/auditlog.go`

AuditLog service pattern:
- `Log(ctx, r, LogEntry)` for fire-and-forget audit logging
- `List(ctx, filter)` and `GetByID(ctx, id)` for querying

### 3.4 Handler Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/auditlog.go`

Handler conventions:
- Constructor: `NewXxxHandler(service) *XxxHandler`
- HTTP handler methods: `func (h *XxxHandler) List(w http.ResponseWriter, r *http.Request)`
- Extract tenant from context: `middleware.TenantFromContext(r.Context())`
- Parse query parameters with type validation
- Parse path params with `chi.URLParam(r, "id")`
- Map model to response using generated models from `gen/models/`
- Respond with `respondJSON(w, status, data)` or `respondError(w, status, message)`
- Scope checking with `scopeFromContext(ctx)` and `ensureEmployeeScope()`

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/response.go`

Response helpers:
```go
func respondJSON(w http.ResponseWriter, status int, data any)
func respondError(w http.ResponseWriter, status int, message string)
```

### 3.5 Route Registration Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/routes.go`

Routes are registered via `RegisterXxxRoutes(r chi.Router, h *XxxHandler, authz *middleware.AuthorizationMiddleware)` functions:
- Dual registration: if `authz == nil` register without permission checks, else with `authz.RequirePermission()`
- Permission keys defined in `permissions.go`: `permissions.ID("xxx.manage").String()`
- Route groups: `r.Route("/path", func(r chi.Router) { ... })`

### 3.6 Main Server Wiring

**File**: `/home/tolga/projects/terp/apps/api/cmd/server/main.go`

Wiring order:
1. Create repositories: `repository.NewXxxRepository(db)`
2. Create services: `service.NewXxxService(repo)`
3. Create handlers: `handler.NewXxxHandler(service)`
4. Wire optional dependencies: `handler.SetAuditService(auditLogService)`
5. Register routes in tenant-scoped group

### 3.7 OpenAPI Spec Pattern

**File**: `/home/tolga/projects/terp/api/openapi.yaml`

- Multi-file spec: main file references paths and schemas
- Paths in `api/paths/xxx.yaml` with `$ref` to schemas
- Schemas in `api/schemas/xxx.yaml`
- List responses use `XxxList` wrapper with `data` array
- Paginated lists add `meta` with `PaginationMeta`
- Error responses reference `../responses/errors.yaml#/Unauthorized`, `#/NotFound`, etc.
- Schemas define full object, summary, create/update request, and list wrapper types

### 3.8 Migration Pattern

**File**: `/home/tolga/projects/terp/db/migrations/000044_booking_type_enhancements.up.sql`

Migration conventions:
- Sequential numbering: `000NNN_descriptive_name.up.sql` / `.down.sql`
- Next number would be `000045`
- UUID primary keys with `gen_random_uuid()`
- Foreign keys with `REFERENCES table(id) ON DELETE CASCADE/SET NULL`
- Indexes on foreign keys and common filter columns
- `COMMENT ON TABLE/COLUMN` for documentation
- `updated_at` trigger: `EXECUTE FUNCTION update_updated_at_column()`
- Unique constraints for business keys (e.g., `UNIQUE(tenant_id, code)`)

### 3.9 Test Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/testutil/db.go`

Test setup:
```go
func SetupTestDB(t *testing.T) *repository.DB
```
- Shared database connection initialized once
- Each test runs in its own transaction (rolled back after test)
- Uses real PostgreSQL via `TEST_DATABASE_URL` env var

**File**: `/home/tolga/projects/terp/apps/api/internal/service/bookingtype_test.go`

Test conventions:
- Create helper functions: `createTestTenantForXxx(t, db)`, `createTestEmployeeForXxx(t, db, tenantID)`
- Test function names: `TestXxxService_Method_Scenario`
- Use `testify/assert` and `testify/require`
- Create repo and service in each test
- Use `db := testutil.SetupTestDB(t)` for isolation
- Run with: `cd apps/api && go test -v -run TestName ./internal/service/...`

### 3.10 Permissions

**File**: `/home/tolga/projects/terp/apps/api/internal/permissions/permissions.go`

Current permissions (relevant to correction assistant):
- `time_tracking.view_own` -- View own time tracking data
- `time_tracking.view_all` -- View all time tracking data
- `time_tracking.edit` -- Edit time tracking entries
- `time_tracking.approve` -- Approve time tracking entries
- `booking_overview.calculate_day` -- Calculate day in booking overview
- `settings.manage` -- Manage settings

No existing permission for correction assistant or error catalog management.

---

## 4. What Exists vs What Needs to Be Built

### 4.1 Already Exists

| Component | Location | Status |
|-----------|----------|--------|
| Error code constants | `calculation/errors.go` | 14 error codes, 10 warning codes defined |
| IsError() classifier | `calculation/errors.go` | Classifies error vs warning |
| DailyValue error fields | `model/dailyvalue.go` | HasError, ErrorCodes[], Warnings[] |
| DailyValue error storage | `db/migrations/000024` | text[] columns with partial index |
| DailyError OpenAPI schema | `api/schemas/daily-values.yaml` | DailyError with error_type enum |
| DailyError gen model | `gen/models/daily_error.go` | Generated with severity/type enums |
| Error-to-type mapping | `handler/booking.go` | mapDailyErrorType() function |
| buildDailyErrors() | `handler/booking.go` | Builds DailyError array from DailyValue |
| DailyValue list with error filter | `handler/dailyvalue.go` | has_errors query param |
| Correction manual adjustment spec | `api/paths/corrections.yaml` | CRUD + approve/reject for manual corrections |
| Correction gen models | `gen/models/correction.go` | Generated Correction, CorrectionList |

### 4.2 Does NOT Exist (Needs Building)

| Component | Description |
|-----------|-------------|
| **Correction message catalog table** | DB table mapping error codes to default text, custom override text, severity |
| **Correction message catalog model** | GORM model for the catalog |
| **Correction message catalog repository** | CRUD for catalog entries |
| **Correction message catalog service** | Business logic for catalog management |
| **Correction message catalog handler** | HTTP endpoints for catalog CRUD |
| **Correction assistant query endpoint** | List correction items by date/dept/employee with joined message text |
| **Correction assistant handler** | Handler for the correction assistant list view |
| **Correction assistant service** | Service that queries daily values with errors and joins with message catalog |
| **Correction assistant OpenAPI spec** | New paths and schemas for correction assistant endpoints |
| **Custom message override logic** | When returning errors, use custom text if available, else default |
| **Default date range logic** | Default to previous + current month when no date range provided |
| **Department-based filtering** | Filter correction items by department (via employee -> department join) |
| **Resolved flag tracking** | Mark individual error/hint items as resolved |
| **New permissions** | Permission entries for correction assistant and catalog management |
| **Database migration** | New table(s) for correction message catalog |

---

## 5. Related Data Access Patterns

### 5.1 How DailyValues with Errors Are Currently Queried

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/dailyvalue.go`

```go
func (r *DailyValueRepository) List(ctx context.Context, tenantID uuid.UUID, opts model.DailyValueListOptions) ([]model.DailyValue, error) {
    q := r.db.GORM.WithContext(ctx).Where("tenant_id = ?", tenantID)
    if opts.EmployeeID != nil {
        q = q.Where("employee_id = ?", *opts.EmployeeID)
    }
    if opts.From != nil {
        q = q.Where("value_date >= ?", *opts.From)
    }
    if opts.To != nil {
        q = q.Where("value_date <= ?", *opts.To)
    }
    if opts.HasErrors != nil {
        q = q.Where("has_error = ?", *opts.HasErrors)
    }
    // ... scope filtering by department/employee IDs
}
```

### 5.2 How Scope Filtering Works (Department/Employee)

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/dailyvalue.go`

```go
switch opts.ScopeType {
case model.DataScopeAll:
    // No additional filter
case model.DataScopeDepartment:
    q = q.Where("employee_id IN (?)",
        r.db.GORM.Model(&model.Employee{}).Select("id").
            Where("department_id IN ?", opts.ScopeDepartmentIDs))
case model.DataScopeEmployee:
    q = q.Where("employee_id IN ?", opts.ScopeEmployeeIDs)
}
```

This pattern shows how department-based filtering is achieved through a subquery on the employee table.

### 5.3 How Dev Mode Seeds Error Data

**File**: `/home/tolga/projects/terp/apps/api/internal/auth/devdailyvalues.go`

Dev data includes days with errors:
```go
{time.Date(2026, 1, 21, ...), ..., true, []string{"MISSING_BREAK"}, nil}
{time.Date(2026, 1, 13, ...), ..., true, []string{"MISSING_CLOCK_OUT"}, nil}
```

---

## 6. Existing OpenAPI Tags and Path Registry

**File**: `/home/tolga/projects/terp/api/openapi.yaml`

The "Corrections" tag already exists:
```yaml
- name: Corrections
  description: Time corrections
```

The corrections path reference already exists in the main spec. New correction assistant paths would need to be added either as new endpoints under a new tag or as additional endpoints under the existing "Corrections" tag (or a new "Correction Assistant" tag).

---

## 7. Summary of Key Files

| Area | File Path |
|------|-----------|
| Error code definitions | `/home/tolga/projects/terp/apps/api/internal/calculation/errors.go` |
| DailyValue model (error fields) | `/home/tolga/projects/terp/apps/api/internal/model/dailyvalue.go` |
| DailyValue DB migration | `/home/tolga/projects/terp/db/migrations/000024_create_daily_values.up.sql` |
| DailyError OpenAPI schema | `/home/tolga/projects/terp/api/schemas/daily-values.yaml` |
| DailyError generated model | `/home/tolga/projects/terp/apps/api/gen/models/daily_error.go` |
| Error type mapping | `/home/tolga/projects/terp/apps/api/internal/handler/booking.go` (lines 760-842) |
| DailyValue handler | `/home/tolga/projects/terp/apps/api/internal/handler/dailyvalue.go` |
| DailyValue repository | `/home/tolga/projects/terp/apps/api/internal/repository/dailyvalue.go` |
| DailyValue service | `/home/tolga/projects/terp/apps/api/internal/service/dailyvalue.go` |
| Daily calc service | `/home/tolga/projects/terp/apps/api/internal/service/daily_calc.go` |
| Existing corrections spec | `/home/tolga/projects/terp/api/paths/corrections.yaml` |
| Existing corrections schema | `/home/tolga/projects/terp/api/schemas/corrections.yaml` |
| Correction gen models | `/home/tolga/projects/terp/apps/api/gen/models/correction.go` |
| AuditLog (reference pattern) | `/home/tolga/projects/terp/apps/api/internal/model/auditlog.go` |
| AuditLog handler (reference) | `/home/tolga/projects/terp/apps/api/internal/handler/auditlog.go` |
| AuditLog repository (reference) | `/home/tolga/projects/terp/apps/api/internal/repository/auditlog.go` |
| BookingType model (reference) | `/home/tolga/projects/terp/apps/api/internal/model/bookingtype.go` |
| BookingType service (reference) | `/home/tolga/projects/terp/apps/api/internal/service/bookingtype.go` |
| BookingType test (reference) | `/home/tolga/projects/terp/apps/api/internal/service/bookingtype_test.go` |
| Route registration | `/home/tolga/projects/terp/apps/api/internal/handler/routes.go` |
| Main server wiring | `/home/tolga/projects/terp/apps/api/cmd/server/main.go` |
| Permissions | `/home/tolga/projects/terp/apps/api/internal/permissions/permissions.go` |
| Test helper | `/home/tolga/projects/terp/apps/api/internal/testutil/db.go` |
| Ticket file | `/home/tolga/projects/terp/thoughts/shared/tickets/ZMI-TICKET-012-correction-assistant-and-errors.md` |
| Reference manual | `/home/tolga/projects/terp/thoughts/shared/reference/zmi-calculation-manual-reference.md` |
| Last migration | `/home/tolga/projects/terp/db/migrations/000044_booking_type_enhancements.up.sql` |
