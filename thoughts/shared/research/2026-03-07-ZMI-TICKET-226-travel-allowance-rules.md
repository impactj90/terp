---
date: "2026-03-07"
researcher: Claude
git_commit: d16b35a8
branch: staging
repository: terp
topic: "ZMI-TICKET-226: Travel Allowance Rules"
tags: [research, codebase, travel-allowance, rule-sets, local-travel, extended-travel, preview, trpc-migration]
status: complete
last_updated: "2026-03-07"
last_updated_by: Claude
---

# Research: ZMI-TICKET-226 -- Travel Allowance Rules

**Date**: 2026-03-07
**Researcher**: Claude
**Git Commit**: d16b35a8
**Branch**: staging
**Repository**: terp

## Research Question

Research the codebase for ZMI-TICKET-226: Travel Allowance Rules. Document all existing Go backend files (handler/service/repository), domain models, database migrations, OpenAPI specs, generated models, route registration, permissions, calculation logic, frontend references, tests, and cross-cutting dependencies relevant to the tRPC migration.

## Summary

This ticket covers four entity groups: travel allowance rule sets (CRUD container with validity period and calculation options), extended travel rules (multi-day trip rates per rule set), local travel rules (same-day trip rules with distance/duration ranges per rule set), and travel allowance preview (calculation engine for both trip types). All four have complete Go backend implementations following the standard handler/service/repository architecture.

The travel allowance preview is the most complex part -- it depends on a standalone calculation package (`internal/calculation/travel_allowance.go`) that implements the actual business logic for matching local travel rules (first-match by distance/duration range) and computing extended travel breakdowns (arrival/departure/intermediate day rates with three-month rule support).

There are no existing frontend hooks, components, or pages for travel allowance. The only frontend references are the auto-generated TypeScript types in `apps/web/src/lib/api/types.ts` and the permission entry in `apps/web/src/server/lib/permission-catalog.ts`. There are no existing tests for any travel allowance services.

---

## Detailed Findings

### 1. Travel Allowance Rule Sets Domain

#### 1.1 Database Table

**`travel_allowance_rule_sets`** (migration `000075`):
- `db/migrations/000075_create_travel_allowance.up.sql` (lines 1-26)
- Columns: `id` (UUID PK), `tenant_id` (UUID NOT NULL FK tenants CASCADE), `code` (varchar 50 NOT NULL), `name` (varchar 255 NOT NULL), `description` (text), `valid_from` (date), `valid_to` (date), `calculation_basis` (varchar 20 default 'per_day'), `distance_rule` (varchar 20 default 'longest'), `is_active` (boolean default true), `sort_order` (integer default 0), `created_at` (timestamptz), `updated_at` (timestamptz)
- Unique constraint: `(tenant_id, code)`
- Index: `idx_travel_allowance_rule_sets_tenant` on `tenant_id`
- Trigger: `update_travel_allowance_rule_sets_updated_at` auto-updates `updated_at`

#### 1.2 Domain Model

**`apps/api/internal/model/travel_allowance_rule_set.go`** (30 lines):
- `TravelAllowanceRuleSet` struct: ID (uuid), TenantID (uuid), Code (string), Name (string), Description (string), ValidFrom (*time.Time), ValidTo (*time.Time), CalculationBasis (string), DistanceRule (string), IsActive (bool), SortOrder (int), CreatedAt, UpdatedAt
- Table name: `travel_allowance_rule_sets`
- ValidFrom/ValidTo are nullable pointers to time.Time
- CalculationBasis values: "per_day", "per_booking"
- DistanceRule values: "longest", "shortest", "first", "last"

#### 1.3 Repository

**`apps/api/internal/repository/travel_allowance_rule_set.go`** (79 lines):
- `TravelAllowanceRuleSetRepository` struct with `*DB`
- Methods:
  - `Create(ctx, *model.TravelAllowanceRuleSet) error`
  - `GetByID(ctx, uuid.UUID) (*model.TravelAllowanceRuleSet, error)` -- uses `First` with `id = ?`
  - `GetByCode(ctx, tenantID uuid.UUID, code string) (*model.TravelAllowanceRuleSet, error)` -- used for uniqueness check
  - `List(ctx, tenantID uuid.UUID) ([]model.TravelAllowanceRuleSet, error)` -- ordered by `sort_order ASC, code ASC`
  - `Update(ctx, *model.TravelAllowanceRuleSet) error` -- uses `Save`
  - `Delete(ctx, uuid.UUID) error` -- checks `RowsAffected`
- Error sentinel: `ErrTravelAllowanceRuleSetNotFound`

#### 1.4 Service

