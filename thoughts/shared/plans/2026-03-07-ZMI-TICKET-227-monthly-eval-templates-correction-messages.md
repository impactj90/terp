# ZMI-TICKET-227: Monthly Eval Templates & Correction Messages -- Implementation Plan

## Overview

Migrate the **Monthly Evaluation Templates** (CRUD + default management) and **Correction Assistant** (correction message catalog + assistant query items) from the Go REST backend to tRPC routers with Prisma data access. This involves adding two new Prisma models, creating two tRPC routers, and migrating two frontend hooks from REST/fetch patterns to tRPC.

## Current State Analysis

### Monthly Evaluation Templates
- **Go backend**: Complete implementation across handler (`apps/api/internal/handler/monthly_evaluation_template.go`, 302 lines), service (214 lines), and repository (97 lines)
- **Database table**: `monthly_evaluation_templates` (migration `000081`), fully functional
- **Frontend hook**: `apps/web/src/hooks/api/use-monthly-evaluations.ts` (92 lines) using `useApiQuery`/`useApiMutation` (OpenAPI-generated client)
- **Permission**: `monthly_evaluations.manage` (permission catalog line 212-216)
- **Not in Prisma schema**: Must be added before tRPC router can use Prisma

### Correction Assistant
- **Go backend**: Complete implementation across handler (`apps/api/internal/handler/correction_assistant.go`, 301 lines), service (357 lines), and repository (116 lines)
- **Database tables**: `correction_messages` (migration `000045`), `daily_values` (migration `000024`)
- **Frontend hook**: `apps/web/src/hooks/api/use-correction-assistant.ts` (174 lines) using manual `fetch` with `@tanstack/react-query`
- **Permissions**: `time_tracking.view_all` (read), `time_tracking.edit` (write) -- as registered in Go routes
- **Not in Prisma schema**: `CorrectionMessage` must be added. `daily_values` is also not in Prisma -- requires `$queryRawUnsafe()` for the assistant items query
- **Tests**: Comprehensive test suite exists (`apps/api/internal/service/correction_assistant_test.go`, 883 lines)

### Key Discoveries:
- `MonthlyEvaluationTemplate` table uses `numeric(10,2)` for `max_carryover_vacation` -- Prisma maps this to `Decimal`, must convert to `number` in output schema
- The `SetDefault` operation requires clearing all existing defaults for the tenant, then setting the new one -- must use `$transaction()` for atomicity
- Correction assistant `ListItems` query joins `daily_values` with `employees` and `departments`, filtering `has_error = true`, then resolves error codes against the message catalog in application logic
- `DailyValue` table is NOT in Prisma schema -- the reports router already handles this with `prisma.$queryRawUnsafe()` (see `apps/web/src/server/routers/reports.ts` lines 890-903)
- `EnsureDefaults` seeds 24 default correction messages (14 error codes + 10 warning/hint codes) per tenant on first access -- must be ported to TypeScript
- The Go error codes are string constants from `apps/api/internal/calculation/errors.go` -- need TypeScript equivalents
- Permission catalog at `apps/web/src/server/lib/permission-catalog.ts` already has both `monthly_evaluations.manage` (line 212) and `time_tracking.view_all`/`time_tracking.edit` (lines 56-66)

## Desired End State

Two new tRPC routers fully replace the Go REST endpoints:
1. `monthlyEvalTemplates` router with list, getById, getDefault, create, update, delete, setDefault procedures
2. `correctionAssistant` router with listMessages, getMessage, updateMessage, listItems procedures (including EnsureDefaults auto-seeding)

Both routers are registered in `apps/web/src/server/root.ts`. Both frontend hooks are migrated to the tRPC pattern. Both Prisma models are added to the schema.

**Verification**: All tRPC procedures return correct data matching the existing Go API responses. The `make lint` and TypeScript typecheck pass. Frontend hooks compile and function correctly.

## What We're NOT Doing

