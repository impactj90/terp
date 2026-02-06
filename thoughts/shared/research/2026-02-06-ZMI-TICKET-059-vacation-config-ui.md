# Research: ZMI-TICKET-059 - Vacation Configuration UI

## 1. Multi-Tab Admin Config Page Structure

### Existing Multi-Tab Pages

The codebase has several admin pages that use the `Tabs` component from `@/components/ui/tabs` (Radix UI `@radix-ui/react-tabs`):

1. **Accounts Page** (`apps/web/src/app/[locale]/(dashboard)/admin/accounts/page.tsx`) - 2 tabs: Accounts, Groups
2. **Booking Types Page** (`apps/web/src/app/[locale]/(dashboard)/admin/booking-types/page.tsx`) - 2 tabs: Booking Types, Groups
3. **Absence Types Page** (`apps/web/src/app/[locale]/(dashboard)/admin/absence-types/page.tsx`) - 2 tabs: Absence Types, Groups

All three follow an identical pattern:

```tsx
// Tab state
const [activeTab, setActiveTab] = React.useState<'accounts' | 'groups'>('accounts')

// Each tab has its own filter state
const [search, setSearch] = React.useState('')       // tab 1 filters
const [groupSearch, setGroupSearch] = React.useState('') // tab 2 filters

// Tabs component from Radix
<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'accounts' | 'groups')}>
  <TabsList>
    <TabsTrigger value="accounts">{t('tabAccounts')}</TabsTrigger>
    <TabsTrigger value="groups">{t('tabGroups')}</TabsTrigger>
  </TabsList>

  <TabsContent value="accounts" className="space-y-6">
    {/* Filters, count, Card with DataTable */}
  </TabsContent>

  <TabsContent value="groups" className="space-y-6">
    {/* Filters, count, Card with DataTable */}
  </TabsContent>
</Tabs>
```

**Key pattern**: The page header "New" button changes label based on active tab:
```tsx
<Button onClick={() => activeTab === 'groups' ? setCreateGroupOpen(true) : setCreateOpen(true)}>
  <Plus className="mr-2 h-4 w-4" />
  {activeTab === 'groups' ? tGroups('newGroup') : t('newAccount')}
</Button>
```

### Contact Types Page (Two-Panel Layout Alternative)

`apps/web/src/app/[locale]/(dashboard)/admin/contact-types/page.tsx` uses a **two-panel grid** layout instead of tabs:
```tsx
<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
  <ContactTypeListPanel ... />  {/* Left panel */}
  <ContactKindListPanel ... />  {/* Right panel */}
</div>
```

### Settings Page (Section Layout)

`apps/web/src/app/[locale]/(dashboard)/admin/settings/page.tsx` uses a **vertical section layout** with `<hr>` separator between `SystemSettingsForm` and `CleanupToolsSection`.

### Single-Entity Page Pattern (No Tabs)

`apps/web/src/app/[locale]/(dashboard)/admin/calculation-rules/page.tsx` is a standard CRUD page without tabs. Structure:
1. Header (title, subtitle, "New" button)
2. Filters bar (SearchInput + Switch for active-only)
3. Item count
4. Card with DataTable
5. FormSheet (create/edit)
6. DetailSheet (view)
7. ConfirmDialog (delete)

### Tabs Component

`apps/web/src/components/ui/tabs.tsx` wraps Radix `@radix-ui/react-tabs`:
- `Tabs` - Root container
- `TabsList` - Tab bar with `bg-muted p-1 rounded-lg`
- `TabsTrigger` - Individual tab with active state styling
- `TabsContent` - Content panel with `mt-2`

**Note for 6-tab layout**: Existing pages have at most 2 tabs. A 6-tab page is new territory. The `TabsList` auto-wraps, but may need width consideration.

## 2. API Hook Conventions for CRUD Operations

### Base Hooks

Located at `apps/web/src/hooks/`:
- `use-api-query.ts` - Wraps `@tanstack/react-query` `useQuery` with type-safe paths from OpenAPI types
- `use-api-mutation.ts` - Wraps `useMutation` with `invalidateKeys` for cache invalidation

