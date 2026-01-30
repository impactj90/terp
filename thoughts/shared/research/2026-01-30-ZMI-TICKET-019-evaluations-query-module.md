# Research: ZMI-TICKET-019 - Evaluations (Auswertungen) Query Module

## Ticket Summary

Build 5 read-only evaluation query endpoints under `/evaluations/`:
1. `GET /evaluations/daily-values` - One row per employee per day (time worked, overtime, break, balance)
2. `GET /evaluations/bookings` - One row per booking (time, type, source, employee)
3. `GET /evaluations/terminal-bookings` - Raw terminal transactions (original time vs edited time)
4. `GET /evaluations/logs` - Change log (booking changes, absence changes, monthly account changes with before/after values)
5. `GET /evaluations/workflow-history` - Requests and approval history

All endpoints require: date range filter, employee filter, department filter, pagination. Multi-tenancy via X-Tenant-ID header.

---

## 1. Existing Handler Patterns

### Handler Struct Pattern
File: `apps/api/internal/handler/monthlyeval.go` (closest reference for evaluation-style endpoints)

```go
type MonthlyEvalHandler struct {
    monthlyEvalService *service.MonthlyEvalService
    employeeService    *service.EmployeeService
}

func NewMonthlyEvalHandler(monthlyEvalService *service.MonthlyEvalService, employeeService *service.EmployeeService) *MonthlyEvalHandler {
    return &MonthlyEvalHandler{
        monthlyEvalService: monthlyEvalService,
        employeeService:    employeeService,
    }
}
```

### Standard Request Flow
1. Extract tenant from context: `middleware.TenantFromContext(r.Context())`
2. Parse URL/query parameters
3. Validate access scope via `ensureEmployeeScope()` or inline scope check
4. Call service layer
5. Convert domain model to generated response model
6. Respond with `respondJSON(w, status, data)`

### Error Handling
File: `apps/api/internal/handler/response.go`

```go
func respondJSON(w http.ResponseWriter, status int, data any) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    _ = json.NewEncoder(w).Encode(data)
}

func respondError(w http.ResponseWriter, status int, message string) {
    respondJSON(w, status, map[string]any{
        "error":   http.StatusText(status),
        "message": message,
        "status":  status,
    })
}
```

### List Endpoint Pattern (BookingHandler.List)
File: `apps/api/internal/handler/booking.go`

Key steps:
1. Extract tenantID from context
2. Load scope: `scope, err := scopeFromContext(r.Context())`
3. Verify tenant access: `scope.AllowsTenant(tenantID)`
4. Build filter struct from query params (employee_id, from, to, limit, page)
5. Pass scope filtering fields into filter struct
6. Call repository `.List()` which returns `([]model.T, int64, error)` -- data + total count
7. Convert each model to response model
8. Return as list response with pagination metadata

### Scope-Based Access Control
File: `apps/api/internal/handler/scope.go`

```go
func scopeFromContext(ctx context.Context) (access.Scope, error) {
    checker, ok := middleware.PermissionCheckerFromContext(ctx)
    if !ok {
        return access.Scope{Type: model.DataScopeAll}, nil
    }
    return access.ScopeFromUser(checker.User())
}
```

### Employee Scope Verification
File: `apps/api/internal/handler/monthlyeval.go`

```go
func (h *MonthlyEvalHandler) ensureEmployeeScope(ctx context.Context, employeeID uuid.UUID) error {
    emp, err := h.employeeService.GetByID(ctx, employeeID)
    if err != nil {
        return err
    }
    scope, err := scopeFromContext(ctx)
    if err != nil {
        return err
    }
    if tenantID, ok := middleware.TenantFromContext(ctx); ok {
        if !scope.AllowsTenant(tenantID) {
            return errMonthlyEvalScopeDenied
        }
    }
    if !scope.AllowsEmployee(emp) {
        return errMonthlyEvalScopeDenied
    }
    return nil
}
```

---

## 2. Existing Models

### Booking Model
File: `apps/api/internal/model/booking.go`

