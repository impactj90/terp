# Research: ZMI-TICKET-052 Evaluations Query UI

## 1. Frontend Architecture

### Page structure
Pages live at `apps/web/src/app/[locale]/(dashboard)/admin/<feature>/page.tsx` as Next.js App Router `'use client'` components. The dashboard layout wraps all admin pages.

### Existing admin pages (25+ pages)
All admin pages follow a consistent pattern:
- `'use client'` directive at top
- Auth guard: `useAuth()` + `useHasRole(['admin'])` with redirect to `/dashboard`
- Loading state: dedicated `PageSkeleton` component rendered during `authLoading`
- Page header: `h1` with title and `p` with subtitle from translations
- Content wrapped in `Card` > `CardContent className="p-0"`

### Multi-tab pages in the codebase
Three existing tabbed pages serve as direct patterns:

1. **Approvals page** (`/admin/approvals`): Two tabs (timesheets, absences)
   - File: `apps/web/src/app/[locale]/(dashboard)/admin/approvals/page.tsx`
   - Uses `useState` for `activeTab` (no URL sync)
   - Shared filters (team, date range, status) above tab content
   - Different data tables per tab

2. **Correction Assistant page** (`/admin/correction-assistant`): Two tabs (corrections, messages)
   - File: `apps/web/src/app/[locale]/(dashboard)/admin/correction-assistant/page.tsx`
   - Uses `useState` for `activeTab` (no URL sync)
   - Server-side pagination with `Pagination` component
   - Shared filters + tab-specific filters
   - Detail sheet for row click

3. **Reports page** (`/admin/reports`): No tabs, but filters + data table + detail sheet
   - File: `apps/web/src/app/[locale]/(dashboard)/admin/reports/page.tsx`

## 2. Tab Component

File: `apps/web/src/components/ui/tabs.tsx`

Standard shadcn/ui Tabs built on `@radix-ui/react-tabs`:
```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

<Tabs value={activeTab} onValueChange={(value) => setActiveTab(value)}>
  <TabsList>
    <TabsTrigger value="tab1">Tab 1</TabsTrigger>
    <TabsTrigger value="tab2">Tab 2</TabsTrigger>
  </TabsList>
  <TabsContent value="tab1" className="space-y-4">...</TabsContent>
  <TabsContent value="tab2" className="space-y-4">...</TabsContent>
</Tabs>
```

No existing pages use URL-synced tab state. All currently use `React.useState`.

## 3. Data Table Patterns

### Table component
File: `apps/web/src/components/ui/table.tsx`

Plain shadcn/ui HTML Table components (no TanStack Table, no DataTable abstraction):
- `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`
- Each feature builds its own `*-data-table.tsx` component manually

### Data table pattern (example: `report-data-table.tsx`)
- Props: `{ items, isLoading, onRowClick, ... }`
- When `isLoading`, render a `*DataTableSkeleton` (skeleton rows with `Skeleton` components)
- When items empty, return `null` (empty state handled by parent page)
- Columns defined inline in JSX

### Pagination component
File: `apps/web/src/components/ui/pagination.tsx`

Reusable `Pagination` component with props:
```tsx
interface PaginationProps {
  page: number         // 1-indexed
  totalPages: number
  total: number
  limit: number
  onPageChange: (page: number) => void
  onLimitChange: (limit: number) => void
  pageSizes?: number[] // default [10, 20, 50, 100]
  disabled?: boolean
}
```
Features: first/prev/next/last buttons, page size selector, "Showing X to Y of Z results" text.
Currently NOT i18n-translated (hardcoded English strings).

### Pagination usage pattern (from correction-assistant page)
```tsx
const [page, setPage] = React.useState(1)
const [limit, setLimit] = React.useState(50)

// Reset page when filters change
React.useEffect(() => {
  setPage(1)
}, [dateRange, departmentId, severity, errorCode])

// Calculate from meta
const total = correctionData?.meta?.total ?? 0
const totalPages = Math.ceil(total / limit)

// Render conditionally
{totalPages > 1 && (
  <Pagination
    page={page}
    totalPages={totalPages}
    total={total}
    limit={limit}
    onPageChange={setPage}
    onLimitChange={(newLimit) => {
      setLimit(newLimit)
      setPage(1)
    }}
  />
)}
```

## 4. Filter Patterns

### Existing filter components
Two existing filter components:

1. **ApprovalFilters** (`apps/web/src/components/approvals/approval-filters.tsx`)
   - Grid layout: `grid gap-4 md:grid-cols-3 md:items-end`
   - Team select, date range picker, status select
   - Uses `Label` + control pairs in `space-y-2` divs

