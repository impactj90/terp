# Implementation Plan: ZMI-TICKET-049 - Vacation Balance Admin UI

**Date:** 2026-02-03
**Ticket:** thoughts/shared/tickets/ZMI-TICKET-049-vacation-balance-admin-ui.md
**Research:** thoughts/shared/research/2026-02-03-ZMI-TICKET-049-vacation-balance-admin-ui.md

## Success Criteria (from ticket)

- Admin can view vacation balances for all employees for a selected year
- Admin can initialize a year to create balances for all active employees
- Admin can manually create a balance for a specific employee/year
- Admin can edit balance fields (entitlement, adjustments, carryover)
- Duplicate employee/year shows clear 409 error
- Remaining days are color-coded for quick visual assessment
- Department and year filters work correctly

---

## Phase 1: API Hooks (`use-vacation-balances.ts`)

**Goal:** Add mutation hooks (create, update, initialize) to the existing read-only hook file.

### Files to modify

1. **`/home/tolga/projects/terp/apps/web/src/hooks/api/use-vacation-balance.ts`**
   - Add `useApiMutation` import alongside existing `useApiQuery` import
   - Add three new mutation hooks after the existing query hooks:

   ```typescript
   export function useCreateVacationBalance() {
     return useApiMutation('/vacation-balances', 'post', {
       invalidateKeys: [['/vacation-balances'], ['/employees']],
     })
   }

   export function useUpdateVacationBalance() {
     return useApiMutation('/vacation-balances/{id}', 'patch', {
       invalidateKeys: [['/vacation-balances'], ['/employees']],
     })
   }

   export function useInitializeVacationBalances() {
     return useApiMutation('/vacation-balances/initialize', 'post', {
       invalidateKeys: [['/vacation-balances']],
     })
   }
   ```

   **Pattern reference:** Follow `/home/tolga/projects/terp/apps/web/src/hooks/api/use-employee-day-plans.ts` lines 72-76 for the mutation hook pattern with `useApiMutation` and `invalidateKeys`.

2. **`/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts`**
   - Update the vacation balances export block (currently lines 49-54) to include the three new hooks:

   ```typescript
   export {
     useVacationBalances,
     useVacationBalance,
     useEmployeeVacationBalance,
     useCreateVacationBalance,
     useUpdateVacationBalance,
     useInitializeVacationBalances,
   } from './use-vacation-balance'
   ```

### Verification

- Run `cd /home/tolga/projects/terp/apps/web && npx tsc --noEmit` to verify TypeScript compilation
- Confirm the mutation hooks are correctly typed by checking that the path strings match entries in the OpenAPI types at `/home/tolga/projects/terp/apps/web/src/lib/api/types.ts`

---

## Phase 2: Data Table Component

**Goal:** Create a table component displaying vacation balances with all required columns.

### Files to create

1. **`/home/tolga/projects/terp/apps/web/src/components/vacation-balances/vacation-balance-data-table.tsx`**

   **Pattern reference:** Follow `/home/tolga/projects/terp/apps/web/src/components/employees/employee-data-table.tsx` for the full Table structure, dropdown menu actions, skeleton loading, and empty state handling.

   **Component interface:**
   ```typescript
   import type { components } from '@/lib/api/types'
   type VacationBalance = components['schemas']['VacationBalance']

   interface VacationBalanceDataTableProps {
     balances: VacationBalance[]
     isLoading: boolean
     onView: (balance: VacationBalance) => void
     onEdit: (balance: VacationBalance) => void
   }
   ```

   **Columns (from ticket):**
   - Employee Name (`employee?.first_name + employee?.last_name`) -- show initials avatar like employee-data-table.tsx line 147-150
   - Personnel Number (`employee?.personnel_number`) -- monospace like employee-data-table.tsx line 142-143
   - Year (`year`)
   - Base Entitlement (`base_entitlement`) -- 1 decimal format
   - Additional (`additional_entitlement`) -- 1 decimal format
   - Carryover (`carryover_from_previous`) -- 1 decimal format
   - Manual Adj. (`manual_adjustment`) -- 1 decimal format
   - Total Entitlement (`total_entitlement`) -- 1 decimal, bold
   - Used (`used_days`) -- 1 decimal format
   - Planned (`planned_days`) -- 1 decimal format
   - Remaining (`remaining_days`) -- color-coded Badge (green >5, yellow 1-5, red <=0)
   - Actions -- DropdownMenu with View Detail and Edit (pattern from employee-data-table.tsx lines 170-200)

   **Key details:**
   - Use `value?.toFixed(1) ?? '0.0'` for decimal formatting
   - Row click triggers `onView(balance)` (like employee-data-table.tsx line 133)
   - Actions column click must call `e.stopPropagation()` (like employee-data-table.tsx line 170)
   - Remaining days color badge:
     ```typescript
     function getRemainingBadgeVariant(remaining: number): 'default' | 'secondary' | 'destructive' {
       if (remaining > 5) return 'default'    // green
       if (remaining > 0) return 'secondary'  // yellow
       return 'destructive'                    // red
     }
     ```
   - Include a skeleton sub-component `VacationBalanceDataTableSkeleton` (pattern from employee-data-table.tsx lines 209-273)

   **Imports needed:**
   ```typescript
   import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
   import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
   import { Badge } from '@/components/ui/badge'
   import { Button } from '@/components/ui/button'
   import { Skeleton } from '@/components/ui/skeleton'
   import { MoreHorizontal, Eye, Edit } from 'lucide-react'
   ```

