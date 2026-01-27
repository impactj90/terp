# Research: NOK-219 - Build Employee Dashboard

## Overview

This document captures the codebase research for implementing an employee dashboard with quick actions and summary cards.

---

## 1. Frontend Structure

### Project Setup

- **Framework**: Next.js 16 with Turbopack (`next dev --turbopack -p 3001`)
- **React**: 19.2.0
- **TypeScript**: 5.7.0
- **Package Manager**: pnpm
- **Build Tool**: Next.js built-in + Turbopack for dev

### Directory Structure

```
apps/web/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/             # Auth routes group (login)
│   │   ├── (dashboard)/        # Dashboard routes group (protected)
│   │   │   ├── layout.tsx      # Protected layout with AppLayout
│   │   │   └── dashboard/
│   │   │       └── page.tsx    # Current dashboard page
│   │   ├── globals.css         # Tailwind v4 theme + CSS variables
│   │   ├── layout.tsx          # Root layout
│   │   └── page.tsx            # Root page (redirects)
│   ├── components/
│   │   ├── auth/               # Auth components (ProtectedRoute, UserMenu)
│   │   ├── layout/             # Layout components (AppLayout, Header, Sidebar)
│   │   └── ui/                 # shadcn/ui components
│   ├── hooks/                  # Custom hooks
│   │   ├── api/                # Domain-specific hooks (useEmployees, useBookings)
│   │   ├── use-api-query.ts    # Generic typed query hook
│   │   ├── use-api-mutation.ts # Generic typed mutation hook
│   │   ├── use-auth.ts         # Auth hooks (useCurrentUser, useLogin, etc.)
│   │   └── use-has-role.ts     # Role-based access hooks
│   ├── lib/
│   │   ├── api/                # API client and types
│   │   │   ├── client.ts       # openapi-fetch client with middleware
│   │   │   ├── types.ts        # Generated TypeScript types (large file)
│   │   │   ├── errors.ts       # Error handling utilities
│   │   │   └── index.ts        # Re-exports
│   │   └── utils.ts            # cn() utility for class merging
│   ├── providers/
│   │   ├── auth-provider.tsx   # AuthContext provider
│   │   ├── query-provider.tsx  # React Query provider
│   │   └── theme-provider.tsx  # Dark mode theme provider
│   └── config/
│       └── env.ts              # Environment configuration
├── package.json
├── components.json             # shadcn/ui configuration
├── next.config.ts
├── postcss.config.mjs
└── tsconfig.json
```

### Routing Pattern

- Uses Next.js App Router with route groups
- `(auth)` group for unauthenticated routes (login)
- `(dashboard)` group for authenticated routes with `ProtectedRoute` wrapper
- Dashboard layout in `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/layout.tsx` wraps children in `ProtectedRoute` and `AppLayout`

---

## 2. Existing Patterns

### Dashboard Page (Current Implementation)

**File**: `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/dashboard/page.tsx`

The existing dashboard page contains:
- Auth debug card showing authentication status
- Page header with title and welcome message
- Stats cards grid (4 columns on desktop) using inline `StatsCard` component
- Recent activity list with inline `ActivityItem` component
- All data is currently static/hardcoded

Key patterns:
```tsx
// Stats card grid
<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
  <StatsCard ... />
</div>

// Inline stats card component
function StatsCard({ title, value, description, icon: Icon }: StatsCardProps) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="mt-2">
        <span className="text-2xl font-bold">{value}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  )
}
```

### Card Components (shadcn/ui)

**File**: `/home/tolga/projects/terp/apps/web/src/components/ui/card.tsx`

Available exports:
- `Card` - Base card with `bg-card`, `rounded-xl border`, `shadow-sm`
- `CardHeader` - Header with grid layout, 2px gap, px-6
- `CardTitle` - Title with `font-semibold`
- `CardDescription` - Description with `text-muted-foreground text-sm`
- `CardAction` - Action slot (top-right)
- `CardContent` - Content area with px-6
- `CardFooter` - Footer with flex layout

Example:
```tsx
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>Content here</CardContent>
  <CardFooter>Footer actions</CardFooter>
</Card>
```

