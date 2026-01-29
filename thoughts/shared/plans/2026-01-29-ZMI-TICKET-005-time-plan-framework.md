# ZMI-TICKET-005: Time Plan Framework - Implementation Plan

## Overview

Complete the ZMI-TICKET-005 time plan framework by closing the remaining gaps: implement the employee day plan HTTP layer (service + handler + routes for all 10 OpenAPI endpoints), enforce week plan 7-day completeness validation per the ZMI manual, add rhythm start date validation for tariffs, and generate missing OpenAPI models.

## Current State Analysis

The time plan framework is substantially implemented at the model, repository, and tariff resolution layers. Day plans (10 endpoints), week plans (5 endpoints), and tariff rhythm configuration are fully operational. The employee day plan model, repository (10 methods), and tariff sync logic all work correctly.

### What's Missing:
1. **Employee day plan HTTP layer**: 10 OpenAPI endpoints defined but no handler, service, or routes exist
2. **Week plan completeness validation**: All 7 day plan IDs are nullable; the ZMI manual requires all 7 days assigned
3. **Rhythm start date validation**: Tariff service allows creating `rolling_weekly`/`x_days` tariffs without `rhythm_start_date`
4. **Generated models**: `BulkCreateEmployeeDayPlanRequest` and `DeleteRangeRequest` not in bundled spec definitions

### Key Discoveries:
- ZMI manual Section 11.2 (`zmi-calculation-manual-reference.md:1260`): "You must store a unique day plan for each day"
- Employee day plan repository is complete at `repository/employeedayplan.go` with 10 methods including BulkCreate, Upsert, DeleteRange, DeleteRangeBySource
- No `List` method exists on the repository (needs to be added for the list endpoint with filters)
- Tariff rhythm resolution is nil-safe (`model/tariff.go:283-284`, `304-305`) but creates functionally useless tariffs
- Permission pattern follows `resource.manage` convention (`permissions.go:49-51`): `day_plans.manage`, `week_plans.manage`, `tariffs.manage`
- Cursor-based pagination exists in the OpenAPI spec but is not fully implemented anywhere; we'll implement simple cursor support

## Desired End State

After this plan is complete:
1. All 10 employee day plan HTTP endpoints are functional and match the OpenAPI spec
2. Week plan create/update rejects plans with any null day plan IDs
3. Tariff create/update requires `rhythm_start_date` for `rolling_weekly` and `x_days` rhythm types
4. `BulkCreateEmployeeDayPlanRequest` and `DeleteRangeRequest` models are generated
5. `employee_day_plans.manage` permission exists and gates all employee day plan endpoints
6. Service-level tests cover new functionality

### Verification:
- `make swagger-bundle && make generate` produces all models
- `make test` passes with all new and existing tests
- `make lint` passes
- All 10 endpoints respond correctly via Swagger UI

## What We're NOT Doing

1. **Full cursor pagination implementation** - We'll use simple limit+cursor support but not implement HasMore/Total counts (matches existing audit log pattern)
2. **Employee day plan service tests for tariff sync** - Tariff sync already works and is tested via employee service tests
3. **Day plan calculation rules** - Out of scope (ZMI-TICKET-006)
4. **Frontend changes** - Backend only

## Implementation Approach

OpenAPI-first: fix the spec definitions, regenerate models, then build service → handler → routes → wiring in clean architecture layers.

---

## Phase 1: OpenAPI Spec Fix & Model Generation

### Overview
Add missing schema definitions to `api/openapi.yaml` so that `BulkCreateEmployeeDayPlanRequest` and `DeleteRangeRequest` models are generated.

### Changes Required:

#### 1. Add missing definitions
**File**: `api/openapi.yaml`

Add to the `definitions:` section (after the existing employee day plan definitions around line 771):

