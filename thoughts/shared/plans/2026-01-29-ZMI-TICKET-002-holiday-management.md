# ZMI-TICKET-002 Holiday Management Implementation Plan

## Overview
Implement holiday categories (1/2/3), generation/copy APIs for German federal states, and recalculation triggers so holiday changes affect daily/monthly calculations while keeping UI and OpenAPI in sync.

## Current State Analysis
- Holidays are stored with `is_half_day` and exposed via CRUD endpoints; no holiday category field exists in DB/model/OpenAPI/UI. Holiday changes do not trigger recalculation. Holiday generation/copy is not implemented.

## Desired End State
- Holiday records include `category` (1/2/3) with validation, stored in DB and exposed via OpenAPI and UI.
- `/holidays` list supports optional `department_id` filter while preserving tenant-wide holidays.
- New endpoints exist to generate holidays by year + Bundesland and to copy holidays from a prior year with optional category adjustments.
- Holiday changes in past dates trigger daily and monthly recalculation for impacted ranges.
- OpenAPI and generated clients reflect category semantics and validation rules.

### Key Discoveries:
- Holiday model + schema use `is_half_day` today, with unique constraint per tenant+date.
- DayPlan already stores holiday credit categories but daily calc uses a default category config.
- Recalc service exists and is already used by bookings/absences; monthly calc service exists but is not wired to handlers.

## What We're NOT Doing
- Not reworking daily calculation algorithms beyond applying per-holiday category when crediting holidays.
- Not adding a background job queue for recalculation; recalculation will be triggered synchronously like existing services.
- Not building a complex holiday admin UI beyond category selection + generation/copy actions.

## Implementation Approach
- Add `holiday_category` to the DB with backfill from `is_half_day`, then remove `is_half_day` from API/UI (keep DB column only if needed for migration safety).
- Introduce a dedicated holiday calendar generator for German states with fixed + Easter-based rules; default generated holidays to category 1.
- Extend HolidayService to validate category, handle department filtering, and trigger recalculation when past dates are impacted.
- Update OpenAPI and regenerate Go/TS models; update UI to display and edit category (full/half/custom) and add generation/copy actions.

## Phase 1: Data Model + OpenAPI Category Field

### Overview
Add holiday category storage + validation and replace `is_half_day` in API/UI with `category`.

### Changes Required:

#### 1. Database migration
**File**: `db/migrations/000038_add_holiday_category.up.sql`
**Changes**: Add `holiday_category` INT NOT NULL DEFAULT 1, backfill from `is_half_day`, add CHECK constraint (1..3). Optionally drop `is_half_day` if we fully remove it from app code.

**File**: `db/migrations/000038_add_holiday_category.down.sql`
**Changes**: Reverse the above changes (re-add `is_half_day` if dropped).

#### 2. Holiday model + repository
**File**: `apps/api/internal/model/holiday.go`
**Changes**: Replace `IsHalfDay` with `Category int` (`json:"category"`), update struct tags and any related helpers.

**File**: `apps/api/internal/repository/holiday.go`
**Changes**: Include `Category` in `Create` field selection and any filters.

#### 3. Holiday service + handler
**File**: `apps/api/internal/service/holiday.go`
**Changes**:
- Update input structs to use `Category int`.
- Validate category is 1/2/3.
- Track old vs new category/date for recalculation triggers later (Phase 3).

**File**: `apps/api/internal/handler/holiday.go`
**Changes**: Parse `category` from API request models; remove `is_half_day` mappings.

#### 4. OpenAPI schema
**File**: `api/schemas/holidays.yaml`
**Changes**: Add required `category` field with enum `[1,2,3]`, describe semantics; remove `is_half_day` from requests/responses.

**File**: `api/paths/holidays.yaml`
**Changes**: Update descriptions to refer to category semantics.

#### 5. Regenerate API clients
**Command**: `make generate-all`
**Changes**: Regenerate Go models and web TypeScript types from OpenAPI.

### Success Criteria:

#### Automated Verification:
- [ ] Migration applies cleanly: `make migrate-up`
- [ ] Go build/test passes: `make test`
- [ ] OpenAPI validation passes: `make generate` (or `make generate-all`)

#### Manual Verification:
- [ ] `GET /holidays` returns `category` in responses.
- [ ] `POST /holidays` rejects invalid category values.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Holiday Generation + Copy APIs

### Overview
Implement generation by year/state and copy-from-year with optional category adjustments.

### Changes Required:

#### 1. Holiday calendar generator
**File**: `apps/api/internal/holiday/calendar.go` (new)
**Changes**:
- Add Bundesland enum (BW, BY, BE, BB, HB, HH, HE, MV, NI, NW, RP, SL, SN, ST, SH, TH).
- Implement holiday rules (fixed + Easter-based + state-specific) returning `[]HolidayDefinition{Date, Name}`.
- Default `category` to 1 for generated holidays.

