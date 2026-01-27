# Research: NOK-224 - Employee Profile Page

**Date**: 2026-01-26
**Ticket**: NOK-224 - Build employee profile page with personal data management

## 1. Frontend Project Structure

### 1.1 Next.js App Router Structure

The frontend is located at `apps/web/` and uses Next.js 16+ with the App Router.

**Directory Structure**:
```
apps/web/src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/             # Auth group (login page)
│   │   ├── layout.tsx      # Minimal auth layout
│   │   └── login/page.tsx
│   ├── (dashboard)/        # Protected dashboard group
│   │   ├── layout.tsx      # Dashboard layout with sidebar
│   │   ├── dashboard/page.tsx
│   │   ├── time-clock/page.tsx
│   │   └── timesheet/page.tsx
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Home page (redirects to login/dashboard)
├── components/
│   ├── auth/               # Auth components (ProtectedRoute, UserMenu)
│   ├── dashboard/          # Dashboard-specific components
│   ├── layout/             # Layout components (AppLayout, Sidebar, Header)
│   ├── time-clock/         # Time clock components
│   ├── timesheet/          # Timesheet components
│   └── ui/                 # Shadcn/ui components
├── hooks/
│   ├── api/                # Domain-specific API hooks
│   ├── use-api-query.ts    # Generic typed query hook
│   ├── use-api-mutation.ts # Generic typed mutation hook
│   └── use-auth.ts         # Auth-related hooks
├── lib/
│   └── api/                # API client and types
│       ├── client.ts       # openapi-fetch client setup
│       ├── types.ts        # Generated TypeScript types
│       └── errors.ts       # Error handling utilities
├── providers/
│   ├── auth-provider.tsx   # Auth context
│   ├── query-provider.tsx  # React Query provider
│   ├── tenant-provider.tsx # Tenant context
│   └── theme-provider.tsx  # Theme (dark mode) provider
└── types/                  # Custom TypeScript types
```

### 1.2 Key Dependencies

From `apps/web/package.json`:
- **Next.js 16.1** with Turbopack
- **React 19.2**
- **TanStack React Query 5.90** for data fetching
- **openapi-fetch 0.15** for typed API client
- **Radix UI** primitives (Avatar, Dialog, Dropdown, Label, Select, Tabs, Tooltip)
- **class-variance-authority** for component variants
- **lucide-react** for icons
- **tailwindcss 4.0** for styling

## 2. Page Patterns and Layouts

### 2.1 Route Groups

The app uses Next.js route groups to organize layouts:

- `(auth)` group: Minimal layout for login/register pages
- `(dashboard)` group: Full application layout with sidebar and navigation

### 2.2 Dashboard Layout Pattern

File: `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/layout.tsx`

```tsx
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute loadingFallback={<LoadingSkeleton />}>
      <TenantProvider>
        <TenantGuard loadingFallback={<LoadingSkeleton />}>
          <AppLayout>{children}</AppLayout>
        </TenantGuard>
      </TenantProvider>
    </ProtectedRoute>
  )
}
```

The dashboard layout:
1. Wraps content in `ProtectedRoute` for authentication
2. Provides tenant context via `TenantProvider`
3. Guards against missing tenant with `TenantGuard`
4. Renders the main `AppLayout` with sidebar, header, and content area

### 2.3 Page Structure Pattern

Existing pages follow this pattern (from dashboard page):

```tsx
'use client'

import { useAuth } from '@/providers/auth-provider'
// ... other imports

export default function SomePage() {
  const { user, isLoading } = useAuth()

  // Get employee_id from user
  const employeeId = user?.employee_id

  // Show loading state
  if (isLoading) {
    return <PageSkeleton />
  }

  // Handle missing employee link
  if (!employeeId) {
    return <NoEmployeeLinkedMessage />
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Page Title</h1>
        <p className="text-muted-foreground">Page description</p>
      </div>

      {/* Page Content */}
      {/* ... */}
    </div>
  )
}
```

### 2.4 Timesheet Page with Tabs Pattern

File: `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/timesheet/page.tsx`

The timesheet page demonstrates tab-based navigation:
```tsx
<Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
  <TabsList>
    <TabsTrigger value="day">Day</TabsTrigger>
    <TabsTrigger value="week">Week</TabsTrigger>
    <TabsTrigger value="month">Month</TabsTrigger>
  </TabsList>
</Tabs>
```

## 3. API Client and Data Fetching

### 3.1 API Client Setup

