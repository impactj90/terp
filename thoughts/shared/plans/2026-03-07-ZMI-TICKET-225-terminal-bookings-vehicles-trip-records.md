# ZMI-TICKET-225 Implementation Plan: Terminal Bookings, Vehicles, Trip Records tRPC Routers

## Overview

Port Go business logic for Terminal Bookings (import + list + batches), Vehicles (CRUD), Vehicle Routes (CRUD), and Trip Records (CRUD) to tRPC routers. Add Prisma models for 5 new tables (`import_batches`, `raw_terminal_bookings`, `vehicles`, `vehicle_routes`, `trip_records`), create 4 tRPC router files, register them in `root.ts`, migrate the existing `use-terminal-bookings.ts` frontend hook from REST to tRPC, create new frontend hooks for vehicles/vehicle routes/trip records, and write unit tests.

**Go files being replaced:**
- `apps/api/internal/service/terminal.go` (276 lines)
- `apps/api/internal/handler/terminal.go` (396 lines)
- `apps/api/internal/repository/terminal.go` (257 lines)
- `apps/api/internal/service/vehicle.go` (147 lines)
- `apps/api/internal/handler/vehicle.go` (190 lines)
- `apps/api/internal/repository/vehicle.go` (79 lines)
- `apps/api/internal/service/vehicle_route.go` (150 lines)
- `apps/api/internal/handler/vehicle_route.go` (195 lines)
- `apps/api/internal/repository/vehicle_route.go` (79 lines)
- `apps/api/internal/service/trip_record.go` (150 lines)
- `apps/api/internal/handler/trip_record.go` (234 lines)
- `apps/api/internal/repository/trip_record.go` (77 lines)
- `apps/web/src/hooks/api/use-terminal-bookings.ts` (56 lines -- REST-based, to be rewritten with tRPC)

---

## Current State Analysis

### What exists:
- Full Go backend (handler/service/repository) for all 4 entity groups
- Database tables: `import_batches` (migration 000071), `raw_terminal_bookings` (000072), `vehicles` + `vehicle_routes` + `trip_records` (000074)
- Frontend hooks using REST-based `useApiQuery`/`useApiMutation`: `use-terminal-bookings.ts` (hooks for raw bookings list, import trigger, import batches list, import batch getById)
- Frontend pages and components for terminal bookings: `apps/web/src/app/[locale]/(dashboard)/admin/terminal-bookings/page.tsx`, `apps/web/src/components/terminal-bookings/bookings-tab.tsx`, `apps/web/src/components/terminal-bookings/import-batches-tab.tsx`
- No frontend hooks, pages, or components for vehicles, vehicle routes, or trip records
- Permissions in catalog: `terminal_bookings.manage`, `vehicle_data.manage`
- OpenAPI specs and generated Go models for all 4 domains
- Integration tests for terminal service in `apps/api/internal/service/terminal_test.go` (407 lines, 9+ test functions)
- Scheduler integration: `TerminalImportTaskHandler` in `apps/api/internal/service/scheduler_tasks.go:232-265`

### What's missing:
- Prisma models: `ImportBatch`, `RawTerminalBooking`, `Vehicle`, `VehicleRoute`, `TripRecord`
- Supabase migration for the 5 tables (they exist in Go migrations but not Supabase)
- tRPC routers: `terminalBookings`, `vehicles`, `vehicleRoutes`, `tripRecords`
- Frontend hooks for vehicles, vehicle routes, trip records (none exist)

### Key Discoveries:
- The `bookings` table has no Prisma model. The `raw_terminal_bookings.processed_booking_id` FK references `bookings(id)`. This field will be modeled as a plain `String?` UUID field without a Prisma relation, since the Booking model is not yet in Prisma.
- Employee model has `pin` field (line 521 of schema.prisma) with unique constraint `@@unique([tenantId, pin])` -- needed for the terminal import employee resolution.
- BookingType model has `code` field (line 907) -- needed for booking type resolution by code during import.
- The ticket references separate permissions (`terminal_bookings.read`, `terminal_bookings.write`, `vehicles.*`, `trip_records.*`) but the current Go implementation uses `terminal_bookings.manage` and `vehicle_data.manage`. We will use the **existing** permissions (`terminal_bookings.manage`, `vehicle_data.manage`) to maintain consistency with the permission catalog (`apps/web/src/server/lib/permission-catalog.ts:177-192`).
- `TripRecord.RouteID` is nullable (FK to `vehicle_routes(id)` with `ON DELETE SET NULL`).
- `TripRecord` mileage fields use `NUMERIC(10,1)` and `NUMERIC(10,2)` in the DB. Prisma models them as `Decimal`. tRPC schemas will use `z.number()` and convert at the Prisma layer.
- The `TerminalImportTaskHandler` (scheduler) depends on `TerminalService.ListRawBookings`. Since the scheduler still runs in Go, the Go REST endpoints remain functional. The tRPC routers operate independently.
- `VehicleRepository.ListByVehicle` exists but is not exposed through `TripRecordService`. The ticket's `tripRecords.list` requires `vehicle_id` as a filter parameter. We will expose this in the tRPC router by passing the filter directly to Prisma's `where` clause.

---

## Desired End State

