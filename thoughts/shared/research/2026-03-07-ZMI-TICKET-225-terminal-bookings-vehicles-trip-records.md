---
date: "2026-03-07T07:33:07+01:00"
researcher: Claude
git_commit: feaf522c8533c7117e9079f6fde8cbee81c7f630
branch: staging
repository: terp
topic: "ZMI-TICKET-225: Terminal Bookings, Vehicles, Trip Records"
tags: [research, codebase, terminal-bookings, vehicles, vehicle-routes, trip-records, trpc-migration]
status: complete
last_updated: "2026-03-07"
last_updated_by: Claude
---

# Research: ZMI-TICKET-225 -- Terminal Bookings, Vehicles, Trip Records

**Date**: 2026-03-07T07:33:07+01:00
**Researcher**: Claude
**Git Commit**: feaf522c8533c7117e9079f6fde8cbee81c7f630
**Branch**: staging
**Repository**: terp

## Research Question

Research the codebase for ZMI-TICKET-225: Terminal Bookings, Vehicles, Trip Records. Document all existing Go backend files (handler/service/repository), models, database migrations, OpenAPI specs, generated models, route registration, permissions, frontend hooks, frontend components, tests, and cross-cutting dependencies that will be affected by or relevant to the tRPC migration.

## Summary

This ticket covers four entity groups across three functional areas: terminal bookings (import + list + batches), vehicles (CRUD), vehicle routes (CRUD), and trip records (CRUD). All four have complete Go backend implementations following the standard handler/service/repository architecture. The terminal bookings domain is the most complex, featuring idempotent batch import with employee PIN resolution and booking type code resolution. Vehicles, vehicle routes, and trip records follow a simpler CRUD pattern with code-uniqueness validation.

Terminal bookings have existing frontend hooks and UI components. Vehicles, vehicle routes, and trip records have no existing frontend hooks or UI components -- they are described as "placeholder" in the codebase and will need new frontend integration.

The terminal import flow has a scheduler integration via `TerminalImportTaskHandler`. The evaluation module also queries terminal bookings by filtering on `source='terminal'` from the bookings table.

---

## Detailed Findings

### 1. Terminal Bookings Domain

#### 1.1 Database Tables

**`import_batches`** (migration `000071`):
- `apps/api/db/migrations/000071_create_import_batches.up.sql`
- Columns: `id`, `tenant_id`, `batch_reference`, `source` (default 'terminal'), `terminal_id`, `status` (pending/processing/completed/failed), `records_total`, `records_imported`, `records_failed`, `error_message`, `started_at`, `completed_at`, `created_at`, `updated_at`
- Unique index on `(tenant_id, batch_reference)` for idempotency
- FK to `tenants(id)` with CASCADE delete

**`raw_terminal_bookings`** (migration `000072`):
- `apps/api/db/migrations/000072_create_raw_terminal_bookings.up.sql`
- Columns: `id`, `tenant_id`, `import_batch_id`, `terminal_id`, `employee_pin`, `employee_id`, `raw_timestamp`, `raw_booking_code`, `booking_date`, `booking_type_id`, `processed_booking_id`, `status` (pending/processed/failed/skipped), `error_message`, `created_at`, `updated_at`
- FKs: `tenants(id)` CASCADE, `import_batches(id)` CASCADE, `employees(id)` SET NULL, `booking_types(id)` SET NULL, `bookings(id)` SET NULL
- Indexes: tenant, batch, terminal, employee, date, date_range, status (partial on 'pending')

#### 1.2 Domain Models

**`apps/api/internal/model/terminal.go`** (79 lines):
- `ImportBatch` struct: GORM model for `import_batches` table. Has `RawBookings []RawTerminalBooking` relation.
- `ImportBatchStatus` enum: `pending`, `processing`, `completed`, `failed`
- `RawTerminalBooking` struct: GORM model for `raw_terminal_bookings` table. Has relations to `Employee`, `BookingType`, `ImportBatch`.
- `RawBookingStatus` enum: `pending`, `processed`, `failed`, `skipped`

#### 1.3 Repository Layer

**`apps/api/internal/repository/terminal.go`** (257 lines):

Two repository structs:

**`ImportBatchRepository`**:
- `Create(ctx, *model.ImportBatch) error`
- `GetByID(ctx, uuid.UUID) (*model.ImportBatch, error)`
- `GetByReference(ctx, tenantID uuid.UUID, reference string) (*model.ImportBatch, error)` -- for idempotency checks
- `Update(ctx, *model.ImportBatch) error`
- `List(ctx, ImportBatchFilter) ([]model.ImportBatch, int64, error)` -- filters by tenant, status, terminal_id; supports limit/offset; ordered by `created_at DESC`

**`RawTerminalBookingRepository`**:
- `Create(ctx, *model.RawTerminalBooking) error`
- `CreateBatch(ctx, []model.RawTerminalBooking) error` -- bulk insert
- `GetByID(ctx, uuid.UUID) (*model.RawTerminalBooking, error)` -- preloads Employee, BookingType
- `Update(ctx, *model.RawTerminalBooking) error`
- `List(ctx, RawTerminalBookingFilter) ([]model.RawTerminalBooking, int64, error)` -- filters by tenant, from/to dates, terminal_id, employee_id, import_batch_id, status; preloads Employee, BookingType; ordered by `raw_timestamp DESC`
- `CountByBatch(ctx, batchID uuid.UUID) (total, processed, failed int64, error)` -- aggregates status counts for a batch

Filter structs:
- `ImportBatchFilter`: TenantID, Status, TerminalID, Limit, Offset
- `RawTerminalBookingFilter`: TenantID, From, To, TerminalID, EmployeeID, ImportBatchID, Status, Limit, Offset

Error sentinels: `ErrImportBatchNotFound`, `ErrRawTerminalBookingNotFound`

#### 1.4 Service Layer

**`apps/api/internal/service/terminal.go`** (276 lines):

**`TerminalService`** struct with four interface-defined dependencies:
- `importBatchRepoForService` -- import batch CRUD + list
- `rawTerminalBookingRepoForService` -- raw booking CRUD + batch create + list + count
- `employeeRepoForTerminal` -- `GetByPIN(ctx, tenantID, pin)`
- `bookingTypeRepoForTerminal` -- `GetByCode(ctx, *tenantID, code)`

Methods:
- `ListRawBookings(ctx, ListRawBookingsFilter) ([]model.RawTerminalBooking, int64, error)` -- translates service filter to repo filter
- `ListImportBatches(ctx, ListImportBatchesFilter) ([]model.ImportBatch, int64, error)` -- translates service filter to repo filter
- `GetImportBatch(ctx, id uuid.UUID) (*model.ImportBatch, error)` -- maps repo NotFound to service NotFound
- `TriggerImport(ctx, TriggerImportInput) (*TriggerImportResult, error)` -- the main import method

**TriggerImport business logic** (the most complex method):
1. Validates batch_reference (non-empty), terminal_id (non-empty), bookings (non-empty)
2. Idempotency: checks `GetByReference` -- if batch already exists, returns it with `WasDuplicate=true`
3. Creates `ImportBatch` with status=processing
4. For each booking input: creates `RawTerminalBooking` with:
   - Booking date extracted from timestamp (date portion)
   - Employee resolution by PIN via `employeeRepo.GetByPIN` (graceful -- logs debug if not found)
   - Booking type resolution by code via `bookingTypeRepo.GetByCode` (graceful)
5. Batch inserts all raw bookings
6. On failure: marks batch status=failed with error message
7. On success: marks batch status=completed with records_imported count
8. Returns `TriggerImportResult` with batch, wasDuplicate flag, and message

Input/output types:
- `RawBookingInput`: EmployeePIN, RawTimestamp, RawBookingCode
- `TriggerImportInput`: TenantID, BatchReference, TerminalID, Bookings
- `TriggerImportResult`: Batch, WasDuplicate, Message
- `ListRawBookingsFilter`: TenantID, From, To, TerminalID, EmployeeID, ImportBatchID, Status, Limit, Offset
- `ListImportBatchesFilter`: TenantID, Status, TerminalID, Limit, Offset

Error sentinels: `ErrBatchReferenceRequired`, `ErrTerminalIDRequired`, `ErrNoBookingsProvided`, `ErrImportBatchNotFound`

#### 1.5 Handler Layer

**`apps/api/internal/handler/terminal.go`** (396 lines):

**`TerminalHandler`** struct with `*service.TerminalService` dependency.

