# Research: ZMI-TICKET-017 - ZMI Auftrag Module (Order/Project Tracking)

Date: 2026-01-30

## 1. Ticket Summary

ZMI-TICKET-017 requires implementing the ZMI Auftrag (Order/Project) module for order-based time tracking. The scope includes:

- **Data model**: Order entity (code, name, status, mandant, customer, cost center, billing rates), order-to-employee assignments, order leader/sales assignments, and order booking rules (bookings reference an order + activity).
- **Business rules**: Default order from personnel master (Stammauftrag) used when day plan `no_booking_behavior` is set to `target_with_order`. Order calculations must integrate with daily and monthly values. Order export/analytics via data exchange and reports.
- **API endpoints**: CRUD orders, assign orders to employees, create order bookings with date range listing, order evaluation reports.
- **Dependencies**: ZMI-TICKET-004 (employee master), ZMI-TICKET-011 (booking ingest/edit), ZMI-TICKET-006 (day plan advanced rules).

## 2. Current Codebase Architecture

### 2.1 Project Structure

Go monorepo with `go.work` workspace:
- `apps/api/` -- Go backend (Chi router, GORM ORM, PostgreSQL)
- `api/` -- Multi-file OpenAPI spec (Swagger 2.0)
- `db/migrations/` -- SQL migrations (golang-migrate), currently 52 migrations (000001 through 000052)
- `apps/api/gen/models/` -- Go models generated from OpenAPI spec

Clean architecture layers in `apps/api/internal/`:
```
handler/    -> HTTP handlers (request parsing, response formatting)
service/    -> Business logic (validation, orchestration)
repository/ -> Data access (GORM queries)
model/      -> Domain models (GORM structs)
middleware/ -> Auth, tenant context injection
permissions/-> Permission definitions
```

### 2.2 Multi-tenancy Pattern

- `X-Tenant-ID` header required on tenant-scoped routes.
- `middleware/tenant.go` extracts and validates tenant from header, stores in context via `TenantContextKey`.
- `middleware.TenantFromContext(ctx)` used in handlers to retrieve tenant UUID.
- All tenant-scoped database tables have `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`.
- Unique constraints typically include `(tenant_id, code)` for code-bearing entities.

### 2.3 Route Registration Pattern

Routes defined in `apps/api/internal/handler/routes.go` as `Register*Routes(r chi.Router, h *Handler, authz *AuthorizationMiddleware)` functions.

Pattern:
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

Routes are called in `apps/api/cmd/server/main.go` inside the tenant-scoped middleware group:
```go
r.Group(func(r chi.Router) {
    r.Use(tenantMiddleware.RequireTenant)
    handler.RegisterXxxRoutes(r, xxxHandler, authzMiddleware)
})
```

### 2.4 Wiring Pattern in main.go

In `cmd/server/main.go`, each entity follows this wiring sequence:
1. Repository: `xxxRepo := repository.NewXxxRepository(db)`
2. Service: `xxxService := service.NewXxxService(xxxRepo, ...dependencies)`
3. Handler: `xxxHandler := handler.NewXxxHandler(xxxService)`
4. Route registration: `handler.RegisterXxxRoutes(r, xxxHandler, authzMiddleware)`

## 3. Existing Model Patterns

### 3.1 Base Entity Pattern (CostCenter example)

File: `apps/api/internal/model/costcenter.go`
```go
type CostCenter struct {
    ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
    Code        string    `gorm:"type:varchar(50);not null" json:"code"`
    Name        string    `gorm:"type:varchar(255);not null" json:"name"`
    Description string    `gorm:"type:text" json:"description,omitempty"`
    IsActive    bool      `json:"is_active"`
    CreatedAt   time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt   time.Time `gorm:"default:now()" json:"updated_at"`
}

func (CostCenter) TableName() string {
    return "cost_centers"
}
```

All tenant-scoped models have: `ID`, `TenantID`, `Code`, `Name`, `IsActive`, `CreatedAt`, `UpdatedAt` plus a `TableName()` method.

### 3.2 Group/Assignment Pattern (EmployeeGroup, ActivityGroup)

