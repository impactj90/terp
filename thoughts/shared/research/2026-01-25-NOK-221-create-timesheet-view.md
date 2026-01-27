# Research: NOK-221 Create Timesheet View

**Date**: 2026-01-25
**Ticket**: NOK-221 - Create timesheet view with daily/weekly/monthly modes

## Overview

This document captures what currently exists in the codebase that is relevant for implementing the timesheet view feature.

---

## 1. Frontend Structure

### 1.1 Project Location
- **Path**: `/home/tolga/projects/terp/apps/web/`
- **Framework**: Next.js 16.1.x with App Router
- **Package Manager**: pnpm

### 1.2 Directory Structure
```
apps/web/src/
  app/                    # Next.js App Router pages
    (auth)/               # Auth route group (login)
    (dashboard)/          # Dashboard route group (protected)
      dashboard/page.tsx  # Dashboard page
      layout.tsx          # Uses ProtectedRoute + AppLayout
    design-system/        # Design system showcase page
    layout.tsx            # Root layout (providers)
  components/
    auth/                 # Auth components (ProtectedRoute, UserMenu)
    layout/               # Layout components (AppLayout, Sidebar, Header, etc.)
    ui/                   # UI primitives (Button, Card, Badge, etc.)
  hooks/
    api/                  # Domain-specific API hooks
    use-api-query.ts      # Generic type-safe GET hook
    use-api-mutation.ts   # Generic type-safe mutation hook
  lib/
    api/                  # API client and types
  providers/              # Context providers (Query, Auth, Theme)
  stories/                # Storybook stories
  types/                  # TypeScript types
```

### 1.3 Navigation Configuration
The timesheet is already configured in navigation at `/timesheet`:

**File**: `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`
```typescript
{
  title: 'Timesheet',
  href: '/timesheet',
  icon: Calendar,
  description: 'View and edit time entries',
}
```

Also in mobile nav items. **No page exists yet** for this route.

---

## 2. Page Pattern

### 2.1 Dashboard Layout Pattern
Protected pages follow this pattern:

**Layout** (`/apps/web/src/app/(dashboard)/layout.tsx`):
```typescript
'use client'

import { ProtectedRoute } from '@/components/auth/protected-route'
import { AppLayout, LoadingSkeleton } from '@/components/layout'

export default function DashboardLayout({ children }) {
  return (
    <ProtectedRoute loadingFallback={<LoadingSkeleton />}>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  )
}
```

**Page** (`/apps/web/src/app/(dashboard)/dashboard/page.tsx`):
```typescript
'use client'

export default function DashboardPage() {
  const { user, isAuthenticated, isLoading } = useAuth()
  // Page content...
}
```

### 2.2 Key Patterns Observed
- Uses `'use client'` directive for client components
- Uses `useAuth()` hook to get current user
- Page content wrapped in `div className="space-y-6"`
- Page header pattern: `<h1>` + `<p className="text-muted-foreground">`
- Stats cards use `grid gap-4 md:grid-cols-2 lg:grid-cols-4`

---

## 3. API Client and React Query

### 3.1 API Client
**File**: `/home/tolga/projects/terp/apps/web/src/lib/api/client.ts`

Uses `openapi-fetch` with TypeScript types generated from OpenAPI spec:
```typescript
import createClient from 'openapi-fetch'
import type { paths } from './types'

export const api = createClient<paths>({
  baseUrl: clientEnv.apiUrl,
})

// Middleware adds:
// - Authorization: Bearer <token>
// - X-Tenant-ID: <tenantId>
```

### 3.2 useApiQuery Hook
**File**: `/home/tolga/projects/terp/apps/web/src/hooks/use-api-query.ts`

Type-safe wrapper for React Query:
```typescript
export function useApiQuery<Path extends GetPaths>(
  path: Path,
  options?: UseApiQueryOptions<Path>
)

// Usage examples:
const { data, isLoading } = useApiQuery('/employees')
const { data } = useApiQuery('/employees', { params: { limit: 20 } })
const { data } = useApiQuery('/employees/{id}', { path: { id: '123' } })
```

