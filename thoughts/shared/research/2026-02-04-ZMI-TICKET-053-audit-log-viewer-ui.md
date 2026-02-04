# Research: ZMI-TICKET-053 - Audit Log Viewer UI

## 1. Existing Similar Pages/Components

### Admin Page Pattern
All admin pages live under `apps/web/src/app/[locale]/(dashboard)/admin/*/page.tsx` and follow a consistent pattern:

**File**: `apps/web/src/app/[locale]/(dashboard)/admin/reports/page.tsx`
- `'use client'` directive at top
- Auth guard using `useAuth()` + `useHasRole(['admin'])` from `@/hooks`
- `React.useEffect` redirect to `/dashboard` when `!authLoading && !isAdmin`
- Conditional render: `if (authLoading) return <Skeleton />; if (!isAdmin) return null;`
- Translation via `useTranslations('namespaceName')`
- Data fetching with `enabled: !authLoading && isAdmin`
- Page header structure: `<h1 className="text-2xl font-bold tracking-tight">{t('page.title')}</h1>` + `<p className="text-muted-foreground">{t('page.subtitle')}</p>`

**File**: `apps/web/src/app/[locale]/(dashboard)/admin/evaluations/page.tsx`
- Most similar to audit logs: read-only data viewing with filters, detail sheet, URL search params persistence
- Uses `useSearchParams()` and `usePathname()` from `next/navigation` + `useRouter()` for URL sync
- Reads initial filter state from URL on mount, syncs state changes back to URL via `router.replace()`
- Uses `syncToUrl()` helper function with `useCallback` and refs to avoid infinite loops
- Pattern: separate tab-specific filters live inside tab components, shared filters in parent

### Detail Sheet Pattern
All detail sheets use the same structure:

**File**: `apps/web/src/components/evaluations/evaluation-detail-sheet.tsx`
- Uses `Sheet`, `SheetContent`, `SheetDescription`, `SheetFooter`, `SheetHeader`, `SheetTitle` from `@/components/ui/sheet`
- `SheetContent side="right" className="w-full sm:max-w-lg flex flex-col"`
- `ScrollArea className="flex-1 -mx-4 px-4"` for scrollable content
- Sections with: `<h4 className="text-sm font-medium text-muted-foreground">` as section headers
- Key-value rows: `<div className="rounded-lg border p-4 space-y-2">` wrapping rows with `<div className="flex justify-between py-1">`
- SheetFooter with Close button: `<Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">`
- Action badges using same `actionBadgeConfig` pattern as the table
- Has a `renderChanges()` function that handles before/after JSON diff display (grid with Field, Before, After columns)
- Has a `renderMetadata()` function for generic key-value display

**Existing before/after JSON diff rendering** (in `evaluation-detail-sheet.tsx`):
```tsx
// Checks for 'before' and 'after' keys in changes object
const before = changesObj['before'] as Record<string, unknown>
const after = changesObj['after'] as Record<string, unknown>
// Renders 3-column grid: Field | Before (red bg) | After (green bg)
// Falls back to raw JSON if not structured
```

**File**: `apps/web/src/components/reports/report-detail-sheet.tsx`
- Same structure, but with footer action buttons (Download, Delete, Close)
- Uses `useLocale()` for date formatting with `Intl.DateTimeFormat`

### Filter Component Pattern

**File**: `apps/web/src/components/approvals/approval-filters.tsx`
- Simple grid layout: `className="grid gap-4 md:grid-cols-3 md:items-end"`
- Uses `Select` from `@/components/ui/select` with `Label` from `@/components/ui/label`
- "all" sentinel value pattern: `value={selectedTeamId ?? 'all'}` + `onValueChange={(value) => onChange(value === 'all' ? null : value)}`
- `DateRangePicker` from `@/components/ui/date-range-picker`

**File**: `apps/web/src/components/evaluations/evaluations-shared-filters.tsx`
- More advanced: 4-column grid with Clear button
- Clear button: `<Button variant="ghost" onClick={onClearFilters} size="sm"><X className="mr-2 h-4 w-4" />{t('filters.clearFilters')}</Button>`
- Only shows Clear when `hasFilters` is true

**File**: `apps/web/src/components/evaluations/logs-tab.tsx`
- Tab-specific inline filters for entity type, action, user
- Resets page to 1 when any filter changes via `React.useEffect`
- Hardcoded entity type and action arrays for select options

### Skeleton Pattern

