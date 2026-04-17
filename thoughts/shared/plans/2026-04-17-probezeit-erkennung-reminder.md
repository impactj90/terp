# Probezeit-Erkennung + Reminder Implementation Plan

## Overview

Implement a shared probation domain across TERP so probation end dates are computed from employee master data plus tenant defaults, then surfaced consistently in `/dashboard`, `/admin/employees`, `/admin/employees/[id]`, `/admin/settings`, and the existing in-app notifications flow.

The implementation should stay inside the existing employee, system settings, and notification architecture instead of introducing a separate HR dashboard or a dedicated probation config model.

## Current State Analysis

- Employee master data already contains the raw inputs we need: `entryDate`, `exitDate`, and optional `probationMonths` on `Employee`, but there is no computed probation state or end date today. See `prisma/schema.prisma:1849-1946`.
- The employee API surface already enforces `employees.view` plus TERP data-scope rules on both list and detail endpoints through `employeesRouter` and `employeesService`. See `src/trpc/routers/employees.ts:743-879` and `src/lib/services/employees-service.ts:50-167`.
- The employee list page only exposes search, active status, department, and location filters today; there is no probation filter in the page state or request payload. See `src/app/[locale]/(dashboard)/admin/employees/page.tsx:37-63` and `src/app/[locale]/(dashboard)/admin/employees/page.tsx:168-247`.
- The detail page shows the generic `StatusBadge` and core employment fields, but read-only probation information is not shown in the overview. The only probation-related UI today is `probationMonths` in the payroll compensation tab, which is gated by payroll permissions. See `src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx:125-130`, `src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx:188-210`, `src/components/employees/status-badge.tsx:30-54`, and `src/components/employees/payroll/compensation-tab.tsx:34-75` plus `src/components/employees/payroll/compensation-tab.tsx:237-255`.
- `/dashboard` is a personal dashboard composed from independent widgets. It currently always renders the personnel-file widget when a user has an `employeeId`, but it returns early for users without a linked employee profile. That early return would suppress a probation widget even for users with `employees.view`. See `src/app/[locale]/(dashboard)/dashboard/page.tsx:23-32` and `src/app/[locale]/(dashboard)/dashboard/page.tsx:54-78`.
- `/admin/settings` already exists as the tenant-side settings surface for `settings.manage`, backed by the singleton `SystemSetting` model and `systemSettings` tRPC router. See `src/app/[locale]/(dashboard)/admin/settings/page.tsx:11-50`, `prisma/schema.prisma:3306-3335`, `src/trpc/routers/systemSettings.ts:29-180`, and `src/lib/services/system-settings-service.ts:45-201`.
- The settings UI already follows a "single form with collapsible sections" pattern, and the dunning settings UI already demonstrates an array-editing pattern for staged reminder days. See `src/components/settings/system-settings-form.tsx:20-152` and `src/components/billing/dunning/dunning-settings-tab.tsx:21-225`.
- Notifications already support the `reminders` category, per-user preference toggles, unread-count pubsub updates, a bell dropdown, and `/notifications`. See `prisma/schema.prisma:3379-3426`, `src/trpc/routers/notifications.ts:46-83`, `src/trpc/routers/notifications.ts:149-379`, and `src/components/layout/notifications.tsx:34-131`.
- Existing cron jobs show two useful patterns:
  - simple notification crons that create `Notification` rows and publish unread counts (`/api/cron/inbound-invoice-escalations`, `/api/cron/dunning-candidates`), see `src/app/api/cron/inbound-invoice-escalations/route.ts:19-104` and `src/app/api/cron/dunning-candidates/route.ts:28-144`
  - richer daily crons that use `CronExecutionLogger` for tenant-by-tenant execution tracking, see `src/lib/services/cron-execution-logger.ts:18-161` and `src/app/api/cron/calculate-days/route.ts:117-240`
- `Notification` rows alone do not have a durable business key for "tenant + employee + reminder stage + computed probation end". `CronCheckpoint` exists, but it is a generic job-resume mechanism rather than a feature-specific ledger and is cleaned by cron routes over time. See `prisma/schema.prisma:3379-3399` and `prisma/schema.prisma:4916-4931`.

## Desired End State

After this plan is implemented:

- TERP computes an employee's effective probation duration from `Employee.probationMonths` or the tenant default, then derives a correct probation end date with month-end and leap-year-safe logic.
- `/admin/settings` lets `settings.manage` users maintain the default probation months, reminder enablement, and reminder-day stages in the existing `SystemSetting` surface.
- `employees.list` supports a server-side probation filter, still honoring the existing employee data scope.
- Employee list/detail responses include read-only computed probation state so the UI can render consistent filters, badges, and dates without reimplementing business rules client-side.
- `/admin/employees/[id]` shows the calculated probation end date for users with `employees.view`, and only shows an "In Probezeit" badge while the employee is actively in probation.
- `/dashboard` shows a compact probation card only to users with `employees.view`, including a count for the next 30 days and a preview of affected employees. Users with `employees.view` but no linked `employeeId` can still see the probation card.
- A daily Vercel cron creates in-app reminder notifications for due probation stages, respects `NotificationPreference.remindersEnabled`, honors TERP data scope when selecting recipients, and never duplicates the same stage for the same employee and computed end date.

