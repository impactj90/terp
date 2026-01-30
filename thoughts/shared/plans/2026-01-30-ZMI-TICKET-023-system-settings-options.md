# ZMI-TICKET-023: System Settings Options and Safety Tools Implementation Plan

## Overview

Implement system-wide settings management that controls calculation behavior (rounding relative to plan start), provides cleanup/safety tools for dangerous bulk operations, and configures Server Alive monitoring. This is a cross-cutting concern: the settings service will be consumed by the calculation engine, cleanup handlers, and notification infrastructure.

## Current State Analysis

### What Exists

1. **Tenant Settings JSONB column** (`apps/api/internal/model/tenant.go:24`): A `Settings datatypes.JSON` field exists on the Tenant model, created in migration `000002_create_tenants.up.sql`. It is typed as `jsonb;default:'{}'` but is **never read, written, or validated** by any Go code. Neither `CreateTenantInput` nor `UpdateTenantInput` includes a `Settings` field.

2. **Settings permission** (`apps/api/internal/permissions/permissions.go:63`): The permission `settings.manage` already exists in the permission registry but is not referenced by any route.

3. **Rounding engine TODO** (`apps/api/internal/calculation/rounding.go:3-6`): An explicit `TODO(ZMI-TICKET-023)` documents the need for relative rounding. Current `RoundTime()` anchors at midnight only. The function signature `RoundTime(minutes int, config *RoundingConfig) int` does not accept an anchor point.

4. **Day plan anchor points** (`apps/api/internal/model/dayplan.go`): `ComeFrom *int` and `GoFrom *int` store the planned arrival/departure times in minutes from midnight. These are available in the calculation pipeline at `processBookings()` but are not passed to rounding functions.

5. **Audit logging** (`apps/api/internal/service/auditlog.go`): Full infrastructure with typed actions, JSON change diffs, and metadata. The `SetAuditService()` pattern is used across handlers.

6. **Notification service** (`apps/api/internal/service/notification.go`): Has `CreateForTenantAdmins()` for broadcasting system notifications. The `NotificationTypeSystem` type exists.

7. **Booking delete pattern** (`apps/api/internal/service/booking.go`): Single delete with month-closed check and recalculation trigger. No bulk delete exists.

8. **Employee day plan delete range** (`apps/api/internal/handler/employeedayplan.go`): `POST /employee-day-plans/delete-range` is the closest existing cleanup-style operation.

9. **No proxy or email infrastructure** exists in the codebase.

10. **Latest migration**: `000061_create_payroll_exports.up.sql`. Next is 000062.

### Key Design Decisions

**Decision 1: Dedicated `system_settings` table vs. `tenants.settings` JSONB.**
Use a dedicated `system_settings` table with typed columns. This provides column-level validation, migration control, explicit defaults, and avoids coupling settings to the tenant model. The existing JSONB field remains unused.

**Decision 2: Cleanup operations use bulk SQL via repository transactions.**
For performance and atomicity, cleanup deletes use SQL-level `DELETE ... WHERE` inside transactions, not loops over single-delete methods.

**Decision 3: Server Alive is configuration-only (no background worker).**
No background job infrastructure exists. Server Alive settings are persisted and exposed via API. The actual monitoring will be implemented when a scheduler/cron system is added. We store the configuration now so other systems can read thresholds.

**Decision 4: Proxy settings are deferred.**
No email or outbound HTTP infrastructure exists. Proxy fields are defined in the settings model for schema completeness but are not actively used.

**Decision 5: Program start settings (birthday window, follow-up entries) are stored as configuration.**
These are desktop-client concepts stored as API-accessible settings that the frontend can read.

## Desired End State

After implementation:
1. System settings can be read and updated via `GET /system-settings` and `PUT /system-settings`.
2. The rounding engine supports relative-to-plan-start mode when the setting is enabled.
3. Cleanup operations (delete bookings, delete booking data, re-read bookings, mark/delete orders) are exposed via `POST /system-settings/cleanup/*` endpoints.
4. All cleanup operations are permission-gated with `settings.manage` and audit-logged.
5. Server Alive configuration is persisted via settings and can trigger system notifications.
6. Generated OpenAPI models are used for request/response payloads.

### Verification
- `make test` passes with all new tests
- `make lint` passes
- `make swagger-bundle && make generate` succeeds
- Settings CRUD works via API
- Rounding relative to plan start produces correct results per ZMI reference Section 7.8
- Cleanup operations require `settings.manage` permission
- Cleanup operations create audit log entries

## What We Are NOT Doing

- Background job scheduler for Server Alive monitoring (no cron infrastructure exists)
- Email/proxy outbound HTTP calls (no email infrastructure exists)
- UI implementation for settings screens
- Migration of existing `tenants.settings` JSONB data (field is unused)
- Real-time Server Alive heartbeat checks

## Implementation Approach

Follow the established codebase pattern: migration -> OpenAPI spec -> model generation -> model -> repository -> service -> handler -> route registration -> wiring -> tests. The rounding engine modification is a cross-cutting change that integrates with the existing calculation pipeline.

---

## Phase 1: Database Migration

### Overview
Create the `system_settings` table with typed columns for all settings areas.

### Changes Required

#### 1. Migration: Create system_settings table
**File**: `db/migrations/000062_create_system_settings.up.sql`

