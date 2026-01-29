# Research: ZMI-TICKET-010 - Booking Types and Booking Type Groups

## 1. Ticket Summary

The ticket requires enhancing the existing booking type system with:
- New fields on booking types: `category` (work/break/business_trip/other), `account_id` (FK), `requires_reason` flag
- Booking reasons: new entity linked to booking types (code, label, booking_type_id)
- Booking type groups: new entity with ordered list of booking types (name, booking_type_ids, controls terminal availability)
- Standard booking types seeding: A1/A2 (come/go), PA/PE (break start/end), DA/DE (business trip start/end)
- Full CRUD API endpoints for all entities

---

## 2. Existing Booking Type Implementation

### 2.1 Database Schema (Migration 000021)

**File**: `/home/tolga/projects/terp/db/migrations/000021_create_booking_types.up.sql`

```sql
CREATE TABLE booking_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, -- NULL for system types
    code VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    direction VARCHAR(10) NOT NULL, -- 'in' or 'out'
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_booking_types_tenant ON booking_types(tenant_id);
CREATE UNIQUE INDEX idx_booking_types_code ON booking_types(COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'), code);
```

System booking types seeded in migration:
- COME (in), GO (out), BREAK_START (out), BREAK_END (in)

Note: `tenant_id` is nullable (`*uuid.UUID` in Go) -- NULL means system type. The unique index uses COALESCE to handle NULL tenant_id.

### 2.2 Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/bookingtype.go`

```go
type BookingDirection string

const (
    BookingDirectionIn  BookingDirection = "in"
    BookingDirectionOut BookingDirection = "out"
)

type BookingType struct {
    ID          uuid.UUID        `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    *uuid.UUID       `gorm:"type:uuid;index" json:"tenant_id,omitempty"` // NULL for system types
    Code        string           `gorm:"type:varchar(20);not null" json:"code"`
    Name        string           `gorm:"type:varchar(255);not null" json:"name"`
    Description *string          `gorm:"type:text" json:"description,omitempty"`
    Direction   BookingDirection `gorm:"type:varchar(10);not null" json:"direction"`
    UsageCount  int              `gorm:"-" json:"usage_count"`
    IsSystem    bool             `gorm:"default:false" json:"is_system"`
    IsActive    bool             `gorm:"default:true" json:"is_active"`
    CreatedAt   time.Time        `gorm:"default:now()" json:"created_at"`
    UpdatedAt   time.Time        `gorm:"default:now()" json:"updated_at"`
}

func (BookingType) TableName() string { return "booking_types" }
```

Key observations:
- `TenantID` is `*uuid.UUID` (pointer) because NULL represents system types
- `UsageCount` uses `gorm:"-"` (not in DB, computed at runtime)
- Has helper methods `IsInbound()` and `IsOutbound()`
- Does NOT embed `BaseModel` -- defines fields directly

### 2.3 Repository

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/bookingtype.go`

```go
type BookingTypeRepository struct {
    db *DB
}

func NewBookingTypeRepository(db *DB) *BookingTypeRepository
```

Methods:
- `Create(ctx, *model.BookingType) error`
- `GetByID(ctx, uuid.UUID) (*model.BookingType, error)` -- includes UsageCount subquery
- `GetByCode(ctx, tenantID uuid.UUID, code string) (*model.BookingType, error)` -- uses `(tenant_id = ? OR tenant_id IS NULL)` for system types
- `Update(ctx, *model.BookingType) error` -- uses `db.GORM.WithContext(ctx).Save(bt).Error`
- `Delete(ctx, id uuid.UUID) error` -- hard delete
- `List(ctx, tenantID uuid.UUID, filter BookingTypeFilter) ([]model.BookingType, error)` -- returns system + tenant types, includes usage count subquery
- `GetSystemTypes(ctx) ([]model.BookingType, error)` -- WHERE tenant_id IS NULL AND is_system = true
- `HasBookings(ctx, bookingTypeID uuid.UUID) (bool, error)` -- checks if any bookings reference this type

Filter struct:
```go
type BookingTypeFilter struct {
    ActiveOnly *bool
    Direction  *model.BookingDirection
}
```

