# Research: ZMI-TICKET-013 - Absence Calculation Rules (Berechnung)

**Date**: 2026-01-29
**Ticket**: ZMI-TICKET-013
**Dependencies**: ZMI-TICKET-009 (Accounts), ZMI-TICKET-007 (Absence Types), ZMI-TICKET-006 (Day Plans)

---

## 1. Ticket Summary

Implement the absence calculation rule system that determines how absence days impact accounts and time evaluation. Key formula from ZMI manual section 15.3:

- **Account value = Value * Factor**
- **Exception**: if Value = 0, use **Daily target time (time plan) * Factor**

A calculation rule is a named, reusable configuration that:
1. Has a code/name for identification
2. Links to an account (optional)
3. Specifies a `value` (minutes) and a `factor` (decimal multiplier)
4. Has an `is_active` flag
5. Gets assigned to absence types to control how those absence days affect accounts

---

## 2. Reference Manual Extracts

### Section 15.2 - Anteil (Portion)
**File**: `/home/tolga/projects/terp/thoughts/shared/reference/zmi-calculation-manual-reference.md` (lines 1595-1631)

The `Portion` field on absence types defines the portion of Regelarbeitszeit credited:
- 0 = no credit (target set to zero)
- 1 = full Regelarbeitszeit credited
- 2 = half Regelarbeitszeit credited

This is ALREADY implemented in the codebase via `AbsenceType.CreditMultiplier()` and `AbsenceDay.CalculateCredit()`.

### Section 15.3 - Account Assignment Formula
**File**: `/home/tolga/projects/terp/thoughts/shared/reference/zmi-calculation-manual-reference.md` (lines 1635-1658)

```
Account value = Value * Factor
Exception: Value = 0 -> Daily target time (time plan) * Factor
```

This is the NEW functionality to implement. A calculation rule defines Value and Factor. When an absence day is evaluated:
- If Value > 0: account gets Value * Factor
- If Value == 0: account gets DailyTargetTime * Factor

### Section 16 - Konten (Accounts)
**File**: `/home/tolga/projects/terp/thoughts/shared/reference/zmi-calculation-manual-reference.md` (lines 1662-1700)

Accounts can be:
- Daily or Monthly type
- Decimal or HH:MM display format
- With or without year carryover
- Payroll-relevant with export code

Already fully implemented in the accounts module.

---

## 3. Current State of Dependent Modules

### 3.1 Accounts Module (ZMI-TICKET-009) - FULLY IMPLEMENTED

**Model**: `/home/tolga/projects/terp/apps/api/internal/model/account.go`
```go
type Account struct {
    ID             uuid.UUID  // PK
    TenantID       *uuid.UUID // nullable for system accounts
    Code           string
    Name           string
    AccountType    AccountType    // bonus, day, month
    Unit           AccountUnit    // minutes, hours, days
    DisplayFormat  string         // decimal, hh_mm
    BonusFactor    *float64
    AccountGroupID *uuid.UUID
    IsSystem       bool
    IsActive       bool
    // ... timestamps
}
```

Constants: `AccountTypeBonus`, `AccountTypeDay`, `AccountTypeMonth`, `AccountUnitMinutes`, `AccountUnitHours`, `AccountUnitDays`

**Service**: `/home/tolga/projects/terp/apps/api/internal/service/account.go`
- `Create(ctx, CreateAccountInput)` - validates code/name/type, checks duplicates
- `GetByID(ctx, id)` / `GetByCode(ctx, tenantID, code)`
- `Update(ctx, id, UpdateAccountInput)` - prevents system account modification
- `Delete(ctx, id)` - prevents system account deletion
- `List(ctx, tenantID)` / `ListActive` / `ListWithSystem` / `GetSystemAccounts`
- `GetUsage(ctx, tenantID, accountID)` - returns day plans referencing this account

