# Implementation Plan: NOK-237 - Build Account Management for Time Tracking Buckets

**Date:** 2026-01-27
**Ticket:** NOK-237
**Status:** Ready for Implementation

## Overview

Build an admin page for managing time tracking accounts (overtime, flextime, surcharges, etc.). The backend model, repository, service, handler, and routes already fully exist. The frontend needs a new admin page with data table, form sheet, and detail sheet following existing patterns (modeled after absence-types). Minor backend fixes are needed to align the List handler response with the OpenAPI spec.

## Prerequisites

- [x] Account model exists (`apps/api/internal/model/account.go`)
- [x] Account repository exists (`apps/api/internal/repository/account.go`)
- [x] Account service exists (`apps/api/internal/service/account.go`)
- [x] Account handler exists (`apps/api/internal/handler/account.go`)
- [x] Routes registered (`apps/api/internal/handler/routes.go` - `RegisterAccountRoutes`)
- [x] Handler tests exist (`apps/api/internal/handler/account_test.go`)
- [x] OpenAPI spec defines endpoints (`api/paths/accounts.yaml`, `api/schemas/accounts.yaml`)
- [x] Generated Go models exist (`apps/api/gen/models/account.go`, `create_account_request.go`, `update_account_request.go`)
- [x] Generated TypeScript types exist (`apps/web/src/lib/api/types.ts` - Account, AccountList, CreateAccountRequest, UpdateAccountRequest)
- [x] Basic read hooks exist (`apps/web/src/hooks/api/use-accounts.ts` - `useAccounts`, `useAccount`)

## Known Discrepancies (Pre-existing)

These are pre-existing mismatches between the OpenAPI spec and the backend implementation. They affect how the frontend must handle account data but are NOT caused by this ticket:

1. **Response format**: The List handler returns a bare `[]model.Account` array, but the OpenAPI spec defines the response as `AccountList` (`{ data: Account[] }`). Other newer handlers (day-plans, week-plans, tariffs) use the wrapped format. **Fix included in this plan.**
2. **Account type enum**: The Go model uses `bonus`/`tracking`/`balance`; the OpenAPI spec uses `time`/`bonus`/`deduction`/`vacation`/`sick`. The handler's `mapAccountType()` function maps API->model for Create, but the response returns internal model types. **The frontend must handle internal types at runtime.**
3. **Query param mismatch**: The handler reads `include_system`/`active_only` params; the OpenAPI spec defines `active`/`account_type`/`payroll_relevant`. **Frontend must use the handler's actual params.**
4. **Missing fields in DB/model**: `description`, `is_payroll_relevant`, `payroll_code`, `sort_order` are in the OpenAPI schema but not in the database or GORM model. They will be absent from API responses.
5. **Missing field in schema**: `unit` (minutes/hours/days) is in the DB/model but not in the OpenAPI schema. It IS returned in API responses.

---

## Phase 1: Backend - Fix List Handler Response Format

**Goal:** Wrap the List handler response in `{ "data": [...] }` to match the OpenAPI spec (`AccountList`), consistent with other list handlers (day-plans, week-plans, tariffs, booking-types).

### 1.1 Update List Handler Response

**File:** `/home/tolga/projects/terp/apps/api/internal/handler/account.go`

Change line 51 from:
```go
respondJSON(w, http.StatusOK, accounts)
```
To:
```go
respondJSON(w, http.StatusOK, map[string]any{"data": accounts})
```

### 1.2 Update List Handler Tests

**File:** `/home/tolga/projects/terp/apps/api/internal/handler/account_test.go`

Update tests `TestAccountHandler_List_Success`, `TestAccountHandler_List_ActiveOnly`, and `TestAccountHandler_List_IncludeSystem` to parse the wrapped response format.

Change the unmarshalling pattern from:
```go
var result []model.Account
err := json.Unmarshal(rr.Body.Bytes(), &result)
```
To:
```go
var response struct {
    Data []model.Account `json:"data"`
}
err := json.Unmarshal(rr.Body.Bytes(), &response)
result := response.Data
```