### Verification

- TypeScript compiles without errors
- Decimal formatting shows 1 decimal place for all numeric columns
- Badge color coding logic is correct for green (>5), yellow (1-5), red (<=0)

---

## Phase 3: Form Sheet (Create/Edit)

**Goal:** Create a sheet form for creating and editing vacation balances.

### Files to create

1. **`/home/tolga/projects/terp/apps/web/src/components/vacation-balances/vacation-balance-form-sheet.tsx`**

   **Pattern reference:** Follow `/home/tolga/projects/terp/apps/web/src/components/users/user-form-sheet.tsx` for the complete Sheet form pattern including:
   - Props interface with `open`, `onOpenChange`, `balance` (optional for edit), `onSuccess`
   - `isEdit = !!balance` check
   - `FormState` interface and `INITIAL_STATE` constant
   - `useEffect` to reset form on open/close (lines 124-150)
   - `handleSubmit` with try/catch and error handling (lines 152-218)
   - Sheet layout with ScrollArea, SheetHeader, SheetFooter (lines 237-599)

   **Component interface:**
   ```typescript
   interface VacationBalanceFormSheetProps {
     open: boolean
     onOpenChange: (open: boolean) => void
     balance?: VacationBalance | null
     onSuccess?: () => void
   }
   ```

   **FormState:**
   ```typescript
   interface FormState {
     employeeId: string
     year: number
     baseEntitlement: string     // string for decimal input handling
     additionalEntitlement: string
     carryoverFromPrevious: string
     manualAdjustment: string
     carryoverToNext: string
     carryoverExpiresAt: string  // ISO date string
   }
   ```

   **Form fields (from ticket):**
   - Employee: `Select` from `useEmployees({ limit: 200, active: true, enabled: open })` -- required on create, disabled on edit. Follow user-form-sheet.tsx lines 357-381 for employee select pattern.
   - Year: `Input` type="number" -- required on create, disabled on edit. Default to current year.
   - Base Entitlement: `Input` type="number" step="0.5" -- required.
   - Additional Entitlement: `Input` type="number" step="0.5" -- default 0.
   - Carryover from Previous Year: `Input` type="number" step="0.5" -- default 0.
   - Manual Adjustment: `Input` type="number" step="0.5" -- default 0 (can be negative).
   - Carryover to Next Year: `Input` type="number" step="0.5" -- optional, edit only.
   - Carryover Expires At: `Input` type="date" -- optional.

   **Calculated preview (read-only display):**
   ```typescript
   const totalPreview = parseFloat(form.baseEntitlement || '0')
     + parseFloat(form.additionalEntitlement || '0')
     + parseFloat(form.carryoverFromPrevious || '0')
     + parseFloat(form.manualAdjustment || '0')
   ```
   Display in a muted card-like area below the fields:
   ```html
   <div className="rounded-lg border bg-muted/50 p-4">
     <div className="flex justify-between text-sm">
       <span className="text-muted-foreground">{t('totalEntitlementPreview')}</span>
       <span className="font-medium">{totalPreview.toFixed(1)}</span>
     </div>
   </div>
   ```

   **Submit logic:**
   - Create: `useCreateVacationBalance().mutateAsync({ body: { employee_id, year, base_entitlement, ... } })`
   - Update: `useUpdateVacationBalance().mutateAsync({ path: { id }, body: { base_entitlement, ... } })`
   - 409 error handling: Catch error, check for 409/duplicate message, show inline `Alert variant="destructive"` with t('errorDuplicate') -- "Balance already exists for this employee and year"
   - Generic error: `apiError.detail ?? apiError.message ?? t('failedCreate'|'failedUpdate')` (pattern from user-form-sheet.tsx lines 213-217)

   **Reset on edit:**
   ```typescript
   React.useEffect(() => {
     if (!open) return
     if (balance) {
       setForm({
         employeeId: balance.employee_id,
         year: balance.year,
         baseEntitlement: String(balance.base_entitlement ?? 0),
         additionalEntitlement: String(balance.additional_entitlement ?? 0),
         carryoverFromPrevious: String(balance.carryover_from_previous ?? 0),
         manualAdjustment: String(balance.manual_adjustment ?? 0),
         carryoverToNext: String(balance.carryover_to_next ?? ''),
         carryoverExpiresAt: balance.carryover_expires_at ?? '',
       })
     } else {
       setForm(INITIAL_STATE)
     }
     setError(null)
   }, [open, balance])
   ```

