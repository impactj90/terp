# ZMI-TICKET-004: Personnel Master Data Coverage - Implementation Plan

## Overview

Extend the existing Employee entity with all fields required by the ZMI Time personnel master data specification. The employee model already has core identity, organizational, and contact support. This plan covers: personal data fields (address, birth data, gender, nationality, religion, marital status), exit reason/notes, tariff-related override fields (target hours, part-time percent, disability flag, work days per week), calculation start date, photo URL, PIN auto-assignment logic, exit-date enforcement, and group lookup tables (employee group, workflow group, activity group).

## Current State Analysis (Verified 2026-01-29)

**IMPORTANT**: Phases 1-7 have already been implemented. This plan documents the completed work and identifies the remaining gaps that need to be addressed.

The Employee entity is fully established with:
- **Model**: `apps/api/internal/model/employee.go` - Full struct with 50+ fields including all ZMI-TICKET-004 extended fields
- **Repository**: `apps/api/internal/repository/employee.go` - Full CRUD, list with group filters, search, contacts, cards, NextPIN
- **Service**: `apps/api/internal/service/employee.go` - All extended fields in Create/Update inputs, PIN auto-assignment, tariff sync
- **Handler**: `apps/api/internal/handler/employee.go` - Complete HTTP layer with all extended field mapping and raw JSON null handling
- **OpenAPI**: `api/schemas/employees.yaml` + `api/paths/employees.yaml` - All fields including groups, target hours, personal data
- **Routes**: `apps/api/internal/handler/routes.go` - Permission-gated employee routes + group routes registered
- **Migrations**: 000011 (employees), 000012 (contacts), 000013 (cards), 000014 (user links), 000031 (tariff_id), **000041 (extended master data + groups)**
- **Group Models**: `apps/api/internal/model/group.go` - EmployeeGroup, WorkflowGroup, ActivityGroup
- **Group CRUD**: Handler, service, repository, routes, and permissions for all three group types
- **Tests**: Service tests for extended fields create/update, PIN auto-assignment, clear birth date

### Key Discoveries (Verified Against Code):
- All extended employee fields exist at `model/employee.go:30-62` including address, personal data, groups, tariff overrides
- PIN auto-assignment is implemented at `service/employee.go:149-157` using `NextPIN` repository method
- `IsEmployed()` helper at `model/employee.go:92` checks exit date but is **NOT enforced in booking creation** (`service/booking.go:92` has no exit date check)
- `DayPlan.GetEffectiveRegularHours()` at `model/dayplan.go:141` supports `employeeTargetMinutes` but **daily_calc.go does NOT pass employee's DailyTargetHours** (uses `RegularHours` directly at lines 295, 340, and 859 in `buildCalcInput`)
- `CalculationStartDate` field exists at `model/employee.go:62` but has **no business logic** to auto-set/manage it
- Handler tests (`handler/employee_test.go`) do **NOT** cover extended fields (grep returns no matches)
- Service tests cover extended fields (`service/employee_test.go:854-995`) for create, update, and clear birth date
- Gender check constraint in migration allows empty string: `gender IS NULL OR gender = '' OR gender IN (...)`

## Desired End State

After this plan is complete:
1. [DONE] Employee records store all ZMI Personalstamm fields (personal data, address, tariff overrides, groups, photo URL)
2. [DONE] PIN auto-assignment works when PIN is omitted on create (generates unique numeric PIN within tenant)
3. [REMAINING] Exit date blocks booking creation for dates after the exit date
4. [DONE] Group lookup tables (employee_group, workflow_group, activity_group) are available as FK targets with full CRUD
5. [DONE] All new fields are exposed via the API with full CRUD support
6. [DONE] OpenAPI spec, generated models, domain models, and all layers are consistent
7. [PARTIAL] Existing tests continue to pass; new tests cover added fields and business rules
8. [REMAINING] `from_employee_master` day plan integration passes employee's DailyTargetHours to daily calculation
9. [REMAINING] Calculation start date has basic auto-management logic

### Verification:
- `make test` passes with all new and existing tests
- `make swagger-bundle && make generate` produces updated models
- `make migrate-up` applies migration 000041
- API returns all new fields in employee GET responses
- POST/PUT endpoints accept all new fields

## What We're NOT Doing

