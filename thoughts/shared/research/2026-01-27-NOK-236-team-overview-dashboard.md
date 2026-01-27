# Research: NOK-236 - Team Overview Dashboard for Managers

**Date:** 2026-01-27
**Ticket:** NOK-236
**Status:** Research complete

## 1. Research Questions

1. What team-related API endpoints and data models exist?
2. How does the frontend fetch and display team data?
3. What existing dashboard patterns can be reused?
4. How are bookings/attendance and absences accessed per employee?
5. What UI components and patterns are available?
6. How does authentication and role-based access work?
7. What is the API client architecture?

---

## 2. Team API Backend

### 2.1 Team Model (`apps/api/internal/model/team.go`)

```go
type Team struct {
    ID               uuid.UUID  `json:"id"`
    TenantID         uuid.UUID  `json:"tenant_id"`
    DepartmentID     *uuid.UUID `json:"department_id,omitempty"`
    Name             string     `json:"name"`
    Description      string     `json:"description,omitempty"`
    LeaderEmployeeID *uuid.UUID `json:"leader_employee_id,omitempty"`
    IsActive         bool       `json:"is_active"`
    MemberCount      int        `json:"member_count"` // Computed, not stored
    // Relations
    Department *Department  `json:"department,omitempty"`
    Leader     *Employee    `json:"leader,omitempty"`
    Members    []TeamMember `json:"members,omitempty"`
}

type TeamMember struct {
    TeamID     uuid.UUID      `json:"team_id"`
    EmployeeID uuid.UUID      `json:"employee_id"`
    JoinedAt   time.Time      `json:"joined_at"`
    Role       TeamMemberRole `json:"role"` // "member", "lead", "deputy"
    // Relations
    Team     *Team     `json:"team,omitempty"`
    Employee *Employee `json:"employee,omitempty"`
}
```

Roles: `TeamMemberRoleMember`, `TeamMemberRoleLead`, `TeamMemberRoleDeputy`.

### 2.2 Team API Routes (`apps/api/internal/handler/routes.go`)

```
GET    /teams                            → List teams (filters: department_id, is_active, limit, cursor)
POST   /teams                            → Create team
GET    /teams/{id}                       → Get team (query: include_members=true)
PUT    /teams/{id}                       → Update team
DELETE /teams/{id}                       → Delete team
GET    /teams/{id}/members               → List team members
POST   /teams/{id}/members               → Add member (body: employee_id, role)
DELETE /teams/{id}/members/{employee_id}  → Remove member
PUT    /teams/{id}/members/{employee_id}  → Update member role
GET    /employees/{employee_id}/teams     → Get employee's teams
```

### 2.3 Team Handler Key Methods (`apps/api/internal/handler/team.go`)

- **GetMembers** returns `TeamMemberList{Items: []model.TeamMember}`.
- **Get** with `include_members=true` query param returns the full team with members preloaded (including `Members.Employee` and `Members.Employee.Department`).
- **GetEmployeeTeams** returns all teams for a specific employee.

### 2.4 Team Service (`apps/api/internal/service/team.go`)

Key service methods relevant to team overview:
- `GetWithMembers(ctx, id)` - Returns team with preloaded members + employee details.
- `GetMembers(ctx, teamID)` - Returns member list.
- `GetMemberTeams(ctx, employeeID)` - Returns teams for an employee.
- `ListActive(ctx, tenantID)` - Returns active teams.

### 2.5 Team Repository (`apps/api/internal/repository/team.go`)

`GetWithMembers` preloads: `Department`, `Leader`, `Members`, `Members.Employee`, `Members.Employee.Department`.

`GetMembers` returns members ordered by `joined_at ASC`. NOTE: It does NOT preload the Employee relation -- only returns TeamMember rows.

`populateMemberCounts` is used by List/ListActive/ListByDepartment to compute `member_count` without preloading full member data.

---

## 3. Attendance/Booking Data Access

### 3.1 Booking Model (`apps/api/internal/model/booking.go`)

