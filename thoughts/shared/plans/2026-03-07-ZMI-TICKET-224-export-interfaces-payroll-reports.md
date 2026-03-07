# ZMI-TICKET-224 Implementation Plan: Export Interfaces, Payroll Exports, Reports tRPC Routers

## Overview

Port Go business logic for Export Interfaces (CRUD + account assignments), Payroll Exports (CRUD + generate + preview + download), and Reports (CRUD + generate + download) to tRPC routers. Add Prisma models for 4 new tables, create 3 tRPC router files, register them in root.ts, migrate frontend hooks from `useApiQuery`/`useApiMutation` to tRPC, and write unit tests.

**Go files being replaced:**
- `apps/api/internal/service/exportinterface.go` (209 lines)
- `apps/api/internal/handler/exportinterface.go` (351 lines)
- `apps/api/internal/repository/exportinterface.go` (193 lines)
- `apps/api/internal/service/payrollexport.go` (516 lines)
- `apps/api/internal/handler/payrollexport.go` (355 lines)
- `apps/api/internal/repository/payrollexport.go` (121 lines)
- `apps/api/internal/service/report.go` (938 lines)
- `apps/api/internal/handler/report.go` (294 lines)
- `apps/api/internal/repository/report.go` (104 lines)

---

## Current State Analysis

### What exists:
- Full Go backend (handler/service/repository) for all 3 entity groups
- Database tables: `export_interfaces` (migration 000059), `export_interface_accounts` (000060), `payroll_exports` (000061), `reports` (000066)
- Frontend hooks using REST-based `useApiQuery`/`useApiMutation`: `use-export-interfaces.ts`, `use-payroll-exports.ts`, `use-reports.ts`
- Frontend pages and components consuming these hooks
- OpenAPI schemas defining request/response shapes
- Permissions already in catalog: `payroll.manage`, `payroll.view`, `reports.view`, `reports.manage`

### What's missing:
- Prisma models: `ExportInterface`, `ExportInterfaceAccount`, `PayrollExport`, `Report`
- Supabase migration for the 4 tables (they exist in Go migrations but not Supabase)
- tRPC routers: `exportInterfaces`, `payrollExports`, `reports`
- Prisma models for MonthlyValue, DailyValue, AbsenceDay (needed for generation logic -- these tables exist in DB via Go migrations 000024, 000026, 000028 but have no Prisma models yet)

### Key Discoveries:
- `apps/web/prisma/schema.prisma` ends at line 2155 (EmployeeAccessAssignment model). No ExportInterface/PayrollExport/Report models exist.
- MonthlyValue, DailyValue, and AbsenceDay have no Prisma models. Payroll export generation and report generation need MonthlyValue at minimum. Report generation also needs DailyValue, AbsenceDay, and VacationBalance (which does exist at line 1689).
- No XLSX or PDF Node.js libraries are installed in `apps/web/package.json`.
- Payroll export download uses `file_content TEXT` column. Reports use `file_content BYTEA` column.
- Both payroll exports and reports use an async 202 pattern in Go, but generation is actually synchronous. The tRPC mutation can generate synchronously and return the completed/failed record.
- File download in the current frontend uses raw `fetch` with blob handling. tRPC does not natively support binary streaming. The download procedure will return base64-encoded content + metadata, and the frontend hook will handle blob creation.
- The Tenant model (line 81-152 of schema.prisma) needs new relation fields for `exportInterfaces`, `payrollExports`, `reports`.
- Account model (line 371-405) needs a new relation for `exportInterfaceAccounts`.
- User model (line 28-69) needs new relations for `payrollExportsCreated` and `reportsCreated`.

---

## Desired End State

After this plan is complete:
1. Four new Prisma models exist and are usable: `ExportInterface`, `ExportInterfaceAccount`, `PayrollExport`, `Report`
2. Supporting Prisma models exist: `MonthlyValue` (minimum required for payroll generation)
3. Three tRPC routers handle all CRUD + business logic that was in Go
4. Frontend hooks use tRPC instead of REST
5. Export generation (CSV only for payroll, CSV + JSON for reports) works end-to-end
6. Download returns base64-encoded content from tRPC, and frontend hooks convert to blob for download
7. All unit tests pass for the three routers

**Verification:** `npx vitest run apps/web/src/server/__tests__/exportInterfaces-router.test.ts apps/web/src/server/__tests__/payrollExports-router.test.ts apps/web/src/server/__tests__/reports-router.test.ts` passes. TypeScript compilation succeeds.

---

## What We're NOT Doing

