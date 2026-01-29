# Employee Tariff Assignment & Bulk Update (ZMI‑Konform) Implementation Plan

## Overview

Add optional tariff assignment to employees (single + bulk), display tariff in admin UI, and keep employee day plans (personal calendar) in sync with tariff‑based time plans in a ZMI‑conform way.

## Current State Analysis

- Employee API models include `tariff_id`, but handlers/services ignore it for create/update. `apps/api/gen/models/create_employee_request.go:70` `apps/api/gen/models/update_employee_request.go:55` `apps/api/internal/handler/employee.go:153` `apps/api/internal/handler/employee.go:242` `apps/api/internal/service/employee.go:66` `apps/api/internal/service/employee.go:167`
- Employee repository does not preload Tariff relations for list/details. `apps/api/internal/repository/employee.go:168`
- UI employee form has no tariff selector; bulk actions are TODOs. `apps/web/src/components/employees/employee-form-sheet.tsx:56` `apps/web/src/components/employees/bulk-actions.tsx:27`
- Tariff model already exposes rhythm logic to derive day plan per date. `apps/api/internal/model/tariff.go:268`
- Employee day plans exist with `source` and are used for calculations; off‑day = no plan. `apps/api/internal/model/employeedayplan.go:9` `apps/api/internal/repository/employeedayplan.go:67` `apps/api/internal/service/daily_calc.go:141`
- ZMI manual says week plans assigned to employees are copied to a personal calendar per day, and individual days can be changed. `thoughts/shared/reference/zmi-calculation-manual-reference.md:79-81` `thoughts/shared/reference/zmi-calculation-manual-reference.md:1203-1207`

## Desired End State

- Admins can create/update employees with an optional tariff; tariff can be removed using `tariff_id: null`.
- Tariff is visible in employee list and detail view.
- Bulk action assigns/clears tariff for selected employees or all filtered employees.
- ZMI‑conform: tariff assignment generates employee day plans (source `tariff`) into the personal calendar; manual/holiday assignments are preserved.

### Key Discoveries
- `Tariff.GetDayPlanIDForDate` provides the date→day plan mapping for weekly/rolling/x‑days rhythms. `apps/api/internal/model/tariff.go:268`
- Employee day plans are stored per employee/date and used by daily calculation. `apps/api/internal/repository/employeedayplan.go:67` `apps/api/internal/service/daily_calc.go:141`
- Existing UI uses `useTariffs` hook; active tariffs can be fetched for a selector. `apps/web/src/hooks/api/use-tariffs.ts:18`

## What We’re NOT Doing

- No historical retroactive recalculation or re‑writing of past daily values.
- No full employee‑day‑plan management UI (separate feature).
- No changes to tariff definition screens beyond consumption for employee assignment.

## Implementation Approach

- Extend employee create/update to accept tariff_id (including explicit `null`) and persist it.
- Implement a ZMI‑conform day‑plan sync: generate tariff‑sourced day plans for a defined horizon and avoid overwriting manual/holiday entries.
- Add a bulk API endpoint that can update selected employees or all filtered employees in one request.
- Update frontend employee screens to expose tariff assignment and bulk assignment UI.

### ZMI‑Conform Calendar Sync Rules (for this plan)

- Sync window (future‑oriented):
  - `start = max(today, employee.entry_date, tariff.valid_from if set)`
  - `end = min(employee.exit_date if set, tariff.valid_to if set, today + 12 months)`
- Only write day plans with `source = tariff`.
- Do **not** overwrite existing `source != tariff` entries (manual/holiday).
- On tariff removal (`tariff_id: null`), delete only tariff‑sourced day plans in the window.

## Phase 1: API & Model Updates for Tariff Assignment

### Overview
Enable tariff_id on employee create/update (including `null`) and surface tariff relations in API responses.

### Changes Required

#### 1) OpenAPI schema updates
**File**: `api/openapi.yaml`
**Changes**:
- Mark `tariff_id` as nullable in Create/Update employee request schemas.
- Add new bulk endpoint (see Phase 3) in OpenAPI.

#### 2) Regenerate models & TS types
**Command**:
```bash
make generate
make generate-web
```