### Hook File Pattern

Each entity has a file at `apps/web/src/hooks/api/use-<entity>.ts` following this template:

```tsx
// apps/web/src/hooks/api/use-booking-type-groups.ts
import { useApiQuery, useApiMutation } from '@/hooks'

interface UseBookingTypeGroupsOptions {
  enabled?: boolean
}

// List hook
export function useBookingTypeGroups(options: UseBookingTypeGroupsOptions = {}) {
  const { enabled = true } = options
  return useApiQuery('/booking-type-groups', { enabled })
}

// Get-by-ID hook
export function useBookingTypeGroup(id: string, enabled = true) {
  return useApiQuery('/booking-type-groups/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

// Create hook
export function useCreateBookingTypeGroup() {
  return useApiMutation('/booking-type-groups', 'post', {
    invalidateKeys: [['/booking-type-groups']],
  })
}

// Update hook
export function useUpdateBookingTypeGroup() {
  return useApiMutation('/booking-type-groups/{id}', 'patch', {
    invalidateKeys: [['/booking-type-groups'], ['/booking-type-groups/{id}']],
  })
}

// Delete hook
export function useDeleteBookingTypeGroup() {
  return useApiMutation('/booking-type-groups/{id}', 'delete', {
    invalidateKeys: [['/booking-type-groups'], ['/booking-type-groups/{id}']],
  })
}
```

### Hook Options Pattern

More complex hooks accept additional params:
```tsx
// apps/web/src/hooks/api/use-accounts.ts
interface UseAccountsOptions {
  accountType?: 'bonus' | 'tracking' | 'balance'
  active?: boolean
  includeSystem?: boolean
  enabled?: boolean
}

export function useAccounts(options: UseAccountsOptions = {}) {
  const { accountType, active, includeSystem, enabled = true } = options
  return useApiQuery('/accounts', {
    params: {
      account_type: accountType,
      active,
      ...(includeSystem !== undefined ? { include_system: includeSystem } : {}),
    } as Record<string, unknown>,
    enabled,
  })
}
```

### Hook Registration

All hooks are re-exported from `apps/web/src/hooks/api/index.ts` with section comments:
```tsx
// Booking Type Groups
export {
  useBookingTypeGroups,
  useBookingTypeGroup,
  useCreateBookingTypeGroup,
  useUpdateBookingTypeGroup,
  useDeleteBookingTypeGroup,
} from './use-booking-type-groups'
```

### Data Access Pattern

Components access data as:
```tsx
const { data: rulesData, isLoading } = useCalculationRules({ enabled: !authLoading && isAdmin })
const rules = rulesData?.data ?? []
```

Mutations are used as:
```tsx
const deleteMutation = useDeleteCalculationRule()
await deleteMutation.mutateAsync({ path: { id: item.id } })
// For create/update:
await createMutation.mutateAsync({ body: { ... } })
await updateMutation.mutateAsync({ path: { id: item.id }, body: { ... } })
```

## 3. Multi-Select Components for Linking Entities

### Pattern 1: Inline Checkbox List in Form Sheet

Used by `apps/web/src/components/booking-type-groups/booking-type-group-form-sheet.tsx`:

```tsx
interface FormState {
  // ... other fields
  bookingTypeIds: Set<string>  // Uses Set<string> for selection tracking
}

// Fetch available items
const { data: bookingTypesData } = useBookingTypes({ enabled: open })
const bookingTypes = (bookingTypesData?.data ?? []) as BookingType[]

// Search filter for the list
const [memberSearch, setMemberSearch] = React.useState('')
const filteredBookingTypes = React.useMemo(() => {
  if (!memberSearch) return bookingTypes
  const s = memberSearch.toLowerCase()
  return bookingTypes.filter(bt => bt.code?.toLowerCase().includes(s) || bt.name?.toLowerCase().includes(s))
}, [bookingTypes, memberSearch])

// Toggle functions
const toggleBookingType = (id: string) => {
  setForm(prev => {
    const next = new Set(prev.bookingTypeIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return { ...prev, bookingTypeIds: next }
  })
}

const toggleAll = () => { /* selects/deselects all filtered items */ }

// UI: Section with SearchInput + ScrollArea + Checkbox list
<div className="space-y-4">
  <h3 className="text-sm font-medium text-muted-foreground">{t('sectionMembers')}</h3>
  <SearchInput value={memberSearch} onChange={setMemberSearch} ... />
  <ScrollArea className="h-48 rounded-md border p-2">
    {/* Select all row */}
    <div className="flex items-center gap-2 pb-2 mb-2 border-b">
      <Checkbox checked={...} onCheckedChange={() => toggleAll()} />
      <span className="text-xs text-muted-foreground">{t('membersSelectAll', { count })}</span>
    </div>
    {/* Item rows */}
    {filteredBookingTypes.map(bt => (
      <div key={bt.id} className="flex items-center gap-2 py-1">
        <Checkbox checked={form.bookingTypeIds.has(bt.id)} onCheckedChange={() => toggleBookingType(bt.id)} />
        <span className="text-sm"><span className="font-mono text-xs">{bt.code}</span> - {bt.name}</span>
      </div>
    ))}
  </ScrollArea>
  {form.bookingTypeIds.size > 0 && (
    <p className="text-xs text-muted-foreground">{t('membersSelected', { count: form.bookingTypeIds.size })}</p>
  )}
</div>
```

On submit, the Set is converted to array:
```tsx
booking_type_ids: Array.from(form.bookingTypeIds)
```

### Pattern 2: MultiSelectPopover (Reports Dialog)

Used by `apps/web/src/components/reports/generate-report-dialog.tsx`:

```tsx
interface MultiSelectPopoverProps {
  label: string
  placeholder: string
  selectedIds: string[]
  onSelectedIdsChange: (ids: string[]) => void
  items: Array<{ id: string; label: string }>
}

function MultiSelectPopover({ label, placeholder, selectedIds, onSelectedIdsChange, items }: MultiSelectPopoverProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-between font-normal">
            {selectedIds.length > 0 ? `${label} (${selectedIds.length})` : placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <ScrollArea className="h-60">
            {items.map(item => (
              <div key={item.id} className="flex items-center space-x-2 px-3 py-2 hover:bg-accent cursor-pointer" onClick={...}>
                <Checkbox checked={selectedIds.includes(item.id)} onCheckedChange={...} />
                <span className="text-sm">{item.label}</span>
              </div>
            ))}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  )
}
```

### Pattern 3: Employee Multi-Select (Bulk Assign Dialog)

Used by `apps/web/src/components/employee-day-plans/bulk-assign-dialog.tsx`:
- Uses `Set<string>` for `selectedEmployeeIds`
- SearchInput above ScrollArea in a border container
- Select-all checkbox at top of list
- Shows count below: `{selectedEmployeeIds.size} selected`

## 4. Preview / Calculator Components

### Vacation Balance Form Sheet Total Preview

`apps/web/src/components/vacation-balances/vacation-balance-form-sheet.tsx` includes a live computed total:

```tsx
const totalPreview =
  parseFloat(form.baseEntitlement || '0') +
  parseFloat(form.additionalEntitlement || '0') +
  parseFloat(form.carryoverFromPrevious || '0') +
  parseFloat(form.manualAdjustment || '0')

// Rendered as:
<div className="rounded-lg border bg-muted/50 p-4">
  <div className="flex justify-between text-sm">
    <span className="text-muted-foreground">{t('totalEntitlementPreview')}</span>
    <span className="font-medium">{totalPreview.toFixed(1)}</span>
  </div>
</div>
```

### Vacation Balance Detail Sheet Breakdown

`apps/web/src/components/vacation-balances/vacation-balance-detail-sheet.tsx` shows a detailed breakdown using a `DetailRow` helper:

```tsx
function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-2 border-b last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value || '-'}</span>
    </div>
  )
}
```

