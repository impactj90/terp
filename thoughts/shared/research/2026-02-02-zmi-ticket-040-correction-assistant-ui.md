# Research: ZMI-TICKET-040 - Correction Assistant UI

Date: 2026-02-02
Ticket: ZMI-TICKET-040
Depends on: ZMI-TICKET-012 (Correction Assistant backend)

## 1. Existing Correction Assistant Backend

### 1.1 API Endpoints (OpenAPI Spec)

The correction assistant backend is defined in `api/paths/correction-assistant.yaml` and bundled into `api/openapi.bundled.yaml` (Swagger 2.0). Three endpoints exist:

**GET `/correction-messages`** - List correction message catalog
- Query params: `severity` (enum: error|hint), `is_active` (boolean), `code` (string)
- Response: `CorrectionMessageList` (data array + optional pagination meta)
- Auth: requires `time_tracking.view_all` permission

**GET `/correction-messages/{id}`** + **PATCH `/correction-messages/{id}`** - Get/Update single message
- PATCH body: `UpdateCorrectionMessageRequest` with `custom_text` (nullable string), `severity` (enum: error|hint), `is_active` (boolean)
- Auth: GET requires `time_tracking.view_all`, PATCH requires `time_tracking.edit`

**GET `/correction-assistant`** - List correction assistant items
- Query params: `from` (date), `to` (date), `employee_id` (uuid), `department_id` (uuid), `severity` (enum: error|hint), `error_code` (string), `limit` (int, default 50, max 200), `offset` (int, default 0)
- Response: `CorrectionAssistantList` (data array + required pagination meta with total/limit/has_more)
- Default date range: first day of previous month to last day of current month
- Auth: requires `time_tracking.view_all` permission

### 1.2 Schema Definitions

Defined in `api/schemas/correction-assistant.yaml`:

**CorrectionMessage**: id, tenant_id, code, default_text, custom_text (nullable), effective_text (computed, read-only), severity (error|hint), description (nullable), is_active, created_at, updated_at

**CorrectionAssistantItem**: daily_value_id, employee_id, employee_name, department_id (nullable), department_name (nullable), value_date, errors (array of CorrectionAssistantError)

**CorrectionAssistantError**: code, severity (error|hint), message (resolved text), error_type (enum: missing_booking, unpaired_booking, overlapping_bookings, core_time_violation, exceeds_max_hours, below_min_hours, break_violation, invalid_sequence)

### 1.3 Backend Implementation Files

**Handler**: `apps/api/internal/handler/correction_assistant.go`
- `CorrectionAssistantHandler` struct with `svc *service.CorrectionAssistantService`
- Methods: `ListMessages`, `GetMessage`, `UpdateMessage`, `ListItems`
- Response mapping functions: `mapCorrectionMessageToResponse`, `mapCorrectionAssistantItemToResponse`
- `ListMessages` calls `svc.EnsureDefaults()` to auto-seed default messages before listing
- `ListItems` also calls `svc.EnsureDefaults()` before querying

**Service**: `apps/api/internal/service/correction_assistant.go`
- `CorrectionAssistantService` with `cmRepo` (correction message repo) and `dvRepo` (daily value query repo)
- `ListMessages(ctx, tenantID, filter)` - delegates to repo
- `GetMessage(ctx, id)` - returns single message
- `UpdateMessage(ctx, id, tenantID, input)` - updates custom_text, severity, is_active with tenant ownership check
- `EnsureDefaults(ctx, tenantID)` - seeds 23 default messages (14 error + 9 hint) if none exist for tenant
- `ListItems(ctx, tenantID, filter)` - queries daily values with errors, resolves messages from catalog, applies severity/code filters, handles pagination
- `buildErrors()` - builds error entries from raw error codes and warnings
- `resolveMessage()` - resolves error code to message using catalog, falls back to raw code
- `mapCorrectionErrorType()` - maps error codes to categorized error_type enum values
- Error constants: `ErrCorrectionMessageNotFound`, `ErrInvalidSeverity`
- `UpdateMessageInput` struct: `CustomText *string`, `ClearCustom bool`, `Severity *string`, `IsActive *bool`

