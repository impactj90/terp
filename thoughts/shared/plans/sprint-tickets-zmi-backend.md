# ZMI Backend - Sprint Tickets

Small, atomic tickets for LLM implementation. Each ticket is self-contained and testable.

**Reference**: `2025-12-13-zmi-backend.md` for full context

---

## Sprint 1: Multi-Tenant Foundation

### TICKET-001: Create Tenants Migration
**Type**: Migration
**Effort**: XS
**Dependencies**: None

Create `db/migrations/000002_create_tenants.up.sql` and `.down.sql`:
- `tenants` table: id (UUID PK), name, slug (unique), settings (JSONB), is_active, created_at, updated_at
- Index on slug

**Acceptance**:
- `make migrate-up` succeeds
- `make migrate-down` succeeds

---

### TICKET-002: Create Tenant Model
**Type**: Model
**Effort**: XS
**Dependencies**: TICKET-001

Create `apps/api/internal/model/tenant.go`:
- Tenant struct with GORM tags matching migration
- TableName() method

**Acceptance**:
- Compiles without errors
- `make lint` passes

---

### TICKET-003: Create Tenant Repository
**Type**: Repository
**Effort**: S
**Dependencies**: TICKET-002

Create `apps/api/internal/repository/tenant.go`:
- TenantRepository interface
- tenantRepository struct with *gorm.DB
- Methods: Create, GetByID, GetBySlug, Update, List, Delete

**Acceptance**:
- `make test` passes
- `make lint` passes

---

### TICKET-004: Create Tenant Service
**Type**: Service
**Effort**: S
**Dependencies**: TICKET-003

Create `apps/api/internal/service/tenant.go`:
- TenantService interface
- tenantService struct with TenantRepository
- Methods: Create (validate slug uniqueness), GetByID, GetBySlug, Update, List, Delete

**Acceptance**:
- `make test` passes

---

### TICKET-005: Create Tenant Handler
**Type**: Handler
**Effort**: S
**Dependencies**: TICKET-004

Create `apps/api/internal/handler/tenant.go`:
- TenantHandler struct
- Methods: List, Get, Create, Update, Delete
- JSON request/response handling
- Standard error responses

**Acceptance**:
- `make lint` passes

---

### TICKET-006: Register Tenant Routes
**Type**: Routes
**Effort**: XS
**Dependencies**: TICKET-005

Modify `apps/api/internal/handler/routes.go`:
- Add tenant routes: GET/POST /api/v1/tenants, GET/PUT/DELETE /api/v1/tenants/{id}
- Wire up TenantHandler

**Acceptance**:
- `curl localhost:8080/api/v1/tenants` returns 200

---

### TICKET-007: Create Tenant Middleware
**Type**: Middleware
**Effort**: S
**Dependencies**: TICKET-004

Create `apps/api/internal/middleware/tenant.go`:
- Extract tenant from JWT claims or X-Tenant-ID header
- Set tenant in request context
- Helper: TenantFromContext(ctx)

**Acceptance**:
- `make test` passes

---

## Sprint 2: Reference Tables

### TICKET-008: Create Holidays Migration
**Type**: Migration
**Effort**: XS
**Dependencies**: TICKET-001

Create `db/migrations/000003_create_holidays.up.sql`:
- `holidays` table: id, tenant_id (FK), holiday_date, name, is_half_day, applies_to_all

**Acceptance**:
- Migration applies/rolls back

---

### TICKET-009: Create Holiday Model + Repository
**Type**: Model/Repository
**Effort**: S
**Dependencies**: TICKET-008

Create `apps/api/internal/model/holiday.go` and `apps/api/internal/repository/holiday.go`:
- Holiday struct
- CRUD + GetByDateRange(tenantID, from, to)

**Acceptance**:
- Compiles, lints

---

### TICKET-010: Create Cost Centers Migration
**Type**: Migration
**Effort**: XS
**Dependencies**: TICKET-001

Create `db/migrations/000004_create_cost_centers.up.sql`:
- `cost_centers` table: id, tenant_id, code (unique per tenant), name, is_active

**Acceptance**:
- Migration applies/rolls back

---

### TICKET-011: Create Cost Center Model + Repository
**Type**: Model/Repository
**Effort**: S
**Dependencies**: TICKET-010

Create `apps/api/internal/model/costcenter.go` and repository:
- CostCenter struct
- CRUD + ListActive(tenantID)

---

### TICKET-012: Create Employment Types Migration
**Type**: Migration
**Effort**: XS
**Dependencies**: TICKET-001

Create `db/migrations/000005_create_employment_types.up.sql`:
- `employment_types` table: id, tenant_id, code, name, weekly_hours_default

---

### TICKET-013: Create Employment Type Model + Repository
**Type**: Model/Repository
**Effort**: S
**Dependencies**: TICKET-012

Create model and repository for EmploymentType.

---

### TICKET-014: Create Accounts Migration
**Type**: Migration
**Effort**: XS
**Dependencies**: TICKET-001

Create `db/migrations/000006_create_accounts.up.sql`:
- `accounts` table: id, tenant_id, code, name, account_type (bonus/tracking), unit (minutes/days)

---

### TICKET-015: Create Account Model + Repository
**Type**: Model/Repository
**Effort**: S
**Dependencies**: TICKET-014

Create model and repository for Account (time tracking accounts like flextime, overtime).

---

## Sprint 3: User Groups & Permissions

### TICKET-016: Create User Groups Migration
**Type**: Migration
**Effort**: XS
**Dependencies**: TICKET-001

