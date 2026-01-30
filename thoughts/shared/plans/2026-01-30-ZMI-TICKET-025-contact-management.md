# ZMI-TICKET-025: Contact Management Implementation Plan

## Overview

Implement configurable contact field types for employee contact data. This replaces the current hardcoded `contact_type` enum (`email`, `phone`, `mobile`, `emergency`) on `employee_contacts` with a two-tier configurable system: **Contact Types** (define data types like email, phone, text) and **Contact Kinds** (labels linked to a type, e.g. "Work Email" -> email type, "Mobile" -> phone type). Employee contacts then reference a Contact Kind instead of a free-text type string.

## Current State Analysis

### Existing Employee Contact System
- `employee_contacts` table exists (migration `000012`)
- `EmployeeContact` model in `apps/api/internal/model/employee.go` (line 105) uses `ContactType string` with hardcoded values
- Repository methods exist in `apps/api/internal/repository/employee.go` (lines 268-311): `CreateContact`, `GetContactByID`, `DeleteContact`, `ListContacts`
- Handler endpoints in `apps/api/internal/handler/routes.go` (lines 276-278): `GET/POST /{id}/contacts`, `DELETE /{id}/contacts/{contactId}`
- OpenAPI schemas in `api/schemas/employees.yaml` (lines 257-294, 605-627) define `EmployeeContact` and `CreateEmployeeContactRequest` with hardcoded enum
- Generated models in `apps/api/gen/models/` include `CreateEmployeeContactRequest` with enum validation

### Key Discoveries
- `BaseModel` exists in `model/base.go` but is NOT consistently used; models define fields directly
- Latest migration number: **000067** (system_settings)
- Permission pattern: deterministic UUIDs via `uuid.NewSHA1(ns, []byte(key))` in `permissions/permissions.go`
- BookingReason is the ideal pattern to follow (linked entity with parent FK, same CRUD shape)
- All tenant-scoped entities include `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`

## Desired End State

After implementation:
1. `contact_types` table stores configurable types with a `data_type` enum (text, email, phone, url)
2. `contact_kinds` table stores labels linked to a contact type (e.g. "Work Email" -> email, "Emergency Phone" -> phone)
3. `employee_contacts.contact_kind_id` FK replaces the free-text `contact_type` column
4. Full CRUD API for contact types and contact kinds
5. Employee contact creation validates value format based on the linked contact type's `data_type`
6. Only active contact kinds can be assigned to employee contacts
7. OpenAPI spec documents all endpoints with validation rules

### Verification
- `make migrate-up` applies cleanly
- `make swagger-bundle` produces valid bundled spec
- `make generate` produces Go models
- `make test` passes with new unit tests
- `make lint` passes

## What We're NOT Doing

- UI form layout for contact management (out of scope per ticket)
- Migrating existing employee contact data to the new FK system (data migration can be a separate task)
- Custom regex validation patterns per contact type (sticking to built-in format checks)
- Contact kind ordering/grouping beyond sort_order

## Implementation Approach

Follow the established BookingReason/Activity pattern exactly. Seven phases build on each other:
1. Database schema first (migrations)
2. OpenAPI spec (define the API contract)
3. Generate models + create domain models
4. Repository layer (data access)
5. Service layer (validation + business logic)
6. Handler layer (HTTP + route registration)
7. Tests

---

## Phase 1: Database Migrations

### Overview
Create the `contact_types` and `contact_kinds` tables, then alter `employee_contacts` to add a `contact_kind_id` FK.

### Changes Required

#### 1. Create contact_types and contact_kinds tables
**File**: `db/migrations/000068_create_contact_types.up.sql` (CREATE)

```sql
-- Contact Types: define the data format for contact fields
CREATE TABLE contact_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    data_type VARCHAR(20) NOT NULL DEFAULT 'text',
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_contact_types_tenant ON contact_types(tenant_id);
CREATE INDEX idx_contact_types_tenant_active ON contact_types(tenant_id, is_active);

CREATE TRIGGER update_contact_types_updated_at
    BEFORE UPDATE ON contact_types
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE contact_types IS 'Contact type definitions with data format (email, phone, text, url).';
COMMENT ON COLUMN contact_types.data_type IS 'Validation format: text, email, phone, url';

-- Contact Kinds: labeled instances of a contact type for use in employee contacts
CREATE TABLE contact_kinds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contact_type_id UUID NOT NULL REFERENCES contact_types(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    label VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_contact_kinds_tenant ON contact_kinds(tenant_id);
CREATE INDEX idx_contact_kinds_type ON contact_kinds(contact_type_id);
CREATE INDEX idx_contact_kinds_tenant_active ON contact_kinds(tenant_id, is_active);

CREATE TRIGGER update_contact_kinds_updated_at
    BEFORE UPDATE ON contact_kinds
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE contact_kinds IS 'Labeled contact kinds linked to a contact type for use on employee contact tab.';
```

**File**: `db/migrations/000068_create_contact_types.down.sql` (CREATE)

```sql
DROP TABLE IF EXISTS contact_kinds;
DROP TABLE IF EXISTS contact_types;
```

#### 2. Alter employee_contacts to add contact_kind_id FK
**File**: `db/migrations/000069_alter_employee_contacts_add_kind.up.sql` (CREATE)

```sql
-- Add contact_kind_id column (nullable initially for backward compatibility)
ALTER TABLE employee_contacts
    ADD COLUMN contact_kind_id UUID REFERENCES contact_kinds(id) ON DELETE SET NULL;

CREATE INDEX idx_employee_contacts_kind ON employee_contacts(contact_kind_id);

COMMENT ON COLUMN employee_contacts.contact_kind_id IS 'Reference to configurable contact kind. Replaces legacy contact_type column.';
```

**File**: `db/migrations/000069_alter_employee_contacts_add_kind.down.sql` (CREATE)

```sql
DROP INDEX IF EXISTS idx_employee_contacts_kind;
ALTER TABLE employee_contacts DROP COLUMN IF EXISTS contact_kind_id;
```

### Success Criteria

