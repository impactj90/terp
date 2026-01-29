# ZMI-TICKET-001 Mandant Master Data (Tenant) Implementation Plan

## Overview

Expand tenant (Mandant) master data to cover company identity and defaults, update API/OpenAPI, and wire tenant-level vacation basis into vacation calculation defaults while preserving existing tenant scoping.

## Current State Analysis

- Tenants are modeled with `name`, `slug`, `settings`, and `is_active` only, and CRUD endpoints are already present. (`apps/api/internal/model/tenant.go:10`, `api/paths/tenants.yaml:1`)
- Tenant middleware enforces `X-Tenant-ID` and active status, establishing tenant scoping for most entities. (`apps/api/internal/middleware/tenant.go:35`)
- Vacation calculation defaults to `calendar_year` in `VacationService.InitializeYear` and does not consult tenant or tariff defaults. (`apps/api/internal/service/vacation.go:103`)
- ZMI manual 3.2 defines Mandant master data fields including company data, notes, and vacation basis. (`impl_plan/zmi-docs/02-users-and-timeplans.md:29`)

## Desired End State

- Tenants (Mandant) store full master data fields (company/address/contact/payroll path/notes/vacation basis/is_active).
- CRUD endpoints accept and return full field set, with validation for required fields and enum constraints.
- `GET /tenants` defaults to active-only results, with filters for `name` and `active`, and optional inclusion of inactive tenants.
- Deactivation is supported via API (and reflected in list filtering and tenant middleware).
- Vacation calculation uses tenant vacation basis as default when no tariff override is present.

### Key Discoveries:
- Tenant CRUD and schema exist but are minimal. (`apps/api/internal/handler/tenant.go:22`)
- Tariffs already define `vacation_basis`, which can be used as an override. (`apps/api/internal/model/tariff.go:12`)

## What We're NOT Doing

- Holiday generation or holiday import logic.
- System settings options beyond tenant master data fields.
- Payroll export configuration beyond storing a base path field.
- Frontend UI for tenant management.

## Implementation Approach

- Extend the tenants table with new columns via migration and update the `Tenant` model.
- Update OpenAPI schemas/paths to include the new fields and query filters, then regenerate Go/TS types.
- Update tenant repository/service/handler to validate required fields, support filtering, and support deactivation without hard deletes.
- Update vacation service to resolve vacation basis by priority: tariff (if present) → tenant → calendar year default.
- Update tests to cover the new fields, filtering behavior, deactivation, and vacation basis default behavior.

## Phase 1: Data Model + Migration

### Overview
Add Mandant master data fields to the tenants table and Go model.

### Changes Required:

#### 1. Tenants Migration
**File**: `db/migrations/0000XX_add_tenant_mandant_fields.up.sql`
**Changes**: Add new columns for address/contact/payroll/notes/vacation_basis with defaults and constraints.

```sql
ALTER TABLE tenants
  ADD COLUMN address_street VARCHAR(255),
  ADD COLUMN address_zip VARCHAR(20),
  ADD COLUMN address_city VARCHAR(100),
  ADD COLUMN address_country VARCHAR(100),
  ADD COLUMN phone VARCHAR(50),
  ADD COLUMN email VARCHAR(255),
  ADD COLUMN payroll_export_base_path TEXT,
  ADD COLUMN notes TEXT,
  ADD COLUMN vacation_basis VARCHAR(20) DEFAULT 'calendar_year';

ALTER TABLE tenants
  ADD CONSTRAINT chk_tenants_vacation_basis
  CHECK (vacation_basis IN ('calendar_year', 'entry_date'));
```

**File**: `db/migrations/0000XX_add_tenant_mandant_fields.down.sql`
**Changes**: Drop the added columns and constraint.

#### 2. Tenant Model
**File**: `apps/api/internal/model/tenant.go`
**Changes**: Add new fields with JSON tags; reuse `model.VacationBasis` for `VacationBasis` and add `GetVacationBasis()` helper.

### Success Criteria:

#### Automated Verification:
- [ ] Migration applies cleanly: `make migrate-up`
- [ ] Down migration rolls back cleanly: `make migrate-down`

#### Manual Verification:
- [ ] Inspect `tenants` table for new columns after migration.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: OpenAPI + Generated Types

### Overview
Expose new fields and list filters in OpenAPI, then regenerate Go/TS models.

### Changes Required:

#### 1. Tenant Schemas
**File**: `api/schemas/tenants.yaml`
**Changes**: Add properties for address/contact/payroll/notes/vacation_basis, required fields for create, and `x-nullable` for optional update fields.

#### 2. Tenant Paths
**File**: `api/paths/tenants.yaml`
**Changes**: Add query params for `name`, `active`, and `include_inactive`; update delete description to deactivation semantics.

