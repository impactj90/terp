# Implementation Plan: ZMI-TICKET-031 - Plantafel (Shift Planning Board)

**Date:** 2026-01-30
**Ticket:** ZMI-TICKET-031
**Type:** Placeholder / Scaffolding
**Priority:** P3
**Dependencies:** ZMI-TICKET-004 (Employee master data - already implemented)

---

## Overview

This is a **placeholder/scaffolding** ticket for the Plantafel (Shift Planning Board) module. The data models are intentionally simple stubs. Full behavior requires separate Plantafel documentation that is not yet available.

Two entities:
1. **Shift** - A shift definition with code/name, optional day plan link, qualification text, and color for board display (code/name entity)
2. **Shift Assignment** - Links employees to shifts for a date range (association entity with ValidFrom/ValidTo)

Both follow standard CRUD patterns established in the codebase. The Shift entity follows the Vehicle pattern (code/name with domain fields). The ShiftAssignment entity follows the EmployeeAccessAssignment pattern (employee-to-entity with date range).

**Important distinction:** This is about the administrative shift planning board (Plantafel), which is separate from the automatic shift detection (Schichterkennung) already implemented on DayPlan models. The Plantafel is about manually planning and assigning shifts to employees, while Schichterkennung is about runtime auto-detection.

---

## Phase 1: Database Migrations

**Depends on:** Nothing
**Pattern reference:** `/home/tolga/projects/terp/db/migrations/000073_create_access_control.up.sql`

### Files to Create

#### `db/migrations/000076_create_shift_planning.up.sql`

```sql
-- Shifts: shift definitions for the planning board (placeholder)
CREATE TABLE shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    day_plan_id UUID REFERENCES day_plans(id) ON DELETE SET NULL,
    color VARCHAR(7),
    qualification TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_shifts_tenant ON shifts(tenant_id);
CREATE INDEX idx_shifts_day_plan ON shifts(day_plan_id);

CREATE TRIGGER update_shifts_updated_at
    BEFORE UPDATE ON shifts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE shifts IS 'Shift definitions for the planning board / Plantafel (placeholder - requires separate Plantafel documentation)';

-- Shift assignments: links employees to shifts for date ranges
CREATE TABLE shift_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    valid_from DATE,
    valid_to DATE,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_shift_assignments_tenant ON shift_assignments(tenant_id);
CREATE INDEX idx_shift_assignments_employee ON shift_assignments(employee_id);
CREATE INDEX idx_shift_assignments_shift ON shift_assignments(shift_id);
CREATE INDEX idx_shift_assignments_dates ON shift_assignments(valid_from, valid_to);

CREATE TRIGGER update_shift_assignments_updated_at
    BEFORE UPDATE ON shift_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE shift_assignments IS 'Employee-to-shift assignments with date ranges (placeholder - requires separate Plantafel documentation)';
```

#### `db/migrations/000076_create_shift_planning.down.sql`

```sql
DROP TABLE IF EXISTS shift_assignments;
DROP TABLE IF EXISTS shifts;
```

### Verification

```bash
make migrate-up
# Should apply migration 000076 without errors
make migrate-down
# Should rollback cleanly
make migrate-up
# Re-apply to leave DB in correct state
```

---

## Phase 2: OpenAPI Spec

**Depends on:** Nothing (can be done in parallel with Phase 1)
**Pattern reference:**
- Schema: `/home/tolga/projects/terp/api/schemas/access-control.yaml`
- Paths: `/home/tolga/projects/terp/api/paths/access-control.yaml`
- Main spec: `/home/tolga/projects/terp/api/openapi.yaml`

### Files to Create

#### `api/schemas/shift-planning.yaml`

```yaml
# Shift schemas
Shift:
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
      example: "SHIFT-EARLY"
    name:
      type: string
      example: "Early Shift"
    description:
      type: string
      x-nullable: true
    day_plan_id:
      type: string
      format: uuid
      x-nullable: true
    color:
      type: string
      example: "#2196F3"
      x-nullable: true
    qualification:
      type: string
      x-nullable: true
    is_active:
      type: boolean
      example: true
    sort_order:
      type: integer
      example: 0
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time

CreateShiftRequest:
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
    day_plan_id:
      type: string
      format: uuid
    color:
      type: string
      maxLength: 7
    qualification:
      type: string
    sort_order:
      type: integer

UpdateShiftRequest:
  type: object
  properties:
    name:
      type: string
      minLength: 1
      maxLength: 255
    description:
      type: string
    day_plan_id:
      type: string
      format: uuid
    color:
      type: string
      maxLength: 7
    qualification:
      type: string
    is_active:
      type: boolean
    sort_order:
      type: integer

ShiftList:
  type: object
  required:
    - data
  properties:
    data:
      type: array
      items:
        $ref: '#/Shift'

# Shift Assignment schemas
ShiftAssignment:
  type: object
  required:
    - id
    - tenant_id
    - employee_id
    - shift_id
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
    shift_id:
      type: string
      format: uuid
    valid_from:
      type: string
      format: date
      x-nullable: true
    valid_to:
      type: string
      format: date
      x-nullable: true
    notes:
      type: string
      x-nullable: true
    is_active:
      type: boolean
      example: true
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time

CreateShiftAssignmentRequest:
  type: object
  required:
    - employee_id
    - shift_id
  properties:
    employee_id:
      type: string
      format: uuid
    shift_id:
      type: string
      format: uuid
    valid_from:
      type: string
      format: date
    valid_to:
      type: string
      format: date
    notes:
      type: string

UpdateShiftAssignmentRequest:
  type: object
  properties:
    valid_from:
      type: string
      format: date
    valid_to:
      type: string
      format: date
    notes:
      type: string
    is_active:
      type: boolean

ShiftAssignmentList:
  type: object
  required:
    - data
  properties:
    data:
      type: array
      items:
        $ref: '#/ShiftAssignment'
```

#### `api/paths/shift-planning.yaml`

