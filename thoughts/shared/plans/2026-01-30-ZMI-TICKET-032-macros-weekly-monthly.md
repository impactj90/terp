# ZMI-TICKET-032: Weekly and Monthly Macros - Implementation Plan

## Overview

Implement macro definitions and scheduling for weekly and monthly automation. Macros are configurable automation rules that can be assigned to tariffs or employees, executing predefined actions on a weekly (specific weekday) or monthly (specific day-of-month) schedule. Monthly macros fall back to the last day of the month when the configured day exceeds the month's length. Macros execute after daily calculation completes.

## Current State Analysis

- **No macro code exists** in the codebase. This is a greenfield feature.
- **Tariff infrastructure** (ZMI-TICKET-018) is fully implemented with target hour fields (`WeeklyTargetHours`, `MonthlyTargetHours`, `AnnualTargetHours`) that macros can reference.
- **Scheduler infrastructure** (ZMI-TICKET-022) is fully implemented with `TaskExecutor` interface, registry pattern, weekly/monthly timing computation, and execution history tracking.
- **Employee-tariff assignment** model provides the pattern for macro assignments.
- Latest migration number: `000076` (shift planning). Next available: `000077`.

### Key Discoveries:
- The scheduler already has `computeNextWeeklyRun()` and `computeNextMonthlyRun()` in `apps/api/internal/service/schedule.go`
- The `TaskExecutor` interface at `apps/api/internal/service/scheduler_executor.go:18` provides the extension point for macro execution
- The employee-tariff assignment model at `apps/api/internal/model/employeetariffassignment.go` provides the pattern for macro assignments (linking to employee or tariff)
- Tariff target hour fields at `apps/api/internal/model/tariff.go` (lines with `WeeklyTargetHours`, `MonthlyTargetHours`, `AnnualTargetHours`) are referenced by macros
- The scheduler engine at `apps/api/internal/service/scheduler_engine.go` ticks every 30 seconds and calls `RunDueSchedules()`
- The ticket says "Script or predefined action (to be defined)" -- we implement predefined action types since scripting is out of scope

## Desired End State

After implementation:
1. Macros can be created with a name, type (weekly/monthly), predefined action type, and active flag
2. Macros can be assigned to tariffs or employees with an execution day (weekday or day-of-month)
3. A new scheduler task type `execute_macros` is registered, which finds and executes due macros
4. Monthly macros on day 31 in February correctly fall back to Feb 28/29
5. Full CRUD API for macros with OpenAPI documentation
6. Assignment management API for linking macros to tariffs/employees
7. Manual trigger endpoint for executing a specific macro
8. Macro execution logs are recorded

### How to verify:
- `make migrate-up` applies the new migration cleanly
- `make swagger-bundle && make generate` produces updated models
- `cd apps/api && go build ./...` compiles without errors
- `make test` passes all tests including new macro tests
- API endpoints respond correctly via curl or Swagger UI

## What We're NOT Doing

- **Macro scripting language**: The ticket says "to be defined." We implement predefined action types only.
- **Complex macro expressions**: No formula evaluation or variable substitution in this phase.
- **Macro execution chaining**: Macros execute independently, not as pipelines.
- **UI/frontend**: Backend-only implementation.
- **Modifying the scheduler engine**: We add a new task type to the existing scheduler; we do not modify the engine itself.

## Implementation Approach

The macro feature is built as a standalone CRUD domain (macros + macro assignments) that integrates with the existing scheduler via a new `execute_macros` task type. This follows the established pattern where the scheduler dispatches to registered `TaskExecutor` implementations.

**Architecture:**
```
macros table          -> MacroRepository -> MacroService -> MacroHandler
macro_assignments table -> (same repo)   -> (same svc)  -> (same handler)
                                          -> ExecuteMacrosTaskHandler (scheduler integration)
```

**Predefined action types** (initial set):
- `log_message` - Logs a message (useful for testing/verification)
- `recalculate_target_hours` - Recalculates target hours based on tariff settings
- `reset_flextime` - Resets flextime counters (weekly/monthly reset)
- `carry_forward_balance` - Carries forward time balance to next period

---

## Phase 1: Database Migration

### Overview
Create the `macros` and `macro_assignments` tables plus execution log table.

### Changes Required:

#### 1. Up Migration
**File**: `db/migrations/000077_create_macros.up.sql`

```sql
-- =============================================================
-- Create macros and macro_assignments tables
-- ZMI-TICKET-032: Weekly and Monthly Macros
-- =============================================================

-- Macro definitions
CREATE TABLE macros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    macro_type VARCHAR(10) NOT NULL
        CHECK (macro_type IN ('weekly', 'monthly')),
    action_type VARCHAR(50) NOT NULL
        CHECK (action_type IN ('log_message', 'recalculate_target_hours', 'reset_flextime', 'carry_forward_balance')),
    action_params JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

CREATE INDEX idx_macros_tenant ON macros(tenant_id);
CREATE INDEX idx_macros_active ON macros(tenant_id, is_active);
CREATE INDEX idx_macros_type ON macros(tenant_id, macro_type);

CREATE TRIGGER update_macros_updated_at
    BEFORE UPDATE ON macros
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE macros IS 'Macro definitions for weekly and monthly automation actions.';
COMMENT ON COLUMN macros.macro_type IS 'Type of macro: weekly (executes on a weekday) or monthly (executes on a day of month).';
COMMENT ON COLUMN macros.action_type IS 'Predefined action: log_message, recalculate_target_hours, reset_flextime, carry_forward_balance.';
COMMENT ON COLUMN macros.action_params IS 'JSON parameters for the action (action-specific configuration).';

-- Macro assignments (link macros to tariffs or employees)
CREATE TABLE macro_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    macro_id UUID NOT NULL REFERENCES macros(id) ON DELETE CASCADE,
    tariff_id UUID REFERENCES tariffs(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    execution_day INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (
        (tariff_id IS NOT NULL AND employee_id IS NULL) OR
        (tariff_id IS NULL AND employee_id IS NOT NULL)
    ),
    CHECK (execution_day >= 0 AND execution_day <= 31)
);

CREATE INDEX idx_macro_assignments_tenant ON macro_assignments(tenant_id);
CREATE INDEX idx_macro_assignments_macro ON macro_assignments(macro_id);
CREATE INDEX idx_macro_assignments_tariff ON macro_assignments(tariff_id);
CREATE INDEX idx_macro_assignments_employee ON macro_assignments(employee_id);
CREATE INDEX idx_macro_assignments_active ON macro_assignments(tenant_id, is_active);

CREATE TRIGGER update_macro_assignments_updated_at
    BEFORE UPDATE ON macro_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE macro_assignments IS 'Links macros to tariffs or employees with execution day configuration.';
COMMENT ON COLUMN macro_assignments.tariff_id IS 'Tariff this macro is assigned to (mutually exclusive with employee_id).';
COMMENT ON COLUMN macro_assignments.employee_id IS 'Employee this macro is assigned to (mutually exclusive with tariff_id).';
COMMENT ON COLUMN macro_assignments.execution_day IS 'For weekly macros: 0=Sunday..6=Saturday. For monthly macros: 1-31 (falls back to last day if exceeds month length).';

-- Macro execution log
CREATE TABLE macro_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    macro_id UUID NOT NULL REFERENCES macros(id) ON DELETE CASCADE,
    assignment_id UUID REFERENCES macro_assignments(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    trigger_type VARCHAR(20) NOT NULL DEFAULT 'scheduled'
        CHECK (trigger_type IN ('scheduled', 'manual')),
    triggered_by UUID REFERENCES users(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    result JSONB DEFAULT '{}',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_macro_executions_tenant ON macro_executions(tenant_id);
CREATE INDEX idx_macro_executions_macro ON macro_executions(macro_id);
CREATE INDEX idx_macro_executions_status ON macro_executions(status);
CREATE INDEX idx_macro_executions_created ON macro_executions(created_at DESC);

COMMENT ON TABLE macro_executions IS 'Execution history for macro runs.';
COMMENT ON COLUMN macro_executions.trigger_type IS 'How the execution was triggered: scheduled or manual.';
```

#### 2. Down Migration
**File**: `db/migrations/000077_create_macros.down.sql`

```sql
DROP TABLE IF EXISTS macro_executions;
DROP TABLE IF EXISTS macro_assignments;
DROP TABLE IF EXISTS macros;
```

### Success Criteria:

#### Automated Verification:
- [ ] Migration applies cleanly: `make migrate-up`
- [ ] Migration rolls back cleanly: `make migrate-down` then `make migrate-up`
- [ ] Tables exist with correct columns verified via `psql`

---

## Phase 2: Domain Models