```yaml
  BulkCreateEmployeeDayPlanRequest:
    $ref: 'schemas/employee-day-plans.yaml#/BulkCreateEmployeeDayPlanRequest'
  DeleteRangeRequest:
    $ref: 'schemas/employee-day-plans.yaml#/DeleteRangeRequest'
  EmployeeDayPlanSource:
    $ref: 'schemas/employee-day-plans.yaml#/EmployeeDayPlanSource'
```

Note: `EmployeeDayPlanSource` is already generated (it's referenced by other models), but adding it explicitly ensures consistency.

#### 2. Regenerate models

```bash
make swagger-bundle && make generate
```

### Success Criteria:

#### Automated Verification:
- [x] `make swagger-bundle` succeeds
- [x] `make generate` succeeds
- [x] File exists: `apps/api/gen/models/bulk_create_employee_day_plan_request.go`
- [x] File exists: `apps/api/gen/models/delete_range_request.go`
- [x] `cd apps/api && go build ./...` compiles

---

## Phase 2: Week Plan Completeness Validation

### Overview
Enforce the ZMI requirement that all 7 days in a week plan must have a day plan assigned. Add validation errors when any day plan ID is null during create or update.

### Changes Required:

#### 1. Add error sentinel
**File**: `apps/api/internal/service/weekplan.go`

Add to the error variables block:

```go
var ErrWeekPlanIncomplete = errors.New("week plan must have a day plan assigned for all 7 days")
```

#### 2. Add validation in Create
**File**: `apps/api/internal/service/weekplan.go`

In the `Create` method, after building the `model.WeekPlan`, add validation before calling `weekPlanRepo.Create`:

```go
// Validate all 7 days have day plans assigned (ZMI manual Section 11.2)
if input.MondayDayPlanID == nil || input.TuesdayDayPlanID == nil ||
    input.WednesdayDayPlanID == nil || input.ThursdayDayPlanID == nil ||
    input.FridayDayPlanID == nil || input.SaturdayDayPlanID == nil ||
    input.SundayDayPlanID == nil {
    return nil, ErrWeekPlanIncomplete
}
```

#### 3. Add validation in Update
**File**: `apps/api/internal/service/weekplan.go`

In the `Update` method, after applying all field updates to the existing plan, add validation before calling `weekPlanRepo.Update`. Since updates are partial (only provided fields change), we need to validate the final state of the plan:

```go
// Validate completeness after applying updates
if plan.MondayDayPlanID == nil || plan.TuesdayDayPlanID == nil ||
    plan.WednesdayDayPlanID == nil || plan.ThursdayDayPlanID == nil ||
    plan.FridayDayPlanID == nil || plan.SaturdayDayPlanID == nil ||
    plan.SundayDayPlanID == nil {
    return nil, ErrWeekPlanIncomplete
}
```

Note: Updates use `Clear*` flags to explicitly set fields to null. If a `ClearMondayDayPlan` is set, it nullifies the field. The completeness check after applying all updates catches this case.

#### 4. Add error mapping in handler
**File**: `apps/api/internal/handler/weekplan.go`

Add to the error switch in both `Create` and `Update`:

```go
case service.ErrWeekPlanIncomplete:
    respondError(w, http.StatusBadRequest, "Week plan must have a day plan assigned for all 7 days")
```

### Success Criteria:

#### Automated Verification:
- [x] `cd apps/api && go build ./...` compiles
- [x] `cd apps/api && go test ./internal/service/...` passes
- [x] New test: creating week plan with null Sunday returns ErrWeekPlanIncomplete
- [x] New test: updating week plan to clear Monday returns ErrWeekPlanIncomplete

#### Manual Verification:
- [ ] POST /week-plans with missing Saturday returns 400
- [ ] PUT /week-plans/{id} clearing a day returns 400

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation.

---

## Phase 3: Rhythm Start Date Validation

### Overview
Require `rhythm_start_date` when creating or updating a tariff with `rolling_weekly` or `x_days` rhythm type. Without this date, rhythm resolution returns nil for all dates.

### Changes Required:

#### 1. Add error sentinel
**File**: `apps/api/internal/service/tariff.go`

Add to the error variables:

```go
var ErrRhythmStartDateRequired = errors.New("rhythm_start_date is required for rolling_weekly and x_days rhythms")
```

#### 2. Add validation in Create
**File**: `apps/api/internal/service/tariff.go`

In the `Create` method, within the `switch input.RhythmType` block, add the check for both `rolling_weekly` and `x_days` cases:

For `rolling_weekly` (at the top of the case, before validating week plans):
```go
case model.RhythmTypeRollingWeekly:
    if input.RhythmStartDate == nil {
        return nil, ErrRhythmStartDateRequired
    }
    // ... existing week plan validation ...
```

For `x_days` (at the top of the case, before validating cycle days):
```go
case model.RhythmTypeXDays:
    if input.RhythmStartDate == nil {
        return nil, ErrRhythmStartDateRequired
    }
    // ... existing cycle days validation ...
```

#### 3. Add validation in Update (rhythm type switch)
**File**: `apps/api/internal/service/tariff.go`

In the `Update` method's rhythm type switching logic, add the same check when rhythm type is being changed to `rolling_weekly` or `x_days`.

#### 4. Add error mapping in handler
**File**: `apps/api/internal/handler/tariff.go`

Add to the error switch in both Create and Update:

```go
case service.ErrRhythmStartDateRequired:
    respondError(w, http.StatusBadRequest, "rhythm_start_date is required for rolling_weekly and x_days rhythms")
```

### Success Criteria:

#### Automated Verification:
- [x] `cd apps/api && go build ./...` compiles
- [x] `cd apps/api && go test ./internal/service/...` passes
- [x] New test: creating tariff with rolling_weekly and nil rhythm_start_date returns error
- [x] New test: creating tariff with x_days and nil rhythm_start_date returns error

#### Manual Verification:
- [ ] POST /tariffs with rhythm_type=rolling_weekly without rhythm_start_date returns 400

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation.

---

## Phase 4: Employee Day Plan Repository Extension

### Overview
Add a `List` method to the employee day plan repository for the list endpoint with filtering support (employee_id, date range, source, limit, cursor).

### Changes Required:

#### 1. Add List method
**File**: `apps/api/internal/repository/employeedayplan.go`

```go
// EmployeeDayPlanFilter defines filters for listing employee day plans.
type EmployeeDayPlanFilter struct {
    TenantID   uuid.UUID
    EmployeeID *uuid.UUID
    From       *time.Time
    To         *time.Time
    Source     *string
    Limit      int
    Cursor     *uuid.UUID
}

// List returns employee day plans matching the filter criteria.
func (r *EmployeeDayPlanRepository) List(ctx context.Context, filter EmployeeDayPlanFilter) ([]model.EmployeeDayPlan, error) {
    var plans []model.EmployeeDayPlan
    query := r.db.WithContext(ctx).
        Where("tenant_id = ?", filter.TenantID).
        Preload("DayPlan").
        Preload("DayPlan.Breaks").
        Preload("DayPlan.Bonuses")

    if filter.EmployeeID != nil {
        query = query.Where("employee_id = ?", *filter.EmployeeID)
    }
    if filter.From != nil {
        query = query.Where("plan_date >= ?", *filter.From)
    }
    if filter.To != nil {
        query = query.Where("plan_date <= ?", *filter.To)
    }
    if filter.Source != nil {
        query = query.Where("source = ?", *filter.Source)
    }
    if filter.Cursor != nil {
        query = query.Where("id > ?", *filter.Cursor)
    }

    limit := filter.Limit
    if limit <= 0 {
        limit = 20
    }
    if limit > 100 {
        limit = 100
    }

    err := query.Order("plan_date ASC, employee_id ASC").
        Limit(limit + 1). // fetch one extra to determine if there are more
        Find(&plans).Error
    return plans, err
}
```

Note: We fetch `limit + 1` records so the service can determine if there's a next page (if we get more than `limit` records, there are more pages and the last returned record's ID becomes the next cursor).

