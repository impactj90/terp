# Research: ZMI-TICKET-224 -- Export Interfaces, Payroll Exports, Reports

**Date:** 2026-03-07
**Ticket:** ZMI-TICKET-224
**Status:** Research Complete

---

## 1. Overview

This ticket requires creating tRPC routers for three entity groups:
1. **Export Interfaces** -- CRUD + account assignments
2. **Payroll Exports** -- CRUD + generate + preview + download (async 202 pattern)
3. **Reports** -- CRUD + generate + download (async 202 pattern)

All three have existing Go backend implementations (handler/service/repository) and existing frontend hooks (REST-based `useApiQuery`/`useApiMutation`). None have tRPC routers yet, and none have Prisma models yet.

---

## 2. Existing Go Backend -- Files to be Replaced

### 2.1 Export Interfaces

| Layer | File | Lines |
|-------|------|-------|
| Service | `apps/api/internal/service/exportinterface.go` | 209 |
| Handler | `apps/api/internal/handler/exportinterface.go` | 351 |
| Repository | `apps/api/internal/repository/exportinterface.go` | 193 |

**Service methods:** `Create`, `GetByID`, `List` (with activeOnly filter), `Update`, `Delete`, `SetAccounts`, `ListAccounts`

**Business logic:**
- Name required, non-empty after trim
- InterfaceNumber must be > 0
- InterfaceNumber must be unique within tenant (checked via `GetByNumber`)
- Delete blocked if interface has generated exports (`CountExportUsages`)
- SetAccounts is a bulk replace: delete existing, insert new with sort_order
- Audit logging on create/update/delete

**Permissions:** All routes use `payroll.manage` permission.

**Route registration** (`routes.go:1063`):
```
GET    /export-interfaces          -> List
POST   /export-interfaces          -> Create
GET    /export-interfaces/{id}     -> Get
PATCH  /export-interfaces/{id}     -> Update
DELETE /export-interfaces/{id}     -> Delete
PUT    /export-interfaces/{id}/accounts -> SetAccounts
GET    /export-interfaces/{id}/accounts -> ListAccounts
```

### 2.2 Payroll Exports

| Layer | File | Lines |
|-------|------|-------|
| Service | `apps/api/internal/service/payrollexport.go` | 516 |
| Handler | `apps/api/internal/handler/payrollexport.go` | 355 |
| Repository | `apps/api/internal/repository/payrollexport.go` | 121 |

**Service methods:** `Generate`, `GetByID`, `List`, `Delete`, `GetPreviewData`, `GetDownloadContent`

**Business logic (Generate):**
- Year must be > 0
- Month must be 1..12
- Cannot generate for future month
- Format validated: csv, xlsx, xml, json (default: csv)
- ExportType validated: standard, datev, sage, custom (default: standard)
- Creates record in "pending" status, then generates synchronously
- Gets employees via EmployeeFilter (active only, optional department/employee ID filters)
- Gets monthly values for each employee for the given year/month
- Builds CSV with semicolon delimiter
- On failure: sets status to "failed" with error message, still returns record (202 pattern)
- Stores file content in `file_content` text column

**Business logic (Preview):**
- Requires status == "completed"
- Re-generates lines from employee data (not from stored file)

**Business logic (Download):**
- Requires status == "completed" and file_content non-null
- Returns content, content-type, and filename based on format

**Dependencies (injected repos):**
- `payrollExportRepository` (own CRUD)
- `payrollMonthlyValueRepository` (GetByEmployeeMonth)
- `payrollEmployeeRepository` (List with EmployeeFilter)
- `payrollAccountRepository` (GetByID)
- `payrollExportInterfaceRepository` (GetByID, ListAccounts)

**Permissions:**
- List/GetByID/Download/Preview: `payroll.view`
- Generate/Delete: `payroll.manage`

**Route registration** (`routes.go:1087`):
```
GET    /payroll-exports               -> List
POST   /payroll-exports               -> Generate (returns 202)
GET    /payroll-exports/{id}          -> Get
DELETE /payroll-exports/{id}          -> Delete
GET    /payroll-exports/{id}/download -> Download
GET    /payroll-exports/{id}/preview  -> Preview
```

**Pagination:** Cursor-based (UUID cursor, limit 1-100, default 20, fetch limit+1 for hasMore)