### Overview
Create GORM model structs for macros, macro assignments, and macro executions.

### Changes Required:

#### 1. Macro Model
**File**: `apps/api/internal/model/macro.go` (new file)

```go
package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// MacroType represents the type of macro (weekly or monthly).
type MacroType string

const (
	MacroTypeWeekly  MacroType = "weekly"
	MacroTypeMonthly MacroType = "monthly"
)

// MacroActionType represents the predefined action a macro performs.
type MacroActionType string

const (
	MacroActionLogMessage             MacroActionType = "log_message"
	MacroActionRecalculateTargetHours MacroActionType = "recalculate_target_hours"
	MacroActionResetFlextime          MacroActionType = "reset_flextime"
	MacroActionCarryForwardBalance    MacroActionType = "carry_forward_balance"
)

// MacroExecutionStatus represents the status of a macro execution.
type MacroExecutionStatus string

const (
	MacroExecutionStatusPending   MacroExecutionStatus = "pending"
	MacroExecutionStatusRunning   MacroExecutionStatus = "running"
	MacroExecutionStatusCompleted MacroExecutionStatus = "completed"
	MacroExecutionStatusFailed    MacroExecutionStatus = "failed"
)

// MacroTriggerType represents how a macro execution was triggered.
type MacroTriggerType string

const (
	MacroTriggerTypeScheduled MacroTriggerType = "scheduled"
	MacroTriggerTypeManual    MacroTriggerType = "manual"
)

// Macro represents a macro definition.
type Macro struct {
	ID           uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID     uuid.UUID       `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Name         string          `gorm:"type:varchar(255);not null" json:"name"`
	Description  *string         `gorm:"type:text" json:"description,omitempty"`
	MacroType    MacroType       `gorm:"type:varchar(10);not null" json:"macro_type"`
	ActionType   MacroActionType `gorm:"type:varchar(50);not null" json:"action_type"`
	ActionParams datatypes.JSON  `gorm:"type:jsonb;default:'{}'" json:"action_params"`
	IsActive     bool            `gorm:"default:true" json:"is_active"`
	CreatedAt    time.Time       `gorm:"default:now()" json:"created_at"`
	UpdatedAt    time.Time       `gorm:"default:now()" json:"updated_at"`

	// Relations
	Assignments []MacroAssignment `gorm:"foreignKey:MacroID" json:"assignments,omitempty"`
}

func (Macro) TableName() string {
	return "macros"
}

// MacroAssignment links a macro to a tariff or employee with execution day.
type MacroAssignment struct {
	ID           uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID     uuid.UUID  `gorm:"type:uuid;not null;index" json:"tenant_id"`
	MacroID      uuid.UUID  `gorm:"type:uuid;not null;index" json:"macro_id"`
	TariffID     *uuid.UUID `gorm:"type:uuid;index" json:"tariff_id,omitempty"`
	EmployeeID   *uuid.UUID `gorm:"type:uuid;index" json:"employee_id,omitempty"`
	ExecutionDay int        `gorm:"not null" json:"execution_day"`
	IsActive     bool       `gorm:"default:true" json:"is_active"`
	CreatedAt    time.Time  `gorm:"default:now()" json:"created_at"`
	UpdatedAt    time.Time  `gorm:"default:now()" json:"updated_at"`

	// Relations
	Macro    *Macro    `gorm:"foreignKey:MacroID" json:"macro,omitempty"`
	Tariff   *Tariff   `gorm:"foreignKey:TariffID" json:"tariff,omitempty"`
	Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
}

func (MacroAssignment) TableName() string {
	return "macro_assignments"
}