The `List` method does:
```go
query := r.db.GORM.WithContext(ctx).
    Where("tenant_id = ? OR tenant_id IS NULL", tenantID).
    Order("is_system DESC, code ASC")
```

The `GetByID` method includes a usage count subquery:
```go
r.db.GORM.WithContext(ctx).
    Select("booking_types.*, (SELECT COUNT(*) FROM bookings WHERE bookings.booking_type_id = booking_types.id) as usage_count").
    First(&bt, "booking_types.id = ?", id)
```

### 2.4 Service

**File**: `/home/tolga/projects/terp/apps/api/internal/service/bookingtype.go`

```go
type bookingTypeRepository interface {
    Create(ctx context.Context, bt *model.BookingType) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.BookingType, error)
    GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.BookingType, error)
    Update(ctx context.Context, bt *model.BookingType) error
    Delete(ctx context.Context, id uuid.UUID) error
    List(ctx context.Context, tenantID uuid.UUID, filter repository.BookingTypeFilter) ([]model.BookingType, error)
    GetSystemTypes(ctx context.Context) ([]model.BookingType, error)
    HasBookings(ctx context.Context, bookingTypeID uuid.UUID) (bool, error)
}
```

Error sentinels:
```go
var (
    ErrBookingTypeNotFound      = errors.New("booking type not found")
    ErrBookingTypeCodeReq       = errors.New("booking type code is required")
    ErrBookingTypeNameReq       = errors.New("booking type name is required")
    ErrBookingTypeDirectionReq  = errors.New("booking type direction is required")
    ErrInvalidDirection         = errors.New("invalid direction: must be 'in' or 'out'")
    ErrBookingTypeCodeExists    = errors.New("booking type code already exists for this tenant")
    ErrCannotModifySystemType   = errors.New("cannot modify system booking type")
    ErrCannotDeleteSystemType   = errors.New("cannot delete system booking type")
    ErrCannotDeleteTypeInUse    = errors.New("cannot delete booking type that is in use")
)
```

Input structs:
```go
type CreateBookingTypeInput struct {
    TenantID    uuid.UUID
    Code        string
    Name        string
    Description *string
    Direction   string
}

type UpdateBookingTypeInput struct {
    Name        *string
    Description *string
    IsActive    *bool
}

type ListFilter struct {
    ActiveOnly *bool
    Direction  *model.BookingDirection
}
```

Service methods:
- `Create(ctx, CreateBookingTypeInput)` -- validates code/name/direction, checks duplicate code, sets IsSystem=false, IsActive=true
- `GetByID(ctx, id)` -- wraps repo call with error mapping
- `Update(ctx, id, tenantID, UpdateBookingTypeInput)` -- checks system type, validates name, partial update pattern
- `Delete(ctx, id, tenantID)` -- checks system type, checks in-use, validates tenant ownership
- `List(ctx, tenantID, ListFilter)` -- delegates to repo
- `GetSystemTypes(ctx)` -- returns system types

### 2.5 Handler

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/bookingtype.go`

```go
type BookingTypeHandler struct {
    svc *service.BookingTypeService
}
```

Methods: `List`, `Get`, `Create`, `Update`, `Delete`

Handler pattern:
1. Extract `tenantID` from context via `middleware.TenantFromContext(r.Context())`
2. Parse URL params via `chi.URLParam(r, "id")`
3. Decode JSON body into generated model struct (e.g., `models.CreateBookingTypeRequest`)
4. Validate with `req.Validate(nil)`
5. Map to service input struct
6. Call service method
7. Map domain model to response via `bookingTypeToResponse()` helper
8. Use `respondJSON(w, statusCode, data)` or `respondError(w, statusCode, msg)`

The `bookingTypeToResponse()` function maps `model.BookingType` to `*models.BookingType` (generated model):
```go
func bookingTypeToResponse(bt *model.BookingType) *models.BookingType {
    id := strfmt.UUID(bt.ID.String())
    resp := &models.BookingType{
        ID:          &id,
        Code:        &bt.Code,
        Name:        &bt.Name,
        Description: bt.Description,
        Direction:   (*string)(&bt.Direction),
        IsSystem:    bt.IsSystem,
        IsActive:    bt.IsActive,
        UsageCount:  int64(bt.UsageCount),
        CreatedAt:   strfmt.DateTime(bt.CreatedAt),
        UpdatedAt:   strfmt.DateTime(bt.UpdatedAt),
    }
    if bt.TenantID != nil {
        tid := strfmt.UUID(bt.TenantID.String())
        resp.TenantID = tid
    }
    return resp
}
```

Error handling via switch:
```go
func handleBookingTypeError(w http.ResponseWriter, err error) {
    switch err {
    case service.ErrBookingTypeNotFound:
        respondError(w, http.StatusNotFound, ...)
    case service.ErrBookingTypeCodeExists:
        respondError(w, http.StatusConflict, ...)
    // ...
    }
}
```

### 2.6 Route Registration

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/routes.go`

