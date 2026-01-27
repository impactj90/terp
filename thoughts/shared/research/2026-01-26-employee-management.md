# Employee Management Interface Research

**Date**: 2026-01-26
**Ticket**: Employee Management Interface for HR Administrators

## Overview

This document summarizes research findings for implementing a comprehensive employee management interface with search, filtering, pagination, and CRUD operations.

---

## 1. Backend API - Existing Employee Endpoints

### 1.1 Routes Registration

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/routes.go` (lines 136-151)

```go
func RegisterEmployeeRoutes(r chi.Router, h *EmployeeHandler) {
    r.Route("/employees", func(r chi.Router) {
        r.Get("/", h.List)
        r.Post("/", h.Create)
        r.Get("/search", h.Search)
        r.Get("/{id}", h.Get)
        r.Put("/{id}", h.Update)
        r.Delete("/{id}", h.Delete)
        r.Get("/{id}/contacts", h.ListContacts)
        r.Post("/{id}/contacts", h.AddContact)
        r.Delete("/{id}/contacts/{contactId}", h.RemoveContact)
        r.Get("/{id}/cards", h.ListCards)
        r.Post("/{id}/cards", h.AddCard)
        r.Delete("/{id}/cards/{cardId}", h.DeactivateCard)
    })
}
```

### 1.2 Employee Handler

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/employee.go`

The handler implements all CRUD operations:

**List Endpoint** (GET /employees):
- Supports pagination: `limit` (default 20, max 100), `page` (default 1)
- Supports search: `q` parameter for name/personnel number/email search
- Supports filtering: `department_id`, `active`
- Returns paginated response with `data`, `total`, `page`, `limit` fields

**Search Endpoint** (GET /employees/search):
- For typeahead functionality
- Requires `q` parameter
- Returns `EmployeeSummary` array (minimal data for autocomplete)

**Create Endpoint** (POST /employees):
- Uses `CreateEmployeeRequest` model from generated code
- Required fields: `personnel_number`, `pin`, `first_name`, `last_name`, `entry_date`

**Get Endpoint** (GET /employees/{id}):
- Returns full employee details with relations (department, cost_center, employment_type, contacts, cards)

**Update Endpoint** (PUT /employees/{id}):
- Uses `UpdateEmployeeRequest` model
- All fields optional for partial updates

**Delete Endpoint** (DELETE /employees/{id}):
- Soft delete (sets `deleted_at` and deactivates)
- Returns 204 No Content on success

### 1.3 Employee Repository

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/employee.go`

Key methods:
- `List(ctx, tenantID, filter)` - Paginated list with filters
- `Search(ctx, tenantID, query)` - Quick search for autocomplete
- `GetByID(ctx, tenantID, id)` - Single employee with relations
- `GetByPersonnelNumber(ctx, tenantID, number)` - Lookup by personnel number
- `Create(ctx, employee)` - Create new employee
- `Update(ctx, employee)` - Update existing employee
- `Delete(ctx, tenantID, id)` - Soft delete

### 1.4 Employee Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/employee.go`

```go
type Employee struct {
    ID                  uuid.UUID
    TenantID            uuid.UUID
    PersonnelNumber     string
    PIN                 string          // Hidden in JSON
    FirstName           string
    LastName            string
    Email               string
    Phone               string
    EntryDate           time.Time
    ExitDate            *time.Time
    DepartmentID        *uuid.UUID
    CostCenterID        *uuid.UUID
    EmploymentTypeID    *uuid.UUID
    WeeklyHours         decimal.Decimal
    VacationDaysPerYear decimal.Decimal
    IsActive            bool
    CreatedAt           time.Time
    UpdatedAt           time.Time
    DeletedAt           gorm.DeletedAt  // For soft delete

    // Relations
    Tenant         *Tenant
    Department     *Department
    CostCenter     *CostCenter
    EmploymentType *EmploymentType
    Contacts       []EmployeeContact
    Cards          []EmployeeCard
    User           *User
}
```

