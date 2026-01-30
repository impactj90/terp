# ZMI-TICKET-018: Tariff Definitions and Assignment - Implementation Plan

## Overview

Deliver the remaining gaps in the tariff definitions and assignment system: date-ranged employee-tariff assignments (replacing the single FK), effective tariff resolution by date, and full OpenAPI coverage for the new endpoints. The existing tariff CRUD, break management, rhythm settings, and bulk assignment are already implemented and only need minor modifications.

## Current State Analysis

The research phase (`thoughts/shared/research/2026-01-30-ZMI-TICKET-018-tariff-definitions-and-assignment.md`) confirms the core tariff system is **substantially complete**:

### Already Exists

| Layer | File | Status |
|---|---|---|
| Database tables | `000019` through `000051` migrations | Complete |
| Tariff GORM model | `apps/api/internal/model/tariff.go` | Complete |
| Employee GORM model | `apps/api/internal/model/employee.go` (has `TariffID` FK) | Complete but needs enhancement |
| Tariff repository | `apps/api/internal/repository/tariff.go` | Complete |
| Tariff service | `apps/api/internal/service/tariff.go` | Complete |
| Tariff handler | `apps/api/internal/handler/tariff.go` | Complete |
| Tariff OpenAPI paths | `api/paths/tariffs.yaml` | Complete |
| Tariff OpenAPI schemas | `api/schemas/tariffs.yaml` | Complete |
| Employee tariff sync | `apps/api/internal/service/employee.go` (`syncEmployeeDayPlansForTariff`) | Complete |
| Bulk tariff assign | `PATCH /employees/bulk-tariff` | Complete |
| Tariff service tests | `apps/api/internal/service/tariff_test.go` | Complete |
| Tariff handler tests | `apps/api/internal/handler/tariff_test.go` | Complete |
| Employee tariff tests | `apps/api/internal/service/employee_tariff_test.go` | Complete |
| Route registration | `apps/api/internal/handler/routes.go` lines 354-376 | Complete |
| DI wiring | `apps/api/cmd/server/main.go` | Complete |

### What Needs Implementation

1. **`employee_tariff_assignments` table**: A new join table with `employee_id`, `tariff_id`, `effective_from`, `effective_to`, and `overwrite_behavior` to support date-ranged tariff assignments. Currently the employee has a single `TariffID` FK.

2. **GORM model** for `EmployeeTariffAssignment` with proper relations.

3. **Repository** for CRUD on assignments and effective tariff resolution by date.

4. **Service** with business logic for assignment validation (no overlapping date ranges, etc.) and effective resolution.

5. **Handler** for assign/unassign/list/resolve endpoints.

6. **OpenAPI spec** for the new assignment endpoints.

7. **Tests** for effective tariff resolution (ticket test cases: tariff A Jan-Jun, tariff B Jul onward).

### Design Decisions

- The new `employee_tariff_assignments` table does NOT replace `employees.tariff_id`. The existing FK remains as the "current/default tariff" for backward compatibility with existing sync, vacation, and monthly evaluation logic. The assignments table adds date-range support on top.
- Effective tariff resolution: check `employee_tariff_assignments` first for the given date; fall back to `employees.tariff_id` if no assignment matches.
- `overwrite_behavior` column stores whether assigning this tariff should overwrite manual day plan edits (`overwrite` or `preserve_manual`). Default is `preserve_manual` (matching existing behavior).
- Macro assignments (weekly/monthly execution day) are out of scope per the ticket note "Out of scope: Actual time plan calculation." The macro concept in ZMI Section 14.2 refers to formula-based target hour overrides, which are better handled in the time plan calculation ticket.

## Desired End State

After this plan is complete:

1. An `employee_tariff_assignments` table supports date-ranged tariff assignments
2. Assigning a tariff to an employee can specify `effective_from` and `effective_to`
3. Effective tariff resolution for an employee at a given date returns the correct tariff
4. OpenAPI spec documents all new endpoints with proper schemas
5. All ticket test cases pass (June resolves tariff A, July resolves tariff B)
6. Existing tariff CRUD, break management, bulk assignment, and rhythm settings remain unchanged

---

## Phase 1: Database Migration & GORM Model

### Migration Number: 000053

#### Files to Create

