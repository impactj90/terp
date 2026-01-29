# ZMI-TICKET-004: Personnel Master Data Coverage - Implementation Plan

## Overview

Extend the existing Employee entity with all fields required by the ZMI Time personnel master data specification. The employee model already has core identity, organizational, and contact support. This plan adds: personal data fields (address, birth data, gender, nationality, religion, marital status), exit reason/notes, tariff-related override fields (target hours, part-time percent, disability flag, work days per week), calculation start date, photo URL, and PIN auto-assignment logic. It also adds exit-date enforcement in the booking flow and group lookup tables (employee group, workflow group, activity group).

## Current State Analysis

The Employee entity is already well-established with:
- **Model**: `apps/api/internal/model/employee.go` - Core struct with identity, org FKs, hours, vacation, soft delete
- **Repository**: `apps/api/internal/repository/employee.go` - Full CRUD, list with filters, search, contacts, cards
- **Service**: `apps/api/internal/service/employee.go` - Validation, uniqueness checks, tariff sync, deactivation
- **Handler**: `apps/api/internal/handler/employee.go` - Complete HTTP layer with generated model mapping
- **OpenAPI**: `api/schemas/employees.yaml` + `api/paths/employees.yaml` - Full spec with Swagger 2.0
- **Routes**: `apps/api/internal/handler/routes.go` - Permission-gated routes registered
- **Migrations**: 000011 (employees table), 000012 (contacts), 000013 (cards), 000014 (user links), 000031 (tariff_id)
- **Tests**: Service, handler, and repository tests exist

### Key Discoveries:
- Employee struct at `apps/api/internal/model/employee.go:11` has 22 fields; needs ~20 more
- PIN is currently required (`json:"-"`, hidden from JSON); auto-assignment if empty is NOT implemented
- `IsEmployed()` helper at `model/employee.go:54` checks exit date but is NOT enforced in booking creation
- Service at `service/employee.go:106` validates required fields but has no address/personal data validation
- OpenAPI schema at `api/schemas/employees.yaml:1` has Employee, CreateEmployeeRequest, UpdateEmployeeRequest
- Latest migration is 000040; new migration will be 000041
- Groups (employee_group, workflow_group, activity_group) require new lookup tables
- Generated models come from `make generate` (go-swagger) and output to `apps/api/gen/models/`

## Desired End State

After this plan is complete:
1. Employee records store all ZMI Personalstamm fields (personal data, address, tariff overrides, groups, photo URL)
2. PIN auto-assignment works when PIN is omitted on create (generates unique numeric PIN within tenant)
3. Exit date blocks booking creation for dates after the exit date
4. New group lookup tables (employee_group, workflow_group, activity_group) are available as FK targets
5. All new fields are exposed via the API with full CRUD support
6. OpenAPI spec, generated models, domain models, and all layers are consistent
7. Existing tests continue to pass; new tests cover added fields and business rules

### Verification:
- `make test` passes with all new and existing tests
- `make swagger-bundle && make generate` produces updated models
- `make migrate-up` applies the new migration
- API returns all new fields in employee GET responses
- POST/PUT endpoints accept all new fields

## What We're NOT Doing

1. **Default order and default activity fields** - These depend on ZMI-TICKET-017 (Auftrag module) which is not yet implemented. Will be added when that module is ready.
2. **Weekly/monthly macro assignments with execution day** - Complex feature requiring macro infrastructure; separate ticket.
3. **Contact type validation against configured contact types** - Requires Contact Management configuration entity (separate system settings ticket).
4. **Photo file upload/storage** - Only adding `photo_url` metadata field; actual file upload is a separate concern.
5. **Frontend (web app) changes** - This plan covers backend only.
6. **Absence day creation and calculation** - Explicitly out of scope per ticket.

## Implementation Approach

Since the Employee entity is already fully implemented end-to-end, this is an **extension** task rather than a greenfield build. The approach is:

1. Add database columns via ALTER TABLE migration (no data migration needed for new nullable columns)
2. Create group lookup tables with standard CRUD pattern
3. Extend OpenAPI schemas, re-bundle, re-generate models
4. Update domain model struct with new fields (GORM tags auto-map to DB columns)
5. Extend service input types and add new business logic (PIN auto-assign, exit date enforcement)
6. Extend handler to pass new fields through
7. No route changes needed (existing endpoints handle new fields via existing CRUD)
8. Add tests for all new logic

---

## Phase 1: Database Migration

### Overview
Add all missing employee columns and create group lookup tables via migration 000041.

### Changes Required:

#### 1. Create migration file
**File**: `db/migrations/000041_extend_employee_master_data.up.sql`

```sql
-- ZMI-TICKET-004: Extend employee master data fields
-- Reference: ZMI Time Handbuch Section 4 (Personnel Master), 4.10 (Tariff fields)

-- ===== Group Lookup Tables =====

CREATE TABLE employee_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);
CREATE INDEX idx_employee_groups_tenant ON employee_groups(tenant_id);

CREATE TABLE workflow_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);
CREATE INDEX idx_workflow_groups_tenant ON workflow_groups(tenant_id);

CREATE TABLE activity_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);
CREATE INDEX idx_activity_groups_tenant ON activity_groups(tenant_id);

-- ===== Employee Personal Data Fields =====

ALTER TABLE employees
    -- Identity extensions
    ADD COLUMN exit_reason VARCHAR(255),
    ADD COLUMN notes TEXT,

    -- Address fields
    ADD COLUMN address_street VARCHAR(255),
    ADD COLUMN address_zip VARCHAR(20),
    ADD COLUMN address_city VARCHAR(100),
    ADD COLUMN address_country VARCHAR(100),

    -- Personal data fields
    ADD COLUMN birth_date DATE,
    ADD COLUMN gender VARCHAR(20),
    ADD COLUMN nationality VARCHAR(100),
    ADD COLUMN religion VARCHAR(100),
    ADD COLUMN marital_status VARCHAR(50),
    ADD COLUMN birth_place VARCHAR(100),
    ADD COLUMN birth_country VARCHAR(100),
    ADD COLUMN room_number VARCHAR(50),

    -- Photo metadata
    ADD COLUMN photo_url VARCHAR(500),

    -- Group FKs
    ADD COLUMN employee_group_id UUID REFERENCES employee_groups(id) ON DELETE SET NULL,
    ADD COLUMN workflow_group_id UUID REFERENCES workflow_groups(id) ON DELETE SET NULL,
    ADD COLUMN activity_group_id UUID REFERENCES activity_groups(id) ON DELETE SET NULL,

    -- Tariff-related override fields (from manual section 14.2 / ticket 4.10)
    ADD COLUMN part_time_percent DECIMAL(5,2),
    ADD COLUMN disability_flag BOOLEAN DEFAULT false,
    ADD COLUMN daily_target_hours DECIMAL(5,2),
    ADD COLUMN weekly_target_hours DECIMAL(5,2),
    ADD COLUMN monthly_target_hours DECIMAL(7,2),
    ADD COLUMN annual_target_hours DECIMAL(8,2),
    ADD COLUMN work_days_per_week DECIMAL(3,1),

    -- Calculation start date (system-managed, not user-editable)
    ADD COLUMN calculation_start_date DATE;

-- Add check constraint for gender values
ALTER TABLE employees
    ADD CONSTRAINT chk_employee_gender
    CHECK (gender IS NULL OR gender IN ('male', 'female', 'diverse', 'not_specified'));

-- Add check constraint for marital status
ALTER TABLE employees
    ADD CONSTRAINT chk_employee_marital_status
    CHECK (marital_status IS NULL OR marital_status IN ('single', 'married', 'divorced', 'widowed', 'registered_partnership', 'not_specified'));

-- Indexes for new FK columns
CREATE INDEX idx_employees_employee_group ON employees(employee_group_id);
CREATE INDEX idx_employees_workflow_group ON employees(workflow_group_id);
CREATE INDEX idx_employees_activity_group ON employees(activity_group_id);

-- Comments
COMMENT ON COLUMN employees.exit_reason IS 'Reason for employee departure';
COMMENT ON COLUMN employees.notes IS 'Free-text notes about the employee';
COMMENT ON COLUMN employees.part_time_percent IS 'ZMI: Part-time percentage (e.g., 50.00 for half-time)';
COMMENT ON COLUMN employees.disability_flag IS 'ZMI: Schwerbehinderung flag for extra vacation days';
COMMENT ON COLUMN employees.daily_target_hours IS 'ZMI: Tagessollstunden - overrides day plan target when "Aus Personalstamm holen" is set';
COMMENT ON COLUMN employees.weekly_target_hours IS 'ZMI: Wochensollstunden - used by macros';
COMMENT ON COLUMN employees.monthly_target_hours IS 'ZMI: Monatssollstunden - used by macros';
COMMENT ON COLUMN employees.annual_target_hours IS 'ZMI: Jahressollstunden - used by macros';
COMMENT ON COLUMN employees.work_days_per_week IS 'ZMI: AT pro Woche - work days per week for vacation calculation';
COMMENT ON COLUMN employees.calculation_start_date IS 'ZMI: Berechne ab - system-managed calculation start date';
```