- NOT adding `daily_values` to the Prisma schema (use raw SQL like the reports router)
- NOT changing the permission model (keep `time_tracking.view_all`/`time_tracking.edit` for correction assistant, `monthly_evaluations.manage` for monthly eval templates)
- NOT modifying the existing Go backend files (they remain for backward compatibility until decommissioned)
- NOT adding database migrations (tables already exist)
- NOT creating new test infrastructure (verification through TypeScript compilation and manual testing)

## Implementation Approach

Follow the established tRPC migration pattern from recent tickets (ZMI-TICKET-222 through ZMI-TICKET-226):
1. Add Prisma models for both entities
2. Run `npx prisma generate` to create Prisma client types
3. Create tRPC routers with Zod schemas and Prisma queries
4. Register routers in root.ts
5. Migrate frontend hooks to tRPC pattern

Split into three phases: Prisma schema additions, tRPC routers (monthly eval first as simpler, then correction assistant), and frontend hook migration.

---

## Phase 1: Prisma Schema Additions

### Overview
Add `MonthlyEvaluationTemplate` and `CorrectionMessage` models to the Prisma schema, add relation fields to `Tenant`, and run `npx prisma generate`.

### Changes Required:

#### 1. Prisma Schema
**File**: `apps/web/prisma/schema.prisma`

**Changes**:
- Add `MonthlyEvaluationTemplate` model based on migration `000081`
- Add `CorrectionMessage` model based on migration `000045`
- Add relation arrays to the `Tenant` model

Add to the `Tenant` model's relations section (after `extendedTravelRules`):
```prisma
  monthlyEvaluationTemplates MonthlyEvaluationTemplate[]
  correctionMessages         CorrectionMessage[]
```

Add the `MonthlyEvaluationTemplate` model:
```prisma
// -----------------------------------------------------------------------------
// MonthlyEvaluationTemplate
// -----------------------------------------------------------------------------
// Migration: 000081
//
// Note: No update trigger on this table (unlike most newer tables).
model MonthlyEvaluationTemplate {
  id                   String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId             String   @map("tenant_id") @db.Uuid
  name                 String   @db.VarChar(100)
  description          String   @default("") @db.Text
  flextimeCapPositive  Int      @default(0) @map("flextime_cap_positive")
  flextimeCapNegative  Int      @default(0) @map("flextime_cap_negative")
  overtimeThreshold    Int      @default(0) @map("overtime_threshold")
  maxCarryoverVacation Decimal  @default(0) @map("max_carryover_vacation") @db.Decimal(10, 2)
  isDefault            Boolean  @default(false) @map("is_default")
  isActive             Boolean  @default(true) @map("is_active")
  createdAt            DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt            DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId], map: "idx_monthly_eval_templates_tenant_id")
  @@map("monthly_evaluation_templates")
}
```

Add the `CorrectionMessage` model:
```prisma
// -----------------------------------------------------------------------------
// CorrectionMessage
// -----------------------------------------------------------------------------
// Migration: 000045
//
// Stores the correction message catalog per tenant.
// Each error/hint code has a default_text and optional custom_text override.
// Trigger: update_correction_messages_updated_at auto-updates updated_at
model CorrectionMessage {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  code        String   @db.VarChar(50)
  defaultText String   @map("default_text") @db.Text
  customText  String?  @map("custom_text") @db.Text
  severity    String   @default("error") @db.VarChar(10)
  description String?  @db.Text
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, code])
  @@index([tenantId], map: "idx_correction_messages_tenant")
  @@index([code], map: "idx_correction_messages_code")
  @@index([tenantId, severity], map: "idx_correction_messages_severity")
  @@map("correction_messages")
}
```

#### 2. Generate Prisma Client
Run `npx prisma generate` from `apps/web/` to regenerate the Prisma client with the new models.

### Success Criteria:

#### Automated Verification:
- [x] `cd apps/web && npx prisma generate` completes without errors
- [x] `cd apps/web && npx tsc --noEmit` passes (TypeScript compilation)
- [x] `cd apps/web && npx prisma validate` passes

