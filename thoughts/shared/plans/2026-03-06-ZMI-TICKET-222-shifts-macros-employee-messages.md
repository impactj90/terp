# ZMI-TICKET-222 Implementation Plan: Shifts, Macros Config, Employee Messages tRPC Routers

## Overview

Port Go business logic for Shifts, Macros (CRUD + Assignments + Execution), and Employee Messages (CRUD + Send) to tRPC routers. Add Prisma models for all new tables, create three tRPC router files, register them in root.ts, and migrate frontend hooks from `useApiQuery`/`useApiMutation` to tRPC.

**Go files being replaced:**
- `apps/api/internal/service/shift.go` (175 lines)
- `apps/api/internal/handler/shift.go` (217 lines)
- `apps/api/internal/repository/shift.go` (97 lines)
- `apps/api/internal/service/macro.go` (562 lines)
- `apps/api/internal/handler/macro.go` (428 lines)
- `apps/api/internal/repository/macro.go` (278 lines)
- `apps/api/internal/service/employee_message.go` (233 lines)
- `apps/api/internal/handler/employee_message.go` (292 lines)
- `apps/api/internal/repository/employee_message.go` (180 lines)

---

## Phase 0: Prisma Schema + Supabase Migration (prerequisite for all phases)

### Files to modify

1. **`apps/web/prisma/schema.prisma`** -- Add 7 new models + reverse relations on existing models
2. **`supabase/migrations/<timestamp>_add_shifts_macros_employee_messages.sql`** -- Create tables in Supabase local DB

### 0.1 Supabase Migration

The tables exist in Go migrations (000070, 000076, 000077) but NOT in Supabase. Create a new Supabase migration that creates all 7 tables with their indexes and constraints. Use `make db-migrate-new name=add_shifts_macros_employee_messages` to create the file, then populate it with the DDL from:
- `db/migrations/000076_create_shift_planning.up.sql` (shifts + shift_assignments)
- `db/migrations/000077_create_macros.up.sql` (macros + macro_assignments + macro_executions)
- `db/migrations/000070_create_employee_messages.up.sql` (employee_messages + employee_message_recipients)

Wrap each CREATE TABLE in `CREATE TABLE IF NOT EXISTS` to be idempotent. Also include trigger creation (guarded with `IF NOT EXISTS` or `CREATE OR REPLACE`).

### 0.2 Prisma Schema Additions

Append the following models to `apps/web/prisma/schema.prisma` (after the NotificationPreference model at line 1822):

**New models to add:**

```
Shift                      -> table "shifts"
ShiftAssignment            -> table "shift_assignments"
Macro                      -> table "macros"
MacroAssignment            -> table "macro_assignments"
MacroExecution             -> table "macro_executions"
EmployeeMessage            -> table "employee_messages"
EmployeeMessageRecipient   -> table "employee_message_recipients"
```

**Model: Shift**
- Fields: id, tenantId, code, name, description?, dayPlanId?, color?, qualification?, isActive, sortOrder, createdAt, updatedAt
- Relations: tenant (Tenant), dayPlan (DayPlan?), shiftAssignments (ShiftAssignment[])
- Unique: @@unique([tenantId, code])
- Map: @@map("shifts")

**Model: ShiftAssignment**
- Fields: id, tenantId, employeeId, shiftId, validFrom?, validTo?, notes?, isActive, createdAt, updatedAt
- Relations: tenant (Tenant), employee (Employee), shift (Shift)
- Map: @@map("shift_assignments")

**Model: Macro**
- Fields: id, tenantId, name, description?, macroType, actionType, actionParams (Json), isActive, createdAt, updatedAt
- Relations: tenant (Tenant), assignments (MacroAssignment[]), executions (MacroExecution[])
- Unique: @@unique([tenantId, name])
- Map: @@map("macros")

**Model: MacroAssignment**
- Fields: id, tenantId, macroId, tariffId?, employeeId?, executionDay, isActive, createdAt, updatedAt
- Relations: tenant (Tenant), macro (Macro), tariff (Tariff?), employee (Employee?)
- Map: @@map("macro_assignments")