### Verification

- Form shows Employee and Year as disabled when editing
- Total preview calculates correctly in real-time as inputs change
- 409 duplicate error displays inline
- Form resets correctly when switching between create and edit modes

---

## Phase 4: Detail Sheet

**Goal:** Create a read-only detail sheet showing full balance breakdown.

### Files to create

1. **`/home/tolga/projects/terp/apps/web/src/components/vacation-balances/vacation-balance-detail-sheet.tsx`**

   **Pattern reference:** Follow `/home/tolga/projects/terp/apps/web/src/components/absences/absence-detail-sheet.tsx` for:
   - Props interface with `balance`, `open`, `onOpenChange`, `onEdit`
   - `DetailRow` helper component (lines 38-45)
   - Section layout with `rounded-lg border p-4` cards (lines 148-179)
   - Footer with Close and Edit buttons (lines 200-231)

   **Also reference:** `/home/tolga/projects/terp/apps/web/src/components/vacation/balance-breakdown.tsx` for the visual bar and breakdown row pattern (lines 30-72 for BreakdownRow, lines 161-189 for progress bar).

   **Component interface:**
   ```typescript
   interface VacationBalanceDetailSheetProps {
     balance: VacationBalance | null
     open: boolean
     onOpenChange: (open: boolean) => void
     onEdit: (balance: VacationBalance) => void
   }
   ```

   **Sections (from ticket):**

   a) **Header** -- Employee name and year as SheetTitle

   b) **Entitlement Breakdown section:**
   - DetailRow: Base Entitlement
   - DetailRow: Additional Entitlement
   - DetailRow: Carryover from Previous
   - DetailRow: Manual Adjustment
   - DetailRow: Total Entitlement (bold/highlighted)

   c) **Usage section:**
   - Visual bar chart: stacked progress bar (green=used, yellow=planned, remaining=muted) -- reuse the pattern from balance-breakdown.tsx lines 161-189
   - DetailRow: Used Days
   - DetailRow: Planned Days
   - DetailRow: Remaining Days -- with color-coded Badge (green/yellow/red)

   d) **Carryover section:**
   - DetailRow: Carryover to Next Year
   - DetailRow: Carryover Expires At (formatted date)

   e) **Timestamps section:**
   - DetailRow: Created At (format: dd.MM.yyyy HH:mm)
   - DetailRow: Updated At (format: dd.MM.yyyy HH:mm)

   **Footer buttons:**
   - Close (variant="outline", flex-1)
   - Edit (variant="outline", with Edit icon)

### Verification

- Progress bar renders correctly with green/yellow proportions
- All decimal values display with 1 decimal place
- Remaining days Badge has correct color coding
- Timestamps format correctly using `date-fns` `format`

---

## Phase 5: Initialize Year Dialog

**Goal:** Create a dialog for bulk initialization of vacation balances for a year.

### Files to create

1. **`/home/tolga/projects/terp/apps/web/src/components/vacation-balances/initialize-year-dialog.tsx`**

   **Pattern reference:** Follow `/home/tolga/projects/terp/apps/web/src/components/employee-day-plans/bulk-assign-dialog.tsx` for:
   - Dialog component structure with DialogContent, DialogHeader, DialogFooter (lines 192-367)
   - Form with `handleSubmit` and error state (lines 143-189)
   - Result display after successful operation (lines 329-338)
   - Reset state on open via useEffect (lines 91-102)

   **Component interface:**
   ```typescript
   interface InitializeYearDialogProps {
     open: boolean
     onOpenChange: (open: boolean) => void
     onSuccess?: () => void
   }
   ```

   **State:**
   ```typescript
   const [year, setYear] = React.useState(new Date().getFullYear())
   const [carryover, setCarryover] = React.useState(true)
   const [result, setResult] = React.useState<{ message: string; createdCount: number } | null>(null)
   const [error, setError] = React.useState<string | null>(null)
   ```

   **Form fields:**
   - Year: `Input` type="number" -- required, default current year
   - Carryover from previous year: `Checkbox` -- default checked (true)

   **Info text:**
   Display an informational Alert below the fields:
   ```html
   <Alert>
     <AlertDescription>
       {t('initializeInfo', { year })}
     </AlertDescription>
   </Alert>
   ```
   Translation: "This will create vacation balances for all active employees for {year}. Existing balances will not be overwritten."

   **Submit logic:**
   ```typescript
   const initializeMutation = useInitializeVacationBalances()

   const handleSubmit = async () => {
     setError(null)
     setResult(null)
     try {
       const response = await initializeMutation.mutateAsync({
         body: { year, carryover },
       })
       const data = response as { message?: string; created_count?: number }
       setResult({
         message: data.message ?? '',
         createdCount: data.created_count ?? 0,
       })
       // Auto-close after brief delay
       setTimeout(() => {
         onOpenChange(false)
         onSuccess?.()
       }, 2000)
     } catch (err) {
       const apiError = err as { detail?: string; message?: string }
       setError(apiError.detail ?? apiError.message ?? t('initializeError'))
     }
   }
   ```

   **Result display:**
   ```html
   <Alert>
     <AlertDescription>
       {t('initializeSuccess', { count: result.createdCount, year })}
     </AlertDescription>
   </Alert>
   ```
   Translation: "Created {count} vacation balances for {year}"