**`db/migrations/000053_create_employee_tariff_assignments.up.sql`**:
```sql
-- =============================================================
-- Create employee_tariff_assignments table
-- ZMI-TICKET-018: Tariff assignment with date ranges
-- Supports assigning tariffs to employees for specific periods
-- =============================================================
CREATE TABLE employee_tariff_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    tariff_id UUID NOT NULL REFERENCES tariffs(id) ON DELETE CASCADE,
    effective_from DATE NOT NULL,
    effective_to DATE,
    overwrite_behavior VARCHAR(20) NOT NULL DEFAULT 'preserve_manual'
        CHECK (overwrite_behavior IN ('overwrite', 'preserve_manual')),
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient lookups
CREATE INDEX idx_eta_tenant ON employee_tariff_assignments(tenant_id);
CREATE INDEX idx_eta_employee ON employee_tariff_assignments(employee_id);
CREATE INDEX idx_eta_tariff ON employee_tariff_assignments(tariff_id);
CREATE INDEX idx_eta_employee_dates ON employee_tariff_assignments(employee_id, effective_from, effective_to);
CREATE INDEX idx_eta_effective_lookup ON employee_tariff_assignments(employee_id, effective_from, effective_to, is_active);

CREATE TRIGGER update_employee_tariff_assignments_updated_at
    BEFORE UPDATE ON employee_tariff_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE employee_tariff_assignments IS 'Date-ranged tariff assignments for employees. Allows specifying which tariff applies to an employee for a given period.';
COMMENT ON COLUMN employee_tariff_assignments.effective_from IS 'Start date (inclusive) when this tariff assignment takes effect.';
COMMENT ON COLUMN employee_tariff_assignments.effective_to IS 'End date (inclusive) when this tariff assignment ends. NULL means open-ended.';
COMMENT ON COLUMN employee_tariff_assignments.overwrite_behavior IS 'Whether to overwrite manual day plan edits when syncing tariff plans. Default: preserve_manual.';
COMMENT ON COLUMN employee_tariff_assignments.notes IS 'Optional notes about why this assignment was made.';
```

**`db/migrations/000053_create_employee_tariff_assignments.down.sql`**:
```sql
DROP TABLE IF EXISTS employee_tariff_assignments;
```

#### Files to Create/Modify

**Create `apps/api/internal/model/employeetariffassignment.go`**:
```go
package model

import (
    "time"

    "github.com/google/uuid"
)

// OverwriteBehavior controls how tariff assignment affects manual day plan edits.
type OverwriteBehavior string

const (
    OverwriteBehaviorOverwrite      OverwriteBehavior = "overwrite"
    OverwriteBehaviorPreserveManual OverwriteBehavior = "preserve_manual"
)

// EmployeeTariffAssignment represents a date-ranged tariff assignment for an employee.
type EmployeeTariffAssignment struct {
    ID                uuid.UUID         `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID          uuid.UUID         `gorm:"type:uuid;not null;index" json:"tenant_id"`
    EmployeeID        uuid.UUID         `gorm:"type:uuid;not null;index" json:"employee_id"`
    TariffID          uuid.UUID         `gorm:"type:uuid;not null;index" json:"tariff_id"`
    EffectiveFrom     time.Time         `gorm:"type:date;not null" json:"effective_from"`
    EffectiveTo       *time.Time        `gorm:"type:date" json:"effective_to,omitempty"`
    OverwriteBehavior OverwriteBehavior `gorm:"type:varchar(20);not null;default:preserve_manual" json:"overwrite_behavior"`
    Notes             string            `gorm:"type:text" json:"notes,omitempty"`
    IsActive          bool              `gorm:"default:true" json:"is_active"`
    CreatedAt         time.Time         `gorm:"default:now()" json:"created_at"`
    UpdatedAt         time.Time         `gorm:"default:now()" json:"updated_at"`

    // Relations
    Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
    Tariff   *Tariff   `gorm:"foreignKey:TariffID" json:"tariff,omitempty"`
}

func (EmployeeTariffAssignment) TableName() string {
    return "employee_tariff_assignments"
}

// ContainsDate returns true if the given date falls within the assignment's effective period.
func (a *EmployeeTariffAssignment) ContainsDate(date time.Time) bool {
    d := date.Truncate(24 * time.Hour)
    from := a.EffectiveFrom.Truncate(24 * time.Hour)
    if d.Before(from) {
        return false
    }
    if a.EffectiveTo != nil {
        to := a.EffectiveTo.Truncate(24 * time.Hour)
        if d.After(to) {
            return false
        }
    }
    return true
}
```

### Verification

```bash
make migrate-up              # Apply migration 000053
cd apps/api && go build ./...  # Verify model compiles
```

---

## Phase 2: OpenAPI Spec

### Files to Create

**Create `api/schemas/employee-tariff-assignments.yaml`**:
```yaml
# Employee Tariff Assignment schemas
EmployeeTariffAssignment:
  type: object
  required:
    - id
    - tenant_id
    - employee_id
    - tariff_id
    - effective_from
    - overwrite_behavior
    - is_active
  properties:
    id:
      type: string
      format: uuid
    tenant_id:
      type: string
      format: uuid
    employee_id:
      type: string
      format: uuid
    tariff_id:
      type: string
      format: uuid
    effective_from:
      type: string
      format: date
      description: "Start date (inclusive) when this tariff assignment takes effect"
    effective_to:
      type: string
      format: date
      description: "End date (inclusive). NULL means open-ended"
      x-nullable: true
    overwrite_behavior:
      type: string
      enum:
        - overwrite
        - preserve_manual
      description: "Whether to overwrite manual day plan edits when syncing"
      example: "preserve_manual"
    notes:
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
    # Expanded relations
    tariff:
      $ref: './tariffs.yaml#/TariffSummary'
    employee:
      $ref: './employees.yaml#/EmployeeSummary'

