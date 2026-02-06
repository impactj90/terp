# Research: ZMI-TICKET-057 - Grouping Entities Configuration UI

Date: 2026-02-05
Ticket: ZMI-TICKET-057
Status: Research Complete

---

## 1. Existing Admin Pages (Accounts, Booking Types, Absence Types)

### 1.1 Accounts Page

**File:** `apps/web/src/app/[locale]/(dashboard)/admin/accounts/page.tsx`

- Single-page layout with no tabs currently
- Uses `useTranslations('adminAccounts')` for i18n
- Auth pattern: `useAuth()` + `useHasRole(['admin'])` with redirect to `/dashboard`
- Data fetch: `useAccounts({ includeSystem: true, enabled: !authLoading && isAdmin })`
- State management: separate state for `createOpen`, `editItem`, `viewItem`, `deleteItem`
- Groups accounts by type (bonus, tracking, balance) and renders `AccountDataTable` per group
- Filters: search, type filter, status filter, show system toggle
- Components used: `AccountDataTable`, `AccountFormSheet`, `AccountDetailSheet`, `ConfirmDialog`
- Exported from `apps/web/src/components/accounts/index.ts`

### 1.2 Booking Types Page

**File:** `apps/web/src/app/[locale]/(dashboard)/admin/booking-types/page.tsx`

- Single-page layout with no tabs currently
- Uses `useTranslations('adminBookingTypes')` for i18n
- Imports `Tabs, TabsList, TabsTrigger` from `@/components/ui/tabs` but only uses them as direction filter (in/out/all), **not** for page-level tab switching with `TabsContent`
- Data fetch: `useBookingTypes({ enabled: !authLoading && isAdmin })`
- Components used: `BookingTypeDataTable`, `BookingTypeFormSheet`, `ConfirmDialog`
- Exported from `apps/web/src/components/booking-types/index.ts`

### 1.3 Absence Types Page

**File:** `apps/web/src/app/[locale]/(dashboard)/admin/absence-types/page.tsx`

- Single-page layout with no tabs currently
- Uses `useTranslations('adminAbsenceTypes')` for i18n
- Data fetch: `useAbsenceTypes(!authLoading && isAdmin)` (from `use-absences.ts`, not a separate file)
- Components used: `AbsenceTypeDataTable`, `AbsenceTypeFormSheet`, `AbsenceTypeDetailSheet`, `ConfirmDialog`
- Exported from `apps/web/src/components/absence-types/index.ts`

### Key Observation
None of the three target pages currently have page-level tabs. Adding a "Groups" tab will require wrapping the existing page content in `<Tabs>` / `<TabsContent>` and adding a new tab for groups.

---

## 2. CRUD Table Patterns

### Standard Data Table Pattern

All admin data tables follow the same pattern using the shadcn/ui `Table` component.

**Example: `apps/web/src/components/accounts/account-data-table.tsx`**

```tsx
interface AccountDataTableProps {
  accounts: Account[]
  isLoading: boolean
  onView: (account: Account) => void
  onEdit: (account: Account) => void
  onDelete: (account: Account) => void
  onToggleActive?: (account: Account, isActive: boolean) => void
}
```

Structure:
- Props receive data array, loading state, and callback handlers
- Uses `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` from `@/components/ui/table`
- Each row has a `DropdownMenu` with Edit/Delete actions
- Uses `Badge` for status display
- Includes a skeleton loading variant
- Types imported from `components['schemas']['...']` via `@/lib/api/types`

**Example: `apps/web/src/components/booking-types/booking-type-data-table.tsx`**

Same pattern. Columns: Direction (icon), Code (mono font), Name, Usage count, Status (badge + switch), Actions (dropdown).

