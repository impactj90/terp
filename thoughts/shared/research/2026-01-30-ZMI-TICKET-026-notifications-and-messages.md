# Research: ZMI-TICKET-026 - Employee Messages and Notifications

**Date**: 2026-01-30
**Ticket**: ZMI-TICKET-026
**Status**: Proposed

## Summary

This document catalogs the existing codebase patterns and infrastructure relevant to implementing employee messages and notifications per ZMI-TICKET-026. The ticket requires a message system where messages can be created (with sender, recipients, text, timestamps, and status), sent manually or via the scheduler, and tracked for delivery status (pending/sent/failed).

The codebase already has a mature **notification system** (in-app notifications with read tracking, preferences, and SSE streaming) and a **scheduler system** (with a `send_notifications` task type registered as a placeholder). The ticket introduces a **distinct concept**: employee messages with send workflow and delivery status tracking, which differs from the existing user-facing in-app notifications.

---

## Existing Patterns Found

### 1. Notification System (Existing)

The codebase already has a full in-app notification system. This is related but distinct from the "messages" concept in the ticket.

#### Model (`/home/tolga/projects/terp/apps/api/internal/model/notification.go`)

```go
type NotificationType string

const (
    NotificationTypeApprovals NotificationType = "approvals"
    NotificationTypeErrors    NotificationType = "errors"
    NotificationTypeReminders NotificationType = "reminders"
    NotificationTypeSystem    NotificationType = "system"
)

type Notification struct {
    ID        uuid.UUID        `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
    TenantID  uuid.UUID        `gorm:"type:uuid;not null;index"`
    UserID    uuid.UUID        `gorm:"type:uuid;not null;index"`
    Type      NotificationType `gorm:"type:varchar(20);not null"`
    Title     string           `gorm:"type:varchar(255);not null"`
    Message   string           `gorm:"type:text;not null"`
    Link      *string          `gorm:"type:text"`
    ReadAt    *time.Time       `gorm:"type:timestamptz"`
    CreatedAt time.Time        `gorm:"default:now()"`
    UpdatedAt time.Time        `gorm:"default:now()"`
}

type NotificationPreferences struct {
    ID               uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
    TenantID         uuid.UUID `gorm:"type:uuid;not null;index"`
    UserID           uuid.UUID `gorm:"type:uuid;not null;index"`
    ApprovalsEnabled bool      `gorm:"default:true"`
    ErrorsEnabled    bool      `gorm:"default:true"`
    RemindersEnabled bool      `gorm:"default:true"`
    SystemEnabled    bool      `gorm:"default:true"`
    CreatedAt        time.Time `gorm:"default:now()"`
    UpdatedAt        time.Time `gorm:"default:now()"`
}
```

Key differences from ticket requirements:
- Existing notifications target **users** (by `UserID`), not employees directly
- No sender concept - notifications are system-generated
- No send status (pending/sent/failed) - notifications are immediate upon creation
- No multi-recipient model - each notification is a single user record

#### Repository (`/home/tolga/projects/terp/apps/api/internal/repository/notification.go`)

Provides: `Create`, `List` (with filter struct), `MarkRead`, `MarkAllRead`, `CountUnread`. Notification preferences via separate `NotificationPreferencesRepository` with `GetByUser` and `Upsert`.

Filter pattern:
```go
type NotificationListFilter struct {
    TenantID uuid.UUID
    UserID   uuid.UUID
    Type     *model.NotificationType
    Unread   *bool
    From     *time.Time
    To       *time.Time
    Limit    int
    Offset   int
}
```

#### Service (`/home/tolga/projects/terp/apps/api/internal/service/notification.go`)

- Uses interface-based dependency injection for `notificationUserRepository`
- `Create()` checks user preferences before creating notification
- `CreateForTenantAdmins()` creates notifications for all admin users
- `CreateForEmployee()` looks up user by employee ID and creates notification
- `SetStreamHub()` pattern for late-binding the SSE hub
- `publishEvent()` sends real-time SSE events after notification actions

The service is wired into other services via the `SetNotificationService()` pattern:
```go
// In main.go
absenceService.SetNotificationService(notificationService)
dailyCalcService.SetNotificationService(notificationService)
dailyValueService.SetNotificationService(notificationService)
userService.SetNotificationService(notificationService)
```

#### Handler (`/home/tolga/projects/terp/apps/api/internal/handler/notification.go`)

Endpoints: `List`, `MarkRead`, `MarkAllRead`, `GetPreferences`, `UpdatePreferences`, `Stream` (SSE).

Uses generated models from `gen/models` for response payloads. Converts domain models to response models with helper methods (`notificationToResponse`, `preferencesToResponse`).

#### SSE Streaming (`/home/tolga/projects/terp/apps/api/internal/service/notification_stream.go`)

`NotificationStreamHub` manages per-user SSE subscribers with subscribe/unsubscribe/publish pattern. Events are JSON-encoded and sent via `text/event-stream`.

#### Migration (`/home/tolga/projects/terp/db/migrations/000035_create_notifications.up.sql`)

```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notification_preferences (...);