Helper methods:
- `FullName()` - Returns "FirstName LastName"
- `IsEmployed()` - Checks if currently employed (no exit date or exit date in future)

---

## 2. OpenAPI Specification

### 2.1 Employee Schema

**File**: `/home/tolga/projects/terp/api/schemas/employees.yaml`

Key schemas:
- `Employee` - Full employee with all relations
- `EmployeeSummary` - Minimal data for autocomplete (id, personnel_number, first_name, last_name)
- `EmployeeList` - Paginated response with `data`, `total`, `page`, `limit`
- `CreateEmployeeRequest` - Required: personnel_number, pin, first_name, last_name, entry_date
- `UpdateEmployeeRequest` - All fields optional

### 2.2 Employee Endpoints

**File**: `/home/tolga/projects/terp/api/paths/employees.yaml`

Defined endpoints:
- `GET /employees` - List with pagination and filters
- `POST /employees` - Create employee
- `GET /employees/search` - Typeahead search
- `GET /employees/{id}` - Get single employee
- `PUT /employees/{id}` - Update employee
- `DELETE /employees/{id}` - Soft delete (deactivate)

Query parameters for list:
- `limit` (default: 20, min: 1, max: 100)
- `page` (default: 1, min: 1)
- `q` - Search by name, personnel number, or email
- `department_id` - UUID filter
- `active` - Boolean filter

---

## 3. Frontend - Existing Patterns

### 3.1 API Hooks

**File**: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-employees.ts`

```typescript
interface UseEmployeesOptions {
  limit?: number
  page?: number
  search?: string
  departmentId?: string
  active?: boolean
  enabled?: boolean
}

// List employees with filtering
export function useEmployees(options: UseEmployeesOptions = {})

// Get single employee
export function useEmployee(id: string, enabled = true)

// Create employee
export function useCreateEmployee()

// Update employee
export function useUpdateEmployee()

// Delete employee
export function useDeleteEmployee()
```

### 3.2 Generic API Hooks

**File**: `/home/tolga/projects/terp/apps/web/src/hooks/use-api-query.ts`

Type-safe query hook pattern:
```typescript
export function useApiQuery<Path extends GetPaths>(
  path: Path,
  options?: UseApiQueryOptions<Path>
)
```

**File**: `/home/tolga/projects/terp/apps/web/src/hooks/use-api-mutation.ts`

Type-safe mutation hook pattern:
```typescript
export function useApiMutation<
  Path extends MutationPaths,
  Method extends MutationMethod,
>(path: Path, method: Method, options?: UseApiMutationOptions<Path, Method>)
```

Key features:
- Query key invalidation on mutations
- Type-safe based on OpenAPI spec
- Error handling via `ApiError` type

### 3.3 Data Table Pattern

**File**: `/home/tolga/projects/terp/apps/web/src/components/ui/table.tsx`

Basic HTML table components (shadcn/ui style):
- `Table` - Root component with overflow wrapper
- `TableHeader` - thead element
- `TableBody` - tbody element
- `TableRow` - tr element with hover states
- `TableHead` - th element with styling
- `TableCell` - td element with styling

No complex data table with sorting/pagination built-in - need to implement.

### 3.4 Form Pattern (Sheet/Dialog)

**File**: `/home/tolga/projects/terp/apps/web/src/components/timesheet/booking-edit-dialog.tsx`
**File**: `/home/tolga/projects/terp/apps/web/src/components/profile/contact-form-dialog.tsx`
**File**: `/home/tolga/projects/terp/apps/web/src/components/absences/absence-request-form.tsx`

Common form patterns:
1. Use `Sheet` component for slide-over forms
2. Local state for form data with `useState`
3. `useEffect` to reset form when dialog opens
4. Error state managed locally
5. Mutation hook with `mutateAsync`
6. Loading state from mutation's `isPending`

Form structure:
```tsx
<Sheet open={open} onOpenChange={onOpenChange}>
  <SheetContent>
    <SheetHeader>
      <SheetTitle>Title</SheetTitle>
      <SheetDescription>Description</SheetDescription>
    </SheetHeader>
    <form onSubmit={handleSubmit}>
      {error && <Alert variant="destructive">...</Alert>}
      {/* Form fields */}
      <SheetFooter>
        <Button variant="outline" onClick={close}>Cancel</Button>
        <Button type="submit" disabled={isPending}>Submit</Button>
      </SheetFooter>
    </form>
  </SheetContent>