### Verification

- Dialog resets state when opened
- Year defaults to current year
- Carryover checkbox defaults to checked
- Success message shows created count
- Dialog auto-closes after successful initialization

---

## Phase 6: Toolbar with Filters

**Goal:** Create a toolbar component with year selector, department filter, search, and action buttons.

### Files to create

1. **`/home/tolga/projects/terp/apps/web/src/components/vacation-balances/vacation-balance-toolbar.tsx`**

   **Pattern reference:** Follow `/home/tolga/projects/terp/apps/web/src/components/employee-day-plans/day-plan-grid-toolbar.tsx` for:
   - Props interface with filter values and callbacks (lines 19-33)
   - Layout with `flex flex-wrap items-center gap-2` (line 114)
   - Department Select filter (lines 184-201)
   - SearchInput (lines 177-183)
   - Action buttons (lines 203-218)
   - Spacer `<div className="flex-1" />` (line 174)

   **Component interface:**
   ```typescript
   interface VacationBalanceToolbarProps {
     year: number
     onYearChange: (year: number) => void
     departmentId: string | undefined
     onDepartmentChange: (id: string | undefined) => void
     departments: Array<{ id: string; name: string }>
     search: string
     onSearchChange: (search: string) => void
     onInitializeYear: () => void
     onCreateBalance: () => void
   }
   ```

   **Layout (left to right):**
   1. Year selector: `Select` dropdown with year options (current year -2 to current year +1)
      ```typescript
      const currentYear = new Date().getFullYear()
      const yearOptions = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1]
      ```
   2. Spacer: `<div className="flex-1" />`
   3. SearchInput (employee search) -- placeholder from translations
   4. Department filter: `Select` with "All Departments" default (pattern from day-plan-grid-toolbar.tsx lines 184-201)
   5. "Initialize Year" Button (variant="outline") with CalendarPlus icon
   6. "Create Balance" Button (default variant) with Plus icon

### Verification

- Year selector shows 4 years centered around current year
- Department filter includes "All" option
- Search input has proper placeholder text
- Both action buttons render with icons

---

## Phase 7: Page Component and Skeleton

**Goal:** Create the admin page component that wires together all sub-components.

### Files to create

