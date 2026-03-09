# Research: ZMI-TICKET-250 — Order Bookings + Correction Router

## 1. Go Source Files — Business Logic Being Ported

### 1.1 Order Booking Service (`apps/api/internal/service/order_booking.go` — 209 lines)

**Errors:**
- `ErrOrderBookingNotFound` — "order booking not found"
- `ErrOrderBookingOrderRequired` — "order ID is required"
- `ErrOrderBookingEmployeeRequired` — "employee ID is required"
- `ErrOrderBookingDateRequired` — "booking date is required"
- `ErrOrderBookingTimeRequired` — "time in minutes is required and must be positive"

**Repository interface:**
```go
type orderBookingRepository interface {
    Create(ctx, ob) error
    GetByID(ctx, id) (*OrderBooking, error)
    Update(ctx, ob) error
    Delete(ctx, id) error
    List(ctx, tenantID, opts) ([]OrderBooking, error)
    DeleteByEmployeeAndDate(ctx, employeeID, date, source) error
}
```

**CreateOrderBookingInput:**
- TenantID, EmployeeID, OrderID (required UUIDs)
- ActivityID (*uuid — optional)
- BookingDate (string, parsed with `parseDate`)
- TimeMinutes (int, must be > 0)
- Description (string, trimmed)
- Source (string, defaults to "manual")
- CreatedBy (*uuid)

**Create logic:**
1. Validate OrderID != Nil, EmployeeID != Nil, BookingDate != "", TimeMinutes > 0
2. Parse date string
3. Default source to "manual" if empty
4. Create model, sets CreatedBy and UpdatedBy to input.CreatedBy
5. After create, re-fetches by ID (for preloads)

**UpdateOrderBookingInput:**
- OrderID, ActivityID (*uuid, optional)
- BookingDate (*string, optional)
- TimeMinutes (*int, optional, must be > 0 if provided)
- Description (*string, optional)
- UpdatedBy (*uuid)

**Update logic:**
1. Get existing by ID (returns not found if missing)
2. Apply only non-nil fields; validate TimeMinutes > 0
3. Description trimmed
4. Save, then re-fetch by ID

**Delete logic:** Get by ID first (for not-found check), then delete.

**List logic:** Delegates to repo with filters: EmployeeID, OrderID, DateFrom, DateTo.

**Special methods (internal use, not exposed via API):**
- `CreateAutoBooking` — creates source="auto" booking (used by daily calc for `target_with_order`)
- `DeleteAutoBookingsByDate` — deletes all auto bookings for employee+date

### 1.2 Order Booking Handler (`apps/api/internal/handler/order_booking.go` — 219 lines)

**Endpoints:**
- `List` — GET /order-bookings — query params: employee_id, order_id, date_from, date_to (YYYY-MM-DD format)
- `Get` — GET /order-bookings/{id}
- `Create` — POST /order-bookings — uses `models.CreateOrderBookingRequest` (generated)
- `Update` — PATCH /order-bookings/{id} — uses `models.UpdateOrderBookingRequest` (generated)
- `Delete` — DELETE /order-bookings/{id} — returns 204

**Notable behaviors:**
- List returns all matching bookings (no pagination)
- Create returns 201 on success
- Update checks for zero-value UUIDs ("00000000-...") to distinguish "not set" from "set to nil"
- Error mapping: service errors → specific HTTP status codes

### 1.3 Order Booking Repository (`apps/api/internal/repository/order_booking.go` — 115 lines)

**Key details:**
- Create uses `Select(...)` to only insert specific columns
- GetByID preloads: Employee, Order, Activity
- List preloads: Employee, Order, Activity
- List ordering: `booking_date DESC, created_at DESC`
- Delete returns `ErrOrderBookingNotFound` if RowsAffected == 0
- `DeleteByEmployeeAndDate` — deletes by employee_id + date + source

### 1.4 Correction Service (`apps/api/internal/service/correction.go` — 197 lines)

