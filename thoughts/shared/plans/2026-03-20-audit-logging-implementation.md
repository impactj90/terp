# Audit Logging Implementation Plan

## Overview

The audit logging system has a **complete read stack** (database table, Prisma model, repository, service, tRPC router, React hook, UI components, admin page at `/admin/audit-logs`) but **no write path**. The write path existed in the former Go backend and was never ported to TypeScript. This plan implements the missing write path and integrates it across all services that perform mutations.

## Current State Analysis

### What Exists (Working)
- **Database**: `audit_logs` table with 5 indexes (migration `20260101000041`)
- **Prisma model**: `AuditLog` at `prisma/schema.prisma:2682-2706`
- **Repository**: `src/lib/services/audit-logs-repository.ts` — read-only (`findMany`, `count`, `findById`)
- **Service**: `src/lib/services/audit-logs-service.ts` — read-only (`list`, `getById`)
- **Router**: `src/trpc/routers/auditLogs.ts` — read-only (`list`, `getById`)
- **Frontend**: Complete UI stack (hook, 6 components, admin page, sidebar nav, i18n)

### What's Missing
1. No `create` function in audit-logs-repository or audit-logs-service
2. Zero `prisma.auditLog.create` calls in the entire TypeScript codebase
3. No `computeChanges` diff helper for before/after change sets
4. tRPC context does not extract `ipAddress` or `userAgent` from the request
5. ~60 services with mutations produce no audit log entries
6. Some services (MEDIUM/LOW priority) don't receive `userId` — only `prisma` + `tenantId`

### Key Discoveries
- Bookings router passes `ctx.user!.id` as `userId` to service: `src/trpc/routers/bookings.ts:334`
- Absences router passes `ctx.user?.id ?? null` for createRange: `src/trpc/routers/absences.ts:374`
- MEDIUM/LOW services (e.g., `absence-type-service.ts`) only receive `(prisma, tenantId, input)` — no userId
- The `audit_logs` table has `ip_address` and `user_agent` TEXT columns, but `createTRPCContext` (`src/trpc/init.ts:57-131`) does not extract these from the request
- All services follow the same mutation pattern: validate → fetch existing → write → side effects
- The Go backend used fire-and-forget: `auditLogService.Log(...)` with errors swallowed

## Desired End State