```yaml
# Shift endpoints
/shifts:
  get:
    tags:
      - Shifts
    summary: List shifts
    description: |
      Returns all shift definitions for the tenant.
      Placeholder - requires separate Plantafel documentation for full implementation.
    operationId: listShifts
    responses:
      200:
        description: List of shifts
        schema:
          $ref: '../schemas/shift-planning.yaml#/ShiftList'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
  post:
    tags:
      - Shifts
    summary: Create shift
    description: |
      Creates a new shift definition with a unique code.
      Placeholder - requires separate Plantafel documentation for full implementation.
    operationId: createShift
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '../schemas/shift-planning.yaml#/CreateShiftRequest'
    responses:
      201:
        description: Created shift
        schema:
          $ref: '../schemas/shift-planning.yaml#/Shift'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      409:
        description: Code already exists
        schema:
          $ref: '../schemas/common.yaml#/ProblemDetails'

/shifts/{id}:
  get:
    tags:
      - Shifts
    summary: Get shift by ID
    description: |
      Retrieves shift definition details.
      Placeholder - requires separate Plantafel documentation for full implementation.
    operationId: getShift
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
    responses:
      200:
        description: Shift details
        schema:
          $ref: '../schemas/shift-planning.yaml#/Shift'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
  patch:
    tags:
      - Shifts
    summary: Update shift
    description: |
      Updates shift definition properties. Code cannot be changed.
      Placeholder - requires separate Plantafel documentation for full implementation.
    operationId: updateShift
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
      - name: body
        in: body
        required: true
        schema:
          $ref: '../schemas/shift-planning.yaml#/UpdateShiftRequest'
    responses:
      200:
        description: Updated shift
        schema:
          $ref: '../schemas/shift-planning.yaml#/Shift'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
  delete:
    tags:
      - Shifts
    summary: Delete shift
    description: |
      Permanently removes a shift definition. Fails if shift assignments reference it.
      Placeholder - requires separate Plantafel documentation for full implementation.
    operationId: deleteShift
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
    responses:
      204:
        description: Shift deleted
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
      409:
        description: Shift is in use by shift assignments
        schema:
          $ref: '../schemas/common.yaml#/ProblemDetails'

# Shift Assignment endpoints
/shift-assignments:
  get:
    tags:
      - Shift Assignments
    summary: List shift assignments
    description: |
      Returns all shift assignments for the tenant.
      Placeholder - requires separate Plantafel documentation for full implementation.
    operationId: listShiftAssignments
    responses:
      200:
        description: List of shift assignments
        schema:
          $ref: '../schemas/shift-planning.yaml#/ShiftAssignmentList'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
  post:
    tags:
      - Shift Assignments
    summary: Create shift assignment
    description: |
      Assigns a shift to an employee for an optional date range.
      Placeholder - requires separate Plantafel documentation for full implementation.
    operationId: createShiftAssignment
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '../schemas/shift-planning.yaml#/CreateShiftAssignmentRequest'
    responses:
      201:
        description: Created shift assignment
        schema:
          $ref: '../schemas/shift-planning.yaml#/ShiftAssignment'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'

/shift-assignments/{id}:
  get:
    tags:
      - Shift Assignments
    summary: Get shift assignment by ID
    description: |
      Retrieves shift assignment details.
      Placeholder - requires separate Plantafel documentation for full implementation.
    operationId: getShiftAssignment
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
    responses:
      200:
        description: Shift assignment details
        schema:
          $ref: '../schemas/shift-planning.yaml#/ShiftAssignment'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
  patch:
    tags:
      - Shift Assignments
    summary: Update shift assignment
    description: |
      Updates shift assignment properties (date range, notes, active status).
      Placeholder - requires separate Plantafel documentation for full implementation.
    operationId: updateShiftAssignment
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
      - name: body
        in: body
        required: true
        schema:
          $ref: '../schemas/shift-planning.yaml#/UpdateShiftAssignmentRequest'
    responses:
      200:
        description: Updated shift assignment
        schema:
          $ref: '../schemas/shift-planning.yaml#/ShiftAssignment'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
  delete:
    tags:
      - Shift Assignments
    summary: Delete shift assignment
    description: |
      Permanently removes a shift assignment.
      Placeholder - requires separate Plantafel documentation for full implementation.
    operationId: deleteShiftAssignment
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
    responses:
      204:
        description: Shift assignment deleted
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
```

### File to Modify

#### `api/openapi.yaml`

1. **Add tags** (after "Travel Allowance" tag, around line 173):
```yaml
  - name: Shifts
    description: Shift definition management for the planning board / Plantafel (placeholder - requires separate Plantafel documentation)
  - name: Shift Assignments
    description: Employee-to-shift assignment management for the planning board (placeholder)
```

2. **Add paths** (after Travel Allowance Preview path, around line 742):
```yaml
  # Shift Planning (Plantafel)
  /shifts:
    $ref: 'paths/shift-planning.yaml#/~1shifts'
  /shifts/{id}:
    $ref: 'paths/shift-planning.yaml#/~1shifts~1{id}'
  /shift-assignments:
    $ref: 'paths/shift-planning.yaml#/~1shift-assignments'
  /shift-assignments/{id}:
    $ref: 'paths/shift-planning.yaml#/~1shift-assignments~1{id}'
```

3. **Add definitions** (after Travel Allowance Preview definitions, around line 1541):
```yaml
  # Shift Planning (Plantafel)
  Shift:
    $ref: 'schemas/shift-planning.yaml#/Shift'
  CreateShiftRequest:
    $ref: 'schemas/shift-planning.yaml#/CreateShiftRequest'
  UpdateShiftRequest:
    $ref: 'schemas/shift-planning.yaml#/UpdateShiftRequest'
  ShiftList:
    $ref: 'schemas/shift-planning.yaml#/ShiftList'
  ShiftAssignment:
    $ref: 'schemas/shift-planning.yaml#/ShiftAssignment'
  CreateShiftAssignmentRequest:
    $ref: 'schemas/shift-planning.yaml#/CreateShiftAssignmentRequest'
  UpdateShiftAssignmentRequest:
    $ref: 'schemas/shift-planning.yaml#/UpdateShiftAssignmentRequest'
  ShiftAssignmentList:
    $ref: 'schemas/shift-planning.yaml#/ShiftAssignmentList'
```

