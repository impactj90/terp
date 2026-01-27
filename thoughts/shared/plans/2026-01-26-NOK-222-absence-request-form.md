# Implementation Plan: NOK-222 - Absence Request Form

## Overview

Build a comprehensive absence request page with calendar-based date selection, absence type picker, vacation balance preview, and pending requests management. The implementation follows existing patterns from the timesheet and time-clock features.

## Architecture Decisions

Based on the research document and existing codebase analysis:

1. **Form Pattern**: Use Sheet component for the request form (consistent with booking-edit-dialog.tsx)
2. **Calendar Component**: Build custom calendar picker adapting the month-view.tsx grid pattern
3. **State Management**: Local useState for form state, TanStack Query for server state
4. **API Hooks**: Create dedicated hooks in `/hooks/api/` following existing patterns
5. **Missing UI Components**: Create Popover, Textarea, and RadioGroup components (shadcn-style)
6. **Page Structure**: New route at `/absences` with components in dedicated folder
7. **Date Range Selection**: Custom implementation using the calendar grid with multi-day selection support

## Phase 1: UI Component Prerequisites

### Description
Create the missing UI primitives needed for the absence request form before building feature components.

### Files to Create

- `apps/web/src/components/ui/popover.tsx` - Radix-based popover for calendar dropdown
- `apps/web/src/components/ui/textarea.tsx` - Multi-line text input for notes
- `apps/web/src/components/ui/radio-group.tsx` - Radio button group for half-day selection

### Implementation Details

**1.1 Popover Component**
```tsx
// Based on Radix UI Popover primitive
// Pattern: Same structure as existing Select component
import * as PopoverPrimitive from '@radix-ui/react-popover'

// Exports: Popover, PopoverTrigger, PopoverContent, PopoverAnchor
```

**1.2 Textarea Component**
```tsx
// Simple extension of Input pattern
// Add: resize-none, min-h-[80px] defaults
// Support: rows prop, disabled state
```

**1.3 RadioGroup Component**
```tsx
// Based on Radix UI RadioGroup primitive
// Pattern: Similar to Select with RadioGroupItem children
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'

// Exports: RadioGroup, RadioGroupItem
```

### Verification
- [ ] Manual: Each component renders correctly in isolation
- [ ] Manual: Popover opens/closes properly, handles outside click
- [ ] Manual: Textarea accepts multi-line input
- [ ] Manual: RadioGroup allows single selection with keyboard navigation

---

## Phase 2: API Hooks for Absences

### Description
Create React Query hooks for all absence-related API operations following existing hook patterns.

### Files to Create

- `apps/web/src/hooks/api/use-absences.ts` - Absence CRUD and types hooks
- `apps/web/src/hooks/api/use-holidays.ts` - Holidays query hook

### Files to Modify

- `apps/web/src/hooks/api/index.ts` - Export new hooks

### Implementation Details

**2.1 Absence Hooks (`use-absences.ts`)**
```typescript
import { useApiQuery, useApiMutation } from '@/hooks'

// Fetch all absence types
export function useAbsenceTypes(enabled = true) {
  return useApiQuery('/absence-types', { enabled })
}

// Fetch employee absences with date range filter
export function useEmployeeAbsences(
  employeeId: string,
  options?: { from?: string; to?: string; enabled?: boolean }
) {
  return useApiQuery('/employees/{id}/absences', {
    path: { id: employeeId },
    params: { from: options?.from, to: options?.to },
    enabled: options?.enabled ?? !!employeeId,
  })
}

// Create absence range mutation
export function useCreateAbsenceRange(employeeId: string) {
  return useApiMutation('/employees/{id}/absences', 'post', {
    path: { id: employeeId },
    invalidateKeys: [
      ['/employees/{id}/absences'],
      ['/employees/{id}/vacation-balance'],
    ],
  })
}

// Delete absence mutation
export function useDeleteAbsence() {
  return useApiMutation('/absences/{id}', 'delete', {
    invalidateKeys: [
      ['/employees/{id}/absences'],
      ['/employees/{id}/vacation-balance'],
    ],
  })
}
```