EmployeeTariffAssignmentList:
  type: object
  required:
    - data
  properties:
    data:
      type: array
      items:
        $ref: '#/EmployeeTariffAssignment'

CreateEmployeeTariffAssignmentRequest:
  type: object
  required:
    - tariff_id
    - effective_from
  properties:
    tariff_id:
      type: string
      format: uuid
    effective_from:
      type: string
      format: date
    effective_to:
      type: string
      format: date
    overwrite_behavior:
      type: string
      enum:
        - overwrite
        - preserve_manual
      default: preserve_manual
    notes:
      type: string

UpdateEmployeeTariffAssignmentRequest:
  type: object
  properties:
    effective_from:
      type: string
      format: date
    effective_to:
      type: string
      format: date
    overwrite_behavior:
      type: string
      enum:
        - overwrite
        - preserve_manual
    notes:
      type: string
    is_active:
      type: boolean

EffectiveTariffResponse:
  type: object
  required:
    - employee_id
    - date
    - source
  properties:
    employee_id:
      type: string
      format: uuid
    date:
      type: string
      format: date
    source:
      type: string
      enum:
        - assignment
        - default
        - none
      description: "'assignment' = from employee_tariff_assignments, 'default' = from employee.tariff_id, 'none' = no tariff"
    tariff:
      $ref: './tariffs.yaml#/Tariff'
    assignment:
      $ref: '#/EmployeeTariffAssignment'
```

**Create `api/paths/employee-tariff-assignments.yaml`**:
```yaml
# Employee Tariff Assignment endpoints
/employees/{id}/tariff-assignments:
  get:
    tags:
      - Employees
    summary: List tariff assignments for employee
    description: |
      Returns all tariff assignments for an employee, ordered by effective_from date.
      Each assignment represents a period where a specific tariff applies.
    operationId: listEmployeeTariffAssignments
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
        description: Employee ID
      - name: active
        in: query
        type: boolean
        description: Filter by active status
    responses:
      200:
        description: List of tariff assignments
        schema:
          $ref: '../schemas/employee-tariff-assignments.yaml#/EmployeeTariffAssignmentList'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
  post:
    tags:
      - Employees
    summary: Assign tariff to employee with date range
    description: |
      Creates a new tariff assignment for the employee with an effective date range.
      The date range must not overlap with existing active assignments.
    operationId: createEmployeeTariffAssignment
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
        description: Employee ID
      - name: body
        in: body
        required: true
        schema:
          $ref: '../schemas/employee-tariff-assignments.yaml#/CreateEmployeeTariffAssignmentRequest'
    responses:
      201:
        description: Created tariff assignment
        schema:
          $ref: '../schemas/employee-tariff-assignments.yaml#/EmployeeTariffAssignment'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
      409:
        description: Overlapping assignment exists
        schema:
          $ref: '../schemas/common.yaml#/ProblemDetails'

/employees/{id}/tariff-assignments/{assignmentId}:
  get:
    tags:
      - Employees
    summary: Get tariff assignment by ID
    operationId: getEmployeeTariffAssignment
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
      - name: assignmentId
        in: path
        required: true
        type: string
        format: uuid
    responses:
      200:
        description: Tariff assignment details
        schema:
          $ref: '../schemas/employee-tariff-assignments.yaml#/EmployeeTariffAssignment'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
  put:
    tags:
      - Employees
    summary: Update tariff assignment
    operationId: updateEmployeeTariffAssignment
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
      - name: assignmentId
        in: path
        required: true
        type: string
        format: uuid
      - name: body
        in: body
        required: true
        schema:
          $ref: '../schemas/employee-tariff-assignments.yaml#/UpdateEmployeeTariffAssignmentRequest'
    responses:
      200:
        description: Updated tariff assignment
        schema:
          $ref: '../schemas/employee-tariff-assignments.yaml#/EmployeeTariffAssignment'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
      409:
        description: Overlapping assignment exists
        schema:
          $ref: '../schemas/common.yaml#/ProblemDetails'
  delete:
    tags:
      - Employees
    summary: Delete tariff assignment
    operationId: deleteEmployeeTariffAssignment
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
      - name: assignmentId
        in: path
        required: true
        type: string
        format: uuid
    responses:
      204:
        description: Assignment deleted
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'