</Sheet>
```

### 3.5 Page Layout Pattern

**File**: `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/timesheet/page.tsx`
**File**: `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/dashboard/page.tsx`

Common page structure:
```tsx
export default function PageName() {
  const { user } = useAuth()

  // Loading state
  if (isLoading) return <Skeleton />

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex justify-between">
        <div>
          <h1 className="text-2xl font-bold">Title</h1>
          <p className="text-muted-foreground">Description</p>
        </div>
        {/* Action buttons */}
      </div>

      {/* Controls row */}
      {/* Content */}
    </div>
  )
}
```

### 3.6 Sidebar Navigation Config

**File**: `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

Employee management is already in navigation:
```typescript
{
  title: 'Employees',
  href: '/admin/employees',
  icon: Users,
  roles: ['admin'],
  description: 'Manage employee records',
}
```

---

## 4. UI Component Library

### 4.1 Available Components

**Directory**: `/home/tolga/projects/terp/apps/web/src/components/ui/`

Core components available:
- `Button` - Variants: default, destructive, outline, secondary, ghost, link. Sizes: default, xs, sm, lg, icon
- `Input` - Standard input with focus/error states
- `Label` - Form labels
- `Select` - Dropdown select with `SelectTrigger`, `SelectContent`, `SelectItem`
- `Badge` - Variants: default, secondary, destructive, outline, ghost, link
- `Table` - Basic table components
- `Card` - Card with header, content, footer
- `Sheet` - Slide-over panel for forms/details
- `DropdownMenu` - Action menus with items, separators, checkboxes
- `Alert` - Error/info alerts
- `Tabs` - Tab navigation
- `Skeleton` - Loading placeholders
- `Tooltip` - Hover tooltips
- `Popover` - Popover menus
- `Calendar` - Date picker calendar
- `DateRangePicker` - Date range selection
- `RadioGroup` - Radio button groups

### 4.2 Button Variants

```typescript
const buttonVariants = cva({
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
  },
})
```

### 4.3 Badge Variants

```typescript
const badgeVariants = cva({
  variants: {
    variant: {
      default: 'bg-primary text-primary-foreground',
      secondary: 'bg-secondary text-secondary-foreground',
      destructive: 'bg-destructive text-white',
      outline: 'border-border text-foreground',
      ghost: '',
      link: 'text-primary underline-offset-4',
    },
  },
})
```

---

## 5. Authentication and Authorization

### 5.1 Auth Provider

**File**: `/home/tolga/projects/terp/apps/web/src/providers/auth-provider.tsx`

Provides:
- `user` - Current authenticated user
- `isLoading` - Auth state loading
- `isAuthenticated` - Boolean
- `logout()` - Logout function
- `refetch()` - Refetch user data

### 5.2 Role Checking

**File**: `/home/tolga/projects/terp/apps/web/src/hooks/use-has-role.ts`

```typescript
export type UserRole = 'user' | 'admin'

// Check if user has any of specified roles
export function useHasRole(roles: UserRole[]): boolean

// Check if user has at least specified role level
export function useHasMinRole(minRole: UserRole): boolean

// Get current user's role
export function useUserRole(): UserRole | null
```

### 5.3 Tenant Middleware

**File**: `/home/tolga/projects/terp/apps/api/internal/middleware/tenant.go`

- Requires `X-Tenant-ID` header on API requests
- Frontend API client automatically adds header from localStorage

### 5.4 API Client