**2.2 Holidays Hook (`use-holidays.ts`)**
```typescript
export function useHolidays(options?: {
  from?: string
  to?: string
  year?: number
  enabled?: boolean
}) {
  return useApiQuery('/holidays', {
    params: {
      from: options?.from,
      to: options?.to,
      year: options?.year,
    },
    enabled: options?.enabled ?? true,
  })
}
```

**2.3 Update Index Exports**
```typescript
// Add to apps/web/src/hooks/api/index.ts
export * from './use-absences'
export * from './use-holidays'
```

### Verification
- [ ] Manual: Call useAbsenceTypes in a test component, verify data loads
- [ ] Manual: Call useEmployeeAbsences with date range, verify filtering works
- [ ] Manual: Call useHolidays, verify holiday data returns
- [ ] Automated: `pnpm type-check` passes without errors

---

## Phase 3: Calendar Date Range Picker Component

### Description
Build a reusable calendar component with date range selection, holiday/absence highlighting, and month navigation.

### Files to Create

- `apps/web/src/components/ui/calendar.tsx` - Base calendar grid component
- `apps/web/src/components/ui/date-range-picker.tsx` - Date range picker with popover

### Implementation Details

**3.1 Calendar Component (`calendar.tsx`)**
```typescript
interface CalendarProps {
  // Core props
  month: Date                           // Current displayed month
  onMonthChange?: (month: Date) => void // Month navigation

  // Selection
  mode: 'single' | 'range'
  selected?: Date | { from?: Date; to?: Date }
  onSelect?: (date: Date | { from?: Date; to?: Date }) => void

  // Highlighting
  holidays?: Date[]                     // Dates to mark as holidays
  absences?: Date[]                     // Dates with existing absences

  // Constraints
  minDate?: Date                        // Earliest selectable date
  maxDate?: Date                        // Latest selectable date
  disabledDates?: Date[]                // Specific dates to disable
}

// Implementation approach:
// - Adapt grid logic from month-view.tsx (calendarGrid calculation)
// - Monday-first week (consistent with existing code)
// - Visual states: today, selected, in-range, holiday, absence, weekend, disabled
// - Keyboard navigation: arrow keys, Enter to select
// - Month navigation: prev/next buttons in header
```

**Calendar Visual Design:**
```
┌─────────────────────────────────────────────────┐
│  <  January 2026  >                             │
├─────────────────────────────────────────────────┤
│  Mon   Tue   Wed   Thu   Fri   Sat   Sun       │
├─────────────────────────────────────────────────┤
│        [1]   [2]   [3]   [4]   [5]   [6]       │
│  [7]   [8]   [9]   [10]  [11]  [12]  [13]      │
│  [14]  [15]  [16]  [17]  [18]  [19]  [20]      │
│  [21]  [22]  [23]  [24]  [25]  [26]  [27]      │
│  [28]  [29]  [30]  [31]                        │
└─────────────────────────────────────────────────┘

Legend:
- [N] with bg-primary: selected or in-range
- [N] with ring-2: today
- [N] with bg-muted: weekend
- [N] with red dot: holiday
- [N] with blue dot: existing absence
- [N] with opacity-50: disabled
```

**3.2 DateRangePicker Component (`date-range-picker.tsx`)**
```typescript
interface DateRangePickerProps {
  value?: { from?: Date; to?: Date }
  onChange?: (range: { from?: Date; to?: Date }) => void
  placeholder?: string
  disabled?: boolean
  holidays?: Date[]
  absences?: Date[]
  minDate?: Date
}

// Implementation:
// - Popover containing Calendar component
// - Display: "Jan 15 - Jan 20, 2026" or "Select dates..."
// - Two-click selection: first click sets from, second sets to
// - Visual range highlight between from and to
// - Clear button to reset selection
```

### Verification
- [ ] Manual: Calendar renders correct days for any month
- [ ] Manual: Month navigation works (prev/next buttons)
- [ ] Manual: Single date selection works with click
- [ ] Manual: Range selection works (from date, then to date)
- [ ] Manual: Holidays appear with indicator
- [ ] Manual: Weekends are visually distinct
- [ ] Manual: Past dates can be disabled via minDate
- [ ] Manual: DateRangePicker popover opens/closes correctly
- [ ] Manual: Selected range displays correctly in trigger

---

## Phase 4: Absence Type Selector Component

### Description
Build a visual absence type selector showing type names, descriptions, colors, and category badges.