Create `db/migrations/000007_create_user_groups.up.sql`:
- `user_groups` table: id, tenant_id, name, permissions (JSONB)

---

### TICKET-017: Create User Group Model + Repository
**Type**: Model/Repository
**Effort**: S
**Dependencies**: TICKET-016

Create UserGroup model and repository.

---

### TICKET-018: Alter Users for Multi-Tenancy Migration
**Type**: Migration
**Effort**: S
**Dependencies**: TICKET-016

Create `db/migrations/000008_alter_users_multitenancy.up.sql`:
- Add columns: tenant_id, user_group_id, employee_id (nullable), username, is_active, deleted_at
- Add foreign keys
- Note: employee_id FK added later

**Acceptance**:
- Migration applies on existing users table

---

### TICKET-019: Update User Model for Multi-Tenancy
**Type**: Model
**Effort**: S
**Dependencies**: TICKET-018

Modify `apps/api/internal/model/user.go`:
- Add TenantID, UserGroupID, EmployeeID, Username, IsActive, DeletedAt fields
- Add relationships

---

### TICKET-020: Update User Repository for Tenant Scoping
**Type**: Repository
**Effort**: S
**Dependencies**: TICKET-019

Modify `apps/api/internal/repository/user.go`:
- All queries must include tenant_id filter
- Add GetByUsername(tenantID, username)

---

## Sprint 4: Organization Structure

### TICKET-021: Create Departments Migration
**Type**: Migration
**Effort**: XS
**Dependencies**: TICKET-001

Create `db/migrations/000009_create_departments.up.sql`:
- `departments` table: id, tenant_id, parent_id (self-ref FK), code, name, is_active

---

### TICKET-022: Create Department Model
**Type**: Model
**Effort**: S
**Dependencies**: TICKET-021

Create `apps/api/internal/model/department.go`:
- Department struct with Parent/Children relationships
- Support hierarchical queries

---

### TICKET-023: Create Department Repository
**Type**: Repository
**Effort**: S
**Dependencies**: TICKET-022

Create repository with:
- CRUD methods
- GetHierarchy(tenantID) - returns tree structure
- GetChildren(departmentID)

---

### TICKET-024: Create Department Service + Handler
**Type**: Service/Handler
**Effort**: M
**Dependencies**: TICKET-023

Create service and handler:
- Validate parent exists (if set)
- Prevent circular references
- API: GET/POST/PUT/DELETE /api/v1/departments

---

### TICKET-025: Create Teams Migration
**Type**: Migration
**Effort**: XS
**Dependencies**: TICKET-021

Create `db/migrations/000010_create_teams.up.sql`:
- `teams` table: id, tenant_id, department_id (FK), name, leader_employee_id (nullable)
- `team_members` table: team_id, employee_id (composite PK)

---

### TICKET-026: Create Team Model + Repository
**Type**: Model/Repository
**Effort**: S
**Dependencies**: TICKET-025

Create Team model with Members relationship and repository.

---

## Sprint 5: Employees

### TICKET-027: Create Employees Migration
**Type**: Migration
**Effort**: S
**Dependencies**: TICKET-021

Create `db/migrations/000011_create_employees.up.sql`:
```sql
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    personnel_number VARCHAR(50) NOT NULL,
    pin VARCHAR(20) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    entry_date DATE NOT NULL,
    exit_date DATE,
    department_id UUID REFERENCES departments(id),
    cost_center_id UUID REFERENCES cost_centers(id),
    employment_type_id UUID REFERENCES employment_types(id),
    weekly_hours DECIMAL(5,2),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(tenant_id, personnel_number),
    UNIQUE(tenant_id, pin)
);
```

---

### TICKET-028: Create Employee Contacts Migration
**Type**: Migration
**Effort**: XS
**Dependencies**: TICKET-027

Create `db/migrations/000012_create_employee_contacts.up.sql`:
- `employee_contacts` table: id, employee_id (FK), contact_type, value, is_primary

---

### TICKET-029: Create Employee Cards Migration
**Type**: Migration
**Effort**: XS
**Dependencies**: TICKET-027

Create `db/migrations/000013_create_employee_cards.up.sql`:
- `employee_cards` table: id, employee_id (FK), card_number, valid_from, valid_to, is_active

---

### TICKET-030: Link Users to Employees Migration
**Type**: Migration
**Effort**: XS
**Dependencies**: TICKET-027, TICKET-018

Create `db/migrations/000014_link_users_employees.up.sql`:
- Add FK constraint: users.employee_id REFERENCES employees(id)

---

### TICKET-031: Create Employee Model
**Type**: Model
**Effort**: S
**Dependencies**: TICKET-027

Create `apps/api/internal/model/employee.go`:
- Employee struct with all fields
- EmployeeContact, EmployeeCard embedded structs
- Relationships to Department, CostCenter, EmploymentType

---

### TICKET-032: Create Employee Repository
**Type**: Repository
**Effort**: M
**Dependencies**: TICKET-031

Create `apps/api/internal/repository/employee.go`:
- CRUD methods with tenant scoping
- Search(tenantID, query) - search by name, personnel_number
- ListWithFilters(tenantID, departmentID, isActive, pagination)
- GetByPersonnelNumber, GetByPIN

---

### TICKET-033: Create Employee Service
**Type**: Service
**Effort**: M
**Dependencies**: TICKET-032

Create `apps/api/internal/service/employee.go`:
- Create (validate unique personnel_number, PIN)
- Update
- Deactivate (soft delete, check for active bookings)
- GetDetails (with contacts, cards)

