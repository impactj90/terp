# Research: ZMI-TICKET-031 - Plantafel (Shift Planning Board)

**Date**: 2026-01-30
**Ticket**: ZMI-TICKET-031

## 1. Ticket Requirements Summary

The ticket requires implementing a placeholder shift planning board (Plantafel) data model and API scaffolding. The scope is limited to placeholder APIs until full Plantafel documentation is available.

### Data model requirements (placeholder)
- Shift definition
- Shift assignment to employee and date range
- Qualification linkage

### API requirements
- CRUD for shifts
- Assign shifts to employees
- List shifts by date range

### Tests required
- Unit tests: shift assignment validation
- API tests: create and list shift assignments

### Dependencies
- Employee master data (ZMI-TICKET-004) -- already implemented

---

## 2. Existing Shift-Related Codebase State

### 2.1 Shift Detection in DayPlan Model (Already Exists)

The codebase already has shift detection fields built into the DayPlan model. These handle automatic day plan switching based on arrival/departure times. This is a distinct concept from the Plantafel (shift planning board), which is about manually assigning shifts to employees for date ranges.

**File**: `/home/tolga/projects/terp/apps/api/internal/model/dayplan.go` (lines 112-124)

```go
// ZMI: Schichterkennung - shift detection windows (minutes from midnight)
ShiftDetectArriveFrom *int `gorm:"type:int" json:"shift_detect_arrive_from,omitempty"`
ShiftDetectArriveTo   *int `gorm:"type:int" json:"shift_detect_arrive_to,omitempty"`
ShiftDetectDepartFrom *int `gorm:"type:int" json:"shift_detect_depart_from,omitempty"`
ShiftDetectDepartTo   *int `gorm:"type:int" json:"shift_detect_depart_to,omitempty"`

// ZMI: Alternative day plans for shift detection (up to 6)
ShiftAltPlan1 *uuid.UUID `gorm:"column:shift_alt_plan_1;type:uuid" json:"shift_alt_plan_1,omitempty"`
ShiftAltPlan2 *uuid.UUID `gorm:"column:shift_alt_plan_2;type:uuid" json:"shift_alt_plan_2,omitempty"`
ShiftAltPlan3 *uuid.UUID `gorm:"column:shift_alt_plan_3;type:uuid" json:"shift_alt_plan_3,omitempty"`
ShiftAltPlan4 *uuid.UUID `gorm:"column:shift_alt_plan_4;type:uuid" json:"shift_alt_plan_4,omitempty"`
ShiftAltPlan5 *uuid.UUID `gorm:"column:shift_alt_plan_5;type:uuid" json:"shift_alt_plan_5,omitempty"`
ShiftAltPlan6 *uuid.UUID `gorm:"column:shift_alt_plan_6;type:uuid" json:"shift_alt_plan_6,omitempty"`
```

Helper methods on DayPlan: `HasShiftDetection()` and `GetAlternativePlanIDs()`.

### 2.2 EmployeeDayPlan Model (Already Exists)

This model assigns a day plan to an employee for a specific date. It is the closest existing concept to a "shift assignment" but operates at the individual date level, not a date range.

**File**: `/home/tolga/projects/terp/apps/api/internal/model/employeedayplan.go`

```go
type EmployeeDayPlan struct {
    ID         uuid.UUID             `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID   uuid.UUID             `gorm:"type:uuid;not null;index" json:"tenant_id"`
    EmployeeID uuid.UUID             `gorm:"type:uuid;not null;index" json:"employee_id"`
    PlanDate   time.Time             `gorm:"type:date;not null" json:"plan_date"`
    DayPlanID  *uuid.UUID            `gorm:"type:uuid" json:"day_plan_id,omitempty"`
    Source     EmployeeDayPlanSource `gorm:"type:varchar(20);default:'tariff'" json:"source"`
    Notes      string                `gorm:"type:text" json:"notes,omitempty"`
    // ... timestamps, relations
}
```

Source values: `tariff`, `manual`, `holiday`.

### 2.3 WeekPlan Model (Already Exists)

Week plans combine day plans for each day of the week. They are assigned to employees via tariffs.

**File**: `/home/tolga/projects/terp/apps/api/internal/model/weekplan.go`

```go
type WeekPlan struct {
    ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
    Code        string    `gorm:"type:varchar(20);not null" json:"code"`
    Name        string    `gorm:"type:varchar(255);not null" json:"name"`
    MondayDayPlanID    *uuid.UUID // ... through SundayDayPlanID
    // ... timestamps, relations
}
```

### 2.4 Employee Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/employee.go`

