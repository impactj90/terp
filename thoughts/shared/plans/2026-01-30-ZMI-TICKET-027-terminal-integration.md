# Implementation Plan: ZMI-TICKET-027 - Terminal Integration and Raw Booking Ingest

**Ticket**: ZMI-TICKET-027
**Date**: 2026-01-30
**Status**: Ready for Implementation
**Dependencies**: ZMI-TICKET-011 (Booking Ingest/Edit) - Done, ZMI-TICKET-022 (Scheduler) - Done

---

## Overview

This plan implements terminal integration capabilities: a separate `raw_terminal_bookings` table for immutable terminal data, an `import_batches` table for idempotent batch import tracking, API endpoints for querying raw bookings and triggering imports, and scheduler task types for terminal sync operations.

Key requirements:
- Raw terminal bookings stored separately from processed bookings
- Import batches are idempotent (re-importing same batch ID is a no-op)
- Terminal sync tasks integrate with the existing scheduler infrastructure
- API endpoints for listing raw terminal bookings and triggering imports

---

## Phase 1: Database Migrations

### Files to Create

#### `db/migrations/000071_create_import_batches.up.sql`

```sql
-- =============================================================
-- Create import_batches table for tracking terminal import batches
-- ZMI-TICKET-027: Terminal Integration and Raw Booking Ingest
-- =============================================================

CREATE TABLE import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    batch_reference VARCHAR(255) NOT NULL,
    source VARCHAR(50) NOT NULL DEFAULT 'terminal',
    terminal_id VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    records_total INT NOT NULL DEFAULT 0,
    records_imported INT NOT NULL DEFAULT 0,
    records_failed INT NOT NULL DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_import_batches_tenant ON import_batches(tenant_id);
CREATE INDEX idx_import_batches_reference ON import_batches(tenant_id, batch_reference);
CREATE UNIQUE INDEX idx_import_batches_unique_ref ON import_batches(tenant_id, batch_reference);
CREATE INDEX idx_import_batches_status ON import_batches(status);

CREATE TRIGGER update_import_batches_updated_at
    BEFORE UPDATE ON import_batches
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE import_batches IS 'Tracks terminal import batches for idempotent processing (ZMI-TICKET-027).';
COMMENT ON COLUMN import_batches.batch_reference IS 'Unique batch identifier per tenant for idempotent imports.';
COMMENT ON COLUMN import_batches.status IS 'Batch status: pending, processing, completed, failed.';
```

#### `db/migrations/000071_create_import_batches.down.sql`

```sql
DROP TABLE IF EXISTS import_batches;
```

#### `db/migrations/000072_create_raw_terminal_bookings.up.sql`

```sql
-- =============================================================
-- Create raw_terminal_bookings table for immutable terminal data
-- ZMI-TICKET-027: Terminal Integration and Raw Booking Ingest
-- =============================================================

CREATE TABLE raw_terminal_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    import_batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
    terminal_id VARCHAR(100) NOT NULL,
    employee_pin VARCHAR(20) NOT NULL,
    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    raw_timestamp TIMESTAMPTZ NOT NULL,
    raw_booking_code VARCHAR(20) NOT NULL,
    booking_date DATE NOT NULL,
    booking_type_id UUID REFERENCES booking_types(id) ON DELETE SET NULL,
    processed_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_raw_terminal_bookings_tenant ON raw_terminal_bookings(tenant_id);
CREATE INDEX idx_raw_terminal_bookings_batch ON raw_terminal_bookings(import_batch_id);
CREATE INDEX idx_raw_terminal_bookings_terminal ON raw_terminal_bookings(tenant_id, terminal_id);
CREATE INDEX idx_raw_terminal_bookings_employee ON raw_terminal_bookings(employee_id);
CREATE INDEX idx_raw_terminal_bookings_date ON raw_terminal_bookings(tenant_id, booking_date);
CREATE INDEX idx_raw_terminal_bookings_date_range ON raw_terminal_bookings(tenant_id, booking_date, terminal_id);
CREATE INDEX idx_raw_terminal_bookings_status ON raw_terminal_bookings(status) WHERE status = 'pending';

CREATE TRIGGER update_raw_terminal_bookings_updated_at
    BEFORE UPDATE ON raw_terminal_bookings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE raw_terminal_bookings IS 'Immutable raw booking data read from time recording terminals (ZMI-TICKET-027).';
COMMENT ON COLUMN raw_terminal_bookings.terminal_id IS 'Identifier of the physical terminal device.';
COMMENT ON COLUMN raw_terminal_bookings.employee_pin IS 'Employee PIN as read from the terminal.';
COMMENT ON COLUMN raw_terminal_bookings.raw_timestamp IS 'Original timestamp from the terminal clock.';
COMMENT ON COLUMN raw_terminal_bookings.raw_booking_code IS 'Raw booking code from terminal (e.g. A1, A2, P1, P2, D1, D2).';
COMMENT ON COLUMN raw_terminal_bookings.processed_booking_id IS 'Link to the processed booking created from this raw record.';
COMMENT ON COLUMN raw_terminal_bookings.status IS 'Processing status: pending, processed, failed, skipped.';
```

#### `db/migrations/000072_create_raw_terminal_bookings.down.sql`

```sql
DROP TABLE IF EXISTS raw_terminal_bookings;
```

### Patterns Followed
- UUID primary keys with `gen_random_uuid()`
- `tenant_id` FK to tenants with CASCADE delete
- Standard timestamps with `update_updated_at_column()` trigger
- Index naming: `idx_tablename_columnname`
- Table and column comments
- Unique constraint for idempotent batch references

### Verification
```bash
make migrate-up
# Confirm tables exist:
# docker exec -it terp-postgres-1 psql -U terp -d terp -c "\dt import_batches"
# docker exec -it terp-postgres-1 psql -U terp -d terp -c "\dt raw_terminal_bookings"
```

---

## Phase 2: Domain Models

### Files to Create

#### `apps/api/internal/model/terminal.go`

```go
package model

import (
    "time"

    "github.com/google/uuid"
)

// ImportBatchStatus represents the status of an import batch.
type ImportBatchStatus string

const (
    ImportBatchStatusPending    ImportBatchStatus = "pending"
    ImportBatchStatusProcessing ImportBatchStatus = "processing"
    ImportBatchStatusCompleted  ImportBatchStatus = "completed"
    ImportBatchStatusFailed     ImportBatchStatus = "failed"
)

// RawBookingStatus represents the processing status of a raw terminal booking.
type RawBookingStatus string

const (
    RawBookingStatusPending   RawBookingStatus = "pending"
    RawBookingStatusProcessed RawBookingStatus = "processed"
    RawBookingStatusFailed    RawBookingStatus = "failed"
    RawBookingStatusSkipped   RawBookingStatus = "skipped"
)

// ImportBatch tracks a terminal import batch for idempotent processing.
type ImportBatch struct {
    ID              uuid.UUID         `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID        uuid.UUID         `gorm:"type:uuid;not null;index" json:"tenant_id"`
    BatchReference  string            `gorm:"type:varchar(255);not null" json:"batch_reference"`
    Source          string            `gorm:"type:varchar(50);not null;default:'terminal'" json:"source"`
    TerminalID      *string           `gorm:"type:varchar(100)" json:"terminal_id,omitempty"`
    Status          ImportBatchStatus `gorm:"type:varchar(20);not null;default:'pending'" json:"status"`
    RecordsTotal    int               `gorm:"default:0" json:"records_total"`
    RecordsImported int               `gorm:"default:0" json:"records_imported"`
    RecordsFailed   int               `gorm:"default:0" json:"records_failed"`
    ErrorMessage    *string           `gorm:"type:text" json:"error_message,omitempty"`
    StartedAt       *time.Time        `gorm:"type:timestamptz" json:"started_at,omitempty"`
    CompletedAt     *time.Time        `gorm:"type:timestamptz" json:"completed_at,omitempty"`
    CreatedAt       time.Time         `gorm:"type:timestamptz;default:now()" json:"created_at"`
    UpdatedAt       time.Time         `gorm:"type:timestamptz;default:now()" json:"updated_at"`

    // Relations
    RawBookings []RawTerminalBooking `gorm:"foreignKey:ImportBatchID" json:"raw_bookings,omitempty"`
}

