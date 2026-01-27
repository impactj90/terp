# Research: NOK-220 - Clock In/Out Feature

## Overview

This document captures the existing codebase structure relevant to implementing the one-click clock in/out feature with status indicator for the Next.js frontend.

---

## 1. Frontend Project Structure

### Location
`/home/tolga/projects/terp/apps/web/`

### Key Directories
```
apps/web/
  src/
    app/                    # Next.js App Router pages
      (auth)/               # Auth-related pages (login)
      (dashboard)/          # Protected dashboard pages
      globals.css           # Theme and design tokens
    components/
      auth/                 # Auth components (ProtectedRoute, UserMenu)
      layout/               # Layout components (AppLayout, Sidebar, Header, MobileNav)
      ui/                   # UI primitives (Button, Badge, Card, etc.)
      forms/                # Form components (empty - .gitkeep)
    hooks/
      api/                  # Domain-specific API hooks (use-employees, use-bookings)
      use-api-query.ts      # Generic typed query hook
      use-api-mutation.ts   # Generic typed mutation hook
      use-auth.ts           # Auth hooks
      use-has-role.ts       # Role-based access hooks
    lib/
      api/
        client.ts           # API client with openapi-fetch
        types.ts            # Generated TypeScript types from OpenAPI
        errors.ts           # Error handling utilities
      utils.ts              # Utility functions (cn for classnames)
    providers/
      auth-provider.tsx     # Auth context provider
      query-provider.tsx    # React Query provider
      theme-provider.tsx    # Theme (dark/light) provider
    config/
      env.ts                # Environment configuration
    stories/                # Storybook stories
```

### Route Structure
- `(auth)/login/page.tsx` - Login page
- `(dashboard)/layout.tsx` - Protected layout wrapper
- `(dashboard)/dashboard/page.tsx` - Dashboard page
- Time Clock route planned: `/time-clock` (exists in navigation config but no page yet)

---

## 2. Design System and UI Components

### Available UI Components

| Component | Location | Description |
|-----------|----------|-------------|
| Button | `components/ui/button.tsx` | Primary button with variants (default, destructive, outline, secondary, ghost, link) and sizes (xs, sm, default, lg, icon variants) |
| Badge | `components/ui/badge.tsx` | Status indicators with variants (default, secondary, destructive, outline, ghost, link) |
| Card | `components/ui/card.tsx` | Container with CardHeader, CardTitle, CardDescription, CardContent, CardFooter |
| Alert | `components/ui/alert.tsx` | Notifications with default and destructive variants |
| Skeleton | `components/ui/skeleton.tsx` | Loading placeholder with pulse animation |
| DropdownMenu | `components/ui/dropdown-menu.tsx` | Full dropdown with items, radio groups, checkboxes |
| Tooltip | `components/ui/tooltip.tsx` | Hover tooltips |
| Avatar | `components/ui/avatar.tsx` | User avatars |
| Sheet | `components/ui/sheet.tsx` | Slide-out panels |
| Separator | `components/ui/separator.tsx` | Visual dividers |
| ScrollArea | `components/ui/scroll-area.tsx` | Scrollable containers |
| Input | `components/ui/input.tsx` | Form inputs |
| Label | `components/ui/label.tsx` | Form labels |
| Grid | `components/ui/grid.tsx` | Grid layout |
| Stack | `components/ui/stack.tsx` | Stack layout |
| Container | `components/ui/container.tsx` | Max-width container |
| Breadcrumb | `components/ui/breadcrumb.tsx` | Breadcrumb navigation |

### Design Tokens (from globals.css)

**Layout Dimensions:**
```css
--sidebar-width: 240px;
--sidebar-collapsed-width: 64px;
--header-height: 64px;
--content-max-width: 1280px;
--bottom-nav-height: 64px;
```

**Colors (Light Mode):**
```css
--color-primary: hsl(217 91% 60%);           /* Blue */
--color-success: hsl(142 71% 45%);           /* Green #22C55E */
--color-warning: hsl(38 92% 50%);            /* Amber #F59E0B */
--color-error: hsl(0 84% 60%);               /* Red #EF4444 */
--color-destructive: hsl(0 84% 60%);         /* Same as error */
--color-muted-foreground: hsl(215 16% 47%);  /* Slate 500 */
```

**Border Radius:**
```css
--radius-lg: 0.5rem;
--radius-md: calc(var(--radius-lg) - 2px);
--radius-sm: calc(var(--radius-lg) - 4px);
--radius-full: 9999px;
```

**Animation Timing:**
```css
--duration-fast: 150ms;
--duration-normal: 200ms;
--duration-slow: 300ms;
```