File: `apps/api/internal/model/group.go`
```go
type EmployeeGroup struct {
    ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
    Code        string    `gorm:"type:varchar(50);not null" json:"code"`
    Name        string    `gorm:"type:varchar(255);not null" json:"name"`
    Description string    `gorm:"type:text" json:"description,omitempty"`
    IsActive    bool      `gorm:"default:true" json:"is_active"`
    CreatedAt   time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt   time.Time `gorm:"default:now()" json:"updated_at"`
}
```

Employee links to groups via FK fields:
```go
EmployeeGroupID *uuid.UUID `gorm:"type:uuid;index" json:"employee_group_id,omitempty"`
WorkflowGroupID *uuid.UUID `gorm:"type:uuid;index" json:"workflow_group_id,omitempty"`
ActivityGroupID *uuid.UUID `gorm:"type:uuid;index" json:"activity_group_id,omitempty"`
```

### 3.3 Booking Model

File: `apps/api/internal/model/booking.go`
```go
type Booking struct {
    ID            uuid.UUID     // primary key
    TenantID      uuid.UUID     // tenant FK
    EmployeeID    uuid.UUID     // employee FK
    BookingDate   time.Time     // date
    BookingTypeID uuid.UUID     // booking type FK
    OriginalTime  int           // minutes from midnight
    EditedTime    int           // minutes from midnight
    CalculatedTime *int         // after tolerance/rounding
    PairID        *uuid.UUID    // paired booking
    Source        BookingSource // web, terminal, api, import, correction
    TerminalID    *uuid.UUID
    Notes         string
    CreatedAt, UpdatedAt time.Time
    CreatedBy, UpdatedBy *uuid.UUID
    // Relations
    Employee    *Employee
    BookingType *BookingType
    Pair        *Booking
}
```

Note: The booking model currently has no order or activity FK fields.

### 3.4 Employee Model

File: `apps/api/internal/model/employee.go`

Key fields relevant to orders:
- `CostCenterID *uuid.UUID` -- existing FK to cost centers
- `EmployeeGroupID *uuid.UUID` -- FK to employee_groups
- `WorkflowGroupID *uuid.UUID` -- FK to workflow_groups
- `ActivityGroupID *uuid.UUID` -- FK to activity_groups

**Missing**: No `DefaultOrderID` (Stammauftrag) or `DefaultActivityID` (Stammtaetigkeit) fields exist in the employee model.

### 3.5 DayPlan Model (NoBookingBehavior)

File: `apps/api/internal/model/dayplan.go`
```go
type NoBookingBehavior string
const (
    NoBookingError            NoBookingBehavior = "error"
    NoBookingDeductTarget     NoBookingBehavior = "deduct_target"
    NoBookingVocationalSchool NoBookingBehavior = "vocational_school"
    NoBookingAdoptTarget      NoBookingBehavior = "adopt_target"
    NoBookingTargetWithOrder  NoBookingBehavior = "target_with_order"
)
```

The `target_with_order` enum value exists in the day plan model.

### 3.6 DailyValue Model

File: `apps/api/internal/model/dailyvalue.go`

Stores calculated daily results: `GrossTime`, `NetTime`, `TargetTime`, `Overtime`, `Undertime`, `BreakTime`, etc. No order-related fields currently.

### 3.7 MonthlyValue Model

File: `apps/api/internal/model/monthlyvalue.go`

Stores monthly aggregations: totals, flextime balances, absence summary, work summary. No order-related fields currently.

## 4. Existing Repository Patterns

### 4.1 DB Wrapper

File: `apps/api/internal/repository/db.go` -- wraps `*gorm.DB`, provides `NewDB(dsn)` and `Close()`.

### 4.2 Standard Repository Pattern (CostCenter example)

