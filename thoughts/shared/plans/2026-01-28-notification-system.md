# Notification System Implementation Plan

## Overview

Implement a full in-app notification system with backend persistence, SSE-based real-time updates, a notifications page (history + preferences), and UI integration in the header dropdown.

## Current State Analysis

- Header already renders a notifications bell + dropdown with hardcoded placeholder data and a badge count. (`apps/web/src/components/layout/notifications.tsx`, `apps/web/src/components/layout/header.tsx`)
- Notification preferences are a placeholder “Coming Soon” section in the profile account settings. (`apps/web/src/components/profile/account-settings-card.tsx`)
- Backend has no notification models, migrations, or endpoints; SSE/websocket infra does not exist. (`apps/api/cmd/server/main.go`, `api/openapi.yaml`)
- Real-time polling pattern exists via React Query `refetchInterval` (Team Overview) and can be referenced for SSE fallback behavior. (`apps/web/src/hooks/api/use-team-day-views.ts`)

## Desired End State

- Notifications are stored server-side and returned via `/notifications` with filters and unread count.
- Header dropdown shows live notifications with unread badge, per-type icons, category labels, relative timestamps, and mark-read actions.
- Clicking a notification routes to its `link` target.
- Users can mark a single notification as read or mark all as read.
- A new `/notifications` page shows full history and provides a preferences tab to toggle categories (approvals/errors/reminders/system) for in-app notifications.
- Notifications are delivered in real-time via SSE using authenticated streaming with Authorization + X-Tenant-ID headers.
- Initial event sources:
  - Approval notifications when absences are approved/rejected.
  - Reminder notifications for pending approvals when a pending absence request is created (sent to tenant admins).
  - Error notifications when daily calculation results in a new error state for a day.
  - System notifications when a user updates their account display name.

### Key Discoveries
- Notifications dropdown is currently placeholder-only (`apps/web/src/components/layout/notifications.tsx`).
- There is no notifications API in OpenAPI or backend routing. (`api/openapi.yaml`, `apps/api/internal/handler/routes.go`)
- SSE is not implemented; auth uses Bearer token from localStorage, so frontend must use `fetch` streaming to attach headers (EventSource cannot). (`apps/web/src/lib/api/client.ts`)

## What We're NOT Doing

- Push notifications (explicitly out of scope).
- Automated scheduler/cron for reminders; reminder notifications are generated only when relevant actions occur (absence requests created).
- Email or SMS notification channels.

## Implementation Approach

- Add notification data model + preferences model in backend with migrations, repository, service layer, and handler routes.
- Add an in-process SSE hub for per-user streams; publish events on notification creation and read status updates.
- Add notification hooks in the frontend plus a streaming hook using `fetch` + `ReadableStream` parsing to handle SSE with auth headers.
- Replace placeholder UI with live data, add a new notifications page, and wire preferences into account settings.

## Phase 1: Backend Data Model + API

### Overview
Add notification tables, models, repositories, service methods, and REST endpoints for listing notifications and updating read state/preferences.

### Changes Required

#### 1) Database migrations
**File**: `db/migrations/000035_create_notifications.up.sql`
**Changes**:
- Create `notifications` table (id, tenant_id, user_id, type, title, message, link, read_at, created_at, updated_at).
- Create `notification_preferences` table (id, tenant_id, user_id, approvals_enabled, errors_enabled, reminders_enabled, system_enabled, created_at, updated_at).
- Add indexes for `notifications(user_id, read_at)` and `notifications(user_id, created_at)`.

**File**: `db/migrations/000035_create_notifications.down.sql`
**Changes**:
- Drop `notification_preferences` and `notifications` tables.

#### 2) Models
**File**: `apps/api/internal/model/notification.go` (new)
**Changes**:
- `NotificationType` enum: `approvals`, `errors`, `reminders`, `system`.
- `Notification` model with GORM tags.
- `NotificationPreference` model with defaults (all categories enabled).

#### 3) Repository layer
**File**: `apps/api/internal/repository/notification.go` (new)
**Changes**:
- CRUD for notifications (create, list with filters, mark read, mark all read, count unread).
- Preferences: get by user/tenant, upsert.

