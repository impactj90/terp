---
date: 2026-01-28T11:46:42+01:00
researcher: impactj90
git_commit: 7ddef55cbf552d5aaf9b32585268ebc7d8f2fde0
branch: master
repository: terp
topic: "Manager approvals dashboard for timesheets and absences"
tags: [research, approvals, absences, daily-values, frontend, backend]
status: complete
last_updated: 2026-01-28
last_updated_by: impactj90
---

# Research: Manager approvals dashboard for timesheets and absences

**Date**: 2026-01-28T11:46:42+01:00
**Researcher**: impactj90
**Git Commit**: 7ddef55cbf552d5aaf9b32585268ebc7d8f2fde0
**Branch**: master
**Repository**: terp

## Research Question
Build a manager dashboard for approving team timesheets and absence requests with bulk actions, history, filters, and notifications.

## Summary
- An admin-only approvals page already exists at `/admin/approvals`, but it only covers absence approvals with pending and history tabs (no timesheets tab, no bulk actions, no team/date filters). It uses `useAbsences` plus approve/reject mutations and a rejection reason dialog. (`apps/web/src/app/[locale]/(dashboard)/admin/approvals/page.tsx`)
- Absence approval endpoints are fully implemented in the backend (`GET /absences`, `POST /absences/{id}/approve`, `POST /absences/{id}/reject`) with service/repo support and employee/type preloads for row details. (`apps/api/internal/handler/absence.go`, `apps/api/internal/service/absence.go`, `apps/api/internal/repository/absenceday.go`, `apps/api/internal/handler/routes.go`)
- Timesheet approvals are not implemented end-to-end: the OpenAPI schema defines `/daily-values` with `status` and `/daily-values/{id}/approve`, but there is no handler or routes for these endpoints, and the `daily_values` table/model do not include an approval/status field. Current frontend daily-value usage is employee-scoped monthly breakdown only. (`api/schemas/daily-values.yaml`, `apps/api/internal/model/dailyvalue.go`, `db/migrations/000024_create_daily_values.up.sql`, `apps/api/internal/handler/monthlyeval.go`, `apps/web/src/hooks/api/use-daily-values.ts`)
- Notifications are currently placeholder-only in the UI; there is no notification API integration to send decision notifications. (`apps/web/src/components/layout/notifications.tsx`)
- Roles are limited to `user` and `admin` in the frontend role utilities; there is no manager role in the app model. (`apps/web/src/hooks/use-has-role.ts`)

## Detailed Findings

### 1) Existing approvals UI (absences only)
- `/admin/approvals` page is implemented as an admin-only view using `useHasRole(['admin'])` and redirects non-admins to `/dashboard`. (`apps/web/src/app/[locale]/(dashboard)/admin/approvals/page.tsx:17-115`)
- The page has two tabs: `absences` and `history`. It loads three separate absence lists by status (pending, approved, rejected) via `useAbsences` and composes history by merging approved + rejected. (`apps/web/src/app/[locale]/(dashboard)/admin/approvals/page.tsx:30-77`)
- Approval actions are per-row buttons; no bulk selection/approve. Reject opens a modal dialog that collects a reason, then posts to `/absences/{id}/reject`. (`apps/web/src/app/[locale]/(dashboard)/admin/approvals/page.tsx:78-188`, `apps/web/src/components/approvals/reject-dialog.tsx:17-95`)
- `AbsenceApprovalTable` renders employee name (from expanded relations), type badge, date, duration, notes, and action buttons. It can switch to a history mode with status badges. There are no checkboxes or row expansion here. (`apps/web/src/components/approvals/absence-approval-table.tsx:21-209`)

### 2) Absence approval API is implemented
- Routes include `GET /absences`, `POST /absences/{id}/approve`, and `POST /absences/{id}/reject`. (`apps/api/internal/handler/routes.go:221-241`)
- `AbsenceHandler` supports list-all with filters (employee_id, absence_type_id, status, from/to), approve, and reject with optional reason. (`apps/api/internal/handler/absence.go:221-352`)
- `AbsenceService` enforces pending-only transitions and sets approved metadata/rejection reason, plus triggers recalculation. (`apps/api/internal/service/absence.go:147-201`)
- `AbsenceDayRepository.ListAll` preloads `Employee` and `AbsenceType` to populate row details in the UI. (`apps/api/internal/repository/absenceday.go:135-164`)
- Note: rejection reason is stored in the model/service but is not exposed in the API response schema or handler response mapping. (`apps/api/internal/service/absence.go:175-191`, `apps/api/internal/handler/absence.go:354-424`, `api/schemas/absences.yaml`)