func (ImportBatch) TableName() string { return "import_batches" }

// RawTerminalBooking stores immutable raw booking data from a terminal.
type RawTerminalBooking struct {
    ID                 uuid.UUID        `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID           uuid.UUID        `gorm:"type:uuid;not null;index" json:"tenant_id"`
    ImportBatchID      uuid.UUID        `gorm:"type:uuid;not null;index" json:"import_batch_id"`
    TerminalID         string           `gorm:"type:varchar(100);not null" json:"terminal_id"`
    EmployeePIN        string           `gorm:"type:varchar(20);not null" json:"employee_pin"`
    EmployeeID         *uuid.UUID       `gorm:"type:uuid" json:"employee_id,omitempty"`
    RawTimestamp       time.Time        `gorm:"type:timestamptz;not null" json:"raw_timestamp"`
    RawBookingCode     string           `gorm:"type:varchar(20);not null" json:"raw_booking_code"`
    BookingDate        time.Time        `gorm:"type:date;not null" json:"booking_date"`
    BookingTypeID      *uuid.UUID       `gorm:"type:uuid" json:"booking_type_id,omitempty"`
    ProcessedBookingID *uuid.UUID       `gorm:"type:uuid" json:"processed_booking_id,omitempty"`
    Status             RawBookingStatus `gorm:"type:varchar(20);not null;default:'pending'" json:"status"`
    ErrorMessage       *string          `gorm:"type:text" json:"error_message,omitempty"`
    CreatedAt          time.Time        `gorm:"type:timestamptz;default:now()" json:"created_at"`
    UpdatedAt          time.Time        `gorm:"type:timestamptz;default:now()" json:"updated_at"`

    // Relations
    Employee    *Employee    `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
    BookingType *BookingType `gorm:"foreignKey:BookingTypeID" json:"booking_type,omitempty"`
    ImportBatch *ImportBatch `gorm:"foreignKey:ImportBatchID" json:"import_batch,omitempty"`
}

func (RawTerminalBooking) TableName() string { return "raw_terminal_bookings" }
```

### Patterns Followed
- Matches `apps/api/internal/model/booking.go` and `apps/api/internal/model/schedule.go` struct patterns
- UUID primary keys, TenantID, CreatedAt/UpdatedAt
- String-typed enums with constants
- Pointer types for nullable fields
- `TableName()` method on each struct
- GORM struct tags and JSON struct tags

### Files to Modify

#### `apps/api/internal/model/schedule.go`

Add two new task type constants:

```go
// Add to the TaskType constants block:
TaskTypeTerminalSync   TaskType = "terminal_sync"
TaskTypeTerminalImport TaskType = "terminal_import"
```

### Verification
```bash
cd /home/tolga/projects/terp/apps/api && go build ./...
```

---

## Phase 3: OpenAPI Spec

### Files to Create

#### `api/schemas/terminal-bookings.yaml`

Define schemas for raw terminal bookings, import batches, and request/response models:

```yaml
# Terminal Booking schemas

RawTerminalBooking:
  type: object
  required:
    - id
    - tenant_id
    - import_batch_id
    - terminal_id
    - employee_pin
    - raw_timestamp
    - raw_booking_code
    - booking_date
    - status
  properties:
    id:
      type: string
      format: uuid
    tenant_id:
      type: string
      format: uuid
    import_batch_id:
      type: string
      format: uuid
    terminal_id:
      type: string
    employee_pin:
      type: string
    employee_id:
      type: string
      format: uuid
      x-nullable: true
    raw_timestamp:
      type: string
      format: date-time
    raw_booking_code:
      type: string
      description: "Raw booking code from terminal (e.g. A1, A2, P1, P2, D1, D2)"
    booking_date:
      type: string
      format: date
    booking_type_id:
      type: string
      format: uuid
      x-nullable: true
    processed_booking_id:
      type: string
      format: uuid
      x-nullable: true
    status:
      type: string
      enum: [pending, processed, failed, skipped]
    error_message:
      type: string
      x-nullable: true
    employee:
      $ref: '../schemas/employees.yaml#/EmployeeSummary'
    booking_type:
      $ref: '../schemas/bookings.yaml#/BookingTypeSummary'
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time

RawTerminalBookingList:
  type: object
  required:
    - data
    - meta
  properties:
    data:
      type: array
      items:
        $ref: '#/RawTerminalBooking'
    meta:
      $ref: '../schemas/common.yaml#/PaginationMeta'

ImportBatch:
  type: object
  required:
    - id
    - tenant_id
    - batch_reference
    - source
    - status
  properties:
    id:
      type: string
      format: uuid
    tenant_id:
      type: string
      format: uuid
    batch_reference:
      type: string
    source:
      type: string
    terminal_id:
      type: string
      x-nullable: true
    status:
      type: string
      enum: [pending, processing, completed, failed]
    records_total:
      type: integer
    records_imported:
      type: integer
    records_failed:
      type: integer
    error_message:
      type: string
      x-nullable: true
    started_at:
      type: string
      format: date-time
      x-nullable: true
    completed_at:
      type: string
      format: date-time
      x-nullable: true
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time

ImportBatchList:
  type: object
  required:
    - data
    - meta
  properties:
    data:
      type: array
      items:
        $ref: '#/ImportBatch'
    meta:
      $ref: '../schemas/common.yaml#/PaginationMeta'

TriggerTerminalImportRequest:
  type: object
  required:
    - batch_reference
    - terminal_id
    - bookings
  properties:
    batch_reference:
      type: string
      minLength: 1
      maxLength: 255
      description: "Unique batch identifier for idempotent import"
    terminal_id:
      type: string
      minLength: 1
      maxLength: 100
    bookings:
      type: array
      items:
        $ref: '#/RawTerminalBookingInput'

RawTerminalBookingInput:
  type: object
  required:
    - employee_pin
    - raw_timestamp
    - raw_booking_code
  properties:
    employee_pin:
      type: string
      minLength: 1
      maxLength: 20
    raw_timestamp:
      type: string
      format: date-time
    raw_booking_code:
      type: string
      minLength: 1
      maxLength: 20
      description: "Booking code (e.g. A1, A2, P1, P2, D1, D2)"

TriggerTerminalImportResponse:
  type: object
  required:
    - batch
  properties:
    batch:
      $ref: '#/ImportBatch'
    message:
      type: string
      description: "Human-readable result message"
    was_duplicate:
      type: boolean
      description: "True if this batch_reference was already imported (idempotent)"
```

#### `api/paths/terminal-bookings.yaml`

Define the endpoint paths:

```yaml
# Terminal booking paths

