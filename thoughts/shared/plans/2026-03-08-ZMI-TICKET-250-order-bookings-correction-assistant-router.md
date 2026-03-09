# Implementation Plan: ZMI-TICKET-250 — Order Bookings + Corrections Router

## Overview

Port the Go Order Booking and Correction business logic to tRPC routers in the Next.js app. This includes:

1. **`orderBookings` tRPC router** — CRUD (list, getById, create, update, delete)
2. **`corrections` tRPC router** — CRUD + Approve + Reject with recalculation triggers
3. **Frontend hooks migration** — `use-order-bookings.ts` from Go API to tRPC; new `use-corrections.ts`
4. **Unit tests** for both routers

### Key Design Decisions

- **Apply/Revert terminology**: The ticket mentions "Apply" and "Revert", but the Go code has "Approve" and "Reject". We will implement `approve` and `reject` procedures (matching Go semantics) and add recalculation triggers on approve (which the Go code lacks but the ticket requires).
- **No data scope filtering**: The Go correction/order-booking handlers do NOT implement data scope filtering. We will keep this consistent and only use tenant scoping (no `applyDataScope()` middleware). This can be added later if needed.
- **Pagination for order bookings**: The ticket specifies paginated output (`{ items, total }`). The Go code has no pagination, but we will add it to match the bookings router pattern.
- **Correction `updatedAt`**: The Prisma model lacks `@updatedAt`, so we must manually set `updatedAt: new Date()` on every update.
- **Recalculation on approve**: After approving a correction, we trigger `RecalcService.triggerRecalc()` for the correction date. This is new behavior (not in Go) but required by the ticket.

### Dependencies (all completed)

- ZMI-TICKET-249: Prisma schema for `corrections`, `order_bookings`
- ZMI-TICKET-215: Orders router (order relation)
- ZMI-TICKET-232: Bookings router (pattern reference)
- ZMI-TICKET-236: Daily Values router (for correction context)
- ZMI-TICKET-243: RecalcService (for recalc after approve)

---

## Phase 1: Order Bookings tRPC Router

### File: `apps/web/src/server/routers/orderBookings.ts`

**Create new file** following the exact pattern from `bookings.ts` and `orders.ts`.

#### Structure

```
1. Imports (z, TRPCError, createTRPCRouter, tenantProcedure, requirePermission, permissionIdByKey, RecalcService, PrismaClient)
2. Permission constants
3. Output schemas
4. Input schemas
5. Prisma include objects
6. Helper functions (mapToOutput, parseDate) — exported for testing
7. Recalculation helper (triggerRecalc)
8. Router definition
9. Export helpers for testing
```

#### Permission Constants

```typescript
const OB_VIEW = permissionIdByKey("order_bookings.view")!
const OB_MANAGE = permissionIdByKey("order_bookings.manage")!
```

These match Go routes.go:1119-1139:
- List/Get: `order_bookings.view`
- Create/Update/Delete: `order_bookings.manage`

#### Output Schema: `orderBookingOutputSchema`

Fields (from Prisma `OrderBooking` model):
- `id`: z.string().uuid()
- `tenantId`: z.string().uuid()
- `employeeId`: z.string().uuid()
- `orderId`: z.string().uuid()
- `activityId`: z.string().uuid().nullable()
- `bookingDate`: z.date()
- `timeMinutes`: z.number().int()
- `description`: z.string().nullable()
- `source`: z.string()
- `createdAt`: z.date()
- `updatedAt`: z.date()
- `createdBy`: z.string().uuid().nullable()
- `updatedBy`: z.string().uuid().nullable()

Nested relations (optional, included in list/getById):
- `employee`: `{ id, firstName, lastName, personnelNumber, departmentId }` nullable
- `order`: `{ id, code, name }` nullable
- `activity`: `{ id, code, name }` nullable

#### Input Schemas

**listInputSchema:**
```typescript
z.object({
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(50),
  employeeId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  fromDate: z.string().date().optional(),  // YYYY-MM-DD
  toDate: z.string().date().optional(),    // YYYY-MM-DD
}).optional()
```

**createInputSchema:**
```typescript
z.object({
  employeeId: z.string().uuid(),
  orderId: z.string().uuid(),
  activityId: z.string().uuid().optional(),
  bookingDate: z.string().date(),          // YYYY-MM-DD
  timeMinutes: z.number().int().positive("Time in minutes must be positive"),
  description: z.string().optional(),
})
```