### Files to Create

- `apps/web/src/components/absences/absence-type-selector.tsx` - Visual type picker

### Implementation Details

**4.1 AbsenceTypeSelector Component**
```typescript
interface AbsenceTypeSelectorProps {
  value?: string                        // Selected type ID
  onChange?: (typeId: string) => void
  types: AbsenceType[]                  // From useAbsenceTypes
  disabled?: boolean
}

interface AbsenceType {
  id: string
  code: string
  name: string
  description?: string
  category: 'vacation' | 'sick' | 'personal' | 'unpaid' | 'holiday' | 'other'
  color?: string                        // Hex color
  affects_vacation_balance?: boolean
  requires_approval?: boolean
}

// Visual design:
// - Grid of clickable cards (2 columns on mobile, 3 on desktop)
// - Each card shows:
//   - Color indicator (left border or dot)
//   - Name (bold)
//   - Description (muted, truncated)
//   - Category badge (vacation, sick, etc.)
//   - "Affects balance" indicator if true
// - Selected card has ring highlight
```

**Card Visual Design:**
```
┌──────────────────────────────────────┐
│ ● Vacation                    [✓]    │
│   Annual vacation leave              │
│   [vacation] [affects balance]       │
└──────────────────────────────────────┘
```

### Verification
- [ ] Manual: All absence types display with correct info
- [ ] Manual: Clicking a type selects it (visual feedback)
- [ ] Manual: Selected type has ring highlight
- [ ] Manual: Category badges display correctly
- [ ] Manual: Color indicators match type color

---

## Phase 5: Vacation Impact Preview Component

### Description
Build a component showing how the requested absence will impact vacation balance.

### Files to Create

- `apps/web/src/components/absences/vacation-impact-preview.tsx` - Balance impact display

### Implementation Details

**5.1 VacationImpactPreview Component**
```typescript
interface VacationImpactPreviewProps {
  currentBalance: number                // From useEmployeeVacationBalance
  requestedDays: number                 // Calculated from date range
  isHalfDay?: boolean                   // Reduce by 0.5 instead of 1
  absenceType?: AbsenceType             // To check if it affects balance
}

// Display:
// ┌─────────────────────────────────────────────┐
// │  Vacation Balance Impact                    │
// ├─────────────────────────────────────────────┤
// │  Current balance:        15 days            │
// │  Requested:             - 3 days            │
// │  ────────────────────────────               │
// │  After request:          12 days            │
// │                                             │
// │  [========|---] 12/30 remaining             │
// └─────────────────────────────────────────────┘

// Show warning if:
// - Resulting balance would be negative
// - Resulting balance is low (< 3 days)
// Show info if:
// - Absence type doesn't affect balance
```

**Calculation Logic:**
```typescript
function calculateWorkingDays(from: Date, to: Date, holidays: Date[]): number {
  // Count business days (Mon-Fri) excluding holidays
  let count = 0
  const current = new Date(from)
  while (current <= to) {
    const isWeekend = current.getDay() === 0 || current.getDay() === 6
    const isHoliday = holidays.some(h => isSameDay(h, current))
    if (!isWeekend && !isHoliday) {
      count++
    }
    current.setDate(current.getDate() + 1)
  }
  return count
}
```

### Verification
- [ ] Manual: Preview shows current balance from API
- [ ] Manual: Requested days calculated correctly (weekends excluded)
- [ ] Manual: Holidays excluded from day count
- [ ] Manual: Half-day option reduces count by 0.5
- [ ] Manual: Warning appears for negative balance
- [ ] Manual: Info appears when type doesn't affect balance
- [ ] Manual: Progress bar reflects new projected balance

---

## Phase 6: Absence Request Form Component

### Description
Build the main absence request form combining all subcomponents with validation and submission.

### Files to Create

- `apps/web/src/components/absences/absence-request-form.tsx` - Main form component

### Implementation Details