### Success Criteria:

#### Automated Verification:
- [x] `cd apps/api && go build ./...` compiles

---

## Phase 5: Employee Day Plan Service

### Overview
Create the business logic layer for employee day plan CRUD operations. The service validates inputs, enforces tenant scoping, and delegates to the repository.

### Changes Required:

#### 1. Create service file
**File**: `apps/api/internal/service/employeedayplan.go`

**Repository interface**:
```go
type employeeDayPlanRepository interface {
    Create(ctx context.Context, plan *model.EmployeeDayPlan) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.EmployeeDayPlan, error)
    Update(ctx context.Context, plan *model.EmployeeDayPlan) error
    Delete(ctx context.Context, id uuid.UUID) error
    List(ctx context.Context, filter repository.EmployeeDayPlanFilter) ([]model.EmployeeDayPlan, error)
    GetForEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.EmployeeDayPlan, error)
    GetForEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.EmployeeDayPlan, error)
    Upsert(ctx context.Context, plan *model.EmployeeDayPlan) error
    BulkCreate(ctx context.Context, plans []model.EmployeeDayPlan) error
    DeleteRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) error
}

type empDayPlanDayPlanRepository interface {
    GetByID(ctx context.Context, id uuid.UUID) (*model.DayPlan, error)
}

type empDayPlanEmployeeRepository interface {
    GetByID(ctx context.Context, id uuid.UUID) (*model.Employee, error)
}
```

