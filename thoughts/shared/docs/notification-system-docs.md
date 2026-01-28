# Notification System - Deep Technical Documentation

Audience: engineers working on backend + frontend who need to extend, debug, or modify notifications.

This is a tutorial-style, end-to-end walkthrough with real code references. All file paths are repo-relative.

Last updated: 2026-01-28

---

## Table of contents

1. Quick mental model
2. Data model and migrations
3. Backend wiring (dependency injection)
4. Repository layer
5. Service layer (business logic + SSE events)
6. HTTP handlers and routes
7. SSE stream hub and stream endpoint
8. Frontend data layer (hooks + cache invalidation)
9. Frontend UI (bell dropdown + page)
10. Example flow: absence approved (real-time UI update)
11. How to add a new notification type
12. How to add a new notification source
13. How to create a new notification (step-by-step recipe)
14. How to send notifications to other services (cross-service patterns)
15. Extension playbook (for any new use case)
16. Pattern: notify all employees/subscribers
17. How to change or remove a notification source
18. Debugging and verification
19. Files and references

---

## 1) Quick mental model

Notifications are **per-tenant, per-user** records stored in Postgres. The backend creates them when business events occur. The frontend fetches them via REST and listens for real-time updates over SSE. When a notification is created, the server pushes a SSE event. The frontend listens to that event and invalidates relevant queries (notifications + affected domains like absences).

Flow summary:

1) Event happens in a domain service (absence approved, daily error, etc)
2) NotificationService creates a record in DB
3) NotificationService publishes SSE event `notification.created`
4) Frontend SSE hook receives event
5) React Query invalidates notification queries (and related domain queries)
6) UI updates (bell dropdown, notifications page, “Your requests” tab, etc)

---

## 2) Data model and migrations

### 2.1 Migration files

- `db/migrations/000035_create_notifications.up.sql`
- `db/migrations/000035_create_notifications.down.sql`

These create two tables:

- `notifications`
- `notification_preferences`

### 2.2 Model definitions

File: `apps/api/internal/model/notification.go`

```go
// NotificationType represents notification categories.
type NotificationType string

const (
    NotificationTypeApprovals NotificationType = "approvals"
    NotificationTypeErrors    NotificationType = "errors"
    NotificationTypeReminders NotificationType = "reminders"
    NotificationTypeSystem    NotificationType = "system"
)

// Notification represents a user notification.
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

// NotificationPreferences represents per-user notification settings.
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

### 2.3 Preference gating

`NotificationPreferences.AllowsType` controls whether a given type is delivered:

```go
func (p *NotificationPreferences) AllowsType(notificationType NotificationType) bool {
    switch notificationType {
    case NotificationTypeApprovals:
        return p.ApprovalsEnabled
    case NotificationTypeErrors:
        return p.ErrorsEnabled
    case NotificationTypeReminders:
        return p.RemindersEnabled
    case NotificationTypeSystem:
        return p.SystemEnabled
    default:
        return true
    }
}
```

---

## 3) Backend wiring (dependency injection)

The notification service and SSE hub are created and injected in `apps/api/cmd/server/main.go`.

```go
notificationRepo := repository.NewNotificationRepository(db)
notificationPreferencesRepo := repository.NewNotificationPreferencesRepository(db)
notificationService := service.NewNotificationService(notificationRepo, notificationPreferencesRepo, userRepo)
notificationStreamHub := service.NewNotificationStreamHub()
notificationService.SetStreamHub(notificationStreamHub)

notificationHandler := handler.NewNotificationHandler(notificationService, notificationStreamHub)

// Wire notification service into producers
absenceService.SetNotificationService(notificationService)
dailyCalcService.SetNotificationService(notificationService)
dailyValueService.SetNotificationService(notificationService)
userService.SetNotificationService(notificationService)
```

Why this matters:

- The NotificationService needs a repository for DB access.
- The NotificationService needs a user repo to target employees or admins.
- The stream hub is required for real-time updates.
- Each domain service gets the NotificationService so it can emit notifications.

---

## 4) Repository layer

File: `apps/api/internal/repository/notification.go`

### 4.1 Listing notifications

```go
query := r.db.GORM.WithContext(ctx).Model(&model.Notification{}).
    Where("tenant_id = ? AND user_id = ?", filter.TenantID, filter.UserID)

