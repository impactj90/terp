# Research: NOK-234 - Build Year Overview with Monthly Summaries

**Date:** 2026-01-26
**Ticket:** NOK-234
**Status:** Research Complete

## Summary

This document captures research findings for implementing a year overview feature showing all 12 months with key metrics and flextime progression. The codebase has established patterns for tabular admin pages, year selection, monthly value fetching, and time formatting utilities. No chart library is currently installed, but data visualization can be implemented with a simple custom component or by adding recharts/chart.js.

## Detailed Findings

### 1. Frontend Structure

#### App Routing (Next.js App Router)
- **Location:** `/home/tolga/projects/terp/apps/web/src/app/`
- **Pattern:** Route groups with `(auth)` and `(dashboard)` prefixes
- **Dashboard layout:** `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/layout.tsx`
- **Admin pages location:** `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/`

#### Page Structure Pattern
Admin pages follow a consistent structure (see tariffs page at line 31-299 of `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/tariffs/page.tsx`):
1. `'use client'` directive at top
2. Import hooks for auth, roles, and data fetching
3. State for filters, dialogs, and pagination
4. `useAuth()` and `useHasRole()` for access control
5. Loading skeleton component
6. Page header with title and description
7. Filters bar with search/select inputs
8. Card wrapping a data table
9. Form/detail sheets for CRUD operations

### 2. API Client

#### TypeScript API Client
- **Location:** `/home/tolga/projects/terp/apps/web/src/lib/api/client.ts`
- **Type definitions:** `/home/tolga/projects/terp/apps/web/src/lib/api/types.ts` (generated from OpenAPI)
- **Library:** `openapi-fetch` (v0.15.0)
- **Generation command:** `pnpm run generate:api` (in package.json line 14)

#### API Client Usage Pattern
```typescript
import { api } from '@/lib/api'
import type { paths, components } from '@/lib/api/types'

// Type-safe GET request
const { data, error } = await api.GET('/monthly-values', {
  params: { query: { employee_id, year, month } }
})
```

### 3. API Hooks Pattern

#### Query Hook (useApiQuery)
- **Location:** `/home/tolga/projects/terp/apps/web/src/hooks/use-api-query.ts`
- **Pattern:** Wraps `@tanstack/react-query` with type-safe OpenAPI paths (lines 71-95)

```typescript
// Example from /home/tolga/projects/terp/apps/web/src/hooks/api/use-monthly-values.ts lines 24-44
export function useMonthlyValues(options: UseMonthlyValuesOptions = {}) {
  const { employeeId, year, month, status, departmentId, enabled = true } = options
  return useApiQuery('/monthly-values', {
    params: {
      employee_id: employeeId,
      year,
      month,
      status,
      department_id: departmentId,
    },
    enabled,
  })
}
```

#### Mutation Hook (useApiMutation)
- **Location:** `/home/tolga/projects/terp/apps/web/src/hooks/use-api-mutation.ts`
- **Features:** Type-safe, automatic query invalidation (lines 171-201)

#### Available API Hooks Index
- **Location:** `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts`
- **Relevant hooks:**
  - `useMonthlyValues` - fetch list of monthly values
  - `useMonthlyValue` - fetch single monthly value by ID
  - `useCloseMonthlyValue` - close a month
  - `useReopenMonthlyValue` - reopen a month
  - `useDailyValues` - fetch daily values
  - `useEmployeeVacationBalance` - fetch vacation balance for employee

### 4. Monthly Data API

#### OpenAPI Specification
- **Paths:** `/home/tolga/projects/terp/api/paths/monthly-values.yaml`
- **Schemas:** `/home/tolga/projects/terp/api/schemas/monthly-values.yaml`

#### Available Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/monthly-values` | GET | List monthly values with filters (employee_id, year, month, status, department_id) |
| `/monthly-values/{id}` | GET | Get single monthly value |
| `/monthly-values/{id}/close` | POST | Close month for employee |
| `/monthly-values/{id}/reopen` | POST | Reopen closed month |
| `/monthly-values/close-batch` | POST | Batch close for multiple employees |
| `/monthly-values/recalculate` | POST | Trigger recalculation |

