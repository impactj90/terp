# TICKET-056: Create Employee Day Plan Model + Repository

**Type**: Model/Repository
**Effort**: S
**Sprint**: 10 - Bookings
**Dependencies**: TICKET-055

## Description

Create the EmployeeDayPlan model and repository.

## Files to Create

- `apps/api/internal/model/employeedayplan.go`
- `apps/api/internal/repository/employeedayplan.go`

## Implementation

### Model

```go
package model

import (
    "time"

    "github.com/google/uuid"
)

type EmployeeDayPlanSource string

const (
    EmployeeDayPlanSourceTariff  EmployeeDayPlanSource = "tariff"
    EmployeeDayPlanSourceManual  EmployeeDayPlanSource = "manual"
    EmployeeDayPlanSourceHoliday EmployeeDayPlanSource = "holiday"
)

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

func (EmployeeDayPlan) TableName() string {
    return "employee_day_plans"
}

// IsOffDay returns true if no day plan is assigned
func (edp *EmployeeDayPlan) IsOffDay() bool {
    return edp.DayPlanID == nil
}
```

### Repository

```go
type EmployeeDayPlanRepository interface {
    Create(ctx context.Context, plan *model.EmployeeDayPlan) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.EmployeeDayPlan, error)
    Update(ctx context.Context, plan *model.EmployeeDayPlan) error
    Delete(ctx context.Context, id uuid.UUID) error

    // Core lookups
    GetForEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.EmployeeDayPlan, error)
    GetForEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.EmployeeDayPlan, error)

    // Bulk operations
    Upsert(ctx context.Context, plan *model.EmployeeDayPlan) error
    BulkCreate(ctx context.Context, plans []model.EmployeeDayPlan) error
    DeleteRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) error
}

func (r *employeeDayPlanRepository) GetForEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.EmployeeDayPlan, error) {
    var plan model.EmployeeDayPlan
    err := r.db.WithContext(ctx).
        Preload("DayPlan").
        Preload("DayPlan.Breaks").
        Preload("DayPlan.Bonuses").
        Where("employee_id = ? AND plan_date = ?", employeeID, date).
        First(&plan).Error
    if err == gorm.ErrRecordNotFound {
        return nil, nil
    }
    return &plan, err
}

func (r *employeeDayPlanRepository) Upsert(ctx context.Context, plan *model.EmployeeDayPlan) error {
    return r.db.WithContext(ctx).
        Clauses(clause.OnConflict{
            Columns:   []clause.Column{{Name: "employee_id"}, {Name: "plan_date"}},
            DoUpdates: clause.AssignmentColumns([]string{"day_plan_id", "source", "notes", "updated_at"}),
        }).
        Create(plan).Error
}

func (r *employeeDayPlanRepository) BulkCreate(ctx context.Context, plans []model.EmployeeDayPlan) error {
    return r.db.WithContext(ctx).
        Clauses(clause.OnConflict{
            Columns:   []clause.Column{{Name: "employee_id"}, {Name: "plan_date"}},
            DoUpdates: clause.AssignmentColumns([]string{"day_plan_id", "source", "notes", "updated_at"}),
        }).
        CreateInBatches(plans, 100).Error
}
```

## Acceptance Criteria

- [ ] Compiles without errors
- [ ] `make lint` passes
- [ ] GetForEmployeeDate preloads day plan with breaks/bonuses
- [ ] Upsert handles conflict on employee_id + plan_date
- [ ] BulkCreate efficiently inserts/updates multiple records
