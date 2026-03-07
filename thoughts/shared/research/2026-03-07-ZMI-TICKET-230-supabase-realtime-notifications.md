# Research: ZMI-TICKET-230 - Supabase Realtime replaces SSE NotificationStreamHub

**Date:** 2026-03-07
**Ticket:** ZMI-TICKET-230
**Status:** Research complete

---

## 1. Existing SSE NotificationStreamHub Implementation

### Service Layer: `notification_stream.go` (81 lines)

**File:** `/home/tolga/projects/terp/apps/api/internal/service/notification_stream.go`

The `NotificationStreamHub` is a pure Go in-memory pub/sub hub managing SSE subscribers per user:

- **Structs:**
  - `NotificationStreamEvent` -- holds `Event` (string) and `Data` ([]byte)
  - `NotificationStreamClient` -- holds a buffered channel `Events chan NotificationStreamEvent` (buffer size 16)
  - `NotificationStreamHub` -- holds a `sync.RWMutex` and a map `clients map[uuid.UUID]map[*NotificationStreamClient]struct{}`

- **Methods:**
  - `NewNotificationStreamHub()` -- constructor
  - `Subscribe(userID uuid.UUID) *NotificationStreamClient` -- registers a client for a user, creates channel
  - `Unsubscribe(userID uuid.UUID, client *NotificationStreamClient)` -- removes client, closes channel, cleans up empty user entries
  - `Publish(userID uuid.UUID, event NotificationStreamEvent)` -- sends event to all clients for a user; drops events if the client's channel is full (non-blocking send)

### Handler Layer: SSE Stream Endpoint

**File:** `/home/tolga/projects/terp/apps/api/internal/handler/notification.go` (lines 256-307)

The `Stream` method on `NotificationHandler` handles `GET /notifications/stream`:

- Validates tenant and user from context
- Checks if `streamHub` is non-nil
- Asserts `http.Flusher` support on the response writer
- Sets SSE headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`
- Subscribes to the hub, defers unsubscribe
- Runs a select loop:
  - On context done: returns (client disconnect)
  - On event from channel: writes `event:` and `data:` lines, flushes
  - On 10-second heartbeat ticker: writes `: ping\n\n` comment, flushes

### How the Stream Hub Is Wired

**File:** `/home/tolga/projects/terp/apps/api/cmd/server/main.go`

```
Line 132: notificationStreamHub := service.NewNotificationStreamHub()
Line 133: notificationService.SetStreamHub(notificationStreamHub)
Line 298: notificationHandler := handler.NewNotificationHandler(notificationService, notificationStreamHub)
Line 602: handler.RegisterNotificationStreamRoute(r, notificationHandler, authzMiddleware)
```

The `NotificationHandler` holds both the `notificationService` and the `streamHub` directly.

### Route Registration

**File:** `/home/tolga/projects/terp/apps/api/internal/handler/routes.go`

Two separate registration functions:

1. `RegisterNotificationRoutes` (line 617) -- CRUD routes within the Timeout middleware group:
   - `GET /notifications` -> `h.List`
   - `POST /notifications/read-all` -> `h.MarkAllRead`
   - `POST /notifications/{id}/read` -> `h.MarkRead`
   - `GET /notification-preferences` -> `h.GetPreferences`
   - `PUT /notification-preferences` -> `h.UpdatePreferences`
   - All require `notifications.manage` permission

2. `RegisterNotificationStreamRoute` (line 644) -- SSE endpoint in a **separate** route group **without** chi's Timeout middleware (because Timeout buffers the entire response, breaking SSE):
   - `GET /notifications/stream` -> `h.Stream`
   - Requires `notifications.manage` permission
   - Has auth + tenant middleware but no Timeout

The server's `WriteTimeout` is set to `0` (disabled) specifically to support SSE long-lived connections (main.go line 617).

---

## 2. How Notifications Are Created (Broadcast Triggers)

### `NotificationService.publishEvent` (private method)

**File:** `/home/tolga/projects/terp/apps/api/internal/service/notification.go` (lines 316-330)

Called after every notification creation or read-marking. JSON-marshals the payload and calls `streamHub.Publish(userID, event)`. Events published:

| Event Name              | Trigger                          | Payload                          |
|-------------------------|----------------------------------|----------------------------------|
| `notification.created`  | `Create()` after DB insert       | Full `model.Notification` struct |
| `notification.read`     | `MarkRead()` after DB update     | `{id, read_at}`                  |
| `notification.read_all` | `MarkAllRead()` if count > 0     | `{read_at}`                      |

### Services That Create Notifications

Four services call `SetNotificationService` and generate notifications:

1. **AbsenceService** (`absence.go`):
   - `CreateForScopedAdmins` -- "Absence approval required" (type: reminders)
   - `CreateForEmployee` -- absence approved/rejected notifications (type: approvals)

2. **DailyCalcService** (`daily_calc.go`):
   - `CreateForEmployee` -- "Timesheet error" (type: errors)

3. **DailyValueService** (`dailyvalue.go`):
   - `CreateForEmployee` -- "Timesheet approved" (type: approvals)

4. **UserService** (`user.go`):
   - `Create` -- "Profile updated" (type: system)

5. **EmployeeMessageService** (`employee_message.go`) -- wired via scheduler task handler `SendNotificationsTaskHandler`

### Notification Creation Methods

`NotificationService` provides multiple creation methods:
- `Create(ctx, input)` -- single user, checks preferences, publishes SSE event
- `CreateForTenantAdmins(ctx, tenantID, input)` -- all admin users in tenant
- `CreateForScopedAdmins(ctx, tenantID, employeeID, permissionID, input)` -- users with specific permission + data scope
- `CreateForEmployee(ctx, tenantID, employeeID, input)` -- user linked to an employee

All creation methods funnel through `Create()`, which checks user preferences and calls `publishEvent()`.

---

## 3. Notification Model and Schema

### Database Migration

**File:** `/home/tolga/projects/terp/db/migrations/000035_create_notifications.up.sql`

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
```

