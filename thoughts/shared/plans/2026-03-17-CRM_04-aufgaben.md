# Implementation Plan: CRM_04 Aufgaben & Nachrichten

**Date:** 2026-03-17
**Ticket:** `thoughts/shared/tickets/orgAuftrag/TICKET_CRM_04_AUFGABEN.md`
**Research:** `thoughts/shared/research/2026-03-17-CRM_04-aufgaben.md`

---

## Phase 1: Database & Schema

### 1a. Prisma Schema — Add enums and models

**File:** `prisma/schema.prisma`

**Add two enums** after `CrmInquiryStatus` (after line 370):

```prisma
enum CrmTaskType {
  TASK
  MESSAGE

  @@map("crm_task_type")
}

enum CrmTaskStatus {
  OPEN
  IN_PROGRESS
  COMPLETED
  CANCELLED

  @@map("crm_task_status")
}
```

**Add `CrmTask` model** after `CrmInquiry` model (after line 446), before the UserGroup block:

```prisma
// -----------------------------------------------------------------------------
// CrmTask
// -----------------------------------------------------------------------------
// Migration: 000098
//
// Internal task or message for CRM. Can be linked to an address, contact,
// or inquiry. Assignees are stored in CrmTaskAssignee (employees or teams).
model CrmTask {
  id            String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String        @map("tenant_id") @db.Uuid
  type          CrmTaskType   @default(TASK)
  subject       String        @db.VarChar(255)
  description   String?       @db.Text
  addressId     String?       @map("address_id") @db.Uuid
  contactId     String?       @map("contact_id") @db.Uuid
  inquiryId     String?       @map("inquiry_id") @db.Uuid
  status        CrmTaskStatus @default(OPEN)
  dueAt         DateTime?     @map("due_at") @db.Timestamptz(6)
  dueTime       String?       @map("due_time") @db.VarChar(5)
  durationMin   Int?          @map("duration_min")
  attachments   Json?         @db.JsonB
  completedAt   DateTime?     @map("completed_at") @db.Timestamptz(6)
  completedById String?       @map("completed_by_id") @db.Uuid
  createdAt     DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime      @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById   String?       @map("created_by_id") @db.Uuid

  tenant    Tenant             @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  address   CrmAddress?        @relation(fields: [addressId], references: [id], onDelete: SetNull)
  contact   CrmContact?        @relation(fields: [contactId], references: [id], onDelete: SetNull)
  inquiry   CrmInquiry?        @relation(fields: [inquiryId], references: [id], onDelete: SetNull)
  assignees CrmTaskAssignee[]

  @@index([tenantId, status])
  @@index([tenantId, dueAt])
  @@index([tenantId, addressId])
  @@index([tenantId, inquiryId])
  @@map("crm_tasks")
}

// -----------------------------------------------------------------------------
// CrmTaskAssignee
// -----------------------------------------------------------------------------
// Migration: 000098
//
// Join table linking a CrmTask to individual employees or entire teams.
// readAt tracks when the assignee read/acknowledged the task.
model CrmTaskAssignee {
  id         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  taskId     String    @map("task_id") @db.Uuid
  employeeId String?   @map("employee_id") @db.Uuid
  teamId     String?   @map("team_id") @db.Uuid
  readAt     DateTime? @map("read_at") @db.Timestamptz(6)
  createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)

  task     CrmTask   @relation(fields: [taskId], references: [id], onDelete: Cascade)
  employee Employee? @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  team     Team?     @relation(fields: [teamId], references: [id], onDelete: Cascade)

  @@unique([taskId, employeeId])
  @@unique([taskId, teamId])
  @@index([employeeId])
  @@index([teamId])
  @@map("crm_task_assignees")
}
```

**Add reverse relations** to existing models:

1. **Tenant model** (after line 182, after `crmInquiries`):
   ```prisma
   crmTasks                    CrmTask[]
   ```

2. **CrmAddress model** (after line 296, after `inquiries`):
   ```prisma
   tasks           CrmTask[]
   ```

3. **CrmContact model** (after line 330, after `inquiries`):
   ```prisma
   tasks           CrmTask[]
   ```

4. **CrmInquiry model** (after line 439, after `correspondences`):
   ```prisma
   tasks           CrmTask[]
   ```

5. **Employee model** (after line 905, after `orderBookings`):
   ```prisma
   crmTaskAssignees CrmTaskAssignee[]
   ```

6. **Team model** (after line 761, after `members`):
   ```prisma
   crmTaskAssignees CrmTaskAssignee[]
   ```

### 1b. Supabase Migration

**File:** `supabase/migrations/20260101000098_create_crm_tasks.sql` (CREATE)

```sql
-- CRM_04: Tasks & Messages (Aufgaben & Nachrichten)

CREATE TYPE crm_task_type AS ENUM ('TASK', 'MESSAGE');
CREATE TYPE crm_task_status AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

CREATE TABLE crm_tasks (
    id               UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID              NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    type             crm_task_type     NOT NULL DEFAULT 'TASK',
    subject          VARCHAR(255)      NOT NULL,
    description      TEXT,
    address_id       UUID              REFERENCES crm_addresses(id) ON DELETE SET NULL,
    contact_id       UUID              REFERENCES crm_contacts(id) ON DELETE SET NULL,
    inquiry_id       UUID              REFERENCES crm_inquiries(id) ON DELETE SET NULL,
    status           crm_task_status   NOT NULL DEFAULT 'OPEN',
    due_at           TIMESTAMPTZ,
    due_time         VARCHAR(5),
    duration_min     INTEGER,
    attachments      JSONB,
    completed_at     TIMESTAMPTZ,
    completed_by_id  UUID,
    created_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    created_by_id    UUID
);

CREATE INDEX idx_crm_tasks_tenant_status ON crm_tasks(tenant_id, status);
CREATE INDEX idx_crm_tasks_tenant_due ON crm_tasks(tenant_id, due_at);
CREATE INDEX idx_crm_tasks_tenant_address ON crm_tasks(tenant_id, address_id);
CREATE INDEX idx_crm_tasks_tenant_inquiry ON crm_tasks(tenant_id, inquiry_id);

CREATE TABLE crm_task_assignees (
    id               UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id          UUID              NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
    employee_id      UUID              REFERENCES employees(id) ON DELETE CASCADE,
    team_id          UUID              REFERENCES teams(id) ON DELETE CASCADE,
    read_at          TIMESTAMPTZ,
    created_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_crm_task_assignees_task_employee UNIQUE (task_id, employee_id),
    CONSTRAINT uq_crm_task_assignees_task_team UNIQUE (task_id, team_id)
);

CREATE INDEX idx_crm_task_assignees_employee ON crm_task_assignees(employee_id);
CREATE INDEX idx_crm_task_assignees_team ON crm_task_assignees(team_id);

-- Trigger for updated_at
CREATE TRIGGER set_crm_tasks_updated_at
  BEFORE UPDATE ON crm_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### 1c. Prisma Client Regeneration

**Command:** `pnpm db:generate`

### Verification

```bash
pnpm db:generate
```

**Success criteria:** Command exits 0, no errors. `@/generated/prisma/client` exports `CrmTask`, `CrmTaskAssignee`, `CrmTaskType`, `CrmTaskStatus`.

---

## Phase 2: Permissions

### 2a. Add permissions to catalog

**File:** `src/lib/auth/permission-catalog.ts` (EDIT)

Add after the CRM Inquiries block (after line 240, before the closing `]`):

```ts
  // CRM Tasks
  p("crm_tasks.view", "crm_tasks", "view", "View CRM tasks and messages"),
  p("crm_tasks.create", "crm_tasks", "create", "Create CRM tasks and messages"),
  p("crm_tasks.edit", "crm_tasks", "edit", "Edit CRM tasks and messages"),
  p("crm_tasks.delete", "crm_tasks", "delete", "Delete CRM tasks and messages"),