All pages define either an inline skeleton or import from a separate `*-skeleton.tsx`:
```tsx
function ApprovalsPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-96" />
      </div>
    </div>
  )
}
```

### Component Barrel Pattern
Each feature has an `index.ts` barrel export:

**File**: `apps/web/src/components/reports/index.ts`
```ts
export { ReportSkeleton } from './report-skeleton'
export { ReportToolbar } from './report-toolbar'
export { ReportDataTable } from './report-data-table'
export type { ReportRow } from './report-data-table'
export { ReportDetailSheet } from './report-detail-sheet'
export { GenerateReportDialog } from './generate-report-dialog'
```

**File**: `apps/web/src/components/evaluations/index.ts`
```ts
export { EvaluationsSkeleton } from './evaluations-skeleton'
export { EvaluationsSharedFilters } from './evaluations-shared-filters'
export { DailyValuesTab } from './daily-values-tab'
export { BookingsTab } from './bookings-tab'
export { TerminalBookingsTab } from './terminal-bookings-tab'
export { LogsTab } from './logs-tab'
export { WorkflowHistoryTab } from './workflow-history-tab'
export { EvaluationDetailSheet } from './evaluation-detail-sheet'
```

---

## 2. API Hook Patterns

### Core Hooks

**File**: `apps/web/src/hooks/use-api-query.ts`
- Wraps `@tanstack/react-query` `useQuery`
- Type-safe using generated OpenAPI types: `paths` and `components` from `@/lib/api/types`
- Signature: `useApiQuery<Path extends GetPaths>(path: Path, options?: UseApiQueryOptions<Path>)`
- Options accept: `params` (query params), `path` (path params), plus all standard `UseQueryOptions`
- Query key is `[path, params, pathParams]`
- Uses `api.GET()` from openapi-fetch client

**File**: `apps/web/src/hooks/use-api-mutation.ts`
- Wraps `@tanstack/react-query` `useMutation`
- Signature: `useApiMutation<Path, Method>(path, method, options?)`
- Options include `invalidateKeys: unknown[][]` for automatic cache invalidation on success
- Supports `post`, `put`, `patch`, `delete` methods

### Domain Hook Pattern

**File**: `apps/web/src/hooks/api/use-reports.ts`
- List hook: `useReports(options)` calls `useApiQuery('/reports', { params: {...}, enabled })`
- Single item hook: `useReport(id)` calls `useApiQuery('/reports/{id}', { path: { id: id! }, enabled: !!id })`
- Delete mutation: `useDeleteReport()` calls `useApiMutation('/reports/{id}', 'delete', { invalidateKeys: [['/reports']] })`
- Custom hooks when needed (e.g., `useDownloadReport` uses raw `useMutation` + `fetch`)
- Types imported as `type { components } from '@/lib/api/types'`

**File**: `apps/web/src/hooks/api/use-evaluations.ts`
- Options interfaces defined at top
- Each hook destructures options and passes to `useApiQuery`
- `enabled` defaults to `true`, combined with mandatory params: `enabled: enabled && !!from && !!to`
- Page-based pagination (not cursor-based in this hook): `limit`, `page` params

### Hook Index Pattern

**File**: `apps/web/src/hooks/api/index.ts`
- Barrel exports all hooks and types from domain files
- Convention: `use<Entity>s` (list), `use<Entity>` (single), `useCreate<Entity>`, `useUpdate<Entity>`, `useDelete<Entity>`

**File**: `apps/web/src/hooks/index.ts`
```ts
export { useApiQuery } from './use-api-query'
export { useApiMutation } from './use-api-mutation'
export { useCurrentUser, useLogin, useDevLogin, useDevUsers, useLogout, type User } from './use-auth'
export { useHasRole, useHasMinRole, useUserRole, USER_ROLES, type UserRole } from './use-has-role'
export { useHasPermission } from './use-has-permission'
```

### Cursor vs Page Pagination
The API uses **cursor-based pagination** (the `cursor` query param is a UUID). The `PaginationMeta` schema has `total` and `limit` fields. Existing evaluations hooks use page-based `limit` + `page` params at the hook level, while the reports hook accepts `cursor` directly. The backend audit log handler accepts `cursor` as a UUID query param.

---

## 3. Navigation/Sidebar Setup

### Sidebar Nav Config

**File**: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

Three sections exist:
1. `main` - General user items (dashboard, time clock, etc.)
2. `management` - Admin management items (roles: `['admin']`)
3. `administration` - System administration items (roles: `['admin']`)

