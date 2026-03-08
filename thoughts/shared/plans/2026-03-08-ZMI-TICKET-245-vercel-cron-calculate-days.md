# Implementation Plan: ZMI-TICKET-245 -- Vercel Cron: calculate_days Task

Date: 2026-03-08

## Overview

Implement the `calculate_days` scheduler task as a Vercel Cron Job. This replaces the Go scheduler engine + executor + calculate_days task handler with a single Next.js API route that runs daily at 02:00 UTC.

**Key architectural difference from Go:** The Go scheduler executed per-tenant (the schedule already belonged to a tenant). The Vercel cron job must iterate ALL active tenants itself, then call `RecalcService.triggerRecalcAll()` per tenant.

## Dependencies (all already implemented)

- ZMI-TICKET-234: `DailyCalcService` at `apps/web/src/server/services/daily-calc.ts`
- ZMI-TICKET-243: `RecalcService` at `apps/web/src/server/services/recalc.ts`
- ZMI-TICKET-244: Prisma schema for `Schedule`, `ScheduleExecution`, `ScheduleTaskExecution` tables

## Files to Create/Modify

| Action | File | Description |
|--------|------|-------------|
| CREATE | `apps/web/src/app/api/cron/calculate-days/route.ts` | Main cron route handler |
| CREATE | `apps/web/src/server/services/cron-execution-logger.ts` | Reusable execution logging service |
| CREATE | `apps/web/vercel.json` | Vercel cron schedule configuration |
| MODIFY | `apps/web/.env.example` | Add `CRON_SECRET` variable |
| CREATE | `apps/web/src/app/api/cron/calculate-days/__tests__/route.test.ts` | Unit/integration tests |

---

## Phase 1: CronExecutionLogger Service

**Goal:** Create a reusable service that handles ScheduleExecution + ScheduleTaskExecution logging. This decouples execution logging from the route handler and can be reused by future cron jobs (TICKET-246).

### File: `apps/web/src/server/services/cron-execution-logger.ts`

**Pattern:** Follow the same constructor-takes-PrismaClient pattern as `RecalcService` and `DailyCalcService`.

**Responsibilities:**
1. Find or create a Schedule record for the cron job (per-tenant, upserted by `(tenantId, name)` unique constraint)
2. Create a `ScheduleExecution` record with status `"running"` at start
3. Create a `ScheduleTaskExecution` record with status `"running"` at start
4. Update `ScheduleTaskExecution` with result/error on completion
5. Update `ScheduleExecution` with final status (`"completed"`, `"failed"`, `"partial"`) on completion
6. Update `Schedule.lastRunAt`

**Interface design:**

```typescript
export class CronExecutionLogger {
  constructor(private prisma: PrismaClient) {}

  /**
   * Ensures a Schedule + ScheduleTask record exists for this cron job.
   * Uses upsert on the (tenantId, name) unique constraint.
   * Returns the schedule ID for execution logging.
   */
  async ensureSchedule(tenantId: string, name: string, taskType: string): Promise<string>

  /**
   * Creates a ScheduleExecution record (status: "running").
   * Creates a single ScheduleTaskExecution record (status: "running").
   * Returns { executionId, taskExecutionId }.
   */
  async startExecution(
    tenantId: string,
    scheduleId: string,
    triggerType: 'scheduled' | 'manual',
    taskType: string,
  ): Promise<{ executionId: string; taskExecutionId: string }>

  /**
   * Completes the task execution with result and final status.
   * Updates both ScheduleTaskExecution and ScheduleExecution.
   * Also updates Schedule.lastRunAt.
   */
  async completeExecution(
    executionId: string,
    taskExecutionId: string,
    scheduleId: string,
    result: {
      status: 'completed' | 'failed' | 'partial'
      taskResult: Record<string, unknown>
      errorMessage?: string
    },
  ): Promise<void>
}
```

**Key decisions:**
- The Schedule record is per-tenant (matches the DB schema with `UNIQUE(tenant_id, name)`). Each tenant gets its own `calculate_days` schedule record.
- The cron job has exactly 1 task per execution (`tasksTotal: 1`), simplifying the status logic.
- `timingType` for the schedule record: `"daily"` with `timingConfig: { time: "02:00", source: "vercel_cron" }`.