#### Automated Verification:
- [ ] Migrations apply cleanly: `make migrate-up`
- [ ] Migrations rollback cleanly: `make migrate-down` (twice) then `make migrate-up`
- [ ] Tables exist: `psql -c "\d contact_types"` and `psql -c "\d contact_kinds"`
- [ ] FK column exists: `psql -c "\d employee_contacts"` shows `contact_kind_id`

---

## Phase 2: OpenAPI Spec

### Overview
Define schemas and paths for contact types, contact kinds, and update the employee contact schemas to reference contact_kind_id.

### Changes Required

#### 1. Contact Types Schema
**File**: `api/schemas/contact-types.yaml` (CREATE)

```yaml
# Contact Type schemas
ContactType:
  type: object
  required:
    - id
    - tenant_id
    - code
    - name
    - data_type
  properties:
    id:
      type: string
      format: uuid
    tenant_id:
      type: string
      format: uuid
    code:
      type: string
      example: "EMAIL"
    name:
      type: string
      example: "Email Address"
    data_type:
      type: string
      enum:
        - text
        - email
        - phone
        - url
      example: "email"
      description: "Validation format for contact values"
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

CreateContactTypeRequest:
  type: object
  required:
    - code
    - name
    - data_type
  properties:
    code:
      type: string
      minLength: 1
      maxLength: 50
    name:
      type: string
      minLength: 1
      maxLength: 255
    data_type:
      type: string
      enum:
        - text
        - email
        - phone
        - url
    description:
      type: string
    sort_order:
      type: integer

UpdateContactTypeRequest:
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

ContactTypeList:
  type: object
  required:
    - data
  properties:
    data:
      type: array
      items:
        $ref: '#/ContactType'

# Contact Kind schemas
ContactKind:
  type: object
  required:
    - id
    - tenant_id
    - contact_type_id
    - code
    - label
  properties:
    id:
      type: string
      format: uuid
    tenant_id:
      type: string
      format: uuid
    contact_type_id:
      type: string
      format: uuid
    code:
      type: string
      example: "WORK_EMAIL"
    label:
      type: string
      example: "Work Email"
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

CreateContactKindRequest:
  type: object
  required:
    - contact_type_id
    - code
    - label
  properties:
    contact_type_id:
      type: string
      format: uuid
    code:
      type: string
      minLength: 1
      maxLength: 50
    label:
      type: string
      minLength: 1
      maxLength: 255
    sort_order:
      type: integer

UpdateContactKindRequest:
  type: object
  properties:
    label:
      type: string
      minLength: 1
      maxLength: 255
    is_active:
      type: boolean
    sort_order:
      type: integer

ContactKindList:
  type: object
  required:
    - data
  properties:
    data:
      type: array
      items:
        $ref: '#/ContactKind'
```

#### 2. Contact Types Paths
**File**: `api/paths/contact-types.yaml` (CREATE)

Follow the exact pattern from `api/paths/activities.yaml`. Define:
- `/contact-types` - GET (list with optional `active` query param), POST (create)
- `/contact-types/{id}` - GET, PATCH, DELETE
- `/contact-kinds` - GET (list with optional `contact_type_id` and `active` query params), POST (create)
- `/contact-kinds/{id}` - GET, PATCH, DELETE

Operations:
- Tags: `Contact Types` for type endpoints, `Contact Kinds` for kind endpoints
- operationId naming: `listContactTypes`, `createContactType`, `getContactType`, `updateContactType`, `deleteContactType`, `listContactKinds`, `createContactKind`, `getContactKind`, `updateContactKind`, `deleteContactKind`
- Standard error responses: 400 BadRequest, 401 Unauthorized, 404 NotFound, 409 Conflict (for code uniqueness)

#### 3. Update Employee Contact Schema
**File**: `api/schemas/employees.yaml` (MODIFY)

Add `contact_kind_id` field to `EmployeeContact` schema (optional, `x-nullable: true` for backward compatibility).

In `CreateEmployeeContactRequest`, add optional `contact_kind_id` field (uuid format). Keep the existing `contact_type` enum for backward compatibility but mark it as deprecated.

#### 4. Register in Root OpenAPI
**File**: `api/openapi.yaml` (MODIFY)

Add to `tags:` section (after "System Settings" tag, around line 145):
```yaml
  - name: Contact Types
    description: Contact type and kind management (Kontaktmanagement)
```

Add to `paths:` section (before Activities, around line 562):
```yaml
  # Contact Types
  /contact-types:
    $ref: 'paths/contact-types.yaml#/~1contact-types'
  /contact-types/{id}:
    $ref: 'paths/contact-types.yaml#/~1contact-types~1{id}'

  # Contact Kinds
  /contact-kinds:
    $ref: 'paths/contact-types.yaml#/~1contact-kinds'
  /contact-kinds/{id}:
    $ref: 'paths/contact-types.yaml#/~1contact-kinds~1{id}'
```

Add to `definitions:` section (after System Settings, around line 1256):
```yaml
  # Contact Types
  ContactType:
    $ref: 'schemas/contact-types.yaml#/ContactType'
  CreateContactTypeRequest:
    $ref: 'schemas/contact-types.yaml#/CreateContactTypeRequest'
  UpdateContactTypeRequest:
    $ref: 'schemas/contact-types.yaml#/UpdateContactTypeRequest'
  ContactTypeList:
    $ref: 'schemas/contact-types.yaml#/ContactTypeList'

  # Contact Kinds
  ContactKind:
    $ref: 'schemas/contact-types.yaml#/ContactKind'
  CreateContactKindRequest:
    $ref: 'schemas/contact-types.yaml#/CreateContactKindRequest'
  UpdateContactKindRequest:
    $ref: 'schemas/contact-types.yaml#/UpdateContactKindRequest'
  ContactKindList:
    $ref: 'schemas/contact-types.yaml#/ContactKindList'
```

### Success Criteria

#### Automated Verification:
- [ ] Spec bundles without errors: `make swagger-bundle`
- [ ] Bundled spec is valid YAML

---

## Phase 3: Model Generation and Domain Models

### Overview
Generate Go models from the updated OpenAPI spec, then create GORM domain models for ContactType and ContactKind.

### Changes Required