**Model**: `apps/api/internal/model/correction_message.go`
- `CorrectionMessage` GORM model: ID, TenantID, Code (varchar 50), DefaultText, CustomText (nullable), Severity (CorrectionSeverity), Description (nullable), IsActive, CreatedAt, UpdatedAt
- Table name: `correction_messages`
- `EffectiveText()` method: returns custom_text if non-empty, otherwise default_text
- `CorrectionMessageFilter`: Severity, IsActive, Code (all pointer-based for optional filtering)
- `CorrectionAssistantFilter`: From, To, EmployeeID, DepartmentID, Severity, ErrorCode, Limit, Offset
- `CorrectionAssistantItem`: DailyValueID, EmployeeID, EmployeeName, DepartmentID, DepartmentName, ValueDate, Errors
- `CorrectionAssistantError`: Code, Severity, Message, ErrorType

**Repository**: `apps/api/internal/repository/correction_message.go`
- `CorrectionMessageRepository` with GORM-based data access
- `Create`, `CreateBatch`, `GetByID`, `GetByCode`, `Update`, `List`, `ListAsMap`, `CountByTenant`
- `List()` orders by `severity ASC, code ASC`
- `ListAsMap()` returns active messages keyed by code for efficient catalog lookup

### 1.4 Route Registration

In `apps/api/internal/handler/routes.go` (lines 904-928):
```go
func RegisterCorrectionAssistantRoutes(r chi.Router, h *CorrectionAssistantHandler, authz *middleware.AuthorizationMiddleware) {
    permViewAll := permissions.ID("time_tracking.view_all").String()
    permEdit := permissions.ID("time_tracking.edit").String()
    r.Route("/correction-messages", func(r chi.Router) {
        r.With(authz.RequirePermission(permViewAll)).Get("/", h.ListMessages)
        r.With(authz.RequirePermission(permViewAll)).Get("/{id}", h.GetMessage)
        r.With(authz.RequirePermission(permEdit)).Patch("/{id}", h.UpdateMessage)
    })
    r.With(authz.RequirePermission(permViewAll)).Get("/correction-assistant", h.ListItems)
}
```

Initialized in `apps/api/cmd/server/main.go` (lines 293-295):
```go
correctionMessageRepo := repository.NewCorrectionMessageRepository(db)
correctionAssistantService := service.NewCorrectionAssistantService(correctionMessageRepo, dailyValueRepo)
correctionAssistantHandler := handler.NewCorrectionAssistantHandler(correctionAssistantService)
```

### 1.5 Database Migration

`db/migrations/000045_create_correction_messages.up.sql`:
- Table `correction_messages` with UNIQUE(tenant_id, code)
- Indexes: tenant_id, code, (tenant_id, severity)
- Auto-update trigger on updated_at

### 1.6 Generated Go Models

Located in `apps/api/gen/models/`:
- `correction_message.go` - CorrectionMessage struct with validation
- `correction_message_list.go` - CorrectionMessageList with Data array and optional PaginationMeta
- `correction_assistant_item.go` - CorrectionAssistantItem with Errors array
- `correction_assistant_error.go` - CorrectionAssistantError with Code, Severity, Message, ErrorType
- `correction_assistant_list.go` - CorrectionAssistantList with Data array and required PaginationMeta
- `update_correction_message_request.go` - UpdateCorrectionMessageRequest with CustomText, IsActive, Severity

### 1.7 Default Error Messages Seeded

The service seeds 23 default messages per tenant:

| Code | Default Text | Severity |
|------|-------------|----------|
| MISSING_COME | Missing arrival booking | error |
| MISSING_GO | Missing departure booking | error |
| UNPAIRED_BOOKING | Unpaired booking | error |
| EARLY_COME | Arrival before allowed window | error |
| LATE_COME | Arrival after allowed window | error |
| EARLY_GO | Departure before allowed window | error |
| LATE_GO | Departure after allowed window | error |
| MISSED_CORE_START | Missed core hours start | error |
| MISSED_CORE_END | Missed core hours end | error |
| BELOW_MIN_WORK_TIME | Below minimum work time | error |
| NO_BOOKINGS | No bookings for the day | error |
| INVALID_TIME | Invalid time value | error |
| DUPLICATE_IN_TIME | Duplicate arrival time | error |
| NO_MATCHING_SHIFT | No matching time plan found | error |
| CROSS_MIDNIGHT | Shift spans midnight | hint |
| MAX_TIME_REACHED | Maximum work time reached | hint |
| MANUAL_BREAK | Manual break booking exists | hint |
| NO_BREAK_RECORDED | No break booking recorded | hint |
| SHORT_BREAK | Break duration too short | hint |
| AUTO_BREAK_APPLIED | Automatic break applied | hint |
| MONTHLY_CAP | Monthly cap reached | hint |
| FLEXTIME_CAPPED | Flextime balance capped | hint |
| BELOW_THRESHOLD | Below threshold | hint |
| NO_CARRYOVER | No carryover | hint |