```go
func RegisterBookingTypeRoutes(r chi.Router, h *BookingTypeHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("booking_types.manage").String()
    r.Route("/booking-types", func(r chi.Router) {
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

Uses permission `booking_types.manage`.

### 2.7 main.go Initialization

**File**: `/home/tolga/projects/terp/apps/api/cmd/server/main.go`

Pattern (lines 83-84, 105, 190, 290):
```go
// Repository
bookingTypeRepo := repository.NewBookingTypeRepository(db)
// Service
bookingTypeService := service.NewBookingTypeService(bookingTypeRepo)
// Handler
bookingTypeHandler := handler.NewBookingTypeHandler(bookingTypeService)
// Route registration (inside tenant-scoped group)
handler.RegisterBookingTypeRoutes(r, bookingTypeHandler, authzMiddleware)
```

### 2.8 OpenAPI Spec

**Paths file**: `/home/tolga/projects/terp/api/paths/booking-types.yaml`

Defines: `/booking-types` (GET list, POST create) and `/booking-types/{id}` (GET, PATCH, DELETE)

Uses tags: `Booking Types`, operations: `listBookingTypes`, `createBookingType`, `getBookingType`, `updateBookingType`, `deleteBookingType`

Query parameters on list: `active` (boolean, optional), `direction` (string, optional)

**Schema file**: `/home/tolga/projects/terp/api/schemas/booking-types.yaml`

Defines:
- `BookingType` -- response object with all fields
- `BookingTypeSummary` -- minimal version (id, code, name, direction)
- `CreateBookingTypeRequest` -- required: code, name, direction
- `UpdateBookingTypeRequest` -- all optional: name, description, is_active
- `BookingTypeList` -- `{ data: [BookingType] }`

**Index file**: `/home/tolga/projects/terp/api/openapi.yaml`

Paths section:
```yaml
/booking-types:
    $ref: 'paths/booking-types.yaml#/~1booking-types'
/booking-types/{id}:
    $ref: 'paths/booking-types.yaml#/~1booking-types~1{id}'
```

Definitions section:
```yaml
BookingType:
    $ref: 'schemas/booking-types.yaml#/BookingType'
BookingTypeSummary:
    $ref: 'schemas/booking-types.yaml#/BookingTypeSummary'
CreateBookingTypeRequest:
    $ref: 'schemas/booking-types.yaml#/CreateBookingTypeRequest'
UpdateBookingTypeRequest:
    $ref: 'schemas/booking-types.yaml#/UpdateBookingTypeRequest'
BookingTypeList:
    $ref: 'schemas/booking-types.yaml#/BookingTypeList'
