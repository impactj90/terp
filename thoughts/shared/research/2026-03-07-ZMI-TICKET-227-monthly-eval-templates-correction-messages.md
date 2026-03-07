---
date: "2026-03-07"
researcher: Claude
git_commit: 58293f0b
branch: staging
repository: terp
topic: "ZMI-TICKET-227: Monthly Eval Templates, Correction Messages"
tags: [research, codebase, monthly-eval-templates, correction-assistant, correction-messages, trpc-migration]
status: complete
last_updated: "2026-03-07"
last_updated_by: Claude
---

# Research: ZMI-TICKET-227 -- Monthly Eval Templates, Correction Messages

**Date**: 2026-03-07
**Researcher**: Claude
**Git Commit**: 58293f0b
**Branch**: staging
**Repository**: terp

## Research Question

Research the codebase for ZMI-TICKET-227: Monthly Evaluation Templates and Correction Assistant (with messages). Document all existing Go backend files (handler/service/repository), domain models, database migrations, OpenAPI specs, generated models, route registration, permissions, frontend hooks, tests, and cross-cutting dependencies relevant to the tRPC migration.

## Summary

This ticket covers two independent entity groups: **Monthly Evaluation Templates** (CRUD + default management) and the **Correction Assistant** (correction message catalog + assistant query items). Both have complete Go backend implementations following the standard handler/service/repository architecture.

Monthly Evaluation Templates are a straightforward CRUD entity with a `setDefault` action that clears existing defaults before setting a new one. The correction assistant is more complex -- it has two conceptual sub-parts: (1) a correction message catalog (CRUD for error/hint text entries per tenant, with auto-seeding of defaults), and (2) an assistant query that joins daily values with error codes against the message catalog to produce resolved correction items.

**Neither `MonthlyEvaluationTemplate` nor `CorrectionMessage` exists in the Prisma schema yet.** Both tables exist in the database (migrations `000081` and `000045` respectively) but need to be added to `apps/web/prisma/schema.prisma` before tRPC routers can use Prisma for data access. The `DailyValue` table is also not in the Prisma schema -- the correction assistant's `ListItems` query (which queries `daily_values`) will need to use `prisma.$queryRawUnsafe()` as the reports router does for the same table.

Both frontend hooks exist but use the old REST patterns. `use-monthly-evaluations.ts` uses `useApiQuery`/`useApiMutation` (OpenAPI-generated client). `use-correction-assistant.ts` uses manual `fetch` with `@tanstack/react-query`.

---

## Detailed Findings

### 1. Monthly Evaluation Templates Domain

#### 1.1 Database Table

**`monthly_evaluation_templates`** (migration `000081`):
- File: `db/migrations/000081_create_monthly_evaluation_templates.up.sql`
- Columns: `id` (UUID PK, default gen_random_uuid()), `tenant_id` (UUID NOT NULL FK tenants), `name` (varchar 100 NOT NULL), `description` (text default ''), `flextime_cap_positive` (integer NOT NULL default 0), `flextime_cap_negative` (integer NOT NULL default 0), `overtime_threshold` (integer NOT NULL default 0), `max_carryover_vacation` (numeric(10,2) NOT NULL default 0), `is_default` (boolean NOT NULL default false), `is_active` (boolean NOT NULL default true), `created_at` (timestamptz NOT NULL default now()), `updated_at` (timestamptz NOT NULL default now())
- Index: `idx_monthly_eval_templates_tenant_id` on `tenant_id`
- No update trigger (unlike most newer tables)
- **Not in Prisma schema** -- needs to be added

#### 1.2 Domain Model

**`apps/api/internal/model/monthly_evaluation_template.go`** (29 lines):
- `MonthlyEvaluationTemplate` struct with GORM tags
- Fields: ID (uuid), TenantID (uuid), Name (string), Description (string), FlextimeCapPositive (int), FlextimeCapNegative (int), OvertimeThreshold (int), MaxCarryoverVacation (decimal.Decimal), IsDefault (bool), IsActive (bool), CreatedAt, UpdatedAt
- Table name: `monthly_evaluation_templates`
- Uses `github.com/shopspring/decimal` for `MaxCarryoverVacation`

#### 1.3 Repository

