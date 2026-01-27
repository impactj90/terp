# Research: NOK-138 - Vacation Balance Model + Repository

## Date: 2026-01-24

## Ticket Summary

Create the VacationBalance model and repository for tracking employee vacation entitlements, carryover, adjustments, and usage per year.

---

## 1. Existing Model Patterns

### Base Structure

All models in `apps/api/internal/model/` follow these conventions:

- **Package**: `model`
- **UUID primary key**: `uuid.UUID` with GORM tags `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
- **TenantID**: `uuid.UUID` with `gorm:"type:uuid;not null;index"`
- **Timestamps**: `CreatedAt` and `UpdatedAt` as `time.Time` with `gorm:"default:now()"`
- **JSON tags**: All fields have `json:"snake_case"` tags
- **TableName() method**: Required, returns the SQL table name
- **Relations**: Pointer to related model with `gorm:"foreignKey:..."` tag

### Relevant Examples

**AbsenceDay** (`apps/api/internal/model/absenceday.go`):
- Uses `decimal.Decimal` for `Duration` field: `gorm:"type:decimal(3,2);not null;default:1.00"`
- Has helper methods like `IsFullDay()`, `IsHalfDay()`, `CalculateCredit()`
- Uses pointer types for optional fields: `*string`, `*uuid.UUID`, `*time.Time`

**DailyValue** (`apps/api/internal/model/dailyvalue.go`):
- Has `EmployeeID` + `ValueDate` as natural key
- Helper methods: `Balance()`, `FormatGrossTime()`, `HasBookings()`
- Relations: `Employee *Employee` with `gorm:"foreignKey:EmployeeID"`

**Employee** (`apps/api/internal/model/employee.go`):
- Has `VacationDaysPerYear decimal.Decimal` with `gorm:"type:decimal(5,2);default:30.00"`
- Uses `gorm.DeletedAt` for soft deletes (but this is unique to employees)

### Key Dependencies for VacationBalance Model

- `github.com/google/uuid` - UUID type
- `github.com/shopspring/decimal` - Decimal type for vacation day values
- No BaseModel embedding used in newer models - they inline ID/CreatedAt/UpdatedAt directly

---

## 2. Existing Repository Patterns

### Structure

All repositories in `apps/api/internal/repository/` follow these conventions:

- **Package**: `repository`
- **Struct**: Private struct with `db *DB` field
- **Constructor**: `NewXxxRepository(db *DB) *XxxRepository`
- **Error vars**: Package-level sentinel errors: `var ErrXxxNotFound = errors.New("xxx not found")`
- **Context**: All methods take `context.Context` as first parameter
- **No interfaces defined in the repository package** - they are concrete struct implementations
- **Error wrapping**: Uses `fmt.Errorf("failed to ...: %w", err)` pattern
- **Not found handling**: `errors.Is(err, gorm.ErrRecordNotFound)` returns sentinel error

### GORM Patterns

- **Create**: `r.db.GORM.WithContext(ctx).Create(model).Error`
- **GetByID**: `r.db.GORM.WithContext(ctx).First(&model, "id = ?", id).Error`
- **Update**: `r.db.GORM.WithContext(ctx).Save(model).Error`
- **Delete**: Check `RowsAffected == 0` to detect not found
- **Preload**: `r.db.GORM.WithContext(ctx).Preload("Relation").First(...)`
- **Upsert**: Uses `clause.OnConflict` with `DoUpdates: clause.AssignmentColumns(...)` (see DailyValueRepository)

### Upsert Pattern (from DailyValueRepository)

```go
func (r *DailyValueRepository) Upsert(ctx context.Context, dv *model.DailyValue) error {
    return r.db.GORM.WithContext(ctx).
        Clauses(clause.OnConflict{
            Columns: []clause.Column{{Name: "employee_id"}, {Name: "value_date"}},
            DoUpdates: clause.AssignmentColumns([]string{
                "gross_time", "net_time", "target_time", ...
            }),
        }).
        Create(dv).Error
}
```

### Raw SQL Pattern (from DailyValueRepository.SumForMonth)

```go
err := r.db.GORM.WithContext(ctx).
    Model(&model.DailyValue{}).
    Select("COALESCE(SUM(x), 0) as total_x, ...").
    Where("employee_id = ? AND ...", employeeID, ...).
    Scan(&resultStruct).Error
```

### List Pattern

```go
var items []model.X
err := r.db.GORM.WithContext(ctx).
    Where("employee_id = ?", employeeID).
    Order("field ASC").
    Find(&items).Error
