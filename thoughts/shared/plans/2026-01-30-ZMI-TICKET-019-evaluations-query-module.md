# ZMI-TICKET-019: Evaluations (Auswertungen) Query Module - Implementation Plan

## Overview

Build 5 read-only evaluation query endpoints under `/evaluations/` that provide filtered, paginated views of daily values, bookings, terminal bookings, change logs, and workflow history. All endpoints support date range, employee, and department filters plus scope-based access control and multi-tenancy. No new database tables are required -- all data is composed from existing tables.

## Current State Analysis

The research phase (`thoughts/shared/research/2026-01-30-ZMI-TICKET-019-evaluations-query-module.md`) reveals:

### What Already Exists (reuse directly)

| Component | File | Relevant For |
|---|---|---|
| Booking model | `apps/api/internal/model/booking.go` | Bookings + terminal bookings evaluation |
| DailyValue model | `apps/api/internal/model/dailyvalue.go` | Daily values evaluation |
| AuditLog model | `apps/api/internal/model/auditlog.go` | Logs + workflow history evaluation |
| BookingRepository (with filter, pagination) | `apps/api/internal/repository/booking.go` | Bookings + terminal bookings queries |
| DailyValueRepository (ListAll with scope) | `apps/api/internal/repository/dailyvalue.go` | Daily values queries |
| AuditLogRepository (with filter, cursor) | `apps/api/internal/repository/auditlog.go` | Logs + workflow history queries |
| EmployeeRepository | `apps/api/internal/repository/employee.go` | Department-based employee lookups |
| Access Scope utilities | `apps/api/internal/access/scope.go` | Scope-based filtering |
| Response helpers | `apps/api/internal/handler/response.go` | respondJSON, respondError |
| Model-to-response mappers | Various handler files | Pattern reference for mapping |
| Generated models | `apps/api/gen/models/` | Booking, DailyValue, AuditLog list/response types |
| Tenant middleware | `apps/api/internal/middleware/tenant.go` | TenantFromContext |
| Permission: `reports.view` | `apps/api/internal/permissions/permissions.go` | Already defined at line 60 |

### What Needs to Be Created

| Component | File | Purpose |
|---|---|---|
| OpenAPI paths | `api/paths/evaluations.yaml` | 5 endpoint definitions |
| OpenAPI schemas | `api/schemas/evaluations.yaml` | Evaluation-specific response types |
| Handler | `apps/api/internal/handler/evaluation.go` | HTTP handlers for 5 endpoints |
| Service | `apps/api/internal/service/evaluation.go` | Business logic, "days without bookings" |
| Handler tests | `apps/api/internal/handler/evaluation_test.go` | Unit + integration tests |

### What Needs to Be Modified

| File | Change |
|---|---|
| `api/openapi.yaml` | Add evaluation path references + schema definitions |
| `apps/api/internal/handler/routes.go` | Add `RegisterEvaluationRoutes()` function |
| `apps/api/cmd/server/main.go` | Wire evaluation service/handler, register routes |

## Desired End State

1. Five GET endpoints at `/evaluations/daily-values`, `/evaluations/bookings`, `/evaluations/terminal-bookings`, `/evaluations/logs`, `/evaluations/workflow-history`
2. All endpoints filter by tenant, date range, employee, department, and pagination
3. Daily values endpoint supports `include_no_bookings=true` to include zero-value rows for dates with no data
4. All endpoints respect scope-based access control
5. OpenAPI spec fully documents all endpoints
6. Generated models used for type-safe responses
7. All tests pass

### Verification
- `make swagger-bundle` completes without errors
- `make generate` produces evaluation response models
- `make test` passes with zero failures
- `make lint` passes

## What We're NOT Doing

- **Not creating new database tables** -- all queries read existing tables
- **Not modifying existing models** -- Booking, DailyValue, AuditLog are sufficient
- **Not modifying existing repositories** -- we compose queries from them; we add a thin evaluation repository for pagination-aware queries not already available
- **Not adding write operations** -- these are purely read-only query endpoints
- **Not persisting grid layouts** -- UI feature, out of scope
- **Not implementing "File entries" evaluation** -- the ticket mentions file entries but no file attachment table exists; we skip this endpoint

---

## Phase 1: OpenAPI Spec (Paths + Schemas)

### Overview
Define the evaluation-specific schemas and all 5 endpoint paths in the OpenAPI spec, then register them in the main `openapi.yaml`.

### Step 1.1: Create Evaluation Schemas

**File**: `api/schemas/evaluations.yaml` (NEW)

Define these schemas following the existing pattern from `api/schemas/daily-values.yaml` and `api/schemas/audit-logs.yaml`:

```yaml
# Evaluation-specific schemas

# Response item for daily values evaluation
EvaluationDailyValue:
  type: object
  required:
    - employee_id
    - date
  properties:
    id:
      type: string
      format: uuid
      description: DailyValue ID (null for days-without-bookings placeholder rows)
      x-nullable: true
    employee_id:
      type: string
      format: uuid
    date:
      type: string
      format: date
    status:
      type: string
      enum:
        - pending
        - calculated
        - error
        - approved
        - no_data
      description: "no_data for days without bookings placeholder rows"
    target_minutes:
      type: integer
    gross_minutes:
      type: integer
    net_minutes:
      type: integer
    break_minutes:
      type: integer
    overtime_minutes:
      type: integer
    undertime_minutes:
      type: integer
    balance_minutes:
      type: integer
      description: overtime - undertime
    booking_count:
      type: integer
    has_errors:
      type: boolean
    first_come:
      type: string
      description: "HH:MM or null"
      x-nullable: true
    last_go:
      type: string
      description: "HH:MM or null"
      x-nullable: true
    employee:
      $ref: './employees.yaml#/EmployeeSummary'

EvaluationDailyValueList:
  type: object
  required:
    - data
  properties:
    data:
      type: array
      items:
        $ref: '#/EvaluationDailyValue'
    meta:
      $ref: './common.yaml#/PaginationMeta'

# Response item for bookings evaluation
EvaluationBooking:
  type: object
  required:
    - id
    - employee_id
    - booking_date
    - edited_time
  properties:
    id:
      type: string
      format: uuid
    employee_id:
      type: string
      format: uuid
    booking_date:
      type: string
      format: date
    booking_type_id:
      type: string
      format: uuid
    original_time:
      type: integer
      description: Original booking time in minutes from midnight
    edited_time:
      type: integer
      description: Edited/corrected time in minutes from midnight
    calculated_time:
      type: integer
      x-nullable: true
    time_string:
      type: string
      description: "Formatted time HH:MM"
    source:
      type: string
      enum:
        - web
        - terminal
        - api
        - import
        - correction
    pair_id:
      type: string
      format: uuid
      x-nullable: true
    terminal_id:
      type: string
      format: uuid
      x-nullable: true
    notes:
      type: string
      x-nullable: true
    created_at:
      type: string
      format: date-time
    employee:
      $ref: './employees.yaml#/EmployeeSummary'
    booking_type:
      $ref: './booking-types.yaml#/BookingTypeSummary'

EvaluationBookingList:
  type: object
  required:
    - data
  properties:
    data:
      type: array
      items:
        $ref: '#/EvaluationBooking'
    meta:
      $ref: './common.yaml#/PaginationMeta'

# Response item for terminal bookings evaluation
EvaluationTerminalBooking:
  type: object
  required:
    - id
    - employee_id
    - booking_date
    - original_time
    - edited_time
  properties:
    id:
      type: string
      format: uuid
    employee_id:
      type: string
      format: uuid
    booking_date:
      type: string
      format: date
    booking_type_id:
      type: string
      format: uuid
    original_time:
      type: integer
      description: Raw terminal time (minutes from midnight)
    original_time_string:
      type: string
      description: "Raw terminal time HH:MM"
    edited_time:
      type: integer
      description: Corrected time (minutes from midnight)
    edited_time_string:
      type: string
      description: "Corrected time HH:MM"
    calculated_time:
      type: integer
      x-nullable: true
    was_edited:
      type: boolean
      description: "true when original_time != edited_time"
    terminal_id:
      type: string
      format: uuid
      x-nullable: true
    source:
      type: string
    created_at:
      type: string
      format: date-time
    employee:
      $ref: './employees.yaml#/EmployeeSummary'
    booking_type:
      $ref: './booking-types.yaml#/BookingTypeSummary'

EvaluationTerminalBookingList:
  type: object
  required:
    - data
  properties:
    data:
      type: array
      items:
        $ref: '#/EvaluationTerminalBooking'
    meta:
      $ref: './common.yaml#/PaginationMeta'

# Response item for log entries evaluation
EvaluationLogEntry:
  type: object
  required:
    - id
    - action
    - entity_type
    - entity_id
    - performed_at
  properties:
    id:
      type: string
      format: uuid
    action:
      type: string
      enum:
        - create
        - update
        - delete
        - approve
        - reject
        - close
        - reopen
    entity_type:
      type: string
      description: "booking, absence, monthly_value, etc."
    entity_id:
      type: string
      format: uuid
    entity_name:
      type: string
      x-nullable: true
    changes:
      type: object
      x-nullable: true
      description: "Before/after values as JSON"
    performed_at:
      type: string
      format: date-time
    user_id:
      type: string
      format: uuid
      x-nullable: true
    user:
      $ref: './users.yaml#/UserSummary'

EvaluationLogEntryList:
  type: object
  required:
    - data
  properties:
    data:
      type: array
      items:
        $ref: '#/EvaluationLogEntry'
    meta:
      $ref: './common.yaml#/PaginationMeta'

# Response item for workflow history evaluation
EvaluationWorkflowEntry:
  type: object
  required:
    - id
    - action
    - entity_type
    - entity_id
    - performed_at
  properties:
    id:
      type: string
      format: uuid
    action:
      type: string
      enum:
        - create
        - approve
        - reject
        - close
        - reopen
    entity_type:
      type: string
      description: "absence, monthly_value"
    entity_id:
      type: string
      format: uuid
    entity_name:
      type: string
      x-nullable: true
    performed_at:
      type: string
      format: date-time
    user_id:
      type: string
      format: uuid
      x-nullable: true
    user:
      $ref: './users.yaml#/UserSummary'
    metadata:
      type: object
      x-nullable: true

EvaluationWorkflowEntryList:
  type: object
  required:
    - data
  properties:
    data:
      type: array
      items:
        $ref: '#/EvaluationWorkflowEntry'
    meta:
      $ref: './common.yaml#/PaginationMeta'
```