2. **CorrectionAssistantFilters** (`apps/web/src/components/correction-assistant/correction-assistant-filters.tsx`)
   - Grid layout: `grid gap-4 md:grid-cols-3 lg:grid-cols-4 md:items-end`
   - Date range, department, severity, error code, employee search
   - Clear filters button with `X` icon
   - `hasFilters` prop to conditionally show clear button

### URL-synced filters
No existing pages use URL search params for filter state. All use `React.useState`.

The only files using `useSearchParams` are:
- `apps/web/src/hooks/api/use-correction-assistant.ts` (for cursor-based pagination)
- `apps/web/src/app/[locale]/(dashboard)/timesheet/page.tsx`
- `apps/web/src/app/[locale]/(dashboard)/notifications/page.tsx`
- `apps/web/src/app/[locale]/(auth)/login/page.tsx`

The ticket requires URL-synced filters - this will be a new pattern for the codebase.

### DateRangePicker component
File: `apps/web/src/components/ui/date-range-picker.tsx`

Props:
```tsx
interface DateRangePickerProps {
  value?: DateRange          // { from?: Date; to?: Date }
  onChange?: (range: DateRange | undefined) => void
  placeholder?: string
  disabled?: boolean
  holidays?: Date[]
  absences?: Date[]
  minDate?: Date
  maxDate?: Date
  className?: string
}
```

### Select component
File: `apps/web/src/components/ui/select.tsx` (standard shadcn/ui)

### Switch component
File: `apps/web/src/components/ui/switch.tsx` (standard shadcn/ui with `size` prop: `"sm"` | `"default"`)

## 5. API Hooks Pattern

### Core hook infrastructure
- **useApiQuery**: `apps/web/src/hooks/use-api-query.ts`
  - Wraps TanStack Query `useQuery` with openapi-fetch type safety
  - Uses `api.GET()` from openapi-fetch client
  - Query key: `[path, params, pathParams]`
  - Type-safe from generated `paths` types

- **useApiMutation**: `apps/web/src/hooks/use-api-mutation.ts`
  - Wraps TanStack Query `useMutation`
  - Supports `post`, `put`, `patch`, `delete`
  - `invalidateKeys` option for automatic cache invalidation
  - Variables: `{ body?, path? }`

### Fetching library
TanStack React Query (`@tanstack/react-query`) with `openapi-fetch` for type-safe API calls.

### API client
File: `apps/web/src/lib/api/` directory with `openapi-fetch` client.

### Generated types
File: `apps/web/src/lib/api/types.ts` - auto-generated from OpenAPI spec via `openapi-typescript`.
- Types accessed as `components['schemas']['SchemaName']`
- Evaluation schemas already present:
  - `EvaluationDailyValue`, `EvaluationDailyValueList`
  - `EvaluationBooking`, `EvaluationBookingList`
  - `EvaluationTerminalBooking`, `EvaluationTerminalBookingList`
  - `EvaluationLogEntry`, `EvaluationLogEntryList`
  - `EvaluationWorkflowEntry`, `EvaluationWorkflowEntryList`
  - `PaginationMeta` (with `total`, `limit`, `page`, `total_pages`)

### Existing hook barrel file
File: `apps/web/src/hooks/api/index.ts` - exports all hooks. New evaluation hooks must be added here.

### Example hook (reports pattern - most similar)
```tsx
export function useReports(options: UseReportsOptions = {}) {
  const { reportType, status, limit, cursor, enabled = true } = options
  return useApiQuery('/reports', {
    params: { report_type: reportType, status, limit, cursor },
    enabled,
  })
}
```

### Existing related hooks
- `useDepartments()` - fetches departments list, used for department filter dropdowns
- `useEmployees()` - fetches employee list with search/pagination
- `useBookingTypes()` - fetches booking types, needed for bookings tab filter
- `useUsers()` - fetches user list, needed for logs tab user filter
- `useAllDailyValues()` - existing daily values hook (different endpoint, `/daily-values`)
- `useBookings()` - existing bookings hook (different endpoint, `/bookings`)

## 6. Badge/Status Patterns

### Badge component
File: `apps/web/src/components/ui/badge.tsx`

Variants: `default`, `secondary`, `destructive`, `outline`, `ghost`, `link`