---

### TICKET-034: Create Employee Handler
**Type**: Handler
**Effort**: M
**Dependencies**: TICKET-033

Create `apps/api/internal/handler/employee.go`:
- GET /api/v1/employees - list with pagination, search
- POST /api/v1/employees - create
- GET /api/v1/employees/{id} - details with contacts/cards
- PUT /api/v1/employees/{id} - update
- DELETE /api/v1/employees/{id} - deactivate

---

## Sprint 6: Day Plans

### TICKET-035: Create Day Plans Migration
**Type**: Migration
**Effort**: S
**Dependencies**: TICKET-001

Create `db/migrations/000015_create_day_plans.up.sql`:
```sql
CREATE TABLE day_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    code VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    plan_type VARCHAR(20) NOT NULL, -- 'fixed', 'flextime'
    come_from INT, come_to INT, go_from INT, go_to INT,
    regular_hours INT NOT NULL DEFAULT 480,
    tolerance_come_plus INT, tolerance_come_minus INT,
    tolerance_go_plus INT, tolerance_go_minus INT,
    rounding_come_type VARCHAR(20), rounding_come_interval INT,
    rounding_go_type VARCHAR(20), rounding_go_interval INT,
    min_work_time INT,
    max_net_work_time INT,
    is_active BOOLEAN DEFAULT true,
    UNIQUE(tenant_id, code)
);
```
All time values in minutes from midnight.

---

### TICKET-036: Create Day Plan Breaks Migration
**Type**: Migration
**Effort**: XS
**Dependencies**: TICKET-035

Create `db/migrations/000016_create_day_plan_breaks.up.sql`:
- `day_plan_breaks` table: id, day_plan_id (FK), break_type (fixed/variable/minimum), start_time, end_time, duration, after_work_minutes

---

### TICKET-037: Create Day Plan Bonuses Migration
**Type**: Migration
**Effort**: XS
**Dependencies**: TICKET-035, TICKET-014

Create `db/migrations/000017_create_day_plan_bonuses.up.sql`:
- `day_plan_bonuses` table: id, day_plan_id (FK), account_id (FK), time_from, time_to, value_minutes, calculation_type

---

### TICKET-038: Create Day Plan Model
**Type**: Model
**Effort**: S
**Dependencies**: TICKET-035

Create `apps/api/internal/model/dayplan.go`:
- DayPlan struct
- DayPlanBreak struct
- DayPlanBonus struct
- Relationships

---

### TICKET-039: Create Day Plan Repository
**Type**: Repository
**Effort**: S
**Dependencies**: TICKET-038

Create repository with:
- CRUD with breaks/bonuses
- GetWithDetails(id) - preload breaks, bonuses
- Copy(id, newCode) - duplicate plan

---

### TICKET-040: Create Day Plan Service
**Type**: Service
**Effort**: M
**Dependencies**: TICKET-039

Create service:
- Validate time ranges (come_from < come_to, etc.)
- Validate breaks don't overlap
- Copy functionality

---

### TICKET-041: Create Day Plan Handler
**Type**: Handler
**Effort**: M
**Dependencies**: TICKET-040

Create handler:
- CRUD endpoints
- POST /api/v1/day-plans/{id}/copy

---

## Sprint 7: Week Plans

### TICKET-042: Create Week Plans Migration
**Type**: Migration
**Effort**: XS
**Dependencies**: TICKET-035

Create `db/migrations/000018_create_week_plans.up.sql`:
- `week_plans` table: id, tenant_id, code, name, monday_plan_id, tuesday_plan_id, ..., sunday_plan_id (all FK to day_plans)

---

### TICKET-043: Create Week Plan Model + Repository
**Type**: Model/Repository
**Effort**: S
**Dependencies**: TICKET-042

Create model with day plan relationships and repository.

---

### TICKET-044: Create Week Plan Service + Handler
**Type**: Service/Handler
**Effort**: S
**Dependencies**: TICKET-043

Create service (validate all day plans exist) and handler with CRUD.

---

## Sprint 8: Tariffs

### TICKET-045: Create Tariffs Migration
**Type**: Migration
**Effort**: S
**Dependencies**: TICKET-042, TICKET-027

Create `db/migrations/000019_create_tariffs.up.sql`:
```sql
CREATE TABLE tariffs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id),
    valid_from DATE NOT NULL,
    valid_to DATE,
    tariff_type VARCHAR(20) NOT NULL, -- 'week', 'rolling', 'rhythm'
    week_plan_id UUID REFERENCES week_plans(id),
    rhythm_days INT, -- for X-day rhythms
    is_current BOOLEAN DEFAULT false
);
```

---

### TICKET-046: Create Tariff Day Plans Migration
**Type**: Migration
**Effort**: XS
**Dependencies**: TICKET-045

Create `db/migrations/000020_create_tariff_day_plans.up.sql`:
- `tariff_day_plans` table: tariff_id, day_index (0-based), day_plan_id

---

### TICKET-047: Create Tariff Model + Repository
**Type**: Model/Repository
**Effort**: M
**Dependencies**: TICKET-046

Create model with relationships and repository:
- GetCurrentForEmployee(employeeID, date)
- GetPlanForDate(tariffID, date) - resolve actual day plan

---

### TICKET-048: Create Tariff Service
**Type**: Service
**Effort**: M
**Dependencies**: TICKET-047

Create service:
- Create tariff with validation
- ApplyToRange(employeeID, from, to) - generate employee_day_plans
- Handle tariff transitions

---

