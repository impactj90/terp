# Research: ZMI-TICKET-028 - ZMI Zutritt (Access Control)

**Date:** 2026-01-30
**Ticket:** ZMI-TICKET-028
**Status:** Proposed / P3
**Dependencies:** ZMI-TICKET-004 (Employee master data)

---

## 1. Ticket Requirements Summary

This is a **placeholder/scaffolding** ticket for the ZMI Zutritt (Access Control) module. Full behavior requires separate Zutritt documentation that is not yet available.

### Data Models Needed (placeholder)
1. **Access Zone** - Physical or logical zone that can be controlled
2. **Access Profile** - A set of access rules/permissions that can be assigned
3. **Employee Access Assignment** - Links employees to access profiles

### API Endpoints Needed
1. CRUD access zones (`/access-zones`, `/access-zones/{id}`)
2. CRUD access profiles (`/access-profiles`, `/access-profiles/{id}`)
3. Assign/manage profiles to employees (`/employee-access-assignments`, `/employee-access-assignments/{id}`)

### Tests
- Basic CRUD validation for placeholder models (unit tests)
- Create and retrieve access zone/profile (API/integration tests)

---

## 2. Existing Codebase Patterns

### 2.1 Model Layer

**Location:** `apps/api/internal/model/`

**Pattern (from `contacttype.go`):**
```go
package model

import (
    "time"
    "github.com/google/uuid"
)

type ContactType struct {
    ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
    Code        string    `gorm:"type:varchar(50);not null" json:"code"`
    Name        string    `gorm:"type:varchar(255);not null" json:"name"`
    DataType    string    `gorm:"type:varchar(20);not null;default:'text'" json:"data_type"`
    Description string    `gorm:"type:text" json:"description,omitempty"`
    IsActive    bool      `gorm:"default:true" json:"is_active"`
    SortOrder   int       `gorm:"default:0" json:"sort_order"`
    CreatedAt   time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt   time.Time `gorm:"default:now()" json:"updated_at"`
}

func (ContactType) TableName() string {
    return "contact_types"
}
```

**Base model pattern (from `base.go`):** Provides `BaseModel` with ID, CreatedAt, UpdatedAt, but most models define fields inline rather than embedding `BaseModel`.

**Association pattern (from `order_assignment.go`):**
```go
type OrderAssignment struct {
    ID         uuid.UUID           `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID   uuid.UUID           `gorm:"type:uuid;not null;index" json:"tenant_id"`
    OrderID    uuid.UUID           `gorm:"type:uuid;not null;index" json:"order_id"`
    EmployeeID uuid.UUID           `gorm:"type:uuid;not null;index" json:"employee_id"`
    // ...fields...
    Order    *Order    `gorm:"foreignKey:OrderID" json:"order,omitempty"`
    Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
}
```

**Key files to follow:**
- `/home/tolga/projects/terp/apps/api/internal/model/contacttype.go` (simple CRUD entity)
- `/home/tolga/projects/terp/apps/api/internal/model/order_assignment.go` (association entity with FK references)
- `/home/tolga/projects/terp/apps/api/internal/model/employee.go` (employee model for FK references)

### 2.2 Repository Layer

**Location:** `apps/api/internal/repository/`

**Pattern (from `contacttype.go`):**
```go
package repository

type ContactTypeRepository struct {
    db *DB
}

func NewContactTypeRepository(db *DB) *ContactTypeRepository {
    return &ContactTypeRepository{db: db}
}

// Standard methods: Create, GetByID, Update, Delete, List, ListActive
// - Uses r.db.GORM.WithContext(ctx)
// - Sentinel errors: var ErrContactTypeNotFound = errors.New("...")
// - Create uses .Select("field1","field2",...).Create(entity)
// - GetByID uses .First(&entity, "id = ?", id)
// - Update uses .Save(entity)
// - Delete uses .Delete(&Entity{}, "id = ?", id)
// - List uses .Where("tenant_id = ?", tenantID).Order("sort_order ASC").Find(&items)
```

**Key files:**
- `/home/tolga/projects/terp/apps/api/internal/repository/contacttype.go`
- `/home/tolga/projects/terp/apps/api/internal/repository/order_assignment.go`
- `/home/tolga/projects/terp/apps/api/internal/repository/db.go` (DB struct with GORM + pgx pool)

### 2.3 Service Layer

**Location:** `apps/api/internal/service/`

**Pattern (from `contacttype.go`):**
```go
package service