// MacroExecution records a macro execution run.
type MacroExecution struct {
	ID           uuid.UUID            `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID     uuid.UUID            `gorm:"type:uuid;not null;index" json:"tenant_id"`
	MacroID      uuid.UUID            `gorm:"type:uuid;not null;index" json:"macro_id"`
	AssignmentID *uuid.UUID           `gorm:"type:uuid" json:"assignment_id,omitempty"`
	Status       MacroExecutionStatus `gorm:"type:varchar(20);not null;default:pending" json:"status"`
	TriggerType  MacroTriggerType     `gorm:"type:varchar(20);not null;default:scheduled" json:"trigger_type"`
	TriggeredBy  *uuid.UUID           `gorm:"type:uuid" json:"triggered_by,omitempty"`
	StartedAt    *time.Time           `json:"started_at,omitempty"`
	CompletedAt  *time.Time           `json:"completed_at,omitempty"`
	Result       datatypes.JSON       `gorm:"type:jsonb;default:'{}'" json:"result"`
	ErrorMessage *string              `gorm:"type:text" json:"error_message,omitempty"`
	CreatedAt    time.Time            `gorm:"default:now()" json:"created_at"`

	// Relations
	Macro      *Macro           `gorm:"foreignKey:MacroID" json:"macro,omitempty"`
	Assignment *MacroAssignment `gorm:"foreignKey:AssignmentID" json:"assignment,omitempty"`
}

func (MacroExecution) TableName() string {
	return "macro_executions"
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Code compiles: `cd apps/api && go build ./...`
- [ ] Model structs are correctly defined with GORM tags

---

## Phase 3: Repository Layer

### Overview
Create the macro repository with CRUD operations for macros, assignments, and executions.

### Changes Required:

#### 1. Macro Repository
**File**: `apps/api/internal/repository/macro.go` (new file)

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

var (
	ErrMacroNotFound           = errors.New("macro not found")
	ErrMacroNameConflict       = errors.New("macro name already exists for this tenant")
	ErrMacroAssignmentNotFound = errors.New("macro assignment not found")
	ErrMacroExecutionNotFound  = errors.New("macro execution not found")
)

// MacroRepository handles macro data access.
type MacroRepository struct {
	db *DB
}

// NewMacroRepository creates a new MacroRepository.
func NewMacroRepository(db *DB) *MacroRepository {
	return &MacroRepository{db: db}
}

// --- Macro CRUD ---

// Create creates a new macro.
func (r *MacroRepository) Create(ctx context.Context, m *model.Macro) error {
	return r.db.GORM.WithContext(ctx).Create(m).Error
}

// GetByID retrieves a macro by ID with assignments preloaded.
func (r *MacroRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Macro, error) {
	var m model.Macro
	err := r.db.GORM.WithContext(ctx).
		Preload("Assignments").
		First(&m, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrMacroNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get macro: %w", err)
	}
	return &m, nil
}

// GetByTenantAndID retrieves a macro scoped by tenant.
func (r *MacroRepository) GetByTenantAndID(ctx context.Context, tenantID, id uuid.UUID) (*model.Macro, error) {
	var m model.Macro
	err := r.db.GORM.WithContext(ctx).
		Preload("Assignments").
		Where("tenant_id = ?", tenantID).
		First(&m, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrMacroNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get macro: %w", err)
	}
	return &m, nil
}

// GetByName retrieves a macro by tenant + name.
func (r *MacroRepository) GetByName(ctx context.Context, tenantID uuid.UUID, name string) (*model.Macro, error) {
	var m model.Macro
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND name = ?", tenantID, name).
		First(&m).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrMacroNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get macro by name: %w", err)
	}
	return &m, nil
}

// List retrieves all macros for a tenant.
func (r *MacroRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.Macro, error) {
	var macros []model.Macro
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Preload("Assignments").
		Order("name ASC").
		Find(&macros).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list macros: %w", err)
	}
	return macros, nil
}

// ListActive retrieves all active macros for a tenant.
func (r *MacroRepository) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.Macro, error) {
	var macros []model.Macro
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND is_active = ?", tenantID, true).
		Preload("Assignments", "is_active = ?", true).
		Order("name ASC").
		Find(&macros).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list active macros: %w", err)
	}
	return macros, nil
}

// ListActiveByType retrieves all active macros of a given type for a tenant.
func (r *MacroRepository) ListActiveByType(ctx context.Context, tenantID uuid.UUID, macroType model.MacroType) ([]model.Macro, error) {
	var macros []model.Macro
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND is_active = ? AND macro_type = ?", tenantID, true, macroType).
		Preload("Assignments", "is_active = ?", true).
		Order("name ASC").
		Find(&macros).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list active macros by type: %w", err)
	}
	return macros, nil
}

// Update saves changes to a macro.
func (r *MacroRepository) Update(ctx context.Context, m *model.Macro) error {
	return r.db.GORM.WithContext(ctx).Save(m).Error
}

// Delete deletes a macro by ID.
func (r *MacroRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.Macro{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete macro: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrMacroNotFound
	}
	return nil
}

// --- Assignment CRUD ---

// CreateAssignment creates a new macro assignment.
func (r *MacroRepository) CreateAssignment(ctx context.Context, a *model.MacroAssignment) error {
	return r.db.GORM.WithContext(ctx).Create(a).Error
}

// GetAssignmentByID retrieves an assignment by ID.
func (r *MacroRepository) GetAssignmentByID(ctx context.Context, id uuid.UUID) (*model.MacroAssignment, error) {
	var a model.MacroAssignment
	err := r.db.GORM.WithContext(ctx).
		Preload("Macro").
		First(&a, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrMacroAssignmentNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get macro assignment: %w", err)
	}
	return &a, nil
}

// ListAssignmentsByMacro retrieves all assignments for a macro.
func (r *MacroRepository) ListAssignmentsByMacro(ctx context.Context, macroID uuid.UUID) ([]model.MacroAssignment, error) {
	var assignments []model.MacroAssignment
	err := r.db.GORM.WithContext(ctx).
		Where("macro_id = ?", macroID).
		Order("created_at ASC").
		Find(&assignments).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list macro assignments: %w", err)
	}
	return assignments, nil
}

// ListAssignmentsByTariff retrieves all assignments for a tariff.
func (r *MacroRepository) ListAssignmentsByTariff(ctx context.Context, tariffID uuid.UUID) ([]model.MacroAssignment, error) {
	var assignments []model.MacroAssignment
	err := r.db.GORM.WithContext(ctx).
		Where("tariff_id = ?", tariffID).
		Preload("Macro").
		Order("created_at ASC").
		Find(&assignments).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list tariff macro assignments: %w", err)
	}
	return assignments, nil
}

// ListAssignmentsByEmployee retrieves all assignments for an employee.
func (r *MacroRepository) ListAssignmentsByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.MacroAssignment, error) {
	var assignments []model.MacroAssignment
	err := r.db.GORM.WithContext(ctx).
		Where("employee_id = ?", employeeID).
		Preload("Macro").
		Order("created_at ASC").
		Find(&assignments).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list employee macro assignments: %w", err)
	}
	return assignments, nil
}

// UpdateAssignment saves changes to an assignment.
func (r *MacroRepository) UpdateAssignment(ctx context.Context, a *model.MacroAssignment) error {
	return r.db.GORM.WithContext(ctx).Save(a).Error
}

// DeleteAssignment deletes an assignment by ID.
func (r *MacroRepository) DeleteAssignment(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.MacroAssignment{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete macro assignment: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrMacroAssignmentNotFound
	}
	return nil
}

// --- Execution methods ---

// CreateExecution creates a new execution record.
func (r *MacroRepository) CreateExecution(ctx context.Context, e *model.MacroExecution) error {
	return r.db.GORM.WithContext(ctx).Create(e).Error
}

// GetExecutionByID retrieves an execution by ID.
func (r *MacroRepository) GetExecutionByID(ctx context.Context, id uuid.UUID) (*model.MacroExecution, error) {
	var e model.MacroExecution
	err := r.db.GORM.WithContext(ctx).
		Preload("Macro").
		Preload("Assignment").
		First(&e, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrMacroExecutionNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get macro execution: %w", err)
	}
	return &e, nil
}

// ListExecutionsByMacro retrieves execution history for a macro.
func (r *MacroRepository) ListExecutionsByMacro(ctx context.Context, macroID uuid.UUID, limit int) ([]model.MacroExecution, error) {
	if limit <= 0 {
		limit = 20
	}
	var executions []model.MacroExecution
	err := r.db.GORM.WithContext(ctx).
		Where("macro_id = ?", macroID).
		Order("created_at DESC").
		Limit(limit).
		Find(&executions).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list macro executions: %w", err)
	}
	return executions, nil
}

// UpdateExecution saves changes to an execution.
func (r *MacroRepository) UpdateExecution(ctx context.Context, e *model.MacroExecution) error {
	return r.db.GORM.WithContext(ctx).Save(e).Error
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Code compiles: `cd apps/api && go build ./...`
- [ ] Repository follows existing patterns (constructor, sentinel errors, context propagation)

---

## Phase 4: Service Layer

### Overview
Create the macro service with business logic for CRUD operations, assignment management, and execution.

### Changes Required:

#### 1. Macro Service
**File**: `apps/api/internal/service/macro.go` (new file)

```go
package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"gorm.io/datatypes"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrMacroNotFound           = errors.New("macro not found")
	ErrMacroNameExists         = errors.New("macro name already exists")
	ErrMacroNameReq            = errors.New("macro name is required")
	ErrInvalidMacroType        = errors.New("invalid macro type (must be 'weekly' or 'monthly')")
	ErrInvalidActionType       = errors.New("invalid action type")
	ErrMacroAssignmentNotFound = errors.New("macro assignment not found")
	ErrAssignmentTargetReq     = errors.New("either tariff_id or employee_id is required")
	ErrAssignmentTargetBoth    = errors.New("only one of tariff_id or employee_id can be set")
	ErrInvalidExecutionDay     = errors.New("invalid execution day")
	ErrMacroExecutionNotFound  = errors.New("macro execution not found")
	ErrMacroInactive           = errors.New("macro is not active")
)

// macroRepository defines the interface for macro data access.
type macroRepository interface {
	Create(ctx context.Context, m *model.Macro) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.Macro, error)
	GetByTenantAndID(ctx context.Context, tenantID, id uuid.UUID) (*model.Macro, error)
	GetByName(ctx context.Context, tenantID uuid.UUID, name string) (*model.Macro, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.Macro, error)
	ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.Macro, error)
	ListActiveByType(ctx context.Context, tenantID uuid.UUID, macroType model.MacroType) ([]model.Macro, error)
	Update(ctx context.Context, m *model.Macro) error
	Delete(ctx context.Context, id uuid.UUID) error
	CreateAssignment(ctx context.Context, a *model.MacroAssignment) error
	GetAssignmentByID(ctx context.Context, id uuid.UUID) (*model.MacroAssignment, error)
	ListAssignmentsByMacro(ctx context.Context, macroID uuid.UUID) ([]model.MacroAssignment, error)
	ListAssignmentsByTariff(ctx context.Context, tariffID uuid.UUID) ([]model.MacroAssignment, error)
	ListAssignmentsByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.MacroAssignment, error)
	UpdateAssignment(ctx context.Context, a *model.MacroAssignment) error
	DeleteAssignment(ctx context.Context, id uuid.UUID) error
	CreateExecution(ctx context.Context, e *model.MacroExecution) error
	GetExecutionByID(ctx context.Context, id uuid.UUID) (*model.MacroExecution, error)
	ListExecutionsByMacro(ctx context.Context, macroID uuid.UUID, limit int) ([]model.MacroExecution, error)
	UpdateExecution(ctx context.Context, e *model.MacroExecution) error
}

// MacroService handles macro business logic.
type MacroService struct {
	repo macroRepository
}

// NewMacroService creates a new MacroService.
func NewMacroService(repo macroRepository) *MacroService {
	return &MacroService{repo: repo}
}

// --- Macro CRUD ---

// CreateMacroInput represents the input for creating a macro.
type CreateMacroInput struct {
	TenantID     uuid.UUID
	Name         string
	Description  *string
	MacroType    string
	ActionType   string
	ActionParams json.RawMessage
}

// Create creates a new macro with validation.
func (s *MacroService) Create(ctx context.Context, input CreateMacroInput) (*model.Macro, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrMacroNameReq
	}

	// Check name uniqueness
	existing, err := s.repo.GetByName(ctx, input.TenantID, name)
	if err == nil && existing != nil {
		return nil, ErrMacroNameExists
	}

	// Validate macro type
	macroType := model.MacroType(input.MacroType)
	if macroType != model.MacroTypeWeekly && macroType != model.MacroTypeMonthly {
		return nil, ErrInvalidMacroType
	}

	// Validate action type
	actionType := model.MacroActionType(input.ActionType)
	if !isValidActionType(actionType) {
		return nil, ErrInvalidActionType
	}

	actionParams := datatypes.JSON("{}")
	if len(input.ActionParams) > 0 {
		actionParams = datatypes.JSON(input.ActionParams)
	}

	macro := &model.Macro{
		TenantID:     input.TenantID,
		Name:         name,
		Description:  input.Description,
		MacroType:    macroType,
		ActionType:   actionType,
		ActionParams: actionParams,
		IsActive:     true,
	}

	if err := s.repo.Create(ctx, macro); err != nil {
		return nil, err
	}

	return s.repo.GetByID(ctx, macro.ID)
}