Every create, update, and delete mutation in every service writes an audit log entry with:
- `action`: "create", "update", "delete" (or "approve", "reject", "cancel", "close", "finalize", "forward", "export", "import" where applicable)
- `entityType`: snake_case entity name matching the DB table (e.g., "booking", "employee", "absence_day")
- `entityId`: UUID of the affected record
- `entityName`: human-readable identifier (e.g., employee's full name, booking type code)
- `changes`: JSONB diff with `{ fieldName: { old: value, new: value } }` for updates; full record snapshot for creates; `null` for deletes
- `userId`: the acting user's UUID
- `ipAddress` / `userAgent`: extracted from the HTTP request
- `metadata`: optional context (e.g., `{ source: "web" }`, `{ reason: "..." }`)

### Verification
- The admin audit log viewer at `/admin/audit-logs` displays new entries with correct data
- Filtering by entity type, action, user, and date range works
- The JSON diff viewer (`audit-log-json-diff.tsx`) correctly renders before/after changes
- Audit log failures never block actual mutations — verified by tests

## What We're NOT Doing

- **No database changes** — the `audit_logs` table schema is already complete
- **No Prisma schema changes** — the `AuditLog` model already maps all columns
- **No frontend changes** — the read stack and UI are already complete
- **No Prisma middleware approach** — loses business context (entity names, metadata, userId)
- **No tRPC middleware approach** — can't capture before/after state from service layer
- **No login/logout audit logging** — this is a separate auth concern (different flow)

## Implementation Approach

**Utility-based direct calls**: Each service explicitly calls `auditLog.log(...)` after successful mutations. This is the most reliable, testable, and transparent approach — each audit call is visible in the code, with full control over what data is logged.

### Critical Pattern: Fire-and-Forget

```typescript
// CRITICAL: Audit log failures must NEVER block the actual operation.
// Every audit log call in every service MUST use this pattern:
await auditLog.log({ ... }).catch(err => console.error('[AuditLog] Failed:', err))
```

This pattern is non-negotiable. A failed audit log write must never:
- Throw an error to the caller
- Block the response to the user
- Roll back the actual mutation
- Cause a 500 error

The `log()` function itself also wraps its body in try/catch as a defense-in-depth measure, but callers MUST still use `.catch()` to guard against any unexpected synchronous throws.

---

## Phase 1: Overview & Current State

This document. No code changes.

### Success Criteria:
#### Automated Verification:
- [x] Plan reviewed and approved

---

## Phase 2: Core Infrastructure

### Overview
Add the write path to the audit logging system: repository `create`, service `log` utility, `computeChanges` diff helper, and IP/user-agent extraction in tRPC context.

### Changes Required:

#### 1. Add `create` to Audit Logs Repository
**File**: `src/lib/services/audit-logs-repository.ts`
**Changes**: Add `create` function and `AuditLogCreateInput` type

```typescript
export interface AuditLogCreateInput {
  tenantId: string
  userId: string | null
  action: string
  entityType: string
  entityId: string
  entityName?: string | null
  changes?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  ipAddress?: string | null
  userAgent?: string | null
}

export async function create(
  prisma: PrismaClient,
  data: AuditLogCreateInput
) {
  return prisma.auditLog.create({
    data: {
      tenantId: data.tenantId,
      userId: data.userId,
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      entityName: data.entityName ?? null,
      changes: data.changes ?? undefined,
      metadata: data.metadata ?? undefined,
      ipAddress: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
    },
  })
}
```

#### 2. Add `log` Utility and `computeChanges` to Audit Logs Service
**File**: `src/lib/services/audit-logs-service.ts`
**Changes**: Add `log()` function and `computeChanges()` helper

```typescript
import * as repo from "./audit-logs-repository"
import type { AuditLogCreateInput } from "./audit-logs-repository"

// Re-export for convenience
export type { AuditLogCreateInput }

/**
 * Compute a changes diff between two records.
 *
 * Returns an object of `{ fieldName: { old: value, new: value } }` for each
 * field that differs. Fields present in `fieldsToTrack` are compared; all
 * others are ignored. If `fieldsToTrack` is omitted, all keys present in
 * either record are compared.
 *
 * Designed for use with Prisma model objects — handles Date, Decimal, null.
 */
export function computeChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fieldsToTrack?: string[]
): Record<string, { old: unknown; new: unknown }> | null {
  const keys = fieldsToTrack ?? [
    ...new Set([...Object.keys(before), ...Object.keys(after)]),
  ]

  const changes: Record<string, { old: unknown; new: unknown }> = {}

  for (const key of keys) {
    const oldVal = normalize(before[key])
    const newVal = normalize(after[key])

    if (!deepEqual(oldVal, newVal)) {
      changes[key] = { old: oldVal, new: newVal }
    }
  }

  return Object.keys(changes).length > 0 ? changes : null
}

/**
 * Normalize a value for comparison:
 * - Date → ISO string
 * - Decimal → number
 * - undefined → null
 */
function normalize(val: unknown): unknown {
  if (val === undefined) return null
  if (val instanceof Date) return val.toISOString()
  if (val !== null && typeof val === "object" && "toNumber" in val) {
    return (val as { toNumber(): number }).toNumber()
  }
  return val
}

/**
 * Simple deep equality check for JSON-compatible values.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (typeof a !== typeof b) return false
  if (typeof a !== "object") return false
  const aObj = a as Record<string, unknown>
  const bObj = b as Record<string, unknown>
  const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)])
  for (const key of keys) {
    if (!deepEqual(aObj[key], bObj[key])) return false
  }
  return true
}

/**
 * Write an audit log entry. Fire-and-forget — never throws.
 *
 * This function catches all errors internally. Audit log failures
 * must NEVER block the actual business operation.
 *
 * Callers SHOULD still use `.catch()` as defense-in-depth:
 *   await auditLog.log({ ... }).catch(err => console.error('[AuditLog] Failed:', err))
 */
export async function log(
  prisma: PrismaClient,
  data: AuditLogCreateInput
): Promise<void> {
  try {
    await repo.create(prisma, data)
  } catch (err) {
    // Never throw — audit failures must not block the actual operation
    console.error("[AuditLog] Failed to write audit log:", err, {
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
    })
  }
}
```

#### 3. Add `ipAddress` and `userAgent` to tRPC Context
**File**: `src/trpc/init.ts`
**Changes**: Extract from request headers and add to `TRPCContext`

Update `TRPCContext` type:
```typescript
export type TRPCContext = {
  prisma: PrismaClient
  authToken: string | null
  user: ContextUser | null
  session: Session | null
  tenantId: string | null
  /** Client IP address from X-Forwarded-For or X-Real-IP header. */
  ipAddress: string | null
  /** Client User-Agent header. */
  userAgent: string | null
}
```

Update `createTRPCContext` to extract these:
```typescript
export async function createTRPCContext(
  opts: FetchCreateContextFnOptions
): Promise<TRPCContext> {
  // ... existing auth/tenant extraction ...

  // Extract client info for audit logging
  const ipAddress =
    opts.req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    opts.req.headers.get("x-real-ip") ??
    null
  const userAgent = opts.req.headers.get("user-agent") ?? null

  return {
    prisma,
    authToken,
    user,
    session,
    tenantId,
    ipAddress,
    userAgent,
  }
}
```

#### 4. Create Audit Context Helper Type
**File**: `src/lib/services/audit-logs-service.ts`
**Changes**: Add a convenience type for passing audit context from routers to services

```typescript
/**
 * Audit context passed from tRPC routers to services.
 * Contains the acting user's ID and request metadata.
 */
export interface AuditContext {
  userId: string
  ipAddress?: string | null
  userAgent?: string | null
}
```

This type will be used by services that need audit logging but don't currently receive userId. Instead of adding 3 separate parameters, routers pass a single `AuditContext` object.

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `pnpm typecheck`
- [x] Linting passes: `pnpm lint`
- [x] Existing tests pass: `pnpm test`
- [x] No runtime errors on `pnpm dev`

#### Manual Verification:
- [ ] Application starts and the audit logs page still loads
- [ ] Existing audit log entries (if any) still display correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: HIGH Priority — Core 6 Services

### Overview
Integrate audit logging into the 6 most critical services: employees, bookings, absences, billing documents, users, and payroll exports. These cover employee data, time records, financial documents, and user management.

### Integration Pattern

For each service, the pattern is:

**For mutations that already have `existing` (update/delete):**
```typescript
// 1. Fetch existing record (already done by the service)
const existing = await repo.findById(prisma, tenantId, id)

// 2. Perform the mutation
const updated = await repo.update(prisma, tenantId, id, data)

// 3. Audit log — fire-and-forget, NEVER blocks the mutation
// Never throws — audit failures must not block the actual operation
await auditLog.log(prisma, {
  tenantId,
  userId: audit.userId,
  action: "update",
  entityType: "entity_name",
  entityId: id,
  entityName: "human-readable name",
  changes: auditLog.computeChanges(
    existing as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>,
    ["field1", "field2", ...]  // only track relevant fields
  ),
  ipAddress: audit.ipAddress,
  userAgent: audit.userAgent,
}).catch(err => console.error('[AuditLog] Failed:', err))

// 4. Side effects (recalc, notifications) continue after audit log
```

**For creates:**
```typescript
const created = await repo.create(prisma, data)

// Never throws — audit failures must not block the actual operation
await auditLog.log(prisma, {
  tenantId,
  userId: audit.userId,
  action: "create",
  entityType: "entity_name",
  entityId: created.id,
  entityName: "human-readable name",
  changes: null,  // no diff for creates — the record IS the change
  metadata: { /* optional context */ },
  ipAddress: audit.ipAddress,
  userAgent: audit.userAgent,
}).catch(err => console.error('[AuditLog] Failed:', err))
```

**For deletes:**
```typescript
const existing = await repo.findById(prisma, tenantId, id)  // already fetched
await repo.deleteById(prisma, tenantId, id)

// Never throws — audit failures must not block the actual operation
await auditLog.log(prisma, {
  tenantId,
  userId: audit.userId,
  action: "delete",
  entityType: "entity_name",
  entityId: id,
  entityName: "human-readable name",
  changes: null,
  ipAddress: audit.ipAddress,
  userAgent: audit.userAgent,
}).catch(err => console.error('[AuditLog] Failed:', err))
```

### Changes Required:

#### 1. Employees Service
**File**: `src/lib/services/employees-service.ts`
**Entity type**: `"employee"`
**Entity name**: `` `${firstName} ${lastName} (${personnelNumber})` ``

Functions to instrument:
- `create` (line 166) — action: `"create"`, no `existing` needed
- `update` (line 361) — action: `"update"`, `existing` already fetched at line ~380
- `deactivate` (line 701) — action: `"update"` with metadata `{ deactivated: true }`
- `bulkAssignTariff` (line 737) — action: `"update"` per employee, metadata `{ bulk: true, tariffId }`

**Signature change**: Add `audit: AuditContext` parameter to `create`, `update`, `deactivate`, `bulkAssignTariff`.

**Fields to track for updates**: `firstName`, `lastName`, `personnelNumber`, `email`, `phone`, `entryDate`, `exitDate`, `departmentId`, `costCenterId`, `employmentTypeId`, `locationId`, `tariffId`, `weeklyHours`, `vacationDaysPerYear`, `isActive`, `pin`

**Router changes** (`src/trpc/routers/employees.ts`): Pass `{ userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }` as audit context to each mutation call.

#### 2. Bookings Service
**File**: `src/lib/services/bookings-service.ts`
**Entity type**: `"booking"`
**Entity name**: `null` (bookings don't have a natural name — entityId is sufficient)

Functions to instrument:
- `createBooking` (line 325) — action: `"create"`. Already has `userId` param.
- `updateBooking` (line 425) — action: `"update"`, `existing` fetched at line 437. Already has `userId`.
- `deleteBooking` (line 471) — action: `"delete"`, `existing` fetched at line 478. Needs `userId` added.

**Signature change**: Add `audit: AuditContext` as new parameter (replacing the existing loose `userId` param). The router already passes `ctx.user!.id` — extend to include IP/UA.

**Fields to track for updates**: `editedTime`, `notes`, `bookingReasonId`

**Router changes** (`src/trpc/routers/bookings.ts`): Replace `ctx.user!.id` with `{ userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }`.

#### 3. Absences Service
**File**: `src/lib/services/absences-service.ts`
**Entity type**: `"absence_day"`
**Entity name**: `null`

Functions to instrument:
- `createRange` (line 314) — action: `"create"`, one log per created absence day. Already has `userId`.
- `update` (line 481) — action: `"update"`, `existing` fetched at ~line 488
- `remove` (line 528) — action: `"delete"`, `existing` fetched at ~line 535
- `approve` (line 573) — action: `"approve"`, `existing` fetched. Already has `userId`.
- `reject` (line 654) — action: `"reject"`, `existing` fetched
- `cancel` (line 717) — action: `"cancel"`, `existing` fetched

**Signature change**: Replace loose `userId: string | null` with `audit: AuditContext | null` on `createRange`. Add `audit: AuditContext` to `update`, `remove`, `reject`, `cancel`.

**Fields to track for updates**: `duration`, `halfDayPeriod`, `notes`, `status`, `approvedById`, `rejectedReason`

**Router changes** (`src/trpc/routers/absences.ts`): Pass audit context to all mutation calls.

#### 4. Billing Document Service
**File**: `src/lib/services/billing-document-service.ts`
**Entity type**: `"billing_document"` (and `"billing_document_position"` for position mutations)
**Entity name**: `documentNumber` or `"DRAFT"` if not yet numbered

Functions to instrument:
- `create` (line 155) — action: `"create"`. Already has `createdById`.
- `update` (line 273) — action: `"update"`, `existing` fetched
- `remove` (line 329) — action: `"delete"`, `existing` fetched
- `finalize` (line 351) — action: `"finalize"`. Already has `finalizedById`.
- `forward` (line 425) — action: `"forward"`. Already has `createdById`.
- `cancel` (line 520) — action: `"cancel"`, metadata `{ reason }`
- `duplicate` (line 545) — action: `"create"`, metadata `{ duplicatedFrom: sourceId }`
- `addPosition` (line 620) — action: `"create"`, entityType: `"billing_document_position"`
- `updatePosition` (line 674) — action: `"update"`, entityType: `"billing_document_position"`
- `deletePosition` (line 727) — action: `"delete"`, entityType: `"billing_document_position"`

**Signature change**: Add `audit: AuditContext` parameter (replacing loose `createdById`/`finalizedById` where present).

**Fields to track for document updates**: `contactId`, `documentDate`, `deliveryDate`, `headerText`, `footerText`, `subject`, `status`
**Fields to track for position updates**: `description`, `quantity`, `unitPrice`, `discount`, `sortOrder`

**Router changes** (`src/trpc/routers/billingDocuments.ts`): Pass audit context.

#### 5. Users Service
**File**: `src/lib/services/users-service.ts`
**Entity type**: `"user"`
**Entity name**: `displayName` or `email`

Functions to instrument:
- `create` (line 56) — action: `"create"`
- `update` (line 119) — action: `"update"`, `existing` fetched
- `remove` (line 237) — action: `"delete"`, `existing` fetched. Already has `currentUserId`.
- `changePassword` (line 258) — action: `"update"`, metadata `{ passwordChanged: true }`, no `changes` diff

**Signature change**: Add `audit: AuditContext` parameter to `create`, `update`, `changePassword`. `remove` already has `currentUserId` — replace with `audit`.

**Fields to track for updates**: `displayName`, `email`, `username`, `userGroupId`, `employeeId`, `isActive`, `isLocked`, `dataScopeType`
**NEVER track**: `password`, `ssoId` (sensitive)

**Router changes** (`src/trpc/routers/users.ts`): Pass audit context.

#### 6. Payroll Export Service
**File**: `src/lib/services/payroll-export-service.ts`
**Entity type**: `"payroll_export"`
**Entity name**: `` `${format} ${year}-${month}` ``

Functions to instrument:
- `generate` (line 303) — action: `"export"`. Already has `userId`.
- `remove` (line 659) — action: `"delete"`

**Signature change**: Replace loose `userId` with `audit: AuditContext` on `generate`. Add `audit: AuditContext` to `remove`.

**Router changes** (`src/trpc/routers/payrollExports.ts`): Pass audit context.

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `pnpm typecheck`
- [x] Linting passes: `pnpm lint`
- [x] Existing tests pass: `pnpm test`

#### Manual Verification:
- [ ] Create an employee → audit log entry appears at `/admin/audit-logs` with action "create"
- [ ] Update a booking → audit log entry shows correct before/after changes
- [ ] Delete an absence → audit log entry appears with action "delete"
- [ ] Finalize a billing document → audit log entry with action "finalize"
- [ ] Create a user → audit log entry with action "create"
- [ ] Generate a payroll export → audit log entry with action "export"
- [ ] JSON diff viewer correctly renders the changes for an update entry

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that audit entries appear correctly in the UI before proceeding to Phase 4.

---

## Phase 4: HIGH Priority — Remaining Services

### Overview
Integrate audit logging into the remaining HIGH priority services: corrections, user groups, monthly values, vacation balances, and vacation management.

### Changes Required:

#### 1. Corrections Service
**File**: `src/lib/services/correction-service.ts`
**Entity type**: `"correction"`
**Entity name**: `null`

Functions to instrument:
- `create` (line 104) — action: `"create"`. Already has `userId`.
- `update` (line 162) — action: `"update"`, `existing` fetched
- `remove` (line 205) — action: `"delete"`, `existing` fetched
- `approve` (line 231) — action: `"approve"`. Already has `userId`.
- `reject` (line 275) — action: `"reject"`. Already has `userId`.

**Signature change**: Replace loose `userId` with `audit: AuditContext` where present. Add `audit: AuditContext` to `update`, `remove`.

**Fields to track**: `valueMinutes`, `reason`, `status`, `correctionType`

#### 2. User Group Service
**File**: `src/lib/services/user-group-service.ts`
**Entity type**: `"user_group"`
**Entity name**: `name`

Functions to instrument:
- `create` (line 73) — action: `"create"`
- `update` (line 128) — action: `"update"`, `existing` fetched
- `remove` (line 234) — action: `"delete"`, `existing` fetched

**Signature change**: Add `audit: AuditContext` to all three.

**Fields to track**: `name`, `description`, `isAdmin`

#### 3. Monthly Values Service
**File**: `src/lib/services/monthly-values-service.ts`
**Entity type**: `"monthly_values"`
**Entity name**: `` `${year}-${month}` ``

Functions to instrument:
- `close` (line 164) — action: `"close"`
- `closeBatch` (line 253) — action: `"close"`, one log per closed month

**Signature change**: Add `audit: AuditContext` to both.

#### 4. Vacation Balances Service
**File**: `src/lib/services/vacation-balances-service.ts`
**Entity type**: `"vacation_balance"`
**Entity name**: `` `${year}` ``

Functions to instrument:
- `createBalance` (line 261) — action: `"create"`
- `updateBalance` (line 312) — action: `"update"`, `existing` fetched

**Signature change**: Add `audit: AuditContext` to both.

**Fields to track**: `entitlement`, `carryover`, `adjustments`, `carryoverExpiresAt`

#### 5. Vacation Service
**File**: `src/lib/services/vacation-service.ts`
**Entity type**: `"vacation_balance"`
**Entity name**: `` `${year}` ``

Functions to instrument:
- `initializeYear` (line 362) — action: `"create"`, metadata `{ initialized: true }`
- `adjustBalance` (line 427) — action: `"update"`, metadata `{ adjustment, notes }`
- `carryoverFromPreviousYear` (line 468) — action: `"update"`, metadata `{ carryover: true }`
- `initializeBatch` (line 532) — action: `"create"` per balance, metadata `{ batch: true }`

**Signature change**: Add `audit: AuditContext` to all four.

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `pnpm typecheck`
- [x] Linting passes: `pnpm lint`
- [x] Existing tests pass: `pnpm test`

#### Manual Verification:
- [ ] Approve a correction → audit log entry with action "approve"
- [ ] Update a user group → audit log shows changed permissions
- [ ] Close a month → audit log entry with action "close"
- [ ] Initialize vacation year → audit log entry appears

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 5.

---

## Phase 5: MEDIUM Priority — Configuration Services

### Overview
Integrate audit logging into ~25 configuration entity services. These follow a uniform pattern (create/update/remove) and are simpler to instrument because they don't have approval workflows or side effects.

### Standard Pattern for Config Services

Every config service follows the same integration pattern. Add `audit: AuditContext` as the last parameter to `create`, `update`, and `remove`. Log after each successful mutation.

### Services to Instrument

Each row = one service file. All entity types use snake_case matching the DB table.

| # | Service File | Entity Type | Entity Name Field | Fields to Track |
|---|---|---|---|---|
| 1 | `absence-type-service.ts` | `absence_type` | `name` | `name`, `code`, `category`, `portion`, `priority`, `isActive`, `deductsVacation`, `requiresApproval` |
| 2 | `booking-type-service.ts` | `booking_type` | `name` | `name`, `code`, `direction`, `isActive`, `isSystem` |
| 3 | `department-service.ts` | `department` | `name` | `name`, `code`, `parentId`, `isActive` |
| 4 | `cost-center-service.ts` | `cost_center` | `name` | `name`, `code`, `isActive` |
| 5 | `employment-type-service.ts` | `employment_type` | `name` | `name`, `code`, `weeklyHours`, `isActive` |
| 6 | `tariffs-service.ts` | `tariff` / `tariff_break` | `name` | `name`, `code`, `isActive`, breaks |
| 7 | `employee-tariff-assignment-service.ts` | `employee_tariff_assignment` | `null` | `employeeId`, `tariffId`, `validFrom`, `validTo` |
| 8 | `shift-service.ts` | `shift` | `name` | `name`, `code`, `startTime`, `endTime` |
| 9 | `day-plans-service.ts` | `day_plan` | `name` | `name`, `code`, planned hours, breaks, bonuses |
| 10 | `employee-day-plans-service.ts` | `employee_day_plan` | `null` | `employeeId`, `dayPlanId`, `validFrom`, `validTo` |
| 11 | `schedules-service.ts` | `schedule` / `schedule_task` | `name` | `name`, `code`, tasks |
| 12 | `holiday-service.ts` | `holiday` | `name` | `name`, `date`, `isHalfDay` |
| 13 | `order-service.ts` | `order` | `name` | `name`, `code`, `isActive` |
| 14 | `order-booking-service.ts` | `order_booking` | `null` | `orderId`, `employeeId`, `bookingDate` |
| 15 | `order-assignment-service.ts` | `order_assignment` | `null` | `orderId`, `employeeId`, `validFrom`, `validTo` |
| 16 | `account-service.ts` | `account` | `name` | `name`, `code`, `accountType`, `isActive` |
| 17 | `group-service.ts` | `group` | `name` | `name`, `isActive` |
| 18 | `location-service.ts` | `location` | `name` | `name`, `code`, `isActive` |
| 19 | `macros-service.ts` | `macro` / `macro_assignment` | `name` | `name`, `code`, assignments |
| 20 | `calculation-rule-service.ts` | `calculation_rule` | `name` | `name`, `code`, rule config |
| 21 | `booking-reason-service.ts` | `booking_reason` | `label` | `label`, `code`, `isActive` |
| 22 | `absence-type-group-service.ts` | `absence_type_group` | `name` | `name`, `code` |
| 23 | `booking-type-group-service.ts` | `booking_type_group` | `name` | `name`, `code` |
| 24 | `vacation-calc-group-service.ts` | `vacation_calc_group` | `name` | `name`, config |
| 25 | `vacation-capping-rule-service.ts` | `vacation_capping_rule` | `name` | `name`, rule config |
| 26 | `vacation-capping-rule-group-service.ts` | `vacation_capping_rule_group` | `name` | `name`, config |
| 27 | `vacation-special-calc-service.ts` | `vacation_special_calc` | `name` | `name`, config |
| 28 | `employee-capping-exception-service.ts` | `employee_capping_exception` | `null` | `employeeId`, config |

For each service:
1. Add `import * as auditLog from "./audit-logs-service"` and `import type { AuditContext } from "./audit-logs-service"`
2. Add `audit: AuditContext` parameter to `create`, `update`, `remove`
3. Add fire-and-forget audit log call after each successful mutation
4. Update the corresponding tRPC router to pass `{ userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }`

### CRM Services (also MEDIUM)

| # | Service File | Entity Type | Notes |
|---|---|---|---|
| 29 | `crm-address-service.ts` | `crm_address` / `crm_contact` / `bank_account` | Multiple entity types in one service |
| 30 | `crm-inquiry-service.ts` | `crm_inquiry` | Has `cancel`, `createOrder` actions |
| 31 | `crm-task-service.ts` | `crm_task` | Has `cancel` action |
| 32 | `crm-correspondence-service.ts` | `crm_correspondence` | Standard CRUD |

### Billing Services (also MEDIUM)

| # | Service File | Entity Type | Notes |
|---|---|---|---|
| 33 | `billing-service-case-service.ts` | `billing_service_case` | Has `createInvoice`, `createOrder` |
| 34 | `billing-payment-service.ts` | `billing_payment` | `createPayment`, `cancelPayment` |
| 35 | `billing-recurring-invoice-service.ts` | `billing_recurring_invoice` | Has `generate`, `deactivate` |
| 36 | `billing-price-list-service.ts` | `billing_price_list` / entries | Nested entity types |

### Other MEDIUM Services

| # | Service File | Entity Type |
|---|---|---|
| 37 | `teams-service.ts` | `team` |
| 38 | `reports-service.ts` | `report` |
| 39 | `export-interface-service.ts` | `export_interface` |
| 40 | `employee-cards-service.ts` | `employee_card` |
| 41 | `employee-contacts-service.ts` | `employee_contact` |
| 42 | `access-profile-service.ts` | `access_profile` |
| 43 | `access-zone-service.ts` | `access_zone` |
| 44 | `employee-access-assignment-service.ts` | `employee_access_assignment` |
| 45 | `trip-record-service.ts` | `trip_record` |
| 46 | `vehicle-service.ts` | `vehicle` |
| 47 | `vehicle-route-service.ts` | `vehicle_route` |
| 48 | `week-plan-service.ts` | `week_plan` |

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `pnpm typecheck`
- [x] Linting passes: `pnpm lint`
- [x] Existing tests pass: `pnpm test`

#### Manual Verification:
- [ ] Create an absence type → audit log entry appears
- [ ] Update a department → audit log shows changed fields
- [ ] Delete a booking reason → audit log entry appears
- [ ] Filter audit logs by entity type "absence_type" → shows only absence type entries

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 6.

---

## Phase 6: LOW Priority — System & Template Services

### Overview
Integrate audit logging into remaining low-priority services: system settings, tenants, templates, and preferences.

### Services to Instrument

| # | Service File | Entity Type | Notes |
|---|---|---|---|
| 1 | `system-settings-service.ts` | `system_settings` | `update` + cleanup operations |
| 2 | `tenant-service.ts` | `tenant` | `create`, `update`, `deactivate` |
| 3 | `tenant-module-service.ts` | `tenant_module` | `enable`, `disable` |
| 4 | `number-sequence-service.ts` | `number_sequence` | `update` only |
| 5 | `notification-service.ts` | `notification_preference` | `updatePreferences` |
| 6 | `billing-document-template-service.ts` | `billing_document_template` | Standard CRUD |
| 7 | `monthly-eval-template-service.ts` | `monthly_eval_template` | Standard CRUD |
| 8 | `account-group-service.ts` | `account_group` | Standard CRUD |
| 9 | `contact-type-service.ts` | `contact_type` | Standard CRUD |
| 10 | `contact-kind-service.ts` | `contact_kind` | Standard CRUD |
| 11 | `activity-service.ts` | `activity` | Standard CRUD |
| 12 | `travel-allowance-rule-set-service.ts` | `travel_allowance_rule_set` | Standard CRUD |
| 13 | `local-travel-rule-service.ts` | `local_travel_rule` | Standard CRUD |
| 14 | `extended-travel-rule-service.ts` | `extended_travel_rule` | Standard CRUD |
| 15 | `daily-value-service.ts` | `daily_value` | `approve` only |
| 16 | `billing-tenant-config-service.ts` | `billing_tenant_config` | Upsert |

Same integration pattern as Phase 5.

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `pnpm typecheck`
- [x] Linting passes: `pnpm lint`
- [x] Existing tests pass: `pnpm test`

#### Manual Verification:
- [ ] Update system settings → audit log entry appears
- [ ] Enable a tenant module → audit log with action "create" (or "update")
- [ ] All entity types appear in the audit log entity type filter dropdown

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 7.

---

## Phase 7: Tests

### Overview
Add unit tests for the core audit logging infrastructure and integration tests verifying that key mutations produce audit log entries.

**CRITICAL — Mandatory First Step**: The tRPC context extension from Phase 2 (`ipAddress`, `userAgent`) breaks ALL existing router tests that use mock contexts. The test helper update below MUST be completed and verified BEFORE writing any new tests. Skipping this step is not allowed — without it, `pnpm test` fails immediately and the errors look like new-test problems when they are actually caused by the missing context fields.

### Changes Required:

#### 1. Fix Test Helpers (MUST BE DONE FIRST)
**File**: `src/trpc/routers/__tests__/helpers.ts`
**Changes**: Extend `createMockContext` with the new tRPC context fields

```typescript
// In createMockContext, add these two fields:
ipAddress: "127.0.0.1",
userAgent: "test-agent",
```

**Verification gate — do NOT proceed past this step until green:**
```bash
pnpm test
```

All existing tests must pass with the updated mock context before ANY new test code is written. If tests fail here, the issue is the mock context shape, not new code.

#### 2. Unit Tests for `computeChanges`
**File**: `src/lib/services/__tests__/audit-logs-service.test.ts`

Test cases:
- Returns `null` when no fields changed
- Detects changed string fields
- Detects changed number fields
- Handles Date values (normalized to ISO string)
- Handles Decimal values (normalized to number)
- Handles `null` ↔ value transitions
- Handles `undefined` ↔ `null` normalization
- Respects `fieldsToTrack` whitelist (ignores unlisted fields)
- Returns correct `{ old, new }` structure

#### 3. Unit Tests for `log()` Function
**File**: `src/lib/services/__tests__/audit-logs-service.test.ts`

Test cases:
- Successfully creates audit log entry via repository
- **Never throws** when `prisma.auditLog.create` fails — returns void, logs to console.error
- Passes all fields correctly to repository `create`
- Handles `null` userId gracefully

#### 4. Unit Tests for Repository `create`
**File**: `src/lib/services/__tests__/audit-logs-repository.test.ts`

Test cases:
- Creates audit log with all fields
- Creates audit log with minimal fields (optional fields null)
- Handles JSONB changes and metadata correctly

#### 5. Integration Tests — Verify Audit Entries Created
**File**: `src/e2e/__tests__/audit-logging-integration.test.ts`

These tests use the shared dev DB (like existing e2e tests) and verify that mutations produce audit log entries.

Test cases:
- Create a booking → `prisma.auditLog.findFirst({ where: { entityType: "booking", action: "create" } })` returns entry
- Update a booking → audit log entry has correct `changes` diff
- Delete a booking → audit log entry with action "delete"
- Create an employee → audit log with action "create"
- Approve an absence → audit log with action "approve"
- Finalize a billing document → audit log with action "finalize"
- Audit log failure does not affect mutation (mock `prisma.auditLog.create` to throw, verify main operation still succeeds)
- `computeChanges` returns correct diff for a real Prisma model update
- `ipAddress` and `userAgent` are populated when request headers present

#### 6. Existing Router Tests
**File**: `src/trpc/routers/__tests__/auditLogs-router.test.ts`

No changes needed — existing tests only cover the read path which is unchanged. The mock context fix in Step 1 ensures all existing router tests continue to pass.

### Success Criteria:

#### Automated Verification:
- [x] After Step 1 (helper fix only): `pnpm test` passes — all existing tests green
- [x] After Steps 2-6 (new tests): `pnpm test` passes — all new + existing tests green
- [x] TypeScript compiles: `pnpm typecheck`
- [x] Code coverage for `audit-logs-service.ts` > 90%

#### Manual Verification:
- [ ] Tests are meaningful and not trivially passing
- [ ] Fire-and-forget behavior verified by the "failure does not affect mutation" test

---

## Testing Strategy

### Unit Tests
- `computeChanges` diff logic (edge cases: Date, Decimal, null, undefined)
- `log()` fire-and-forget behavior (never throws)
- Repository `create` function

### Integration Tests
- End-to-end: mutation → verify audit log entry in DB
- Key scenarios: create, update, delete, approve, reject, finalize, export

### Manual Testing Steps
1. Open `/admin/audit-logs` in the browser
2. Perform a booking create/update/delete
3. Verify entries appear in the table with correct action badges
4. Click an entry to open the detail sheet
5. Verify the JSON diff viewer shows correct before/after for updates
6. Filter by entity type "booking" — only booking entries shown
7. Filter by date range — correct results
8. Verify that IP address and user agent are populated

## Performance Considerations

- Audit log writes are fire-and-forget async calls — they don't increase response latency
- The `audit_logs` table has 5 indexes which may slow down bulk writes (e.g., `closeBatch` closing 100 months). For bulk operations, consider batching audit logs into a single `createMany` call if performance becomes an issue
- `computeChanges` compares plain objects — no database roundtrip
- The `changes` JSONB column can grow large for records with many fields — the `fieldsToTrack` whitelist keeps it focused on relevant fields

## Migration Notes

- No database migration needed — the `audit_logs` table already exists
- No Prisma schema changes needed — the `AuditLog` model is complete
- Service signature changes (adding `audit: AuditContext`) are breaking for direct callers — all tRPC routers must be updated in the same PR as their service
- The tRPC context change (adding `ipAddress`/`userAgent`) is backwards-compatible — new fields are nullable

## References

- Research document: `thoughts/shared/research/2026-03-20-audit-logging-setup-analysis.md`
- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-034-audit-logging.md`
- UI viewer ticket: `thoughts/shared/tickets/ZMI-TICKET-053-audit-log-viewer-ui.md`
- Existing repository: `src/lib/services/audit-logs-repository.ts`
- Existing service: `src/lib/services/audit-logs-service.ts`
- Existing router: `src/trpc/routers/auditLogs.ts`
- tRPC context: `src/trpc/init.ts`
- Auth middleware: `src/lib/auth/middleware.ts`
- Prisma model: `prisma/schema.prisma:2682-2706`
- DB migration: `supabase/migrations/20260101000041_create_audit_logs.sql`
