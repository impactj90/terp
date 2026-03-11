# Production-Readiness Audit — 2026-03-11

## Status

All 26 findings have been **fixed** on the `staging` branch.
Two additional observations (correction-repository TOCTOU, reports-repository SQL interpolation) were also fixed.

---

## CRITICAL — Multi-Tenant Data Leaks

### 1. `teams.getByEmployee` — Cross-Tenant Team Data Exposed [FIXED]
**File:** `src/lib/services/teams-repository.ts:203-215`
**Bug:** `findTeamsByEmployee` queries `teamMember.findMany({ where: { employeeId } })` with no `tenantId` filter. Any user with `teams.view` can query team memberships for employees in other tenants.
**Fix applied:** Added `tenantId` to WHERE clause, threaded through service and router.

### 2. `tenants.getById/update/deactivate` — Cross-Tenant Access [FIXED]
**File:** `src/trpc/routers/tenants.ts:168, 336, 468`
**Bug:** Uses `protectedProcedure` (not `tenantProcedure`), so any user with `tenants.manage` permission can read/modify/deactivate any tenant by supplying an arbitrary ID. No `userTenants` membership check.
**Fix applied:** Added `assertUserHasTenantAccess()` check using `ctx.user.userTenants`.

### 3. Repository TOCTOU Pattern — Tenant Check on Read, Not on Write [FIXED]
**Files:**
- `src/lib/services/correction-assistant-repository.ts:60-68` — `updateMessage({ where: { id } })` missing `tenantId`
- `src/lib/services/department-repository.ts:87-101` — `update` and `deleteById` WHERE has only `{ id }`
- `src/lib/services/teams-repository.ts:119-135` — same pattern

**Bug:** Service checks `findFirst({ where: { id, tenantId } })` then calls `update({ where: { id } })`. The write operation has no independent tenant enforcement.
**Fix applied:** Changed to `updateMany`/`deleteMany` with `{ id, tenantId }` in WHERE, with count check.

### 4. `reports-repository.ts` — No Tenant Filter on Financial Data [FIXED]
**File:** `src/lib/services/reports-repository.ts:186-207`
**Bug:** `findMonthlyValue` and `findVacationBalance` query by `employeeId` only — no `tenantId` filter. If a cross-tenant `employeeId` reaches these functions, financial data leaks.
**Also:** `src/lib/services/payroll-export-repository.ts:124-133` — same issue.
**Fix applied:** Added `tenantId` parameter and filter to all affected functions and callers.

---

## HIGH — Authorization Gaps

### 5. `monthlyValues.close/reopen/closeBatch` — Write Mutations Behind Read Permission [FIXED]
**File:** `src/trpc/routers/monthlyValues.ts:497, 528, 559`
**Bug:** State-mutating operations (locking/unlocking payroll months) are gated on `REPORTS_VIEW` instead of a write permission. Any read-only reporting user can close/reopen months.
**Fix applied:** Changed `close`, `reopen`, and `closeBatch` to require `REPORTS_MANAGE` permission.

### 6. `bookings.getLogs` — `VIEW_OWN` Users Can Read Any Booking's Audit Trail [FIXED]
**File:** `src/trpc/routers/bookings.ts:408-442`
**Bug:** No `applyDataScope()` middleware. A user with only `VIEW_OWN` who knows another employee's booking ID can fetch its full audit log.
**Fix applied:** Added ownership check — when user lacks `VIEW_ALL`, looks up booking's `employeeId` and verifies it matches the user's employee.

---

## HIGH — Race Conditions

### 7. `absences-service.ts:360-410` — Duplicate Absence Records [FIXED]
**Bug:** `createRange` reads existing absences, computes free dates, then bulk-inserts — all outside a transaction. Two concurrent requests for the same employee create duplicate records, corrupting vacation balances.
**Fix applied:** Wrapped steps 3-7 in `prisma.$transaction()`.

### 8. Absence/Correction Approval Double-Submit [FIXED]
**Files:**
- `src/lib/services/absences-service.ts` — approve (line 537), reject (line 619), cancel (line 683)
- `src/lib/services/correction-service.ts` — approve (line 193), reject (line 231)

**Bug:** Read-check-write pattern without atomic conditional update. Two simultaneous approvals both succeed, firing duplicate recalculations and notifications.
**Fix applied:** Added `updateIfStatus()` to both repositories using atomic `updateMany({ where: { id, tenantId, status } })`. All approve/reject/cancel now use atomic conditional updates.

---

## HIGH — N+1 Query Patterns (Cron/Admin Timeouts)