**`apps/api/internal/repository/monthly_evaluation_template.go`** (97 lines):
- `MonthlyEvalTemplateRepository` struct with `*DB`
- Methods:
  - `List(ctx, tenantID uuid.UUID, isActive *bool) ([]model.MonthlyEvaluationTemplate, error)` -- optional `is_active` filter, ordered by `name ASC`
  - `GetByID(ctx, id uuid.UUID) (*model.MonthlyEvaluationTemplate, error)`
  - `GetDefault(ctx, tenantID uuid.UUID) (*model.MonthlyEvaluationTemplate, error)` -- finds `is_default = true` for tenant
  - `Create(ctx, *model.MonthlyEvaluationTemplate) error`
  - `Update(ctx, *model.MonthlyEvaluationTemplate) error` -- uses `Save`
  - `Delete(ctx, id uuid.UUID) error` -- checks `RowsAffected`
  - `ClearDefault(ctx, tenantID uuid.UUID) error` -- sets `is_default = false` for all templates in tenant
- Error sentinel: `ErrMonthlyEvalTemplateNotFound`

#### 1.4 Service

**`apps/api/internal/service/monthly_evaluation_template.go`** (214 lines):
- `MonthlyEvalTemplateService` with `monthlyEvalTemplateRepo` interface (7 methods)
- Service errors: `ErrMonthlyEvalTemplateNotFound`, `ErrCannotDeleteDefaultTemplate`

**Create logic** (`CreateMonthlyEvalTemplateInput` struct):
1. If `IsDefault` is true, calls `ClearDefault(tenantID)` first
2. Creates the template with all input fields
3. Returns the created template

**Update logic** (`UpdateMonthlyEvalTemplateInput` struct with all pointer fields):
1. Fetches existing template by ID
2. Applies non-nil fields
3. For `IsDefault`: if setting to true and was not default, calls `ClearDefault(tenantID)` first; if setting to false, just sets false
4. Saves via `Update`

**Delete logic**:
1. Fetches template by ID
2. If `IsDefault` is true, returns `ErrCannotDeleteDefaultTemplate`
3. Deletes by ID

**SetDefault logic**:
1. Fetches template by ID
2. Calls `ClearDefault(tenantID)` to unset all defaults
3. Sets `IsDefault = true` on the template
4. Saves via `Update`

#### 1.5 Handler

**`apps/api/internal/handler/monthly_evaluation_template.go`** (302 lines):
- `MonthlyEvalTemplateHandler` with `*service.MonthlyEvalTemplateService`
- Endpoints:
  - `List` (GET /monthly-evaluations) -- reads `is_active` query param, returns `MonthlyEvaluationList`
  - `Get` (GET /monthly-evaluations/{id}) -- parses UUID from URL
  - `GetDefault` (GET /monthly-evaluations/default) -- gets default for tenant
  - `Create` (POST /monthly-evaluations) -- uses `models.CreateMonthlyEvaluationRequest`
  - `Update` (PUT /monthly-evaluations/{id}) -- uses `models.UpdateMonthlyEvaluationRequest`, raw JSON for null detection
  - `Delete` (DELETE /monthly-evaluations/{id}) -- returns 204 No Content
  - `SetDefault` (POST /monthly-evaluations/{id}/set-default) -- returns updated template
- Response mapper: `monthlyEvalTemplateToResponse(*model.MonthlyEvaluationTemplate) *models.MonthlyEvaluation`
  - Converts decimal -> float64 for `MaxCarryoverVacation`
  - Maps all fields to generated model

#### 1.6 Route Registration

**`apps/api/internal/handler/routes.go`** (lines 1674-1695):
- Function: `RegisterMonthlyEvalTemplateRoutes(r chi.Router, h *MonthlyEvalTemplateHandler, authz *middleware.AuthorizationMiddleware)`
- Permission: `monthly_evaluations.manage` (single permission for all operations)
- Routes:
  - `GET /monthly-evaluations` -- permManage
  - `POST /monthly-evaluations` -- permManage
  - `GET /monthly-evaluations/default` -- permManage
  - `GET /monthly-evaluations/{id}` -- permManage
  - `PUT /monthly-evaluations/{id}` -- permManage
  - `DELETE /monthly-evaluations/{id}` -- permManage
  - `POST /monthly-evaluations/{id}/set-default` -- permManage

#### 1.7 OpenAPI Spec

Defined in `apps/api/cmd/server/openapi.bundled.yaml`:
- Paths: `/monthly-evaluations`, `/monthly-evaluations/default`, `/monthly-evaluations/{id}`, `/monthly-evaluations/{id}/set-default`
- Schemas: `MonthlyEvaluation`, `CreateMonthlyEvaluationRequest`, `UpdateMonthlyEvaluationRequest`, `MonthlyEvaluationList`

