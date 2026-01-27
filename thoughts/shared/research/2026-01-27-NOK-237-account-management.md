# Research: NOK-237 Account Management for Time Tracking Buckets

**Date**: 2026-01-27
**Ticket**: NOK-237
**Status**: Research complete

---

## 1. Does an accounts model/migration already exist in the codebase?

**Yes.** The accounts infrastructure is fully implemented across all backend layers.

### Migration

File: `db/migrations/000006_create_accounts.up.sql`

```sql
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    account_type VARCHAR(20) NOT NULL, -- 'bonus', 'tracking', 'balance'
    unit VARCHAR(20) NOT NULL DEFAULT 'minutes', -- 'minutes', 'hours', 'days'
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);
```

Three system accounts are seeded: `FLEX` (Flextime/balance/minutes), `OT` (Overtime/balance/minutes), `VAC` (Vacation/balance/days).

### Model

File: `apps/api/internal/model/account.go`

```go
type AccountType string
const (
    AccountTypeBonus    AccountType = "bonus"
    AccountTypeTracking AccountType = "tracking"
    AccountTypeBalance  AccountType = "balance"
)

type AccountUnit string
const (
    AccountUnitMinutes AccountUnit = "minutes"
    AccountUnitHours   AccountUnit = "hours"
    AccountUnitDays    AccountUnit = "days"
)

type Account struct {
    ID          uuid.UUID   // Primary key
    TenantID    *uuid.UUID  // NULL for system accounts
    Code        string
    Name        string
    AccountType AccountType
    Unit        AccountUnit
    IsSystem    bool
    IsActive    bool
    CreatedAt   time.Time
    UpdatedAt   time.Time
}
```

### Repository

File: `apps/api/internal/repository/account.go`

Methods: `Create`, `GetByID`, `GetByCode`, `Update`, `Delete`, `List` (tenant only), `ListWithSystem` (tenant + system), `GetSystemAccounts`, `ListActive`.

### Service

File: `apps/api/internal/service/account.go`

Methods: `Create` (with validation, duplicate code check), `GetByID`, `GetByCode`, `Update` (name, unit, is_active), `Delete` (prevents system deletion), `List`, `ListWithSystem`, `GetSystemAccounts`, `ListActive`.

Errors defined: `ErrAccountNotFound`, `ErrAccountCodeRequired`, `ErrAccountNameRequired`, `ErrAccountTypeRequired`, `ErrAccountCodeExists`, `ErrCannotDeleteSystem`, `ErrCannotModifySystemCode`.

### Handler

File: `apps/api/internal/handler/account.go`

Full CRUD handler: `List` (with `include_system` and `active_only` query params), `Get`, `Create`, `Update`, `Delete`.

Uses generated models: `models.CreateAccountRequest`, `models.UpdateAccountRequest`.

Maps OpenAPI types ("time", "bonus", "deduction", "vacation", "sick") to internal model types ("bonus", "tracking", "balance") via `mapAccountType()`.

### Wiring in main.go

File: `apps/api/cmd/server/main.go`

```go
accountRepo := repository.NewAccountRepository(db)           // line 71
accountService := service.NewAccountService(accountRepo)     // line 87
accountHandler := handler.NewAccountHandler(accountService)  // line 151
handler.RegisterAccountRoutes(r, accountHandler)             // line 224
```

Registered in the tenant-scoped route group (requires auth + tenant header).

### Tests

Full test suites exist:
- `apps/api/internal/handler/account_test.go` (17 test cases covering CRUD, validation, system account protection)
- `apps/api/internal/service/account_test.go`
- `apps/api/internal/repository/account_test.go`

---

## 2. What API patterns exist for similar CRUD resources?

### Route Registration Pattern

File: `apps/api/internal/handler/routes.go`

All resources follow the same pattern:

```go
func RegisterAccountRoutes(r chi.Router, h *AccountHandler) {
    r.Route("/accounts", func(r chi.Router) {
        r.Get("/", h.List)
        r.Post("/", h.Create)
        r.Get("/{id}", h.Get)
        r.Patch("/{id}", h.Update)    // Some use Put instead of Patch
        r.Delete("/{id}", h.Delete)
    })
}
```

Resources using `Patch` for updates: accounts, holidays, cost centers, employment types, user groups, booking types, absence types.
Resources using `Put` for updates: teams, employees, day plans, week plans, tariffs.

### Handler Pattern

