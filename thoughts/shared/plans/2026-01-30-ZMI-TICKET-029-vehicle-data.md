# Implementation Plan: ZMI-TICKET-029 - Vehicle Data Module (Fahrzeugdatenerfassung)

**Ticket**: ZMI-TICKET-029
**Type**: Placeholder module scaffolding
**Dependencies**: Mandant master data (ZMI-TICKET-001) -- tenants table must exist
**Template**: Access Control module (ZMI-TICKET-028) -- most recent placeholder module

---

## Overview

This plan implements a placeholder vehicle data module with three entities:
- **Vehicle** -- registered vehicles for the tenant
- **VehicleRoute** -- defined routes/destinations
- **TripRecord** -- individual trip mileage logs linking a vehicle and a route

All descriptions and comments are marked as placeholder requiring separate vehicle documentation.

---

## Phase 1: Database Migration

**Goal**: Create the three tables with proper multi-tenancy support.

### Files to create

#### `db/migrations/000074_create_vehicle_data.up.sql`

```sql
-- Vehicles: registered vehicles for mileage tracking (placeholder)
CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    license_plate VARCHAR(20),
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

COMMENT ON TABLE vehicles IS 'Vehicle data (placeholder - requires separate vehicle documentation for full implementation)';

-- Vehicle routes: defined travel routes (placeholder)
CREATE TABLE vehicle_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    distance_km NUMERIC(10,2),
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_vehicle_routes_tenant ON vehicle_routes(tenant_id);

CREATE TRIGGER update_vehicle_routes_updated_at
    BEFORE UPDATE ON vehicle_routes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE vehicle_routes IS 'Vehicle routes (placeholder - requires separate vehicle documentation for full implementation)';

-- Trip records: individual trip mileage logs (placeholder)
CREATE TABLE trip_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    route_id UUID REFERENCES vehicle_routes(id) ON DELETE SET NULL,
    trip_date DATE NOT NULL,
    start_mileage NUMERIC(10,1),
    end_mileage NUMERIC(10,1),
    distance_km NUMERIC(10,2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trip_records_tenant ON trip_records(tenant_id);
CREATE INDEX idx_trip_records_vehicle ON trip_records(vehicle_id);
CREATE INDEX idx_trip_records_route ON trip_records(route_id);
CREATE INDEX idx_trip_records_date ON trip_records(trip_date);

CREATE TRIGGER update_trip_records_updated_at
    BEFORE UPDATE ON trip_records
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE trip_records IS 'Trip records (placeholder - requires separate vehicle documentation for full implementation)';
```

#### `db/migrations/000074_create_vehicle_data.down.sql`

```sql
DROP TABLE IF EXISTS trip_records;
DROP TABLE IF EXISTS vehicle_routes;
DROP TABLE IF EXISTS vehicles;
```

### Verification
- Run `make migrate-up` -- migration should apply without errors.
- Run `make migrate-down` then `make migrate-up` again to verify reversibility.

---

## Phase 2: GORM Domain Models

**Goal**: Create Go structs matching the DB tables.
**Depends on**: Phase 1 (table structure defined)

### Files to create

#### `apps/api/internal/model/vehicle.go`

```go
package model

import (
    "time"
    "github.com/google/uuid"
)

// Vehicle represents a registered vehicle for mileage tracking (placeholder).
type Vehicle struct {
    ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID     uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
    Code         string    `gorm:"type:varchar(50);not null" json:"code"`
    Name         string    `gorm:"type:varchar(255);not null" json:"name"`
    Description  string    `gorm:"type:text" json:"description,omitempty"`
    LicensePlate string    `gorm:"type:varchar(20)" json:"license_plate,omitempty"`
    IsActive     bool      `gorm:"default:true" json:"is_active"`
    SortOrder    int       `gorm:"default:0" json:"sort_order"`
    CreatedAt    time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt    time.Time `gorm:"default:now()" json:"updated_at"`
}

func (Vehicle) TableName() string {
    return "vehicles"
}
```

#### `apps/api/internal/model/vehicle_route.go`

