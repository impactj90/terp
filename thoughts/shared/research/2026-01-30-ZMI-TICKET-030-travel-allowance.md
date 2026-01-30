# Research: ZMI-TICKET-030 - Travel Allowance (ZMI Ausloese)

## 1. Ticket Summary

**Ticket:** ZMI-TICKET-030
**Source file:** `thoughts/shared/tickets/ZMI-TICKET-030-travel-allowance-ausloese.md`
**Status:** Proposed | **Priority:** P3

### Goal
Implement travel allowance (per diem) configuration and calculation rules.

### Scope
- **In scope:** Data model and calculation configuration per ZMI manual section 10.14.
- **Out of scope:** Full behavior until detailed Ausloese documentation is available.

### Requirements Breakdown

**Data model (initial):**
- Local travel (Nahmontage) rules: distance ranges, duration thresholds, tax-free/taxable amounts.
- Extended travel (Fernmontage) rules: arrival/departure day rates, intermediate day rates, three-month rule.
- Calculation options: per booking vs per day; distance selection rules.

**API / OpenAPI:**
- CRUD travel allowance rules
- Calculate allowance preview for a trip
- OpenAPI must document rule fields and preview outputs.

**Acceptance criteria:**
- Rules can be configured via API.
- Preview calculation returns expected values for simple scenarios.

**Test cases:**
- Local travel rule preview: input trip duration and distance within configured range; expected preview returns correct tax-free/taxable amounts.

**Dependencies:**
- Employee master data (ZMI-TICKET-004) - already implemented.

---

## 2. Domain Knowledge from ZMI Manual

### Section 10.14 - Travel Allowance (Aufwandsentschaedigung)

Source: `impl_plan/zmi-docs/07-system-settings.md` (lines 158-187)

ZMI Ausloese module settings for per diem calculations.

#### 10.14.1 Local Travel (Nahmontage)

Same-day trips (start and end on same day):

| Setting | Description |
|---------|-------------|
| **Gueltigkeitszeitraum** | Validity period |
| **Kilometer** | Distance ranges |
| **Dauer** | Duration thresholds |
| **Steuerfrei** | Tax-free amount |
| **Steuerpflichtig** | Taxable amount |

Calculation Options:
- Per booking or per day
- Which distance for multiple stops

#### 10.14.2 Extended Travel (Fernmontage)

Multi-day trips (different start and end dates):

| Setting | Description |
|---------|-------------|
| **An-/Abreisetag** | Arrival/departure day rates |
| **Tage dazwischen** | Rates for days between |
| **Dreimonatsberechnung** | 3-month rule (same location) |

### Section 10.18 - Employment Type connection

Source: `impl_plan/zmi-docs/07-system-settings.md` (line 250)

Employment types can include: "For ZMI Ausloese: Day net or travel booking basis" -- indicating that the employment type model may need a field to select the Ausloese calculation basis.

### Section 4.22 - Personnel Master Travel Tab

Source: `impl_plan/zmi-docs/03-personnel-master.md` (lines 315-317)

"ZMI Ausloese module: View and correct business trips."

This is a read-only view in the personnel master for employees to see/correct their business trips.

### Manual Reference File

Source: `thoughts/shared/reference/zmi-calculation-manual-reference.md`

No explicit travel allowance / Ausloese section found in the main calculation manual reference. The search for keywords (Ausloese, travel allowance, per diem, Nahmontage, Fernmontage, Reise, Spesen) in the reference file yielded no relevant matches. The domain knowledge is primarily found in the system settings documentation (`impl_plan/zmi-docs/07-system-settings.md`).

---

## 3. Codebase Architecture Findings

### 3.1 Clean Architecture Layers

The codebase follows a four-layer architecture. Each CRUD resource is implemented across four files:

| Layer | Directory | Purpose | Example (Vehicle) |
|-------|-----------|---------|-------------------|
| Model | `apps/api/internal/model/` | GORM domain structs | `vehicle.go` |
| Repository | `apps/api/internal/repository/` | Data access (GORM queries) | `vehicle.go` |
| Service | `apps/api/internal/service/` | Business logic, validation | `vehicle.go` |
| Handler | `apps/api/internal/handler/` | HTTP handlers, response mapping | `vehicle.go` |

