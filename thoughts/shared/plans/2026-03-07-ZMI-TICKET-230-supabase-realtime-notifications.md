# Implementation Plan: ZMI-TICKET-230 -- Supabase Realtime replaces SSE NotificationStreamHub

**Date:** 2026-03-07
**Ticket:** ZMI-TICKET-230
**Status:** Plan ready for implementation

---

## Summary

Replace the Go SSE-based `NotificationStreamHub` with Supabase Realtime Postgres Changes subscriptions. The current SSE stream only serves as a query invalidation trigger -- it does not push notification content to display. The Supabase Realtime replacement follows the same pattern: listen for `INSERT` events on the `notifications` table and invalidate React Query caches.

**Key architectural facts validated:**
- Notifications are created by Go backend, read by tRPC/Prisma backend, streamed currently via Go SSE
- The SSE stream only triggers `queryClient.invalidateQueries()` -- no data is consumed from the stream
- Supabase Auth is used for frontend auth; `auth.uid()` matches `notifications.user_id` (per TICKET-202)
- Supabase Realtime is currently disabled in `supabase/config.toml`
- The `notifications` table column is `user_id` (not `recipient_id` as the ticket template states)
- `@supabase/supabase-js` (v2.98.0) is already installed and includes the Realtime client
- Browser Supabase client already exists at `apps/web/src/lib/supabase/client.ts`

---

## Phase 1: Database Setup (Supabase Migration + Config)

### 1.1 Enable Supabase Realtime in config

**File to modify:** `/home/tolga/projects/terp/supabase/config.toml`

**Change:** Line 38, change `enabled = false` to `enabled = true`:

```toml
[realtime]
enabled = true
```

**Why:** Supabase Realtime service must be running locally for postgres_changes subscriptions to work.

### 1.2 Create Supabase migration for Realtime + RLS

**File to create:** `/home/tolga/projects/terp/supabase/migrations/<timestamp>_enable_realtime_notifications.sql`

Use `supabase migration new enable_realtime_notifications` to generate the timestamp, or manually create a file with the next sequential timestamp following the pattern `YYYYMMDDHHMMSS`.

**Migration content:**

```sql
-- Enable RLS on notifications table
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only SELECT their own notifications
-- This is required for Supabase Realtime to filter events per-user
CREATE POLICY "Users can select own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

-- RLS policy: allow service role (Go backend) full insert access
-- The Go backend uses a direct DB connection (not Supabase client), so
-- RLS does not apply to it. This policy is for completeness if any
-- Supabase client-side operations need INSERT.
CREATE POLICY "Service role can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- Set REPLICA IDENTITY FULL so that Realtime receives complete row data
-- on UPDATE/DELETE events (needed for user_id filtering)
ALTER TABLE notifications REPLICA IDENTITY FULL;

-- Add notifications table to the Supabase Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
```

**Important notes:**
- The Go backend connects directly to Postgres (GORM), so RLS does NOT affect Go's INSERT/UPDATE/DELETE operations. RLS only applies to connections through the Supabase PostgREST/Realtime APIs.
- The `auth.uid()` function returns the JWT subject from the Supabase auth token. Since TICKET-202 unified auth, `auth.uid()` matches the `user_id` column in the `notifications` table.
- `REPLICA IDENTITY FULL` is required so that Supabase Realtime can see all columns (including `user_id`) in change events for filter matching.

### 1.3 Verification Steps (Phase 1)

1. **Automated:** Run `supabase db reset` to verify migration applies cleanly
2. **Manual:** Open Supabase Studio (localhost:54323) and confirm:
   - RLS is enabled on `notifications` table
   - The RLS policy is visible
   - The `supabase_realtime` publication includes `notifications`
3. **Manual:** Verify that existing Go notification creation still works (Go uses direct Postgres connection, unaffected by RLS)

---

## Phase 2: Backend Changes (Remove SSE Infrastructure)

### 2.1 Remove SSE stream hub from notification service

**File to modify:** `/home/tolga/projects/terp/apps/api/internal/service/notification.go`

**Changes:**
1. Remove the `streamHub` field from `NotificationService` struct (line 23)
2. Remove the `SetStreamHub` method (lines 50-53)
3. Remove the `publishEvent` method entirely (lines 316-330)
4. Remove the three `s.publishEvent(...)` calls:
   - Line 127 in `Create()`: remove `s.publishEvent(notification.UserID, "notification.created", notification)`
   - Line 258 in `MarkRead()`: remove `s.publishEvent(userID, "notification.read", ...)` block
   - Line 275 in `MarkAllRead()`: remove `s.publishEvent(userID, "notification.read_all", ...)` block
5. Remove unused imports: `"encoding/json"` (if no longer used after removing publishEvent)

