# Research: NOK-222 - Absence Request Form

**Date**: 2026-01-26
**Ticket**: NOK-222
**Status**: Research Complete

## 1. Executive Summary

The codebase has a well-established Next.js frontend with Radix UI/shadcn components, TanStack React Query for data fetching, and openapi-fetch for type-safe API calls. The backend already has comprehensive absence-related endpoints implemented. Key findings:

- **No calendar/date picker component exists** - must be created or added
- **Absence API endpoints are fully implemented** in the backend
- **Pattern for forms exists** in `booking-edit-dialog.tsx` using Sheet component
- **Month view calendar pattern** exists in `month-view.tsx` that can be adapted
- **Vacation balance hook** already exists for balance display

## 2. Frontend Architecture

### 2.1 Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.1.x | React framework with App Router |
| React | 19.2.x | UI library |
| TanStack React Query | 5.90.x | Server state management |
| openapi-fetch | 0.15.x | Type-safe API client |
| Radix UI | Various | Headless UI primitives |
| Tailwind CSS | 4.0.x | Styling |
| Lucide React | 0.563.x | Icons |
| class-variance-authority | 0.7.x | Component variants |

### 2.2 Project Structure

```
apps/web/src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/             # Auth layout (login)
│   ├── (dashboard)/        # Dashboard layout (protected)
│   │   ├── time-clock/     # Time clock page
│   │   ├── timesheet/      # Timesheet page
│   │   └── [future absences page here]
│   └── page.tsx            # Root redirect
├── components/
│   ├── ui/                 # Base UI components (shadcn-style)
│   ├── layout/             # Layout components (sidebar, header)
│   ├── dashboard/          # Dashboard-specific components
│   ├── time-clock/         # Time clock components
│   └── timesheet/          # Timesheet components
├── hooks/
│   ├── api/                # API query hooks
│   └── *.ts                # Utility hooks
├── lib/
│   └── api/                # API client and types
└── providers/              # React context providers
```

### 2.3 Routing Pattern

- Uses Next.js App Router with route groups
- `(auth)` group for unauthenticated pages
- `(dashboard)` group for authenticated pages
- Page files export default client components (`'use client'`)

## 3. Existing Components Analysis

### 3.1 Available UI Components

**Location**: `/apps/web/src/components/ui/`

| Component | File | Description |
|-----------|------|-------------|
| Button | `button.tsx` | Primary button with variants (default, destructive, outline, secondary, ghost, link) and sizes |
| Card | `card.tsx` | Card container with header, content, footer |
| Input | `input.tsx` | Form input field |
| Label | `label.tsx` | Form label |
| Select | `select.tsx` | Dropdown select (Radix-based) |
| Sheet | `sheet.tsx` | Side drawer/slide-out panel (Dialog-based) |
| Tabs | `tabs.tsx` | Tab navigation |
| Badge | `badge.tsx` | Status/tag badges |
| Alert | `alert.tsx` | Alert messages |
| Skeleton | `skeleton.tsx` | Loading placeholder |
| Separator | `separator.tsx` | Visual divider |
| Tooltip | `tooltip.tsx` | Hover tooltips |
| DropdownMenu | `dropdown-menu.tsx` | Dropdown menus |
| ScrollArea | `scroll-area.tsx` | Scrollable container |
| Table | `table.tsx` | Data tables |

**Missing Components Needed**:
- Calendar / DatePicker
- DateRangePicker
- Textarea (for notes)
- Popover (needed for calendar picker)
- RadioGroup (for half-day selection)

### 3.2 Layout Components

**AppLayout** (`/apps/web/src/components/layout/app-layout.tsx`):
- Wraps all dashboard pages
- Includes sidebar, header, mobile nav
- Uses SidebarProvider for collapse state

**Page Pattern** (from time-clock and timesheet pages):
```tsx
export default function PageName() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Page Title</h1>
        <p className="text-muted-foreground">Description</p>
      </div>

      {/* Content cards */}
      <Card>
        <CardContent className="pt-6">
          {/* ... */}
        </CardContent>
      </Card>
    </div>
  )
}
```

### 3.3 Form Patterns

**BookingEditDialog** (`/apps/web/src/components/timesheet/booking-edit-dialog.tsx`):
- Uses Sheet component for side-panel form
- Local state with useState for form fields
- Manual validation before submit
- useApiMutation for submission
- Error handling with Alert component
- Loading state with `isPending` check

Key pattern:
```tsx
const [fieldValue, setFieldValue] = useState('')
const [error, setError] = useState<string | null>(null)
const mutation = useApiMutation('/path', 'post', { invalidateKeys: [...] })

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  // Validate
  // Call mutation.mutateAsync({ body: {...} })
  // Close dialog on success
}
```

### 3.4 Calendar/Date Display Pattern

**MonthView** (`/apps/web/src/components/timesheet/month-view.tsx`):
- Custom calendar grid implementation
- Displays dates in 7-column grid (Mon-Sun)
- Shows daily values, holidays, absences
- Handles weekend styling
- Uses `formatDate`, `getMonthDates`, `getMonthRange` from time-utils

