---
date: 2026-04-18
last_updated: 2026-04-20
revision: 2
planner: impactj90
git_commit: 3101760fb139ea4fb5cd2257c6f813e2b7a4bf06
branch: staging
repository: terp
ticket: thoughts/shared/tickets/prodi-prelaunch/soll-05-ueberstundenantrag.md
research: thoughts/shared/research/2026-04-17-soll-05-ueberstundenantrag.md
status: ready-for-implementation
t_shirt: L (reduced from XL via D1/D2/D3)
tags: [plan, overtime-request, approval-workflow, arbzg, correction-assistant, bookings]
---

# soll-05 Überstundenantrag (Vorab + Reaktiv) — Implementation Plan

## Overview

Implement a dual-flow overtime request system (planned + reactive/reopen) with approval workflow, ArbZG validation (3 rules), and correction-assistant integration. The design strictly mirrors the absence approval flow (`updateIfStatus` CAS, permission-based approver resolution, best-effort notifications) to minimize architectural novelty.

Scope is **L** (not XL from the ticket) because the following were resolved in the research file and are explicitly deferred:
- **D1**: No `ApprovalRule` table, no role enum — tenant-wide permission-based approvers (`overtime.approve`, `overtime.approve.escalated`) plus a `Singleton OvertimeRequestConfig` with `escalationThresholdMinutes`.
- **D2**: No `utilizationType` field — that's Ticket 3.1 post-launch. Ticket-3 payout pipeline already handles utilization via tariff rule.
- **D3**: ArbZG phase 1 = §3 (daily max from `DayPlan.maxNetWorkTime`), §5 (11h rest), §9 (Sunday/Holiday). **48h/6-month rolling is out of scope.**

## Revision History

- **r2 (2026-04-20)** — Post-review amendments:
  1. Phase 7 `approve` middleware drops `OVERTIME_APPROVE_ESCALATED`; escalation enforcement moves into the service (it requires request context).
  2. Phase 3 / Phase 4: ArbZG re-validation on `approve` is authoritative — fresh warnings are persisted via the `updateIfStatus` payload, overriding the create-time snapshot.
  3. Phase 6: removed source-based exemption sub-step. The reopen gate applies unconditionally to all `createBooking` callers (no `source` field exists today; introducing one is out of scope).
  4. Phase 5 Step 5: clarified that `DailyValue.overtime` is already minutes — `plannedMinutes = dailyValue.overtime` requires no unit conversion (verified against `breaks.ts:247-260`).
  5. Phase 3 cancel: documented asymmetry vs `AbsenceDay` — `OvertimeRequest.cancel` is restricted to `pending` status (no requester self-rescind of approved commitment).
  6. Migration Notes: neutralized "Schichtleiter" assumption — operator must grant `overtime.approve` to whichever group(s) approve overtime in their tenant.
  7. Phase 7: documented DataScope no-op behavior for tenants without department-level rules (including Pro-Di); approver resolution stays tenant-wide.
  8. No change — future-dated `triggerRecalc` is accepted (recalc is idempotent for empty `DailyValue`).
  9. Phase 8 Step 6: added i18n key-naming convention examples under the `overtime_requests.*` namespace.

## Current State Analysis

Verified against the codebase (see research document §1–§10):

- **No `OvertimeRequest` model, service, router, or UI** exists today. `prisma/schema.prisma` has no such table; `src/lib/services/` has no `overtime-request-service.ts`.
- **Reference flow exists**: Absence approval — `absences-repository.ts:315-331` (`updateIfStatus` CAS), `absences-repository.ts:463-480` (`findApproverUserIds` Raw-SQL), `absences-service.ts:355-611` (`createRange`), `absences-service.ts:747-849` (`approve`), `absences-service.ts:851-936` (`reject`), `absences-service.ts:18-39` (`publishUnreadCountUpdate`).
- **Notifications** are typed `"approvals"`/`"errors"`/`"reminders"`/`"system"` (`src/trpc/routers/notifications.ts:60-65`); realtime via SSE over `PubSubHub` (`src/lib/pubsub/hub.ts:75`, `topics.ts`).
- **No ArbZG validator**: `ArbZG`, `Arbeitszeitgesetz`, `DAILY_MAX_EXCEEDED`, `REST_TIME_VIOLATED`, `SUNDAY_WORK` — zero hits in `src/`. Nearest primitive: `DayPlan.maxNetWorkTime` (UI label "Max. Arbeitszeit / 10 Stunden / ArbZG") applied as a cap in `calculator.ts:124-134`.
- **Overtime compute**: `breaks.ts:247-260` — `overtime = max(0, netTime - targetTime)`, no threshold.
- **No role enum** (`SHIFT_LEADER`, `DEPARTMENT_MANAGER`, `HR`); authorization runs exclusively on `UserGroup.permissions` JSONB + `isAdmin`.
- **No `Booking` lock/unlock concept**; day state is stateless per recalc. Closest structural anchor: `MonthlyValue.isClosed` (monthly-level).
- **Correction catalog has two sources**: service (`correction-assistant-service.ts:106-147`, 37 DE codes) and router (`correctionAssistant.ts:93-122`, 24 EN codes — legacy). Both must receive `UNAPPROVED_OVERTIME` additively.
- **Ticket 1 (Nachtschicht, done) and Ticket 3 (Überstunden-Auszahlung, commit `5316ef2f`)** are both merged. Ticket-3 delivers the configurable payout pipeline but without per-request utilization choice.

## Desired End State

