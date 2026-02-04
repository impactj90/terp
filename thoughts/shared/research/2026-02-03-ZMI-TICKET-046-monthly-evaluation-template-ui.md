# Research: ZMI-TICKET-046 - Monthly Evaluation Template UI

**Date**: 2026-02-03
**Ticket**: ZMI-TICKET-046
**Status**: Research complete

## 1. Overview

This ticket requires a CRUD admin page for monthly evaluation templates. Templates define flextime caps, overtime thresholds, and vacation carryover limits. One template can be set as the tenant default. The backend already exists (ZMI-TICKET-016). The frontend needs: page, data table, form sheet, detail sheet, delete dialog, skeleton, API hooks, sidebar entry, breadcrumb entry, and translations.

---

## 2. OpenAPI Spec (Backend Endpoints)

**File**: `/home/tolga/projects/terp/api/paths/monthly-evaluations.yaml`
**Schema**: `/home/tolga/projects/terp/api/schemas/monthly-evaluations.yaml`

### Endpoints

| Method | Path | Operation | Description |
|--------|------|-----------|-------------|
| GET | `/monthly-evaluations` | `listMonthlyEvaluations` | List with query params: `is_active` (boolean), `limit` (int, default 20), `cursor` (string) |
| POST | `/monthly-evaluations` | `createMonthlyEvaluation` | Create with `CreateMonthlyEvaluationRequest` body |
| GET | `/monthly-evaluations/default` | `getDefaultMonthlyEvaluation` | Get the default template; returns 404 if none configured |
| GET | `/monthly-evaluations/{id}` | `getMonthlyEvaluation` | Get single template by UUID |
| PUT | `/monthly-evaluations/{id}` | `updateMonthlyEvaluation` | Update with `UpdateMonthlyEvaluationRequest` body |
| DELETE | `/monthly-evaluations/{id}` | `deleteMonthlyEvaluation` | Delete; returns 409 if trying to delete default template |
| POST | `/monthly-evaluations/{id}/set-default` | `setDefaultMonthlyEvaluation` | Set a template as default; returns the updated template |

### Schema: MonthlyEvaluation

```yaml
properties:
  id: { type: string, format: uuid }
  tenant_id: { type: string, format: uuid }
  name: { type: string }
  description: { type: string }
  flextime_cap_positive: { type: integer }   # Maximum positive flextime in minutes
  flextime_cap_negative: { type: integer }   # Maximum negative flextime in minutes
  overtime_threshold: { type: integer }       # Overtime threshold in minutes
  max_carryover_vacation: { type: number, format: decimal }  # Max vacation carryover in days
  is_default: { type: boolean }
  is_active: { type: boolean }
  created_at: { type: string, format: date-time }
  updated_at: { type: string, format: date-time }
required: [id, tenant_id, name, is_default, is_active]
```

### Schema: CreateMonthlyEvaluationRequest

```yaml
properties:
  name: { type: string, minLength: 1, maxLength: 100 }  # Required
  description: { type: string }
  flextime_cap_positive: { type: integer, minimum: 0 }
  flextime_cap_negative: { type: integer, minimum: 0 }
  overtime_threshold: { type: integer, minimum: 0 }
  max_carryover_vacation: { type: number, format: decimal, minimum: 0 }
  is_default: { type: boolean, default: false }
  is_active: { type: boolean, default: true }
required: [name]
```

### Schema: UpdateMonthlyEvaluationRequest

All fields optional (partial update):
```yaml
properties:
  name: { type: string, minLength: 1, maxLength: 100 }
  description: { type: string }
  flextime_cap_positive: { type: integer, minimum: 0 }
  flextime_cap_negative: { type: integer, minimum: 0 }
  overtime_threshold: { type: integer, minimum: 0 }
  max_carryover_vacation: { type: number, format: decimal, minimum: 0 }
  is_default: { type: boolean }
  is_active: { type: boolean }
```

### Schema: MonthlyEvaluationList