1. **Default order and default activity fields** - Depend on ZMI-TICKET-017 (Auftrag module) which is not yet implemented.
2. **Weekly/monthly macro assignments with execution day** - Complex feature requiring macro infrastructure; separate ticket.
3. **Contact type validation against configured contact types** - Requires Contact Management configuration entity (separate system settings ticket).
4. **Photo file upload/storage** - Only `photo_url` metadata field is stored; actual file upload is a separate concern.
5. **Frontend (web app) changes** - Backend only.
6. **Absence day creation and calculation** - Explicitly out of scope per ticket.

## Implementation Approach

Phases 1-7 are **ALREADY COMPLETED**. The remaining work focuses on:
- Phase 8: Exit date enforcement in booking service
- Phase 9: `from_employee_master` integration in daily calculation
- Phase 10: Calculation start date management
- Phase 11: Handler-level tests for extended fields

---

## Phase 1: Database Migration [COMPLETED]

### Overview
Migration 000041 adds all missing employee columns and creates group lookup tables.

### Status: DONE

**File**: `db/migrations/000041_extend_employee_master_data.up.sql`

Changes applied:
- Created `employee_groups`, `workflow_groups`, `activity_groups` tables (UUID PK, tenant-scoped, code+name, unique tenant+code)
- Added 23 columns to `employees` table: exit_reason, notes, address fields (4), personal data fields (8), photo_url, group FKs (3), tariff override fields (7), calculation_start_date
- Added check constraints: `chk_employee_gender` (male/female/diverse/not_specified), `chk_employee_marital_status` (single/married/divorced/widowed/registered_partnership/not_specified)
- Added indexes: `idx_employees_employee_group`, `idx_employees_workflow_group`, `idx_employees_activity_group`
- Added PostgreSQL column comments for ZMI-specific fields

### Verification: PASSED
- Migration applies cleanly
- Down migration (`000041_extend_employee_master_data.down.sql`) drops all columns and tables

---

## Phase 2: OpenAPI Spec Updates [COMPLETED]

### Overview
Extended OpenAPI schemas and paths for all new employee fields and group entity CRUD.

### Status: DONE

**Files modified**:
- `api/schemas/employees.yaml` - All extended fields in Employee, CreateEmployeeRequest (PIN no longer required), UpdateEmployeeRequest
- `api/schemas/groups.yaml` - EmployeeGroup, WorkflowGroup, ActivityGroup, CreateGroupRequest, UpdateGroupRequest
- `api/paths/employees.yaml` - No path changes needed (existing CRUD handles new fields)
- `api/paths/groups.yaml` - CRUD paths for `/employee-groups`, `/workflow-groups`, `/activity-groups`

Key schema changes:
- `Employee` response: 23 new properties including group relation expansions
- `CreateEmployeeRequest`: `pin` moved from required to optional (auto-assigned if empty)
- `UpdateEmployeeRequest`: All new fields as optional with group FK null support
- Gender enum: `male | female | diverse | not_specified`
- Marital status enum: `single | married | divorced | widowed | registered_partnership | not_specified`

### Verification: PASSED
- `make swagger-bundle` succeeds
- `make generate` produces updated models in `apps/api/gen/models/`

---

## Phase 3: Domain Model Updates [COMPLETED]

### Overview
Go domain models include all new database columns.

### Status: DONE

**Files**:
- `apps/api/internal/model/employee.go` - Employee struct with all 50+ fields including extended data, group relations
- `apps/api/internal/model/group.go` - EmployeeGroup, WorkflowGroup, ActivityGroup structs

### Verification: PASSED
- All model fields match database columns 1:1
- GORM tags match migration column types

---

## Phase 4: Repository Layer [COMPLETED]

### Overview
Extended employee repository with group filters, NextPIN, and group repository CRUD.

### Status: DONE

**Files**:
- `apps/api/internal/repository/employee.go` - EmployeeFilter with EmployeeGroupID, WorkflowGroupID, ActivityGroupID, HasExitDate; NextPIN method; GetWithDetails preloads all groups
- `apps/api/internal/repository/group.go` - Full CRUD for all three group types

Key implementation:
- `NextPIN(ctx, tenantID)` at line 232: queries `MAX(pin::integer)` where pin matches `'^[0-9]+$'`, returns max+1 as string (starts at "1" for empty tenant)
- `List` filters by group IDs via `WHERE employee_group_id = ?` etc.
- `GetWithDetails` preloads `EmployeeGroup`, `WorkflowGroup`, `ActivityGroup`

