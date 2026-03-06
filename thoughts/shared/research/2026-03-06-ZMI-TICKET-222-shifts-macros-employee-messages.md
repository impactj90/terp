# ZMI-TICKET-222 Research: Shifts, Macros Config, Employee Messages tRPC Routers

## 1. Go Business Logic to Port

### 1.1 Shift Service (`apps/api/internal/service/shift.go`)

**Service Methods:**

| Method | Signature | Logic |
|--------|-----------|-------|
| `Create` | `(ctx, CreateShiftInput) -> (*Shift, error)` | Validates code/name non-empty (trimmed). Checks code uniqueness per tenant via `GetByCode`. Creates with `IsActive=true`. |
| `GetByID` | `(ctx, id) -> (*Shift, error)` | Simple lookup, returns `ErrShiftNotFound` on miss. |
| `Update` | `(ctx, id, UpdateShiftInput) -> (*Shift, error)` | Fetches existing, applies partial updates (name, description, dayPlanId, color, qualification, isActive, sortOrder). Code is NOT updatable. |
| `Delete` | `(ctx, id) -> error` | Checks existence, then checks `HasAssignments` (queries `employee_day_plans` for `shift_id` references). Blocks deletion if in use. |
| `List` | `(ctx, tenantID) -> ([]Shift, error)` | Lists all shifts for tenant, ordered by `sort_order ASC, code ASC`. |
| `UpsertDevShift` | `(ctx, *Shift) -> error` | Dev seeding only, not needed in tRPC. |

**Input Structs:**
- `CreateShiftInput`: TenantID, Code, Name, Description, DayPlanID (*uuid), Color, Qualification, SortOrder (*int)
- `UpdateShiftInput`: Name*, Description*, DayPlanID*, Color*, Qualification*, IsActive*, SortOrder* (all optional pointers)

**Errors:** ErrShiftNotFound, ErrShiftCodeRequired, ErrShiftNameRequired, ErrShiftCodeExists, ErrShiftInUse

**Permission:** `shift_planning.manage`

---

### 1.2 Macro Service (`apps/api/internal/service/macro.go`)

**Macro CRUD Methods:**

| Method | Signature | Logic |
|--------|-----------|-------|
| `Create` | `(ctx, CreateMacroInput) -> (*Macro, error)` | Validates name non-empty, name uniqueness per tenant. Validates macroType (`weekly`/`monthly`), actionType (4 valid types). Sets `IsActive=true`. Returns with re-fetch (for assignments preload). |
| `GetByID` | `(ctx, tenantID, id) -> (*Macro, error)` | Tenant-scoped lookup with Assignments preloaded. |
| `List` | `(ctx, tenantID) -> ([]Macro, error)` | Lists all macros for tenant with Assignments preloaded, ordered by `name ASC`. |
| `Update` | `(ctx, tenantID, id, UpdateMacroInput) -> (*Macro, error)` | Partial update: name (uniqueness check if changed), description, macroType, actionType, actionParams, isActive. Returns re-fetched. |
| `Delete` | `(ctx, tenantID, id) -> error` | Validates existence, then hard deletes. |

**Assignment Methods:**

| Method | Signature | Logic |
|--------|-----------|-------|
| `CreateAssignment` | `(ctx, CreateAssignmentInput) -> (*MacroAssignment, error)` | Validates macro exists in tenant. Validates exactly one of tariffID/employeeID. Validates executionDay based on macroType (weekly: 0-6, monthly: 1-31). |
| `ListAssignments` | `(ctx, tenantID, macroID) -> ([]MacroAssignment, error)` | Verifies macro exists, lists by macroID ordered by `created_at ASC`. |
| `UpdateAssignment` | `(ctx, tenantID, macroID, assignmentID, UpdateAssignmentInput) -> (*MacroAssignment, error)` | Validates macro+assignment relationship, updates executionDay/isActive. |
| `DeleteAssignment` | `(ctx, tenantID, macroID, assignmentID) -> error` | Validates macro+assignment relationship, then deletes. |

**Execution Methods:**

