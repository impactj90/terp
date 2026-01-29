# Implementation Plan: ZMI-TICKET-012 - Correction Assistant, Error/Hint Catalog, and Logs

## Overview

This ticket implements the correction assistant data model and APIs: an error/hint message catalog, correction assistant list queries with filtering, and custom message overrides. The correction assistant is a read-only view of errors and hints produced by daily calculation (missing bookings, core time violations, minimum work time violations, etc.) with configurable human-readable messages per tenant.

## Current State Analysis

### What Exists
The daily calculation engine already produces error codes and warnings, stored on `daily_values` as PostgreSQL text arrays (`error_codes TEXT[]`, `warnings TEXT[]`). A `DailyError` OpenAPI schema exists with error type enum and severity. The handler function `buildDailyErrors()` in `handler/booking.go` maps raw codes to typed error objects, and `mapDailyErrorType()` classifies codes into categories. The `DailyValueListOptions` supports `HasErrors *bool` filtering.

### What Does NOT Exist
There is no error message catalog table, no human-readable default or custom text for error codes, no correction assistant query endpoint, no department-based filtering for correction items, and no default date range logic (previous month + current month). Error messages are currently just raw code strings like "MISSING_COME".

### Key Discoveries
- Error codes: 14 error codes + 10 warning codes defined in `apps/api/internal/calculation/errors.go`
- `IsError()` function classifies error vs warning at `calculation/errors.go:49`
- DailyValue error storage: `has_error BOOLEAN`, `error_codes TEXT[]`, `warnings TEXT[]` at `model/dailyvalue.go`
- Partial index exists: `idx_daily_values_errors ON daily_values(employee_id, has_error) WHERE has_error = true`
- Department filtering pattern exists in `repository/dailyvalue.go` using employee subquery
- Existing "Corrections" tag/paths/schemas cover MANUAL time adjustments (different concept entirely)
- ZMI manual confirms: correction assistant is a VIEW of calculation errors, not a data entry system
- Last migration: `000044_booking_type_enhancements` -- next is `000045`

## Dependencies

All dependencies are satisfied:
- **ZMI-TICKET-006** (Daily calculation) -- COMPLETE (error codes emitted, stored on daily_values)
- **ZMI-TICKET-003** (User management) -- COMPLETE (auth, permissions infrastructure)
- **ZMI-TICKET-004** (Employee/department) -- COMPLETE (employee-department relationship)

## What We're NOT Doing

- No "resolved" flag tracking per error (ticket marks this as optional, can be added later)
- No automatic correction creation (the assistant is read-only)
- No integration with the existing manual corrections workflow
- No UI workflows (explicitly out of scope per ticket)
- No modification of the daily calculation engine (errors already emitted correctly)

## Desired End State

After implementation:
1. A `correction_messages` database table stores the error message catalog per tenant with code, default text, custom override text, and severity
2. `GET /correction-messages` returns the full catalog for a tenant
3. `PATCH /correction-messages/{id}` allows updating custom text and severity
4. `GET /correction-assistant` returns daily_values with errors, joined with resolved message text from the catalog, with filtering by date range, department, employee, severity, and error code
5. Default date range (no params) returns previous month + current month
6. Custom message overrides replace default text in correction assistant output
7. All endpoints documented in OpenAPI spec with generated Go models
8. Unit and integration tests verify catalog lookup, override behavior, filtering, and default date range

## Implementation Approach

**Single migration** creates the `correction_messages` table and seeds system default entries for all 24 known error/warning codes.

**Single OpenAPI schema file** (`correction-assistant.yaml`) defines all new schemas. **Single paths file** (`correction-assistant.yaml`) defines all new endpoints.

**Repository** handles correction_message CRUD. **Service** handles both catalog management and the correction assistant query logic (joining daily_values with the message catalog). **Handler** exposes HTTP endpoints.

The correction assistant query does NOT create a separate `correction_items` table. Instead, it queries `daily_values` with `has_error = true`, flattens the `error_codes[]` and `warnings[]` arrays, and resolves human-readable messages from the `correction_messages` catalog. This avoids data duplication and keeps the correction assistant as a pure view.

---

## Phase 1: Database Migration

### Overview
Create the `correction_messages` table and seed default entries for all known error and warning codes.

### Changes Required

#### 1. Up Migration
**File**: `db/migrations/000045_create_correction_messages.up.sql`

```sql
-- =============================================================
-- Create correction_messages table (error/hint catalog)
-- =============================================================
CREATE TABLE correction_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    default_text TEXT NOT NULL,
    custom_text TEXT,
    severity VARCHAR(10) NOT NULL DEFAULT 'error',
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_correction_messages_tenant ON correction_messages(tenant_id);
CREATE INDEX idx_correction_messages_code ON correction_messages(code);
CREATE INDEX idx_correction_messages_severity ON correction_messages(tenant_id, severity);

CREATE TRIGGER update_correction_messages_updated_at
    BEFORE UPDATE ON correction_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE correction_messages IS 'Catalog of error/hint messages for the correction assistant. Each tenant gets entries seeded from system defaults. Custom text overrides default text in outputs.';
COMMENT ON COLUMN correction_messages.code IS 'Error/warning code matching calculation engine constants (e.g. MISSING_COME, NO_BOOKINGS)';
COMMENT ON COLUMN correction_messages.default_text IS 'System-provided default human-readable message text';
COMMENT ON COLUMN correction_messages.custom_text IS 'Tenant-specific override text. When set, replaces default_text in outputs';
COMMENT ON COLUMN correction_messages.severity IS 'Classification: error or hint';
COMMENT ON COLUMN correction_messages.description IS 'Internal description of when this error/hint occurs';
```

#### 2. Down Migration
**File**: `db/migrations/000045_create_correction_messages.down.sql`

```sql
DROP TABLE IF EXISTS correction_messages;
```

### Success Criteria

#### Automated Verification:
- [ ] Migration applies cleanly: `make migrate-up`
- [ ] Migration rolls back cleanly: `make migrate-down` then `make migrate-up`
- [ ] Table exists with correct schema: verify via `\d correction_messages` in psql

---

## Phase 2: GORM Model

### Overview
Create the GORM model for CorrectionMessage following existing patterns from `model/bookingtype.go` and `model/auditlog.go`.

### Changes Required

#### 1. CorrectionMessage Model
**File**: `apps/api/internal/model/correction_message.go`