### Verification
- Service compiles without errors
- Can be instantiated with a PrismaClient

---

## Phase 2: Cron Route Handler

**Goal:** Implement the `/api/cron/calculate-days` GET endpoint.

### File: `apps/web/src/app/api/cron/calculate-days/route.ts`

**Pattern:** Follow the existing non-tRPC API route pattern from `apps/web/src/app/api/internal/notifications/publish/route.ts` -- direct `NextRequest`/`NextResponse`, header-based auth.

**Logic (matches Go `CalculateDaysTaskHandler.Execute` + `SchedulerExecutor.executeSchedule`):**

```typescript
export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes (Vercel Pro limit)

export async function GET(request: Request) {
  // 1. CRON_SECRET validation
  //    Vercel sends Authorization: Bearer <CRON_SECRET> header for cron invocations
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parse optional query params (for manual testing/override)
  //    ?date_range=yesterday|today|last_7_days|current_month (default: "today")
  //    NOTE: Default is "today" (not "yesterday" like Go), because the cron runs at 02:00
  //    and we want to calculate the day that just ended (which at 02:00 UTC is "today"
  //    for European timezones where it's still the same calendar date).
  //    The Go default was "yesterday" because it ran at varying times.

  // 3. Compute from/to dates based on date_range
  //    Matches Go logic from scheduler_tasks.go lines 69-85

  // 4. Load all active tenants
  //    prisma.tenant.findMany({ where: { isActive: true }, select: { id: true } })

  // 5. Per-tenant loop (sequential, not parallel -- avoid connection pool exhaustion):
  //    a. logger.ensureSchedule(tenantId, 'calculate_days_cron', 'calculate_days')
  //    b. logger.startExecution(tenantId, scheduleId, 'scheduled', 'calculate_days')
  //    c. recalcService.triggerRecalcAll(tenantId, from, to)
  //    d. logger.completeExecution(...) with result
  //    e. Catch errors per-tenant -- log and continue to next tenant

  // 6. Return summary JSON response
}
```

**Date range logic (ported from Go `scheduler_tasks.go` lines 69-85):**

| date_range | from | to |
|-----------|------|-----|
| `"today"` (default) | today 00:00 UTC | today 00:00 UTC |
| `"yesterday"` | yesterday 00:00 UTC | yesterday 00:00 UTC |
| `"last_7_days"` | 6 days ago 00:00 UTC | today 00:00 UTC |
| `"current_month"` | 1st of month 00:00 UTC | today 00:00 UTC |

**Default is `"today"`** because the cron runs at 02:00 UTC. For European tenants (CET/CEST = UTC+1/+2), 02:00 UTC is 03:00-04:00 local time, which is still the same calendar day. The calculation processes the previous day's bookings that are now finalized.

**Error handling strategy:**
- Individual employee calculation failures: handled inside `RecalcService.triggerRecalcBatch()` (already continues on error, aggregates results)
- Per-tenant failures: caught in the outer loop, logged, and continue to next tenant
- The overall response includes per-tenant results so failures are visible

**Response format:**
```json
{
  "ok": true,
  "dateRange": "today",
  "from": "2026-03-08",
  "to": "2026-03-08",
  "tenantsProcessed": 3,
  "tenantsFailed": 0,
  "totalProcessedDays": 150,
  "totalFailedDays": 2,
  "results": [
    {
      "tenantId": "...",
      "processedDays": 50,
      "failedDays": 1,
      "durationMs": 1234
    }
  ]
}
```

### Verification
- `curl http://localhost:3000/api/cron/calculate-days` without auth returns 401
- `curl -H "Authorization: Bearer test-secret" http://localhost:3000/api/cron/calculate-days` returns 200 with JSON response
- Check ScheduleExecution records were created in DB

---

## Phase 3: Vercel Configuration

**Goal:** Configure the cron schedule in `vercel.json` and document the required environment variable.

### File: `apps/web/vercel.json` (NEW)

```json
{
  "crons": [
    {
      "path": "/api/cron/calculate-days",
      "schedule": "0 2 * * *"
    }
  ]
}
```

The `vercel.json` goes in the `apps/web/` directory (the Next.js app root, which is the Vercel project root).

### File: `apps/web/.env.example` (MODIFY)

