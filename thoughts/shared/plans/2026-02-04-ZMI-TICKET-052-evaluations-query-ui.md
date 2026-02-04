# ZMI-TICKET-052: Evaluations Query UI - Implementation Plan

## Overview

Build a five-tab evaluation dashboard at `/admin/evaluations` that provides read-only querying of daily values, bookings, terminal bookings, change logs, and workflow history. The backend endpoints (ZMI-TICKET-019) are fully implemented. This ticket covers the frontend: API hooks, shared/tab-specific filters with URL state, paginated data tables with time formatting, badge-based status indicators, and a detail sheet for log/workflow entries.

## Current State Analysis

### Backend: Fully Implemented
- Five `GET /evaluations/*` endpoints registered in `apps/api/internal/handler/routes.go` (line ~1038)
- Handler: `apps/api/internal/handler/evaluation.go`
- Service: `apps/api/internal/service/evaluation.go`
- OpenAPI spec: `api/paths/evaluations.yaml` + `api/schemas/evaluations.yaml`
- TypeScript types already generated in `apps/web/src/lib/api/types.ts`

### Frontend: Nothing Exists
- No evaluations page, components, hooks, or translations
- No sidebar or breadcrumb entry for evaluations

### Key Discoveries:
- Correction Assistant page (`apps/web/src/app/[locale]/(dashboard)/admin/correction-assistant/page.tsx`) is the closest reference: tabs + pagination + filters + detail sheet
- All existing tabbed pages use `React.useState` for tab state (no URL sync)
- No existing pages use URL search params for filter state; this ticket introduces URL-synced filters as a new pattern
- Skeleton components follow a consistent inline function pattern per page/table
- Data tables are built manually with shadcn Table components (no TanStack Table abstraction)
- API hooks use `useApiQuery` wrapper from `apps/web/src/hooks/use-api-query.ts`
- Badge component at `apps/web/src/components/ui/badge.tsx` with colored outline variants
- Time values stored in minutes, displayed via `formatMinutes`, `formatTime`, `formatBalance` from `apps/web/src/lib/time-utils.ts`
- All schema fields for `first_come`/`last_go` are strings ("HH:MM" or null), not minutes-from-midnight integers
- Barrel exports used for component directories (e.g., `apps/web/src/components/reports/index.ts`)
- `useEmployees` (for employee filter) and `useDepartments` (for department filter) hooks already exist in `apps/web/src/hooks/api/`
- `useBookingTypes` and `useUsers` hooks also exist for tab-specific filter dropdowns

## Desired End State

A fully functional five-tab evaluation page accessible from the sidebar at `/admin/evaluations`:

1. **Daily Values tab** - Table with time formatting (HH:MM), status badges, error indicators, `has_errors` toggle, `include_no_bookings` toggle
2. **Bookings tab** - Table with source/direction badges, booking type name, time formatting
3. **Terminal Bookings tab** - Table highlighting edited bookings with yellow "Edited" badge
4. **Logs tab** - Table with action badges, truncated changes preview, click-to-expand detail sheet with JSON diff
5. **Workflow History tab** - Table with action badges, entity info, metadata display in detail sheet

All tabs share date range, employee, and department filters stored in URL search params. Pagination works independently per tab. Tab state is also URL-synced.

### Verification:
- Navigate to `/admin/evaluations` from sidebar
- Each tab loads data with correct formatting
- Shared filters update URL and persist across tab switches
- Tab-specific filters reset when switching tabs
- Pagination works on all tabs
- Detail sheet opens for log/workflow entries
- URL is bookmarkable (shared filters + active tab in URL)

## What We're NOT Doing

- Data editing (all views are read-only)
- Report generation from evaluations (that is ZMI-TICKET-051)
- Chart/graph visualizations
- Export functionality
- Component tests or integration tests (the ticket lists them as desired but they are not in scope for this implementation phase)
- Employee search/autocomplete (the employee filter uses a simple select dropdown from `useEmployees`)

## Implementation Approach

Build in four phases:
1. **Foundation** - API hooks, translations, navigation wiring, skeleton, shared filter component
2. **Core tabs** - Daily Values and Bookings tabs (the two most data-rich tabs)
3. **Remaining tabs** - Terminal Bookings, Logs, Workflow History tabs
4. **Detail sheet and polish** - Log/workflow detail sheet, large date range warning, final integration

Each phase produces working, verifiable output. The main page component grows incrementally as tabs are added.

---

## Phase 1: Foundation (API Hooks, Navigation, Translations, Skeleton, Shared Filters)

### Overview
Create the API hooks, translation keys, navigation entry, skeleton, shared filter component, and a minimal page shell with tab structure. After this phase, the page loads at `/admin/evaluations` with a tab bar, shared filters, and empty tab content areas.

### Changes Required:

#### 1. API Hooks
**File**: `apps/web/src/hooks/api/use-evaluations.ts` (NEW)

Create five query hooks following the `useReports` pattern from `apps/web/src/hooks/api/use-reports.ts`:

```tsx
import { useApiQuery } from '@/hooks'

interface UseEvaluationDailyValuesOptions {
  from?: string
  to?: string
  employee_id?: string
  department_id?: string
  include_no_bookings?: boolean
  has_errors?: boolean
  limit?: number
  page?: number
  enabled?: boolean
}

export function useEvaluationDailyValues(options: UseEvaluationDailyValuesOptions = {}) {
  const { from, to, employee_id, department_id, include_no_bookings, has_errors, limit, page, enabled = true } = options
  return useApiQuery('/evaluations/daily-values', {
    params: { from, to, employee_id, department_id, include_no_bookings, has_errors, limit, page },
    enabled: enabled && !!from && !!to,
  })
}

// Similarly for:
// useEvaluationBookings - with booking_type_id, source, direction params
// useEvaluationTerminalBookings - shared params only
// useEvaluationLogs - with entity_type, action, user_id params
// useEvaluationWorkflowHistory - with entity_type, action params
```

Each hook should:
- Accept all query parameters matching the OpenAPI spec
- Set `enabled` to false when `from`/`to` are missing (both are required)
- Follow the exact `useApiQuery` pattern from `use-reports.ts`

#### 2. Barrel Export for Hooks
**File**: `apps/web/src/hooks/api/index.ts` (MODIFY)

Add at the end:
```tsx
// Evaluations
export {
  useEvaluationDailyValues,
  useEvaluationBookings,
  useEvaluationTerminalBookings,
  useEvaluationLogs,
  useEvaluationWorkflowHistory,
} from './use-evaluations'
```