- **XLSX/PDF report generation in Node.js:** The Go service uses `excelize` and `fpdf`. Installing and porting these to Node.js (exceljs/pdfkit) is complex and out of scope. Reports will support CSV and JSON formats only in this ticket. XLSX and PDF can be added in a follow-up ticket.
- **DATEV export format:** Explicitly out of scope per ticket.
- **Actual async/background generation:** The Go implementation generates synchronously despite the 202 pattern. We maintain this approach.
- **Prisma models for DailyValue and AbsenceDay:** Only MonthlyValue is needed for payroll export generation (the most common use case). Report types that need DailyValue/AbsenceDay (daily_overview, absence_report, etc.) will use `$queryRawUnsafe` until those models are added in a future ticket. For this ticket, we focus on report types that use employees + monthly values.
- **Next.js API route for file serving:** We use base64 in tRPC response instead.

---

## Implementation Approach

Follow the same pattern as ZMI-TICKET-222 (shifts/macros/messages):
1. Supabase migration to create tables
2. Prisma schema additions (4 new models + MonthlyValue + relations)
3. Prisma client regeneration
4. tRPC routers with business logic inline
5. Root router registration
6. Frontend hook migration
7. Unit tests

Split into 4 phases to keep each phase testable.

---

## Phase 0: Prisma Schema + Supabase Migration

### Overview
Add the database tables to Supabase and define Prisma models for ExportInterface, ExportInterfaceAccount, PayrollExport, Report, and MonthlyValue.

### Changes Required:

#### 1. Supabase Migration
**File**: `supabase/migrations/<timestamp>_add_export_interfaces_payroll_reports.sql`
**Action**: Create with `make db-migrate-new name=add_export_interfaces_payroll_reports`, then populate.

Content should include DDL from:
- `db/migrations/000059_create_export_interfaces.up.sql` (export_interfaces table)
- `db/migrations/000060_create_export_interface_accounts.up.sql` (export_interface_accounts table)
- `db/migrations/000061_create_payroll_exports.up.sql` (payroll_exports table)
- `db/migrations/000066_create_reports.up.sql` (reports table)
- `db/migrations/000028_create_monthly_values.up.sql` (monthly_values table -- needed for generation)

All `CREATE TABLE` wrapped in `CREATE TABLE IF NOT EXISTS`. All indexes use `CREATE INDEX IF NOT EXISTS`. Triggers use `CREATE OR REPLACE TRIGGER`.

#### 2. Prisma Schema Additions
**File**: `apps/web/prisma/schema.prisma`
**Action**: Append 5 new models after EmployeeAccessAssignment (line 2155). Add relation fields to Tenant, Account, User, Employee models.

**Model: ExportInterface** (maps to `export_interfaces`)
- Fields: id (UUID PK), tenantId, interfaceNumber (Int), name (VarChar 255), mandantNumber? (VarChar 50), exportScript? (VarChar 255), exportPath? (VarChar 500), outputFilename? (VarChar 255), isActive (Boolean default true), createdAt, updatedAt
- Relations: tenant (Tenant), accounts (ExportInterfaceAccount[]), payrollExports (PayrollExport[])
- Unique: @@unique([tenantId, interfaceNumber])
- Indexes: @@index([tenantId], map: "idx_ei_tenant")
- Map: @@map("export_interfaces")

**Model: ExportInterfaceAccount** (maps to `export_interface_accounts`)
- Fields: id (UUID PK), exportInterfaceId (UUID), accountId (UUID), sortOrder (Int default 0), createdAt
- Relations: exportInterface (ExportInterface), account (Account)
- Unique: @@unique([exportInterfaceId, accountId])
- Indexes: @@index([exportInterfaceId], map: "idx_eia_interface"), @@index([accountId], map: "idx_eia_account")
- Map: @@map("export_interface_accounts")
- NOTE: No updatedAt column

**Model: PayrollExport** (maps to `payroll_exports`)
- Fields: id (UUID PK), tenantId, exportInterfaceId? (UUID), year (Int), month (Int), status (VarChar 20 default "pending"), exportType (VarChar 20 default "standard"), format (VarChar 10 default "csv"), parameters (Json default "{}"), fileContent? (Text), fileSize? (Int), rowCount? (Int), employeeCount? (Int), totalHours? (Decimal 12,2), totalOvertime? (Decimal 12,2), errorMessage? (Text), requestedAt (Timestamptz default now()), startedAt? (Timestamptz), completedAt? (Timestamptz), createdBy? (UUID), createdAt, updatedAt
- Relations: tenant (Tenant), exportInterface? (ExportInterface onDelete SetNull), createdByUser? (User)
- Indexes: @@index([tenantId], map: "idx_pe_tenant"), @@index([exportInterfaceId], map: "idx_pe_interface"), @@index([tenantId, year, month], map: "idx_pe_period"), @@index([status], map: "idx_pe_status")
- Map: @@map("payroll_exports")