### Common UI Components Used in Tables
- `Table/TableBody/TableCell/TableHead/TableHeader/TableRow` from `@/components/ui/table`
- `DropdownMenu/DropdownMenuContent/DropdownMenuItem/DropdownMenuSeparator/DropdownMenuTrigger` from `@/components/ui/dropdown-menu`
- `Badge` from `@/components/ui/badge`
- `Switch` from `@/components/ui/switch`
- `Button` variant="ghost" size="icon-sm" for action triggers
- `Skeleton` for loading states
- `Tooltip/TooltipProvider/TooltipTrigger/TooltipContent` for disabled action explanations
- Icons from `lucide-react`: `MoreHorizontal`, `Edit`, `Trash2`, `Eye`, `Lock`

---

## 3. Form Sheet Patterns

### Standard Form Sheet Pattern

All form sheets follow a consistent pattern using `Sheet` from shadcn/ui.

**Example: `apps/web/src/components/accounts/account-form-sheet.tsx`**

```tsx
interface AccountFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  account?: Account | null      // null = create mode, object = edit mode
  onSuccess?: () => void
}
```

Structure:
```tsx
<Sheet open={open} onOpenChange={onOpenChange}>
  <SheetContent side="right" className="w-full sm:max-w-lg flex min-h-0 flex-col">
    <SheetHeader>
      <SheetTitle>{isEdit ? t('editX') : t('newX')}</SheetTitle>
      <SheetDescription>...</SheetDescription>
    </SheetHeader>
    <ScrollArea className="flex-1 -mx-4 px-4">
      <div className="space-y-6 py-4">
        {/* Form sections with h3 headers */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">{t('sectionBasicInfo')}</h3>
          {/* Input fields */}
        </div>
        {/* Error alert */}
        {error && <Alert variant="destructive">...</Alert>}
      </div>
    </ScrollArea>
    <SheetFooter className="flex-row gap-2 border-t pt-4">
      <Button variant="outline" onClick={handleClose} className="flex-1">{t('cancel')}</Button>
      <Button onClick={handleSubmit} className="flex-1">
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isSubmitting ? t('saving') : isEdit ? t('saveChanges') : t('create')}
      </Button>
    </SheetFooter>
  </SheetContent>
</Sheet>
```

Key patterns:
- `isEdit = !!entity` determines create vs edit mode
- Local `FormState` interface with `INITIAL_STATE` constant
- `useEffect` on `[open, entity]` to reset form
- Client-side validation before submit
- Error handling via try/catch with `apiError.detail ?? apiError.message`
- Both `createMutation` and `updateMutation` from API hooks
- Code field: disabled in edit mode, `.toUpperCase()` on change
- Components: `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription`, `SheetFooter`, `ScrollArea`, `Input`, `Label`, `Textarea`, `Switch`, `Select`, `Alert`, `Button`, `Loader2`

---

## 4. API Hooks Patterns

### Hook File Pattern

All API hooks follow the same structure using `useApiQuery` and `useApiMutation` from `@/hooks`.

**Example: `apps/web/src/hooks/api/use-accounts.ts`**

```tsx
import { useApiQuery, useApiMutation } from '@/hooks'

// List hook with options
export function useAccounts(options: UseAccountsOptions = {}) {
  return useApiQuery('/accounts', {
    params: { account_type: accountType, active },
    enabled,
  })
}

// Single item hook
export function useAccount(id: string, enabled = true) {
  return useApiQuery('/accounts/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

// Create hook
export function useCreateAccount() {
  return useApiMutation('/accounts', 'post', {
    invalidateKeys: [['/accounts']],
  })
}

// Update hook
export function useUpdateAccount() {
  return useApiMutation('/accounts/{id}', 'patch', {
    invalidateKeys: [['/accounts'], ['/accounts/{id}']],
  })
}

// Delete hook
export function useDeleteAccount() {
  return useApiMutation('/accounts/{id}', 'delete', {
    invalidateKeys: [['/accounts'], ['/accounts/{id}']],
  })
}
```

**`useApiQuery`** (`apps/web/src/hooks/use-api-query.ts`):
- Type-safe wrapper around React Query's `useQuery`
- Takes path string (matching OpenAPI paths), options with `params`, `path`, `enabled`
- Uses `api.GET()` from openapi-fetch client