---

## 2. Frontend Patterns

### 2.1 Admin Page Structure Pattern

All admin pages follow this pattern (reference: `apps/web/src/app/[locale]/(dashboard)/admin/absence-types/page.tsx`):

```
'use client'
- Imports: React, useRouter, useTranslations, useAuth, useHasRole, API hooks, UI components
- Type aliases from components['schemas'][...]
- Page component:
  1. Auth guard: useAuth + useHasRole(['admin']) + redirect if not admin
  2. State: filters, dialog/sheet open states
  3. Data fetching: API hooks with enabled=(!authLoading && isAdmin)
  4. Client-side filtering with useMemo
  5. Event handlers for CRUD operations
  6. Loading skeleton while authLoading
  7. Return null if !isAdmin
  8. Render: page header + filters bar + count display + Card with data table + Sheet/Dialog overlays
```

**Two-tab pattern** (reference: `apps/web/src/app/[locale]/(dashboard)/admin/approvals/page.tsx`):
```tsx
<Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'tab1' | 'tab2')}>
  <TabsList>
    <TabsTrigger value="tab1">Tab1 {badge}</TabsTrigger>
    <TabsTrigger value="tab2">Tab2 {badge}</TabsTrigger>
  </TabsList>
  <TabsContent value="tab1" className="space-y-4">...</TabsContent>
  <TabsContent value="tab2" className="space-y-4">...</TabsContent>
</Tabs>
```

### 2.2 Component Organization Pattern

Each admin domain has a component folder at `apps/web/src/components/{domain}/` with:
- `{domain}-data-table.tsx` - Table component with columns, row actions, skeleton
- `{domain}-form-sheet.tsx` - Sheet with form for create/edit
- `{domain}-detail-sheet.tsx` - Sheet showing read-only detail view
- `index.ts` - Barrel exports

Example barrel (`apps/web/src/components/absence-types/index.ts`):
```ts
export { AbsenceTypeDataTable } from './absence-type-data-table'
export { AbsenceTypeFormSheet } from './absence-type-form-sheet'
export { AbsenceTypeDetailSheet } from './absence-type-detail-sheet'
```

### 2.3 Data Table Pattern

Reference: `apps/web/src/components/absence-types/absence-type-data-table.tsx`

```tsx
- Uses: Table, TableHeader, TableBody, TableRow, TableHead, TableCell from '@/components/ui/table'
- Badge for status/category display (variant mapping via config object)
- DropdownMenu for row actions (View, Edit, Delete with separator)
- TooltipProvider for disabled action hints
- Skeleton variant for loading state
- Row click handler for detail view
- Type imported via: type AbsenceType = components['schemas']['AbsenceType']
```

### 2.4 Detail Sheet Pattern

Reference: `apps/web/src/components/absence-types/absence-type-detail-sheet.tsx`

```tsx
- Sheet with SheetContent side="right" className="w-full sm:max-w-lg flex flex-col"
- SheetHeader with title/description
- Loading skeleton while data loads
- ScrollArea for content with sections (header, detail rows, timestamps)
- SheetFooter with action buttons (Close, Edit, Delete)
- DetailRow component for label-value pairs
- BooleanBadge for boolean fields with check/x icons
```

### 2.5 Form Sheet Pattern

Reference: `apps/web/src/components/absence-types/absence-type-form-sheet.tsx`

```tsx
- Sheet with SheetContent side="right"
- Form state managed via useState with initial state constant
- useEffect to reset form on open/absenceType change
- Validation in handleSubmit before API call
- Uses create/update mutation hooks from API
- ScrollArea for scrollable form content
- SheetFooter with Cancel + Submit buttons
- Error display via Alert component
- Loading state via Loader2 icon
```

### 2.6 Filters Pattern

Reference: `apps/web/src/components/approvals/approval-filters.tsx`

```tsx
- Grid layout: className="grid gap-4 md:grid-cols-3 md:items-end"
- Label + Select/DateRangePicker per filter
- Team/department Select with "All" option
- DateRangePicker from '@/components/ui/date-range-picker'
- Status Select with configurable options
```