```sql
-- =============================================================
-- Create system_settings table
-- ZMI-TICKET-023: System-wide settings per tenant
-- =============================================================
CREATE TABLE system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Options: Rounding
    rounding_relative_to_plan BOOLEAN NOT NULL DEFAULT false,

    -- Options: Error list
    error_list_enabled BOOLEAN NOT NULL DEFAULT true,
    tracked_error_codes TEXT[] DEFAULT '{}',

    -- Options: Auto-fill end bookings for order changes
    auto_fill_order_end_bookings BOOLEAN NOT NULL DEFAULT false,

    -- Program start: Birthday list
    birthday_window_days_before INT NOT NULL DEFAULT 7,
    birthday_window_days_after INT NOT NULL DEFAULT 7,

    -- Program start: Follow-up entries
    follow_up_entries_enabled BOOLEAN NOT NULL DEFAULT false,

    -- Proxy settings (deferred - schema only)
    proxy_host VARCHAR(255),
    proxy_port INT,
    proxy_username VARCHAR(255),
    proxy_password VARCHAR(255),
    proxy_enabled BOOLEAN NOT NULL DEFAULT false,

    -- Server Alive
    server_alive_enabled BOOLEAN NOT NULL DEFAULT false,
    server_alive_expected_completion_time INT,  -- minutes from midnight (e.g. 300 = 05:00)
    server_alive_threshold_minutes INT DEFAULT 30,
    server_alive_notify_admins BOOLEAN NOT NULL DEFAULT true,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One settings row per tenant
    UNIQUE(tenant_id)
);

CREATE INDEX idx_system_settings_tenant ON system_settings(tenant_id);

CREATE TRIGGER update_system_settings_updated_at
    BEFORE UPDATE ON system_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE system_settings IS 'System-wide settings per tenant. One row per tenant.';
COMMENT ON COLUMN system_settings.rounding_relative_to_plan IS 'When true, rounding grid anchors at planned start time instead of midnight (ZMI Section 7.8).';
COMMENT ON COLUMN system_settings.server_alive_expected_completion_time IS 'Expected daily calculation completion time in minutes from midnight.';
COMMENT ON COLUMN system_settings.server_alive_threshold_minutes IS 'Minutes past expected completion before alerting.';
```

**File**: `db/migrations/000062_create_system_settings.down.sql`

```sql
DROP TABLE IF EXISTS system_settings;
```

### Verification
- `make migrate-up` succeeds
- `make migrate-down` followed by `make migrate-up` succeeds (roundtrip)
- `\d system_settings` in psql shows correct columns, types, and constraints

---

## Phase 2: OpenAPI Spec Definitions

### Overview
Define the OpenAPI schemas and paths for system settings CRUD and cleanup operations.

### Changes Required

#### 1. Schema file
**File**: `api/schemas/system-settings.yaml`

Define the following schemas:
- `SystemSettings` - Full response object with all setting fields
- `UpdateSystemSettingsRequest` - Partial update (all fields optional)
- `CleanupDeleteBookingsRequest` - date_from, date_to, employee_ids (optional)
- `CleanupDeleteBookingDataRequest` - date_from, date_to, employee_ids (optional)
- `CleanupReReadBookingsRequest` - date_from, date_to, employee_ids (optional)
- `CleanupMarkDeleteOrdersRequest` - order_ids
- `CleanupResult` - affected_count, operation, timestamp

Key schema details:
```yaml
SystemSettings:
  type: object
  required:
    - id
    - tenant_id
  properties:
    id:
      type: string
      format: uuid
    tenant_id:
      type: string
      format: uuid
    rounding_relative_to_plan:
      type: boolean
      description: "When true, rounding grid anchors at planned start time instead of midnight"
    error_list_enabled:
      type: boolean
    tracked_error_codes:
      type: array
      items:
        type: string
    auto_fill_order_end_bookings:
      type: boolean
    birthday_window_days_before:
      type: integer
      minimum: 0
      maximum: 90
    birthday_window_days_after:
      type: integer
      minimum: 0
      maximum: 90
    follow_up_entries_enabled:
      type: boolean
    proxy_host:
      type: string
      x-nullable: true
    proxy_port:
      type: integer
      x-nullable: true
    proxy_username:
      type: string
      x-nullable: true
    proxy_enabled:
      type: boolean
    server_alive_enabled:
      type: boolean
    server_alive_expected_completion_time:
      type: integer
      x-nullable: true
      description: "Minutes from midnight (e.g. 300 = 05:00)"
    server_alive_threshold_minutes:
      type: integer
      x-nullable: true
    server_alive_notify_admins:
      type: boolean
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time

UpdateSystemSettingsRequest:
  type: object
  properties:
    rounding_relative_to_plan:
      type: boolean
    error_list_enabled:
      type: boolean
    tracked_error_codes:
      type: array
      items:
        type: string
    auto_fill_order_end_bookings:
      type: boolean
    birthday_window_days_before:
      type: integer
      minimum: 0
      maximum: 90
    birthday_window_days_after:
      type: integer
      minimum: 0
      maximum: 90
    follow_up_entries_enabled:
      type: boolean
    proxy_host:
      type: string
      x-nullable: true
    proxy_port:
      type: integer
      x-nullable: true
    proxy_username:
      type: string
      x-nullable: true
    proxy_password:
      type: string
      x-nullable: true
      description: "Write-only. Never returned in responses."
    proxy_enabled:
      type: boolean
    server_alive_enabled:
      type: boolean
    server_alive_expected_completion_time:
      type: integer
      x-nullable: true
    server_alive_threshold_minutes:
      type: integer
      x-nullable: true
    server_alive_notify_admins:
      type: boolean

CleanupDeleteBookingsRequest:
  type: object
  required:
    - date_from
    - date_to
  properties:
    date_from:
      type: string
      format: date
    date_to:
      type: string
      format: date
    employee_ids:
      type: array
      items:
        type: string
        format: uuid
      description: "Optional. If empty, applies to all employees."
    confirm:
      type: boolean
      description: "Must be true to execute. False returns preview count."

CleanupDeleteBookingDataRequest:
  type: object
  required:
    - date_from
    - date_to
  properties:
    date_from:
      type: string
      format: date
    date_to:
      type: string
      format: date
    employee_ids:
      type: array
      items:
        type: string
        format: uuid
    confirm:
      type: boolean

CleanupReReadBookingsRequest:
  type: object
  required:
    - date_from
    - date_to
  properties:
    date_from:
      type: string
      format: date
    date_to:
      type: string
      format: date
    employee_ids:
      type: array
      items:
        type: string
        format: uuid
    confirm:
      type: boolean

CleanupMarkDeleteOrdersRequest:
  type: object
  required:
    - order_ids
  properties:
    order_ids:
      type: array
      items:
        type: string
        format: uuid
      minItems: 1
    confirm:
      type: boolean

CleanupResult:
  type: object
  required:
    - operation
    - affected_count
  properties:
    operation:
      type: string
      enum: [delete_bookings, delete_booking_data, re_read_bookings, mark_delete_orders]
    affected_count:
      type: integer
    preview:
      type: boolean
      description: "True if this is a dry-run preview"
    details:
      type: object
      additionalProperties: true
    performed_at:
      type: string
      format: date-time
```