### Verification Phase 1

```bash
cd /home/tolga/projects/terp/apps/api && go test -v -run TestAccountHandler ./internal/handler/...
```

All 17 account handler tests must pass.

---

## Phase 2: Frontend - Add Mutation Hooks and Update Query Hook

**Goal:** Add create, update, delete mutation hooks and update the list hook to support `include_system` parameter.

### 2.1 Update Account Hooks

**File:** `/home/tolga/projects/terp/apps/web/src/hooks/api/use-accounts.ts`

Update `useAccounts` to accept `includeSystem` option and map it to the handler's `include_system` query param. Also add mutation hooks following the pattern from `use-absences.ts`:

```tsx
import { useApiQuery, useApiMutation } from '@/hooks'

interface UseAccountsOptions {
  accountType?: 'time' | 'bonus' | 'deduction' | 'vacation' | 'sick'
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
      // Handler reads include_system param (not in OpenAPI spec but handler supports it)
      ...(includeSystem !== undefined ? { include_system: includeSystem } : {}),
    } as Record<string, unknown>,
    enabled,
  })
}

export function useAccount(id: string, enabled = true) {
  return useApiQuery('/accounts/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateAccount() {
  return useApiMutation('/accounts', 'post', {
    invalidateKeys: [['/accounts']],
  })
}

export function useUpdateAccount() {
  return useApiMutation('/accounts/{id}', 'patch', {
    invalidateKeys: [['/accounts']],
  })
}

export function useDeleteAccount() {
  return useApiMutation('/accounts/{id}', 'delete', {
    invalidateKeys: [['/accounts']],
  })
}
```

### 2.2 Update Barrel Exports

**File:** `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts`

Update the Accounts section from:
```tsx
export { useAccounts, useAccount } from './use-accounts'
```
To:
```tsx
export {
  useAccounts,
  useAccount,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
} from './use-accounts'
```

### Verification Phase 2

```bash
cd /home/tolga/projects/terp/apps/web && pnpm build
```

No TypeScript errors.

---

## Phase 3: Frontend - Create Account Components

**Goal:** Create data table, form sheet, and detail sheet components following the absence-types pattern.

### 3.1 Create Component Directory

**Directory:** `/home/tolga/projects/terp/apps/web/src/components/accounts/`

Create files:
- `index.ts`
- `account-data-table.tsx`
- `account-form-sheet.tsx`
- `account-detail-sheet.tsx`

### 3.2 Data Table Component

**File:** `/home/tolga/projects/terp/apps/web/src/components/accounts/account-data-table.tsx`

**Reference:** `/home/tolga/projects/terp/apps/web/src/components/absence-types/absence-type-data-table.tsx`

```tsx
interface AccountDataTableProps {
  accounts: Account[]
  isLoading: boolean
  onView: (account: Account) => void
  onEdit: (account: Account) => void
  onDelete: (account: Account) => void
}
```

Type derivation:
```tsx
type Account = components['schemas']['Account']
```

Columns:
| Column | Width | Content |
|--------|-------|---------|
| Icon | w-12 | Icon per account type (see below) |
| Code | w-20 | `font-mono` code |
| Name | flex | Name with icon in rounded bg |
| Type | w-28 | Badge for account_type |
| Unit | w-20 | Unit label (from runtime data, may be missing from TS type) |
| Status | w-24 | System badge (Lock icon), Active/Inactive badge |
| Actions | w-16 | DropdownMenu: View/Edit/Delete |

Account type icon mapping (use lucide-react):
- `bonus` / `bonus` at runtime: `Award` icon, badge variant `default`
- `tracking` at runtime / `time`+`deduction`+`sick` in spec: `BarChart3` icon, badge variant `secondary`
- `balance` at runtime / `vacation` in spec: `Scale` icon, badge variant `outline`