```go
package model

import (
	"time"

	"github.com/google/uuid"
)

// CorrectionSeverity represents the severity of a correction message.
type CorrectionSeverity string

const (
	CorrectionSeverityError CorrectionSeverity = "error"
	CorrectionSeverityHint  CorrectionSeverity = "hint"
)

// CorrectionMessage represents an entry in the error/hint message catalog.
type CorrectionMessage struct {
	ID          uuid.UUID          `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID    uuid.UUID          `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Code        string             `gorm:"type:varchar(50);not null" json:"code"`
	DefaultText string             `gorm:"type:text;not null" json:"default_text"`
	CustomText  *string            `gorm:"type:text" json:"custom_text,omitempty"`
	Severity    CorrectionSeverity `gorm:"type:varchar(10);not null;default:'error'" json:"severity"`
	Description *string            `gorm:"type:text" json:"description,omitempty"`
	IsActive    bool               `gorm:"default:true" json:"is_active"`
	CreatedAt   time.Time          `gorm:"default:now()" json:"created_at"`
	UpdatedAt   time.Time          `gorm:"default:now()" json:"updated_at"`
}

func (CorrectionMessage) TableName() string {
	return "correction_messages"
}

// EffectiveText returns custom_text if set, otherwise default_text.
func (cm *CorrectionMessage) EffectiveText() string {
	if cm.CustomText != nil && *cm.CustomText != "" {
		return *cm.CustomText
	}
	return cm.DefaultText
}

// CorrectionMessageFilter defines filter criteria for listing correction messages.
type CorrectionMessageFilter struct {
	Severity *CorrectionSeverity
	IsActive *bool
	Code     *string
}

// CorrectionAssistantFilter defines filter criteria for the correction assistant query.
type CorrectionAssistantFilter struct {
	From         *time.Time
	To           *time.Time
	EmployeeID   *uuid.UUID
	DepartmentID *uuid.UUID
	Severity     *CorrectionSeverity
	ErrorCode    *string
	Limit        int
	Offset       int
}

// CorrectionAssistantItem represents one employee-date entry in the correction assistant view.
type CorrectionAssistantItem struct {
	DailyValueID   uuid.UUID
	EmployeeID     uuid.UUID
	EmployeeName   string
	DepartmentID   *uuid.UUID
	DepartmentName *string
	ValueDate      time.Time
	Errors         []CorrectionAssistantError
}

// CorrectionAssistantError represents a single error/hint within a correction assistant item.
type CorrectionAssistantError struct {
	Code      string
	Severity  string
	Message   string
	ErrorType string
}
```

### Success Criteria

#### Automated Verification:
- [ ] Code compiles: `cd apps/api && go build ./...`
- [ ] No lint errors: `cd apps/api && golangci-lint run ./internal/model/...`

---

## Phase 3: OpenAPI Specification

### Overview
Define OpenAPI schemas and paths for correction messages (catalog CRUD) and correction assistant (query endpoint).

### Changes Required

#### 1. Schemas
**File**: `api/schemas/correction-assistant.yaml`

```yaml
# Correction Assistant schemas

CorrectionMessage:
  type: object
  required:
    - id
    - tenant_id
    - code
    - default_text
    - severity
    - is_active
  properties:
    id:
      type: string
      format: uuid
    tenant_id:
      type: string
      format: uuid
    code:
      type: string
      description: Error/warning code matching calculation engine constants
      example: "MISSING_COME"
    default_text:
      type: string
      description: System-provided default message text
      example: "Missing arrival booking"
    custom_text:
      type: string
      x-nullable: true
      description: Tenant-specific override text. When set, replaces default_text in outputs
    effective_text:
      type: string
      description: Resolved text (custom_text if set, otherwise default_text)
      readOnly: true
    severity:
      type: string
      enum:
        - error
        - hint
      description: "Classification: error or hint"
      example: "error"
    description:
      type: string
      x-nullable: true
      description: Internal description of when this error/hint occurs
    is_active:
      type: boolean
      description: Whether this message is active
      default: true
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time

UpdateCorrectionMessageRequest:
  type: object
  properties:
    custom_text:
      type: string
      x-nullable: true
      description: Set to override default text, or null to clear override
    severity:
      type: string
      enum:
        - error
        - hint
    is_active:
      type: boolean

CorrectionMessageList:
  type: object
  required:
    - data
  properties:
    data:
      type: array
      items:
        $ref: '#/CorrectionMessage'
    meta:
      $ref: './common.yaml#/PaginationMeta'

CorrectionAssistantError:
  type: object
  required:
    - code
    - severity
    - message
  properties:
    code:
      type: string
      description: Error/warning code
      example: "MISSING_GO"
    severity:
      type: string
      enum:
        - error
        - hint
      example: "error"
    message:
      type: string
      description: Resolved message text (custom override or default)
      example: "Missing departure booking"
    error_type:
      type: string
      enum:
        - missing_booking
        - unpaired_booking
        - overlapping_bookings
        - core_time_violation
        - exceeds_max_hours
        - below_min_hours
        - break_violation
        - invalid_sequence
      description: Categorized error type

CorrectionAssistantItem:
  type: object
  required:
    - daily_value_id
    - employee_id
    - value_date
    - errors
  properties:
    daily_value_id:
      type: string
      format: uuid
    employee_id:
      type: string
      format: uuid
    employee_name:
      type: string
      example: "Max Mustermann"
    department_id:
      type: string
      format: uuid
      x-nullable: true
    department_name:
      type: string
      x-nullable: true
    value_date:
      type: string
      format: date
      example: "2026-01-15"
    errors:
      type: array
      items:
        $ref: '#/CorrectionAssistantError'

CorrectionAssistantList:
  type: object
  required:
    - data
    - meta
  properties:
    data:
      type: array
      items:
        $ref: '#/CorrectionAssistantItem'
    meta:
      $ref: './common.yaml#/PaginationMeta'
```

#### 2. Paths
**File**: `api/paths/correction-assistant.yaml`

```yaml
# Correction Assistant endpoints

# --- Correction Message Catalog ---
/correction-messages:
  get:
    tags:
      - Correction Assistant
    summary: List correction messages
    description: |
      Returns the error/hint message catalog for the tenant. Each entry maps
      an error code to human-readable text with optional custom overrides.
    operationId: listCorrectionMessages
    parameters:
      - name: severity
        in: query
        type: string
        enum:
          - error
          - hint
        description: Filter by severity
      - name: is_active
        in: query
        type: boolean
        description: Filter by active status
      - name: code
        in: query
        type: string
        description: Filter by error code
    responses:
      200:
        description: List of correction messages
        schema:
          $ref: '../schemas/correction-assistant.yaml#/CorrectionMessageList'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      403:
        $ref: '../responses/errors.yaml#/Forbidden'

/correction-messages/{id}:
  get:
    tags:
      - Correction Assistant
    summary: Get correction message by ID
    operationId: getCorrectionMessage
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
    responses:
      200:
        description: Correction message details
        schema:
          $ref: '../schemas/correction-assistant.yaml#/CorrectionMessage'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
  patch:
    tags:
      - Correction Assistant
    summary: Update correction message
    description: |
      Update custom text, severity, or active status for a correction message.
      Set custom_text to override the default text in correction assistant outputs.
      Set custom_text to null to revert to the default text.
    operationId: updateCorrectionMessage
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
          $ref: '../schemas/correction-assistant.yaml#/UpdateCorrectionMessageRequest'
    responses:
      200:
        description: Updated correction message
        schema:
          $ref: '../schemas/correction-assistant.yaml#/CorrectionMessage'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'

# --- Correction Assistant Query ---
/correction-assistant:
  get:
    tags:
      - Correction Assistant
    summary: List correction assistant items
    description: |
      Returns daily calculation errors and hints for the correction assistant view.
      Each item represents one employee-date with one or more errors/hints,
      with messages resolved from the correction message catalog.

      **Default date range**: When no from/to parameters are provided, returns
      items from the first day of the previous month through the last day of
      the current month.
    operationId: listCorrectionAssistantItems
    parameters:
      - name: from
        in: query
        type: string
        format: date
        description: Start date filter (inclusive). Defaults to first day of previous month.
      - name: to
        in: query
        type: string
        format: date
        description: End date filter (inclusive). Defaults to last day of current month.
      - name: employee_id
        in: query
        type: string
        format: uuid
        description: Filter by employee
      - name: department_id
        in: query
        type: string
        format: uuid
        description: Filter by department (includes all employees in department)
      - name: severity
        in: query
        type: string
        enum:
          - error
          - hint
        description: Filter by error severity
      - name: error_code
        in: query
        type: string
        description: Filter by specific error code
      - name: limit
        in: query
        type: integer
        default: 50
        minimum: 1
        maximum: 200
      - name: offset
        in: query
        type: integer
        default: 0
        minimum: 0
    responses:
      200:
        description: List of correction assistant items
        schema:
          $ref: '../schemas/correction-assistant.yaml#/CorrectionAssistantList'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      403:
        $ref: '../responses/errors.yaml#/Forbidden'
```