**Rationale:** Supabase Realtime listens to Postgres WAL directly -- no application-level publish is needed. When the Go backend inserts a notification row, Postgres automatically emits a WAL event that Supabase Realtime picks up and broadcasts to subscribed clients.

### 2.2 Delete SSE stream hub file

**File to delete:** `/home/tolga/projects/terp/apps/api/internal/service/notification_stream.go`

This entire 81-line file is no longer needed. It contains `NotificationStreamEvent`, `NotificationStreamClient`, and `NotificationStreamHub` -- all SSE-specific constructs.

### 2.3 Remove Stream handler from notification handler

**File to modify:** `/home/tolga/projects/terp/apps/api/internal/handler/notification.go`

**Changes:**
1. Remove the `streamHub` field from `NotificationHandler` struct (line 25)
2. Update `NewNotificationHandler` constructor to remove the `streamHub` parameter (line 29):
   - Before: `func NewNotificationHandler(notificationService *service.NotificationService, streamHub *service.NotificationStreamHub) *NotificationHandler`
   - After: `func NewNotificationHandler(notificationService *service.NotificationService) *NotificationHandler`
3. Remove the `streamHub: streamHub` assignment in the constructor body (line 32)
4. Remove the entire `Stream` method (lines 255-307)
5. Remove unused imports that were only used by Stream: `"fmt"`, `"time"`, and the `service` package reference to `NotificationStreamHub` (check if `service` is still imported for `NotificationService`)

### 2.4 Remove stream route registration

**File to modify:** `/home/tolga/projects/terp/apps/api/internal/handler/routes.go`

**Changes:**
1. Remove the entire `RegisterNotificationStreamRoute` function (lines 644-653)

### 2.5 Update main.go wiring

**File to modify:** `/home/tolga/projects/terp/apps/api/cmd/server/main.go`

**Changes:**
1. Remove line 132: `notificationStreamHub := service.NewNotificationStreamHub()`
2. Remove line 133: `notificationService.SetStreamHub(notificationStreamHub)`
3. Update line 298: Change `handler.NewNotificationHandler(notificationService, notificationStreamHub)` to `handler.NewNotificationHandler(notificationService)`
4. Remove the SSE stream route group (lines 597-603):
   ```go
   // SSE stream routes -- auth + tenant but NO Timeout middleware
   // (chi's Timeout buffers the entire response, which breaks SSE streaming)
   r.Group(func(r chi.Router) {
       r.Use(middleware.AuthMiddleware(jwtManager))
       r.Use(tenantMiddleware.RequireTenant)
       handler.RegisterNotificationStreamRoute(r, notificationHandler, authzMiddleware)
   })
   ```

**Note on WriteTimeout:** The server's `WriteTimeout: 0` (line 617) was set specifically for SSE. After removing SSE, this could be changed to a reasonable value (e.g., `30 * time.Second`). However, this is a separate concern and should be evaluated independently -- leave it as-is for now with an updated comment noting SSE is removed.

### 2.6 Remove SSE endpoint from OpenAPI spec

**File to modify:** `/home/tolga/projects/terp/api/paths/notifications.yaml`

**Changes:**
Remove the `/notifications/stream` path definition (lines 93-107):
```yaml
/notifications/stream:
  get:
    tags:
      - Notifications
    summary: Stream notifications for the current user
    operationId: streamNotifications
    produces:
      - text/event-stream
    responses:
      200:
        description: Server-sent events stream
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      403:
        $ref: '../responses/errors.yaml#/Forbidden'
```

After removal, run `make swagger-bundle` to regenerate the bundled spec.

### 2.7 Update tRPC notifications router comment

**File to modify:** `/home/tolga/projects/terp/apps/web/src/server/routers/notifications.ts`

**Change:** Update line 9 comment from `SSE streaming is deferred to TICKET-230.` to `Realtime streaming handled by Supabase Realtime (TICKET-230).`

### 2.8 Verification Steps (Phase 2)