#### 3. Navigation Sidebar
**File**: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` (MODIFY)

Add `BarChart3` to the lucide-react import. Add evaluations item to the `management` section after the `correctionAssistant` entry (around line 203):

```tsx
{
  titleKey: 'evaluations',
  href: '/admin/evaluations',
  icon: BarChart3,
  roles: ['admin'],
},
```

#### 4. Breadcrumbs
**File**: `apps/web/src/components/layout/breadcrumbs.tsx` (MODIFY)

Add to `segmentToKey` mapping (around line 51, after `'correction-assistant': 'correctionAssistant'`):
```tsx
evaluations: 'evaluations',
```

#### 5. Translations - English
**File**: `apps/web/messages/en.json` (MODIFY)

Add to the `nav` object:
```json
"evaluations": "Evaluations"
```

Add to the `breadcrumbs` object:
```json
"evaluations": "Evaluations"
```

Add new top-level `evaluations` namespace:
```json
"evaluations": {
  "page": {
    "title": "Evaluations",
    "subtitle": "Query daily values, bookings, terminal bookings, change logs, and workflow history"
  },
  "tabs": {
    "dailyValues": "Daily Values",
    "bookings": "Bookings",
    "terminalBookings": "Terminal Bookings",
    "logs": "Logs",
    "workflowHistory": "Workflow History"
  },
  "filters": {
    "dateRange": "Date Range",
    "employee": "Employee",
    "allEmployees": "All Employees",
    "department": "Department",
    "allDepartments": "All Departments",
    "clearFilters": "Clear filters",
    "hasErrors": "Errors only",
    "includeNoBookings": "Include days without bookings",
    "bookingType": "Booking Type",
    "allBookingTypes": "All Booking Types",
    "source": "Source",
    "allSources": "All Sources",
    "direction": "Direction",
    "allDirections": "All Directions",
    "directionIn": "In",
    "directionOut": "Out",
    "entityType": "Entity Type",
    "allEntityTypes": "All Entity Types",
    "action": "Action",
    "allActions": "All Actions",
    "user": "User",
    "allUsers": "All Users"
  },
  "sources": {
    "web": "Web",
    "terminal": "Terminal",
    "api": "API",
    "import": "Import",
    "correction": "Correction"
  },
  "actions": {
    "create": "Create",
    "update": "Update",
    "delete": "Delete",
    "approve": "Approve",
    "reject": "Reject",
    "close": "Close",
    "reopen": "Reopen"
  },
  "entityTypes": {
    "booking": "Booking",
    "absence": "Absence",
    "monthly_value": "Monthly Value",
    "daily_value": "Daily Value"
  },
  "status": {
    "pending": "Pending",
    "calculated": "Calculated",
    "error": "Error",
    "approved": "Approved",
    "no_data": "No Data"
  },
  "dailyValues": {
    "date": "Date",
    "employee": "Employee",
    "status": "Status",
    "target": "Target",
    "gross": "Gross",
    "net": "Net",
    "break": "Break",
    "overtime": "Overtime",
    "balance": "Balance",
    "firstCome": "First Come",
    "lastGo": "Last Go",
    "bookings": "Bookings",
    "errors": "Errors"
  },
  "bookings": {
    "date": "Date",
    "employee": "Employee",
    "time": "Time",
    "bookingType": "Booking Type",
    "source": "Source",
    "direction": "Direction",
    "notes": "Notes",
    "createdAt": "Created At"
  },
  "terminalBookings": {
    "date": "Date",
    "employee": "Employee",
    "originalTime": "Original Time",
    "editedTime": "Edited Time",
    "wasEdited": "Edited",
    "bookingType": "Booking Type",
    "terminalId": "Terminal ID",
    "source": "Source",
    "createdAt": "Created At",
    "editedBadge": "Edited"
  },
  "logs": {
    "timestamp": "Timestamp",
    "user": "User",
    "action": "Action",
    "entityType": "Entity Type",
    "entityName": "Entity Name",
    "changes": "Changes",
    "viewDetails": "View Details"
  },
  "workflow": {
    "timestamp": "Timestamp",
    "user": "User",
    "action": "Action",
    "entityType": "Entity Type",
    "entityName": "Entity Name",
    "metadata": "Metadata",
    "viewDetails": "View Details"
  },
  "detail": {
    "title": "Entry Details",
    "logTitle": "Change Log Details",
    "workflowTitle": "Workflow Entry Details",
    "timestamp": "Timestamp",
    "user": "User",
    "action": "Action",
    "entityType": "Entity Type",
    "entityId": "Entity ID",
    "entityName": "Entity Name",
    "changesSection": "Changes",
    "metadataSection": "Metadata",
    "before": "Before",
    "after": "After",
    "noChanges": "No changes recorded",
    "noMetadata": "No metadata",
    "close": "Close"
  },
  "empty": {
    "dailyValues": "No daily values found for the selected period",
    "bookings": "No bookings found for the selected period",
    "terminalBookings": "No terminal bookings found for the selected period",
    "logs": "No log entries found for the selected period",
    "workflow": "No workflow entries found for the selected period"
  },
  "count": {
    "items": "{count} results",
    "item": "{count} result"
  },
  "warnings": {
    "largeDateRange": "Large date range selected (over 90 days). Loading may take longer."
  }
}
```

#### 6. Translations - German
**File**: `apps/web/messages/de.json` (MODIFY)

Add equivalent German translations following the same structure. Add `"evaluations": "Auswertungen"` to both `nav` and `breadcrumbs` objects.

Add new top-level `evaluations` namespace with German translations:
```json
"evaluations": {
  "page": {
    "title": "Auswertungen",
    "subtitle": "Tageswerte, Buchungen, Terminal-Buchungen, Protokolle und Workflow-Verlauf abfragen"
  },
  "tabs": {
    "dailyValues": "Tageswerte",
    "bookings": "Buchungen",
    "terminalBookings": "Terminal-Buchungen",
    "logs": "Protokoll",
    "workflowHistory": "Workflow-Verlauf"
  },
  "filters": {
    "dateRange": "Zeitraum",
    "employee": "Mitarbeiter",
    "allEmployees": "Alle Mitarbeiter",
    "department": "Abteilung",
    "allDepartments": "Alle Abteilungen",
    "clearFilters": "Filter zurucksetzen",
    "hasErrors": "Nur Fehler",
    "includeNoBookings": "Tage ohne Buchungen anzeigen",
    "bookingType": "Buchungsart",
    "allBookingTypes": "Alle Buchungsarten",
    "source": "Quelle",
    "allSources": "Alle Quellen",
    "direction": "Richtung",
    "allDirections": "Alle Richtungen",
    "directionIn": "Kommen",
    "directionOut": "Gehen",
    "entityType": "Objekttyp",
    "allEntityTypes": "Alle Objekttypen",
    "action": "Aktion",
    "allActions": "Alle Aktionen",
    "user": "Benutzer",
    "allUsers": "Alle Benutzer"
  },
  "sources": {
    "web": "Web",
    "terminal": "Terminal",
    "api": "API",
    "import": "Import",
    "correction": "Korrektur"
  },
  "actions": {
    "create": "Erstellen",
    "update": "Aktualisieren",
    "delete": "Loschen",
    "approve": "Genehmigen",
    "reject": "Ablehnen",
    "close": "Abschliessen",
    "reopen": "Wiederoffnen"
  },
  "entityTypes": {
    "booking": "Buchung",
    "absence": "Abwesenheit",
    "monthly_value": "Monatswert",
    "daily_value": "Tageswert"
  },
  "status": {
    "pending": "Ausstehend",
    "calculated": "Berechnet",
    "error": "Fehler",
    "approved": "Genehmigt",
    "no_data": "Keine Daten"
  },
  "dailyValues": {
    "date": "Datum",
    "employee": "Mitarbeiter",
    "status": "Status",
    "target": "Soll",
    "gross": "Brutto",
    "net": "Netto",
    "break": "Pause",
    "overtime": "Uberstunden",
    "balance": "Saldo",
    "firstCome": "Erster Kommt",
    "lastGo": "Letzter Geht",
    "bookings": "Buchungen",
    "errors": "Fehler"
  },
  "bookings": {
    "date": "Datum",
    "employee": "Mitarbeiter",
    "time": "Zeit",
    "bookingType": "Buchungsart",
    "source": "Quelle",
    "direction": "Richtung",
    "notes": "Notizen",
    "createdAt": "Erstellt am"
  },
  "terminalBookings": {
    "date": "Datum",
    "employee": "Mitarbeiter",
    "originalTime": "Originalzeit",
    "editedTime": "Bearbeitete Zeit",
    "wasEdited": "Bearbeitet",
    "bookingType": "Buchungsart",
    "terminalId": "Terminal-ID",
    "source": "Quelle",
    "createdAt": "Erstellt am",
    "editedBadge": "Bearbeitet"
  },
  "logs": {
    "timestamp": "Zeitstempel",
    "user": "Benutzer",
    "action": "Aktion",
    "entityType": "Objekttyp",
    "entityName": "Objektname",
    "changes": "Anderungen",
    "viewDetails": "Details anzeigen"
  },
  "workflow": {
    "timestamp": "Zeitstempel",
    "user": "Benutzer",
    "action": "Aktion",
    "entityType": "Objekttyp",
    "entityName": "Objektname",
    "metadata": "Metadaten",
    "viewDetails": "Details anzeigen"
  },
  "detail": {
    "title": "Eintragsdetails",
    "logTitle": "Protokolldetails",
    "workflowTitle": "Workflow-Details",
    "timestamp": "Zeitstempel",
    "user": "Benutzer",
    "action": "Aktion",
    "entityType": "Objekttyp",
    "entityId": "Objekt-ID",
    "entityName": "Objektname",
    "changesSection": "Anderungen",
    "metadataSection": "Metadaten",
    "before": "Vorher",
    "after": "Nachher",
    "noChanges": "Keine Anderungen erfasst",
    "noMetadata": "Keine Metadaten",
    "close": "Schliessen"
  },
  "empty": {
    "dailyValues": "Keine Tageswerte fur den ausgewahlten Zeitraum gefunden",
    "bookings": "Keine Buchungen fur den ausgewahlten Zeitraum gefunden",
    "terminalBookings": "Keine Terminal-Buchungen fur den ausgewahlten Zeitraum gefunden",
    "logs": "Keine Protokolleintrage fur den ausgewahlten Zeitraum gefunden",
    "workflow": "Keine Workflow-Eintrage fur den ausgewahlten Zeitraum gefunden"
  },
  "count": {
    "items": "{count} Ergebnisse",
    "item": "{count} Ergebnis"
  },
  "warnings": {
    "largeDateRange": "Grosser Zeitraum ausgewahlt (uber 90 Tage). Das Laden kann langer dauern."
  }
}
```

#### 7. Skeleton Component
**File**: `apps/web/src/components/evaluations/evaluations-skeleton.tsx` (NEW)

Follow the pattern from `apps/web/src/components/correction-assistant/correction-assistant-skeleton.tsx`:

```tsx
import { Skeleton } from '@/components/ui/skeleton'