**Model: Report** (maps to `reports`)
- Fields: id (UUID PK), tenantId, reportType (VarChar 30), name? (VarChar 255), description? (Text), status (VarChar 20 default "pending"), format (VarChar 10 default "xlsx"), parameters (Json default "{}"), fileContent? (Bytes -- BYTEA column), fileSize? (Int), rowCount? (Int), errorMessage? (Text), requestedAt (Timestamptz default now()), startedAt? (Timestamptz), completedAt? (Timestamptz), createdBy? (UUID), createdAt, updatedAt
- Relations: tenant (Tenant), createdByUser? (User)
- Indexes: @@index([tenantId], map: "idx_reports_tenant"), @@index([tenantId, reportType], map: "idx_reports_type"), @@index([status], map: "idx_reports_status")
- Map: @@map("reports")

**Model: MonthlyValue** (maps to `monthly_values`)
- Fields: id (UUID PK), tenantId, employeeId (UUID), year (Int), month (Int), totalTargetTime (Int default 0), totalGrossTime (Int default 0), totalNetTime (Int default 0), totalOvertime (Int default 0), totalUndertime (Int default 0), totalBreakTime (Int default 0), workDays (Int default 0), absenceDays (Int default 0), holidayDays (Int default 0), sickDays (Int default 0), vacationTaken (Decimal 5,2 default 0), otherAbsenceDays (Int default 0), flextimeStart (Int default 0), flextimeChange (Int default 0), flextimeEnd (Int default 0), isClosed (Boolean default false), closedAt? (Timestamptz), closedBy? (UUID), createdAt, updatedAt
- Relations: tenant (Tenant), employee (Employee)
- Unique: @@unique([employeeId, year, month])
- Indexes: @@index([tenantId], map: "idx_mv_tenant"), @@index([employeeId], map: "idx_mv_employee")
- Map: @@map("monthly_values")

**Reverse relations to add on existing models:**
- `Tenant` model (line 99-146): Add `exportInterfaces ExportInterface[]`, `payrollExports PayrollExport[]`, `reports Report[]`, `monthlyValues MonthlyValue[]`
- `Account` model (line 391-404): Add `exportInterfaceAccounts ExportInterfaceAccount[]`
- `User` model (line 50-57): Add `payrollExportsCreated PayrollExport[]`, `reportsCreated Report[]`
- `Employee` model (near line 510): Add `monthlyValues MonthlyValue[]`

#### 3. Regenerate Prisma Client
Run `cd apps/web && npx prisma generate` to regenerate the client.

### Success Criteria:

#### Automated Verification:
- [x] Supabase migration applies: `cd /home/tolga/projects/terp && npx supabase db reset`
- [x] Prisma client generates without errors: `cd apps/web && npx prisma generate`
- [x] TypeScript compilation passes: `cd apps/web && npx tsc --noEmit`

#### Manual Verification:
- [ ] Tables visible in Supabase Studio
- [ ] Prisma Studio shows the new models

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 1.

---

## Phase 1: Export Interfaces tRPC Router

### Overview
Create the exportInterfaces tRPC router with CRUD operations + account assignment management, porting business logic from `apps/api/internal/service/exportinterface.go`.

### Changes Required:

#### 1. Export Interfaces Router
**File**: `apps/web/src/server/routers/exportInterfaces.ts` (new file)
**Changes**: Create tRPC router with 7 procedures

**Permission constants:**
```typescript
const PAYROLL_MANAGE = permissionIdByKey("payroll.manage")!
```

All procedures use `tenantProcedure` + `requirePermission(PAYROLL_MANAGE)`.

**Procedures:**

1. **`list`** (query)
   - Input: `{ activeOnly?: boolean }` (optional)
   - Output: `{ data: ExportInterface[] }`
   - Logic: `findMany` with tenant scope, optional `isActive: true` filter
   - Include: accounts relation (with account details)
   - Order by: `interfaceNumber ASC`

2. **`getById`** (query)
   - Input: `{ id: string (uuid) }`
   - Output: `ExportInterface` with accounts
   - Logic: `findFirst` with tenant scope, include accounts + account relation
   - Error: NOT_FOUND if not found

