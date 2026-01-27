# TICKET-056: Create Employee Day Plan Model + Repository - Implementation Plan

## Overview

Create the EmployeeDayPlan model and repository to manage employee-specific day plan assignments per date. This builds on the migration created in TICKET-055.

## Current State Analysis

- **Migration exists**: `db/migrations/000023_create_employee_day_plans.up.sql` created the `employee_day_plans` table
- **Related models exist**: `DayPlan` (with Breaks/Bonuses) and `Employee` models are in place
- **Pattern reference**: `Booking` model/repository provides recent implementation pattern to follow

### Key Discoveries:
- Repository pattern uses concrete structs, no interfaces (`apps/api/internal/repository/booking.go:32-35`)
- Custom errors defined at package level (`apps/api/internal/repository/booking.go:15-17`)
- Preload chains support nested relations (`DayPlan.Breaks`, `DayPlan.Bonuses`)
- `clause.OnConflict` is new to codebase but standard GORM for upserts
- Import path uses `github.com/tolga/terp/internal/model` for repository files

## Desired End State

Two new files implementing employee day plan data access:
- `apps/api/internal/model/employeedayplan.go` - Model with enum, struct, helper
- `apps/api/internal/repository/employeedayplan.go` - Repository with CRUD and bulk operations

### Verification:
- Code compiles: `cd apps/api && go build ./...`
- Linting passes: `make lint`
- All repository methods work with the database schema

## What We're NOT Doing

- API handlers (future ticket)
- Service layer (future ticket)
- Tests (separate concern, can be added later)

## Implementation Approach

Follow established patterns from `booking.go` model and repository. The ticket provides exact code, so implementation is primarily copying with verification against patterns.

---

## Phase 1: Create EmployeeDayPlan Model

### Overview
Create the model file with enum type, struct definition, TableName method, and IsOffDay helper.

### Changes Required:

#### 1. Create Model File
**File**: `apps/api/internal/model/employeedayplan.go`
**Action**: Create new file

```go
package model

import (
	"time"

	"github.com/google/uuid"
)

// EmployeeDayPlanSource represents the origin of a day plan assignment.
type EmployeeDayPlanSource string

const (
	EmployeeDayPlanSourceTariff  EmployeeDayPlanSource = "tariff"
	EmployeeDayPlanSourceManual  EmployeeDayPlanSource = "manual"
	EmployeeDayPlanSourceHoliday EmployeeDayPlanSource = "holiday"
)

// EmployeeDayPlan represents an assigned day plan for an employee on a specific date.
type EmployeeDayPlan struct {
	ID         uuid.UUID             `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID   uuid.UUID             `gorm:"type:uuid;not null;index" json:"tenant_id"`
	EmployeeID uuid.UUID             `gorm:"type:uuid;not null;index" json:"employee_id"`
	PlanDate   time.Time             `gorm:"type:date;not null" json:"plan_date"`
	DayPlanID  *uuid.UUID            `gorm:"type:uuid" json:"day_plan_id,omitempty"`
	Source     EmployeeDayPlanSource `gorm:"type:varchar(20);default:'tariff'" json:"source"`
	Notes      string                `gorm:"type:text" json:"notes,omitempty"`
	CreatedAt  time.Time             `gorm:"default:now()" json:"created_at"`
	UpdatedAt  time.Time             `gorm:"default:now()" json:"updated_at"`

	// Relations
	Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
	DayPlan  *DayPlan  `gorm:"foreignKey:DayPlanID" json:"day_plan,omitempty"`
}

// TableName returns the database table name.
func (EmployeeDayPlan) TableName() string {
	return "employee_day_plans"
}

// IsOffDay returns true if no day plan is assigned (employee is off).
func (edp *EmployeeDayPlan) IsOffDay() bool {
	return edp.DayPlanID == nil
}
```

### Success Criteria:

#### Automated Verification:
- [x] File compiles: `cd apps/api && go build ./internal/model/`
- [x] No linting errors: `make lint`

---

## Phase 2: Create EmployeeDayPlan Repository

### Overview
Create the repository file with CRUD operations, specialized queries, and bulk operations using `clause.OnConflict` for upserts.

### Changes Required:

#### 1. Create Repository File
**File**: `apps/api/internal/repository/employeedayplan.go`
**Action**: Create new file

```go
package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrEmployeeDayPlanNotFound = errors.New("employee day plan not found")
)

// EmployeeDayPlanRepository handles employee day plan data access.
type EmployeeDayPlanRepository struct {
	db *DB
}

// NewEmployeeDayPlanRepository creates a new employee day plan repository.
func NewEmployeeDayPlanRepository(db *DB) *EmployeeDayPlanRepository {
	return &EmployeeDayPlanRepository{db: db}
}