### TICKET-049: Create Tariff Handler
**Type**: Handler
**Effort**: S
**Dependencies**: TICKET-048

Create handler:
- GET/POST /api/v1/employees/{id}/tariffs
- POST /api/v1/employees/{id}/tariffs/{tariffId}/apply

---

## Sprint 9: Booking Types

### TICKET-050: Create Booking Types Migration
**Type**: Migration
**Effort**: S
**Dependencies**: TICKET-001

Create `db/migrations/000021_create_booking_types.up.sql`:
```sql
CREATE TABLE booking_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id), -- NULL for system types
    code VARCHAR(10) NOT NULL,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(20) NOT NULL, -- 'come', 'go', 'break_start', 'break_end', 'manual'
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true
);

-- Seed system types
INSERT INTO booking_types (code, name, category, is_system) VALUES
('A1', 'Come', 'come', true),
('A2', 'Go', 'go', true),
('PA', 'Break Start', 'break_start', true),
('PE', 'Break End', 'break_end', true);
```

---

### TICKET-051: Create Booking Type Model + Repository
**Type**: Model/Repository
**Effort**: S
**Dependencies**: TICKET-050

Create model and repository:
- GetSystemTypes()
- GetByCode(tenantID, code)

---

## Sprint 10: Bookings

### TICKET-052: Create Bookings Migration
**Type**: Migration
**Effort**: S
**Dependencies**: TICKET-050, TICKET-027

Create `db/migrations/000022_create_bookings.up.sql`:
```sql
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id),
    booking_date DATE NOT NULL,
    booking_type_id UUID NOT NULL REFERENCES booking_types(id),
    original_time INT NOT NULL,
    edited_time INT NOT NULL,
    calculated_time INT,
    pair_id UUID,
    source VARCHAR(20) DEFAULT 'web',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_bookings_employee_date ON bookings(employee_id, booking_date);
```

---

### TICKET-053: Create Booking Model
**Type**: Model
**Effort**: S
**Dependencies**: TICKET-052

Create `apps/api/internal/model/booking.go`:
- Booking struct
- Relationship to BookingType, Employee

---

### TICKET-054: Create Booking Repository
**Type**: Repository
**Effort**: M
**Dependencies**: TICKET-053

Create repository:
- CRUD with tenant scoping
- GetByEmployeeDate(employeeID, date)
- GetByEmployeeDateRange(employeeID, from, to)
- GetUnpaired(employeeID, date, category)

---

### TICKET-055: Create Employee Day Plans Migration
**Type**: Migration
**Effort**: XS
**Dependencies**: TICKET-035, TICKET-027

Create `db/migrations/000023_create_employee_day_plans.up.sql`:
- `employee_day_plans` table: id, tenant_id, employee_id, plan_date, day_plan_id, source (tariff/manual)

---

### TICKET-056: Create Employee Day Plan Model + Repository
**Type**: Model/Repository
**Effort**: S
**Dependencies**: TICKET-055

Create model and repository:
- GetForEmployeeDate(employeeID, date)
- BulkCreate for tariff application

---

## Sprint 11: Daily Values

### TICKET-057: Create Daily Values Migration
**Type**: Migration
**Effort**: S
**Dependencies**: TICKET-027

Create `db/migrations/000024_create_daily_values.up.sql`:
```sql
CREATE TABLE daily_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    value_date DATE NOT NULL,
    gross_time INT DEFAULT 0,
    net_time INT DEFAULT 0,
    target_time INT DEFAULT 0,
    overtime INT DEFAULT 0,
    undertime INT DEFAULT 0,
    break_time INT DEFAULT 0,
    has_error BOOLEAN DEFAULT false,
    error_codes TEXT[],
    calculated_at TIMESTAMPTZ,
    UNIQUE(employee_id, value_date)
);
```

---

### TICKET-058: Create Daily Value Model + Repository
**Type**: Model/Repository
**Effort**: S
**Dependencies**: TICKET-057

Create model and repository:
- Upsert(dailyValue)
- GetByEmployeeDateRange(employeeID, from, to)

---

## Sprint 12: Calculation Engine - Types

### TICKET-059: Create Calculation Package Structure
**Type**: Setup
**Effort**: XS
**Dependencies**: None

Create `apps/api/internal/calculation/` directory and `doc.go`:
```go
// Package calculation contains pure calculation logic for time tracking.
// All functions are pure - no database access, no side effects.
package calculation
```

---

### TICKET-060: Create Calculation Types
**Type**: Model
**Effort**: S
**Dependencies**: TICKET-059

Create `apps/api/internal/calculation/types.go`:
```go
type DailyCalcInput struct {
    Date        time.Time
    DayPlan     *DayPlanInput
    Bookings    []BookingInput
    Absence     *AbsenceInput
    IsHoliday   bool
}

type DayPlanInput struct {
    PlanType       string
    ComeFrom, ComeTo, GoFrom, GoTo int
    RegularHours   int
    Tolerances     ToleranceConfig
    Rounding       RoundingConfig
    Breaks         []BreakConfig
    MaxNetWorkTime int
}

type BookingInput struct {
    ID           uuid.UUID
    Category     string // come, go, break_start, break_end
    OriginalTime int
    EditedTime   int
}

type DailyCalcOutput struct {
    GrossTime   int
    NetTime     int
    TargetTime  int
    Overtime    int
    Undertime   int
    BreakTime   int
    HasError    bool
    ErrorCodes  []string
    PairedBookings []BookingPair
}
```

---

## Sprint 13: Calculation Engine - Booking Logic