#### 1.8 Generated Go Models

**`apps/api/gen/models/monthly_evaluation.go`** (204 lines):
- `MonthlyEvaluation` struct with fields: CreatedAt, Description, FlextimeCapNegative (int64), FlextimeCapPositive (int64), ID (*strfmt.UUID required), IsActive (*bool required), IsDefault (*bool required), MaxCarryoverVacation (float64), Name (*string required), OvertimeThreshold (int64), TenantID (*strfmt.UUID required), UpdatedAt

**`apps/api/gen/models/monthly_evaluation_list.go`**: `Items []*MonthlyEvaluation`

#### 1.9 Permission

- Key: `monthly_evaluations.manage`
- Location in permission catalog: `apps/web/src/server/lib/permission-catalog.ts` (line 212-216)
- Description: "Manage monthly evaluation templates"

#### 1.10 main.go Wiring

**`apps/api/cmd/server/main.go`** (lines 228-230):
```go
monthlyEvalTemplateRepo := repository.NewMonthlyEvalTemplateRepository(db)
monthlyEvalTemplateService := service.NewMonthlyEvalTemplateService(monthlyEvalTemplateRepo)
monthlyEvalTemplateHandler := handler.NewMonthlyEvalTemplateHandler(monthlyEvalTemplateService)
```
Route registration at line 593: `handler.RegisterMonthlyEvalTemplateRoutes(r, monthlyEvalTemplateHandler, authzMiddleware)`

#### 1.11 Tests

No dedicated tests exist for the monthly evaluation template service or handler.

---

### 2. Correction Assistant Domain

The correction assistant has two sub-parts: (1) correction message catalog management and (2) correction assistant items query.

#### 2.1 Database Table -- Correction Messages

**`correction_messages`** (migration `000045`):
- File: `db/migrations/000045_create_correction_messages.up.sql`
- Columns: `id` (UUID PK), `tenant_id` (UUID NOT NULL FK tenants CASCADE), `code` (varchar 50 NOT NULL), `default_text` (text NOT NULL), `custom_text` (text nullable), `severity` (varchar 10 NOT NULL default 'error'), `description` (text nullable), `is_active` (boolean default true), `created_at` (timestamptz default now()), `updated_at` (timestamptz default now())
- Unique constraint: `(tenant_id, code)`
- Indexes: `idx_correction_messages_tenant`, `idx_correction_messages_code`, `idx_correction_messages_severity` on `(tenant_id, severity)`
- Trigger: `update_correction_messages_updated_at` auto-updates `updated_at`
- **Not in Prisma schema** -- needs to be added

#### 2.2 Domain Model -- Correction Message

**`apps/api/internal/model/correction_message.go`** (79 lines):

`CorrectionMessage` struct:
- ID (uuid), TenantID (uuid), Code (string), DefaultText (string), CustomText (*string nullable), Severity (CorrectionSeverity), Description (*string nullable), IsActive (bool), CreatedAt, UpdatedAt
- Table name: `correction_messages`
- `EffectiveText()` method: returns CustomText if non-nil and non-empty, otherwise DefaultText

`CorrectionSeverity` type (string): values `"error"` and `"hint"`

`CorrectionMessageFilter` struct: Severity (*CorrectionSeverity), IsActive (*bool), Code (*string)

`CorrectionAssistantFilter` struct: From (*time.Time), To (*time.Time), EmployeeID (*uuid.UUID), DepartmentID (*uuid.UUID), Severity (*CorrectionSeverity), ErrorCode (*string), Limit (int), Offset (int)

`CorrectionAssistantItem` struct: DailyValueID (uuid), EmployeeID (uuid), EmployeeName (string), DepartmentID (*uuid), DepartmentName (*string), ValueDate (time.Time), Errors ([]CorrectionAssistantError)

`CorrectionAssistantError` struct: Code (string), Severity (string), Message (string), ErrorType (string)

#### 2.3 Repository -- Correction Messages

**`apps/api/internal/repository/correction_message.go`** (116 lines):
- `CorrectionMessageRepository` struct with `*DB`
- Methods:
  - `Create(ctx, *model.CorrectionMessage) error`
  - `CreateBatch(ctx, []model.CorrectionMessage) error` -- bulk insert for seeding
  - `GetByID(ctx, id uuid.UUID) (*model.CorrectionMessage, error)`
  - `GetByCode(ctx, tenantID uuid.UUID, code string) (*model.CorrectionMessage, error)`
  - `Update(ctx, *model.CorrectionMessage) error` -- uses `Save`
  - `List(ctx, tenantID uuid.UUID, filter CorrectionMessageFilter) ([]model.CorrectionMessage, error)` -- filters by severity, is_active, code; ordered by `severity ASC, code ASC`
  - `ListAsMap(ctx, tenantID uuid.UUID) (map[string]*model.CorrectionMessage, error)` -- returns active messages keyed by code (used by assistant query)
  - `CountByTenant(ctx, tenantID uuid.UUID) (int64, error)` -- used for idempotent seeding check