Each `NavItem` has:
- `titleKey`: Translation key in `'nav'` namespace
- `href`: Route path (e.g., `/admin/reports`)
- `icon`: Lucide icon component
- `roles?: UserRole[]`: Optional role-based access control

The "administration" section currently contains: users, userGroups, reports, settings, tenants, payrollExports, exportInterfaces, monthlyEvaluations.

Icons already imported in the config file include `ScrollText` (mentioned in ticket spec).

### Sidebar Nav Rendering

**File**: `apps/web/src/components/layout/sidebar/sidebar-nav.tsx`
- `filterNavSection()` filters sections and items by `userRole`
- Uses `useAuth()` to get `user.role`
- Renders sections with `t(section.titleKey)` from `'nav'` namespace

### Admin Route Protection Pattern

**File**: `apps/web/src/app/[locale]/(dashboard)/layout.tsx`
- Dashboard layout wraps all pages with `ProtectedRoute` + `TenantGuard` + `TenantProvider`

Individual admin pages additionally do their own role check:
```tsx
const { isLoading: authLoading } = useAuth()
const isAdmin = useHasRole(['admin'])

React.useEffect(() => {
  if (!authLoading && !isAdmin) {
    router.push('/dashboard')
  }
}, [authLoading, isAdmin, router])
```

**File**: `apps/web/src/hooks/use-has-role.ts`
- `useHasRole(roles: UserRole[])`: Returns boolean, checks `user.role` against array
- `useHasMinRole(minRole: UserRole)`: Uses hierarchy for comparison
- `useUserRole()`: Returns current user's role or null

---

## 4. Translation Setup

### i18n Configuration

**File**: `apps/web/src/i18n/routing.ts`
- Locales: `['de', 'en']`, defaultLocale: `'de'`
- Locale prefix: `'as-needed'` (no prefix for German)

**File**: `apps/web/src/i18n/request.ts`
- Loads messages from `../../messages/${locale}.json`

### Translation Files

**File**: `apps/web/messages/en.json` (single flat file per locale)
**File**: `apps/web/messages/de.json`

### Namespace Pattern
Translations are organized as top-level keys in the JSON file, used as namespaces:
- `"common"` - Shared translations
- `"nav"` - Navigation items
- `"sidebar"` - Sidebar UI strings
- `"breadcrumbs"` - Breadcrumb labels
- `"reports"` - Reports page translations
- `"evaluations"` - Evaluations page translations

Each page/feature has its own namespace key. Usage: `const t = useTranslations('reports')`, then `t('page.title')`.

### Translation Structure Pattern (from `reports` namespace)
```json
{
  "reports": {
    "page": { "title": "...", "subtitle": "..." },
    "toolbar": { ... },
    "status": { "pending": "...", "completed": "..." },
    "table": { "name": "...", "status": "..." },
    "types": { "daily_overview": "..." },
    "actions": { "download": "...", "delete": "..." },
    "detail": { "title": "...", "close": "..." },
    "empty": { "title": "...", "description": "..." },
    "count": { "items": "{count} results", "item": "{count} result" }
  }
}
```

### Translation for Nav Items
Nav items use `t(section.titleKey)` from `'nav'` namespace. The key must be added to both `en.json` and `de.json` under `"nav"`.

### Translation for Breadcrumbs
Breadcrumb segments are mapped via `segmentToKey` in `breadcrumbs.tsx`, then looked up in the `'breadcrumbs'` namespace. Must be added to both locale files.

---

## 5. UI Component Library

All UI components are in `apps/web/src/components/ui/`. The project uses shadcn/ui components.

### Available Components (relevant to audit logs)