#### 3. Register in Main OpenAPI Spec
**File**: `api/openapi.yaml`

Add tag:
```yaml
  - name: Correction Assistant
    description: Error/hint catalog and correction assistant queries
```

Add paths:
```yaml
  # Correction Assistant
  /correction-messages:
    $ref: 'paths/correction-assistant.yaml#/~1correction-messages'
  /correction-messages/{id}:
    $ref: 'paths/correction-assistant.yaml#/~1correction-messages~1{id}'
  /correction-assistant:
    $ref: 'paths/correction-assistant.yaml#/~1correction-assistant'
```

Add definitions:
```yaml
  # Correction Assistant
  CorrectionMessage:
    $ref: 'schemas/correction-assistant.yaml#/CorrectionMessage'
  UpdateCorrectionMessageRequest:
    $ref: 'schemas/correction-assistant.yaml#/UpdateCorrectionMessageRequest'
  CorrectionMessageList:
    $ref: 'schemas/correction-assistant.yaml#/CorrectionMessageList'
  CorrectionAssistantItem:
    $ref: 'schemas/correction-assistant.yaml#/CorrectionAssistantItem'
  CorrectionAssistantError:
    $ref: 'schemas/correction-assistant.yaml#/CorrectionAssistantError'
  CorrectionAssistantList:
    $ref: 'schemas/correction-assistant.yaml#/CorrectionAssistantList'
```

#### 4. Bundle and Generate
```bash
make swagger-bundle
make generate
```

### Success Criteria

#### Automated Verification:
- [ ] `make swagger-bundle` succeeds
- [ ] `make generate` produces new model files in `apps/api/gen/models/`
- [ ] Generated files include `correction_message.go`, `correction_assistant_item.go`, `correction_assistant_error.go`, `correction_assistant_list.go`, `correction_message_list.go`, `update_correction_message_request.go`

---

## Phase 4: Repository Layer

### Overview
Create the CorrectionMessage repository following patterns from `repository/auditlog.go` and `repository/bookingtype.go`.

### Changes Required

#### 1. CorrectionMessage Repository
**File**: `apps/api/internal/repository/correction_message.go`

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

var ErrCorrectionMessageNotFound = errors.New("correction message not found")

// CorrectionMessageRepository handles correction message data access.
type CorrectionMessageRepository struct {
	db *DB
}

// NewCorrectionMessageRepository creates a new correction message repository.
func NewCorrectionMessageRepository(db *DB) *CorrectionMessageRepository {
	return &CorrectionMessageRepository{db: db}
}

// Create creates a new correction message entry.
func (r *CorrectionMessageRepository) Create(ctx context.Context, cm *model.CorrectionMessage) error {
	return r.db.GORM.WithContext(ctx).Create(cm).Error
}

// CreateBatch creates multiple correction message entries in a single transaction.
func (r *CorrectionMessageRepository) CreateBatch(ctx context.Context, messages []model.CorrectionMessage) error {
	return r.db.GORM.WithContext(ctx).Create(&messages).Error
}

// GetByID retrieves a correction message by ID.
func (r *CorrectionMessageRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.CorrectionMessage, error) {
	var cm model.CorrectionMessage
	err := r.db.GORM.WithContext(ctx).First(&cm, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrCorrectionMessageNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get correction message: %w", err)
	}
	return &cm, nil
}

// GetByCode retrieves a correction message by tenant and code.
func (r *CorrectionMessageRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.CorrectionMessage, error) {
	var cm model.CorrectionMessage
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&cm).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrCorrectionMessageNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get correction message by code: %w", err)
	}
	return &cm, nil
}

// Update updates a correction message.
func (r *CorrectionMessageRepository) Update(ctx context.Context, cm *model.CorrectionMessage) error {
	return r.db.GORM.WithContext(ctx).Save(cm).Error
}

// List retrieves correction messages for a tenant with optional filtering.
func (r *CorrectionMessageRepository) List(ctx context.Context, tenantID uuid.UUID, filter model.CorrectionMessageFilter) ([]model.CorrectionMessage, error) {
	var messages []model.CorrectionMessage
	q := r.db.GORM.WithContext(ctx).Where("tenant_id = ?", tenantID)

	if filter.Severity != nil {
		q = q.Where("severity = ?", *filter.Severity)
	}
	if filter.IsActive != nil {
		q = q.Where("is_active = ?", *filter.IsActive)
	}
	if filter.Code != nil {
		q = q.Where("code = ?", *filter.Code)
	}

	err := q.Order("severity ASC, code ASC").Find(&messages).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list correction messages: %w", err)
	}
	return messages, nil
}

// ListAsMap retrieves all active correction messages for a tenant as a map keyed by code.
func (r *CorrectionMessageRepository) ListAsMap(ctx context.Context, tenantID uuid.UUID) (map[string]*model.CorrectionMessage, error) {
	var messages []model.CorrectionMessage
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND is_active = true", tenantID).
		Find(&messages).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list correction messages: %w", err)
	}

	result := make(map[string]*model.CorrectionMessage, len(messages))
	for i := range messages {
		result[messages[i].Code] = &messages[i]
	}
	return result, nil
}