```

### Verification

```bash
pnpm typecheck
```

**Success criteria:** No new type errors introduced. `permissionIdByKey("crm_tasks.view")` returns a valid UUID string.

---

## Phase 3: Backend — Repository

### 3a. Create repository

**File:** `src/lib/services/crm-task-repository.ts` (CREATE)

**Pattern:** Follow `crm-inquiry-repository.ts` exactly.

**Functions to implement:**

| Function | Signature | Description |
|----------|-----------|-------------|
| `findMany` | `(prisma, tenantId, params: { addressId?, inquiryId?, assigneeEmployeeId?, status?, type?, search?, page, pageSize })` → `{ items, total }` | Paginated list with filters. Include `assignees` (with `employee` and `team`), `address`, `contact`, `inquiry`. |
| `findMyTasks` | `(prisma, tenantId, employeeId, params: { status?, type?, page, pageSize })` → `{ items, total }` | Tasks where the employee is a direct assignee OR a member of an assigned team. Use Prisma `OR` with nested `assignees.some`. |
| `findById` | `(prisma, tenantId, id)` → `CrmTask \| null` | Single task with full includes: `assignees` (with `employee` and `team`), `address`, `contact`, `inquiry`. |
| `create` | `(prisma, data, assignees)` → `CrmTask` | Transaction: create task + create assignees via `createMany`. Return with full includes. |
| `update` | `(prisma, tenantId, id, data)` → `CrmTask \| null` | `updateMany` for tenant scoping, then `findFirst`. |
| `updateAssignees` | `(prisma, taskId, assignees)` → `void` | Transaction: delete existing assignees, create new ones. |
| `remove` | `(prisma, tenantId, id)` → `boolean` | `deleteMany` with tenant scope, return `count > 0`. |
| `markRead` | `(prisma, taskId, employeeId)` → `void` | Update `readAt` on the matching `CrmTaskAssignee`. |

**Key patterns to follow:**

- Tenant isolation: All queries include `tenantId` in where clause
- Pagination: `skip: (page - 1) * pageSize, take: pageSize`
- Search: `OR` with `contains` + `mode: "insensitive"` on `subject`
- Update: `updateMany` for tenant scoping, then `findFirst` to return updated
- Delete: `deleteMany` with tenant scope, return `count > 0`
- Transaction for create: `prisma.$transaction(async (tx) => { ... })`

**`findMyTasks` query logic:**

```ts
const where = {
  tenantId,
  assignees: {
    some: {
      OR: [
        { employeeId },
        { team: { members: { some: { employeeId } } } },
      ],
    },
  },
  ...(params.status ? { status: params.status } : {}),
  ...(params.type ? { type: params.type } : {}),
}
```

**Standard include object** (reuse across functions):

```ts
const taskInclude = {
  assignees: {
    include: {
      employee: { select: { id: true, firstName: true, lastName: true } },
      team: { select: { id: true, name: true } },
    },
  },
  address: { select: { id: true, company: true, number: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
  inquiry: { select: { id: true, title: true, number: true } },
}
```

### Verification

```bash
pnpm typecheck
```

**Success criteria:** No new type errors. All repository functions compile.

---

## Phase 4: Backend — Service

### 4a. Create service

**File:** `src/lib/services/crm-task-service.ts` (CREATE)

**Pattern:** Follow `crm-inquiry-service.ts` exactly.

**Error classes:**

```ts
export class CrmTaskNotFoundError extends Error {
  constructor(message = "CRM task not found") {
    super(message); this.name = "CrmTaskNotFoundError"
  }
}
export class CrmTaskValidationError extends Error {
  constructor(message: string) {
    super(message); this.name = "CrmTaskValidationError"
  }
}
export class CrmTaskConflictError extends Error {
  constructor(message: string) {
    super(message); this.name = "CrmTaskConflictError"
  }
}
```

**Service functions:**

| Function | Signature | Logic |
|----------|-----------|-------|
| `list` | `(prisma, tenantId, params)` | Delegate to `repo.findMany`. |
| `myTasks` | `(prisma, tenantId, employeeId, params)` | Validate `employeeId` is not null (throw `CrmTaskValidationError` if missing). Delegate to `repo.findMyTasks`. |
| `getById` | `(prisma, tenantId, id)` | Delegate to `repo.findById`. Throw `CrmTaskNotFoundError` if null. |
| `create` | `(prisma, tenantId, input, createdById)` | Validate: at least one assignee required. Validate: addressId belongs to tenant (if provided). Validate: contactId belongs to address (if both provided). Validate: inquiryId belongs to tenant (if provided). Call `repo.create`. Then send notifications to assignees (see notification logic below). |
| `update` | `(prisma, tenantId, input)` | Find existing (throw `CrmTaskNotFoundError` if missing). Reject if COMPLETED or CANCELLED (`CrmTaskValidationError`). Build update data from changed fields. Auto-transition OPEN to IN_PROGRESS on first update. Call `repo.update`. |
| `complete` | `(prisma, tenantId, id, completedById)` | Find existing. Reject if already COMPLETED (`CrmTaskConflictError`). Reject if CANCELLED (`CrmTaskValidationError`). Update: `status=COMPLETED, completedAt=new Date(), completedById`. |
| `cancel` | `(prisma, tenantId, id)` | Find existing. Reject if COMPLETED or CANCELLED. Update: `status=CANCELLED`. |
| `reopen` | `(prisma, tenantId, id)` | Find existing. Only allow if COMPLETED or CANCELLED. Update: `status=IN_PROGRESS, completedAt=null, completedById=null`. |
| `markRead` | `(prisma, tenantId, taskId, employeeId)` | Find task (throw not found if missing). Call `repo.markRead`. |
| `remove` | `(prisma, tenantId, id)` | Call `repo.remove`. Throw `CrmTaskNotFoundError` if `count === 0`. |

**Notification logic in `create`:**

After creating the task, for each assignee:

1. If `assignee.employeeId`:
   - Look up `employee` with `include: { user: true }`
   - If `employee.user` exists, create notification: `{ tenantId, userId: employee.user.id, type: "reminders", title: "Neue Aufgabe: {subject}", message: "Sie haben eine neue Aufgabe erhalten.", link: "/crm/tasks" }`

2. If `assignee.teamId`:
   - Look up team members via `prisma.teamMember.findMany({ where: { teamId }, include: { employee: { include: { user: true } } } })`
   - For each team member with a linked user, create notification

Notifications are best-effort (wrap in try/catch to avoid blocking task creation on notification failure).

### Verification

```bash
pnpm typecheck
```

**Success criteria:** No new type errors. All service functions compile.

---

## Phase 5: Backend — tRPC Router

### 5a. Create router

**File:** `src/trpc/routers/crm/tasks.ts` (CREATE)

**Pattern:** Follow `src/trpc/routers/crm/inquiries.ts` exactly.

**Structure:**

```ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as crmTaskService from "@/lib/services/crm-task-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const TASK_VIEW = permissionIdByKey("crm_tasks.view")!
const TASK_CREATE = permissionIdByKey("crm_tasks.create")!
const TASK_EDIT = permissionIdByKey("crm_tasks.edit")!
const TASK_DELETE = permissionIdByKey("crm_tasks.delete")!

// --- Base procedure with module guard ---
const crmProcedure = tenantProcedure.use(requireModule("crm"))
```

**Input Schemas:**

```ts
const listInput = z.object({
  addressId: z.string().uuid().optional(),
  inquiryId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
  type: z.enum(["TASK", "MESSAGE"]).optional(),
  search: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})

const myTasksInput = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
  type: z.enum(["TASK", "MESSAGE"]).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})