#### Manual Verification:
- [ ] Prisma Studio shows both new models with correct columns

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Monthly Eval Templates tRPC Router

### Overview
Create the `monthlyEvalTemplates` tRPC router with full CRUD + default management, then register it in the root router.

### Changes Required:

#### 1. tRPC Router
**File**: `apps/web/src/server/routers/monthlyEvalTemplates.ts` (new)

**Procedures to implement**:

| Procedure | Type | Go Equivalent | Permission |
|-----------|------|---------------|------------|
| `list` | query | `GET /monthly-evaluations` | `monthly_evaluations.manage` |
| `getById` | query | `GET /monthly-evaluations/{id}` | `monthly_evaluations.manage` |
| `getDefault` | query | `GET /monthly-evaluations/default` | `monthly_evaluations.manage` |
| `create` | mutation | `POST /monthly-evaluations` | `monthly_evaluations.manage` |
| `update` | mutation | `PUT /monthly-evaluations/{id}` | `monthly_evaluations.manage` |
| `delete` | mutation | `DELETE /monthly-evaluations/{id}` | `monthly_evaluations.manage` |
| `setDefault` | mutation | `POST /monthly-evaluations/{id}/set-default` | `monthly_evaluations.manage` |

**Key implementation details**:

- Permission constant: `const MONTHLY_EVAL_MANAGE = permissionIdByKey("monthly_evaluations.manage")!`
- Output schema: `z.object({ id, tenantId, name, description, flextimeCapPositive (z.number()), flextimeCapNegative (z.number()), overtimeThreshold (z.number()), maxCarryoverVacation (z.number()), isDefault (z.boolean()), isActive (z.boolean()), createdAt (z.date()), updatedAt (z.date()) })`
- `maxCarryoverVacation` is `Decimal` in Prisma -- must convert to `Number()` in the output: `maxCarryoverVacation: Number(template.maxCarryoverVacation)`
- `list` procedure: input `z.object({ isActive: z.boolean().optional() }).optional()`, filters by `tenantId` and optional `isActive`, orders by `name asc`
- `getById` procedure: input `z.object({ id: z.string().uuid() })`, finds by `id` and `tenantId`, throws NOT_FOUND
- `getDefault` procedure: no input, finds by `tenantId` and `isDefault: true`, throws NOT_FOUND if no default
- `create` procedure: validates `name` required (min 1, max 100), if `isDefault` is true, clear existing defaults first using `$transaction`
- `update` procedure: partial update, if setting `isDefault` to true, use `$transaction` to clear existing defaults then update
- `delete` procedure: fetch first to check `isDefault` -- if true, throw BAD_REQUEST "Cannot delete default evaluation template"
- `setDefault` procedure: input `z.object({ id: z.string().uuid() })`, use `$transaction` to: (1) `updateMany` to clear all defaults for tenant, (2) `update` the target to `isDefault: true`

**Transaction pattern for SetDefault** (same pattern applies to create/update when isDefault is true):
```typescript
await ctx.prisma.$transaction(async (tx) => {
  await tx.monthlyEvaluationTemplate.updateMany({
    where: { tenantId, isDefault: true },
    data: { isDefault: false },
  })
  await tx.monthlyEvaluationTemplate.update({
    where: { id: input.id },
    data: { isDefault: true },
  })
})
```

#### 2. Root Router Registration
**File**: `apps/web/src/server/root.ts`

**Changes**:
- Add import: `import { monthlyEvalTemplatesRouter } from "./routers/monthlyEvalTemplates"`
- Add to `appRouter` object: `monthlyEvalTemplates: monthlyEvalTemplatesRouter,`

### Success Criteria:

#### Automated Verification:
- [x] `cd apps/web && npx tsc --noEmit` passes
- [x] `cd apps/web && npm run lint` passes (or existing lint issues only)
- [x] No new TypeScript errors introduced