**6.1 AbsenceRequestForm Component**
```typescript
interface AbsenceRequestFormProps {
  employeeId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void

  // Optional: pre-fill dates from calendar click
  initialDates?: { from?: Date; to?: Date }
}

// Form State:
// - absenceTypeId: string
// - dateRange: { from?: Date; to?: Date }
// - duration: '1' | '0.5'              // Full or half day
// - halfDayPortion: 'morning' | 'afternoon'  // When half day
// - notes: string

// Component Structure (Sheet):
// ┌─────────────────────────────────────────────┐
// │  Request Absence                        [X] │
// ├─────────────────────────────────────────────┤
// │                                             │
// │  Absence Type                               │
// │  ┌─────────────────────────────────────┐   │
// │  │ [AbsenceTypeSelector]               │   │
// │  └─────────────────────────────────────┘   │
// │                                             │
// │  Dates                                      │
// │  ┌─────────────────────────────────────┐   │
// │  │ [DateRangePicker]                   │   │
// │  └─────────────────────────────────────┘   │
// │                                             │
// │  Duration                                   │
// │  ○ Full day(s)  ○ Half day                 │
// │                                             │
// │  [If half day:]                            │
// │  ○ Morning  ○ Afternoon                    │
// │                                             │
// │  [VacationImpactPreview]                   │
// │                                             │
// │  Notes (optional)                          │
// │  ┌─────────────────────────────────────┐   │
// │  │ [Textarea]                          │   │
// │  └─────────────────────────────────────┘   │
// │                                             │
// │  [Cancel]                    [Submit Request]│
// └─────────────────────────────────────────────┘
```

**Validation Rules:**
```typescript
function validateAbsenceRequest(form: FormState): string[] {
  const errors: string[] = []

  if (!form.absenceTypeId) {
    errors.push('Please select an absence type')
  }

  if (!form.dateRange.from) {
    errors.push('Please select a start date')
  }

  if (!form.dateRange.to) {
    errors.push('Please select an end date')
  }

  if (form.dateRange.from && form.dateRange.to) {
    if (form.dateRange.from > form.dateRange.to) {
      errors.push('End date must be after start date')
    }

    // Check for overlapping absences
    // (requires checking against existing absences)
  }

  if (form.duration === '0.5' && !form.halfDayPortion) {
    errors.push('Please select morning or afternoon for half day')
  }

  return errors
}
```

**Overlap Detection:**
```typescript
function hasOverlap(
  from: Date,
  to: Date,
  existingAbsences: Absence[]
): Absence | undefined {
  return existingAbsences.find(absence => {
    const absFrom = parseISODate(absence.from)
    const absTo = parseISODate(absence.to)
    return !(to < absFrom || from > absTo)
  })
}
```

### Verification
- [ ] Manual: Form opens in Sheet component
- [ ] Manual: Absence type selection works
- [ ] Manual: Date range picker opens and selects dates
- [ ] Manual: Duration toggle switches between full/half day
- [ ] Manual: Half day options appear when half day selected
- [ ] Manual: Vacation impact preview updates as dates change
- [ ] Manual: Notes textarea accepts input
- [ ] Manual: Validation errors display for missing fields
- [ ] Manual: Submit button disabled while submitting
- [ ] Manual: Success closes form and refreshes list
- [ ] Manual: Error displays in Alert component

---

## Phase 7: Pending Requests List Component

### Description
Build a component showing the employee's pending and recent absence requests.

### Files to Create

- `apps/web/src/components/absences/pending-requests.tsx` - Request list with status

### Implementation Details

**7.1 PendingRequests Component**
```typescript
interface PendingRequestsProps {
  employeeId: string
  onEdit?: (absence: Absence) => void
  onDelete?: (absenceId: string) => void
}

// Fetch absences for current year + next year
// Group by status: pending, approved, rejected

// Display:
// ┌─────────────────────────────────────────────────┐
// │  Pending Requests (2)                           │
// ├─────────────────────────────────────────────────┤
// │  ┌─────────────────────────────────────────┐   │
// │  │ 🌴 Vacation                    [Pending] │   │
// │  │ Jan 15 - Jan 20, 2026 (4 days)          │   │
// │  │ "Family trip"                    [Delete]│   │
// │  └─────────────────────────────────────────┘   │
// │  ┌─────────────────────────────────────────┐   │
// │  │ 🤒 Sick Leave                 [Approved] │   │
// │  │ Jan 10, 2026 (1 day)                    │   │
// │  └─────────────────────────────────────────┘   │
// └─────────────────────────────────────────────────┘

// Status badges:
// - Pending: yellow/orange
// - Approved: green
// - Rejected: red

// Actions:
// - Delete: Only for pending requests (with confirmation)
```