### 3.3 useApiMutation Hook
**File**: `/home/tolga/projects/terp/apps/web/src/hooks/use-api-mutation.ts`

Type-safe mutation wrapper:
```typescript
export function useApiMutation<Path, Method>(
  path: Path,
  method: Method,
  options?: { invalidateKeys?: unknown[][], onSuccess?: Function }
)

// Usage examples:
const createEmployee = useApiMutation('/employees', 'post', {
  invalidateKeys: [['/employees']],
})
```

### 3.4 Query Provider Configuration
**File**: `/home/tolga/projects/terp/apps/web/src/providers/query-provider.tsx`

- staleTime: 5 minutes
- gcTime: 30 minutes
- refetchOnWindowFocus: false
- retry: 1
- ReactQueryDevtools included in dev

---

## 4. Existing Domain Hooks

### 4.1 Bookings Hooks
**File**: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-bookings.ts`

```typescript
export function useBookings(options: UseBookingsOptions = {})
// Options: employeeId, from, to, limit, page, enabled

export function useBooking(id: string, enabled = true)
export function useCreateBooking()  // invalidates ['/bookings'], ['/daily-values']
export function useUpdateBooking()  // invalidates ['/bookings'], ['/daily-values']
export function useDeleteBooking()  // invalidates ['/bookings'], ['/daily-values']
```

### 4.2 Employees Hooks
**File**: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-employees.ts`

```typescript
export function useEmployees(options: UseEmployeesOptions = {})
export function useEmployee(id: string, enabled = true)
export function useCreateEmployee()
export function useUpdateEmployee()
export function useDeleteEmployee()
```

### 4.3 Missing Hooks
The following hooks do **NOT exist yet** and will need to be created:
- `useDailyValues()` - for daily calculated values
- `useMonthlyValues()` - for monthly aggregates

---

## 5. API Endpoints

### 5.1 Bookings API
**Path**: `GET /bookings`
**Parameters**:
- `employee_id` (uuid) - Filter by employee
- `from` (date) - Start date filter
- `to` (date) - End date filter
- `limit` (integer, default: 50)
- `page` (integer, default: 1)

**Response**: `BookingList` with `data: Booking[]` and `total: number`

### 5.2 Daily Values API
**Path**: `GET /daily-values`
**Parameters**:
- `employee_id` (uuid)
- `from` (date)
- `to` (date)
- `status` (enum: pending, calculated, error, approved)
- `has_errors` (boolean)
- `limit` (integer, default: 50)
- `cursor` (string)

**Response**: `DailyValueList` with `data: DailyValue[]`

### 5.3 Monthly Values API
**Path**: `GET /monthly-values`
**Parameters**:
- `employee_id` (uuid)
- `year` (integer)
- `month` (integer, 1-12)
- `status` (enum: open, calculated, closed, exported)
- `department_id` (uuid)

**Response**: `MonthlyValueList` with `data: MonthlyValue[]`

---

## 6. Data Types

### 6.1 Booking Schema
**File**: `/home/tolga/projects/terp/api/schemas/bookings.yaml`

```typescript
interface Booking {
  id: string
  tenant_id: string
  employee_id: string
  booking_date: string              // YYYY-MM-DD
  booking_type_id: string
  original_time: number             // Minutes from midnight (480 = 08:00)
  edited_time: number               // User-edited time
  calculated_time?: number | null   // After tolerance/rounding
  time_string?: string              // Read-only "HH:MM"
  pair_id?: string | null           // Paired booking ID
  source: 'web' | 'terminal' | 'api' | 'import' | 'correction'
  terminal_id?: string | null
  notes?: string | null
  employee?: EmployeeSummary | null
  booking_type?: BookingTypeSummary | null
}

interface BookingTypeSummary {
  id: string
  code: string                      // e.g., "COME"
  name: string                      // e.g., "Clock In"
  direction: 'in' | 'out'
}
```