#### Manual Verification:
- [ ] `list` returns templates filtered by `isActive` and ordered by name
- [ ] `getById` returns a single template or 404
- [ ] `getDefault` returns the default template or 404
- [ ] `create` creates a new template; if `isDefault`, clears existing defaults
- [ ] `update` applies partial updates; handles `isDefault` toggle correctly
- [ ] `delete` prevents deletion of default template (returns error)
- [ ] `setDefault` atomically clears existing default and sets new one
- [ ] `maxCarryoverVacation` returns as a number (not Prisma Decimal object)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Correction Assistant tRPC Router

### Overview
Create the `correctionAssistant` tRPC router with correction message catalog management (list, get, update + auto-seed) and the correction assistant items query (raw SQL for daily_values). Register it in the root router.

### Changes Required:

#### 1. tRPC Router
**File**: `apps/web/src/server/routers/correctionAssistant.ts` (new)

**Procedures to implement**:

| Procedure | Type | Go Equivalent | Permission |
|-----------|------|---------------|------------|
| `listMessages` | query | `GET /correction-messages` | `time_tracking.view_all` |
| `getMessage` | query | `GET /correction-messages/{id}` | `time_tracking.view_all` |
| `updateMessage` | mutation | `PATCH /correction-messages/{id}` | `time_tracking.edit` |
| `listItems` | query | `GET /correction-assistant` | `time_tracking.view_all` |

**Key implementation details**:

**Permission constants**:
```typescript
const TIME_TRACKING_VIEW_ALL = permissionIdByKey("time_tracking.view_all")!
const TIME_TRACKING_EDIT = permissionIdByKey("time_tracking.edit")!
```

**Error/Warning Code Constants** -- must be defined in the router file (ported from `apps/api/internal/calculation/errors.go`):
```typescript
// Error codes (from calculation/errors.go)
const ERR_MISSING_COME = "MISSING_COME"
const ERR_MISSING_GO = "MISSING_GO"
const ERR_UNPAIRED_BOOKING = "UNPAIRED_BOOKING"
const ERR_EARLY_COME = "EARLY_COME"
const ERR_LATE_COME = "LATE_COME"
const ERR_EARLY_GO = "EARLY_GO"
const ERR_LATE_GO = "LATE_GO"
const ERR_MISSED_CORE_START = "MISSED_CORE_START"
const ERR_MISSED_CORE_END = "MISSED_CORE_END"
const ERR_BELOW_MIN_WORK_TIME = "BELOW_MIN_WORK_TIME"
const ERR_NO_BOOKINGS = "NO_BOOKINGS"
const ERR_INVALID_TIME = "INVALID_TIME"
const ERR_DUPLICATE_IN_TIME = "DUPLICATE_IN_TIME"
const ERR_NO_MATCHING_SHIFT = "NO_MATCHING_SHIFT"

// Warning codes
const WARN_CROSS_MIDNIGHT = "CROSS_MIDNIGHT"
const WARN_MAX_TIME_REACHED = "MAX_TIME_REACHED"
const WARN_MANUAL_BREAK = "MANUAL_BREAK"
const WARN_NO_BREAK_RECORDED = "NO_BREAK_RECORDED"
const WARN_SHORT_BREAK = "SHORT_BREAK"
const WARN_AUTO_BREAK_APPLIED = "AUTO_BREAK_APPLIED"
const WARN_MONTHLY_CAP = "MONTHLY_CAP_REACHED"
const WARN_FLEXTIME_CAPPED = "FLEXTIME_CAPPED"
const WARN_BELOW_THRESHOLD = "BELOW_THRESHOLD"
const WARN_NO_CARRYOVER = "NO_CARRYOVER"
```