const createInput = z.object({
  type: z.enum(["TASK", "MESSAGE"]).default("TASK"),
  subject: z.string().min(1),
  description: z.string().optional(),
  addressId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  inquiryId: z.string().uuid().optional(),
  dueAt: z.string().datetime().optional(),  // ISO string, converted to Date in service
  dueTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  durationMin: z.number().int().min(1).optional(),
  attachments: z.array(z.object({
    name: z.string(),
    url: z.string().url(),
    size: z.number(),
    mimeType: z.string(),
  })).optional(),
  assignees: z.array(z.object({
    employeeId: z.string().uuid().optional(),
    teamId: z.string().uuid().optional(),
  }).refine(a => a.employeeId || a.teamId, "Either employeeId or teamId required")),
})

const updateInput = z.object({
  id: z.string().uuid(),
  subject: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  addressId: z.string().uuid().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
  inquiryId: z.string().uuid().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  dueTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  durationMin: z.number().int().min(1).nullable().optional(),
  attachments: z.array(z.object({
    name: z.string(),
    url: z.string().url(),
    size: z.number(),
    mimeType: z.string(),
  })).nullable().optional(),
  assignees: z.array(z.object({
    employeeId: z.string().uuid().optional(),
    teamId: z.string().uuid().optional(),
  }).refine(a => a.employeeId || a.teamId, "Either employeeId or teamId required")).optional(),
})

const idInput = z.object({ id: z.string().uuid() })
```

**Procedures:**

| Procedure | Type | Guard | Handler |
|-----------|------|-------|---------|
| `list` | query | `crmProcedure.use(requirePermission(TASK_VIEW))` | `crmTaskService.list(prisma, tenantId, input)` |
| `myTasks` | query | `crmProcedure` (no permission — any authenticated user) | `crmTaskService.myTasks(prisma, tenantId, ctx.user!.employeeId, input)` |
| `getById` | query | `crmProcedure.use(requirePermission(TASK_VIEW))` | `crmTaskService.getById(prisma, tenantId, input.id)` |
| `create` | mutation | `crmProcedure.use(requirePermission(TASK_CREATE))` | `crmTaskService.create(prisma, tenantId, input, ctx.user!.id)` |
| `update` | mutation | `crmProcedure.use(requirePermission(TASK_EDIT))` | `crmTaskService.update(prisma, tenantId, input)` |
| `complete` | mutation | `crmProcedure.use(requirePermission(TASK_EDIT))` | `crmTaskService.complete(prisma, tenantId, input.id, ctx.user!.id)` |
| `cancel` | mutation | `crmProcedure.use(requirePermission(TASK_EDIT))` | `crmTaskService.cancel(prisma, tenantId, input.id)` |
| `reopen` | mutation | `crmProcedure.use(requirePermission(TASK_EDIT))` | `crmTaskService.reopen(prisma, tenantId, input.id)` |
| `markRead` | mutation | `crmProcedure` (no permission — any authenticated user) | `crmTaskService.markRead(prisma, tenantId, input.id, ctx.user!.employeeId)` |
| `delete` | mutation | `crmProcedure.use(requirePermission(TASK_DELETE))` | `crmTaskService.remove(prisma, tenantId, input.id)` returns `{ success: true }` |

Each procedure follows the try/catch + `handleServiceError(err)` pattern.

### 5b. Register router

**File:** `src/trpc/routers/crm/index.ts` (EDIT)

Add import and merge:

```ts
import { crmTasksRouter } from "./tasks"