### Verification

```bash
make swagger-bundle
# Should produce api/openapi.bundled.yaml without errors
```

---

## Phase 3: Generate Models from OpenAPI

**Depends on:** Phase 2

### Command

```bash
make generate
```

This will generate Go models into `apps/api/gen/models/` including:
- `shift.go`
- `create_shift_request.go`
- `update_shift_request.go`
- `shift_list.go`
- `shift_assignment.go`
- `create_shift_assignment_request.go`
- `update_shift_assignment_request.go`
- `shift_assignment_list.go`

### Verification

```bash
cd apps/api && go build ./...
# Should compile without errors
```

---

## Phase 4: Domain Models (GORM structs)

**Depends on:** Phase 1 (table names must match)
**Pattern reference:**
- `/home/tolga/projects/terp/apps/api/internal/model/vehicle.go`
- `/home/tolga/projects/terp/apps/api/internal/model/employee_access_assignment.go`

### Files to Create

#### `apps/api/internal/model/shift.go`

```go
package model

import (
	"time"

	"github.com/google/uuid"
)

// Shift represents a shift definition for the planning board / Plantafel (placeholder).
type Shift struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID      uuid.UUID  `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Code          string     `gorm:"type:varchar(50);not null" json:"code"`
	Name          string     `gorm:"type:varchar(255);not null" json:"name"`
	Description   string     `gorm:"type:text" json:"description,omitempty"`
	DayPlanID     *uuid.UUID `gorm:"type:uuid" json:"day_plan_id,omitempty"`
	Color         string     `gorm:"type:varchar(7)" json:"color,omitempty"`
	Qualification string     `gorm:"type:text" json:"qualification,omitempty"`
	IsActive      bool       `gorm:"default:true" json:"is_active"`
	SortOrder     int        `gorm:"default:0" json:"sort_order"`
	CreatedAt     time.Time  `gorm:"default:now()" json:"created_at"`
	UpdatedAt     time.Time  `gorm:"default:now()" json:"updated_at"`

	// Relations
	DayPlan *DayPlan `gorm:"foreignKey:DayPlanID" json:"day_plan,omitempty"`
}

func (Shift) TableName() string {
	return "shifts"
}
```

#### `apps/api/internal/model/shift_assignment.go`

```go
package model

import (
	"time"

	"github.com/google/uuid"
)

// ShiftAssignment links employees to shifts for date ranges (placeholder).
type ShiftAssignment struct {
	ID         uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID   uuid.UUID  `gorm:"type:uuid;not null;index" json:"tenant_id"`
	EmployeeID uuid.UUID  `gorm:"type:uuid;not null;index" json:"employee_id"`
	ShiftID    uuid.UUID  `gorm:"type:uuid;not null;index" json:"shift_id"`
	ValidFrom  *time.Time `gorm:"type:date" json:"valid_from,omitempty"`
	ValidTo    *time.Time `gorm:"type:date" json:"valid_to,omitempty"`
	Notes      string     `gorm:"type:text" json:"notes,omitempty"`
	IsActive   bool       `gorm:"default:true" json:"is_active"`
	CreatedAt  time.Time  `gorm:"default:now()" json:"created_at"`
	UpdatedAt  time.Time  `gorm:"default:now()" json:"updated_at"`

	// Relations
	Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
	Shift    *Shift    `gorm:"foreignKey:ShiftID" json:"shift,omitempty"`
}

func (ShiftAssignment) TableName() string {
	return "shift_assignments"
}
```

### Verification

```bash
cd apps/api && go build ./...
```

---

## Phase 5: Repository Layer

**Depends on:** Phase 4
**Pattern reference:**
- `/home/tolga/projects/terp/apps/api/internal/repository/vehicle.go`
- `/home/tolga/projects/terp/apps/api/internal/repository/employee_access_assignment.go`

### Files to Create

#### `apps/api/internal/repository/shift.go`

Standard CRUD repository following Vehicle pattern:

```go
package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var ErrShiftNotFound = errors.New("shift not found")

type ShiftRepository struct {
	db *DB
}

func NewShiftRepository(db *DB) *ShiftRepository {
	return &ShiftRepository{db: db}
}

func (r *ShiftRepository) Create(ctx context.Context, s *model.Shift) error {
	return r.db.GORM.WithContext(ctx).Create(s).Error
}

func (r *ShiftRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Shift, error) {
	var s model.Shift
	err := r.db.GORM.WithContext(ctx).First(&s, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrShiftNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get shift: %w", err)
	}
	return &s, nil
}

func (r *ShiftRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.Shift, error) {
	var s model.Shift
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&s).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrShiftNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get shift by code: %w", err)
	}
	return &s, nil
}

func (r *ShiftRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.Shift, error) {
	var shifts []model.Shift
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("sort_order ASC, code ASC").
		Find(&shifts).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list shifts: %w", err)
	}
	return shifts, nil
}

func (r *ShiftRepository) Update(ctx context.Context, s *model.Shift) error {
	return r.db.GORM.WithContext(ctx).Save(s).Error
}

func (r *ShiftRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.Shift{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete shift: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrShiftNotFound
	}
	return nil
}

func (r *ShiftRepository) HasAssignments(ctx context.Context, shiftID uuid.UUID) (bool, error) {
	var count int64
	err := r.db.GORM.WithContext(ctx).
		Model(&model.ShiftAssignment{}).
		Where("shift_id = ?", shiftID).
		Count(&count).Error
	if err != nil {
		return false, fmt.Errorf("failed to check shift assignments: %w", err)
	}
	return count > 0, nil
}
```

#### `apps/api/internal/repository/shift_assignment.go`

Follow EmployeeAccessAssignment pattern:

```go
package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var ErrShiftAssignmentNotFound = errors.New("shift assignment not found")

type ShiftAssignmentRepository struct {
	db *DB
}