CREATE INDEX idx_notifications_user_read_at ON notifications(user_id, read_at);
CREATE INDEX idx_notifications_user_created_at ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_tenant_user_created_at ON notifications(tenant_id, user_id, created_at DESC);
```

#### OpenAPI

- Schema: `/home/tolga/projects/terp/api/schemas/notifications.yaml`
- Paths: `/home/tolga/projects/terp/api/paths/notifications.yaml`
- Generated models: `/home/tolga/projects/terp/apps/api/gen/models/notification.go`, `notification_list.go`, `notification_preferences.go`

#### Route Registration (`/home/tolga/projects/terp/apps/api/internal/handler/routes.go`)

```go
func RegisterNotificationRoutes(r chi.Router, h *NotificationHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("notifications.manage").String()
    r.Route("/notifications", func(r chi.Router) {
        // with authz nil check pattern and WithPermission pattern
    })
    r.Route("/notification-preferences", func(r chi.Router) { ... })
}
```

Permission used: `notifications.manage` (defined in `/home/tolga/projects/terp/apps/api/internal/permissions/permissions.go`).

---

### 2. Scheduler System (ZMI-TICKET-022)

The scheduler is the second integration point - the ticket requires "Push Notifications" as a scheduler task.

#### Scheduler Architecture

Files:
- `/home/tolga/projects/terp/apps/api/internal/service/scheduler_engine.go` - Background worker with configurable tick interval (30s default)
- `/home/tolga/projects/terp/apps/api/internal/service/scheduler_executor.go` - Orchestrates execution, dispatches to registered task handlers
- `/home/tolga/projects/terp/apps/api/internal/service/scheduler_tasks.go` - Individual task handler implementations
- `/home/tolga/projects/terp/apps/api/internal/service/scheduler_catalog.go` - Task type catalog metadata

#### Task Handler Interface

```go
type TaskExecutor interface {
    Execute(ctx context.Context, tenantID uuid.UUID, params json.RawMessage) (json.RawMessage, error)
}
```

#### Existing `send_notifications` Task Type

The model already defines `TaskTypeSendNotifications`:
```go
// In /home/tolga/projects/terp/apps/api/internal/model/schedule.go
const TaskTypeSendNotifications TaskType = "send_notifications"
```

Currently registered as a placeholder in main.go:
```go
schedulerExecutor.RegisterHandler(model.TaskTypeSendNotifications, service.NewPlaceholderTaskHandler("send_notifications"))
```

The catalog describes it:
```go
{
    TaskType:    model.TaskTypeSendNotifications,
    Name:        "Send Notifications",
    Description: "Sends pending notifications (placeholder - logs execution only).",
    ParameterSchema: map[string]interface{}{
        "type":       "object",
        "properties": map[string]interface{}{},
    },
}
```

#### Task Handler Pattern (Example: CalculateDaysTaskHandler)

```go
type CalculateDaysTaskHandler struct {
    recalcService recalcServiceForScheduler
}

func NewCalculateDaysTaskHandler(recalcService recalcServiceForScheduler) *CalculateDaysTaskHandler {
    return &CalculateDaysTaskHandler{recalcService: recalcService}
}

func (h *CalculateDaysTaskHandler) Execute(ctx context.Context, tenantID uuid.UUID, params json.RawMessage) (json.RawMessage, error) {
    // 1. Parse params from json.RawMessage
    // 2. Execute business logic
    // 3. Return result as json.RawMessage
}
```

#### Handler Registration in main.go

```go
schedulerExecutor.RegisterHandler(model.TaskTypeAliveCheck, service.NewAliveCheckTaskHandler())
schedulerExecutor.RegisterHandler(model.TaskTypeCalculateDays, service.NewCalculateDaysTaskHandler(recalcService))
schedulerExecutor.RegisterHandler(model.TaskTypeSendNotifications, service.NewPlaceholderTaskHandler("send_notifications"))
```

---

### 3. Model Patterns

All models follow this convention:

File: `/home/tolga/projects/terp/apps/api/internal/model/<entity>.go`

```go
type Activity struct {
    ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
    TenantID    uuid.UUID `gorm:"type:uuid;not null;index"`
    // fields...
    IsActive    bool      `gorm:"default:true"`
    CreatedAt   time.Time `gorm:"default:now()"`
    UpdatedAt   time.Time `gorm:"default:now()"`
}

