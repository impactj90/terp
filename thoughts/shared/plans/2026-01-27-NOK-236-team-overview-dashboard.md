# Implementation Plan: NOK-236 - Team Overview Dashboard for Managers

**Date:** 2026-01-27
**Ticket:** NOK-236
**Status:** Plan ready for implementation
**Research:** `thoughts/shared/research/2026-01-27-NOK-236-team-overview-dashboard.md`

---

## Summary

Build a team overview dashboard page at `/team-overview` that shows managers and admins a live view of their team members' attendance status, weekly time stats, upcoming absences, and provides quick navigation actions. The page uses a team selector, fetches per-member day views for today's status, and aggregates weekly hours from daily values.

---

## Architecture Decisions

### 1. Access Model
Since the auth system has no `manager` role (only `user` and `admin`), this page will be accessible to **all authenticated users**. The team selector will show teams the user belongs to (via the `GET /employees/{employee_id}/teams` endpoint if available, or all active teams). Admins see all teams; regular users see teams they belong to. For MVP, show all active teams to everyone and refine access later.

### 2. Data Fetching Strategy
There are NO batch team-level endpoints. For a team of N members, we need:
- 1 call for team with members (`GET /teams/{id}?include_members=true`)
- N calls for today's status (`GET /employees/{id}/day/{date}`)
- N calls for absences (`GET /employees/{id}/absences?from=X&to=Y`)
- N calls for weekly hours (`useDailyValues` per member)

Strategy: Use `useQueries` from `@tanstack/react-query` to run N parallel queries efficiently. Each component manages its own batch of queries.

### 3. Route & Navigation
- Route: `/team-overview` under `(dashboard)` layout group
- Navigation entry in the "Main" section of sidebar nav config (visible to all users)
- No new API endpoints needed -- all frontend-only

### 4. Component Structure
```
app/(dashboard)/team-overview/page.tsx     -- Page component
components/team-overview/
  index.ts                                  -- Barrel exports
  team-selector.tsx                         -- Team dropdown selector
  team-attendance-list.tsx                  -- Members list with today's status
  team-member-status-row.tsx               -- Single member row with status
  team-stats-cards.tsx                     -- Weekly stats cards grid
  team-upcoming-absences.tsx               -- Upcoming absences list
  team-quick-actions.tsx                   -- Quick action buttons
hooks/api/use-team-day-views.ts            -- Custom hook for batch day views
```

---

## Phase 1: Page Shell & Navigation (Files: 3)

### Step 1.1: Add navigation entry
**File:** `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

Add a "Team Overview" entry to the "Main" section, after "Dashboard":

```typescript
{
  title: 'Team Overview',
  href: '/team-overview',
  icon: UsersRound,
  description: 'View team attendance and stats',
},
```

Place it as the second item in the Main section (after Dashboard, before Time Clock). Import `UsersRound` from lucide-react (already imported for the admin Teams nav item).

### Step 1.2: Create page shell
**File:** `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/team-overview/page.tsx`

Follow the pattern from `monthly-evaluation/page.tsx` and `dashboard/page.tsx`:
- `'use client'`
- `useAuth()` for user and employeeId
- `useHasRole(['admin'])` for admin check
- `useTeams({ isActive: true, limit: 100 })` for team list
- State: `selectedTeamId`
- `useTeam(selectedTeamId)` for team with members
- Page header: "Team Overview" title + subtitle
- Team selector dropdown
- Conditional rendering: if no team selected, show placeholder card
- Loading skeleton component

Page layout:
```
[Header: "Team Overview" + subtitle]
[Team selector dropdown]
[Stats cards grid - 4 cards]
[Two-column layout:]
  [Left: Team Attendance List]
  [Right: Upcoming Absences]