#### 2. Path file
**File**: `api/paths/system-settings.yaml`

Endpoints:
- `GET /system-settings` - Get current tenant settings (creates default if none exist)
- `PUT /system-settings` - Update settings
- `POST /system-settings/cleanup/delete-bookings` - Delete bookings in date range
- `POST /system-settings/cleanup/delete-booking-data` - Delete bookings + daily values + employee day plans in date range
- `POST /system-settings/cleanup/re-read-bookings` - Re-trigger calculation for date range
- `POST /system-settings/cleanup/mark-delete-orders` - Mark orders as deleted

All endpoints tagged with `System Settings` tag.

#### 3. Register in main spec
**File**: `api/openapi.yaml`

Add tag:
```yaml
- name: System Settings
  description: System-wide settings and cleanup tools
```

Add path references:
```yaml
/system-settings:
  $ref: 'paths/system-settings.yaml#/~1system-settings'
/system-settings/cleanup/delete-bookings:
  $ref: 'paths/system-settings.yaml#/~1system-settings~1cleanup~1delete-bookings'
/system-settings/cleanup/delete-booking-data:
  $ref: 'paths/system-settings.yaml#/~1system-settings~1cleanup~1delete-booking-data'
/system-settings/cleanup/re-read-bookings:
  $ref: 'paths/system-settings.yaml#/~1system-settings~1cleanup~1re-read-bookings'
/system-settings/cleanup/mark-delete-orders:
  $ref: 'paths/system-settings.yaml#/~1system-settings~1cleanup~1mark-delete-orders'
```

### Verification
- `make swagger-bundle` succeeds without errors
- `make generate` produces models in `apps/api/gen/models/`
- Generated models include `SystemSettings`, `UpdateSystemSettingsRequest`, cleanup request/result types
- Swagger UI renders the new endpoints at `/swagger/`

---

## Phase 3: Domain Model

### Overview
Create the Go model for system settings.

### Changes Required

#### 1. System Settings model
**File**: `apps/api/internal/model/systemsettings.go`

```go
package model

import (
    "time"

    "github.com/google/uuid"
    "github.com/lib/pq"
)

type SystemSettings struct {
    ID       uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID uuid.UUID `gorm:"type:uuid;not null;uniqueIndex" json:"tenant_id"`

    // Options: Rounding
    RoundingRelativeToPlan bool `gorm:"default:false" json:"rounding_relative_to_plan"`

    // Options: Error list
    ErrorListEnabled  bool           `gorm:"default:true" json:"error_list_enabled"`
    TrackedErrorCodes pq.StringArray `gorm:"type:text[];default:'{}'" json:"tracked_error_codes"`

    // Options: Order auto-fill
    AutoFillOrderEndBookings bool `gorm:"default:false" json:"auto_fill_order_end_bookings"`

    // Program start: Birthday list
    BirthdayWindowDaysBefore int `gorm:"default:7" json:"birthday_window_days_before"`
    BirthdayWindowDaysAfter  int `gorm:"default:7" json:"birthday_window_days_after"`

    // Program start: Follow-up entries
    FollowUpEntriesEnabled bool `gorm:"default:false" json:"follow_up_entries_enabled"`

    // Proxy settings (deferred)
    ProxyHost     *string `gorm:"type:varchar(255)" json:"proxy_host,omitempty"`
    ProxyPort     *int    `gorm:"type:int" json:"proxy_port,omitempty"`
    ProxyUsername *string `gorm:"type:varchar(255)" json:"proxy_username,omitempty"`
    ProxyPassword *string `gorm:"type:varchar(255)" json:"-"` // Never serialize
    ProxyEnabled  bool    `gorm:"default:false" json:"proxy_enabled"`

    // Server Alive
    ServerAliveEnabled                bool `gorm:"default:false" json:"server_alive_enabled"`
    ServerAliveExpectedCompletionTime *int `gorm:"type:int" json:"server_alive_expected_completion_time,omitempty"`
    ServerAliveThresholdMinutes       *int `gorm:"type:int;default:30" json:"server_alive_threshold_minutes,omitempty"`
    ServerAliveNotifyAdmins           bool `gorm:"default:true" json:"server_alive_notify_admins"`

    CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`
}

func (SystemSettings) TableName() string {
    return "system_settings"
}