#### 2. Create down migration
**File**: `db/migrations/000041_extend_employee_master_data.down.sql`

```sql
ALTER TABLE employees
    DROP CONSTRAINT IF EXISTS chk_employee_gender,
    DROP CONSTRAINT IF EXISTS chk_employee_marital_status;

ALTER TABLE employees
    DROP COLUMN IF EXISTS exit_reason,
    DROP COLUMN IF EXISTS notes,
    DROP COLUMN IF EXISTS address_street,
    DROP COLUMN IF EXISTS address_zip,
    DROP COLUMN IF EXISTS address_city,
    DROP COLUMN IF EXISTS address_country,
    DROP COLUMN IF EXISTS birth_date,
    DROP COLUMN IF EXISTS gender,
    DROP COLUMN IF EXISTS nationality,
    DROP COLUMN IF EXISTS religion,
    DROP COLUMN IF EXISTS marital_status,
    DROP COLUMN IF EXISTS birth_place,
    DROP COLUMN IF EXISTS birth_country,
    DROP COLUMN IF EXISTS room_number,
    DROP COLUMN IF EXISTS photo_url,
    DROP COLUMN IF EXISTS employee_group_id,
    DROP COLUMN IF EXISTS workflow_group_id,
    DROP COLUMN IF EXISTS activity_group_id,
    DROP COLUMN IF EXISTS part_time_percent,
    DROP COLUMN IF EXISTS disability_flag,
    DROP COLUMN IF EXISTS daily_target_hours,
    DROP COLUMN IF EXISTS weekly_target_hours,
    DROP COLUMN IF EXISTS monthly_target_hours,
    DROP COLUMN IF EXISTS annual_target_hours,
    DROP COLUMN IF EXISTS work_days_per_week,
    DROP COLUMN IF EXISTS calculation_start_date;

DROP TABLE IF EXISTS activity_groups;
DROP TABLE IF EXISTS workflow_groups;
DROP TABLE IF EXISTS employee_groups;
```

### Success Criteria:

#### Automated Verification:
- [ ] Migration applies cleanly: `make migrate-up`
- [ ] Rollback works cleanly: `make migrate-down` then `make migrate-up`
- [ ] All existing tests still pass: `cd apps/api && go test ./...`

#### Manual Verification:
- [ ] New columns visible in database: `\d employees` shows all new columns
- [ ] Group tables created: `\dt employee_groups`, `\dt workflow_groups`, `\dt activity_groups`
- [ ] Check constraints work: inserting invalid gender value is rejected

---

## Phase 2: OpenAPI Spec Updates

### Overview
Extend the OpenAPI schemas and paths to expose all new employee fields, group entity CRUD, and updated request/response models.

### Changes Required:

#### 1. Update Employee Schema
**File**: `api/schemas/employees.yaml`

Add new properties to the **Employee** response schema (after `vacation_days_per_year`):

```yaml
    # --- New fields from ZMI-TICKET-004 ---
    exit_reason:
      type: string
      x-nullable: true
    notes:
      type: string
      x-nullable: true
    # Address
    address_street:
      type: string
      x-nullable: true
    address_zip:
      type: string
      x-nullable: true
    address_city:
      type: string
      x-nullable: true
    address_country:
      type: string
      x-nullable: true
    # Personal data
    birth_date:
      type: string
      format: date
      x-nullable: true
    gender:
      type: string
      enum:
        - male
        - female
        - diverse
        - not_specified
      x-nullable: true
    nationality:
      type: string
      x-nullable: true
    religion:
      type: string
      x-nullable: true
    marital_status:
      type: string
      enum:
        - single
        - married
        - divorced
        - widowed
        - registered_partnership
        - not_specified
      x-nullable: true
    birth_place:
      type: string
      x-nullable: true
    birth_country:
      type: string
      x-nullable: true
    room_number:
      type: string
      x-nullable: true
    photo_url:
      type: string
      x-nullable: true
    # Group FKs
    employee_group_id:
      type: string
      format: uuid
      x-nullable: true
    workflow_group_id:
      type: string
      format: uuid
      x-nullable: true
    activity_group_id:
      type: string
      format: uuid
      x-nullable: true
    # Tariff-related overrides
    part_time_percent:
      type: number
      format: decimal
      x-nullable: true
    disability_flag:
      type: boolean
      default: false
    daily_target_hours:
      type: number
      format: decimal
      x-nullable: true
    weekly_target_hours:
      type: number
      format: decimal
      x-nullable: true
    monthly_target_hours:
      type: number
      format: decimal
      x-nullable: true
    annual_target_hours:
      type: number
      format: decimal
      x-nullable: true
    work_days_per_week:
      type: number
      format: decimal
      x-nullable: true
    calculation_start_date:
      type: string
      format: date
      x-nullable: true
    # Expanded group relations
    employee_group:
      $ref: './employee-groups.yaml#/EmployeeGroup'
      x-nullable: true
    workflow_group:
      $ref: './employee-groups.yaml#/WorkflowGroup'
      x-nullable: true
    activity_group:
      $ref: './employee-groups.yaml#/ActivityGroup'
      x-nullable: true
```

