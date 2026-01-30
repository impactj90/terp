# Implementation Plan: ZMI-TICKET-028 - ZMI Zutritt (Access Control)

**Date:** 2026-01-30
**Ticket:** ZMI-TICKET-028
**Type:** Placeholder / Scaffolding
**Priority:** P3
**Dependencies:** ZMI-TICKET-004 (Employee master data - already implemented)

---

## Overview

This is a **placeholder/scaffolding** ticket for the ZMI Zutritt (Access Control) module. The data models are intentionally simple stubs. Full behavior requires separate Zutritt documentation that is not yet available.

Three entities:
1. **Access Zone** - Physical or logical zone (simple code/name entity)
2. **Access Profile** - A set of access rules/permissions (simple code/name entity)
3. **Employee Access Assignment** - Links employees to access profiles (association entity)

All three follow standard CRUD patterns already established in the codebase.

---

## Phase 1: Database Migrations

**Depends on:** Nothing
**Pattern reference:** `/home/tolga/projects/terp/db/migrations/000068_create_contact_types.up.sql`

### Files to Create

#### `db/migrations/000073_create_access_control.up.sql`

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

-- Access profiles: sets of access rules/permissions (placeholder)
CREATE TABLE access_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_access_profiles_tenant ON access_profiles(tenant_id);

CREATE TRIGGER update_access_profiles_updated_at
    BEFORE UPDATE ON access_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE access_profiles IS 'Access control profiles (placeholder - requires separate ZMI Zutritt documentation)';

-- Employee access assignments: links employees to access profiles
CREATE TABLE employee_access_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    access_profile_id UUID NOT NULL REFERENCES access_profiles(id) ON DELETE CASCADE,
    valid_from DATE,
    valid_to DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_employee_access_assignments_tenant ON employee_access_assignments(tenant_id);
CREATE INDEX idx_employee_access_assignments_employee ON employee_access_assignments(employee_id);
CREATE INDEX idx_employee_access_assignments_profile ON employee_access_assignments(access_profile_id);

CREATE TRIGGER update_employee_access_assignments_updated_at
    BEFORE UPDATE ON employee_access_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE employee_access_assignments IS 'Employee-to-access-profile assignments (placeholder - requires separate ZMI Zutritt documentation)';