### Skeleton Component

**File**: `/home/tolga/projects/terp/apps/web/src/components/ui/skeleton.tsx`

```tsx
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-accent animate-pulse rounded-md", className)}
      {...props}
    />
  )
}
```

### Full Page Loading Skeleton

**File**: `/home/tolga/projects/terp/apps/web/src/components/layout/loading-skeleton.tsx`

Complete layout skeleton that mimics real layout structure:
- Sidebar skeleton with nav items
- Header skeleton with search and actions
- Content skeleton with page title and card grid

### Alert Component (Error States)

**File**: `/home/tolga/projects/terp/apps/web/src/components/ui/alert.tsx`

Available exports:
- `Alert` - Base alert with variant support (`default`, `destructive`)
- `AlertTitle` - Alert title
- `AlertDescription` - Alert description

Example:
```tsx
<Alert variant="destructive">
  <AlertCircle className="h-4 w-4" />
  <AlertTitle>Error</AlertTitle>
  <AlertDescription>Something went wrong.</AlertDescription>
</Alert>
```

### Grid and Stack Layout Components

**File**: `/home/tolga/projects/terp/apps/web/src/components/ui/grid.tsx`

```tsx
<Grid cols={3} gap={4}>
  <GridItem span={2}>...</GridItem>
  <GridItem>...</GridItem>
</Grid>
```

**File**: `/home/tolga/projects/terp/apps/web/src/components/ui/stack.tsx`

```tsx
<Stack direction="column" gap={4} align="stretch">...</Stack>
<HStack gap={2} align="center">...</HStack>
<VStack gap={4}>...</VStack>
```

### Button Component

**File**: `/home/tolga/projects/terp/apps/web/src/components/ui/button.tsx`

Variants: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`
Sizes: `default`, `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg`

### Badge Component

**File**: `/home/tolga/projects/terp/apps/web/src/components/ui/badge.tsx`

Variants: `default`, `secondary`, `destructive`, `outline`, `ghost`, `link`

---

## 3. Data Fetching Patterns

### useApiQuery Hook

**File**: `/home/tolga/projects/terp/apps/web/src/hooks/use-api-query.ts`

Type-safe query hook wrapping React Query and openapi-fetch:

```tsx
// Simple query
const { data, isLoading, error } = useApiQuery('/employees')

// With query parameters
const { data } = useApiQuery('/employees', {
  params: { limit: 20, department_id: 'uuid' }
})

// With path parameters
const { data } = useApiQuery('/employees/{id}', {
  path: { id: '123' }
})

// With options
const { data } = useApiQuery('/employees/{id}', {
  path: { id },
  enabled: !!id,
  staleTime: 5 * 60 * 1000,
})
```

### useApiMutation Hook

**File**: `/home/tolga/projects/terp/apps/web/src/hooks/use-api-mutation.ts`

Type-safe mutation hook:

```tsx
const createEmployee = useApiMutation('/employees', 'post', {
  invalidateKeys: [['/employees']],
  onSuccess: () => toast.success('Created'),
})

createEmployee.mutate({
  body: { first_name: 'John', ... }
})
```

### Domain Hooks

**File**: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-employees.ts`

```tsx
// List with options
const { data, isLoading } = useEmployees({
  limit: 20,
  search: 'John',
  enabled: true,
})

// Single employee
const { data: employee } = useEmployee(employeeId)

// Mutations
const createEmployee = useCreateEmployee()
const updateEmployee = useUpdateEmployee()
const deleteEmployee = useDeleteEmployee()
```

**File**: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-bookings.ts`

```tsx
const { data } = useBookings({
  employeeId: '123',
  from: '2026-01-01',
  to: '2026-01-31',
})