All handlers follow a consistent structure:
1. Parse tenant from context via `middleware.TenantFromContext(r.Context())`
2. Parse URL params via `chi.URLParam(r, "id")`
3. Parse body with `json.NewDecoder(r.Body).Decode(&req)` using generated models
4. Validate with `req.Validate(nil)` (go-swagger generated validation)
5. Call service method
6. Switch on error types for appropriate HTTP status codes
7. Respond with `respondJSON()` or `respondError()`

### Response Pattern

File: `apps/api/internal/handler/response.go`

Two helper functions: `respondJSON(w, status, data)` and `respondError(w, status, message)`.

Error responses return: `{"error": "statusText", "message": "...", "status": code}`.

### Service Pattern

All services follow:
1. Define a private repository interface
2. Constructor accepts that interface
3. Input structs for Create/Update operations
4. Validation at the service layer
5. Named error variables for each domain-specific error

### Repository Pattern

All repositories follow:
1. Constructor accepting `*DB`
2. Use `r.db.GORM.WithContext(ctx)` for all queries
3. Handle `gorm.ErrRecordNotFound` and return domain errors
4. Named errors (e.g., `ErrAccountNotFound`)

---

## 3. What frontend patterns exist for admin management pages?

### No accounts page exists yet

There is no `apps/web/src/app/(dashboard)/admin/accounts/page.tsx`. This must be created.

### Existing admin pages

All admin pages are located at `apps/web/src/app/(dashboard)/admin/`:
- `employees/page.tsx`
- `teams/page.tsx`
- `departments/page.tsx`
- `day-plans/page.tsx`
- `week-plans/page.tsx`
- `tariffs/page.tsx`
- `holidays/page.tsx`
- `absence-types/page.tsx`

### Page Structure Pattern (from absence-types and holidays)

All admin pages follow this structure:

```tsx
'use client'

export default function ResourcePage() {
  // 1. Auth check
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  // 2. State: filters, dialog state (createOpen, editItem, viewItem, deleteItem)
  const [search, setSearch] = React.useState('')
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<Type | null>(null)
  const [viewItem, setViewItem] = React.useState<Type | null>(null)
  const [deleteItem, setDeleteItem] = React.useState<Type | null>(null)

  // 3. Fetch data
  const { data, isLoading } = useResourceHook()
  const deleteMutation = useDeleteResource()

  // 4. Redirect non-admin
  React.useEffect(() => { if (!authLoading && !isAdmin) router.push('/dashboard') }, ...)

  // 5. Client-side filtering
  const filtered = React.useMemo(() => { ... }, [data, search, ...filters])

  // 6. Render:
  //    - Page header with title, description, "New" button
  //    - Filters bar (SearchInput, Select dropdowns, Switch toggles, Clear button)
  //    - Count display
  //    - Card with DataTable (or empty state)
  //    - FormSheet (side panel for create/edit)
  //    - DetailSheet (side panel for viewing)
  //    - ConfirmDialog (delete confirmation)
}
```

### Component Organization Pattern

Each resource has its own component directory with barrel export:

```
apps/web/src/components/absence-types/
  index.ts                        # Barrel exports
  absence-type-data-table.tsx     # Table component with columns
  absence-type-form-sheet.tsx     # Create/edit sheet form
  absence-type-detail-sheet.tsx   # Read-only detail view sheet
```

### DataTable Pattern (from absence-type-data-table.tsx)

- Props: `{ items: Type[], isLoading: boolean, onView, onEdit, onDelete }`
- Uses `<Table>` / `<TableHeader>` / `<TableBody>` / `<TableRow>` / `<TableCell>` from shadcn/ui
- Each row has a `cursor-pointer` class and onClick for view
- Last cell contains `<DropdownMenu>` with View/Edit/Delete actions
- System items get disabled Edit/Delete with tooltip: "System types cannot be modified"
- Badge component for status/type indicators
- Lock icon for system items
- Skeleton loading state component

### FormSheet Pattern (from absence-type-form-sheet.tsx)

- Uses `<Sheet>` side panel (right, `sm:max-w-lg`)
- Props: `{ open, onOpenChange, item?: Type | null, onSuccess }`
- Local `FormState` interface with `INITIAL_STATE`
- Form reset on open via useEffect
- Client-side validation function returning string[]
- Separate create/update mutations
- System type warning alert
- Sectioned form: "Basic Information", "Category", "Behavior", "Status (edit only)"
- Error display with `<Alert variant="destructive">`
- Footer with Cancel/Submit buttons, loading spinner

### Sidebar Navigation

File: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

The "Management" section contains admin pages. There is currently no "Accounts" entry. An entry would need to be added:

```ts
{
  title: 'Accounts',
  href: '/admin/accounts',
  icon: SomeIcon,  // e.g., Wallet or PiggyBank from lucide-react
  roles: ['admin'],
  description: 'Manage time tracking accounts',
},
```

### API Hooks Pattern

File: `apps/web/src/hooks/api/use-accounts.ts`

The accounts hook already exists but only provides read hooks:

```ts
export function useAccounts(options) {
  return useApiQuery('/accounts', { params: { account_type, active }, enabled })
}

export function useAccount(id: string, enabled = true) {
  return useApiQuery('/accounts/{id}', { path: { id }, enabled: enabled && !!id })
}
```

Missing from the hook file: `useCreateAccount`, `useUpdateAccount`, `useDeleteAccount` mutation hooks.

The mutations would follow the pattern from `use-absences.ts`:

```ts
export function useCreateAccount() {
  return useApiMutation('post', '/accounts')
}
export function useUpdateAccount() {
  return useApiMutation('patch', '/accounts/{id}')
}
export function useDeleteAccount() {
  return useApiMutation('delete', '/accounts/{id}')
}
```

The barrel export at `apps/web/src/hooks/api/index.ts` currently exports: `useAccounts, useAccount`.

---

## 4. What OpenAPI spec patterns are used for similar resources?

### Schema Pattern

File: `api/schemas/accounts.yaml`

The accounts schema is already comprehensive and includes fields beyond what the current Go model implements:

| Schema Field          | In DB/Model? | Notes |
|----------------------|-------------|-------|
| id                   | Yes         |       |
| tenant_id            | Yes         |       |
| code                 | Yes         |       |
| name                 | Yes         |       |
| description          | No          | In schema only |
| account_type         | Yes         | Schema: time/bonus/deduction/vacation/sick; Model: bonus/tracking/balance |
| is_system            | Yes         |       |
| is_payroll_relevant  | No          | In schema only |
| payroll_code         | No          | In schema only |
| sort_order           | No          | In schema only |
| is_active            | Yes         |       |
| unit                 | Yes (model) | Not in schema |

**Key discrepancy**: The OpenAPI schema has `account_type` enum values `["time","bonus","deduction","vacation","sick"]`, while the internal model uses `["bonus","tracking","balance"]`. The handler's `mapAccountType()` function translates between them.

**Missing in schema**: The `unit` field (minutes/hours/days) is in the DB and model but not in the OpenAPI schema.

**Missing in model**: The `description`, `is_payroll_relevant`, `payroll_code`, and `sort_order` fields are defined in the OpenAPI schema and generated models but not in the DB migration or GORM model.

### Paths Pattern

File: `api/paths/accounts.yaml`

Standard CRUD at `/accounts` and `/accounts/{id}` plus `/account-values` (read-only list).

Query parameters on list: `active` (boolean), `account_type` (enum), `payroll_relevant` (boolean).

**Note**: The handler currently uses `include_system` and `active_only` query params, which differ from the spec's `active` and `account_type` params.

### Schema Registration

File: `api/openapi.yaml`

All account schemas are properly registered in the definitions section (lines 470-483) and paths section (lines 310-316).

---

## 5. How is the accounts concept referenced in existing calculation/capping code?

### DayPlanBonus -> Account relationship

File: `apps/api/internal/model/dayplan.go` (lines 241-261)

The `DayPlanBonus` model has:
- `AccountID uuid.UUID` (required FK)
- `Account *Account` (GORM foreignKey relation)

This links day plan bonuses (surcharges) to target accounts.

Migration: `db/migrations/000017_create_day_plan_bonuses.up.sql`
```sql
account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE
```

### Surcharge Calculation

File: `apps/api/internal/calculation/surcharge.go`

The `SurchargeConfig` struct references accounts:
```go
type SurchargeConfig struct {
    AccountID         uuid.UUID
    AccountCode       string
    TimeFrom          int
    TimeTo            int
    AppliesOnHoliday  bool
    AppliesOnWorkday  bool
    HolidayCategories []int
}
```

The `SurchargeResult` struct:
```go
type SurchargeResult struct {
    AccountID   uuid.UUID
    AccountCode string
    Minutes     int
}
```

`ConvertBonusesToSurchargeConfigs()` maps `DayPlanBonus` records to `SurchargeConfig`, reading AccountID and optionally Account.Code.

### Capping Calculation

File: `apps/api/internal/calculation/capping.go`

