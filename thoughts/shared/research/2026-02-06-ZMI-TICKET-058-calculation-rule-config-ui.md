# Research: ZMI-TICKET-058 - Calculation Rule Configuration UI

## 1. Existing CRUD Page Structure

### Page File Pattern
Admin CRUD pages live at `apps/web/src/app/[locale]/(dashboard)/admin/<entity>/page.tsx`. Currently there is no `calculation-rules` page -- it needs to be created.

### Reference: Location Management Page (`apps/web/src/app/[locale]/(dashboard)/admin/locations/page.tsx`)

Standard page structure:
1. **Imports**: React, next/navigation `useRouter`, next-intl `useTranslations`, lucide icons, auth provider, role hook, API hooks, UI components (Button, Card, CardContent, SearchInput, ConfirmDialog, Skeleton), domain components, API types
2. **Type alias**: `type Location = components['schemas']['Location']`
3. **State management**: `search`, `createOpen`, `editItem`, `viewItem`, `deleteItem`
4. **Data fetching**: `useLocations({ enabled: !authLoading && isAdmin })`, extract items from `data?.data ?? []`
5. **Delete mutation**: `useDeleteLocation()` with `deleteMutation.mutateAsync({ path: { id: deleteItem.id } })`
6. **Auth guard**: `useEffect` redirect to `/dashboard` if not admin, early return `null` if not admin
7. **Filtering**: `useMemo` for client-side search filtering
8. **Page layout sections**:
   - Header: title, subtitle, "New" button
   - Filters bar: `SearchInput` + optional clear button
   - Item count display
   - Card with data table or empty state
   - Form sheet (create/edit combined)
   - Detail sheet (view)
   - ConfirmDialog (delete)
9. **EmptyState component**: Icon, title, hint text, optional create button
10. **PageSkeleton component**: Header + filters + content skeleton

### Reference: Accounts Page (`apps/web/src/app/[locale]/(dashboard)/admin/accounts/page.tsx`)
More complex with Tabs for accounts + groups, type/status/system filters using Select + Switch, grouped data display. Uses both `SearchInput` and `Select` for filtering.

## 2. Data Table Pattern

### Reference: `apps/web/src/components/account-groups/account-group-data-table.tsx`

Structure:
```tsx
interface Props {
  groups: AccountGroup[]
  isLoading: boolean
  onEdit: (group: AccountGroup) => void
  onDelete: (group: AccountGroup) => void
  onToggleActive?: (group: AccountGroup, isActive: boolean) => void
}
```

- Loading state renders `Skeleton` table
- Empty returns `null` (parent handles empty state)
- Uses `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` from `@/components/ui/table`
- Each row has `DropdownMenu` with Edit/Delete actions
- Status shown as `Badge` with optional `Switch` toggle
- Translation namespace: `useTranslations('adminAccountGroups')`

### Reference: `apps/web/src/components/locations/location-data-table.tsx`
- Additional `onView` callback with `Eye` icon in dropdown
- Row `onClick={() => onView(item)}` with `cursor-pointer` class
- Actions cell uses `onClick={(e) => e.stopPropagation()}` to prevent row click
- Icon display in name column with colored bg

## 3. Form Sheet Pattern

### Reference: `apps/web/src/components/account-groups/account-group-form-sheet.tsx`

Structure:
```tsx
interface FormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  group?: AccountGroup | null     // null = create, defined = edit
  onSuccess?: () => void
}

interface FormState { ... }
const INITIAL_STATE: FormState = { ... }
```

Key patterns:
- `isEdit = !!group` determines create vs edit mode
- `useEffect` on `[open, group]` to populate/reset form
- Inline validation with error array, joined by '. '
- `try/catch` on `mutateAsync` with error extraction: `(err as { detail?: string; message?: string })`
- Sheet with `side="right"`, `className="w-full sm:max-w-lg flex flex-col"`
- `ScrollArea` for form content with `-mx-4 px-4`
- Sections with `<h3 className="text-sm font-medium text-muted-foreground">`
- Status toggle only shown in edit mode
- Footer: Cancel + Submit buttons with loading state