### Step 1.2: Create Evaluation Paths

**File**: `api/paths/evaluations.yaml` (NEW)

Define 5 GET endpoints following the pattern from `api/paths/bookings.yaml` and `api/paths/daily-values.yaml`.

All 5 endpoints share a common parameter set (date range, employee, department, pagination). Additional endpoint-specific parameters are noted below.

```yaml
# Evaluation query endpoints

/evaluations/daily-values:
  get:
    tags:
      - Evaluations
    summary: List daily value evaluations
    description: |
      Returns one row per employee per day within the date range.
      Shows time worked, overtime, break, balance and error status.
      Use include_no_bookings=true to include placeholder rows for
      dates with no daily values calculated.
    operationId: listEvaluationDailyValues
    parameters:
      - name: from
        in: query
        required: true
        type: string
        format: date
        description: Start date (YYYY-MM-DD)
      - name: to
        in: query
        required: true
        type: string
        format: date
        description: End date (YYYY-MM-DD)
      - name: employee_id
        in: query
        type: string
        format: uuid
        description: Filter by employee
      - name: department_id
        in: query
        type: string
        format: uuid
        description: Filter by department
      - name: include_no_bookings
        in: query
        type: boolean
        default: false
        description: Include rows for dates with zero bookings
      - name: has_errors
        in: query
        type: boolean
        description: Filter by error status
      - name: limit
        in: query
        type: integer
        default: 50
        minimum: 1
        maximum: 1000
      - name: page
        in: query
        type: integer
        default: 1
        minimum: 1
    responses:
      200:
        description: List of daily value evaluations
        schema:
          $ref: '../schemas/evaluations.yaml#/EvaluationDailyValueList'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'

/evaluations/bookings:
  get:
    tags:
      - Evaluations
    summary: List booking evaluations
    description: |
      Returns one row per booking within the date range.
      Shows time, type, source, and employee for each booking.
    operationId: listEvaluationBookings
    parameters:
      - name: from
        in: query
        required: true
        type: string
        format: date
        description: Start date (YYYY-MM-DD)
      - name: to
        in: query
        required: true
        type: string
        format: date
        description: End date (YYYY-MM-DD)
      - name: employee_id
        in: query
        type: string
        format: uuid
        description: Filter by employee
      - name: department_id
        in: query
        type: string
        format: uuid
        description: Filter by department
      - name: booking_type_id
        in: query
        type: string
        format: uuid
        description: Filter by booking type
      - name: source
        in: query
        type: string
        enum:
          - web
          - terminal
          - api
          - import
          - correction
        description: Filter by booking source
      - name: direction
        in: query
        type: string
        enum:
          - in
          - out
        description: Filter by booking direction
      - name: limit
        in: query
        type: integer
        default: 50
        minimum: 1
        maximum: 1000
      - name: page
        in: query
        type: integer
        default: 1
        minimum: 1
    responses:
      200:
        description: List of booking evaluations
        schema:
          $ref: '../schemas/evaluations.yaml#/EvaluationBookingList'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'

/evaluations/terminal-bookings:
  get:
    tags:
      - Evaluations
    summary: List terminal booking evaluations
    description: |
      Returns raw terminal booking transactions. Shows both original_time
      (raw terminal value) and edited_time (corrected value) side by side.
      Only returns bookings where source='terminal'.
    operationId: listEvaluationTerminalBookings
    parameters:
      - name: from
        in: query
        required: true
        type: string
        format: date
        description: Start date (YYYY-MM-DD)
      - name: to
        in: query
        required: true
        type: string
        format: date
        description: End date (YYYY-MM-DD)
      - name: employee_id
        in: query
        type: string
        format: uuid
        description: Filter by employee
      - name: department_id
        in: query
        type: string
        format: uuid
        description: Filter by department
      - name: limit
        in: query
        type: integer
        default: 50
        minimum: 1
        maximum: 1000
      - name: page
        in: query
        type: integer
        default: 1
        minimum: 1
    responses:
      200:
        description: List of terminal booking evaluations
        schema:
          $ref: '../schemas/evaluations.yaml#/EvaluationTerminalBookingList'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'

/evaluations/logs:
  get:
    tags:
      - Evaluations
    summary: List change log evaluations
    description: |
      Returns change log entries for bookings, absences, and monthly account
      changes. Shows user, timestamp, and before/after values.
    operationId: listEvaluationLogs
    parameters:
      - name: from
        in: query
        required: true
        type: string
        format: date
        description: Start date (YYYY-MM-DD, filters on performed_at)
      - name: to
        in: query
        required: true
        type: string
        format: date
        description: End date (YYYY-MM-DD, filters on performed_at)
      - name: employee_id
        in: query
        type: string
        format: uuid
        description: Filter by employee (matches entity IDs related to employee)
      - name: department_id
        in: query
        type: string
        format: uuid
        description: Filter by department
      - name: entity_type
        in: query
        type: string
        description: "Filter by entity type (booking, absence, monthly_value)"
      - name: action
        in: query
        type: string
        description: "Filter by action (create, update, delete, approve, reject)"
      - name: user_id
        in: query
        type: string
        format: uuid
        description: Filter by user who performed the action
      - name: limit
        in: query
        type: integer
        default: 50
        minimum: 1
        maximum: 1000
      - name: page
        in: query
        type: integer
        default: 1
        minimum: 1
    responses:
      200:
        description: List of change log entries
        schema:
          $ref: '../schemas/evaluations.yaml#/EvaluationLogEntryList'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'

/evaluations/workflow-history:
  get:
    tags:
      - Evaluations
    summary: List workflow history evaluations
    description: |
      Returns approval and workflow history. Composed from audit_logs
      filtering by relevant entity types (absence, monthly_value) and
      workflow actions (create, approve, reject, close, reopen).
    operationId: listEvaluationWorkflowHistory
    parameters:
      - name: from
        in: query
        required: true
        type: string
        format: date
        description: Start date (YYYY-MM-DD, filters on performed_at)
      - name: to
        in: query
        required: true
        type: string
        format: date
        description: End date (YYYY-MM-DD, filters on performed_at)
      - name: employee_id
        in: query
        type: string
        format: uuid
        description: Filter by employee
      - name: department_id
        in: query
        type: string
        format: uuid
        description: Filter by department
      - name: entity_type
        in: query
        type: string
        description: "Filter by entity type (absence, monthly_value)"
      - name: action
        in: query
        type: string
        description: "Filter by action (create, approve, reject, close, reopen)"
      - name: limit
        in: query
        type: integer
        default: 50
        minimum: 1
        maximum: 1000
      - name: page
        in: query
        type: integer
        default: 1
        minimum: 1
    responses:
      200:
        description: List of workflow history entries
        schema:
          $ref: '../schemas/evaluations.yaml#/EvaluationWorkflowEntryList'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
```

### Step 1.3: Register Paths in Main OpenAPI File

**File**: `api/openapi.yaml`

Add to the `paths:` section (after the existing Vacation Carryover section, around line 526):

```yaml
  # Evaluations
  /evaluations/daily-values:
    $ref: 'paths/evaluations.yaml#/~1evaluations~1daily-values'
  /evaluations/bookings:
    $ref: 'paths/evaluations.yaml#/~1evaluations~1bookings'
  /evaluations/terminal-bookings:
    $ref: 'paths/evaluations.yaml#/~1evaluations~1terminal-bookings'
  /evaluations/logs:
    $ref: 'paths/evaluations.yaml#/~1evaluations~1logs'
  /evaluations/workflow-history:
    $ref: 'paths/evaluations.yaml#/~1evaluations~1workflow-history'
```

Add a new tag to the `tags:` section:

```yaml
  - name: Evaluations
    description: Read-only evaluation queries (Auswertungen)
```

Add to the `definitions:` section:

```yaml
  # Evaluations
  EvaluationDailyValue:
    $ref: 'schemas/evaluations.yaml#/EvaluationDailyValue'
  EvaluationDailyValueList:
    $ref: 'schemas/evaluations.yaml#/EvaluationDailyValueList'
  EvaluationBooking:
    $ref: 'schemas/evaluations.yaml#/EvaluationBooking'
  EvaluationBookingList:
    $ref: 'schemas/evaluations.yaml#/EvaluationBookingList'
  EvaluationTerminalBooking:
    $ref: 'schemas/evaluations.yaml#/EvaluationTerminalBooking'
  EvaluationTerminalBookingList:
    $ref: 'schemas/evaluations.yaml#/EvaluationTerminalBookingList'
  EvaluationLogEntry:
    $ref: 'schemas/evaluations.yaml#/EvaluationLogEntry'
  EvaluationLogEntryList:
    $ref: 'schemas/evaluations.yaml#/EvaluationLogEntryList'
  EvaluationWorkflowEntry:
    $ref: 'schemas/evaluations.yaml#/EvaluationWorkflowEntry'
  EvaluationWorkflowEntryList:
    $ref: 'schemas/evaluations.yaml#/EvaluationWorkflowEntryList'
```

### Step 1.4: Bundle and Generate

```bash
make swagger-bundle
make generate
```

### Verification
- `make swagger-bundle` exits 0 with no errors
- `make generate` produces new types in `apps/api/gen/models/` including `EvaluationDailyValue`, `EvaluationBooking`, etc.
- Inspect `apps/api/gen/models/evaluation_daily_value.go` (and siblings) to confirm generated struct fields match the schema

---

## Phase 2: Database Migrations

### Overview
No new database tables are needed. All evaluation queries read from existing tables:
- `daily_values` (daily value evaluations)
- `bookings` (booking + terminal booking evaluations)
- `audit_logs` (log + workflow history evaluations)
- `employees` (department JOIN for filtering)

**No migration files are created in this phase.**