func NewShiftAssignmentRepository(db *DB) *ShiftAssignmentRepository {
	return &ShiftAssignmentRepository{db: db}
}

func (r *ShiftAssignmentRepository) Create(ctx context.Context, a *model.ShiftAssignment) error {
	return r.db.GORM.WithContext(ctx).Create(a).Error
}

func (r *ShiftAssignmentRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.ShiftAssignment, error) {
	var a model.ShiftAssignment
	err := r.db.GORM.WithContext(ctx).
		Preload("Employee").
		Preload("Shift").
		First(&a, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrShiftAssignmentNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get shift assignment: %w", err)
	}
	return &a, nil
}

func (r *ShiftAssignmentRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.ShiftAssignment, error) {
	var assignments []model.ShiftAssignment
	err := r.db.GORM.WithContext(ctx).
		Preload("Employee").
		Preload("Shift").
		Where("tenant_id = ?", tenantID).
		Order("created_at DESC").
		Find(&assignments).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list shift assignments: %w", err)
	}
	return assignments, nil
}

func (r *ShiftAssignmentRepository) Update(ctx context.Context, a *model.ShiftAssignment) error {
	return r.db.GORM.WithContext(ctx).Save(a).Error
}

func (r *ShiftAssignmentRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.ShiftAssignment{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete shift assignment: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrShiftAssignmentNotFound
	}
	return nil
}
```

### Verification

```bash
cd apps/api && go build ./...
```

---

## Phase 6: Service Layer

**Depends on:** Phase 5
**Pattern reference:**
- `/home/tolga/projects/terp/apps/api/internal/service/vehicle.go`
- `/home/tolga/projects/terp/apps/api/internal/service/employee_access_assignment.go`

### Files to Create

#### `apps/api/internal/service/shift.go`

Follow VehicleService pattern:

```go
package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrShiftNotFound     = errors.New("shift not found")
	ErrShiftCodeRequired = errors.New("shift code is required")
	ErrShiftNameRequired = errors.New("shift name is required")
	ErrShiftCodeExists   = errors.New("shift code already exists for this tenant")
	ErrShiftInUse        = errors.New("shift is in use by assignments")
)

type shiftRepository interface {
	Create(ctx context.Context, s *model.Shift) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.Shift, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.Shift, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.Shift, error)
	Update(ctx context.Context, s *model.Shift) error
	Delete(ctx context.Context, id uuid.UUID) error
	HasAssignments(ctx context.Context, shiftID uuid.UUID) (bool, error)
}

type ShiftService struct {
	repo shiftRepository
}

func NewShiftService(repo shiftRepository) *ShiftService {
	return &ShiftService{repo: repo}
}

type CreateShiftInput struct {
	TenantID      uuid.UUID
	Code          string
	Name          string
	Description   string
	DayPlanID     *uuid.UUID
	Color         string
	Qualification string
	SortOrder     *int
}

func (s *ShiftService) Create(ctx context.Context, input CreateShiftInput) (*model.Shift, error) {
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrShiftCodeRequired
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrShiftNameRequired
	}

	// Check uniqueness within tenant
	existing, err := s.repo.GetByCode(ctx, input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrShiftCodeExists
	}

	shift := &model.Shift{
		TenantID:      input.TenantID,
		Code:          code,
		Name:          name,
		Description:   strings.TrimSpace(input.Description),
		DayPlanID:     input.DayPlanID,
		Color:         strings.TrimSpace(input.Color),
		Qualification: strings.TrimSpace(input.Qualification),
		IsActive:      true,
	}
	if input.SortOrder != nil {
		shift.SortOrder = *input.SortOrder
	}

	if err := s.repo.Create(ctx, shift); err != nil {
		return nil, err
	}
	return shift, nil
}

func (s *ShiftService) GetByID(ctx context.Context, id uuid.UUID) (*model.Shift, error) {
	shift, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrShiftNotFound
	}
	return shift, nil
}

type UpdateShiftInput struct {
	Name          *string
	Description   *string
	DayPlanID     *uuid.UUID
	Color         *string
	Qualification *string
	IsActive      *bool
	SortOrder     *int
}

func (s *ShiftService) Update(ctx context.Context, id uuid.UUID, input UpdateShiftInput) (*model.Shift, error) {
	shift, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrShiftNotFound
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrShiftNameRequired
		}
		shift.Name = name
	}
	if input.Description != nil {
		shift.Description = strings.TrimSpace(*input.Description)
	}
	if input.DayPlanID != nil {
		shift.DayPlanID = input.DayPlanID
	}
	if input.Color != nil {
		shift.Color = strings.TrimSpace(*input.Color)
	}
	if input.Qualification != nil {
		shift.Qualification = strings.TrimSpace(*input.Qualification)
	}
	if input.IsActive != nil {
		shift.IsActive = *input.IsActive
	}
	if input.SortOrder != nil {
		shift.SortOrder = *input.SortOrder
	}

	if err := s.repo.Update(ctx, shift); err != nil {
		return nil, err
	}
	return shift, nil
}

func (s *ShiftService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return ErrShiftNotFound
	}

	hasAssignments, err := s.repo.HasAssignments(ctx, id)
	if err != nil {
		return err
	}
	if hasAssignments {
		return ErrShiftInUse
	}

	return s.repo.Delete(ctx, id)
}

func (s *ShiftService) List(ctx context.Context, tenantID uuid.UUID) ([]model.Shift, error) {
	return s.repo.List(ctx, tenantID)
}
```

#### `apps/api/internal/service/shift_assignment.go`

Follow EmployeeAccessAssignmentService pattern:

```go
package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrShiftAssignmentNotFound        = errors.New("shift assignment not found")
	ErrShiftAssignmentEmployeeRequired = errors.New("employee ID is required")
	ErrShiftAssignmentShiftRequired    = errors.New("shift ID is required")
)

type shiftAssignmentRepository interface {
	Create(ctx context.Context, a *model.ShiftAssignment) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.ShiftAssignment, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.ShiftAssignment, error)
	Update(ctx context.Context, a *model.ShiftAssignment) error
	Delete(ctx context.Context, id uuid.UUID) error
}