### Reference: `apps/web/src/components/locations/location-form-sheet.tsx`
- Timezone selector uses custom `Popover` with search + scroll list
- More complex form with address section
- Same overall structure

## 4. Detail Sheet Pattern

### Reference: `apps/web/src/components/locations/location-detail-sheet.tsx`

Structure:
```tsx
interface DetailSheetProps {
  locationId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (location: Location) => void
  onDelete: (location: Location) => void
}
```

- Fetches single entity: `useLocation(locationId || '', open && !!locationId)`
- Loading skeleton when fetching
- `DetailRow` helper: label + value in flex row with border-bottom
- Sections: icon/name/status header, description, details, timestamps
- Footer: Close + Edit + Delete buttons

## 5. Delete Dialog / 409 Conflict Handling

### ConfirmDialog Component (`apps/web/src/components/ui/confirm-dialog.tsx`)
```tsx
interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'destructive'
  isLoading?: boolean
  onConfirm: () => void | Promise<void>
}
```
- Uses `Sheet` with `side="bottom"` (not a traditional dialog)
- Destructive variant shows AlertTriangle icon
- Does NOT close automatically after confirm -- parent manages

### 409 Conflict Handling Pattern (from `apps/web/src/app/[locale]/(dashboard)/admin/contact-types/page.tsx`)

```tsx
const [deleteTypeError, setDeleteTypeError] = React.useState<string | null>(null)

const handleConfirmDeleteType = async () => {
  if (!deleteType) return
  setDeleteTypeError(null)
  try {
    await deleteTypeMutation.mutateAsync({ path: { id: deleteType.id } })
    setDeleteType(null)
  } catch (err) {
    const apiError = err as { status?: number; detail?: string; message?: string }
    if (apiError.status === 409) {
      setDeleteTypeError(t('deleteTypeInUse'))
    } else {
      setDeleteTypeError(apiError.detail ?? apiError.message ?? t('failedDelete'))
    }
  }
}
```

The ConfirmDialog `description` is then conditionally set:
```tsx
description={
  deleteTypeError
    ? deleteTypeError
    : deleteType
      ? t('deleteTypeDescription', { name: deleteType.name })
      : ''
}
```

This replaces the description with the error message on 409. The error state is cleared when the dialog is closed.

### Relevant for calculation-rules:
- DELETE `/calculation-rules/{id}` returns 409 when "Rule is still assigned to absence types"
- Service error: `ErrCalculationRuleInUse`
- Handler response: `respondError(w, http.StatusConflict, "Calculation rule is still assigned to absence types")`

## 6. API Hooks Structure

### Reference: `apps/web/src/hooks/api/use-account-groups.ts`

```typescript
import { useApiQuery, useApiMutation } from '@/hooks'

export function useAccountGroups(options = {}) {
  return useApiQuery('/account-groups', { enabled })
}

export function useAccountGroup(id: string, enabled = true) {
  return useApiQuery('/account-groups/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateAccountGroup() {
  return useApiMutation('/account-groups', 'post', {
    invalidateKeys: [['/account-groups']],
  })
}

export function useUpdateAccountGroup() {
  return useApiMutation('/account-groups/{id}', 'patch', {
    invalidateKeys: [['/account-groups'], ['/account-groups/{id}']],
  })
}

export function useDeleteAccountGroup() {
  return useApiMutation('/account-groups/{id}', 'delete', {
    invalidateKeys: [['/account-groups'], ['/account-groups/{id}']],
  })
}
```

### Hook Infrastructure
- `useApiQuery` (`apps/web/src/hooks/use-api-query.ts`): Type-safe wrapper around `@tanstack/react-query` `useQuery`. Takes OpenAPI path, optional params/path/query options.
- `useApiMutation` (`apps/web/src/hooks/use-api-mutation.ts`): Type-safe wrapper around `useMutation`. Takes path, method, options with `invalidateKeys`.
- Both import from `@/lib/api` which uses openapi-fetch for type-safe HTTP.