// GetByID retrieves a macro by ID.
func (s *MacroService) GetByID(ctx context.Context, tenantID, id uuid.UUID) (*model.Macro, error) {
	macro, err := s.repo.GetByTenantAndID(ctx, tenantID, id)
	if err != nil {
		return nil, ErrMacroNotFound
	}
	return macro, nil
}

// List retrieves all macros for a tenant.
func (s *MacroService) List(ctx context.Context, tenantID uuid.UUID) ([]model.Macro, error) {
	return s.repo.List(ctx, tenantID)
}

// UpdateMacroInput represents the input for updating a macro.
type UpdateMacroInput struct {
	Name         *string
	Description  *string
	MacroType    *string
	ActionType   *string
	ActionParams json.RawMessage
	IsActive     *bool
}

// Update updates a macro.
func (s *MacroService) Update(ctx context.Context, tenantID, id uuid.UUID, input UpdateMacroInput) (*model.Macro, error) {
	macro, err := s.repo.GetByTenantAndID(ctx, tenantID, id)
	if err != nil {
		return nil, ErrMacroNotFound
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrMacroNameReq
		}
		// Check uniqueness if name changed
		if name != macro.Name {
			existing, err := s.repo.GetByName(ctx, tenantID, name)
			if err == nil && existing != nil {
				return nil, ErrMacroNameExists
			}
		}
		macro.Name = name
	}

	if input.Description != nil {
		macro.Description = input.Description
	}

	if input.MacroType != nil {
		macroType := model.MacroType(*input.MacroType)
		if macroType != model.MacroTypeWeekly && macroType != model.MacroTypeMonthly {
			return nil, ErrInvalidMacroType
		}
		macro.MacroType = macroType
	}

	if input.ActionType != nil {
		actionType := model.MacroActionType(*input.ActionType)
		if !isValidActionType(actionType) {
			return nil, ErrInvalidActionType
		}
		macro.ActionType = actionType
	}

	if len(input.ActionParams) > 0 {
		macro.ActionParams = datatypes.JSON(input.ActionParams)
	}

	if input.IsActive != nil {
		macro.IsActive = *input.IsActive
	}

	if err := s.repo.Update(ctx, macro); err != nil {
		return nil, err
	}

	return s.repo.GetByTenantAndID(ctx, tenantID, id)
}

// Delete deletes a macro.
func (s *MacroService) Delete(ctx context.Context, tenantID, id uuid.UUID) error {
	_, err := s.repo.GetByTenantAndID(ctx, tenantID, id)
	if err != nil {
		return ErrMacroNotFound
	}
	return s.repo.Delete(ctx, id)
}

// --- Assignment management ---

// CreateAssignmentInput represents the input for creating a macro assignment.
type CreateAssignmentInput struct {
	TenantID     uuid.UUID
	MacroID      uuid.UUID
	TariffID     *uuid.UUID
	EmployeeID   *uuid.UUID
	ExecutionDay int
}

// CreateAssignment creates a new macro assignment.
func (s *MacroService) CreateAssignment(ctx context.Context, input CreateAssignmentInput) (*model.MacroAssignment, error) {
	// Validate macro exists
	macro, err := s.repo.GetByTenantAndID(ctx, input.TenantID, input.MacroID)
	if err != nil {
		return nil, ErrMacroNotFound
	}

	// Validate exactly one target
	if input.TariffID == nil && input.EmployeeID == nil {
		return nil, ErrAssignmentTargetReq
	}
	if input.TariffID != nil && input.EmployeeID != nil {
		return nil, ErrAssignmentTargetBoth
	}

	// Validate execution day based on macro type
	if err := validateExecutionDay(macro.MacroType, input.ExecutionDay); err != nil {
		return nil, err
	}

	assignment := &model.MacroAssignment{
		TenantID:     input.TenantID,
		MacroID:      input.MacroID,
		TariffID:     input.TariffID,
		EmployeeID:   input.EmployeeID,
		ExecutionDay: input.ExecutionDay,
		IsActive:     true,
	}

	if err := s.repo.CreateAssignment(ctx, assignment); err != nil {
		return nil, err
	}

	return s.repo.GetAssignmentByID(ctx, assignment.ID)
}

// ListAssignments retrieves all assignments for a macro.
func (s *MacroService) ListAssignments(ctx context.Context, tenantID, macroID uuid.UUID) ([]model.MacroAssignment, error) {
	// Verify macro exists and belongs to tenant
	_, err := s.repo.GetByTenantAndID(ctx, tenantID, macroID)
	if err != nil {
		return nil, ErrMacroNotFound
	}
	return s.repo.ListAssignmentsByMacro(ctx, macroID)
}

// UpdateAssignmentInput represents the input for updating an assignment.
type UpdateAssignmentInput struct {
	ExecutionDay *int
	IsActive     *bool
}

// UpdateAssignment updates a macro assignment.
func (s *MacroService) UpdateAssignment(ctx context.Context, tenantID, macroID, assignmentID uuid.UUID, input UpdateAssignmentInput) (*model.MacroAssignment, error) {
	macro, err := s.repo.GetByTenantAndID(ctx, tenantID, macroID)
	if err != nil {
		return nil, ErrMacroNotFound
	}

	assignment, err := s.repo.GetAssignmentByID(ctx, assignmentID)
	if err != nil {
		return nil, ErrMacroAssignmentNotFound
	}

	if assignment.MacroID != macroID {
		return nil, ErrMacroAssignmentNotFound
	}

	if input.ExecutionDay != nil {
		if err := validateExecutionDay(macro.MacroType, *input.ExecutionDay); err != nil {
			return nil, err
		}
		assignment.ExecutionDay = *input.ExecutionDay
	}

	if input.IsActive != nil {
		assignment.IsActive = *input.IsActive
	}

	if err := s.repo.UpdateAssignment(ctx, assignment); err != nil {
		return nil, err
	}

	return s.repo.GetAssignmentByID(ctx, assignmentID)
}

// DeleteAssignment deletes a macro assignment.
func (s *MacroService) DeleteAssignment(ctx context.Context, tenantID, macroID, assignmentID uuid.UUID) error {
	_, err := s.repo.GetByTenantAndID(ctx, tenantID, macroID)
	if err != nil {
		return ErrMacroNotFound
	}

	assignment, err := s.repo.GetAssignmentByID(ctx, assignmentID)
	if err != nil {
		return ErrMacroAssignmentNotFound
	}

	if assignment.MacroID != macroID {
		return ErrMacroAssignmentNotFound
	}

	return s.repo.DeleteAssignment(ctx, assignmentID)
}

// --- Execution ---

// TriggerExecution manually triggers execution of a macro.
func (s *MacroService) TriggerExecution(ctx context.Context, tenantID, macroID uuid.UUID, triggeredBy *uuid.UUID) (*model.MacroExecution, error) {
	macro, err := s.repo.GetByTenantAndID(ctx, tenantID, macroID)
	if err != nil {
		return nil, ErrMacroNotFound
	}

	if !macro.IsActive {
		return nil, ErrMacroInactive
	}

	return s.executeMacro(ctx, macro, model.MacroTriggerTypeManual, triggeredBy, nil)
}

// ListExecutions retrieves execution history for a macro.
func (s *MacroService) ListExecutions(ctx context.Context, tenantID, macroID uuid.UUID, limit int) ([]model.MacroExecution, error) {
	_, err := s.repo.GetByTenantAndID(ctx, tenantID, macroID)
	if err != nil {
		return nil, ErrMacroNotFound
	}
	return s.repo.ListExecutionsByMacro(ctx, macroID, limit)
}

// GetExecution retrieves a single execution by ID.
func (s *MacroService) GetExecution(ctx context.Context, id uuid.UUID) (*model.MacroExecution, error) {
	exec, err := s.repo.GetExecutionByID(ctx, id)
	if err != nil {
		return nil, ErrMacroExecutionNotFound
	}
	return exec, nil
}

