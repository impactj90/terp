---
date: "2026-03-20T12:00:00+01:00"
researcher: Claude
git_commit: 77d4db97e40589e29a617337c8ea3061faa42254
branch: staging
repository: terp
topic: "Audit Logging: Is it properly set up and working?"
tags: [research, codebase, audit-logging, audit-logs, compliance]
status: complete
last_updated: "2026-03-20"
last_updated_by: Claude
---

# Research: Audit Logging — Is it properly set up and working?

**Date**: 2026-03-20
**Researcher**: Claude
**Git Commit**: 77d4db97
**Branch**: staging
**Repository**: terp

## Research Question
Is audit logging properly set up and working accordingly?

## Summary

The audit logging system has a **complete read stack** (database table, Prisma model, repository, service, tRPC router, React hook, UI components, admin page) but **no write path exists in the TypeScript codebase**. The write path existed in the former Go backend (`apps/api/internal/service/auditlog.go`) and was never ported. No service in the TypeScript codebase creates audit log entries — there are zero `prisma.auditLog.create` calls, zero `INSERT INTO audit_logs` statements, and no database triggers that write to the `audit_logs` table.

The `audit_logs` table will contain historical data written by the Go backend, and the read/viewer infrastructure works correctly for displaying that data. But any mutations performed through the current TypeScript-based tRPC services do **not** produce audit log entries.

## Detailed Findings

### 1. Database Schema

**Migration**: `supabase/migrations/20260101000041_create_audit_logs.sql`

The `audit_logs` table stores:
- `id` (UUID PK), `tenant_id`, `user_id` (FK → users, ON DELETE SET NULL)
- `action` (VARCHAR 20) — e.g., create, update, delete, approve, reject, close, reopen, export, import, login, logout
- `entity_type` (VARCHAR 100), `entity_id` (UUID), `entity_name` (TEXT)
- `changes` (JSONB) — before/after change set
- `metadata` (JSONB) — arbitrary extra context
- `ip_address`, `user_agent` (TEXT)
- `performed_at` (TIMESTAMPTZ)

Five indexes cover: `tenant_id`, `user_id`, `(entity_type, entity_id)`, `action`, `performed_at`.

No database triggers write to this table. The only triggers in the migration suite are `update_updated_at_column()` triggers (attached to ~45 tables) and a user provisioning trigger — neither writes audit logs.

### 2. Prisma Model

**File**: `prisma/schema.prisma:2682-2706`

The `AuditLog` model maps to `audit_logs` with all columns above. It has a Prisma relation to `User` (for joins) but references entities generically via `entityType` + `entityId` strings (no FK to specific entity tables).

### 3. Repository (Read-Only)

**File**: `src/lib/services/audit-logs-repository.ts`

Exports three functions — all reads:
- `findMany(prisma, tenantId, params?)` — paginated list with filters (userId, entityType, entityId, action, fromDate, toDate)
- `count(prisma, tenantId, params?)` — count with same filters
- `findById(prisma, tenantId, id)` — single lookup

There is **no `create` function** in this repository.

### 4. Service (Read-Only)

**File**: `src/lib/services/audit-logs-service.ts`

The file comment at line 5 says: *"Audit log creation is internal only (called by other services)."* However, no create function is defined in this file, and no other service in the codebase calls any audit log creation function.

Exports:
- `list(prisma, tenantId, params?)` — calls repo.findMany + repo.count, maps output
- `getById(prisma, tenantId, id)` — calls repo.findById, throws `AuditLogNotFoundError` if missing

### 5. tRPC Router (Read-Only)

**File**: `src/trpc/routers/auditLogs.ts`

Two procedures:
- `auditLogs.list` — query, requires `users.manage` OR `reports.view` permission
- `auditLogs.getById` — query, same permissions

The router comment at line 5 repeats: *"Audit log creation is internal only (called by other services)."* The comment at line 11 references the former Go service: `@see apps/api/internal/service/auditlog.go`.

### 6. Direct Audit Log Queries (Bypassing Service Layer)

Two places query `prisma.auditLog.findMany` directly, bypassing the audit logs service:

**Bookings router** (`src/trpc/routers/bookings.ts:453-461`):
- `bookings.getLogs` procedure queries audit logs scoped to `entityType: "booking"` for a specific booking ID

**Evaluations repository** (`src/lib/services/evaluations-repository.ts:266-357`):
- `findLogs()` — general audit log query for the evaluations view, with date range filters
- `findWorkflowHistory()` — defaults to entity types `["absence", "monthly_value"]` and actions `["create", "approve", "reject", "close", "reopen"]`

### 7. Frontend Stack

Complete UI infrastructure exists:

- **Hook**: `src/hooks/use-audit-logs.ts` — wraps `auditLogs.list` and `auditLogs.getById`
- **Components** (`src/components/audit-logs/`):
  - `audit-log-data-table.tsx` — data table with action badges (color-coded by action type)
  - `audit-log-detail-sheet.tsx` — slide-over sheet showing entry details
  - `audit-log-filters.tsx` — filter controls (action, entity type, user, date range)
  - `audit-log-json-diff.tsx` — before/after JSON diff renderer
  - `audit-log-skeleton.tsx` — loading skeleton
- **Page**: `src/app/[locale]/(dashboard)/admin/audit-logs/page.tsx` — admin page with URL-synced filters, "load more" pagination, default 24-hour date range
- **Navigation**: audit logs entry in sidebar config

### 8. Absence of Write Path — Verification

Searches performed:
- `prisma.auditLog.create` — **zero results** across entire `src/` directory
- `INSERT INTO audit_logs` — **zero results** across entire `supabase/` directory
- No tRPC middleware intercepts mutations to write audit entries
- No database triggers write to `audit_logs`

The audit log write path existed in the Go backend's `AuditLogService.Log()` function, which was a fire-and-forget call (errors swallowed) that extracted user ID from auth context, IP/user-agent from HTTP request, and serialized changes/metadata to JSON. This function has not been ported to TypeScript.

### 9. Actor-Stamping Fields (Partial Audit Trail)

Several models have `createdById` / `updatedBy` / `approvedBy` / `closedById` fields that record *who* performed an action, but these are simple UUID columns — not full audit trails with before/after change sets.

Models with actor-stamping include: `CrmAddress`, `CrmCorrespondence`, `CrmInquiry`, `CrmTask`, `BillingDocument`, `BillingServiceCase`, `BillingPayment`, `Booking`, `AbsenceDay`, `Correction`, `OrderBooking`, `PayrollExport`, `Report`.

### 10. `updated_at` Triggers

A shared `update_updated_at_column()` trigger function is defined in `supabase/migrations/20260101000001_create_users.sql` and attached as `BEFORE UPDATE` triggers on ~45 tables. This automatically updates `updated_at` timestamps but does not write to the `audit_logs` table.

## Code References

- `supabase/migrations/20260101000041_create_audit_logs.sql` — Database table DDL
- `prisma/schema.prisma:2682-2706` — Prisma AuditLog model
- `src/lib/services/audit-logs-repository.ts` — Read-only repository (findMany, count, findById)
- `src/lib/services/audit-logs-service.ts` — Read-only service (list, getById)
- `src/trpc/routers/auditLogs.ts` — Read-only tRPC router (list, getById)
- `src/trpc/routers/bookings.ts:453-461` — Direct auditLog query in bookings router
- `src/lib/services/evaluations-repository.ts:266-357` — Direct auditLog queries (findLogs, findWorkflowHistory)
- `src/hooks/use-audit-logs.ts` — React hooks
- `src/components/audit-logs/` — UI components (6 files)
- `src/app/[locale]/(dashboard)/admin/audit-logs/page.tsx` — Admin audit log viewer page
- `src/trpc/routers/__tests__/auditLogs-router.test.ts` — Router unit tests
- `src/types/legacy-api-types.ts:7172` — Action type enum definition

## Architecture Documentation

The audit logging system follows the standard service + repository pattern for its read path:

```
Admin Page → useAuditLogs hook → auditLogs.list tRPC → audit-logs-service.list → audit-logs-repository.findMany → prisma.auditLog.findMany
```

Authorization requires either `users.manage` or `reports.view` permission.

The intended write path (never ported from Go) was:
```
Any Service mutation → auditLogService.create(action, entityType, entityId, changes, metadata) → prisma.auditLog.create
```

The evaluations module has its own separate audit log read path that bypasses the audit logs service, querying `prisma.auditLog` directly with a different include shape.

## Historical Context (from thoughts/)

- `thoughts/shared/tickets/ZMI-TICKET-034-audit-logging.md` — Original ticket requiring audit logs for bookings, absences, time plans, and accounts. Acceptance criteria: "All relevant changes generate audit logs with correct before/after values." Status: Proposed.
- `thoughts/shared/tickets/ZMI-TICKET-053-audit-log-viewer-ui.md` — UI viewer ticket (implemented)
- `thoughts/shared/plans/2026-02-04-ZMI-TICKET-053-audit-log-viewer-ui.md` — Implementation plan for the viewer UI
- `thoughts/shared/tickets/ZMI-TICKET-221-systemsettings-auditlogs-notifications.md` — Router migration ticket that included audit logs

## Open Questions

1. What data currently exists in the `audit_logs` table? (Written by the former Go backend — the volume and recency of entries determines whether the viewer is useful today)
2. Is the intent to port the Go backend's `AuditLogService.Log()` write path to TypeScript, or to implement a new approach (e.g., Prisma middleware, tRPC middleware)?
3. ZMI-TICKET-034's acceptance criteria ("All relevant changes generate audit logs") is not met by the current TypeScript codebase — is there a follow-up ticket for implementing the write path?