Account type label mapping for display:
- `bonus` -> "Bonus"
- `tracking` -> "Tracking"
- `balance` -> "Balance"
- `time` -> "Time"
- `deduction` -> "Deduction"
- `vacation` -> "Vacation"
- `sick` -> "Sick"

System accounts: Edit/Delete disabled with tooltip "System accounts cannot be modified" (same pattern as absence-types).

Include `AccountDataTableSkeleton` component with 5 skeleton rows.

### 3.3 Form Sheet Component

**File:** `/home/tolga/projects/terp/apps/web/src/components/accounts/account-form-sheet.tsx`

**Reference:** `/home/tolga/projects/terp/apps/web/src/components/absence-types/absence-type-form-sheet.tsx`

```tsx
interface AccountFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  account?: Account | null
  onSuccess?: () => void
}
```

FormState interface:
```tsx
interface FormState {
  code: string
  name: string
  description: string
  accountType: string
  isPayrollRelevant: boolean
  payrollCode: string
  sortOrder: number
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  code: '',
  name: '',
  description: '',
  accountType: 'time',
  isPayrollRelevant: false,
  payrollCode: '',
  sortOrder: 0,
  isActive: true,
}
```

Account type options for Select:
```tsx
const ACCOUNT_TYPE_OPTIONS = [
  { value: 'time', label: 'Time' },
  { value: 'bonus', label: 'Bonus' },
  { value: 'deduction', label: 'Deduction' },
  { value: 'vacation', label: 'Vacation' },
  { value: 'sick', label: 'Sick' },
]
```

Form Sections:

**Basic Information:**
- Code (text input, required, max 20 chars, uppercase transform) - disabled on edit and for system accounts
- Name (text input, required, max 255 chars)
- Description (textarea, optional)

**Account Type:**
- Account Type (Select, required) - disabled on edit (account type cannot change)

**Payroll:**
- Payroll Relevant (Switch)
- Payroll Code (text input, optional)

**Ordering:**
- Sort Order (number input, default 0)

**Status (edit only):**
- Active (Switch) - inactive accounts cannot be used for new entries

System type warning: If `is_system` is true, show `<Alert>` with AlertCircle icon: "This is a system account. Some fields cannot be modified."

Validation:
```tsx
function validateForm(form: FormState): string[] {
  const errors: string[] = []
  if (!form.code.trim()) errors.push('Code is required')
  else if (form.code.length > 20) errors.push('Code must be 20 characters or less')
  if (!form.name.trim()) errors.push('Name is required')
  else if (form.name.length > 255) errors.push('Name must be 255 characters or less')
  return errors
}
```

Submit handler:
- Create: `createMutation.mutateAsync({ body: { code, name, description, account_type, is_payroll_relevant, payroll_code, sort_order } })`
- Update: `updateMutation.mutateAsync({ path: { id: account.id }, body: { name, description, is_payroll_relevant, payroll_code, sort_order, is_active } })`

### 3.4 Detail Sheet Component

**File:** `/home/tolga/projects/terp/apps/web/src/components/accounts/account-detail-sheet.tsx`

**Reference:** `/home/tolga/projects/terp/apps/web/src/components/absence-types/absence-type-detail-sheet.tsx`

```tsx
interface AccountDetailSheetProps {
  accountId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (account: Account) => void
  onDelete: (account: Account) => void
}
```

Sections:
- **Header**: Icon (per account type, colored bg), name, code (font-mono), system badge, active/inactive badge
- **Details**: Code, Name, Description, Account Type (with badge)
- **Configuration**: Unit (display from runtime data if available, or "N/A"), Payroll Relevant (boolean badge), Payroll Code, Sort Order
- **Timestamps**: Created, Last Updated (formatted with date-fns `dd.MM.yyyy HH:mm`)

Footer actions: Close, Edit (disabled with tooltip if system), Delete (disabled with tooltip if system)