**Service errors**:
```go
var (
    ErrEmpDayPlanNotFound       = errors.New("employee day plan not found")
    ErrEmpDayPlanEmployeeReq    = errors.New("employee_id is required")
    ErrEmpDayPlanDateReq        = errors.New("plan_date is required")
    ErrEmpDayPlanInvalidDayPlan = errors.New("invalid day plan reference")
    ErrEmpDayPlanInvalidEmployee = errors.New("invalid employee reference")
    ErrEmpDayPlanConflict       = errors.New("day plan already exists for this employee and date")
    ErrEmpDayPlanDateRangeReq   = errors.New("from and to dates are required")
)
```

**Service struct**:
```go
type EmployeeDayPlanService struct {
    empDayPlanRepo employeeDayPlanRepository
    dayPlanRepo    empDayPlanDayPlanRepository
    employeeRepo   empDayPlanEmployeeRepository
}

func NewEmployeeDayPlanService(
    empDayPlanRepo employeeDayPlanRepository,
    dayPlanRepo empDayPlanDayPlanRepository,
    employeeRepo empDayPlanEmployeeRepository,
) *EmployeeDayPlanService {
    return &EmployeeDayPlanService{
        empDayPlanRepo: empDayPlanRepo,
        dayPlanRepo:    dayPlanRepo,
        employeeRepo:   employeeRepo,
    }
}
```

**Input structs**:
```go
type ListEmployeeDayPlanInput struct {
    TenantID   uuid.UUID
    EmployeeID *uuid.UUID
    From       *time.Time
    To         *time.Time
    Source     *string
    Limit      int
    Cursor     *uuid.UUID
}

type CreateEmployeeDayPlanInput struct {
    TenantID   uuid.UUID
    EmployeeID uuid.UUID
    PlanDate   time.Time
    DayPlanID  *uuid.UUID
    Source     string
    Notes      string
}

type UpdateEmployeeDayPlanInput struct {
    DayPlanID    *uuid.UUID
    ClearDayPlan bool
    Source       *string
    Notes        *string
}

type BulkCreateEmployeeDayPlanInput struct {
    TenantID uuid.UUID
    Plans    []CreateEmployeeDayPlanInput
}

type DeleteRangeInput struct {
    TenantID   uuid.UUID
    EmployeeID uuid.UUID
    From       time.Time
    To         time.Time
}

type UpsertEmployeeDayPlanInput struct {
    TenantID   uuid.UUID
    EmployeeID uuid.UUID
    PlanDate   time.Time
    DayPlanID  *uuid.UUID
    ClearDayPlan bool
    Source     *string
    Notes      *string
}
```

