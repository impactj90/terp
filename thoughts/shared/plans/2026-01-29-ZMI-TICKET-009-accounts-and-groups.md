# ZMI-TICKET-009: Accounts and Account Groups Implementation Plan

## Overview

Extend the existing Account entity with ZMI-aligned fields (display_format, bonus_factor, account_group_id) and migrate the account_type enum from bonus/tracking/balance to bonus/day/month. Create a new AccountGroup entity (CRUD) following the AbsenceTypeGroup pattern. Wire the existing but unimplemented `payroll_relevant` list filter.

## Current State Analysis

The Account entity is fully implemented across all layers (migration, model, repo, service, handler, OpenAPI). Most ticket-required fields already exist. **Account Groups do not exist yet.** The AbsenceTypeGroup entity (`apps/api/internal/model/absencetypegroup.go`) provides an exact template for the group pattern.

### Key Discoveries:
- Account full stack: `model/account.go:25-42`, `repository/account.go`, `service/account.go`, `handler/account.go`
- AbsenceTypeGroup template: `model/absencetypegroup.go`, `repository/absencetypegroup.go`, `service/absencetypegroup.go`, `handler/absencetypegroup.go`
- Route registration pattern: `handler/routes.go:128-148` (RegisterAccountRoutes), `handler/routes.go:630-648` (RegisterAbsenceTypeGroupRoutes)
- Main.go wiring: `cmd/server/main.go:71` (accountRepo), `cmd/server/main.go:94` (accountService), `cmd/server/main.go:178` (accountHandler), `cmd/server/main.go:274` (route registration)
- AbsenceTypeGroup wiring: `cmd/server/main.go:113` (repo), `cmd/server/main.go:194` (service+handler), `cmd/server/main.go:290` (route registration)
- Next migration number: **000043**
- Account type enum currently: bonus/tracking/balance (in DB, model, OpenAPI, generated models, tests, dev seeds)
- OpenAPI spec already defines `payroll_relevant` query param (`api/paths/accounts.yaml:29-32`) but handler doesn't implement it
- System accounts seeded in migration 000006: FLEX (balance), OT (balance), VAC (balance) — all need type migration to "month"
- Dev seed accounts in `auth/devaccounts.go:18-61`: tracking→day, balance→month

## Desired End State

After this plan is complete:
1. Account model has `display_format` (decimal/hh_mm), `bonus_factor` (NUMERIC), and `account_group_id` (FK) fields
2. Account type enum uses ZMI values: `bonus`, `day`, `month` (was: bonus, tracking, balance)
3. AccountGroup entity exists with full CRUD (model, repo, service, handler, routes, OpenAPI)
4. Accounts can be assigned to groups via nullable FK
5. List endpoint supports `payroll_relevant` filter
6. All existing tests pass with updated enum values
7. Generated models reflect new schemas

### Verification:
- `make test` passes
- `make lint` passes
- `make swagger-bundle` succeeds
- `make generate` produces updated models
- `make migrate-up` applies cleanly
- API returns accounts with new fields (display_format, bonus_factor, account_group_id)
- API CRUD for account groups works
- Filtering by `payroll_relevant=true` returns only payroll-relevant accounts

## What We're NOT Doing

- Calculation rules that write into accounts (separate tickets)
- Format conversion helpers (decimal ↔ HH:MM) — display logic is frontend concern
- Account value time-series queries (already exist)
- Group-specific sort ordering (using existing `sort_order` field on Account)
- Payroll export integration (separate ticket)
- Bonus factor calculation logic (just adding the field for now)

## Implementation Approach

Five sequential phases: database migration first, then OpenAPI + code generation, then account group full stack, then account model updates, then the payroll filter. Each phase builds on the previous one.

---

## Phase 1: Database Migration

### Overview
Create the `account_groups` table and add new columns to `accounts`. Migrate existing account_type values.

### Changes Required:

#### 1. Migration Up
**File**: `db/migrations/000043_account_groups_and_fields.up.sql`
**Changes**: New file