```yaml
properties:
  items: { type: array, items: { $ref: MonthlyEvaluation } }
  next_cursor: { type: string }
required: [items]
```

---

## 3. Generated TypeScript Types

**File**: `/home/tolga/projects/terp/apps/web/src/lib/api/types.ts`

The OpenAPI v3 bundled spec has been converted to TypeScript types. The relevant types exist:

```typescript
// Schema types (lines 8398-8456)
components['schemas']['MonthlyEvaluation'] = {
  id: string;                        // Format: uuid
  tenant_id: string;                 // Format: uuid
  name: string;
  description?: string;
  flextime_cap_positive?: number;    // Minutes
  flextime_cap_negative?: number;    // Minutes
  overtime_threshold?: number;       // Minutes
  max_carryover_vacation?: number;   // Decimal days
  is_default: boolean;
  is_active: boolean;
  created_at?: string;               // Format: date-time
  updated_at?: string;               // Format: date-time
}

components['schemas']['CreateMonthlyEvaluationRequest'] = {
  name: string;
  description?: string;
  flextime_cap_positive?: number;
  flextime_cap_negative?: number;
  overtime_threshold?: number;
  max_carryover_vacation?: number;
  is_default: boolean;               // @default false
  is_active: boolean;                // @default true
}

components['schemas']['UpdateMonthlyEvaluationRequest'] = {
  name?: string;
  description?: string;
  flextime_cap_positive?: number;
  flextime_cap_negative?: number;
  overtime_threshold?: number;
  max_carryover_vacation?: number;
  is_default?: boolean;
  is_active?: boolean;
}

components['schemas']['MonthlyEvaluationList'] = {
  items: MonthlyEvaluation[];
  next_cursor?: string;
}
```

### Path Types (lines 2551-2626)

```typescript
paths['/monthly-evaluations'].get     // listMonthlyEvaluations
paths['/monthly-evaluations'].post    // createMonthlyEvaluation
paths['/monthly-evaluations/default'].get  // getDefaultMonthlyEvaluation
paths['/monthly-evaluations/{id}'].get     // getMonthlyEvaluation
paths['/monthly-evaluations/{id}'].put     // updateMonthlyEvaluation
paths['/monthly-evaluations/{id}'].delete  // deleteMonthlyEvaluation
paths['/monthly-evaluations/{id}/set-default'].post  // setDefaultMonthlyEvaluation
```

### Operation Types (lines 16505-16694)

- `listMonthlyEvaluations`: query params `is_active?, limit?, cursor?`; response 200 `MonthlyEvaluationList`
- `createMonthlyEvaluation`: body `CreateMonthlyEvaluationRequest`; response 201 `MonthlyEvaluation`
- `getDefaultMonthlyEvaluation`: no params; response 200 `MonthlyEvaluation`, 404 `ProblemDetails`
- `getMonthlyEvaluation`: path `{id}`; response 200 `MonthlyEvaluation`
- `updateMonthlyEvaluation`: path `{id}`, body `UpdateMonthlyEvaluationRequest`; response 200 `MonthlyEvaluation`
- `deleteMonthlyEvaluation`: path `{id}`; response 204 (no content), 409 `ProblemDetails` (cannot delete default)
- `setDefaultMonthlyEvaluation`: path `{id}`; response 200 `MonthlyEvaluation`

---

## 4. Generated Go Models (Backend)

**Location**: `/home/tolga/projects/terp/apps/api/gen/models/`

| File | Struct |
|------|--------|
| `monthly_evaluation.go` | `MonthlyEvaluation` |
| `monthly_evaluation_list.go` | `MonthlyEvaluationList` |
| `create_monthly_evaluation_request.go` | `CreateMonthlyEvaluationRequest` |
| `update_monthly_evaluation_request.go` | `UpdateMonthlyEvaluationRequest` |