### 3) Timesheet approval gap (daily values)
- OpenAPI expects daily values to have a `status` field and supports `/daily-values` and `/daily-values/{id}/approve`, but there is no handler or routing for these endpoints today. (`api/schemas/daily-values.yaml:1-192`, `api/paths/daily-values.yaml`)
- The `daily_values` table and `DailyValue` model have no approval status columns. They only track `has_error`, `error_codes`, `warnings`, and time totals. (`db/migrations/000024_create_daily_values.up.sql`, `apps/api/internal/model/dailyvalue.go:10-45`)
- The only daily values API in the backend is the monthly evaluation daily breakdown under `/employees/{id}/months/{year}/{month}/days`. (`apps/api/internal/handler/monthlyeval.go:225-367`, `apps/api/internal/handler/routes.go:248-259`)
- The frontend `useDailyValues` hook targets the monthly breakdown endpoint (employee-scoped) and derives `status` client-side from `has_error`/`warnings`. There is no hook for global daily values across employees. (`apps/web/src/hooks/api/use-daily-values.ts:121-153`)
- The daily value repository has helper queries (e.g., `GetWithErrors`) but nothing for approvals or status updates. (`apps/api/internal/repository/dailyvalue.go:143-156`)

### 4) Navigation and role context
- The sidebar already includes an admin-only `approvals` link under the management section. (`apps/web/src/components/layout/sidebar/sidebar-nav-config.ts:103-113`)
- Role utilities explicitly define only `user` and `admin`. A manager-specific role is not modeled in the frontend. (`apps/web/src/hooks/use-has-role.ts:10-47`)
- Teams include `leader_employee_id` and member roles (`member`, `lead`, `deputy`), which could be used for team-based filtering once a UI chooses a team. (`api/schemas/teams.yaml`)

### 5) Notification UI is placeholder-only
- The notifications dropdown uses hard-coded placeholder data and notes that it should be replaced by a real API hook. This means there is no system to send or display approval decision notifications yet. (`apps/web/src/components/layout/notifications.tsx:17-137`)

### 6) ZMI calculation reference cross-check
- The ZMI calculation reference was reviewed for context on time/absence calculation rules; it does not define any approval workflow behaviors. (`thoughts/shared/reference/zmi-calculation-manual-reference.md`)

## Code References
- `apps/web/src/app/[locale]/(dashboard)/admin/approvals/page.tsx:17` - Admin-only approvals page (absences tab + history).
- `apps/web/src/components/approvals/absence-approval-table.tsx:21` - Absence approvals table with per-row approve/reject actions.
- `apps/web/src/components/approvals/reject-dialog.tsx:17` - Reject dialog used for rejection reason input.
- `apps/web/src/hooks/api/use-absences.ts:48` - `useAbsences` list query + approve/reject hooks.
- `apps/api/internal/handler/routes.go:221` - Routes registering absence approval endpoints.
- `apps/api/internal/handler/absence.go:221` - `GET /absences`, approve, reject handlers.
- `apps/api/internal/service/absence.go:147` - Approve/reject logic and pending checks.
- `apps/api/internal/repository/absenceday.go:135` - ListAll preloads employee + absence type for UI row details.
- `apps/api/internal/model/dailyvalue.go:10` - Daily value model lacks approval status.
- `db/migrations/000024_create_daily_values.up.sql` - Daily values table schema without status/approval fields.
- `apps/api/internal/handler/monthlyeval.go:225` - Only daily values API: employee monthly breakdown.
- `apps/web/src/hooks/api/use-daily-values.ts:121` - Frontend daily values hook uses monthly breakdown endpoint.
- `api/schemas/daily-values.yaml:1` - OpenAPI expects daily value status + approve endpoint.
- `apps/web/src/components/layout/notifications.tsx:17` - Placeholder notification UI.
- `apps/web/src/hooks/use-has-role.ts:10` - Role definitions limited to user/admin.
- `api/schemas/teams.yaml` - Team schema includes leader and member roles for potential team scoping.

## Architecture Documentation
- Frontend is Next.js App Router with locale-aware paths; the approvals page lives under the admin dashboard route group: `apps/web/src/app/[locale]/(dashboard)/admin/approvals/page.tsx`.
- Backend HTTP routes are registered via `handler/routes.go`, with absence approval endpoints implemented and monthly evaluation routes providing daily value breakdowns per employee.
- Daily values are computed and stored without approval status; UI derives a pseudo-status locally from `has_error` and `warnings` in the monthly breakdown response.

## Historical Context (from thoughts/)
- `thoughts/shared/research/2026-01-27-NOK-235-manager-approval-dashboard.md` - Prior research; note that it predates the current approvals page and backend absence approval implementation.
- `thoughts/shared/plans/2026-01-27-NOK-235-manager-approval-dashboard.md` - Prior plan; some assumptions (missing endpoints/page) are now outdated.

## Related Research
- `thoughts/shared/research/2026-01-27-NOK-235-manager-approval-dashboard.md`

## Open Questions
- Should timesheet approvals map to daily values (per-day) or another unit (weekly timesheets), and how should approval status be stored in the data model?
- Should rejection reasons be exposed in the Absence API response (currently stored but not returned)?
- Should approvals be scoped by team manager vs. admin, and how would that map to user roles or team membership?