```go
type Booking struct {
    ID            uuid.UUID
    EmployeeID    uuid.UUID
    BookingDate   time.Time
    BookingTypeID uuid.UUID
    OriginalTime  int        // minutes from midnight
    EditedTime    int
    Source        BookingSource
    BookingType   *BookingType // direction: "in" or "out"
}
```

### 3.2 Day View Endpoint (`GET /employees/{id}/day/{date}`)

Returns a composite response (`DayView`) containing:
- `bookings` - All bookings for the employee on that date (with BookingType preloaded)
- `daily_value` - Calculated time values (gross, net, target, overtime, undertime, break, has_errors)
- `day_plan` - The employee's day plan for that date
- `is_holiday` - Boolean
- `holiday` - Holiday details if applicable

This is the primary endpoint for determining an employee's "status" on a given day.

### 3.3 Bookings List Endpoint (`GET /bookings`)

Supports filters:
- `employee_id` (uuid)
- `from` (date YYYY-MM-DD)
- `to` (date YYYY-MM-DD)
- `limit`, `page`

Returns `BookingList{Data: []*Booking, Total: *int64}`.

### 3.4 Daily Values Endpoint (`GET /employees/{id}/months/{year}/{month}/days`)

Returns daily breakdown for a full month. Used by the timesheet and monthly evaluation pages.

### 3.5 Monthly Values Endpoint (`GET /employees/{id}/months/{year}/{month}`)

Returns aggregated monthly summary including:
- `total_gross_time`, `total_net_time`, `total_target_time`
- `total_overtime`, `total_undertime`, `total_break_time`
- `flextime_start`, `flextime_end`, `flextime_carryover`
- `vacation_taken`, `sick_days`, `other_absence_days`
- `work_days`, `days_with_errors`
- `is_closed`, `closed_at`

---

## 4. Absence Data Access

### 4.1 Absence Model (`apps/api/internal/model/absenceday.go`)

```go
type AbsenceDay struct {
    ID            uuid.UUID
    EmployeeID    uuid.UUID
    AbsenceDate   time.Time
    AbsenceTypeID uuid.UUID
    Duration      decimal.Decimal // 1.00 = full day, 0.50 = half day
    Status        AbsenceStatus   // "pending", "approved", "rejected", "cancelled"
    AbsenceType   *AbsenceType    // Preloaded relation
}
```

### 4.2 Absence API Routes

```
GET  /employees/{id}/absences            → List absences (filters: from, to)
POST /employees/{id}/absences            → Create absence range
GET  /absence-types                      → List absence types
DELETE /absences/{id}                    → Delete absence
POST /absences/{id}/approve              → Approve absence
POST /absences/{id}/reject               → Reject absence
```

### 4.3 Employee Absences Query

The `ListByEmployee` handler supports `from` and `to` query params for date range filtering. Returns `AbsenceDayList{Data: []*AbsenceDay}` with `AbsenceType` relation preloaded.

---

## 5. Frontend Architecture

### 5.1 Project Structure (`apps/web/src/`)

```
app/
  (auth)/login/page.tsx          → Login page
  (dashboard)/layout.tsx         → Dashboard layout (ProtectedRoute + TenantProvider + AppLayout)
  (dashboard)/dashboard/page.tsx → Employee dashboard
  (dashboard)/admin/teams/page.tsx → Team management (admin)
  (dashboard)/timesheet/page.tsx → Timesheet view
  (dashboard)/absences/page.tsx  → Absence management
  (dashboard)/monthly-evaluation/page.tsx → Monthly evaluation
  (dashboard)/year-overview/page.tsx → Year overview
  (dashboard)/time-clock/page.tsx → Clock in/out
  (dashboard)/vacation/page.tsx  → Vacation balance
  (dashboard)/profile/page.tsx   → Employee profile

components/
  dashboard/   → Dashboard cards (StatsCard, TodayScheduleCard, etc.)
  teams/       → Team management components
  absences/    → Absence components
  timesheet/   → Timesheet views (DayView, WeekView, MonthView)
  layout/      → AppLayout, Sidebar, Header, MobileNav
  ui/          → shadcn/ui primitives (Card, Button, Badge, Skeleton, etc.)
  monthly-evaluation/ → Monthly eval components
  year-overview/      → Year overview components

hooks/
  api/         → Domain-specific React Query hooks
  use-api-query.ts    → Generic typed GET hook
  use-api-mutation.ts → Generic typed mutation hook
  use-auth.ts         → Auth hooks
  use-has-role.ts     → Role checking hooks

lib/
  api/client.ts → openapi-fetch client with auth/tenant middleware
  api/types.ts  → Generated TypeScript types from OpenAPI spec
  time-utils.ts → Time formatting utilities
  utils.ts      → General utilities (cn for classNames)

providers/
  auth-provider.tsx   → Auth context
  tenant-provider.tsx → Tenant context
  query-provider.tsx  → React Query provider
  theme-provider.tsx  → Theme context
```