1. **`/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/admin/vacation-balances/page.tsx`**

   **Pattern reference:** Follow `/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/admin/users/page.tsx` for the overall page structure:
   - Auth check with redirect (lines 52-86)
   - Filter state (lines 60-61)
   - Dialog/sheet state (lines 64-68)
   - Data fetching (lines 70-78)
   - Skeleton while loading (lines 127-133)
   - Page header with title/subtitle and create button (lines 137-146)
   - Card with data/empty state (lines 164-282)
   - Sheet/dialog components (lines 284-314)

   Also follow `/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/admin/employee-day-plans/page.tsx` for the toolbar integration (lines 157-171).

   **Component structure:**
   ```typescript
   'use client'

   export default function AdminVacationBalancesPage() {
     const router = useRouter()
     const { isLoading: authLoading } = useAuth()
     const isAdmin = useHasRole(['admin'])
     const t = useTranslations('adminVacationBalances')

     // Filter state
     const [year, setYear] = React.useState(new Date().getFullYear())
     const [departmentId, setDepartmentId] = React.useState<string | undefined>(undefined)
     const [search, setSearch] = React.useState('')

     // Sheet/dialog state
     const [createOpen, setCreateOpen] = React.useState(false)
     const [editBalance, setEditBalance] = React.useState<VacationBalance | null>(null)
     const [viewBalance, setViewBalance] = React.useState<VacationBalance | null>(null)
     const [initializeOpen, setInitializeOpen] = React.useState(false)

     // Auth redirect
     React.useEffect(() => {
       if (!authLoading && !isAdmin) router.push('/dashboard')
     }, [authLoading, isAdmin, router])

     // Data fetching
     const { data: balancesData, isLoading } = useVacationBalances({
       year,
       departmentId,
       enabled: !authLoading && isAdmin,
     })
     const balances = balancesData?.data ?? []

     // Client-side search filter on employee name
     const filteredBalances = React.useMemo(() => {
       if (!search) return balances
       const q = search.toLowerCase()
       return balances.filter((b) => {
         const name = `${b.employee?.first_name ?? ''} ${b.employee?.last_name ?? ''} ${b.employee?.personnel_number ?? ''}`.toLowerCase()
         return name.includes(q)
       })
     }, [balances, search])

     const { data: departmentsData } = useDepartments({
       active: true,
       enabled: !authLoading && isAdmin,
     })
     const departments = (departmentsData?.data ?? []).map((d) => ({ id: d.id, name: d.name }))

     if (authLoading) return <VacationBalancesPageSkeleton />
     if (!isAdmin) return null

     return (
       <div className="space-y-6">
         {/* Page header */}
         <div>
           <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
           <p className="text-muted-foreground">{t('subtitle')}</p>
         </div>

         {/* Toolbar */}
         <VacationBalanceToolbar ... />

         {/* Data table */}
         <Card>
           <CardContent className="p-0">
             {isLoading ? (
               <VacationBalanceDataTableSkeleton />
             ) : filteredBalances.length === 0 ? (
               <EmptyState year={year} onInitialize={() => setInitializeOpen(true)} />
             ) : (
               <VacationBalanceDataTable
                 balances={filteredBalances}
                 isLoading={false}
                 onView={setViewBalance}
                 onEdit={setEditBalance}
               />
             )}
           </CardContent>
         </Card>

         {/* Form sheet */}
         <VacationBalanceFormSheet
           open={createOpen || !!editBalance}
           onOpenChange={(open) => { if (!open) { setCreateOpen(false); setEditBalance(null) } }}
           balance={editBalance}
           onSuccess={() => { setCreateOpen(false); setEditBalance(null) }}
         />

         {/* Detail sheet */}
         <VacationBalanceDetailSheet
           balance={viewBalance}
           open={!!viewBalance}
           onOpenChange={(open) => { if (!open) setViewBalance(null) }}
           onEdit={(b) => { setViewBalance(null); setEditBalance(b) }}
         />

         {/* Initialize dialog */}
         <InitializeYearDialog
           open={initializeOpen}
           onOpenChange={setInitializeOpen}
         />
       </div>
     )
   }
   ```

   **Empty state component** (defined in same file):
   ```typescript
   function EmptyState({ year, onInitialize }: { year: number; onInitialize: () => void }) {
     const t = useTranslations('adminVacationBalances')
     return (
       <div className="text-center py-12 px-6">
         <Palmtree className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
         <h3 className="mt-4 text-lg font-medium">{t('emptyTitle')}</h3>
         <p className="text-sm text-muted-foreground">
           {t('emptyDescription', { year })}
         </p>
         <Button className="mt-4" onClick={onInitialize}>
           {t('initializeYearButton')}
         </Button>
       </div>
     )
   }
   ```
   Translation: "No vacation balances for {year}. Use 'Initialize Year' to create balances for all employees."

   **Skeleton component** (defined in same file):
   Follow the pattern from `/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/admin/users/page.tsx` lines 332-348:
   ```typescript
   function VacationBalancesPageSkeleton() {
     return (
       <div className="space-y-6">
         <div className="space-y-2">
           <Skeleton className="h-8 w-48" />
           <Skeleton className="h-4 w-80" />
         </div>
         <div className="flex flex-wrap items-center gap-4">
           <Skeleton className="h-9 w-32" />
           <div className="flex-1" />
           <Skeleton className="h-9 w-56" />
           <Skeleton className="h-9 w-40" />
           <Skeleton className="h-9 w-36" />
           <Skeleton className="h-9 w-36" />
         </div>
         <Skeleton className="h-[400px]" />
       </div>
     )
   }
   ```

### Verification

- Page redirects non-admin users to /dashboard
- Year filter changes trigger re-fetch of balances
- Department filter works correctly
- Employee search filters client-side on name/personnel number
- Empty state shows with initialize prompt when no balances exist
- All sheets/dialogs open and close correctly
- Edit from detail sheet transitions correctly (closes detail, opens form with balance data)

---

## Phase 8: Navigation, Breadcrumbs, Translations

**Goal:** Wire up sidebar navigation, breadcrumbs, and all required translations.

### Files to modify