Error sentinels: `ErrAccountNotFound`, `ErrAccountCodeRequired`, `ErrAccountNameRequired`, `ErrAccountTypeRequired`, `ErrAccountCodeExists`, `ErrCannotModifySystemAccount`, `ErrCannotDeleteSystem`

**Repository**: `/home/tolga/projects/terp/apps/api/internal/repository/account.go`
- Standard GORM CRUD with tenant scoping
- `GetUsage` joins `day_plan_bonuses` to find referencing day plans

**Handler**: `/home/tolga/projects/terp/apps/api/internal/handler/account.go`
- Full CRUD + Usage endpoint
- Uses generated `models.Account` for responses via `mapAccountToResponse()`

**Routes**: `RegisterAccountRoutes` in `/home/tolga/projects/terp/apps/api/internal/handler/routes.go` (line 129)
- Permission: `accounts.manage`

### 3.2 Absence Types (ZMI-TICKET-007) - FULLY IMPLEMENTED

**Model**: `/home/tolga/projects/terp/apps/api/internal/model/absencetype.go`
```go
type AbsenceType struct {
    ID               uuid.UUID
    TenantID         *uuid.UUID
    Code             string          // Must start with U, K, or S
    Name             string
    Category         AbsenceCategory // vacation, illness, special, unpaid
    Portion          AbsencePortion  // 0=none, 1=full, 2=half
    HolidayCode      *string
    Priority         int
    DeductsVacation  bool
    RequiresApproval bool
    RequiresDocument bool
    Color            string
    SortOrder        int
    IsSystem         bool
    IsActive         bool
    AbsenceTypeGroupID *uuid.UUID
    // ... NO calculation_rule_id field yet
}
```

Key methods:
- `CreditMultiplier()` -> 0.0/1.0/0.5 based on Portion
- `CalculateCredit(regelarbeitszeit)` -> minutes * multiplier
- `GetEffectiveCode(isHoliday)` -> holiday_code or regular code

**NOTE**: The `AbsenceType` model does NOT yet have a `calculation_rule_id` field. This needs to be added.

**Service**: `/home/tolga/projects/terp/apps/api/internal/service/absence.go`
- Full CRUD for absence types and absence day creation
- Handles approval workflow

**Repository**: `/home/tolga/projects/terp/apps/api/internal/repository/absencetype.go`
- Standard GORM CRUD with tenant + system scoping

**Handler**: `/home/tolga/projects/terp/apps/api/internal/handler/absence.go`
- Absence type CRUD + absence day lifecycle endpoints

**Routes**: `RegisterAbsenceRoutes` in routes.go (line 498)
- Permission: `absence_types.manage` for type CRUD

### 3.3 Day Plans (ZMI-TICKET-006) - FULLY IMPLEMENTED

**Model**: `/home/tolga/projects/terp/apps/api/internal/model/dayplan.go`
```go
type DayPlan struct {
    // ...
    RegularHours  int     // Target minutes (default 480 = 8h)
    RegularHours2 *int    // Alternative target for absence days
    FromEmployeeMaster bool // Use employee master target
    // ...
}
```

Key method: `GetEffectiveRegularHours(isAbsenceDay, employeeTargetMinutes)` - resolves the daily target time.

### 3.4 Absence Days Model

**Model**: `/home/tolga/projects/terp/apps/api/internal/model/absenceday.go`
```go
type AbsenceDay struct {
    ID            uuid.UUID
    TenantID      uuid.UUID
    EmployeeID    uuid.UUID
    AbsenceDate   time.Time
    AbsenceTypeID uuid.UUID
    Duration      decimal.Decimal  // 1.00=full, 0.50=half
    HalfDayPeriod *HalfDayPeriod
    Status        AbsenceStatus
    // ...
}
```

Key method: `CalculateCredit(regelarbeitszeit)` - uses AbsenceType.CreditMultiplier() * duration

### 3.5 Daily Calculation Service

**File**: `/home/tolga/projects/terp/apps/api/internal/service/daily_calc.go`

