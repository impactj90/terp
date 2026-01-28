# Manager Approvals Dashboard Implementation Plan

## Overview
Implement a manager (admin) approvals dashboard for timesheets and absence requests with bulk actions, rejection reasons, history, filters, and decision notifications.

## Current State Analysis
- `/admin/approvals` exists and handles absence approvals with pending + history tabs only; no timesheet tab, no bulk actions, no team/date filters, no decision notifications.
- Absence approval APIs (`GET /absences`, `POST /absences/{id}/approve|reject`) are implemented with service/repo support.
- Daily values lack approval status in DB/model, and there is no `/daily-values` list or `/daily-values/{id}/approve` handler.
- Notifications UI is placeholder-only; no backend notification system.

## Desired End State
- Approvals page shows two tabs: Timesheets and Absences.
- Pending items grouped by type with counts; default sort oldest first.
- Rows show employee details and allow expand for additional info.
- Approve updates status immediately; reject requires reason.
- Bulk approve works for selected items.
- History of approved/rejected (absences) and approved (timesheets) is accessible via status filters.
- Team and date range filters work.
- Decision notifications are shown (UI toast).

### Key Discoveries
- Absence approvals already implemented in backend and used in the existing approvals page.
- Daily values approvals require adding a status field and endpoints.
- Roles are only `user` and `admin`; no manager role.

## What We're NOT Doing
- Adding a new manager role or changing authorization model.
- Building a full notifications backend or persistent notification center.
- Implementing bulk approval endpoints server-side (client will call per-item endpoints).

## Implementation Approach
- Extend daily values data model with a status field and map calculation outcomes to `calculated` or `error`.
- Implement daily values list + approve endpoints with filtering and employee preloads.
- Update approvals UI to include timesheet tab, filters, bulk actions, selection, and expandable details.
- Implement UI-level notifications via toast-style component for decisions.

## Phase 1: Backend - Daily Value Status + API Endpoints

### Overview
Add daily value approval status, support list/approve endpoints, and align response mapping.

### Changes Required

#### 1) Database migration
**File**: `db/migrations/000034_add_daily_values_status.up.sql`
**Changes**:
- Add `status` column to `daily_values` with default `calculated`.
- Backfill existing rows: `error` when `has_error = true`, else `calculated`.

**File**: `db/migrations/000034_add_daily_values_status.down.sql`
**Changes**:
- Drop `status` column.

#### 2) DailyValue model
**File**: `apps/api/internal/model/dailyvalue.go`
**Changes**:
- Add `DailyValueStatus` enum.
- Add `Status` field with default `calculated`.

#### 3) Daily calculation status assignment
**File**: `apps/api/internal/service/daily_calc.go`
**Changes**:
- Ensure all DailyValue constructors set `Status` to `error` when `HasError`, else `calculated`.
- Update `resultToDailyValue` and special-case constructors.

#### 4) Repository: ListAll support
**File**: `apps/api/internal/repository/dailyvalue.go`
**Changes**:
- Add `ListAll` with filters (employee_id, status, from/to, has_errors) and preload `Employee`.
- Include `status` in Upsert/BulkUpsert update columns.

#### 5) Service: list + approve
**File**: `apps/api/internal/service/dailyvalue.go` (new)
**Changes**:
- Add list method (pass-through to repo).
- Add approve method that rejects values with errors and updates status to `approved`.

#### 6) Handler + routes
**Files**:
- `apps/api/internal/handler/dailyvalue.go` (new)
- `apps/api/internal/handler/routes.go`
- `apps/api/cmd/server/main.go`

**Changes**:
- Add `GET /daily-values` with filters.
- Add `POST /daily-values/{id}/approve` with error checks.
- Register routes in server.

#### 7) Response mapping updates
**File**: `apps/api/internal/handler/booking.go`
**Changes**:
- Use `dv.Status` instead of deriving from `HasError`.

#### 8) Dev seed updates
**File**: `apps/api/internal/handler/auth.go`
**Changes**:
- Set `Status` on dev daily values based on `HasError`.

### Success Criteria

#### Automated Verification:
- [ ] `make test`

#### Manual Verification:
- [ ] `GET /daily-values?status=calculated` returns results with employee details.
- [ ] `POST /daily-values/{id}/approve` rejects if `has_error = true`.
- [ ] Approved daily values return `status=approved` on subsequent fetch.

**Implementation Note**: After completing this phase and automated verification, pause for manual confirmation before proceeding.

---

## Phase 2: Frontend - Hooks + Approval UI

### Overview
Add admin timesheet approvals UI, filters, bulk actions, and notifications. Update absence approvals UI to support bulk and filters.

### Changes Required

#### 1) API hooks
**File**: `apps/web/src/hooks/api/use-daily-values.ts`
**Changes**:
- Add `useAllDailyValues` (GET `/daily-values`).
- Add `useApproveDailyValue` mutation.

**File**: `apps/web/src/hooks/api/index.ts`
**Changes**:
- Export new hooks.

#### 2) Approvals components
**Files**:
- `apps/web/src/components/approvals/absence-approval-table.tsx`
- `apps/web/src/components/approvals/reject-dialog.tsx`
- `apps/web/src/components/approvals/timesheet-approval-table.tsx` (new)
- `apps/web/src/components/approvals/approval-bulk-actions.tsx` (new)
- `apps/web/src/components/approvals/approval-filters.tsx` (new)
- `apps/web/src/components/approvals/decision-toast.tsx` (new)
- `apps/web/src/components/approvals/index.ts`

**Changes**:
- Add selection checkboxes and expandable details rows.
- Show actions only for pending items.
- Add bulk approve bar with loading state.
- Add filters (team, date range, status).
- Require rejection reason before confirm.
- Add decision toast for approve/reject/bulk.

#### 3) Approvals page
**File**: `apps/web/src/app/[locale]/(dashboard)/admin/approvals/page.tsx`
**Changes**:
- Replace current tabs with `Timesheets` + `Absences`.
- Wire filters, selection, bulk approve, and sorting oldest-first.
- Show pending counts in tab labels.

#### 4) i18n messages
**Files**:
- `apps/web/messages/en.json`
- `apps/web/messages/de.json`

**Changes**:
- Add labels for timesheet approvals, filters, bulk actions, status text, and toast messages.

### Success Criteria

#### Automated Verification:
- [ ] `make -C apps/web lint` (if available)

#### Manual Verification:
- [ ] Timesheets tab shows pending daily values, oldest first, with employee details.
- [ ] Absences tab shows pending requests with required rejection reason.
- [ ] Bulk approve works for selected items.
- [ ] Team and date range filters narrow results.
- [ ] Toast notification appears on approve/reject/bulk approve.

**Implementation Note**: After completing this phase and automated verification, pause for manual confirmation before proceeding.

---

## Testing Strategy

### Unit Tests
- Backend: add/update tests for daily values approve behavior and list filters if needed.

### Integration Tests
- Manual API checks for `/daily-values` list and approve.

### Manual Testing Steps
1. Open `/admin/approvals` as admin.
2. Approve an absence; verify status changes and toast appears.
3. Reject an absence with reason; verify reason is required.
4. Approve a timesheet daily value; verify status updates and disappears from pending view.
5. Use team filter and date range to narrow lists.

## References
- `thoughts/shared/research/2026-01-28-manager-approvals-dashboard.md`
- `thoughts/shared/reference/zmi-calculation-manual-reference.md`