#### 1. Generate Models
Run `make generate` to produce generated models in `apps/api/gen/models/`. This will create:
- `contact_type.go`
- `create_contact_type_request.go`
- `update_contact_type_request.go`
- `contact_type_list.go`
- `contact_kind.go`
- `create_contact_kind_request.go`
- `update_contact_kind_request.go`
- `contact_kind_list.go`

#### 2. Create Domain Model
**File**: `apps/api/internal/model/contacttype.go` (CREATE)

Follow the pattern from `model/bookingreason.go` and `model/activity.go`:

```go
package model

import (
    "time"

    "github.com/google/uuid"
)

// ContactType defines the data format for a category of contact fields.
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

// ContactKind is a labeled instance of a ContactType for use in employee contacts.
type ContactKind struct {
    ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID      uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
    ContactTypeID uuid.UUID `gorm:"type:uuid;not null;index" json:"contact_type_id"`
    Code          string    `gorm:"type:varchar(50);not null" json:"code"`
    Label         string    `gorm:"type:varchar(255);not null" json:"label"`
    IsActive      bool      `gorm:"default:true" json:"is_active"`
    SortOrder     int       `gorm:"default:0" json:"sort_order"`
    CreatedAt     time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt     time.Time `gorm:"default:now()" json:"updated_at"`
}

func (ContactKind) TableName() string {
    return "contact_kinds"
}
```

#### 3. Update EmployeeContact Model
**File**: `apps/api/internal/model/employee.go` (MODIFY)

Add `ContactKindID` field to `EmployeeContact` struct (line ~107):

```go
type EmployeeContact struct {
    ID            uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    EmployeeID    uuid.UUID  `gorm:"type:uuid;not null;index" json:"employee_id"`
    ContactType   string     `gorm:"type:varchar(50);not null" json:"contact_type"`
    ContactKindID *uuid.UUID `gorm:"type:uuid;index" json:"contact_kind_id,omitempty"`
    Value         string     `gorm:"type:varchar(255);not null" json:"value"`
    Label         string     `gorm:"type:varchar(100)" json:"label,omitempty"`
    IsPrimary     bool       `gorm:"default:false" json:"is_primary"`
    CreatedAt     time.Time  `gorm:"default:now()" json:"created_at"`
    UpdatedAt     time.Time  `gorm:"default:now()" json:"updated_at"`
}
```

### Success Criteria

#### Automated Verification:
- [ ] Models generate cleanly: `make generate`
- [ ] Code compiles: `cd apps/api && go build ./...`
- [ ] Linting passes: `make lint`

---

## Phase 4: Repository Layer

### Overview
Create repository for contact types and contact kinds following the BookingReason repository pattern.

### Changes Required

#### 1. ContactType Repository
**File**: `apps/api/internal/repository/contacttype.go` (CREATE)

Follow `repository/bookingreason.go` pattern exactly:

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

var (
    ErrContactTypeNotFound = errors.New("contact type not found")
    ErrContactKindNotFound = errors.New("contact kind not found")
)

// ContactTypeRepository handles contact type and kind data access.
type ContactTypeRepository struct {
    db *DB
}

func NewContactTypeRepository(db *DB) *ContactTypeRepository {
    return &ContactTypeRepository{db: db}
}

// --- Contact Type methods ---

func (r *ContactTypeRepository) CreateType(ctx context.Context, ct *model.ContactType) error {
    return r.db.GORM.WithContext(ctx).Create(ct).Error
}

func (r *ContactTypeRepository) GetTypeByID(ctx context.Context, id uuid.UUID) (*model.ContactType, error) {
    var ct model.ContactType
    err := r.db.GORM.WithContext(ctx).First(&ct, "id = ?", id).Error
    if errors.Is(err, gorm.ErrRecordNotFound) {
        return nil, ErrContactTypeNotFound
    }
    if err != nil {
        return nil, fmt.Errorf("failed to get contact type: %w", err)
    }
    return &ct, nil
}

func (r *ContactTypeRepository) GetTypeByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.ContactType, error) {
    var ct model.ContactType
    err := r.db.GORM.WithContext(ctx).
        Where("tenant_id = ? AND code = ?", tenantID, code).
        First(&ct).Error
    if errors.Is(err, gorm.ErrRecordNotFound) {
        return nil, ErrContactTypeNotFound
    }
    if err != nil {
        return nil, fmt.Errorf("failed to get contact type by code: %w", err)
    }
    return &ct, nil
}

func (r *ContactTypeRepository) ListTypes(ctx context.Context, tenantID uuid.UUID) ([]model.ContactType, error) {
    var types []model.ContactType
    err := r.db.GORM.WithContext(ctx).
        Where("tenant_id = ?", tenantID).
        Order("sort_order ASC, code ASC").
        Find(&types).Error
    if err != nil {
        return nil, fmt.Errorf("failed to list contact types: %w", err)
    }
    return types, nil
}

func (r *ContactTypeRepository) ListActiveTypes(ctx context.Context, tenantID uuid.UUID) ([]model.ContactType, error) {
    var types []model.ContactType
    err := r.db.GORM.WithContext(ctx).
        Where("tenant_id = ? AND is_active = true", tenantID).
        Order("sort_order ASC, code ASC").
        Find(&types).Error
    if err != nil {
        return nil, fmt.Errorf("failed to list active contact types: %w", err)
    }
    return types, nil
}

func (r *ContactTypeRepository) UpdateType(ctx context.Context, ct *model.ContactType) error {
    return r.db.GORM.WithContext(ctx).Save(ct).Error
}

func (r *ContactTypeRepository) DeleteType(ctx context.Context, id uuid.UUID) error {
    result := r.db.GORM.WithContext(ctx).Delete(&model.ContactType{}, "id = ?", id)
    if result.Error != nil {
        return fmt.Errorf("failed to delete contact type: %w", result.Error)
    }
    if result.RowsAffected == 0 {
        return ErrContactTypeNotFound
    }
    return nil
}

// --- Contact Kind methods ---

func (r *ContactTypeRepository) CreateKind(ctx context.Context, ck *model.ContactKind) error {
    return r.db.GORM.WithContext(ctx).Create(ck).Error
}