Sections are rendered as:
```tsx
<div className="space-y-2">
  <h4 className="text-sm font-medium text-muted-foreground">{t('sectionEntitlement')}</h4>
  <div className="rounded-lg border p-4">
    <DetailRow label={t('labelBaseEntitlement')} value={formatDecimal(balance.base_entitlement)} />
    <DetailRow label={t('labelAdditionalEntitlement')} value={formatDecimal(balance.additional_entitlement)} />
    {/* ... more rows */}
    <DetailRow label={t('labelTotalEntitlement')} value={<span className="font-bold">{formatDecimal(balance.total_entitlement)}</span>} />
  </div>
</div>
```

Also includes a progress bar for usage visualization:
```tsx
<div className="h-3 w-full overflow-hidden rounded-full bg-muted">
  <div className="flex h-full">
    <div className="h-full bg-green-500 transition-all" style={{ width: usedPercent + '%' }} />
    <div className="h-full bg-yellow-500 transition-all" style={{ width: plannedPercent + '%' }} />
  </div>
</div>
```

**Note**: There is no existing "calculator" component that sends a POST request and displays results. The ticket's preview feature (POST `/vacation-entitlement/preview`) will be a new pattern. The closest analogue is the `GenerateReportDialog` which sends a POST and shows results, or the vacation balance total preview which computes locally.

## 5. Delete Conflict (409) Handling

### Pattern: Calculation Rules Page

`apps/web/src/app/[locale]/(dashboard)/admin/calculation-rules/page.tsx`:

```tsx
const [deleteError, setDeleteError] = React.useState<string | null>(null)

const handleConfirmDelete = async () => {
  if (!deleteItem) return
  setDeleteError(null)
  try {
    await deleteMutation.mutateAsync({ path: { id: deleteItem.id } })
    setDeleteItem(null)
  } catch (err) {
    const apiError = err as { status?: number; detail?: string; message?: string }
    if (apiError.status === 409) {
      setDeleteError(t('deleteInUse'))
    } else {
      setDeleteError(apiError.detail ?? apiError.message ?? t('failedDelete'))
    }
  }
}
```

The error is displayed inside the `ConfirmDialog` description:
```tsx
<ConfirmDialog
  description={
    deleteError
      ? deleteError  // Shows 409 message here
      : deleteItem
        ? t('deleteDescription', { name: deleteItem.name, code: deleteItem.code })
        : ''
  }
  ...
/>
```

The dialog stays open when a 409 occurs, showing the error message instead of the normal description. The user can close the dialog manually.

### Pattern: Contact Types Page

Same pattern, with `deleteTypeError` state:
```tsx
if (apiError.status === 409) {
  setDeleteTypeError(t('deleteTypeInUse'))
}
```

### Pattern: Accounts Page (Usage Warning)

Uses a separate `useAccountUsage` hook to fetch usage data before showing delete dialog:
```tsx
const { data: deleteUsageData } = useAccountUsage(deleteItem?.id ?? '', !!deleteItem)

// Shows usage warning in description
description={deleteItem ? [
  t('deleteDescription', { name: deleteItem.name, code: deleteItem.code }),
  deleteUsageData?.usage_count
    ? t('deleteUsageWarning', { count: deleteUsageData.usage_count, plans: ... })
    : '',
].filter(Boolean).join(' ') : ''}
```

### API Error Structure

`apps/web/src/lib/api/errors.ts` defines `ProblemDetails` (RFC 7807):
```tsx
interface ProblemDetails {
  type: string
  title: string
  status: number
  detail?: string
  instance?: string
  errors?: Array<{ field: string; message: string }>
}
```

And `parseApiError()` utility for structured error handling.

## 6. Conditional Form Field Visibility

### Pattern: Day Plan Form Sheet (`planType` conditional)

`apps/web/src/components/day-plans/day-plan-form-sheet.tsx`:

```tsx
{form.planType === 'fixed' ? (
  <div className="grid grid-cols-2 gap-4">
    {/* Only comeFrom and goFrom fields */}
  </div>
) : (
  <>
    {/* All four time fields: comeFrom, comeTo, goFrom, goTo */}
  </>
)}

{form.planType === 'flextime' && (
  <div className="border-t pt-4">
    {/* Core time fields only shown for flextime */}
  </div>
)}
```

### Pattern: Calculation Rule Form Sheet (`isEdit` conditional)

