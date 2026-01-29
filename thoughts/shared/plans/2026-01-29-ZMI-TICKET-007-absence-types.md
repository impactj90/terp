# ZMI-TICKET-007: Absence Types (Fehltage) - Implementation Plan

## Overview

Complete the absence type implementation by adding missing ZMI-specific fields to the OpenAPI schema, implementing code prefix and portion validation, and building the absence type groups feature. The core data model and CRUD operations already exist — this plan fills the remaining gaps identified in the ticket.

## Current State Analysis

The absence type system is substantially implemented:
- **Database**: `absence_types` table with all ZMI fields (portion, holiday_code, priority) — migration 000025
- **Model**: `AbsenceType` struct with helper methods (CreditMultiplier, CalculateCredit, GetEffectiveCode)
- **Repository**: Full CRUD + ListByCategory, GetByCode, Upsert
- **Service**: CRUD with code uniqueness checks and system type protection
- **Handler**: Full CRUD with API↔Model conversion and data scoping
- **Seed data**: 10 system types (U/UH/K/KH/KK/S/SH/SB/SD/UU)

### Key Discoveries:
- OpenAPI schema exposes `is_paid` (boolean) as proxy for `portion` — `handler/absence.go:577`
- Handler converts between API categories (sick/personal) and model categories (illness/special) — `handler/absence.go:594-622`
- Existing group pattern (EmployeeGroup/WorkflowGroup/ActivityGroup) uses FK reference — `model/group.go`
- Group handler uses shared `registerGroupCRUD` helper in routes — `handler/routes.go:628-661`
- Service validation follows strings.TrimSpace + empty check + uniqueness check pattern — `service/group.go:102-127`
- Next migration number: 000042

## Desired End State

After this plan is complete:
1. The OpenAPI schema exposes all ZMI fields (portion, holiday_code, priority, sort_order, requires_document) alongside existing fields
2. Creating/updating absence types validates code prefix per category and portion values
3. Absence type groups exist with full CRUD (table, model, repository, service, handler, OpenAPI)
4. Absence types can be assigned to a group via `absence_type_group_id`
5. All existing functionality continues to work unchanged

### How to verify:
- `make swagger-bundle && make generate` succeeds
- `make migrate-up` applies the new migration
- `make test` passes with new unit tests for validation
- `make lint` passes
- API returns new fields on GET /absence-types
- POST /absence-types rejects invalid code prefix and portion values
- CRUD on /absence-type-groups works end-to-end

## What We're NOT Doing

- **Calculation rule reference** — depends on ZMI-TICKET-013 (Absence Calculation Rules not yet implemented)
- **Linked account** — depends on ZMI-TICKET-009 (Accounts module linkage)
- **Function key shortcut** — relates to terminal hardware integration, deferred
- **Daily calculation credit integration** — the `CalculateCredit()` methods exist but wiring them into the daily calc pipeline is paired with a separate ticket
- **Removing `is_paid`** — kept for backward compatibility alongside the new `portion` field

## Implementation Approach

We follow the existing architecture: OpenAPI-first → generate models → migration → domain model → repository → service → handler → tests. Each phase is self-contained and testable.

---

## Phase 1: OpenAPI Schema & Code Generation

### Overview
Extend the absence type schema with missing ZMI fields and add the absence type group schemas and endpoints.

### Changes Required:

#### 1. Extend AbsenceType response schema
**File**: `api/schemas/absence-types.yaml`
**Changes**: Add ZMI fields to the `AbsenceType` response schema

```yaml
# Add these properties to the AbsenceType schema:
    portion:
      type: integer
      enum: [0, 1, 2]
      description: "ZMI Anteil: portion of regular hours credited (0=none, 1=full, 2=half)"
      example: 1
    holiday_code:
      type: string
      x-nullable: true
      description: "ZMI Kürzel am Feiertag: alternative code used on holidays"
      example: "UH"
    priority:
      type: integer
      description: "ZMI Priorität: higher value wins when holiday and absence overlap"
      example: 0
    sort_order:
      type: integer
      description: Display ordering
      example: 0
    requires_document:
      type: boolean
      description: Whether this absence type requires a medical certificate or document
      example: false
    absence_type_group_id:
      type: string
      format: uuid
      x-nullable: true
      description: Group this absence type belongs to
```