**updateInputSchema:**
```typescript
z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid().optional(),
  activityId: z.string().uuid().nullable().optional(),
  bookingDate: z.string().date().optional(),
  timeMinutes: z.number().int().positive().optional(),
  description: z.string().nullable().optional(),
})
```

#### Prisma Include Objects

```typescript
const orderBookingInclude = {
  employee: {
    select: { id: true, firstName: true, lastName: true, personnelNumber: true, departmentId: true },
  },
  order: {
    select: { id: true, code: true, name: true },
  },
  activity: {
    select: { id: true, code: true, name: true },
  },
} as const
```

#### Helper Functions

**`mapToOutput(record)`**: Maps Prisma record to output schema shape. Handles nullable relations (employee, order, activity). Must be **exported** for testing.

#### Procedures

1. **`list`** — `tenantProcedure.use(requirePermission(OB_VIEW))`
   - Build WHERE: `{ tenantId }` + optional filters (employeeId, orderId, date range)
   - Paginated: `findMany` with skip/take + `count`
   - OrderBy: `[{ bookingDate: "desc" }, { createdAt: "desc" }]` (matches Go)
   - Include: `orderBookingInclude`
   - Output: `{ items: OrderBookingOutput[], total: number }`

2. **`getById`** — `tenantProcedure.use(requirePermission(OB_VIEW))`
   - Input: `{ id: z.string().uuid() }`
   - `findFirst({ where: { id, tenantId }, include: orderBookingInclude })`
   - Throw NOT_FOUND if null
   - Output: single `OrderBookingOutput`

3. **`create`** — `tenantProcedure.use(requirePermission(OB_MANAGE))`
   - Validate: orderId required, employeeId required, bookingDate required, timeMinutes > 0 (all via Zod)
   - Verify employee exists in tenant
   - Verify order exists in tenant
   - Verify activity exists in tenant (if provided)
   - Source defaults to "manual"
   - Description trimmed
   - Set createdBy/updatedBy to `ctx.user!.id`
   - Create via `prisma.orderBooking.create()`
   - Re-fetch with includes (matching Go pattern)
   - Output: single `OrderBookingOutput`

4. **`update`** — `tenantProcedure.use(requirePermission(OB_MANAGE))`
   - Fetch existing (tenant-scoped), throw NOT_FOUND
   - Build partial update: only non-undefined fields
   - If timeMinutes provided, must be > 0 (Zod handles this)
   - If description provided, trim it
   - Set updatedBy to `ctx.user!.id`
   - Update, then re-fetch with includes
   - Output: single `OrderBookingOutput`

5. **`delete`** — `tenantProcedure.use(requirePermission(OB_MANAGE))`
   - Fetch existing (tenant-scoped), throw NOT_FOUND
   - `prisma.orderBooking.delete({ where: { id } })`
   - Output: `{ success: true }`

#### Exported Helpers for Testing

```typescript
export { mapToOutput }
```

### Verification — Phase 1

- [ ] File compiles with `npx tsc --noEmit`
- [ ] Router registered in `root.ts`
- [ ] `mapToOutput` correctly maps all fields including nullable relations

---

## Phase 2: Corrections tRPC Router

### File: `apps/web/src/server/routers/corrections.ts`

**Create new file** following the exact pattern from `bookings.ts`.

#### Structure

```
1. Imports (z, TRPCError, createTRPCRouter, tenantProcedure, requirePermission, permissionIdByKey, RecalcService, PrismaClient)
2. Permission constants
3. Output schemas
4. Input schemas
5. Helper functions (mapToOutput) — exported for testing
6. Recalculation helper (triggerRecalc)
7. Router definition
8. Export helpers for testing
```

#### Permission Constants

```typescript
const CORRECTIONS_MANAGE = permissionIdByKey("corrections.manage")!
```

All endpoints use `corrections.manage` (matching Go routes.go:1595-1618).

#### Output Schema: `correctionOutputSchema`

Fields (from Prisma `Correction` model):
- `id`: z.string().uuid()
- `tenantId`: z.string().uuid()
- `employeeId`: z.string().uuid()
- `correctionDate`: z.date()
- `correctionType`: z.string()
- `accountId`: z.string().uuid().nullable()
- `valueMinutes`: z.number().int()
- `reason`: z.string()
- `status`: z.string()
- `approvedBy`: z.string().uuid().nullable()
- `approvedAt`: z.date().nullable()
- `createdBy`: z.string().uuid().nullable()
- `createdAt`: z.date()
- `updatedAt`: z.date()