```tsx
{/* Status (edit only) */}
{isEdit && (
  <div className="space-y-4">
    <h3 className="text-sm font-medium text-muted-foreground">{t('sectionStatus')}</h3>
    <Switch id="isActive" checked={form.isActive} onCheckedChange={...} />
  </div>
)}
```

### Pattern: Vacation Balance Form Sheet

```tsx
{/* Carryover to Next Year (edit only) */}
{isEdit && (
  <div className="space-y-2">
    <Label htmlFor="carryoverToNext">{t('fieldCarryoverToNext')}</Label>
    <Input type="number" ... />
  </div>
)}
```

### Pattern: Report Dialog (dynamic sections based on selection)

```tsx
{/* Date Range (shown when report type requires it) */}
{reportType && needsDateRange && (
  <div className="space-y-2">
    <DateRangePicker ... />
  </div>
)}

{/* Entity Filters (shown after type is selected) */}
{reportType && (
  <div className="space-y-4 rounded-lg border p-4">
    <MultiSelectPopover ... />
  </div>
)}
```

**Relevant for vacation-config**: The employee exceptions form needs to show `retain_days` only when `exemption_type === 'partial'`. The pattern is simply:
```tsx
{form.exemptionType === 'partial' && (
  <div className="space-y-2">
    <Label>Retain Days</Label>
    <Input type="number" ... />
  </div>
)}
```

## 7. Badge/Tag Displays for Enum Types

### Data Type Badge Component

`apps/web/src/components/contact-types/data-type-badge.tsx`:

```tsx
type DataType = 'text' | 'email' | 'phone' | 'url'

const dataTypeConfig: Record<DataType, { labelKey: string; className: string }> = {
  text: {
    labelKey: 'dataTypeText',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  },
  email: {
    labelKey: 'dataTypeEmail',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  phone: {
    labelKey: 'dataTypePhone',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  url: {
    labelKey: 'dataTypeUrl',
    className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  },
}

export function DataTypeBadge({ dataType }: { dataType: DataType }) {
  const t = useTranslations('adminContactTypes')
  const config = dataTypeConfig[dataType]
  return (
    <Badge variant="secondary" className={config.className}>
      {t(config.labelKey)}
    </Badge>
  )
}
```

### Inline Badge Usage in Data Tables

`apps/web/src/components/calculation-rules/calculation-rule-data-table.tsx`:
```tsx
<Badge variant={item.is_active ? 'default' : 'secondary'}>
  {item.is_active ? t('statusActive') : t('statusInactive')}
</Badge>
```

### Vacation Balance Remaining Badge

```tsx
function getRemainingBadgeClass(remaining: number): string {
  if (remaining > 5) return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
  if (remaining >= 1) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
  return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
}

<Badge variant="outline" className={getRemainingBadgeClass(remaining)}>
  {formatDecimal(remaining)}
</Badge>
```

**Pattern for vacation-config badges**: Create a config map like `DataTypeBadge` for each enum type:
- Special calculation type: `age`, `tenure`, `disability`
- Calculation group basis: `calendar_year`, `entry_date`
- Capping rule type: `year_end`, `mid_year`
- Exemption type: `full`, `partial`

## 8. Navigation Sidebar Structure

### Configuration File

`apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`:

```tsx
export interface NavItem {
  titleKey: string     // Translation key in 'nav' namespace
  href: string         // Navigation path
  icon: LucideIcon     // Lucide icon component
  roles?: UserRole[]   // Required roles (admin, etc.)
  badge?: number       // Optional badge count
}

export interface NavSection {
  titleKey: string
  roles?: UserRole[]
  items: NavItem[]
}

export const navConfig: NavSection[] = [
  {
    titleKey: 'main',       // Main section (all users)
    items: [
      { titleKey: 'dashboard', href: '/dashboard', icon: LayoutDashboard },
      { titleKey: 'vacation', href: '/vacation', icon: Palmtree },
      // ...
    ],
  },
  {
    titleKey: 'management',  // Management section (admin only)
    roles: ['admin'],
    items: [
      { titleKey: 'employees', href: '/admin/employees', icon: Users, roles: ['admin'] },
      { titleKey: 'vacationBalances', href: '/admin/vacation-balances', icon: Palmtree, roles: ['admin'] },
      // ... (currently ~20 items)
    ],
  },
  {
    titleKey: 'administration',  // Administration section
    roles: ['admin'],
    items: [
      { titleKey: 'settings', href: '/admin/settings', icon: Settings, roles: ['admin'] },
      // ...
    ],
  },
]
```