func (r *ContactTypeRepository) GetKindByID(ctx context.Context, id uuid.UUID) (*model.ContactKind, error) {
    var ck model.ContactKind
    err := r.db.GORM.WithContext(ctx).First(&ck, "id = ?", id).Error
    if errors.Is(err, gorm.ErrRecordNotFound) {
        return nil, ErrContactKindNotFound
    }
    if err != nil {
        return nil, fmt.Errorf("failed to get contact kind: %w", err)
    }
    return &ck, nil
}

func (r *ContactTypeRepository) GetKindByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.ContactKind, error) {
    var ck model.ContactKind
    err := r.db.GORM.WithContext(ctx).
        Where("tenant_id = ? AND code = ?", tenantID, code).
        First(&ck).Error
    if errors.Is(err, gorm.ErrRecordNotFound) {
        return nil, ErrContactKindNotFound
    }
    if err != nil {
        return nil, fmt.Errorf("failed to get contact kind by code: %w", err)
    }
    return &ck, nil
}

func (r *ContactTypeRepository) ListKinds(ctx context.Context, tenantID uuid.UUID) ([]model.ContactKind, error) {
    var kinds []model.ContactKind
    err := r.db.GORM.WithContext(ctx).
        Where("tenant_id = ?", tenantID).
        Order("sort_order ASC, code ASC").
        Find(&kinds).Error
    if err != nil {
        return nil, fmt.Errorf("failed to list contact kinds: %w", err)
    }
    return kinds, nil
}

func (r *ContactTypeRepository) ListKindsByType(ctx context.Context, tenantID uuid.UUID, contactTypeID uuid.UUID) ([]model.ContactKind, error) {
    var kinds []model.ContactKind
    err := r.db.GORM.WithContext(ctx).
        Where("tenant_id = ? AND contact_type_id = ?", tenantID, contactTypeID).
        Order("sort_order ASC, code ASC").
        Find(&kinds).Error
    if err != nil {
        return nil, fmt.Errorf("failed to list contact kinds by type: %w", err)
    }
    return kinds, nil
}

func (r *ContactTypeRepository) ListActiveKinds(ctx context.Context, tenantID uuid.UUID) ([]model.ContactKind, error) {
    var kinds []model.ContactKind
    err := r.db.GORM.WithContext(ctx).
        Where("tenant_id = ? AND is_active = true", tenantID).
        Order("sort_order ASC, code ASC").
        Find(&kinds).Error
    if err != nil {
        return nil, fmt.Errorf("failed to list active contact kinds: %w", err)
    }
    return kinds, nil
}

func (r *ContactTypeRepository) UpdateKind(ctx context.Context, ck *model.ContactKind) error {
    return r.db.GORM.WithContext(ctx).Save(ck).Error
}

func (r *ContactTypeRepository) DeleteKind(ctx context.Context, id uuid.UUID) error {
    result := r.db.GORM.WithContext(ctx).Delete(&model.ContactKind{}, "id = ?", id)
    if result.Error != nil {
        return fmt.Errorf("failed to delete contact kind: %w", result.Error)
    }
    if result.RowsAffected == 0 {
        return ErrContactKindNotFound
    }
    return nil
}
```

### Success Criteria

#### Automated Verification:
- [ ] Code compiles: `cd apps/api && go build ./...`
- [ ] Linting passes: `make lint`

---

## Phase 5: Service Layer with Validation

### Overview
Create the service layer with business validation including value format validation (email, phone), uniqueness checks, and active-kind enforcement.

### Changes Required

#### 1. ContactType Service
**File**: `apps/api/internal/service/contacttype.go` (CREATE)

Follow `service/bookingreason.go` pattern:

```go
package service

import (
    "context"
    "errors"
    "net/mail"
    "regexp"
    "strings"

    "github.com/google/uuid"

    "github.com/tolga/terp/internal/model"
)

// --- Sentinel Errors ---

var (
    // Contact Type errors
    ErrContactTypeNotFound   = errors.New("contact type not found")
    ErrContactTypeCodeReq    = errors.New("contact type code is required")
    ErrContactTypeNameReq    = errors.New("contact type name is required")
    ErrContactTypeCodeExists = errors.New("contact type code already exists")
    ErrContactTypeDataTypeReq    = errors.New("contact type data_type is required")
    ErrContactTypeDataTypeInvalid = errors.New("contact type data_type must be one of: text, email, phone, url")
    ErrContactTypeInUse      = errors.New("contact type is in use by contact kinds and cannot be deleted")

    // Contact Kind errors
    ErrContactKindNotFound   = errors.New("contact kind not found")
    ErrContactKindCodeReq    = errors.New("contact kind code is required")
    ErrContactKindLabelReq   = errors.New("contact kind label is required")
    ErrContactKindCodeExists = errors.New("contact kind code already exists")
    ErrContactKindTypeIDReq  = errors.New("contact type ID is required")
    ErrContactKindInactive   = errors.New("contact kind is not active")

    // Value validation errors
    ErrContactValueRequired     = errors.New("contact value is required")
    ErrContactValueInvalidEmail = errors.New("contact value is not a valid email address")
    ErrContactValueInvalidPhone = errors.New("contact value is not a valid phone number")
    ErrContactValueInvalidURL   = errors.New("contact value is not a valid URL")
)

// Valid data types
var validDataTypes = map[string]bool{
    "text":  true,
    "email": true,
    "phone": true,
    "url":   true,
}

// Phone regex: digits, spaces, dashes, parens, plus sign; minimum 6 chars
var phoneRegex = regexp.MustCompile(`^\+?[\d\s\-\(\)]{6,}$`)

// URL regex: basic http(s) URL validation
var urlRegex = regexp.MustCompile(`^https?://[^\s]+$`)

// --- Repository Interface ---