Add new properties to **CreateEmployeeRequest** (all optional except existing required fields):

```yaml
    # Make pin optional (auto-assigned if not provided)
    # Change pin from required to optional by removing it from the required list
    # and updating minLength to 0
    exit_reason:
      type: string
      maxLength: 255
    notes:
      type: string
    address_street:
      type: string
      maxLength: 255
    address_zip:
      type: string
      maxLength: 20
    address_city:
      type: string
      maxLength: 100
    address_country:
      type: string
      maxLength: 100
    birth_date:
      type: string
      format: date
    gender:
      type: string
      enum:
        - male
        - female
        - diverse
        - not_specified
    nationality:
      type: string
      maxLength: 100
    religion:
      type: string
      maxLength: 100
    marital_status:
      type: string
      enum:
        - single
        - married
        - divorced
        - widowed
        - registered_partnership
        - not_specified
    birth_place:
      type: string
      maxLength: 100
    birth_country:
      type: string
      maxLength: 100
    room_number:
      type: string
      maxLength: 50
    photo_url:
      type: string
      maxLength: 500
    employee_group_id:
      type: string
      format: uuid
    workflow_group_id:
      type: string
      format: uuid
    activity_group_id:
      type: string
      format: uuid
    part_time_percent:
      type: number
      format: decimal
    disability_flag:
      type: boolean
    daily_target_hours:
      type: number
      format: decimal
    weekly_target_hours:
      type: number
      format: decimal
    monthly_target_hours:
      type: number
      format: decimal
    annual_target_hours:
      type: number
      format: decimal
    work_days_per_week:
      type: number
      format: decimal
```

Add same optional properties to **UpdateEmployeeRequest**.

Also update the **CreateEmployeeRequest** `required` list: **remove `pin` from required** (it becomes optional for auto-assignment). Change `pin` `minLength` from 4 to 0.

#### 2. Create Employee Groups Schema
**File**: `api/schemas/employee-groups.yaml`

```yaml
EmployeeGroup:
  type: object
  required:
    - id
    - tenant_id
    - code
    - name
  properties:
    id:
      type: string
      format: uuid
    tenant_id:
      type: string
      format: uuid
    code:
      type: string
    name:
      type: string
    description:
      type: string
      x-nullable: true
    is_active:
      type: boolean
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time

WorkflowGroup:
  type: object
  required:
    - id
    - tenant_id
    - code
    - name
  properties:
    id:
      type: string
      format: uuid
    tenant_id:
      type: string
      format: uuid
    code:
      type: string
    name:
      type: string
    description:
      type: string
      x-nullable: true
    is_active:
      type: boolean
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time

ActivityGroup:
  type: object
  required:
    - id
    - tenant_id
    - code
    - name
  properties:
    id:
      type: string
      format: uuid
    tenant_id:
      type: string
      format: uuid
    code:
      type: string
    name:
      type: string
    description:
      type: string
      x-nullable: true
    is_active:
      type: boolean
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time

CreateGroupRequest:
  type: object
  required:
    - code
    - name
  properties:
    code:
      type: string
      minLength: 1
      maxLength: 50
    name:
      type: string
      minLength: 1
      maxLength: 255
    description:
      type: string
    is_active:
      type: boolean
      default: true

UpdateGroupRequest:
  type: object
  properties:
    code:
      type: string
      minLength: 1
      maxLength: 50
    name:
      type: string
      minLength: 1
      maxLength: 255
    description:
      type: string
    is_active:
      type: boolean
```

#### 3. Create Employee Groups Paths
**File**: `api/paths/employee-groups.yaml`

Standard CRUD paths for `/employee-groups`, `/workflow-groups`, `/activity-groups` following the same pattern as `cost-centers` paths (simple list + CRUD).

#### 4. Update main openapi.yaml
**File**: `api/openapi.yaml`

Add references to the new schema file and new path entries.

#### 5. Bundle and generate
```bash
make swagger-bundle
make generate
```

### Success Criteria:

#### Automated Verification:
- [ ] `make swagger-bundle` succeeds without errors
- [ ] `make generate` produces updated models in `apps/api/gen/models/`
- [ ] Generated `CreateEmployeeRequest` includes all new fields
- [ ] Generated `UpdateEmployeeRequest` includes all new fields
- [ ] Generated group models exist (EmployeeGroup, WorkflowGroup, ActivityGroup, CreateGroupRequest, UpdateGroupRequest)
- [ ] `pin` is no longer required in `CreateEmployeeRequest`

#### Manual Verification:
- [ ] Swagger UI at `/swagger/` shows all new fields in employee schemas
- [ ] New group endpoints visible in Swagger UI

---

## Phase 3: Domain Model Updates

### Overview
Update the Go domain model struct to include all new database columns. Also create group lookup models.

### Changes Required:

#### 1. Extend Employee struct
**File**: `apps/api/internal/model/employee.go`

Add new fields to the Employee struct (after `VacationDaysPerYear`):

```go
type Employee struct {
    // ... existing fields ...

    // Identity extensions
    ExitReason string     `gorm:"type:varchar(255)" json:"exit_reason,omitempty"`
    Notes      string     `gorm:"type:text" json:"notes,omitempty"`

    // Address
    AddressStreet  string `gorm:"type:varchar(255)" json:"address_street,omitempty"`
    AddressZip     string `gorm:"type:varchar(20)" json:"address_zip,omitempty"`
    AddressCity    string `gorm:"type:varchar(100)" json:"address_city,omitempty"`
    AddressCountry string `gorm:"type:varchar(100)" json:"address_country,omitempty"`

    // Personal data
    BirthDate     *time.Time `gorm:"type:date" json:"birth_date,omitempty"`
    Gender        string     `gorm:"type:varchar(20)" json:"gender,omitempty"`
    Nationality   string     `gorm:"type:varchar(100)" json:"nationality,omitempty"`
    Religion      string     `gorm:"type:varchar(100)" json:"religion,omitempty"`
    MaritalStatus string     `gorm:"type:varchar(50)" json:"marital_status,omitempty"`
    BirthPlace    string     `gorm:"type:varchar(100)" json:"birth_place,omitempty"`
    BirthCountry  string     `gorm:"type:varchar(100)" json:"birth_country,omitempty"`
    RoomNumber    string     `gorm:"type:varchar(50)" json:"room_number,omitempty"`

    // Photo
    PhotoURL string `gorm:"type:varchar(500)" json:"photo_url,omitempty"`

    // Group FKs
    EmployeeGroupID *uuid.UUID `gorm:"type:uuid" json:"employee_group_id,omitempty"`
    WorkflowGroupID *uuid.UUID `gorm:"type:uuid" json:"workflow_group_id,omitempty"`
    ActivityGroupID *uuid.UUID `gorm:"type:uuid" json:"activity_group_id,omitempty"`

    // Tariff-related overrides (ZMI manual section 14.2)
    PartTimePercent   *decimal.Decimal `gorm:"type:decimal(5,2)" json:"part_time_percent,omitempty"`
    DisabilityFlag    bool             `gorm:"default:false" json:"disability_flag"`
    DailyTargetHours  *decimal.Decimal `gorm:"type:decimal(5,2)" json:"daily_target_hours,omitempty"`
    WeeklyTargetHours *decimal.Decimal `gorm:"type:decimal(5,2)" json:"weekly_target_hours,omitempty"`
    MonthlyTargetHours *decimal.Decimal `gorm:"type:decimal(7,2)" json:"monthly_target_hours,omitempty"`
    AnnualTargetHours  *decimal.Decimal `gorm:"type:decimal(8,2)" json:"annual_target_hours,omitempty"`
    WorkDaysPerWeek    *decimal.Decimal `gorm:"type:decimal(3,1)" json:"work_days_per_week,omitempty"`

    // Calculation start date (system-managed)
    CalculationStartDate *time.Time `gorm:"type:date" json:"calculation_start_date,omitempty"`

    // ... existing relation fields ...

    // New group relations
    EmployeeGroup *EmployeeGroup `gorm:"foreignKey:EmployeeGroupID" json:"employee_group,omitempty"`
    WorkflowGroup *WorkflowGroup `gorm:"foreignKey:WorkflowGroupID" json:"workflow_group,omitempty"`
    ActivityGroup *ActivityGroup `gorm:"foreignKey:ActivityGroupID" json:"activity_group,omitempty"`
}
```