// CountByTenant returns the number of correction messages for a tenant.
func (r *CorrectionMessageRepository) CountByTenant(ctx context.Context, tenantID uuid.UUID) (int64, error) {
	var count int64
	err := r.db.GORM.WithContext(ctx).
		Model(&model.CorrectionMessage{}).
		Where("tenant_id = ?", tenantID).
		Count(&count).Error
	return count, err
}
```

### Success Criteria

#### Automated Verification:
- [ ] Code compiles: `cd apps/api && go build ./...`
- [ ] No lint errors: `cd apps/api && golangci-lint run ./internal/repository/...`

---

## Phase 5: Service Layer

### Overview
Create the CorrectionAssistantService that handles both catalog management and the correction assistant query logic. Follows patterns from `service/bookingtype.go` and `service/auditlog.go`.

### Changes Required

#### 1. Correction Assistant Service
**File**: `apps/api/internal/service/correction_assistant.go`

```go
package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/calculation"
	"github.com/tolga/terp/internal/model"
)

var (
	ErrCorrectionMessageNotFound = errors.New("correction message not found")
	ErrInvalidSeverity           = errors.New("invalid severity (must be 'error' or 'hint')")
)

// correctionMessageRepository defines the interface for correction message data access.
type correctionMessageRepository interface {
	Create(ctx context.Context, cm *model.CorrectionMessage) error
	CreateBatch(ctx context.Context, messages []model.CorrectionMessage) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.CorrectionMessage, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.CorrectionMessage, error)
	Update(ctx context.Context, cm *model.CorrectionMessage) error
	List(ctx context.Context, tenantID uuid.UUID, filter model.CorrectionMessageFilter) ([]model.CorrectionMessage, error)
	ListAsMap(ctx context.Context, tenantID uuid.UUID) (map[string]*model.CorrectionMessage, error)
	CountByTenant(ctx context.Context, tenantID uuid.UUID) (int64, error)
}

// dailyValueQueryRepository defines the read methods needed from daily values.
type dailyValueQueryRepository interface {
	List(ctx context.Context, tenantID uuid.UUID, opts model.DailyValueListOptions) ([]model.DailyValue, error)
}

// employeeQueryRepository defines the read methods needed from employees.
type employeeQueryRepository interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.Employee, error)
}

// CorrectionAssistantService handles correction message catalog and assistant queries.
type CorrectionAssistantService struct {
	cmRepo       correctionMessageRepository
	dvRepo       dailyValueQueryRepository
	employeeRepo employeeQueryRepository
}

// NewCorrectionAssistantService creates a new correction assistant service.
func NewCorrectionAssistantService(
	cmRepo correctionMessageRepository,
	dvRepo dailyValueQueryRepository,
	employeeRepo employeeQueryRepository,
) *CorrectionAssistantService {
	return &CorrectionAssistantService{
		cmRepo:       cmRepo,
		dvRepo:       dvRepo,
		employeeRepo: employeeRepo,
	}
}

// --- Catalog Management ---

// ListMessages returns all correction messages for a tenant.
func (s *CorrectionAssistantService) ListMessages(ctx context.Context, tenantID uuid.UUID, filter model.CorrectionMessageFilter) ([]model.CorrectionMessage, error) {
	return s.cmRepo.List(ctx, tenantID, filter)
}

// GetMessage returns a correction message by ID.
func (s *CorrectionAssistantService) GetMessage(ctx context.Context, id uuid.UUID) (*model.CorrectionMessage, error) {
	cm, err := s.cmRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrCorrectionMessageNotFound
	}
	return cm, nil
}

// UpdateMessageInput represents the input for updating a correction message.
type UpdateMessageInput struct {
	CustomText  *string
	ClearCustom bool
	Severity    *string
	IsActive    *bool
}

// UpdateMessage updates a correction message's custom text, severity, or active status.
func (s *CorrectionAssistantService) UpdateMessage(ctx context.Context, id uuid.UUID, tenantID uuid.UUID, input UpdateMessageInput) (*model.CorrectionMessage, error) {
	cm, err := s.cmRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrCorrectionMessageNotFound
	}

	// Verify tenant ownership
	if cm.TenantID != tenantID {
		return nil, ErrCorrectionMessageNotFound
	}

	if input.ClearCustom {
		cm.CustomText = nil
	} else if input.CustomText != nil {
		text := strings.TrimSpace(*input.CustomText)
		if text == "" {
			cm.CustomText = nil
		} else {
			cm.CustomText = &text
		}
	}

	if input.Severity != nil {
		sev := model.CorrectionSeverity(*input.Severity)
		if sev != model.CorrectionSeverityError && sev != model.CorrectionSeverityHint {
			return nil, ErrInvalidSeverity
		}
		cm.Severity = sev
	}

	if input.IsActive != nil {
		cm.IsActive = *input.IsActive
	}

	if err := s.cmRepo.Update(ctx, cm); err != nil {
		return nil, err
	}
	return cm, nil
}

// EnsureDefaults seeds default correction messages for a tenant if none exist.
func (s *CorrectionAssistantService) EnsureDefaults(ctx context.Context, tenantID uuid.UUID) error {
	count, err := s.cmRepo.CountByTenant(ctx, tenantID)
	if err != nil {
		return err
	}
	if count > 0 {
		return nil // Already seeded
	}

	defaults := defaultCorrectionMessages(tenantID)
	return s.cmRepo.CreateBatch(ctx, defaults)
}

// --- Correction Assistant Query ---

// ListItems returns correction assistant items (daily values with errors, joined with messages).
func (s *CorrectionAssistantService) ListItems(ctx context.Context, tenantID uuid.UUID, filter model.CorrectionAssistantFilter) ([]model.CorrectionAssistantItem, int64, error) {
	// Apply default date range: previous month + current month
	from, to := s.defaultDateRange(filter.From, filter.To)

	// Load message catalog for resolution
	messageMap, err := s.cmRepo.ListAsMap(ctx, tenantID)
	if err != nil {
		return nil, 0, err
	}

	// Build daily value query
	hasErrors := true
	opts := model.DailyValueListOptions{
		From:      from,
		To:        to,
		HasErrors: &hasErrors,
	}
	if filter.EmployeeID != nil {
		opts.EmployeeID = filter.EmployeeID
	}
	if filter.DepartmentID != nil {
		opts.ScopeType = model.DataScopeDepartment
		opts.ScopeDepartmentIDs = []uuid.UUID{*filter.DepartmentID}
	}

	// Query daily values with errors
	dailyValues, err := s.dvRepo.List(ctx, tenantID, opts)
	if err != nil {
		return nil, 0, err
	}

	// Build correction assistant items
	var items []model.CorrectionAssistantItem
	for _, dv := range dailyValues {
		errors := s.buildErrors(dv.ErrorCodes, dv.Warnings, messageMap, filter.Severity, filter.ErrorCode)
		if len(errors) == 0 {
			continue // All errors filtered out
		}

		item := model.CorrectionAssistantItem{
			DailyValueID: dv.ID,
			EmployeeID:   dv.EmployeeID,
			ValueDate:    dv.ValueDate,
			Errors:       errors,
		}

		// Resolve employee name and department
		if dv.Employee != nil {
			item.EmployeeName = dv.Employee.FirstName + " " + dv.Employee.LastName
			if dv.Employee.DepartmentID != nil {
				item.DepartmentID = dv.Employee.DepartmentID
			}
			if dv.Employee.Department != nil {
				name := dv.Employee.Department.Name
				item.DepartmentName = &name
			}
		}

		items = append(items, item)
	}

	total := int64(len(items))

	// Apply pagination
	if filter.Offset > 0 && filter.Offset < len(items) {
		items = items[filter.Offset:]
	} else if filter.Offset >= len(items) {
		items = nil
	}
	if filter.Limit > 0 && filter.Limit < len(items) {
		items = items[:filter.Limit]
	}

	return items, total, nil
}