func (Activity) TableName() string { return "activities" }
```

A `BaseModel` exists in `/home/tolga/projects/terp/apps/api/internal/model/base.go` but models do NOT embed it -- they each declare ID/CreatedAt/UpdatedAt inline.

---

### 4. Repository Patterns

File: `/home/tolga/projects/terp/apps/api/internal/repository/<entity>.go`

```go
var ErrActivityNotFound = errors.New("activity not found")

type ActivityRepository struct {
    db *DB
}

func NewActivityRepository(db *DB) *ActivityRepository {
    return &ActivityRepository{db: db}
}

func (r *ActivityRepository) Create(ctx context.Context, a *model.Activity) error {
    return r.db.GORM.WithContext(ctx).Create(a).Error
}

func (r *ActivityRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Activity, error) {
    var a model.Activity
    err := r.db.GORM.WithContext(ctx).First(&a, "id = ?", id).Error
    if errors.Is(err, gorm.ErrRecordNotFound) {
        return nil, ErrActivityNotFound
    }
    // ...
}
```

The `DB` wrapper is at `/home/tolga/projects/terp/apps/api/internal/repository/db.go` and provides `GORM *gorm.DB` and `Pool *pgxpool.Pool` plus `WithTransaction()`.

---

### 5. Service Patterns

File: `/home/tolga/projects/terp/apps/api/internal/service/<entity>.go`

- Defines a private interface for its repository dependency
- Struct holds interface reference, not concrete type
- Constructor takes concrete repo, returns service pointer
- Input/Output structs defined locally
- Error sentinels for business-rule violations
- Late-binding via `Set*Service()` methods for optional cross-service deps

Example interface pattern:
```go
type activityRepository interface {
    Create(ctx context.Context, a *model.Activity) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.Activity, error)
    // ...
}
```

---

### 6. Handler Patterns

File: `/home/tolga/projects/terp/apps/api/internal/handler/<entity>.go`

- Uses `gen/models` for request/response payloads (generated from OpenAPI)
- `json.NewDecoder(r.Body).Decode(&req)` for request parsing
- `req.Validate(nil)` for generated model validation
- `middleware.TenantFromContext()` for tenant ID
- `auth.UserFromContext()` for authenticated user
- `chi.URLParam(r, "id")` for path params
- `respondJSON()` / `respondError()` helper functions from `response.go`
- Domain-to-response mapping helper methods (e.g., `notificationToResponse()`)

---

### 7. Route Registration Pattern

File: `/home/tolga/projects/terp/apps/api/internal/handler/routes.go`

All route registration follows this pattern:
```go
func RegisterXxxRoutes(r chi.Router, h *XxxHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("xxx.manage").String()
    r.Route("/xxx", func(r chi.Router) {
        if authz == nil {
            // Register routes without authorization (for testing)
            return
        }
        // Register routes with authorization middleware
    })
}
```

Routes are wired in `/home/tolga/projects/terp/apps/api/cmd/server/main.go` in the tenant-scoped route group.

---

### 8. Migration Patterns

Files: `/home/tolga/projects/terp/db/migrations/NNNNNN_<name>.up.sql` and `.down.sql`

Latest migration number: **000067** (create_system_settings)

Conventions:
- UUID primary keys with `gen_random_uuid()`
- `tenant_id` FK to tenants table with `ON DELETE CASCADE`
- `TIMESTAMPTZ` for all timestamps
- `update_updated_at_column()` trigger for `updated_at`
- Appropriate indexes
- `COMMENT ON TABLE` for documentation

---

### 9. OpenAPI Spec Patterns

Multi-file spec at `/home/tolga/projects/terp/api/`:
- Root: `openapi.yaml` (Swagger 2.0)
- Schemas: `schemas/<entity>.yaml`
- Paths: `paths/<entity>.yaml`
- Responses: `responses/errors.yaml`

Root spec references schemas via `$ref` in a `definitions:` block and paths via `$ref` in a `paths:` block. Example:
```yaml
paths:
  /notifications:
    $ref: 'paths/notifications.yaml#/~1notifications'
definitions:
  Notification:
    $ref: 'schemas/notifications.yaml#/Notification'