Calendar grid structure:
```tsx
const calendarGrid: (Date | null)[][] = [] // Weeks array with days
// First week may have null padding for alignment
```

## 4. API Client Patterns

### 4.1 API Client Setup

**Location**: `/apps/web/src/lib/api/client.ts`

```typescript
import createClient from 'openapi-fetch'
import type { paths } from './types'

const client = createClient<paths>({
  baseUrl: clientEnv.apiUrl,
})

// Middleware adds:
// - Authorization: Bearer <token>
// - X-Tenant-ID: <tenantId>
```

### 4.2 Query Hooks

**useApiQuery** (`/apps/web/src/hooks/use-api-query.ts`):
```typescript
const { data, isLoading, error, refetch } = useApiQuery('/path', {
  params: { queryParam: value },
  path: { id: '123' },
  enabled: !!condition,
})
```

### 4.3 Mutation Hooks

**useApiMutation** (`/apps/web/src/hooks/use-api-mutation.ts`):
```typescript
const mutation = useApiMutation('/path', 'post', {
  invalidateKeys: [['/related-query']],
  onSuccess: (data) => { /* handle */ },
})

// Usage
await mutation.mutateAsync({
  body: { field: value },
  path: { id: '123' },
})
```

### 4.4 Existing API Hooks

**Location**: `/apps/web/src/hooks/api/`

| Hook | File | Endpoints Used |
|------|------|----------------|
| useEmployees | `use-employees.ts` | GET /employees |
| useBookings | `use-bookings.ts` | GET/POST/PUT/DELETE /bookings |
| useDailyValues | `use-daily-values.ts` | GET /daily-values |
| useMonthlyValues | `use-monthly-values.ts` | GET /monthly-values |
| useEmployeeVacationBalance | `use-vacation-balance.ts` | GET /employees/{id}/vacation-balance |
| useBookingTypes | `use-booking-types.ts` | GET /booking-types |

**Missing Hooks for Absences**:
- useAbsenceTypes - GET /absence-types
- useEmployeeAbsences - GET /employees/{id}/absences
- useCreateAbsenceRange - POST /employees/{id}/absences
- useDeleteAbsence - DELETE /absences/{id}
- useHolidays - GET /holidays

## 5. Backend API Analysis

### 5.1 Absence Routes

**Location**: `/apps/api/internal/handler/routes.go`

```go
// Absence types
r.Get("/absence-types", h.ListTypes)

// Employee absences (nested under employees)
r.Get("/employees/{id}/absences", h.ListByEmployee)
r.Post("/employees/{id}/absences", h.CreateRange)

// Absence CRUD
r.Delete("/absences/{id}", h.Delete)
```

### 5.2 Absence Handler

**Location**: `/apps/api/internal/handler/absence.go`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/absence-types` | GET | List all absence types (vacation, sick, etc.) |
| `/employees/{id}/absences` | GET | List absences for employee with optional date range |
| `/employees/{id}/absences` | POST | Create absence range (CreateAbsenceRangeRequest) |
| `/absences/{id}` | DELETE | Delete an absence |

**CreateAbsenceRangeRequest**:
```go
type CreateAbsenceRangeInput struct {
    TenantID      uuid.UUID
    EmployeeID    uuid.UUID
    AbsenceTypeID uuid.UUID
    FromDate      time.Time
    ToDate        time.Time
    Duration      decimal.Decimal  // 1.0 = full day, 0.5 = half day
    Notes         *string
    Status        AbsenceStatus
}
```

### 5.3 Holiday Routes

**Location**: `/apps/api/internal/handler/holiday.go`

```go
r.Get("/holidays", h.List)  // Supports ?year=YYYY or ?from=X&to=Y
r.Post("/holidays", h.Create)
r.Get("/holidays/{id}", h.Get)
r.Patch("/holidays/{id}", h.Update)
r.Delete("/holidays/{id}", h.Delete)
```

### 5.4 Vacation Balance Routes

**Location**: `/apps/api/internal/handler/vacation.go`

```go
r.Get("/employees/{id}/vacation-balance", h.GetBalance)  // ?year=YYYY optional
```

Returns:
```go
VacationBalance {
    BaseEntitlement       float64
    CarryoverFromPrevious float64
    ManualAdjustment      float64
    UsedDays              float64
    TotalEntitlement      float64
    RemainingDays         float64
}
```

### 5.5 OpenAPI Schema Reference

**Absence Types** (`/api/schemas/absence-types.yaml`):
```yaml
AbsenceType:
  properties:
    id: uuid
    code: string
    name: string
    description: string
    category: enum [vacation, sick, personal, unpaid, holiday, other]
    is_paid: boolean
    affects_vacation_balance: boolean
    requires_approval: boolean
    color: string (hex)
    is_active: boolean
```

**CreateAbsenceRangeRequest** (`/api/schemas/absences.yaml`):
```yaml
CreateAbsenceRangeRequest:
  required: [absence_type_id, from, to, duration]
  properties:
    absence_type_id: uuid
    from: date (YYYY-MM-DD)
    to: date (YYYY-MM-DD)
    duration: decimal (1.0 or 0.5)
    notes: string