Endpoints:
- `ListRawBookings` (GET /terminal-bookings): parses from, to (YYYY-MM-DD), terminal_id, employee_id, status, import_batch_id, limit (max 250), page; returns `models.RawTerminalBookingList` with pagination meta
- `TriggerImport` (POST /terminal-bookings/import): decodes `models.TriggerTerminalImportRequest`, builds service input, returns `models.TriggerTerminalImportResponse`; handles validation errors as 400
- `ListImportBatches` (GET /import-batches): parses status, terminal_id, limit, page; returns `models.ImportBatchList`
- `GetImportBatch` (GET /import-batches/{id}): parses UUID from path; returns single `models.ImportBatch`

Response mapping helpers:
- `mapRawBookingToResponse(*model.RawTerminalBooking) *models.RawTerminalBooking` -- maps all fields including optional Employee/BookingType summaries
- `mapImportBatchToResponse(*model.ImportBatch) *models.ImportBatch`

#### 1.6 Route Registration

**`apps/api/internal/handler/routes.go:1280-1305`**:
```
RegisterTerminalBookingRoutes(r chi.Router, h *TerminalHandler, authz *middleware.AuthorizationMiddleware)
```
- Permission: `terminal_bookings.manage` for all operations
- Routes:
  - `GET  /terminal-bookings` -> ListRawBookings
  - `POST /terminal-bookings/import` -> TriggerImport
  - `GET  /import-batches` -> ListImportBatches
  - `GET  /import-batches/{id}` -> GetImportBatch

#### 1.7 Initialization in main.go

**`apps/api/cmd/server/main.go:358-362`**:
```go
importBatchRepo := repository.NewImportBatchRepository(db)
rawTerminalBookingRepo := repository.NewRawTerminalBookingRepository(db)
terminalService := service.NewTerminalService(importBatchRepo, rawTerminalBookingRepo, employeeRepo, bookingTypeRepo)
terminalHandler := handler.NewTerminalHandler(terminalService)
```

Dependencies: `employeeRepo` and `bookingTypeRepo` are initialized earlier in main.go and shared with other services.

Route registration at line 578:
```go
handler.RegisterTerminalBookingRoutes(r, terminalHandler, authzMiddleware)
```

#### 1.8 Scheduler Integration

**`apps/api/internal/service/scheduler_tasks.go:232-265`**:
- `TerminalImportTaskHandler` implements the `terminal_import` scheduler task type
- Uses `terminalImportServiceForScheduler` interface (just `ListRawBookings`)
- Currently a placeholder: fetches pending raw bookings and returns counts but does not actually process them
- Registered in main.go at line 427

**`apps/api/internal/service/scheduler_catalog.go:94-108`**:
- `terminal_sync` task type: "Placeholder for syncing data from physical terminals (not yet implemented)"
- `terminal_import` task type: "Processes pending raw terminal bookings and creates booking records"

**`apps/api/internal/model/schedule.go:20-21`**:
- `TaskTypeTerminalSync TaskType = "terminal_sync"`
- `TaskTypeTerminalImport TaskType = "terminal_import"`

#### 1.9 Cross-cutting: Evaluation Module

**`apps/api/internal/service/evaluation.go`**:
- `ListTerminalBookings(ctx, EvalTerminalBookingFilter)` -- queries the `bookings` table (not `raw_terminal_bookings`) filtering by `source='terminal'`
- `mapTerminalBookingToEval(*model.Booking) *models.EvaluationTerminalBooking` -- maps booking with TerminalID field
- This queries processed bookings (not raw ones), so it's a consumer of the data flow that starts with terminal import

---

### 2. Vehicles Domain

#### 2.1 Database Table

**`vehicles`** (migration `000074`):
- `apps/api/db/migrations/000074_create_vehicle_data.up.sql` (lines 1-23)
- Columns: `id`, `tenant_id`, `code` (varchar 50), `name` (varchar 255), `description`, `license_plate` (varchar 20), `is_active` (default true), `sort_order` (default 0), `created_at`, `updated_at`
- Unique constraint on `(tenant_id, code)`
- FK to `tenants(id)` CASCADE

#### 2.2 Domain Model