/terminal-bookings:
  get:
    summary: List raw terminal bookings
    description: List raw terminal bookings filtered by date range and optional terminal ID.
    operationId: listRawTerminalBookings
    tags:
      - Terminal Bookings
    parameters:
      - name: X-Tenant-ID
        in: header
        required: true
        type: string
        format: uuid
      - name: from
        in: query
        required: true
        type: string
        format: date
        description: Start date (inclusive)
      - name: to
        in: query
        required: true
        type: string
        format: date
        description: End date (inclusive)
      - name: terminal_id
        in: query
        type: string
        description: Filter by terminal device ID
      - name: employee_id
        in: query
        type: string
        format: uuid
        description: Filter by employee ID
      - name: status
        in: query
        type: string
        enum: [pending, processed, failed, skipped]
        description: Filter by processing status
      - name: import_batch_id
        in: query
        type: string
        format: uuid
        description: Filter by import batch
      - name: limit
        in: query
        type: integer
        default: 50
      - name: page
        in: query
        type: integer
        default: 1
    responses:
      200:
        description: List of raw terminal bookings
        schema:
          $ref: '../schemas/terminal-bookings.yaml#/RawTerminalBookingList'
      400:
        description: Invalid request parameters
        schema:
          $ref: '../schemas/common.yaml#/ProblemDetails'

/terminal-bookings/import:
  post:
    summary: Trigger terminal booking import
    description: |
      Import raw bookings from a terminal. The import is idempotent per batch_reference:
      if the same batch_reference has already been imported for this tenant, the request
      returns the existing batch without re-importing.
    operationId: triggerTerminalImport
    tags:
      - Terminal Bookings
    parameters:
      - name: X-Tenant-ID
        in: header
        required: true
        type: string
        format: uuid
    parameters:
      - name: X-Tenant-ID
        in: header
        required: true
        type: string
        format: uuid
      - name: body
        in: body
        required: true
        schema:
          $ref: '../schemas/terminal-bookings.yaml#/TriggerTerminalImportRequest'
    responses:
      200:
        description: Import triggered (or duplicate batch returned)
        schema:
          $ref: '../schemas/terminal-bookings.yaml#/TriggerTerminalImportResponse'
      400:
        description: Invalid request
        schema:
          $ref: '../schemas/common.yaml#/ProblemDetails'
      409:
        description: Batch already imported (idempotent - returns existing batch)
        schema:
          $ref: '../schemas/terminal-bookings.yaml#/TriggerTerminalImportResponse'

/import-batches:
  get:
    summary: List import batches
    description: List terminal import batches with optional filters.
    operationId: listImportBatches
    tags:
      - Terminal Bookings
    parameters:
      - name: X-Tenant-ID
        in: header
        required: true
        type: string
        format: uuid
      - name: status
        in: query
        type: string
        enum: [pending, processing, completed, failed]
      - name: terminal_id
        in: query
        type: string
      - name: limit
        in: query
        type: integer
        default: 50
      - name: page
        in: query
        type: integer
        default: 1
    responses:
      200:
        description: List of import batches
        schema:
          $ref: '../schemas/terminal-bookings.yaml#/ImportBatchList'

/import-batches/{id}:
  get:
    summary: Get import batch by ID
    description: Get a single import batch with its summary.
    operationId: getImportBatch
    tags:
      - Terminal Bookings
    parameters:
      - name: X-Tenant-ID
        in: header
        required: true
        type: string
        format: uuid
      - name: id
        in: path
        required: true
        type: string
        format: uuid
    responses:
      200:
        description: Import batch details
        schema:
          $ref: '../schemas/terminal-bookings.yaml#/ImportBatch'
      404:
        description: Batch not found
        schema:
          $ref: '../schemas/common.yaml#/ProblemDetails'
```

### Files to Modify

#### `api/openapi.yaml`

1. Add tag:
```yaml
  - name: Terminal Bookings
    description: Raw terminal booking data and import batch management
```

2. Add path references:
```yaml
  # Terminal Bookings
  /terminal-bookings:
    $ref: 'paths/terminal-bookings.yaml#/~1terminal-bookings'
  /terminal-bookings/import:
    $ref: 'paths/terminal-bookings.yaml#/~1terminal-bookings~1import'
  /import-batches:
    $ref: 'paths/terminal-bookings.yaml#/~1import-batches'
  /import-batches/{id}:
    $ref: 'paths/terminal-bookings.yaml#/~1import-batches~1{id}'
```

3. Add definition references:
```yaml
  # Terminal Bookings
  RawTerminalBooking:
    $ref: 'schemas/terminal-bookings.yaml#/RawTerminalBooking'
  RawTerminalBookingList:
    $ref: 'schemas/terminal-bookings.yaml#/RawTerminalBookingList'
  ImportBatch:
    $ref: 'schemas/terminal-bookings.yaml#/ImportBatch'
  ImportBatchList:
    $ref: 'schemas/terminal-bookings.yaml#/ImportBatchList'
  TriggerTerminalImportRequest:
    $ref: 'schemas/terminal-bookings.yaml#/TriggerTerminalImportRequest'
  TriggerTerminalImportResponse:
    $ref: 'schemas/terminal-bookings.yaml#/TriggerTerminalImportResponse'
  RawTerminalBookingInput:
    $ref: 'schemas/terminal-bookings.yaml#/RawTerminalBookingInput'
```

#### `api/schemas/schedules.yaml`

Update all four task_type enums (in `ScheduleTask`, `TaskCatalogEntry`, `CreateScheduleTaskRequest`, `UpdateScheduleTaskRequest`) to include the two new types:

```yaml
# Change every occurrence of:
enum: [calculate_days, calculate_months, backup_database, send_notifications, export_data, alive_check]
# To:
enum: [calculate_days, calculate_months, backup_database, send_notifications, export_data, alive_check, terminal_sync, terminal_import]
```

### Verification
```bash
make swagger-bundle
# Check that api/openapi.bundled.yaml was generated without errors
```

---

## Phase 4: Generated Models

### Action

```bash
make generate
```

This generates Go models in `apps/api/gen/models/` from the bundled OpenAPI spec. Expected new files:
- `apps/api/gen/models/raw_terminal_booking.go`
- `apps/api/gen/models/raw_terminal_booking_list.go`
- `apps/api/gen/models/import_batch.go`
- `apps/api/gen/models/import_batch_list.go`
- `apps/api/gen/models/trigger_terminal_import_request.go`
- `apps/api/gen/models/trigger_terminal_import_response.go`
- `apps/api/gen/models/raw_terminal_booking_input.go`

### Verification
```bash
cd /home/tolga/projects/terp/apps/api && go build ./gen/models/...
```

---

## Phase 5: Repository Layer

### Files to Create

#### `apps/api/internal/repository/terminal.go`

```go
package repository

import (
    "context"
    "errors"
    "time"

    "github.com/google/uuid"
    "gorm.io/gorm"

    "github.com/tolga/terp/internal/model"
)

var (
    ErrImportBatchNotFound      = errors.New("import batch not found")
    ErrRawTerminalBookingNotFound = errors.New("raw terminal booking not found")
)

// --- Import Batch Repository ---

type ImportBatchRepository struct {
    db *DB
}

func NewImportBatchRepository(db *DB) *ImportBatchRepository {
    return &ImportBatchRepository{db: db}
}

type ImportBatchFilter struct {
    TenantID   uuid.UUID
    Status     *model.ImportBatchStatus
    TerminalID *string
    Limit      int
    Offset     int
}