| Method | Signature | Logic |
|--------|-----------|-------|
| `TriggerExecution` | `(ctx, tenantID, macroID, *triggeredBy) -> (*MacroExecution, error)` | Validates macro exists and is active. Creates execution record, runs `executeAction`, updates status to completed/failed. |
| `ListExecutions` | `(ctx, tenantID, macroID, limit) -> ([]MacroExecution, error)` | Verifies macro, lists by macroID ordered by `created_at DESC`, default limit=20. |
| `GetExecution` | `(ctx, id) -> (*MacroExecution, error)` | Simple lookup with Macro+Assignment preloaded. |
| `ExecuteDueMacros` | `(ctx, tenantID, date) -> (executed, failed, error)` | Scheduler method - NOT needed in tRPC (internal only). |

**Action Types (enum):** `log_message`, `recalculate_target_hours`, `reset_flextime`, `carry_forward_balance`
**Macro Types (enum):** `weekly`, `monthly`
**Execution Statuses:** `pending`, `running`, `completed`, `failed`
**Trigger Types:** `scheduled`, `manual`

**Permission:** `macros.manage`

---

### 1.3 Employee Message Service (`apps/api/internal/service/employee_message.go`)

**Service Methods:**

| Method | Signature | Logic |
|--------|-----------|-------|
| `Create` | `(ctx, CreateEmployeeMessageInput) -> (*EmployeeMessage, error)` | Validates subject, body non-empty, at least one employeeID. Creates message with recipient records (status=pending). |
| `GetByID` | `(ctx, tenantID, id) -> (*EmployeeMessage, error)` | Tenant-scoped lookup with Recipients preloaded. |
| `List` | `(ctx, tenantID, EmployeeMessageListParams) -> ([]EmployeeMessage, int64, error)` | Paginated list. Supports filters: recipientStatus, employeeID. Returns (messages, total, error). |
| `Send` | `(ctx, tenantID, messageID) -> (*SendResult, error)` | Fetches message, gets pending recipients, creates notification for each via `notificationService.CreateForEmployee`. Updates recipient status to sent/failed. Returns {MessageID, Sent, Failed}. |
| `ProcessPendingNotifications` | `(ctx) -> (*SendResult, error)` | Scheduler method - NOT needed in tRPC (internal only). |

**Input Structs:**
- `CreateEmployeeMessageInput`: TenantID, SenderID (from auth), Subject, Body, EmployeeIDs ([]uuid)
- `EmployeeMessageListParams`: RecipientStatus*, EmployeeID*, Limit, Offset
- `SendResult`: MessageID, Sent (int64), Failed (int64)

**Recipient Statuses:** `pending`, `sent`, `failed`

**Permission:** `notifications.manage`

---

## 2. Database Schema

### 2.1 `shifts` Table (migration 000076)

```sql
CREATE TABLE shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    day_plan_id UUID REFERENCES day_plans(id) ON DELETE SET NULL,
    color VARCHAR(7),
    qualification TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);
```

### 2.2 `shift_assignments` Table (migration 000076)

```sql
CREATE TABLE shift_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    valid_from DATE,
    valid_to DATE,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Note: `employee_day_plans` table also has `shift_id UUID REFERENCES shifts(id)` (migration 000083). The `HasAssignments` check in the Go service queries `employee_day_plans` for `shift_id` references.

### 2.3 `macros` Table (migration 000077)

```sql
CREATE TABLE macros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    macro_type VARCHAR(10) NOT NULL CHECK (macro_type IN ('weekly', 'monthly')),
    action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('log_message', 'recalculate_target_hours', 'reset_flextime', 'carry_forward_balance')),
    action_params JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);