/employees/{id}/effective-tariff:
  get:
    tags:
      - Employees
    summary: Preview effective tariff for employee at a date
    description: |
      Resolves which tariff applies to the employee at the given date.
      Resolution order: (1) active assignment covering the date, (2) employee default tariff_id, (3) none.
    operationId: getEffectiveTariff
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
        description: Employee ID
      - name: date
        in: query
        required: true
        type: string
        format: date
        description: Date to resolve effective tariff for
    responses:
      200:
        description: Effective tariff for the given date
        schema:
          $ref: '../schemas/employee-tariff-assignments.yaml#/EffectiveTariffResponse'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
```

### Files to Modify

**Modify `api/openapi.yaml`** - Add new tag and path references:

Add tag after "Employee Capping Exceptions" tag (around line 127):
```yaml
  - name: Employee Tariff Assignments
    description: Date-ranged tariff assignments for employees
```

Add path references after the last employee path entry (after `/employees/{id}/vacation-balance` around line 208):
```yaml
  /employees/{id}/tariff-assignments:
    $ref: 'paths/employee-tariff-assignments.yaml#/~1employees~1{id}~1tariff-assignments'
  /employees/{id}/tariff-assignments/{assignmentId}:
    $ref: 'paths/employee-tariff-assignments.yaml#/~1employees~1{id}~1tariff-assignments~1{assignmentId}'
  /employees/{id}/effective-tariff:
    $ref: 'paths/employee-tariff-assignments.yaml#/~1employees~1{id}~1effective-tariff'
```

### Verification

```bash
make swagger-bundle   # Bundle multi-file spec into single file
make generate         # Generate Go models from OpenAPI
cd apps/api && go build ./...   # Verify generated models compile
```

Check that these files are generated in `apps/api/gen/models/`:
- `employee_tariff_assignment.go`
- `employee_tariff_assignment_list.go`
- `create_employee_tariff_assignment_request.go`
- `update_employee_tariff_assignment_request.go`
- `effective_tariff_response.go`

---

## Phase 3: Repository Layer

### Files to Create

**Create `apps/api/internal/repository/employeetariffassignment.go`**:

```go
package repository

// Struct: EmployeeTariffAssignmentRepository with *DB
// Constructor: NewEmployeeTariffAssignmentRepository(db *DB)
// Sentinel errors: ErrEmployeeTariffAssignmentNotFound

// Methods to implement:

// Create(ctx, assignment *model.EmployeeTariffAssignment) error
//   - r.db.GORM.WithContext(ctx).Create(assignment).Error

// GetByID(ctx, id uuid.UUID) (*model.EmployeeTariffAssignment, error)
//   - Preload("Tariff")
//   - Return ErrEmployeeTariffAssignmentNotFound if not found

// Update(ctx, assignment *model.EmployeeTariffAssignment) error
//   - r.db.GORM.WithContext(ctx).Save(assignment).Error

// Delete(ctx, id uuid.UUID) error
//   - Hard delete
//   - Return ErrEmployeeTariffAssignmentNotFound if not found

// ListByEmployee(ctx, employeeID uuid.UUID, activeOnly bool) ([]model.EmployeeTariffAssignment, error)
//   - Preload("Tariff")
//   - Filter by employee_id
//   - If activeOnly, filter is_active = true
//   - Order by effective_from ASC

// GetEffectiveForDate(ctx, employeeID uuid.UUID, date time.Time) (*model.EmployeeTariffAssignment, error)
//   - Query: employee_id = ? AND is_active = true AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
//   - Preload("Tariff", "Tariff.Breaks", "Tariff.WeekPlan", "Tariff.TariffWeekPlans", "Tariff.TariffDayPlans")
//   - Order by effective_from DESC (most specific/latest assignment wins)
//   - Return nil, nil if no assignment found (not an error, caller falls back to default)

// HasOverlap(ctx, employeeID uuid.UUID, from time.Time, to *time.Time, excludeID *uuid.UUID) (bool, error)
//   - Check if any active assignment overlaps the given date range for the employee
//   - Exclude the assignment with excludeID (for update operations)
//   - SQL logic:
//     WHERE employee_id = ? AND is_active = true
//     AND effective_from <= COALESCE(?, '9999-12-31')
//     AND COALESCE(effective_to, '9999-12-31') >= ?
//     AND (id != ? OR ? IS NULL)   -- exclude self for update
```

**Pattern reference** (follow `apps/api/internal/repository/tariff.go` pattern):
- Use `r.db.GORM.WithContext(ctx)` for all queries
- Use `errors.Is(result.Error, gorm.ErrRecordNotFound)` for not-found checks
- Define sentinel error with `errors.New(...)`
- Preload related entities in read methods

### Verification

```bash
cd apps/api && go build ./internal/repository/...
```

---

## Phase 4: Service Layer

### Files to Create

**Create `apps/api/internal/service/employeetariffassignment.go`**:

```go
package service