export function EvaluationsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
      </div>
      {/* Shared filters */}
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
      </div>
      {/* Tab bar */}
      <Skeleton className="h-9 w-[500px]" />
      {/* Table area */}
      <Skeleton className="h-[500px]" />
    </div>
  )
}
```

#### 8. Shared Filters Component
**File**: `apps/web/src/components/evaluations/evaluations-shared-filters.tsx` (NEW)

Follow the pattern from `apps/web/src/components/correction-assistant/correction-assistant-filters.tsx`. This component renders the date range picker, employee select, and department select. It receives filter values and change handlers as props. It does NOT manage URL state itself -- the parent page manages URL state and passes props down.

Props interface:
```tsx
interface EvaluationsSharedFiltersProps {
  dateRange: DateRange | undefined
  onDateRangeChange: (range: DateRange | undefined) => void
  employeeId: string | null
  onEmployeeChange: (id: string | null) => void
  departmentId: string | null
  onDepartmentChange: (id: string | null) => void
  employees: Array<{ id: string; name: string }>
  departments: Array<{ id: string; name: string }>
  isLoadingEmployees?: boolean
  isLoadingDepartments?: boolean
  onClearFilters: () => void
  hasFilters: boolean
}
```

Layout: `grid gap-4 md:grid-cols-3 lg:grid-cols-4 md:items-end` with a clear filters button.

#### 9. Barrel Export
**File**: `apps/web/src/components/evaluations/index.ts` (NEW)

```tsx
export { EvaluationsSkeleton } from './evaluations-skeleton'
export { EvaluationsSharedFilters } from './evaluations-shared-filters'
```

This barrel file will grow as we add more components in later phases.

#### 10. Page Shell
**File**: `apps/web/src/app/[locale]/(dashboard)/admin/evaluations/page.tsx` (NEW)

Create the page shell following the correction-assistant page pattern:
- `'use client'` directive
- Auth guard with `useAuth()` + `useHasRole(['admin'])` + redirect
- Skeleton during `authLoading`
- Page header (`h1` + `p` subtitle)
- URL state management using `useSearchParams` from `next/navigation` and `useRouter` for setting params
- Shared filters above tabs
- 5-tab Tabs component with empty `TabsContent` placeholders (content filled in later phases)
- Default date range: current month (1st of month to last day of month)
- `useDepartments` and `useEmployees` hooks for filter dropdowns
- Large date range warning banner (> 90 days)

URL state management approach:
- Use `useSearchParams()` to read current params
- Use `router.replace()` with updated params to sync state to URL
- Track: `tab` (active tab), `from` (date), `to` (date), `employee_id`, `department_id`
- Parse from URL on mount, write back on change
- Use a helper function to build the URL param string

```tsx
// URL state pattern
const searchParams = useSearchParams()
const router = useRouter()
const pathname = usePathname()

// Read initial state from URL
const initialTab = searchParams.get('tab') || 'daily-values'
const initialFrom = searchParams.get('from')
const initialTo = searchParams.get('to')
// ...etc

