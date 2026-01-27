# Research: NOK-231 Holiday Management

## Overview

This document researches the existing codebase patterns and APIs for implementing the Holiday Management feature (NOK-231). The feature requires building a holiday management UI for defining public holidays with calendar visualization.

## 1. Existing Backend Holiday API

### 1.1 Database Schema

Location: `/home/tolga/projects/terp/db/migrations/000003_create_holidays.up.sql`

```sql
CREATE TABLE holidays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    holiday_date DATE NOT NULL,
    name VARCHAR(255) NOT NULL,
    is_half_day BOOLEAN DEFAULT false,
    applies_to_all BOOLEAN DEFAULT true,
    department_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, holiday_date)
);
```

Key observations:
- Unique constraint on `(tenant_id, holiday_date)` - prevents duplicate holidays on same date
- `is_half_day` boolean for half-day holidays
- `applies_to_all` boolean with optional `department_id` for department-specific holidays
- No `category` field exists - ticket mentions categories (1=full, 2=half, 3=custom) but current schema only has `is_half_day`

### 1.2 OpenAPI Specification

Location: `/home/tolga/projects/terp/api/paths/holidays.yaml`

Available endpoints:
- `GET /holidays` - List holidays with optional filters: `year`, `from`, `to`
- `POST /holidays` - Create holiday
- `GET /holidays/{id}` - Get single holiday
- `PATCH /holidays/{id}` - Update holiday
- `DELETE /holidays/{id}` - Delete holiday

Location: `/home/tolga/projects/terp/api/schemas/holidays.yaml`

Schemas:
- `Holiday` - Response model with all fields
- `CreateHolidayRequest` - Required: `holiday_date`, `name`; Optional: `is_half_day`, `applies_to_all`, `department_id`
- `UpdateHolidayRequest` - All fields optional

### 1.3 Backend Implementation

Model: `/home/tolga/projects/terp/apps/api/internal/model/holiday.go`
```go
type Holiday struct {
    ID           uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID     uuid.UUID  `gorm:"type:uuid;not null;index" json:"tenant_id"`
    HolidayDate  time.Time  `gorm:"type:date;not null" json:"holiday_date"`
    Name         string     `gorm:"type:varchar(255);not null" json:"name"`
    IsHalfDay    bool       `json:"is_half_day"`
    AppliesToAll bool       `json:"applies_to_all"`
    DepartmentID *uuid.UUID `gorm:"type:uuid" json:"department_id,omitempty"`
    CreatedAt    time.Time  `gorm:"default:now()" json:"created_at"`
    UpdatedAt    time.Time  `gorm:"default:now()" json:"updated_at"`
}
```

Service: `/home/tolga/projects/terp/apps/api/internal/service/holiday.go`
- `Create()` - Creates holiday, validates no duplicate dates
- `GetByID()` - Retrieves single holiday
- `Update()` - Updates holiday fields
- `Delete()` - Deletes holiday
- `ListByYear()` - Lists holidays for specific year
- `ListByDateRange()` - Lists holidays in date range
- `GetByDate()` - Gets holiday for specific date

Repository: `/home/tolga/projects/terp/apps/api/internal/repository/holiday.go`
- All CRUD operations implemented
- `GetByDateRange()` returns holidays ordered by date ASC
- `ListByYear()` uses `EXTRACT(YEAR FROM holiday_date)` for filtering

Handler: `/home/tolga/projects/terp/apps/api/internal/handler/holiday.go`
- All endpoints implemented
- Default behavior: lists current year holidays if no filters provided
- Error handling for duplicate dates: `ErrHolidayAlreadyExists`

## 2. Existing Frontend Patterns

### 2.1 API Client Architecture

Location: `/home/tolga/projects/terp/apps/web/src/lib/api/client.ts`

Uses `openapi-fetch` with typed paths:
- Auto-adds `Authorization` and `X-Tenant-ID` headers via middleware
- Type-safe API calls via generated types

Location: `/home/tolga/projects/terp/apps/web/src/lib/api/types.ts`
- Generated from OpenAPI spec (very large file)
- Provides `paths` and `components` types

