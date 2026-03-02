---
date: 2026-02-10T14:51:50+01:00
researcher: Claude
git_commit: 4afc1559a46e112a98609ee2e6fba2c36d97b2eb
branch: master
repository: terp
topic: "Employee Messages UI - Codebase Patterns Research for ZMI-TICKET-065"
tags: [research, codebase, employee-messages, ui, frontend, data-table, sheet, dialog, hooks, sidebar, i18n]
status: complete
last_updated: 2026-02-10
last_updated_by: Claude
---

# Research: Employee Messages UI - Codebase Patterns for ZMI-TICKET-065

**Date**: 2026-02-10T14:51:50+01:00
**Researcher**: Claude
**Git Commit**: 4afc1559a46e112a98609ee2e6fba2c36d97b2eb
**Branch**: master
**Repository**: terp

## Research Question

What existing codebase patterns are available for building the Employee Messages UI page (`/admin/employee-messages`), covering data tables, sheets, dialogs, API hooks, recipient selection, navigation, translations, and the backend API?

## Summary

The codebase has a well-established and consistent pattern for admin CRUD pages. The employee-messages backend is fully implemented (ZMI-TICKET-026 complete) with OpenAPI spec, generated models, handler, service, and repository layers. No frontend components exist yet for employee-messages. All necessary primitives (data table patterns, sheet patterns, dialog patterns, toolbar patterns, API hook conventions, sidebar config, breadcrumb config, and i18n structure) are documented below with concrete file references.

## Detailed Findings

### 1. Data Table Patterns

The codebase uses a custom `Table` component from `@/components/ui/table` (not TanStack Table/react-table). Every admin feature implements its own `*-data-table.tsx` component.

**Pattern (from `department-data-table.tsx`):**
- File: `/home/tolga/projects/terp/apps/web/src/components/departments/department-data-table.tsx`
- Imports: `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow` from `@/components/ui/table`
- Props interface: receives typed data array, `isLoading`, callback handlers (`onView`, `onEdit`, `onDelete`)
- Types extracted from generated OpenAPI types: `type Department = components['schemas']['Department']`
- Row click handler: `<TableRow className="cursor-pointer" onClick={() => onView(department)}>`
- Action column: uses `DropdownMenu` with `MoreHorizontal` icon, `stopPropagation()` on cell click
- Actions: View (Eye icon), Edit (Edit icon), Delete (Trash2 icon) in dropdown
- Skeleton: separate `*DataTableSkeleton` function with matching column structure
- Badge for status: `<Badge variant={department.is_active ? 'default' : 'secondary'}>`
- Translation: `useTranslations('adminDepartments')` with keys like `columnCode`, `columnName`, `columnStatus`, `columnActions`

**69 existing data table components** across the codebase follow this same pattern.

### 2. Sheet Patterns (Form Sheets and Detail Sheets)

Two types of sheets exist: form sheets (create/edit) and detail sheets (read-only view).

**Form Sheet Pattern (from `department-form-sheet.tsx`):**
- File: `/home/tolga/projects/terp/apps/web/src/components/departments/department-form-sheet.tsx`
- Uses `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription`, `SheetFooter` from `@/components/ui/sheet`
- `SheetContent side="right" className="w-full sm:max-w-lg flex flex-col"`
- State managed with React `useState` (no react-hook-form/zod -- the project does NOT use these libraries anywhere)
- Manual validation function `validateForm()` returning error string array
- Uses `useEffect` to reset form when opening/closing
- Mutations via `useApiMutation` hooks (e.g., `useCreateDepartment`, `useUpdateDepartment`)
- Error display via `Alert variant="destructive"`
- Footer pattern: Cancel + Submit buttons with `Loader2` spinner on isPending
- `ScrollArea` wrapping the form body for long forms

**Detail Sheet Pattern (from `department-detail-sheet.tsx`):**
- File: `/home/tolga/projects/terp/apps/web/src/components/departments/department-detail-sheet.tsx`
- Props: `departmentId: string | null`, `open`, `onOpenChange`, `onEdit`, `onDelete` callbacks
- Fetches data on open via `useDepartment(departmentId, open && !!departmentId)`
- `DetailRow` helper component: `<div className="flex justify-between py-2 border-b last:border-b-0">`
- Sections with headers: `<h4 className="text-sm font-medium text-muted-foreground">`
- Sections wrapped in `<div className="rounded-lg border p-4">`
- Footer: Close + Edit + Delete buttons
- Loading state: Skeleton placeholders
- Date formatting: `format(new Date(date), 'dd.MM.yyyy HH:mm')` from date-fns

