# Research: NOK-223 - Vacation Balance Dashboard

## Overview

Research for implementing a vacation balance dashboard with history view. This document captures existing codebase patterns that are relevant to implementation.

---

## 1. Frontend Architecture

### 1.1 Project Structure

The Next.js web app is located in `apps/web/` with the following structure:

```
apps/web/src/
  app/                    # Next.js App Router pages
    (auth)/               # Auth layout group (login)
    (dashboard)/          # Dashboard layout group (protected)
      dashboard/          # Main dashboard
      timesheet/          # Timesheet view
      time-clock/         # Clock in/out
  components/
    ui/                   # UI primitives (shadcn/ui)
    layout/               # Layout components
    dashboard/            # Dashboard cards and sections
    timesheet/            # Timesheet-specific components
    time-clock/           # Clock-related components
    auth/                 # Auth-related components
  hooks/
    api/                  # Domain-specific API hooks
    use-api-query.ts      # Generic typed query hook
    use-api-mutation.ts   # Generic typed mutation hook
    use-auth.ts           # Auth hooks
  lib/
    api/                  # API client configuration
      client.ts           # openapi-fetch client with middleware
      types.ts            # Generated OpenAPI types
    time-utils.ts         # Time formatting utilities
    utils.ts              # General utilities (cn, etc.)
  providers/              # React context providers
```

### 1.2 Page Pattern

Pages follow this pattern (from `/apps/web/src/app/(dashboard)/dashboard/page.tsx`):

```tsx
'use client'

import { useAuth } from '@/providers/auth-provider'

export default function DashboardPage() {
  const { user, isLoading } = useAuth()
  const employeeId = user?.employee_id

  if (isLoading) {
    return <DashboardLoadingSkeleton />
  }

  if (!employeeId) {
    return <NoEmployeeLinkedMessage />
  }

  return (
    <div className="space-y-6">
      {/* Page content */}
    </div>
  )
}
```

### 1.3 State Management

- **Server State**: TanStack Query (React Query) via `@tanstack/react-query`
- **Client State**: React useState for local UI state
- **Auth Context**: `AuthProvider` provides user info including `employee_id`

---

## 2. API Endpoints

### 2.1 Vacation Balance Endpoint (EXISTS)

**Endpoint**: `GET /employees/{id}/vacation-balance?year={year}`

**Handler**: `/apps/api/internal/handler/vacation.go`

```go
func (h *VacationHandler) GetBalance(w http.ResponseWriter, r *http.Request) {
    // Parses employee ID from path
    // Parses optional year query param (default: current year)
    // Returns VacationBalance model
}
```

**Response Schema** (from `/api/schemas/vacation-balances.yaml`):

```yaml
VacationBalance:
  type: object
  required: [id, tenant_id, employee_id, year]
  properties:
    id: { type: string, format: uuid }
    tenant_id: { type: string, format: uuid }
    employee_id: { type: string, format: uuid }
    year: { type: integer }
    base_entitlement: { type: number, format: decimal }
    additional_entitlement: { type: number, format: decimal }
    carryover_from_previous: { type: number, format: decimal }
    manual_adjustment: { type: number, format: decimal }
    used_days: { type: number, format: decimal }
    planned_days: { type: number, format: decimal }
    total_entitlement: { type: number, format: decimal }  # Calculated
    remaining_days: { type: number, format: decimal }     # Calculated
    carryover_to_next: { type: number, format: decimal }
    carryover_expires_at: { type: string, format: date }
```

### 2.2 Employee Absences Endpoint (EXISTS)

**Endpoint**: `GET /employees/{id}/absences?from={date}&to={date}`

**Handler**: `/apps/api/internal/handler/absence.go`

```go
func (h *AbsenceHandler) ListByEmployee(w http.ResponseWriter, r *http.Request) {
    // Parses employee ID from path
    // Parses optional from/to date range (YYYY-MM-DD)
    // Returns AbsenceList
}
```

**Response Schema** (from `/api/schemas/absences.yaml`):

```yaml
Absence:
  type: object
  required: [id, tenant_id, employee_id, absence_type_id, absence_date, duration]
  properties:
    id: { type: string, format: uuid }
    absence_date: { type: string, format: date }
    duration: { type: number }  # 1.0 = full day, 0.5 = half day
    status: { enum: [pending, approved, rejected, cancelled] }
    notes: { type: string }
    approved_by: { type: string, format: uuid }
    approved_at: { type: string, format: date-time }
    absence_type:  # Nested relation
      id: { type: string, format: uuid }
      code: { type: string }
      name: { type: string }
      category: { enum: [vacation, sick, personal, unpaid, holiday, other] }
      color: { type: string }  # Hex color
```

### 2.3 Routes Registration

From `/apps/api/internal/handler/routes.go`:

```go
// RegisterVacationRoutes registers vacation routes.
func RegisterVacationRoutes(r chi.Router, h *VacationHandler) {
    r.Get("/employees/{id}/vacation-balance", h.GetBalance)
}

// RegisterAbsenceRoutes registers absence routes.
func RegisterAbsenceRoutes(r chi.Router, h *AbsenceHandler) {
    r.Get("/absence-types", h.ListTypes)
    r.Get("/employees/{id}/absences", h.ListByEmployee)
    r.Post("/employees/{id}/absences", h.CreateRange)
    r.Delete("/absences/{id}", h.Delete)
}
```

---

## 3. Existing API Hooks

### 3.1 Vacation Balance Hook (EXISTS)

**File**: `/apps/web/src/hooks/api/use-vacation-balance.ts`

```typescript
export function useEmployeeVacationBalance(
  employeeId: string,
  year?: number,
  enabled = true
) {
  return useApiQuery('/employees/{id}/vacation-balance', {
    path: { id: employeeId },
    params: { year },
    enabled: enabled && !!employeeId,
  })
}
```

### 3.2 Missing Hooks

No hooks exist for absences yet. Pattern to follow from existing hooks:

```typescript
// Pattern from use-daily-values.ts
export function useDailyValues(options: UseDailyValuesOptions = {}) {
  const { employeeId, from, to, enabled = true } = options

  return useApiQuery('/daily-values', {
    params: { employee_id: employeeId, from, to },
    enabled,
  })
}
```

---

## 4. UI Components

### 4.1 Dashboard Cards Pattern

**File**: `/apps/web/src/components/dashboard/vacation-balance-card.tsx`

Existing card shows:
- Remaining days (large number)
- Total entitlement
- Progress bar (used + planned portions)
- Loading skeleton
- Error state with retry

```tsx
export function VacationBalanceCard({ employeeId, className }: Props) {
  const { data, isLoading, error, refetch } = useEmployeeVacationBalance(
    employeeId ?? '',
    currentYear,
    !!employeeId
  )

  // Handles: loading, error, no data, success states

  return (
    <div className={cn('rounded-lg border bg-card p-6', className)}>
      {/* Header with icon */}
      {/* Balance number */}
      {/* Stacked progress bar */}
    </div>
  )
}
```

### 4.2 Table Component

**File**: `/apps/web/src/components/ui/table.tsx`

Available components:
- `Table`, `TableHeader`, `TableBody`, `TableFooter`
- `TableRow`, `TableHead`, `TableCell`
- `TableCaption`

Example usage in week-view.tsx with row click handling.

### 4.3 Card Component

**File**: `/apps/web/src/components/ui/card.tsx`

```tsx
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
    <CardAction>{/* Optional action button */}</CardAction>
  </CardHeader>
  <CardContent>{/* Content */}</CardContent>
  <CardFooter>{/* Optional footer */}</CardFooter>
</Card>
```

### 4.4 Other UI Components

| Component | File | Use Case |
|-----------|------|----------|
| Badge | `/components/ui/badge.tsx` | Status indicators, category labels |
| Tabs | `/components/ui/tabs.tsx` | View switching (day/week/month) |
| Select | `/components/ui/select.tsx` | Year selector dropdown |
| Tooltip | `/components/ui/tooltip.tsx` | Info tooltips for bonus days |
| Skeleton | `/components/ui/skeleton.tsx` | Loading states |
| Button | `/components/ui/button.tsx` | Actions, navigation |
| Alert | `/components/ui/alert.tsx` | Warnings (carryover expiration) |

### 4.5 Time/Date Utilities

**File**: `/apps/web/src/lib/time-utils.ts`

Relevant functions:
- `formatDate(date)` - Returns "YYYY-MM-DD"
- `formatRelativeDate(date)` - Returns "Today", "Yesterday", or formatted date
- `formatDisplayDate(date, format)` - Various display formats
- `getMonthRange(date)` - Returns { start, end } for month

---

## 5. Generated Types

### 5.1 VacationBalance Type

From `/apps/web/src/lib/api/types.ts`:

```typescript
VacationBalance: {
  id: string;                         // Format: uuid
  tenant_id: string;                  // Format: uuid
  employee_id: string;                // Format: uuid
  year: number;
  base_entitlement?: number;          // Format: decimal
  additional_entitlement?: number;    // Format: decimal
  carryover_from_previous?: number;   // Format: decimal
  manual_adjustment?: number;         // Format: decimal
  used_days?: number;                 // Format: decimal
  planned_days?: number;              // Format: decimal
  total_entitlement?: number;         // Calculated
  remaining_days?: number;            // Calculated
  carryover_to_next?: number;
  carryover_expires_at?: string;      // Format: date
}
```

### 5.2 Absence Type