File: `apps/api/internal/repository/costcenter.go`
```go
type CostCenterRepository struct {
    db *DB
}
func NewCostCenterRepository(db *DB) *CostCenterRepository {
    return &CostCenterRepository{db: db}
}
func (r *CostCenterRepository) Create(ctx context.Context, cc *model.CostCenter) error { ... }
func (r *CostCenterRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.CostCenter, error) { ... }
func (r *CostCenterRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.CostCenter, error) { ... }
func (r *CostCenterRepository) Update(ctx context.Context, cc *model.CostCenter) error { ... }
func (r *CostCenterRepository) Delete(ctx context.Context, id uuid.UUID) error { ... }
func (r *CostCenterRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.CostCenter, error) { ... }
func (r *CostCenterRepository) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.CostCenter, error) { ... }
```

### 4.3 Booking Repository

File: `apps/api/internal/repository/booking.go`

Key methods: `Create`, `GetByID`, `GetByEmployeeAndDate`, `GetByEmployeeAndDateRange`, `UpdateCalculatedTimes`, `Update`, `Delete`, `List`.

## 5. Existing Service Patterns

### 5.1 Standard CRUD Service (CostCenter example)

File: `apps/api/internal/service/costcenter.go`
```go
type costCenterRepository interface {
    Create(ctx context.Context, cc *model.CostCenter) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.CostCenter, error)
    GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.CostCenter, error)
    Update(ctx context.Context, cc *model.CostCenter) error
    Delete(ctx context.Context, id uuid.UUID) error
    List(ctx context.Context, tenantID uuid.UUID) ([]model.CostCenter, error)
    ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.CostCenter, error)
}
type CostCenterService struct {
    costCenterRepo costCenterRepository
}
```

Services define their own repository interfaces (dependency inversion). Input structs are defined for Create/Update operations. Sentinel errors for domain validation (e.g., `ErrCostCenterNotFound`, `ErrCostCenterCodeExists`).

### 5.2 DailyCalcService (Calculation Integration)

File: `apps/api/internal/service/daily_calc.go`

The `target_with_order` case is handled at line 412:
```go
case model.NoBookingTargetWithOrder:
    // ZMI: Sollzeit mit Auftrag - credit target to default order
    // TODO: Create order booking entry when order module is available
    return &model.DailyValue{
        EmployeeID:   employeeID,
        ValueDate:    date,
        Status:       model.DailyValueStatusCalculated,
        TargetTime:   targetTime,
        NetTime:      targetTime,
        GrossTime:    targetTime,
        Warnings:     pq.StringArray{"NO_BOOKINGS_CREDITED", "ORDER_BOOKING_NOT_IMPLEMENTED"},
        CalculatedAt: &now,
    }, nil
```

This is a TODO stub that currently credits the target time without creating an order booking.

## 6. Existing Handler Patterns

### 6.1 Standard CRUD Handler (CostCenter example)

File: `apps/api/internal/handler/costcenter.go`

Pattern:
```go
type CostCenterHandler struct {
    costCenterService *service.CostCenterService
}
func NewCostCenterHandler(costCenterService *service.CostCenterService) *CostCenterHandler { ... }
func (h *CostCenterHandler) List(w http.ResponseWriter, r *http.Request) { ... }
func (h *CostCenterHandler) Get(w http.ResponseWriter, r *http.Request) { ... }
func (h *CostCenterHandler) Create(w http.ResponseWriter, r *http.Request) { ... }
func (h *CostCenterHandler) Update(w http.ResponseWriter, r *http.Request) { ... }
func (h *CostCenterHandler) Delete(w http.ResponseWriter, r *http.Request) { ... }
```

Handlers use:
- `middleware.TenantFromContext(r.Context())` for tenant ID
- `chi.URLParam(r, "id")` for path params
- `json.NewDecoder(r.Body).Decode(&req)` for request bodies with generated model types from `gen/models`
- `req.Validate(nil)` for validation (from go-swagger generated models)
- `respondJSON(w, status, data)` and `respondError(w, status, message)` helpers from `response.go`

### 6.2 Response Helpers

File: `apps/api/internal/handler/response.go`
- `respondJSON(w, status, data)` -- JSON response
- `respondError(w, status, message)` -- Error response
- Mapping functions from domain models to generated API response models (e.g., `mapUserToResponse`)

## 7. OpenAPI Spec Patterns