#### 4) Service layer
**File**: `apps/api/internal/service/notification.go` (new)
**Changes**:
- `NotificationService` with:
  - `ListForUser` (filters: type, unread, limit/offset, from/to dates) returning list + total + unread count.
  - `MarkRead`, `MarkAllRead`.
  - `GetPreferences`, `UpdatePreferences` (creates defaults if missing).
  - `Create` that checks preferences before persisting.

#### 5) API handlers + routes
**File**: `apps/api/internal/handler/notification.go` (new)
**Changes**:
- `GET /notifications` (current user, tenant required) returns list + `unread_count` + pagination meta.
- `POST /notifications/{id}/read` marks read.
- `POST /notifications/read-all` marks all read.
- `GET /notification-preferences` returns current preferences.
- `PUT /notification-preferences` updates preferences.

**File**: `apps/api/internal/handler/routes.go`
**Changes**:
- Register notification routes under tenant-scoped group.

**File**: `api/paths/notifications.yaml` (new)
**File**: `api/schemas/notifications.yaml` (new)
**File**: `api/openapi.yaml`
**Changes**:
- Add schemas: `Notification`, `NotificationList`, `NotificationPreferences`, `UpdateNotificationPreferencesRequest`.
- Add paths for list/read/preferences endpoints.

### Success Criteria

#### Automated Verification:
- [ ] Go build passes: `go test ./apps/api/...` (failed: repository tests require local Postgres; socket operation not permitted)

#### Manual Verification:
- [ ] `GET /notifications` returns list + `unread_count` for authenticated user.
- [ ] `POST /notifications/{id}/read` marks single notification as read.
- [ ] `POST /notifications/read-all` marks all as read.
- [ ] Preferences endpoints persist and return updated values.

---

## Phase 2: SSE Real-Time Notifications + Event Sources

### Overview
Add SSE streaming, publish events on notification changes, and wire initial event sources.

### Changes Required

#### 1) SSE hub
**File**: `apps/api/internal/service/notification_stream.go` (new)
**Changes**:
- In-memory hub keyed by user ID with subscribe/unsubscribe.
- Emit events: `notification.created`, `notification.read`, `notification.read_all` with payload JSON.

#### 2) SSE handler
**File**: `apps/api/internal/handler/notification.go`
**Changes**:
- `GET /notifications/stream` returns `text/event-stream`.
- Uses auth + tenant middleware; subscribes to hub; writes events until client disconnects.

#### 3) Event sources
**File**: `apps/api/internal/service/absence.go`
**Changes**:
- Add optional notifier setter on `AbsenceService` to emit:
  - `reminders` notification to all admin users when a pending absence is created.
  - `approvals` notification to the absence employee on approve/reject (include link to absences).

**File**: `apps/api/internal/service/daily_calc.go`
**Changes**:
- Add optional notifier setter on `DailyCalcService`.
- When calculation produces an error state that was previously non-error, create `errors` notification for the employee (link to timesheet day view).

**File**: `apps/api/internal/service/user.go` and `apps/api/internal/handler/user.go`
**Changes**:
- Add optional notifier setter to create a `system` notification when a user updates their display name.

**File**: `apps/api/cmd/server/main.go`
**Changes**:
- Instantiate `NotificationService` and hub; wire into handlers/services via setters.

### Success Criteria

#### Automated Verification:
- [ ] Go build passes after SSE additions: `go test ./apps/api/...` (failed: repository tests require local Postgres; socket operation not permitted)

#### Manual Verification:
- [ ] Opening `/notifications/stream` while logged in yields SSE events when notifications are created/updated.
- [ ] Absence approval creates a new notification for the employee.
- [ ] New daily value error creates an error notification.
- [ ] Updating display name creates a system notification for the user.

---

## Phase 3: Frontend Hooks + Streaming Client + Header Dropdown

### Overview
Replace placeholder dropdown data with real API data and SSE updates.

### Changes Required