After this plan is complete:
1. Five new Prisma models exist and are usable: `ImportBatch`, `RawTerminalBooking`, `Vehicle`, `VehicleRoute`, `TripRecord`
2. Four tRPC routers handle all CRUD + import logic that was in Go
3. Existing frontend hooks (`use-terminal-bookings.ts`) use tRPC instead of REST
4. New frontend hooks exist for vehicles, vehicle routes, and trip records
5. All unit tests pass for the four routers

**Verification:** `cd apps/web && npx vitest run src/server/__tests__/terminalBookings-router.test.ts src/server/__tests__/vehicles-router.test.ts src/server/__tests__/vehicleRoutes-router.test.ts src/server/__tests__/tripRecords-router.test.ts` passes. TypeScript compilation succeeds via `cd apps/web && npx tsc --noEmit`.

---

## What We're NOT Doing

- **Terminal hardware integration** -- explicitly out of scope per ticket
- **Booking creation from terminal data** -- deferred to TICKET-232
- **Processing pending raw bookings** -- the `TerminalImportTaskHandler` (scheduler) remains in Go; we only port the import trigger and listing to tRPC
- **Permission restructuring** -- the ticket mentions `terminal_bookings.read`/`terminal_bookings.write` and `vehicles.*`/`trip_records.*` but the Go backend and permission catalog use `terminal_bookings.manage` and `vehicle_data.manage`. We use the existing permissions.
- **Frontend pages/components for vehicles, vehicle routes, or trip records** -- only hooks are created; pages will be built separately
- **Evaluation module migration** -- `EvaluationService.ListTerminalBookings` queries the `bookings` table (not `raw_terminal_bookings`) and is unaffected by this migration

---

## Implementation Approach

Follow the same pattern as ZMI-TICKET-224 (export interfaces/payroll/reports):
1. Supabase migration to create tables
2. Prisma schema additions (5 new models + reverse relations on Tenant, Employee, BookingType)
3. Prisma client regeneration
4. tRPC routers with business logic inline (Prisma replaces repository layer)
5. Root router registration
6. Frontend hook migration/creation
7. Unit tests

Split into 5 phases to keep each phase testable.

---

## Phase 0: Prisma Schema + Supabase Migration

### Overview
Add the database tables to Supabase and define Prisma models for `ImportBatch`, `RawTerminalBooking`, `Vehicle`, `VehicleRoute`, and `TripRecord`.

### Changes Required:

#### 1. Supabase Migration
**File**: `supabase/migrations/<timestamp>_add_terminal_bookings_vehicles_trip_records.sql`
**Action**: Create with `make db-migrate-new name=add_terminal_bookings_vehicles_trip_records`, then populate.

Content should include DDL from:
- `db/migrations/000071_create_import_batches.up.sql` (import_batches table)
- `db/migrations/000072_create_raw_terminal_bookings.up.sql` (raw_terminal_bookings table)
- `db/migrations/000074_create_vehicle_data.up.sql` (vehicles, vehicle_routes, trip_records tables)

All `CREATE TABLE` wrapped in `CREATE TABLE IF NOT EXISTS`. All indexes use `CREATE INDEX IF NOT EXISTS`. Triggers use `CREATE OR REPLACE TRIGGER` (or `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`).

**Important**: The `raw_terminal_bookings` table references `bookings(id)`. If the `bookings` table does not exist in Supabase yet, the FK must be omitted or the bookings table must be created first. Since the `bookings` table is not yet in the Supabase migrations, we will create `processed_booking_id` as a plain `UUID` column WITHOUT a foreign key constraint in the Supabase migration. The FK exists in the Go migration but is not enforced via Prisma since there is no Booking model.

#### 2. Prisma Schema Additions
**File**: `apps/web/prisma/schema.prisma`
**Action**: Append 5 new models after the MonthlyValue model (line 2348). Add reverse relation fields to Tenant, Employee, BookingType models.

**Model: ImportBatch** (maps to `import_batches`)
```prisma
model ImportBatch {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String    @map("tenant_id") @db.Uuid
  batchReference  String    @map("batch_reference") @db.VarChar(255)
  source          String    @default("terminal") @db.VarChar(50)
  terminalId      String?   @map("terminal_id") @db.VarChar(100)
  status          String    @default("pending") @db.VarChar(20)
  recordsTotal    Int       @default(0) @map("records_total")
  recordsImported Int       @default(0) @map("records_imported")
  recordsFailed   Int       @default(0) @map("records_failed")
  errorMessage    String?   @map("error_message") @db.Text
  startedAt       DateTime? @map("started_at") @db.Timestamptz(6)
  completedAt     DateTime? @map("completed_at") @db.Timestamptz(6)
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant      Tenant                @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  rawBookings RawTerminalBooking[]

  // Indexes
  @@unique([tenantId, batchReference], map: "idx_import_batches_unique_ref")
  @@index([tenantId], map: "idx_import_batches_tenant")
  @@index([status], map: "idx_import_batches_status")
  @@map("import_batches")
}
```