### Verification
- Existing tables have all required columns and indexes
- The existing indexes are sufficient for the query patterns:
  - `bookings`: index on `(tenant_id)`, `(employee_id, booking_date)`, `(booking_date)`
  - `daily_values`: index on `(tenant_id)`, `(employee_id)`, `(value_date)`, `(employee_id, value_date)` UNIQUE
  - `audit_logs`: index on `(tenant_id)`, `(entity_type, entity_id)`, `(action)`, `(performed_at)`

---

## Phase 3: Service Layer

### Overview
Create an `EvaluationService` that composes queries from existing repositories. It handles the "days without bookings" logic and provides typed filter structs for each endpoint.

**File**: `apps/api/internal/service/evaluation.go` (NEW)

### Step 3.1: Define Filter Structs

Define a base evaluation filter and per-endpoint extensions:

```go
package service

import (
    "context"
    "time"

    "github.com/google/uuid"

    "github.com/tolga/terp/internal/model"
    "github.com/tolga/terp/internal/repository"
)

// EvaluationBaseFilter contains common filters shared by all evaluation endpoints.
type EvaluationBaseFilter struct {
    TenantID           uuid.UUID
    StartDate          time.Time       // Required
    EndDate            time.Time       // Required
    EmployeeID         *uuid.UUID
    DepartmentID       *uuid.UUID
    ScopeType          model.DataScopeType
    ScopeDepartmentIDs []uuid.UUID
    ScopeEmployeeIDs   []uuid.UUID
    Limit              int
    Offset             int
}

// EvaluationDailyValueFilter extends the base filter for daily values.
type EvaluationDailyValueFilter struct {
    EvaluationBaseFilter
    IncludeNoBookings bool
    HasErrors         *bool
}

// EvaluationBookingFilter extends the base filter for bookings.
type EvaluationBookingFilter struct {
    EvaluationBaseFilter
    BookingTypeID *uuid.UUID
    Source        *model.BookingSource
    Direction     *model.BookingDirection
}

// EvaluationTerminalBookingFilter extends the base filter for terminal bookings.
type EvaluationTerminalBookingFilter struct {
    EvaluationBaseFilter
}

// EvaluationLogFilter extends the base filter for change logs.
type EvaluationLogFilter struct {
    EvaluationBaseFilter
    EntityType *string
    Action     *string
    UserID     *uuid.UUID
}

// EvaluationWorkflowFilter extends the base filter for workflow history.
type EvaluationWorkflowFilter struct {
    EvaluationBaseFilter
    EntityType *string
    Action     *string
}
```

### Step 3.2: Define Result Types

Define result types that the service returns (these will be mapped to generated models by the handler):

```go
// EvaluationDailyValueResult represents a daily value evaluation row.
type EvaluationDailyValueResult struct {
    model.DailyValue       // embed the existing model
    IsPlaceholder    bool  // true for "days without bookings" rows
    BalanceMinutes   int   // computed: overtime - undertime
}

// EvaluationTerminalBookingResult extends booking with comparison fields.
type EvaluationTerminalBookingResult struct {
    model.Booking
    WasEdited bool // original_time != edited_time
}
```

### Step 3.3: Implement the Service

```go
// EvaluationService provides read-only evaluation queries.
type EvaluationService struct {
    bookingRepo    *repository.BookingRepository
    dailyValueRepo *repository.DailyValueRepository
    auditLogRepo   *repository.AuditLogRepository
    employeeRepo   *repository.EmployeeRepository
}

func NewEvaluationService(
    bookingRepo *repository.BookingRepository,
    dailyValueRepo *repository.DailyValueRepository,
    auditLogRepo *repository.AuditLogRepository,
    employeeRepo *repository.EmployeeRepository,
) *EvaluationService {
    return &EvaluationService{
        bookingRepo:    bookingRepo,
        dailyValueRepo: dailyValueRepo,
        auditLogRepo:   auditLogRepo,
        employeeRepo:   employeeRepo,
    }
}
```

### Step 3.4: ListDailyValues Method

**Key logic**: Delegates to `DailyValueRepository.ListAll()` for the standard case. For the `IncludeNoBookings` case, generates placeholder rows for missing dates.

```go
func (s *EvaluationService) ListDailyValues(ctx context.Context, filter EvaluationDailyValueFilter) ([]EvaluationDailyValueResult, int64, error) {
    // 1. Build DailyValueListOptions from filter (reuse existing ListAll)
    opts := model.DailyValueListOptions{
        EmployeeID:         filter.EmployeeID,
        From:               &filter.StartDate,
        To:                 &filter.EndDate,
        HasErrors:          filter.HasErrors,
        ScopeType:          filter.ScopeType,
        ScopeDepartmentIDs: filter.ScopeDepartmentIDs,
        ScopeEmployeeIDs:   filter.ScopeEmployeeIDs,
    }

    // 2. Fetch all daily values matching filters
    //    NOTE: We need a new paginated variant since ListAll doesn't paginate.
    //    Add a repository method or handle pagination in service.
    //    For now, fetch all and paginate in Go (acceptable for evaluation queries
    //    since date ranges are bounded to max ~31 days * employees).
    values, err := s.dailyValueRepo.ListAll(ctx, filter.TenantID, opts)
    if err != nil {
        return nil, 0, err
    }

    // 3. Apply department filter if specified (via employee join already in ListAll)
    //    If DepartmentID is set but not handled by ListAll, filter in Go code.
    if filter.DepartmentID != nil {
        values = filterDailyValuesByDepartment(values, *filter.DepartmentID)
    }

    // 4. Convert to result type with computed fields
    results := make([]EvaluationDailyValueResult, 0, len(values))
    for i := range values {
        results = append(results, EvaluationDailyValueResult{
            DailyValue:     values[i],
            IsPlaceholder:  false,
            BalanceMinutes: values[i].Overtime - values[i].Undertime,
        })
    }

    // 5. If IncludeNoBookings, generate placeholder rows for missing dates
    if filter.IncludeNoBookings {
        results = s.fillMissingDates(results, filter)
    }

    // 6. Apply pagination
    total := int64(len(results))
    start := filter.Offset
    if start > len(results) {
        start = len(results)
    }
    end := start + filter.Limit
    if end > len(results) {
        end = len(results)
    }
    return results[start:end], total, nil
}
```

Implement `fillMissingDates`:

```go
func (s *EvaluationService) fillMissingDates(
    existing []EvaluationDailyValueResult,
    filter EvaluationDailyValueFilter,
) []EvaluationDailyValueResult {
    // Build a set of (employeeID, date) from existing results
    type key struct {
        EmployeeID uuid.UUID
        Date       string // "2006-01-02"
    }
    existingSet := make(map[key]bool, len(existing))
    employeeIDs := make(map[uuid.UUID]bool)
    for _, r := range existing {
        existingSet[key{r.EmployeeID, r.ValueDate.Format("2006-01-02")}] = true
        employeeIDs[r.EmployeeID] = true
    }

    // If filtering by a specific employee, use that; otherwise use all employees found
    // Generate all dates in range
    allDates := generateDateRange(filter.StartDate, filter.EndDate)

    // For each employee+date combo, add placeholder if missing
    var results []EvaluationDailyValueResult
    results = append(results, existing...)
    for empID := range employeeIDs {
        for _, d := range allDates {
            k := key{empID, d.Format("2006-01-02")}
            if !existingSet[k] {
                results = append(results, EvaluationDailyValueResult{
                    DailyValue: model.DailyValue{
                        EmployeeID: empID,
                        TenantID:   filter.TenantID,
                        ValueDate:  d,
                        Status:     "no_data",
                    },
                    IsPlaceholder: true,
                })
            }
        }
    }

    // Sort by date, then employee
    sort.Slice(results, func(i, j int) bool {
        if results[i].ValueDate.Equal(results[j].ValueDate) {
            return results[i].EmployeeID.String() < results[j].EmployeeID.String()
        }
        return results[i].ValueDate.Before(results[j].ValueDate)
    })
    return results
}

func generateDateRange(from, to time.Time) []time.Time {
    var dates []time.Time
    for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
        dates = append(dates, d)
    }
    return dates
}
```

### Step 3.5: ListBookings Method

```go
func (s *EvaluationService) ListBookings(ctx context.Context, filter EvaluationBookingFilter) ([]model.Booking, int64, error) {
    repoFilter := repository.BookingFilter{
        TenantID:           filter.TenantID,
        EmployeeID:         filter.EmployeeID,
        StartDate:          &filter.StartDate,
        EndDate:            &filter.EndDate,
        Source:             filter.Source,
        Direction:          filter.Direction,
        ScopeType:          filter.ScopeType,
        ScopeDepartmentIDs: filter.ScopeDepartmentIDs,
        ScopeEmployeeIDs:   filter.ScopeEmployeeIDs,
        Limit:              filter.Limit,
        Offset:             filter.Offset,
    }

    // Apply department filter - the repository already supports department
    // filtering via scope. If DepartmentID is provided as an explicit filter,
    // we need to include it.
    // NOTE: Existing BookingFilter doesn't have a DepartmentID field.
    // We'll need to add it to the repository filter or handle it differently.
    // See Phase 4 for repository additions.

    return s.bookingRepo.List(ctx, repoFilter)
}
```

### Step 3.6: ListTerminalBookings Method

```go
func (s *EvaluationService) ListTerminalBookings(ctx context.Context, filter EvaluationTerminalBookingFilter) ([]EvaluationTerminalBookingResult, int64, error) {
    // Force source to terminal
    terminalSource := model.BookingSourceTerminal
    repoFilter := repository.BookingFilter{
        TenantID:           filter.TenantID,
        EmployeeID:         filter.EmployeeID,
        StartDate:          &filter.StartDate,
        EndDate:            &filter.EndDate,
        Source:             &terminalSource,
        ScopeType:          filter.ScopeType,
        ScopeDepartmentIDs: filter.ScopeDepartmentIDs,
        ScopeEmployeeIDs:   filter.ScopeEmployeeIDs,
        Limit:              filter.Limit,
        Offset:             filter.Offset,
    }

    bookings, total, err := s.bookingRepo.List(ctx, repoFilter)
    if err != nil {
        return nil, 0, err
    }

    results := make([]EvaluationTerminalBookingResult, len(bookings))
    for i := range bookings {
        results[i] = EvaluationTerminalBookingResult{
            Booking:   bookings[i],
            WasEdited: bookings[i].OriginalTime != bookings[i].EditedTime,
        }
    }
    return results, total, nil
}
```