```sql
-- Account groups for organizing accounts in display/reporting
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

COMMENT ON TABLE account_groups IS 'Groups of accounts for display and reporting organization';

-- Add new fields to accounts
ALTER TABLE accounts
    ADD COLUMN account_group_id UUID REFERENCES account_groups(id) ON DELETE SET NULL,
    ADD COLUMN display_format VARCHAR(20) NOT NULL DEFAULT 'decimal',
    ADD COLUMN bonus_factor NUMERIC(5,2);

CREATE INDEX idx_accounts_group ON accounts(account_group_id);

-- Migrate account_type enum values: tracking -> day, balance -> month
UPDATE accounts SET account_type = 'day' WHERE account_type = 'tracking';
UPDATE accounts SET account_type = 'month' WHERE account_type = 'balance';

-- Update comment on accounts table for new enum values
COMMENT ON COLUMN accounts.account_type IS 'Account type: bonus, day, or month';
COMMENT ON COLUMN accounts.display_format IS 'Display format: decimal or hh_mm';
COMMENT ON COLUMN accounts.bonus_factor IS 'Multiplier for bonus calculations (e.g. 1.50 for 150%)';
```

#### 2. Migration Down
**File**: `db/migrations/000043_account_groups_and_fields.down.sql`
**Changes**: New file

```sql
-- Revert account_type enum values: day -> tracking, month -> balance
UPDATE accounts SET account_type = 'tracking' WHERE account_type = 'day';
UPDATE accounts SET account_type = 'balance' WHERE account_type = 'month';

-- Remove new columns from accounts
ALTER TABLE accounts
    DROP COLUMN IF EXISTS bonus_factor,
    DROP COLUMN IF EXISTS display_format,
    DROP COLUMN IF EXISTS account_group_id;

-- Drop account groups table
DROP TABLE IF EXISTS account_groups;
```

### Success Criteria:

#### Automated Verification:
- [x] Migration applies cleanly: `make migrate-up`
- [x] Migration rollback works: `make migrate-down` then `make migrate-up`
- [x] Existing account data preserved with updated type values

#### Manual Verification:
- [ ] Verify in DB: `SELECT DISTINCT account_type FROM accounts` returns only `bonus`, `day`, `month`
- [ ] Verify `account_groups` table exists with correct schema

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: OpenAPI Spec Updates + Code Generation

### Overview
Add account group schemas and paths. Update account schemas with new fields and corrected enum values. Generate Go models.

### Changes Required:

#### 1. Account Group Schemas
**File**: `api/schemas/account-groups.yaml`
**Changes**: New file (modeled on `api/schemas/absence-type-groups.yaml`)

```yaml
# Account Group schemas
AccountGroup:
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
    sort_order:
      type: integer
      example: 0
    is_active:
      type: boolean
      example: true
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time

CreateAccountGroupRequest:
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

UpdateAccountGroupRequest:
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
    sort_order:
      type: integer
    is_active:
      type: boolean

AccountGroupList:
  type: object
  required:
    - data
  properties:
    data:
      type: array
      items:
        $ref: '#/AccountGroup'
```

#### 2. Account Group Paths
**File**: `api/paths/account-groups.yaml`
**Changes**: New file (modeled on `api/paths/absence-type-groups.yaml`)

```yaml
# Account Group endpoints
/account-groups:
  get:
    tags:
      - Account Groups
    summary: List account groups
    operationId: listAccountGroups
    responses:
      200:
        description: List of account groups
        schema:
          $ref: '../schemas/account-groups.yaml#/AccountGroupList'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
  post:
    tags:
      - Account Groups
    summary: Create account group
    operationId: createAccountGroup
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '../schemas/account-groups.yaml#/CreateAccountGroupRequest'
    responses:
      201:
        description: Created account group
        schema:
          $ref: '../schemas/account-groups.yaml#/AccountGroup'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      409:
        description: Code already exists
        schema:
          $ref: '../schemas/common.yaml#/ProblemDetails'

/account-groups/{id}:
  get:
    tags:
      - Account Groups
    summary: Get account group by ID
    operationId: getAccountGroup
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
    responses:
      200:
        description: Account group details
        schema:
          $ref: '../schemas/account-groups.yaml#/AccountGroup'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
  patch:
    tags:
      - Account Groups
    summary: Update account group
    operationId: updateAccountGroup
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
          $ref: '../schemas/account-groups.yaml#/UpdateAccountGroupRequest'
    responses:
      200:
        description: Updated account group
        schema:
          $ref: '../schemas/account-groups.yaml#/AccountGroup'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
  delete:
    tags:
      - Account Groups
    summary: Delete account group
    operationId: deleteAccountGroup
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
    responses:
      204:
        description: Account group deleted
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
```