func (r *ImportBatchRepository) Create(ctx context.Context, batch *model.ImportBatch) error {
    return r.db.GORM.WithContext(ctx).Create(batch).Error
}

func (r *ImportBatchRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.ImportBatch, error) {
    var batch model.ImportBatch
    err := r.db.GORM.WithContext(ctx).Where("id = ?", id).First(&batch).Error
    if err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return nil, ErrImportBatchNotFound
        }
        return nil, err
    }
    return &batch, nil
}

func (r *ImportBatchRepository) GetByReference(ctx context.Context, tenantID uuid.UUID, reference string) (*model.ImportBatch, error) {
    var batch model.ImportBatch
    err := r.db.GORM.WithContext(ctx).
        Where("tenant_id = ? AND batch_reference = ?", tenantID, reference).
        First(&batch).Error
    if err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return nil, ErrImportBatchNotFound
        }
        return nil, err
    }
    return &batch, nil
}

func (r *ImportBatchRepository) Update(ctx context.Context, batch *model.ImportBatch) error {
    return r.db.GORM.WithContext(ctx).Save(batch).Error
}

func (r *ImportBatchRepository) List(ctx context.Context, filter ImportBatchFilter) ([]model.ImportBatch, int64, error) {
    query := r.db.GORM.WithContext(ctx).Model(&model.ImportBatch{}).
        Where("tenant_id = ?", filter.TenantID)

    if filter.Status != nil {
        query = query.Where("status = ?", *filter.Status)
    }
    if filter.TerminalID != nil {
        query = query.Where("terminal_id = ?", *filter.TerminalID)
    }

    var total int64
    if err := query.Count(&total).Error; err != nil {
        return nil, 0, err
    }

    var batches []model.ImportBatch
    if filter.Limit > 0 {
        query = query.Limit(filter.Limit)
    }
    if filter.Offset > 0 {
        query = query.Offset(filter.Offset)
    }
    err := query.Order("created_at DESC").Find(&batches).Error
    return batches, total, err
}

// --- Raw Terminal Booking Repository ---

type RawTerminalBookingRepository struct {
    db *DB
}

func NewRawTerminalBookingRepository(db *DB) *RawTerminalBookingRepository {
    return &RawTerminalBookingRepository{db: db}
}

type RawTerminalBookingFilter struct {
    TenantID      uuid.UUID
    From          *time.Time
    To            *time.Time
    TerminalID    *string
    EmployeeID    *uuid.UUID
    ImportBatchID *uuid.UUID
    Status        *model.RawBookingStatus
    Limit         int
    Offset        int
}

func (r *RawTerminalBookingRepository) Create(ctx context.Context, booking *model.RawTerminalBooking) error {
    return r.db.GORM.WithContext(ctx).Create(booking).Error
}

func (r *RawTerminalBookingRepository) CreateBatch(ctx context.Context, bookings []model.RawTerminalBooking) error {
    if len(bookings) == 0 {
        return nil
    }
    return r.db.GORM.WithContext(ctx).Create(&bookings).Error
}

func (r *RawTerminalBookingRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.RawTerminalBooking, error) {
    var booking model.RawTerminalBooking
    err := r.db.GORM.WithContext(ctx).
        Preload("Employee").
        Preload("BookingType").
        Where("id = ?", id).First(&booking).Error
    if err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return nil, ErrRawTerminalBookingNotFound
        }
        return nil, err
    }
    return &booking, nil
}

func (r *RawTerminalBookingRepository) Update(ctx context.Context, booking *model.RawTerminalBooking) error {
    return r.db.GORM.WithContext(ctx).Save(booking).Error
}

func (r *RawTerminalBookingRepository) List(ctx context.Context, filter RawTerminalBookingFilter) ([]model.RawTerminalBooking, int64, error) {
    query := r.db.GORM.WithContext(ctx).Model(&model.RawTerminalBooking{}).
        Where("tenant_id = ?", filter.TenantID)

    if filter.From != nil {
        query = query.Where("booking_date >= ?", *filter.From)
    }
    if filter.To != nil {
        query = query.Where("booking_date <= ?", *filter.To)
    }
    if filter.TerminalID != nil {
        query = query.Where("terminal_id = ?", *filter.TerminalID)
    }
    if filter.EmployeeID != nil {
        query = query.Where("employee_id = ?", *filter.EmployeeID)
    }
    if filter.ImportBatchID != nil {
        query = query.Where("import_batch_id = ?", *filter.ImportBatchID)
    }
    if filter.Status != nil {
        query = query.Where("status = ?", *filter.Status)
    }

    var total int64
    if err := query.Count(&total).Error; err != nil {
        return nil, 0, err
    }

    var bookings []model.RawTerminalBooking
    listQuery := r.db.GORM.WithContext(ctx).
        Where("tenant_id = ?", filter.TenantID).
        Preload("Employee").
        Preload("BookingType")

    // Apply same filters to list query
    if filter.From != nil {
        listQuery = listQuery.Where("booking_date >= ?", *filter.From)
    }
    if filter.To != nil {
        listQuery = listQuery.Where("booking_date <= ?", *filter.To)
    }
    if filter.TerminalID != nil {
        listQuery = listQuery.Where("terminal_id = ?", *filter.TerminalID)
    }
    if filter.EmployeeID != nil {
        listQuery = listQuery.Where("employee_id = ?", *filter.EmployeeID)
    }
    if filter.ImportBatchID != nil {
        listQuery = listQuery.Where("import_batch_id = ?", *filter.ImportBatchID)
    }
    if filter.Status != nil {
        listQuery = listQuery.Where("status = ?", *filter.Status)
    }

    if filter.Limit > 0 {
        listQuery = listQuery.Limit(filter.Limit)
    }
    if filter.Offset > 0 {
        listQuery = listQuery.Offset(filter.Offset)
    }

    err := listQuery.Order("raw_timestamp DESC").Find(&bookings).Error
    return bookings, total, err
}

func (r *RawTerminalBookingRepository) CountByBatch(ctx context.Context, batchID uuid.UUID) (total, processed, failed int64, err error) {
    var results []struct {
        Status model.RawBookingStatus
        Count  int64
    }
    err = r.db.GORM.WithContext(ctx).
        Model(&model.RawTerminalBooking{}).
        Select("status, count(*) as count").
        Where("import_batch_id = ?", batchID).
        Group("status").
        Scan(&results).Error
    if err != nil {
        return 0, 0, 0, err
    }

    for _, r := range results {
        total += r.Count
        switch r.Status {
        case model.RawBookingStatusProcessed:
            processed += r.Count
        case model.RawBookingStatusFailed:
            failed += r.Count
        }
    }
    return total, processed, failed, nil
}
```

### Patterns Followed
- Matches `apps/api/internal/repository/booking.go` exactly:
  - Constructor pattern: `NewXxxRepository(db *DB) *XxxRepository`
  - `db *DB` field
  - `context.Context` as first parameter on all methods
  - Filter struct with pagination (Limit, Offset)
  - Error variables at package level
  - GORM query builder pattern
  - Preload for relations
  - Count + Find pattern for paginated lists

### Verification
```bash
cd /home/tolga/projects/terp/apps/api && go build ./internal/repository/...
```

---

## Phase 6: Service Layer

### Files to Create

#### `apps/api/internal/service/terminal.go`

```go
package service

import (
    "context"
    "errors"
    "fmt"
    "strings"
    "time"

    "github.com/google/uuid"
    "github.com/rs/zerolog/log"

    "github.com/tolga/terp/internal/model"
    "github.com/tolga/terp/internal/repository"
)