**`useApiMutation`** (`apps/web/src/hooks/use-api-mutation.ts`):
- Type-safe wrapper around React Query's `useMutation`
- Takes path, method ('post'|'put'|'patch'|'delete'), options with `invalidateKeys`
- Variables: `{ body?, path? }`
- Auto-invalidates specified query keys on success

### Export Pattern
All hooks are re-exported from `apps/web/src/hooks/api/index.ts`.

---

## 5. Backend API Endpoints

### All Three Group Endpoints Exist and Are Fully Implemented

#### Account Groups

**OpenAPI spec:** `api/paths/account-groups.yaml`
- `GET /account-groups` - List account groups
- `POST /account-groups` - Create account group
- `GET /account-groups/{id}` - Get account group
- `PATCH /account-groups/{id}` - Update account group
- `DELETE /account-groups/{id}` - Delete account group

**Schema:** `api/schemas/account-groups.yaml`
- `AccountGroup`: id, tenant_id, code, name, description (nullable), sort_order, is_active, created_at, updated_at
- `CreateAccountGroupRequest`: code (required), name (required), description, sort_order
- `UpdateAccountGroupRequest`: code, name, description, sort_order, is_active

**Handler:** `apps/api/internal/handler/accountgroup.go`
- Full CRUD implementation
- Error handling: 404 (not found), 400 (validation), 409 (code exists)

**Routes:** `apps/api/internal/handler/routes.go` (line 152)
```go
func RegisterAccountGroupRoutes(r chi.Router, h *AccountGroupHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("accounts.manage").String()
    r.Route("/account-groups", func(r chi.Router) { ... })
}
```

#### Booking Type Groups

**OpenAPI spec:** `api/paths/booking-type-groups.yaml`
- Same CRUD endpoints as account groups
- **Key difference:** Supports `booking_type_ids` array for member assignment

**Schema:** `api/schemas/booking-type-groups.yaml`
- `BookingTypeGroup`: id, tenant_id, code, name, description, is_active, **booking_type_ids** (array of UUIDs), created_at, updated_at
- `CreateBookingTypeGroupRequest`: code (required), name (required), description, **booking_type_ids** (array of UUIDs)
- `UpdateBookingTypeGroupRequest`: name, description, is_active, **booking_type_ids** (array of UUIDs - "Replace group members")

**Handler:** `apps/api/internal/handler/bookingtypegroup.go`
- Full CRUD implementation
- Parses and handles `BookingTypeIDs` in create/update
- Response includes `bookingTypeGroupToResponse()` which fetches member IDs via `h.svc.ListMembers()`

**Routes:** `apps/api/internal/handler/routes.go` (line 719)
```go
func RegisterBookingTypeGroupRoutes(r chi.Router, h *BookingTypeGroupHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("booking_types.manage").String()
    r.Route("/booking-type-groups", func(r chi.Router) { ... })
}
```

#### Absence Type Groups

**OpenAPI spec:** `api/paths/absence-type-groups.yaml`
- Same CRUD endpoints as account groups

**Schema:** `api/schemas/absence-type-groups.yaml`
- `AbsenceTypeGroup`: id, tenant_id, code, name, description, is_active, created_at, updated_at
- `CreateAbsenceTypeGroupRequest`: code (required), name (required), description
- `UpdateAbsenceTypeGroupRequest`: code, name, description, is_active

**Handler:** `apps/api/internal/handler/absencetypegroup.go`
- Full CRUD implementation

**Routes:** `apps/api/internal/handler/routes.go` (line 679)
```go
func RegisterAbsenceTypeGroupRoutes(r chi.Router, h *AbsenceTypeGroupHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("absence_types.manage").String()
    r.Route("/absence-type-groups", func(r chi.Router) { ... })
}
```

### Frontend TypeScript Types (Generated)

**File:** `apps/web/src/lib/api/types.ts`

All three group types are available in the generated TypeScript types:

```typescript
// Line 7041
AccountGroup: {
  id: string;
  tenant_id?: string;
  code: string;
  name: string;
  description?: string | null;
  sort_order?: number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};

// Line 7359
BookingTypeGroup: {
  id: string;
  tenant_id?: string;
  code: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
  booking_type_ids?: string[];  // <-- member IDs
  created_at?: string;
  updated_at?: string;
};

// Line 7012
AbsenceTypeGroup: {
  id: string;
  tenant_id?: string;
  code: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};
```

The OpenAPI paths are fully typed:
- `/account-groups` and `/account-groups/{id}` (lines 2684-2720)
- `/booking-type-groups` and `/booking-type-groups/{id}` (lines 2758-2793)
- `/absence-type-groups` and `/absence-type-groups/{id}` (lines 2647-2683)

---

## 6. Multi-Select Patterns

### Existing Multi-Select Approaches in the Codebase

There is **no dedicated multi-select UI component** in this codebase. Instead, multi-select is implemented inline using different approaches:

#### Approach 1: Combobox with Popover (Single Select)

**File:** `apps/web/src/components/locations/location-form-sheet.tsx`

Uses `Popover` + `PopoverTrigger` + `PopoverContent` with search input and scrollable list of items. This is a **single-select** pattern (for timezone) but the structure can be adapted for multi-select:

```tsx
<Popover open={tzOpen} onOpenChange={setTzOpen}>
  <PopoverTrigger asChild>
    <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
      {form.timezone || t('placeholder')}
      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
    <Input placeholder="Search..." value={search} onChange={...} />
    <div className="max-h-60 overflow-y-auto">
      {items.map((item) => (
        <button className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
          <Check className={cn('mr-2 h-4 w-4', selected ? 'opacity-100' : 'opacity-0')} />
          {item.label}
        </button>
      ))}
    </div>
  </PopoverContent>
</Popover>
```

Imports: `Popover, PopoverContent, PopoverTrigger` from `@/components/ui/popover`, `ChevronsUpDown, Check` from `lucide-react`

#### Approach 2: Checkbox List with ScrollArea

**File:** `apps/web/src/components/employee-day-plans/bulk-assign-dialog.tsx` (line 202)

Uses `SearchInput` + `ScrollArea` + `Checkbox` for multi-selection of employees:

```tsx
<SearchInput value={employeeSearch} onChange={setEmployeeSearch} placeholder="..." />
<ScrollArea className="h-40 rounded-md border p-2">
  {/* Select all toggle */}
  <div className="flex items-center gap-2 pb-2 mb-2 border-b">
    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
    <span className="text-xs text-muted-foreground">Select all ({count})</span>
  </div>
  {/* Individual items */}
  {filteredItems.map((item) => (
    <div className="flex items-center gap-2 py-1">
      <Checkbox checked={selectedIds.has(item.id)} onCheckedChange={() => toggle(item.id)} />
      <span className="text-sm">{item.label}</span>
    </div>
  ))}
</ScrollArea>
{selectedIds.size > 0 && <p className="text-xs text-muted-foreground">{count} selected</p>}
```

**This checkbox list approach is the best pattern for the booking type group member assignment**, as it allows selecting multiple booking types from a searchable, scrollable list.

Available components:
- `Checkbox` from `@/components/ui/checkbox`
- `ScrollArea` from `@/components/ui/scroll-area`
- `SearchInput` from `@/components/ui/search-input`

---

## 7. Translation Patterns

### i18n Structure

**File:** `apps/web/messages/en.json` (single JSON file for English)
**File:** `apps/web/messages/de.json` (single JSON file for German)

Translation keys are organized by namespace (flat object key). Each admin page has its own namespace:

```json
{
  "adminAccounts": { "title": "Accounts", "subtitle": "...", ... },
  "adminBookingTypes": { "title": "Booking Types", ... },
  "adminAbsenceTypes": { "title": "Absence Types", ... }
}
```

Usage in components:
```tsx
const t = useTranslations('adminAccounts')
// Then: t('title'), t('subtitle'), t('newAccount'), etc.
```

### Translation Key Naming Conventions

From existing admin pages:

**Common keys across all admin pages:**
- `title`, `subtitle` - Page header
- `searchPlaceholder` - Search input
- `clearFilters` - Filter reset button
- `emptyTitle`, `emptyFilterHint`, `emptyGetStarted` - Empty states
- `actions`, `edit`, `delete`, `cancel` - Action labels
- `create`, `saveChanges`, `saving` - Form submit labels
- `failedCreate`, `failedUpdate` - Error messages
- `fieldCode`, `fieldName`, `fieldDescription` - Form field labels
- `codePlaceholder`, `namePlaceholder`, `descriptionPlaceholder` - Placeholders
- `codeHint` - Hint text below code field
- `validationCodeRequired`, `validationNameRequired`, `validationCodeMaxLength`, `validationNameMaxLength` - Validation messages
- `sectionBasicInfo`, `sectionStatus` - Form section headers
- `fieldActive`, `fieldActiveDescription` - Active toggle
- `statusActive`, `statusInactive` - Status badges
- `columnCode`, `columnName`, `columnStatus` - Table column headers

### Recommended Namespace Pattern

Based on ticket requirements, new translation namespaces should be:
- `adminAccountGroups` (embedded in `adminAccounts` translations or separate)
- `adminBookingTypeGroups` (embedded in `adminBookingTypes` translations or separate)
- `adminAbsenceTypeGroups` (embedded in `adminAbsenceTypes` translations or separate)

The ticket specifies: `account-groups`, `booking-type-groups`, `absence-type-groups` as namespaces.

---

## 8. Tab Patterns

### Existing Tab Usage in Admin Pages

#### Full Page-Level Tabs (with `TabsContent`)

**File:** `apps/web/src/app/[locale]/(dashboard)/admin/evaluations/page.tsx`

This is the **canonical example** for page-level tabs with content switching:

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type EvaluationTab = 'daily-values' | 'bookings' | 'terminal-bookings' | 'logs' | 'workflow-history'

const [activeTab, setActiveTab] = React.useState<EvaluationTab>(initialTab)

<Tabs value={activeTab} onValueChange={handleTabChange}>
  <TabsList>
    <TabsTrigger value="daily-values">{t('tabs.dailyValues')}</TabsTrigger>
    <TabsTrigger value="bookings">{t('tabs.bookings')}</TabsTrigger>
    {/* ... */}
  </TabsList>

  <TabsContent value="daily-values" className="space-y-4">
    <DailyValuesTab ... />
  </TabsContent>

  <TabsContent value="bookings" className="space-y-4">
    <BookingsTab ... />
  </TabsContent>
  {/* ... */}
</Tabs>
```

Key patterns:
- Type-safe tab value via union type
- Controlled state with `useState`
- URL sync via `useSearchParams` (optional - evaluations page does this)
- `TabsContent` wraps each tab's content

#### Filter-Level Tabs (without `TabsContent`)

**File:** `apps/web/src/app/[locale]/(dashboard)/admin/booking-types/page.tsx`

Uses `Tabs` purely as a filter toggle (no `TabsContent`):

```tsx
<Tabs value={directionFilter} onValueChange={(v) => setDirectionFilter(v as DirectionFilter)}>
  <TabsList>
    <TabsTrigger value="all">{t('filterAll')}</TabsTrigger>
    <TabsTrigger value="in">{t('directionIn')}</TabsTrigger>
    <TabsTrigger value="out">{t('directionOut')}</TabsTrigger>
  </TabsList>
</Tabs>
```

### Tab Component

**File:** `apps/web/src/components/ui/tabs.tsx`

Standard Radix UI tabs wrapper:
- `Tabs` = `TabsPrimitive.Root` (from `@radix-ui/react-tabs`)
- `TabsList` - Styled tab list container
- `TabsTrigger` - Individual tab buttons
- `TabsContent` - Content panels for each tab

---

## 9. Contact Types Page (Similar Two-Entity Pattern)

**File:** `apps/web/src/app/[locale]/(dashboard)/admin/contact-types/page.tsx`

This page manages two related entity types (ContactType + ContactKind) on the same page. However, it uses a **two-panel grid layout** rather than tabs:

```tsx
<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
  <ContactTypeListPanel ... />    {/* Left panel: parent entity */}
  <ContactKindListPanel ... />    {/* Right panel: child entity */}