### Key Discoveries

- `employees.list` is the right integration point for the probation filter because it already owns server-side pagination and scope enforcement: `src/trpc/routers/employees.ts:743-785`.
- `SystemSetting` is the correct home for tenant-wide defaults because the current router/service already implements singleton get-or-create and audited updates: `src/trpc/routers/systemSettings.ts:148-180` and `src/lib/services/system-settings-service.ts:49-201`.
- The current dashboard structure must be adjusted so permission-based HR widgets are not hidden by the "no employee profile" early return: `src/app/[locale]/(dashboard)/dashboard/page.tsx:31-52`.
- Because `Notification` is per-user and has no business-key uniqueness, durable probation reminder deduplication needs separate persistence instead of relying on title/link matching: `prisma/schema.prisma:3379-3399`.

## What We're NOT Doing

- No separate HR dashboard or alternate dashboard route.
- No email reminders, SMS, or external delivery channels.
- No workflow for probation review meetings, contract changes, or employment decisions.
- No payroll permission changes; read-only probation display remains under `employees.view`, while editing `probationMonths` stays where it is today.
- No generic reminder framework refactor across all TERP modules in this ticket.

## Implementation Approach

Use a dedicated `probation-service` for all shared business rules and expose that shared logic through:

- extended `SystemSetting` fields for tenant defaults
- employee list/detail API enrichment
- a new dashboard widget query
- a dedicated daily cron route for reminders

Keep tenant-wide probation configuration inside the existing singleton `SystemSetting` flow instead of introducing a dedicated config model. This matches the current `/admin/settings` architecture, the `getOrCreate` service pattern, and the existing audited update path. `probationReminderDays` should be treated as a normalized primitive settings field, not as its own entity: validate and persist it as a non-empty array of unique positive integers, sorted descending for predictable UI and cron behavior, with `[28,14,7]` as the default.

For durability and correctness, use a dedicated reminder-ledger model such as `EmployeeProbationReminder` with a unique key on `(tenantId, employeeId, reminderDaysBefore, probationEndDate)`. This avoids overloading user-scoped `Notification` rows for business dedupe and avoids using `CronCheckpoint` for long-lived feature state.

For the employee list filter and dashboard/count queries, keep filtering server-side. Do not fetch all employees client-side and post-filter in React. Prisma remains the preferred path. If Prisma alone becomes too awkward for DB-side pagination/counting over computed probation dates plus tenant defaults, allow a single, probation-specific raw-SQL repository path for list/dashboard/reminder-candidate selection only. Keep the route surface inside the existing employee stack, keep the SQL parameterized, and do not split scope logic across multiple route-specific SQL variants. The shared `probation-service` remains the source of truth for date math and final status mapping even if SQL is used to preselect candidate rows.

### Central Status Definitions

Use one shared status matrix across list filters, detail rendering, dashboard summaries, and reminder eligibility.

Derived values:
- `effectiveMonths = employee.probationMonths ?? tenant.probationDefaultMonths`
- `computedEndDate = entryDate + effectiveMonths months`
- `isRelevantProbationCase = valid entryDate AND effectiveMonths > 0 AND (exitDate is null OR exitDate > today)`

Primary statuses:

| Status | Definition | Operational effect |
|---|---|---|
| `NONE` | Employee is not a relevant probation case. This includes defensive legacy rows with no valid `entryDate`, employees with effective months `<= 0`, and all employees with `exitDate <= today`. | No reminder, no dashboard card entry, no probation filter hit, no badge. The detail page may still show the computed end date as historical information if it can be derived safely. |
| `IN_PROBATION` | Relevant probation case and `computedEndDate > today + 30 days`. | Badge visible, included in current-probation views. |
| `ENDS_IN_30_DAYS` | Relevant probation case and `today <= computedEndDate <= today + 30 days`. | Badge visible, included in dashboard preview and reminder candidate selection. |
| `ENDED` | Relevant probation case and `computedEndDate < today`. Exited employees are explicitly excluded and therefore never land here. | No badge, eligible for the "Probezeit beendet" filter only. |

Filter mapping:
- `ALL`: no probation-specific restriction
- `IN_PROBATION`: match `IN_PROBATION` plus `ENDS_IN_30_DAYS`
- `ENDS_IN_30_DAYS`: match only `ENDS_IN_30_DAYS`
- `ENDED`: match only `ENDED`