```

### 2.9 Generated Models

**File**: `/home/tolga/projects/terp/apps/api/gen/models/booking_type.go`

Generated from OpenAPI schema with go-swagger. Contains field type mappings and validation.

**File**: `/home/tolga/projects/terp/apps/api/gen/models/create_booking_type_request.go`

Has `Validate()` method for request validation.

### 2.10 Dev Seeding

**File**: `/home/tolga/projects/terp/apps/api/internal/auth/devbookingtypes.go`

```go
var DevBookingTypes = []DevBookingType{
    {ID: "...0201", Code: "A1", Name: "Kommen", Description: "Clock In - Start of work", Direction: "in"},
    {ID: "...0202", Code: "A2", Name: "Gehen", Description: "Clock Out - End of work", Direction: "out"},
    {ID: "...0203", Code: "P1", Name: "Pause Beginn", Description: "Break Start", Direction: "out"},
    {ID: "...0204", Code: "P2", Name: "Pause Ende", Description: "Break End", Direction: "in"},
    {ID: "...0205", Code: "D1", Name: "Dienstgang Beginn", Description: "Work Errand Start", Direction: "out"},
    {ID: "...0206", Code: "D2", Name: "Dienstgang Ende", Description: "Work Errand End", Direction: "in"},
}
```

Uses deterministic UUIDs (00000000-0000-0000-0000-000000000201 through 206).

These are seeded as system-level types (tenant_id = NULL) during dev login via `auth.go` handler.

### 2.11 Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/service/bookingtype_test.go`

Test pattern:
1. Setup: `db := testutil.SetupTestDB(t)` -- creates test DB with transaction rollback
2. Create repo: `repo := repository.NewBookingTypeRepository(db)`
3. Create service: `svc := service.NewBookingTypeService(repo)`
4. Create test tenant helper: `createTestTenantForBookingTypeService(t, db)`
5. Each test function creates its own data and asserts behavior
6. Uses `testify/assert` and `testify/require`

Test coverage:
- Create: success, with description, empty code/name/direction, invalid direction, duplicate code
- GetByID: success, not found
- Update: success, with description, not found, empty name, cannot modify system type, wrong tenant
- Delete: success, not found, cannot delete system type, in use, wrong tenant
- List: all types, active only, by direction
- GetSystemTypes: returns system types only

---

## 3. Account Group Pattern (Most Recent Group Implementation)

### 3.1 Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/accountgroup.go`

```go
type AccountGroup struct {
    ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
    Code        string    `gorm:"type:varchar(50);not null" json:"code"`
    Name        string    `gorm:"type:varchar(255);not null" json:"name"`
    Description *string   `gorm:"type:text" json:"description,omitempty"`
    SortOrder   int       `gorm:"default:0" json:"sort_order"`
    IsActive    bool      `gorm:"default:true" json:"is_active"`
    CreatedAt   time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt   time.Time `gorm:"default:now()" json:"updated_at"`
}
```

Note: `TenantID` is `uuid.UUID` (NOT pointer) -- account groups are always tenant-scoped, unlike booking types where NULL means system.

Has `SortOrder` field for ordering.

### 3.2 Migration (000043)

**File**: `/home/tolga/projects/terp/db/migrations/000043_account_groups_and_fields.up.sql`

```sql
CREATE TABLE account_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_account_groups_tenant ON account_groups(tenant_id);

CREATE TRIGGER update_account_groups_updated_at
    BEFORE UPDATE ON account_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

Also adds FK column to accounts table:
```sql
ALTER TABLE accounts
    ADD COLUMN account_group_id UUID REFERENCES account_groups(id) ON DELETE SET NULL;
```

### 3.3 Repository

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/accountgroup.go`

Methods: `Create`, `GetByID`, `GetByCode`, `List`, `Update`, `Delete`

List method uses `Order("sort_order ASC, code ASC")`.

### 3.4 Service

**File**: `/home/tolga/projects/terp/apps/api/internal/service/accountgroup.go`

Interface definition:
```go
type accountGroupRepository interface {
    Create(ctx context.Context, g *model.AccountGroup) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.AccountGroup, error)
    GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.AccountGroup, error)
    List(ctx context.Context, tenantID uuid.UUID) ([]model.AccountGroup, error)
    Update(ctx context.Context, g *model.AccountGroup) error
    Delete(ctx context.Context, id uuid.UUID) error
}
```

Input structs:
```go
type CreateAccountGroupInput struct {
    TenantID    uuid.UUID
    Code        string
    Name        string
    Description string
    SortOrder   int
}

type UpdateAccountGroupInput struct {
    Code        *string
    Name        *string
    Description *string
    SortOrder   *int
    IsActive    *bool
}
```

Note: Update uses pointer fields for partial updates -- only non-nil fields are applied.

