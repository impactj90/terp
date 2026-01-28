# Account Management Implementation Plan

## Overview
Implement full account management for time tracking accounts by aligning account types across backend/schema/UI, adding unit + year carryover + payroll fields, enforcing system read-only rules, and exposing usage statistics tied to day plan bonuses.

## Current State Analysis
- DB/model already support `account_type` values `bonus|tracking|balance` and `unit` (`minutes|hours|days`), but OpenAPI + UI still use `time|bonus|deduction|vacation|sick` and omit `unit`. (`db/migrations/000006_create_accounts.up.sql:1`, `apps/api/internal/model/account.go:9`, `api/schemas/accounts.yaml:1`)
- Handler ignores schema-only fields (description, payroll, sort_order) and only updates name/is_active. (`apps/api/internal/handler/account.go:24`)
- Admin accounts UI exists, but account type selector and hooks follow the OpenAPI enum and show fields not persisted. (`apps/web/src/components/accounts/account-form-sheet.tsx:40`)
- Usage relationship exists via day plan bonuses (`day_plan_bonuses.account_id`). (`apps/api/internal/model/dayplan.go:241`)

## Desired End State
- Accounts API, model, schema, and UI all use `bonus|tracking|balance` types.
- Account create/update supports `unit`, `description`, payroll fields, sort order, and year carryover behavior.
- System accounts are read-only (no update/delete) and clearly indicated in the UI.
- Accounts list grouped by type with usage count indicator and active toggle.
- Usage details show which day plans reference the account and warning appears on delete when in use.

### Key Discoveries
- Accounts are already persisted and seeded in migration. (`db/migrations/000006_create_accounts.up.sql:1`)
- Handler list uses `include_system`/`active_only` rather than spec params. (`apps/api/internal/handler/account.go:24`)
- UI uses runtime `unit` even though schema omits it. (`apps/web/src/components/accounts/account-data-table.tsx:51`)

## What We're NOT Doing
- Implementing account values (account balances) and related endpoints.
- Adding payroll export jobs or integrations.
- Implementing monthly evaluation or capping logic tied to accounts.
- Migrating existing account_type values between old OpenAPI enums (DB already uses new enum values).

## Implementation Approach
1. Align data model and OpenAPI schema to the DB: add missing fields and normalize account_type enum.
2. Update backend handler/service/repository to accept new fields, enforce system read-only behavior, and add usage lookups.
3. Update frontend types, hooks, and UI to the new enum and new fields; add usage display and delete warning.
4. Add/update tests and run generation commands.

## Phase 1: Data Model + OpenAPI Alignment

### Overview
Add missing account fields, add year-carryover configuration, and update OpenAPI schema/requests to match DB enums and fields.

### Changes Required:

#### 1. Accounts migration
**File**: `db/migrations/######_add_account_fields.up.sql`
**Changes**:
- Add `description TEXT`, `is_payroll_relevant BOOLEAN DEFAULT false`, `payroll_code VARCHAR(50)`, `sort_order INT DEFAULT 0`.
- Add `year_carryover BOOLEAN DEFAULT true` (simple carryover toggle for year-end reset).

```sql
ALTER TABLE accounts
  ADD COLUMN description TEXT,
  ADD COLUMN is_payroll_relevant BOOLEAN DEFAULT false,
  ADD COLUMN payroll_code VARCHAR(50),
  ADD COLUMN sort_order INT DEFAULT 0,
  ADD COLUMN year_carryover BOOLEAN DEFAULT true;
```

**File**: `db/migrations/######_add_account_fields.down.sql`
**Changes**: Drop the added columns.

#### 2. Account model
**File**: `apps/api/internal/model/account.go`
**Changes**:
- Add new fields with JSON tags and defaults where needed:
  - `Description *string`
  - `IsPayrollRelevant bool`
  - `PayrollCode *string`
  - `SortOrder int`
  - `YearCarryover bool`