### 3.2 Model Layer Pattern

**File:** `apps/api/internal/model/vehicle.go`

```go
type Vehicle struct {
    ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID     uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
    Code         string    `gorm:"type:varchar(50);not null" json:"code"`
    Name         string    `gorm:"type:varchar(255);not null" json:"name"`
    Description  string    `gorm:"type:text" json:"description,omitempty"`
    // ... domain-specific fields
    IsActive     bool      `gorm:"default:true" json:"is_active"`
    SortOrder    int       `gorm:"default:0" json:"sort_order"`
    CreatedAt    time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt    time.Time `gorm:"default:now()" json:"updated_at"`
}

func (Vehicle) TableName() string {
    return "vehicles"
}
```

Key conventions:
- UUID primary keys with `gen_random_uuid()` default
- `TenantID` for multi-tenancy (type uuid, not null, indexed)
- `Code` and `Name` as standard identifier fields
- `IsActive` boolean flag
- `SortOrder` integer for ordering
- `CreatedAt`/`UpdatedAt` timestamps
- `TableName()` method mapping to snake_case plural table name
- Uses `github.com/google/uuid` for UUIDs
- Uses `github.com/shopspring/decimal` for precise numeric values (see `CalculationRule` model)

For models with domain calculation logic, methods can be added directly (see `CalculationRule.Calculate()` at `apps/api/internal/model/calculationrule.go:38`).

### 3.3 Repository Layer Pattern

**File:** `apps/api/internal/repository/vehicle.go`

```go
type VehicleRepository struct {
    db *DB
}

func NewVehicleRepository(db *DB) *VehicleRepository {
    return &VehicleRepository{db: db}
}
```

Standard CRUD methods:
- `Create(ctx, *model.X) error`
- `GetByID(ctx, uuid.UUID) (*model.X, error)`
- `GetByCode(ctx, tenantID uuid.UUID, code string) (*model.X, error)` -- for code uniqueness
- `List(ctx, tenantID uuid.UUID) ([]model.X, error)` -- tenant-scoped listing
- `Update(ctx, *model.X) error`
- `Delete(ctx, uuid.UUID) error`

Error handling pattern: `errors.Is(err, gorm.ErrRecordNotFound)` returns domain error.
List ordering: `Order("sort_order ASC, code ASC")`.

### 3.4 Service Layer Pattern

**File:** `apps/api/internal/service/vehicle.go`

```go
// Service-local error definitions
var (
    ErrVehicleNotFound     = errors.New("vehicle not found")
    ErrVehicleCodeRequired = errors.New("vehicle code is required")
    ErrVehicleNameRequired = errors.New("vehicle name is required")
    ErrVehicleCodeExists   = errors.New("vehicle code already exists for this tenant")
)

// Repository interface (service-local, not exported)
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
```

Key conventions:
- Repository interfaces defined in service file (unexported, lowercase)
- Error variables at top of file
- `CreateXInput` / `UpdateXInput` structs for validated input
- Validation: `strings.TrimSpace()` on text fields, code uniqueness check
- Update uses pointer fields (`*string`, `*bool`) for partial updates

### 3.5 Handler Layer Pattern

**File:** `apps/api/internal/handler/vehicle.go`

```go
type VehicleHandler struct {
    svc *service.VehicleService
}

func NewVehicleHandler(svc *service.VehicleService) *VehicleHandler { ... }
```

Key conventions:
- Decode request: `json.NewDecoder(r.Body).Decode(&req)` using generated model
- Validate request: `req.Validate(nil)` (from go-swagger generated models)
- Get tenant: `middleware.TenantFromContext(r.Context())`
- Get path param: `chi.URLParam(r, "id")` then `uuid.Parse()`
- Response mapping: `xToResponse(*model.X) *models.X` using strfmt types
- List mapping: `xListToResponse([]model.X) models.XList`
- Error mapping: `handleXError(w, err)` with switch on service errors
- `respondJSON(w, status, data)` / `respondError(w, status, message)` from `response.go`

