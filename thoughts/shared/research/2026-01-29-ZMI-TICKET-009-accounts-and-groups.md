---
date: 2026-01-29T12:00:00+01:00
researcher: Claude
git_commit: f41eb92
branch: master
repository: terp
topic: "ZMI-TICKET-009: Accounts and Account Groups - Codebase Research"
tags: [research, codebase, accounts, account-groups, konten, lohnart, payroll]
status: complete
last_updated: 2026-01-29
last_updated_by: Claude
---

# Research: ZMI-TICKET-009 Accounts and Account Groups

**Date**: 2026-01-29T12:00:00+01:00
**Researcher**: Claude
**Git Commit**: f41eb92
**Branch**: master
**Repository**: terp

## Research Question
What is the current state of the accounts implementation and what patterns exist in the codebase for implementing account groups, as required by ZMI-TICKET-009?

## Summary

The codebase already has a **fully functional Account entity** spanning migration, model, repository, service, handler, and OpenAPI layers. Most ticket-required fields (code, name, payroll code, carry-forward, export flag, active flag, sort order, account type, unit) already exist. **Account Groups do not yet exist** and require a new implementation. The `AbsenceTypeGroup` entity provides an exact template for the group pattern. Two ticket-specified fields (bonus factor, display format) are not present in the current model, and the account type enum values differ from the ticket specification.

## Detailed Findings

### 1. Existing Account Implementation

#### Database Migration
Two migrations define the accounts table:

**`db/migrations/000006_create_accounts.up.sql`** - Base table:
```sql
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    account_type VARCHAR(20) NOT NULL,  -- 'bonus', 'tracking', 'balance'
    unit VARCHAR(20) NOT NULL DEFAULT 'minutes',  -- 'minutes', 'hours', 'days'
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);
```
System accounts seeded: FLEX (Flextime/balance/minutes), OT (Overtime/balance/minutes), VAC (Vacation/balance/days).

**`db/migrations/000033_add_account_fields.up.sql`** - Payroll and extended fields:
```sql
ALTER TABLE accounts
  ADD COLUMN description TEXT,
  ADD COLUMN is_payroll_relevant BOOLEAN DEFAULT false,
  ADD COLUMN payroll_code VARCHAR(50),
  ADD COLUMN sort_order INT DEFAULT 0,
  ADD COLUMN year_carryover BOOLEAN DEFAULT true;
```

#### Domain Model
**`apps/api/internal/model/account.go`** defines:
- `Account` struct with all fields (lines 25-42)
- `AccountType` enum: `bonus`, `tracking`, `balance` (lines 9-15)
- `AccountUnit` enum: `minutes`, `hours`, `days` (lines 17-23)
- `AccountUsageDayPlan` helper struct for usage queries (lines 44-49)
- Nullable `TenantID` (`*uuid.UUID`) for system accounts
- Computed `UsageCount` field (`gorm:"-"`)

#### Repository
**`apps/api/internal/repository/account.go`** provides:
- Standard CRUD: `Create`, `GetByID`, `GetByCode`, `Update`, `Delete` (lines 29-108)
- `Upsert` with `ON CONFLICT (tenant_id, code)` clause (lines 72-91)
- `List`, `ListWithSystem`, `GetSystemAccounts`, `ListActive` (lines 110-164)
- `ListFiltered` with usage count subquery via LEFT JOIN (lines 166-195)
- `ListDayPlansUsingAccount` for account usage tracking (lines 197-212)

#### Service
**`apps/api/internal/service/account.go`** implements:
- Validation: code required, name required, account type required (lines 63-75)
- Uniqueness check via `GetByCode` before create (lines 87-91)
- System account protection: cannot modify or delete system accounts (lines 19-21, 151-153, 198-201)
- `CreateAccountInput` and `UpdateAccountInput` structs (lines 48-60, 134-143)
- Filtered listing passthrough to repository (lines 226-229)
- Usage query for day plan references (lines 231-234)

#### Handler
**`apps/api/internal/handler/account.go`** provides:
- REST endpoints: List, Get, Create, Update, Delete, Usage (lines 31-290)
- Uses generated `models.CreateAccountRequest` and `models.UpdateAccountRequest` (lines 97, 178)
- `parseAccountType()` maps API values including aliases (`time` → tracking, `vacation`/`sick`/`deduction` → balance) (lines 278-290)
- Error pattern matching for service errors (lines 152-164, 211-221, 236-244)

#### Route Registration
**`apps/api/internal/handler/routes.go:128-148`**:
```go
func RegisterAccountRoutes(r chi.Router, h *AccountHandler, authz *middleware.AuthorizationMiddleware) {
    r.Route("/accounts", func(r chi.Router) {
        r.Get("/", h.List)
        r.Post("/", h.Create)
        r.Get("/{id}", h.Get)
        r.Get("/{id}/usage", h.Usage)
        r.Patch("/{id}", h.Update)
        r.Delete("/{id}", h.Delete)
    })
}
```