#### 3. OpenAPI schema updates
**File**: `api/schemas/accounts.yaml`
**Changes**:
- Update `account_type` enum to `bonus|tracking|balance`.
- Add `unit` to Account + request schemas.
- Add `year_carryover` to Account + request schemas.
- Keep description/payroll/sort_order fields and mark as nullable where needed.

#### 4. OpenAPI list params
**File**: `api/paths/accounts.yaml`
**Changes**:
- Update `account_type` enum values to match.
- Add `include_system` (boolean) to match handler/UX.
- Keep `active` filter and document behavior.

### Success Criteria:

#### Automated Verification:
- [ ] New migration files exist and lint clean.
- [ ] OpenAPI spec bundles: `make swagger-bundle`.

#### Manual Verification:
- [ ] Schema changes reviewed for backward compatibility with current DB and UI usage.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the migration/schema changes are correct before proceeding.

---

## Phase 2: Backend API + Usage Stats

### Overview
Wire new fields through service/handler, enforce system read-only updates, implement filtering, and add usage lookup.

### Changes Required:

#### 1. Service layer updates
**File**: `apps/api/internal/service/account.go`
**Changes**:
- Extend Create/Update inputs to include description, unit, payroll, sort_order, year_carryover.
- On Create, accept unit and year_carryover (default if missing).
- On Update, allow updating new fields (except account_type/code); block updates for system accounts.
- Add `ErrCannotModifySystem` (or similar) for update attempts.

#### 2. Handler updates
**File**: `apps/api/internal/handler/account.go`
**Changes**:
- List endpoint: support `active` (bool), `account_type` (string), `include_system` (bool) filters.
- Create: map account type directly (no old enum mapping), accept `unit`, `description`, payroll fields, sort_order, year_carryover.
- Update: accept new fields + unit/year_carryover; return 403 when updating system accounts.

#### 3. Repository filtering
**File**: `apps/api/internal/repository/account.go`
**Changes**:
- Add method `ListFiltered(ctx, tenantID, includeSystem, active *bool, accountType *model.AccountType)`.
- Build query with optional WHERE clauses instead of hard-coded `List/ListActive`.
- Keep existing methods for compatibility if used elsewhere.

#### 4. Usage stats endpoint
**File**: `api/paths/accounts.yaml`
**Changes**:
- Add `GET /accounts/{id}/usage` returning usage summary and list of day plans.

**File**: `api/schemas/accounts.yaml`
**Changes**:
- Add `AccountUsage` schema:
  - `account_id`, `usage_count`, `day_plans: [{id, code, name}]`.

**File**: `apps/api/internal/handler/account.go`
**Changes**:
- Add `Usage` handler: fetch account, then query day plan bonuses joined with day_plans for tenant, return list + count.

**File**: `apps/api/internal/repository` (new)
**Changes**:
- Add query helper to list day plans by account_id (join `day_plan_bonuses` and `day_plans`).

#### 5. Codegen
**Files**: `apps/api/gen/models/*`, `apps/web/src/lib/api/types.ts`
**Changes**:
- Regenerate models and TS types.

### Success Criteria:

#### Automated Verification:
- [ ] OpenAPI validation + codegen succeed: `make generate-all`.
- [ ] Go unit tests pass: `make test`.

#### Manual Verification:
- [ ] `GET /accounts` supports account_type/active/include_system filters.
- [ ] System accounts reject update (403) and delete (403).
- [ ] Usage endpoint returns correct day plans for known account.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the API behavior matches requirements before proceeding.

---

## Phase 3: Frontend UI + Hooks

### Overview
Update UI to use new enum values, add unit + year carryover controls, show usage stats, and display delete warnings.

### Changes Required:

#### 1. API hooks
**File**: `apps/web/src/hooks/api/use-accounts.ts`
**Changes**:
- Update accountType union to `bonus|tracking|balance`.
- Use `active` param (bool) and `include_system`.
- Add `useAccountUsage(accountId)` hook for new endpoint.