```go
package model

import (
    "time"
    "github.com/google/uuid"
    "github.com/shopspring/decimal"
)

// VehicleRoute represents a defined travel route (placeholder).
type VehicleRoute struct {
    ID          uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    uuid.UUID       `gorm:"type:uuid;not null;index" json:"tenant_id"`
    Code        string          `gorm:"type:varchar(50);not null" json:"code"`
    Name        string          `gorm:"type:varchar(255);not null" json:"name"`
    Description string          `gorm:"type:text" json:"description,omitempty"`
    DistanceKm  decimal.Decimal `gorm:"type:numeric(10,2)" json:"distance_km,omitempty"`
    IsActive    bool            `gorm:"default:true" json:"is_active"`
    SortOrder   int             `gorm:"default:0" json:"sort_order"`
    CreatedAt   time.Time       `gorm:"default:now()" json:"created_at"`
    UpdatedAt   time.Time       `gorm:"default:now()" json:"updated_at"`
}

func (VehicleRoute) TableName() string {
    return "vehicle_routes"
}
```

#### `apps/api/internal/model/trip_record.go`

```go
package model

import (
    "time"
    "github.com/google/uuid"
    "github.com/shopspring/decimal"
)

// TripRecord represents an individual trip mileage log (placeholder).
type TripRecord struct {
    ID            uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID      uuid.UUID       `gorm:"type:uuid;not null;index" json:"tenant_id"`
    VehicleID     uuid.UUID       `gorm:"type:uuid;not null" json:"vehicle_id"`
    RouteID       *uuid.UUID      `gorm:"type:uuid" json:"route_id,omitempty"`
    TripDate      time.Time       `gorm:"type:date;not null" json:"trip_date"`
    StartMileage  decimal.Decimal `gorm:"type:numeric(10,1)" json:"start_mileage,omitempty"`
    EndMileage    decimal.Decimal `gorm:"type:numeric(10,1)" json:"end_mileage,omitempty"`
    DistanceKm    decimal.Decimal `gorm:"type:numeric(10,2)" json:"distance_km,omitempty"`
    Notes         string          `gorm:"type:text" json:"notes,omitempty"`
    CreatedAt     time.Time       `gorm:"default:now()" json:"created_at"`
    UpdatedAt     time.Time       `gorm:"default:now()" json:"updated_at"`

    // Associations (for preloading)
    Vehicle      *Vehicle      `gorm:"foreignKey:VehicleID" json:"vehicle,omitempty"`
    VehicleRoute *VehicleRoute `gorm:"foreignKey:RouteID" json:"route,omitempty"`
}

func (TripRecord) TableName() string {
    return "trip_records"
}
```

### Verification
- `cd apps/api && go build ./...` should compile without errors.

---

## Phase 3: Repositories

**Goal**: Data access layer with standard CRUD operations.
**Depends on**: Phase 2 (models exist)

### Files to create

#### `apps/api/internal/repository/vehicle.go`

Standard CRUD repository following the access_zone.go pattern:
- `var ErrVehicleNotFound = errors.New("vehicle not found")`
- Struct: `VehicleRepository` with `db *DB`
- Constructor: `NewVehicleRepository(db *DB) *VehicleRepository`
- Methods:
  - `Create(ctx context.Context, v *model.Vehicle) error`
  - `GetByID(ctx context.Context, id uuid.UUID) (*model.Vehicle, error)` -- checks `gorm.ErrRecordNotFound`
  - `GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.Vehicle, error)` -- scoped by tenant_id
  - `List(ctx context.Context, tenantID uuid.UUID) ([]model.Vehicle, error)` -- filtered by tenant_id, ordered by `sort_order ASC, code ASC`
  - `Update(ctx context.Context, v *model.Vehicle) error` -- uses `Save()`
  - `Delete(ctx context.Context, id uuid.UUID) error` -- checks `RowsAffected == 0`

#### `apps/api/internal/repository/vehicle_route.go`

Identical pattern to vehicle.go but for VehicleRoute:
- `var ErrVehicleRouteNotFound = errors.New("vehicle route not found")`
- Struct: `VehicleRouteRepository` with `db *DB`
- Constructor: `NewVehicleRouteRepository(db *DB) *VehicleRouteRepository`
- Methods: `Create`, `GetByID`, `GetByCode`, `List`, `Update`, `Delete`
- List ordered by `sort_order ASC, code ASC`

#### `apps/api/internal/repository/trip_record.go`

Similar pattern but adapted for TripRecord (no code field):
- `var ErrTripRecordNotFound = errors.New("trip record not found")`
- Struct: `TripRecordRepository` with `db *DB`
- Constructor: `NewTripRecordRepository(db *DB) *TripRecordRepository`
- Methods:
  - `Create(ctx context.Context, tr *model.TripRecord) error`
  - `GetByID(ctx context.Context, id uuid.UUID) (*model.TripRecord, error)` -- checks `gorm.ErrRecordNotFound`
  - `List(ctx context.Context, tenantID uuid.UUID) ([]model.TripRecord, error)` -- filtered by tenant_id, ordered by `trip_date DESC, created_at DESC`
  - `ListByVehicle(ctx context.Context, tenantID uuid.UUID, vehicleID uuid.UUID) ([]model.TripRecord, error)` -- filtered by tenant_id + vehicle_id
  - `Update(ctx context.Context, tr *model.TripRecord) error`
  - `Delete(ctx context.Context, id uuid.UUID) error`