- Error sentinel: `ErrCorrectionMessageNotFound`

#### 2.4 Service -- Correction Assistant

**`apps/api/internal/service/correction_assistant.go`** (357 lines):
- `CorrectionAssistantService` with two repository interfaces:
  - `correctionMessageRepository` (8 methods)
  - `dailyValueQueryRepository` -- `ListAll(ctx, tenantID uuid.UUID, opts model.DailyValueListOptions) ([]model.DailyValue, error)`
- Service errors: `ErrCorrectionMessageNotFound`, `ErrInvalidSeverity`

**Catalog management methods**:
- `ListMessages(ctx, tenantID, filter)` -- delegates to repo
- `GetMessage(ctx, id)` -- get by ID with error wrapping
- `UpdateMessage(ctx, id, tenantID, UpdateMessageInput)`:
  - Fetches by ID, verifies tenant ownership
  - `UpdateMessageInput` struct: CustomText (*string), ClearCustom (bool), Severity (*string), IsActive (*bool)
  - CustomText: if ClearCustom, sets nil; if empty string, sets nil; if non-empty, trims and sets
  - Severity: validates is "error" or "hint", returns `ErrInvalidSeverity` if not
  - IsActive: sets directly
- `EnsureDefaults(ctx, tenantID)`:
  - Checks `CountByTenant` -- if > 0, returns nil (idempotent)
  - Seeds `defaultCorrectionMessages(tenantID)` via `CreateBatch`
  - 24 default messages defined: 14 error codes + 10 warning/hint codes
  - All codes mapped from `calculation` package constants

**Assistant query method -- `ListItems(ctx, tenantID, filter)`**:
1. Applies default date range (previous month + current month) if not provided
2. Loads message catalog via `ListAsMap` (active messages only, keyed by code)
3. Builds `DailyValueListOptions` with `HasErrors: true`
4. Queries daily values via `dvRepo.ListAll`
5. For each daily value, calls `buildErrors()`:
   - Iterates error codes (severity "error") and warnings (severity "hint")
   - Applies severity and code filters
   - Resolves message text from catalog (falls back to raw code if not in map)
   - Maps error type via `mapCorrectionErrorType()` (e.g., "MISSING_COME" -> "missing_booking")
6. Resolves employee name and department from `dv.Employee` relation
7. Applies pagination (offset/limit) in-memory after all items are collected
8. Returns (items, total, error)

**Error type mapping** (`mapCorrectionErrorType`):
- MISSING_COME, MISSING_GO, NO_BOOKINGS -> "missing_booking"
- UNPAIRED_BOOKING -> "unpaired_booking"
- DUPLICATE_IN_TIME -> "overlapping_bookings"
- EARLY_COME, LATE_COME, EARLY_GO, LATE_GO, MISSED_CORE_START, MISSED_CORE_END -> "core_time_violation"
- BELOW_MIN_WORK_TIME -> "below_min_hours"
- NO_BREAK_RECORDED, SHORT_BREAK, MANUAL_BREAK, AUTO_BREAK_APPLIED -> "break_violation"
- MAX_TIME_REACHED -> "exceeds_max_hours"
- default -> "invalid_sequence"

**Default date range**: `defaultDateRange(from, to)`:
- If both nil: from = first day of previous month, to = last day of current month

#### 2.5 Handler -- Correction Assistant

**`apps/api/internal/handler/correction_assistant.go`** (301 lines):
- `CorrectionAssistantHandler` with `*service.CorrectionAssistantService`
- Endpoints:
  - `ListMessages` (GET /correction-messages) -- calls `EnsureDefaults` first, filters by severity/is_active/code, returns `CorrectionMessageList`
  - `GetMessage` (GET /correction-messages/{id}) -- returns single `CorrectionMessage`
  - `UpdateMessage` (PATCH /correction-messages/{id}) -- uses `models.UpdateCorrectionMessageRequest`, maps to `UpdateMessageInput`
  - `ListItems` (GET /correction-assistant) -- calls `EnsureDefaults` first, parses from/to/employee_id/department_id/severity/error_code/limit/offset from query params, returns `CorrectionAssistantList` with `PaginationMeta`