// ExecuteDueMacros finds and executes all macros due for the given date.
// Called by the scheduler task handler after daily calculation.
func (s *MacroService) ExecuteDueMacros(ctx context.Context, tenantID uuid.UUID, date time.Time) (int, int, error) {
	weekday := int(date.Weekday()) // 0=Sunday..6=Saturday
	dayOfMonth := date.Day()
	lastDayOfMonth := lastDay(date.Year(), date.Month())

	var executed, failed int

	// Execute weekly macros
	weeklyMacros, err := s.repo.ListActiveByType(ctx, tenantID, model.MacroTypeWeekly)
	if err != nil {
		return 0, 0, fmt.Errorf("failed to list weekly macros: %w", err)
	}

	for _, macro := range weeklyMacros {
		for _, assignment := range macro.Assignments {
			if !assignment.IsActive {
				continue
			}
			if assignment.ExecutionDay == weekday {
				_, execErr := s.executeMacro(ctx, &macro, model.MacroTriggerTypeScheduled, nil, &assignment.ID)
				if execErr != nil {
					failed++
					log.Error().Err(execErr).
						Str("macro_id", macro.ID.String()).
						Str("assignment_id", assignment.ID.String()).
						Msg("weekly macro execution failed")
				} else {
					executed++
				}
			}
		}
	}

	// Execute monthly macros
	monthlyMacros, err := s.repo.ListActiveByType(ctx, tenantID, model.MacroTypeMonthly)
	if err != nil {
		return executed, failed, fmt.Errorf("failed to list monthly macros: %w", err)
	}

	for _, macro := range monthlyMacros {
		for _, assignment := range macro.Assignments {
			if !assignment.IsActive {
				continue
			}
			// Monthly day fallback: if configured day exceeds month length, use last day
			effectiveDay := assignment.ExecutionDay
			if effectiveDay > lastDayOfMonth {
				effectiveDay = lastDayOfMonth
			}
			if effectiveDay == dayOfMonth {
				_, execErr := s.executeMacro(ctx, &macro, model.MacroTriggerTypeScheduled, nil, &assignment.ID)
				if execErr != nil {
					failed++
					log.Error().Err(execErr).
						Str("macro_id", macro.ID.String()).
						Str("assignment_id", assignment.ID.String()).
						Msg("monthly macro execution failed")
				} else {
					executed++
				}
			}
		}
	}

	return executed, failed, nil
}

// executeMacro runs a single macro and records the execution.
func (s *MacroService) executeMacro(ctx context.Context, macro *model.Macro, triggerType model.MacroTriggerType, triggeredBy *uuid.UUID, assignmentID *uuid.UUID) (*model.MacroExecution, error) {
	now := time.Now()

	exec := &model.MacroExecution{
		TenantID:     macro.TenantID,
		MacroID:      macro.ID,
		AssignmentID: assignmentID,
		Status:       model.MacroExecutionStatusRunning,
		TriggerType:  triggerType,
		TriggeredBy:  triggeredBy,
		StartedAt:    &now,
	}

	if err := s.repo.CreateExecution(ctx, exec); err != nil {
		return nil, fmt.Errorf("failed to create execution record: %w", err)
	}

	// Execute the action
	result, execErr := executeAction(ctx, macro)

	completedAt := time.Now()
	exec.CompletedAt = &completedAt

	if execErr != nil {
		exec.Status = model.MacroExecutionStatusFailed
		errMsg := execErr.Error()
		exec.ErrorMessage = &errMsg
	} else {
		exec.Status = model.MacroExecutionStatusCompleted
	}

	if result != nil {
		exec.Result = datatypes.JSON(result)
	}

	if updateErr := s.repo.UpdateExecution(ctx, exec); updateErr != nil {
		log.Error().Err(updateErr).Str("execution_id", exec.ID.String()).Msg("failed to update macro execution status")
	}

	return exec, execErr
}

// executeAction runs the predefined action for a macro.
func executeAction(_ context.Context, macro *model.Macro) (json.RawMessage, error) {
	switch macro.ActionType {
	case model.MacroActionLogMessage:
		result := map[string]interface{}{
			"action":     "log_message",
			"macro_name": macro.Name,
			"macro_type": string(macro.MacroType),
			"executed_at": time.Now().UTC().Format(time.RFC3339),
		}
		data, _ := json.Marshal(result)
		log.Info().
			Str("macro_id", macro.ID.String()).
			Str("macro_name", macro.Name).
			Msg("macro log_message executed")
		return data, nil

	case model.MacroActionRecalculateTargetHours:
		// Placeholder: actual implementation would recalculate target hours
		result := map[string]interface{}{
			"action":     "recalculate_target_hours",
			"status":     "placeholder",
			"executed_at": time.Now().UTC().Format(time.RFC3339),
		}
		data, _ := json.Marshal(result)
		return data, nil

	case model.MacroActionResetFlextime:
		// Placeholder: actual implementation would reset flextime counters
		result := map[string]interface{}{
			"action":     "reset_flextime",
			"status":     "placeholder",
			"executed_at": time.Now().UTC().Format(time.RFC3339),
		}
		data, _ := json.Marshal(result)
		return data, nil

	case model.MacroActionCarryForwardBalance:
		// Placeholder: actual implementation would carry forward balances
		result := map[string]interface{}{
			"action":     "carry_forward_balance",
			"status":     "placeholder",
			"executed_at": time.Now().UTC().Format(time.RFC3339),
		}
		data, _ := json.Marshal(result)
		return data, nil

	default:
		return nil, fmt.Errorf("unknown action type: %s", macro.ActionType)
	}
}

// --- Helpers ---

func isValidActionType(at model.MacroActionType) bool {
	switch at {
	case model.MacroActionLogMessage,
		model.MacroActionRecalculateTargetHours,
		model.MacroActionResetFlextime,
		model.MacroActionCarryForwardBalance:
		return true
	default:
		return false
	}
}

func validateExecutionDay(macroType model.MacroType, day int) error {
	switch macroType {
	case model.MacroTypeWeekly:
		if day < 0 || day > 6 {
			return ErrInvalidExecutionDay
		}
	case model.MacroTypeMonthly:
		if day < 1 || day > 31 {
			return ErrInvalidExecutionDay
		}
	}
	return nil
}

// lastDay returns the last day of the given month.
func lastDay(year int, month time.Month) int {
	// Go to the first of the next month, then subtract one day
	return time.Date(year, month+1, 0, 0, 0, 0, 0, time.UTC).Day()
}
```

#### 2. Scheduler Task Handler for Macros
**File**: `apps/api/internal/service/macro_task.go` (new file)

```go
package service

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

// macroServiceForScheduler defines the interface for macro execution from the scheduler.
type macroServiceForScheduler interface {
	ExecuteDueMacros(ctx context.Context, tenantID uuid.UUID, date time.Time) (int, int, error)
}

// ExecuteMacrosTaskHandler handles the execute_macros task type for the scheduler.
type ExecuteMacrosTaskHandler struct {
	macroService macroServiceForScheduler
}

// NewExecuteMacrosTaskHandler creates a new ExecuteMacrosTaskHandler.
func NewExecuteMacrosTaskHandler(macroService macroServiceForScheduler) *ExecuteMacrosTaskHandler {
	return &ExecuteMacrosTaskHandler{macroService: macroService}
}

// Execute runs the macro execution task.
func (h *ExecuteMacrosTaskHandler) Execute(ctx context.Context, tenantID uuid.UUID, params json.RawMessage) (json.RawMessage, error) {
	// Parse optional date parameter (default: today)
	var config struct {
		Date string `json:"date"` // YYYY-MM-DD format, default today
	}
	if len(params) > 0 {
		_ = json.Unmarshal(params, &config)
	}

	date := time.Now()
	if config.Date != "" {
		parsed, err := time.Parse("2006-01-02", config.Date)
		if err != nil {
			return nil, fmt.Errorf("invalid date format: %w", err)
		}
		date = parsed
	}

	log.Info().
		Str("tenant_id", tenantID.String()).
		Str("date", date.Format("2006-01-02")).
		Msg("executing due macros")

	executed, failed, err := h.macroService.ExecuteDueMacros(ctx, tenantID, date)
	if err != nil {
		return nil, fmt.Errorf("macro execution failed: %w", err)
	}

	result := map[string]interface{}{
		"date":     date.Format("2006-01-02"),
		"executed": executed,
		"failed":   failed,
	}
	data, _ := json.Marshal(result)
	return data, nil
}
```

#### 3. Add execute_macros to TaskType constants
**File**: `apps/api/internal/model/schedule.go` -- add to existing TaskType constants:

Add this constant alongside the existing ones:
```go
TaskTypeExecuteMacros TaskType = "execute_macros"
```

#### 4. Add to task catalog
**File**: `apps/api/internal/service/scheduler_catalog.go` -- add to the `GetTaskCatalog()` return slice:

```go
{
    TaskType:    model.TaskTypeExecuteMacros,
    Name:        "Execute Macros",
    Description: "Executes all due weekly and monthly macros for the current date. Runs after daily calculation.",
    ParameterSchema: map[string]interface{}{
        "type": "object",
        "properties": map[string]interface{}{
            "date": map[string]interface{}{
                "type":        "string",
                "format":      "date",
                "description": "Target date (YYYY-MM-DD). Default: today.",
            },
        },
    },
},
```

#### 5. Add to allowed task types in schedule service validation
**File**: `apps/api/internal/service/schedule.go` -- add `model.TaskTypeExecuteMacros` to the `validTaskTypes` allowlist (wherever task type validation occurs).

### Success Criteria:

#### Automated Verification:
- [ ] Code compiles: `cd apps/api && go build ./...`
- [ ] Service follows existing patterns (interface-based repo dependency, input structs, sentinel errors)
- [ ] `lastDay()` function correctly computes last day of month

---

## Phase 5: Handler Layer

### Overview
Create HTTP handlers for macro CRUD, assignment management, and execution trigger.

### Changes Required:

#### 1. Macro Handler
**File**: `apps/api/internal/handler/macro.go` (new file)

```go
package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/service"
)

