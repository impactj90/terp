---
date: 2026-01-29T11:32:24+01:00
researcher: codex
git_commit: 3fb3145cd7d990f6fa61ad6aafc290195b3e69c8
branch: master
repository: terp
topic: "ZMI-TICKET-002: Holiday management with categories, generation, and recalculation"
tags: [research, holidays, api, web, recalculation, zmi]
status: complete
last_updated: 2026-01-29
last_updated_by: codex
---

# Research: ZMI-TICKET-002: Holiday management with categories, generation, and recalculation

**Date**: 2026-01-29T11:32:24+01:00
**Researcher**: codex
**Git Commit**: 3fb3145cd7d990f6fa61ad6aafc290195b3e69c8
**Branch**: master
**Repository**: terp

## Research Question
ZMI-TICKET-002 holiday management with categories (1/2/3), generation, and recalculation triggers; identify current holiday model/API/UI and where category + recalculation logic would integrate.

## Summary
- Holidays are currently modeled with `is_half_day` (boolean) and stored in `holidays` table with uniqueness per tenant+date; no holiday category field exists in the model, DB schema, or OpenAPI schemas. The API exposes CRUD, list by year or date range, and the UI is built around full vs half-day toggles. 
- Holiday data is used as a boolean flag in daily calculation and absence creation (skipping holiday dates), but holiday categories are not wired into calculation logic yet. Day plan models already store holiday credit categories, but daily calc uses a default config rather than holiday-specific categories.
- Holiday generation/copy by year/state is not implemented; the only existing holiday generation is a static dev seed list for Bavarian 2026 holidays.
- Recalculation is available via a dedicated `RecalcService` used by other domains (bookings/absences), but holiday CRUD does not currently trigger any recalc service or expose recalc endpoints.

## Detailed Findings

### Data model & persistence
- `model.Holiday` includes `HolidayDate`, `Name`, `IsHalfDay`, `AppliesToAll`, optional `DepartmentID`, timestamps; no category field exists. (https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/model/holiday.go#L9-L18)
- The initial migration creates `holidays` with `is_half_day` and a uniqueness constraint on `(tenant_id, holiday_date)`. (https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/db/migrations/000003_create_holidays.up.sql#L4-L15)
- Repository methods support CRUD, list by year, and date range queries; create explicitly selects `IsHalfDay`/`AppliesToAll` fields to persist boolean zero values. (https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/repository/holiday.go#L29-L121)

### Service & handler behavior
- `HolidayService` validates date/name, enforces uniqueness by tenant+date, and persists `IsHalfDay`/`AppliesToAll` on create/update. (https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/service/holiday.go#L41-L166)
- `HolidayHandler` supports list-by-year, list-by-range, default current-year list, plus CRUD; the create/update payloads map `is_half_day` and `applies_to_all` from generated models. (https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/handler/holiday.go#L25-L223)
- Holiday routes are registered only for CRUD endpoints; no generation/copy/recalc routes exist. (https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/handler/routes.go#L77-L85)

### OpenAPI + generated client models
- OpenAPI `holidays` paths and schemas model `is_half_day` and describe full/half day usage. (https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/api/paths/holidays.yaml#L1-L133, https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/api/schemas/holidays.yaml#L1-L95)

### Frontend holiday UI
- Holiday form, table, detail sheet, and year calendar all render `is_half_day` as a full/half toggle and badge. (https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/web/src/components/holidays/holiday-form-sheet.tsx#L94-L259, https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/web/src/components/holidays/holiday-data-table.tsx#L72-L102, https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/web/src/components/holidays/holiday-detail-sheet.tsx#L92-L119, https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/web/src/components/holidays/holiday-year-calendar.tsx#L136-L203)

### Calculation and recalc integration points
- Daily calculation checks for a holiday via `holidayRepo.GetByDate` and uses a `HolidayCreditCategory` config defaulted to category 1; the holiday record itself is not used for category-specific credit. (https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/service/daily_calc.go#L17-L162, https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/service/daily_calc.go#L273-L309)
- Day plans already store holiday credit categories and expose `GetHolidayCredit(category int)`; this is currently unused in daily calc. (https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/model/dayplan.go#L98-L171)
- Absence creation uses holiday ranges to skip dates, indicating holidays already impact other flows. (https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/service/absence.go#L279-L303)
- `RecalcService` exists to trigger daily recalculation for one/all employees and ranges, but holiday CRUD does not call it. (https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/service/recalc.go#L13-L126)

### Dev-mode holiday data
- Dev-mode seeding includes a static list of Bavarian 2026 holidays; it uses `IsHalfDay` and has no per-state generation logic. (https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/auth/devholidays.go#L9-L121)

## Code References
- https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/model/holiday.go#L9-L18 - Holiday model fields (includes `is_half_day` only)
- https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/db/migrations/000003_create_holidays.up.sql#L4-L15 - Holidays table schema + uniqueness
- https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/service/holiday.go#L41-L166 - Holiday create/update logic and validation
- https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/handler/holiday.go#L25-L223 - CRUD handlers with year/range list logic
- https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/api/paths/holidays.yaml#L1-L133 - OpenAPI holiday endpoints
- https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/api/schemas/holidays.yaml#L1-L95 - OpenAPI holiday schema with `is_half_day`
- https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/web/src/components/holidays/holiday-form-sheet.tsx#L94-L259 - UI form uses full/half-day toggle
- https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/web/src/components/holidays/holiday-year-calendar.tsx#L136-L203 - Calendar rendering based on `is_half_day`
- https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/service/daily_calc.go#L17-L162 - Holiday detection and default holiday credit config
- https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/model/dayplan.go#L98-L171 - Holiday credit categories in DayPlan
- https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/service/recalc.go#L13-L126 - RecalcService for triggering recalculation

## Architecture Documentation
- Holiday data flows: `holidays` table → `model.Holiday` → `HolidayRepository` → `HolidayService` → `HolidayHandler` → OpenAPI (`/holidays` endpoints) → frontend holiday UI.
- Downstream dependencies: absence creation batches holiday ranges to skip dates; daily calculation checks for holiday presence and applies a default holiday credit config; recalc services exist but are not connected to holiday changes.
- Dev-mode seeding uses static holiday definitions in `auth/devholidays.go`, inserted via holiday service during dev login.

## Historical Context (from thoughts/)
- `thoughts/shared/docs/admin-holidays.md` - Documents the current admin holiday UI workflow (full/half-day toggle, applies-to-all vs department). 
- `thoughts/shared/research/2026-01-26-NOK-231-holiday-management.md` - Prior research that captured existing holiday CRUD, schema, and UI state.

## Related Research
- `thoughts/shared/research/2026-01-26-NOK-231-holiday-management.md`
- `thoughts/shared/research/2026-01-27-zmi-calculation-implementation-check.md`

## Open Questions
- Which German federal states must be supported for holiday generation, and what exact holiday rules/counts are expected per state?
- Should holiday category drive daily calculation directly (per-holiday category + day plan credit), or remain a tenant/day-plan configuration independent of the holiday record?
- What is the intended persistence/visibility of “recalculation markers” for holiday changes (immediate recalculation vs queued markers)?

## Notes
- `./hack/spec_metadata.sh` was referenced in the research workflow but is not present in this repository; metadata was collected manually.