**Model: RawTerminalBooking** (maps to `raw_terminal_bookings`)
```prisma
model RawTerminalBooking {
  id                 String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId           String    @map("tenant_id") @db.Uuid
  importBatchId      String    @map("import_batch_id") @db.Uuid
  terminalId         String    @map("terminal_id") @db.VarChar(100)
  employeePin        String    @map("employee_pin") @db.VarChar(20)
  employeeId         String?   @map("employee_id") @db.Uuid
  rawTimestamp       DateTime  @map("raw_timestamp") @db.Timestamptz(6)
  rawBookingCode     String    @map("raw_booking_code") @db.VarChar(20)
  bookingDate        DateTime  @map("booking_date") @db.Date
  bookingTypeId      String?   @map("booking_type_id") @db.Uuid
  processedBookingId String?   @map("processed_booking_id") @db.Uuid
  status             String    @default("pending") @db.VarChar(20)
  errorMessage       String?   @map("error_message") @db.Text
  createdAt          DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant      Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  importBatch ImportBatch  @relation(fields: [importBatchId], references: [id], onDelete: Cascade)
  employee    Employee?    @relation(fields: [employeeId], references: [id], onDelete: SetNull)
  bookingType BookingType? @relation(fields: [bookingTypeId], references: [id], onDelete: SetNull)
  // Note: processedBookingId is NOT a Prisma relation because Booking model doesn't exist yet

  // Indexes
  @@index([tenantId], map: "idx_raw_terminal_bookings_tenant")
  @@index([importBatchId], map: "idx_raw_terminal_bookings_batch")
  @@index([employeeId], map: "idx_raw_terminal_bookings_employee")
  @@index([tenantId, bookingDate], map: "idx_raw_terminal_bookings_date")
  @@map("raw_terminal_bookings")
}
```

**Model: Vehicle** (maps to `vehicles`)
```prisma
model Vehicle {
  id           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String    @map("tenant_id") @db.Uuid
  code         String    @db.VarChar(50)
  name         String    @db.VarChar(255)
  description  String?   @db.Text
  licensePlate String?   @map("license_plate") @db.VarChar(20)
  isActive     Boolean   @default(true) @map("is_active")
  sortOrder    Int       @default(0) @map("sort_order")
  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt    DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant      Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  tripRecords TripRecord[]

  // Indexes
  @@unique([tenantId, code])
  @@index([tenantId], map: "idx_vehicles_tenant")
  @@map("vehicles")
}
```

**Model: VehicleRoute** (maps to `vehicle_routes`)
```prisma
model VehicleRoute {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String    @map("tenant_id") @db.Uuid
  code        String    @db.VarChar(50)
  name        String    @db.VarChar(255)
  description String?   @db.Text
  distanceKm  Decimal?  @map("distance_km") @db.Decimal(10, 2)
  isActive    Boolean   @default(true) @map("is_active")
  sortOrder   Int       @default(0) @map("sort_order")
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant      Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  tripRecords TripRecord[]

  // Indexes
  @@unique([tenantId, code])
  @@index([tenantId], map: "idx_vehicle_routes_tenant")
  @@map("vehicle_routes")
}
```

**Model: TripRecord** (maps to `trip_records`)
```prisma
model TripRecord {
  id           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String    @map("tenant_id") @db.Uuid
  vehicleId    String    @map("vehicle_id") @db.Uuid
  routeId      String?   @map("route_id") @db.Uuid
  tripDate     DateTime  @map("trip_date") @db.Date
  startMileage Decimal?  @map("start_mileage") @db.Decimal(10, 1)
  endMileage   Decimal?  @map("end_mileage") @db.Decimal(10, 1)
  distanceKm   Decimal?  @map("distance_km") @db.Decimal(10, 2)
  notes        String?   @db.Text
  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt    DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant       Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  vehicle      Vehicle       @relation(fields: [vehicleId], references: [id], onDelete: Cascade)
  vehicleRoute VehicleRoute? @relation(fields: [routeId], references: [id], onDelete: SetNull)

  // Indexes
  @@index([tenantId], map: "idx_trip_records_tenant")
  @@index([vehicleId], map: "idx_trip_records_vehicle")
  @@index([routeId], map: "idx_trip_records_route")
  @@index([tripDate], map: "idx_trip_records_date")
  @@map("trip_records")
}
```

**Reverse relations to add on existing models:**
- `Tenant` model (around line 148, after `monthlyValues`): Add `importBatches ImportBatch[]`, `rawTerminalBookings RawTerminalBooking[]`, `vehicles Vehicle[]`, `vehicleRoutes VehicleRoute[]`, `tripRecords TripRecord[]`
- `Employee` model (around line 603, after `monthlyValues`): Add `rawTerminalBookings RawTerminalBooking[]`
- `BookingType` model (around line 923, after `groupMembers`): Add `rawTerminalBookings RawTerminalBooking[]`

#### 3. Regenerate Prisma Client
Run `cd apps/web && npx prisma generate` to regenerate the client.

### Success Criteria:

#### Automated Verification:
- [ ] Supabase migration applies: `cd /home/tolga/projects/terp && npx supabase db reset`
- [x] Prisma client generates without errors: `cd apps/web && npx prisma generate`
- [x] TypeScript compilation passes: `cd apps/web && npx tsc --noEmit` (pre-existing errors only, no new errors)

#### Manual Verification:
- [ ] Tables visible in Supabase Studio
- [ ] Prisma Studio shows the 5 new models

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 1.

---

## Phase 1: Terminal Bookings tRPC Router

### Overview
Create the `terminalBookings` tRPC router with list raw bookings, trigger import, list import batches, and get import batch procedures. Port the import business logic from `apps/api/internal/service/terminal.go`.

### Changes Required:

#### 1. Terminal Bookings Router
**File**: `apps/web/src/server/routers/terminalBookings.ts` (new file)
**Changes**: Create tRPC router with 4 procedures