Nested relations (optional, included in list/getById):
- `employee`: `{ id, firstName, lastName, personnelNumber, departmentId }` nullable
- `account`: `{ id, code, name }` nullable

#### Input Schemas

**listInputSchema:**
```typescript
z.object({
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(50),
  employeeId: z.string().uuid().optional(),
  fromDate: z.string().date().optional(),
  toDate: z.string().date().optional(),
  correctionType: z.string().optional(),
  status: z.string().optional(),
}).optional()
```

**createInputSchema:**
```typescript
z.object({
  employeeId: z.string().uuid(),
  correctionDate: z.string().date(),       // YYYY-MM-DD
  correctionType: z.string().min(1),
  accountId: z.string().uuid().optional(),
  valueMinutes: z.number().int(),
  reason: z.string().optional().default(""),
})
```

**updateInputSchema:**
```typescript
z.object({
  id: z.string().uuid(),
  valueMinutes: z.number().int().optional(),
  reason: z.string().optional(),
})
```

#### Helper Functions

**`mapToOutput(record)`**: Maps Prisma record to output schema shape. Handles nullable fields (accountId, approvedBy, approvedAt, createdBy) and optional relations (employee, account). Must be **exported** for testing.

#### Recalculation Helper

```typescript
async function triggerRecalc(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  correctionDate: Date
): Promise<void> {
  try {
    const service = new RecalcService(prisma)
    await service.triggerRecalc(tenantId, employeeId, correctionDate)
  } catch (error) {
    console.error(
      `Recalc failed for employee ${employeeId} on ${correctionDate.toISOString().split("T")[0]}:`,
      error
    )
  }
}
```

#### Prisma Include Objects

```typescript
const correctionInclude = {
  employee: {
    select: { id: true, firstName: true, lastName: true, personnelNumber: true, departmentId: true },
  },
  account: {
    select: { id: true, code: true, name: true },
  },
} as const
```

Note: The Go correction repository does NOT preload relations, but including employee and account is useful for the frontend and consistent with other tRPC routers.

#### Procedures

1. **`list`** — `tenantProcedure.use(requirePermission(CORRECTIONS_MANAGE))`
   - Build WHERE: `{ tenantId }` + optional filters (employeeId, correctionType, status, date range)
   - Paginated: `findMany` with skip/take + `count`
   - OrderBy: `[{ correctionDate: "desc" }, { createdAt: "desc" }]` (matches Go)
   - Include: `correctionInclude`
   - Output: `{ items: CorrectionOutput[], total: number }`

2. **`getById`** — `tenantProcedure.use(requirePermission(CORRECTIONS_MANAGE))`
   - Input: `{ id: z.string().uuid() }`
   - `findFirst({ where: { id, tenantId }, include: correctionInclude })`
   - Throw NOT_FOUND if null
   - Output: single `CorrectionOutput`

3. **`create`** — `tenantProcedure.use(requirePermission(CORRECTIONS_MANAGE))`
   - Status defaults to "pending"
   - Set createdBy to `ctx.user!.id`
   - Verify employee exists in tenant
   - Verify account exists in tenant (if provided)
   - Create via `prisma.correction.create()`
   - Include relations in create return
   - Output: single `CorrectionOutput`

4. **`update`** — `tenantProcedure.use(requirePermission(CORRECTIONS_MANAGE))`
   - Fetch existing (tenant-scoped), throw NOT_FOUND
   - Check `status === "pending"`, throw BAD_REQUEST ("Can only update pending corrections") if not
   - Build partial update: only non-undefined fields (valueMinutes, reason)
   - Manually set `updatedAt: new Date()` (no `@updatedAt` in Prisma)
   - Update, include relations
   - Output: single `CorrectionOutput`

5. **`delete`** — `tenantProcedure.use(requirePermission(CORRECTIONS_MANAGE))`
   - Fetch existing (tenant-scoped), throw NOT_FOUND
   - Check `status !== "approved"`, throw FORBIDDEN ("Cannot delete approved corrections") if approved
   - `prisma.correction.delete({ where: { id } })`
   - Output: `{ success: true }`