// Interface definitions (for testability):
// type employeeTariffAssignmentRepository interface {
//     Create(ctx, *model.EmployeeTariffAssignment) error
//     GetByID(ctx, uuid.UUID) (*model.EmployeeTariffAssignment, error)
//     Update(ctx, *model.EmployeeTariffAssignment) error
//     Delete(ctx, uuid.UUID) error
//     ListByEmployee(ctx, uuid.UUID, bool) ([]model.EmployeeTariffAssignment, error)
//     GetEffectiveForDate(ctx, uuid.UUID, time.Time) (*model.EmployeeTariffAssignment, error)
//     HasOverlap(ctx, uuid.UUID, time.Time, *time.Time, *uuid.UUID) (bool, error)
// }
//
// type employeeRepositoryForAssignment interface {
//     GetByID(ctx, uuid.UUID) (*model.Employee, error)
// }
//
// type tariffRepositoryForAssignment interface {
//     GetByID(ctx, uuid.UUID) (*model.Tariff, error)
//     GetWithDetails(ctx, uuid.UUID) (*model.Tariff, error)
// }

// Struct: EmployeeTariffAssignmentService
//   Fields: assignmentRepo, employeeRepo, tariffRepo
// Constructor: NewEmployeeTariffAssignmentService(assignmentRepo, employeeRepo, tariffRepo)

// Sentinel errors:
//   ErrAssignmentNotFound
//   ErrAssignmentOverlap        - date range overlaps existing assignment
//   ErrAssignmentInvalidDates   - effective_to before effective_from
//   ErrAssignmentEmployeeNotFound
//   ErrAssignmentTariffNotFound
//   ErrAssignmentTariffRequired - tariff_id is required
//   ErrAssignmentDateRequired   - effective_from is required

// Input structs:

// CreateEmployeeTariffAssignmentInput {
//     TenantID          uuid.UUID
//     EmployeeID        uuid.UUID
//     TariffID          uuid.UUID
//     EffectiveFrom     time.Time
//     EffectiveTo       *time.Time
//     OverwriteBehavior model.OverwriteBehavior  (default: preserve_manual)
//     Notes             string
// }

// UpdateEmployeeTariffAssignmentInput {
//     EffectiveFrom     *time.Time
//     EffectiveTo       *time.Time
//     ClearEffectiveTo  bool
//     OverwriteBehavior *model.OverwriteBehavior
//     Notes             *string
//     IsActive          *bool
// }

// EffectiveTariffResult {
//     EmployeeID  uuid.UUID
//     Date        time.Time
//     Source      string              // "assignment", "default", "none"
//     Tariff      *model.Tariff
//     Assignment  *model.EmployeeTariffAssignment
// }

// Methods:

// Create(ctx, input CreateEmployeeTariffAssignmentInput) (*model.EmployeeTariffAssignment, error)
//   1. Validate: TariffID required, EffectiveFrom required
//   2. Validate: if EffectiveTo != nil, it must be >= EffectiveFrom
//   3. Verify employee exists (employeeRepo.GetByID)
//   4. Verify tariff exists (tariffRepo.GetByID)
//   5. Check for overlapping assignments (assignmentRepo.HasOverlap)
//   6. Create assignment model, call assignmentRepo.Create
//   7. Return created assignment

// Update(ctx, assignmentID uuid.UUID, tenantID uuid.UUID, input UpdateEmployeeTariffAssignmentInput) (*model.EmployeeTariffAssignment, error)
//   1. Fetch existing assignment (assignmentRepo.GetByID)
//   2. Verify tenant matches
//   3. Apply partial updates to model fields
//   4. Validate dates if changed
//   5. Check for overlapping assignments if dates changed (exclude self)
//   6. Save updated model
//   7. Return updated assignment

// Delete(ctx, assignmentID uuid.UUID) error
//   1. Verify assignment exists
//   2. Call assignmentRepo.Delete

// ListByEmployee(ctx, employeeID uuid.UUID, activeOnly bool) ([]model.EmployeeTariffAssignment, error)
//   1. Call assignmentRepo.ListByEmployee

// GetEffectiveTariff(ctx, employeeID uuid.UUID, date time.Time) (*EffectiveTariffResult, error)
//   1. Try assignmentRepo.GetEffectiveForDate
//   2. If assignment found: return with Source="assignment", assignment's tariff (preloaded)
//   3. If no assignment: load employee (employeeRepo.GetByID)
//   4. If employee.TariffID != nil: load tariff with details, return Source="default"
//   5. If employee.TariffID == nil: return Source="none", Tariff=nil
```

### Verification

```bash
cd apps/api && go build ./internal/service/...
```

---

## Phase 5: Handler Layer

### Files to Create

**Create `apps/api/internal/handler/employeetariffassignment.go`**:

```go
package handler

// Struct: EmployeeTariffAssignmentHandler
//   Fields: service *service.EmployeeTariffAssignmentService
// Constructor: NewEmployeeTariffAssignmentHandler(svc)

// Methods (following existing tariff handler pattern):