**`apps/api/internal/model/vehicle.go`** (25 lines):
- `Vehicle` struct with fields: ID, TenantID, Code, Name, Description, LicensePlate, IsActive, SortOrder, CreatedAt, UpdatedAt
- Table name: `vehicles`

#### 2.3 Repository

**`apps/api/internal/repository/vehicle.go`** (79 lines):
- `VehicleRepository` struct with `*DB`
- Methods: `Create`, `GetByID`, `GetByCode(ctx, tenantID, code)`, `List(ctx, tenantID)` (ordered by sort_order, code), `Update`, `Delete` (checks RowsAffected)
- Error: `ErrVehicleNotFound`

#### 2.4 Service

**`apps/api/internal/service/vehicle.go`** (147 lines):
- `VehicleService` with `vehicleRepository` interface
- Interface methods: Create, GetByID, GetByCode, List, Update, Delete
- `Create`: validates code (required, trimmed), name (required, trimmed), checks code uniqueness within tenant via `GetByCode`
- `Update`: code cannot be changed; validates name if provided
- `Delete`: verifies existence before deleting

Input types:
- `CreateVehicleInput`: TenantID, Code, Name, Description, LicensePlate, SortOrder
- `UpdateVehicleInput`: Name, Description, LicensePlate, IsActive, SortOrder (all optional pointers)

Errors: `ErrVehicleNotFound`, `ErrVehicleCodeRequired`, `ErrVehicleNameRequired`, `ErrVehicleCodeExists`

#### 2.5 Handler

**`apps/api/internal/handler/vehicle.go`** (190 lines):
- `VehicleHandler` with `*service.VehicleService`
- CRUD endpoints: List, Get, Create, Update, Delete
- Create: decodes `models.CreateVehicleRequest`, validates, returns 201
- Update: decodes `models.UpdateVehicleRequest`, validates
- Delete: returns 204
- Response mapping: `vehicleToResponse`, `vehicleListToResponse` (uses `models.VehicleList{Data: data}` -- no pagination meta)
- Error handler: `handleVehicleError` maps service errors to HTTP status codes

#### 2.6 Route Registration

**`apps/api/internal/handler/routes.go:1387-1405`**:
- Permission: `vehicle_data.manage` for all operations
- Routes: standard CRUD on `/vehicles` and `/vehicles/{id}`

---

### 3. Vehicle Routes Domain

#### 3.1 Database Table

**`vehicle_routes`** (migration `000074`, lines 25-47):
- Columns: `id`, `tenant_id`, `code` (varchar 50), `name` (varchar 255), `description`, `distance_km` (numeric 10,2), `is_active` (default true), `sort_order` (default 0), `created_at`, `updated_at`
- Unique constraint on `(tenant_id, code)`
- FK to `tenants(id)` CASCADE

#### 3.2 Domain Model

**`apps/api/internal/model/vehicle_route.go`** (26 lines):
- `VehicleRoute` struct: ID, TenantID, Code, Name, Description, DistanceKm (decimal.Decimal), IsActive, SortOrder, CreatedAt, UpdatedAt
- Uses `github.com/shopspring/decimal` for DistanceKm
- Table name: `vehicle_routes`

#### 3.3 Repository

**`apps/api/internal/repository/vehicle_route.go`** (79 lines):
- Identical pattern to VehicleRepository
- Methods: Create, GetByID, GetByCode, List (sort_order, code), Update, Delete
- Error: `ErrVehicleRouteNotFound`

#### 3.4 Service

**`apps/api/internal/service/vehicle_route.go`** (150 lines):
- Identical pattern to VehicleService
- Additional field: DistanceKm (float64 -> decimal.Decimal conversion)
- Errors: `ErrVehicleRouteNotFound`, `ErrVehicleRouteCodeRequired`, `ErrVehicleRouteNameRequired`, `ErrVehicleRouteCodeExists`

#### 3.5 Handler

**`apps/api/internal/handler/vehicle_route.go`** (195 lines):
- Identical CRUD pattern to VehicleHandler
- Response mapping includes `DistanceKm` (decimal -> float64 conversion)
- Uses `models.VehicleRouteList{Data: data}` -- no pagination meta

#### 3.6 Route Registration

**`apps/api/internal/handler/routes.go:1407-1425`**:
- Permission: `vehicle_data.manage`
- Routes: standard CRUD on `/vehicle-routes` and `/vehicle-routes/{id}`