### Verification
- `cd apps/api && go build ./...` should compile without errors.

---

## Phase 4: Services

**Goal**: Business logic layer with input validation.
**Depends on**: Phase 3 (repositories exist)

### Files to create

#### `apps/api/internal/service/vehicle.go`

Following the access_zone.go service pattern:
- Unexported interface `vehicleRepository` listing all repository methods
- Sentinel errors:
  - `ErrVehicleNotFound`
  - `ErrVehicleCodeRequired`
  - `ErrVehicleNameRequired`
  - `ErrVehicleCodeExists`
- Struct: `VehicleService` with `repo vehicleRepository`
- Constructor: `NewVehicleService(repo vehicleRepository) *VehicleService`
- Input structs:
  - `CreateVehicleInput` -- TenantID, Code, Name, Description, LicensePlate, SortOrder (*int)
  - `UpdateVehicleInput` -- Name (*string), Description (*string), LicensePlate (*string), IsActive (*bool), SortOrder (*int)
- Methods:
  - `Create(ctx, input CreateVehicleInput) (*model.Vehicle, error)` -- validates Code/Name non-empty, checks code uniqueness via GetByCode
  - `GetByID(ctx, id uuid.UUID) (*model.Vehicle, error)` -- wraps repo error as service error
  - `List(ctx, tenantID uuid.UUID) ([]model.Vehicle, error)` -- delegates to repo
  - `Update(ctx, id uuid.UUID, input UpdateVehicleInput) (*model.Vehicle, error)` -- fetches by ID, applies non-nil fields, saves
  - `Delete(ctx, id uuid.UUID) error` -- delegates to repo

#### `apps/api/internal/service/vehicle_route.go`

Identical pattern to vehicle.go but for VehicleRoute:
- Unexported interface `vehicleRouteRepository`
- Sentinel errors: `ErrVehicleRouteNotFound`, `ErrVehicleRouteCodeRequired`, `ErrVehicleRouteNameRequired`, `ErrVehicleRouteCodeExists`
- Struct: `VehicleRouteService`
- Input structs: `CreateVehicleRouteInput` (TenantID, Code, Name, Description, DistanceKm *float64, SortOrder *int), `UpdateVehicleRouteInput`
- Methods: `Create`, `GetByID`, `List`, `Update`, `Delete`

#### `apps/api/internal/service/trip_record.go`

Adapted pattern for TripRecord:
- Unexported interface `tripRecordRepository`
- Sentinel errors: `ErrTripRecordNotFound`, `ErrTripRecordVehicleRequired`, `ErrTripRecordDateRequired`
- Struct: `TripRecordService`
- Input structs:
  - `CreateTripRecordInput` -- TenantID, VehicleID, RouteID (*uuid.UUID), TripDate (time.Time), StartMileage, EndMileage, DistanceKm (*float64), Notes
  - `UpdateTripRecordInput` -- RouteID (*uuid.UUID), TripDate (*time.Time), StartMileage, EndMileage, DistanceKm (*float64), Notes (*string)
- Methods:
  - `Create(ctx, input) (*model.TripRecord, error)` -- validates VehicleID non-nil and TripDate non-zero
  - `GetByID(ctx, id) (*model.TripRecord, error)`
  - `List(ctx, tenantID) ([]model.TripRecord, error)`
  - `Update(ctx, id, input) (*model.TripRecord, error)`
  - `Delete(ctx, id) error`

### Verification
- `cd apps/api && go build ./...` should compile without errors.

---

## Phase 5: OpenAPI Schema and Path Definitions

**Goal**: Define the API contract before implementing handlers.
**Depends on**: Phase 2 (model field decisions finalized)

### Files to create

#### `api/schemas/vehicles.yaml`

Define these schema objects:

**Vehicle** (response model):
```yaml
Vehicle:
  type: object
  required: [id, tenant_id, code, name]
  properties:
    id: { type: string, format: uuid }
    tenant_id: { type: string, format: uuid }
    code: { type: string, example: "VH-001" }
    name: { type: string, example: "Company Van 1" }
    description: { type: string, x-nullable: true }
    license_plate: { type: string, example: "M-AB 1234", x-nullable: true }
    is_active: { type: boolean, example: true }
    sort_order: { type: integer, example: 0 }
    created_at: { type: string, format: date-time }
    updated_at: { type: string, format: date-time }
```