### 3. Confirmation Dialog Pattern

- File: `/home/tolga/projects/terp/apps/web/src/components/ui/confirm-dialog.tsx`
- Uses `Sheet` (not `Dialog`) with `side="bottom"` for confirmations
- Props: `open`, `onOpenChange`, `title`, `description`, `confirmLabel`, `cancelLabel`, `variant` ('default' | 'destructive'), `isLoading`, `onConfirm`
- Destructive variant shows `AlertTriangle` icon in a colored circle
- Footer: Cancel + Confirm buttons, Confirm shows `Loader2` when loading
- Usage: `<ConfirmDialog open={!!deleteDepartment} ... variant="destructive" onConfirm={handleConfirmDelete} />`

**Real Dialog (not Sheet) usage** also exists:
- File: `/home/tolga/projects/terp/apps/web/src/components/employees/bulk-actions.tsx`
- Uses `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` from `@/components/ui/dialog`
- Used for more complex confirmation flows with form inputs

### 4. API Hook Patterns

**Core hooks:**
- File: `/home/tolga/projects/terp/apps/web/src/hooks/use-api-query.ts` - Type-safe wrapper around `@tanstack/react-query`'s `useQuery`
- File: `/home/tolga/projects/terp/apps/web/src/hooks/use-api-mutation.ts` - Type-safe wrapper around `useMutation`

**Query hook pattern (`useApiQuery`):**
```ts
useApiQuery('/endpoint', {
  params: { queryParam: value },  // Query string parameters
  path: { id: value },            // Path parameters
  enabled: boolean,               // Conditional fetching
})
```
- Query key built automatically from path + params + pathParams
- Returns typed response from OpenAPI spec

**Mutation hook pattern (`useApiMutation`):**
```ts
useApiMutation('/endpoint', 'post', {
  invalidateKeys: [['/endpoint'], ['/other-endpoint']],
  onSuccess: (data, variables, context) => { ... },
})
```
- Variables: `{ body?: ..., path?: ... }`
- Automatically invalidates specified query keys on success

**Domain hook file pattern (from `use-departments.ts`):**
- File: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-departments.ts`
- Options interface for list hook with `enabled`, filter params
- Each hook documented with JSDoc + `@example` block
- Naming: `use[Entity]s()` for list, `use[Entity](id)` for single, `useCreate[Entity]()`, `useUpdate[Entity]()`, `useDelete[Entity]()` for mutations
- Invalidation keys: `[['/entity-path'], ['/related-path']]`

**Barrel export:**
- File: `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts`
- Every hook from every `use-*.ts` file is re-exported here
- Consumer code imports from `@/hooks/api`

**No existing employee-messages hooks** in the web app.

### 5. Employee and Department Selection Patterns

**Employee list hook:**
- File: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-employees.ts`
- `useEmployees({ limit, page, search, departmentId, active, enabled })`
- Returns paginated list via `/employees` endpoint
- Has `q` parameter for search

**Multi-select pattern examples:**
- File: `/home/tolga/projects/terp/apps/web/src/components/vacation-config/employee-exceptions-tab.tsx` - Uses `useEmployees` with a `Select` component to pick employees
- File: `/home/tolga/projects/terp/apps/web/src/components/shift-planning/bulk-assign-dialog.tsx` - Multi-select for employees
- File: `/home/tolga/projects/terp/apps/web/src/components/reports/generate-report-dialog.tsx` - Multi-select with employee search
- Employee selection typically uses `Select`/`SelectContent` with search, listing employees from `useEmployees`