The Employee model already has a `TariffID` field which links to tariffs (which contain week plans). No explicit shift planning board reference exists on the employee model.

### 2.5 No Existing "Shift" or "Plantafel" Models

There are no existing Go model files, migrations, OpenAPI specs, handlers, services, or repositories specifically named "shift" or "plantafel" in the codebase. This is a new feature to be scaffolded.

---

## 3. Existing Patterns for Placeholder Scaffolding

The most recent placeholder scaffolding examples come from ZMI-TICKET-028 (Access Control) and ZMI-TICKET-029/030 (Vehicle Data & Travel Allowance).

### 3.1 Model Pattern (Placeholder)

**File**: `/home/tolga/projects/terp/apps/api/internal/model/vehicle.go`

```go
// Vehicle represents a registered vehicle for mileage tracking (placeholder).
type Vehicle struct {
    ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID     uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
    Code         string    `gorm:"type:varchar(50);not null" json:"code"`
    Name         string    `gorm:"type:varchar(255);not null" json:"name"`
    Description  string    `gorm:"type:text" json:"description,omitempty"`
    // domain-specific fields...
    IsActive     bool      `gorm:"default:true" json:"is_active"`
    SortOrder    int       `gorm:"default:0" json:"sort_order"`
    CreatedAt    time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt    time.Time `gorm:"default:now()" json:"updated_at"`
}

func (Vehicle) TableName() string {
    return "vehicles"
}
```

**Assignment pattern** (employee-to-entity):

**File**: `/home/tolga/projects/terp/apps/api/internal/model/employee_access_assignment.go`