// Update URL when state changes
const updateSearchParams = (updates: Record<string, string | null>) => {
  const params = new URLSearchParams(searchParams.toString())
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) {
      params.delete(key)
    } else {
      params.set(key, value)
    }
  }
  router.replace(`${pathname}?${params.toString()}`, { scroll: false })
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] Lint passes: `cd apps/web && npx next lint`
- [ ] Page loads without errors at `/admin/evaluations`
- [ ] All 5 evaluation hooks are exported from `apps/web/src/hooks/api/index.ts`

#### Manual Verification:
- [ ] "Evaluations" appears in the sidebar under "Management" section
- [ ] Clicking sidebar item navigates to `/admin/evaluations`
- [ ] Breadcrumbs show "Home > Admin > Evaluations"
- [ ] Page shows title, subtitle, shared filters (date range, employee, department), and 5 tab labels
- [ ] Skeleton loads during auth check
- [ ] Non-admin users are redirected to `/dashboard`
- [ ] Changing shared filters updates URL params
- [ ] Switching tabs updates `tab` param in URL

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Daily Values and Bookings Tabs

### Overview
Implement the two most data-rich tabs: Daily Values (with time formatting, status badges, error indicators) and Bookings (with source badges, direction, booking type). Both include tab-specific filters and pagination.

### Changes Required:

#### 1. Daily Values Tab
**File**: `apps/web/src/components/evaluations/daily-values-tab.tsx` (NEW)

Props:
```tsx
interface DailyValuesTabProps {
  from?: string
  to?: string
  employeeId?: string
  departmentId?: string
}
```

Implementation details:
- Internal state for `has_errors` (boolean toggle via Switch), `include_no_bookings` (boolean toggle via Switch), `page`, `limit`
- Reset page to 1 when any filter changes (shared or tab-specific)
- Call `useEvaluationDailyValues` with all params
- Data table with columns matching ticket spec:
  - Date: format as locale date from `item.date`
  - Employee: `item.employee?.first_name + ' ' + item.employee?.last_name`
  - Status: badge using status config (pending=outline/yellow, calculated=secondary, error=destructive, approved=green, no_data=muted/outline)
  - Target: `formatMinutes(item.target_minutes ?? 0)`
  - Gross: `formatMinutes(item.gross_minutes ?? 0)`
  - Net: `formatMinutes(item.net_minutes ?? 0)`
  - Break: `formatMinutes(item.break_minutes ?? 0)`
  - Overtime: `formatMinutes(item.overtime_minutes ?? 0)`
  - Balance: `formatBalance(item.balance_minutes ?? 0)` with color (green for positive, red for negative)
  - First Come: `item.first_come ?? '-'` (already a string "HH:MM" from API)
  - Last Go: `item.last_go ?? '-'` (already a string "HH:MM" from API)
  - Bookings: `item.booking_count ?? 0`
  - Errors: red dot indicator when `item.has_errors === true`
- Tab-specific filters row: two Switch components for `has_errors` and `include_no_bookings`
- Inline `DailyValuesDataTableSkeleton` function
- Empty state with `t('empty.dailyValues')` message
- Pagination component below table
- Result count text above table

Status badge config:
```tsx
const statusConfig = {
  pending: { variant: 'outline' as const, className: 'border-yellow-500 text-yellow-700' },
  calculated: { variant: 'secondary' as const, className: '' },
  error: { variant: 'destructive' as const, className: '' },
  approved: { variant: 'default' as const, className: 'bg-green-600 hover:bg-green-700' },
  no_data: { variant: 'outline' as const, className: 'text-muted-foreground' },
}
```

#### 2. Bookings Tab
**File**: `apps/web/src/components/evaluations/bookings-tab.tsx` (NEW)

Props:
```tsx
interface BookingsTabProps {
  from?: string
  to?: string
  employeeId?: string
  departmentId?: string
}
```

Implementation details:
- Internal state for `bookingTypeId`, `source`, `direction`, `page`, `limit`
- Use `useBookingTypes({ enabled })` to populate booking type dropdown
- Call `useEvaluationBookings` with all params
- Data table columns:
  - Date: format from `item.booking_date`
  - Employee: `item.employee?.first_name + ' ' + item.employee?.last_name`
  - Time: `item.time_string ?? formatTime(item.edited_time ?? 0)` (use time_string if available, fallback to formatTime)
  - Booking Type: `item.booking_type?.name ?? '-'`
  - Source: badge with colors (web=blue, terminal=orange, api=purple, import=green, correction=yellow)
  - Direction: text (use `t('filters.directionIn')` / `t('filters.directionOut')`)
  - Notes: truncated text, `item.notes ?? '-'`
  - Created At: formatted datetime
- Tab-specific filters row: booking type select, source select, direction select
- Skeleton, empty state, pagination

Source badge config:
```tsx
const sourceColorMap: Record<string, string> = {
  web: 'border-blue-500 text-blue-700',
  terminal: 'border-orange-500 text-orange-700',
  api: 'border-purple-500 text-purple-700',
  import: 'border-green-500 text-green-700',
  correction: 'border-yellow-500 text-yellow-700',
}
```

#### 3. Update Barrel Export
**File**: `apps/web/src/components/evaluations/index.ts` (MODIFY)