The `DailyCalcService.CalculateDay()` method already:
1. Resolves target hours via `resolveTargetHours()` (handles employee master, absence day alt target)
2. Checks for absence days via `absenceDayRepo.GetByEmployeeDate()`
3. Handles absence credit via `handleAbsenceCredit()` which calls `absence.CalculateCredit(targetTime)`

**INTEGRATION POINT**: After calculation rules are implemented, the daily calc service should also apply calculation rules to write account values when an absence has a linked calculation rule with an account.

---

## 4. Patterns and Conventions

### 4.1 CRUD Handler Pattern

**Reference**: `/home/tolga/projects/terp/apps/api/internal/handler/account.go`

Standard handler pattern:
```go
type XxxHandler struct {
    service *service.XxxService
}

func NewXxxHandler(svc *service.XxxService) *XxxHandler {
    return &XxxHandler{service: svc}
}

// List handles GET /xxx
func (h *XxxHandler) List(w http.ResponseWriter, r *http.Request) {
    tenantID, ok := middleware.TenantFromContext(r.Context())
    if !ok { respondError(w, 401, "Tenant required"); return }
    // ... query params ...
    items, err := h.service.List(ctx, tenantID)
    // ... error handling ...
    respondJSON(w, 200, mapToResponse(items))
}

// Create handles POST /xxx
func (h *XxxHandler) Create(w http.ResponseWriter, r *http.Request) {
    tenantID, ok := middleware.TenantFromContext(r.Context())
    // ... decode body ...
    // ... call service.Create ...
    respondJSON(w, 201, result)
}

// Get handles GET /xxx/{id}
func (h *XxxHandler) Get(w http.ResponseWriter, r *http.Request) {
    id, err := uuid.Parse(chi.URLParam(r, "id"))
    // ... call service.GetByID ...
    respondJSON(w, 200, result)
}

// Update handles PATCH /xxx/{id}
func (h *XxxHandler) Update(w http.ResponseWriter, r *http.Request) {
    id, err := uuid.Parse(chi.URLParam(r, "id"))
    // ... decode body ...
    // ... call service.Update ...
    respondJSON(w, 200, result)
}

// Delete handles DELETE /xxx/{id}
func (h *XxxHandler) Delete(w http.ResponseWriter, r *http.Request) {
    id, err := uuid.Parse(chi.URLParam(r, "id"))
    // ... call service.Delete ...
    respondJSON(w, 204, nil)
}
```

### 4.2 Service Pattern

**Reference**: `/home/tolga/projects/terp/apps/api/internal/service/account.go`

```go
type XxxService struct {
    repo *repository.XxxRepository
}

func NewXxxService(repo *repository.XxxRepository) *XxxService {
    return &XxxService{repo: repo}
}

// Input structs for create/update
type CreateXxxInput struct {
    TenantID uuid.UUID
    Code     string
    Name     string
    // ...
}
type UpdateXxxInput struct {
    Name     *string   // pointer = optional field
    IsActive *bool
    // ...
}

// Error sentinels
var (
    ErrXxxNotFound       = errors.New("xxx not found")
    ErrXxxCodeRequired   = errors.New("code is required")
    ErrXxxCodeExists     = errors.New("code already exists")
    ErrCannotModifySystem = errors.New("cannot modify system xxx")
)
```

### 4.3 Repository Pattern

**Reference**: `/home/tolga/projects/terp/apps/api/internal/repository/account.go`

```go
type XxxRepository struct {
    db *DB
}

func NewXxxRepository(db *DB) *XxxRepository {
    return &XxxRepository{db: db}
}

func (r *XxxRepository) Create(ctx context.Context, x *model.Xxx) error {
    return r.db.GORM.WithContext(ctx).Create(x).Error
}

func (r *XxxRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Xxx, error) {
    var x model.Xxx
    err := r.db.GORM.WithContext(ctx).First(&x, "id = ?", id).Error
    if errors.Is(err, gorm.ErrRecordNotFound) {
        return nil, ErrXxxNotFound
    }
    return &x, err
}
```