| Component | File | Usage |
|-----------|------|-------|
| Badge | `badge.tsx` | Variants: `default`, `secondary`, `destructive`, `outline`, `ghost`, `link`. Custom colors via `className`. |
| Sheet | `sheet.tsx` | `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription`, `SheetFooter`. Side: `"right"`. |
| Table | `table.tsx` | `Table`, `TableHeader`, `TableHead`, `TableRow`, `TableBody`, `TableCell` |
| DateRangePicker | `date-range-picker.tsx` | Props: `value`, `onChange`, `placeholder`, `disabled`. Returns `DateRange` type. |
| Select | `select.tsx` | `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` |
| Label | `label.tsx` | Form labels |
| Button | `button.tsx` | Variants: `default`, `outline`, `ghost`, `destructive`. Sizes: `default`, `sm`, `icon-sm` |
| Skeleton | `skeleton.tsx` | Loading placeholders |
| Card | `card.tsx` | `Card`, `CardContent` (used to wrap tables: `className="p-0"`) |
| ScrollArea | `scroll-area.tsx` | Scrollable containers in sheets |
| Pagination | `pagination.tsx` | Page-based navigation with page size selector |
| Avatar | `avatar.tsx` | `Avatar`, `AvatarImage`, `AvatarFallback`, `AvatarBadge`. Sizes: `default`, `sm`, `lg` |
| Breadcrumb | `breadcrumb.tsx` | Breadcrumb primitives |
| DropdownMenu | `dropdown-menu.tsx` | Context menus |
| Alert | `alert.tsx` | `Alert`, `AlertDescription` with variant `destructive` |
| Tabs | `tabs.tsx` | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` |
| Popover | `popover.tsx` | Used by DateRangePicker |
| Calendar | `calendar.tsx` | Used by DateRangePicker |
| ConfirmDialog | `confirm-dialog.tsx` | Confirmation dialogs |

### No Multi-Select Component
There is no `multi-select` component in the UI library. The action multi-select filter for audit logs will need either a custom implementation or use of multiple checkboxes/toggles.

### Badge Usage for Action Types
The evaluations logs tab uses this badge config pattern:
```tsx
const actionBadgeConfig: Record<ActionType, { variant: 'default' | 'destructive' | 'outline'; className: string }> = {
  create:  { variant: 'default',     className: 'bg-green-600 hover:bg-green-700' },
  update:  { variant: 'outline',     className: 'border-blue-500 text-blue-700' },
  delete:  { variant: 'destructive', className: '' },
  approve: { variant: 'default',     className: 'bg-green-600 hover:bg-green-700' },
  reject:  { variant: 'destructive', className: '' },
  close:   { variant: 'outline',     className: 'border-purple-500 text-purple-700' },
  reopen:  { variant: 'outline',     className: 'border-orange-500 text-orange-700' },
}
```

---

## 6. Existing Audit Log Backend

### Backend API Exists (ZMI-TICKET-034 implemented)

**Handler**: `apps/api/internal/handler/auditlog.go`
- `AuditLogHandler` with `List` (GET `/audit-logs`) and `GetByID` (GET `/audit-logs/{id}`)
- List returns `models.AuditLogList` with `Data` and `Meta` (PaginationMeta with `Total` and `Limit`)
- Response includes expanded `User` relation (id, display_name, avatar_url)
- Maps `model.AuditLog` to `models.AuditLog` (generated OpenAPI model)

**Routes**: `apps/api/internal/handler/routes.go` (line 600-613)
```go
func RegisterAuditLogRoutes(r chi.Router, h *AuditLogHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("users.manage").String()
    r.Route("/audit-logs", func(r chi.Router) {
        r.With(authz.RequirePermission(permManage)).Get("/", h.List)
        r.With(authz.RequirePermission(permManage)).Get("/{id}", h.GetByID)
    })
}
```
Permission required: `users.manage`

**Model**: `apps/api/internal/model/auditlog.go`
```go
type AuditLog struct {
    ID          uuid.UUID      // primary key
    TenantID    uuid.UUID
    UserID      *uuid.UUID     // nullable (system actions)
    Action      AuditAction    // create|update|delete|approve|reject|close|reopen|export|import|login|logout|cleanup
    EntityType  string
    EntityID    uuid.UUID
    EntityName  *string        // nullable
    Changes     datatypes.JSON // jsonb
    Metadata    datatypes.JSON // jsonb
    IPAddress   *string        // nullable
    UserAgent   *string        // nullable
    PerformedAt time.Time
    User        *User          // preloaded relation
}
```

**Repository**: `apps/api/internal/repository/auditlog.go`
```go
type AuditLogFilter struct {
    TenantID     uuid.UUID
    UserID       *uuid.UUID
    EntityType   *string
    EntityTypes  []string     // multiple entity types (OR)
    EntityID     *uuid.UUID
    Action       *string
    Actions      []string     // multiple actions (OR)
    DepartmentID *uuid.UUID
    From         *time.Time
    To           *time.Time
    Limit        int
    Offset       int
    Cursor       *uuid.UUID
}
```
Repository supports: cursor-based pagination, multiple entity types/actions (OR filters), date range, user filter.

**OpenAPI Spec**: `api/paths/audit-logs.yaml`
- GET `/audit-logs`: query params `user_id`, `entity_type`, `entity_id`, `action` (single enum value), `from`, `to`, `limit`, `cursor`
- GET `/audit-logs/{id}`: path param `id`
- Action enum: `create|update|delete|approve|reject|close|reopen|export|import|login|logout`

**Schema**: `api/schemas/audit-logs.yaml`
- `AuditLog`: Full model with all fields including `user` (UserSummary), `changes`, `metadata`
- `AuditLogSummary`: Lighter model (id, action, entity_type, entity_name, performed_at, user)
- `AuditLogList`: `{ data: AuditLog[], meta: PaginationMeta }`
- `PaginationMeta`: `{ total?: number, limit?: number }`

### Generated TypeScript Types

**File**: `apps/web/src/lib/api/types.ts`

Paths registered:
```ts
"/audit-logs": { get: operations["listAuditLogs"] }
"/audit-logs/{id}": { get: operations["getAuditLog"] }
```

Schema:
```ts
AuditLog: {
    id: string;                    // uuid
    tenant_id: string;             // uuid
    user_id?: string | null;       // uuid, nullable
    action: "create" | "update" | "delete" | "approve" | "reject" | "close" | "reopen" | "export" | "import" | "login" | "logout";
    entity_type: string;
    entity_id: string;             // uuid
    entity_name?: string | null;
    changes?: Record<string, never> | null;   // JSON object
    metadata?: Record<string, never> | null;  // JSON object
    ip_address?: string | null;
    user_agent?: string | null;
    performed_at: string;          // date-time
    user?: { id: string; display_name: string; avatar_url?: string };
}
AuditLogList: {
    data: components["schemas"]["AuditLog"][];
    meta: components["schemas"]["PaginationMeta"];
}
```

Operations:
```ts
listAuditLogs: {
    parameters: {
        query?: {
            user_id?: string;
            entity_type?: string;
            entity_id?: string;
            action?: "create" | "update" | "delete" | "approve" | "reject" | "close" | "reopen" | "export" | "import" | "login" | "logout";
            from?: string;          // date-time
            to?: string;            // date-time
            limit?: number;
            cursor?: string;
        };
    };
    responses: { 200: { content: { "application/json": AuditLogList } } };
}
getAuditLog: {
    parameters: { path: { id: string } };
    responses: { 200: { content: { "application/json": AuditLog } } };
}
```

**Note**: The API currently accepts a single `action` value. The backend repository supports `Actions []string` (multiple), but the handler only parses a single `action` query param. For multi-select action filtering, the handler would need updating or the frontend would need to make multiple requests / filter client-side.

---

## 7. Data Table Patterns

### Table Structure

**File**: `apps/web/src/components/reports/report-data-table.tsx`
- Custom table component (not using @tanstack/react-table)
- Uses `Table`, `TableHeader`, `TableHead`, `TableRow`, `TableBody`, `TableCell` from `@/components/ui/table`
- Clickable rows: `className="cursor-pointer"` + `onClick={() => onRowClick(item)}`
- Column widths: `className="w-36"`, `className="w-20"`, etc.
- Text formatting: `className="font-medium truncate max-w-[200px]"`
- Status badges and type badges as separate functions

**File**: `apps/web/src/components/evaluations/logs-tab.tsx`
- Inline table in the tab component (not extracted to separate file)
- Same Table component usage
- Badge rendering for actions
- Entity type formatting using translations: `t('entityTypes.${item.entity_type}')`
- User display: `item.user?.display_name ?? '-'`
- Truncated changes column: `className="max-w-[200px] truncate font-mono text-xs"`
- View details button in last column

### Row Click Pattern
```tsx
<TableRow key={item.id} className="cursor-pointer" onClick={() => onRowClick(item)}>
```

### Date Formatting
Two patterns in use:
1. `Intl.DateTimeFormat` with locale (used in most places):
```tsx
const locale = useLocale()
const formatDate = (dateStr: string) => {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(dateStr))
}
```
2. `formatDate` from `@/lib/time-utils` (for date-only values, returns YYYY-MM-DD)

### Loading State
Tables show a skeleton version during loading:
```tsx
{isLoading ? (
  <DataTableSkeleton />
) : items.length === 0 ? (
  <EmptyState />
) : (
  <Table>...</Table>
)}
```

### Pagination Pattern

**File**: `apps/web/src/components/ui/pagination.tsx`
- Page-based UI component (not cursor-based)
- Props: `page`, `totalPages`, `total`, `limit`, `onPageChange`, `onLimitChange`
- Page sizes: `[10, 20, 50, 100]`
- Shows: "Showing X to Y of Z results" + "Rows per page" dropdown + first/prev/next/last buttons

The evaluations logs tab uses this pagination:
```tsx
const [page, setPage] = React.useState(1)
const [limit, setLimit] = React.useState(50)
const totalPages = Math.ceil(total / limit)