### 5.2 API Client Architecture

- Uses `openapi-fetch` with generated types from `api/types.ts`.
- Client at `lib/api/client.ts` creates a typed `createClient<paths>` instance.
- Auth middleware adds `Authorization: Bearer {token}` header.
- Tenant middleware adds `X-Tenant-ID` header.
- `useApiQuery` is a generic React Query hook that takes a typed API path and returns typed data.
- `useApiMutation` is a generic mutation hook with invalidation key support.

### 5.3 Navigation Configuration (`components/layout/sidebar/sidebar-nav-config.ts`)

Three sections:
1. **Main** (all users): Dashboard, Time Clock, Timesheet, Absences, Vacation, Monthly Evaluation, Year Overview
2. **Management** (admin): Employees, Teams, Departments, Employment Types, Day Plans, Week Plans, Tariffs, Holidays, Absence Types
3. **Administration** (admin): Users, Reports, Settings, Tenants

There is currently NO team overview/dashboard entry in navigation. A new entry would need to be added. The ticket implies this should be accessible to managers.

### 5.4 Role System

Two roles exist: `user` and `admin`. The `useHasRole` hook checks if the current user has any of the specified roles. `useHasMinRole` uses a hierarchy (`user` < `admin`).

There is NO `manager` role currently. Role checking is binary: `useHasRole(['admin'])`.

---

## 6. Existing Frontend Hooks for Team Data

### 6.1 Team Hooks (`hooks/api/use-teams.ts`)

```typescript
useTeams(options)         → GET /teams (with filters)
useTeam(id)               → GET /teams/{id}?include_members=true
useTeamMembers(teamId)    → GET /teams/{id}/members
useCreateTeam()           → POST /teams
useUpdateTeam()           → PUT /teams/{id}
useDeleteTeam()           → DELETE /teams/{id}
useAddTeamMember()        → POST /teams/{id}/members
useUpdateTeamMember()     → PUT /teams/{id}/members/{employee_id}
useRemoveTeamMember()     → DELETE /teams/{id}/members/{employee_id}
```

### 6.2 Employee Day View Hook (`hooks/api/use-employee-day.ts`)

```typescript
useEmployeeDayView(employeeId, date, options?)
// Returns: { bookings, daily_value, day_plan, is_holiday, holiday, errors }
// Stale time: 30 seconds by default
```

### 6.3 Absence Hooks (`hooks/api/use-absences.ts`)

```typescript
useAbsences(options)                → GET /absences (filters: employeeId, from, to, status)
useEmployeeAbsences(employeeId, options) → GET /employees/{id}/absences (filters: from, to)
useAbsenceTypes()                   → GET /absence-types
```

### 6.4 Bookings Hooks (`hooks/api/use-bookings.ts`)

```typescript
useBookings(options) → GET /bookings (filters: employeeId, from, to, limit, page)
```

### 6.5 Monthly/Daily Values Hooks

```typescript
useDailyValues(options)  → GET /employees/{id}/months/{year}/{month}/days
useMonthlyValues(options) → GET /employees/{id}/months/{year}/{month}
useYearOverview(options)  → GET /employees/{id}/months/{year}
```

---

## 7. Existing Dashboard Patterns

### 7.1 Employee Dashboard Page (`app/(dashboard)/dashboard/page.tsx`)