// defaultDateRange returns the default date range (previous month + current month)
// when no explicit range is provided.
func (s *CorrectionAssistantService) defaultDateRange(from, to *time.Time) (*time.Time, *time.Time) {
	if from != nil && to != nil {
		return from, to
	}

	now := time.Now()

	if from == nil {
		// First day of previous month
		prevMonth := now.AddDate(0, -1, 0)
		firstDay := time.Date(prevMonth.Year(), prevMonth.Month(), 1, 0, 0, 0, 0, time.UTC)
		from = &firstDay
	}

	if to == nil {
		// Last day of current month
		nextMonth := time.Date(now.Year(), now.Month()+1, 1, 0, 0, 0, 0, time.UTC)
		lastDay := nextMonth.AddDate(0, 0, -1)
		to = &lastDay
	}

	return from, to
}

// buildErrors builds correction assistant error entries from raw error codes and warnings,
// resolving message text from the catalog and applying severity/code filters.
func (s *CorrectionAssistantService) buildErrors(
	errorCodes []string,
	warnings []string,
	messageMap map[string]*model.CorrectionMessage,
	severityFilter *model.CorrectionSeverity,
	codeFilter *string,
) []model.CorrectionAssistantError {
	var result []model.CorrectionAssistantError

	// Process error codes
	for _, code := range errorCodes {
		severity := "error"
		if severityFilter != nil && string(*severityFilter) != severity {
			continue
		}
		if codeFilter != nil && *codeFilter != code {
			continue
		}

		msg := s.resolveMessage(code, severity, messageMap)
		result = append(result, msg)
	}

	// Process warnings as "hint" severity
	for _, code := range warnings {
		severity := "hint"
		if severityFilter != nil && string(*severityFilter) != severity {
			continue
		}
		if codeFilter != nil && *codeFilter != code {
			continue
		}

		msg := s.resolveMessage(code, severity, messageMap)
		result = append(result, msg)
	}

	return result
}

// resolveMessage resolves a single error code to a CorrectionAssistantError
// using the message catalog.
func (s *CorrectionAssistantService) resolveMessage(code, severity string, messageMap map[string]*model.CorrectionMessage) model.CorrectionAssistantError {
	message := code // Fallback to raw code
	if cm, ok := messageMap[code]; ok {
		message = cm.EffectiveText()
		// Use catalog severity if available
		severity = string(cm.Severity)
	}

	return model.CorrectionAssistantError{
		Code:      code,
		Severity:  severity,
		Message:   message,
		ErrorType: mapCorrectionErrorType(code),
	}
}

// mapCorrectionErrorType maps a raw error code to the DailyError error_type enum.
// Mirrors the logic in handler/booking.go mapDailyErrorType().
func mapCorrectionErrorType(code string) string {
	switch code {
	case calculation.ErrCodeMissingCome, calculation.ErrCodeMissingGo, calculation.ErrCodeNoBookings:
		return "missing_booking"
	case calculation.ErrCodeUnpairedBooking:
		return "unpaired_booking"
	case calculation.ErrCodeDuplicateInTime:
		return "overlapping_bookings"
	case calculation.ErrCodeEarlyCome, calculation.ErrCodeLateCome, calculation.ErrCodeEarlyGo,
		calculation.ErrCodeLateGo, calculation.ErrCodeMissedCoreStart, calculation.ErrCodeMissedCoreEnd:
		return "core_time_violation"
	case calculation.ErrCodeBelowMinWorkTime:
		return "below_min_hours"
	case calculation.WarnCodeNoBreakRecorded, calculation.WarnCodeShortBreak,
		calculation.WarnCodeManualBreak, calculation.WarnCodeAutoBreakApplied:
		return "break_violation"
	case calculation.WarnCodeMaxTimeReached:
		return "exceeds_max_hours"
	default:
		return "invalid_sequence"
	}
}