{totalPages > 1 && (
  <Pagination
    page={page}
    totalPages={totalPages}
    total={total}
    limit={limit}
    onPageChange={setPage}
    onLimitChange={(newLimit) => { setLimit(newLimit); setPage(1) }}
  />
)}
```

**Note on cursor pagination**: The audit log API uses cursor-based pagination (last item ID as cursor). The existing `Pagination` UI component is page-based. The ticket requests cursor-based pagination. This means the frontend will need to track cursors (next/previous) rather than page numbers, potentially using a "Load More" or custom cursor-based pagination approach, or adapting the API to also support offset-based pagination.

### Result Count Pattern
```tsx
<div className="text-sm text-muted-foreground">
  {total === 1
    ? t('count.item', { count: total })
    : t('count.items', { count: total })}
</div>
```

---

## 8. Breadcrumb Setup

**File**: `apps/web/src/components/layout/breadcrumbs.tsx`

Breadcrumbs are rendered automatically in `AppLayout` (line 54 of `app-layout.tsx`) based on the current pathname.

### Segment-to-Key Mapping
The `segmentToKey` record maps URL path segments to translation keys:
```ts
const segmentToKey: Record<string, string> = {
  dashboard: 'dashboard',
  admin: 'admin',
  employees: 'employees',
  reports: 'reports',
  evaluations: 'evaluations',
  // ... etc
}
```

For `audit-logs`, a new entry needs to be added:
```ts
'audit-logs': 'auditLogs',
```

### Breadcrumb Translation Keys
Translations live in the `"breadcrumbs"` namespace in both `en.json` and `de.json`.

The breadcrumb component:
- Splits pathname into segments
- Builds cumulative href for each
- Looks up translation from `segmentToKey` -> `breadcrumbs` namespace
- Falls back to formatting segment name (capitalize, split on hyphens) if no mapping
- Truncates if more than `maxItems` (default 4)
- Shows Home icon as first breadcrumb
- UUID segments display as "Details"

For `/admin/audit-logs`:
- Breadcrumb path: Home > Administration > Audit Logs
- `admin` -> `t('admin')` -> "Administration"
- `audit-logs` -> `t('auditLogs')` -> "Audit Logs"

---

## 9. Layout and Dashboard Structure

**File**: `apps/web/src/app/[locale]/(dashboard)/layout.tsx`
```tsx
<ProtectedRoute loadingFallback={<LoadingSkeleton />}>
  <TenantProvider>
    <TenantGuard loadingFallback={<LoadingSkeleton />}>
      <AppLayout>{children}</AppLayout>
    </TenantGuard>
  </TenantProvider>