### 2.3 Reports

| Layer | File | Lines |
|-------|------|-------|
| Service | `apps/api/internal/service/report.go` | 938 |
| Handler | `apps/api/internal/handler/report.go` | 294 |
| Repository | `apps/api/internal/repository/report.go` | 104 |

**Service methods:** `Generate`, `GetByID`, `List`, `Delete`, `GetDownloadContent`

**Business logic (Generate):**
- ReportType required and validated against 10 types (daily_overview, weekly_overview, monthly_overview, employee_timesheet, department_summary, absence_report, vacation_report, overtime_report, account_balances, custom)
- Format required and validated (json, csv, xlsx, pdf)
- Most report types require from_date and to_date
- Creates record in "pending" status, then generates synchronously
- Employee scoping: filters by department, cost center, team, specific employee IDs
- Report data gathered into `reportRow` (headers + values matrix)
- Generates output in 4 formats: CSV (semicolon), XLSX (excelize), PDF (fpdf), JSON
- File content stored as `[]byte` (BYTEA column)
- On failure: sets status to "failed", still returns record (202 pattern)

**Dependencies (injected repos):**
- `reportRepository` (own CRUD)
- `reportEmployeeRepository` (List with EmployeeFilter)
- `reportDailyValueRepository` (ListAll)
- `reportMonthlyValueRepository` (GetByEmployeeMonth)
- `reportAbsenceDayRepository` (ListAll)
- `reportVacationBalanceRepository` (GetByEmployeeYear)
- `reportTeamRepository` (List, GetMembers)

**Permissions:**
- List/GetByID/Download: `reports.view`
- Generate/Delete: `reports.manage`

**Route registration** (`routes.go:1110`):
```
GET    /reports               -> List
POST   /reports               -> Generate (returns 202)
GET    /reports/{id}          -> Get
DELETE /reports/{id}          -> Delete
GET    /reports/{id}/download -> Download
```

**Pagination:** Cursor-based, same pattern as payroll exports.

---

## 3. Database Schema

### 3.1 export_interfaces (migration 000059)

```sql
CREATE TABLE export_interfaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    interface_number INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    mandant_number VARCHAR(50),
    export_script VARCHAR(255),
    export_path VARCHAR(500),
    output_filename VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, interface_number)
);
```

### 3.2 export_interface_accounts (migration 000060)

```sql
CREATE TABLE export_interface_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    export_interface_id UUID NOT NULL REFERENCES export_interfaces(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(export_interface_id, account_id)
);
```

### 3.3 payroll_exports (migration 000061)

```sql
CREATE TABLE payroll_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    export_interface_id UUID REFERENCES export_interfaces(id) ON DELETE SET NULL,
    year INT NOT NULL,
    month INT NOT NULL CHECK (month >= 1 AND month <= 12),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
    export_type VARCHAR(20) DEFAULT 'standard'
        CHECK (export_type IN ('standard', 'datev', 'sage', 'custom')),
    format VARCHAR(10) DEFAULT 'csv'
        CHECK (format IN ('csv', 'xlsx', 'xml', 'json')),
    parameters JSONB DEFAULT '{}',
    file_content TEXT,
    file_size INT,
    row_count INT,
    employee_count INT,
    total_hours DECIMAL(12,2),
    total_overtime DECIMAL(12,2),
    error_message TEXT,
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.4 reports (migration 000066)

```sql
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    report_type VARCHAR(30) NOT NULL
        CHECK (report_type IN ('daily_overview', 'weekly_overview', 'monthly_overview',
            'employee_timesheet', 'department_summary', 'absence_report',
            'vacation_report', 'overtime_report', 'account_balances', 'custom')),
    name VARCHAR(255),
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
    format VARCHAR(10) NOT NULL DEFAULT 'xlsx'
        CHECK (format IN ('json', 'csv', 'xlsx', 'pdf')),
    parameters JSONB DEFAULT '{}',
    file_content BYTEA,
    file_size INT,
    row_count INT,
    error_message TEXT,
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. Prisma Schema Status

**Missing models that need to be added to `apps/web/prisma/schema.prisma`:**
- `ExportInterface` (maps to `export_interfaces`)
- `ExportInterfaceAccount` (maps to `export_interface_accounts`)
- `PayrollExport` (maps to `payroll_exports`)
- `Report` (maps to `reports`)