#### 3. Regenerate Models
**Command**: `make generate-all`

### Success Criteria:

#### Automated Verification:
- [ ] OpenAPI bundles and validates: `make swagger-bundle`
- [ ] Go models regenerate: `make generate`
- [ ] Web API types regenerate: `make generate-web`

#### Manual Verification:
- [ ] Inspect generated Tenant models to confirm new fields and pointer semantics for update.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Tenant CRUD + Filtering + Deactivation

### Overview
Update repository/service/handler to validate Mandant fields, support filters, and implement deactivation flow.

### Changes Required:

#### 1. Repository Filtering
**File**: `apps/api/internal/repository/tenant.go`
**Changes**: Replace `List(ctx, activeOnly bool)` with `List(ctx, filters TenantListFilters)` supporting name + active filtering.

#### 2. Service Layer Validation
**File**: `apps/api/internal/service/tenant.go`
**Changes**:
- Introduce `CreateTenantInput` and `UpdateTenantInput` with validation.
- Require `name`, `address_street`, `address_zip`, `address_city`, `address_country` on create.
- Default `vacation_basis` to `calendar_year` if empty.
- Add `Deactivate(ctx, id)` or modify `Delete` to set `is_active=false`.

#### 3. Handler Updates
**File**: `apps/api/internal/handler/tenant.go`
**Changes**:
- Parse query params `name`, `active`, `include_inactive`.
- Default list to active-only unless `include_inactive=true` or explicit `active` filter.
- Map create/update requests to new input structs.
- Implement deactivation on DELETE or add a dedicated deactivate route (consistent with OpenAPI updates).

### Success Criteria:

#### Automated Verification:
- [ ] Tenant handler tests updated and passing: `go test ./internal/handler -run Tenant`
- [ ] Tenant service tests updated and passing: `go test ./internal/service -run Tenant`
- [ ] Tenant repository tests updated and passing: `go test ./internal/repository -run Tenant`

#### Manual Verification:
- [ ] `POST /tenants` with full field set returns all fields.
- [ ] `GET /tenants` excludes inactive by default; `include_inactive=true` shows all.
- [ ] Deactivation endpoint sets `is_active=false` and prevents tenant usage in middleware.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Vacation Basis Default Integration

### Overview
Use tenant vacation basis as default when tariff is not set.

### Changes Required:

#### 1. Vacation Service Dependency Update
**File**: `apps/api/internal/service/vacation.go`
**Changes**:
- Inject `tenantRepo` (and optionally `tariffRepo`) into `VacationService`.
- Add helper `resolveVacationBasis(employee)` that prioritizes tariff basis if present, otherwise tenant basis.
- Set calculation input `Basis` from the resolved value.

#### 2. Wiring Updates
**Files**:
- `apps/api/cmd/server/main.go`
- `apps/api/internal/handler/vacation_test.go`
- `apps/api/internal/service/vacation_test.go`

**Changes**: Update constructor usage to pass new repositories/mocks.

#### 3. Tests
**File**: `apps/api/internal/service/vacation_test.go`
**Changes**: Add a unit test that verifies tenant basis is used when tariff basis is absent.

### Success Criteria:

#### Automated Verification:
- [ ] Vacation service tests pass: `go test ./internal/service -run Vacation`
- [ ] All API tests pass: `make test`

#### Manual Verification:
- [ ] Create a tenant with `vacation_basis=entry_date`, create an employee without a tariff, initialize vacation year, and confirm entry-date basis behavior.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:
- Tenant validation for required fields and vacation basis enum.
- Tenant list filtering by name and active/include_inactive.
- Vacation basis resolution order (tariff → tenant → default).

### Integration Tests:
- Create tenant with full fields and verify persistence via API.
- Deactivate tenant and verify filtering and middleware blocking.
- Vacation service uses tenant basis when no tariff override.

### Manual Testing Steps:
1. `POST /tenants` with full payload; verify response includes all fields.
2. `PATCH /tenants/{id}` update address and notes; verify response.
3. `DELETE /tenants/{id}` (deactivate) and `GET /tenants` default excludes it.
4. `GET /tenants?include_inactive=true` returns both active and inactive.
5. Trigger vacation initialization and confirm basis behavior for tenant default vs tariff override.

## Performance Considerations

- Tenant list filtering uses simple indexed columns (`is_active`) plus `ILIKE` on `name`; no additional performance constraints identified.

## Migration Notes

- New columns are nullable to avoid breaking existing data; API validation will enforce required fields for new tenants.
- Default `vacation_basis` set to `calendar_year` for existing rows.

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-001-mandant-master-data.md`
- Research: `thoughts/shared/research/2026-01-29-ZMI-TICKET-001-mandant-master-data.md`
- Manual: `impl_plan/zmi-docs/02-users-and-timeplans.md`