Indexes:
- `idx_notifications_user_read_at` on `(user_id, read_at)`
- `idx_notifications_user_created_at` on `(user_id, created_at DESC)`
- `idx_notifications_tenant_user_created_at` on `(tenant_id, user_id, created_at DESC)`

Also creates `notification_preferences` table with unique constraint on `(tenant_id, user_id)`.

**Important note:** The ticket references a `recipient_id` column, but the actual column name is `user_id`. Any Supabase Realtime filter must use `user_id`, not `recipient_id`.

### Go Model

**File:** `/home/tolga/projects/terp/apps/api/internal/model/notification.go`

- `Notification` struct with fields: `ID`, `TenantID`, `UserID`, `Type`, `Title`, `Message`, `Link`, `ReadAt`, `CreatedAt`, `UpdatedAt`
- `NotificationType` constants: `approvals`, `errors`, `reminders`, `system`
- `NotificationPreferences` struct with per-type boolean enable flags
- `AllowsType()` method on preferences

### Prisma Schema

**File:** `/home/tolga/projects/terp/apps/web/prisma/schema.prisma` (lines 1814-1862)

Both `Notification` and `NotificationPreference` models are defined, mapping to the same DB tables. Column names use `@map` to convert camelCase to snake_case.

---

## 4. Supabase Configuration

### Config File

**File:** `/home/tolga/projects/terp/supabase/config.toml`

```toml
[realtime]
enabled = false
```

Supabase Realtime is currently **disabled** in the local development config. It must be enabled before this ticket can proceed.

### Supabase Migrations

**Directory:** `/home/tolga/projects/terp/supabase/migrations/`

Five migrations exist, none related to notifications or realtime setup. No existing `REPLICA IDENTITY`, `ALTER PUBLICATION`, or RLS policies exist for the `notifications` table.

### Environment Variables

**File:** `/home/tolga/projects/terp/.env.example` and `/home/tolga/projects/terp/apps/web/.env.example`

Both define:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Supabase Client Libraries

**File:** `/home/tolga/projects/terp/apps/web/package.json`

```
"@supabase/ssr": "^0.9.0"
"@supabase/supabase-js": "^2.98.0"
```

Both libraries are already installed. `@supabase/supabase-js` includes the Realtime client.

### Existing Supabase Client Setup

**Browser client:** `/home/tolga/projects/terp/apps/web/src/lib/supabase/client.ts`
- Uses `createBrowserClient` from `@supabase/ssr`
- Takes `supabaseUrl` and `supabaseAnonKey` from `clientEnv`