#### MonthlyValue Schema Fields (from monthly-values.yaml lines 1-113)
- `id`, `tenant_id`, `employee_id`
- `year`, `month`
- `status`: `open | calculated | closed | exported`
- `target_minutes`, `gross_minutes`, `break_minutes`, `net_minutes`
- `overtime_minutes`, `undertime_minutes`, `balance_minutes`
- `working_days`, `worked_days`, `absence_days`, `holiday_days`
- `account_balances` (JSON object)
- `calculated_at`, `closed_at`, `closed_by`
- Expanded `employee` relation

#### Backend Model (from /home/tolga/projects/terp/apps/api/internal/model/monthlyvalue.go)
```go
type MonthlyValue struct {
    // Time totals (minutes)
    TotalGrossTime  int
    TotalNetTime    int
    TotalTargetTime int
    TotalOvertime   int
    TotalUndertime  int
    TotalBreakTime  int

    // Flextime tracking
    FlextimeStart     int
    FlextimeChange    int
    FlextimeEnd       int
    FlextimeCarryover int

    // Summary
    VacationTaken    decimal.Decimal
    SickDays         int
    OtherAbsenceDays int
    WorkDays         int
    DaysWithErrors   int

    // Closing
    IsClosed   bool
    ClosedAt   *time.Time
    ClosedBy   *uuid.UUID
}
```

### 5. Components

#### UI Components Available
- **Location:** `/home/tolga/projects/terp/apps/web/src/components/ui/`
- **Table components:** `table.tsx` (lines 1-117) - Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell
- **Card:** `card.tsx` - Card, CardHeader, CardTitle, CardContent
- **Badge:** `badge.tsx` - status indicators
- **Skeleton:** `skeleton.tsx` - loading states
- **Select:** `select.tsx` - dropdowns
- **Button:** `button.tsx` - actions
- **Tabs:** `tabs.tsx` - view switching

#### Year Selector Component
- **Location:** `/home/tolga/projects/terp/apps/web/src/components/vacation/year-selector.tsx`
- **Usage:** See vacation page line 69-72

```typescript
interface YearSelectorProps {
  value: number
  onChange: (year: number) => void
  range?: number // Years before/after current (default 5)
  className?: string
}
```

#### Data Table Pattern
- **Example:** `/home/tolga/projects/terp/apps/web/src/components/tariffs/tariff-data-table.tsx`
- **Features:** Column headers, row click handlers, dropdown actions, loading skeleton

```typescript
// Pattern from tariff-data-table.tsx lines 37-130
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Column</TableHead>
      ...
    </TableRow>
  </TableHeader>
  <TableBody>
    {items.map((item) => (
      <TableRow key={item.id} onClick={() => onView(item)}>
        <TableCell>{item.value}</TableCell>
        ...
      </TableRow>
    ))}
  </TableBody>
</Table>
```

#### Month View Component
- **Location:** `/home/tolga/projects/terp/apps/web/src/components/timesheet/month-view.tsx`
- **Shows:** Calendar grid with daily values, monthly summary at bottom (lines 40-236)
- **Uses:** `useDailyValues`, `useMonthlyValues` hooks
- **Displays:** Net time, balance, holiday/absence badges, error indicators

### 6. Time Utilities

- **Location:** `/home/tolga/projects/terp/apps/web/src/lib/time-utils.ts`

#### Formatting Functions
```typescript
formatMinutes(510)        // "8:30"
formatDuration(510)       // "8h 30m"
formatBalance(30)         // "+0:30"
formatBalance(-60)        // "-1:00"
formatBalanceDuration(30) // "+30m"
formatDate(date)          // "2026-01-26"
formatDisplayDate(date, 'short')  // "26.01"
formatDisplayDate(date, 'long')   // "Montag, 26. Januar 2026"
```

#### Date Range Functions
```typescript
getMonthRange(date)  // { start: Date, end: Date }
getMonthDates(date)  // Date[] for all days in month
getWeekRange(date)   // { start: Date, end: Date }
```

### 7. Navigation Configuration

- **Location:** `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`
- **Year overview would fit under "Main" section after Vacation or under a new "Reports" section**
- No existing "Year Overview" or "Reports" page currently

```typescript
// Navigation item structure
interface NavItem {
  title: string
  href: string
  icon: LucideIcon
  roles?: UserRole[]
  description?: string
}
```

### 8. Export Pattern