// 1. Define sentinel errors
var (
    ErrContactTypeNotFound    = errors.New("contact type not found")
    ErrContactTypeCodeExists  = errors.New("contact type code already exists")
    // ...
)

// 2. Define repository interface (for testability)
type contactTypeRepository interface {
    Create(ctx context.Context, ct *model.ContactType) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.ContactType, error)
    Update(ctx context.Context, ct *model.ContactType) error
    Delete(ctx context.Context, id uuid.UUID) error
    List(ctx context.Context, tenantID uuid.UUID) ([]model.ContactType, error)
    ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.ContactType, error)
}

// 3. Service struct
type ContactTypeService struct {
    repo contactTypeRepository
}

func NewContactTypeService(repo contactTypeRepository) *ContactTypeService {
    return &ContactTypeService{repo: repo}
}

// 4. Input structs for Create/Update
type CreateContactTypeInput struct {
    TenantID    uuid.UUID
    Code        string
    Name        string
    DataType    string
    Description string
    SortOrder   int
}

type UpdateContactTypeInput struct {
    Name        *string
    Description *string
    IsActive    *bool
    SortOrder   *int
}

// 5. CRUD methods with validation
func (s *ContactTypeService) Create(ctx context.Context, input CreateContactTypeInput) (*model.ContactType, error) { ... }
func (s *ContactTypeService) GetByID(ctx context.Context, id uuid.UUID) (*model.ContactType, error) { ... }
func (s *ContactTypeService) Update(ctx context.Context, id uuid.UUID, input UpdateContactTypeInput) (*model.ContactType, error) { ... }
func (s *ContactTypeService) Delete(ctx context.Context, id uuid.UUID) error { ... }
func (s *ContactTypeService) List(ctx context.Context, tenantID uuid.UUID) ([]model.ContactType, error) { ... }
```

**Key files:**
- `/home/tolga/projects/terp/apps/api/internal/service/contacttype.go`
- `/home/tolga/projects/terp/apps/api/internal/service/order_assignment.go`

### 2.4 Handler Layer

**Location:** `apps/api/internal/handler/`

**Pattern (from `contacttype.go`):**
```go
package handler

type ContactTypeHandler struct {
    contactTypeService *service.ContactTypeService
}

func NewContactTypeHandler(svc *service.ContactTypeService) *ContactTypeHandler {
    return &ContactTypeHandler{contactTypeService: svc}
}