**Server client:** `/home/tolga/projects/terp/apps/web/src/lib/supabase/server.ts`
- Uses `createServerClient` from `@supabase/ssr`
- Cookie-based session management

**Admin client:** `/home/tolga/projects/terp/apps/web/src/lib/supabase/admin.ts`
- Uses `createClient` from `@supabase/supabase-js` with service role key
- Bypasses RLS

The browser Supabase client is already used in:
- `AuthProvider` (`/home/tolga/projects/terp/apps/web/src/providers/auth-provider.tsx`) -- creates it with `useMemo`
- Login page
- tRPC provider (for getting session token)

No existing usage of `supabase.channel()` or Realtime subscriptions anywhere in the codebase.

---

## 5. Frontend Notification Implementation

### SSE Stream Hook

**File:** `/home/tolga/projects/terp/apps/web/src/hooks/use-notifications-stream.ts`

This is the hook that will be replaced. It:
- Uses raw `fetch()` against `${clientEnv.apiUrl}/notifications/stream` (Go SSE endpoint)
- Passes `Authorization: Bearer ${token}` and `X-Tenant-ID` headers
- Manually parses SSE text protocol (event/data lines)
- On any `notification.*` event: invalidates `['/notifications']` query key
- On `notification.created` specifically: also invalidates absences queries
- Auto-reconnects after 5 seconds on failure
- Uses `AbortController` for cleanup

### Notifications Bell Component

**File:** `/home/tolga/projects/terp/apps/web/src/components/layout/notifications.tsx`

- Calls `useNotificationsStream({ enabled: isAuthenticated })` for live updates
- Fetches notifications via `useNotifications({ limit: 10, enabled: isAuthenticated })` (tRPC)
- Shows bell icon with unread count badge
- Dropdown with notification list, mark-read, mark-all-read
- Mounted in the Header component

### Header Component

**File:** `/home/tolga/projects/terp/apps/web/src/components/layout/header.tsx`

- Imports and renders `<Notifications />` component in the right-side actions area

### Notifications Page

**File:** `/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/notifications/page.tsx`

- Full page with tabs: "All" and "Preferences"
- Paginated notification list with type/unread filters
- Uses `useNotifications` hook (tRPC, **not** the Go API client)
- Does **not** use the SSE stream hook directly (relies on invalidation from the bell component)

### tRPC Hooks

**File:** `/home/tolga/projects/terp/apps/web/src/hooks/api/use-notifications.ts`

- `useNotifications()` -- queries `notifications.list` via tRPC
- `useMarkNotificationRead()` -- mutates, invalidates list
- `useMarkAllNotificationsRead()` -- mutates, invalidates list
- `useNotificationPreferences()` -- queries `notifications.preferences`
- `useUpdateNotificationPreferences()` -- mutates, invalidates preferences

### tRPC Router

**File:** `/home/tolga/projects/terp/apps/web/src/server/routers/notifications.ts`

The tRPC notifications router already has a comment at line 9: "SSE streaming is deferred to TICKET-230."

Procedures:
- `notifications.list` -- paginated, filtered, returns items/total/unreadCount
- `notifications.markRead` -- marks single notification read
- `notifications.markAllRead` -- marks all unread as read
- `notifications.preferences` -- get-or-create pattern
- `notifications.updatePreferences` -- upsert

All procedures use `tenantProcedure` (auth + tenant required). No additional permission middleware -- notifications are user-scoped. The router queries Prisma directly (not the Go API).

---

## 6. RLS Policies and Supabase Realtime State

### Existing RLS Policies

There are **no** existing RLS policies on the `notifications` table. Grep for `CREATE POLICY`, `ENABLE ROW`, and `row level security` found no matches related to notifications.

### Existing Realtime Configuration

- `supabase/config.toml` has `[realtime] enabled = false`
- No `REPLICA IDENTITY` changes exist for any table
- No `ALTER PUBLICATION supabase_realtime ADD TABLE` statements exist
- No Supabase Realtime channel subscriptions exist in the frontend

### What Needs to Be Set Up