#### 2. Create Group models
**File**: `apps/api/internal/model/group.go`

```go
package model

import (
    "time"
    "github.com/google/uuid"
)

type EmployeeGroup struct {
    ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
    Code        string    `gorm:"type:varchar(50);not null" json:"code"`
    Name        string    `gorm:"type:varchar(255);not null" json:"name"`
    Description string    `gorm:"type:text" json:"description,omitempty"`
    IsActive    bool      `gorm:"default:true" json:"is_active"`
    CreatedAt   time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt   time.Time `gorm:"default:now()" json:"updated_at"`
}

func (EmployeeGroup) TableName() string { return "employee_groups" }

type WorkflowGroup struct {
    ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
    Code        string    `gorm:"type:varchar(50);not null" json:"code"`
    Name        string    `gorm:"type:varchar(255);not null" json:"name"`
    Description string    `gorm:"type:text" json:"description,omitempty"`
    IsActive    bool      `gorm:"default:true" json:"is_active"`
    CreatedAt   time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt   time.Time `gorm:"default:now()" json:"updated_at"`
}

func (WorkflowGroup) TableName() string { return "workflow_groups" }

type ActivityGroup struct {
    ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
    Code        string    `gorm:"type:varchar(50);not null" json:"code"`
    Name        string    `gorm:"type:varchar(255);not null" json:"name"`
    Description string    `gorm:"type:text" json:"description,omitempty"`
    IsActive    bool      `gorm:"default:true" json:"is_active"`
    CreatedAt   time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt   time.Time `gorm:"default:now()" json:"updated_at"`
}

func (ActivityGroup) TableName() string { return "activity_groups" }
```

### Success Criteria:

#### Automated Verification:
- [ ] `cd apps/api && go build ./...` compiles without errors
- [ ] `cd apps/api && go vet ./...` passes
- [ ] `cd apps/api && go test ./...` (existing tests still pass)

#### Manual Verification:
- [ ] Employee struct fields align 1:1 with database columns from Phase 1

---

## Phase 4: Repository Layer

### Overview
Extend the employee repository to support new fields in queries and add group repositories with standard CRUD.

### Changes Required:

#### 1. Update EmployeeFilter
**File**: `apps/api/internal/repository/employee.go`

Add new filter fields:

```go
type EmployeeFilter struct {
    TenantID          uuid.UUID
    DepartmentID      *uuid.UUID
    EmployeeGroupID   *uuid.UUID  // NEW
    WorkflowGroupID   *uuid.UUID  // NEW
    ActivityGroupID   *uuid.UUID  // NEW
    IsActive          *bool
    HasExitDate       *bool       // NEW: filter for employees with/without exit date
    SearchQuery       string
    Offset            int
    Limit             int
}
```

Update the `List` method to apply the new filters:

```go
if filter.EmployeeGroupID != nil {
    query = query.Where("employee_group_id = ?", *filter.EmployeeGroupID)
}
if filter.WorkflowGroupID != nil {
    query = query.Where("workflow_group_id = ?", *filter.WorkflowGroupID)
}
if filter.ActivityGroupID != nil {
    query = query.Where("activity_group_id = ?", *filter.ActivityGroupID)
}
if filter.HasExitDate != nil {
    if *filter.HasExitDate {
        query = query.Where("exit_date IS NOT NULL")
    } else {
        query = query.Where("exit_date IS NULL")
    }
}
```

Update `GetWithDetails` to preload new group relations:

```go
Preload("EmployeeGroup").
Preload("WorkflowGroup").
Preload("ActivityGroup").
```

#### 2. Create Group Repository
**File**: `apps/api/internal/repository/group.go`

Follow the exact pattern of `CostCenterRepository` or `EmploymentTypeRepository`:

```go
type GroupRepository struct {
    db *DB
}

func NewGroupRepository(db *DB) *GroupRepository {
    return &GroupRepository{db: db}
}
```

Methods for each group type (EmployeeGroup, WorkflowGroup, ActivityGroup):
- `CreateEmployeeGroup(ctx, group)` / `CreateWorkflowGroup` / `CreateActivityGroup`
- `GetEmployeeGroupByID(ctx, id)` / etc.
- `UpdateEmployeeGroup(ctx, group)` / etc.
- `DeleteEmployeeGroup(ctx, id)` / etc.
- `ListEmployeeGroups(ctx, tenantID)` / etc.

Implementation note: Since all three groups have the identical structure, use one repository struct with methods distinguished by type parameter or separate methods. The separate-methods approach matches the existing codebase pattern (no generics in use).

#### 3. Add GetNextAvailablePIN method
**File**: `apps/api/internal/repository/employee.go`