3. **`create`** (mutation)
   - Input: `{ interfaceNumber: int (min 1), name: string (min 1, max 255), mandantNumber?: string, exportScript?: string, exportPath?: string, outputFilename?: string }`
   - Logic:
     - Trim name, validate non-empty
     - Validate interfaceNumber > 0
     - Check uniqueness: `findFirst({ tenantId, interfaceNumber })`
     - `create` with `isActive: true`
   - Errors: BAD_REQUEST (name empty, number <= 0), CONFLICT (number exists)

4. **`update`** (mutation)
   - Input: `{ id: uuid, interfaceNumber?: int, name?: string, mandantNumber?: string (nullable), exportScript?: string (nullable), exportPath?: string (nullable), outputFilename?: string (nullable), isActive?: boolean }`
   - Logic:
     - Verify exists with tenant scope
     - If name provided, trim and validate non-empty
     - If interfaceNumber provided, validate > 0 and check uniqueness (excluding self)
     - Build partial update data
     - `update`
   - Errors: NOT_FOUND, BAD_REQUEST, CONFLICT

5. **`delete`** (mutation)
   - Input: `{ id: uuid }`
   - Output: `{ success: boolean }`
   - Logic:
     - Verify exists with tenant scope
     - Check usage: `count payrollExports where exportInterfaceId = id`
     - If count > 0, throw BAD_REQUEST ("Cannot delete export interface that has generated exports")
     - `delete`
   - Errors: NOT_FOUND, BAD_REQUEST (in use)

6. **`listAccounts`** (query)
   - Input: `{ id: uuid }`
   - Output: `{ data: ExportInterfaceAccount[] }` (with account details: code, name, payrollCode)
   - Logic:
     - Verify interface exists with tenant scope
     - `findMany` on ExportInterfaceAccount with `exportInterfaceId`, include Account, order by `sortOrder ASC`

7. **`setAccounts`** (mutation)
   - Input: `{ id: uuid, accountIds: string[] (uuid[]) }`
   - Output: `{ data: ExportInterfaceAccount[] }`
   - Logic:
     - Verify interface exists with tenant scope
     - Transaction: delete all existing accounts for this interface, then create new ones with sortOrder = array index
     - Return newly created accounts with Account relation included

#### 2. Register in Root Router
**File**: `apps/web/src/server/root.ts`
**Changes**: Import `exportInterfacesRouter` and add `exportInterfaces: exportInterfacesRouter` to `createTRPCRouter({...})`

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compilation passes: `cd apps/web && npx tsc --noEmit`
- [x] Unit tests pass: `cd apps/web && npx vitest run src/server/__tests__/exportInterfaces-router.test.ts`

#### Manual Verification:
- [ ] CRUD operations work via frontend UI at `/admin/export-interfaces`
- [ ] Account mapping dialog works correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Payroll Exports tRPC Router

### Overview
Create the payrollExports tRPC router with list, getById, generate, preview, download, and delete procedures. Port the generation logic from `apps/api/internal/service/payrollexport.go`.

### Changes Required:

#### 1. Payroll Exports Router
**File**: `apps/web/src/server/routers/payrollExports.ts` (new file)
**Changes**: Create tRPC router with 6 procedures

**Permission constants:**
```typescript
const PAYROLL_VIEW = permissionIdByKey("payroll.view")!
const PAYROLL_MANAGE = permissionIdByKey("payroll.manage")!
```

**Procedures:**

1. **`list`** (query) -- permission: `payroll.view`
   - Input: `{ year?: number, month?: number, status?: enum, limit?: number (1-100, default 20), cursor?: string (uuid) }`
   - Output: `{ data: PayrollExport[], meta: { hasMore: boolean, nextCursor?: string } }`
   - Logic:
     - Build where clause: `{ tenantId, year?, month?, status? }`
     - If cursor provided, add `id: { lt: cursor }` (or use cursor-based ordering)
     - Fetch `limit + 1` records, ordered by `createdAt DESC`
     - Determine `hasMore` from extra record
     - Strip `fileContent` from output (never return file content in list)
   - Output schema excludes `fileContent`

2. **`getById`** (query) -- permission: `payroll.view`
   - Input: `{ id: uuid }`
   - Output: `PayrollExport` (without fileContent)
   - Logic: `findFirst` with tenant scope, select all fields except fileContent