// Create creates a new employee day plan.
func (r *EmployeeDayPlanRepository) Create(ctx context.Context, plan *model.EmployeeDayPlan) error {
	return r.db.GORM.WithContext(ctx).Create(plan).Error
}

// GetByID retrieves an employee day plan by ID.
func (r *EmployeeDayPlanRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.EmployeeDayPlan, error) {
	var plan model.EmployeeDayPlan
	err := r.db.GORM.WithContext(ctx).
		First(&plan, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrEmployeeDayPlanNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get employee day plan: %w", err)
	}
	return &plan, nil
}

// Update updates an employee day plan.
func (r *EmployeeDayPlanRepository) Update(ctx context.Context, plan *model.EmployeeDayPlan) error {
	return r.db.GORM.WithContext(ctx).Save(plan).Error
}

// Delete deletes an employee day plan by ID.
func (r *EmployeeDayPlanRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.EmployeeDayPlan{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete employee day plan: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrEmployeeDayPlanNotFound
	}
	return nil
}

// GetForEmployeeDate retrieves the day plan for an employee on a specific date.
// Returns nil, nil if no plan exists for that date.
func (r *EmployeeDayPlanRepository) GetForEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.EmployeeDayPlan, error) {
	var plan model.EmployeeDayPlan
	err := r.db.GORM.WithContext(ctx).
		Preload("DayPlan").
		Preload("DayPlan.Breaks").
		Preload("DayPlan.Bonuses").
		Where("employee_id = ? AND plan_date = ?", employeeID, date).
		First(&plan).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get employee day plan: %w", err)
	}
	return &plan, nil
}

// GetForEmployeeDateRange retrieves all day plans for an employee within a date range.
func (r *EmployeeDayPlanRepository) GetForEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.EmployeeDayPlan, error) {
	var plans []model.EmployeeDayPlan
	err := r.db.GORM.WithContext(ctx).
		Preload("DayPlan").
		Preload("DayPlan.Breaks").
		Preload("DayPlan.Bonuses").
		Where("employee_id = ? AND plan_date >= ? AND plan_date <= ?", employeeID, from, to).
		Order("plan_date ASC").
		Find(&plans).Error

	if err != nil {
		return nil, fmt.Errorf("failed to get employee day plans for range: %w", err)
	}
	return plans, nil
}

// Upsert creates or updates an employee day plan based on employee_id + plan_date.
func (r *EmployeeDayPlanRepository) Upsert(ctx context.Context, plan *model.EmployeeDayPlan) error {
	return r.db.GORM.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "employee_id"}, {Name: "plan_date"}},
			DoUpdates: clause.AssignmentColumns([]string{"day_plan_id", "source", "notes", "updated_at"}),
		}).
		Create(plan).Error
}

// BulkCreate creates or updates multiple employee day plans efficiently.
func (r *EmployeeDayPlanRepository) BulkCreate(ctx context.Context, plans []model.EmployeeDayPlan) error {
	if len(plans) == 0 {
		return nil
	}
	return r.db.GORM.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "employee_id"}, {Name: "plan_date"}},
			DoUpdates: clause.AssignmentColumns([]string{"day_plan_id", "source", "notes", "updated_at"}),
		}).
		CreateInBatches(plans, 100).Error
}

// DeleteRange deletes all employee day plans for an employee within a date range.
func (r *EmployeeDayPlanRepository) DeleteRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) error {
	result := r.db.GORM.WithContext(ctx).
		Where("employee_id = ? AND plan_date >= ? AND plan_date <= ?", employeeID, from, to).
		Delete(&model.EmployeeDayPlan{})

	if result.Error != nil {
		return fmt.Errorf("failed to delete employee day plans: %w", result.Error)
	}
	return nil
}
```

### Success Criteria:

#### Automated Verification:
- [x] File compiles: `cd apps/api && go build ./internal/repository/`
- [x] Full build succeeds: `cd apps/api && go build ./...`
- [x] Linting passes: `make lint`

---

## Testing Strategy

### Unit Tests (future):
- Test CRUD operations against test database
- Test GetForEmployeeDate returns nil, nil for non-existent records
- Test Upsert handles both insert and update cases
- Test BulkCreate with 150+ records to verify batching

### Integration Tests (future):
- Test preload chain loads DayPlan.Breaks and DayPlan.Bonuses
- Test unique constraint prevents duplicate employee+date entries

---

## References

- Ticket: `thoughts/shared/plans/tickets/TICKET-056-create-employee-day-plan-model-repository.md`
- Research: `thoughts/shared/research/2026-01-18-TICKET-056-create-employee-day-plan-model-repository.md`
- Migration: `db/migrations/000023_create_employee_day_plans.up.sql`
- Pattern reference - Model: `apps/api/internal/model/booking.go`
- Pattern reference - Repository: `apps/api/internal/repository/booking.go`