### Button Variants (for clock button states)
```typescript
// From button.tsx
variants: {
  variant: {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
    destructive: 'bg-destructive text-white hover:bg-destructive/90',
    outline: 'border bg-background shadow-xs hover:bg-accent',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    link: 'text-primary underline-offset-4 hover:underline',
  },
  size: {
    default: 'h-9 px-4 py-2',
    xs: 'h-6 gap-1 rounded-md px-2 text-xs',
    sm: 'h-8 rounded-md gap-1.5 px-3',
    lg: 'h-10 rounded-md px-6',
    icon: 'size-9',
    'icon-xs': 'size-6 rounded-md',
    'icon-sm': 'size-8',
    'icon-lg': 'size-10',
  },
}
```

---

## 3. API Client Setup

### Client Configuration
**Location:** `/home/tolga/projects/terp/apps/web/src/lib/api/client.ts`

```typescript
// Uses openapi-fetch for typed API calls
import createClient from 'openapi-fetch'
import type { paths } from './types'

const client = createClient<paths>({
  baseUrl: clientEnv.apiUrl,  // http://localhost:8080/api/v1
})

// Middleware for auth and tenant headers
client.use(authMiddleware)    // Adds Authorization: Bearer <token>
client.use(tenantMiddleware)  // Adds X-Tenant-ID header
```

### Token Storage
```typescript
// localStorage-based storage
const authStorage: AuthTokenStorage = {
  getToken: () => localStorage.getItem('auth_token'),
  setToken: (token) => localStorage.setItem('auth_token', token),
  clearToken: () => localStorage.removeItem('auth_token'),
}

const tenantIdStorage: TenantStorage = {
  getTenantId: () => localStorage.getItem('tenant_id'),
  setTenantId: (id) => localStorage.setItem('tenant_id', id),
  clearTenantId: () => localStorage.removeItem('tenant_id'),
}
```

### Generic Query Hook
**Location:** `/home/tolga/projects/terp/apps/web/src/hooks/use-api-query.ts`

```typescript
function useApiQuery<Path extends GetPaths>(
  path: Path,
  options?: UseApiQueryOptions<Path>
)

// Usage
const { data, isLoading } = useApiQuery('/employees', {
  params: { limit: 20 },
  enabled: true,
})
```

### Generic Mutation Hook
**Location:** `/home/tolga/projects/terp/apps/web/src/hooks/use-api-mutation.ts`

```typescript
function useApiMutation<Path extends MutationPaths, Method extends MutationMethod>(
  path: Path,
  method: Method,
  options?: {
    invalidateKeys?: unknown[][]  // Query keys to invalidate on success
    onSuccess?: (data, variables, context) => void
  }
)

// Usage
const createBooking = useApiMutation('/bookings', 'post', {
  invalidateKeys: [['/bookings'], ['/daily-values']],
})
```

---

## 4. Authentication Flow

### Auth Provider
**Location:** `/home/tolga/projects/terp/apps/web/src/providers/auth-provider.tsx`

```typescript
interface AuthContextValue {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  error: Error | null
  logout: () => Promise<void>
  refetch: () => Promise<void>
}

// Usage via hook
const { user, isAuthenticated, isLoading, logout } = useAuth()
```

### User Type (from API)
```typescript
interface User {
  id: string           // UUID
  email: string
  display_name: string
  avatar_url?: string
  role: 'user' | 'admin'
  created_at: string
  updated_at?: string
}
```

### Protected Routes
**Location:** `/home/tolga/projects/terp/apps/web/src/components/auth/protected-route.tsx`

```typescript
<ProtectedRoute redirectTo="/login" loadingFallback={<LoadingSkeleton />}>
  <DashboardContent />
</ProtectedRoute>
```

### Employee Context
**IMPORTANT:** The current User schema does NOT include an employee_id field. The linkage between User and Employee is not exposed in the API currently. This needs consideration for the clock in/out feature:

Options:
1. Add employee_id to User schema
2. Add endpoint to get employee by user ID
3. Use employee selector for admin users booking on behalf of others

---

## 5. Existing Booking API Endpoints

### Backend Implementation
**Location:** `/home/tolga/projects/terp/apps/api/internal/handler/booking.go`

### Available Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/bookings` | List bookings with filters |
| POST | `/bookings` | Create booking |
| GET | `/bookings/{id}` | Get single booking |
| PUT | `/bookings/{id}` | Update booking |
| DELETE | `/bookings/{id}` | Delete booking |
| GET | `/employees/{id}/day/{date}` | Get day view (bookings + daily value + errors) |
| POST | `/employees/{id}/day/{date}/calculate` | Trigger recalculation |