### Status badge patterns (from reports)
```tsx
function getStatusBadge(status: string, t: (key: string) => string) {
  const statusConfig = {
    pending: { variant: 'outline' as const, className: 'border-yellow-500 text-yellow-700' },
    completed: { variant: 'default' as const, className: 'bg-green-600 hover:bg-green-700' },
    failed: { variant: 'destructive' as const, className: '' },
  }
  const config = statusConfig[status] || statusConfig.pending
  return <Badge variant={config.variant} className={config.className}>{t(config.labelKey)}</Badge>
}
```

### Color conventions used
- Green: `bg-green-600`, `border-green-500 text-green-700` (success/approved/completed)
- Yellow: `border-yellow-500 text-yellow-700` (pending/warning)
- Blue: `border-blue-500 text-blue-700` (info)
- Purple: `border-purple-500 text-purple-700` (special)
- Orange: `border-orange-500 text-orange-700` (time-related)
- Red: `destructive` variant (error/rejected)

### Report type badge pattern (colored outline badges)
```tsx
function getReportTypeBadge(reportType: string, t: (key: string) => string) {
  const typeColorMap: Record<string, string> = {
    daily_overview: 'border-blue-500 text-blue-700',
    absence_report: 'border-purple-500 text-purple-700',
    overtime_report: 'border-orange-500 text-orange-700',
  }
  return <Badge variant="outline" className={typeColorMap[reportType] ?? ''}>{t(`types.${reportType}`)}</Badge>
}
```

## 7. Date/Time Formatting Utilities

File: `apps/web/src/lib/time-utils.ts`

### Existing utilities (all available)
| Function | Usage | Example |
|---|---|---|
| `formatMinutes(minutes)` | Minutes -> HH:MM | `formatMinutes(510)` => `"8:30"` |
| `formatTime(minutesSinceMidnight)` | Minutes from midnight -> HH:MM (zero-padded) | `formatTime(510)` => `"08:30"` |
| `formatDuration(minutes)` | Minutes -> human readable | `formatDuration(510)` => `"8h 30m"` |
| `formatBalance(minutes)` | Minutes -> +/- HH:MM | `formatBalance(30)` => `"+0:30"` |
| `formatDate(date)` | Date -> YYYY-MM-DD | ISO date string |
| `formatTimeFromIso(isoString)` | ISO datetime -> HH:MM | Time extraction |
| `formatRelativeDate(date)` | Date -> relative string | Today/Yesterday/formatted |
| `formatRelativeTime(isoString)` | ISO datetime -> relative | "2 hours ago" |
| `formatDisplayDate(date, format)` | Date -> locale display | DD.MM or long format |

The ticket requires `formatMinutes` for time columns (target, gross, net, break, overtime, balance), `formatTime` for first_come/last_go (minutes from midnight), and `formatDate` for API params.

## 8. Skeleton/Loading Patterns

### Skeleton component
File: `apps/web/src/components/ui/skeleton.tsx`
Simple `div` with `bg-accent animate-pulse rounded-md` class.

### Page-level skeleton pattern
Each page has a dedicated skeleton function:
```tsx
function PageNameSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />  {/* Title */}
        <Skeleton className="h-4 w-72" />  {/* Subtitle */}
      </div>
      <Skeleton className="h-[500px]" />   {/* Content area */}
    </div>
  )
}
```

### Table skeleton pattern
Tables render skeleton rows in a `*DataTableSkeleton` function:
```tsx
function DataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead><Skeleton className="h-4 w-32" /></TableHead>
          ...
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
            ...
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

## 9. Sheet/Dialog Patterns

### Sheet component
File: `apps/web/src/components/ui/sheet.tsx`

Uses `@radix-ui/react-dialog` with slide-in animation. Components:
`Sheet`, `SheetTrigger`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription`, `SheetFooter`, `SheetClose`

### Detail sheet pattern (from reports)
```tsx
<Sheet open={open} onOpenChange={onOpenChange}>
  <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
    <SheetHeader>
      <SheetTitle>{t('detail.title')}</SheetTitle>
      <SheetDescription>{item?.name ?? '-'}</SheetDescription>
    </SheetHeader>
    <ScrollArea className="flex-1 -mx-4 px-4">
      <div className="space-y-6 py-4">
        {/* Sections with bordered cards */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Section Title</h4>
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex justify-between py-1">
              <span className="text-sm text-muted-foreground">Label</span>
              <span className="text-sm font-medium">Value</span>
            </div>
          </div>
        </div>
      </div>
    </ScrollArea>
    <SheetFooter className="flex-row gap-2 border-t pt-4">
      <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
    </SheetFooter>
  </SheetContent>
</Sheet>
```

### ScrollArea component
File: `apps/web/src/components/ui/scroll-area.tsx` (standard shadcn/ui)

