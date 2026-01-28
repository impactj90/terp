---
date: 2026-01-28T15:12:27+01:00
researcher: codex
git_commit: 994711f4a4b748c33c999da406df02cf6783b4db
branch: master
repository: terp
topic: "Notification system for approvals, errors, and important events"
tags: [research, notifications, frontend, preferences, realtime]
status: complete
last_updated: 2026-01-28
last_updated_by: codex
---

# Research: Notification system for approvals, errors, and important events

**Date**: 2026-01-28T15:12:27+01:00
**Researcher**: codex
**Git Commit**: 994711f4a4b748c33c999da406df02cf6783b4db
**Branch**: master
**Repository**: terp

## Research Question
Build a notification system for alerting users about approvals, errors, and important events.

## Summary
- The header already renders a notifications bell with a dropdown that shows a badge, placeholder notification list, and “mark all as read”/“view all notifications” actions, but the data is hardcoded and there are no handlers or API hooks wired in yet. (`apps/web/src/components/layout/notifications.tsx:17-140`, `apps/web/src/components/layout/header.tsx:23-82`)
- Notification preferences in the profile/account settings are placeholder-only ("Coming Soon") with no persisted settings or API integration. (`apps/web/src/components/profile/account-settings-card.tsx:211-226`, `apps/web/messages/en.json:640-656`)
- There is no notifications page or history view route in the app directory; the dropdown’s “view all” item is a menu item without navigation. (`apps/web/src/components/layout/notifications.tsx:134-136`, `apps/web/src/app/[locale]/(dashboard)/` has no notification routes)
- A polling-based “near real-time” pattern exists in the Team Overview page via React Query `refetchInterval`, which could inform how live updates are handled for notifications. (`apps/web/src/hooks/api/use-team-day-views.ts:27-58`, `apps/web/src/app/[locale]/(dashboard)/team-overview/page.tsx:64-77`)

## Detailed Findings

### 1) Header notifications dropdown (placeholder data)
- `Notifications` is a client component with a bell icon, unread badge, and dropdown list rendered via `DropdownMenu` + `ScrollArea`. It uses the `header` translation namespace for strings. (`apps/web/src/components/layout/notifications.tsx:1-139`)
- Notification data is currently a local `placeholderNotifications` array with `id`, `title`, `message`, `timestamp`, `read`. There is no `type` field or icon mapping for categories (approvals/errors/reminders/system). (`apps/web/src/components/layout/notifications.tsx:17-48`)
- Unread count is derived from `notification.read` (or a `count` prop override). The badge caps at `99+`. (`apps/web/src/components/layout/notifications.tsx:51-85`)
- “Mark all as read” is rendered as a button but has no handler; individual notifications are listed as menu items with no click behavior or navigation. (`apps/web/src/components/layout/notifications.tsx:89-129`)
- The header includes the notifications bell in the right-side action group. (`apps/web/src/components/layout/header.tsx:63-81`)

### 2) Notification text and i18n keys
- Header translations include `notifications`, `noNotifications`, `markAllAsRead`, and `viewAllNotifications` in the `header` namespace. (`apps/web/messages/en.json:90-96`)
- Profile translations include the `notifications` label and `notificationsComingSoon` placeholder text. (`apps/web/messages/en.json:655-656`)

### 3) Account settings “notification preferences” placeholder
- The profile account settings card includes a “Notification Preferences” section with a bell icon and “Coming Soon” badge. It renders text from `profile.notifications` and `profile.notificationsComingSoon`. (`apps/web/src/components/profile/account-settings-card.tsx:211-226`)

### 4) Navigation and badge support
- The sidebar navigation config supports an optional `badge` field on `NavItem`, but no notification-specific nav item currently uses it. (`apps/web/src/components/layout/sidebar/sidebar-nav-config.ts:28-38`)

### 5) Real-time/polling patterns already in use
- `useTeamDayViews` supports `refetchInterval` and enables background polling; the Team Overview page uses a 30s interval to refresh attendance status when a team is selected. (`apps/web/src/hooks/api/use-team-day-views.ts:27-49`, `apps/web/src/app/[locale]/(dashboard)/team-overview/page.tsx:64-77`)

## Code References
- `apps/web/src/components/layout/notifications.tsx:17-140` - Placeholder notification dropdown with badge, unread dot, and hardcoded data.
- `apps/web/src/components/layout/header.tsx:63-81` - Header renders the notifications bell.
- `apps/web/src/components/profile/account-settings-card.tsx:211-226` - Notification preferences placeholder in account settings.
- `apps/web/messages/en.json:90-96` - Header notification strings.
- `apps/web/messages/en.json:655-656` - Notification preferences “coming soon” strings.
- `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts:28-38` - Nav items support a `badge` field.
- `apps/web/src/hooks/api/use-team-day-views.ts:27-49` - Polling/near-real-time hook pattern.
- `apps/web/src/app/[locale]/(dashboard)/team-overview/page.tsx:64-77` - `refetchInterval` usage for live-ish updates.

## Architecture Documentation
- Notifications are currently implemented as a header dropdown UI only, using shadcn/ui primitives and Next-Intl translations. The data source is a local placeholder array rather than API queries.
- The application already uses React Query with optional polling via `refetchInterval` for near-real-time updates (Team Overview), which indicates a precedent for periodic refresh over websockets/SSE.

## Historical Context (from thoughts/)
- `thoughts/shared/research/2026-01-28-manager-approvals-dashboard.md` - Notes that the notifications dropdown is placeholder-only and not backed by an API.
- `thoughts/shared/research/2026-01-25-NOK-217-create-core-layout.md` - Documents the initial layout plan where notifications were a dropdown placeholder.
- `thoughts/shared/research/2026-01-26-NOK-224-employee-profile-page.md` - Captures that notification preferences were scoped as placeholders with “Coming Soon” text.

## Related Research
- `thoughts/shared/research/2026-01-28-manager-approvals-dashboard.md`
- `thoughts/shared/research/2026-01-25-NOK-217-create-core-layout.md`
- `thoughts/shared/research/2026-01-26-NOK-224-employee-profile-page.md`

## Open Questions
- Where should notification data be stored and fetched (no backend notification model or API was located in current code search)?
- Should “View all notifications” route to a new page or existing settings/profile area (no notifications route exists today)?