### Create Booking Request
```typescript
interface CreateBookingRequest {
  employee_id: string    // UUID
  booking_date: string   // YYYY-MM-DD
  booking_type_id: string // UUID
  time: string           // HH:MM format
  notes?: string
}
```

### Booking Response
```typescript
interface Booking {
  id: string
  tenant_id: string
  employee_id: string
  booking_date: string      // YYYY-MM-DD
  booking_type_id: string
  original_time: number     // Minutes from midnight
  edited_time: number       // Minutes from midnight
  calculated_time?: number  // After tolerance/rounding
  time_string: string       // HH:MM (read-only)
  pair_id?: string          // Linked IN/OUT pair
  source: 'web' | 'terminal' | 'api' | 'import' | 'correction'
  notes?: string
  terminal_id?: string
  created_at: string
  updated_at: string
  created_by?: string
  updated_by?: string
  employee?: EmployeeSummary
  booking_type?: BookingTypeSummary
}
```

### Day View Response
```typescript
interface DayView {
  employee_id: string
  date: string
  bookings: Booking[]
  daily_value?: DailyValue
  day_plan?: DayPlanSummary
  is_holiday: boolean
  holiday?: Holiday
  errors?: DailyError[]
}
```

### Existing Frontend Hooks
**Location:** `/home/tolga/projects/terp/apps/web/src/hooks/api/use-bookings.ts`

```typescript
// List bookings
useBookings({ employeeId, from, to, limit, page, enabled })

// Get single booking
useBooking(id, enabled)

// Create booking
const createBooking = useCreateBooking()
createBooking.mutate({
  body: { employee_id, booking_date, booking_type_id, time, notes }
})

// Update booking
const updateBooking = useUpdateBooking()

// Delete booking
const deleteBooking = useDeleteBooking()
```

---

## 6. Booking Types

### API Endpoint
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/booking-types` | List types (filter: active, direction) |
| POST | `/booking-types` | Create type |
| GET | `/booking-types/{id}` | Get type |
| PATCH | `/booking-types/{id}` | Update type |
| DELETE | `/booking-types/{id}` | Delete type |

### System Booking Types (from ticket)
| Code | Name | Direction | Usage |
|------|------|-----------|-------|
| A1 | Kommen | in | Clock In |
| A2 | Gehen | out | Clock Out |
| P1 | Pause Beginn | out | Start Break |
| P2 | Pause Ende | in | End Break |
| D1 | Dienstgang Beginn | out | Start Work Errand |
| D2 | Dienstgang Ende | in | End Work Errand |

### Booking Type Schema
```typescript
interface BookingType {
  id: string
  tenant_id?: string    // Null for system types
  code: string          // e.g., "A1"
  name: string          // e.g., "Clock In"
  description?: string
  direction: 'in' | 'out'
  is_system: boolean    // System types cannot be deleted
  is_active: boolean
  created_at: string
  updated_at: string
}
```

### Missing Hook
**NOTE:** No `useBookingTypes` hook exists yet. Needs to be created:
```typescript
// Suggested implementation
export function useBookingTypes(options?: { active?: boolean, direction?: 'in' | 'out' }) {
  return useApiQuery('/booking-types', {
    params: { active: options?.active, direction: options?.direction },
  })
}
```

---

## 7. Real-Time Updates / Polling Patterns

### Current React Query Configuration
**Location:** `/home/tolga/projects/terp/apps/web/src/providers/query-provider.tsx`

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,        // 5 minutes
      gcTime: 30 * 60 * 1000,          // 30 minutes garbage collection
      refetchOnWindowFocus: false,     // Disabled by default
      retry: 1,
    },
    mutations: {
      retry: false,
    },
  },
})
```

### Patterns for Real-Time Timer

**Option 1: Client-Side Timer (Recommended for Running Time)**
```typescript
// Use useState + useEffect for running timer display
const [elapsedTime, setElapsedTime] = useState(0)

useEffect(() => {
  if (!isClockedIn || !clockInTime) return

  const interval = setInterval(() => {
    setElapsedTime(Date.now() - clockInTime)
  }, 1000)

  return () => clearInterval(interval)
}, [isClockedIn, clockInTime])
```

**Option 2: Query Polling for Status Updates**
```typescript
const { data } = useApiQuery('/employees/{id}/day/{date}', {
  path: { id: employeeId, date: today },
  refetchInterval: 30000, // Poll every 30 seconds
})
```

**Option 3: Invalidation on Mutation**
```typescript
// Already implemented in useCreateBooking
invalidateKeys: [['/bookings'], ['/daily-values']]
```

---

## 8. Time-Related Components and Utilities

### No Dedicated Time Utilities Exist Yet

The backend uses:
- Time stored as minutes from midnight (integer)
- `time_string` field for HH:MM display (read-only, computed by backend)