**To add vacation-config**: Add a new entry in the `management` section:
```tsx
{ titleKey: 'vacationConfig', href: '/admin/vacation-config', icon: Umbrella, roles: ['admin'] }
```

Note: `Umbrella` icon is not currently imported. Available icons from lucide-react need to be added to the import list.

### Breadcrumbs

`apps/web/src/components/layout/breadcrumbs.tsx` uses a `segmentToKey` map:

```tsx
const segmentToKey: Record<string, string> = {
  'vacation-balances': 'vacationBalances',
  'contact-types': 'contactTypes',
  // ...
}
```

**To add**: `'vacation-config': 'vacationConfig'`

## 9. Translation File Patterns and Namespace Conventions

### Translation File Location

- `apps/web/messages/en.json` - English translations
- `apps/web/messages/de.json` - German translations

### Namespace Conventions

Admin pages use `admin<EntityName>` as the translation namespace:
- `adminAccounts` - Accounts page
- `adminBookingTypes` - Booking types page
- `adminBookingTypeGroups` - Booking type groups (separate namespace)
- `adminCalculationRules` - Calculation rules page
- `adminContactTypes` - Contact types page
- `adminVacationBalances` - Vacation balances page

For tabbed pages with groups, each entity type gets its own namespace:
```tsx
const t = useTranslations('adminAccounts')
const tGroups = useTranslations('adminAccountGroups')
```

### Translation Key Structure

Standard keys in each namespace:
```json
{
  "adminAccounts": {
    "title": "Accounts",
    "subtitle": "Manage time tracking accounts...",
    "newAccount": "New Account",
    "searchPlaceholder": "Search by code or name...",
    "clearFilters": "Clear filters",
    "accountCount": "{count} account",
    "accountsCount": "{count} accounts",
    "deleteAccount": "Delete Account",
    "deleteDescription": "Are you sure you want to delete \"{name}\" ({code})?...",
    "delete": "Delete",
    "emptyTitle": "No accounts found",
    "emptyFilterHint": "Try adjusting your filters",
    "emptyGetStarted": "Get started by creating your first account",
    "addAccount": "Add Account",
    "tabAccounts": "Accounts",
    "tabGroups": "Groups",
    "columnCode": "Code",
    "columnName": "Name",
    "columnStatus": "Status",
    "fieldCode": "Code",
    "fieldName": "Name",
    "fieldDescription": "Description",
    "fieldActive": "Active",
    "fieldActiveDescription": "Inactive accounts are not used...",
    "create": "Create",
    "saveChanges": "Save Changes",
    "saving": "Saving...",
    "cancel": "Cancel",
    "close": "Close",
    "sectionBasicInfo": "Basic Information",
    "sectionStatus": "Status",
    "validationCodeRequired": "Code is required",
    "validationNameRequired": "Name is required",
    "failedCreate": "Failed to create account",
    "failedUpdate": "Failed to update account"
  }
}
```

### Nav Translations

Sidebar nav keys are in the `nav` namespace:
```json
{
  "nav": {
    "vacationBalances": "Vacation Balances",
    "calculationRules": "Calculation Rules"
  }
}
```

### Breadcrumb Translations

In the `breadcrumbs` namespace:
```json
{
  "breadcrumbs": {
    "vacationBalances": "Vacation Balances"
  }
}
```

**For vacation-config**, the ticket specifies namespace `vacation-config` with key groups: `page.*`, `tabs.*`, `special-calculations.*`, `calculation-groups.*`, `capping-rules.*`, `capping-rule-groups.*`, `exceptions.*`, `previews.*`. This differs from the existing convention of using separate namespaces per entity type. The implementation should follow whichever approach is decided.