// MacroHandler handles HTTP requests for macros.
type MacroHandler struct {
	macroService *service.MacroService
}

// NewMacroHandler creates a new MacroHandler.
func NewMacroHandler(macroService *service.MacroService) *MacroHandler {
	return &MacroHandler{macroService: macroService}
}

// List returns all macros for the tenant.
func (h *MacroHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	macros, err := h.macroService.List(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list macros")
		return
	}

	if macros == nil {
		macros = []any_macro_placeholder{}
	}

	respondJSON(w, http.StatusOK, map[string]any{"data": macros})
}

// Get returns a single macro by ID.
func (h *MacroHandler) Get(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid macro ID")
		return
	}

	macro, err := h.macroService.GetByID(r.Context(), tenantID, id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Macro not found")
		return
	}

	respondJSON(w, http.StatusOK, macro)
}

// Create creates a new macro.
func (h *MacroHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req struct {
		Name         string          `json:"name"`
		Description  *string         `json:"description,omitempty"`
		MacroType    string          `json:"macro_type"`
		ActionType   string          `json:"action_type"`
		ActionParams json.RawMessage `json:"action_params,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	input := service.CreateMacroInput{
		TenantID:     tenantID,
		Name:         req.Name,
		Description:  req.Description,
		MacroType:    req.MacroType,
		ActionType:   req.ActionType,
		ActionParams: req.ActionParams,
	}

	macro, err := h.macroService.Create(r.Context(), input)
	if err != nil {
		handleMacroError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, macro)
}

// Update updates a macro.
func (h *MacroHandler) Update(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid macro ID")
		return
	}

	var req struct {
		Name         *string         `json:"name,omitempty"`
		Description  *string         `json:"description,omitempty"`
		MacroType    *string         `json:"macro_type,omitempty"`
		ActionType   *string         `json:"action_type,omitempty"`
		ActionParams json.RawMessage `json:"action_params,omitempty"`
		IsActive     *bool           `json:"is_active,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	input := service.UpdateMacroInput{
		Name:         req.Name,
		Description:  req.Description,
		MacroType:    req.MacroType,
		ActionType:   req.ActionType,
		ActionParams: req.ActionParams,
		IsActive:     req.IsActive,
	}

	macro, err := h.macroService.Update(r.Context(), tenantID, id, input)
	if err != nil {
		handleMacroError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, macro)
}

// Delete deletes a macro.
func (h *MacroHandler) Delete(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid macro ID")
		return
	}

	if err := h.macroService.Delete(r.Context(), tenantID, id); err != nil {
		handleMacroError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// --- Assignment endpoints ---

// ListAssignments returns all assignments for a macro.
func (h *MacroHandler) ListAssignments(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	macroID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid macro ID")
		return
	}

	assignments, err := h.macroService.ListAssignments(r.Context(), tenantID, macroID)
	if err != nil {
		handleMacroError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{"data": assignments})
}

// CreateAssignment creates a new assignment for a macro.
func (h *MacroHandler) CreateAssignment(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	macroID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid macro ID")
		return
	}

	var req struct {
		TariffID     *string `json:"tariff_id,omitempty"`
		EmployeeID   *string `json:"employee_id,omitempty"`
		ExecutionDay int     `json:"execution_day"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	input := service.CreateAssignmentInput{
		TenantID:     tenantID,
		MacroID:      macroID,
		ExecutionDay: req.ExecutionDay,
	}

	if req.TariffID != nil {
		id, err := uuid.Parse(*req.TariffID)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid tariff_id")
			return
		}
		input.TariffID = &id
	}

	if req.EmployeeID != nil {
		id, err := uuid.Parse(*req.EmployeeID)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid employee_id")
			return
		}
		input.EmployeeID = &id
	}

	assignment, err := h.macroService.CreateAssignment(r.Context(), input)
	if err != nil {
		handleMacroError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, assignment)
}

// UpdateAssignment updates a macro assignment.
func (h *MacroHandler) UpdateAssignment(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	macroID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid macro ID")
		return
	}

	assignmentID, err := uuid.Parse(chi.URLParam(r, "assignmentId"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid assignment ID")
		return
	}

	var req struct {
		ExecutionDay *int  `json:"execution_day,omitempty"`
		IsActive     *bool `json:"is_active,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	input := service.UpdateAssignmentInput{
		ExecutionDay: req.ExecutionDay,
		IsActive:     req.IsActive,
	}

	assignment, err := h.macroService.UpdateAssignment(r.Context(), tenantID, macroID, assignmentID, input)
	if err != nil {
		handleMacroError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, assignment)
}

// DeleteAssignment deletes a macro assignment.
func (h *MacroHandler) DeleteAssignment(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	macroID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid macro ID")
		return
	}

	assignmentID, err := uuid.Parse(chi.URLParam(r, "assignmentId"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid assignment ID")
		return
	}

	if err := h.macroService.DeleteAssignment(r.Context(), tenantID, macroID, assignmentID); err != nil {
		handleMacroError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// --- Execution endpoints ---

// TriggerExecution manually triggers a macro execution.
func (h *MacroHandler) TriggerExecution(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	macroID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid macro ID")
		return
	}

	// Get user ID from auth context if available
	var triggeredBy *uuid.UUID
	if userID, ok := middleware.UserIDFromContext(r.Context()); ok {
		triggeredBy = &userID
	}

	exec, err := h.macroService.TriggerExecution(r.Context(), tenantID, macroID, triggeredBy)
	if err != nil {
		handleMacroError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, exec)
}

// ListExecutions returns execution history for a macro.
func (h *MacroHandler) ListExecutions(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	macroID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid macro ID")
		return
	}

	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	executions, err := h.macroService.ListExecutions(r.Context(), tenantID, macroID, limit)
	if err != nil {
		handleMacroError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{"data": executions})
}

// GetExecution returns a single execution by ID.
func (h *MacroHandler) GetExecution(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid execution ID")
		return
	}

	exec, err := h.macroService.GetExecution(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Execution not found")
		return
	}

	respondJSON(w, http.StatusOK, exec)
}

// handleMacroError maps service errors to HTTP responses.
func handleMacroError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrMacroNotFound:
		respondError(w, http.StatusNotFound, "Macro not found")
	case service.ErrMacroNameExists:
		respondError(w, http.StatusConflict, "Macro name already exists")
	case service.ErrMacroNameReq:
		respondError(w, http.StatusBadRequest, "Macro name is required")
	case service.ErrInvalidMacroType:
		respondError(w, http.StatusBadRequest, "Invalid macro type (must be 'weekly' or 'monthly')")
	case service.ErrInvalidActionType:
		respondError(w, http.StatusBadRequest, "Invalid action type")
	case service.ErrMacroAssignmentNotFound:
		respondError(w, http.StatusNotFound, "Assignment not found")
	case service.ErrAssignmentTargetReq:
		respondError(w, http.StatusBadRequest, "Either tariff_id or employee_id is required")
	case service.ErrAssignmentTargetBoth:
		respondError(w, http.StatusBadRequest, "Only one of tariff_id or employee_id can be set")
	case service.ErrInvalidExecutionDay:
		respondError(w, http.StatusBadRequest, "Invalid execution day")
	case service.ErrMacroInactive:
		respondError(w, http.StatusBadRequest, "Macro is not active")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