type contactTypeRepository interface {
    // Contact Type
    CreateType(ctx context.Context, ct *model.ContactType) error
    GetTypeByID(ctx context.Context, id uuid.UUID) (*model.ContactType, error)
    GetTypeByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.ContactType, error)
    ListTypes(ctx context.Context, tenantID uuid.UUID) ([]model.ContactType, error)
    ListActiveTypes(ctx context.Context, tenantID uuid.UUID) ([]model.ContactType, error)
    UpdateType(ctx context.Context, ct *model.ContactType) error
    DeleteType(ctx context.Context, id uuid.UUID) error

    // Contact Kind
    CreateKind(ctx context.Context, ck *model.ContactKind) error
    GetKindByID(ctx context.Context, id uuid.UUID) (*model.ContactKind, error)
    GetKindByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.ContactKind, error)
    ListKinds(ctx context.Context, tenantID uuid.UUID) ([]model.ContactKind, error)
    ListKindsByType(ctx context.Context, tenantID uuid.UUID, contactTypeID uuid.UUID) ([]model.ContactKind, error)
    ListActiveKinds(ctx context.Context, tenantID uuid.UUID) ([]model.ContactKind, error)
    UpdateKind(ctx context.Context, ck *model.ContactKind) error
    DeleteKind(ctx context.Context, id uuid.UUID) error
}

// --- Service ---

type ContactTypeService struct {
    repo contactTypeRepository
}

func NewContactTypeService(repo contactTypeRepository) *ContactTypeService {
    return &ContactTypeService{repo: repo}
}

// --- Contact Type Input Structs ---

type CreateContactTypeInput struct {
    TenantID    uuid.UUID
    Code        string
    Name        string
    DataType    string
    Description string
    SortOrder   *int
}

type UpdateContactTypeInput struct {
    Name        *string
    Description *string
    IsActive    *bool
    SortOrder   *int
}

// --- Contact Type Methods ---

func (s *ContactTypeService) CreateType(ctx context.Context, input CreateContactTypeInput) (*model.ContactType, error) {
    code := strings.TrimSpace(input.Code)
    if code == "" {
        return nil, ErrContactTypeCodeReq
    }
    name := strings.TrimSpace(input.Name)
    if name == "" {
        return nil, ErrContactTypeNameReq
    }
    dataType := strings.TrimSpace(input.DataType)
    if dataType == "" {
        return nil, ErrContactTypeDataTypeReq
    }
    if !validDataTypes[dataType] {
        return nil, ErrContactTypeDataTypeInvalid
    }

    // Check code uniqueness within tenant
    existing, err := s.repo.GetTypeByCode(ctx, input.TenantID, code)
    if err == nil && existing != nil {
        return nil, ErrContactTypeCodeExists
    }

    ct := &model.ContactType{
        TenantID:    input.TenantID,
        Code:        code,
        Name:        name,
        DataType:    dataType,
        Description: strings.TrimSpace(input.Description),
        IsActive:    true,
    }
    if input.SortOrder != nil {
        ct.SortOrder = *input.SortOrder
    }

    if err := s.repo.CreateType(ctx, ct); err != nil {
        return nil, err
    }
    return ct, nil
}

func (s *ContactTypeService) GetTypeByID(ctx context.Context, id uuid.UUID) (*model.ContactType, error) {
    ct, err := s.repo.GetTypeByID(ctx, id)
    if err != nil {
        return nil, ErrContactTypeNotFound
    }
    return ct, nil
}

func (s *ContactTypeService) UpdateType(ctx context.Context, id uuid.UUID, input UpdateContactTypeInput) (*model.ContactType, error) {
    ct, err := s.repo.GetTypeByID(ctx, id)
    if err != nil {
        return nil, ErrContactTypeNotFound
    }

    if input.Name != nil {
        name := strings.TrimSpace(*input.Name)
        if name == "" {
            return nil, ErrContactTypeNameReq
        }
        ct.Name = name
    }
    if input.Description != nil {
        ct.Description = strings.TrimSpace(*input.Description)
    }
    if input.IsActive != nil {
        ct.IsActive = *input.IsActive
    }
    if input.SortOrder != nil {
        ct.SortOrder = *input.SortOrder
    }

    if err := s.repo.UpdateType(ctx, ct); err != nil {
        return nil, err
    }
    return ct, nil
}

func (s *ContactTypeService) DeleteType(ctx context.Context, id uuid.UUID) error {
    _, err := s.repo.GetTypeByID(ctx, id)
    if err != nil {
        return ErrContactTypeNotFound
    }

    // Check if any contact kinds reference this type
    kinds, err := s.repo.ListKindsByType(ctx, uuid.Nil, id)
    if err == nil && len(kinds) > 0 {
        return ErrContactTypeInUse
    }

    return s.repo.DeleteType(ctx, id)
}

func (s *ContactTypeService) ListTypes(ctx context.Context, tenantID uuid.UUID, activeOnly *bool) ([]model.ContactType, error) {
    if activeOnly != nil && *activeOnly {
        return s.repo.ListActiveTypes(ctx, tenantID)
    }
    return s.repo.ListTypes(ctx, tenantID)
}

// --- Contact Kind Input Structs ---

type CreateContactKindInput struct {
    TenantID      uuid.UUID
    ContactTypeID uuid.UUID
    Code          string
    Label         string
    SortOrder     *int
}

type UpdateContactKindInput struct {
    Label     *string
    IsActive  *bool
    SortOrder *int
}

// --- Contact Kind Methods ---

func (s *ContactTypeService) CreateKind(ctx context.Context, input CreateContactKindInput) (*model.ContactKind, error) {
    code := strings.TrimSpace(input.Code)
    if code == "" {
        return nil, ErrContactKindCodeReq
    }
    label := strings.TrimSpace(input.Label)
    if label == "" {
        return nil, ErrContactKindLabelReq
    }
    if input.ContactTypeID == uuid.Nil {
        return nil, ErrContactKindTypeIDReq
    }

    // Verify contact type exists
    _, err := s.repo.GetTypeByID(ctx, input.ContactTypeID)
    if err != nil {
        return nil, ErrContactTypeNotFound
    }

    // Check code uniqueness within tenant
    existing, err := s.repo.GetKindByCode(ctx, input.TenantID, code)
    if err == nil && existing != nil {
        return nil, ErrContactKindCodeExists
    }

    ck := &model.ContactKind{
        TenantID:      input.TenantID,
        ContactTypeID: input.ContactTypeID,
        Code:          code,
        Label:         label,
        IsActive:      true,
    }
    if input.SortOrder != nil {
        ck.SortOrder = *input.SortOrder
    }

    if err := s.repo.CreateKind(ctx, ck); err != nil {
        return nil, err
    }
    return ck, nil
}