export const crmRouter = createTRPCRouter({
  addresses: crmAddressesRouter,
  correspondence: crmCorrespondenceRouter,
  inquiries: crmInquiriesRouter,
  numberSequences: numberSequencesRouter,
  tasks: crmTasksRouter,
})
```

Update the JSDoc comment to include "tasks".

### Verification

```bash
pnpm typecheck
```

**Success criteria:** No new type errors. `trpc.crm.tasks.*` routes are available.

---

## Phase 6: Frontend — Hooks

### 6a. Create hooks file

**File:** `src/hooks/use-crm-tasks.ts` (CREATE)

**Pattern:** Follow `src/hooks/use-crm-inquiries.ts` exactly.

**Hooks to implement:**

| Hook | Type | tRPC path | Cache invalidation |
|------|------|-----------|-------------------|
| `useCrmTasks(options)` | query | `crm.tasks.list` | - |
| `useMyTasks(options)` | query | `crm.tasks.myTasks` | - |
| `useCrmTaskById(id, enabled)` | query | `crm.tasks.getById` | - |
| `useCreateCrmTask()` | mutation | `crm.tasks.create` | Invalidate `list`, `myTasks` |
| `useUpdateCrmTask()` | mutation | `crm.tasks.update` | Invalidate `list`, `myTasks`, `getById` |
| `useCompleteCrmTask()` | mutation | `crm.tasks.complete` | Invalidate `list`, `myTasks`, `getById` |
| `useCancelCrmTask()` | mutation | `crm.tasks.cancel` | Invalidate `list`, `myTasks`, `getById` |
| `useReopenCrmTask()` | mutation | `crm.tasks.reopen` | Invalidate `list`, `myTasks`, `getById` |
| `useMarkCrmTaskRead()` | mutation | `crm.tasks.markRead` | Invalidate `list`, `myTasks`, `getById` |
| `useDeleteCrmTask()` | mutation | `crm.tasks.delete` | Invalidate `list`, `myTasks` |

**`useCrmTasks` options interface:**

```ts
interface UseCrmTasksOptions {
  enabled?: boolean
  addressId?: string
  inquiryId?: string
  assigneeId?: string
  status?: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"
  type?: "TASK" | "MESSAGE"
  search?: string
  page?: number
  pageSize?: number
}
```

**`useMyTasks` options interface:**

```ts
interface UseMyTasksOptions {
  enabled?: boolean
  status?: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"
  type?: "TASK" | "MESSAGE"
  page?: number
  pageSize?: number
}
```

### 6b. Add exports to hooks barrel

**File:** `src/hooks/index.ts` (EDIT)

Add after the CRM Inquiries export block (after line 699):

```ts
// CRM Tasks
export {
  useCrmTasks,
  useMyTasks,
  useCrmTaskById,
  useCreateCrmTask,
  useUpdateCrmTask,
  useCompleteCrmTask,
  useCancelCrmTask,
  useReopenCrmTask,
  useMarkCrmTaskRead,
  useDeleteCrmTask,
} from './use-crm-tasks'
```

### Verification

```bash
pnpm typecheck
```

**Success criteria:** No new type errors. All hooks compile and are exported.

---

## Phase 7: Frontend — UI Components

### 7a. Task Status Badge

**File:** `src/components/crm/task-status-badge.tsx` (CREATE)

**Pattern:** Follow `inquiry-status-badge.tsx`.

```tsx
const STATUS_CONFIG = {
  OPEN: { icon: CircleDot, variant: 'default', label: 'Offen' },
  IN_PROGRESS: { icon: Loader, variant: 'secondary', label: 'In Bearbeitung' },
  COMPLETED: { icon: CheckCircle, variant: 'outline', label: 'Erledigt' },
  CANCELLED: { icon: XCircle, variant: 'destructive', label: 'Storniert' },
}
```

Also add a type icon mapping:
```tsx
const TYPE_CONFIG = {
  TASK: { icon: ClipboardCheck, label: 'Aufgabe' },
  MESSAGE: { icon: MessageSquare, label: 'Nachricht' },
}
```

### 7b. Task Assignee Select

**File:** `src/components/crm/task-assignee-select.tsx` (CREATE)

Multi-select component for choosing assignees:

- Fetch employees via `useEmployees()` hook (from existing hooks)
- Fetch teams via `useTeams()` hook (from existing hooks)
- Group options under "Mitarbeiter" and "Teams" headers
- Each selection produces `{ employeeId?: string, teamId?: string }`
- Display selected items as badges with remove buttons
- Use existing `Popover` + `Command` UI components (combobox pattern)

### 7c. Task Form Sheet

**File:** `src/components/crm/task-form-sheet.tsx` (CREATE)

**Pattern:** Follow `inquiry-form-sheet.tsx`.

**Props:**

```ts
interface TaskFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editItem?: CrmTask | null        // null = create mode
  addressId?: string               // pre-fill when opened from address detail
  inquiryId?: string               // pre-fill when opened from inquiry detail
}
```

**Form fields:**

| Field | Component | Required | Notes |
|-------|-----------|----------|-------|
| Type | Toggle (Aufgabe / Nachricht) | Yes, default TASK | |
| Subject | Input | Yes | |
| Description | Textarea | No | |
| Address | Select (CRM addresses) | No | Pre-filled if `addressId` prop. Use existing `useCrmAddresses` hook. |
| Contact | Select (contacts of selected address) | No | Only visible when address selected |
| Inquiry | Select (CRM inquiries) | No | Pre-filled if `inquiryId` prop. Filter by address if selected. |
| Assignees | TaskAssigneeSelect | Yes (at least 1) | Multi-select |
| Due Date | DatePicker | No | Hidden when type=MESSAGE |
| Due Time | Input (HH:mm) | No | Hidden when type=MESSAGE |
| Duration (min) | Input number | No | Hidden when type=MESSAGE |

**Sections in Sheet:**
1. Grunddaten (Type, Subject, Description)
2. Verknupfungen (Address, Contact, Inquiry)
3. Zuweisungen (Assignees)
4. Terminierung (Due Date, Due Time, Duration) — only for TASK type

**Mutations:**
- Create mode: `useCreateCrmTask()`
- Edit mode: `useUpdateCrmTask()`

### 7d. Task Detail Dialog

**File:** `src/components/crm/task-detail-dialog.tsx` (CREATE)

**Pattern:** Follow `inquiry-detail.tsx` patterns but as a Dialog (not a separate page, since tasks are simpler than inquiries).

**Content:**

- Header: Subject, Type badge, Status badge
- Cards:
  - Grunddaten: Subject, Description, Type, Created at, Created by
  - Verknupfungen: Address (link), Contact, Inquiry (link)
  - Terminierung: Due date/time, Duration (only for TASK type)
  - Zuweisungen: List of assignees with read status (green check if read, grey dash if unread)
- Action buttons in footer:
  - "Erledigen" — visible if status is OPEN or IN_PROGRESS
  - "Abbrechen" — visible if status is OPEN or IN_PROGRESS
  - "Wieder offnen" — visible if status is COMPLETED or CANCELLED
  - "Bearbeiten" — opens TaskFormSheet in edit mode (disabled if COMPLETED)
  - "Loschen" — with ConfirmDialog

### 7e. Task List

**File:** `src/components/crm/task-list.tsx` (CREATE)

**Pattern:** Follow `inquiry-list.tsx`.

**Props:**

```ts
interface TaskListProps {
  addressId?: string    // when rendered in address detail tab
  inquiryId?: string    // when rendered in inquiry detail tab
}
```

**Table columns:**

| Column | Description |
|--------|-------------|
| Type | Icon: ClipboardCheck for TASK, MessageSquare for MESSAGE |
| Betreff | Subject (bold) |
| Zugewiesen an | Comma-separated assignee names (employees + teams) |
| Fallig am | Due date formatted (only for TASK) |
| Status | TaskStatusBadge |
| Aktionen | Dropdown: Anzeigen, Bearbeiten, Erledigen, Loschen |

**Toolbar:**

- Search input (placeholder: "Aufgaben durchsuchen...")
- Status filter: Alle Status / Offen / In Bearbeitung / Erledigt / Storniert
- Type filter: Alle Typen / Aufgabe / Nachricht
- "Meine Aufgaben" toggle button — switches between `useCrmTasks` and `useMyTasks`
- "Neue Aufgabe" button (opens TaskFormSheet)

**Behavior:**

- Row click opens TaskDetailDialog
- Pagination with prev/next buttons
- When `addressId` or `inquiryId` prop is set:
  - Pass to query filter
  - Hide the "Meine Aufgaben" toggle
  - "Neue Aufgabe" pre-fills the addressId/inquiryId

### 7f. Page Route

**File:** `src/app/[locale]/(dashboard)/crm/tasks/page.tsx` (CREATE)

```tsx
'use client'
import { TaskList } from "@/components/crm/task-list"