3. **`generate`** (mutation) -- permission: `payroll.manage`
   - Input: `{ year: number, month: number (1-12), format?: enum ("csv"|"xlsx"|"xml"|"json", default "csv"), exportType?: enum ("standard"|"datev"|"sage"|"custom", default "standard"), exportInterfaceId?: uuid, parameters?: { employeeIds?: uuid[], departmentIds?: uuid[], includeAccounts?: uuid[] } }`
   - Output: `PayrollExport` (without fileContent)
   - Logic (port from Go `payrollexport.go` Generate + generateExportData):
     1. Validate year > 0, month 1-12
     2. Validate not future month: `year > now.year || (year == now.year && month >= now.month)`
     3. Validate format against enum
     4. Create record in "pending" status with `ctx.prisma.payrollExport.create`
     5. Update to "generating" status with startedAt
     6. Get active employees via `ctx.prisma.employee.findMany` with tenant scope, optional department filter
     7. Filter by employeeIds if provided
     8. Resolve account IDs from export interface if not explicitly provided
     9. Build account code map by fetching accounts
     10. For each employee, fetch MonthlyValue via `ctx.prisma.monthlyValue.findFirst({ employeeId, year, month })`
     11. Convert minutes to hours (divide by 60)
     12. Generate CSV with semicolon delimiter (same format as Go)
     13. Update record: status = "completed", fileContent, fileSize, rowCount, employeeCount, totalHours, totalOvertime, completedAt
     14. On error: set status = "failed", errorMessage
     15. Return record (without fileContent)
   - Set `createdBy` from `ctx.user.id`

4. **`preview`** (query) -- permission: `payroll.view`
   - Input: `{ id: uuid }`
   - Output: `{ lines: PayrollExportLine[], summary: { employeeCount, totalHours, totalOvertime } }`
   - Logic (port from Go `GetPreviewData`):
     1. Fetch export record, verify status == "completed"
     2. Parse parameters JSON to get employee/department filters
     3. Re-generate lines from employee + monthly value data (not from stored file)
     4. Return structured lines + summary

5. **`download`** (query) -- permission: `payroll.view`
   - Input: `{ id: uuid }`
   - Output: `{ content: string (base64), contentType: string, filename: string }`
   - Logic (port from Go `GetDownloadContent`):
     1. Fetch export record with fileContent
     2. Verify status == "completed" and fileContent not null
     3. Determine content type and filename based on format
     4. Return base64-encoded content, content type, and filename

6. **`delete`** (mutation) -- permission: `payroll.manage`
   - Input: `{ id: uuid }`
   - Output: `{ success: boolean }`
   - Logic: Verify exists with tenant scope, then delete

#### 2. Register in Root Router
**File**: `apps/web/src/server/root.ts`
**Changes**: Import `payrollExportsRouter` and add `payrollExports: payrollExportsRouter`

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compilation passes: `cd apps/web && npx tsc --noEmit`
- [x] Unit tests pass: `cd apps/web && npx vitest run src/server/__tests__/payrollExports-router.test.ts`

#### Manual Verification:
- [ ] Generate payroll export works via UI at `/admin/payroll-exports`
- [ ] Preview displays employee data correctly
- [ ] Download triggers file save in browser
- [ ] Status polling works (pending -> completed transition visible)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Reports tRPC Router

### Overview
Create the reports tRPC router with list, getById, generate, download, and delete procedures. Port the generation logic from `apps/api/internal/service/report.go`, supporting CSV and JSON formats.

### Changes Required:

#### 1. Reports Router
**File**: `apps/web/src/server/routers/reports.ts` (new file)
**Changes**: Create tRPC router with 5 procedures

**Permission constants:**
```typescript
const REPORTS_VIEW = permissionIdByKey("reports.view")!
const REPORTS_MANAGE = permissionIdByKey("reports.manage")!
```

**Procedures:**

1. **`list`** (query) -- permission: `reports.view`
   - Input: `{ reportType?: enum, status?: enum, limit?: number (1-100, default 20), cursor?: string (uuid) }`
   - Output: `{ data: Report[], meta: { hasMore: boolean, nextCursor?: string } }`
   - Logic: Same cursor-based pagination as payrollExports. Strip fileContent.
   - Order by: `createdAt DESC`

2. **`getById`** (query) -- permission: `reports.view`
   - Input: `{ id: uuid }`
   - Output: `Report` (without fileContent)