Pattern:
1. Gets `employeeId` from `useAuth()` user object
2. Shows `DashboardHeader` with user name
3. Shows `QuickActions` bar
4. Renders 4 stat cards in a grid: TodayScheduleCard, HoursThisWeekCard, VacationBalanceCard, FlextimeBalanceCard
5. Two-column layout below for PendingActions and RecentActivity

Each card component:
- Receives `employeeId` as prop
- Fetches its own data via hooks
- Handles loading/error states independently
- Uses consistent `rounded-lg border bg-card p-6` styling

### 7.2 StatsCard Component (`components/dashboard/stats-card.tsx`)

Reusable card with props: `title`, `value`, `description`, `icon`, `trend`, `trendValue`, `isLoading`, `error`, `onRetry`.

### 7.3 TodayScheduleCard Pattern

Fetches `useEmployeeDayView(employeeId, today)` and displays:
- Status badge (Clocked In/Completed/Holiday/Weekend/Absence/Not Started)
- First in/last out times
- Net worked minutes
- Error indicators

### 7.4 HoursThisWeekCard Pattern

Fetches `useDailyValues({employeeId, from: weekStart, to: weekEnd})` and computes:
- Total net minutes
- Total target minutes
- Remaining hours
- Progress bar visualization
- Days worked count

### 7.5 Admin Page Patterns (Monthly Evaluation, Year Overview, Timesheet)

These pages follow a consistent pattern:
1. Check `isAdmin` with `useHasRole(['admin'])`
2. If admin, show employee selector `<Select>` populated with `useEmployees({limit: 250})`
3. Use `effectiveEmployeeId = isAdmin ? selectedEmployeeId : userEmployeeId`
4. Fetch data using the effective employee ID
5. Show "Select employee" placeholder when admin has not selected

---

## 8. Existing Team Management Page

### 8.1 Admin Teams Page (`app/(dashboard)/admin/teams/page.tsx`)

Currently admin-only. Features:
- Search filter (client-side)
- Department filter
- Active/Inactive status filter
- Data table with teams
- Create/Edit/Delete via sheet dialogs
- Member management via `MemberManagementSheet`

### 8.2 Team Components (`components/teams/`)

- `TeamDataTable` - Table of teams with columns
- `TeamFormSheet` - Create/edit team form
- `TeamDetailSheet` - Team details view (shows members, department, leader)
- `MemberManagementSheet` - Add/remove/update member roles
- `TeamStatusBadge` - Active/Inactive badge
- `MemberRoleBadge` - Role badge (member/lead/deputy)

### 8.3 API Types Usage

Team components use types from the generated API client:
```typescript
import type { components } from '@/lib/api/types'
type Team = components['schemas']['Team']
type TeamMember = components['schemas']['TeamMember']
type TeamMemberRole = components['schemas']['TeamMemberRole']
```

---

## 9. UI Component Library

### 9.1 Available UI Components (`components/ui/`)

Shadcn/ui based components:
- Layout: `Card`, `Container`, `Grid`, `Stack`, `Separator`, `Tabs`
- Form: `Button`, `Input`, `Select`, `Label`, `Checkbox`, `Switch`, `RadioGroup`, `Textarea`
- Data: `Table`, `Badge`, `Avatar`, `Pagination`
- Overlay: `Dialog`, `Sheet`, `Popover`, `Tooltip`, `ConfirmDialog`, `DropdownMenu`
- Feedback: `Alert`, `Skeleton`
- Date: `Calendar`, `DateRangePicker`
- Search: `SearchInput`
- Time: `TimeInput`, `DurationInput`
- Theme: `ThemeToggle`
- Navigation: `Breadcrumb`, `ScrollArea`

### 9.2 Calendar Component

The `Calendar` component supports:
- `mode`: "single" or "range"
- `holidays`: Date[] (highlighted in red)
- `absences`: Date[] (highlighted in blue)
- Month navigation

### 9.3 DateRangePicker Component

Wraps `Calendar` in a `Popover` with range selection mode. Props: `value`, `onChange`, `placeholder`, `holidays`, `absences`, `minDate`, `maxDate`.

---

## 10. Data Access Summary for Team Overview