### TICKET-061: Create Booking Pairing Logic
**Type**: Calculation
**Effort**: M
**Dependencies**: TICKET-060

Create `apps/api/internal/calculation/pairing.go`:
- PairBookings(bookings []BookingInput) ([]BookingPair, []string)
- Match A1↔A2, PA↔PE
- Return unpaired as errors

**Test cases**:
- Normal day: A1 08:00, A2 17:00 → 1 pair
- With breaks: A1, PA, PE, A2 → work pair + break pair
- Missing go: A1 only → error "MISSING_GO"

---

### TICKET-062: Create Tolerance Logic
**Type**: Calculation
**Effort**: M
**Dependencies**: TICKET-060

Create `apps/api/internal/calculation/tolerance.go`:
- ApplyTolerance(time int, expected int, tolerancePlus int, toleranceMinus int) int
- If come is within tolerance of expected, snap to expected

**Test cases**:
- Come 07:55, expected 08:00, tolerance 5min → 08:00
- Come 07:50, expected 08:00, tolerance 5min → 07:50 (outside)

---

### TICKET-063: Create Rounding Logic
**Type**: Calculation
**Effort**: M
**Dependencies**: TICKET-060

Create `apps/api/internal/calculation/rounding.go`:
- ApplyRounding(time int, roundingType string, interval int) int
- Types: "none", "up", "down", "nearest"

**Test cases**:
- 08:07, round up to 15min → 08:15
- 17:07, round down to 15min → 17:00
- 08:07, round nearest to 15min → 08:00

---

## Sprint 14: Calculation Engine - Break Logic

### TICKET-064: Create Fixed Break Deduction
**Type**: Calculation
**Effort**: S
**Dependencies**: TICKET-060

Create `apps/api/internal/calculation/breaks.go`:
- DeductFixedBreaks(grossTime int, breaks []BreakConfig) (netTime int, breakTime int)
- Fixed breaks always deducted if work overlaps break window

---

### TICKET-065: Create Variable Break Deduction
**Type**: Calculation
**Effort**: M
**Dependencies**: TICKET-064

Add to `breaks.go`:
- DeductVariableBreaks(grossTime int, breaks []BreakConfig, actualBreaks []BookingPair) (netTime int, breakTime int)
- Use actual breaks if available, else deduct configured duration

---

### TICKET-066: Create Minimum Break Enforcement
**Type**: Calculation
**Effort**: S
**Dependencies**: TICKET-064

Add to `breaks.go`:
- EnforceMinimumBreak(grossTime int, actualBreakTime int, minBreakConfig []BreakConfig) int
- If worked > threshold and break < minimum, deduct minimum

**Test case**:
- Worked 7h, break 20min, minimum 30min after 6h → deduct additional 10min

---

## Sprint 15: Calculation Engine - Daily Calculation

### TICKET-067: Create Gross Time Calculation
**Type**: Calculation
**Effort**: S
**Dependencies**: TICKET-061

Create `apps/api/internal/calculation/gross.go`:
- CalculateGrossTime(pairs []BookingPair) int
- Sum all work pair durations

---

### TICKET-068: Create Daily Calculator
**Type**: Calculation
**Effort**: L
**Dependencies**: TICKET-062, TICKET-063, TICKET-064, TICKET-065, TICKET-066, TICKET-067

Create `apps/api/internal/calculation/daily.go`:
```go
func CalculateDay(input DailyCalcInput) DailyCalcOutput {
    // 1. Check holiday/absence → return credited hours
    // 2. Pair bookings
    // 3. Apply tolerance
    // 4. Apply rounding
    // 5. Calculate gross time
    // 6. Deduct breaks
    // 7. Apply caps
    // 8. Calculate overtime/undertime
    // 9. Generate errors
}
```

**Test cases**:
- Normal fixed day
- Flextime day
- Holiday
- Absence
- Missing booking error

---

### TICKET-069: Create Error Detection
**Type**: Calculation
**Effort**: M
**Dependencies**: TICKET-068

Create `apps/api/internal/calculation/errors.go`:
- DetectErrors(input DailyCalcInput, output DailyCalcOutput) []string
- Error codes: MISSING_COME, MISSING_GO, OVERLAPPING_BOOKINGS, EXCEEDED_MAX_TIME, CAME_BEFORE_ALLOWED, LEFT_AFTER_ALLOWED

---

## Sprint 16: Daily Calculation Service

### TICKET-070: Create Daily Calculation Service
**Type**: Service
**Effort**: L
**Dependencies**: TICKET-068, TICKET-054, TICKET-056, TICKET-058

Create `apps/api/internal/service/daily_calc.go`:
- CalculateDay(employeeID, date) - orchestrates:
  1. Load day plan from employee_day_plans
  2. Load bookings
  3. Load absence
  4. Check holiday
  5. Call calculation.CalculateDay
  6. Persist daily_values
  7. Update account values (future)

---

### TICKET-071: Create Recalculation Trigger Service
**Type**: Service
**Effort**: M
**Dependencies**: TICKET-070

Create `apps/api/internal/service/recalc.go`:
- TriggerRecalc(employeeID, date)
- Called when booking/absence changes
- Can batch recalculate range

---

## Sprint 17: Booking Service & Handler

### TICKET-072: Create Booking Service
**Type**: Service
**Effort**: M
**Dependencies**: TICKET-054, TICKET-071

Create `apps/api/internal/service/booking.go`:
- Create(booking) - validate, create, trigger recalc
- Update(booking) - validate, update, trigger recalc
- Delete(bookingID) - delete, trigger recalc
- GetDayView(employeeID, date) - bookings + daily values