// defaultCorrectionMessages returns the default correction message entries for seeding.
func defaultCorrectionMessages(tenantID uuid.UUID) []model.CorrectionMessage {
	return []model.CorrectionMessage{
		// Error codes
		{TenantID: tenantID, Code: calculation.ErrCodeMissingCome, DefaultText: "Missing arrival booking", Severity: model.CorrectionSeverityError, Description: strPtr("No arrival booking found for this work day")},
		{TenantID: tenantID, Code: calculation.ErrCodeMissingGo, DefaultText: "Missing departure booking", Severity: model.CorrectionSeverityError, Description: strPtr("No departure booking found for this work day")},
		{TenantID: tenantID, Code: calculation.ErrCodeUnpairedBooking, DefaultText: "Unpaired booking", Severity: model.CorrectionSeverityError, Description: strPtr("A booking exists without a matching pair")},
		{TenantID: tenantID, Code: calculation.ErrCodeEarlyCome, DefaultText: "Arrival before allowed window", Severity: model.CorrectionSeverityError, Description: strPtr("Employee arrived before the allowed time window")},
		{TenantID: tenantID, Code: calculation.ErrCodeLateCome, DefaultText: "Arrival after allowed window", Severity: model.CorrectionSeverityError, Description: strPtr("Employee arrived after the allowed time window")},
		{TenantID: tenantID, Code: calculation.ErrCodeEarlyGo, DefaultText: "Departure before allowed window", Severity: model.CorrectionSeverityError, Description: strPtr("Employee departed before the allowed time window")},
		{TenantID: tenantID, Code: calculation.ErrCodeLateGo, DefaultText: "Departure after allowed window", Severity: model.CorrectionSeverityError, Description: strPtr("Employee departed after the allowed time window")},
		{TenantID: tenantID, Code: calculation.ErrCodeMissedCoreStart, DefaultText: "Missed core hours start", Severity: model.CorrectionSeverityError, Description: strPtr("Employee arrived after mandatory core hours started")},
		{TenantID: tenantID, Code: calculation.ErrCodeMissedCoreEnd, DefaultText: "Missed core hours end", Severity: model.CorrectionSeverityError, Description: strPtr("Employee departed before mandatory core hours ended")},
		{TenantID: tenantID, Code: calculation.ErrCodeBelowMinWorkTime, DefaultText: "Below minimum work time", Severity: model.CorrectionSeverityError, Description: strPtr("Actual work time is below the required minimum")},
		{TenantID: tenantID, Code: calculation.ErrCodeNoBookings, DefaultText: "No bookings for the day", Severity: model.CorrectionSeverityError, Description: strPtr("No bookings exist for an active work day")},
		{TenantID: tenantID, Code: calculation.ErrCodeInvalidTime, DefaultText: "Invalid time value", Severity: model.CorrectionSeverityError, Description: strPtr("A booking has a time value outside the valid range")},
		{TenantID: tenantID, Code: calculation.ErrCodeDuplicateInTime, DefaultText: "Duplicate arrival time", Severity: model.CorrectionSeverityError, Description: strPtr("Multiple arrival bookings at the same time")},
		{TenantID: tenantID, Code: calculation.ErrCodeNoMatchingShift, DefaultText: "No matching time plan found", Severity: model.CorrectionSeverityError, Description: strPtr("No day plan matches the booking times for shift detection")},
		// Warning codes (mapped to "hint" severity)
		{TenantID: tenantID, Code: calculation.WarnCodeCrossMidnight, DefaultText: "Shift spans midnight", Severity: model.CorrectionSeverityHint, Description: strPtr("The work shift crosses midnight into the next day")},
		{TenantID: tenantID, Code: calculation.WarnCodeMaxTimeReached, DefaultText: "Maximum work time reached", Severity: model.CorrectionSeverityHint, Description: strPtr("Net time was capped at the maximum allowed")},
		{TenantID: tenantID, Code: calculation.WarnCodeManualBreak, DefaultText: "Manual break booking exists", Severity: model.CorrectionSeverityHint, Description: strPtr("Break bookings exist; automatic break deduction was skipped")},
		{TenantID: tenantID, Code: calculation.WarnCodeNoBreakRecorded, DefaultText: "No break booking recorded", Severity: model.CorrectionSeverityHint, Description: strPtr("No break was booked although a break is required")},
		{TenantID: tenantID, Code: calculation.WarnCodeShortBreak, DefaultText: "Break duration too short", Severity: model.CorrectionSeverityHint, Description: strPtr("Recorded break is shorter than the required minimum")},
		{TenantID: tenantID, Code: calculation.WarnCodeAutoBreakApplied, DefaultText: "Automatic break applied", Severity: model.CorrectionSeverityHint, Description: strPtr("Break was automatically deducted per day plan rules")},
		{TenantID: tenantID, Code: calculation.WarnCodeMonthlyCap, DefaultText: "Monthly cap reached", Severity: model.CorrectionSeverityHint, Description: strPtr("Flextime credit was capped at the monthly maximum")},
		{TenantID: tenantID, Code: calculation.WarnCodeFlextimeCapped, DefaultText: "Flextime balance capped", Severity: model.CorrectionSeverityHint, Description: strPtr("Flextime balance was limited by positive or negative cap")},
		{TenantID: tenantID, Code: calculation.WarnCodeBelowThreshold, DefaultText: "Below threshold", Severity: model.CorrectionSeverityHint, Description: strPtr("Overtime is below the configured threshold and was forfeited")},
		{TenantID: tenantID, Code: calculation.WarnCodeNoCarryover, DefaultText: "No carryover", Severity: model.CorrectionSeverityHint, Description: strPtr("Account credit type resets to zero with no carryover")},
	}
}

func strPtr(s string) *string {
	return &s
}
```

### Success Criteria

#### Automated Verification:
- [ ] Code compiles: `cd apps/api && go build ./...`
- [ ] No lint errors: `cd apps/api && golangci-lint run ./internal/service/...`

---

## Phase 6: Handler Layer

### Overview
Create the HTTP handler for correction message catalog and correction assistant endpoints. Add permissions and route registration following existing patterns.

### Changes Required

#### 1. Add Permissions
**File**: `apps/api/internal/permissions/permissions.go`

Add to `allPermissions` slice:
```go
{ID: permissionID("correction_assistant.view"), Resource: "correction_assistant", Action: "view", Description: "View correction assistant"},
{ID: permissionID("correction_messages.manage"), Resource: "correction_messages", Action: "manage", Description: "Manage correction message catalog"},
```

#### 2. Correction Assistant Handler
**File**: `apps/api/internal/handler/correction_assistant.go`

```go
package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

// CorrectionAssistantHandler handles correction assistant HTTP endpoints.
type CorrectionAssistantHandler struct {
	svc *service.CorrectionAssistantService
}

// NewCorrectionAssistantHandler creates a new correction assistant handler.
func NewCorrectionAssistantHandler(svc *service.CorrectionAssistantService) *CorrectionAssistantHandler {
	return &CorrectionAssistantHandler{svc: svc}
}

// ListMessages handles GET /correction-messages
func (h *CorrectionAssistantHandler) ListMessages(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	// Ensure defaults exist
	_ = h.svc.EnsureDefaults(r.Context(), tenantID)

	filter := model.CorrectionMessageFilter{}
	if sev := r.URL.Query().Get("severity"); sev != "" {
		s := model.CorrectionSeverity(sev)
		filter.Severity = &s
	}
	if active := r.URL.Query().Get("is_active"); active != "" {
		if b, err := strconv.ParseBool(active); err == nil {
			filter.IsActive = &b
		}
	}
	if code := r.URL.Query().Get("code"); code != "" {
		filter.Code = &code
	}

	messages, err := h.svc.ListMessages(r.Context(), tenantID, filter)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list correction messages")
		return
	}

	data := make([]*models.CorrectionMessage, 0, len(messages))
	for i := range messages {
		data = append(data, mapCorrectionMessageToResponse(&messages[i]))
	}

	respondJSON(w, http.StatusOK, &models.CorrectionMessageList{
		Data: data,
	})
}

// GetMessage handles GET /correction-messages/{id}
func (h *CorrectionAssistantHandler) GetMessage(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid correction message ID")
		return
	}

	cm, err := h.svc.GetMessage(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Correction message not found")
		return
	}

	respondJSON(w, http.StatusOK, mapCorrectionMessageToResponse(cm))
}

// UpdateMessage handles PATCH /correction-messages/{id}
func (h *CorrectionAssistantHandler) UpdateMessage(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid correction message ID")
		return
	}

	var req models.UpdateCorrectionMessageRequest
	if err := parseJSONBody(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	input := service.UpdateMessageInput{}
	if req.CustomText != "" {
		input.CustomText = &req.CustomText
	}
	if req.Severity != "" {
		sev := req.Severity
		input.Severity = &sev
	}
	if req.IsActive != nil {
		input.IsActive = req.IsActive
	}

	cm, err := h.svc.UpdateMessage(r.Context(), id, tenantID, input)
	if err != nil {
		switch err {
		case service.ErrCorrectionMessageNotFound:
			respondError(w, http.StatusNotFound, "Correction message not found")
		case service.ErrInvalidSeverity:
			respondError(w, http.StatusBadRequest, err.Error())
		default:
			respondError(w, http.StatusInternalServerError, "Failed to update correction message")
		}
		return
	}

	respondJSON(w, http.StatusOK, mapCorrectionMessageToResponse(cm))
}

