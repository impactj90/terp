---
date: 2026-01-28T19:02:10+01:00
researcher: codex
git_commit: 24241a01551581d43928115e96b973fcc8be2164
branch: master
repository: terp
topic: "Booking type configuration (admin UI + API)"
tags: [research, booking-types, api, web]
status: complete
last_updated: 2026-01-28
last_updated_by: codex
---

# Research: Booking type configuration (admin UI + API)

**Date**: 2026-01-28T19:02:10+01:00
**Researcher**: codex
**Git Commit**: 24241a01551581d43928115e96b973fcc8be2164
**Branch**: master
**Repository**: terp

## Research Question
Build booking type configuration for defining clock in/out, break, and errand booking categories, including list/admin UI needs, system types, activation, and usage constraints.

## Summary
- Booking types are modeled in `booking_types` with code/name/description/direction/is_system/is_active, and service-level validation enforces required code/name/direction plus system-type immutability. (`apps/api/internal/model/bookingtype.go:16-27`, `apps/api/internal/service/bookingtype.go:56-171`)
- The booking type API supports list with optional `active` and `direction` query params, and update/delete paths already forbid system-type modification/deletion. (`apps/api/internal/handler/bookingtype.go:24-213`)
- Default list behavior currently uses `ListWithSystem`, which applies an `is_active = true` filter even without the `active` query param. (`apps/api/internal/repository/bookingtype.go:99-111`, `apps/api/internal/service/bookingtype.go:180-193`)
- System booking types are seeded in migrations as COME/GO/BREAK_START/BREAK_END, while dev-mode seeding inserts A1/A2/P1/P2/D1/D2 system types. (`db/migrations/000021_create_booking_types.up.sql:1-31`, `apps/api/internal/auth/devbookingtypes.go:15-66`)
- The web app currently consumes booking types via `useBookingTypes` and uses them in clock-in/out and timesheet flows, but there is no admin booking types page yet; admin UI patterns exist in absence types and accounts pages. (`apps/web/src/hooks/api/use-booking-types.ts:1-43`, `apps/web/src/app/[locale]/(dashboard)/admin/absence-types/page.tsx:1-355`, `apps/web/src/components/accounts/account-data-table.tsx:1-266`)

## Detailed Findings

### Data Model and Storage
- `model.BookingType` holds booking type metadata (tenant scope, code, name, optional description, direction, system/active flags, timestamps). (`apps/api/internal/model/bookingtype.go:16-27`)
- The `booking_types` table is created with a nullable `tenant_id` for system types and seeded with four system codes in the migration. (`db/migrations/000021_create_booking_types.up.sql:1-31`)

### API Surface
- OpenAPI schema requires `code`, `name`, and `direction` for creation and allows `name`, `description`, and `is_active` on updates. (`api/schemas/booking-types.yaml:2-104`)
- HTTP handlers parse `active=true` and `direction=in|out` for list filtering and return errors on invalid IDs or forbidden system mutations. (`apps/api/internal/handler/bookingtype.go:24-213`)

### Service and Repository Behavior
- `BookingTypeService` validates required fields, enforces direction enum, and blocks system updates/deletes. (`apps/api/internal/service/bookingtype.go:56-171`)
- `ListWithSystem` currently filters to `is_active = true`; `ListActive` and `ListByDirection` also filter to active types. (`apps/api/internal/repository/bookingtype.go:99-139`)

### System Type Definitions
- Migration seeds COME/GO/BREAK_START/BREAK_END as system types. (`db/migrations/000021_create_booking_types.up.sql:17-31`)
- Dev-mode seeding inserts A1/A2/P1/P2/D1/D2 system types with German names and descriptions. (`apps/api/internal/auth/devbookingtypes.go:15-66`)

### Frontend Usage & Patterns
- `useBookingTypes` exposes `active` and `direction` query params for GET `/booking-types`. (`apps/web/src/hooks/api/use-booking-types.ts:1-43`)
- Admin UI list patterns (filters, table, create/edit sheets, delete dialogs) are implemented for absence types, and usage-count + activation toggle patterns exist for accounts. (`apps/web/src/app/[locale]/(dashboard)/admin/absence-types/page.tsx:1-355`, `apps/web/src/components/accounts/account-data-table.tsx:1-266`)
- Navigation entries for admin sections are centralized in sidebar config; booking types are not currently present. (`apps/web/src/components/layout/sidebar/sidebar-nav-config.ts:57-205`)

## Code References
- `apps/api/internal/model/bookingtype.go:16-27` - BookingType fields and JSON mapping
- `apps/api/internal/service/bookingtype.go:56-171` - Create/Update/Delete validation and system protections
- `apps/api/internal/repository/bookingtype.go:99-139` - ListWithSystem/ListActive/ListByDirection filters
- `apps/api/internal/handler/bookingtype.go:24-213` - List filters and CRUD endpoints
- `db/migrations/000021_create_booking_types.up.sql:17-31` - System booking type seed data
- `apps/api/internal/auth/devbookingtypes.go:15-66` - Dev-mode A1/A2/P1/P2/D1/D2 system types
- `apps/web/src/hooks/api/use-booking-types.ts:1-43` - Booking type hook usage and filters
- `apps/web/src/app/[locale]/(dashboard)/admin/absence-types/page.tsx:155-301` - Admin list/filter UI pattern
- `apps/web/src/components/accounts/account-data-table.tsx:87-231` - Usage count + activation toggle pattern

## Architecture Documentation
- Booking types are tenant-scoped entities with optional system scope (NULL tenant_id) and are exposed via a service/handler pair. They are retrieved through a simple list/filter flow in the handler and repository, with optional active/direction filters applied. (`apps/api/internal/handler/bookingtype.go:24-61`, `apps/api/internal/repository/bookingtype.go:99-139`)
- Frontend fetches booking types via a typed query hook and uses them in operational flows (clock-in/out, timesheet booking creation), but admin configuration UI is not implemented yet. (`apps/web/src/hooks/api/use-booking-types.ts:1-43`)

## Historical Context (from thoughts/)
- `thoughts/shared/research/2026-01-28-timesheet-booking-integration.md` - Notes on booking type usage in time clock and timesheet flows.
- `thoughts/shared/research/2026-01-22-NOK-130-create-booking-service.md` - Booking service validation references booking type checks.
- `thoughts/shared/research/2026-01-22-NOK-131-create-booking-handler.md` - Booking handler error behaviors for invalid booking types.

## Related Research
- `thoughts/shared/research/2026-01-28-timesheet-booking-integration.md`
- `thoughts/shared/research/2026-01-25-NOK-220-clock-in-out-feature.md`

## Open Questions
- None noted from the current codebase scan.