func (s *ContactTypeService) GetKindByID(ctx context.Context, id uuid.UUID) (*model.ContactKind, error) {
    ck, err := s.repo.GetKindByID(ctx, id)
    if err != nil {
        return nil, ErrContactKindNotFound
    }
    return ck, nil
}

func (s *ContactTypeService) UpdateKind(ctx context.Context, id uuid.UUID, input UpdateContactKindInput) (*model.ContactKind, error) {
    ck, err := s.repo.GetKindByID(ctx, id)
    if err != nil {
        return nil, ErrContactKindNotFound
    }

    if input.Label != nil {
        label := strings.TrimSpace(*input.Label)
        if label == "" {
            return nil, ErrContactKindLabelReq
        }
        ck.Label = label
    }
    if input.IsActive != nil {
        ck.IsActive = *input.IsActive
    }
    if input.SortOrder != nil {
        ck.SortOrder = *input.SortOrder
    }

    if err := s.repo.UpdateKind(ctx, ck); err != nil {
        return nil, err
    }
    return ck, nil
}

func (s *ContactTypeService) DeleteKind(ctx context.Context, id uuid.UUID) error {
    _, err := s.repo.GetKindByID(ctx, id)
    if err != nil {
        return ErrContactKindNotFound
    }
    return s.repo.DeleteKind(ctx, id)
}

func (s *ContactTypeService) ListKinds(ctx context.Context, tenantID uuid.UUID, contactTypeID *uuid.UUID, activeOnly *bool) ([]model.ContactKind, error) {
    if contactTypeID != nil && *contactTypeID != uuid.Nil {
        return s.repo.ListKindsByType(ctx, tenantID, *contactTypeID)
    }
    if activeOnly != nil && *activeOnly {
        return s.repo.ListActiveKinds(ctx, tenantID)
    }
    return s.repo.ListKinds(ctx, tenantID)
}

// --- Value Validation ---

