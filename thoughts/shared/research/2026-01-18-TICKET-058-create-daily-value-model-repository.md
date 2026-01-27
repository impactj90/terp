---
date: 2026-01-18T14:22:35+01:00
researcher: Claude
git_commit: 1abaa91b67956ddb86777e2693b5eab8cad0d6e1
branch: master
repository: terp
topic: "TICKET-058: Create DailyValue Model + Repository"
tags: [research, codebase, dailyvalue, model, repository, gorm]
status: complete
last_updated: 2026-01-18
last_updated_by: Claude
---

# Research: TICKET-058 - Create DailyValue Model + Repository

**Date**: 2026-01-18T14:22:35+01:00
**Researcher**: Claude
**Git Commit**: 1abaa91b67956ddb86777e2693b5eab8cad0d6e1
**Branch**: master
**Repository**: terp

## Research Question

What patterns and conventions exist in the codebase for implementing the DailyValue model and repository as specified in TICKET-058?

## Summary

The codebase has well-established patterns for models and repositories. The ticket specifies creating:
- `apps/api/internal/model/dailyvalue.go` - DailyValue model
- `apps/api/internal/repository/dailyvalue.go` - DailyValue repository with CRUD, Upsert, query methods, and monthly aggregation
- `apps/api/internal/repository/dailyvalue_test.go` - Unit tests

Key implementation details:
- The `daily_values` migration (000024) already exists with the table structure
- The model uses `pq.StringArray` for `error_codes` and `warnings` columns (TEXT[] type)
- Helper functions like `MinutesToString` exist in `booking.go` and can be reused
- Repository should follow patterns from `BookingRepository` and `EmployeeDayPlanRepository`

## Detailed Findings

### Migration Structure (Dependency: TICKET-057)

**File**: `db/migrations/000024_create_daily_values.up.sql`

The `daily_values` table is already created with:

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() |
| tenant_id | UUID | NOT NULL, FK → tenants(id) ON DELETE CASCADE |
| employee_id | UUID | NOT NULL, FK → employees(id) ON DELETE CASCADE |
| value_date | DATE | NOT NULL |
| gross_time, net_time, target_time, overtime, undertime, break_time | INT | DEFAULT 0 |
| has_error | BOOLEAN | DEFAULT false |
| error_codes, warnings | TEXT[] | - |
| first_come, last_go | INT | nullable |
| booking_count | INT | DEFAULT 0 |
| calculated_at | TIMESTAMPTZ | nullable |
| calculation_version | INT | DEFAULT 1 |
| created_at, updated_at | TIMESTAMPTZ | DEFAULT NOW() |

**Key Constraints**:
- `UNIQUE(employee_id, value_date)` - One record per employee per date
- Indexes on tenant_id, employee_id, value_date
- Composite index on (employee_id, value_date) for lookups
- Partial index on (employee_id, has_error) WHERE has_error = true

### Model Patterns

**Reference Files**:
- `apps/api/internal/model/booking.go`
- `apps/api/internal/model/employeedayplan.go`

**Standard Struct Definition**:

```go
type DailyValue struct {
    ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID   uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
    EmployeeID uuid.UUID `gorm:"type:uuid;not null;index" json:"employee_id"`
    ValueDate  time.Time `gorm:"type:date;not null" json:"value_date"`
    // ...
}
```

**Key Patterns**:
1. UUID primary keys with `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
2. Tenant ID required with index: `gorm:"type:uuid;not null;index"`
3. Date fields: `gorm:"type:date;not null"`
4. Timestamps: `gorm:"default:now()"`
5. Optional fields use pointers: `*int`, `*time.Time`
6. JSON tags with `omitempty` for nullable fields
7. TableName() method returning snake_case plural

**pq.StringArray for TEXT[] columns**:
The ticket requires `pq.StringArray` for `error_codes` and `warnings`. This is a new pattern not currently used elsewhere in models.

```go
import "github.com/lib/pq"