#### 2. Extend Create/Update request schemas
**File**: `api/schemas/absence-types.yaml`
**Changes**: Add new fields to `CreateAbsenceTypeRequest` and `UpdateAbsenceTypeRequest`

```yaml
# Add to CreateAbsenceTypeRequest properties:
    portion:
      type: integer
      enum: [0, 1, 2]
      default: 1
      description: "ZMI Anteil: 0=none, 1=full, 2=half"
    holiday_code:
      type: string
      maxLength: 10
      description: "Alternative code on holidays"
    priority:
      type: integer
      default: 0
      description: "Priority when holiday+absence overlap"
    sort_order:
      type: integer
      default: 0
    requires_document:
      type: boolean
      default: false
    absence_type_group_id:
      type: string
      format: uuid

# Add same fields to UpdateAbsenceTypeRequest (all optional)
```

#### 3. Add AbsenceTypeGroup schemas
**File**: `api/schemas/absence-type-groups.yaml` (new file)
**Changes**: Define group schemas following the existing group pattern

```yaml
AbsenceTypeGroup:
  type: object
  required:
    - id
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
    name:
      type: string
    description:
      type: string
      x-nullable: true
    is_active:
      type: boolean
      example: true
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time

CreateAbsenceTypeGroupRequest:
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

UpdateAbsenceTypeGroupRequest:
  type: object
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
    is_active:
      type: boolean

AbsenceTypeGroupList:
  type: object
  required:
    - data
  properties:
    data:
      type: array
      items:
        $ref: '#/AbsenceTypeGroup'
```

#### 4. Add AbsenceTypeGroup path endpoints
**File**: `api/paths/absence-type-groups.yaml` (new file)
**Changes**: Define CRUD endpoints for absence type groups

```yaml
/absence-type-groups:
  get:
    tags:
      - Absence Type Groups
    summary: List absence type groups
    operationId: listAbsenceTypeGroups
    responses:
      200:
        description: List of absence type groups
        schema:
          $ref: '../schemas/absence-type-groups.yaml#/AbsenceTypeGroupList'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
  post:
    tags:
      - Absence Type Groups
    summary: Create absence type group
    operationId: createAbsenceTypeGroup
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '../schemas/absence-type-groups.yaml#/CreateAbsenceTypeGroupRequest'
    responses:
      201:
        description: Created absence type group
        schema:
          $ref: '../schemas/absence-type-groups.yaml#/AbsenceTypeGroup'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      409:
        description: Code already exists
        schema:
          $ref: '../schemas/common.yaml#/ProblemDetails'

/absence-type-groups/{id}:
  get:
    tags:
      - Absence Type Groups
    summary: Get absence type group by ID
    operationId: getAbsenceTypeGroup
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
    responses:
      200:
        description: Absence type group details
        schema:
          $ref: '../schemas/absence-type-groups.yaml#/AbsenceTypeGroup'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
  patch:
    tags:
      - Absence Type Groups
    summary: Update absence type group
    operationId: updateAbsenceTypeGroup
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
      - name: body
        in: body
        required: true
        schema:
          $ref: '../schemas/absence-type-groups.yaml#/UpdateAbsenceTypeGroupRequest'
    responses:
      200:
        description: Updated absence type group
        schema:
          $ref: '../schemas/absence-type-groups.yaml#/AbsenceTypeGroup'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
  delete:
    tags:
      - Absence Type Groups
    summary: Delete absence type group
    operationId: deleteAbsenceTypeGroup
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
    responses:
      204:
        description: Absence type group deleted
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
```

#### 5. Update openapi.yaml root to include new paths
**File**: `api/openapi.yaml`
**Changes**: Add `$ref` entries for the new absence-type-groups paths

#### 6. Bundle and generate
```bash
make swagger-bundle
make generate
```

### Success Criteria:

#### Automated Verification:
- [x] `make swagger-bundle` succeeds without errors
- [x] `make generate` produces new/updated models in `apps/api/gen/models/`
- [x] Generated `AbsenceType` model includes `portion`, `holiday_code`, `priority`, `sort_order`, `requires_document`, `absence_type_group_id` fields
- [x] Generated `AbsenceTypeGroup`, `CreateAbsenceTypeGroupRequest`, `UpdateAbsenceTypeGroupRequest` models exist
- [x] `cd apps/api && go build ./...` compiles successfully

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the schema looks correct before proceeding to the next phase.