**`apps/api/internal/service/travel_allowance_rule_set.go`** (189 lines):
- `TravelAllowanceRuleSetService` with `travelAllowanceRuleSetRepository` interface
- Interface methods: Create, GetByID, GetByCode, List, Update, Delete

**Create logic**:
1. Validates code (trimmed, non-empty) -> `ErrTravelAllowanceRuleSetCodeRequired`
2. Validates name (trimmed, non-empty) -> `ErrTravelAllowanceRuleSetNameRequired`
3. Checks code uniqueness within tenant via `GetByCode` -> `ErrTravelAllowanceRuleSetCodeExists`
4. Sets defaults: `CalculationBasis="per_day"`, `DistanceRule="longest"`, `IsActive=true`
5. Parses ValidFrom/ValidTo via shared `parseDate` helper (from `service/date_helpers.go`, format "2006-01-02")

**Update logic**: Code cannot be changed. All other fields are optional (pointer-based updates). Validates name is non-empty if provided.

**Delete logic**: Verifies existence before deleting.

Error sentinels: `ErrTravelAllowanceRuleSetNotFound`, `ErrTravelAllowanceRuleSetCodeRequired`, `ErrTravelAllowanceRuleSetNameRequired`, `ErrTravelAllowanceRuleSetCodeExists`

Input types:
- `CreateTravelAllowanceRuleSetInput`: TenantID (uuid), Code, Name, Description (string), ValidFrom, ValidTo (*string), CalculationBasis, DistanceRule (string), SortOrder (*int)
- `UpdateTravelAllowanceRuleSetInput`: Name, Description, ValidFrom, ValidTo, CalculationBasis, DistanceRule (*string), IsActive (*bool), SortOrder (*int)

#### 1.5 Handler

**`apps/api/internal/handler/travel_allowance_rule_set.go`** (216 lines):
- `TravelAllowanceRuleSetHandler` with `*service.TravelAllowanceRuleSetService`
- CRUD endpoints: List, Get, Create, Update, Delete
- Create: decodes `models.CreateTravelAllowanceRuleSetRequest`, validates via generated model's `Validate(nil)`, returns 201
- Update: decodes `models.UpdateTravelAllowanceRuleSetRequest`, validates
- Delete: returns 204 (no content)
- Response mapping:
  - `ruleSetToResponse(*model.TravelAllowanceRuleSet) *models.TravelAllowanceRuleSet` -- converts UUID to strfmt.UUID, time.Time to strfmt.DateTime, *time.Time to *strfmt.Date
  - `ruleSetListToResponse([]model.TravelAllowanceRuleSet) models.TravelAllowanceRuleSetList` -- wraps in `{Data: [...]}`
- Error handler: `handleRuleSetError` maps service errors to HTTP status codes (404 Not Found, 400 Bad Request, 409 Conflict)

#### 1.6 Route Registration

**`apps/api/internal/handler/routes.go:1448-1465`**:
- `RegisterTravelAllowanceRuleSetRoutes(r chi.Router, h *TravelAllowanceRuleSetHandler, authz *middleware.AuthorizationMiddleware)`
- Permission: `travel_allowance.manage` for all operations (list, create, get, update, delete)
- Routes: `/travel-allowance-rule-sets` and `/travel-allowance-rule-sets/{id}`

#### 1.7 Initialization in main.go

**`apps/api/cmd/server/main.go:391-393`**:
```go
travelAllowanceRuleSetRepo := repository.NewTravelAllowanceRuleSetRepository(db)
travelAllowanceRuleSetService := service.NewTravelAllowanceRuleSetService(travelAllowanceRuleSetRepo)
travelAllowanceRuleSetHandler := handler.NewTravelAllowanceRuleSetHandler(travelAllowanceRuleSetService)
```

Route registration at line 585:
```go
handler.RegisterTravelAllowanceRuleSetRoutes(r, travelAllowanceRuleSetHandler, authzMiddleware)
```

---

### 2. Extended Travel Rules Domain (Fernmontage)

#### 2.1 Database Table

**`extended_travel_rules`** (migration `000075`, lines 56-83):
- Columns: `id` (UUID PK), `tenant_id` (UUID FK tenants CASCADE), `rule_set_id` (UUID FK travel_allowance_rule_sets CASCADE), `arrival_day_tax_free` (numeric 10,2 default 0), `arrival_day_taxable` (numeric 10,2 default 0), `departure_day_tax_free`, `departure_day_taxable`, `intermediate_day_tax_free`, `intermediate_day_taxable`, `three_month_enabled` (boolean default false), `three_month_tax_free`, `three_month_taxable`, `is_active` (boolean default true), `sort_order` (integer default 0), `created_at`, `updated_at`
- Indexes: `idx_extended_travel_rules_tenant`, `idx_extended_travel_rules_rule_set`
- FK cascade: rule_set_id -> travel_allowance_rule_sets ON DELETE CASCADE