### 3.5 Index Exports

**File:** `/home/tolga/projects/terp/apps/web/src/components/accounts/index.ts`

```tsx
export { AccountDataTable } from './account-data-table'
export { AccountFormSheet } from './account-form-sheet'
export { AccountDetailSheet } from './account-detail-sheet'
```

### Verification Phase 3

```bash
cd /home/tolga/projects/terp/apps/web && pnpm build
```

No TypeScript errors. All components compile.

---

## Phase 4: Frontend - Create Admin Page

**Goal:** Create the accounts admin page at `/admin/accounts`.

### 4.1 Create Page

**File:** `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/accounts/page.tsx`

**Reference:** `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/absence-types/page.tsx`

Structure follows the exact absence-types page pattern:

```tsx
'use client'

export default function AccountsPage() {
  // 1. Auth check
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  // 2. State
  const [search, setSearch] = React.useState('')
  const [typeFilter, setTypeFilter] = React.useState<string>('all')
  const [statusFilter, setStatusFilter] = React.useState<string>('all')
  const [showSystem, setShowSystem] = React.useState(true)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<Account | null>(null)
  const [viewItem, setViewItem] = React.useState<Account | null>(null)
  const [deleteItem, setDeleteItem] = React.useState<Account | null>(null)

  // 3. Fetch accounts (include system accounts for admin view)
  const { data: accountsData, isLoading } = useAccounts({
    includeSystem: true,
    enabled: !authLoading && isAdmin,
  })
  const deleteMutation = useDeleteAccount()

  // 4. Redirect non-admin
  React.useEffect(() => {
    if (!authLoading && !isAdmin) router.push('/dashboard')
  }, [authLoading, isAdmin, router])

  // 5. Extract accounts from response
  const accounts = accountsData?.data ?? []

  // 6. Client-side filtering
  const filteredAccounts = React.useMemo(() => { ... }, [...])
}
```

Filter options:
```tsx
const TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'bonus', label: 'Bonus' },
  { value: 'tracking', label: 'Tracking' },
  { value: 'balance', label: 'Balance' },
]

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]
```

**Note:** The `typeFilter` values match the **runtime** account_type values (`bonus`/`tracking`/`balance`) since that is what the handler actually returns. The OpenAPI types (`time`/`bonus`/`deduction`/`vacation`/`sick`) are used for creating accounts via the form.

Client-side filtering logic:
```tsx
const filteredAccounts = React.useMemo(() => {
  return accounts.filter((a) => {
    // Search filter
    if (search) {
      const s = search.toLowerCase()
      if (!a.code?.toLowerCase().includes(s) && !a.name?.toLowerCase().includes(s)) {
        return false
      }
    }
    // Type filter (matches runtime account_type)
    if (typeFilter !== 'all' && a.account_type !== typeFilter) {
      return false
    }
    // Status filter
    if (statusFilter === 'active' && !a.is_active) return false
    if (statusFilter === 'inactive' && a.is_active) return false
    // System filter
    if (!showSystem && a.is_system) return false
    return true
  })
}, [accounts, search, typeFilter, statusFilter, showSystem])
```

Page layout:
- Header: "Accounts" title, "Manage time tracking accounts for your organization" description, "New Account" button
- Filters bar: SearchInput, Type Select, Status Select, Show system accounts Switch, Clear filters button
- Count: "{n} account{s}"
- Card with `<AccountDataTable>` or empty state
- `<AccountFormSheet>` for create/edit
- `<AccountDetailSheet>` for viewing
- `<ConfirmDialog>` for delete confirmation

Empty state: Use `Wallet` icon from lucide-react, "No accounts found" message, conditional create button.

Delete confirmation text: `Are you sure you want to delete "${deleteItem.name}" (${deleteItem.code})? This action cannot be undone.`

Skeleton component: Follow the absence-types skeleton pattern with header, filters, and content placeholders.

### Verification Phase 4

