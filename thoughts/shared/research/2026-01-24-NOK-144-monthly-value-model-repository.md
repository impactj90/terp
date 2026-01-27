# Research: NOK-144 Monthly Value Model + Repository

## Existing Model Patterns

### Base Model (`apps/api/internal/model/base.go`)

```go
type BaseModel struct {
    ID        uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
    CreatedAt time.Time `gorm:"not null;default:now()"`
    UpdatedAt time.Time `gorm:"not null;default:now()"`
}
```

Note: Most models do NOT embed BaseModel. They define ID/CreatedAt/UpdatedAt inline with json tags.

### Standard Model Pattern (from `dailyvalue.go`, `vacationbalance.go`, `absenceday.go`)

All models follow this pattern:
- Package: `model`
- Primary key: `uuid.UUID` with `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
- TenantID: `uuid.UUID` with `gorm:"type:uuid;not null;index" json:"tenant_id"`
- EmployeeID: `uuid.UUID` with `gorm:"type:uuid;not null;index" json:"employee_id"`
- Timestamps: `CreatedAt time.Time` with `gorm:"default:now()" json:"created_at"` and `UpdatedAt time.Time` with `gorm:"default:now()" json:"updated_at"`
- `TableName()` method returning the table name string
- Optional helper methods on the struct pointer receiver

### DailyValue Model (closest analog)

File: `apps/api/internal/model/dailyvalue.go`

- Integer fields with `gorm:"default:0" json:"field_name"` tags
- Boolean fields with `gorm:"default:false" json:"field_name"`
- Nullable time pointers: `*time.Time` with `gorm:"type:timestamptz" json:"field_name,omitempty"`
- Employee relation: `Employee *Employee \`gorm:"foreignKey:EmployeeID" json:"employee,omitempty"\``
- Helper methods: `Balance()`, `FormatGrossTime()`, `HasBookings()`

### VacationBalance Model (has decimal + year fields)

File: `apps/api/internal/model/vacationbalance.go`

- Year field: `Year int \`gorm:"type:int;not null" json:"year"\``
- Decimal fields: `decimal.Decimal \`gorm:"type:decimal(5,2);not null;default:0" json:"field"\``
- Import: `github.com/shopspring/decimal`
- Helper methods: `Total()`, `Available()` returning `decimal.Decimal`

### AbsenceDay Model (has nullable UUID pointers)

File: `apps/api/internal/model/absenceday.go`

- Nullable UUID pointers: `ApprovedBy *uuid.UUID \`gorm:"type:uuid" json:"approved_by,omitempty"\``
- Nullable time pointers: `ApprovedAt *time.Time \`gorm:"type:timestamptz" json:"approved_at,omitempty"\``

---

## Existing Repository Patterns

### Structure Pattern (from `dailyvalue.go`, `vacationbalance.go`, `absenceday.go`)

All repositories follow this pattern:
- Package: `repository`
- Import: `github.com/tolga/terp/internal/model`
- Sentinel error variable: `var ErrXxxNotFound = errors.New("xxx not found")`
- Struct with db field: `type XxxRepository struct { db *DB }`
- Constructor: `func NewXxxRepository(db *DB) *XxxRepository { return &XxxRepository{db: db} }`
- All methods take `ctx context.Context` as first parameter
- Use `r.db.GORM.WithContext(ctx)` for all queries

### CRUD Methods

**Create:**
```go
func (r *XxxRepository) Create(ctx context.Context, entity *model.Xxx) error {
    return r.db.GORM.WithContext(ctx).Create(entity).Error
}
```

**GetByID:**
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

**Update:**
```go
func (r *XxxRepository) Update(ctx context.Context, entity *model.Xxx) error {
    return r.db.GORM.WithContext(ctx).Save(entity).Error
}
```

**Delete:**
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

### Upsert Pattern (from `dailyvalue.go` and `vacationbalance.go`)

Uses `gorm.io/gorm/clause` with `clause.OnConflict`:

```go
func (r *XxxRepository) Upsert(ctx context.Context, entity *model.Xxx) error {
    return r.db.GORM.WithContext(ctx).
        Clauses(clause.OnConflict{
            Columns:   []clause.Column{{Name: "col1"}, {Name: "col2"}},
            DoUpdates: clause.AssignmentColumns([]string{"field1", "field2", "updated_at"}),
        }).
        Create(entity).Error
}
```

### Lookup Methods Pattern