- An employee (`overtime.request` permission) can submit a `PLANNED` or `REOPEN` overtime request.
- Tenant-wide permission-holders (`overtime.approve`, optionally `overtime.approve.escalated` above threshold) receive an in-app notification and can approve/reject with ArbZG-warning override.
- Approval of a `REOPEN` request allows a new `direction="in"` booking on a day that already has an `out` booking; without an active approved REOPEN, such an insert is blocked.
- `DailyValue.errorCodes` contains `UNAPPROVED_OVERTIME` when `overtime > 0` and no approved `OvertimeRequest` covers the day; Correction Assistant surfaces the row.
- Admin UI allows changing `OvertimeRequestConfig` (approval required yes/no, lead time, monthly warn threshold, escalation threshold).
- All existing absence/correction flows remain untouched.

### Verification

- `pnpm typecheck && pnpm lint && pnpm test` green.
- Integration test `OvertimeRequestService.test.ts` covers happy + race + reopen paths.
- Playwright spec `e2e-browser/overtime-requests.spec.ts` passes end-to-end MA→Schichtleiter flow.

## Key Discoveries

- **CAS pattern** (`updateMany` with `status = expected` guard): `src/lib/services/absences-repository.ts:315-331`. Reused verbatim.
- **Raw-SQL approver resolution**: `absences-repository.ts:463-480` — copy structure, swap permission literal.
- **Best-effort notify**: `absences-service.ts:595-602` / `834-841` / `921-928` — `try/catch` around `notification.create` + `publishUnreadCountUpdate`.
- **Error-mapping convention**: `handleServiceError` keys off `err.name` suffix (`NotFoundError`/`ValidationError`/`ForbiddenError`), not `constructor.name` — must match.
- **DailyCalc hook point**: `src/lib/services/daily-calc.ts:1159` (`calculate(input)` returns `result`); inject `UNAPPROVED_OVERTIME` between step 3 and `resultToDailyValue` (`:1173`). Pre-load approved-request dates in `buildCalcInput` (`:1149`) to avoid N+1.
- **Booking create entry**: `src/lib/services/bookings-service.ts:330` (`createBooking`). Pre-insert REOPEN check lives here (before Prisma insert).
- **Correction catalog duplication**: Additive only — do not deduplicate in this ticket.

## What We're NOT Doing

- **No `utilizationType` on `OvertimeRequest`** (ACCOUNT / PAYOUT / TIME_OFF) → Ticket 3.1 post-launch.
- **No §3 Abs. 2 ArbZG** (48h/6-month rolling) — separate ticket.
- **No `ApprovalRule` table** — permission-holders + singleton threshold replace it.
- **No JArbSchG / MuSchG** (youth/maternity protective rules).
- **No substitute-approver on absence** of the primary approver (live "is approver currently absent" query). Future ticket.
- **No department/team scoping** for approvers. Tenant-wide only.
- **No email notification**. In-app + SSE only (existing pattern).
- **No refactor** of the dual correction-message catalog (DE service + EN router). Additive only.
- **No cleanup** of the `SHIFT_LEADER`/`DEPARTMENT_MANAGER` references in the ticket text — we ignore them.
- **No overtime reporting dashboard**.
- **No schedule-plan (`DayPlan`) auto-adjustment** on approval.

## Implementation Approach

Eight sequential phases. Each phase ends with automated verification; phases 5, 6, and 8 additionally require manual UI/DB verification. Phases 1–4 can land in one PR (backend foundation); phase 5 in a second PR (calc integration); phase 6 in a third (booking gate); phases 7–8 in the final PR (router + UI). This matches past precedent with `pflicht-03`.

Model shape is locked by D1/D2/D3 — no open design questions remain.

---

## Phase 1: Data Model, Migration, Permissions

### Overview
Create the two new Prisma models (`OvertimeRequest`, `OvertimeRequestConfig`), the Supabase migration, and register the two new permission keys. No service logic yet.

### Changes Required

#### 1. Prisma schema
**File**: `prisma/schema.prisma`
**Changes**: Add two models near the existing `OvertimePayout` block (~line 3010).

```prisma
model OvertimeRequest {
  id                    String    @id @default(uuid()) @db.Uuid
  tenantId              String    @map("tenant_id") @db.Uuid
  employeeId            String    @map("employee_id") @db.Uuid
  requestType           String    @map("request_type") @db.VarChar(20)
  // CHECK (request_type IN ('PLANNED','REOPEN'))
  requestDate           DateTime  @map("request_date") @db.Date
  plannedMinutes        Int       @map("planned_minutes")
  actualMinutes         Int?      @map("actual_minutes")
  reason                String    @db.Text
  status                String    @default("pending") @db.VarChar(20)
  // CHECK (status IN ('pending','approved','rejected','cancelled'))
  approvedBy            String?   @map("approved_by") @db.Uuid
  approvedAt            DateTime? @map("approved_at") @db.Timestamptz(6)
  rejectionReason       String?   @map("rejection_reason") @db.Text
  arbzgWarnings         String[]  @map("arbzg_warnings")
  arbzgOverrideReason   String?   @map("arbzg_override_reason") @db.Text
  createdBy             String?   @map("created_by") @db.Uuid
  createdAt             DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt             DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employee Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  @@index([tenantId, employeeId, requestDate])
  @@index([tenantId, status])
  @@index([tenantId, employeeId, status, requestType])
  @@map("overtime_requests")
}

model OvertimeRequestConfig {
  id                            String   @id @default(uuid()) @db.Uuid
  tenantId                      String   @unique @map("tenant_id") @db.Uuid
  approvalRequired              Boolean  @default(true) @map("approval_required")
  leadTimeHours                 Int      @default(0) @map("lead_time_hours")
  monthlyWarnThresholdMinutes   Int?     @map("monthly_warn_threshold_minutes")
  escalationThresholdMinutes    Int?     @map("escalation_threshold_minutes")
  createdAt                     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt                     DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@map("overtime_request_config")
}
```