---

## Phase 2: Database Migration

### Overview
Create the absence type groups table and add the group FK column to absence_types.

### Changes Required:

#### 1. Up migration
**File**: `db/migrations/000042_create_absence_type_groups.up.sql`

```sql
-- Absence type groups for workflow selection (WebClient)
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

CREATE INDEX idx_absence_type_groups_tenant ON absence_type_groups(tenant_id);

CREATE TRIGGER update_absence_type_groups_updated_at
    BEFORE UPDATE ON absence_type_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add group FK to absence_types
ALTER TABLE absence_types
    ADD COLUMN absence_type_group_id UUID REFERENCES absence_type_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_absence_types_group ON absence_types(absence_type_group_id);

COMMENT ON TABLE absence_type_groups IS 'Groups of absence types for workflow selection in WebClient';
```

#### 2. Down migration
**File**: `db/migrations/000042_create_absence_type_groups.down.sql`

```sql
ALTER TABLE absence_types DROP COLUMN IF EXISTS absence_type_group_id;
DROP TABLE IF EXISTS absence_type_groups;
```

### Success Criteria:

#### Automated Verification:
- [x] `make migrate-up` applies cleanly
- [x] `make migrate-down` rolls back cleanly
- [x] `make migrate-up` re-applies cleanly after rollback
- [ ] `\d absence_type_groups` shows expected columns in psql
- [ ] `\d absence_types` shows `absence_type_group_id` column

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 3: Model & Repository

### Overview
Add the AbsenceTypeGroup domain model and repository, and extend the AbsenceType model with the group FK.

### Changes Required:

#### 1. AbsenceTypeGroup model
**File**: `apps/api/internal/model/absencetypegroup.go` (new file)

```go
package model

import (
    "time"
    "github.com/google/uuid"
)

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

func (AbsenceTypeGroup) TableName() string {
    return "absence_type_groups"
}
```

#### 2. Add group FK to AbsenceType model
**File**: `apps/api/internal/model/absencetype.go`
**Changes**: Add `AbsenceTypeGroupID` field and relation

```go
// Add to AbsenceType struct (after IsActive field):

    // Group assignment
    AbsenceTypeGroupID *uuid.UUID       `gorm:"type:uuid" json:"absence_type_group_id,omitempty"`
    AbsenceTypeGroup   *AbsenceTypeGroup `gorm:"foreignKey:AbsenceTypeGroupID" json:"absence_type_group,omitempty"`
```

#### 3. AbsenceTypeGroup repository
**File**: `apps/api/internal/repository/absencetypegroup.go` (new file)

Follow the existing group repository pattern (`repository/group.go`):

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

var ErrAbsenceTypeGroupNotFound = errors.New("absence type group not found")

type AbsenceTypeGroupRepository struct {
    db *DB
}

func NewAbsenceTypeGroupRepository(db *DB) *AbsenceTypeGroupRepository {
    return &AbsenceTypeGroupRepository{db: db}
}

func (r *AbsenceTypeGroupRepository) Create(ctx context.Context, g *model.AbsenceTypeGroup) error {
    return r.db.GORM.WithContext(ctx).Create(g).Error
}

func (r *AbsenceTypeGroupRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceTypeGroup, error) {
    var g model.AbsenceTypeGroup
    err := r.db.GORM.WithContext(ctx).First(&g, "id = ?", id).Error
    if errors.Is(err, gorm.ErrRecordNotFound) {
        return nil, ErrAbsenceTypeGroupNotFound
    }
    if err != nil {
        return nil, fmt.Errorf("failed to get absence type group: %w", err)
    }
    return &g, nil
}

func (r *AbsenceTypeGroupRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.AbsenceTypeGroup, error) {
    var g model.AbsenceTypeGroup
    err := r.db.GORM.WithContext(ctx).
        Where("tenant_id = ? AND code = ?", tenantID, code).
        First(&g).Error
    if errors.Is(err, gorm.ErrRecordNotFound) {
        return nil, ErrAbsenceTypeGroupNotFound
    }
    if err != nil {
        return nil, fmt.Errorf("failed to get absence type group by code: %w", err)
    }
    return &g, nil
}