[Quick Actions bar at bottom]
```

### Step 1.3: Create barrel exports
**File:** `/home/tolga/projects/terp/apps/web/src/components/team-overview/index.ts`

```typescript
export { TeamSelector } from './team-selector'
export { TeamAttendanceList } from './team-attendance-list'
export { TeamMemberStatusRow } from './team-member-status-row'
export { TeamStatsCards } from './team-stats-cards'
export { TeamUpcomingAbsences } from './team-upcoming-absences'
export { TeamQuickActions } from './team-quick-actions'
```

### Verification
- [ ] Navigation shows "Team Overview" in sidebar Main section
- [ ] Route `/team-overview` renders without errors
- [ ] Page shows loading skeleton, then header + team selector
- [ ] Team selector populates with active teams
- [ ] Selecting a team stores selectedTeamId in state

---

## Phase 2: Batch Day View Hook (Files: 2)

### Step 2.1: Create useTeamDayViews hook
**File:** `/home/tolga/projects/terp/apps/web/src/hooks/api/use-team-day-views.ts`

Create a custom hook that uses `useQueries` from `@tanstack/react-query` to fetch day views for multiple employees in parallel:

```typescript
import { useQueries } from '@tanstack/react-query'
import { api } from '@/lib/api'

interface UseTeamDayViewsOptions {
  employeeIds: string[]
  date: string
  enabled?: boolean
}

export function useTeamDayViews({ employeeIds, date, enabled = true }: UseTeamDayViewsOptions) {
  const queries = useQueries({
    queries: employeeIds.map((employeeId) => ({
      queryKey: ['/employees/{id}/day/{date}', { id: employeeId, date }],
      queryFn: async () => {
        const { data, error } = await api.GET('/employees/{id}/day/{date}' as never, {
          params: {
            path: { id: employeeId, date },
          },
        } as never)
        if (error) throw error
        return { employeeId, ...(data as Record<string, unknown>) }
      },
      enabled: enabled && !!employeeId && !!date,
      staleTime: 30 * 1000, // 30 seconds stale time (matches useEmployeeDayView)
    })),
  })

  return {
    data: queries.map((q) => q.data),
    isLoading: queries.some((q) => q.isLoading),
    isError: queries.some((q) => q.isError),
    refetchAll: () => queries.forEach((q) => q.refetch()),
  }
}
```

Follow the pattern from `use-employee-day.ts` for the query key format and stale time.

### Step 2.2: Export from hooks barrel
**File:** `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts`

Add export:
```typescript
// Team Overview
export { useTeamDayViews } from './use-team-day-views'
```

### Verification
- [ ] Hook compiles without TypeScript errors
- [ ] Calling `useTeamDayViews({ employeeIds: ['a','b'], date: '2026-01-27' })` returns array of day view data
- [ ] Loading and error states aggregate correctly
- [ ] Individual queries use the same cache key format as `useEmployeeDayView`

---

## Phase 3: Team Selector Component (Files: 1)

### Step 3.1: Create TeamSelector
**File:** `/home/tolga/projects/terp/apps/web/src/components/team-overview/team-selector.tsx`

Follow the admin employee selector pattern from `monthly-evaluation/page.tsx`:

```typescript
'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { components } from '@/lib/api/types'

type Team = components['schemas']['Team']

interface TeamSelectorProps {
  teams: Team[]
  selectedTeamId: string | undefined
  onSelectTeam: (teamId: string) => void
  isLoading?: boolean
}