### 4.4 Audit Logging Pattern

**Model**: `/home/tolga/projects/terp/apps/api/internal/model/auditlog.go`
```go
type AuditLog struct {
    ID          uuid.UUID
    TenantID    uuid.UUID
    UserID      *uuid.UUID
    Action      AuditAction   // "create", "update", "delete"
    EntityType  string        // "account", "absence_type", etc.
    EntityID    uuid.UUID
    EntityName  *string
    Changes     json.RawMessage  // before/after JSON
    Metadata    json.RawMessage
    IPAddress   *string
    UserAgent   *string
    PerformedAt time.Time
}
```

**Service**: `/home/tolga/projects/terp/apps/api/internal/service/auditlog.go`
- `Create(ctx, *model.AuditLog)` - persists audit entry
- `List(ctx, filter)` - paginated query with filters
- `GetByID(ctx, id)` - single entry lookup

**Wiring in handlers**: Handlers that need audit logging get a `SetAuditService` method:
```go
func (h *XxxHandler) SetAuditService(svc *service.AuditLogService) {
    h.auditService = svc
}
```

Then in main.go: `xxxHandler.SetAuditService(auditLogService)`

Audit entries are created after successful operations:
```go
if h.auditService != nil {
    _ = h.auditService.Create(ctx, &model.AuditLog{
        TenantID:   tenantID,
        UserID:     userID,
        Action:     model.AuditActionUpdate,
        EntityType: "calculation_rule",
        EntityID:   rule.ID,
        EntityName: &rule.Name,
        Changes:    changesJSON,
    })
}
```

### 4.5 Route Registration Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/routes.go`

```go
func RegisterXxxRoutes(r chi.Router, h *XxxHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("xxx.manage").String()
    r.Route("/xxx", func(r chi.Router) {
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

### 4.6 Permission Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/permissions/permissions.go`

Permissions are defined as static entries with deterministic UUIDs:
```go
{ID: permissionID("accounts.manage"), Resource: "accounts", Action: "manage", Description: "Manage accounts"},
```

For calculation rules, we should add a permission like `calculation_rules.manage` or reuse `absence_types.manage` since rules are closely tied to absence type configuration.

---

## 5. Database Migration Patterns

### 5.1 Naming Convention
**Pattern**: `{sequence}_{description}.{up|down}.sql`
**Current highest**: `000045` (correction_messages)
**Next available**: `000046`

### 5.2 UP Migration Pattern
```sql
CREATE TABLE xxx (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    -- ... fields ...
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_xxx_tenant ON xxx(tenant_id);

CREATE TRIGGER update_xxx_updated_at
    BEFORE UPDATE ON xxx
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE xxx IS 'Description of table';
```

### 5.3 DOWN Migration Pattern
```sql
DROP TABLE IF EXISTS xxx;
```

For ALTER TABLE additions:
```sql
-- up: ALTER TABLE x ADD COLUMN y ...
-- down: ALTER TABLE x DROP COLUMN y ...
```

---

## 6. OpenAPI Spec Patterns

### 6.1 Schema Pattern
**File structure**: `api/schemas/xxx.yaml`

```yaml
Xxx:
  type: object
  required:
    - id
    - code
    - name
  properties:
    id:
      type: string
      format: uuid
    tenant_id:
      type: string
      format: uuid
      x-nullable: true
    code:
      type: string
    name:
      type: string
    is_active:
      type: boolean
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time

CreateXxxRequest:
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

UpdateXxxRequest:
  type: object
  properties:
    name:
      type: string
    is_active:
      type: boolean

XxxList:
  type: object
  required:
    - data
  properties:
    data:
      type: array
      items:
        $ref: '#/Xxx'
```