type ShiftAssignmentService struct {
	repo shiftAssignmentRepository
}

func NewShiftAssignmentService(repo shiftAssignmentRepository) *ShiftAssignmentService {
	return &ShiftAssignmentService{repo: repo}
}

type CreateShiftAssignmentInput struct {
	TenantID   uuid.UUID
	EmployeeID uuid.UUID
	ShiftID    uuid.UUID
	ValidFrom  *time.Time
	ValidTo    *time.Time
	Notes      string
}

func (s *ShiftAssignmentService) Create(ctx context.Context, input CreateShiftAssignmentInput) (*model.ShiftAssignment, error) {
	if input.EmployeeID == uuid.Nil {
		return nil, ErrShiftAssignmentEmployeeRequired
	}
	if input.ShiftID == uuid.Nil {
		return nil, ErrShiftAssignmentShiftRequired
	}

	a := &model.ShiftAssignment{
		TenantID:   input.TenantID,
		EmployeeID: input.EmployeeID,
		ShiftID:    input.ShiftID,
		ValidFrom:  input.ValidFrom,
		ValidTo:    input.ValidTo,
		Notes:      strings.TrimSpace(input.Notes),
		IsActive:   true,
	}

	if err := s.repo.Create(ctx, a); err != nil {
		return nil, err
	}
	return a, nil
}

func (s *ShiftAssignmentService) GetByID(ctx context.Context, id uuid.UUID) (*model.ShiftAssignment, error) {
	a, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrShiftAssignmentNotFound
	}
	return a, nil
}

type UpdateShiftAssignmentInput struct {
	ValidFrom *time.Time
	ValidTo   *time.Time
	Notes     *string
	IsActive  *bool
}

func (s *ShiftAssignmentService) Update(ctx context.Context, id uuid.UUID, input UpdateShiftAssignmentInput) (*model.ShiftAssignment, error) {
	a, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrShiftAssignmentNotFound
	}

	if input.ValidFrom != nil {
		a.ValidFrom = input.ValidFrom
	}
	if input.ValidTo != nil {
		a.ValidTo = input.ValidTo
	}
	if input.Notes != nil {
		a.Notes = strings.TrimSpace(*input.Notes)
	}
	if input.IsActive != nil {
		a.IsActive = *input.IsActive
	}

	if err := s.repo.Update(ctx, a); err != nil {
		return nil, err
	}
	return a, nil
}

func (s *ShiftAssignmentService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return ErrShiftAssignmentNotFound
	}

	return s.repo.Delete(ctx, id)
}

func (s *ShiftAssignmentService) List(ctx context.Context, tenantID uuid.UUID) ([]model.ShiftAssignment, error) {
	return s.repo.List(ctx, tenantID)
}
```

### Verification

```bash
cd apps/api && go build ./...
```

---

## Phase 7: Handler Layer + Route Registration

**Depends on:** Phase 3 (generated models) + Phase 6
**Pattern reference:**
- Handler: `/home/tolga/projects/terp/apps/api/internal/handler/vehicle.go`
- Assignment handler: `/home/tolga/projects/terp/apps/api/internal/handler/employee_access_assignment.go`
- Routes: `/home/tolga/projects/terp/apps/api/internal/handler/routes.go`
- Main wiring: `/home/tolga/projects/terp/apps/api/cmd/server/main.go`

### Files to Create

#### `apps/api/internal/handler/shift.go`

Follow VehicleHandler pattern:

```go
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

type ShiftHandler struct {
	svc *service.ShiftService
}

func NewShiftHandler(svc *service.ShiftService) *ShiftHandler {
	return &ShiftHandler{svc: svc}
}

func (h *ShiftHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	shifts, err := h.svc.List(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list shifts")
		return
	}
	respondJSON(w, http.StatusOK, shiftListToResponse(shifts))
}

func (h *ShiftHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid shift ID")
		return
	}

	s, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Shift not found")
		return
	}

	respondJSON(w, http.StatusOK, shiftToResponse(s))
}

func (h *ShiftHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateShiftRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateShiftInput{
		TenantID:      tenantID,
		Code:          *req.Code,
		Name:          *req.Name,
		Description:   req.Description,
		Color:         req.Color,
		Qualification: req.Qualification,
	}

	if req.DayPlanID != "" {
		dpID, err := uuid.Parse(req.DayPlanID.String())
		if err == nil {
			input.DayPlanID = &dpID
		}
	}

	if req.SortOrder != 0 {
		so := int(req.SortOrder)
		input.SortOrder = &so
	}

	s, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleShiftError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, shiftToResponse(s))
}

func (h *ShiftHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid shift ID")
		return
	}

	var req models.UpdateShiftRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateShiftInput{}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	if req.DayPlanID != "" {
		dpID, err := uuid.Parse(req.DayPlanID.String())
		if err == nil {
			input.DayPlanID = &dpID
		}
	}
	if req.Color != "" {
		input.Color = &req.Color
	}
	if req.Qualification != "" {
		input.Qualification = &req.Qualification
	}
	input.IsActive = &req.IsActive
	if req.SortOrder != 0 {
		so := int(req.SortOrder)
		input.SortOrder = &so
	}

	s, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleShiftError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, shiftToResponse(s))
}

