---
date: 2026-01-29T10:53:01+01:00
researcher: codex
git_commit: cbc98d50544465e0408ba40ab28440a96d416449
branch: master
repository: terp
topic: "ZMI-TICKET-001: Mandant Master Data (Tenant) and Core Attributes"
tags: [research, tenant, mandant, api, vacation]
status: complete
last_updated: 2026-01-29
last_updated_by: codex
---

# Research: ZMI-TICKET-001: Mandant Master Data (Tenant) and Core Attributes

**Date**: 2026-01-29T10:53:01+01:00
**Researcher**: codex
**Git Commit**: cbc98d50544465e0408ba40ab28440a96d416449
**Branch**: master
**Repository**: terp

## Research Question
Provide a codebase map for Mandant (tenant) master data, tenant scoping, and where vacation basis defaults are currently sourced, aligned with ZMI-TICKET-001 requirements.

## Summary
The codebase already models tenants as the core multi-tenant entity with CRUD endpoints and middleware enforcing tenant context and active status. The tenant model currently stores only name, slug, settings JSON, and active flag; the database schema and OpenAPI schemas/paths align with this minimal structure. Mandant-specific master data fields (company/address/contact/payroll path/notes/vacation basis) are not present in the tenant schema yet. Vacation calculation currently defaults to calendar-year basis inside the vacation service, while tariff records support a vacation basis field; there is no tenant-level basis default in use. The manual reference (ZMI 3.2) lists company data, notes, and vacation calculation basis as Mandant master data attributes, and there is no admin UI implemented for tenant management in the frontend.

## Detailed Findings