### 3.5 Handler

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/accountgroup.go`

Response conversion pattern:
```go
func accountGroupToResponse(g *model.AccountGroup) *models.AccountGroup {
    id := strfmt.UUID(g.ID.String())
    tenantID := strfmt.UUID(g.TenantID.String())
    resp := &models.AccountGroup{
        ID:          &id,
        TenantID:    tenantID,
        Code:        &g.Code,
        Name:        &g.Name,
        Description: g.Description,
        SortOrder:   int64(g.SortOrder),
        IsActive:    g.IsActive,
        CreatedAt:   strfmt.DateTime(g.CreatedAt),
        UpdatedAt:   strfmt.DateTime(g.UpdatedAt),
    }
    return resp
}
```

### 3.6 OpenAPI Schema

**File**: `/home/tolga/projects/terp/api/schemas/account-groups.yaml`

```yaml
AccountGroup:
  type: object
  required: [id, code, name]
  properties:
    id: { type: string, format: uuid }
    tenant_id: { type: string, format: uuid }
    code: { type: string }
    name: { type: string }
    description: { type: string, x-nullable: true }
    sort_order: { type: integer, example: 0 }
    is_active: { type: boolean, example: true }
    created_at: { type: string, format: date-time }
    updated_at: { type: string, format: date-time }

CreateAccountGroupRequest:
  type: object
  required: [code, name]
  properties:
    code: { type: string, minLength: 1, maxLength: 50 }
    name: { type: string, minLength: 1, maxLength: 255 }
    description: { type: string }
    sort_order: { type: integer }

UpdateAccountGroupRequest:
  type: object
  properties:
    code: { type: string, minLength: 1, maxLength: 50 }
    name: { type: string, minLength: 1, maxLength: 255 }
    description: { type: string }
    sort_order: { type: integer }
    is_active: { type: boolean }

AccountGroupList:
  type: object
  required: [data]
  properties:
    data:
      type: array
      items: { $ref: '#/AccountGroup' }
```

---

## 4. Absence Type Group Pattern (Another Reference)

### 4.1 Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/absencetypegroup.go`

```go
type AbsenceTypeGroup struct {
    ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
    Code        string    `gorm:"type:varchar(50);not null" json:"code"`
    Name        string    `gorm:"type:varchar(255);not null" json:"name"`
    Description *string   `gorm:"type:text" json:"description,omitempty"`
    IsActive    bool      `gorm:"default:true" json:"is_active"`
    CreatedAt   time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt   time.Time `gorm:"default:now()" json:"updated_at"`
}
```

Similar to AccountGroup but without `SortOrder`.

### 4.2 Migration (000042)

**File**: `/home/tolga/projects/terp/db/migrations/000042_create_absence_type_groups.up.sql`

```sql
CREATE TABLE absence_type_groups (
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
```

Also adds FK to `absence_types`:
```sql
ALTER TABLE absence_types
    ADD COLUMN absence_type_group_id UUID REFERENCES absence_type_groups(id) ON DELETE SET NULL;
```

### 4.3 Service/Repository/Handler

Same patterns as AccountGroup. Service defines interface, Input structs, error sentinels. Handler uses generated models for request/response.

---

## 5. Generic Group Pattern (Employee/Workflow/Activity Groups)

### 5.1 Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/group.go`

Three separate structs (`EmployeeGroup`, `WorkflowGroup`, `ActivityGroup`) all with same fields:
- ID, TenantID, Code, Name, Description (string, not *string), IsActive, CreatedAt, UpdatedAt
- Each has own `TableName()` method