### 9. `employee-day-plan-generator.ts:297-412` — 2N+90N Queries Per Cron Run [FIXED]
**Bug:** For each employee: 1 tariff fetch + 1 existing plans fetch (sequential), then 90 sequential upserts inside a transaction. For 200 employees = 400 lookups + 18,000 upserts.
**Fix applied:** Batch-load all tariffs and existing plans before the loop (2 queries total). Replaced interactive `$transaction(async tx => ...)` with array-form `$transaction([...upserts])` for single-roundtrip batch upserts.

### 10. `monthly-values-service.ts:183-203` — `closeBatch` Sequential Per Employee [FIXED]
**Bug:** For each employee: `findByEmployeeYearMonth` + `closeMonth` (which reads the same record again). 200 employees = 600 sequential round-trips.
**Fix applied:** Single `findMany` to batch-fetch all monthly values, then `mapWithConcurrency(5)` to fan out `closeMonth` calls. Also parallelized `calculateMonthBatch` and `recalculateFromMonthBatch` in `monthly-calc.ts`.

### 11. `recalc.ts:128-133` — `triggerRecalcBatch` Fully Serialized [FIXED]
**Bug:** 100 employees x 30 days x ~6 queries per day = ~18,000 sequential queries. Will timeout on Vercel.
**Fix applied:** Replaced sequential loop with `mapWithConcurrency(5)` — 5 employees processed in parallel.

### 12. `daily-calc.ts:1514-1538` — Sequential Surcharge Upserts [FIXED]
**Bug:** Each surcharge bonus is a separate sequential upsert. 5 rules x 100 employees x 30 days = 15,000 sequential queries.
**Fix applied:** Collected all upserts into array-form `$transaction([...])` — Prisma sends as a single batch.

---

## MEDIUM — Cache Invalidation Bugs (Stale UI)

### 13. `use-corrections.ts:126-156` — `useApproveCorrection` Missing Invalidations [FIXED]
**Missing:** `employees.dayView`, `dailyValues.listAll`. Should use `useTimeDataInvalidation()` like bookings/absences do.
**Fix applied:** Replaced manual daily/monthly invalidations with `useTimeDataInvalidation()` which covers `employees.dayView`, `dailyValues.list`, `dailyValues.listAll`, and all `monthlyValues` keys.

### 14. `use-daily-values.ts:242-268` — `useApproveDailyValue` Missing `employees.dayView` [FIXED]
**Bug:** Day view embeds `dailyValue` — after approval, the day view cache is stale.
**Fix applied:** Replaced manual invalidations with `useTimeDataInvalidation()` to cover all keys including `employees.dayView`.

### 15. `use-admin-monthly-values.ts:63-141` — All Admin Mutations Incomplete [FIXED]
**Missing:** `monthlyValues.forEmployee` and `yearOverview`. `useRecalculateMonthlyValues` also missing `dailyValues.*` and `employees.dayView`.
**Fix applied:** Added `forEmployee` and `yearOverview` to close/reopen/batch. `useRecalculateMonthlyValues` now uses `useTimeDataInvalidation()`.

### 16. `use-employee-day-plans.ts:72-222` — No `employees.dayView` Invalidation [FIXED]
**Bug:** Day view embeds the `dayPlan`. All 6 mutations in this file miss this. `useGenerateFromTariff` additionally misses `dailyValues.*` and `monthlyValues.*`.
**Fix applied:** Added `employees.dayView` to all 6 mutations. `useGenerateFromTariff` also uses `useTimeDataInvalidation()` for daily/monthly keys.

### 17. `use-holidays.ts:65-164` — All Holiday Mutations Miss `employees.dayView` [FIXED]
**Bug:** Day view includes `isHoliday` flag. Adding/removing holidays leaves all affected dates stale.
**Fix applied:** Added `employees.dayView` invalidation to all 5 holiday mutations (create, update, delete, generate, copy).

### 18. `use-user-groups.ts:45-91` — Asymmetric Permission Invalidation [FIXED]
**Bug:** Create invalidates `permissions.list` but not `auth.permissions`. Update/Delete do the opposite. Both sides need both keys.
**Fix applied:** All three mutations (create, update, delete) now invalidate both `permissions.list` and `auth.permissions`.

### 19. `use-schedules.ts:100-143` / `use-macros.ts:100-143` — Wrong Query Keys [FIXED]
**Bug:** Task/assignment mutations invalidate `list` but not `tasks`/`listAssignments`, which are the actual query keys used by the consuming hooks.
**Fix applied:** Schedule task mutations now also invalidate `schedules.tasks`. Macro assignment mutations now also invalidate `macros.listAssignments`.