### ConfirmDialog component
File: `apps/web/src/components/ui/confirm-dialog.tsx` - reusable confirmation dialog.

### Alert component
File: `apps/web/src/components/ui/alert.tsx` (standard shadcn/ui with `Alert`, `AlertDescription`)

## 10. Translation/i18n Setup

### Framework
`next-intl` library with:
- Locales: `de` (default), `en`
- Locale prefix: `as-needed` (no prefix for `de`)
- Config: `apps/web/src/i18n/routing.ts`, `apps/web/src/i18n/request.ts`
- Navigation: `apps/web/src/i18n/navigation.ts` (exports `Link`, `usePathname`, `useRouter`)

### Translation files
- English: `apps/web/messages/en.json`
- German: `apps/web/messages/de.json`

Both are flat JSON objects with nested namespaces. Accessed via `useTranslations('namespace')`.

### Usage pattern
```tsx
const t = useTranslations('reports')  // namespace
t('page.title')                       // nested key
t('count.items', { count: 5 })        // interpolation
```

### Current state
No `evaluations` namespace exists in either translation file. It needs to be created for this ticket.

## 11. Navigation Setup

### Sidebar configuration
File: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

Three sections: `main`, `management`, `administration`

Structure:
```tsx
interface NavItem {
  titleKey: string    // key in 'nav' namespace
  href: string
  icon: LucideIcon
  roles?: UserRole[]
}

interface NavSection {
  titleKey: string
  roles?: UserRole[]
  items: NavItem[]
}
```

The ticket wants evaluations in `management` section. Currently that section has items like approvals, employees, teams, departments, etc.

The `administration` section has reports, settings, payroll exports, export interfaces, monthly evaluations.

No `evaluations` entry currently exists. The ticket specifies the `BarChart3` icon, which is not currently imported in the config file.

### Breadcrumb setup
File: `apps/web/src/components/layout/breadcrumbs.tsx`

Uses `segmentToKey` mapping (Record<string, string>) to convert URL segments to translation keys:
```tsx
const segmentToKey: Record<string, string> = {
  approvals: 'approvals',
  reports: 'reports',
  // ... etc
}
```

No `evaluations` entry exists. Must add `'evaluations': 'evaluations'`.

Translation used: `useTranslations('breadcrumbs')` - must add `evaluations` key to breadcrumbs namespace.

## 12. Backend Evaluation Endpoints

### Status: FULLY IMPLEMENTED

All five evaluation endpoints exist in the backend:

#### Handler
File: `apps/api/internal/handler/evaluation.go`

- `GET /evaluations/daily-values` - `ListDailyValues`
- `GET /evaluations/bookings` - `ListBookings`
- `GET /evaluations/terminal-bookings` - `ListTerminalBookings`
- `GET /evaluations/logs` - `ListLogs`
- `GET /evaluations/workflow-history` - `ListWorkflowHistory`

#### Route registration
File: `apps/api/internal/handler/routes.go` (line ~1038)
```go
func RegisterEvaluationRoutes(r chi.Router, h *EvaluationHandler, authz *middleware.AuthorizationMiddleware) {
  permViewReports := permissions.ID("reports.view").String()
  r.Route("/evaluations", func(r chi.Router) {
    r.Get("/daily-values", h.ListDailyValues)
    r.Get("/bookings", h.ListBookings)
    r.Get("/terminal-bookings", h.ListTerminalBookings)
    r.Get("/logs", h.ListLogs)
    r.Get("/workflow-history", h.ListWorkflowHistory)
  })
}
```

#### Service layer
File: `apps/api/internal/service/evaluation.go`

#### OpenAPI spec
File: `api/paths/evaluations.yaml` - all five endpoints defined
File: `api/schemas/evaluations.yaml` - all response schemas defined

#### Generated Go models
All evaluation models exist in `apps/api/gen/models/`:
- `evaluation_daily_value.go`, `evaluation_daily_value_list.go`
- `evaluation_booking.go`, `evaluation_booking_list.go`
- `evaluation_terminal_booking.go`, `evaluation_terminal_booking_list.go`
- `evaluation_log_entry.go`, `evaluation_log_entry_list.go`
- `evaluation_workflow_entry.go`, `evaluation_workflow_entry_list.go`

#### TypeScript types
File: `apps/web/src/lib/api/types.ts` - all evaluation types already generated:
- Paths: `/evaluations/daily-values`, `/evaluations/bookings`, `/evaluations/terminal-bookings`, `/evaluations/logs`, `/evaluations/workflow-history`
- Schemas: `EvaluationDailyValue`, `EvaluationBooking`, `EvaluationTerminalBooking`, `EvaluationLogEntry`, `EvaluationWorkflowEntry` and their list types