const createBooking = useCreateBooking()  // Invalidates ['/bookings'], ['/daily-values']
```

### Auth Hooks

**File**: `/home/tolga/projects/terp/apps/web/src/hooks/use-auth.ts`

```tsx
const { data: user, isLoading } = useCurrentUser()
const login = useLogin()
const logout = useLogout()
const devLogin = useDevLogin()  // Returns async function
```

### Auth Context

**File**: `/home/tolga/projects/terp/apps/web/src/providers/auth-provider.tsx`

```tsx
const { user, isLoading, isAuthenticated, error, logout, refetch } = useAuth()
```

---

## 4. API Integration

### API Client

**File**: `/home/tolga/projects/terp/apps/web/src/lib/api/client.ts`

- Uses `openapi-fetch` library
- Configured with auth middleware (Bearer token from localStorage)
- Configured with tenant middleware (X-Tenant-ID header)
- Base URL from `NEXT_PUBLIC_API_URL` env var

```tsx
import { api } from '@/lib/api'

// Direct usage (rarely needed)
const { data, error } = await api.GET('/employees/{id}', {
  params: { path: { id: '123' } }
})
```

### Generated Types

**File**: `/home/tolga/projects/terp/apps/web/src/lib/api/types.ts` (282KB)

Generated from OpenAPI spec using `openapi-typescript`.

Available via:
```tsx
import type { components, paths } from '@/lib/api/types'

type User = components['schemas']['User']
type DailyValue = components['schemas']['DailyValue']
type VacationBalance = components['schemas']['VacationBalance']
```

### Relevant API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/me` | GET | Current user info |
| `/employees/{id}` | GET | Employee details |
| `/employees/{id}/vacation-balance` | GET | Vacation balance for employee |
| `/employees/{id}/day/{date}` | GET | Day view (bookings, daily value, errors) |
| `/daily-values` | GET | List daily values (filter by employee, date range) |
| `/monthly-values` | GET | List monthly values (filter by employee, year, month) |
| `/bookings` | GET | List bookings (filter by employee, date range) |
| `/bookings` | POST | Create booking (clock in/out) |

### Key Response Schemas

**VacationBalance** (`api/schemas/vacation-balances.yaml`):
- `base_entitlement`, `additional_entitlement`, `carryover_from_previous`
- `used_days`, `planned_days`
- `total_entitlement`, `remaining_days`
- `carryover_to_next`, `carryover_expires_at`

**DailyValue** (`api/schemas/daily-values.yaml`):
- `target_minutes`, `gross_minutes`, `break_minutes`, `net_minutes`
- `overtime_minutes`, `undertime_minutes`, `balance_minutes`
- `is_holiday`, `is_weekend`, `is_absence`
- `has_errors`, `errors[]`
- `status`: pending | calculated | error | approved

**MonthlyValue** (`api/schemas/monthly-values.yaml`):
- All time values in minutes (target, gross, break, net, overtime, undertime, balance)
- `working_days`, `worked_days`, `absence_days`, `holiday_days`
- `status`: open | calculated | closed | exported
- `account_balances`: object mapping account_id to minutes

**DayView** (`api/schemas/bookings.yaml`):
- `bookings[]`, `daily_value`, `day_plan`
- `is_holiday`, `holiday`, `errors[]`

### Error Handling

**File**: `/home/tolga/projects/terp/apps/web/src/lib/api/errors.ts`

```tsx
import { parseApiError, getErrorMessage, isAuthError } from '@/lib/api/errors'

// Parse error
const apiError = parseApiError(error)
// apiError.status, apiError.title, apiError.message, apiError.fieldErrors

// User-friendly messages
const message = getErrorMessage(status, 'fallback')

// Error type checks
if (isAuthError(error)) { ... }
if (isValidationError(error)) { ... }
if (isNotFoundError(error)) { ... }
```

---

## 5. Design System

### shadcn/ui Configuration

**File**: `/home/tolga/projects/terp/apps/web/components.json`

- Style: `new-york`
- RSC: true
- TSX: true
- Icon library: `lucide`
- Base color: `neutral`
- CSS variables: true

### Available UI Components