func (r *AbsenceTypeGroupRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.AbsenceTypeGroup, error) {
    var groups []model.AbsenceTypeGroup
    err := r.db.GORM.WithContext(ctx).
        Where("tenant_id = ?", tenantID).
        Order("code ASC").
        Find(&groups).Error
    if err != nil {
        return nil, fmt.Errorf("failed to list absence type groups: %w", err)
    }
    return groups, nil
}

func (r *AbsenceTypeGroupRepository) Update(ctx context.Context, g *model.AbsenceTypeGroup) error {
    return r.db.GORM.WithContext(ctx).Save(g).Error
}

func (r *AbsenceTypeGroupRepository) Delete(ctx context.Context, id uuid.UUID) error {
    result := r.db.GORM.WithContext(ctx).Delete(&model.AbsenceTypeGroup{}, "id = ?", id)
    if result.Error != nil {
        return fmt.Errorf("failed to delete absence type group: %w", result.Error)
    }
    if result.RowsAffected == 0 {
        return ErrAbsenceTypeGroupNotFound
    }
    return nil
}
```

### Success Criteria:

#### Automated Verification:
- [x] `cd apps/api && go build ./...` compiles successfully
- [x] No import cycle issues

**Implementation Note**: After completing this phase, proceed directly to Phase 4 (no manual pause needed since this is just data layer code).

---

## Phase 4: Service Layer

### Overview
Add code prefix validation, portion validation, and absence type group service methods.

### Changes Required:

#### 1. Add validation to CreateType and UpdateType
**File**: `apps/api/internal/service/absence.go`
**Changes**: Add validation functions and call them from CreateType/UpdateType

```go
// New error variables:
var (
    ErrInvalidCodePrefix   = errors.New("code prefix must match category: U for vacation, K for illness, S for special")
    ErrInvalidPortion      = errors.New("portion must be 0 (none), 1 (full), or 2 (half)")
)

// New validation function:
func validateAbsenceType(at *model.AbsenceType) error {
    // Validate portion value
    if at.Portion != model.AbsencePortionNone &&
       at.Portion != model.AbsencePortionFull &&
       at.Portion != model.AbsencePortionHalf {
        return ErrInvalidPortion
    }

    // Validate code prefix per category
    code := strings.TrimSpace(at.Code)
    if code == "" {
        return errors.New("absence type code is required")
    }
    prefix := strings.ToUpper(code[:1])
    switch at.Category {
    case model.AbsenceCategoryVacation:
        if prefix != "U" {
            return fmt.Errorf("%w: vacation types must start with U, got %q", ErrInvalidCodePrefix, code)
        }
    case model.AbsenceCategoryIllness:
        if prefix != "K" {
            return fmt.Errorf("%w: illness types must start with K, got %q", ErrInvalidCodePrefix, code)
        }
    case model.AbsenceCategorySpecial:
        if prefix != "S" {
            return fmt.Errorf("%w: special types must start with S, got %q", ErrInvalidCodePrefix, code)
        }
    case model.AbsenceCategoryUnpaid:
        // Unpaid types use U prefix per ZMI convention (e.g., UU)
        if prefix != "U" {
            return fmt.Errorf("%w: unpaid types must start with U, got %q", ErrInvalidCodePrefix, code)
        }
    }
    return nil
}

// Call validateAbsenceType() at the start of CreateType and UpdateType
```

**Important**: The unpaid category uses U prefix (e.g., "UU" for Unbezahlter Urlaub) per the existing seed data. This means both vacation and unpaid share the U prefix.

#### 2. Add absence type group service
**File**: `apps/api/internal/service/absencetypegroup.go` (new file)

Follow the existing `service/group.go` pattern:

```go
package service

import (
    "context"
    "strings"

    "github.com/google/uuid"

    "github.com/tolga/terp/internal/model"
)

var (
    ErrAbsenceTypeGroupNotFound    = errors.New("absence type group not found")
    ErrAbsenceTypeGroupCodeReq     = errors.New("absence type group code is required")
    ErrAbsenceTypeGroupNameReq     = errors.New("absence type group name is required")
    ErrAbsenceTypeGroupCodeExists  = errors.New("absence type group code already exists")
)

