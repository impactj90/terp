# Research: ZMI-TICKET-029 - Vehicle Data Module (Fahrzeugdatenerfassung)

## 1. Project Structure

The Go monorepo follows a clean architecture pattern in `apps/api/internal/`:

```
apps/api/
  cmd/server/main.go        -- Entry point, wiring of all repos/services/handlers
  internal/
    model/                   -- GORM domain models
    repository/              -- Data access (GORM queries)
    service/                 -- Business logic (validation, orchestration)
    handler/                 -- HTTP handlers (request parsing, response formatting)
    middleware/              -- Auth + tenant context injection
    auth/                    -- JWT management
    config/                  -- Environment config
    permissions/             -- Permission ID registry
  gen/models/                -- Auto-generated OpenAPI request/response models
api/
  openapi.yaml               -- Root OpenAPI spec (Swagger 2.0)
  paths/*.yaml               -- Endpoint definitions
  schemas/*.yaml             -- Data model schemas
  responses/errors.yaml      -- Shared error responses
db/migrations/               -- SQL migrations (golang-migrate, sequential numbering)
```

---

## 2. Model Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/model/access_zone.go` (placeholder module example)

```go
package model

import (
	"time"
	"github.com/google/uuid"
)

// AccessZone represents a physical or logical zone for access control (placeholder).
type AccessZone struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID    uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Code        string    `gorm:"type:varchar(50);not null" json:"code"`
	Name        string    `gorm:"type:varchar(255);not null" json:"name"`
	Description string    `gorm:"type:text" json:"description,omitempty"`
	IsActive    bool      `gorm:"default:true" json:"is_active"`
	SortOrder   int       `gorm:"default:0" json:"sort_order"`
	CreatedAt   time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt   time.Time `gorm:"default:now()" json:"updated_at"`
}

func (AccessZone) TableName() string {
	return "access_zones"
}
```

**Key conventions**:
- UUID primary key with `gen_random_uuid()` default
- `TenantID` field for multi-tenancy with `not null;index`
- `Code` (varchar 50) + `Name` (varchar 255) pattern for identifiable entities
- `IsActive` boolean with `default:true`
- `CreatedAt` / `UpdatedAt` with `default:now()`
- JSON tags match snake_case column names
- `TableName()` method returns the table name explicitly
- `BaseModel` exists in `model/base.go` but most models define fields inline

**File**: `/home/tolga/projects/terp/apps/api/internal/model/base.go`

```go
type BaseModel struct {
	ID        uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	CreatedAt time.Time `gorm:"not null;default:now()"`
	UpdatedAt time.Time `gorm:"not null;default:now()"`
}
```

Note: Most models do NOT embed `BaseModel` -- they define ID/CreatedAt/UpdatedAt inline with JSON tags.

---

## 3. Repository Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/access_zone.go`

```go
package repository

import (
	"context"
	"errors"
	"fmt"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"github.com/tolga/terp/internal/model"
)

var ErrAccessZoneNotFound = errors.New("access zone not found")

type AccessZoneRepository struct {
	db *DB
}

func NewAccessZoneRepository(db *DB) *AccessZoneRepository {
	return &AccessZoneRepository{db: db}
}

func (r *AccessZoneRepository) Create(ctx context.Context, az *model.AccessZone) error {
	return r.db.GORM.WithContext(ctx).Create(az).Error
}

func (r *AccessZoneRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.AccessZone, error) {
	var az model.AccessZone
	err := r.db.GORM.WithContext(ctx).First(&az, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrAccessZoneNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get access zone: %w", err)
	}
	return &az, nil
}

func (r *AccessZoneRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.AccessZone, error) {
	var az model.AccessZone
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&az).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrAccessZoneNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get access zone by code: %w", err)
	}
	return &az, nil
}

func (r *AccessZoneRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.AccessZone, error) {
	var zones []model.AccessZone
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("sort_order ASC, code ASC").
		Find(&zones).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list access zones: %w", err)
	}
	return zones, nil
}

func (r *AccessZoneRepository) Update(ctx context.Context, az *model.AccessZone) error {
	return r.db.GORM.WithContext(ctx).Save(az).Error
}

func (r *AccessZoneRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.AccessZone{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete access zone: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrAccessZoneNotFound
	}
	return nil
}
```

**Key conventions**:
- Exported `ErrXxxNotFound` sentinel error at package level
- Struct holds a `*DB` reference (from `repository/db.go`)
- Constructor: `NewXxxRepository(db *DB) *XxxRepository`
- All methods take `context.Context` as first parameter
- `WithContext(ctx)` chained on all GORM calls
- `GetByID` uses `First(&m, "id = ?", id)` with `gorm.ErrRecordNotFound` check
- `GetByCode` scoped by `tenant_id`
- `List` filtered by `tenant_id`, ordered by relevant field
- `Update` uses `Save()`
- `Delete` checks `RowsAffected == 0` for not-found