Relations needed:
- `Tenant` -> `ExportInterface[]`, `PayrollExport[]`, `Report[]`
- `ExportInterface` -> `ExportInterfaceAccount[]`, `PayrollExport[]`
- `ExportInterfaceAccount` -> `Account` relation
- `PayrollExport` -> `User` (createdBy) relation
- `Report` -> `User` (createdBy) relation

The schema ends at line 2155. The Tenant model (line 81-152) needs new relation fields added.

---

## 5. Permission Catalog

Relevant permissions already exist in `apps/web/src/server/lib/permission-catalog.ts`:

| Key | Description |
|-----|-------------|
| `payroll.manage` | "Manage payroll exports and interfaces" |
| `payroll.view` | "View payroll exports" |
| `reports.view` | "View reports" |
| `reports.manage` | "Generate and manage reports" |

Permission mapping from Go routes:
- **Export Interfaces:** all operations require `payroll.manage`
- **Payroll Exports:** list/get/download/preview require `payroll.view`; generate/delete require `payroll.manage`
- **Reports:** list/get/download require `reports.view`; generate/delete require `reports.manage`

---

## 6. Existing tRPC Router Patterns

### 6.1 Standard CRUD Pattern (from `shifts.ts`)

```typescript
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

const PERM = permissionIdByKey("some.permission")!

export const fooRouter = createTRPCRouter({
  list: tenantProcedure
    .use(requirePermission(PERM))
    .input(z.void().optional())
    .output(z.object({ data: z.array(outputSchema) }))
    .query(async ({ ctx }) => { ... }),

  getById: tenantProcedure
    .use(requirePermission(PERM))
    .input(z.object({ id: z.string().uuid() }))
    .output(outputSchema)
    .query(async ({ ctx, input }) => { ... }),

  create: tenantProcedure
    .use(requirePermission(PERM))
    .input(createInputSchema)
    .output(outputSchema)
    .mutation(async ({ ctx, input }) => { ... }),

  update: tenantProcedure
    .use(requirePermission(PERM))
    .input(updateInputSchema)
    .output(outputSchema)
    .mutation(async ({ ctx, input }) => { ... }),

  delete: tenantProcedure
    .use(requirePermission(PERM))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => { ... }),
})
```

### 6.2 Key Patterns
- All routers use `tenantProcedure` (auth + tenant validation)
- Permission checks via `.use(requirePermission(...))`
- Zod schemas for input/output validation
- Direct Prisma queries in procedure handlers (no separate service/repository layer)
- TRPCError with standard codes: `NOT_FOUND`, `BAD_REQUEST`, `CONFLICT`
- Tenant scoping: `where: { tenantId, ... }`

### 6.3 Root Router Registration (`apps/web/src/server/root.ts`)
New routers must be imported and added to `createTRPCRouter({...})` in root.ts.

---

## 7. Existing Frontend Hooks

### 7.1 Export Interfaces (`apps/web/src/hooks/api/use-export-interfaces.ts`)

**Hooks (86 lines):**
- `useExportInterfaces(options)` -- list, with `activeOnly` filter
- `useExportInterface(id)` -- get by ID
- `useExportInterfaceAccounts(id)` -- list accounts
- `useCreateExportInterface()` -- create mutation
- `useUpdateExportInterface()` -- update mutation
- `useDeleteExportInterface()` -- delete mutation
- `useSetExportInterfaceAccounts()` -- set accounts mutation

All use `useApiQuery`/`useApiMutation` (REST-based, from `@/hooks`).

**Frontend consumers:**
- `apps/web/src/app/[locale]/(dashboard)/admin/export-interfaces/page.tsx`
- `apps/web/src/components/export-interfaces/export-interface-detail-sheet.tsx`
- `apps/web/src/components/export-interfaces/account-mapping-dialog.tsx`
- `apps/web/src/components/export-interfaces/export-interface-form-sheet.tsx`

### 7.2 Payroll Exports (`apps/web/src/hooks/api/use-payroll-exports.ts`)

