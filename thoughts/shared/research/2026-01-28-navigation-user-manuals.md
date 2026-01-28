---
date: 2026-01-28T19:18:11+01:00
researcher: codex
git_commit: 24241a01551581d43928115e96b973fcc8be2164
branch: master
repository: terp
topic: "User manuals for navigation pages (admin + user)"
tags: [research, codebase, navigation, docs, manuals, frontend]
status: complete
last_updated: 2026-01-28
last_updated_by: codex
---

# Research: User manuals for navigation pages (admin + user)

**Date**: 2026-01-28T19:18:11+01:00
**Researcher**: codex
**Git Commit**: 24241a01551581d43928115e96b973fcc8be2164
**Branch**: master
**Repository**: terp

## Research Question
Create customer-ready user manuals for every page linked in navigation (sidebar, header notifications, and user menu), differentiating admin vs normal users, and documenting purpose, step-by-step usage, data semantics, integrations, and troubleshooting.

## Summary
- The sidebar navigation is defined in `navConfig` with main user pages and admin-only sections, including routes for approvals, employees, teams, departments, day plans, week plans, tariffs, holidays, absence types, booking types, accounts, and administration entries. The user menu links to `/profile` and `/settings`, and the header notification bell links to `/notifications`.
- Implemented pages exist for all main user pages and most admin management pages, including booking types. Some navigation routes (employment types, users, reports, admin settings, tenants, and user settings) have no page implementation under the Next.js app routes, so navigation currently resolves to Not Found.
- Manuals were created per page in `thoughts/shared/docs/` to align with current UI behavior, field names, and integrations.

## Detailed Findings

### Navigation entry points
- Sidebar navigation items are defined in `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`, including admin-only sections and mobile bottom navigation.
- The user avatar menu links to `/profile` and `/settings`.
- The header notification bell links to `/notifications` and displays a dropdown preview.

### Implemented user pages
- `/dashboard` aggregates day views, daily values, monthly values, bookings, and vacation balance to present status cards, pending actions, and recent activity.
- `/team-overview` combines team membership with per-employee day views and daily values over a date range for attendance and summary metrics.
- `/time-clock`, `/timesheet`, `/absences`, `/vacation`, `/monthly-evaluation`, `/year-overview`, `/notifications`, and `/profile` are implemented under `apps/web/src/app/[locale]/(dashboard)`.

### Implemented admin pages
- Admin management pages exist for approvals, employees, teams, departments, day plans, week plans, tariffs, holidays, absence types, booking types, and accounts.
- Admin forms define the fields and constraints reflected in the manuals (day plans, week plans, tariffs, employees, absence types, booking types, accounts, holidays).

### Navigation routes without page implementations
- The navigation includes `/admin/employment-types`, `/admin/users`, `/admin/reports`, `/admin/settings`, `/admin/tenants`, and `/settings` from the user menu, but no corresponding `page.tsx` routes were found in the current app directory.