#### 1) API hooks
**File**: `apps/web/src/hooks/api/use-notifications.ts` (new)
**Changes**:
- `useNotifications` (list with filters + unread_count).
- `useMarkNotificationRead`, `useMarkAllNotificationsRead`.
- `useNotificationPreferences`, `useUpdateNotificationPreferences`.

**File**: `apps/web/src/hooks/api/index.ts`
**Changes**:
- Export new notification hooks.

#### 2) SSE client
**File**: `apps/web/src/hooks/use-notifications-stream.ts` (new)
**Changes**:
- Use `fetch` streaming with Authorization + X-Tenant-ID headers from `authStorage`/`tenantIdStorage`.
- Parse SSE events and update React Query caches for `/notifications`.

#### 3) Header dropdown UI
**File**: `apps/web/src/components/layout/notifications.tsx`
**Changes**:
- Replace placeholder data with `useNotifications({ limit: 10 })`.
- Render per-type icons (approvals/errors/reminders/system) and category labels.
- On click: mark as read + `Link` to notification `link`.
- “Mark all as read” button wired to mutation.
- Relative timestamps using new `formatRelativeTime` helper.

#### 4) Relative time utility
**File**: `apps/web/src/lib/time-utils.ts`
**Changes**:
- Add `formatRelativeTime(isoString, locale)` using `Intl.RelativeTimeFormat`.

### Success Criteria

#### Automated Verification:
- [ ] Web typecheck/lint: `pnpm -C apps/web run check` (failed: pre-existing typecheck errors + missing import fixed)

#### Manual Verification:
- [ ] Header badge count updates after mark read / mark all.
- [ ] Dropdown shows real notifications with icons and relative timestamps.
- [ ] SSE connection updates dropdown within a few seconds of new notifications.

---

## Phase 4: Notifications Page + Preferences

### Overview
Create a `/notifications` page with history and preferences tabs.

### Changes Required

#### 1) Notifications page
**File**: `apps/web/src/app/[locale]/(dashboard)/notifications/page.tsx` (new)
**Changes**:
- Tabs: “All Notifications” and “Preferences”.
- List view with filters (All / Unread / Type) and pagination if needed.
- Click row to mark read and navigate to link.

#### 2) Preferences UI
**File**: `apps/web/src/components/notifications/notification-preferences.tsx` (new)
**Changes**:
- Toggle switches for each category (approvals/errors/reminders/system).
- Save button with success/error feedback.

#### 3) Link from account settings
**File**: `apps/web/src/components/profile/account-settings-card.tsx`
**Changes**:
- Replace “Coming Soon” with button linking to `/notifications` preferences tab.

#### 4) i18n strings
**Files**: `apps/web/messages/en.json`, `apps/web/messages/de.json`
**Changes**:
- Add notifications page strings, filter labels, category labels, preference descriptions, empty states.

### Success Criteria

#### Automated Verification:
- [ ] Web typecheck/lint: `pnpm -C apps/web run check` (failed: pre-existing typecheck errors + missing import fixed)

#### Manual Verification:
- [ ] `/notifications` shows history list with correct read/unread state.
- [ ] Preferences toggles save and reflect in subsequent notification creation.
- [ ] Account settings link opens preferences.

---

## Testing Strategy

### Unit Tests (Go)
- Notification repository/service tests:
  - Create + list filters
  - Mark read / mark all read
  - Preferences default creation

### Frontend Manual Tests
1. Approve an absence as admin → employee receives approval notification and badge increments.
2. Create a new absence request (pending) → admin receives reminder notification.
3. Trigger daily value error (dev data) → error notification appears.
4. Change display name → system notification appears.
5. Preferences disable “Errors” → error notifications are not created afterward.

## Performance Considerations

- SSE hub is in-memory; for multi-instance deployments, add a shared pub/sub (Redis) or sticky sessions later.
- Notifications list queries are indexed by user and read state.

## References

- Existing notification dropdown: `apps/web/src/components/layout/notifications.tsx`
- Profile placeholder preferences: `apps/web/src/components/profile/account-settings-card.tsx`
- API routing: `apps/api/internal/handler/routes.go`
- API server wiring: `apps/api/cmd/server/main.go`