var (
    ErrBatchReferenceRequired = errors.New("batch_reference is required")
    ErrTerminalIDRequired     = errors.New("terminal_id is required")
    ErrNoBookingsProvided     = errors.New("at least one booking is required")
    ErrImportBatchNotFound    = errors.New("import batch not found")
)

// --- Interfaces ---

type importBatchRepoForService interface {
    Create(ctx context.Context, batch *model.ImportBatch) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.ImportBatch, error)
    GetByReference(ctx context.Context, tenantID uuid.UUID, reference string) (*model.ImportBatch, error)
    Update(ctx context.Context, batch *model.ImportBatch) error
    List(ctx context.Context, filter repository.ImportBatchFilter) ([]model.ImportBatch, int64, error)
}

type rawTerminalBookingRepoForService interface {
    Create(ctx context.Context, booking *model.RawTerminalBooking) error
    CreateBatch(ctx context.Context, bookings []model.RawTerminalBooking) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.RawTerminalBooking, error)
    Update(ctx context.Context, booking *model.RawTerminalBooking) error
    List(ctx context.Context, filter repository.RawTerminalBookingFilter) ([]model.RawTerminalBooking, int64, error)
    CountByBatch(ctx context.Context, batchID uuid.UUID) (total, processed, failed int64, err error)
}

type employeeRepoForTerminal interface {
    GetByPIN(ctx context.Context, tenantID uuid.UUID, pin string) (*model.Employee, error)
}

type bookingTypeRepoForTerminal interface {
    GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.BookingType, error)
}

// --- Service ---

type TerminalService struct {
    batchRepo      importBatchRepoForService
    rawBookingRepo rawTerminalBookingRepoForService
    employeeRepo   employeeRepoForTerminal
    bookingTypeRepo bookingTypeRepoForTerminal
}

func NewTerminalService(
    batchRepo importBatchRepoForService,
    rawBookingRepo rawTerminalBookingRepoForService,
    employeeRepo employeeRepoForTerminal,
    bookingTypeRepo bookingTypeRepoForTerminal,
) *TerminalService {
    return &TerminalService{
        batchRepo:       batchRepo,
        rawBookingRepo:  rawBookingRepo,
        employeeRepo:    employeeRepo,
        bookingTypeRepo: bookingTypeRepo,
    }
}

// --- Import Input ---

type RawBookingInput struct {
    EmployeePIN    string    `json:"employee_pin"`
    RawTimestamp   time.Time `json:"raw_timestamp"`
    RawBookingCode string    `json:"raw_booking_code"`
}

type TriggerImportInput struct {
    TenantID       uuid.UUID
    BatchReference string
    TerminalID     string
    Bookings       []RawBookingInput
}

type TriggerImportResult struct {
    Batch        *model.ImportBatch
    WasDuplicate bool
    Message      string
}

// --- List Raw Bookings ---

type ListRawBookingsFilter struct {
    TenantID      uuid.UUID
    From          *time.Time
    To            *time.Time
    TerminalID    *string
    EmployeeID    *uuid.UUID
    ImportBatchID *uuid.UUID
    Status        *model.RawBookingStatus
    Limit         int
    Offset        int
}

func (s *TerminalService) ListRawBookings(ctx context.Context, filter ListRawBookingsFilter) ([]model.RawTerminalBooking, int64, error) {
    repoFilter := repository.RawTerminalBookingFilter{
        TenantID:      filter.TenantID,
        From:          filter.From,
        To:            filter.To,
        TerminalID:    filter.TerminalID,
        EmployeeID:    filter.EmployeeID,
        ImportBatchID: filter.ImportBatchID,
        Status:        filter.Status,
        Limit:         filter.Limit,
        Offset:        filter.Offset,
    }
    return s.rawBookingRepo.List(ctx, repoFilter)
}

// --- List Import Batches ---

type ListImportBatchesFilter struct {
    TenantID   uuid.UUID
    Status     *model.ImportBatchStatus
    TerminalID *string
    Limit      int
    Offset     int
}

func (s *TerminalService) ListImportBatches(ctx context.Context, filter ListImportBatchesFilter) ([]model.ImportBatch, int64, error) {
    repoFilter := repository.ImportBatchFilter{
        TenantID:   filter.TenantID,
        Status:     filter.Status,
        TerminalID: filter.TerminalID,
        Limit:      filter.Limit,
        Offset:     filter.Offset,
    }
    return s.batchRepo.List(ctx, repoFilter)
}

// --- Get Import Batch ---

func (s *TerminalService) GetImportBatch(ctx context.Context, id uuid.UUID) (*model.ImportBatch, error) {
    batch, err := s.batchRepo.GetByID(ctx, id)
    if err != nil {
        if errors.Is(err, repository.ErrImportBatchNotFound) {
            return nil, ErrImportBatchNotFound
        }
        return nil, err
    }
    return batch, nil
}

// --- Trigger Import (Idempotent) ---