#### 3) Employee handlers/services accept tariff_id
**Files**:
- `apps/api/internal/handler/employee.go`
- `apps/api/internal/service/employee.go`

**Changes**:
- Add `TariffID *uuid.UUID` and `ClearTariffID bool` to service input structs.
- In handler Update, detect presence of `tariff_id` key in JSON (including explicit `null`).
  - `tariff_id` present + null ⇒ `ClearTariffID = true`.
  - `tariff_id` present + uuid ⇒ set `TariffID`.
  - `tariff_id` missing ⇒ no change.
- In Create, accept `tariff_id` if provided (optional).

#### 4) Preload tariff relations
**File**: `apps/api/internal/repository/employee.go`
**Changes**:
- Add `Preload("Tariff")` in `GetWithDetails`.
- Add `Preload("Tariff")` to `List` so list responses can show tariff summary.

### Success Criteria

#### Automated Verification
- [x] OpenAPI regenerates cleanly: `make generate`
- [x] Web types regenerate: `make generate-web`
- [x] API tests pass: `go test ./apps/api/internal/handler -run Employee`

#### Manual Verification
- [ ] Create employee without tariff succeeds.
- [ ] Update employee with `tariff_id` sets tariff.
- [ ] Update employee with `tariff_id: null` clears tariff.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: ZMI‑Conform Employee Day Plan Sync

### Overview
When tariff is assigned/cleared, generate or remove tariff‑sourced employee day plans for a bounded horizon, preserving manual/holiday plans.

### Changes Required

#### 1) Repository helpers for safe deletion
**File**: `apps/api/internal/repository/employeedayplan.go`
**Changes**:
- Add `DeleteRangeBySource(ctx, employeeID, from, to, source)` to delete only tariff‑sourced rows.
- Optionally add `ListByEmployeeDateRange` variant that returns only non‑tariff sources to build a skip set.

#### 2) Tariff day‑plan materialization
**File**: `apps/api/internal/service/employee.go`
**Changes**:
- Inject `tariffRepo` + `employeeDayPlanRepo` into `EmployeeService`.
- Add helper to load tariff with details (`GetWithDetails`) to ensure week plan / tariff week plans / tariff day plans are loaded.
- Add `syncEmployeeDayPlansForTariff(ctx, employee, tariffID, start, end)`:
  - Build list of dates in window.
  - Load existing plans in range; build `skip` set for `source != tariff`.
  - For each date not skipped, compute `day_plan_id` via `Tariff.GetDayPlanIDForDate(date)`.
  - Use `BulkCreate` to upsert tariff‑sourced day plans.
- Add `clearTariffDayPlans(ctx, employeeID, start, end)` to delete only tariff‑sourced plans.

#### 3) Wire into create/update
**Files**:
- `apps/api/internal/service/employee.go`
- `apps/api/internal/handler/employee.go`

**Changes**:
- On create: if tariff set, sync day plans after employee creation.
- On update: if tariff changed or cleared, sync or clear day plans accordingly.
- Use the ZMI‑conform sync window rules.

### Success Criteria

#### Automated Verification
- [x] Unit test for sync preserves manual plans (tariff updates don’t overwrite manual/holiday).
- [x] Unit test for tariff removal deletes only `source=tariff` rows.

#### Manual Verification
- [ ] Assign tariff to employee ⇒ day plans appear for future dates.
- [ ] Manually override a day; reassign tariff does not overwrite that date.
- [ ] Clear tariff ⇒ tariff‑sourced day plans are removed; manual days remain.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 3: Bulk Tariff Assignment Endpoint

### Overview
Provide a backend endpoint to assign/clear tariffs for multiple employees, supporting both selected IDs and “all filtered”.

### Changes Required

#### 1) OpenAPI endpoint
**File**: `api/openapi.yaml`
**Changes**:
- Add `PATCH /employees/bulk-tariff` with body:
  - `employee_ids?: [uuid]`
  - `filter?: { q?, department_id?, is_active? }`
  - `tariff_id?: uuid | null` (required in practice)
  - Optional: `effective_from`, `effective_to` (if we later expose)