**Response mappers**:
- `mapCorrectionMessageToResponse` -- maps model to generated `models.CorrectionMessage`, includes `EffectiveText`
- `mapCorrectionAssistantItemToResponse` -- maps model to generated `models.CorrectionAssistantItem` with nested `models.CorrectionAssistantError` array

#### 2.6 Route Registration

**`apps/api/internal/handler/routes.go`** (lines 917-941):
- Function: `RegisterCorrectionAssistantRoutes(r chi.Router, h *CorrectionAssistantHandler, authz *middleware.AuthorizationMiddleware)`
- Permissions:
  - `time_tracking.view_all` for read operations (ListMessages, GetMessage, ListItems)
  - `time_tracking.edit` for write operations (UpdateMessage)
- Routes:
  - `GET /correction-messages` -- permViewAll
  - `GET /correction-messages/{id}` -- permViewAll
  - `PATCH /correction-messages/{id}` -- permEdit
  - `GET /correction-assistant` -- permViewAll

**Note**: The ticket specifies `corrections.read` and `corrections.write` permissions, but the existing Go backend uses `time_tracking.view_all` and `time_tracking.edit`. A `corrections.manage` permission exists in the permission catalog but is currently unused for these routes.

#### 2.7 OpenAPI Spec

Defined in `apps/api/cmd/server/openapi.bundled.yaml`:
- Paths: `/correction-messages`, `/correction-messages/{id}`, `/correction-assistant`
- Schemas: `CorrectionMessage`, `UpdateCorrectionMessageRequest`, `CorrectionMessageList`, `CorrectionAssistantItem`, `CorrectionAssistantError`, `CorrectionAssistantList`

#### 2.8 Generated Go Models

**`apps/api/gen/models/correction_message.go`** (273 lines):
- `CorrectionMessage` struct: Code (*string required), CreatedAt, CustomText (*string), DefaultText (*string required), Description (*string), EffectiveText (string, read-only), ID (*strfmt.UUID required), IsActive (bool required), Severity (*string required, enum ["error","hint"]), TenantID (*strfmt.UUID required), UpdatedAt

**`apps/api/gen/models/correction_message_list.go`**: `Data []*CorrectionMessage`

**`apps/api/gen/models/correction_assistant_item.go`** (227 lines):
- `CorrectionAssistantItem` struct: DailyValueID (*strfmt.UUID required), DepartmentID (*strfmt.UUID), DepartmentName (*string), EmployeeID (*strfmt.UUID required), EmployeeName (string), Errors ([]*CorrectionAssistantError required), ValueDate (*strfmt.Date required)

**`apps/api/gen/models/correction_assistant_error.go`**: Code (*string required), ErrorType (string), Message (*string required), Severity (*string required, enum ["error","hint"])

**`apps/api/gen/models/correction_assistant_list.go`**: Data ([]*CorrectionAssistantItem required), Meta (*PaginationMeta required)

#### 2.9 Permissions

For correction assistant operations (as registered in Go backend):
- `time_tracking.view_all` -- for reading messages and items
- `time_tracking.edit` -- for updating messages

In the permission catalog (`apps/web/src/server/lib/permission-catalog.ts`):
- `corrections.manage` (line 210) -- "Manage corrections" -- exists but currently NOT used by correction assistant routes
- `time_tracking.view_all` (line 58-61)
- `time_tracking.edit` (line 62-66)

#### 2.10 main.go Wiring

**`apps/api/cmd/server/main.go`** (lines 322-324):
```go
correctionMessageRepo := repository.NewCorrectionMessageRepository(db)
correctionAssistantService := service.NewCorrectionAssistantService(correctionMessageRepo, dailyValueRepo)
correctionAssistantHandler := handler.NewCorrectionAssistantHandler(correctionAssistantService)
```
Route registration at line 556: `handler.RegisterCorrectionAssistantRoutes(r, correctionAssistantHandler, authzMiddleware)`

#### 2.11 Tests

**`apps/api/internal/service/correction_assistant_test.go`** (883 lines) -- comprehensive test suite:

Catalog tests:
- `TestCorrectionAssistant_EnsureDefaults_SeedsMessages` -- verifies seeding creates error and hint messages
- `TestCorrectionAssistant_EnsureDefaults_Idempotent` -- verifies no duplicates on repeated calls
- `TestCorrectionAssistant_ListMessages_FilterBySeverity` -- error vs hint filtering
- `TestCorrectionAssistant_ListMessages_FilterByCode` -- single code filter
- `TestCorrectionAssistant_ListMessages_FilterByActive` -- active filter
- `TestCorrectionAssistant_GetMessage` -- get by ID
- `TestCorrectionAssistant_GetMessage_NotFound`
- `TestCorrectionAssistant_UpdateMessage_CustomText` -- set custom text
- `TestCorrectionAssistant_UpdateMessage_ClearCustomText` -- empty string clears
- `TestCorrectionAssistant_UpdateMessage_Severity` -- change error to hint
- `TestCorrectionAssistant_UpdateMessage_InvalidSeverity` -- validates severity enum
- `TestCorrectionAssistant_UpdateMessage_Deactivate`
- `TestCorrectionAssistant_UpdateMessage_WrongTenant` -- cross-tenant check
- `TestCorrectionAssistant_UpdateMessage_NotFound`

EffectiveText tests:
- `TestCorrectionMessage_EffectiveText_DefaultWhenNoCustom`
- `TestCorrectionMessage_EffectiveText_CustomOverridesDefault`
- `TestCorrectionMessage_EffectiveText_EmptyCustomFallsBack`

Assistant query tests:
- `TestCorrectionAssistant_ListItems_BasicQuery` -- basic error item retrieval
- `TestCorrectionAssistant_ListItems_MessageResolution` -- verifies text resolution from catalog
- `TestCorrectionAssistant_ListItems_CustomTextOverride` -- custom text used in items
- `TestCorrectionAssistant_ListItems_FilterByEmployee`
- `TestCorrectionAssistant_ListItems_FilterBySeverity`
- `TestCorrectionAssistant_ListItems_FilterByErrorCode`
- `TestCorrectionAssistant_ListItems_Pagination` -- offset/limit
- `TestCorrectionAssistant_ListItems_WithWarnings` -- errors + warnings together
- `TestCorrectionAssistant_ListItems_EmployeeName` -- employee name resolution
- `TestCorrectionAssistant_ListItems_EmptyResult`
- `TestCorrectionAssistant_ListItems_ErrorTypeMapping` -- all error type mappings
- `TestCorrectionAssistant_ListItems_InactiveMessagesExcluded` -- inactive messages fall back to raw code
- `TestCorrectionAssistant_TenantIsolation` -- cross-tenant isolation

---

### 3. Frontend Hooks (to be migrated)

#### 3.1 Monthly Evaluations Hook

**`apps/web/src/hooks/api/use-monthly-evaluations.ts`** (92 lines):
- Uses `useApiQuery` and `useApiMutation` (OpenAPI-generated client pattern)
- Exports:
  - `useMonthlyEvaluations(options)` -- GET list with `is_active`, `limit`, `cursor` params
  - `useMonthlyEvaluation(id)` -- GET by ID
  - `useDefaultMonthlyEvaluation()` -- GET default
  - `useCreateMonthlyEvaluation()` -- POST, invalidates list + default
  - `useUpdateMonthlyEvaluation()` -- PUT, invalidates list + by-ID + default
  - `useDeleteMonthlyEvaluation()` -- DELETE, invalidates list + by-ID
  - `useSetDefaultMonthlyEvaluation()` -- POST set-default, invalidates list + default + by-ID

#### 3.2 Correction Assistant Hook

**`apps/web/src/hooks/api/use-correction-assistant.ts`** (174 lines):
- Uses manual `fetch` with `@tanstack/react-query` (NOT the OpenAPI client)
- Custom `apiRequest` helper builds headers with auth token and tenant ID
- TypeScript interfaces defined inline:
  - `CorrectionAssistantError`: code, severity ('error'|'hint'), message, error_type
  - `CorrectionAssistantItem`: daily_value_id, employee_id, employee_name, department_id (nullable), department_name (nullable), value_date, errors[]
  - `CorrectionAssistantList`: data[], meta{total, limit, offset, has_more}
  - `CorrectionMessage`: id, tenant_id, code, default_text, custom_text (nullable), effective_text, severity, description (nullable), is_active, created_at, updated_at
  - `CorrectionMessageList`: data[], meta?
  - `UpdateCorrectionMessageRequest`: custom_text?, severity?, is_active?