### 5.2 Handler

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/group.go`

Uses a single `GroupHandler` struct with methods for all three group types. Route registration uses a `registerGroupCRUD` helper function.

### 5.3 Service

**File**: `/home/tolga/projects/terp/apps/api/internal/service/group.go`

Single `GroupService` wrapping three repository interfaces.

### 5.4 Routes

```go
func RegisterGroupRoutes(r chi.Router, h *GroupHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("groups.manage").String()
    // Uses registerGroupCRUD helper for /employee-groups, /workflow-groups, /activity-groups
}
```

---

## 6. Multi-Tenancy Patterns

### 6.1 Middleware

**File**: `/home/tolga/projects/terp/apps/api/internal/middleware/tenant.go`

The `RequireTenant` middleware extracts `X-Tenant-ID` header and validates it. Stores in context via `TenantFromContext()`.

### 6.2 Handler Usage

All tenant-scoped handlers extract tenant ID from context:
```go
tenantID, ok := middleware.TenantFromContext(r.Context())
if !ok {
    respondError(w, http.StatusUnauthorized, "Tenant required")
    return
}
```

### 6.3 Repository Usage

Repositories filter by tenant_id in queries:
```go
Where("tenant_id = ?", tenantID)
```

For booking types specifically, system types (tenant_id IS NULL) are included:
```go
Where("tenant_id = ? OR tenant_id IS NULL", tenantID)
```

### 6.4 Service Usage

Services receive tenantID as parameter from handlers:
- Create operations: tenantID in input struct
- Update/Delete: tenantID as separate parameter to verify ownership
- List: tenantID to scope results

---

## 7. Migration Patterns

### 7.1 Latest Migration Number

The latest migration is **000043** (`account_groups_and_fields`). New migrations for booking types enhancement should start at **000044**.

### 7.2 Migration File Naming

Pattern: `{number}_{descriptive_name}.{up|down}.sql`

Examples:
- `000021_create_booking_types.up.sql`
- `000042_create_absence_type_groups.up.sql`
- `000043_account_groups_and_fields.up.sql`

### 7.3 Common Migration Patterns

New table creation:
```sql
CREATE TABLE table_name (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    -- other fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_table_name_tenant ON table_name(tenant_id);

CREATE TRIGGER update_table_name_updated_at
    BEFORE UPDATE ON table_name
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

Adding FK column to existing table:
```sql
ALTER TABLE existing_table
    ADD COLUMN new_fk_id UUID REFERENCES new_table(id) ON DELETE SET NULL;
CREATE INDEX idx_existing_table_new_fk ON existing_table(new_fk_id);
```

Down migration:
```sql
DROP TABLE IF EXISTS table_name;
-- or for column additions:
ALTER TABLE existing_table DROP COLUMN IF EXISTS new_fk_id;
```

---

## 8. OpenAPI Conventions

### 8.1 Path File Structure

Each domain entity has its own file in `api/paths/`:
```yaml
/entity-name:
  get:
    tags: [Entity Name]
    summary: List entities
    operationId: listEntities
    responses:
      200:
        description: List of entities
        schema:
          $ref: '../schemas/entity-name.yaml#/EntityList'
  post:
    tags: [Entity Name]
    summary: Create entity
    operationId: createEntity
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '../schemas/entity-name.yaml#/CreateEntityRequest'
    responses:
      201:
        description: Created entity
        schema:
          $ref: '../schemas/entity-name.yaml#/Entity'

/entity-name/{id}:
  get:
    operationId: getEntity
  patch:
    operationId: updateEntity
  delete:
    operationId: deleteEntity
    responses:
      204:
        description: Entity deleted
```

### 8.2 Schema File Structure

Each domain entity has its own file in `api/schemas/`:
- Response object: `EntityName`
- Create request: `CreateEntityNameRequest`
- Update request: `UpdateEntityNameRequest`
- List wrapper: `EntityNameList` with `data` array

### 8.3 Index File Registration

In `api/openapi.yaml`:
- Add paths section entries (both collection and individual resource)
- Add definitions section entries for all schemas
- Add tags entry for the new tag

### 8.4 Naming Conventions

- File names: kebab-case (`booking-types.yaml`)
- Schema names: PascalCase (`BookingType`, `CreateBookingTypeRequest`)
- Operation IDs: camelCase (`listBookingTypes`, `createBookingType`)
- Tags: Title Case with spaces (`Booking Types`)
- Path segments: kebab-case (`/booking-types`)

---

## 9. Permissions

**File**: `/home/tolga/projects/terp/apps/api/internal/permissions/permissions.go`

Existing booking types permission:
```go
{ID: permissionID("booking_types.manage"), Resource: "booking_types", Action: "manage", Description: "Manage booking types"},
```

Pattern: `permissionID("resource.action")` generates deterministic UUID.

For new booking type groups, the existing `booking_types.manage` permission could be reused, or a new one could be added. The pattern follows `resource.action` naming.

---

## 10. Response Helper Patterns

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/response.go`

```go
func respondJSON(w http.ResponseWriter, status int, data interface{})
func respondError(w http.ResponseWriter, status int, message string)
```

These are used consistently across all handlers.

---

## 11. Test Patterns

### 11.1 Test Database Setup

**File**: `/home/tolga/projects/terp/apps/api/internal/testutil/db.go`

```go
func SetupTestDB(t *testing.T) *repository.DB
```

Creates a test database connection with transaction rollback for isolation.

### 11.2 Test Helper Pattern

Each test file creates domain-specific helper functions:
```go
func createTestTenantForBookingTypeService(t *testing.T, db *repository.DB) *model.Tenant {
    t.Helper()
    // Creates tenant with unique slug
}

func createTestEmployeeForBookingTypeService(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.Employee {
    t.Helper()
    // Creates employee
}
```

### 11.3 Test Structure

```go
func TestBookingTypeService_Create_Success(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := repository.NewBookingTypeRepository(db)
    svc := service.NewBookingTypeService(repo)
    ctx := context.Background()
    tenant := createTestTenantForBookingTypeService(t, db)

    input := service.CreateBookingTypeInput{...}
    result, err := svc.Create(ctx, input)
    require.NoError(t, err)
    assert.Equal(t, expected, result.Field)
}
```

Tests are located in:
- `apps/api/internal/service/bookingtype_test.go` -- service layer tests (most comprehensive)
- No separate handler tests found for booking types

---

## 12. Summary of What Needs to Change for ZMI-TICKET-010

### New Files Needed:
1. **Migration**: `db/migrations/000044_booking_type_enhancements.up.sql` / `.down.sql`
   - ALTER booking_types: add `category`, `account_id`, `requires_reason` columns
   - CREATE TABLE `booking_reasons` (code, label, booking_type_id FK)
   - CREATE TABLE `booking_type_groups` (name, tenant_id, is_active)
   - CREATE TABLE `booking_type_group_members` (group_id, booking_type_id, sort_order) -- join table

2. **Models**: New model files or extend existing
   - Update `model/bookingtype.go` -- add Category, AccountID, RequiresReason fields
   - New `model/bookingreason.go`
   - New `model/bookingtypegroup.go`

3. **Repository**: New or extend existing
   - Update `repository/bookingtype.go` -- handle new fields
   - New `repository/bookingreason.go`
   - New `repository/bookingtypegroup.go`

4. **Service**: New or extend existing
   - Update `service/bookingtype.go` -- handle new fields in Create/Update
   - New `service/bookingreason.go`
   - New `service/bookingtypegroup.go`

5. **Handler**: New or extend existing
   - Update `handler/bookingtype.go` -- handle new fields
   - New `handler/bookingreason.go`
   - New `handler/bookingtypegroup.go`

6. **OpenAPI**: New or update existing specs
   - Update `api/schemas/booking-types.yaml` -- add new fields
   - New `api/schemas/booking-reasons.yaml`
   - New `api/schemas/booking-type-groups.yaml`
   - New `api/paths/booking-reasons.yaml`
   - New `api/paths/booking-type-groups.yaml`
   - Update `api/openapi.yaml` -- add paths and definitions

7. **Route Registration**: Update `handler/routes.go` -- add new Register functions
8. **main.go**: Wire up new repos, services, handlers
9. **Dev Seeding**: Update `auth/devbookingtypes.go` -- add category, update standard types
10. **Tests**: New test files for new entities; update existing booking type tests
11. **Generated Models**: Run `make generate` after OpenAPI updates

### Existing Patterns to Follow:
- Account group pattern for booking type groups (CRUD with sort order)
- Booking type pattern for booking reasons (simple CRUD, tenant-scoped)
- Absence type group migration pattern for the join table approach
- Dev seeding pattern from `auth/devbookingtypes.go`