### 6.2 DailyValue Schema
**File**: `/home/tolga/projects/terp/api/schemas/daily-values.yaml`

```typescript
interface DailyValue {
  id: string
  tenant_id: string
  employee_id: string
  value_date: string                // YYYY-MM-DD
  day_plan_id?: string | null
  status: 'pending' | 'calculated' | 'error' | 'approved'
  target_minutes?: number           // Target work time
  gross_minutes?: number            // Before break deduction
  break_minutes?: number            // Total breaks
  net_minutes?: number              // After break deduction
  overtime_minutes?: number
  undertime_minutes?: number
  balance_minutes?: number          // overtime - undertime
  is_holiday?: boolean
  is_weekend?: boolean
  is_absence?: boolean
  absence_type_id?: string | null
  has_errors?: boolean
  is_locked?: boolean               // After month closing
  calculated_at?: string | null
  employee?: EmployeeSummary | null
  day_plan?: DayPlanSummary | null
  absence_type?: AbsenceTypeSummary | null
  errors?: DailyError[]
}

interface DailyError {
  id: string
  daily_value_id: string
  error_type: 'missing_booking' | 'unpaired_booking' | 'overlapping_bookings' |
              'core_time_violation' | 'exceeds_max_hours' | 'below_min_hours' |
              'break_violation' | 'invalid_sequence'
  message: string
  severity?: 'warning' | 'error'
  booking_id?: string | null
}
```

### 6.3 MonthlyValue Schema
**File**: `/home/tolga/projects/terp/api/schemas/monthly-values.yaml`

```typescript
interface MonthlyValue {
  id: string
  tenant_id: string
  employee_id: string
  year: number
  month: number                     // 1-12
  status?: 'open' | 'calculated' | 'closed' | 'exported'
  target_minutes?: number           // Total target for month
  gross_minutes?: number
  break_minutes?: number
  net_minutes?: number
  overtime_minutes?: number
  undertime_minutes?: number
  balance_minutes?: number
  working_days?: number             // Total working days
  worked_days?: number              // Days actually worked
  absence_days?: number             // Decimal for half days
  holiday_days?: number
  account_balances?: Record<string, number>  // account_id -> minutes
  calculated_at?: string | null
  closed_at?: string | null
  closed_by?: string | null
  employee?: EmployeeSummary | null
}
```

### 6.4 DayView Schema (Composite)
```typescript
interface DayView {
  employee_id: string
  date: string
  bookings: Booking[]
  daily_value?: DailyValue | null
  day_plan?: DayPlanSummary | null
  is_holiday?: boolean
  holiday?: Holiday | null
  errors?: DailyError[]
}
```

---

## 7. UI Components Available

### 7.1 Design System Components
**Location**: `/home/tolga/projects/terp/apps/web/src/components/ui/`

| Component | File | Variants/Features |
|-----------|------|-------------------|
| Button | `button.tsx` | default, destructive, outline, secondary, ghost, link; sizes: default, xs, sm, lg, icon |
| Card | `card.tsx` | Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter |
| Badge | `badge.tsx` | default, secondary, destructive, outline, ghost, link |
| Input | `input.tsx` | Standard input with focus states |
| Label | `label.tsx` | Standard label |
| Skeleton | `skeleton.tsx` | Loading placeholder |
| Tooltip | `tooltip.tsx` | Tooltip, TooltipTrigger, TooltipContent |
| DropdownMenu | `dropdown-menu.tsx` | Full dropdown menu system |
| ScrollArea | `scroll-area.tsx` | Scrollable container |
| Separator | `separator.tsx` | Horizontal/vertical divider |
| Alert | `alert.tsx` | Notification alerts |
| Sheet | `sheet.tsx` | Slide-out panels |
| Avatar | `avatar.tsx` | User avatars |
| Breadcrumb | `breadcrumb.tsx` | Navigation breadcrumbs |