// List(w http.ResponseWriter, r *http.Request)
//   1. Parse employee ID from chi URL param "id"
//   2. Parse optional "active" query param
//   3. Call service.ListByEmployee
//   4. Return JSON list wrapped in {data: [...]}

// Create(w http.ResponseWriter, r *http.Request)
//   1. Parse employee ID from chi URL param "id"
//   2. Extract tenant from middleware.TenantFromContext()
//   3. Decode request body using generated model CreateEmployeeTariffAssignmentRequest
//   4. Map to service input struct
//   5. Call service.Create
//   6. Map errors: ErrAssignmentOverlap -> 409, ErrAssignmentInvalidDates -> 400,
//      ErrAssignmentEmployeeNotFound -> 404, ErrAssignmentTariffNotFound -> 400
//   7. Return 201 with created assignment

// Get(w http.ResponseWriter, r *http.Request)
//   1. Parse assignment ID from chi URL param "assignmentId"
//   2. Call service.GetByID (through repo)
//   3. Return 200 with assignment

// Update(w http.ResponseWriter, r *http.Request)
//   1. Parse assignment ID from chi URL param "assignmentId"
//   2. Extract tenant from middleware.TenantFromContext()
//   3. Decode request body using generated model UpdateEmployeeTariffAssignmentRequest
//   4. Map to service input struct
//   5. Call service.Update
//   6. Map errors same as Create
//   7. Return 200 with updated assignment

// Delete(w http.ResponseWriter, r *http.Request)
//   1. Parse assignment ID from chi URL param "assignmentId"
//   2. Call service.Delete
//   3. Return 204 No Content

// GetEffective(w http.ResponseWriter, r *http.Request)
//   1. Parse employee ID from chi URL param "id"
//   2. Parse required "date" query param (format: 2006-01-02)
//   3. Call service.GetEffectiveTariff
//   4. Map result to EffectiveTariffResponse generated model
//   5. Return 200 with effective tariff response
```

### Files to Modify

**Modify `apps/api/internal/handler/routes.go`** - Add route registration:

Add new function after `RegisterTariffRoutes` (around line 376):
```go
func RegisterEmployeeTariffAssignmentRoutes(r chi.Router, h *EmployeeTariffAssignmentHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("employees.manage").String()
    r.Route("/employees/{id}/tariff-assignments", func(r chi.Router) {
        if authz == nil {
            r.Get("/", h.List)
            r.Post("/", h.Create)
            r.Get("/{assignmentId}", h.Get)
            r.Put("/{assignmentId}", h.Update)
            r.Delete("/{assignmentId}", h.Delete)
            return
        }

        r.With(authz.RequirePermission(permManage)).Get("/", h.List)
        r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
        r.With(authz.RequirePermission(permManage)).Get("/{assignmentId}", h.Get)
        r.With(authz.RequirePermission(permManage)).Put("/{assignmentId}", h.Update)
        r.With(authz.RequirePermission(permManage)).Delete("/{assignmentId}", h.Delete)
    })

    r.Route("/employees/{id}/effective-tariff", func(r chi.Router) {
        if authz == nil {
            r.Get("/", h.GetEffective)
            return
        }
        r.With(authz.RequirePermission(permManage)).Get("/", h.GetEffective)
    })
}
```

**Modify `apps/api/cmd/server/main.go`** - Wire up new service and handler:

After existing `empDayPlanRepo` initialization (around line 79), add:
```go
empTariffAssignmentRepo := repository.NewEmployeeTariffAssignmentRepository(db)
```

After existing `edpService` initialization (around line 109), add:
```go
empTariffAssignmentService := service.NewEmployeeTariffAssignmentService(empTariffAssignmentRepo, employeeRepo, tariffRepo)
```

After existing `edpHandler` initialization (around line 239), add:
```go
empTariffAssignmentHandler := handler.NewEmployeeTariffAssignmentHandler(empTariffAssignmentService)
```

In the tenant-scoped route group (around line 352, after `RegisterEmployeeDayPlanRoutes`), add:
```go
handler.RegisterEmployeeTariffAssignmentRoutes(r, empTariffAssignmentHandler, authzMiddleware)
```

### Verification

```bash
cd apps/api && go build ./...  # Full project build
```

Start the dev server and test manually:
```bash
make dev
# In another terminal:
curl -s http://localhost:8080/api/v1/employees/{id}/tariff-assignments -H "X-Tenant-ID: ..." -H "Authorization: Bearer ..."
```

---

## Phase 6: Tests

### Files to Create

**Create `apps/api/internal/service/employeetariffassignment_test.go`**:

Follow the existing `apps/api/internal/service/employee_tariff_test.go` pattern:

```go
// Test helpers:
// - createTestTenantForAssignment(t, db)
// - createTestEmployeeForAssignment(t, db, tenantID)
// - createTestTariffForAssignment(t, db, tenantID, code)
// - setupAssignmentService(t) returns (service, repos, tenant, employee, tariffA, tariffB)