#### 2.2 Domain Model

**`apps/api/internal/model/extended_travel_rule.go`** (36 lines):
- `ExtendedTravelRule` struct: uses `github.com/shopspring/decimal` for all monetary fields
- 8 decimal fields: ArrivalDayTaxFree, ArrivalDayTaxable, DepartureDayTaxFree, DepartureDayTaxable, IntermediateDayTaxFree, IntermediateDayTaxable, ThreeMonthTaxFree, ThreeMonthTaxable
- Association: `RuleSet *TravelAllowanceRuleSet` via `foreignKey:RuleSetID`
- Table name: `extended_travel_rules`

#### 2.3 Repository

**`apps/api/internal/repository/extended_travel_rule.go`** (77 lines):
- `ExtendedTravelRuleRepository` struct with `*DB`
- Methods:
  - `Create`, `GetByID`, `Update`, `Delete` -- standard CRUD
  - `List(ctx, tenantID uuid.UUID)` -- ordered by `sort_order ASC`
  - `ListByRuleSet(ctx, ruleSetID uuid.UUID)` -- ordered by `sort_order ASC`; used by the preview service
- Error sentinel: `ErrExtendedTravelRuleNotFound`

#### 2.4 Service

**`apps/api/internal/service/extended_travel_rule.go`** (193 lines):
- `ExtendedTravelRuleService` with `extendedTravelRuleRepository` interface
- Interface includes `ListByRuleSet` in addition to standard CRUD methods

**Create logic**:
1. Validates RuleSetID (not nil UUID) -> `ErrExtendedTravelRuleSetIDRequired`
2. All decimal fields initialize to `decimal.Zero`
3. Optional fields set via pointer-based inputs (float64 -> decimal.NewFromFloat)

**Update logic**: All fields are optional pointer updates. No field is immutable.

Error sentinels: `ErrExtendedTravelRuleNotFound`, `ErrExtendedTravelRuleSetIDRequired`

Input types:
- `CreateExtendedTravelRuleInput`: TenantID, RuleSetID (uuid), 8 monetary fields (*float64), ThreeMonthEnabled (*bool), SortOrder (*int)
- `UpdateExtendedTravelRuleInput`: Same 8 monetary fields, ThreeMonthEnabled, IsActive (*bool), SortOrder (*int)

#### 2.5 Handler

**`apps/api/internal/handler/extended_travel_rule.go`** (248 lines):
- `ExtendedTravelRuleHandler` with `*service.ExtendedTravelRuleService`
- CRUD endpoints: List, Get, Create, Update, Delete
- Response mapping: `extendedTravelRuleToResponse` converts all decimal fields to float64 via `.Float64()`
- Uses `models.ExtendedTravelRuleList{Data: data}` -- no pagination meta
- Error handler: `handleExtendedTravelRuleError` maps to 404 Not Found or 400 Bad Request

#### 2.6 Route Registration

**`apps/api/internal/handler/routes.go:1488-1505`**:
- `RegisterExtendedTravelRuleRoutes(r chi.Router, h *ExtendedTravelRuleHandler, authz *middleware.AuthorizationMiddleware)`
- Permission: `travel_allowance.manage` for all operations
- Routes: `/extended-travel-rules` and `/extended-travel-rules/{id}`

#### 2.7 Initialization in main.go

**`apps/api/cmd/server/main.go:399-401`**:
```go
extendedTravelRuleRepo := repository.NewExtendedTravelRuleRepository(db)
extendedTravelRuleService := service.NewExtendedTravelRuleService(extendedTravelRuleRepo)
extendedTravelRuleHandler := handler.NewExtendedTravelRuleHandler(extendedTravelRuleService)
```

---

### 3. Local Travel Rules Domain (Nahmontage)

#### 3.1 Database Table

**`local_travel_rules`** (migration `000075`, lines 29-53):
- Columns: `id` (UUID PK), `tenant_id` (UUID FK tenants CASCADE), `rule_set_id` (UUID FK travel_allowance_rule_sets CASCADE), `min_distance_km` (numeric 10,2 default 0), `max_distance_km` (numeric 10,2 nullable), `min_duration_minutes` (integer default 0), `max_duration_minutes` (integer nullable), `tax_free_amount` (numeric 10,2 default 0), `taxable_amount` (numeric 10,2 default 0), `is_active` (boolean default true), `sort_order` (integer default 0), `created_at`, `updated_at`
- Indexes: `idx_local_travel_rules_tenant`, `idx_local_travel_rules_rule_set`
- FK cascade: rule_set_id -> travel_allowance_rule_sets ON DELETE CASCADE