**CreateVehicleRequest**:
```yaml
CreateVehicleRequest:
  type: object
  required: [code, name]
  properties:
    code: { type: string, minLength: 1, maxLength: 50 }
    name: { type: string, minLength: 1, maxLength: 255 }
    description: { type: string }
    license_plate: { type: string, maxLength: 20 }
    sort_order: { type: integer }
```

**UpdateVehicleRequest**:
```yaml
UpdateVehicleRequest:
  type: object
  properties:
    name: { type: string, minLength: 1, maxLength: 255 }
    description: { type: string }
    license_plate: { type: string, maxLength: 20 }
    is_active: { type: boolean }
    sort_order: { type: integer }
```

**VehicleList**:
```yaml
VehicleList:
  type: object
  required: [data]
  properties:
    data:
      type: array
      items:
        $ref: '#/Vehicle'
```

**VehicleRoute** (response model):
```yaml
VehicleRoute:
  type: object
  required: [id, tenant_id, code, name]
  properties:
    id: { type: string, format: uuid }
    tenant_id: { type: string, format: uuid }
    code: { type: string, example: "RT-001" }
    name: { type: string, example: "Office to Warehouse" }
    description: { type: string, x-nullable: true }
    distance_km: { type: number, format: double, example: 15.5, x-nullable: true }
    is_active: { type: boolean, example: true }
    sort_order: { type: integer, example: 0 }
    created_at: { type: string, format: date-time }
    updated_at: { type: string, format: date-time }
```

**CreateVehicleRouteRequest**:
```yaml
CreateVehicleRouteRequest:
  type: object
  required: [code, name]
  properties:
    code: { type: string, minLength: 1, maxLength: 50 }
    name: { type: string, minLength: 1, maxLength: 255 }
    description: { type: string }
    distance_km: { type: number, format: double }
    sort_order: { type: integer }
```

**UpdateVehicleRouteRequest**:
```yaml
UpdateVehicleRouteRequest:
  type: object
  properties:
    name: { type: string, minLength: 1, maxLength: 255 }
    description: { type: string }
    distance_km: { type: number, format: double }
    is_active: { type: boolean }
    sort_order: { type: integer }
```

**VehicleRouteList**:
```yaml
VehicleRouteList:
  type: object
  required: [data]
  properties:
    data:
      type: array
      items:
        $ref: '#/VehicleRoute'
```

**TripRecord** (response model):
```yaml
TripRecord:
  type: object
  required: [id, tenant_id, vehicle_id, trip_date]
  properties:
    id: { type: string, format: uuid }
    tenant_id: { type: string, format: uuid }
    vehicle_id: { type: string, format: uuid }
    route_id: { type: string, format: uuid, x-nullable: true }
    trip_date: { type: string, format: date, example: "2026-01-30" }
    start_mileage: { type: number, format: double, x-nullable: true }
    end_mileage: { type: number, format: double, x-nullable: true }
    distance_km: { type: number, format: double, x-nullable: true }
    notes: { type: string, x-nullable: true }
    created_at: { type: string, format: date-time }
    updated_at: { type: string, format: date-time }
```

**CreateTripRecordRequest**:
```yaml
CreateTripRecordRequest:
  type: object
  required: [vehicle_id, trip_date]
  properties:
    vehicle_id: { type: string, format: uuid }
    route_id: { type: string, format: uuid }
    trip_date: { type: string, format: date }
    start_mileage: { type: number, format: double }
    end_mileage: { type: number, format: double }
    distance_km: { type: number, format: double }
    notes: { type: string }
```

**UpdateTripRecordRequest**:
```yaml
UpdateTripRecordRequest:
  type: object
  properties:
    route_id: { type: string, format: uuid }
    trip_date: { type: string, format: date }
    start_mileage: { type: number, format: double }
    end_mileage: { type: number, format: double }
    distance_km: { type: number, format: double }
    notes: { type: string }
```

**TripRecordList**:
```yaml
TripRecordList:
  type: object
  required: [data]
  properties:
    data:
      type: array
      items:
        $ref: '#/TripRecord'
```

#### `api/paths/vehicles.yaml`

Define path operations for all three entities:

**Vehicles**:
- `GET /vehicles` -- listAccessZones pattern: tags: Vehicles, summary: "List vehicles", operationId: listVehicles, returns VehicleList
- `POST /vehicles` -- tags: Vehicles, summary: "Create vehicle", operationId: createVehicle, body: CreateVehicleRequest, returns Vehicle (201)
- `GET /vehicles/{id}` -- operationId: getVehicle, returns Vehicle
- `PATCH /vehicles/{id}` -- operationId: updateVehicle, body: UpdateVehicleRequest, returns Vehicle
- `DELETE /vehicles/{id}` -- operationId: deleteVehicle, returns 204

**Vehicle Routes**:
- `GET /vehicle-routes` -- tags: Vehicle Routes, operationId: listVehicleRoutes, returns VehicleRouteList
- `POST /vehicle-routes` -- operationId: createVehicleRoute, body: CreateVehicleRouteRequest, returns VehicleRoute (201)
- `GET /vehicle-routes/{id}` -- operationId: getVehicleRoute, returns VehicleRoute
- `PATCH /vehicle-routes/{id}` -- operationId: updateVehicleRoute, body: UpdateVehicleRouteRequest, returns VehicleRoute
- `DELETE /vehicle-routes/{id}` -- operationId: deleteVehicleRoute, returns 204

**Trip Records**:
- `GET /trip-records` -- tags: Trip Records, operationId: listTripRecords, returns TripRecordList
- `POST /trip-records` -- operationId: createTripRecord, body: CreateTripRecordRequest, returns TripRecord (201)
- `GET /trip-records/{id}` -- operationId: getTripRecord, returns TripRecord
- `PATCH /trip-records/{id}` -- operationId: updateTripRecord, body: UpdateTripRecordRequest, returns TripRecord
- `DELETE /trip-records/{id}` -- operationId: deleteTripRecord, returns 204

All descriptions must include: "Placeholder - requires separate vehicle documentation for full implementation."

Standard error responses for all endpoints:
- 401: `$ref: '../responses/errors.yaml#/Unauthorized'`
- 400 (for create/update): `$ref: '../responses/errors.yaml#/BadRequest'`
- 404 (for get/update/delete by ID): `$ref: '../responses/errors.yaml#/NotFound'`
- 409 (for create, on code conflict): ProblemDetails schema

### File to modify

#### `api/openapi.yaml`

Add to **tags** section (after Access Profiles/Employee Access Assignments):
```yaml
  - name: Vehicles
    description: Vehicle data management (placeholder - requires separate vehicle documentation)
  - name: Vehicle Routes
    description: Vehicle route management (placeholder - requires separate vehicle documentation)
  - name: Trip Records
    description: Trip record management (placeholder - requires separate vehicle documentation)
```

Add to **paths** section (after access control block):
```yaml
  # Vehicles
  /vehicles:
    $ref: 'paths/vehicles.yaml#/~1vehicles'
  /vehicles/{id}:
    $ref: 'paths/vehicles.yaml#/~1vehicles~1{id}'

  # Vehicle Routes
  /vehicle-routes:
    $ref: 'paths/vehicles.yaml#/~1vehicle-routes'
  /vehicle-routes/{id}:
    $ref: 'paths/vehicles.yaml#/~1vehicle-routes~1{id}'

  # Trip Records
  /trip-records:
    $ref: 'paths/vehicles.yaml#/~1trip-records'
  /trip-records/{id}:
    $ref: 'paths/vehicles.yaml#/~1trip-records~1{id}'
```

Add to **definitions** section (after Access Control block):
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

  # Vehicle Routes
  VehicleRoute:
    $ref: 'schemas/vehicles.yaml#/VehicleRoute'
  CreateVehicleRouteRequest:
    $ref: 'schemas/vehicles.yaml#/CreateVehicleRouteRequest'
  UpdateVehicleRouteRequest:
    $ref: 'schemas/vehicles.yaml#/UpdateVehicleRouteRequest'
  VehicleRouteList:
    $ref: 'schemas/vehicles.yaml#/VehicleRouteList'

  # Trip Records
  TripRecord:
    $ref: 'schemas/vehicles.yaml#/TripRecord'
  CreateTripRecordRequest:
    $ref: 'schemas/vehicles.yaml#/CreateTripRecordRequest'
  UpdateTripRecordRequest:
    $ref: 'schemas/vehicles.yaml#/UpdateTripRecordRequest'
  TripRecordList:
    $ref: 'schemas/vehicles.yaml#/TripRecordList'