Key Go type details:
- `FlextimeCapPositive`, `FlextimeCapNegative`, `OvertimeThreshold`: `int64` (minutes)
- `MaxCarryoverVacation`: `float64` (decimal days)
- `IsDefault`, `IsActive`: `*bool` (required pointers in MonthlyEvaluation, optional pointers in Create)

---

## 5. Existing CRUD UI Patterns

### Admin Page Pattern

**Reference implementation**: `/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/admin/export-interfaces/page.tsx`

Standard page structure (all admin pages follow this):

```
'use client'
- Import hooks, components, types
- Define type alias: type X = components['schemas']['SchemaName']
- Define filter options constants
- Page component:
  1. useRouter, useTranslations('namespace'), useAuth, useHasRole
  2. State: search, filters, createOpen, editItem, viewItem, deleteItem, deleteError
  3. Fetch data with useXxx hook
  4. Delete mutation with useDeleteXxx hook
  5. Admin redirect via useEffect
  6. Client-side filtering with useMemo
  7. Handler functions: handleView, handleEdit, handleDelete, handleConfirmDelete, handleFormSuccess
  8. Render: header, filters bar, count, Card > DataTable or EmptyState, FormSheet, DetailSheet, ConfirmDialog
- EmptyState sub-component
- Skeleton sub-component
```

Existing admin pages:
- `/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/admin/export-interfaces/page.tsx`
- `/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/admin/tariffs/page.tsx`
- `/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/admin/day-plans/page.tsx`
- `/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/admin/accounts/page.tsx`
- `/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/admin/booking-types/page.tsx`
- Plus many others (teams, departments, holidays, etc.)

### Component Directory Pattern

Each admin CRUD feature has a component directory:

```
apps/web/src/components/{feature-name}/
  ├── {feature-name}-data-table.tsx
  ├── {feature-name}-form-sheet.tsx
  ├── {feature-name}-detail-sheet.tsx
  ├── index.ts
  └── (optional specialized components)
```

**Reference**: `/home/tolga/projects/terp/apps/web/src/components/export-interfaces/`
```
export-interface-data-table.tsx
export-interface-form-sheet.tsx
export-interface-detail-sheet.tsx
account-mapping-dialog.tsx
index.ts
```

**Index barrel export pattern**:
```typescript
export { ExportInterfaceDataTable } from './export-interface-data-table'
export { ExportInterfaceFormSheet } from './export-interface-form-sheet'
export { ExportInterfaceDetailSheet } from './export-interface-detail-sheet'
export { AccountMappingDialog } from './account-mapping-dialog'
```

### Existing monthly-evaluation components directory

**Path**: `/home/tolga/projects/terp/apps/web/src/components/monthly-evaluation/`

This directory exists but contains components for the **monthly evaluation viewer** (employee-facing), NOT template CRUD admin:
- `monthly-summary-cards.tsx` - Summary cards for monthly view
- `daily-breakdown-table.tsx` - Daily breakdown table
- `close-month-sheet.tsx` - Close month action
- `reopen-month-sheet.tsx` - Reopen month action
- `monthly-export-buttons.tsx` - Export buttons

The new template CRUD components should be in a **separate directory**: `apps/web/src/components/monthly-evaluations/` (plural, matching the API route).

---

## 6. Data Table Pattern

**Reference**: `/home/tolga/projects/terp/apps/web/src/components/export-interfaces/export-interface-data-table.tsx`

