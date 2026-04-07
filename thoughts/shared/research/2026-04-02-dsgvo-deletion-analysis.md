---
date: 2026-04-02T12:00:00+02:00
researcher: Claude
git_commit: b626aba7fc844d5e4b51bb2aec71083c27ecbf3b
branch: staging
repository: terp
topic: "DSGVO Deletion System — Does it filter by inactive employees? What data does it delete?"
tags: [research, codebase, dsgvo, data-retention, gdpr, security]
status: complete
last_updated: 2026-04-02
last_updated_by: Claude
---

# Research: DSGVO Deletion System Analysis

**Date**: 2026-04-02T12:00:00+02:00
**Researcher**: Claude
**Git Commit**: b626aba7fc844d5e4b51bb2aec71083c27ecbf3b
**Branch**: staging
**Repository**: terp

## Research Question

How does the DSGVO deletion system work? Does it look for inactive employees, and is it not deleting sensitive or especially relevant data?

## Summary

The DSGVO deletion system is **purely time-based and tenant-scoped**. It does **NOT** filter by employee active status. Every count, delete, and anonymize operation filters only on `tenantId` + a date field (e.g., `bookingDate < cutoffDate`). Records belonging to active employees whose dates fall before the cutoff are treated identically to records belonging to inactive employees.

The system covers 9 data types, offers configurable retention periods per type per tenant, supports both DELETE and ANONYMIZE actions, has legal minimum warnings for German law (HGB/AO), and includes a 3-step UI confirmation flow before manual execution. All rules default to `isActive: false`, so nothing runs without explicit admin activation. The cron job is also suspended by default (not in `vercel.json`).

## Detailed Findings

### 1. Architecture Overview

| Layer | File | Role |
|-------|------|------|
| Service | `src/lib/services/dsgvo-retention-service.ts` | Business logic, validation, orchestration |
| Repository | `src/lib/services/dsgvo-retention-repository.ts` | Pure Prisma data access |
| Router | `src/trpc/routers/dsgvo.ts` | tRPC procedures (thin wrapper) |
| Cron | `src/app/api/cron/dsgvo-retention/route.ts` | Vercel cron endpoint |
| Hooks | `src/hooks/use-dsgvo.ts` | React hooks wrapping tRPC |
| UI | `src/components/dsgvo/*.tsx` | Admin interface |
| Page | `src/app/[locale]/(dashboard)/admin/dsgvo/page.tsx` | Admin DSGVO page |

### 2. Deletion Scope — Purely Time-Based (Critical Finding)

**Every** repository function applies exactly two filters:
1. `tenantId` (tenant isolation)
2. A date field compared to the cutoff date

No function filters by `isActive`, `employeeId`, or any join to the `Employee` table.

| Function | Date Filter | Employee Filter? |
|----------|-------------|-----------------|
| `countBookings` / `deleteBookings` | `bookingDate < cutoffDate` | None |
| `countDailyValues` / `deleteDailyValues` | `valueDate < cutoffDate` | None |
| `countAbsences` / `anonymizeAbsences` | `absenceDate < cutoffDate` | None |
| `countMonthlyValues` / `deleteMonthlyValues` | `year/month < cutoff` | None |
| `countAuditLogs` / `deleteAuditLogs` | `performedAt < cutoffDate` | None |
| `countTerminalBookings` / `deleteTerminalBookings` | `bookingDate < cutoffDate` | None |
| `countPersonnelFileEntries` / `deletePersonnelFileEntries` | `entryDate < cutoffDate` | None |
| `countCorrectionMessages` / `deleteCorrectionMessages` | `createdAt < cutoffDate` | None |
| `countStockMovements` / `anonymizeStockMovements` | `date < cutoffDate` | None |

**Note**: Most of these models DO have an `employeeId` FK to the `Employee` table (Booking, DailyValue, AbsenceDay, MonthlyValue, HrPersonnelFileEntry), but the DSGVO queries never use it.

### 3. Data Types and Default Retention Periods

| Data Type | Default Months | Default Action | Legal Minimum | Description |
|-----------|---------------|----------------|---------------|-------------|
| BOOKINGS | 36 | DELETE | — | Stempelbuchungen (Kommen/Gehen) |
| DAILY_VALUES | 36 | DELETE | — | Tageswerte (berechnete Zeiten) |
| ABSENCES | 36 | ANONYMIZE | — | Abwesenheiten (Urlaub, Krank etc.) |
| MONTHLY_VALUES | 60 | DELETE | 60 months (5yr tax) | Monatswerte (Konten, Flexzeit) |
| AUDIT_LOGS | 24 | DELETE | — | Audit-Protokoll |
| TERMINAL_BOOKINGS | 12 | DELETE | — | Terminal-Rohdaten |
| PERSONNEL_FILE | 120 | DELETE | 120 months (10yr employment law) | Personalakten-Eintraege |
| CORRECTION_MESSAGES | 12 | DELETE | — | Korrekturassistent-Meldungen |
| STOCK_MOVEMENTS | 120 | ANONYMIZE | 120 months (10yr HGB/AO) | Lagerbewegungen |

### 4. Anonymization Details

Only two data types support ANONYMIZE:

**ABSENCES** — nulls out: `notes`, `approvedBy`, `createdBy`, `rejectionReason`. Keeps: `absenceDate`, `absenceTypeId`, `employeeId`, `status` (the factual absence record remains, but personal annotations are removed).

**STOCK_MOVEMENTS** — nulls out: `createdById`, `notes`, `reason`. Keeps: `articleId`, `warehouseId`, `quantity`, `type`, `date` (the movement record remains, but person-identifying fields are removed).

### 5. Safety Measures