Add:
```tsx
export { DailyValuesTab } from './daily-values-tab'
export { BookingsTab } from './bookings-tab'
```

#### 4. Wire Into Page
**File**: `apps/web/src/app/[locale]/(dashboard)/admin/evaluations/page.tsx` (MODIFY)

Replace the placeholder `TabsContent` for `daily-values` and `bookings` with the actual tab components, passing shared filter values as props.

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] Lint passes: `cd apps/web && npx next lint`

#### Manual Verification:
- [ ] Daily Values tab shows data with correct HH:MM formatting for all time columns
- [ ] Daily Values status badges use correct colors per status
- [ ] Error indicator (red dot) shows for rows with `has_errors=true`
- [ ] `has_errors` toggle filters to only error rows
- [ ] `include_no_bookings` toggle includes placeholder rows
- [ ] Balance column shows +/- formatting with color
- [ ] Bookings tab shows data with source badges in correct colors
- [ ] Booking type filter dropdown populates from API
- [ ] Source and direction filters work correctly
- [ ] Pagination works on both tabs (page numbers, page size selector)
- [ ] Changing shared filters refreshes data on the active tab
- [ ] Tab-specific filters reset when switching away and back

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Terminal Bookings, Logs, and Workflow History Tabs

### Overview
Implement the three remaining tabs: Terminal Bookings (with edited highlighting), Logs (with action badges and truncated changes), and Workflow History (with action badges and metadata preview).

### Changes Required:

#### 1. Terminal Bookings Tab
**File**: `apps/web/src/components/evaluations/terminal-bookings-tab.tsx` (NEW)

Props:
```tsx
interface TerminalBookingsTabProps {
  from?: string
  to?: string
  employeeId?: string
  departmentId?: string
}
```

Implementation details:
- Internal state for `page`, `limit` only (no tab-specific filters)
- Call `useEvaluationTerminalBookings`
- Data table columns:
  - Date: from `item.booking_date`
  - Employee: `item.employee?.first_name + ' ' + item.employee?.last_name`
  - Original Time: `item.original_time_string ?? formatTime(item.original_time ?? 0)`
  - Edited Time: `item.edited_time_string ?? formatTime(item.edited_time ?? 0)`
  - Was Edited: yellow "Edited" badge when `item.was_edited === true`, otherwise '-'
  - Booking Type: `item.booking_type?.name ?? '-'`
  - Terminal ID: `item.terminal_id ?? '-'` (show truncated UUID)
  - Source: text `item.source`
  - Created At: formatted datetime
- Highlight row when edited: apply `bg-yellow-50` (or `dark:bg-yellow-950/20`) to `TableRow` when `item.was_edited`
- Skeleton, empty state, pagination

#### 2. Logs Tab
**File**: `apps/web/src/components/evaluations/logs-tab.tsx` (NEW)

Props:
```tsx
interface LogsTabProps {
  from?: string
  to?: string
  employeeId?: string
  departmentId?: string
  onViewDetail: (entry: components['schemas']['EvaluationLogEntry']) => void
}
```

Implementation details:
- Internal state for `entityType`, `action`, `userId`, `page`, `limit`
- Use `useUsers({ enabled })` to populate user dropdown
- Call `useEvaluationLogs`
- Data table columns:
  - Timestamp: formatted datetime from `item.performed_at`
  - User: `item.user?.name ?? '-'`
  - Action: badge with action colors (create=green, update=blue, delete=red, approve=green, reject=red, close=purple, reopen=orange)
  - Entity Type: translated entity type
  - Entity Name: `item.entity_name ?? '-'`
  - Changes: truncated JSON preview (first 80 chars), or "View Details" button
- Row click calls `onViewDetail(item)` to open the detail sheet
- Tab-specific filters: entity_type select, action select, user_id select
- Skeleton, empty state, pagination

Action badge config (shared between logs and workflow):
```tsx
const actionColorMap: Record<string, string> = {
  create: 'bg-green-600 hover:bg-green-700',
  update: 'border-blue-500 text-blue-700',
  delete: '',  // destructive variant
  approve: 'bg-green-600 hover:bg-green-700',
  reject: '',  // destructive variant
  close: 'border-purple-500 text-purple-700',
  reopen: 'border-orange-500 text-orange-700',
}
```

Use `variant: 'destructive'` for delete and reject; `variant: 'default'` for create and approve; `variant: 'outline'` for update, close, reopen.

#### 3. Workflow History Tab
**File**: `apps/web/src/components/evaluations/workflow-history-tab.tsx` (NEW)

Props:
```tsx
interface WorkflowHistoryTabProps {
  from?: string
  to?: string
  employeeId?: string
  departmentId?: string
  onViewDetail: (entry: components['schemas']['EvaluationWorkflowEntry']) => void
}
```

Implementation details:
- Internal state for `entityType`, `action`, `page`, `limit`
- Entity type options: `absence`, `monthly_value`
- Action options: `create`, `approve`, `reject`, `close`, `reopen`
- Call `useEvaluationWorkflowHistory`
- Data table columns:
  - Timestamp: formatted datetime from `item.performed_at`
  - User: `item.user?.name ?? '-'`
  - Action: badge (same config as logs tab)
  - Entity Type: translated entity type
  - Entity Name: `item.entity_name ?? '-'`
  - Metadata: truncated preview or "View Details" button