func (s *TerminalService) TriggerImport(ctx context.Context, input TriggerImportInput) (*TriggerImportResult, error) {
    // Validate input
    if strings.TrimSpace(input.BatchReference) == "" {
        return nil, ErrBatchReferenceRequired
    }
    if strings.TrimSpace(input.TerminalID) == "" {
        return nil, ErrTerminalIDRequired
    }
    if len(input.Bookings) == 0 {
        return nil, ErrNoBookingsProvided
    }

    // Idempotency check: look for existing batch with same reference
    existing, err := s.batchRepo.GetByReference(ctx, input.TenantID, input.BatchReference)
    if err == nil && existing != nil {
        // Batch already exists - return it without re-importing
        return &TriggerImportResult{
            Batch:        existing,
            WasDuplicate: true,
            Message:      fmt.Sprintf("Batch '%s' already imported (%d records)", input.BatchReference, existing.RecordsTotal),
        }, nil
    }
    if err != nil && !errors.Is(err, repository.ErrImportBatchNotFound) {
        return nil, fmt.Errorf("checking existing batch: %w", err)
    }

    // Create new import batch
    now := time.Now()
    terminalID := input.TerminalID
    batch := &model.ImportBatch{
        TenantID:       input.TenantID,
        BatchReference: input.BatchReference,
        Source:         "terminal",
        TerminalID:    &terminalID,
        Status:        model.ImportBatchStatusProcessing,
        RecordsTotal:  len(input.Bookings),
        StartedAt:     &now,
    }
    if err := s.batchRepo.Create(ctx, batch); err != nil {
        return nil, fmt.Errorf("creating import batch: %w", err)
    }

    // Process raw bookings
    rawBookings := make([]model.RawTerminalBooking, 0, len(input.Bookings))
    for _, b := range input.Bookings {
        booking := model.RawTerminalBooking{
            TenantID:       input.TenantID,
            ImportBatchID:  batch.ID,
            TerminalID:     input.TerminalID,
            EmployeePIN:    b.EmployeePIN,
            RawTimestamp:   b.RawTimestamp,
            RawBookingCode: b.RawBookingCode,
            BookingDate:    time.Date(b.RawTimestamp.Year(), b.RawTimestamp.Month(), b.RawTimestamp.Day(), 0, 0, 0, 0, b.RawTimestamp.Location()),
            Status:         model.RawBookingStatusPending,
        }

        // Try to resolve employee by PIN
        if s.employeeRepo != nil {
            emp, err := s.employeeRepo.GetByPIN(ctx, input.TenantID, b.EmployeePIN)
            if err == nil && emp != nil {
                booking.EmployeeID = &emp.ID
            } else {
                log.Debug().Str("pin", b.EmployeePIN).Msg("employee not found for PIN")
            }
        }

        // Try to resolve booking type by code
        if s.bookingTypeRepo != nil {
            bt, err := s.bookingTypeRepo.GetByCode(ctx, input.TenantID, b.RawBookingCode)
            if err == nil && bt != nil {
                booking.BookingTypeID = &bt.ID
            }
        }

        rawBookings = append(rawBookings, booking)
    }

    // Batch insert raw bookings
    if err := s.rawBookingRepo.CreateBatch(ctx, rawBookings); err != nil {
        // Mark batch as failed
        batch.Status = model.ImportBatchStatusFailed
        errMsg := err.Error()
        batch.ErrorMessage = &errMsg
        completedAt := time.Now()
        batch.CompletedAt = &completedAt
        _ = s.batchRepo.Update(ctx, batch)
        return nil, fmt.Errorf("inserting raw bookings: %w", err)
    }

    // Mark batch as completed
    batch.Status = model.ImportBatchStatusCompleted
    batch.RecordsImported = len(rawBookings)
    completedAt := time.Now()
    batch.CompletedAt = &completedAt
    if err := s.batchRepo.Update(ctx, batch); err != nil {
        log.Error().Err(err).Str("batch_id", batch.ID.String()).Msg("failed to update batch status")
    }

    return &TriggerImportResult{
        Batch:        batch,
        WasDuplicate: false,
        Message:      fmt.Sprintf("Successfully imported %d records from terminal '%s'", len(rawBookings), input.TerminalID),
    }, nil
}
```

### Patterns Followed
- Matches `apps/api/internal/service/booking.go` exactly:
  - Private interfaces for dependencies
  - `NewXxxService(deps...) *XxxService` constructor
  - Input structs for complex operations
  - Business logic validation before repository calls
  - Sentinel errors at package level
  - Logging with zerolog

### Dependencies Note

The service references `employeeRepo.GetByPIN()` and `bookingTypeRepo.GetByCode()`. These may need to be added to existing repositories if not yet present:

- **Check**: `apps/api/internal/repository/employee.go` for a `GetByPIN` method. If missing, add:
  ```go
  func (r *EmployeeRepository) GetByPIN(ctx context.Context, tenantID uuid.UUID, pin string) (*model.Employee, error) {
      var emp model.Employee
      err := r.db.GORM.WithContext(ctx).Where("tenant_id = ? AND pin = ?", tenantID, pin).First(&emp).Error
      if err != nil {
          if errors.Is(err, gorm.ErrRecordNotFound) {
              return nil, ErrEmployeeNotFound
          }
          return nil, err
      }
      return &emp, nil
  }
  ```

- **Check**: `apps/api/internal/repository/bookingtype.go` for a `GetByCode` method. If missing, add:
  ```go
  func (r *BookingTypeRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.BookingType, error) {
      var bt model.BookingType
      err := r.db.GORM.WithContext(ctx).Where("tenant_id = ? AND code = ?", tenantID, code).First(&bt).Error
      if err != nil {
          if errors.Is(err, gorm.ErrRecordNotFound) {
              return nil, ErrBookingTypeNotFound
          }
          return nil, err
      }
      return &bt, nil
  }
  ```

### Verification
```bash
cd /home/tolga/projects/terp/apps/api && go build ./internal/service/...
```

---

## Phase 7: Handler Layer

### Files to Create

#### `apps/api/internal/handler/terminal.go`

```go
package handler

import (
    "net/http"
    "strconv"
    "time"

    "github.com/go-chi/chi/v5"
    "github.com/google/uuid"

    "github.com/tolga/terp/gen/models"
    "github.com/tolga/terp/internal/middleware"
    "github.com/tolga/terp/internal/model"
    "github.com/tolga/terp/internal/service"
)

type TerminalHandler struct {
    terminalService terminalServiceForHandler
}

type terminalServiceForHandler interface {
    ListRawBookings(ctx context.Context, filter service.ListRawBookingsFilter) ([]model.RawTerminalBooking, int64, error)
    ListImportBatches(ctx context.Context, filter service.ListImportBatchesFilter) ([]model.ImportBatch, int64, error)
    GetImportBatch(ctx context.Context, id uuid.UUID) (*model.ImportBatch, error)
    TriggerImport(ctx context.Context, input service.TriggerImportInput) (*service.TriggerImportResult, error)
}