export function TeamSelector({ teams, selectedTeamId, onSelectTeam, isLoading }: TeamSelectorProps) {
  return (
    <Select
      value={selectedTeamId ?? ''}
      onValueChange={onSelectTeam}
      disabled={isLoading}
    >
      <SelectTrigger className="w-[280px]">
        <SelectValue placeholder="Select a team..." />
      </SelectTrigger>
      <SelectContent>
        {teams.map((team) => (
          <SelectItem key={team.id} value={team.id}>
            {team.name}
            {team.member_count ? ` (${team.member_count})` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
```

### Verification
- [ ] Component renders with team list
- [ ] Selecting a team triggers `onSelectTeam` callback
- [ ] Shows member count in parentheses
- [ ] Disabled state works when loading

---

## Phase 4: Team Attendance List (Files: 2)

### Step 4.1: Create TeamMemberStatusRow
**File:** `/home/tolga/projects/terp/apps/web/src/components/team-overview/team-member-status-row.tsx`

A single row component showing one team member's attendance status for today. Receives pre-fetched day view data. Follow the pattern from `TodayScheduleCard` for status determination logic:

```typescript
'use client'

import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { MemberRoleBadge } from '@/components/teams/member-role-badge'
import { formatMinutes, formatTime } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type TeamMember = components['schemas']['TeamMember']

interface TeamMemberStatusRowProps {
  member: TeamMember
  dayView: {
    bookings: Array<{
      booking_type?: { direction?: string }
      edited_time: number
      time_string?: string
    }>
    daily_value?: {
      net_minutes?: number
      target_minutes?: number
      is_weekend?: boolean
      is_absence?: boolean
      has_errors?: boolean
    }
    is_holiday?: boolean
  } | null | undefined
  isLoading?: boolean
}
```

Display:
- Avatar circle (initials from first_name/last_name, pattern from `team-detail-sheet.tsx`)
- Employee name + department
- Role badge (reuse `MemberRoleBadge`)
- Status indicator: green dot = present/clocked in, yellow dot = on leave, gray dot = not yet in, blue dot = completed
- Clock-in time (first "in" booking time)
- Net worked hours if any
- Status badge text: "Clocked In", "On Leave", "Not Yet In", "Completed", "Holiday", "Weekend"

Status logic (matching `TodayScheduleCard`):
```
if isHoliday -> "Holiday" (gray)
if isWeekend -> "Weekend" (gray)
if isAbsence -> "On Leave" (yellow)
if isClockedIn (last booking is "in") -> "Clocked In" (green)
if hasBookings -> "Completed" (blue)
else -> "Not Yet In" (gray)
```

### Step 4.2: Create TeamAttendanceList
**File:** `/home/tolga/projects/terp/apps/web/src/components/team-overview/team-attendance-list.tsx`

Container component that renders the list of team members with their status. Fetches day views for all members using `useTeamDayViews`.

```typescript
'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useTeamDayViews } from '@/hooks/api'
import { getToday } from '@/lib/time-utils'
import { TeamMemberStatusRow } from './team-member-status-row'
import type { components } from '@/lib/api/types'

type TeamMember = components['schemas']['TeamMember']

interface TeamAttendanceListProps {
  members: TeamMember[]
  date?: string // defaults to today
}
```

Features:
- Groups members by status: Present first, then On Leave, then Not Yet In
- Shows count per group header: "Present (6)", "On Leave (2)", "Not Yet In (1)"
- Uses `useTeamDayViews` with all member `employee_id`s
- Creates a Map from employeeId -> dayView data for O(1) lookup
- Passes individual dayView to each `TeamMemberStatusRow`
- Loading skeleton: 5 skeleton rows

### Verification
- [ ] Members list renders with correct grouping (Present, On Leave, Not Yet In)
- [ ] Each member shows avatar, name, role badge, status badge, clock-in time
- [ ] Loading state shows skeleton rows
- [ ] Status determination matches `TodayScheduleCard` logic
- [ ] Group counts are accurate

---

## Phase 5: Team Stats Cards (Files: 1)

### Step 5.1: Create TeamStatsCards
**File:** `/home/tolga/projects/terp/apps/web/src/components/team-overview/team-stats-cards.tsx`

A grid of 4 stat cards showing team-level metrics for the current week. Follow the `StatsCard` component pattern from `components/dashboard/stats-card.tsx`.

```typescript
'use client'

import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { Users, Clock, CalendarOff, AlertTriangle } from 'lucide-react'
import { StatsCard } from '@/components/dashboard'
import { useDailyValues } from '@/hooks/api'
import { formatMinutes, getWeekStart, getWeekEnd, formatDate } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type TeamMember = components['schemas']['TeamMember']

interface TeamStatsCardsProps {
  members: TeamMember[]
  dayViewsData: Array<{
    employeeId: string
    bookings?: Array<{ booking_type?: { direction?: string } }>
    daily_value?: {
      is_absence?: boolean
      has_errors?: boolean
      net_minutes?: number
    }
    is_holiday?: boolean
  } | null | undefined>
  dayViewsLoading: boolean
}
```

Four cards:
1. **Present Today** - Count of members clocked in or completed today. Icon: `Users`. Description: "X of Y members".
2. **Team Hours This Week** - Sum of all members' net hours this week. Icon: `Clock`. Description: "X target" total. Uses `useQueries` to fetch `useDailyValues` for each member's current week.
3. **Absences Today** - Count of members on leave today. Icon: `CalendarOff`. Description: lists absence types if available.
4. **Issues** - Count of members with errors in today's daily value. Icon: `AlertTriangle`. Description: "Needs attention" or "All clear".

Card 1, 3, 4 derive data from the `dayViewsData` prop (already fetched by `TeamAttendanceList` parent).
Card 2 needs its own weekly data fetch. Use `useQueries` pattern similar to Phase 2:

```typescript
// Inside TeamStatsCards component for weekly hours:
const weekStart = formatDate(getWeekStart())
const weekEnd = formatDate(getWeekEnd())

// Use parallel queries for weekly data per member
const weeklyQueries = useQueries({
  queries: members.map((m) => ({
    queryKey: ['employees', m.employee_id, 'months', /* year */, /* month */, 'days'],
    queryFn: () => fetchDailyValues(m.employee_id, weekStart),
    enabled: members.length > 0,
    staleTime: 60 * 1000, // 1 minute stale for weekly data
  })),
})
```

Aggregate across all members: `totalNetMinutes`, `totalTargetMinutes`.

### Verification
- [ ] 4 stat cards render in a `grid gap-4 md:grid-cols-2 lg:grid-cols-4` layout
- [ ] "Present Today" shows correct count
- [ ] "Team Hours This Week" shows aggregated net hours / target
- [ ] "Absences Today" shows correct count
- [ ] "Issues" shows error count or "All clear"
- [ ] Loading states show via `StatsCard` skeleton
- [ ] Error states handled with retry

---

## Phase 6: Upcoming Absences (Files: 1)

### Step 6.1: Create TeamUpcomingAbsences
**File:** `/home/tolga/projects/terp/apps/web/src/components/team-overview/team-upcoming-absences.tsx`

Shows upcoming absences for the next 14 days across all team members.

```typescript
'use client'

import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { CalendarOff } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { formatDate, formatRelativeDate, parseISODate } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type TeamMember = components['schemas']['TeamMember']

interface TeamUpcomingAbsencesProps {
  members: TeamMember[]
}
```

Data fetching:
- Calculate date range: today to today+14 days
- Use `useQueries` to fetch `GET /employees/{id}/absences?from=X&to=Y` per member
- Merge all absences into a single array
- Sort by absence_date ascending
- Group by date for display

Display:
- Card with header "Upcoming Absences"
- List of absence entries sorted by date
- Each entry: date (relative: "Today", "Tomorrow", "Jan 30"), employee name, absence type badge, duration (full/half day)
- Status badge: color-coded by absence type (use `Badge` component)
- Empty state: "No upcoming absences in the next 2 weeks"
- Maximum 10 entries shown, with "View all" link if more

### Verification
- [ ] Shows absences for next 14 days across all team members
- [ ] Sorted by date ascending
- [ ] Shows employee name, absence type, date, duration
- [ ] Empty state message when no absences
- [ ] Loading skeleton
- [ ] Max 10 entries with overflow indicator

---

## Phase 7: Quick Actions (Files: 1)

### Step 7.1: Create TeamQuickActions
**File:** `/home/tolga/projects/terp/apps/web/src/components/team-overview/team-quick-actions.tsx`

Follow the pattern from `components/dashboard/quick-actions.tsx` but for team-level actions:

```typescript
'use client'

import Link from 'next/link'
import { Calendar, FileText, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface TeamQuickActionsProps {
  teamId?: string
}

export function TeamQuickActions({ teamId }: TeamQuickActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" asChild className="gap-2">
        <Link href="/admin/teams">
          <Users className="h-4 w-4" />
          Manage Teams
        </Link>
      </Button>
      <Button variant="outline" asChild className="gap-2">
        <Link href="/absences">
          <Calendar className="h-4 w-4" />
          Manage Absences
        </Link>
      </Button>
      <Button variant="outline" asChild className="gap-2">
        <Link href="/timesheet">
          <FileText className="h-4 w-4" />
          View Timesheets
        </Link>
      </Button>
    </div>
  )
}
```

### Verification
- [ ] Three action buttons render
- [ ] Links navigate to correct pages
- [ ] Button styling matches existing quick actions

---

## Phase 8: Assemble Complete Page (Files: 1)

### Step 8.1: Complete page.tsx with all components
**File:** `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/team-overview/page.tsx`

Final assembled page:

```typescript
'use client'

import { useState } from 'react'
import { useAuth } from '@/providers/auth-provider'
import { useTeams, useTeam, useTeamDayViews } from '@/hooks/api'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getToday } from '@/lib/time-utils'
import {
  TeamSelector,
  TeamAttendanceList,
  TeamStatsCards,
  TeamUpcomingAbsences,
  TeamQuickActions,
} from '@/components/team-overview'

export default function TeamOverviewPage() {
  const { user, isLoading: authLoading } = useAuth()
  const [selectedTeamId, setSelectedTeamId] = useState<string | undefined>(undefined)
  const today = getToday()

  // Fetch active teams for selector
  const { data: teamsData, isLoading: teamsLoading } = useTeams({
    isActive: true,
    limit: 100,
  })
  const teams = teamsData?.items ?? []

  // Auto-select first team if only one available
  // (handled via useEffect or initial state)

  // Fetch selected team with members
  const { data: team, isLoading: teamLoading } = useTeam(
    selectedTeamId ?? '',
    !!selectedTeamId
  )
  const members = team?.members ?? []

  // Fetch day views for all members (used by stats + attendance)
  const employeeIds = members.map((m) => m.employee_id)
  const {
    data: dayViewsData,
    isLoading: dayViewsLoading,
  } = useTeamDayViews({
    employeeIds,
    date: today,
    enabled: members.length > 0,
  })

  if (authLoading) {
    return <TeamOverviewSkeleton />
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team Overview</h1>
          <p className="text-muted-foreground">
            Monitor your team's attendance, hours, and absences
          </p>
        </div>
        <TeamQuickActions teamId={selectedTeamId} />
      </div>

      {/* Team selector */}
      <TeamSelector
        teams={teams}
        selectedTeamId={selectedTeamId}
        onSelectTeam={setSelectedTeamId}
        isLoading={teamsLoading}
      />

      {/* Content when team is selected */}
      {selectedTeamId && (
        <>
          {/* Stats cards */}
          <TeamStatsCards
            members={members}
            dayViewsData={dayViewsData}
            dayViewsLoading={dayViewsLoading || teamLoading}
          />

          {/* Two-column layout */}
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            {/* Left: Attendance list */}
            <TeamAttendanceList
              members={members}
              date={today}
            />

            {/* Right: Upcoming absences */}
            <TeamUpcomingAbsences members={members} />
          </div>
        </>
      )}

      {/* No team selected placeholder */}
      {!selectedTeamId && !teamsLoading && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <p>Select a team to view the overview dashboard.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

**Data Flow Architecture:**
- Page fetches team + members once
- Page fetches all day views once via `useTeamDayViews`
- `TeamStatsCards` receives `dayViewsData` as prop (avoids duplicate fetches)
- `TeamAttendanceList` also fetches day views internally (or receives via prop; for Phase 8, consolidate to avoid duplicate fetching by passing dayViewsData as props to attendance list too)
- `TeamUpcomingAbsences` fetches its own absence data (different endpoint)

**Optimization:** Lift `useTeamDayViews` to the page level and pass results down to both `TeamStatsCards` and `TeamAttendanceList` to avoid duplicate N requests.

### Verification
- [ ] Full page renders with all sections
- [ ] Team selector -> stats cards -> attendance list -> absences all update when team changes
- [ ] No duplicate API calls for the same day view data
- [ ] Loading states cascade correctly
- [ ] Empty state shows when no team is selected
- [ ] Page responsive: single column on mobile, multi-column on desktop

---

## Phase 9: Polish & Edge Cases (Files: multiple)

### Step 9.1: Auto-select team
In `page.tsx`, add logic to auto-select the first team if the user's employee is a member/lead of exactly one team. Use `useEffect`:
```typescript
useEffect(() => {
  if (teams.length === 1 && !selectedTeamId) {
    setSelectedTeamId(teams[0].id)
  }
}, [teams, selectedTeamId])
```

### Step 9.2: Refresh mechanism
Add a refresh button in the page header that calls `refetchAll()` on the day views and invalidates the team query.

### Step 9.3: Loading skeleton
Create `TeamOverviewSkeleton` function at the bottom of `page.tsx` following existing pattern:
```typescript
function TeamOverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
      <Skeleton className="h-10 w-[280px]" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    </div>
  )
}
```

### Step 9.4: Handle empty team (no members)
When a team has 0 members, show an informative card:
```
"This team has no members yet. Add members via Team Management."
```
With a link to `/admin/teams`.

### Step 9.5: Handle no teams available
When the user has no teams available:
```
"No teams available. Contact your administrator to be assigned to a team."
```

### Verification
- [ ] Auto-selects team when only one exists
- [ ] Refresh button re-fetches all data
- [ ] Empty team state shows helpful message
- [ ] No teams state shows helpful message
- [ ] Loading skeleton matches page layout

---

## File Inventory

| # | File | Action | Phase |
|---|------|--------|-------|
| 1 | `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` | Edit | 1 |
| 2 | `apps/web/src/app/(dashboard)/team-overview/page.tsx` | Create | 1, 8, 9 |
| 3 | `apps/web/src/components/team-overview/index.ts` | Create | 1 |
| 4 | `apps/web/src/hooks/api/use-team-day-views.ts` | Create | 2 |
| 5 | `apps/web/src/hooks/api/index.ts` | Edit | 2 |
| 6 | `apps/web/src/components/team-overview/team-selector.tsx` | Create | 3 |
| 7 | `apps/web/src/components/team-overview/team-member-status-row.tsx` | Create | 4 |
| 8 | `apps/web/src/components/team-overview/team-attendance-list.tsx` | Create | 4 |
| 9 | `apps/web/src/components/team-overview/team-stats-cards.tsx` | Create | 5 |
| 10 | `apps/web/src/components/team-overview/team-upcoming-absences.tsx` | Create | 6 |
| 11 | `apps/web/src/components/team-overview/team-quick-actions.tsx` | Create | 7 |

**Total:** 11 files (2 edits, 9 creates)

---

## Key Patterns to Follow

### From existing codebase:
1. **Page structure:** `'use client'` -> `useAuth()` -> `useHasRole` -> loading check -> main render. See `monthly-evaluation/page.tsx`.
2. **Component props:** Each component manages its own loading/error states. See `TodayScheduleCard`.
3. **Card styling:** `rounded-lg border bg-card p-6` for custom cards, or `<Card>` + `<CardContent>` for standard cards.
4. **Type imports:** `import type { components } from '@/lib/api/types'` then `type Team = components['schemas']['Team']`.
5. **Hook pattern:** Wrap `useApiQuery` or `useQuery` with domain-specific parameters. See `use-teams.ts`.
6. **Skeleton pattern:** Inline `function PageSkeleton()` at bottom of page file.
7. **Time formatting:** Use `formatMinutes()`, `formatDuration()`, `formatTime()` from `@/lib/time-utils`.
8. **Status badges:** Use `Badge` with custom class names for colored variants. See `TodayScheduleCard` and `TeamStatusBadge`.

### Reusable existing components:
- `StatsCard` from `components/dashboard/stats-card.tsx` for stat cards
- `MemberRoleBadge` from `components/teams/member-role-badge.tsx` for role indicators
- `Badge` from `components/ui/badge.tsx` for status badges
- `Card`, `CardHeader`, `CardContent`, `CardTitle` from `components/ui/card.tsx`
- `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` from `components/ui/select.tsx`
- `Skeleton` from `components/ui/skeleton.tsx`
- `Button` from `components/ui/button.tsx`

---

## Acceptance Criteria Mapping

| Ticket Criteria | Implementation |
|----------------|----------------|
| Team members show current status | `TeamAttendanceList` with per-member `TeamMemberStatusRow` |
| Status updates reflect real-time | 30-second stale time on day view queries + refresh button |
| Absence calendar shows upcoming | `TeamUpcomingAbsences` with 14-day lookahead |
| Weekly stats calculate correctly | `TeamStatsCards` aggregating `useDailyValues` per member |
| Quick actions work | `TeamQuickActions` with navigation links |

---

## Risks & Mitigations

1. **N+1 API calls per team member**: For a team of 20, this means ~20 parallel requests for day views + 20 for absences + 20 for weekly hours = 60 requests. Mitigation: React Query deduplication, 30s stale time, parallel execution via `useQueries`.

2. **No manager role in auth**: The page is accessible to all users. Mitigation: Accept for MVP; the team selector naturally limits visibility. Future: Add manager role or filter teams by membership.

3. **Large teams**: Teams with 50+ members could cause performance issues. Mitigation: Limit displayed members, paginate if needed, or show only top-level stats for large teams.

4. **Day view data shape**: The `useTeamDayViews` hook must return the same shape as individual `useEmployeeDayView` calls. Mitigation: Use the same `api.GET` call path and type assertions.