Also add inverse relations on `Tenant` (`overtimeRequests OvertimeRequest[]`, `overtimeRequestConfig OvertimeRequestConfig?`) and `Employee` (`overtimeRequests OvertimeRequest[]`).

#### 2. Supabase migration
**File**: `supabase/migrations/<timestamp>_create_overtime_requests.sql` (via `pnpm db:migrate:new create_overtime_requests`)

Must contain:
- `CREATE TABLE overtime_requests` with CHECK constraints on `request_type` and `status`.
- Partial unique index: `CREATE UNIQUE INDEX overtime_requests_active_reopen ON overtime_requests (tenant_id, employee_id, request_date) WHERE request_type = 'REOPEN' AND status = 'approved'` — guarantees at most one active REOPEN per employee-day for the pre-insert check in Phase 6.
- Three btree indexes matching the Prisma `@@index` declarations.
- FKs to `tenants` and `employees` with `ON DELETE CASCADE`.
- `CREATE TABLE overtime_request_config` with unique `(tenant_id)`.
- `updated_at` triggers (follow pattern from `20260101000085_create_user_tenants.sql` or whichever trigger template the repo uses).

#### 3. Permission catalog
**File**: `src/lib/auth/permission-catalog.ts`
**Changes**: Insert three new entries directly after line 99 (`absences.manage`).

```ts
  p("overtime.request", "overtime", "request", "Request overtime"),
  p("overtime.approve", "overtime", "approve", "Approve overtime requests"),
  p(
    "overtime.approve.escalated",
    "overtime",
    "approve_escalated",
    "Approve escalated overtime requests (above configured threshold)"
  ),
```

### Success Criteria

#### Automated Verification
- [x] `pnpm db:generate` succeeds with no schema errors.
- [ ] `pnpm db:reset` applies the migration cleanly from scratch.
- [x] `pnpm typecheck` passes (the new Prisma types compile).
- [ ] `pnpm lint` passes.

#### Manual Verification
- [ ] In Prisma Studio (`pnpm db:studio`), the two new tables are present with correct columns.
- [ ] Partial unique index `overtime_requests_active_reopen` exists (`\d+ overtime_requests` in psql).

---

## Phase 2: Repository + Service — Create / Get / List

### Overview
Repository (Prisma access + `updateIfStatus` + `findApproverUserIds` + `hasActiveReopen`) and the read-side + create-side of the service. No approve/reject yet.

### Changes Required

#### 1. Repository
**File**: `src/lib/services/overtime-request-repository.ts` (new)

Mirror `absences-repository.ts` structure. Key functions:

```ts
export async function create(prisma, tenantId, data) { /* prisma.overtimeRequest.create */ }

export async function findById(prisma, tenantId, id) { /* findFirst with tenantId */ }

export async function findMany(prisma, tenantId, filter: { employeeId?, status?, requestType?, from?, to? }) { /* ... */ }

export async function updateIfStatus(
  prisma, tenantId, id, expectedStatus, data
): Promise<OvertimeRequestWithIncludes | null> {
  const { count } = await prisma.overtimeRequest.updateMany({
    where: { id, tenantId, status: expectedStatus },
    data,
  })
  if (count === 0) return null
  return prisma.overtimeRequest.findFirst({
    where: { id, tenantId },
    include: { employee: true },
  })
}

// Mirrors absences-repository.ts:463-480. Raw SQL via Prisma tagged template.
export async function findApproverUserIds(
  prisma,
  tenantId: string,
  permissionKey: "overtime.approve" | "overtime.approve.escalated",
  excludeUserId?: string
): Promise<string[]> { /* SELECT DISTINCT u.id ... ug.permissions @> '["..."]'::jsonb */ }

// Finds a non-self user for notification recipient lookup after approval.
export async function findUserIdForEmployee(
  prisma, tenantId, employeeId
): Promise<string | null> { /* Raw-SQL on user_tenants + employees mapping */ }

// Used by the Phase 6 booking pre-insert gate.
export async function hasActiveReopen(
  prisma, tenantId, employeeId, date: Date
): Promise<boolean> {
  const count = await prisma.overtimeRequest.count({
    where: {
      tenantId, employeeId,
      requestType: "REOPEN",
      status: "approved",
      requestDate: date,
    },
  })
  return count > 0
}

// Batch variant used by Phase 5's daily-calc integration.
export async function findApprovedRequestDates(
  prisma, tenantId, employeeId, from: Date, to: Date
): Promise<Set<string>> { /* ISO date keys */ }

export async function createNotification(prisma, { tenantId, userId, type, title, message, link }) {
  return prisma.notification.create({ data: { tenantId, userId, type, title, message, link } })
}
```

#### 2. Config repository + service helpers
**File**: `src/lib/services/overtime-request-config-service.ts` (new)

Singleton pattern (like `BillingTenantConfig`). `getOrCreate(prisma, tenantId)` returns defaults on first read. `update(prisma, tenantId, input, audit)` uses `upsert` + writes one audit row.

#### 3. Service — create / list / getById
**File**: `src/lib/services/overtime-request-service.ts` (new)