File: `/home/tolga/projects/terp/apps/web/src/lib/api/client.ts`

The API client uses `openapi-fetch` with middleware:
- **authMiddleware**: Adds `Authorization: Bearer <token>` header
- **tenantMiddleware**: Adds `X-Tenant-ID` header

Token and tenant ID are stored in localStorage:
```tsx
export const authStorage: AuthTokenStorage = {
  getToken: () => localStorage.getItem('auth_token'),
  setToken: (token) => localStorage.setItem('auth_token', token),
  clearToken: () => localStorage.removeItem('auth_token'),
}
```

### 3.2 useApiQuery Hook

File: `/home/tolga/projects/terp/apps/web/src/hooks/use-api-query.ts`

Type-safe wrapper around React Query for GET requests:

```tsx
// Simple query
const { data, isLoading } = useApiQuery('/employees')

// With query parameters
const { data } = useApiQuery('/employees', {
  params: { limit: 20 }
})

// With path parameters
const { data } = useApiQuery('/employees/{id}', {
  path: { id: '123' }
})
```

### 3.3 useApiMutation Hook

File: `/home/tolga/projects/terp/apps/web/src/hooks/use-api-mutation.ts`

Type-safe wrapper for mutations (POST/PUT/PATCH/DELETE):

```tsx
// Create mutation
const createEmployee = useApiMutation('/employees', 'post', {
  invalidateKeys: [['/employees']],
})

// Use it
createEmployee.mutate({
  body: { first_name: 'John', last_name: 'Doe' }
})

// Update mutation
const updateEmployee = useApiMutation('/employees/{id}', 'put')
updateEmployee.mutate({
  path: { id: '123' },
  body: { first_name: 'Updated' }
})
```

### 3.4 Existing Employee Hooks

File: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-employees.ts`

```tsx
// List employees with filters
useEmployees({ limit: 20, search: 'John', active: true })

// Get single employee
useEmployee(id)

// Create employee
useCreateEmployee()

// Update employee
useUpdateEmployee()