**Permission constants:**
```typescript
const TERMINAL_BOOKINGS_MANAGE = permissionIdByKey("terminal_bookings.manage")!
```

All procedures use `tenantProcedure` + `requirePermission(TERMINAL_BOOKINGS_MANAGE)`.

**Procedures:**

1. **`list`** (query) -- List raw terminal bookings
   - Input: `{ from?: string (YYYY-MM-DD), to?: string (YYYY-MM-DD), terminalId?: string, employeeId?: string (uuid), importBatchId?: string (uuid), status?: enum ("pending"|"processed"|"failed"|"skipped"), limit?: number (1-250, default 50), page?: number (min 1, default 1) }`
   - Output: `{ data: RawTerminalBooking[], meta: { total: number, limit: number, hasMore: boolean } }`
   - Logic:
     - Build `where` clause: `{ tenantId, terminalId?, employeeId?, importBatchId?, status? }`
     - If `from` and `to` provided, add `bookingDate: { gte: parseDate(from), lte: parseDate(to) }`
     - Use `findMany` with `take: limit`, `skip: (page - 1) * limit`, order by `rawTimestamp DESC`
     - Use `count` for total
     - Include: `employee` (select: id, firstName, lastName, personnelNumber), `bookingType` (select: id, code, name)
   - Output schema includes employee/bookingType summary objects

2. **`import`** (mutation) -- Trigger terminal booking import (idempotent)
   - Input: `{ batchReference: string (min 1), terminalId: string (min 1), bookings: [{ employeePin: string, rawTimestamp: string (ISO datetime), rawBookingCode: string }] (min 1 item) }`
   - Output: `{ batch: ImportBatch, wasDuplicate: boolean, message: string }`
   - Logic (port from Go `TriggerImport`):
     1. Validate `batchReference` non-empty (trimmed)
     2. Validate `terminalId` non-empty (trimmed)
     3. Validate `bookings` has at least 1 entry
     4. **Idempotency check**: `findFirst({ tenantId, batchReference })` on `importBatch`
        - If found, return `{ batch: existing, wasDuplicate: true, message: "Batch '...' already imported (N records)" }`
     5. Create `ImportBatch` with status="processing", source="terminal", recordsTotal=bookings.length, startedAt=now
     6. For each booking input, create a `RawTerminalBooking` record:
        - Parse `rawTimestamp` as Date, extract `bookingDate` (date portion only)
        - Resolve employee by PIN: `employee.findFirst({ tenantId, pin: employeePin })` -- graceful (set employeeId if found, skip if not)
        - Resolve booking type by code: `bookingType.findFirst({ where: { OR: [{ tenantId, code: rawBookingCode }, { tenantId: null, code: rawBookingCode }] } })` -- graceful (set bookingTypeId if found, skip if not)
        - Status = "pending"
     7. Use `rawTerminalBooking.createMany({ data: [...] })` for batch insert
     8. On success: update batch status="completed", recordsImported=count, completedAt=now
     9. On failure: update batch status="failed", errorMessage=error.message, completedAt=now; re-throw
     10. Return `{ batch, wasDuplicate: false, message: "Successfully imported N records from terminal 'X'" }`

3. **`batches`** (query) -- List import batches
   - Input: `{ status?: enum ("pending"|"processing"|"completed"|"failed"), terminalId?: string, limit?: number (1-100, default 20), page?: number (min 1, default 1) }`
   - Output: `{ data: ImportBatch[], meta: { total: number, limit: number, hasMore: boolean } }`
   - Logic:
     - Build `where`: `{ tenantId, status?, terminalId? }`
     - `findMany` with `take: limit`, `skip: (page - 1) * limit`, order by `createdAt DESC`
     - `count` for total

4. **`batch`** (query) -- Get single import batch by ID
   - Input: `{ id: string (uuid) }`
   - Output: `ImportBatch`
   - Logic: `findFirst({ id, tenantId })`, throw NOT_FOUND if missing

**Output Schemas:**

```typescript
const importBatchOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  batchReference: z.string(),
  source: z.string(),
  terminalId: z.string().nullable(),
  status: z.string(),
  recordsTotal: z.number(),
  recordsImported: z.number(),
  recordsFailed: z.number(),
  errorMessage: z.string().nullable(),
  startedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const rawTerminalBookingOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  importBatchId: z.string().uuid(),
  terminalId: z.string(),
  employeePin: z.string(),
  employeeId: z.string().uuid().nullable(),
  rawTimestamp: z.date(),
  rawBookingCode: z.string(),
  bookingDate: z.date(),
  bookingTypeId: z.string().uuid().nullable(),
  processedBookingId: z.string().uuid().nullable(),
  status: z.string(),
  errorMessage: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  employee: z.object({
    id: z.string().uuid(),
    firstName: z.string(),
    lastName: z.string(),
    personnelNumber: z.string(),
  }).nullable().optional(),
  bookingType: z.object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
  }).nullable().optional(),
})
```

#### 2. Register in Root Router
**File**: `apps/web/src/server/root.ts`
**Changes**: Import `terminalBookingsRouter` and add `terminalBookings: terminalBookingsRouter` to `createTRPCRouter({...})`

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compilation passes: `cd apps/web && npx tsc --noEmit` (no new errors)
- [x] Unit tests pass: `cd apps/web && npx vitest run src/server/__tests__/terminalBookings-router.test.ts` (tests created in Phase 4)