---

### TICKET-073: Create Booking Handler
**Type**: Handler
**Effort**: M
**Dependencies**: TICKET-072

Create `apps/api/internal/handler/booking.go`:
- GET /api/v1/bookings?employee_id=&from=&to=
- POST /api/v1/bookings
- PUT /api/v1/bookings/{id}
- DELETE /api/v1/bookings/{id}
- GET /api/v1/employees/{id}/day/{date}
- POST /api/v1/employees/{id}/day/{date}/calculate

---

## Sprint 18: Absence Types

### TICKET-074: Create Absence Types Migration
**Type**: Migration
**Effort**: S
**Dependencies**: TICKET-001

Create `db/migrations/000025_create_absence_types.up.sql`:
```sql
CREATE TABLE absence_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    code VARCHAR(10) NOT NULL,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(20) NOT NULL, -- 'vacation', 'illness', 'special'
    credits_hours BOOLEAN DEFAULT true,
    deducts_vacation BOOLEAN DEFAULT false,
    is_system BOOLEAN DEFAULT false,
    color VARCHAR(7) DEFAULT '#808080'
);

INSERT INTO absence_types (code, name, category, credits_hours, deducts_vacation, is_system) VALUES
('U', 'Vacation', 'vacation', true, true, true),
('K', 'Illness', 'illness', true, false, true),
('S', 'Special Leave', 'special', true, false, true);
```

---

### TICKET-075: Create Absence Type Model + Repository
**Type**: Model/Repository
**Effort**: S
**Dependencies**: TICKET-074

Create model and repository with GetByCode.

---

## Sprint 19: Absence Days

### TICKET-076: Create Absence Days Migration
**Type**: Migration
**Effort**: XS
**Dependencies**: TICKET-074, TICKET-027

Create `db/migrations/000026_create_absence_days.up.sql`:
```sql
CREATE TABLE absence_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL REFERENCES employees(id),
    absence_date DATE NOT NULL,
    absence_type_id UUID NOT NULL REFERENCES absence_types(id),
    duration DECIMAL(3,2) DEFAULT 1.0, -- 0.5 for half day
    status VARCHAR(20) DEFAULT 'approved',
    notes TEXT,
    UNIQUE(employee_id, absence_date)
);
```

---

### TICKET-077: Create Absence Day Model + Repository
**Type**: Model/Repository
**Effort**: S
**Dependencies**: TICKET-076

Create model and repository:
- GetByEmployeeDateRange
- GetByDate(employeeID, date)
- CreateRange(employeeID, from, to, typeID)

---

### TICKET-078: Create Absence Service
**Type**: Service
**Effort**: M
**Dependencies**: TICKET-077, TICKET-071

Create service:
- CreateRange - create absence days for range, trigger recalc
- Delete - remove absence, trigger recalc
- Validate no duplicate dates

---

### TICKET-079: Create Absence Handler
**Type**: Handler
**Effort**: S
**Dependencies**: TICKET-078

Create handler:
- GET /api/v1/absence-types
- GET /api/v1/employees/{id}/absences
- POST /api/v1/employees/{id}/absences (create range)
- DELETE /api/v1/absences/{id}

---

## Sprint 20: Vacation Balance

### TICKET-080: Create Vacation Balances Migration
**Type**: Migration
**Effort**: XS
**Dependencies**: TICKET-027

Create `db/migrations/000027_create_vacation_balances.up.sql`:
```sql
CREATE TABLE vacation_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL REFERENCES employees(id),
    year INT NOT NULL,
    entitlement DECIMAL(5,2) NOT NULL,
    carryover DECIMAL(5,2) DEFAULT 0,
    adjustments DECIMAL(5,2) DEFAULT 0,
    taken DECIMAL(5,2) DEFAULT 0,
    UNIQUE(employee_id, year)
);
```

---

### TICKET-081: Create Vacation Balance Model + Repository
**Type**: Model/Repository
**Effort**: S
**Dependencies**: TICKET-080

Create model and repository:
- GetByEmployeeYear
- UpdateTaken(employeeID, year, amount)

---

### TICKET-082: Create Vacation Calculation Logic
**Type**: Calculation
**Effort**: M
**Dependencies**: TICKET-060

Create `apps/api/internal/calculation/vacation.go`:
- CalculateEntitlement(weeklyHours, entryDate, exitDate, year) float64
- Pro-rate for partial years
- Standard: 30 days for full-time

---

### TICKET-083: Create Vacation Service
**Type**: Service
**Effort**: M
**Dependencies**: TICKET-081, TICKET-082, TICKET-077

Create service:
- GetBalance(employeeID, year) - calculate available
- RecalculateTaken(employeeID, year) - count vacation absences

---

### TICKET-084: Add Vacation Balance Endpoint
**Type**: Handler
**Effort**: XS
**Dependencies**: TICKET-083

Add to absence handler:
- GET /api/v1/employees/{id}/vacation-balance?year=

---

## Sprint 21: Monthly Values

### TICKET-085: Create Monthly Values Migration
**Type**: Migration
**Effort**: S
**Dependencies**: TICKET-027

