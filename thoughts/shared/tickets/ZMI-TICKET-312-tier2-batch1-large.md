# ZMI-TICKET-312: Extract Services — Tier 2 Batch 1 (Large Routers)

Status: Todo
Priority: P1
Depends on: ZMI-TICKET-303

## Goal
Extract service + repository layers for: holidays (553 lines), corrections (576 lines), payrollExports (611 lines).

## Routers (3 total)

### holidays.ts (553 lines)
- Permission: `holidays.read`, `holidays.write`
- Model: `Holiday`
- **Complex features:**
  - `generate` — auto-generate German public holidays for a year (uses holiday-calendar lib)
  - `copy` — copy holidays from one year to another
  - `categoryOverrides` — per-location holiday category overrides
- **Repository:**
  - `findMany(prisma, tenantId, params)` — filter by year, location
  - `create`, `update`, `delete` — standard CRUD
  - `bulkCreate(prisma, tenantId, holidays[])` — for generate/copy
  - `findCategoryOverrides(prisma, tenantId, holidayId)`
  - `upsertCategoryOverride(prisma, tenantId, data)`
- **Service:**
  - `generateHolidays(prisma, tenantId, year, locationId)` — uses holiday-calendar.ts
  - `copyHolidays(prisma, tenantId, fromYear, toYear)`
  - Error classes: `HolidayNotFoundError`, `DuplicateHolidayError`

### corrections.ts (576 lines)
- Permission: `corrections.read`, `corrections.write`
- Model: `Correction`, `CorrectionMessage`
- **Complex features:**
  - Correction lifecycle: create → messages → resolve
  - Message threading (add/update messages on a correction)
  - Employee-scoped access (own corrections vs all)
- **Repository:**
  - `findMany(prisma, tenantId, params)` — with employee filter, status filter
  - `findById(prisma, tenantId, id)` — includes messages + employee
  - `create(prisma, tenantId, data)` — creates correction with initial message
  - `addMessage(prisma, tenantId, correctionId, message)`
  - `updateMessage(prisma, tenantId, messageId, data)`
  - `resolve(prisma, tenantId, correctionId)`
- **Service:**
  - Message ownership validation
  - Status transition validation (can't add to resolved)
  - Error classes: `CorrectionNotFoundError`, `MessageNotFoundError`, `CorrectionAlreadyResolvedError`

### payrollExports.ts (611 lines)
- Permission: `payroll_exports.read`, `payroll_exports.write`
- Model: `PayrollExport`
- **Complex features:**
  - `generate` — generates payroll export for a period
  - Uses export interface configuration
  - File/data generation logic
  - List past exports with download
- **Repository:**
  - `findMany(prisma, tenantId, params)` — paginated list
  - `findById(prisma, tenantId, id)`
  - `create(prisma, tenantId, data)` — stores generated export
  - `getExportInterfaceWithAccounts(prisma, tenantId, interfaceId)`
- **Service:**
  - `generatePayrollExport(prisma, tenantId, params)` — main generation logic
  - Period validation, employee selection
  - Error classes: `ExportInterfaceNotFoundError`, `InvalidPeriodError`

## Files Created (~6)
- `src/lib/services/holiday-service.ts` + `holiday-repository.ts`
- `src/lib/services/correction-service.ts` + `correction-repository.ts`
- `src/lib/services/payroll-export-service.ts` + `payroll-export-repository.ts`

## Verification
```bash
make typecheck
make test        # Especially any holiday tests
```