// ListItems handles GET /correction-assistant
func (h *CorrectionAssistantHandler) ListItems(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	// Ensure defaults exist
	_ = h.svc.EnsureDefaults(r.Context(), tenantID)

	filter := model.CorrectionAssistantFilter{
		Limit: 50,
	}

	if fromStr := r.URL.Query().Get("from"); fromStr != "" {
		if t, err := time.Parse("2006-01-02", fromStr); err == nil {
			filter.From = &t
		}
	}
	if toStr := r.URL.Query().Get("to"); toStr != "" {
		if t, err := time.Parse("2006-01-02", toStr); err == nil {
			filter.To = &t
		}
	}
	if empID := r.URL.Query().Get("employee_id"); empID != "" {
		if eid, err := uuid.Parse(empID); err == nil {
			filter.EmployeeID = &eid
		}
	}
	if deptID := r.URL.Query().Get("department_id"); deptID != "" {
		if did, err := uuid.Parse(deptID); err == nil {
			filter.DepartmentID = &did
		}
	}
	if sev := r.URL.Query().Get("severity"); sev != "" {
		s := model.CorrectionSeverity(sev)
		filter.Severity = &s
	}
	if code := r.URL.Query().Get("error_code"); code != "" {
		filter.ErrorCode = &code
	}
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 200 {
			filter.Limit = l
		}
	}
	if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
			filter.Offset = o
		}
	}

	items, total, err := h.svc.ListItems(r.Context(), tenantID, filter)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list correction assistant items")
		return
	}

	data := make([]*models.CorrectionAssistantItem, 0, len(items))
	for i := range items {
		data = append(data, mapCorrectionAssistantItemToResponse(&items[i]))
	}

	respondJSON(w, http.StatusOK, &models.CorrectionAssistantList{
		Data: data,
		Meta: &models.PaginationMeta{
			Total: total,
			Limit: int64(filter.Limit),
		},
	})
}

// --- Response Mapping ---

func mapCorrectionMessageToResponse(cm *model.CorrectionMessage) *models.CorrectionMessage {
	id := strfmt.UUID(cm.ID.String())
	tenantID := strfmt.UUID(cm.TenantID.String())
	effectiveText := cm.EffectiveText()
	createdAt := strfmt.DateTime(cm.CreatedAt)
	updatedAt := strfmt.DateTime(cm.UpdatedAt)

	resp := &models.CorrectionMessage{
		ID:            &id,
		TenantID:      &tenantID,
		Code:          &cm.Code,
		DefaultText:   &cm.DefaultText,
		EffectiveText: effectiveText,
		Severity:      string(cm.Severity),
		IsActive:      &cm.IsActive,
		CreatedAt:     createdAt,
		UpdatedAt:     updatedAt,
	}

	if cm.CustomText != nil {
		resp.CustomText = *cm.CustomText
	}
	if cm.Description != nil {
		resp.Description = *cm.Description
	}

	return resp
}

func mapCorrectionAssistantItemToResponse(item *model.CorrectionAssistantItem) *models.CorrectionAssistantItem {
	dvID := strfmt.UUID(item.DailyValueID.String())
	empID := strfmt.UUID(item.EmployeeID.String())
	valueDate := strfmt.Date(item.ValueDate)

	resp := &models.CorrectionAssistantItem{
		DailyValueID: &dvID,
		EmployeeID:   &empID,
		EmployeeName: item.EmployeeName,
		ValueDate:    &valueDate,
	}

	if item.DepartmentID != nil {
		deptID := strfmt.UUID(item.DepartmentID.String())
		resp.DepartmentID = &deptID
	}
	if item.DepartmentName != nil {
		resp.DepartmentName = *item.DepartmentName
	}

	errors := make([]*models.CorrectionAssistantError, 0, len(item.Errors))
	for _, e := range item.Errors {
		errors = append(errors, &models.CorrectionAssistantError{
			Code:      &e.Code,
			Severity:  &e.Severity,
			Message:   &e.Message,
			ErrorType: e.ErrorType,
		})
	}
	resp.Errors = errors

	return resp
}
```

#### 3. Route Registration
**File**: `apps/api/internal/handler/routes.go`

Add the following function:

```go
// RegisterCorrectionAssistantRoutes registers correction assistant routes.
func RegisterCorrectionAssistantRoutes(r chi.Router, h *CorrectionAssistantHandler, authz *middleware.AuthorizationMiddleware) {
	permView := permissions.ID("correction_assistant.view").String()
	permManage := permissions.ID("correction_messages.manage").String()

	// Correction message catalog
	r.Route("/correction-messages", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.ListMessages)
			r.Get("/{id}", h.GetMessage)
			r.Patch("/{id}", h.UpdateMessage)
			return
		}
		r.With(authz.RequirePermission(permManage)).Get("/", h.ListMessages)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.GetMessage)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.UpdateMessage)
	})

	// Correction assistant query
	if authz == nil {
		r.Get("/correction-assistant", h.ListItems)
		return
	}
	r.With(authz.RequirePermission(permView)).Get("/correction-assistant", h.ListItems)
}
```

#### 4. Wire in Main Server
**File**: `apps/api/cmd/server/main.go`

Add to the repository initialization section:
```go
correctionMessageRepo := repository.NewCorrectionMessageRepository(db)
```

Add to the service initialization section:
```go
correctionAssistantService := service.NewCorrectionAssistantService(correctionMessageRepo, dailyValueRepo, employeeRepo)
```

Add to the handler initialization section:
```go
correctionAssistantHandler := handler.NewCorrectionAssistantHandler(correctionAssistantService)
```

Add to the tenant-scoped route registration block:
```go
handler.RegisterCorrectionAssistantRoutes(r, correctionAssistantHandler, authzMiddleware)
```

### Success Criteria

#### Automated Verification:
- [ ] Code compiles: `cd apps/api && go build ./...`
- [ ] No lint errors: `make lint`
- [ ] Server starts without errors: `make dev`
- [ ] `GET /api/v1/correction-messages` returns 200 with seeded data
- [ ] `PATCH /api/v1/correction-messages/{id}` returns 200 with updated data
- [ ] `GET /api/v1/correction-assistant` returns 200 with correction items

#### Manual Verification:
- [ ] Verify correction messages are seeded on first access
- [ ] Verify custom text override appears in correction assistant output
- [ ] Verify default date range covers previous + current month

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 7: Unit Tests

### Overview
Write comprehensive unit tests for the correction assistant service, covering catalog management, message resolution, date range defaults, filtering, and custom text overrides.

### Changes Required

#### 1. Service Tests
**File**: `apps/api/internal/service/correction_assistant_test.go`

Test cases to implement:

```go
// Catalog management tests
func TestCorrectionAssistantService_EnsureDefaults(t *testing.T)
// - Seeds 24 default entries for a new tenant
// - Does not re-seed if entries already exist

func TestCorrectionAssistantService_ListMessages(t *testing.T)
// - Returns all messages for a tenant
// - Filters by severity
// - Filters by active status

func TestCorrectionAssistantService_GetMessage_Success(t *testing.T)
// - Returns message by ID