### Verification: PASSED

---

## Phase 5: Service Layer [COMPLETED]

### Overview
Extended service with all input fields, PIN auto-assignment, and group service CRUD.

### Status: DONE

**Files**:
- `apps/api/internal/service/employee.go` - CreateEmployeeInput (31 fields), UpdateEmployeeInput (34 fields + 4 Clear flags), PIN auto-assignment logic
- `apps/api/internal/service/group.go` - GroupService with CRUD for all three types

Key implementations:
- PIN auto-assignment at `employee.go:149-157`: calls `NextPIN`, falls back to `ErrPINRequired` on failure
- Create maps all extended fields with `strings.TrimSpace` and `decimal.NewFromFloat` conversions
- Update uses pointer-based partial update pattern with `Clear*` booleans for FK fields
- `ErrEmployeeExited` sentinel error defined at line 34

### Verification: PASSED

---

## Phase 6: Handler Layer [COMPLETED]

### Overview
Employee handler maps all extended fields. Group handler provides full CRUD.

### Status: DONE

**Files**:
- `apps/api/internal/handler/employee.go` - Create and Update handle all extended fields including raw JSON null detection for group FKs
- `apps/api/internal/handler/group.go` - GroupHandler with List/Create/Get/Update/Delete for all three types

Key patterns:
- Create handler: maps string fields directly, parses UUID fields with error handling, converts `time.Time(req.BirthDate)`, checks `!= 0` for decimal fields
- Update handler: uses `raw["field_name"]` check for explicit field presence, handles `"null"` for FK clearing

### Verification: PASSED

---

## Phase 7: Route Registration and Wiring [COMPLETED]

### Overview
Group routes registered with permission gating. All wired in main.go.

### Status: DONE

**Files**:
- `apps/api/internal/handler/routes.go` - `RegisterGroupRoutes` at line 603 using shared `registerGroupCRUD` helper for all three types under `groups.manage` permission
- `apps/api/internal/permissions/permissions.go` - `groups.manage` permission registered
- `apps/api/cmd/server/main.go` - GroupRepository, GroupService, GroupHandler wired and registered

### Verification: PASSED

---

## Phase 8: Exit Date Enforcement in Booking Service [REMAINING]

### Overview
The ticket requires "Exit date blocks bookings after exit date." The `BookingService.Create` method at `service/booking.go:92` currently does NOT check if the employee has exited. The `IsEmployed()` method exists on the model but is never called during booking creation.

### Changes Required:

#### 1. Add employee lookup to BookingService
**File**: `apps/api/internal/service/booking.go`

The BookingService needs access to the employee repository to check exit date. Add an employee lookup interface:

```go
type bookingEmployeeLookup interface {
    GetByID(ctx context.Context, id uuid.UUID) (*model.Employee, error)
}
```

Add to BookingService struct and constructor:

```go
type BookingService struct {
    // ... existing fields ...
    employeeLookup bookingEmployeeLookup
}
```

#### 2. Add exit date check in Create
**File**: `apps/api/internal/service/booking.go`

In the `Create` method (line 92), add after the existing month-closed check:

```go
// Check employee exit date
emp, err := s.employeeLookup.GetByID(ctx, input.EmployeeID)
if err != nil {
    return nil, fmt.Errorf("employee not found: %w", err)
}
if emp.ExitDate != nil && input.BookingDate.After(*emp.ExitDate) {
    return nil, ErrEmployeeExited
}
```

Import `ErrEmployeeExited` from the employee service package, or define a booking-specific error:

```go
var ErrBookingAfterExitDate = errors.New("cannot create booking after employee exit date")
```

#### 3. Update handler error mapping
**File**: `apps/api/internal/handler/booking.go`

Add error case in the Create handler's error switch:

```go
case service.ErrBookingAfterExitDate:
    respondError(w, http.StatusBadRequest, "Cannot create booking after employee exit date")
```

#### 4. Wire employee repo into BookingService
**File**: `apps/api/cmd/server/main.go`

The current constructor call is at line 120:
```go
bookingService := service.NewBookingService(bookingRepo, bookingTypeRepo, recalcService, nil)
```

Update to pass the employee repository as the 5th argument:
```go
bookingService := service.NewBookingService(bookingRepo, bookingTypeRepo, recalcService, nil,
    employeeRepo, // NEW: for exit date checks
)
```