---

### 4. Trip Records Domain

#### 4.1 Database Table

**`trip_records`** (migration `000074`, lines 49-74):
- Columns: `id`, `tenant_id`, `vehicle_id` (NOT NULL, FK to vehicles), `route_id` (nullable, FK to vehicle_routes), `trip_date` (date, NOT NULL), `start_mileage` (numeric 10,1), `end_mileage` (numeric 10,1), `distance_km` (numeric 10,2), `notes`, `created_at`, `updated_at`
- FK: `vehicles(id)` CASCADE, `vehicle_routes(id)` SET NULL
- Indexes: tenant, vehicle, route, date

#### 4.2 Domain Model

**`apps/api/internal/model/trip_record.go`** (31 lines):
- `TripRecord` struct: ID, TenantID, VehicleID, RouteID (*uuid.UUID), TripDate, StartMileage, EndMileage, DistanceKm (all decimal.Decimal), Notes, CreatedAt, UpdatedAt
- Associations: Vehicle (*Vehicle), VehicleRoute (*VehicleRoute) for preloading
- Table name: `trip_records`

#### 4.3 Repository

**`apps/api/internal/repository/trip_record.go`** (77 lines):
- Methods: Create, GetByID, `List(ctx, tenantID)` (ordered by trip_date DESC, created_at DESC), `ListByVehicle(ctx, tenantID, vehicleID)`, Update, Delete
- Note: `ListByVehicle` exists in repository but is not exposed through the service layer
- Error: `ErrTripRecordNotFound`

#### 4.4 Service

**`apps/api/internal/service/trip_record.go`** (150 lines):
- `TripRecordService` with `tripRecordRepository` interface
- Interface includes `ListByVehicle` but service only exposes `List(ctx, tenantID)`
- `Create`: validates VehicleID (not nil), TripDate (not zero); converts float64 fields to decimal
- `Update`: updates RouteID, TripDate (validates not zero), mileage fields, notes
- Errors: `ErrTripRecordNotFound`, `ErrTripRecordVehicleRequired`, `ErrTripRecordDateRequired`

#### 4.5 Handler

**`apps/api/internal/handler/trip_record.go`** (234 lines):
- CRUD pattern with date parsing for trip_date (YYYY-MM-DD format)
- Create: decodes `models.CreateTripRecordRequest`, parses VehicleID and TripDate from strfmt types, parses optional RouteID
- Response mapping includes decimal -> float64 conversions for mileage fields
- Uses `models.TripRecordList{Data: data}` -- no pagination meta

#### 4.6 Route Registration

**`apps/api/internal/handler/routes.go:1427-1445`**:
- Permission: `vehicle_data.manage`
- Routes: standard CRUD on `/trip-records` and `/trip-records/{id}`

---

### 5. Permissions

**`apps/api/internal/permissions/permissions.go:75-77`**:
- `terminal_bookings.manage` -- "Manage terminal bookings and import batches"
- `vehicle_data.manage` -- "Manage vehicles, routes, and trip records"

**`apps/web/src/server/lib/permission-catalog.ts:177-192`** (frontend mirror):
- Same two permissions registered in the frontend permission catalog

The ticket description references `terminal_bookings.read`, `terminal_bookings.write`, `vehicles.*`, and `trip_records.*` as tRPC middleware permissions, which differ from the current implementation that uses `terminal_bookings.manage` and `vehicle_data.manage` for everything. This would be a permission restructuring.

---

### 6. OpenAPI Specification

**Terminal bookings**: `api/paths/terminal-bookings.yaml` (161 lines), `api/schemas/terminal-bookings.yaml` (196 lines)
- Operations: `listRawTerminalBookings`, `triggerTerminalImport`, `listImportBatches`, `getImportBatch`
- Schemas: `RawTerminalBooking`, `RawTerminalBookingList`, `ImportBatch`, `ImportBatchList`, `TriggerTerminalImportRequest`, `RawTerminalBookingInput`, `TriggerTerminalImportResponse`