- Response: `{ updated: number, skipped: number }`.

#### 2) Handler + service
**Files**:
- `apps/api/internal/handler/employee.go`
- `apps/api/internal/service/employee.go`
- `apps/api/cmd/server/main.go` (constructor updates)

**Changes**:
- Add handler `BulkAssignTariff` using employee edit permission.
- Resolve targets:
  - If `employee_ids` provided → use those.
  - Else if `filter` provided → use repository list with `Limit=0` (all filtered).
- For each employee: set/clear tariff_id and sync day plans.
- Return counts (updated/skipped).

### Success Criteria

#### Automated Verification
- [x] New endpoint appears in OpenAPI: `make generate`
- [x] Unit test for bulk with selected IDs
- [x] Unit test for bulk with filter (all filtered)

#### Manual Verification
- [ ] Bulk assign applies to selected employees.
- [ ] “All filtered” applies to all results across pages.
- [ ] Bulk clear removes tariff and tariff‑sourced plans.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 4: Frontend UI Updates

### Overview
Add tariff selector to employee create/edit, show tariff in list/detail, and provide bulk tariff assignment UI.

### Changes Required

#### 1) Employee form: tariff selector
**File**: `apps/web/src/components/employees/employee-form-sheet.tsx`
**Changes**:
- Add `tariffId` to form state.
- Fetch active tariffs via `useTariffs({ active: true })`.
- Add Select with `None` option.
- Create: send `tariff_id` if selected.
- Edit: if changed to none, send `tariff_id: null`.

#### 2) Employee list + detail: tariff display
**Files**:
- `apps/web/src/components/employees/employee-data-table.tsx`
- `apps/web/src/components/employees/employee-detail-sheet.tsx`

**Changes**:
- Add tariff column (e.g., code + name, or “—”).
- Add tariff row in detail view.

#### 3) Bulk action UI
**Files**:
- `apps/web/src/components/employees/bulk-actions.tsx`
- `apps/web/src/app/[locale]/(dashboard)/admin/employees/page.tsx`
- `apps/web/src/hooks/api/use-employees.ts`

**Changes**:
- Add “Assign tariff” action (dialog) with tariff selector and scope toggle (selected vs all filtered).
- Add `useBulkAssignTariff` hook that calls new API endpoint.
- Pass current filters from page into BulkActions for “all filtered”.

#### 4) i18n strings
**Files**:
- `apps/web/messages/en.json`
- `apps/web/messages/de.json`

**Changes**:
- Add labels for tariff fields, bulk dialog, and list/detail columns.

### Success Criteria

#### Automated Verification
- [x] Typecheck (if available): `make -C apps/web test` (or project standard)

#### Manual Verification
- [ ] Tariff selector appears in employee create/edit and is optional.
- [ ] Tariff visible in list + detail.
- [ ] Bulk tariff assign works for selected and all filtered.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Testing Strategy

### Unit Tests
- Employee handler/service: set/clear tariff_id with presence detection.
- Day plan sync: preserves manual/holiday; deletes only tariff‑sourced plans.
- Bulk handler: selected + filtered counts.

### Integration Tests
- API: create employee with tariff; update to null; bulk assign.

### Manual Testing Steps
1. Create employee without tariff → success.
2. Edit employee → assign tariff → day plans created for future dates.
3. Manually override a day plan → reassign tariff → manual day preserved.
4. Clear tariff → tariff day plans removed, manual stays.
5. Bulk assign to selected and all filtered.

## Performance Considerations

- Bulk assignment may update many employees; use chunking if needed (e.g., 200 employees per batch).
- Day‑plan generation uses a bounded horizon (12 months) to avoid huge inserts.

## Migration Notes

- OpenAPI changes require regenerating Go models and TS types.
- No DB schema migration required.

## References

- ZMI calendar copying requirement: `thoughts/shared/reference/zmi-calculation-manual-reference.md`
- Employee handler/service: `apps/api/internal/handler/employee.go`, `apps/api/internal/service/employee.go`
- Tariff day‑plan logic: `apps/api/internal/model/tariff.go`
- Employee day plan repository: `apps/api/internal/repository/employeedayplan.go`