```

**Note**: The handler uses inline request structs rather than generated models since we will define the OpenAPI spec. After `make generate`, we should switch to using generated models. For the initial implementation, inline structs work fine and match the pattern used by some other handlers (e.g., `createTariffBreakRequest` in `handler/tariff.go`).

#### 2. Route Registration
**File**: `apps/api/internal/handler/routes.go` -- add at the end of the file:

```go
// RegisterMacroRoutes registers macro routes.
func RegisterMacroRoutes(r chi.Router, h *MacroHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("macros.manage").String()

	// Macro CRUD
	r.Route("/macros", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)

			// Assignment management
			r.Get("/{id}/assignments", h.ListAssignments)
			r.Post("/{id}/assignments", h.CreateAssignment)
			r.Patch("/{id}/assignments/{assignmentId}", h.UpdateAssignment)
			r.Delete("/{id}/assignments/{assignmentId}", h.DeleteAssignment)

			// Execution
			r.Post("/{id}/execute", h.TriggerExecution)
			r.Get("/{id}/executions", h.ListExecutions)
			return
		}

		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)

		// Assignment management
		r.With(authz.RequirePermission(permManage)).Get("/{id}/assignments", h.ListAssignments)
		r.With(authz.RequirePermission(permManage)).Post("/{id}/assignments", h.CreateAssignment)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}/assignments/{assignmentId}", h.UpdateAssignment)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}/assignments/{assignmentId}", h.DeleteAssignment)

		// Execution
		r.With(authz.RequirePermission(permManage)).Post("/{id}/execute", h.TriggerExecution)
		r.With(authz.RequirePermission(permManage)).Get("/{id}/executions", h.ListExecutions)
	})

	// Execution detail
	if authz == nil {
		r.Get("/macro-executions/{id}", h.GetExecution)
	} else {
		r.With(authz.RequirePermission(permManage)).Get("/macro-executions/{id}", h.GetExecution)
	}
}
```

#### 3. Add permission
**File**: `apps/api/internal/permissions/permissions.go` -- add to `allPermissions` slice:

```go
{ID: permissionID("macros.manage"), Resource: "macros", Action: "manage", Description: "Manage macros and macro assignments"},
```

### Success Criteria:

#### Automated Verification:
- [ ] Code compiles: `cd apps/api && go build ./...`
- [ ] Handler follows established patterns (tenant extraction, error mapping, respondJSON/respondError)

---

## Phase 6: Main.go Wiring

### Overview
Wire up the macro repository, service, handler, and scheduler task handler in main.go.

### Changes Required:

#### 1. main.go additions
**File**: `apps/api/cmd/server/main.go`

Add after the shift planning initialization block (around line 359):

```go
// Initialize Macros
macroRepo := repository.NewMacroRepository(db)
macroService := service.NewMacroService(macroRepo)
macroHandler := handler.NewMacroHandler(macroService)
```

Add to the scheduler task handler registration block (around line 374, after existing `RegisterHandler` calls):

```go
schedulerExecutor.RegisterHandler(model.TaskTypeExecuteMacros, service.NewExecuteMacrosTaskHandler(macroService))
```

Add to the tenant-scoped route registration block (around line 528, after `RegisterShiftAssignmentRoutes`):

```go
handler.RegisterMacroRoutes(r, macroHandler, authzMiddleware)
```

### Success Criteria:

#### Automated Verification:
- [ ] Code compiles: `cd apps/api && go build ./...`
- [ ] Server starts without errors: `make dev`

---

## Phase 7: OpenAPI Specification

### Overview
Define the OpenAPI spec for macro endpoints, schemas, and add to the root spec file.

### Changes Required:

#### 1. Macro Schemas
**File**: `api/schemas/macros.yaml` (new file)

```yaml
# Macro schemas
Macro:
  type: object
  required:
    - id
    - tenant_id
    - name
    - macro_type
    - action_type
  properties:
    id:
      type: string
      format: uuid
    tenant_id:
      type: string
      format: uuid
    name:
      type: string
      example: "Weekly Target Hours Reset"
    description:
      type: string
      x-nullable: true
    macro_type:
      type: string
      enum: [weekly, monthly]
      description: "weekly = executes on a specific weekday; monthly = executes on a specific day of month"
    action_type:
      type: string
      enum: [log_message, recalculate_target_hours, reset_flextime, carry_forward_balance]
    action_params:
      type: object
      description: "Action-specific configuration parameters"
    is_active:
      type: boolean
    assignments:
      type: array
      items:
        $ref: '#/MacroAssignment'
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time

MacroAssignment:
  type: object
  required:
    - id
    - tenant_id
    - macro_id
    - execution_day
  properties:
    id:
      type: string
      format: uuid
    tenant_id:
      type: string
      format: uuid
    macro_id:
      type: string
      format: uuid
    tariff_id:
      type: string
      format: uuid
      x-nullable: true
      description: "Tariff this macro is assigned to (mutually exclusive with employee_id)"
    employee_id:
      type: string
      format: uuid
      x-nullable: true
      description: "Employee this macro is assigned to (mutually exclusive with tariff_id)"
    execution_day:
      type: integer
      description: "For weekly macros: 0=Sunday..6=Saturday. For monthly macros: 1-31 (falls back to last day of month if exceeds month length)"
    is_active:
      type: boolean
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time

MacroExecution:
  type: object
  required:
    - id
    - tenant_id
    - macro_id
    - status
    - trigger_type
  properties:
    id:
      type: string
      format: uuid
    tenant_id:
      type: string
      format: uuid
    macro_id:
      type: string
      format: uuid
    assignment_id:
      type: string
      format: uuid
      x-nullable: true
    status:
      type: string
      enum: [pending, running, completed, failed]
    trigger_type:
      type: string
      enum: [scheduled, manual]
    triggered_by:
      type: string
      format: uuid
      x-nullable: true
    started_at:
      type: string
      format: date-time
      x-nullable: true
    completed_at:
      type: string
      format: date-time
      x-nullable: true
    result:
      type: object
    error_message:
      type: string
      x-nullable: true
    created_at:
      type: string
      format: date-time

MacroList:
  type: object
  properties:
    data:
      type: array
      items:
        $ref: '#/Macro'

MacroAssignmentList:
  type: object
  properties:
    data:
      type: array
      items:
        $ref: '#/MacroAssignment'

MacroExecutionList:
  type: object
  properties:
    data:
      type: array
      items:
        $ref: '#/MacroExecution'

CreateMacroRequest:
  type: object
  required:
    - name
    - macro_type
    - action_type
  properties:
    name:
      type: string
    description:
      type: string
    macro_type:
      type: string
      enum: [weekly, monthly]
    action_type:
      type: string
      enum: [log_message, recalculate_target_hours, reset_flextime, carry_forward_balance]
    action_params:
      type: object

UpdateMacroRequest:
  type: object
  properties:
    name:
      type: string
    description:
      type: string
    macro_type:
      type: string
      enum: [weekly, monthly]
    action_type:
      type: string
      enum: [log_message, recalculate_target_hours, reset_flextime, carry_forward_balance]
    action_params:
      type: object
    is_active:
      type: boolean

CreateMacroAssignmentRequest:
  type: object
  required:
    - execution_day
  properties:
    tariff_id:
      type: string
      format: uuid
      description: "Mutually exclusive with employee_id"
    employee_id:
      type: string
      format: uuid
      description: "Mutually exclusive with tariff_id"
    execution_day:
      type: integer
      description: "For weekly: 0-6 (Sun-Sat). For monthly: 1-31."

UpdateMacroAssignmentRequest:
  type: object
  properties:
    execution_day:
      type: integer
    is_active:
      type: boolean
```

#### 2. Macro Paths
**File**: `api/paths/macros.yaml` (new file)

```yaml
# Macro endpoints
/macros:
  get:
    tags:
      - Macros
    summary: List macros
    operationId: listMacros
    responses:
      200:
        description: List of macros
        schema:
          $ref: '../schemas/macros.yaml#/MacroList'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
  post:
    tags:
      - Macros
    summary: Create macro
    operationId: createMacro
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '../schemas/macros.yaml#/CreateMacroRequest'
    responses:
      201:
        description: Created macro
        schema:
          $ref: '../schemas/macros.yaml#/Macro'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      409:
        description: Macro name already exists
        schema:
          $ref: '../schemas/common.yaml#/ProblemDetails'

/macros/{id}:
  get:
    tags:
      - Macros
    summary: Get macro by ID
    operationId: getMacro
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
    responses:
      200:
        description: Macro details
        schema:
          $ref: '../schemas/macros.yaml#/Macro'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
  patch:
    tags:
      - Macros
    summary: Update macro
    operationId: updateMacro
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
          $ref: '../schemas/macros.yaml#/UpdateMacroRequest'
    responses:
      200:
        description: Updated macro
        schema:
          $ref: '../schemas/macros.yaml#/Macro'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
  delete:
    tags:
      - Macros
    summary: Delete macro
    operationId: deleteMacro
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
    responses:
      204:
        description: Macro deleted
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'

/macros/{id}/assignments:
  get:
    tags:
      - Macros
    summary: List macro assignments
    operationId: listMacroAssignments
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
    responses:
      200:
        description: List of assignments
        schema:
          $ref: '../schemas/macros.yaml#/MacroAssignmentList'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
  post:
    tags:
      - Macros
    summary: Create macro assignment
    operationId: createMacroAssignment
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
          $ref: '../schemas/macros.yaml#/CreateMacroAssignmentRequest'
    responses:
      201:
        description: Created assignment
        schema:
          $ref: '../schemas/macros.yaml#/MacroAssignment'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'