Reminder eligibility:
- Reminders are only generated for `ENDS_IN_30_DAYS` cases whose configured reminder stage is due on the current day.

## Phase 1: Probation Domain and Persistence

### Overview

Create the persistent configuration and durable reminder ledger, then centralize all probation date/status logic in a reusable service.

### Changes Required

#### 1. Extend Tenant Settings and Add Reminder Ledger

**Files**:
- `prisma/schema.prisma`
- `supabase/migrations/<timestamp>_add_probation_settings_and_reminder_ledger.sql`

**Changes**:
- Extend `SystemSetting` with:
  - `probationDefaultMonths Int @default(6)`
  - `probationRemindersEnabled Boolean @default(true)`
  - `probationReminderDays Int[] @default([28,14,7])`
- Keep these fields on the existing `SystemSetting` singleton rather than introducing a new probation config table. This stays aligned with the current `/admin/settings` and `systemSettingsService.getOrCreate()` pattern.
- Normalize and validate `probationReminderDays` in the router/service layer before persistence:
  - integers only
  - each value `> 0`
  - unique values only
  - sorted descending before save
  - reject an empty list rather than silently disabling all reminder stages
- Add a dedicated reminder-ledger model, e.g. `EmployeeProbationReminder`, with:
  - `tenantId`
  - `employeeId`
  - `reminderDaysBefore`
  - `probationEndDate`
  - `createdAt`
  - unique key on `(tenantId, employeeId, reminderDaysBefore, probationEndDate)`
- Backfill existing tenants with the same defaults so the feature works immediately.

```prisma
model EmployeeProbationReminder {
  id                 String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId           String   @map("tenant_id") @db.Uuid
  employeeId         String   @map("employee_id") @db.Uuid
  reminderDaysBefore Int      @map("reminder_days_before")
  probationEndDate   DateTime @map("probation_end_date") @db.Date
  createdAt          DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employee Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  @@unique([tenantId, employeeId, reminderDaysBefore, probationEndDate], map: "uq_emp_probation_reminder")
}
```

#### 2. Add a Shared Probation Service

**Files**:
- `src/lib/services/probation-service.ts` (new)
- `src/lib/services/__tests__/probation-service.test.ts` (new)

**Changes**:
- Implement pure helpers for:
  - resolving effective probation months from employee value vs tenant default
  - computing the probation end date with UTC-safe month-end handling
  - deciding whether an employee is relevant (valid entry date, effective months > 0, not exited as of today)
  - calculating derived status values with the shared precedence `NONE -> ENDED -> ENDS_IN_30_DAYS -> IN_PROBATION`
  - computing `daysRemaining`
- Keep these helpers independent from React and routers so list/detail/dashboard/cron all use identical business rules.
- Make `exitDate <= today` a hard exclusion from all operational probation states. Exited employees may still surface a read-only computed end date on the detail page, but their shared probation status must resolve to `NONE`, never `ENDED`.

```ts
export function computeProbationEndDate(entryDate: Date, months: number): Date {
  const year = entryDate.getUTCFullYear()
  const month = entryDate.getUTCMonth()
  const day = entryDate.getUTCDate()

  const target = month + months
  const lastDay = new Date(Date.UTC(year, target + 1, 0)).getUTCDate()

  return new Date(Date.UTC(year, target, Math.min(day, lastDay)))
}
```

#### 3. Extend System Settings Backend

**Files**:
- `src/trpc/routers/systemSettings.ts`
- `src/lib/services/system-settings-service.ts`
- `src/lib/services/system-settings-repository.ts`
- `src/hooks/use-system-settings.ts`

**Changes**:
- Add the new settings fields to:
  - router input/output schemas
  - `mapToOutput`
  - service update input and audit `TRACKED_FIELDS`
  - repository persistence
- Keep the existing `getOrCreate` behavior so older tenants do not need a separate bootstrap step.

### Success Criteria

#### Automated Verification

- [x] Prisma schema generates cleanly: `pnpm db:generate`
- [x] System settings router/service tests cover new defaults and updates: `pnpm test -- src/trpc/routers/__tests__/systemSettings-router.test.ts src/lib/services/__tests__/probation-service.test.ts`
- [x] TypeScript passes: `make typecheck` (no new probation-related errors; pre-existing unrelated errors remain)
- [x] Lint passes: `make lint` (no new probation-related errors; pre-existing unrelated errors remain)

#### Manual Verification

- [ ] Opening `/admin/settings` as a `settings.manage` user shows probation defaults with initial values `6`, `enabled=true`, and `[28,14,7]`
- [ ] Saving changed probation settings persists and reloads correctly
- [ ] Existing tenants without a pre-existing settings row still get working defaults

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Employee API Enrichment and Server-Side Filtering

### Overview

Expose computed probation state through the existing employee list/detail APIs and add a server-side probation filter without breaking current data-scope rules.