// DefaultSettings returns a new SystemSettings with defaults for a given tenant.
func DefaultSettings(tenantID uuid.UUID) *SystemSettings {
    return &SystemSettings{
        TenantID:                 tenantID,
        RoundingRelativeToPlan:   false,
        ErrorListEnabled:         true,
        AutoFillOrderEndBookings: false,
        BirthdayWindowDaysBefore: 7,
        BirthdayWindowDaysAfter:  7,
        FollowUpEntriesEnabled:   false,
        ProxyEnabled:             false,
        ServerAliveEnabled:       false,
        ServerAliveNotifyAdmins:  true,
    }
}
```

#### 2. Add cleanup audit action
**File**: `apps/api/internal/model/auditlog.go`

Add a new action constant:
```go
AuditActionCleanup AuditAction = "cleanup"
```

### Verification
- Code compiles: `cd apps/api && go build ./...`
- Model follows existing patterns (TableName, uuid PKs, timestamp fields)

---

## Phase 4: Repository Layer

### Overview
Create the repository for system settings CRUD and add bulk delete methods to existing repositories.

### Changes Required

#### 1. System Settings repository
**File**: `apps/api/internal/repository/systemsettings.go`

Methods:
- `GetByTenantID(ctx, tenantID) (*model.SystemSettings, error)` - Get settings for tenant
- `Create(ctx, settings *model.SystemSettings) error` - Create settings row
- `Update(ctx, settings *model.SystemSettings) error` - Update settings
- `GetOrCreate(ctx, tenantID) (*model.SystemSettings, error)` - Get existing or create default

Follow `TenantRepository` pattern with GORM.

#### 2. Booking repository additions
**File**: `apps/api/internal/repository/booking.go`

Add methods:
- `DeleteByDateRange(ctx, tenantID, dateFrom, dateTo time.Time, employeeIDs []uuid.UUID) (int64, error)` - Bulk delete bookings
- `CountByDateRange(ctx, tenantID, dateFrom, dateTo time.Time, employeeIDs []uuid.UUID) (int64, error)` - Count for preview

Implementation pattern:
```go
func (r *BookingRepository) DeleteByDateRange(ctx context.Context, tenantID uuid.UUID, dateFrom, dateTo time.Time, employeeIDs []uuid.UUID) (int64, error) {
    query := r.db.GORM.WithContext(ctx).
        Where("tenant_id = ? AND date >= ? AND date <= ?", tenantID, dateFrom, dateTo)
    if len(employeeIDs) > 0 {
        query = query.Where("employee_id IN ?", employeeIDs)
    }
    result := query.Delete(&model.Booking{})
    return result.RowsAffected, result.Error
}
```

#### 3. Daily value repository additions
**File**: `apps/api/internal/repository/dailyvalue.go`

Add methods:
- `DeleteByDateRange(ctx, tenantID, dateFrom, dateTo, employeeIDs) (int64, error)` - Bulk delete daily values
- `CountByDateRange(ctx, tenantID, dateFrom, dateTo, employeeIDs) (int64, error)` - Count for preview

#### 4. Employee day plan repository additions
**File**: `apps/api/internal/repository/employeedayplan.go`

Add method:
- `DeleteByDateRange(ctx, tenantID, dateFrom, dateTo, employeeIDs) (int64, error)` - Bulk delete (if not already present; check existing DeleteRange)

#### 5. Order repository additions
**File**: `apps/api/internal/repository/order.go`

Add method:
- `BulkDelete(ctx, tenantID, orderIDs []uuid.UUID) (int64, error)` - Bulk delete orders by IDs

### Verification
- `cd apps/api && go build ./...` compiles
- Repository methods follow existing patterns (GORM WithContext, error wrapping)
- Bulk operations use SQL-level WHERE clauses, not loops

---

## Phase 5: Service Layer

### Overview
Create the system settings service with business logic for CRUD, cleanup orchestration, and the settings lookup interface for the calculation engine.

### Changes Required

#### 1. System Settings service
**File**: `apps/api/internal/service/systemsettings.go`

```go
type SystemSettingsService struct {
    settingsRepo    *repository.SystemSettingsRepository
    bookingRepo     systemSettingsBookingRepo
    dailyValueRepo  systemSettingsDailyValueRepo
    edpRepo         systemSettingsEDPRepo
    orderRepo       systemSettingsOrderRepo
    recalcService   *RecalcService
}
```

**Settings CRUD methods:**
- `Get(ctx, tenantID) (*model.SystemSettings, error)` - Get or create defaults
- `Update(ctx, tenantID, input UpdateSystemSettingsInput) (*model.SystemSettings, error)` - Partial update with validation

**Cleanup methods:**
- `DeleteBookings(ctx, tenantID, input CleanupDateRangeInput) (*CleanupResult, error)`
- `DeleteBookingData(ctx, tenantID, input CleanupDateRangeInput) (*CleanupResult, error)`
- `ReReadBookings(ctx, tenantID, input CleanupDateRangeInput) (*CleanupResult, error)`
- `MarkDeleteOrders(ctx, tenantID, input CleanupOrdersInput) (*CleanupResult, error)`

**Service input types:**
```go
type UpdateSystemSettingsInput struct {
    RoundingRelativeToPlan   *bool
    ErrorListEnabled         *bool
    TrackedErrorCodes        []string
    AutoFillOrderEndBookings *bool
    BirthdayWindowDaysBefore *int
    BirthdayWindowDaysAfter  *int
    FollowUpEntriesEnabled   *bool
    ProxyHost                *string
    ProxyPort                *int
    ProxyUsername             *string
    ProxyPassword            *string
    ProxyEnabled             *bool
    ServerAliveEnabled                *bool
    ServerAliveExpectedCompletionTime *int
    ServerAliveThresholdMinutes       *int
    ServerAliveNotifyAdmins           *bool
}

type CleanupDateRangeInput struct {
    DateFrom    time.Time
    DateTo      time.Time
    EmployeeIDs []uuid.UUID
    Confirm     bool // false = preview only
}

type CleanupOrdersInput struct {
    OrderIDs []uuid.UUID
    Confirm  bool
}