func TestCorrectionAssistantService_GetMessage_NotFound(t *testing.T)
// - Returns ErrCorrectionMessageNotFound for unknown ID

func TestCorrectionAssistantService_UpdateMessage_CustomText(t *testing.T)
// - Sets custom_text, verifies EffectiveText() returns custom
// - Clears custom_text, verifies EffectiveText() returns default

func TestCorrectionAssistantService_UpdateMessage_Severity(t *testing.T)
// - Changes severity from error to hint
// - Rejects invalid severity

func TestCorrectionAssistantService_UpdateMessage_WrongTenant(t *testing.T)
// - Returns ErrCorrectionMessageNotFound for wrong tenant

// Correction assistant query tests
func TestCorrectionAssistantService_ListItems_DefaultDateRange(t *testing.T)
// - With no from/to, returns items in previous+current month range only
// - Does not return items outside the range

func TestCorrectionAssistantService_ListItems_CustomDateRange(t *testing.T)
// - With explicit from/to, returns items in that range

func TestCorrectionAssistantService_ListItems_FilterByEmployee(t *testing.T)
// - Returns only items for the specified employee

func TestCorrectionAssistantService_ListItems_FilterByDepartment(t *testing.T)
// - Returns only items for employees in the specified department

func TestCorrectionAssistantService_ListItems_FilterBySeverity(t *testing.T)
// - With severity=error, returns only error items (not hints)
// - With severity=hint, returns only hint items (not errors)

func TestCorrectionAssistantService_ListItems_FilterByErrorCode(t *testing.T)
// - Returns only items with the specified error code

func TestCorrectionAssistantService_ListItems_CustomMessageOverride(t *testing.T)
// - After setting custom_text, correction assistant shows custom text
// - After clearing custom_text, shows default text

func TestCorrectionAssistantService_ListItems_Pagination(t *testing.T)
// - Limit and offset work correctly

func TestCorrectionAssistantService_ListItems_MessageResolution(t *testing.T)
// - Unknown error codes fall back to raw code as message text
// - Known codes resolve to catalog text

// Model tests
func TestCorrectionMessage_EffectiveText(t *testing.T)
// - Returns custom_text when set
// - Returns default_text when custom_text is nil
// - Returns default_text when custom_text is empty string
```

Each test follows the pattern from `service/bookingtype_test.go`:
- `db := testutil.SetupTestDB(t)` for database isolation
- Create tenant using helper function
- Create repo and service
- Set up test data using repository methods
- Assert expected behavior

### Success Criteria

#### Automated Verification:
- [ ] All tests pass: `cd apps/api && go test -v -run TestCorrectionAssistant ./internal/service/...`
- [ ] All tests pass: `cd apps/api && go test -v -run TestCorrectionMessage ./internal/model/...`
- [ ] Full test suite still passes: `make test`

---

## Phase 8: Code Generation and Final Verification

### Overview
Run the full code generation pipeline and verify everything works end-to-end.

### Steps

1. Bundle the OpenAPI spec:
```bash
make swagger-bundle
```

2. Generate Go models:
```bash
make generate
```

3. Verify generated models exist and compile:
```bash
cd apps/api && go build ./...
```

4. Run linter:
```bash
make lint
```

5. Run all tests:
```bash
make test
```

6. Format code:
```bash
make fmt
```

### Success Criteria

#### Automated Verification:
- [ ] `make swagger-bundle` succeeds without errors
- [ ] `make generate` produces all expected model files
- [ ] `cd apps/api && go build ./...` compiles without errors
- [ ] `make lint` passes
- [ ] `make test` passes (all tests including new ones)
- [ ] `make fmt` makes no changes

#### Manual Verification:
- [ ] Start dev server with `make dev`
- [ ] `GET /api/v1/correction-messages` returns 24 seeded entries
- [ ] `PATCH /api/v1/correction-messages/{id}` with `{"custom_text": "Custom override"}` succeeds
- [ ] `GET /api/v1/correction-assistant` returns items with resolved message text
- [ ] Custom text override appears in correction assistant output
- [ ] Default date range covers previous + current month
- [ ] Filter by department_id returns only matching employees
- [ ] Filter by severity=error excludes hints
- [ ] Swagger UI at `/swagger/` shows new endpoints

---

## Testing Strategy

### Unit Tests
- CorrectionMessage.EffectiveText() helper method
- EnsureDefaults idempotency
- UpdateMessage validation (invalid severity, wrong tenant)
- defaultDateRange calculation
- buildErrors with severity/code filters
- resolveMessage with catalog lookup and fallback
- mapCorrectionErrorType mapping

### Integration Tests (via Service Tests)
- Full flow: seed defaults -> update custom text -> query assistant -> verify custom text in output
- Date range filtering with real daily_values
- Department-based filtering through employee join
- Pagination (limit/offset)

### Manual Testing Steps
1. Start dev server: `make dev`
2. Login as admin: `GET /api/v1/auth/dev/login?role=admin`
3. List correction messages: `GET /api/v1/correction-messages` (verify 24 entries)
4. Update a message: `PATCH /api/v1/correction-messages/{id}` with `{"custom_text": "Custom error text"}`
5. List correction assistant items: `GET /api/v1/correction-assistant`
6. Verify custom text appears for the updated code
7. Filter by department: `GET /api/v1/correction-assistant?department_id={id}`
8. Filter by severity: `GET /api/v1/correction-assistant?severity=error`
9. Check default date range: `GET /api/v1/correction-assistant` (no from/to)

## Performance Considerations

- The `correction_messages` catalog is small (24 entries per tenant) and loaded once per assistant query via `ListAsMap()`
- The correction assistant query leverages the existing partial index `idx_daily_values_errors` on `has_error = true`
- In-memory filtering (severity, error_code) is applied after loading daily_values, which is acceptable for the expected data volumes
- If performance becomes an issue with large datasets, the pagination (limit/offset) prevents unbounded result sets

## Migration Notes

- Migration 000045 creates a new table only, no schema changes to existing tables
- Rollback is safe (just drops the table)
- No data migration needed (correction_messages are seeded lazily on first access per tenant)
- The correction assistant reads from existing daily_values data (no write path changes)

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-012-correction-assistant-and-errors.md`
- Research document: `thoughts/shared/research/2026-01-29-ZMI-TICKET-012-correction-assistant-and-errors.md`
- Reference manual: `thoughts/shared/reference/zmi-calculation-manual-reference.md`
- Error codes: `apps/api/internal/calculation/errors.go`
- DailyValue model: `apps/api/internal/model/dailyvalue.go`
- Existing error mapping: `apps/api/internal/handler/booking.go:760-842`
- DailyValue repository: `apps/api/internal/repository/dailyvalue.go`
- BookingType service pattern: `apps/api/internal/service/bookingtype.go`
- AuditLog handler pattern: `apps/api/internal/handler/auditlog.go`
- Route registration: `apps/api/internal/handler/routes.go`
- Main server wiring: `apps/api/cmd/server/main.go`
- Test pattern: `apps/api/internal/service/bookingtype_test.go`