```

### Verification
- Run `make swagger-bundle` -- should produce `api/openapi.bundled.yaml` without errors.
- Run `make generate` -- should produce generated models in `apps/api/gen/models/`.
- Verify generated files exist: `vehicle.go`, `create_vehicle_request.go`, `update_vehicle_request.go`, `vehicle_list.go`, `vehicle_route.go`, `create_vehicle_route_request.go`, `update_vehicle_route_request.go`, `vehicle_route_list.go`, `trip_record.go`, `create_trip_record_request.go`, `update_trip_record_request.go`, `trip_record_list.go`.

---

## Phase 6: Handlers

**Goal**: HTTP handlers that decode requests, call services, and format responses.
**Depends on**: Phase 4 (services), Phase 5 (generated models from OpenAPI)

### Files to create

#### `apps/api/internal/handler/vehicle.go`

Following the access_zone.go handler pattern:

```go
// Struct
type VehicleHandler struct {
    svc *service.VehicleService
}

// Constructor
func NewVehicleHandler(svc *service.VehicleService) *VehicleHandler

// Handler methods
func (h *VehicleHandler) List(w http.ResponseWriter, r *http.Request)
func (h *VehicleHandler) Create(w http.ResponseWriter, r *http.Request)
func (h *VehicleHandler) Get(w http.ResponseWriter, r *http.Request)
func (h *VehicleHandler) Update(w http.ResponseWriter, r *http.Request)
func (h *VehicleHandler) Delete(w http.ResponseWriter, r *http.Request)

// Response mappers
func vehicleToResponse(v *model.Vehicle) *models.Vehicle
func vehicleListToResponse(vehicles []model.Vehicle) models.VehicleList

// Error handler
func handleVehicleError(w http.ResponseWriter, err error)
```

Key implementation details:
- `List`: Extract tenantID via `middleware.TenantFromContext(r.Context())`, call `svc.List(ctx, tenantID)`, respond with `vehicleListToResponse()`
- `Create`: Decode body into `models.CreateVehicleRequest`, call `req.Validate(nil)`, map to `service.CreateVehicleInput`, call `svc.Create()`, respond 201
- `Get`: Parse `{id}` from URL via `chi.URLParam(r, "id")`, parse UUID, call `svc.GetByID()`, respond with `vehicleToResponse()`
- `Update`: Parse ID, decode body into `models.UpdateVehicleRequest`, map to `service.UpdateVehicleInput`, call `svc.Update()`, respond
- `Delete`: Parse ID, call `svc.Delete()`, respond 204
- `vehicleToResponse`: Map `model.Vehicle` fields to `models.Vehicle` using `strfmt.UUID` and `strfmt.DateTime` conversions
- `handleVehicleError`: Switch on service sentinel errors -> appropriate HTTP status codes

#### `apps/api/internal/handler/vehicle_route.go`

Identical pattern to vehicle.go but for VehicleRoute:

```go
type VehicleRouteHandler struct {
    svc *service.VehicleRouteService
}

func NewVehicleRouteHandler(svc *service.VehicleRouteService) *VehicleRouteHandler

func (h *VehicleRouteHandler) List(w, r)
func (h *VehicleRouteHandler) Create(w, r)
func (h *VehicleRouteHandler) Get(w, r)
func (h *VehicleRouteHandler) Update(w, r)
func (h *VehicleRouteHandler) Delete(w, r)

func vehicleRouteToResponse(vr *model.VehicleRoute) *models.VehicleRoute
func vehicleRouteListToResponse(routes []model.VehicleRoute) models.VehicleRouteList
func handleVehicleRouteError(w, err)
```

Note: `distance_km` field maps using float64 conversion from `decimal.Decimal`.

#### `apps/api/internal/handler/trip_record.go`

Adapted pattern for TripRecord:

```go
type TripRecordHandler struct {
    svc *service.TripRecordService
}

func NewTripRecordHandler(svc *service.TripRecordService) *TripRecordHandler

func (h *TripRecordHandler) List(w, r)
func (h *TripRecordHandler) Create(w, r)
func (h *TripRecordHandler) Get(w, r)
func (h *TripRecordHandler) Update(w, r)
func (h *TripRecordHandler) Delete(w, r)

func tripRecordToResponse(tr *model.TripRecord) *models.TripRecord
func tripRecordListToResponse(records []model.TripRecord) models.TripRecordList
func handleTripRecordError(w, err)
```

Note: `trip_date` uses `strfmt.Date` conversion. `route_id` is nullable (pointer).

### Verification
- `cd apps/api && go build ./...` should compile without errors.

---

## Phase 7: Route Registration and Permissions

**Goal**: Wire routes into the Chi router with permission guards.
**Depends on**: Phase 6 (handlers exist)

### Files to modify

#### `apps/api/internal/permissions/permissions.go`

Add one new permission entry to `allPermissions` slice:

```go
{ID: permissionID("vehicle_data.manage"), Resource: "vehicle_data", Action: "manage", Description: "Manage vehicles, routes, and trip records"},
```

#### `apps/api/internal/handler/routes.go`

Add three new route registration functions at the end of the file:

```go
// RegisterVehicleRoutes registers vehicle routes.
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