ErrorCodes pq.StringArray `gorm:"type:text[]" json:"error_codes,omitempty"`
Warnings   pq.StringArray `gorm:"type:text[]" json:"warnings,omitempty"`
```

**Time Helper Functions** (in `booking.go:92-118`):

```go
// MinutesToString formats minutes as HH:MM
func MinutesToString(minutes int) string {
    h := minutes / 60
    m := minutes % 60
    return fmt.Sprintf("%02d:%02d", h, m)
}
```

The DailyValue model can use this existing function for `FormatGrossTime()` and `FormatNetTime()` helper methods.

**Employee Relation Pattern** (from `booking.go:49`):
```go
Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
```

### Repository Patterns

**Reference Files**:
- `apps/api/internal/repository/booking.go`
- `apps/api/internal/repository/employeedayplan.go`

**Structure**:
```go
type DailyValueRepository struct {
    db *DB
}

func NewDailyValueRepository(db *DB) *DailyValueRepository {
    return &DailyValueRepository{db: db}
}
```

**Error Definition**:
```go
var (
    ErrDailyValueNotFound = errors.New("daily value not found")
)
```

**CRUD Methods**:

1. **Create** (`booking.go:42-45`):
```go
func (r *BookingRepository) Create(ctx context.Context, booking *model.Booking) error {
    return r.db.GORM.WithContext(ctx).Create(booking).Error
}
```

2. **GetByID** (`booking.go:48-59`):
```go
func (r *BookingRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Booking, error) {
    var booking model.Booking
    err := r.db.GORM.WithContext(ctx).First(&booking, "id = ?", id).Error
    if errors.Is(err, gorm.ErrRecordNotFound) {
        return nil, ErrBookingNotFound
    }
    if err != nil {
        return nil, fmt.Errorf("failed to get booking: %w", err)
    }
    return &booking, nil
}
```

3. **Update** (`booking.go:82-84`):
```go
func (r *BookingRepository) Update(ctx context.Context, booking *model.Booking) error {
    return r.db.GORM.WithContext(ctx).Save(booking).Error
}
```

**Upsert Pattern** (`employeedayplan.go:104-112`):
```go
func (r *EmployeeDayPlanRepository) Upsert(ctx context.Context, plan *model.EmployeeDayPlan) error {
    return r.db.GORM.WithContext(ctx).
        Clauses(clause.OnConflict{
            Columns:   []clause.Column{{Name: "employee_id"}, {Name: "plan_date"}},
            DoUpdates: clause.AssignmentColumns([]string{"day_plan_id", "source", "notes", "updated_at"}),
        }).
        Create(plan).Error
}
```

For DailyValue, the upsert should use:
- Conflict columns: `employee_id`, `value_date`
- Update columns: all time values, error fields, booking summary, calculation tracking, `updated_at`

**GetByEmployeeDate Pattern** (similar to `employeedayplan.go:67-85`):
```go
func (r *EmployeeDayPlanRepository) GetForEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.EmployeeDayPlan, error) {
    var plan model.EmployeeDayPlan
    err := r.db.GORM.WithContext(ctx).
        Where("employee_id = ? AND plan_date = ?", employeeID, date).
        First(&plan).Error

    if errors.Is(err, gorm.ErrRecordNotFound) {
        return nil, nil  // Returns nil, nil (not an error)
    }
    // ...
}
```

**GetByEmployeeDateRange Pattern** (`employeedayplan.go:87-102`):
```go
func (r *EmployeeDayPlanRepository) GetForEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.EmployeeDayPlan, error) {
    var plans []model.EmployeeDayPlan
    err := r.db.GORM.WithContext(ctx).
        Where("employee_id = ? AND plan_date >= ? AND plan_date <= ?", employeeID, from, to).
        Order("plan_date ASC").
        Find(&plans).Error
    // ...
}
```

**GetWithErrors Pattern** - Filter by has_error with Preload:
```go
func (r *DailyValueRepository) GetWithErrors(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]model.DailyValue, error) {
    var values []model.DailyValue
    err := r.db.GORM.WithContext(ctx).
        Preload("Employee").
        Where("tenant_id = ? AND has_error = true AND value_date >= ? AND value_date <= ?", tenantID, from, to).
        Order("value_date DESC").
        Find(&values).Error
    // ...
}
```

**Aggregation Pattern** (new for SumForMonth):
```go
func (r *DailyValueRepository) SumForMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*DailyValueSum, error) {
    var sum DailyValueSum
    err := r.db.GORM.WithContext(ctx).
        Model(&model.DailyValue{}).
        Select(`
            SUM(gross_time) as total_gross_time,
            SUM(net_time) as total_net_time,
            ...
            COUNT(*) as total_days
        `).
        Where("employee_id = ? AND EXTRACT(YEAR FROM value_date) = ? AND EXTRACT(MONTH FROM value_date) = ?",
            employeeID, year, month).
        Scan(&sum).Error
    return &sum, err
}
```

### Test Patterns

**Reference Files**:
- `apps/api/internal/repository/booking_test.go`
- `apps/api/internal/repository/employeedayplan_test.go`

**Test Setup**:
```go
func TestDailyValueRepository_Create(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewDailyValueRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    employeeID := uuid.New()
    // ...
}
```

**Key Test Patterns**:
1. Use `testutil.SetupTestDB(t)` for transaction-isolated database
2. Use `context.Background()` for context
3. Use `require.NoError()` for critical checks
4. Use `assert.Equal()` for validations
5. Test not found cases with `uuid.New()`
6. Test date ranges with `time.Date()` and `AddDate()`
7. Test empty results with `assert.Empty()` or `assert.Nil()`

**Testing pq.StringArray**:
```go
value := &model.DailyValue{
    HasError:   true,
    ErrorCodes: pq.StringArray{"ERR_001", "ERR_002"},
}
// ...
assert.Len(t, found.ErrorCodes, 2)
```

## Code References

- Model patterns: `apps/api/internal/model/booking.go:23-56`
- Model patterns: `apps/api/internal/model/employeedayplan.go:18-38`
- Repository patterns: `apps/api/internal/repository/booking.go:33-271`
- Repository patterns: `apps/api/internal/repository/employeedayplan.go:21-137`
- Time utilities: `apps/api/internal/model/booking.go:92-118`
- Employee model: `apps/api/internal/model/employee.go:11-44`
- Migration: `db/migrations/000024_create_daily_values.up.sql`
- Test patterns: `apps/api/internal/repository/booking_test.go`
- Test patterns: `apps/api/internal/repository/employeedayplan_test.go`

## Architecture Documentation

### Existing Conventions

1. **Model layer** (`internal/model/`):
   - Pure domain structs with GORM tags
   - TableName() method for explicit table naming
   - Helper methods for computed values (Balance(), HasBookings())
   - Package-level utility functions for time conversion

2. **Repository layer** (`internal/repository/`):
   - Concrete struct (not interface) with `db *DB` field
   - Constructor: `NewXxxRepository(db *DB) *XxxRepository`
   - Package-level error variables: `ErrXxxNotFound`
   - Context as first parameter on all methods
   - Wrap errors with `fmt.Errorf("failed to xxx: %w", err)`

3. **Testing** (`internal/repository/xxx_test.go`):
   - Package name: `repository_test` (black-box testing)
   - Transaction-based isolation via `testutil.SetupTestDB(t)`
   - Helper functions with `t.Helper()` for creating test data

### Dependencies

- `github.com/google/uuid` - UUID types
- `github.com/lib/pq` - PostgreSQL array types (pq.StringArray)
- `gorm.io/gorm` - ORM
- `gorm.io/gorm/clause` - GORM clauses for Upsert

## Related Research

- `thoughts/shared/research/2026-01-18-TICKET-055-create-employee-day-plans-migration.md`
- `thoughts/shared/research/2026-01-18-TICKET-056-create-employee-day-plan-model-repository.md`
- `thoughts/shared/research/2026-01-18-TICKET-057-create-daily-values-migration.md`

## Open Questions

None - the ticket specification is complete and all required patterns exist in the codebase.