**List result**:
```go
type EmployeeDayPlanListResult struct {
    Plans      []model.EmployeeDayPlan
    NextCursor *uuid.UUID
}
```

**Methods** (10 total):

1. `List(ctx, input ListEmployeeDayPlanInput) (*EmployeeDayPlanListResult, error)` - Convert input to filter, call repo, determine next cursor from extra record
2. `Create(ctx, input CreateEmployeeDayPlanInput) (*model.EmployeeDayPlan, error)` - Validate employee/day plan exist and belong to tenant, set source default to "manual", create
3. `GetByID(ctx, id uuid.UUID) (*model.EmployeeDayPlan, error)` - Get by ID
4. `Update(ctx, id uuid.UUID, input UpdateEmployeeDayPlanInput) (*model.EmployeeDayPlan, error)` - Get existing, apply partial updates, validate day plan if changed, save
5. `Delete(ctx, id uuid.UUID) error` - Delete by ID
6. `BulkCreate(ctx, input BulkCreateEmployeeDayPlanInput) (int, error)` - Validate all employees/day plans, build models, call BulkCreate, return count
7. `DeleteRange(ctx, input DeleteRangeInput) (int, error)` - Validate employee exists, call DeleteRange, return count
8. `GetForEmployee(ctx, employeeID uuid.UUID, from, to time.Time) ([]model.EmployeeDayPlan, error)` - Validate employee, call GetForEmployeeDateRange
9. `GetForEmployeeDate(ctx, employeeID uuid.UUID, date time.Time) (*model.EmployeeDayPlan, error)` - Call GetForEmployeeDate
10. `UpsertForEmployeeDate(ctx, input UpsertEmployeeDayPlanInput) (*model.EmployeeDayPlan, error)` - Build model, call Upsert, return result

**Key validation logic in Create**:
- Validate employee exists and belongs to tenant
- Validate day plan exists and belongs to tenant (if provided)
- Default source to "manual" if not provided
- Validate source is one of: tariff, manual, holiday

### Success Criteria:

#### Automated Verification:
- [x] `cd apps/api && go build ./...` compiles
- [x] `cd apps/api && go test ./internal/service/...` passes

---

## Phase 6: Employee Day Plan Handler

### Overview
Create the HTTP handler layer implementing all 10 endpoints from the OpenAPI spec. Each handler method parses the request, calls the service, and formats the response using generated models.

### Changes Required:

#### 1. Create handler file
**File**: `apps/api/internal/handler/employeedayplan.go`

**Handler struct**:
```go
type EmployeeDayPlanHandler struct {
    empDayPlanService *service.EmployeeDayPlanService
}

func NewEmployeeDayPlanHandler(s *service.EmployeeDayPlanService) *EmployeeDayPlanHandler {
    return &EmployeeDayPlanHandler{empDayPlanService: s}
}
```

**Methods** (10 total, matching OpenAPI operationIds):

1. **`List`** (`GET /employee-day-plans`)
   - Parse query params: employee_id, from, to, source, limit, cursor
   - Call service.List
   - Return `EmployeeDayPlanList` with items and next_cursor
   - Map employee day plan models to generated response models

2. **`Create`** (`POST /employee-day-plans`)
   - Decode `models.CreateEmployeeDayPlanRequest`
   - Validate with `req.Validate(nil)`
   - Map to `service.CreateEmployeeDayPlanInput`
   - Return 201 with created plan
   - Map errors: ErrEmpDayPlanConflict → 409, validation errors → 400

3. **`BulkCreate`** (`POST /employee-day-plans/bulk`)
   - Decode `models.BulkCreateEmployeeDayPlanRequest`
   - Map each plan entry to service input
   - Return `{"created": N}` (since BulkCreate uses upsert semantics, all are created/updated)

