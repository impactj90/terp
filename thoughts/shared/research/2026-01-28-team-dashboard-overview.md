---
date: 2026-01-28T11:48:55+01:00
researcher: codex
git_commit: 7ddef55cbf552d5aaf9b32585268ebc7d8f2fde0
branch: master
repository: terp
topic: "Team dashboard for managers (attendance, absences, time metrics)"
tags: [research, codebase, team-overview, attendance, absences, reports, frontend, api]
status: complete
last_updated: 2026-01-28
last_updated_by: codex
---

# Research: Team dashboard for managers (attendance, absences, time metrics)

**Date**: 2026-01-28T11:48:55+01:00
**Researcher**: codex
**Git Commit**: 7ddef55cbf552d5aaf9b32585268ebc7d8f2fde0
**Branch**: master
**Repository**: terp

## Research Question
Create a team dashboard for managers to see team attendance, absences, and time metrics at a glance, including status lists, weekly summaries, upcoming absences, and export/filter affordances.

## Summary
The codebase already includes a Team Overview dashboard at `/team-overview` with a team selector, stats cards, attendance list grouped by status, and an upcoming absences panel, plus quick action links to teams, absences, and timesheets. The frontend derives attendance status from per-employee day views (`/employees/{id}/day/{date}`) and weekly hour totals from per-employee monthly daily breakdowns (`/employees/{id}/months/{year}/{month}/days`). Upcoming absences are fetched per member via `/employees/{id}/absences` over a 14‑day window. No single aggregated team attendance or team report endpoint is present; the current implementation relies on N per-employee calls and uses React Query stale times to approximate live updates.

## Detailed Findings