func NewTerminalHandler(terminalService terminalServiceForHandler) *TerminalHandler {
    return &TerminalHandler{terminalService: terminalService}
}
```

The handler should implement these HTTP methods:

1. **`ListRawBookings`** (`GET /terminal-bookings`):
   - Extract tenant from context via `middleware.TenantFromContext(r.Context())`
   - Parse required query params: `from`, `to` (date format "2006-01-02")
   - Parse optional query params: `terminal_id`, `employee_id`, `status`, `import_batch_id`, `limit`, `page`
   - Call `s.terminalService.ListRawBookings(ctx, filter)`
   - Map `model.RawTerminalBooking` to `models.RawTerminalBooking` (generated)
   - Include `EmployeeSummary` and `BookingTypeSummary` from relations when loaded
   - Respond with `respondJSON(w, http.StatusOK, listResponse)`

2. **`TriggerImport`** (`POST /terminal-bookings/import`):
   - Extract tenant from context
   - Decode request body into `models.TriggerTerminalImportRequest`
   - Call `req.Validate(nil)` for generated model validation
   - Map to `service.TriggerImportInput`
   - Call `s.terminalService.TriggerImport(ctx, input)`
   - If `result.WasDuplicate`, respond with 200 (not 409, since idempotent means success)
   - Map result to `models.TriggerTerminalImportResponse`
   - Respond with `respondJSON(w, http.StatusOK, response)`

3. **`ListImportBatches`** (`GET /import-batches`):
   - Extract tenant from context
   - Parse optional query params: `status`, `terminal_id`, `limit`, `page`
   - Call `s.terminalService.ListImportBatches(ctx, filter)`
   - Map to `models.ImportBatchList`
   - Respond with `respondJSON(w, http.StatusOK, response)`

4. **`GetImportBatch`** (`GET /import-batches/{id}`):
   - Extract tenant from context
   - Parse `id` from URL via `chi.URLParam(r, "id")`
   - Call `s.terminalService.GetImportBatch(ctx, batchID)`
   - Map to `models.ImportBatch`
   - Respond with `respondJSON(w, http.StatusOK, response)`

### Patterns Followed
- Matches `apps/api/internal/handler/booking.go`:
  - Private interface for service dependency
  - `NewXxxHandler(service) *XxxHandler` constructor
  - Request parsing with `json.NewDecoder(r.Body).Decode(&req)` and `req.Validate(nil)`
  - Tenant from context: `middleware.TenantFromContext(r.Context())`
  - URL param: `chi.URLParam(r, "id")`
  - Query params: `r.URL.Query().Get("key")`
  - Response helpers: `respondJSON(w, status, data)`, `respondError(w, status, message)`
  - Uses generated models from `gen/models` for request/response payloads

### Verification
```bash
cd /home/tolga/projects/terp/apps/api && go build ./internal/handler/...
```

---

## Phase 8: Route Registration and Permissions

### Files to Modify

#### `apps/api/internal/permissions/permissions.go`

Add a new terminal permission to `allPermissions`:

```go
{ID: permissionID("terminals.manage"), Resource: "terminals", Action: "manage", Description: "Manage terminal integrations and imports"},
```

#### `apps/api/internal/handler/routes.go`

Add a new route registration function:

```go
// RegisterTerminalRoutes registers terminal booking and import batch routes.
func RegisterTerminalRoutes(r chi.Router, h *TerminalHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("terminals.manage").String()

    r.Route("/terminal-bookings", func(r chi.Router) {
        if authz == nil {
            r.Get("/", h.ListRawBookings)
            r.Post("/import", h.TriggerImport)
            return
        }
        r.With(authz.RequirePermission(permManage)).Get("/", h.ListRawBookings)
        r.With(authz.RequirePermission(permManage)).Post("/import", h.TriggerImport)
    })

    r.Route("/import-batches", func(r chi.Router) {
        if authz == nil {
            r.Get("/", h.ListImportBatches)
            r.Get("/{id}", h.GetImportBatch)
            return
        }
        r.With(authz.RequirePermission(permManage)).Get("/", h.ListImportBatches)
        r.With(authz.RequirePermission(permManage)).Get("/{id}", h.GetImportBatch)
    })
}
```

#### `apps/api/cmd/server/main.go`

Add in the repository initialization section (after existing repos, around line 96):

```go
importBatchRepo := repository.NewImportBatchRepository(db)
rawTerminalBookingRepo := repository.NewRawTerminalBookingRepository(db)
```

Add in the service initialization section (after existing services):

```go
terminalService := service.NewTerminalService(importBatchRepo, rawTerminalBookingRepo, employeeRepo, bookingTypeRepo)
```

Add in the handler initialization section (after existing handlers):

```go
terminalHandler := handler.NewTerminalHandler(terminalService)
```

Add in the tenant-scoped route group (after existing route registrations, before closing `})`):

```go
handler.RegisterTerminalRoutes(r, terminalHandler, authzMiddleware)
```

### Patterns Followed
- Matches route registration pattern from `RegisterScheduleRoutes`, `RegisterEmployeeMessageRoutes`, etc.
- Dual registration pattern: nil authz registers without middleware, else with middleware
- Permission-based access control
- Main.go wiring order: repository -> service -> handler -> route registration

### Verification
```bash
cd /home/tolga/projects/terp/apps/api && go build ./cmd/server/...
```

---

## Phase 9: Scheduler Integration

### Files to Modify

#### `apps/api/internal/model/schedule.go`

Ensure the two new task type constants are present (if not already added in Phase 2):

```go
TaskTypeTerminalSync   TaskType = "terminal_sync"
TaskTypeTerminalImport TaskType = "terminal_import"
```

#### `apps/api/internal/service/scheduler_catalog.go`

Add two new catalog entries to the `GetTaskCatalog()` function:

```go
{
    TaskType:    model.TaskTypeTerminalSync,
    Name:        "Terminal Sync",
    Description: "Synchronizes time, employee accounts, and access data with a terminal device (placeholder - requires vendor protocol).",
    ParameterSchema: map[string]interface{}{
        "type": "object",
        "properties": map[string]interface{}{
            "terminal_id": map[string]interface{}{
                "type":        "string",
                "description": "Terminal device ID to sync with",
            },
        },
    },
},
{
    TaskType:    model.TaskTypeTerminalImport,
    Name:        "Terminal Import",
    Description: "Imports raw bookings from a terminal device. Idempotent per batch reference.",
    ParameterSchema: map[string]interface{}{
        "type": "object",
        "properties": map[string]interface{}{
            "terminal_id": map[string]interface{}{
                "type":        "string",
                "description": "Terminal device ID to import from",
            },
            "batch_reference": map[string]interface{}{
                "type":        "string",
                "description": "Unique batch reference for idempotent import",
            },
        },
    },
},
```

#### `apps/api/cmd/server/main.go`

Register the two new task handlers (after existing handler registrations, around line 315):

```go
schedulerExecutor.RegisterHandler(model.TaskTypeTerminalSync, service.NewPlaceholderTaskHandler("terminal_sync"))
schedulerExecutor.RegisterHandler(model.TaskTypeTerminalImport, service.NewTerminalImportTaskHandler(terminalService))
```

### Files to Create/Add

#### Add to `apps/api/internal/service/scheduler_tasks.go`

Add a new `TerminalImportTaskHandler` at the end of the file:

```go
// --- Terminal Import Task ---

// terminalServiceForScheduler defines the interface for the terminal service.
type terminalServiceForScheduler interface {
    TriggerImport(ctx context.Context, input TriggerImportInput) (*TriggerImportResult, error)
}

// TerminalImportTaskHandler handles the terminal_import task type.
type TerminalImportTaskHandler struct {
    terminalService terminalServiceForScheduler
}

// NewTerminalImportTaskHandler creates a new TerminalImportTaskHandler.
func NewTerminalImportTaskHandler(terminalService terminalServiceForScheduler) *TerminalImportTaskHandler {
    return &TerminalImportTaskHandler{terminalService: terminalService}
}

// Execute runs the terminal import task.
// NOTE: This is a placeholder for future vendor-specific protocol integration.
// Currently logs the execution and returns a placeholder result.
// When vendor protocol docs are available, this will fetch bookings from
// the terminal API and call TriggerImport with the fetched data.
func (h *TerminalImportTaskHandler) Execute(ctx context.Context, tenantID uuid.UUID, params json.RawMessage) (json.RawMessage, error) {
    var config struct {
        TerminalID     string `json:"terminal_id"`
        BatchReference string `json:"batch_reference"`
    }
    if len(params) > 0 {
        _ = json.Unmarshal(params, &config)
    }

    log.Info().
        Str("tenant_id", tenantID.String()).
        Str("terminal_id", config.TerminalID).
        Str("batch_reference", config.BatchReference).
        Msg("executing terminal_import task (pending vendor protocol integration)")

    // Placeholder: when vendor protocol is available, fetch bookings here
    // and call h.terminalService.TriggerImport(ctx, input)
    data, _ := json.Marshal(map[string]interface{}{
        "status":  "placeholder",
        "message": "Terminal import task executed as placeholder. Vendor protocol integration pending.",
        "terminal_id":     config.TerminalID,
        "batch_reference": config.BatchReference,
    })
    return data, nil
}
```

### Patterns Followed
- Matches `CalculateDaysTaskHandler` / `SendNotificationsTaskHandler` pattern:
  - Private interface for dependency
  - `NewXxxTaskHandler(deps) *XxxTaskHandler` constructor
  - `Execute(ctx, tenantID, params)` implements `TaskExecutor` interface
  - JSON parameter parsing from `json.RawMessage`
  - Zerolog structured logging
- Uses `PlaceholderTaskHandler` for `terminal_sync` since no vendor protocol is available

### Verification
```bash
cd /home/tolga/projects/terp/apps/api && go build ./...
```

---

## Phase 10: Tests

### Files to Create

#### `apps/api/internal/service/terminal_test.go`

Test specifications:

```go
package service_test

// Test 1: TestTerminalService_TriggerImport_Success
//   - Setup: Create test tenant, mock repos
//   - Input: Valid TriggerImportInput with batch reference, terminal ID, and 3 bookings
//   - Assert: ImportBatch created with status=completed, RecordsImported=3
//   - Assert: CreateBatch called with 3 RawTerminalBooking records
//   - Assert: Each raw booking has correct TenantID, ImportBatchID, TerminalID, EmployeePIN