4. **`DeleteRange`** (`POST /employee-day-plans/delete-range`)
   - Decode `models.DeleteRangeRequest`
   - Validate required fields (employee_id, from, to)
   - Return `{"deleted": N}`

5. **`Get`** (`GET /employee-day-plans/{id}`)
   - Parse UUID from path
   - Return plan or 404

6. **`Update`** (`PUT /employee-day-plans/{id}`)
   - Parse UUID from path
   - Decode `models.UpdateEmployeeDayPlanRequest`
   - Use raw JSON to detect explicit null for `day_plan_id` (ClearDayPlan flag)
   - Return updated plan or 404

7. **`Delete`** (`DELETE /employee-day-plans/{id}`)
   - Parse UUID from path
   - Return 204 or 404

8. **`GetForEmployee`** (`GET /employees/{employee_id}/day-plans`)
   - Parse employee_id from path, from/to from required query params
   - Return `EmployeeDayPlanList`

9. **`GetForEmployeeDate`** (`GET /employees/{employee_id}/day-plans/{date}`)
   - Parse employee_id and date from path
   - Return plan or 404

10. **`UpsertForEmployeeDate`** (`PUT /employees/{employee_id}/day-plans/{date}`)
    - Parse employee_id and date from path
    - Decode `models.UpdateEmployeeDayPlanRequest`
    - Return upserted plan

**Response mapping helper**:
```go
func mapEmployeeDayPlanToResponse(plan *model.EmployeeDayPlan) *models.EmployeeDayPlan {
    // Map domain model to generated response model
    // Include nested DayPlan if preloaded
}
```

### Success Criteria:

#### Automated Verification:
- [x] `cd apps/api && go build ./...` compiles

---

## Phase 7: Route Registration & Wiring

### Overview
Register the `employee_day_plans.manage` permission, add route registration functions, and wire everything in main.go.

### Changes Required:

#### 1. Add permission
**File**: `apps/api/internal/permissions/permissions.go`

Add to `allPermissions` slice:
```go
{ID: permissionID("employee_day_plans.manage"), Resource: "employee_day_plans", Action: "manage", Description: "Manage employee day plans"},
```

#### 2. Add route registration function
**File**: `apps/api/internal/handler/routes.go`

```go
// RegisterEmployeeDayPlanRoutes registers employee day plan routes.
func RegisterEmployeeDayPlanRoutes(r chi.Router, h *EmployeeDayPlanHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("employee_day_plans.manage").String()
    r.Route("/employee-day-plans", func(r chi.Router) {
        if authz == nil {
            r.Get("/", h.List)
            r.Post("/", h.Create)
            r.Post("/bulk", h.BulkCreate)
            r.Post("/delete-range", h.DeleteRange)
            r.Get("/{id}", h.Get)
            r.Put("/{id}", h.Update)
            r.Delete("/{id}", h.Delete)
            return
        }
        r.With(authz.RequirePermission(permManage)).Get("/", h.List)
        r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
        r.With(authz.RequirePermission(permManage)).Post("/bulk", h.BulkCreate)
        r.With(authz.RequirePermission(permManage)).Post("/delete-range", h.DeleteRange)
        r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
        r.With(authz.RequirePermission(permManage)).Put("/{id}", h.Update)
        r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
    })
}

// RegisterEmployeeDayPlanNestedRoutes registers employee-nested day plan routes.
// These must be called within the /employees route group.
func RegisterEmployeeDayPlanNestedRoutes(r chi.Router, h *EmployeeDayPlanHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("employee_day_plans.manage").String()
    if authz == nil {
        r.Get("/{employee_id}/day-plans", h.GetForEmployee)
        r.Get("/{employee_id}/day-plans/{date}", h.GetForEmployeeDate)
        r.Put("/{employee_id}/day-plans/{date}", h.UpsertForEmployeeDate)
        return
    }
    r.With(authz.RequirePermission(permManage)).Get("/{employee_id}/day-plans", h.GetForEmployee)
    r.With(authz.RequirePermission(permManage)).Get("/{employee_id}/day-plans/{date}", h.GetForEmployeeDate)
    r.With(authz.RequirePermission(permManage)).Put("/{employee_id}/day-plans/{date}", h.UpsertForEmployeeDate)
}
```

