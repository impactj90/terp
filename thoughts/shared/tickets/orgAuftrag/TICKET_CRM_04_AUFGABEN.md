# CRM_04 — Aufgaben & Nachrichten

| Field | Value |
|-------|-------|
| **Module** | CRM |
| **Dependencies** | CRM_01 (Addresses), CRM_03 (Inquiries) |
| **Complexity** | M |
| **New Models** | `CrmTask`, `CrmTaskAssignee` |

---

## Goal

Implement the internal task and message system for CRM. Tasks and messages can be created from addresses, inquiries, or documents and assigned to one or more employees or entire teams. Tasks have due dates and status tracking; messages are simplified notifications. Integrates with the existing Terp notification system for delivery. Replaces ZMI orgAuftrag section 6.

---

## Prisma Models

### CrmTask

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

model CrmTask {
  id            String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String        @map("tenant_id") @db.Uuid
  type          CrmTaskType   @default(TASK)
  subject       String
  description   String?
  addressId     String?       @map("address_id") @db.Uuid
  contactId     String?       @map("contact_id") @db.Uuid
  inquiryId     String?       @map("inquiry_id") @db.Uuid
  documentId    String?       @map("document_id") @db.Uuid // Link to BillingDocument (ORD_01)
  status        CrmTaskStatus @default(OPEN)
  dueAt         DateTime?     @map("due_at") @db.Timestamptz(6)
  dueTime       String?       @map("due_time") // HH:mm format
  durationMin   Int?          @map("duration_min") // Duration in minutes
  attachments   Json?         @db.JsonB // Array of { name, url, size, mimeType }
  completedAt   DateTime?     @map("completed_at") @db.Timestamptz(6)
  completedById String?       @map("completed_by_id") @db.Uuid
  createdAt     DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime      @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById   String?       @map("created_by_id") @db.Uuid

  tenant    Tenant             @relation(fields: [tenantId], references: [id])
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
```

### CrmTaskAssignee

```prisma
model CrmTaskAssignee {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  taskId     String   @map("task_id") @db.Uuid
  employeeId String?  @map("employee_id") @db.Uuid  // Individual employee
  teamId     String?  @map("team_id") @db.Uuid       // Entire team
  readAt     DateTime? @map("read_at") @db.Timestamptz(6) // When assignee read the task
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

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

---

## Permissions

Add to `permission-catalog.ts`:

```ts
p("crm_tasks.view", "crm_tasks", "view", "View CRM tasks and messages"),
p("crm_tasks.create", "crm_tasks", "create", "Create CRM tasks and messages"),
p("crm_tasks.edit", "crm_tasks", "edit", "Edit CRM tasks and messages"),
p("crm_tasks.delete", "crm_tasks", "delete", "Delete CRM tasks and messages"),
```

---

## tRPC Router

**File:** `src/trpc/routers/crm/tasks.ts`

All procedures use `tenantProcedure.use(requireModule("crm"))`.

### Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `list` | query | `crm_tasks.view` | `{ addressId?, inquiryId?, assigneeId?, status?, type?, search?, page, pageSize }` | Paginated list. If `assigneeId` matches current user, shows "my tasks". |
| `myTasks` | query | (any authenticated) | `{ status?, type?, page, pageSize }` | Tasks assigned to current user's employee record |
| `getById` | query | `crm_tasks.view` | `{ id }` | Single task with assignees, address, inquiry details |
| `create` | mutation | `crm_tasks.create` | Full task fields + assignee list | Creates task, sends notifications to assignees |
| `update` | mutation | `crm_tasks.edit` | `{ id, ...fields }` | Partial update |
| `complete` | mutation | `crm_tasks.edit` | `{ id }` | Sets status=COMPLETED, completedAt, completedById |
| `cancel` | mutation | `crm_tasks.edit` | `{ id }` | Sets status=CANCELLED |
| `reopen` | mutation | `crm_tasks.edit` | `{ id }` | Reopens completed/cancelled task |
| `markRead` | mutation | (any authenticated) | `{ id }` | Marks the task as read for the current user |
| `delete` | mutation | `crm_tasks.delete` | `{ id }` | Hard delete |

### Input Schemas

```ts
const createInput = z.object({
  type: z.enum(["TASK", "MESSAGE"]).default("TASK"),
  subject: z.string().min(1),
  description: z.string().optional(),
  addressId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  inquiryId: z.string().uuid().optional(),
  documentId: z.string().uuid().optional(),
  dueAt: z.date().optional(),
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
```

---

## Service Layer

**Files:**
- `src/lib/services/crm-task-service.ts`
- `src/lib/services/crm-task-repository.ts`

### Key Logic

- `create` — Creates task + assignees in a transaction. For each assignee, creates a Terp notification (via existing `notificationService`) so the user sees it in their notification center.
- `create` with `type=MESSAGE` — Simplified: no due date, no status tracking (auto-set to COMPLETED when all assignees have read it).
- `myTasks` — Queries tasks where current user's employeeId is in CrmTaskAssignee. Returns with `isRead` flag.
- `complete` — Sets `status=COMPLETED`, `completedAt=now()`, `completedById=currentUser`.
- Team expansion — When a team is assigned, the team members at creation time are not expanded into individual assignees. The team assignment stays as-is. The `myTasks` query checks both direct employee assignment and team membership.

---

## UI Components

### Page Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/crm/tasks` | `CrmTasksPage` | Global task list (all tasks for tenant) |

### Component Files

All in `src/components/crm/`:

| Component | Description |
|-----------|-------------|
| `task-list.tsx` | Data table. Columns: Type (icon), Subject, Assignees, Due Date, Status. Toolbar: search, status filter, type filter, "My Tasks" toggle. |
| `task-form-sheet.tsx` | Sheet form for create/edit. Type toggle (Task/Message), subject, description, address autocomplete, inquiry autocomplete, assignee multi-select (employees + teams), due date/time, duration. |
| `task-detail-dialog.tsx` | Dialog showing full task details, assignees with read status, action buttons (Complete, Cancel, Reopen). |
| `task-assignee-select.tsx` | Multi-select component combining employees and teams with group headers. |
| `task-status-badge.tsx` | Status badge with color coding |

### Integration Points

- Address detail page → "Tasks" tab
- Inquiry detail page → "Tasks" tab
- Document detail page → "Tasks" tab (ORD_01)
- After printing a document (ORD_01) → prompt to create tasks for responsible employees

---

## Hooks

**File:** `src/hooks/use-crm-tasks.ts`

```ts
export function useCrmTasks(filters) {
  return useQuery(trpc.crm.tasks.list.queryOptions(filters))
}

export function useMyTasks(filters) {
  return useQuery(trpc.crm.tasks.myTasks.queryOptions(filters))
}

export function useCreateCrmTask() { /* ... */ }
export function useCompleteCrmTask() { /* ... */ }
```

---

## Tests

### Unit Tests (Service)

**File:** `src/lib/services/__tests__/crm-task-service.test.ts`

- `create` — creates task with assignees in transaction
- `create` — sends notification to each assignee
- `create` MESSAGE type — auto-complete when all read
- `myTasks` — returns tasks for current employee
- `myTasks` — includes tasks via team membership
- `complete` — sets status, completedAt
- `markRead` — updates readAt for current assignee
- `delete` — cascades to assignees

### Router Tests

**File:** `src/trpc/routers/__tests__/crmTasks-router.test.ts`

```ts
describe("crm.tasks", () => {
  it("list — requires crm_tasks.view permission", async () => { })
  it("list — requires CRM module enabled", async () => { })
  it("myTasks — accessible to any authenticated user", async () => { })
  it("create — creates task with multiple assignees", async () => { })
  it("complete — sets completedAt", async () => { })
  it("markRead — only affects current user's assignment", async () => { })
})
```

### E2E Tests

**File:** `src/e2e-browser/23-crm-tasks.spec.ts`

```ts
test.describe("UC-CRM-04: Tasks & Messages", () => {
  test("create a task assigned to an employee", async ({ page }) => {
    // Navigate to /crm/tasks
    // Click "New Task"
    // Fill subject, select address, select employee
    // Set due date
    // Submit → verify in list
  })

  test("complete a task", async ({ page }) => {
    // Open task → click "Complete"
    // Verify status badge changes
  })

  test("send a message to a team", async ({ page }) => {
    // Click "New Message"
    // Select team as assignee, fill subject + description
    // Submit → verify in list with MESSAGE type
  })

  test("filter my tasks", async ({ page }) => {
    // Toggle "My Tasks" → verify only own tasks shown
  })
})
```

---

## Acceptance Criteria

- [x] `CrmTask` and `CrmTaskAssignee` models created with migration
- [x] Tasks and messages (two types) supported
- [x] Assignees can be individual employees or teams
- [x] Notifications sent to assignees on task creation (via existing notification system)
- [x] "My Tasks" query works for current user (direct + team assignments)
- [x] Task status workflow: OPEN → IN_PROGRESS → COMPLETED / CANCELLED
- [x] Mark as read tracking per assignee
- [x] Tasks visible on address, inquiry, and document detail tabs
- [x] Global task list at `/crm/tasks` with search and filters
- [ ] Attachment upload supported (deferred — requires file upload infrastructure from ORD_01)
- [x] All procedures gated by `requireModule("crm")` and `crm_tasks.*` permissions
- [x] `myTasks` accessible to any authenticated tenant user (no special permission needed)
- [x] Cross-tenant isolation verified