Structure:
```typescript
interface XxxDataTableProps {
  items: XxxType[]
  isLoading: boolean
  onView: (item: XxxType) => void
  onEdit: (item: XxxType) => void
  onDelete: (item: XxxType) => void
}

export function XxxDataTable({ items, isLoading, onView, onEdit, onDelete }: Props) {
  const t = useTranslations('namespace')

  if (isLoading) return <XxxDataTableSkeleton />
  if (items.length === 0) return null

  return (
    <Table>
      <TableHeader>
        <TableRow>{/* columns */}</TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id} className="cursor-pointer" onClick={() => onView(item)}>
            {/* cells */}
            <TableCell onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onView(item)}>View</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(item)}>Edit</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => onDelete(item)}>Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

**UI components used**:
- `Table, TableBody, TableCell, TableHead, TableHeader, TableRow` from `@/components/ui/table`
- `DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger` from `@/components/ui/dropdown-menu`
- `Badge` from `@/components/ui/badge`
- `Button` from `@/components/ui/button`
- `Skeleton` from `@/components/ui/skeleton`
- Icons from `lucide-react`: `MoreHorizontal, Eye, Edit, Trash2`

---

## 7. Form Sheet Pattern

**Reference**: `/home/tolga/projects/terp/apps/web/src/components/export-interfaces/export-interface-form-sheet.tsx`

Structure:
```typescript
interface XxxFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: XxxType | null   // null = create mode, populated = edit mode
  onSuccess?: () => void
}

interface FormState { /* form fields */ }
const INITIAL_STATE: FormState = { /* defaults */ }

export function XxxFormSheet({ open, onOpenChange, item, onSuccess }: Props) {
  const t = useTranslations('namespace')
  const isEdit = !!item
  const [form, setForm] = useState<FormState>(INITIAL_STATE)
  const [error, setError] = useState<string | null>(null)

  const createMutation = useCreateXxx()
  const updateMutation = useUpdateXxx()

  // Reset form on open/close
  useEffect(() => {
    if (open) {
      if (item) { /* populate from item */ } else { setForm(INITIAL_STATE) }
      setError(null)
    }
  }, [open, item])

  const handleSubmit = async () => {
    // Validate -> mutateAsync -> onSuccess?.()
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex min-h-0 flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('editTitle') : t('createTitle')}</SheetTitle>
          <SheetDescription>{isEdit ? t('editDescription') : t('createDescription')}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Form sections with Input, Label, Switch, etc. */}
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          </div>
        </ScrollArea>
        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting} className="flex-1">Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? t('saving') : isEdit ? t('saveChanges') : t('create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
```

**UI components used**:
- `Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle` from `@/components/ui/sheet`
- `Input` from `@/components/ui/input`
- `Label` from `@/components/ui/label`
- `Switch` from `@/components/ui/switch`
- `Alert, AlertDescription` from `@/components/ui/alert`
- `ScrollArea` from `@/components/ui/scroll-area`
- `Loader2` icon from `lucide-react`

---

## 8. Detail Sheet Pattern

**Reference**: `/home/tolga/projects/terp/apps/web/src/components/export-interfaces/export-interface-detail-sheet.tsx`

Structure:
```typescript
interface XxxDetailSheetProps {
  itemId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (item: XxxType) => void
  onDelete: (item: XxxType) => void
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between py-2 border-b last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value || '-'}</span>
    </div>
  )
}