```go
type Booking struct {
    ID            uuid.UUID     `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
    TenantID      uuid.UUID     `gorm:"type:uuid;not null;index"`
    EmployeeID    uuid.UUID     `gorm:"type:uuid;not null;index"`
    BookingDate   time.Time     `gorm:"type:date;not null"`
    BookingTypeID uuid.UUID     `gorm:"type:uuid;not null"`
    OriginalTime  int           `gorm:"type:int;not null"`    // minutes from midnight
    EditedTime    int           `gorm:"type:int;not null"`    // minutes from midnight
    CalculatedTime *int         `gorm:"type:int"`             // minutes from midnight
    PairID        *uuid.UUID    `gorm:"type:uuid;index"`
    Source        BookingSource `gorm:"type:varchar(20);default:'web'"`
    TerminalID    *uuid.UUID    `gorm:"type:uuid"`
    Notes         string        `gorm:"type:text"`
    CreatedAt     time.Time
    UpdatedAt     time.Time
    CreatedBy     *uuid.UUID
    UpdatedBy     *uuid.UUID
    Employee      *Employee     `gorm:"foreignKey:EmployeeID"`
    BookingType   *BookingType  `gorm:"foreignKey:BookingTypeID"`
    Pair          *Booking      `gorm:"foreignKey:PairID"`
}
```

BookingSource enum: `web`, `terminal`, `api`, `import`, `correction`

### DailyValue Model
File: `apps/api/internal/model/dailyvalue.go`

```go
type DailyValue struct {
    ID                 uuid.UUID        `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
    TenantID           uuid.UUID        `gorm:"type:uuid;not null;index"`
    EmployeeID         uuid.UUID        `gorm:"type:uuid;not null;index"`
    ValueDate          time.Time        `gorm:"type:date;not null"`
    Status             DailyValueStatus `gorm:"type:varchar(20);not null;default:'calculated'"`
    GrossTime          int              `gorm:"default:0"`
    NetTime            int              `gorm:"default:0"`
    TargetTime         int              `gorm:"default:0"`
    Overtime           int              `gorm:"default:0"`
    Undertime          int              `gorm:"default:0"`
    BreakTime          int              `gorm:"default:0"`
    HasError           bool             `gorm:"default:false"`
    ErrorCodes         pq.StringArray   `gorm:"type:text[]"`
    Warnings           pq.StringArray   `gorm:"type:text[]"`
    FirstCome          *int             `gorm:"type:int"` // minutes from midnight
    LastGo             *int             `gorm:"type:int"` // minutes from midnight
    BookingCount       int              `gorm:"default:0"`
    CalculatedAt       *time.Time       `gorm:"type:timestamptz"`
    CalculationVersion int              `gorm:"default:1"`
    CreatedAt          time.Time
    UpdatedAt          time.Time
    Employee           *Employee        `gorm:"foreignKey:EmployeeID"`
}
```

DailyValueStatus enum: `pending`, `calculated`, `error`, `approved`

### AuditLog Model
File: `apps/api/internal/model/auditlog.go`

```go
type AuditLog struct {
    ID          uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
    TenantID    uuid.UUID      `gorm:"type:uuid;not null;index"`
    UserID      *uuid.UUID     `gorm:"type:uuid"`
    Action      AuditAction    `gorm:"type:varchar(20);not null"`
    EntityType  string         `gorm:"type:varchar(100);not null"`
    EntityID    uuid.UUID      `gorm:"type:uuid;not null"`
    EntityName  *string        `gorm:"type:text"`
    Changes     datatypes.JSON `gorm:"type:jsonb"`
    Metadata    datatypes.JSON `gorm:"type:jsonb"`
    IPAddress   *string        `gorm:"type:text"`
    UserAgent   *string        `gorm:"type:text"`
    PerformedAt time.Time      `gorm:"type:timestamptz;default:now()"`
    User        *User          `gorm:"foreignKey:UserID"`
}
```

AuditAction enum: `create`, `update`, `delete`, `approve`, `reject`, `close`, `reopen`, `export`, `import`, `login`, `logout`

### BookingType Model
File: `apps/api/internal/model/bookingtype.go`

Fields: ID, TenantID, Code, Name, Description, Direction (`in`/`out`), Category (`work`/`break`/`business_trip`/`other`), AccountID, RequiresReason, IsSystem, IsActive

### Department Model
File: `apps/api/internal/model/department.go`

Fields: ID, TenantID, ParentID, Code, Name, Description, ManagerEmployeeID, IsActive. Has Parent/Children/Manager relations.

### Employee Model
File: `apps/api/internal/model/employee.go`

Key fields used for filtering: ID, TenantID, DepartmentID, PersonnelNumber, FirstName, LastName

---

## 3. Existing Migrations

### Bookings Table (000022_create_bookings.up.sql)
```sql
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id),
    booking_date DATE NOT NULL,
    booking_type_id UUID NOT NULL REFERENCES booking_types(id),
    original_time INT NOT NULL,
    edited_time INT NOT NULL,
    calculated_time INT,
    pair_id UUID,
    source VARCHAR(20) DEFAULT 'web',
    terminal_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    updated_by UUID
);
-- Indexes: tenant, employee+date, date, pair(partial)
```

### Daily Values Table (000024_create_daily_values.up.sql)
```sql
CREATE TABLE daily_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id),
    value_date DATE NOT NULL,
    gross_time INT DEFAULT 0,
    net_time INT DEFAULT 0,
    target_time INT DEFAULT 0,
    overtime INT DEFAULT 0,
    undertime INT DEFAULT 0,
    break_time INT DEFAULT 0,
    has_error BOOLEAN DEFAULT FALSE,
    error_codes TEXT[],
    warnings TEXT[],
    first_come INT,
    last_go INT,
    booking_count INT DEFAULT 0,
    calculated_at TIMESTAMPTZ,
    calculation_version INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id, value_date)
);
-- Indexes: tenant, employee, date, lookup, errors(partial)
```

### Audit Logs Table (000040_create_audit_logs.up.sql)
```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    user_id UUID REFERENCES users(id),
    action VARCHAR(20) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    entity_name TEXT,
    changes JSONB,
    metadata JSONB,
    ip_address TEXT,
    user_agent TEXT,
    performed_at TIMESTAMPTZ DEFAULT NOW()
);
-- Indexes: tenant, user, entity(type+id), action, performed_at
```

---

## 4. Route Registration

File: `apps/api/internal/handler/routes.go`

### Pattern
Each handler domain has a `RegisterXxxRoutes` function:

```go
func RegisterXxxRoutes(r chi.Router, h *XxxHandler, authz *middleware.AuthorizationMiddleware) {
    permXxx := permissions.ID("xxx.view").String()
    r.Route("/xxx", func(r chi.Router) {
        if authz == nil {
            r.Get("/", h.List)
            return
        }
        r.With(authz.RequirePermission(permXxx)).Get("/", h.List)
    })
}
```

### Where Routes Are Registered
File: `apps/api/cmd/server/main.go`, lines ~325-362

All tenant-scoped routes are inside:
```go
r.Group(func(r chi.Router) {
    r.Use(tenantMiddleware.RequireTenant)
    // all tenant-scoped route registrations here
})
```

### Relevant Permission IDs in Use
- `reports.view` - Used for monthly eval routes
- `time_tracking.view_all` - Used for daily values and bookings
- `time_tracking.view_own` - Used for own booking access
- `users.manage` - Used for audit log routes

For evaluations, likely use: `reports.view` or a new `evaluations.view` permission.

---

## 5. Multi-Tenancy Pattern

File: `apps/api/internal/middleware/tenant.go`

### Extracting Tenant
```go
func TenantFromContext(ctx context.Context) (uuid.UUID, bool) {
    tenantID, ok := ctx.Value(TenantContextKey).(uuid.UUID)
    return tenantID, ok
}
```

### RequireTenant Middleware
Reads `X-Tenant-ID` header, validates UUID, verifies tenant exists and is active, adds to context.

### Usage in Handlers
Every handler begins with:
```go
tenantID, ok := middleware.TenantFromContext(r.Context())
if !ok {
    respondError(w, http.StatusUnauthorized, "Tenant required")
    return
}
```

### Repository Tenant Filtering
All repository queries filter by `tenant_id`:
```go
query := r.db.GORM.WithContext(ctx).Model(&model.T{}).Where("tenant_id = ?", filter.TenantID)
```

---

## 6. Filtering Patterns

### BookingFilter (most comprehensive example)
File: `apps/api/internal/repository/booking.go`

```go
type BookingFilter struct {
    TenantID           uuid.UUID
    EmployeeID         *uuid.UUID
    StartDate          *time.Time
    EndDate            *time.Time
    Direction          *model.BookingDirection
    Source             *model.BookingSource
    HasPair            *bool
    ScopeType          model.DataScopeType
    ScopeDepartmentIDs []uuid.UUID
    ScopeEmployeeIDs   []uuid.UUID
    Offset             int
    Limit              int
}
```

### Filter Application Pattern (Repository)
```go
func (r *BookingRepository) List(ctx context.Context, filter BookingFilter) ([]model.Booking, int64, error) {
    query := r.db.GORM.WithContext(ctx).Model(&model.Booking{}).Where("tenant_id = ?", filter.TenantID)

    if filter.EmployeeID != nil {
        query = query.Where("employee_id = ?", *filter.EmployeeID)
    }
    // Scope filtering:
    switch filter.ScopeType {
    case model.DataScopeDepartment:
        query = query.Joins("JOIN employees ON employees.id = bookings.employee_id").
            Where("employees.department_id IN ?", filter.ScopeDepartmentIDs)
    case model.DataScopeEmployee:
        query = query.Where("employee_id IN ?", filter.ScopeEmployeeIDs)
    }
    if filter.StartDate != nil {
        query = query.Where("booking_date >= ?", *filter.StartDate)
    }
    if filter.EndDate != nil {
        query = query.Where("booking_date <= ?", *filter.EndDate)
    }
    // Count total, apply pagination, execute
    query.Count(&total)
    query.Limit(filter.Limit).Offset(filter.Offset)
    query.Preload("BookingType").Order("booking_date DESC, edited_time DESC").Find(&bookings)
}
```

### Query Parameter Parsing (Handler)
```go
// Parse employee_id filter
if empID := r.URL.Query().Get("employee_id"); empID != "" {
    id, err := uuid.Parse(empID)
    // ... validate
    filter.EmployeeID = &id
}

// Parse from date filter
if from := r.URL.Query().Get("from"); from != "" {
    t, err := time.Parse("2006-01-02", from)
    // ... validate
    filter.StartDate = &t
}

// Parse pagination
if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
    if limit, err := strconv.Atoi(limitStr); err == nil && limit > 0 && limit <= 100 {
        filter.Limit = limit
    }
}
if pageStr := r.URL.Query().Get("page"); pageStr != "" {
    if page, err := strconv.Atoi(pageStr); err == nil && page > 0 {
        filter.Offset = (page - 1) * filter.Limit
    }
}
```

### DailyValue ListOptions
File: `apps/api/internal/model/dailyvalue.go`

```go
type DailyValueListOptions struct {
    EmployeeID         *uuid.UUID
    Status             *DailyValueStatus
    From               *time.Time
    To                 *time.Time
    HasErrors          *bool
    ScopeType          DataScopeType
    ScopeDepartmentIDs []uuid.UUID
    ScopeEmployeeIDs   []uuid.UUID
}
```

### AuditLog Filter
File: `apps/api/internal/repository/auditlog.go`

```go
type AuditLogFilter struct {
    TenantID   uuid.UUID
    UserID     *uuid.UUID
    EntityType *string
    EntityID   *uuid.UUID
    Action     *string
    From       *time.Time
    To         *time.Time
    Limit      int
    Cursor     *uuid.UUID
}
```

---

## 7. OpenAPI Patterns

### File Structure
- Path specs: `api/paths/<resource>.yaml`
- Schema specs: `api/schemas/<resource>.yaml`
- Common schemas: `api/schemas/common.yaml`
- Response templates: `api/responses/errors.yaml`

### Swagger 2.0 Format
All specs use Swagger 2.0 (not OpenAPI 3.0).

### List Endpoint Pattern (from daily-values.yaml)
```yaml
/daily-values:
  get:
    tags:
      - Daily Values
    summary: List daily values
    operationId: listDailyValues
    parameters:
      - name: employee_id
        in: query
        type: string
        format: uuid
      - name: from
        in: query
        type: string
        format: date
      - name: to
        in: query
        type: string
        format: date
      - name: limit
        in: query
        type: integer
        default: 50
        minimum: 1
        maximum: 100
      - name: cursor
        in: query
        type: string
    responses:
      200:
        description: List of daily values
        schema:
          $ref: '../schemas/daily-values.yaml#/DailyValueList'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
```

### List Schema Pattern
```yaml
DailyValueList:
  type: object
  required:
    - data
  properties:
    data:
      type: array
      items:
        $ref: '#/DailyValue'
    meta:
      $ref: '../schemas/common.yaml#/PaginationMeta'
```

---

## 8. Pagination Patterns

### PaginationMeta Schema
File: `api/schemas/common.yaml`

```yaml
PaginationMeta:
  type: object
  properties:
    total:
      type: integer
      description: Total number of items
    limit:
      type: integer
      description: Items per page
    has_more:
      type: boolean
    next_cursor:
      type: string
```

### Two Pagination Styles in Use

**Style 1: Offset-based (BookingList)**
```go
// BookingList uses Data + Total (page-based pagination)
response := models.BookingList{
    Data:  make([]*models.Booking, 0, len(bookings)),
    Total: &totalInt64,
}
```

**Style 2: Cursor-based (AuditLogList, DailyValueList)**
```go
// AuditLogList uses Data + Meta (cursor-based pagination)
respondJSON(w, http.StatusOK, &models.AuditLogList{
    Data: data,
    Meta: &models.PaginationMeta{
        Total: total,
        Limit: int64(filter.Limit),
    },
})
```

For evaluation endpoints, use **Style 2** (Data + PaginationMeta) for consistency with the newer patterns.

---

## 9. Audit/Log Models and Change Tracking

### How Changes Are Logged
File: `apps/api/internal/handler/booking.go` (Update handler)

```go
// Capture old values before update
oldEditedTime := booking.EditedTime
oldNotes := booking.Notes

// After update:
changes := map[string]interface{}{}
if input.EditedTime != nil && *input.EditedTime != oldEditedTime {
    changes["edited_time"] = map[string]interface{}{
        "before": oldEditedTime,
        "after":  *input.EditedTime,
    }
}
if input.Notes != nil && *input.Notes != oldNotes {
    changes["notes"] = map[string]interface{}{
        "before": oldNotes,
        "after":  *input.Notes,
    }
}

h.auditService.Log(r.Context(), r, service.LogEntry{
    TenantID:   tenantID,
    Action:     model.AuditActionUpdate,
    EntityType: "booking",
    EntityID:   booking.ID,
    EntityName: "Booking ...",
    Changes:    changesData,
})
```

### Changes JSONB Structure
The `changes` column stores before/after values:
```json
{
    "field_name": {
        "before": "old_value",
        "after": "new_value"
    }
}
```

### Entity Types in Use
Based on the codebase, entity types logged include:
- `booking` (create/update/delete)
- `absence` (create/update/delete/approve/reject)
- `employee` (create/update/delete)
- `user` (create/update/delete)
- `user_group` (create/update/delete)
- `calculation_rule` (create/update/delete)
- `vacation_capping_rule` (create/update/delete)
- `vacation_capping_rule_group` (create/update/delete)
- `employee_capping_exception` (create/update/delete)

### AuditLog Response Mapping
File: `apps/api/internal/handler/auditlog.go`

```go
func mapAuditLogToResponse(l *model.AuditLog) *models.AuditLog {
    resp := &models.AuditLog{
        ID:          &id,
        TenantID:    &tenantID,
        EntityID:    &entityID,
        Action:      &action,
        EntityType:  &entityType,
        PerformedAt: &performedAt,
    }
    // Optional: UserID, EntityName, IPAddress, UserAgent
    // Changes and Metadata: unmarshal JSON for response
    // User relation: nested User summary with ID, DisplayName, AvatarURL
}
```

---

## 10. Test Patterns

### Handler Test Structure
File: `apps/api/internal/handler/booking_test.go`

Tests use:
- `httptest.NewRecorder()` for response recording
- `httptest.NewRequest()` for building requests
- `chi.NewRouter()` for routing
- Direct handler method calls or router-based dispatching
- Context injection for tenant/user via `context.WithValue()`

### Test Utilities
File: `apps/api/internal/testutil/`
- `db.go` - Test database setup utilities
- Test helpers for setting up GORM test databases

---

## 11. What Already Exists vs. What Needs to Be Created

### Already Exists (can be reused directly)
| Component | File | Description |
|-----------|------|-------------|
| Booking model | `internal/model/booking.go` | Full model with relations |
| DailyValue model | `internal/model/dailyvalue.go` | Full model with relations |
| AuditLog model | `internal/model/auditlog.go` | Full model with relations |
| BookingRepository | `internal/repository/booking.go` | List with filters, date range queries |
| DailyValueRepository | `internal/repository/dailyvalue.go` | ListAll, date range queries |
| AuditLogRepository | `internal/repository/auditlog.go` | List with filters (entity_type, action, date range) |
| Access Scope | `internal/access/scope.go` | ApplyEmployeeScope for GORM queries |
| Tenant middleware | `internal/middleware/tenant.go` | TenantFromContext |
| Response helpers | `internal/handler/response.go` | respondJSON, respondError |
| Generated models | `gen/models/` | Booking, DailyValue, AuditLog, BookingList, DailyValueList, AuditLogList, PaginationMeta |
| Model-to-response mappers | `internal/handler/booking.go`, `auditlog.go` | modelToResponse, mapAuditLogToResponse |

### Needs to Be Created

#### New Files
1. **`api/paths/evaluations.yaml`** - OpenAPI path specs for all 5 endpoints
2. **`api/schemas/evaluations.yaml`** - Response/filter schemas for evaluations
3. **`apps/api/internal/handler/evaluation.go`** - Handler for all 5 evaluation endpoints
4. **`apps/api/internal/service/evaluation.go`** - Service layer composing queries from multiple repos
5. **`apps/api/internal/repository/evaluation.go`** - Query-only repository (no CRUD) composing evaluation queries
6. **`apps/api/internal/handler/evaluation_test.go`** - Handler tests

#### Modifications to Existing Files
1. **`apps/api/internal/handler/routes.go`** - Add `RegisterEvaluationRoutes()` function
2. **`apps/api/cmd/server/main.go`** - Wire up evaluation handler/service/repo, register routes
3. **`api/openapi.bundled.yaml`** - Regenerated after `make swagger-bundle`
4. **`apps/api/gen/models/`** - Regenerated after `make generate`

---

## 12. Design Recommendations

### Evaluation Filter Struct
A common base filter for all evaluation endpoints:

```go
type EvaluationFilter struct {
    TenantID           uuid.UUID
    EmployeeID         *uuid.UUID
    DepartmentID       *uuid.UUID
    StartDate          time.Time    // Required
    EndDate            time.Time    // Required
    ScopeType          model.DataScopeType
    ScopeDepartmentIDs []uuid.UUID
    ScopeEmployeeIDs   []uuid.UUID
    Limit              int
    Offset             int
}
```

### Per-Endpoint Extensions

**Daily Values Evaluation:**
- Additional filter: `include_no_bookings` (bool) - "Days without bookings" toggle
- Additional filter: `account_id` (uuid) - filter by time account
- For "no bookings" mode: LEFT JOIN daily_values with a generated date series, showing gaps

**Bookings Evaluation:**
- Additional filter: `booking_type_id` (uuid)
- Additional filter: `source` (string enum)
- Additional filter: `direction` (in/out)

**Terminal Bookings Evaluation:**
- Filter: `source = 'terminal'`
- Show both `original_time` and `edited_time` side by side

**Logs Evaluation:**
- Additional filter: `entity_type` (string) - booking, absence, monthly_value
- Additional filter: `action` (string enum)
- Additional filter: `user_id` (uuid)
- Show: user display name, timestamp, entity type, before/after values from changes JSONB

**Workflow History:**
- Filter: entity_type IN ('absence') AND action IN ('approve', 'reject', 'create')
- May also include monthly closing actions (action IN ('close', 'reopen'))
- Note: No dedicated workflow/approval table exists. This data is composed from audit_logs.

### Department Filtering
Department filter requires a JOIN:
```go
if filter.DepartmentID != nil {
    query = query.Joins("JOIN employees ON employees.id = <table>.employee_id").
        Where("employees.department_id = ?", *filter.DepartmentID)
}
```

### "Days Without Bookings" Logic
For the daily-values endpoint with `include_no_bookings=true`:
1. Generate date series between StartDate and EndDate
2. LEFT JOIN with daily_values table
3. Include rows where daily_values.id IS NULL (no calculation exists)
4. Or: query daily_values for the range, then fill missing dates in Go code

Simpler approach (in Go):
```go
// Generate all dates in range
dates := generateDateRange(startDate, endDate)
// Fetch existing daily values
existing := repo.GetByDateRange(...)
// Build map of existing values by (employeeID, date)
existingMap := buildMap(existing)
// For each employee+date, include even if not in existingMap
```

### Permission Mapping
Recommended: Use `reports.view` permission (already exists for monthly evaluations).

Route registration:
```go
func RegisterEvaluationRoutes(r chi.Router, h *EvaluationHandler, authz *middleware.AuthorizationMiddleware) {
    permViewReports := permissions.ID("reports.view").String()
    r.Route("/evaluations", func(r chi.Router) {
        if authz == nil {
            r.Get("/daily-values", h.ListDailyValues)
            r.Get("/bookings", h.ListBookings)
            r.Get("/terminal-bookings", h.ListTerminalBookings)
            r.Get("/logs", h.ListLogs)
            r.Get("/workflow-history", h.ListWorkflowHistory)
            return
        }
        r.With(authz.RequirePermission(permViewReports)).Get("/daily-values", h.ListDailyValues)
        r.With(authz.RequirePermission(permViewReports)).Get("/bookings", h.ListBookings)
        r.With(authz.RequirePermission(permViewReports)).Get("/terminal-bookings", h.ListTerminalBookings)
        r.With(authz.RequirePermission(permViewReports)).Get("/logs", h.ListLogs)
        r.With(authz.RequirePermission(permViewReports)).Get("/workflow-history", h.ListWorkflowHistory)
    })
}
```

### Handler Dependencies
```go
type EvaluationHandler struct {
    evaluationService *service.EvaluationService
    employeeService   *service.EmployeeService
}
```

### Service Dependencies
```go
type EvaluationService struct {
    bookingRepo    *repository.BookingRepository
    dailyValueRepo *repository.DailyValueRepository
    auditLogRepo   *repository.AuditLogRepository
    employeeRepo   *repository.EmployeeRepository
}
```

The evaluation service should compose queries from existing repositories rather than creating new tables. This is a read-only module.

### main.go Wiring
```go
// In main.go, after existing service/handler initialization:
evaluationService := service.NewEvaluationService(bookingRepo, dailyValueRepo, auditLogRepo, employeeRepo)
evaluationHandler := handler.NewEvaluationHandler(evaluationService, employeeService)

// In tenant-scoped route group:
handler.RegisterEvaluationRoutes(r, evaluationHandler, authzMiddleware)
```

---

## 13. Key Architectural Notes

1. **No new database tables needed** - All evaluation data can be composed from existing tables (bookings, daily_values, audit_logs, employees, departments).

2. **Read-only endpoints** - These are pure query/reporting endpoints. No CREATE/UPDATE/DELETE operations.

3. **Scope-based access control** - Must apply employee/department scope filtering to all queries, identical to existing booking/daily-value list endpoints.

4. **Multi-tenancy** - Every query must filter by tenant_id from the X-Tenant-ID header.

5. **Response models** - Use generated models from `gen/models/` where possible. New evaluation-specific response models should be defined in OpenAPI first, then generated.

6. **Terminal bookings vs regular bookings** - Terminal bookings are regular bookings with `source = 'terminal'`. The terminal-bookings endpoint is a filtered view showing both original_time and edited_time.

7. **Workflow history** - No dedicated workflow table exists. Workflow history must be composed from audit_logs filtering by relevant entity_types and actions (absence approvals, month closings, etc.).

8. **Pagination** - Use PaginationMeta pattern (total, limit, has_more) consistent with AuditLogList/DailyValueList.

9. **Date range is required** - All evaluation endpoints should require from/to date parameters to prevent unbounded queries.

10. **Department filter implementation** - Requires JOIN with employees table to access department_id. The existing scope-based filtering already handles this pattern.