**Department list hook:**
- File: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-departments.ts`
- `useDepartments({ enabled, active, parentId })`
- Returns flat list of departments

### 6. Navigation / Sidebar Configuration

**Sidebar nav config:**
- File: `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`
- Types: `NavItem { titleKey, href, icon, permissions?, badge? }` and `NavSection { titleKey, items }`
- Three sections: `main`, `management`, `administration`
- Items in `administration` section include users, user groups, reports, audit logs, settings, tenants, etc.
- Each item specifies `permissions` array for visibility filtering
- Icons from `lucide-react` (e.g., `Mail` would be appropriate for employee-messages)
- Employee-messages would logically go in the `administration` section

**Sidebar rendering:**
- File: `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav.tsx`
- Imports `navConfig` from `sidebar-nav-config.ts`
- Uses `usePermissionChecker()` to filter sections/items by permission
- Translations from `nav` namespace: `t(section.titleKey)` and `t(item.titleKey)`

### 7. Breadcrumb Configuration

- File: `/home/tolga/projects/terp/apps/web/src/components/layout/breadcrumbs.tsx`
- Uses `segmentToKey` mapping: route segment (e.g., `'departments'`) to translation key (e.g., `'departments'`)
- Translation namespace: `breadcrumbs`
- UUID segments automatically show as `t('details')`
- No existing entry for `employee-messages` -- needs to be added

### 8. Translation / i18n Patterns

**File structure:**
- English: `/home/tolga/projects/terp/apps/web/messages/en.json`
- German: `/home/tolga/projects/terp/apps/web/messages/de.json`
- Single flat JSON per locale, keys organized by namespace at top level

**Namespace convention:**
- `nav.*` - Sidebar navigation labels (e.g., `nav.employees`, `nav.departments`)
- `breadcrumbs.*` - Breadcrumb labels
- `admin[FeatureName].*` - Admin page translations (e.g., `adminDepartments.title`, `adminDepartments.columnCode`)
- Key groups within a namespace: `title`, `subtitle`, `column*`, `field*`, `validation*`, `section*`, `status*`, `empty*`, `new*`, `edit*`, `detail*`, `delete*`, `save*`, `cancel`, `close`

**Usage pattern:**
```tsx
const t = useTranslations('adminDepartments')
// Then: t('title'), t('columnCode'), t('fieldName'), etc.
```

### 9. Toolbar / Filter Patterns

**Toolbar component pattern (from `monthly-values-toolbar.tsx`):**
- File: `/home/tolga/projects/terp/apps/web/src/components/monthly-values/monthly-values-toolbar.tsx`
- Separate component with all filter state passed as props
- Grid layout: `<div className="grid gap-4 md:grid-cols-4 md:items-end">`
- Select filters with "all" as default value
- Clear filters button with X icon, conditionally shown

**Vacation balance toolbar (from `vacation-balance-toolbar.tsx`):**
- File: `/home/tolga/projects/terp/apps/web/src/components/vacation-balances/vacation-balance-toolbar.tsx`
- Flex layout: `<div className="flex flex-wrap items-center gap-2">`
- SearchInput + Select filters + action buttons
- SearchInput from `@/components/ui/search-input` (debounced with clear)

**Report toolbar (from `report-toolbar.tsx`):**
- File: `/home/tolga/projects/terp/apps/web/src/components/reports/report-toolbar.tsx`
- Status filter: Select with all/pending/generating/completed/failed options
- Generate button with Plus icon

**SearchInput component:**
- File: `/home/tolga/projects/terp/apps/web/src/components/ui/search-input.tsx`
- Props: `value`, `onChange`, `placeholder`, `debounceMs` (default 300), `className`, `disabled`
- Debounced input with search icon and clear button
- Instant submit on Enter, clear on Escape

### 10. Form Patterns (Validation)

**No react-hook-form or zod** is used anywhere in the codebase. Forms use:
- `React.useState` for form state
- Manual `validateForm()` functions returning error arrays
- `setError` state for API errors
- Pattern from `department-form-sheet.tsx`:
  ```tsx
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)
  function validateForm(formData: FormState): string[] { ... }
  ```
- No rich text / markdown editors exist in the codebase currently

### 11. Admin Page Pattern

**Standard page structure (from `departments/page.tsx`):**
- File: `/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/admin/departments/page.tsx`
- `'use client'` directive
- Permission check: `useHasPermission(['departments.manage'])` with redirect on deny
- Page header: title + subtitle + primary action button
- Filters bar: SearchInput + Select filters + clear button
- Card wrapping the data table: `<Card><CardContent className="p-0">`
- Sheets and dialogs rendered at bottom of component
- Empty state component with icon + message + action button
- Loading skeleton component
- State for: create/edit open, view item, delete item

**Component barrel export (from `departments/index.ts`):**
- File: `/home/tolga/projects/terp/apps/web/src/components/departments/index.ts`
- Exports all component pieces: DataTable, FormSheet, DetailSheet, TreeView, etc.

### 12. Backend Employee Messages API (Fully Implemented)

**OpenAPI Spec:**
- File: `/home/tolga/projects/terp/api/paths/employee-messages.yaml`

**Endpoints:**
| Method | Path | Description | Parameters |
|--------|------|-------------|------------|
| GET | `/employee-messages` | List messages | `status` (enum: pending/sent/failed), `limit` (1-100, default 20), `offset` (default 0) |
| POST | `/employee-messages` | Create message | Body: `{ subject, body, employee_ids }` |
| GET | `/employee-messages/{id}` | Get message by ID | `id` (path, uuid) |
| POST | `/employee-messages/{id}/send` | Send message | `id` (path, uuid) |
| GET | `/employees/{id}/messages` | Messages for employee | `id` (path, uuid), `limit`, `offset` |

**Note:** The API uses `offset`-based pagination (not cursor-based). The ticket spec mentions `cursor` but the actual backend uses `offset`.

**Request/Response Schemas:**
- File: `/home/tolga/projects/terp/api/schemas/employee-messages.yaml`

`CreateEmployeeMessageRequest`:
```yaml
subject: string (required, 1-255 chars)
body: string (required, min 1 char)
employee_ids: array of uuid (required, min 1 item)
```

`EmployeeMessage`:
```yaml
id: uuid
tenant_id: uuid
sender_id: uuid
subject: string
body: string
created_at: datetime
updated_at: datetime
recipients: EmployeeMessageRecipient[]
```

`EmployeeMessageRecipient`:
```yaml
id: uuid
message_id: uuid
employee_id: uuid
status: enum (pending | sent | failed)
sent_at: datetime (nullable)
error_message: string (nullable)
created_at: datetime
updated_at: datetime
```

`SendEmployeeMessageResponse`:
```yaml
message_id: uuid
sent: int64
failed: int64
```

`EmployeeMessageList`:
```yaml
data: EmployeeMessage[]
total: int64
```

**Generated Go models:**
- `/home/tolga/projects/terp/apps/api/gen/models/employee_message.go`
- `/home/tolga/projects/terp/apps/api/gen/models/employee_message_recipient.go`
- `/home/tolga/projects/terp/apps/api/gen/models/employee_message_list.go`
- `/home/tolga/projects/terp/apps/api/gen/models/create_employee_message_request.go`
- `/home/tolga/projects/terp/apps/api/gen/models/send_employee_message_response.go`

**Handler:**
- File: `/home/tolga/projects/terp/apps/api/internal/handler/employee_message.go`
- Methods: `List`, `Get`, `Create`, `Send`, `ListForEmployee`
- Tenant context via `middleware.TenantFromContext`
- Auth user via `auth.UserFromContext` (for sender_id on Create)

**Route registration:**
- File: `/home/tolga/projects/terp/apps/api/internal/handler/routes.go` (lines 1233-1258)
- `RegisterEmployeeMessageRoutes` uses `notifications.manage` permission
- Routes: GET/POST `/employee-messages`, GET `/employee-messages/{id}`, POST `/employee-messages/{id}/send`, GET `/employees/{id}/messages`

**Domain model:**
- File: `/home/tolga/projects/terp/apps/api/internal/model/employee_message.go`
- `EmployeeMessage` with GORM annotations, `Recipients` relation
- `EmployeeMessageRecipient` with status enum (pending/sent/failed)
- Table names: `employee_messages`, `employee_message_recipients`

**Frontend TypeScript types** are generated from the OpenAPI spec at:
- File: `/home/tolga/projects/terp/apps/web/src/lib/api/types.ts`
- Access: `components['schemas']['EmployeeMessage']`, etc.

## Code References

- `apps/web/src/components/departments/department-data-table.tsx` - Data table with row click, dropdown actions, skeleton
- `apps/web/src/components/departments/department-form-sheet.tsx` - Form sheet with manual validation, dual create/edit
- `apps/web/src/components/departments/department-detail-sheet.tsx` - Detail sheet with fetch-on-open, DetailRow sections
- `apps/web/src/components/ui/confirm-dialog.tsx` - Bottom Sheet confirmation dialog
- `apps/web/src/components/employees/bulk-actions.tsx` - Dialog-based confirmation with form inputs
- `apps/web/src/hooks/use-api-query.ts` - Type-safe GET query hook
- `apps/web/src/hooks/use-api-mutation.ts` - Type-safe mutation hook with invalidation
- `apps/web/src/hooks/api/use-departments.ts` - Domain hook file pattern
- `apps/web/src/hooks/api/use-employees.ts` - Employee list with search/department/active filtering
- `apps/web/src/hooks/api/use-notifications.ts` - Notification hooks (related domain)
- `apps/web/src/hooks/api/index.ts` - Barrel export file for all hooks
- `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` - Sidebar nav configuration
- `apps/web/src/components/layout/breadcrumbs.tsx` - Breadcrumb segment-to-key mapping
- `apps/web/src/components/ui/search-input.tsx` - Debounced search input
- `apps/web/src/components/monthly-values/monthly-values-toolbar.tsx` - Toolbar with status filter
- `apps/web/src/components/vacation-balances/vacation-balance-toolbar.tsx` - Toolbar with search + department + actions
- `apps/web/src/components/reports/report-toolbar.tsx` - Toolbar with status filter + generate button
- `apps/web/src/app/[locale]/(dashboard)/admin/departments/page.tsx` - Complete admin page pattern
- `apps/web/messages/en.json` - English translations file
- `api/paths/employee-messages.yaml` - OpenAPI endpoint definitions
- `api/schemas/employee-messages.yaml` - OpenAPI schema definitions
- `apps/api/internal/handler/employee_message.go` - Backend handler
- `apps/api/internal/handler/routes.go:1233-1258` - Route registration
- `apps/api/internal/model/employee_message.go` - Domain model

## Architecture Documentation

### Admin Page Architecture
Each admin feature follows a consistent file organization:
```
apps/web/src/app/[locale]/(dashboard)/admin/{feature}/page.tsx     # Page component
apps/web/src/components/{feature}/{feature}-data-table.tsx          # Data table
apps/web/src/components/{feature}/{feature}-form-sheet.tsx          # Create/edit form
apps/web/src/components/{feature}/{feature}-detail-sheet.tsx        # Read-only detail view
apps/web/src/components/{feature}/{feature}-toolbar.tsx             # Toolbar (optional)
apps/web/src/components/{feature}/{feature}-skeleton.tsx            # Loading skeleton (optional)
apps/web/src/components/{feature}/index.ts                         # Barrel exports
apps/web/src/hooks/api/use-{feature}.ts                           # API hooks
```

### State Management
- No global state management (no Redux/Zustand)
- React Query for server state (`useApiQuery` / `useApiMutation`)
- Component-level `useState` for UI state (selected items, open sheets, form values)
- Permission state via `useHasPermission` / `usePermissionChecker`
- Auth state via `useAuth` provider

### API Type System
- OpenAPI spec (Swagger 2.0) at `api/` defines endpoints and schemas
- `make swagger-bundle` produces `openapi.bundled.yaml`
- `make generate` produces Go models in `apps/api/gen/models/`
- TypeScript types generated at `apps/web/src/lib/api/types.ts`
- Consumed as: `type MyType = components['schemas']['SchemaName']`
- API client at `apps/web/src/lib/api` with `api.GET`, `api.POST`, etc.

### Permission Model for Employee Messages
- Backend uses `notifications.manage` permission for all employee-message routes
- Frontend would check same permission via `useHasPermission(['notifications.manage'])`

## Historical Context (from thoughts/)

- `thoughts/shared/tickets/ZMI-TICKET-026-notifications-and-messages.md` - Backend ticket (Proposed status) defining message creation, send workflow, notification records
- `thoughts/shared/tickets/ZMI-TICKET-065-employee-messages-ui.md` - The UI ticket being researched

## Related Research

- `thoughts/shared/research/2026-01-26-employee-management.md` - Employee management patterns
- `thoughts/shared/research/2026-02-02-employee-tariff-assignment-ui-codebase-research.md` - Similar UI pattern research for another feature

## Open Questions

1. **Offset vs cursor pagination**: The ticket spec mentions `cursor` parameter for `useEmployeeMessages`, but the backend API uses `offset`-based pagination. The hooks should use `offset` to match the actual API.
2. **Rich text / markdown editor**: The ticket mentions "rich textarea / markdown input" for the message body, but no markdown editor component exists in the codebase. Either a simple `Textarea` or a new markdown editor dependency would be needed.
3. **Employee multi-select component**: No dedicated reusable `EmployeeMultiSelect` component exists. Multi-select patterns use `Select` with manual search. A purpose-built multi-select may be needed for the recipient picker.
4. **Department-to-employee resolution**: The ticket says department selection resolves to individual employee IDs before the API call. The `useEmployees({ departmentId })` hook can fetch employees by department, which can then be mapped to IDs.