// Test cases:

// TestEmployeeTariffAssignment_Create_Success
//   - Create assignment with tariff A, effective_from=2026-01-01, effective_to=2026-06-30
//   - Assert created successfully with all fields

// TestEmployeeTariffAssignment_Create_OpenEnded
//   - Create assignment with no effective_to
//   - Assert effective_to is nil

// TestEmployeeTariffAssignment_Create_TariffRequired
//   - Call create with zero-value TariffID
//   - Assert ErrAssignmentTariffRequired

// TestEmployeeTariffAssignment_Create_DateRequired
//   - Call create with zero-value EffectiveFrom
//   - Assert ErrAssignmentDateRequired

// TestEmployeeTariffAssignment_Create_InvalidDateRange
//   - Create with effective_to before effective_from
//   - Assert ErrAssignmentInvalidDates

// TestEmployeeTariffAssignment_Create_OverlapDetected
//   - Create tariff A assignment for Jan-Jun
//   - Try to create tariff B assignment for Mar-Sep (overlaps)
//   - Assert ErrAssignmentOverlap

// TestEmployeeTariffAssignment_Create_AdjacentAllowed
//   - Create tariff A Jan-Jun
//   - Create tariff B Jul-Dec (adjacent, no overlap)
//   - Assert both created successfully

// TestEmployeeTariffAssignment_Create_EmployeeNotFound
//   - Create with nonexistent employee ID
//   - Assert ErrAssignmentEmployeeNotFound

// TestEmployeeTariffAssignment_Create_TariffNotFound
//   - Create with nonexistent tariff ID
//   - Assert ErrAssignmentTariffNotFound

// TestEmployeeTariffAssignment_Update_Success
//   - Create assignment, then update dates
//   - Assert updated fields

// TestEmployeeTariffAssignment_Update_OverlapCheck
//   - Create two adjacent assignments, update first to overlap second
//   - Assert ErrAssignmentOverlap

// TestEmployeeTariffAssignment_Delete_Success
//   - Create assignment, delete it
//   - Assert ErrAssignmentNotFound when fetching deleted

// TestEmployeeTariffAssignment_ListByEmployee
//   - Create multiple assignments for same employee
//   - List returns all, ordered by effective_from ASC

// TestEffectiveTariffResolution_FromAssignment (TICKET TEST CASE 1)
//   - Arrange: tariff A assignment 2026-01-01..2026-06-30, tariff B assignment 2026-07-01..nil
//   - Assert: date 2026-06-15 resolves tariff A with source="assignment"
//   - Assert: date 2026-07-15 resolves tariff B with source="assignment"

// TestEffectiveTariffResolution_FallbackToDefault
//   - Arrange: employee has TariffID set but no assignments
//   - Assert: any date resolves default tariff with source="default"

// TestEffectiveTariffResolution_NoTariff
//   - Arrange: employee has no TariffID and no assignments
//   - Assert: any date resolves source="none" with nil tariff

// TestEffectiveTariffResolution_AssignmentOverridesDefault
//   - Arrange: employee has default TariffID, plus assignment for specific dates
//   - Assert: date in assignment range resolves assignment tariff
//   - Assert: date outside assignment range resolves default tariff

// TestEffectiveTariffResolution_InactiveAssignmentIgnored
//   - Arrange: assignment with is_active=false
//   - Assert: date falls back to default tariff
```

**Create `apps/api/internal/handler/employeetariffassignment_test.go`**:

Follow the existing `apps/api/internal/handler/tariff_test.go` pattern:

```go
// Test helper:
// setupEmployeeTariffAssignmentHandler(t) returns (handler, service, tenant, employee, tariffA, tariffB)

// Test cases:

// TestEmployeeTariffAssignmentHandler_Create_Success
//   - POST /employees/{id}/tariff-assignments with valid body
//   - Assert 201 with created assignment

// TestEmployeeTariffAssignmentHandler_Create_InvalidBody
//   - POST with malformed JSON
//   - Assert 400

// TestEmployeeTariffAssignmentHandler_Create_Overlap
//   - Create assignment, then POST overlapping
//   - Assert 409

// TestEmployeeTariffAssignmentHandler_List_Success
//   - Create 2 assignments, GET /employees/{id}/tariff-assignments
//   - Assert 200 with data array of length 2

// TestEmployeeTariffAssignmentHandler_Get_Success
//   - Create assignment, GET by ID
//   - Assert 200

// TestEmployeeTariffAssignmentHandler_Get_NotFound
//   - GET with nonexistent ID
//   - Assert 404

// TestEmployeeTariffAssignmentHandler_Update_Success
//   - Create assignment, PUT to update
//   - Assert 200 with updated fields

// TestEmployeeTariffAssignmentHandler_Delete_Success
//   - Create assignment, DELETE
//   - Assert 204