#### 3.2 Domain Model

**`apps/api/internal/model/local_travel_rule.go`** (33 lines):
- `LocalTravelRule` struct: uses `shopspring/decimal` for monetary and distance fields
- Required decimal fields: MinDistanceKm, TaxFreeAmount, TaxableAmount
- Nullable fields: MaxDistanceKm (*decimal.Decimal), MaxDurationMinutes (*int)
- Association: `RuleSet *TravelAllowanceRuleSet` via `foreignKey:RuleSetID`
- Table name: `local_travel_rules`

#### 3.3 Repository

**`apps/api/internal/repository/local_travel_rule.go`** (77 lines):
- `LocalTravelRuleRepository` struct with `*DB`
- Methods:
  - `Create`, `GetByID`, `Update`, `Delete` -- standard CRUD
  - `List(ctx, tenantID uuid.UUID)` -- ordered by `sort_order ASC`
  - `ListByRuleSet(ctx, ruleSetID uuid.UUID)` -- ordered by `sort_order ASC, min_distance_km ASC`; used by the preview service
- Error sentinel: `ErrLocalTravelRuleNotFound`

#### 3.4 Service

**`apps/api/internal/service/local_travel_rule.go`** (168 lines):
- `LocalTravelRuleService` with `localTravelRuleRepository` interface
- Interface includes `ListByRuleSet` in addition to standard CRUD

**Create logic**:
1. Validates RuleSetID (not nil UUID) -> `ErrLocalTravelRuleSetIDRequired`
2. MinDistanceKm, TaxFreeAmount, TaxableAmount initialize to `decimal.Zero`
3. MaxDistanceKm set as pointer to decimal if provided
4. MinDurationMinutes is int, MaxDurationMinutes is *int

Error sentinels: `ErrLocalTravelRuleNotFound`, `ErrLocalTravelRuleSetIDRequired`

Input types:
- `CreateLocalTravelRuleInput`: TenantID, RuleSetID (uuid), MinDistanceKm, MaxDistanceKm, TaxFreeAmount, TaxableAmount (*float64), MinDurationMinutes, MaxDurationMinutes (*int64), SortOrder (*int)
- `UpdateLocalTravelRuleInput`: Same fields minus TenantID/RuleSetID, plus IsActive (*bool)

#### 3.5 Handler

**`apps/api/internal/handler/local_travel_rule.go`** (236 lines):
- `LocalTravelRuleHandler` with `*service.LocalTravelRuleService`
- CRUD endpoints: List, Get, Create, Update, Delete
- Response mapping: `localTravelRuleToResponse` converts decimal fields to float64, handles nullable MaxDistanceKm and MaxDurationMinutes
- Uses `models.LocalTravelRuleList{Data: data}` -- no pagination meta

#### 3.6 Route Registration

**`apps/api/internal/handler/routes.go:1468-1485`**:
- `RegisterLocalTravelRuleRoutes(r chi.Router, h *LocalTravelRuleHandler, authz *middleware.AuthorizationMiddleware)`
- Permission: `travel_allowance.manage` for all operations
- Routes: `/local-travel-rules` and `/local-travel-rules/{id}`

#### 3.7 Initialization in main.go

**`apps/api/cmd/server/main.go:395-397`**:
```go
localTravelRuleRepo := repository.NewLocalTravelRuleRepository(db)
localTravelRuleService := service.NewLocalTravelRuleService(localTravelRuleRepo)
localTravelRuleHandler := handler.NewLocalTravelRuleHandler(localTravelRuleService)
```

---

### 4. Travel Allowance Preview Domain

#### 4.1 Service (Calculation Orchestrator)

**`apps/api/internal/service/travel_allowance_preview.go`** (245 lines):
- `TravelAllowancePreviewService` with three repository dependencies:
  - `previewRuleSetRepository` -- `GetByID(ctx, uuid.UUID) (*model.TravelAllowanceRuleSet, error)`
  - `previewLocalRuleRepository` -- `ListByRuleSet(ctx, uuid.UUID) ([]model.LocalTravelRule, error)`
  - `previewExtendedRuleRepository` -- `ListByRuleSet(ctx, uuid.UUID) ([]model.ExtendedTravelRule, error)`

**Preview method flow**:
1. Validates RuleSetID (not nil) -> `ErrTravelPreviewRuleSetIDRequired`
2. Validates TripType (must be "local" or "extended") -> `ErrTravelPreviewTripTypeRequired` / `ErrTravelPreviewInvalidTripType`
3. Fetches rule set by ID -> `ErrTravelPreviewRuleSetNotFound`
4. Dispatches to `previewLocal` or `previewExtended`