**`mapCorrectionErrorType` function** -- port from Go service (line 300-321):
```typescript
function mapCorrectionErrorType(code: string): string {
  switch (code) {
    case ERR_MISSING_COME:
    case ERR_MISSING_GO:
    case ERR_NO_BOOKINGS:
      return "missing_booking"
    case ERR_UNPAIRED_BOOKING:
      return "unpaired_booking"
    case ERR_DUPLICATE_IN_TIME:
      return "overlapping_bookings"
    case ERR_EARLY_COME:
    case ERR_LATE_COME:
    case ERR_EARLY_GO:
    case ERR_LATE_GO:
    case ERR_MISSED_CORE_START:
    case ERR_MISSED_CORE_END:
      return "core_time_violation"
    case ERR_BELOW_MIN_WORK_TIME:
      return "below_min_hours"
    case WARN_NO_BREAK_RECORDED:
    case WARN_SHORT_BREAK:
    case WARN_MANUAL_BREAK:
    case WARN_AUTO_BREAK_APPLIED:
      return "break_violation"
    case WARN_MAX_TIME_REACHED:
      return "exceeds_max_hours"
    default:
      return "invalid_sequence"
  }
}
```

**`ensureDefaults` function** -- Seeds 24 default correction messages per tenant on first access. Port from Go service (lines 119-353). Call this at the start of `listMessages` and `listItems` procedures. Implementation:
```typescript
async function ensureDefaults(prisma: PrismaClient, tenantId: string): Promise<void> {
  const count = await prisma.correctionMessage.count({ where: { tenantId } })
  if (count > 0) return

  await prisma.correctionMessage.createMany({
    data: defaultCorrectionMessages(tenantId),
  })
}
```

The `defaultCorrectionMessages(tenantId)` function returns an array of 24 objects with `tenantId`, `code`, `defaultText`, `severity`, and `description` -- ported directly from the Go `defaultCorrectionMessages` function (lines 324-352 of `correction_assistant.go`).

**Output schemas**:

CorrectionMessage output:
```typescript
const correctionMessageOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  defaultText: z.string(),
  customText: z.string().nullable(),
  effectiveText: z.string(),
  severity: z.enum(["error", "hint"]),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
```

Note: `effectiveText` is a computed field (not stored in DB) -- return `customText || defaultText` in the query mapping.

CorrectionAssistantError output:
```typescript
const correctionAssistantErrorSchema = z.object({
  code: z.string(),
  severity: z.enum(["error", "hint"]),
  message: z.string(),
  errorType: z.string(),
})
```

CorrectionAssistantItem output:
```typescript
const correctionAssistantItemSchema = z.object({
  dailyValueId: z.string().uuid(),
  employeeId: z.string().uuid(),
  employeeName: z.string(),
  departmentId: z.string().uuid().nullable(),
  departmentName: z.string().nullable(),
  valueDate: z.date(),
  errors: z.array(correctionAssistantErrorSchema),
})
```

**Procedure details**:

- `listMessages`: calls `ensureDefaults`, then queries `correctionMessage.findMany` with optional `severity`, `isActive`, `code` filters, orders by `severity asc, code asc`. Map each result to add `effectiveText: msg.customText || msg.defaultText`
- `getMessage`: queries `correctionMessage.findFirst` by `id` and `tenantId`, throws NOT_FOUND. Add `effectiveText`
- `updateMessage`: fetches by `id`, verifies `tenantId` matches, applies partial update for `customText` (handle clearing: empty string -> set to null), `severity` (validate enum), `isActive`
- `listItems`: calls `ensureDefaults`, then performs the correction assistant query:

**`listItems` query strategy** (raw SQL for daily_values, since table is not in Prisma):

1. Calculate default date range: if no `from`/`to` provided, use first day of previous month to last day of current month
2. Load message catalog: `correctionMessage.findMany({ where: { tenantId, isActive: true } })` and build a `Map<string, CorrectionMessage>` keyed by `code`
3. Execute raw SQL query for daily values with errors:

```typescript
interface DailyValueRow {
  id: string
  employee_id: string
  value_date: Date
  error_codes: string[] | null
  warnings: string[] | null
  first_name: string
  last_name: string
  department_id: string | null
  department_name: string | null
}

const rows: DailyValueRow[] = await ctx.prisma.$queryRawUnsafe(
  `SELECT dv.id, dv.employee_id, dv.value_date,
          dv.error_codes, dv.warnings,
          e.first_name, e.last_name,
          e.department_id, d.name as department_name
   FROM daily_values dv
   JOIN employees e ON e.id = dv.employee_id
   LEFT JOIN departments d ON d.id = e.department_id
   WHERE dv.tenant_id = $1
     AND dv.has_error = true
     AND dv.value_date >= $2
     AND dv.value_date <= $3
     ${employeeFilter}
     ${departmentFilter}
   ORDER BY dv.value_date ASC`,
  ...queryParams
)
```

4. For each row, build error entries by iterating `error_codes` (severity "error") and `warnings` (severity "hint"), applying severity/code filters, resolving message text from the catalog map (fall back to raw code if not in map), and mapping error type via `mapCorrectionErrorType`
5. Apply in-memory pagination (offset/limit) after filtering
6. Return `{ data: items, meta: { total, limit, offset, hasMore } }`

#### 2. Root Router Registration
**File**: `apps/web/src/server/root.ts`

**Changes**:
- Add import: `import { correctionAssistantRouter } from "./routers/correctionAssistant"`
- Add to `appRouter` object: `correctionAssistant: correctionAssistantRouter,`

### Success Criteria:

#### Automated Verification:
- [x] `cd apps/web && npx tsc --noEmit` passes
- [x] `cd apps/web && npm run lint` passes (or existing lint issues only)
- [x] No new TypeScript errors introduced

#### Manual Verification:
- [ ] `listMessages` auto-seeds 24 default messages on first call for a tenant
- [ ] `listMessages` returns messages filtered by severity, isActive, code
- [ ] `listMessages` is idempotent (second call does not create duplicates)
- [ ] `getMessage` returns a single message with computed `effectiveText`
- [ ] `updateMessage` updates customText (setting empty string clears it to null)
- [ ] `updateMessage` validates severity enum (rejects invalid values)
- [ ] `updateMessage` verifies tenant ownership (returns NOT_FOUND for wrong tenant)
- [ ] `listItems` returns daily values with resolved error messages
- [ ] `listItems` applies default date range when no from/to provided
- [ ] `listItems` filters by employee, department, severity, error_code
- [ ] `listItems` pagination works correctly (offset/limit/total/hasMore)
- [ ] `listItems` uses custom text overrides from the message catalog
- [ ] `listItems` falls back to raw code when message is not in catalog (inactive)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Frontend Hook Migration

### Overview
Migrate both frontend hooks from REST/fetch patterns to tRPC, following the established pattern from `use-export-interfaces.ts`.

### Changes Required:

#### 1. Monthly Evaluations Hook
**File**: `apps/web/src/hooks/api/use-monthly-evaluations.ts`

**Changes**: Complete rewrite from `useApiQuery`/`useApiMutation` to tRPC pattern.

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// --- Query Hooks ---

interface UseMonthlyEvaluationsOptions {
  isActive?: boolean
  enabled?: boolean
}

export function useMonthlyEvaluations(options: UseMonthlyEvaluationsOptions = {}) {
  const { isActive, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.monthlyEvalTemplates.list.queryOptions(
      { isActive },
      { enabled }
    )
  )
}

export function useMonthlyEvaluation(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.monthlyEvalTemplates.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useDefaultMonthlyEvaluation(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.monthlyEvalTemplates.getDefault.queryOptions(
      undefined,
      { enabled }
    )
  )
}

// --- Mutation Hooks ---

export function useCreateMonthlyEvaluation() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.monthlyEvalTemplates.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.monthlyEvalTemplates.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.monthlyEvalTemplates.getDefault.queryKey() })
    },
  })
}

export function useUpdateMonthlyEvaluation() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.monthlyEvalTemplates.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.monthlyEvalTemplates.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.monthlyEvalTemplates.getById.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.monthlyEvalTemplates.getDefault.queryKey() })
    },
  })
}

