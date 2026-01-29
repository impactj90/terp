# ZMI-TICKET-002: Holiday Management with Categories and Recalculation

Status: Proposed
Priority: P1
Owner: TBD
Manual references: 3.2 Holidays Tab (holiday list and generation); 3.4.4.6 Holiday credit categories

## Goal
Implement full holiday management with categories (1/2/3), generation, and recalculation triggers so daily and monthly calculations match ZMI behavior.

## Scope
- In scope: Holiday CRUD, categories, generation by year/state, copy from prior year, recalculation of affected dates, OpenAPI coverage.
- Out of scope: Daily calculation logic itself (covered in day plan integration ticket).

## Requirements
### Data model
- Holiday entity must include:
  - Date (unique per mandant)
  - Name/label
  - Category (1, 2, or 3)
  - Applies to mandant (tenant-wide)
  - Audit timestamps
 - Support one holiday per date per mandant.

### Business rules
- Holiday category meaning:
  - Category 1: full holiday credit
  - Category 2: half holiday credit
  - Category 3: special/custom credit
- Holiday lists are maintained per mandant.
- Holiday generation:
  - Generate by year and federal state (Bundesland).
  - Allow copying from previous year and adjusting category (e.g., Christmas Eve, New Year's Eve).
  - Support viewing at least the last two years of holidays for a mandant.
- Recalculation requirement:
  - When holidays are added/removed or category changes in the past, all affected days and months must be flagged for recalculation.

### API / OpenAPI
- Endpoints:
  - List holidays by date range and optional department
  - Create/update/delete holiday
  - Generate holidays for year + state
  - Copy holidays from previous year
  - Trigger recalculation for a date range (or return list of impacted ranges)
- OpenAPI must describe category semantics and validation rules.

## Acceptance criteria
- Categories 1/2/3 are stored and returned correctly.
- Holiday generation produces correct dates and allows category adjustments.
- Removing or changing a past holiday results in recalculation markers for affected dates.
- OpenAPI fully reflects fields and endpoints.

## Tests
### Unit tests
- Validate holiday category values (only 1/2/3 allowed).
- Enforce uniqueness per date + tenant + department scope.
- Recalculation marker generation for add/update/delete in past dates.

### API tests
- Create holiday with category 1; read back and verify category.
- Update holiday category from 1 → 2; verify recalculation trigger output.
- Delete holiday; verify recalculation trigger output.
- Generate holidays for year + state; verify expected count and presence of fixed holidays.
- Copy from previous year; verify categories copied and editable.
- List holidays with date-range filters covering last two years.

### Integration tests
- Daily calculation uses holiday category mapping to day plan credit values (covered via daily calc ticket as well).


## Test Case Pack
1) Create holiday with category 1
   - Input: 2026-01-01, category=1
   - Expected: holiday stored; category=1 returned
2) Create holiday with category 2 (half holiday)
   - Input: 2026-12-24, category=2
   - Expected: stored as category=2 and used as half-day credit in daily calc
3) Copy holidays from previous year
   - Input: copy 2025 -> 2026
   - Expected: same holiday dates generated; categories preserved; editable afterwards
4) Update past holiday category
   - Input: change 2025-12-24 category 2 -> 1
   - Expected: recalculation markers returned for affected dates/months


## Dependencies
- Mandant master data (ZMI-TICKET-001).