### Success Criteria:

#### Automated Verification:
- [ ] `cd apps/api && go build ./...` compiles
- [ ] `cd apps/api && go test ./internal/service/...` passes
- [ ] New test: booking creation for date after exit date returns error

#### Manual Verification:
- [ ] Set employee exit date to yesterday, try to create booking for today - should fail
- [ ] Set employee exit date to tomorrow, try to create booking for today - should succeed

**Implementation Note**: After completing this phase, pause for manual confirmation before proceeding.

---

## Phase 9: from_employee_master Integration in Daily Calculation [REMAINING]

### Overview
The `DayPlan.FromEmployeeMaster` field and `GetEffectiveRegularHours(isAbsenceDay, employeeTargetMinutes)` method exist (model/dayplan.go:72, 141), but the daily calculation service does NOT pass the employee's `DailyTargetHours` value. There are three locations in `service/daily_calc.go` where `RegularHours` is accessed directly instead of calling `GetEffectiveRegularHours`:
1. **Line 295** in `handleHolidayCredit`: `targetTime = empDayPlan.DayPlan.RegularHours`
2. **Line 340** in `handleNoBookings`: `targetTime = empDayPlan.DayPlan.RegularHours`
3. **Line 859** in `buildCalcInput`: `RegularHours: dp.RegularHours` (passed into the calculation engine input struct)

### Changes Required:

#### 1. Add employee lookup to DailyCalcService
**File**: `apps/api/internal/service/daily_calc.go`

Add an employee lookup interface:

```go
type calcEmployeeLookup interface {
    GetByID(ctx context.Context, id uuid.UUID) (*model.Employee, error)
}
```

Add to DailyCalcService struct and constructor:

```go
type DailyCalcService struct {
    // ... existing fields ...
    employeeLookup  calcEmployeeLookup
}
```

#### 2. Load employee and compute target minutes
**File**: `apps/api/internal/service/daily_calc.go`

In the `CalculateDay` method, after loading the employee day plan (step 2), load the employee record to get `DailyTargetHours`:

```go
// Load employee for target hours override (from_employee_master)
var employeeTargetMinutes *int
employee, err := s.employeeLookup.GetByID(ctx, employeeID)
if err == nil && employee.DailyTargetHours != nil {
    minutes := int(employee.DailyTargetHours.Mul(decimal.NewFromInt(60)).IntPart())
    employeeTargetMinutes = &minutes
}
```

Store `employeeTargetMinutes` and pass it through to all three call sites below.

#### 3. Replace direct RegularHours access with GetEffectiveRegularHours
**File**: `apps/api/internal/service/daily_calc.go`

**Location A** - `handleHolidayCredit` (line 295):
```go
// Before:
targetTime = empDayPlan.DayPlan.RegularHours
// After:
targetTime = empDayPlan.DayPlan.GetEffectiveRegularHours(false, employeeTargetMinutes)
```

**Location B** - `handleNoBookings` (line 340):
```go
// Before:
targetTime = empDayPlan.DayPlan.RegularHours
// After:
targetTime = empDayPlan.DayPlan.GetEffectiveRegularHours(false, employeeTargetMinutes)
```

**Location C** - `buildCalcInput` (line 859):
```go
// Before:
RegularHours: dp.RegularHours,
// After:
RegularHours: dp.GetEffectiveRegularHours(false, employeeTargetMinutes),
```

Note: The `isAbsenceDay` parameter is passed as `false` for now. When the absence service integration (ZMI-TICKET-132-137) is implemented, this parameter will need to be determined from the absence context and passed through.

The `handleHolidayCredit`, `handleNoBookings`, and `buildCalcInput` method signatures will need to accept `employeeTargetMinutes *int` as an additional parameter.

#### 4. Wire employee repo into DailyCalcService
**File**: `apps/api/cmd/server/main.go`

The current constructor call is at line 115:
```go
dailyCalcService := service.NewDailyCalcService(bookingRepo, empDayPlanRepo, dayPlanRepo, dailyValueRepo, holidayRepo)
```

Update to pass the employee repository as the 6th argument:
```go
dailyCalcService := service.NewDailyCalcService(bookingRepo, empDayPlanRepo, dayPlanRepo, dailyValueRepo, holidayRepo,
    employeeRepo, // NEW: for from_employee_master target hours
)
```