**Hooks (219 lines):**
- `usePayrollExports(options)` -- list with filters (year, month, status, limit, cursor) + refetchInterval polling for pending/generating status
- `usePayrollExport(id)` -- get by ID + refetchInterval polling
- `usePayrollExportPreview(id)` -- preview with manual `useQuery` (inline response type)
- `useExportInterfaces(enabled)` -- re-exports for generate dialog dropdown
- `useGeneratePayrollExport()` -- generate with manual `useMutation` (202 response)
- `useDeletePayrollExport()` -- delete mutation
- `useDownloadPayrollExport()` -- download with raw `fetch` (blob handling)

**Manual types defined:** `PayrollExportLine`, `PayrollExportPreview`, `PayrollExportStatus`

**Notable patterns:**
- Preview and Generate use manual `useQuery`/`useMutation` because `useApiMutation` only infers types from 200/201 (not 202)
- Download uses raw `fetch` because openapi-fetch cannot handle blob responses
- Polling via `refetchInterval` at 3000ms when status is pending/generating

**Frontend consumers:**
- `apps/web/src/app/[locale]/(dashboard)/admin/payroll-exports/page.tsx`
- `apps/web/src/components/payroll-exports/generate-export-dialog.tsx`
- `apps/web/src/components/payroll-exports/payroll-export-preview.tsx`
- `apps/web/src/components/payroll-exports/payroll-export-detail-sheet.tsx`

### 7.3 Reports (`apps/web/src/hooks/api/use-reports.ts`)

**Hooks (139 lines):**
- `useReports(options)` -- list with filters (reportType, status, limit, cursor) + refetchInterval polling
- `useReport(id)` -- get by ID + refetchInterval polling
- `useGenerateReport()` -- generate with manual `useMutation` (202 response)
- `useDeleteReport()` -- delete mutation
- `useDownloadReport()` -- download with raw `fetch` (blob)

**Notable patterns:** Same 202 and blob download patterns as payroll exports.

**Frontend consumers:**
- `apps/web/src/app/[locale]/(dashboard)/admin/reports/page.tsx`

### 7.4 Hook Exports (`apps/web/src/hooks/api/index.ts`)

All three hook files are exported from the central index:
- Lines 286-297: payroll exports and export interfaces
- Lines 312-317: reports

---

## 8. OpenAPI Spec Schemas

### 8.1 Export Interface Schemas (`api/schemas/export-interfaces.yaml`)
- `ExportInterface` -- full entity with accounts array
- `ExportInterfaceSummary` -- id, interface_number, name, is_active
- `ExportInterfaceAccount` -- account_id, account_code, account_name, payroll_code, sort_order
- `CreateExportInterfaceRequest` -- interface_number (required, min 1), name (required, min 1, max 255), mandant_number, export_script, export_path, output_filename
- `UpdateExportInterfaceRequest` -- all optional fields
- `ExportInterfaceList` -- { data: ExportInterface[] }
- `SetExportInterfaceAccountsRequest` -- { account_ids: uuid[] }

### 8.2 Payroll Export Schemas (`api/schemas/payroll-exports.yaml`)
- `PayrollExport` -- full entity with status enum, parameters object, timestamps
- `PayrollExportLine` -- employee_id, personnel_number, hours/days fields, account_values map
- `GeneratePayrollExportRequest` -- year, month, format (required); export_type, export_interface_id, parameters (optional)
- `PayrollExportList` -- { data: PayrollExport[], meta: PaginationMeta }

### 8.3 Report Schemas (`api/schemas/reports.yaml`)
- `Report` -- full entity with report_type enum, status enum, parameters, timestamps
- `GenerateReportRequest` -- report_type, format (required); name, parameters with from_date/to_date/employee_ids/department_ids/cost_center_ids/team_ids
- `ReportList` -- { data: Report[], meta: PaginationMeta }

---

## 9. Domain Models (Go)

### 9.1 ExportInterface (`apps/api/internal/model/exportinterface.go`)
- Fields: ID, TenantID, InterfaceNumber, Name, MandantNumber*, ExportScript*, ExportPath*, OutputFilename*, IsActive, CreatedAt, UpdatedAt
- Relation: `Accounts []ExportInterfaceAccount`
- Table: `export_interfaces`

### 9.2 ExportInterfaceAccount
- Fields: ID, ExportInterfaceID, AccountID, SortOrder, CreatedAt
- Relation: `Account *Account`
- Table: `export_interface_accounts`