### Step 3.7: ListLogs Method

```go
func (s *EvaluationService) ListLogs(ctx context.Context, filter EvaluationLogFilter) ([]model.AuditLog, int64, error) {
    // Convert date to datetime range for performed_at filtering
    fromTime := filter.StartDate
    toTime := filter.EndDate.Add(24*time.Hour - time.Second) // end of day

    repoFilter := repository.AuditLogFilter{
        TenantID:   filter.TenantID,
        UserID:     filter.UserID,
        EntityType: filter.EntityType,
        Action:     filter.Action,
        From:       &fromTime,
        To:         &toTime,
        Limit:      filter.Limit,
    }
    // Note: AuditLogFilter uses cursor-based pagination.
    // We'll add offset-based support in the repository (Phase 4).

    return s.auditLogRepo.List(ctx, repoFilter)
}
```

### Step 3.8: ListWorkflowHistory Method

```go
func (s *EvaluationService) ListWorkflowHistory(ctx context.Context, filter EvaluationWorkflowFilter) ([]model.AuditLog, int64, error) {
    fromTime := filter.StartDate
    toTime := filter.EndDate.Add(24*time.Hour - time.Second)

    // Compose entity types and actions relevant to workflow
    // If no specific entity_type filter, default to workflow-relevant types
    entityType := filter.EntityType
    action := filter.Action

    repoFilter := repository.AuditLogFilter{
        TenantID:   filter.TenantID,
        EntityType: entityType,
        Action:     action,
        From:       &fromTime,
        To:         &toTime,
        Limit:      filter.Limit,
    }

    logs, total, err := s.auditLogRepo.List(ctx, repoFilter)
    if err != nil {
        return nil, 0, err
    }

    // If no entity_type filter was specified, filter to workflow-relevant types
    if filter.EntityType == nil {
        var filtered []model.AuditLog
        for _, l := range logs {
            if isWorkflowRelevant(l.EntityType, string(l.Action)) {
                filtered = append(filtered, l)
            }
        }
        // Note: total count may be inaccurate after Go-side filtering
        // A proper implementation would use DB-side IN clause filtering
        return filtered, int64(len(filtered)), nil
    }

    return logs, total, nil
}

func isWorkflowRelevant(entityType string, action string) bool {
    switch entityType {
    case "absence":
        return action == "create" || action == "approve" || action == "reject"
    case "monthly_value":
        return action == "close" || action == "reopen"
    }
    return false
}
```

### Helper: Department Filtering

```go
func filterDailyValuesByDepartment(values []model.DailyValue, departmentID uuid.UUID) []model.DailyValue {
    var filtered []model.DailyValue
    for _, v := range values {
        if v.Employee != nil && v.Employee.DepartmentID != nil && *v.Employee.DepartmentID == departmentID {
            filtered = append(filtered, v)
        }
    }
    return filtered
}
```

### Verification
- File compiles with `go build ./internal/service/...`
- All filter structs are correctly defined
- `fillMissingDates` generates placeholder rows for dates with no data

---

## Phase 4: Repository Additions

### Overview
The existing repositories mostly have what we need, but we need small additions:

1. **BookingFilter** needs a `DepartmentID` field
2. **AuditLogFilter** needs offset-based pagination support (currently cursor-only)
3. **DailyValueListOptions** needs a `DepartmentID` field

### Step 4.1: Add DepartmentID to BookingFilter

**File**: `apps/api/internal/repository/booking.go`

Add `DepartmentID *uuid.UUID` field to `BookingFilter` struct.

Add department filtering logic in the `List` method. Follow the existing scope-based department join pattern:

```go
// In BookingFilter struct, add:
DepartmentID *uuid.UUID

// In List method, add after existing filters:
if filter.DepartmentID != nil {
    query = query.Joins("JOIN employees ON employees.id = bookings.employee_id").
        Where("employees.department_id = ?", *filter.DepartmentID)
}
```

**IMPORTANT**: Guard against double-JOIN if both `DepartmentID` and `ScopeType == DataScopeDepartment` are set. The simplest approach is to skip the DepartmentID JOIN when scope already joins employees.

### Step 4.2: Add DepartmentID to DailyValueListOptions

**File**: `apps/api/internal/model/dailyvalue.go`

Add `DepartmentID *uuid.UUID` field to `DailyValueListOptions` struct.

**File**: `apps/api/internal/repository/dailyvalue.go`

Add filtering logic in `ListAll`:

```go
if opts.DepartmentID != nil {
    q = q.Where("employees.department_id = ?", *opts.DepartmentID)
}
```

**Note**: `ListAll` already does `.Preload("Employee")` and `.Preload("Employee.Department")` and has scope-based joins. The department filter should work through the already-preloaded employee relation. However, preloading only loads associated data -- it does not filter the parent query. We need an explicit Joins+Where or a subquery.

The safest approach: Since ListAll already JOINs employees for scope filtering, add the department filter after the scope block:

```go
if opts.DepartmentID != nil {
    // If scope already JOINed employees, just add WHERE clause
    // Otherwise, add the JOIN first
    if opts.ScopeType != model.DataScopeDepartment {
        q = q.Joins("JOIN employees ON employees.id = daily_values.employee_id")
    }
    q = q.Where("employees.department_id = ?", *opts.DepartmentID)
}
```

### Step 4.3: Add Offset-Based Pagination to AuditLogFilter

**File**: `apps/api/internal/repository/auditlog.go`

Add `Offset int` field to `AuditLogFilter` struct. In the `List` method, apply offset after cursor filtering:

```go
// In AuditLogFilter, add:
Offset int

// In List method, after cursor handling:
if filter.Offset > 0 {
    query = query.Offset(filter.Offset)
}
```

### Step 4.4: Add Entity Type IN-Clause Filtering for Workflow

**File**: `apps/api/internal/repository/auditlog.go`

Add `EntityTypes []string` and `Actions []string` fields to `AuditLogFilter` to support IN-clause filtering for workflow history:

```go
// In AuditLogFilter, add:
EntityTypes []string  // Filter by multiple entity types (OR)
Actions     []string  // Filter by multiple actions (OR)

// In List method, add:
if len(filter.EntityTypes) > 0 {
    query = query.Where("entity_type IN ?", filter.EntityTypes)
}
if len(filter.Actions) > 0 {
    query = query.Where("action IN ?", filter.Actions)
}
```

### Verification
- `go build ./internal/repository/...` succeeds
- `go build ./internal/model/...` succeeds
- Existing tests still pass: `cd apps/api && go test ./internal/repository/...`

---

## Phase 5: Handler Layer

### Overview
Create the `EvaluationHandler` with 5 methods, one per endpoint. Follows the exact patterns from `BookingHandler.List` and `AuditLogHandler.List`.

**File**: `apps/api/internal/handler/evaluation.go` (NEW)

### Step 5.1: Handler Struct

```go
package handler

import (
    "errors"
    "net/http"
    "strconv"
    "time"

    "github.com/go-openapi/strfmt"
    "github.com/google/uuid"

    "github.com/tolga/terp/gen/models"
    "github.com/tolga/terp/internal/middleware"
    "github.com/tolga/terp/internal/model"
    "github.com/tolga/terp/internal/service"
    "github.com/tolga/terp/internal/timeutil"
)

// EvaluationHandler handles evaluation query HTTP endpoints.
type EvaluationHandler struct {
    evaluationService *service.EvaluationService
    employeeService   *service.EmployeeService
}

// NewEvaluationHandler creates a new evaluation handler.
func NewEvaluationHandler(
    evaluationService *service.EvaluationService,
    employeeService *service.EmployeeService,
) *EvaluationHandler {
    return &EvaluationHandler{
        evaluationService: evaluationService,
        employeeService:   employeeService,
    }
}
```

### Step 5.2: Common Filter Parsing Helper

Extract a helper method for parsing the shared base filter from query params (DRY across all 5 handlers):

```go
// parseBaseFilter extracts the common evaluation filter fields from the request.
// Returns (filter, error). Error is non-nil if required params are missing/invalid.
func (h *EvaluationHandler) parseBaseFilter(r *http.Request) (service.EvaluationBaseFilter, error) {
    tenantID, ok := middleware.TenantFromContext(r.Context())
    if !ok {
        return service.EvaluationBaseFilter{}, errors.New("tenant required")
    }

    q := r.URL.Query()

    // Required: from
    fromStr := q.Get("from")
    if fromStr == "" {
        return service.EvaluationBaseFilter{}, errors.New("from date is required")
    }
    from, err := time.Parse("2006-01-02", fromStr)
    if err != nil {
        return service.EvaluationBaseFilter{}, errors.New("invalid from date format, expected YYYY-MM-DD")
    }

    // Required: to
    toStr := q.Get("to")
    if toStr == "" {
        return service.EvaluationBaseFilter{}, errors.New("to date is required")
    }
    to, err := time.Parse("2006-01-02", toStr)
    if err != nil {
        return service.EvaluationBaseFilter{}, errors.New("invalid to date format, expected YYYY-MM-DD")
    }

    filter := service.EvaluationBaseFilter{
        TenantID:  tenantID,
        StartDate: from,
        EndDate:   to,
        Limit:     50,  // default
        Offset:    0,
    }

    // Scope
    scope, err := scopeFromContext(r.Context())
    if err == nil {
        filter.ScopeType = scope.Type
        filter.ScopeDepartmentIDs = scope.DepartmentIDs
        filter.ScopeEmployeeIDs = scope.EmployeeIDs
    }

    // Optional: employee_id
    if empID := q.Get("employee_id"); empID != "" {
        id, err := uuid.Parse(empID)
        if err != nil {
            return service.EvaluationBaseFilter{}, errors.New("invalid employee_id")
        }
        filter.EmployeeID = &id
    }

    // Optional: department_id
    if deptID := q.Get("department_id"); deptID != "" {
        id, err := uuid.Parse(deptID)
        if err != nil {
            return service.EvaluationBaseFilter{}, errors.New("invalid department_id")
        }
        filter.DepartmentID = &id
    }

    // Pagination
    if limitStr := q.Get("limit"); limitStr != "" {
        if limit, err := strconv.Atoi(limitStr); err == nil && limit > 0 && limit <= 1000 {
            filter.Limit = limit
        }
    }
    if pageStr := q.Get("page"); pageStr != "" {
        if page, err := strconv.Atoi(pageStr); err == nil && page > 0 {
            filter.Offset = (page - 1) * filter.Limit
        }
    }

    return filter, nil
}
```