**Local preview flow** (`previewLocal`):
1. Validates DistanceKm > 0 or DurationMinutes > 0 -> `ErrTravelPreviewDistanceRequired`
2. Fetches local rules for rule set via `ListByRuleSet`
3. Filters to active rules only
4. Builds `calculation.LocalTravelInput` with `[]calculation.LocalTravelRuleInput`
5. Calls `calculation.CalculateLocalTravelAllowance(input)`
6. If no match -> `ErrTravelPreviewNoMatchingRule`
7. Returns single breakdown item: "Local travel allowance" with 1 day

**Extended preview flow** (`previewExtended`):
1. Validates StartDate and EndDate are non-zero -> `ErrTravelPreviewDatesRequired`
2. Fetches extended rules for rule set via `ListByRuleSet`
3. Finds first active rule -> `ErrTravelPreviewNoExtendedRule`
4. Builds `calculation.ExtendedTravelInput` with rule's rate configuration
5. Calls `calculation.CalculateExtendedTravelAllowance(input)`
6. Maps calculation breakdown items to service result

Input/output types:
- `TravelAllowancePreviewInput`: RuleSetID (uuid), TripType (string), DistanceKm (float64), DurationMinutes (int), StartDate, EndDate (time.Time), ThreeMonthActive (bool)
- `TravelAllowancePreviewResult`: TripType, RuleSetID, RuleSetName (string), TaxFreeTotal, TaxableTotal, TotalAllowance (decimal.Decimal), Breakdown ([]TravelAllowanceBreakdownItem)
- `TravelAllowanceBreakdownItem`: Description (string), Days (int), TaxFreeAmount, TaxableAmount, TaxFreeSubtotal, TaxableSubtotal (decimal.Decimal)

Error sentinels: `ErrTravelPreviewRuleSetNotFound`, `ErrTravelPreviewRuleSetIDRequired`, `ErrTravelPreviewTripTypeRequired`, `ErrTravelPreviewInvalidTripType`, `ErrTravelPreviewDistanceRequired`, `ErrTravelPreviewDurationRequired`, `ErrTravelPreviewDatesRequired`, `ErrTravelPreviewNoMatchingRule`, `ErrTravelPreviewNoExtendedRule`

#### 4.2 Handler

**`apps/api/internal/handler/travel_allowance_preview.go`** (129 lines):
- `TravelAllowancePreviewHandler` with `*service.TravelAllowancePreviewService`
- Single endpoint: `Preview` (POST /travel-allowance/preview)
- Decodes `models.TravelAllowancePreviewRequest`, validates, builds service input
- Date handling: `time.Time(req.StartDate)` / `time.Time(req.EndDate)` converts strfmt.Date
- Response mapping: `travelPreviewToResponse` converts decimal.Decimal to float64 for all amounts in the preview and breakdown
- Error handler: `handleTravelPreviewError` maps 9 different service errors to HTTP status codes (400, 404, 500)

#### 4.3 Route Registration

**`apps/api/internal/handler/routes.go:1508-1515`**:
- `RegisterTravelAllowancePreviewRoutes(r chi.Router, h *TravelAllowancePreviewHandler, authz *middleware.AuthorizationMiddleware)`
- Permission: `travel_allowance.manage`
- Single route: `POST /travel-allowance/preview`
- Note: This is NOT a `Route("/travel-allowance", ...)` group -- it's a flat route on the parent router

#### 4.4 Initialization in main.go

**`apps/api/cmd/server/main.go:403-404`**:
```go
travelAllowancePreviewService := service.NewTravelAllowancePreviewService(travelAllowanceRuleSetRepo, localTravelRuleRepo, extendedTravelRuleRepo)
travelAllowancePreviewHandler := handler.NewTravelAllowancePreviewHandler(travelAllowancePreviewService)
```

Note: The preview service reuses the three repositories that were already initialized for the CRUD services (`travelAllowanceRuleSetRepo`, `localTravelRuleRepo`, `extendedTravelRuleRepo`).

---

### 5. Calculation Package

**`apps/api/internal/calculation/travel_allowance.go`** (260 lines):

This is the pure calculation logic, independent of HTTP/DB concerns. It is used by the preview service.

#### 5.1 Local Travel Calculation

**`CalculateLocalTravelAllowance(input LocalTravelInput) LocalTravelOutput`**:
- Input: `DistanceKm` (decimal), `DurationMinutes` (int), `Rules` (pre-sorted)
- Logic: iterates rules in order. For each rule, checks if distance >= MinDistanceKm AND (MaxDistanceKm nil or distance <= MaxDistanceKm) AND duration >= MinDurationMinutes AND (MaxDurationMinutes nil or duration <= MaxDurationMinutes). First matching rule wins.
- Output: `Matched` (bool), `TaxFreeTotal`, `TaxableTotal`, `TotalAllowance` (decimals), `MatchedRuleIdx` (int)