**Errors:**
- `ErrCorrectionNotFound` — "correction not found"
- `ErrCorrectionNotPending` — "correction is not in pending status"
- `ErrCorrectionIsApproved` — "cannot delete approved corrections"

**Repository interface:**
```go
type correctionRepo interface {
    List(ctx, filter) ([]Correction, error)
    GetByID(ctx, id) (*Correction, error)
    Create(ctx, c) error
    Update(ctx, c) error
    Delete(ctx, id) error
}
```

**CreateCorrectionInput:**
- TenantID, EmployeeID (required UUIDs)
- CorrectionDate (time.Time)
- CorrectionType (string)
- AccountID (*uuid, optional)
- ValueMinutes (int)
- Reason (string)
- CreatedBy (*uuid)

**Create logic:**
1. Build Correction model with status = "pending"
2. Create via repo
3. Return created model (no re-fetch)

**UpdateCorrectionInput:**
- ValueMinutes (*int, optional)
- Reason (*string, optional)

**Update logic:**
1. Get by ID
2. Check status == "pending" — reject if not
3. Apply non-nil fields
4. Save

**Delete logic:**
1. Get by ID
2. If status == "approved" → return `ErrCorrectionIsApproved`
3. Delete

**Approve logic:**
1. Get by ID
2. Check status == "pending"
3. Set status = "approved", ApprovedBy = approvedBy, ApprovedAt = now
4. Save

**Reject logic:**
1. Get by ID
2. Check status == "pending"
3. Set status = "rejected", ApprovedBy = rejectedBy, ApprovedAt = now
4. Save

### 1.5 Correction Handler (`apps/api/internal/handler/correction.go` — 338 lines)

**Endpoints:**
- `List` — GET /corrections — filters: employee_id, from, to, correction_type, status
- `Get` — GET /corrections/{id}
- `Create` — POST /corrections — uses `models.CreateCorrectionRequest` (generated)
- `Update` — PATCH /corrections/{id} — inline struct for request body
- `Delete` — DELETE /corrections/{id} — returns 204, 403 if approved
- `Approve` — POST /corrections/{id}/approve — requires auth user context
- `Reject` — POST /corrections/{id}/reject — requires auth user context

**Response mapping (`correctionToResponse`):**
- Maps internal Correction model to `models.Correction` (generated)
- Handles nullable fields: AccountID, ApprovedBy, ApprovedAt, CreatedBy
- Returns List wrapped in `models.CorrectionList{Data: []*models.Correction}`

**Error handling:**
- Approve/Reject: checks user auth context, maps service errors to HTTP status
- Delete: returns 403 for approved corrections (not 400)

### 1.6 Correction Repository (`apps/api/internal/repository/correction.go` — 100 lines)

**CorrectionFilter:**
- TenantID (required)
- EmployeeID, From, To, CorrectionType, Status (all optional)

**Key details:**
- List ordering: `correction_date DESC, created_at DESC`
- No preloads on GetByID or List
- Delete returns `ErrCorrectionNotFound` if RowsAffected == 0

### 1.7 Go Route Registration

**Order Bookings (`apps/api/internal/handler/routes.go:1119-1139`):**
- List/Get: `order_bookings.view` permission
- Create/Update/Delete: `order_bookings.manage` permission

**Corrections (`apps/api/internal/handler/routes.go:1595-1618`):**
- All endpoints: `corrections.manage` permission

---

## 2. Prisma Schema

### 2.1 OrderBooking (`schema.prisma:3185-3214`)

```prisma
model OrderBooking {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  employeeId  String   @map("employee_id") @db.Uuid
  orderId     String   @map("order_id") @db.Uuid
  activityId  String?  @map("activity_id") @db.Uuid
  bookingDate DateTime @map("booking_date") @db.Date
  timeMinutes Int      @map("time_minutes") @db.Integer
  description String?  @db.Text
  source      String   @default("manual") @db.VarChar(20)
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdBy   String?  @map("created_by") @db.Uuid
  updatedBy   String?  @map("updated_by") @db.Uuid

  tenant   Tenant    @relation(...)
  employee Employee  @relation(...)
  order    Order     @relation(...)
  activity Activity? @relation(...)

  @@index([tenantId])
  @@index([employeeId])
  @@index([orderId])
  @@index([activityId])
  @@index([employeeId, bookingDate])
  @@index([orderId, bookingDate])
  @@map("order_bookings")
}
```