- Row click calls `onViewDetail(item)`
- Tab-specific filters: entity_type select (absence|monthly_value), action select
- Skeleton, empty state, pagination

#### 4. Update Barrel Export
**File**: `apps/web/src/components/evaluations/index.ts` (MODIFY)

Add:
```tsx
export { TerminalBookingsTab } from './terminal-bookings-tab'
export { LogsTab } from './logs-tab'
export { WorkflowHistoryTab } from './workflow-history-tab'
```

#### 5. Wire Into Page
**File**: `apps/web/src/app/[locale]/(dashboard)/admin/evaluations/page.tsx` (MODIFY)

- Replace placeholder `TabsContent` for `terminal-bookings`, `logs`, `workflow-history` with actual components
- Add state for selected log/workflow entry (for detail sheet)
- Pass `onViewDetail` handlers to Logs and Workflow tabs

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] Lint passes: `cd apps/web && npx next lint`

#### Manual Verification:
- [ ] Terminal Bookings tab displays data with original/edited times
- [ ] Edited bookings show yellow "Edited" badge and row highlighting
- [ ] Logs tab displays entries with colored action badges
- [ ] Log changes column shows truncated preview
- [ ] Clicking a log row triggers detail view (detail sheet built in Phase 4)
- [ ] Logs tab filters by entity type, action, and user
- [ ] Workflow tab displays entries with action badges
- [ ] Workflow tab filters by entity type and action
- [ ] Pagination works on all three new tabs
- [ ] Shared filters apply correctly to all tabs

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Detail Sheet and Polish

### Overview
Implement the shared detail sheet for log entries and workflow entries (with JSON diff view for logs and metadata display for workflow). Add the large date range warning banner. Final integration testing and polish.

### Changes Required:

#### 1. Detail Sheet Component
**File**: `apps/web/src/components/evaluations/evaluation-detail-sheet.tsx` (NEW)

Follow the pattern from `apps/web/src/components/reports/report-detail-sheet.tsx` and `apps/web/src/components/correction-assistant/correction-assistant-detail-sheet.tsx`.

This is a dual-purpose sheet that handles both log entries and workflow entries:

```tsx
interface EvaluationDetailSheetProps {
  logEntry: components['schemas']['EvaluationLogEntry'] | null
  workflowEntry: components['schemas']['EvaluationWorkflowEntry'] | null
  open: boolean
  onOpenChange: (open: boolean) => void
}
```

Implementation details:
- Determine type from which prop is non-null
- Header: shows title based on entry type (log vs workflow)
- Common fields section: timestamp, user, action badge, entity type, entity ID, entity name
- For log entries: "Changes" section with before/after JSON diff view
  - Parse `changes` object (expects `{ before: Record<string, unknown>, after: Record<string, unknown> }` or arbitrary JSON)
  - Display as side-by-side or inline diff: green background for added/changed values, red for removed
  - Each changed field shown as a row: field name, before value (red), after value (green)
  - If changes is null/empty, show "No changes recorded" message
- For workflow entries: "Metadata" section
  - Display `metadata` object as formatted key-value pairs
  - If null/empty, show "No metadata" message
- Footer: Close button only (read-only views)

JSON diff rendering approach:
```tsx
function renderChanges(changes: Record<string, unknown> | null) {
  if (!changes) return <p>{t('detail.noChanges')}</p>

  // If changes has 'before' and 'after' keys, render as diff
  const before = (changes as { before?: Record<string, unknown> }).before
  const after = (changes as { after?: Record<string, unknown> }).after

  if (before && after) {
    // Collect all keys from both
    const allKeys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    return (
      <div className="space-y-1">
        {allKeys.map(key => {
          const oldVal = JSON.stringify(before[key] ?? null)
          const newVal = JSON.stringify(after[key] ?? null)
          if (oldVal === newVal) return null // unchanged
          return (
            <div key={key} className="text-sm font-mono">
              <span className="text-muted-foreground">{key}: </span>
              {before[key] !== undefined && (
                <span className="bg-red-100 text-red-800 px-1 rounded">{oldVal}</span>
              )}
              {' -> '}
              {after[key] !== undefined && (
                <span className="bg-green-100 text-green-800 px-1 rounded">{newVal}</span>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // Otherwise render as raw JSON
  return <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-64">{JSON.stringify(changes, null, 2)}</pre>
}
```

#### 2. Update Barrel Export
**File**: `apps/web/src/components/evaluations/index.ts` (MODIFY)

Add:
```tsx
export { EvaluationDetailSheet } from './evaluation-detail-sheet'
```

#### 3. Wire Detail Sheet into Page
**File**: `apps/web/src/app/[locale]/(dashboard)/admin/evaluations/page.tsx` (MODIFY)

- Add state: `selectedLogEntry` and `selectedWorkflowEntry`
- Render `EvaluationDetailSheet` with both states
- Pass handlers from Logs tab's `onViewDetail` to set `selectedLogEntry`
- Pass handlers from Workflow tab's `onViewDetail` to set `selectedWorkflowEntry`
- Add large date range warning: if date range > 90 days, show `Alert` with `AlertDescription` containing `t('warnings.largeDateRange')`