#### Manual Verification:
- [ ] Terminal bookings page loads at `/admin/terminal-bookings`
- [ ] Bookings tab shows raw bookings with employee/booking type details
- [ ] Import tab successfully imports a batch of bookings
- [ ] Duplicate import returns existing batch (idempotency)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Vehicles tRPC Router

### Overview
Create the `vehicles` tRPC router with standard CRUD operations, porting business logic from `apps/api/internal/service/vehicle.go`.

### Changes Required:

#### 1. Vehicles Router
**File**: `apps/web/src/server/routers/vehicles.ts` (new file)
**Changes**: Create tRPC router with 5 procedures

**Permission constants:**
```typescript
const VEHICLE_DATA_MANAGE = permissionIdByKey("vehicle_data.manage")!
```

All procedures use `tenantProcedure` + `requirePermission(VEHICLE_DATA_MANAGE)`.

**Procedures:**

1. **`list`** (query)
   - Input: `z.void().optional()`
   - Output: `{ data: Vehicle[] }`
   - Logic: `findMany({ tenantId })`, order by `[{ sortOrder: "asc" }, { code: "asc" }]`

2. **`getById`** (query)
   - Input: `{ id: string (uuid) }`
   - Output: `Vehicle`
   - Logic: `findFirst({ id, tenantId })`, throw NOT_FOUND if missing

3. **`create`** (mutation)
   - Input: `{ code: string (min 1, max 50), name: string (min 1, max 255), description?: string, licensePlate?: string (max 20), sortOrder?: number (int) }`
   - Output: `Vehicle`
   - Logic:
     - Trim code, validate non-empty
     - Trim name, validate non-empty
     - Check code uniqueness within tenant: `findFirst({ tenantId, code })`
     - Create with `isActive: true`, `sortOrder: input.sortOrder ?? 0`
   - Errors: BAD_REQUEST (code/name empty), CONFLICT (code exists)

4. **`update`** (mutation)
   - Input: `{ id: string (uuid), name?: string (min 1, max 255), description?: string (nullable), licensePlate?: string (max 20, nullable), isActive?: boolean, sortOrder?: number (int) }`
   - Output: `Vehicle`
   - Logic:
     - Verify exists with tenant scope
     - Code is NOT updatable (not in input schema)
     - If name provided, trim and validate non-empty
     - Build partial update data object
     - `update`
   - Errors: NOT_FOUND, BAD_REQUEST (name empty)

5. **`delete`** (mutation)
   - Input: `{ id: string (uuid) }`
   - Output: `{ success: boolean }`
   - Logic:
     - Verify exists with tenant scope
     - Check if vehicle has trip records: `tripRecord.count({ vehicleId: id })`
     - If count > 0, throw BAD_REQUEST ("Cannot delete vehicle that has trip records")
     - `delete`
   - Errors: NOT_FOUND, BAD_REQUEST (in use)

**Output Schema:**
```typescript
const vehicleOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  licensePlate: z.string().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
```

#### 2. Register in Root Router
**File**: `apps/web/src/server/root.ts`
**Changes**: Import `vehiclesRouter` and add `vehicles: vehiclesRouter`

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compilation passes: `cd apps/web && npx tsc --noEmit`
- [x] Unit tests pass: `cd apps/web && npx vitest run src/server/__tests__/vehicles-router.test.ts`

#### Manual Verification:
- [ ] Vehicle CRUD works via tRPC (test with tRPC DevTools or component)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Vehicle Routes + Trip Records tRPC Routers

### Overview
Create the `vehicleRoutes` tRPC router (CRUD) and `tripRecords` tRPC router (CRUD), porting business logic from `apps/api/internal/service/vehicle_route.go` and `apps/api/internal/service/trip_record.go`.

### Changes Required:

#### 1. Vehicle Routes Router
**File**: `apps/web/src/server/routers/vehicleRoutes.ts` (new file)
**Changes**: Create tRPC router with 5 procedures

**Permission constants:**
```typescript
const VEHICLE_DATA_MANAGE = permissionIdByKey("vehicle_data.manage")!
```

**Procedures:** (identical CRUD pattern to vehicles)

1. **`list`** (query)
   - Input: `z.void().optional()`
   - Output: `{ data: VehicleRoute[] }`
   - Logic: `findMany({ tenantId })`, order by `[{ sortOrder: "asc" }, { code: "asc" }]`

2. **`getById`** (query)
   - Input: `{ id: uuid }`
   - Output: `VehicleRoute`

3. **`create`** (mutation)
   - Input: `{ code: string (min 1, max 50), name: string (min 1, max 255), description?: string, distanceKm?: number, sortOrder?: number (int) }`
   - Logic: Same as vehicle create (trim/validate code+name, check uniqueness)
   - `distanceKm` stored as Prisma Decimal: use `new Prisma.Decimal(input.distanceKm)` or pass the number directly (Prisma handles it)

4. **`update`** (mutation)
   - Input: `{ id: uuid, name?: string, description?: string (nullable), distanceKm?: number (nullable), isActive?: boolean, sortOrder?: number (int) }`
   - Code NOT updatable

5. **`delete`** (mutation)
   - Check if route has trip records: `tripRecord.count({ routeId: id })`
   - If count > 0, throw BAD_REQUEST ("Cannot delete vehicle route that has trip records")