```go
// GetNextAvailablePIN finds the next available numeric PIN for a tenant.
func (r *EmployeeRepository) GetNextAvailablePIN(ctx context.Context, tenantID uuid.UUID) (string, error) {
    var maxPIN sql.NullString
    err := r.db.GORM.WithContext(ctx).
        Model(&model.Employee{}).
        Select("MAX(CAST(pin AS INTEGER))").
        Where("tenant_id = ? AND pin ~ '^[0-9]+$'", tenantID).
        Scan(&maxPIN).Error
    if err != nil {
        return "", fmt.Errorf("failed to get max PIN: %w", err)
    }
    if !maxPIN.Valid || maxPIN.String == "" {
        return "1000", nil // Start from 1000
    }
    max, err := strconv.Atoi(maxPIN.String)
    if err != nil {
        return "1000", nil
    }
    return fmt.Sprintf("%d", max+1), nil
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `cd apps/api && go build ./...` compiles
- [ ] `cd apps/api && go test ./internal/repository/...` passes

#### Manual Verification:
- [ ] Employee list query works with new filter fields

---

## Phase 5: Service Layer

### Overview
Extend service input types, add PIN auto-assignment logic, and implement exit date enforcement in the booking service.

### Changes Required:

#### 1. Extend CreateEmployeeInput and UpdateEmployeeInput
**File**: `apps/api/internal/service/employee.go`

Add new fields to `CreateEmployeeInput`:

```go
type CreateEmployeeInput struct {
    // ... existing fields ...

    // New fields
    ExitReason        string
    Notes             string
    AddressStreet     string
    AddressZip        string
    AddressCity       string
    AddressCountry    string
    BirthDate         *time.Time
    Gender            string
    Nationality       string
    Religion          string
    MaritalStatus     string
    BirthPlace        string
    BirthCountry      string
    RoomNumber        string
    PhotoURL          string
    EmployeeGroupID   *uuid.UUID
    WorkflowGroupID   *uuid.UUID
    ActivityGroupID   *uuid.UUID
    PartTimePercent   *float64
    DisabilityFlag    bool
    DailyTargetHours  *float64
    WeeklyTargetHours *float64
    MonthlyTargetHours *float64
    AnnualTargetHours  *float64
    WorkDaysPerWeek    *float64
}
```

Add matching fields to `UpdateEmployeeInput` (all as pointers for partial update pattern, plus Clear* booleans for FK fields):

```go
type UpdateEmployeeInput struct {
    // ... existing fields ...

    // New fields (all pointers for partial update)
    ExitReason        *string
    Notes             *string
    AddressStreet     *string
    AddressZip        *string
    AddressCity       *string
    AddressCountry    *string
    BirthDate         *time.Time
    Gender            *string
    Nationality       *string
    Religion          *string
    MaritalStatus     *string
    BirthPlace        *string
    BirthCountry      *string
    RoomNumber        *string
    PhotoURL          *string
    EmployeeGroupID   *uuid.UUID
    WorkflowGroupID   *uuid.UUID
    ActivityGroupID   *uuid.UUID
    PartTimePercent   *float64
    DisabilityFlag    *bool
    DailyTargetHours  *float64
    WeeklyTargetHours *float64
    MonthlyTargetHours *float64
    AnnualTargetHours  *float64
    WorkDaysPerWeek    *float64

    // Clear flags for nullable FK fields
    ClearEmployeeGroupID bool
    ClearWorkflowGroupID bool
    ClearActivityGroupID bool
    ClearBirthDate       bool
}
```

#### 2. Add PIN auto-assignment
**File**: `apps/api/internal/service/employee.go`

Update the repository interface to include:

```go
type employeeRepository interface {
    // ... existing methods ...
    GetNextAvailablePIN(ctx context.Context, tenantID uuid.UUID) (string, error)
}
```

Modify the `Create` method: instead of returning `ErrPINRequired` when PIN is empty, auto-assign:

```go
func (s *EmployeeService) Create(ctx context.Context, input CreateEmployeeInput) (*model.Employee, error) {
    // ... existing validation ...

    pin := strings.TrimSpace(input.PIN)
    if pin == "" {
        // Auto-assign PIN
        var err error
        pin, err = s.employeeRepo.GetNextAvailablePIN(ctx, input.TenantID)
        if err != nil {
            return nil, fmt.Errorf("failed to auto-assign PIN: %w", err)
        }
    }

    // ... rest of existing logic, using pin variable ...

    // Map new fields to employee struct
    emp.ExitReason = strings.TrimSpace(input.ExitReason)
    emp.Notes = strings.TrimSpace(input.Notes)
    emp.AddressStreet = strings.TrimSpace(input.AddressStreet)
    emp.AddressZip = strings.TrimSpace(input.AddressZip)
    emp.AddressCity = strings.TrimSpace(input.AddressCity)
    emp.AddressCountry = strings.TrimSpace(input.AddressCountry)
    emp.BirthDate = input.BirthDate
    emp.Gender = strings.TrimSpace(input.Gender)
    emp.Nationality = strings.TrimSpace(input.Nationality)
    emp.Religion = strings.TrimSpace(input.Religion)
    emp.MaritalStatus = strings.TrimSpace(input.MaritalStatus)
    emp.BirthPlace = strings.TrimSpace(input.BirthPlace)
    emp.BirthCountry = strings.TrimSpace(input.BirthCountry)
    emp.RoomNumber = strings.TrimSpace(input.RoomNumber)
    emp.PhotoURL = strings.TrimSpace(input.PhotoURL)
    emp.EmployeeGroupID = input.EmployeeGroupID
    emp.WorkflowGroupID = input.WorkflowGroupID
    emp.ActivityGroupID = input.ActivityGroupID
    emp.DisabilityFlag = input.DisabilityFlag

    if input.PartTimePercent != nil {
        v := decimal.NewFromFloat(*input.PartTimePercent)
        emp.PartTimePercent = &v
    }
    if input.DailyTargetHours != nil {
        v := decimal.NewFromFloat(*input.DailyTargetHours)
        emp.DailyTargetHours = &v
    }
    // ... same pattern for WeeklyTargetHours, MonthlyTargetHours, AnnualTargetHours, WorkDaysPerWeek
}
```

Add new error sentinel:

```go
var ErrEmployeeExited = errors.New("employee has exited; operation not allowed after exit date")
```

#### 3. Update the Update method

Extend the Update method to handle all new fields using the same pointer-based partial update pattern:

```go
if input.ExitReason != nil {
    emp.ExitReason = strings.TrimSpace(*input.ExitReason)
}
if input.Notes != nil {
    emp.Notes = strings.TrimSpace(*input.Notes)
}
// ... same pattern for all new string fields ...

if input.ClearEmployeeGroupID {
    emp.EmployeeGroupID = nil
} else if input.EmployeeGroupID != nil {
    emp.EmployeeGroupID = input.EmployeeGroupID
}
// ... same for WorkflowGroupID, ActivityGroupID ...

if input.DisabilityFlag != nil {
    emp.DisabilityFlag = *input.DisabilityFlag
}
if input.PartTimePercent != nil {
    v := decimal.NewFromFloat(*input.PartTimePercent)
    emp.PartTimePercent = &v
}
// ... same for all decimal pointer fields ...
```

#### 4. Create Group Service
**File**: `apps/api/internal/service/group.go`

Follow the `CostCenterService` pattern:

```go
type GroupService struct {
    groupRepo groupRepository
}