### Step 5.3: ListDailyValues Handler

```go
// ListDailyValues handles GET /evaluations/daily-values
func (h *EvaluationHandler) ListDailyValues(w http.ResponseWriter, r *http.Request) {
    baseFilter, err := h.parseBaseFilter(r)
    if err != nil {
        respondError(w, http.StatusBadRequest, err.Error())
        return
    }

    q := r.URL.Query()
    filter := service.EvaluationDailyValueFilter{
        EvaluationBaseFilter: baseFilter,
    }

    // Parse include_no_bookings
    if v := q.Get("include_no_bookings"); v == "true" {
        filter.IncludeNoBookings = true
    }

    // Parse has_errors
    if v := q.Get("has_errors"); v != "" {
        b := v == "true"
        filter.HasErrors = &b
    }

    results, total, err := h.evaluationService.ListDailyValues(r.Context(), filter)
    if err != nil {
        respondError(w, http.StatusInternalServerError, "Failed to query daily values")
        return
    }

    // Map to response using generated models
    data := make([]*models.EvaluationDailyValue, 0, len(results))
    for i := range results {
        data = append(data, mapEvalDailyValueToResponse(&results[i]))
    }

    respondJSON(w, http.StatusOK, &models.EvaluationDailyValueList{
        Data: data,
        Meta: &models.PaginationMeta{
            Total:   total,
            Limit:   int64(filter.Limit),
            HasMore: int64(filter.Offset+filter.Limit) < total,
        },
    })
}
```

### Step 5.4: ListBookings Handler

```go
// ListBookings handles GET /evaluations/bookings
func (h *EvaluationHandler) ListBookings(w http.ResponseWriter, r *http.Request) {
    baseFilter, err := h.parseBaseFilter(r)
    if err != nil {
        respondError(w, http.StatusBadRequest, err.Error())
        return
    }

    q := r.URL.Query()
    filter := service.EvaluationBookingFilter{
        EvaluationBaseFilter: baseFilter,
    }

    // Parse booking_type_id
    if v := q.Get("booking_type_id"); v != "" {
        id, err := uuid.Parse(v)
        if err != nil {
            respondError(w, http.StatusBadRequest, "Invalid booking_type_id")
            return
        }
        filter.BookingTypeID = &id
    }

    // Parse source
    if v := q.Get("source"); v != "" {
        src := model.BookingSource(v)
        filter.Source = &src
    }

    // Parse direction
    if v := q.Get("direction"); v != "" {
        dir := model.BookingDirection(v)
        filter.Direction = &dir
    }

    bookings, total, err := h.evaluationService.ListBookings(r.Context(), filter)
    if err != nil {
        respondError(w, http.StatusInternalServerError, "Failed to query bookings")
        return
    }

    data := make([]*models.EvaluationBooking, 0, len(bookings))
    for i := range bookings {
        data = append(data, mapEvalBookingToResponse(&bookings[i]))
    }

    respondJSON(w, http.StatusOK, &models.EvaluationBookingList{
        Data: data,
        Meta: &models.PaginationMeta{
            Total:   total,
            Limit:   int64(filter.Limit),
            HasMore: int64(filter.Offset+filter.Limit) < total,
        },
    })
}
```

### Step 5.5: ListTerminalBookings Handler

```go
// ListTerminalBookings handles GET /evaluations/terminal-bookings
func (h *EvaluationHandler) ListTerminalBookings(w http.ResponseWriter, r *http.Request) {
    baseFilter, err := h.parseBaseFilter(r)
    if err != nil {
        respondError(w, http.StatusBadRequest, err.Error())
        return
    }

    filter := service.EvaluationTerminalBookingFilter{
        EvaluationBaseFilter: baseFilter,
    }

    results, total, err := h.evaluationService.ListTerminalBookings(r.Context(), filter)
    if err != nil {
        respondError(w, http.StatusInternalServerError, "Failed to query terminal bookings")
        return
    }

    data := make([]*models.EvaluationTerminalBooking, 0, len(results))
    for i := range results {
        data = append(data, mapEvalTerminalBookingToResponse(&results[i]))
    }

    respondJSON(w, http.StatusOK, &models.EvaluationTerminalBookingList{
        Data: data,
        Meta: &models.PaginationMeta{
            Total:   total,
            Limit:   int64(filter.Limit),
            HasMore: int64(filter.Offset+filter.Limit) < total,
        },
    })
}
```

### Step 5.6: ListLogs Handler

```go
// ListLogs handles GET /evaluations/logs
func (h *EvaluationHandler) ListLogs(w http.ResponseWriter, r *http.Request) {
    baseFilter, err := h.parseBaseFilter(r)
    if err != nil {
        respondError(w, http.StatusBadRequest, err.Error())
        return
    }

    q := r.URL.Query()
    filter := service.EvaluationLogFilter{
        EvaluationBaseFilter: baseFilter,
    }

    if v := q.Get("entity_type"); v != "" {
        filter.EntityType = &v
    }
    if v := q.Get("action"); v != "" {
        filter.Action = &v
    }
    if v := q.Get("user_id"); v != "" {
        id, err := uuid.Parse(v)
        if err != nil {
            respondError(w, http.StatusBadRequest, "Invalid user_id")
            return
        }
        filter.UserID = &id
    }

    logs, total, err := h.evaluationService.ListLogs(r.Context(), filter)
    if err != nil {
        respondError(w, http.StatusInternalServerError, "Failed to query logs")
        return
    }

    data := make([]*models.EvaluationLogEntry, 0, len(logs))
    for i := range logs {
        data = append(data, mapEvalLogToResponse(&logs[i]))
    }

    respondJSON(w, http.StatusOK, &models.EvaluationLogEntryList{
        Data: data,
        Meta: &models.PaginationMeta{
            Total:   total,
            Limit:   int64(filter.Limit),
            HasMore: int64(filter.Offset+filter.Limit) < total,
        },
    })
}
```

### Step 5.7: ListWorkflowHistory Handler

```go
// ListWorkflowHistory handles GET /evaluations/workflow-history
func (h *EvaluationHandler) ListWorkflowHistory(w http.ResponseWriter, r *http.Request) {
    baseFilter, err := h.parseBaseFilter(r)
    if err != nil {
        respondError(w, http.StatusBadRequest, err.Error())
        return
    }

    q := r.URL.Query()
    filter := service.EvaluationWorkflowFilter{
        EvaluationBaseFilter: baseFilter,
    }

    if v := q.Get("entity_type"); v != "" {
        filter.EntityType = &v
    }
    if v := q.Get("action"); v != "" {
        filter.Action = &v
    }

    logs, total, err := h.evaluationService.ListWorkflowHistory(r.Context(), filter)
    if err != nil {
        respondError(w, http.StatusInternalServerError, "Failed to query workflow history")
        return
    }

    data := make([]*models.EvaluationWorkflowEntry, 0, len(logs))
    for i := range logs {
        data = append(data, mapEvalWorkflowToResponse(&logs[i]))
    }

    respondJSON(w, http.StatusOK, &models.EvaluationWorkflowEntryList{
        Data: data,
        Meta: &models.PaginationMeta{
            Total:   total,
            Limit:   int64(filter.Limit),
            HasMore: int64(filter.Offset+filter.Limit) < total,
        },
    })
}
```

### Step 5.8: Response Mapping Functions

Add these mapping functions at the bottom of `evaluation.go`. Follow the patterns from `mapAuditLogToResponse` in `auditlog.go` and `modelToResponse` in `booking.go`.