**Empty State:**
```tsx
<div className="text-center py-8 text-muted-foreground">
  <Calendar className="mx-auto h-12 w-12 mb-4 opacity-50" />
  <p>No absence requests</p>
  <p className="text-sm">Click "Request Absence" to get started</p>
</div>
```

### Verification
- [ ] Manual: Pending requests display in chronological order
- [ ] Manual: Status badges show correct colors
- [ ] Manual: Delete button only shows for pending requests
- [ ] Manual: Delete confirmation dialog appears
- [ ] Manual: Successful delete removes item and refreshes list
- [ ] Manual: Empty state displays when no requests
- [ ] Manual: Loading skeleton during fetch

---

## Phase 8: Absences Page and Route

### Description
Create the main absences page integrating all components with proper layout.

### Files to Create

- `apps/web/src/app/(dashboard)/absences/page.tsx` - Main page component

### Implementation Details

**8.1 Absences Page**
```typescript
'use client'

// Page layout:
// ┌─────────────────────────────────────────────────────────┐
// │  Absences                              [Request Absence]│
// │  Request and manage your time off                       │
// ├─────────────────────────────────────────────────────────┤
// │                                                         │
// │  ┌─ Vacation Balance ─┐  ┌─── Calendar Overview ────┐  │
// │  │ 15 / 30 days       │  │                          │  │
// │  │ [========|---]     │  │  [Interactive Calendar]  │  │
// │  │ 12 used, 3 planned │  │  Shows holidays, absences│  │
// │  └────────────────────┘  │                          │  │
// │                          │  Click date to request   │  │
// │  ┌─ Pending Requests ─┐  │                          │  │
// │  │ [List of requests] │  │                          │  │
// │  └────────────────────┘  └──────────────────────────┘  │
// │                                                         │
// └─────────────────────────────────────────────────────────┘

// Two-column layout on desktop:
// Left: Vacation balance + Pending requests
// Right: Calendar overview

// Mobile: Stack vertically
```

**Page Structure:**
```tsx
export default function AbsencesPage() {
  const { user } = useAuth()
  const employeeId = user?.employee_id

  const [formOpen, setFormOpen] = useState(false)
  const [selectedDates, setSelectedDates] = useState<{ from?: Date; to?: Date }>()

  const handleCalendarClick = (date: Date) => {
    setSelectedDates({ from: date, to: date })
    setFormOpen(true)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Absences</h1>
          <p className="text-muted-foreground">Request and manage your time off</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Request Absence
        </Button>
      </div>

      {/* Content grid */}
      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        {/* Left column */}
        <div className="space-y-6">
          <VacationBalanceCard employeeId={employeeId} />
          <Card>
            <CardHeader>
              <CardTitle>Your Requests</CardTitle>
            </CardHeader>
            <CardContent>
              <PendingRequests employeeId={employeeId} />
            </CardContent>
          </Card>
        </div>

        {/* Right column - Calendar */}
        <Card>
          <CardHeader>
            <CardTitle>Calendar Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <AbsenceCalendarView
              employeeId={employeeId}
              onDateClick={handleCalendarClick}
            />
          </CardContent>
        </Card>
      </div>

      {/* Request form */}
      <AbsenceRequestForm
        employeeId={employeeId}
        open={formOpen}
        onOpenChange={setFormOpen}
        initialDates={selectedDates}
      />
    </div>
  )
}
```

### Verification
- [ ] Manual: Page loads at /absences route
- [ ] Manual: Sidebar navigation shows Absences link active
- [ ] Manual: Vacation balance card displays current balance
- [ ] Manual: Calendar shows current month with holidays
- [ ] Manual: Existing absences marked on calendar
- [ ] Manual: Clicking a date opens request form with date pre-filled
- [ ] Manual: "Request Absence" button opens form
- [ ] Manual: Pending requests list displays correctly
- [ ] Manual: Responsive layout works on mobile
- [ ] Manual: Loading states display during data fetch

---

## Phase 9: Calendar Overview Component

### Description
Build a dedicated calendar view for the absences page showing a month with holidays and absences.

### Files to Create