type CleanupResult struct {
    Operation     string
    AffectedCount int64
    Preview       bool
    Details       map[string]any
}
```

**Validation rules:**
- `BirthdayWindowDaysBefore` and `BirthdayWindowDaysAfter` must be 0-90
- `ServerAliveExpectedCompletionTime` must be 0-1439 (minutes from midnight)
- `ServerAliveThresholdMinutes` must be > 0
- `DateFrom` must not be after `DateTo` in cleanup operations
- `DateTo - DateFrom` must not exceed 366 days (safety limit)

**Cleanup business logic:**
- `DeleteBookings`: Count matching bookings, if `Confirm`, delete and return count. Check no month is closed in range.
- `DeleteBookingData`: Same as above but also delete daily values and employee day plan assignments for the range.
- `ReReadBookings`: For each matching employee/date pair, trigger recalculation via `RecalcService`. Return count of recalculated days.
- `MarkDeleteOrders`: Count matching orders, if `Confirm`, delete and return count.

#### 2. Settings lookup interface for calculation engine
**File**: `apps/api/internal/service/systemsettings.go`

Provide a simple interface the DailyCalcService can use:
```go
// SystemSettingsLookup provides read-only access to system settings.
type SystemSettingsLookup interface {
    IsRoundingRelativeToPlan(ctx context.Context, tenantID uuid.UUID) (bool, error)
}
```

The `SystemSettingsService` satisfies this interface. This is injected into `DailyCalcService` via a `SetSystemSettingsService()` setter (following the existing `SetOrderBookingService()` pattern).

### Verification
- `cd apps/api && go build ./...` compiles
- Service input types have validation
- Cleanup methods support preview (confirm=false) and execution (confirm=true)
- Cleanup methods validate date ranges

---

## Phase 6: Rounding Engine Integration

### Overview
Modify the calculation engine to support rounding relative to plan start time, controlled by the system setting.

### Changes Required

#### 1. Extend RoundingConfig with anchor
**File**: `apps/api/internal/calculation/types.go`

Add field to `RoundingConfig`:
```go
type RoundingConfig struct {
    Type       RoundingType
    Interval   int // Rounding interval in minutes for up/down/nearest modes
    AddValue   int // Fixed value to add/subtract for add/subtract modes
    AnchorTime *int // Optional: anchor point for relative rounding (minutes from midnight)
}
```

#### 2. Update rounding functions
**File**: `apps/api/internal/calculation/rounding.go`

Remove the TODO comment. Modify the internal rounding functions to accept an anchor:

```go
func RoundTime(minutes int, config *RoundingConfig) int {
    if config == nil || config.Type == RoundingNone {
        return minutes
    }

    switch config.Type {
    case RoundingUp:
        if config.Interval <= 0 {
            return minutes
        }
        return roundUp(minutes, config.Interval, config.anchorOffset())
    case RoundingDown:
        if config.Interval <= 0 {
            return minutes
        }
        return roundDown(minutes, config.Interval, config.anchorOffset())
    case RoundingNearest:
        if config.Interval <= 0 {
            return minutes
        }
        return roundNearest(minutes, config.Interval, config.anchorOffset())
    case RoundingAdd:
        // Add/subtract not affected by anchor
        if config.AddValue <= 0 {
            return minutes
        }
        return roundAdd(minutes, config.AddValue)
    case RoundingSubtract:
        if config.AddValue <= 0 {
            return minutes
        }
        return roundSubtract(minutes, config.AddValue)
    default:
        return minutes
    }
}

func (c *RoundingConfig) anchorOffset() int {
    if c.AnchorTime != nil {
        return *c.AnchorTime % c.Interval
    }
    return 0
}

func roundUp(minutes, interval, offset int) int {
    adjusted := minutes - offset
    remainder := adjusted % interval
    if remainder == 0 {
        return minutes
    }
    if remainder < 0 {
        return minutes - remainder
    }
    return minutes + (interval - remainder)
}

func roundDown(minutes, interval, offset int) int {
    adjusted := minutes - offset
    remainder := adjusted % interval
    if remainder < 0 {
        remainder += interval
    }
    return minutes - remainder
}

func roundNearest(minutes, interval, offset int) int {
    adjusted := minutes - offset
    remainder := adjusted % interval
    if remainder < 0 {
        remainder += interval
    }
    if remainder <= interval/2 {
        return roundDown(minutes, interval, offset)
    }
    return roundUp(minutes, interval, offset)
}
```

The key insight from ZMI Section 7.8:
- Absolute (default): grid at 0, 15, 30, 45, 60, ... -- 8:11 rounds to 8:15 (next 15-min mark)
- Relative to plan start 8:10: grid at 490, 505, 520, 535, ... -- 8:11 (=491) rounds to 505 (=8:25)

The offset is `anchorTime % interval`. For plan start 8:10 (490 min) with 15-min interval, offset = 490 % 15 = 10. So the grid lands at 10, 25, 40, 55 past each hour.

#### 3. Wire anchor into processBookings
**File**: `apps/api/internal/calculation/calculator.go`

In `processBookings()`, when setting up the rounding config for come/go, conditionally set the `AnchorTime` field:

The `DayPlanInput` already has `ComeFrom` and `GoFrom`. The calculator needs a flag to know if relative rounding is active. Add a field to `DayPlanInput`:

**File**: `apps/api/internal/calculation/types.go`

Add to `DayPlanInput`:
```go
// RoundRelativeToPlan anchors rounding grid at ComeFrom/GoFrom instead of midnight.
// ZMI: "Abgleich relativ zur Kommt-/Gehtzeit"
RoundRelativeToPlan bool
```

In `processBookings()`, before calling `RoundComeTime` / `RoundGoTime`, if `dayPlan.RoundRelativeToPlan` is true and the corresponding plan anchor (ComeFrom for come, GoFrom for go) is set, copy the rounding config with AnchorTime set:

```go
comeConfig := dayPlan.RoundingCome
if dayPlan.RoundRelativeToPlan && dayPlan.ComeFrom != nil && comeConfig != nil {
    cfg := *comeConfig
    cfg.AnchorTime = dayPlan.ComeFrom
    comeConfig = &cfg
}
calculatedTime = RoundComeTime(calculatedTime, comeConfig)
```

Same pattern for go rounding with `GoFrom`.

#### 4. Wire setting into DailyCalcService
**File**: `apps/api/internal/service/daily_calc.go`

Add a `SystemSettingsLookup` field and setter:
```go
type DailyCalcService struct {
    // ... existing fields
    systemSettingsSvc SystemSettingsLookup
}