**Notes:**
- `description` is nullable in Prisma (was non-nullable in Go model but `omitempty` in JSON)
- `source` has DB-level CHECK constraint: `IN ('manual', 'auto', 'import')`
- `createdBy/updatedBy` are bare UUIDs without FK constraints
- Trigger: `update_order_bookings_updated_at` auto-sets `updated_at` on UPDATE
- `@updatedAt` is also set in Prisma, so both DB trigger and Prisma handle it

### 2.2 Correction (`schema.prisma:3143-3170`)

```prisma
model Correction {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId       String    @map("tenant_id") @db.Uuid
  employeeId     String    @map("employee_id") @db.Uuid
  correctionDate DateTime  @map("correction_date") @db.Date
  correctionType String    @map("correction_type") @db.VarChar(50)
  accountId      String?   @map("account_id") @db.Uuid
  valueMinutes   Int       @map("value_minutes") @db.Integer
  reason         String    @default("") @db.Text
  status         String    @default("pending") @db.VarChar(20)
  approvedBy     String?   @map("approved_by") @db.Uuid
  approvedAt     DateTime? @map("approved_at") @db.Timestamptz(6)
  createdBy      String?   @map("created_by") @db.Uuid
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime  @default(now()) @map("updated_at") @db.Timestamptz(6)

  tenant   Tenant   @relation(...)
  employee Employee @relation(...)
  account  Account? @relation(...)

  @@index([tenantId])
  @@index([employeeId])
  @@index([correctionDate])
  @@index([status])
  @@map("corrections")
}
```