func (h *ShiftHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid shift ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleShiftError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func shiftToResponse(s *model.Shift) *models.Shift {
	id := strfmt.UUID(s.ID.String())
	tenantID := strfmt.UUID(s.TenantID.String())

	resp := &models.Shift{
		ID:            &id,
		TenantID:      &tenantID,
		Code:          &s.Code,
		Name:          &s.Name,
		Description:   &s.Description,
		Color:         &s.Color,
		Qualification: &s.Qualification,
		IsActive:      s.IsActive,
		SortOrder:     int64(s.SortOrder),
		CreatedAt:     strfmt.DateTime(s.CreatedAt),
		UpdatedAt:     strfmt.DateTime(s.UpdatedAt),
	}

	if s.DayPlanID != nil {
		dpID := strfmt.UUID(s.DayPlanID.String())
		resp.DayPlanID = &dpID
	}

	return resp
}

func shiftListToResponse(shifts []model.Shift) models.ShiftList {
	data := make([]*models.Shift, 0, len(shifts))
	for i := range shifts {
		data = append(data, shiftToResponse(&shifts[i]))
	}
	return models.ShiftList{Data: data}
}

func handleShiftError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrShiftNotFound:
		respondError(w, http.StatusNotFound, "Shift not found")
	case service.ErrShiftCodeRequired:
		respondError(w, http.StatusBadRequest, "Shift code is required")
	case service.ErrShiftNameRequired:
		respondError(w, http.StatusBadRequest, "Shift name is required")
	case service.ErrShiftCodeExists:
		respondError(w, http.StatusConflict, "A shift with this code already exists")
	case service.ErrShiftInUse:
		respondError(w, http.StatusConflict, "Shift is in use by assignments")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
```

**Note on generated model fields:** The exact field names and types in the generated `models.Shift` and `models.CreateShiftRequest` depend on the go-swagger output. The handler must match the generated model fields. If `DayPlanID` is generated as `strfmt.UUID` rather than a pointer, adjust the handler parsing accordingly. Always verify after `make generate` and adjust the handler code to match the generated struct signatures.

#### `apps/api/internal/handler/shift_assignment.go`

Follow EmployeeAccessAssignmentHandler pattern:

```go
package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

type ShiftAssignmentHandler struct {
	svc *service.ShiftAssignmentService
}

func NewShiftAssignmentHandler(svc *service.ShiftAssignmentService) *ShiftAssignmentHandler {
	return &ShiftAssignmentHandler{svc: svc}
}

func (h *ShiftAssignmentHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	assignments, err := h.svc.List(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list shift assignments")
		return
	}
	respondJSON(w, http.StatusOK, shiftAssignmentListToResponse(assignments))
}

func (h *ShiftAssignmentHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid shift assignment ID")
		return
	}

	a, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Shift assignment not found")
		return
	}

	respondJSON(w, http.StatusOK, shiftAssignmentToResponse(a))
}

func (h *ShiftAssignmentHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateShiftAssignmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	employeeID, err := uuid.Parse(req.EmployeeID.String())
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}
	shiftID, err := uuid.Parse(req.ShiftID.String())
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid shift ID")
		return
	}

	input := service.CreateShiftAssignmentInput{
		TenantID:   tenantID,
		EmployeeID: employeeID,
		ShiftID:    shiftID,
		Notes:      req.Notes,
	}

	if !time.Time(req.ValidFrom).IsZero() {
		vf := time.Time(req.ValidFrom)
		input.ValidFrom = &vf
	}
	if !time.Time(req.ValidTo).IsZero() {
		vt := time.Time(req.ValidTo)
		input.ValidTo = &vt
	}

	a, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleShiftAssignmentError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, shiftAssignmentToResponse(a))
}

func (h *ShiftAssignmentHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid shift assignment ID")
		return
	}

	var req models.UpdateShiftAssignmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateShiftAssignmentInput{}
	if !time.Time(req.ValidFrom).IsZero() {
		vf := time.Time(req.ValidFrom)
		input.ValidFrom = &vf
	}
	if !time.Time(req.ValidTo).IsZero() {
		vt := time.Time(req.ValidTo)
		input.ValidTo = &vt
	}
	if req.Notes != "" {
		input.Notes = &req.Notes
	}
	input.IsActive = &req.IsActive

	a, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleShiftAssignmentError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, shiftAssignmentToResponse(a))
}