### 9.3 PayrollExport (`apps/api/internal/model/payrollexport.go`)
- Status enum: pending, generating, completed, failed
- Type enum: standard, datev, sage, custom
- Format enum: csv, xlsx, xml, json
- Fields: ID, TenantID, ExportInterfaceID*, Year, Month, Status, ExportType, Format, Parameters (json.RawMessage), FileContent* (text), FileSize*, RowCount*, EmployeeCount, TotalHours (decimal), TotalOvertime (decimal), ErrorMessage*, RequestedAt, StartedAt*, CompletedAt*, CreatedBy*, CreatedAt, UpdatedAt
- Table: `payroll_exports`
- `PayrollExportParameters`: EmployeeIDs, DepartmentIDs, IncludeAccounts (all uuid arrays)
- `PayrollExportLine`: per-employee data with hours/days/account values

### 9.4 Report (`apps/api/internal/model/report.go`)
- Status enum: pending, generating, completed, failed
- Type enum: daily_overview, weekly_overview, monthly_overview, employee_timesheet, department_summary, absence_report, vacation_report, overtime_report, account_balances, custom
- Format enum: json, csv, xlsx, pdf
- Fields: ID, TenantID, ReportType, Name, Description*, Status, Format, Parameters (json.RawMessage), FileContent ([]byte), FileSize*, RowCount*, ErrorMessage*, RequestedAt, StartedAt*, CompletedAt*, CreatedBy*, CreatedAt, UpdatedAt
- Table: `reports`
- `ReportParameters`: FromDate*, ToDate*, EmployeeIDs, DepartmentIDs, CostCenterIDs, TeamIDs

---

## 10. Complexity Considerations

### 10.1 Payroll Export Generation
The Go service `generateExportData` (lines 180-306 of payrollexport.go) performs complex data aggregation:
- Lists active employees with optional department filter
- Filters by specific employee IDs
- Resolves account IDs from export interface if not explicitly provided
- For each employee, fetches monthly values and computes hours from minutes
- Builds CSV with semicolon delimiter and account code columns
- Tracks totals (target, worked, overtime)

This logic must be ported to the tRPC router. It requires access to multiple Prisma models that may not exist yet in the schema: MonthlyValue, DailyValue, AbsenceDay, VacationBalance.

### 10.2 Report Generation
The Go service `report.go` (938 lines) is the most complex:
- 10 report types, each with its own data gathering function
- 4 output formats (CSV, XLSX, PDF, JSON) with file generation
- Employee scoping logic (department, cost center, team, specific IDs)
- External library dependencies: `excelize/v2` (XLSX), `fpdf` (PDF)

For the tRPC implementation:
- CSV generation: can be done with basic string building
- XLSX: requires a Node.js library (e.g., `exceljs` or `xlsx`)
- PDF: requires a Node.js library (e.g., `pdfkit` or `pdfmake`)
- JSON: trivial with `JSON.stringify`

### 10.3 File Download
Both payroll exports and reports support file download. The current frontend hooks use raw `fetch` with blob handling for downloads. In tRPC, binary file responses are not natively supported. Options:
1. Keep the Go download endpoint active alongside tRPC (hybrid approach)
2. Return base64-encoded content from tRPC and handle in the client
3. Use a Next.js API route for file serving that reads from DB

### 10.4 Async/Polling Pattern
Both payroll exports and reports use an async generation pattern:
- POST returns 202 with the record in "pending" status
- Frontend polls via `refetchInterval` (3s) until status changes to "completed" or "failed"
- Current Go implementation generates synchronously despite the 202 pattern

For tRPC: The mutation can generate synchronously and return the completed record. The frontend polling pattern still works for future async generation.

---

## 11. Test Patterns

From `apps/web/src/server/__tests__/notifications-router.test.ts` and test helpers:

```typescript
import { createCallerFactory } from "../trpc"
import { someRouter } from "../routers/someRouter"
import { createMockContext, createMockSession, createMockUser, createMockUserTenant } from "./helpers"

const createCaller = createCallerFactory(someRouter)

// Mock Prisma methods via ctx.prisma
function createTestContext(prisma) {
  return createMockContext({
    prisma: prisma as unknown as TRPCContext["prisma"],
    user: createMockUser({ ... }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}
```