### 3.6 Route Registration Pattern

**File:** `apps/api/internal/handler/routes.go`

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

Convention: Each resource has a `RegisterXRoutes` function. The `authz == nil` branch handles the no-authz case for testing. Permission IDs come from `permissions.ID("resource.action")`.

### 3.7 Preview/Calculation Endpoint Pattern

Two existing preview endpoints provide the pattern:

**1. Vacation Entitlement Preview**
- Endpoint: `POST /vacation-entitlement/preview`
- Handler: `apps/api/internal/handler/vacation.go` - `PreviewEntitlement()`
- Service: `apps/api/internal/service/vacation.go`
- Registration: `RegisterVacationEntitlementRoutes()` in `routes.go` (line 877)
- Standalone route registration (not nested in r.Route group)

**2. Vacation Carryover Preview**
- Endpoint: `POST /vacation-carryover/preview`
- Handler: `apps/api/internal/handler/vacationcarryover.go` - `PreviewCarryover()`
- Service: `apps/api/internal/service/vacationcarryover.go`
- Calculation: `apps/api/internal/calculation/carryover.go` - pure function `CalculateCarryoverWithCapping()`
- Registration: `RegisterVacationCarryoverRoutes()` in `routes.go` (line 867)

**Preview pattern:**
1. Request model: `XPreviewRequest` with required input (employee_id, year, etc.)
2. Response model: `XPreview` with detailed breakdown of calculation
3. Service: aggregates data from multiple repositories, builds calculation input
4. Calculation: pure function in `apps/api/internal/calculation/` package -- no DB dependencies
5. Handler: maps service result to generated response model
6. Route: `POST /x/preview` as standalone route

### 3.8 Calculation Package Pattern

**Directory:** `apps/api/internal/calculation/`

Pure calculation functions with no database or HTTP dependencies. Key pattern:

```go
// Input struct
type CarryoverInput struct { ... }

// Output struct
type CarryoverOutput struct { ... }

// Pure function
func CalculateCarryoverWithCapping(input CarryoverInput) CarryoverOutput { ... }
```

Existing calculation files: `capping.go`, `carryover.go`, `vacation.go`, `breaks.go`, `shift.go`, `surcharge.go`, `rounding.go`, `monthly.go`, `tolerance.go`, `pairing.go`, `calculator.go`, `types.go`, `errors.go`.

All use `github.com/shopspring/decimal` for precise arithmetic.

### 3.9 Permissions Pattern

**File:** `apps/api/internal/permissions/permissions.go`

Each resource registers permissions as entries in `allPermissions` slice:

```go
{ID: permissionID("vehicle_data.manage"), Resource: "vehicle_data", Action: "manage", Description: "Manage vehicles, routes, and trip records"},
```

Convention: `{resource}.{action}` format for permission keys. Single "manage" permission for CRUD resources, or granular permissions (view/create/update/delete) for sensitive resources.

### 3.10 Wiring in main.go

**File:** `apps/api/cmd/server/main.go`

Wiring order:
1. Initialize repository: `repo := repository.NewXRepository(db)`
2. Initialize service: `svc := service.NewXService(repo)`
3. Initialize handler: `handler := handler.NewXHandler(svc)`
4. Register routes: `handler.RegisterXRoutes(r, xHandler, authzMiddleware)` inside the tenant-scoped group

Vehicle data wiring example (lines 323-334):
```go
vehicleRepo := repository.NewVehicleRepository(db)
vehicleService := service.NewVehicleService(vehicleRepo)
vehicleHandler := handler.NewVehicleHandler(vehicleService)

vehicleRouteRepo := repository.NewVehicleRouteRepository(db)
vehicleRouteService := service.NewVehicleRouteService(vehicleRouteRepo)
vehicleRouteHandler := handler.NewVehicleRouteHandler(vehicleRouteService)

tripRecordRepo := repository.NewTripRecordRepository(db)
tripRecordService := service.NewTripRecordService(tripRecordRepo)
tripRecordHandler := handler.NewTripRecordHandler(tripRecordService)
```