- `apps/web/src/components/absences/absence-calendar-view.tsx` - Calendar with context

### Implementation Details

**9.1 AbsenceCalendarView Component**
```typescript
interface AbsenceCalendarViewProps {
  employeeId?: string
  onDateClick?: (date: Date) => void
}

// Features:
// - Uses Calendar component in single-date mode
// - Fetches holidays for displayed month range
// - Fetches employee absences for displayed month range
// - Month navigation (prev/next)
// - Shows legend for indicators

// Legend:
// ● Holiday (red)
// ● Your absence (blue)
// ● Weekend (gray background)
// ○ Today (ring)

// Click behavior:
// - Click any date to start absence request
// - Dates with existing absences show tooltip with details
```

**Integration with Calendar:**
```tsx
function AbsenceCalendarView({ employeeId, onDateClick }: AbsenceCalendarViewProps) {
  const [month, setMonth] = useState(new Date())

  const { start, end } = getMonthRange(month)

  const { data: holidaysData } = useHolidays({
    from: formatDate(start),
    to: formatDate(end),
  })

  const { data: absencesData } = useEmployeeAbsences(employeeId ?? '', {
    from: formatDate(start),
    to: formatDate(end),
    enabled: !!employeeId,
  })

  const holidays = useMemo(() =>
    holidaysData?.data?.map(h => parseISODate(h.date)) ?? [],
    [holidaysData]
  )

  const absences = useMemo(() => {
    // Expand absence ranges to individual dates
    const dates: Date[] = []
    for (const absence of absencesData?.data ?? []) {
      const current = parseISODate(absence.from)
      const end = parseISODate(absence.to)
      while (current <= end) {
        dates.push(new Date(current))
        current.setDate(current.getDate() + 1)
      }
    }
    return dates
  }, [absencesData])

  return (
    <div className="space-y-4">
      <Calendar
        mode="single"
        month={month}
        onMonthChange={setMonth}
        onSelect={(date) => date && onDateClick?.(date)}
        holidays={holidays}
        absences={absences}
      />

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-red-500" />
          <span className="text-muted-foreground">Holiday</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-blue-500" />
          <span className="text-muted-foreground">Your absence</span>
        </div>
      </div>
    </div>
  )
}
```

### Verification
- [ ] Manual: Calendar displays current month on load
- [ ] Manual: Holidays marked with red indicator
- [ ] Manual: Absences marked with blue indicator
- [ ] Manual: Month navigation updates displayed month
- [ ] Manual: API calls update when month changes
- [ ] Manual: Legend displays correctly
- [ ] Manual: Clicking date triggers onDateClick callback

---

## Phase 10: Integration Testing and Polish

### Description
Final integration testing, error handling improvements, and UX polish.

### Files to Modify

- Various components for edge case handling
- `apps/web/src/lib/time-utils.ts` - Add date range utilities if needed

### Implementation Details

**10.1 Error Boundary Handling**
- Wrap components in error boundaries
- Add retry buttons for failed queries
- Handle network disconnection gracefully

**10.2 Loading States**
- Skeleton loaders for all async components
- Disable form while submitting
- Show progress indicator for multi-day calculations

**10.3 Edge Cases to Handle**
```typescript
// 1. Employee without vacation balance record
// - Show "Not configured" message
// - Allow requests but skip balance preview

// 2. Selecting dates with existing absences
// - Show warning before submission
// - Highlight conflicting dates in calendar

// 3. Past dates selection
// - Allow if within reasonable window (e.g., 30 days)
// - Show warning for past dates

// 4. Very long date ranges
// - Show breakdown of working days
// - Confirm before submitting >10 days

// 5. Half-day on multi-day range
// - Disable half-day option for ranges > 1 day
// - Show tooltip explaining why
```

**10.4 Accessibility Improvements**
```typescript
// - All form fields have proper labels
// - Calendar has keyboard navigation (arrow keys)
// - Focus trapping in Sheet component
// - Screen reader announcements for selections
// - ARIA labels for status badges
```

**10.5 Mobile Responsiveness**
```typescript
// - Stack layout on mobile
// - Full-width form sheet
// - Touch-friendly calendar cells (min 44x44px)
// - Swipe for month navigation (optional)
```