type absenceTypeGroupRepoForService interface {
    Create(ctx context.Context, g *model.AbsenceTypeGroup) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceTypeGroup, error)
    GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.AbsenceTypeGroup, error)
    List(ctx context.Context, tenantID uuid.UUID) ([]model.AbsenceTypeGroup, error)
    Update(ctx context.Context, g *model.AbsenceTypeGroup) error
    Delete(ctx context.Context, id uuid.UUID) error
}

type AbsenceTypeGroupService struct {
    repo absenceTypeGroupRepoForService
}

func NewAbsenceTypeGroupService(repo absenceTypeGroupRepoForService) *AbsenceTypeGroupService {
    return &AbsenceTypeGroupService{repo: repo}
}

type CreateAbsenceTypeGroupInput struct {
    TenantID    uuid.UUID
    Code        string
    Name        string
    Description string
}

type UpdateAbsenceTypeGroupInput struct {
    Code        *string
    Name        *string
    Description *string
    IsActive    *bool
}

func (s *AbsenceTypeGroupService) List(ctx context.Context, tenantID uuid.UUID) ([]model.AbsenceTypeGroup, error) {
    return s.repo.List(ctx, tenantID)
}

func (s *AbsenceTypeGroupService) GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceTypeGroup, error) {
    g, err := s.repo.GetByID(ctx, id)
    if err != nil {
        return nil, ErrAbsenceTypeGroupNotFound
    }
    return g, nil
}

func (s *AbsenceTypeGroupService) Create(ctx context.Context, input CreateAbsenceTypeGroupInput) (*model.AbsenceTypeGroup, error) {
    code := strings.TrimSpace(input.Code)
    if code == "" {
        return nil, ErrAbsenceTypeGroupCodeReq
    }
    name := strings.TrimSpace(input.Name)
    if name == "" {
        return nil, ErrAbsenceTypeGroupNameReq
    }

    existing, err := s.repo.GetByCode(ctx, input.TenantID, code)
    if err == nil && existing != nil {
        return nil, ErrAbsenceTypeGroupCodeExists
    }

    g := &model.AbsenceTypeGroup{
        TenantID: input.TenantID,
        Code:     code,
        Name:     name,
        IsActive: true,
    }
    desc := strings.TrimSpace(input.Description)
    if desc != "" {
        g.Description = &desc
    }

    if err := s.repo.Create(ctx, g); err != nil {
        return nil, err
    }
    return g, nil
}

func (s *AbsenceTypeGroupService) Update(ctx context.Context, id uuid.UUID, input UpdateAbsenceTypeGroupInput) (*model.AbsenceTypeGroup, error) {
    g, err := s.repo.GetByID(ctx, id)
    if err != nil {
        return nil, ErrAbsenceTypeGroupNotFound
    }

    if input.Code != nil {
        code := strings.TrimSpace(*input.Code)
        if code != "" {
            g.Code = code
        }
    }
    if input.Name != nil {
        name := strings.TrimSpace(*input.Name)
        if name != "" {
            g.Name = name
        }
    }
    if input.Description != nil {
        desc := strings.TrimSpace(*input.Description)
        g.Description = &desc
    }
    if input.IsActive != nil {
        g.IsActive = *input.IsActive
    }

    if err := s.repo.Update(ctx, g); err != nil {
        return nil, err
    }
    return g, nil
}

func (s *AbsenceTypeGroupService) Delete(ctx context.Context, id uuid.UUID) error {
    _, err := s.repo.GetByID(ctx, id)
    if err != nil {
        return ErrAbsenceTypeGroupNotFound
    }
    return s.repo.Delete(ctx, id)
}
```

### Success Criteria:

#### Automated Verification:
- [x] `cd apps/api && go build ./...` compiles successfully
- [x] `cd apps/api && go test -v -run TestValidateAbsenceType ./internal/service/...` passes (after Phase 6)

**Implementation Note**: After completing this phase, proceed directly to Phase 5.

---

## Phase 5: Handler & Routes

### Overview
Update the absence type handler to map new fields and add the absence type group handler with route registration.

### Changes Required:

#### 1. Update absenceTypeToResponse
**File**: `apps/api/internal/handler/absence.go`
**Changes**: Add new fields to the response conversion at `absenceTypeToResponse` (line 564)

```go
// Add to the resp struct construction in absenceTypeToResponse:
resp.Portion = int64(at.Portion)
resp.Priority = int64(at.Priority)
resp.SortOrder = int64(at.SortOrder)
resp.RequiresDocument = at.RequiresDocument

