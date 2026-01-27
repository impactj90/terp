# Implementation Plan: NOK-219 - Build Employee Dashboard

## Overview

Build a personalized employee dashboard showing key metrics, quick actions, and pending items at a glance. The dashboard will replace the current placeholder dashboard page with functional components backed by real API data.

## Prerequisites

- User must be authenticated
- User should be linked to an employee record (via email match or explicit association)
- API endpoints for daily-values, monthly-values, vacation-balances, and bookings must be operational

## Architecture

### Component Hierarchy

```
app/(dashboard)/dashboard/page.tsx
├── DashboardHeader
│   └── Welcome message with user name
├── QuickActionsBar
│   ├── ClockInButton
│   ├── RequestTimeOffButton
│   └── ViewTimesheetButton
├── DashboardGrid (responsive: 1 col mobile, 2 cols tablet, 4 cols desktop)
│   ├── TodayScheduleCard
│   ├── HoursThisWeekCard (with mini chart)
│   ├── VacationBalanceCard
│   └── FlextimeBalanceCard
├── PendingActionsSection
│   └── PendingActionsList
└── RecentActivitySection
    └── RecentActivityFeed
```

### Data Flow

```
Auth Context (user)
    └── useCurrentEmployee (new hook)
            └── Employee ID
                    ├── useVacationBalance
                    ├── useDailyValues (this week)
                    ├── useMonthlyValue (current month)
                    ├── useEmployeeDayView (today)
                    └── useBookings (recent)
```

---

## Phase 1: Create Data Fetching Hooks

**Goal**: Create the API hooks needed for dashboard data fetching.

### Files to Create

#### 1. `/home/tolga/projects/terp/apps/web/src/hooks/api/use-daily-values.ts`

```typescript
interface UseDailyValuesOptions {
  employeeId?: string
  from?: string  // YYYY-MM-DD
  to?: string    // YYYY-MM-DD
  limit?: number
  enabled?: boolean
}

export function useDailyValues(options: UseDailyValuesOptions = {})
export function useDailyValue(id: string, enabled?: boolean)
```

Hook pattern following existing `use-bookings.ts`.

#### 2. `/home/tolga/projects/terp/apps/web/src/hooks/api/use-monthly-values.ts`

```typescript
interface UseMonthlyValuesOptions {
  employeeId?: string
  year?: number
  month?: number
  enabled?: boolean
}

export function useMonthlyValues(options: UseMonthlyValuesOptions = {})
export function useMonthlyValue(id: string, enabled?: boolean)
```

#### 3. `/home/tolga/projects/terp/apps/web/src/hooks/api/use-vacation-balance.ts`

```typescript
export function useVacationBalances(options: { employeeId?: string; year?: number; enabled?: boolean } = {})
export function useVacationBalance(id: string, enabled?: boolean)
export function useEmployeeVacationBalance(employeeId: string, year?: number, enabled?: boolean)
```

Use `/employees/{id}/vacation-balance` endpoint for current employee balance.

#### 4. `/home/tolga/projects/terp/apps/web/src/hooks/api/use-employee-day.ts`

```typescript
export function useEmployeeDayView(employeeId: string, date: string, enabled?: boolean)
```

Use `/employees/{id}/day/{date}` endpoint.

#### 5. Update `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts`

Export all new hooks.

### Verification

- [ ] All hooks compile without TypeScript errors
- [ ] Each hook returns typed data matching API schemas
- [ ] Hooks follow existing patterns (useApiQuery wrapper)

---

## Phase 2: Create Utility Functions

**Goal**: Create helper functions for time formatting and calculations.

### Files to Create

#### 1. `/home/tolga/projects/terp/apps/web/src/lib/time-utils.ts`

```typescript
/**
 * Format minutes to HH:MM string
 * @example formatMinutes(510) => "8:30"
 */
export function formatMinutes(minutes: number): string

/**
 * Format minutes to human readable duration
 * @example formatDuration(510) => "8h 30m"
 */
export function formatDuration(minutes: number): string

/**
 * Format balance with +/- indicator
 * @example formatBalance(30) => "+0:30"
 * @example formatBalance(-60) => "-1:00"
 */
export function formatBalance(minutes: number): string

/**
 * Get start of current week (Monday)
 */
export function getWeekStart(date?: Date): Date

/**
 * Get end of current week (Sunday)
 */
export function getWeekEnd(date?: Date): Date

/**
 * Format date as YYYY-MM-DD
 */
export function formatDate(date: Date): string
```

### Verification

- [ ] Unit tests pass (optional but recommended)
- [ ] Functions work with edge cases (negative values, zero, large values)

---

## Phase 3: Create Dashboard Card Components

**Goal**: Build reusable card components for the dashboard.

### Files to Create

#### 1. `/home/tolga/projects/terp/apps/web/src/components/dashboard/stats-card.tsx`

Refactor existing inline `StatsCard` to a reusable component:

```typescript
interface StatsCardProps {
  title: string
  value: string
  description?: string
  icon?: React.ComponentType<{ className?: string }>
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  isLoading?: boolean
  error?: Error | null
  onRetry?: () => void
}

export function StatsCard(props: StatsCardProps)
export function StatsCardSkeleton()
```

Features:
- Loading state with skeleton
- Error state with retry button
- Optional trend indicator
- Consistent styling using Card components

#### 2. `/home/tolga/projects/terp/apps/web/src/components/dashboard/hours-this-week-card.tsx`

```typescript
interface HoursThisWeekCardProps {
  employeeId: string
}

export function HoursThisWeekCard({ employeeId }: HoursThisWeekCardProps)
```

Features:
- Fetch daily values for current week
- Show total hours worked
- Show remaining hours to target
- Mini bar chart showing daily breakdown (optional, can use simple bars)
- Loading skeleton
- Error state with retry

#### 3. `/home/tolga/projects/terp/apps/web/src/components/dashboard/vacation-balance-card.tsx`

```typescript
interface VacationBalanceCardProps {
  employeeId: string
}

export function VacationBalanceCard({ employeeId }: VacationBalanceCardProps)
```

Features:
- Show remaining vacation days
- Show planned/pending requests
- Show total entitlement
- Visual progress bar
- Loading skeleton
- Error state with retry

#### 4. `/home/tolga/projects/terp/apps/web/src/components/dashboard/flextime-balance-card.tsx`

```typescript
interface FlextimeBalanceCardProps {
  employeeId: string
}

export function FlextimeBalanceCard({ employeeId }: FlextimeBalanceCardProps)
```

Features:
- Show current flextime balance from monthly value
- +/- color indicator (green for positive, red for negative)
- Show target vs actual for current month
- Loading skeleton
- Error state with retry

#### 5. `/home/tolga/projects/terp/apps/web/src/components/dashboard/today-schedule-card.tsx`

```typescript
interface TodayScheduleCardProps {
  employeeId: string
}

export function TodayScheduleCard({ employeeId }: TodayScheduleCardProps)
```

Features:
- Show today's expected hours from day plan
- Show current status (clocked in/out)
- Show bookings for today
- Indicate if holiday/weekend
- Loading skeleton
- Error state with retry

### Verification

- [ ] All components render correctly with mock data
- [ ] Loading states display properly
- [ ] Error states display with retry functionality
- [ ] Components are responsive

---

## Phase 4: Create Quick Actions and Activity Components

**Goal**: Build the quick actions bar and activity feed.

### Files to Create

#### 1. `/home/tolga/projects/terp/apps/web/src/components/dashboard/quick-actions.tsx`

```typescript
interface QuickActionsProps {
  employeeId?: string
}

export function QuickActions({ employeeId }: QuickActionsProps)
```

Features:
- Clock In/Out button (dynamic based on current status)
- Request Time Off button (link to /absences/new or modal)
- View Timesheet button (link to /timesheet)
- Responsive: horizontal on desktop, stacked on mobile

#### 2. `/home/tolga/projects/terp/apps/web/src/components/dashboard/pending-actions.tsx`

```typescript
interface PendingActionsProps {
  employeeId: string
}

export function PendingActions({ employeeId }: PendingActionsProps)
```

Features:
- List of items needing attention:
  - Missing bookings (from daily errors)
  - Pending corrections
  - Incomplete days
- Empty state when nothing pending
- Link to correction assistant
- Loading skeleton
- Error state

#### 3. `/home/tolga/projects/terp/apps/web/src/components/dashboard/recent-activity.tsx`

```typescript
interface RecentActivityProps {
  employeeId: string
  limit?: number  // Default: 5
}

export function RecentActivity({ employeeId, limit = 5 }: RecentActivityProps)
```

Features:
- Show last N bookings/activities
- Format as timeline with time and description
- Link to view all activity
- Empty state for no recent activity
- Loading skeleton
- Error state

### Verification

- [ ] Quick actions are clickable and navigate correctly
- [ ] Pending actions show real errors from API
- [ ] Recent activity displays bookings correctly
- [ ] Empty states are user-friendly

---

## Phase 5: Assemble Dashboard Page

**Goal**: Integrate all components into the dashboard page.

### Files to Modify

#### 1. `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/dashboard/page.tsx`

Replace current implementation with:

```typescript
'use client'

import { useAuth } from '@/providers/auth-provider'
import { useEmployees } from '@/hooks/api/use-employees'
// Import dashboard components...

export default function DashboardPage() {
  const { user } = useAuth()

  // Fetch employee by user email (temporary solution)
  // TODO: Add proper user-employee linking
  const { data: employeesData } = useEmployees({
    search: user?.email,
    limit: 1,
    enabled: !!user?.email,
  })
  const employeeId = employeesData?.data?.[0]?.id

  return (
    <div className="space-y-6">
      {/* Dashboard Header */}
      <DashboardHeader user={user} />

      {/* Quick Actions */}
      <QuickActions employeeId={employeeId} />

      {/* Stats Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <TodayScheduleCard employeeId={employeeId} />
        <HoursThisWeekCard employeeId={employeeId} />
        <VacationBalanceCard employeeId={employeeId} />
        <FlextimeBalanceCard employeeId={employeeId} />
      </div>

      {/* Two column layout for pending + activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <PendingActions employeeId={employeeId} />
        <RecentActivity employeeId={employeeId} />
      </div>
    </div>
  )
}
```