```

### 2.4 `macro_assignments` Table (migration 000077)

```sql
CREATE TABLE macro_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    macro_id UUID NOT NULL REFERENCES macros(id) ON DELETE CASCADE,
    tariff_id UUID REFERENCES tariffs(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    execution_day INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK ((tariff_id IS NOT NULL AND employee_id IS NULL) OR (tariff_id IS NULL AND employee_id IS NOT NULL)),
    CHECK (execution_day >= 0 AND execution_day <= 31)
);
```

### 2.5 `macro_executions` Table (migration 000077)

```sql
CREATE TABLE macro_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    macro_id UUID NOT NULL REFERENCES macros(id) ON DELETE CASCADE,
    assignment_id UUID REFERENCES macro_assignments(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    trigger_type VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (trigger_type IN ('scheduled', 'manual')),
    triggered_by UUID REFERENCES users(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    result JSONB DEFAULT '{}',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.6 `employee_messages` Table (migration 000070)

```sql
CREATE TABLE employee_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.7 `employee_message_recipients` Table (migration 000070)

```sql
CREATE TABLE employee_message_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES employee_messages(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.8 Prisma Schema Status

**NONE of these tables have Prisma models yet.** The following models need to be added to `apps/web/prisma/schema.prisma`:
- `Shift`
- `ShiftAssignment` (for the `HasAssignments` check -- queries `employee_day_plans.shift_id`, but also `shift_assignments` table exists)
- `Macro`
- `MacroAssignment`
- `MacroExecution`
- `EmployeeMessage`
- `EmployeeMessageRecipient`

The DayPlan model already exists (line 1112) and needs a reverse relation `shifts Shift[]` added.

---

## 3. Existing tRPC Patterns

### 3.1 Router Structure (`apps/web/src/server/routers/*.ts`)

Each router file follows this consistent pattern:

```typescript
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// 1. Permission constant
const RESOURCE_MANAGE = permissionIdByKey("resource.manage")!

// 2. Output schemas (z.object)
const resourceOutputSchema = z.object({ ... })

// 3. Input schemas (z.object)
const createResourceInputSchema = z.object({ ... })
const updateResourceInputSchema = z.object({ id: z.string().uuid(), ... })

// 4. Helper mapper function
function mapToOutput(record: { ... }): ResourceOutput { ... }

// 5. Router
export const resourceRouter = createTRPCRouter({
  list: tenantProcedure
    .use(requirePermission(RESOURCE_MANAGE))
    .input(z.object({ ... }).optional())
    .output(z.object({ data: z.array(resourceOutputSchema) }))
    .query(async ({ ctx, input }) => { ... }),

  getById: tenantProcedure
    .use(requirePermission(RESOURCE_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(resourceOutputSchema)
    .query(async ({ ctx, input }) => { ... }),

  create: tenantProcedure
    .use(requirePermission(RESOURCE_MANAGE))
    .input(createResourceInputSchema)
    .output(resourceOutputSchema)
    .mutation(async ({ ctx, input }) => { ... }),

  update: tenantProcedure
    .use(requirePermission(RESOURCE_MANAGE))
    .input(updateResourceInputSchema)
    .output(resourceOutputSchema)
    .mutation(async ({ ctx, input }) => { ... }),

  delete: tenantProcedure
    .use(requirePermission(RESOURCE_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => { ... }),
})
```

### 3.2 Key Patterns

- **Procedure types:** `publicProcedure`, `protectedProcedure`, `tenantProcedure` (most common)
- **Permission middleware:** `.use(requirePermission(PERM_ID))` -- always applied after `tenantProcedure`
- **Tenant ID access:** `ctx.tenantId!` (non-null asserted, guaranteed by tenantProcedure)
- **User access:** `ctx.user.id` (guaranteed by protectedProcedure)
- **Prisma access:** `ctx.prisma.<model>.findMany/findFirst/create/update/delete`
- **Error throwing:** `throw new TRPCError({ code: "NOT_FOUND", message: "..." })`
- **Delete output:** Always `z.object({ success: z.boolean() })` returning `{ success: true }`
- **List output:** `z.object({ data: z.array(outputSchema) })` for simple lists, or `z.object({ items: z.array(outputSchema), total: z.number() })` for paginated
- **Input validation:** Zod schemas with `.trim()` validation in mutation handlers
- **Uniqueness checks:** `prisma.model.findFirst({ where: { tenantId, uniqueField } })`
- **Partial updates:** Build `data: Record<string, unknown> = {}`, check each field with `if (input.field !== undefined)`

### 3.3 Router Registration (`apps/web/src/server/root.ts`)

Routers are imported and added to `createTRPCRouter({ ... })` in `root.ts`. New routers need:
1. Import statement
2. Entry in the router map (e.g., `shifts: shiftsRouter`)

### 3.4 Permission Keys

From `apps/web/src/server/lib/permission-catalog.ts`:
- Shifts: `"shift_planning.manage"` (already in catalog)
- Macros: `"macros.manage"` (already in catalog)
- Employee Messages: `"notifications.manage"` (already in catalog)

### 3.5 Context (`apps/web/src/server/trpc.ts`)

```typescript
type TRPCContext = {
  prisma: PrismaClient
  authToken: string | null
  user: ContextUser | null  // includes userGroup, userTenants
  session: Session | null
  tenantId: string | null
}
```

---

## 4. Frontend Hooks to Migrate

### 4.1 Shift Hooks (`apps/web/src/hooks/api/use-shift-planning.ts`)

| Hook | Current API Call | tRPC Equivalent |
|------|-----------------|-----------------|
| `useShifts(options)` | `GET /shifts` | `trpc.shifts.list.useQuery()` |
| `useShift(id)` | `GET /shifts/{id}` | `trpc.shifts.getById.useQuery({ id })` |
| `useCreateShift()` | `POST /shifts` | `trpc.shifts.create.useMutation()` |
| `useUpdateShift()` | `PATCH /shifts/{id}` | `trpc.shifts.update.useMutation()` |
| `useDeleteShift()` | `DELETE /shifts/{id}` | `trpc.shifts.delete.useMutation()` |

### 4.2 Macro Hooks (`apps/web/src/hooks/api/use-macros.ts`)

| Hook | Current API Call | tRPC Equivalent |
|------|-----------------|-----------------|
| `useMacros(options)` | `GET /macros` | `trpc.macros.list.useQuery()` |
| `useMacro(id)` | `GET /macros/{id}` | `trpc.macros.getById.useQuery({ id })` |
| `useCreateMacro()` | `POST /macros` | `trpc.macros.create.useMutation()` |
| `useUpdateMacro()` | `PATCH /macros/{id}` | `trpc.macros.update.useMutation()` |
| `useDeleteMacro()` | `DELETE /macros/{id}` | `trpc.macros.delete.useMutation()` |
| `useMacroAssignments(macroId)` | `GET /macros/{id}/assignments` | `trpc.macros.listAssignments.useQuery({ macroId })` |
| `useCreateMacroAssignment()` | `POST /macros/{id}/assignments` | `trpc.macros.createAssignment.useMutation()` |
| `useUpdateMacroAssignment()` | `PATCH /macros/{id}/assignments/{assignmentId}` | `trpc.macros.updateAssignment.useMutation()` |
| `useDeleteMacroAssignment()` | `DELETE /macros/{id}/assignments/{assignmentId}` | `trpc.macros.deleteAssignment.useMutation()` |
| `useExecuteMacro()` | `POST /macros/{id}/execute` | `trpc.macros.triggerExecution.useMutation()` |
| `useMacroExecutions(macroId)` | `GET /macros/{id}/executions` | `trpc.macros.listExecutions.useQuery({ macroId })` |
| `useMacroExecution(id)` | `GET /macro-executions/{id}` | `trpc.macros.getExecution.useQuery({ id })` |

### 4.3 Employee Message Hooks (`apps/web/src/hooks/api/use-employee-messages.ts`)

| Hook | Current API Call | tRPC Equivalent |
|------|-----------------|-----------------|
| `useEmployeeMessages(options)` | `GET /employee-messages` | `trpc.employeeMessages.list.useQuery({ ... })` |
| `useEmployeeMessage(id)` | `GET /employee-messages/{id}` | `trpc.employeeMessages.getById.useQuery({ id })` |
| `useEmployeeMessagesForEmployee(empId)` | `GET /employees/{id}/messages` | `trpc.employeeMessages.listForEmployee.useQuery({ employeeId })` |
| `useCreateEmployeeMessage()` | `POST /employee-messages` | `trpc.employeeMessages.create.useMutation()` |
| `useSendEmployeeMessage()` | `POST /employee-messages/{id}/send` | `trpc.employeeMessages.send.useMutation()` |

---

## 5. Implementation Plan

### 5.1 Prisma Schema Additions

Add to `apps/web/prisma/schema.prisma` (append before closing):

**Models needed:**
1. `Shift` - with relation to DayPlan, Tenant
2. `Macro` - with relations to Tenant, MacroAssignment[]
3. `MacroAssignment` - with relations to Macro, Tariff?, Employee?
4. `MacroExecution` - with relations to Macro, MacroAssignment?, User?
5. `EmployeeMessage` - with relations to Tenant, User (sender), EmployeeMessageRecipient[]
6. `EmployeeMessageRecipient` - with relations to EmployeeMessage, Employee

**Also need reverse relations on existing models:**
- `DayPlan` -> add `shifts Shift[]`
- `Tenant` -> add relations to new models
- `Tariff` -> add `macroAssignments MacroAssignment[]`
- `Employee` -> add `macroAssignments MacroAssignment[]`, `messageRecipients EmployeeMessageRecipient[]`
- `User` -> add `employeeMessages EmployeeMessage[]`, `macroExecutionsTriggers MacroExecution[]`

### 5.2 Supabase Migration

Create a new Supabase migration (these tables already exist from the Go DB migrations, so no DDL needed -- only need the Prisma schema introspection). However, if the Supabase local DB doesn't have these tables yet, a migration may be needed.

### 5.3 tRPC Router Files to Create

1. `apps/web/src/server/routers/shifts.ts` -- Shift CRUD (5 procedures)
2. `apps/web/src/server/routers/macros.ts` -- Macro CRUD + Assignments + Execution (12 procedures)
3. `apps/web/src/server/routers/employeeMessages.ts` -- Employee Message CRUD + Send (5 procedures)

### 5.4 Router Registration

Update `apps/web/src/server/root.ts`:
```typescript
import { shiftsRouter } from "./routers/shifts"
import { macrosRouter } from "./routers/macros"
import { employeeMessagesRouter } from "./routers/employeeMessages"

// Add to appRouter:
shifts: shiftsRouter,
macros: macrosRouter,
employeeMessages: employeeMessagesRouter,
```

### 5.5 Frontend Hook Migration (Optional for this ticket)

Update hooks files to use tRPC instead of `useApiQuery`/`useApiMutation`.

---

## 6. Key Implementation Notes

### 6.1 Shift-Specific Notes

- **HasAssignments check:** The Go service checks `employee_day_plans.shift_id`. For tRPC, use raw SQL or add the `EmployeeDayPlan` model reference. Since `employee_day_plans` is NOT in the Prisma schema, use `$queryRawUnsafe`:
  ```typescript
  const result = await ctx.prisma.$queryRawUnsafe<[{ count: number }]>(
    `SELECT COUNT(*)::int as count FROM employee_day_plans WHERE shift_id = $1`,
    input.id
  )
  ```
- **Code uniqueness:** `UNIQUE(tenant_id, code)` constraint at DB level
- **DayPlanID:** Optional FK to `day_plans`, validate it exists if provided

### 6.2 Macro-Specific Notes

- **Complex router:** This is the most complex of the three -- has 12 procedures across CRUD, assignments, and executions
- **Macro execution:** The `executeMacro` internal method creates an execution record, runs the action, and updates status. The tRPC `triggerExecution` procedure should replicate this logic.
- **Action execution:** The `executeAction` function runs predefined actions. For tRPC, implement the same switch statement. Most actions are placeholders except `log_message`.
- **Execution day validation:** Weekly macros: 0-6 (Sun-Sat). Monthly macros: 1-31.
- **ActionParams:** JSONB field, use `z.unknown()` or `z.record(z.string(), z.unknown())` for the Zod schema
- **Name uniqueness:** `UNIQUE(tenant_id, name)` constraint at DB level
- **Trigger execution needs `ctx.user.id`** for the `triggeredBy` field

### 6.3 Employee Message-Specific Notes

- **Notification integration:** The `Send` method creates notifications via `notificationService.CreateForEmployee`. In tRPC, this should directly create `Notification` records in Prisma (the Notification model already exists).
- **SenderID:** Comes from `ctx.user.id` (authenticated user)
- **Paginated list:** Returns `{ data: [...], total: count }` format
- **Recipient status filter:** Can filter messages by recipient status using subquery approach
- **ListForEmployee:** Filters to messages where the employee is a recipient

### 6.4 General Patterns to Follow

1. Use `tenantProcedure` for all procedures (provides auth + tenant)
2. Use `.use(requirePermission(PERM_ID))` for permission checks
3. Follow the exact same validation logic as the Go service methods
4. Use Prisma transactions (`$transaction`) when creating related records atomically
5. Map Prisma records to output schemas via helper functions
6. Use `TRPCError` with appropriate codes: `NOT_FOUND`, `BAD_REQUEST`, `CONFLICT`, `FORBIDDEN`
7. Follow naming convention: camelCase for procedure names (list, getById, create, update, delete)