3. **`generate`** (mutation) -- permission: `reports.manage`
   - Input: `{ reportType: enum (10 types), format: enum ("csv"|"json"), name?: string, parameters?: { fromDate?: string, toDate?: string, employeeIds?: uuid[], departmentIds?: uuid[], costCenterIds?: uuid[], teamIds?: uuid[] } }`
   - Output: `Report` (without fileContent)
   - Logic (port from Go `report.go` Generate + generateReportData):
     1. Validate reportType against 10 valid types
     2. Validate format against "csv" and "json" only (XLSX/PDF deferred)
     3. Check date range requirement: most report types need fromDate + toDate
     4. Create record in "pending" status
     5. Update to "generating" status with startedAt
     6. Get employees in scope (filter by department, cost center, team, specific IDs)
       - Use `ctx.prisma.employee.findMany` with tenant scope
       - If costCenterIds provided, filter by costCenterId
       - If teamIds provided, fetch team members via `ctx.prisma.teamMember.findMany` and filter
       - If employeeIds provided, filter by ID set
     7. Gather report data based on type:
       - **monthly_overview**: iterate months, fetch MonthlyValue per employee
       - **overtime_report**: same as monthly with overtime focus
       - **department_summary**: group by department, aggregate MonthlyValue
       - **account_balances**: iterate months, fetch flextime values from MonthlyValue
       - **vacation_report**: fetch VacationBalance per employee per year
       - **daily_overview, weekly_overview, employee_timesheet**: use `$queryRawUnsafe` against daily_values table (no Prisma model yet)
       - **absence_report**: use `$queryRawUnsafe` against absence_days table (no Prisma model yet)
       - **custom**: placeholder row
     8. Generate output based on format:
       - **CSV**: Build with semicolon delimiter, same as Go `generateReportCSV`
       - **JSON**: Build array of header-keyed objects, same as Go `generateReportJSON`
     9. Store as Buffer (BYTEA column): `Buffer.from(csvString)` or `Buffer.from(jsonString)`
     10. Update record: status = "completed", fileContent, fileSize, rowCount, completedAt
     11. On error: set status = "failed", errorMessage
   - Set `createdBy` from `ctx.user.id`
   - Set `name` from input or auto-generate: `"${ReportType} - ${YYYY-MM-DD}"`

4. **`download`** (query) -- permission: `reports.view`
   - Input: `{ id: uuid }`
   - Output: `{ content: string (base64), contentType: string, filename: string }`
   - Logic:
     1. Fetch report with fileContent
     2. Verify status == "completed" and fileContent not null
     3. Determine content type based on format (csv -> text/csv, json -> application/json)
     4. Generate filename: `report_${id.slice(0,8)}.${ext}`
     5. Return base64-encoded content from BYTEA buffer

5. **`delete`** (mutation) -- permission: `reports.manage`
   - Input: `{ id: uuid }`
   - Output: `{ success: boolean }`

#### 2. Register in Root Router
**File**: `apps/web/src/server/root.ts`
**Changes**: Import `reportsRouter` and add `reports: reportsRouter`

### Helper functions to port from Go:

The following utility functions from `report.go` need TypeScript equivalents in the router file:

- `requiresDateRange(reportType)` -- returns boolean for types needing from/to dates
- `parseDateRange(fromStr, toStr)` -- parses date strings to Date objects
- `iterateMonths(from, to, callback)` -- iterates month-by-month between two dates
- `minutesToHoursString(minutes)` -- converts minutes to "H:MM" format
- `formatReportName(reportType)` -- generates default report name

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compilation passes: `cd apps/web && npx tsc --noEmit`
- [x] Unit tests pass: `cd apps/web && npx vitest run src/server/__tests__/reports-router.test.ts`

#### Manual Verification:
- [ ] Generate report works via UI at `/admin/reports`
- [ ] Download triggers file save in browser
- [ ] CSV and JSON formats produce correct output
- [ ] Status polling works

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Frontend Hook Migration + Unit Tests

### Overview
Migrate all three frontend hook files from REST-based to tRPC-based, and create comprehensive unit tests for all three routers.

### Changes Required:

#### 1. Export Interfaces Hook Migration
**File**: `apps/web/src/hooks/api/use-export-interfaces.ts`
**Changes**: Replace REST hooks with tRPC hooks following `use-shift-planning.ts` pattern

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
```

Hooks to migrate:
- `useExportInterfaces(options)` -> `trpc.exportInterfaces.list.queryOptions({ activeOnly }, { enabled })`
- `useExportInterface(id)` -> `trpc.exportInterfaces.getById.queryOptions({ id }, { enabled })`
- `useExportInterfaceAccounts(id)` -> `trpc.exportInterfaces.listAccounts.queryOptions({ id }, { enabled })`
- `useCreateExportInterface()` -> `trpc.exportInterfaces.create.mutationOptions()` + invalidate list
- `useUpdateExportInterface()` -> `trpc.exportInterfaces.update.mutationOptions()` + invalidate list
- `useDeleteExportInterface()` -> `trpc.exportInterfaces.delete.mutationOptions()` + invalidate list
- `useSetExportInterfaceAccounts()` -> `trpc.exportInterfaces.setAccounts.mutationOptions()` + invalidate list + listAccounts

#### 2. Payroll Exports Hook Migration
**File**: `apps/web/src/hooks/api/use-payroll-exports.ts`
**Changes**: Replace REST hooks with tRPC hooks

Hooks to migrate:
- `usePayrollExports(options)` -> `trpc.payrollExports.list.queryOptions(input, { enabled, refetchInterval })` with polling logic preserved
- `usePayrollExport(id)` -> `trpc.payrollExports.getById.queryOptions({ id }, { enabled, refetchInterval })` with polling
- `usePayrollExportPreview(id)` -> `trpc.payrollExports.preview.queryOptions({ id }, { enabled })`
- `useExportInterfaces(enabled)` -> `trpc.exportInterfaces.list.queryOptions({ activeOnly: true }, { enabled })`
- `useGeneratePayrollExport()` -> `trpc.payrollExports.generate.mutationOptions()` + invalidate list
- `useDeletePayrollExport()` -> `trpc.payrollExports.delete.mutationOptions()` + invalidate list
- `useDownloadPayrollExport()` -> Custom `useMutation` that:
  1. Calls `trpc.payrollExports.download.queryOptions({ id })` via `queryClient.fetchQuery`
  2. Decodes base64 content to Blob
  3. Creates download link and triggers click

**Important**: The `PayrollExportLine` and `PayrollExportPreview` types can be removed (they are now inferred from tRPC output types). The `PayrollExportStatus` type can also be removed.

Remove imports of `api`, `authStorage`, `tenantIdStorage`, `clientEnv` -- no longer needed.

#### 3. Reports Hook Migration
**File**: `apps/web/src/hooks/api/use-reports.ts`
**Changes**: Replace REST hooks with tRPC hooks

Hooks to migrate:
- `useReports(options)` -> `trpc.reports.list.queryOptions(input, { enabled, refetchInterval })` with polling
- `useReport(id)` -> `trpc.reports.getById.queryOptions({ id }, { enabled, refetchInterval })` with polling
- `useGenerateReport()` -> `trpc.reports.generate.mutationOptions()` + invalidate list
- `useDeleteReport()` -> `trpc.reports.delete.mutationOptions()` + invalidate list
- `useDownloadReport()` -> Custom `useMutation` with base64 decode + blob download (same pattern as payroll)

Remove imports of `api`, `authStorage`, `tenantIdStorage`, `clientEnv`, `components['schemas']` types.

#### 4. Hook Index Exports
**File**: `apps/web/src/hooks/api/index.ts`
**Changes**: Review and update re-exports if hook names changed. The existing export names (lines 280-317) should remain stable since we keep the same function names.

#### 5. Unit Tests -- Export Interfaces
**File**: `apps/web/src/server/__tests__/exportInterfaces-router.test.ts` (new file)
**Changes**: Create tests following `notifications-router.test.ts` pattern

Test cases:
- `exportInterfaces.list` -- returns tenant-scoped interfaces, respects activeOnly filter
- `exportInterfaces.getById` -- returns interface with accounts, throws NOT_FOUND
- `exportInterfaces.create` -- validates name required, interfaceNumber > 0, uniqueness check
- `exportInterfaces.update` -- partial updates, uniqueness check on interfaceNumber change
- `exportInterfaces.delete` -- checks usage before deletion, throws BAD_REQUEST if in use
- `exportInterfaces.listAccounts` -- returns accounts with sort order
- `exportInterfaces.setAccounts` -- bulk replace, returns new accounts

#### 6. Unit Tests -- Payroll Exports
**File**: `apps/web/src/server/__tests__/payrollExports-router.test.ts` (new file)

Test cases:
- `payrollExports.list` -- cursor-based pagination, filters by year/month/status
- `payrollExports.getById` -- returns export without fileContent, throws NOT_FOUND
- `payrollExports.generate` -- validates year/month/format, rejects future month, creates record, handles failure
- `payrollExports.preview` -- requires completed status, returns structured lines
- `payrollExports.download` -- requires completed status + fileContent, returns base64
- `payrollExports.delete` -- deletes existing, throws NOT_FOUND
- Permission checks: view operations need payroll.view, generate/delete need payroll.manage

#### 7. Unit Tests -- Reports
**File**: `apps/web/src/server/__tests__/reports-router.test.ts` (new file)

Test cases:
- `reports.list` -- cursor-based pagination, filters by reportType/status
- `reports.getById` -- returns report without fileContent, throws NOT_FOUND
- `reports.generate` -- validates reportType/format, requires date range for applicable types, handles failure
- `reports.download` -- requires completed status + fileContent, returns base64
- `reports.delete` -- deletes existing, throws NOT_FOUND
- Permission checks: view operations need reports.view, generate/delete need reports.manage

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compilation passes: `cd apps/web && npx tsc --noEmit`
- [x] All unit tests pass: `cd apps/web && npx vitest run src/server/__tests__/exportInterfaces-router.test.ts src/server/__tests__/payrollExports-router.test.ts src/server/__tests__/reports-router.test.ts`
- [x] Existing tests still pass: `cd apps/web && npx vitest run`

#### Manual Verification:
- [ ] Export interfaces page loads and CRUD works
- [ ] Payroll exports page: generate, preview, download all functional
- [ ] Reports page: generate and download functional
- [ ] No console errors in browser
- [ ] Polling for status updates works correctly

**Implementation Note**: After completing this phase and all automated verification passes, the ticket is complete.

---

## Testing Strategy

### Unit Tests:
- Mock Prisma methods via `ctx.prisma` (same pattern as `notifications-router.test.ts`)
- Use `createCallerFactory(router)` for each router
- Test all validation rules ported from Go service layer
- Test permission enforcement (caller without permission should fail)
- Test tenant scoping (records from other tenants should not be accessible)

### Key Edge Cases:
- Export interface deletion when payroll exports reference it
- Payroll export generation for future month (should fail)
- Report generation without required date range
- Download of non-completed export/report
- Empty employee list during generation (should produce valid empty CSV)
- Account mapping with duplicate account IDs

### Manual Testing Steps:
1. Navigate to `/admin/export-interfaces`, create an interface with accounts
2. Navigate to `/admin/payroll-exports`, generate an export for a past month
3. Verify preview shows employee data
4. Download the CSV and verify format
5. Navigate to `/admin/reports`, generate a monthly_overview report
6. Download and verify CSV output

---

## Performance Considerations

- Payroll export generation fetches all active employees + their monthly values. For large tenants (10000+ employees), this could be slow. The Go implementation has the same limitation with `Limit: 10000`. This is acceptable for now.
- Report generation has the same N+1 query pattern as Go (fetch employees, then loop to fetch monthly values per employee). Consider batching in a future optimization ticket.
- fileContent (TEXT for payroll, BYTEA for reports) stored in DB. For very large files, this could impact DB performance. This matches the current Go approach.
- Base64 encoding for download increases payload size by ~33%. Acceptable for typical export/report sizes (< 10MB).

---

## Migration Notes

- The Go routes in `main.go` (lines 329-343, 570-572) will continue to serve the old REST endpoints until they are explicitly removed. The tRPC routers operate independently.
- Frontend components import hooks from `@/hooks/api/use-export-interfaces.ts` (etc.) or from `@/hooks/api` index. Since we keep the same function names, component code should not need changes unless the hook signatures change.
- The `PayrollExportLine` and `PayrollExportPreview` types were manually defined in the hooks file. After migration, these types are inferred from the tRPC router output schema and the manual type definitions can be removed.
- The `components['schemas']` types from OpenAPI are no longer needed in the hooks files after migration.
- The page files (`page.tsx`) import from `@/hooks/api/use-export-interfaces` and `@/hooks/api` -- both should work after migration since we preserve function names.
- One nuance: `use-payroll-exports.ts` re-exports `useExportInterfaces` for the generate dialog. After migration, this should call `trpc.exportInterfaces.list` instead. Update the re-export accordingly or have the generate dialog import directly from `use-export-interfaces.ts`.

---

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-224-export-interfaces-payroll-reports.md`
- Research document: `thoughts/shared/research/2026-03-07-ZMI-TICKET-224-export-interfaces-payroll-reports.md`
- Exemplar tRPC router: `apps/web/src/server/routers/shifts.ts`
- Exemplar tRPC hook migration: `apps/web/src/hooks/api/use-shift-planning.ts`
- Exemplar test file: `apps/web/src/server/__tests__/notifications-router.test.ts`
- Go export interface service: `apps/api/internal/service/exportinterface.go`
- Go payroll export service: `apps/api/internal/service/payrollexport.go`
- Go report service: `apps/api/internal/service/report.go`
- Prisma schema: `apps/web/prisma/schema.prisma` (new models append after line 2155)
- Root router: `apps/web/src/server/root.ts`
- Permission catalog: `apps/web/src/server/lib/permission-catalog.ts`