#### 2. Create `/home/tolga/projects/terp/apps/web/src/components/dashboard/dashboard-header.tsx`

```typescript
interface DashboardHeaderProps {
  user: User | null
}

export function DashboardHeader({ user }: DashboardHeaderProps)
```

Features:
- Welcome message with time-aware greeting
- User's display name
- Current date

#### 3. Create `/home/tolga/projects/terp/apps/web/src/components/dashboard/index.ts`

Export all dashboard components for clean imports.

### Verification

- [ ] Dashboard page loads without errors
- [ ] All cards display loading states initially
- [ ] Data loads and displays correctly
- [ ] Page is responsive (test mobile, tablet, desktop)
- [ ] No console errors

---

## Phase 6: Polish and Edge Cases

**Goal**: Handle edge cases and improve UX.

### Tasks

1. **No Employee Linked State**
   - Show friendly message if user has no linked employee
   - Provide guidance on how to link account

2. **Empty States**
   - No bookings this week
   - No vacation balance configured
   - No pending actions (positive state)

3. **Performance Optimization**
   - Ensure queries use appropriate staleTime
   - Parallel data fetching where possible
   - Consider React Suspense boundaries

4. **Accessibility**
   - Ensure all cards have proper ARIA labels
   - Keyboard navigation works
   - Screen reader friendly

5. **Dark Mode**
   - Verify all components work in dark mode
   - Check contrast ratios

### Files to Modify

- Dashboard components as needed
- May need to add loading boundary component

### Verification

- [ ] All edge cases handled gracefully
- [ ] Dashboard loads within 2 seconds (AC requirement)
- [ ] Lighthouse accessibility score > 90
- [ ] Works in both light and dark mode

---

## File Summary

### New Files to Create

| File | Purpose |
|------|---------|
| `src/hooks/api/use-daily-values.ts` | Daily values API hook |
| `src/hooks/api/use-monthly-values.ts` | Monthly values API hook |
| `src/hooks/api/use-vacation-balance.ts` | Vacation balance API hook |
| `src/hooks/api/use-employee-day.ts` | Employee day view API hook |
| `src/lib/time-utils.ts` | Time formatting utilities |
| `src/components/dashboard/stats-card.tsx` | Reusable stats card |
| `src/components/dashboard/hours-this-week-card.tsx` | Weekly hours card |
| `src/components/dashboard/vacation-balance-card.tsx` | Vacation balance card |
| `src/components/dashboard/flextime-balance-card.tsx` | Flextime balance card |
| `src/components/dashboard/today-schedule-card.tsx` | Today's schedule card |
| `src/components/dashboard/quick-actions.tsx` | Quick action buttons |
| `src/components/dashboard/pending-actions.tsx` | Pending actions list |
| `src/components/dashboard/recent-activity.tsx` | Recent activity feed |
| `src/components/dashboard/dashboard-header.tsx` | Dashboard header |
| `src/components/dashboard/index.ts` | Component exports |

### Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/api/index.ts` | Export new hooks |
| `src/app/(dashboard)/dashboard/page.tsx` | Replace with new implementation |

---

## API Dependencies

| Endpoint | Used By |
|----------|---------|
| `GET /auth/me` | Current user (existing) |
| `GET /employees` | Find employee by email |
| `GET /employees/{id}/vacation-balance` | VacationBalanceCard |
| `GET /employees/{id}/day/{date}` | TodayScheduleCard |
| `GET /daily-values` | HoursThisWeekCard, PendingActions |
| `GET /monthly-values` | FlextimeBalanceCard |
| `GET /bookings` | RecentActivity |
| `POST /bookings` | QuickActions (clock in/out) |

---

## Known Limitations / Future Work

1. **User-Employee Linking**: Currently matching by email. Should add proper `employee_id` to User model or create `/auth/me/employee` endpoint.

2. **Clock In/Out**: Requires knowing the correct booking type IDs. May need to fetch booking types first.

3. **Mini Charts**: Deferred to future iteration. Can add simple bar visualization later.

4. **Real-time Updates**: Dashboard data is fetched on mount. Consider WebSocket or polling for live updates.

---

## Success Criteria Checklist

- [ ] Dashboard loads within 2 seconds
- [ ] All cards display accurate, real-time data
- [ ] Quick actions navigate to correct pages
- [ ] Empty states guide users appropriately
- [ ] Responsive layout: 2 cols tablet, 1 col mobile, 4 cols desktop
- [ ] Loading skeletons for all cards
- [ ] Error states with retry actions