- Exports:
  - `useCorrectionAssistantItems(options)` -- GET /correction-assistant with from/to/employee_id/department_id/severity/error_code/limit/offset
  - `useCorrectionMessages(options)` -- GET /correction-messages with severity/is_active/code
  - `useCorrectionMessage(id)` -- GET /correction-messages/{id}
  - `useUpdateCorrectionMessage()` -- PATCH /correction-messages/{id}, invalidates both correction-messages and correction-assistant query keys

---

### 4. Cross-Cutting Dependencies

#### 4.1 DailyValue Table (Not in Prisma)

The correction assistant's `ListItems` query depends on the `daily_values` table (and its `employees` relation). This table is **not in the Prisma schema**. The reports router (`apps/web/src/server/routers/reports.ts`) handles this same table using `prisma.$queryRawUnsafe()` (lines 890-903 for daily overview query).

The Go service joins daily values with employees and departments:
- `model.DailyValueListOptions` with `HasErrors: true` filter
- Employee preloading for name and department resolution
- Fields used: `dv.ErrorCodes` (pq.StringArray), `dv.Warnings` (pq.StringArray), `dv.Employee.FirstName`, `dv.Employee.LastName`, `dv.Employee.DepartmentID`, `dv.Employee.Department.Name`

#### 4.2 Calculation Error Codes

The default correction messages and error type mapping reference constants from `apps/api/internal/calculation/errors.go`:
- 14 error codes (MISSING_COME, MISSING_GO, UNPAIRED_BOOKING, etc.)
- 10 warning codes (CROSS_MIDNIGHT, MAX_TIME_REACHED, MANUAL_BREAK, etc.)
- These are string constants -- need to be replicated in TypeScript for the tRPC router

#### 4.3 Correction vs CorrectionAssistant

There is a separate `Correction` entity (different from `CorrectionAssistant`):
- `apps/api/internal/repository/correction.go` with `CorrectionRepository`
- `apps/api/internal/handler/correction.go` with `CorrectionHandler`
- Routes at `/corrections` (CRUD + approve/reject)
- This is for manual time corrections, NOT the error/hint message catalog

The correction assistant is about displaying calculation errors/warnings to the user with customizable messages.

---

### 5. Prisma Schema Requirements

#### 5.1 MonthlyEvaluationTemplate Model (to be added)

Based on migration `000081`:
```prisma
model MonthlyEvaluationTemplate {
  id                   String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId             String   @map("tenant_id") @db.Uuid
  name                 String   @db.VarChar(100)
  description          String   @default("") @db.Text
  flextimeCapPositive  Int      @default(0) @map("flextime_cap_positive")
  flextimeCapNegative  Int      @default(0) @map("flextime_cap_negative")
  overtimeThreshold    Int      @default(0) @map("overtime_threshold")
  maxCarryoverVacation Decimal  @default(0) @map("max_carryover_vacation") @db.Decimal(10, 2)
  isDefault            Boolean  @default(false) @map("is_default")
  isActive             Boolean  @default(true) @map("is_active")
  createdAt            DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt            DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId], map: "idx_monthly_eval_templates_tenant_id")
  @@map("monthly_evaluation_templates")
}
```

#### 5.2 CorrectionMessage Model (to be added)

Based on migration `000045`:
```prisma
model CorrectionMessage {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  code        String   @db.VarChar(50)
  defaultText String   @map("default_text") @db.Text
  customText  String?  @map("custom_text") @db.Text
  severity    String   @default("error") @db.VarChar(10)
  description String?  @db.Text
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, code])
  @@index([tenantId], map: "idx_correction_messages_tenant")
  @@index([code], map: "idx_correction_messages_code")
  @@index([tenantId, severity], map: "idx_correction_messages_severity")
  @@map("correction_messages")
}
```

---

### 6. tRPC Router Pattern Reference

#### 6.1 Established Pattern (from recent tickets)

All tRPC routers follow this pattern:
- File: `apps/web/src/server/routers/<routerName>.ts`
- Import: `createTRPCRouter`, `tenantProcedure` from `../trpc`
- Import: `requirePermission` from `../middleware/authorization`
- Import: `permissionIdByKey` from `../lib/permission-catalog`
- Define permission constants using `permissionIdByKey()`
- Define Zod input/output schemas
- Export named router constant (e.g., `export const monthlyEvalTemplatesRouter = createTRPCRouter({...})`)
- Each procedure: `tenantProcedure.use(requirePermission(PERM_ID)).input(schema).output(schema).query/mutation(async ({ctx, input}) => {...})`
- Data access via `ctx.prisma.<model>.<method>()`

#### 6.2 Root Router Registration