**GetByEmployeeYear (VacationBalance - returns nil, nil for not found):**
```go
func (r *VacationBalanceRepository) GetByEmployeeYear(ctx context.Context, employeeID uuid.UUID, year int) (*model.VacationBalance, error) {
    var balance model.VacationBalance
    err := r.db.GORM.WithContext(ctx).
        Where("employee_id = ? AND year = ?", employeeID, year).
        First(&balance).Error
    if errors.Is(err, gorm.ErrRecordNotFound) {
        return nil, nil
    }
    if err != nil {
        return nil, fmt.Errorf("failed to get xxx: %w", err)
    }
    return &balance, nil
}
```

**List methods (returns empty slice for no results):**
```go
func (r *VacationBalanceRepository) ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.VacationBalance, error) {
    var results []model.VacationBalance
    err := r.db.GORM.WithContext(ctx).
        Where("employee_id = ?", employeeID).
        Order("year ASC").
        Find(&results).Error
    if err != nil {
        return nil, fmt.Errorf("failed to list xxx: %w", err)
    }
    return results, nil
}
```

### Targeted Update Pattern (from VacationBalance)

```go
func (r *VacationBalanceRepository) UpdateTaken(ctx context.Context, employeeID uuid.UUID, year int, taken decimal.Decimal) error {
    result := r.db.GORM.WithContext(ctx).
        Model(&model.VacationBalance{}).
        Where("employee_id = ? AND year = ?", employeeID, year).
        Update("taken", taken)
    if result.Error != nil {
        return fmt.Errorf("failed to update taken: %w", result.Error)
    }
    if result.RowsAffected == 0 {
        return ErrVacationBalanceNotFound
    }
    return nil
}
```

---

## Existing Test Patterns

### Test Setup

File: `apps/api/internal/testutil/db.go`

- Uses `testutil.SetupTestDB(t)` which returns `*repository.DB`
- Uses shared DB connection (singleton via `sync.Once`)
- Each test runs in its own transaction that gets rolled back in `t.Cleanup`
- Test DB URL from `TEST_DATABASE_URL` env var, defaults to `postgres://dev:dev@localhost:5432/terp?sslmode=disable`

### Helper Functions

Each test file defines its own test helper functions with a suffix:
- `createTestTenantForDV(t, db)` / `createTestTenantForVB(t, db)`
- `createTestEmployeeForDV(t, db, tenantID)` / `createTestEmployeeForVB(t, db, tenantID)`

These follow a consistent pattern:
```go
func createTestTenantForXX(t *testing.T, db *repository.DB) *model.Tenant {
    t.Helper()
    tenantRepo := repository.NewTenantRepository(db)
    tenant := &model.Tenant{
        Name: "Test Tenant " + uuid.New().String()[:8],
        Slug: "test-" + uuid.New().String()[:8],
    }
    require.NoError(t, tenantRepo.Create(context.Background(), tenant))
    return tenant
}

func createTestEmployeeForXX(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.Employee {
    t.Helper()
    repo := repository.NewEmployeeRepository(db)
    emp := &model.Employee{
        TenantID:        tenantID,
        PersonnelNumber: "E" + uuid.New().String()[:8],
        PIN:             uuid.New().String()[:4],
        FirstName:       "Test",
        LastName:        "Employee",
        EntryDate:       time.Now(),
        WeeklyHours:     decimal.NewFromFloat(40.0),
        IsActive:        true,
    }
    require.NoError(t, repo.Create(context.Background(), emp))
    return emp
}
```

### Test Function Naming

Each test is a standalone function (no test suites) with pattern:
- `TestXxxRepository_MethodName(t *testing.T)` for success cases
- `TestXxxRepository_MethodName_NotFound(t *testing.T)` for not-found cases
- `TestXxxRepository_MethodName_Empty(t *testing.T)` for empty result cases
- `TestXxx_HelperMethod(t *testing.T)` for model helper methods

### Test Imports

```go
import (
    "context"
    "testing"
    "time"

    "github.com/google/uuid"
    "github.com/shopspring/decimal"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"

    "github.com/tolga/terp/internal/model"
    "github.com/tolga/terp/internal/repository"
    "github.com/tolga/terp/internal/testutil"
)
```

### Test Structure

Each test follows:
1. `db := testutil.SetupTestDB(t)`
2. `repo := repository.NewXxxRepository(db)`
3. `ctx := context.Background()`
4. Create dependencies (tenant, employee)
5. Create test entity
6. Perform operation
7. Assert with `require.NoError` for critical checks, `assert.Equal` / `assert.True` for assertions
8. For decimal comparisons: `assert.True(t, found.Field.Equal(decimal.NewFromInt(30)))`

---

## Migration Schema: monthly_values

File: `db/migrations/000028_create_monthly_values.up.sql`

