# ZMI-TICKET-005: Time Plan Framework (Day, Week, Rolling, X-Day)

Status: Proposed
Priority: P1
Owner: TBD
Manual references: 3.4 Time Plans (day plan, week plan, rolling, x-day)

## Goal
Provide full time plan hierarchy and assignment logic so each employee-date resolves to an effective day plan with overrides.

## Scope
- In scope: Day plans, week plans, rolling week plans, x-day cycles, assignments, overrides, OpenAPI coverage.
- Out of scope: Day plan calculation rules (separate ticket).

## Requirements
### Data model
- Day plan: already exists, must be fully exposed via API.
- Week plan: 7-day mapping to day plan IDs, plus name/code and optional mandant scope.
- Rolling plan: ordered list of week plans with rotation rules.
- X-day plan: cycle length and day-indexed mapping to day plan IDs.
- Employee time plan assignment:
  - Effective date range
  - Plan type (weekly, rolling, x-day)
  - Optional override flags (do not overwrite manual changes)
- Per-day override record to support manual adjustments for a specific date without creating a new day plan.

### Business rules
- Every employee date must resolve to exactly one effective day plan (or off-day with no plan).
- Week plans require all 7 days assigned; validation error if missing.
- Rolling plan rotation and x-day cycle must be deterministic given a start date.
- Per-day override must not mutate the underlying day plan definition.
- Assignments must optionally respect “do not overwrite manual changes” when applying a new plan to a date range.

### API / OpenAPI
- CRUD for day plans, week plans, rolling plans, x-day plans.
- Assign/unassign time plans to employees with date ranges.
- Retrieve effective day plan for a given employee and date, including override flag.
- OpenAPI schemas must include validation rules for plan completeness and rotation settings.

## Acceptance criteria
- Employee-date resolution returns correct day plan for weekly, rolling, and x-day configurations.
- Manual per-day overrides persist and do not affect shared day plans.
- API rejects week plans with missing day assignments.
- OpenAPI covers all plan types and assignment endpoints.

## Tests
### Unit tests
- Week plan validation requires all 7 days assigned.
- Rolling plan rotation produces deterministic plan sequence.
- X-day cycle resolves correct day plan by index and start date.
- Per-day override does not mutate shared day plan definition.

### API tests
- Create day plan, week plan, rolling plan, x-day plan; retrieve and validate mappings.
- Assign weekly plan to employee; query effective day plan for multiple dates.
- Assign rolling plan and x-day plan; verify correct resolution across cycle boundaries.
- Apply per-day override; ensure only that date changes.

### Integration tests
- Daily calculation uses effective day plan resolution for employee-date.


## Test Case Pack
1) Weekly plan completeness
   - Input: week plan missing Sunday
   - Expected: validation error
2) Rolling plan rotation
   - Input: week plans A,B with start date
   - Expected: week 1 = A, week 2 = B, week 3 = A
3) X-day cycle
   - Input: cycle length 10, day 1 plan = P1, day 10 plan = P10
   - Expected: date index resolves to correct plan based on start date
4) Per-day override
   - Input: override day plan on 2026-02-03
   - Expected: only that date uses override; base plan unchanged


## Dependencies
- Employee master data (ZMI-TICKET-004).
- Mandant master data (ZMI-TICKET-001).
