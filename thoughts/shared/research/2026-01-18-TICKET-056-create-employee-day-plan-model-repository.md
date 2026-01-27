---
date: 2026-01-18T13:16:47+01:00
researcher: impactj90
git_commit: 96962c2c4d9b1940712dc7e5746874a7efe0db00
branch: master
repository: terp
topic: "TICKET-056: Create Employee Day Plan Model + Repository"
tags: [research, codebase, model, repository, employee-day-plan, gorm]
status: complete
last_updated: 2026-01-18
last_updated_by: impactj90
---

# Research: TICKET-056 - Create Employee Day Plan Model + Repository

**Date**: 2026-01-18T13:16:47+01:00
**Researcher**: impactj90
**Git Commit**: 96962c2c4d9b1940712dc7e5746874a7efe0db00
**Branch**: master
**Repository**: terp

## Research Question

Document the existing codebase patterns for creating the EmployeeDayPlan model and repository as specified in TICKET-056.

## Summary

The codebase follows consistent patterns for models and repositories. This research documents:
1. The migration schema from TICKET-055 (employee_day_plans table)
2. Standard model patterns (UUIDs, GORM tags, relations, enums, helper methods)
3. Standard repository patterns (CRUD, preloads, bulk operations, error handling)
4. Related models (DayPlan, Employee) and their preload chains

## Detailed Findings

### 1. Migration Schema (TICKET-055)

The `employee_day_plans` table was created in migration 000023:

**File**: `db/migrations/000023_create_employee_day_plans.up.sql`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() |
| `tenant_id` | UUID | NOT NULL, FK → tenants(id) ON DELETE CASCADE |
| `employee_id` | UUID | NOT NULL, FK → employees(id) ON DELETE CASCADE |
| `plan_date` | DATE | NOT NULL |
| `day_plan_id` | UUID | NULLABLE, FK → day_plans(id) ON DELETE SET NULL |
| `source` | VARCHAR(20) | DEFAULT 'tariff' |
| `notes` | TEXT | NULLABLE |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() |

**Constraints**:
- `UNIQUE(employee_id, plan_date)` - One plan per employee per date
- `ON DELETE SET NULL` for day_plan_id - Preserves record when day plan deleted

**Indexes**:
- `idx_employee_day_plans_tenant` on `tenant_id`
- `idx_employee_day_plans_employee_date` on `(employee_id, plan_date)`
- `idx_employee_day_plans_date` on `plan_date`

---

### 2. Model Patterns

#### 2.1 File Structure Pattern

Models follow this structure (see `apps/api/internal/model/booking.go`):

```go
package model

import (
    "time"
    "github.com/google/uuid"
)

// 1. Custom type definition (enum)
type EnumType string

const (
    EnumValue1 EnumType = "value1"
    EnumValue2 EnumType = "value2"
)

// 2. Main struct
type Model struct {
    // Primary key
    ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    // Required foreign key
    TenantID  uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
    // Optional foreign key (pointer)
    ParentID  *uuid.UUID `gorm:"type:uuid;index" json:"parent_id,omitempty"`
    // Fields...
    CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`

    // Relations
    Parent *Parent `gorm:"foreignKey:ParentID" json:"parent,omitempty"`
}

// 3. TableName method
func (Model) TableName() string {
    return "models"
}

// 4. Helper methods (optional)
func (m *Model) SomeHelper() bool {
    return m.ParentID == nil
}
```

#### 2.2 UUID Field Patterns

| Type | Pattern | Example |
|------|---------|---------|
| Primary Key | `uuid.UUID` | `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"` |
| Required FK | `uuid.UUID` | `gorm:"type:uuid;not null;index"` |
| Optional FK | `*uuid.UUID` | `gorm:"type:uuid;index"` with `json:"...,omitempty"` |

#### 2.3 GORM Tag Pattern

Format: `gorm:"directive1;directive2;directive3"`

Common directives:
- `type:uuid`, `type:varchar(N)`, `type:text`, `type:date`, `type:int`
- `primaryKey`, `not null`, `index`, `uniqueIndex`
- `default:gen_random_uuid()`, `default:now()`, `default:'value'`

#### 2.4 JSON Tag Pattern

- Standard fields: `json:"snake_case"`
- Optional fields: `json:"field_name,omitempty"`
- Hidden fields: `json:"-"`
- Relations always use `omitempty`