#### 3. Update Account Schemas
**File**: `api/schemas/accounts.yaml`
**Changes**: Update existing file

- Change `account_type` enum from `[bonus, tracking, balance]` to `[bonus, day, month]` in all three schemas (Account, CreateAccountRequest, UpdateAccountRequest — note: UpdateAccountRequest does not currently have account_type, keep it that way since type shouldn't change after creation)
- Add `display_format` field to Account, CreateAccountRequest, UpdateAccountRequest:
  ```yaml
  display_format:
    type: string
    enum:
      - decimal
      - hh_mm
    description: Display format for account values
    example: "decimal"
  ```
- Add `bonus_factor` field to Account, CreateAccountRequest, UpdateAccountRequest:
  ```yaml
  bonus_factor:
    type: number
    format: double
    x-nullable: true
    description: Multiplier for bonus calculations (e.g. 1.5 for 150%)
    example: 1.5
  ```
- Add `account_group_id` field to Account, CreateAccountRequest, UpdateAccountRequest:
  ```yaml
  account_group_id:
    type: string
    format: uuid
    x-nullable: true
    description: ID of the account group this account belongs to
  ```

#### 4. Update OpenAPI Root Spec
**File**: `api/openapi.yaml`
**Changes**: Add account group paths and schema definitions

Add after the absence-type-groups paths section (after line ~406):
```yaml
  # Account Groups
  /account-groups:
    $ref: 'paths/account-groups.yaml#/~1account-groups'
  /account-groups/{id}:
    $ref: 'paths/account-groups.yaml#/~1account-groups~1{id}'
```

Add in definitions section (after the AbsenceTypeGroupList definition):
```yaml
  AccountGroup:
    $ref: 'schemas/account-groups.yaml#/AccountGroup'
  CreateAccountGroupRequest:
    $ref: 'schemas/account-groups.yaml#/CreateAccountGroupRequest'
  UpdateAccountGroupRequest:
    $ref: 'schemas/account-groups.yaml#/UpdateAccountGroupRequest'
  AccountGroupList:
    $ref: 'schemas/account-groups.yaml#/AccountGroupList'
```

#### 5. Bundle and Generate
Run:
```bash
make swagger-bundle
make generate
```

### Success Criteria:

#### Automated Verification:
- [x] `make swagger-bundle` succeeds
- [x] `make generate` succeeds
- [x] Generated models in `apps/api/gen/models/` contain:
  - `account_group.go` with AccountGroup struct
  - `create_account_group_request.go`
  - `update_account_group_request.go`
  - `account_group_list.go`
  - Updated `account.go` with display_format, bonus_factor, account_group_id
  - Updated `create_account_request.go` with new fields
  - Updated enum values: bonus, day, month (not tracking, balance)

#### Manual Verification:
- [ ] Review generated models for correct field types and enum values

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Account Group Full Stack

### Overview
Implement AccountGroup entity across model, repository, service, handler, and route layers. Wire into main.go. Follow AbsenceTypeGroup pattern exactly.

### Changes Required:

#### 1. AccountGroup Model
**File**: `apps/api/internal/model/accountgroup.go`
**Changes**: New file

```go
package model

import (
	"time"

	"github.com/google/uuid"
)

// AccountGroup represents a grouping of accounts for display and reporting.
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

func (AccountGroup) TableName() string {
	return "account_groups"
}
```

#### 2. AccountGroup Repository
**File**: `apps/api/internal/repository/accountgroup.go`
**Changes**: New file (modeled on `repository/absencetypegroup.go`)

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

var ErrAccountGroupNotFound = errors.New("account group not found")

type AccountGroupRepository struct {
	db *DB
}

func NewAccountGroupRepository(db *DB) *AccountGroupRepository {
	return &AccountGroupRepository{db: db}
}

func (r *AccountGroupRepository) Create(ctx context.Context, g *model.AccountGroup) error {
	return r.db.GORM.WithContext(ctx).Create(g).Error
}

func (r *AccountGroupRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.AccountGroup, error) {
	var g model.AccountGroup
	err := r.db.GORM.WithContext(ctx).First(&g, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrAccountGroupNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get account group: %w", err)
	}
	return &g, nil
}

func (r *AccountGroupRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.AccountGroup, error) {
	var g model.AccountGroup
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&g).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrAccountGroupNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get account group by code: %w", err)
	}
	return &g, nil
}