export default function CrmTasksPage() {
  return (
    <div className="container mx-auto py-6">
      <TaskList />
    </div>
  )
}
```

### 7g. Navigation Entry

**File:** `src/components/layout/sidebar/sidebar-nav-config.ts` (EDIT)

Add after the `crmInquiries` item (after line 292, inside the CRM section items array):

```ts
{
  titleKey: 'crmTasks',
  href: '/crm/tasks',
  icon: ClipboardCheck,
  module: 'crm',
  permissions: ['crm_tasks.view'],
},
```

Ensure `ClipboardCheck` is imported from `lucide-react` at the top. Check if it's already imported — if not, add it.

### 7h. Translation keys

Add the following translation keys to the appropriate i18n namespace files (German):

**`nav` namespace:** `crmTasks: "Aufgaben"`

**`crmTasks` namespace** (new, create in both `de` and `en` translation files):

```json
{
  "title": "Aufgaben & Nachrichten",
  "newTask": "Neue Aufgabe",
  "newMessage": "Neue Nachricht",
  "editTask": "Aufgabe bearbeiten",
  "subject": "Betreff",
  "description": "Beschreibung",
  "type": "Typ",
  "typeTask": "Aufgabe",
  "typeMessage": "Nachricht",
  "status": "Status",
  "statusOpen": "Offen",
  "statusInProgress": "In Bearbeitung",
  "statusCompleted": "Erledigt",
  "statusCancelled": "Storniert",
  "assignees": "Zugewiesen an",
  "dueDate": "Fallig am",
  "dueTime": "Uhrzeit",
  "duration": "Dauer (Min.)",
  "address": "Adresse",
  "contact": "Kontakt",
  "inquiry": "Anfrage",
  "myTasks": "Meine Aufgaben",
  "allTasks": "Alle Aufgaben",
  "searchPlaceholder": "Aufgaben durchsuchen...",
  "complete": "Erledigen",
  "cancel": "Abbrechen",
  "reopen": "Wieder offnen",
  "delete": "Loschen",
  "edit": "Bearbeiten",
  "view": "Anzeigen",
  "confirmComplete": "Mochten Sie die Aufgabe als erledigt markieren?",
  "confirmCancel": "Mochten Sie die Aufgabe stornieren?",
  "confirmReopen": "Mochten Sie die Aufgabe wieder offnen?",
  "confirmDelete": "Mochten Sie die Aufgabe wirklich loschen? Diese Aktion kann nicht ruckgangig gemacht werden.",
  "createdAt": "Erstellt am",
  "completedAt": "Erledigt am",
  "readStatus": "Gelesen",
  "unread": "Ungelesen",
  "allStatus": "Alle Status",
  "allTypes": "Alle Typen",
  "tabTasks": "Aufgaben"
}
```

### Verification

```bash
pnpm typecheck && pnpm build
```

**Success criteria:** No type errors. Build succeeds. Page at `/crm/tasks` renders. Navigation item visible in CRM section.

---

## Phase 8: Integration Points

### 8a. Address Detail — Tasks Tab

**File:** `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx` (EDIT)

Add a new tab after the "Anfragen" tab:

1. Import `TaskList`:
   ```ts
   import { TaskList } from '@/components/crm/task-list'
   ```

2. Add TabsTrigger (after `tabInquiries`, before `tabDocuments`):
   ```tsx
   <TabsTrigger value="tasks">{t('tabTasks')}</TabsTrigger>
   ```

3. Add TabsContent (after the inquiries TabsContent, before documents TabsContent):
   ```tsx
   <TabsContent value="tasks" className="mt-6">
     <TaskList addressId={address.id} />
   </TabsContent>
   ```

4. Add translation key `tabTasks: "Aufgaben"` to the `crmAddresses` namespace.

### 8b. Inquiry Detail — Tasks Tab (if inquiry detail has tabs)

**File:** `src/app/[locale]/(dashboard)/crm/inquiries/[id]/page.tsx` (EDIT)

Check if the inquiry detail page has tabs. Based on research, it has 2 tabs: Overview and Correspondence.

Add a third tab "Aufgaben":

1. Import `TaskList`
2. Add `<TabsTrigger value="tasks">Aufgaben</TabsTrigger>` after the Correspondence tab
3. Add:
   ```tsx
   <TabsContent value="tasks" className="mt-6">
     <TaskList inquiryId={inquiry.id} />
   </TabsContent>
   ```

### Verification

```bash
pnpm build
```

**Success criteria:** Build passes. Address detail page shows "Aufgaben" tab. Inquiry detail page shows "Aufgaben" tab.

---

## Phase 9: Unit & Integration Tests

### 9a. Service Unit Tests

**File:** `src/lib/services/__tests__/crm-task-service.test.ts` (CREATE)

**Pattern:** Follow `crm-inquiry-service.test.ts` exactly.

**Constants:**

```ts
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const EMPLOYEE_ID = "e0000000-0000-4000-a000-000000000001"
const TEAM_ID = "f0000000-0000-4000-a000-000000000001"
const TASK_ID = "c6000000-0000-4000-a000-000000000001"
const ADDRESS_ID = "b0000000-0000-4000-b000-000000000001"
const INQUIRY_ID = "c5000000-0000-4000-a000-000000000099"
```

**Mock data:**

```ts
const mockTask = {
  id: TASK_ID,
  tenantId: TENANT_ID,
  type: "TASK" as const,
  subject: "Test Task",
  description: "Test description",
  addressId: ADDRESS_ID,
  contactId: null,
  inquiryId: null,
  status: "OPEN" as const,
  dueAt: new Date("2026-04-01"),
  dueTime: "14:00",
  durationMin: 60,
  attachments: null,
  completedAt: null,
  completedById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdById: USER_ID,
  assignees: [{ id: "a1", taskId: TASK_ID, employeeId: EMPLOYEE_ID, teamId: null, readAt: null, createdAt: new Date(), employee: { id: EMPLOYEE_ID, firstName: "Max", lastName: "Mustermann" }, team: null }],
  address: { id: ADDRESS_ID, company: "Test GmbH", number: "K-1" },
  contact: null,
  inquiry: null,
}
```

**`createMockPrisma` helper:**

```ts
function createMockPrisma(overrides = {}) {
  return {
    crmTask: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    crmTaskAssignee: { createMany: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    crmAddress: { findFirst: vi.fn() },
    crmContact: { findFirst: vi.fn() },
    crmInquiry: { findFirst: vi.fn() },
    employee: { findFirst: vi.fn() },
    teamMember: { findMany: vi.fn() },
    notification: { create: vi.fn() },
    $transaction: vi.fn().mockImplementation((fn) => fn({ /* tx mock */ })),
    ...overrides,
  } as unknown as PrismaClient
}
```

**Test cases (describe blocks):**

```
describe("crm-task-service")
  describe("create")
    it("creates task with assignees in transaction")
    it("sends notification to employee assignee")
    it("sends notifications to team members")
    it("validates addressId belongs to tenant")
    it("rejects if no assignees provided")
    it("creates MESSAGE type task without due date")

  describe("list")
    it("returns paginated list")
    it("filters by status")
    it("filters by addressId")
    it("searches by subject")

  describe("myTasks")
    it("returns tasks for direct employee assignment")
    it("includes tasks via team membership")
    it("rejects if employeeId is null")

  describe("getById")
    it("returns task with full relations")
    it("throws CrmTaskNotFoundError when not found")

  describe("update")
    it("updates task fields")
    it("rejects update when COMPLETED")
    it("rejects update when CANCELLED")
    it("auto-transitions from OPEN to IN_PROGRESS")

  describe("complete")
    it("sets status, completedAt, completedById")
    it("rejects if already completed")
    it("rejects if cancelled")

  describe("cancel")
    it("sets status to CANCELLED")
    it("rejects if already completed or cancelled")

  describe("reopen")
    it("sets status from COMPLETED to IN_PROGRESS")
    it("clears completedAt and completedById")
    it("rejects if not completed or cancelled")

  describe("markRead")
    it("updates readAt for the assignee")
    it("throws not found if task does not exist")

  describe("remove")
    it("deletes task")
    it("throws not found when task does not exist")
```

### 9b. Router Integration Tests

**File:** `src/trpc/routers/__tests__/crmTasks-router.test.ts` (CREATE)

**Pattern:** Follow `crmInquiries-router.test.ts` exactly.

**Setup:**

```ts
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { crmTasksRouter } from "../crm/tasks"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { createMockContext, createMockSession, createUserWithPermissions, createMockUserTenant } from "./helpers"

// Mock the db module for requireModule
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "crm" }),
    },
  },
}))