func (h *ShiftAssignmentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid shift assignment ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleShiftAssignmentError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func shiftAssignmentToResponse(a *model.ShiftAssignment) *models.ShiftAssignment {
	id := strfmt.UUID(a.ID.String())
	tenantID := strfmt.UUID(a.TenantID.String())
	employeeID := strfmt.UUID(a.EmployeeID.String())
	shiftID := strfmt.UUID(a.ShiftID.String())

	resp := &models.ShiftAssignment{
		ID:         &id,
		TenantID:   &tenantID,
		EmployeeID: &employeeID,
		ShiftID:    &shiftID,
		Notes:      &a.Notes,
		IsActive:   a.IsActive,
		CreatedAt:  strfmt.DateTime(a.CreatedAt),
		UpdatedAt:  strfmt.DateTime(a.UpdatedAt),
	}

	if a.ValidFrom != nil {
		vf := strfmt.Date(*a.ValidFrom)
		resp.ValidFrom = &vf
	}
	if a.ValidTo != nil {
		vt := strfmt.Date(*a.ValidTo)
		resp.ValidTo = &vt
	}

	return resp
}

func shiftAssignmentListToResponse(assignments []model.ShiftAssignment) models.ShiftAssignmentList {
	data := make([]*models.ShiftAssignment, 0, len(assignments))
	for i := range assignments {
		data = append(data, shiftAssignmentToResponse(&assignments[i]))
	}
	return models.ShiftAssignmentList{Data: data}
}

func handleShiftAssignmentError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrShiftAssignmentNotFound:
		respondError(w, http.StatusNotFound, "Shift assignment not found")
	case service.ErrShiftAssignmentEmployeeRequired:
		respondError(w, http.StatusBadRequest, "Employee ID is required")
	case service.ErrShiftAssignmentShiftRequired:
		respondError(w, http.StatusBadRequest, "Shift ID is required")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
```

**Note on generated model fields:** Same caveat as with the Shift handler. The field names, types, and pointer semantics in `models.CreateShiftAssignmentRequest`, `models.UpdateShiftAssignmentRequest`, and `models.ShiftAssignment` depend on go-swagger output. Verify after `make generate` and adjust handler parsing/mapping accordingly. The date fields (`ValidFrom`, `ValidTo`) are expected to be `strfmt.Date` (not pointers) in the generated models, matching the EmployeeAccessAssignment pattern.

### Files to Modify

#### `apps/api/internal/handler/routes.go`

Add two route registration functions after `RegisterTravelAllowancePreviewRoutes` (at the end of the file):

```go
// RegisterShiftRoutes registers shift routes.
func RegisterShiftRoutes(r chi.Router, h *ShiftHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("shift_planning.manage").String()
	r.Route("/shifts", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}
		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterShiftAssignmentRoutes registers shift assignment routes.
func RegisterShiftAssignmentRoutes(r chi.Router, h *ShiftAssignmentHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("shift_planning.manage").String()
	r.Route("/shift-assignments", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}
		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}
```

Both use the same `shift_planning.manage` permission.

#### `apps/api/internal/permissions/permissions.go`

Add to `allPermissions` slice (after `travel_allowance.manage` entry, around line 78):
```go
{ID: permissionID("shift_planning.manage"), Resource: "shift_planning", Action: "manage", Description: "Manage shifts and shift assignments"},
```

#### `apps/api/cmd/server/main.go`

Add wiring in two places:

1. **Initialize repos, services, handlers** (after Travel Allowance Preview initialization, around line 350):
```go
// Initialize Shift Planning (Plantafel placeholder)
shiftRepo := repository.NewShiftRepository(db)
shiftService := service.NewShiftService(shiftRepo)
shiftHandler := handler.NewShiftHandler(shiftService)

shiftAssignmentRepo := repository.NewShiftAssignmentRepository(db)
shiftAssignmentService := service.NewShiftAssignmentService(shiftAssignmentRepo)
shiftAssignmentHandler := handler.NewShiftAssignmentHandler(shiftAssignmentService)
```

2. **Register routes** (inside tenant-scoped group, after `RegisterTravelAllowancePreviewRoutes`, around line 517):
```go
handler.RegisterShiftRoutes(r, shiftHandler, authzMiddleware)
handler.RegisterShiftAssignmentRoutes(r, shiftAssignmentHandler, authzMiddleware)
```

### Verification

```bash
cd apps/api && go build ./cmd/server/...
# Should compile without errors

make dev
# Server should start. Test with:
# curl -H "Authorization: Bearer <token>" -H "X-Tenant-ID: <id>" http://localhost:8080/api/v1/shifts
# curl -H "Authorization: Bearer <token>" -H "X-Tenant-ID: <id>" http://localhost:8080/api/v1/shift-assignments
```

---

## Phase 8: Tests

**Depends on:** Phase 6
**Pattern reference:** `/home/tolga/projects/terp/apps/api/internal/service/employee_access_assignment_test.go`

### Files to Create

#### `apps/api/internal/service/shift_assignment_test.go`

Follow the `employee_access_assignment_test.go` pattern closely:

```go
package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

func createShiftTestFixtures(t *testing.T, db *repository.DB) (*model.Tenant, *model.Employee, *model.Shift) {
	t.Helper()
	ctx := context.Background()

	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name:     "Test Tenant " + uuid.New().String()[:8],
		Slug:     "test-" + uuid.New().String()[:8],
		IsActive: true,
	}
	err := tenantRepo.Create(ctx, tenant)
	require.NoError(t, err)

	empRepo := repository.NewEmployeeRepository(db)
	emp := &model.Employee{
		TenantID:        tenant.ID,
		PersonnelNumber: "EMP" + uuid.New().String()[:4],
		FirstName:       "Test",
		LastName:        "Employee",
	}
	err = empRepo.Create(ctx, emp)
	require.NoError(t, err)

	shiftRepo := repository.NewShiftRepository(db)
	shiftSvc := service.NewShiftService(shiftRepo)
	shift, err := shiftSvc.Create(ctx, service.CreateShiftInput{
		TenantID: tenant.ID,
		Code:     "SHIFT_" + uuid.New().String()[:4],
		Name:     "Test Shift",
	})
	require.NoError(t, err)

	return tenant, emp, shift
}

func TestShiftAssignmentService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftAssignmentRepository(db)
	svc := service.NewShiftAssignmentService(repo)
	ctx := context.Background()

	tenant, emp, shift := createShiftTestFixtures(t, db)

	input := service.CreateShiftAssignmentInput{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ShiftID:    shift.ID,
	}

	a, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, emp.ID, a.EmployeeID)
	assert.Equal(t, shift.ID, a.ShiftID)
	assert.True(t, a.IsActive)
}

func TestShiftAssignmentService_Create_WithDates(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftAssignmentRepository(db)
	svc := service.NewShiftAssignmentService(repo)
	ctx := context.Background()

	tenant, emp, shift := createShiftTestFixtures(t, db)

	vf := time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC)
	vt := time.Date(2026, 2, 28, 0, 0, 0, 0, time.UTC)

	input := service.CreateShiftAssignmentInput{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ShiftID:    shift.ID,
		ValidFrom:  &vf,
		ValidTo:    &vt,
		Notes:      "Test assignment",
	}

	a, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.NotNil(t, a.ValidFrom)
	assert.NotNil(t, a.ValidTo)
	assert.Equal(t, "Test assignment", a.Notes)
}

func TestShiftAssignmentService_Create_EmptyEmployee(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftAssignmentRepository(db)
	svc := service.NewShiftAssignmentService(repo)
	ctx := context.Background()

	input := service.CreateShiftAssignmentInput{
		TenantID:   uuid.New(),
		EmployeeID: uuid.Nil,
		ShiftID:    uuid.New(),
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrShiftAssignmentEmployeeRequired)
}

func TestShiftAssignmentService_Create_EmptyShift(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftAssignmentRepository(db)
	svc := service.NewShiftAssignmentService(repo)
	ctx := context.Background()

	input := service.CreateShiftAssignmentInput{
		TenantID:   uuid.New(),
		EmployeeID: uuid.New(),
		ShiftID:    uuid.Nil,
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrShiftAssignmentShiftRequired)
}

func TestShiftAssignmentService_GetByID_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftAssignmentRepository(db)
	svc := service.NewShiftAssignmentService(repo)
	ctx := context.Background()

	tenant, emp, shift := createShiftTestFixtures(t, db)

	input := service.CreateShiftAssignmentInput{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ShiftID:    shift.ID,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
}