## 10. Employee Selectors

### Single Employee Select (Vacation Balance Form)

`apps/web/src/components/vacation-balances/vacation-balance-form-sheet.tsx`:

```tsx
const { data: employeesData } = useEmployees({ limit: 200, active: true, enabled: open })
const employees = employeesData?.data ?? []

<Select
  value={form.employeeId || '__none__'}
  onValueChange={(value) =>
    setForm(prev => ({ ...prev, employeeId: value === '__none__' ? '' : value }))
  }
  disabled={isSubmitting || isEdit}
>
  <SelectTrigger>
    <SelectValue placeholder={t('selectEmployee')} />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="__none__">{t('selectEmployee')}</SelectItem>
    {employees.map(emp => (
      <SelectItem key={emp.id} value={emp.id}>
        {emp.personnel_number} - {emp.first_name} {emp.last_name}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

**Key details**:
- Uses `useEmployees({ limit: 200, active: true, enabled: open })` - fetches only when dialog is open
- Uses `'__none__'` sentinel value since Select doesn't support empty string
- Display format: `{personnel_number} - {first_name} {last_name}`
- Disabled when editing (employee can't be changed)

### Multi-Employee Select (Bulk Assign Dialog)

`apps/web/src/components/employee-day-plans/bulk-assign-dialog.tsx`:

```tsx
const [selectedEmployeeIds, setSelectedEmployeeIds] = React.useState<Set<string>>(new Set())
const [employeeSearch, setEmployeeSearch] = React.useState('')

const { data: employeesData } = useEmployees({ limit: 200, active: true, enabled: open })
const employees = employeesData?.data ?? []

const filteredEmployees = React.useMemo(() => {
  if (!employeeSearch) return employees
  const search = employeeSearch.toLowerCase()
  return employees.filter(e =>
    e.first_name.toLowerCase().includes(search) ||
    e.last_name.toLowerCase().includes(search) ||
    (e.personnel_number && e.personnel_number.toLowerCase().includes(search))
  )
}, [employees, employeeSearch])