**Vehicles/Routes/Trips**: `api/paths/vehicles.yaml` (359 lines), `api/schemas/vehicles.yaml` (287 lines)
- Operations: `listVehicles`, `createVehicle`, `getVehicle`, `updateVehicle`, `deleteVehicle`, `listVehicleRoutes`, `createVehicleRoute`, `getVehicleRoute`, `updateVehicleRoute`, `deleteVehicleRoute`, `listTripRecords`, `createTripRecord`, `getTripRecord`, `updateTripRecord`, `deleteTripRecord`
- Schemas: `Vehicle`, `CreateVehicleRequest`, `UpdateVehicleRequest`, `VehicleList`, `VehicleRoute`, `CreateVehicleRouteRequest`, `UpdateVehicleRouteRequest`, `VehicleRouteList`, `TripRecord`, `CreateTripRecordRequest`, `UpdateTripRecordRequest`, `TripRecordList`

---

### 7. Generated Models (go-swagger)

All located in `apps/api/gen/models/`:

**Terminal bookings** (27 generated files total for this domain):
- `raw_terminal_booking.go` -- full struct with validation
- `raw_terminal_booking_list.go`
- `raw_terminal_booking_input.go`
- `import_batch.go`
- `import_batch_list.go`
- `trigger_terminal_import_request.go`
- `trigger_terminal_import_response.go`

**Vehicle domain**:
- `vehicle.go`, `vehicle_list.go`
- `create_vehicle_request.go`, `update_vehicle_request.go`
- `vehicle_route.go`, `vehicle_route_list.go`
- `create_vehicle_route_request.go`, `update_vehicle_route_request.go`
- `trip_record.go`, `trip_record_list.go`
- `create_trip_record_request.go`, `update_trip_record_request.go`

**Evaluation-related** (terminal booking evaluations):
- `evaluation_terminal_booking.go`, `evaluation_terminal_booking_list.go`

---

### 8. Frontend

#### 8.1 Existing Frontend Hook

**`apps/web/src/hooks/api/use-terminal-bookings.ts`** (56 lines):
- `useTerminalBookings(options)` -- GET /terminal-bookings with from/to/terminal_id/employee_id/status/import_batch_id/limit/page; enabled when from+to are set
- `useTriggerTerminalImport()` -- POST /terminal-bookings/import; invalidates terminal-bookings and import-batches queries
- `useImportBatches(options)` -- GET /import-batches with status/terminal_id/limit/page
- `useImportBatch(id)` -- GET /import-batches/{id}

All hooks use `useApiQuery`/`useApiMutation` from `@/hooks` (REST-based, not tRPC).

#### 8.2 Frontend Components

**Terminal bookings page**: `apps/web/src/app/[locale]/(dashboard)/admin/terminal-bookings/page.tsx`

**Components**:
- `apps/web/src/components/terminal-bookings/bookings-tab.tsx` -- uses `useTerminalBookings`, `useEmployees`; displays table with status badges, employee details, booking type summaries
- `apps/web/src/components/terminal-bookings/import-batches-tab.tsx` -- uses `useImportBatches`, `useTriggerTerminalImport`; import dialog with JSON textarea input
- `apps/web/src/components/terminal-bookings/index.ts` -- barrel export