### 6.2 Path Pattern
**File structure**: `api/paths/xxx.yaml`

```yaml
/xxx:
  get:
    tags:
      - Xxx
    summary: List xxx
    operationId: listXxx
    parameters:
      - name: active
        in: query
        type: boolean
    responses:
      200:
        description: List of xxx
        schema:
          $ref: '../schemas/xxx.yaml#/XxxList'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
  post:
    tags:
      - Xxx
    summary: Create xxx
    operationId: createXxx
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '../schemas/xxx.yaml#/CreateXxxRequest'
    responses:
      201:
        description: Created
        schema:
          $ref: '../schemas/xxx.yaml#/Xxx'
```

### 6.3 Main Spec Registration
**File**: `/home/tolga/projects/terp/api/openapi.yaml`

Add new tag under `tags:` section, and add path references under `paths:` section.

---

## 7. Test Patterns

### 7.1 Service Tests

**Reference**: `/home/tolga/projects/terp/apps/api/internal/service/account_test.go`

```go
func TestXxxService_Create_Success(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := repository.NewXxxRepository(db)
    svc := service.NewXxxService(repo)
    ctx := context.Background()

    tenant := createTestTenant(t, db)

    input := service.CreateXxxInput{
        TenantID: tenant.ID,
        Code:     "TEST",
        Name:     "Test",
    }

    result, err := svc.Create(ctx, input)
    require.NoError(t, err)
    assert.Equal(t, "TEST", result.Code)
}
```

**Test DB Setup**: `/home/tolga/projects/terp/apps/api/internal/testutil/db.go`
- Uses shared DB connection with transaction isolation per test
- Each test runs in its own transaction that gets rolled back

### 7.2 Handler Tests

**Reference**: `/home/tolga/projects/terp/apps/api/internal/handler/account_test.go`

```go
func setupXxxHandler(t *testing.T) (*handler.XxxHandler, *service.XxxService, ...) {
    db := testutil.SetupTestDB(t)
    repo := repository.NewXxxRepository(db)
    svc := service.NewXxxService(repo)
    h := handler.NewXxxHandler(svc)
    // create test tenant...
    return h, svc, tenant, db
}

func TestXxxHandler_Create_Success(t *testing.T) {
    h, _, tenant, _ := setupXxxHandler(t)

    body := `{"code": "TEST", "name": "Test"}`
    req := httptest.NewRequest("POST", "/xxx", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    req = withTenantContext(req, tenant)
    rr := httptest.NewRecorder()

    h.Create(rr, req)
    assert.Equal(t, http.StatusCreated, rr.Code)
}
```

### 7.3 Key Test Libraries
- `github.com/stretchr/testify/assert` - assertions
- `github.com/stretchr/testify/require` - fatal assertions
- `net/http/httptest` - HTTP test recording
- `github.com/go-chi/chi/v5` - route context for URL params

---

## 8. Implementation Plan Summary

### 8.1 New Files Needed

**Database**:
- `db/migrations/000046_create_calculation_rules.up.sql` - create `calculation_rules` table
- `db/migrations/000046_create_calculation_rules.down.sql` - drop table
- `db/migrations/000047_add_calculation_rule_to_absence_types.up.sql` - add FK to absence_types
- `db/migrations/000047_add_calculation_rule_to_absence_types.down.sql` - drop column

**Model**:
- `apps/api/internal/model/calculationrule.go` - CalculationRule struct

**Repository**:
- `apps/api/internal/repository/calculationrule.go` - CRUD + tenant scoping

**Service**:
- `apps/api/internal/service/calculationrule.go` - business logic + validation + audit logging

**Handler**:
- `apps/api/internal/handler/calculationrule.go` - HTTP endpoints

**OpenAPI**:
- `api/schemas/calculation-rules.yaml` - schema definitions
- `api/paths/calculation-rules.yaml` - endpoint definitions