if filter.Type != nil {
    query = query.Where("type = ?", *filter.Type)
}
if filter.Unread != nil {
    if *filter.Unread {
        query = query.Where("read_at IS NULL")
    } else {
        query = query.Where("read_at IS NOT NULL")
    }
}
```

### 4.2 Mark read

```go
notification.ReadAt = &readAt
if err := r.db.GORM.WithContext(ctx).Save(&notification).Error; err != nil {
    return nil, fmt.Errorf("failed to update notification: %w", err)
}
```

### 4.3 Unread count

```go
return r.db.GORM.WithContext(ctx).
    Model(&model.Notification{}).
    Where("tenant_id = ? AND user_id = ? AND read_at IS NULL", tenantID, userID).
    Count(&count).Error
```

---

## 5) Service layer (business logic + SSE events)

File: `apps/api/internal/service/notification.go`

### 5.1 Create notification with preference gating

```go
func (s *NotificationService) Create(ctx context.Context, input CreateNotificationInput) (*model.Notification, error) {
    prefs, err := s.getOrCreatePreferences(ctx, input.TenantID, input.UserID)
    if err != nil {
        return nil, err
    }
    if !prefs.AllowsType(input.Type) {
        return nil, nil
    }

    notification := &model.Notification{...}
    if err := s.notificationRepo.Create(ctx, notification); err != nil {
        return nil, err
    }

    s.publishEvent(notification.UserID, "notification.created", notification)
    return notification, nil
}
```

### 5.2 Notify admins for tenant

```go
func (s *NotificationService) CreateForTenantAdmins(ctx context.Context, tenantID uuid.UUID, input CreateNotificationInput) ([]model.Notification, error) {
    users, err := s.userRepo.ListByTenant(ctx, tenantID, false)
    if err != nil {
        return nil, err
    }

    for i := range users {
        if users[i].Role != model.RoleAdmin {
            continue
        }
        _, err := s.Create(ctx, CreateNotificationInput{...})
        if err != nil {
            return nil, err
        }
    }
    return created, nil
}
```

### 5.3 Mark read and publish SSE

```go
notification, err := s.notificationRepo.MarkRead(...)
if err != nil {
    return nil, err
}

s.publishEvent(userID, "notification.read", map[string]any{
    "id":      notification.ID,
    "read_at": notification.ReadAt,
})
```

---

## 6) HTTP handlers and routes

File: `apps/api/internal/handler/notification.go`

### 6.1 List notifications

`GET /notifications`

Filters:
- `type`
- `unread`
- `from` / `to` (RFC3339)
- `limit` / `offset`

Handler validates `type` against known categories before calling service:

```go
if typeStr := r.URL.Query().Get("type"); typeStr != "" {
    notificationType := model.NotificationType(typeStr)
    switch notificationType {
    case model.NotificationTypeApprovals,
        model.NotificationTypeErrors,
        model.NotificationTypeReminders,
        model.NotificationTypeSystem:
        params.Type = &notificationType
    default:
        respondError(w, http.StatusBadRequest, "Invalid notification type")
        return
    }
}
```

### 6.2 SSE stream endpoint

`GET /notifications/stream`

```go
w.Header().Set("Content-Type", "text/event-stream")
w.Header().Set("Cache-Control", "no-cache")

client := h.streamHub.Subscribe(user.ID)
defer h.streamHub.Unsubscribe(user.ID, client)

for {
    select {
    case event := <-client.Events:
        fmt.Fprintf(w, "event: %s\n", event.Event)
        fmt.Fprintf(w, "data: %s\n\n", event.Data)
        flusher.Flush()
    case <-heartbeat.C:
        fmt.Fprint(w, ": ping\n\n")
        flusher.Flush()
    }
}
```

---

## 7) SSE stream hub

File: `apps/api/internal/service/notification_stream.go`

The hub keeps a map of subscribed clients per user.

```go
func (h *NotificationStreamHub) Subscribe(userID uuid.UUID) *NotificationStreamClient {
    client := &NotificationStreamClient{Events: make(chan NotificationStreamEvent, 16)}
    h.clients[userID][client] = struct{}{}
    return client
}