Domain errors follow the `.name` convention:
```ts
export class OvertimeRequestNotFoundError extends Error { name = "OvertimeRequestNotFoundError" }
export class OvertimeRequestValidationError extends Error { name = "OvertimeRequestValidationError" }
export class OvertimeRequestForbiddenError extends Error { name = "OvertimeRequestForbiddenError" }
```

`create()` structure:
1. Validate input shape (Zod at router level; service re-validates lead-time, `plannedMinutes > 0`, `requestDate >= today - N days`).
2. Load `OvertimeRequestConfig`; if `approvalRequired=false`, short-circuit — create row with `status="approved"`, `approvedBy=audit.userId`, `approvedAt=now`, skip notifications, return.
3. Run `ArbZGValidator.validate(...)` (phase 4) → store `arbzgWarnings` on the draft row.
4. `repo.create(...)` with `status="pending"`.
5. `findApproverUserIds(prisma, tenantId, "overtime.approve", excludeUserId=audit.userId)` → dedupe.
6. If `escalationThresholdMinutes != null && plannedMinutes >= threshold` → union with `findApproverUserIds(..., "overtime.approve.escalated", ...)`.
7. For each approver: `repo.createNotification({ type: "approvals", title: "Neuer Überstundenantrag", message: "..." , link: "/approvals/overtime-requests/<id>" })` + `publishUnreadCountUpdate(ctx, userId, "approvals")` — all in best-effort `try/catch`.
8. Write audit log (action `"create_overtime_request"`).

### Success Criteria

#### Automated Verification
- [ ] Unit tests for `OvertimeRequestService.create` pass: `pnpm vitest run src/lib/services/__tests__/overtime-request-service.test.ts`
- [ ] Unit tests cover: happy path (pending), `approvalRequired=false` auto-approve, escalation union, `excludeUserId` skips self, ArbZG warnings persisted to the row.
- [ ] Repository unit tests for `updateIfStatus`, `hasActiveReopen`, `findApprovedRequestDates` pass.
- [x] `pnpm typecheck` clean.

---

## Phase 3: Service — Approve / Reject / Cancel + Notifications

### Overview
Lifecycle mutations. Mirrors `absences-service.ts:747-936` 1:1.

### Changes Required

#### 1. `approve(prisma, tenantId, id, input: { arbzgOverrideReason?: string }, dataScope, audit)`
**File**: `src/lib/services/overtime-request-service.ts`

1. `repo.findById(tenantId, id)` → `OvertimeRequestNotFoundError` on miss.
2. `checkDataScope(dataScope, request.employeeId)` → `OvertimeRequestForbiddenError` on miss.
3. Re-run `ArbZGValidator.validate(...)` using the same builder as in `create` (the state between create and approve may have changed — new bookings, rest-time violation, holiday update). If returned `warnings.length > 0` and `!input.arbzgOverrideReason` → throw `OvertimeRequestValidationError("arbzg_override_reason_required")`. The freshly computed warnings are persisted as part of Step 5's `updateIfStatus` data payload (alongside `status`, `approvedBy`, `approvedAt`, `arbzgOverrideReason`).
4. If escalation needed (`plannedMinutes >= config.escalationThresholdMinutes`), require approver holds `overtime.approve.escalated` — checked via `ctx.user.userGroup.permissions` array (or `isAdmin`). Raise `OvertimeRequestForbiddenError` otherwise.
5. `repo.updateIfStatus(tenantId, id, "pending", { status: "approved", approvedBy: audit.userId, approvedAt: new Date(), arbzgOverrideReason: input.arbzgOverrideReason ?? null, arbzgWarnings: freshWarnings })` — where `freshWarnings` is the array returned from the re-validation in Step 3. `null` return → `OvertimeRequestValidationError("invalid_status_transition")`.
6. For `requestType="PLANNED"`: call `triggerRecalc(tenantId, employeeId, requestDate, requestDate)` (best-effort) so `UNAPPROVED_OVERTIME` flips off.
7. Notify requester via `findUserIdForEmployee` + `createNotification({ type: "approvals", title: "Überstundenantrag genehmigt", link: "/me/overtime-requests/<id>" })` + `publishUnreadCountUpdate` — try/catch.
8. Audit row (action `"approve_overtime_request"`).

#### 2. `reject(prisma, tenantId, id, reason: string, dataScope, audit)`
Symmetric. `reason` stored in `rejectionReason`. Notification title `"Überstundenantrag abgelehnt"`. No recalc trigger. Audit action `"reject_overtime_request"`.

#### 3. `cancel(prisma, tenantId, id, dataScope, audit)`
Self-service for the requester. Only permitted when `status="pending"`. Uses `updateIfStatus(..., "pending", { status: "cancelled" })`. Notify approvers (bulk).

Note: Unlike `AbsenceDay` (where `approved → cancelled` is allowed for the requester), `OvertimeRequest` restricts `cancel` to `pending` status. Once approved, the request represents an employer commitment that cannot be unilaterally rescinded by the requester. Removing approved overtime must go through an administrative correction flow, not self-service cancel.

#### 4. Error mapping already covered by `handleServiceError` via `.name` suffix convention (`src/trpc/errors.ts:10-105`).

### Success Criteria

#### Automated Verification
- [ ] Unit tests cover: happy approve, happy reject, double-approve race (second caller gets `ValidationError`), arbzg-override-required error, arbzg-override accepted, wrong `dataScope` rejects, cancel-after-approve rejected, escalation permission enforcement.
- [ ] Notification-create assertions: exactly one row per recipient, `type="approvals"`, link contains the request id.
- [ ] `pnpm vitest run src/lib/services/__tests__/overtime-request-service.test.ts` green.
- [x] `pnpm typecheck` clean.