| Component | File |
|-----------|------|
| Alert | `/components/ui/alert.tsx` |
| Avatar | `/components/ui/avatar.tsx` |
| Badge | `/components/ui/badge.tsx` |
| Breadcrumb | `/components/ui/breadcrumb.tsx` |
| Button | `/components/ui/button.tsx` |
| Card | `/components/ui/card.tsx` |
| Container | `/components/ui/container.tsx` |
| Dropdown Menu | `/components/ui/dropdown-menu.tsx` |
| Grid | `/components/ui/grid.tsx` |
| Input | `/components/ui/input.tsx` |
| Label | `/components/ui/label.tsx` |
| Scroll Area | `/components/ui/scroll-area.tsx` |
| Separator | `/components/ui/separator.tsx` |
| Sheet | `/components/ui/sheet.tsx` |
| Skeleton | `/components/ui/skeleton.tsx` |
| Stack | `/components/ui/stack.tsx` |
| Theme Toggle | `/components/ui/theme-toggle.tsx` |
| Tooltip | `/components/ui/tooltip.tsx` |

### Tailwind v4 Theme

**File**: `/home/tolga/projects/terp/apps/web/src/app/globals.css`

Key CSS variables:
```css
/* Layout */
--sidebar-width: 240px;
--sidebar-collapsed-width: 64px;
--header-height: 64px;
--content-max-width: 1280px;
--bottom-nav-height: 64px;

/* Colors */
--color-primary: hsl(217 91% 60%);  /* Blue */
--color-success: hsl(142 71% 45%);  /* Green */
--color-warning: hsl(38 92% 50%);   /* Amber */
--color-error: hsl(0 84% 60%);      /* Red */
--color-info: hsl(199 89% 48%);     /* Sky */

/* Semantic */
--color-background, --color-foreground
--color-card, --color-card-foreground
--color-muted, --color-muted-foreground

/* Border Radius */
--radius-lg: 0.5rem;
--radius-md: calc(var(--radius-lg) - 2px);
--radius-sm: calc(var(--radius-lg) - 4px);
```

Dark mode support via `.dark` class and `prefers-color-scheme` media query.

### Icon Library

Using `lucide-react`. Common icons in sidebar config:
```tsx
import {
  LayoutDashboard, Clock, Calendar, CalendarDays,
  Users, Building2, Briefcase, Settings, FileText,
  CalendarOff, UserCog, Shield
} from 'lucide-react'
```

---

## 6. Layout Components

### AppLayout

**File**: `/home/tolga/projects/terp/apps/web/src/components/layout/app-layout.tsx`

Wraps entire dashboard with:
- Desktop sidebar (hidden on mobile)
- Header with mobile menu button
- Main content area with breadcrumbs
- Mobile bottom navigation
- Mobile sidebar sheet

### ProtectedRoute

**File**: `/home/tolga/projects/terp/apps/web/src/components/auth/protected-route.tsx`

- Checks `useAuth()` for authentication state
- Shows loading fallback while checking
- Redirects to login with returnUrl if not authenticated

### Navigation Config

**File**: `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

Dashboard is first item in navigation:
```tsx
{
  title: 'Dashboard',
  href: '/dashboard',
  icon: LayoutDashboard,
  description: 'Overview and quick stats',
}
```

---

## 7. State Management

- **Server State**: React Query via `@tanstack/react-query`
- **Auth State**: React Context via `AuthProvider`
- **Theme State**: React Context via `ThemeProvider`
- **Sidebar State**: React Context via `SidebarProvider`
- **Local Storage**: Token and tenant ID via custom storage utilities

---

## Summary

The codebase has:
1. Well-structured Next.js 16 App Router setup with route groups
2. Type-safe API client with generated TypeScript types from OpenAPI
3. Custom hooks for data fetching (`useApiQuery`, `useApiMutation`) wrapping React Query
4. Existing domain hooks for employees and bookings
5. shadcn/ui component library (new-york style)
6. Tailwind v4 with CSS variables for theming
7. Dark mode support
8. Loading skeleton patterns
9. Alert component for error states
10. Grid and Stack layout utilities
11. Card components for dashboard UI

Dashboard implementation can build on:
- Existing `StatsCard` pattern in current dashboard
- Card, Skeleton, Alert UI components
- `useApiQuery` hook for data fetching
- Auth context for user info

Missing hooks that need to be created:
- `useVacationBalance(employeeId)` - for vacation card
- `useDailyValues(options)` - for hours summary
- `useMonthlyValues(options)` - for flextime balance
- `useEmployeeDayView(employeeId, date)` - for today's schedule