// TestEmployeeTariffAssignmentHandler_GetEffective_Success
//   - Create assignments for different date ranges
//   - GET /employees/{id}/effective-tariff?date=2026-06-15
//   - Assert 200 with correct tariff and source="assignment"

// TestEmployeeTariffAssignmentHandler_GetEffective_MissingDate
//   - GET without date param
//   - Assert 400

// TestEmployeeTariffAssignmentHandler_GetEffective_InvalidDate
//   - GET with invalid date format
//   - Assert 400

// TestEmployeeTariffAssignmentHandler_GetEffective_FallbackToDefault
//   - Employee has default tariff but no assignment for date
//   - Assert 200 with source="default"

// TestEmployeeTariffAssignmentHandler_GetEffective_NoTariff
//   - Employee has no tariff at all
//   - Assert 200 with source="none"
```

### Verification

```bash
# Run all new tests
cd apps/api && go test -v -run TestEmployeeTariffAssignment ./internal/service/...
cd apps/api && go test -v -run TestEmployeeTariffAssignment ./internal/handler/...
cd apps/api && go test -v -run TestEffectiveTariffResolution ./internal/service/...

# Run full test suite to ensure no regressions
make test
```

---

## Summary of All File Changes

### New Files (9)

| File | Purpose |
|------|---------|
| `db/migrations/000053_create_employee_tariff_assignments.up.sql` | Create employee_tariff_assignments table |
| `db/migrations/000053_create_employee_tariff_assignments.down.sql` | Drop table |
| `apps/api/internal/model/employeetariffassignment.go` | GORM model |
| `apps/api/internal/repository/employeetariffassignment.go` | Repository with CRUD and effective resolution |
| `apps/api/internal/service/employeetariffassignment.go` | Business logic and validation |
| `apps/api/internal/handler/employeetariffassignment.go` | HTTP handlers |
| `api/schemas/employee-tariff-assignments.yaml` | OpenAPI schemas |
| `api/paths/employee-tariff-assignments.yaml` | OpenAPI path definitions |
| `apps/api/internal/service/employeetariffassignment_test.go` | Service tests |
| `apps/api/internal/handler/employeetariffassignment_test.go` | Handler tests |

### Modified Files (3)

| File | Change |
|------|--------|
| `api/openapi.yaml` | Add tag and path references for new endpoints |
| `apps/api/internal/handler/routes.go` | Add `RegisterEmployeeTariffAssignmentRoutes` function |
| `apps/api/cmd/server/main.go` | Wire up new repo, service, handler |

### Unchanged Files (existing implementation already satisfies these requirements)

| File | What Remains |
|------|-------------|
| `apps/api/internal/model/tariff.go` | Full tariff definition model (no changes needed) |
| `apps/api/internal/repository/tariff.go` | Full tariff CRUD (no changes needed) |
| `apps/api/internal/service/tariff.go` | Full tariff service with validation (no changes needed) |
| `apps/api/internal/handler/tariff.go` | Full tariff handler (no changes needed) |
| `api/schemas/tariffs.yaml` | Full tariff schemas (no changes needed) |
| `api/paths/tariffs.yaml` | Full tariff paths (no changes needed) |
| `apps/api/internal/model/employee.go` | Employee with TariffID FK (kept for backward compat) |
| `apps/api/internal/service/employee.go` | syncEmployeeDayPlansForTariff (no changes needed) |

---

## Key Implementation Notes

1. **Overlap detection SQL**: Use the interval overlap formula `A.start <= B.end AND A.end >= B.start` (treating NULL end dates as infinity via `COALESCE`).

2. **Effective tariff resolution**: The `GetEffectiveForDate` repository method finds the most specific active assignment. If multiple assignments cover the same date (shouldn't happen with overlap checks, but defensive), pick the one with the latest `effective_from`.

3. **OverwriteBehavior**: The `overwrite_behavior` field on the assignment controls whether `syncEmployeeDayPlansForTariff` should overwrite manual plans. Currently the existing sync always preserves manual plans. This field provides opt-in override behavior for future use. The current implementation should read this field but the actual behavior change in `syncEmployeeDayPlansForTariff` is deferred to a follow-up if needed (the existing preserve-manual behavior is correct for most use cases).

4. **Backward compatibility**: The existing `employees.tariff_id` FK is preserved. The effective tariff resolution falls back to this field when no assignment matches the queried date. This ensures all existing functionality (vacation calculation, monthly evaluation, tariff sync) continues working without changes.

5. **Macro assignments**: The ticket mentions "Macro assignments (weekly/monthly) and execution day." Per the research, this refers to ZMI formula-based target hour overrides (Section 14.2), which are already partially covered by the `DailyTargetHours`, `WeeklyTargetHours`, `MonthlyTargetHours`, and `AnnualTargetHours` fields on the tariff model. Full macro execution is a calculation-layer concern and is out of scope for this ticket per the scope note: "Out of scope: Actual time plan calculation."