---

## 4. Service Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/service/access_zone.go`

```go
package service

import (
	"context"
	"errors"
	"strings"
	"github.com/google/uuid"
	"github.com/tolga/terp/internal/model"
)

var (
	ErrAccessZoneNotFound     = errors.New("access zone not found")
	ErrAccessZoneCodeRequired = errors.New("access zone code is required")
	ErrAccessZoneNameRequired = errors.New("access zone name is required")
	ErrAccessZoneCodeExists   = errors.New("access zone code already exists for this tenant")
)

// accessZoneRepository defines the interface for access zone data access.
type accessZoneRepository interface {
	Create(ctx context.Context, az *model.AccessZone) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.AccessZone, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.AccessZone, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.AccessZone, error)
	Update(ctx context.Context, az *model.AccessZone) error
	Delete(ctx context.Context, id uuid.UUID) error
}

type AccessZoneService struct {
	repo accessZoneRepository
}

func NewAccessZoneService(repo accessZoneRepository) *AccessZoneService {
	return &AccessZoneService{repo: repo}
}

// CreateAccessZoneInput represents the input for creating an access zone.
type CreateAccessZoneInput struct {
	TenantID    uuid.UUID
	Code        string
	Name        string
	Description string
	SortOrder   *int
}

func (s *AccessZoneService) Create(ctx context.Context, input CreateAccessZoneInput) (*model.AccessZone, error) {
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrAccessZoneCodeRequired
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrAccessZoneNameRequired
	}
	existing, err := s.repo.GetByCode(ctx, input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrAccessZoneCodeExists
	}
	az := &model.AccessZone{
		TenantID:    input.TenantID,
		Code:        code,
		Name:        name,
		Description: strings.TrimSpace(input.Description),
		IsActive:    true,
	}
	if input.SortOrder != nil {
		az.SortOrder = *input.SortOrder
	}
	if err := s.repo.Create(ctx, az); err != nil {
		return nil, err
	}
	return az, nil
}
// ... GetByID, Update, Delete, List methods follow same pattern
```

**Key conventions**:
- Unexported repository interface defined at service level (dependency inversion)
- Exported `ErrXxxNotFound`, `ErrXxxCodeRequired`, `ErrXxxNameRequired`, `ErrXxxCodeExists` sentinel errors
- `CreateXxxInput` / `UpdateXxxInput` structs for method parameters
- Constructor: `NewXxxService(repo xxxRepository) *XxxService`
- Validation: `strings.TrimSpace()` + empty checks
- Code uniqueness check within tenant: `GetByCode()` before create
- Returns `(*model.Xxx, error)` for create/update, `error` for delete

---

## 5. Handler Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/access_zone.go`

```go
package handler

import (
	"encoding/json"
	"net/http"
	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"
	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

type AccessZoneHandler struct {
	svc *service.AccessZoneService
}

func NewAccessZoneHandler(svc *service.AccessZoneService) *AccessZoneHandler {
	return &AccessZoneHandler{svc: svc}
}

func (h *AccessZoneHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}
	zones, err := h.svc.List(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list access zones")
		return
	}
	respondJSON(w, http.StatusOK, accessZoneListToResponse(zones))
}

func (h *AccessZoneHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}
	var req models.CreateAccessZoneRequest       // <-- generated model
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {     // <-- generated validation
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	// Map generated model -> service input
	input := service.CreateAccessZoneInput{
		TenantID:    tenantID,
		Code:        *req.Code,
		Name:        *req.Name,
		Description: req.Description,
	}
	az, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleAccessZoneError(w, err)
		return
	}
	respondJSON(w, http.StatusCreated, accessZoneToResponse(az))
}

// accessZoneToResponse maps internal model -> generated response model
func accessZoneToResponse(az *model.AccessZone) *models.AccessZone {
	id := strfmt.UUID(az.ID.String())
	tenantID := strfmt.UUID(az.TenantID.String())
	return &models.AccessZone{
		ID:          &id,
		TenantID:    &tenantID,
		Code:        &az.Code,
		Name:        &az.Name,
		Description: &az.Description,
		IsActive:    az.IsActive,
		SortOrder:   int64(az.SortOrder),
		CreatedAt:   strfmt.DateTime(az.CreatedAt),
		UpdatedAt:   strfmt.DateTime(az.UpdatedAt),
	}
}

func accessZoneListToResponse(zones []model.AccessZone) models.AccessZoneList {
	data := make([]*models.AccessZone, 0, len(zones))
	for i := range zones {
		data = append(data, accessZoneToResponse(&zones[i]))
	}
	return models.AccessZoneList{Data: data}
}

func handleAccessZoneError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrAccessZoneNotFound:
		respondError(w, http.StatusNotFound, "Access zone not found")
	case service.ErrAccessZoneCodeRequired:
		respondError(w, http.StatusBadRequest, "Access zone code is required")
	case service.ErrAccessZoneNameRequired:
		respondError(w, http.StatusBadRequest, "Access zone name is required")
	case service.ErrAccessZoneCodeExists:
		respondError(w, http.StatusConflict, "An access zone with this code already exists")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
```