Route registration (lines 495-497):
```go
handler.RegisterVehicleRoutes(r, vehicleHandler, authzMiddleware)
handler.RegisterVehicleRouteRoutes(r, vehicleRouteHandler, authzMiddleware)
handler.RegisterTripRecordRoutes(r, tripRecordHandler, authzMiddleware)
```

---

## 4. OpenAPI Spec Organization

### 4.1 Multi-file Structure

- Root spec: `api/openapi.yaml` (Swagger 2.0)
- Path files: `api/paths/{resource}.yaml` -- one file per domain area
- Schema files: `api/schemas/{resource}.yaml` -- one file per domain area
- Response files: `api/responses/errors.yaml`

### 4.2 Root Spec Registration

Paths section (from `api/openapi.yaml`, e.g. lines 696-712):
```yaml
  # Vehicles
  /vehicles:
    $ref: 'paths/vehicles.yaml#/~1vehicles'
  /vehicles/{id}:
    $ref: 'paths/vehicles.yaml#/~1vehicles~1{id}'
```

Definitions section (from `api/openapi.yaml`, e.g. lines 1445-1473):
```yaml
  # Vehicles
  Vehicle:
    $ref: 'schemas/vehicles.yaml#/Vehicle'
  CreateVehicleRequest:
    $ref: 'schemas/vehicles.yaml#/CreateVehicleRequest'
  UpdateVehicleRequest:
    $ref: 'schemas/vehicles.yaml#/UpdateVehicleRequest'
  VehicleList:
    $ref: 'schemas/vehicles.yaml#/VehicleList'
```

Tags section (from `api/openapi.yaml`, e.g. lines 160-165):
```yaml
  - name: Vehicles
    description: Vehicle data management (placeholder)
```

### 4.3 Schema Pattern

**File:** `api/schemas/vehicles.yaml`

Each schema file defines:
- Main entity: `Vehicle` (response model, all fields)
- Create request: `CreateVehicleRequest` (required fields, validation constraints)
- Update request: `UpdateVehicleRequest` (optional fields, no required section)
- List wrapper: `VehicleList` with `data` array

Standard field types:
- UUID: `type: string, format: uuid`
- Date: `type: string, format: date`
- DateTime: `type: string, format: date-time`
- Money/decimal: `type: number, format: double`
- Nullable: `x-nullable: true`

### 4.4 Path Pattern

**File:** `api/paths/vehicles.yaml`

Each path file defines routes with:
- Tags for grouping
- Summary and description
- operationId (camelCase)
- Parameters (path params, body)
- Responses with schema refs

### 4.5 Bundle and Generate

```bash
make swagger-bundle   # Bundle into api/openapi.bundled.yaml
make generate         # Generate Go models in apps/api/gen/models/
```

The Makefile (line 109):
```
swagger generate model -f api/openapi.bundled.yaml -t apps/api/gen --model-package=models
```

Generated models go to `apps/api/gen/models/` and are used in handlers for request/response payloads.

---

## 5. Migration Pattern

### 5.1 File Naming

Latest migration: `000074_create_vehicle_data.up.sql` / `000074_create_vehicle_data.down.sql`

**Next migration number: 000075**

Convention: `{number}_{description}.up.sql` / `{number}_{description}.down.sql`

Create with: `make migrate-create name=create_travel_allowance`

### 5.2 Up Migration Pattern

**File:** `db/migrations/000074_create_vehicle_data.up.sql`

```sql
-- Table comment
CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    -- domain-specific columns --
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_vehicles_tenant ON vehicles(tenant_id);

CREATE TRIGGER update_vehicles_updated_at
    BEFORE UPDATE ON vehicles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE vehicles IS 'description';
```

Key conventions:
- UUID PKs with `gen_random_uuid()`
- `tenant_id` with FK to `tenants(id) ON DELETE CASCADE`
- `UNIQUE(tenant_id, code)` for code uniqueness per tenant
- Index on `tenant_id`
- `updated_at` trigger using `update_updated_at_column()` function
- `COMMENT ON TABLE` for documentation
- Multiple related tables in single migration file

### 5.3 Down Migration Pattern