#### 5.2 Extended Travel Calculation

**`CalculateExtendedTravelAllowance(input ExtendedTravelInput) ExtendedTravelOutput`**:
- Input: `StartDate`, `EndDate` (time.Time), `ThreeMonthActive` (bool), `Rule` (single rule with rates)
- Day calculation (inclusive): totalDays = (EndDate - StartDate) / 24h + 1, minimum 1
- Cases:
  - 1 day: 1 arrival day only
  - 2 days: 1 arrival + 1 departure
  - 3+ days: 1 arrival + (N-2) intermediate + 1 departure
- Three-month rule: if `ThreeMonthActive && Rule.ThreeMonthEnabled`, intermediate days use reduced three-month rates
- Output: TotalDays, ArrivalDays, DepartureDays, IntermediateDays (ints), TaxFreeTotal, TaxableTotal, TotalAllowance (decimals), Breakdown ([]ExtendedTravelBreakdownItem)

Types:
- `LocalTravelRuleInput`: MinDistanceKm, MaxDistanceKm (*decimal), MinDurationMinutes (int), MaxDurationMinutes (*int), TaxFreeAmount, TaxableAmount (decimal)
- `ExtendedTravelRuleInput`: 8 rate fields + ThreeMonthEnabled (bool)
- `ExtendedTravelBreakdownItem`: Description (string), Days (int), TaxFreeAmount, TaxableAmount, TaxFreeSubtotal, TaxableSubtotal (decimal)

---

### 6. Permissions

**`apps/api/internal/permissions/permissions.go:78`**:
- `travel_allowance.manage` -- "Manage travel allowance rule sets, local and extended travel rules"
- This single permission is used for ALL travel allowance operations (all four route groups)

**`apps/web/src/server/lib/permission-catalog.ts:195-198`** (frontend mirror):
- Same permission registered in the frontend catalog

The ticket description references `requirePermission("travel_allowance.*")` which aligns with the current single `travel_allowance.manage` permission.

---

### 7. OpenAPI Specification

**Paths**: `api/paths/travel-allowance.yaml` (367 lines)
- 13 operations across 4 entity groups:
  - Rule sets: `listTravelAllowanceRuleSets`, `createTravelAllowanceRuleSet`, `getTravelAllowanceRuleSet`, `updateTravelAllowanceRuleSet`, `deleteTravelAllowanceRuleSet`
  - Local rules: `listLocalTravelRules`, `createLocalTravelRule`, `getLocalTravelRule`, `updateLocalTravelRule`, `deleteLocalTravelRule`
  - Extended rules: `listExtendedTravelRules`, `createExtendedTravelRule`, `getExtendedTravelRule`, `updateExtendedTravelRule`, `deleteExtendedTravelRule`
  - Preview: `previewTravelAllowance`

**Schemas**: `api/schemas/travel-allowance.yaml` (466 lines)
- 15 schema definitions:
  - `TravelAllowanceRuleSet`, `CreateTravelAllowanceRuleSetRequest`, `UpdateTravelAllowanceRuleSetRequest`, `TravelAllowanceRuleSetList`
  - `LocalTravelRule`, `CreateLocalTravelRuleRequest`, `UpdateLocalTravelRuleRequest`, `LocalTravelRuleList`
  - `ExtendedTravelRule`, `CreateExtendedTravelRuleRequest`, `UpdateExtendedTravelRuleRequest`, `ExtendedTravelRuleList`
  - `TravelAllowancePreviewRequest`, `TravelAllowancePreview`, `TravelAllowanceBreakdownItem`

Key schema details:
- `calculation_basis` enum: `["per_day", "per_booking"]`
- `distance_rule` enum: `["longest", "shortest", "first", "last"]`
- `trip_type` enum: `["local", "extended"]`
- Monetary fields are `type: number, format: double`
- Create rule set requires `code` and `name`; create local/extended rule requires `rule_set_id`

---

### 8. Generated Models (go-swagger)

All located in `apps/api/gen/models/`:

15 generated model files:
- `travel_allowance_rule_set.go` -- with CalculationBasis and DistanceRule enum validation
- `travel_allowance_rule_set_list.go`
- `create_travel_allowance_rule_set_request.go` -- requires Code (min 1, max 50) and Name (min 1, max 255); validates CalculationBasis/DistanceRule enums
- `update_travel_allowance_rule_set_request.go`
- `local_travel_rule.go`
- `local_travel_rule_list.go`
- `create_local_travel_rule_request.go` -- requires RuleSetID (uuid format)
- `update_local_travel_rule_request.go`
- `extended_travel_rule.go`
- `extended_travel_rule_list.go`
- `create_extended_travel_rule_request.go` -- requires RuleSetID (uuid format)
- `update_extended_travel_rule_request.go`
- `travel_allowance_preview_request.go` -- requires RuleSetID (uuid) and TripType (enum "local"/"extended")
- `travel_allowance_preview.go`
- `travel_allowance_breakdown_item.go`

---

### 9. Frontend

#### 9.1 Existing Frontend Hooks

No frontend hooks exist for travel allowance. There are no files in `apps/web/src/hooks/api/` matching `*travel*`.

#### 9.2 Frontend Components

No frontend components exist for travel allowance. There are no directories or files in `apps/web/src/components/` or pages in `apps/web/src/app/` matching `*travel*`.

#### 9.3 Frontend Types

**`apps/web/src/lib/api/types.ts`**: Contains auto-generated TypeScript types from the OpenAPI spec. All 15 schema types and 16 operations are present as TypeScript interfaces.

#### 9.4 Permission Catalog

**`apps/web/src/server/lib/permission-catalog.ts:195-198`**: `travel_allowance.manage` permission is registered.

---

### 10. Tests

No tests exist for any travel allowance domain. A grep for `travel_allowance|travel-allowance|TravelAllowance|ExtendedTravel|LocalTravel` in `*_test.go` files returns zero results.

The calculation package (`internal/calculation/travel_allowance.go`) also has no dedicated test file, though other calculation files (pairing, tolerance, breaks, monthly, vacation, shift, capping, surcharge, rounding) all have corresponding `*_test.go` files.

---

### 11. Shared Helper: parseDate

**`apps/api/internal/service/date_helpers.go`** (8 lines):
- `parseDate(s string) (time.Time, error)` -- parses date strings in "2006-01-02" format
- Used by `travel_allowance_rule_set.go` for ValidFrom/ValidTo parsing
- Also used by order.go, order_assignment.go, order_booking.go, report.go
- This is a shared utility that will remain after the tRPC migration

---

### 12. Dependency Map

#### 12.1 Repository Sharing

The travel allowance preview service depends on three repositories that are also used by the CRUD services:
- `TravelAllowanceRuleSetRepository` -- shared between `TravelAllowanceRuleSetService` and `TravelAllowancePreviewService`
- `LocalTravelRuleRepository` -- shared between `LocalTravelRuleService` and `TravelAllowancePreviewService`
- `ExtendedTravelRuleRepository` -- shared between `ExtendedTravelRuleService` and `TravelAllowancePreviewService`

In main.go, repo instances are created once and passed to both CRUD services and the preview service.

#### 12.2 Calculation Package Dependency

`TravelAllowancePreviewService` depends on:
- `calculation.CalculateLocalTravelAllowance` -- pure function for local trip matching
- `calculation.CalculateExtendedTravelAllowance` -- pure function for extended trip breakdown

The calculation package has no external dependencies (only `shopspring/decimal` and `time`). It will remain unchanged during the tRPC migration.

#### 12.3 FK Cascade Dependencies

- `local_travel_rules.rule_set_id` -> `travel_allowance_rule_sets(id)` ON DELETE CASCADE
- `extended_travel_rules.rule_set_id` -> `travel_allowance_rule_sets(id)` ON DELETE CASCADE

Deleting a rule set will cascade-delete all its local and extended rules.

#### 12.4 No Other Consumers

No other service or handler references travel allowance entities. Unlike terminal bookings (which feed into evaluations and scheduler tasks), the travel allowance domain is self-contained. The calculation package is independent and only used by the preview service.

---

## Code References