```

#### `db/migrations/000073_create_access_control.down.sql`

```sql
DROP TABLE IF EXISTS employee_access_assignments;
DROP TABLE IF EXISTS access_profiles;
DROP TABLE IF EXISTS access_zones;
```

### Verification

```bash
make migrate-up
# Should apply migration 000073 without errors
make migrate-down
# Should rollback cleanly
make migrate-up
# Re-apply to leave DB in correct state
```

---

## Phase 2: OpenAPI Spec

**Depends on:** Nothing (can be done in parallel with Phase 1)
**Pattern reference:**
- Schema: `/home/tolga/projects/terp/api/schemas/contact-types.yaml`
- Paths: `/home/tolga/projects/terp/api/paths/contact-types.yaml`
- Main spec: `/home/tolga/projects/terp/api/openapi.yaml`

### Files to Create

#### `api/schemas/access-control.yaml`

Define these schemas following the contact-types.yaml pattern:

- `AccessZone` - response model with all fields (id, tenant_id, code, name, description, is_active, sort_order, created_at, updated_at)
- `CreateAccessZoneRequest` - required: code, name. Optional: description, sort_order
- `UpdateAccessZoneRequest` - optional: name, description, is_active, sort_order
- `AccessZoneList` - { data: [AccessZone] }
- `AccessProfile` - response model (id, tenant_id, code, name, description, is_active, created_at, updated_at)
- `CreateAccessProfileRequest` - required: code, name. Optional: description
- `UpdateAccessProfileRequest` - optional: name, description, is_active
- `AccessProfileList` - { data: [AccessProfile] }
- `EmployeeAccessAssignment` - response model (id, tenant_id, employee_id, access_profile_id, valid_from, valid_to, is_active, created_at, updated_at)
- `CreateEmployeeAccessAssignmentRequest` - required: employee_id, access_profile_id. Optional: valid_from, valid_to
- `UpdateEmployeeAccessAssignmentRequest` - optional: valid_from, valid_to, is_active
- `EmployeeAccessAssignmentList` - { data: [EmployeeAccessAssignment] }

**Key details:**
- All UUID fields use `type: string, format: uuid`
- Date fields (valid_from, valid_to) use `type: string, format: date`
- Nullable fields use `x-nullable: true`
- Required fields in create requests use `minLength: 1`
- Code fields use `maxLength: 50`, name fields use `maxLength: 255`

#### `api/paths/access-control.yaml`

Define these path operations following the contact-types.yaml pattern:

- `/access-zones` - GET (listAccessZones) + POST (createAccessZone)
- `/access-zones/{id}` - GET (getAccessZone) + PATCH (updateAccessZone) + DELETE (deleteAccessZone)
- `/access-profiles` - GET (listAccessProfiles) + POST (createAccessProfile)
- `/access-profiles/{id}` - GET (getAccessProfile) + PATCH (updateAccessProfile) + DELETE (deleteAccessProfile)
- `/employee-access-assignments` - GET (listEmployeeAccessAssignments) + POST (createEmployeeAccessAssignment)
- `/employee-access-assignments/{id}` - GET (getEmployeeAccessAssignment) + PATCH (updateEmployeeAccessAssignment) + DELETE (deleteEmployeeAccessAssignment)

**Tags:**
- Access Zones tag for zone endpoints
- Access Profiles tag for profile endpoints
- Employee Access Assignments tag for assignment endpoints

**Description note:** Include in each endpoint group description: "Placeholder - requires separate ZMI Zutritt documentation for full implementation."

### File to Modify

#### `api/openapi.yaml`

1. **Add tags** (after "Terminal Bookings" tag, around line 153):
```yaml
  - name: Access Zones
    description: Access control zone management (placeholder - requires separate ZMI Zutritt documentation)
  - name: Access Profiles
    description: Access control profile management (placeholder - requires separate ZMI Zutritt documentation)
  - name: Employee Access Assignments
    description: Employee-to-access-profile assignment management (placeholder)
```

2. **Add paths** (after Terminal Bookings paths, around line 668):
```yaml
  # Access Control
  /access-zones:
    $ref: 'paths/access-control.yaml#/~1access-zones'
  /access-zones/{id}:
    $ref: 'paths/access-control.yaml#/~1access-zones~1{id}'
  /access-profiles:
    $ref: 'paths/access-control.yaml#/~1access-profiles'
  /access-profiles/{id}:
    $ref: 'paths/access-control.yaml#/~1access-profiles~1{id}'
  /employee-access-assignments:
    $ref: 'paths/access-control.yaml#/~1employee-access-assignments'
  /employee-access-assignments/{id}:
    $ref: 'paths/access-control.yaml#/~1employee-access-assignments~1{id}'
```

3. **Add definitions** (after Terminal Bookings definitions, around line 1373):
```yaml
  # Access Control
  AccessZone:
    $ref: 'schemas/access-control.yaml#/AccessZone'
  CreateAccessZoneRequest:
    $ref: 'schemas/access-control.yaml#/CreateAccessZoneRequest'
  UpdateAccessZoneRequest:
    $ref: 'schemas/access-control.yaml#/UpdateAccessZoneRequest'
  AccessZoneList:
    $ref: 'schemas/access-control.yaml#/AccessZoneList'
  AccessProfile:
    $ref: 'schemas/access-control.yaml#/AccessProfile'
  CreateAccessProfileRequest:
    $ref: 'schemas/access-control.yaml#/CreateAccessProfileRequest'
  UpdateAccessProfileRequest:
    $ref: 'schemas/access-control.yaml#/UpdateAccessProfileRequest'
  AccessProfileList:
    $ref: 'schemas/access-control.yaml#/AccessProfileList'
  EmployeeAccessAssignment:
    $ref: 'schemas/access-control.yaml#/EmployeeAccessAssignment'
  CreateEmployeeAccessAssignmentRequest:
    $ref: 'schemas/access-control.yaml#/CreateEmployeeAccessAssignmentRequest'
  UpdateEmployeeAccessAssignmentRequest:
    $ref: 'schemas/access-control.yaml#/UpdateEmployeeAccessAssignmentRequest'
  EmployeeAccessAssignmentList:
    $ref: 'schemas/access-control.yaml#/EmployeeAccessAssignmentList'