Also in absence-types page:
```tsx
- SearchInput for text filtering
- Select for categorical filters
- Switch + Label for boolean toggles
- Clear filters Button (ghost variant with X icon)
```

---

## 3. API Hooks Pattern

### 3.1 Core Hook Infrastructure

Located in `apps/web/src/hooks/`:

**`use-api-query.ts`**: Type-safe GET hook wrapping `@tanstack/react-query` `useQuery`
```ts
function useApiQuery<Path extends GetPaths>(path: Path, options?: { params?, path?, ...queryOptions })
// queryKey: [path, params, pathParams]
// Uses api.GET() from openapi-fetch client
```

**`use-api-mutation.ts`**: Type-safe mutation hook wrapping `useMutation`
```ts
function useApiMutation<Path, Method>(path, method, options?: { invalidateKeys?, onSuccess?, ...mutationOptions })
// Supports 'post' | 'put' | 'patch' | 'delete'
// Auto-invalidates specified query keys on success
```

### 3.2 Domain Hook Pattern

Reference: `apps/web/src/hooks/api/use-departments.ts`
```ts
// Query hooks
export function useDepartments(options = {}) {
  return useApiQuery('/departments', { params: {...}, enabled })
}
export function useDepartment(id: string, enabled = true) {
  return useApiQuery('/departments/{id}', { path: { id }, enabled: enabled && !!id })
}
// Mutation hooks
export function useUpdateDepartment() {
  return useApiMutation('/departments/{id}', 'patch', { invalidateKeys: [['/departments'], ['/departments/tree']] })
}
```

Reference: `apps/web/src/hooks/api/use-employees.ts`
```ts
export function useEmployees(options = {}) {
  return useApiQuery('/employees', { params: { limit, page, q: search, department_id, active }, enabled })
}
export function useEmployee(id: string, enabled = true) {
  return useApiQuery('/employees/{id}', { path: { id }, enabled: enabled && !!id })
}
```

### 3.3 Hook Registration

All API hooks are exported through `apps/web/src/hooks/api/index.ts` barrel file, grouped by domain with comments. This file currently exports ~50 hooks across 20+ domains. There are NO correction assistant hooks registered yet.

Core hooks are exported from `apps/web/src/hooks/index.ts`:
```ts
export { useApiQuery } from './use-api-query'
export { useApiMutation } from './use-api-mutation'
export { useCurrentUser, useLogin, useDevLogin, useDevUsers, useLogout, type User } from './use-auth'
export { useHasRole, useHasMinRole, useUserRole, USER_ROLES, type UserRole } from './use-has-role'
export { useHasPermission } from './use-has-permission'
```

### 3.4 CRITICAL: Frontend Types Gap

The frontend TypeScript types are generated from `api/openapi.bundled.v3.yaml` using `openapi-typescript`:
```json
"generate:api": "openapi-typescript ../../api/openapi.bundled.v3.yaml -o src/lib/api/types.ts"
```

**The `/correction-messages` and `/correction-assistant` paths do NOT exist in the v3 spec.** They exist only in the Swagger 2.0 `api/openapi.bundled.yaml`. The frontend `types.ts` file contains `/corrections` (manual corrections CRUD) but NOT the correction assistant or message catalog endpoints.

This means the `useApiQuery`/`useApiMutation` hooks CANNOT be used for correction assistant endpoints until the v3 spec is updated and types are regenerated.

Workaround patterns exist in the codebase: `apps/web/src/hooks/api/use-daily-values.ts` uses a manual `apiRequest()` helper with raw `fetch()` for endpoints not in the v3 spec:
```ts
async function apiRequest(url: string) {
  const token = authStorage.getToken()
  const tenantId = tenantIdStorage.getTenantId()
  const response = await fetch(`${clientEnv.apiUrl}${url}`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Tenant-ID': tenantId }
  })
  return response.json()
}
```

---

## 4. Navigation & Sidebar Configuration

### 4.1 Sidebar Nav Config

File: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

Structure: Array of `NavSection` objects, each with `titleKey`, optional `roles`, and `items` array of `NavItem`.

```ts
interface NavItem {
  titleKey: string   // Translation key in 'nav' namespace
  href: string       // Navigation href
  icon: LucideIcon   // Icon component
  roles?: UserRole[] // Required roles
  badge?: number     // Optional badge count
}
```

