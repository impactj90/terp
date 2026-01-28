---
date: 2026-01-28T11:47:02+01:00
researcher: Claude
git_commit: 7ddef55cbf552d5aaf9b32585268ebc7d8f2fde0
branch: master
repository: terp
topic: "Account management for time tracking accounts"
tags: [research, accounts, admin-ui, api]
status: complete
last_updated: 2026-01-28
last_updated_by: Claude
---

# Research: Account management for time tracking accounts

**Date**: 2026-01-28T11:47:02+01:00
**Researcher**: Claude
**Git Commit**: 7ddef55cbf552d5aaf9b32585268ebc7d8f2fde0
**Branch**: master
**Repository**: terp

## Research Question
Implement account management for configuring time tracking accounts (overtime, flextime, surcharges, etc.) with list, create/update form, account types, unit, carryover, payroll, system/custom, activation, and usage stats.

## Summary
The backend already has full CRUD for accounts with DB schema and service/handler layers, including system account seeding and protection. The DB/model use account types `bonus`, `tracking`, `balance` and a `unit` field (minutes/hours/days). The OpenAPI schema and generated client types still use a different account-type enum (`time/bonus/deduction/vacation/sick`) and contain fields not present in the DB/model (description, payroll fields, sort order). The admin accounts UI exists and follows the standard admin page pattern with list, filters, details, and form sheets, but currently uses the OpenAPI enum values and includes form fields that are not persisted by the backend. Day plan bonuses reference accounts, so usage statistics can be derived from day plan bonus associations.

## Detailed Findings

### Database + Model Layer
- Accounts table exists with account_type (`bonus`, `tracking`, `balance`), unit (`minutes`, `hours`, `days`), system + active flags, and seeded system accounts (FLEX, OT, VAC). `tenant_id` is nullable to support system accounts. `UNIQUE(tenant_id, code)` enforces tenant-specific codes. (`db/migrations/000006_create_accounts.up.sql:1`)
- GORM model mirrors the migration and defines `AccountType` and `AccountUnit` enums aligned with the DB (bonus/tracking/balance and minutes/hours/days). (`apps/api/internal/model/account.go:9`)

### Repository + Service + Handler Behavior
- Repository supports list with or without system accounts, list active, and CRUD operations. Listing with system uses `tenant_id IS NULL` and orders system accounts first. (`apps/api/internal/repository/account.go:99`)
- Service validates required code/name/type, defaults unit to minutes on create, and prevents deletion of system accounts. Update only allows name, unit, and active. (`apps/api/internal/service/account.go:54`)
- Handler list endpoint supports `include_system` and `active_only` query params; create maps OpenAPI account types to internal model values, defaults unit to minutes, and ignores schema-only fields (description, payroll, sort order). Update only sets name and is_active from request. (`apps/api/internal/handler/account.go:24`)

### OpenAPI Schema + Paths (Mismatch vs DB/Model)
- OpenAPI schema defines account_type enum values `time/bonus/deduction/vacation/sick`, includes description, payroll fields, and sort_order; it does not include the `unit` field used in the DB/model. (`api/schemas/accounts.yaml:1`)
- Account list query params in the spec use `active`, `account_type`, and `payroll_relevant`, but handler code uses `include_system` and `active_only` (and does not implement account_type or payroll filters). (`api/paths/accounts.yaml:1`, `apps/api/internal/handler/account.go:24`)