</ProtectedRoute>
```

**File**: `apps/web/src/components/layout/app-layout.tsx`
- Renders: `<Sidebar>` (desktop) + `<Header>` + `<main>` with `<Breadcrumbs />` + `{children}` + `<MobileNav>` + `<MobileSidebarSheet>`

---

## 10. Summary of Files to Create/Modify

### New Files
1. `apps/web/src/app/[locale]/(dashboard)/admin/audit-logs/page.tsx` - Page component
2. `apps/web/src/components/audit-logs/audit-log-data-table.tsx` - Data table
3. `apps/web/src/components/audit-logs/audit-log-detail-sheet.tsx` - Detail sheet
4. `apps/web/src/components/audit-logs/audit-log-filters.tsx` - Filters
5. `apps/web/src/components/audit-logs/audit-log-json-diff.tsx` - JSON diff component
6. `apps/web/src/components/audit-logs/audit-log-skeleton.tsx` - Skeleton
7. `apps/web/src/components/audit-logs/index.ts` - Barrel exports
8. `apps/web/src/hooks/api/use-audit-logs.ts` - API hooks

### Files to Modify
1. `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` - Add audit-logs nav item to "administration" section
2. `apps/web/src/components/layout/breadcrumbs.tsx` - Add `'audit-logs': 'auditLogs'` to segmentToKey
3. `apps/web/src/hooks/api/index.ts` - Export new audit log hooks
4. `apps/web/messages/en.json` - Add `"audit-logs"` namespace, `nav.auditLogs`, `breadcrumbs.auditLogs`
5. `apps/web/messages/de.json` - Add German translations for same keys