**Tests**:
- `apps/api/internal/service/calculationrule_test.go`
- `apps/api/internal/handler/calculationrule_test.go`

### 8.2 Files to Modify

**Model** (add `CalculationRuleID` FK):
- `apps/api/internal/model/absencetype.go` - add `CalculationRuleID *uuid.UUID` field + relation

**OpenAPI** (add field to absence type schemas):
- `api/schemas/absence-types.yaml` - add `calculation_rule_id` to AbsenceType, CreateAbsenceTypeRequest, UpdateAbsenceTypeRequest

**Handler** (wire up routes):
- `apps/api/internal/handler/routes.go` - add `RegisterCalculationRuleRoutes`

**Main** (wire up dependencies):
- `apps/api/cmd/server/main.go` - add repo, service, handler initialization

**Permissions**:
- `apps/api/internal/permissions/permissions.go` - add `calculation_rules.manage` (or reuse `absence_types.manage`)

**OpenAPI main spec**:
- `api/openapi.yaml` - add tag + path references

### 8.3 Proposed Data Model

```go
type CalculationRule struct {
    ID        uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
    TenantID  uuid.UUID  `gorm:"type:uuid;not null;index"`
    Code      string     `gorm:"type:varchar(50);not null"`
    Name      string     `gorm:"type:varchar(255);not null"`

    // Linked account (optional - if set, calculation writes to this account)
    AccountID *uuid.UUID `gorm:"type:uuid"`

    // Value in minutes (0 = use daily target time from day plan)
    Value     int        `gorm:"type:int;not null;default:0"`

    // Factor (multiplier, e.g., 1.0, 0.5, 2.0)
    Factor    float64    `gorm:"type:decimal(5,2);not null;default:1.00"`

    Description *string  `gorm:"type:text"`
    IsActive    bool     `gorm:"default:true"`

    CreatedAt time.Time
    UpdatedAt time.Time

    // Relations
    Account *Account `gorm:"foreignKey:AccountID"`
}
```

SQL table:
```sql
CREATE TABLE calculation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    value INT NOT NULL DEFAULT 0,
    factor NUMERIC(5,2) NOT NULL DEFAULT 1.00,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);
```

### 8.4 Calculation Formula Implementation

```go
func (r *CalculationRule) CalculateAccountValue(dailyTargetMinutes int) int {
    base := r.Value
    if base == 0 {
        base = dailyTargetMinutes
    }
    return int(float64(base) * r.Factor)
}
```

### 8.5 Preview Endpoint

The ticket requests a preview calculation result endpoint. This should accept:
- `calculation_rule_id` (or inline value/factor)
- `day_plan_id` (for target time resolution)
- `employee_id` (optional, for employee master target)
- `date` (optional, for actual day plan lookup)

And return the computed account value without persisting anything.

---

## 9. Gaps and Considerations

### 9.1 No Existing Calculation Rule Concept
The codebase has no `calculation_rule` entity yet. The current absence credit calculation uses only `AbsenceType.Portion` (0/1/2) and the daily calc service's `handleAbsenceCredit()`. The new calculation rules are COMPLEMENTARY to the existing portion-based credit system.

### 9.2 Relationship Between Portion and Calculation Rules
The existing `Portion` field controls how much of Regelarbeitszeit is credited to the employee's daily net time. The new calculation rules control what gets WRITTEN TO ACCOUNTS. These are two different things:
- **Portion** -> affects daily value (net time credit)
- **Calculation Rule** -> affects account values (write to specific account)

Both can apply to the same absence day.

### 9.3 Integration with Daily Calculation
The daily calc service (`daily_calc.go`) currently does NOT write account values during absence day processing. When calculation rules are implemented, the service will need to:
1. Look up the absence type's calculation rule
2. If rule exists and has an account: compute value and write to `account_values` table
3. Use the existing `AccountValue` model/repo for persistence

This integration may be done in a follow-up ticket or as part of this ticket's "Absence day application writes expected account values" acceptance criterion.