#### 2. Messages / i18n
**Files**: `apps/web/messages/en.json`, `apps/web/messages/de.json`
**Changes**:
- Add labels: `typeTracking`, `typeBalance`, `unitMinutes/hours/days`, `yearCarryover`.
- Remove or de-emphasize old labels if unused.
- Add usage count labels and delete warning text.

#### 3. Account form
**File**: `apps/web/src/components/accounts/account-form-sheet.tsx`
**Changes**:
- Update account type options to `bonus|tracking|balance`.
- Add unit selector (minutes/hours/days).
- Add year carryover toggle/select.
- Ensure payload includes `unit` and `year_carryover` for create/update.

#### 4. Account list (grouped by type + active toggle + usage count)
**File**: `apps/web/src/components/accounts/account-data-table.tsx`
**Changes**:
- Add usage count column.
- Add active toggle in table row (disabled for system accounts).
- Adjust type config to only new enum values.

**File**: `apps/web/src/app/[locale]/(dashboard)/admin/accounts/page.tsx`
**Changes**:
- Group accounts by type with section headers (Bonus / Tracking / Balance).
- Include usage count in list data (either from list response or fetched lazily per row).
- Use new filters and update labels.

#### 5. Account details + delete warning
**File**: `apps/web/src/components/accounts/account-detail-sheet.tsx`
**Changes**:
- Display year carryover field.
- Fetch and display usage list/count (day plans).

**File**: `apps/web/src/app/[locale]/(dashboard)/admin/accounts/page.tsx`
**Changes**:
- When delete dialog opens, fetch usage data and show warning text if usage_count > 0 (list plan names).

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript type generation succeeds: `make generate-web` (if needed).
- [ ] Frontend builds and typechecks locally.

#### Manual Verification:
- [ ] Accounts list groups by type and shows usage counts.
- [ ] Create/edit form saves unit + year carryover + payroll fields.
- [ ] System accounts show lock badge and cannot be edited/deleted.
- [ ] Delete dialog warns about plan usage and lists plan names.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the UI matches requirements before proceeding.

---

## Phase 4: Tests + Cleanup

### Overview
Update tests to cover new fields, filters, and usage endpoint behavior.

### Changes Required:
- Update service/handler tests for new fields and system read-only updates.
- Add handler tests for list filters (`account_type`, `active`, `include_system`).
- Add usage endpoint tests (day plan bonus usage).

### Success Criteria:

#### Automated Verification:
- [ ] Go tests pass: `make test`.
- [ ] Lint passes: `make lint`.

#### Manual Verification:
- [ ] No regressions in other admin pages or account-related workflows.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that testing is sufficient before proceeding.

---

## Testing Strategy

### Unit Tests
- Account service create/update with new fields.
- Update attempts on system accounts return proper error.
- List filtering by account_type/active/include_system.
- Usage endpoint returns expected day plan list.

### Integration Tests
- Account CRUD with new fields through HTTP handlers.

### Manual Testing Steps
1. Create a new account with type=bonus, unit=hours, year carryover off.
2. Edit the account and toggle active status; verify list updates and detail sheet.
3. View a system account and confirm edit/delete are disabled.
4. Attach account to a day plan bonus, then confirm usage count + delete warning.

## Performance Considerations
- Usage queries should use the existing `day_plan_bonuses.account_id` index for quick lookup.
- Avoid N+1 usage fetches for account list; prefer a count batch or fetch-on-demand for delete/detail.

## Migration Notes
- New columns defaulted to avoid breaking existing data.
- No account_type data migration needed (DB already uses bonus/tracking/balance).

## References
- Research: `thoughts/shared/research/2026-01-28-account-management.md`
- Accounts migration: `db/migrations/000006_create_accounts.up.sql`
- Accounts handler: `apps/api/internal/handler/account.go`
- Admin accounts UI: `apps/web/src/app/[locale]/(dashboard)/admin/accounts/page.tsx`