**Sidebar navigation**: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` references terminal bookings

**Evaluation page**: `apps/web/src/app/[locale]/(dashboard)/admin/evaluations/page.tsx` -- references terminal bookings evaluations

#### 8.3 Frontend Types

**`apps/web/src/lib/api/types.ts`**: Contains auto-generated TypeScript types from OpenAPI spec. Includes all operations and schemas for terminal-bookings, import-batches, vehicles, vehicle-routes, and trip-records.

#### 8.4 Vehicles/Routes/TripRecords Frontend

No frontend hooks, no components, no pages exist for vehicles, vehicle routes, or trip records. The ticket notes these "werden neu erstellt" (will be newly created). The only frontend reference is in `apps/web/src/lib/api/types.ts` (auto-generated from OpenAPI) and `apps/web/src/server/lib/permission-catalog.ts` (permission definition).

---

### 9. Tests

**`apps/api/internal/service/terminal_test.go`** (407 lines):
- Integration tests using `testutil.SetupTestDB` with real DB + transaction rollback
- 9 test functions:
  - `TestTerminalService_TriggerImport_Success` -- creates employee, imports 2 bookings (one with known PIN, one unknown)
  - `TestTerminalService_TriggerImport_Idempotent` -- verifies duplicate batch reference returns same batch with WasDuplicate=true
  - `TestTerminalService_TriggerImport_EmptyBatchReference` -- validates ErrBatchReferenceRequired
  - `TestTerminalService_TriggerImport_EmptyTerminalID` -- validates ErrTerminalIDRequired
  - `TestTerminalService_TriggerImport_NoBookings` -- validates ErrNoBookingsProvided
  - `TestTerminalService_TriggerImport_ResolvesEmployee` -- verifies employee_id is set on raw booking when PIN matches
  - `TestTerminalService_TriggerImport_ResolvesBookingType` -- verifies booking_type_id is set when code matches
  - `TestTerminalService_ListRawBookings` -- imports 3 bookings, lists with date filter, verifies count
  - `TestTerminalService_ListRawBookings_FilterByTerminal` -- imports from two terminals, filters by one
  - `TestTerminalService_ListImportBatches` -- creates two batches, lists all
  - `TestTerminalService_GetImportBatch_Success` -- creates and retrieves by ID
  - `TestTerminalService_GetImportBatch_NotFound` -- verifies error for non-existent ID

Helper functions:
- `createTestTenantForTerminalService` -- creates test tenant
- `createTestEmployeeForTerminal` -- creates employee with PIN
- `createTestBookingTypeForTerminal` -- creates booking type with code
- `newTerminalService` -- wires up service with real repositories

No tests exist for Vehicle, VehicleRoute, or TripRecord services.

---

### 10. Dependency Map

#### 10.1 Terminal Import Dependencies

The TerminalService depends on:
- `ImportBatchRepository` (direct)
- `RawTerminalBookingRepository` (direct)
- `EmployeeRepository` -- shared with many other services (via `GetByPIN`)
- `BookingTypeRepository` -- shared with other services (via `GetByCode`)

Downstream consumers:
- `TerminalImportTaskHandler` (scheduler) -- uses `ListRawBookings`
- `EvaluationService.ListTerminalBookings` -- queries processed bookings table, not raw terminal bookings

#### 10.2 Vehicle Data Dependencies

- `TripRecord.VehicleID` -> `vehicles(id)` CASCADE -- trip records depend on vehicles
- `TripRecord.RouteID` -> `vehicle_routes(id)` SET NULL -- trip records optionally reference routes
- No other service or handler references vehicles, vehicle routes, or trip records

---

## Code References

- `apps/api/internal/model/terminal.go` -- ImportBatch and RawTerminalBooking GORM models
- `apps/api/internal/model/vehicle.go` -- Vehicle GORM model
- `apps/api/internal/model/vehicle_route.go` -- VehicleRoute GORM model (uses shopspring/decimal)
- `apps/api/internal/model/trip_record.go` -- TripRecord GORM model (uses shopspring/decimal, FK associations)
- `apps/api/internal/repository/terminal.go` -- ImportBatchRepository + RawTerminalBookingRepository
- `apps/api/internal/repository/vehicle.go` -- VehicleRepository
- `apps/api/internal/repository/vehicle_route.go` -- VehicleRouteRepository
- `apps/api/internal/repository/trip_record.go` -- TripRecordRepository (includes unused ListByVehicle)
- `apps/api/internal/service/terminal.go` -- TerminalService with import logic
- `apps/api/internal/service/vehicle.go` -- VehicleService CRUD
- `apps/api/internal/service/vehicle_route.go` -- VehicleRouteService CRUD
- `apps/api/internal/service/trip_record.go` -- TripRecordService CRUD
- `apps/api/internal/handler/terminal.go` -- TerminalHandler (4 endpoints)
- `apps/api/internal/handler/vehicle.go` -- VehicleHandler (5 endpoints)
- `apps/api/internal/handler/vehicle_route.go` -- VehicleRouteHandler (5 endpoints)
- `apps/api/internal/handler/trip_record.go` -- TripRecordHandler (5 endpoints)
- `apps/api/internal/handler/routes.go:1280-1445` -- Route registration for all 4 domains
- `apps/api/cmd/server/main.go:358-388` -- Service initialization and wiring
- `apps/api/cmd/server/main.go:578-584` -- Route registration calls
- `apps/api/cmd/server/main.go:426-427` -- Scheduler task handler registration
- `apps/api/internal/service/scheduler_tasks.go:232-265` -- TerminalImportTaskHandler
- `apps/api/internal/service/scheduler_catalog.go:94-108` -- Terminal task catalog entries
- `apps/api/internal/permissions/permissions.go:75-77` -- Permission definitions
- `apps/api/internal/service/terminal_test.go` -- 9 integration tests (407 lines)
- `api/paths/terminal-bookings.yaml` -- OpenAPI paths
- `api/paths/vehicles.yaml` -- OpenAPI paths for vehicles, routes, trip records
- `api/schemas/terminal-bookings.yaml` -- OpenAPI schemas
- `api/schemas/vehicles.yaml` -- OpenAPI schemas
- `apps/web/src/hooks/api/use-terminal-bookings.ts` -- Frontend hooks (REST-based)
- `apps/web/src/components/terminal-bookings/bookings-tab.tsx` -- Frontend component
- `apps/web/src/components/terminal-bookings/import-batches-tab.tsx` -- Frontend component
- `apps/web/src/app/[locale]/(dashboard)/admin/terminal-bookings/page.tsx` -- Terminal bookings page
- `db/migrations/000071_create_import_batches.up.sql` -- Import batches migration
- `db/migrations/000072_create_raw_terminal_bookings.up.sql` -- Raw terminal bookings migration
- `db/migrations/000074_create_vehicle_data.up.sql` -- Vehicles, vehicle routes, trip records migration

## Architecture Documentation

### Patterns Observed

1. **Handler/Service/Repository layering**: All four domains follow the standard clean architecture pattern. Handlers parse HTTP requests, services contain business logic, repositories handle GORM queries.

2. **Interface-driven dependencies**: Services define local interfaces for their repository dependencies (e.g., `vehicleRepository interface` in vehicle.go). The terminal service uses four separate interface types.

3. **Error sentinel pattern**: Each layer defines its own error sentinels. Repository errors are mapped to service errors in the service layer. Handler error-switch functions map service errors to HTTP status codes.

4. **Generated model usage**: Handlers use `gen/models` types for request/response payloads. Domain `model` types are used internally. Manual mapping functions convert between the two.

5. **Pagination**: Terminal bookings use `PaginationMeta` (Total, Limit, HasMore). Vehicles, vehicle routes, and trip records use simple list without pagination meta -- just `{Data: [...]}`.

6. **Permission model**: Terminal bookings use `terminal_bookings.manage`. Vehicles, routes, and trip records all share `vehicle_data.manage`.

7. **Code uniqueness**: Both Vehicle and VehicleRoute enforce unique codes per tenant. Terminal bookings enforce unique batch_reference per tenant for idempotency.

8. **Decimal handling**: VehicleRoute.DistanceKm and TripRecord mileage fields use `shopspring/decimal` in models, converted to/from float64 at the handler layer.

## Historical Context (from thoughts/)

- `thoughts/shared/tickets/ZMI-TICKET-225-terminal-bookings-vehicles-trip-records.md` -- Ticket definition specifying the four tRPC routers and their procedures

## Related Research

- `thoughts/shared/research/2026-03-07-ZMI-TICKET-224-export-interfaces-payroll-reports.md` -- Previous ticket research following the same tRPC migration pattern

## Open Questions

1. The ticket references permissions `terminal_bookings.read` and `terminal_bookings.write` as separate permissions for tRPC, but the current Go implementation uses a single `terminal_bookings.manage`. Will the permission model be restructured, or will the existing `manage` permission be reused?
2. The ticket lists `trip_records.*` as a separate permission, but the current implementation uses `vehicle_data.manage` for trip records. Same question applies.
3. The `ListByVehicle` method exists in `TripRecordRepository` but is not exposed through the service. The ticket's `tripRecords.list` requires `vehicle_id` as a filter parameter. Will the service need to expose this filtering capability?
4. The terminal bookings evaluation (`EvaluationService.ListTerminalBookings`) queries the `bookings` table, not `raw_terminal_bookings`. This is a downstream consumer that won't be affected by the tRPC migration of the terminal import flow, but it is worth noting.
5. The `TerminalImportTaskHandler` in the scheduler depends on `TerminalService.ListRawBookings`. If the Go service is being replaced by tRPC, how will the scheduler integration work?