**File:** `db/migrations/000074_create_vehicle_data.down.sql`

```sql
DROP TABLE IF EXISTS trip_records;
DROP TABLE IF EXISTS vehicle_routes;
DROP TABLE IF EXISTS vehicles;
```

Drop in reverse dependency order. Uses `IF EXISTS` for safety.

---

## 6. Existing Patterns to Follow

### 6.1 File Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Model | `apps/api/internal/model/{entity}.go` | `vehicle.go` |
| Repository | `apps/api/internal/repository/{entity}.go` | `vehicle.go` |
| Service | `apps/api/internal/service/{entity}.go` | `vehicle.go` |
| Handler | `apps/api/internal/handler/{entity}.go` | `vehicle.go` |
| Calculation | `apps/api/internal/calculation/{domain}.go` | `carryover.go` |
| OpenAPI schema | `api/schemas/{entity}.yaml` | `vehicles.yaml` |
| OpenAPI paths | `api/paths/{entity}.yaml` | `vehicles.yaml` |
| Migration | `db/migrations/{number}_{description}.{up|down}.sql` | `000074_create_vehicle_data.up.sql` |

### 6.2 Multi-entity Features

The vehicle data feature (ZMI-TICKET-029) shows the pattern for features with multiple related entities:

- **Single migration** creating all related tables (vehicles, vehicle_routes, trip_records)
- **Separate files per entity** in model/, repository/, service/, handler/ layers
- **Separate schema/path files** per entity OR grouped into a single file (vehicles.yaml contains Vehicle, VehicleRoute, and TripRecord schemas)
- **Shared permission** for related entities (`vehicle_data.manage` for all three)
- **Independent wiring** in main.go (each entity gets its own repo/service/handler chain)

### 6.3 Error Handling

```go
// Service errors as package-level variables
var (
    ErrXNotFound     = errors.New("x not found")
    ErrXCodeRequired = errors.New("x code is required")
    ErrXCodeExists   = errors.New("x code already exists for this tenant")
)

// Handler error mapping
func handleXError(w http.ResponseWriter, err error) {
    switch err {
    case service.ErrXNotFound:
        respondError(w, http.StatusNotFound, "X not found")
    case service.ErrXCodeRequired:
        respondError(w, http.StatusBadRequest, "X code is required")
    case service.ErrXCodeExists:
        respondError(w, http.StatusConflict, "An X with this code already exists")
    default:
        respondError(w, http.StatusInternalServerError, "Internal server error")
    }
}
```

### 6.4 Multi-tenancy