export function useDeleteMonthlyEvaluation() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.monthlyEvalTemplates.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.monthlyEvalTemplates.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.monthlyEvalTemplates.getById.queryKey() })
    },
  })
}

export function useSetDefaultMonthlyEvaluation() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.monthlyEvalTemplates.setDefault.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.monthlyEvalTemplates.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.monthlyEvalTemplates.getDefault.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.monthlyEvalTemplates.getById.queryKey() })
    },
  })
}
```

#### 2. Correction Assistant Hook
**File**: `apps/web/src/hooks/api/use-correction-assistant.ts`

**Changes**: Complete rewrite from manual `fetch` to tRPC pattern. Remove all inline TypeScript interfaces (types now inferred from tRPC router). Remove the manual `apiRequest` helper.

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// --- Query Hooks ---

interface UseCorrectionAssistantItemsOptions {
  from?: string
  to?: string
  employeeId?: string
  departmentId?: string
  severity?: "error" | "hint"
  errorCode?: string
  limit?: number
  offset?: number
  enabled?: boolean
}

export function useCorrectionAssistantItems(options: UseCorrectionAssistantItemsOptions = {}) {
  const { enabled = true, ...params } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.correctionAssistant.listItems.queryOptions(
      params,
      { enabled }
    )
  )
}

interface UseCorrectionMessagesOptions {
  severity?: "error" | "hint"
  isActive?: boolean
  code?: string
  enabled?: boolean
}

export function useCorrectionMessages(options: UseCorrectionMessagesOptions = {}) {
  const { enabled = true, ...params } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.correctionAssistant.listMessages.queryOptions(
      params,
      { enabled }
    )
  )
}

export function useCorrectionMessage(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.correctionAssistant.getMessage.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

// --- Mutation Hooks ---

export function useUpdateCorrectionMessage() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.correctionAssistant.updateMessage.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.correctionAssistant.listMessages.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.correctionAssistant.getMessage.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.correctionAssistant.listItems.queryKey() })
    },
  })
}
```

**Important**: The hook parameter names change from `snake_case` to `camelCase` (e.g., `employee_id` -> `employeeId`, `error_code` -> `errorCode`). Check all call sites for these hooks and update them accordingly.

#### 3. Check and Update Call Sites
Search the codebase for all usages of the old hook function names and verify the parameter changes are compatible:

```bash
# Find all imports of these hooks
grep -rn "use-monthly-evaluations\|use-correction-assistant" apps/web/src/
# Find all usages of the exported functions
grep -rn "useMonthlyEvaluations\|useMonthlyEvaluation\|useDefaultMonthlyEvaluation\|useCreateMonthlyEvaluation\|useUpdateMonthlyEvaluation\|useDeleteMonthlyEvaluation\|useSetDefaultMonthlyEvaluation" apps/web/src/ --include='*.ts' --include='*.tsx'
grep -rn "useCorrectionAssistantItems\|useCorrectionMessages\|useCorrectionMessage\|useUpdateCorrectionMessage" apps/web/src/ --include='*.ts' --include='*.tsx'
```

Update any call sites that pass `snake_case` parameter names to use `camelCase` instead. For example:
- `employee_id` -> `employeeId`
- `department_id` -> `departmentId`
- `error_code` -> `errorCode`
- `is_active` -> `isActive`

Also update any call sites that access response data using `snake_case` field names to use `camelCase`:
- `daily_value_id` -> `dailyValueId`
- `employee_id` -> `employeeId`
- `employee_name` -> `employeeName`
- `department_id` -> `departmentId`
- `department_name` -> `departmentName`
- `value_date` -> `valueDate`
- `error_type` -> `errorType`
- `default_text` -> `defaultText`
- `custom_text` -> `customText`
- `effective_text` -> `effectiveText`
- `is_active` -> `isActive`
- `created_at` -> `createdAt`
- `updated_at` -> `updatedAt`
- `tenant_id` -> `tenantId`