---

## Phase 4: ArbZG Validator (3 rules)

### Overview
Pure logic with tenant-config inputs. Called from `create` (phase 2) and `approve` (phase 3).

### Changes Required

#### 1. Validator module
**File**: `src/lib/services/arbzg-validator.ts` (new)

```ts
export const ARBZG_DAILY_MAX_EXCEEDED = "DAILY_MAX_EXCEEDED"
export const ARBZG_REST_TIME_VIOLATED = "REST_TIME_VIOLATED"
export const ARBZG_SUNDAY_WORK = "SUNDAY_WORK"

export interface ArbZGValidateInput {
  date: Date
  plannedAdditionalMinutes: number
  currentTargetMinutes: number        // from DailyValue or DayPlan.regularHours
  maxNetWorkTimeMinutes: number       // from DayPlan.maxNetWorkTime (§3 cap)
  previousDayLastOutAt: Date | null   // last work-out booking (prev calendar day)
  nextDayFirstInAt: Date | null       // optional symmetry check
  isSundayOrHoliday: boolean
}

export function validate(input: ArbZGValidateInput): string[] {
  const warnings: string[] = []

  // §3: daily max
  const projected = input.currentTargetMinutes + input.plannedAdditionalMinutes
  if (projected > input.maxNetWorkTimeMinutes) warnings.push(ARBZG_DAILY_MAX_EXCEEDED)

  // §5: 11h rest vs prev out (only for PLANNED requests with known start-of-day; use day start if no planned-start time is provided)
  if (input.previousDayLastOutAt) {
    const minimumRestMs = 11 * 60 * 60 * 1000
    const startOfDay = new Date(input.date)
    startOfDay.setHours(0, 0, 0, 0)
    const restMs = startOfDay.getTime() - input.previousDayLastOutAt.getTime()
    if (restMs < minimumRestMs) warnings.push(ARBZG_REST_TIME_VIOLATED)
  }

  // §9: Sunday / public holiday
  if (input.isSundayOrHoliday) warnings.push(ARBZG_SUNDAY_WORK)

  return warnings
}
```

#### 2. Input builder in the service
**File**: `src/lib/services/overtime-request-service.ts`

Helper `buildArbZGInput(prisma, tenantId, employeeId, date, plannedMinutes)`:
- Load `EmployeeDayPlan` for the date → `maxNetWorkTime` (falls back to system default 600 minutes if null) and `targetMinutes` via existing `resolveTargetHours()` logic (`daily-calc.ts:367` — re-use as exported helper or duplicate the read).
- `prisma.booking.findFirst({ where: { tenantId, employeeId, bookingDate: <prev day>, bookingType: { direction: "out", category: "work" } }, orderBy: { editedTime: "desc" } })`.
- `prisma.holiday.findFirst({ where: { tenantId, date } })` + `date.getDay() === 0` check.

#### 3. Wire into `create` and `approve`
- In `create`: compute warnings pre-insert, persist to row. These warnings are for UI display in the pending list only.
- In `approve`: re-run the validator and write the fresh warnings back into `arbzgWarnings` via the `updateIfStatus` payload. The approval decision (whether `arbzgOverrideReason` is required) is based on this re-validation, not the create-time snapshot.

### Success Criteria

#### Automated Verification
- [ ] Unit tests (`src/lib/services/__tests__/arbzg-validator.test.ts`): 10h exceeded, 11h rest violated, Sunday, holiday, Saturday non-warning, combinations, zero-warning happy path.
- [ ] Service-level tests in phase 2/3 cover `arbzgWarnings` round-trip + override enforcement.
- [x] `pnpm typecheck` clean.

---

## Phase 5: DailyCalc Integration — `UNAPPROVED_OVERTIME`

### Overview
Add `UNAPPROVED_OVERTIME` to the error catalog, then push it into `DailyValue.errorCodes` whenever `overtime > 0` and no approved `OvertimeRequest` exists for the day.

### Changes Required

#### 1. Error constant
**File**: `src/lib/calculation/errors.ts`
**Changes**: After line 45, add:
```ts
/** Overtime recorded without an approved OvertimeRequest */
export const ERR_UNAPPROVED_OVERTIME = "UNAPPROVED_OVERTIME"
```
Include it in the `ERROR_CODES` set at line 74.

#### 2. Correction-assistant wiring (additive)
**File**: `src/lib/services/correction-assistant-service.ts`

- Add `const WARN_UNAPPROVED_OVERTIME = "UNAPPROVED_OVERTIME"` in the service-level block (lines 55–62) — we treat it as a warning in the catalog even though it's an error code for the calc engine (severity is set on the catalog entry).
- Add a `mapCorrectionErrorType` case (line 69+): `case ERR_UNAPPROVED_OVERTIME: return "unapproved_overtime"`.
- Append to the DE `defaultCorrectionMessages` (line 106):
  ```ts
  { tenantId, code: "UNAPPROVED_OVERTIME", defaultText: "Ungenehmigte Überstunden", severity: "error", description: "Überstunden ohne genehmigten Antrag. Im Korrekturassistent nachträglich genehmigen oder ablehnen." },
  ```

**File**: `src/trpc/routers/correctionAssistant.ts` (legacy EN catalog, lines 93–122)
- Append: `{ tenantId, code: "UNAPPROVED_OVERTIME", defaultText: "Unapproved overtime", severity: "error", description: "Overtime without an approved request." }`.

**Note**: `ensureDefaults` (`correction-assistant-service.ts:149-167`) auto-seeds missing codes on next list call — no migration backfill needed for existing tenants.