const TASK_VIEW = permissionIdByKey("crm_tasks.view")!
const TASK_CREATE = permissionIdByKey("crm_tasks.create")!
const TASK_EDIT = permissionIdByKey("crm_tasks.edit")!
const TASK_DELETE = permissionIdByKey("crm_tasks.delete")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const EMPLOYEE_ID = "e0000000-0000-4000-a000-000000000001"

const createCaller = createCallerFactory(crmTasksRouter)
```

**Test cases:**

```
describe("crm.tasks.list")
  it("returns paginated list")
  it("requires crm_tasks.view permission")

describe("crm.tasks.myTasks")
  it("accessible to any authenticated user without special permission")
  it("delegates to myTasks service with employeeId")

describe("crm.tasks.getById")
  it("returns single task with relations")
  it("throws NOT_FOUND for missing task")

describe("crm.tasks.create")
  it("creates task with multiple assignees")
  it("requires crm_tasks.create permission")

describe("crm.tasks.update")
  it("updates existing task")
  it("requires crm_tasks.edit permission")

describe("crm.tasks.complete")
  it("sets completedAt and status")

describe("crm.tasks.cancel")
  it("sets status to CANCELLED")

describe("crm.tasks.reopen")
  it("reopens completed task")

describe("crm.tasks.markRead")
  it("accessible to any authenticated user")
  it("marks task as read for current user")

describe("crm.tasks.delete")
  it("deletes task and returns success")
  it("requires crm_tasks.delete permission")
```

### Verification

```bash
pnpm vitest run src/lib/services/__tests__/crm-task-service.test.ts
pnpm vitest run src/trpc/routers/__tests__/crmTasks-router.test.ts
```

**Success criteria:** All tests pass.

---

## Phase 10: Browser E2E Tests

### 10a. Create Playwright spec

**File:** `src/e2e-browser/23-crm-tasks.spec.ts` (CREATE)

**Pattern:** Follow `22-crm-inquiries.spec.ts` exactly.

**Constants:**

```ts
const COMPANY = "E2E Aufgaben GmbH";
const TASK_SUBJECT = "E2E Testaufgabe Montage";
const TASK_SUBJECT_2 = "E2E Aufgabe Dokumentation";
const MESSAGE_SUBJECT = "E2E Nachricht an Team";
```

**Test suite: `test.describe.serial("UC-CRM-04: Tasks & Messages")`**

| # | Test | Steps |
|---|------|-------|
| 1 | Create address for task tests | Navigate to /crm/addresses, create "E2E Aufgaben GmbH", verify in table |
| 2 | Create a task from global page | Navigate to /crm/tasks, click "Neue Aufgabe", fill subject, select address, select employee assignee, set due date. Submit. Verify in table with OPEN status badge. |
| 3 | Create a second task | Navigate to /crm/tasks, create second task "E2E Aufgabe Dokumentation". Verify in table. |
| 4 | Search tasks by subject | Navigate to /crm/tasks, search "Montage", verify only first task shown. Clear search. |
| 5 | Filter tasks by status | Filter to "Offen" — both visible. Filter to "Erledigt" — none visible. Reset. |
| 6 | Open task detail | Click task row, verify detail dialog opens with subject, status badge, assignee list. |
| 7 | Complete a task | Open first task detail, click "Erledigen", confirm dialog. Verify status changes to "Erledigt". |
| 8 | Reopen completed task | Open task detail, click "Wieder offnen", confirm. Verify status changes to "In Bearbeitung". |
| 9 | Cancel second task | Open second task, click "Abbrechen", confirm. Verify "Storniert" status. |
| 10 | Delete cancelled task | Open second task, click "Loschen", confirm. Verify task removed from list. |
| 11 | Create a message | Click "Neue Aufgabe", toggle type to "Nachricht", fill subject "E2E Nachricht an Team", select team assignee. Submit. Verify MESSAGE type icon in table. |
| 12 | View tasks in address detail tab | Navigate to address detail for "E2E Aufgaben GmbH", click "Aufgaben" tab, verify tasks linked to this address are shown. |

**Key patterns from existing E2E tests to follow:**

- Use `navigateTo(page, path)` for navigation
- Use `waitForSheet(page)` after clicking create button
- Use `fillInput(page, id, value)` for text inputs
- Use `selectOption(page, label, option)` for dropdowns
- Use `submitAndWaitForClose(page)` for form submission
- Use `expectTableContains(page, text)` for verification
- Use `page.waitForTimeout(500)` after filter changes
- For dialog confirmations: locate `[role="dialog"]` or `[role="alertdialog"]`, wait for visible, click confirm button

### Verification

Describe test scenarios — running requires the full dev environment:

```bash
pnpm playwright test src/e2e-browser/23-crm-tasks.spec.ts
```

**Success criteria:** All 12 tests pass in the E2E environment. Tests are idempotent (global-setup.ts cleans E2E data).

---

## Phase 11: Handbook Documentation

### 11a. Read existing handbook structure

The handbook at `docs/TERP_HANDBUCH.md` has the CRM section as `## 12. CRM`. The last CRM subsection is `### 12.9 Praxisbeispiel`. The next section is `## 13. Glossar` (line 4753).

### 11b. Add section 12.10

**File:** `docs/TERP_HANDBUCH.md` (EDIT)

Insert **before** `## 13. Glossar` (before line 4753), after the `---` separator following section 12.9.

**Section content following the exact handbook style:**

