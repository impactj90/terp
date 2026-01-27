# Implementation Plan: NOK-234 - Build Year Overview with Monthly Summaries

**Date:** 2026-01-26
**Ticket:** NOK-234
**Status:** Planning Complete

## Overview

This plan implements a year overview page showing all 12 months with key metrics (work days, hours, overtime, flextime, status), a flextime progression chart, vacation usage summary, year navigation, and export functionality. Users can click on a month to navigate to the detailed monthly evaluation page.

The implementation follows existing patterns from the vacation page (year selector), monthly evaluation components (summary cards), and tariff admin page (data tables).

## Prerequisites

1. **API Hooks Available**: `useMonthlyValues` hook already supports year-based filtering
2. **Components Available**: YearSelector, Table components, Card, Badge, TimeDisplay, export utilities
3. **Time Utilities**: formatMinutes, formatBalance, formatDuration functions exist
4. **No Chart Library**: Will create a simple custom flextime progression chart using CSS/SVG

## Implementation Phases

---

### Phase 1: Create Year Overview Page Structure

**Objective:** Create the basic page shell with year selector navigation following the vacation page pattern.

**Files to Create:**
- `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/year-overview/page.tsx`

**Files to Modify:**
- `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

**Steps:**

1. Create the year overview page with the following structure:
   ```typescript
   'use client'

   import { useState } from 'react'
   import { ChevronLeft, ChevronRight } from 'lucide-react'
   import { useAuth } from '@/providers/auth-provider'
   import { Button } from '@/components/ui/button'
   import { Skeleton } from '@/components/ui/skeleton'
   import { YearSelector } from '@/components/vacation'
   import { useMonthlyValues } from '@/hooks/api'

   export default function YearOverviewPage() {
     const { user, isLoading: authLoading } = useAuth()
     const employeeId = user?.employee_id
     const currentYear = new Date().getFullYear()
     const [selectedYear, setSelectedYear] = useState(currentYear)

     // Fetch all monthly values for the year
     const { data: monthlyValues, isLoading } = useMonthlyValues({
       employeeId,
       year: selectedYear,
       enabled: !!employeeId,
     })

     // ... loading/error states following vacation page pattern
     // ... year selector with navigation buttons
     // ... content sections
   }
   ```

2. Add navigation item to sidebar-nav-config.ts in the "Main" section after "Monthly Evaluation":
   ```typescript
   {
     title: 'Year Overview',
     href: '/year-overview',
     icon: CalendarRange,
     description: 'View year summary with monthly metrics',
   }
   ```

**Verification:**
- [ ] Run `pnpm dev` in apps/web and navigate to `/year-overview`
- [ ] Verify page loads without errors
- [ ] Verify year selector shows current year
- [ ] Verify navigation arrows change year
- [ ] Verify "Current Year" button appears when not on current year
- [ ] Verify navigation link appears in sidebar

---

### Phase 2: Create Monthly Data Table Component

**Objective:** Create a table component displaying all 12 months with columns: Month, Work Days, Hours, Overtime, Flextime, Status.

**Files to Create:**
- `/home/tolga/projects/terp/apps/web/src/components/year-overview/year-overview-table.tsx`
- `/home/tolga/projects/terp/apps/web/src/components/year-overview/index.ts`

**Steps:**

1. Create the year overview table component:
   ```typescript
   'use client'

   import { useRouter } from 'next/navigation'
   import {
     Table,
     TableBody,
     TableCell,
     TableFooter,
     TableHead,
     TableHeader,
     TableRow,
   } from '@/components/ui/table'
   import { Badge } from '@/components/ui/badge'
   import { Skeleton } from '@/components/ui/skeleton'
   import { TimeDisplay } from '@/components/timesheet'
   import { cn } from '@/lib/utils'

   // Month names for display
   const MONTH_NAMES = [
     'January', 'February', 'March', 'April', 'May', 'June',
     'July', 'August', 'September', 'October', 'November', 'December'
   ]

   interface MonthlyValueData {
     id: string
     month: number
     net_minutes?: number | null
     target_minutes?: number | null
     balance_minutes?: number | null
     working_days?: number | null
     worked_days?: number | null
     status?: string | null
     account_balances?: Record<string, number> | null
   }

   interface YearOverviewTableProps {
     year: number
     monthlyValues: MonthlyValueData[]
     isLoading: boolean
     onMonthClick?: (month: number) => void
   }
   ```

2. Implement table with:
   - All 12 months (show "No data" for months without records)
   - Click row to navigate to monthly evaluation with that month
   - Status badge with color coding (open=default, calculated=secondary, closed=green, exported=blue)
   - Footer row with year totals

3. Create status badge helper:
   ```typescript
   function getStatusBadge(status?: string | null) {
     const statusConfig = {
       open: { label: 'Open', variant: 'outline' as const },
       calculated: { label: 'Calculated', variant: 'secondary' as const },
       closed: { label: 'Closed', variant: 'default' as const, className: 'bg-green-600' },
       exported: { label: 'Exported', variant: 'default' as const, className: 'bg-blue-600' },
     }
     const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.open
     return <Badge variant={config.variant} className={config.className}>{config.label}</Badge>
   }
   ```

4. Create index.ts barrel export:
   ```typescript
   export * from './year-overview-table'
   ```

**Verification:**
- [ ] Import component in year-overview page
- [ ] Verify all 12 months display
- [ ] Verify months with data show correct values
- [ ] Verify months without data show placeholder
- [ ] Verify clicking a row navigates to monthly evaluation
- [ ] Verify footer shows year totals
- [ ] Verify status badges display correctly

---

### Phase 3: Create Year Summary Cards

**Objective:** Create summary cards showing year totals for quick overview (following monthly-summary-cards pattern).

**Files to Create:**
- `/home/tolga/projects/terp/apps/web/src/components/year-overview/year-summary-cards.tsx`

**Files to Modify:**
- `/home/tolga/projects/terp/apps/web/src/components/year-overview/index.ts`

**Steps:**

1. Create year summary cards component with 4 cards:
   - **Total Time**: Target vs Actual hours for the year
   - **Flextime Balance**: Current year-end flextime (from last closed month)
   - **Working Days**: Total worked days vs total working days
   - **Vacation Summary**: Vacation days taken (from vacation balance API)

2. Follow the MonthlySummaryCards pattern:
   ```typescript
   interface YearSummaryCardsProps {
     monthlyValues: MonthlyValueData[]
     vacationUsed?: number
     isLoading: boolean
   }

   export function YearSummaryCards({ monthlyValues, vacationUsed, isLoading }: YearSummaryCardsProps) {
     // Aggregate values across all months
     const totals = useMemo(() => {
       return monthlyValues.reduce((acc, mv) => ({
         targetMinutes: acc.targetMinutes + (mv.target_minutes ?? 0),
         netMinutes: acc.netMinutes + (mv.net_minutes ?? 0),
         workingDays: acc.workingDays + (mv.working_days ?? 0),
         workedDays: acc.workedDays + (mv.worked_days ?? 0),
         absenceDays: acc.absenceDays + (mv.absence_days ?? 0),
       }), { targetMinutes: 0, netMinutes: 0, workingDays: 0, workedDays: 0, absenceDays: 0 })
     }, [monthlyValues])

     // Get flextime from last closed month
     const lastClosedMonth = monthlyValues
       .filter(mv => mv.status === 'closed' || mv.status === 'exported')
       .sort((a, b) => b.month - a.month)[0]
     const currentFlextime = lastClosedMonth?.account_balances?.flextime ?? 0

     // ... render cards
   }
   ```

3. Add export to index.ts

**Verification:**
- [ ] Cards display in year-overview page above the table
- [ ] Total time shows aggregated hours correctly
- [ ] Flextime balance shows value from last closed month
- [ ] Working days ratio is accurate
- [ ] Vacation summary shows if data available
- [ ] Loading skeleton displays correctly

---

### Phase 4: Create Flextime Progression Chart

**Objective:** Create a simple chart showing flextime progression across months.

**Files to Create:**
- `/home/tolga/projects/terp/apps/web/src/components/year-overview/flextime-chart.tsx`

**Files to Modify:**
- `/home/tolga/projects/terp/apps/web/src/components/year-overview/index.ts`

**Steps:**

1. Create a simple SVG-based bar chart component:
   ```typescript
   'use client'

   import { useMemo } from 'react'
   import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
   import { TrendingUp } from 'lucide-react'
   import { formatBalance } from '@/lib/time-utils'
   import { cn } from '@/lib/utils'

   const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

   interface FlextimeDataPoint {
     month: number
     balance: number
     hasData: boolean
   }

   interface FlextimeChartProps {
     data: FlextimeDataPoint[]
     isLoading: boolean
     className?: string
   }
   ```

2. Implement chart with:
   - 12 bars (one per month)
   - Positive values above center line (green)
   - Negative values below center line (red)
   - Hover tooltip showing exact value
   - Month labels below

3. Use CSS-based approach for simplicity:
   ```typescript
   // Calculate max absolute value for scaling
   const maxValue = useMemo(() => {
     const values = data.filter(d => d.hasData).map(d => Math.abs(d.balance))
     return Math.max(...values, 60) // minimum 1 hour scale
   }, [data])

   // Render bars
   {data.map((point, index) => (
     <div key={index} className="flex flex-col items-center flex-1">
       <div className="relative h-32 w-full flex flex-col">
         {/* Center line */}
         <div className="absolute top-1/2 left-0 right-0 h-px bg-border" />
         {/* Bar */}
         {point.hasData && (
           <div
             className={cn(
               'absolute left-1 right-1 transition-all',
               point.balance >= 0
                 ? 'bottom-1/2 bg-green-500'
                 : 'top-1/2 bg-red-500'
             )}
             style={{
               height: `${(Math.abs(point.balance) / maxValue) * 50}%`
             }}
             title={formatBalance(point.balance)}
           />
         )}
       </div>
       <span className="text-xs text-muted-foreground mt-1">
         {MONTH_SHORT[index]}
       </span>
     </div>
   ))}
   ```

4. Add skeleton loading state

**Verification:**
- [ ] Chart renders in year-overview page
- [ ] Bars scale correctly relative to each other
- [ ] Positive values show above center line in green
- [ ] Negative values show below center line in red
- [ ] Month labels display correctly
- [ ] Hover shows formatted value
- [ ] Months without data show no bar

---

### Phase 5: Create Year Export Functionality

**Objective:** Add export buttons for CSV and PDF/Print of year data.

**Files to Create:**
- `/home/tolga/projects/terp/apps/web/src/components/year-overview/year-export-buttons.tsx`

**Files to Modify:**
- `/home/tolga/projects/terp/apps/web/src/components/year-overview/index.ts`

**Steps:**

1. Create export component following export-buttons.tsx pattern:
   ```typescript
   'use client'

   import { useState } from 'react'
   import { Download, FileText, FileSpreadsheet } from 'lucide-react'
   import { Button } from '@/components/ui/button'
   import {
     DropdownMenu,
     DropdownMenuContent,
     DropdownMenuItem,
     DropdownMenuTrigger,
   } from '@/components/ui/dropdown-menu'
   import { formatMinutes } from '@/lib/time-utils'

   interface YearExportButtonsProps {
     year: number
     employeeName?: string
     monthlyValues: MonthlyValueData[]
   }
   ```

2. Implement CSV export:
   ```typescript
   const generateCSV = () => {
     const headers = ['Month', 'Working Days', 'Worked Days', 'Target Hours', 'Worked Hours', 'Balance', 'Status']
     const rows = MONTH_NAMES.map((monthName, index) => {
       const mv = monthlyValues.find(m => m.month === index + 1)
       return [
         monthName,
         mv?.working_days ?? 0,
         mv?.worked_days ?? 0,
         formatMinutes(mv?.target_minutes ?? 0),
         formatMinutes(mv?.net_minutes ?? 0),
         formatMinutes(mv?.balance_minutes ?? 0),
         mv?.status ?? 'No data',
       ].join(',')
     })

     // Add totals row
     const totals = calculateTotals(monthlyValues)
     rows.push([
       'TOTAL',
       totals.workingDays,
       totals.workedDays,
       formatMinutes(totals.targetMinutes),
       formatMinutes(totals.netMinutes),
       formatMinutes(totals.balanceMinutes),
       '',
     ].join(','))

     const csv = [headers.join(','), ...rows].join('\n')
     downloadFile(csv, `year-overview-${year}.csv`, 'text/csv')
   }
   ```

3. Implement PDF/Print with HTML template similar to export-buttons.tsx

**Verification:**
- [ ] Export dropdown appears in page header
- [ ] CSV download works with correct data
- [ ] PDF/Print opens print dialog with formatted table
- [ ] File names include year
- [ ] Totals row included in exports

---

### Phase 6: Integrate All Components and Polish

**Objective:** Integrate all components into the year overview page with proper layout and loading states.

**Files to Modify:**
- `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/year-overview/page.tsx`

**Steps:**

1. Update page with full component integration:
   ```typescript
   import {
     YearOverviewTable,
     YearSummaryCards,
     FlextimeChart,
     YearExportButtons,
   } from '@/components/year-overview'
   import { useEmployeeVacationBalance } from '@/hooks/api'

   export default function YearOverviewPage() {
     // ... existing state and hooks

     // Also fetch vacation balance for vacation summary
     const { data: vacationBalance } = useEmployeeVacationBalance(
       employeeId ?? '',
       selectedYear,
       !!employeeId
     )

     // Transform monthly values to array and sort by month
     const monthlyValuesList = useMemo(() => {
       if (!monthlyValues) return []
       return [...monthlyValues].sort((a, b) => a.month - b.month)
     }, [monthlyValues])

     // Prepare flextime chart data
     const flextimeData = useMemo(() => {
       return Array.from({ length: 12 }, (_, i) => {
         const mv = monthlyValuesList.find(m => m.month === i + 1)
         return {
           month: i + 1,
           balance: mv?.account_balances?.flextime ?? mv?.balance_minutes ?? 0,
           hasData: !!mv,
         }
       })
     }, [monthlyValuesList])

     const handleMonthClick = (month: number) => {
       router.push(`/monthly-evaluation?year=${selectedYear}&month=${month}`)
     }

     return (
       <div className="space-y-6">
         {/* Header with title and export */}
         <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
           <div>
             <h1 className="text-2xl font-bold tracking-tight">Year Overview</h1>
             <p className="text-muted-foreground">
               View your annual time tracking summary
             </p>
           </div>
           <YearExportButtons
             year={selectedYear}
             employeeName={user?.employee?.name}
             monthlyValues={monthlyValuesList}
           />
         </div>

         {/* Year selector */}
         <div className="flex items-center gap-2">
           {/* ... year selector with navigation */}
         </div>

         {/* Summary cards */}
         <YearSummaryCards
           monthlyValues={monthlyValuesList}
           vacationUsed={vacationBalance?.used_days}
           isLoading={isLoading}
         />

         {/* Two column layout: Chart and Table */}
         <div className="grid gap-6 lg:grid-cols-3">
           {/* Flextime progression chart - 1 column */}
           <FlextimeChart
             data={flextimeData}
             isLoading={isLoading}
           />

           {/* Monthly table - 2 columns */}
           <Card className="lg:col-span-2">
             <CardHeader>
               <CardTitle>Monthly Breakdown</CardTitle>
             </CardHeader>
             <CardContent>
               <YearOverviewTable
                 year={selectedYear}
                 monthlyValues={monthlyValuesList}
                 isLoading={isLoading}
                 onMonthClick={handleMonthClick}
               />
             </CardContent>
           </Card>
         </div>
       </div>
     )
   }
   ```

2. Create comprehensive loading skeleton

3. Add error handling with retry functionality

4. Ensure responsive design for mobile

**Verification:**
- [ ] Page loads with all components
- [ ] Loading states show correctly
- [ ] Error states show retry option
- [ ] Responsive layout works on mobile
- [ ] Month click navigates to correct monthly evaluation page

---

## Final Verification Checklist

### Functional Requirements
- [ ] Year overview page displays all 12 months
- [ ] Monthly totals show Work Days, Hours, Overtime/Balance, Flextime, Status
- [ ] Flextime progression chart shows monthly balance trend
- [ ] Vacation usage summary displays if data available
- [ ] Year selector navigation works (prev/next buttons, dropdown, current year button)
- [ ] Closed/open month indicators (status badges) display correctly
- [ ] Export to CSV works with correct data
- [ ] Export to PDF/Print opens print dialog
- [ ] Click month navigates to monthly evaluation detail page
- [ ] Year totals calculate correctly in table footer

### Non-Functional Requirements
- [ ] Page follows existing codebase patterns (vacation page, tariffs admin)
- [ ] Components are properly typed with TypeScript
- [ ] Loading states display skeleton UI
- [ ] Error states offer retry functionality
- [ ] Mobile responsive design works
- [ ] Navigation link appears in sidebar under Main section
- [ ] No console errors in development
- [ ] Code passes linting (`pnpm lint`)

### Manual Testing
1. Navigate to `/year-overview` from sidebar
2. Verify current year is selected by default
3. Navigate between years using arrows and dropdown
4. Verify data updates when year changes
5. Click on a month row and verify navigation to monthly evaluation
6. Export CSV and verify file contents
7. Click Print/PDF and verify print dialog opens
8. Test on mobile viewport
9. Test with employee that has no data for some months

## File Summary

**New Files:**
- `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/year-overview/page.tsx`
- `/home/tolga/projects/terp/apps/web/src/components/year-overview/index.ts`
- `/home/tolga/projects/terp/apps/web/src/components/year-overview/year-overview-table.tsx`
- `/home/tolga/projects/terp/apps/web/src/components/year-overview/year-summary-cards.tsx`
- `/home/tolga/projects/terp/apps/web/src/components/year-overview/flextime-chart.tsx`
- `/home/tolga/projects/terp/apps/web/src/components/year-overview/year-export-buttons.tsx`

**Modified Files:**
- `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

## Dependencies

- No new npm packages required
- Uses existing: @tanstack/react-query, lucide-react, openapi-fetch
- Existing hooks: useMonthlyValues, useEmployeeVacationBalance
- Existing components: YearSelector, Card, Table, Badge, Button, TimeDisplay