Three sections exist:
1. **Main** - Dashboard, Team Overview, Time Clock, Timesheet, Absences, Vacation, Monthly Evaluation, Year Overview
2. **Management** (admin only) - Approvals, Employees, Teams, Departments, Employment Types, Day Plans, Week Plans, Tariffs, Holidays, Absence Types, Booking Types, Accounts
3. **Administration** (admin only) - Users, User Groups, Reports, Settings, Tenants

No "Correction Assistant" entry exists yet. The ticket specifies it should be added to the "Management" section with `AlertTriangle` icon.

Icons are imported from `lucide-react`. Currently used icons relevant to management: ClipboardCheck, Users, UsersRound, Building2, Briefcase, CalendarDays, CalendarRange, ScrollText, CalendarHeart, CalendarOff, Clock, Wallet.

### 4.2 Breadcrumbs

File: `apps/web/src/components/layout/breadcrumbs.tsx`

`segmentToKey` mapping object maps URL segments to translation keys. No `'correction-assistant'` entry exists yet.

Current entries include: dashboard, time-clock, timesheet, absences, profile, settings, admin, employees, departments, employment-types, day-plans, week-plans, users, user-groups, reports, tenants, teams, tariffs, holidays, absence-types, booking-types, accounts, approvals, vacation, monthly-evaluation, year-overview, team-overview.

---

## 5. Translation / i18n Setup

### 5.1 Configuration

- Library: `next-intl` (version not checked)
- Locales: `['de', 'en']`, default: `de`
- Locale prefix: `'as-needed'` (no prefix for German)
- Routing config: `apps/web/src/i18n/routing.ts`
- Navigation exports: `apps/web/src/i18n/navigation.ts` (Link, redirect, usePathname, useRouter, getPathname)

### 5.2 Translation Files

- `apps/web/messages/en.json` - English translations
- `apps/web/messages/de.json` - German translations

### 5.3 Translation Namespace Pattern

Each admin page uses a dedicated translation namespace. Pattern:
```ts
const t = useTranslations('adminAbsenceTypes')  // in page component
// OR
const t = useTranslations('adminApprovals')
```

Namespace naming convention: `admin{PascalCaseDomain}` (e.g., `adminAbsenceTypes`, `adminApprovals`, `adminAccounts`).

Key groups within a namespace (from absence-types example):
- Page: title, subtitle
- Actions: newAbsenceType, edit, delete, saveChanges, create, cancel, saving, close
- Table columns: columnCode, columnName, columnCategory, columnPaid, etc.
- Filters: searchPlaceholder, allCategories, allStatuses, active, inactive, showSystemTypes, clearFilters
- Status: statusActive, statusInactive, statusSystem
- Count: absenceTypeCount (singular), absenceTypesCount (plural)
- Empty state: emptyTitle, emptyFilterHint, emptyGetStarted
- Detail: absenceTypeDetails, viewAbsenceTypeInfo, detailsSection, sectionBehavior, timestampsSection
- Form: sectionBasicInfo, sectionCategory, sectionBehavior, sectionStatus, fieldCode, fieldName, etc.
- Validation: validationCodeRequired, validationNameRequired, etc.
- Categories: categoryVacation, categorySick, categoryPersonal, categoryUnpaid

Each translation namespace exists as a top-level key in both `en.json` and `de.json`.

### 5.4 Breadcrumb Translations

Namespace: `breadcrumbs` with translation keys for URL segments plus special keys: `home`, `details`, `new`, `edit`.

### 5.5 Nav Translations

Namespace: `nav` with keys for section titles and nav items: dashboard, teamOverview, timeClock, timesheet, etc.

---

## 6. UI Components Available

### 6.1 Core UI Components

Located in `apps/web/src/components/ui/`:

| Component | File | Description |
|-----------|------|-------------|
| Badge | badge.tsx | Variants: default, secondary, destructive, outline, ghost, link |
| Button | button.tsx | Standard button with variants |
| Card, CardContent | card.tsx | Card container |
| Tabs, TabsList, TabsTrigger, TabsContent | tabs.tsx | Radix-based tab container |
| Table, TableHeader, TableBody, TableRow, TableHead, TableCell | table.tsx | Standard HTML table components |
| Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter | sheet.tsx | Side panel overlay |
| Dialog | dialog.tsx | Modal dialog |
| Select, SelectContent, SelectItem, SelectTrigger, SelectValue | select.tsx | Dropdown select |
| SearchInput | search-input.tsx | Debounced search with clear button |
| DateRangePicker | date-range-picker.tsx | Date range selector with calendar popover |
| Pagination | pagination.tsx | Page navigation with page size selector |
| Switch | switch.tsx | Toggle switch (sm and default sizes) |
| Input | input.tsx | Text input |
| Label | label.tsx | Form label |
| Textarea | textarea.tsx | Multi-line text input |
| Checkbox | checkbox.tsx | Checkbox input |
| Skeleton | skeleton.tsx | Loading placeholder |
| Alert, AlertDescription | alert.tsx | Alert banner (destructive variant) |
| ScrollArea | scroll-area.tsx | Scrollable container |
| ConfirmDialog | confirm-dialog.tsx | Confirmation dialog using Sheet bottom |
| Tooltip, TooltipContent, TooltipProvider, TooltipTrigger | tooltip.tsx | Hover tooltip |
| DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger | dropdown-menu.tsx | Context menu |
| Popover, PopoverContent, PopoverTrigger | popover.tsx | Popover panel |

### 6.2 Pagination Component

File: `apps/web/src/components/ui/pagination.tsx`

Props:
- `page` (1-indexed), `totalPages`, `total`, `limit`
- `onPageChange`, `onLimitChange`
- `pageSizes` (default: [10, 20, 50, 100])
- Shows "Showing X to Y of Z results" + page size selector + first/prev/next/last buttons

---

## 7. Department & Employee API Hooks

### 7.1 Department Hooks

File: `apps/web/src/hooks/api/use-departments.ts`

- `useDepartments({ enabled?, active?, parentId? })` - GET `/departments`
- `useDepartment(id, enabled)` - GET `/departments/{id}`
- `useDepartmentTree({ enabled? })` - GET `/departments/tree`
- `useCreateDepartment()` - POST `/departments`
- `useUpdateDepartment()` - PATCH `/departments/{id}`
- `useDeleteDepartment()` - DELETE `/departments/{id}`

### 7.2 Employee Hooks

File: `apps/web/src/hooks/api/use-employees.ts`

- `useEmployees({ limit?, page?, search?, departmentId?, active?, enabled? })` - GET `/employees`
- `useEmployee(id, enabled)` - GET `/employees/{id}`
- `useCreateEmployee()` - POST `/employees`
- `useUpdateEmployee()` - PUT `/employees/{id}`
- `useDeleteEmployee()` - DELETE `/employees/{id}`
- `useBulkAssignTariff()` - PATCH `/employees/bulk-tariff`

---

## 8. Key Implementation Findings

### 8.1 Frontend Types Not Yet Generated

The OpenAPI v3 bundled spec (`api/openapi.bundled.v3.yaml`) does NOT include the correction-assistant or correction-messages paths. The frontend `types.ts` (auto-generated from v3 spec) does not have these types.

Before implementing the hooks, either:
- (a) Add the correction-assistant paths to the v3 spec and regenerate types, OR
- (b) Use manual fetch pattern as in `use-daily-values.ts` with explicit TypeScript interfaces

### 8.2 No Frontend Components Exist Yet

No files matching `correction-assistant` or `correction-message` exist in the frontend codebase. The entire UI needs to be built from scratch following the established patterns.

### 8.3 Existing Patterns Map Directly to Requirements

| Ticket Requirement | Existing Pattern |
|-------------------|-----------------|
| Two-tab layout | Approvals page (Tabs component) |
| Correction data table | Absence types data table |
| Filters with date range, department, severity | Approval filters + absence types page filters |
| Detail sheet | Absence type detail sheet |
| Inline editing | No direct precedent; needs new pattern |
| Message edit dialog | Absence type form sheet (adapted) |
| Pagination | Pagination component + limit/offset state |
| Sidebar entry | sidebar-nav-config.ts management section |
| Breadcrumbs | segmentToKey mapping |
| Translation namespace | adminAbsenceTypes / adminApprovals pattern |
| API hooks | use-departments.ts / use-employees.ts pattern |

### 8.4 Inline Editing Is a New Pattern

The ticket requires inline editing for the message catalog (click custom_text cell to edit, blur/enter to save). No existing component in the codebase implements this pattern. This will need to be built as a new component, potentially as an editable table cell.

### 8.5 Route and Folder Structure

The new page route will be:
- `apps/web/src/app/[locale]/(dashboard)/admin/correction-assistant/page.tsx`

Component folder:
- `apps/web/src/components/correction-assistant/`

API hooks file:
- `apps/web/src/hooks/api/use-correction-assistant.ts`