### Success Criteria:

#### Automated Verification:
- [x] `cd apps/web && npx tsc --noEmit` passes
- [x] `cd apps/web && npm run lint` passes (or existing lint issues only)
- [x] No TypeScript errors in hook files or call sites

#### Manual Verification:
- [ ] Monthly evaluations UI loads and displays templates correctly
- [ ] Create/update/delete monthly evaluation templates works via the UI
- [ ] Set default template works via the UI
- [ ] Correction messages list loads (auto-seeds if first time for tenant)
- [ ] Correction assistant items list loads with error details
- [ ] Update correction message custom text works via the UI
- [ ] All filters (severity, employee, department, date range) work correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:
No new unit tests required for tRPC routers (follows the established pattern from previous tickets). The existing Go test suite (`apps/api/internal/service/correction_assistant_test.go`) validates the business logic behavior that the tRPC router must replicate.

### Integration Tests:
- Verify Prisma models generate correctly against the existing database schema
- Verify raw SQL query for daily_values returns expected columns and types

### Manual Testing Steps:
1. Call `monthlyEvalTemplates.list` -- verify returns templates ordered by name
2. Call `monthlyEvalTemplates.create` with `isDefault: true` -- verify previous default is cleared
3. Call `monthlyEvalTemplates.setDefault` -- verify atomicity (only one default at a time)
4. Call `monthlyEvalTemplates.delete` on default template -- verify error returned
5. Call `correctionAssistant.listMessages` for a new tenant -- verify 24 default messages are seeded
6. Call `correctionAssistant.listMessages` again -- verify no duplicates (idempotent)
7. Call `correctionAssistant.updateMessage` to set custom text -- verify `effectiveText` changes
8. Call `correctionAssistant.updateMessage` with empty string custom text -- verify it clears to null
9. Call `correctionAssistant.listItems` with no date filters -- verify default date range applied
10. Call `correctionAssistant.listItems` with employee/department/severity filters -- verify filtering works
11. Verify pagination on `listItems` with known data set

## Performance Considerations

- The correction assistant `listItems` query applies in-memory pagination after filtering, which is the same approach as the Go backend. For the expected data volumes (daily values with errors within a 2-month window), this is acceptable
- The `ensureDefaults` check runs a `COUNT` query before every `listMessages`/`listItems` call. This is a lightweight indexed query (`idx_correction_messages_tenant`) and is acceptable
- The raw SQL query for daily_values uses the `idx_daily_values_errors` partial index (`WHERE has_error = true`) for efficient filtering

## Migration Notes

- No database migrations needed -- both tables already exist
- The Prisma schema changes are additive (new models + relation arrays on Tenant)
- The Go backend remains functional during migration -- both REST and tRPC endpoints can coexist
- Frontend hooks maintain the same exported function names, so call sites only need parameter/field name updates (snake_case -> camelCase)

## References

- Research document: `thoughts/shared/research/2026-03-07-ZMI-TICKET-227-monthly-eval-templates-correction-messages.md`
- Reference tRPC router: `apps/web/src/server/routers/exportInterfaces.ts`
- Reference migrated hook: `apps/web/src/hooks/api/use-export-interfaces.ts`
- Root router: `apps/web/src/server/root.ts`
- Permission catalog: `apps/web/src/server/lib/permission-catalog.ts`
- Go calculation error codes: `apps/api/internal/calculation/errors.go`
- Go correction assistant service: `apps/api/internal/service/correction_assistant.go`
- Go monthly eval template service: `apps/api/internal/service/monthly_evaluation_template.go`
- Raw SQL query pattern: `apps/web/src/server/routers/reports.ts` (lines 890-903)
- Prisma schema: `apps/web/prisma/schema.prisma`
- DB migrations: `db/migrations/000081_create_monthly_evaluation_templates.up.sql`, `db/migrations/000045_create_correction_messages.up.sql`, `db/migrations/000024_create_daily_values.up.sql`