**Output Schema:**
```typescript
const vehicleRouteOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  distanceKm: z.number().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
```

**Note on Decimal conversion**: The `distanceKm` field is stored as `Decimal` in Prisma but needs to be returned as a `number` in the output schema. Convert with `Number(record.distanceKm)` (returns `null` if the Decimal is null). Use this same pattern for TripRecord mileage fields.

#### 2. Trip Records Router
**File**: `apps/web/src/server/routers/tripRecords.ts` (new file)
**Changes**: Create tRPC router with 5 procedures

**Permission constants:**
```typescript
const VEHICLE_DATA_MANAGE = permissionIdByKey("vehicle_data.manage")!
```

**Procedures:**

1. **`list`** (query)
   - Input: `{ vehicleId?: string (uuid), fromDate?: string (YYYY-MM-DD), toDate?: string (YYYY-MM-DD), limit?: number (1-250, default 50), page?: number (min 1, default 1) }`
   - Output: `{ data: TripRecord[], meta: { total: number, limit: number, hasMore: boolean } }`
   - Logic:
     - Build `where`: `{ tenantId, vehicleId?, tripDate: { gte?, lte? } }`
     - `findMany` with `take: limit`, `skip: (page - 1) * limit`, order by `[{ tripDate: "desc" }, { createdAt: "desc" }]`
     - Include: `vehicle` (select: id, code, name), `vehicleRoute` (select: id, code, name)
     - `count` for total
   - **Note**: This exposes the `vehicleId` filter that was in the Go repository's `ListByVehicle` but not exposed through the Go service.

2. **`getById`** (query)
   - Input: `{ id: uuid }`
   - Output: `TripRecord`
   - Include: `vehicle` and `vehicleRoute`

3. **`create`** (mutation)
   - Input: `{ vehicleId: string (uuid, required), routeId?: string (uuid), tripDate: string (YYYY-MM-DD, required), startMileage?: number, endMileage?: number, distanceKm?: number, notes?: string }`
   - Output: `TripRecord`
   - Logic:
     - Validate vehicleId is provided (non-empty)
     - Validate tripDate is a valid date
     - Validate vehicleId FK: `vehicle.findFirst({ id: vehicleId, tenantId })`; if not found, throw BAD_REQUEST ("Vehicle not found")
     - If routeId provided, validate FK: `vehicleRoute.findFirst({ id: routeId, tenantId })`; if not found, throw BAD_REQUEST ("Vehicle route not found")
     - Create with Decimal conversions for mileage fields
     - Include vehicle + vehicleRoute in response
   - Errors: BAD_REQUEST (vehicle required, date required, invalid FK)

4. **`update`** (mutation)
   - Input: `{ id: uuid, routeId?: string (uuid, nullable), tripDate?: string (YYYY-MM-DD), startMileage?: number (nullable), endMileage?: number (nullable), distanceKm?: number (nullable), notes?: string (nullable) }`
   - Output: `TripRecord`
   - Logic:
     - Verify exists with tenant scope
     - VehicleID is NOT updatable
     - If routeId provided (not null), validate FK
     - If routeId explicitly set to null, set `routeId: null`
     - If tripDate provided, validate non-empty date
     - Build partial update data with Decimal conversions
     - Include vehicle + vehicleRoute in response

5. **`delete`** (mutation)
   - Input: `{ id: uuid }`
   - Output: `{ success: boolean }`
   - Logic: Verify exists with tenant scope, then delete

**Output Schema:**
```typescript
const tripRecordOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  routeId: z.string().uuid().nullable(),
  tripDate: z.date(),
  startMileage: z.number().nullable(),
  endMileage: z.number().nullable(),
  distanceKm: z.number().nullable(),
  notes: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  vehicle: z.object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
  }).optional(),
  vehicleRoute: z.object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
  }).nullable().optional(),
})
```

#### 3. Register in Root Router
**File**: `apps/web/src/server/root.ts`
**Changes**: Import `vehicleRoutesRouter` and `tripRecordsRouter`, add `vehicleRoutes: vehicleRoutesRouter` and `tripRecords: tripRecordsRouter`

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compilation passes: `cd apps/web && npx tsc --noEmit`
- [x] Unit tests pass: `cd apps/web && npx vitest run src/server/__tests__/vehicleRoutes-router.test.ts src/server/__tests__/tripRecords-router.test.ts`

#### Manual Verification:
- [ ] Vehicle route and trip record CRUD works via tRPC

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Frontend Hook Migration + Unit Tests

### Overview
Migrate the existing `use-terminal-bookings.ts` hook from REST to tRPC, create new hooks for vehicles/vehicle routes/trip records, and write comprehensive unit tests for all 4 routers.

### Changes Required:

#### 1. Terminal Bookings Hook Migration
**File**: `apps/web/src/hooks/api/use-terminal-bookings.ts`
**Changes**: Rewrite from REST-based `useApiQuery`/`useApiMutation` to tRPC following `use-shift-planning.ts` pattern.

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
```

Hooks to migrate:
- `useTerminalBookings(options)` -> `trpc.terminalBookings.list.queryOptions({ from, to, terminalId, employeeId, status, importBatchId, limit, page }, { enabled: !!from && !!to })`
- `useTriggerTerminalImport()` -> `trpc.terminalBookings.import.mutationOptions()` + invalidate list + batches
- `useImportBatches(options)` -> `trpc.terminalBookings.batches.queryOptions({ status, terminalId, limit, page }, { enabled })`
- `useImportBatch(id)` -> `trpc.terminalBookings.batch.queryOptions({ id }, { enabled: !!id })`

#### 2. Vehicles Hook (new)
**File**: `apps/web/src/hooks/api/use-vehicles.ts` (new file)
**Changes**: Create tRPC-based hooks following `use-shift-planning.ts` pattern.

Hooks:
- `useVehicles(options)` -- `trpc.vehicles.list.queryOptions`
- `useVehicle(id)` -- `trpc.vehicles.getById.queryOptions`
- `useCreateVehicle()` -- `trpc.vehicles.create.mutationOptions` + invalidate list
- `useUpdateVehicle()` -- `trpc.vehicles.update.mutationOptions` + invalidate list
- `useDeleteVehicle()` -- `trpc.vehicles.delete.mutationOptions` + invalidate list

#### 3. Vehicle Routes Hook (new)
**File**: `apps/web/src/hooks/api/use-vehicle-routes.ts` (new file)
**Changes**: Same pattern as vehicles.

Hooks:
- `useVehicleRoutes(options)` -- `trpc.vehicleRoutes.list.queryOptions`
- `useVehicleRoute(id)` -- `trpc.vehicleRoutes.getById.queryOptions`
- `useCreateVehicleRoute()` -- `trpc.vehicleRoutes.create.mutationOptions` + invalidate list
- `useUpdateVehicleRoute()` -- `trpc.vehicleRoutes.update.mutationOptions` + invalidate list
- `useDeleteVehicleRoute()` -- `trpc.vehicleRoutes.delete.mutationOptions` + invalidate list

#### 4. Trip Records Hook (new)
**File**: `apps/web/src/hooks/api/use-trip-records.ts` (new file)
**Changes**: Similar pattern but with additional filter options.

Hooks:
- `useTripRecords(options)` -- `trpc.tripRecords.list.queryOptions({ vehicleId, fromDate, toDate, limit, page }, { enabled })`
- `useTripRecord(id)` -- `trpc.tripRecords.getById.queryOptions`
- `useCreateTripRecord()` -- `trpc.tripRecords.create.mutationOptions` + invalidate list
- `useUpdateTripRecord()` -- `trpc.tripRecords.update.mutationOptions` + invalidate list
- `useDeleteTripRecord()` -- `trpc.tripRecords.delete.mutationOptions` + invalidate list

#### 5. Hook Index Exports
**File**: `apps/web/src/hooks/api/index.ts`
**Changes**: Add re-exports for new hooks (`use-vehicles.ts`, `use-vehicle-routes.ts`, `use-trip-records.ts`). The existing `use-terminal-bookings.ts` exports should remain with the same function names.

#### 6. Unit Tests -- Terminal Bookings
**File**: `apps/web/src/server/__tests__/terminalBookings-router.test.ts` (new file)
**Changes**: Create tests following `exportInterfaces-router.test.ts` pattern.

Test cases:
- `terminalBookings.list` -- returns tenant-scoped bookings, respects from/to date filter, includes employee/bookingType, pagination
- `terminalBookings.import` -- validates batchReference required, terminalId required, bookings non-empty; creates batch + raw bookings; idempotency check returns existing batch; employee PIN resolution; booking type code resolution; handles batch insert failure
- `terminalBookings.batches` -- returns tenant-scoped batches, filters by status/terminalId, pagination
- `terminalBookings.batch` -- returns batch by ID, throws NOT_FOUND for missing
- Authentication: throws UNAUTHORIZED for unauthenticated request
- Permission: throws FORBIDDEN without `terminal_bookings.manage`

#### 7. Unit Tests -- Vehicles
**File**: `apps/web/src/server/__tests__/vehicles-router.test.ts` (new file)

Test cases:
- `vehicles.list` -- returns tenant-scoped vehicles
- `vehicles.getById` -- returns vehicle, throws NOT_FOUND
- `vehicles.create` -- validates code/name required, code uniqueness, trims input
- `vehicles.update` -- partial updates, name validation, NOT_FOUND
- `vehicles.delete` -- deletes when no trip records, throws BAD_REQUEST when in use, NOT_FOUND

#### 8. Unit Tests -- Vehicle Routes
**File**: `apps/web/src/server/__tests__/vehicleRoutes-router.test.ts` (new file)

Test cases: Same pattern as vehicles tests, plus distanceKm handling.

#### 9. Unit Tests -- Trip Records
**File**: `apps/web/src/server/__tests__/tripRecords-router.test.ts` (new file)

Test cases:
- `tripRecords.list` -- returns tenant-scoped records, filters by vehicleId/dates, pagination, includes vehicle/vehicleRoute
- `tripRecords.getById` -- returns record with vehicle/route, throws NOT_FOUND
- `tripRecords.create` -- validates vehicleId required, tripDate required, FK validation for vehicle and route
- `tripRecords.update` -- partial updates, routeId nullable, NOT_FOUND
- `tripRecords.delete` -- deletes existing, NOT_FOUND

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compilation passes: `cd apps/web && npx tsc --noEmit`
- [x] All new unit tests pass: `cd apps/web && npx vitest run src/server/__tests__/terminalBookings-router.test.ts src/server/__tests__/vehicles-router.test.ts src/server/__tests__/vehicleRoutes-router.test.ts src/server/__tests__/tripRecords-router.test.ts`
- [x] All existing tests still pass: `cd apps/web && npx vitest run`

#### Manual Verification:
- [ ] Terminal bookings page loads and functions correctly with tRPC hooks
- [ ] Import batches tab works correctly
- [ ] No console errors in browser
- [ ] New hooks are importable and usable in future frontend pages

**Implementation Note**: After completing this phase and all automated verification passes, the ticket is complete.

---

## Testing Strategy

### Unit Tests:
- Mock Prisma methods via `ctx.prisma` (same pattern as `exportInterfaces-router.test.ts`)
- Use `createCallerFactory(router)` for each router
- Test all validation rules ported from Go service layer
- Test permission enforcement (caller without permission should fail)
- Test tenant scoping (records from other tenants should not be accessible)

### Key Edge Cases:
- Terminal import idempotency (duplicate batch reference)
- Employee PIN not found during import (graceful -- should not fail)
- Booking type code not found during import (graceful -- should not fail)
- Batch insert failure during import (batch status should be set to "failed")
- Vehicle/vehicle route deletion when trip records reference them
- TripRecord creation with invalid vehicleId or routeId FK
- Decimal/number conversion for mileage and distance fields
- Empty bookings array in import (should fail validation)

### Manual Testing Steps:
1. Navigate to `/admin/terminal-bookings`, verify bookings tab shows data with employee names
2. Switch to import batches tab, trigger a JSON import
3. Trigger the same import again -- verify idempotency
4. (Future) Create a vehicle, vehicle route, and trip record via the new hooks

---

## Performance Considerations

- Terminal bookings list with date range filter uses indexed queries (`idx_raw_terminal_bookings_date`).
- Import trigger does a batch insert (`createMany`) for raw bookings, which is efficient for bulk data.
- Employee PIN resolution and booking type code resolution during import are N queries (one per booking). For large imports (1000+ bookings), this could be slow. Consider a pre-fetch optimization: fetch all employees and booking types for the tenant once, then do in-memory lookups. However, the Go implementation has the same N-query pattern, so this matches current behavior.
- Vehicle/vehicle route lists are simple `findMany` without pagination (small data sets). Trip records list has pagination support.

---

## Migration Notes

- The Go routes in `main.go` (lines 358-388 for service init, lines 578-584 for route registration) will continue to serve the old REST endpoints until they are explicitly removed. The tRPC routers operate independently.
- The scheduler's `TerminalImportTaskHandler` (line 427 in main.go) remains in Go and depends on the Go `TerminalService`. This is unaffected by the tRPC migration.
- The evaluation module's `ListTerminalBookings` queries the `bookings` table (not `raw_terminal_bookings`) and is unaffected.
- Frontend component files (`bookings-tab.tsx`, `import-batches-tab.tsx`) import from `@/hooks/api/use-terminal-bookings`. Since we preserve function names, component code should not need changes. However, the input parameter naming may differ slightly (e.g., `terminal_id` becomes `terminalId`, `import_batch_id` becomes `importBatchId`, `employee_id` becomes `employeeId`). Components using these hooks will need minor updates to match the new camelCase parameter names.
- The `use-terminal-bookings.ts` hook currently passes params as `{ from, to, terminal_id, employee_id, ... }` (snake_case). The tRPC version will use `{ from, to, terminalId, employeeId, ... }` (camelCase). Components that pass these options will need updating.

---

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-225-terminal-bookings-vehicles-trip-records.md`
- Research document: `thoughts/shared/research/2026-03-07-ZMI-TICKET-225-terminal-bookings-vehicles-trip-records.md`
- Previous plan (same series): `thoughts/shared/plans/2026-03-07-ZMI-TICKET-224-export-interfaces-payroll-reports.md`
- Exemplar tRPC router (CRUD): `apps/web/src/server/routers/shifts.ts`
- Exemplar tRPC router (complex): `apps/web/src/server/routers/exportInterfaces.ts`
- Exemplar tRPC hook migration: `apps/web/src/hooks/api/use-shift-planning.ts`
- Exemplar test file: `apps/web/src/server/__tests__/exportInterfaces-router.test.ts`
- Test helpers: `apps/web/src/server/__tests__/helpers.ts`
- Go terminal service: `apps/api/internal/service/terminal.go`
- Go vehicle service: `apps/api/internal/service/vehicle.go`
- Go vehicle route service: `apps/api/internal/service/vehicle_route.go`
- Go trip record service: `apps/api/internal/service/trip_record.go`
- Go terminal tests: `apps/api/internal/service/terminal_test.go`
- DB migrations: `db/migrations/000071_create_import_batches.up.sql`, `db/migrations/000072_create_raw_terminal_bookings.up.sql`, `db/migrations/000074_create_vehicle_data.up.sql`
- Prisma schema: `apps/web/prisma/schema.prisma` (new models append after line 2348)
- Root router: `apps/web/src/server/root.ts`
- tRPC setup: `apps/web/src/server/trpc.ts`
- Authorization middleware: `apps/web/src/server/middleware/authorization.ts`
- Permission catalog: `apps/web/src/server/lib/permission-catalog.ts`
- Frontend hooks (REST, to be migrated): `apps/web/src/hooks/api/use-terminal-bookings.ts`