```go
func mapEvalDailyValueToResponse(r *service.EvaluationDailyValueResult) *models.EvaluationDailyValue {
    empID := strfmt.UUID(r.EmployeeID.String())
    date := strfmt.Date(r.ValueDate)
    status := string(r.Status)
    targetMinutes := int64(r.TargetTime)
    grossMinutes := int64(r.GrossTime)
    netMinutes := int64(r.NetTime)
    breakMinutes := int64(r.BreakTime)
    overtimeMinutes := int64(r.Overtime)
    undertimeMinutes := int64(r.Undertime)
    balanceMinutes := int64(r.BalanceMinutes)
    bookingCount := int64(r.BookingCount)
    hasErrors := r.HasError

    resp := &models.EvaluationDailyValue{
        EmployeeID:       &empID,
        Date:             &date,
        Status:           status,
        TargetMinutes:    targetMinutes,
        GrossMinutes:     grossMinutes,
        NetMinutes:       netMinutes,
        BreakMinutes:     breakMinutes,
        OvertimeMinutes:  overtimeMinutes,
        UndertimeMinutes: undertimeMinutes,
        BalanceMinutes:   balanceMinutes,
        BookingCount:     bookingCount,
        HasErrors:        hasErrors,
    }

    if !r.IsPlaceholder {
        id := strfmt.UUID(r.ID.String())
        resp.ID = &id
    }

    if r.FirstCome != nil {
        fc := timeutil.MinutesToString(*r.FirstCome)
        resp.FirstCome = &fc
    }
    if r.LastGo != nil {
        lg := timeutil.MinutesToString(*r.LastGo)
        resp.LastGo = &lg
    }

    // Nested employee summary
    if r.Employee != nil {
        resp.Employee = mapEmployeeSummary(r.Employee)
    }

    return resp
}

func mapEvalBookingToResponse(b *model.Booking) *models.EvaluationBooking {
    id := strfmt.UUID(b.ID.String())
    empID := strfmt.UUID(b.EmployeeID.String())
    btID := strfmt.UUID(b.BookingTypeID.String())
    date := strfmt.Date(b.BookingDate)
    originalTime := int64(b.OriginalTime)
    editedTime := int64(b.EditedTime)
    timeStr := timeutil.MinutesToString(b.EditedTime)
    source := string(b.Source)
    createdAt := strfmt.DateTime(b.CreatedAt)

    resp := &models.EvaluationBooking{
        ID:            &id,
        EmployeeID:    &empID,
        BookingTypeID: &btID,
        BookingDate:   &date,
        OriginalTime:  originalTime,
        EditedTime:    &editedTime,
        TimeString:    timeStr,
        Source:        source,
        CreatedAt:     createdAt,
    }

    if b.CalculatedTime != nil {
        ct := int64(*b.CalculatedTime)
        resp.CalculatedTime = &ct
    }
    if b.PairID != nil {
        pid := strfmt.UUID(b.PairID.String())
        resp.PairID = &pid
    }
    if b.TerminalID != nil {
        tid := strfmt.UUID(b.TerminalID.String())
        resp.TerminalID = &tid
    }
    if b.Notes != "" {
        resp.Notes = &b.Notes
    }
    if b.Employee != nil {
        resp.Employee = mapEmployeeSummary(b.Employee)
    }
    if b.BookingType != nil {
        resp.BookingType = mapBookingTypeSummary(b.BookingType)
    }

    return resp
}

func mapEvalTerminalBookingToResponse(r *service.EvaluationTerminalBookingResult) *models.EvaluationTerminalBooking {
    id := strfmt.UUID(r.ID.String())
    empID := strfmt.UUID(r.EmployeeID.String())
    btID := strfmt.UUID(r.BookingTypeID.String())
    date := strfmt.Date(r.BookingDate)
    originalTime := int64(r.OriginalTime)
    originalTimeStr := timeutil.MinutesToString(r.OriginalTime)
    editedTime := int64(r.EditedTime)
    editedTimeStr := timeutil.MinutesToString(r.EditedTime)
    source := string(r.Source)
    createdAt := strfmt.DateTime(r.CreatedAt)

    resp := &models.EvaluationTerminalBooking{
        ID:                 &id,
        EmployeeID:         &empID,
        BookingTypeID:      &btID,
        BookingDate:        &date,
        OriginalTime:       originalTime,
        OriginalTimeString: originalTimeStr,
        EditedTime:         &editedTime,
        EditedTimeString:   editedTimeStr,
        WasEdited:          r.WasEdited,
        Source:             source,
        CreatedAt:          createdAt,
    }

    if r.CalculatedTime != nil {
        ct := int64(*r.CalculatedTime)
        resp.CalculatedTime = &ct
    }
    if r.TerminalID != nil {
        tid := strfmt.UUID(r.TerminalID.String())
        resp.TerminalID = &tid
    }
    if r.Employee != nil {
        resp.Employee = mapEmployeeSummary(r.Employee)
    }
    if r.BookingType != nil {
        resp.BookingType = mapBookingTypeSummary(r.BookingType)
    }

    return resp
}

func mapEvalLogToResponse(l *model.AuditLog) *models.EvaluationLogEntry {
    id := strfmt.UUID(l.ID.String())
    action := string(l.Action)
    entityType := l.EntityType
    entityID := strfmt.UUID(l.EntityID.String())
    performedAt := strfmt.DateTime(l.PerformedAt)

    resp := &models.EvaluationLogEntry{
        ID:          &id,
        Action:      &action,
        EntityType:  &entityType,
        EntityID:    &entityID,
        PerformedAt: &performedAt,
    }

    if l.UserID != nil {
        uid := strfmt.UUID(l.UserID.String())
        resp.UserID = &uid
    }
    if l.EntityName != nil {
        resp.EntityName = l.EntityName
    }
    if len(l.Changes) > 0 {
        var changes any
        if err := json.Unmarshal(l.Changes, &changes); err == nil {
            resp.Changes = changes
        }
    }
    if l.User != nil {
        uid := strfmt.UUID(l.User.ID.String())
        dn := l.User.DisplayName
        resp.User.ID = &uid
        resp.User.DisplayName = &dn
    }

    return resp
}

func mapEvalWorkflowToResponse(l *model.AuditLog) *models.EvaluationWorkflowEntry {
    id := strfmt.UUID(l.ID.String())
    action := string(l.Action)
    entityType := l.EntityType
    entityID := strfmt.UUID(l.EntityID.String())
    performedAt := strfmt.DateTime(l.PerformedAt)

    resp := &models.EvaluationWorkflowEntry{
        ID:          &id,
        Action:      &action,
        EntityType:  &entityType,
        EntityID:    &entityID,
        PerformedAt: &performedAt,
    }

    if l.UserID != nil {
        uid := strfmt.UUID(l.UserID.String())
        resp.UserID = &uid
    }
    if l.EntityName != nil {
        resp.EntityName = l.EntityName
    }
    if len(l.Metadata) > 0 {
        var metadata any
        if err := json.Unmarshal(l.Metadata, &metadata); err == nil {
            resp.Metadata = metadata
        }
    }
    if l.User != nil {
        uid := strfmt.UUID(l.User.ID.String())
        dn := l.User.DisplayName
        resp.User.ID = &uid
        resp.User.DisplayName = &dn
    }

    return resp
}
```

**Note about helper functions**: `mapEmployeeSummary` and `mapBookingTypeSummary` may already exist elsewhere or may need to be created. Check existing handler files for similar helpers. If not present, define them:

```go
func mapEmployeeSummary(e *model.Employee) *models.EmployeeSummary {
    id := strfmt.UUID(e.ID.String())
    return &models.EmployeeSummary{
        ID:              &id,
        FirstName:       &e.FirstName,
        LastName:        &e.LastName,
        PersonnelNumber: &e.PersonnelNumber,
    }
}

func mapBookingTypeSummary(bt *model.BookingType) *models.BookingTypeSummary {
    id := strfmt.UUID(bt.ID.String())
    direction := string(bt.Direction)
    return &models.BookingTypeSummary{
        ID:        &id,
        Code:      &bt.Code,
        Name:      &bt.Name,
        Direction: &direction,
    }
}
```

### Verification
- `go build ./internal/handler/...` succeeds
- All handler methods match the OpenAPI spec (same parameters, response types)

---

## Phase 6: Route Registration

### Overview
Register the evaluation routes and wire up DI in `main.go`.

### Step 6.1: Add RegisterEvaluationRoutes

**File**: `apps/api/internal/handler/routes.go`

Add a new function following the existing pattern from `RegisterMonthlyEvalRoutes`:

```go
func RegisterEvaluationRoutes(r chi.Router, h *EvaluationHandler, authz *middleware.AuthorizationMiddleware) {
    permViewReports := permissions.ID("reports.view").String()
    r.Route("/evaluations", func(r chi.Router) {
        if authz == nil {
            r.Get("/daily-values", h.ListDailyValues)
            r.Get("/bookings", h.ListBookings)
            r.Get("/terminal-bookings", h.ListTerminalBookings)
            r.Get("/logs", h.ListLogs)
            r.Get("/workflow-history", h.ListWorkflowHistory)
            return
        }
        r.With(authz.RequirePermission(permViewReports)).Get("/daily-values", h.ListDailyValues)
        r.With(authz.RequirePermission(permViewReports)).Get("/bookings", h.ListBookings)
        r.With(authz.RequirePermission(permViewReports)).Get("/terminal-bookings", h.ListTerminalBookings)
        r.With(authz.RequirePermission(permViewReports)).Get("/logs", h.ListLogs)
        r.With(authz.RequirePermission(permViewReports)).Get("/workflow-history", h.ListWorkflowHistory)
    })
}
```

### Step 6.2: Wire Up in main.go

**File**: `apps/api/cmd/server/main.go`

Add after the existing service/handler initialization (around line 247, after correction assistant):

```go
// Initialize EvaluationService
evaluationService := service.NewEvaluationService(bookingRepo, dailyValueRepo, auditLogRepo, employeeRepo)
evaluationHandler := handler.NewEvaluationHandler(evaluationService, employeeService)
```

Add in the tenant-scoped route group (around line 361, after `RegisterVacationCarryoverRoutes`):

```go
handler.RegisterEvaluationRoutes(r, evaluationHandler, authzMiddleware)
```

### Verification
- `go build ./cmd/server/...` succeeds
- Server starts without panics
- Routes are reachable at `/api/v1/evaluations/*`

---

## Phase 7: Tests

### Overview
Write handler-level tests following the pattern from `apps/api/internal/handler/booking_test.go`. Tests use real DB via `testutil.SetupTestDB(t)`.

**File**: `apps/api/internal/handler/evaluation_test.go` (NEW)

### Step 7.1: Test Setup Helper