if at.HolidayCode != nil {
    resp.HolidayCode = at.HolidayCode
}
if at.AbsenceTypeGroupID != nil {
    groupID := strfmt.UUID(at.AbsenceTypeGroupID.String())
    resp.AbsenceTypeGroupID = &groupID
}
```

#### 2. Update CreateType handler
**File**: `apps/api/internal/handler/absence.go`
**Changes**: Handle new fields in the create handler (line 686)

```go
// Add to the model mapping in CreateType:
if req.Portion != nil {
    at.Portion = model.AbsencePortion(*req.Portion)
}
if req.HolidayCode != "" {
    at.HolidayCode = &req.HolidayCode
}
if req.Priority != nil {
    at.Priority = int(*req.Priority)
}
if req.SortOrder != nil {
    at.SortOrder = int(*req.SortOrder)
}
if req.RequiresDocument != nil {
    at.RequiresDocument = *req.RequiresDocument
}
if req.AbsenceTypeGroupID != nil {
    groupID, err := uuid.Parse(req.AbsenceTypeGroupID.String())
    if err == nil {
        at.AbsenceTypeGroupID = &groupID
    }
}
```

Also add error mapping for new validation errors:
```go
case service.ErrInvalidCodePrefix:
    respondError(w, http.StatusBadRequest, err.Error())
case service.ErrInvalidPortion:
    respondError(w, http.StatusBadRequest, err.Error())
```

#### 3. Update UpdateType handler
**File**: `apps/api/internal/handler/absence.go`
**Changes**: Handle new fields in the update handler (line 746)

```go
// Add to the update merge logic:
if req.Portion != nil {
    existing.Portion = model.AbsencePortion(*req.Portion)
}
if req.HolidayCode != nil {
    existing.HolidayCode = req.HolidayCode
}
if req.Priority != nil {
    existing.Priority = int(*req.Priority)
}
if req.SortOrder != nil {
    existing.SortOrder = int(*req.SortOrder)
}
if req.RequiresDocument != nil {
    existing.RequiresDocument = *req.RequiresDocument
}
if req.AbsenceTypeGroupID != nil {
    groupID, err := uuid.Parse(req.AbsenceTypeGroupID.String())
    if err == nil {
        existing.AbsenceTypeGroupID = &groupID
    }
}
```

#### 4. Add AbsenceTypeGroup handler
**File**: `apps/api/internal/handler/absencetypegroup.go` (new file)

Follow the existing group handler pattern (`handler/group.go`):

```go
package handler

import (
    "encoding/json"
    "net/http"

    "github.com/go-chi/chi/v5"
    "github.com/google/uuid"

    "github.com/tolga/terp/gen/models"
    "github.com/tolga/terp/internal/middleware"
    "github.com/tolga/terp/internal/service"
)

type AbsenceTypeGroupHandler struct {
    svc *service.AbsenceTypeGroupService
}

func NewAbsenceTypeGroupHandler(svc *service.AbsenceTypeGroupService) *AbsenceTypeGroupHandler {
    return &AbsenceTypeGroupHandler{svc: svc}
}

func (h *AbsenceTypeGroupHandler) List(w http.ResponseWriter, r *http.Request) {
    tenantID, ok := middleware.TenantFromContext(r.Context())
    if !ok {
        respondError(w, http.StatusUnauthorized, "Tenant required")
        return
    }
    groups, err := h.svc.List(r.Context(), tenantID)
    if err != nil {
        respondError(w, http.StatusInternalServerError, "Failed to list absence type groups")
        return
    }
    respondJSON(w, http.StatusOK, map[string]any{"data": groups})
}

func (h *AbsenceTypeGroupHandler) Get(w http.ResponseWriter, r *http.Request) {
    id, err := uuid.Parse(chi.URLParam(r, "id"))
    if err != nil {
        respondError(w, http.StatusBadRequest, "Invalid group ID")
        return
    }
    g, err := h.svc.GetByID(r.Context(), id)
    if err != nil {
        respondError(w, http.StatusNotFound, "Absence type group not found")
        return
    }
    respondJSON(w, http.StatusOK, g)
}