### Registration in Index (`apps/web/src/hooks/api/index.ts`)
All hooks are exported from the index barrel file, grouped by domain with comments.

### For Calculation Rules
The OpenAPI types file already has the paths defined:
- `"/calculation-rules"` with `get` (listCalculationRules) and `post` (createCalculationRule)
- `"/calculation-rules/{id}"` with `get`, `patch`, `delete`

List endpoint supports `active_only?: boolean` query parameter.

## 7. Sidebar Navigation

### Config: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

```typescript
export interface NavItem {
  titleKey: string       // Translation key in 'nav' namespace
  href: string
  icon: LucideIcon
  roles?: UserRole[]
  badge?: number
}

export interface NavSection {
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

The "management" section currently contains items like accounts, bookingTypes, absenceTypes, etc. Calculation rules should be added to this section.

Icons are imported from `lucide-react`. The `Calculator` icon is available in lucide-react and not currently used.

Translation keys go in the `nav` namespace in `messages/en.json` and `messages/de.json`.

## 8. Translation Organization

### Files
- `apps/web/messages/en.json` - English translations
- `apps/web/messages/de.json` - German translations

### Namespace Convention
- Navigation: `nav.<key>` (e.g., `nav.calculationRules`)
- Page-specific: `admin<Entity>.<key>` (e.g., `adminLocations.title`, `adminAccountGroups.title`)
- Common: `common.<key>`

### Typical Translation Keys for a CRUD Page (from `adminAccountGroups`):
```json
{
  "adminAccountGroups": {
    "title": "...",
    "subtitle": "...",
    "newGroup": "...",
    "searchPlaceholder": "...",
    "clearFilters": "Clear filters",
    "groupCount": "{count} group",
    "groupsCount": "{count} groups",
    "deleteGroup": "...",
    "deleteDescription": "...",
    "delete": "Delete",
    "emptyTitle": "...",
    "emptyFilterHint": "...",
    "emptyGetStarted": "...",
    "addGroup": "...",
    "actions": "Actions",
    "cancel": "Cancel",
    "columnCode": "Code",
    "columnName": "Name",
    "columnDescription": "Description",
    "columnSortOrder": "Sort Order",
    "columnStatus": "Status",
    "create": "Create",
    "createDescription": "...",
    "edit": "Edit",
    "editGroup": "...",
    "editDescription": "...",
    "failedCreate": "...",
    "failedUpdate": "...",
    "fieldActive": "Active",
    "fieldActiveDescription": "...",
    "fieldCode": "Code",
    "fieldDescription": "Description",
    "fieldName": "Name",
    "saveChanges": "Save Changes",
    "saving": "Saving...",
    "sectionBasicInfo": "Basic Information",
    "sectionStatus": "Status",
    "statusActive": "Active",
    "statusInactive": "Inactive",
    "validationCodeMaxLength": "...",
    "validationCodeRequired": "...",
    "validationNameRequired": "..."
  }
}
```

## 9. Backend API Endpoints

### OpenAPI Spec (`api/paths/calculation-rules.yaml`)

| Method | Path | Operation | Notes |
|--------|------|-----------|-------|
| GET | `/calculation-rules` | listCalculationRules | Query: `active_only` (boolean) |
| POST | `/calculation-rules` | createCalculationRule | 409 on duplicate code |
| GET | `/calculation-rules/{id}` | getCalculationRule | |
| PATCH | `/calculation-rules/{id}` | updateCalculationRule | |
| DELETE | `/calculation-rules/{id}` | deleteCalculationRule | 409 when assigned to absence types |

### Handler (`apps/api/internal/handler/calculationrule.go`)
- Standard CRUD handler with `List`, `Get`, `Create`, `Update`, `Delete` methods
- Error mapping in `handleCalculationRuleError`:
  - `ErrCalculationRuleNotFound` -> 404
  - `ErrCalculationRuleCodeRequired` -> 400
  - `ErrCalculationRuleNameRequired` -> 400
  - `ErrCalculationRuleCodeExists` -> 409 "A calculation rule with this code already exists"
  - `ErrCalculationRuleInUse` -> 409 "Calculation rule is still assigned to absence types"
  - `ErrInvalidFactor` -> 400 "Factor must be greater than 0"
  - `ErrInvalidValue` -> 400 "Value must be non-negative"
- Audit logging on create, update, delete
- `List` supports `active_only=true` query param filtering

### Service (`apps/api/internal/service/calculationrule.go`)

**CreateCalculationRuleInput**:
```go
type CreateCalculationRuleInput struct {
    TenantID    uuid.UUID
    Code        string
    Name        string
    Description *string
    AccountID   *uuid.UUID
    Value       int        // minutes, 0 = use daily target
    Factor      float64    // multiplier, defaults to 1.0
}
```

**UpdateCalculationRuleInput**:
```go
type UpdateCalculationRuleInput struct {
    Name           *string
    Description    *string
    AccountID      *uuid.UUID
    Value          *int
    Factor         *float64
    IsActive       *bool
    ClearAccountID bool    // set account_id to NULL
}
```

- Factor defaults to 1.0 if not set (0 value on create)
- Factor must be > 0
- Value must be >= 0
- Delete checks `CountAbsenceTypeUsages` before allowing deletion

### Repository (`apps/api/internal/repository/calculationrule.go`)
- List ordered by `code ASC`
- `CountAbsenceTypeUsages` checks `absence_types` table for `calculation_rule_id` references

### Model (`apps/api/internal/model/calculationrule.go`)
```go
type CalculationRule struct {
    ID          uuid.UUID
    TenantID    uuid.UUID
    Code        string        // varchar(50)
    Name        string        // varchar(255)
    Description *string
    AccountID   *uuid.UUID    // nullable FK to accounts
    Value       int           // minutes, 0 = use daily target
    Factor      float64       // numeric(5,2), default 1.00
    IsActive    bool          // default true
    CreatedAt   time.Time
    UpdatedAt   time.Time
    Account     *Account      // relation
}
```

Calculate formula: `effectiveValue = value (or dailyTarget if 0); result = effectiveValue * factor`

### Route Registration (`apps/api/internal/handler/routes.go`, line 773-784)
```go
func RegisterCalculationRuleRoutes(r chi.Router, h *CalculationRuleHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("absence_types.manage").String()
    r.Route("/calculation-rules", func(r chi.Router) {
        r.Get("/", h.List)
        r.Post("/", h.Create)
        r.Get("/{id}", h.Get)
        r.Patch("/{id}", h.Update)
        r.Delete("/{id}", h.Delete)
    })
}
```

## 10. Generated TypeScript Types (from `apps/web/src/lib/api/types.ts`)

### CalculationRule Schema
```typescript
CalculationRule: {
    id: string;                    // uuid
    tenant_id: string;             // uuid
    code: string;                  // e.g. "FULL_DAY"
    name: string;                  // e.g. "Full Day Absence"
    description?: string | null;
    account_id?: string | null;    // uuid, linked account
    value: number;                 // minutes, 0 = use daily target time
    factor: number;                // double, multiplier
    is_active?: boolean;
    created_at?: string;           // date-time
    updated_at?: string;           // date-time
}
```

### CreateCalculationRuleRequest
```typescript
CreateCalculationRuleRequest: {
    code: string;
    name: string;
    description?: string;
    account_id?: string;           // uuid
    value: number;                 // default 0
    factor: number;                // default 1
}
```

### UpdateCalculationRuleRequest
```typescript
UpdateCalculationRuleRequest: {
    name?: string;
    description?: string;
    account_id?: string | null;    // nullable to clear
    value?: number;
    factor?: number;
    is_active?: boolean;
}
```

### CalculationRuleList
```typescript
CalculationRuleList: {
    data: CalculationRule[];
}
```

### CalculationRuleSummary
```typescript
CalculationRuleSummary: {
    id: string;
    code: string;
    name: string;
}
```

## 11. Accounts Hook (for Account Selector Dependency)

### `apps/web/src/hooks/api/use-accounts.ts`

```typescript
interface UseAccountsOptions {
  accountType?: 'bonus' | 'tracking' | 'balance'
  active?: boolean
  includeSystem?: boolean
  enabled?: boolean
}