```go
package handler_test

import (
    "context"
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "testing"
    "time"

    "github.com/google/uuid"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"

    "github.com/tolga/terp/internal/handler"
    "github.com/tolga/terp/internal/middleware"
    "github.com/tolga/terp/internal/model"
    "github.com/tolga/terp/internal/repository"
    "github.com/tolga/terp/internal/service"
    "github.com/tolga/terp/internal/testutil"
)

func setupEvaluationHandler(t *testing.T) (
    *handler.EvaluationHandler,
    *service.BookingService,
    *model.Tenant,
    *model.Employee,
    *model.BookingType,
) {
    db := testutil.SetupTestDB(t)
    tenantRepo := repository.NewTenantRepository(db)
    employeeRepo := repository.NewEmployeeRepository(db)
    bookingTypeRepo := repository.NewBookingTypeRepository(db)
    bookingRepo := repository.NewBookingRepository(db)
    dailyValueRepo := repository.NewDailyValueRepository(db)
    auditLogRepo := repository.NewAuditLogRepository(db)
    empDayPlanRepo := repository.NewEmployeeDayPlanRepository(db)
    dayPlanRepo := repository.NewDayPlanRepository(db)
    holidayRepo := repository.NewHolidayRepository(db)
    absenceDayRepo := repository.NewAbsenceDayRepository(db)
    tariffRepo := repository.NewTariffRepository(db)

    ctx := context.Background()

    // Create test tenant
    tenant := &model.Tenant{
        Name:     "Eval Test " + uuid.New().String()[:8],
        Slug:     "eval-" + uuid.New().String()[:8],
        IsActive: true,
    }
    require.NoError(t, tenantRepo.Create(ctx, tenant))

    // Create test employee
    employee := &model.Employee{
        TenantID:        tenant.ID,
        FirstName:       "Eval",
        LastName:        "Employee",
        PersonnelNumber: "EVAL-001",
        PIN:             "1234",
        EntryDate:       time.Now().AddDate(-1, 0, 0),
        IsActive:        true,
    }
    require.NoError(t, employeeRepo.Create(ctx, employee))

    // Create test booking type
    bookingType := &model.BookingType{
        TenantID:  &tenant.ID,
        Code:      "EVAL-IN",
        Name:      "Eval Clock In",
        Direction: model.BookingDirectionIn,
        IsActive:  true,
    }
    require.NoError(t, bookingTypeRepo.Create(ctx, bookingType))

    // Create services
    dailyCalcService := service.NewDailyCalcService(bookingRepo, empDayPlanRepo, dayPlanRepo, dailyValueRepo, holidayRepo, employeeRepo, absenceDayRepo)
    recalcService := service.NewRecalcService(dailyCalcService, employeeRepo)
    bookingService := service.NewBookingService(bookingRepo, bookingTypeRepo, recalcService, nil)
    employeeService := service.NewEmployeeService(employeeRepo, tariffRepo, empDayPlanRepo)
    evaluationService := service.NewEvaluationService(bookingRepo, dailyValueRepo, auditLogRepo, employeeRepo)

    h := handler.NewEvaluationHandler(evaluationService, employeeService)

    return h, bookingService, tenant, employee, bookingType
}

func withEvalTenantContext(r *http.Request, tenant *model.Tenant) *http.Request {
    ctx := context.WithValue(r.Context(), middleware.TenantContextKey, tenant.ID)
    return r.WithContext(ctx)
}
```

### Step 7.2: Daily Values Tests

```go
func TestEvaluationHandler_ListDailyValues_Success(t *testing.T) {
    h, _, tenant, employee, _ := setupEvaluationHandler(t)
    db := testutil.SetupTestDB(t)
    dvRepo := repository.NewDailyValueRepository(db)
    ctx := context.Background()

    // Create daily values for a 3-day range
    today := time.Now().Truncate(24 * time.Hour)
    for i := 0; i < 3; i++ {
        dv := &model.DailyValue{
            TenantID:     tenant.ID,
            EmployeeID:   employee.ID,
            ValueDate:    today.AddDate(0, 0, -i),
            GrossTime:    540,
            NetTime:      510,
            TargetTime:   480,
            Overtime:     30,
            BreakTime:    30,
            BookingCount: 2,
            Status:       model.DailyValueStatusCalculated,
        }
        require.NoError(t, dvRepo.Upsert(ctx, dv))
    }

    from := today.AddDate(0, 0, -2).Format("2006-01-02")
    to := today.Format("2006-01-02")
    req := httptest.NewRequest("GET", "/evaluations/daily-values?from="+from+"&to="+to, nil)
    req = withEvalTenantContext(req, tenant)
    rr := httptest.NewRecorder()

    h.ListDailyValues(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result map[string]interface{}
    require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &result))
    data := result["data"].([]interface{})
    assert.Equal(t, 3, len(data))
}

func TestEvaluationHandler_ListDailyValues_MissingDateRange(t *testing.T) {
    h, _, tenant, _, _ := setupEvaluationHandler(t)

    // Missing 'from' param
    req := httptest.NewRequest("GET", "/evaluations/daily-values?to=2026-01-31", nil)
    req = withEvalTenantContext(req, tenant)
    rr := httptest.NewRecorder()

    h.ListDailyValues(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestEvaluationHandler_ListDailyValues_NoTenant(t *testing.T) {
    h, _, _, _, _ := setupEvaluationHandler(t)

    req := httptest.NewRequest("GET", "/evaluations/daily-values?from=2026-01-01&to=2026-01-31", nil)
    rr := httptest.NewRecorder()

    h.ListDailyValues(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestEvaluationHandler_ListDailyValues_FilterByEmployee(t *testing.T) {
    h, _, tenant, employee, _ := setupEvaluationHandler(t)

    from := time.Now().AddDate(0, 0, -5).Format("2006-01-02")
    to := time.Now().Format("2006-01-02")
    req := httptest.NewRequest("GET", "/evaluations/daily-values?from="+from+"&to="+to+"&employee_id="+employee.ID.String(), nil)
    req = withEvalTenantContext(req, tenant)
    rr := httptest.NewRecorder()

    h.ListDailyValues(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}

func TestEvaluationHandler_ListDailyValues_IncludeNoBookings(t *testing.T) {
    h, _, tenant, employee, _ := setupEvaluationHandler(t)
    db := testutil.SetupTestDB(t)
    dvRepo := repository.NewDailyValueRepository(db)
    ctx := context.Background()

    // Create daily value for only 1 out of 5 days
    today := time.Now().Truncate(24 * time.Hour)
    dv := &model.DailyValue{
        TenantID:     tenant.ID,
        EmployeeID:   employee.ID,
        ValueDate:    today,
        GrossTime:    540,
        NetTime:      510,
        TargetTime:   480,
        BookingCount: 2,
        Status:       model.DailyValueStatusCalculated,
    }
    require.NoError(t, dvRepo.Upsert(ctx, dv))

    from := today.AddDate(0, 0, -4).Format("2006-01-02")
    to := today.Format("2006-01-02")
    req := httptest.NewRequest("GET",
        "/evaluations/daily-values?from="+from+"&to="+to+
            "&employee_id="+employee.ID.String()+
            "&include_no_bookings=true", nil)
    req = withEvalTenantContext(req, tenant)
    rr := httptest.NewRecorder()

    h.ListDailyValues(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result map[string]interface{}
    require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &result))
    data := result["data"].([]interface{})
    // Should have 5 rows (1 real + 4 placeholder)
    assert.Equal(t, 5, len(data))

    // Verify at least one has status "no_data"
    hasNoData := false
    for _, item := range data {
        entry := item.(map[string]interface{})
        if entry["status"] == "no_data" {
            hasNoData = true
            break
        }
    }
    assert.True(t, hasNoData, "Should have at least one no_data placeholder row")
}
```

### Step 7.3: Bookings Evaluation Tests

```go
func TestEvaluationHandler_ListBookings_Success(t *testing.T) {
    h, svc, tenant, employee, bookingType := setupEvaluationHandler(t)
    ctx := context.Background()

    today := time.Now()
    // Create 3 bookings
    for i := 0; i < 3; i++ {
        input := service.CreateBookingInput{
            TenantID:      tenant.ID,
            EmployeeID:    employee.ID,
            BookingTypeID: bookingType.ID,
            BookingDate:   today,
            OriginalTime:  480 + i*60,
            EditedTime:    480 + i*60,
            Source:        model.BookingSourceWeb,
        }
        _, err := svc.Create(ctx, input)
        require.NoError(t, err)
    }

    from := today.AddDate(0, 0, -1).Format("2006-01-02")
    to := today.AddDate(0, 0, 1).Format("2006-01-02")
    req := httptest.NewRequest("GET", "/evaluations/bookings?from="+from+"&to="+to, nil)
    req = withEvalTenantContext(req, tenant)
    rr := httptest.NewRecorder()

    h.ListBookings(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result map[string]interface{}
    require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &result))
    data := result["data"].([]interface{})
    assert.GreaterOrEqual(t, len(data), 3)
}

func TestEvaluationHandler_ListBookings_FilterBySource(t *testing.T) {
    h, svc, tenant, employee, bookingType := setupEvaluationHandler(t)
    ctx := context.Background()

    // Create one web booking, one terminal booking
    _, err := svc.Create(ctx, service.CreateBookingInput{
        TenantID:      tenant.ID,
        EmployeeID:    employee.ID,
        BookingTypeID: bookingType.ID,
        BookingDate:   time.Now(),
        OriginalTime:  480,
        EditedTime:    480,
        Source:        model.BookingSourceWeb,
    })
    require.NoError(t, err)

    _, err = svc.Create(ctx, service.CreateBookingInput{
        TenantID:      tenant.ID,
        EmployeeID:    employee.ID,
        BookingTypeID: bookingType.ID,
        BookingDate:   time.Now(),
        OriginalTime:  540,
        EditedTime:    540,
        Source:        model.BookingSourceTerminal,
    })
    require.NoError(t, err)

    from := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
    to := time.Now().AddDate(0, 0, 1).Format("2006-01-02")
    req := httptest.NewRequest("GET", "/evaluations/bookings?from="+from+"&to="+to+"&source=terminal", nil)
    req = withEvalTenantContext(req, tenant)
    rr := httptest.NewRecorder()

    h.ListBookings(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result map[string]interface{}
    require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &result))
    data := result["data"].([]interface{})
    assert.GreaterOrEqual(t, len(data), 1)
    // All returned should be terminal source
    for _, item := range data {
        entry := item.(map[string]interface{})
        assert.Equal(t, "terminal", entry["source"])
    }
}
```

### Step 7.4: Terminal Bookings Tests