func (h *NotificationStreamHub) Publish(userID uuid.UUID, event NotificationStreamEvent) {
    for client := range h.clients[userID] {
        select {
        case client.Events <- event:
        default:
            // Drop if client is slow
        }
    }
}
```

---

## 8) Frontend data layer

### 8.1 Notification API hooks

File: `apps/web/src/hooks/api/use-notifications.ts`

These hooks are used by the dropdown and notifications page.

### 8.2 SSE hook

File: `apps/web/src/hooks/use-notifications-stream.ts`

This hook connects to the SSE endpoint and invalidates React Query caches.

```ts
const handleEvent = (eventName: string) => {
  if (eventName.startsWith('notification.')) {
    queryClient.invalidateQueries({ queryKey: ['/notifications'] })
  }
  if (eventName === 'notification.created') {
    queryClient.invalidateQueries({ queryKey: ['/absences'] })
    queryClient.invalidateQueries({ queryKey: ['/employees/{id}/absences'] })
  }
}
```

Important:
- The SSE hook is only mounted when the header notification component renders.
- If the header is not mounted (e.g., a layout without the header), real-time updates will not fire.

---

## 9) Frontend UI

### 9.1 Bell dropdown

File: `apps/web/src/components/layout/notifications.tsx`

Main responsibilities:

- Fetch notifications
- Display unread count
- Mark read and mark all read

### 9.2 Notifications page

File: `apps/web/src/app/[locale]/(dashboard)/notifications/page.tsx`

Main responsibilities:

- Paginated list
- Type filters
- Preferences tab

---

## 10) Example flow: absence approved (real-time)

### Step 1 - User creates request (pending)

File: `apps/api/internal/handler/absence.go`

```go
input := service.CreateAbsenceRangeInput{
    TenantID:      tenantID,
    EmployeeID:    employeeID,
    AbsenceTypeID: absenceTypeID,
    FromDate:      time.Time(*req.From),
    ToDate:        time.Time(*req.To),
    Duration:      decimal.NewFromFloat(*req.Duration),
    Status:        model.AbsenceStatusPending,
}
```

### Step 2 - Service notifies admins about pending request

File: `apps/api/internal/service/absence.go`

```go
if input.Status == model.AbsenceStatusPending {
    s.notifyPendingAbsence(ctx, input, absenceType)
}
```

### Step 3 - Admin approves

File: `apps/api/internal/service/absence.go`

```go
if status == model.AbsenceStatusApproved {
    title = "Absence approved"
    message = fmt.Sprintf("%s on %s was approved.", absenceTypeName, dateLabel)
}

_, _ = s.notificationSvc.CreateForEmployee(ctx, absence.TenantID, absence.EmployeeID, CreateNotificationInput{
    Type:    model.NotificationTypeApprovals,
    Title:   title,
    Message: message,
    Link:    &link,
})
```

### Step 4 - Frontend updates in real-time

- SSE event `notification.created` is sent.
- Client invalidates `/notifications` and `/employees/{id}/absences`.
- The user’s “Your requests” tab updates without refresh.

---

## 11) How to add a new notification type

### Step 1 - Add enum

`apps/api/internal/model/notification.go`

```go
const (
    NotificationTypeSecurity NotificationType = "security"
)
```

### Step 2 - Validate type in handler

`apps/api/internal/handler/notification.go` - add it in the `switch` for `type`.

### Step 3 - Add preference (optional)

If you want it configurable:

- Add new boolean column in migration
- Update `NotificationPreferences` model
- Update the preferences API
- Update UI toggles

### Step 4 - Frontend UI

- Add label + icon in dropdown
- Add filter option on notifications page

---

## 12) How to add a new notification source

Example: when a report is generated

1) Identify the service where the event lives.
2) Inject `NotificationService` if not already.
3) Call `Create(...)` or `CreateForEmployee(...)`.

```go
link := "/reports/123"
_, _ = s.notificationSvc.Create(ctx, service.CreateNotificationInput{
    TenantID: tenantID,
    UserID:   userID,
    Type:     model.NotificationTypeSystem,
    Title:    "Report ready",
    Message:  "Your monthly report is ready to view.",
    Link:     &link,
})
```

---

## 13) How to create a new notification (step-by-step recipe)

This is the concrete “what to do, where to do it” checklist for adding any new notification.

### Step A — Decide who receives it

Pick one of the delivery helpers in `NotificationService`:

- `Create(...)` → single user (you already know user ID)
- `CreateForEmployee(...)` → employee-based (maps employee → user)
- `CreateForTenantAdmins(...)` → broadcast to all admins in tenant

### Step B — Identify the event owner

Notifications should be emitted **inside the service that owns the business event**:

- Absence events → `apps/api/internal/service/absence.go`
- Timesheet approval → `apps/api/internal/service/dailyvalue.go`
- Daily calc errors → `apps/api/internal/service/daily_calc.go`
- User profile changes → `apps/api/internal/service/user.go`

### Step C — Add the call in the service

Example: send a reminder when a report is created in some hypothetical `ReportService`:

```go
func (s *ReportService) CreateReport(ctx context.Context, tenantID, userID uuid.UUID, ...) error {
    // ...report creation logic...

    link := fmt.Sprintf("/reports/%s", reportID.String())
    _, _ = s.notificationSvc.Create(ctx, service.CreateNotificationInput{
        TenantID: tenantID,
        UserID:   userID,
        Type:     model.NotificationTypeSystem,
        Title:    "Report ready",
        Message:  "Your report has finished generating.",
        Link:     &link,
    })

    return nil
}
```

### Step D — Ensure NotificationService is injected

If the service doesn’t already have notifications wired, add it like this:

```go
type ReportService struct {
    // ...
    notificationSvc *NotificationService
}