#### 3. `daily-calc.ts` hook
**File**: `src/lib/services/daily-calc.ts`

Inside `calculateWithBookings` (after line 1165, before `resultToDailyValue` at 1173):

```ts
if (result.overtime > 0) {
  const approvedDates = context?.approvedOvertimeDates
  const key = date.toISOString().slice(0, 10)
  if (!approvedDates || !approvedDates.has(key)) {
    result.errorCodes.push(ERR_UNAPPROVED_OVERTIME)
    result.hasError = true
  }
}
```

`DailyCalcContext` gains an optional `approvedOvertimeDates?: Set<string>`. Batch-compute it in the range entry point (`recalculateRange` / `calculateDays`) via `overtime-request-repository.findApprovedRequestDates(prisma, tenantId, employeeId, from, to)`. **No new per-day query** — one range query per recalc.

#### 4. Correction-assistant list-items path
No change needed — `listItems()` already reads `DailyValue.errorCodes` and joins `CorrectionMessage`; new code flows through automatically.

#### 5. "Approve as overtime" correction-assistant action
**File**: `src/lib/services/correction-assistant-service.ts` (extension) + new tRPC proc in `correctionAssistant.ts`
- New service function `approveAsOvertime(prisma, tenantId, employeeId, date, audit)` → creates an `OvertimeRequest` with `requestType="PLANNED"`, `plannedMinutes = dailyValue.overtime`, `status="approved"`, `approvedBy=audit.userId`, then triggers recalc.

  Note: `DailyValue.overtime` is stored as minutes (verified against `breaks.ts:247-260` where `overtime = max(0, netTime - targetTime)` with both operands in minutes). `plannedMinutes = dailyValue.overtime` is a direct assignment — no unit conversion.
- Router exposes it as `correctionAssistant.approveAsOvertime` gated on `corrections.manage`.

### Success Criteria

#### Automated Verification
- [ ] Unit test: `calculateWithBookings` pushes `UNAPPROVED_OVERTIME` when `overtime>0` and no approved request.
- [ ] Unit test: code is NOT pushed when `approvedOvertimeDates` contains the date.
- [ ] Unit test: code is NOT pushed when `overtime=0`.
- [ ] Integration test: MA books 2h beyond target → recalc → `DailyValue.errorCodes` contains `UNAPPROVED_OVERTIME` → approve as overtime via correction-assistant → recalc → code cleared.
- [ ] `pnpm vitest run src/lib/calculation/__tests__/calculator.test.ts` green.
- [x] `pnpm typecheck` clean.

#### Manual Verification
- [ ] Correction-Assistant UI shows the new row with the German message "Ungenehmigte Überstunden".
- [ ] After "Als Überstunden genehmigen" click, the row disappears on next refresh and a new approved `OvertimeRequest` appears in the tenant's request list.

**Implementation Note**: Pause after Phase 5 for manual UI verification before Phase 6.

---

## Phase 6: Reopen Pre-Insert Gate in `bookings-service.createBooking`

### Overview
Block a new `direction="in"` work booking on a day that already has at least one `direction="out"` work booking, unless an active approved `REOPEN` request exists for that `(employee, date)`.

### Changes Required

#### 1. Booking service
**File**: `src/lib/services/bookings-service.ts` (function `createBooking` at `:330`)

Before the Prisma `create` call (and inside any existing transaction), when `bookingType.direction === "in"` and `bookingType.category === "work"`:

```ts
const dayOuts = await prisma.booking.count({
  where: {
    tenantId,
    employeeId,
    bookingDate: input.bookingDate,
    bookingType: { direction: "out", category: "work" },
  },
})
if (dayOuts > 0) {
  const allowed = await overtimeRequestRepo.hasActiveReopen(
    prisma, tenantId, employeeId, input.bookingDate
  )
  if (!allowed) {
    throw new BookingValidationError("reopen_not_approved")
  }
}
```

`BookingValidationError` must follow the `.name` convention (`name = "BookingValidationError"`) so `handleServiceError` maps to 400. Check existing `bookings-service.ts` error classes first — reuse if present.

### Success Criteria

#### Automated Verification
- [ ] Unit test: attempting to create a second IN after an OUT without REOPEN → `BookingValidationError`.
- [ ] Unit test: with an approved REOPEN → insert succeeds.
- [ ] Unit test: first IN of the day → insert succeeds (no OUT yet).
- [ ] Integration test: full reopen flow — submit REOPEN request → approve → insert IN → verify booking exists.
- [ ] `pnpm test` green.
- [x] `pnpm typecheck` clean.

#### Manual Verification
- [ ] In browser: log in as MA, click out, try to click in again → error toast with localized message.
- [ ] Submit REOPEN request → approve as Schichtleiter → retry click-in → succeeds.

---

## Phase 7: tRPC Routers

### Overview
Two new routers registered in `_app.ts`: `overtimeRequests` and `overtimeRequestConfig`. Plus the `correctionAssistant.approveAsOvertime` procedure from Phase 5.

### Changes Required