```sql
CREATE TABLE monthly_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

    -- Period identification
    year INT NOT NULL,
    month INT NOT NULL,

    -- Aggregated time totals (all in minutes)
    total_gross_time INT DEFAULT 0,
    total_net_time INT DEFAULT 0,
    total_target_time INT DEFAULT 0,
    total_overtime INT DEFAULT 0,
    total_undertime INT DEFAULT 0,
    total_break_time INT DEFAULT 0,

    -- Flextime balance (all in minutes)
    flextime_start INT DEFAULT 0,
    flextime_change INT DEFAULT 0,
    flextime_end INT DEFAULT 0,
    flextime_carryover INT DEFAULT 0,

    -- Absence summary
    vacation_taken DECIMAL(5,2) DEFAULT 0,
    sick_days INT DEFAULT 0,
    other_absence_days INT DEFAULT 0,

    -- Work summary
    work_days INT DEFAULT 0,
    days_with_errors INT DEFAULT 0,

    -- Month closing
    is_closed BOOLEAN DEFAULT false,
    closed_at TIMESTAMPTZ,
    closed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reopened_at TIMESTAMPTZ,
    reopened_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One record per employee per month
    UNIQUE(employee_id, year, month)
);
```

**Indexes:**
- `idx_monthly_values_tenant` on `(tenant_id)`
- `idx_monthly_values_employee` on `(employee_id)`
- `idx_monthly_values_lookup` on `(employee_id, year, month)`
- `idx_monthly_values_period` on `(year, month)`

**Unique constraint:** `UNIQUE(employee_id, year, month)` -- one record per employee per month.

**Update trigger:** `update_monthly_values_updated_at` uses `update_updated_at_column()`.

---

## Related Code Already in the Codebase

### 1. Monthly Aggregation Logic (`apps/api/internal/calculation/monthly.go`)

Contains the pure calculation logic:
- `MonthlyCalcInput` / `MonthlyCalcOutput` types
- `CalculateMonth(input MonthlyCalcInput) MonthlyCalcOutput` function
- Credit type rules (NoEvaluation, CompleteCarryover, AfterThreshold, NoCarryover)
- `CalculateAnnualCarryover(currentBalance, annualFloor *int) int`

The `MonthlyCalcOutput` fields map directly to the `monthly_values` DB columns:
- TotalGrossTime, TotalNetTime, TotalTargetTime, TotalOvertime, TotalUndertime, TotalBreakTime
- FlextimeStart, FlextimeChange, FlextimeEnd
- WorkDays, DaysWithErrors
- VacationTaken, SickDays, OtherAbsenceDays

### 2. Booking Service Interface (`apps/api/internal/service/booking.go`)

Defines `monthlyValueLookupForBooking` interface (line 43):
```go
type monthlyValueLookupForBooking interface {
    IsMonthClosed(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (bool, error)
}
```

The `BookingService` holds this as an optional dependency (may be nil until TICKET-086 is implemented).
The `checkMonthNotClosed` method skips the check if `s.monthlyValueRepo == nil`.

### 3. Generated API Model (`apps/api/gen/models/monthly_value.go`)

Auto-generated swagger model with fields like GrossMinutes, NetMinutes, OvertimeMinutes, etc.
Contains Status enum: `open`, `calculated`, `closed`, `exported`.
This is the API response model, NOT the GORM domain model.

### 4. DailyValue Repository SumForMonth (`apps/api/internal/repository/dailyvalue.go`)

The `SumForMonth` method aggregates daily values for a month:
```go
func (r *DailyValueRepository) SumForMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*DailyValueSum, error)
```

This produces the raw aggregate data that would be stored in the monthly_values table.

---

## Key Implementation Notes

1. **Unique constraint on (employee_id, year, month)** -- Upsert should use these columns for ON CONFLICT.
2. **Month field is `INT` (1-12)** not `time.Time` -- same pattern as VacationBalance.Year.
3. **FlextimeCarryover** in DB is separate from FlextimeEnd -- it's the amount after caps are applied for transfer to next month.
4. **ClosedBy/ReopenedBy** reference `users(id)` with ON DELETE SET NULL -- these are nullable UUID pointers.
5. **ClosedAt/ReopenedAt** are nullable `TIMESTAMPTZ` -- these are `*time.Time` pointers.
6. **VacationTaken** is `DECIMAL(5,2)` -- matches the `decimal.Decimal` pattern used in VacationBalance.
7. **The BookingService** expects an interface with `IsMonthClosed(ctx, tenantID, employeeID, date)` -- the MonthlyValue repository (or a wrapper) should satisfy this.
8. **No interface definitions** are used in existing repositories -- they are concrete struct types. Interfaces are defined in the consumer (service layer).