func (s *DailyCalcService) SetSystemSettingsService(svc SystemSettingsLookup) {
    s.systemSettingsSvc = svc
}
```

In the `Calculate()` method, before building `DayPlanInput`, look up the setting:
```go
roundRelative := false
if s.systemSettingsSvc != nil {
    roundRelative, _ = s.systemSettingsSvc.IsRoundingRelativeToPlan(ctx, tenantID)
}
// Set on DayPlanInput
dayPlanInput.RoundRelativeToPlan = roundRelative
```

### Verification
- Existing rounding tests still pass (backward compatible: no anchor = offset 0 = midnight behavior)
- New test cases from ticket test pack:
  - Plan start 8:10, 15-min round-up, booking 8:11: relative=true -> 8:25, relative=false -> 8:15
  - Plan start 8:10, 15-min round-up, booking 8:16: relative=true -> 8:25, relative=false -> 8:30
- `cd apps/api && go test ./internal/calculation/...` passes

---

## Phase 7: Handler Layer

### Overview
Create the HTTP handler for system settings endpoints.

### Changes Required

#### 1. System Settings handler
**File**: `apps/api/internal/handler/systemsettings.go`

```go
type SystemSettingsHandler struct {
    settingsService *service.SystemSettingsService
    auditService    *service.AuditLogService
}

func NewSystemSettingsHandler(settingsService *service.SystemSettingsService) *SystemSettingsHandler {
    return &SystemSettingsHandler{settingsService: settingsService}
}