```go
type EmployeeAccessAssignment struct {
    ID              uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID        uuid.UUID  `gorm:"type:uuid;not null;index" json:"tenant_id"`
    EmployeeID      uuid.UUID  `gorm:"type:uuid;not null;index" json:"employee_id"`
    AccessProfileID uuid.UUID  `gorm:"type:uuid;not null;index" json:"access_profile_id"`
    ValidFrom       *time.Time `gorm:"type:date" json:"valid_from,omitempty"`
    ValidTo         *time.Time `gorm:"type:date" json:"valid_to,omitempty"`
    IsActive        bool       `gorm:"default:true" json:"is_active"`
    CreatedAt       time.Time  `gorm:"default:now()" json:"created_at"`
    UpdatedAt       time.Time  `gorm:"default:now()" json:"updated_at"`
    // Relations
    Employee      *Employee      `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
    AccessProfile *AccessProfile `gorm:"foreignKey:AccessProfileID" json:"access_profile,omitempty"`
}
```

### 3.2 Migration Pattern

**File**: `/home/tolga/projects/terp/db/migrations/000073_create_access_control.up.sql`

Pattern for placeholder tables:
```sql
-- Description with (placeholder) tag
CREATE TABLE table_name (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    -- domain-specific fields
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_table_name_tenant ON table_name(tenant_id);

CREATE TRIGGER update_table_name_updated_at
    BEFORE UPDATE ON table_name
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE table_name IS 'Description (placeholder - requires documentation)';
```

Down migration pattern:
```sql
DROP TABLE IF EXISTS child_table;
DROP TABLE IF EXISTS parent_table;
```

Next migration number: **000076** (the latest is 000075_create_travel_allowance).

### 3.3 Repository Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/vehicle.go`

```go
type VehicleRepository struct {
    db *DB
}

func NewVehicleRepository(db *DB) *VehicleRepository {
    return &VehicleRepository{db: db}
}

// Standard CRUD methods:
func (r *VehicleRepository) Create(ctx context.Context, v *model.Vehicle) error
func (r *VehicleRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Vehicle, error)
func (r *VehicleRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.Vehicle, error)
func (r *VehicleRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.Vehicle, error)
func (r *VehicleRepository) Update(ctx context.Context, v *model.Vehicle) error
func (r *VehicleRepository) Delete(ctx context.Context, id uuid.UUID) error
```

### 3.4 Service Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/service/vehicle.go`

```go
var (
    ErrVehicleNotFound     = errors.New("vehicle not found")
    ErrVehicleCodeRequired = errors.New("vehicle code is required")
    ErrVehicleNameRequired = errors.New("vehicle name is required")
    ErrVehicleCodeExists   = errors.New("vehicle code already exists for this tenant")
)

type vehicleRepository interface {
    Create(ctx context.Context, v *model.Vehicle) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.Vehicle, error)
    GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.Vehicle, error)
    List(ctx context.Context, tenantID uuid.UUID) ([]model.Vehicle, error)
    Update(ctx context.Context, v *model.Vehicle) error
    Delete(ctx context.Context, id uuid.UUID) error
}

type VehicleService struct {
    repo vehicleRepository
}

// Service input types:
type CreateVehicleInput struct { /* ... */ }
type UpdateVehicleInput struct { /* ... */ }
```

**Assignment service pattern** (with UUID validation):

**File**: `/home/tolga/projects/terp/apps/api/internal/service/employee_access_assignment.go`

```go
func (s *EmployeeAccessAssignmentService) Create(ctx context.Context, input CreateEmployeeAccessAssignmentInput) (*model.EmployeeAccessAssignment, error) {
    if input.EmployeeID == uuid.Nil {
        return nil, ErrEmployeeAccessAssignmentEmployeeRequired
    }
    if input.AccessProfileID == uuid.Nil {
        return nil, ErrEmployeeAccessAssignmentProfileRequired
    }
    // ... create and return
}
```

### 3.5 Handler Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/vehicle.go`

Pattern:
- `XxxHandler` struct with `svc` field
- `NewXxxHandler(svc)` constructor
- CRUD methods: `List`, `Get`, `Create`, `Update`, `Delete`
- `xxxToResponse(*model.Xxx) *models.Xxx` mapping function
- `xxxListToResponse([]model.Xxx) models.XxxList` mapping function
- `handleXxxError(w, err)` error mapping function
- Uses `gen/models` for request/response types
- Uses `middleware.TenantFromContext` for tenant ID
- Uses `chi.URLParam` for path params
- Uses `respondJSON` and `respondError` helpers

### 3.6 Route Registration Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/routes.go`

```go
func RegisterVehicleRoutes(r chi.Router, h *VehicleHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("vehicle_data.manage").String()
    r.Route("/vehicles", func(r chi.Router) {
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

### 3.7 main.go Wiring Pattern

**File**: `/home/tolga/projects/terp/apps/api/cmd/server/main.go`

The wiring follows this pattern (from access control, lines 310-321):

```go
// Initialize Access Control (Zutritt placeholder)
accessZoneRepo := repository.NewAccessZoneRepository(db)
accessZoneService := service.NewAccessZoneService(accessZoneRepo)
accessZoneHandler := handler.NewAccessZoneHandler(accessZoneService)
// ...repeated for each entity
```

Route registration in the tenant-scoped group (lines 508-510):
```go
handler.RegisterAccessZoneRoutes(r, accessZoneHandler, authzMiddleware)
handler.RegisterAccessProfileRoutes(r, accessProfileHandler, authzMiddleware)
handler.RegisterEmployeeAccessAssignmentRoutes(r, employeeAccessAssignmentHandler, authzMiddleware)
```

### 3.8 OpenAPI Spec Pattern

**Paths file** (`api/paths/vehicles.yaml`):
- Swagger 2.0 format
- Tags per resource
- CRUD endpoints: GET list, POST create, GET by ID, PATCH update, DELETE
- `$ref` to schemas file for request/response bodies
- `$ref` to `../responses/errors.yaml` for error responses
- Placeholder description noting documentation dependency

**Schemas file** (`api/schemas/vehicles.yaml`):
- Resource schema with `required` fields (id, tenant_id, code, name)
- `CreateXxxRequest` schema with `required` fields (code, name)
- `UpdateXxxRequest` schema with optional fields only
- `XxxList` schema with `data` array property
- `x-nullable: true` on optional fields

**Index file** (`api/openapi.yaml`):
- Tags section with description
- Paths section referencing path files
- Definitions section referencing schema files

### 3.9 Permission Registration Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/permissions/permissions.go`

```go
{ID: permissionID("access_control.manage"), Resource: "access_control", Action: "manage", Description: "Manage access zones, profiles, and employee assignments"},
{ID: permissionID("vehicle_data.manage"), Resource: "vehicle_data", Action: "manage", Description: "Manage vehicles, routes, and trip records"},
```

### 3.10 Test Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/service/employee_access_assignment_test.go`

- Uses `testutil.SetupTestDB(t)` for database setup
- Creates fixtures with helper function
- Tests cover: Create success, Create with optional fields, Create with empty required fields, GetByID success, GetByID not found, Update success, Delete success, Delete not found, List
- Uses `require.NoError` for must-succeed operations, `assert.ErrorIs` for error checks

---

## 4. ZMI Manual Reference Context

### 4.1 Section 10: Shift Detection (Schichterkennung) - Pages 48-49

**File**: `/home/tolga/projects/terp/thoughts/shared/reference/zmi-calculation-manual-reference.md`

Key points:
- Shift detection can be arrival-based or departure-based
- Up to 6 alternative day plans can be stored for shift detection
- Day plans define the working time specifications (fixed or flextime)
- Week plans combine day plans and are assigned to employees
- If no matching day plan is found, a correction assistant message is generated

This section describes automatic shift detection (Schichterkennung), which is different from the Plantafel (shift planning board). The Plantafel is about manually planning and assigning shifts to employees, while Schichterkennung is about automatic runtime detection.

### 4.2 Existing Shift Detection Implementation

**File**: `/home/tolga/projects/terp/thoughts/shared/research/2026-01-25-NOK-146-shift-detection-logic.md`

A full shift detection logic implementation has been researched and planned separately (NOK-146). This operates within the calculation pipeline and uses the DayPlan's shift detection fields. The Plantafel ticket is about the administrative planning interface, not the runtime detection.

---

## 5. Relationship Between Existing Concepts and Plantafel

| Concept | Existing? | How it Relates to Plantafel |
|---------|-----------|----------------------------|
| Day Plan | Yes (`model/dayplan.go`) | Defines shift time rules; a "shift" in Plantafel would reference or be based on day plans |
| Week Plan | Yes (`model/weekplan.go`) | Assigns day plans per weekday; Plantafel overrides this for specific date ranges |
| Employee Day Plan | Yes (`model/employeedayplan.go`) | Per-date assignment; Plantafel assignments would generate these records |
| Shift Detection | Yes (fields on DayPlan) | Runtime auto-detect; separate from manual Plantafel planning |
| Employee | Yes (`model/employee.go`) | Target of shift assignments |
| Tariff | Yes (`model/tariff.go`) | Contains week plan; Plantafel may override tariff-derived plans |
| Shift Definition | **No** | New entity needed for Plantafel |
| Shift Assignment | **No** | New entity needed for Plantafel |
| Qualification | **No** | New entity needed for Plantafel |

---

## 6. Files to Be Created (Based on Patterns)

### Models
- `/home/tolga/projects/terp/apps/api/internal/model/shift.go` -- Shift definition + ShiftAssignment

### Migration
- `/home/tolga/projects/terp/db/migrations/000076_create_shift_planning.up.sql`
- `/home/tolga/projects/terp/db/migrations/000076_create_shift_planning.down.sql`

### Repository
- `/home/tolga/projects/terp/apps/api/internal/repository/shift.go`
- `/home/tolga/projects/terp/apps/api/internal/repository/shift_assignment.go`

### Service
- `/home/tolga/projects/terp/apps/api/internal/service/shift.go`
- `/home/tolga/projects/terp/apps/api/internal/service/shift_assignment.go`
- `/home/tolga/projects/terp/apps/api/internal/service/shift_assignment_test.go`

### Handler
- `/home/tolga/projects/terp/apps/api/internal/handler/shift.go`
- `/home/tolga/projects/terp/apps/api/internal/handler/shift_assignment.go`

### OpenAPI
- `/home/tolga/projects/terp/api/paths/shift-planning.yaml`
- `/home/tolga/projects/terp/api/schemas/shift-planning.yaml`

### Files to Modify
- `/home/tolga/projects/terp/api/openapi.yaml` -- Add tags, paths, and definitions
- `/home/tolga/projects/terp/apps/api/internal/handler/routes.go` -- Add RegisterShiftRoutes, RegisterShiftAssignmentRoutes
- `/home/tolga/projects/terp/apps/api/cmd/server/main.go` -- Wire repos, services, handlers, register routes
- `/home/tolga/projects/terp/apps/api/internal/permissions/permissions.go` -- Add shift_planning.manage permission

---

## 7. Data Model Observations

Based on the ticket requirements and existing patterns:

### Shift Definition
- `shifts` table with tenant scoping
- Code + Name pattern (like vehicles, access zones)
- Links to an existing DayPlan (optional, for working time specs)
- Qualification text field (placeholder)
- Color field (for board display)
- Standard fields: is_active, sort_order, created_at, updated_at

### Shift Assignment
- `shift_assignments` table
- Links employee to shift for a date range
- Follows the `EmployeeAccessAssignment` pattern with ValidFrom/ValidTo
- Employee FK, Shift FK, TenantID
- Standard fields

### Qualification (Placeholder)
- The ticket mentions "qualification linkage" but no existing qualification model exists
- Can be added as a text field on the Shift model for now

---

## 8. Existing Generated Models (For Reference)

The `apps/api/gen/models/` directory contains go-swagger generated models from the OpenAPI spec. After adding new schemas and running `make generate`, new model files will be auto-generated. The handlers must use these generated models for request/response payloads per the project CLAUDE.md instructions.

---

## 9. Summary of Key Patterns to Follow

| Aspect | Pattern Source | Key File |
|--------|---------------|----------|
| Model struct | Vehicle, AccessProfile | `model/vehicle.go` |
| Assignment model | EmployeeAccessAssignment | `model/employee_access_assignment.go` |
| Migration SQL | Access control migration | `000073_create_access_control.up.sql` |
| Down migration | Vehicle down | `000074_create_vehicle_data.down.sql` |
| Repository | Vehicle repository | `repository/vehicle.go` |
| Service | Vehicle service | `service/vehicle.go` |
| Assignment service | EmployeeAccessAssignment service | `service/employee_access_assignment.go` |
| Service tests | EmployeeAccessAssignment tests | `service/employee_access_assignment_test.go` |
| Handler | Vehicle handler | `handler/vehicle.go` |
| Assignment handler | EmployeeAccessAssignment handler | `handler/employee_access_assignment.go` |
| Route registration | Vehicle routes | `handler/routes.go` (line 1358) |
| main.go wiring | Access control block | `cmd/server/main.go` (lines 310-321) |
| OpenAPI paths | Vehicles paths | `api/paths/vehicles.yaml` |
| OpenAPI schemas | Vehicles schemas | `api/schemas/vehicles.yaml` |
| OpenAPI index | Vehicle entries | `api/openapi.yaml` (lines 704-720) |
| Permissions | Vehicle/Access control | `permissions/permissions.go` (lines 76-78) |