type groupRepository interface {
    CreateEmployeeGroup(ctx context.Context, g *model.EmployeeGroup) error
    GetEmployeeGroupByID(ctx context.Context, id uuid.UUID) (*model.EmployeeGroup, error)
    UpdateEmployeeGroup(ctx context.Context, g *model.EmployeeGroup) error
    DeleteEmployeeGroup(ctx context.Context, id uuid.UUID) error
    ListEmployeeGroups(ctx context.Context, tenantID uuid.UUID) ([]model.EmployeeGroup, error)
    // ... same for WorkflowGroup, ActivityGroup ...
}
```

Standard CRUD with validation (code required, name required, code uniqueness within tenant).

#### 5. Exit Date Enforcement in Booking Service
**File**: `apps/api/internal/service/booking.go`

In the booking creation logic, add a check:

```go
// In BookingService.Create (or wherever bookings are created):
emp, err := s.employeeRepo.GetByID(ctx, input.EmployeeID)
if err != nil {
    return nil, err
}
if emp.ExitDate != nil && bookingDate.After(*emp.ExitDate) {
    return nil, ErrEmployeeExited
}
```

This requires adding `employeeRepository` as a dependency to BookingService (or passing the check through the existing flow). If BookingService does not currently have access to the employee repo, we need to inject it.

**Implementation Note**: Look at `apps/api/internal/service/booking.go` to determine the exact injection point. The booking handler already has access to the employee through the day view flow. The most minimal change is to add the check in the daily calculation service where it already loads employee data.

### Success Criteria:

#### Automated Verification:
- [ ] `cd apps/api && go build ./...` compiles
- [ ] `cd apps/api && go test ./internal/service/...` passes
- [ ] Existing employee service tests still pass (PIN validation test needs updating since PIN is now optional)

#### Manual Verification:
- [ ] PIN auto-assignment generates unique sequential PINs

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the service layer logic is correct before proceeding.

---

## Phase 6: Handler Layer

### Overview
Extend the employee handler to map all new fields between generated request models and service input types. Add group handlers.

### Changes Required:

#### 1. Update Employee Handler - Create
**File**: `apps/api/internal/handler/employee.go`

In the `Create` method, after existing field mapping, add:

```go
input := service.CreateEmployeeInput{
    // ... existing mappings ...

    // New field mappings
    ExitReason:     req.ExitReason,
    Notes:          req.Notes,
    AddressStreet:  req.AddressStreet,
    AddressZip:     req.AddressZip,
    AddressCity:    req.AddressCity,
    AddressCountry: req.AddressCountry,
    Gender:         req.Gender,
    Nationality:    req.Nationality,
    Religion:       req.Religion,
    MaritalStatus:  req.MaritalStatus,
    BirthPlace:     req.BirthPlace,
    BirthCountry:   req.BirthCountry,
    RoomNumber:     req.RoomNumber,
    PhotoURL:       req.PhotoURL,
    DisabilityFlag: req.DisabilityFlag,
}

// Handle optional birth_date
if !time.Time(req.BirthDate).IsZero() {
    bd := time.Time(req.BirthDate)
    input.BirthDate = &bd
}

// Handle optional group UUIDs
if req.EmployeeGroupID != "" {
    id, err := uuid.Parse(req.EmployeeGroupID.String())
    if err != nil {
        respondError(w, http.StatusBadRequest, "Invalid employee group ID")
        return
    }
    input.EmployeeGroupID = &id
}
// ... same for WorkflowGroupID, ActivityGroupID ...

// Handle optional decimal fields
if req.PartTimePercent > 0 {
    input.PartTimePercent = &req.PartTimePercent
}
// ... same for DailyTargetHours, WeeklyTargetHours, etc. ...
```

Since PIN is now optional, update the PIN mapping:

```go
// PIN is now optional; pass as-is (service handles auto-assignment)
if req.Pin != nil {
    input.PIN = *req.Pin
}
// If PIN is nil/empty, service will auto-assign
```

#### 2. Update Employee Handler - Update
**File**: `apps/api/internal/handler/employee.go`

Extend the Update method to pass through new fields using the same raw JSON / pointer pattern for explicit null handling.

#### 3. Create Group Handler
**File**: `apps/api/internal/handler/group.go`

Follow the `CostCenterHandler` pattern:

```go
type GroupHandler struct {
    groupService *service.GroupService
}

func NewGroupHandler(groupService *service.GroupService) *GroupHandler {
    return &GroupHandler{groupService: groupService}
}
```

Methods: `ListEmployeeGroups`, `CreateEmployeeGroup`, `GetEmployeeGroup`, `UpdateEmployeeGroup`, `DeleteEmployeeGroup` (and same for WorkflowGroup, ActivityGroup).

Each method follows the standard handler pattern:
1. Extract tenant ID from context
2. Decode request body (for POST/PATCH)
3. Validate using generated model
4. Map to service input
5. Call service
6. Respond with JSON

### Success Criteria:

#### Automated Verification:
- [ ] `cd apps/api && go build ./...` compiles
- [ ] `cd apps/api && go test ./internal/handler/...` passes

#### Manual Verification:
- [ ] POST /employees with all new fields returns them in response
- [ ] PUT /employees/{id} with new fields persists and returns updated values
- [ ] POST /employees without PIN field returns employee with auto-assigned PIN

---

## Phase 7: Route Registration and Wiring

### Overview
Register the new group routes and wire up the group service/handler in main.go.

### Changes Required:

#### 1. Register Group Routes
**File**: `apps/api/internal/handler/routes.go`

Add route registration functions following existing patterns:

```go
func RegisterEmployeeGroupRoutes(r chi.Router, h *GroupHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("employee_groups.manage").String()
    r.Route("/employee-groups", func(r chi.Router) {
        if authz == nil {
            r.Get("/", h.ListEmployeeGroups)
            r.Post("/", h.CreateEmployeeGroup)
            r.Get("/{id}", h.GetEmployeeGroup)
            r.Patch("/{id}", h.UpdateEmployeeGroup)
            r.Delete("/{id}", h.DeleteEmployeeGroup)
            return
        }
        r.With(authz.RequirePermission(permManage)).Get("/", h.ListEmployeeGroups)
        r.With(authz.RequirePermission(permManage)).Post("/", h.CreateEmployeeGroup)
        r.With(authz.RequirePermission(permManage)).Get("/{id}", h.GetEmployeeGroup)
        r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.UpdateEmployeeGroup)
        r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.DeleteEmployeeGroup)
    })
}

// Same pattern for RegisterWorkflowGroupRoutes, RegisterActivityGroupRoutes
```

#### 2. Add Permissions
**File**: `apps/api/internal/permissions/permissions.go`

Add group permissions to `allPermissions`:

```go
{ID: permissionID("employee_groups.manage"), Resource: "employee_groups", Action: "manage", Description: "Manage employee groups"},
{ID: permissionID("workflow_groups.manage"), Resource: "workflow_groups", Action: "manage", Description: "Manage workflow groups"},
{ID: permissionID("activity_groups.manage"), Resource: "activity_groups", Action: "manage", Description: "Manage activity groups"},
```

#### 3. Wire in main.go
**File**: `apps/api/cmd/server/main.go`

Add repository, service, and handler initialization:

```go
// In repository initialization section:
groupRepo := repository.NewGroupRepository(db)

// In service initialization section:
groupService := service.NewGroupService(groupRepo)

// In handler initialization section:
groupHandler := handler.NewGroupHandler(groupService)