### Team Overview page layout and data sources
- The Team Overview page (`/team-overview`) is implemented in `apps/web/src/app/[locale]/(dashboard)/team-overview/page.tsx` and wires together the team selector, stats cards, attendance list, upcoming absences, and quick actions. It auto-selects a team when only one is available and refreshes day view data on demand. ([apps/web/src/app/[locale]/(dashboard)/team-overview/page.tsx:24](https://github.com/impactj90/terp/blob/7ddef55cbf552d5aaf9b32585268ebc7d8f2fde0/apps/web/src/app/%5Blocale%5D/%28dashboard%29/team-overview/page.tsx#L24))
- Team selection uses the `/teams` endpoint filtered by `is_active` and fetches a team with members via `/teams/{id}?include_members=true`. The hooks live in `apps/web/src/hooks/api/use-teams.ts`. ([apps/web/src/hooks/api/use-teams.ts:24](https://github.com/impactj90/terp/blob/7ddef55cbf552d5aaf9b32585268ebc7d8f2fde0/apps/web/src/hooks/api/use-teams.ts#L24))
- The sidebar includes a nav entry for `/team-overview`, and breadcrumbs map the route to `teamOverview` labels. ([apps/web/src/components/layout/sidebar/sidebar-nav-config.ts:57](https://github.com/impactj90/terp/blob/7ddef55cbf552d5aaf9b32585268ebc7d8f2fde0/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts#L57), [apps/web/src/components/layout/breadcrumbs.tsx:40](https://github.com/impactj90/terp/blob/7ddef55cbf552d5aaf9b32585268ebc7d8f2fde0/apps/web/src/components/layout/breadcrumbs.tsx#L40))

### Team attendance status list
- `TeamAttendanceList` groups members into Present, On Leave, and Not Yet In based on the day view’s `daily_value` flags and the presence of work bookings (direction `in`/`out`). ([apps/web/src/components/team-overview/team-attendance-list.tsx:30](https://github.com/impactj90/terp/blob/7ddef55cbf552d5aaf9b32585268ebc7d8f2fde0/apps/web/src/components/team-overview/team-attendance-list.tsx#L30))
- `TeamMemberStatusRow` derives per-member status (holiday/weekend/on-leave/clocked-in/completed/not‑yet‑in), shows clock-in time, net minutes, role badge, and a status dot/badge. The status is derived by sorting work bookings and checking the last booking direction. ([apps/web/src/components/team-overview/team-member-status-row.tsx:62](https://github.com/impactj90/terp/blob/7ddef55cbf552d5aaf9b32585268ebc7d8f2fde0/apps/web/src/components/team-overview/team-member-status-row.tsx#L62))
- Team attendance and status labels are defined in the `teamOverview` i18n bundle. ([apps/web/messages/en.json:679](https://github.com/impactj90/terp/blob/7ddef55cbf552d5aaf9b32585268ebc7d8f2fde0/apps/web/messages/en.json#L679))

### Team stats cards (present, hours this week, absences, issues)
- `TeamStatsCards` computes Present Today / Absences Today / Issues from day views and fetches monthly daily breakdowns per member to sum net and target minutes for the current week. ([apps/web/src/components/team-overview/team-stats-cards.tsx:54](https://github.com/impactj90/terp/blob/7ddef55cbf552d5aaf9b32585268ebc7d8f2fde0/apps/web/src/components/team-overview/team-stats-cards.tsx#L54))
- Weekly totals use `GET /employees/{id}/months/{year}/{month}/days`, then filter the returned daily values to the current week. ([apps/web/src/components/team-overview/team-stats-cards.tsx:24](https://github.com/impactj90/terp/blob/7ddef55cbf552d5aaf9b32585268ebc7d8f2fde0/apps/web/src/components/team-overview/team-stats-cards.tsx#L24))

### Upcoming absences panel
- `TeamUpcomingAbsences` requests `/employees/{id}/absences` per team member for a 14‑day window and merges results into a single sorted list with badges. ([apps/web/src/components/team-overview/team-upcoming-absences.tsx:33](https://github.com/impactj90/terp/blob/7ddef55cbf552d5aaf9b32585268ebc7d8f2fde0/apps/web/src/components/team-overview/team-upcoming-absences.tsx#L33))

### Quick actions and related UI components
- `TeamQuickActions` currently links to `/admin/teams`, `/absences`, and `/timesheet` (no member-specific deep links). ([apps/web/src/components/team-overview/team-quick-actions.tsx:12](https://github.com/impactj90/terp/blob/7ddef55cbf552d5aaf9b32585268ebc7d8f2fde0/apps/web/src/components/team-overview/team-quick-actions.tsx#L12))
- A `DateRangePicker` and `Calendar` component exist for selecting ranges and highlighting absence/holiday dates, but are not used in the team overview page today. ([apps/web/src/components/ui/date-range-picker.tsx:15](https://github.com/impactj90/terp/blob/7ddef55cbf552d5aaf9b32585268ebc7d8f2fde0/apps/web/src/components/ui/date-range-picker.tsx#L15), [apps/web/src/components/ui/calendar.tsx:20](https://github.com/impactj90/terp/blob/7ddef55cbf552d5aaf9b32585268ebc7d8f2fde0/apps/web/src/components/ui/calendar.tsx#L20))
- A lightweight bar‑chart component (`FlextimeChart`) exists in year overview and could serve as a pattern for attendance/summary visualizations. ([apps/web/src/components/year-overview/flextime-chart.tsx:11](https://github.com/impactj90/terp/blob/7ddef55cbf552d5aaf9b32585268ebc7d8f2fde0/apps/web/src/components/year-overview/flextime-chart.tsx#L11))

### API endpoints and backend handlers
- Team endpoints are defined in OpenAPI under `/teams`, `/teams/{id}`, and `/teams/{id}/members`, with optional `include_members` for team detail responses. ([api/paths/teams.yaml:2](https://github.com/impactj90/terp/blob/7ddef55cbf552d5aaf9b32585268ebc7d8f2fde0/api/paths/teams.yaml#L2))
- The team HTTP handler (`TeamHandler`) implements list, get, get-with-members, and membership management in `apps/api/internal/handler/team.go`. ([apps/api/internal/handler/team.go:30](https://github.com/impactj90/terp/blob/7ddef55cbf552d5aaf9b32585268ebc7d8f2fde0/apps/api/internal/handler/team.go#L30))
- Employee day views are served by `BookingHandler.GetDayView`, which assembles bookings, daily values, day plan summaries, and holidays into a `DayView` response. ([apps/api/internal/handler/booking.go:363](https://github.com/impactj90/terp/blob/7ddef55cbf552d5aaf9b32585268ebc7d8f2fde0/apps/api/internal/handler/booking.go#L363))
- The day view endpoint and absences list endpoint are defined in `api/paths/employees.yaml`. ([api/paths/employees.yaml:330](https://github.com/impactj90/terp/blob/7ddef55cbf552d5aaf9b32585268ebc7d8f2fde0/api/paths/employees.yaml#L330))
- Monthly daily breakdowns used by the weekly aggregation are provided by `MonthlyEvalHandler.GetDailyBreakdown`. ([apps/api/internal/handler/monthlyeval.go:225](https://github.com/impactj90/terp/blob/7ddef55cbf552d5aaf9b32585268ebc7d8f2fde0/apps/api/internal/handler/monthlyeval.go#L225))

### Reporting / export capabilities
- A report generation and download API exists under `/reports`, with types including `absence_report`, `overtime_report`, and `employee_timesheet`. ([api/paths/reports.yaml:1](https://github.com/impactj90/terp/blob/7ddef55cbf552d5aaf9b32585268ebc7d8f2fde0/api/paths/reports.yaml#L1), [api/schemas/reports.yaml:2](https://github.com/impactj90/terp/blob/7ddef55cbf552d5aaf9b32585268ebc7d8f2fde0/api/schemas/reports.yaml#L2))
- Timesheet export buttons currently generate CSV/PDF from client-side data, but this export flow is tied to the timesheet view, not the team overview. ([apps/web/src/components/timesheet/export-buttons.tsx:19](https://github.com/impactj90/terp/blob/7ddef55cbf552d5aaf9b32585268ebc7d8f2fde0/apps/web/src/components/timesheet/export-buttons.tsx#L19))

## Code References
- `apps/web/src/app/[locale]/(dashboard)/team-overview/page.tsx:24` - Team overview page wiring, data fetching, and layout.
- `apps/web/src/hooks/api/use-team-day-views.ts:25` - Parallel per‑employee day view fetching with React Query.
- `apps/web/src/components/team-overview/team-attendance-list.tsx:30` - Attendance grouping logic for Present/On Leave/Not Yet In.
- `apps/web/src/components/team-overview/team-member-status-row.tsx:62` - Status determination logic and row UI.
- `apps/web/src/components/team-overview/team-stats-cards.tsx:54` - Stats calculation and weekly totals aggregation.
- `apps/web/src/components/team-overview/team-upcoming-absences.tsx:33` - Upcoming absences aggregation (next 14 days).
- `apps/web/src/components/team-overview/team-quick-actions.tsx:12` - Quick actions links.
- `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts:57` - Team overview route in sidebar.
- `api/paths/teams.yaml:2` - Team endpoints in OpenAPI.
- `api/paths/employees.yaml:330` - Day view and absences endpoints in OpenAPI.
- `apps/api/internal/handler/booking.go:363` - Day view backend response assembly.
- `apps/api/internal/handler/monthlyeval.go:225` - Monthly daily breakdown endpoint used for weekly stats.
- `api/paths/reports.yaml:1` - Report generation/download endpoints.
- `apps/web/src/components/ui/date-range-picker.tsx:15` - Date range picker component.
- `apps/web/src/components/year-overview/flextime-chart.tsx:11` - Existing lightweight chart pattern.

## Architecture Documentation
- Team overview relies on a fan‑out of per‑employee API calls: `/teams` to list teams, `/teams/{id}?include_members=true` to get members, `/employees/{id}/day/{date}` for today’s status, and `/employees/{id}/absences` for upcoming time off. The weekly hours card uses `/employees/{id}/months/{year}/{month}/days` and filters to the current week on the client. These queries are orchestrated on the client with React Query and short stale times to approximate live updates.

## Historical Context (from thoughts/)
- `thoughts/shared/research/2026-01-27-NOK-236-team-overview-dashboard.md` - Previous research/plan documenting the initial Team Overview dashboard implementation and API usage.

## Related Research
- `thoughts/shared/research/2026-01-27-NOK-236-team-overview-dashboard.md`

## Open Questions
- None identified from the current code structure; team-level aggregation, filtering, and export behaviors would depend on intended product requirements and API strategy.