6. **`approve`** — `tenantProcedure.use(requirePermission(CORRECTIONS_MANAGE))`
   - Input: `{ id: z.string().uuid() }`
   - Fetch existing (tenant-scoped), throw NOT_FOUND
   - Check `status === "pending"`, throw BAD_REQUEST ("Correction is not in pending status")
   - Update: `status: "approved"`, `approvedBy: ctx.user!.id`, `approvedAt: new Date()`, `updatedAt: new Date()`
   - **Trigger recalculation** (best effort): `triggerRecalc(ctx.prisma, tenantId, correction.employeeId, correction.correctionDate)`
   - Include relations in response
   - Output: single `CorrectionOutput`

7. **`reject`** — `tenantProcedure.use(requirePermission(CORRECTIONS_MANAGE))`
   - Input: `{ id: z.string().uuid() }`
   - Fetch existing (tenant-scoped), throw NOT_FOUND
   - Check `status === "pending"`, throw BAD_REQUEST ("Correction is not in pending status")
   - Update: `status: "rejected"`, `approvedBy: ctx.user!.id` (Go uses approvedBy for rejector too), `approvedAt: new Date()`, `updatedAt: new Date()`
   - **No recalculation** on reject (rejecting reverts to status quo)
   - Include relations in response
   - Output: single `CorrectionOutput`

#### Exported Helpers for Testing

```typescript
export { mapToOutput }
```

### Verification — Phase 2

- [ ] File compiles with `npx tsc --noEmit`
- [ ] Router registered in `root.ts`
- [ ] All 7 procedures defined with correct permissions
- [ ] Approve triggers recalculation
- [ ] updatedAt manually set on all mutations

---

## Phase 3: Register Routers in Root

### File: `apps/web/src/server/root.ts`

**Modify existing file** to add:

1. Import statements:
   ```typescript
   import { orderBookingsRouter } from "./routers/orderBookings"
   import { correctionsRouter } from "./routers/corrections"
   ```

2. Register in `appRouter`:
   ```typescript
   orderBookings: orderBookingsRouter,
   corrections: correctionsRouter,
   ```

   Place `orderBookings` after `orderAssignments` (alphabetical grouping) and `corrections` after `correctionAssistant`.

### Verification — Phase 3

- [ ] TypeScript compiles without errors
- [ ] Both routers accessible via tRPC client types

---

## Phase 4: Frontend Hooks Migration

### File: `apps/web/src/hooks/api/use-order-bookings.ts`

**Rewrite existing file** to use tRPC (following `use-bookings.ts` pattern).

Replace all `useApiQuery`/`useApiMutation` calls with tRPC equivalents:

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

interface UseOrderBookingsOptions {
  employeeId?: string
  orderId?: string
  fromDate?: string
  toDate?: string
  pageSize?: number
  page?: number
  enabled?: boolean
}

export function useOrderBookings(options: UseOrderBookingsOptions = {}) {
  const { enabled = true, ...params } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.orderBookings.list.queryOptions(
      {
        employeeId: params.employeeId,
        orderId: params.orderId,
        fromDate: params.fromDate,
        toDate: params.toDate,
        pageSize: params.pageSize,
        page: params.page,
      },
      { enabled }
    )
  )
}

export function useOrderBooking(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.orderBookings.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useCreateOrderBooking() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.orderBookings.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.orderBookings.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.orderBookings.getById.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.orders.list.queryKey() })
    },
  })
}

export function useUpdateOrderBooking() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.orderBookings.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.orderBookings.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.orderBookings.getById.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.orders.list.queryKey() })
    },
  })
}

export function useDeleteOrderBooking() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.orderBookings.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.orderBookings.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.orderBookings.getById.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.orders.list.queryKey() })
    },
  })
}
```

**Important**: The old hook used `dateFrom`/`dateTo` params, the new hook uses `fromDate`/`toDate`. Check all consumers for param name compatibility.

### File: `apps/web/src/hooks/api/use-corrections.ts`

**Create new file** for correction CRUD + approve/reject hooks.

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

interface UseCorrectionsOptions {
  employeeId?: string
  fromDate?: string
  toDate?: string
  correctionType?: string
  status?: string
  pageSize?: number
  page?: number
  enabled?: boolean
}

export function useCorrections(options: UseCorrectionsOptions = {}) { ... }
export function useCorrection(id: string, enabled = true) { ... }
export function useCreateCorrection() { ... }
export function useUpdateCorrection() { ... }
export function useDeleteCorrection() { ... }
export function useApproveCorrection() { ... }
export function useRejectCorrection() { ... }
```

