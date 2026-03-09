# ZMI-TICKET-319: Extract Services — reports (974 lines)

Status: Todo
Priority: P1
Depends on: ZMI-TICKET-303

## Goal
Extract service + repository layers for the reports router. This handles report generation, template management, and file creation.

## Current Router Analysis (src/server/routers/reports.ts — 974 lines)

### Procedures
- `reports.list` — list generated reports
- `reports.getById` — single report with download info
- `reports.generate` — generate a new report from template + parameters
- `reports.delete` — delete generated report
- `reports.getTemplates` — list available report templates

### Key Business Logic
- Report generation from templates with date range + employee filters
- Multiple report formats (PDF, Excel, CSV)
- Data aggregation from daily values, monthly values, bookings, absences
- Template configuration (which columns, grouping, sorting)
- File storage/retrieval for generated reports

## Implementation

### Repository: `src/lib/services/report-repository.ts`
```typescript
export async function findMany(prisma, tenantId, params)
export async function findById(prisma, tenantId, id)
export async function create(prisma, tenantId, data)
export async function remove(prisma, tenantId, id)
// Data fetching for report generation:
export async function findDailyValuesForReport(prisma, tenantId, params)
export async function findMonthlyValuesForReport(prisma, tenantId, params)
export async function findBookingsForReport(prisma, tenantId, params)
export async function findAbsencesForReport(prisma, tenantId, params)
export async function findEmployeesForReport(prisma, tenantId, params)
```

### Service: `src/lib/services/report-service.ts`
```typescript
export class ReportNotFoundError extends Error { ... }
export class InvalidReportParametersError extends Error { ... }

export async function list(prisma, tenantId, params)
export async function getById(prisma, tenantId, id)
export async function generate(prisma, tenantId, params)
  // 1. Validate parameters
  // 2. Fetch data from multiple sources
  // 3. Apply template formatting
  // 4. Generate output file
  // 5. Store and return report record
export async function remove(prisma, tenantId, id)
export function getTemplates()
```

## Files Created
- `src/lib/services/report-service.ts`
- `src/lib/services/report-repository.ts`

## Verification
```bash
make typecheck
make test
```