```go
func TestEvaluationHandler_ListTerminalBookings_Success(t *testing.T) {
    h, svc, tenant, employee, bookingType := setupEvaluationHandler(t)
    ctx := context.Background()

    // Create a terminal booking
    _, err := svc.Create(ctx, service.CreateBookingInput{
        TenantID:      tenant.ID,
        EmployeeID:    employee.ID,
        BookingTypeID: bookingType.ID,
        BookingDate:   time.Now(),
        OriginalTime:  480,
        EditedTime:    495, // edited from 08:00 to 08:15
        Source:        model.BookingSourceTerminal,
    })
    require.NoError(t, err)

    from := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
    to := time.Now().AddDate(0, 0, 1).Format("2006-01-02")
    req := httptest.NewRequest("GET", "/evaluations/terminal-bookings?from="+from+"&to="+to, nil)
    req = withEvalTenantContext(req, tenant)
    rr := httptest.NewRecorder()

    h.ListTerminalBookings(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result map[string]interface{}
    require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &result))
    data := result["data"].([]interface{})
    assert.GreaterOrEqual(t, len(data), 1)

    entry := data[0].(map[string]interface{})
    assert.Equal(t, true, entry["was_edited"])
}

func TestEvaluationHandler_ListTerminalBookings_ExcludesNonTerminal(t *testing.T) {
    h, svc, tenant, employee, bookingType := setupEvaluationHandler(t)
    ctx := context.Background()

    // Create a web booking (should NOT appear)
    _, err := svc.Create(ctx, service.CreateBookingInput{
        TenantID:      tenant.ID,
        EmployeeID:    employee.ID,
        BookingTypeID: bookingType.ID,
        BookingDate:   time.Now(),
        OriginalTime:  480,
        EditedTime:    480,
        Source:        model.BookingSourceWeb,
    })
    require.NoError(t, err)

    from := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
    to := time.Now().AddDate(0, 0, 1).Format("2006-01-02")
    req := httptest.NewRequest("GET", "/evaluations/terminal-bookings?from="+from+"&to="+to, nil)
    req = withEvalTenantContext(req, tenant)
    rr := httptest.NewRecorder()

    h.ListTerminalBookings(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result map[string]interface{}
    require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &result))
    data := result["data"].([]interface{})
    assert.Equal(t, 0, len(data), "Web bookings should not appear in terminal bookings evaluation")
}
```

### Step 7.5: Logs Evaluation Tests

```go
func TestEvaluationHandler_ListLogs_Success(t *testing.T) {
    h, _, tenant, _, _ := setupEvaluationHandler(t)

    from := time.Now().AddDate(0, -1, 0).Format("2006-01-02")
    to := time.Now().AddDate(0, 0, 1).Format("2006-01-02")
    req := httptest.NewRequest("GET", "/evaluations/logs?from="+from+"&to="+to, nil)
    req = withEvalTenantContext(req, tenant)
    rr := httptest.NewRecorder()

    h.ListLogs(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result map[string]interface{}
    require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &result))
    assert.NotNil(t, result["data"])
}

func TestEvaluationHandler_ListLogs_WithBookingChanges(t *testing.T) {
    // This test verifies that booking create/update audit logs appear in logs evaluation
    // Setup: use setupBookingHandlerWithAudit to create bookings with audit trails
    // Then query the evaluation logs endpoint and verify the audit entries appear
    h, svc, tenant, employee, bookingType := setupEvaluationHandler(t)
    ctx := context.Background()

    // Create and update a booking (generates audit logs at service level,
    // but audit logs are created at handler level in production)
    // For testing, directly insert audit log entries
    db := testutil.SetupTestDB(t)
    auditRepo := repository.NewAuditLogRepository(db)
    auditSvc := service.NewAuditLogService(auditRepo)

    // Create a booking
    input := service.CreateBookingInput{
        TenantID:      tenant.ID,
        EmployeeID:    employee.ID,
        BookingTypeID: bookingType.ID,
        BookingDate:   time.Now(),
        OriginalTime:  480,
        EditedTime:    480,
        Source:        model.BookingSourceWeb,
    }
    created, err := svc.Create(ctx, input)
    require.NoError(t, err)

    // Manually log audit entry (simulating handler behavior)
    auditSvc.Log(ctx, nil, service.LogEntry{
        TenantID:   tenant.ID,
        Action:     model.AuditActionCreate,
        EntityType: "booking",
        EntityID:   created.ID,
        EntityName: "Booking test",
    })

    from := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
    to := time.Now().AddDate(0, 0, 1).Format("2006-01-02")
    req := httptest.NewRequest("GET", "/evaluations/logs?from="+from+"&to="+to+"&entity_type=booking", nil)
    req = withEvalTenantContext(req, tenant)
    rr := httptest.NewRecorder()

    h.ListLogs(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result map[string]interface{}
    require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &result))
    data := result["data"].([]interface{})
    assert.GreaterOrEqual(t, len(data), 1)

    // Verify the entry has correct fields
    entry := data[0].(map[string]interface{})
    assert.Equal(t, "create", entry["action"])
    assert.Equal(t, "booking", entry["entity_type"])
}
```

### Step 7.6: Workflow History Tests

```go
func TestEvaluationHandler_ListWorkflowHistory_Success(t *testing.T) {
    h, _, tenant, _, _ := setupEvaluationHandler(t)

    from := time.Now().AddDate(0, -1, 0).Format("2006-01-02")
    to := time.Now().AddDate(0, 0, 1).Format("2006-01-02")
    req := httptest.NewRequest("GET", "/evaluations/workflow-history?from="+from+"&to="+to, nil)
    req = withEvalTenantContext(req, tenant)
    rr := httptest.NewRecorder()

    h.ListWorkflowHistory(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result map[string]interface{}
    require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &result))
    assert.NotNil(t, result["data"])
}

func TestEvaluationHandler_ListWorkflowHistory_MissingFromDate(t *testing.T) {
    h, _, tenant, _, _ := setupEvaluationHandler(t)

    req := httptest.NewRequest("GET", "/evaluations/workflow-history?to=2026-01-31", nil)
    req = withEvalTenantContext(req, tenant)
    rr := httptest.NewRecorder()

    h.ListWorkflowHistory(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}
```

### Step 7.7: Pagination Tests

```go
func TestEvaluationHandler_ListBookings_Pagination(t *testing.T) {
    h, svc, tenant, employee, bookingType := setupEvaluationHandler(t)
    ctx := context.Background()

    // Create 5 bookings
    today := time.Now()
    for i := 0; i < 5; i++ {
        _, err := svc.Create(ctx, service.CreateBookingInput{
            TenantID:      tenant.ID,
            EmployeeID:    employee.ID,
            BookingTypeID: bookingType.ID,
            BookingDate:   today,
            OriginalTime:  480 + i*30,
            EditedTime:    480 + i*30,
            Source:        model.BookingSourceWeb,
        })
        require.NoError(t, err)
    }

    from := today.AddDate(0, 0, -1).Format("2006-01-02")
    to := today.AddDate(0, 0, 1).Format("2006-01-02")

    // Page 1, limit 2
    req := httptest.NewRequest("GET", "/evaluations/bookings?from="+from+"&to="+to+"&limit=2&page=1", nil)
    req = withEvalTenantContext(req, tenant)
    rr := httptest.NewRecorder()
    h.ListBookings(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result map[string]interface{}
    require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &result))
    data := result["data"].([]interface{})
    assert.Equal(t, 2, len(data))
    meta := result["meta"].(map[string]interface{})
    assert.Equal(t, true, meta["has_more"])
}
```

### Verification
- `cd apps/api && go test -v ./internal/handler/... -run TestEvaluation` passes all tests
- `cd apps/api && go test -race ./internal/handler/...` passes with race detection
- `make test` passes globally

---

## Phase 8: Final Verification

### Step 8.1: Bundle and Generate
```bash
make swagger-bundle
make generate
```

### Step 8.2: Build
```bash
cd apps/api && go build ./...
```

### Step 8.3: Lint
```bash
make lint
```

### Step 8.4: Test
```bash
make test
```

### Step 8.5: Manual Smoke Test (if dev environment available)
```bash
make dev
# Wait for services to start
curl -s http://localhost:8080/api/v1/evaluations/daily-values?from=2026-01-01&to=2026-01-31 \
  -H "Authorization: Bearer <token>" \
  -H "X-Tenant-ID: <tenant-id>" | jq .
```

### Acceptance Criteria Checklist

| Criteria | How Verified |
|---|---|
| Each evaluation type returns correct data and respects filters | Handler tests with employee_id, date range, source, department filters |
| "Days without bookings" produces rows with zero values | `TestEvaluationHandler_ListDailyValues_IncludeNoBookings` |
| Log evaluation includes user, timestamp, and before/after values | `TestEvaluationHandler_ListLogs_WithBookingChanges` |
| Daily values: one row per date | `TestEvaluationHandler_ListDailyValues_Success` (3 days = 3 rows) |
| Bookings: one row per booking with calculated times | `TestEvaluationHandler_ListBookings_Success` (3 bookings = 3 rows) |
| Evaluation queries reflect changes after recalculation | Integration test: create booking, recalculate, verify daily value in evaluation |
| Pagination works | `TestEvaluationHandler_ListBookings_Pagination` |
| OpenAPI spec documented | `make swagger-bundle` succeeds, schemas match handler responses |

---

## File Summary

### New Files (6)
1. `api/schemas/evaluations.yaml` - OpenAPI schemas for evaluation responses
2. `api/paths/evaluations.yaml` - OpenAPI path definitions for 5 endpoints
3. `apps/api/internal/service/evaluation.go` - Service with filter structs and query logic
4. `apps/api/internal/handler/evaluation.go` - Handler with 5 HTTP methods + response mappers
5. `apps/api/internal/handler/evaluation_test.go` - Handler tests (12+ test functions)
6. (generated) `apps/api/gen/models/evaluation_*.go` - Generated from OpenAPI schemas

### Modified Files (5)
1. `api/openapi.yaml` - Add evaluation paths, tag, and definitions
2. `apps/api/internal/handler/routes.go` - Add `RegisterEvaluationRoutes()`
3. `apps/api/cmd/server/main.go` - Wire evaluation service/handler, register routes
4. `apps/api/internal/repository/booking.go` - Add `DepartmentID` to `BookingFilter`
5. `apps/api/internal/repository/auditlog.go` - Add `Offset`, `EntityTypes`, `Actions` to `AuditLogFilter`

### Optional Modifications (2)
6. `apps/api/internal/model/dailyvalue.go` - Add `DepartmentID` to `DailyValueListOptions`
7. `apps/api/internal/repository/dailyvalue.go` - Add department filtering to `ListAll`