### Suggested Client-Side Utilities Needed

```typescript
// Convert HH:MM to minutes from midnight
function timeStringToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

// Convert minutes to HH:MM
function minutesToTimeString(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

// Format elapsed time for running timer
function formatElapsedTime(milliseconds: number): string {
  const totalMinutes = Math.floor(milliseconds / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}:${minutes.toString().padStart(2, '0')}`
}

// Get current time as HH:MM
function getCurrentTimeString(): string {
  const now = new Date()
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
}
```

---

## 9. Navigation Configuration

### Sidebar Navigation
**Location:** `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

```typescript
// Time Clock already configured in Main section
{
  title: 'Time Clock',
  href: '/time-clock',
  icon: Clock,
  description: 'Clock in and out',
}
```

### Mobile Navigation
```typescript
// Also configured for mobile bottom nav
{
  title: 'Time',
  href: '/time-clock',
  icon: Clock,
}
```

---

## 10. Error Handling

### API Error Types
**Location:** `/home/tolga/projects/terp/apps/web/src/lib/api/errors.ts`

```typescript
interface ApiError {
  status: number
  title: string
  message: string
  fieldErrors?: Record<string, string>
  raw: ProblemDetails | unknown
}

// Utility functions
parseApiError(error: unknown): ApiError
getErrorMessage(status: number, fallback?: string): string
isAuthError(error: ApiError): boolean        // 401
isForbiddenError(error: ApiError): boolean   // 403
isValidationError(error: ApiError): boolean  // 400 or 422
isNotFoundError(error: ApiError): boolean    // 404
```

### Backend Booking Errors
```typescript
// From booking handler
ErrMonthClosed: 403
ErrInvalidBookingTime: 400
ErrInvalidBookingType: 400
ErrBookingNotFound: 404
```

---

## 11. Daily Values Schema

### DailyValue Response
```typescript
interface DailyValue {
  id: string
  tenant_id: string
  employee_id: string
  value_date: string        // YYYY-MM-DD
  day_plan_id?: string
  status: 'pending' | 'calculated' | 'error' | 'approved'
  target_minutes: number    // Target work time
  gross_minutes: number     // Gross work time
  break_minutes: number     // Break time
  net_minutes: number       // Net work time
  overtime_minutes: number
  undertime_minutes: number
  balance_minutes: number   // overtime - undertime
  is_holiday: boolean
  is_weekend: boolean
  is_absence: boolean
  absence_type_id?: string
  has_errors: boolean
  is_locked: boolean        // Locked after month closing
  calculated_at?: string
  created_at: string
  updated_at: string
  employee?: EmployeeSummary
  day_plan?: DayPlanSummary
  absence_type?: AbsenceTypeSummary
  errors?: DailyError[]
}
```

### DailyError Types
```typescript
type ErrorType =
  | 'missing_booking'
  | 'unpaired_booking'
  | 'overlapping_bookings'
  | 'core_time_violation'
  | 'exceeds_max_hours'
  | 'below_min_hours'
  | 'break_violation'
  | 'invalid_sequence'
```

---

## 12. Summary of Missing Pieces

### Hooks Needed
1. `useBookingTypes()` - Fetch available booking types
2. `useEmployeeDayView(employeeId, date)` - Get day view with bookings
3. `useDailyValue(employeeId, date)` - Get daily calculation

### Missing Employee-User Linkage
The User schema doesn't include employee_id. Options:
1. Modify User schema to include linked employee_id
2. Add `/auth/me/employee` endpoint
3. For now, allow employee selection or use first available

### Time Utilities
No client-side time formatting utilities exist. Need to create for:
- Current time display
- Running timer
- Time string formatting

### Page Structure Needed
- `/time-clock/page.tsx` - Main time clock page
- Components:
  - ClockButton - Large action button
  - StatusBadge - Current status display
  - RunningTimer - Real-time elapsed time
  - BookingTypeSelector - Dropdown for non-standard bookings
  - TodayBookingHistory - List of today's bookings
  - TodayStats - Summary card

---

## 13. Package Dependencies

### Already Available
```json
{
  "@tanstack/react-query": "^5.90.20",
  "lucide-react": "^0.563.0",
  "class-variance-authority": "^0.7.1",
  "clsx": "^2.1.1",
  "tailwind-merge": "^2.6.0",
  "@radix-ui/react-dropdown-menu": "^2.1.16",
  "@radix-ui/react-tooltip": "^1.2.8"
}
```

### May Need (for animations)
- CSS keyframes already available via Tailwind
- `animate-pulse` for pulsing effect
- Custom keyframes can be added to globals.css

---

*Document created: 2026-01-25*
*Ticket: NOK-220*