```typescript
Absence: {
  id: string;
  tenant_id: string;
  employee_id: string;
  absence_type_id: string;
  absence_date: string;               // Format: date
  duration: number;                   // 1.0 = full, 0.5 = half
  status?: "pending" | "approved" | "rejected" | "cancelled";
  notes?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  absence_type?: {                    // Nested relation
    id: string;
    code: string;
    name: string;
    category: "vacation" | "sick" | "personal" | "unpaid" | "holiday" | "other";
    color?: string;
  } | null;
}
```

### 5.3 User Type (for employee_id access)

```typescript
User: {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string | null;
  role: "user" | "admin";
  employee_id?: string | null;        // ID of linked employee record
}
```

---

## 6. Authentication/Authorization

### 6.1 Getting Current Employee ID

The app gets employee ID from the authenticated user context:

```tsx
// From dashboard page
const { user } = useAuth()
const employeeId = user?.employee_id
```

### 6.2 Auth Provider

**File**: `/apps/web/src/providers/auth-provider.tsx`

```typescript
export interface AuthContextValue {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  error: Error | null
  logout: () => Promise<void>
  refetch: () => Promise<void>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
```

### 6.3 Auth Hook

**File**: `/apps/web/src/hooks/use-auth.ts`

```typescript
export type User = components['schemas']['User']

export function useCurrentUser(enabled = true) {
  return useApiQuery('/auth/me', {
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
```

---

## 7. Navigation Structure

### 7.1 Sidebar Configuration

**File**: `/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

Absences is already in navigation:

```typescript
{
  title: 'Absences',
  href: '/absences',
  icon: CalendarOff,
  description: 'Request and view absences',
}
```

### 7.2 Route Groups

Dashboard pages are under `(dashboard)` route group which applies the protected layout with sidebar.

---

## 8. Similar Implementations

### 8.1 Timesheet Page Pattern

**File**: `/apps/web/src/app/(dashboard)/timesheet/page.tsx`

Demonstrates:
- View mode switching (day/week/month tabs)
- Period navigation (previous/next/today buttons)
- Date range display
- Card wrapper for content
- Export functionality

```tsx
const [viewMode, setViewMode] = useState<ViewMode>('day')
const [currentDate, setCurrentDate] = useState(new Date())

// Navigation functions
const navigatePrevious = () => { /* ... */ }
const navigateNext = () => { /* ... */ }
const navigateToToday = () => { setCurrentDate(new Date()) }
```

### 8.2 Week View Table Pattern

**File**: `/apps/web/src/components/timesheet/week-view.tsx`

Demonstrates:
- Table with date rows
- Data fetching for date range
- Mapping data to dates
- Totals calculation in footer
- Loading skeletons per cell
- Click handling for row selection

---

## 9. Summary of Existing Assets

### 9.1 Can Reuse Directly

| Asset | Status |
|-------|--------|
| `useEmployeeVacationBalance` hook | EXISTS |
| `VacationBalanceCard` component | EXISTS (dashboard summary) |
| Table, Card, Badge, Tabs, Select | EXISTS |
| Time/date utilities | EXISTS |
| Auth context and employee ID access | EXISTS |
| API endpoints (vacation-balance, absences) | EXISTS |
| Generated TypeScript types | EXISTS |

### 9.2 Need to Create

| Asset | Notes |
|-------|-------|
| Vacation balance page (`/absences/vacation` or `/vacation`) | New page |
| Absences API hook | Follow pattern from use-vacation-balance |
| Transaction history table component | Similar to week-view table |
| Year selector component | Use Select component |
| Balance breakdown component | Based on VacationBalanceCard |
| Carryover warning component | Use Alert/Badge |

---

## 10. File Paths Reference

```
API Handlers:
  /apps/api/internal/handler/vacation.go
  /apps/api/internal/handler/absence.go
  /apps/api/internal/handler/routes.go

OpenAPI Schemas:
  /api/schemas/vacation-balances.yaml
  /api/schemas/absences.yaml
  /api/paths/employees.yaml
  /api/paths/vacation-balances.yaml

Frontend Hooks:
  /apps/web/src/hooks/api/use-vacation-balance.ts
  /apps/web/src/hooks/use-api-query.ts
  /apps/web/src/hooks/use-api-mutation.ts

Frontend Components:
  /apps/web/src/components/dashboard/vacation-balance-card.tsx
  /apps/web/src/components/timesheet/week-view.tsx
  /apps/web/src/components/ui/table.tsx
  /apps/web/src/components/ui/card.tsx
  /apps/web/src/components/ui/tabs.tsx
  /apps/web/src/components/ui/select.tsx

Pages:
  /apps/web/src/app/(dashboard)/dashboard/page.tsx
  /apps/web/src/app/(dashboard)/timesheet/page.tsx

Configuration:
  /apps/web/src/components/layout/sidebar/sidebar-nav-config.ts

Types:
  /apps/web/src/lib/api/types.ts

Utilities:
  /apps/web/src/lib/time-utils.ts
```

---

*Research completed: 2026-01-26*
