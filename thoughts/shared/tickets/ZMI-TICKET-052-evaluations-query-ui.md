# ZMI-TICKET-052: Evaluations Query UI

Status: Proposed
Priority: P2
Owner: TBD
Backend tickets: ZMI-TICKET-019

## Goal
Provide a multi-tab evaluation dashboard for querying daily values, bookings, terminal bookings, change logs, and workflow history with shared and tab-specific filters.

## Scope
- In scope: Five-tab evaluation page, shared date/employee/department filters, tab-specific filters, paginated data tables, time formatting.
- Out of scope: Data editing (read-only views), report generation from evaluations (use ZMI-TICKET-051), chart/graph visualizations.

## Requirements

### Pages & routes
- **New page**: `apps/web/src/app/[locale]/(dashboard)/admin/evaluations/page.tsx`
  - Route: `/admin/evaluations`
  - Five tabs: Daily Values, Bookings, Terminal Bookings, Logs, Workflow History

### Components
- `apps/web/src/components/evaluations/evaluations-shared-filters.tsx`
  - Shared filters above tabs (apply to all tabs):
    - Date range picker (from/to, required)
    - Employee selector (optional)
    - Department selector (optional)
  - Stored in URL search params for bookmarkability
- `apps/web/src/components/evaluations/daily-values-tab.tsx`
  - Table columns: Date, Employee, Status (badge), Target (HH:MM), Gross (HH:MM), Net (HH:MM), Break (HH:MM), Overtime (HH:MM), Balance (HH:MM), First Come, Last Go, Bookings, Errors
  - Tab-specific filters: has_errors toggle, include_no_bookings toggle
  - Status badges: pending=outline, calculated=secondary, error=destructive, approved=green, no_data=muted
  - Error indicator: red dot for has_errors=true
  - Pagination: page-based (limit/page)
- `apps/web/src/components/evaluations/bookings-tab.tsx`
  - Table columns: Date, Employee, Time (HH:MM), Booking Type, Source (badge), Direction, Notes, Created At
  - Tab-specific filters: booking_type_id select, source select (web|terminal|api|import|correction), direction select (in|out)
  - Source badges with colors: web=blue, terminal=orange, api=purple, import=green, correction=yellow
  - Pagination: page-based
- `apps/web/src/components/evaluations/terminal-bookings-tab.tsx`
  - Table columns: Date, Employee, Original Time (HH:MM), Edited Time (HH:MM), Was Edited (badge), Booking Type, Terminal ID, Source, Created At
  - Was Edited highlighted: when original_time != edited_time, show yellow "Edited" badge and display both times
  - No tab-specific filters beyond shared
  - Pagination: page-based
- `apps/web/src/components/evaluations/logs-tab.tsx`
  - Table columns: Timestamp, User, Action (badge), Entity Type, Entity Name, Changes
  - Tab-specific filters: entity_type select, action select, user_id select
  - Action badges: create=green, update=blue, delete=red, approve=green, reject=red, close=purple, reopen=orange
  - Changes column: truncated preview, click to expand in detail sheet
- `apps/web/src/components/evaluations/workflow-history-tab.tsx`
  - Table columns: Timestamp, User, Action (badge), Entity Type, Entity Name, Metadata
  - Tab-specific filters: entity_type select (absence|monthly_value), action select (create|approve|reject|close|reopen)
  - Action badges same as logs tab
- `apps/web/src/components/evaluations/evaluation-log-detail-sheet.tsx`
  - Detail sheet for log entries and workflow entries
  - Shows: full timestamp, user info, action, entity type/ID/name
  - For log entries: before/after JSON diff view (side-by-side or inline diff)
  - For workflow entries: metadata display
- `apps/web/src/components/evaluations/evaluations-skeleton.tsx`