// Test 2: TestTerminalService_TriggerImport_Idempotent
//   - Setup: Pre-create an ImportBatch with batch_reference="BATCH-001"
//   - Input: TriggerImportInput with same batch_reference="BATCH-001"
//   - Assert: WasDuplicate=true
//   - Assert: Returns existing batch without creating new records
//   - Assert: CreateBatch is NOT called

// Test 3: TestTerminalService_TriggerImport_EmptyBatchReference
//   - Input: TriggerImportInput with empty BatchReference
//   - Assert: Returns ErrBatchReferenceRequired

// Test 4: TestTerminalService_TriggerImport_EmptyTerminalID
//   - Input: TriggerImportInput with empty TerminalID
//   - Assert: Returns ErrTerminalIDRequired

// Test 5: TestTerminalService_TriggerImport_EmptyBookings
//   - Input: TriggerImportInput with empty Bookings slice
//   - Assert: Returns ErrNoBookingsProvided

// Test 6: TestTerminalService_TriggerImport_BatchInsertFailure
//   - Setup: Mock rawBookingRepo.CreateBatch to return error
//   - Assert: Batch status updated to "failed"
//   - Assert: Error propagated

// Test 7: TestTerminalService_ListRawBookings_WithDateFilter
//   - Setup: Create bookings across multiple dates
//   - Input: ListRawBookingsFilter with From and To
//   - Assert: Only bookings in date range returned

// Test 8: TestTerminalService_ListRawBookings_WithTerminalFilter
//   - Setup: Create bookings from multiple terminals
//   - Input: ListRawBookingsFilter with TerminalID
//   - Assert: Only bookings from specified terminal returned

// Test 9: TestTerminalService_ListImportBatches_Success
//   - Setup: Create multiple import batches
//   - Input: ListImportBatchesFilter with TenantID
//   - Assert: All batches returned

// Test 10: TestTerminalService_GetImportBatch_NotFound
//   - Input: Random UUID
//   - Assert: Returns ErrImportBatchNotFound
```

Implementation approach: The tests should use mock implementations of the repository interfaces (matching the testify mock pattern used in the rest of the codebase). For integration-style tests, use `testutil.SetupTestDB(t)` to get a real database connection.

Key test for idempotency (Test 2):
```go
func TestTerminalService_TriggerImport_Idempotent(t *testing.T) {
    // This is the most critical test - proving batch idempotency.
    // 1. First import: creates batch + raw bookings
    // 2. Second import with same batch_reference: returns existing batch
    // 3. Verify raw booking count is unchanged after second import
}
```

### Verification
```bash
cd /home/tolga/projects/terp/apps/api && go test -v -run TestTerminal ./internal/service/...
```

---

## Summary of All Files

### New Files (to create)

| # | File | Purpose |
|---|------|---------|
| 1 | `db/migrations/000071_create_import_batches.up.sql` | Import batches table |
| 2 | `db/migrations/000071_create_import_batches.down.sql` | Down migration |
| 3 | `db/migrations/000072_create_raw_terminal_bookings.up.sql` | Raw terminal bookings table |
| 4 | `db/migrations/000072_create_raw_terminal_bookings.down.sql` | Down migration |
| 5 | `apps/api/internal/model/terminal.go` | Domain models (ImportBatch, RawTerminalBooking) |
| 6 | `api/schemas/terminal-bookings.yaml` | OpenAPI schemas |
| 7 | `api/paths/terminal-bookings.yaml` | OpenAPI paths |
| 8 | `apps/api/internal/repository/terminal.go` | Data access layer |
| 9 | `apps/api/internal/service/terminal.go` | Business logic |
| 10 | `apps/api/internal/handler/terminal.go` | HTTP handlers |
| 11 | `apps/api/internal/service/terminal_test.go` | Unit tests |

### Existing Files (to modify)

| # | File | Changes |
|---|------|---------|
| 1 | `apps/api/internal/model/schedule.go` | Add `TaskTypeTerminalSync`, `TaskTypeTerminalImport` constants |
| 2 | `api/schemas/schedules.yaml` | Add `terminal_sync`, `terminal_import` to 4 task_type enums |
| 3 | `api/openapi.yaml` | Add Terminal Bookings tag, path refs, definition refs |
| 4 | `apps/api/internal/permissions/permissions.go` | Add `terminals.manage` permission |
| 5 | `apps/api/internal/handler/routes.go` | Add `RegisterTerminalRoutes` function |
| 6 | `apps/api/cmd/server/main.go` | Wire repos, service, handler, routes, scheduler tasks |
| 7 | `apps/api/internal/service/scheduler_catalog.go` | Add 2 new task catalog entries |
| 8 | `apps/api/internal/service/scheduler_tasks.go` | Add `TerminalImportTaskHandler` |
| 9 | `apps/api/internal/repository/employee.go` | Add `GetByPIN` method (if missing) |
| 10 | `apps/api/internal/repository/bookingtype.go` | Add `GetByCode` method (if missing) |

### Generated Files (via `make generate`)

| # | File | Purpose |
|---|------|---------|
| 1 | `apps/api/gen/models/raw_terminal_booking.go` | Generated request/response model |
| 2 | `apps/api/gen/models/raw_terminal_booking_list.go` | Generated list model |
| 3 | `apps/api/gen/models/import_batch.go` | Generated model |
| 4 | `apps/api/gen/models/import_batch_list.go` | Generated list model |
| 5 | `apps/api/gen/models/trigger_terminal_import_request.go` | Generated request model |
| 6 | `apps/api/gen/models/trigger_terminal_import_response.go` | Generated response model |
| 7 | `apps/api/gen/models/raw_terminal_booking_input.go` | Generated input model |

---

## Verification Checklist

After all phases are complete:

1. **Build passes**: `cd apps/api && go build ./...`
2. **Tests pass**: `cd apps/api && go test -v ./internal/service/... -run TestTerminal`
3. **Migrations apply**: `make migrate-up`
4. **Swagger bundles**: `make swagger-bundle`
5. **Models generate**: `make generate`
6. **Full test suite**: `make test`
7. **Lint passes**: `make lint`

### Manual API testing:

```bash
# List raw terminal bookings (should return empty)
curl -H "X-Tenant-ID: <tenant-id>" -H "Authorization: Bearer <token>" \
  "http://localhost:8080/api/v1/terminal-bookings?from=2026-01-01&to=2026-01-31"

# Trigger terminal import
curl -X POST -H "X-Tenant-ID: <tenant-id>" -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"batch_reference":"BATCH-001","terminal_id":"T-100","bookings":[{"employee_pin":"1234","raw_timestamp":"2026-01-30T08:00:00Z","raw_booking_code":"A1"}]}' \
  "http://localhost:8080/api/v1/terminal-bookings/import"

# Re-trigger same batch (should be idempotent)
curl -X POST -H "X-Tenant-ID: <tenant-id>" -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"batch_reference":"BATCH-001","terminal_id":"T-100","bookings":[{"employee_pin":"1234","raw_timestamp":"2026-01-30T08:00:00Z","raw_booking_code":"A1"}]}' \
  "http://localhost:8080/api/v1/terminal-bookings/import"
# Should return was_duplicate=true

# List import batches
curl -H "X-Tenant-ID: <tenant-id>" -H "Authorization: Bearer <token>" \
  "http://localhost:8080/api/v1/import-batches"

# Check scheduler task catalog includes new types
curl -H "X-Tenant-ID: <tenant-id>" -H "Authorization: Bearer <token>" \
  "http://localhost:8080/api/v1/scheduler/task-catalog"
```