Create `db/migrations/000028_create_monthly_values.up.sql`:
```sql
CREATE TABLE monthly_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    year INT NOT NULL,
    month INT NOT NULL,
    total_gross_time INT DEFAULT 0,
    total_net_time INT DEFAULT 0,
    total_target_time INT DEFAULT 0,
    total_overtime INT DEFAULT 0,
    total_undertime INT DEFAULT 0,
    flextime_start INT DEFAULT 0,
    flextime_change INT DEFAULT 0,
    flextime_end INT DEFAULT 0,
    flextime_carryover INT DEFAULT 0,
    vacation_taken DECIMAL(5,2) DEFAULT 0,
    sick_days INT DEFAULT 0,
    work_days INT DEFAULT 0,
    is_closed BOOLEAN DEFAULT false,
    closed_at TIMESTAMPTZ,
    closed_by UUID,
    UNIQUE(employee_id, year, month)
);
```

---

### TICKET-086: Create Monthly Value Model + Repository
**Type**: Model/Repository
**Effort**: S
**Dependencies**: TICKET-085

Create model and repository:
- Upsert
- GetByEmployeeYearMonth
- GetPreviousMonth(employeeID, year, month)

---

### TICKET-087: Create Monthly Evaluation Migration
**Type**: Migration
**Effort**: XS
**Dependencies**: TICKET-001

Create `db/migrations/000029_create_monthly_evaluations.up.sql`:
- `monthly_evaluations` table: id, tenant_id, name, flextime_cap_positive, flextime_cap_negative, overtime_threshold

---

### TICKET-088: Create Monthly Evaluation Model + Repository
**Type**: Model/Repository
**Effort**: S
**Dependencies**: TICKET-087

Create model and repository.

---

## Sprint 22: Monthly Calculation

### TICKET-089: Create Monthly Aggregation Logic
**Type**: Calculation
**Effort**: M
**Dependencies**: TICKET-060

Create `apps/api/internal/calculation/monthly.go`:
```go
type MonthlyCalcInput struct {
    DailyValues     []DailyValue
    PreviousCarryover int
    EvaluationRules *MonthlyEvaluation
}

func CalculateMonth(input MonthlyCalcInput) MonthlyCalcOutput
```
- Aggregate daily values
- Apply flextime caps
- Calculate carryover

---

### TICKET-090: Create Monthly Calculation Service
**Type**: Service
**Effort**: L
**Dependencies**: TICKET-089, TICKET-086, TICKET-058

Create `apps/api/internal/service/monthly_calc.go`:
- CalculateMonth(employeeID, year, month)
- RecalculateMonth(employeeID, year, month)
- CloseMonth(employeeID, year, month) - prevent further changes
- ReopenMonth(employeeID, year, month) - admin only

---

### TICKET-091: Create Month Closing Handler
**Type**: Handler
**Effort**: M
**Dependencies**: TICKET-090

Create `apps/api/internal/handler/monthclosing.go`:
- GET /api/v1/employees/{id}/monthly-values?year=&month=
- POST /api/v1/employees/{id}/calculate-month
- POST /api/v1/month-closing/close - batch close
- POST /api/v1/month-closing/reopen

---

## Sprint 23: Corrections

### TICKET-092: Create Corrections Migration
**Type**: Migration
**Effort**: XS
**Dependencies**: TICKET-027

Create `db/migrations/000030_create_corrections.up.sql`:
```sql
CREATE TABLE corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    correction_date DATE NOT NULL,
    error_code VARCHAR(50) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'open', -- open, resolved, ignored
    resolved_at TIMESTAMPTZ,
    resolved_by UUID
);
```

---

### TICKET-093: Create Correction Model + Repository
**Type**: Model/Repository
**Effort**: S
**Dependencies**: TICKET-092

Create model and repository:
- GetOpen(tenantID) - list unresolved
- GetByEmployee(employeeID)
- Resolve(id, resolvedBy)

---

### TICKET-094: Create Correction Service
**Type**: Service
**Effort**: S
**Dependencies**: TICKET-093, TICKET-069

Create service:
- CreateFromErrors(employeeID, date, errorCodes) - auto-create from calculation
- Resolve(id, resolvedBy)
- GetDashboard(tenantID) - summary counts

---

### TICKET-095: Create Correction Handler
**Type**: Handler
**Effort**: S
**Dependencies**: TICKET-094

Create handler:
- GET /api/v1/corrections
- PUT /api/v1/corrections/{id}/resolve
- PUT /api/v1/corrections/{id}/ignore

---

## Sprint 24: Account Values

### TICKET-096: Create Account Values Migration
**Type**: Migration
**Effort**: XS
**Dependencies**: TICKET-014, TICKET-027

Create `db/migrations/000031_create_account_values.up.sql`:
```sql
CREATE TABLE account_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    account_id UUID NOT NULL REFERENCES accounts(id),
    value_date DATE NOT NULL,
    value_minutes INT DEFAULT 0,
    source VARCHAR(20), -- daily_calc, manual, bonus
    UNIQUE(employee_id, account_id, value_date)
);
```

---

### TICKET-097: Create Account Value Model + Repository
**Type**: Model/Repository
**Effort**: S
**Dependencies**: TICKET-096

Create model and repository:
- GetByEmployeeAccountDateRange
- Upsert
- GetBalance(employeeID, accountID, asOfDate)

---

### TICKET-098: Create Account Service
**Type**: Service
**Effort**: M
**Dependencies**: TICKET-097

Create service:
- UpdateFromDailyCalc - update overtime/flextime accounts
- GetBalances(employeeID) - all account balances
- ManualAdjustment(employeeID, accountID, date, amount)

---

## Sprint 25: Audit Log

### TICKET-099: Create Audit Log Migration
**Type**: Migration
**Effort**: XS
**Dependencies**: TICKET-001