### Success Criteria:

#### Automated Verification:
- [ ] `cd apps/api && go build ./...` compiles
- [ ] `cd apps/api && go test ./internal/service/...` passes
- [ ] Existing daily calculation tests still pass (they don't set FromEmployeeMaster)

#### Manual Verification:
- [ ] Create a day plan with `from_employee_master = true` and `regular_hours = 480`
- [ ] Create an employee with `daily_target_hours = 6.0` (360 minutes)
- [ ] Assign the day plan to the employee via tariff
- [ ] Calculate a day and verify target is 360 minutes (not 480)

---

## Phase 10: Calculation Start Date Management [REMAINING]

### Overview
The ticket states "Calculation start date (Berechne ab) is system-managed and not manually editable by normal users." The field exists in the model and database but has no business logic. This phase adds the auto-management logic.

### Changes Required:

#### 1. Set calculation_start_date on employee creation
**File**: `apps/api/internal/service/employee.go`

In the `Create` method, after setting all fields and before calling `employeeRepo.Create`:

```go
// Auto-set calculation_start_date to entry_date if not explicitly provided
if emp.CalculationStartDate == nil {
    emp.CalculationStartDate = &emp.EntryDate
}
```

#### 2. Prevent manual editing via normal update
**File**: `apps/api/internal/handler/employee.go`

The Update handler should NOT map `calculation_start_date` from the request body. It is system-managed. The field is already excluded from UpdateEmployeeInput (it's not in the update input struct). Verify this is the case.

If it needs to be settable by admin users in the future, add a separate admin-only endpoint.

#### 3. Update calculation_start_date when tariff changes
**File**: `apps/api/internal/service/employee.go`

In the tariff sync flow, optionally update the calculation start date to the tariff's effective date if earlier than the current calculation start date. This is a future enhancement and can be deferred.

### Success Criteria:

#### Automated Verification:
- [ ] New employee created via API has `calculation_start_date` set to `entry_date`
- [ ] Updating employee does not change `calculation_start_date`
- [ ] `cd apps/api && go test ./internal/service/...` passes

#### Manual Verification:
- [ ] Create employee, verify calculation_start_date equals entry_date in GET response
- [ ] Update employee fields, verify calculation_start_date unchanged

---

## Phase 11: Handler-Level Tests for Extended Fields [REMAINING]

### Overview
The handler test file (`handler/employee_test.go`) does NOT cover extended fields. Service tests exist for extended fields but handler tests are needed for full coverage.

### Changes Required:

#### 1. Test Create with Extended Fields
**File**: `apps/api/internal/handler/employee_test.go`

```go
func TestEmployeeHandler_Create_WithExtendedFields(t *testing.T) {
    // Setup using existing setupEmployeeHandler pattern
    // Create employee with address, gender, birth_date, disability_flag, target hours
    // Verify HTTP 201 response
    // Verify response body contains all extended fields
}
```

#### 2. Test Update with Extended Fields
**File**: `apps/api/internal/handler/employee_test.go`

```go
func TestEmployeeHandler_Update_ExtendedFields(t *testing.T) {
    // Create base employee
    // Update with extended fields via PUT
    // Verify updated fields in response
}
```

#### 3. Test Update with Group FK Null Clearing
**File**: `apps/api/internal/handler/employee_test.go`

```go
func TestEmployeeHandler_Update_ClearGroupIDs(t *testing.T) {
    // Create employee with group IDs set
    // Send PUT with "employee_group_id": null
    // Verify group ID is cleared in response
}
```

#### 4. Test Create without PIN (Auto-Assignment)
**File**: `apps/api/internal/handler/employee_test.go`

```go
func TestEmployeeHandler_Create_PINAutoAssigned(t *testing.T) {
    // Create employee without PIN in request body
    // Verify HTTP 201 response
    // Query employee via service to verify PIN is set (hidden in JSON response)
}
```

#### 5. Test Exit Date Booking Enforcement (after Phase 8)
**File**: `apps/api/internal/handler/booking_test.go` or `service/booking_test.go`

```go
func TestBookingCreate_AfterExitDate_Rejected(t *testing.T) {
    // Create employee with exit_date = yesterday
    // Try to create booking for today
    // Verify error response
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `cd apps/api && go test -v -count=1 ./internal/handler/...` - All new tests pass
- [ ] `cd apps/api && go test -v -count=1 ./internal/service/...` - All tests pass
- [ ] `cd apps/api && go test -race ./...` - No race conditions
- [ ] `make lint` passes

#### Manual Verification:
- [ ] Full API round-trip: create employee with all fields, read back, verify all fields present
- [ ] PIN auto-assignment: create employee without PIN, verify PIN assigned
- [ ] Exit date enforcement: set exit date, try to create booking after it, verify rejection

---

## Testing Strategy

### Unit Tests (Existing - DONE):
- `TestEmployeeService_Create_WithExtendedFields` - all new fields correctly stored and retrieved
- `TestEmployeeService_Update_ExtendedFields` - updating extended fields works
- `TestEmployeeService_Update_ClearBirthDate` - clearing nullable date field works
- `TestEmployeeService_Create_EmptyPIN_AutoAssigns` - PIN auto-assignment generates unique PIN

### Unit Tests (Remaining):
- Exit date enforcement: bookings after exit date are rejected (Phase 8)
- from_employee_master: daily calc uses employee target hours when flag is set (Phase 9)
- Calculation start date: auto-set on create, immutable on update (Phase 10)
- Handler coverage: Create/Update with extended fields via HTTP (Phase 11)

### Integration Tests (Remaining):
- Full employee lifecycle: create with all fields, update fields, read back, deactivate
- Cross-service: daily calculation respects employee exit date
- Tariff override fields: daily_target_hours used when FromEmployeeMaster is active
- Vacation calculation: work_days_per_week and disability_flag affect vacation entitlement

### Manual Testing Steps:
1. Start dev environment with `make dev`
2. Verify migration already applied with `make migrate-up`
3. Create employee via Swagger UI with all new fields
4. Verify all fields in GET response
5. Update specific fields and verify partial update works
6. Create employee without PIN and verify auto-assignment
7. Set exit date and verify booking creation is blocked after that date (after Phase 8)
8. Create group entities and assign to employee
9. Test from_employee_master with daily calculation (after Phase 9)

## Performance Considerations

- New columns are all nullable and do not affect existing query performance
- No new JOINs in the List query (group FKs only loaded in GetWithDetails)
- `NextPIN` query uses MAX on numeric cast; for very large datasets (10000+ employees per tenant), consider a sequence table approach
- New indexes on group FK columns are lightweight (UUID, mostly NULL initially)
- Employee lookup in booking service adds one DB query per booking creation

## Migration Notes

- Migration 000041 is additive only (ALTER TABLE ADD COLUMN + CREATE TABLE); no data migration needed
- All new columns are nullable; existing employee records are unaffected
- PIN column remains NOT NULL in the database; only the API/service layer allows empty input (with auto-assignment)
- `ErrPINRequired` sentinel error is kept but only raised when auto-assignment fails
- Gender and marital_status check constraints allow empty strings for backwards compatibility

## Dependencies

- **ZMI-TICKET-001** (Mandant master data) - DONE: Tenant model exists with all required fields
- **ZMI-TICKET-017** (Auftrag module) - DEFERRED: default order/activity fields not added
- **Contact Management configuration** - DEFERRED: contact type validation against configured types

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-004-personnel-master-data.md`
- Research document: `thoughts/shared/research/2026-01-29-ZMI-TICKET-004-personnel-master-data.md`
- ZMI Reference: `thoughts/shared/reference/zmi-calculation-manual-reference.md` (Sections 13, 14)
- Employee model: `apps/api/internal/model/employee.go`
- Employee service: `apps/api/internal/service/employee.go`
- Employee handler: `apps/api/internal/handler/employee.go`
- Employee repository: `apps/api/internal/repository/employee.go`
- Group model: `apps/api/internal/model/group.go`
- Booking service: `apps/api/internal/service/booking.go`
- Daily calc service: `apps/api/internal/service/daily_calc.go`
- Day plan model (GetEffectiveRegularHours): `apps/api/internal/model/dayplan.go:141`
- Migration: `db/migrations/000041_extend_employee_master_data.up.sql`
- OpenAPI: `api/schemas/employees.yaml`, `api/paths/employees.yaml`
- Service tests: `apps/api/internal/service/employee_test.go`
- Handler tests: `apps/api/internal/handler/employee_test.go`