#### OpenAPI Specification
- **Schemas** at `api/schemas/accounts.yaml`: Account, AccountSummary, AccountValue, CreateAccountRequest, UpdateAccountRequest, AccountList, AccountValueList, AccountUsage, AccountUsageDayPlan
- **Paths** at `api/paths/accounts.yaml`: `/accounts` (GET, POST), `/accounts/{id}` (GET, PATCH, DELETE), `/accounts/{id}/usage` (GET), `/account-values` (GET)

### 2. Ticket Requirements vs Current State

| Ticket Field | DB Column | Model Field | Status |
|---|---|---|---|
| Account number/code | `code VARCHAR(50)` | `Code string` | **Exists** |
| Name | `name VARCHAR(255)` | `Name string` | **Exists** |
| Payroll type (Lohnart) | `payroll_code VARCHAR(50)` | `PayrollCode *string` | **Exists** |
| Format (decimal/HH:MM) | — | — | **Missing** (unit field covers measurement type but not display format) |
| Account type (day/month/bonus) | `account_type VARCHAR(20)` | `AccountType` | **Different values**: codebase uses bonus/tracking/balance |
| Bonus factor | — | — | **Missing** |
| Carry-forward flag (year-end) | `year_carryover BOOLEAN` | `YearCarryover bool` | **Exists** |
| Export flag | `is_payroll_relevant BOOLEAN` | `IsPayrollRelevant bool` | **Exists** |
| Active flag | `is_active BOOLEAN` | `IsActive bool` | **Exists** |
| Account groups | — | — | **Missing** - Not yet implemented |

### 3. Account Groups - Template: AbsenceTypeGroup

The `AbsenceTypeGroup` is the closest existing pattern for implementing `AccountGroup`. It demonstrates the full stack for a group entity with an FK from the grouped entity.

#### AbsenceTypeGroup Migration (`db/migrations/000042_create_absence_type_groups.up.sql`)
```sql
CREATE TABLE absence_type_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);
-- Plus: ALTER TABLE absence_types ADD COLUMN absence_type_group_id UUID REFERENCES absence_type_groups(id) ON DELETE SET NULL;
```

#### AbsenceTypeGroup Model (`apps/api/internal/model/absencetypegroup.go`)
```go
type AbsenceTypeGroup struct {
    ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
    TenantID    uuid.UUID `gorm:"type:uuid;not null;index"`
    Code        string    `gorm:"type:varchar(50);not null"`
    Name        string    `gorm:"type:varchar(255);not null"`
    Description *string   `gorm:"type:text"`
    IsActive    bool      `gorm:"default:true"`
    CreatedAt   time.Time `gorm:"default:now()"`
    UpdatedAt   time.Time `gorm:"default:now()"`
}
```

#### AbsenceTypeGroup in Parent Entity (`apps/api/internal/model/absencetype.go:65-66`)
```go
AbsenceTypeGroupID *uuid.UUID        `gorm:"type:uuid" json:"absence_type_group_id,omitempty"`
AbsenceTypeGroup   *AbsenceTypeGroup `gorm:"foreignKey:AbsenceTypeGroupID"`
```

Full implementation exists across:
- Repository: `apps/api/internal/repository/absencetypegroup.go` (CRUD + GetByCode)
- Service: `apps/api/internal/service/absencetypegroup.go` (validation, uniqueness)
- Handler: `apps/api/internal/handler/absencetypegroup.go` (REST endpoints with generated models)
- Routes: `apps/api/internal/handler/routes.go:630-648` (RegisterAbsenceTypeGroupRoutes)
- OpenAPI: `api/schemas/absence-type-groups.yaml`, `api/paths/absence-type-groups.yaml`

### 4. Account References in Other Entities

Accounts are currently referenced by:

- **DayPlanBonus** (`apps/api/internal/model/dayplan.go:243-257`): `AccountID uuid.UUID` + `Account *Account` relation - bonuses write to accounts
- **Corrections** (`api/schemas/corrections.yaml`): account_adjustment correction type references accounts
- **Monthly Values** (`api/schemas/monthly-values.yaml:83-86`): `account_balances` JSON field maps account_id to minutes
- **Payroll Exports** (`api/schemas/payroll-exports.yaml`): `include_accounts` filter and `account_values` in export output
- **Reports** (`api/schemas/reports.yaml:27,156`): `account_balances` in report data
- **Tariffs** (`apps/api/internal/model/tariff.go:135,139`): Upper/lower limits reference annual flextime account concept

### 5. Ordering Patterns in Codebase

Two patterns exist for ordered entities:

**Pattern A: sort_order (Loose ordering)**
- Used by: accounts, absence types, day plan breaks, day plan bonuses
- Column: `sort_order INT DEFAULT 0`
- No uniqueness constraint - allows gaps and duplicates
- SQL: `ORDER BY sort_order ASC, code ASC`