Create `db/migrations/000032_create_audit_log.up.sql`:
```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL, -- create, update, delete
    old_values JSONB,
    new_values JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
```

---

### TICKET-100: Create Audit Log Model + Repository
**Type**: Model/Repository
**Effort**: S
**Dependencies**: TICKET-099

Create model and repository:
- Create(log)
- GetByEntity(entityType, entityID)
- List with filters

---

### TICKET-101: Create Audit Middleware
**Type**: Middleware
**Effort**: M
**Dependencies**: TICKET-100

Create `apps/api/internal/middleware/audit.go`:
- AuditMiddleware that logs entity changes
- Helper: AuditCreate, AuditUpdate, AuditDelete

---

### TICKET-102: Create Audit Log Handler
**Type**: Handler
**Effort**: S
**Dependencies**: TICKET-100

Create handler:
- GET /api/v1/audit-log?entity_type=&entity_id=&from=&to=

---

## Sprint 26: Reports

### TICKET-103: Create Report Generator Base
**Type**: Service
**Effort**: S
**Dependencies**: None

Create `apps/api/internal/report/generator.go`:
- ReportGenerator interface
- Base report metadata (title, date range, generated_at)

---

### TICKET-104: Create Monthly Time Report
**Type**: Service
**Effort**: M
**Dependencies**: TICKET-103, TICKET-086, TICKET-058

Create `apps/api/internal/report/monthly.go`:
- Generate monthly timesheet for employee
- Include daily breakdown, totals, flextime

---

### TICKET-105: Create Absence Statistics Report
**Type**: Service
**Effort**: M
**Dependencies**: TICKET-103, TICKET-077

Create `apps/api/internal/report/absence.go`:
- Absence statistics by type, department
- Date range filtering

---

### TICKET-106: Create Vacation List Report
**Type**: Service
**Effort**: S
**Dependencies**: TICKET-103, TICKET-081

Create `apps/api/internal/report/vacation.go`:
- List all employees with vacation balances
- Filter by department

---

### TICKET-107: Create Report Handler
**Type**: Handler
**Effort**: M
**Dependencies**: TICKET-104, TICKET-105, TICKET-106

Create `apps/api/internal/handler/report.go`:
- GET /api/v1/reports/monthly-timesheet?employee_id=&year=&month=
- GET /api/v1/reports/absence-statistics?from=&to=
- GET /api/v1/reports/vacation-list?year=

---

## Sprint 27: Payroll Export

### TICKET-108: Create Payroll Exports Migration
**Type**: Migration
**Effort**: XS
**Dependencies**: TICKET-001

Create `db/migrations/000033_create_payroll_exports.up.sql`:
```sql
CREATE TABLE payroll_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    year INT NOT NULL,
    month INT NOT NULL,
    format VARCHAR(20) NOT NULL,
    file_path TEXT,
    employee_count INT,
    exported_at TIMESTAMPTZ DEFAULT NOW(),
    exported_by UUID
);
```

---

### TICKET-109: Create Payroll Export Model + Repository
**Type**: Model/Repository
**Effort**: S
**Dependencies**: TICKET-108

Create model and repository.

---

### TICKET-110: Create Payroll Export Service
**Type**: Service
**Effort**: M
**Dependencies**: TICKET-109, TICKET-086

Create `apps/api/internal/service/payroll.go`:
- GenerateExport(tenantID, year, month, format)
- Formats: JSON, CSV
- Only exports closed months

---

### TICKET-111: Create Payroll Export Handler
**Type**: Handler
**Effort**: S
**Dependencies**: TICKET-110

Create handler:
- POST /api/v1/payroll/export
- GET /api/v1/payroll/exports

---

## Sprint 28: Integration & Testing

### TICKET-112: Integration Test - Employee Lifecycle
**Type**: Test
**Effort**: M
**Dependencies**: TICKET-034

Create integration test:
- Create tenant
- Create department
- Create employee
- Verify relationships

---

### TICKET-113: Integration Test - Day Plan Configuration
**Type**: Test
**Effort**: M
**Dependencies**: TICKET-041

Create integration test:
- Create day plan with breaks
- Create week plan
- Assign tariff to employee

---

### TICKET-114: Integration Test - Booking & Calculation
**Type**: Test
**Effort**: L
**Dependencies**: TICKET-073

Create integration test:
- Create bookings for employee/date
- Trigger calculation
- Verify daily values

---

### TICKET-115: Integration Test - Monthly Closing
**Type**: Test
**Effort**: M
**Dependencies**: TICKET-091

Create integration test:
- Create month of bookings
- Calculate month
- Close month
- Verify cannot modify closed month

---

### TICKET-116: Integration Test - Vacation Workflow
**Type**: Test
**Effort**: M
**Dependencies**: TICKET-084

Create integration test:
- Set vacation entitlement
- Create vacation absences
- Verify balance updated

---

---

## Summary

**Total Tickets**: 116
**By Type**:
- Migrations: 33
- Models: ~30
- Repositories: ~30
- Services: ~25
- Handlers: ~15
- Calculation: ~12
- Tests: 5
- Setup: 1

**Effort Distribution**:
- XS (1-2 hours): ~40 tickets
- S (2-4 hours): ~45 tickets
- M (4-8 hours): ~25 tickets
- L (1-2 days): ~6 tickets

**Recommended Parallel Tracks**:
1. **Migrations track**: Can run ahead, one LLM does all migrations in sequence
2. **Models track**: Follows migrations, minimal dependencies
3. **Calculation track**: Independent, pure functions
4. **Integration track**: Services + handlers, after foundation complete