### 7.1 Structure

- Root: `api/openapi.yaml` (Swagger 2.0)
- Paths: `api/paths/*.yaml` (one file per domain)
- Schemas: `api/schemas/*.yaml` (one file per domain)
- Responses: `api/responses/errors.yaml`
- Bundled output: `api/openapi.bundled.yaml`

### 7.2 Schema File Pattern (cost-centers.yaml)

```yaml
CostCenter:
  type: object
  required: [id, tenant_id, name, code]
  properties:
    id: { type: string, format: uuid }
    tenant_id: { type: string, format: uuid }
    name: { type: string }
    code: { type: string }
    description: { type: string, x-nullable: true }
    is_active: { type: boolean }
    created_at: { type: string, format: date-time }
    updated_at: { type: string, format: date-time }

CreateCostCenterRequest:
  type: object
  required: [name, code]
  properties:
    name: { type: string, minLength: 1, maxLength: 255 }
    code: { type: string, minLength: 1, maxLength: 50 }
    description: { type: string }

CostCenterList:
  type: object
  required: [data]
  properties:
    data: { type: array, items: { $ref: '#/CostCenter' } }
```

### 7.3 Registration in openapi.yaml

Path references in `openapi.yaml`:
```yaml
paths:
  /cost-centers:
    $ref: 'paths/cost-centers.yaml#/~1cost-centers'
  /cost-centers/{id}:
    $ref: 'paths/cost-centers.yaml#/~1cost-centers~1{id}'

definitions:
  CostCenter:
    $ref: 'schemas/cost-centers.yaml#/CostCenter'
  CreateCostCenterRequest:
    $ref: 'schemas/cost-centers.yaml#/CreateCostCenterRequest'
```

Tags are defined at the top of `openapi.yaml`.

## 8. Migration Patterns

### 8.1 Naming Convention

Sequential numbering: `000NNN_description.up.sql` / `000NNN_description.down.sql`

Current latest: `000052_create_employee_capping_exceptions`

### 8.2 Table Creation Pattern (from vacation_capping_rules)

```sql
CREATE TABLE xxx (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    -- domain-specific fields --
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_xxx_tenant ON xxx(tenant_id);
CREATE INDEX idx_xxx_tenant_active ON xxx(tenant_id, is_active);

CREATE TRIGGER update_xxx_updated_at
    BEFORE UPDATE ON xxx
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE xxx IS 'Description';
```

### 8.3 Alter Table Pattern (from extend_employee_master_data)

```sql
ALTER TABLE employees
    ADD COLUMN new_field_id UUID REFERENCES other_table(id) ON DELETE SET NULL;

CREATE INDEX idx_employees_new_field ON employees(new_field_id);
COMMENT ON COLUMN employees.new_field IS 'Description';
```

## 9. Permission Registration

File: `apps/api/internal/permissions/permissions.go`

Permissions are defined as deterministic UUIDs using a namespace and SHA1:
```go
{ID: permissionID("xxx.manage"), Resource: "xxx", Action: "manage", Description: "Manage xxx"}
```

No order-related permissions exist currently.

## 10. Existing Order/Auftrag References

### 10.1 Code References Found

1. **Day plan model** (`model/dayplan.go:37`): `NoBookingTargetWithOrder NoBookingBehavior = "target_with_order"` -- the enum value exists.

2. **Daily calc service** (`service/daily_calc.go:412-424`): The `target_with_order` case has a TODO stub that credits target time and emits `ORDER_BOOKING_NOT_IMPLEMENTED` warning.

3. **Personnel master docs** (`impl_plan/zmi-docs/03-personnel-master.md:122`): Documents `Stammauftrag` (Default order) and `Stammtaetigkeit` (Default activity) as employee group fields.

4. **ZMI calculation manual** (`thoughts/shared/reference/zmi-calculation-manual-reference.md:878-879`): Section 8.3 describes "Sollstunden mit Stammauftrag" behavior where target time is automatically booked as order time when the employee has a default order in personnel master.

### 10.2 What Does NOT Exist