```bash
cd /home/tolga/projects/terp/apps/web && pnpm build
```

Manual testing:
1. Navigate to `http://localhost:3000/admin/accounts`
2. Verify system accounts (FLEX, OT, VAC) display with System badge
3. Test search filter by code and name
4. Test type filter dropdown
5. Test status filter dropdown
6. Test system toggle
7. Test create account flow
8. Test view detail sheet
9. Test edit account flow
10. Test delete with confirmation
11. Verify system accounts cannot be edited/deleted (disabled buttons with tooltip)

---

## Phase 5: Frontend - Add Navigation Link

**Goal:** Add "Accounts" to the admin sidebar navigation.

### 5.1 Update Sidebar Navigation Config

**File:** `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

Add import:
```tsx
import { Wallet } from 'lucide-react'
```

Add to the "Management" section items array, after "Absence Types":
```tsx
{
  title: 'Accounts',
  href: '/admin/accounts',
  icon: Wallet,
  roles: ['admin'],
  description: 'Manage time tracking accounts',
},
```

### Verification Phase 5

1. Navigate sidebar and verify "Accounts" link appears in Management section
2. Click link and verify navigation to `/admin/accounts`
3. Verify active state highlights correctly

---

## Success Criteria

- [ ] Backend List handler returns wrapped `{ data: [...] }` format
- [ ] All backend tests pass (`make test`)
- [ ] Frontend mutation hooks (create/update/delete) work correctly
- [ ] All accounts display with correct type badges
- [ ] System accounts (FLEX, OT, VAC) show System badge
- [ ] System accounts have disabled Edit/Delete with tooltip
- [ ] Custom accounts can be created with code, name, and type
- [ ] Custom accounts can be edited (name, description, payroll settings, active status)
- [ ] Custom accounts can be deleted with confirmation dialog
- [ ] Search filter works for code and name
- [ ] Type filter works for bonus/tracking/balance
- [ ] Status filter works for active/inactive
- [ ] Show system toggle works
- [ ] Clear filters button resets all filters
- [ ] Sidebar navigation includes "Accounts" link
- [ ] Frontend builds without errors (`pnpm build`)

## Files to Create

1. `/home/tolga/projects/terp/apps/web/src/components/accounts/index.ts`
2. `/home/tolga/projects/terp/apps/web/src/components/accounts/account-data-table.tsx`
3. `/home/tolga/projects/terp/apps/web/src/components/accounts/account-form-sheet.tsx`
4. `/home/tolga/projects/terp/apps/web/src/components/accounts/account-detail-sheet.tsx`
5. `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/accounts/page.tsx`

## Files to Modify

1. `/home/tolga/projects/terp/apps/api/internal/handler/account.go` - Wrap List response in `{ data: [...] }`
2. `/home/tolga/projects/terp/apps/api/internal/handler/account_test.go` - Update List tests for wrapped response
3. `/home/tolga/projects/terp/apps/web/src/hooks/api/use-accounts.ts` - Add mutation hooks, update list hook
4. `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts` - Add mutation hook exports
5. `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` - Add nav entry

## Notes

- The internal Go model uses `bonus`/`tracking`/`balance` for account_type but the OpenAPI spec uses `time`/`bonus`/`deduction`/`vacation`/`sick`. The frontend type filter should use the runtime values.
- The `unit` field (minutes/hours/days) exists in the Go model and will be returned in API responses, but is NOT in the TypeScript types. Use type assertion or optional chaining to display it.
- The `description`, `is_payroll_relevant`, `payroll_code`, `sort_order` fields are in the OpenAPI spec/TS types but NOT in the Go model. They can be sent in create/update requests but will not appear in responses until a backend migration adds them.
- Year carryover behavior and usage statistics are mentioned in the ticket but have no backend support yet. They are out of scope for this ticket and should be separate tickets.
- Account values (employee-level tracking) are not yet implemented (TICKET-096/097/098). Out of scope.