### Verification
- [ ] Manual: Test complete flow from page load to submission
- [ ] Manual: Test form with missing vacation balance
- [ ] Manual: Test overlap detection with existing absences
- [ ] Manual: Test half-day option behavior
- [ ] Manual: Test on mobile viewport
- [ ] Manual: Test keyboard navigation in calendar
- [ ] Manual: Verify no console errors
- [ ] Automated: `pnpm lint` passes
- [ ] Automated: `pnpm type-check` passes
- [ ] Automated: `pnpm build` succeeds

---

## Success Criteria

1. **Functional Requirements**
   - [ ] User can navigate to /absences page
   - [ ] User can view their vacation balance
   - [ ] User can view a calendar with holidays and existing absences
   - [ ] User can open absence request form
   - [ ] User can select absence type from visual picker
   - [ ] User can select date range via calendar
   - [ ] User can choose half-day option with morning/afternoon
   - [ ] User can see vacation balance impact before submitting
   - [ ] User can add optional notes
   - [ ] User can submit request successfully
   - [ ] User can view pending requests
   - [ ] User can delete pending requests
   - [ ] Form validates and shows errors for invalid input
   - [ ] Overlapping absence requests are detected

2. **Non-Functional Requirements**
   - [ ] Page loads within 2 seconds
   - [ ] Calendar navigation is smooth
   - [ ] All states have loading/error handling
   - [ ] Mobile responsive layout
   - [ ] Accessible via keyboard
   - [ ] Consistent with existing UI patterns

3. **Technical Requirements**
   - [ ] TypeScript types are correct
   - [ ] No eslint warnings
   - [ ] Components follow existing patterns
   - [ ] API hooks follow existing patterns
   - [ ] Build succeeds without errors

---

## Dependencies

### External
- `@radix-ui/react-popover` - For date picker popover (may need install)
- `@radix-ui/react-radio-group` - For half-day selection (may need install)

### Internal
- Existing vacation balance API endpoint working
- Absence types seeded in database
- Holiday data seeded for test dates
- Employee linked to authenticated user

### Pre-Implementation Checks
```bash
# Verify API endpoints respond correctly
curl -H "Authorization: Bearer $TOKEN" -H "X-Tenant-ID: $TENANT" \
  http://localhost:3000/api/v1/absence-types

curl -H "Authorization: Bearer $TOKEN" -H "X-Tenant-ID: $TENANT" \
  http://localhost:3000/api/v1/employees/$EMPLOYEE_ID/vacation-balance

curl -H "Authorization: Bearer $TOKEN" -H "X-Tenant-ID: $TENANT" \
  http://localhost:3000/api/v1/holidays?year=2026
```

---

## File Summary

### New Files to Create (15 files)

| File | Phase | Description |
|------|-------|-------------|
| `apps/web/src/components/ui/popover.tsx` | 1 | Radix popover primitive |
| `apps/web/src/components/ui/textarea.tsx` | 1 | Multi-line text input |
| `apps/web/src/components/ui/radio-group.tsx` | 1 | Radio button group |
| `apps/web/src/hooks/api/use-absences.ts` | 2 | Absence API hooks |
| `apps/web/src/hooks/api/use-holidays.ts` | 2 | Holiday API hook |
| `apps/web/src/components/ui/calendar.tsx` | 3 | Calendar grid component |
| `apps/web/src/components/ui/date-range-picker.tsx` | 3 | Date range picker |
| `apps/web/src/components/absences/absence-type-selector.tsx` | 4 | Type picker component |
| `apps/web/src/components/absences/vacation-impact-preview.tsx` | 5 | Balance impact preview |
| `apps/web/src/components/absences/absence-request-form.tsx` | 6 | Main form component |
| `apps/web/src/components/absences/pending-requests.tsx` | 7 | Request list component |
| `apps/web/src/app/(dashboard)/absences/page.tsx` | 8 | Absences page |
| `apps/web/src/components/absences/absence-calendar-view.tsx` | 9 | Calendar overview |

### Files to Modify (1 file)

| File | Phase | Changes |
|------|-------|---------|
| `apps/web/src/hooks/api/index.ts` | 2 | Export new hooks |

---

*Plan created: 2026-01-26*
*Ticket: NOK-222*
*Estimated phases: 10*