### Changes Required

#### 1. Extend the Employee tRPC Surface

**Files**:
- `src/trpc/routers/employees.ts`

**Changes**:
- Extend `listEmployeesInputSchema` with a new enum filter, e.g.:
  - `ALL`
  - `IN_PROBATION`
  - `ENDS_IN_30_DAYS`
  - `ENDED`
- Define the filter semantics explicitly:
  - `IN_PROBATION` returns employees whose shared status is `IN_PROBATION` or `ENDS_IN_30_DAYS`
  - `ENDS_IN_30_DAYS` returns only `ENDS_IN_30_DAYS`
  - `ENDED` returns only `ENDED`
- Extend employee list/detail outputs with a read-only nested object such as:
  - `probation.effectiveMonths`
  - `probation.endDate`
  - `probation.daysRemaining`
  - `probation.status`
  - `probation.showBadge`
- Keep permissions unchanged: `employees.view` plus existing `applyDataScope()`.

```ts
const probationInfoSchema = z.object({
  effectiveMonths: z.number().int().nullable(),
  endDate: z.date().nullable(),
  daysRemaining: z.number().int().nullable(),
  status: z.enum(["none", "in_probation", "ends_in_30_days", "ended"]),
  showBadge: z.boolean(),
})
```

#### 2. Implement Server-Side Probation-Aware Employee Queries

**Files**:
- `src/lib/services/employees-service.ts`
- `src/lib/services/employees-repository.ts`
- `src/lib/services/probation-repository.ts` (new, if the SQL becomes feature-specific)

**Changes**:
- Load the tenant's `probationDefaultMonths` once per request.
- Apply probation filtering on the server, not in React.
- Exclude:
  - employees with `deletedAt != null`
  - employees with `exitDate <= today`
  - employees whose effective probation months are `<= 0`
- Return computed probation data along with existing employee rows.
- Prefer Prisma for this path. If Prisma's standard `where` API is too limited for DB-side computed probation date predicates with pagination/counts, add one probation-specific repository query using parameterized raw SQL while keeping the public route under `employees.list`.
- If raw SQL is needed, use it only to select candidate rows or counts for probation-aware list/dashboard/reminder queries; final status mapping and badge logic must still run through the shared `probation-service`.

```sql
-- Conceptual shape only
WHERE e.tenant_id = $tenantId
  AND e.deleted_at IS NULL
  AND (e.exit_date IS NULL OR e.exit_date > $today)
  AND COALESCE(e.probation_months, s.probation_default_months) > 0
  AND probation_end_date BETWEEN $today AND $today_plus_30
```

#### 3. Keep Data-Scope Enforcement Intact

**Files**:
- `src/lib/services/employees-service.ts`
- `src/lib/auth/data-scope.ts`

**Changes**:
- Preserve the current department/employee scope behavior for list and detail.
- If the probation-specific repository uses raw SQL, explicitly reuse the same scope conditions that `employeesService.list()` currently applies today instead of re-implementing divergent route-specific rules.
- Reuse the same scope logic when later building reminder recipient checks.

### Success Criteria

#### Automated Verification

- [x] Employee router tests cover the new probation filter and scoped visibility: `pnpm test -- src/trpc/routers/__tests__/employees-router.test.ts`
- [x] Unit tests cover date edge cases, exit-date exclusions, and tenant-default overrides: `pnpm test -- src/lib/services/__tests__/probation-service.test.ts`
- [x] TypeScript passes: `make typecheck` (no new probation-related errors; pre-existing unrelated errors remain)
- [x] Lint passes: `make lint` (no new probation-related errors; pre-existing unrelated errors remain)

#### Manual Verification

- [ ] `/admin/employees` can be filtered by `In Probezeit`, `Endet in 30 Tagen`, and `Probezeit beendet`
- [ ] The filter is clearly server-side: pagination totals and page contents both change correctly without client-only post-filtering
- [ ] Exited employees (`exitDate <= today`) never appear in the probation filter results
- [ ] `/admin/employees/[id]` returns a calculated probation end date even when `probationMonths` is `null` and the tenant default is used

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Settings, Employee UI, and Dashboard Surfaces

### Overview

Wire the computed probation data into the existing settings, employee admin UI, and dashboard, while fixing the dashboard's current early-return behavior for users without a linked employee profile.

### Changes Required

#### 1. Add a Probation Section to `/admin/settings`

**Files**:
- `src/components/settings/system-settings-form.tsx`
- `messages/de.json`
- `messages/en.json`

**Changes**:
- Add a new collapsible probation section to the existing settings form.
- Expose:
  - default probation months
  - reminder enabled/disabled toggle
  - editable reminder day-stage array
- Reuse the staged-array UX from `DunningSettingsTab` instead of inventing a new interaction model.
- Keep the page under the existing `settings.manage` gate.