The nested routes need to be registered inside the `/employees` route group in `RegisterEmployeeRoutes` (or alongside it). Check how other nested routes (contacts, cards) are registered at `routes.go:256-261`.

#### 3. Wire in main.go
**File**: `apps/api/cmd/server/main.go`

Add after existing service/handler initializations:

```go
// Employee Day Plan
empDayPlanService := service.NewEmployeeDayPlanService(empDayPlanRepo, dayPlanRepo, employeeRepo)
empDayPlanHandler := handler.NewEmployeeDayPlanHandler(empDayPlanService)
```

Register routes in the protected router group:

```go
handler.RegisterEmployeeDayPlanRoutes(r, empDayPlanHandler, authzMiddleware)
handler.RegisterEmployeeDayPlanNestedRoutes(r, empDayPlanHandler, authzMiddleware)
```

Note: The nested routes (`/employees/{employee_id}/day-plans`) need to be registered at the `/employees` path level. Check `routes.go` for where employee nested routes are currently registered and add the day plan nested routes there.

#### 4. Add dev seed data permission
**File**: `apps/api/internal/auth/devusers.go` (or wherever dev permissions are seeded)

Add `employee_day_plans.manage` to the dev user's permission set so the Swagger UI works in dev mode.

### Success Criteria:

#### Automated Verification:
- [x] `cd apps/api && go build ./...` compiles
- [x] `cd apps/api && go test ./...` passes
- [x] `make lint` passes

#### Manual Verification:
- [ ] `GET /employee-day-plans` returns 200 with empty list
- [ ] `POST /employee-day-plans` creates a plan and returns 201
- [ ] `GET /employees/{id}/day-plans?from=2026-01-01&to=2026-01-31` returns plans
- [ ] `GET /employees/{id}/day-plans/2026-01-15` returns plan for that date
- [ ] `PUT /employees/{id}/day-plans/2026-01-15` upserts a plan
- [ ] All endpoints return 401 without valid auth

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation.

---

## Phase 8: Service Tests

### Overview
Add tests for the new and modified service functionality.

### Changes Required:

#### 1. Week plan completeness tests
**File**: `apps/api/internal/service/weekplan_test.go`

```go
func TestWeekPlanService_Create_IncompleteWeekPlan(t *testing.T) {
    // Create week plan with nil Sunday
    // Assert error is ErrWeekPlanIncomplete
}

func TestWeekPlanService_Update_ClearDayMakesIncomplete(t *testing.T) {
    // Create complete week plan
    // Update with ClearMondayDayPlan = true
    // Assert error is ErrWeekPlanIncomplete
}
```

#### 2. Rhythm start date tests
**File**: `apps/api/internal/service/tariff_test.go`

```go
func TestTariffService_Create_RollingWithoutStartDate(t *testing.T) {
    // Create tariff with rolling_weekly and nil rhythm_start_date
    // Assert error is ErrRhythmStartDateRequired
}

func TestTariffService_Create_XDaysWithoutStartDate(t *testing.T) {
    // Create tariff with x_days and nil rhythm_start_date
    // Assert error is ErrRhythmStartDateRequired
}
```

#### 3. Employee day plan service tests
**File**: `apps/api/internal/service/employeedayplan_test.go`