To build the team overview dashboard, the following data access patterns exist:

| Data Need | Existing Endpoint | Frontend Hook |
|-----------|-------------------|---------------|
| Team list | `GET /teams` | `useTeams()` |
| Team with members | `GET /teams/{id}?include_members=true` | `useTeam(id)` |
| Team members only | `GET /teams/{id}/members` | `useTeamMembers(teamId)` |
| Employee day view (attendance status) | `GET /employees/{id}/day/{date}` | `useEmployeeDayView(empId, date)` |
| Employee absences | `GET /employees/{id}/absences?from=X&to=Y` | `useEmployeeAbsences(empId, {from, to})` |
| Employee bookings | `GET /bookings?employee_id=X&from=Y&to=Z` | `useBookings({employeeId, from, to})` |
| Daily values (hours) | `GET /employees/{id}/months/{year}/{month}/days` | `useDailyValues({employeeId, year, month})` |
| Monthly summary | `GET /employees/{id}/months/{year}/{month}` | `useMonthlyValues({employeeId, year, month})` |
| Vacation balance | `GET /employees/{id}/vacation-balance` | `useEmployeeVacationBalance(empId, year)` |
| Employee list | `GET /employees` | `useEmployees()` |

### 10.1 Key Constraint: No Batch/Team-Level Endpoints

There is currently NO endpoint that returns aggregated team attendance data. Each team member's status must be fetched individually via `GET /employees/{id}/day/{date}`. For a team of N members, this requires N API calls to determine today's attendance.

Similarly, absences per member require N calls to `GET /employees/{id}/absences?from=X&to=Y`.

Weekly hours per member require N calls to `useDailyValues` or `useBookings`.

---

## 11. Authentication and Authorization

### 11.1 Auth Flow

- JWT-based authentication
- Token stored in localStorage
- `AuthProvider` wraps the app and provides `useAuth()` context
- `ProtectedRoute` component guards authenticated routes
- `TenantProvider` manages tenant selection
- `TenantGuard` ensures tenant is selected

### 11.2 User Object

From `useAuth()`:
```typescript
user: {
  id: string
  email: string
  display_name: string
  role: 'user' | 'admin'
  employee_id?: string  // Linked employee record
  tenant_id: string
}
```

### 11.3 Role-Based Access

- `useHasRole(['admin'])` - Check admin role
- `useHasMinRole('admin')` - Check hierarchy
- Navigation sections filtered by role
- Pages redirect non-admin users with `router.push('/dashboard')`

There is no `manager` or `team_lead` role. The team `lead` and `deputy` roles are stored on `TeamMember.Role` but are not connected to the user role system. A manager checking their team would need to be identified by matching their `employee_id` against `Team.LeaderEmployeeID` or `TeamMember.Role == 'lead'`.

---

## 12. Relevant File Paths

### Backend
- `/home/tolga/projects/terp/apps/api/internal/model/team.go` - Team and TeamMember models
- `/home/tolga/projects/terp/apps/api/internal/handler/team.go` - Team HTTP handlers
- `/home/tolga/projects/terp/apps/api/internal/handler/routes.go` - Route registration
- `/home/tolga/projects/terp/apps/api/internal/service/team.go` - Team service layer
- `/home/tolga/projects/terp/apps/api/internal/repository/team.go` - Team repository
- `/home/tolga/projects/terp/apps/api/internal/handler/booking.go` - Booking handler (day view)
- `/home/tolga/projects/terp/apps/api/internal/handler/absence.go` - Absence handler
- `/home/tolga/projects/terp/apps/api/internal/model/booking.go` - Booking model
- `/home/tolga/projects/terp/apps/api/internal/model/absenceday.go` - Absence model
- `/home/tolga/projects/terp/apps/api/internal/model/dailyvalue.go` - Daily value model
- `/home/tolga/projects/terp/apps/api/internal/model/employee.go` - Employee model
- `/home/tolga/projects/terp/api/paths/teams.yaml` - Team OpenAPI spec