#### 2. Update Employee List and Detail UI

**Files**:
- `src/app/[locale]/(dashboard)/admin/employees/page.tsx`
- `src/components/employees/employee-data-table.tsx`
- `src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx`
- `src/components/employees/probation-badge.tsx` (new)
- `messages/de.json`
- `messages/en.json`

**Changes**:
- Add the new probation filter select to the list page and pass it through `useEmployees()`.
- Keep the detail page's read-only probation display in the overview area, not inside payroll-only tabs.
- Add a dedicated `ProbationBadge` that only renders for employees currently in probation.
- Do not introduce any "Probezeit abgelaufen" permanent badge.
- Keep `CompensationTab` as the edit surface for raw `probationMonths`, but do not depend on payroll permissions for the read-only computed end date.

#### 3. Add a Dashboard Probation Widget

**Files**:
- `src/app/[locale]/(dashboard)/dashboard/page.tsx`
- `src/components/dashboard/probation-dashboard-widget.tsx` (new)
- `src/hooks/use-probation-dashboard.ts` (new)
- `src/trpc/routers/employees.ts` or a dedicated probation router entry

**Changes**:
- Add a dedicated query that returns:
  - count of relevant employees whose probation ends within 30 days
  - preview rows with name, department, probation end, and days remaining
- Render the widget only when the user has `employees.view`.
- Refactor the dashboard page so the widget can still render for users with `employees.view` but no linked `employeeId`; employee-centric cards can remain conditional.
- Provide a clear CTA into `/admin/employees` with the `ENDS_IN_30_DAYS` filter preselected and optionally deep links from preview rows into `/admin/employees/[id]`.

### Success Criteria

#### Automated Verification

- [x] TypeScript passes: `make typecheck` (no new probation-related errors; pre-existing unrelated errors remain)
- [x] Lint passes: `make lint` (no new probation-related errors; pre-existing unrelated errors remain)
- [x] Employee UI tests cover the new filter plumbing and detail rendering: `pnpm test -- src/trpc/routers/__tests__/employees-router.test.ts`

#### Manual Verification

- [ ] A user with `settings.manage` can edit probation settings in `/admin/settings`
- [ ] A user with `employees.view` sees the probation filter and read-only probation end date
- [ ] A user without payroll permissions still sees the read-only probation end date on `/admin/employees/[id]`
- [ ] A user with `employees.view` sees the dashboard probation card
- [ ] A user without `employees.view` does not see the probation card
- [ ] A user with `employees.view` but no linked `employeeId` still sees the probation card and the existing "no employee profile" message
- [ ] Clicking from the dashboard card leads into a traceable probation workflow in the employee admin area

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Reminder Cron and Notification Delivery

### Overview

Add a daily Vercel cron that evaluates due probation reminders per tenant, writes a durable dedupe ledger entry, creates per-user in-app notifications, and publishes unread-count updates through the existing notification system.

### Changes Required

#### 1. Add a Dedicated Probation Reminder Cron Route

**Files**:
- `src/app/api/cron/probation-reminders/route.ts` (new)
- `vercel.json`

**Changes**:
- Add a daily cron entry for `/api/cron/probation-reminders` at `15 5 * * *` (`05:15 UTC`).
- Keep this exact time consistent in the ticket and handbook-facing documentation. `05:15 UTC` intentionally sits between the existing `05:00 UTC` dunning cron and `06:00 UTC` warehouse correction cron.
- Follow the existing protected Vercel cron pattern:
  - `runtime = "nodejs"`
  - `CRON_SECRET` validation
  - per-tenant iteration
  - structured logging
- Use `CronExecutionLogger` so failures are visible in the existing schedule execution tables.

#### 2. Resolve Due Employees, Visible Recipients, and Notification Preferences

**Files**:
- `src/lib/services/probation-reminder-service.ts` (new)
- `src/lib/services/probation-service.ts`
- `src/lib/auth/data-scope.ts`

**Changes**:
- For each active tenant:
  - load settings through `systemSettingsService.get()`
  - skip the tenant if reminders are disabled
  - load employees whose configured reminder stage is due today
  - exclude employees with `exitDate <= today`
- Treat reminder delivery as an extension of existing employee-data visibility, not as a separate recipient model:
  - visibility of dashboard/list/detail stays governed by `employees.view` plus existing TERP data scope
  - actual reminder delivery requires `employees.view` plus `NotificationPreference.remindersEnabled = true`
  - a disabled reminder preference suppresses notification creation only; it does not hide dashboard/list/detail probation information
- Resolve recipients from active, unlocked tenant users who have `employees.view` (including admins via the existing permission model).
- Reconstruct a `DataScope` from each user and only deliver notifications for employees inside that scope.
- Do not send reminders to users who can open `/notifications` but cannot access the linked employee context.
- Build notification links to the employee context, e.g. `/admin/employees/[id]`.