**File**: `/home/tolga/projects/terp/apps/web/src/lib/api/client.ts`

- Uses `openapi-fetch` for type-safe API calls
- Automatically adds `Authorization` and `X-Tenant-ID` headers
- Token stored in localStorage

---

## 6. Key Patterns to Follow

### 6.1 Backend Handler Pattern

```go
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
    ctx := r.Context()
    tenantID, _ := middleware.TenantFromContext(ctx)

    // Parse query params
    limit := parseQueryInt(r, "limit", 20)
    page := parseQueryInt(r, "page", 1)

    // Build filter
    filter := repository.ListFilter{...}

    // Call service/repository
    result, err := h.repo.List(ctx, tenantID, filter)
    if err != nil {
        respondError(w, http.StatusInternalServerError, err.Error())
        return
    }

    // Map to response model
    respondJSON(w, http.StatusOK, mapToListResponse(result))
}
```

### 6.2 Frontend Hook Pattern

```typescript
export function useListHook(options = {}) {
  const { limit = 20, page, search, enabled = true } = options

  return useApiQuery('/endpoint', {
    params: { limit, page, q: search },
    enabled,
  })
}

export function useCreateHook() {
  return useApiMutation('/endpoint', 'post', {
    invalidateKeys: [['/endpoint']],
  })
}
```

### 6.3 Form Dialog Pattern

```typescript
export function FormDialog({ open, onOpenChange, onSuccess }) {
  const [form, setForm] = useState(INITIAL_STATE)
  const [error, setError] = useState(null)
  const mutation = useMutation()

  useEffect(() => {
    if (open) {
      setForm(INITIAL_STATE)
      setError(null)
    }
  }, [open])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await mutation.mutateAsync({ body: form })
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <form onSubmit={handleSubmit}>
          {/* ... */}
        </form>
      </SheetContent>
    </Sheet>
  )
}
```

---

## 7. Missing Components to Implement

Based on the task requirements and existing patterns, the following need to be created:

1. **Data Table with Features**:
   - Sortable columns
   - Pagination controls
   - Page size selector
   - Row selection for bulk actions

2. **Search Input with Debounce**:
   - Typeahead/autocomplete support
   - Debounced input

3. **Filter Components**:
   - Department select filter
   - Employment type select filter
   - Active/Inactive filter

4. **Employee Forms**:
   - Create employee form (Sheet)
   - Edit employee form (Sheet)
   - Delete confirmation dialog

5. **Action Menus**:
   - Row actions dropdown (View, Edit, Delete, View Timesheet, etc.)
   - Bulk actions (Activate, Deactivate, Export)

6. **Status Badges**:
   - Active badge (green)
   - Inactive badge (gray/red)
   - On Leave badge (yellow)

---

## 8. File Paths Summary

### Backend
- Handler: `/home/tolga/projects/terp/apps/api/internal/handler/employee.go`
- Service: `/home/tolga/projects/terp/apps/api/internal/service/employee.go`
- Repository: `/home/tolga/projects/terp/apps/api/internal/repository/employee.go`
- Model: `/home/tolga/projects/terp/apps/api/internal/model/employee.go`
- Routes: `/home/tolga/projects/terp/apps/api/internal/handler/routes.go`

### OpenAPI
- Schemas: `/home/tolga/projects/terp/api/schemas/employees.yaml`
- Paths: `/home/tolga/projects/terp/api/paths/employees.yaml`

### Frontend
- API Hooks: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-employees.ts`
- Hook Index: `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts`
- UI Components: `/home/tolga/projects/terp/apps/web/src/components/ui/`
- Nav Config: `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

### Generated Models
- Employee: `/home/tolga/projects/terp/apps/api/gen/models/employee.go`
- CreateRequest: `/home/tolga/projects/terp/apps/api/gen/models/create_employee_request.go`
- UpdateRequest: `/home/tolga/projects/terp/apps/api/gen/models/update_employee_request.go`