#### 2.5 Enum Pattern

```go
type EmployeeDayPlanSource string

const (
    EmployeeDayPlanSourceTariff  EmployeeDayPlanSource = "tariff"
    EmployeeDayPlanSourceManual  EmployeeDayPlanSource = "manual"
    EmployeeDayPlanSourceHoliday EmployeeDayPlanSource = "holiday"
)
```

Used in struct: `gorm:"type:varchar(20);default:'tariff'"`

---

### 3. Repository Patterns

#### 3.1 File Structure Pattern

Repositories follow this structure (see `apps/api/internal/repository/booking.go`):

```go
package repository

import (
    "context"
    "errors"
    "fmt"
    "github.com/google/uuid"
    "gorm.io/gorm"
    "terp/internal/model"
)

var (
    ErrXxxNotFound = errors.New("xxx not found")
)

type XxxRepository struct {
    db *DB
}

func NewXxxRepository(db *DB) *XxxRepository {
    return &XxxRepository{db: db}
}

// CRUD and query methods...
```

**Note**: No explicit interfaces are defined. Repositories are concrete structs.

#### 3.2 CRUD Method Patterns

**Create**:
```go
func (r *XxxRepository) Create(ctx context.Context, entity *model.Xxx) error {
    return r.db.GORM.WithContext(ctx).Create(entity).Error
}
```

**GetByID**:
```go
func (r *XxxRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Xxx, error) {
    var entity model.Xxx
    err := r.db.GORM.WithContext(ctx).First(&entity, "id = ?", id).Error
    if errors.Is(err, gorm.ErrRecordNotFound) {
        return nil, ErrXxxNotFound
    }
    if err != nil {
        return nil, fmt.Errorf("failed to get xxx: %w", err)
    }
    return &entity, nil
}
```

**Update**:
```go
func (r *XxxRepository) Update(ctx context.Context, entity *model.Xxx) error {
    return r.db.GORM.WithContext(ctx).Save(entity).Error
}
```

**Delete**:
```go
func (r *XxxRepository) Delete(ctx context.Context, id uuid.UUID) error {
    result := r.db.GORM.WithContext(ctx).Delete(&model.Xxx{}, "id = ?", id)
    if result.Error != nil {
        return fmt.Errorf("failed to delete xxx: %w", result.Error)
    }
    if result.RowsAffected == 0 {
        return ErrXxxNotFound
    }
    return nil
}
```

#### 3.3 Preload Pattern

For `GetForEmployeeDate`, the ticket specifies preloading DayPlan with Breaks and Bonuses:

```go
func (r *employeeDayPlanRepository) GetForEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.EmployeeDayPlan, error) {
    var plan model.EmployeeDayPlan
    err := r.db.GORM.WithContext(ctx).
        Preload("DayPlan").
        Preload("DayPlan.Breaks").
        Preload("DayPlan.Bonuses").
        Where("employee_id = ? AND plan_date = ?", employeeID, date).
        First(&plan).Error
    if errors.Is(err, gorm.ErrRecordNotFound) {
        return nil, nil  // Return nil, nil for not found (as per ticket spec)
    }
    return &plan, err
}
```

Existing preload examples:
- `apps/api/internal/repository/weekplan.go:67-76` - Multiple single-level preloads
- `apps/api/internal/repository/employee.go:171-178` - Preload with filtering (`Cards`, "is_active = ?", true)
- `apps/api/internal/repository/tariff.go:68-74` - Preload with ordering callback

#### 3.4 Upsert Pattern (clause.OnConflict)

The ticket specifies using `clause.OnConflict` for upserts. This pattern is not currently used in the codebase, but the ticket provides the implementation:

```go
import "gorm.io/gorm/clause"

func (r *employeeDayPlanRepository) Upsert(ctx context.Context, plan *model.EmployeeDayPlan) error {
    return r.db.GORM.WithContext(ctx).
        Clauses(clause.OnConflict{
            Columns:   []clause.Column{{Name: "employee_id"}, {Name: "plan_date"}},
            DoUpdates: clause.AssignmentColumns([]string{"day_plan_id", "source", "notes", "updated_at"}),
        }).
        Create(plan).Error
}
```