#### 3. Enforce Durable Dedupe by Employee + Stage + Computed End Date

**Files**:
- `src/lib/services/probation-reminder-service.ts`
- `prisma/schema.prisma`

**Changes**:
- Before creating notifications, attempt to insert the reminder-ledger row keyed by:
  - tenant
  - employee
  - reminder stage
  - computed probation end date
- If the unique insert conflicts, skip the reminder for that stage.
- If `entryDate` or `probationMonths` changes and produces a different end date, the new unique key will allow a new reminder series automatically.
- Keep the dedupe decision independent from the per-user `Notification` rows.

```ts
const dedupeKey = {
  tenantId,
  employeeId: employee.id,
  reminderDaysBefore: 14,
  probationEndDate,
}
```

#### 4. Reuse Existing Notification Delivery Mechanics

**Files**:
- `src/trpc/routers/notifications.ts`
- `src/components/layout/notifications.tsx`
- `src/hooks/use-global-notifications.ts`

**Changes**:
- Keep notification type as `reminders`.
- Reuse the existing unread-count publish flow on `userTopic(userId)`.
- Do not add a new notification category or alternate inbox.

### Success Criteria

#### Automated Verification

- [x] Cron route tests cover successful runs, disabled tenants, and duplicate suppression: `pnpm test -- src/app/api/cron/probation-reminders/__tests__/route.test.ts`
- [x] Notifications tests continue to pass with reminder-preference behavior: `pnpm test -- src/trpc/routers/__tests__/notifications-router.test.ts`
- [x] TypeScript passes: `make typecheck` (no new probation-related errors; pre-existing unrelated errors remain)
- [x] Lint passes: `make lint` (no new probation-related errors; pre-existing unrelated errors remain)
- [x] Full unit/integration suite for the touched backend passes: `make test` (90 tests across systemSettings, employees, notifications, probation-service, probation-reminder-service, and cron route)

#### Manual Verification

- [ ] Running the probation cron once creates reminder notifications for due employees
- [ ] Running it again without changing employee data does not create duplicates
- [ ] Changing `entryDate` or `probationMonths` to produce a new end date allows a new reminder series
- [ ] Users with `employees.view` and `remindersEnabled = true` only receive reminders for employees inside their existing TERP scope
- [ ] Users with `remindersEnabled = false` do not receive probation reminders
- [ ] Users with `employees.view` but `remindersEnabled = false` still see dashboard/list/detail probation information
- [ ] Reminder notifications appear in the bell dropdown and `/notifications`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Test Coverage Delta (derived from manual verification list)

### Overview

The Phase 1–4 automated tests cover units with mocked Prisma (`probation-service`, `probation-reminder-service`, the cron `route.test.ts` with a stub prisma object) and router tests with mocks. This phase adds **real-DB integration tests** and **Playwright E2E tests** so the manual verification items in Phases 1–4 have automated counterparts and can be re-run in CI after unrelated refactors.

We are not replacing existing unit tests — they stay as fast feedback. Phase 5 only adds coverage where mock-based tests cannot prove the invariant (raw SQL under `probation-repository`, cross-tenant iteration in the cron, UI visibility rules under real auth context).

### Changes Required

#### 1. Integration Test — Probation Cron Against Real DB

**File**: `src/app/api/cron/probation-reminders/__tests__/integration.test.ts` (new)

Mirror the pattern from `src/app/api/cron/inbound-invoice-escalations/__tests__/integration.test.ts`:
- Mock `@/lib/pubsub/singleton` and `@/lib/pubsub/topics`
- Use a dedicated test-tenant UUID and `beforeAll` / `afterAll` cleanup (tenant, users, employees, ledger rows, notifications, system settings)
- Call `GET(makeRequest())` with a real `Bearer ${CRON_SECRET}` header

Scenarios (map to verification items):
- **4.1 + 4.2 + 4.3**: Seed 3 employees due at 28/14/7 days before end → run cron once → assert 3 ledger rows + 1 notification per recipient × due employee, each linked to `/admin/employees/[id]`
- **4.5 (idempotency)**: Run cron twice without data changes → second run creates 0 new ledger rows, 0 new notifications
- **4.6 (end-date change reissues series)**: Mutate one employee's `entryDate` so the end date shifts, re-run → new ledger row for the new `(employeeId, reminderDaysBefore, probationEndDate)` triple
- **4.8 (tenant disable)**: Set `probationRemindersEnabled = false` → rerun → zero rows created for that tenant; `schedule_executions` row has `task_result.skip_reason = "disabled"`
- **4.9 + 4.11 (scope filtering)**: Seed three users on the same tenant (all-scope, department-scoped, no-view permission). Run cron → assert notification recipient sets match each user's visibility
- **4.10 (preference off)**: User with `employees.view` + `remindersEnabled = false` → receives zero notifications; ledger still advances (dedupe ledger is tenant+employee-scoped, not user-scoped)
- **4.17 (exit-date exclusion)**: Employee with `exitDate = today` and an otherwise-due reminder stage → no ledger row, no notification
- **4.15 (logging)**: After a successful run, assert one `schedule_executions` row with `status = "completed"` and `task_result.reminders_created > 0`
- **4.16 (one-tenant failure isolation)**: Seed two tenants; corrupt settings for one (e.g. negative `probationDefaultMonths`) → the other still processes; the failing tenant logs `status = "failed"` with a non-empty `error_message`