#### 1. `src/trpc/routers/overtimeRequests.ts` (new)
Procedures:
- `create` — `tenantProcedure.use(requirePermission(OVERTIME_REQUEST))`, Zod input `{ requestType: z.enum(["PLANNED","REOPEN"]), requestDate: z.coerce.date(), plannedMinutes: z.number().int().min(1), reason: z.string().min(2).max(2000) }`.
- `list` — `tenantProcedure.use(applyDataScope())` (requester-self OR with approver permission returns all in scope). Zod pagination + filter `{ status?, requestType?, employeeId?, from?, to?, limit, offset }`.
- `getById` — `tenantProcedure.use(applyDataScope())`.
- `approve` — `tenantProcedure.use(requirePermission(OVERTIME_APPROVE)).use(applyDataScope())`, input `{ id: z.string().uuid(), arbzgOverrideReason: z.string().max(2000).optional() }`. Escalation enforcement (checking that the approver holds `overtime.approve.escalated` when `plannedMinutes >= config.escalationThresholdMinutes`) lives in the service (Phase 3 Step 4), not in middleware, because it requires request context.
- `reject` — same middleware, input `{ id: z.string().uuid(), reason: z.string().min(2).max(2000) }`.
- `cancel` — `tenantProcedure.use(requireSelfOrPermission(...))`, input `{ id: z.string().uuid() }`.
- `pendingCount` — for the approver badge; returns `{ count: number }` scoped to users holding `overtime.approve`.

Note on DataScope: `approve`, `reject`, and `list` use `applyDataScope()` for consistency with the absence flow. For tenants without department-level data-scope rules (including Pro-Di), this is a no-op. For tenants that configure DataScope rules later, approvers will only see requests within their scope — this is intentional and does not require changes to the approver resolution (`findApproverUserIds` remains tenant-wide).

All wrap service calls in `try/catch` + `handleServiceError(err)`.

#### 2. `src/trpc/routers/overtimeRequestConfig.ts` (new)
- `get` — `tenantProcedure.use(requirePermission(SETTINGS_MANAGE))` → `getOrCreate`.
- `update` — same, Zod all-optional partial input.

#### 3. Register routers
**File**: `src/trpc/routers/_app.ts`
Add `overtimeRequests: overtimeRequestsRouter, overtimeRequestConfig: overtimeRequestConfigRouter` alongside existing entries.

#### 4. Permission-key constants (reuse the `permissionIdByKey` helper used in `absences.ts:43-45`).

### Success Criteria

#### Automated Verification
- [x] `pnpm typecheck` passes — tRPC inference picks up the new routers.
- [ ] Unit tests for each router procedure validate middleware chain and error mapping.
- [ ] `pnpm vitest run src/trpc/routers/__tests__/overtimeRequests.test.ts` green.

---

## Phase 8: UI

### Overview
Four surfaces: MA request form, MA request list, Approver queue, Admin config. Plus the "Approve as overtime" CTA in the correction-assistant detail sheet.

### Changes Required

#### 1. MA form + list
**Files**:
- `src/app/[locale]/(dashboard)/time-tracking/overtime-requests/new/page.tsx` — form (fields: `requestType` radio, `requestDate` picker, `plannedMinutes` input, `reason` textarea). Shows ArbZG warnings inline under submit button (client-side preview via a new `overtimeRequests.previewArbzg` query — OR use returned `arbzgWarnings` from `create` for post-submit display; recommend preview query for UX).
- `src/app/[locale]/(dashboard)/time-tracking/overtime-requests/page.tsx` — MA's own list with status badges and cancel button for pending rows.
- `src/hooks/use-overtime-requests.ts` — tRPC wrapper hooks.

#### 2. Approver queue
- `src/app/[locale]/(dashboard)/approvals/overtime-requests/page.tsx` — pending-first list, detail sheet with approve/reject buttons, ArbZG-warning banner with mandatory override-reason textarea (enabled only when warnings are non-empty; submit disabled until non-empty reason).
- Add to existing approvals sidebar nav (check `src/components/navigation/sidebar.tsx` or equivalent — locate via grep for `"absences.approve"` rendering).
- Pending count badge wired to `overtimeRequests.pendingCount` subscription / polling.

#### 3. Admin config
- `src/app/[locale]/(dashboard)/admin/settings/overtime/page.tsx` — singleton form for the 4 `OvertimeRequestConfig` fields.
- Gate via `requirePermission(SETTINGS_MANAGE)`.

#### 4. Correction-assistant CTA
**File**: `src/components/correction-assistant/detail-sheet.tsx` (or equivalent — find via grep for `listItems` consumer).
- When `row.code === "UNAPPROVED_OVERTIME"`, render a "Als Überstunden genehmigen" button calling `correctionAssistant.approveAsOvertime.useMutation`. On success, invalidate the list query.

#### 5. Notification-preference labels
**File**: `src/app/[locale]/(dashboard)/me/notifications/page.tsx` (or wherever `NotificationPreference` toggles render). No schema change — `"approvals"` already covers overtime. Just ensure copy mentions "Überstundenanträge" in the tooltip.

#### 6. i18n strings
Add German + English message keys under `messages/de.json` / `messages/en.json` → namespace `overtime_requests.*`. Follow the `feedback_i18n_tenant_only.md` memory — tenant UI must use next-intl.

Key-naming convention examples for consistency:
- `overtime_requests.status.pending` / `.approved` / `.rejected` / `.cancelled`
- `overtime_requests.form.plannedMinutes.label`
- `overtime_requests.form.requestType.planned` / `.reopen`
- `overtime_requests.arbzg.daily_max_exceeded` / `.rest_time_violated` / `.sunday_work`
- `overtime_requests.arbzg.override_reason.label`
- `overtime_requests.approver.queue.title`
- `overtime_requests.notification.submitted.title` / `.approved.title` / `.rejected.title`

Apply the same namespacing (`overtime_requests.*`) consistently across all new UI surfaces.

### Success Criteria