Test cases:
- `TestEmployeeDayPlanService_Create_Success` - valid input creates plan
- `TestEmployeeDayPlanService_Create_InvalidEmployee` - non-existent employee returns error
- `TestEmployeeDayPlanService_Create_InvalidDayPlan` - non-existent day plan returns error
- `TestEmployeeDayPlanService_Create_DefaultSourceManual` - omitted source defaults to "manual"
- `TestEmployeeDayPlanService_GetByID_NotFound` - returns ErrEmpDayPlanNotFound
- `TestEmployeeDayPlanService_Update_PartialUpdate` - only updates provided fields
- `TestEmployeeDayPlanService_Update_ClearDayPlan` - setting ClearDayPlan makes it an off day
- `TestEmployeeDayPlanService_List_WithFilters` - filters by employee_id, date range, source
- `TestEmployeeDayPlanService_List_Pagination` - cursor-based pagination works
- `TestEmployeeDayPlanService_BulkCreate_Success` - bulk creates plans
- `TestEmployeeDayPlanService_DeleteRange_Success` - deletes plans in range
- `TestEmployeeDayPlanService_GetForEmployee_DateRange` - returns plans for employee in range
- `TestEmployeeDayPlanService_GetForEmployeeDate_Success` - returns plan for specific date
- `TestEmployeeDayPlanService_UpsertForEmployeeDate_Creates` - creates when no existing plan
- `TestEmployeeDayPlanService_UpsertForEmployeeDate_Updates` - updates existing plan

### Success Criteria:

#### Automated Verification:
- [x] `cd apps/api && go test -v -count=1 ./internal/service/...` - All new tests pass
- [x] `cd apps/api && go test -race ./...` - No race conditions
- [x] `make lint` passes

---

## Testing Strategy

### Unit Tests:
- Week plan completeness validation (Phase 8)
- Rhythm start date validation (Phase 8)
- Employee day plan service CRUD (Phase 8)
- Employee day plan service filtering and pagination (Phase 8)

### Manual Testing Steps:
1. Start dev environment with `make dev`
2. Apply migrations with `make migrate-up`
3. Open Swagger UI at `/swagger/`
4. Create a day plan via `POST /day-plans`
5. Create a week plan with all 7 days via `POST /week-plans` - verify success
6. Try to create a week plan with missing days - verify 400 error
7. Create an employee day plan via `POST /employee-day-plans` - verify 201
8. List employee day plans via `GET /employee-day-plans` - verify response
9. Get plans for employee via `GET /employees/{id}/day-plans?from=...&to=...`
10. Upsert plan via `PUT /employees/{id}/day-plans/2026-02-01`
11. Bulk create plans via `POST /employee-day-plans/bulk`
12. Delete range via `POST /employee-day-plans/delete-range`

## Performance Considerations

- List endpoint uses `LIMIT + 1` pattern for cursor pagination (no COUNT query)
- BulkCreate uses batched inserts (100 per batch) via existing repository method
- All queries are tenant-scoped with indexed columns
- DayPlan preloading includes Breaks and Bonuses (existing pattern)

## Migration Notes

- No database migration needed - all tables and columns already exist
- Only code changes (service, handler, routes, permissions)

## References

- Ticket: `thoughts/shared/tickets/ZMI-TICKET-005-time-plan-framework.md`
- Research: `thoughts/shared/research/2026-01-29-ZMI-TICKET-005-time-plan-framework.md`
- ZMI Manual Reference: `thoughts/shared/reference/zmi-calculation-manual-reference.md` (Sections 11, 14)
- Employee Day Plan Model: `apps/api/internal/model/employeedayplan.go`
- Employee Day Plan Repository: `apps/api/internal/repository/employeedayplan.go`
- Week Plan Service: `apps/api/internal/service/weekplan.go`
- Tariff Service: `apps/api/internal/service/tariff.go`
- Tariff Model (rhythm resolution): `apps/api/internal/model/tariff.go:268-323`
- Permissions: `apps/api/internal/permissions/permissions.go`
- Routes: `apps/api/internal/handler/routes.go`
- Main wiring: `apps/api/cmd/server/main.go`
- OpenAPI paths: `api/paths/employee-day-plans.yaml`
- OpenAPI schemas: `api/schemas/employee-day-plans.yaml`
- Generated models: `apps/api/gen/models/employee_day_plan*.go`
- Handler pattern reference: `apps/api/internal/handler/weekplan.go`
- Service pattern reference: `apps/api/internal/service/weekplan.go`