```

Generated models go to `/home/tolga/projects/terp/apps/api/gen/models/` via `make generate`.

---

### 10. User-Employee Relationship

The `User` model has an optional `EmployeeID` FK:
```go
// /home/tolga/projects/terp/apps/api/internal/model/user.go
type User struct {
    EmployeeID *uuid.UUID `gorm:"type:uuid"`
    // ...
}
```

The `UserRepository.GetByEmployeeID()` method maps employee ID to user:
```go
func (r *UserRepository) GetByEmployeeID(ctx context.Context, tenantID, employeeID uuid.UUID) (*model.User, error)
```

The notification service's `CreateForEmployee()` already uses this pattern to send notifications to the user account linked to an employee.

---

### 11. Permission System

File: `/home/tolga/projects/terp/apps/api/internal/permissions/permissions.go`

Existing permission relevant to this feature: `notifications.manage`.

Permissions are deterministic UUIDs derived from string keys using SHA1 namespace. Adding new permissions requires adding entries to the `allPermissions` slice.

---

## Dependencies and Integration Points

### 1. User Management (ZMI-TICKET-003)

- The `UserRepository` provides `ListByTenant()` and `GetByEmployeeID()` which are already used by the notification service
- Messages need sender (user) and recipients (employees) -- the user-employee mapping exists
- The `notificationUserRepository` interface in the notification service already defines the required methods

### 2. Scheduler (ZMI-TICKET-022)

- `model.TaskTypeSendNotifications` already defined as `"send_notifications"`
- Currently using `PlaceholderTaskHandler` -- needs to be replaced with real implementation
- The scheduler catalog entry already exists in `scheduler_catalog.go`
- Task handler registration in `main.go` line 300: `schedulerExecutor.RegisterHandler(model.TaskTypeSendNotifications, service.NewPlaceholderTaskHandler("send_notifications"))`

### 3. Existing Notification System

- The existing notification system handles **in-app notifications** (user-facing read/unread)
- The ticket's "messages" concept is different: messages are **sent to employees** with delivery status tracking
- These could be modeled as a new `employee_messages` table distinct from `notifications`, or as an extension of the existing notification system
- The SSE streaming hub could potentially be reused for real-time message delivery events

### 4. Employee Model

- Employees are identified by UUID with `TenantID` scoping
- `EmployeeRepository.List()` with `EmployeeFilter` provides batch employee lookup (used by scheduler tasks)

### 5. Wiring in main.go

New components need to be initialized in `/home/tolga/projects/terp/apps/api/cmd/server/main.go` following the pattern:
1. Create repository
2. Create service (with repo dependency)
3. Create handler (with service dependency)
4. Register routes in tenant-scoped route group
5. Register scheduler task handler (replacing placeholder)

---

## Gaps and Open Questions

### 1. Message vs. Notification Distinction

The ticket says "Messages/Notifications" but the codebase already has a notification system that serves a different purpose (in-app read/unread notifications). The ticket describes a **message** model with:
- Sender (user)
- Recipients (employees)
- Message text
- Status (pending/sent/failed)

This is conceptually different from the existing `Notification` model which has no sender, no send status, and targets users (not employees). **Question**: Should this be a new `employee_messages` entity or an extension of the existing notification system?

### 2. "Sent" Status Semantics

The ticket defines status values `pending/sent/failed` but does not specify what "sending" means technically. The existing notification system creates in-app notifications directly. If "sending" means push notification delivery (mobile/web push), there is no push notification infrastructure in the codebase. **Question**: Does "sent" mean the message was delivered as an in-app notification to the linked user account, or does it refer to an external push notification mechanism?

### 3. Recipient Model

The ticket says "Recipients (employees)" suggesting multiple recipients per message. **Question**: Is this a many-to-many relationship (one message to many employees with per-recipient status), or should each recipient have their own message record? The existing notification pattern creates individual records per user.

### 4. Personnel Master Integration

The ticket says "Messages can be created in personnel master." This suggests the message creation UI is part of the employee management screens. **Question**: Should there be employee-scoped message endpoints (e.g., `POST /employees/{id}/messages`) in addition to or instead of standalone message endpoints?

### 5. Scheduler Task Parameters

The `send_notifications` task type in the scheduler catalog has an empty parameter schema. **Question**: Should the scheduler task send all pending messages across all tenants, or should it be configurable per tenant/message type?

### 6. No Existing Message-Related Generated Models

Searching the `gen/models` directory shows no `employee_message` or similar models. New OpenAPI schemas will need to be defined, bundled, and generated before implementation.

### 7. Push Notification Infrastructure

The ticket references "12 ZMI Server tasks (Push Notifications)" in manual references. The codebase has SSE streaming for real-time in-app notifications but no push notification service (FCM, APNs, etc.). **Question**: Is push notification delivery in scope, or is the "send" action limited to creating in-app notification records?

### 8. Next Migration Number

The latest migration is `000067_create_system_settings`. New migrations for this feature should start at `000068`.