### 9.4 Audit Logging
The ticket requires audit log for rule changes. Follow the existing pattern: add `SetAuditService` to the handler and log create/update/delete actions.

### 9.5 Permission Decision
Two options:
1. New permission: `calculation_rules.manage` - more granular
2. Reuse `absence_types.manage` - since rules are tightly coupled to absence types

Recommendation: Use `absence_types.manage` since calculation rules are conceptually part of absence type configuration, and this avoids adding a new permission that would need to be assigned to existing user groups.

### 9.6 Account Validation
When a calculation rule links to an account:
- The account must exist
- The account should be active (warn if inactive?)
- The account should have compatible unit (minutes preferred)

### 9.7 Absence Type Assignment
When assigning a calculation rule to an absence type:
- The rule must exist and be active
- Only one rule per absence type
- Removing a rule from an absence type should be allowed (set to null)

---

## 10. Key Code References

| File | Lines | Description |
|------|-------|-------------|
| `apps/api/internal/model/account.go` | 1-113 | Account model with types, units |
| `apps/api/internal/model/absencetype.go` | 1-113 | AbsenceType model - needs calculation_rule_id |
| `apps/api/internal/model/absenceday.go` | 1-110 | AbsenceDay model with CalculateCredit |
| `apps/api/internal/model/dayplan.go` | 51-133 | DayPlan model with GetEffectiveRegularHours |
| `apps/api/internal/model/auditlog.go` | full | AuditLog model pattern |
| `apps/api/internal/service/account.go` | full | Account service CRUD pattern |
| `apps/api/internal/service/auditlog.go` | full | Audit log service pattern |
| `apps/api/internal/service/daily_calc.go` | 320-353 | handleAbsenceCredit - integration point |
| `apps/api/internal/service/daily_calc.go` | 100-130 | resolveTargetHours - target time resolution |
| `apps/api/internal/repository/account.go` | full | Account repository CRUD pattern |
| `apps/api/internal/repository/auditlog.go` | full | Audit log repository pattern |
| `apps/api/internal/handler/account.go` | full | Account handler CRUD pattern |
| `apps/api/internal/handler/routes.go` | 129-149 | Account routes registration pattern |
| `apps/api/internal/handler/response.go` | 14-26 | respondJSON/respondError helpers |
| `apps/api/internal/permissions/permissions.go` | 33-65 | Permission definitions |
| `apps/api/cmd/server/main.go` | 27-354 | Wiring pattern (repo->service->handler->routes) |
| `api/schemas/accounts.yaml` | full | Account OpenAPI schema pattern |
| `api/paths/accounts.yaml` | full | Account OpenAPI path pattern |
| `api/openapi.yaml` | full | Main spec (tags + paths registration) |
| `db/migrations/000006_create_accounts.up.sql` | full | Account migration pattern |
| `db/migrations/000043_account_groups_and_fields.up.sql` | full | ALTER TABLE migration pattern |
| `db/migrations/000045_create_correction_messages.up.sql` | full | Latest migration (sequence ref) |
| `apps/api/internal/service/account_test.go` | full | Service test pattern |
| `apps/api/internal/handler/account_test.go` | full | Handler test pattern |
| `apps/api/internal/testutil/db.go` | full | Test DB setup pattern |

---

## 11. Test Cases from Ticket

1. **Value * Factor**: Create rule with value=120 (2h), factor=3.0 -> expect account_value=360 (6h)
2. **Value=0 uses target time**: Create rule with value=0, factor=1.0, day plan target=480 (8h) -> expect account_value=480
3. **Inactive rule**: Attempt to assign inactive rule to absence type -> expect validation error
4. **Create + Assign + Preview**: Create rule, assign to absence type, call preview endpoint, verify output matches formula
5. **Update rule + audit**: Update rule values, verify audit log entry with changes
6. **Integration**: Create absence day for employee with linked calculation rule, verify account values written