#### 2. Integration Test — Employees List Probation Filter Against Real DB

**File**: `src/lib/services/__tests__/employees-service.probation.integration.test.ts` (new)

Call `employeesService.list(prisma, tenantId, dataScope, { probationStatus })` with a real Prisma client seeded through `beforeAll`. This proves the raw-SQL path in `probation-repository.ts` (which unit-level mocks cannot).

Scenarios:
- **2.2 `IN_PROBATION`**: includes both `IN_PROBATION` and `ENDS_IN_30_DAYS` employees (shared status matrix)
- **2.3 `ENDS_IN_30_DAYS`**: only the 30-day window
- **2.4 `ENDED`**: only past end dates, exited employees excluded
- **2.5 pagination server-side**: `total` and `items.length` both respect the filter (page through a seeded set >`pageSize` and assert correct total)
- **2.6 exit-date exclusion**: exited employee with active probation window never returned
- **2.7 tenant default fallback**: employee with `probationMonths = null` is classified using tenant default
- **2.8 month-end math**: Jan 31 + 1 month classified as Feb 28/29 (use a fixed `today` via injected date if service supports it; otherwise freeze via real dates)
- **2.9 department scope**: department-scoped `DataScope` restricts list + total

#### 3. E2E Spec — Probezeit UI End-to-End

**File**: `src/e2e-browser/55-probezeit.spec.ts` (new — numbered into the HR block after `04-mitarbeiter.spec.ts` / before `60-payroll-master-data.spec.ts`; pick a free number)

Follow patterns in `src/e2e-browser/04-mitarbeiter.spec.ts` and `src/e2e-browser/11-module-settings.spec.ts`. Use `helpers/nav.ts`, `helpers/forms.ts`, and the admin session from `auth.setup.ts`. Clean up via `global-setup.ts` additions if the spec creates new DB state.

Scenarios (map to verification items):
- **1.1 + 1.3 settings edit**: admin opens `/admin/settings`, expands Probezeit section, changes default months + reminder days, saves, reloads page, asserts persisted values
- **2.1 + 2.5 filter UI**: admin opens `/admin/employees`, opens Probezeit-Filter, picks "Endet in 30 Tagen", asserts URL query param and that the total count in the pagination footer changes
- **3.2 badge rendered on list**: seeded in-probation employee renders the "In Probezeit" badge in the list row
- **3.6 + 3.9 dashboard widget**: admin opens `/dashboard`, asserts widget visible with count matching the filtered-list total; clicks CTA, ends up on `/admin/employees?probation=ENDS_IN_30_DAYS`
- **3.7 widget hidden**: user without `employees.view` (second test session) opens `/dashboard`, widget is not rendered
- **3.10 + 3.11 deep links**: clicking a preview row navigates to the correct `/admin/employees/[id]`

#### 4. E2E Helper and Seed Adjustments

**Files**:
- `src/e2e-browser/global-setup.ts`
- optional: `src/e2e-browser/helpers/probation.ts` (new, small)