- All tables include `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
- All list queries filter by tenant: `Where("tenant_id = ?", tenantID)`
- Tenant ID extracted in handler: `middleware.TenantFromContext(r.Context())`
- Uniqueness constraints are tenant-scoped: `UNIQUE(tenant_id, code)`

### 6.5 Generated Model Usage

Handlers use generated models from `apps/api/gen/models/` for:
- Request payloads: `var req models.CreateVehicleRequest`
- Response payloads: mapped from domain model to generated model
- Validation: `req.Validate(nil)`

The generated models use `strfmt.UUID`, `strfmt.DateTime`, `strfmt.Date` for formatted types.

---

## 7. Related Existing Entities

### 7.1 Employment Type (potential dependency)

**File:** `apps/api/internal/model/employmenttype.go`

The employment type model currently has:
```go
type EmploymentType struct {
    ID                  uuid.UUID
    TenantID            uuid.UUID
    Code                string
    Name                string
    DefaultWeeklyHours  decimal.Decimal
    IsActive            bool
    VacationCalcGroupID *uuid.UUID
    // ... timestamps
}
```

Per the ZMI manual (section 10.18, line 250), employment types should include an Ausloese calculation basis field ("Day net or travel booking basis"). This field does not currently exist in the model.

### 7.2 Vehicle Routes (existing related entity)

**File:** `apps/api/internal/model/vehicle_route.go`

Vehicle routes already exist with a `distance_km` field. Travel allowance rules may reference distance ranges that could relate to vehicle routes.

### 7.3 Calculation Rule (pattern precedent)

**File:** `apps/api/internal/model/calculationrule.go`

The CalculationRule model shows the pattern for rules with calculation logic:
- Domain-specific fields (Code, Name, AccountID, Value, Factor)
- Active flag
- `Calculate()` method on the model for simple logic
- Service handles validation and CRUD

---

## 8. Open Questions and Gaps

### 8.1 Insufficient Domain Documentation

The ticket explicitly states: "Out of scope: Full behavior until detailed Ausloese documentation is available." The ZMI manual sections found (10.14.1, 10.14.2) provide high-level field descriptions but lack:

- Exact data types and ranges for distance ranges and duration thresholds
- How validity periods overlap or supersede each other
- The exact algorithm for the three-month rule (Dreimonatsberechnung) for Fernmontage
- How "per booking vs per day" calculation option works in detail
- How "which distance for multiple stops" selection rule works
- The relationship between Ausloese rules and employment type configuration
- Whether rules are tenant-scoped or global
- Whether there are rule groups similar to vacation calculation groups

### 8.2 Data Model Ambiguities

- **Local travel rule structure:** Is it a single rule with ranges, or multiple rule entries for different distance/duration combinations?
- **Extended travel rule structure:** How do arrival/departure day rates relate to intermediate day rates? Is it one rule set or separate rules?
- **Validity periods:** How are Gueltigkeitszeitraum (validity periods) represented? Date ranges? Effective dates?
- **Tax amounts:** Are these fixed amounts per rule, or do they vary by other criteria?

### 8.3 Employment Type Integration

The ZMI manual mentions employment types should have an Ausloese basis setting ("Day net or travel booking basis"). The current `EmploymentType` model at `apps/api/internal/model/employmenttype.go` does not have this field. This suggests a potential migration to add a column to `employment_types`.

### 8.4 Preview Calculation Dependencies

The preview endpoint needs to calculate allowance for a trip. This requires:
- Trip details (dates, duration, distance)
- Applicable rule set (local or extended)
- Rule matching logic (distance/duration ranges)
- Tax-free and taxable amount calculation

It is unclear whether the preview should accept raw trip parameters or reference an existing trip record from the vehicle data module.

### 8.5 No Existing Travel/Ausloese Code

Search results confirm there is no existing travel allowance implementation in the codebase. The only travel-related code is:
- Vehicle routes with `distance_km` field
- Trip records with trip dates and mileage
- A "TRAVEL" account code in dev seed data (`apps/api/internal/auth/devaccounts.go:49`)

---

## 9. Dependencies and Prerequisites

### 9.1 Already Implemented
- Employee master data (ZMI-TICKET-004) -- employees exist with employment types
- Vehicle data (ZMI-TICKET-029) -- vehicles, routes, and trip records exist
- Calculation infrastructure -- `apps/api/internal/calculation/` package exists
- Permissions framework -- `apps/api/internal/permissions/permissions.go`
- Generated model pipeline -- `make swagger-bundle && make generate`

### 9.2 May Need Modification
- Employment type model: may need new field for Ausloese calculation basis
- Employment type migration: would need a new migration to add the column

### 9.3 New Artifacts Needed

**OpenAPI:**
- `api/schemas/travel-allowance.yaml` -- schema definitions
- `api/paths/travel-allowance.yaml` -- endpoint definitions
- Entries in `api/openapi.yaml` paths, definitions, and tags sections

**Go code:**
- `apps/api/internal/model/travel_allowance.go` -- domain models
- `apps/api/internal/repository/travel_allowance.go` -- data access
- `apps/api/internal/service/travel_allowance.go` -- business logic and CRUD
- `apps/api/internal/handler/travel_allowance.go` -- HTTP handlers
- `apps/api/internal/calculation/travel_allowance.go` -- pure calculation functions (optional, for preview)
- Route registration in `apps/api/internal/handler/routes.go`
- Permission entry in `apps/api/internal/permissions/permissions.go`
- Wiring in `apps/api/cmd/server/main.go`

**Migration:**
- `db/migrations/000075_create_travel_allowance.up.sql`
- `db/migrations/000075_create_travel_allowance.down.sql`