#### 2. Holiday service methods
**File**: `apps/api/internal/service/holiday.go`
**Changes**:
- Add `GenerateForYearState` and `CopyFromYear` methods.
- For generation: skip existing dates (or optionally replace if a flag is set), return created list.
- For copy: fetch source year, clone to target year, apply optional category overrides (e.g., Dec 24/31 → category 2).

#### 3. Holiday handler endpoints
**File**: `apps/api/internal/handler/holiday.go`
**Changes**:
- Add `POST /holidays/generate` and `POST /holidays/copy` handlers.
- Validate inputs; return created holidays list.

**File**: `apps/api/internal/handler/routes.go`
**Changes**: Register new holiday routes.

#### 4. OpenAPI definitions
**File**: `api/paths/holidays.yaml`
**Changes**: Add `/holidays/generate` and `/holidays/copy` endpoints with request/response schemas.

**File**: `api/schemas/holidays.yaml`
**Changes**: Add request schemas (GenerateHolidayRequest, CopyHolidayRequest) and responses.

#### 5. Frontend UI for generation/copy
**Files**:
- `apps/web/src/app/[locale]/(dashboard)/admin/holidays/page.tsx`
- `apps/web/src/components/holidays/holiday-form-sheet.tsx`

**Changes**:
- Add action buttons for “Generate” and “Copy from Previous Year”.
- Add modal/dialog to select Bundesland and year (and optional category adjustments).
- Wire to new API hooks.

### Success Criteria:

#### Automated Verification:
- [ ] Holiday generator unit tests pass: `go test ./apps/api/internal/holiday/...`
- [ ] API handler tests pass: `go test ./apps/api/internal/handler -run Holiday`

#### Manual Verification:
- [ ] Generate holidays for a year+state and verify expected entries in UI.
- [ ] Copy from previous year and confirm categories preserved (and overrides applied if selected).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Recalculation Triggers for Past Holiday Changes

### Overview
Trigger recalculation of daily and monthly values when holidays in the past are created/updated/deleted.

### Changes Required:

#### 1. Holiday service integration
**File**: `apps/api/internal/service/holiday.go`
**Changes**:
- Inject `RecalcService` and `MonthlyCalcService` dependencies.
- On create/update/delete: if affected date(s) are before today, call `TriggerRecalcAll` for date range.
- For monthly: compute earliest affected month and call `RecalculateFromMonthBatch` for all active employees.

**File**: `apps/api/cmd/server/main.go`
**Changes**: Pass recalc + monthly calc services into HolidayService.

#### 2. Tests
**File**: `apps/api/internal/service/holiday_test.go`
**Changes**: Add mocks to verify recalc calls for past dates and skipped for future dates.

### Success Criteria:

#### Automated Verification:
- [ ] Holiday service tests for recalc triggers pass: `go test ./apps/api/internal/service -run Holiday`

#### Manual Verification:
- [ ] Create or update a past holiday and confirm recalculation is triggered (logs or API response).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: UI + Translation Updates for Categories

### Overview
Replace full/half-day UI with category selection and update labels/legend.

### Changes Required:

#### 1. Frontend components
**Files**:
- `apps/web/src/components/holidays/holiday-form-sheet.tsx`
- `apps/web/src/components/holidays/holiday-data-table.tsx`
- `apps/web/src/components/holidays/holiday-detail-sheet.tsx`
- `apps/web/src/components/holidays/holiday-year-calendar.tsx`

**Changes**:
- Add category select (1/2/3) instead of half-day toggle.
- Update badges and calendar colors/legend to reflect 3 categories.

#### 2. i18n strings
**Files**:
- `apps/web/messages/en.json`
- `apps/web/messages/de.json`

**Changes**: Add labels for category 1/2/3 and remove half-day text.

### Success Criteria:

#### Automated Verification:
- [ ] Web type generation passes: `make generate-web`
- [ ] Web lint/tests (if available): `pnpm -C apps/web lint`

#### Manual Verification:
- [ ] Create/edit holiday with category and see correct label and color in list/calendar.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:
- Holiday category validation (1/2/3 only).
- Holiday generator returns expected dates for a known year/state (pick one fixed-year test).
- Copy-from-year preserves categories and adjusts optional half-day overrides.

### Integration Tests:
- Holiday CRUD with category using handler tests.
- Recalc triggers when past holiday is created/updated/deleted.

### Manual Testing Steps:
1. Generate holidays for a state/year; verify count and specific known dates.
2. Copy from previous year and adjust categories for Dec 24/31.
3. Update a past holiday category and confirm recalculation trigger response/log.
4. Verify holiday category rendering in calendar/list.

## Performance Considerations
- Recalc-all on large tenants can be expensive; keep recalculation limited to the impacted date range and earliest affected month.

## Migration Notes
- Backfill category from existing `is_half_day` values (1 = full, 2 = half).
- If dropping `is_half_day`, ensure all code paths updated and data is preserved in `category`.

## References
- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-002-holiday-management.md`
- Related research: `thoughts/shared/research/2026-01-29-ZMI-TICKET-002-holiday-management.md`