For Supabase Realtime to work with the `notifications` table:
1. Enable realtime in `supabase/config.toml`: `enabled = true`
2. Create a Supabase migration with:
   - `ALTER TABLE notifications REPLICA IDENTITY FULL;`
   - `ALTER PUBLICATION supabase_realtime ADD TABLE notifications;`
   - RLS policy: `ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;`
   - SELECT policy filtering by `auth.uid()` -- note: the app uses its own JWT (not Supabase Auth for this flow), so the RLS approach needs consideration
3. Alternative: Use the service role key (bypasses RLS) if Supabase Auth is not the JWT source for the Go-created notifications

---

## 7. Key Architecture Observations

### Dual Backend Pattern

The project has a Go API backend (Chi/GORM) and a Next.js tRPC backend (Prisma) that share the same PostgreSQL database. Notifications are:
- **Created** by the Go backend (via `NotificationService.Create` and variants)
- **Read** by the tRPC backend (via `notifications.list`, `markRead`, etc.)
- **Streamed** currently via the Go SSE endpoint, consumed by the frontend `use-notifications-stream.ts` hook

### SSE Stream Is Query Invalidation Only

The current SSE stream does NOT push notification data to display directly. It only triggers `queryClient.invalidateQueries()` in the frontend, which causes React Query to refetch from the tRPC endpoints. The Supabase Realtime replacement can follow the same pattern -- listen for INSERT events and invalidate queries.

### Auth Mismatch Consideration

The Go backend creates notifications using its own JWT system. Supabase Realtime with RLS requires Supabase Auth `auth.uid()`. The project uses Supabase Auth for the frontend (visible in `AuthProvider`), so `auth.uid()` should be available. However, the `user_id` column in `notifications` stores Go-backend user UUIDs which are also Supabase Auth UIDs (per the auth migration TICKET-202). This means RLS filtering by `auth.uid() = user_id` should work correctly.

### Server WriteTimeout

The Go server's `WriteTimeout` is set to `0` specifically for SSE. If the SSE endpoint is removed, this could be reconsidered (though it may affect other future streaming needs).

---

## 8. File Inventory

### Files to Be Modified/Replaced

| File | Lines | Role | Action |
|------|-------|------|--------|
| `apps/api/internal/service/notification_stream.go` | 81 | SSE Hub | Can be removed/disabled |
| `apps/api/internal/handler/notification.go` (Stream method) | ~50 lines (256-307) | SSE HTTP handler | Can be removed/disabled |
| `apps/api/internal/handler/routes.go` (RegisterNotificationStreamRoute) | ~10 lines (644-653) | Route registration | Can be removed/disabled |
| `apps/api/cmd/server/main.go` (lines 132-133, 298, 597-603) | ~8 lines | Wiring | Remove hub creation and stream route group |
| `apps/api/internal/service/notification.go` (SetStreamHub, publishEvent) | ~15 lines | SSE publishing | Can be removed/disabled |
| `apps/web/src/hooks/use-notifications-stream.ts` | 110 | Frontend SSE client | Replace with Supabase Realtime |
| `api/paths/notifications.yaml` (/notifications/stream) | ~15 lines (93-107) | OpenAPI spec | Remove stream endpoint |

### Files That Stay Unchanged

| File | Role |
|------|------|
| `apps/api/internal/model/notification.go` | Domain model (no changes) |
| `apps/api/internal/repository/notification.go` | Data access (no changes) |
| `apps/api/internal/service/notification.go` (Create methods) | Business logic -- notification creation stays in Go |
| `apps/web/src/server/routers/notifications.ts` | tRPC router (no changes) |
| `apps/web/src/hooks/api/use-notifications.ts` | tRPC hooks (no changes) |
| `apps/web/src/components/layout/notifications.tsx` | Bell component (minor: import change for stream hook) |
| `apps/web/src/components/notifications/notification-preferences.tsx` | Preferences UI (no changes) |
| `apps/web/src/app/[locale]/(dashboard)/notifications/page.tsx` | Notifications page (no changes) |

### Files to Be Created

| File | Role |
|------|------|
| Supabase migration for realtime + RLS | Enable realtime on notifications table |
| Updated `use-notifications-stream.ts` | Supabase Realtime subscription (replaces SSE) |
| `supabase/config.toml` update | Enable `[realtime] enabled = true` |