func TestShiftAssignmentService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftAssignmentRepository(db)
	svc := service.NewShiftAssignmentService(repo)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrShiftAssignmentNotFound)
}

func TestShiftAssignmentService_Update_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftAssignmentRepository(db)
	svc := service.NewShiftAssignmentService(repo)
	ctx := context.Background()

	tenant, emp, shift := createShiftTestFixtures(t, db)

	input := service.CreateShiftAssignmentInput{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ShiftID:    shift.ID,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	isActive := false
	notes := "Updated notes"
	updateInput := service.UpdateShiftAssignmentInput{
		IsActive: &isActive,
		Notes:    &notes,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.False(t, updated.IsActive)
	assert.Equal(t, "Updated notes", updated.Notes)
}

func TestShiftAssignmentService_Delete_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftAssignmentRepository(db)
	svc := service.NewShiftAssignmentService(repo)
	ctx := context.Background()

	tenant, emp, shift := createShiftTestFixtures(t, db)

	input := service.CreateShiftAssignmentInput{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ShiftID:    shift.ID,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	err = svc.Delete(ctx, created.ID)
	require.NoError(t, err)

	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrShiftAssignmentNotFound)
}

func TestShiftAssignmentService_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftAssignmentRepository(db)
	svc := service.NewShiftAssignmentService(repo)
	ctx := context.Background()

	err := svc.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrShiftAssignmentNotFound)
}

func TestShiftAssignmentService_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftAssignmentRepository(db)
	svc := service.NewShiftAssignmentService(repo)
	ctx := context.Background()

	tenant, emp, shift := createShiftTestFixtures(t, db)

	for i := 0; i < 3; i++ {
		input := service.CreateShiftAssignmentInput{
			TenantID:   tenant.ID,
			EmployeeID: emp.ID,
			ShiftID:    shift.ID,
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	assignments, err := svc.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, assignments, 3)
}
```

### Verification

```bash
cd apps/api && go test -v -run TestShiftAssignment ./internal/service/...
```

---

## Implementation Order (Summary)

| Step | Phase | What | Depends On |
|------|-------|------|-----------|
| 1 | Phase 1 | Database migrations | - |
| 2 | Phase 2 | OpenAPI schemas + paths + openapi.yaml updates | - |
| 3 | Phase 3 | `make swagger-bundle && make generate` | Phase 2 |
| 4 | Phase 4 | GORM model structs | Phase 1 |
| 5 | Phase 5 | Repository layer | Phase 4 |
| 6 | Phase 6 | Service layer | Phase 5 |
| 7 | Phase 7 | Handler layer + routes.go + permissions.go + main.go | Phase 3, 6 |
| 8 | Phase 8 | Unit tests | Phase 6 |

**Phases 1 and 2 can be done in parallel.**

---

## Success Criteria

1. **Two database tables created** (`shifts`, `shift_assignments`) with proper constraints, indexes, triggers, and foreign keys
2. **10 CRUD API endpoints** operational (5 per entity: list, get, create, update, delete)
3. **OpenAPI spec** correctly defines all schemas and paths; `make swagger-bundle` succeeds
4. **Generated models** compile and are used in handlers for request/response validation
5. **Permission** `shift_planning.manage` is registered and enforced on all routes
6. **Tests pass**: `cd apps/api && go test ./internal/service/... -run "TestShiftAssignment"`
7. **Full build** succeeds: `cd apps/api && go build ./cmd/server/...`
8. **Feature is documented as placeholder** - OpenAPI descriptions and SQL comments note that full implementation requires separate Plantafel documentation

---

## Files Summary

### New Files (14)
| # | File | Phase |
|---|------|-------|
| 1 | `db/migrations/000076_create_shift_planning.up.sql` | 1 |
| 2 | `db/migrations/000076_create_shift_planning.down.sql` | 1 |
| 3 | `api/schemas/shift-planning.yaml` | 2 |
| 4 | `api/paths/shift-planning.yaml` | 2 |
| 5 | `apps/api/internal/model/shift.go` | 4 |
| 6 | `apps/api/internal/model/shift_assignment.go` | 4 |
| 7 | `apps/api/internal/repository/shift.go` | 5 |
| 8 | `apps/api/internal/repository/shift_assignment.go` | 5 |
| 9 | `apps/api/internal/service/shift.go` | 6 |
| 10 | `apps/api/internal/service/shift_assignment.go` | 6 |
| 11 | `apps/api/internal/handler/shift.go` | 7 |
| 12 | `apps/api/internal/handler/shift_assignment.go` | 7 |
| 13 | `apps/api/internal/service/shift_assignment_test.go` | 8 |

### Auto-Generated Files (via `make generate`)
| # | File | Phase |
|---|------|-------|
| 1 | `apps/api/gen/models/shift.go` | 3 |
| 2 | `apps/api/gen/models/create_shift_request.go` | 3 |
| 3 | `apps/api/gen/models/update_shift_request.go` | 3 |
| 4 | `apps/api/gen/models/shift_list.go` | 3 |
| 5 | `apps/api/gen/models/shift_assignment.go` | 3 |
| 6 | `apps/api/gen/models/create_shift_assignment_request.go` | 3 |
| 7 | `apps/api/gen/models/update_shift_assignment_request.go` | 3 |
| 8 | `apps/api/gen/models/shift_assignment_list.go` | 3 |

### Modified Files (4)
| # | File | Phase | What Changes |
|---|------|-------|-------------|
| 1 | `api/openapi.yaml` | 2 | Add 2 tags, 4 path refs, 8 definition refs |
| 2 | `apps/api/internal/permissions/permissions.go` | 7 | Add `shift_planning.manage` permission |
| 3 | `apps/api/internal/handler/routes.go` | 7 | Add 2 route registration functions |
| 4 | `apps/api/cmd/server/main.go` | 7 | Wire 2 repos, 2 services, 2 handlers, 2 route registrations |