---

## 12. main.go Registration (Go)

Lines 329-343 of `apps/api/cmd/server/main.go`:
```go
// Initialize Export Interface
exportInterfaceRepo := repository.NewExportInterfaceRepository(db)
exportInterfaceService := service.NewExportInterfaceService(exportInterfaceRepo)
exportInterfaceHandler := handler.NewExportInterfaceHandler(exportInterfaceService)

// Initialize Payroll Export
payrollExportRepo := repository.NewPayrollExportRepository(db)
payrollExportService := service.NewPayrollExportService(payrollExportRepo, monthlyValueRepo, employeeRepo, accountRepo, exportInterfaceRepo)
payrollExportHandler := handler.NewPayrollExportHandler(payrollExportService)

// Initialize Report
reportRepo := repository.NewReportRepository(db)
reportService := service.NewReportService(reportRepo, employeeRepo, dailyValueRepo, monthlyValueRepo, absenceDayRepo, vacationBalanceRepo, teamRepo)
reportHandler := handler.NewReportHandler(reportService)
```

Lines 570-572: Route registration within tenant-scoped routes.
Line 472: `exportInterfaceHandler.SetAuditService(auditLogService)` (only export interfaces have audit logging).

---

## 13. File Inventory

### Go files to be replaced:
1. `apps/api/internal/service/exportinterface.go` (209 lines)
2. `apps/api/internal/handler/exportinterface.go` (351 lines)
3. `apps/api/internal/repository/exportinterface.go` (193 lines)
4. `apps/api/internal/service/payrollexport.go` (516 lines)
5. `apps/api/internal/handler/payrollexport.go` (355 lines)
6. `apps/api/internal/repository/payrollexport.go` (121 lines)
7. `apps/api/internal/service/report.go` (938 lines)
8. `apps/api/internal/handler/report.go` (294 lines)
9. `apps/api/internal/repository/report.go` (104 lines)

### Go model files (remain, tables still exist):
1. `apps/api/internal/model/exportinterface.go` (47 lines)
2. `apps/api/internal/model/payrollexport.go` (130 lines)
3. `apps/api/internal/model/report.go` (119 lines)

### Frontend hooks to be migrated:
1. `apps/web/src/hooks/api/use-export-interfaces.ts` (86 lines)
2. `apps/web/src/hooks/api/use-payroll-exports.ts` (219 lines)
3. `apps/web/src/hooks/api/use-reports.ts` (139 lines)

### New files to create:
1. `apps/web/prisma/schema.prisma` -- add 4 models
2. `apps/web/src/server/routers/exportInterfaces.ts` -- new tRPC router
3. `apps/web/src/server/routers/payrollExports.ts` -- new tRPC router
4. `apps/web/src/server/routers/reports.ts` -- new tRPC router
5. `apps/web/src/server/root.ts` -- register 3 new routers

### Files to update:
1. `apps/web/src/hooks/api/use-export-interfaces.ts` -- migrate to tRPC
2. `apps/web/src/hooks/api/use-payroll-exports.ts` -- migrate to tRPC
3. `apps/web/src/hooks/api/use-reports.ts` -- migrate to tRPC
4. `apps/web/src/hooks/api/index.ts` -- update exports if needed

---

## 14. Key Decisions Required

1. **Payroll export generation complexity:** The Go service queries employees, monthly values, accounts, and builds CSV. The tRPC router will need to replicate this. The related Prisma models (Employee, MonthlyValue, Account) already exist in the schema.

2. **Report generation complexity:** The Go service has 10 report types and 4 output formats (CSV, XLSX, PDF, JSON). The XLSX and PDF generation requires Node.js libraries that may not be in the project dependencies yet.

3. **File download handling in tRPC:** tRPC does not natively support binary file streaming. A decision is needed on how to serve file downloads.

4. **Async pattern:** The current Go implementation generates synchronously despite the 202 pattern. The tRPC implementation can follow the same approach.

5. **Prisma models for related data:** PayrollExport generation needs MonthlyValue, Employee, Account models. Report generation needs DailyValue, MonthlyValue, AbsenceDay, VacationBalance, Team, TeamMember models. These already exist in Prisma schema.