**Pattern B: sequence_order (Strict ordering)**
- Used by: tariff_week_plans, tariff_day_plans
- Column: `sequence_order INT NOT NULL`
- UNIQUE constraint: `UNIQUE(parent_id, sequence_order)`
- Used for cyclic/rotational position logic

The ticket says "Ordered list of accounts for display/reporting" - this fits Pattern A (sort_order) for the group-to-account relationship, or simply ordering accounts within a group via their existing `sort_order` field.

### 6. Generated Models

Account-related generated models in `apps/api/gen/models/`:
- `account.go` - Full account response
- `account_list.go` - List wrapper
- `account_summary.go` - Compact reference
- `account_usage.go` - Usage info
- `account_value.go` / `account_value_list.go` - Time-series values
- `create_account_request.go` - Create request
- `update_account_request.go` - Update request

## Code References

- `apps/api/internal/model/account.go:25-42` - Account domain model
- `apps/api/internal/repository/account.go:19-212` - Account repository (full CRUD + filters)
- `apps/api/internal/service/account.go:39-234` - Account service (validation + business logic)
- `apps/api/internal/handler/account.go:17-290` - Account HTTP handler
- `apps/api/internal/handler/routes.go:128-148` - Account route registration
- `api/schemas/accounts.yaml` - OpenAPI schemas
- `api/paths/accounts.yaml` - OpenAPI endpoints
- `db/migrations/000006_create_accounts.up.sql` - Base accounts table
- `db/migrations/000033_add_account_fields.up.sql` - Extended fields
- `apps/api/internal/model/absencetypegroup.go` - Template for AccountGroup model
- `apps/api/internal/repository/absencetypegroup.go` - Template for AccountGroup repo
- `apps/api/internal/service/absencetypegroup.go` - Template for AccountGroup service
- `apps/api/internal/handler/absencetypegroup.go` - Template for AccountGroup handler
- `db/migrations/000042_create_absence_type_groups.up.sql` - Template for AccountGroup migration
- `apps/api/internal/model/dayplan.go:241-257` - DayPlanBonus referencing Account

## Architecture Documentation

### Account Entity Stack

```
OpenAPI Spec                    Generated Models
api/schemas/accounts.yaml  -->  apps/api/gen/models/account*.go
api/paths/accounts.yaml         (via make generate)

Handler Layer                   Service Layer                  Repository Layer
handler/account.go          --> service/account.go         --> repository/account.go
  - uses gen/models             - validation                   - GORM queries
  - request parsing             - uniqueness checks            - tenant scoping
  - response mapping            - system account protection    - filtered listing
  - error mapping               - input/output types           - upsert support

Domain Model                    Database
model/account.go            --> accounts table
  - Account struct              - 000006_create_accounts
  - AccountType enum            - 000033_add_account_fields
  - AccountUnit enum
```

### Group Entity Pattern (from AbsenceTypeGroup)

```
GROUP TABLE                     GROUPED ENTITY TABLE
account_groups                  accounts
  id                            id
  tenant_id                     tenant_id
  code (UNIQUE per tenant)      code (UNIQUE per tenant)
  name                          account_group_id --> FK to account_groups
  description                   ... other fields
  is_active
```

Relationship: One AccountGroup has many Accounts. Account optionally belongs to one AccountGroup (nullable FK, ON DELETE SET NULL).

## Historical Context (from thoughts/)

- `thoughts/shared/tickets/ZMI-TICKET-009-accounts-and-groups.md` - The source ticket defining requirements
- `thoughts/shared/research/2026-01-28-account-management.md` - Previous research on account management
- `thoughts/shared/research/2026-01-27-NOK-237-account-management.md` - Earlier NOK-237 research on accounts
- `thoughts/shared/plans/2026-01-28-account-management.md` - Implementation plan for account management
- `thoughts/shared/docs/admin-accounts.md` - User documentation for accounts admin page
- `thoughts/shared/reference/zmi-calculation-manual-reference.md` - ZMI manual with Konto/Lohnart references
- `thoughts/shared/tickets/ZMI-TICKET-007-absence-types.md` - Related ticket showing group pattern
- `thoughts/shared/tickets/ZMI-TICKET-010-booking-types-and-groups.md` - Another group pattern ticket

## Open Questions

1. **Account type enum alignment**: Ticket specifies day/month/bonus but codebase uses bonus/tracking/balance. Are these equivalent mappings or do additional types need to be added?
2. **Format field**: Ticket mentions "Format (decimal or hours:minutes)" as a display format. Is this a new field needed on the Account model, or is the existing `unit` field sufficient for this purpose?
3. **Bonus factor**: Ticket lists "Bonus factor (used in macros/reports)" as a field. This does not exist in the current model. What is the expected data type and usage?
4. **Group ordering**: Should accounts within a group maintain a group-specific sort order (via a junction table with position), or should the existing `sort_order` field on the Account itself suffice?
5. **Payroll export filtering**: The ticket mentions "List accounts by type and export flag" as an endpoint. The current `ListFiltered` method supports `account_type` and `active` filters but not `is_payroll_relevant`. Should the filter be added?