### 7.2 Layout Primitives
**Location**: `/home/tolga/projects/terp/apps/web/src/components/ui/`

| Component | Props |
|-----------|-------|
| Stack | direction, gap (0-12), align, justify, wrap |
| HStack | Horizontal stack |
| VStack | Vertical stack |
| Grid | cols (1-6, 12), gap (0-12) |
| GridItem | span (1-6, 12, 'full') |
| Container | max-width constraint |

### 7.3 What's Missing
The following UI components do **NOT exist** and may need to be created:
- **Table** - No table component exists
- **Calendar/DatePicker** - No date picker component
- **Tabs** - No tab component for view mode switching
- **Select** - No select dropdown component

---

## 8. Styling

### 8.1 CSS Framework
- **Tailwind CSS 4.0** with `@tailwindcss/postcss`
- **class-variance-authority** for component variants
- **clsx** + **tailwind-merge** via `cn()` utility

### 8.2 Key CSS Variables
**From design system page**:
```css
--sidebar-width: 240px
--sidebar-collapsed-width: 64px
--header-height: 64px
--content-max-width: 1280px
--bottom-nav-height: 64px

--duration-fast: 150ms
--duration-normal: 200ms
--duration-slow: 300ms
```

### 8.3 Color System
- Primary, Secondary colors with foreground variants
- Semantic: success, warning, error, info
- Neutral: background, foreground, card, muted, accent, destructive
- All with light/dark mode support

---

## 9. Auth Context

### 9.1 Current User Access
**File**: `/home/tolga/projects/terp/apps/web/src/providers/auth-provider.tsx`

```typescript
const { user, isAuthenticated, isLoading, error, logout, refetch } = useAuth()

interface User {
  id: string
  email: string
  display_name: string
  role: string
  // additional fields...
}
```

### 9.2 User's Employee ID
The current user's `employee_id` would need to be obtained to filter timesheet data. This may require:
- Looking up the user's associated employee record
- Or storing employee_id in the user context

---

## 10. Testing Setup

### 10.1 Available Tools
- **Storybook 10.2** - Component development
- **Vitest 4.0** - Unit testing
- **Playwright** - E2E testing

### 10.2 Existing Stories
```
src/stories/
  design-system/
    Colors.stories.tsx
    Typography.stories.tsx
    Accessibility.stories.tsx
  components/
    Button.stories.tsx
```

---

## 11. Key Dependencies

```json
{
  "@tanstack/react-query": "^5.90.20",
  "openapi-fetch": "^0.15.0",
  "lucide-react": "^0.563.0",
  "next": "^16.1.0",
  "react": "^19.2.0",
  "@radix-ui/react-*": "Various"
}
```

---

## 12. Summary of What Needs to Be Created

### Must Create
1. **Page**: `/apps/web/src/app/(dashboard)/timesheet/page.tsx`
2. **Hooks**: `useDailyValues()`, `useMonthlyValues()`
3. **Components**:
   - View mode toggle (Day/Week/Month tabs)
   - Period navigation (prev/next buttons)
   - Daily booking list with pairs
   - Weekly table view
   - Monthly calendar grid
   - Time display component (Original -> Calculated format)
   - Daily summary component (Gross, Net, Target, Balance)
   - Error/warning badge for days with issues

### May Need to Create
- Table component (or use plain HTML table with Tailwind)
- Tabs component (or use buttons with state)
- Calendar component (for month view)
- DatePicker component (for date selection)
- Export functionality (PDF/CSV)

### Existing Infrastructure to Use
- `useApiQuery` / `useApiMutation` hooks
- `useBookings` hook (already exists)
- `useAuth` for current user
- All UI primitives (Button, Card, Badge, etc.)
- Layout system (AppLayout, Grid, Stack)
- Skeleton for loading states

---

## End of Research Document