### API hooks
- `apps/web/src/hooks/api/use-evaluations.ts`
  - `useEvaluationDailyValues(params)` — GET `/evaluations/daily-values` with params: `from`, `to`, `employee_id`, `department_id`, `include_no_bookings`, `has_errors`, `limit`, `page`
  - `useEvaluationBookings(params)` — GET `/evaluations/bookings` with params: `from`, `to`, `employee_id`, `department_id`, `booking_type_id`, `source`, `direction`, `limit`, `page`
  - `useEvaluationTerminalBookings(params)` — GET `/evaluations/terminal-bookings` with params: `from`, `to`, `employee_id`, `department_id`, `limit`, `page`
  - `useEvaluationLogs(params)` — GET `/evaluations/logs` with params: `from`, `to`, `employee_id`, `department_id`, `entity_type`, `action`, `user_id`, `limit`, `page`
  - `useEvaluationWorkflowHistory(params)` — GET `/evaluations/workflow-history` with params: `from`, `to`, `employee_id`, `department_id`, `entity_type`, `action`, `limit`, `page`

### UI behavior
- Shared filter state: changing date range/employee/department triggers refetch on the active tab only
- Tab switching: preserves shared filters, resets tab-specific filters, triggers fetch for new tab
- All time values in minutes → displayed as HH:MM
- Pagination: page-based with page number and total results from meta
- JSON diff view in log detail: color-coded before (red) / after (green) values
- URL state: shared filters (from, to, employee_id, department_id) + active tab stored in URL for bookmarkability
- Empty states per tab: "No daily values found for the selected period"
- Large date ranges warning: if range > 90 days, show info banner "Large date range may take longer to load"

### Navigation & translations
- Sidebar entry in "Management" section: `{ titleKey: 'nav.evaluations', href: '/admin/evaluations', icon: BarChart3, roles: ['admin'] }`
- Breadcrumb segment: `'evaluations': 'evaluations'` in segmentToKey mapping
- Translation namespace: `evaluations`
  - Key groups: `page.*`, `tabs.*`, `filters.*`, `daily-values.*`, `bookings.*`, `terminal-bookings.*`, `logs.*`, `workflow.*`, `detail.*`, `empty.*`

## Acceptance criteria
- Five-tab evaluation dashboard loads with shared date range and entity filters
- Daily values tab shows time data with HH:MM formatting and error indicators
- Bookings tab shows booking details with source/direction filters
- Terminal bookings tab highlights edited bookings
- Logs tab shows change history with JSON diff view
- Workflow history tab shows approval/workflow actions
- Shared filters persist across tab switches
- URL state enables bookmarkable queries
- Pagination works correctly on all tabs

## Tests

### Component tests
- Shared filters update URL params
- Tab switching preserves shared filters
- Daily values table formats minutes to HH:MM
- Bookings source badges display correct colors
- Terminal bookings highlight edited entries
- Log detail sheet shows before/after diff
- Pagination controls navigate correctly

### Integration tests
- Load daily values for date range, verify data
- Filter bookings by source=terminal, verify filtered results
- View log entry detail with changes, verify diff display
- Switch between tabs, verify shared filters preserved
- Navigate pages in evaluation results

## Test case pack
1) Daily values with errors
   - Input: Date range with known errors, toggle has_errors=true
   - Expected: Only rows with has_errors=true shown, error badge visible
2) Bookings by source
   - Input: Filter source=web
   - Expected: Only web-source bookings shown
3) Terminal booking edits
   - Input: View terminal bookings tab
   - Expected: Edited bookings show yellow "Edited" badge with both original and edited times
4) Log entry diff
   - Input: Click log entry with changes
   - Expected: Detail sheet shows before/after values color-coded
5) Workflow history
   - Input: Filter entity_type=absence, action=approve
   - Expected: Only absence approval entries shown

## Dependencies
- ZMI-TICKET-019 (Evaluations Query Module backend)
- Departments API (for shared filter)
- Employees API (for shared filter)
- Booking Types API (for bookings tab filter)
- Users API (for logs tab user filter)