#### Automated Verification
- [ ] Playwright spec `src/e2e-browser/overtime-requests.spec.ts` passes: MA submits → Schichtleiter approves → MA sees approved.
- [ ] Playwright spec: ArbZG warning forces override-reason entry (submit disabled until filled).
- [ ] Playwright spec: MA tries to stamp in after stamping out → blocked; submits REOPEN → approved → stamp-in succeeds.
- [x] `pnpm lint` — no new overtime-related errors (pre-existing errors unchanged).
- [x] `pnpm typecheck` clean.
- [x] `pnpm vitest run src/trpc/routers/__tests__` — 1917 tests pass (permission count + router bumped 175→180).

#### Manual Verification
- [ ] Request form respects `approvalRequired=false` (auto-approve path) — no pending state shown.
- [ ] Approver queue pending-count badge updates in real-time via SSE (open two tabs).
- [ ] Correction-assistant "Als Überstunden genehmigen" clears the row on next refresh.
- [ ] Admin config page saves and re-loads all four fields.
- [ ] Feature matches the existing admin-approvals visual style (no AI borders per `feedback_no_ai_borders.md`).

**Implementation Note**: Pause after Phase 8 for full-scenario manual test before PR merge.

**Note on permission key**: The plan text uses `overtime.approve.escalated`, but the existing permission-catalog invariant test enforces `key === resource.action` (no nested dots in the action half). The key was renamed to `overtime.approve_escalated` to satisfy the invariant while keeping the resource/action structure consistent with other two-word actions (`calculate_day`, `view_all`, etc.).

---

## Testing Strategy

### Unit Tests

- **`arbzg-validator.test.ts`**: per-rule, combinations, boundary conditions (exactly 10h, exactly 11h rest, Saturday vs Sunday).
- **`overtime-request-service.test.ts`**: create happy, `approvalRequired=false`, escalation union, double-approve race (CAS), approve without override when warnings exist, approve with override, reject persists reason, cancel-after-approve rejected.
- **`overtime-request-repository.test.ts`**: `updateIfStatus` guards, `hasActiveReopen` partial-unique-index enforcement, `findApprovedRequestDates` range correctness.
- **`bookings-service.createBooking` extension**: reopen gate paths.
- **`calculator.test.ts` extension**: `UNAPPROVED_OVERTIME` push/skip by `approvedOvertimeDates`.

### Integration Tests (shared DB, transaction rollback)

- End-to-end PLANNED flow: submit → approve → book time → recalc → `DailyValue.overtime` correct, no `UNAPPROVED_OVERTIME`.
- End-to-end REOPEN flow: submit → approve → book IN → new booking accepted.
- Unapproved-overtime flow: book 2h over → recalc → `UNAPPROVED_OVERTIME` in `errorCodes` → correction-assistant `approveAsOvertime` → recalc → code cleared.
- ArbZG flow: submit request that breaches 10h → `arbzgWarnings` populated → approve without override fails → approve with override succeeds.
- Multi-tenant isolation: create request in tenant A → tenant B list returns empty.
- Escalation: config threshold = 240 → 300-minute request → only escalated approvers notified.

### Playwright E2E

- MA-submit → Schichtleiter-approve → MA-sees (multi-user).
- Schichtleiter-reject with reason → MA sees rejection.
- ArbZG override forces reason.
- REOPEN flow: stamp-in blocked → request → approve → stamp-in succeeds.
- Admin toggles `approvalRequired=false` → MA request auto-approves.

## Performance Considerations

- `findApprovedRequestDates` is one query per recalc range — **not** per day. Index `(tenantId, employeeId, status, requestType)` supports it.
- Approver resolution runs once per `create` — typical tenant has ≤ 10 approvers, no pagination needed.
- Notification writes are best-effort and can be lost on a publisher crash; this matches existing absence behavior and is acceptable per the research (Section 6).
- Partial unique index on active REOPEN is both the correctness guarantee and the fast-path for `hasActiveReopen` lookups.

## Migration Notes

- **No backfill required**: The new tables start empty. Existing tenants' `OvertimeRequestConfig` is created lazily on first read via `getOrCreate`.
- **Correction-message catalog**: `ensureDefaults` auto-seeds the new `UNAPPROVED_OVERTIME` row on next `listMessages`/`listItems` call per tenant. No data migration.
- **Permission catalog**: New keys are added to the catalog; they must be assigned to the UserGroup(s) that should approve overtime requests. Document this in the PR release notes — operators need to grant `overtime.approve` (and optionally `overtime.approve.escalated`) after deploy. No assumption about specific group names.
- **Rollback**: `DROP TABLE overtime_requests; DROP TABLE overtime_request_config;` — safe, no tenant-side references other than the DailyCalc hook (which tolerates `approvedOvertimeDates` being `undefined`).

## References

- Ticket: `thoughts/shared/tickets/prodi-prelaunch/soll-05-ueberstundenantrag.md`
- Research: `thoughts/shared/research/2026-04-17-soll-05-ueberstundenantrag.md` (contains D1/D2/D3 architecture decisions that drive this plan)
- Reference flow: `src/lib/services/absences-service.ts:355-936`, `absences-repository.ts:315-480`
- Sibling Ticket 3 plan: `thoughts/shared/plans/2026-04-17-pflicht-03-ueberstunden-auszahlung.md`
- Ticket 3 code: commit `5316ef2f` (tariff-driven payout pipeline — no per-request utilization)
- Error-mapping convention: `src/trpc/errors.ts:10-105`
- Correction-assistant extension site: `src/lib/services/correction-assistant-service.ts:55-147`
- DailyCalc hook site: `src/lib/services/daily-calc.ts:1100-1188`