#### 4. Final Polish
- Ensure all tab-specific filters reset their `page` to 1 when filter values change
- Ensure tab-specific filters reset when switching tabs (clear internal state on tab change)
- Verify all empty states render correctly
- Ensure count text shows correctly above each tab's table

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] Lint passes: `cd apps/web && npx next lint`
- [ ] All new files are created in the correct locations
- [ ] Build succeeds: `cd apps/web && npx next build`

#### Manual Verification:
- [ ] Clicking a log entry opens the detail sheet with full entry info
- [ ] Log detail shows before/after diff with color coding (red for old, green for new)
- [ ] Clicking a workflow entry opens the detail sheet with metadata
- [ ] Detail sheet close button works
- [ ] Selecting a date range > 90 days shows the warning banner
- [ ] URL is fully bookmarkable: opening a shared URL restores tab, date range, employee, department filters
- [ ] All five tabs function correctly with real data
- [ ] Shared filters persist when switching between tabs
- [ ] Tab-specific filters reset when switching tabs
- [ ] No console errors or warnings
- [ ] Page works in both English and German locales

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests (future, not in scope):
- Shared filters update URL params correctly
- Tab switching preserves shared filter state
- Time formatting functions produce correct HH:MM output
- Badge configs return correct variants/classes per status

### Integration Tests (future, not in scope):
- Load daily values for date range, verify rendered table
- Filter bookings by source, verify filtered results
- View log entry detail, verify diff display
- Navigate between tabs, verify data loads per tab
- Pagination navigation

### Manual Testing Steps:
1. Navigate to `/admin/evaluations` via sidebar
2. Set a date range (e.g., last month)
3. Verify Daily Values tab shows time data in HH:MM format
4. Toggle "Errors only" filter, verify only error rows appear
5. Switch to Bookings tab, verify shared filters preserved
6. Filter by source=Terminal, verify filtered results
7. Switch to Terminal Bookings tab, verify edited bookings highlighted
8. Switch to Logs tab, click a log entry with changes, verify diff view
9. Filter logs by entity_type=booking, action=update
10. Switch to Workflow History tab, filter by entity_type=absence
11. Copy URL and open in new tab, verify all filters and tab restored
12. Switch language to German, verify all labels translated
13. Select a date range > 90 days, verify warning banner appears

## Performance Considerations

- Each tab independently manages its own query; only the active tab's query runs
- `enabled` flag on hooks prevents unnecessary fetches when shared filters are incomplete
- Pagination default limit is 50 (matching backend default)
- Consider keeping the default date range to current month to avoid overly large initial queries
- The large date range warning (> 90 days) alerts users before they trigger expensive queries

## File Summary

### New Files (11):
1. `apps/web/src/hooks/api/use-evaluations.ts`
2. `apps/web/src/components/evaluations/evaluations-skeleton.tsx`
3. `apps/web/src/components/evaluations/evaluations-shared-filters.tsx`
4. `apps/web/src/components/evaluations/daily-values-tab.tsx`
5. `apps/web/src/components/evaluations/bookings-tab.tsx`
6. `apps/web/src/components/evaluations/terminal-bookings-tab.tsx`
7. `apps/web/src/components/evaluations/logs-tab.tsx`
8. `apps/web/src/components/evaluations/workflow-history-tab.tsx`
9. `apps/web/src/components/evaluations/evaluation-detail-sheet.tsx`
10. `apps/web/src/components/evaluations/index.ts`
11. `apps/web/src/app/[locale]/(dashboard)/admin/evaluations/page.tsx`

### Modified Files (5):
1. `apps/web/src/hooks/api/index.ts` - Add evaluation hook exports
2. `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` - Add evaluations nav item + BarChart3 import
3. `apps/web/src/components/layout/breadcrumbs.tsx` - Add evaluations segment mapping
4. `apps/web/messages/en.json` - Add evaluations namespace + nav/breadcrumb keys
5. `apps/web/messages/de.json` - Add evaluations namespace + nav/breadcrumb keys

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-052-evaluations-query-ui.md`
- Research document: `thoughts/shared/research/2026-02-04-ZMI-TICKET-052-evaluations-query-ui.md`
- Closest reference page: `apps/web/src/app/[locale]/(dashboard)/admin/correction-assistant/page.tsx`
- Reports page (detail sheet pattern): `apps/web/src/app/[locale]/(dashboard)/admin/reports/page.tsx`
- Detail sheet pattern: `apps/web/src/components/reports/report-detail-sheet.tsx`
- Data table pattern: `apps/web/src/components/reports/report-data-table.tsx`
- Filter pattern: `apps/web/src/components/correction-assistant/correction-assistant-filters.tsx`
- API hook pattern: `apps/web/src/hooks/api/use-reports.ts`
- useApiQuery: `apps/web/src/hooks/use-api-query.ts`
- Time utilities: `apps/web/src/lib/time-utils.ts`
- OpenAPI spec: `api/paths/evaluations.yaml` + `api/schemas/evaluations.yaml`
- Sidebar config: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`
- Breadcrumbs: `apps/web/src/components/layout/breadcrumbs.tsx`