Alternative pattern in codebase (`apps/api/internal/repository/user.go:130-135`):
```go
// FirstOrCreate with Assign
return r.db.GORM.WithContext(ctx).
    Where("id = ?", user.ID).
    Assign(user).
    FirstOrCreate(user).Error
```

#### 3.5 BulkCreate Pattern (CreateInBatches)

The ticket specifies using `CreateInBatches` with batch size 100:

```go
func (r *employeeDayPlanRepository) BulkCreate(ctx context.Context, plans []model.EmployeeDayPlan) error {
    return r.db.GORM.WithContext(ctx).
        Clauses(clause.OnConflict{
            Columns:   []clause.Column{{Name: "employee_id"}, {Name: "plan_date"}},
            DoUpdates: clause.AssignmentColumns([]string{"day_plan_id", "source", "notes", "updated_at"}),
        }).
        CreateInBatches(plans, 100).Error
}
```

`CreateInBatches` is not currently used in the codebase but is a standard GORM function.

#### 3.6 Tenant Filtering Pattern

All queries include tenant filtering:
```go
query := r.db.GORM.WithContext(ctx).Where("tenant_id = ?", tenantID)
```

For EmployeeDayPlan, tenant filtering may be implicit through employee_id (employee belongs to tenant).

---

### 4. Related Models

#### 4.1 DayPlan Model (`apps/api/internal/model/dayplan.go:25-71`)

Key fields for preloading:
- `ID` - UUID primary key
- `Breaks` - `[]DayPlanBreak` via `foreignKey:DayPlanID`
- `Bonuses` - `[]DayPlanBonus` via `foreignKey:DayPlanID`

TableName: `day_plans`

#### 4.2 Employee Model (`apps/api/internal/model/employee.go:11-44`)

Key fields for relation:
- `ID` - UUID primary key
- `TenantID` - UUID for tenant association

TableName: `employees`

#### 4.3 Preload Chain

For a complete EmployeeDayPlan with all related data:
```
EmployeeDayPlan
├── Employee (via EmployeeID)
└── DayPlan (via DayPlanID)
    ├── Breaks (via DayPlanID)
    └── Bonuses (via DayPlanID)
```

---

### 5. Implementation Reference: Booking (Similar Pattern)

The recently implemented Booking model/repository (`TICKET-052/053/054`) provides a reference:

**Model** (`apps/api/internal/model/booking.go`):
- Custom enum type (`BookingSource`)
- UUID fields with proper GORM tags
- `TableName()` method
- Helper methods (`TimeString()`, `IsOffDay()` equivalent patterns)

**Repository** (`apps/api/internal/repository/booking.go`):
- CRUD operations with context
- Error handling with custom errors
- Preload patterns
- Filter struct for complex queries
- Transaction usage for related updates

---

## Code References

- Model patterns: `apps/api/internal/model/booking.go`
- Repository patterns: `apps/api/internal/repository/booking.go`
- Migration: `db/migrations/000023_create_employee_day_plans.up.sql`
- DayPlan model: `apps/api/internal/model/dayplan.go:25-71`
- Employee model: `apps/api/internal/model/employee.go:11-44`
- DB wrapper: `apps/api/internal/repository/db.go:15-19`

## Architecture Documentation

### File Naming Convention
- Models: `apps/api/internal/model/{entityname}.go` (lowercase, no separators)
- Repositories: `apps/api/internal/repository/{entityname}.go` (lowercase, no separators)

### Import Pattern
```go
import (
    "context"
    "errors"
    "fmt"
    "time"

    "github.com/google/uuid"
    "gorm.io/gorm"
    "gorm.io/gorm/clause"  // For OnConflict

    "terp/internal/model"  // For repository files
)
```

### Files to Create
Per TICKET-056:
- `apps/api/internal/model/employeedayplan.go`
- `apps/api/internal/repository/employeedayplan.go`

## Related Research

- `thoughts/shared/research/2026-01-18-TICKET-055-create-employee-day-plans-migration.md`
- `thoughts/shared/plans/2026-01-18-TICKET-054-create-booking-repository.md`
- `thoughts/shared/plans/2026-01-18-TICKET-053-create-booking-model-DONE.md`

## Open Questions

None - the ticket provides complete implementation specifications and the codebase patterns are clear.