// Standard methods: List, Get, Create, Update, Delete
// - Gets tenantID from middleware.TenantFromContext(r.Context())
// - Gets path ID from chi.URLParam(r, "id")
// - Decodes request body using json.NewDecoder(r.Body).Decode(&req)
// - Uses generated models from gen/models for request validation: req.Validate(nil)
// - Maps service input to/from gen/models types
// - Responds using respondJSON(w, status, data) or respondError(w, status, message)
// - Create returns 201, Get/List/Update return 200, Delete returns 204
```

**Response helpers (from `response.go`):**
- `respondJSON(w, status, data)` - JSON response
- `respondError(w, status, message)` - Error response

**Key files:**
- `/home/tolga/projects/terp/apps/api/internal/handler/contacttype.go`
- `/home/tolga/projects/terp/apps/api/internal/handler/order_assignment.go`
- `/home/tolga/projects/terp/apps/api/internal/handler/response.go`

### 2.5 Route Registration

**Location:** `apps/api/internal/handler/routes.go`

**Pattern (simple CRUD with permission):**
```go
func RegisterContactTypeRoutes(r chi.Router, h *ContactTypeHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("contact_management.manage").String()
    r.Route("/contact-types", func(r chi.Router) {
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

**Wiring in main.go (from `cmd/server/main.go`):**
1. Create repository: `contactTypeRepo := repository.NewContactTypeRepository(db)`
2. Create service: `contactTypeService := service.NewContactTypeService(contactTypeRepo)`
3. Create handler: `contactTypeHandler := handler.NewContactTypeHandler(contactTypeService)`
4. Register routes: `handler.RegisterContactTypeRoutes(r, contactTypeHandler, authzMiddleware)`
   - Route registration goes inside the tenant-scoped group in the `r.Route("/api/v1", ...)` block.

### 2.6 Permissions

**Location:** `apps/api/internal/permissions/permissions.go`

**Pattern:** Add new permission entries to `allPermissions` slice:
```go
{ID: permissionID("access_control.manage"), Resource: "access_control", Action: "manage", Description: "Manage access zones and profiles"},
```

Permission keys use format `resource.action` and generate deterministic UUIDs via SHA1.

### 2.7 OpenAPI Spec

**Schemas location:** `api/schemas/`
**Paths location:** `api/paths/`
**Main spec:** `api/openapi.yaml`

**Schema pattern (from `contact-types.yaml`):**
- Define response model (e.g., `AccessZone`) with all fields including `id`, `tenant_id`, timestamps
- Define `CreateAccessZoneRequest` with required create fields
- Define `UpdateAccessZoneRequest` with optional update fields
- Define `AccessZoneList` with `data` array

**Path pattern (from `contact-types.yaml`):**
- Collection endpoint (`/access-zones`): GET (list) + POST (create)
- Item endpoint (`/access-zones/{id}`): GET + PATCH + DELETE
- Tags, operationId, parameters, responses with `$ref` to schemas and error responses

**Main spec integration (`openapi.yaml`):**
1. Add new tags in the `tags:` section
2. Add path references in the `paths:` section
3. Add definition references in the `definitions:` section

**Key files:**
- `/home/tolga/projects/terp/api/schemas/contact-types.yaml`
- `/home/tolga/projects/terp/api/paths/contact-types.yaml`
- `/home/tolga/projects/terp/api/openapi.yaml`
- `/home/tolga/projects/terp/api/responses/errors.yaml`
- `/home/tolga/projects/terp/api/schemas/common.yaml`

### 2.8 Migrations

**Location:** `db/migrations/`
**Latest migration:** `000072_create_raw_terminal_bookings` (next will be `000073`)

**Pattern (from `000068_create_contact_types.up.sql`):**
```sql
CREATE TABLE access_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    -- domain fields --
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_access_zones_tenant ON access_zones(tenant_id);

CREATE TRIGGER update_access_zones_updated_at
    BEFORE UPDATE ON access_zones
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE access_zones IS 'Description';
```

**Down migration:** `DROP TABLE IF EXISTS <table>;` in reverse dependency order.

### 2.9 Generated Models

**Location:** `apps/api/gen/models/`
**Generated via:** `make generate` (go-swagger from bundled OpenAPI spec)

Generated models are used in handlers for request/response validation. After defining OpenAPI schemas and running `make swagger-bundle && make generate`, the generated models appear automatically.

### 2.10 Test Pattern

**Location:** `apps/api/internal/service/*_test.go`

**Pattern (from `contacttype_test.go`):**
```go
package service_test

import (
    "context"
    "testing"
    "github.com/google/uuid"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
    "github.com/tolga/terp/internal/model"
    "github.com/tolga/terp/internal/repository"
    "github.com/tolga/terp/internal/service"
    "github.com/tolga/terp/internal/testutil"
)

func TestContactTypeService_Create_Success(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := repository.NewContactTypeRepository(db)
    svc := service.NewContactTypeService(repo)
    ctx := context.Background()
    tenant := createTestTenant(t, db)
    // ...test logic...
}
```

Uses `testutil.SetupTestDB(t)` for real DB integration tests.

---

## 3. Employee Model Details

**File:** `/home/tolga/projects/terp/apps/api/internal/model/employee.go`

The Employee model has these key fields for FK references:
- `ID uuid.UUID` (primary key)
- `TenantID uuid.UUID` (tenant scoping)
- `PersonnelNumber string` (unique per tenant)
- `FirstName`, `LastName`, `Title`, `Salutation` string fields

For the employee access assignment, we need:
- `EmployeeID uuid.UUID` referencing `employees(id)`
- GORM relation: `Employee *Employee gorm:"foreignKey:EmployeeID"`

---

## 4. Proposed Data Models

### 4.1 Access Zone (`access_zones`)
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| tenant_id | UUID FK | references tenants(id) |
| code | VARCHAR(50) | unique per tenant |
| name | VARCHAR(255) | display name |
| description | TEXT | nullable |
| is_active | BOOLEAN | default true |
| sort_order | INTEGER | default 0 |
| created_at | TIMESTAMPTZ | default NOW() |
| updated_at | TIMESTAMPTZ | default NOW() |

### 4.2 Access Profile (`access_profiles`)
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| tenant_id | UUID FK | references tenants(id) |
| code | VARCHAR(50) | unique per tenant |
| name | VARCHAR(255) | display name |
| description | TEXT | nullable |
| is_active | BOOLEAN | default true |
| created_at | TIMESTAMPTZ | default NOW() |
| updated_at | TIMESTAMPTZ | default NOW() |

### 4.3 Employee Access Assignment (`employee_access_assignments`)
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| tenant_id | UUID FK | references tenants(id) |
| employee_id | UUID FK | references employees(id) |
| access_profile_id | UUID FK | references access_profiles(id) |
| valid_from | DATE | nullable, start date |
| valid_to | DATE | nullable, end date |
| is_active | BOOLEAN | default true |
| created_at | TIMESTAMPTZ | default NOW() |
| updated_at | TIMESTAMPTZ | default NOW() |

**Note:** A future table `access_profile_zones` could link profiles to zones (many-to-many), but since this is placeholder scaffolding, we keep it simple for now.

---

## 5. Files to Create/Modify

### New Files
1. `db/migrations/000073_create_access_control.up.sql` - Create 3 tables
2. `db/migrations/000073_create_access_control.down.sql` - Drop 3 tables
3. `api/schemas/access-control.yaml` - OpenAPI schemas
4. `api/paths/access-control.yaml` - OpenAPI paths
5. `apps/api/internal/model/access_zone.go`
6. `apps/api/internal/model/access_profile.go`
7. `apps/api/internal/model/employee_access_assignment.go`
8. `apps/api/internal/repository/access_zone.go`
9. `apps/api/internal/repository/access_profile.go`
10. `apps/api/internal/repository/employee_access_assignment.go`
11. `apps/api/internal/service/access_zone.go`
12. `apps/api/internal/service/access_profile.go`
13. `apps/api/internal/service/employee_access_assignment.go`
14. `apps/api/internal/handler/access_zone.go`
15. `apps/api/internal/handler/access_profile.go`
16. `apps/api/internal/handler/employee_access_assignment.go`
17. `apps/api/internal/service/access_zone_test.go`
18. `apps/api/internal/service/access_profile_test.go`
19. `apps/api/internal/service/employee_access_assignment_test.go`

### Modified Files
1. `api/openapi.yaml` - Add tags, paths, definitions for access control
2. `apps/api/internal/permissions/permissions.go` - Add `access_control.manage` permission
3. `apps/api/internal/handler/routes.go` - Add route registration functions
4. `apps/api/cmd/server/main.go` - Wire up repos, services, handlers, routes

---

## 6. API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/access-zones` | List access zones |
| POST | `/access-zones` | Create access zone |
| GET | `/access-zones/{id}` | Get access zone |
| PATCH | `/access-zones/{id}` | Update access zone |
| DELETE | `/access-zones/{id}` | Delete access zone |
| GET | `/access-profiles` | List access profiles |
| POST | `/access-profiles` | Create access profile |
| GET | `/access-profiles/{id}` | Get access profile |
| PATCH | `/access-profiles/{id}` | Update access profile |
| DELETE | `/access-profiles/{id}` | Delete access profile |
| GET | `/employee-access-assignments` | List assignments |
| POST | `/employee-access-assignments` | Create assignment |
| GET | `/employee-access-assignments/{id}` | Get assignment |
| PATCH | `/employee-access-assignments/{id}` | Update assignment |
| DELETE | `/employee-access-assignments/{id}` | Delete assignment |

---

## 7. Open Questions and Considerations

1. **Placeholder scope**: The ticket explicitly states this is placeholder scaffolding. Full implementation requires separate ZMI Zutritt documentation. All models should be kept simple with basic fields.

2. **Access Profile <-> Zone relationship**: The ticket mentions access zones and profiles but does not specify if profiles contain zone references (many-to-many). For the placeholder, we keep them separate. A `access_profile_zones` join table can be added when full documentation is available.

3. **Terminal integration**: ZMI Zutritt typically integrates with physical access terminals. Since ZMI-TICKET-027 already handles terminal integration, future work may link access zones to terminals. Not needed for placeholder.

4. **Permission**: Use a single `access_control.manage` permission for all three CRUD endpoints (zones, profiles, assignments), consistent with how `contact_management.manage` covers both contact types and contact kinds.

5. **Employee nested routes**: Consider adding `GET /employees/{id}/access-assignments` as a nested route for listing assignments by employee, similar to how order assignments has `GET /orders/{id}/assignments`.

6. **Feature flag / documentation marker**: The acceptance criteria state "Feature is marked as requiring separate documentation before full implementation." Consider adding a comment in the OpenAPI spec description noting this.