**Notes:**
- No `@updatedAt` annotation (unlike OrderBooking), so Prisma does NOT auto-update `updatedAt`. The Go service does not have a trigger either. This will need manual handling.
- `correctionType` is a free-form string (varchar(50)), no enum constraint
- Status values: "pending", "approved", "rejected" (no DB constraint, just convention)
- `approvedBy` is used for both approvals and rejections (Go sets it to the rejecting user's ID too)
- Correction has relation to Account (optional)

### 2.3 Related Models

**Account (`schema.prisma:397-434`):**
- Has `corrections Correction[]` relation
- Used for targeted account corrections

**DailyValue (`schema.prisma:2831-2878`):**
- Referenced for correction apply/revert context
- Has `hasError`, `errorCodes`, `warnings`, `status`
- No direct FK from Correction to DailyValue

---

## 3. Existing tRPC Patterns

### 3.1 Router Structure Convention

All routers follow this pattern (example from `orders.ts`, `bookings.ts`, `dailyValues.ts`):

```typescript
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// 1. Permission constants
const PERM = permissionIdByKey("category.action")!

// 2. Output schemas (z.object)
const outputSchema = z.object({ ... })

// 3. Input schemas (z.object)
const createInputSchema = z.object({ ... })

// 4. Prisma include objects (for preloads)
const includeObj = { ... } as const

// 5. Helper functions (mappers, data scope builders)
function mapToOutput(record: Record<string, unknown>): OutputType { ... }

// 6. Router definition
export const myRouter = createTRPCRouter({
  list: tenantProcedure
    .use(requirePermission(PERM))
    .input(listInputSchema)
    .output(z.object({ data: z.array(outputSchema) }))
    .query(async ({ ctx, input }) => { ... }),
  // ...
})
```

### 3.2 Procedure Types

From `apps/web/src/server/trpc.ts`:
- `publicProcedure` — no auth
- `protectedProcedure` — requires auth token + user
- `tenantProcedure` — requires auth + tenant ID + tenant access validation

All domain routers use `tenantProcedure`.

### 3.3 Middleware

From `apps/web/src/server/middleware/authorization.ts`:
- `requirePermission(...permissionIds)` — OR logic, checks any permission
- `requireEmployeePermission(getter, ownPerm, allPerm)` — self vs all logic
- `applyDataScope()` — adds DataScope to context for filtering
- `requireSelfOrPermission(getter, permId)` — self-access or permission

### 3.4 Output Patterns

**List endpoints** use two patterns:
1. `{ data: z.array(schema) }` — for simple lists (orders, correction messages)
2. `{ items: z.array(schema), total: z.number() }` — for paginated lists (bookings, dailyValues.listAll)

**Delete endpoints** return either:
- `{ success: z.boolean() }` (bookings, orders)
- Or just `z.object({ success: z.boolean() })` (absences uses success pattern)

**Mutations** use `.mutation()`, queries use `.query()`.

### 3.5 Error Handling

```typescript
throw new TRPCError({
  code: "NOT_FOUND",    // or BAD_REQUEST, FORBIDDEN, CONFLICT, INTERNAL_SERVER_ERROR
  message: "Human-readable message",
})
```

### 3.6 Tenant Scoping

All queries include `tenantId` in the WHERE clause:
```typescript
const tenantId = ctx.tenantId!
const where = { tenantId, ... }
```

Single-record fetches use `findFirst({ where: { id, tenantId } })` for tenant scoping.

### 3.7 Recalculation Pattern

From `bookings.ts` — after mutations:
```typescript
async function triggerRecalc(prisma, tenantId, employeeId, bookingDate) {
  try {
    const service = new RecalcService(prisma)
    await service.triggerRecalc(tenantId, employeeId, bookingDate)
  } catch (error) {
    console.error(`Recalc failed...`, error)
  }
}
```

Best-effort: errors logged but do not fail the parent operation.

---

## 4. Frontend Hooks

### 4.1 Order Bookings Hook (`apps/web/src/hooks/api/use-order-bookings.ts`)

**Current state: Uses old Go API (`useApiQuery`/`useApiMutation`).**

```typescript
useOrderBookings(options)     // GET /order-bookings
useOrderBooking(id)           // GET /order-bookings/{id}
useCreateOrderBooking()       // POST /order-bookings
useUpdateOrderBooking()       // PATCH /order-bookings/{id}
useDeleteOrderBooking()       // DELETE /order-bookings/{id}
```

Invalidation: `['/order-bookings']`, `['/orders']`

**Needs migration to tRPC pattern** (like `use-bookings.ts`).

### 4.2 Correction Assistant Hook (`apps/web/src/hooks/api/use-correction-assistant.ts`)

**Already uses tRPC.**

```typescript
useCorrectionAssistantItems(options)   // correctionAssistant.listItems
useCorrectionMessages(options)         // correctionAssistant.listMessages
useCorrectionMessage(id)               // correctionAssistant.getMessage
useUpdateCorrectionMessage()           // correctionAssistant.updateMessage
```

Pattern: uses `useTRPC()` hook, `useQuery()` with `queryOptions()`, `useMutation()` with `mutationOptions()`.

### 4.3 Bookings Hook (tRPC pattern reference: `apps/web/src/hooks/api/use-bookings.ts`)

```typescript
export function useBookings(options) {
  const trpc = useTRPC()
  return useQuery(trpc.bookings.list.queryOptions({ ... }, { enabled }))
}

export function useCreateBooking() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.bookings.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.bookings.list.queryKey() })
      // ...
    },
  })
}
```

### 4.4 Hooks Index (`apps/web/src/hooks/api/index.ts`)

Currently exports order bookings hooks at line 494-501. Will need updating when hooks are migrated.

---

## 5. Dependencies

### 5.1 Orders Router (ZMI-TICKET-215)

**Location:** `apps/web/src/server/routers/orders.ts`
**Status:** Fully implemented
**Provides:** `ordersRouter` with list, getById, create, update, delete
**Permission:** `orders.manage`

### 5.2 Bookings Router (ZMI-TICKET-232)

**Location:** `apps/web/src/server/routers/bookings.ts`
**Status:** Fully implemented
**Provides:** `bookingsRouter` with list, getById, create, update, delete
**Key patterns used:** Data scope filtering, recalculation triggers, permission checks

### 5.3 Daily Values Router (ZMI-TICKET-236)

**Location:** `apps/web/src/server/routers/dailyValues.ts`
**Status:** Fully implemented
**Provides:** `dailyValuesRouter` with list, listAll, approve

### 5.4 RecalcService (ZMI-TICKET-243)

**Location:** `apps/web/src/server/services/recalc.ts`
**Status:** Fully implemented
**Provides:**
- `triggerRecalc(tenantId, employeeId, date)` — recalculates one day + affected month
- `triggerRecalcRange(tenantId, employeeId, from, to)` — date range
- `triggerRecalcBatch(tenantId, employeeIds, from, to)` — multiple employees
- `triggerRecalcAll(tenantId, from, to)` — all active employees

### 5.5 Daily Calc Service

**Location:** `apps/web/src/server/services/daily-calc.ts`
**Relevant:** Uses `source: "correction"` for auto-complete bookings (line 550, 569)
**Does NOT import or reference Correction model directly.**

### 5.6 Correction Assistant Router (already ported)

**Location:** `apps/web/src/server/routers/correctionAssistant.ts`
**Status:** Fully implemented — handles CorrectionMessages and CorrectionAssistant items
**Does NOT handle Correction CRUD, approve, or reject**

---

## 6. Permission Catalog

From `apps/web/src/server/lib/permission-catalog.ts`:

```
order_bookings.manage  — "Manage order bookings"
order_bookings.view    — "View order bookings"
corrections.manage     — "Manage corrections"
```

Go routes confirm:
- Order Bookings: `order_bookings.view` for List/Get, `order_bookings.manage` for Create/Update/Delete
- Corrections: `corrections.manage` for all endpoints (List, Get, Create, Update, Delete, Approve, Reject)

---

## 7. Test Patterns

### 7.1 Existing Tests

Two test files exist:
- `apps/web/src/server/routers/__tests__/absences.test.ts` (397 lines)
- `apps/web/src/server/routers/__tests__/monthlyValues.test.ts` (507 lines)

### 7.2 Test Convention

Tests use **Vitest** (`describe`, `it`, `expect`).

**Pattern:**
1. Import helper functions from the router (exported for testing)
2. Define test data factories with fixed UUIDs
3. Test pure helper functions (mappers, scope builders, scope checkers)
4. No database tests (unit tests only)

**Data factories:**
```typescript
const TENANT_ID = "t-00000000-0000-0000-0000-000000000001"
const EMPLOYEE_ID = "e-00000000-0000-0000-0000-000000000001"

function makeRecord(overrides = {}) {
  return { id: ABSENCE_ID, tenantId: TENANT_ID, ... , ...overrides }
}

function makeScope(overrides) {
  return { tenantIds: [], departmentIds: [], employeeIds: [], ...overrides }
}
```

**Test categories:**
1. **Mapper tests** — verify field mapping, type conversions (Decimal to number), null handling
2. **Data scope builder tests** — verify WHERE clause generation for all/department/employee scopes
3. **Data scope checker tests** — verify FORBIDDEN thrown when out of scope, passes when in scope
4. **Error mapper tests** — verify service errors mapped to correct tRPC error codes

**Important:** Helper functions must be **exported** from the router file to be testable (e.g., `export function mapToOutput`).

---

## 8. Go Model Definitions

### OrderBooking (`apps/api/internal/model/order_booking.go`)

```go
type OrderBookingSource string
const (
    OrderBookingSourceManual  = "manual"
    OrderBookingSourceAuto    = "auto"
    OrderBookingSourceImport  = "import"
)

type OrderBooking struct {
    ID, TenantID, EmployeeID, OrderID      uuid.UUID
    ActivityID                              *uuid.UUID
    BookingDate                             time.Time
    TimeMinutes                             int
    Description                             string
    Source                                  OrderBookingSource
    CreatedAt, UpdatedAt                    time.Time
    CreatedBy, UpdatedBy                    *uuid.UUID
    // Relations
    Employee *Employee
    Order    *Order
    Activity *Activity
}
```

### Correction (`apps/api/internal/model/correction.go`)

```go
type Correction struct {
    ID             uuid.UUID
    TenantID       uuid.UUID
    EmployeeID     uuid.UUID
    CorrectionDate time.Time
    CorrectionType string
    AccountID      *uuid.UUID
    ValueMinutes   int
    Reason         string
    Status         string      // "pending", "approved", "rejected"
    ApprovedBy     *uuid.UUID
    ApprovedAt     *time.Time
    CreatedBy      *uuid.UUID
    CreatedAt      time.Time
    UpdatedAt      time.Time
}
```

---

## 9. Root Router Registration

**Location:** `apps/web/src/server/root.ts`

Currently registered:
- `correctionAssistant: correctionAssistantRouter` (line 137)
- `orders: ordersRouter` (line 97)
- `bookings: bookingsRouter` (line 101)
- `dailyValues: dailyValuesRouter` (line 139)

**Not yet registered:** `orderBookings`, `corrections`

These need to be added to the root router.

---

## 10. Gaps and Concerns

### 10.1 Ticket mentions "Apply + Revert" for corrections

The Go CorrectionService has `Approve` and `Reject` (not "Apply" and "Revert"). The ticket title references "Correction Workflow (create, apply, revert corrections)." The Go `Approve` method sets status to "approved" and records who approved. The `Reject` method sets status to "rejected". There is no separate "apply" or "revert" action in the Go code that modifies daily values. The ticket likely refers to Approve/Reject as Apply/Revert, or expects new logic to trigger recalculation after correction approval.

### 10.2 No recalculation on correction approve in Go

The Go CorrectionService `Approve` does NOT trigger recalculation of daily values. This contrasts with the bookings router which triggers `RecalcService.triggerRecalc()` after mutations. The ticket mentions "for Recalc after Apply" as a dependency on ZMI-TICKET-243, which suggests recalculation should be triggered on correction approval.

### 10.3 Correction `updatedAt` not auto-managed by Prisma

The Correction model does not have `@updatedAt` in Prisma schema (unlike OrderBooking). Any update mutation must manually set `updatedAt` if desired, or it will stay at the default value.

### 10.4 No data scope filtering in Go correction handler

The Go correction handler does NOT implement data scope filtering (unlike bookings). It only uses tenant scoping. The tRPC implementation may need to add data scope filtering for consistency with other routers, but the Go code does not have it.

### 10.5 Order Booking frontend hook uses Go API

The `use-order-bookings.ts` hook uses `useApiQuery`/`useApiMutation` (Go API). It will need migration to tRPC pattern like `use-bookings.ts`.

### 10.6 No existing correction frontend hooks for CRUD

There is no `use-corrections.ts` hook file. Only `use-correction-assistant.ts` exists (for correction messages and assistant items). New hooks will need to be created for correction CRUD/approve/reject.

### 10.7 Go handler uses generated OpenAPI models

The Go handler uses `models.CreateCorrectionRequest`, `models.CreateOrderBookingRequest`, etc. from generated OpenAPI models. The tRPC implementation will use Zod schemas instead.

### 10.8 OrderBooking list has no pagination in Go

The Go implementation returns all matching order bookings without pagination. Depending on requirements, the tRPC router may want to add pagination (like bookings router) or keep it unpaginated (like orders router).

### 10.9 OrderBooking preloads Employee, Order, Activity in Go

The Go repository preloads these relations on GetByID and List. The tRPC router should include equivalent Prisma includes.

### 10.10 Correction list has no preloads in Go

The Go correction repository does NOT preload any relations (no Employee, Account includes). The tRPC implementation may want to add them for frontend convenience.