// RegisterVehicleRouteRoutes registers vehicle route routes.
func RegisterVehicleRouteRoutes(r chi.Router, h *VehicleRouteHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("vehicle_data.manage").String()
    r.Route("/vehicle-routes", func(r chi.Router) {
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

// RegisterTripRecordRoutes registers trip record routes.
func RegisterTripRecordRoutes(r chi.Router, h *TripRecordHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("vehicle_data.manage").String()
    r.Route("/trip-records", func(r chi.Router) {
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

### Verification
- `cd apps/api && go build ./...` should compile without errors.

---

## Phase 8: Wiring in main.go

**Goal**: Connect all layers and register routes.
**Depends on**: Phase 7 (route registration functions exist)

### File to modify

#### `apps/api/cmd/server/main.go`

Add after the Access Control initialization block (around line 321):

**Step 1 -- Initialize repositories** (in the repository initialization section):
```go
// Initialize Vehicle Data (Fahrzeugdaten placeholder)
vehicleRepo := repository.NewVehicleRepository(db)
vehicleRouteRepo := repository.NewVehicleRouteRepository(db)
tripRecordRepo := repository.NewTripRecordRepository(db)
```

**Step 2 -- Initialize services** (after the repository initialization):
```go
vehicleService := service.NewVehicleService(vehicleRepo)
vehicleRouteService := service.NewVehicleRouteService(vehicleRouteRepo)
tripRecordService := service.NewTripRecordService(tripRecordRepo)
```

**Step 3 -- Initialize handlers** (after the service initialization):
```go
vehicleHandler := handler.NewVehicleHandler(vehicleService)
vehicleRouteHandler := handler.NewVehicleRouteHandler(vehicleRouteService)
tripRecordHandler := handler.NewTripRecordHandler(tripRecordService)
```

**Step 4 -- Register routes** (inside the tenant-scoped group, after `RegisterEmployeeAccessAssignmentRoutes`):
```go
handler.RegisterVehicleRoutes(r, vehicleHandler, authzMiddleware)
handler.RegisterVehicleRouteRoutes(r, vehicleRouteHandler, authzMiddleware)
handler.RegisterTripRecordRoutes(r, tripRecordHandler, authzMiddleware)
```

### Verification
- `cd apps/api && go build ./...` should compile without errors.
- `cd apps/api && go vet ./...` should pass.
- Run `make dev` and check the server starts without errors.

---

## Phase 9: Final Verification

**Goal**: End-to-end verification that everything works.

### Steps

1. **Build check**: `cd apps/api && go build ./...`
2. **Vet check**: `cd apps/api && go vet ./...`
3. **OpenAPI bundle**: `make swagger-bundle` -- should succeed
4. **Code generation**: `make generate` -- should produce all vehicle-related generated models
5. **Migration**: `make migrate-up` -- should apply migration 000074
6. **Server start**: `make dev` -- server should start without errors, no panics
7. **Swagger UI**: Navigate to `/swagger/` -- should show Vehicles, Vehicle Routes, Trip Records tags with all endpoints

### API Smoke Tests (manual or via curl)

With the dev server running and a valid auth token + tenant ID:

```bash
# Create vehicle
curl -X POST http://localhost:8080/api/v1/vehicles \
  -H "Authorization: Bearer <token>" \
  -H "X-Tenant-ID: <tenant-id>" \
  -H "Content-Type: application/json" \
  -d '{"code":"VH-001","name":"Company Van"}'
# Expected: 201 with vehicle object

# List vehicles
curl http://localhost:8080/api/v1/vehicles \
  -H "Authorization: Bearer <token>" \
  -H "X-Tenant-ID: <tenant-id>"
# Expected: 200 with {"data":[...]}

# Create vehicle route
curl -X POST http://localhost:8080/api/v1/vehicle-routes \
  -H "Authorization: Bearer <token>" \
  -H "X-Tenant-ID: <tenant-id>" \
  -H "Content-Type: application/json" \
  -d '{"code":"RT-001","name":"Office to Warehouse"}'
# Expected: 201 with route object

# Create trip record
curl -X POST http://localhost:8080/api/v1/trip-records \
  -H "Authorization: Bearer <token>" \
  -H "X-Tenant-ID: <tenant-id>" \
  -H "Content-Type: application/json" \
  -d '{"vehicle_id":"<vehicle-uuid>","trip_date":"2026-01-30"}'
# Expected: 201 with trip record object

# List trip records
curl http://localhost:8080/api/v1/trip-records \
  -H "Authorization: Bearer <token>" \
  -H "X-Tenant-ID: <tenant-id>"
# Expected: 200 with {"data":[...]}
```

---

## Summary of All Files

### New files (14 total)

| File | Description |
|------|-------------|
| `db/migrations/000074_create_vehicle_data.up.sql` | Create vehicles, vehicle_routes, trip_records tables |
| `db/migrations/000074_create_vehicle_data.down.sql` | Drop tables in reverse order |
| `apps/api/internal/model/vehicle.go` | Vehicle GORM model |
| `apps/api/internal/model/vehicle_route.go` | VehicleRoute GORM model |
| `apps/api/internal/model/trip_record.go` | TripRecord GORM model |
| `apps/api/internal/repository/vehicle.go` | Vehicle repository (CRUD) |
| `apps/api/internal/repository/vehicle_route.go` | VehicleRoute repository (CRUD) |
| `apps/api/internal/repository/trip_record.go` | TripRecord repository (CRUD + ListByVehicle) |
| `apps/api/internal/service/vehicle.go` | Vehicle service (validation + CRUD) |
| `apps/api/internal/service/vehicle_route.go` | VehicleRoute service (validation + CRUD) |
| `apps/api/internal/service/trip_record.go` | TripRecord service (validation + CRUD) |
| `apps/api/internal/handler/vehicle.go` | Vehicle HTTP handler + response mappers |
| `apps/api/internal/handler/vehicle_route.go` | VehicleRoute HTTP handler + response mappers |
| `apps/api/internal/handler/trip_record.go` | TripRecord HTTP handler + response mappers |

### New OpenAPI files (2 total)

| File | Description |
|------|-------------|
| `api/schemas/vehicles.yaml` | All vehicle-related schemas (12 schema objects) |
| `api/paths/vehicles.yaml` | All vehicle-related path operations (6 paths, 15 operations) |

### Modified files (3 total)

| File | Change |
|------|--------|
| `api/openapi.yaml` | Add tags, paths, and definitions for vehicle module |
| `apps/api/internal/permissions/permissions.go` | Add `vehicle_data.manage` permission |
| `apps/api/internal/handler/routes.go` | Add `RegisterVehicleRoutes`, `RegisterVehicleRouteRoutes`, `RegisterTripRecordRoutes` |
| `apps/api/cmd/server/main.go` | Wire repos, services, handlers, and route registration |

### Generated files (auto-created by `make generate`)

Approximately 12 files in `apps/api/gen/models/` for the request/response models.

---

## API Endpoints Summary

| Method | Path | Operation | Description |
|--------|------|-----------|-------------|
| GET | `/api/v1/vehicles` | listVehicles | List all vehicles for tenant |
| POST | `/api/v1/vehicles` | createVehicle | Create a new vehicle |
| GET | `/api/v1/vehicles/{id}` | getVehicle | Get vehicle by ID |
| PATCH | `/api/v1/vehicles/{id}` | updateVehicle | Update vehicle |
| DELETE | `/api/v1/vehicles/{id}` | deleteVehicle | Delete vehicle |
| GET | `/api/v1/vehicle-routes` | listVehicleRoutes | List all vehicle routes for tenant |
| POST | `/api/v1/vehicle-routes` | createVehicleRoute | Create a new vehicle route |
| GET | `/api/v1/vehicle-routes/{id}` | getVehicleRoute | Get vehicle route by ID |
| PATCH | `/api/v1/vehicle-routes/{id}` | updateVehicleRoute | Update vehicle route |
| DELETE | `/api/v1/vehicle-routes/{id}` | deleteVehicleRoute | Delete vehicle route |
| GET | `/api/v1/trip-records` | listTripRecords | List all trip records for tenant |
| POST | `/api/v1/trip-records` | createTripRecord | Create a new trip record |
| GET | `/api/v1/trip-records/{id}` | getTripRecord | Get trip record by ID |
| PATCH | `/api/v1/trip-records/{id}` | updateTripRecord | Update trip record |
| DELETE | `/api/v1/trip-records/{id}` | deleteTripRecord | Delete trip record |

All 15 endpoints protected by `vehicle_data.manage` permission.