// In tenant-scoped route registration section:
handler.RegisterEmployeeGroupRoutes(r, groupHandler, authzMiddleware)
handler.RegisterWorkflowGroupRoutes(r, groupHandler, authzMiddleware)
handler.RegisterActivityGroupRoutes(r, groupHandler, authzMiddleware)
```

Also update EmployeeService constructor if GetNextAvailablePIN requires interface update (it should be transparent since the EmployeeRepository already satisfies the interface once the new method is added).

### Success Criteria:

#### Automated Verification:
- [ ] `cd apps/api && go build ./cmd/server/...` compiles
- [ ] `cd apps/api && go test ./...` passes

#### Manual Verification:
- [ ] `make dev` starts without errors
- [ ] `curl localhost:8080/api/v1/employee-groups` returns empty list (with auth)
- [ ] `curl localhost:8080/api/v1/employees` returns employees with new fields

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the API is working correctly before proceeding to tests.

---

## Phase 8: Tests

### Overview
Add unit tests for new business logic (PIN auto-assignment, exit date enforcement, new field validation) and handler tests for new fields.

### Changes Required:

#### 1. Service Tests - PIN Auto-Assignment
**File**: `apps/api/internal/service/employee_test.go`

```go
func TestEmployeeService_Create_PINAutoAssignment(t *testing.T) {
    // Setup
    db := testutil.SetupTestDB(t)
    repo := repository.NewEmployeeRepository(db)
    svc := service.NewEmployeeService(repo, nil, nil)
    ctx := context.Background()
    tenant := createTestTenantForEmployeeService(t, db)

    // Create employee WITHOUT PIN
    input := service.CreateEmployeeInput{
        TenantID:        tenant.ID,
        PersonnelNumber: "E001",
        // PIN intentionally empty
        FirstName: "John",
        LastName:  "Doe",
        EntryDate: time.Now().AddDate(0, -1, 0),
    }

    emp, err := svc.Create(ctx, input)
    require.NoError(t, err)
    assert.NotEmpty(t, emp.PIN)
    assert.Equal(t, "1000", emp.PIN) // First auto-assigned PIN
}

func TestEmployeeService_Create_PINAutoAssignment_Sequential(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := repository.NewEmployeeRepository(db)
    svc := service.NewEmployeeService(repo, nil, nil)
    ctx := context.Background()
    tenant := createTestTenantForEmployeeService(t, db)

    // Create first employee with PIN 1000
    _, err := svc.Create(ctx, service.CreateEmployeeInput{
        TenantID: tenant.ID, PersonnelNumber: "E001",
        PIN: "1000", FirstName: "A", LastName: "A",
        EntryDate: time.Now(),
    })
    require.NoError(t, err)

    // Create second employee without PIN - should get 1001
    emp2, err := svc.Create(ctx, service.CreateEmployeeInput{
        TenantID: tenant.ID, PersonnelNumber: "E002",
        FirstName: "B", LastName: "B",
        EntryDate: time.Now(),
    })
    require.NoError(t, err)
    assert.Equal(t, "1001", emp2.PIN)
}

func TestEmployeeService_Create_PINAutoAssignment_UniqueCheck(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := repository.NewEmployeeRepository(db)
    svc := service.NewEmployeeService(repo, nil, nil)
    ctx := context.Background()
    tenant := createTestTenantForEmployeeService(t, db)

    // Auto-assigned PINs must be unique within tenant
    emp1, err := svc.Create(ctx, service.CreateEmployeeInput{
        TenantID: tenant.ID, PersonnelNumber: "E001",
        FirstName: "A", LastName: "A", EntryDate: time.Now(),
    })
    require.NoError(t, err)

    emp2, err := svc.Create(ctx, service.CreateEmployeeInput{
        TenantID: tenant.ID, PersonnelNumber: "E002",
        FirstName: "B", LastName: "B", EntryDate: time.Now(),
    })
    require.NoError(t, err)
    assert.NotEqual(t, emp1.PIN, emp2.PIN)
}
```

#### 2. Service Tests - New Fields
**File**: `apps/api/internal/service/employee_test.go`

```go
func TestEmployeeService_Create_WithExtendedFields(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := repository.NewEmployeeRepository(db)
    svc := service.NewEmployeeService(repo, nil, nil)
    ctx := context.Background()
    tenant := createTestTenantForEmployeeService(t, db)

    birthDate := time.Date(1990, 5, 15, 0, 0, 0, 0, time.UTC)
    partTime := 50.0
    dailyHours := 4.0
    workDays := 5.0

    input := service.CreateEmployeeInput{
        TenantID:        tenant.ID,
        PersonnelNumber: "E001",
        PIN:             "1234",
        FirstName:       "Jane",
        LastName:        "Smith",
        EntryDate:       time.Now().AddDate(0, -1, 0),
        // Extended fields
        AddressStreet:   "Main Street 1",
        AddressZip:      "12345",
        AddressCity:     "Berlin",
        AddressCountry:  "Germany",
        BirthDate:       &birthDate,
        Gender:          "female",
        Nationality:     "German",
        MaritalStatus:   "single",
        BirthPlace:      "Munich",
        BirthCountry:    "Germany",
        DisabilityFlag:  true,
        PartTimePercent:  &partTime,
        DailyTargetHours: &dailyHours,
        WorkDaysPerWeek:  &workDays,
    }

    emp, err := svc.Create(ctx, input)
    require.NoError(t, err)
    assert.Equal(t, "Main Street 1", emp.AddressStreet)
    assert.Equal(t, "12345", emp.AddressZip)
    assert.Equal(t, "Berlin", emp.AddressCity)
    assert.Equal(t, "female", emp.Gender)
    assert.Equal(t, "single", emp.MaritalStatus)
    assert.True(t, emp.DisabilityFlag)
    assert.NotNil(t, emp.BirthDate)
    assert.NotNil(t, emp.PartTimePercent)
    assert.NotNil(t, emp.DailyTargetHours)
}