### Admin UI (Accounts Page + Components)
- Admin accounts page exists and follows the standard admin pattern: filters (search/type/status/system), count display, list table, detail sheet, create/edit sheet, and delete confirmation. It queries with `includeSystem: true` and applies client-side filtering on `account_type`, `is_active`, and `is_system`. (`apps/web/src/app/[locale]/(dashboard)/admin/accounts/page.tsx:33`)
- Data table renders icons and badges based on account type, supports system badges/locks, and shows a `unit` column using runtime `unit` even though it is missing from the OpenAPI TS types. (`apps/web/src/components/accounts/account-data-table.tsx:51`)
- Form sheet includes fields for description, payroll relevance, payroll code, sort order, and account type options from the OpenAPI enum (`time/bonus/deduction/vacation/sick`). Update requests send these fields, but backend only persists name/is_active (and unit is not exposed here). (`apps/web/src/components/accounts/account-form-sheet.tsx:40`)
- Detail sheet displays configuration fields (unit, payroll relevance, payroll code, sort order), but those fields are currently schema-only in the API and not stored in the DB/model. (`apps/web/src/components/accounts/account-detail-sheet.tsx:179`)
- API hooks include create/update/delete and query list with `account_type`, `active`, and `include_system` params (note the handler uses `active_only`, not `active`). (`apps/web/src/hooks/api/use-accounts.ts:3`)

### Account Usage References (Plans/Surcharges)
- Day plan bonuses reference accounts via `account_id` and include a GORM relation, which is the most direct linkage for “which plans use this account.” (`apps/api/internal/model/dayplan.go:241`)
- The day plan bonuses table includes an indexed `account_id` FK to accounts, supporting usage lookups. (`db/migrations/000017_create_day_plan_bonuses.up.sql:1`)

## Code References
- `db/migrations/000006_create_accounts.up.sql:1` - Accounts table schema + system account seed data.
- `apps/api/internal/model/account.go:9` - Account type + unit enums and model fields.
- `apps/api/internal/repository/account.go:99` - List/ListWithSystem/ListActive data access patterns.
- `apps/api/internal/service/account.go:54` - Create/Update validation, default unit, system delete protection.
- `apps/api/internal/handler/account.go:24` - Handler list filters and create/update behavior.
- `api/schemas/accounts.yaml:1` - OpenAPI schema fields/enums (mismatched types, extra fields, missing unit).
- `api/paths/accounts.yaml:1` - List parameters and CRUD endpoints.
- `apps/web/src/app/[locale]/(dashboard)/admin/accounts/page.tsx:33` - Admin accounts page layout and filters.
- `apps/web/src/components/accounts/account-form-sheet.tsx:40` - Form fields and account type options used in the UI.
- `apps/web/src/components/accounts/account-data-table.tsx:51` - Type icons/badges and unit display in list.
- `apps/web/src/components/accounts/account-detail-sheet.tsx:179` - Detail view rendering of configuration fields.
- `apps/web/src/hooks/api/use-accounts.ts:3` - Accounts hook query params/mutations.
- `apps/api/internal/model/dayplan.go:241` - Day plan bonus → account relationship.
- `db/migrations/000017_create_day_plan_bonuses.up.sql:1` - Account usage link via day_plan_bonuses.

## Architecture Documentation
- Accounts are tenant-scoped with optional system accounts (tenant_id NULL). The backend exposes standard CRUD handlers through `/accounts` and `/accounts/{id}`, and list endpoints support optional inclusion of system accounts and active-only filtering via query params. The admin UI consumes these endpoints using `useAccounts` and renders list/detail/form sheets following the common admin management pattern.
- The primary code-level usage of accounts today is via day plan bonuses (surcharges), which attach an account to a time window and calculation configuration. This provides a concrete linkage between accounts and plan configuration.

## Historical Context (from thoughts/)
- `thoughts/shared/research/2026-01-27-NOK-237-account-management.md` - Earlier account-management research (backend CRUD + schema mismatches).
- `thoughts/shared/reference/zmi-calculation-manual-reference.md` - ZMI account terminology and carryover concepts referenced in planning.

## Related Research
- `thoughts/shared/research/2026-01-27-NOK-237-account-management.md`
- `thoughts/shared/research/2026-01-27-zmi-calculation-implementation-check.md`

## Open Questions
- None identified in current codebase research; implementation work is needed to align schema/model/UI and add carryover + usage statistics.