1. **Automated:** `cd /home/tolga/projects/terp/apps/api && go build ./...` -- must compile cleanly
2. **Automated:** `cd /home/tolga/projects/terp/apps/api && go vet ./...` -- no errors
3. **Automated:** `cd /home/tolga/projects/terp/apps/api && go test ./internal/service/...` -- existing notification tests must pass (they don't test SSE streaming)
4. **Automated:** `make swagger-bundle` -- regenerate OpenAPI spec without stream endpoint
5. **Manual:** Verify that `GET /notifications/stream` returns 404

---

## Phase 3: Frontend Changes (Supabase Realtime Subscription)

### 3.1 Rewrite `use-notifications-stream.ts` with Supabase Realtime

**File to modify:** `/home/tolga/projects/terp/apps/web/src/hooks/use-notifications-stream.ts`

**Complete rewrite** -- replace the SSE fetch-based implementation with a Supabase Realtime subscription:

```typescript
'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/providers/auth-provider'
import { useTRPC } from '@/trpc'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface UseNotificationsStreamOptions {
  enabled?: boolean
}

/**
 * Hook that subscribes to Supabase Realtime postgres_changes on the
 * notifications table. On INSERT events for the current user, it
 * invalidates the notifications query cache so the UI auto-refreshes.
 *
 * Replaces the previous SSE-based implementation (TICKET-230).
 */
export function useNotificationsStream(options: UseNotificationsStreamOptions = {}) {
  const { enabled = true } = options
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const trpc = useTRPC()
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    if (!enabled || !user?.id) {
      return undefined
    }

    const supabase = createClient()

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Invalidate tRPC notifications list (updates badge + list)
          queryClient.invalidateQueries({
            queryKey: trpc.notifications.list.queryKey(),
          })
          // Invalidate legacy Go API absence queries (some notifications
          // relate to absence approvals and the absences hooks still use
          // the legacy API client)
          queryClient.invalidateQueries({ queryKey: ['/absences'] })
          queryClient.invalidateQueries({ queryKey: ['/employees/{id}/absences'] })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Handles mark-read and mark-all-read updates
          queryClient.invalidateQueries({
            queryKey: trpc.notifications.list.queryKey(),
          })
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [enabled, user?.id, queryClient, trpc])
}
```

**Key design decisions:**
1. **Channel name:** `notifications:${user.id}` -- unique per user to avoid cross-user event leaking.
2. **Filter:** `user_id=eq.${user.id}` -- Supabase Realtime applies this server-side via RLS + filter, so only events for the current user are received.
3. **Events:** Subscribe to both `INSERT` (new notifications) and `UPDATE` (mark-read). The old SSE pushed explicit event types (`notification.created`, `notification.read`, `notification.read_all`), but Supabase Realtime gives us Postgres-level events which cover the same cases.
4. **Query invalidation:** Uses `trpc.notifications.list.queryKey()` for the tRPC notifications query (replacing the legacy `['/notifications']` key which was for the old Go API client). Also keeps `['/absences']` and `['/employees/{id}/absences']` invalidation for legacy absence hooks.
5. **Reconnection:** Supabase Realtime client handles reconnection automatically with exponential backoff. No manual reconnection logic needed (unlike the SSE implementation which had a manual 5-second retry).
6. **Cleanup:** `supabase.removeChannel(channel)` on unmount properly unsubscribes.

### 3.2 No changes needed to `notifications.tsx` component

**File:** `/home/tolga/projects/terp/apps/web/src/components/layout/notifications.tsx`

The component imports `useNotificationsStream` from `@/hooks/use-notifications-stream` and calls it as `useNotificationsStream({ enabled: isAuthenticated })`. The hook signature and usage pattern remain identical -- no changes needed in the component.

### 3.3 No changes needed to `hooks/api/use-notifications.ts`

The tRPC query/mutation hooks remain unchanged. They are the data-fetching layer that gets invalidated by the Realtime subscription.

### 3.4 Verification Steps (Phase 3)

1. **Automated:** `cd /home/tolga/projects/terp/apps/web && npx tsc --noEmit` -- TypeScript compilation check
2. **Automated:** `cd /home/tolga/projects/terp/apps/web && npx next lint` -- ESLint check
3. **Manual:** Start dev environment (`make dev && cd apps/web && npm run dev`), log in, and verify:
   - Notifications bell renders without errors
   - No SSE connection attempts in browser Network tab
   - A Supabase WebSocket connection is visible in the Network tab
4. **Manual:** Create a notification via the Go API (or directly insert into DB):
   ```sql
   INSERT INTO notifications (tenant_id, user_id, type, title, message)
   VALUES ('<tenant-uuid>', '<user-uuid>', 'system', 'Test', 'Realtime test');
   ```
   - Verify the notifications badge updates without page reload
   - Verify the notification appears in the dropdown
5. **Manual:** Mark a notification as read and verify the badge count updates in real-time
6. **Manual:** Disconnect network briefly and reconnect -- verify the Supabase Realtime subscription recovers automatically

---

## Phase 4: Testing and Final Verification

### 4.1 Backend Tests

**Existing test file:** `/home/tolga/projects/terp/apps/api/internal/service/notification_test.go`

The existing tests (`TestCreateForScopedAdmins_*`) do NOT test SSE streaming -- they test notification creation logic and scoping. These tests should continue to pass after removing the stream hub since:
- `newNotificationService(db)` in the test does NOT call `SetStreamHub()`
- The stream hub was always optional (`if s.streamHub == nil { return }`)

**Run:** `cd /home/tolga/projects/terp/apps/api && go test -v -run TestCreateForScopedAdmins ./internal/service/...`

### 4.2 Full Build Verification

```bash
# Go backend
cd /home/tolga/projects/terp/apps/api && go build ./... && go vet ./...

# Frontend
cd /home/tolga/projects/terp/apps/web && npx tsc --noEmit

# OpenAPI spec
cd /home/tolga/projects/terp && make swagger-bundle

# Lint (may have pre-existing issues)
cd /home/tolga/projects/terp && make lint
```

### 4.3 Integration Test Checklist (Manual)

| Test | Expected Result |
|------|----------------|
| Start dev environment with `make dev` | Supabase starts with Realtime enabled |
| Log in to the web app | No SSE connection in Network tab; WebSocket to Supabase visible |
| Insert notification via SQL/Go API | Bell badge updates within 1-2 seconds |
| Open notification dropdown | New notification appears in list |
| Mark notification as read | Badge count decreases in real-time |
| Mark all as read | Badge disappears |
| Kill Supabase Realtime (restart container) | WebSocket reconnects automatically |
| Second browser tab logged in as different user | Each user only sees their own notifications |
| `GET /notifications/stream` via curl | Returns 404 (endpoint removed) |

### 4.4 RLS Security Verification

```sql
-- Connect as anon/authenticated role (not service role) and verify:
-- 1. User can only see their own notifications
SET request.jwt.claims = '{"sub": "<user-uuid>"}';
SET role TO authenticated;
SELECT * FROM notifications; -- Should only return rows where user_id = <user-uuid>

-- 2. Cannot see other users' notifications
SET request.jwt.claims = '{"sub": "<other-user-uuid>"}';
SELECT * FROM notifications WHERE user_id = '<original-user-uuid>'; -- Should return 0 rows
```

---

## File Change Summary

### Files to Create
| File | Purpose |
|------|---------|
| `supabase/migrations/<timestamp>_enable_realtime_notifications.sql` | RLS + REPLICA IDENTITY + Realtime publication |

### Files to Modify
| File | Change |
|------|--------|
| `supabase/config.toml` | Enable Realtime: `enabled = true` |
| `apps/api/internal/service/notification.go` | Remove `streamHub` field, `SetStreamHub()`, `publishEvent()`, and 3 publish calls |
| `apps/api/internal/handler/notification.go` | Remove `streamHub` field, update constructor, remove `Stream()` method |
| `apps/api/internal/handler/routes.go` | Remove `RegisterNotificationStreamRoute()` function |
| `apps/api/cmd/server/main.go` | Remove hub creation, SetStreamHub call, constructor arg, and SSE route group |
| `api/paths/notifications.yaml` | Remove `/notifications/stream` path |
| `apps/web/src/hooks/use-notifications-stream.ts` | Complete rewrite: SSE fetch -> Supabase Realtime subscription |
| `apps/web/src/server/routers/notifications.ts` | Update comment on line 9 |

### Files to Delete
| File | Reason |
|------|--------|
| `apps/api/internal/service/notification_stream.go` | Entire SSE hub infrastructure no longer needed |

### Files That Stay Unchanged
| File | Reason |
|------|--------|
| `apps/api/internal/model/notification.go` | Domain model unaffected |
| `apps/api/internal/repository/notification.go` | Data access unaffected |
| `apps/api/internal/service/notification.go` (Create methods) | Notification creation stays in Go |
| `apps/api/internal/service/notification_test.go` | Tests don't use stream hub |
| `apps/web/src/hooks/api/use-notifications.ts` | tRPC hooks unaffected |
| `apps/web/src/components/layout/notifications.tsx` | Component uses same hook signature |
| `apps/web/src/components/layout/header.tsx` | No changes needed |
| `apps/web/src/app/[locale]/(dashboard)/notifications/page.tsx` | Page unaffected |
| `apps/web/src/lib/supabase/client.ts` | Already provides browser client |
| `apps/web/src/providers/auth-provider.tsx` | Already provides user context |

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| RLS policy blocks Go backend inserts | Go uses direct Postgres connection (GORM), not Supabase client -- RLS does not apply |
| `auth.uid()` doesn't match `user_id` | Validated: TICKET-202 unified auth UIDs between Supabase Auth and the users table |
| Supabase Realtime latency > SSE | Supabase Realtime typically delivers within 100-500ms; acceptable for notifications |
| Filter `user_id=eq.{id}` not applied server-side | RLS policy ensures server-side filtering; client filter is defense-in-depth |
| WriteTimeout=0 causes issues after SSE removal | Leave as-is for now; add comment noting SSE is removed; evaluate separately |

---

## Implementation Order

1. Phase 1 first (database) -- required before frontend can subscribe
2. Phase 2 second (backend cleanup) -- can be done independently
3. Phase 3 third (frontend) -- depends on Phase 1 being complete
4. Phase 4 last (testing) -- validates everything works end-to-end

Phases 2 and 3 can be developed in parallel since Phase 2 is backend-only and Phase 3 is frontend-only. However, the final integration test requires both to be complete.