## Code References
- `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts:57` - Sidebar navigation config for main/admin routes. (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts#L57)
- `apps/web/src/components/layout/user-menu.tsx:22` - User menu links to /profile and /settings. (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/components/layout/user-menu.tsx#L22)
- `apps/web/src/components/layout/notifications.tsx:60` - Header notifications dropdown links to /notifications. (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/components/layout/notifications.tsx#L60)
- `apps/web/src/app/[locale]/(dashboard)/dashboard/page.tsx:18` - Dashboard page wiring quick actions and cards. (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/app/%5Blocale%5D/%28dashboard%29/dashboard/page.tsx#L18)
- `apps/web/src/app/[locale]/(dashboard)/team-overview/page.tsx:27` - Team Overview page (range, stats, attendance). (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/app/%5Blocale%5D/%28dashboard%29/team-overview/page.tsx#L27)
- `apps/web/src/app/[locale]/(dashboard)/time-clock/page.tsx:39` - Time Clock page (clock actions and stats). (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/app/%5Blocale%5D/%28dashboard%29/time-clock/page.tsx#L39)
- `apps/web/src/app/[locale]/(dashboard)/timesheet/page.tsx:50` - Timesheet page (day/week/month views and bookings). (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/app/%5Blocale%5D/%28dashboard%29/timesheet/page.tsx#L50)
- `apps/web/src/app/[locale]/(dashboard)/absences/page.tsx:16` - Absences page (request form + calendar). (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/app/%5Blocale%5D/%28dashboard%29/absences/page.tsx#L16)
- `apps/web/src/app/[locale]/(dashboard)/vacation/page.tsx:18` - Vacation balance page. (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/app/%5Blocale%5D/%28dashboard%29/vacation/page.tsx#L18)
- `apps/web/src/app/[locale]/(dashboard)/monthly-evaluation/page.tsx:31` - Monthly evaluation page (close/reopen, export). (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/app/%5Blocale%5D/%28dashboard%29/monthly-evaluation/page.tsx#L31)
- `apps/web/src/app/[locale]/(dashboard)/year-overview/page.tsx:28` - Year overview page (summary, chart, table). (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/app/%5Blocale%5D/%28dashboard%29/year-overview/page.tsx#L28)
- `apps/web/src/app/[locale]/(dashboard)/notifications/page.tsx:47` - Notifications inbox and preferences. (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/app/%5Blocale%5D/%28dashboard%29/notifications/page.tsx#L47)
- `apps/web/src/app/[locale]/(dashboard)/profile/page.tsx:18` - Profile page (personal + account settings). (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/app/%5Blocale%5D/%28dashboard%29/profile/page.tsx#L18)
- `apps/web/src/app/[locale]/(dashboard)/admin/approvals/page.tsx:44` - Admin approvals for timesheets and absences. (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/app/%5Blocale%5D/%28dashboard%29/admin/approvals/page.tsx#L44)
- `apps/web/src/app/[locale]/(dashboard)/admin/employees/page.tsx:31` - Admin employees list and actions. (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/app/%5Blocale%5D/%28dashboard%29/admin/employees/page.tsx#L31)
- `apps/web/src/app/[locale]/(dashboard)/admin/teams/page.tsx:32` - Admin teams list and actions. (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/app/%5Blocale%5D/%28dashboard%29/admin/teams/page.tsx#L32)
- `apps/web/src/app/[locale]/(dashboard)/admin/departments/page.tsx:34` - Admin departments list and actions. (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/app/%5Blocale%5D/%28dashboard%29/admin/departments/page.tsx#L34)
- `apps/web/src/app/[locale]/(dashboard)/admin/day-plans/page.tsx:30` - Admin day plans list and actions. (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/app/%5Blocale%5D/%28dashboard%29/admin/day-plans/page.tsx#L30)
- `apps/web/src/app/[locale]/(dashboard)/admin/week-plans/page.tsx:30` - Admin week plans list and actions. (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/app/%5Blocale%5D/%28dashboard%29/admin/week-plans/page.tsx#L30)
- `apps/web/src/app/[locale]/(dashboard)/admin/tariffs/page.tsx:32` - Admin tariffs list and actions. (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/app/%5Blocale%5D/%28dashboard%29/admin/tariffs/page.tsx#L32)
- `apps/web/src/app/[locale]/(dashboard)/admin/holidays/page.tsx:27` - Admin holidays list and actions. (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/app/%5Blocale%5D/%28dashboard%29/admin/holidays/page.tsx#L27)
- `apps/web/src/app/[locale]/(dashboard)/admin/absence-types/page.tsx:47` - Admin absence types list and actions. (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/app/%5Blocale%5D/%28dashboard%29/admin/absence-types/page.tsx#L47)
- `apps/web/src/app/[locale]/(dashboard)/admin/accounts/page.tsx:46` - Admin accounts list and actions. (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/app/%5Blocale%5D/%28dashboard%29/admin/accounts/page.tsx#L46)
- `apps/web/src/app/[locale]/(dashboard)/admin/booking-types/page.tsx:30` - Admin booking types list and actions. (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/app/%5Blocale%5D/%28dashboard%29/admin/booking-types/page.tsx#L30)
- `apps/web/src/components/day-plans/day-plan-form-sheet.tsx:44` - Day plan fields and validation. (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/components/day-plans/day-plan-form-sheet.tsx#L44)
- `apps/web/src/components/week-plans/week-plan-form-sheet.tsx:48` - Week plan fields and day-plan assignments. (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/components/week-plans/week-plan-form-sheet.tsx#L48)
- `apps/web/src/components/tariffs/tariff-form-sheet.tsx:53` - Tariff fields for rhythm, vacation, targets, flextime. (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/components/tariffs/tariff-form-sheet.tsx#L53)
- `apps/web/src/components/employees/employee-form-sheet.tsx:56` - Employee fields used for create/edit. (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/components/employees/employee-form-sheet.tsx#L56)
- `apps/web/src/components/absence-types/absence-type-form-sheet.tsx:40` - Absence type fields and constraints. (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/components/absence-types/absence-type-form-sheet.tsx#L40)
- `apps/web/src/components/accounts/account-form-sheet.tsx:40` - Account fields and configuration. (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/components/accounts/account-form-sheet.tsx#L40)
- `apps/web/src/components/holidays/holiday-form-sheet.tsx:53` - Holiday fields and scope. (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/components/holidays/holiday-form-sheet.tsx#L53)
- `apps/web/src/components/booking-types/booking-type-form-sheet.tsx:42` - Booking type fields and constraints. (https://github.com/impactj90/terp/blob/24241a01551581d43928115e96b973fcc8be2164/apps/web/src/components/booking-types/booking-type-form-sheet.tsx#L42)

## Architecture Documentation
- Frontend pages are implemented as Next.js app routes under `apps/web/src/app/[locale]/(dashboard)` with admin-only pages nested under `admin/`.
- Sidebar and mobile navigation are driven by a centralized `navConfig` and role checks via `useHasRole`.
- Data is loaded via API hooks in `apps/web/src/hooks/api`, with page-level composition in the route files and field definitions in form sheets.

## Historical Context (from thoughts/)
- `thoughts/shared/research/2026-01-26-NOK-228-day-plan-management.md` - day plan UI and field mapping.
- `thoughts/shared/research/2026-01-26-NOK-229-week-plan-management.md` - week plan UI and schedule logic.
- `thoughts/shared/research/2026-01-26-NOK-230-tariff-management.md` - tariff configuration and rhythms.
- `thoughts/shared/research/2026-01-26-NOK-231-holiday-management.md` - holiday management flow.
- `thoughts/shared/research/2026-01-26-NOK-232-absence-type-configuration.md` - absence type rules.
- `thoughts/shared/research/2026-01-27-NOK-235-manager-approval-dashboard.md` - approvals dashboard behavior.
- `thoughts/shared/research/2026-01-27-NOK-236-team-overview-dashboard.md` - team overview structure.
- `thoughts/shared/research/2026-01-27-NOK-237-account-management.md` - account management flow.
- `thoughts/shared/research/2026-01-26-NOK-233-monthly-evaluation-view.md` - monthly evaluation layout.
- `thoughts/shared/research/2026-01-26-NOK-234-year-overview.md` - year overview metrics.

## Related Research
- `thoughts/shared/research/2026-01-28-timesheet-booking-integration.md`
- `thoughts/shared/research/2026-01-28-notification-system.md`
- `thoughts/shared/research/2026-01-26-NOK-222-absence-request-form.md`
- `thoughts/shared/reference/zmi-calculation-manual-reference.md`

## Open Questions
- Should manuals also be created for non-navigation routes referenced by UI links (e.g., `/corrections`), or only for navigation entries?