// Delete employee
useDeleteEmployee()
```

## 4. Authentication Flow

### 4.1 Auth Provider

File: `/home/tolga/projects/terp/apps/web/src/providers/auth-provider.tsx`

Provides auth context with:
- `user: User | null` - Current authenticated user
- `isLoading: boolean` - Auth state loading
- `isAuthenticated: boolean` - Login status
- `error: Error | null` - Auth error
- `logout: () => Promise<void>` - Logout function
- `refetch: () => Promise<void>` - Refresh user data

Usage:
```tsx
const { user, isAuthenticated, logout } = useAuth()
```

### 4.2 User Type

From OpenAPI schema:
```typescript
interface User {
  id: string           // UUID
  email: string
  display_name: string
  avatar_url?: string
  role: 'user' | 'admin'
  employee_id?: string // Link to employee record
  created_at: string
  updated_at?: string
}
```

### 4.3 useCurrentUser Hook

File: `/home/tolga/projects/terp/apps/web/src/hooks/use-auth.ts`

```tsx
export function useCurrentUser(enabled = true) {
  return useApiQuery('/auth/me', {
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
```

## 5. Available API Endpoints

### 5.1 Auth Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Login with email/password |
| POST | `/auth/refresh` | Refresh JWT token |
| POST | `/auth/logout` | Logout |
| GET | `/auth/me` | Get current user |
| GET | `/auth/dev/login` | Dev mode login (development only) |

### 5.2 Employee Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/employees` | List employees (paginated) |
| POST | `/employees` | Create employee |
| GET | `/employees/{id}` | Get employee details |
| PUT | `/employees/{id}` | Update employee |
| DELETE | `/employees/{id}` | Deactivate employee |
| GET | `/employees/{id}/contacts` | List employee contacts |
| POST | `/employees/{id}/contacts` | Add employee contact |
| DELETE | `/employees/{id}/contacts/{contactId}` | Delete contact |
| GET | `/employees/{id}/cards` | List employee cards |
| POST | `/employees/{id}/cards` | Add employee card |
| DELETE | `/employees/{id}/cards/{cardId}` | Deactivate card |
| GET | `/employees/{id}/vacation-balance` | Get vacation balance |

### 5.3 User Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/users` | List users |
| GET | `/users/{id}` | Get user details |
| PATCH | `/users/{id}` | Update user (display_name, avatar_url) |

### 5.4 Employee Schema

From `/home/tolga/projects/terp/api/schemas/employees.yaml`:

```yaml
Employee:
  properties:
    id: uuid
    tenant_id: uuid
    personnel_number: string
    first_name: string
    last_name: string
    email: string (nullable)
    phone: string (nullable)
    entry_date: date
    exit_date: date (nullable)
    department_id: uuid (nullable)
    cost_center_id: uuid (nullable)
    employment_type_id: uuid (nullable)
    weekly_hours: decimal
    vacation_days_per_year: decimal
    is_active: boolean
    # Expanded relations
    department: Department (nullable)
    cost_center: CostCenter (nullable)
    employment_type: EmploymentType (nullable)
    contacts: EmployeeContact[]
    cards: EmployeeCard[]

EmployeeContact:
  properties:
    id: uuid
    employee_id: uuid
    contact_type: enum (email, phone, mobile, emergency)
    value: string
    label: string (nullable)
    is_primary: boolean

EmployeeCard:
  properties:
    id: uuid
    card_number: string
    card_type: enum (rfid, barcode, pin)
    valid_from: date
    valid_to: date (nullable)
    is_active: boolean
```

### 5.5 UpdateEmployeeRequest

```yaml
UpdateEmployeeRequest:
  properties:
    first_name: string
    last_name: string
    email: string
    phone: string
    exit_date: date
    department_id: uuid
    cost_center_id: uuid
    employment_type_id: uuid
    weekly_hours: decimal
    vacation_days_per_year: decimal
```

## 6. UI Component Library

### 6.1 Available UI Components

Located in `/home/tolga/projects/terp/apps/web/src/components/ui/`:

- **alert.tsx** - Alert messages with variants (default, destructive)
- **avatar.tsx** - User avatar with image and fallback
- **badge.tsx** - Status badges
- **breadcrumb.tsx** - Navigation breadcrumbs
- **button.tsx** - Buttons with variants (default, destructive, outline, secondary, ghost, link) and sizes (default, xs, sm, lg, icon variants)
- **card.tsx** - Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter
- **dropdown-menu.tsx** - Dropdown menus
- **input.tsx** - Form input fields
- **label.tsx** - Form labels
- **select.tsx** - Select dropdown (Select, SelectTrigger, SelectContent, SelectItem)
- **separator.tsx** - Visual separator
- **sheet.tsx** - Side sheets/drawers
- **skeleton.tsx** - Loading skeletons
- **tabs.tsx** - Tab navigation (Tabs, TabsList, TabsTrigger, TabsContent)
- **table.tsx** - Data tables
- **tooltip.tsx** - Tooltips

### 6.2 Component Usage Patterns

**Button Variants**:
```tsx
<Button variant="default">Primary</Button>
<Button variant="outline">Outline</Button>
<Button variant="destructive">Delete</Button>
<Button variant="ghost">Ghost</Button>
<Button size="sm">Small</Button>
<Button size="icon"><Icon /></Button>
```

**Card Pattern**:
```tsx
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
  <CardFooter>
    {/* Actions */}
  </CardFooter>
</Card>
```

**Form Input Pattern** (from login page):
```tsx
<div className="space-y-2">
  <label htmlFor="email" className="text-sm font-medium">
    Email
  </label>
  <input
    id="email"
    type="email"
    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
    disabled={isLoading}
  />
</div>
```

Or using UI components:
```tsx
<div className="space-y-2">
  <Label htmlFor="email">Email</Label>
  <Input id="email" type="email" disabled={isLoading} />
</div>
```

### 6.3 Stats Card Pattern

File: `/home/tolga/projects/terp/apps/web/src/components/dashboard/stats-card.tsx`

Reusable card for displaying metrics:
```tsx
<StatsCard
  title="Vacation Days"
  value="15"
  description="days remaining"
  icon={PalmtreeIcon}
  trend="up"
  trendValue="+2"
  isLoading={isLoading}
  error={error}
  onRetry={refetch}
/>
```

## 7. Navigation Configuration

### 7.1 Sidebar Navigation

File: `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

Current navigation sections:
- **Main**: Dashboard, Time Clock, Timesheet, Absences (all users)
- **Management**: Employees, Departments, Employment Types, Day Plans (admin only)
- **Administration**: Users, Reports, Settings, Tenants (admin only)

### 7.2 User Menu

File: `/home/tolga/projects/terp/apps/web/src/components/layout/user-menu.tsx`

The user menu already includes links to `/profile` and `/settings`:
```tsx
<DropdownMenuItem asChild>
  <Link href="/profile">Profile</Link>
</DropdownMenuItem>
<DropdownMenuItem asChild>
  <Link href="/settings">Settings</Link>
</DropdownMenuItem>
```

## 8. Error Handling Patterns

### 8.1 API Error Structure

File: `/home/tolga/projects/terp/apps/web/src/lib/api/errors.ts`

```typescript
interface ApiError {
  status: number
  title: string
  message: string
  fieldErrors?: Record<string, string>  // For validation errors
  raw: ProblemDetails | unknown
}
```

Utility functions:
- `parseApiError(error)` - Parse error response
- `getErrorMessage(status)` - Get friendly message for HTTP status
- `isValidationError(error)` - Check for 400/422 errors
- `isAuthError(error)` - Check for 401 errors

### 8.2 Error Display Pattern

From dashboard cards:
```tsx
if (error) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <AlertCircle className="h-4 w-4 text-destructive" />
      <p className="text-sm text-destructive">Failed to load</p>
      <Button variant="ghost" size="sm" onClick={refetch}>
        <RefreshCw className="mr-1 h-3 w-3" />
        Retry
      </Button>
    </div>
  )
}
```

## 9. Form Validation Patterns

### 9.1 Current Approach

The codebase does not currently use a form library. Forms are built with:
- Controlled state using `useState`
- Manual validation logic
- Direct API calls via mutations

### 9.2 Login Form Example

```tsx
const [isLoading, setIsLoading] = useState(false)
const [error, setError] = useState<string | null>(null)

const handleSubmit = async () => {
  setIsLoading(true)
  setError(null)
  try {
    await devLogin(role)
    router.push('/dashboard')
  } catch {
    setError('Login failed.')
  } finally {
    setIsLoading(false)
  }
}
```

### 9.3 Error Message Display

```tsx
{error && (
  <p className="text-center text-sm text-destructive">{error}</p>
)}
```

## 10. State Management Patterns

### 10.1 URL-based State

Timesheet page uses URL params for navigation:
```tsx
const searchParams = useSearchParams()
const returnUrl = searchParams.get('returnUrl') ?? '/dashboard'
```

### 10.2 Local Component State

Pages use `useState` for local UI state:
```tsx
const [viewMode, setViewMode] = useState<ViewMode>('day')
const [currentDate, setCurrentDate] = useState(new Date())
```

### 10.3 Server State

All server data is managed through React Query via `useApiQuery` and `useApiMutation`.

## 11. Loading State Patterns

### 11.1 Skeleton Components

```tsx
export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="mt-2 h-4 w-48" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  )
}
```

### 11.2 Conditional Loading

```tsx
if (isLoading) {
  return <PageSkeleton />
}
```

## 12. Summary: Profile Page Requirements

### 12.1 New Endpoints Needed

The existing endpoints cover most requirements:
- `GET /auth/me` - Current user (exists)
- `GET /employees/{id}` - Employee details (exists)
- `PUT /employees/{id}` - Update employee (exists, but limited fields)
- `GET/POST/DELETE /employees/{id}/contacts` - Contacts (exists)
- `GET /employees/{id}/cards` - Cards (exists)
- `PATCH /users/{id}` - Update user profile (exists)

**Note**: Password change endpoint does not exist in current API spec.

### 12.2 New Hooks Needed

- `useEmployeeContacts(employeeId)` - Fetch contacts
- `useCreateEmployeeContact()` - Add contact
- `useDeleteEmployeeContact()` - Remove contact
- `useEmployeeCards(employeeId)` - Fetch cards

### 12.3 Profile Page Location

Suggested: `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/profile/page.tsx`

### 12.4 Component Structure

```
components/profile/
├── profile-header.tsx       # Name, avatar, role badge
├── personal-info-card.tsx   # Personal info section
├── employment-details-card.tsx  # Read-only employment info
├── emergency-contacts-card.tsx  # CRUD for contacts
├── access-cards-card.tsx    # Read-only cards list
├── time-plan-card.tsx       # Read-only time plan info
├── account-settings-card.tsx    # Password, notifications
└── index.ts
```

### 12.5 Key UI Patterns to Follow

1. Use `Card` component for each section
2. Use `Tabs` if grouping sections
3. Use `Skeleton` for loading states
4. Use `Alert` for errors with retry option
5. Use `Button` with `variant="outline"` for secondary actions
6. Use `Input` and `Label` for form fields
7. Use `Select` for dropdowns
8. Follow existing spacing: `space-y-6` for sections, `space-y-4` for form fields