func TestEmployeeService_Update_ExtendedFields(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := repository.NewEmployeeRepository(db)
    svc := service.NewEmployeeService(repo, nil, nil)
    ctx := context.Background()
    tenant := createTestTenantForEmployeeService(t, db)

    emp, err := svc.Create(ctx, service.CreateEmployeeInput{
        TenantID: tenant.ID, PersonnelNumber: "E001", PIN: "1234",
        FirstName: "John", LastName: "Doe", EntryDate: time.Now(),
    })
    require.NoError(t, err)

    street := "New Street 42"
    city := "Hamburg"
    gender := "male"
    disability := true

    updated, err := svc.Update(ctx, emp.ID, service.UpdateEmployeeInput{
        AddressStreet:  &street,
        AddressCity:    &city,
        Gender:         &gender,
        DisabilityFlag: &disability,
    })
    require.NoError(t, err)
    assert.Equal(t, "New Street 42", updated.AddressStreet)
    assert.Equal(t, "Hamburg", updated.AddressCity)
    assert.Equal(t, "male", updated.Gender)
    assert.True(t, updated.DisabilityFlag)
}
```

#### 3. Service Tests - Exit Date Enforcement
**File**: `apps/api/internal/service/employee_test.go` or `booking_test.go`

```go
func TestExitDateBlocksBookingAfterExit(t *testing.T) {
    // Test that creating a booking for a date after the employee's exit date
    // returns an appropriate error.
    // (Exact setup depends on booking service test infrastructure)
}
```

#### 4. Handler Tests - New Fields
**File**: `apps/api/internal/handler/employee_test.go`

```go
func TestEmployeeHandler_Create_WithExtendedFields(t *testing.T) {
    h, _, tenant := setupEmployeeHandler(t)

    entryDate := time.Now().AddDate(0, -1, 0).Format("2006-01-02")
    body := `{
        "personnel_number": "E001",
        "pin": "1234",
        "first_name": "Jane",
        "last_name": "Smith",
        "entry_date": "` + entryDate + `",
        "address_street": "Main Street 1",
        "address_city": "Berlin",
        "gender": "female",
        "disability_flag": true,
        "work_days_per_week": 5.0
    }`
    req := httptest.NewRequest("POST", "/employees", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    req = withEmployeeTenantContext(req, tenant)
    rr := httptest.NewRecorder()

    h.Create(rr, req)

    assert.Equal(t, http.StatusCreated, rr.Code)
    var result model.Employee
    err := json.Unmarshal(rr.Body.Bytes(), &result)
    require.NoError(t, err)
    assert.Equal(t, "Main Street 1", result.AddressStreet)
    assert.Equal(t, "Berlin", result.AddressCity)
    assert.Equal(t, "female", result.Gender)
    assert.True(t, result.DisabilityFlag)
}

func TestEmployeeHandler_Create_PINAutoAssigned(t *testing.T) {
    h, svc, tenant := setupEmployeeHandler(t)

    entryDate := time.Now().AddDate(0, -1, 0).Format("2006-01-02")
    // No "pin" field in request body
    body := `{
        "personnel_number": "E001",
        "first_name": "John",
        "last_name": "Doe",
        "entry_date": "` + entryDate + `"
    }`
    req := httptest.NewRequest("POST", "/employees", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    req = withEmployeeTenantContext(req, tenant)
    rr := httptest.NewRecorder()

    h.Create(rr, req)

    assert.Equal(t, http.StatusCreated, rr.Code)

    // Verify PIN was assigned by querying through service
    var result map[string]interface{}
    err := json.Unmarshal(rr.Body.Bytes(), &result)
    require.NoError(t, err)
    // PIN is hidden in JSON (json:"-"), so verify via service
    id := result["id"].(string)
    empID, _ := uuid.Parse(id)
    emp, err := svc.GetByID(context.Background(), empID)
    require.NoError(t, err)
    assert.NotEmpty(t, emp.PIN)
}
```

#### 5. Update Existing Tests

The existing test `TestEmployeeService_Create_EmptyPIN` needs to be updated. Since PIN is now auto-assigned when empty, the test should verify auto-assignment instead of expecting an error:

```go
func TestEmployeeService_Create_EmptyPIN_AutoAssigns(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := repository.NewEmployeeRepository(db)
    svc := service.NewEmployeeService(repo, nil, nil)
    ctx := context.Background()
    tenant := createTestTenantForEmployeeService(t, db)

    input := service.CreateEmployeeInput{
        TenantID:        tenant.ID,
        PersonnelNumber: "E001",
        // PIN intentionally empty - should auto-assign
        FirstName: "John",
        LastName:  "Doe",
        EntryDate: time.Now(),
    }

    emp, err := svc.Create(ctx, input)
    require.NoError(t, err) // No longer returns ErrPINRequired
    assert.NotEmpty(t, emp.PIN)
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `cd apps/api && go test -v -count=1 ./internal/service/...` - All tests pass including new ones
- [ ] `cd apps/api && go test -v -count=1 ./internal/handler/...` - All tests pass including new ones
- [ ] `cd apps/api && go test -v -count=1 ./internal/repository/...` - All tests pass
- [ ] `cd apps/api && go test -race ./...` - No race conditions
- [ ] `make lint` passes

#### Manual Verification:
- [ ] Full API round-trip: create employee with all fields, read back, verify all fields present
- [ ] PIN auto-assignment: create employee without PIN, verify PIN assigned
- [ ] Exit date enforcement: set exit date, try to create booking after it, verify rejection

---

## Testing Strategy

### Unit Tests:
- PIN auto-assignment: empty PIN generates unique sequential numeric PIN
- PIN auto-assignment: multiple creates produce unique PINs
- Extended fields: all new fields correctly stored and retrieved
- Partial update: updating one new field does not clear others
- Clear FK fields: explicitly nulling group IDs works
- Exit date enforcement: bookings after exit date are rejected
- Group CRUD: standard create/read/update/delete for all three group types

### Integration Tests:
- Full employee lifecycle: create with all fields, update fields, read back, deactivate
- Cross-service: daily calculation respects employee exit date
- Tariff override fields: daily_target_hours is used when "Aus Personalstamm holen" is active
- Vacation calculation: work_days_per_week and disability_flag affect vacation entitlement

### Manual Testing Steps:
1. Start dev environment with `make dev`
2. Apply migration with `make migrate-up`
3. Create employee via Swagger UI with all new fields
4. Verify all fields in GET response
5. Update specific fields and verify partial update works
6. Create employee without PIN and verify auto-assignment
7. Set exit date and verify booking creation is blocked after that date
8. Create group entities and assign to employee

## Performance Considerations

- New columns are all nullable and do not affect existing query performance
- No new JOINs in the List query (group FKs are only loaded in GetWithDetails)
- The `GetNextAvailablePIN` query uses MAX on numeric cast; for very large datasets, consider a sequence table approach in the future
- New indexes on group FK columns are lightweight (UUID columns, most will be NULL initially)

## Migration Notes

- Migration 000041 is additive only (ALTER TABLE ADD COLUMN + CREATE TABLE); no data migration needed
- All new columns are nullable; existing employee records are unaffected
- PIN column remains NOT NULL in the database; only the API/service layer changes to allow empty input (with auto-assignment)
- The `ErrPINRequired` sentinel error is kept but only raised when auto-assignment fails

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-004-personnel-master-data.md`
- Research document: `thoughts/shared/research/2026-01-29-ZMI-TICKET-004-personnel-master-data.md`
- ZMI Reference: `thoughts/shared/reference/zmi-calculation-manual-reference.md` (Sections 13, 14)
- Existing employee model: `apps/api/internal/model/employee.go`
- Existing employee service: `apps/api/internal/service/employee.go`
- Existing employee handler: `apps/api/internal/handler/employee.go`
- Existing employee repository: `apps/api/internal/repository/employee.go`
- Existing employee tests: `apps/api/internal/service/employee_test.go`, `apps/api/internal/handler/employee_test.go`
- Migration patterns: `db/migrations/000011_create_employees.up.sql`, `db/migrations/000031_add_tariff_rhythm_fields.up.sql`
- OpenAPI spec: `api/schemas/employees.yaml`, `api/paths/employees.yaml`