</div>
```

This is **not** the pattern we want for grouping entities (which should use tabs), but it shows how the codebase handles related CRUD entities on a single page.

---

## 10. Summary of Patterns for Implementation

### Files to Create

1. **API Hooks** (3 files):
   - `apps/web/src/hooks/api/use-account-groups.ts`
   - `apps/web/src/hooks/api/use-booking-type-groups.ts`
   - `apps/web/src/hooks/api/use-absence-type-groups.ts`
   - Update `apps/web/src/hooks/api/index.ts` to export them

2. **Components** (6+ files):
   - `apps/web/src/components/account-groups/account-group-data-table.tsx`
   - `apps/web/src/components/account-groups/account-group-form-sheet.tsx`
   - `apps/web/src/components/account-groups/index.ts`
   - `apps/web/src/components/booking-type-groups/booking-type-group-data-table.tsx`
   - `apps/web/src/components/booking-type-groups/booking-type-group-form-sheet.tsx`
   - `apps/web/src/components/booking-type-groups/index.ts`
   - `apps/web/src/components/absence-type-groups/absence-type-group-data-table.tsx`
   - `apps/web/src/components/absence-type-groups/absence-type-group-form-sheet.tsx`
   - `apps/web/src/components/absence-type-groups/index.ts`

3. **Page Modifications** (3 files):
   - `apps/web/src/app/[locale]/(dashboard)/admin/accounts/page.tsx` - Add Tabs wrapper with "Accounts" and "Groups" tabs
   - `apps/web/src/app/[locale]/(dashboard)/admin/booking-types/page.tsx` - Add Tabs wrapper with "Booking Types" and "Groups" tabs
   - `apps/web/src/app/[locale]/(dashboard)/admin/absence-types/page.tsx` - Add Tabs wrapper with "Absence Types" and "Groups" tabs

4. **Translations** (2 files):
   - `apps/web/messages/en.json` - Add translation keys for all three group types
   - `apps/web/messages/de.json` - Add German translation keys

### Key Differences Between Group Types

| Feature | Account Groups | Booking Type Groups | Absence Type Groups |
|---------|---------------|--------------------|--------------------|
| Fields  | code, name, description, sort_order, is_active | code, name, description, is_active, **booking_type_ids** | code, name, description, is_active |
| Members | None | **Multi-select booking types** | None |
| Table Columns | Code, Name, Description, Sort Order, Active, Actions | Code, Name, Description, **Member Count**, Active, Actions | Code, Name, Description, Active, Actions |
| Create code mutable | Yes | Yes | Yes |
| Update code mutable | Yes | No (not in update schema) | Yes |

### Pattern to Follow for Each Group

1. **Hook**: Follow `use-accounts.ts` pattern with `useApiQuery`/`useApiMutation`
2. **Data Table**: Follow `account-data-table.tsx` pattern (simpler than full account table)
3. **Form Sheet**: Follow `booking-type-form-sheet.tsx` pattern (simpler form with code, name, description)
4. **Multi-Select** (booking type groups only): Follow `bulk-assign-dialog.tsx` checkbox list pattern with `ScrollArea` + `Checkbox` + `SearchInput`
5. **Tab Integration**: Follow `evaluations/page.tsx` pattern with `Tabs` + `TabsContent`
6. **Translations**: Follow existing `adminAccounts` namespace structure

### Backend Status

All three backend APIs are **fully implemented and registered**:
- Handlers: `accountgroup.go`, `bookingtypegroup.go`, `absencetypegroup.go`
- Routes: Registered in `routes.go` with appropriate permissions
- Generated models: Available in `apps/api/gen/models/`
- Frontend types: Generated and available in `apps/web/src/lib/api/types.ts`
- No backend work is needed for this ticket.