```

---

## 3. Repository Test Patterns

### Setup

- **Package**: `repository_test` (external test package)
- **DB Setup**: `testutil.SetupTestDB(t)` - returns `*repository.DB` backed by a transaction that rolls back on cleanup
- **Test DB URL**: Defaults to `postgres://dev:dev@localhost:5432/terp?sslmode=disable`
- **Test helpers**: Each test file defines its own local helpers prefixed with the feature name (e.g., `createTestTenantForAbsenceDay`, `createTestEmployeeForDV`)

### Helper Pattern

```go
func createTestTenantForXxx(t *testing.T, db *repository.DB) *model.Tenant {
    t.Helper()
    tenantRepo := repository.NewTenantRepository(db)
    tenant := &model.Tenant{
        Name: "Test Tenant " + uuid.New().String()[:8],
        Slug: "test-" + uuid.New().String()[:8],
    }
    require.NoError(t, tenantRepo.Create(context.Background(), tenant))
    return tenant
}

func createTestEmployeeForXxx(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.Employee {
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

### Test Naming Convention

- `TestXxxRepository_MethodName`
- `TestXxxRepository_MethodName_SpecialCase` (e.g., `_NotFound`, `_Empty`, `_UniqueConstraint`)

### Assertion Libraries

- `github.com/stretchr/testify/assert` - for non-fatal assertions
- `github.com/stretchr/testify/require` - for fatal assertions (prerequisites)

### Test Categories

1. **CRUD operations**: Create, GetByID, Update, Delete
2. **Not found handling**: Returns sentinel error or nil based on semantic
3. **Special queries**: GetByEmployeeDate, GetByEmployeeDateRange, etc.
4. **Unique constraints**: Verify DB prevents duplicates
5. **Edge cases**: Empty inputs, missing records
6. **Model unit tests**: Pure logic tests at the bottom of the file (no DB)

---

## 4. Migration Patterns

### Current State

- **No `vacation_balances` migration exists** - needs to be created as migration `000027`
- Latest migration: `000026_create_absence_days`

### Migration File Conventions

- **Naming**: `NNNNNN_description.up.sql` and `NNNNNN_description.down.sql`
- **UUID PK**: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- **Foreign keys**: `REFERENCES table(id) ON DELETE CASCADE`
- **Timestamps**: `TIMESTAMPTZ DEFAULT NOW()`
- **Trigger**: `update_updated_at_column()` trigger on all tables
- **Indexes**: Named `idx_tablename_field` or `idx_tablename_purpose`
- **Comments**: `COMMENT ON TABLE/COLUMN` for documentation
- **Decimal columns**: `DECIMAL(precision, scale)` (e.g., `DECIMAL(3,2)`, `DECIMAL(5,2)`)

### Down Migration Pattern

```sql
DROP TRIGGER IF EXISTS update_xxx_updated_at ON xxx;
DROP TABLE IF EXISTS xxx;
```

---

## 5. Dependencies

All from `apps/api/go.mod`:

| Package | Version | Usage |
|---------|---------|-------|
| `github.com/google/uuid` | v1.6.0 | UUID type |
| `github.com/shopspring/decimal` | v1.4.0 | Decimal arithmetic for vacation days |
| `gorm.io/gorm` | v1.31.1 | ORM |
| `gorm.io/gorm/clause` | (part of gorm) | For OnConflict upsert |
| `github.com/stretchr/testify` | v1.11.1 | Test assertions |

---

## 6. ZMI Reference Material

From `thoughts/shared/reference/zmi-calculataion-manual-reference.md`:

### Vacation Entitlement (Section 14.1)

> "In the field 'Jahresurlaub' (Annual vacation), enter the annual vacation entitlement (e.g., 30 days)."
> "Note: The vacation entitlement for the entire year must always be entered in the 'Jahresurlaub' field. At year change, ZMI Time takes this value and adds it for the new year."

Key takeaways:
- Entitlement is per-year (annually set)
- At year change, the system automatically creates the new year's entitlement

### Vacation Valuation (Section 8.2)

> "In 'Urlaubsbewertung' (Vacation valuation), you enter the value that the program should deduct from the remaining vacation account for a stored vacation day. Normally this is 1, so that one day is deducted."

Key takeaway: Vacation `Taken` tracks in days (typically 1.0 per vacation day taken)

### Carryover (Section 20)

> "Year-end capping: If the remaining vacation of employees should be forfeited at year-end..."
> "Mid-year capping: A capping of remaining vacation from the previous year was created for March 31."

Key takeaways:
- Carryover is the remaining vacation balance from the previous year
- Can be capped at year-end or mid-year (e.g., March 31 deadline)

### Offset Values (Section 22.1)

> "Typical offset values are: Flextime account, Remaining vacation"

Key takeaway: There needs to be a way to set initial vacation balance (the `Adjustments` field handles this)

### Vacation Calculation (TICKET-082)

The ticket defines:
- `CalculateVacation()` computes `TotalEntitlement` (including pro-rating, part-time, and special bonuses)
- `CalculateCarryover()` computes carryover from previous year

These values feed directly into VacationBalance fields:
- `Entitlement` = output of `CalculateVacation().TotalEntitlement`
- `Carryover` = output of `CalculateCarryover()`

---

## 7. Implementation Recommendations

### Model Design

```go
type VacationBalance struct {
    ID          uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    uuid.UUID       `gorm:"type:uuid;not null;index" json:"tenant_id"`
    EmployeeID  uuid.UUID       `gorm:"type:uuid;not null;index" json:"employee_id"`
    Year        int             `gorm:"type:int;not null" json:"year"`

    // Vacation day values (decimal for half-day support)
    Entitlement decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0" json:"entitlement"`
    Carryover   decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0" json:"carryover"`
    Adjustments decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0" json:"adjustments"`
    Taken       decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0" json:"taken"`

    // Timestamps
    CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`

    // Relations
    Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
}
```

### Helper Methods

- `Total() decimal.Decimal` - returns `Entitlement + Carryover + Adjustments`
- `Available() decimal.Decimal` - returns `Total() - Taken`
- `TableName() string` - returns `"vacation_balances"`

### Repository Methods

Following existing patterns, all methods should:
- Take `context.Context` as first param
- Use `r.db.GORM.WithContext(ctx)` for all queries
- Return sentinel error `ErrVacationBalanceNotFound` for GetByID
- Return `nil, nil` for `GetByEmployeeYear` when no record exists (consistent with `GetByEmployeeDate` patterns)

Special methods:
- **Upsert**: Use `clause.OnConflict` on `(employee_id, year)` unique constraint
- **UpdateTaken**: Use `r.db.GORM.WithContext(ctx).Model(...).Where(...).Update("taken", taken)` pattern
- **IncrementTaken**: Use `gorm.Expr("taken + ?", amount)` for atomic increment

### Migration

- File: `db/migrations/000027_create_vacation_balances.up.sql`
- Unique constraint: `UNIQUE(employee_id, year)` (one balance per employee per year)
- Indexes: tenant_id, employee_id, (employee_id, year) composite

### Test Plan

Following existing patterns, tests should cover:
1. Create basic vacation balance
2. GetByID (found and not found)
3. GetByEmployeeYear (found and not found)
4. Update entitlement values
5. Upsert (insert and update cases)
6. UpdateTaken (direct set)
7. IncrementTaken (atomic increment)
8. ListByEmployee (ordering, multiple years)
9. Unique constraint enforcement
10. Model unit tests for Total() and Available()

---

## 8. Key Files Referenced

- `/home/tolga/projects/terp/apps/api/internal/model/base.go` - BaseModel pattern
- `/home/tolga/projects/terp/apps/api/internal/model/absenceday.go` - Decimal field pattern
- `/home/tolga/projects/terp/apps/api/internal/model/dailyvalue.go` - Employee+date natural key, helper methods
- `/home/tolga/projects/terp/apps/api/internal/model/employee.go` - VacationDaysPerYear field
- `/home/tolga/projects/terp/apps/api/internal/repository/db.go` - DB struct and transaction support
- `/home/tolga/projects/terp/apps/api/internal/repository/dailyvalue.go` - Upsert pattern with clause.OnConflict
- `/home/tolga/projects/terp/apps/api/internal/repository/absenceday.go` - Decimal queries, CountByType pattern
- `/home/tolga/projects/terp/apps/api/internal/repository/absenceday_test.go` - Full test example
- `/home/tolga/projects/terp/apps/api/internal/repository/dailyvalue_test.go` - Upsert test patterns
- `/home/tolga/projects/terp/apps/api/internal/testutil/db.go` - SetupTestDB with transaction rollback
- `/home/tolga/projects/terp/db/migrations/000026_create_absence_days.up.sql` - Latest migration with decimal
- `/home/tolga/projects/terp/thoughts/shared/plans/tickets/TICKET-082-create-vacation-calculation-logic.md` - Vacation calc logic that feeds into balance
- `/home/tolga/projects/terp/thoughts/shared/reference/zmi-calculataion-manual-reference.md` - ZMI manual sections 8.2, 14.1, 19, 20, 22.1