1. **`/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`**

   Add a new entry to the `management` section items array (after the existing `monthlyValues` entry at line 204):
   ```typescript
   {
     titleKey: 'vacationBalances',
     href: '/admin/vacation-balances',
     icon: Palmtree,
     roles: ['admin'],
   },
   ```
   Note: `Palmtree` is already imported at line 18.

2. **`/home/tolga/projects/terp/apps/web/src/components/layout/breadcrumbs.tsx`**

   Add to the `segmentToKey` mapping (after `'monthly-evaluations': 'monthlyEvaluations'` at line 54):
   ```typescript
   'vacation-balances': 'vacationBalances',
   ```

3. **`/home/tolga/projects/terp/apps/web/messages/en.json`**

   a) Add to `nav` object (after `"monthlyEvaluations"` key):
   ```json
   "vacationBalances": "Vacation Balances"
   ```

   b) Add to `breadcrumbs` object (after `"monthlyEvaluations"` key):
   ```json
   "vacationBalances": "Vacation Balances"
   ```

   c) Add new `adminVacationBalances` namespace (after existing `adminUsers` block):
   ```json
   "adminVacationBalances": {
     "title": "Vacation Balances",
     "subtitle": "Manage employee vacation entitlements and balances",

     "searchPlaceholder": "Search employees...",
     "allDepartments": "All Departments",
     "yearLabel": "Year",

     "newBalance": "Create Balance",
     "editBalance": "Edit Balance",
     "viewDetails": "View Details",

     "columnEmployee": "Employee",
     "columnPersonnelNumber": "Pers. No.",
     "columnYear": "Year",
     "columnBaseEntitlement": "Base",
     "columnAdditionalEntitlement": "Additional",
     "columnCarryover": "Carryover",
     "columnManualAdjustment": "Adjustment",
     "columnTotalEntitlement": "Total",
     "columnUsedDays": "Used",
     "columnPlannedDays": "Planned",
     "columnRemainingDays": "Remaining",
     "columnActions": "Actions",

     "formTitle": "Vacation Balance",
     "createDescription": "Create a new vacation balance for an employee",
     "editDescription": "Update vacation balance details",
     "fieldEmployee": "Employee",
     "fieldYear": "Year",
     "fieldBaseEntitlement": "Base Entitlement",
     "fieldAdditionalEntitlement": "Additional Entitlement",
     "fieldCarryoverFromPrevious": "Carryover from Previous Year",
     "fieldManualAdjustment": "Manual Adjustment",
     "fieldCarryoverToNext": "Carryover to Next Year",
     "fieldCarryoverExpiresAt": "Carryover Expires At",
     "selectEmployee": "Select employee",
     "totalEntitlementPreview": "Total Entitlement",
     "saving": "Saving...",
     "saveChanges": "Save Changes",
     "createBalance": "Create Balance",
     "failedCreate": "Failed to create vacation balance",
     "failedUpdate": "Failed to update vacation balance",
     "errorDuplicate": "A vacation balance already exists for this employee and year",

     "detailTitle": "Vacation Balance Details",
     "detailDescription": "View vacation balance breakdown",
     "sectionEntitlement": "Entitlement Breakdown",
     "sectionUsage": "Usage",
     "sectionCarryover": "Carryover",
     "sectionTimestamps": "Timestamps",
     "labelBaseEntitlement": "Base Entitlement",
     "labelAdditionalEntitlement": "Additional Entitlement",
     "labelCarryoverFromPrevious": "Carryover from Previous Year",
     "labelManualAdjustment": "Manual Adjustment",
     "labelTotalEntitlement": "Total Entitlement",
     "labelUsedDays": "Used Days",
     "labelPlannedDays": "Planned Days",
     "labelRemainingDays": "Remaining Days",
     "labelCarryoverToNext": "Carryover to Next Year",
     "labelCarryoverExpiresAt": "Carryover Expires At",
     "labelCreatedAt": "Created",
     "labelUpdatedAt": "Last Updated",
     "notSet": "Not set",
     "days": "{value} days",

     "initializeYearButton": "Initialize Year",
     "initializeTitle": "Initialize Vacation Balances",
     "initializeDescription": "Create vacation balances for all active employees",
     "initializeYear": "Year",
     "initializeCarryover": "Carry over from previous year",
     "initializeInfo": "This will create vacation balances for all active employees for {year}. Existing balances will not be overwritten.",
     "initializeConfirm": "Initialize",
     "initializeSuccess": "Created {count} vacation balances for {year}",
     "initializeError": "Failed to initialize vacation balances",

     "emptyTitle": "No Vacation Balances",
     "emptyDescription": "No vacation balances for {year}. Use 'Initialize Year' to create balances for all employees.",
     "emptyFilterHint": "Try adjusting your filters"
   }
   ```