All mutation hooks should invalidate:
- `trpc.corrections.list.queryKey()`
- `trpc.corrections.getById.queryKey()`
- `trpc.correctionAssistant.listItems.queryKey()` (approve/reject affect correction assistant view)
- `trpc.dailyValues.list.queryKey()` (approve triggers recalc which changes daily values)

### File: `apps/web/src/hooks/api/index.ts`

**Modify existing file** to add corrections exports:

```typescript
// Corrections
export {
  useCorrections,
  useCorrection,
  useCreateCorrection,
  useUpdateCorrection,
  useDeleteCorrection,
  useApproveCorrection,
  useRejectCorrection,
} from './use-corrections'
```

The existing order bookings exports remain the same (same function names, different implementation).

### Verification — Phase 4

- [ ] TypeScript compiles without errors
- [ ] Old `useApiQuery`/`useApiMutation` imports removed from `use-order-bookings.ts`
- [ ] New `use-corrections.ts` follows same pattern as `use-bookings.ts`
- [ ] All hooks exported from index

---

## Phase 5: Unit Tests

### File: `apps/web/src/server/routers/__tests__/orderBookings.test.ts`

**Create new file** following the pattern from `absences.test.ts`.

#### Test Data Factories

```typescript
const TENANT_ID = "t-00000000-0000-0000-0000-000000000001"
const EMPLOYEE_ID = "e-00000000-0000-0000-0000-000000000001"
const ORDER_ID = "o-00000000-0000-0000-0000-000000000001"
const ACTIVITY_ID = "act-0000000-0000-0000-0000-000000000001"
const OB_ID = "ob-0000000-0000-0000-0000-000000000001"
const USER_ID = "u-00000000-0000-0000-0000-000000000001"

function makeOrderBookingRecord(overrides = {}) {
  return {
    id: OB_ID,
    tenantId: TENANT_ID,
    employeeId: EMPLOYEE_ID,
    orderId: ORDER_ID,
    activityId: null,
    bookingDate: new Date("2026-03-09T00:00:00Z"),
    timeMinutes: 480,
    description: "Test booking",
    source: "manual",
    createdAt: new Date("2026-03-08T12:00:00Z"),
    updatedAt: new Date("2026-03-08T12:00:00Z"),
    createdBy: USER_ID,
    updatedBy: USER_ID,
    ...overrides,
  }
}
```

#### Test Cases

1. **mapToOutput**
   - Maps all core fields correctly
   - Handles nullable activityId (null vs present)
   - Handles nullable description
   - Includes employee when present
   - Includes order when present
   - Includes activity when present
   - Sets relations to null when null in record
   - Does not include relation key when undefined

### File: `apps/web/src/server/routers/__tests__/corrections.test.ts`

**Create new file** following the pattern from `absences.test.ts`.

#### Test Data Factories

```typescript
const TENANT_ID = "t-00000000-0000-0000-0000-000000000001"
const EMPLOYEE_ID = "e-00000000-0000-0000-0000-000000000001"
const ACCOUNT_ID = "acc-0000000-0000-0000-0000-000000000001"
const CORRECTION_ID = "c-00000000-0000-0000-0000-000000000001"
const USER_ID = "u-00000000-0000-0000-0000-000000000001"

function makeCorrectionRecord(overrides = {}) {
  return {
    id: CORRECTION_ID,
    tenantId: TENANT_ID,
    employeeId: EMPLOYEE_ID,
    correctionDate: new Date("2026-03-09T00:00:00Z"),
    correctionType: "time_adjustment",
    accountId: null,
    valueMinutes: 30,
    reason: "Late arrival correction",
    status: "pending",
    approvedBy: null,
    approvedAt: null,
    createdBy: USER_ID,
    createdAt: new Date("2026-03-08T12:00:00Z"),
    updatedAt: new Date("2026-03-08T12:00:00Z"),
    ...overrides,
  }
}
```

#### Test Cases

1. **mapToOutput**
   - Maps all core fields correctly
   - Handles nullable accountId (null vs present)
   - Handles nullable approvedBy and approvedAt
   - Handles nullable createdBy
   - Includes employee when present
   - Includes account when present
   - Sets relations to null when null in record
   - Does not include relation key when undefined
   - Maps approved correction with approvedBy and approvedAt
   - Maps rejected correction with approvedBy (uses same field) and approvedAt

### Verification — Phase 5

- [ ] All tests pass: `cd apps/web && npx vitest run src/server/routers/__tests__/orderBookings.test.ts`
- [ ] All tests pass: `cd apps/web && npx vitest run src/server/routers/__tests__/corrections.test.ts`