#### Service Layer
- Minimum retention: 6 months enforced (`MINIMUM_RETENTION_MONTHS = 6`)
- Legal warnings: Service computes and returns warnings when configured months < legal minimum
- Dry-run support: Counts records without deleting
- Execution logging: Every execution creates a `DsgvoDeleteLog` entry with tenant, dataType, action, recordCount, cutoffDate, executedBy, durationMs, and any error
- Rules default to inactive: `isActive: false` — nothing runs without explicit activation

#### UI Layer (3-Step Confirmation)
1. **Step 1**: Preview table showing affected record counts per data type (only rows with count > 0)
2. **Step 2**: Checkbox acknowledging irreversibility (button disabled until checked)
3. **Step 3**: Type exact confirmation word from translation key (button disabled until exact match)
4. **Step 4**: Results table showing what was actually processed

Legal warning badges appear inline in the rules table when retention months are below legal minimums.

#### Cron Job
- Suspended by default — not registered in `vercel.json`
- Requires `CRON_SECRET` env variable
- Runs sequentially per tenant (no parallel execution)
- Logs start/complete/errors per tenant

### 6. Permission Model

Three permissions exist:
- `dsgvo.view` — View rules and logs
- `dsgvo.manage` — Edit retention rules
- `dsgvo.execute` — Execute data deletion

Only `PERSONAL` and `ADMIN` system groups receive these permissions. Regular users/supervisors do not.

### 7. Personnel File Storage Cleanup

When PERSONNEL_FILE deletion runs, the service:
1. Finds attachment storage paths from `HrPersonnelFileAttachment` records where `entry.entryDate < cutoffDate`
2. Calls `storage.removeBatched("hr-personnel-files", paths)` to delete files from Supabase Storage in batches of 1000
3. Deletes DB records (attachments cascade-delete via FK)

Storage cleanup is best-effort — errors are logged but don't block DB deletion.

### 8. Cron Job Flow

The cron endpoint (`/api/cron/dsgvo-retention`):
1. Validates `CRON_SECRET` from Authorization header
2. Finds all active tenants (`isActive: true`)
3. Loops sequentially over each tenant, calling `executeRetention(prisma, tenant.id, { dryRun: false })`
4. Returns JSON summary with per-tenant results

### 9. What Data Is NOT Touched

The DSGVO system does NOT delete:
- **Employees** themselves (master data)
- **Departments**, **Teams**, **Cost Centers** (organizational structure)
- **Tariffs**, **Employment Types** (configuration)
- **Shifts**, **Macros** (scheduling config)
- **Vacation balances** (separate from monthly values)
- **Order assignments/bookings** (billing/project data)
- **CRM data** (addresses, correspondence, tasks)
- **Billing documents** (invoices, quotes)
- **Warehouse articles** (only stock movements are targeted)
- **Access profiles/zones** (physical access configuration)
- **User accounts**, **User groups** (auth/RBAC)

## Code References

- `src/lib/services/dsgvo-retention-service.ts:16-26` — VALID_DATA_TYPES constant
- `src/lib/services/dsgvo-retention-service.ts:30-34` — LEGAL_MINIMUM_MONTHS map
- `src/lib/services/dsgvo-retention-service.ts:36-39` — ANONYMIZABLE_TYPES set
- `src/lib/services/dsgvo-retention-service.ts:242-360` — executeRetention (main execution logic)
- `src/lib/services/dsgvo-retention-service.ts:401-437` — countAffectedRecords switch
- `src/lib/services/dsgvo-retention-service.ts:439-478` — deleteRecords switch
- `src/lib/services/dsgvo-retention-service.ts:480-496` — anonymizeRecords switch
- `src/lib/services/dsgvo-retention-repository.ts:81-176` — All count functions (time-based only)
- `src/lib/services/dsgvo-retention-repository.ts:182-276` — All delete functions (time-based only)
- `src/lib/services/dsgvo-retention-repository.ts:282-311` — Anonymize functions
- `src/app/api/cron/dsgvo-retention/route.ts:1-100` — Cron endpoint
- `src/components/dsgvo/retention-preview-dialog.tsx` — 3-step confirmation UI
- `src/components/dsgvo/retention-rules-table.tsx` — Rules editor with legal warnings

## Architecture Documentation

The DSGVO system follows the standard service + repository pattern:

```
tRPC Router (dsgvo.ts) → Service (dsgvo-retention-service.ts) → Repository (dsgvo-retention-repository.ts)
                                                                      ↓
                                                                 Prisma ORM → PostgreSQL
                                                                      +
                                                             Supabase Storage (for personnel files)
```

All rules are per-tenant (unique constraint on `tenant_id + data_type`). The cron job iterates tenants sequentially. Manual execution passes through `requirePermission(DSGVO_EXECUTE)` middleware.

## Historical Context (from thoughts/)

- `thoughts/shared/tickets/orgAuftrag/TICKET_SYS_01_DSGVO_LOESCHUNG.md` — Original ticket specification
- `thoughts/shared/plans/2026-03-27-SYS_01-dsgvo-loeschung.md` — Implementation plan
- `thoughts/shared/research/2026-03-27-SYS_01-dsgvo-loeschung.md` — Pre-implementation research

## Open Questions

1. **Employee status filtering**: The system does not distinguish between active and inactive employees. An active employee's 4-year-old booking is treated identically to an inactive employee's. This is by design per DSGVO (retention is time-based, not status-based), but operators should be aware that old data for current employees will also be affected.

2. **Vacation balances**: These are not included in the 9 data types. If vacation balance records contain personal data older than retention thresholds, they would not be cleaned up.

3. **Employee contacts / emergency contacts**: Not included in the deletion scope.

4. **The cron job is not active**: It's commented out of `vercel.json`, meaning automated monthly retention is not currently running. Only manual execution via the admin UI is available.