### 2.2 API Hooks Pattern

Base hooks: `/home/tolga/projects/terp/apps/web/src/hooks/use-api-query.ts`, `use-api-mutation.ts`

Query hook usage:
```typescript
useApiQuery('/holidays', {
  params: { year, from, to },
  enabled,
})
```

Mutation hook usage:
```typescript
useApiMutation('/holidays', 'post', {
  invalidateKeys: [['/holidays']],
})
```

Existing holidays hook: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-holidays.ts`
```typescript
export function useHolidays(options: UseHolidaysOptions = {}) {
  const { year, from, to, enabled = true } = options
  return useApiQuery('/holidays', {
    params: { year, from, to },
    enabled,
  })
}

export function useHoliday(id: string, enabled = true) {
  return useApiQuery('/holidays/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}
```

Missing mutations: Create, Update, Delete hooks need to be added.

### 2.3 Management Page Pattern

Standard pattern found in: departments, teams, day-plans pages

Location: `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/departments/page.tsx`

Page structure:
1. Page header with title, description, and "New X" button
2. Filters bar (search, status filter, view mode toggle)
3. Card containing data table or empty state
4. Form sheet for create/edit (side="right")
5. Detail sheet for viewing
6. Confirm dialog for delete (side="bottom")

State management:
```typescript
const [createOpen, setCreateOpen] = React.useState(false)
const [editItem, setEditItem] = React.useState<Item | null>(null)
const [viewItem, setViewItem] = React.useState<Item | null>(null)
const [deleteItem, setDeleteItem] = React.useState<Item | null>(null)
```

Admin access check:
```typescript
const isAdmin = useHasRole(['admin'])
React.useEffect(() => {
  if (!authLoading && !isAdmin) {
    router.push('/dashboard')
  }
}, [authLoading, isAdmin, router])
```

### 2.4 Component Patterns

**FormSheet pattern**: `/home/tolga/projects/terp/apps/web/src/components/departments/department-form-sheet.tsx`
- Uses `Sheet` component with `side="right"`
- Form state with validation
- Create and update mutations
- Success callback to close sheet
- Error display via `Alert`

**DataTable pattern**: `/home/tolga/projects/terp/apps/web/src/components/departments/department-data-table.tsx`
- Uses `Table` components
- DropdownMenu for row actions (View, Edit, Delete)
- Badge for status display
- Click row to view details

**DetailSheet pattern**: `/home/tolga/projects/terp/apps/web/src/components/departments/department-detail-sheet.tsx`
- Uses `Sheet` with `side="right"`
- DetailRow component for label/value pairs
- Skeleton loading state
- Footer with Close, Edit, Delete buttons

**ConfirmDialog**: `/home/tolga/projects/terp/apps/web/src/components/ui/confirm-dialog.tsx`
- Uses `Sheet` with `side="bottom"`
- Destructive variant with warning icon
- Loading state support

### 2.5 Calendar Component

Location: `/home/tolga/projects/terp/apps/web/src/components/ui/calendar.tsx`

Existing calendar features:
- Month navigation
- Mode: 'single' or 'range' selection
- Holiday dates highlighting (red dot)
- Absence dates highlighting (blue dot)
- Min/max date constraints
- Disabled dates support
- Weekend styling
- Today indicator

Usage example: `/home/tolga/projects/terp/apps/web/src/components/absences/absence-calendar-view.tsx`
```typescript
<Calendar
  mode="single"
  month={month}
  onMonthChange={setMonth}
  onSelect={handleSelect}
  holidays={holidays}
  absences={absenceDates}
/>
```

### 2.6 Year Selector Component

Location: `/home/tolga/projects/terp/apps/web/src/components/vacation/year-selector.tsx`

```typescript
interface YearSelectorProps {
  value: number
  onChange: (year: number) => void
  range?: number  // Years before/after current year
  className?: string
}
```

### 2.7 Time Utilities

Location: `/home/tolga/projects/terp/apps/web/src/lib/time-utils.ts`

Relevant functions:
- `formatDate(date: Date): string` - Returns YYYY-MM-DD
- `parseISODate(dateString: string): Date` - Parses YYYY-MM-DD
- `getMonthRange(date: Date): { start: Date; end: Date }`
- `getMonthDates(date: Date): Date[]`
- `isSameDay(date1: Date, date2: Date): boolean`
- `isToday(date: Date): boolean`
- `isWeekend(date: Date): boolean`

### 2.8 Sidebar Navigation

Location: `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

Admin management routes are under "Management" section with `roles: ['admin']`.
Holiday management should be added to this section.

## 3. Component Organization

Each feature has a dedicated folder under `/home/tolga/projects/terp/apps/web/src/components/`:

Structure pattern:
```
components/holidays/
  index.ts                  # Exports all components
  holiday-data-table.tsx    # Table view
  holiday-calendar-view.tsx # Year calendar view
  holiday-form-sheet.tsx    # Create/Edit form
  holiday-detail-sheet.tsx  # View details
```

Hook exports: `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts`

## 4. Gaps and Missing Features

### 4.1 API Gaps

The ticket mentions features not currently supported by the API:
- **Category field**: Schema only has `is_half_day`, no `category` (1=full, 2=half, 3=custom)
- **Bulk import**: No endpoint for importing multiple holidays
- **Copy year**: No endpoint for copying holidays from one year to another
- **Affected employees count**: No endpoint or calculation for this

### 4.2 Frontend Gaps

Missing components:
- Holiday-specific hooks for mutations (create, update, delete)
- Year calendar grid view (different from single-month calendar)
- Holiday form with department selector
- Copy year dialog
- Bulk import functionality

### 4.3 Navigation Gap

No holiday management route in sidebar navigation config.

## 5. Type Definitions Available

From generated types (`components['schemas']`):
- `Holiday` - Full holiday response
- `CreateHolidayRequest` - Create payload
- `UpdateHolidayRequest` - Update payload

## 6. Summary of Existing Patterns to Follow

1. **Page structure**: Header, filters, Card with content, sheets/dialogs
2. **State management**: Individual state for create, edit, view, delete
3. **API hooks**: `useApiQuery` for GET, `useApiMutation` for POST/PATCH/DELETE with `invalidateKeys`
4. **Form validation**: Local validation function returning error array
5. **Components**: DataTable, FormSheet, DetailSheet, ConfirmDialog
6. **Calendar**: Existing component supports holiday highlighting
7. **Admin access**: `useHasRole(['admin'])` with redirect
8. **Year selection**: YearSelector component exists

## 7. File Locations Reference

### Backend
- Model: `/home/tolga/projects/terp/apps/api/internal/model/holiday.go`
- Service: `/home/tolga/projects/terp/apps/api/internal/service/holiday.go`
- Repository: `/home/tolga/projects/terp/apps/api/internal/repository/holiday.go`
- Handler: `/home/tolga/projects/terp/apps/api/internal/handler/holiday.go`
- OpenAPI paths: `/home/tolga/projects/terp/api/paths/holidays.yaml`
- OpenAPI schemas: `/home/tolga/projects/terp/api/schemas/holidays.yaml`

### Frontend
- API client: `/home/tolga/projects/terp/apps/web/src/lib/api/client.ts`
- Holidays hook: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-holidays.ts`
- Hook index: `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts`
- Calendar component: `/home/tolga/projects/terp/apps/web/src/components/ui/calendar.tsx`
- Year selector: `/home/tolga/projects/terp/apps/web/src/components/vacation/year-selector.tsx`
- Time utils: `/home/tolga/projects/terp/apps/web/src/lib/time-utils.ts`
- Sidebar config: `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`
- Example admin page: `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/departments/page.tsx`
- Example form sheet: `/home/tolga/projects/terp/apps/web/src/components/departments/department-form-sheet.tsx`
- Example data table: `/home/tolga/projects/terp/apps/web/src/components/departments/department-data-table.tsx`
- Example detail sheet: `/home/tolga/projects/terp/apps/web/src/components/departments/department-detail-sheet.tsx`