Capping logic tracks time capped due to early arrival, late departure, and max net time. This does NOT directly reference accounts, but the capped minutes are conceptually intended to flow into capping accounts (per ticket TICKET-120 / NOK-147).

### Monthly Calculation

File: `apps/api/internal/calculation/monthly.go`

The monthly calculation handles flextime carryover with credit types. It references a "flextime account" conceptually in comments (`CreditType defines how overtime is credited to the flextime account`) but does not reference the Account model directly. The monthly calculation uses a `MonthlyCalcOutput` struct with flextime tracking fields.

### Account Values (planned, not yet implemented)

The OpenAPI schema defines `AccountValue` (linked to employee + account + date + value_minutes + source) and `AccountValueList`. These are in `api/schemas/accounts.yaml` and have generated models at `apps/api/gen/models/account_value.go`. However, there is no `account_values` migration, model, repository, or service yet. Ticket plans exist: `TICKET-096`, `TICKET-097`, `TICKET-098`.

---

## 6. What generated models exist that relate to accounts?

File locations in `apps/api/gen/models/`:

### Account (`account.go`)
Generated from `api/schemas/accounts.yaml#/Account`.

Fields: `AccountType *string` (enum: time/bonus/deduction/vacation/sick), `Code *string`, `CreatedAt`, `Description *string`, `ID *strfmt.UUID`, `IsActive bool`, `IsPayrollRelevant bool`, `IsSystem bool`, `Name *string`, `PayrollCode *string`, `SortOrder int64`, `TenantID *strfmt.UUID`, `UpdatedAt`.

### AccountSummary (`account_summary.go`)
Lightweight: `AccountType *string`, `Code *string`, `ID *strfmt.UUID`, `Name *string`.

### CreateAccountRequest (`create_account_request.go`)
Fields: `AccountType *string` (required, enum), `Code *string` (required, 1-20), `Description string`, `IsPayrollRelevant *bool`, `Name *string` (required, 1-255), `PayrollCode string`, `SortOrder int64`.

### UpdateAccountRequest (`update_account_request.go`)
Fields: `Description string`, `IsActive bool`, `IsPayrollRelevant bool`, `Name string` (1-255), `PayrollCode string`, `SortOrder int64`.

### AccountList (`account_list.go`)
Wrapper: `Data []*Account` (required).

### AccountValue (`account_value.go`)
Fields: `Account struct{AccountSummary}`, `AccountID *strfmt.UUID`, `CreatedAt`, `Employee struct{EmployeeSummary}`, `EmployeeID *strfmt.UUID`, `ID *strfmt.UUID`, `Source string` (enum: calculated/manual/correction/import), `SourceID *strfmt.UUID`, `TenantID *strfmt.UUID`, `UpdatedAt`, `ValueDate *strfmt.Date`, `ValueMinutes *int64`.

### AccountValueList (`account_value_list.go`)
Wrapper: `Data []*AccountValue` (required).

---

## Summary of Gaps for NOK-237 Implementation

### Backend (already done -- complete CRUD API exists)
The Go backend has a fully functional accounts CRUD API at `/api/v1/accounts` with:
- Migration, model, repository, service, handler, tests
- System account seeding and protection
- Tenant scoping
- Route registration in main.go

### Backend Gaps (schema vs implementation mismatches)
1. **Missing DB/model fields**: `description`, `is_payroll_relevant`, `payroll_code`, `sort_order` are in the OpenAPI schema but not in the database or GORM model
2. **Missing schema field**: `unit` (minutes/hours/days) is in the DB/model but not in the OpenAPI schema
3. **Type enum mismatch**: OpenAPI uses `time/bonus/deduction/vacation/sick`; internal model uses `bonus/tracking/balance`
4. **Query param mismatch**: Handler uses `include_system`/`active_only`; OpenAPI spec defines `active`/`account_type`/`payroll_relevant`
5. **No account_type filter**: Handler does not implement `account_type` query filter
6. **Account values**: No backend implementation yet (TICKET-096/097/098)
7. **Year carryover**: No carryover configuration on the accounts table (ticket asks for it)
8. **Usage statistics**: No endpoint to show which plans use an account

### Frontend (needs to be built)
1. No `apps/web/src/app/(dashboard)/admin/accounts/page.tsx` page exists
2. No `apps/web/src/components/accounts/` component directory exists
3. The `use-accounts.ts` hook has only read hooks (no create/update/delete mutations)
4. The `hooks/api/index.ts` barrel only exports `useAccounts, useAccount`
5. No "Accounts" entry in sidebar navigation config