```markdown
### 12.10 Aufgaben & Nachrichten

**Was ist es?** Aufgaben und Nachrichten sind das interne Kommunikations- und Aufgabensystem im CRM-Modul. Eine Aufgabe hat einen Betreff, eine optionale Beschreibung, ein Falligkeitsdatum und einen Status-Workflow (Offen -> In Bearbeitung -> Erledigt / Storniert). Eine Nachricht ist eine vereinfachte Aufgabe ohne Terminierung — sie dient als interne Mitteilung. Beide konnen einer oder mehreren Personen (Mitarbeitern oder ganzen Teams) zugewiesen werden.

**Wozu dient es?** Aufgaben und Nachrichten ermoglichen die interne Koordination im CRM: Wer muss was bis wann erledigen? Wer wurde uber etwas informiert? Durch die Verknupfung mit Adressen und Anfragen ist der Kontext immer klar. Zugewiesene Mitarbeiter erhalten automatisch eine Terp-Benachrichtigung und konnen ihre Aufgaben uber "Meine Aufgaben" einsehen.

:warning: Modul: Das CRM-Modul muss fur den Mandanten aktiviert sein (:point_right: Administration -> Einstellungen -> Module -> **CRM**)

:warning: Berechtigung: "CRM-Aufgaben anzeigen" (Lesen), "CRM-Aufgaben erstellen/bearbeiten/loschen" (Schreiben). "Meine Aufgaben" ist fur jeden angemeldeten Benutzer ohne spezielle Berechtigung sichtbar.

:point_right: Seitenleiste -> **CRM** -> **Aufgaben**

:white_check_mark: Seite mit Titel "Aufgaben & Nachrichten", Tabelle aller Aufgaben, Suchfeld, Status- und Typfilter, Umschalter "Meine Aufgaben".

#### Aufgabenliste

Tabelle mit Spalten:

| Spalte | Beschreibung |
|--------|-------------|
| **Typ** | Icon: Aufgabe (Hakchen) oder Nachricht (Sprechblase) |
| **Betreff** | Bezeichnung der Aufgabe (fett) |
| **Zugewiesen an** | Kommagetrennte Liste der Mitarbeiter und Teams |
| **Fallig am** | Falligkeitsdatum (nur bei Aufgaben, nicht bei Nachrichten) |
| **Status** | Badge: Offen (blau), In Bearbeitung (grau), Erledigt (Outline), Storniert (rot) |
| **Aktionen** | ...-Menu: Anzeigen, Bearbeiten, Erledigen, Loschen |

**Filter:**
- **Suchfeld**: Durchsucht den Betreff
- **Status-Filter**: Alle Status / Offen / In Bearbeitung / Erledigt / Storniert
- **Typ-Filter**: Alle Typen / Aufgabe / Nachricht
- **"Meine Aufgaben"**: Umschalter — zeigt nur Aufgaben, die dem angemeldeten Benutzer (oder seinem Team) zugewiesen sind

##### Neue Aufgabe anlegen

1. :point_right: **"Neue Aufgabe"** (oben rechts)
2. :white_check_mark: Seitliches Formular (Sheet) offnet sich: "Neue Aufgabe anlegen"
3. Abschnitt **Grunddaten** ausfullen:
   - **Typ** (Umschalter: Aufgabe / Nachricht) — Standard: Aufgabe
   - **Betreff** (Pflicht)
   - **Beschreibung** (optional)
4. Abschnitt **Verknupfungen** ausfullen:
   - **Adresse** (Dropdown: alle aktiven CRM-Adressen, optional)
   - **Kontakt** (Dropdown: Kontaktpersonen der gewahlten Adresse, nur sichtbar wenn Adresse gewahlt)
   - **Anfrage** (Dropdown: Anfragen der gewahlten Adresse, optional)
5. Abschnitt **Zuweisungen** ausfullen:
   - **Zugewiesen an** (Pflicht, Mehrfachauswahl: Mitarbeiter und/oder Teams)
6. Abschnitt **Terminierung** ausfullen (nur bei Typ "Aufgabe"):
   - **Fallig am** (Datumsauswahl, optional)
   - **Uhrzeit** (HH:MM, optional)
   - **Dauer (Min.)** (Zahl, optional)
7. :point_right: "Anlegen"
8. :white_check_mark: Aufgabe erscheint in der Tabelle. Zugewiesene Mitarbeiter erhalten eine Benachrichtigung.

:bulb: **Hinweis:** Bei Typ "Nachricht" sind die Terminierungsfelder (Fallig am, Uhrzeit, Dauer) ausgeblendet — Nachrichten haben keinen Termin. Wird die Aufgabe aus dem Tab "Aufgaben" einer Adresse oder Anfrage heraus angelegt, ist die Verknupfung bereits vorbelegt.

##### Aufgabe bearbeiten

1. :point_right: ...-Menu der Aufgabe -> **"Bearbeiten"**
2. :white_check_mark: Formular offnet sich mit den aktuellen Werten vorausgeflullt
3. Gewunschte Felder andern
4. :point_right: "Speichern"

:warning: **Erledigte und stornierte Aufgaben konnen nicht bearbeitet werden.**

##### Aufgabe loschen

1. :point_right: ...-Menu der Aufgabe -> **"Loschen"**
2. :white_check_mark: Bestatigungsdialog: "Mochten Sie die Aufgabe '{Betreff}' wirklich loschen?"
3. :point_right: "Bestatigen"

#### Aufgabendetails

:point_right: Zeile in der Tabelle anklicken -> Detaildialog

:white_check_mark: Dialog zeigt: Betreff (gross), Typ-Badge, Status-Badge, Aktionsbuttons (Erledigen, Abbrechen, Wieder offnen, Bearbeiten, Loschen)

Der Dialog hat folgende Bereiche:

| Bereich | Felder |
|---------|--------|
| **Grunddaten** | Betreff, Beschreibung, Typ, Erstellt am |
| **Verknupfungen** | Adresse (Link), Kontakt, Anfrage (Link) |
| **Terminierung** | Fallig am, Uhrzeit, Dauer (nur bei Aufgaben) |
| **Zuweisungen** | Liste der Zugewiesenen mit Lesestatus (gruner Haken = gelesen, grauer Strich = ungelesen) |

#### Status-Workflow

Aufgaben durchlaufen einen definierten Status-Workflow:

| Status | Badge | Bedeutung |
|--------|-------|-----------|
| **Offen** | Blau (ausgeflullt) | Aufgabe neu angelegt, noch nicht bearbeitet |
| **In Bearbeitung** | Grau | Aufgabe wird aktiv bearbeitet (automatischer Ubergang bei erster Bearbeitung) |
| **Erledigt** | Outline | Aufgabe abgeschlossen |
| **Storniert** | Rot | Aufgabe abgebrochen |

**Aktionen im Detaildialog:**

| Aktion | Button | Bedingung |
|--------|--------|-----------|
| **Erledigen** | "Erledigen" | Nur wenn Status = Offen oder In Bearbeitung |
| **Stornieren** | "Abbrechen" | Nur wenn Status = Offen oder In Bearbeitung |
| **Wieder offnen** | "Wieder offnen" | Nur wenn Status = Erledigt oder Storniert |

##### Aufgabe erledigen

1. :point_right: Detaildialog -> **"Erledigen"**
2. :white_check_mark: Bestatigungsdialog: "Mochten Sie die Aufgabe als erledigt markieren?"
3. :point_right: "Bestatigen"
4. :white_check_mark: Status wechselt auf "Erledigt", Datum und Bearbeiter werden gespeichert

##### Aufgabe stornieren

1. :point_right: Detaildialog -> **"Abbrechen"**
2. :white_check_mark: Bestatigungsdialog: "Mochten Sie die Aufgabe stornieren?"
3. :point_right: "Bestatigen"
4. :white_check_mark: Status wechselt auf "Storniert"

##### Aufgabe wieder offnen

1. :point_right: Detaildialog -> **"Wieder offnen"**
2. :white_check_mark: Bestatigungsdialog: "Mochten Sie die Aufgabe wieder offnen?"
3. :point_right: "Bestatigen"
4. :white_check_mark: Status wechselt auf "In Bearbeitung"

#### Meine Aufgaben

Jeder angemeldete Benutzer kann seine eigenen Aufgaben einsehen — ohne spezielle Berechtigung.

:point_right: **"Meine Aufgaben"** (Umschalter in der Aufgabenliste)

:white_check_mark: Die Tabelle zeigt nur Aufgaben, die dem Benutzer direkt oder uber ein Team zugewiesen sind. Ungelesene Aufgaben werden hervorgehoben.

#### Aufgaben in Adress- und Anfragedetails

Aufgaben einer bestimmten Adresse oder Anfrage sind auch direkt uber die jeweilige Detailseite erreichbar:

:point_right: CRM -> Adressen -> Adresse anklicken -> Tab **"Aufgaben"**
:point_right: CRM -> Anfragen -> Anfrage anklicken -> Tab **"Aufgaben"**

:white_check_mark: Dieselbe Aufgabenliste, gefiltert auf die aktuelle Adresse bzw. Anfrage. Beim Anlegen einer neuen Aufgabe ist die Verknupfung vorbelegt.

#### Benachrichtigungen

Beim Anlegen einer Aufgabe oder Nachricht erhalten alle zugewiesenen Mitarbeiter automatisch eine Terp-Benachrichtigung (Typ "Erinnerung"). Die Benachrichtigung erscheint in der Benachrichtigungsglocke und enthalt einen Link zur Aufgabenliste.

:point_right: :bell: Benachrichtigungsglocke -> Benachrichtigung anklicken -> Aufgabenliste
```