func (r *AccountGroupRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.AccountGroup, error) {
	var groups []model.AccountGroup
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("sort_order ASC, code ASC").
		Find(&groups).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list account groups: %w", err)
	}
	return groups, nil
}

func (r *AccountGroupRepository) Update(ctx context.Context, g *model.AccountGroup) error {
	return r.db.GORM.WithContext(ctx).Save(g).Error
}

func (r *AccountGroupRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.AccountGroup{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete account group: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrAccountGroupNotFound
	}
	return nil
}
```

#### 3. AccountGroup Service
**File**: `apps/api/internal/service/accountgroup.go`
**Changes**: New file (modeled on `service/absencetypegroup.go`)

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
	ErrAccountGroupNotFound    = errors.New("account group not found")
	ErrAccountGroupCodeRequired = errors.New("account group code is required")
	ErrAccountGroupNameRequired = errors.New("account group name is required")
	ErrAccountGroupCodeExists   = errors.New("account group code already exists for this tenant")
)

type accountGroupRepository interface {
	Create(ctx context.Context, g *model.AccountGroup) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.AccountGroup, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.AccountGroup, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.AccountGroup, error)
	Update(ctx context.Context, g *model.AccountGroup) error
	Delete(ctx context.Context, id uuid.UUID) error
}

type AccountGroupService struct {
	repo accountGroupRepository
}

func NewAccountGroupService(repo accountGroupRepository) *AccountGroupService {
	return &AccountGroupService{repo: repo}
}

func (s *AccountGroupService) List(ctx context.Context, tenantID uuid.UUID) ([]model.AccountGroup, error) {
	return s.repo.List(ctx, tenantID)
}

func (s *AccountGroupService) GetByID(ctx context.Context, id uuid.UUID) (*model.AccountGroup, error) {
	g, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrAccountGroupNotFound
	}
	return g, nil
}

type CreateAccountGroupInput struct {
	TenantID    uuid.UUID
	Code        string
	Name        string
	Description string
	SortOrder   int
}

func (s *AccountGroupService) Create(ctx context.Context, input CreateAccountGroupInput) (*model.AccountGroup, error) {
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrAccountGroupCodeRequired
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrAccountGroupNameRequired
	}

	existing, err := s.repo.GetByCode(ctx, input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrAccountGroupCodeExists
	}

	desc := strings.TrimSpace(input.Description)
	var descPtr *string
	if desc != "" {
		descPtr = &desc
	}

	g := &model.AccountGroup{
		TenantID:    input.TenantID,
		Code:        code,
		Name:        name,
		Description: descPtr,
		SortOrder:   input.SortOrder,
		IsActive:    true,
	}
	if err := s.repo.Create(ctx, g); err != nil {
		return nil, err
	}
	return g, nil
}

type UpdateAccountGroupInput struct {
	Code        *string
	Name        *string
	Description *string
	SortOrder   *int
	IsActive    *bool
}

func (s *AccountGroupService) Update(ctx context.Context, id uuid.UUID, input UpdateAccountGroupInput) (*model.AccountGroup, error) {
	g, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrAccountGroupNotFound
	}

	if input.Code != nil {
		code := strings.TrimSpace(*input.Code)
		if code == "" {
			return nil, ErrAccountGroupCodeRequired
		}
		existing, err := s.repo.GetByCode(ctx, g.TenantID, code)
		if err == nil && existing != nil && existing.ID != id {
			return nil, ErrAccountGroupCodeExists
		}
		g.Code = code
	}
	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrAccountGroupNameRequired
		}
		g.Name = name
	}
	if input.Description != nil {
		desc := strings.TrimSpace(*input.Description)
		if desc != "" {
			g.Description = &desc
		} else {
			g.Description = nil
		}
	}
	if input.SortOrder != nil {
		g.SortOrder = *input.SortOrder
	}
	if input.IsActive != nil {
		g.IsActive = *input.IsActive
	}

	if err := s.repo.Update(ctx, g); err != nil {
		return nil, err
	}
	return g, nil
}

func (s *AccountGroupService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return ErrAccountGroupNotFound
	}
	return s.repo.Delete(ctx, id)
}
```

