# Team Dashboard Enhancements Implementation Plan

## Overview

Extend the existing Team Overview dashboard to support date-range filtering, richer attendance status grouping, overtime/undertime summaries, an upcoming-absences calendar, attendance pattern visualization, and export/quick-action improvements for managers.

## Current State Analysis

- The Team Overview page already exists at `/team-overview` with a team selector, stats cards (present today, team hours this week, absences today, issues), attendance list grouped by status, upcoming absences list, and quick actions. (`apps/web/src/app/[locale]/(dashboard)/team-overview/page.tsx:24`)
- Attendance status is derived from per-employee day views (`GET /employees/{id}/day/{date}`) via `useTeamDayViews`. (`apps/web/src/hooks/api/use-team-day-views.ts:25`)
- Weekly hours are aggregated client-side by fetching each member’s monthly daily breakdown (`GET /employees/{id}/months/{year}/{month}/days`) and filtering to the current week. (`apps/web/src/components/team-overview/team-stats-cards.tsx:24`)
- Upcoming absences are fetched per member for a fixed 14‑day window. (`apps/web/src/components/team-overview/team-upcoming-absences.tsx:33`)
- There is no team-level aggregation API, no date-range filtering on the team overview, and no export action in the team overview.

## Desired End State

- Managers can select a date range that drives team summaries, attendance patterns, and absence views.
- Attendance list shows grouped “In”, “Out”, “On Leave”, and “Not Yet In” (or equivalent) with clear status badges and optional per-member expansion.
- Team summary shows total hours for the selected range, average overtime/undertime per person, and absence totals.
- Upcoming absences display includes a mini calendar with highlighted absence days plus a list of upcoming absences.
- Attendance pattern visualization exists (e.g., a simple bar/heatmap chart) to show team presence over time.
- Export action generates a team report (CSV at minimum) for the selected range.
- Quick actions include view timesheet and add absence.
- Status updates refresh periodically (near real-time) without manual refresh.

### Key Discoveries
- Team overview page and components already exist; extend these rather than creating a new route. (`apps/web/src/app/[locale]/(dashboard)/team-overview/page.tsx:24`)
- Day view data and status are derived from bookings + daily value flags; no single team endpoint exists. (`apps/api/internal/handler/booking.go:363`, `api/paths/employees.yaml:330`)
- Date range picker and calendar components exist and can highlight absence/holiday dates. (`apps/web/src/components/ui/date-range-picker.tsx:15`, `apps/web/src/components/ui/calendar.tsx:20`)
- A lightweight chart pattern exists (`FlextimeChart`) that can be adapted for attendance visualization. (`apps/web/src/components/year-overview/flextime-chart.tsx:11`)
- Report generation API exists (`/reports`), but team overview currently does not use it. (`api/paths/reports.yaml:1`)

## What We’re NOT Doing

- Building a new backend “team summary” aggregate endpoint.
- Implementing websockets or push-based real-time updates (use polling instead).
- Creating new report types server-side; export will be client-side CSV initially.
- Adding scheduling/expected-time logic (e.g., “Expected 09:00”) beyond what day views provide.

## Implementation Approach

- Add a date range state to the team overview and reuse the existing `DateRangePicker` component.
- Introduce new hooks to fetch daily values per team member for a selected range using `/daily-values?employee_id=...&from=...&to=...` or existing monthly breakdown (range-driven). Aggregate totals client-side.
- Expand the team overview UI with new cards and visualization components (overtime/undertime summary, attendance pattern chart, absence calendar).
- Update attendance grouping to separate “In” vs “Out”, and add optional row expansion for more details.
- Implement client-side CSV export using the same pattern as timesheet exports.
- Add i18n keys for new labels.

## Phase 1: Data Model and Query Layer

### Overview
Introduce date range state and data-fetch hooks needed for range-based metrics, overtime/undertime summaries, and attendance pattern data.

### Changes Required

#### 1) Team Overview page state
**File**: `apps/web/src/app/[locale]/(dashboard)/team-overview/page.tsx`
**Changes**:
- Add date range state (default to current week).
- Derive an “attendance date” from the range (e.g., range end) for day-view fetching.
- Pass range to stats and absence components.

```tsx
const [range, setRange] = useState<DateRange>({ from: weekStart, to: weekEnd })
const attendanceDate = formatDate(range?.to ?? range?.from ?? new Date())
```

#### 2) Range-based daily values hook
**File**: `apps/web/src/hooks/api/use-team-daily-values.ts` (new)
**Changes**:
- Use `api.GET('/daily-values')` with `employee_id`, `from`, and `to`.
- Provide helper to aggregate totals (net, target, overtime, undertime, absence counts) across members.

```ts
const { data } = await api.GET('/daily-values', {
  params: { query: { employee_id: id, from, to } },
})
```

#### 3) Day view polling
**File**: `apps/web/src/hooks/api/use-team-day-views.ts`
**Changes**:
- Add optional `refetchInterval`/`refetchIntervalInBackground` support to refresh statuses periodically.

### Success Criteria