New routers must be:
1. Imported in `apps/web/src/server/root.ts`
2. Added to the `appRouter` object with a camelCase key

#### 6.3 Frontend Hook Pattern (tRPC)

Migrated hooks follow this pattern (from `use-export-interfaces.ts`):
- Import `useTRPC` from `@/trpc`
- Import `useQuery`, `useMutation`, `useQueryClient` from `@tanstack/react-query`
- Query hooks: `const trpc = useTRPC(); return useQuery(trpc.<router>.<procedure>.queryOptions(input, options))`
- Mutation hooks: `const trpc = useTRPC(); return useMutation({...trpc.<router>.<procedure>.mutationOptions(), onSuccess: () => queryClient.invalidateQueries({queryKey: trpc.<router>.<list>.queryKey()})})`

---

### 7. File Inventory

#### 7.1 Go Files to be Replaced

| File | Lines | Purpose |
|------|-------|---------|
| `apps/api/internal/service/monthly_evaluation_template.go` | 214 | Service with CRUD + SetDefault |
| `apps/api/internal/handler/monthly_evaluation_template.go` | 302 | HTTP handlers |
| `apps/api/internal/repository/monthly_evaluation_template.go` | 97 | GORM data access |
| `apps/api/internal/service/correction_assistant.go` | 357 | Service with catalog + items query |
| `apps/api/internal/handler/correction_assistant.go` | 301 | HTTP handlers |
| `apps/api/internal/repository/correction_message.go` | 116 | GORM data access |

Domain models (`apps/api/internal/model/monthly_evaluation_template.go` and `apps/api/internal/model/correction_message.go`) will continue to exist but will not be actively used by the tRPC layer.

#### 7.2 Frontend Files to be Migrated

| File | Lines | Current Pattern |
|------|-------|----------------|
| `apps/web/src/hooks/api/use-monthly-evaluations.ts` | 92 | useApiQuery/useApiMutation (OpenAPI) |
| `apps/web/src/hooks/api/use-correction-assistant.ts` | 174 | Manual fetch + react-query |

#### 7.3 Files to be Created

| File | Purpose |
|------|---------|
| `apps/web/src/server/routers/monthlyEvalTemplates.ts` | tRPC router |
| `apps/web/src/server/routers/correctionAssistant.ts` | tRPC router |

#### 7.4 Files to be Modified

| File | Change |
|------|--------|
| `apps/web/prisma/schema.prisma` | Add MonthlyEvaluationTemplate and CorrectionMessage models |
| `apps/web/src/server/root.ts` | Import and register both new routers |
| `apps/web/src/hooks/api/use-monthly-evaluations.ts` | Migrate to tRPC pattern |
| `apps/web/src/hooks/api/use-correction-assistant.ts` | Migrate to tRPC pattern |

---

### 8. Key Implementation Considerations

1. **Prisma Schema First**: Both `MonthlyEvaluationTemplate` and `CorrectionMessage` models must be added to the Prisma schema and `npx prisma generate` run before tRPC routers can be implemented.

2. **DailyValue Not in Prisma**: The correction assistant `items` query depends on `daily_values` which is not in the Prisma schema. Use `prisma.$queryRawUnsafe()` for this query, following the pattern in `reports.ts` (lines 890-903). The query needs to join `daily_values`, `employees`, and `departments` to get employee names, department info, and filter by `has_error = true`.

3. **Default Seeding**: The `EnsureDefaults` logic needs to be ported -- it seeds 24 default correction messages per tenant on first access. The calculation error codes need to be defined as TypeScript constants.

4. **Permission Mismatch**: The ticket specifies `corrections.read` / `corrections.write` but the Go backend uses `time_tracking.view_all` / `time_tracking.edit`. The implementer should follow the existing Go permission mapping to maintain backward compatibility.

5. **Decimal Handling**: `max_carryover_vacation` is `NUMERIC(10,2)` in the database. Prisma maps this to `Decimal` type. The output schema should use `z.number()` and convert with `Number()`.

6. **SetDefault Atomicity**: The `ClearDefault` + `Update` sequence should ideally use a Prisma transaction (`ctx.prisma.$transaction()`) for atomicity.

7. **In-Memory Pagination**: The correction assistant `ListItems` applies pagination in-memory after filtering. This is acceptable for the expected data volumes but worth noting.

8. **Tenant Relation**: The Prisma `Tenant` model needs relation fields added for both new models (e.g., `monthlyEvaluationTemplates MonthlyEvaluationTemplate[]` and `correctionMessages CorrectionMessage[]`).