// ValidateContactValue validates a contact value based on the data_type of the
// contact kind's linked contact type. This is called when creating/updating
// employee contacts that reference a contact kind.
func (s *ContactTypeService) ValidateContactValue(ctx context.Context, contactKindID uuid.UUID, value string) error {
    value = strings.TrimSpace(value)
    if value == "" {
        return ErrContactValueRequired
    }

    // Look up the kind to get the type
    ck, err := s.repo.GetKindByID(ctx, contactKindID)
    if err != nil {
        return ErrContactKindNotFound
    }

    // Verify kind is active
    if !ck.IsActive {
        return ErrContactKindInactive
    }

    // Look up the type to get data_type
    ct, err := s.repo.GetTypeByID(ctx, ck.ContactTypeID)
    if err != nil {
        return ErrContactTypeNotFound
    }

    // Validate based on data_type
    switch ct.DataType {
    case "email":
        if _, err := mail.ParseAddress(value); err != nil {
            return ErrContactValueInvalidEmail
        }
    case "phone":
        if !phoneRegex.MatchString(value) {
            return ErrContactValueInvalidPhone
        }
    case "url":
        if !urlRegex.MatchString(value) {
            return ErrContactValueInvalidURL
        }
    case "text":
        // No additional validation for plain text
    }

    return nil
}
```

Note on `DeleteType`: The method uses `ListKindsByType` with `uuid.Nil` as tenantID which won't filter by tenant. A better approach is to pass `ct.TenantID`. The implementation should look up the type first for its tenant, then query kinds:

```go
func (s *ContactTypeService) DeleteType(ctx context.Context, id uuid.UUID) error {
    ct, err := s.repo.GetTypeByID(ctx, id)
    if err != nil {
        return ErrContactTypeNotFound
    }

    // Check if any contact kinds reference this type
    kinds, err := s.repo.ListKindsByType(ctx, ct.TenantID, id)
    if err == nil && len(kinds) > 0 {
        return ErrContactTypeInUse
    }

    return s.repo.DeleteType(ctx, id)
}
```

### Success Criteria

#### Automated Verification:
- [ ] Code compiles: `cd apps/api && go build ./...`
- [ ] Linting passes: `make lint`

---

## Phase 6: Handler Layer with Route Registration

### Overview
Create HTTP handlers for contact types and contact kinds, register routes, wire up in main.go, and add permission.

### Changes Required

#### 1. ContactType Handler
**File**: `apps/api/internal/handler/contacttype.go` (CREATE)

Follow `handler/bookingreason.go` pattern exactly. The handler should contain:

- `ContactTypeHandler` struct with `svc *service.ContactTypeService`
- `NewContactTypeHandler(svc)` constructor
- **Contact Type methods**:
  - `ListTypes(w, r)` - GET `/contact-types` with optional `?active=true` query param
  - `GetType(w, r)` - GET `/contact-types/{id}`
  - `CreateType(w, r)` - POST `/contact-types`
  - `UpdateType(w, r)` - PATCH `/contact-types/{id}`
  - `DeleteType(w, r)` - DELETE `/contact-types/{id}`
- **Contact Kind methods**:
  - `ListKinds(w, r)` - GET `/contact-kinds` with optional `?contact_type_id=X&active=true`
  - `GetKind(w, r)` - GET `/contact-kinds/{id}`
  - `CreateKind(w, r)` - POST `/contact-kinds`
  - `UpdateKind(w, r)` - PATCH `/contact-kinds/{id}`
  - `DeleteKind(w, r)` - DELETE `/contact-kinds/{id}`
- Response mappers: `contactTypeToResponse`, `contactTypeListToResponse`, `contactKindToResponse`, `contactKindListToResponse`
- Error handler: `handleContactTypeError(w, err)` mapping all sentinel errors

Response mapping pattern (following bookingreason.go):
```go
func contactTypeToResponse(ct *model.ContactType) *models.ContactType {
    id := strfmt.UUID(ct.ID.String())
    tenantID := strfmt.UUID(ct.TenantID.String())

    return &models.ContactType{
        ID:          &id,
        TenantID:    &tenantID,
        Code:        &ct.Code,
        Name:        &ct.Name,
        DataType:    &ct.DataType,
        Description: ct.Description,
        IsActive:    ct.IsActive,
        SortOrder:   int64(ct.SortOrder),
        CreatedAt:   strfmt.DateTime(ct.CreatedAt),
        UpdatedAt:   strfmt.DateTime(ct.UpdatedAt),
    }
}
```

#### 2. Add Route Registration
**File**: `apps/api/internal/handler/routes.go` (MODIFY)

Add the following function at the end of the file (before the closing brace of the package, following the pattern of `RegisterBookingReasonRoutes`):

```go
// RegisterContactTypeRoutes registers contact type and contact kind routes.
func RegisterContactTypeRoutes(r chi.Router, h *ContactTypeHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("contact_types.manage").String()

    r.Route("/contact-types", func(r chi.Router) {
        if authz == nil {
            r.Get("/", h.ListTypes)
            r.Post("/", h.CreateType)
            r.Get("/{id}", h.GetType)
            r.Patch("/{id}", h.UpdateType)
            r.Delete("/{id}", h.DeleteType)
            return
        }
        r.With(authz.RequirePermission(permManage)).Get("/", h.ListTypes)
        r.With(authz.RequirePermission(permManage)).Post("/", h.CreateType)
        r.With(authz.RequirePermission(permManage)).Get("/{id}", h.GetType)
        r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.UpdateType)
        r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.DeleteType)
    })

    r.Route("/contact-kinds", func(r chi.Router) {
        if authz == nil {
            r.Get("/", h.ListKinds)
            r.Post("/", h.CreateKind)
            r.Get("/{id}", h.GetKind)
            r.Patch("/{id}", h.UpdateKind)
            r.Delete("/{id}", h.DeleteKind)
            return
        }
        r.With(authz.RequirePermission(permManage)).Get("/", h.ListKinds)
        r.With(authz.RequirePermission(permManage)).Post("/", h.CreateKind)
        r.With(authz.RequirePermission(permManage)).Get("/{id}", h.GetKind)
        r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.UpdateKind)
        r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.DeleteKind)
    })
}
```

#### 3. Add Permission
**File**: `apps/api/internal/permissions/permissions.go` (MODIFY)

Add to the `allPermissions` slice (after the `schedules.manage` entry at line 73):
```go
{ID: permissionID("contact_types.manage"), Resource: "contact_types", Action: "manage", Description: "Manage contact types and kinds"},
```

#### 4. Wire Up in main.go
**File**: `apps/api/cmd/server/main.go` (MODIFY)

Add in the repositories section (around line 95, after `orderBookingRepo`):
```go
contactTypeRepo := repository.NewContactTypeRepository(db)
```

Add in the services section (around line 120, after `orderBookingService`):
```go
contactTypeService := service.NewContactTypeService(contactTypeRepo)
```

Add in the handlers section (around line 260, after `orderBookingHandler`):
```go
contactTypeHandler := handler.NewContactTypeHandler(contactTypeService)
```

Add in the tenant-scoped routes section (around line 438, after `RegisterSystemSettingsRoutes`):
```go
handler.RegisterContactTypeRoutes(r, contactTypeHandler, authzMiddleware)
```

### Success Criteria

#### Automated Verification:
- [ ] Code compiles: `cd apps/api && go build ./...`
- [ ] Linting passes: `make lint`
- [ ] Server starts: `make dev` (check logs for route registration)

#### Manual Verification:
- [ ] `GET /api/v1/contact-types` returns `{"data": []}` with proper auth
- [ ] `POST /api/v1/contact-types` creates a contact type
- [ ] `GET /api/v1/contact-kinds` returns `{"data": []}` with proper auth
- [ ] `POST /api/v1/contact-kinds` creates a contact kind linked to a type

---

## Phase 7: Tests

### Overview
Add unit tests for the contact type service following the activity_test.go pattern.

### Changes Required

#### 1. ContactType Service Tests
**File**: `apps/api/internal/service/contacttype_test.go` (CREATE)

Follow `service/activity_test.go` pattern. Test cases to implement:

**Contact Type Tests:**
- `TestContactTypeService_CreateType_Success` - Create with valid code/name/data_type
- `TestContactTypeService_CreateType_EmptyCode` - Returns `ErrContactTypeCodeReq`
- `TestContactTypeService_CreateType_EmptyName` - Returns `ErrContactTypeNameReq`
- `TestContactTypeService_CreateType_InvalidDataType` - Returns `ErrContactTypeDataTypeInvalid`
- `TestContactTypeService_CreateType_DuplicateCode` - Returns `ErrContactTypeCodeExists`
- `TestContactTypeService_GetTypeByID_Success` - Retrieve created type
- `TestContactTypeService_GetTypeByID_NotFound` - Returns `ErrContactTypeNotFound`
- `TestContactTypeService_UpdateType_Success` - Update name, description, is_active
- `TestContactTypeService_UpdateType_NotFound` - Returns `ErrContactTypeNotFound`
- `TestContactTypeService_DeleteType_Success` - Delete with no linked kinds
- `TestContactTypeService_DeleteType_NotFound` - Returns `ErrContactTypeNotFound`
- `TestContactTypeService_DeleteType_InUse` - Returns `ErrContactTypeInUse` when kinds exist
- `TestContactTypeService_ListTypes` - List all types for tenant

**Contact Kind Tests:**
- `TestContactTypeService_CreateKind_Success` - Create with valid code/label/type_id
- `TestContactTypeService_CreateKind_EmptyCode` - Returns `ErrContactKindCodeReq`
- `TestContactTypeService_CreateKind_EmptyLabel` - Returns `ErrContactKindLabelReq`
- `TestContactTypeService_CreateKind_InvalidTypeID` - Returns `ErrContactTypeNotFound`
- `TestContactTypeService_CreateKind_DuplicateCode` - Returns `ErrContactKindCodeExists`
- `TestContactTypeService_GetKindByID_Success` - Retrieve created kind
- `TestContactTypeService_GetKindByID_NotFound` - Returns `ErrContactKindNotFound`
- `TestContactTypeService_UpdateKind_Success` - Update label, is_active
- `TestContactTypeService_DeleteKind_Success` - Delete kind
- `TestContactTypeService_ListKinds` - List all kinds for tenant
- `TestContactTypeService_ListKindsByType` - Filter kinds by type

**Value Validation Tests:**
- `TestContactTypeService_ValidateContactValue_Email_Valid` - Valid email passes
- `TestContactTypeService_ValidateContactValue_Email_Invalid` - Invalid email returns `ErrContactValueInvalidEmail`
- `TestContactTypeService_ValidateContactValue_Phone_Valid` - Valid phone passes
- `TestContactTypeService_ValidateContactValue_Phone_Invalid` - Invalid phone returns `ErrContactValueInvalidPhone`
- `TestContactTypeService_ValidateContactValue_URL_Valid` - Valid URL passes
- `TestContactTypeService_ValidateContactValue_URL_Invalid` - Invalid URL returns `ErrContactValueInvalidURL`
- `TestContactTypeService_ValidateContactValue_Text` - Any non-empty text passes
- `TestContactTypeService_ValidateContactValue_EmptyValue` - Returns `ErrContactValueRequired`
- `TestContactTypeService_ValidateContactValue_InactiveKind` - Returns `ErrContactKindInactive`

Test helper pattern (from activity_test.go):
```go
func createTestTenantForContactTypeService(t *testing.T, db *repository.DB) *model.Tenant {
    t.Helper()
    tenantRepo := repository.NewTenantRepository(db)
    tenant := &model.Tenant{
        Name:     "Test Tenant " + uuid.New().String()[:8],
        Slug:     "test-" + uuid.New().String()[:8],
        IsActive: true,
    }
    err := tenantRepo.Create(context.Background(), tenant)
    require.NoError(t, err)
    return tenant
}