### Frontend
- `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/dashboard/page.tsx` - Employee dashboard
- `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/teams/page.tsx` - Team admin page
- `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/layout.tsx` - Dashboard layout
- `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/monthly-evaluation/page.tsx` - Monthly eval pattern
- `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/timesheet/page.tsx` - Timesheet pattern
- `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/absences/page.tsx` - Absences page
- `/home/tolga/projects/terp/apps/web/src/components/dashboard/` - Dashboard components
- `/home/tolga/projects/terp/apps/web/src/components/teams/` - Team components
- `/home/tolga/projects/terp/apps/web/src/components/absences/` - Absence components
- `/home/tolga/projects/terp/apps/web/src/components/ui/` - UI primitives
- `/home/tolga/projects/terp/apps/web/src/hooks/api/use-teams.ts` - Team API hooks
- `/home/tolga/projects/terp/apps/web/src/hooks/api/use-bookings.ts` - Booking hooks
- `/home/tolga/projects/terp/apps/web/src/hooks/api/use-absences.ts` - Absence hooks
- `/home/tolga/projects/terp/apps/web/src/hooks/api/use-employee-day.ts` - Day view hook
- `/home/tolga/projects/terp/apps/web/src/hooks/api/use-daily-values.ts` - Daily values hook
- `/home/tolga/projects/terp/apps/web/src/hooks/api/use-monthly-values.ts` - Monthly values hook
- `/home/tolga/projects/terp/apps/web/src/hooks/api/use-employees.ts` - Employee hooks
- `/home/tolga/projects/terp/apps/web/src/hooks/api/use-vacation-balance.ts` - Vacation balance hooks
- `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts` - Hook barrel exports
- `/home/tolga/projects/terp/apps/web/src/hooks/use-has-role.ts` - Role checking
- `/home/tolga/projects/terp/apps/web/src/providers/auth-provider.tsx` - Auth provider
- `/home/tolga/projects/terp/apps/web/src/lib/api/client.ts` - API client
- `/home/tolga/projects/terp/apps/web/src/lib/time-utils.ts` - Time formatting
- `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` - Navigation config
- `/home/tolga/projects/terp/apps/web/src/components/ui/calendar.tsx` - Calendar component
- `/home/tolga/projects/terp/apps/web/src/components/ui/date-range-picker.tsx` - Date range picker

---

## 13. Key Observations

1. **No batch team endpoints exist.** Getting team attendance requires N individual calls per member. For real-time status display, this could mean 10-20+ API calls for a team.

2. **No manager role in auth system.** The user role is either `user` or `admin`. Team lead/deputy roles are stored on `TeamMember` but not in the user auth system. Identifying a "manager" would require checking if the user's `employee_id` matches a team's `LeaderEmployeeID` or has `TeamMember.Role == 'lead'`.

3. **Team member fetch does not preload Employee.** `GetMembers` returns raw `TeamMember` rows without Employee data. `GetWithMembers` (via `GET /teams/{id}?include_members=true`) does preload `Members.Employee` and `Members.Employee.Department`.

4. **Existing dashboard cards each manage their own data fetching.** Each component (`TodayScheduleCard`, `HoursThisWeekCard`, etc.) independently fetches data via hooks. The team dashboard could follow the same pattern but would need to fetch for multiple employees.

5. **Admin pages use employee selector pattern.** Monthly evaluation, year overview, and timesheet all use a `<Select>` dropdown populated with `useEmployees({limit: 250})` when the user is admin. The team overview could instead use a team selector.

6. **The `AbsenceCalendarView` component** uses the `Calendar` component with holidays and absences highlighted. This pattern could be adapted for a team absence calendar.

7. **Date range filtering** is available on absences (`from`/`to` params) and bookings (`from`/`to` params).

8. **Time utilities** (`lib/time-utils.ts`) provide `formatMinutes`, `formatDuration`, `formatBalance`, `getWeekStart`, `getWeekEnd`, `formatDate`, and related functions that would be reusable in team stats.

9. **Export pattern** exists in monthly evaluation and timesheet pages using `ExportButtons` components for CSV/PDF export.

10. **The `useTeam(id)` hook** already fetches with `include_members=true`, which returns full employee details for each team member. This is the primary hook for getting a team's member list with employee information.