```

## 6. Design Patterns & Conventions

### 6.1 State Management

- **Server state**: TanStack React Query
- **Local form state**: useState
- **Global auth state**: AuthProvider context
- **Sidebar state**: SidebarProvider context
- **No Redux or Zustand used**

### 6.2 Styling Conventions

- Tailwind CSS with custom CSS variables for theming
- `cn()` utility for conditional classes (clsx + tailwind-merge)
- Consistent spacing: `space-y-6` for vertical sections
- Dark mode support via CSS variables

### 6.3 Component Conventions

- Functional components only
- Props interfaces defined inline or above component
- Loading states use Skeleton components
- Error states show Alert or inline error messages
- `'use client'` directive for client components

### 6.4 Time Handling

**Location**: `/apps/web/src/lib/time-utils.ts`

Key utilities:
- `formatDate(date)` - Returns YYYY-MM-DD
- `getWeekRange(date)` - Returns { start, end } for week
- `getMonthRange(date)` - Returns { start, end } for month
- `getMonthDates(date)` - Returns Date[] for all days in month
- `isToday(date)` - Check if date is today
- `isWeekend(date)` - Check if Saturday or Sunday
- `formatDisplayDate(date, format)` - Localized display

### 6.5 Navigation Configuration

**Location**: `/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

Absences page is already configured in navigation:
```typescript
{
  title: 'Absences',
  href: '/absences',
  icon: CalendarOff,
  description: 'Request and view absences',
}
```

## 7. Key Files Reference

### Frontend Files

| Purpose | Path |
|---------|------|
| API Client | `/apps/web/src/lib/api/client.ts` |
| API Types | `/apps/web/src/lib/api/types.ts` |
| Query Hook | `/apps/web/src/hooks/use-api-query.ts` |
| Mutation Hook | `/apps/web/src/hooks/use-api-mutation.ts` |
| Vacation Balance Hook | `/apps/web/src/hooks/api/use-vacation-balance.ts` |
| Time Utilities | `/apps/web/src/lib/time-utils.ts` |
| Button Component | `/apps/web/src/components/ui/button.tsx` |
| Card Component | `/apps/web/src/components/ui/card.tsx` |
| Sheet Component | `/apps/web/src/components/ui/sheet.tsx` |
| Select Component | `/apps/web/src/components/ui/select.tsx` |
| Input Component | `/apps/web/src/components/ui/input.tsx` |
| Label Component | `/apps/web/src/components/ui/label.tsx` |
| Badge Component | `/apps/web/src/components/ui/badge.tsx` |
| Alert Component | `/apps/web/src/components/ui/alert.tsx` |
| Month View (Calendar) | `/apps/web/src/components/timesheet/month-view.tsx` |
| Booking Edit Form | `/apps/web/src/components/timesheet/booking-edit-dialog.tsx` |
| Time Clock Page | `/apps/web/src/app/(dashboard)/time-clock/page.tsx` |
| Timesheet Page | `/apps/web/src/app/(dashboard)/timesheet/page.tsx` |
| Vacation Balance Card | `/apps/web/src/components/dashboard/vacation-balance-card.tsx` |
| Auth Provider | `/apps/web/src/providers/auth-provider.tsx` |
| App Layout | `/apps/web/src/components/layout/app-layout.tsx` |
| Nav Config | `/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` |

### Backend Files

| Purpose | Path |
|---------|------|
| Absence Handler | `/apps/api/internal/handler/absence.go` |
| Vacation Handler | `/apps/api/internal/handler/vacation.go` |
| Holiday Handler | `/apps/api/internal/handler/holiday.go` |
| Routes | `/apps/api/internal/handler/routes.go` |

### OpenAPI Schema Files

| Purpose | Path |
|---------|------|
| Absence Types | `/api/schemas/absence-types.yaml` |
| Absences | `/api/schemas/absences.yaml` |
| Absence Endpoints | `/api/paths/absences.yaml` |

## 8. Implementation Notes

### Components to Create

1. **Calendar Component** - Date picker with range selection
2. **DateRangePicker Component** - Wrapper for calendar with from/to display
3. **AbsenceTypeSelector** - Visual type picker with colors/descriptions
4. **VacationBalancePreview** - Shows impact before submission
5. **AbsenceRequestForm** - Main form component
6. **PendingRequestsList** - List of pending absence requests
7. **TeamCalendar** - Optional view of colleague absences

### Hooks to Create

```typescript
// /apps/web/src/hooks/api/use-absences.ts
export function useAbsenceTypes(options?)
export function useEmployeeAbsences(employeeId, options?)
export function useCreateAbsenceRange()
export function useDeleteAbsence()

// /apps/web/src/hooks/api/use-holidays.ts
export function useHolidays(options?)
```

### Page Structure

```
/apps/web/src/app/(dashboard)/absences/
├── page.tsx           # Main absences page with list and form
├── components/
│   ├── absence-request-form.tsx
│   ├── calendar-picker.tsx
│   ├── absence-type-selector.tsx
│   ├── vacation-impact-preview.tsx
│   └── pending-requests.tsx
```

---

*Research completed: 2026-01-26*