### 20. `use-employees.ts:111-168` — Update/Delete Missing `getById` Invalidation [FIXED]
**Bug:** Detail page stays stale after update until manual refetch.
**Fix applied:** Added `employees.getById` invalidation to both `useUpdateEmployee` and `useDeleteEmployee`.

---

## MEDIUM — Missing Error Boundaries (White Screen Risk)

### 21. Zero `error.tsx` Files in Entire App [FIXED]
**Path:** `src/app/`
**Bug:** No `error.tsx`, `loading.tsx`, or `global-error.tsx` anywhere. Any unhandled render exception produces a blank white screen with no recovery path.
**Fix applied:** Added `src/app/[locale]/global-error.tsx` (root-level, renders own html/body) and `src/app/[locale]/(dashboard)/error.tsx` (dashboard-level with i18n, retry button, and link to dashboard).

### 22. Silent Query Failures Across Core Pages [FIXED]
Components that show no error state when queries fail (rendering empty/zero state instead).
**Fix applied:** Added `QueryError` component (`src/components/ui/query-error.tsx`) with retry button. All 6 components now check `isError` and render `QueryError` with a retry callback.

| Component | File |
|---|---|
| `DayView` | `src/components/timesheet/day-view.tsx:37-41` |
| `WeekView` | `src/components/timesheet/week-view.tsx:58-64` |
| `MonthView` | `src/components/timesheet/month-view.tsx:55-68` |
| `AbsenceCalendarView` | `src/components/absences/absence-calendar-view.tsx:38-65` |
| `PendingRequests` | `src/components/absences/pending-requests.tsx:58-65` |
| `TeamUpcomingAbsences` | `src/components/team-overview/team-upcoming-absences.tsx:87-94` |

### 23. Silent Mutation Failures (No UI Feedback) [FIXED]
**Fix applied:** Added `sonner` toast library with `<Toaster>` in root layout. All 4 mutation catch blocks now show `toast.error()` with i18n messages.

| Action | File |
|---|---|
| Clock in/out | `src/components/dashboard/quick-actions.tsx:55-83` |
| Cancel absence | `src/components/absences/absence-cancel-dialog.tsx:46-57` |
| Delete booking | `src/app/[locale]/(dashboard)/timesheet/page.tsx:220-229` |
| Delete employee | `src/app/[locale]/(dashboard)/admin/employees/page.tsx:104-121` |

---

## MEDIUM — Input Validation Gaps

### 24. Password Minimum Length = 1 Character [FIXED]
**File:** `src/trpc/routers/users.ts:125`
**Bug:** `z.string().min(1)` on `newPassword`
**Fix applied:** Changed to `z.string().min(8, "Password must be at least 8 characters")`.

### 25. Unvalidated Date Strings [FIXED]
**Files:** `correctionAssistant.ts:332`, `terminalBookings.ts:94`, `holidays.ts:47,56,130-131`
**Bug:** `z.string()` passed to `new Date()` — `"not-a-date"` produces `Invalid Date`.
**Fix applied:** Changed all date string inputs to `z.string().date()` (Zod YYYY-MM-DD validation).

### 26. Missing `handleServiceError` in 3 Routers [FIXED]
- `src/trpc/routers/weekPlans.ts` — all 5 procedures now wrapped in try/catch with `handleServiceError`
- `src/trpc/routers/correctionAssistant.ts` — all 4 procedures now wrapped
- `src/trpc/routers/departments.ts` — all 6 procedures now wrapped (list, getTree, getById, create, update, delete)

**Fix applied:** Added `import { handleServiceError } from "@/trpc/errors"` and wrapped every procedure body in try/catch.

---

## Additional Observations (fixed alongside 24-26)

### A. `correction-repository.ts` TOCTOU — `update` and `deleteById` Missing `tenantId` [FIXED]
**File:** `src/lib/services/correction-repository.ts:120-160`
**Bug:** `update({ where: { id } })` and `delete({ where: { id } })` had no `tenantId` in WHERE clause. Same TOCTOU pattern as Finding 3.
**Fix applied:** `update()` now takes `tenantId`, uses `updateMany({ where: { id, tenantId } })` + count check. `deleteById()` now takes `tenantId`, uses `deleteMany({ where: { id, tenantId } })`. Callers in `correction-service.ts` updated.

### B. `reports-repository.findAbsenceDays` — SQL String Interpolation [FIXED]
**File:** `src/lib/services/reports-repository.ts:274-288`
**Bug:** `WHERE ad.tenant_id = '${tenantId}'` used string interpolation instead of parameterized bind. While tenantId comes from middleware (low injection risk), this is not defense-in-depth.
**Fix applied:** Changed to `WHERE ad.tenant_id = $1` with `tenantId` as a query parameter. Employee filter shifted to `$4`.