4. **`/home/tolga/projects/terp/apps/web/messages/de.json`**

   a) Add to `nav` object:
   ```json
   "vacationBalances": "Urlaubskonten"
   ```

   b) Add to `breadcrumbs` object:
   ```json
   "vacationBalances": "Urlaubskonten"
   ```

   c) Add new `adminVacationBalances` namespace:
   ```json
   "adminVacationBalances": {
     "title": "Urlaubskonten",
     "subtitle": "Urlaubsansprüche und Salden der Mitarbeiter verwalten",

     "searchPlaceholder": "Mitarbeiter suchen...",
     "allDepartments": "Alle Abteilungen",
     "yearLabel": "Jahr",

     "newBalance": "Konto erstellen",
     "editBalance": "Konto bearbeiten",
     "viewDetails": "Details anzeigen",

     "columnEmployee": "Mitarbeiter",
     "columnPersonnelNumber": "Pers.-Nr.",
     "columnYear": "Jahr",
     "columnBaseEntitlement": "Grundanspruch",
     "columnAdditionalEntitlement": "Zusätzlich",
     "columnCarryover": "Übertrag",
     "columnManualAdjustment": "Korrektur",
     "columnTotalEntitlement": "Gesamt",
     "columnUsedDays": "Genommen",
     "columnPlannedDays": "Geplant",
     "columnRemainingDays": "Restanspruch",
     "columnActions": "Aktionen",

     "formTitle": "Urlaubskonto",
     "createDescription": "Neues Urlaubskonto für einen Mitarbeiter erstellen",
     "editDescription": "Urlaubskonto bearbeiten",
     "fieldEmployee": "Mitarbeiter",
     "fieldYear": "Jahr",
     "fieldBaseEntitlement": "Grundanspruch",
     "fieldAdditionalEntitlement": "Zusätzlicher Anspruch",
     "fieldCarryoverFromPrevious": "Übertrag aus Vorjahr",
     "fieldManualAdjustment": "Manuelle Korrektur",
     "fieldCarryoverToNext": "Übertrag ins Folgejahr",
     "fieldCarryoverExpiresAt": "Übertrag verfällt am",
     "selectEmployee": "Mitarbeiter auswählen",
     "totalEntitlementPreview": "Gesamtanspruch",
     "saving": "Speichern...",
     "saveChanges": "Änderungen speichern",
     "createBalance": "Konto erstellen",
     "failedCreate": "Fehler beim Erstellen des Urlaubskontos",
     "failedUpdate": "Fehler beim Aktualisieren des Urlaubskontos",
     "errorDuplicate": "Für diesen Mitarbeiter und dieses Jahr existiert bereits ein Urlaubskonto",

     "detailTitle": "Urlaubskonto Details",
     "detailDescription": "Urlaubskonto-Aufschlüsselung anzeigen",
     "sectionEntitlement": "Anspruchs-Aufschlüsselung",
     "sectionUsage": "Nutzung",
     "sectionCarryover": "Übertrag",
     "sectionTimestamps": "Zeitstempel",
     "labelBaseEntitlement": "Grundanspruch",
     "labelAdditionalEntitlement": "Zusätzlicher Anspruch",
     "labelCarryoverFromPrevious": "Übertrag aus Vorjahr",
     "labelManualAdjustment": "Manuelle Korrektur",
     "labelTotalEntitlement": "Gesamtanspruch",
     "labelUsedDays": "Genommene Tage",
     "labelPlannedDays": "Geplante Tage",
     "labelRemainingDays": "Verbleibende Tage",
     "labelCarryoverToNext": "Übertrag ins Folgejahr",
     "labelCarryoverExpiresAt": "Übertrag verfällt am",
     "labelCreatedAt": "Erstellt",
     "labelUpdatedAt": "Zuletzt aktualisiert",
     "notSet": "Nicht gesetzt",
     "days": "{value} Tage",

     "initializeYearButton": "Jahr initialisieren",
     "initializeTitle": "Urlaubskonten initialisieren",
     "initializeDescription": "Urlaubskonten für alle aktiven Mitarbeiter erstellen",
     "initializeYear": "Jahr",
     "initializeCarryover": "Übertrag aus Vorjahr übernehmen",
     "initializeInfo": "Es werden Urlaubskonten für alle aktiven Mitarbeiter für {year} erstellt. Bestehende Konten werden nicht überschrieben.",
     "initializeConfirm": "Initialisieren",
     "initializeSuccess": "{count} Urlaubskonten für {year} erstellt",
     "initializeError": "Fehler beim Initialisieren der Urlaubskonten",

     "emptyTitle": "Keine Urlaubskonten",
     "emptyDescription": "Keine Urlaubskonten für {year}. Verwenden Sie 'Jahr initialisieren', um Konten für alle Mitarbeiter zu erstellen.",
     "emptyFilterHint": "Versuchen Sie, Ihre Filter anzupassen"
   }
   ```