func (h *AbsenceTypeGroupHandler) Create(w http.ResponseWriter, r *http.Request) {
    tenantID, ok := middleware.TenantFromContext(r.Context())
    if !ok {
        respondError(w, http.StatusUnauthorized, "Tenant required")
        return
    }
    var req models.CreateAbsenceTypeGroupRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        respondError(w, http.StatusBadRequest, "Invalid request body")
        return
    }
    if err := req.Validate(nil); err != nil {
        respondError(w, http.StatusBadRequest, err.Error())
        return
    }
    input := service.CreateAbsenceTypeGroupInput{
        TenantID:    tenantID,
        Code:        *req.Code,
        Name:        *req.Name,
        Description: req.Description,
    }
    g, err := h.svc.Create(r.Context(), input)
    if err != nil {
        handleAbsenceTypeGroupError(w, err)
        return
    }
    respondJSON(w, http.StatusCreated, g)
}

func (h *AbsenceTypeGroupHandler) Update(w http.ResponseWriter, r *http.Request) {
    id, err := uuid.Parse(chi.URLParam(r, "id"))
    if err != nil {
        respondError(w, http.StatusBadRequest, "Invalid group ID")
        return
    }
    var req models.UpdateAbsenceTypeGroupRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        respondError(w, http.StatusBadRequest, "Invalid request body")
        return
    }
    if err := req.Validate(nil); err != nil {
        respondError(w, http.StatusBadRequest, err.Error())
        return
    }
    input := service.UpdateAbsenceTypeGroupInput{}
    if req.Code != "" {
        input.Code = &req.Code
    }
    if req.Name != "" {
        input.Name = &req.Name
    }
    if req.Description != "" {
        input.Description = &req.Description
    }
    input.IsActive = &req.IsActive

    g, err := h.svc.Update(r.Context(), id, input)
    if err != nil {
        handleAbsenceTypeGroupError(w, err)
        return
    }
    respondJSON(w, http.StatusOK, g)
}

func (h *AbsenceTypeGroupHandler) Delete(w http.ResponseWriter, r *http.Request) {
    id, err := uuid.Parse(chi.URLParam(r, "id"))
    if err != nil {
        respondError(w, http.StatusBadRequest, "Invalid group ID")
        return
    }
    if err := h.svc.Delete(r.Context(), id); err != nil {
        handleAbsenceTypeGroupError(w, err)
        return
    }
    w.WriteHeader(http.StatusNoContent)
}