**Model: MacroExecution**
- Fields: id, tenantId, macroId, assignmentId?, status, triggerType, triggeredBy?, startedAt?, completedAt?, result (Json), errorMessage?, createdAt
- Relations: tenant (Tenant), macro (Macro), assignment (MacroAssignment?), triggeredByUser (User?)
- Map: @@map("macro_executions")
- NOTE: No updatedAt column (the SQL table doesn't have one)

**Model: EmployeeMessage**
- Fields: id, tenantId, senderId, subject, body, createdAt, updatedAt
- Relations: tenant (Tenant), sender (User), recipients (EmployeeMessageRecipient[])
- Map: @@map("employee_messages")

**Model: EmployeeMessageRecipient**
- Fields: id, messageId, employeeId, status, sentAt?, errorMessage?, createdAt, updatedAt
- Relations: message (EmployeeMessage), employee (Employee)
- Map: @@map("employee_message_recipients")

**Reverse relations to add on existing models:**
- `Tenant` (line ~97): add `shifts Shift[]`, `shiftAssignments ShiftAssignment[]`, `macros Macro[]`, `macroAssignments MacroAssignment[]`, `macroExecutions MacroExecution[]`, `employeeMessages EmployeeMessage[]`
- `DayPlan` (line ~1193): add `shifts Shift[]` (after `tariffDayPlans`)
- `User` (line ~54): add `employeeMessages EmployeeMessage[]`, `macroExecutionsTriggers MacroExecution[]`
- `Tariff` (line ~1382): add `macroAssignments MacroAssignment[]`
- `Employee` (line ~568): add `shiftAssignments ShiftAssignment[]`, `macroAssignments MacroAssignment[]`, `messageRecipients EmployeeMessageRecipient[]`

### 0.3 Generate Prisma Client

After schema changes, regenerate the Prisma client.

### Verification

```bash
cd /home/tolga/projects/terp && make db-reset
cd /home/tolga/projects/terp/apps/web && npx prisma generate
cd /home/tolga/projects/terp/apps/web && npx prisma db pull --force  # (optional: validate schema matches DB)
```

---

## Phase 1: Shifts tRPC Router

**Simplest router -- 5 procedures, straightforward CRUD with one "in-use" check on delete.**

### Files to create/modify

1. **CREATE** `apps/web/src/server/routers/shifts.ts`
2. **MODIFY** `apps/web/src/server/root.ts` -- Register `shifts: shiftsRouter`

### 1.1 Router: `apps/web/src/server/routers/shifts.ts`

**Permission:** `shift_planning.manage` (already in permission catalog at line 201)

**Enum constants:** None needed

**Output schema -- `shiftOutputSchema`:**
```typescript
z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  dayPlanId: z.string().uuid().nullable(),
  color: z.string().nullable(),
  qualification: z.string().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
```

**Input schemas:**

`createShiftInputSchema`:
- code: z.string().min(1, "Code is required").max(50)
- name: z.string().min(1, "Name is required").max(255)
- description: z.string().optional()
- dayPlanId: z.string().uuid().optional()
- color: z.string().max(7).optional()
- qualification: z.string().optional()
- sortOrder: z.number().int().optional()

`updateShiftInputSchema`:
- id: z.string().uuid()
- name: z.string().min(1).max(255).optional()
- description: z.string().nullable().optional()
- dayPlanId: z.string().uuid().nullable().optional()
- color: z.string().max(7).nullable().optional()
- qualification: z.string().nullable().optional()
- isActive: z.boolean().optional()
- sortOrder: z.number().int().optional()
- NOTE: `code` is NOT updatable (matches Go service)

**Procedures:**

| Procedure | Type | Business Logic |
|-----------|------|---------------|
| `list` | query | Fetch all shifts for tenant, ordered by `sortOrder ASC, code ASC` |
| `getById` | query | Fetch shift by ID + tenantId, throw NOT_FOUND if missing |
| `create` | mutation | Trim code/name, validate non-empty, check code uniqueness per tenant, validate dayPlanId FK if provided, create with isActive=true |
| `update` | mutation | Verify exists, apply partial updates. Trim name if provided. Code is NOT updatable. |
| `delete` | mutation | Verify exists. Check if shift is in use via `employee_day_plans.shift_id` (use raw SQL since `employee_day_plans` is NOT in Prisma schema). Also check `shift_assignments` table. Block deletion if in use. |

**Delete "in-use" check approach:**
Since `employee_day_plans` is NOT in the Prisma schema, use `$queryRawUnsafe`:
```typescript
const result = await ctx.prisma.$queryRawUnsafe<[{ count: bigint }]>(
  `SELECT COUNT(*)::bigint as count FROM employee_day_plans WHERE shift_id = $1`,
  input.id
)
const inUseByDayPlans = Number(result[0].count) > 0
```
Additionally check `shift_assignments` via Prisma:
```typescript
const assignmentCount = await ctx.prisma.shiftAssignment.count({
  where: { shiftId: input.id },
})
```

### 1.2 Root Registration

Add to `apps/web/src/server/root.ts`:
```typescript
import { shiftsRouter } from "./routers/shifts"
// In appRouter:
shifts: shiftsRouter,
```

### Verification

```bash
cd /home/tolga/projects/terp/apps/web && npx tsc --noEmit
```

---

## Phase 2: Macros tRPC Router

**Most complex router -- 12 procedures across CRUD, assignments, and executions.**

### Files to create/modify

1. **CREATE** `apps/web/src/server/routers/macros.ts`
2. **MODIFY** `apps/web/src/server/root.ts` -- Register `macros: macrosRouter`

### 2.1 Router: `apps/web/src/server/routers/macros.ts`

**Permission:** `macros.manage` (already in permission catalog at line 206)

**Enum constants:**
```typescript
const MACRO_TYPES = ["weekly", "monthly"] as const
const ACTION_TYPES = [
  "log_message",
  "recalculate_target_hours",
  "reset_flextime",
  "carry_forward_balance",
] as const
const EXECUTION_STATUSES = ["pending", "running", "completed", "failed"] as const
const TRIGGER_TYPES = ["scheduled", "manual"] as const
```

**Output schemas:**

`macroAssignmentOutputSchema`:
```typescript
z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  macroId: z.string().uuid(),
  tariffId: z.string().uuid().nullable(),
  employeeId: z.string().uuid().nullable(),
  executionDay: z.number(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
```

`macroOutputSchema`:
```typescript
z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  macroType: z.string(),
  actionType: z.string(),
  actionParams: z.unknown(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  assignments: z.array(macroAssignmentOutputSchema).optional(),
})
```

`macroExecutionOutputSchema`:
```typescript
z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  macroId: z.string().uuid(),
  assignmentId: z.string().uuid().nullable(),
  status: z.string(),
  triggerType: z.string(),
  triggeredBy: z.string().uuid().nullable(),
  startedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  result: z.unknown(),
  errorMessage: z.string().nullable(),
  createdAt: z.date(),
})
```

**Input schemas:**

`createMacroInputSchema`:
- name: z.string().min(1, "Name is required").max(255)
- description: z.string().optional()
- macroType: z.enum(MACRO_TYPES)
- actionType: z.enum(ACTION_TYPES)
- actionParams: z.unknown().optional()  (maps to JSONB)

`updateMacroInputSchema`:
- id: z.string().uuid()
- name: z.string().min(1).max(255).optional()
- description: z.string().nullable().optional()
- macroType: z.enum(MACRO_TYPES).optional()
- actionType: z.enum(ACTION_TYPES).optional()
- actionParams: z.unknown().optional()
- isActive: z.boolean().optional()

`createAssignmentInputSchema`:
- macroId: z.string().uuid()
- tariffId: z.string().uuid().optional()
- employeeId: z.string().uuid().optional()
- executionDay: z.number().int()

`updateAssignmentInputSchema`:
- macroId: z.string().uuid()
- assignmentId: z.string().uuid()
- executionDay: z.number().int().optional()
- isActive: z.boolean().optional()

**Procedures:**

#### Macro CRUD (5 procedures)

| Procedure | Type | Business Logic |
|-----------|------|---------------|
| `list` | query | Fetch all macros for tenant with assignments preloaded, ordered by `name ASC` |
| `getById` | query | Fetch macro by ID + tenantId with assignments preloaded, throw NOT_FOUND |
| `create` | mutation | Trim name, validate non-empty, check name uniqueness per tenant, validate macroType and actionType enums, create with isActive=true, re-fetch with assignments |
| `update` | mutation | Verify exists, partial update. If name changed, check uniqueness. Validate macroType/actionType if provided. Re-fetch with assignments. |
| `delete` | mutation | Verify exists, hard delete (cascades to assignments/executions via FK) |

#### Assignment Management (4 procedures)

| Procedure | Type | Business Logic |
|-----------|------|---------------|
| `listAssignments` | query | Verify macro exists in tenant, list assignments by macroId ordered by `createdAt ASC` |
| `createAssignment` | mutation | Verify macro exists in tenant. Validate exactly one of tariffId/employeeId (XOR). Validate executionDay based on macroType (weekly: 0-6, monthly: 1-31). Create with isActive=true. |
| `updateAssignment` | mutation | Verify macro exists. Verify assignment exists AND belongs to macro. Update executionDay (with validation) and/or isActive. |
| `deleteAssignment` | mutation | Verify macro exists. Verify assignment exists AND belongs to macro. Delete. |

**Execution day validation helper:**
```typescript
function validateExecutionDay(macroType: string, day: number): void {
  if (macroType === "weekly" && (day < 0 || day > 6)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Weekly execution day must be 0-6 (Sun-Sat)" })
  }
  if (macroType === "monthly" && (day < 1 || day > 31)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Monthly execution day must be 1-31" })
  }
}
```

#### Execution (3 procedures)

| Procedure | Type | Business Logic |
|-----------|------|---------------|
| `triggerExecution` | mutation | Verify macro exists in tenant and is active. Create execution record with status=running, triggerType=manual, triggeredBy=ctx.user.id. Run `executeAction`. Update status to completed/failed. Return execution. |
| `listExecutions` | query | Verify macro exists. List executions by macroId ordered by `createdAt DESC`, with optional limit (default 20). |
| `getExecution` | query | Fetch execution by ID, throw NOT_FOUND. |

**executeAction helper function** (port from Go `service/macro.go` lines 479-528):
```typescript
async function executeAction(macro: { id: string; name: string; macroType: string; actionType: string; actionParams: unknown }): Promise<{ result: unknown; error: string | null }> {
  const executedAt = new Date().toISOString()
  switch (macro.actionType) {
    case "log_message":
      return {
        result: { action: "log_message", macro_name: macro.name, macro_type: macro.macroType, executed_at: executedAt },
        error: null,
      }
    case "recalculate_target_hours":
      return { result: { action: "recalculate_target_hours", status: "placeholder", executed_at: executedAt }, error: null }
    case "reset_flextime":
      return { result: { action: "reset_flextime", status: "placeholder", executed_at: executedAt }, error: null }
    case "carry_forward_balance":
      return { result: { action: "carry_forward_balance", status: "placeholder", executed_at: executedAt }, error: null }
    default:
      return { result: {}, error: `Unknown action type: ${macro.actionType}` }
  }
}
```

**triggerExecution procedure detailed flow:**
1. Fetch macro (verify tenantId + id)
2. Check `isActive` -- throw BAD_REQUEST if inactive
3. Create MacroExecution record: status="running", triggerType="manual", triggeredBy=ctx.user.id, startedAt=now
4. Call `executeAction(macro)`
5. Update execution: completedAt=now, status="completed"|"failed", result, errorMessage
6. Return the execution record

### 2.2 Root Registration

Add to `apps/web/src/server/root.ts`:
```typescript
import { macrosRouter } from "./routers/macros"
// In appRouter:
macros: macrosRouter,
```

### Verification

```bash
cd /home/tolga/projects/terp/apps/web && npx tsc --noEmit
```

---

## Phase 3: Employee Messages tRPC Router

**5 procedures: list (paginated), getById, listForEmployee, create (with recipients), send.**

### Files to create/modify

1. **CREATE** `apps/web/src/server/routers/employeeMessages.ts`
2. **MODIFY** `apps/web/src/server/root.ts` -- Register `employeeMessages: employeeMessagesRouter`

### 3.1 Router: `apps/web/src/server/routers/employeeMessages.ts`

**Permission:** `notifications.manage` (already in permission catalog at line 115)

**Enum constants:**
```typescript
const RECIPIENT_STATUSES = ["pending", "sent", "failed"] as const
```

**Output schemas:**

`recipientOutputSchema`:
```typescript
z.object({
  id: z.string().uuid(),
  messageId: z.string().uuid(),
  employeeId: z.string().uuid(),
  status: z.string(),
  sentAt: z.date().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
```

`employeeMessageOutputSchema`:
```typescript
z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  senderId: z.string().uuid(),
  subject: z.string(),
  body: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  recipients: z.array(recipientOutputSchema).optional(),
})
```

`sendResultOutputSchema`:
```typescript
z.object({
  messageId: z.string().uuid(),
  sent: z.number(),
  failed: z.number(),
})
```

**Input schemas:**

`createMessageInputSchema`:
- subject: z.string().min(1, "Subject is required").max(255)
- body: z.string().min(1, "Body is required")
- employeeIds: z.array(z.string().uuid()).min(1, "At least one recipient is required")

`listMessagesInputSchema` (optional):
- status: z.enum(RECIPIENT_STATUSES).optional()
- limit: z.number().int().min(1).max(100).optional().default(20)
- offset: z.number().int().min(0).optional().default(0)

**Procedures:**

| Procedure | Type | Business Logic |
|-----------|------|---------------|
| `list` | query | Paginated list of messages for tenant. Filter by recipient status if provided (using nested where on recipients). Return `{ items, total }`. Include recipients in output. Order by `createdAt DESC`. |
| `getById` | query | Fetch message by ID + tenantId with recipients preloaded, throw NOT_FOUND |
| `listForEmployee` | query | Fetch messages where a specific employee is a recipient. Input: `{ employeeId, limit?, offset? }`. Query via `employeeMessageRecipient` -> include message. |
| `create` | mutation | Validate subject/body non-empty, at least one employeeId. SenderID from `ctx.user.id`. Use `$transaction` to create message + recipient records atomically. All recipients get status="pending". Return message with recipients. |
| `send` | mutation | Fetch message by ID, get pending recipients. For each pending recipient: create a Notification record (type="system", title=subject, message=body, userId from employee's linked user). Update recipient status to "sent" or "failed". Return `{ messageId, sent, failed }`. |

**Send procedure detailed flow:**
1. Fetch message with recipients (verify tenantId)
2. Filter to recipients where status="pending"
3. For each pending recipient:
   a. Look up the Employee to find their linked User (via `employee.user`)
   b. If employee has a linked user, create Notification: `{ tenantId, userId, type: "system", title: msg.subject, message: msg.body }`
   c. Update recipient status to "sent", set sentAt=now
   d. On error: set status="failed", errorMessage=error
4. Return `{ messageId, sent: count, failed: count }`

**Note on notification creation:** The Go service calls `notificationService.CreateForEmployee`. The tRPC equivalent creates Notification records directly via Prisma. Need to look up the employee's linked user to get the userId for the Notification.

### 3.2 Root Registration

Add to `apps/web/src/server/root.ts`:
```typescript
import { employeeMessagesRouter } from "./routers/employeeMessages"
// In appRouter:
employeeMessages: employeeMessagesRouter,
```

### Verification

```bash
cd /home/tolga/projects/terp/apps/web && npx tsc --noEmit
```

---

## Phase 4: Frontend Hooks Migration

**Migrate 3 hook files from `useApiQuery`/`useApiMutation` to tRPC pattern.**

### Files to modify

1. **`apps/web/src/hooks/api/use-shift-planning.ts`**
2. **`apps/web/src/hooks/api/use-macros.ts`**
3. **`apps/web/src/hooks/api/use-employee-messages.ts`**

### 4.1 Pattern Reference (from `use-tariffs.ts`)

All hooks follow this pattern:
```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// Query hook
export function useResourceList(options = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.resource.list.queryOptions(
      Object.keys(input).length > 0 ? input : undefined,
      { enabled }
    )
  )
}

// Single resource query
export function useResource(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.resource.getById.queryOptions({ id }, { enabled: enabled && !!id })
  )
}

// Mutation hook
export function useCreateResource() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.resource.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.resource.list.queryKey() })
    },
  })
}
```

### 4.2 Shift Hooks (`use-shift-planning.ts`)

Replace all content. Keep same function names for backwards compatibility.

| Old Hook | New Implementation |
|----------|-------------------|
| `useShifts(options)` | `trpc.shifts.list.queryOptions(undefined, { enabled })` |
| `useShift(id)` | `trpc.shifts.getById.queryOptions({ id }, { enabled })` |
| `useCreateShift()` | `trpc.shifts.create.mutationOptions()` + invalidate `shifts.list` |
| `useUpdateShift()` | `trpc.shifts.update.mutationOptions()` + invalidate `shifts.list` |
| `useDeleteShift()` | `trpc.shifts.delete.mutationOptions()` + invalidate `shifts.list` |

### 4.3 Macro Hooks (`use-macros.ts`)

Replace all content. More hooks due to assignments and executions.

| Old Hook | New Implementation |
|----------|-------------------|
| `useMacros(options)` | `trpc.macros.list.queryOptions(undefined, { enabled })` |
| `useMacro(id)` | `trpc.macros.getById.queryOptions({ id }, { enabled })` |
| `useCreateMacro()` | `trpc.macros.create.mutationOptions()` + invalidate `macros.list` |
| `useUpdateMacro()` | `trpc.macros.update.mutationOptions()` + invalidate `macros.list` |
| `useDeleteMacro()` | `trpc.macros.delete.mutationOptions()` + invalidate `macros.list` |
| `useMacroAssignments(macroId)` | `trpc.macros.listAssignments.queryOptions({ macroId }, { enabled })` |
| `useCreateMacroAssignment()` | `trpc.macros.createAssignment.mutationOptions()` + invalidate `macros.list` |
| `useUpdateMacroAssignment()` | `trpc.macros.updateAssignment.mutationOptions()` + invalidate `macros.list` |
| `useDeleteMacroAssignment()` | `trpc.macros.deleteAssignment.mutationOptions()` + invalidate `macros.list` |
| `useExecuteMacro()` | `trpc.macros.triggerExecution.mutationOptions()` + invalidate `macros.list` |
| `useMacroExecutions(macroId)` | `trpc.macros.listExecutions.queryOptions({ macroId }, { enabled })` |
| `useMacroExecution(id)` | `trpc.macros.getExecution.queryOptions({ id }, { enabled })` |

### 4.4 Employee Message Hooks (`use-employee-messages.ts`)

Replace all content.

| Old Hook | New Implementation |
|----------|-------------------|
| `useEmployeeMessages(options)` | `trpc.employeeMessages.list.queryOptions({ status, limit, offset }, { enabled })` |
| `useEmployeeMessage(id)` | `trpc.employeeMessages.getById.queryOptions({ id }, { enabled })` |
| `useEmployeeMessagesForEmployee(empId, options)` | `trpc.employeeMessages.listForEmployee.queryOptions({ employeeId, limit, offset }, { enabled })` |
| `useCreateEmployeeMessage()` | `trpc.employeeMessages.create.mutationOptions()` + invalidate `employeeMessages.list` |
| `useSendEmployeeMessage()` | `trpc.employeeMessages.send.mutationOptions()` + invalidate `employeeMessages.list` |

### Verification

```bash
cd /home/tolga/projects/terp/apps/web && npx tsc --noEmit
```

---

## Phase 5: Verification

### 5.1 TypeScript Compilation

```bash
cd /home/tolga/projects/terp/apps/web && npx tsc --noEmit
```

### 5.2 Lint

```bash
cd /home/tolga/projects/terp/apps/web && npx next lint
```

### 5.3 Prisma Client Generation

```bash
cd /home/tolga/projects/terp/apps/web && npx prisma generate
```

### 5.4 DB Reset (verifies migration)

```bash
cd /home/tolga/projects/terp && make db-reset
```

### 5.5 Manual Router Checklist

- [ ] `shifts` router: 5 procedures (list, getById, create, update, delete)
- [ ] `macros` router: 12 procedures (list, getById, create, update, delete, listAssignments, createAssignment, updateAssignment, deleteAssignment, triggerExecution, listExecutions, getExecution)
- [ ] `employeeMessages` router: 5 procedures (list, getById, listForEmployee, create, send)
- [ ] All routers registered in `root.ts`
- [ ] All frontend hooks migrated to tRPC
- [ ] No `useApiQuery`/`useApiMutation` imports remain in the 3 hook files

---

## Summary of All Files

### Files to CREATE (4)

| File | Description |
|------|-------------|
| `supabase/migrations/<timestamp>_add_shifts_macros_employee_messages.sql` | Supabase migration for 7 tables |
| `apps/web/src/server/routers/shifts.ts` | Shifts tRPC router (5 procedures) |
| `apps/web/src/server/routers/macros.ts` | Macros tRPC router (12 procedures) |
| `apps/web/src/server/routers/employeeMessages.ts` | Employee Messages tRPC router (5 procedures) |

### Files to MODIFY (5)

| File | Changes |
|------|---------|
| `apps/web/prisma/schema.prisma` | Add 7 models + reverse relations on 5 existing models |
| `apps/web/src/server/root.ts` | Import + register 3 new routers |
| `apps/web/src/hooks/api/use-shift-planning.ts` | Rewrite to use tRPC |
| `apps/web/src/hooks/api/use-macros.ts` | Rewrite to use tRPC |
| `apps/web/src/hooks/api/use-employee-messages.ts` | Rewrite to use tRPC |

### Total: 22 tRPC procedures across 3 routers

---

## Dependency Order

```
Phase 0 (Prisma + Migration)
    |
    +-- Phase 1 (Shifts router)
    |
    +-- Phase 2 (Macros router)
    |
    +-- Phase 3 (Employee Messages router)
    |
    +-- Phase 4 (Frontend hooks - depends on all routers being registered)
    |
    Phase 5 (Verification)
```

Phases 1, 2, and 3 are independent of each other but all depend on Phase 0. Phase 4 depends on all routers being registered. Phase 5 is the final check.
