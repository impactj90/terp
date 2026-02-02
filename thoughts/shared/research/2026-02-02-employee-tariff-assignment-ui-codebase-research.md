# Codebase Research: Employee Tariff Assignment UI (ZMI-TICKET-041)

**Date:** 2026-02-02
**Ticket:** ZMI-TICKET-041
**Scope:** Document existing frontend patterns, components, hooks, and backend endpoints relevant to implementing the tariff assignment UI within the employee detail page.

---

## 1. Employee Detail Page Structure

### Current State: No Employee Detail Page Exists

The ticket references `apps/web/src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx` but **this route does not exist yet**. The glob `apps/web/src/app/**/employees/[*]/**/*` returns no results.

What exists today:
- **Employee List Page:** `apps/web/src/app/[locale]/(dashboard)/admin/employees/page.tsx` -- renders `EmployeeDataTable`, `EmployeeFormSheet`, `EmployeeDetailSheet`, `ConfirmDialog`, and bulk-tariff dialog.
- **Employee Detail Sheet:** `apps/web/src/components/employees/employee-detail-sheet.tsx` -- a side-sheet (not a page) that displays employee info in sections: Contact, Employment, Contract, Access Cards, Contacts. Uses `SectionHeader` sub-components. Footer has View Timesheet, Edit, Delete buttons.
- **Employee Form Sheet:** `apps/web/src/components/employees/employee-form-sheet.tsx` -- create/edit form in a Sheet with fields for personal info, employment details, and contract details.

### Key Implication
Before this ticket can be implemented, **an employee detail page** (`/admin/employees/[id]`) needs to be created, or the tariff assignment UI needs to be embedded into the existing employee detail sheet (which is limited space). The ticket spec says "embedded section within existing employee detail page" at a route that does not exist.

### Existing Employee Component Files
```
apps/web/src/components/employees/
  employee-data-table.tsx
  employee-detail-sheet.tsx
  employee-form-sheet.tsx
  index.ts
  status-badge.tsx
```

---

## 2. Sheet Form Patterns (Create/Edit)

### Pattern: `SheetContent` with form, `ScrollArea`, and `SheetFooter`

The codebase uses a consistent pattern for form sheets. Best reference: `apps/web/src/components/tariffs/tariff-form-sheet.tsx`.

**Structure:**
```tsx
<Sheet open={open} onOpenChange={onOpenChange}>
  <SheetContent className="w-full sm:max-w-2xl flex flex-col">
    <SheetHeader>
      <SheetTitle>{isEdit ? t('editTitle') : t('createTitle')}</SheetTitle>
      <SheetDescription>...</SheetDescription>
    </SheetHeader>

    <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
      <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
        {/* Form fields */}
        {/* Error Display */}
        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </ScrollArea>

      <SheetFooter className="flex-row gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={close} className="flex-1">
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={isPending} className="flex-1">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEdit ? t('saveChanges') : t('createButton')}
        </Button>
      </SheetFooter>
    </form>
  </SheetContent>
</Sheet>
```

**Key patterns:**
- Props interface: `open`, `onOpenChange`, optional entity for edit mode, `onSuccess` callback
- `isEdit = !!entity`
- State managed with `React.useState<FormState>(INITIAL_STATE)`
- Reset form via `React.useEffect` on `[open, fullData, isEdit]`
- Validation function returns `string[]` errors
- Error displayed via `const [error, setError] = React.useState<string | null>(null)`
- Mutations: `const createMutation = useCreateX(); const updateMutation = useUpdateX()`
- `isPending = createMutation.isPending || updateMutation.isPending`
- Error catch: `const apiError = err as { detail?: string; message?: string }; setError(apiError.detail ?? apiError.message ?? t('errorFallback'))`

### Date Picker Pattern

Used extensively in `tariff-form-sheet.tsx` and `absence-request-form.tsx`:

```tsx
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

// State for calendar month navigation
const [fromMonth, setFromMonth] = React.useState(new Date())

<Popover>
  <PopoverTrigger asChild>
    <Button
      variant="outline"
      className={cn(
        'w-full justify-start text-left font-normal',
        !form.validFrom && 'text-muted-foreground'
      )}
      disabled={isPending}
    >
      <CalendarIcon className="mr-2 h-4 w-4" />
      {form.validFrom ? format(form.validFrom, 'PPP') : t('pickDate')}
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-auto p-0" align="start">
    <Calendar
      mode="single"
      month={fromMonth}
      onMonthChange={setFromMonth}
      selected={form.validFrom}
      onSelect={(date) => setForm({ ...form, validFrom: date })}
    />
  </PopoverContent>
</Popover>
```

### Select Dropdown Pattern

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

<Select value={form.value} onValueChange={(v) => setForm({ ...form, value: v })} disabled={isPending}>
  <SelectTrigger>
    <SelectValue placeholder={t('selectPlaceholder')} />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="__none__">{t('none')}</SelectItem>
    {items.map((item) => (
      <SelectItem key={item.id} value={item.id}>
        {item.code} - {item.name}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

---

## 3. Delete Confirmation Dialog

### Pattern: `ConfirmDialog` Component

File: `apps/web/src/components/ui/confirm-dialog.tsx`

Uses Sheet (bottom) for confirmation, not a native dialog.

**Interface:**
```tsx
interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string   // default 'Confirm'
  cancelLabel?: string    // default 'Cancel'
  variant?: 'default' | 'destructive'
  isLoading?: boolean
  onConfirm: () => void | Promise<void>
}
```

**Usage pattern (from employees page):**
```tsx
<ConfirmDialog
  open={isDeleteOpen}
  onOpenChange={setIsDeleteOpen}
  title={t('deactivateEmployee')}
  description={t('deactivateDescription', { firstName: ..., lastName: ... })}
  confirmLabel={t('deactivate')}
  cancelLabel={t('cancel')}
  variant="destructive"
  isLoading={deleteMutation.isPending}
  onConfirm={handleDelete}
/>
```

---

## 4. API Hook Patterns

### Core Hooks

**File:** `apps/web/src/hooks/use-api-query.ts`
- `useApiQuery<Path>(path, options?)` -- type-safe GET wrapper using `@tanstack/react-query`
- Query key: `[path, params, pathParams]`
- Options: `params` (query), `path` (path params), plus all `UseQueryOptions`

**File:** `apps/web/src/hooks/use-api-mutation.ts`
- `useApiMutation<Path, Method>(path, method, options?)` -- type-safe POST/PUT/PATCH/DELETE
- Options: `invalidateKeys` (array of query key arrays), `onSuccess` callback
- Variables: `{ body?, path? }`
- Mutation method dispatches to `api.POST/PUT/PATCH/DELETE`
- On success: invalidates specified queries, then calls custom onSuccess

### Domain Hook Pattern: `use-absences.ts` (Best Reference for Nested Resources)

File: `apps/web/src/hooks/api/use-absences.ts`

Pattern for employee-nested hooks:
```tsx
export function useEmployeeAbsences(
  employeeId: string,
  options?: { from?: string; to?: string; enabled?: boolean }
) {
  return useApiQuery('/employees/{id}/absences', {
    path: { id: employeeId },
    params: { from: options?.from, to: options?.to },
    enabled: (options?.enabled ?? true) && !!employeeId,
  })
}

export function useCreateAbsenceRange() {
  return useApiMutation('/employees/{id}/absences', 'post', {
    invalidateKeys: [
      ['/absences'],
      ['/employees/{id}/absences'],
      ['/employees/{id}/vacation-balance'],
    ],
  })
}

export function useDeleteAbsence() {
  return useApiMutation('/absences/{id}', 'delete', {
    invalidateKeys: [
      ['/absences'],
      ['/employees/{id}/absences'],
    ],
  })
}
```

### Hooks Index: `apps/web/src/hooks/api/index.ts`

All domain hooks are re-exported from this central index. Pattern:
```tsx
export { useXxx, useCreateXxx, useUpdateXxx, useDeleteXxx } from './use-xxx'
```

No employee tariff assignment hooks exist yet.

### Existing Employee Sub-resource Hooks

- `apps/web/src/hooks/api/use-employee-contacts.ts` -- `useEmployeeContacts`, `useCreateEmployeeContact`, `useDeleteEmployeeContact`
- `apps/web/src/hooks/api/use-employee-cards.ts` -- `useEmployeeCards`, `useCreateEmployeeCard`, `useDeactivateEmployeeCard`

Pattern from `use-employee-contacts.ts`:
```tsx
export function useEmployeeContacts(employeeId: string, enabled = true) {
  return useApiQuery('/employees/{id}/contacts', {
    path: { id: employeeId },
    enabled: enabled && !!employeeId,
  })
}

export function useCreateEmployeeContact() {
  return useApiMutation('/employees/{id}/contacts', 'post', {
    invalidateKeys: [
      ['/employees/{id}/contacts'],
      ['/employees'],
    ],
  })
}
```

---

## 5. Backend API Endpoints and Models

### Registered Routes

File: `apps/web/src/api/internal/handler/routes.go` (lines 930-956)

```go
// RegisterEmployeeTariffAssignmentRoutes
r.Route("/employees/{id}/tariff-assignments", func(r chi.Router) {
    r.Get("/", h.List)
    r.Post("/", h.Create)
    r.Get("/{assignmentId}", h.Get)
    r.Put("/{assignmentId}", h.Update)
    r.Delete("/{assignmentId}", h.Delete)
})
r.Get("/employees/{id}/effective-tariff", h.GetEffectiveTariff)
```

Permissions: `employees.view` for GET, `employees.edit` for POST/PUT/DELETE.

### Handler: `apps/api/internal/handler/employeetariffassignment.go`

- **List**: GET `?active=true|false` filter, returns `{ data: [] }`
- **Create**: Decodes `CreateEmployeeTariffAssignmentRequest`, returns 201 or:
  - 400: tariff_id required, effective_from required, invalid dates, tariff not found
  - 404: Employee not found
  - **409: `ErrAssignmentOverlap` -- "Overlapping tariff assignment exists for this date range"**
- **Update**: Decodes `UpdateEmployeeTariffAssignmentRequest`, returns 200 or:
  - 400: invalid dates
  - 404: Assignment not found
  - **409: `ErrAssignmentOverlap` -- same overlap error**
- **Delete**: Returns 204 No Content, or 404
- **GetEffectiveTariff**: Requires `?date=YYYY-MM-DD` query param, returns tariff + source

### Database Model: `apps/api/internal/model/employeetariffassignment.go`

```go
type EmployeeTariffAssignment struct {
    ID                uuid.UUID
    TenantID          uuid.UUID
    EmployeeID        uuid.UUID
    TariffID          uuid.UUID
    EffectiveFrom     time.Time      // NOT NULL
    EffectiveTo       *time.Time     // nullable (open-ended)
    OverwriteBehavior OverwriteBehavior // "overwrite" | "preserve_manual"
    Notes             string
    IsActive          bool
    CreatedAt         time.Time
    UpdatedAt         time.Time
    Employee          *Employee      // relation
    Tariff            *Tariff        // relation
}
```

### OpenAPI Schema: `api/schemas/employee-tariff-assignments.yaml`

**Schemas defined:**
- `EmployeeTariffAssignment` -- full entity with tariff/employee relations
- `EmployeeTariffAssignmentList` -- `{ data: EmployeeTariffAssignment[] }`
- `CreateEmployeeTariffAssignmentRequest` -- required: `tariff_id`, `effective_from`; optional: `effective_to`, `overwrite_behavior` (default `preserve_manual`), `notes`
- `UpdateEmployeeTariffAssignmentRequest` -- all optional: `effective_from`, `effective_to`, `overwrite_behavior`, `notes`, `is_active`
- `EffectiveTariffResponse` -- required: `employee_id`, `date`, `source` (enum: `assignment|default|none`); optional: `tariff`, `assignment`

### OpenAPI Paths: `api/paths/employee-tariff-assignments.yaml`

Endpoints:
- `GET /employees/{id}/tariff-assignments` -- query param `active`
- `POST /employees/{id}/tariff-assignments` -- 201 created, 409 overlap
- `GET /employees/{id}/tariff-assignments/{assignmentId}`
- `PUT /employees/{id}/tariff-assignments/{assignmentId}` -- 200 updated, 409 overlap
- `DELETE /employees/{id}/tariff-assignments/{assignmentId}` -- 204 no content
- `GET /employees/{id}/effective-tariff` -- query param `date` (required)

### Generated Types Status

The file `apps/web/src/lib/api/types.ts` does **NOT** currently include the tariff-assignment paths. A search for `tariff-assignments` and `effective-tariff` in types.ts returns no matches. The OpenAPI spec needs to be bundled (`make swagger-bundle`) and types regenerated (`make generate`) before the typed hooks can be used.

---

## 6. Translation / i18n Patterns

### Configuration

- **Library:** `next-intl` (imported as `useTranslations` from `'next-intl'`)
- **Plugin config:** `apps/web/next.config.ts` uses `createNextIntlPlugin('./src/i18n/request.ts')`
- **Routing:** `apps/web/src/i18n/routing.ts` -- locales: `['de', 'en']`, defaultLocale: `'de'`, localePrefix: `'as-needed'`
- **Message loading:** `apps/web/src/i18n/request.ts` -- dynamically imports `../../messages/${locale}.json`
- **Message files:** `apps/web/messages/en.json` and `apps/web/messages/de.json`

### Translation Namespace Pattern

All translations are in a single flat JSON file per locale. Namespaces are top-level keys:

```json
{
  "adminEmployees": { "title": "Employees", ... },
  "adminTariffs": { "fieldCode": "Code", ... },
  "absences": { "datesOverlap": "Selected dates overlap...", ... },
  "timeClock": { ... },
  "timesheet": { ... }
}
```

**Usage in components:**
```tsx
const t = useTranslations('adminEmployees')
// Then: t('title'), t('deactivateDescription', { firstName: '...' })
```

**No separate translation files per namespace** -- all keys go into `en.json` and `de.json` under a top-level namespace key.

The ticket specifies namespace `employee-tariff-assignments`. Following the existing convention, this would be a top-level key like `"employeeTariffAssignments"` (camelCase) in both `en.json` and `de.json`.

### Existing Namespace Examples
| Feature | Namespace Key |
|---------|--------------|
| Employee admin | `adminEmployees` |
| Tariff admin | `adminTariffs` |
| Absences | `absences` |
| Timesheet | `timesheet` |
| Dashboard | `dashboard` |

---

## 7. Error Handling Patterns

### API Error Types: `apps/web/src/lib/api/errors.ts`

```tsx
interface ProblemDetails {
  type: string; title: string; status: number;
  detail?: string; instance?: string;
  errors?: Array<{ field: string; message: string }>
}

interface ApiError {
  status: number; title: string; message: string;
  fieldErrors?: Record<string, string>; raw: ProblemDetails | unknown
}

function parseApiError(error: unknown): ApiError
function getErrorMessage(status: number, fallback?: string): string
function isHttpStatus(error: ApiError, status: number): boolean
```

The `getErrorMessage` function includes a 409 mapping: `'This operation conflicts with existing data.'`

### 409 Conflict Handling Pattern

The codebase handles overlaps **client-side** in `absence-request-form.tsx`:
```tsx
// Pre-fetch existing absences for overlap detection
const { data: absencesData } = useEmployeeAbsences(employeeId, { from, to })

// Check for overlaps before submitting
const overlappingAbsence = React.useMemo(() => {
  if (!form.dateRange.from || !form.dateRange.to) return undefined
  return hasOverlap(form.dateRange.from, form.dateRange.to, existingAbsences)
}, [form.dateRange, existingAbsences])

// Display inline
{overlappingAbsence && (
  <Alert variant="destructive">
    <AlertDescription>{t('datesOverlap')}</AlertDescription>
  </Alert>
)}

// Also validate on submit
if (overlappingAbsence) {
  setError(t('validationDatesOverlap'))
  return
}
```

For tariff assignments, the backend returns 409 for overlaps. The form error handling pattern catches errors generically:
```tsx
} catch (err) {
  const apiError = err as { detail?: string; message?: string }
  setError(apiError.detail ?? apiError.message ?? t('errorFallback'))
}
```

To specifically handle 409, the pattern would check `err.status === 409` and show a targeted overlap error message.

---

## 8. Available UI Components

### From shadcn/ui (`apps/web/src/components/ui/`)

| Component | File | Notes |
|-----------|------|-------|
| Sheet | `sheet.tsx` | Side panel for forms/details. Supports `side="right"` and `side="bottom"` |
| Button | `button.tsx` | Variants: default, destructive, outline, ghost, link |
| Badge | `badge.tsx` | Variants: default, secondary, destructive, outline, ghost, link |
| Calendar | `calendar.tsx` | Date picker calendar |
| Popover | `popover.tsx` | For date picker dropdowns |
| Select | `select.tsx` | Dropdown select |
| Input | `input.tsx` | Text input |
| Textarea | `textarea.tsx` | Multi-line text input |
| Label | `label.tsx` | Form labels |
| Alert | `alert.tsx` | Error/info alerts. Variant: `destructive` |
| ScrollArea | `scroll-area.tsx` | Scrollable container |
| Skeleton | `skeleton.tsx` | Loading placeholders |
| Tabs | `tabs.tsx` | Tab navigation |
| Table | `table.tsx` | Data table components |
| ConfirmDialog | `confirm-dialog.tsx` | Deletion confirmation (Sheet-based) |
| Switch | `switch.tsx` | Toggle switch |
| Checkbox | `checkbox.tsx` | Checkbox input |
| DropdownMenu | `dropdown-menu.tsx` | Action menus |

### Custom Components

| Component | File | Notes |
|-----------|------|-------|
| StatusBadge | `employees/status-badge.tsx` | Shows active/inactive/exited status |
| DurationInput | `ui/duration-input.tsx` | HH:MM input for time durations |

---

## 9. Timeline/List Component Patterns

There is **no existing timeline component** in the codebase. The closest patterns are:

### Access Cards List (in employee-detail-sheet.tsx)
```tsx
{employee.cards.map((card) => (
  <div key={card.id} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
    <div>
      <p className="text-sm font-medium">{card.card_number}</p>
      <p className="text-xs text-muted-foreground capitalize">{card.card_type}</p>
    </div>
    <span className={`text-xs px-2 py-0.5 rounded-full ${statusClasses}`}>
      {card.is_active ? t('statusActive') : t('statusInactive')}
    </span>
  </div>
))}
```

### Data Table Pattern (for admin lists)
Uses `Table` component from shadcn/ui with `TableHeader`, `TableBody`, `TableRow`, `TableCell`, and `DropdownMenu` for row actions.

### Absence Request List
Simple card-based list in the absence page showing request status badges.

A timeline component would need to be built from scratch using basic div/flex layout with vertical line decoration. The `Badge` component can be used for status indicators.

---

## 10. Tariff-Related Frontend Components

### Existing Tariff Components
```
apps/web/src/components/tariffs/
  tariff-data-table.tsx        -- admin tariff list with data table
  tariff-detail-sheet.tsx      -- tariff detail view sheet
  tariff-form-sheet.tsx        -- create/edit tariff form (detailed, tabbed)
  copy-tariff-dialog.tsx       -- copy tariff dialog
  rolling-week-plan-selector.tsx
  x-days-rhythm-config.tsx
  index.ts                     -- re-exports
```

### Tariff Hooks: `apps/web/src/hooks/api/use-tariffs.ts`

```tsx
export function useTariffs(options?)       // GET /tariffs with filters
export function useTariff(id, enabled?)    // GET /tariffs/{id}
export function useCreateTariff()          // POST /tariffs
export function useUpdateTariff()          // PUT /tariffs/{id}
export function useDeleteTariff()          // DELETE /tariffs/{id}
export function useCreateTariffBreak()     // POST /tariffs/{id}/breaks
export function useDeleteTariffBreak()     // DELETE /tariffs/{id}/breaks/{breakId}
```

The `useTariffs` hook will be needed for the tariff selector dropdown in the assignment form. It supports `active: true` filtering.

---

## 11. Generated Models Status

The Go backend generates models from the OpenAPI spec at `apps/api/gen/models/`. The handler uses `models.CreateEmployeeTariffAssignmentRequest` and `models.UpdateEmployeeTariffAssignmentRequest`.

On the frontend side, `apps/web/src/lib/api/types.ts` is generated from the bundled OpenAPI spec. Currently the tariff-assignment paths are **not present** in types.ts. The OpenAPI paths and schemas exist in the multi-file spec:
- `api/paths/employee-tariff-assignments.yaml`
- `api/schemas/employee-tariff-assignments.yaml`

Running `make swagger-bundle && make generate` is required to get these types into the frontend `types.ts` before implementing typed hooks.

---

## 12. Key File Inventory

### Backend (existing, complete)
| File | Purpose |
|------|---------|
| `api/paths/employee-tariff-assignments.yaml` | OpenAPI endpoint definitions |
| `api/schemas/employee-tariff-assignments.yaml` | OpenAPI schema definitions |
| `apps/api/internal/handler/employeetariffassignment.go` | HTTP handler (CRUD + effective tariff) |
| `apps/api/internal/model/employeetariffassignment.go` | GORM model |
| `apps/api/internal/handler/routes.go` (lines 930-956) | Route registration |
| `db/migrations/000054_create_employee_tariff_assignments.up.sql` | DB migration |

### Frontend (to be created)
| File | Purpose |
|------|---------|
| `apps/web/src/hooks/api/use-employee-tariff-assignments.ts` | API hooks |
| `apps/web/src/components/employees/tariff-assignments/tariff-assignment-list.tsx` | Timeline list |
| `apps/web/src/components/employees/tariff-assignments/tariff-assignment-form-sheet.tsx` | Create/edit sheet |
| `apps/web/src/components/employees/tariff-assignments/effective-tariff-preview.tsx` | Effective tariff card |
| `apps/web/src/components/employees/tariff-assignments/tariff-assignment-delete-dialog.tsx` | Delete confirmation |
| `apps/web/src/components/employees/tariff-assignments/index.ts` | Component re-exports |

### Frontend (to be modified)
| File | Purpose |
|------|---------|
| `apps/web/src/hooks/api/index.ts` | Add tariff assignment hook exports |
| `apps/web/messages/en.json` | Add `employeeTariffAssignments` namespace |
| `apps/web/messages/de.json` | Add `employeeTariffAssignments` namespace |
| `apps/web/src/lib/api/types.ts` | Regenerate with tariff-assignment paths |

### Prerequisite (may need to be created)
| File | Purpose |
|------|---------|
| `apps/web/src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx` | Employee detail page (does not exist) |

---

## 13. Summary of Patterns to Follow

1. **Hooks**: Follow `use-employee-contacts.ts` and `use-absences.ts` patterns for employee-nested resource hooks
2. **Form Sheet**: Follow `tariff-form-sheet.tsx` pattern with Sheet/ScrollArea/SheetFooter, useState for form, useEffect for reset
3. **Delete Dialog**: Use existing `ConfirmDialog` component with `variant="destructive"`
4. **Date Pickers**: Use Popover + Calendar pattern from tariff-form-sheet
5. **Tariff Selector**: Use Select + `useTariffs({ active: true })` pattern
6. **Error Handling**: Catch errors in try/catch, display via Alert with variant destructive; for 409, check error status
7. **Translations**: Add namespace as camelCase key in `en.json`/`de.json`, use `useTranslations('employeeTariffAssignments')`
8. **Generated Types**: Run `make swagger-bundle && make generate` first to get type-safe path definitions
9. **Timeline List**: Build from scratch -- no existing timeline component; use card-based list with visual timeline decoration
10. **Badge**: Use `Badge` component for overwrite behavior and source indicators