// UI: SearchInput + ScrollArea with select-all + Checkbox list
// Display format: {last_name}, {first_name}
```

### Employee Multi-Select Popover (Reports Dialog)

```tsx
const { data: employeesData } = useEmployees({ limit: 200, enabled: open })
const employees = React.useMemo(() => {
  const items = employeesData?.data ?? []
  return items.map(e => ({
    id: e.id ?? '',
    label: `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim() || e.personnel_number,
  }))
}, [employeesData])

<MultiSelectPopover
  label={t('generate.employeeFilterLabel')}
  placeholder={t('generate.employeeFilterPlaceholder')}
  selectedIds={employeeIds}
  onSelectedIdsChange={setEmployeeIds}
  items={employees}
/>
```

### useEmployees Hook

`apps/web/src/hooks/api/use-employees.ts` (from export):
```tsx
export { useEmployees, useEmployee, useCreateEmployee, useUpdateEmployee, useDeleteEmployee, useBulkAssignTariff } from './use-employees'
```

## 11. Form Sheet Pattern Summary

### Standard Form Sheet Structure

All form sheets follow this exact structure (from `apps/web/src/components/calculation-rules/calculation-rule-form-sheet.tsx`):

```tsx
interface FormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entity?: EntityType | null   // null for create mode
  onSuccess?: () => void
}

export function EntityFormSheet({ open, onOpenChange, entity, onSuccess }: FormSheetProps) {
  const t = useTranslations('namespace')
  const isEdit = !!entity
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateEntity()
  const updateMutation = useUpdateEntity()

  // Reset form on open
  React.useEffect(() => {
    if (!open) return
    if (entity) { setForm(/* from entity */) } else { setForm(INITIAL_STATE) }
    setError(null)
  }, [open, entity])

  const handleSubmit = async () => {
    setError(null)
    // Validate
    // Try create/update
    // Catch and show error
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('edit') : t('new')}</SheetTitle>
          <SheetDescription>{isEdit ? t('editDescription') : t('createDescription')}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Form sections with h3 headers */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionName')}</h3>
              {/* Fields */}
            </div>

            {/* Conditional sections */}
            {isEdit && ( /* status section */ )}

            {/* Error alert */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting} className="flex-1">
            {t('cancel')}
          </Button>
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

## 12. Data Table Pattern Summary

From `apps/web/src/components/calculation-rules/calculation-rule-data-table.tsx`:

```tsx
interface DataTableProps {
  items: EntityType[]
  isLoading: boolean
  onView: (item: EntityType) => void
  onEdit: (item: EntityType) => void
  onDelete: (item: EntityType) => void
}

export function EntityDataTable({ items, isLoading, onView, onEdit, onDelete }: DataTableProps) {
  const t = useTranslations('namespace')

  if (isLoading) return <DataTableSkeleton />
  if (items.length === 0) return null

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24">{t('columnCode')}</TableHead>
          <TableHead>{t('columnName')}</TableHead>
          {/* More columns */}
          <TableHead className="w-16"><span className="sr-only">{t('actions')}</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map(item => (
          <TableRow key={item.id} className="cursor-pointer" onClick={() => onView(item)}>
            <TableCell className="font-mono text-sm">{item.code}</TableCell>
            <TableCell>{/* Name with icon */}</TableCell>
            {/* Badge columns */}
            <TableCell onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onView(item)}><Eye .../> View</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(item)}><Edit .../> Edit</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => onDelete(item)}><Trash2 .../> Delete</DropdownMenuItem>
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

## 13. ConfirmDialog Component

`apps/web/src/components/ui/confirm-dialog.tsx`:

```tsx
interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string       // default: 'Confirm'
  cancelLabel?: string        // default: 'Cancel'
  variant?: 'default' | 'destructive'
  isLoading?: boolean
  onConfirm: () => void | Promise<void>
}
```

Uses `Sheet` with `side="bottom"` (not a Dialog). Shows `AlertTriangle` icon for destructive variant. Does NOT auto-close on confirm - parent controls closing.

## 14. Component File Organization

Components are grouped in folders by feature:
```
apps/web/src/components/
  calculation-rules/
    calculation-rule-data-table.tsx
    calculation-rule-form-sheet.tsx
    calculation-rule-detail-sheet.tsx
    index.ts  (barrel export)
  booking-type-groups/
    booking-type-group-data-table.tsx
    booking-type-group-form-sheet.tsx
    index.ts
  contact-types/
    contact-type-skeleton.tsx
    contact-type-list-panel.tsx
    contact-kind-list-panel.tsx
    contact-type-form-sheet.tsx
    contact-kind-form-sheet.tsx
    data-type-badge.tsx
    index.ts
  vacation-balances/
    vacation-balance-data-table.tsx
    vacation-balance-form-sheet.tsx
    vacation-balance-detail-sheet.tsx
    vacation-balance-toolbar.tsx
    initialize-year-dialog.tsx
    index.ts
```

**For vacation-config**, the ticket specifies a single folder:
```
apps/web/src/components/vacation-config/
  special-calculations-tab.tsx
  calculation-groups-tab.tsx
  capping-rules-tab.tsx
  capping-rule-groups-tab.tsx
  employee-exceptions-tab.tsx
  vacation-previews-tab.tsx
  index.ts
```

Each tab component would encapsulate its own data table, form sheet, and delete dialog, keeping the page file thin.

## 15. Type Imports

All components import API types from the generated OpenAPI types:
```tsx
import type { components } from '@/lib/api/types'

type CalculationRule = components['schemas']['CalculationRule']
```

The types file is generated by `make generate` from the bundled OpenAPI spec at `api/openapi.bundled.yaml`.

## 16. Auth Guard Pattern

Every admin page follows this exact auth guard:
```tsx
const router = useRouter()
const { isLoading: authLoading } = useAuth()
const isAdmin = useHasRole(['admin'])

React.useEffect(() => {
  if (!authLoading && !isAdmin) {
    router.push('/dashboard')
  }
}, [authLoading, isAdmin, router])

if (authLoading) return <PageSkeleton />
if (!isAdmin) return null
```