func (h *SystemSettingsHandler) SetAuditService(svc *service.AuditLogService) {
    h.auditService = svc
}
```

**Handler methods:**

- `Get(w, r)` - Parse tenant from context, call service.Get, respond with generated model
- `Update(w, r)` - Parse tenant from context, decode `models.UpdateSystemSettingsRequest`, call service.Update, audit log the change, respond with updated settings
- `CleanupDeleteBookings(w, r)` - Parse tenant, decode `models.CleanupDeleteBookingsRequest`, validate, call service, audit log, respond with `CleanupResult`
- `CleanupDeleteBookingData(w, r)` - Same pattern
- `CleanupReReadBookings(w, r)` - Same pattern
- `CleanupMarkDeleteOrders(w, r)` - Same pattern

**Audit logging pattern for cleanup:**
```go
if h.auditService != nil {
    h.auditService.Log(r.Context(), r, service.LogEntry{
        TenantID:   tenantID,
        Action:     model.AuditActionCleanup,
        EntityType: "system_settings",
        EntityID:   settings.ID,
        EntityName: "cleanup:delete_bookings",
        Metadata: map[string]any{
            "date_from":      input.DateFrom,
            "date_to":        input.DateTo,
            "employee_ids":   input.EmployeeIDs,
            "affected_count": result.AffectedCount,
        },
    })
}
```

#### 2. Route registration
**File**: `apps/api/internal/handler/routes.go`

Add `RegisterSystemSettingsRoutes`:
```go
func RegisterSystemSettingsRoutes(r chi.Router, h *SystemSettingsHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("settings.manage").String()

    r.Route("/system-settings", func(r chi.Router) {
        if authz == nil {
            r.Get("/", h.Get)
            r.Put("/", h.Update)
            r.Post("/cleanup/delete-bookings", h.CleanupDeleteBookings)
            r.Post("/cleanup/delete-booking-data", h.CleanupDeleteBookingData)
            r.Post("/cleanup/re-read-bookings", h.CleanupReReadBookings)
            r.Post("/cleanup/mark-delete-orders", h.CleanupMarkDeleteOrders)
            return
        }

        r.With(authz.RequirePermission(permManage)).Get("/", h.Get)
        r.With(authz.RequirePermission(permManage)).Put("/", h.Update)
        r.With(authz.RequirePermission(permManage)).Post("/cleanup/delete-bookings", h.CleanupDeleteBookings)
        r.With(authz.RequirePermission(permManage)).Post("/cleanup/delete-booking-data", h.CleanupDeleteBookingData)
        r.With(authz.RequirePermission(permManage)).Post("/cleanup/re-read-bookings", h.CleanupReReadBookings)
        r.With(authz.RequirePermission(permManage)).Post("/cleanup/mark-delete-orders", h.CleanupMarkDeleteOrders)
    })
}
```

All cleanup endpoints require `settings.manage` permission. This uses the existing unused permission.

### Verification
- Handler uses generated models from `gen/models/` for request/response payloads
- All routes are gated with `settings.manage` permission
- Cleanup handlers produce audit log entries
- `cd apps/api && go build ./...` compiles

---

## Phase 8: Wiring in main.go

### Overview
Wire the new repository, service, handler, and routes into the server's dependency injection.

### Changes Required

**File**: `apps/api/cmd/server/main.go`

Add after existing repository initialization:
```go
systemSettingsRepo := repository.NewSystemSettingsRepository(db)
```

Add after existing service initialization:
```go
systemSettingsService := service.NewSystemSettingsService(
    systemSettingsRepo, bookingRepo, dailyValueRepo, empDayPlanRepo, orderRepo, recalcService,
)
```

Wire settings into daily calc:
```go
dailyCalcService.SetSystemSettingsService(systemSettingsService)
```

Add handler:
```go
systemSettingsHandler := handler.NewSystemSettingsHandler(systemSettingsService)
systemSettingsHandler.SetAuditService(auditLogService)
```

Register routes in the tenant-scoped group:
```go
handler.RegisterSystemSettingsRoutes(r, systemSettingsHandler, authzMiddleware)
```

### Verification
- Server starts without errors: `make dev`
- `curl localhost:8080/api/v1/system-settings` returns default settings (with auth)
- No import cycles
- Existing routes still work

---

## Phase 9: Tests

### Overview
Comprehensive tests covering unit, service, and handler layers.

### Changes Required

#### 1. Rounding unit tests
**File**: `apps/api/internal/calculation/rounding_test.go`

Add test cases for relative rounding:
```go
func TestRoundTime_RelativeToAnchor(t *testing.T) {
    tests := []struct {
        name     string
        minutes  int
        config   RoundingConfig
        expected int
    }{
        {
            name:    "relative round up - plan 8:10, booking 8:11, 15min interval",
            minutes: 491, // 8:11
            config: RoundingConfig{
                Type:       RoundingUp,
                Interval:   15,
                AnchorTime: intPtr(490), // 8:10
            },
            expected: 505, // 8:25 (grid: 490, 505, 520, ...)
        },
        {
            name:    "relative round up - plan 8:10, booking 8:16, 15min interval",
            minutes: 496, // 8:16
            config: RoundingConfig{
                Type:       RoundingUp,
                Interval:   15,
                AnchorTime: intPtr(490), // 8:10
            },
            expected: 505, // 8:25
        },
        {
            name:    "absolute round up - plan 8:10, booking 8:11, 15min interval",
            minutes: 491, // 8:11
            config: RoundingConfig{
                Type:     RoundingUp,
                Interval: 15,
                // No AnchorTime = absolute (midnight anchor)
            },
            expected: 495, // 8:15 (grid: 480, 495, 510, ...)
        },
        {
            name:    "absolute round up - plan 8:10, booking 8:16, 15min interval",
            minutes: 496, // 8:16
            config: RoundingConfig{
                Type:     RoundingUp,
                Interval: 15,
            },
            expected: 510, // 8:30
        },
        {
            name:    "relative round down - plan 7:05, booking 7:18, 15min interval",
            minutes: 438, // 7:18
            config: RoundingConfig{
                Type:       RoundingDown,
                Interval:   15,
                AnchorTime: intPtr(425), // 7:05
            },
            expected: 425, // 7:05 (grid: 425, 440, 455, ...)  -- 438 rounds down to 425
        },
        {
            name:    "relative round nearest - plan 8:10, booking 8:18, 15min interval",
            minutes: 498, // 8:18
            config: RoundingConfig{
                Type:       RoundingNearest,
                Interval:   15,
                AnchorTime: intPtr(490), // 8:10
            },
            expected: 505, // 8:25 (8:18 is 8 past anchor, > 7.5, rounds up)
        },
        {
            name:    "add/subtract not affected by anchor",
            minutes: 491,
            config: RoundingConfig{
                Type:       RoundingAdd,
                AddValue:   10,
                AnchorTime: intPtr(490),
            },
            expected: 501, // Just adds 10
        },
        {
            name:    "exact on grid point - no change",
            minutes: 505, // 8:25
            config: RoundingConfig{
                Type:       RoundingUp,
                Interval:   15,
                AnchorTime: intPtr(490),
            },
            expected: 505, // Already on grid
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := RoundTime(tt.minutes, &tt.config)
            assert.Equal(t, tt.expected, result)
        })
    }
}
```

#### 2. System Settings service tests
**File**: `apps/api/internal/service/systemsettings_test.go`

Test cases:
- `TestGet_CreatesDefaultOnFirstAccess` - Verify default settings are created
- `TestUpdate_ValidInput` - Partial update correctly applies changes
- `TestUpdate_InvalidBirthdayWindow` - Validation rejects values > 90
- `TestUpdate_InvalidServerAliveTime` - Validation rejects > 1439
- `TestDeleteBookings_Preview` - Confirm=false returns count without deleting
- `TestDeleteBookings_Execute` - Confirm=true deletes and returns count
- `TestDeleteBookings_InvalidDateRange` - From > To rejected
- `TestDeleteBookings_DateRangeTooLarge` - > 366 days rejected
- `TestDeleteBookingData_CascadeDelete` - Bookings + daily values + EDPs deleted
- `TestReReadBookings_TriggersRecalc` - Verify recalculation called
- `TestMarkDeleteOrders_Execute` - Orders deleted by IDs

#### 3. System Settings handler tests
**File**: `apps/api/internal/handler/systemsettings_test.go`

Test cases:
- `TestGetSettings_Success` - GET returns settings JSON
- `TestUpdateSettings_Success` - PUT updates and returns updated
- `TestCleanupDeleteBookings_Forbidden` - Non-admin user gets 403
- `TestCleanupDeleteBookings_Preview` - Confirm=false returns preview
- `TestCleanupDeleteBookings_Execute` - Confirm=true returns result

#### 4. Repository tests
**File**: `apps/api/internal/repository/systemsettings_test.go`

Test cases:
- `TestGetByTenantID_NotFound` - Returns error for missing
- `TestGetOrCreate_CreatesDefault` - Creates on first access
- `TestGetOrCreate_ReturnsExisting` - Returns existing on second access
- `TestUpdate_AllFields` - All fields correctly persisted

**File**: `apps/api/internal/repository/booking_test.go` (additions)

Test cases:
- `TestDeleteByDateRange_AllEmployees` - Deletes all in range
- `TestDeleteByDateRange_SpecificEmployees` - Filters by employee IDs
- `TestCountByDateRange` - Returns correct count

#### 5. Integration test: Rounding behavior changes based on setting
**File**: `apps/api/internal/service/daily_calc_test.go` (additions)

Test case:
- `TestCalculate_RoundingRelativeToPlan` - Create settings with `rounding_relative_to_plan=true`, set up day plan with ComeFrom=490, 15-min round-up, booking at 491. Verify calculated time is 505 (not 495).

### Verification
- `cd apps/api && go test ./internal/calculation/...` -- all rounding tests pass
- `cd apps/api && go test ./internal/service/...` -- all service tests pass
- `cd apps/api && go test ./internal/handler/...` -- all handler tests pass
- `cd apps/api && go test ./internal/repository/...` -- all repository tests pass
- `make test` -- full test suite passes
- `make lint` -- linter passes

---

## Phase 10: Final Verification

### Overview
End-to-end verification of all components.

### Steps

1. **Generate and bundle**: `make swagger-bundle && make generate`
2. **Build**: `cd apps/api && go build ./...`
3. **Test**: `make test`
4. **Lint**: `make lint`
5. **Manual API test**:
   - Start server: `make dev`
   - Authenticate: `GET /api/v1/auth/dev/login?role=admin`
   - Get settings: `GET /api/v1/system-settings` (verify defaults returned)
   - Update settings: `PUT /api/v1/system-settings` with `{"rounding_relative_to_plan": true}`
   - Verify audit log: `GET /api/v1/audit-logs?entity_type=system_settings`
   - Test cleanup preview: `POST /api/v1/system-settings/cleanup/delete-bookings` with `{"date_from": "2026-01-01", "date_to": "2026-01-31", "confirm": false}`
   - Test permission gate: Use non-admin user, verify 403 on cleanup

### Success Criteria
- All settings persist correctly across requests
- Rounding behavior changes when `rounding_relative_to_plan` is toggled
- Cleanup operations require `settings.manage` permission
- Cleanup operations create audit log entries
- Preview mode returns counts without deleting
- Confirm mode deletes and returns affected count
- Server Alive configuration is stored and retrievable
- Generated models are used throughout (no custom request/response structs)
- No regressions in existing tests

---

## File Change Summary

### New Files
| File | Purpose |
|------|---------|
| `db/migrations/000062_create_system_settings.up.sql` | Create system_settings table |
| `db/migrations/000062_create_system_settings.down.sql` | Drop system_settings table |
| `api/schemas/system-settings.yaml` | OpenAPI schemas |
| `api/paths/system-settings.yaml` | OpenAPI path definitions |
| `apps/api/internal/model/systemsettings.go` | Domain model |
| `apps/api/internal/repository/systemsettings.go` | Data access layer |
| `apps/api/internal/repository/systemsettings_test.go` | Repository tests |
| `apps/api/internal/service/systemsettings.go` | Business logic |
| `apps/api/internal/service/systemsettings_test.go` | Service tests |
| `apps/api/internal/handler/systemsettings.go` | HTTP handlers |
| `apps/api/internal/handler/systemsettings_test.go` | Handler tests |

### Modified Files
| File | Change |
|------|--------|
| `api/openapi.yaml` | Add System Settings tag and path references |
| `apps/api/internal/model/auditlog.go` | Add `AuditActionCleanup` constant |
| `apps/api/internal/calculation/types.go` | Add `AnchorTime` to `RoundingConfig`, add `RoundRelativeToPlan` to `DayPlanInput` |
| `apps/api/internal/calculation/rounding.go` | Remove TODO, implement anchor-based rounding |
| `apps/api/internal/calculation/rounding_test.go` | Add relative rounding test cases |
| `apps/api/internal/calculation/calculator.go` | Wire anchor into processBookings when relative mode active |
| `apps/api/internal/repository/booking.go` | Add `DeleteByDateRange`, `CountByDateRange` |
| `apps/api/internal/repository/booking_test.go` | Add bulk delete/count tests |
| `apps/api/internal/repository/dailyvalue.go` | Add `DeleteByDateRange`, `CountByDateRange` |
| `apps/api/internal/repository/employeedayplan.go` | Add `DeleteByDateRange` if not present |
| `apps/api/internal/repository/order.go` | Add `BulkDelete` |
| `apps/api/internal/service/daily_calc.go` | Add `SystemSettingsLookup` field/setter, pass setting to DayPlanInput |
| `apps/api/internal/service/daily_calc_test.go` | Add integration test for relative rounding |
| `apps/api/internal/handler/routes.go` | Add `RegisterSystemSettingsRoutes` |
| `apps/api/cmd/server/main.go` | Wire system settings repo, service, handler, routes |

---

## Dependencies

- ZMI-TICKET-003 (User permissions): Provides `settings.manage` permission and `RequirePermission` middleware -- **already implemented**
- ZMI-TICKET-006 (Daily calculation): Provides the calculation pipeline that consumes the rounding setting -- **already implemented**
- ZMI-TICKET-017 (Order module): Provides Order model and repository for cleanup operations -- **already implemented**
- ZMI-TICKET-011 (Booking ingest): Provides Booking model and repository for cleanup operations -- **already implemented**

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Changing rounding behavior mid-period causes inconsistent data | Cleanup's re-read-bookings operation allows recalculating affected periods |
| Bulk delete accidentally removes important data | Preview mode (confirm=false) shows count before execution; audit logging captures all operations |
| No background worker for Server Alive | Store config only; defer monitoring worker to future infrastructure ticket |
| Proxy password stored in plaintext | Mark as JSON `-` (never serialized); future: encrypt at rest when secrets infrastructure is added |