#### Automated Verification
- [ ] Typecheck passes: `npm run typecheck` (from `apps/web` if applicable)
- [x] Lint passes: `npm run lint` (from `apps/web` if applicable)

#### Manual Verification
- [ ] Team overview date range selector appears and updates page state.
- [ ] Attendance status refreshes automatically at the chosen polling interval.

**Implementation Note**: After completing this phase and automated checks, pause for manual confirmation before continuing.

---

## Phase 2: Attendance Grouping and Detail Expansion

### Overview
Refine attendance grouping to distinguish “In” vs “Out” and add expandable member rows for details.

### Changes Required

#### 1) Attendance grouping
**File**: `apps/web/src/components/team-overview/team-attendance-list.tsx`
**Changes**:
- Replace `present` with `in` / `out` groups based on last booking direction.
- Use the `date` prop to display a header date (e.g., “Attendance – Jan 25”).

#### 2) Member row expansion
**File**: `apps/web/src/components/team-overview/team-member-status-row.tsx`
**Changes**:
- Add local expanded state and a toggle.
- Render additional details (first in / last out / overtime / undertime) using `dayView.daily_value` and bookings.

### Success Criteria

#### Automated Verification
- [ ] Typecheck passes: `npm run typecheck`
- [x] Lint passes: `npm run lint`

#### Manual Verification
- [ ] Attendance list groups members into In, Out, On Leave, Not Yet In.
- [ ] Clicking a member expands/collapses detail rows.

**Implementation Note**: After completing this phase and automated checks, pause for manual confirmation before continuing.

---

## Phase 3: Team Metrics, Absence Calendar, and Visualization

### Overview
Add overtime/undertime summaries, attendance pattern visualization, and a calendar-style absence view.

### Changes Required

#### 1) Overtime/Undertime summary cards
**File**: `apps/web/src/components/team-overview/team-stats-cards.tsx`
**Changes**:
- Extend or add cards for total overtime, total undertime, and average overtime per member (based on range data).
- Wire to range-based aggregation from Phase 1.

#### 2) Attendance pattern visualization
**File**: `apps/web/src/components/team-overview/team-attendance-pattern.tsx` (new)
**Changes**:
- Create a lightweight bar/heatmap chart using the `FlextimeChart` pattern.
- Input: per-day present counts or total net minutes over the selected range.

#### 3) Upcoming absences calendar
**File**: `apps/web/src/components/team-overview/team-upcoming-absences.tsx`
**Changes**:
- Add a mini calendar view highlighting absence dates (using `Calendar`).
- Keep the list view for the next N absences.
- Use the selected range for date highlights (or a configurable future window).

### Success Criteria

#### Automated Verification
- [ ] Typecheck passes: `npm run typecheck`
- [x] Lint passes: `npm run lint`

#### Manual Verification
- [ ] Overtime/undertime summary cards show correct totals for the selected range.
- [ ] Attendance pattern visualization renders and updates with range changes.
- [ ] Absence calendar highlights correct dates and list matches highlighted days.

**Implementation Note**: After completing this phase and automated checks, pause for manual confirmation before continuing.

---

## Phase 4: Export and Quick Actions

### Overview
Provide a team report export (CSV) and update quick actions to include “Add absence.”

### Changes Required

#### 1) Team report export
**File**: `apps/web/src/components/team-overview/team-export-buttons.tsx` (new)
**Changes**:
- Generate a CSV containing per-member totals (net, target, overtime, undertime, absences) for the selected range.
- Reuse the `ExportButtons` pattern from timesheet (CSV only initially).

#### 2) Quick actions update
**File**: `apps/web/src/components/team-overview/team-quick-actions.tsx`
**Changes**:
- Add a button linking to `/absences/new`.
- Keep “View Timesheets” and “Manage Teams/Absences”.

### Success Criteria

#### Automated Verification
- [ ] Typecheck passes: `npm run typecheck`
- [x] Lint passes: `npm run lint`

#### Manual Verification
- [ ] CSV export downloads with correct headers and data for the selected range.
- [ ] “Add absence” quick action navigates to the new absence form.

---

## Testing Strategy

### Unit Tests
- Utility functions for range aggregation (net/target/overtime/undertime totals).
- Attendance grouping logic (in/out/on leave/not-yet-in).

### Integration Tests
- None required unless an existing test harness exists for dashboard pages.

### Manual Testing Steps
1. Navigate to `/team-overview`, select a team, and verify the attendance groups and counts.
2. Change the date range and confirm stats/visualization update.
3. Verify absences calendar highlights align with list entries.
4. Trigger CSV export and validate contents.
5. Wait for status polling to update a member’s clock-in state after a new booking.

## Performance Considerations

- Range-based aggregation uses N per-member calls; keep default range short (week) and consider batching in UI to avoid excessive load.
- Use `staleTime` and `refetchInterval` to reduce unnecessary requests.

## Migration Notes

- No database migrations required.

## References

- Research: `thoughts/shared/research/2026-01-28-team-dashboard-overview.md`
- Team overview page: `apps/web/src/app/[locale]/(dashboard)/team-overview/page.tsx:24`
- Day view endpoint: `api/paths/employees.yaml:330`