Add:
```
# Vercel Cron Secret (set automatically by Vercel in production)
# For local testing, set to any string
CRON_SECRET=local-cron-secret-for-testing
```

### Verification
- `vercel.json` is valid JSON
- `.env.example` includes `CRON_SECRET`

---

## Phase 4: Tests

**Goal:** Verify the cron job logic with unit and integration tests.

### File: `apps/web/src/app/api/cron/calculate-days/__tests__/route.test.ts`

**Test cases:**

1. **Auth validation:**
   - Returns 401 when no Authorization header
   - Returns 401 when wrong CRON_SECRET
   - Returns 200 when correct CRON_SECRET

2. **Date range parsing:**
   - Default date_range is "today"
   - "yesterday" computes correct from/to
   - "last_7_days" computes correct from/to
   - "current_month" computes correct from/to
   - Unknown date_range returns 400

3. **Tenant iteration:**
   - Processes all active tenants
   - Skips inactive tenants
   - Individual tenant failure does not block others

4. **Execution logging:**
   - Creates ScheduleExecution record with status "running" at start
   - Updates ScheduleExecution to "completed" on success
   - Updates ScheduleExecution to "failed" on total failure
   - Creates ScheduleTaskExecution with correct result JSON

5. **Integration (with test DB):**
   - Full run with test tenants and employees creates DailyValue records

**Test approach:**
- Extract the core logic into a testable function (not just the route handler)
- Mock PrismaClient for unit tests
- For integration tests, follow the existing test pattern if any exist (check `apps/web/src/**/*.test.ts` patterns)

### Verification
- All tests pass: `cd apps/web && npx vitest run src/app/api/cron/calculate-days`

---

## Phase 5: Manual Verification

**Goal:** End-to-end verification that the cron job works locally.

### Steps:

1. Add `CRON_SECRET=test-secret` to `apps/web/.env.local`
2. Start the dev server: `cd apps/web && pnpm dev`
3. Ensure there are active tenants and employees in the local DB
4. Call the endpoint:
   ```bash
   curl -s -H "Authorization: Bearer test-secret" \
     "http://localhost:3000/api/cron/calculate-days?date_range=today" | jq .
   ```
5. Verify:
   - Response shows tenants processed, days calculated
   - `schedule_executions` table has new records
   - `schedule_task_executions` table has new records with result JSON
   - `daily_values` table has new/updated records for today

---

## Implementation Notes

### Service instantiation pattern
Follow the existing pattern from tRPC routers:
```typescript
const recalcService = new RecalcService(prisma)
const logger = new CronExecutionLogger(prisma)
```
Import `prisma` from `@/lib/db/prisma`.

### Sequential vs parallel tenant processing
Process tenants **sequentially** (not with `Promise.all`). Reasons:
- Avoid exhausting the database connection pool
- `DailyCalcService.calculateDay()` makes many DB queries per employee
- 5-minute timeout gives enough headroom for sequential processing
- If parallel processing is needed later, it can be added with a concurrency limiter

### The "schedule per tenant" question
The `schedules` table has a `UNIQUE(tenant_id, name)` constraint. The cron job needs a schedule record per tenant for execution logging. On first run for each tenant, `ensureSchedule()` upserts the record. This means:
- Each tenant gets its own `calculate_days_cron` schedule record
- Each tenant gets its own execution history
- This matches the Go model where schedules were per-tenant

### Date handling
All dates are UTC (matching the Go implementation). The `from`/`to` are midnight UTC dates. The `DailyCalcService.calculateDay()` already expects UTC dates.

### Logging
Use `console.log` / `console.error` for structured logging (these are captured by Vercel's log drain). Include tenantId and timing information.

## Success Criteria

- [ ] Cron route at `/api/cron/calculate-days` responds to GET requests
- [ ] CRON_SECRET validation returns 401 for unauthorized requests
- [ ] Iterates all active tenants, calculates all active employees per tenant
- [ ] Individual employee/tenant failures do not block other tenants
- [ ] ScheduleExecution + ScheduleTaskExecution records are created in DB
- [ ] vercel.json configures daily 02:00 UTC cron schedule
- [ ] Max 5 minute runtime (maxDuration = 300)
- [ ] Tests cover auth, date ranges, tenant iteration, error handling, and execution logging