**Key conventions**:
- Handler struct holds service pointer
- Constructor: `NewXxxHandler(svc *service.XxxService) *XxxHandler`
- Uses `middleware.TenantFromContext()` for tenant ID extraction
- Request body decoded into **generated** `models.CreateXxxRequest` / `models.UpdateXxxRequest`
- Generated model's `.Validate(nil)` called for request validation
- Internal `model.Xxx` mapped to generated `models.Xxx` for responses via `xxxToResponse()` helper
- List responses wrapped in `models.XxxList{Data: ...}`
- Error handling via `handleXxxError()` switch on service sentinel errors
- Shared helpers: `respondJSON(w, status, data)` and `respondError(w, status, message)` from `handler/response.go`

---

## 6. Route Registration Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/routes.go`

```go
// RegisterAccessZoneRoutes registers access zone routes.
func RegisterAccessZoneRoutes(r chi.Router, h *AccessZoneHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("access_control.manage").String()
	r.Route("/access-zones", func(r chi.Router) {
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

**Key conventions**:
- Function name: `RegisterXxxRoutes(r chi.Router, h *XxxHandler, authz *middleware.AuthorizationMiddleware)`
- Permission looked up via `permissions.ID("resource.action").String()`
- Dual path: `if authz == nil` for dev mode (no permission checks), else wraps with `authz.RequirePermission()`
- Standard CRUD: `GET /`, `POST /`, `GET /{id}`, `PATCH /{id}`, `DELETE /{id}`
- Route prefix uses kebab-case (e.g., `/access-zones`)

---

## 7. Wiring in main.go

**File**: `/home/tolga/projects/terp/apps/api/cmd/server/main.go`

The wiring follows a three-step pattern for each module:

```go
// Step 1: Initialize repository
accessZoneRepo := repository.NewAccessZoneRepository(db)

// Step 2: Initialize service
accessZoneService := service.NewAccessZoneService(accessZoneRepo)

// Step 3: Initialize handler
accessZoneHandler := handler.NewAccessZoneHandler(accessZoneService)

// Step 4: Register routes (inside tenant-scoped router group)
handler.RegisterAccessZoneRoutes(r, accessZoneHandler, authzMiddleware)
```

Routes are registered inside the tenant-scoped group:

```go
r.Route("/api/v1", func(r chi.Router) {
	// Auth routes (public)
	handler.RegisterAuthRoutes(r, authHandler, jwtManager, authConfig.IsDevMode())

	// Protected routes (require authentication)
	r.Group(func(r chi.Router) {
		r.Use(middleware.AuthMiddleware(jwtManager))
		// User/Tenant routes (auth only, no tenant)
		handler.RegisterUserRoutes(r, userHandler, authzMiddleware)

		// Tenant-scoped routes (require auth + X-Tenant-ID header)
		r.Group(func(r chi.Router) {
			r.Use(tenantMiddleware.RequireTenant)
			// ... all module routes registered here
			handler.RegisterAccessZoneRoutes(r, accessZoneHandler, authzMiddleware)
		})
	})
})
```

---

## 8. Permissions Registration

**File**: `/home/tolga/projects/terp/apps/api/internal/permissions/permissions.go`

New permissions are added to the `allPermissions` slice:

```go
var allPermissions = []Permission{
	// ...existing permissions...
	{ID: permissionID("access_control.manage"), Resource: "access_control", Action: "manage", Description: "Manage access zones, profiles, and employee assignments"},
}
```

Permission IDs are deterministic UUIDs derived from string keys via SHA1:

```go
func permissionID(key string) uuid.UUID {
	ns := uuid.MustParse(permissionNamespace)
	return uuid.NewSHA1(ns, []byte(key))
}
```

For the vehicle module, a new entry like `vehicle_data.manage` would be added.

---

## 9. Multi-Tenancy Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/middleware/tenant.go`