- **Location:** `/home/tolga/projects/terp/apps/web/src/components/timesheet/export-buttons.tsx`
- **Supports:** CSV export, PDF/Print via browser

```typescript
// CSV generation pattern (lines 45-64)
const generateCSV = () => {
  const headers = ['Date', 'Target', 'Gross', 'Breaks', 'Net', 'Balance']
  const rows = data.dates.map((date) => {
    const dv = data.dailyValues.get(formatDate(date))
    return [
      formatDisplayDate(date, 'short'),
      formatMinutes(dv?.target_minutes ?? 0),
      // ... more fields
    ].join(',')
  })
  const csv = [headers.join(','), ...rows].join('\n')
  downloadFile(csv, `timesheet-${formatDate(periodStart)}.csv`, 'text/csv')
}
```

### 9. Chart/Visualization

- **No chart library currently installed** in package.json
- FlextimeBalanceCard has a simple custom progress bar visualization (lines 121-145 of `/home/tolga/projects/terp/apps/web/src/components/dashboard/flextime-balance-card.tsx`)
- Balance breakdown in vacation page uses simple progress bar (lines 157-186 of `/home/tolga/projects/terp/apps/web/src/components/vacation/balance-breakdown.tsx`)

### 10. Similar Pages Reference

#### Most Similar: Vacation Page
- **Location:** `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/vacation/page.tsx`
- **Features:** Year selector with navigation buttons, data for single year
- **Components used:** YearSelector, BalanceBreakdown, TransactionHistory

#### Admin Table Pattern: Tariffs Page
- **Location:** `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/tariffs/page.tsx`
- **Features:** Filters, data table, detail sheets, confirm dialogs

#### Time Data Pattern: Timesheet Page
- **Location:** `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/timesheet/page.tsx`
- **Features:** Period navigation (day/week/month), export buttons, tabs for view modes

## Implementation Notes

### For Year Overview Table
The ticket specifies these columns:
| Month | Work Days | Hours | Overtime | Flextime | Status |

These map to MonthlyValue fields:
- Month: `month` (1-12)
- Work Days: `working_days`
- Hours: `net_minutes` (formatted)
- Overtime: `overtime_minutes` or `balance_minutes` (formatted)
- Flextime: `flextime_end` (backend model has this, verify API response)
- Status: `status` (open/calculated/closed/exported)

### API Query for Year
To fetch all 12 months for an employee:
```typescript
const { data } = useMonthlyValues({
  employeeId,
  year: selectedYear,
  enabled: !!employeeId,
})
// Returns array of MonthlyValue objects (may be 0-12 depending on data)
```

### Navigation Integration
Add to sidebar-nav-config.ts in Main section:
```typescript
{
  title: 'Year Overview',
  href: '/year-overview',
  icon: CalendarRange, // or similar
  description: 'View year summary with monthly metrics',
}
```

## File References

| Purpose | File Path | Key Lines |
|---------|-----------|-----------|
| API Client | `/home/tolga/projects/terp/apps/web/src/lib/api/client.ts` | 87-113 |
| Monthly Values Hook | `/home/tolga/projects/terp/apps/web/src/hooks/api/use-monthly-values.ts` | 24-44 |
| Year Selector | `/home/tolga/projects/terp/apps/web/src/components/vacation/year-selector.tsx` | 22-53 |
| Table Components | `/home/tolga/projects/terp/apps/web/src/components/ui/table.tsx` | 1-117 |
| Time Utilities | `/home/tolga/projects/terp/apps/web/src/lib/time-utils.ts` | 1-319 |
| Export Pattern | `/home/tolga/projects/terp/apps/web/src/components/timesheet/export-buttons.tsx` | 36-183 |
| Vacation Page (similar) | `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/vacation/page.tsx` | 17-152 |
| Tariff Table (pattern) | `/home/tolga/projects/terp/apps/web/src/components/tariffs/tariff-data-table.tsx` | 37-163 |
| Sidebar Nav Config | `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` | 57-196 |
| Monthly Value API Schema | `/home/tolga/projects/terp/api/schemas/monthly-values.yaml` | 1-218 |
| Backend Monthly Model | `/home/tolga/projects/terp/apps/api/internal/model/monthlyvalue.go` | 11-56 |