#### 4. AccountGroup Handler
**File**: `apps/api/internal/handler/accountgroup.go`
**Changes**: New file (modeled on `handler/absencetypegroup.go`)

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

type AccountGroupHandler struct {
	svc *service.AccountGroupService
}

func NewAccountGroupHandler(svc *service.AccountGroupService) *AccountGroupHandler {
	return &AccountGroupHandler{svc: svc}
}

func (h *AccountGroupHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	groups, err := h.svc.List(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list account groups")
		return
	}

	data := make([]*models.AccountGroup, 0, len(groups))
	for i := range groups {
		data = append(data, accountGroupToResponse(&groups[i]))
	}

	respondJSON(w, http.StatusOK, models.AccountGroupList{Data: data})
}

func (h *AccountGroupHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid group ID")
		return
	}

	g, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Account group not found")
		return
	}

	respondJSON(w, http.StatusOK, accountGroupToResponse(g))
}

func (h *AccountGroupHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateAccountGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateAccountGroupInput{
		TenantID:    tenantID,
		Code:        *req.Code,
		Name:        *req.Name,
		Description: req.Description,
		SortOrder:   int(req.SortOrder),
	}

	g, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleAccountGroupError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, accountGroupToResponse(g))
}

func (h *AccountGroupHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid group ID")
		return
	}

	var req models.UpdateAccountGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateAccountGroupInput{}
	if req.Code != "" {
		input.Code = &req.Code
	}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	input.SortOrder = func(v int) *int { return &v }(int(req.SortOrder))
	input.IsActive = &req.IsActive

	g, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleAccountGroupError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, accountGroupToResponse(g))
}