- `apps/api/internal/model/travel_allowance_rule_set.go` -- TravelAllowanceRuleSet GORM model (30 lines)
- `apps/api/internal/model/extended_travel_rule.go` -- ExtendedTravelRule GORM model with decimal fields (36 lines)
- `apps/api/internal/model/local_travel_rule.go` -- LocalTravelRule GORM model with nullable fields (33 lines)
- `apps/api/internal/repository/travel_allowance_rule_set.go` -- TravelAllowanceRuleSetRepository (79 lines)
- `apps/api/internal/repository/extended_travel_rule.go` -- ExtendedTravelRuleRepository with ListByRuleSet (77 lines)
- `apps/api/internal/repository/local_travel_rule.go` -- LocalTravelRuleRepository with ListByRuleSet (77 lines)
- `apps/api/internal/service/travel_allowance_rule_set.go` -- TravelAllowanceRuleSetService with code uniqueness (189 lines)
- `apps/api/internal/service/extended_travel_rule.go` -- ExtendedTravelRuleService (193 lines)
- `apps/api/internal/service/local_travel_rule.go` -- LocalTravelRuleService (168 lines)
- `apps/api/internal/service/travel_allowance_preview.go` -- TravelAllowancePreviewService with calculation delegation (245 lines)
- `apps/api/internal/handler/travel_allowance_rule_set.go` -- TravelAllowanceRuleSetHandler (216 lines)
- `apps/api/internal/handler/extended_travel_rule.go` -- ExtendedTravelRuleHandler (248 lines)
- `apps/api/internal/handler/local_travel_rule.go` -- LocalTravelRuleHandler (236 lines)
- `apps/api/internal/handler/travel_allowance_preview.go` -- TravelAllowancePreviewHandler (129 lines)
- `apps/api/internal/handler/routes.go:1448-1515` -- Route registration for all 4 domains
- `apps/api/internal/calculation/travel_allowance.go` -- Pure calculation logic (260 lines)
- `apps/api/internal/service/date_helpers.go` -- Shared parseDate helper (8 lines)
- `apps/api/cmd/server/main.go:391-404` -- Service initialization and wiring
- `apps/api/cmd/server/main.go:585-588` -- Route registration calls
- `apps/api/internal/permissions/permissions.go:78` -- Permission definition
- `db/migrations/000075_create_travel_allowance.up.sql` -- All three tables (83 lines)
- `api/paths/travel-allowance.yaml` -- OpenAPI paths (367 lines)
- `api/schemas/travel-allowance.yaml` -- OpenAPI schemas (466 lines)
- `apps/web/src/lib/api/types.ts` -- Auto-generated TypeScript types (references travel allowance)
- `apps/web/src/server/lib/permission-catalog.ts:195-198` -- Frontend permission catalog entry
- `thoughts/shared/tickets/ZMI-TICKET-030-travel-allowance-ausloese.md` -- Original domain ticket

## Architecture Documentation

### Patterns Observed

1. **Handler/Service/Repository layering**: All four domains follow the standard clean architecture pattern. Handlers parse HTTP requests and format responses, services contain validation and business logic, repositories handle GORM queries.

2. **Interface-driven dependencies**: Services define local interfaces for their repository dependencies. The preview service uses three separate interface types (one per repository), each exposing only the methods needed.

3. **Error sentinel pattern**: Each layer defines its own error sentinels. Service errors are the canonical set; handler error-switch functions map service errors to HTTP status codes.

4. **Generated model usage**: Handlers use `gen/models` types for request/response payloads. Domain `model` types are used internally. Manual mapping functions convert between the two, handling UUID conversion (uuid.UUID <-> strfmt.UUID), date conversion (time.Time <-> strfmt.Date/DateTime), and decimal conversion (decimal.Decimal <-> float64).

5. **No pagination**: All three CRUD list endpoints return unpaginated lists (`{Data: [...]}`). No page/pageSize/total parameters exist.

6. **Shared permission**: All four route groups use the same `travel_allowance.manage` permission for all operations.

7. **Calculation separation**: The actual travel allowance calculation logic is in a separate `calculation` package, keeping it independent of HTTP and database concerns. The preview service acts as an orchestrator that fetches data and delegates to the calculation functions.

8. **Repository reuse**: The preview service reuses the same repository instances as the CRUD services, avoiding duplicate database connections.

9. **Decimal handling**: ExtendedTravelRule and LocalTravelRule models use `shopspring/decimal` for all monetary and distance fields. Conversion to/from float64 happens at the handler boundary.

10. **Code immutability**: TravelAllowanceRuleSet's `code` field cannot be changed after creation. This is enforced in the service layer by not including Code in UpdateTravelAllowanceRuleSetInput.

## Open Questions

1. The ticket description references `requirePermission("travel_allowance.*")` with a wildcard. The current implementation uses a single `travel_allowance.manage` permission. Will the wildcard notation be used in the tRPC router, or will it map to the existing `travel_allowance.manage` permission?
2. There are no existing tests for any travel allowance domain (handler, service, repository, or calculation). Will the tRPC migration include adding tests?
3. The calculation package (`internal/calculation/travel_allowance.go`) is pure Go logic with no HTTP dependencies. Since the tRPC migration replaces the Go HTTP layer, the calculation logic could potentially be reimplemented in TypeScript or kept as a Go-based internal library called via an internal endpoint. Which approach is intended?
4. The `ListByRuleSet` repository method is used only by the preview service. In the tRPC migration, how will this filtering be exposed? As a separate query procedure or as a filter parameter on the list procedure?