- No `Order` model, repository, service, or handler
- No `OrderAssignment` (employee-to-order link) model
- No `OrderBooking` (order time tracking) model
- No `DefaultOrderID` or `DefaultActivityID` fields on the Employee model
- No order-related OpenAPI schemas or paths
- No order-related database migrations
- No order-related permissions
- No order-related route registrations

## 11. Dependencies Status

### 11.1 ZMI-TICKET-004 -- Employee Master Data

**Status: Implemented**

The employee model includes extended personnel master data fields added in migration `000041_extend_employee_master_data`. This includes group FKs (`employee_group_id`, `workflow_group_id`, `activity_group_id`), tariff fields, personal data, and address fields. The employee CRUD handler, service, and repository are all in place.

However, the `Stammauftrag` (default order) and `Stammtaetigkeit` (default activity) fields documented in the ZMI personnel master (section 4.9 Groups tab) are **not yet implemented** on the employee model.

### 11.2 ZMI-TICKET-011 -- Booking Ingest/Edit Flow

**Status: Implemented**

The booking model (`model/booking.go`), repository (`repository/booking.go`), service (`service/booking.go`), and handler (`handler/booking.go`) are all implemented. CRUD operations, day view, pairing, and recalculation integration are in place.

The booking model currently has no order or activity FK fields.

### 11.3 ZMI-TICKET-006 -- Day Plan Advanced Rules

**Status: Implemented**

The day plan model includes `NoBookingBehavior` with the `target_with_order` enum value. The daily calc service has a stub for this behavior that issues an `ORDER_BOOKING_NOT_IMPLEMENTED` warning.

## 12. Key Patterns for Implementation

### 12.1 New Entity Creation Checklist

Based on existing patterns, creating the order module requires:

1. **Migration**: New SQL file in `db/migrations/` with sequential number (next would be `000053`). Uses the standard table creation pattern with `tenant_id` FK, unique constraints, indexes, triggers, comments.

2. **Model**: New Go file in `apps/api/internal/model/` with GORM struct, table name method, and any enums/helpers.

3. **Repository**: New Go file in `apps/api/internal/repository/` with struct wrapping `*DB`, constructor, and CRUD methods.

4. **Service**: New Go file in `apps/api/internal/service/` with interface for repository (dependency inversion), service struct, input types, sentinel errors, and business logic methods.

5. **Handler**: New Go file in `apps/api/internal/handler/` with handler struct, constructor, HTTP handler methods using generated models from `gen/models/`.

6. **OpenAPI spec**: New schema file in `api/schemas/` and path file in `api/paths/`. Register in `api/openapi.yaml` under paths and definitions. Add tag.

7. **Generated models**: Run `make swagger-bundle && make generate` after OpenAPI changes.

8. **Routes**: Add `Register*Routes` function in `apps/api/internal/handler/routes.go`.

9. **Permissions**: Add permission entry in `apps/api/internal/permissions/permissions.go`.

10. **Wiring**: Add repository, service, handler instantiation, and route registration in `apps/api/cmd/server/main.go`.

### 12.2 Entity Relationships to Implement

Based on the ticket requirements and ZMI reference:

- **Order** (new entity): code, name, status, tenant_id, customer, cost_center_id FK, billing rates
- **OrderAssignment** (new join entity): employee_id FK, order_id FK, role (leader/sales/worker), valid_from, valid_to
- **OrderBooking** (new entity or extension): employee_id, order_id, activity_id, booking_date, time_minutes -- links order time tracking to existing daily values
- **Employee extensions**: `default_order_id` (Stammauftrag), `default_activity_id` (Stammtaetigkeit) FK fields

### 12.3 Integration Points

- **DailyCalcService** (`service/daily_calc.go:412`): The `NoBookingTargetWithOrder` case needs to create an OrderBooking record using the employee's default order.
- **BookingService** (`service/booking.go`): May need to optionally accept order_id/activity_id when creating bookings.
- **MonthlyEvalService**: Order-based aggregations for reports.
- **Existing booking model**: May need optional `order_id` and `activity_id` FK fields.