export function useAccounts(options: UseAccountsOptions = {}) {
  return useApiQuery('/accounts', {
    params: { account_type: accountType, active, ... },
    enabled,
  })
}
```

For the account selector in the calculation rule form, use `useAccounts({ active: true })` or `useAccounts()` to get available accounts. The account has `id`, `code`, `name` fields that can populate a dropdown/select.

## 12. Component Index Barrel Pattern

### Reference: `apps/web/src/components/locations/index.ts`
```typescript
export { LocationDataTable } from './location-data-table'
export { LocationFormSheet } from './location-form-sheet'
export { LocationDetailSheet } from './location-detail-sheet'
```

Each component folder has an `index.ts` barrel export.

## 13. Key UI Components Available

| Component | Path | Usage |
|-----------|------|-------|
| SearchInput | `@/components/ui/search-input` | Debounced search with clear button |
| ConfirmDialog | `@/components/ui/confirm-dialog` | Bottom sheet confirmation dialog |
| Badge | `@/components/ui/badge` | Status badges (default/secondary variants) |
| Switch | `@/components/ui/switch` | Active toggle |
| Sheet/SheetContent | `@/components/ui/sheet` | Side panels for forms/details |
| ScrollArea | `@/components/ui/scroll-area` | Scrollable form content |
| Table/TableHeader/... | `@/components/ui/table` | Data tables |
| DropdownMenu | `@/components/ui/dropdown-menu` | Row action menus |
| Select | `@/components/ui/select` | Dropdown selectors (for account picker) |
| Card/CardContent | `@/components/ui/card` | Content wrapper |
| Skeleton | `@/components/ui/skeleton` | Loading states |
| Alert/AlertDescription | `@/components/ui/alert` | Form error display |

## 14. Files That Need Creation or Modification

### New Files
1. `apps/web/src/app/[locale]/(dashboard)/admin/calculation-rules/page.tsx` - Page component
2. `apps/web/src/components/calculation-rules/calculation-rule-data-table.tsx` - Data table
3. `apps/web/src/components/calculation-rules/calculation-rule-form-sheet.tsx` - Create/edit form
4. `apps/web/src/components/calculation-rules/calculation-rule-detail-sheet.tsx` - Detail view
5. `apps/web/src/components/calculation-rules/index.ts` - Barrel exports
6. `apps/web/src/hooks/api/use-calculation-rules.ts` - API hooks

### Modified Files
1. `apps/web/src/hooks/api/index.ts` - Add calculation rules exports
2. `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` - Add nav item with Calculator icon
3. `apps/web/messages/en.json` - Add `nav.calculationRules` + `adminCalculationRules` namespace
4. `apps/web/messages/de.json` - Add German translations

## 15. Special Display Logic

### Value Display
- When `value === 0`: Display as "Use daily target time" (translated)
- When `value > 0`: Display as `{value} minutes` (e.g., "480 minutes" or format as hours)

### Factor Display
- Display as multiplier with "x" suffix: `{factor}x` (e.g., "1.0x", "0.5x", "1.5x")

### Account Display
- When `account_id` is set: Show linked account name (requires fetching/joining accounts data)
- When `account_id` is null: Show dash or "None"

### Active Filter Toggle
- Similar to other pages using a Switch or Select for status filtering
- The API supports `active_only` query parameter, but all existing pages do client-side filtering