### Verification

- Sidebar shows "Vacation Balances" / "Urlaubskonten" entry in the Management section (only for admin role)
- Breadcrumbs render correctly when navigating to `/admin/vacation-balances`
- All translation keys render in both English and German without missing key warnings
- Icon (Palmtree) renders correctly in the sidebar

---

## Phase 9: Integration and Verification

**Goal:** Verify all components work together end-to-end.

### Verification steps

1. **TypeScript compilation:**
   ```bash
   cd /home/tolga/projects/terp/apps/web && npx tsc --noEmit
   ```
   - All new files must compile without errors

2. **Build check:**
   ```bash
   cd /home/tolga/projects/terp/apps/web && npm run build
   ```
   - Next.js build must succeed (catches SSR issues, missing exports)

3. **Navigation flow:**
   - Verify sidebar entry navigates to `/admin/vacation-balances`
   - Verify breadcrumbs show: Home > Administration > Vacation Balances
   - Verify non-admin users are redirected to `/dashboard`

4. **CRUD flow (manual testing with running dev server):**
   a) Navigate to the page -- should show empty state for current year
   b) Click "Initialize Year" -- dialog should open, submit should create balances
   c) Verify balances appear in the table after initialization
   d) Click a row to open detail sheet -- verify breakdown shows correctly
   e) Click "Edit" in detail sheet -- form should open pre-filled with balance data
   f) Change base entitlement -- verify total preview updates
   g) Save -- verify table updates
   h) Click "Create Balance" -- form should open empty
   i) Select an employee/year that already exists -- submit should show 409 error
   j) Select a new employee/year -- submit should succeed
   k) Change year filter -- verify table reloads with different year's data
   l) Change department filter -- verify table filters correctly
   m) Type in search -- verify client-side filtering by employee name

5. **Visual checks:**
   - Remaining days color coding: verify green (>5), yellow (1-5), red (<=0) badges
   - Decimal formatting: all numeric values show 1 decimal place
   - Progress bar in detail sheet: verify proportions of used/planned/remaining
   - Responsive layout: verify toolbar wraps correctly on narrow screens

---

## File Summary

### New files (6 files)

| File | Phase |
|------|-------|
| `apps/web/src/components/vacation-balances/vacation-balance-data-table.tsx` | Phase 2 |
| `apps/web/src/components/vacation-balances/vacation-balance-form-sheet.tsx` | Phase 3 |
| `apps/web/src/components/vacation-balances/vacation-balance-detail-sheet.tsx` | Phase 4 |
| `apps/web/src/components/vacation-balances/initialize-year-dialog.tsx` | Phase 5 |
| `apps/web/src/components/vacation-balances/vacation-balance-toolbar.tsx` | Phase 6 |
| `apps/web/src/app/[locale]/(dashboard)/admin/vacation-balances/page.tsx` | Phase 7 |

### Modified files (6 files)

| File | Phase | Change |
|------|-------|--------|
| `apps/web/src/hooks/api/use-vacation-balance.ts` | Phase 1 | Add 3 mutation hooks |
| `apps/web/src/hooks/api/index.ts` | Phase 1 | Export new hooks |
| `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` | Phase 8 | Add nav entry |
| `apps/web/src/components/layout/breadcrumbs.tsx` | Phase 8 | Add segment mapping |
| `apps/web/messages/en.json` | Phase 8 | Add translations |
| `apps/web/messages/de.json` | Phase 8 | Add translations |

### Key pattern references

| Pattern | Reference File |
|---------|---------------|
| Mutation hooks | `/home/tolga/projects/terp/apps/web/src/hooks/api/use-employee-day-plans.ts` |
| Data table with actions | `/home/tolga/projects/terp/apps/web/src/components/employees/employee-data-table.tsx` |
| Form sheet (create/edit) | `/home/tolga/projects/terp/apps/web/src/components/users/user-form-sheet.tsx` |
| Detail sheet with sections | `/home/tolga/projects/terp/apps/web/src/components/absences/absence-detail-sheet.tsx` |
| Balance breakdown + progress bar | `/home/tolga/projects/terp/apps/web/src/components/vacation/balance-breakdown.tsx` |
| Dialog (bulk operation) | `/home/tolga/projects/terp/apps/web/src/components/employee-day-plans/bulk-assign-dialog.tsx` |
| Toolbar with filters | `/home/tolga/projects/terp/apps/web/src/components/employee-day-plans/day-plan-grid-toolbar.tsx` |
| Admin page structure | `/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/admin/users/page.tsx` |
| API types | `/home/tolga/projects/terp/apps/web/src/lib/api/types.ts` |
| useApiMutation | `/home/tolga/projects/terp/apps/web/src/hooks/use-api-mutation.ts` |