export function XxxDetailSheet({ itemId, open, onOpenChange, onEdit, onDelete }: Props) {
  const t = useTranslations('namespace')
  const { data: item, isLoading } = useXxx(itemId || '', open && !!itemId)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex min-h-0 flex-col">
        <SheetHeader><SheetTitle>{t('details')}</SheetTitle></SheetHeader>
        {isLoading ? <Skeleton /> : item ? (
          <ScrollArea>
            {/* Icon + name header with Badge */}
            {/* Sections with DetailRow components */}
            {/* Timestamps section */}
          </ScrollArea>
        ) : null}
        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Close</Button>
          {item && (
            <>
              <Button variant="outline" onClick={() => onEdit(item)}>Edit</Button>
              <Button variant="destructive" onClick={() => onDelete(item)}>Delete</Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
```

---

## 9. Delete Dialog / ConfirmDialog Pattern

**File**: `/home/tolga/projects/terp/apps/web/src/components/ui/confirm-dialog.tsx`

The project uses a `ConfirmDialog` component that renders as a bottom sheet:

```typescript
interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string      // default 'Confirm'
  cancelLabel?: string       // default 'Cancel'
  variant?: 'default' | 'destructive'
  isLoading?: boolean
  onConfirm: () => void | Promise<void>
}
```

Usage pattern from pages:
```tsx
<ConfirmDialog
  open={!!deleteItem}
  onOpenChange={(open) => { if (!open) { setDeleteItem(null); setDeleteError(null) } }}
  title={t('deleteTitle')}
  description={deleteError ? deleteError : deleteItem ? t('deleteDescription', { name: deleteItem.name }) : ''}
  confirmLabel={t('delete')}
  variant="destructive"
  isLoading={deleteMutation.isPending}
  onConfirm={handleConfirmDelete}
/>
```

For the monthly evaluation delete, there is a special case: if the template is the default, the API returns 409. The page handler catches this and shows a specific error message in the dialog description.

---

## 10. API Hooks Pattern

**Base hooks**:
- `/home/tolga/projects/terp/apps/web/src/hooks/use-api-query.ts` - `useApiQuery<Path>(path, options?)` wraps `@tanstack/react-query` useQuery with type-safe OpenAPI path
- `/home/tolga/projects/terp/apps/web/src/hooks/use-api-mutation.ts` - `useApiMutation<Path, Method>(path, method, options?)` wraps useMutation with invalidation support

Both are exported from `/home/tolga/projects/terp/apps/web/src/hooks/index.ts`.

### Hook File Pattern

**Reference**: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-export-interfaces.ts`

```typescript
import { useApiQuery, useApiMutation } from '@/hooks'

interface UseXxxOptions {
  /* filter options */
  enabled?: boolean
}

export function useXxxList(options: UseXxxOptions = {}) {
  const { enabled = true, ...params } = options
  return useApiQuery('/xxx', { params: { ...params }, enabled })
}

export function useXxx(id: string, enabled = true) {
  return useApiQuery('/xxx/{id}', { path: { id }, enabled: enabled && !!id })
}

export function useCreateXxx() {
  return useApiMutation('/xxx', 'post', {
    invalidateKeys: [['/xxx']],
  })
}

export function useUpdateXxx() {
  return useApiMutation('/xxx/{id}', 'put', {
    invalidateKeys: [['/xxx'], ['/xxx/{id}']],
  })
}

export function useDeleteXxx() {
  return useApiMutation('/xxx/{id}', 'delete', {
    invalidateKeys: [['/xxx'], ['/xxx/{id}']],
  })
}
```

### Hooks Index Registration

New hooks must be registered in `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts`.

Pattern:
```typescript
// Monthly Evaluations (admin CRUD)
export {
  useMonthlyEvaluations,
  useMonthlyEvaluation,
  useDefaultMonthlyEvaluation,
  useCreateMonthlyEvaluation,
  useUpdateMonthlyEvaluation,
  useDeleteMonthlyEvaluation,
  useSetDefaultMonthlyEvaluation,
} from './use-monthly-evaluations'
```

---

## 11. Sidebar Navigation Configuration

**File**: `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

### Structure

```typescript
interface NavItem {
  titleKey: string       // Translation key in 'nav' namespace
  href: string
  icon: LucideIcon
  roles?: UserRole[]
  badge?: number
}

interface NavSection {
  titleKey: string
  roles?: UserRole[]
  items: NavItem[]
}

export const navConfig: NavSection[] = [
  { titleKey: 'main', items: [...] },
  { titleKey: 'management', roles: ['admin'], items: [...] },
  { titleKey: 'administration', roles: ['admin'], items: [...] },
]
```

### Current Sections

Three sections exist:
1. **main** - Employee-facing items (dashboard, timesheet, absences, etc.)
2. **management** - Admin management items (employees, teams, tariffs, day-plans, etc.)
3. **administration** - System admin items (users, user-groups, reports, settings, tenants, payroll-exports, export-interfaces)

The ticket specifies adding the entry to the **"Administration"** section. The `ClipboardCheck` icon is currently used for `approvals` in the management section (line 116). A different icon choice or the same icon may be needed.

### Icon Imports

All icons are imported from `lucide-react` at the top of the file. Currently imported icons include: `LayoutDashboard, Clock, Calendar, CalendarDays, CalendarRange, CalendarHeart, ClipboardCheck, Users, UsersRound, Building2, Briefcase, Settings, FileText, CalendarOff, Palmtree, UserCog, Shield, ShieldCheck, ScrollText, Wallet, AlertTriangle, CalendarClock, CalendarCheck, FileOutput, Settings2`.

---

## 12. Breadcrumb Configuration

**File**: `/home/tolga/projects/terp/apps/web/src/components/layout/breadcrumbs.tsx`

### segmentToKey Mapping (lines 19-54)

```typescript
const segmentToKey: Record<string, string> = {
  dashboard: 'dashboard',
  'time-clock': 'timeClock',
  // ... many entries ...
  'monthly-evaluation': 'monthlyEvaluation',   // Existing: viewer page
  'export-interfaces': 'exportInterfaces',
}
```

A new entry needs to be added:
```typescript
'monthly-evaluations': 'monthlyEvaluations',  // New: admin template CRUD
```

Note the distinction: `monthly-evaluation` (singular) is for the employee-facing viewer, `monthly-evaluations` (plural) is for the admin template CRUD page.

### Breadcrumb Translations

**File**: `/home/tolga/projects/terp/apps/web/messages/en.json` (lines 147-184)

```json
"breadcrumbs": {
  "home": "Home",
  "monthlyEvaluation": "Monthly Evaluation",
  // ... needs new entry:
  // "monthlyEvaluations": "Monthly Evaluations"
}
```

---

## 13. Translation Files

**Files**:
- `/home/tolga/projects/terp/apps/web/messages/en.json` (English)
- `/home/tolga/projects/terp/apps/web/messages/de.json` (German)

### Structure Pattern

Each admin feature has its own namespace in the JSON. Example for export interfaces:

```json
"adminExportInterfaces": {
  "title": "Export Interfaces",
  "subtitle": "Configure export interfaces...",
  "newInterface": "New Interface",
  "searchPlaceholder": "Search by name or number...",
  "allStatuses": "All Statuses",
  "active": "Active",
  "inactive": "Inactive",
  "clearFilters": "Clear filters",
  "interfaceCount": "{count} interface",
  "interfacesCount": "{count} interfaces",
  "emptyTitle": "...",
  "emptyFilterHint": "...",
  "emptyGetStarted": "...",
  "addInterface": "...",
  "actions": "Actions",
  "cancel": "Cancel",
  "close": "Close",

  // Column headers
  "columnNumber": "#",
  "columnName": "Name",
  // ...

  // Detail view
  "interfaceDetails": "...",
  "sectionBasicInfo": "...",
  "fieldName": "Name",
  // ...

  // Form
  "create": "Create",
  "createTitle": "...",
  "createDescription": "...",
  "edit": "Edit",
  "editTitle": "...",
  // ...

  // Validation
  "validationNameRequired": "...",
  // ...

  // Delete
  "deleteTitle": "...",
  "deleteDescription": "...",
  "delete": "Delete",
  "failedDelete": "..."
}
```

Both `en.json` and `de.json` must have matching keys. The German file provides proper German translations for all keys.

### Nav Translations

In the `"nav"` section of both files, entries exist like:
```json
"nav": {
  "monthlyEvaluation": "Monthly Evaluation",
  "exportInterfaces": "Export Interfaces"
}
```

A new entry needed:
```json
"monthlyEvaluations": "Monthly Evaluations"  // or whatever label is chosen
```

---

## 14. Minutes-to-Hours Formatting Utilities

**File**: `/home/tolga/projects/terp/apps/web/src/lib/time-utils.ts`

Existing utility functions that can be used directly:

```typescript
// Format minutes to HH:MM - e.g., formatMinutes(510) => "8:30"
export function formatMinutes(minutes: number): string

// Format minutes to human readable - e.g., formatDuration(510) => "8h 30m"
export function formatDuration(minutes: number): string

// Format with +/- indicator - e.g., formatBalance(30) => "+0:30"
export function formatBalance(minutes: number): string

// Format balance as duration - e.g., formatBalanceDuration(30) => "+30m"
export function formatBalanceDuration(minutes: number): string
```

The `formatDuration` function is the best fit for the ticket requirement of displaying "Xh Ym" format:
- `formatDuration(510)` => `"8h 30m"`
- `formatDuration(60)` => `"1h"`
- `formatDuration(30)` => `"30m"`
- `formatDuration(0)` => `"0m"`

These utilities are already used extensively throughout the codebase in components like:
- `timesheet/booking-edit-dialog.tsx`
- `team-overview/team-stats-cards.tsx`
- `monthly-evaluation/monthly-export-buttons.tsx`
- `dashboard/hours-this-week-card.tsx`
- `time-clock/today-stats.tsx`

---

## 15. Existing Monthly Evaluation Components (Viewer, Not Template CRUD)

**Directory**: `/home/tolga/projects/terp/apps/web/src/components/monthly-evaluation/`

This directory contains the **employee-facing monthly evaluation viewer**, not template CRUD:

| File | Purpose |
|------|---------|
| `monthly-summary-cards.tsx` | Summary cards displaying monthly totals |
| `daily-breakdown-table.tsx` | Day-by-day breakdown table |
| `close-month-sheet.tsx` | Sheet for closing a month |
| `reopen-month-sheet.tsx` | Sheet for reopening a month |
| `monthly-export-buttons.tsx` | Export buttons for monthly data |
| `index.ts` | Barrel exports |

The new template CRUD should use directory name `monthly-evaluations` (plural) to distinguish from this existing directory.

---

## 16. Key Implementation Notes

### Type Usage Pattern

```typescript
import type { components } from '@/lib/api/types'
type MonthlyEvaluation = components['schemas']['MonthlyEvaluation']
```

### Hook Registration

The new hook file must be added to two places:
1. Create `/home/tolga/projects/terp/apps/web/src/hooks/api/use-monthly-evaluations.ts`
2. Register exports in `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts`

### Special Considerations for This Feature

1. **Set-Default action**: This is a POST to `/monthly-evaluations/{id}/set-default` which is unique to this feature. The hook should invalidate both the list and the default endpoint.

2. **Delete protection**: The API returns 409 when trying to delete the default template. The delete handler should catch this and display a specific error message.

3. **Default badge in table**: The table needs to highlight the default template with a star icon and/or badge. This is a visual distinction not found in other admin tables.

4. **Minutes display**: Values stored as minutes need to be displayed as "Xh Ym" using `formatDuration` from `@/lib/time-utils`.

5. **Naming convention**: Use `monthly-evaluations` (plural) for the admin CRUD page/components to distinguish from `monthly-evaluation` (singular) which is the employee-facing viewer.

### Required Invalidation Keys for Hooks

```typescript
useCreateMonthlyEvaluation:  invalidateKeys: [['/monthly-evaluations'], ['/monthly-evaluations/default']]
useUpdateMonthlyEvaluation:  invalidateKeys: [['/monthly-evaluations'], ['/monthly-evaluations/{id}'], ['/monthly-evaluations/default']]
useDeleteMonthlyEvaluation:  invalidateKeys: [['/monthly-evaluations'], ['/monthly-evaluations/{id}']]
useSetDefaultMonthlyEvaluation: invalidateKeys: [['/monthly-evaluations'], ['/monthly-evaluations/default'], ['/monthly-evaluations/{id}']]
```

The `/monthly-evaluations/default` key should be invalidated on create/update/set-default because any of these can change which template is default.