- Tenant ID extracted from `X-Tenant-ID` header
- Validated against tenant service (must exist, must be active)
- Stored in context via `context.WithValue(r.Context(), TenantContextKey, tenantID)`
- Retrieved in handlers via `middleware.TenantFromContext(r.Context())`
- All repository List/GetByCode queries filter by `tenant_id`
- DB tables have `tenant_id UUID NOT NULL REFERENCES tenants(id)` with index
- Code uniqueness enforced per-tenant: `UNIQUE(tenant_id, code)` in migration

---

## 10. OpenAPI Spec Pattern

### Schema file (`api/schemas/access-control.yaml`)

```yaml
AccessZone:
  type: object
  required:
    - id
    - tenant_id
    - code
    - name
  properties:
    id:
      type: string
      format: uuid
    tenant_id:
      type: string
      format: uuid
    code:
      type: string
      example: "ZONE_A"
    name:
      type: string
      example: "Building A Entrance"
    description:
      type: string
      x-nullable: true
    is_active:
      type: boolean
      example: true
    sort_order:
      type: integer
      example: 0
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time

CreateAccessZoneRequest:
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
    description:
      type: string
    sort_order:
      type: integer

UpdateAccessZoneRequest:
  type: object
  properties:
    name:
      type: string
      minLength: 1
      maxLength: 255
    description:
      type: string
    is_active:
      type: boolean
    sort_order:
      type: integer

AccessZoneList:
  type: object
  required:
    - data
  properties:
    data:
      type: array
      items:
        $ref: '#/AccessZone'
```

### Path file (`api/paths/access-control.yaml`)

```yaml
/access-zones:
  get:
    tags:
      - Access Zones
    summary: List access zones
    description: |
      Returns all access zones for the tenant.
      Placeholder - requires separate ZMI Zutritt documentation for full implementation.
    operationId: listAccessZones
    responses:
      200:
        description: List of access zones
        schema:
          $ref: '../schemas/access-control.yaml#/AccessZoneList'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
  post:
    tags:
      - Access Zones
    summary: Create access zone
    description: |
      Creates a new access zone with a unique code.
      Placeholder - requires separate ZMI Zutritt documentation for full implementation.
    operationId: createAccessZone
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '../schemas/access-control.yaml#/CreateAccessZoneRequest'
    responses:
      201:
        description: Created access zone
        schema:
          $ref: '../schemas/access-control.yaml#/AccessZone'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      409:
        description: Code already exists
        schema:
          $ref: '../schemas/common.yaml#/ProblemDetails'

/access-zones/{id}:
  get:
    # ...
  patch:
    # ...
  delete:
    # ...
```

### Root openapi.yaml registration

Paths and definitions must be added to `/home/tolga/projects/terp/api/openapi.yaml`:

```yaml
# In tags section:
  - name: Vehicles
    description: Vehicle data management (placeholder - requires separate documentation)

# In paths section:
  /vehicles:
    $ref: 'paths/vehicles.yaml#/~1vehicles'
  /vehicles/{id}:
    $ref: 'paths/vehicles.yaml#/~1vehicles~1{id}'

# In definitions section:
  Vehicle:
    $ref: 'schemas/vehicles.yaml#/Vehicle'
  CreateVehicleRequest:
    $ref: 'schemas/vehicles.yaml#/CreateVehicleRequest'
  UpdateVehicleRequest:
    $ref: 'schemas/vehicles.yaml#/UpdateVehicleRequest'
  VehicleList:
    $ref: 'schemas/vehicles.yaml#/VehicleList'
```

---

## 11. Migration Pattern

**File**: `/home/tolga/projects/terp/db/migrations/000073_create_access_control.up.sql`

```sql
-- Access zones: physical or logical zones for access control (placeholder)
CREATE TABLE access_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_access_zones_tenant ON access_zones(tenant_id);

CREATE TRIGGER update_access_zones_updated_at
    BEFORE UPDATE ON access_zones
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE access_zones IS 'Access control zones (placeholder - requires separate ZMI Zutritt documentation)';
```

**Down migration** (`000073_create_access_control.down.sql`):

```sql
DROP TABLE IF EXISTS employee_access_assignments;
DROP TABLE IF EXISTS access_profiles;
DROP TABLE IF EXISTS access_zones;
```