### Tenant/Mandant Data Model (Current State)
- The `Tenant` model includes `name`, `slug`, `settings` (JSON), and `is_active` plus timestamps. There are no mandant-specific fields like address, payroll export path, notes, or vacation basis. ([apps/api/internal/model/tenant.go](https://github.com/impactj90/terp/blob/cbc98d50544465e0408ba40ab28440a96d416449/apps/api/internal/model/tenant.go#L1))
- The tenants table migration matches the model: `name`, `slug`, `settings`, `is_active`, and timestamps. ([db/migrations/000002_create_tenants.up.sql](https://github.com/impactj90/terp/blob/cbc98d50544465e0408ba40ab28440a96d416449/db/migrations/000002_create_tenants.up.sql#L1))

### Tenant API + OpenAPI Surface
- OpenAPI schemas define `Tenant`, `CreateTenantRequest`, and `UpdateTenantRequest` with only `name`, `slug`, `settings`, and `is_active`. ([api/schemas/tenants.yaml](https://github.com/impactj90/terp/blob/cbc98d50544465e0408ba40ab28440a96d416449/api/schemas/tenants.yaml#L1))
- OpenAPI paths expose `GET /tenants`, `POST /tenants`, and `GET/PATCH/DELETE /tenants/{id}`. The DELETE endpoint is described as a permanent delete; PATCH supports name/active updates. ([api/paths/tenants.yaml](https://github.com/impactj90/terp/blob/cbc98d50544465e0408ba40ab28440a96d416449/api/paths/tenants.yaml#L1))
- Handler/service/repository layers implement the CRUD behavior that matches the OpenAPI shape; update always overwrites `is_active` due to non-pointer boolean in the generated schema. ([apps/api/internal/handler/tenant.go](https://github.com/impactj90/terp/blob/cbc98d50544465e0408ba40ab28440a96d416449/apps/api/internal/handler/tenant.go#L1), [apps/api/internal/service/tenant.go](https://github.com/impactj90/terp/blob/cbc98d50544465e0408ba40ab28440a96d416449/apps/api/internal/service/tenant.go#L1), [apps/api/internal/repository/tenant.go](https://github.com/impactj90/terp/blob/cbc98d50544465e0408ba40ab28440a96d416449/apps/api/internal/repository/tenant.go#L1))

### Tenant Scoping + Active Enforcement
- The tenant middleware requires `X-Tenant-ID`, verifies the tenant exists and is active, and injects `tenant_id` into context for downstream handlers. ([apps/api/internal/middleware/tenant.go](https://github.com/impactj90/terp/blob/cbc98d50544465e0408ba40ab28440a96d416449/apps/api/internal/middleware/tenant.go#L1))
- Tenant scoping is already standard across domain models through `tenant_id` foreign keys (e.g., employees, day plans, bookings, vacations). This is reflected broadly in existing migrations and models.

### Vacation Basis Defaults
- Tariffs define `vacation_basis` with allowed values `calendar_year` or `entry_date`. ([apps/api/internal/model/tariff.go](https://github.com/impactj90/terp/blob/cbc98d50544465e0408ba40ab28440a96d416449/apps/api/internal/model/tariff.go#L12))
- Vacation balance initialization currently hardcodes `calendar_year` basis in the service layer; there is no tenant-level default applied. ([apps/api/internal/service/vacation.go](https://github.com/impactj90/terp/blob/cbc98d50544465e0408ba40ab28440a96d416449/apps/api/internal/service/vacation.go#L90))

### Manual Reference (ZMI 3.2 Mandant Master Data)
- The ZMI manual specifies Mandant master data as company name/address/export path, notes, and a vacation calculation basis choice (calendar year vs entry date). ([impl_plan/zmi-docs/02-users-and-timeplans.md](https://github.com/impactj90/terp/blob/cbc98d50544465e0408ba40ab28440a96d416449/impl_plan/zmi-docs/02-users-and-timeplans.md#L29))

### Frontend Admin UI
- Tenant admin navigation exists but no management UI is implemented; a Not Found page is expected. ([thoughts/shared/docs/admin-tenants.md](https://github.com/impactj90/terp/blob/cbc98d50544465e0408ba40ab28440a96d416449/thoughts/shared/docs/admin-tenants.md#L1))

## Code References
- `apps/api/internal/model/tenant.go:10` - Tenant model fields (name/slug/settings/is_active).
- `db/migrations/000002_create_tenants.up.sql:4` - tenants table schema in migration.
- `api/schemas/tenants.yaml:1` - OpenAPI tenant schemas.
- `api/paths/tenants.yaml:1` - Tenant endpoints (list/create/get/update/delete).
- `apps/api/internal/handler/tenant.go:22` - Tenant CRUD handlers.
- `apps/api/internal/service/tenant.go:39` - Tenant create/list/update/delete service logic.
- `apps/api/internal/repository/tenant.go:28` - Tenant repository data access.
- `apps/api/internal/middleware/tenant.go:35` - Tenant context enforcement and active checks.
- `apps/api/internal/service/vacation.go:103` - Vacation calculation basis default is `calendar_year`.
- `apps/api/internal/model/tariff.go:12` - Tariff vacation basis enum and field.
- `impl_plan/zmi-docs/02-users-and-timeplans.md:29` - Mandant master data manual reference.
- `thoughts/shared/docs/admin-tenants.md:1` - Tenant admin UI not implemented.

## Architecture Documentation
- Tenants are the root entity for multi-tenancy. Middleware requires `X-Tenant-ID` and blocks inactive tenants, then stores `tenant_id` in request context for downstream handlers. CRUD for tenants is implemented through repository/service/handler layers, and OpenAPI defines the same surface.
- Vacation calculation logic relies on `calculation.VacationBasis` and currently defaults to calendar-year inside the vacation service. Tariff data contains a `vacation_basis` field but is not wired into the vacation service defaults.

## Historical Context (from thoughts/)
- `thoughts/shared/tickets/ZMI-TICKET-001-mandant-master-data.md` - Source ticket describing Mandant master data requirements and tests.
- `thoughts/shared/docs/admin-tenants.md` - Notes on missing tenant management UI.
- `thoughts/shared/research/2026-01-24-NOK-140-create-vacation-service.md` - Prior research on vacation service implementation, including basis handling.
- `thoughts/shared/research/2026-01-22-NOK-128-create-daily-calculation-service.md` - Notes on tenant settings usage in calculations.

## Related Research
- `thoughts/shared/research/2026-01-24-NOK-139-vacation-calculation-logic.md`
- `thoughts/shared/research/2026-01-24-NOK-140-create-vacation-service.md`
- `thoughts/shared/research/2026-01-22-zmi-clone-progress-assessment.md`

## Open Questions
- None from existing code; Mandant-specific master data fields and tenant-level vacation basis defaults are not yet implemented.