**Changes**:
- Extend the existing global teardown to clear `employee_probation_reminders` and probation-scoped `notifications` between runs (mirrors how `inbound_invoice_approvals` is cleaned up today)
- If no existing seeded employee has an entry-date that lands in the `ENDS_IN_30_DAYS` window, add one (adjust `supabase/seed.sql` minimally, or create it inside the spec's `beforeAll`)

### Success Criteria

#### Automated Verification

- [x] Cron integration suite passes: `pnpm vitest run src/app/api/cron/probation-reminders/__tests__/integration.test.ts` (10 tests)
- [x] Employees-service probation integration suite passes: `pnpm vitest run src/lib/services/__tests__/employees-service.probation.integration.test.ts` (8 tests)
- [ ] E2E spec passes locally: `pnpm playwright test src/e2e-browser/55-probezeit.spec.ts` (requires running dev server; not executed in this pass)
- [x] All previously-green suites still green: `pnpm vitest run src/trpc/routers/__tests__/systemSettings-router.test.ts src/trpc/routers/__tests__/employees-router.test.ts src/lib/services/__tests__/probation-service.test.ts src/lib/services/__tests__/probation-reminder-service.test.ts src/app/api/cron/probation-reminders/__tests__/route.test.ts` (79 tests)

#### Manual Verification

- [ ] CI run shows all three new suites green on a PR branch
- [ ] Re-running the E2E spec twice in a row stays deterministic (probation ledger cleanup works)

### Out of Scope for Phase 5

- No new product behavior; this phase is coverage-only.
- No load/performance tests for the cron — out of scope until a tenant-scale concern surfaces.
- No full conversion of the existing unit-level `route.test.ts` into an integration test — keep both: the unit version stays fast, the integration version proves the DB layer.

---

## Testing Strategy

### Unit Tests

- Add focused tests for the probation date helper covering:
  - `2026-01-31 + 1 month`
  - `2024-02-29 + 12 months`
  - employee override vs tenant default
  - exited employee exclusion
  - `<= 0` effective months exclusion
- Add service tests for derived status classification:
  - in probation
  - ends in 30 days
  - ended
  - no probation

### Integration Tests

- Extend employee router/service tests so `employees.list` honors the new server-side filter and existing data scope.
- Add cron route tests for:
  - multi-tenant isolation
  - no duplicate reminders on rerun
  - new reminders after an end-date-changing master-data update
  - notification preference suppression
  - recipient scope filtering
  - the distinction between visibility (`employees.view`) and actual delivery (`employees.view` + `remindersEnabled`)
- Extend system settings tests to cover default creation and persistence of the new probation fields.

### Browser E2E Tests

- Add a browser scenario where a user with `employees.view` sees the dashboard probation card and can navigate into the filtered employee list.
- Add a browser scenario where a user without `employees.view` does not see the widget.
- Add a browser scenario where an employee currently in probation shows the badge and calculated end date, while an employee past probation shows only the end date.
- Add a browser scenario where `/admin/settings` updates probation defaults and reminder days successfully.

### Manual Testing Steps

1. Set tenant defaults in `/admin/settings` to `6` months and reminder stages `[28,14,7]`.
2. Create or edit employees so one is:
   - currently in probation
   - ending within 30 days
   - already ended
   - exited as of today
3. Verify the employee list filters classify each employee correctly.
4. Verify the detail page shows the computed end date and only shows the badge while probation is active.
5. Verify the dashboard card count matches the `ENDS_IN_30_DAYS` list view.
6. Trigger the cron and verify notifications appear once, then rerun to verify dedupe.

## Performance Considerations

- Keep probation filtering and counting server-side; do not ship full employee lists to the client and compute statuses in React.
- For dashboard previews and reminder candidates, select only the fields needed for rendering/delivery.
- Resolve tenant settings once per request or tenant iteration instead of per employee.
- Batch recipient and notification-preference lookups per tenant to avoid N+1 user queries.
- Let the reminder-ledger unique index enforce idempotency instead of relying on repeated `findFirst` scans over `notifications`.

## Migration Notes

- Existing tenants should receive:
  - `probationDefaultMonths = 6`
  - `probationRemindersEnabled = true`
  - `probationReminderDays = [28,14,7]`
- Existing employees with `probationMonths = null` should immediately inherit the tenant default after deployment; no employee backfill is required.
- The reminder-ledger table starts empty; it only records future reminder emissions.
- Add the new cron route to `vercel.json` during the same deployment as the migration so settings, data model, and execution path stay aligned.

## References

- Original ticket: `thoughts/shared/tickets/prodi-prelaunch/pflicht-04-probezeit-erkennung.md`
- Related research: `thoughts/shared/research/2026-04-17-probezeit-erkennung.md`
- Employee data model: `prisma/schema.prisma:1849-1946`
- Tenant settings model: `prisma/schema.prisma:3306-3335`
- Notifications and preferences model: `prisma/schema.prisma:3379-3426`
- Employee router list/detail: `src/trpc/routers/employees.ts:743-879`
- Employee service filtering and scope checks: `src/lib/services/employees-service.ts:50-167`
- System settings router/service: `src/trpc/routers/systemSettings.ts:29-180`, `src/lib/services/system-settings-service.ts:49-201`
- Existing settings UI: `src/components/settings/system-settings-form.tsx:20-152`
- Existing staged-array settings example: `src/components/billing/dunning/dunning-settings-tab.tsx:21-225`
- Dashboard composition and no-employee early return: `src/app/[locale]/(dashboard)/dashboard/page.tsx:23-78`
- Existing HR widget pattern: `src/components/hr/personnel-file-dashboard-widget.tsx:13-61`
- Existing notification router: `src/trpc/routers/notifications.ts:149-379`
- Existing reminder cron patterns: `src/app/api/cron/inbound-invoice-escalations/route.ts:40-104`, `src/app/api/cron/dunning-candidates/route.ts:67-168`
- Existing cron execution logging: `src/lib/services/cron-execution-logger.ts:18-161`