#### Common query parameters across all endpoints
- `from` (required, date string)
- `to` (required, date string)
- `employee_id` (optional, UUID)
- `department_id` (optional, UUID)
- `limit` (default 50, 1-1000)
- `page` (default 1, 1-indexed)

#### Tab-specific parameters
- **daily-values**: `has_errors` (bool), `include_no_bookings` (bool, default false)
- **bookings**: `booking_type_id` (UUID), `source` (enum: web|terminal|api|import|correction), `direction` (enum: in|out)
- **terminal-bookings**: none beyond shared
- **logs**: `entity_type` (string), `action` (string), `user_id` (UUID)
- **workflow-history**: `entity_type` (string), `action` (string)

#### Response format
All endpoints return `{ data: T[], meta?: PaginationMeta }` where:
```tsx
PaginationMeta: {
  total?: number
  limit?: number
  page?: number
  total_pages?: number
}
```

## Summary of Components to Create

### New files needed
1. `apps/web/src/app/[locale]/(dashboard)/admin/evaluations/page.tsx` - Main page
2. `apps/web/src/components/evaluations/evaluations-shared-filters.tsx` - Shared filter bar
3. `apps/web/src/components/evaluations/daily-values-tab.tsx` - Daily values tab content
4. `apps/web/src/components/evaluations/bookings-tab.tsx` - Bookings tab content
5. `apps/web/src/components/evaluations/terminal-bookings-tab.tsx` - Terminal bookings tab
6. `apps/web/src/components/evaluations/logs-tab.tsx` - Logs tab content
7. `apps/web/src/components/evaluations/workflow-history-tab.tsx` - Workflow history tab
8. `apps/web/src/components/evaluations/evaluation-log-detail-sheet.tsx` - Detail sheet
9. `apps/web/src/components/evaluations/evaluations-skeleton.tsx` - Loading skeleton
10. `apps/web/src/components/evaluations/index.ts` - Barrel export
11. `apps/web/src/hooks/api/use-evaluations.ts` - API hooks for all 5 endpoints

### Files to modify
1. `apps/web/src/hooks/api/index.ts` - Add evaluation hook exports
2. `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` - Add evaluations nav item
3. `apps/web/src/components/layout/breadcrumbs.tsx` - Add `evaluations` segment mapping
4. `apps/web/messages/en.json` - Add `evaluations` namespace + nav/breadcrumb keys
5. `apps/web/messages/de.json` - Add `evaluations` namespace + nav/breadcrumb keys

### Existing components to reuse
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` from `@/components/ui/tabs`
- `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` from `@/components/ui/table`
- `Badge` from `@/components/ui/badge`
- `Pagination` from `@/components/ui/pagination`
- `DateRangePicker` from `@/components/ui/date-range-picker`
- `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` from `@/components/ui/select`
- `Switch` from `@/components/ui/switch`
- `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription`, `SheetFooter` from `@/components/ui/sheet`
- `ScrollArea` from `@/components/ui/scroll-area`
- `Skeleton` from `@/components/ui/skeleton`
- `Card`, `CardContent` from `@/components/ui/card`
- `Label` from `@/components/ui/label`
- `Alert`, `AlertDescription` from `@/components/ui/alert`
- `Button` from `@/components/ui/button`
- `formatMinutes`, `formatTime`, `formatBalance`, `formatDate` from `@/lib/time-utils`
- `useApiQuery` from `@/hooks/use-api-query`
- `useAuth` from `@/providers/auth-provider`
- `useHasRole` from `@/hooks`
- `useDepartments` from `@/hooks/api`
- `useEmployees` from `@/hooks/api`
- `useBookingTypes` from `@/hooks/api`
- `useUsers` from `@/hooks/api`
- `components['schemas']` types from `@/lib/api/types`

### Key patterns to follow
- **Closest reference page**: Correction Assistant page (tabs + pagination + filters + detail sheet)
- **Data table**: Manual Table components (no TanStack Table abstraction)
- **API hooks**: `useApiQuery` wrapper for GET endpoints
- **Skeleton**: Inline skeleton function per page + per table
- **Badge**: `Badge` with variant + className for colors
- **Sheet**: Right-side sheet with ScrollArea for detail views
- **i18n**: `useTranslations('evaluations')` namespace pattern
- **URL state**: Will be new pattern; use `useSearchParams` from `next/navigation`