/macros/{id}/assignments/{assignmentId}:
  patch:
    tags:
      - Macros
    summary: Update macro assignment
    operationId: updateMacroAssignment
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
          $ref: '../schemas/macros.yaml#/UpdateMacroAssignmentRequest'
    responses:
      200:
        description: Updated assignment
        schema:
          $ref: '../schemas/macros.yaml#/MacroAssignment'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
  delete:
    tags:
      - Macros
    summary: Delete macro assignment
    operationId: deleteMacroAssignment
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

/macros/{id}/execute:
  post:
    tags:
      - Macros
    summary: Trigger macro execution
    operationId: triggerMacroExecution
    description: |
      Manually triggers execution of a macro. The macro must be active.
      Weekly macros execute on their configured weekday (0=Sunday..6=Saturday).
      Monthly macros execute on their configured day of month (1-31).
      If a monthly macro is configured for day 31 but the month has fewer days,
      execution falls back to the last day of the month.
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
    responses:
      200:
        description: Execution result
        schema:
          $ref: '../schemas/macros.yaml#/MacroExecution'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'

/macros/{id}/executions:
  get:
    tags:
      - Macros
    summary: List macro executions
    operationId: listMacroExecutions
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
      - name: limit
        in: query
        type: integer
        default: 20
    responses:
      200:
        description: List of executions
        schema:
          $ref: '../schemas/macros.yaml#/MacroExecutionList'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'

/macro-executions/{id}:
  get:
    tags:
      - Macros
    summary: Get macro execution by ID
    operationId: getMacroExecution
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
    responses:
      200:
        description: Execution details
        schema:
          $ref: '../schemas/macros.yaml#/MacroExecution'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
```

#### 3. Root OpenAPI Spec Updates
**File**: `api/openapi.yaml`

Add to the `tags:` section (after the Shift Assignments tag):
```yaml
  - name: Macros
    description: Weekly and monthly macro definitions, assignments, and execution
```

Add to the `paths:` section (after the shift planning paths, before `definitions:`):
```yaml
  # Macros
  /macros:
    $ref: 'paths/macros.yaml#/~1macros'
  /macros/{id}:
    $ref: 'paths/macros.yaml#/~1macros~1{id}'
  /macros/{id}/assignments:
    $ref: 'paths/macros.yaml#/~1macros~1{id}~1assignments'
  /macros/{id}/assignments/{assignmentId}:
    $ref: 'paths/macros.yaml#/~1macros~1{id}~1assignments~1{assignmentId}'
  /macros/{id}/execute:
    $ref: 'paths/macros.yaml#/~1macros~1{id}~1execute'
  /macros/{id}/executions:
    $ref: 'paths/macros.yaml#/~1macros~1{id}~1executions'
  /macro-executions/{id}:
    $ref: 'paths/macros.yaml#/~1macro-executions~1{id}'
```

### Success Criteria:

#### Automated Verification:
- [ ] OpenAPI bundles successfully: `make swagger-bundle`
- [ ] Models generate successfully: `make generate`
- [ ] Code compiles after regeneration: `cd apps/api && go build ./...`

---

## Phase 8: Testing

### Overview
Write unit tests for the macro service, particularly the monthly day fallback logic and execution scheduling.

### Changes Required:

#### 1. Service Tests
**File**: `apps/api/internal/service/macro_test.go` (new file)

Key test cases to implement:

```go
// TestLastDay verifies the lastDay helper for various months
func TestLastDay(t *testing.T) {
    // February non-leap: 28
    // February leap: 29
    // April: 30
    // January: 31
}

// TestValidateExecutionDay verifies weekday and day-of-month validation
func TestValidateExecutionDay(t *testing.T) {
    // Weekly: 0-6 valid, -1 and 7 invalid
    // Monthly: 1-31 valid, 0 and 32 invalid
}

// TestMonthlyMacroFallback verifies that monthly macros on day 31 fall back to last day of month
func TestMonthlyMacroFallback(t *testing.T) {
    // Day 31 in February -> runs on 28 (or 29 in leap year)
    // Day 31 in April -> runs on 30
    // Day 31 in January -> runs on 31
}

// TestWeeklyMacroExecution verifies that weekly macros execute on the correct weekday
func TestWeeklyMacroExecution(t *testing.T) {
    // Sunday (0) -> only executes when date.Weekday() == 0
}

// TestCreateMacro validates macro creation
func TestCreateMacro(t *testing.T) {
    // Valid creation
    // Missing name
    // Invalid macro type
    // Invalid action type
    // Duplicate name
}

// TestCreateAssignment validates assignment creation
func TestCreateAssignment(t *testing.T) {
    // Valid with tariff_id
    // Valid with employee_id
    // Missing both tariff_id and employee_id
    // Both tariff_id and employee_id set
    // Invalid execution day for weekly
    // Invalid execution day for monthly
}
```

### Success Criteria:

#### Automated Verification:
- [ ] All tests pass: `cd apps/api && go test -v -run TestMacro ./internal/service/...`
- [ ] All tests pass: `cd apps/api && go test -race ./...`
- [ ] `make lint` passes

#### Manual Verification:
- [ ] Create a weekly macro via API, assign to tariff, trigger execution, verify execution log
- [ ] Create a monthly macro on day 31, verify it handles February correctly
- [ ] Swagger UI shows all macro endpoints with correct schemas

---

## Testing Strategy

### Unit Tests:
- `lastDay()` helper for February (leap and non-leap), April, January
- `validateExecutionDay()` for weekly (0-6) and monthly (1-31) boundaries
- `ExecuteDueMacros()` with mocked repository, verifying monthly day fallback
- Create/Update macro validation (name required, valid types)
- Assignment validation (exactly one target, valid execution day)

### Integration Tests:
- Full CRUD lifecycle: create macro -> assign to tariff -> trigger execution -> verify execution log
- Scheduler integration: `execute_macros` task type executes due macros

### Manual Testing Steps:
1. Create a macro: `POST /api/v1/macros` with name, type=weekly, action_type=log_message
2. Create assignment: `POST /api/v1/macros/{id}/assignments` with tariff_id and execution_day=1 (Monday)
3. Trigger execution: `POST /api/v1/macros/{id}/execute`
4. Check executions: `GET /api/v1/macros/{id}/executions`
5. Verify Swagger UI shows all endpoints at `/swagger/`

## Performance Considerations

- The `ListActiveByType` query uses `tenant_id + is_active + macro_type` indexes for efficient filtering
- Assignment preloading avoids N+1 queries during macro execution
- Execution history uses `created_at DESC` index with LIMIT for pagination

## Migration Notes

- Migration number: `000077`
- No existing data to migrate
- Cascade delete ensures cleanup when tenants/tariffs/employees are removed
- The `CHECK` constraint on `macro_assignments` ensures exactly one of tariff_id/employee_id is set

## Summary of Files to Create/Modify

### New Files:
1. `db/migrations/000077_create_macros.up.sql`
2. `db/migrations/000077_create_macros.down.sql`
3. `apps/api/internal/model/macro.go`
4. `apps/api/internal/repository/macro.go`
5. `apps/api/internal/service/macro.go`
6. `apps/api/internal/service/macro_task.go`
7. `apps/api/internal/handler/macro.go`
8. `apps/api/internal/service/macro_test.go`
9. `api/schemas/macros.yaml`
10. `api/paths/macros.yaml`

### Modified Files:
1. `apps/api/internal/model/schedule.go` -- add `TaskTypeExecuteMacros` constant
2. `apps/api/internal/service/scheduler_catalog.go` -- add execute_macros to catalog
3. `apps/api/internal/service/schedule.go` -- add execute_macros to valid task types
4. `apps/api/internal/handler/routes.go` -- add `RegisterMacroRoutes`
5. `apps/api/internal/permissions/permissions.go` -- add `macros.manage` permission
6. `apps/api/cmd/server/main.go` -- wire repo, service, handler, scheduler task
7. `api/openapi.yaml` -- add Macros tag and path references

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-032-macros-weekly-monthly.md`
- Research document: `thoughts/shared/research/2026-01-30-ZMI-TICKET-032-macros-weekly-monthly.md`
- Similar implementation pattern: `apps/api/internal/service/scheduler_executor.go` (TaskExecutor interface)
- Assignment pattern: `apps/api/internal/model/employeetariffassignment.go`
- Scheduler handler wiring: `apps/api/cmd/server/main.go:361-381`