---

## Phase 6: Final Verification

### Checklist

- [ ] `npx tsc --noEmit` passes in `apps/web/`
- [ ] All existing tests still pass: `cd apps/web && npx vitest run`
- [ ] New tests pass: `cd apps/web && npx vitest run src/server/routers/__tests__/orderBookings.test.ts src/server/routers/__tests__/corrections.test.ts`
- [ ] `orderBookings` router registered in root.ts with all 5 procedures (list, getById, create, update, delete)
- [ ] `corrections` router registered in root.ts with all 7 procedures (list, getById, create, update, delete, approve, reject)
- [ ] Frontend hooks compile and export correctly
- [ ] No lint errors in new files

---

## File Summary

### Files to Create (5)

| # | File | Description |
|---|------|-------------|
| 1 | `apps/web/src/server/routers/orderBookings.ts` | Order bookings tRPC router (CRUD) |
| 2 | `apps/web/src/server/routers/corrections.ts` | Corrections tRPC router (CRUD + approve + reject) |
| 3 | `apps/web/src/hooks/api/use-corrections.ts` | Corrections frontend hooks (tRPC) |
| 4 | `apps/web/src/server/routers/__tests__/orderBookings.test.ts` | Unit tests for order bookings router |
| 5 | `apps/web/src/server/routers/__tests__/corrections.test.ts` | Unit tests for corrections router |

### Files to Modify (3)

| # | File | Change |
|---|------|--------|
| 1 | `apps/web/src/server/root.ts` | Register orderBookings + corrections routers |
| 2 | `apps/web/src/hooks/api/use-order-bookings.ts` | Rewrite from Go API to tRPC |
| 3 | `apps/web/src/hooks/api/index.ts` | Add corrections exports |

### Go Files Being Replaced (6)

| # | Go File | Lines | Replaced By |
|---|---------|-------|-------------|
| 1 | `apps/api/internal/service/order_booking.go` | 209 | `orderBookings.ts` |
| 2 | `apps/api/internal/handler/order_booking.go` | 219 | `orderBookings.ts` |
| 3 | `apps/api/internal/repository/order_booking.go` | 115 | `orderBookings.ts` (Prisma) |
| 4 | `apps/api/internal/service/correction.go` | 197 | `corrections.ts` |
| 5 | `apps/api/internal/handler/correction.go` | 338 | `corrections.ts` |
| 6 | `apps/api/internal/repository/correction.go` | 100 | `corrections.ts` (Prisma) |

---

## Business Logic Port Summary

### Order Bookings — Direct Port

| Go Behavior | tRPC Implementation |
|-------------|---------------------|
| Validate OrderID, EmployeeID, Date, TimeMinutes | Zod schema validation (required fields, `.positive()`) |
| Default source to "manual" | Prisma default + explicit "manual" in create |
| Trim description | `input.description?.trim()` |
| Re-fetch after create/update (for preloads) | Prisma `include` on create/update return |
| List: order by `booking_date DESC, created_at DESC` | Prisma `orderBy` |
| List: no pagination | **Enhancement**: Add pagination (matches ticket spec) |
| Delete: check exists first | `findFirst` then `delete` |

### Corrections — Port with Enhancements

| Go Behavior | tRPC Implementation |
|-------------|---------------------|
| Create with status "pending" | Same |
| Update: check status === "pending" | Same, throw BAD_REQUEST |
| Delete: reject if status === "approved" | Same, throw FORBIDDEN |
| Approve: set status "approved", approvedBy, approvedAt | Same + **trigger recalculation** (new) |
| Reject: set status "rejected", approvedBy, approvedAt | Same |
| No recalc on approve | **Enhancement**: Trigger `RecalcService.triggerRecalc()` on approve |
| No relation preloads | **Enhancement**: Include employee + account in responses |
| No data scope | Same (tenant-only scoping) |
| updatedAt not auto-managed | Manual `updatedAt: new Date()` on all updates |

---

## Success Criteria

1. All 5 order booking procedures work (list, getById, create, update, delete)
2. All 7 correction procedures work (list, getById, create, update, delete, approve, reject)
3. Approve triggers recalculation for the correction date
4. Reject does NOT trigger recalculation
5. Delete blocks on approved corrections (FORBIDDEN)
6. Update blocks on non-pending corrections (BAD_REQUEST)
7. Frontend hooks use tRPC exclusively (no Go API calls)
8. All unit tests pass
9. TypeScript compiles without errors