func (h *AccountGroupHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid group ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleAccountGroupError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func accountGroupToResponse(g *model.AccountGroup) *models.AccountGroup {
	id := strfmt.UUID(g.ID.String())
	tenantID := strfmt.UUID(g.TenantID.String())

	resp := &models.AccountGroup{
		ID:        &id,
		TenantID:  tenantID,
		Code:      &g.Code,
		Name:      &g.Name,
		Description: g.Description,
		SortOrder: int64(g.SortOrder),
		IsActive:  g.IsActive,
		CreatedAt: strfmt.DateTime(g.CreatedAt),
		UpdatedAt: strfmt.DateTime(g.UpdatedAt),
	}

	return resp
}

func handleAccountGroupError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrAccountGroupNotFound:
		respondError(w, http.StatusNotFound, "Account group not found")
	case service.ErrAccountGroupCodeRequired:
		respondError(w, http.StatusBadRequest, "Group code is required")
	case service.ErrAccountGroupNameRequired:
		respondError(w, http.StatusBadRequest, "Group name is required")
	case service.ErrAccountGroupCodeExists:
		respondError(w, http.StatusConflict, "A group with this code already exists for this tenant")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
```

#### 5. Route Registration
**File**: `apps/api/internal/handler/routes.go`
**Changes**: Add new function after `RegisterAccountRoutes` (after line 149)

```go
// RegisterAccountGroupRoutes registers account group routes.
func RegisterAccountGroupRoutes(r chi.Router, h *AccountGroupHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("accounts.manage").String()
	r.Route("/account-groups", func(r chi.Router) {
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

Uses the `accounts.manage` permission (same as accounts) since account groups are part of account management.

#### 6. Main.go Wiring
**File**: `apps/api/cmd/server/main.go`
**Changes**: Add repository, service, handler initialization and route registration

Add after `accountRepo` initialization (after line 71):
```go
accountGroupRepo := repository.NewAccountGroupRepository(db)
```

Add after `accountService` initialization (after line 94):
```go
accountGroupService := service.NewAccountGroupService(accountGroupRepo)
```

Add after `accountHandler` initialization (after line 178):
```go
accountGroupHandler := handler.NewAccountGroupHandler(accountGroupService)
```

Add in tenant-scoped route registration (after line 274, after RegisterAccountRoutes):
```go
handler.RegisterAccountGroupRoutes(r, accountGroupHandler, authzMiddleware)
```

### Success Criteria:

#### Automated Verification:
- [x] `make lint` passes (pre-existing lint issues only, no new issues)
- [x] `make test` passes (existing tests should still work with generated model changes)
- [ ] Account group CRUD endpoints respond correctly

#### Manual Verification:
- [ ] Create an account group via POST /api/v1/account-groups
- [ ] List, get, update, delete account groups
- [ ] Verify correct permission checks when authz is enabled

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Account Model Updates

### Overview
Update the Account model, service, handler, and repository to support the new fields (display_format, bonus_factor, account_group_id) and the migrated account_type enum (bonus/day/month). Update tests and dev seed data.

### Changes Required:

#### 1. Update Account Model
**File**: `apps/api/internal/model/account.go`
**Changes**: Update enum constants and add new fields

Change enum constants (lines 9-15):
```go
const (
	AccountTypeBonus AccountType = "bonus"
	AccountTypeDay   AccountType = "day"
	AccountTypeMonth AccountType = "month"
)
```

Add `DisplayFormat` type and constants after `AccountUnit` (after line 23):
```go
type DisplayFormat string

const (
	DisplayFormatDecimal DisplayFormat = "decimal"
	DisplayFormatHHMM    DisplayFormat = "hh_mm"
)
```

Add new fields to Account struct (after `SortOrder` at line 36):
```go
AccountGroupID *uuid.UUID    `gorm:"type:uuid" json:"account_group_id,omitempty"`
AccountGroup   *AccountGroup `gorm:"foreignKey:AccountGroupID" json:"account_group,omitempty"`
DisplayFormat  DisplayFormat `gorm:"type:varchar(20);not null;default:'decimal'" json:"display_format"`
BonusFactor    *float64      `gorm:"type:numeric(5,2)" json:"bonus_factor,omitempty"`
```

#### 2. Update Account Service
**File**: `apps/api/internal/service/account.go`
**Changes**: Update input structs to include new fields

Update `CreateAccountInput` (lines 48-60) — add:
```go
DisplayFormat  model.DisplayFormat
BonusFactor    *float64
AccountGroupID *uuid.UUID
```

Update `Create` method — set new fields on account struct:
```go
displayFormat := input.DisplayFormat
if displayFormat == "" {
	displayFormat = model.DisplayFormatDecimal
}
```
And in the account creation:
```go
DisplayFormat:  displayFormat,
BonusFactor:    input.BonusFactor,
AccountGroupID: input.AccountGroupID,
```

Update `UpdateAccountInput` (lines 134-143) — add:
```go
DisplayFormat  *model.DisplayFormat
BonusFactor    *float64
AccountGroupID *uuid.UUID
```

Update `Update` method — add field assignment blocks:
```go
if input.DisplayFormat != nil {
	account.DisplayFormat = *input.DisplayFormat
}
if input.BonusFactor != nil {
	account.BonusFactor = input.BonusFactor
}
if input.AccountGroupID != nil {
	account.AccountGroupID = input.AccountGroupID
}
```

#### 3. Update Account Handler
**File**: `apps/api/internal/handler/account.go`
**Changes**: Update Create and Update to pass new fields, update parseAccountType

Update `parseAccountType` (lines 279-290):
```go
func parseAccountType(apiType string) (model.AccountType, bool) {
	switch apiType {
	case "bonus":
		return model.AccountTypeBonus, true
	case "day", "tracking", "time":
		return model.AccountTypeDay, true
	case "month", "balance", "vacation", "sick", "deduction":
		return model.AccountTypeMonth, true
	default:
		return "", false
	}
}
```

Note: Keep old aliases (tracking, balance, time, vacation, sick, deduction) as accepted input values for backwards compatibility in the API, but the stored/returned value will be day/month/bonus.

Update `Create` handler — extract new fields from request and pass to input:
```go
displayFormat := model.DisplayFormat(req.DisplayFormat)
if req.DisplayFormat == "" {
	displayFormat = model.DisplayFormatDecimal
}

var bonusFactor *float64
if req.BonusFactor != nil {
	bf := *req.BonusFactor
	bonusFactor = &bf
}

var accountGroupID *uuid.UUID
if req.AccountGroupID != "" {
	gid, err := uuid.Parse(string(req.AccountGroupID))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid account group ID")
		return
	}
	accountGroupID = &gid
}
```
And add to `input`:
```go
DisplayFormat:  displayFormat,
BonusFactor:    bonusFactor,
AccountGroupID: accountGroupID,
```

Update `Update` handler — extract new fields from request:
```go
if req.DisplayFormat != "" {
	df := model.DisplayFormat(req.DisplayFormat)
	input.DisplayFormat = &df
}
if req.BonusFactor != nil {
	bf := *req.BonusFactor
	input.BonusFactor = &bf
}
if req.AccountGroupID != "" {
	gid, err := uuid.Parse(string(req.AccountGroupID))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid account group ID")
		return
	}
	input.AccountGroupID = &gid
}
```

#### 4. Update Account Repository
**File**: `apps/api/internal/repository/account.go`
**Changes**: Add new fields to Create select list and Upsert columns

Update `Create` method (line 32) — add new fields to Select:
```go
Select("TenantID", "Code", "Name", "Description", "AccountType", "Unit", "YearCarryover", "IsPayrollRelevant", "PayrollCode", "SortOrder", "IsSystem", "IsActive", "DisplayFormat", "BonusFactor", "AccountGroupID")
```

Update `Upsert` DoUpdates columns (lines 77-88) — add:
```go
"display_format",
"bonus_factor",
"account_group_id",
```

#### 5. Update Dev Seed Accounts
**File**: `apps/api/internal/auth/devaccounts.go`
**Changes**: Update AccountType values

```go
AccountType string // "bonus", "day", "month"
```

Change line 44: `"tracking"` → `"day"`
Change line 51: `"tracking"` → `"day"`
Change line 58: `"balance"` → `"month"`

#### 6. Update Existing Tests
**File**: `apps/api/internal/repository/account_test.go`
**Changes**: Replace `model.AccountTypeTracking` → `model.AccountTypeDay`, `model.AccountTypeBalance` → `model.AccountTypeMonth`

**File**: `apps/api/internal/service/account_test.go`
**Changes**: Replace `model.AccountTypeTracking` → `model.AccountTypeDay`

**File**: `apps/api/internal/handler/account_test.go`
**Changes**: Replace `model.AccountTypeTracking` → `model.AccountTypeDay`

### Success Criteria:

#### Automated Verification:
- [x] `make lint` passes
- [x] `make test` passes (all existing tests updated and passing)
- [x] `cd apps/api && go test -v ./internal/repository/... -run TestAccount` passes
- [x] `cd apps/api && go test -v ./internal/service/... -run TestAccount` passes
- [x] `cd apps/api && go test -v ./internal/handler/... -run TestAccount` passes

#### Manual Verification:
- [ ] Create account with display_format=hh_mm, bonus_factor=1.5, account_group_id=<valid_group>
- [ ] Update account to change display_format, bonus_factor, account_group_id
- [ ] Verify account responses include all new fields
- [ ] Verify old account_type aliases still work in API requests (e.g., "tracking" maps to "day")

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Payroll Relevant Filter

### Overview
Wire the existing `payroll_relevant` query parameter through the handler, service, and repository layers.

### Changes Required:

#### 1. Update Repository ListFiltered
**File**: `apps/api/internal/repository/account.go`
**Changes**: Add `payrollRelevant` parameter to `ListFiltered`

Update signature (line 167):
```go
func (r *AccountRepository) ListFiltered(ctx context.Context, tenantID uuid.UUID, includeSystem bool, active *bool, accountType *model.AccountType, payrollRelevant *bool) ([]model.Account, error) {
```

Add filter (after line 189):
```go
if payrollRelevant != nil {
	query = query.Where("is_payroll_relevant = ?", *payrollRelevant)
}
```

#### 2. Update Service ListFiltered
**File**: `apps/api/internal/service/account.go`
**Changes**: Update signature and interface

Update interface method (line 35):
```go
ListFiltered(ctx context.Context, tenantID uuid.UUID, includeSystem bool, active *bool, accountType *model.AccountType, payrollRelevant *bool) ([]model.Account, error)
```

Update service method (line 227):
```go
func (s *AccountService) ListFiltered(ctx context.Context, tenantID uuid.UUID, includeSystem bool, active *bool, accountType *model.AccountType, payrollRelevant *bool) ([]model.Account, error) {
	return s.accountRepo.ListFiltered(ctx, tenantID, includeSystem, active, accountType, payrollRelevant)
}
```

#### 3. Update Handler List
**File**: `apps/api/internal/handler/account.go`
**Changes**: Parse `payroll_relevant` query param and pass to service

Add after the accountTypeFilter parsing (after line 62):
```go
var payrollRelevantFilter *bool
if prStr := r.URL.Query().Get("payroll_relevant"); prStr != "" {
	pr, err := strconv.ParseBool(prStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid payroll_relevant filter")
		return
	}
	payrollRelevantFilter = &pr
}
```

Update the service call (line 64):
```go
accounts, err := h.accountService.ListFiltered(r.Context(), tenantID, includeSystem, activeFilter, accountTypeFilter, payrollRelevantFilter)
```

### Success Criteria:

#### Automated Verification:
- [x] `make lint` passes
- [x] `make test` passes
- [x] `cd apps/api && go test -v ./internal/handler/... -run TestAccount` passes
- [x] `cd apps/api && go test -v ./internal/service/... -run TestAccount` passes

#### Manual Verification:
- [ ] GET /api/v1/accounts?payroll_relevant=true returns only payroll-relevant accounts
- [ ] GET /api/v1/accounts?payroll_relevant=false returns only non-payroll accounts
- [ ] GET /api/v1/accounts (no filter) returns all accounts

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:
- Account group CRUD service validation (code required, name required, uniqueness)
- Account model with new fields (display_format defaults, bonus_factor nullable)
- Updated account type enum values in existing tests
- Payroll relevant filter behavior

### Integration Tests:
- Account group create/list/update/delete via API
- Account create with all new fields
- Account update to assign/change group
- Filter by payroll_relevant returns correct results
- Old account_type aliases (tracking, balance) accepted by API

### Manual Testing Steps:
1. Create account group: `POST /api/v1/account-groups` with code, name
2. Create account with group: `POST /api/v1/accounts` with account_group_id
3. List accounts: verify display_format, bonus_factor, account_group_id in response
4. Filter: `GET /api/v1/accounts?payroll_relevant=true`
5. Update account group assignment: `PATCH /api/v1/accounts/{id}` with new account_group_id
6. Delete account group: verify accounts' account_group_id becomes NULL (ON DELETE SET NULL)

## Migration Notes

- The migration changes existing data: `tracking` → `day`, `balance` → `month` in `account_type` column
- System accounts (FLEX, OT, VAC) will have their type changed from `balance` to `month`
- The migration is reversible: down migration reverts the enum values
- Dev seed data (`devaccounts.go`) must match the new enum values

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-009-accounts-and-groups.md`
- Research: `thoughts/shared/research/2026-01-29-ZMI-TICKET-009-accounts-and-groups.md`
- ZMI reference: `thoughts/shared/reference/zmi-calculation-manual-reference.md` (Section 16: Konten)
- AbsenceTypeGroup template: `apps/api/internal/model/absencetypegroup.go`, `repository/absencetypegroup.go`, `service/absencetypegroup.go`, `handler/absencetypegroup.go`
- Route registration: `apps/api/internal/handler/routes.go:128-148`
- Main.go wiring: `apps/api/cmd/server/main.go:71,94,178,274`