### 11c. Add glossary entries

Add to the glossary table in section 13:

```markdown
| **Aufgabe (CRM)** | Interne Arbeitsaufgabe im CRM mit Betreff, Beschreibung, Falligkeitsdatum und Status-Workflow | :point_right: CRM -> Aufgaben |
| **Nachricht (CRM)** | Vereinfachte CRM-Aufgabe ohne Terminierung — dient als interne Mitteilung | :point_right: CRM -> Aufgaben |
```

### 11d. Update address detail tabs documentation

In section 12.1 "Adressdetails" (around line 4193), update the tab count from "6 Tabs" to "7 Tabs" and add:

```markdown
**Tab "Aufgaben":** Aufgaben und Nachrichten dieser Adresse — siehe Abschnitt 12.10
```

### Verification

Visual review of the handbook section for:
- Consistent formatting with existing sections (12.1-12.9)
- All emoji markers used correctly (warning, point_right, white_check_mark, bulb)
- All features documented (create, edit, delete, complete, cancel, reopen, myTasks, detail, tabs, notifications)
- Glossary entries added

**Success criteria:** Documentation is complete, consistent with existing sections, and covers all features.

---

## Summary: Complete File List

| # | File | Action | Phase |
|---|------|--------|-------|
| 1 | `prisma/schema.prisma` | Edit (add enums, models, relations) | 1 |
| 2 | `supabase/migrations/20260101000098_create_crm_tasks.sql` | Create | 1 |
| 3 | `src/lib/auth/permission-catalog.ts` | Edit (add 4 permissions) | 2 |
| 4 | `src/lib/services/crm-task-repository.ts` | Create | 3 |
| 5 | `src/lib/services/crm-task-service.ts` | Create | 4 |
| 6 | `src/trpc/routers/crm/tasks.ts` | Create | 5 |
| 7 | `src/trpc/routers/crm/index.ts` | Edit (add tasks router) | 5 |
| 8 | `src/hooks/use-crm-tasks.ts` | Create | 6 |
| 9 | `src/hooks/index.ts` | Edit (add exports) | 6 |
| 10 | `src/components/crm/task-status-badge.tsx` | Create | 7 |
| 11 | `src/components/crm/task-assignee-select.tsx` | Create | 7 |
| 12 | `src/components/crm/task-form-sheet.tsx` | Create | 7 |
| 13 | `src/components/crm/task-detail-dialog.tsx` | Create | 7 |
| 14 | `src/components/crm/task-list.tsx` | Create | 7 |
| 15 | `src/app/[locale]/(dashboard)/crm/tasks/page.tsx` | Create | 7 |
| 16 | `src/components/layout/sidebar/sidebar-nav-config.ts` | Edit (add nav item) | 7 |
| 17 | Translation files (de/en) | Edit (add crmTasks namespace + nav key) | 7 |
| 18 | `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx` | Edit (add Tasks tab) | 8 |
| 19 | `src/app/[locale]/(dashboard)/crm/inquiries/[id]/page.tsx` | Edit (add Tasks tab) | 8 |
| 20 | `src/lib/services/__tests__/crm-task-service.test.ts` | Create | 9 |
| 21 | `src/trpc/routers/__tests__/crmTasks-router.test.ts` | Create | 9 |
| 22 | `src/e2e-browser/23-crm-tasks.spec.ts` | Create | 10 |
| 23 | `docs/TERP_HANDBUCH.md` | Edit (add section 12.10 + glossary) | 11 |

---

## Verification Checkpoints

| Phase | Command | Success Criteria |
|-------|---------|-----------------|
| 1 | `pnpm db:generate` | Exits 0, Prisma client exports new types |
| 2 | `pnpm typecheck` | No new type errors |
| 3 | `pnpm typecheck` | No new type errors |
| 4 | `pnpm typecheck` | No new type errors |
| 5 | `pnpm typecheck` | No new type errors |
| 6 | `pnpm typecheck` | No new type errors |
| 7 | `pnpm typecheck && pnpm build` | Build succeeds, page renders |
| 8 | `pnpm build` | Build succeeds |
| 9 | `pnpm vitest run src/lib/services/__tests__/crm-task-service.test.ts && pnpm vitest run src/trpc/routers/__tests__/crmTasks-router.test.ts` | All tests pass |
| 10 | `pnpm playwright test src/e2e-browser/23-crm-tasks.spec.ts` | All 12 tests pass (requires full env) |
| 11 | Visual review | Handbook section complete and consistent |