func (s *ReportService) SetNotificationService(notificationSvc *NotificationService) {
    s.notificationSvc = notificationSvc
}
```

Then wire it in `apps/api/cmd/server/main.go` alongside the existing producers:

```go
reportService.SetNotificationService(notificationService)
```

### Step E — Frontend link target

Ensure the `Link` is a valid route in the web app so users can click the notification.

---

## 14) How to send notifications to other services (cross-service patterns)

Some services don’t have direct access to user IDs or tenant IDs. These patterns help bridge that gap.

### Pattern 1 — Employee-based delivery (common)

When you have an `employeeID`, let `NotificationService` resolve the user:

```go
_, _ = s.notificationSvc.CreateForEmployee(ctx, tenantID, employeeID, service.CreateNotificationInput{
    Type:    model.NotificationTypeApprovals,
    Title:   "Absence approved",
    Message: "Your absence request was approved.",
    Link:    &link,
})
```

### Pattern 2 — Admin broadcast (tenant-wide)

Use for reminders and approvals:

```go
_, _ = s.notificationSvc.CreateForTenantAdmins(ctx, tenantID, service.CreateNotificationInput{
    Type:    model.NotificationTypeReminders,
    Title:   "Pending approvals",
    Message: "There are pending approvals waiting.",
    Link:    &link,
})
```

### Pattern 3 — Direct user ID (most explicit)

Use when you already have a specific user ID:

```go
_, _ = s.notificationSvc.Create(ctx, service.CreateNotificationInput{
    TenantID: tenantID,
    UserID:   userID,
    Type:     model.NotificationTypeSystem,
    Title:    "Account updated",
    Message:  "Your account settings were updated.",
    Link:     &link,
})
```

### Pattern 4 — Multi-step cascade (service → service)

If Service A doesn’t know the user, but knows an entity ID:

1) Service A resolves the entity → employee
2) Service A calls `CreateForEmployee`
3) NotificationService resolves employee → user

Keep resolution logic in **domain services**, not in handlers.

---

## 15) Extension playbook (for any new use case)

This section is the “just follow these steps” guide for extending notifications with minimal guesswork.

### Step 1 — Define the use case clearly

Answer these questions before touching code:

- **Audience**: Who should receive it? (single user, employee’s user, all admins, all employees, a subset/group)
- **Trigger**: What business event should create the notification?
- **Type**: Which category should it belong to? (`approvals`, `errors`, `reminders`, `system`)
- **Link**: Where should the user land when they click it?
- **Urgency**: Does it need real-time updates or is a refresh OK?

### Step 2 — Choose the right delivery helper

Use a standard helper from `NotificationService`:

- **Single user** → `Create(...)`
- **Employee user** → `CreateForEmployee(...)`
- **All admins** → `CreateForTenantAdmins(...)`

If you need a different audience, **add a helper** (example below).

### Step 3 — Put the call in the owning service (not the handler)

For example, if the event is “monthly report generated”, add the notification call inside `ReportService.CreateReport(...)`, not inside the HTTP handler.

### Step 4 — Build a good payload

Recommended payload structure:

- **Title**: short, action-focused (e.g., “Report ready”)
- **Message**: specific detail (e.g., “January report generated for Team Alpha”)
- **Link**: direct route to the content (e.g., `/reports/123`)
- **Type**: one of the allowed categories

### Step 5 — Consider preferences

Preferences are auto-checked by `NotificationService.Create(...)`. If your notification is a new type, you must add a preference column + UI toggle. If you use existing types, you get preference gating “for free.”

### Step 6 — Decide on real-time UI updates

If the notification should update other UI views immediately (like “Your requests”), add a cache invalidation in the SSE hook.

`apps/web/src/hooks/use-notifications-stream.ts`:

```ts
if (eventName === 'notification.created') {
  queryClient.invalidateQueries({ queryKey: ['/employees/{id}/absences'] })
}
```

### Step 7 — Confirm UI expectations

- If a new type is added, update icon/labels in dropdown and notifications page.
- If a new preference is added, add a toggle and copy in preferences UI.
- Verify the click target exists and is reachable for that user.

---

## 16) Pattern: notify all employees/subscribers

There is **no built-in “broadcast to all employees” helper** yet. For this use case, add a helper method to `NotificationService` so all callers use the same rules (preferences + SSE publishing).

### Step A — Add a helper in `NotificationService`

```go
// CreateForTenantUsers notifies all active users in a tenant.
func (s *NotificationService) CreateForTenantUsers(
    ctx context.Context,
    tenantID uuid.UUID,
    input CreateNotificationInput,
) ([]model.Notification, error) {
    if s.userRepo == nil {
        return nil, errors.New("user repository not configured")
    }

    users, err := s.userRepo.ListByTenant(ctx, tenantID, false)
    if err != nil {
        return nil, err
    }

    created := make([]model.Notification, 0, len(users))
    for i := range users {
        user := users[i]
        notif, err := s.Create(ctx, CreateNotificationInput{
            TenantID: tenantID,
            UserID:   user.ID,
            Type:     input.Type,
            Title:    input.Title,
            Message:  input.Message,
            Link:     input.Link,
        })
        if err != nil {
            return nil, err
        }
        if notif != nil {
            created = append(created, *notif)
        }
    }

    return created, nil
}
```

### Step B — Use it from the owning service

```go
_, _ = s.notificationSvc.CreateForTenantUsers(ctx, tenantID, service.CreateNotificationInput{
    Type:    model.NotificationTypeSystem,
    Title:   "Month closed",
    Message: "January has been closed successfully.",
    Link:    &link,
})
```

### Step C — Define “subscribers” clearly

If “subscribers” is not “all users,” add a repository query that returns only those users (e.g., a user preference flag, a group membership, or role).

### Performance note

Broadcasting loops through users and creates individual rows. For large tenants, consider:

- bulk insert optimization
- background job queue
- limiting to “active only” users

---

## 17) How to change or remove a notification source

1) Find where `NotificationService` is called in the relevant domain service.
2) Remove or change the call.
3) Verify no UI expectations or tests rely on it.

---

## 18) Debugging and verification

### 18.1 Quick API checks

- `GET /notifications`
- `GET /notifications?unread=true`
- `GET /notification-preferences`
- `GET /notifications/stream` (SSE)

### 18.2 Common failure causes

- Missing migrations (notifications tables missing)
- Missing `X-Tenant-ID` header
- SSE stream not running (header not mounted)
- Preferences disabled

### 18.3 End-to-end manual test (recommended)

1) Log in user + admin in two browsers.
2) User requests absence.
3) Admin approves in approvals page.
4) User sees real-time update in “Your requests”.

---

## 19) Files and references

Backend:

- `db/migrations/000035_create_notifications.up.sql`
- `apps/api/internal/model/notification.go`
- `apps/api/internal/repository/notification.go`
- `apps/api/internal/service/notification.go`
- `apps/api/internal/service/notification_stream.go`
- `apps/api/internal/handler/notification.go`
- `apps/api/internal/service/absence.go`

Frontend:

- `apps/web/src/hooks/api/use-notifications.ts`
- `apps/web/src/hooks/use-notifications-stream.ts`
- `apps/web/src/components/layout/notifications.tsx`
- `apps/web/src/app/[locale]/(dashboard)/notifications/page.tsx`
- `apps/web/src/components/notifications/notification-preferences.tsx`