func handleAbsenceTypeGroupError(w http.ResponseWriter, err error) {
    switch err {
    case service.ErrAbsenceTypeGroupNotFound:
        respondError(w, http.StatusNotFound, "Absence type group not found")
    case service.ErrAbsenceTypeGroupCodeReq:
        respondError(w, http.StatusBadRequest, "Group code is required")
    case service.ErrAbsenceTypeGroupNameReq:
        respondError(w, http.StatusBadRequest, "Group name is required")
    case service.ErrAbsenceTypeGroupCodeExists:
        respondError(w, http.StatusConflict, "A group with this code already exists")
    default:
        respondError(w, http.StatusInternalServerError, "Internal server error")
    }
}
```

#### 5. Register routes
**File**: `apps/api/internal/handler/routes.go`
**Changes**: Add `RegisterAbsenceTypeGroupRoutes` function

```go
func RegisterAbsenceTypeGroupRoutes(r chi.Router, h *AbsenceTypeGroupHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("absence_types.manage").String()
    r.Route("/absence-type-groups", func(r chi.Router) {
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

#### 6. Wire up in main.go
**File**: `apps/api/cmd/server/main.go`
**Changes**: Create the repository, service, handler, and register routes

```go
// Add to the initialization section:
absenceTypeGroupRepo := repository.NewAbsenceTypeGroupRepository(db)
absenceTypeGroupSvc := service.NewAbsenceTypeGroupService(absenceTypeGroupRepo)
absenceTypeGroupHandler := handler.NewAbsenceTypeGroupHandler(absenceTypeGroupSvc)

// Add to route registration:
handler.RegisterAbsenceTypeGroupRoutes(r, absenceTypeGroupHandler, authzMiddleware)
```

### Success Criteria:

#### Automated Verification:
- [x] `cd apps/api && go build ./...` compiles successfully
- [ ] `make lint` passes
- [x] `make test` passes

#### Manual Verification:
- [ ] `GET /absence-types` returns new fields (portion, holiday_code, priority, sort_order, requires_document)
- [ ] `POST /absence-types` with invalid code prefix returns 400 with clear error message
- [ ] `POST /absence-types` with invalid portion returns 400
- [ ] `POST /absence-types` with valid data creates successfully with all new fields
- [ ] `PATCH /absence-types/{id}` updates new fields correctly
- [ ] CRUD on `/absence-type-groups` works end-to-end
- [ ] Assigning an absence type to a group via `absence_type_group_id` works
- [ ] Swagger UI at `/swagger/` documents all new fields and endpoints

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 6.

---

## Phase 6: Tests

### Overview
Add unit tests for the new validation logic and service methods.

### Changes Required:

#### 1. Absence type validation tests
**File**: `apps/api/internal/service/absence_test.go` (add to existing or create)

```go
// Test cases:
// 1. Code prefix validation - vacation type with K prefix → error
// 2. Code prefix validation - illness type with U prefix → error
// 3. Code prefix validation - special type with K prefix → error
// 4. Code prefix validation - valid vacation U → no error
// 5. Code prefix validation - valid illness K → no error
// 6. Code prefix validation - valid special S → no error
// 7. Code prefix validation - unpaid UU → no error
// 8. Portion validation - value 3 → error
// 9. Portion validation - value -1 → error
// 10. Portion validation - values 0, 1, 2 → no error
// 11. Holiday code applied only on holiday context
// 12. Priority ordering: higher value wins
```

Test case from ticket:
```
Input: category=vacation, code=KX
Expected: validation error (must start with U)
```

#### 2. Absence type group service tests
**File**: `apps/api/internal/service/absencetypegroup_test.go` (new file)

```go
// Test cases:
// 1. Create group - valid input → success
// 2. Create group - empty code → error
// 3. Create group - empty name → error
// 4. Create group - duplicate code → error
// 5. Get group by ID - exists → success
// 6. Get group by ID - not found → error
// 7. Update group - valid input → success
// 8. Delete group - exists → success
// 9. Delete group - not found → error
// 10. List groups - returns tenant groups
```

### Success Criteria:

#### Automated Verification:
- [x] `cd apps/api && go test -v ./internal/service/...` passes all new tests
- [x] `make test` passes with no regressions
- [ ] `make lint` passes

---

## Testing Strategy

### Unit Tests:
- Validate code prefix rules for K/S/U by category
- Validate portion values and reject invalid integers
- Holiday code applied only on holiday context (via GetEffectiveCode)
- Priority ordering comparator behaves deterministically
- Absence type group CRUD operations with validation

### API Tests:
- Create absence types for K/S/U categories and verify stored fields
- Update priority and holiday code; verify persisted changes
- Create absence groups and assign types; list group contents
- Verify new fields appear in GET responses

### Manual Testing Steps:
1. Start the dev server (`make dev`)
2. Open Swagger UI at `/swagger/`
3. Verify all new fields and endpoints are documented
4. Create an absence type with all ZMI fields via POST
5. Verify invalid code prefix (e.g., category=vacation, code=KX) returns 400
6. Verify invalid portion (e.g., portion=5) returns 400
7. Create an absence type group and assign a type to it

## Performance Considerations

No performance concerns — this plan adds validation logic (O(1) per request) and a small lookup table (absence_type_groups). No queries change in complexity.

## Migration Notes

- The new migration (000042) is purely additive: new table + new nullable column. No existing data is modified.
- The `absence_type_group_id` FK uses `ON DELETE SET NULL` so deleting a group doesn't cascade to absence types.
- Existing absence types will have `absence_type_group_id = NULL` after migration, which is the expected default.

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-007-absence-types.md`
- Research document: `thoughts/shared/research/2026-01-29-ZMI-TICKET-007-absence-types.md`
- Existing group pattern: `apps/api/internal/model/group.go`, `handler/group.go`, `service/group.go`
- Existing absence handler: `apps/api/internal/handler/absence.go`
- Existing absence service: `apps/api/internal/service/absence.go`
- ZMI manual reference: `thoughts/shared/reference/zmi-calculation-manual-reference.md` (Section 15, pages 159-161)