```

### Verification

```bash
make swagger-bundle
# Should produce api/openapi.bundled.yaml without errors
```

---

## Phase 3: Generate Models from OpenAPI

**Depends on:** Phase 2

### Command

```bash
make generate
```

This will generate Go models into `apps/api/gen/models/` including:
- `access_zone.go`
- `create_access_zone_request.go`
- `update_access_zone_request.go`
- `access_zone_list.go`
- `access_profile.go`
- `create_access_profile_request.go`
- `update_access_profile_request.go`
- `access_profile_list.go`
- `employee_access_assignment.go`
- `create_employee_access_assignment_request.go`
- `update_employee_access_assignment_request.go`
- `employee_access_assignment_list.go`

### Verification

```bash
cd apps/api && go build ./...
# Should compile without errors
```

---

## Phase 4: Domain Models (GORM structs)

**Depends on:** Phase 1 (table names must match)
**Pattern reference:** `/home/tolga/projects/terp/apps/api/internal/model/contacttype.go`

### Files to Create

#### `apps/api/internal/model/access_zone.go`

Follow the `ContactType` pattern exactly:
```go
package model

import (
    "time"
    "github.com/google/uuid"
)

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

#### `apps/api/internal/model/access_profile.go`

Same pattern as AccessZone but without SortOrder:
```go
type AccessProfile struct {
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

#### `apps/api/internal/model/employee_access_assignment.go`

Follow the `OrderAssignment` pattern for FK relations:
```go
type EmployeeAccessAssignment struct {
    ID              uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID        uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
    EmployeeID      uuid.UUID `gorm:"type:uuid;not null;index" json:"employee_id"`
    AccessProfileID uuid.UUID `gorm:"type:uuid;not null;index" json:"access_profile_id"`
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

Note: `ValidFrom` and `ValidTo` are `*time.Time` (pointer) since they are nullable DATE fields.

### Verification

```bash
cd apps/api && go build ./...
```

---

## Phase 5: Repository Layer

**Depends on:** Phase 4
**Pattern reference:** `/home/tolga/projects/terp/apps/api/internal/repository/contacttype.go`

### Files to Create

#### `apps/api/internal/repository/access_zone.go`

Standard CRUD repository following ContactTypeRepository pattern:
- Sentinel error: `var ErrAccessZoneNotFound = errors.New("access zone not found")`
- Constructor: `NewAccessZoneRepository(db *DB) *AccessZoneRepository`
- Methods:
  - `Create(ctx, *model.AccessZone) error`
  - `GetByID(ctx, uuid.UUID) (*model.AccessZone, error)`
  - `GetByCode(ctx, tenantID uuid.UUID, code string) (*model.AccessZone, error)`
  - `List(ctx, tenantID uuid.UUID) ([]model.AccessZone, error)` - ordered by sort_order ASC, code ASC
  - `Update(ctx, *model.AccessZone) error`
  - `Delete(ctx, uuid.UUID) error`

#### `apps/api/internal/repository/access_profile.go`

Same pattern as AccessZone:
- Sentinel error: `var ErrAccessProfileNotFound = errors.New("access profile not found")`
- Constructor: `NewAccessProfileRepository(db *DB) *AccessProfileRepository`
- Methods: Create, GetByID, GetByCode, List (ordered by code ASC), Update, Delete
- Additional: `HasAssignments(ctx, accessProfileID uuid.UUID) (bool, error)` - checks if profile is referenced by assignments

#### `apps/api/internal/repository/employee_access_assignment.go`

Follow OrderAssignmentRepository pattern:
- Sentinel error: `var ErrEmployeeAccessAssignmentNotFound = errors.New("employee access assignment not found")`
- Constructor: `NewEmployeeAccessAssignmentRepository(db *DB) *EmployeeAccessAssignmentRepository`
- Methods:
  - `Create(ctx, *model.EmployeeAccessAssignment) error`
  - `GetByID(ctx, uuid.UUID) (*model.EmployeeAccessAssignment, error)` - with Preload("Employee") and Preload("AccessProfile")
  - `List(ctx, tenantID uuid.UUID) ([]model.EmployeeAccessAssignment, error)` - with Preloads, ordered by created_at DESC
  - `Update(ctx, *model.EmployeeAccessAssignment) error`
  - `Delete(ctx, uuid.UUID) error`

### Verification

```bash
cd apps/api && go build ./...
```

---

## Phase 6: Service Layer

**Depends on:** Phase 5
**Pattern reference:** `/home/tolga/projects/terp/apps/api/internal/service/contacttype.go`

### Files to Create

#### `apps/api/internal/service/access_zone.go`

Follow ContactTypeService pattern exactly:

1. **Sentinel errors:**
   - `ErrAccessZoneNotFound`
   - `ErrAccessZoneCodeRequired`
   - `ErrAccessZoneNameRequired`
   - `ErrAccessZoneCodeExists`

2. **Repository interface:**
   ```go
   type accessZoneRepository interface {
       Create(ctx context.Context, az *model.AccessZone) error
       GetByID(ctx context.Context, id uuid.UUID) (*model.AccessZone, error)
       GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.AccessZone, error)
       List(ctx context.Context, tenantID uuid.UUID) ([]model.AccessZone, error)
       Update(ctx context.Context, az *model.AccessZone) error
       Delete(ctx context.Context, id uuid.UUID) error
   }
   ```

3. **Input structs:**
   - `CreateAccessZoneInput` - TenantID, Code, Name, Description, SortOrder (*int)
   - `UpdateAccessZoneInput` - Name (*string), Description (*string), IsActive (*bool), SortOrder (*int)

4. **Service methods:** Create (with code uniqueness check), GetByID, Update, Delete, List

#### `apps/api/internal/service/access_profile.go`

Same pattern as AccessZone but without SortOrder:

1. **Sentinel errors:** ErrAccessProfileNotFound, ErrAccessProfileCodeRequired, ErrAccessProfileNameRequired, ErrAccessProfileCodeExists, ErrAccessProfileInUse

2. **Repository interface:** Same as zone but with `HasAssignments` method

3. **Input structs:**
   - `CreateAccessProfileInput` - TenantID, Code, Name, Description
   - `UpdateAccessProfileInput` - Name (*string), Description (*string), IsActive (*bool)

4. **Service methods:** Create, GetByID, Update, Delete (check HasAssignments before delete), List

#### `apps/api/internal/service/employee_access_assignment.go`

Follow the pattern but simplified for assignment entity:

1. **Sentinel errors:**
   - `ErrEmployeeAccessAssignmentNotFound`
   - `ErrEmployeeAccessAssignmentEmployeeRequired`
   - `ErrEmployeeAccessAssignmentProfileRequired`

2. **Repository interface:**
   ```go
   type employeeAccessAssignmentRepository interface {
       Create(ctx context.Context, a *model.EmployeeAccessAssignment) error
       GetByID(ctx context.Context, id uuid.UUID) (*model.EmployeeAccessAssignment, error)
       List(ctx context.Context, tenantID uuid.UUID) ([]model.EmployeeAccessAssignment, error)
       Update(ctx context.Context, a *model.EmployeeAccessAssignment) error
       Delete(ctx context.Context, id uuid.UUID) error
   }
   ```

3. **Input structs:**
   - `CreateEmployeeAccessAssignmentInput` - TenantID, EmployeeID, AccessProfileID, ValidFrom (*time.Time), ValidTo (*time.Time)
   - `UpdateEmployeeAccessAssignmentInput` - ValidFrom, ValidTo, IsActive (*bool)

4. **Service methods:** Create (validate employee_id and profile_id are non-nil UUIDs), GetByID, Update, Delete, List

### Verification

```bash
cd apps/api && go build ./...
```

---

## Phase 7: Handler Layer + Route Registration

**Depends on:** Phase 3 (generated models) + Phase 6
**Pattern reference:**
- Handler: `/home/tolga/projects/terp/apps/api/internal/handler/contacttype.go`
- Routes: `/home/tolga/projects/terp/apps/api/internal/handler/routes.go`
- Main wiring: `/home/tolga/projects/terp/apps/api/cmd/server/main.go`

### Files to Create

#### `apps/api/internal/handler/access_zone.go`

Follow ContactTypeHandler pattern:

1. **Handler struct:**
   ```go
   type AccessZoneHandler struct {
       svc *service.AccessZoneService
   }
   func NewAccessZoneHandler(svc *service.AccessZoneService) *AccessZoneHandler
   ```

2. **Handler methods:** List, Get, Create, Update, Delete
   - List: get tenantID from middleware, call svc.List, return 200 with list response
   - Get: parse ID from URL param, call svc.GetByID, return 200
   - Create: get tenantID, decode `models.CreateAccessZoneRequest`, validate, map to service input, call svc.Create, return 201
   - Update: parse ID, decode `models.UpdateAccessZoneRequest`, validate, map to service input, call svc.Update, return 200
   - Delete: parse ID, call svc.Delete, return 204

3. **Response mapping functions:**
   - `accessZoneToResponse(*model.AccessZone) *models.AccessZone`
   - `accessZoneListToResponse([]model.AccessZone) models.AccessZoneList`

4. **Error handler:** `handleAccessZoneError(w, err)` mapping service errors to HTTP status codes

#### `apps/api/internal/handler/access_profile.go`

Same pattern as AccessZone handler.

#### `apps/api/internal/handler/employee_access_assignment.go`

Same pattern, using `models.CreateEmployeeAccessAssignmentRequest` etc. For the response mapping, include employee_id and access_profile_id as strfmt.UUID fields. Date fields (valid_from, valid_to) map to `strfmt.Date`.

### Files to Modify

#### `apps/api/internal/handler/routes.go`

Add three route registration functions after `RegisterContactKindRoutes`:

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

// RegisterAccessProfileRoutes registers access profile routes.
func RegisterAccessProfileRoutes(r chi.Router, h *AccessProfileHandler, authz *middleware.AuthorizationMiddleware) {
    // Same pattern with "/access-profiles"
}

// RegisterEmployeeAccessAssignmentRoutes registers employee access assignment routes.
func RegisterEmployeeAccessAssignmentRoutes(r chi.Router, h *EmployeeAccessAssignmentHandler, authz *middleware.AuthorizationMiddleware) {
    // Same pattern with "/employee-access-assignments"
}
```

All three use the same `access_control.manage` permission.

#### `apps/api/internal/permissions/permissions.go`

Add to `allPermissions` slice (after `terminal_bookings.manage` entry, around line 75):
```go
{ID: permissionID("access_control.manage"), Resource: "access_control", Action: "manage", Description: "Manage access zones, profiles, and assignments"},
```

#### `apps/api/cmd/server/main.go`

Add wiring in three places:

1. **Initialize repositories** (after terminal repos, around line 306):
```go
// Initialize Access Control
accessZoneRepo := repository.NewAccessZoneRepository(db)
accessProfileRepo := repository.NewAccessProfileRepository(db)
employeeAccessAssignmentRepo := repository.NewEmployeeAccessAssignmentRepository(db)
```

2. **Initialize services** (after terminal service, around line 308):
```go
accessZoneService := service.NewAccessZoneService(accessZoneRepo)
accessProfileService := service.NewAccessProfileService(accessProfileRepo)
employeeAccessAssignmentService := service.NewEmployeeAccessAssignmentService(employeeAccessAssignmentRepo)
```

3. **Initialize handlers** (after terminal handler, around line 309):
```go
accessZoneHandler := handler.NewAccessZoneHandler(accessZoneService)
accessProfileHandler := handler.NewAccessProfileHandler(accessProfileService)
employeeAccessAssignmentHandler := handler.NewEmployeeAccessAssignmentHandler(employeeAccessAssignmentService)
```

4. **Register routes** (inside tenant-scoped group, after `RegisterTerminalBookingRoutes`, around line 465):
```go
handler.RegisterAccessZoneRoutes(r, accessZoneHandler, authzMiddleware)
handler.RegisterAccessProfileRoutes(r, accessProfileHandler, authzMiddleware)
handler.RegisterEmployeeAccessAssignmentRoutes(r, employeeAccessAssignmentHandler, authzMiddleware)
```

### Verification

```bash
cd apps/api && go build ./cmd/server/...
# Should compile without errors

make dev
# Server should start. Test with:
# curl -H "Authorization: Bearer <token>" -H "X-Tenant-ID: <id>" http://localhost:8080/api/v1/access-zones
```

---

## Phase 8: Tests

**Depends on:** Phase 6
**Pattern reference:** `/home/tolga/projects/terp/apps/api/internal/service/contacttype_test.go`

### Files to Create

#### `apps/api/internal/service/access_zone_test.go`

Follow `contacttype_test.go` pattern:

```go
package service_test

// Helper: createTestTenantForAccessZone(t, db)

// Tests:
// - TestAccessZoneService_Create_Success
// - TestAccessZoneService_Create_EmptyCode
// - TestAccessZoneService_Create_EmptyName
// - TestAccessZoneService_Create_DuplicateCode
// - TestAccessZoneService_GetByID_Success
// - TestAccessZoneService_GetByID_NotFound
// - TestAccessZoneService_Update_Success
// - TestAccessZoneService_Update_NotFound
// - TestAccessZoneService_Delete_Success
// - TestAccessZoneService_Delete_NotFound
// - TestAccessZoneService_List
```

Each test:
1. Sets up test DB with `testutil.SetupTestDB(t)`
2. Creates repo and service
3. Creates test tenant
4. Tests the operation
5. Asserts expected outcome

#### `apps/api/internal/service/access_profile_test.go`

Same pattern as access_zone_test.go, plus:
- `TestAccessProfileService_Delete_InUse` (create profile, create assignment referencing it, try to delete - should fail with ErrAccessProfileInUse)

#### `apps/api/internal/service/employee_access_assignment_test.go`

Tests:
- `TestEmployeeAccessAssignmentService_Create_Success` - create tenant, employee, access profile, then assignment
- `TestEmployeeAccessAssignmentService_Create_MissingEmployee` - should fail
- `TestEmployeeAccessAssignmentService_Create_MissingProfile` - should fail
- `TestEmployeeAccessAssignmentService_GetByID_Success`
- `TestEmployeeAccessAssignmentService_GetByID_NotFound`
- `TestEmployeeAccessAssignmentService_Update_Success` - update valid_from, valid_to, is_active
- `TestEmployeeAccessAssignmentService_Delete_Success`
- `TestEmployeeAccessAssignmentService_List`

Note: Creating test employees requires using `repository.NewEmployeeRepository(db)` and creating an employee record first.

### Verification

```bash
cd apps/api && go test -v -run TestAccessZone ./internal/service/...
cd apps/api && go test -v -run TestAccessProfile ./internal/service/...
cd apps/api && go test -v -run TestEmployeeAccessAssignment ./internal/service/...
```

---

## Implementation Order (Summary)

| Step | Phase | What | Depends On |
|------|-------|------|-----------|
| 1 | Phase 1 | Database migrations | - |
| 2 | Phase 2 | OpenAPI schemas + paths + openapi.yaml updates | - |
| 3 | Phase 3 | `make swagger-bundle && make generate` | Phase 2 |
| 4 | Phase 4 | GORM model structs | Phase 1 |
| 5 | Phase 5 | Repository layer | Phase 4 |
| 6 | Phase 6 | Service layer | Phase 5 |
| 7 | Phase 7 | Handler layer + routes.go + permissions.go + main.go | Phase 3, 6 |
| 8 | Phase 8 | Unit tests | Phase 6 |

**Phases 1 and 2 can be done in parallel.**

---

## Success Criteria

1. **Three database tables created** (`access_zones`, `access_profiles`, `employee_access_assignments`) with proper constraints, indexes, and triggers
2. **15 CRUD API endpoints** operational (5 per entity: list, get, create, update, delete)
3. **OpenAPI spec** correctly defines all schemas and paths; `make swagger-bundle` succeeds
4. **Generated models** compile and are used in handlers for request/response validation
5. **Permission** `access_control.manage` is registered and enforced on all routes
6. **Tests pass**: `cd apps/api && go test ./internal/service/... -run "TestAccessZone|TestAccessProfile|TestEmployeeAccessAssignment"`
7. **Full build** succeeds: `cd apps/api && go build ./cmd/server/...`
8. **Feature is documented as placeholder** - OpenAPI descriptions and SQL comments note that full implementation requires separate ZMI Zutritt documentation

---

## Files Summary

### New Files (19)
| # | File | Phase |
|---|------|-------|
| 1 | `db/migrations/000073_create_access_control.up.sql` | 1 |
| 2 | `db/migrations/000073_create_access_control.down.sql` | 1 |
| 3 | `api/schemas/access-control.yaml` | 2 |
| 4 | `api/paths/access-control.yaml` | 2 |
| 5 | `apps/api/internal/model/access_zone.go` | 4 |
| 6 | `apps/api/internal/model/access_profile.go` | 4 |
| 7 | `apps/api/internal/model/employee_access_assignment.go` | 4 |
| 8 | `apps/api/internal/repository/access_zone.go` | 5 |
| 9 | `apps/api/internal/repository/access_profile.go` | 5 |
| 10 | `apps/api/internal/repository/employee_access_assignment.go` | 5 |
| 11 | `apps/api/internal/service/access_zone.go` | 6 |
| 12 | `apps/api/internal/service/access_profile.go` | 6 |
| 13 | `apps/api/internal/service/employee_access_assignment.go` | 6 |
| 14 | `apps/api/internal/handler/access_zone.go` | 7 |
| 15 | `apps/api/internal/handler/access_profile.go` | 7 |
| 16 | `apps/api/internal/handler/employee_access_assignment.go` | 7 |
| 17 | `apps/api/internal/service/access_zone_test.go` | 8 |
| 18 | `apps/api/internal/service/access_profile_test.go` | 8 |
| 19 | `apps/api/internal/service/employee_access_assignment_test.go` | 8 |

### Modified Files (4)
| # | File | Phase | What Changes |
|---|------|-------|-------------|
| 1 | `api/openapi.yaml` | 2 | Add 3 tags, 6 path refs, 12 definition refs |
| 2 | `apps/api/internal/permissions/permissions.go` | 7 | Add `access_control.manage` permission |
| 3 | `apps/api/internal/handler/routes.go` | 7 | Add 3 route registration functions |
| 4 | `apps/api/cmd/server/main.go` | 7 | Wire 3 repos, 3 services, 3 handlers, 3 route registrations |