**Key conventions**:
- Sequential numbering: `000074_create_vehicle_data.{up,down}.sql` (next available)
- `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
- `UNIQUE(tenant_id, code)` for code uniqueness per tenant
- Index on `tenant_id`
- `update_updated_at_column()` trigger for auto-updating `updated_at`
- `COMMENT ON TABLE` for placeholder documentation
- Down migration drops tables in reverse dependency order with `IF EXISTS`
- Create via: `make migrate-create name=create_vehicle_data`

---

## 12. Generated Models Usage

Generated models live in `/home/tolga/projects/terp/apps/api/gen/models/` and are produced by `make generate` (runs `swagger generate model`).

**Example**: `/home/tolga/projects/terp/apps/api/gen/models/order.go`

```go
// Code generated by go-swagger; DO NOT EDIT.
package models

type Order struct {
	BillingRatePerHour *float64       `json:"billing_rate_per_hour,omitempty"`
	Code               *string        `json:"code"`
	CostCenterID       *strfmt.UUID   `json:"cost_center_id,omitempty"`
	CreatedAt          strfmt.DateTime `json:"created_at,omitempty"`
	// ...
}

func (m *Order) Validate(formats strfmt.Registry) error {
	// auto-generated validation
}
```

**Usage in handlers**:
- Request payloads: `var req models.CreateXxxRequest` -> `json.NewDecoder(r.Body).Decode(&req)` -> `req.Validate(nil)`
- Response payloads: Convert from internal `model.Xxx` to `models.Xxx` using mapper function
- List responses: `models.XxxList{Data: []*models.Xxx{...}}`

Per CLAUDE.md instructions: "Always use the generated models from the `gen/models` folder when dealing with request and response payloads instead of creating new structs."

---

## 13. Closest Existing Pattern for Vehicle Module: Access Control (ZMI-TICKET-028)

The access control module (ZMI-TICKET-028) is the most recent placeholder module and the best template for the vehicle data module. It was implemented as a placeholder requiring separate documentation -- exactly matching the vehicle module requirements.

### Files to use as templates:

| Layer | Access Control (template) | Vehicle Data (new) |
|-------|---------------------------|-------------------|
| Model | `internal/model/access_zone.go` | `internal/model/vehicle.go` |
| Model | -- | `internal/model/vehicle_route.go` |
| Model | -- | `internal/model/trip_record.go` |
| Repository | `internal/repository/access_zone.go` | `internal/repository/vehicle.go` |
| Repository | -- | `internal/repository/vehicle_route.go` |
| Repository | -- | `internal/repository/trip_record.go` |
| Service | `internal/service/access_zone.go` | `internal/service/vehicle.go` |
| Service | -- | `internal/service/vehicle_route.go` |
| Service | -- | `internal/service/trip_record.go` |
| Handler | `internal/handler/access_zone.go` | `internal/handler/vehicle.go` |
| Handler | -- | `internal/handler/vehicle_route.go` |
| Handler | -- | `internal/handler/trip_record.go` |
| Routes | `internal/handler/routes.go` (add) | `internal/handler/routes.go` (add) |
| Permissions | `internal/permissions/permissions.go` (add) | `internal/permissions/permissions.go` (add) |
| OpenAPI schemas | `api/schemas/access-control.yaml` | `api/schemas/vehicles.yaml` |
| OpenAPI paths | `api/paths/access-control.yaml` | `api/paths/vehicles.yaml` |
| OpenAPI root | `api/openapi.yaml` (add) | `api/openapi.yaml` (add) |
| Migration up | `db/migrations/000073_create_access_control.up.sql` | `db/migrations/000074_create_vehicle_data.up.sql` |
| Migration down | `db/migrations/000073_create_access_control.down.sql` | `db/migrations/000074_create_vehicle_data.down.sql` |
| Wiring | `cmd/server/main.go` (add) | `cmd/server/main.go` (add) |

### Checklist for implementation:

1. Create migration SQL (up + down) for `vehicles`, `vehicle_routes`, `trip_records` tables
2. Create GORM models in `internal/model/`
3. Create repositories in `internal/repository/`
4. Create services in `internal/service/` with input structs and validation
5. Create handlers in `internal/handler/` with request/response mapping
6. Add `RegisterVehicleRoutes`, `RegisterVehicleRouteRoutes`, `RegisterTripRecordRoutes` to `routes.go`
7. Add `vehicle_data.manage` permission to `permissions.go`
8. Add OpenAPI schema file `api/schemas/vehicles.yaml`
9. Add OpenAPI path file `api/paths/vehicles.yaml`
10. Add paths and definitions to `api/openapi.yaml`
11. Run `make swagger-bundle && make generate` to produce generated models
12. Wire everything in `cmd/server/main.go`
13. Mark all descriptions as "Placeholder - requires separate vehicle documentation for full implementation"