func createTestContactType(t *testing.T, svc *service.ContactTypeService, tenantID uuid.UUID, code, name, dataType string) *model.ContactType {
    t.Helper()
    ct, err := svc.CreateType(context.Background(), service.CreateContactTypeInput{
        TenantID: tenantID,
        Code:     code,
        Name:     name,
        DataType: dataType,
    })
    require.NoError(t, err)
    return ct
}
```

### Success Criteria

#### Automated Verification:
- [ ] All tests pass: `cd apps/api && go test -v -run TestContactType ./internal/service/...`
- [ ] Race detection passes: `cd apps/api && go test -race -run TestContactType ./internal/service/...`
- [ ] Full test suite still passes: `make test`

---

## Testing Strategy

### Unit Tests (Phase 7)
- Contact type CRUD validation (empty fields, duplicate codes, invalid data types)
- Contact kind CRUD validation (empty fields, duplicate codes, invalid type reference)
- Value format validation (email via `net/mail.ParseAddress`, phone via regex, URL via regex)
- Business rules: inactive kind rejection, type-in-use protection on delete

### Integration Tests (manual for now)
- Create contact type -> create contact kind -> create employee contact with kind_id -> verify retrieval
- Attempt to use inactive contact kind -> expect rejection
- Attempt to delete type with linked kinds -> expect rejection

### Validation Rules Summary

| Data Type | Validation | Error |
|-----------|-----------|-------|
| `text` | Non-empty string | `ErrContactValueRequired` |
| `email` | `net/mail.ParseAddress` | `ErrContactValueInvalidEmail` |
| `phone` | Regex: `^\+?[\d\s\-\(\)]{6,}$` | `ErrContactValueInvalidPhone` |
| `url` | Regex: `^https?://[^\s]+$` | `ErrContactValueInvalidURL` |

## Performance Considerations

- Indexes on `tenant_id`, `contact_type_id`, and `is_active` ensure efficient filtering
- `contact_kind_id` index on `employee_contacts` supports efficient joins
- List queries use `ORDER BY sort_order ASC, code ASC` for deterministic ordering

## Migration Notes

- The `contact_kind_id` column on `employee_contacts` is nullable to maintain backward compatibility with existing data
- Existing employee contacts retain their `contact_type` string value; the new `contact_kind_id` column is additive
- A future data migration task can populate `contact_kind_id` for existing records and eventually drop the `contact_type` column

## File Summary

### Files to Create
| File | Description |
|------|-------------|
| `db/migrations/000068_create_contact_types.up.sql` | Create contact_types and contact_kinds tables |
| `db/migrations/000068_create_contact_types.down.sql` | Drop tables |
| `db/migrations/000069_alter_employee_contacts_add_kind.up.sql` | Add contact_kind_id FK |
| `db/migrations/000069_alter_employee_contacts_add_kind.down.sql` | Remove FK column |
| `api/schemas/contact-types.yaml` | OpenAPI schemas for types and kinds |
| `api/paths/contact-types.yaml` | OpenAPI path definitions |
| `apps/api/internal/model/contacttype.go` | Domain models |
| `apps/api/internal/repository/contacttype.go` | Repository with CRUD |
| `apps/api/internal/service/contacttype.go` | Service with validation |
| `apps/api/internal/handler/contacttype.go` | HTTP handlers |
| `apps/api/internal/service/contacttype_test.go` | Unit tests |

### Files to Modify
| File | Change |
|------|--------|
| `api/openapi.yaml` | Add tags, paths, definitions for contact types/kinds |
| `api/schemas/employees.yaml` | Add `contact_kind_id` to EmployeeContact schema |
| `apps/api/internal/model/employee.go` | Add `ContactKindID` field to EmployeeContact |
| `apps/api/internal/handler/routes.go` | Add `RegisterContactTypeRoutes` function |
| `apps/api/internal/permissions/permissions.go` | Add `contact_types.manage` permission |
| `apps/api/cmd/server/main.go` | Wire repo/service/handler and register routes |

## References

- Ticket: `thoughts/shared/tickets/ZMI-TICKET-025-contact-management.md`
- Research: `thoughts/shared/research/2026-01-30-ZMI-TICKET-025-contact-management.md`
- Pattern reference (BookingReason): `apps/api/internal/handler/bookingreason.go`, `apps/api/internal/service/bookingreason.go`, `apps/api/internal/repository/bookingreason.go`
- Pattern reference (Activity): `apps/api/internal/model/activity.go`, `apps/api/internal/service/activity_test.go`
